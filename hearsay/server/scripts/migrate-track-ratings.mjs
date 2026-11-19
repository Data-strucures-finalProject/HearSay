import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectMongo, closeMongo } from '../dbAPI.js';
import { loadValidator } from './apply-schemas.mjs';

// Server-side conversion preserves IDs/values and stores every score as Double.
// Non-object/array values deliberately fail the read-only preflight.
const converted = {
  $map: {
    input: { $cond: [
      { $isArray: '$trackRatings' }, '$trackRatings',
      { $map: { input: { $objectToArray: '$trackRatings' }, as: 'pair', in: { trackId: '$$pair.k', rating: '$$pair.v' } } },
    ] },
    as: 'track',
    in: { $mergeObjects: ['$$track', { rating: { $cond: [{ $isNumber: '$$track.rating' }, { $convert: { input: '$$track.rating', to: 'double', onError: null, onNull: null } }, null] } }] },
  },
};
const conversion = [{ $set: { trackRatings: converted } }];

export async function migrateTrackRatings(database, { apply = false } = {}) {
  const collection = database.collection('reviews');
  if (!await database.listCollections({ name: 'reviews' }).hasNext()) return { applied: false, documents: 0, modified: 0 };
  const canonical = await loadValidator('schema-HearSay-Reviews.json');
  const filter = { trackRatings: { $exists: true } };
  // Validate the entire projected document, including album-only placement,
  // half-star bounds and duplicate track IDs, before changing data or validators.
  const invalid = await collection.aggregate([
    { $set: { trackRatings: { $cond: [{ $eq: [{ $type: '$trackRatings' }, 'missing'] }, '$$REMOVE', converted] } } },
    { $match: { $nor: [canonical] } }, { $count: 'count' },
  ]).toArray();
  if (invalid.length) throw new Error(`Track-rating migration preflight failed: ${invalid[0].count} incompatible reviews. No changes made.`);
  const documents = await collection.countDocuments(filter);
  if (!apply) return { applied: false, documents, modified: 0 };
  const original = (await collection.options()).validator;
  // Keep enforcement enabled while allowing old and new shapes during conversion.
  // An interrupted migration can be rerun; final validation remains canonical.
  await database.command({ collMod: 'reviews', validator: original && Object.keys(original).length ? { $or: [original, canonical] } : canonical, validationLevel: 'strict', validationAction: 'error' });
  const result = await collection.updateMany(filter, conversion);
  const remaining = await collection.countDocuments({ $nor: [canonical] });
  if (remaining) throw new Error(`Track-rating migration found ${remaining} incompatible reviews. Inspect and rerun before starting the app.`);
  await database.command({ collMod: 'reviews', validator: canonical, validationLevel: 'strict', validationAction: 'error' });
  return { applied: true, documents, modified: result.modifiedCount };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await migrateTrackRatings(await connectMongo(), { apply: process.argv.includes('--apply') }))); }
  catch (error) { console.error('[Track-rating migration]', error.message); process.exitCode = 1; }
  finally { await closeMongo(); }
}
