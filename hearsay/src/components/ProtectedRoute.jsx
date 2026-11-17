import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children, requiredRole }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, authenticated: false });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Quick optimistic check using cached user to reduce flicker
        let cachedAuth = false;
        try {
          const u = localStorage.getItem('hs_user');
          if (u) cachedAuth = true;
        } catch { /* Storage is optional; authorization remains server-side. */ }
        if (!cancelled && cachedAuth && !requiredRole) setState({ loading: false, authenticated: true });

        const res = await fetch('/api/me', { credentials: 'include' });
        const data = await res.json().catch(() => ({ authenticated: false }));
        if (!cancelled) setState({ loading: false, authenticated: !!data.authenticated, role: data.user?.role });
      } catch {
        if (!cancelled) setState({ loading: false, authenticated: false });
      }
    })();
    return () => { cancelled = true; };
  }, [requiredRole]);

  if (state.loading) {
    return null; // or a small loader if desired
  }

  if (!state.authenticated) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (requiredRole && state.role !== requiredRole) return <Navigate to="/" replace />;
  return children;
}
