// D-82 Bets › Your guess vs. market › Player Props (approved sheets 03 accuracy, 04 paper record and 06's no-guesses,
// loading and retry states; design/player-props-review-2026-11-09). Shared kit and the existing Gap styles only.
//
// Three measures stay apart: accuracy is each stat's mean absolute miss from the saved lock-in reference, in its own
// unit, lower is better, never combined; the paper record grades the favored side against the last qualifying retained
// line with verified finals (D-77, 1U at standard minus 110); current gaps are not rescored. Period, athlete and stat
// filters narrow both; the gap-size filter narrows the paper record only. A period loads whole or shows Retry.
import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { propsApi } from '../../api.js';
import { Button, Card, Icon, Skeleton } from '../ui/index.js';
import { GapPeriodControl } from '../bets/GapPeriodControl.jsx';
import { periodWeeks } from '../bets/gapPeriods.js';
import { PROP_UNGRADED, filterPropRows, formatPropMean, propAccuracy, propPaperRecord, propStat } from '../../../../shared/player-props.mjs';
import { ShellContext } from '../shell/context.js';
import { requestPropsEntry } from './flag.js';
import { PropsUnavailable } from './PlayerPropsEntry.jsx';
import '../bets/gapRecord.css';
import './props.css';

/** Every retained week from the first Player Props season through the current week, oldest first. */
export function propWeeks(season, week, first = 2026) {
  if (!Number.isInteger(season) || !Number.isInteger(week) || season < first) return [];
  const out = [];
  for (let s = first; s <= season; s += 1) for (let w = 1; w <= (s === season ? week : 22); w += 1) out.push({ season: s, week: w });
  return out;
}

/** One stat's card: its own unit, count and scale; the last five misses as bars. */
export function AccuracyCard({ entry }) {
  const last = entry.misses.slice(-5), max = Math.max(...last, 0) || 1;
  const words = `${entry.label}: average miss ${formatPropMean(entry.mean)} ${entry.unit} over ${entry.count} ${entry.count === 1 ? 'guess' : 'guesses'}`;
  return <Card as="article" className="gx-props-card gx-props-acc" aria-label={words}>
    <Icon icon="target" size={24} className="gx-c-accent"/>
    <h4 className="gx-t-strong">{entry.label}</h4>
    <p className="gx-props-mean"><span className="gx-n-l">{formatPropMean(entry.mean)}</span> <span className="gx-t-meta">{entry.short}</span></p>
    <p className="gx-t-meta gx-c-2">Average miss · {entry.count} {entry.count === 1 ? 'guess' : 'guesses'}</p>
    {/* One picture with one name (role img): its bars are presentation, so they are not list items (axe listitem). */}
    <div className="gx-props-bars" role="img" aria-label={`Last ${last.length} misses in ${entry.unit}: ${last.map(formatPropMean).join(', ')}`}>
      {last.map((miss, i) => <span key={i} className="gx-props-bar-col"><span className="gx-props-bar" style={{ blockSize: `${Math.max(4, Math.round((miss / max) * 64))}px` }}/><span className="gx-t-meta">{Number.isInteger(miss) ? miss : miss.toFixed(1)}</span></span>)}
    </div>
    <p className="gx-t-meta gx-c-2">Last {last.length} {last.length === 1 ? 'guess' : 'guesses'}</p>
  </Card>;
}

