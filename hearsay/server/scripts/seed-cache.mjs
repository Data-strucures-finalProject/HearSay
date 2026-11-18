// Temporary seed-process preload. Never enable this on the normal app server.
import { readFileSync } from 'node:fs';

if (process.env.NODE_ENV !== 'development' || !process.env.HEARSAY_SEED_CACHE || process.env.PORT !== '5186') {
  throw new Error('Seed cache requires an explicit development server on port 5186.');
}
const catalog = JSON.parse(readFileSync(process.env.HEARSAY_SEED_CACHE, 'utf8'));
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const response = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (url.hostname === 'accounts.spotify.com' && url.pathname === '/api/token') return response({ access_token: 'local-seed-cache', expires_in: 3600 });
  if (url.hostname !== 'api.spotify.com') return nativeFetch(input, options);
  const [, , kind, id] = url.pathname.split('/');
  const data = kind === 'albums' ? catalog.albums.find(a => a.id === id) : kind === 'artists' ? catalog.artists.find(a => a.id === id) : kind === 'tracks' ? catalog.tracks.find(t => t.id === id) : undefined;
  if (!data) throw new Error(`Unstaged Spotify request: ${url.pathname}`);
  return response(data);
};
