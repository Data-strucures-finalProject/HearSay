import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { insightPath } from '../../shared/insights';
import './Insights.css';

const descending = new Set(['createdAt', 'averageStars', 'starsAboveAverage', 'ratingCount', 'reviewsWritten', 'artistsInGenre', 'followers']);
const display = value => value === null || value === undefined || value === '' ? '—' : typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(value);

function cell(row, column) {
  const text = display(row[column.key]);
  let path;
  if (column.link === 'album' && row.spotifyAlbumId) path = `/album/${encodeURIComponent(row.spotifyAlbumId)}`;
  if (column.link === 'artist' && row.spotifyArtistId) path = `/artist/${encodeURIComponent(row.spotifyArtistId)}`;
  if (column.link === 'review' && row.reviewId) path = `/review/${encodeURIComponent(row.reviewId)}`;
  if (column.link === 'media' && row.spotifyId && ['song', 'album'].includes(row.mediaType)) path = `/${row.mediaType}/${encodeURIComponent(row.spotifyId)}`;
  const label = column.link === 'review' && (text === '—' || column.key === 'reviewId') ? 'Read review' : text;
  return path ? <Link to={path}>{label}</Link> : text;
}

function Chart({ spec, rows }) {
  const scale = spec.max ?? Math.max(1, ...rows.map(row => row.value));
  return <figure className="insights-chart">
    <figcaption>{spec.title} <span>(up to 10 matching results)</span></figcaption>
    <ol>{rows.map((row, index) => <li key={`${row.label}-${index}`}>
      <span className="chart-label">{row.label || 'Unknown'}</span>
      <span className="chart-track" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, row.value / scale * 100))}%` }} /></span>
      <strong>{display(row.value)}</strong>
    </li>)}</ol>
    {rows.length === 0 && <p>No chart data for these filters.</p>}
  </figure>;
}

export default function InsightsPanel({ spec }) {
  const fieldId = useId();
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState({ q: '', sort: spec.sort, direction: descending.has(spec.sort) ? 'desc' : 'asc', mediaType: '', status: '', offset: 0 });
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, data: null });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: null, data: null });
    const params = new URLSearchParams(Object.entries({ ...filters, limit: 20 }).filter(([, value]) => value !== ''));
    (async () => {
      try {
        const response = await fetch(`${insightPath(spec.id)}?${params}`, { credentials: 'include', signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !data.ok || !Array.isArray(data.items) || !Array.isArray(data.chart) || !Number.isSafeInteger(data.total)) throw new Error(response.status === 401 || response.status === 403 ? 'Administrator access is required.' : 'Unable to load these results. Please try again.');
        if (!controller.signal.aborted) setState({ loading: false, error: null, data });
      } catch (error) {
        if (!controller.signal.aborted) setState({ loading: false, error: error.message, data: null });
      }
    })();
    return () => controller.abort();
  }, [spec.id, filters, retry]);
  const change = (key, value) => setFilters(current => ({ ...current, [key]: value, offset: 0 }));
  const data = state.data;
  return <section className="insights-panel" aria-labelledby={`${fieldId}-title`}>
    <h2 id={`${fieldId}-title`}>{spec.title}</h2>
    <p>{spec.description}</p>
    <form className="insights-filters" onSubmit={event => { event.preventDefault(); change('q', draft.trim()); }}>
      <label htmlFor={`${fieldId}-search`}>Search these records
        <input id={`${fieldId}-search`} type="search" value={draft} onChange={event => setDraft(event.target.value)} maxLength={100} placeholder="Album, artist, reviewer…" />
      </label>
      {spec.id === 5 && <label>Media type<select aria-label="Media type" value={filters.mediaType} onChange={event => change('mediaType', event.target.value)}><option value="">All media</option><option value="album">Albums</option><option value="song">Songs</option></select></label>}
      {spec.id === 4 && <label>Relationship<select aria-label="Relationship" value={filters.status} onChange={event => change('status', event.target.value)}><option value="">All relationships</option><option value="matched">Matched</option><option value="user_without_review">Users without reviews</option><option value="review_without_user">Reviews without users</option></select></label>}
      <label>Sort by<select aria-label="Sort by" value={filters.sort} onChange={event => change('sort', event.target.value)}>{spec.columns.map(column => <option key={column.key} value={column.key}>{column.label}</option>)}</select></label>
      <label>Order<select aria-label="Order" value={filters.direction} onChange={event => change('direction', event.target.value)}><option value="asc">Ascending</option><option value="desc">Descending</option></select></label>
      <button type="submit">Search</button>
      <button type="button" onClick={() => { setDraft(''); setFilters({ q: '', sort: spec.sort, direction: descending.has(spec.sort) ? 'desc' : 'asc', mediaType: '', status: '', offset: 0 }); }}>Reset</button>
    </form>
    {state.loading && <p role="status">Loading results…</p>}
    {state.error && <div role="alert"><p>{state.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
    {data && <>
      <p role="status">{data.total === 0 ? 'No matching records. Try another filter, or return after more community activity.' : data.items.length === 0 ? 'No records on this page. Return to the previous page or reset filters.' : `${filters.offset + 1}–${filters.offset + data.items.length} of ${data.total} matching records`}</p>
      {spec.chart && <Chart spec={spec.chart} rows={data.chart} />}
      <div className="insights-table-scroll" role="region" aria-label={`${spec.title} table`} tabIndex={0}>
        <table><caption>{spec.title}</caption><thead><tr>{spec.columns.map(column => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead>
          <tbody>{data.items.map((row, index) => <tr key={row.reviewId ?? row.spotifyId ?? row.spotifyAlbumId ?? row.spotifyArtistId ?? row.userId ?? row.genre ?? index}>{spec.columns.map(column => <td key={column.key} className={typeof row[column.key] === 'number' ? 'insights-number' : undefined}>{cell(row, column)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="insights-pagination"><button type="button" disabled={filters.offset === 0} onClick={() => setFilters(current => ({ ...current, offset: Math.max(0, current.offset - 20) }))}>Previous</button><button type="button" disabled={data.nextOffset === null} onClick={() => setFilters(current => ({ ...current, offset: data.nextOffset }))}>Next</button></div>
    </>}
  </section>;
}
