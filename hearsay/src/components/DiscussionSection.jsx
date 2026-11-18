import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/auth';
import './DiscussionSection.css';

async function request(path, method = 'GET', body) {
  const response = await fetch(`/api/discussions${path}`, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const messages = { sign_in_required: 'Please sign in to participate.', not_your_review: 'You can only change your own entries.', comment_deleted: 'This comment has been deleted.', maximum_reply_depth: 'This thread has reached its reply limit.', review_not_found: 'This discussion is no longer available.' };
    throw new Error(messages[data?.error] || 'Unable to update the discussion. Please try again.');
  }
  return data;
}

function Editor({ initialText = '', initialRating, submitLabel, onSave, onCancel }) {
  const id = useId();
  const [text, setText] = useState(initialText);
  const [rating, setRating] = useState(initialRating || 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return <form className="discussion-editor" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave(text, rating); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }}>
    <label htmlFor={id}>{initialRating === undefined ? 'Your comment' : 'Your review'}</label>
    <textarea id={id} rows={3} maxLength={8000} required={initialRating === undefined || !rating} value={text} onChange={e => setText(e.target.value)} disabled={busy} />
    <small>{words}/1,000 words</small>
    {initialRating !== undefined && <label>Rating <select value={rating} onChange={e => setRating(Number(e.target.value))} disabled={busy}>{Array.from({ length: 11 }, (_, i) => <option key={i} value={i / 2}>{i ? `${i / 2} / 5` : 'No rating'}</option>)}</select></label>}
    {error && <p role="alert" className="discussion-error">{error}</p>}
    <div className="discussion-actions"><button type="submit" disabled={busy || words > 1000 || (!text.trim() && !rating)}>{busy ? 'Saving…' : submitLabel}</button><button type="button" disabled={busy} onClick={onCancel}>Cancel</button></div>
  </form>;
}

