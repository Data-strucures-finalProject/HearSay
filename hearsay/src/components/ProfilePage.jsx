import { useEffect, useState } from 'react';
import Avatar from './Avatar';
import { useNavigate, useLocation } from 'react-router-dom';
import { emitAuthChange } from '../utils/authBus';
import { startGoogleAuth } from '../utils/googleAuth';
import GoogleProfileChoices from './GoogleProfileChoices';
import AccountEmails from './AccountEmails';
import AccountDataActions from './AccountDataActions';

export default function ProfilePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [reviewGoogleDetails, setReviewGoogleDetails] = useState(Boolean(location.state?.reviewGoogleProfile || location.state?.googleLinkSuccess));
  const [googleLinkError, setGoogleLinkError] = useState(location.state?.googleLinkError || null);
  const [linkingGoogle, setLinkingGoogle] = useState(false);
  const [state, setState] = useState({ loading: true, error: null, profile: null });
  const [edit, setEdit] = useState({ firstname: '', lastname: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // Local account linking state (creating a password for Google-only users)
  const [linkingLocal, setLinkingLocal] = useState(false);
  const [localPw1, setLocalPw1] = useState('');
  const [localPw2, setLocalPw2] = useState('');
  const [localLinkLoading, setLocalLinkLoading] = useState(false);
  const [localLinkError, setLocalLinkError] = useState(null);
  const [localLinkSuccess, setLocalLinkSuccess] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile', { credentials: 'include' });
        const data = await res.json();
        if (!cancelled) {
          if (!res.ok || !data?.ok) {
            setState({ loading: false, error: data?.error || 'Failed to load profile', profile: null });
          } else {
            setState({ loading: false, error: null, profile: data.profile });
            setEdit({ firstname: data.profile.firstname || '', lastname: data.profile.lastname || '' });
          }
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: String(e), profile: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    if (logoutLoading) return;
    if (!confirm('Log out now?')) return;
    setLogoutLoading(true);
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.warn('Logout request failed', e);
    } finally {
      try { localStorage.removeItem('hs_user'); } catch { /* Storage is optional; authorization remains server-side. */ }
      emitAuthChange({ authenticated: false });
      setLogoutLoading(false);
      navigate('/');
    }
  };

  if (state.loading) {
    return (
      <main className="container mx-auto px-4 py-8" aria-label="Profile loading">
        <div className="animate-pulse h-32 bg-gray-200 dark:bg-gray-800" />
      </main>
    );
  }

  if (state.error) {
    return (
      <main className="container mx-auto px-4 py-8">
        <div role="alert" className="text-red-600 dark:text-red-400">{state.error}</div>
      </main>
    );
  }

  const p = state.profile || {};
  const googleConnected = (p.accounts || []).some(account => account.kind === 'Google');
  const displayName = [p.firstname, p.lastname].filter(Boolean).join(' ') || p.name || p.email || 'Your Profile';
  let cachedUserPicture;
  try {
    const u = localStorage.getItem('hs_user');
    if (u) cachedUserPicture = JSON.parse(u)?.picture;
  } catch { /* Storage is optional; authorization remains server-side. */ }
  const pictureSrc = p.picture || cachedUserPicture;
  const applyAccountUpdate = data => {
    setState(current => ({ ...current, profile: data.profile }));
    setEdit({ firstname: data.profile.firstname || '', lastname: data.profile.lastname || '' });
    try { localStorage.setItem('hs_user', JSON.stringify(data.user)); } catch { /* Optional UI cache. */ }
    emitAuthChange({ authenticated: true, user: data.user });
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="max-w-2xl mx-auto border-2 border-black dark:border-white bg-white dark:bg-gray-900">
        <div className="p-6 border-b-2 border-black dark:border-white flex items-center gap-4">
          <Avatar src={pictureSrc} name={displayName} size={64} />
          <div className="min-w-0 break-words">
            <h1 className="text-2xl font-bold text-black dark:text-white"><span className="text-black dark:text-white">{displayName}</span></h1>
            {p.email && <div className="break-all text-gray-700 dark:text-gray-300">{p.email}</div>}
          </div>
        </div>

        {googleConnected && reviewGoogleDetails && p.googleProfile && <GoogleProfileChoices profile={p} onUpdated={applyAccountUpdate} onClose={() => setReviewGoogleDetails(false)} />}
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border-2 border-black dark:border-white p-4">
            <h2 className="font-semibold text-black dark:text-white mb-2"><span className="text-black dark:text-white">Basic Info</span></h2>
            {!isEditing && (
              <div className="space-y-2">
                <div className="flex justify-between text-black dark:text-white"><span className="text-gray-600 dark:text-gray-400">First Name</span><span>{p.firstname || '-'}</span></div>
                <div className="flex justify-between text-black dark:text-white"><span className="text-gray-600 dark:text-gray-400">Last Name</span><span>{p.lastname || '-'}</span></div>
                <div className="flex justify-between text-black dark:text-white"><span className="text-gray-600 dark:text-gray-400">Email</span><span>{p.email || '-'}</span></div>
                {saveSuccess && <div className="text-green-600 text-sm">Profile updated.</div>}
                <div className="flex gap-3">
                  <button
                    onClick={() => { setIsEditing(true); setSaveError(null); setSaveSuccess(false); setEdit({ firstname: p.firstname || '', lastname: p.lastname || '' }); }}
                    className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Edit Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    disabled={logoutLoading}
                    className="border-2 border-red-600 text-red-700 dark:text-red-400 dark:border-red-500 bg-white dark:bg-gray-900 px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    {logoutLoading ? 'Logging out…' : 'Logout'}
                  </button>
                </div>
              </div>
            )}
            {isEditing && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaveError(null);
                  setSaveSuccess(false);
                  setSaving(true);
                  try {
                    const resp = await fetch('/api/profile/update', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ firstname: edit.firstname, lastname: edit.lastname })
                    });
                    const data = await resp.json().catch(() => ({}));
                    if (!resp.ok || !data.ok) {
                      setSaveError(data.error || 'Update failed');
                    } else {
                      applyAccountUpdate(data);
                      setSaveSuccess(true);
                      setIsEditing(false);
                    }
                  } catch {
                    setSaveError('Network error');
                  } finally {
                    setSaving(false);
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm mb-1 text-gray-600 dark:text-gray-400">First Name</label>
                  <input
                    type="text"
                    value={edit.firstname}
                    onChange={(e) => setEdit(v => ({ ...v, firstname: e.target.value }))}
                    className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-800 text-black dark:text-white px-3 py-2"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-600 dark:text-gray-400">Last Name</label>
                  <input
                    type="text"
                    value={edit.lastname}
                    onChange={(e) => setEdit(v => ({ ...v, lastname: e.target.value }))}
                    className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-800 text-black dark:text-white px-3 py-2"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-gray-600 dark:text-gray-400">Email</label>
                  <input
                    type="text"
                    value={p.email || ''}
                    readOnly
                    className="w-full border-2 border-black dark:border-white bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-2"
                  />
                </div>
                {saveError && <div className="text-red-600 text-sm">{saveError}</div>}
                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsEditing(false); setSaveError(null); setEdit({ firstname: p.firstname || '', lastname: p.lastname || '' }); }}
                    className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="border-2 border-black dark:border-white p-4">
            <h2 className="font-semibold text-black dark:text-white mb-2"><span className="text-black dark:text-white">Connected Accounts</span></h2>
            <ul className="list-disc pl-5 text-black dark:text-white">
              {(p.accounts || []).length ? (
                (p.accounts || []).map((a, idx) => (
                  <li key={idx}>{a.kind}</li>
                ))
              ) : (
                <li className="text-gray-600 dark:text-gray-400">None</li>
              )}
            </ul>
            {googleLinkError && <p role="alert" className="mt-4 text-red-600">{googleLinkError}</p>}
            {location.state?.googleLinkSuccess && (p.accounts || []).some(a => a.kind === 'Google') && <p role="status" className="mt-4 text-green-600">Google account linked.</p>}
            {googleConnected && <div className="mt-4 text-black dark:text-white">
              <p className="text-sm mb-2">Copy your Google first name, last name or email into your profile. You choose which details to replace.</p>
              <button type="button" disabled={linkingGoogle} aria-expanded={reviewGoogleDetails && Boolean(p.googleProfile)} aria-controls="google-profile-choices" className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" onClick={async () => {
              if (p.googleProfile) { setReviewGoogleDetails(true); return; }
              setLinkingGoogle(true); setGoogleLinkError(null);
              try { await startGoogleAuth('link'); } catch (failure) { setGoogleLinkError(failure.message); setLinkingGoogle(false); }
            }}>{linkingGoogle ? 'Opening Google...' : 'Use Google profile details'}</button>
            </div>}
            {!(p.accounts || []).some(a => a.kind === 'Google') && (
              <button
                disabled={linkingGoogle}
                onClick={async () => {
                  setGoogleLinkError(null);
                  setLinkingGoogle(true);
                  try {
                    await startGoogleAuth('link');
                  } catch (error) {
                    setGoogleLinkError(error.message || 'Unable to link Google. Please try again.');
                    setLinkingGoogle(false);
                  }
                }}
                className="mt-4 border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                {linkingGoogle ? 'Opening Google...' : 'Link Google Account'}
              </button>
            )}
            {!(p.accounts || []).some(a => a.kind === 'Local') && (
              <div className="mt-6">
                {!linkingLocal && !localLinkSuccess && (
                  <button
                    onClick={() => { setLinkingLocal(true); setLocalLinkError(null); setLocalPw1(''); setLocalPw2(''); }}
                    className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Create Local Password
                  </button>
                )}
                {linkingLocal && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setLocalLinkError(null);
                      setLocalLinkSuccess(false);
                      if (localPw1.length < 6) { setLocalLinkError('Password must be at least 6 characters.'); return; }
                      if (localPw1 !== localPw2) { setLocalLinkError('Passwords do not match.'); return; }
                      setLocalLinkLoading(true);
                      try {
                        const resp = await fetch('/api/auth/local/set-password', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ password: localPw1 })
                        });
                        const data = await resp.json().catch(() => ({}));
                        if (!resp.ok || !data.ok) {
                          setLocalLinkError(data.error || 'Failed to link local account');
                        } else {
                          // Update profile state to include Local account
                          setState(s => ({ ...s, profile: { ...s.profile, accounts: [...(s.profile.accounts || []), { kind: 'Local' }] } }));
                          setLocalLinkSuccess(true);
                          setLinkingLocal(false);
                        }
                      } catch {
                        setLocalLinkError('Network error');
                      } finally {
                        setLocalLinkLoading(false);
                      }
                    }}
                    className="space-y-3"
                  >
                    <div>
                      <label className="block text-sm mb-1 text-gray-600 dark:text-gray-400">New Password</label>
                      <input
                        type="password"
                        value={localPw1}
                        onChange={(e) => setLocalPw1(e.target.value)}
                        className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-800 text-black dark:text-white px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1 text-gray-600 dark:text-gray-400">Confirm Password</label>
                      <input
                        type="password"
                        value={localPw2}
                        onChange={(e) => setLocalPw2(e.target.value)}
                        className="w-full border-2 border-black dark:border-white bg-white dark:bg-gray-800 text-black dark:text-white px-3 py-2"
                      />
                    </div>
                    {localLinkError && <div className="text-red-600 text-sm">{localLinkError}</div>}
                    <div className="flex gap-3">
                      <button
                        type="submit"
                        disabled={localLinkLoading}
                        className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        {localLinkLoading ? 'Linking...' : 'Save Password'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setLinkingLocal(false); setLocalLinkError(null); }}
                        className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                {localLinkSuccess && (
                  <div className="text-green-600 text-sm mt-2">Local account linked.</div>
                )}
              </div>
            )}
          </div>
        </div>
        <AccountEmails profile={p} onUpdated={applyAccountUpdate} />
        <AccountDataActions onDeleted={() => {
          try { localStorage.removeItem('hs_user'); } catch { /* Optional UI cache. */ }
          emitAuthChange({ authenticated: false });
          navigate('/auth', { replace: true });
        }} />
      </div>
    </main>
  );
}
