// D-69 Play › Your score (spec section 6, mockup Q1-B) and its game layer (P2B). Pure: what the two layers and the Play
// landing tile draw, from the history read (`/community/history`) and the rows scoring.js builds. Points always come
// from the SQL scorer (`row.points`); nothing here scores a guess. Only your own guess and your own saved line appear
// (D-31): every row comes from `ownEntry`.
import { show } from '../../communityFormat.js';
import { fmtSpreadPick, MINUS } from '../format.js';
import { THRESHOLDS } from '../../../../shared/game-features/catalog.mjs';
import { MODE_LABEL } from '../../../../shared/guess-board.mjs';
import { ordinal } from '../league/rankMoment.js';
import { lateLabel, number, ownEntry, scoreRows, scoreSummary } from './scoring.js';

/** A game's points out of this (RULES.md: 10 minus 1 per half point; 10 is a Bullseye, catalog.mjs). */
export const MAX_POINTS = THRESHOLDS.exactPoints;
/** The mockup's green band (Q1-B): a look, not a rule. The points and the words carry the meaning. */
const GOOD_POINTS = 7;
export const GAME_NAME = Object.freeze({ guess_spread: 'Guess the Spread', guess_total: 'Guess the Total' });
const pct = share => Math.round(share * 1000) / 10;
const signed = n => (n < 0 ? `${MINUS}${show(-n)}` : show(n));

/** Your guess or a saved line in a row's words: "DEN −3", "Pick'em", "44.5". */
export const sideText = (mode, game, value) => (mode === 'guess_total' ? show(value) : fmtSpreadPick(game.awayCode, game.homeCode, value));
const missOf = row => {
  const line = number(row.reference?.value);
  return row.points !== null && line !== null && row.guess !== null ? Math.abs(row.guess - line) : null;
};
const tierOf = points => (points === MAX_POINTS ? 'exact' : points >= GOOD_POINTS ? 'good' : 'low');

/**
 * The game layer's number line (P2B): the saved line and your guess on one axis, `pct` from the left. A Spread is drawn
 * as one team's winning margin: the team the saved line favors (on a pick'em line, the team your guess favors; the home
 * team when both are even). Ticks are whole numbers, every 1, 2, 5, 10, 20 or 50 points, so at most eight fit a 320px phone.
 * Null without both numbers.
 */
export function numberLine({ mode, game, guess, line }) {
  const g = number(guess), l = number(line);
  if (g === null || l === null || !game) return null;
  const total = mode === 'guess_total';
  const lead = total ? null : l < 0 || (l === 0 && g <= 0) ? game.homeCode : game.awayCode;
  const at = v => (total || lead === game.awayCode ? v : -v);
  const a = at(l), b = at(g), low = Math.min(a, b), high = Math.max(a, b);
  const from = Math.floor(low) - 2, to = Math.ceil(high) + 2, span = to - from;
  const step = [1, 2, 5, 10, 20, 50].find(s => span / s <= 6) ?? 100;
  const lo = Math.floor(from / step) * step, hi = Math.ceil(to / step) * step;
  const place = v => pct((v - lo) / (hi - lo));
  const align = p => (p < 12 ? 'start' : p > 88 ? 'end' : 'center');
  const ticks = [];
  for (let v = lo; v <= hi; v += step) ticks.push({ value: v, label: signed(v), pct: place(v) });
  const miss = Math.abs(g - l);
  return {
    caption: total ? 'Total points' : `${lead} wins by`,
    ticks,
    line: { pct: place(a), label: `Line ${sideText(mode, game, l)}`, align: align(place(a)) },
    you: { pct: place(b), label: `You ${sideText(mode, game, g)}`, align: align(place(b)) },
    // The gap grows from the saved line toward your guess (transform-origin), so it never starts where you are.
    gap: miss === 0 ? null : { left: place(low), width: Math.round((place(high) - place(low)) * 10) / 10, origin: b >= a ? 'left' : 'right' },
    aria: `Line ${sideText(mode, game, l)}, you ${sideText(mode, game, g)}, ${miss === 0 ? 'exact' : `off by ${show(miss)}`}`,
  };
}

const PILL_WORDS = Object.freeze({
  'Waiting for scoring line': 'Waiting', 'Scores at kickoff': 'Locked', 'Score unavailable': 'Locked', 'Not eligible': 'Not eligible',
  'Draft · not scored': 'Draft', 'No locked guess': 'No pick', Skipped: 'Sat out', Hidden: 'Hidden',
});

