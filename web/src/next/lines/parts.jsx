import { trendAvailabilitySummary, trendAvailabilityText } from '../../trendsAvailability.js';
// Pieces the Lines board, the game sheet and the All trends sheet share (redesign build plan stage 13): the short
// trend card, a row that opens in place, and the credits. They draw what shared/lines-view.mjs and
// shared/trends-view.mjs give them and decide nothing.
import { useId, useState } from 'react';
import { lockedTrendText } from '../../../../shared/lines-view.mjs';
import { BOARD_TIER_WORDS } from '../../../../shared/trends-view.mjs';
import { Card, Icon, InfoButton, LockLine } from '../ui/index.js';
import { cx } from '../ui/cx.js';
import { TrendDetail } from '../charts/TrendDetail.jsx';
import { TrendRow } from '../charts/TrendRow.jsx';
import { hitPct, recordText, signed } from '../charts/geometry.js';
import { INFO } from '../info.js';

/**
 * One trend in plain words (DASH-7): its title, one sentence, its record and its sample size, and the tier in words.
 * A line trend whose market is still closed to the viewer shows only that it exists and how it opens: no title, record,
 * percent or sample size (shortCard returns none of them).
 */
export function ShortTrend({ card, rules, as = 'li', variant }) {
  if (card.locked) {
    return (
      <Card as={as} variant={variant} className="gx-l-tcard" data-trend="locked">
        <span className="gx-l-thead"><Icon icon="lock" size={16}/><span className="gx-t-strong gx-grow">{card.title}</span></span>
        <p className="gx-t-body gx-c-2">{lockedTrendText(card.gate, rules)}</p>
      </Card>
    );
  }
  return (
    <Card as={as} variant={variant} className="gx-l-tcard" data-trend={card.kind}>
      <span className="gx-l-thead">
        <Icon icon="diamond" size={16} fill/>
        <span className="gx-t-strong gx-grow">{card.title}</span>
        {card.pct !== null ? <span className="gx-n-m">{card.pct}%</span> : null}
      </span>
      <p className="gx-t-body gx-c-2">{card.sentence}</p>
      <p className="gx-l-tnums">
        <span className="gx-sr-only">Record </span><span className="gx-n-s">{card.record}</span>
        <span className="gx-t-meta">{card.sample}</span>
        {card.fits === true ? <span className="gx-t-meta">Fits this game at your line</span> : card.fits === null ? <span className="gx-t-meta">Fits only at some lines</span>
          : card.fits === false ? <span className="gx-t-meta">Doesn’t fit this game at your line</span> : null}
      </p>
      <p className="gx-t-label gx-c-2">{card.tierLabel}</p>
      {card.notes?.map(note => <p className="gx-t-meta" key={note}>{note}</p>)}
    </Card>
  );
}

/** A row that opens in place (prototype "More" rows): the title and a one-line summary, then its body below. */
export function Expander({ title, summary, open: startOpen = false, children, ...rest }) {
  const [open, setOpen] = useState(startOpen);
  const id = useId();
  return (
    <div className="gx-l-x" {...rest}>
      <button type="button" className="gx-row gx-row-btn" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        <span className="gx-row-main">
          <span className="gx-row-title">{title}</span>
          {summary ? <span className="gx-row-sub">{summary}</span> : null}
        </span>
        <Icon icon="chevronDown" size={20} className={cx('gx-chev', 'gx-l-chev', open && 'gx-l-chev--up')}/>
      </button>
      <div id={id} className="gx-l-xbody" hidden={!open}>{open ? children : null}</div>
    </div>
  );
}

/** The data credits (nflverse CC BY 4.0; Open-Meteo CC BY 4.0 next to forecast values) and the later-update line. */
export function Credits({ footer }) {
  return (
    <footer className="gx-l-credits">
      <p className="gx-t-meta gx-c-3">{footer.lineLater}</p>
      <a className="gx-t-meta gx-l-link" href={footer.trends.url} target="_blank" rel="noreferrer">{footer.trends.text}</a>
      <a className="gx-t-meta gx-l-link" href={footer.trends.licenseUrl} target="_blank" rel="noreferrer">License: {footer.trends.license}</a>
    </footer>
  );
}

