// `sh.team` (D-62 rule 3): one team, simple and visual, top to bottom: its mark and record ("Through Week 7"), at most
// three tiles (home, road, points per game), the last five as W/L blocks with the letter in each, the margin chart and
// the season's games as marks with scores (the next game marked). With the bundled records only, the tiles stay and one
// sentence says game-by-game results are not available. The nflverse credit sits behind ⓘ (rule 10). No market of any
// kind appears here. TeamSheet owns the stable frame; this view receives its season and team code.
import { useId } from 'react';
import { Button, Icon, InfoButton, Matchup, Pill, TeamMark } from '../ui/index.js';
import { useChartSelection } from '../charts/useChartSelection.js';
import { fmtFull } from '../format.js';
import { TEAM_RECORDS_COUNTED } from '../info.js';
import { MarginChart } from './MarginChart.jsx';
import { teamView } from './teamModel.js';
import './teams.css';

export const NO_GAMES = 'Game-by-game results are not available right now.';

/** What "About team records" says: what is counted, through when, and the credit. */
export function teamInfo(season) {
  const when = [Number.isInteger(season?.throughWeek) ? `Through Week ${season.throughWeek}` : null,
    season?.updatedAt ? `updated ${fmtFull(season.updatedAt)}` : null].filter(Boolean).join(', ');
  return {
    body: [
      TEAM_RECORDS_COUNTED,
      when ? `${when.charAt(0).toUpperCase()}${when.slice(1)}.` : null,
      season?.stale ? 'This copy may be behind the latest finals.' : null,
      season?.fallback ? `${NO_GAMES} These records come from the copy bundled with the app.` : null,
      season?.source?.credit ? `Source: ${season.source.credit}.` : null,
    ].filter(Boolean),
    links: season?.source?.url ? [{ text: 'nflverse nfldata games file', url: season.source.url }] : [],
  };
}

function Tiles({ tiles }) {
  return (
    <ul className="gx-team-tiles">
      {tiles.map(tile => (
        <li key={tile.key} className={tile.key === 'ppg' ? 'gx-team-tile gx-team-tile--wide' : 'gx-team-tile'}>
          <span className="gx-t-meta gx-c-2">{tile.label}</span>
          {tile.key === 'ppg' ? (
            <span className="gx-team-ppg">
              <span><span className="gx-n-m">{tile.scored}</span> <span className="gx-t-body gx-c-2">scored</span></span>
              <span><span className="gx-n-m">{tile.allowed}</span> <span className="gx-t-body gx-c-2">allowed</span></span>
            </span>
          ) : <span className="gx-n-m">{tile.value}</span>}
        </li>
      ))}
    </ul>
  );
}

function LastFive({ items }) {
  const id = useId();
  return (
    <section className="gx-vstack gx-gap-8" aria-labelledby={id}>
      <h3 className="gx-t-section" id={id}>Last {items.length === 5 ? 'five' : items.length}</h3>
      <ol className="gx-team-five" aria-label={`Last ${items.length} results, oldest first`}>
        {items.map(item => (
          <li key={item.week} className={`gx-team-blk gx-team-blk--${item.tone}`}>
            <span aria-hidden="true">{item.result}</span><span className="gx-sr-only">{item.words}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Games({ rows, margins, selection, chartId }) {
  const id = useId();
  const indices = new Map(margins.map((point, index) => [point.key, index]));
  return (
    <section className="gx-vstack gx-gap-8" aria-labelledby={id}>
      <h3 className="gx-t-section" id={id}>Season</h3>
      <ol className="gx-team-games">
        {rows.map(row => {
          const index = indices.get(row.key), plotted = index !== undefined, selected = plotted && selection.index === index;
          return <li key={row.key} className="gx-team-game" data-next={row.next ? '' : undefined} data-selected={selected ? '' : undefined}>
            {plotted ? <Button variant="ghost" className="gx-team-week-select" aria-pressed={selected} aria-controls={chartId}
              aria-label={`Show ${margins[index].words} in margin chart`} onClick={() => selection.onSelect(index)}>
              {selected ? <Icon icon="check" size={16}/> : <span aria-hidden="true">Wk</span>}<span aria-hidden="true">{row.week}</span>
            </Button> : <span className="gx-team-wk"><span className="gx-sr-only">Week </span><span aria-hidden="true">Wk </span>{row.week}</span>}
            <Matchup away={row.away} home={row.home} size={24}/>
            <span className="gx-team-end">
              {row.final ? <><Pill tone={row.tone}>{row.word}</Pill><span className="gx-n-xs">{row.score}</span></>
                : row.next ? <Pill tone="data">Next</Pill> : null}
            </span>
            {row.when ? <span className="gx-t-meta gx-c-2 gx-team-when">{row.when}</span> : null}
          </li>;
        })}
      </ol>
    </section>
  );
}

/** The sheet's body for a season and team code, sharing selection between completed results and the margin chart. */
export function TeamView({ season, code }) {
  const view = teamView(season, code);
  const chartId = useId();
  // Same-week games from another team/season or corrected results are different evidence.
  const selection = useChartSelection(JSON.stringify([season?.season, view?.code, view?.margins]), view?.margins.length ?? 0);
  if (!view) return <p className="gx-t-body gx-c-2" role="status">This team’s record isn’t available right now.</p>;
  const info = teamInfo(season);
  return (
    <div className="gx-vstack gx-gap-24 gx-team-view" data-team={view.code}>
      <div className="gx-team-head">
        <TeamMark code={view.code} size={48} decorative/>
        <p className="gx-team-record">
          <span className="gx-sr-only">Record </span><span className="gx-n-l">{view.record ?? '—'}</span>
          {view.through ? <span className="gx-t-meta gx-c-2">{view.through}</span> : null}
        </p>
        <InfoButton title="About team records" body={info.body} links={info.links}/>
      </div>
      <Tiles tiles={view.tiles}/>
      {view.fallback ? <p className="gx-t-body gx-c-2" data-team="no-games">{NO_GAMES}</p> : <>
        {view.lastFive.length ? <LastFive items={view.lastFive}/> : null}
        {view.margins.length ? <MarginChart series={view.margins} extent={view.extent} selection={selection} id={chartId}/> : null}
        {view.rows.length ? <Games rows={view.rows} margins={view.margins} selection={selection} chartId={chartId}/> : null}
      </>}
    </div>
  );
}


export default TeamView;