/**
 * One picture row (Q1-B): `{ meta, pill: { text, tier, number }, bullseye, share }`. A scored row says "Line · You · off
 * by" and fills its bar by its points; a legitimate 0 is "0 / 10", never a dash. Any other row says its state in words.
 */
export function rowView(row, mode) {
  const { game } = row, line = number(row.reference?.value);
  if (row.points !== null) {
    const miss = missOf(row);
    const meta = [line !== null ? `Line ${sideText(mode, game, line)}` : null, row.guess !== null ? `You ${sideText(mode, game, row.guess)}` : null,
      miss === null ? null : miss === 0 ? 'exact' : `off by ${show(miss)}`].filter(Boolean).join(' · ');
    return { meta, pill: { text: `${show(row.points)} / ${MAX_POINTS}`, tier: tierOf(row.points), number: true }, bullseye: row.points === MAX_POINTS,
      share: Math.min(1, Math.max(0, row.points / MAX_POINTS)) };
  }
  const word = row.status === 'Waiting for scoring line' ? 'waiting for a line' : row.status.toLowerCase();
  const meta = row.locked && row.guess !== null ? `You ${sideText(mode, game, row.guess)} · ${word}` : row.status;
  return { meta, pill: { text: PILL_WORDS[row.status] ?? row.status, tier: 'none', number: false }, bullseye: false, share: null };
}

/**
 * The week's hero (Q1-B): the eyebrow, the points (the server's week total; a filtered subtotal of scored rows), the bar
 * of points out of what the scored games could have earned, and one line ("40 possible · 1 Bullseye · avg miss 1").
 * A filtered subtotal never counts up: it is not a number this device remembers.
 */
export function heroModel({ mode, week, entry, rows, filtered = false }) {
  const summary = scoreSummary(rows);
  const points = !entry || entry.eligible === false ? null : filtered ? summary.points : number(entry.weekPoints);
  const scored = rows.filter(row => row.points !== null);
  const misses = scored.map(missOf).filter(miss => miss !== null);
  const possible = scored.length * MAX_POINTS;
  const bulls = scored.filter(row => row.points === MAX_POINTS).length;
  const avg = misses.length ? misses.reduce((sum, miss) => sum + miss, 0) / misses.length : null;
  const share = points !== null && possible > 0 ? Math.min(1, Math.max(0, points / possible)) : null;
  const market = MODE_LABEL[mode];
  return {
    eyebrow: filtered ? 'Selected games' : `${Number.isInteger(week) ? `Week ${week} · ` : ''}${market}`,
    points, count: !filtered,
    share, bar: share === null ? null : pct(share), meterLabel: share === null ? null : `${show(points)} of ${possible} possible points`,
    line: scored.length ? [`${possible} possible`, `${bulls} ${bulls === 1 ? 'Bullseye' : 'Bullseyes'}`, avg === null ? null : `avg miss ${show(avg)}`].filter(Boolean).join(' · ') : null,
    note: !entry ? `No saved ${market} guesses for this week.` : entry.eligible === false ? 'Not eligible for scoring this week.' : null,
  };
}

/** The layer's one meta line: "Week 8 · 4 of 14 scored", "Week 8 · all games scored", "Week 8 · no record". */
export function layerMeta({ week, known, summary, final = false }) {
  if (!Number.isInteger(week)) return 'No weeks yet';
  return `Week ${week} · ${!known ? 'no record' : final ? 'all games scored' : `${summary.scored} of ${summary.total} scored`}`;
}

const NOT_SCORED = Object.freeze({
  'Waiting for scoring line': 'Waiting for a scoring line.', 'Scores at kickoff': 'Scores at kickoff.', 'Score unavailable': 'Score unavailable. Refresh to check.',
  'Not eligible': 'Not eligible for scoring.', 'Draft · not scored': 'A draft. Only locked guesses score.', 'No locked guess': 'No locked guess for this game.',
  Skipped: 'You sat out this week.', Hidden: 'Hidden.',
});

/**
 * The game layer (P2B): the meta line, the points, BULLSEYE, one sentence ("Off by 2.5", "Right on the line", or why
 * the game is not scored), your guess, the number line and the Late marker. Lock-in time, source and the rule note are
 * the ⓘ (receiptDetails in ScoreReceipt.jsx).
 */
