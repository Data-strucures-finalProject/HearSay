import { useEffect, useRef, useState } from 'react';

export default function GoogleProfileChoices({ profile, onUpdated, onClose }) {
  const [selection, setSelection] = useState({ firstname: false, lastname: false, email: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const heading = useRef(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);
  const fields = [['firstname', 'First name'], ['lastname', 'Last name'], ['email', 'Email']];
  return (
    <section id="google-profile-choices" aria-label="Choose Google profile details" className="m-6 border-2 border-black dark:border-white bg-white dark:bg-gray-900 p-4 text-black dark:text-white">
      <h2 ref={heading} tabIndex={-1} className="font-semibold mb-2 text-black dark:text-white"><span className="text-black dark:text-white">Use details from Google?</span></h2>
      <p className="text-sm mb-4">Choose each field separately. Unchecked fields stay unchanged. Both saved emails can use your local password.</p>
      <form onSubmit={async event => {
        event.preventDefault(); setSaving(true); setError(null);
        try {
          const response = await fetch('/api/profile/google-details', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selection) });
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error(data.error === 'email_in_use' ? 'That email is already used by another account.' : 'Unable to apply Google details. Please reload and try again.');
          onUpdated(data); onClose();
        } catch (failure) { setError(failure.message); } finally { setSaving(false); }
      }}>
        <div className="space-y-3">
          {fields.map(([field, label]) => (
            <label key={field} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" aria-label={`Replace ${label.toLowerCase()}`} checked={selection[field]} disabled={saving} onChange={event => setSelection(current => ({ ...current, [field]: event.target.checked }))} />
              <span className="min-w-0 break-words"><strong>{label}</strong>: {profile[field] || '(empty)'} → {profile.googleProfile[field] || '(empty)'}</span>
            </label>
          ))}
        </div>
        {error && <p role="alert" className="text-red-600 mt-3">{error}</p>}
        <div className="flex flex-wrap gap-3 mt-4">
          <button type="submit" disabled={saving || !Object.values(selection).some(Boolean)} className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-3 py-2 disabled:opacity-50">{saving ? 'Saving...' : 'Apply selected details'}</button>
          <button type="button" disabled={saving} onClick={onClose} className="border-2 border-black dark:border-white bg-white dark:bg-gray-900 text-black dark:text-white px-3 py-2">Keep current details</button>
        </div>
      </form>
    </section>
  );
}
