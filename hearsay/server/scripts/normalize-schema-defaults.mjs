import { connectMongo, closeMongo } from '../dbAPI.js';
import { normalizeSchemaDefaults } from '../schemaDefaults.js';

try {
  const database = await connectMongo();
  console.log(JSON.stringify(await normalizeSchemaDefaults(database)));
}
finally { await closeMongo(); }