function Entry({ initial, user, onRemove, onMediaChange, level = 0, hideBody = false }) {
  const [entry, setEntry] = useState(initial);
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState([]);
  const [next, setNext] = useState(0);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const replyKey = useRef(null);
  const repliesId = useId();
  useEffect(() => { setEntry(initial); }, [initial]);
  const load = async (offset = 0) => {
    setLoading(true); setError('');
    try {
      const data = await request(`/${entry.id}/replies?offset=${offset}`);
      setChildren(old => offset ? [...old, ...data.items] : data.items);
      setNext(data.nextOffset); setLoaded(true);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  const mutate = async work => {
    setBusy(true); setError('');
    try { await work(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <article className="discussion-entry" data-entry-id={entry.id}>
    {!hideBody && <>
      <div className="discussion-meta"><strong>{entry.author}</strong>{entry.rating > 0 && <span>{entry.rating} / 5</span>}<time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleDateString()}</time></div>
      {editing ? <Editor initialText={entry.text} initialRating={entry.type === 'review' ? undefined : entry.rating} submitLabel="Save changes" onCancel={() => setEditing(false)} onSave={async (text, rating) => {
        const data = await request(`/${entry.id}`, 'PATCH', { text, rating }); setEntry(data.entry); setEditing(false); if (entry.type !== 'review') onMediaChange();
      }} /> : <p className="discussion-text">{entry.deleted ? '[Comment deleted]' : entry.text || 'Rating only'}</p>}
    </>}
    <div className="discussion-actions">
      {!entry.deleted && <>
        <button aria-label={`Like ${entry.type === 'review' ? 'comment' : 'review'}`} aria-pressed={entry.viewerVote === 1} disabled={!user || busy} onClick={() => mutate(async () => setEntry((await request(`/${entry.id}/vote`, 'PUT', { value: entry.viewerVote === 1 ? 0 : 1 })).entry))}>Like · {entry.likes}</button>
        <button aria-label={`Dislike ${entry.type === 'review' ? 'comment' : 'review'}`} aria-pressed={entry.viewerVote === -1} disabled={!user || busy} onClick={() => mutate(async () => setEntry((await request(`/${entry.id}/vote`, 'PUT', { value: entry.viewerVote === -1 ? 0 : -1 })).entry))}>Dislike · {entry.dislikes}</button>
        {user && <button onClick={() => { setReplying(!replying); replyKey.current ||= Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''); }}>Reply</button>}
        {entry.canEdit && !hideBody && <><button onClick={() => setEditing(!editing)}>Edit</button><button onClick={() => setConfirmDelete(true)}>Delete</button></>}
      </>}
      {entry.replyCount > 0 && <button aria-expanded={open} aria-controls={repliesId} onClick={() => { if (!open && !loaded) load(); setOpen(!open); }}>{open ? 'Hide' : 'Show'} replies ({entry.replyCount})</button>}
      {!hideBody && <Link to={`/review/${entry.id}`}>Permalink</Link>}
    </div>
    {confirmDelete && <div role="group" aria-label="Confirm deletion"><p>{entry.type === 'review' ? 'Delete this comment? Replies will remain.' : 'Delete this review and all its replies?'}</p><div className="discussion-actions"><button disabled={busy} onClick={() => mutate(async () => {
      await request(`/${entry.id}`, 'DELETE'); setConfirmDelete(false);
      if (entry.type === 'review') setEntry(old => ({ ...old, deleted: true, text: '', author: '[deleted]', canEdit: false, likes: 0, dislikes: 0, viewerVote: 0 }));
      else { onRemove(entry.id); onMediaChange(); }
    })}>Confirm delete</button><button disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button></div></div>}
    {error && <p role="alert" className="discussion-error">{error} {open && <button onClick={() => load()}>Retry loading replies</button>}</p>}
    {replying && <Editor submitLabel="Post reply" onCancel={() => setReplying(false)} onSave={async text => {
      await request(`/${entry.id}/replies`, 'POST', { text, clientRequestId: replyKey.current });
      replyKey.current = null; setReplying(false); setOpen(true); setEntry(old => ({ ...old, replyCount: old.replyCount + 1 })); await load();
    }} />}
    <div id={repliesId} hidden={!open} className={level < 3 ? 'discussion-children' : 'discussion-children-flat'}>
      {loading && <p role="status">Loading replies…</p>}
      {children.map(child => <Entry key={child.id} initial={child} user={user} onRemove={id => setChildren(old => old.filter(c => c.id !== id))} onMediaChange={onMediaChange} level={level + 1} />)}
      {loaded && next !== null && <button disabled={loading} onClick={() => load(next)}>More replies</button>}
    </div>
  </article>;
}

export default function DiscussionSection({ type, oid, reviewId }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState(null);
  const [sort, setSort] = useState('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async (offset = 0) => {
    const version = ++sequence.current; setLoading(true); setError('');
    try {
      const data = await request(reviewId ? `/${reviewId}` : `?type=${type}&oid=${encodeURIComponent(oid)}&sort=${sort}&offset=${offset}`);
      if (version !== sequence.current) return;
      if (reviewId) setItems(data.entry ? [data.entry] : []);
      else { setItems(old => offset ? [...old, ...(data.items || [])] : data.items || []); setTotal(data.total || 0); setNext(data.nextOffset ?? null); }
    } catch (e) { if (version === sequence.current) setError(e.message); } finally { if (version === sequence.current) setLoading(false); }
  }, [type, oid, reviewId, sort]);
  useEffect(() => {
    load(); const changed = () => load(); window.addEventListener('hearsay-review-change', changed);
    return () => { window.removeEventListener('hearsay-review-change', changed); };
  }, [load, user]);
  const mediaChanged = () => window.dispatchEvent(new CustomEvent('hearsay-review-change', { detail: { type, oid, source: 'discussion' } }));
  return <section className="discussion-section" aria-label="Reviews and discussion">
    <div className="discussion-heading"><h2>{reviewId ? 'Discussion' : `Reviews & discussion (${total})`}</h2>{!reviewId && <label>Sort <select value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="top">Most liked</option></select></label>}</div>
    {!user && <p><Link to="/auth">Sign in</Link> to review, vote or join the discussion.</p>}
    {user && !reviewId && <p className="discussion-help">Use the review form above to add your review. Reply below to discuss someone’s review.</p>}
    {error && <p role="alert" className="discussion-error">{error} <button onClick={() => load()}>Retry</button></p>}
    {loading && <p role="status">Loading discussion…</p>}
    {!loading && !error && !items.length && <p>No reviews yet. Be the first to share your thoughts.</p>}
    {items.map(entry => <Entry key={entry.id} initial={entry} user={user} onRemove={id => setItems(old => old.filter(e => e.id !== id))} onMediaChange={mediaChanged} hideBody={!!reviewId && entry.type !== 'review'} />)}
    {!reviewId && next !== null && <button disabled={loading} onClick={() => load(next)}>More reviews</button>}
  </section>;
}
