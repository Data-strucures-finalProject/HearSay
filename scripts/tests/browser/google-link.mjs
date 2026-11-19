// Run in /app with temporary Playwright/Chromium installed, against rebuilt frontend.
// Every API/provider request is intercepted; this never changes live accounts.
import { chromium } from '/tmp/hearsay-browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// The Docker-only HTTP hostname needs secure-context APIs for real PKCE hashing.
// Normal usage is localhost or HTTPS; this flag affects only this fixture browser.
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage', '--unsafely-treat-insecure-origin-as-secure=http://frontend'] });
const results = [];
try {
  for (const scenario of ['collision', 'success', 'cancel', 'bad-state', 'signin', 'signin-collision']) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const signingIn = scenario.startsWith('signin');
    let startIntent, challenge, exchanges = 0, linked = false, signedIn = !signingIn;
    const user = { oid: '000000000000000000000001', email: 'local@example.invalid', firstname: 'Local', lastname: 'Tester' };
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      let body = { ok: true }, status = 200;
      if (path === '/api/me') body = signedIn ? { authenticated: true, user } : { authenticated: false };
      else if (path === '/api/profile') body = { ok: true, profile: { ...user, accounts: linked ? [{ kind: 'Local' }, { kind: 'Google' }] : [{ kind: 'Local' }], loginEmails: [user.email], googleProfile: linked ? { firstname: 'Google', lastname: 'Tester', email: 'google@example.invalid' } : null } };
      else if (path === '/api/auth/google/start') {
        const payload = route.request().postDataJSON();
        startIntent = payload.intent;
        challenge = payload.code_challenge;
        body = { ok: true, state: 'fixture-google-state' };
      } else if (path === '/api/auth/google/exchange') {
        exchanges++;
        const payload = route.request().postDataJSON();
        assert.equal(payload.state, 'fixture-google-state');
        assert.equal(createHash('sha256').update(payload.code_verifier).digest('base64url'), challenge);
        if (scenario === 'collision') { status = 409; body = { ok: false, error: 'google_account_in_use' }; }
        else if (scenario === 'signin-collision') { status = 409; body = { ok: false, error: 'google_link_required' }; }
        else { linked = scenario === 'success'; signedIn = true; body = { ok: true, user, linked }; }
      } else body = { ok: true, data: { albums: { items: [] }, tracks: { items: [] } } };
      return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route('https://accounts.google.com/o/oauth2/v2/auth?*', route => {
      const params = new URL(route.request().url()).searchParams;
      assert.equal(params.get('state'), 'fixture-google-state');
      assert.equal(params.get('code_challenge'), challenge);
      const query = scenario === 'cancel' ? 'error=access_denied&state=fixture-google-state' : `code=fixture-code&state=${scenario === 'bad-state' ? 'wrong-state' : 'fixture-google-state'}`;
      return route.fulfill({ status: 302, headers: { location: `http://frontend/auth/callback?${query}` } });
    });
    await page.goto(signingIn ? 'http://frontend/auth' : 'http://frontend/profile');
    assert.equal(await page.getByRole('region', { name: 'Choose Google profile details' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Use Google profile details', exact: true }).count(), 0);
    await page.getByRole('button', { name: signingIn ? 'Continue with Google' : 'Link Google Account', exact: true }).click();
    if (scenario === 'signin-collision') {
      await page.getByRole('alert').waitFor();
      assert.match(await page.getByRole('alert').innerText(), /link Google from Profile/);
      assert.equal(signedIn, false);
      assert.equal(exchanges, 1);
    } else if (['collision', 'cancel', 'bad-state'].includes(scenario)) {
      await page.getByRole('alert').waitFor();
      assert.equal(new URL(page.url()).pathname, '/profile');
      if (scenario === 'collision') assert.match(await page.getByRole('alert').innerText(), /already linked to another HearSay account/);
      assert.match(await page.locator('body').innerText(), /local@example.invalid/);
      assert.equal(linked, false);
      assert.equal(exchanges, scenario === 'collision' ? 1 : 0);
      assert.equal(await page.getByRole('button', { name: 'Link Google Account', exact: true }).count(), 1);
    } else if (scenario === 'success') {
      await page.getByRole('status').waitFor();
      await page.getByRole('region', { name: 'Choose Google profile details' }).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Use Google profile details', exact: true }).getAttribute('aria-expanded'), 'true');
      assert.equal(new URL(page.url()).pathname, '/profile');
      assert.equal(await page.getByRole('button', { name: 'Link Google Account', exact: true }).count(), 0);
      assert.match(await page.locator('body').innerText(), /local@example.invalid/);
      assert.equal(exchanges, 1);
    } else {
      await page.waitForURL('http://frontend/');
      assert.equal(exchanges, 1);
    }
    assert.equal(startIntent, signingIn ? 'signin' : 'link');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('google_auth_flow')), null);
    assert.deepEqual(errors, []);
    results.push({ scenario, passed: true, exchanges });
    await context.close();
  }
  console.log(JSON.stringify({ results }, null, 2));
} finally {
  await browser.close();
}
