// Run through scripts/tests/run.cmd, which stages the suite in /app/tests.
// Writes only to a uniquely named temporary database and drops that database on exit.
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { ObjectId } from 'mongodb';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const auditDbName = `hearsay_audit_${Date.now()}`;
process.env.MONGO_DB_NAME = auditDbName;
const { connectMongo, closeMongo } = await import('../server/dbAPI.js');
const { applySchemas } = await import('../server/scripts/apply-schemas.mjs');
const database = await connectMongo();
const port = 5184;
const origin = `http://127.0.0.1:${port}`;
let server;
let cookie = '';
let serverLogs = '';
const results = [];
function record(check, details) { results.push({ check, ...details }); }
async function request(path, { method = 'GET', body, authenticated = true } = {}) {
  const response = await fetch(origin + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authenticated && cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  if (authenticated && setCookie) cookie = setCookie.split(';')[0];
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}
async function prepareGoogleAuth(intent = 'signin') {
  const code_verifier = 'audit-private-verifier';
  const start = await request('/api/auth/google/start', { method: 'POST', body: {
    intent, code_challenge: createHash('sha256').update(code_verifier).digest('base64url'),
  } });
  assert.equal(start.status, 200);
  return { state: start.data.state, code_verifier, redirect_uri: 'http://example.invalid/auth/callback' };
}
async function exchangeGoogle(code, intent = 'signin') {
  return request('/api/auth/google/exchange', { method: 'POST', body: { ...(await prepareGoogleAuth(intent)), code } });
}
try {
  await applySchemas();
  server = spawn(process.execPath, ['--import', './tests/fixtures/providers.mjs', 'server/index.js'], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'false', SPOTIFY_CLIENT_ID: 'audit-client', SPOTIFY_CLIENT_SECRET: 'audit-secret', GOOGLE_CLIENT_ID: 'audit-client', GOOGLE_CLIENT_SECRET: 'audit-secret' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Consume logs without displaying OAuth tokens, session IDs, or review content.
  server.stdout.on('data', data => { serverLogs += data; });
  server.stderr.on('data', data => { serverLogs += data; });
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await request('/api/health')).status === 200) { ready = true; break; } } catch {}
    await delay(250);
  }
  if (!ready) throw new Error('Temporary audit server did not start');
  const { initializeDefaultAdmin } = await import('../server/admin.js');
  const bootstrapFixtures = database.collection('adminBootstrapFixtures');
  const bootstrapDatabase = { collection: () => bootstrapFixtures };
  await bootstrapFixtures.insertOne({ email: 'occupied@example.invalid', role: 'user' });
  assert.equal((await initializeDefaultAdmin(bootstrapDatabase, { DEFAULT_ADMIN_EMAIL: 'occupied@example.invalid', DEFAULT_ADMIN_PASSWORD: 'fixture-password' })).conflict, true);
  assert.equal((await bootstrapFixtures.findOne({ email: 'occupied@example.invalid' })).role, 'user');
  const customConfig = { DEFAULT_ADMIN_EMAIL: ' CUSTOM-ADMIN@example.invalid ', DEFAULT_ADMIN_PASSWORD: 'custom-admin-password', BCRYPT_ROUNDS: '4' };
  await Promise.all([initializeDefaultAdmin(bootstrapDatabase, customConfig), initializeDefaultAdmin(bootstrapDatabase, customConfig)]);
  assert.equal(await bootstrapFixtures.countDocuments({ isDefaultAdmin: true }), 1);
  const customAdmin = await bootstrapFixtures.findOne({ isDefaultAdmin: true });
  assert.equal(customAdmin.email, 'custom-admin@example.invalid');
  assert.equal(await (await import('bcryptjs')).default.compare(customConfig.DEFAULT_ADMIN_PASSWORD, customAdmin.passwordHash), true);
  await bootstrapFixtures.drop();
  const adminBefore = await database.collection('users').findOne({ isDefaultAdmin: true });
  assert.equal(adminBefore.role, 'admin');
  const { mountAccountData } = await import('../server/accountData.js');
  let accountGuard;
  mountAccountData({ use: handler => { accountGuard = handler; }, get() {}, delete() {} }, database, { sessionName: 'fixture', sessionsCollection: 'expressSessions' });
  const guardRequest = () => ({ session: { user: { oid: String(adminBefore._id) } }, path: '/api/me', method: 'GET' });
  const firstResponse = new EventEmitter();
  await accountGuard(guardRequest(), firstResponse, () => {});
  const disconnectedResponse = Object.assign(new EventEmitter(), { destroyed: true });
  let disconnectedHandled = false;
  const queued = accountGuard(guardRequest(), disconnectedResponse, () => { disconnectedHandled = true; });
  disconnectedResponse.emit('close');
  firstResponse.emit('finish');
  await queued;
  assert.equal(disconnectedHandled, false, 'do not run a queued request that has already disconnected');
  const followingResponse = new EventEmitter();
  let followingHandled = false;
  await Promise.race([
    accountGuard(guardRequest(), followingResponse, () => { followingHandled = true; }),
    delay(2500).then(() => { if (!followingHandled) throw new Error('Disconnected request blocked the account queue'); }),
  ]);
  followingResponse.emit('finish');
  assert.equal(followingHandled, true);
  record('disconnected account request', { skipped: true, queueReleased: true });
  assert.equal((await request('/api/admin/overview', { authenticated: false })).status, 401);
  const adminLogin = await request('/api/auth/local/login', { method: 'POST', body: { email: adminBefore.email, password: process.env.DEFAULT_ADMIN_PASSWORD || 'password' } });
  assert.equal(adminLogin.status, 200); assert.equal(adminLogin.data.user.role, 'admin');
  const adminCookie = cookie;
  assert.equal((await request('/api/admin/overview')).status, 200);
  await initializeDefaultAdmin(database, { DEFAULT_ADMIN_EMAIL: 'different-admin@example.invalid', DEFAULT_ADMIN_PASSWORD: 'changed-bootstrap-password' });
  const adminAfter = await database.collection('users').findOne({ _id: adminBefore._id });
  assert.equal(adminAfter.email, adminBefore.email);
  assert.equal(adminAfter.passwordHash === adminBefore.passwordHash, true, 'bootstrap must never reset credentials');
  assert.equal(await database.collection('users').countDocuments({ isDefaultAdmin: true }), 1);
  // The persisted role, not a cached session role, controls authorization.
  await database.collection('users').updateOne({ _id: adminBefore._id }, { $set: { role: 'user' } });
  assert.equal((await request('/api/admin/overview')).status, 403);
  await database.collection('users').updateOne({ _id: adminBefore._id }, { $set: { role: 'admin' } });
  assert.equal((await request('/api/admin/overview')).status, 200);
  cookie = '';
  assert.equal((await request('/api/session')).status, 200);
  const anonymousCookie = cookie;
  record('health', await request('/api/health'));
  record('database ping', { status: (await request('/api/test')).status });
  record('guest profile denied', await request('/api/profile', { authenticated: false }));
  record('invalid signup email', await request('/api/auth/local/signup', { method: 'POST', body: { email: 'invalid', password: 'example-password' } }));
  const email = 'reviewer@example.invalid';
  const signup = await request('/api/auth/local/signup', { method: 'POST', body: { email, password: 'example-password', role: 'admin', isDefaultAdmin: true } });
  assert.equal(signup.status, 200);
  assert.equal(signup.data.user.role, 'user');
  assert.equal((await request('/api/admin/overview')).status, 403);
  assert.equal((await request('/api/profile/update', { method: 'POST', body: { role: 'admin' } })).status, 200);
  assert.equal((await database.collection('users').findOne({ email })).role, 'user');
  assert.equal((await request('/api/admin/overview')).status, 403);
  assert.notEqual(cookie, adminCookie);
  record('admin bootstrap and role boundaries', { oneDefaultAdmin: true, noCredentialReset: true, guestDenied: true, regularUserDenied: true, clientRoleInjectionIgnored: true, liveRoleRevocation: true, adminOverview: true });
  assert.notEqual(cookie, anonymousCookie, 'signup must rotate the anonymous session');
  record('local signup', { status: signup.status, created: signup.data?.created });
  const usersForSchema = database.collection('users');
  for (const invalid of [{ loginEmails: [123] }, { emailHistory: ['duplicate', 'duplicate'] }, { googleProfile: { email: 'missing-required@example.invalid' } }]) {
    await assert.rejects(usersForSchema.updateOne({ email }, { $set: invalid }), error => error.code === 121);
  }
  await assert.rejects(database.collection('reviews').insertOne({
    comments: [], createdAt: '', updatedAt: '', dislikes: 0, likes: 0, item: { type: 'album', oid: 'schema-fixture' },
    text: '', type: 'review', user: { oid: 'schema-fixture' }, trackRatings: { track: 1.25 },
  }), error => error.code === 121);
  record('schema rejects invalid saved fields', { invalidUserShapesRejected: 3, invalidTrackRatingRejected: true });
  const session = await request('/api/me');
  assert.equal(session.data.authenticated, true);
  record('session authenticated', { authenticated: session.data.authenticated });
  const userId = signup.data?.user?.oid;
  if (!userId) throw new Error('Signup did not establish a test user');
  const updatedProfile = await request('/api/profile/update', { method: 'POST', body: { firstname: 'Audit', lastname: 'Reviewer' } });
  assert.equal(updatedProfile.status, 200);
  assert.equal(updatedProfile.data.user.name, 'Audit Reviewer');
  assert.equal(updatedProfile.data.profile.role, 'user');
  record('profile update', { status: updatedProfile.status, sessionNameUpdated: true });
  const artistId = new ObjectId();
  const albumId = new ObjectId();
  const songId = new ObjectId();
  const now = new Date().toISOString();
  await database.collection('artists').insertOne({ _id: artistId, name: 'Audit Artist', spotifyArtistId: 'audit-artist', createdAt: now, updatedAt: now, dislikes: '0', likes: '0', followers: 0, genres: ['audit'], image: '', popularity: 0, rating: '0', spotifyUrl: '', reviews: [], albums: [], songs: [] });
  await database.collection('albums').insertOne({ _id: albumId, name: 'Audit Album', spotifyAlbumId: 'audit-album', artist: { name: 'Audit Artist', oid: String(artistId) }, dislikes: '0', likes: '0', genre: [], image: '', releaseDate: '2026', reviews: [], songs: [] });
  await database.collection('songs').insertOne({ _id: songId, title: 'Audit Song', spotifyTrackID: 'audit-track', artist: { name: 'Audit Artist', oid: String(artistId), spotifyArtistId: 'audit-artist' }, album: { name: 'Audit Album', oid: String(albumId), spotifyAlbumId: 'audit-album' }, date: '2026', dislikes: '0', likes: '0', genres: ['audit'], image: '', rating: '0', reviews: [] });
  const reviewBody = { type: 'song', oid: 'audit-track', rating: 4, text: 'Audit review' };
  const created = await request('/api/reviews/upsert', { method: 'POST', body: reviewBody });
  assert.equal(created.status, 200);
  assert.equal(created.data.review.rating, 4);
  record('review create', { status: created.status, rating: created.data?.review?.rating });
  record('review read', { status: (await request('/api/reviews/my?type=song&oid=audit-track')).status });
  record('review update', { status: (await request('/api/reviews/upsert', { method: 'POST', body: { ...reviewBody, rating: 4.5 } })).status });
  record('review list', { count: (await request('/api/reviews/my/list')).data?.items?.length });
  record('guest mutation denied', await request('/api/reviews/upsert', { method: 'POST', body: reviewBody, authenticated: false }));
  record('long review rejected', await request('/api/reviews/upsert', { method: 'POST', body: { ...reviewBody, text: 'word '.repeat(1001) } }));
  record('invalid media type rejected', await request('/api/reviews/upsert', { method: 'POST', body: { ...reviewBody, type: 'invalid' } }));
  const routeListing = await request('/api/debug/routes');
  assert.equal(routeListing.status, 200);
  assert.ok(routeListing.data.routes.some(route => route.path === '/api/reviews/upsert'));
  record('debug route listing', { status: routeListing.status });
  record('artist top songs endpoint', await request('/api/reviews/top-songs-for-artist?artistId=audit-artist'));
  const deletion = await request('/api/reviews/my?type=song&oid=audit-track', { method: 'DELETE' });
  const remaining = await database.collection('reviews').countDocuments({ 'user.oid': userId });
  const user = await database.collection('users').findOne({ _id: new ObjectId(userId) });
  const song = await database.collection('songs').findOne({ _id: songId });
  record('review deletion and references', { status: deletion.status, reportedDeleted: deletion.data?.deleted, reviewsRemaining: remaining, staleUserReferences: user.reviewIds?.length || 0, staleSongReferences: song.reviews?.length || 0 });
  assert.equal(deletion.data.deleted, true);
  assert.equal(remaining, 0);
  assert.equal(user.reviewIds.length, 0);
  assert.equal(song.reviews.length, 0);
  assert.equal((await request('/api/reviews/my?type=song&oid=audit-track', { method: 'DELETE' })).data.deleted, false);
  const { CRUD } = await import('../server/dbAPI.js');
  assert.equal((await CRUD.updateById('users', userId, { firstname: 'Updated Audit' })).firstname, 'Updated Audit');
  assert.equal(await CRUD.updateById('users', String(new ObjectId()), { firstname: 'Nobody' }), null);
  const badRatings = [null, [], { 'audit-track': 6 }, { 'audit-track': '4' }, { 'audit-track': 3.2 }];
  for (const trackRatings of badRatings) {
    const invalid = await request('/api/reviews/upsert', { method: 'POST', body: { type: 'album', oid: 'audit-new-album', rating: 4, trackRatings } });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.data.error, 'invalid_track_ratings');
  }
  const album = await request('/api/reviews/upsert', { method: 'POST', body: { type: 'album', oid: 'audit-new-album', rating: 4, trackRatings: { 'audit-new-track': 4.5 } } });
  assert.equal(album.status, 200);
  assert.equal(album.data.review.trackRatings['audit-new-track'], 4.5);
  const cachedAlbum = await database.collection('albums').findOne({ spotifyAlbumId: 'audit-new-album' });
  const newSong = await database.collection('songs').findOne({ spotifyTrackID: 'audit-new-track' });
  assert.ok(newSong);
  assert.ok(cachedAlbum.songs.some(song => song.oid === String(newSong._id)), 'new song must be linked during its first album backfill');
  record('album track ratings and first backfill', { status: album.status, persistedTrackRating: album.data.review.trackRatings['audit-new-track'], songLinked: true, invalidPayloadsRejected: badRatings.length });
  for (const [id, status] of [['upstream-rate-limit', 429], ['upstream-missing', 404]]) {
    const upstream = await request(`/api/spotify/track/${id}`);
    assert.equal(upstream.status, status);
    assert.equal(upstream.data.ok, false);
  }
  const tokenStatus = await request('/api/spotify/debug/token');
  assert.equal(tokenStatus.data.cache.hasToken, true);
  assert.equal('token' in tokenStatus.data.cache, false);
  record('Spotify error propagation and token redaction', { rateLimitStatus: 429, missingStatus: 404, tokenExposed: false });
  await request('/api/logout', { method: 'POST' });
  record('logout', { authenticated: (await request('/api/me')).data?.authenticated });
  const login = await request('/api/auth/local/login', { method: 'POST', body: { email, password: 'example-password' } });
  record('local login', { status: login.status, authenticated: (await request('/api/me')).data?.authenticated });
  assert.equal(login.status, 200);
  await database.collection('users').insertOne({ email: 'google-only@example.invalid', firstname: 'Audit', lastname: 'Google', accounts: [{ kind: 'Google', uid: 'audit-google' }] });
  const link = await request('/api/auth/local/signup', { method: 'POST', authenticated: false, body: { email: 'google-only@example.invalid', password: 'example-password' } });
  assert.equal(link.status, 409);
  assert.equal(link.data.user, undefined);
  assert.equal((await database.collection('users').findOne({ email: 'google-only@example.invalid' })).passwordHash, undefined);
  assert.equal((await request('/api/auth/local/set-password', { method: 'POST', authenticated: false, body: { password: 'example-password' } })).status, 401);
  const localBefore = await database.collection('users').findOne({ _id: new ObjectId(userId) });
  const googleBefore = await database.collection('users').findOne({ email: 'google-only@example.invalid' });
  const collisionFlow = await prepareGoogleAuth('link');
  // Client-supplied intent cannot turn a server-bound link into a sign-in.
  const collision = await request('/api/auth/google/exchange', { method: 'POST', body: { ...collisionFlow, code: 'audit-valid-profile', intent: 'signin' } });
  assert.equal(collision.status, 409);
  assert.equal(collision.data.error, 'google_account_in_use');
  assert.equal((await request('/api/me')).data.user.oid, userId);
  assert.deepEqual(await database.collection('users').findOne({ _id: new ObjectId(userId) }), localBefore);
  assert.deepEqual(await database.collection('users').findOne({ email: 'google-only@example.invalid' }), googleBefore);
  const replay = await request('/api/auth/google/exchange', { method: 'POST', body: { ...collisionFlow, code: 'audit-valid-profile' } });
  assert.equal(replay.status, 400);
  const guestLink = await request('/api/auth/google/start', { method: 'POST', authenticated: false, body: { intent: 'link', code_challenge: createHash('sha256').update('audit-private-verifier').digest('base64url') } });
  assert.equal(guestLink.status, 401);
  const invalidState = await prepareGoogleAuth('link');
  assert.equal((await request('/api/auth/google/exchange', { method: 'POST', body: { ...invalidState, state: 'wrong', code: 'audit-valid-profile' } })).status, 400);
  assert.equal((await request('/api/auth/google/exchange', { method: 'POST', body: { ...invalidState, code_verifier: 'wrong', code: 'audit-valid-profile' } })).status, 400);
  const expired = await prepareGoogleAuth('link');
  const sessionId = (await request('/api/session')).data.id;
  await database.collection(process.env.SESSIONS_COLLECTION || 'expressSessions').updateOne({ _id: sessionId }, { $set: { 'session.googleAuth.expiresAt': 0 } });
  assert.equal((await request('/api/auth/google/exchange', { method: 'POST', body: { ...expired, code: 'audit-valid-profile' } })).status, 400);
  const changedSession = await prepareGoogleAuth('link');
  assert.equal((await request('/api/auth/local/signup', { method: 'POST', body: { email: 'second@example.invalid', password: 'example-password' } })).status, 200);
  const secondId = (await request('/api/me')).data.user.oid;
  assert.equal((await request('/api/auth/google/exchange', { method: 'POST', body: { ...changedSession, code: 'audit-valid-profile' } })).status, 400);
  assert.equal((await request('/api/me')).data.user.oid, secondId);
  await request('/api/auth/local/login', { method: 'POST', body: { email, password: 'example-password' } });
  const emailCollision = await exchangeGoogle('audit-local-email-profile', 'link');
  assert.equal(emailCollision.status, 409);
  assert.equal(emailCollision.data.error, 'google_account_in_use');
  const linked = await exchangeGoogle('audit-unused-profile', 'link');
  assert.equal(linked.status, 200);
  assert.equal(linked.data.linked, true);
  assert.equal(linked.data.user.oid, userId);
  const localAfter = await database.collection('users').findOne({ _id: new ObjectId(userId) });
  assert.equal(localAfter.email, localBefore.email);
  assert.equal(localAfter.passwordHash, localBefore.passwordHash);
  assert.deepEqual(localAfter.reviewIds, localBefore.reviewIds);
  assert.equal(localAfter.accounts.filter(account => account.kind === 'Google').length, 1);
  assert.equal((await exchangeGoogle('audit-unused-profile', 'link')).status, 200);
  assert.equal((await database.collection('users').findOne({ _id: new ObjectId(userId) })).accounts.filter(account => account.kind === 'Google').length, 1);
  const differentGoogle = await exchangeGoogle('audit-other-unused-profile', 'link');
  assert.equal(differentGoogle.status, 409);
  assert.equal(differentGoogle.data.error, 'google_already_linked');
  await request('/api/logout', { method: 'POST' });
  const returningGoogle = await exchangeGoogle('audit-unused-profile');
  assert.equal(returningGoogle.status, 200);
  assert.equal(returningGoogle.data.user.oid, userId);
  assert.equal(returningGoogle.data.user.email, email);
  assert.equal(await database.collection('users').countDocuments({ email: 'unused-google@example.invalid' }), 0);
  const alias = 'unused-google@example.invalid';
  const firstBefore = localBefore.firstname;
  const lastBefore = localBefore.lastname;
  for (let mask = 0; mask < 8; mask++) {
    await database.collection('users').updateOne({ _id: new ObjectId(userId) }, { $set: { email, firstname: firstBefore, lastname: lastBefore } });
    const selection = { firstname: Boolean(mask & 1), lastname: Boolean(mask & 2), email: Boolean(mask & 4) };
    const applied = await request('/api/profile/google-details', { method: 'POST', body: selection });
    assert.equal(applied.status, 200);
    assert.equal(applied.data.profile.firstname, selection.firstname ? 'Unused' : firstBefore);
    assert.equal(applied.data.profile.lastname, selection.lastname ? 'Google' : lastBefore);
    assert.equal(applied.data.profile.email, selection.email ? alias : email);
    assert.deepEqual([...applied.data.profile.loginEmails].sort(), [email, alias].sort());
  }
  for (const address of [email, alias]) {
    const aliasLogin = await request('/api/auth/local/login', { method: 'POST', body: { email: address, password: 'example-password' } });
    assert.equal(aliasLogin.status, 200);
    assert.equal(aliasLogin.data.user.oid, userId);
  }
  assert.equal((await request('/api/auth/local/signup', { method: 'POST', body: { email: alias, password: 'example-password' } })).status, 409);
  assert.equal((await request('/api/profile/google-details', { method: 'POST', authenticated: false, body: { email: true } })).status, 401);
  assert.equal((await request('/api/profile/google-details', { method: 'POST', body: { email: alias } })).status, 400);
  assert.equal((await request('/api/profile/emails', { method: 'DELETE', body: { email: alias } })).data.error, 'primary_email');
  assert.equal((await request('/api/profile/emails/primary', { method: 'POST', body: { email: 'stranger@example.invalid' } })).status, 400);
  assert.equal((await request('/api/profile/emails/primary', { method: 'POST', body: { email } })).status, 200);
  const removedGoogle = await request('/api/profile/emails', { method: 'DELETE', body: { email: alias } });
  assert.equal(removedGoogle.status, 200);
  assert.deepEqual(removedGoogle.data.profile.loginEmails, [email]);
  assert.equal(removedGoogle.data.profile.accounts.some(account => account.kind === 'Google'), false);
  const storedAfterRemoval = await database.collection('users').findOne({ _id: new ObjectId(userId) });
  assert.ok(storedAfterRemoval.emailHistory.includes(alias));
  assert.equal(storedAfterRemoval.passwordHash, localBefore.passwordHash);
  assert.deepEqual(storedAfterRemoval.reviewIds, localBefore.reviewIds);
  assert.equal((await request('/api/auth/local/login', { method: 'POST', body: { email: alias, password: 'example-password' } })).status, 404);
  const { initializeUserEmails } = await import('../server/userEmails.js');
  await initializeUserEmails(database);
  assert.deepEqual((await database.collection('users').findOne({ _id: new ObjectId(userId) })).loginEmails, [email]);
  assert.equal((await exchangeGoogle('audit-unused-profile', 'link')).status, 200);
  assert.equal((await request('/api/profile/emails/primary', { method: 'POST', body: { email: alias } })).status, 200);
  assert.equal((await request('/api/profile/emails', { method: 'DELETE', body: { email } })).status, 200);
  await initializeUserEmails(database);
  assert.deepEqual((await database.collection('users').findOne({ _id: new ObjectId(userId) })).loginEmails, [alias]);
  assert.equal((await request('/api/auth/local/login', { method: 'POST', body: { email, password: 'example-password' } })).status, 404);
  assert.equal((await request('/api/auth/local/login', { method: 'POST', body: { email: alias, password: 'example-password' } })).status, 200);
  assert.equal((await request('/api/auth/local/signup', { method: 'POST', body: { email, password: 'different-password' } })).status, 200);
  record('Google profile choices and email management', { selectionCombinations: 8, bothEmailsLogin: true, aliasUniqueness: true, googleEmailRemovalDisconnectsProvider: true, primaryRemovalPrevented: true, removedAddressesStayRemovedAfterInitialization: true, originalAddressReusableAfterRemoval: true, passwordAndReviewsPreserved: true });
  record('Google linking collision and flow binding', { collisionStatus: collision.status, conflictingUsersUnchanged: true, guestRejected: true, statePkceExpiryReplayAndSessionGuards: true, unusedIdentityLinkedToCurrentUser: true, primaryEmailPasswordAndReviewsPreserved: true, subsequentGoogleSigninUsesSameAccount: true });
  for (const [code, status] of [['audit-missing-profile', 502], ['audit-unverified-profile', 401]]) {
    assert.equal((await exchangeGoogle(code)).status, status);
  }
  const googleLogin = await exchangeGoogle('audit-valid-profile');
  assert.equal(googleLogin.status, 200);
  const passwordLink = await request('/api/auth/local/set-password', { method: 'POST', body: { password: 'example-password' } });
  assert.equal(passwordLink.status, 200);
  assert.ok((await database.collection('users').findOne({ email: 'google-only@example.invalid' })).passwordHash);
  assert.doesNotMatch(serverLogs, /audit-private-(spotify-token|google-token|google-refresh|verifier)/);
  record('account linking and provider guards', { unauthenticatedSignup: link.status, authenticatedPasswordSetup: passwordLink.status, googleProfileGuardsPassed: true, credentialsLogged: false });
  const pendingGoogleUser = await database.collection('users').findOne({ email: 'google-only@example.invalid' });
  await database.collection('users').updateOne({ _id: pendingGoogleUser._id }, { $set: { deletionPending: true } });
  cookie = '';
  assert.equal((await exchangeGoogle('audit-valid-profile')).status, 200);
  assert.equal((await request('/api/profile')).status, 200);
  assert.equal((await request('/api/profile/update', { method: 'POST', body: { firstname: 'Blocked' } })).status, 409);
  await database.collection('users').updateOne({ _id: pendingGoogleUser._id }, { $unset: { deletionPending: '' } });
  for (const path of ['/api/profile/export.csv', '/api/profile/export.pdf']) assert.equal((await request(path, { authenticated: false })).status, 401);
  assert.equal((await request('/api/profile', { method: 'DELETE', body: { confirmation: 'DELETE' }, authenticated: false })).status, 401);
  const disposable = await request('/api/auth/local/signup', { method: 'POST', body: { email: 'delete-me@example.invalid', password: 'delete-fixture-password' } });
  assert.equal(disposable.status, 200);
  const deleteOid = disposable.data.user.oid, firstDeviceCookie = cookie;
  cookie = ''; // A separate browser/device session, not rotation of the first.
  await request('/api/auth/local/login', { method: 'POST', body: { email: 'delete-me@example.invalid', password: 'delete-fixture-password' } });
  const deleteId = new ObjectId(deleteOid), ownedReviews = [];
  const exportText = '=SUM(1,2)\n"Quoted", café Ω Привет\n' + 'wrapping '.repeat(700) + 'END_OF_REVIEW';
  for (const [type, itemOid] of [['song', 'audit-track'], ['album', 'audit-album'], ['artist', 'audit-artist']]) {
    const review = { _id: new ObjectId(), comments: [], createdAt: now, updatedAt: now, dislikes: 0, likes: 0, item: { type, oid: itemOid }, text: exportText, title: 'Private export review', type: 'review', user: { oid: deleteOid }, rating: 9, ...(type === 'album' ? { trackRatings: { 'audit-track': 3.5 } } : {}) };
    await database.collection('reviews').insertOne(review); ownedReviews.push(review._id);
    await database.collection(type === 'song' ? 'songs' : type === 'album' ? 'albums' : 'artists').updateMany({}, { $push: { reviews: { review_oid: String(review._id), user_oid: deleteOid } } });
  }
  await database.collection('users').updateOne({ _id: deleteId }, { $set: { firstname: 'Export Café', lastname: 'Ω Test', reviewIds: ownedReviews, emailHistory: ['delete-me@example.invalid', 'old@example.invalid'] } });
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const otherUsers = digest(await database.collection('users').find({ _id: { $ne: deleteId } }).sort({ _id: 1 }).toArray());
  const otherReviews = digest(await database.collection('reviews').find({ 'user.oid': { $ne: deleteOid } }).sort({ _id: 1 }).toArray());
  const csvResponse = await fetch(origin + '/api/profile/export.csv?userId=' + userId, { headers: { Cookie: cookie } });
  assert.equal(csvResponse.status, 200); assert.match(csvResponse.headers.get('content-type'), /text\/csv/);
  assert.match(csvResponse.headers.get('content-disposition'), /attachment/);
  const csv = await csvResponse.text();
  assert.match(csv, /delete-me@example.invalid/); assert.match(csv, /old@example.invalid/);
  assert.match(csv, /"4.5"/); assert.match(csv, /"3.5"/);
  assert.match(csv, /'\=SUM\(1,2\)\n""Quoted"", café Ω Привет/);
  assert.doesNotMatch(csv, /google-only@example.invalid|passwordHash|delete-fixture-password|\$2[aby]\$/);
  const pdfResponse = await fetch(origin + '/api/profile/export.pdf', { headers: { Cookie: cookie } });
  assert.equal(pdfResponse.status, 200); assert.match(pdfResponse.headers.get('content-type'), /application\/pdf/);
  const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  const pdfText = execFileSync('pdftotext', ['-', '-'], { input: pdfBytes }).toString();
  for (const expected of ['delete-me@example.invalid', 'old@example.invalid', 'café Ω Привет', 'END_OF_REVIEW', 'track rating: 3.5', 'rating: 4.5']) assert.ok(pdfText.includes(expected), `PDF must contain ${expected}`);
  assert.doesNotMatch(pdfText, /google-only@example.invalid|passwordHash|delete-fixture-password/);
  assert.ok((pdfText.match(/Page \d+ of \d+/g) || []).length > 1, 'long reviews must paginate');
  assert.equal((await request('/api/profile', { method: 'DELETE', body: {} })).status, 400);
  assert.ok(await database.collection('users').findOne({ _id: deleteId }));
  // Simulate a retry after an interrupted cleanup; normal writes must be blocked.
  await database.collection('users').updateOne({ _id: deleteId }, { $set: { deletionPending: true } });
  cookie = ''; // Recovery still works after the previous session has expired.
  assert.equal((await request('/api/auth/local/login', { method: 'POST', body: { email: 'delete-me@example.invalid', password: 'delete-fixture-password' } })).status, 200);
  assert.equal((await request('/api/profile')).status, 200);
  assert.equal((await request('/api/profile/update', { method: 'POST', body: { firstname: 'Blocked' } })).status, 409);
  assert.equal((await request('/api/profile', { method: 'DELETE', body: { confirmation: 'DELETE', userId } })).status, 200);
  assert.equal(await database.collection('users').countDocuments({ _id: deleteId }), 0);
  assert.equal(await database.collection('reviews').countDocuments({ 'user.oid': deleteOid }), 0);
  assert.equal(await database.collection('expressSessions').countDocuments({ 'session.user.oid': deleteOid }), 0);
  for (const collection of ['artists', 'albums', 'songs']) assert.equal(await database.collection(collection).countDocuments({ 'reviews.user_oid': deleteOid }), 0);
  assert.equal(digest(await database.collection('users').find({}).sort({ _id: 1 }).toArray()), otherUsers);
  assert.equal(digest(await database.collection('reviews').find({}).sort({ _id: 1 }).toArray()), otherReviews);
  const staleSession = await fetch(origin + '/api/me', { headers: { Cookie: firstDeviceCookie } });
  assert.equal((await staleSession.json()).authenticated, false);
  assert.equal((await request('/api/auth/local/login', { method: 'POST', body: { email: 'delete-me@example.invalid', password: 'delete-fixture-password' } })).status, 404);
  record('account CSV/PDF export and permanent deletion', { guestAccessDenied: true, privateDataIsolated: true, csvQuotedAndFormulaSafe: true, unicodeAndMultipagePdf: true, confirmationRequired: true, interruptedDeletionRetry: true, reviewsAndAllMediaReferencesRemoved: true, allSessionsRemoved: true, otherUsersUnchanged: true });
  const developmentExited = new Promise(resolve => server.once('exit', resolve));
  server.kill('SIGTERM');
  await developmentExited;
  server = spawn(process.execPath, ['--import', './tests/fixtures/providers.mjs', 'server/index.js'], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', SESSION_COOKIE_SECURE: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  let productionReady = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await request('/api/health')).status === 200) { productionReady = true; break; } } catch {}
    await delay(250);
  }
  assert.equal(productionReady, true, 'production audit server must start');
  for (const path of ['/api/debug/routes', '/api/spotify/debug/token', '/api/reviews/debug/find', '/api/reviews/debug/list']) {
    assert.equal((await request(path)).status, 404);
  }
  record('production diagnostic guards', { endpointsHidden: 4 });
  console.log(JSON.stringify({ auditDbName, results }, null, 2));
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await exited;
  }
  await database.dropDatabase();
  await closeMongo();
  console.log('Temporary audit database removed.');
}
