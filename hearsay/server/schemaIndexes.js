export const MEDIA_INDEXES = [
  { collection: 'albums', field: 'spotifyAlbumId', name: 'uniq_spotify_album' },
  { collection: 'songs', field: 'spotifyTrackID', name: 'uniq_spotify_track' },
  { collection: 'artists', field: 'spotifyArtistId', name: 'uniq_spotify_artist' },
];

export async function ensureMediaIndexes(database) {
  for (const index of MEDIA_INDEXES) await database.collection(index.collection).createIndex({ [index.field]: 1 }, { unique: true, name: index.name });
}
