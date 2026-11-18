import { VIEWS } from './analyticsViews.js';
import { INSIGHTS } from '../shared/insights.js';

// Reconcile definitions in place. Never drop or replace an application's collection.
export async function installViews(database) {
  for (const view of VIEWS) {
    const existing = await database.listCollections({ name: view.name }).next();
    if (existing && existing.type !== 'view') throw new Error(`${view.name} exists as a collection`);
    if (existing) await database.command({ collMod: view.name, viewOn: view.source, pipeline: view.pipeline });
    else await database.createCollection(view.name, { viewOn: view.source, pipeline: view.pipeline });
  }
}

function options(query, spec) {
  const integer = (value, fallback, min, max) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error('invalid_query');
    const number = Number(value);
    if (!Number.isSafeInteger(number) || number < min || number > max) throw new Error('invalid_query');
    return number;
  };
  const allowed = new Set(['q', 'limit', 'offset', 'sort', 'direction', 'mediaType', 'status']);
  if (Object.keys(query).some(key => !allowed.has(key))) throw new Error('invalid_query');
  const q = query.q ?? '';
  if (typeof q !== 'string' || q.length > 100) throw new Error('invalid_query');
  const sort = query.sort ?? spec.sort;
  if (!spec.columns.some(column => column.key === sort)) throw new Error('invalid_query');
  const direction = query.direction ?? (['createdAt', 'averageStars', 'starsAboveAverage', 'ratingCount', 'reviewsWritten', 'artistsInGenre', 'followers'].includes(sort) ? 'desc' : 'asc');
  if (!['asc', 'desc'].includes(direction)) throw new Error('invalid_query');
  const match = {};
  if (q.trim()) {
    const literal = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    match.$or = spec.columns.map(column => ({ [column.key]: { $regex: literal, $options: 'i' } }));
  }
  if (query.mediaType !== undefined) {
    if (spec.id !== 5 || !['album', 'song'].includes(query.mediaType)) throw new Error('invalid_query');
    match.mediaType = query.mediaType;
  }
  if (query.status !== undefined) {
    if (spec.id !== 4 || !['matched', 'user_without_review', 'review_without_user'].includes(query.status)) throw new Error('invalid_query');
    match.relationshipStatus = query.status;
  }
  const identity = { 1: ['reviewId'], 2: ['spotifyAlbumId'], 3: ['reviewId'], 4: ['userId', 'reviewId'], 5: ['mediaType', 'spotifyId'], 6: ['spotifyAlbumId'], 7: ['userId'], 8: ['genre'], 9: ['spotifyAlbumId'], 10: ['spotifyArtistId'] }[spec.id];
  return { match, sort: { [sort]: direction === 'asc' ? 1 : -1, ...Object.fromEntries([...spec.columns.map(column => column.key), ...identity].filter(key => key !== sort).map(key => [key, 1])) }, limit: integer(query.limit, 20, 1, 100), offset: integer(query.offset, 0, 0, 100000) };
}

export function mountInsightRoutes(app, database) {
  const handler = async (req, res) => {
    const id = Number(req.params.id ?? 4);
    const spec = INSIGHTS.find(item => item.id === id);
    if (!spec || (spec.id === 4 && !req.path.startsWith('/api/admin/'))) return res.status(404).json({ ok: false, error: 'unknown_insight' });
    let query;
    try { query = options(req.query, spec); }
    catch { return res.status(400).json({ ok: false, error: 'invalid_query' }); }
    try {
      const facets = {
        items: [{ $sort: query.sort }, { $skip: query.offset }, { $limit: query.limit }],
        total: [{ $count: 'count' }],
      };
      if (spec.chart) facets.chart = [
        { $match: { [spec.chart.value]: { $type: 'number' } } },
        { $sort: { [spec.chart.value]: -1, [spec.chart.label]: 1 } }, { $limit: 10 },
        { $project: { _id: 0, label: `$${spec.chart.label}`, value: `$${spec.chart.value}` } },
      ];
      const view = VIEWS.find(item => item.number === id);
      const [result] = await database.collection(view.name).aggregate([{ $match: query.match }, { $facet: facets }], { maxTimeMS: 5000 }).toArray();
      const total = result.total[0]?.count ?? 0;
      res.set('Cache-Control', 'no-store').json({ ok: true, items: result.items, total, offset: query.offset, nextOffset: query.offset + result.items.length < total ? query.offset + result.items.length : null, chart: result.chart ?? [] });
    } catch { res.status(503).json({ ok: false, error: 'insights_unavailable' }); }
  };
  app.get('/api/insights/:id', handler);
  // Registered after mountAdminRoutes, whose middleware checks the current DB role.
  app.get('/api/admin/insights/4', handler);
}
