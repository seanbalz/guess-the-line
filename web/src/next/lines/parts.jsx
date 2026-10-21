import { trendAvailabilitySummary, trendAvailabilityText } from '../../trendsAvailability.js';
// Pieces the Lines board, the game sheet and the All trends sheet share (redesign build plan stage 13): the short
// trend card, a row that opens in place, and the credits. They draw what shared/lines-view.mjs and
// shared/trends-view.mjs give them and decide nothing.
import { useId, useState } from 'react';
import { lockedTrendText } from '../../../../shared/lines-view.mjs';
import { Card, Icon, LockLine } from '../ui/index.js';
import { cx } from '../ui/cx.js';

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

/** A list of short trend cards. */
export function TrendList({ cards, rules, label, variant }) {
  return (
    <ul className="gx-l-alist" aria-label={label}>
      {cards.map(card => <ShortTrend key={card.key} card={card} rules={rules} variant={variant}/>)}
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
