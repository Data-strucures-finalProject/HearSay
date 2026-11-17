// Intercepted browser regression: no live reviews are created or changed.
import { chromium } from '/tmp/hearsay-browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let failArtist = true;
  const artistOffsets = [];
  const review = (type, number) => ({ id: String(number).padStart(24, '0'), type, oid: `${type}-${number}`, rating: 4, text: `${type} review ${number}`, userName: 'Fixture reviewer', createdAt: '2026-11-16T12:00:00Z', media: { title: `Fixture ${type} ${number}` } });
  await page.route('**/api/**', route => {
    const url = new URL(route.request().url());
    let data = { authenticated: false }, status = 200;
    if (url.pathname === '/api/reviews/recent') {
      const type = url.searchParams.get('type');
      const offset = Number(url.searchParams.get('offset'));
      assert.equal(url.searchParams.get('limit'), '5');
      if (type === 'artist') {
        artistOffsets.push(offset);
        if (failArtist) { failArtist = false; status = 500; data = { ok: false, error: 'fixture_failure' }; }
        else data = { ok: true, items: offset === 0 ? [1, 2, 3, 4, 5].map(i => review('artist', i)) : [review('artist', 6)], nextOffset: offset === 0 ? 5 : null };
      } else data = { ok: true, items: [review(type, type === 'song' ? 10 : 11)], nextOffset: null };
    } else if (url.pathname.startsWith('/api/reviews/')) data = { ok: true, review: { ...review('artist', 6), canEdit: false } };
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://frontend/recent-reviews');
  await page.getByRole('alert').waitFor();
  assert.match(await page.getByRole('alert').innerText(), /Failed to load artist reviews/);
  await page.getByRole('heading', { name: 'Songs (1)', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Albums (1)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load More Artists', exact: true }).click();
  await page.getByRole('heading', { name: 'Artists (5)', exact: true }).waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  await page.getByRole('button', { name: 'Load More Artists', exact: true }).click();
  await page.getByRole('heading', { name: 'Artists (6)', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Load More Artists', exact: true }).count(), 0);
  assert.deepEqual(artistOffsets, [0, 0, 5]);
  assert.equal(await page.getByText('artist review 1', { exact: true }).count(), 1);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.getByText('artist review 6', { exact: true }).click();
  await page.waitForURL('**/review/000000000000000000000006');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, artistPagination: artistOffsets, errorRecovery: true, independentSongAlbumFeeds: true, mobileOverflow: false, detailNavigation: true }));
} finally {
  await browser.close();
}
