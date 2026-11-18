import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { emailOwnerFilter, normalizeAddress } from './userEmails.js';

export async function initializeDefaultAdmin(database, env = process.env) {
  const users = database.collection('users');
  await users.createIndex({ isDefaultAdmin: 1 }, { unique: true, partialFilterExpression: { isDefaultAdmin: true }, name: 'uniq_default_admin' });
  // The persisted marker survives email/password changes. Environment values
  // only seed the account, never reset or promote an existing account.
  if (await users.findOne({ isDefaultAdmin: true })) return { created: false };
  const email = normalizeAddress(env.DEFAULT_ADMIN_EMAIL || 'admin@hearsay.com');
  const password = env.DEFAULT_ADMIN_PASSWORD || 'password';
  if (email.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || typeof password !== 'string' || password.length < 6) {
    throw new Error('Default admin configuration requires a valid email and a password of at least six characters.');
  }
  if (await users.findOne(emailOwnerFilter(email))) {
    console.warn('[Admin bootstrap] DEFAULT_ADMIN_EMAIL is already owned; choose an unused email. Existing users are never promoted automatically.');
    return { created: false, conflict: true };
  }
  const now = new Date().toISOString();
  try {
    await users.insertOne({ email, loginEmails: [email], emailHistory: [email], reviewIds: [], firstname: 'HearSay', lastname: 'Admin', accounts: [{ kind: 'Local', uid: email }], passwordHash: await bcrypt.hash(password, parseInt(env.BCRYPT_ROUNDS || '12', 10) || 12), role: 'admin', isDefaultAdmin: true, createdAt: now, updatedAt: now });
    return { created: true };
  } catch (error) {
    if (error.code === 11000 && await users.findOne({ isDefaultAdmin: true })) return { created: false };
    throw error;
  }
}

export function mountAdminRoutes(app, database) {
  app.use('/api/admin', async (req, res, next) => {
    const oid = req.session?.user?.oid;
    if (!oid || !ObjectId.isValid(oid)) return res.status(401).json({ ok: false, error: 'unauthorized' });
    try {
      const user = await database.collection('users').findOne({ _id: new ObjectId(oid) }, { projection: { role: 1, deletionPending: 1 } });
      if (!user || user.role !== 'admin' || user.deletionPending) return res.status(403).json({ ok: false, error: 'forbidden' });
      next();
    } catch { return res.status(503).json({ ok: false, error: 'admin_unavailable' }); }
  });
  app.get('/api/admin/overview', async (_req, res) => {
    try {
      const collections = ['users', 'reviews', 'artists', 'albums', 'songs'];
      const counts = await Promise.all(collections.map(name => database.collection(name).countDocuments(name === 'reviews' ? { 'item.type': { $in: ['song', 'album', 'artist'] } } : {})));
      const comments = await database.collection('reviews').countDocuments({ 'item.type': 'review', deleted: { $ne: true } });
      res.set('Cache-Control', 'no-store').json({ ok: true, counts: { ...Object.fromEntries(collections.map((name, i) => [name, counts[i]])), comments } });
    } catch { res.status(503).json({ ok: false, error: 'admin_unavailable' }); }
  });
}