function Select({ label, value, options, onChange }) {
  const id = useId();
  return <div className="gx-gap-period-field"><label htmlFor={id}>{label}</label>
    <select id={id} value={value} onChange={event => onChange(event.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
}

/** The paper record card (sheet 04): W–L–P, rate over wins and losses, graded and waiting counts. */
export function PaperRecord({ record }) {
  const decided = record.wins + record.losses, rate = record.winRate === null ? '—' : `${(record.winRate * 100).toFixed(1)}%`;
  const waiting = Object.values(record.ungraded).reduce((a, b) => a + b, 0);
  return <div className="gx-vstack gx-gap-16">
    <div className="gx-card gx-gap-hero gx-props-card">
      <div className="gx-gap-rate gx-props-rate">
        <span className="gx-props-ring">
          <svg viewBox="0 0 84 84" role="img" aria-label={decided ? `${rate} paper win rate` : 'Paper win rate unavailable'}>
            <circle cx="42" cy="42" r="35"/><circle className="gx-gap-rate-fill" cx="42" cy="42" r="35" pathLength="100" strokeDasharray={`${decided ? record.winRate * 100 : 0} 100`}/>
          </svg>
          <b aria-hidden="true">{rate.endsWith('%') ? <>{rate.slice(0, -1)}<small>%</small></> : rate}</b>
        </span>
        <div><span>Gap win rate</span><strong>{record.wins}–{record.losses}–{record.pushes}</strong><span>Wins · losses · pushes</span></div>
      </div>
      <p className="gx-between gx-hstack gx-t-strong gx-props-tally"><span>{record.graded.length} graded</span><span>{waiting} awaiting finals</span></p>
      <p className="gx-t-meta gx-c-2">Paper record · 1U at −110 · pushes excluded from win rate. Not bets placed.</p>
    </div>
    {waiting ? <Card as="section" className="gx-props-card">
      <div className="gx-hstack gx-gap-12"><Icon icon="clock" size={20} className="gx-c-accent"/><div className="gx-vstack"><h4 className="gx-t-strong">Waiting for verified finals</h4>
        <span className="gx-t-body gx-c-2">Pending evidence stays ungraded, never a loss.</span></div></div>
      <ul className="gx-vstack gx-gap-4">{Object.entries(record.ungraded).map(([reason, n]) => <li key={reason} className="gx-t-meta gx-c-2">{n} · {PROP_UNGRADED[reason] ?? reason}</li>)}</ul>
    </Card> : null}
  </div>;
}

/** The record screen, drawn from what it is given (static-render tested). */
export function PropRecordScreen({ read, state, on, weeks }) {
  const rows = read.status === 'ready' ? filterPropRows(read.rows, state.filters) : [];
  const athletes = read.status === 'ready' ? [...new Map(read.rows.map(r => [r.playerId, r.playerName])).entries()] : [];
  const stats = read.status === 'ready' ? [...new Set(read.rows.map(r => r.stat))].filter(propStat) : [];
  const accuracy = propAccuracy(rows), paper = propPaperRecord(rows, { tier: state.tier });
  return <section className="gx-gap-record gx-props-record" aria-label="Your Player Props accuracy and paper record">
    <GapPeriodControl period={state.period} weeks={weeks} range={state.range} onPeriod={on.period} onApply={on.range}/>
    {read.status === 'unavailable' ? <PropsUnavailable onRetry={on.retry}/>
    : read.status === 'loading' ? <Card as="section" className="gx-props-card" aria-busy="true"><div className="gx-between gx-hstack gx-gap-8"><h3 className="gx-t-strong">Loading the complete period</h3><Icon icon="refresh" size={20} className="gx-c-2"/></div>
      <Skeleton label="Loading every selected week…" shape="lines" count={3}/><p className="gx-t-meta gx-c-2">A partial period won’t be shown as All time.</p></Card>
    : read.status === 'error' ? <Card as="section" className="gx-props-card" role="alert"><div className="gx-hstack gx-gap-12"><Icon icon="alert" size={20}/><h3 className="gx-t-strong">This record couldn’t load</h3></div>
      <p className="gx-t-body gx-c-2">Your saved guesses are safe. Keep your filters and try again.</p><Button icon="refresh" block onClick={on.retry}>Retry this period</Button></Card>
    : read.status === 'choose' ? <p className="gx-t-body">Choose From and To, then apply the range.</p>
    : <>
      <div className="gx-props-filters">
        <Select label="Athlete" value={state.filters.playerId} onChange={playerId => on.filters({ ...state.filters, playerId })}
          options={[{ value: 'all', label: 'All athletes' }, ...athletes.map(([value, label]) => ({ value, label }))]}/>
        <Select label="Stat type" value={state.filters.stat} onChange={stat => on.filters({ ...state.filters, stat })}
          options={[{ value: 'all', label: 'All stat types' }, ...stats.map(value => ({ value, label: propStat(value).label }))]}/>
      </div>
      {state.view === 'paper' ? <>
        <Button variant="ghost" icon="chevronLeft" onClick={() => on.view('accuracy')}>Back to accuracy</Button>
        <h3 className="gx-t-section">Your Gap paper record</h3>
        <Select label="Gap size" value={state.tier} onChange={on.tier} options={[{ value: 'all', label: 'All gaps' }, { value: 'large', label: 'Large gaps · 10%+ of the line' }]}/>
        <PaperRecord record={paper}/>
        <p className="gx-t-meta gx-c-2">Filters apply to the full selected period. Gap size narrows the paper record only.</p>
      </> : <>
        <div className="gx-vstack gx-gap-4"><h3 className="gx-t-section">Your prop accuracy</h3><p className="gx-t-meta gx-c-2">Average miss vs. saved reference · lower is better</p></div>
        {accuracy.length ? <div className="gx-props-acc-grid">{accuracy.map(entry => <AccuracyCard key={entry.stat} entry={entry}/>)}</div>
          : <Card as="section" className="gx-props-card"><div className="gx-hstack gx-gap-12"><Icon icon="target" size={24} className="gx-c-accent"/><div className="gx-vstack">
            <h4 className="gx-t-strong">Your first prop starts here</h4><span className="gx-t-body gx-c-2">No locked guesses in this filter yet.</span></div></div>
            {on.choose ? <Button variant="primary" icon="plus" block onClick={on.choose}>Choose an available prop</Button> : null}
            <p className="gx-t-meta gx-c-2">No guesses means no accuracy score—not zero.</p></Card>}
        {accuracy.length ? <Card as="section" className="gx-props-card"><div className="gx-hstack gx-gap-12"><Icon icon="scale" size={20} className="gx-c-accent"/><div className="gx-vstack">
          <h4 className="gx-t-strong">Each stat stays separate</h4><span className="gx-t-body gx-c-2">Yards and receptions never become one score.</span></div></div></Card> : null}
        <Button icon="chart" iconEnd="chevronRight" block onClick={() => on.view('paper')}>View Gap paper record</Button>
      </>}
    </>}
  </section>;
}

/** The stateful record: one /props/history read for the whole selected period. */
export default function PropRecord({ season, week, onSignInAgain }) {
  const weeks = useMemo(() => propWeeks(season, week), [season, week]);
  const [state, setState] = useState({ period: 'season', range: null, filters: { playerId: 'all', stat: 'all' }, tier: 'all', view: 'accuracy' });
  const [read, setRead] = useState({ status: 'loading', rows: [] }), [attempt, setAttempt] = useState(0);
  const auth = useRef(onSignInAgain); auth.current = onSignInAgain;
  let selected = [], problem = null;
  try { if (state.period !== 'custom' || state.range) selected = periodWeeks(weeks, { period: state.period, season, week, ...state.range }); } catch (failure) { problem = failure.message; }
  const from = selected[0], to = selected.at(-1), scope = from && to ? JSON.stringify({ from, to }) : '';
  useEffect(() => {
    if (!scope) { setRead({ status: weeks.length ? (state.period === 'custom' ? 'choose' : 'ready') : 'unavailable', rows: [] }); return undefined; }
    const controller = new AbortController();
    setRead({ status: 'loading', rows: [] });
    propsApi('history', JSON.parse(scope), controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data?.complete !== true || !Array.isArray(data.rows)) throw new Error('incomplete');
      setRead({ status: 'ready', rows: data.rows.map(row => ({ ...row, reference: row.reference ?? null })) });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error?.status === 401) auth.current?.();
      setRead({ status: error?.status === 404 ? 'unavailable' : 'error', rows: [] });
    });
    return () => controller.abort();
  }, [scope, attempt, weeks.length, state.period]);
  const patch = next => setState(current => ({ ...current, ...next }));
  const shell = useContext(ShellContext);
  const on = { period: period => patch({ period, range: null }), range: range => patch({ range }), filters: filters => patch({ filters }),
    tier: tier => patch({ tier }), view: view => patch({ view }), retry: () => setAttempt(n => n + 1),
    choose: shell?.go ? () => { requestPropsEntry(); shell.go('play', { section: 'picks' }); } : undefined };
  return <>{problem ? <p role="alert" className="gx-t-body">{problem}</p> : null}<PropRecordScreen read={read} state={state} on={on} weeks={weeks}/></>;
}
