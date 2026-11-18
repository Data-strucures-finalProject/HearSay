import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { migrateEmbeddedComments } from '../server/discussionMigration.js';

export async function checkDiscussions({ request, database, origin, userId, rootId }) {
  const root = String(rootId);
  const path = `/api/discussions/${root}`;
  let secondCookie = '';
  const other = async (url, method = 'GET', body) => {
    const response = await fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', Cookie: secondCookie }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (response.headers.get('set-cookie')) secondCookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, data: await response.json() };
  };
  const signup = await other('/api/auth/local/signup', 'POST', { email: 'discussion-second@example.invalid', password: 'example-password' });
  assert.equal(signup.status, 200);
  const secondId = signup.data.user.oid;
  for (const type of ['song', 'album', 'artist']) assert.equal((await request(`/api/discussions?type=${type}&oid=audit-track`)).status, 200);
  for (const suffix of ['?type=review&oid=a', '?type=song&oid=a&limit=0', '?type=song&oid=a&offset=-1', '?type=song&oid=a&sort=bad']) assert.equal((await request('/api/discussions' + suffix)).status, 400);
  assert.equal((await request('/api/discussions/not-an-id')).status, 400);
  for (const [method, url, body] of [['POST', path + '/replies', { text: 'guest', clientRequestId: 'guest-request-1' }], ['PUT', path + '/vote', { value: 1 }], ['PATCH', path, { text: 'guest', rating: 5 }], ['DELETE', path]]) assert.equal((await request(url, { method, body, authenticated: false })).status, 401);
  assert.equal((await other(path, 'PATCH', { text: 'unauthorized edit', rating: 5 })).status, 403);
  assert.equal((await other(path, 'DELETE')).status, 403);
  assert.equal((await request(path + '/vote', { method: 'PUT', body: { value: 2 } })).status, 400);
  for (const text of ['', ' ', 'word '.repeat(1001)]) assert.equal((await other(path + '/replies', 'POST', { text, clientRequestId: 'bad-comment-1' })).status, 400);

  // Legacy migration preserves IDs/authors and is safe to repeat.
  const embeddedId = new ObjectId();
  await database.collection('reviews').updateOne({ _id: new ObjectId(root) }, { $push: { comments: { oid: String(embeddedId), user: { oid: userId }, text: 'Legacy comment', createdAt: new Date().toISOString() } } }, { bypassDocumentValidation: true });
  assert.equal((await migrateEmbeddedComments(database)).converted, 1);
  assert.equal((await migrateEmbeddedComments(database)).converted, 0);
  assert.equal((await database.collection('reviews').findOne({ _id: embeddedId })).item.oid, root);

  const payload = { text: 'First reply', clientRequestId: 'test-reply-request-1' };
  const first = await other(path + '/replies', 'POST', payload);
  assert.equal(first.status, 201);
  assert.equal((await other(path + '/replies', 'POST', payload)).data.entry.id, first.data.entry.id);
  assert.equal((await other(path + '/replies', 'POST', { ...payload, text: 'different' })).status, 409);
  const second = await other(path + '/replies', 'POST', { text: 'Another reply from the same author', clientRequestId: 'test-reply-request-2' });
  assert.equal(second.status, 201, 'author can reply more than once to one parent');
  const child = await request(`/api/discussions/${first.data.entry.id}/replies`, { method: 'POST', body: { text: 'Nested reply', clientRequestId: 'test-nested-request-1' } });
  assert.equal(child.status, 201);
  const stored = await database.collection('reviews').findOne({ _id: new ObjectId(child.data.entry.id) });
  assert.equal(stored.item.type, 'review'); assert.equal(stored.item.oid, first.data.entry.id); assert.equal(stored.threadRoot, root); assert.equal(stored.depth, 2);
  assert.equal((await request(`/api/discussions/${first.data.entry.id}/replies`)).data.items[0].id, child.data.entry.id);
  const page = await request(path + '/replies?limit=1');
  assert.equal(page.data.items.length, 1); assert.equal(page.data.total, 3); assert.equal(page.data.nextOffset, 1);
  assert.equal((await request('/api/reviews/my/list')).data.items.length, 1, 'comments do not enter media review feeds');
  const recent = await request('/api/reviews/recent'); assert.ok(recent.data.items.every(r => r.type !== 'review'));
  const vote = value => request(path + '/vote', { method: 'PUT', body: { value } });
  assert.equal((await vote(1)).data.entry.likes, 1);
  assert.equal((await vote(1)).data.entry.likes, 1);
  assert.equal((await vote(-1)).data.entry.likes, 0);
  assert.equal((await vote(-1)).data.entry.dislikes, 1);
  assert.equal((await vote(0)).data.entry.dislikes, 0);
  await Promise.all([vote(1), other(path + '/vote', 'PUT', { value: 1 })]);
  assert.equal((await request(path)).data.entry.likes, 2);
  const publicEntry = (await request(path, { authenticated: false })).data.entry;
  assert.equal(publicEntry.viewerVote, 0); assert.equal(publicEntry.canEdit, false); assert.equal(publicEntry.votes, undefined);
  assert.equal((await other(`/api/discussions/${second.data.entry.id}`, 'PATCH', { text: 'Edited comment' })).data.entry.text, 'Edited comment');
  assert.equal((await request(`/api/discussions/${first.data.entry.id}`, { method: 'DELETE' })).status, 403);
  assert.equal((await other(`/api/discussions/${first.data.entry.id}`, 'DELETE')).status, 200);
  assert.equal((await request(`/api/discussions/${first.data.entry.id}`)).data.entry.deleted, true);
  assert.equal((await request(`/api/discussions/${first.data.entry.id}/replies`)).data.items[0].id, child.data.entry.id);
  assert.equal((await other(`/api/discussions/${first.data.entry.id}/replies`, 'POST', { text: 'Cannot reply', clientRequestId: 'deleted-request-1' })).status, 409);
  const removed = await other('/api/profile', 'DELETE', { confirmation: 'DELETE' });
  assert.equal(removed.status, 200);
  assert.equal(await database.collection('users').countDocuments({ _id: new ObjectId(secondId) }), 0);
  assert.equal(await database.collection('reviews').countDocuments({ 'user.oid': secondId }), 0);
  assert.equal((await request(path)).data.entry.likes, 1, 'account deletion removes votes');
  assert.equal((await request(`/api/discussions/${second.data.entry.id}`)).data.entry.deleted, true);
  assert.equal((await request(`/api/discussions/${first.data.entry.id}/replies`)).data.items[0].id, child.data.entry.id);
  assert.equal((await database.collection('hs_v07_most_active_reviewers').findOne({ userId })).reviewsWritten, 1, 'comments do not inflate media-review activity');
  assert.equal(await database.collection('hs_v04_all_users_and_reviews_full_join').countDocuments({ userId: '', relationshipStatus: 'review_without_user' }), 0, 'deleted comments are not orphan integrity failures');
  console.log('Discussion checks passed: migration, separate reply records, nesting, paging, permissions, idempotency, votes, tombstones and account cleanup.');
}
