import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { Int32, ObjectId } from 'mongodb';
import { closeMongo, connectMongo } from '../dbAPI.js';
import { normalizeTrackRatings } from '../trackRatings.js';
import { emailOwnerFilter } from '../userEmails.js';

const timestamp = '2026-11-14T12:00:00.000Z';
const fixtureId = (kind, index) => new ObjectId(`cee000000000000${kind}${index.toString(16).padStart(8, '0')}`);
const mediaFields = () => ({ likes: '0', dislikes: '0', rating: '0', reviews: [] });
const ref = (doc, name = doc.name) => ({ name, oid: String(doc._id) });
const authors = ['Avery', 'Casey', 'Jordan', 'Morgan'].map((firstname, index) => {
  const email = `${firstname.toLowerCase()}.example@hearsay.invalid`;
  return { _id: fixtureId(1, index), email, firstname, lastname: 'Example', role: 'user',
    accounts: [{ kind: 'Local', uid: email }], loginEmails: [email], emailHistory: [email],
    reviewIds: [], createdAt: timestamp, updatedAt: timestamp };
});

function buildExample(catalog) {
  const artists = new Map(catalog.artists.map((artist, index) => [artist.id, {
    _id: fixtureId(2, index), name: artist.name, image: artist.image, spotifyArtistId: artist.id,
    spotifyUrl: `https://open.spotify.com/artist/${artist.id}`, genres: artist.genres,
    followers: artist.followers, popularity: artist.popularity, albums: [], songs: [],
    createdAt: timestamp, updatedAt: timestamp, ...mediaFields(),
  }]));
  const albums = [], songs = [], reviews = [];

  function addReview(author, type, mediaId, score, text) {
    const date = new Date(Date.parse(timestamp) + reviews.length * 3600000).toISOString();
    const review = { _id: fixtureId(5, reviews.length), type: 'review', item: { type, oid: mediaId },
      user: { oid: String(author._id) }, rating: new Int32(score), text, comments: [], votes: [],
      likes: new Int32(0), dislikes: new Int32(0), createdAt: date, updatedAt: date };
    reviews.push(review);
    author.reviewIds.push(review._id);
    return review;
  }

  function reviewMedia(author, type, mediaId, media, score, text) {
    const review = addReview(author, type, mediaId, score, text);
    media.reviews.push({ review_oid: String(review._id), user_oid: String(author._id) });
    return review;
  }

  function reply(author, parent, root, text) {
    const child = addReview(author, 'review', String(parent._id), 0, text);
    child.threadRoot = String(root._id);
    child.depth = new Int32((parent.depth?.valueOf() ?? 0) + 1);
    parent.comments.push({ oid: String(child._id) });
    return child;
  }

  for (const [index, source] of catalog.albums.entries()) {
    const artist = artists.get(source.artistId);
    const album = { _id: fixtureId(3, index), name: source.title, artist: ref(artist),
      spotifyAlbumId: source.id, releaseDate: source.releaseDate, image: source.image,
      genre: artist.genres, songs: [], ...mediaFields() };
    albums.push(album);
    artist.albums.push(ref(album));
    for (const track of source.tracks) {
      const credited = artists.get(track.artistId);
      const song = { _id: fixtureId(4, songs.length), title: track.title, spotifyTrackID: track.id,
        artist: { ...ref(credited), spotifyArtistId: credited.spotifyArtistId },
        album: { ...ref(album), spotifyAlbumId: album.spotifyAlbumId }, date: album.releaseDate,
        image: album.image, genres: credited.genres, ...mediaFields() };
      songs.push(song);
      album.songs.push(ref(song, song.title));
      credited.songs.push(ref(song, song.title));
    }
    // Leave a few albums unrated for the first-review view.
    if (index >= catalog.albums.length - 3) continue;
    const author = authors[index % authors.length];
    const peer = authors[(index + 1) % authors.length];
    const review = reviewMedia(author, 'album', source.id, album, 6 + index % 4,
      'The opening sets a strong mood. I liked how the arrangements changed across the album.');
    review.trackRatings = normalizeTrackRatings(source.tracks.map((track, trackIndex) => ({ trackId: track.id, rating: 3 + trackIndex / 2 })));
    reviewMedia(peer, 'album', source.id, album, 8 + index % 3,
      'The second half clicked for me on a repeat listen. I would come back to this one.');
    const firstTrack = songs[songs.length - source.tracks.length];
    reviewMedia(peer, 'song', firstTrack.spotifyTrackID, firstTrack, 5 + index % 6,
      'The rhythm stood out first, and the quieter details held up on another listen.');
    if (index < 3) {
      review.votes.push({ userOid: String(peer._id), value: new Int32(1) });
      review.likes = new Int32(1);
      const comment = reply(peer, review, review, 'I also liked the contrast with the tracks near the end.');
      reply(author, comment, review, 'Agreed. The closing track fit better after a full listen.');
    }
  }
  for (const [index, artist] of [...artists.values()].entries()) {
    reviewMedia(authors[index % authors.length], 'artist', artist.spotifyArtistId, artist, 6 + index % 5,
      'There is a clear point of view in the production. I would listen to more from this artist.');
  }
  return { users: authors, artists: [...artists.values()], albums, songs, reviews };
}

