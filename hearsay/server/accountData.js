import { ObjectId } from 'mongodb';
import PDFDocument from 'pdfkit';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

async function* accountRecords(database, oid) {
  const user = await database.collection('users').findOne({ _id: new ObjectId(oid) });
  yield { record_type: 'account', account_id: oid, role: user.role === 'admin' ? 'admin' : 'user', first_name: user.firstname, last_name: user.lastname, primary_email: user.email, login_emails: JSON.stringify(user.loginEmails || [user.email]), email_history: JSON.stringify(user.emailHistory || []), connected_accounts: (user.accounts || []).map(a => a.kind).join('; '), google_first_name: user.googleProfile?.firstname, google_last_name: user.googleProfile?.lastname, google_email: user.googleProfile?.email, created_at: user.createdAt, updated_at: user.updatedAt };
  for await (const review of database.collection('reviews').find({ 'user.oid': { $in: [oid, new ObjectId(oid)] } }).sort({ _id: 1 })) {
    const common = { account_id: oid, review_id: review._id, item_type: review.item?.type, item_id: review.item?.oid };
    yield { ...common, record_type: 'review', review_title: review.title, rating: typeof review.rating === 'number' ? review.rating / 2 : '', review_text: review.text, likes: review.likes, dislikes: review.dislikes, created_at: review.createdAt, updated_at: review.updatedAt };
    for (const [track_id, track_rating] of Object.entries(review.trackRatings || {})) yield { ...common, record_type: 'track_rating', track_id, track_rating };
  }
}

