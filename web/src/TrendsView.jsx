import React, { useId, useState } from 'react';
import {
  TRENDS_CREDIT, TRENDS_LICENSE_URL, TRENDS_SOURCE_URL, WIND_COPY, appSpreadToNflverse, familyTitle, fmtNumber, gateOpen, itemApplies, itemTitle,
  lineAtoms, parseItem, refereeFor, refereeRows, windNote, windView,
} from '../../shared/trends-view.mjs';
import { weatherRow } from '../../shared/weather-view.mjs';
import { Heading, RowCard, TrendCard, TrendTable } from './TrendCard.jsx';
import WindForecast, { WindCredit } from './WindForecast.jsx';
import './trends.css';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const MARKET = { spread: 'Spread', total: 'Total' };
const appSpread = (home, value) => (value === 0 ? "Pick'em" : `${home} ${value > 0 ? '+' : '−'}${fmtNumber(Math.abs(value))}`);

function Section({ title, level, className = '', children }) {
  const id = useId();
  return <section className={`trends-section ${className}`} aria-labelledby={id}><Heading level={level} id={id}>{title}</Heading>{children}</section>;
}

/** Referee: the commissioner's assignment, else the week file's, else "Referee not assigned yet"; any member can look up another referee on this screen only. */
function RefereeSection({ week, game, officials, total, level }) {
  const assigned = refereeFor(week, game.id, officials);
  const [choice, setChoice] = useState(''), selectId = useId();
  const name = choice || assigned.name, rows = refereeRows(week, name, game, { total });
  const [career, ...modifiers] = rows;
  return <Section title="Referee" level={level} className="trends-referee">
    <p className="trend-referee-status" role="status">{assigned.name
      ? <>Assigned referee: <strong>{assigned.name}</strong> ({assigned.source === 'commissioner' ? 'set by the commissioner' : 'from this week’s trends file'})</>
      : <>Referee not assigned yet. Crews are announced during game week, and the commissioner enters them.</>}</p>
    <div className="trend-referee-pick">
      <label htmlFor={selectId}>Look up a referee for {game.away} at {game.home}</label>
      <select id={selectId} value={choice} onChange={event => setChoice(event.target.value)}>
        <option value="">{assigned.name ? `Assigned referee (${assigned.name})` : 'Not assigned yet'}</option>
        {week.refereeOptions.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
    {choice && choice !== assigned.name && <p className="trend-note">Viewing {choice}, not the assignment. This choice stays on this screen and is not saved.</p>}
    {name && !week.referees?.[name] && <p className="trend-note">No referee records for {name} in this file (no games as referee in the last three seasons of the schedule file).</p>}
    {career && <RowCard week={week} id={career.id} title={`Referee ${name}: career over/under`} level={level + 1}/>}
    {modifiers.length > 0 && <TrendTable week={week} caption={`${name}: career home vs road and the situations that fit this game`} items={modifiers.map(row => ({ id: row.id }))}/>}
    {!total && name && week.referees?.[name] && <p className="trend-note">The referee’s record in this game’s total band shows after your Total ballot.</p>}
  </Section>;
}

function GatedSection({ week, game, gate, access, lines, atoms, savedText, level }) {
  const rows = (game.gated?.[gate] || []).map(parseItem), cards = game.gatedCards?.[gate] || [], bands = week.bandTables?.[gate] || {};
  const count = rows.length + cards.length + Object.values(bands).reduce((n, ids) => n + ids.length, 0);
  if (!count) return null;
  const needs = gate === 'both' ? 'both your Spread and Total ballots' : `your ${MARKET[gate]} ballot`;
  if (!gateOpen(access, gate)) {
    return <Section level={level} className="trends-gated" title={gate === 'both' ? 'Unlocks after both ballots' : `Unlocks after your ${MARKET[gate]} ballot`}>
      <p>{count} records for this game depend on the {gate === 'both' ? 'spread and the total together' : gate === 'spread' ? 'spread (favorite and underdog splits, spread bands and key numbers)' : 'total (total bands, key totals and the last meeting against this total)'}. They unlock after you submit or sit out {needs}, or {access?.revealAt === 'kickoff' ? 'once this game kicks off' : 'after the deadline'}. No line is shown before then.</p>
    </Section>;
  }
  const marks = {};
  for (const { id, team } of rows) if (itemApplies(id, team, game, atoms, lines) === true) marks[team ? `${id}@${team}` : id] = 'This game';
  const known = gate === 'spread' ? finite(lines.spread) : gate === 'total' ? finite(lines.total) : finite(lines.spread) && finite(lines.total);
  return <Section level={level} className="trends-gated" title={gate === 'both' ? 'Records that need both lines' : `${MARKET[gate]}-dependent records`}>
    <p className="trend-note">{known ? `Rows marked “This game” fit ${savedText}.` : 'Find this game’s band with your saved line; the trends file never carries this week’s line.'}</p>
    {cards.map(ref => {
      const card = week.cards[ref.card];
      if (!card) return null;
      const applies = itemApplies(ref.card, ref.team || null, game, atoms, lines);
      return <div className="trend-gated-card" key={`${ref.card}@${ref.team || ''}`}>
        <p className="trend-note">{applies === true ? 'This game fits at your saved line.' : applies === false ? 'This game does not fit at your saved line.' : ref.card.includes('g_fav_tt_ge28') ? 'Applies if the favorite’s implied total is 28 or more.' : 'Whether this game fits depends on a line or a game-day fact this screen does not hold.'}{ref.roofUnknown ? ` ${week.copy.roofConditional}.` : ''}</p>
        <TrendCard week={week} card={card} item={{ team: ref.team }} level={level + 1}/>
      </div>;
    })}
    <TrendTable week={week} caption="This game’s line-dependent records" items={rows} marks={marks}/>
    {Object.entries(bands).map(([family, ids]) => {
      const bandMarks = {};
      for (const id of ids) if (itemApplies(id, null, game, atoms, lines) === true) bandMarks[id] = 'This game';
      return <details className="trend-bands" key={family}><summary>{familyTitle(week, family)}: every band (the same for every game){Object.keys(bandMarks).length ? ' · this game marked' : ''}</summary>
        <TrendTable week={week} caption={`${familyTitle(week, family)} by band`} items={ids.map(id => ({ id }))} marks={bandMarks}/>
      </details>;
    })}
  </Section>;
}

function ContextFamily({ week, entry, level }) {
  const leads = [entry.lead?.ats, entry.lead?.ou].filter(Boolean).map(parseItem);
  const more = (entry.more || []).map(parseItem);
  const notes = [entry.unlocks?.length ? `More records unlock after your ${entry.unlocks.map(g => (g === 'both' ? 'Spread and Total' : MARKET[g])).join(' and ')} ballot.` : null,
    entry.playedOnly ? `${WIND_COPY.weatherConditional}.` : null, entry.pending ? 'Some records update after the final.' : null,
    entry.roofConditional ? `${week.copy.roofConditional}.` : null, entry.provisional ? week.copy.qbProvisional : null].filter(Boolean);
  return <Section title={familyTitle(week, entry.family)} level={level} className="trends-family">
    {notes.map(note => <p className="trend-note" key={note}>{note}</p>)}
    {!leads.length && !more.length && !notes.length && <p className="trend-note">Nothing in this family fits this game.</p>}
    <div className="trend-card-grid">{leads.map(({ id, team }) => <RowCard key={`${id}@${team}`} week={week} id={id} team={team} level={level + 1}/>)}</div>
    {more.length > 0 && <TrendTable week={week} caption="More in this family" items={more}/>}
  </Section>;
}

function Entities({ week, game, level }) {
  const { teams = {}, coaches = {}, qbs = {}, h2h = [] } = game.entities || {};
  const teamRows = Object.entries(teams).flatMap(([team, e]) => [{ id: e.ats, team }, { id: e.ou }, { id: e.su, team }]);
  const coachRows = Object.entries(coaches).flatMap(([team, c]) => [{ id: c.ats, team }, { id: c.ou }]);
  const qbRows = Object.entries(qbs).flatMap(([team, q]) => [{ id: q.ats, team }, { id: q.ou }]);
  return <details className="trends-entities"><summary>Teams, coaches, quarterbacks and head to head</summary>
    <TrendTable week={week} caption="Teams in this game’s home or road role" items={teamRows}/>
    <TrendTable week={week} caption="Head coaches, career" items={coachRows}/>
    {qbRows.length > 0 && <><p className="trend-note">{week.copy.qbProvisional}</p><TrendTable week={week} caption="Starting quarterbacks, career (provisional)" items={qbRows}/></>}
    <Section title="Last meetings (within four years)" level={level}>
      {h2h.length ? <ul className="trend-h2h">{h2h.map(m => <li key={m.date}><span className="mono">{m.date}</span> {m.score} · ATS: {m.ats === 'push' ? 'push' : m.ats ? `${m.ats} covered` : 'no line'} · {m.ou || 'no total'}</li>)}</ul>
        : <p className="trend-note">No meetings in the last four years.</p>}
    </Section>
  </details>;
}

/**
 * The trends panel for one game: strongest evidence (a conditional note on upcoming games), the
 * consistent-not-proven cards, the watch list, the referee, Sean's families as context, the teams,
 * then the line-dependent records behind the matching ballot. Reference only; nothing here changes
 * GTL scoring. `saved` is the viewer's own saved line per market in app convention, used only for a
 * market whose ballot is already submitted, sat out or closed. `wind` is the gtl-api /wind/read answer
 * (D-34) or null, and `windNow` the effective server time for its ages (asOf plus the time since it
 * arrived); without them every game but a dome keeps the "no current forecast" note. Every game has a
 * weather row (D-45): the forecast card, "Indoors", or that note.
 */
export default function TrendsView({ week, gameId, access = {}, saved = {}, savedLabel = 'your saved line', officials = null, wind = null, windNow = null, windLoading = false, level = 4 }) {
  const game = week?.games?.find(g => g.id === gameId);
  if (!game) return <p className="trends-empty" role="status">No trends for this game in the Week {week?.week} trends file.</p>;
  const lines = { spread: access.spread ? appSpreadToNflverse(saved.spread) : null, total: access.total && finite(saved.total) ? saved.total : null };
  const atoms = lineAtoms(lines, game);
  const savedText = [finite(lines.spread) ? `${appSpread(game.home, saved.spread)} (${savedLabel})` : null, finite(lines.total) ? `total ${fmtNumber(saved.total)} (${savedLabel})` : null].filter(Boolean).join(' and ');
  const cardOf = id => week.cards?.[id];
  const evidence = (game.conditional || []).filter(c => cardOf(c.card)?.tier === 1), otherConditional = (game.conditional || []).filter(c => cardOf(c.card) && cardOf(c.card).tier !== 1);
  const indoor = game.flags?.roof === 'dome' || game.flags?.roof === 'closed';
  const windEntry = wind?.games?.[game.id] ?? null;
  const forecast = windView({ game, entry: windEntry, now: windNow, loading: windLoading });
  const weather = weatherRow({ ...game, kickoff: windEntry?.kickoff ?? game.kickoff }, windEntry?.venue ?? null, windEntry?.wind ?? null, windNow);
  const forecastShown = forecast.state === 'forecast' || forecast.state === 'final';
  const windText = note => windNote(week, note, forecastShown);
  const families = (game.context || []).filter(entry => entry.family !== 'referee');
  const sub = level + 1;
  return <div className="trends-panel">
    <p className="trends-intro">{week.copy.reference}</p>
    <p className="trends-intro muted">{WIND_COPY.evidence}</p>
    <Section title="Strongest historical evidence" level={level} className="trends-evidence">
      <WindForecast view={forecast} row={weather} week={week} level={sub} trends={evidence.length > 0}/>
      {evidence.map(c => <details className="trend-conditional" key={c.card}><summary><strong>{cardOf(c.card).title}: {cardOf(c.card).sideLabel}</strong> <span>{windText(c.note) || WIND_COPY.weatherConditional}</span></summary>
        <TrendCard week={week} card={cardOf(c.card)} level={sub}/></details>)}
      {!evidence.length && <p className="trend-note">{weather.roof === 'canopy' ? WIND_COPY.canopy : indoor ? WIND_COPY.indoor : 'No evidence-tier trend fits this game.'}</p>}
    </Section>
    {(game.tier2?.length > 0 || otherConditional.length > 0) && <Section title="Consistent, not proven" level={level} className="trends-tier2">
      <p className="trend-note">{week.copy.calibration}</p>
      <div className="trend-card-grid">{game.tier2.map(item => cardOf(item.card) && <TrendCard key={`${item.card}@${item.team || ''}`} week={week} card={cardOf(item.card)} item={item} level={sub}/>)}</div>
      {otherConditional.map(c => <details className="trend-conditional" key={`${c.card}@${c.team || ''}`}><summary><strong>{cardOf(c.card).title}{c.team ? ` · ${c.team}` : ''}</strong> <span>{windText(c.note)}</span></summary>
        <TrendCard week={week} card={cardOf(c.card)} item={{ team: c.team }} level={sub}/></details>)}
    </Section>}
    {(game.pending?.length > 0 || game.pendingCards?.length > 0) && <Section title="Updates after the final" level={level} className="trends-pending">
      <p className="trend-note">{game.pending?.length ? `${game.pending.join(' and ')} ${game.pending.length === 1 ? 'has' : 'have'} an earlier game without a final score, so records that need the previous game wait for it.` : 'These records wait for an earlier final.'}</p>
      {game.pendingCards?.length > 0 && <ul className="trend-list">{game.pendingCards.map(ref => <li key={`${ref.card}@${ref.team || ''}`}>{itemTitle(week, ref.card, ref.team || null)}</li>)}</ul>}
    </Section>}
    {game.watch?.length > 0 && <Section title="Watch list" level={level} className="trends-watch">
      <div className="trend-card-grid">{game.watch.map(item => cardOf(item.card) && <TrendCard key={`${item.card}@${item.team || ''}`} week={week} card={cardOf(item.card)} item={item} level={sub}/>)}</div>
    </Section>}
    <RefereeSection week={week} game={game} officials={officials} total={lines.total} level={level}/>
    <details className="trends-context"><summary>Context (no proven edge) · {families.length} {families.length === 1 ? 'family' : 'families'}</summary>
      <p className="trend-note">{week.copy.tier3}</p>
      {families.map(entry => <ContextFamily key={entry.family} week={week} entry={entry} level={level}/>)}
    </details>
    <Entities week={week} game={game} level={sub}/>
    {['spread', 'total', 'both'].map(gate => <GatedSection key={gate} week={week} game={game} gate={gate} access={access} lines={lines} atoms={atoms} savedText={savedText} level={level}/>)}
    {game.notes?.length > 0 && <ul className="trend-list trend-notes" aria-label="Notes">{game.notes.map(note => <li key={note}>{note}</li>)}</ul>}
    <footer className="trends-source">
      <p><a href={TRENDS_SOURCE_URL} target="_blank" rel="noreferrer">{TRENDS_CREDIT}</a> · <a href={TRENDS_LICENSE_URL} target="_blank" rel="noreferrer">License: CC BY 4.0</a>. {week.source?.caveat}</p>
      <p>{week.copy.lineSource}. Results through {week.asOf}; trends registered {week.registry?.registeredAt}. Trends never change GTL scoring.</p>
      {forecastShown && <WindCredit compact/>}
    </footer>
  </div>;
}
