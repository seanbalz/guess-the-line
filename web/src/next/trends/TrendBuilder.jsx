// Trends › Build (proposed D-63): choose a side and up to three conditions the prepared history supports, then see the
// record against the nflverse closing line, the built-on and held-out periods, the contributing games and which of this
// week's games fit. A built trend is always "Found by search — not tested"; nothing here ranks or sorts by result.
// Saved trends live on this device only (no account sync, no alerts yet).
import { Fragment, useId, useMemo, useState } from 'react';
import {
  BUILDER_COPY, MAX_FILTERS, MAX_SAVED, SIDES, WHO, cleanSpec, conditionOf, conditionOptions, evaluateSpec, filterText,
  fmtInterval, fmtPct, fmtRecord, fmtUnits, lineText, resultWord, specKey, specNeeds, specTitle, weekMatches,
} from '../../../../shared/trend-builder.mjs';
import { lockedTrendText } from '../../../../shared/lines-view.mjs';
import { Button, Card, InfoButton, Pill, Segmented } from '../ui/index.js';
import { INFO } from '../info.js';
import { Select } from './PlayerEvidence.jsx';
import { useBuilderHistory, useSavedTrends, weekGamesFor } from './builderData.js';

const PAGE = 25;
const steps = c => { const out = []; for (let x = c.min; x <= c.max + 1e-9; x += c.step) out.push(Math.round(x * 10) / 10); return out; };
const rangeLabel = (c, x, top) => (c.id === 'seasons' ? (top && x === c.max ? `${x} and later` : String(x)) : top && x === c.max ? `${x} or more` : String(x));
// The draft survives switching Trends sections for this page's life (not stored).
let draft = null;

