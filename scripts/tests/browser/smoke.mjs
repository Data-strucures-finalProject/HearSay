// Copy to the matching backend container; requires Playwright in /tmp/hearsay-browser
// and Alpine Chromium. This harness does not create or edit live user records.
import { chromium } from '/tmp/hearsay-browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exerciseRatingLayout } from './rating-layout.mjs';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const failures = [];
page.on('pageerror', e => failures.push(e.message));
const results = [];
try {
  for (const path of ['/', '/auth', '/recent-reviews', '/random', '/profile', '/my-reviews', '/search?q=radiohead']) {
    const response = await page.goto('http://frontend' + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1800);
    assert.equal(response.status(), 200);
    if (path === '/profile' || path === '/my-reviews') assert.equal(new URL(page.url()).pathname, '/auth');
    results.push({ path, status: response.status(), landedPath: new URL(page.url()).pathname, mainCount: await page.locator('main').count(), bodyCharacters: (await page.locator('body').innerText()).length, uncaughtErrors: [...failures] });
  }
  await page.goto('http://frontend/auth');
  let authRequestUrl;
  await page.route('**/auth/local/login', async route => {
    authRequestUrl = route.request().url();
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'invalid_credentials' }) });
  });
  await page.locator('input[type=email]').fill('audit@example.invalid');
  await page.locator('input[type=password]').fill('example-password');
  await page.locator('form button[type=submit]').click();
  await page.waitForTimeout(250);
  assert.equal(authRequestUrl, 'http://frontend/api/auth/local/login');
  assert.ok((await page.locator('body').innerText()).includes('Invalid email or password'));
  results.push({ check: 'local login target (intercepted; no database write)', authRequestUrl, validationErrorShown: (await page.locator('body').innerText()).includes('Invalid email or password') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://frontend/random');
  await page.getByRole('button', { name: 'Toggle menu' }).click();
  results.push({ check: 'mobile menu', expandedMenuCount: await page.locator('#mobile-menu').count(), horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });
  await page.screenshot({ path: '/tmp/hearsay-audit-mobile.png', fullPage: true });
  // A fixture lets the browser verify ReviewPage without editing real reviews.
  await page.route('**/api/reviews/000000000000000000000001', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, review: { id: '000000000000000000000001', type: 'song', oid: 'audit-track', rating: 4, text: 'Original review', userName: 'Audit User', canEdit: true, media: { title: 'Audit Song', route: '/song/audit-track', album: { name: 'Audit Album', route: '/album/audit-album' }, artists: [{ name: 'Audit Artist', route: '/artist/audit-artist' }] } } }) }));
  await page.route('**/api/reviews/upsert', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, review: { _id: '000000000000000000000001', item: { type: 'song', oid: 'audit-track' }, user: { oid: 'audit-user' }, rating: 4, text: 'Updated review' } }) }));
  await page.goto('http://frontend/review/000000000000000000000001');
  await page.waitForTimeout(300);
  results.push({ check: 'review fixture initial', editButtons: await page.getByRole('button', { name: /Edit/i }).count() });
  await page.getByRole('button', { name: /Edit/i }).click();
  await page.locator('textarea').fill('Updated review');
  await page.getByRole('button', { name: /^Save/ }).click();
  await page.waitForTimeout(200);
  results.push({ check: 'review fixture after save', editButtons: await page.getByRole('button', { name: /Edit/i }).count(), retainsMediaTitle: await page.getByRole('heading', { name: /audit song/i }).count() === 1, displaysUpdatedReview: (await page.locator('body').innerText()).includes('Updated review') });
  assert.equal(await page.getByRole('button', { name: /Edit/i }).count(), 1);
  assert.equal(await page.getByRole('heading', { name: /audit song/i }).count(), 1);
  await page.getByRole('button', { name: /Edit/i }).click();
  await page.locator('textarea').fill('Updated twice');
  await page.getByRole('button', { name: /^Save/ }).click();
  await page.waitForTimeout(200);
  assert.equal(await page.getByRole('button', { name: /Edit/i }).count(), 1);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [name, target] of [['Audit Song', '/song/audit-track'], ['Audit Album', '/album/audit-album'], ['Audit Artist', '/artist/audit-artist']]) {
    await page.goto('http://frontend/review/000000000000000000000001');
    const link = page.getByRole('link', { name, exact: true });
    await link.waitFor();
    assert.equal(await link.getAttribute('href'), target);
    await link.click();
    await page.waitForURL('http://frontend' + target);
  }
  results.push({ check: 'review links to song, album and artist', navigationPassed: true });
  await page.route('**/api/reviews/my?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, review: null }) }));
  await page.route('**/api/spotify/album/audit-album', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: { id: 'audit-album', name: 'Audit Album', artists: [{ name: 'Audit Artist' }], images: [], tracks: { items: [{ id: 'audit-track', name: 'Audit Track', duration_ms: 1000, track_number: 1 }] } } }) }));
  const submissions = [];
  await page.route('**/api/reviews/upsert', route => {
    const payload = route.request().postDataJSON();
    submissions.push(payload);
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, review: { rating: payload.rating, trackRatings: payload.trackRatings } }) });
  });
  await page.goto('http://frontend/album/audit-album');
  await page.getByRole('link', { name: 'Audit Track' }).waitFor();
  await page.getByRole('button', { name: 'Rate 4 stars', exact: true }).last().press('Enter');
  await page.getByRole('button', { name: 'Submit Ratings', exact: true }).click();
  await page.waitForTimeout(300);
  assert.deepEqual(submissions.find(payload => payload.type === 'album').trackRatings, { 'audit-track': 4 });
  results.push({ check: 'album track-rating request', songReviewSubmitted: submissions.some(payload => payload.type === 'song'), albumTrackRatingsForwarded: true });
  const authBusResult = await page.evaluate(async code => {
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    const bus = await import(url);
    let calls = 0;
    const unsubscribe = bus.subscribeToAuthChange(() => { calls++; });
    bus.emitAuthChange({ authenticated: true });
    unsubscribe();
    bus.emitAuthChange({ authenticated: false });
    URL.revokeObjectURL(url);
    return calls;
  }, await readFile('src/utils/authBus.js', 'utf8'));
  assert.equal(authBusResult, 1);
  let signedIn = false;
  await page.route('**/api/me', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(signedIn ? { authenticated: true, user: { email: 'audit@example.invalid' } } : { authenticated: false }) }));
  await page.route('**/auth/local/login', route => {
    signedIn = true;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, user: { email: 'audit@example.invalid' } }) });
  });
  await page.goto('http://frontend/auth');
  await page.locator('input[type=email]').fill('audit@example.invalid');
  await page.locator('input[type=password]').fill('example-password');
  await page.locator('form button[type=submit]').click();
  await page.getByRole('link', { name: 'audit@example.invalid', exact: true }).first().waitFor();
  results.push({ check: 'auth refresh', subscriberCallsBeforeUnsubscribe: authBusResult, headerUpdatedWithoutRefocus: true });
  await page.route('**/api/spotify/search?*', route => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'spotify_request_failed' }) }));
  await page.goto('http://frontend/search?q=fixture-failure');
  await page.getByRole('alert').waitFor();
  await page.route('**/api/reviews/recent?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'fixture_failure' }) }));
  await page.goto('http://frontend/recent-reviews');
  await page.getByRole('alert').first().waitFor();
  assert.equal(await page.getByRole('alert').count(), 3);
  results.push({ check: 'visible fetch failures', searchAlert: true, recentReviewAlerts: 3 });
  assert.deepEqual(failures, []);
  const layoutContext = await browser.newContext();
  try {
    const layouts = await exerciseRatingLayout(await layoutContext.newPage(), 'http://frontend');
    results.push({ check: 'rating and track-list layout', combinations: layouts.length, noHorizontalScroll: true, halfStars: true, keyboard: true, finalTrackReachable: true });
  } finally { await layoutContext.close(); }
  console.log(JSON.stringify({ results, uncaughtErrors: failures }, null, 2));
} finally {
  await browser.close();
}
