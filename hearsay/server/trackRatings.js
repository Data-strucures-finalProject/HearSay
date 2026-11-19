import { Double } from 'mongodb';

// Validate the canonical API shape and persist uniform BSON Double scores.
export function normalizeTrackRatings(value) {
  if (!Array.isArray(value)) throw new Error('invalid_track_ratings');
  const seen = new Set();
  return value.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
      Object.keys(entry).length !== 2 || !Object.hasOwn(entry, 'trackId') || !Object.hasOwn(entry, 'rating') ||
      typeof entry.trackId !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(entry.trackId) || seen.has(entry.trackId) ||
      !Number.isFinite(entry.rating) || entry.rating < 0.5 || entry.rating > 5 || !Number.isInteger(entry.rating * 2)) {
      throw new Error('invalid_track_ratings');
    }
    seen.add(entry.trackId);
    return { trackId: entry.trackId, rating: new Double(entry.rating) };
  });
}
