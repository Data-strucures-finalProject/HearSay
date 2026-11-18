import assert from 'node:assert/strict';
import { BSON, ObjectId, Double, Long } from 'mongodb';
import { applySchemas, collectionSchemas, loadValidator } from '../server/scripts/apply-schemas.mjs';
import { validateDatabase } from '../server/databaseValidation.js';

export async function checkSchemaContracts(database, rootReview) {
  const clone = value => BSON.EJSON.parse(BSON.EJSON.stringify(value, { relaxed: false }), { relaxed: false });
  const id = String(new ObjectId()), otherId = String(new ObjectId());
  const now = '2026-11-17T12:00:00.000Z';
  const media = { name: 'Fixture', likes: '0', dislikes: '0', rating: '0', image: '', reviews: [], createdAt: now, updatedAt: now };
  const fixtures = {
    [process.env.SESSIONS_COLLECTION || 'expressSessions']: { expires: new Date(now), session: { cookie: { httpOnly: true }, user: { oid: id } } },
    users: { email: 'schema@example.invalid', firstname: '', lastname: '', role: 'user', accounts: [{ kind: 'Local', uid: 'schema@example.invalid' }], passwordHash: '$2a$04$' + 'A'.repeat(53), loginEmails: ['schema@example.invalid'], emailHistory: ['schema@example.invalid'], reviewIds: [], createdAt: now, updatedAt: now },
    albums: { ...media, artist: { name: 'Artist', oid: id }, genre: [], songs: [], releaseDate: '2026', spotifyAlbumId: 'fixture-album' },
    artists: { ...media, albums: [], songs: [], genres: [], followers: 0, popularity: 0, spotifyArtistId: 'fixture-artist', spotifyUrl: '' },
    songs: { title: 'Song', likes: '0', dislikes: '0', rating: '0', image: '', reviews: [], genres: [], date: '2026', spotifyTrackID: 'fixture-song', artist: { name: 'Artist', oid: id, spotifyArtistId: 'fixture-artist' }, album: { name: 'Album', oid: otherId, spotifyAlbumId: 'fixture-album' } },
    reviews: { type: 'review', item: { type: 'song', oid: 'fixture-song' }, user: { oid: id }, rating: 8, text: '', comments: [], votes: [], likes: 0, dislikes: 0, createdAt: now, updatedAt: now },
  };
  const comment = { ...fixtures.reviews, item: { type: 'review', oid: id }, rating: 0, text: 'A reply', threadRoot: id, depth: 1 };
  let rejected = 0, accepted = 0;
  const created = [];
  const good = async (name, fixture) => {
    const doc = { ...clone(fixture), _id: name === (process.env.SESSIONS_COLLECTION || 'expressSessions') ? String(new ObjectId()) : new ObjectId() };
    await database.collection(`schema_contract_${name}`).insertOne(doc); accepted++;
    return doc;
  };
  const bad = async (name, label, change, fixture = fixtures[name]) => {
    const doc = { ...clone(fixture), _id: name === (process.env.SESSIONS_COLLECTION || 'expressSessions') ? String(new ObjectId()) : new ObjectId() }; change(doc);
    await assert.rejects(database.collection(`schema_contract_${name}`).insertOne(doc), error => error.code === 121, `${name}: ${label}`); rejected++;
  };
  try {
    for (const [name, field] of [['albums', 'spotifyAlbumId'], ['songs', 'spotifyTrackID'], ['artists', 'spotifyArtistId']]) {
      const existing = await database.collection(name).findOne();
      await assert.rejects(database.collection(name).insertOne({ ...existing, _id: new ObjectId(), [field]: existing[field] }), error => error.code === 11000);
      rejected++;
    }
    for (const [name, filename] of Object.entries(collectionSchemas)) {
      const actual = await database.collection(name).options();
      assert.equal(actual.validationLevel, 'strict'); assert.equal(actual.validationAction, 'error');
      await database.createCollection(`schema_contract_${name}`, { validator: await loadValidator(filename), validationLevel: 'strict', validationAction: 'error' });
      created.push(`schema_contract_${name}`);
      await good(name, fixtures[name]);
      await bad(name, 'unknown fields', doc => { doc.unexpected = true; });
      await bad(name, 'incorrect ID type', doc => { doc._id = name === (process.env.SESSIONS_COLLECTION || 'expressSessions') ? new ObjectId() : id; });
      for (const field of ['createdAt', 'updatedAt']) if (fixtures[name][field]) {
        await bad(name, 'invalid timestamp', doc => { doc[field] = '2026-02-30T12:00:00Z'; });
      }
    }
    const sessions = process.env.SESSIONS_COLLECTION || 'expressSessions';
    await bad(sessions, 'missing expiry', doc => { delete doc.expires; });
    await bad(sessions, 'string expiry', doc => { doc.expires = now; });
    await bad(sessions, 'serialized session', doc => { doc.session = '{}'; });
    await good(sessions, { expires: new Date(now), session: { cookie: {}, googleAuth: { state: 'fixture', arbitraryMiddlewareField: true } }, lastModified: new Date(now) });
    for (const [label, change] of [
      ['missing alias list', doc => { delete doc.loginEmails; }],
      ['missing role', doc => { delete doc.role; }],
      ['invalid role', doc => { doc.role = 'owner'; }],
      ['malformed email', doc => { doc.email = 'not-an-email'; }],
      ['uppercase email', doc => { doc.email = 'Schema@example.invalid'; }],
      ['primary email outside aliases', doc => { doc.email = 'other@example.invalid'; }],
      ['aliases outside history', doc => { doc.loginEmails.push('other@example.invalid'); }],
      ['empty providers', doc => { doc.accounts = []; }],
      ['unsupported provider', doc => { doc.accounts[0].kind = 'Other'; }],
      ['provider without UID', doc => { delete doc.accounts[0].uid; }],
      ['local provider without password', doc => { delete doc.passwordHash; }],
      ['plaintext password hash', doc => { doc.passwordHash = 'plaintext'; }],
      ['embedded plaintext password', doc => { doc.accounts[0].password = 'plaintext'; }],
      ['duplicate aliases', doc => { doc.loginEmails.push(doc.email); }],
      ['duplicate author references', doc => { doc.reviewIds = [new ObjectId(id), new ObjectId(id)]; }],
      ['Google identity without profile', doc => { doc.accounts.push({ kind: 'Google', uid: 'google-one' }); }],
    ]) await bad('users', label, change);
    const google = { ...clone(fixtures.users), accounts: [{ kind: 'Google', uid: 'google-one' }], googleProfile: { uid: 'google-one', email: 'schema@example.invalid', firstname: 'Google', lastname: 'Member' }, createdAt: new Date(now) };
    delete google.passwordHash;
    await good('users', google);
    await bad('users', 'mismatched Google UID', doc => { doc.googleProfile.uid = 'different'; }, google);
    await bad('users', 'Google email outside aliases', doc => { doc.googleProfile.email = 'other@example.invalid'; }, google);
    await bad('users', 'multiple Google identities', doc => { doc.accounts.push({ kind: 'Google', uid: 'google-two' }); }, google);
    for (const name of ['albums', 'artists', 'songs']) {
      for (const [label, change] of [
        ['negative counter', doc => { doc.likes = '-1'; }],
        ['numeric counter instead of stored string', doc => { doc.dislikes = 0; }],
        ['invalid cached rating', doc => { doc.rating = '5.5'; }],
        ['blank Spotify ID', doc => { doc[{ albums: 'spotifyAlbumId', artists: 'spotifyArtistId', songs: 'spotifyTrackID' }[name]] = ''; }],
        ['invalid review reference', doc => { doc.reviews = [{ review_oid: 'bad-id', user_oid: id }]; }],
        ['repeated review ID', doc => { doc.reviews = [{ review_oid: id, user_oid: id }, { review_oid: id, user_oid: otherId }]; }],
        ['nonstring genre', doc => { doc[name === 'albums' ? 'genre' : 'genres'] = [123]; }],
      ]) await bad(name, label, change);
    }
    await bad('artists', 'negative followers', doc => { doc.followers = -1; });
    await bad('artists', 'popularity outside range', doc => { doc.popularity = 101; });
    await good('artists', { ...fixtures.artists, followers: Long.fromNumber(3000000000) });
    await bad('albums', 'duplicate song references', doc => { doc.songs = [{ name: 'One', oid: id }, { name: 'Two', oid: id }]; });
    await bad('songs', 'missing artist Spotify ID', doc => { delete doc.artist.spotifyArtistId; });
    await good('reviews', { ...fixtures.reviews, rating: 0, text: 'Text-only review' });
    await good('reviews', { ...fixtures.reviews, item: { type: 'album', oid: 'fixture-album' }, trackRatings: { track: 3.5 } });
    await good('reviews', { ...fixtures.reviews, votes: [{ userOid: id, value: 1 }], likes: 1 });
    for (const [label, change] of [
      ['missing rating', doc => { delete doc.rating; }],
      ['rating above stored range', doc => { doc.rating = 11; }],
      ['rating below stored range', doc => { doc.rating = -1; }],
      ['floating BSON rating', doc => { doc.rating = new Double(8); }],
      ['empty unrated review', doc => { doc.rating = 0; }],
      ['arbitrary document type', doc => { doc.type = 'comment'; }],
      ['arbitrary media type', doc => { doc.item.type = 'playlist'; }],
      ['mismatched type alias', doc => { doc.itemType = 'album'; }],
      ['invalid author', doc => { doc.user.oid = 'bad-author'; }],
      ['missing votes', doc => { delete doc.votes; }],
      ['negative likes', doc => { doc.likes = -1; }],
      ['counter disagrees with votes', doc => { doc.likes = 1; }],
      ['invalid vote value', doc => { doc.votes = [{ userOid: id, value: 2 }]; }],
      ['duplicate voter', doc => { doc.votes = [{ userOid: id, value: 1 }, { userOid: id, value: -1 }]; doc.likes = 1; doc.dislikes = 1; }],
      ['embedded comments', doc => { doc.comments = [{ oid: id, text: 'Embedded body' }]; }],
      ['long review', doc => { doc.text = 'x'.repeat(8001); }],
      ['too many words', doc => { doc.text = 'word '.repeat(1001); }],
      ['track ratings on song', doc => { doc.trackRatings = { track: 3.5 }; }],
      ['invalid track half-star', doc => { doc.item.type = 'album'; doc.trackRatings = { track: 3.2 }; }],
      ['invalid track key', doc => { doc.item.type = 'album'; doc.trackRatings = { 'bad.key': 4 }; }],
      ['root carrying depth', doc => { doc.depth = 1; }],
      ['updated before creation', doc => { doc.updatedAt = '2026-11-16T12:00:00.000Z'; }],
    ]) await bad('reviews', label, change);
    await good('reviews', comment);
    await good('reviews', { ...comment, depth: 2, item: { type: 'review', oid: otherId } });
    await good('reviews', { ...comment, deleted: true, user: { oid: '' }, text: '' });
    for (const [label, change] of [
      ['comment without root', doc => { delete doc.threadRoot; }],
      ['comment without depth', doc => { delete doc.depth; }],
      ['comment carrying rating', doc => { doc.rating = 2; }],
      ['blank comment', doc => { doc.text = '  '; }],
      ['invalid parent', doc => { doc.item.oid = 'not-an-id'; }],
      ['self parent', doc => { doc.item.oid = String(doc._id); }],
      ['depth outside range', doc => { doc.depth = 65; }],
      ['wrong direct root', doc => { doc.threadRoot = otherId; }],
      ['wrong nested root', doc => { doc.depth = 2; }],
      ['tombstone retaining author', doc => { doc.deleted = true; doc.text = ''; }],
      ['tombstone retaining text', doc => { doc.deleted = true; doc.user.oid = ''; }],
      ['comment track ratings', doc => { doc.trackRatings = { track: 4 }; }],
    ]) await bad('reviews', label, change, comment);

    // Strict mode checks updates even when a legacy document is already invalid.
    const invalid = { ...clone(fixtures.reviews), _id: new ObjectId(), rating: 99 };
    const collection = database.collection('schema_contract_reviews');
    await collection.insertOne(invalid, { bypassDocumentValidation: true });
    await assert.rejects(collection.updateOne({ _id: invalid._id }, { $set: { text: 'Still invalid' } }), error => error.code === 121);
    await collection.replaceOne({ _id: invalid._id }, { ...invalid, rating: 8 });
    rejected++;

    // A failed preflight must leave every installed validator untouched.
    const before = await Promise.all(Object.keys(collectionSchemas).map(name => database.collection(name).options()));
    const incompatible = { ...clone(rootReview), _id: new ObjectId(), item: { type: 'song', oid: 'schema-preflight' } };
    delete incompatible.votes;
    await database.collection('reviews').insertOne(incompatible, { bypassDocumentValidation: true });
    try {
      await assert.rejects(applySchemas(), /Schema preflight failed/);
      assert.deepEqual(await Promise.all(Object.keys(collectionSchemas).map(name => database.collection(name).options())), before);
    } finally { await database.collection('reviews').deleteOne({ _id: incompatible._id }); }
    const original = await database.collection('users').options();
    try {
      await database.command({ collMod: 'users', validator: { $jsonSchema: { bsonType: 'object' } }, validationLevel: 'moderate', validationAction: 'warn' });
      const drift = await validateDatabase(database);
      assert.equal(drift.issues.validator_drift, 1); assert.equal(drift.issues.validation_enforcement, 1);
    } finally { await database.command({ collMod: 'users', validator: original.validator, validationLevel: 'strict', validationAction: 'error' }); }
    console.log(JSON.stringify({ schemaContracts: true, accepted, rejected, strictLegacyUpdates: true, preflightPreservesValidators: true, driftDetection: true }));
  } finally { for (const name of created) await database.collection(name).drop(); }
}
