// Loaded only from Menu > Commissioner tools > EPL stat corrections. Read-only; the server checks admin access again.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { eplApi } from '../../epl/api.js';
import { fmtFull, fmtNum, fmtSigned } from '../../format.js';
import { Button, Card } from '../../ui/index.js';

export function EplCorrectionReviewsView({ data, loading = false, failed = false, denied = false, onRefresh }) {
  const id = useId();
  return <div className="gx-cm-stack">
    <p className="gx-t-body gx-c-2">Sleeper stat corrections are shown beside their original captures. Existing picks and draft order are preserved.</p>
    {loading ? <p role="status" className="gx-t-body">{data ? 'Refreshing EPL correction reviews…' : 'Loading EPL correction reviews…'}</p> : null}
    {failed ? <p role="alert" className="gx-t-body gx-cm-problem">{data ? 'Could not refresh. Showing the last loaded reviews.' : 'EPL correction reviews could not load.'}</p> : null}
    {denied ? <p role="alert" className="gx-t-body">Only the Community commissioner can view these corrections.</p> : null}
    {data?.available === false ? <p role="status" className="gx-t-body">EPL correction checks are not available yet.</p> : null}
    {data?.available && !data.reviews?.length ? <p role="status" className="gx-t-body">No EPL stat corrections are awaiting review.</p> : null}
    {(data?.available ? data.reviews ?? [] : []).map(review => <Card as="section" variant="wait" className="gx-cm-stack" key={review.week} aria-labelledby={`${id}-mw${review.week}`}>
      <h2 className="gx-t-strong" id={`${id}-mw${review.week}`}>MW{review.week} stat correction needs review</h2>
      <p className="gx-t-body">{review.nextPickCount > 0
        ? `MW${review.nextWeek} has ${review.nextPickCount} recorded ${review.nextPickCount === 1 ? 'pick' : 'picks'}. Its stored picks and draft order are preserved.`
        : `MW${review.nextWeek} has no recorded picks. Review its order against the corrected totals before drafting.`}</p>
      <p className="gx-t-meta gx-c-2">Sleeper · original capture {fmtFull(review.original?.capturedAt)} · recheck {fmtFull(review.corrected?.capturedAt)}</p>
      {!review.totalsComplete ? <p role="status" className="gx-t-body">Some source totals are unavailable. Missing values are shown as —.</p> : null}
      {review.changes.map(change => <div className="gx-cm-stack" key={change.name}>
        <h3 className="gx-t-strong">{change.name}</h3>
        <dl className="gx-cm-counts">
          <div><dt className="gx-t-label">Season points</dt><dd className="gx-t-body">{fmtNum(change.before.points)} → {fmtNum(change.after.points)} ({fmtSigned(change.pointsChange)})</dd></div>
          <div><dt className="gx-t-label">Points against</dt><dd className="gx-t-body">{fmtNum(change.before.against)} → {fmtNum(change.after.against)} ({fmtSigned(change.againstChange)})</dd></div>
        </dl>
      </div>)}
    </Card>)}
    <Button variant="secondary" onClick={onRefresh} disabled={loading}>Refresh reviews</Button>
  </div>;
}

export default function EplCorrectionReviews({ api = eplApi }) {
  const [read, setRead] = useState({ data: null, loading: true, failed: false, denied: false });
  const live = useRef(null);
  const load = useCallback(async () => {
    live.current?.abort();
    const controller = new AbortController(); live.current = controller;
    setRead(value => ({ ...value, loading: true, failed: false, denied: false }));
    try {
      const data = await api('admin/corrections/read', {}, { signal: controller.signal });
      if (live.current === controller && !controller.signal.aborted) setRead({ data, loading: false, failed: false, denied: false });
    } catch (error) {
      if (live.current === controller && !controller.signal.aborted) setRead(value => error?.status === 401 || error?.status === 403
        ? { data: null, loading: false, failed: false, denied: true } : { ...value, loading: false, failed: true, denied: false });
    }
  }, [api]);
  useEffect(() => { void load(); return () => { live.current?.abort(); }; }, [load]);
  return <EplCorrectionReviewsView {...read} onRefresh={load}/>;
}
