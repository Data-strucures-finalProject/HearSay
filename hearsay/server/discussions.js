import { ObjectId, Int32 } from 'mongodb';

const mediaTypes = ['song', 'album', 'artist'];
let pending = Promise.resolve();
// Coordinates thread writes/deletions across users in the single backend process.
export async function withDiscussionLock(work) {
  const previous = pending;
  let release;
  pending = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await work(); } finally { release(); }
}
const oid = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value) ? new ObjectId(value) : null;
const problem = (status, message) => Object.assign(new Error(message), { status });

export async function ensureDiscussionIndexes(database) {
  const reviews = database.collection('reviews');
  await reviews.createIndex({ 'user.oid': 1, 'item.type': 1, 'item.oid': 1 }, { unique: true, partialFilterExpression: { 'user.oid': { $type: 'string' }, 'item.type': { $in: mediaTypes }, 'item.oid': { $type: 'string' } }, name: 'uniq_user_media_item' });
  if ((await reviews.indexes()).some(index => index.name === 'uniq_user_item')) await reviews.dropIndex('uniq_user_item');
  await reviews.createIndex({ 'item.type': 1, 'item.oid': 1, createdAt: -1, _id: -1 }, { name: 'discussion_parent' });
  await reviews.createIndex({ threadRoot: 1 }, { name: 'discussion_root' });
  await reviews.createIndex({ 'user.oid': 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { 'item.type': 'review', clientRequestId: { $type: 'string' } }, name: 'unique_reply_request' });
}

export async function removeThread(database, rootId) {
  const reviews = database.collection('reviews');
  await reviews.updateOne({ _id: oid(rootId) }, { $set: { threadDeleting: true } });
  const entries = await reviews.find({ $or: [{ _id: oid(rootId) }, { threadRoot: rootId }] }, { projection: { _id: 1 } }).toArray();
  const ids = entries.map(e => e._id), strings = ids.map(String);
  await database.collection('users').updateMany({}, { $pull: { reviewIds: { $in: ids }, reviews: { $in: [...ids, ...strings] } } });
  for (const name of ['songs', 'albums', 'artists']) await database.collection(name).updateMany({}, { $pull: { reviews: { review_oid: { $in: strings } } } });
  await reviews.updateMany({}, { $pull: { comments: { oid: { $in: strings } } } });
  await reviews.deleteMany({ _id: { $in: ids } });
}

export function voteUpdate(userId, value) {
  return [
    { $set: { votes: { $concatArrays: [{ $filter: { input: { $ifNull: ['$votes', []] }, as: 'vote', cond: { $ne: ['$$vote.userOid', userId] } } }, value === 0 ? [] : [{ userOid: userId, value }]] } } },
    { $set: {
      likes: { $size: { $filter: { input: '$votes', as: 'vote', cond: { $eq: ['$$vote.value', 1] } } } },
      dislikes: { $size: { $filter: { input: '$votes', as: 'vote', cond: { $eq: ['$$vote.value', -1] } } } },
    } },
  ];
}

async function tombstone(database, entry) {
  await database.collection('reviews').updateOne({ _id: entry._id }, { $set: { deleted: true, text: '', user: { oid: '' }, rating: new Int32(0), votes: [], likes: new Int32(0), dislikes: new Int32(0), updatedAt: new Date().toISOString() }, $unset: { clientRequestId: '' } });
  await database.collection('users').updateMany({}, { $pull: { reviewIds: entry._id, reviews: { $in: [entry._id, String(entry._id)] } } });
}

export async function removeAccountDiscussions(database, userId) {
  await withDiscussionLock(async () => {
    const reviews = database.collection('reviews');
    const owned = await reviews.find({ 'user.oid': { $in: [userId, oid(userId)] } }).toArray();
    for (const entry of owned.filter(e => mediaTypes.includes(e.item?.type))) await removeThread(database, String(entry._id));
    for (const entry of owned.filter(e => e.item?.type === 'review')) await tombstone(database, entry);
    await reviews.updateMany({ 'votes.userOid': userId }, voteUpdate(userId, 0));
  });
}

