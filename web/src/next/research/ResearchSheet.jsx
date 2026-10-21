import { useId, useState } from 'react';
import { useLinesData } from '../lines/linesData.js';
import { useShell } from '../shell/context.js';
import { Button, Segmented, Sheet } from '../ui/index.js';
import { PERIODS, ResearchCards, ResearchLeans, ResearchSources, ResearchStatus } from './ResearchCards.jsx';
import { useResearch } from './useResearch.js';
import './research.css';

function Select({ label, value, onChange, options }) {
  const id = useId();
  return <div className="gx-r-filter gx-t-body"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e => onChange(e.target.value)}>{options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></div>;
}
export function ResearchSheet({ args = {} }) {
  const shell = useShell(), lines = useLinesData();
  const [section, setSection] = useState('week'), [period, setPeriod] = useState('recent30');
  const [market, setMarket] = useState(''), [family, setFamily] = useState(''), [team, setTeam] = useState('');
  const [kind, setKind] = useState('all'), [limit, setLimit] = useState(12);
  const [leanGame, setLeanGame] = useState('');
  const filters = { period, ...(section === 'explore' ? { ...(market ? { market } : {}), ...(family ? { family } : {}), ...(team ? { team } : {}) } : {}) };
  const request = { ...lines, gameId: args.game, filters };
  const read = useResearch(request), data = read.data;
  const close = () => { if (shell.confirmLeave()) shell.closeSheet(); };
  const change = setter => value => { setter(value); setLimit(12); };
  const explore = (data?.explore ?? []).filter(id => {
    const c = data.candidates.find(c => c.id === id);
    return kind === 'all' || (kind === 'consistent' ? c?.qualification.qualifies : !c?.qualification.qualifies);
  });
  const teams = [...new Set((lines.personal.data?.games ?? []).flatMap(g => [g.awayCode, g.homeCode]).filter(Boolean))].sort();
  const selectedGame = args.game ?? (data?.games.some(g => g.id === leanGame) ? leanGame : data?.games[0]?.id);
  return <Sheet title={args.game ? `Trends · ${args.game.replace('-', ' at ')}` : 'Trends'} onClose={close} tall className="gx-r-sheet">
    <div className="gx-r-tabs"><Segmented label="Research section" options={[{ value: 'week', label: 'This week' }, { value: 'explore', label: 'Explore' }, { value: 'trent', label: 'Book It With Trent' }]} value={section} onChange={setSection}/></div>
    {section !== 'trent' ? <Select label="Evidence period" value={period} onChange={change(setPeriod)} options={Object.entries(PERIODS)}/> : null}
    {section === 'explore' ? <>
      <Segmented label="Consistency filter" options={[{ value: 'all', label: 'All' }, { value: 'consistent', label: 'Consistent' }, { value: 'emerging', label: 'Emerging' }]} value={kind} onChange={change(setKind)}/>
      <div className="gx-r-filters">
        <Select label="Market" value={market} onChange={change(setMarket)} options={[[ '', 'Spread and total'], ['spread', 'Spread'], ['total', 'Total']]}/>
        <Select label="Team" value={team} onChange={change(setTeam)} options={[[ '', 'All teams'], ...teams.map(t => [t, t])]}/>
        <Select label="Supported situation" value={family} onChange={change(setFamily)} options={[[ '', 'All supported situations'], ...(data?.filters?.families ?? []).map(f => [f, f === 'primetime' ? 'Game time' : f.replaceAll('_', ' ')])]}/>
      </div>
    </> : null}
    <ResearchStatus read={read}/>
    {data ? <>
      {section !== 'trent' ? <p className="gx-t-meta" role="status">History: {data.history.status}. Snapshot: {data.history.snapshotAsOf ?? 'Unknown'}. Period anchored to {data.history.periodAnchor ?? 'Unknown'}. {data.history.status !== 'fresh' ? 'Current leans may be unavailable; dated historical evidence remains descriptive.' : ''}</p> : null}
      {section !== 'trent' && data.history.source ? <div className="gx-vstack gx-gap-2">
        <a className="gx-r-link gx-t-meta" href={data.history.source.url} target="_blank" rel="noopener noreferrer">{data.history.source.credit}</a>
        <p className="gx-t-meta">{data.history.source.modified} {data.history.source.caveat}</p>
        <a className="gx-r-link gx-t-meta" href={data.history.source.licenseUrl} target="_blank" rel="noopener noreferrer">{data.history.source.license}</a>
      </div> : null}
      {section === 'week' ? <>
        <h3 className="gx-t-section">{args.game ? 'For this matchup' : 'This week’s shortlist'}</h3>
        <p className="gx-t-meta">Consistent, not proven. Display periods do not change qualification or lean evidence.</p>
        <ResearchCards data={data} limit={3} request={request} gameId={args.game}/>
        <Button variant="secondary" onClick={() => setSection('explore')}>Explore situations</Button>
        {!args.game ? <Select label="Research lean for matchup" value={selectedGame ?? ''} onChange={setLeanGame} options={data.games.map(g => [g.id, g.id.replace('-', ' at ')])}/> : null}
        <ResearchLeans data={data} gameId={selectedGame} request={{ ...request, gameId: selectedGame }}/>
      </> : section === 'explore' ? <>
        <p className="gx-t-meta">Emerging research does not vote on a lean. Filters change this list and selected records, not the full evidence used for leans.</p>
        <ResearchCards data={data} ids={explore} limit={limit} request={request} gameId={args.game}/>
        {explore.length > limit ? <Button variant="secondary" onClick={() => setLimit(n => n + 12)}>Show more situations</Button> : null}
        <ResearchSources sources={data.sources}/>
      </> : <ResearchSources trent={data.trent}/>}
    </> : null}
  </Sheet>;
}

/** Used in the matchup only when this newer reader is available; legacy research retains its unavailable fallback. */
export function MatchupResearch({ lines, gameId, fallback }) {
  const shell = useShell(), request = { ...lines, gameId };
  const read = useResearch(request);
  return <div className="gx-vstack gx-gap-12">
    {read.data ? <ResearchCards data={read.data} limit={3} request={request} gameId={gameId}/> : fallback}
    <Button variant="secondary" onClick={() => shell.openSheet('sh.research', { game: gameId })}>Open matchup research</Button>
  </div>;
}
