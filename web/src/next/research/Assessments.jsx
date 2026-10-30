import { useEffect, useId, useRef, useState } from 'react';
import { ASSESSMENT_LABELS, submittedResearchLink } from '../../../../shared/research-assessments.mjs';
import { linesApi } from '../../api.js';
import { useLinesData } from '../lines/linesData.js';
import { useShell } from '../shell/context.js';
import { Button, InfoButton } from '../ui/index.js';
import { Nest } from '../ui/Nest.jsx';
import { useAssessments } from './useAssessments.js';
import './assessments.css';

const INFO = {
  title: 'About research recommendations',
  body: ['Research is independent of your sportsbook-line guesses. Qualitative findings have no calculated win probability or estimated betting edge.',
    'Yellow is a research lean; red means evidence against; gray means insufficient evidence. Green is reserved for a tested projection indicating value at the quoted price. No model is qualified yet.',
    'Contradictions and shared underlying data remain visible. Multiple posts about the same dataset are not independent confirmations.',
    'Quotes are recorded observations, not guarantees of sportsbook availability. Game quotes expire after six hours; player-prop quotes after one hour, or at kickoff if earlier.',
    'Only free, usable sources are included. Submitted links remain pending until accessible content is extracted and checked. Automatic coverage may be partial.'],
};
const reasons = {
  current_quote_unavailable: 'No current verified quote', pregame_closed: 'Pregame assessment closed', supporting_evidence_unavailable: 'No qualifying supporting evidence',
  conflicting_evidence: 'Opposing evidence present', conditions_unresolved: 'Conditions need clarification', sample_unresolved: 'Sample not established',
  metric_definition_unresolved: 'Metric definition not established', source_identity_unresolved: 'Source identity needs review', source_time_unresolved: 'Source dates need review',
  different_betting_terms: 'Different line, unit or selection', source_stale: 'Source needs updating', source_reuse_unavailable: 'Source unavailable for use',
  simulation_terms_unresolved: 'Simulation threshold not established', primary_source_unresolved: 'Original source not established', calculation_unverified: 'Calculation not reproduced',
};
const readableTime = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Los_Angeles' }).format(new Date(value)) + ' PT' : 'Time unavailable';
const odds = value => value > 0 ? `+${value}` : String(value).replace('-', '−');
function Select({ label, value, options, onChange }) {
  const id = useId();
  return <div className="gx-ra-select gx-t-body"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e => onChange(e.target.value)}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>;
}
export function AssessmentDetail({ assessment: a, onTrack }) {
  return <div className="gx-vstack gx-gap-12" data-assessment={a.color}>
    <strong className="gx-t-body">{a.label}</strong>
    {a.reasons.map(r => <p className="gx-t-meta" key={r}>{reasons[r] ?? r.replaceAll('_', ' ')}</p>)}
    {a.quote ? <div className="gx-vstack gx-gap-8"><p className="gx-n-m">{odds(a.quote.odds)} <span className="gx-t-body">{a.quote.source}</span></p><p className="gx-t-meta">Recorded {readableTime(a.quote.observedAt)}</p>
      {onTrack && a.selection.market !== 'moneyline' ? <Button variant="secondary" onClick={() => onTrack(a)}>Track this bet</Button> : null}</div> : <p className="gx-t-body">Current quote unavailable.</p>}
    <p className="gx-t-meta">{a.evidenceGroups} underlying evidence {a.evidenceGroups === 1 ? 'group' : 'groups'}</p>
    {a.evidence.map(e => <details className="gx-ra-evidence" key={e.id}><summary>{e.eligible ? e.stance === 'oppose' ? 'Opposing evidence' : e.stance === 'support' ? 'Supporting evidence' : 'Context' : 'Pending evidence'} · {e.label}</summary>
      {e.statement ? <p className="gx-t-body">{e.statement}</p> : null}
      {e.metric ? <p className="gx-t-body">{e.metric.name}: <span className="gx-n-s">{e.metric.value}</span> {e.metric.unit} · {e.metric.denominator}</p> : null}
      {e.sample ? <p className="gx-t-body">Sample: <span className="gx-n-s">{e.sample.count}</span> {e.sample.unit}</p> : null}
      {e.period ? <p className="gx-t-meta">{readableTime(e.period.from)} – {readableTime(e.period.to)}</p> : null}
      {e.asOf ? <p className="gx-t-meta">Data through {readableTime(e.asOf)}</p> : null}
      {e.datasetId ? <p className="gx-t-meta">Underlying data: {e.datasetId}</p> : null}
      {e.assumptions?.map(s => <p className="gx-t-body" key={s}>Assumption: {s}</p>)}
      {e.reasons.map(r => <p className="gx-t-meta" key={r}>{reasons[r] ?? r.replaceAll('_', ' ')}</p>)}
      {e.sourceUrl ? <a className="gx-ra-link" href={e.sourceUrl} target="_blank" rel="noreferrer">Original source</a> : null}
    </details>)}
  </div>;
}

