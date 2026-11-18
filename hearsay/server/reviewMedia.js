import { ObjectId } from 'mongodb';

async function related(database, collection, key, reference) {
  if (!reference) return null;
  const internalId = typeof reference.oid === 'string' && /^[a-f\d]{24}$/i.test(reference.oid) ? new ObjectId(reference.oid) : null;
  const id = reference[key] || (!internalId && reference.oid);
  const item = id ? await database.collection(collection).findOne({ [key]: id }) : internalId ? await database.collection(collection).findOne({ _id: internalId }) : null;
  const spotifyId = item?.[key] || id;
  const name = item?.name || reference.name;
  return name ? { name, route: spotifyId ? `/${collection === 'artists' ? 'artist' : 'album'}/${encodeURIComponent(spotifyId)}` : null } : null;
}

// Cached relationships use internal IDs; public navigation always uses Spotify IDs.
export async function getReviewMedia(database, spotify, type, id) {
  const config = { song: ['songs', 'spotifyTrackID'], album: ['albums', 'spotifyAlbumId'], artist: ['artists', 'spotifyArtistId'] }[type];
  if (!config || !id) return null;
  const local = await database.collection(config[0]).findOne({ [config[1]]: id });
  if (local) {
    const artist = type !== 'artist' ? await related(database, 'artists', 'spotifyArtistId', local.artist) : null;
    const album = type === 'song' ? await related(database, 'albums', 'spotifyAlbumId', local.album) : null;
    return { title: local.title || local.name, coverArt: local.image || '', route: `/${type}/${encodeURIComponent(id)}`, artists: artist ? [artist] : [], album };
  }
  const response = await (type === 'song' ? spotify.getTrack(id) : type === 'album' ? spotify.getAlbum(id) : spotify.getArtist(id));
  const item = response?.data;
  if (!item) return null;
  return {
    title: item.name,
    coverArt: (type === 'song' ? item.album?.images : item.images)?.[0]?.url || '',
    route: `/${type}/${encodeURIComponent(item.id || id)}`,
    artists: type === 'artist' ? [] : (item.artists || []).map(artist => ({ name: artist.name, route: artist.id ? `/artist/${encodeURIComponent(artist.id)}` : null })),
    album: type === 'song' && item.album ? { name: item.album.name, route: item.album.id ? `/album/${encodeURIComponent(item.album.id)}` : null } : null,
  };
}
