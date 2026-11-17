// Intercepted API fixture: never reads or changes real user accounts.
import { chromium } from '/tmp/hearsay-browser/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const original = 'local@example.invalid', googleEmail = 'google@example.invalid';
  let profile = { _id: '000000000000000000000001', email: original, firstname: 'Local', lastname: 'Tester', accounts: [{ kind: 'Local' }, { kind: 'Google' }], loginEmails: [original, googleEmail], googleProfile: { firstname: 'Google', lastname: 'Person', email: googleEmail } };
  const selections = [];
  const user = () => ({ oid: profile._id, email: profile.email, firstname: profile.firstname, lastname: profile.lastname, name: [profile.firstname, profile.lastname].filter(Boolean).join(' ') });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body = { ok: true };
    if (path === '/api/me') body = { authenticated: true, user: user() };
    else if (path === '/api/profile') body = { ok: true, profile };
    else if (path === '/api/profile/update') {
      const changes = route.request().postDataJSON();
      profile = { ...profile, firstname: changes.firstname, lastname: changes.lastname };
      body = { ok: true, profile, user: user() };
    }
    else if (path === '/api/profile/google-details') {
      const selected = route.request().postDataJSON(); selections.push(selected);
      for (const field of ['firstname', 'lastname', 'email']) if (selected[field]) profile[field] = profile.googleProfile[field];
      body = { ok: true, profile, user: user() };
    } else if (path === '/api/profile/emails/primary') {
      profile.email = route.request().postDataJSON().email;
      body = { ok: true, profile, user: user() };
    } else if (path === '/api/profile/emails') {
      const email = route.request().postDataJSON().email;
      assert.equal(route.request().method(), 'DELETE');
      profile.loginEmails = profile.loginEmails.filter(address => address !== email);
      profile.accounts = [{ kind: 'Local' }]; profile.googleProfile = null;
      body = { ok: true, profile, user: user() };
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('http://frontend/profile');
  const open = () => page.getByRole('button', { name: 'Use Google profile details', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Choose Google profile details' });
  await open();
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.evaluate(async () => {
      getComputedStyle(document.querySelector('#google-profile-choices')).backgroundColor;
      await new Promise(requestAnimationFrame);
      await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
    });
    for (const element of [page.getByRole('button', { name: 'Use Google profile details', exact: true }), panel.getByRole('heading').locator('span')]) {
      const ratio = await element.evaluate(node => {
        const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
        const rgb = value => {
          context.fillStyle = value; context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(channel => {
          const v = channel / 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
          }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
        };
        let parent = node;
        while (parent && ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(parent).backgroundColor)) parent = parent.parentElement;
        const text = rgb(getComputedStyle(node).color), background = rgb(getComputedStyle(parent).backgroundColor);
        return (Math.max(text, background) + .05) / (Math.min(text, background) + .05);
      });
      const appearance = await element.evaluate(node => ({ text: node.textContent, color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor, parentBackground: getComputedStyle(node.parentElement).backgroundColor, classes: document.documentElement.className }));
      assert.ok(ratio >= 4.5, `${colorScheme} control text contrast: ${ratio}; ${JSON.stringify(appearance)}`);
    }
  }
  for (const field of ['first name', 'last name', 'email']) assert.equal(await page.getByRole('checkbox', { name: `Replace ${field}`, exact: true }).isChecked(), false);
  assert.equal(await page.getByRole('button', { name: 'Apply selected details' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Keep current details' }).click();
  assert.equal(selections.length, 0);
  await open(); await page.getByRole('checkbox', { name: 'Replace first name', exact: true }).check();
  await page.getByRole('button', { name: 'Apply selected details' }).click();
  await panel.waitFor({ state: 'hidden' });
  assert.deepEqual(selections[0], { firstname: true, lastname: false, email: false });
  assert.equal(await page.getByRole('heading', { name: 'Google Tester', exact: true }).count(), 1);
  assert.equal(profile.email, original);
  await open(); await page.getByRole('checkbox', { name: 'Replace email', exact: true }).check();
  await page.getByRole('button', { name: 'Apply selected details' }).click();
  await panel.waitFor({ state: 'hidden' });
  assert.deepEqual(selections[1], { firstname: false, lastname: false, email: true });
  assert.deepEqual(profile.loginEmails, [original, googleEmail]);
  assert.equal(await page.getByRole('button', { name: `Remove ${googleEmail}`, exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: `Make ${original} primary`, exact: true }).click();
  await page.getByRole('button', { name: `Make ${googleEmail} primary`, exact: true }).waitFor();
  page.once('dialog', async dialog => { assert.match(dialog.message(), /disconnect Google/); await dialog.accept(); });
  await page.getByRole('button', { name: `Remove ${googleEmail}`, exact: true }).click();
  await page.getByRole('button', { name: 'Link Google Account', exact: true }).waitFor();
  assert.equal(await panel.count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Use Google profile details', exact: true }).count(), 0);
  assert.deepEqual(profile.loginEmails, [original]);
  await page.getByRole('button', { name: 'Edit Profile', exact: true }).click();
  const editForm = page.locator('form').filter({ has: page.getByRole('button', { name: 'Save', exact: true }) });
  await editForm.locator('input').nth(0).fill('Renamed');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('heading', { name: 'Renamed Tester', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Renamed Tester', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ uncheckedByDefault: true, keepDetails: true, independentSelections: true, aliasesRetained: true, primarySwitch: true, removalDisconnectsGoogle: true, mobileOverflow: false, pageErrors: errors }));
} finally { await browser.close(); }
