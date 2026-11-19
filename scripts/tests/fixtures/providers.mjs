// Preload only in the isolated audit process. No real provider credentials or calls.
const originalFetch = globalThis.fetch;
let googleCode;
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.hostname === 'accounts.spotify.com') return json({ access_token: 'audit-private-spotify-token', expires_in: 3600 });
  if (url.hostname === 'api.spotify.com') {
    if (url.pathname.endsWith('/upstream-rate-limit')) return json({ error: { status: 429, message: 'fixture rate limit' } }, 429, { 'Retry-After': '17' });
    if (url.pathname.endsWith('/upstream-missing')) return json({ error: { status: 404, message: 'fixture missing item' } }, 404);
    if (url.pathname.includes('/artists/')) return json({ id: 'audit-artist', name: 'Audit Artist', genres: ['audit'], images: [], followers: { total: 0 }, popularity: 0, external_urls: {} });
    if (url.pathname.includes('/albums/')) return json({ id: 'audit-new-album', name: 'Audit New Album', release_date: '2026', images: [], artists: [{ id: 'audit-artist', name: 'Audit Artist' }], tracks: { items: [{ id: 'audit-new-track', name: 'Audit New Track', artists: [{ id: 'audit-artist', name: 'Audit Artist' }] }] } });
    return json({ id: 'audit-track', name: 'Audit Song', artists: [], album: { images: [] } });
  }
  if (url.hostname === 'oauth2.googleapis.com') {
    googleCode = new URLSearchParams(options.body).get('code');
    return json({ access_token: 'audit-private-google-token', refresh_token: 'audit-private-google-refresh', expires_in: 3600 });
  }
  if (url.hostname === 'www.googleapis.com') {
    if (googleCode === 'audit-missing-profile') return json({ error: 'fixture unavailable' }, 503);
    if (googleCode === 'audit-unused-profile') return json({ sub: 'audit-unused-google', email: 'unused-google@example.invalid', email_verified: true, given_name: 'Unused', family_name: 'Google' });
    if (googleCode === 'audit-other-unused-profile') return json({ sub: 'audit-other-google', email: 'other-google@example.invalid', email_verified: true, given_name: 'Other', family_name: 'Google' });
    if (googleCode === 'audit-local-email-profile') return json({ sub: 'audit-local-email-google', email: 'second@example.invalid', email_verified: true, given_name: 'Second', family_name: 'Google' });
    return json({ sub: 'audit-google', email: 'google-only@example.invalid', email_verified: googleCode !== 'audit-unverified-profile', given_name: 'Audit', family_name: 'Google' });
  }
  return originalFetch(input, options);
};