export function ResearchLinkIntake({ accountId, onDirty }) {
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [links, setLinks] = useState([]);
  const request = useRef(null), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onDirty?.(!!url); }, [url, onDirty]);
  useEffect(() => {
    const controller = new AbortController();
    linesApi('research-links', {}, controller.signal).then(reply => { if (!controller.signal.aborted) setLinks(reply.links); }).catch(() => {});
    return () => controller.abort();
  }, [accountId]);
  async function submit(e) {
    e.preventDefault(); if (busy) return;
    let canonical; try { canonical = submittedResearchLink(url).url; } catch { setMessage('Use a post from one of the eight selected accounts.'); return; }
    if (request.current?.url !== canonical) request.current = { url: canonical, requestId: crypto.randomUUID() };
    setBusy(true); setMessage('');
    try {
      const saved = await linesApi('research-submit', request.current);
      if (!alive.current) return;
      setLinks(rows => [saved, ...rows.filter(r => r.id !== saved.id)].slice(0, 50)); setUrl(''); request.current = null;
      setMessage('Link saved · pending source checks.');
    } catch { if (alive.current) setMessage('Save not confirmed. Retry the same link to check safely.'); }
    finally { if (alive.current) setBusy(false); }
  }
  return <details className="gx-ra-evidence"><summary>Sources and submitted links</summary>
    <form onSubmit={submit} className="gx-vstack gx-gap-12"><label className="gx-ra-select gx-t-body">Research post URL<input type="url" value={url} onChange={e => setUrl(e.target.value)} disabled={busy} maxLength={600} required autoComplete="off"/></label>
      <Button type="submit" disabled={busy}>{busy ? 'Saving link…' : 'Submit research link'}</Button><p className="gx-t-body" role="status">{message}</p></form>
    {links.length ? <ul className="gx-ra-links">{links.map(l => <li key={l.id}><a className="gx-ra-link" href={l.url} target="_blank" rel="noreferrer">{submittedResearchLink(l.url).sourceId} · submitted post</a><span className="gx-t-meta">Pending · {readableTime(l.createdAt)}</span></li>)}</ul> : null}
  </details>;
}

