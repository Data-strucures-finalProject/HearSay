import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { emitAuthChange } from '../utils/authBus';
import { GOOGLE_AUTH_FLOW_KEY } from '../utils/googleAuth';

const errors = {
  google_account_in_use: 'This Google account is already linked to another HearSay account. Your account has not changed.',
  google_already_linked: 'Your HearSay account already has a different Google account linked.',
  invalid_google_auth_state: 'Google authorization expired or could not be verified. Please try again.',
  google_link_session_changed: 'Your login changed during authorization. Please start linking again from Profile.',
  unauthorized: 'Please sign in again before linking Google.',
  unverified_google_email: 'Google could not verify this email address.',
};

export default function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode must not exchange the same one-time authorization code twice.
    if (started.current) return;
    started.current = true;
    (async () => {
      let flow;
      try {
        flow = JSON.parse(sessionStorage.getItem(GOOGLE_AUTH_FLOW_KEY) || 'null');
        const params = new URLSearchParams(window.location.search);
        if (params.get('error')) throw new Error('Google authorization was cancelled or denied.');
        const code = params.get('code');
        const state = params.get('state');
        if (!code || !flow?.verifier || !state || state !== flow.state) {
          throw new Error(errors.invalid_google_auth_state);
        }
        const response = await fetch('/api/auth/google/exchange', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code, state, code_verifier: flow.verifier,
            redirect_uri: import.meta.env.VITE_GOOGLE_REDIRECT_URI || window.location.origin + '/auth/callback',
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(errors[data.error] || 'Google authorization failed. Please try again.');
        try { localStorage.setItem('hs_user', JSON.stringify(data.user)); } catch { /* Optional UI cache. */ }
        emitAuthChange({ authenticated: true, user: data.user });
        navigate(flow.intent === 'link' ? '/profile' : '/', {
          replace: true, state: flow.intent === 'link' ? { googleLinkSuccess: true, reviewGoogleProfile: true } : null,
        });
      } catch (failure) {
        const message = failure.message || 'Google authorization failed. Please try again.';
        if (flow?.intent === 'link') navigate('/profile', { replace: true, state: { googleLinkError: message } });
        else setError(message);
      } finally {
        try { sessionStorage.removeItem(GOOGLE_AUTH_FLOW_KEY); } catch { /* Storage may be unavailable. */ }
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="p-6">
        {error ? <div role="alert" className="text-red-600">Authentication error: {error}</div> : <div>Completing Google authorization…</div>}
      </div>
    </div>
  );
}
