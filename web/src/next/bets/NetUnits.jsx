// D-55 round 3 (board R4): your tracked bets' net units as a line you can drag, with record, ROI and win rate tiles.
// The tracker passes its own summary and its settled-ticket points (`data.chart`); only the viewer's own points are
// drawn. With fewer than two settled tickets there is no line, only the tiles. The page title's ⓘ explains the record.
import { TrendDetail } from '../charts/TrendDetail.jsx';
import { StatTiles } from '../charts/StatTiles.jsx';
import { signed } from '../charts/geometry.js';
import {cashText,validUnitCash} from '../../trackedBetTerms.js';

const pct = value => (Number.isFinite(value) ? `${Math.round(value * 10) / 10}%` : '—');

export function NetUnits({ summary = {}, points = [], player, amounts = 'units', unitCash }) {
  const own = points.filter(point => (!player || point.ownerId === player) && Number.isFinite(point.cumulativeNetUnits));
  const values = [0, ...own.map(point => point.cumulativeNetUnits)];
  const cash=amounts==='cash'&&validUnitCash(unitCash),title=cash?'Net profit':'Net units';
  const format=value=>cash?cashText(value*unitCash):`${signed(value,2)} U`;
  const net = summary.roiSampleCount ? summary.netUnits : null;
  const tiles = [
    { label: 'Record', value: summary.record || '0–0–0', sub: `${summary.pending || 0} pending` },
    { label: 'ROI', value: pct(summary.roiPercent), sub: `${summary.roiSampleCount || 0} settled` },
    { label: 'Win rate', value: pct(summary.winRatePercent), meter: Number.isFinite(summary.winRatePercent) ? summary.winRatePercent : 0 },
  ];
  if (own.length < 2) {
    return (
      <section className="gx-tc-card" aria-label="Your record" data-bets="metrics">
        <div className="gx-tc-head"><h2 className="gx-t-strong gx-grow">{title}</h2></div>
        <p className="gx-tc-headline"><span className="gx-tc-big">{net === null ? '—' : format(net)}</span><span className="gx-tc-headline-sub">{own.length ? 'One settled ticket so far' : 'Your first settled ticket starts this chart'}</span></p>
        <StatTiles tiles={tiles}/>
      </section>
    );
  }
  const day = at => (typeof at === 'string' ? at.slice(0, 10) : '');
  return (
    <div data-bets="metrics">
      <TrendDetail
        title={title}
        line={{
          values:cash?values.map(value=>value*unitCash):values,
          formatValue:cash?cashText:undefined,
          start: day(own[0].at),
          end: day(own.at(-1).at),
          label: `Cumulative ${cash?'profit in dollars':'net units'} over ${own.length} settled tickets, ending at ${format(values.at(-1))}`,
          tip: i => ({value:format(values[i]),label:i===0?'Start':`Ticket ${i} · ${day(own[i-1].at)}`}),
          headline: { value: net === null ? '—' : format(net), sub: `${own.length} settled tickets` },
          tiles,
        }}
      />
    </div>
  );
}
