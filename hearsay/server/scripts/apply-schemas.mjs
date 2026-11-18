import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeMongo, connectMongo } from '../dbAPI.js';
import { ensureMediaIndexes, MEDIA_INDEXES } from '../schemaIndexes.js';

const sessionCollection = process.env.SESSIONS_COLLECTION || 'expressSessions';
if (['albums', 'artists', 'reviews', 'songs', 'users'].includes(sessionCollection)) throw new Error('SESSIONS_COLLECTION must differ from domain collection names.');

export const collectionSchemas = {
  albums: 'schema-HearSay-Albums.json',
  artists: 'schema-HearSay-Artists.json',
  reviews: 'schema-HearSay-Reviews.json',
  songs: 'schema-HearSay-Songs.json',
  users: 'schema-HearSay-Users.json',
  [sessionCollection]: 'schema-HearSay-ExpressSessions.json',
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

export async function loadValidator(filename) {
  const raw = JSON.parse(await fs.readFile(path.join(schemaDir, filename), 'utf8'));
  return raw.$jsonSchema || raw.$and ? raw : { $jsonSchema: convertSchema(raw) };
}

async function applyCollectionSchema(db, collectionName, validator) {
  const exists = (await db.listCollections({ name: collectionName }).toArray()).length > 0;
  if (!exists) {
    await db.createCollection(collectionName, {
      validator,
      validationLevel: 'strict',
      validationAction: 'error',
    });
    return 'created';
  }

  await db.command({
    collMod: collectionName,
    validator,
    validationLevel: 'strict',
    validationAction: 'error',
  });
  return 'updated';
}

export async function applySchemas() {
  const db = await connectMongo();
  const validators = new Map();
  const invalid = [];
  for (const [collectionName, filename] of Object.entries(collectionSchemas)) {
    const validator = await loadValidator(filename);
    validators.set(collectionName, validator);
    const exists = await db.listCollections({ name: collectionName }).hasNext();
    if (exists) {
      const count = await db.collection(collectionName).countDocuments({ $nor: [validator] });
      if (count) invalid.push(`${collectionName}: ${count}`);
    }
  }
  if (invalid.length) throw new Error(`Schema preflight failed (${invalid.join(', ')}). No validators changed. Run db:normalize-schema-defaults for missing legacy defaults, then inspect remaining records.`);
  for (const index of MEDIA_INDEXES) {
    if (!await db.listCollections({ name: index.collection }).hasNext()) continue;
    const duplicates = await db.collection(index.collection).aggregate([
      { $group: { _id: `$${index.field}`, count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } }, { $count: 'groups' },
    ]).toArray();
    if (duplicates.length) throw new Error(`Schema preflight failed (${index.collection}: duplicate Spotify identities). No validators changed.`);
  }
  for (const [collectionName, validator] of validators) {
    const action = await applyCollectionSchema(db, collectionName, validator);
    console.log(`[DB] Schema ${action}: ${collectionName}`);
  }
  await ensureMediaIndexes(db);
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
