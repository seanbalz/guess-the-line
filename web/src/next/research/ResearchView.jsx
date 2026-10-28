import { useId, useState } from 'react';
import { useLinesData } from '../lines/linesData.js';
import { Button, InfoButton, Segmented } from '../ui/index.js';
import { PERIODS, ResearchCards, ResearchLeans, ResearchSources, ResearchStatus, ResearchTime } from './ResearchCards.jsx';
import { useResearch } from './useResearch.js';
import { INFO } from '../info.js';
import './research.css';

function Select({ label, value, onChange, options }) {
  const id = useId();
  return <div className="gx-r-filter gx-t-body"><label htmlFor={id}>{label}</label><select id={id} value={value} onChange={e => onChange(e.target.value)}>{options.map(([key, text]) => <option value={key} key={key}>{text}</option>)}</select></div>;
}
export default function ResearchView({ args = {} }) {
  const lines = useLinesData();
  const [section, setSection] = useState('week'), [period, setPeriod] = useState('recent30');
  const [market, setMarket] = useState(''), [family, setFamily] = useState(''), [team, setTeam] = useState('');
  const [kind, setKind] = useState('all'), [limit, setLimit] = useState(12);
  const [leanGame, setLeanGame] = useState('');
  const filters = { period, ...(section === 'explore' ? { ...(market ? { market } : {}), ...(family ? { family } : {}), ...(team ? { team } : {}) } : {}) };
  const request = { ...lines, gameId: args.game, filters };
  const read = useResearch(request), data = read.data;
  const change = setter => value => { setter(value); setLimit(12); };
  const explore = (data?.explore ?? []).filter(id => {
    const c = data.candidates.find(c => c.id === id);
    return kind === 'all' || (kind === 'consistent' ? c?.qualification.qualifies : !c?.qualification.qualifies);
  });
  const teams = [...new Set((lines.personal.data?.games ?? []).flatMap(g => [g.awayCode, g.homeCode]).filter(Boolean))].sort();
  const selectedGame = args.game ?? (data?.games.some(g => g.id === leanGame) ? leanGame : data?.games[0]?.id);
  return <>
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
      {section !== 'trent' ? <>
        <div className="gx-r-context">
          <p className="gx-t-meta gx-grow" role="status">History: {data.history.status}</p>
          <InfoButton {...INFO.researchData} body={[
            ...INFO.researchData.body,
            data.history.source?.modified, data.history.source?.caveat,
          ]} links={data.history.source ? [
            { text: data.history.source.credit, url: data.history.source.url },
            { text: data.history.source.license, url: data.history.source.licenseUrl },
          ] : INFO.researchData.links}>
            <p className="gx-t-body gx-c-2">Snapshot: <ResearchTime value={data.history.snapshotAsOf}/></p>
            <p className="gx-t-body gx-c-2">Period anchored to <ResearchTime value={data.history.periodAnchor}/></p>
          </InfoButton>
        </div>
        {data.history.status !== 'fresh' ? <p className="gx-t-meta">Current leans may be unavailable; dated historical evidence remains descriptive.</p> : null}
      </> : null}
      {section === 'week' ? <>
        <h3 className="gx-t-section">{args.game ? 'For this matchup' : 'This week’s shortlist'}</h3>
        <ResearchCards data={data} limit={3} request={request} gameId={args.game}/>
        <Button variant="secondary" onClick={() => setSection('explore')}>Explore situations</Button>
        {!args.game ? <Select label="Research lean for matchup" value={selectedGame ?? ''} onChange={setLeanGame} options={data.games.map(g => [g.id, g.id.replace('-', ' at ')])}/> : null}
        <ResearchLeans data={data} gameId={selectedGame} request={{ ...request, gameId: selectedGame }}/>
      </> : section === 'explore' ? <>
        <ResearchCards data={data} ids={explore} limit={limit} request={request} gameId={args.game}/>
        {explore.length > limit ? <Button variant="secondary" onClick={() => setLimit(n => n + 12)}>Show more situations</Button> : null}
        <ResearchSources sources={data.sources}/>
      </> : <ResearchSources trent={data.trent}/>}
    </> : null}
  </>;
}
