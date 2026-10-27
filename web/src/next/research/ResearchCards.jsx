import { lazy, Suspense, useId, useRef, useState } from 'react';
import { Button, Card, InfoButton, Skeleton } from '../ui/index.js';
import { TrendDetail, lineSelectionKey } from '../charts/TrendDetail.jsx';
import { TrendLine } from '../charts/TrendLine.jsx';
import { useChartSelection } from '../charts/useChartSelection.js';
import { TrendRow } from '../charts/TrendRow.jsx';
import { hitPct, recordText, signed } from '../charts/geometry.js';
import { INFO } from '../info.js';
import { fmtDate, fmtTime, pacificParts } from '../format.js';
import { useResearch } from './useResearch.js';
import { Boundary } from '../shell/Boundary.jsx';
import './research.css';

const loadResearchTable = () => lazy(() => import('./ResearchChart.jsx'));
// A table download failure must not dismiss the sheet or discard chart selection.
function HistoricalTable({ candidate, selection }) {
  const [Table, setTable] = useState(loadResearchTable), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  const retry = () => {
    // Keep keyboard focus inside the evidence while the retry button is replaced.
    region.current?.focus();
    setTable(loadResearchTable); setAttempt(n => n + 1);
  };
  return <div ref={region} role="group" aria-label="Historical table" tabIndex={-1}>
    <Boundary key={attempt} fallback={() => <div className="gx-vstack gx-gap-8" role="alert">
      <p className="gx-t-body">Historical table couldn’t load. Check your connection and try again. If it keeps failing, reload the app.</p>
      <Button variant="secondary" onClick={retry}>Try table again</Button>
    </div>}>
      <Suspense fallback={<Skeleton label="Loading historical table…" shape="lines" count={4}/>}><Table candidate={candidate} selection={selection}/></Suspense>
    </Boundary>
  </div>;
}
export const PERIODS = { recent30: 'Last 30 games', recent25: 'Last 25 games', season: 'This season', previousSeason: 'Previous season', rolling12: 'Past 12 months', all: 'Full available history' };
export const researchDate = date => date ? date.slice(0, 10) : 'Unknown';
const readable = value => String(value ?? '').replaceAll('_', ' ');
/** Source instants keep their exact timestamp; date-only evidence never acquires a clock time. */
export function ResearchTime({ value }) {
  if (typeof value !== 'string') return 'Time unavailable';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      ? <><time dateTime={value}>{value}</time> · time unavailable</> : 'Time unavailable';
  }
  // An offset is required: do not silently interpret a source time in the device's zone.
  const parts = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? pacificParts(value) : null;
  return parts ? <time dateTime={value}>{fmtDate(value)}, {parts.year} · {fmtTime(value)} PT</time> : 'Time unavailable';
}
const REASONS = {
  not_pregame: 'The game has started.', history_not_fresh: 'Historical evidence needs a fresh source check.', reference_unavailable: 'Current market reference unavailable.',
  reference_time_missing: 'Current reference observation time is unknown.', reference_future: 'Current reference has a future observation time.', reference_stale: 'Current reference is older than twelve hours.',
  conditions_unknown: 'Required pregame conditions are unknown.', balanced_groups: 'Qualifying evidence groups are evenly split.', insufficient_groups: 'Fewer than two qualifying groups agree.',
  stronger_historical_conflict: 'Stronger historical evidence conflicts.', schedule_context_unavailable: 'Verified schedule context is unavailable.', local_eligibility_expired: 'The game has started or the reference expired; refresh is required.',
  recent_sample: 'Fewer than thirty qualifying completed games are available.', historical_recent_decisive: 'The recent historical sample has fewer than twenty decisive results.',
  historical_recent_not_positive: 'The recent historical sample does not have positive illustrative units.', recent_block_decisive: 'At least one chronological ten-game block has fewer than eight decisive results.',
  recent_block_not_positive: 'At least one chronological ten-game block does not have positive illustrative units.', earlier_not_positive: 'The earlier history has at least thirty decisive results and does not have positive illustrative units.',
  not_reproduced: 'This source claim has not been independently reproduced.', registration_future: 'Registration is later than this research snapshot.',
};
const reason = code => REASONS[code] ?? readable(code);
const overlapReasons = { family: 'same situation family', dedup_group: 'same duplicate-evidence group', canonical_id: 'same canonical situation', sample_overlap: 'overlapping historical sample' };
function EvidenceDisclosure({ label, children }) {
  const [open, setOpen] = useState(false);
  return <div className="gx-vstack gx-gap-8"><Button variant="ghost" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Hide this evidence' : label}</Button>{open ? children : null}</div>;
}
export function ResearchStatus({ read, compact = false }) {
  if (read.status === 'ready') return null;
  if (read.status !== 'error') return <Skeleton label="Loading research…" shape={compact ? 'lines' : 'panels'} count={compact ? 3 : 2}/>;
  const code = read.error?.status;
  return <div className="gx-vstack gx-gap-8" role="alert">
    <p className="gx-t-body gx-c-2">{code === 401 ? 'Sign in again to read research.' : code === 404 ? 'Research is not published for this week.' : code === 503 ? 'Research is temporarily unavailable.' : 'Research could not be loaded.'}</p>
    <Button variant="secondary" onClick={read.reload}>Try research again</Button>
  </div>;
}
function RecordSummary({ record, label }) {
  if (!record) return null;
  return <p className="gx-t-meta">{label}: {record.wins}-{record.losses}-{record.pushes} W-L-P · {record.sample} games · {researchDate(record.coverage?.from)} to {researchDate(record.coverage?.to)}</p>;
}
function ResearchDetail({ candidateId, request, withChart, selection }) {
  const read = useResearch({ ...request, filters: { ...request?.filters, candidateId }, enabled: Boolean(request) });
  const candidate = read.data?.candidates.find(c => c.id === candidateId);
  const line = candidate ? researchLine(candidate) : null;
  const key = line ? lineSelectionKey(candidate.title, line) : null;
  const localSelection = useChartSelection(key, line?.values.length ?? 0), chartId = useId();
  // The detail is a separate read. Link only equivalent chart evidence, never a stale summary.
  const linked = !line ? null : withChart ? { ...localSelection, chartId } : selection?.key === key ? selection : null;
  return <div className="gx-r-detail gx-vstack gx-gap-12">
    <ResearchStatus read={read} compact/>
    {candidate ? <>
      {withChart && line ? <TrendLine id={chartId} values={line.values} tip={line.tip} start={line.start} end={line.end} label={line.label} selectedIndex={localSelection.index} onSelect={localSelection.onSelect}/> : null}
      <HistoricalTable candidate={candidate} selection={linked}/>
      <p className="gx-t-meta">Qualification uses the canonical recent sample, regardless of this display period. {candidate.qualification.label}. {(candidate.qualification.reasons ?? []).map(reason).join(' ')}</p>
      <p className="gx-t-meta">Conditions: {candidate.conditionDescriptions?.join('; ') || 'See situation title'}. Registered {researchDate(candidate.registeredAt)} · {candidate.sourceState === 'source-reported' ? 'Source-reported · not verified' : 'Computed from permitted NFL history'}.</p>
      <RecordSummary record={candidate.recent} label="Canonical recent sample"/>
      <RecordSummary record={candidate.seasonRecord} label="Snapshot season"/>
      <RecordSummary record={candidate.historical} label="Available history"/>
      <RecordSummary record={candidate.retrospective} label="Before registration (retrospective)"/>
      <RecordSummary record={candidate.prospective} label="After registration (prospective)"/>
      <p className="gx-t-meta">Selected-period hit rate: {candidate.record.hitRate === null ? 'Unknown' : `${(candidate.record.hitRate * 100).toFixed(1)}%`} (pushes excluded). Illustrative units: {candidate.record.illustrativeUnits ?? 'Unknown'}. Price coverage: {candidate.record.priceCoverage?.priced ?? 0} of {candidate.record.sample}. {candidate.record.priceCoverage?.complete ? `Actual-price units: ${candidate.record.actualUnits ?? 'Unknown'}.` : 'Actual-price performance unavailable because price coverage is incomplete.'}</p>
      <p className="gx-t-meta">Input coverage: {candidate.inputCoverage?.completedGames ?? 'Unknown'} completed games; {candidate.inputCoverage?.missingRequiredLine ?? 'Unknown'} missing required lines; {candidate.inputCoverage?.unknownConditions ?? 'Unknown'} with unknown conditions; {candidate.inputCoverage?.knownConditions ?? 'Unknown'} with known conditions.</p>
      <p className="gx-t-meta">Excluded results: {Object.entries(candidate.record.exclusions ?? {}).map(([key, count]) => `${readable(key)}: ${count}`).join('; ') || 'None reported'}.</p>
      {(candidate.limitations ?? []).map((text, i) => <p className="gx-t-meta" key={i}>{text}</p>)}
    </> : null}
  </div>;
}
/** The selected period's cumulative units as a D-55 line, from the research reply's own bins; null without a series. */
export function researchLine(candidate) {
  const points = candidate?.series?.points ?? [];
  if (!points.length || !points.every(p => Number.isFinite(p.illustrativeUnits))) return null;
  const values = [0, ...points.map(p => p.illustrativeUnits)];
  // The reader supplies a per-bin record but endpoint cumulative units. Keep the
  // tooltip's record on that same cumulative basis; the table retains each bin.
  let wins = 0, losses = 0, pushes = 0;
  const records = points.map(point => {
    wins += point.wins; losses += point.losses; pushes += point.pushes;
    return recordText(wins, losses, pushes);
  });
  const start = researchDate(points[0].from).slice(0, 4), end = researchDate(points.at(-1).to).slice(0, 4);
  return {
    values, start, end,
    label: `Illustrative units at −110 for the selected sample, ending at ${signed(values.at(-1))}`,
    tip: i => (i === 0 ? { value: '0.0 U', label: `Start, ${researchDate(points[0].from)}` }
      : { value: `${signed(values[i])} U`, label: `${records[i - 1]} total · through ${researchDate(points[i - 1].to)}` }),
  };
}
const consistencyText = candidate => (candidate.sourceState === 'source-reported' ? 'Source-reported · not verified'
  : /^Tier [12] historical consistency$/.test(candidate.qualification.label) ? 'Historical consistency · not proven' : candidate.qualification.label);
