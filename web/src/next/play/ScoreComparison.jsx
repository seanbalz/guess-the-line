// Compare (D-69 step 1, Sean's P3B): you and one other member at a time. Face chips set the address key `item` (the last,
// Everyone, keeps D-53's benchmark); week chips choose the week; filters sit behind the filter button. compare.js gates
// each game a second time (D-31). No moments (the catalog has none); the one motion is the head-to-head bars growing
// when you change what is compared.
import { useMemo, useRef } from 'react';
import { leagueApi } from '../../api.js';
import { pickText, show } from '../../communityFormat.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { Avatar, Button, Chip, ChipRail, InfoButton, Matchup, Pill, Segmented, cx } from '../ui/index.js';
import { fmtFull } from '../format.js';
import { PlayLayer } from './PlayLayer.jsx';
import { WeekChips } from './WeekChips.jsx';
import { FilterToggle } from './FilterToggle.jsx';
import { PlayEmpty, PlayFailure, PlayLoading } from './PlayStates.jsx';
import { modeOf, SCORE_MARKETS } from './scoring.js';
import { EVERYONE, chooseOpponent, compareRows, fieldRows, firstName, headToHead, leadLine, opponents, rowLine, rowTag, statLine } from './compare.js';
import './comparison.css';

const ABOUT = [
  'You and one other player, game by game. Each guess is scored against its own saved line.',
  'You see another player’s guess once you lock yours in, or from kickoff.',
  'Only games scored for both of you count. Hidden, waiting, missed and unscored games never count as zero.',
  'Everyone compares you with each game’s average of every scored player, you included, each game weighted equally.',
  'Spread and Total stay separate. Games keep their original week, Monday games included. Compare never changes the standings.',
];
const CLEAR = { period: 'week', team: '', matchup: '' };

export function ScoreComparison() {
  const app = useAppData(), shell = useShell(), view = shell.state.views.play;
  const season = Number.isInteger(view.season) ? view.season : app.community.data?.week?.season;
  const leagueId = app.league?.community === false ? app.league.id : null;
  const key = `${app.accountId}:comparison:${leagueId ?? 'community'}:${season ?? 'latest'}`;
  const read = useLeagueRead(key, signal => leagueApi('comparison', { ...(season ? { season } : {}), ...(leagueId ? { leagueId } : {}) }, signal), error => { if (error.status === 401) app.requestSignIn(); });
  const current = app.community.data?.week;
  return <PlayLayer label="Compare" layer="compare" title="Compare" info={<InfoButton title="About Compare" body={ABOUT}/>}>
    {read.loading ? <PlayLoading>Loading comparisons…</PlayLoading>
      : read.error ? <PlayFailure what="Comparisons" error={read.error} onRetry={read.retry}/>
      : <ComparisonContent key={key} data={read.data} currentWeek={read.data.season === current?.season ? current.week : null}
        scopeName={app.league?.name || 'Community'} view={view} onChange={patch => shell.setView('play', patch)}/>}
  </PlayLayer>;
}

function Bar({ who, points, max, me = false, grow = false }) {
  const width = `${Math.round(Math.max(0, Math.min(1, points / max)) * 1000) / 10}%`;
  // Real spaces between the name, the bar and the number (a grid ignores them), so the text reads "You 19", never "You19".
  return <span className="gx-cmp-bar"><span className="gx-t-meta">{who}</span>{' '}
    <span className="gx-cmp-track"><span className={cx('gx-cmp-fill', me && 'gx-cmp-fill--me')} data-grow={grow ? '' : undefined} style={{ width }}></span></span>{' '}
    <span className="gx-n-s gx-cmp-num">{show(points)}</span></span>;
}

