// Real MongoDB view/API checks in a disposable database, plus optional browser checks.
// The fixture web server runs only during this test; its test sessions are not app code.
import assert from 'node:assert/strict';
import express from 'express';
import { ObjectId, Int32 } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

process.env.MONGO_DB_NAME = `hearsay_insights_${Date.now()}`;
const { connectMongo, closeMongo } = await import('../server/dbAPI.js');
const { installViews, mountInsightRoutes } = await import('../server/insights.js');
const { mountAdminRoutes } = await import('../server/admin.js');
const { VIEWS } = await import('../server/analyticsViews.js');
const { INSIGHTS, insightPath } = await import('../shared/insights.js');
const database = await connectMongo();
let server, browser;
const user = new ObjectId(), idle = new ObjectId(), admin = new ObjectId(), missing = new ObjectId();
const results = [];
try {
  await database.collection('users').insertMany([
    { _id: user, firstname: 'Active', lastname: 'Reviewer', role: 'user', email: 'never-public@example.invalid', passwordHash: 'never-public-hash' },
    { _id: idle, firstname: 'Quiet', lastname: 'Member' },
    { _id: admin, firstname: 'Test', lastname: 'Admin', role: 'admin' },
  ]);
  await database.collection('artists').insertMany([
    { spotifyArtistId: 'artist-a', name: 'Artist A', followers: 100, popularity: 80, genres: ['rock', 'pop'], albums: ['a', 'b'], songs: ['s'] },
    { spotifyArtistId: 'artist-b', name: 'Artist B', followers: 200, popularity: 60, genres: ['rock'], albums: [], songs: [] },
  ]);
  await database.collection('albums').insertMany(Array.from({ length: 25 }, (_, i) => ({ spotifyAlbumId: `album-${i}`, name: `Album ${String(i).padStart(2, '0')}`, artist: { name: 'Artist A', oid: 'artist-a' }, releaseDate: '2026-01-01' })));
  await database.collection('songs').insertMany([
    { spotifyTrackID: 'song-a', title: 'Literal .* song', artist: { name: 'Artist A' } },
    { spotifyTrackID: 'song-a', title: 'Literal .* song', artist: { name: 'Artist A' } },
  ]);
  const review = (album, score, owner = user, text = 'A thoughtful opinion') => ({ _id: new ObjectId(), type: 'review', item: { type: 'album', oid: `album-${album}` }, user: { oid: owner.toString() }, rating: new Int32(score), text, createdAt: new Date().toISOString() });
  await database.collection('reviews').insertMany([
    review(0, 10), review(0, 6), review(1, 10), review(2, 10), review(3, 0, user, 'Text only'), review(4, 4, missing),
  ]);
  await installViews(database);
  await installViews(database); // idempotent collMod, no collection deletion
  assert.equal((await database.listCollections({ type: 'view' }).toArray()).length, 10);
  const views = await Promise.all(VIEWS.map(view => database.collection(view.name).find().toArray()));
  assert.equal(views[0][0].artist, 'Artist A');
  assert.ok(views[0].some(row => row.reviewer === 'Unknown User'));
  assert.equal(views[0].find(row => row.spotifyAlbumId === 'album-3').ratingStars, null);
  assert.deepEqual(views[1].map(row => row.spotifyAlbumId).sort(), ['album-1', 'album-2']);
  assert.equal(views[2].length, 1);
  assert.equal(views[2][0].starsAboveAverage, 1);
  assert.equal(views[2][0].spotifyAlbumId, 'album-0');
  assert.ok(views[3].some(row => row.relationshipStatus === 'user_without_review'));
  assert.ok(views[3].some(row => row.relationshipStatus === 'review_without_user'));
  assert.equal(views[4].filter(row => row.mediaType === 'song').length, 1);
  assert.equal(views[5].find(row => row.spotifyAlbumId === 'album-0').averageStars, 4);
  assert.equal(views[5].find(row => row.spotifyAlbumId === 'album-3').ratingCount, 0);
  assert.equal(views[5].find(row => row.spotifyAlbumId === 'album-3').averageStars, null);
  assert.equal(views[6].find(row => row.userId === user.toString()).reviewsWritten, 5);
  assert.equal(views[6].find(row => row.userId === idle.toString()).averageStarsGiven, null);
  assert.equal(views[7].find(row => row.genre === 'rock').artistsInGenre, 2);
  assert.equal(views[7].find(row => row.genre === 'rock').totalFollowers, 300);
  assert.equal(views[8].length, 20);
  assert.ok(!views[8].some(row => row.spotifyAlbumId === 'album-3'));
  assert.equal(views[9][0].artist, 'Artist B');
  results.push('All ten real MongoDB views: joins, ties, correlation, orphans, deduplication, rating units, text-only reviews, genres and rankings');

  const app = express();
  app.use((req, _res, next) => {
    const role = req.headers['x-test-role'] || (/insights_test_role=admin/.test(req.headers.cookie || '') ? 'admin' : null);
    req.session = role ? { user: { oid: (role === 'admin' ? admin : user).toString() } } : {};
    next();
  });
  app.get('/api/me', (req, res) => res.json({ authenticated: !!req.session.user, user: req.session.user ? { ...req.session.user, role: 'admin', name: 'Test Admin' } : null }));
  mountAdminRoutes(app, database);
  mountInsightRoutes(app, database);
  app.use(express.static(fileURLToPath(new URL('../dist', import.meta.url))));
  app.get('/{*path}', (req, res) => res.sendFile(fileURLToPath(new URL('../dist/index.html', import.meta.url))));
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = async (url, role) => {
    const response = await fetch(origin + url, { headers: role ? { 'x-test-role': role } : {} });
    return { status: response.status, body: await response.json() };
  };
  for (const spec of INSIGHTS) {
    const response = await get(insightPath(spec.id), spec.id === 4 ? 'admin' : undefined);
    assert.equal(response.status, 200, spec.title);
    assert.ok(response.body.items.length > 0, spec.title);
    assert.ok(!JSON.stringify(response.body).includes('never-public'));
  }
  assert.equal((await get('/api/insights/4')).status, 404);
  assert.equal((await get('/api/admin/insights/4')).status, 401);
  assert.equal((await get('/api/admin/insights/4', 'user')).status, 403);
  assert.equal((await get('/api/insights/11')).status, 404);
  for (const query of ['limit=101', 'offset=-1', 'sort=passwordHash', 'q[x]=a', 'direction=bad', 'status=matched', 'mediaType=artist', `q=${'a'.repeat(101)}`]) assert.equal((await get(`/api/insights/5?${query}`)).status, 400, query);
  const filtered = await get('/api/insights/5?q=Literal%20.*&mediaType=song');
  assert.equal(filtered.body.total, 1); // regex characters must be literal
  assert.equal((await get('/api/insights/5?q=does-not-exist')).body.total, 0);
  const first = await get('/api/insights/5?limit=20');
  const second = await get('/api/insights/5?limit=20&offset=20');
  assert.equal(first.body.items.length, 20);
  assert.equal(second.body.items.length, 6);
  assert.equal(second.body.nextOffset, null);
  assert.equal(new Set([...first.body.items, ...second.body.items].map(row => `${row.mediaType}/${row.spotifyId}`)).size, 26);
  assert.equal((await get('/api/insights/6?limit=1')).body.chart.length, 4); // independent of table page; null averages excluded
  assert.equal((await get('/api/admin/insights/4?status=review_without_user', 'admin')).body.total, 1);
  await database.collection('users').updateOne({ _id: admin }, { $set: { role: 'user' } });
  assert.equal((await get('/api/admin/insights/4', 'admin')).status, 403);
  await database.collection('users').updateOne({ _id: admin }, { $set: { role: 'admin' } });
  results.push('API: all views, admin boundaries and revocation, literal search, media/status filters, invalid inputs, empty results, pagination and independent chart data');

  if (process.argv.includes('--browser')) {
    execFileSync('npm', ['run', 'build'], { cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: 'inherit' });
    console.log('Database/API checks passed. Starting browser checks.');
    const { chromium } = await import('/tmp/hearsay-browser/node_modules/playwright/index.mjs');
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const spec of INSIGHTS.filter(item => item.id !== 4)) {
      console.log(`Browser: ${spec.title}`);
      await page.goto(`${origin}/${spec.group}?view=${spec.id}`);
      await page.getByRole('table').waitFor();
      await page.getByRole('heading', { name: spec.title, exact: true }).waitFor();
      assert.ok(await page.locator('tbody tr').count() > 0, spec.title);
      if (spec.chart) await page.getByRole('figure').waitFor();
    }
    await page.goto(`${origin}/discover?view=5`);
    await page.getByRole('table').waitFor();
    await page.getByLabel('Media type', { exact: true }).selectOption('song');
    await page.getByText('1–1 of 1 matching records', { exact: true }).waitFor();
    await page.getByLabel('Search these records').fill('not-found');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.getByText(/No matching records/).waitFor();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByText('21–26 of 26 matching records', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Previous', exact: true }).click();
    await page.getByText('1–20 of 26 matching records', { exact: true }).waitFor();
    assert.ok((await page.locator('tbody a').first().getAttribute('href')).startsWith('/album/'));
    await page.route('**/api/insights/10?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }));
    await page.goto(`${origin}/discover?view=10`);
    await page.getByRole('alert').waitFor();
    await page.unroute('**/api/insights/10?**');
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('table').waitFor();
    await context.addCookies([{ name: 'insights_test_role', value: 'admin', url: origin }]);
    await page.goto(`${origin}/admin`);
    await page.getByRole('heading', { name: 'Users and review integrity' }).waitFor();
    await page.getByRole('table').waitFor();
    await page.getByLabel('Relationship', { exact: true }).selectOption('review_without_user');
    await page.getByText('1–1 of 1 matching records', { exact: true }).waitFor();
    for (const width of [390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`${origin}/discover?view=10`);
      await page.getByRole('table').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).filter({ visible: true }).click();
      if (width < 1280) {
        await page.getByRole('button', { name: 'Toggle menu' }).click();
        await page.getByRole('navigation', { name: 'Mobile primary' }).getByRole('link', { name: 'Community', exact: true }).click();
        await page.getByRole('heading', { name: 'Community', exact: true }).waitFor();
      }
    }
    const screenshot = process.env.INSIGHTS_SCREENSHOT || '/tmp/hearsay-insights.png';
    await page.screenshot({ path: screenshot, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
    results.push('Browser: all nine public tables plus admin, charts, links, filters, empty/error/retry states, pagination, themes and navigation at 390/768/1024/1440px');
  }
  // The installer must never overwrite a real collection with a view.
  await database.collection(VIEWS[9].name).drop();
  // MongoDB reads of a nonexistent collection return empty results. A collMod guard
  // still prevents view installation from overwriting a real collection.
  await database.createCollection(VIEWS[9].name);
  await assert.rejects(() => installViews(database), /exists as a collection/);
  results.push('Installer refuses to replace a real collection');
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await database.dropDatabase();
  await closeMongo();
}
