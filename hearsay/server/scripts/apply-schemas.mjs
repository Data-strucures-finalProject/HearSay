import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeMongo, connectMongo } from '../dbAPI.js';

const collectionSchemas = {
  albums: 'schema-HearSay-Albums.json',
  artists: 'schema-HearSay-Artists.json',
  reviews: 'schema-HearSay-Reviews.json',
  songs: 'schema-HearSay-Songs.json',
  users: 'schema-HearSay-Users.json',
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = process.env.SCHEMA_DIR || path.resolve(scriptDir, '../../../db/schemas');

function convertSchema(node) {
  if (Array.isArray(node)) return node.map((item) => convertSchema(item));
  if (!node || typeof node !== 'object') return node;

  if (node.$ref === '#/$defs/ObjectId') return { bsonType: 'objectId' };

  const result = {};
  for (const [name, value] of Object.entries(node)) {
    if (name === '$schema' || name === '$defs' || name === '$ref') continue;
    if (name === 'type') {
      if (Array.isArray(value) && value.length === 0) continue;
      const bsonType = { integer: 'int', number: 'double' }[value] || value;
      result.bsonType = bsonType;
      continue;
    }
    result[name] = convertSchema(value, name);
  }
  return result;
}

async function loadValidator(filename) {
  const raw = JSON.parse(await fs.readFile(path.join(schemaDir, filename), 'utf8'));
  return raw.$jsonSchema ? raw : { $jsonSchema: convertSchema(raw) };
}

async function applyCollectionSchema(db, collectionName, validator) {
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length > 0;
  if (!exists) {
    await db.createCollection(collectionName, {
      validator,
      validationLevel: 'moderate',
      validationAction: 'error',
    });
    return 'created';
  }

  await db.command({
    collMod: collectionName,
    validator,
    validationLevel: 'moderate',
    validationAction: 'error',
  });
  return 'updated';
}

export async function applySchemas() {
  const db = await connectMongo();
  for (const [collectionName, filename] of Object.entries(collectionSchemas)) {
    const validator = await loadValidator(filename);
    const action = await applyCollectionSchema(db, collectionName, validator);
    console.log(`[DB] Schema ${action}: ${collectionName}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await applySchemas();
    process.exitCode = 0;
  } catch (error) {
    console.error('[DB] Schema application failed:', error);
    process.exitCode = 1;
  } finally {
    await closeMongo();
  }
}
