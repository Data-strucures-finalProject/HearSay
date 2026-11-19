import dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });
dotenv.config();

const dbName = process.env.MONGO_DB_NAME || 'hearsay';
const authSource = process.env.MONGO_APP_AUTH_SOURCE || dbName;
const username = process.env.MONGO_APP_USERNAME || process.env.MONGO_APP_USER;
const password = process.env.MONGO_APP_PASSWORD || process.env.MONGO_APP_PASS;

if (!username) {
  console.log('[DB] MONGO_APP_USERNAME not configured; keeping the existing database account for this run');
  process.exit(0);
}
if (!password) {
  throw new Error('MONGO_APP_PASSWORD is required when MONGO_APP_USERNAME is configured');
}
if (authSource === (process.env.MONGO_AUTH_SOURCE || 'admin') &&
  username === (process.env.MONGO_USERNAME || process.env.MONGO_USER)) {
  throw new Error('The runtime account must differ from the administrative MongoDB account.');
}

const { connectMongo, getClient, closeMongo } = await import('../dbAPI.js');
await connectMongo();
const database = getClient().db(authSource);

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
