// Shared Google authorization entry point for sign-in and authenticated linking.
export const GOOGLE_AUTH_FLOW_KEY = 'google_auth_flow';

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startGoogleAuth(intent = 'signin') {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Google sign-in is not configured.');
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const response = await fetch('/api/auth/google/start', {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent, code_challenge: challenge }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(response.status === 401 ? 'Please sign in again before linking Google.' : 'Unable to start Google authorization. Please try again.');
  sessionStorage.setItem(GOOGLE_AUTH_FLOW_KEY, JSON.stringify({ verifier, state: data.state, intent }));
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/auth/callback`,
    response_type: 'code', scope: 'openid profile email', access_type: 'offline',
    include_granted_scopes: 'true', code_challenge: challenge, code_challenge_method: 'S256',
    state: data.state, prompt: 'select_account',
  });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
