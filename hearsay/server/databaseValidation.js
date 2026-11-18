// Read-only consistency checks. Reports counts, never account fields or review text.
import { collectionSchemas, loadValidator } from './scripts/apply-schemas.mjs';
import { MEDIA_INDEXES } from './schemaIndexes.js';

const stable = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
});

export async function validateDatabase(database) {
  const array = value => Array.isArray(value) ? value : [];
  const names = Object.keys(collectionSchemas);
  const issues = {};
  const flag = name => { issues[name] = (issues[name] || 0) + 1; };
  const schemaViolations = {};
  for (const name of names) {
    const collection = (await database.listCollections({ name }).toArray())[0];
    if (!collection) { flag('missing_collection'); continue; }
    const validator = collection.options?.validator;
    if (!validator || !Object.keys(validator).length) flag('missing_validator');
    const canonical = await loadValidator(collectionSchemas[name]);
    if (stable(validator) !== stable(canonical)) flag('validator_drift');
    if (collection.options.validationLevel !== 'strict' || collection.options.validationAction !== 'error') flag('validation_enforcement');
    schemaViolations[name] = await database.collection(name).countDocuments({ $nor: [canonical] });
    if (schemaViolations[name]) issues.schema_violations = (issues.schema_violations || 0) + schemaViolations[name];
  }
  const users = await database.collection('users').find({}, { projection: { _id: 1, reviewIds: 1 } }).toArray();
  for (const expected of MEDIA_INDEXES) {
    if (!await database.listCollections({ name: expected.collection }).hasNext()) continue;
    const indexes = await database.collection(expected.collection).indexes();
    if (!indexes.some(index => index.name === expected.name && index.unique === true && index.key?.[expected.field] === 1)) flag('missing_identity_index');
  }
  const reviews = await database.collection('reviews').find().toArray();
  const userMap = new Map(users.map(user => [String(user._id), user]));
  const reviewMap = new Map(reviews.map(review => [String(review._id), review]));
  const mediaTypes = new Map([['album', ['albums', 'spotifyAlbumId']], ['song', ['songs', 'spotifyTrackID']], ['artist', ['artists', 'spotifyArtistId']]]);
  const media = new Map();
  const mediaByInternalId = new Map();
  const counts = { users: users.length, reviewDocuments: reviews.length, mediaReviews: 0, comments: 0, deletedComments: 0 };
  for (const [type, [name, key]] of mediaTypes) {
    const items = await database.collection(name).find().toArray();
    counts[name] = items.length;
    media.set(type, new Map(items.map(item => [item[key], item])));
    mediaByInternalId.set(type, new Map(items.map(item => [String(item._id), item])));
    for (const item of items) for (const ref of array(item.reviews)) {
      const review = reviewMap.get(String(ref?.review_oid));
      if (!review || review.item?.type !== type || review.item.oid !== item[key] || String(review.user?.oid) !== String(ref?.user_oid)) flag('media_review_reference');
    }
  }
  const checkMediaReference = (type, reference) => {
    if (!reference?.oid) return; // Provider failures may leave an unresolved cache placeholder.
    const item = mediaByInternalId.get(type).get(reference.oid) || media.get(type).get(reference.oid);
    const key = mediaTypes.get(type)[1];
    if (!item || (reference[key] && reference[key] !== item[key])) flag(`related_${type}_reference`);
  };
  for (const album of media.get('album').values()) {
    checkMediaReference('artist', album.artist);
    for (const song of array(album.songs)) checkMediaReference('song', song);
  }
  for (const song of media.get('song').values()) {
    checkMediaReference('artist', song.artist); checkMediaReference('album', song.album);
  }
  for (const artist of media.get('artist').values()) {
    for (const album of array(artist.albums)) checkMediaReference('album', album);
    for (const song of array(artist.songs)) checkMediaReference('song', song);
  }
  for (const user of users) {
    const ids = array(user.reviewIds).map(String);
    if (new Set(ids).size !== ids.length) flag('duplicate_user_reference');
    for (const id of ids) {
      const review = reviewMap.get(id);
      if (!review || review.deleted || String(review.user?.oid) !== String(user._id)) flag('user_review_reference');
    }
  }
  for (const review of reviews) {
    const id = String(review._id), type = review.item?.type;
    const owner = userMap.get(String(review.user?.oid));
    if (review.threadDeleting) flag('incomplete_thread_deletion');
    if (!review.deleted && (!owner || !array(owner.reviewIds).some(ref => String(ref) === id))) flag('review_author_reference');
    const children = array(review.comments);
    if (new Set(children.map(ref => ref?.oid)).size !== children.length) flag('duplicate_child_reference');
    for (const ref of children) {
      const child = reviewMap.get(ref?.oid);
      if (Object.keys(ref || {}).some(key => key !== 'oid')) flag('embedded_comment');
      if (!child || child.item?.type !== 'review' || child.item.oid !== id) flag('child_reference');
    }
    if (type === 'review') {
      counts.comments++;
      const parent = reviewMap.get(review.item.oid), root = reviewMap.get(review.threadRoot);
      const expectedRoot = parent?.item?.type === 'review' ? parent.threadRoot : parent && String(parent._id);
      const parentLinked = array(parent?.comments).some(ref => ref?.oid === id);
      if (!parent || !root || !mediaTypes.has(root.item?.type) || !parentLinked || expectedRoot !== review.threadRoot || review.depth !== (parent.depth || 0) + 1) flag('comment_thread_reference');
      if (review.rating !== 0) flag('comment_rating');
      if (review.deleted) {
        counts.deletedComments++;
        if (review.text || review.user?.oid || array(review.votes).length || review.likes || review.dislikes) flag('deleted_comment_content');
      }
    } else if (mediaTypes.has(type)) {
      counts.mediaReviews++;
      const item = media.get(type).get(review.item.oid);
      if (!item || !array(item.reviews).some(ref => String(ref?.review_oid) === id && String(ref?.user_oid) === String(review.user?.oid))) flag('review_media_reference');
    } else flag('invalid_review_item_type');
    const votes = array(review.votes);
    if (new Set(votes.map(vote => vote?.userOid)).size !== votes.length) flag('duplicate_vote');
    if (votes.some(vote => !userMap.has(vote?.userOid) || ![1, -1].includes(vote?.value))) flag('invalid_vote');
    if ((review.likes || 0) !== votes.filter(vote => vote?.value === 1).length || (review.dislikes || 0) !== votes.filter(vote => vote?.value === -1).length) flag('vote_counts');
  }
  return { ok: Object.keys(issues).length === 0, database: database.databaseName, counts, schemaViolations, issues };
}
