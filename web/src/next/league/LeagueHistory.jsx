// League › History (D-69 step 1, Sean's P6A: season tiles › week tiles › a week's game rows). One component draws both
// layers so they share one read. History (`view: history`, `season` a filter) shows the player chips, the market, season
// tiles once there is a second season, and week tiles; a week (`week` set) is its own layer, each game a disclosure
// holding the line's fine print. Another member's withheld guesses and lines stay hidden (D-31, D-39), and every value the
// old screen showed is still here (D-23). It no longer imports the old CommunityHistory.jsx (spec test 13).
import { useState } from 'react';
import { communityApi } from '../../api.js';
import { MODE } from '../../communityFormat.js';
import { Avatar, Chip, ChipRail, InfoButton, LinkRow, Matchup, Segmented } from '../ui/index.js';
import { PlayLayer } from '../play/PlayLayer.jsx';
import { LeagueEmpty, LeagueFailure, LeagueLoading, useLeagueRead } from './useLeagueRead.jsx';
import { entryOf, seasonTiles, weekGame, weekSummary, weekTiles } from './historyModel.js';

const MARKETS = Object.entries(MODE).map(([value, label]) => ({ value, label }));
export const HISTORY_COPY = Object.freeze({
  title: 'History', player: 'Player', market: 'History market', seasons: 'Seasons', empty: 'No history yet.', noWeek: 'No record for this week.',
  hidden: 'Picks hidden until your submission or each game\'s kickoff.', score: 'Every game in Your score', about: 'About history', aboutWeek: 'About this week',
  aboutBody: 'Saved guesses and their original references. Games the server withholds stay hidden.', weekTitle: (week, season) => `Week ${week}${season ? ` · ${season}` : ''}`,
});

function Tile({ tile, onClick, ...rest }) {
  return <li><button type="button" className="gx-nest-tile gx-lg-tile" onClick={onClick} {...rest}>
    <span className="gx-nest-tile-label">{tile.label}</span><span className="gx-n-m">{tile.big}</span><span className="gx-t-meta gx-c-2">{tile.sub}</span></button></li>;
}

export function LeagueHistory({ app, place, mode, parents = [], historyLip, onPlace, onScore }) {
  const [player, setPlayer] = useState(app.accountId);
  const season = place.season;
  const read = useLeagueRead(`${app.accountId}:history:${season || 'latest'}`, signal => communityApi('history', season ? { season } : {}, signal), error => {
    if (error.status === 401) app.requestSignIn?.(); else app.refresh({ only: ['community'] });
  });
  const market = mode === 'guess_total' ? 'guess_total' : 'guess_spread', data = read.data, viewer = data?.viewer;
  const members = data?.members ?? [], selected = members.find(m => m.id === player) ?? members.find(m => m.id === viewer) ?? members[0] ?? null;
  const own = !!selected && selected.id === viewer, who = own ? 'You' : selected?.displayName ?? '';
  const toHistory = historyLip ?? { key: 'history', label: HISTORY_COPY.title, open: () => onPlace({ week: null }) };
  const state = read.loading ? <LeagueLoading label="Loading history…"/> : read.error ? <LeagueFailure error={read.error} onRetry={read.retry}/> : null;
  const people = [...members].sort((a, b) => Number(b.id === viewer) - Number(a.id === viewer) || String(a.displayName).localeCompare(String(b.displayName)));
  const filters = <>
    <ChipRail label={HISTORY_COPY.player}>{people.map(m => <Chip key={m.id} text selected={m.id === selected?.id} onClick={() => setPlayer(m.id)}>
      <Avatar id={m.id} name={m.displayName} size={24}/>{m.id === viewer ? 'You' : m.displayName}{m.removed ? ' · Removed' : ''}</Chip>)}</ChipRail>
    <Segmented label={HISTORY_COPY.market} options={MARKETS} value={market} onChange={value => onPlace({ market: value })}/>
  </>;
  if (place.layer === 'week') {
    const week = (data?.weeks ?? []).find(w => w.week === place.week) ?? null, entry = week && selected ? entryOf(week, selected.id, market) : null;
    const summary = weekSummary(entry), games = entry && Array.isArray(entry.picks) ? (week.games ?? []).map(game => weekGame(week, entry, game, market)) : [];
    return <PlayLayer label="League history week" parents={[...parents, toHistory]} layer={`league:week:${season ?? 'latest'}:${place.week}`} title={HISTORY_COPY.weekTitle(place.week, season ?? data?.season)}
      info={summary.notes.length ? <InfoButton title={HISTORY_COPY.aboutWeek} body={summary.notes}/> : null}>
      {state ?? (!week || !selected ? <LeagueEmpty text={HISTORY_COPY.noWeek} actionLabel="Back to History" onAction={toHistory.open}/> : <>
        {filters}
        <p className="gx-t-meta gx-c-2">{[who, MODE[market], summary.points].filter(Boolean).join(' · ')}</p>
        <p className="gx-t-body">{summary.status}</p>
        {entry?.picksHidden && !entry.picks ? <p className="gx-t-body gx-c-2">{HISTORY_COPY.hidden}</p> : null}
        {games.length ? <ul className="gx-lg-games" aria-label={`${who} · Week ${week.week} ${MODE[market]} games`}>{games.map(game => <li key={game.id}>
          <details className="gx-lg-game"><summary><Matchup away={game.away} home={game.home}/>
            {game.hidden ? <span className="gx-grow">{' · Hidden'}</span> : <><span className="gx-grow">{` · Line ${game.line} · ${who} ${game.guess}`}</span><span className="gx-n-s">{` · ${game.points}`}</span></>}</summary>
            <ul className="gx-lg-notes">{game.notes.map(note => <li key={note} className="gx-t-meta gx-c-2">{note}</li>)}</ul></details>
        </li>)}</ul> : null}
        {own ? <LinkRow icon="chart" onClick={() => onScore(week.season, week.week, market)}>{HISTORY_COPY.score}</LinkRow> : null}
      </>)}
    </PlayLayer>;
  }
  const seasons = data ? seasonTiles(data) : null, weeks = data && selected ? weekTiles(data, selected.id, market) : [];
  return <PlayLayer label="League history" parents={parents} layer="league:history" title={`${HISTORY_COPY.title} · ${MODE[market]}`} info={<InfoButton title={HISTORY_COPY.about} body={[HISTORY_COPY.aboutBody]}/>}>
    {state ?? <>
      {filters}
      {seasons ? <ul className="gx-nest-grid" aria-label={HISTORY_COPY.seasons}>{seasons.map(tile => <Tile key={tile.season} tile={tile} aria-pressed={tile.on} onClick={() => onPlace({ season: tile.season, week: null })}/>)}</ul> : null}
      {weeks.length ? <ul className="gx-nest-grid" aria-label={`${own ? 'Your' : `${who}’s`} weeks`}>{weeks.map(tile => <Tile key={tile.week} tile={tile} aria-label={tile.aria} onClick={() => onPlace({ week: tile.week })}/>)}</ul>
        : <LeagueEmpty text={HISTORY_COPY.empty} actionLabel="Refresh" onAction={read.retry}/>}
    </>}
  </PlayLayer>;
}
