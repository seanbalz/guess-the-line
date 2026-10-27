// Me › History in plain words (redesign build plan stages 73 and 74; DP-15: never a raw id or JSON). Pure: it reads only
// what the server sent (/community/history, /me/changes, /me/records, /bets/read) and words it; the server decides what
// each viewer may see, and a value it withheld stays "—" or hidden here (rule of restraint 8).
import { DASH, SEP, fmtAmt, fmtFull, fmtLate, fmtMatchup, fmtNum, fmtRecord, fmtSpreadPick, fmtU, plural } from '../format.js';
import { pickText } from '../bets/everyone.js';
import { FORFEIT_LABEL, closedDraft } from '../copy.js';

export const HISTORY_MARKETS = Object.freeze([{ value: 'guess_spread', label: 'Spread' }, { value: 'guess_total', label: 'Total' }]);
export const MARKET_WORD = Object.freeze({ guess_spread: 'Spread', guess_total: 'Total' });
const number = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** A guess or line in plain words: "SEA −2.5" (from the home spread) or "44.5" for a total; "—" when missing. */
export function guessWords(mode, game, value) {
  if (number(value) === null) return DASH;
  return mode === 'guess_total' ? fmtNum(value) : fmtSpreadPick(game?.awayCode, game?.homeCode, value);
}

/** "TB @ DAL", never "TB-DAL". */
export const matchupWords = game => fmtMatchup(game?.awayCode, game?.homeCode);

/** "95.8 pts"; "—" for no points (never a zero for a ballot that scored nothing). */
export const pointsWords = points => (number(points) === null ? DASH : `${Number(points.toFixed(2))} pts`);

/** One member's entry for a week and market: a sat-out entry wins, as Play and the old History read it. */
export function entryFor(week, userId, mode) {
  const entries = (week?.entries || []).filter(entry => entry.userId === userId && entry.mode === mode);
  return entries.find(entry => entry.status === 'sat_out') ?? entries[0] ?? null;
}

const lockedCount = entry => (Array.isArray(entry?.picks) ? entry.picks.filter(pick => pick.lockedIn === true || (pick.lockedIn === undefined && entry.status === 'submitted' && number(pick.guess) !== null)).length : 0);

/**
 * A week's status for one member and market: { word, tone, late, notes[] }. `forfeit` is the owner's own forfeit record for
 * the week (its reason is the owner's alone: another member's forfeit reads "Sat out", as Home's who's in shows it).
 */
export function weekStatus(entry, { forfeit = null, own = false } = {}) {
  if (!entry) return { word: 'No ballot', tone: 'neutral', late: null, notes: [] };
  const notes = [];
  if (entry.submittedAtKnown === false) notes.push('Original time not recorded');
  if (entry.eligibility === 'practice') notes.push(`Practice${SEP}unofficial`);
  if (entry.eligibility === 'ruled-eligible') notes.push('Ruled eligible');
  if (entry.eligibility === 'ruled-ineligible') notes.push(`Not eligible${SEP}ruled`);
  if (entry.ruling) notes.push('Commissioner-ruled lines');
  const late = number(entry.late?.minutes) !== null ? fmtLate(entry.late.minutes) : entry.late ? fmtLate(null) : null;
  if (entry.status === 'sat_out') {
    const word = own && forfeit ? FORFEIT_LABEL[forfeit.reason] ?? FORFEIT_LABEL.sitOut : FORFEIT_LABEL.sitOut;
    const kept = lockedCount(entry);
    return { word, tone: 'neutral', late, notes: kept ? [...notes, `${plural(kept, 'locked-in guess', 'locked-in guesses')} still count`] : notes };
  }
  if (entry.status === 'submitted') return { word: 'Submitted', tone: 'win', late, notes };
  const locked = lockedCount(entry);
  return locked ? { word: `${locked} locked in`, tone: 'win', late, notes } : { word: 'Draft', tone: 'pending', late, notes };
}

/** The week's points line: "95.8 pts · 15 of 15 scored", "Not eligible for scoring", or null when nothing scored yet. */
export function weekPointsWords(entry) {
  if (!entry || entry.status === 'draft' && !lockedCount(entry)) return null;
  if (entry.eligible === false) return 'Not eligible for scoring';
  if (!number(entry.weekPoints) && !entry.weekScored) return number(entry.weekPoints) === 0 ? `0 pts${SEP}${entry.weekScored} of ${entry.games} scored` : null;
  return `${pointsWords(entry.weekPoints)}${SEP}${entry.weekScored} of ${entry.games} scored`;
}

const REFERENCE_WORDS = Object.freeze({
  'commissioner-ruled': 'Commissioner-ruled line',
  saved: 'Line at your guess',
  'line-at-guess': 'Line at the guess',
  first_line_after_submission: 'First line after submission',
  line_at_guess: 'Line at your guess',
});
/** "Line at your guess SEA −2.5", "First line after submission 44.5", "Line pending", "No line stored". */
export function referenceWords(mode, game, reference) {
  if (!reference) return null;
  const label = REFERENCE_WORDS[reference.basis] ?? REFERENCE_WORDS[reference.rule] ?? 'Line';
  if (reference.status === 'pending') return 'Line pending';
  if (number(reference.value) === null) return reference.basis === 'none' ? 'No line stored' : `${label}${SEP}not available`;
  return `${label} ${guessWords(mode, game, reference.value)}`;
}