/** The Open-Meteo credit, placed next to the forecast values it covers (D-34). */
export function WindCredit({ credit }) {
  return (
    <div className="gx-vstack">
      <a className="gx-t-meta gx-l-link" href={credit.url} target="_blank" rel="noreferrer">{credit.text}</a>
      <a className="gx-t-meta gx-l-link" href={credit.licenseUrl} target="_blank" rel="noreferrer">License: {credit.license}</a>
      <p className="gx-t-meta gx-c-3">{credit.changes}</p>
    </div>
  );
}

/** The one-word state pill for a tier (D-55): the full tier words live in the trend's ⓘ. */
const tierPill = tier => BOARD_TIER_WORDS[tier] ?? (tier === 'watch' ? 'Watch list' : 'No proven edge');

const winRateTile = (w, l) => {
  const pct = hitPct(w, l);
  return { label: 'Win rate', value: pct === null ? '—' : `${pct}%`, meter: pct, sub: pct === null ? 'No decided games' : undefined };
};

/**
 * The opened trend's chart props from a short card's D-55 chart data: the line since its first season (headline
 * units, win rate, last 10, games) and, when the file has its selection seasons, the "By season" view (headline
 * seasons above break-even, the period's win rate, last 10 and units).
 */
export function trendDetailProps(card) {
  const c = card.chart, { W, L, P } = c.record, games = W + L + P, n = c.spark.length;
  const [first = 2002, last = first] = card.years ?? [];
  const lastTen = c.last10 ? { label: 'Last 10', value: recordText(c.last10.W, c.last10.L, c.last10.P), blocks: { on: c.last10.W, of: c.last10.W + c.last10.L + c.last10.P } } : null;
  const line = {
    values: c.spark,
    start: String(first),
    end: String(last),
    label: `Cumulative units at −110 for ${c.side ?? 'this side'}: ${signed(c.units)} after ${games.toLocaleString('en-US')} games since ${first}`,
    // The file's points are chronological bins, so a point between the ends gives an approximate game count.
    tip: i => ({ value: `${signed(c.spark[i])} U`, label: i === 0 ? `Start, ${first}` : i === n - 1 ? `${games.toLocaleString('en-US')} games, through ${last}` : `after about ${Math.round((i * games) / (n - 1)).toLocaleString('en-US')} games` }),
    headline: { value: `${signed(c.units)} U`, sub: `${recordText(W, L, P)} since ${first}` },
    tiles: [winRateTile(W, L), lastTen, { label: 'Games', value: games.toLocaleString('en-US'), sub: `since ${first}` }].filter(Boolean),
  };
  if (c.seasons.length < 2) return { line, seasons: null };
  const sum = c.seasons.reduce((a, s) => ({ w: a.w + s.w, l: a.l + s.l, units: a.units + s.units }), { w: 0, l: 0, units: 0 });
  const span = `${c.seasons[0].season}–${String(c.seasons.at(-1).season).slice(2)}`;
  return {
    line,
    seasons: {
      rows: c.seasons,
      caption: c.seasonsLabel ?? `Seasons ${span}`,
      headline: { value: `${c.seasonsPositive} of ${c.seasonsCounted}`, sub: `seasons above break-even, ${span}` },
      tiles: [winRateTile(sum.w, sum.l), lastTen, { label: 'Units', value: signed(sum.units), sub: span }].filter(Boolean),
    },
  };
}

/** What a trend's ⓘ says (D-55): its plain sentence, the tier in words, its conditions and notes, then the shared trend notes. */
export const trendInfoBody = card => [card.sentence, card.tierLabel, ...(card.chart?.conditions ?? []), ...(card.notes ?? []), ...INFO.trends.body];

