import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDIA_INDEXES } from '../schemaIndexes.js';

const directory = process.env.SCHEMA_DIR || fileURLToPath(new URL('../../../db/schemas/', import.meta.url));
const indexStatements = {
  users: `db.users.createIndex({ isDefaultAdmin: 1 }, { unique: true, partialFilterExpression: { isDefaultAdmin: true }, name: 'uniq_default_admin' });
db.users.createIndex({ loginEmails: 1 }, { unique: true, partialFilterExpression: { loginEmails: { $exists: true } }, name: 'uniq_login_email' });
db.users.createIndex({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } }, name: 'uniq_email_if_string' });
db.users.createIndex({ 'accounts.kind': 1, 'accounts.uid': 1 }, { unique: true, partialFilterExpression: { 'accounts.kind': { $type: 'string' }, 'accounts.uid': { $type: 'string' } }, name: 'uniq_account_kind_uid' });`,
  reviews: `db.reviews.createIndex({ 'user.oid': 1, 'item.type': 1, 'item.oid': 1 }, { unique: true, partialFilterExpression: { 'user.oid': { $type: 'string' }, 'item.type': { $in: ['song', 'album', 'artist'] }, 'item.oid': { $type: 'string' } }, name: 'uniq_user_media_item' });
if (db.reviews.getIndexes().some(index => index.name === 'uniq_user_item')) db.reviews.dropIndex('uniq_user_item');
db.reviews.createIndex({ 'item.type': 1, 'item.oid': 1, createdAt: -1, _id: -1 }, { name: 'discussion_parent' });
db.reviews.createIndex({ threadRoot: 1 }, { name: 'discussion_root' });
db.reviews.createIndex({ 'user.oid': 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { 'item.type': 'review', clientRequestId: { $type: 'string' } }, name: 'unique_reply_request' });`,
};
for (const index of MEDIA_INDEXES) indexStatements[index.collection] = `db.${index.collection}.createIndex({ ${index.field}: 1 }, { unique: true, name: '${index.name}' });`;

for (const [name, title] of [['albums', 'Albums'], ['artists', 'Artists'], ['reviews', 'Reviews'], ['songs', 'Songs'], ['users', 'Users'], ['express-sessions', 'ExpressSessions']]) {
  const filename = `schema-HearSay-${title}.json`;
  const validator = JSON.parse(await fs.readFile(path.join(directory, filename), 'utf8'));
  const collection = name === 'express-sessions' ? 'expressSessions' : name;
  const output = `// Generated from ${filename}; run npm run db:sync-schema-scripts to update.
use("hearsay");

db.createCollection("${collection}", {
  validator: ${JSON.stringify(validator, null, 2).replaceAll('\n', '\n  ')},
  validationLevel: "strict",
  validationAction: "error"
});
${indexStatements[name] ? '\n' + indexStatements[name] + '\n' : ''}`;
  const destination = path.join(directory, `create-${name}.js`);
  if (process.argv.includes('--check')) {
    if ((await fs.readFile(destination, 'utf8')).replaceAll('\r\n', '\n') !== output) throw new Error(`Manual schema script is stale: create-${name}.js`);
  } else await fs.writeFile(destination, output);
}
console.log(process.argv.includes('--check') ? 'Manual schema scripts match canonical validators.' : 'Updated all six manual schema scripts.');
