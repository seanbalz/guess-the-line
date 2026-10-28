// D-66 pieces Trends › Teams and Trends › This Week share: a trend's tile, a closed line gate's tile, the opened trend
// as the innermost card, and the trend's address. A tile is one picture and one number; the opened trend keeps its
// sample and tier as tags and puts its sentence, conditions and notes behind ⓘ.
import { lockedRecordsText, lockedTrendText } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, Icon, InfoButton, Nest, NestMeter, Pill } from '../ui/index.js';
import { TrendDetail } from '../charts/TrendDetail.jsx';
import { tierPill, trendDetailProps, trendInfoBody } from '../lines/parts.jsx';
import { INFO } from '../info.js';
import { WindowRecords } from './WindowRecords.jsx';

/** A short, stable address for a trend (its key can carry a line band, so the address never holds the key itself). */
export function trendSlug(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193) >>> 0;
  return 't' + h.toString(36);
}

export const shareWords = share => `${Math.round(share * 100)}% of decided games went this way; the tick is the 52.4% break-even`;

/** One trend in a layer's list: a lock with its condition when the gate holds it, else a button to open it. */
export function TrendTile({ card, rules, onOpen }) {
  if (card.locked) {
    return <li><div className="gx-nest-tile" data-trend="locked">
      <span className="gx-nest-tile-top"><span className="gx-nest-tile-label">{card.title}</span><Icon icon="lock" size={16}/></span>
      <span className="gx-t-meta">{lockedTrendText(card.gate, rules)}</span>
    </div></li>;
  }
  return <li><button type="button" className="gx-nest-tile" data-trend={card.kind} onClick={onOpen}>
    <span className="gx-nest-tile-label">{card.title}</span>
    <span className="gx-n-m gx-nest-num">{card.record}</span>
    <NestMeter share={card.share} label={shareWords(card.share)}/>
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

/**
 * The opened trend, the smallest doll: the D-55 chart card when the week file has its points, else the big record, a
 * meter and the sample and tier tags; then its windows behind a disclosure and the game sheet. Called as a function,
 * not mounted as a component, so the layer stays the same Nest element and its heading takes focus on the change.
 */
export function trendLayer({ label, layer, card, week, view, lips }) {
  const chart = card.chart?.spark ? card.chart : null;
  const info = <InfoButton title="About this trend" body={trendInfoBody(card)} links={INFO.trends.links}/>;
  return <Nest label={label} layer={layer} title={card.title} info={chart ? null : info} lips={lips}>
    {chart ? <TrendDetail title={card.title} pill={tierPill(card.tier)} info={info} {...trendDetailProps(card)}/> : <>
      <p className="gx-nest-big"><span className="gx-n-xl">{card.record}</span></p>
      <NestMeter share={card.share} label={shareWords(card.share)}/>
      <div className="gx-nest-tags"><Pill>{card.sample}</Pill><Pill>{card.tierLabel}</Pill></div>
    </>}
    <WindowRecords card={card} week={week} summary="Windows and dates"/>
    <GameDetailsButton view={view}/>
  </Nest>;
}
