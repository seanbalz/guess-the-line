// D-55 round 3 (board R4): your tracked bets' net units as a line you can drag, with record, ROI and win rate tiles.
// The tracker passes its own summary and its settled-ticket points (`data.chart`); only the viewer's own points are
// drawn. With fewer than two settled tickets there is no line, only the tiles. Results are player reported (ⓘ).
import { TrendDetail } from '../charts/TrendDetail.jsx';
import { StatTiles } from '../charts/StatTiles.jsx';
import { signed } from '../charts/geometry.js';
import { InfoButton } from '../ui/index.js';
import { INFO } from '../info.js';

const pct = value => (Number.isFinite(value) ? `${Math.round(value * 10) / 10}%` : '—');

export function NetUnits({ summary = {}, points = [], player }) {
  const own = points.filter(point => (!player || point.ownerId === player) && Number.isFinite(point.cumulativeNetUnits));
  const values = [0, ...own.map(point => point.cumulativeNetUnits)];
  const net = summary.roiSampleCount ? summary.netUnits : null;
  const tiles = [
    { label: 'Record', value: summary.record || '0–0–0', sub: `${summary.pending || 0} pending` },
    { label: 'ROI', value: pct(summary.roiPercent), sub: `${summary.roiSampleCount || 0} settled` },
    { label: 'Win rate', value: pct(summary.winRatePercent), meter: Number.isFinite(summary.winRatePercent) ? summary.winRatePercent : 0 },
  ];
  const info = <InfoButton title={INFO.trackedBets.title} body={INFO.trackedBets.body}/>;
  if (own.length < 2) {
    return (
      <section className="gx-tc-card" aria-label="Your record" data-bets="metrics">
        <div className="gx-tc-head"><h2 className="gx-t-strong gx-grow">Net units</h2>{info}</div>
        <p className="gx-tc-headline"><span className="gx-tc-big">{net === null ? '—' : `${signed(net, 2)} U`}</span><span className="gx-tc-headline-sub">{own.length ? 'One settled ticket so far' : 'Your first settled ticket starts this chart'}</span></p>
        <StatTiles tiles={tiles}/>
      </section>
    );
  }
  const day = at => (typeof at === 'string' ? at.slice(0, 10) : '');
  return (
    <div data-bets="metrics">
      <TrendDetail
        title="Net units" info={info}
        line={{
          values,
          start: day(own[0].at),
          end: day(own.at(-1).at),
          label: `Cumulative net units over ${own.length} settled tickets, ending at ${signed(values.at(-1), 2)}`,
          tip: i => (i === 0 ? { value: '0.00 U', label: 'Start' } : { value: `${signed(values[i], 2)} U`, label: `Ticket ${i} · ${day(own[i - 1].at)}` }),
          headline: { value: net === null ? '—' : `${signed(net, 2)} U`, sub: `${own.length} settled tickets` },
          tiles,
        }}
      />
    </div>
  );
}
