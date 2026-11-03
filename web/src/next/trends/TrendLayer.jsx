// D-66 pieces Trends › Teams and Trends › This Week share: a trend's tile, a closed line gate's tile, the opened trend
// as the innermost card, and the trend's address. D-75: a tile is glass with one number, the win rate, and one meta
// line; This Week's strongest trend is a hero; the opened trend is one glass chart card, its tier, sentence and
// conditions behind ⓘ.
import { useId } from 'react';
import { lockedRecordsText, lockedTrendText } from '../../../../shared/lines-view.mjs';
import { sinceText } from '../../../../shared/trends-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, Icon, InfoButton, Nest } from '../ui/index.js';
import { linePath, signed } from '../charts/geometry.js';
import { trendInfoBody } from '../lines/parts.jsx';
import { INFO } from '../info.js';
import { winRateText } from './teamNest.js';
import { WindowRecords } from './WindowRecords.jsx';

/** A short, stable address for a trend (its key can carry a line band, so the address never holds the key itself). */
export function trendSlug(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return 't' + h.toString(36);
}

/** "712 games · since 2002": a trend's sample and the years it covers (D-75). */
export const gamesText = card => `${(card.games ?? 0).toLocaleString('en-US')} games · ${sinceText(card.years)}`;

/** One trend in a list (D-75): a lock with its condition when the gate holds it, else a glass tile with one win rate. */
export function TrendTile({ card, rules, onOpen }) {
  if (card.locked) {
    return <li><div className="gx-nest-tile" data-trend="locked">
      <span className="gx-nest-tile-top"><span className="gx-nest-tile-label">{card.title}</span><Icon icon="lock" size={16}/></span>
      <span className="gx-t-meta">{lockedTrendText(card.gate, rules)}</span>
    </div></li>;
  }
  return <li><button type="button" className="gx-nest-tile gx-nest-tile--glass" data-trend={card.kind} onClick={onOpen}>
    <span className="gx-nest-tile-label">{card.title}</span>
    <span className="gx-n-m gx-nest-num">{winRateText(card.share)}</span>
    <span className="gx-t-meta">{gamesText(card)}</span>
  </button></li>;
}

/** This Week's strongest trend (D-75): one larger glass card with its own line where the week file has one. */
export function TrendHero({ card, rules, onOpen }) {
  if (card.locked) return <TrendTile card={card} rules={rules} onOpen={onOpen}/>;
  const spark = card.chart?.spark?.length > 1 ? linePath(card.chart.spark, { width: 120, height: 48, top: 4, bottom: 4 }) : null;
  return <li><button type="button" className="gx-nest-hero" data-trend={card.kind} data-hero="" onClick={onOpen}>
    <span className="gx-nest-tile-label">{card.title}</span>
    <span className="gx-nest-hero-row">
      <span className="gx-vstack"><span className="gx-n-l gx-nest-num">{winRateText(card.share)}</span>
        <span className="gx-t-meta">win rate · {gamesText(card)}</span></span>
      {spark ? <svg className="gx-nest-hero-spark" viewBox="0 0 120 48" width="120" height="48" aria-hidden="true"><path d={spark.line}/></svg> : null}
    </span>
  </button></li>;
}

/** A market's line-based records while its gate is closed: the lock and how it opens, never a record. */
export function LineLockTile({ market, rules }) {
  return <li><div className="gx-nest-tile" data-trend="locked">
    <span className="gx-nest-tile-top"><span className="gx-nest-tile-label">Line-based records</span><Icon icon="lock" size={16}/></span>
    <span className="gx-t-meta">{lockedRecordsText(market, rules)}</span>
  </div></li>;
}

/** The game sheet, one tap from a game's layers. */
export function GameDetailsButton({ view }) {
  const shell = useShell();
  return <Button variant="secondary" onClick={() => shell.openSheet('sh.game', { game: view.id })}>Game details · {view.title}</Button>;
}

/** The opened trend's one glass card (D-75): the win rate, one line with a soft fill, then the record and units. */
function TrendChartCard({ card }) {
  const id = useId().replace(/:/g, '');
  const c = card.chart, spark = c?.spark?.length > 1 ? linePath(c.spark, { width: 320, height: 120, top: 8, bottom: 8 }) : null;
  return <div className="gx-nest-chart" data-trend-chart="">
    <p className="gx-nest-big"><span className="gx-n-xl">{winRateText(card.share)}</span><span className="gx-t-meta">win rate {sinceText(card.years)}</span></p>
    {spark ? <svg className="gx-nest-chart-line" viewBox="0 0 320 120" preserveAspectRatio="none" role="img"
      aria-label={`Cumulative units at −110: ${signed(c.units)} after ${(card.games ?? 0).toLocaleString('en-US')} games ${sinceText(card.years)}`}>
      <defs><linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" className="gx-nest-chart-stop-top"/><stop offset="1" className="gx-nest-chart-stop-end"/></linearGradient></defs>
      <path d={spark.area} fill={`url(#fill-${id})`}/><path className="gx-nest-chart-stroke" d={spark.line}/>
    </svg> : null}
    <p className="gx-nest-chart-foot"><span className="gx-t-meta">{card.record}</span>{c ? <span className="gx-t-meta">{signed(c.units)} U at −110</span> : null}</p>
  </div>;
}

/**
 * The opened trend, the smallest doll (D-75): one glass chart card, then its windows behind a disclosure and the game
 * sheet; the tier, sentence and conditions sit behind ⓘ. Called as a function, not mounted as a component, so the
 * layer stays the same Nest element and its heading takes focus on the change.
 */
export function trendLayer({ label, layer, card, week, view, lips }) {
  const info = <InfoButton title="About this trend" body={trendInfoBody(card)} links={INFO.trends.links}/>;
  return <Nest label={label} layer={layer} title={card.title} info={info} lips={lips}>
    <TrendChartCard card={card}/>
    <WindowRecords card={card} week={week} summary="Windows and dates"/>
    <GameDetailsButton view={view}/>
  </Nest>;
}
