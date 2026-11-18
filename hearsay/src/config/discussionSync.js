import { useEffect, useRef } from 'react';
import { getMyReview } from './reviews';

export function notifyReviewChange(type, oid) {
  window.dispatchEvent(new CustomEvent('hearsay-review-change', { detail: { type, oid, source: 'composer' } }));
}

export function useDiscussionSync(type, oid, update) {
  const callback = useRef(update);
  useEffect(() => { callback.current = update; });
  useEffect(() => {
    let active = true;
    const changed = async event => {
      if (event.detail?.source !== 'discussion' || event.detail.type !== type || event.detail.oid !== oid) return;
      try { const review = await getMyReview(type, oid); if (active) callback.current(review); } catch { /* Existing form remains available for retry. */ }
    };
    window.addEventListener('hearsay-review-change', changed);
    return () => { active = false; window.removeEventListener('hearsay-review-change', changed); };
  }, [type, oid]);
}