export function gameView({ row, mode, week }) {
  const scored = row.points !== null, miss = missOf(row);
  return {
    meta: `${Number.isInteger(week) ? `Week ${week} · ` : ''}${GAME_NAME[mode]}`,
    scored, points: row.points, bullseye: scored && row.points === MAX_POINTS,
    sentence: scored ? (miss === null ? null : miss === 0 ? 'Right on the line' : `Off by ${show(miss)}`) : NOT_SCORED[row.status] ?? row.status,
    you: row.guess === null ? null : sideText(mode, row.game, row.guess),
    line: miss === null ? null : numberLine({ mode, game: row.game, guess: row.guess, line: number(row.reference?.value) }),
    late: row.pick?.late ? lateLabel(row.pick.late) : null,
  };
}

/** What "About your scores" adds to INFO.scores (D-38: fine print behind ⓘ): the counts, the timing and the standings. */
export function scoreFinePrint({ entry, summary, filtered = false }) {
  const immediate = entry?.scoreTiming === 'immediate';
  const lines = [`${summary.scored} scored · ${summary.locked} locked · ${summary.remaining} not locked${filtered ? ' in this selection' : ''}.`,
    `${summary.pending} waiting for a line · ${summary.ineligible} ineligible.`];
  if (entry) lines.push(immediate ? 'Your eligible locked guesses count immediately.' : 'This saved history uses the scoring timing active for that week.');
  if (entry && !filtered) {
    lines.push(`${show(entry.standingsPoints ?? (immediate ? null : entry.weekPoints))} points in shared standings (games started).`);
    if (immediate) lines.push(`${show(entry.awaitingKickoffPoints)} personal points waiting for kickoff.`);
    lines.push('Every player, including you, uses the same games that have started. A week in progress is not a final weekly win.');
  }
  if (filtered) lines.push('A filtered subset. Filters do not change the whole-week standings or create a new rank.');
  return lines;
}

/** The season rank chip ("3rd ▲ 2") from `rankTile` and the board's last move (`peekMove`); null while unranked. */
export function rankChip(tile, move = null) {
  if (!tile || !Number.isInteger(tile.rank) || tile.rank < 1) return null;
  const label = tile.tied ? `T-${tile.rank}` : ordinal(tile.rank);
  const by = Number.isInteger(move) && move !== 0 ? move : null;
  return { rank: tile.rank, label, move: by, said: `season rank ${label}${by === null ? '' : by > 0 ? `, up ${by}` : `, down ${-by}`}` };
}

/**
 * The Play landing tile (P1B): the latest week of this season with your scored points for `mode` (the other market when
 * `mode` has none; Spread and Total are never summed, D-36), "Week 8 · ▲ 2", and the place it opens. `ranks` is
 * `{ guess_spread, guess_total }` rank chips.
 */
export function scoreTile({ data, mode = 'guess_spread', ranks = {}, loading = false, error = null } = {}) {
  if (!data) {
    if (loading) return { big: '—', sub: 'Loading…', tone: 'plain', said: 'Your score, loading', open: { market: mode } };
    if (error) return { big: '—', sub: 'Open to retry', tone: 'plain', said: 'Your score could not load. Open to retry', open: { market: mode } };
    return { big: '—', sub: 'No scores yet', tone: 'plain', said: 'Your score, no scores yet', open: { market: mode } };
  }
  const weeks = (data.weeks || []).slice().sort((x, y) => y.week - x.week);
  for (const m of [mode, mode === 'guess_total' ? 'guess_spread' : 'guess_total']) for (const week of weeks) {
    const entry = ownEntry(week, data.viewer, m);
    const points = entry && entry.eligible !== false ? number(entry.weekPoints) : null;
    if (points === null || !scoreSummary(scoreRows(week, entry)).scored) continue;
    const rank = ranks[m] ?? null, move = rank?.move ?? null;
    const tail = move > 0 ? ` · ▲ ${move}` : move < 0 ? ` · ▼ ${-move}` : rank ? ` · ${rank.label}` : '';
    return { big: show(points), sub: `Week ${week.week}${tail}`, tone: move > 0 ? 'good' : 'plain',
      said: `Your score, Week ${week.week} ${MODE_LABEL[m]}, ${show(points)} points${rank ? `, ${rank.said}` : ''}`,
      open: { season: week.season, week: week.week, market: m } };
  }
  return { big: '—', sub: 'No scores yet', tone: 'plain', said: 'Your score, no scores yet', open: { market: mode } };
}
