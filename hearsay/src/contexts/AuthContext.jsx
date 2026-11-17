import { useState, useEffect } from 'react';
import { subscribeToAuthChange } from '../utils/authBus';
import { AuthContext } from './auth';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check initial auth state on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setUser(data.user);
            // Cache for offline UI convenience
            try {
              localStorage.setItem('hs_user', JSON.stringify(data.user));
            } catch { /* Storage is optional; authorization remains server-side. */ }
          } else {
            setUser(null);
            try {
              localStorage.removeItem('hs_user');
            } catch { /* Storage is optional; authorization remains server-side. */ }
          }
        }
      } catch (e) {
        console.error('Failed to check auth state:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Listen to auth bus events (login/logout)
  useEffect(() => {
    const unsubscribe = subscribeToAuthChange((event) => {
      if (event.authenticated) {
        setUser(event.user);
      } else {
        setUser(null);
        try {
          localStorage.removeItem('hs_user');
        } catch { /* Storage is optional; authorization remains server-side. */ }
      }
    });
    return unsubscribe;
  }, []);

  const logout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      setUser(null);
      try {
        localStorage.removeItem('hs_user');
      } catch { /* Storage is optional; authorization remains server-side. */ }
    } catch (e) {
      console.error('Logout failed:', e);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
