import React, { useId } from 'react';
import {
  fmtNumber, fmtPct, fmtRecord, fmtSigned, fmtSignedPct, fmtStreak, fmtUnits, fmtYears, itemTitle, lookup, rec, roi110, seasonsOf,
  sideText, sparkPath, splitLabels, summarizeSpark, units110, winRate, yearsOf,
} from '../../shared/trends-view.mjs';

/** A heading at the level the mount point needs (h3 under a game card, deeper inside tables and drilldowns). */
export function Heading({ level = 4, children, ...props }) {
  return React.createElement(`h${Math.min(6, Math.max(2, level))}`, props, children);
}

/** Cumulative units at −110 as an inline SVG line with a zero baseline; the final value is also given as text. */
export function Sparkline({ series, label }) {
  const path = sparkPath(series);
  if (!path) return null;
  return <svg className="trend-spark" viewBox="0 0 120 32" role="img" aria-label={label} focusable="false">
    <title>{label}</title>
    <line className="trend-spark-zero" x1="2" x2="118" y1={path.zeroY} y2={path.zeroY}/>
    <path className="trend-spark-line" d={path.d}/>
    <circle className={`trend-spark-end ${path.last >= 0 ? 'up' : 'down'}`} cx={path.endX} cy={path.endY} r="2.5"/>
  </svg>;
}

function Stats({ items }) {
  return <dl className="trend-stats">{items.map(([term, value, note]) => <div key={term}><dt>{term}</dt><dd><span className="mono">{value}</span>{note && <small>{note}</small>}</dd></div>)}</dl>;
}
const marketName = market => (market === 'total' || market === 'total_rev' ? 'Over/under' : market === 'su' ? 'Straight-up' : 'ATS');
const q3 = q => (typeof q === 'number' ? q.toFixed(3) : '—');
const SCORE_PARTS = [
  ['E', 'Results against the −110 break-even, 2018–2025', 35], ['M', 'Multiple-testing adjustment (BH q)', 10],
  ['R', 'Same side in 2002–2017', 20], ['C', 'Seasons positive, 2018–2025', 15], ['P', 'Points per game against the line', 10],
  ['Rc', 'Last three completed seasons positive', 5], ['K', 'Family prior', 5],
];

/**
 * Tier 1, Tier 2 and watch-list card, laid out like Sean's TrendsCenter card: title, market, record,
 * win rate, ROI, units, streak, last 10, games, years, the cumulative units line and the plain-language
 * filters. The record is the registered side over every game since 2002 (in-sample); the selection
 * period and the prospective record are shown separately, never merged into it.
 */
