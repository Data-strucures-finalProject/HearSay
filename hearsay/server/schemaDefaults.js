// Make existing application defaults explicit without changing credentials or content.
export async function normalizeSchemaDefaults(database) {
  const users = database.collection('users'), reviews = database.collection('reviews');
  const roles = await users.updateMany({ role: { $exists: false } }, { $set: { role: 'user' } });
  const votes = await reviews.updateMany({ votes: { $exists: false }, likes: 0, dislikes: 0 }, { $set: { votes: [] } });
  let authorLists = 0;
  for await (const user of users.find({ reviewIds: { $exists: false } }, { projection: { _id: 1 } })) {
    const owned = await reviews.find({ 'user.oid': String(user._id), deleted: { $ne: true } }, { projection: { _id: 1 } }).toArray();
    authorLists += (await users.updateOne({ _id: user._id, reviewIds: { $exists: false } }, { $set: { reviewIds: owned.map(review => review._id) } })).modifiedCount;
  }
  return { roles: roles.modifiedCount, votes: votes.modifiedCount, authorLists };
}
