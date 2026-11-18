// Intercepted layout/interaction regression; no real ratings or reviews are changed.
export async function exerciseRatingLayout(page, origin = 'http://host.docker.internal:8080') {
  const tracks = Array.from({ length: 24 }, (_, i) => ({ id: `layout-track-${i}`, name: i === 0 ? 'TOP ("Tower of God" OP)' : i === 1 ? 'SLUMP ("Tower of God" ED)' : `Track ${i + 1}: ${'LongTrackTitle'.repeat(5)}`, duration_ms: 186000, track_number: i + 1 }));
  const handler = async route => {
    if (!route.request().url().startsWith(origin + '/api/')) return route.continue();
    const path = route.request().url().split('/api/')[1].split('?')[0];
    let data = { ok: true, data: {} };
    if (path === 'me') data = { authenticated: false };
    else if (path.startsWith('reviews/my')) data = { ok: true, review: null };
    else if (path.startsWith('discussions')) data = { ok: true, items: [], total: 0, nextOffset: null };
    else if (path.startsWith('spotify/album/')) data.data = { id: 'layout', name: 'Layout album', images: [], artists: [{ name: 'Layout artist' }], release_date: '2026', total_tracks: tracks.length, tracks: { items: tracks } };
    else if (path.startsWith('spotify/track/')) data.data = { id: 'layout', name: 'Layout song', artists: [{ name: 'Layout artist' }], album: { images: [] }, duration_ms: 186000 };
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  };
  const results = [];
  await page.route('**/api/**', handler);
  try {
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 768, 1024, 1280, 1440]) for (const type of ['song', 'album']) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(origin + '/auth');
      await page.evaluate(value => localStorage.setItem('theme', value), theme);
      await page.goto(`${origin}/${type}/layout`);
      await page.locator('.media-detail-layout .headphone-rating').first().waitFor();
      const geometry = await page.evaluate(() => {
        const failures = [];
        const fits = (child, parent) => { const c = child.getBoundingClientRect(), p = parent.getBoundingClientRect(); return c.left >= p.left - 1 && c.right <= p.right + 1; };
        for (const control of document.querySelectorAll('.media-detail-layout .headphone-rating')) {
          if (control.scrollWidth > control.clientWidth + 1) failures.push('control overflows');
          for (const button of control.querySelectorAll('button')) {
            const rect = button.getBoundingClientRect();
            if (!fits(button, control) || rect.width < 44 || rect.height < 44) failures.push('rating target clipped or too small');
          }
          const value = control.querySelector('.headphone-rating__value');
          if (value && (!fits(value, control) || value.scrollWidth > value.clientWidth + 1)) failures.push('numeric rating clipped');
        }
        for (const rows of document.querySelectorAll('.album-track-list__rows')) {
          if (rows.scrollWidth > rows.clientWidth + 1) failures.push('track list scrolls horizontally');
          for (const row of rows.querySelectorAll('.album-track-list__row')) if (row.scrollWidth > row.clientWidth + 1) failures.push('track row overflows');
        }
        return { failures, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, controls: document.querySelectorAll('.media-detail-layout .headphone-rating').length };
      });
      if (geometry.horizontalOverflow || geometry.failures.length) throw new Error(JSON.stringify({ theme, width, type, ...geometry }));
      const control = type === 'album' ? page.locator('.album-track-list__rating .headphone-rating').first() : page.locator('.media-detail-layout .headphone-rating').first();
      await control.getByRole('button', { name: 'Rate 4 stars', exact: true }).click({ position: { x: 8, y: 22 } });
      if (!await control.getAttribute('aria-label').then(label => label.includes('3.5 out of 5'))) throw new Error('Half-star selection failed');
      await control.getByRole('button', { name: 'Rate 5 stars', exact: true }).press('Enter');
      if (!await control.getAttribute('aria-label').then(label => label.includes('5.0 out of 5'))) throw new Error('Keyboard selection failed');
      if (type === 'album') {
        await page.getByRole('link', { name: tracks.at(-1).name, exact: true }).scrollIntoViewIfNeeded();
        const lastVisible = await page.evaluate(() => {
          const rows = document.querySelector('.album-track-list__rows').getBoundingClientRect();
          const last = document.querySelector('.album-track-list__row:last-child').getBoundingClientRect();
          const panel = document.querySelector('.album-track-list').getBoundingClientRect();
          const submit = document.querySelector('.album-track-list__submit').getBoundingClientRect();
          return last.bottom <= rows.bottom + 1 && submit.bottom <= panel.bottom + 1;
        });
        if (!lastVisible) throw new Error('Final track or submit area is clipped');
      }
      results.push({ theme, width, type, controls: geometry.controls, fits: true, halfStars: true, keyboard: true });
    }
    return results;
  } finally { await page.unroute('**/api/**', handler); }
}
