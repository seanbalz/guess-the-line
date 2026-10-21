import { lazy, Suspense, useState } from 'react';
import { Button, Card } from '../ui/index.js';
import { useResearch } from './useResearch.js';
import './research.css';

const ResearchChart = lazy(() => import('./ResearchChart.jsx'));
export const PERIODS = { recent30: 'Last 30 games', recent25: 'Last 25 games', season: 'This season', previousSeason: 'Previous season', rolling12: 'Past 12 months', all: 'Full available history' };
export const researchDate = date => date ? date.slice(0, 10) : 'Unknown';
const readable = value => String(value ?? '').replaceAll('_', ' ');
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
export function ResearchStatus({ read }) {
  if (read.status === 'ready') return null;
  const code = read.error?.status;
  return <div className="gx-vstack gx-gap-8" role={read.status === 'error' ? 'alert' : 'status'}>
    <p className="gx-t-body gx-c-2">{read.status !== 'error' ? 'Loading research…' : code === 401 ? 'Sign in again to read research.' : code === 404 ? 'Research is not published for this week.' : code === 503 ? 'Research is temporarily unavailable.' : 'Research could not be loaded.'}</p>
    {read.status === 'error' ? <Button variant="secondary" onClick={read.reload}>Try research again</Button> : null}
  </div>;
}
function CompactChart({ series }) {
  if (!series) return <p className="gx-t-meta">Open evidence for the selected-period chart.</p>;
  if (!series.points.length) return <p className="gx-t-meta">No games in this period.</p>;
  const values = [0, ...series.points.map(p => p.illustrativeUnits)], min = Math.min(...values), max = Math.max(...values);
  const y = n => 52 - (n - min) / (max - min || 1) * 48;
  return <svg className="gx-r-chart gx-r-chart--compact" viewBox="0 0 280 60" role="img" aria-label="Selected historical sample, illustrative units at minus one hundred ten, with zero baseline">
    <line x1="0" x2="280" y1={y(0)} y2={y(0)} className="gx-r-zero"/>
    <polyline className="gx-r-series" points={[[0, y(0)], ...series.points.map((p, i) => [(i + 1) * 280 / series.points.length, y(p.illustrativeUnits)])].map(p => p.join(',')).join(' ')}/>
  </svg>;
}
function RecordSummary({ record, label }) {
  if (!record) return null;
  return <p className="gx-t-meta">{label}: {record.wins}-{record.losses}-{record.pushes} W-L-P · {record.sample} games · {researchDate(record.coverage?.from)} to {researchDate(record.coverage?.to)}</p>;
}
function ResearchDetail({ candidateId, request }) {
  const read = useResearch({ ...request, filters: { ...request?.filters, candidateId }, enabled: Boolean(request) });
  const candidate = read.data?.candidates.find(c => c.id === candidateId);
  return <div className="gx-r-detail gx-vstack gx-gap-12">
    <ResearchStatus read={read}/>
    {candidate ? <>
      <Suspense fallback={<p className="gx-t-meta" role="status">Loading historical chart…</p>}><ResearchChart candidate={candidate}/></Suspense>
      <p className="gx-t-body">Historical consistency does not establish a betting advantage.</p>
      <p className="gx-t-meta">The frozen Tier 2 study qualified roughly as many patterns on shuffled outcomes as on actual outcomes. The recent consistency rule also produces chance qualifiers. Searching many situations can produce apparently strong records by chance; these are descriptive selections, not proven predictions.</p>
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
function ResearchCard({ candidate, gameId, request }) {
  const [expanded, setExpanded] = useState(false);
  const applications = candidate.applications?.filter(a => !gameId || a.gameId === gameId) ?? [];
  return <Card className="gx-r-card" data-research-card={candidate.id}>
    <h4 className="gx-t-strong">{candidate.title}</h4>
    <p className="gx-t-meta">Consistency: {candidate.sourceState === 'source-reported' ? 'Source-reported · not verified' : /^Tier [12] historical consistency$/.test(candidate.qualification.label) ? 'Historical consistency · not proven' : candidate.qualification.label}</p>
    <RecordSummary record={candidate.record} label="Selected period"/>
    <CompactChart series={candidate.series}/>
    <p className="gx-t-meta">Why it applies: {candidate.conditionDescriptions?.join('; ') || readable(candidate.family)}{applications.length ? ` · ${applications.map(a => `${a.gameId.replace('-', ' at ')} (${readable(a.direction)})`).join('; ')}` : ''}.</p>
    <Button variant="ghost" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}>{expanded ? 'Hide evidence' : 'View evidence'}</Button>
    {expanded && request ? <ResearchDetail candidateId={candidate.id} request={request}/> : null}
  </Card>;
}
export function ResearchCards({ data, ids, limit = 3, gameId, request }) {
  const selected = [...new Set(ids ?? data?.shortlist ?? [])].slice(0, limit).map(id => data?.candidates.find(c => c.id === id)).filter(Boolean);
  return selected.length ? <div className="gx-vstack gx-gap-12">{selected.map(c => <ResearchCard key={`${c.id}:${c.period}`} candidate={c} gameId={gameId} request={request}/>)}</div>
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
  return <div><dt className="gx-t-label">{label}</dt><dd className="gx-t-body">{lineValue(game, market, reference?.value)}</dd><dd className="gx-t-meta">{typeof reference?.source === 'string' ? reference.source : 'Source unknown'} · observed {reference?.observedAt ?? 'Unknown'}{reference?.status ? ` · ${readable(reference.status)}` : ''}</dd></div>;
}
export function ResearchLeans({ data, gameId, request }) {
  return <div className="gx-vstack gx-gap-16">{(data?.games ?? []).filter(g => !gameId || g.id === gameId).map(game => <section key={game.id} className="gx-vstack gx-gap-12" aria-label={`${game.id} research`}>
    <h3 className="gx-t-section">{game.id.replace('-', ' at ')}</h3>
    {['spread', 'total'].map(market => {
      const cell = game[market], label = market === 'spread' ? 'Spread' : 'Total';
      if (!cell?.visible) return <p className="gx-t-body gx-c-2" key={market}>{label} research is locked. Lock in your guess or wait for kickoff.</p>;
      const lean = cell.lean;
      return <Card key={market} className="gx-vstack gx-gap-12" data-research-market={market}>
        <h4 className="gx-t-strong">{label}</h4>
        <p className={`gx-t-strong ${lean?.state === 'lean' ? 'gx-c-win' : 'gx-c-pending'}`}>{lean?.state === 'lean' ? `Research lean: ${directionLabel(game, market, lean.direction)}` : lean?.label ?? 'Research unavailable'}</p>
        {(lean?.reasons ?? []).map(code => <p className="gx-t-meta" key={code}>{reason(code)}</p>)}
        <p className="gx-t-meta">Support describes a relationship to this lean. Consistency describes the historical pattern. Overlapping patterns share a group; groups are not independent probabilities.</p>
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
    <p className="gx-t-meta">Source checked: {s.checkedAt ?? 'Unknown'}</p>
    {(s.plays ?? []).map(p => <article className="gx-vstack gx-gap-8" key={p.id}>
      <h4 className="gx-t-strong">{p.event}: {p.selection}</h4><p className="gx-t-meta">Source-reported · not verified · {readable(p.status)}</p>
      <p className="gx-t-body">Original terms: {p.originalTerms}</p>
      <p className="gx-t-meta">Market: {p.market} · Posted line: {p.postedLine ?? 'Unknown'} · Odds: {p.price ?? 'Unknown'}</p>
      <p className="gx-t-meta">Posted: {p.postedAt ?? 'Unknown'} · Captured: {p.capturedAt ?? 'Unknown'}</p>
      <p className="gx-t-meta">Revision: {p.id} · Previous revision: {p.previousRevision ?? 'None'}</p>
      <a className="gx-r-link gx-t-body" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">Original source post</a>
    </article>)}
  </Card>)}</div>;
}
