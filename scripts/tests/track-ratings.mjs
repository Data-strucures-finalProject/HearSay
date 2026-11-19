import assert from 'node:assert/strict';
import { ObjectId, Double } from 'mongodb';
import { migrateTrackRatings } from '../server/scripts/migrate-track-ratings.mjs';

export async function checkTrackRatingMigration(database) {
  const reviews = database.collection('reviews');
  const now = new Date().toISOString();
  const fixture = { _id: new ObjectId(), type: 'review', item: { type: 'album', oid: 'migration-album' }, user: { oid: String(new ObjectId()) }, rating: 8, text: '', comments: [], votes: [], likes: 0, dislikes: 0, createdAt: now, updatedAt: now, trackRatings: { first: 4, second: 3.5 } };
  await reviews.insertOne(fixture, { bypassDocumentValidation: true });
  const original = await reviews.options();
  try {
    assert.equal((await migrateTrackRatings(database)).applied, false);
    assert.deepEqual((await reviews.findOne({ _id: fixture._id })).trackRatings, fixture.trackRatings);
    const invalidId = new ObjectId();
    await reviews.insertOne({ ...fixture, _id: invalidId, trackRatings: { first: '4' } }, { bypassDocumentValidation: true });
    await assert.rejects(migrateTrackRatings(database, { apply: true }), /preflight failed/);
    assert.deepEqual(await reviews.options(), original);
    assert.deepEqual((await reviews.findOne({ _id: fixture._id })).trackRatings, fixture.trackRatings);
    await reviews.deleteOne({ _id: invalidId });
    assert.equal((await migrateTrackRatings(database, { apply: true })).modified, 1);
    const migrated = await reviews.findOne({ _id: fixture._id });
    assert.deepEqual(migrated, { ...fixture, trackRatings: [{ trackId: 'first', rating: 4 }, { trackId: 'second', rating: 3.5 }] });
    const raw = await reviews.findOne({ _id: fixture._id }, { promoteValues: false });
    assert.ok(raw.trackRatings.every(track => track.rating instanceof Double));
    assert.equal((await migrateTrackRatings(database, { apply: true })).modified, 0);
    await assert.rejects(reviews.updateOne({ _id: fixture._id }, { $set: { trackRatings: fixture.trackRatings } }), error => error.code === 121);
  } finally { await reviews.deleteMany({ 'item.oid': 'migration-album' }); }
}
