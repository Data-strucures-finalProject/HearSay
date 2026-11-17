import { useState } from 'react';

export default function AccountDataActions({ onDeleted }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  async function download(format) {
    setBusy(format); setError(null);
    try {
      const response = await fetch(`/api/profile/export.${format}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Unable to export your data. Please try again.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = `hearsay-account-data.${format}`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) { setError(failure.message); } finally { setBusy(null); }
  }
  async function removeAccount() {
    if (!window.confirm('Permanently delete your HearSay account and ALL associated profile information, saved emails, reviews and ratings? You will be signed out on all devices. This cannot be undone. Export your data first if you want a copy.')) return;
    setBusy('delete'); setError(null);
    try {
      const response = await fetch('/api/profile', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation: 'DELETE' }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error('Deletion could not finish. Please try Delete account again to complete it.');
      onDeleted();
    } catch (failure) { setError(failure.message); } finally { setBusy(null); }
  }
  return <section aria-label="Account data and deletion" className="p-6 border-t-2 border-black dark:border-white text-black dark:text-white">
    <h2 className="font-semibold mb-2 text-black dark:text-white"><span className="text-black dark:text-white">Your account data</span></h2>
    <p className="text-sm mb-3">Download your account information, reviews and ratings. Passwords and sign-in tokens are excluded.</p>
    <div className="flex flex-wrap gap-3">
      {['csv', 'pdf'].map(format => <button key={format} type="button" disabled={Boolean(busy)} onClick={() => download(format)} className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-3 py-2 disabled:opacity-50">{busy === format ? 'Exporting...' : `Export account data (${format.toUpperCase()})`}</button>)}
    </div>
    <div className="mt-6">
      <p className="text-sm mb-3">Deleting your account permanently removes your profile, saved emails, reviews and ratings. This cannot be undone.</p>
      <button type="button" disabled={Boolean(busy)} onClick={removeAccount} className="border-2 border-red-600 bg-white dark:bg-gray-900 text-red-600 px-3 py-2 disabled:opacity-50">{busy === 'delete' ? 'Deleting...' : 'Delete account'}</button>
    </div>
    {error && <p role="alert" className="mt-3 text-red-600">{error}</p>}
  </section>;
}