async function seed() {
  if (process.env.NODE_ENV !== 'development') throw new Error('Example data requires NODE_ENV=development.');
  const catalog = JSON.parse(await readFile(new URL('./seed/example-catalog.json', import.meta.url), 'utf8'));
  const collections = buildExample(catalog);
  const database = await connectMongo();
  const initialized = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map(item => item.name));
  for (const [name, docs] of Object.entries(collections)) {
    if (!initialized.has(name)) throw new Error('Initialize the database with npm run db:apply-schemas before loading examples.');
    if (name !== 'users' && await database.collection(name).findOne({ _id: { $nin: docs.map(doc => doc._id) } }, { projection: { _id: 1 } })) {
      throw new Error(`Found existing ${name} outside the example dataset. Use a fresh development database.`);
    }
  }

  const users = database.collection('users');
  const newAuthors = [];
  for (const author of authors) {
    const existing = await users.findOne({ $or: [{ _id: author._id }, emailOwnerFilter(author.email)] }, { projection: { email: 1, role: 1 } });
    if (!existing) newAuthors.push(author);
    else if (!existing._id.equals(author._id) || existing.email !== author.email || existing.role !== 'user') {
      throw new Error('An existing account conflicts with an example identity. Use a fresh development database.');
    }
  }
  const configuredPassword = process.env.EXAMPLE_DEMO_PASSWORD;
  const demoPassword = configuredPassword || randomBytes(18).toString('base64url');
  if (demoPassword.trim().length < 6 || Buffer.byteLength(demoPassword) > 72) throw new Error('EXAMPLE_DEMO_PASSWORD must contain at least six characters and at most 72 UTF-8 bytes.');
  for (const author of newAuthors) {
    const passwordHash = await bcrypt.hash(demoPassword, 12);
    await users.updateOne({ _id: author._id }, { $setOnInsert: { ...author, passwordHash } }, { upsert: true });
  }
  for (const [name, docs] of Object.entries(collections)) {
    if (name === 'users') continue;
    await database.collection(name).bulkWrite(docs.map(doc => ({ updateOne: {
      filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true,
    } })));
  }
  console.log(`Example data ready in ${database.databaseName}: ${collections.albums.length} albums, ${collections.songs.length} songs, ${collections.artists.length} artists, ${collections.reviews.length} reviews and comments.`);
  if (newAuthors.length) {
    console.log(`New example accounts: ${newAuthors.map(author => author.email).join(', ')}`);
    if (!configuredPassword) console.log(`Generated local demo password (shown once): ${demoPassword}`);
  }
}

try {
  await seed();
} catch (error) {
  console.error(`Could not load example data: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeMongo();
}
