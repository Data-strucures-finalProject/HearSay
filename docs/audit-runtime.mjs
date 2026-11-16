// Run from /app in the matching backend container; see the developer audit in Drive.
// Writes only to a uniquely named temporary database and drops that database on exit.
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { ObjectId } from 'mongodb';

const auditDbName = `hearsay_audit_${Date.now()}`;
process.env.MONGO_DB_NAME = auditDbName;
const { connectMongo, closeMongo } = await import('./server/dbAPI.js');
const { applySchemas } = await import('./server/scripts/apply-schemas.mjs');
const database = await connectMongo();
const port = 5184;
const origin = `http://127.0.0.1:${port}`;
let server;
let cookie = '';
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
try {
  await applySchemas();
  server = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'development', SESSION_COOKIE_SECURE: 'false' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Consume logs without displaying OAuth tokens, session IDs, or review content.
  server.stdout.on('data', () => {});
  server.stderr.on('data', () => {});
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { if ((await request('/api/health')).status === 200) { ready = true; break; } } catch {}
    await delay(250);
  }
  if (!ready) throw new Error('Temporary audit server did not start');
  record('health', await request('/api/health'));
  record('database ping', { status: (await request('/api/test')).status });
  record('guest profile denied', await request('/api/profile', { authenticated: false }));
  record('invalid signup email', await request('/api/auth/local/signup', { method: 'POST', body: { email: 'invalid', password: 'example-password' } }));
  const email = 'reviewer@example.invalid';
  const signup = await request('/api/auth/local/signup', { method: 'POST', body: { email, password: 'example-password' } });
  record('local signup', { status: signup.status, created: signup.data?.created });
  record('session authenticated', { authenticated: (await request('/api/me')).data?.authenticated });
  const userId = signup.data?.user?.oid;
  if (!userId) throw new Error('Signup did not establish a test user');
  record('profile update', { status: (await request('/api/profile/update', { method: 'POST', body: { firstname: 'Audit', lastname: 'Reviewer' } })).status });
  const artistId = new ObjectId();
  const albumId = new ObjectId();
  const songId = new ObjectId();
  const now = new Date().toISOString();
  await database.collection('artists').insertOne({ _id: artistId, name: 'Audit Artist', spotifyArtistId: 'audit-artist', createdAt: now, updatedAt: now, dislikes: '0', likes: '0', followers: 0, genres: ['audit'], image: '', popularity: 0, rating: '0', spotifyUrl: '', reviews: [], albums: [], songs: [] });
  await database.collection('albums').insertOne({ _id: albumId, name: 'Audit Album', spotifyAlbumId: 'audit-album', artist: { name: 'Audit Artist', oid: String(artistId) }, dislikes: '0', likes: '0', genre: [], image: '', releaseDate: '2026', reviews: [], songs: [] });
  await database.collection('songs').insertOne({ _id: songId, title: 'Audit Song', spotifyTrackID: 'audit-track', artist: { name: 'Audit Artist', oid: String(artistId), spotifyArtistId: 'audit-artist' }, album: { name: 'Audit Album', oid: String(albumId), spotifyAlbumId: 'audit-album' }, date: '2026', dislikes: '0', likes: '0', genres: ['audit'], image: '', rating: '0', reviews: [] });
  const reviewBody = { type: 'song', oid: 'audit-track', rating: 4, text: 'Audit review' };
  const created = await request('/api/reviews/upsert', { method: 'POST', body: reviewBody });
  record('review create', { status: created.status, rating: created.data?.review?.rating });
  record('review read', { status: (await request('/api/reviews/my?type=song&oid=audit-track')).status });
  record('review update', { status: (await request('/api/reviews/upsert', { method: 'POST', body: { ...reviewBody, rating: 4.5 } })).status });
  record('review list', { count: (await request('/api/reviews/my/list')).data?.items?.length });
  record('guest mutation denied', await request('/api/reviews/upsert', { method: 'POST', body: reviewBody, authenticated: false }));
  record('long review rejected', await request('/api/reviews/upsert', { method: 'POST', body: { ...reviewBody, text: 'word '.repeat(1001) } }));
  record('invalid media type rejected', await request('/api/reviews/upsert', { method: 'POST', body: { ...reviewBody, type: 'invalid' } }));
  record('debug route listing', { status: (await request('/api/debug/routes')).status });
  record('artist top songs endpoint', await request('/api/reviews/top-songs-for-artist?artistId=audit-artist'));
  const deletion = await request('/api/reviews/my?type=song&oid=audit-track', { method: 'DELETE' });
  const remaining = await database.collection('reviews').countDocuments({ 'user.oid': userId });
  const user = await database.collection('users').findOne({ _id: new ObjectId(userId) });
  const song = await database.collection('songs').findOne({ _id: songId });
  record('review deletion and references', { status: deletion.status, reportedDeleted: deletion.data?.deleted, reviewsRemaining: remaining, staleUserReferences: user.reviewIds?.length || 0, staleSongReferences: song.reviews?.length || 0 });
  await request('/api/logout', { method: 'POST' });
  record('logout', { authenticated: (await request('/api/me')).data?.authenticated });
  const login = await request('/api/auth/local/login', { method: 'POST', body: { email, password: 'example-password' } });
  record('local login', { status: login.status, authenticated: (await request('/api/me')).data?.authenticated });
  await database.collection('users').insertOne({ email: 'google-only@example.invalid', firstname: 'Audit', lastname: 'Google', accounts: [{ kind: 'Google', uid: 'audit-google' }] });
  const link = await request('/api/auth/local/signup', { method: 'POST', authenticated: false, body: { email: 'google-only@example.invalid', password: 'example-password' } });
  record('unauthenticated password linking', { status: link.status, linked: link.data?.linked, loggedInAsExistingAccount: !!link.data?.user?.oid });
  console.log(JSON.stringify({ auditDbName, results }, null, 2));
} finally {
  if (server) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
  await database.dropDatabase();
  await closeMongo();
  console.log('Temporary audit database removed.');
}
