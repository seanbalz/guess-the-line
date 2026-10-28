// D-55 opened trend (round 3 board R1/R2): the glow card with the title, a one-word state pill and its ⓘ, a
// "Since … / By season" switch when seasons exist, the headline number, the chart (line or stems), up to three tiles
// and, by season, the season table. It draws what it is given; shared/trends-view.mjs and the research reply decide.
import { useId, useMemo, useState } from 'react';
import { SeasonStems } from './SeasonStems.jsx';
import { SeasonTable } from './SeasonTable.jsx';
import { StatTiles } from './StatTiles.jsx';
import { TrendLine } from './TrendLine.jsx';
import { useChartSelection } from './useChartSelection.js';
import './charts.css';

/** Equal-valued points with different dates/records are different evidence. */
export const lineSelectionKey = (title, line) => JSON.stringify([title, line.start, line.end, line.label, line.values.map((value, i) => [value, line.tip(i)])]);

/**
 * `line`: `{ values, tip, start, end, label, headline: { value, sub }, tiles }`.
 * Function children receive `{ key, index, onSelect, chartId }` to link matching evidence.
 * `seasons` (optional): `{ rows, caption, headline, tiles }`. `pill` is the one-word state; `info` the ⓘ element.
 */
export function TrendDetail({ title, pill, info, line, seasons, children, id }) {
  const [view, setView] = useState('line');
  const headingId = useId(), seasonChartId = useId(), lineChartId = useId();
  const [selectedSeason, setSelectedSeason] = useState(null);
  // Keep the line point outside the swapped chart, just like the selected year.
  // Include the point labels: equal values can still represent a different sample.
  const lineKey = useMemo(() => lineSelectionKey(title, line), [title, line]);
  const lineSelection = useChartSelection(lineKey, line.values.length);
  const rows = seasons?.rows ?? [];
  const matchingSeason = rows.findIndex(row => row.season === selectedSeason);
  const seasonIndex = matchingSeason < 0 ? rows.length - 1 : matchingSeason;
  const bySeason = view === 'seasons' && seasons;
  const shown = bySeason ? seasons : line;
  return (
    <section className="gx-tc-card" aria-labelledby={headingId} id={id} data-trend-detail="">
      <div className="gx-tc-head">
        <h4 className="gx-t-strong gx-grow" id={headingId}>{title}</h4>
        {pill ? <span className="gx-tc-pill">{pill}</span> : null}
        {info}
      </div>
      {seasons ? (
        <div className="gx-tc-seg" role="group" aria-label={`Chart view · ${title}`}>
          <button type="button" aria-pressed={!bySeason} onClick={() => setView('line')}>{line.start ? `Since ${line.start}` : 'All games'}</button>
          <button type="button" aria-pressed={Boolean(bySeason)} onClick={() => setView('seasons')}>By season</button>
        </div>
      ) : null}
      <p className="gx-tc-headline">
        <span className="gx-tc-big">{shown.headline.value}</span>
        <span className="gx-tc-headline-sub">{shown.headline.sub}</span>
      </p>
      {bySeason ? <SeasonStems id={seasonChartId} seasons={rows} contextLabel={title} selectedIndex={seasonIndex} onSelect={index => setSelectedSeason(rows[index].season)}/> : <TrendLine id={lineChartId} values={line.values} tip={line.tip} start={line.start} end={line.end} label={line.label} contextLabel={title}
        selectedIndex={lineSelection.index} onSelect={lineSelection.onSelect}/>}
      <StatTiles tiles={shown.tiles}/>
      {bySeason ? <SeasonTable seasons={rows} caption={seasons.caption} selectedSeason={rows[seasonIndex]?.season} onSelect={setSelectedSeason} chartId={seasonChartId}/> : null}
      {typeof children === 'function' ? children({ ...lineSelection, chartId: lineChartId }) : children}
    </section>
  );
}