const consistencyPill = candidate => (candidate.sourceState === 'source-reported' ? 'Not verified' : /not proven/i.test(consistencyText(candidate)) ? 'Not proven' : null);

function ResearchCard({ candidate, gameId, request, open, onToggle }) {
  const id = useId();
  const [evidence, setEvidence] = useState(false);
  const applications = candidate.applications?.filter(a => !gameId || a.gameId === gameId) ?? [];
  const r = candidate.record ?? {}, pct = hitPct(r.wins ?? 0, r.losses ?? 0), line = researchLine(candidate);
  const units = Number.isFinite(r.illustrativeUnits) ? r.illustrativeUnits : line?.values.at(-1);
  const why = `Why it applies: ${candidate.conditionDescriptions?.join('; ') || readable(candidate.family)}${applications.length ? ` · ${applications.map(a => `${a.gameId.replace('-', ' at ')} (${readable(a.direction)})`).join('; ')}` : ''}.`;
  const info = <InfoButton title="About this research" body={[`Consistency: ${consistencyText(candidate)}`, why, ...INFO.research.body]} links={INFO.research.links}/>;
  const evidenceBlock = selection => <>
    <Button variant="ghost" onClick={() => setEvidence(v => !v)} aria-expanded={evidence}>{evidence ? 'Hide evidence' : 'View evidence'}</Button>
    {evidence && request ? <ResearchDetail candidateId={candidate.id} request={request} withChart={!line} selection={selection}/> : null}
  </>;
  const record = r.sample ? recordText(r.wins ?? 0, r.losses ?? 0, r.pushes ?? 0) : null;
  const tiles = [
    { label: 'Win rate', value: pct === null ? '—' : `${pct}%`, meter: pct, sub: pct === null ? 'No decided games' : undefined },
    { label: 'Games', value: String(r.sample ?? '—'), sub: PERIODS[candidate.period] ?? 'Selected period' },
  ];
  return <li className="gx-tc-item gx-r-card" data-research-card={candidate.id}>
    <div className="gx-tc-rowcard">
      <TrendRow title={candidate.title} sub={[consistencyPill(candidate), record].filter(Boolean).join(' · ')}
        values={line?.values} value={Number.isFinite(units) ? `${signed(units)} U` : null} open={open} controls={id} onToggle={onToggle}/>
      {open && !line ? <div className="gx-tc-rowtext" id={id}>
        <RecordSummary record={candidate.record} label="Selected period"/>
        <div className="gx-l-sechead"><p className="gx-t-meta gx-grow">{consistencyText(candidate)}</p>{info}</div>
        {evidenceBlock()}
      </div> : null}
    </div>
    {open && line ? <TrendDetail id={id} title={candidate.title} pill={consistencyPill(candidate)} info={info}
      line={{ ...line, headline: { value: `${signed(units)} U`, sub: [record, r.coverage?.from ? `${researchDate(r.coverage.from)} to ${researchDate(r.coverage.to)}` : 'selected period'].filter(Boolean).join(' · ') }, tiles }}>
      {evidenceBlock}
    </TrendDetail> : null}
  </li>;
}
/** The candidates a research list shows: `ids` (else the reply's shortlist), once each, at most `limit`, known ones only. */
export const researchSelection = (data, ids, limit = 3) => [...new Set(ids ?? data?.shortlist ?? [])].slice(0, limit).map(id => data?.candidates.find(c => c.id === id)).filter(Boolean);
/** Research as D-55 compact rows; one opens at a time, and the first opens on its own unless `openFirst` is false. */
export function ResearchCards({ data, ids, limit = 3, gameId, request, openFirst = true }) {
  const selected = researchSelection(data, ids, limit);
  const [open, setOpen] = useState(() => (openFirst ? selected[0]?.id ?? null : null));
  return selected.length ? <ul className="gx-tc-list" aria-label="Research">{selected.map(c => <ResearchCard key={`${c.id}:${c.period}`} candidate={c} gameId={gameId} request={request}
    open={open === c.id} onToggle={() => setOpen(value => (value === c.id ? null : c.id))}/>)}</ul>
    : <p className="gx-t-body gx-c-2">No qualifying research in this view. Explore other situations.</p>;
}
function directionLabel(game, market, direction) {
  return market === 'spread' ? `${game.id.split('-')[direction === 'home' ? 1 : 0]} against the spread` : direction === 'over' ? 'Over' : 'Under';
}
function lineValue(game, market, value) {
  if (!Number.isFinite(value)) return 'Unknown';
  return market === 'spread' ? `${game.id.split('-')[1]} ${value < 0 ? '−' : value > 0 ? '+' : ''}${Math.abs(value)}` : String(value);
}
function Reference({ game, market, reference, label }) {
  return <div><dt className="gx-t-label">{label}</dt><dd className="gx-t-body">{lineValue(game, market, reference?.value)}</dd><dd className="gx-t-meta">{typeof reference?.source === 'string' ? reference.source : 'Source unknown'} · observed <ResearchTime value={reference?.observedAt}/>{reference?.status ? ` · ${readable(reference.status)}` : ''}</dd></div>;
}
export function ResearchLeans({ data, gameId, request }) {
  return <div className="gx-vstack gx-gap-16">{(data?.games ?? []).filter(g => !gameId || g.id === gameId).map(game => <section key={game.id} className="gx-vstack gx-gap-12" aria-label={`${game.id} research`}>
    <h3 className="gx-t-section">{game.id.replace('-', ' at ')}</h3>
    {['spread', 'total'].map(market => {
      const cell = game[market], label = market === 'spread' ? 'Spread' : 'Total';
      if (!cell?.visible) return <p className="gx-t-body gx-c-2" key={market}>{label} research is locked. Lock in your guess or wait for kickoff.</p>;
      const lean = cell.lean;
      return <Card key={market} className="gx-vstack gx-gap-12" data-research-market={market}>
        <div className="gx-l-sechead"><h4 className="gx-t-strong gx-grow">{label}</h4><InfoButton title={INFO.research.title} body={INFO.research.body} links={INFO.research.links}/></div>
        <p className={`gx-t-strong ${lean?.state === 'lean' ? 'gx-c-win' : 'gx-c-pending'}`}>{lean?.state === 'lean' ? `Research lean: ${directionLabel(game, market, lean.direction)}` : lean?.label ?? 'Research unavailable'}</p>
        {(lean?.reasons ?? []).map(code => <p className="gx-t-meta" key={code}>{reason(code)}</p>)}
        {(lean?.supporting?.length || lean?.alternatives?.length ? [...(lean.supporting ?? []), ...(lean.alternatives ?? [])] : lean?.groups ?? []).map(group => <div className={`gx-r-group ${group.role === 'support' && lean.state === 'lean' ? 'gx-r-support' : 'gx-r-alternative'}`} key={group.id}>
          <p className="gx-t-label">{group.role === 'support' && lean.state === 'lean' ? 'Supports the lean' : group.mixed ? 'Alternative / mixed evidence' : 'Alternative — qualifying opposing or uncertain evidence'}{group.direction ? ` · ${directionLabel(game, market, group.direction)}` : ''}</p>
          {group.memberIds.map(id => {
            const c = data.candidates.find(item => item.id === id);
            return c ? <div key={id}><p className="gx-t-body">{c.title}</p><p className="gx-t-meta">Consistency: {c.qualification.label}</p>{request ? <EvidenceDisclosure label="Open this evidence"><ResearchCards data={data} ids={[id]} limit={1} gameId={game.id} request={request}/></EvidenceDisclosure> : null}</div> : null;
          })}
          {(group.overlaps ?? []).map((overlap, i) => <p className="gx-t-meta" key={i}>Grouped evidence: {overlap.count} of {overlap.smaller} games in the smaller sample overlap; {(overlap.reasons ?? []).map(code => overlapReasons[code] ?? readable(code)).join(', ')}.</p>)}
        </div>)}
        {lean?.context?.length ? <EvidenceDisclosure label="Emerging context (does not vote)"><ResearchCards data={data} ids={lean.context} limit={lean.context.length} request={request} gameId={game.id}/></EvidenceDisclosure> : null}
        <dl className="gx-r-references gx-vstack gx-gap-12">
          <div><dt className="gx-t-label">Your expected market line</dt><dd className="gx-t-body">{lineValue(game, market, cell.ownGuess)}</dd></div>
          <Reference game={game} market={market} reference={cell.savedReference} label="Saved scoring reference"/>
          <Reference game={game} market={market} reference={cell.currentReference} label="Current market reference"/>
          <div><dt className="gx-t-label">Difference from your expected market line</dt><dd className="gx-t-body">{cell.guessGap?.value ?? 'Unknown'}</dd><dd className="gx-t-meta">A pricing expectation gap does not indicate a fair line or betting advantage.</dd></div>
        </dl>
      </Card>;
    })}
  </section>)}</div>;
}
export function ResearchSources({ sources = [], trent }) {
  const entries = trent ? [trent] : sources;
  return <div className="gx-vstack gx-gap-12">{trent ? <p className="gx-t-body">Original plays. Trent’s selections are separate from GTL evidence and do not vote on research leans.</p> : <p className="gx-t-meta">External posts are source-reported research references, not computed proof or independent votes.</p>}{entries.map((s, i) => <Card key={s.id ?? i} className="gx-vstack gx-gap-8">
    <h3 className="gx-t-strong">{s.name ?? 'Book It With Trent'}</h3>
    <p className="gx-t-body">{s.status === 'reviewed' ? 'Reviewed original source entries' : s.status === 'no-verified-plays' ? 'No plays verified for this period' : 'Source unavailable'}</p>
    <p className="gx-t-meta">Source checked: <ResearchTime value={s.checkedAt}/></p>
    {(s.plays ?? []).map(p => <article className="gx-vstack gx-gap-8" key={p.id}>
      <h4 className="gx-t-strong">{p.event}: {p.selection}</h4><p className="gx-t-meta">Source-reported · not verified · {readable(p.status)}</p>
      <p className="gx-t-body">Original terms: {p.originalTerms}</p>
      <p className="gx-t-meta">Market: {p.market} · Posted line: {p.postedLine ?? 'Unknown'} · Odds: {p.price ?? 'Unknown'}</p>
      <p className="gx-t-meta">Posted: <ResearchTime value={p.postedAt}/> · Captured: <ResearchTime value={p.capturedAt}/></p>
      <p className="gx-t-meta">Revision: {p.id} · Previous revision: {p.previousRevision ?? 'None'}</p>
      <a className="gx-r-link gx-t-body" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">Original source post</a>
    </article>)}
  </Card>)}</div>;
}
