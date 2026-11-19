import dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });
dotenv.config();

const dbName = process.env.MONGO_DB_NAME || 'hearsay';
const username = process.env.MONGO_APP_USERNAME;
const password = process.env.MONGO_APP_PASSWORD;

if (!username) {
  console.log('[DB] MONGO_APP_USERNAME not configured; keeping the existing database account for this run');
  process.exit(0);
}
if (!password) {
  throw new Error('MONGO_APP_PASSWORD is required when MONGO_APP_USERNAME is configured');
}

const { connectMongo, getDb, closeMongo } = await import('../dbAPI.js');
await connectMongo();
const database = getDb();

try {
  await database.command({
    updateUser: username,
    pwd: password,
    roles: [{ role: 'readWrite', db: dbName }],
  });
  console.log(`[DB] Updated HearSay application account '${username}'`);
} catch (error) {
  if (error?.codeName !== 'UserNotFound') throw error;
  await database.command({
    createUser: username,
    pwd: password,
    roles: [{ role: 'readWrite', db: dbName }],
  });
  console.log(`[DB] Created HearSay application account '${username}'`);
} finally {
  await closeMongo();
}