export function TrendCard({ week, card, item = {}, level = 4 }) {
  const headingId = useId();
  const r = card.record, team = item.team || null;
  const title = team ? `${card.title} · ${team}` : card.title;
  const side = item.bet || sideText(week, card.market, card.sideRule, team) || card.sideLabel;
  const bets = r.W + r.L + r.P, sel = card.selection;
  const badge = card.watch ? 'Watch list' : card.label;
  return <article className={`trend-card ${card.watch ? 'trend-watch' : `trend-tier-${card.tier}`}`} aria-labelledby={headingId}>
    <header className="trend-card-head">
      <Heading level={level} id={headingId}>{title}</Heading>
      <p className="trend-chips">
        <span className="trend-chip">NFL · {marketName(card.market)} · {side}</span>
        <span className="trend-badge">{badge}</span>
        <span className="trend-chip mono">Score {fmtNumber(card.score.score)}/100</span>
        {item.conflict && <span className="trend-badge trend-conflict">Conflicting trends</span>}
      </p>
    </header>
    <p className="trend-basis">Registered side, every game since 2002 (in-sample)</p>
    <Stats items={[
      ['Record', fmtRecord(r)],
      ['Win rate', fmtPct(r.hit), r.wilson95 ? `95% range ${fmtPct(r.wilson95[0], 0)}–${fmtPct(r.wilson95[1], 0)}` : null],
      ['ROI (−110)', fmtSignedPct(r.roi110)],
      ['Units', fmtUnits(r.units110)],
      ['Streak', fmtStreak(r.streak)],
      ['Last 10', fmtRecord(r.last10)],
      ['Games', card.games.toLocaleString('en-US')],
      ['Years', fmtYears(card.years), `${card.seasons} seasons`],
    ]}/>
    <Sparkline series={r.spark} label={summarizeSpark(r.spark, { bets, low: r.sparkLow })}/>
    <ul className="trend-filters" aria-label="Filters">{card.filters.map(filter => <li key={filter}>{filter}</li>)}</ul>
    <div className="trend-records">
      <p><strong>{sel.label}:</strong> <span className="mono">{fmtRecord(sel.rec)}</span> · {sel.seasonsPos} of {sel.seasonsBet} seasons positive · {fmtSigned(sel.pts)} pts/game against the line · q {q3(card.q)}{card.permMaxP ? ` · permutation p ${card.permMaxP} (best score in each shuffled run)` : ''}</p>
      <p><strong>{week.copy.prospective}:</strong> <span className="mono">{fmtRecord(card.sinceRegistered.rec)}</span>{card.thisSeason ? <> · This season <span className="mono">{fmtRecord(card.thisSeason)}</span></> : null}</p>
      {card.roofSplit && <p>Fixed domes <span className="mono">{fmtRecord(card.roofSplit.fixedDome)}</span> · Retractable roofs closed <span className="mono">{fmtRecord(card.roofSplit.retractableClosed)}</span></p>}
      {card.note && <p>{card.note}</p>}
      {item.stacked && <p className="trend-note">{item.stacked.note} {item.stacked.overlapGames} past games overlap with “{itemTitle(week, item.stacked.with)}”.</p>}
      {item.alternatives?.length > 0 && <p className="trend-note">Same bets, also fits: {item.alternatives.map(id => itemTitle(week, id)).join('; ')}.</p>}
    </div>
    <details className="trend-score-detail"><summary>How this score is built</summary>
      <dl className="trend-score-parts">{SCORE_PARTS.map(([key, meaning, max]) => <div key={key}><dt>{key} · {meaning}</dt><dd className="mono">{fmtNumber(card.score[key])} / {max}</dd></div>)}
        <div><dt>Penalties</dt><dd className="mono">{card.score.pen ? `−${fmtNumber(card.score.pen)}` : '0'}</dd></div>
        {card.score.cap !== null && card.score.cap !== undefined && <div><dt>Cap</dt><dd className="mono">{card.score.cap}</dd></div>}
      </dl>
      <p>{week.copy.scoring}</p>
    </details>
  </article>;
}

/** Labels for a compact row: the market, this season's side and the row's standing. */
function rowBadge(row) { return row.anecdote ? 'Anecdote' : row.descriptive ? 'Descriptive' : 'No proven edge'; }
// Split labels come from the row id: a trait, coach or QB row bound to this game's team is not that team's record.
const splitText = (row, id) => { const labels = splitLabels(row.market, id), [a, b, p] = row.split; return `${labels[0]} ${a} · ${labels[1]} ${b} · ${labels[2]} ${p}`; };

/**
 * A Tier 3, entity or referee record. In-sample history is shown both ways (no side, no ROI); the
 * card fields come from the walk-forward record, where each season's side is chosen from earlier
 * seasons only, so no record is a winner by construction.
 */