export default function ResearchAssessments({ onDirty, onTrack }) {
  const lines = useLinesData(), shell = useShell(), route = shell.state.views.bets;
  const [market, setMarket] = useState(''), [color, setColor] = useState(''), [limit, setLimit] = useState(20);
  const gameId = route.matchup || undefined;
  const read = useAssessments({ ...lines, gameId, market: market || undefined, color: color || undefined });
  const data = read.data, a = data?.assessments.find(a => a.routeId === route.assessment);
  const select = id => shell.go('bets', { view: 'research', ...(gameId ? { matchup: gameId } : {}), assessment: id ?? null });
  const rows = (data?.assessments ?? []).filter(a => !color || a.color === color);
  const track = a => {
    const s = a.selection, leg = { gameId: a.gameId, market: s.market, side: s.side, line: s.line,
      ...(s.market === 'prop' ? { selection: `${s.playerName} ${s.side} ${s.line ?? ''} ${s.key.replace(/^player_/, '').replaceAll('_', ' ')}` } : {}) };
    onTrack?.({ season: data.season, week: data.week, kind: 'single', legs: [leg], odds: a.quote.odds, source: a.quote.source, quotedAt: a.quote.observedAt, stakeUnits: null });
  };
  return <section className="gx-screen gx-ra" aria-labelledby="gx-ra-title">
    <header className="gx-ra-heading"><h1 id="gx-ra-title" className="gx-t-title">Research recommendations</h1><InfoButton {...INFO}/></header>
    <Button variant="secondary" onClick={() => shell.go('bets', { view: 'recommended' })}>Your guess vs. market</Button>
    {!a ? <div className="gx-ra-filters"><Select label="Market" value={market} onChange={v => { setMarket(v); setLimit(20); }} options={[[ '', 'All markets'], ['spread', 'Spreads'], ['total', 'Totals'], ['moneyline', 'Moneylines'], ['prop', 'Player props']]}/>
      <Select label="Assessment" value={color} onChange={v => { setColor(v); setLimit(20); }} options={[[ '', 'All assessments'], ...Object.entries(ASSESSMENT_LABELS)]}/></div> : null}
    {read.status === 'loading' ? <p role="status" className="gx-t-body">Loading research assessments…</p> : read.status === 'error' ? <div><p role="status" className="gx-t-body">Research is unavailable right now.</p><Button variant="secondary" onClick={read.reload}>Retry research</Button></div> : null}
    {data ? <Nest label="Research assessments" title={a ? a.title : gameId ? gameId.replace('-', ' at ') : 'Assessed bets'} layer={a?.id ?? 'list'}
      lips={a ? [{ key: 'list', label: 'Assessed bets', onOpen: () => select(null) }] : []}>
      {a ? <AssessmentDetail assessment={a} onTrack={onTrack ? track : null}/> : <>
        <p className="gx-t-meta">Schedule order · qualitative assessments</p>
        {!rows.length ? <p className="gx-t-body">No assessed bets match this view.</p> : rows.slice(0, limit).map(a => <button className="gx-ra-tile" key={a.id} type="button" data-assessment={a.color} onClick={() => select(a.routeId)}><span className="gx-t-strong">{a.title}</span><span className="gx-t-body">{a.label}</span>{a.hasConflicts ? <span className="gx-t-meta">Opposing evidence present</span> : null}</button>)}
        {rows.length > limit ? <Button variant="secondary" onClick={() => setLimit(n => n + 20)}>Show more assessments</Button> : null}
        <Button variant="secondary" onClick={read.reload}>Refresh research</Button>
        <details className="gx-ra-evidence"><summary>Source availability</summary>{data.sources.map(s => <p className="gx-t-body" key={s.id}>{s.name}{s.id === 'bookitwithtrent' ? ' · separate feed' : ''}: {s.status === 'available' ? 'Source available' : 'Automatic access unavailable'}</p>)}</details>
        <ResearchLinkIntake key={lines.app.accountId} accountId={lines.app.accountId} onDirty={onDirty}/>
        {gameId ? (data.statistics ?? []).filter(s => s.gameId === gameId).map(stat => <details className="gx-ra-evidence" key={stat.gameId}><summary>Observed team statistics</summary>{stat.teams.map(t => <div className="gx-vstack gx-gap-8" key={t.team}><strong className="gx-t-body">{t.team}</strong><p className="gx-t-body">Scored: {t.pointsPerGame === null ? '—' : t.pointsPerGame.toFixed(1)} per game</p><p className="gx-t-body">Allowed: {t.pointsAllowedPerGame === null ? '—' : t.pointsAllowedPerGame.toFixed(1)} per game</p><p className="gx-t-meta">{t.sample} games · {t.from ?? '—'} to {t.to ?? '—'}</p><p className="gx-t-body">{t.definition}</p><a className="gx-ra-link" href="https://github.com/nflverse/nflverse-data/releases/tag/schedules" target="_blank" rel="noreferrer">Data: nflverse schedules · CC BY 4.0</a></div>)}</details>) : null}
        {gameId ? (data.playStatistics ?? []).filter(s => s.gameId === gameId).map(stat => <details className="gx-ra-evidence" key={`plays-${stat.gameId}`}><summary>Observed play statistics</summary>{stat.teams.map(t => <div className="gx-vstack gx-gap-8" key={t.team}><strong className="gx-t-body">{t.team}</strong>{t.metrics.map(m => <details className="gx-ra-evidence" key={m.id}><summary>{m.title}</summary><p className="gx-t-body">{m.value === null ? '—' : m.unit === 'share' ? `${(m.value * 100).toFixed(1)}%` : m.value.toFixed(2)} {m.unit === 'share' ? '' : m.unit}</p><p className="gx-t-meta">Sample {m.sample} · excluded {m.excluded}</p><p className="gx-t-body">{m.definition}</p></details>)}<p className="gx-t-meta">Data through {readableTime(t.asOf)}</p><a className="gx-ra-link" href={t.sourceUrl} target="_blank" rel="noreferrer">Data: nflverse · CC BY 4.0</a></div>)}</details>) : null}
      </>}
    </Nest> : null}
  </section>;
}
