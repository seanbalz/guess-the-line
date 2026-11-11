// Loaded only from Menu > Commissioner tools > Premier League stat corrections. Read-only; the server checks admin access again.
import { ArrowRight, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { eplApi } from '../../epl/api.js';
import { fmtFull, fmtNum, fmtSigned } from '../../format.js';
import { Button, Card, Skeleton } from '../../ui/index.js';
import { inlineTool, ToolHeading } from './ToolPresentation.jsx';

function Comparison({ label, before, after, change }) {
  return <div className="gx-cm-comparison"><div className="gx-cm-comparison-title"><h4 className="gx-t-strong">{label}</h4><span className="gx-cm-delta" aria-label={`${label} change ${fmtSigned(change)}`}>{fmtSigned(change)}</span></div>
    <div className="gx-cm-comparison-values"><dl><dt>Original</dt><dd>{fmtNum(before)}</dd></dl><ArrowRight size={18} aria-hidden="true"/><dl><dt>Recheck</dt><dd>{fmtNum(after)}</dd></dl></div>
    <span className="gx-sr-only">{fmtNum(before)} → {fmtNum(after)} ({fmtSigned(change)})</span>
  </div>;
}

// D-83 (import wins): the next week's current order beside the order Tuesday's corrected totals would have set. Names only.
// The column says "Current", never that the import set it: after a pending_results import, settle opened the week.
const named = name => name ?? '—';
function OrderLists({ week, lists }) {
  return <section className="gx-cm-comparison" aria-label={`MW${week} pick order`}>
    <h3 className="gx-t-strong">MW{week} pick order</h3>
    <dl className={lists.length === 1 ? 'gx-cm-orders gx-cm-orders-one' : 'gx-cm-orders'}>
      {lists.map(([label, order]) => <div key={label}><dt>{label}</dt><dd><ol>{order.map((name, i) => <li key={i}>{named(name)}</li>)}</ol></dd></div>)}
    </dl>
  </section>;
}
function picksText(review) {
  return `MW${review.nextWeek} has ${review.nextPickCount} recorded ${review.nextPickCount === 1 ? 'pick' : 'picks'}. Its stored picks and draft order are preserved.`;
}
// A confirmed import kept the order at the recheck; gtl-api compares the live order with it (orderState):
// kept (still that order), adopted (a later import set Tuesday's order) or changed (neither).
const ORDER_STATES = ['kept', 'adopted', 'changed'];
function importedOrder(review) {
  const next = `MW${review.nextWeek}`, now = named(review.currentOrder[0]), tuesday = named(review.candidateOrder[0]);
  const current = [`Current ${next} order`, review.currentOrder], totals = ['Tuesday’s totals', review.candidateOrder];
  const picks = review.nextPickCount > 0 ? picksText(review) : null;
  // M-43 applies a correction import only to an open draft with no pick, before its first kickoff.
  const use = picks ?? `To use Tuesday’s totals, add a new Sleeper Matchups screenshot in Premier League weekly scores and record it as a correction while the ${next} draft is open, before its first pick or kickoff.`;
  if (review.orderState === 'adopted') return { lead: `An import after Tuesday’s recheck set the order Tuesday’s totals give. ${next} now has ${now} first. Nothing else is needed.`, lists: [current], next: picks };
  if (review.orderState === 'changed') return { lead: `${next}’s order changed after Tuesday’s recheck. It now has ${now} first. Tuesday’s totals would put ${tuesday} first.`, lists: [current, totals], next: use };
  return { lead: `Tuesday’s totals would put ${tuesday} first. Because you confirmed an import, ${next} keeps ${now} first.`, lists: [current, totals], next: use };
}
function ImportedOrder({ review }) {
  const order = importedOrder(review);
  return <>
    <p className="gx-t-body gx-cm-preserved">{order.lead}</p>
    <OrderLists week={review.nextWeek} lists={order.lists}/>
    {order.next ? <p className="gx-t-body gx-c-2">{order.next}</p> : null}
  </>;
}

export function EplCorrectionReviewsView({ data, loading = false, failed = false, denied = false, onRefresh, renderTool = inlineTool }) {
  const id = useId();
  return renderTool(<div className="gx-cm-stack gx-cm-corrections">
    <div className="gx-cm-intro"><ToolHeading icon={ShieldCheck}>Read-only review</ToolHeading><p className="gx-t-body gx-c-2">Sleeper stat corrections are shown beside their original captures. Existing picks and draft order are preserved.</p></div>
    {loading && !data ? <Skeleton label="Loading Premier League correction reviews…" shape="panels" count={2}/> : loading ? <p role="status" className="gx-t-body gx-cm-message">Refreshing Premier League correction reviews…</p> : null}
    {failed ? <p role="alert" className="gx-t-body gx-cm-message gx-cm-problem">{data ? 'Could not refresh. Showing the last loaded reviews.' : 'Premier League correction reviews could not load.'}</p> : null}
    {denied ? <p role="alert" className="gx-t-body gx-cm-message">Only the Community commissioner can view these corrections.</p> : null}
    {data?.available === false ? <p role="status" className="gx-t-body gx-cm-message">Premier League correction checks are not available yet.</p> : null}
    {data?.available && !data.reviews?.length ? <p role="status" className="gx-t-body gx-cm-message">No Premier League stat corrections are awaiting review.</p> : null}
    {(!denied && data?.available ? data.reviews ?? [] : []).map(review => <Card as="section" className="gx-cm-stack gx-cm-correction" key={review.week} aria-labelledby={`${id}-mw${review.week}`}>
      <div className="gx-cm-heading"><span className="gx-cm-icon"><ClipboardCheck size={24} aria-hidden="true"/></span><h2 className="gx-t-strong" id={`${id}-mw${review.week}`}>MW{review.week} stat correction needs review</h2></div>
      {ORDER_STATES.includes(review.orderState) && review.currentOrder?.length && review.candidateOrder?.length ? <ImportedOrder review={review}/>
        : <p className="gx-t-body gx-cm-preserved">{review.nextPickCount > 0 ? picksText(review)
          : `MW${review.nextWeek} has no recorded picks. Review its order against the corrected totals before drafting.`}</p>}
      {!review.totalsComplete ? <p role="status" className="gx-t-body gx-cm-message">Some source totals are unavailable. Missing values are shown as —.</p> : null}
      {review.changes.map(change => <section className="gx-cm-stack" key={change.name} aria-label={change.name}>
        <h3 className="gx-t-strong">{change.name}</h3>
        <Comparison label="Season points" before={change.before.points} after={change.after.points} change={change.pointsChange}/>
        <Comparison label="Points against" before={change.before.against} after={change.after.against} change={change.againstChange}/>
      </section>)}
      <details className="gx-cm-details"><summary>Source captures</summary><p className="gx-t-meta gx-c-2">Sleeper · original capture {fmtFull(review.original?.capturedAt)} · recheck {fmtFull(review.corrected?.capturedAt)}</p></details>
    </Card>)}
  </div>, <Button variant="secondary" onClick={onRefresh} disabled={loading}>Refresh reviews</Button>);
}

export default function EplCorrectionReviews({ api = eplApi, renderTool }) {
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
  return <EplCorrectionReviewsView {...read} onRefresh={load} renderTool={renderTool}/>;
}
