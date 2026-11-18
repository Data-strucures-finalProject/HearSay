import fs from 'node:fs/promises';
import path from 'node:path';
import { BSON } from 'mongodb';
import { connectMongo, closeMongo } from '../dbAPI.js';
import { ensureDiscussionIndexes } from '../discussions.js';
import { migrateEmbeddedComments } from '../discussionMigration.js';

const directory = process.env.DISCUSSION_BACKUP_DIR;
if (!directory || !path.isAbsolute(directory)) throw new Error('DISCUSSION_BACKUP_DIR must point to a private absolute backup directory');
try {
  const database = await connectMongo();
  await fs.mkdir(directory, { recursive: true });
  const snapshot = {};
  for (const name of ['users', 'reviews', 'songs', 'albums', 'artists']) snapshot[name] = await database.collection(name).find().toArray();
  const backup = path.join(directory, `before-discussions-${Date.now()}.ejson`);
  await fs.writeFile(backup, BSON.EJSON.stringify(snapshot, { relaxed: false }), { flag: 'wx', mode: 0o600 });
  await ensureDiscussionIndexes(database);
  console.log(JSON.stringify({ ...(await migrateEmbeddedComments(database)), backup: path.basename(backup) }));
} finally { await closeMongo(); }
