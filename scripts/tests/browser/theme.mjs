// Uses the same rendered-colour audit exercised through Docker Playwright MCP.
import { chromium } from '/tmp/hearsay-browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { auditTheme } from './theme-audit.mjs';
import { auditProtectedThemes } from './theme-fixtures.mjs';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  const results = [];
  for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
    const report = await auditTheme(page, { origin: 'http://frontend', theme, width });
    assert.deepEqual(report.errors, []);
    for (const result of report.results) {
      const label = `${theme}/${width}/${result.path}`;
      assert.equal(result.theme, theme, label);
      assert.equal(result.dark, theme === 'dark', label);
      assert.equal(result.bodyBackground, theme === 'dark' ? 'rgb(17, 24, 39)' : 'rgb(255, 255, 255)', label);
      assert.equal(result.headers, 1, label);
      assert.equal(result.mainCount, 1, label);
      assert.equal(result.overflow, false, label);
      assert.deepEqual(result.contrastFailures, [], label);
    }
    results.push({ theme, width, pages: report.results.length, passed: true });
  }
  for (const report of await auditProtectedThemes(page, auditTheme, 'http://frontend')) {
    assert.deepEqual(report.errors, []);
    for (const result of report.results) {
      const label = `${report.theme}/${report.width}/${result.path}/fixture`;
      assert.equal(result.mainCount, 1, label);
      assert.equal(result.headers, 1, label);
      assert.equal(result.overflow, false, label);
      assert.deepEqual(result.contrastFailures, [], label);
    }
    results.push({ theme: report.theme, width: report.width, fixturePages: report.results.length, passed: true });
  }
  await page.goto('http://frontend/auth');
  await page.getByRole('button', { name: "Don't have an account? Register" }).click();
  await page.getByLabel('Confirm Password', { exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Toggle menu' }).click();
  assert.equal(await page.getByRole('button', { name: 'Toggle menu' }).getAttribute('aria-expanded'), 'true');
  await page.getByRole('navigation', { name: 'Mobile primary' }).getByRole('link', { name: 'Discover', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Toggle menu' }).getAttribute('aria-expanded'), 'false');
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('#maincontent').count(), 1);
  console.log(JSON.stringify({ results, registerLabels: true, mobileExpandedState: true, skipTarget: true }));
} finally { await browser.close(); }
