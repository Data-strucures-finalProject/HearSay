// Intercepted sessions only; no real admin login or database writes.
import { chromium } from '/tmp/hearsay-browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const results = [];
  for (const role of ['guest', 'user', 'admin']) {
    const context = await browser.newContext();
    // Cached/client-supplied admin claims must never bypass /api/me.
    await context.addInitScript(() => localStorage.setItem('hs_user', JSON.stringify({ role: 'admin', email: 'forged@example.invalid' })));
    const page = await context.newPage();
    let adminRequests = 0;
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      let body = { ok: true, data: { albums: { items: [] }, tracks: { items: [] } } }, status = 200;
      if (path === '/api/me') body = { authenticated: role !== 'guest', user: role === 'guest' ? null : { oid: '000000000000000000000001', email: `${role}@example.invalid`, role } };
      if (path === '/api/admin/overview') { adminRequests++; status = role === 'admin' ? 200 : 403; body = role === 'admin' ? { ok: true, counts: { users: 4, reviews: 8, artists: 2, albums: 3, songs: 5 } } : { ok: false }; }
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto('http://frontend/admin');
    if (role === 'admin') {
      await page.getByRole('heading', { name: 'Admin', exact: true }).waitFor();
      await page.getByText('Administrator overview', { exact: true }).waitFor();
      await page.getByRole('definition').first().waitFor();
      assert.equal(await page.getByRole('link', { name: 'Admin', exact: true }).count(), 1);
      assert.ok(adminRequests >= 1);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: 'Toggle menu', exact: true }).click();
      await page.getByRole('navigation', { name: 'Mobile primary', exact: true }).getByRole('link', { name: 'Admin', exact: true }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    } else {
      await page.waitForURL(role === 'guest' ? 'http://frontend/auth' : 'http://frontend/');
      assert.equal(await page.getByRole('link', { name: 'Admin', exact: true }).count(), 0);
      assert.equal(adminRequests, 0);
    }
    results.push({ role, passed: true, adminRequests });
    await context.close();
  }
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
