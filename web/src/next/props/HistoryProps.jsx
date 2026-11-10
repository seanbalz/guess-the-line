// D-82 Player Props in Me › History (Guess view, Player Props market; only while the app flag is on). Your own locked
// props for the season, separate from Spread and Total: per-stat accuracy (mean absolute miss from each saved
// reference, in that stat's own unit, lower is better, never combined), then the weeks, newest first, and each week's
// props as the existing History game rows with the approved saved-receipt layout (./PropReceipt.jsx). The paper result is
// a third, separately labelled measure. One POST /props/history read covers the whole season: complete, or Retry.
// Another member's prop guesses are not History rows; they open on each prop under the reveal rules (./PropReveal.jsx).
import { useEffect, useRef, useState } from 'react';
import { propsApi } from '../../api.js';
import { Button, Card, Icon, List, Pill, Row, Skeleton } from '../ui/index.js';
import { PROP_UNGRADED, gradePropPaper, propAccuracy, propMiss, propStat } from '../../../../shared/player-props.mjs';
import { AccuracyCard } from './PropRecord.jsx';
import { PropReceipt, propNumber, propSelectionWords } from './PropReceipt.jsx';
import { PropsUnavailable } from './PlayerPropsEntry.jsx';
import '../me/history.css';
import './props.css';

export const HISTORY_PROPS_COPY = Object.freeze({
  loading: 'Loading Player Props history…',
  others: 'Player Props history lists your own locked props. Another player’s locked prop opens on that prop once you lock in the same athlete and stat, or at kickoff.',
  empty: 'No locked props this season.',
  emptyNote: 'No guesses means no accuracy score—not zero.',
  error: 'Player Props history couldn’t load',
  allWeeks: 'All weeks',
});
const PAPER = Object.freeze({ win: ['Win', 'win'], loss: ['Loss', 'loss'], push: ['Push', 'data'], even: ['Even with the line', 'data'] });

/** Rows grouped by week, newest first: `[{ season, week, rows }]`. */
export function propWeeksOf(rows) {
  const weeks = new Map();
  for (const row of rows) {
    const key = `${row.season}:${row.week}`;
    if (!weeks.has(key)) weeks.set(key, { season: row.season, week: row.week, rows: [] });
    weeks.get(key).rows.push(row);
  }
  return [...weeks.values()].sort((a, b) => b.season - a.season || b.week - a.week);
}

/** The paper result words for one locked prop, from the last qualifying retained line and a verified final only. */
export function propPaperWords(row) {
  const grade = gradePropPaper({ stat: row.stat, guess: row.guess, closingLine: row.closingLine, result: row.result });
  if (grade.outcome === 'ungraded') return { word: 'Not graded', tone: 'pending', note: PROP_UNGRADED[grade.reason] ?? PROP_UNGRADED.no_final };
  const [word, tone] = PAPER[grade.outcome];
  const s = propStat(row.stat);
  return { word, tone, note: Number.isFinite(row.result?.actual) ? `Final ${propNumber(row.result.actual)} ${s.unit} · last line ${propNumber(row.closingLine)}` : null };
}

function PropRow({ row }) {
  const s = propStat(row.stat), miss = propMiss(row.stat, row.guess, row.reference?.line), paper = propPaperWords(row);
  return <li className="gx-history-game" data-prop-row={`${row.eventId}/${row.playerId}/${row.stat}`}>
    <details>
      <summary className="gx-history-game-head">
        <span className="gx-vstack gx-grow">
          <span className="gx-t-strong">{row.playerName} · {s.label}</span>
          <span className="gx-t-meta gx-c-2">{miss === null ? 'No saved reference' : miss === 0 ? 'Right on the line' : `Missed by ${propNumber(miss)} ${s.short}`}</span>
        </span>
        <span className="gx-vstack gx-history-game-end">
          <span className="gx-n-s">{propNumber(row.guess)} {s.short}</span>
          <span className="gx-t-meta gx-c-2">{paper.word}</span>
        </span>
        <Icon icon="chevronDown" size={20} className="gx-history-chev"/>
      </summary>
      <div className="gx-vstack gx-gap-8 gx-history-game-body">
        <PropReceipt athlete={row} guess={row}/>
        <div className="gx-wrap gx-gap-8"><Pill tone={paper.tone}>Paper · {paper.word}</Pill></div>
        {paper.note ? <p className="gx-t-meta gx-c-2">{paper.note}</p> : null}
        <p className="gx-t-meta gx-c-2">{propSelectionWords(row, row)}</p>
      </div>
    </details>
  </li>;
}

