// Insights › weekly points line (mockups v2 "League"): you against the league average by matchweek. A matchweek with no
// saved snapshot is a gap: the line breaks there and a lone week is a dot, never a 0 point. A lime dot marks your
// season high. The numbers are also given as text for screen readers.
import { DASH, FANTASY_COPY, fmtPts } from './fantasyModel.js';

const finite = x => typeof x === 'number' && Number.isFinite(x);
const W = 300, H = 120, PAD = 10;

/** Consecutive runs of points with a number: a missing y ends a run. */
export function lineSegments(points) {
  const out = [];
  let run = [];
  for (const p of points) {
    if (finite(p.y)) run.push(p);
    else if (run.length) { out.push(run); run = []; }
  }
  if (run.length) out.push(run);
  return out;
}

/** The mean of the week's scored managers (2 dp), or null when none scored. */
export function leagueAverage(weekly, week) {
  const values = (weekly ?? []).filter(w => w.week === week && finite(w.points)).map(w => w.points);
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null;
}

function Series({ points, kind, x, y }) {
  return lineSegments(points).map(seg => (seg.length === 1
    ? <circle key={`${kind}-${seg[0].x}`} className={`gx-epl-fx-dot gx-epl-fx-dot--${kind}`} cx={x(seg[0].x)} cy={y(seg[0].y)} r="3"/>
    : <polyline key={`${kind}-${seg[0].x}`} className={`gx-epl-fx-line gx-epl-fx-line--${kind}`} points={seg.map(p => `${x(p.x)},${y(p.y)}`).join(' ')}/>));
}

export function WeeklyLine({ weekly = [], viewer = null }) {
  const weeks = [...new Set(weekly.map(w => w.week))].sort((a, b) => a - b);
  if (!weeks.length) return null;
  const mine = weeks.map(week => ({ x: week, y: weekly.find(w => w.week === week && w.ownerId === viewer)?.points ?? null }));
  const avg = weeks.map(week => ({ x: week, y: leagueAverage(weekly, week) }));
  const values = [...mine, ...avg].map(p => p.y).filter(finite);
  const top = Math.max(1, ...values);
  const x = week => (weeks.length === 1 ? W / 2 : PAD + ((week - weeks[0]) / (weeks.at(-1) - weeks[0])) * (W - 2 * PAD));
  const y = v => Math.round((H - PAD - (v / top) * (H - 2 * PAD)) * 10) / 10;
  const high = mine.filter(p => finite(p.y)).reduce((best, p) => (!best || p.y > best.y ? p : best), null);
  const summary = mine.map(p => `MW${p.x} ${finite(p.y) ? fmtPts(p.y) : DASH}`).join(', ');
  return <figure className="gx-epl-fx-chart">
    <svg className="gx-epl-fx-svg" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <Series points={avg} kind="avg" x={x} y={y}/>
      {viewer ? <Series points={mine} kind="me" x={x} y={y}/> : null}
      {high ? <circle className="gx-epl-fx-high" cx={x(high.x)} cy={y(high.y)} r="5"/> : null}
    </svg>
    <div className="gx-tc-axis" aria-hidden="true"><span>MW{weeks[0]}</span><span>MW{weeks.at(-1)}</span></div>
    <figcaption className="gx-epl-fx-legend">
      {viewer ? <span className="gx-epl-fx-key gx-epl-fx-key--me">{FANTASY_COPY.you}</span> : null}
      <span className="gx-epl-fx-key gx-epl-fx-key--avg">{FANTASY_COPY.average}</span>
      {viewer ? <span className="gx-sr-only">{`${FANTASY_COPY.you}: ${summary}`}</span> : null}
    </figcaption>
  </figure>;
}
