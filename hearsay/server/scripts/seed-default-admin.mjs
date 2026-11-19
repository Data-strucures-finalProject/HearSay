import dotenv from 'dotenv';

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: envFile });
dotenv.config();

const { connectMongo, getDb, closeMongo } = await import('../dbAPI.js');
const { initializeDefaultAdmin } = await import('../admin.js');

await connectMongo();
await initializeDefaultAdmin(getDb());
await closeMongo();
