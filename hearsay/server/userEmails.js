import { ObjectId } from 'mongodb';

export const normalizeAddress = value => String(value || '').trim().toLowerCase();
export const emailOwnerFilter = address => ({ $or: [{ loginEmails: address }, { email: address }] });
export const userProjection = { email: 1, firstname: 1, lastname: 1, accounts: 1, loginEmails: 1, googleProfile: 1, role: 1 };
export const publicDisplayName = user => {
  const name = [user?.firstname, user?.lastname].map(value => String(value || '').trim()).filter(Boolean).join(' ');
  return name || 'Community member';
};

export function publicProfile(user, sessionUser = {}) {
  return {
    _id: user._id, email: user.email || '', firstname: user.firstname || '', lastname: user.lastname || '',
    accounts: (Array.isArray(user.accounts) ? user.accounts : [])
      .map(account => ({ kind: account?.kind })).filter(account => account.kind),
    role: user.role === 'admin' ? 'admin' : 'user',
    loginEmails: user.loginEmails || [user.email],
    googleProfile: user.googleProfile ? { email: user.googleProfile.email, firstname: user.googleProfile.firstname, lastname: user.googleProfile.lastname } : null,
    name: sessionUser.name, picture: sessionUser.picture,
  };
}

// Run once for legacy records; never re-add emails deliberately removed later.
export async function initializeUserEmails(database) {
  const users = database.collection('users');
  await users.createIndex({ loginEmails: 1 }, {
    unique: true, partialFilterExpression: { loginEmails: { $exists: true } }, name: 'uniq_login_email',
  });
  for await (const user of users.find({ loginEmails: { $exists: false } })) {
    const addresses = [...new Set([user.email, ...(user.accounts || []).filter(a => a.kind === 'Local').map(a => a.uid)]
      .map(normalizeAddress).filter(email => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)))];
    await users.updateOne({ _id: user._id, loginEmails: { $exists: false } }, {
      $set: { loginEmails: addresses }, $addToSet: { emailHistory: { $each: addresses } },
    });
  }
}

export function mountEmailRoutes(app, database) {
  const users = database.collection('users');
  const route = handler => async (req, res) => {
    if (!req.session?.user?.oid) return res.status(401).json({ ok: false, error: 'unauthorized' });
    try {
      const user = await users.findOne({ _id: new ObjectId(req.session.user.oid) });
      if (!user) return res.status(404).json({ ok: false, error: 'not_found' });
      return await handler(req, res, user);
    } catch (error) {
      if (error?.code === 11000) return res.status(409).json({ ok: false, error: 'email_in_use' });
      console.error('[Profile emails]', error.message);
      return res.status(500).json({ ok: false, error: 'server_error' });
    }
  };
  async function finish(req, res, user) {
    if (!user) return res.status(409).json({ ok: false, error: 'profile_changed' });
    Object.assign(req.session.user, { email: user.email, firstname: user.firstname, lastname: user.lastname, name: [user.firstname, user.lastname].filter(Boolean).join(' ') });
    if (!(user.accounts || []).some(a => a.kind === 'Google')) {
      delete req.session.oauth;
      delete req.session.user.sub;
      delete req.session.user.picture;
      req.session.user.provider = 'local';
    }
    await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    return res.json({ ok: true, profile: publicProfile(user, req.session.user), user: req.session.user });
  }

  app.post('/api/profile/google-details', route(async (req, res, user) => {
    const selection = req.body || {};
    if (Object.keys(selection).some(key => !['firstname', 'lastname', 'email'].includes(key) || typeof selection[key] !== 'boolean')) {
      return res.status(400).json({ ok: false, error: 'invalid_selection' });
    }
    const google = user.googleProfile;
    if (!google || !(user.accounts || []).some(a => a.kind === 'Google' && a.uid === google.uid)) {
      return res.status(409).json({ ok: false, error: 'google_profile_unavailable' });
    }
    const changes = { updatedAt: new Date().toISOString() };
    for (const key of ['firstname', 'lastname']) {
      if (selection[key]) changes[key] = google[key] || '';
    }
    if (selection.email) changes.email = google.email;
    const update = { $set: changes };
    if (selection.email) update.$addToSet = { loginEmails: google.email, emailHistory: google.email };
    const changed = await users.findOneAndUpdate({ _id: user._id, googleProfile: google, accounts: user.accounts }, update, { returnDocument: 'after' });
    return finish(req, res, changed);
  }));

  app.post('/api/profile/emails/primary', route(async (req, res, user) => {
    const address = normalizeAddress(req.body?.email);
    if (!(user.loginEmails || []).includes(address)) return res.status(400).json({ ok: false, error: 'unknown_email' });
    const changed = await users.findOneAndUpdate({ _id: user._id, loginEmails: address }, { $set: { email: address, updatedAt: new Date().toISOString() } }, { returnDocument: 'after' });
    return finish(req, res, changed);
  }));

  app.delete('/api/profile/emails', route(async (req, res, user) => {
    const address = normalizeAddress(req.body?.email);
    if (!(user.loginEmails || []).includes(address)) return res.status(404).json({ ok: false, error: 'unknown_email' });
    if (address === user.email) return res.status(409).json({ ok: false, error: 'primary_email' });
    if (user.loginEmails.length <= 1) return res.status(409).json({ ok: false, error: 'last_email' });
    const disconnectGoogle = user.googleProfile?.email === address;
    if (disconnectGoogle && !user.passwordHash) return res.status(409).json({ ok: false, error: 'last_login_method' });
    const accounts = user.accounts.filter(account => !disconnectGoogle || account.kind !== 'Google')
      .map(account => account.kind === 'Local' && normalizeAddress(account.uid) === address ? { ...account, uid: user.email } : account);
    const update = { $pull: { loginEmails: address }, $set: { accounts, updatedAt: new Date().toISOString() } };
    if (disconnectGoogle) update.$unset = { googleProfile: '' };
    const changed = await users.findOneAndUpdate({ _id: user._id, email: { $ne: address }, loginEmails: address, accounts: user.accounts }, update, { returnDocument: 'after' });
    return finish(req, res, changed);
  }));
}
