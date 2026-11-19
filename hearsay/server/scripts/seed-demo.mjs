import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { BSON, ObjectId } from 'mongodb';
import { connectMongo, closeMongo } from '../dbAPI.js';

const directory = process.env.SEED_WORK_DIR;
if (!directory || !path.isAbsolute(directory)) throw new Error('Set SEED_WORK_DIR to an absolute private working directory.');
const chart = JSON.parse(await fs.readFile(new URL('./seed/billboard-200-2026-11-14.json', import.meta.url), 'utf8'));
const mode = process.argv[2] || '--prepare';
const catalogPath = path.join(directory, 'catalog.json');
const preserveEmail = process.env.SEED_PRESERVE_EMAIL;
const origin = 'http://127.0.0.1:5186';
let token;

async function spotify(endpoint) {
  if (!token) {
    const result = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SPOTIFY_CLIENT_ID || process.env.VITE_SPOTIFY_CLIENT_ID, client_secret: process.env.SPOTIFY_CLIENT_SECRET || process.env.VITE_SPOTIFY_CLIENT_SECRET }) });
    if (!result.ok) throw new Error(`Spotify authentication failed: ${result.status}`);
    token = (await result.json()).access_token;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = await fetch(endpoint.startsWith('https://api.spotify.com/') ? endpoint : `https://api.spotify.com/v1${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
    if (result.status === 429) {
      const seconds = Math.max(1, Number(result.headers.get('retry-after')) || 5);
      console.log(`Spotify rate limit: waiting ${seconds}s`);
      await delay(seconds * 1000); continue;
    }
    if (result.status >= 500 && attempt < 5) { await delay(1000 * (attempt + 1)); continue; }
    if (!result.ok) throw new Error(`Spotify ${endpoint.split('?')[0]}: ${result.status}`);
    return result.json();
  }
  throw new Error('Spotify retry limit reached');
}
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\(ep\)/g, '').replace(/[^a-z0-9]/g, '');

async function prepare() {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  let catalog;
  try { catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8')); assert.equal(catalog.chart.chartDate, chart.chartDate); }
  catch (error) { if (error.code !== 'ENOENT') throw error; catalog = { chart, albums: [], tracks: [], artists: [], selected: [] }; }
  catalog.chart = chart;
  for (const entry of chart.albums) {
    const previous = catalog.selected.find(a => a.rank === entry.rank);
    if (previous && (!entry.spotifyAlbumId || previous.spotifyAlbumId === entry.spotifyAlbumId)) continue;
    if (previous) { catalog.albums = catalog.albums.filter(a => a.id !== previous.spotifyAlbumId); catalog.selected = catalog.selected.filter(a => a.rank !== entry.rank); }
    const title = (entry.searchTitle || entry.title).replace(/\s*\(EP\)$/i, '');
    const q = entry.artist === 'Soundtrack' ? title : `album:${title} artist:${entry.artist}`;
    const found = await spotify(`/search?${new URLSearchParams({ q, type: 'album', limit: '20', market: 'US' })}`);
    const matches = found.albums?.items || [];
    const selected = entry.spotifyAlbumId ? { id: entry.spotifyAlbumId } : matches.find(a => normalize(a.name) === normalize(title) && (entry.artist === 'Soundtrack' || a.artists.some(artist => normalize(artist.name) === normalize(entry.artist)))) ||
      (entry.artist === 'Soundtrack' ? matches.find(a => normalize(a.name).includes('nightmarebeforechristmas') && /soundtrack/i.test(a.name)) : undefined);
    if (!selected) throw new Error(`Unresolved album ${entry.rank}: ${entry.title}; candidates: ${matches.map(a => `${a.name} / ${a.artists.map(x => x.name).join(',')}`).join('; ')}`);
    const album = await spotify(`/albums/${selected.id}`);
    let next = album.tracks.next;
    while (next) { const page = await spotify(next); album.tracks.items.push(...page.items); next = page.next; }
    album.tracks.next = null;
    assert.equal(album.tracks.items.length, album.total_tracks, `Incomplete track list: ${album.name}`);
    catalog.albums.push(album); catalog.selected.push({ ...entry, spotifyAlbumId: album.id, spotifyName: album.name, tracks: album.total_tracks });
    console.log(`Resolved ${entry.rank}/25: ${album.name} (${album.total_tracks} tracks)`);
    await fs.writeFile(catalogPath, JSON.stringify(catalog), { mode: 0o600 });
  }
  const trackIds = [...new Set(catalog.albums.flatMap(a => a.tracks.items.map(t => t.id)))];
  catalog.tracks = [];
  for (let i = 0; i < trackIds.length; i += 50) {
    const data = await spotify(`/tracks?ids=${trackIds.slice(i, i + 50).join(',')}&market=US`);
    assert.ok(data.tracks?.every(Boolean), 'Spotify returned unavailable tracks');
    catalog.tracks.push(...data.tracks);
  }
  assert.equal(catalog.tracks.length, trackIds.length);
  const artistIds = [...new Set([...catalog.albums.flatMap(a => a.artists), ...catalog.tracks.flatMap(t => t.artists)].map(a => a.id))];
  catalog.artists = catalog.artists.filter(a => artistIds.includes(a.id));
  await fs.writeFile(catalogPath, JSON.stringify(catalog), { mode: 0o600 });
  for (const id of artistIds) {
    if (catalog.artists.some(a => a.id === id)) continue;
    catalog.artists.push(await spotify(`/artists/${id}`));
    if (catalog.artists.length % 10 === 0) { console.log(`Resolved ${catalog.artists.length}/${artistIds.length} artists`); await fs.writeFile(catalogPath, JSON.stringify(catalog), { mode: 0o600 }); }
  }
  await fs.writeFile(catalogPath, JSON.stringify(catalog), { mode: 0o600 });
  console.log(JSON.stringify({ prepared: true, chartDate: chart.chartDate, albums: catalog.albums.length, tracks: catalog.tracks.length, artists: catalog.artists.length }));
}

async function api(session, endpoint, body) {
  const result = await fetch(origin + endpoint, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(session.cookie ? { Cookie: session.cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const cookie = result.headers.get('set-cookie');
  if (cookie) session.cookie = cookie.split(';')[0];
  const data = await result.json();
  if (!result.ok || data.ok === false) throw new Error(`Seed API ${endpoint}: ${result.status} ${data.error || ''}`);
  return data;
}

async function backupDatabase(database) {
  assert.equal(database.databaseName, 'hearsay');
  const backup = { database: database.databaseName, createdAt: new Date(), collections: {}, views: [] };
  for (const item of await database.listCollections().toArray()) {
    if (item.type === 'view') { backup.views.push(item); continue; }
    if (item.type !== 'collection' || item.name.startsWith('system.')) continue;
    backup.collections[item.name] = { documents: await database.collection(item.name).find().toArray(), indexes: await database.collection(item.name).indexes(), options: item.options };
  }
  const filename = path.join(directory, 'before-reset.ejson');
  await fs.writeFile(filename, BSON.EJSON.stringify(backup, { relaxed: false }), { mode: 0o600, flag: 'wx' });
  const restored = BSON.EJSON.parse(await fs.readFile(filename, 'utf8'), { relaxed: false });
  assert.equal(restored.collections.users.documents.length, backup.collections.users.documents.length);
  console.log(`Backup verified: ${filename}`);
}

async function apply() {
  if (process.env.SEED_CONFIRM_RESET !== 'hearsay') throw new Error('Set SEED_CONFIRM_RESET=hearsay to authorize the destructive reset.');
  if (!preserveEmail) throw new Error('Set SEED_PRESERVE_EMAIL to the account email to retain alongside the admin.');
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  assert.equal(catalog.albums.length, 25); assert.ok(catalog.tracks.length && catalog.artists.length);
  const database = await connectMongo();
  assert.equal(database.databaseName, 'hearsay', 'Refusing a different database');
  const users = database.collection('users');
  const preserved = await users.find({ $or: [{ role: 'admin' }, { email: preserveEmail }, { loginEmails: preserveEmail }] }).toArray();
  assert.equal(preserved.length, 2, 'Expected exactly the admin and Ramsey accounts');
  assert.equal(preserved.filter(u => u.role === 'admin').length, 1);
  assert.ok(preserved.some(u => u.email === preserveEmail || u.loginEmails?.includes(preserveEmail)));
  const keepIds = preserved.map(u => u._id);
  const backupFile = path.join(directory, 'before-reset.ejson');
  const backup = BSON.EJSON.parse(await fs.readFile(backupFile, 'utf8'), { relaxed: false });
  assert.equal(backup.database, database.databaseName);
  const signature = docs => BSON.EJSON.stringify([...docs].sort((a, b) => String(a._id).localeCompare(String(b._id))), { relaxed: false });
  for (const [name, saved] of Object.entries(backup.collections)) assert.equal(signature(await database.collection(name).find().toArray()), signature(saved.documents), `Database changed after backup: ${name}`);

  const logfile = await fs.open(path.join(directory, 'seed-api.log'), 'w', 0o600);
  const server = spawn(process.execPath, ['--import', fileURLToPath(new URL('./seed-cache.mjs', import.meta.url)), 'server/index.js'], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env: { ...process.env, NODE_ENV: 'development', PORT: '5186', SESSION_COOKIE_SECURE: 'false', HEARSAY_SEED_CACHE: catalogPath }, stdio: ['ignore', logfile.fd, logfile.fd] });
  const stopServer = async () => {
    if (server.exitCode !== null || server.signalCode !== null) return;
    await new Promise(resolve => { server.once('exit', resolve); server.kill('SIGTERM'); });
  };
  let resetStarted = false;
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) { try { if ((await fetch(origin + '/api/health')).ok) { ready = true; break; } } catch { /* Wait for the isolated seed server. */ } await delay(250); }
    assert.ok(ready, 'Seed API failed to start');
    resetStarted = true;
    for (const name of ['reviews', 'songs', 'albums', 'artists']) await database.collection(name).deleteMany({});
    await users.deleteMany({ _id: { $nin: keepIds } });
    await users.updateMany({ _id: { $in: keepIds } }, { $set: { reviewIds: [] }, $unset: { reviews: '' } });
    await database.collection(process.env.SESSIONS_COLLECTION || 'expressSessions').deleteMany({});
    console.log('Reset complete; preserved both account documents and credentials.');

    const seed = crypto.randomBytes(4).readUInt32BE(); let state = seed;
    const random = () => { state = (Math.imul(1664525, state) + 1013904223) >>> 0; return state / 4294967296; };
    const integer = max => Math.floor(random() * max);
    const accounts = [];
    for (const [i, name] of ['Avery', 'Jordan', 'Casey', 'Morgan', 'Riley'].entries()) {
      const account = { email: `${name.toLowerCase()}.demo@hearsay.invalid`, password: `Demo-${crypto.randomBytes(12).toString('base64url')}!`, firstname: name, lastname: 'Demo', cookie: '' };
      const signup = await api(account, '/api/auth/local/signup', { email: account.email, password: account.password });
      account.id = signup.user.oid;
      await api(account, '/api/profile/update', { firstname: name, lastname: 'Demo' });
      accounts.push(account);
      console.log(`Created demo account ${i + 1}/5: ${account.email}`);
    }
    await fs.writeFile(path.join(directory, 'demo-credentials.json'), JSON.stringify(accounts.map(({ email, password }) => ({ email, password })), null, 2), { mode: 0o600 });

    const plan = [];
    for (const [type, items] of [['album', catalog.albums], ['song', catalog.tracks], ['artist', catalog.artists]]) for (const item of items) {
      const reviewers = accounts.map((account, index) => ({ account, index, key: random() })).sort((a, b) => a.key - b.key).slice(0, 1 + integer(5));
      for (const { index } of reviewers) plan.push({ type, oid: item.id, name: item.name, accountIndex: index, rating: (1 + integer(10)) / 2 });
    }
    const phrases = {
      high: ['The pacing and production make this an easy replay.', 'The strongest moments reward a close listen, especially the small details.', 'A memorable listen with confident performances and a distinctive atmosphere.'],
      mid: ['There are some strong ideas here, although the consistency varies.', 'I like the mood and a few standout moments; some sections could be tighter.', 'An interesting listen that works better in parts than as a whole.'],
      low: ['I appreciate the ambition, but the execution did not connect with me.', 'The production has interesting touches, though I wanted a stronger sense of direction.', 'Not a personal favourite; the pacing made it hard for me to stay engaged.'],
    };
    for (const [i, item] of plan.entries()) {
      const account = accounts[item.accountIndex];
      const pool = item.rating >= 4 ? phrases.high : item.rating >= 2.5 ? phrases.mid : phrases.low;
      const body = { type: item.type, oid: item.oid, rating: item.rating, text: `${item.name}: ${pool[integer(pool.length)]} ${['The melodies stood out on this pass.', 'I would revisit it in a different mood.', 'The arrangements gave me plenty to think about.', 'My favourite aspect was the overall sound palette.', 'I noticed more detail on a second listen.'][integer(5)]}` };
      if (item.type === 'album') {
        const album = catalog.albums.find(a => a.id === item.oid);
        const ids = new Set(album.tracks.items.map(t => t.id));
        body.trackRatings = plan.filter(p => p.type === 'song' && p.accountIndex === item.accountIndex && ids.has(p.oid)).map(p => ({ trackId: p.oid, rating: p.rating }));
      }
      const result = await api(account, '/api/reviews/upsert', body);
      assert.ok(result.review?._id, 'Review API did not return an ID');
      item.reviewId = String(result.review._id);
      if ((i + 1) % 100 === 0) console.log(`Created ${i + 1}/${plan.length} reviews`);
    }

    // Replies are review documents that point at their parent review/comment.
    let comments = 0;
    for (const item of plan) {
      if (random() > 0.3) continue;
      const authors = accounts.filter((_, index) => index !== item.accountIndex).sort(() => random() - 0.5).slice(0, 1 + integer(3));
      let parent = item.reviewId;
      for (const author of authors) {
        const text = ['I can see your point about the pacing, although I enjoyed the quieter sections.', 'That detail stood out to me too. I came away with a slightly different rating.', 'Interesting perspective. Your review made me want to give it another listen.', 'I agree about the production; the small touches were the highlight for me.'][integer(4)];
        const reply = await api(author, `/api/discussions/${parent}/replies`, { text, clientRequestId: crypto.randomUUID() });
        if (random() < 0.5) parent = reply.entry.id;
        comments++;
      }
    }
    await normalizeLinks(database, catalog);
    for (const original of preserved) {
      const after = await users.findOne({ _id: original._id });
      for (const key of Object.keys(original).filter(key => !['reviewIds', 'reviews'].includes(key))) assert.equal(BSON.EJSON.stringify(after[key]), BSON.EJSON.stringify(original[key]), `Preserved account changed: ${key}`);
    }
    await fs.writeFile(path.join(directory, 'seed-report.json'), JSON.stringify({ chartDate: chart.chartDate, source: chart.source, seed, plannedReviews: plan.length, comments, accounts: accounts.map(({ id, email }) => ({ id, email })), albums: catalog.selected }, null, 2), { mode: 0o600 });
    await verify(database, catalog);
    console.log(JSON.stringify({ seeded: true, reviews: plan.length, comments, accounts: 7, albums: catalog.albums.length, songs: catalog.tracks.length, artists: catalog.artists.length }));
  } catch (error) {
    await stopServer();
    if (resetStarted) {
      for (const [name, saved] of Object.entries(backup.collections)) {
        await database.collection(name).deleteMany({});
        if (saved.documents.length) await database.collection(name).insertMany(saved.documents, { bypassDocumentValidation: true });
      }
      console.log('Seed failed; restored original application records from the verified backup.');
    }
    throw error;
  } finally { await stopServer(); await logfile.close(); }
}

async function normalizeLinks(database, catalog) {
  const now = new Date().toISOString();
  const artists = new Map((await database.collection('artists').find().toArray()).map(a => [a.spotifyArtistId, a]));
  // Include all credited artists, even those who are not the primary album artist.
  for (const artist of catalog.artists) if (!artists.has(artist.id)) {
    const doc = { _id: new ObjectId(), spotifyArtistId: artist.id, name: artist.name, image: artist.images?.[0]?.url || '', followers: artist.followers?.total || 0, popularity: artist.popularity || 0, spotifyUrl: artist.external_urls?.spotify || '', genres: artist.genres || [], likes: '0', dislikes: '0', rating: '0', reviews: [], albums: [], songs: [], createdAt: now, updatedAt: now };
    await database.collection('artists').insertOne(doc); artists.set(artist.id, doc);
  }
  const albums = new Map((await database.collection('albums').find().toArray()).map(a => [a.spotifyAlbumId, a]));
  const songs = new Map((await database.collection('songs').find().toArray()).map(s => [s.spotifyTrackID, s]));
  for (const album of catalog.albums) {
    const doc = albums.get(album.id); assert.ok(doc, `Album missing after API write: ${album.id}`);
    const artist = artists.get(album.artists[0].id);
    const links = album.tracks.items.map(track => { const song = songs.get(track.id); assert.ok(song, `Missing album track: ${track.id}`); return { name: song.title, oid: String(song._id) }; });
    await database.collection('albums').updateOne({ _id: doc._id }, { $set: { name: album.name, artist: { name: artist.name, oid: String(artist._id) }, songs: links, genre: artist.genres || [] } });
  }
  for (const track of catalog.tracks) {
    const doc = songs.get(track.id); assert.ok(doc, `Missing song: ${track.id}`);
    // Keep the selected chart album as the song's canonical parent when reissued elsewhere.
    const albumRaw = catalog.albums.find(a => a.tracks.items.some(t => t.id === track.id));
    const album = albums.get(albumRaw.id), artist = artists.get(track.artists[0].id);
    await database.collection('songs').updateOne({ _id: doc._id }, { $set: { title: track.name, artist: { name: artist.name, oid: String(artist._id), spotifyArtistId: artist.spotifyArtistId }, album: { name: album.name, oid: String(album._id), spotifyAlbumId: album.spotifyAlbumId }, genres: artist.genres || [], image: albumRaw.images?.[0]?.url || '', date: albumRaw.release_date || '' } });
  }
  for (const raw of catalog.artists) {
    const doc = artists.get(raw.id);
    const albumLinks = catalog.albums.filter(a => a.artists.some(x => x.id === raw.id) || a.tracks.items.some(t => t.artists.some(x => x.id === raw.id))).map(a => ({ name: a.name, oid: String(albums.get(a.id)._id) }));
    const songLinks = catalog.tracks.filter(t => t.artists.some(a => a.id === raw.id)).map(t => ({ name: t.name, oid: String(songs.get(t.id)._id) }));
    await database.collection('artists').updateOne({ _id: doc._id }, { $set: { albums: albumLinks, songs: songLinks, oid: String(doc._id) } });
  }
}

async function verify(database, catalog) {
  assert.ok(preserveEmail, 'SEED_PRESERVE_EMAIL is required for verification');
  const users = await database.collection('users').find().toArray();
  const reviews = await database.collection('reviews').find().toArray();
  assert.equal(users.length, 7); assert.ok(users.some(u => u.email === preserveEmail));
  const demo = users.filter(u => u.email.endsWith('@hearsay.invalid'));
  assert.equal(demo.length, 5); assert.ok(demo.every(u => u.role === 'user' && u.accounts.length === 1 && u.accounts[0].kind === 'Local' && !u.googleProfile));
  const userMap = new Map(users.map(u => [String(u._id), u]));
  let commentCount = 0;
  for (const review of reviews) {
    assert.equal(review.type, 'review'); assert.ok(userMap.has(review.user.oid)); assert.ok(demo.some(u => String(u._id) === review.user.oid));
    assert.ok(Number.isInteger(review.rating) && review.rating >= (review.item.type === 'review' ? 0 : 1) && review.rating <= 10);
    assert.ok(userMap.get(review.user.oid).reviewIds.some(id => String(id) === String(review._id)));
    for (const ref of review.comments) {
      const comment = reviews.find(r => String(r._id) === ref.oid);
      assert.ok(comment && comment.item.type === 'review' && comment.item.oid === String(review._id));
    }
    if (review.item.type === 'review') {
      const parent = reviews.find(r => String(r._id) === review.item.oid);
      const root = reviews.find(r => String(r._id) === review.threadRoot);
      assert.ok(parent?.comments.some(c => c.oid === String(review._id)) && root && root.item.type !== 'review');
      assert.equal(review.depth, (parent.depth || 0) + 1); commentCount++;
    }
  }
  const mediaMap = new Map();
  for (const [type, collection, key, expected] of [['album', 'albums', 'spotifyAlbumId', catalog.albums.length], ['song', 'songs', 'spotifyTrackID', catalog.tracks.length], ['artist', 'artists', 'spotifyArtistId', catalog.artists.length]]) {
    const media = await database.collection(collection).find().toArray(); assert.equal(media.length, expected, `${collection} count`);
    assert.equal(new Set(media.map(m => m[key])).size, expected, `${collection} duplicates`);
    mediaMap.set(type, media);
    for (const item of media) {
      const owned = reviews.filter(r => r.item.type === type && r.item.oid === item[key]);
      assert.ok(owned.length >= 1 && owned.length <= 5, `${type}/${item[key]} review coverage`);
      assert.equal(new Set(owned.map(r => r.user.oid)).size, owned.length);
      assert.equal(item.reviews.length, owned.length);
      for (const ref of item.reviews) assert.ok(owned.some(r => String(r._id) === ref.review_oid && r.user.oid === ref.user_oid));
    }
  }
  const albumIds = new Set(mediaMap.get('album').map(a => String(a._id))), songIds = new Set(mediaMap.get('song').map(s => String(s._id))), artistIds = new Set(mediaMap.get('artist').map(a => String(a._id)));
  for (const album of mediaMap.get('album')) { assert.ok(artistIds.has(album.artist.oid)); assert.ok(album.songs.every(s => songIds.has(s.oid))); }
  for (const song of mediaMap.get('song')) { assert.ok(artistIds.has(song.artist.oid)); assert.ok(albumIds.has(song.album.oid)); }
  for (const artist of mediaMap.get('artist')) { assert.ok(artist.albums.every(a => albumIds.has(a.oid))); assert.ok(artist.songs.every(s => songIds.has(s.oid))); }
  for (const user of users) for (const id of user.reviewIds || []) assert.ok(reviews.some(r => String(r._id) === String(id) && r.user.oid === String(user._id)));
  const distribution = Object.fromEntries([1,2,3,4,5].map(count => [count, [...mediaMap.entries()].flatMap(([type, media]) => media.map(item => reviews.filter(r => r.item.type === type && r.item.oid === (item.spotifyAlbumId || item.spotifyTrackID || item.spotifyArtistId)).length)).filter(n => n === count).length]));
  const report = { verified: true, users: users.length, albums: mediaMap.get('album').length, songs: mediaMap.get('song').length, artists: mediaMap.get('artist').length, reviews: reviews.length - commentCount, comments: commentCount, reviewDocuments: reviews.length, mediaByReviewCount: distribution };
  await fs.writeFile(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
}

try {
  if (mode === '--prepare') await prepare();
  else if (mode === '--backup') await backupDatabase(await connectMongo());
  else if (mode === '--apply') await apply();
  else if (mode === '--verify') await verify(await connectMongo(), JSON.parse(await fs.readFile(catalogPath, 'utf8')));
  else throw new Error('Use --prepare, --backup, --apply or --verify');
} finally { await closeMongo(); }
