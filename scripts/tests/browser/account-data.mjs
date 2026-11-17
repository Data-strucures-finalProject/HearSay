// Isolated API fixtures only: never exports or deletes real user data.
import { chromium } from '/tmp/hearsay-browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  let deleted = false, deleteRequests = 0, failDelete = false, failExport = false;
  const user = { oid: '000000000000000000000001', firstname: 'Fixture', email: 'fixture@example.invalid' };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = { ok: true }, status = 200;
    if (path === '/api/me') body = { authenticated: !deleted, user: deleted ? null : user };
    if (path === '/api/profile' && route.request().method() === 'GET') body = { ok: true, profile: { ...user, accounts: [{ kind: 'Local' }], loginEmails: [user.email] } };
    if (path.startsWith('/api/profile/export.')) {
      if (failExport) return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' });
      const format = path.endsWith('.csv') ? 'csv' : 'pdf';
      return route.fulfill({ contentType: format === 'csv' ? 'text/csv' : 'application/pdf', headers: { 'Content-Disposition': `attachment; filename="hearsay-account-data.${format}"` }, body: format === 'csv' ? 'record_type,email\r\naccount,fixture@example.invalid\r\n' : '%PDF-1.4\nfixture' });
    }
    if (path === '/api/profile' && route.request().method() === 'DELETE') {
      deleteRequests++; assert.deepEqual(route.request().postDataJSON(), { confirmation: 'DELETE' });
      if (failDelete) { status = 500; body = { ok: false }; } else deleted = true;
    }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://frontend/profile');
  for (const format of ['CSV', 'PDF']) {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: `Export account data (${format})`, exact: true }).click();
    assert.equal((await download).suggestedFilename(), `hearsay-account-data.${format.toLowerCase()}`);
  }
  failExport = true;
  await page.getByRole('button', { name: 'Export account data (CSV)', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Unable to export' }).waitFor();
  page.once('dialog', async dialog => { assert.match(dialog.message(), /cannot be undone/); assert.match(dialog.message(), /ALL associated/); await dialog.dismiss(); });
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  assert.equal(deleteRequests, 0);
  failDelete = true;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Deletion could not finish' }).waitFor();
  assert.equal(deleted, false);
  failDelete = false;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete account', exact: true }).click();
  await page.waitForURL('http://frontend/auth');
  assert.equal(await page.evaluate(() => localStorage.getItem('hs_user')), null);
  assert.equal(deleted, true); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ csvDownload: true, pdfDownload: true, exportFailureVisible: true, cancelDoesNotDelete: true, deletionFailureRetry: true, confirmedDeletionSignsOut: true, pageErrors: errors }));
} finally { await browser.close(); }
