// D-69 step 3 (spec 5, picture rows; spec 6 step 3, "The board becomes picture rows"): one board card (boardMarkets.js
// marketBoard) as one row. Pure. A row shows the two marks, the matchup, the records (or a final's score) as its one
// meta line, and the consensus Spread on the right over its word. The Total, your saved guesses, a trend line, the
// weather word and the late pill leave the row's face for the game layer; the row's spoken name keeps every one of them.
import { DASH, SEP } from '../format.js';

/** The Spread cell's state in one word (D-38: the word carries it; color only repeats it). */
export const ROW_WORDS = Object.freeze({ 'Current line': 'Current', 'Latest recorded line': 'Latest', 'Time unverified': 'Unverified', Unavailable: 'No line' });
const PENDING = new Set(['Latest recorded line', 'Time unverified']);

/** The card's sentence with the records said after the matchup: "Seahawks at Broncos, Sun 1:05 PM PT. Records: Seahawks 4–2, Broncos 3–3. …". */
export function withRecords(aria, card, records) {
  const words = [['away', card.away], ['home', card.home]].filter(([key]) => records?.[key]).map(([key, side]) => `${side.nick} ${records[key]}`);
  if (!words.length) return aria;
  const at = aria.indexOf('. '), said = `Records: ${words.join(', ')}`;
  return at < 0 ? `${aria}. ${said}` : `${aria.slice(0, at)}. ${said}${aria.slice(at)}`;
}

/**
 * `{ id, title, meta, value, word, tone, ariaLabel }` for one card. `value` is `{ lock: true }` (the market is closed: a
 * lock, never "—"), `{ loading: true }`, or `{ text, line }` (the quote, or "—" with none). `meta` is the meta line's parts.
 */
export function boardRow(card, records = null) {
  const cell = card.spread ?? { open: false };
  const value = !cell.open ? { lock: true } : cell.loading ? { loading: true } : cell.line ? { text: cell.line, line: true } : { text: DASH, line: false };
  const word = card.final ? 'Final' : card.started ? 'Kicked off' : !cell.open ? 'Locked' : cell.loading ? null : ROW_WORDS[cell.label] ?? null;
  const tone = !card.final && !card.started && cell.open && PENDING.has(cell.label) ? 'warn' : 'plain';
  const score = typeof card.final?.score === 'string' ? card.final.score.replace(/^Final · /, '') : null;
  const recs = records && (records.away || records.home) ? `${records.away ?? DASH}${SEP}${records.home ?? DASH}` : null;
  return { id: card.id, title: card.away?.nick && card.home?.nick ? `${card.away.nick} @ ${card.home.nick}` : card.matchup, meta: [card.showTime ? card.time : null, score ?? recs].filter(Boolean), value, word, tone,
    ariaLabel: withRecords(card.aria, card, records) };
}
