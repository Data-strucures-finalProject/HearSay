import assert from 'node:assert/strict';

const albums = Array.from({ length: 5 }, (_, index) => ({
  id: `fixture-album-${index}`, name: `Fixture Album ${index}`, total_tracks: 5, artists: [{ name: 'Fixture Artist' }],
}));
const tracks = Array.from({ length: 5 }, (_, index) => ({
  id: `fixture-track-${index}`, name: `Fixture Song ${index}`, artists: [{ name: 'Fixture Artist' }],
  album: { name: albums[0].name, artists: albums[0].artists }, external_urls: { spotify: 'https://open.spotify.com/' },
}));
const reply = (route, data) => route.fulfill({ json: { ok: true, data } });
const throttle = route => route.fulfill({ status: 429, headers: { 'Retry-After': '30' }, json: { ok: false, error: 'rate_limited' } });
const limitMessage = 'Too many music requests. Please wait and try again.';

export async function checkSpotifyBrowsing(browser, origin) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    for (const scenario of ['full', 'sparse', 'throttled']) {
      const searches = { album: 0, track: 0 };
      const intercept = route => {
        const type = new URL(route.request().url()).searchParams.get('type');
        const count = ++searches[type];
        if (type === 'track') return reply(route, { tracks: { items: tracks } });
        if (scenario === 'full' || (scenario === 'sparse' && count === 2)) return reply(route, { albums: { items: albums } });
        if (scenario === 'throttled' && count === 2) return throttle(route);
        return reply(route, { albums: { items: [albums[0], albums[0], albums[1], { ...albums[2], total_tracks: 1 }] } });
      };
      await page.route('**/api/spotify/search?*', intercept);
      await page.goto(origin);
      await page.getByText(/^Fixture Album \d$/).first().waitFor();
      await page.getByText(/^Fixture Song \d$/).first().waitFor();
      assert.equal(await page.getByText(/^Fixture Album \d$/).count(), scenario === 'throttled' ? 2 : 5);
      assert.equal(await page.getByText(/^Fixture Song \d$/).count(), 5);
      assert.deepEqual(searches, { album: scenario === 'full' ? 1 : 2, track: 1 });
      if (scenario === 'throttled') assert.equal(await page.getByRole('alert').innerText(), limitMessage);
      await page.unroute('**/api/spotify/search?*', intercept);
    }

    await page.route('https://open.spotify.com/**', route => route.fulfill({ body: '' }));
    let searches = 0;
    let rateLimited = false;
    await page.route('**/api/spotify/search?*', route => {
      searches++;
      if (rateLimited) return throttle(route);
      return reply(route, { tracks: { items: searches === 4 ? [tracks[0]] : [] } });
    });
    await page.goto(`${origin}/random`);
    await page.getByRole('button', { name: 'Random Song' }).click();
    await page.getByRole('button', { name: 'Rate This Song' }).waitFor();
    assert.match(await page.locator('iframe').getAttribute('src'), /\/track\/fixture-track-0\?/);
    assert.equal(searches, 4, 'Random should keep looking after empty results');
    rateLimited = true;
    searches = 0;
    await page.getByRole('button', { name: 'Random Song' }).click();
    await page.getByText(limitMessage).waitFor();
    assert.equal(searches, 1, 'Random should stop immediately on a rate limit');
    return { check: 'Spotify browsing request budget', fullHomeRequests: 2, sparseHomeRequests: 3, partialResultsPreserved: true, randomFallbackPreserved: true, randomStopsOn429: true };
  } finally { await context.close(); }
}
