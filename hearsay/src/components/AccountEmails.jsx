import { useState } from 'react';

const messages = {
  primary_email: 'Choose another primary email before removing this address.',
  last_email: 'Keep at least one email address.',
  last_login_method: 'Create a local password before disconnecting Google.',
  profile_changed: 'Your profile changed. Reload before trying again.',
};

export default function AccountEmails({ profile, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function change(address, remove) {
    const disconnectsGoogle = remove && profile.googleProfile?.email === address;
    if (remove && !window.confirm(disconnectsGoogle ? 'Remove this email and disconnect Google sign-in? Your local password will still work with the remaining email.' : 'Remove this email from your account? It will no longer work for password login.')) return;
    setBusy(true); setError(null);
    try {
      const response = await fetch(remove ? '/api/profile/emails' : '/api/profile/emails/primary', { method: remove ? 'DELETE' : 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: address }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(messages[data.error] || 'Unable to update emails. Reload and try again.');
      onUpdated(data);
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  return (
    <section aria-label="Account email addresses" className="p-6 border-t-2 border-black dark:border-white text-black dark:text-white">
      <h2 className="font-semibold mb-2 text-black dark:text-white"><span className="text-black dark:text-white">Email addresses</span></h2>
      <p className="text-sm mb-3">Saved addresses work with your local password, if one is set. Removing the Google email also disconnects Google sign-in. Choose another primary email before removing the current one.</p>
      <ul className="space-y-3">
        {(profile.loginEmails || [profile.email]).map(address => (
          <li key={address} className="flex flex-wrap items-center gap-2">
            <span className="break-all flex-1">{address} {address === profile.email && <strong>(Primary)</strong>} {address === profile.googleProfile?.email && <span>(Google)</span>}</span>
            {address !== profile.email && <button type="button" disabled={busy} onClick={() => change(address, false)} aria-label={`Make ${address} primary`} className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-2 py-1">Make primary</button>}
            <button type="button" disabled={busy || address === profile.email} onClick={() => change(address, true)} aria-label={`Remove ${address}`} className="border-2 border-red-600 px-2 py-1 text-red-600 disabled:opacity-40">Remove</button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-red-600">{error}</p>}
    </section>
  );
}