function CompareRow({ row, mode, name, multi }) {
  const tag = rowTag(row, name), game = row.game, text = value => pickText(mode, game.awayCode, game.homeCode, value);
  const sides = row.state === 'hidden' ? [] : [['You', row.me, true], [name, row.them, false]];
  const scored = sides.filter(([, side]) => side.points !== null), lines = sides.filter(([, side]) => side.locked && side.reference);
  return <li className="gx-cmp-row">
    <div className="gx-cmp-row-top"><Matchup away={game.awayCode} home={game.homeCode}/>
      <span className="gx-cmp-row-end"><Pill tone={tag.tone}>{tag.text}</Pill>
        {lines.length ? <InfoButton title={`Saved lines, Week ${row.week} ${game.awayCode} at ${game.homeCode}`}
          body={lines.map(([who, side]) => `${who} · line ${text(side.reference.value)} · ${side.reference.source || 'Source unavailable'} · ${fmtFull(side.reference.observedAt)}`)}/> : null}</span></div>
    <p className="gx-t-meta gx-c-2">{multi ? `Week ${row.week} · ` : ''}{rowLine(row, mode, name)}</p>
    {scored.length ? <div className="gx-cmp-bars" role="img" aria-label={scored.map(([who, side]) => `${who} ${show(side.points)} points`).join(', ')}>
      {scored.map(([who, side, me]) => <Bar key={me ? 'me' : 'them'} who={who} points={side.points} max={10} me={me}/>)}</div> : null}
  </li>;
}

