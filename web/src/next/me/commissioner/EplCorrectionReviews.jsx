// Loaded only from Menu > Commissioner tools > EPL stat corrections. Read-only; the server checks admin access again.
import { ArrowRight, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { eplApi } from '../../epl/api.js';
import { fmtFull, fmtNum, fmtSigned } from '../../format.js';
import { Button, Card, Skeleton } from '../../ui/index.js';
import { ToolHeading } from './ToolPresentation.jsx';

function Comparison({ label, before, after, change }) {
  return <div className="gx-cm-comparison"><div className="gx-cm-comparison-title"><h4 className="gx-t-strong">{label}</h4><span className="gx-cm-delta" aria-label={`${label} change ${fmtSigned(change)}`}>{fmtSigned(change)}</span></div>
    <div className="gx-cm-comparison-values"><dl><dt>Original</dt><dd>{fmtNum(before)}</dd></dl><ArrowRight size={18} aria-hidden="true"/><dl><dt>Recheck</dt><dd>{fmtNum(after)}</dd></dl></div>
    <span className="gx-sr-only">{fmtNum(before)} → {fmtNum(after)} ({fmtSigned(change)})</span>
  </div>;
}

export function EplCorrectionReviewsView({ data, loading = false, failed = false, denied = false, onRefresh }) {
  const id = useId();
  return <div className="gx-cm-stack gx-cm-corrections">
    <div className="gx-cm-intro"><ToolHeading icon={ShieldCheck}>Read-only review</ToolHeading><p className="gx-t-body gx-c-2">Sleeper stat corrections are shown beside their original captures. Existing picks and draft order are preserved.</p></div>
    {loading && !data ? <Skeleton label="Loading Premier League correction reviews…" shape="panels" count={2}/> : loading ? <p role="status" className="gx-t-body gx-cm-message">Refreshing Premier League correction reviews…</p> : null}
    {failed ? <p role="alert" className="gx-t-body gx-cm-message gx-cm-problem">{data ? 'Could not refresh. Showing the last loaded reviews.' : 'Premier League correction reviews could not load.'}</p> : null}
    {denied ? <p role="alert" className="gx-t-body gx-cm-message">Only the Community commissioner can view these corrections.</p> : null}
    {data?.available === false ? <p role="status" className="gx-t-body gx-cm-message">Premier League correction checks are not available yet.</p> : null}
    {data?.available && !data.reviews?.length ? <p role="status" className="gx-t-body gx-cm-message">No EPL stat corrections are awaiting review.</p> : null}
    {(!denied && data?.available ? data.reviews ?? [] : []).map(review => <Card as="section" className="gx-cm-stack gx-cm-correction" key={review.week} aria-labelledby={`${id}-mw${review.week}`}>
      <div className="gx-cm-heading"><span className="gx-cm-icon"><ClipboardCheck size={24} aria-hidden="true"/></span><h2 className="gx-t-strong" id={`${id}-mw${review.week}`}>MW{review.week} stat correction needs review</h2></div>
      <p className="gx-t-body gx-cm-preserved">{review.nextPickCount > 0
        ? `MW${review.nextWeek} has ${review.nextPickCount} recorded ${review.nextPickCount === 1 ? 'pick' : 'picks'}. Its stored picks and draft order are preserved.`
        : `MW${review.nextWeek} has no recorded picks. Review its order against the corrected totals before drafting.`}</p>
      {!review.totalsComplete ? <p role="status" className="gx-t-body gx-cm-message">Some source totals are unavailable. Missing values are shown as —.</p> : null}
      {review.changes.map(change => <section className="gx-cm-stack" key={change.name} aria-label={change.name}>
        <h3 className="gx-t-strong">{change.name}</h3>
        <Comparison label="Season points" before={change.before.points} after={change.after.points} change={change.pointsChange}/>
        <Comparison label="Points against" before={change.before.against} after={change.after.against} change={change.againstChange}/>
      </section>)}
      <details className="gx-cm-details"><summary>Source captures</summary><p className="gx-t-meta gx-c-2">Sleeper · original capture {fmtFull(review.original?.capturedAt)} · recheck {fmtFull(review.corrected?.capturedAt)}</p></details>
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