function FilterRow({ spec, filter, index, onChange, onRemove }) {
  const c = conditionOf(filter.id);
  const name = filterText(spec, filter);
  return <li className="gx-vstack gx-gap-8 gx-tb-filter" data-filter={filter.id}>
    <p className="gx-t-strong">{name}</p>
    {c.kind === 'team' ? <Select label={`Which team · condition ${index + 1}`} value={filter.who} onChange={who => onChange({ ...filter, who })}>
      {WHO[spec.market].map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
    </Select> : null}
    {c.kind === 'range' ? <div className="gx-tr-filters">
      <Select label={`From · condition ${index + 1}`} value={String(filter.min)} onChange={v => onChange({ ...filter, min: Number(v) })}>
        {steps(c).map(x => <option key={x} value={String(x)}>{rangeLabel(c, x, false)}</option>)}
      </Select>
      <Select label={`To · condition ${index + 1}`} value={String(filter.max)} onChange={v => onChange({ ...filter, max: Number(v) })}>
        {steps(c).map(x => <option key={x} value={String(x)}>{rangeLabel(c, x, true)}</option>)}
      </Select>
    </div> : null}
    {c.needs === 'weather' ? <p className="gx-t-meta">Needs observed kickoff weather: past games only. This week’s games can’t be checked before kickoff.</p> : null}
    <Button variant="ghost" onClick={onRemove} aria-label={`Remove condition: ${name}`}>Remove</Button>
  </li>;
}

function Facts({ rows }) {
  return <dl className="gx-tr-facts" data-builder="facts">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl>;
}

function PeriodRow({ label, r }) {
  return <tr><th scope="row">{label}</th><td>{r.n ? fmtRecord(r) : 'No games'}</td><td>{fmtPct(r.coverRate)}</td><td>{r.n}</td></tr>;
}

export function BuilderResult({ result, credit }) {
  const [shown, setShown] = useState(PAGE);
  const id = useId();
  const { record, split, series, games, spec, excluded } = result;
  const recent = games.slice().reverse().slice(0, shown); // newest first: date order, never by result
  const small = record.decided < 30;
  return <Card as="section" className="gx-vstack gx-gap-12" aria-labelledby={id} data-builder="result">
    <div className="gx-tb-context"><h3 className="gx-t-section gx-grow gx-tb-title" id={id}>{specTitle(spec)}</h3><InfoButton {...INFO.trendBuilder}/></div>
    <p><Pill tone="pending" className="gx-tb-pill" data-builder="label">{BUILDER_COPY.label}</Pill></p>
    <p className="gx-t-meta">{BUILDER_COPY.labelBody}</p>
    <Facts rows={[
      ['Record (W-L-P)', fmtRecord(record)],
      ['Cover rate', `${fmtPct(record.coverRate)}${record.decided ? ' · pushes excluded' : ''}`],
      ['Wilson 95% interval', fmtInterval(record.wilson95)],
      ['Sample', `${record.n} games${small ? ' · small sample' : ''}`],
      ['Dates', record.n ? `${record.from} to ${record.to}` : '—'],
      [BUILDER_COPY.units, fmtUnits(record.units)],
    ]}/>
    {excluded.unknown ? <p className="gx-t-meta">{excluded.unknown} games left out because a chosen condition is unknown there. {BUILDER_COPY.unknown}</p> : null}
    <section className="gx-vstack gx-gap-8" aria-label={BUILDER_COPY.splitTitle} data-builder="split" data-split={split.state}>
      <h4 className="gx-t-strong">{BUILDER_COPY.splitTitle}</h4>
      <div className="gx-tr-table gx-tb-table" role="region" aria-label="Period records" tabIndex={0}><table>
        <caption className="gx-t-meta">Same side and conditions in each period</caption>
        <thead><tr><th scope="col">Period</th><th scope="col">W-L-P</th><th scope="col">Cover rate</th><th scope="col">Games</th></tr></thead>
        <tbody><PeriodRow label="Built on 2002–2017" r={split.builtOn}/><PeriodRow label="Held out 2018 on" r={split.holdOut}/></tbody>
      </table></div>
      <p className="gx-t-body" data-builder="split-label">{split.text}</p>
      <p className="gx-t-meta">{BUILDER_COPY.splitBody}</p>
    </section>
    {series.length ? <div className="gx-vstack gx-gap-8">
      <p className="gx-t-label">{BUILDER_COPY.units} · cumulative by season</p>
      <div className="gx-tr-table gx-tb-table" role="region" aria-label="Season records" tabIndex={0}><table>
        <caption className="gx-t-meta">Each season’s record; units are cumulative</caption>
        <thead><tr><th scope="col">Season</th><th scope="col">W-L-P</th><th scope="col">Games</th><th scope="col">Units</th></tr></thead>
        <tbody>{series.map(s => <tr key={s.season}><th scope="row">{s.season}</th><td>{fmtRecord(s)}</td><td>{s.n}</td><td>{fmtUnits(s.illustrativeUnits)}</td></tr>)}</tbody>
      </table></div>
    </div> : <p className="gx-t-body">No played game fits these conditions.</p>}
    {games.length ? <details className="gx-tr-details" data-builder="games"><summary className="gx-t-strong">Contributing games · {games.length}</summary>
      <div className="gx-tr-table gx-tb-table" role="region" aria-label="Contributing games, newest first" tabIndex={0}><table>
        <caption className="gx-t-meta">Newest first · final score · {spec.market === 'spread' ? 'closing spread' : 'closing total'}</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Game</th><th scope="col">Final</th><th scope="col">Line</th><th scope="col">{spec.market === 'spread' ? 'Backed' : 'Side'}</th><th scope="col">Result</th></tr></thead>
        <tbody>{recent.map(g => <tr key={g.i}><th scope="row">{g.date}</th><td>{g.away} @ {g.home}</td><td>{g.as}–{g.hs}</td><td>{lineText(spec.market, g)}</td><td>{spec.market === 'spread' ? (g.backed === 0 ? g.home : g.away) : spec.side === 'over' ? 'Over' : 'Under'}</td><td>{resultWord(g.result)}</td></tr>)}</tbody>
      </table></div>
      {games.length > shown ? <Button variant="secondary" onClick={() => setShown(n => n + PAGE)}>Show {Math.min(PAGE, games.length - shown)} more games</Button> : null}
    </details> : null}
    <p className="gx-t-meta">{BUILDER_COPY.reference} Line: {BUILDER_COPY.lineSource}.</p>
    {credit ? <a className="gx-l-link gx-t-meta" href={credit.url} target="_blank" rel="noreferrer">{credit.credit}</a> : null}
  </Card>;
}

function matchText(row, spec) {
  if (row.state === 'match') return spec.market === 'spread' ? `Fits · backs ${row.side}` : `Fits · ${spec.side === 'over' ? 'Over' : 'Under'}`;
  return '';
}
/** This week's games against the spec: fits, could fit once a market opens, can't be checked yet. Never a line value. */
export function WeekMatches({ spec, games, week, status }) {
  if (!games) return <p className="gx-t-body" role="status">{status === 'error' ? 'This week’s games could not load. Retry trends to check them.' : 'Checking this week’s games…'}</p>;
  const { rows } = weekMatches(spec, { games, week });
  const byId = new Map(games.map(g => [g.id, g]));
  const needs = specNeeds(spec);
  const gate = needs.size === 2 ? 'both' : [...needs][0];
  const upcoming = rows.filter(r => !r.started);
  const fits = upcoming.filter(r => r.state === 'match'), locked = upcoming.filter(r => r.state === 'locked'), unknown = upcoming.filter(r => r.state === 'unknown');
  const rest = upcoming.length - fits.length - locked.length - unknown.length;
  return <section className="gx-vstack gx-gap-8" aria-label="This week’s matches" data-builder="week">
    <h3 className="gx-t-section">This week’s matches</h3>
    <p className="gx-t-body" data-builder="match-count">{fits.length ? `${fits.length} upcoming ${fits.length === 1 ? 'game fits' : 'games fit'} this trend.` : 'No upcoming game fits this trend yet.'}</p>
    {fits.length ? <ul className="gx-vstack gx-gap-4">{fits.map(r => <li key={r.id} className="gx-t-body" data-match="fits">{r.title} · {matchText(r, spec)}</li>)}</ul> : null}
    {locked.length ? <div className="gx-vstack gx-gap-4"><p className="gx-t-strong">Could fit once your line opens · {locked.length}</p>
      <ul className="gx-vstack gx-gap-4">{locked.map(r => <li key={r.id} className="gx-t-meta" data-match="locked">{r.title} · {lockedTrendText(gate, byId.get(r.id)?.rules)}</li>)}</ul></div> : null}
    {unknown.length ? <div className="gx-vstack gx-gap-4"><p className="gx-t-strong">Can’t be checked yet · {unknown.length}</p>
      <ul className="gx-vstack gx-gap-4">{unknown.map(r => <li key={r.id} className="gx-t-meta" data-match="unknown">{r.title} · needs observed weather, a game-day roof or your own saved line</li>)}</ul></div> : null}
    {rest ? <p className="gx-t-meta">{rest} other upcoming {rest === 1 ? 'game doesn’t' : 'games don’t'} fit.</p> : null}
    <p className="gx-t-meta">A fit describes the situation only; it is not a pick or a recommendation.</p>
  </section>;
}

/** Saved trends on this device, in the order saved, each with its matches this week. */
export function SavedTrends({ items, games, week, onOpen, onRemove }) {
  if (!items.length) return <p className="gx-t-meta">No saved trends on this device yet.</p>;
  return <ul className="gx-vstack gx-gap-8" aria-label="Saved trends" data-builder="saved">{items.map(item => {
    const m = games ? weekMatches(item.spec, { games, week }) : null;
    const title = specTitle(item.spec);
    return <li key={item.id}><Card className="gx-vstack gx-gap-8" data-saved={item.id}>
      <p className="gx-t-strong">{title}</p>
      <p className="gx-t-meta">{!m ? 'Checking this week…' : m.matches ? <Pill tone="data" data-builder="saved-matches">Matches this week · {m.matches}</Pill> : 'No matches this week'}{m?.waiting ? ` · ${m.waiting} more could fit once your line opens` : ''}</p>
      <div className="gx-hstack gx-gap-8"><Button variant="secondary" onClick={() => onOpen(item)} aria-label={`Open saved trend: ${title}`}>Open</Button>
        <Button variant="ghost" onClick={() => onRemove(item.id)} aria-label={`Delete saved trend: ${title}`}>Delete</Button></div>
    </Card></li>;
  })}</ul>;
}

/** The Build section. `market` is the Trends screen's own market control; `onMarket` changes it. */
export function TrendBuilder({ lines, market, onMarket }) {
  const history = useBuilderHistory(true);
  const saved = useSavedTrends();
  const [spec, setSpecState] = useState(() => cleanSpec(draft?.market === market ? draft : { market, side: SIDES[market][0].value, filters: [] }));
  const [notice, setNotice] = useState('');
  const current = spec.market === market ? spec : cleanSpec({ ...spec, market, side: SIDES[market][0].value });
  const setSpec = next => { const clean = cleanSpec(next); draft = clean; setSpecState(clean); setNotice(''); };
  const result = useMemo(() => (history.history ? evaluateSpec(history.history, current) : null), [history.history, specKey(current)]);
  const games = weekGamesFor(lines);
  const week = lines.shown?.week;
  const used = new Set(current.filters.map(f => f.id));
  const add = id => {
    if (!id) return;
    const c = conditionOf(id);
    const filter = c.kind === 'range' ? { id, min: c.id === 'seasons' ? 2018 : c.id === 'spread' ? 3 : 41, max: c.max } : c.kind === 'team' ? { id, who: current.market === 'spread' ? 'pick' : 'either' } : { id };
    setSpec({ ...current, filters: [...current.filters, filter] });
  };
  const isSaved = saved.items.some(i => specKey(i.spec) === specKey(current));
  const save = () => {
    const r = saved.save(current);
    setNotice(r.ok ? 'Saved on this device.' : r.full ? `This device holds ${MAX_SAVED} saved trends. Delete one to save another.` : 'This browser would not save it. Private browsing can block saving.');
  };
  const open = item => { draft = item.spec; if (item.spec.market !== market) onMarket(item.spec.market); setSpecState(item.spec); setNotice(''); };
  return <div className="gx-vstack gx-gap-16" data-builder="root">
    <section className="gx-vstack gx-gap-12" aria-label="Build a trend">
      <div className="gx-tb-context"><h2 className="gx-t-section gx-grow">Build a trend</h2><InfoButton {...INFO.trendBuilder}/></div>
      <p className="gx-t-meta">Pick a side and up to {MAX_FILTERS} conditions. Records use played games since 2002 against the closing line. Nothing is ranked by results.</p>
      <div className="gx-tb-tabs"><Segmented label="Builder side" value={current.side} options={SIDES[current.market]} onChange={side => setSpec({ ...current, side })}/></div>
      {current.filters.length ? <ol className="gx-vstack gx-gap-12 gx-tb-filters" aria-label="Chosen conditions">{current.filters.map((f, i) => <FilterRow key={f.id} spec={current} filter={f} index={i}
        onChange={next => setSpec({ ...current, filters: current.filters.map(x => (x.id === f.id ? next : x)) })}
        onRemove={() => setSpec({ ...current, filters: current.filters.filter(x => x.id !== f.id) })}/>)}</ol> : <p className="gx-t-meta">No conditions yet: every game for this side.</p>}
      {current.filters.length < MAX_FILTERS ? <Select label="Add a condition" value="" onChange={add}>
        <option value="">Choose a condition…</option>
        {conditionOptions().map(g => <optgroup key={g.group} label={g.group}>{g.items.filter(i => !used.has(i.id)).map(i => <option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>)}
      </Select> : <p className="gx-t-meta">{MAX_FILTERS} conditions is the most a trend can have.</p>}
      <div className="gx-hstack gx-gap-8"><Button variant="primary" onClick={save} disabled={isSaved}>{isSaved ? 'Saved on this device' : 'Save trend'}</Button></div>
      {notice ? <p className="gx-t-meta" role="status">{notice}</p> : null}
    </section>
    {history.status === 'error' ? <Card role="alert"><p className="gx-t-body">Trend history didn’t load.</p><Button onClick={history.retry}>Retry</Button></Card>
      : !result ? <p className="gx-t-body" role="status">Loading trend history…</p>
      : <BuilderResult key={specKey(current)} result={result} credit={history.history.meta.source}/>}
    <WeekMatches spec={current} games={games} week={week} status={lines.trends?.status}/>
    <section className="gx-vstack gx-gap-8" aria-label="Saved on this device">
      <h3 className="gx-t-section">Saved on this device</h3>
      <SavedTrends items={saved.items} games={games} week={week} onOpen={open} onRemove={saved.remove}/>
      <p className="gx-t-meta">Saved trends stay on this device. Alerts are not available yet.</p>
    </section>
  </div>;
}
