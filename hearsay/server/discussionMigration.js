import { ObjectId, Int32 } from 'mongodb';

// Convert legacy embedded comments without changing identifiers, authors or text.
// Idempotent: child records and author links are written before parent references.
export async function migrateEmbeddedComments(database) {
  const reviews = database.collection('reviews');
  const parents = await reviews.find({ 'comments.text': { $exists: true } }).toArray();
  const plan = [];
  for (const parent of parents) {
    for (const comment of parent.comments.filter(c => typeof c.text === 'string')) {
      if (!ObjectId.isValid(comment.oid) || !ObjectId.isValid(comment.user?.oid) || !comment.text.trim()) throw new Error('Invalid embedded comment; migration aborted');
      if (!await database.collection('users').findOne({ _id: new ObjectId(comment.user.oid) })) throw new Error('Comment author is missing');
      const existing = await reviews.findOne({ _id: new ObjectId(comment.oid) });
      if (existing && (existing.item?.type !== 'review' || existing.item.oid !== String(parent._id) || existing.text !== comment.text)) throw new Error('Conflicting comment identifier');
      plan.push({ parent, comment });
    }
  }
  for (const { parent, comment } of plan) {
    const id = new ObjectId(comment.oid);
    const record = { _id: id, type: 'review', itemType: 'review', item: { type: 'review', oid: String(parent._id) }, threadRoot: parent.threadRoot || String(parent._id), depth: (parent.depth || 0) + 1, user: comment.user, text: comment.text, rating: new Int32(0), likes: new Int32(0), dislikes: new Int32(0), votes: [], comments: [], createdAt: comment.createdAt || parent.createdAt, updatedAt: comment.updatedAt || comment.createdAt || parent.updatedAt };
    await reviews.updateOne({ _id: id }, { $setOnInsert: record }, { upsert: true });
    await database.collection('users').updateOne({ _id: new ObjectId(comment.user.oid) }, { $addToSet: { reviewIds: id } });
  }
  for (const parent of parents) await reviews.updateOne({ _id: parent._id }, { $set: { comments: parent.comments.map(c => ({ oid: c.oid })) } });
  return { converted: plan.length };
}