/** A compact row's second line: the side and percent with the sample size, or the record and sample for a two-sided row. */
export const trendRowSub = card => [card.chart?.side, card.pct !== null ? `${card.pct}%` : card.record, card.sample].filter(Boolean).join(' · ');

/** One trend as a compact row that opens in place: the D-55 chart card when the file has its points, else its words. */
function TrendItem({ card, rules, open, onToggle, variant }) {
  const id = useId();
  if (card.locked) return <ShortTrend card={card} rules={rules} variant={variant}/>;
  const chart = card.chart?.spark ? card.chart : null;
  const info = <InfoButton title="About this trend" body={trendInfoBody(card)} links={INFO.trends.links}/>;
  return (
    <li className="gx-tc-item" data-trend={card.kind} data-trend-key={card.key}>
      <div className="gx-tc-rowcard">
        <TrendRow title={card.title} sub={trendRowSub(card)} values={chart?.spark} value={chart ? `${signed(chart.units)} U` : null} open={open} controls={id} onToggle={onToggle}/>
        {open && !chart ? (
          <div className="gx-tc-rowtext" id={id}>
            <p className="gx-t-body gx-c-2">{card.sentence}</p>
            <p className="gx-l-tnums"><span className="gx-sr-only">Record </span><span className="gx-n-s">{card.record}</span><span className="gx-t-meta">{card.sample}</span></p>
            <p className="gx-t-label gx-c-2">{card.tierLabel}</p>
            {card.notes?.map(note => <p className="gx-t-meta" key={note}>{note}</p>)}
          </div>
        ) : null}
      </div>
      {open && chart ? <TrendDetail id={id} title={card.title} pill={tierPill(card.tier)} info={info} {...trendDetailProps(card)}/> : null}
    </li>
  );
}

/** A list of trends (D-55 round 3): compact rows, one open at a time; `openFirst` opens the first trend with a chart. */
export function TrendList({ cards, rules, label, variant, openFirst = false }) {
  const [open, setOpen] = useState(() => (openFirst ? cards.find(card => !card.locked && card.chart?.spark)?.key ?? null : null));
  return (
    <ul className="gx-tc-list" aria-label={label}>
      {cards.map(card => <TrendItem key={card.key} card={card} rules={rules} variant={variant} open={open === card.key} onToggle={() => setOpen(value => (value === card.key ? null : card.key))}/>)}
    </ul>
  );
}

/**
 * The open weather and wind row (D-34): the stadium, the values, the times in Pacific time, the band and honesty
 * notes, and the Open-Meteo credit beside them. Only an open row draws it; the closed row is its title and summary.
 */
export function WeatherDetail({ row }) {
  const { detail } = row;
  return (
    <>
      {detail.place ? <p className="gx-t-strong">{detail.place}</p> : null}
      {detail.values ? (
        <dl className="gx-l-dl">
          {detail.values.map(item => (
            <div key={item.label}><dt className="gx-t-meta gx-c-2">{item.label}</dt><dd className="gx-n-xs">{item.value}</dd></div>
          ))}
        </dl>
      ) : null}
      <Meta text={detail.time}/>
      {detail.lines.map(line => <p className="gx-t-body gx-c-2" key={line}>{line}</p>)}
      {detail.credit ? <WindCredit credit={detail.credit}/> : null}
    </>
  );
}

/** Say `text` only when there is something to say. */
export const Meta = ({ text, className }) => (text ? <p className={cx('gx-t-meta', className)}>{text}</p> : null);

export { LockLine };

export function TrendAvailability({ week }) {
  return week ? <div className="gx-vstack gx-gap-4"><p className="gx-t-meta gx-c-2" data-trend-availability>{trendAvailabilitySummary(week)}</p><Expander title="Source details"><p className="gx-t-meta gx-c-2">{trendAvailabilityText(week)}</p></Expander></div> : null;
}