/** The provenance behind a tap: source, observed time and the stored-time note; one meta line each. */
export function referenceDetail(reference) {
  if (!reference) return [];
  const lines = [];
  if (reference.source) lines.push(`Source${SEP}${reference.source}`);
  if (reference.observedAt) lines.push(`Observed ${fmtFull(reference.observedAt)}`);
  if (reference.decision) lines.push(`Ruling ${reference.decision}`);
  if (reference.guessedAtKnown === false) lines.push('Compared at the stored submission time');
  return lines;
}

/** A final in words: "Final · TB 20, DAL 27", "Postponed". */
export function finalWords(game, result) {
  if (!result) return null;
  if (result.status !== 'final') return result.status === 'postponed' ? 'Postponed' : result.status === 'cancelled' ? 'Cancelled' : null;
  return `Final${SEP}${game?.awayCode ?? DASH} ${result.away ?? DASH}, ${game?.homeCode ?? DASH} ${result.home ?? DASH}`;
}

/** One game's row in the week detail: { matchup, guess, line, points, final, closedDraft, hidden }. */
export function gameRow(week, entry, game, { own = false, rules, now = Date.now() } = {}) {
  const mode = entry?.mode, pick = (entry?.picks || []).find(item => item.gameId === game.id) ?? null;
  const hidden = pick?.hidden === true || (entry?.picksHidden && !pick);
  const kickedOff = Date.parse(game.kickoff) <= now;
  const draftClosed = own && pick && pick.lockedIn === false && number(pick.guess) !== null && (pick.closedAtKickoff || kickedOff);
  return {
    gameId: game.id, matchup: matchupWords(game), hidden,
    guess: hidden ? null : guessWords(mode, game, pick?.guess),
    line: hidden ? null : referenceWords(mode, game, pick?.reference),
    detail: hidden ? [] : referenceDetail(pick?.reference),
    points: hidden ? null : entry?.eligible === false ? 'Not scored' : number(pick?.points) !== null ? pointsWords(pick.points) : null,
    late: !hidden && pick?.late ? fmtLate(number(pick.late.minutes)) : null,
    draft: own && pick && pick.lockedIn === false && number(pick.guess) !== null && !draftClosed,
    closedDraft: draftClosed ? closedDraft(guessWords(mode, game, pick.guess), { rules, atKickoff: true }) : null,
    final: finalWords(game, week?.results?.[game.id]),
  };
}

/** One /me/changes change in plain words, one line per game: [{ text, late, at }]. */
export function changeLines(market, change) {
  const games = new Map((market?.games || []).map(game => [game.id, game]));
  return (change?.games || []).map(item => {
    const game = games.get(item.gameId), words = value => guessWords(market.mode, game, value), match = matchupWords(game);
    const line = item.reference && number(item.reference.value) !== null ? `${SEP}line ${words(item.reference.value)}` : item.reference?.status === 'pending' ? `${SEP}line pending` : '';
    let text;
    if (item.kind === 'resolved') text = `${match}: line found${SEP}first line after submission ${words(item.reference?.value)}`;
    else if (item.kind === 'locked') text = `${match}: locked in ${words(item.after)}${line}`;
    else if (item.kind === 'edited') text = `${match}: changed ${words(item.before)} to ${words(item.after)} after submitting${line}`;
    else text = item.before === null ? `${match}: draft ${words(item.after)}` : `${match}: draft ${words(item.before)} to ${words(item.after)}`;
    if (change.ruled) text += `${SEP}commissioner-ruled${change.ruled.decision ? ` (${change.ruled.decision})` : ''}`;
    return { text, at: change.at ? fmtFull(change.at) : 'Time not recorded', late: change.late ? fmtLate(change.late.minutes) : null };
  });
}

/** "+1.36U", "−1U", "Push", "Void", "Pending" for one Virtual Units bet. */
export function betResultWords(bet) {
  const status = bet?.result?.status ?? bet?.status;
  if (status === 'win' || status === 'loss') return { word: status === 'win' ? 'WIN' : 'LOST', tone: status === 'win' ? 'win' : 'loss', units: fmtAmt(bet.result?.netUnits ?? null) };
  if (status === 'push') return { word: 'PUSH', tone: 'pending', units: fmtAmt(0, false) };
  if (status === 'void') return { word: 'VOID', tone: 'neutral', units: null };
  if (status === null || status === undefined) return { word: 'Hidden', tone: 'neutral', units: null };
  return { word: 'PENDING', tone: 'pending', units: null };
}

/** One Virtual Units bet in words: "DEN +3 · 1.5U"; a friend's closed market keeps side and units only (bets/everyone.js). */
export const betWords = (game, bet) => `${pickText(game, bet?.market, bet?.selection)}${SEP}${fmtU(bet?.selection?.units)}`;

/** A week's Virtual Units record for one player: { record, net, bets }. */
export function betsRecord(bets) {
  const tally = { win: 0, loss: 0, push: 0 }; let net = 0, settled = 0;
  for (const bet of bets) {
    const status = bet.result?.status ?? bet.status;
    if (Object.hasOwn(tally, status)) tally[status] += 1;
    if (number(bet.result?.netUnits) !== null) { net += bet.result.netUnits; settled += 1; }
  }
  return { record: fmtRecord(tally.win, tally.loss, tally.push), net: settled ? fmtAmt(Math.round(net * 100) / 100) : DASH, bets: plural(bets.length, 'bet') };
}