export function mountDiscussionRoutes(app, database) {
  const reviews = database.collection('reviews');
  const wrap = work => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await work(req, res); }
    catch (error) { res.status(error.status || 503).json({ ok: false, error: error.status ? error.message : 'discussion_unavailable' }); }
  };
  const signedIn = async req => {
    const id = req.session?.user?.oid;
    const user = oid(id) && await database.collection('users').findOne({ _id: oid(id) });
    if (!user) throw problem(401, 'sign_in_required');
    if (user.deletionPending) throw problem(409, 'account_deletion_pending');
    return id;
  };
  const entryById = async id => {
    if (!oid(id)) throw problem(400, 'invalid_review_id');
    const entry = await reviews.findOne({ _id: oid(id), type: 'review' });
    if (!entry || entry.threadDeleting || ![...mediaTypes, 'review'].includes(entry.item?.type)) throw problem(404, 'review_not_found');
    return entry;
  };
  const rootOf = async entry => {
    const root = entry.item.type === 'review' ? await entryById(entry.threadRoot) : entry;
    if (!mediaTypes.includes(root.item.type)) throw problem(409, 'invalid_thread');
    return root;
  };
  const hydrate = async (entries, viewer) => {
    const ids = entries.map(e => e.user?.oid).filter(id => oid(id));
    const users = await database.collection('users').find({ _id: { $in: ids.map(oid) } }, { projection: { firstname: 1, lastname: 1 } }).toArray();
    const names = new Map(users.map(u => [String(u._id), [u.firstname, u.lastname].filter(Boolean).join(' ') || 'Community member']));
    return entries.map(e => ({ id: String(e._id), parentId: e.item.type === 'review' ? e.item.oid : null, rootId: e.threadRoot || String(e._id), type: e.item.type, text: e.deleted ? '' : e.text, deleted: !!e.deleted, rating: e.item.type === 'review' ? null : (e.rating || 0) / 2, author: e.deleted ? '[deleted]' : names.get(e.user?.oid) || 'Community member', createdAt: e.createdAt, updatedAt: e.updatedAt, likes: e.likes || 0, dislikes: e.dislikes || 0, viewerVote: (e.votes || []).find(v => v.userOid === viewer)?.value || 0, canEdit: !!viewer && !e.deleted && e.user?.oid === viewer, replyCount: e.comments?.length || 0 }));
  };
  const paging = query => {
    const number = (value, fallback, max) => {
      if (value === undefined) return fallback;
      if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) throw problem(400, 'invalid_pagination');
      return Number(value);
    };
    const limit = number(query.limit, 10, 30), offset = number(query.offset, 0, 100000);
    if (limit < 1) throw problem(400, 'invalid_pagination');
    return { limit, offset };
  };
  const pageOf = async (req, query, sort) => {
    const { limit, offset } = paging(req.query);
    const [entries, total] = await Promise.all([reviews.find(query).sort(sort).skip(offset).limit(limit).maxTimeMS(5000).toArray(), reviews.countDocuments(query, { maxTimeMS: 5000 })]);
    return { ok: true, items: await hydrate(entries, req.session?.user?.oid), total, nextOffset: offset + entries.length < total ? offset + entries.length : null };
  };

  app.get('/api/discussions', wrap(async (req, res) => {
    const { type, oid: itemId, sort = 'newest' } = req.query;
    if (!mediaTypes.includes(type) || typeof itemId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(itemId) || !['newest', 'top'].includes(sort)) throw problem(400, 'invalid_discussion_query');
    const query = { type: 'review', 'item.type': type, 'item.oid': itemId, threadDeleting: { $ne: true } };
    const result = await pageOf(req, query, sort === 'top' ? { likes: -1, dislikes: 1, createdAt: -1, _id: -1 } : { createdAt: -1, _id: -1 });
    const own = req.session?.user?.oid && await reviews.findOne({ ...query, 'user.oid': req.session.user.oid });
    result.ownReview = own ? (await hydrate([own], req.session.user.oid))[0] : null;
    res.json(result);
  }));
  app.get('/api/discussions/:id', wrap(async (req, res) => {
    const entry = await entryById(req.params.id); await rootOf(entry);
    res.json({ ok: true, entry: (await hydrate([entry], req.session?.user?.oid))[0] });
  }));
  app.get('/api/discussions/:id/replies', wrap(async (req, res) => {
    const parent = await entryById(req.params.id); await rootOf(parent);
    res.json(await pageOf(req, { type: 'review', 'item.type': 'review', 'item.oid': req.params.id }, { createdAt: 1, _id: 1 }));
  }));
  app.post('/api/discussions/:id/replies', wrap(async (req, res) => {
    const userId = await signedIn(req);
    const text = req.body?.text;
    const requestId = req.body?.clientRequestId;
    if (typeof text !== 'string' || !text.trim() || text.length > 8000 || text.trim().split(/\s+/).length > 1000) throw problem(400, 'invalid_comment_text');
    if (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(requestId)) throw problem(400, 'invalid_request_id');
    await withDiscussionLock(async () => {
      const parent = await entryById(req.params.id), root = await rootOf(parent);
      if (parent.deleted) throw problem(409, 'comment_deleted');
      if ((parent.depth || 0) >= 64) throw problem(400, 'maximum_reply_depth');
      let entry = await reviews.findOne({ 'user.oid': userId, clientRequestId: requestId, 'item.type': 'review' });
      if (entry && (entry.item.oid !== req.params.id || entry.text !== text.trim())) throw problem(409, 'request_id_reused');
      if (!entry) {
        const now = new Date().toISOString();
        entry = { _id: new ObjectId(), type: 'review', itemType: 'review', item: { type: 'review', oid: req.params.id }, threadRoot: String(root._id), depth: (parent.depth || 0) + 1, user: { oid: userId }, text: text.trim(), rating: new Int32(0), likes: new Int32(0), dislikes: new Int32(0), comments: [], votes: [], clientRequestId: requestId, createdAt: now, updatedAt: now };
        await reviews.insertOne(entry);
      }
      // These links are idempotent, so an interrupted request can safely retry.
      await reviews.updateOne({ _id: parent._id }, { $addToSet: { comments: { oid: String(entry._id) } } });
      await database.collection('users').updateOne({ _id: oid(userId) }, { $addToSet: { reviewIds: entry._id } });
      res.status(201).json({ ok: true, entry: (await hydrate([entry], userId))[0] });
    });
  }));
  app.put('/api/discussions/:id/vote', wrap(async (req, res) => {
    const userId = await signedIn(req), value = req.body?.value;
    if (![0, 1, -1].includes(value)) throw problem(400, 'invalid_vote');
    await withDiscussionLock(async () => {
      const entry = await entryById(req.params.id); await rootOf(entry);
      if (entry.deleted) throw problem(409, 'comment_deleted');
      const result = await reviews.findOneAndUpdate({ _id: entry._id }, voteUpdate(userId, value), { returnDocument: 'after' });
      res.json({ ok: true, entry: (await hydrate([result], userId))[0] });
    });
  }));
  app.patch('/api/discussions/:id', wrap(async (req, res) => {
    const userId = await signedIn(req);
    const text = req.body?.text, rating = req.body?.rating;
    if (typeof text !== 'string' || text.length > 8000 || text.trim().split(/\s+/).filter(Boolean).length > 1000) throw problem(400, 'invalid_review_text');
    await withDiscussionLock(async () => {
      const entry = await entryById(req.params.id); await rootOf(entry);
      if (entry.deleted || entry.user.oid !== userId) throw problem(403, 'not_your_review');
      const changes = { text: text.trim(), updatedAt: new Date().toISOString() };
      if (entry.item.type === 'review') { if (!changes.text) throw problem(400, 'empty_comment'); }
      else {
        if (!Number.isFinite(rating) || rating < 0 || rating > 5 || !Number.isInteger(rating * 2) || (!rating && !changes.text)) throw problem(400, 'invalid_rating');
        changes.rating = new Int32(Math.round(rating * 2));
      }
      const result = await reviews.findOneAndUpdate({ _id: entry._id }, { $set: changes }, { returnDocument: 'after' });
      res.json({ ok: true, entry: (await hydrate([result], userId))[0] });
    });
  }));
  app.delete('/api/discussions/:id', wrap(async (req, res) => {
    const userId = await signedIn(req);
    await withDiscussionLock(async () => {
      const entry = await entryById(req.params.id); await rootOf(entry);
      if (entry.deleted || entry.user.oid !== userId) throw problem(403, 'not_your_review');
      if (entry.item.type === 'review') await tombstone(database, entry);
      else await removeThread(database, String(entry._id));
      res.json({ ok: true });
    });
  }));
}