export function RowCard({ week, id, team = null, title, level = 5, mark = null }) {
  const headingId = useId();
  const row = week.rows[id];
  if (!row) return null;
  const wf = row.wf ? rec(row.wf) : null, years = yearsOf(row, week.season), su = row.market === 'su';
  const side = sideText(week, row.market, row.side, team);
  return <article className="trend-card trend-row-card" aria-labelledby={headingId} {...(mark ? { 'aria-current': 'true' } : {})}>
    <header className="trend-card-head">
      <Heading level={level} id={headingId}>{title || itemTitle(week, id, team)}</Heading>
      <p className="trend-chips">
        <span className="trend-chip">NFL · {marketName(row.market)}</span>
        <span className="trend-badge">{rowBadge(row)}</span>
        {row.score !== null && row.score !== undefined && <span className="trend-chip mono">Score {fmtNumber(row.score)}/100</span>}
        {row.provisional && <span className="trend-badge">Provisional starter</span>}
        {mark && <strong className="trend-this">{mark}</strong>}
      </p>
    </header>
    <p className="trend-split"><span>Since {years[0]}, both ways (in-sample):</span> <span className="mono">{splitText(row, id)}</span></p>
    {wf ? <>
      <p className="trend-basis">Walk-forward from {row.wfFrom || 2003}: each season’s side chosen from earlier seasons only</p>
      <Stats items={[
        ['Record', fmtRecord(wf)],
        ['Win rate', fmtPct(winRate(wf))],
        ...(su ? [] : [['ROI (−110)', fmtSignedPct(roi110(wf))], ['Units', fmtUnits(units110(wf))]]),
        ['Streak', fmtStreak(row.streak)],
        ['Last 10', fmtRecord(row.last10)],
        ['Games', (row.split[0] + row.split[1] + row.split[2]).toLocaleString('en-US')],
        ['Years', fmtYears(years), `${seasonsOf(row, week.season)} seasons`],
      ]}/>
    </> : <p className="trend-basis">No walk-forward record yet (fewer than 20 decided games before each season).</p>}
    <p className="trend-records">Walk-forward 2018–2025: <span className="mono">{fmtRecord(row.oos)}</span> · This season’s side: {side || 'none yet'} · This season <span className="mono">{fmtRecord(row.season || [0, 0, 0])}</span> · Since registered <span className="mono">{fmtRecord(row.since || [0, 0, 0])}</span>{su ? ' · Straight-up records are descriptive; GTL scores spread and total only.' : ''}</p>
  </article>;
}

/**
 * One line per record: band tables, "More in this family" and line-dependent rows. A row the viewer's
 * own saved line falls in is marked with text ("This game") and aria-current, never by color alone.
 */
export function TrendTable({ week, items, caption, marks = {} }) {
  const shown = items.map(item => ({ ...item, hit: lookup(week, item.id) })).filter(item => item.hit);
  if (!shown.length) return null;
  return <div className="trend-table-wrap"><table className="trend-table">
    <caption>{caption}</caption>
    <thead><tr><th scope="col">Record</th><th scope="col">Since 2002, both ways</th><th scope="col">Walk-forward</th><th scope="col">2018–2025</th><th scope="col">Score</th></tr></thead>
    <tbody>{shown.map(({ id, team, hit }) => {
      const key = team ? `${id}@${team}` : id, mark = marks[key];
      const row = hit.kind === 'row' ? hit.entry : null, card = hit.kind === 'card' ? hit.entry : null;
      const wf = row?.wf ? rec(row.wf) : null;
      return <tr key={key} {...(mark ? { 'aria-current': 'true', className: 'trend-current' } : {})}>
        <th scope="row">{itemTitle(week, id, team)}{mark && <strong className="trend-this">{mark}</strong>}{row?.anecdote && <small> · Anecdote</small>}{row?.provisional && <small> · Provisional starter</small>}{card && <small> · {card.watch ? 'Watch list' : card.label}</small>}</th>
        <td data-label="Since 2002, both ways" className="mono">{row ? splitText(row, id) : `${card.split.sides[0]} ${card.split.rec[0]} · ${card.split.sides[1]} ${card.split.rec[1]} · Pushes ${card.split.rec[2]}`}</td>
        <td data-label="Walk-forward" className="mono">{card ? `Registered: ${fmtRecord(card.record)}` : wf ? `${fmtRecord(wf)} · ${fmtPct(winRate(wf))}${row.market === 'su' ? '' : ` · ${fmtUnits(units110(wf))}u`}` : 'Not enough history'}</td>
        <td data-label="2018–2025" className="mono">{fmtRecord(row ? row.oos : card.selection.rec)}</td>
        <td data-label="Score" className="mono">{row && (row.score === null || row.score === undefined) ? 'Descriptive' : fmtNumber(row ? row.score : card.score.score)}</td>
      </tr>;
    })}</tbody>
  </table></div>;
}