export function ComparisonContent({ data, currentWeek, scopeName, view, onChange }) {
  const mode = modeOf(view.market), others = opponents(data);
  const opponent = useMemo(() => chooseOpponent(data, view.item), [data, view.item]), everyone = opponent === EVERYONE;
  const weeks = [...new Set((data.weeks || []).map(w => w.week))].sort((a, b) => a - b);
  const period = ['range', 'season'].includes(view.period) ? view.period : 'week';
  const week = weeks.includes(view.week) ? view.week : weeks.includes(currentWeek) ? currentWeek : weeks.at(-1) ?? null;
  const from = period === 'season' ? null : period === 'range' ? (weeks.includes(view.from) ? view.from : weeks[0] ?? null) : week;
  const to = period === 'season' ? null : period === 'range' ? (weeks.includes(view.to) ? view.to : weeks.at(-1) ?? null) : week;
  const team = view.team || '', matchup = view.matchup || '', filtered = period !== 'week' || !!team || !!matchup;
  const rows = useMemo(() => !opponent ? [] : (opponent === EVERYONE ? fieldRows : compareRows)(data, { mode, opponent, from, to, team, matchup }),
    [data, mode, opponent, from, to, team, matchup]);
  // The bars grow when you change what is compared, never on the first paint (D-69: nothing moves on a page load).
  const selection = [opponent, mode, from, to, team, matchup].join(':'), first = useRef(selection), grow = first.current !== selection;
  if (!others.length) return <PlayEmpty>No one else to compare with yet.</PlayEmpty>;
  if (!weeks.length) return <PlayEmpty>No weeks to compare yet.</PlayEmpty>;
  const h = headToHead(rows), member = id => (data.members || []).find(m => m.id === id);
  const name = everyone ? 'Everyone' : member(opponent)?.displayName || 'Member', short = everyone ? 'Everyone' : firstName(name);
  const teams = [...new Set((data.weeks || []).flatMap(w => (w.games || []).flatMap(g => [g.awayCode, g.homeCode])))].sort();
  const games = [...new Map((data.weeks || []).filter(w => from === null || (w.week >= from && w.week <= to)).flatMap(w => w.games || []).map(g => [g.id, g])).values()];
  const when = period === 'season' ? `${data.season} season` : period === 'range' ? `Weeks ${from}–${to}` : `Week ${week}`;
  const weekOptions = weeks.map(w => <option key={w} value={w}>Week {w}</option>);
  const pick = id => () => { if (id !== opponent) onChange({ item: id }); };
  return <div className="gx-vstack gx-gap-12">
    <p className="gx-t-meta gx-c-2">{scopeName} · {when} · {mode === 'guess_total' ? 'Total' : 'Spread'}</p>
    <ChipRail label="Compare with">
      {others.map(m => <Chip key={m.id} text selected={m.id === opponent} className="gx-cmp-face" onClick={pick(m.id)}><Avatar id={m.id} name={m.displayName} size={32}/>{m.removed ? `${m.displayName} · former` : m.displayName}</Chip>)}
      <Chip text selected={everyone} className="gx-cmp-face" onClick={pick(EVERYONE)}><Avatar anyone size={32}/>Everyone</Chip>
    </ChipRail>
    <Segmented label="Compare market" options={SCORE_MARKETS} value={mode} onChange={value => onChange({ market: value === 'guess_total' ? 'total' : 'spread' })}/>
    <WeekChips label="Week" weeks={weeks} week={period === 'week' ? week : null} onWeek={value => onChange({ week: value, period: 'week' })}
      seasons={data.seasons || []} season={data.season} onSeason={year => onChange({ season: year, week: null, period: 'week', matchup: '' })}/>
    <FilterToggle label="Filter games" active={filtered}>
      <div className="gx-cmp-filters gx-vstack gx-gap-12">
        <label className="gx-t-body">Period<select className="gx-input" value={period} onChange={e => onChange({ period: e.target.value })}><option value="week">Single week</option><option value="range">Week range</option><option value="season">Full season</option></select></label>
        {period === 'range' && <><label className="gx-t-body">From week<select className="gx-input" value={from ?? ''} onChange={e => onChange({ from: Number(e.target.value) })}>{weekOptions}</select></label>
          <label className="gx-t-body">Through week<select className="gx-input" value={to ?? ''} onChange={e => onChange({ to: Number(e.target.value) })}>{weekOptions}</select></label></>}
        <label className="gx-t-body">Team<select className="gx-input" value={team} onChange={e => onChange({ team: e.target.value })}><option value="">All teams</option>{team && !teams.includes(team) && <option value={team}>{team}</option>}{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="gx-t-body">Matchup<select className="gx-input" value={matchup} onChange={e => onChange({ matchup: e.target.value })}><option value="">All matchups</option>{games.map(g => <option key={g.id} value={g.id}>{g.awayCode} at {g.homeCode}</option>)}</select></label>
        <Button disabled={!filtered} onClick={() => onChange(CLEAR)}>Clear filters</Button>
      </div>
    </FilterToggle>
    <section className="gx-cmp-h2h" aria-label="Head to head">
      <div className="gx-cmp-vs">
        <span className="gx-cmp-who"><Avatar id={data.viewer} name={member(data.viewer)?.displayName || 'You'} size={40} you/><span className="gx-t-strong">You</span></span>
        <span className="gx-t-meta gx-c-2" aria-hidden="true">VS</span>
        <span className="gx-cmp-who"><span className="gx-t-strong">{name}</span>{everyone ? <Avatar anyone size={40}/> : <Avatar id={opponent} name={name} size={40}/>}</span>
      </div>
      <p className="gx-t-strong" aria-live="polite">{leadLine(h, short)}</p>
      {h.shared ? <>
        <div key={selection} className="gx-cmp-bars" role="img" aria-label={`You ${show(h.me.points)}, ${short} ${show(h.them.points)} points on ${h.shared} shared ${h.shared === 1 ? 'game' : 'games'}`}>
          <Bar who="You" points={h.me.points} max={h.shared * 10} me grow={grow}/><Bar who={short} points={h.them.points} max={h.shared * 10} grow={grow}/>
        </div>
        <p className="gx-t-meta gx-c-2">{statLine(h, everyone)}</p>
      </> : null}
    </section>
    {from !== null && to !== null && from > to ? <p className="gx-t-body" role="alert">Choose a through week at or after the from week.</p>
      : !rows.length ? <PlayEmpty action={filtered ? 'Clear filters' : undefined} onAction={() => onChange(CLEAR)}>{filtered ? 'No games match these filters.' : everyone ? 'No shared scored games yet.' : 'No games in this week.'}</PlayEmpty>
      : <ul className="gx-cmp-rows" aria-label="Games">{rows.map(row => <CompareRow key={row.key} row={row} mode={mode} name={short} multi={period !== 'week'}/>)}</ul>}
  </div>;
}
