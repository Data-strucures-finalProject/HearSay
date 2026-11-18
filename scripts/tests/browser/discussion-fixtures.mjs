// Intercepted discussion exercise; safe to run through Docker Playwright MCP.
export async function exerciseDiscussions(page, origin = 'http://host.docker.internal:8080') {
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const rootId = '000000000000000000000001';
  const commentId = '000000000000000000000002';
  const nestedId = '000000000000000000000003';
  const user = { oid: '000000000000000000000009', name: 'Fixture member', role: 'user' };
  const now = '2026-11-17T12:00:00.000Z';
  let entries = [], mediaType = 'song', counter = 10, failVote = false;
  const make = (id, text, parentId, replyCount = 0) => ({ id, text, parentId, rootId, type: parentId ? 'review' : mediaType, author: 'Fixture member', rating: parentId ? null : 4, likes: 0, dislikes: 0, viewerVote: 0, canEdit: true, replyCount, createdAt: now, updatedAt: now });
  const handler = async route => {
    const request = route.request();
    if (!request.url().startsWith(origin + '/api/')) return route.continue();
    const path = request.url().split('/api/')[1].split('?')[0];
    const method = request.method();
    const body = request.postDataJSON();
    let data = { ok: true, data: {} }, status = 200;
    const root = entries.find(e => e.id === rootId);
    if (path === 'me') data = { authenticated: true, user };
    else if (path === 'reviews/my') data = { ok: true, review: root ? { _id: root.id, text: root.text, rating: root.rating } : null };
    else if (path === 'reviews/upsert') { root.text = body.text ?? root.text; root.rating = body.rating ?? root.rating; data = { ok: true, review: { _id: root.id, text: root.text, rating: root.rating } }; }
    else if (path.startsWith('reviews/top-songs')) data = { ok: true, songs: [] };
    else if (path.startsWith('spotify/track/')) data.data = { id: 'fixture', name: 'Fixture Song', artists: [{ id: 'fixture', name: 'Fixture Artist' }], album: { name: 'Fixture Album', images: [] }, duration_ms: 123000 };
    else if (path.startsWith('spotify/album/')) data.data = { id: 'fixture', name: 'Fixture Album', artists: [{ id: 'fixture', name: 'Fixture Artist' }], images: [], tracks: { items: [] }, release_date: '2026-01-01', total_tracks: 0 };
    else if (path.startsWith('artists/')) data.data = { id: 'fixture', name: 'Fixture Artist', genres: [], followers: 100 };
    else if (path.startsWith('spotify/artist/')) data.data = { id: 'fixture', name: 'Fixture Artist', items: [], genres: [], images: [], followers: { total: 100 } };
    else if (path === 'discussions') data = { ok: true, items: entries.filter(e => !e.parentId), total: root ? 1 : 0, nextOffset: null };
    else if (path.startsWith('discussions/')) {
      const [, id, action] = path.split('/');
      const entry = entries.find(e => e.id === id);
      if (action === 'replies' && method === 'GET') data = { ok: true, items: entries.filter(e => e.parentId === id), total: entry.replyCount, nextOffset: null };
      else if (action === 'replies') { const child = make(String(counter++).padStart(24, '0'), body.text, id); entries.push(child); entry.replyCount++; data = { ok: true, entry: child }; }
      else if (action === 'vote') {
        if (failVote) { failVote = false; status = 503; data = { ok: false, error: 'fixture_failure' }; }
        else { entry.viewerVote = body.value; entry.likes = body.value === 1 ? 1 : 0; entry.dislikes = body.value === -1 ? 1 : 0; data = { ok: true, entry }; }
      } else if (method === 'PATCH') { entry.text = body.text; if (entry.type !== 'review') entry.rating = body.rating; data = { ok: true, entry }; }
      else if (method === 'DELETE') { if (entry.parentId) Object.assign(entry, { deleted: true, text: '', author: '[deleted]', canEdit: false, likes: 0, dislikes: 0 }); else entries = []; data = { ok: true }; }
      else data = { ok: true, entry };
    }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  };
  const errors = [], results = [];
  const onError = error => errors.push(error.message);
  page.on('pageerror', onError);
  await page.route('**/api/**', handler);
  try {
    for (const theme of ['light', 'dark']) for (const width of [390, 1440]) for (const type of ['album', 'song', 'artist']) {
      mediaType = type;
      entries = [make(rootId, 'Community review', null, 1), make(commentId, 'First comment', rootId, 1), make(nestedId, 'Nested comment', commentId)];
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(origin + '/auth');
      await page.evaluate(value => localStorage.setItem('theme', value), theme);
      await page.goto(`${origin}/${type}/fixture`);
      const section = page.getByRole('region', { name: 'Reviews and discussion' });
      const root = section.locator(`[data-entry-id="${rootId}"]`);
      await root.getByText('Community review', { exact: true }).waitFor();
      check(await section.getByRole('button', { name: 'Show replies (1)', exact: true }).count() === 1, 'Only root replies are initially visible');
      await root.getByRole('button', { name: 'Show replies (1)', exact: true }).click();
      const comment = section.locator(`[data-entry-id="${commentId}"]`);
      await comment.getByText('First comment', { exact: true }).waitFor();
      await comment.getByRole('button', { name: 'Show replies (1)', exact: true }).click();
      const nested = section.locator(`[data-entry-id="${nestedId}"]`);
      await nested.getByText('Nested comment', { exact: true }).waitFor();
      await nested.getByRole('button', { name: 'Reply', exact: true }).click();
      await nested.getByLabel('Your comment', { exact: true }).fill('A reply to the nested comment');
      await nested.getByRole('button', { name: 'Post reply', exact: true }).click();
      await section.getByText('A reply to the nested comment', { exact: true }).waitFor();
      check(entries.some(e => e.parentId === nestedId && e.text === 'A reply to the nested comment'), 'Nested parent is preserved');
      await nested.getByRole('button', { name: 'Like comment', exact: true }).first().click();
      await page.waitForFunction(() => document.querySelector('[data-entry-id="000000000000000000000003"] button[aria-label="Like comment"]').getAttribute('aria-pressed') === 'true');
      await nested.getByRole('button', { name: 'Dislike comment', exact: true }).first().click();
      await page.waitForFunction(() => document.querySelector('[data-entry-id="000000000000000000000003"] button[aria-label="Dislike comment"]').getAttribute('aria-pressed') === 'true');
      const newId = entries[entries.length - 1].id;
      const newComment = section.locator(`[data-entry-id="${newId}"]`);
      await newComment.getByRole('button', { name: 'Edit', exact: true }).click();
      await newComment.getByLabel('Your comment', { exact: true }).fill('Edited nested reply');
      await newComment.getByRole('button', { name: 'Save changes', exact: true }).click();
      await newComment.getByText('Edited nested reply', { exact: true }).waitFor();
      await newComment.getByRole('button', { name: 'Delete', exact: true }).click();
      await newComment.getByRole('button', { name: 'Confirm delete', exact: true }).click();
      await newComment.getByText('[Comment deleted]', { exact: true }).waitFor();
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}/${width}/${type} overflows`);
      check(await page.evaluate(() => document.documentElement.classList.contains('dark')) === (theme === 'dark'), 'Theme mismatch');
      results.push({ theme, width, type, nestedReplies: true, votes: true, editDelete: true, overflow: false });
      await root.getByRole('button', { name: 'Hide replies (1)', exact: true }).first().click();
      check(!await comment.isVisible(), 'Collapse hides descendants');
      failVote = true;
      await root.getByRole('button', { name: 'Like review', exact: true }).click();
      await root.getByRole('alert').waitFor();
      await root.getByRole('button', { name: 'Like review', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-entry-id="000000000000000000000001"] button[aria-label="Like review"]').getAttribute('aria-pressed') === 'true');
      await root.getByRole('button', { name: 'Edit', exact: true }).first().click();
      await root.getByLabel('Your review', { exact: true }).fill('Updated community review');
      await root.getByRole('button', { name: 'Save changes', exact: true }).click();
      await root.getByText('Updated community review', { exact: true }).waitFor();
      await root.getByRole('button', { name: 'Delete', exact: true }).first().click();
      await root.getByRole('button', { name: 'Confirm delete', exact: true }).click();
      await section.getByText('No reviews yet. Be the first to share your thoughts.', { exact: true }).waitFor();
    }
    check(errors.length === 0, errors.join('; '));
    return { passed: true, results, errorRecovery: true, collapse: true, rootDeletion: true, errors };
  } finally { await page.unroute('**/api/**', handler); page.off('pageerror', onError); }
}
