export const AUTH_EVENT = 'hs-auth-changed';

export function subscribeToAuthChange(callback) {
  return onAuthChange(callback);
}

export function emitAuthChange(detail = {}) {
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail }));
  } catch { /* A failing subscriber must not interrupt other auth updates. */ }
}

export function onAuthChange(handler) {
  const fn = (e) => {
    try { handler(e.detail); } catch { /* A failing subscriber must not interrupt other auth updates. */ }
  };
  window.addEventListener(AUTH_EVENT, fn);
  return () => window.removeEventListener(AUTH_EVENT, fn);
}
