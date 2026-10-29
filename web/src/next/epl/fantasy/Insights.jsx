// Research › Fantasy › Insights: tiles for the season high, your top scorer and how far you beat or missed your last
// projection; the top scorer per team (from saved lineups); and the weekly points line, you against the league average.
// Weekly numbers exist only from the first tracked matchweek; before that a note says where they start.
import { useId } from 'react';
import { Card } from '../../ui/index.js';
import { WeeklyLine } from './WeeklyLine.jsx';
import { DASH, FANTASY_COPY, fmtPts, fmtSigned } from './fantasyModel.js';

function Tile({ label, value, meta }) {
  return <div className="gx-epl-fx-tile">
    <span className="gx-t-micro gx-c-2">{label}</span>
    <span className="gx-epl-fx-tile-num">{value}</span>
    {meta ? <span className="gx-t-meta gx-c-2">{meta}</span> : null}
  </div>;
}

export function InsightsPanel({ view }) {
  const base = useId();
  const ins = view.insights ?? {};
  const high = ins.seasonHigh;
  const top = ins.myTopScorer;
  const mine = (ins.beatProjection ?? []).filter(b => b.ownerId === view.viewer);
  const last = mine.at(-1) ?? null;
  const hasWeekly = (ins.weekly ?? []).some(w => typeof w.points === 'number');
  return <div className="gx-epl-fx-stack">
    <div className="gx-epl-fx-tiles">
      <Tile label={FANTASY_COPY.seasonHigh} value={high ? fmtPts(high.points) : DASH} meta={high ? `${high.name} · MW${high.week}` : null}/>
      <Tile label={FANTASY_COPY.topScorer} value={top ? top.playerName ?? FANTASY_COPY.unknownPlayer : DASH} meta={top ? `${fmtPts(top.points)} pts` : null}/>
      <Tile label={FANTASY_COPY.vsProjection} value={last ? fmtSigned(last.diff) : DASH} meta={last ? `MW${last.week}` : null}/>
    </div>
    {hasWeekly ? null : <p className="gx-t-meta gx-c-2">{FANTASY_COPY.detailStarts(ins.detailStartsWeek ?? view.week)}</p>}
    {ins.topScorerPerTeam?.length ? <Card as="section" aria-labelledby={`${base}-top`}>
      <h2 className="gx-t-micro gx-c-2" id={`${base}-top`}>{FANTASY_COPY.topPerTeam}</h2>
      <ul className="gx-epl-fx-players">
        {ins.topScorerPerTeam.map(t => <li key={t.ownerId} className="gx-epl-fx-player">
          <span className="gx-epl-fx-player-name">{t.name}<span className="gx-c-2"> · {t.playerName ?? FANTASY_COPY.unknownPlayer}</span></span>
          <span className="gx-epl-fx-num">{fmtPts(t.points)}</span>
        </li>)}
      </ul>
    </Card> : null}
    {hasWeekly ? <Card as="section" aria-labelledby={`${base}-weekly`}>
      <h2 className="gx-t-micro gx-c-2" id={`${base}-weekly`}>{FANTASY_COPY.weekly}</h2>
      <WeeklyLine weekly={ins.weekly} viewer={view.viewer}/>
      {(ins.weekly ?? []).some(w => w.points === null) ? <p className="gx-t-meta gx-c-2">{FANTASY_COPY.gapNote}</p> : null}
    </Card> : null}
  </div>;
}
