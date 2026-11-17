import { useEffect, useState } from 'react';

export default function AdminPage() {
  const [state, setState] = useState({ loading: true, error: null, counts: null });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/admin/overview', { credentials: 'include', cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(response.status === 403 ? 'Administrator access is required.' : 'Unable to load the admin overview.');
        if (!cancelled) setState({ loading: false, error: null, counts: data.counts });
      } catch (error) { if (!cancelled) setState({ loading: false, error: error.message, counts: null }); }
    })();
    return () => { cancelled = true; };
  }, []);
  return <main className="container mx-auto px-4 py-8 text-black dark:text-white">
    <h1 className="text-2xl font-bold mb-4 text-black dark:text-white"><span className="text-black dark:text-white">Admin</span></h1>
    <p className="mb-6">Administrator overview</p>
    {state.loading && <p role="status">Loading overview...</p>}
    {state.error && <p role="alert" className="text-red-600">{state.error}</p>}
    {state.counts && <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {Object.entries(state.counts).map(([name, count]) => <div key={name} className="border-2 border-black dark:border-white p-4"><dt className="capitalize">{name}</dt><dd className="text-2xl font-semibold">{count}</dd></div>)}
    </dl>}
  </main>;
}