/** The screen, drawn from what it is given (static-render tested). `read` is `{ status, rows }`. */
export function HistoryPropsScreen({ read, own, week, onWeek, onRetry }) {
  if (!own) return <Card as="section" className="gx-props-card gx-props-state"><span className="gx-props-state-icon" aria-hidden="true"><Icon icon="lock" size={20}/></span>
    <p className="gx-t-body gx-c-2">{HISTORY_PROPS_COPY.others}</p></Card>;
  if (read.status === 'loading') return <Skeleton label={HISTORY_PROPS_COPY.loading} shape="rows" count={3}/>;
  if (read.status === 'unavailable') return <PropsUnavailable onRetry={onRetry}/>;
  if (read.status === 'error') return <Card as="section" className="gx-props-card" role="alert">
    <div className="gx-hstack gx-gap-12"><Icon icon="alert" size={20}/><h3 className="gx-t-strong">{HISTORY_PROPS_COPY.error}</h3></div>
    <p className="gx-t-body gx-c-2">Your saved guesses are safe. Try again.</p><Button icon="refresh" block onClick={onRetry}>Retry this season</Button></Card>;
  const rows = read.rows ?? [];
  if (!rows.length) return <Card as="section" className="gx-props-card"><div className="gx-hstack gx-gap-12"><Icon icon="target" size={24} className="gx-c-accent"/>
    <div className="gx-vstack"><h3 className="gx-t-strong">{HISTORY_PROPS_COPY.empty}</h3><span className="gx-t-meta gx-c-2">{HISTORY_PROPS_COPY.emptyNote}</span></div></div></Card>;
  const weeks = propWeeksOf(rows), chosen = Number.isInteger(week) ? weeks.find(w => w.week === week) ?? null : null;
  if (chosen) return <div className="gx-vstack gx-gap-16" data-prop-week-detail={chosen.week}>
    <Button variant="ghost" className="gx-history-up" onClick={() => onWeek(null)}><Icon icon="chevronLeft" size={20}/>{HISTORY_PROPS_COPY.allWeeks}</Button>
    <Card as="section" className="gx-vstack gx-gap-12" aria-label={`Week ${chosen.week} Player Props`}>
      <h2 className="gx-t-section">Week {chosen.week} · Player Props</h2>
      <p className="gx-t-meta gx-c-2">{chosen.rows.length} locked in · accuracy by stat, never one combined score</p>
    </Card>
    <Card variant="flush" className="gx-history-games"><ul className="gx-history-game-list" aria-label={`Week ${chosen.week} props`}>
      {chosen.rows.map(row => <PropRow key={`${row.eventId}/${row.playerId}/${row.stat}`} row={row}/>)}
    </ul></Card>
  </div>;
  const accuracy = propAccuracy(rows);
  return <section className="gx-vstack gx-gap-16" aria-label="Player Props weeks">
    <div className="gx-vstack gx-gap-4"><h2 className="gx-t-section">Your prop accuracy</h2><p className="gx-t-meta gx-c-2">Average miss vs. saved reference · lower is better · this season</p></div>
    <div className="gx-props-acc-grid">{accuracy.map(entry => <AccuracyCard key={entry.stat} entry={entry}/>)}</div>
    <Card variant="flush"><List label="Player Props weeks">
      {weeks.map(w => {
        const stats = [...new Set(w.rows.map(r => r.stat))].length;
        return <Row key={`${w.season}:${w.week}`} size={64} chevron title={`Week ${w.week}`} onClick={() => onWeek(w.week)} data-prop-week={w.week}
          sub={`${w.rows.length} locked in · ${stats} ${stats === 1 ? 'stat' : 'stats'}`}/>;
      })}
    </List></Card>
    <p className="gx-t-meta gx-c-2">Spread and Total points stay separate. Each stat keeps its own unit.</p>
  </section>;
}

/** The stateful view: one /props/history read for the season. */
export default function HistoryProps({ season, own, week, onWeek, onSignInAgain }) {
  const [read, setRead] = useState({ status: 'loading', rows: [] }), [attempt, setAttempt] = useState(0);
  const auth = useRef(onSignInAgain); auth.current = onSignInAgain;
  useEffect(() => {
    if (!own) return undefined;
    if (!Number.isInteger(season)) { setRead({ status: 'unavailable', rows: [] }); return undefined; }
    const controller = new AbortController();
    setRead({ status: 'loading', rows: [] });
    propsApi('history', { from: { season, week: 1 }, to: { season, week: 22 } }, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data?.complete !== true || !Array.isArray(data.rows)) throw new Error('incomplete');
      setRead({ status: 'ready', rows: data.rows });
    }).catch(error => {
      if (controller.signal.aborted) return;
      if (error?.status === 401) auth.current?.();
      setRead({ status: error?.status === 404 ? 'unavailable' : 'error', rows: [] });
    });
    return () => controller.abort();
  }, [season, own, attempt]);
  return <HistoryPropsScreen read={read} own={own} week={week} onWeek={onWeek} onRetry={() => setAttempt(n => n + 1)}/>;
}