// Quote every cell and neutralize spreadsheet formulas in user-supplied text.
export function csvCell(value) {
  let text = value == null ? '' : String(value);
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function mountAccountData(app, database, { sessionName, sessionsCollection }) {
  const users = database.collection('users');
  // Serialize authenticated requests for each user in this server, including
  // existing review writes, so deletion waits for earlier work to finish.
  const active = new Map();
  app.use(async (req, res, next) => {
    const oid = req.session?.user?.oid;
    if (!oid) return next();
    const previous = active.get(oid) || Promise.resolve();
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    active.set(oid, pending);
    await previous;
    let released = false;
    const finish = () => {
      if (released) return;
      released = true; release();
      if (active.get(oid) === pending) active.delete(oid);
    };
    res.once('finish', finish); res.once('close', finish);
    // A queued request may have disconnected before its turn began.
    if (res.destroyed) { finish(); return; }
    try {
      const user = ObjectId.isValid(oid) ? await users.findOne({ _id: new ObjectId(oid) }) : null;
      if (!user) {
        await new Promise(resolve => req.session.destroy(() => resolve()));
        res.clearCookie(sessionName, { path: '/' });
        if (req.path === '/api/me') return res.json({ authenticated: false });
        return res.status(401).json({ ok: false, error: 'unauthorized' });
      }
      const deletionRecovery = (req.path === '/api/profile' && ['GET', 'DELETE'].includes(req.method)) || req.path === '/api/me' || req.path === '/api/logout';
      req.session.user.role = user.role === 'admin' ? 'admin' : 'user';
      if (user.deletionPending && !deletionRecovery) {
        return res.status(409).json({ ok: false, error: 'account_deletion_pending' });
      }
      next();
    } catch (error) { finish(); next(error); }
  });

  app.get('/api/profile/export.csv', async (req, res) => {
    const oid = req.session?.user?.oid;
    if (!oid) return res.status(401).json({ ok: false, error: 'unauthorized' });
    try {
      const columns = ['record_type', 'account_id', 'role', 'first_name', 'last_name', 'primary_email', 'login_emails', 'email_history', 'connected_accounts', 'google_first_name', 'google_last_name', 'google_email', 'created_at', 'updated_at', 'review_id', 'item_type', 'item_id', 'review_title', 'rating', 'review_text', 'likes', 'dislikes', 'track_id', 'track_rating'];
      const row = values => columns.map(column => csvCell(values[column])).join(',') + '\r\n';
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="hearsay-account-data.csv"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.write('\uFEFF' + columns.map(csvCell).join(',') + '\r\n');
      for await (const record of accountRecords(database, oid)) res.write(row(record));
      res.end();
    } catch (error) {
      console.error('[Account export]', error.message);
      if (res.headersSent) return res.destroy();
      return res.status(500).json({ ok: false, error: 'export_failed' });
    }
  });

  app.get('/api/profile/export.pdf', async (req, res) => {
    const oid = req.session?.user?.oid;
    if (!oid) return res.status(401).json({ ok: false, error: 'unauthorized' });
    let pdf;
    try {
      pdf = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: 'HearSay account data' } });
      pdf.font(require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'));
      res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="hearsay-account-data.pdf"', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      pdf.on('error', () => res.destroy()); pdf.pipe(res);
      pdf.fontSize(20).text('HearSay account data');
      pdf.fontSize(9).text(`Exported ${new Date().toISOString()}`);
      pdf.text('Ratings use the 0–5 star scale. Passwords and sign-in tokens are excluded.').moveDown();
      for await (const record of accountRecords(database, oid)) {
        if (record.record_type !== 'track_rating') {
          if (pdf.y > pdf.page.height - 150) pdf.addPage();
          pdf.moveDown().fontSize(14).text(record.record_type === 'account' ? 'Account information' : `Review — ${record.item_type}`);
        }
        pdf.fontSize(9);
        for (const [key, value] of Object.entries(record)) {
          if (key === 'record_type' || value == null || value === '') continue;
          const label = key.replaceAll('_', ' ');
          pdf.text(`${label}: ${value}`, { lineGap: 2 });
        }
      }
      const pages = pdf.bufferedPageRange();
      for (let page = pages.start; page < pages.start + pages.count; page++) {
        pdf.switchToPage(page);
        pdf.fontSize(8).text(`Page ${page + 1} of ${pages.count}`, 48, pdf.page.height - 36, { lineBreak: false });
      }
      pdf.end();
    } catch (error) {
      console.error('[Account PDF export]', error.message);
      pdf?.destroy();
      if (res.headersSent) return res.destroy();
      return res.status(500).json({ ok: false, error: 'export_failed' });
    }
  });

  app.delete('/api/profile', async (req, res) => {
    const oid = req.session?.user?.oid;
    if (!oid) return res.status(401).json({ ok: false, error: 'unauthorized' });
    if (req.body?.confirmation !== 'DELETE') return res.status(400).json({ ok: false, error: 'confirmation_required' });
    try {
      const id = new ObjectId(oid), ownerIds = [oid, id];
      // The standalone MongoDB deployment cannot use multi-document transactions.
      // Keep a retryable marker until all related data has been removed.
      await users.updateOne({ _id: id }, { $set: { deletionPending: true } });
      const reviews = database.collection('reviews');
      const ids = (await reviews.find({ 'user.oid': { $in: ownerIds } }, { projection: { _id: 1 } }).toArray()).flatMap(review => [review._id, String(review._id)]);
      for (const collection of ['artists', 'albums', 'songs']) {
        await database.collection(collection).updateMany({}, { $pull: { reviews: { $or: [{ user_oid: { $in: ownerIds } }, { review_oid: { $in: ids } }] } } });
      }
      await users.updateMany({}, { $pull: { reviewIds: { $in: ids }, reviews: { $in: ids } } });
      await reviews.deleteMany({ 'user.oid': { $in: ownerIds } });
      await database.collection(sessionsCollection).deleteMany({ $or: [{ 'session.user.oid': oid }, { 'session.googleAuth.userOid': oid }] });
      await users.deleteOne({ _id: id });
      await new Promise(resolve => req.session.destroy(() => resolve()));
      res.clearCookie(sessionName, { path: '/' });
      return res.json({ ok: true });
    } catch (error) {
      console.error('[Account deletion]', error.message);
      return res.status(500).json({ ok: false, error: 'deletion_failed_retry' });
    }
  });
}
