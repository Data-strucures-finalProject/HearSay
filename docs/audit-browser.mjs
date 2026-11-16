// Copy to the matching backend container; requires Playwright in /tmp/hearsay-browser
// and Alpine Chromium. This harness does not create or edit live user records.
import { chromium } from '/tmp/hearsay-browser/node_modules/playwright/index.mjs';

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
  results.push({ check: 'local login target (intercepted; no database write)', authRequestUrl, validationErrorShown: (await page.locator('body').innerText()).includes('Invalid email or password') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('http://frontend/random');
  await page.getByRole('button', { name: 'Toggle menu' }).click();
  results.push({ check: 'mobile menu', expandedMenuCount: await page.locator('#mobile-menu').count(), horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth) });
  await page.screenshot({ path: '/tmp/hearsay-audit-mobile.png', fullPage: true });
  // A fixture lets the browser verify ReviewPage without editing real reviews.
  await page.route('**/api/reviews/000000000000000000000001', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, review: { id: '000000000000000000000001', type: 'song', oid: 'audit-track', rating: 4, text: 'Original review', userName: 'Audit User', canEdit: true, media: { title: 'Audit Song', route: '/song/audit-track' } } }) }));
  await page.route('**/api/reviews/upsert', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, review: { _id: '000000000000000000000001', item: { type: 'song', oid: 'audit-track' }, user: { oid: 'audit-user' }, rating: 4, text: 'Updated review' } }) }));
  await page.goto('http://frontend/review/000000000000000000000001');
  await page.waitForTimeout(300);
  results.push({ check: 'review fixture initial', editButtons: await page.getByRole('button', { name: /Edit/i }).count() });
  await page.getByRole('button', { name: /Edit/i }).click();
  await page.locator('textarea').fill('Updated review');
  await page.getByRole('button', { name: /^Save/ }).click();
  await page.waitForTimeout(200);
  results.push({ check: 'review fixture after save', editButtons: await page.getByRole('button', { name: /Edit/i }).count(), retainsMediaTitle: (await page.locator('body').innerText()).includes('Audit Song'), displaysUpdatedReview: (await page.locator('body').innerText()).includes('Updated review') });
  console.log(JSON.stringify({ results, uncaughtErrors: failures }, null, 2));
} finally {
  await browser.close();
}
