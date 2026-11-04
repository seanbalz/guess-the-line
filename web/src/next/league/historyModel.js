// League › History as plain data (D-69 step 1, P6A). Pure: it words only what /community/history sent (cloud/community.mjs
// normalizeHistory) and keeps every value the old screen (CommunityHistory.jsx HistoryLine, the first LeagueHistory)
// showed (D-23). Another member's withheld game reads "Hidden", never a number (D-31, D-39). A week's rank is the
// competition rank of its points (ties share).
import { lateText, pickText, shortName, show } from '../../communityFormat.js';
import { DASH, fmtFull } from '../format.js';
import { ordinal } from './rankMoment.js';

const NONE_REASONS = Object.freeze({
  'submission-time-unavailable': 'No readable submission time is stored, so no line at the guess can be chosen',
  'guess-at-or-after-kickoff': 'Guessed at or after kickoff',
  'no-schedule-template': 'No schedule entry for this game',
});
const NOT_SCORED = Object.freeze({ practice: 'Not scored · practice', 'ruled-ineligible': 'Not scored · not eligible' });
const fileName = path => path.split('/').pop();

/** How long before or after the guess a line was observed: "4h 40m before the guess", "at the guess"; '' without one. */
export function gapPhrase(seconds, anchor = 'the guess') {
  if (!Number.isFinite(seconds)) return '';
  if (seconds === 0) return `at ${anchor}`;
  const minutes = Math.round(Math.abs(seconds) / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  const span = days >= 1 ? `${days}d ${hours % 24}h` : hours >= 1 ? `${hours}h ${minutes % 60}m` : minutes >= 1 ? `${minutes}m` : 'under a minute';
  return `${span} ${seconds > 0 ? 'before' : 'after'} ${anchor}`;
}

/** The line a guess is compared against: `{ value, notes }`, the value in words and each note HistoryLine showed. */
export function lineWords(reference, mode, game) {
  if (!reference) return { value: DASH, notes: ['No line saved · draft'] };
  const value = reference.value === null || reference.value === undefined ? DASH : pickText(mode, game.awayCode, game.homeCode, reference.value, { even: 'Even' });
  const source = reference.source ? [reference.source] : [], saved = reference.savedAt ? [`Saved ${fmtFull(reference.savedAt)}`] : [];
  const observed = (gap = '') => (reference.observedAt ? [`Observed ${fmtFull(reference.observedAt)}${gap ? ` · ${gap}` : ''}`] : []);
  if (reference.basis === 'saved' && reference.status === 'pending') return { value: DASH, notes: ['Pending · the first line after submission becomes this guess\'s reference', ...saved] };
  if (reference.basis === 'saved' && value === DASH) return { value, notes: [`Unscored · ${reference.status === 'stale' ? 'the saved line was stale at submission' : reference.reason || 'no eligible line was saved'}`, ...observed()] };
  if (reference.basis === 'saved') return { value, notes: [reference.rule === 'first_line_after_submission' ? 'First line after submission' : 'Line saved with guess', ...source, ...saved, ...observed()] };
  if (reference.basis === 'commissioner-ruled') return { value, notes: [`Commissioner-ruled line${reference.decision ? ` (${reference.decision})` : ''}`, ...source, ...observed()] };
  if (reference.basis === 'line-at-guess') {
    const stored = reference.guessedAtKnown === false, imported = reference.origin === 'imported-reference';
    return { value, notes: [reference.rule === 'first-after-submission' ? 'Line at guess · first line after it' : 'Line at guess',
      ...(stored ? ['Original guess time not recorded · compared at the stored submission time'] : []),
      ...(reference.source ? [`${reference.source}${imported && reference.sourceFile ? ` · ${fileName(reference.sourceFile)}` : ''}`] : []),
      ...(imported ? [`Provisional · page time as published by the source${reference.capturedAt ? `; captured ${fmtFull(reference.capturedAt)}` : '; capture time not recorded'}${reference.decision ? ` (${reference.decision})` : ''}`] : []),
      ...observed(gapPhrase(reference.gapSeconds, stored ? 'the stored submission time' : 'the guess'))] };
  }
  if (reference.basis === 'nearest-snapshot') return { value, notes: ['Nearest snapshot at submission · not used for points', ...source, ...observed(gapPhrase(reference.gapSeconds))] };
  if (NONE_REASONS[reference.reason]) return { value: DASH, notes: [reference.reason === 'submission-time-unavailable' ? 'Submission time unavailable' : 'No line stored', NONE_REASONS[reference.reason]] };
  return { value: DASH, notes: ['No line stored', reference.reason === 'snapshot-not-qualifying'
    ? `The snapshot before this submission (${fmtFull(reference.priorSnapshotAt)}) had no usable line for this game${reference.detail ? ` (${reference.detail})` : ''}`
    : reference.nextSnapshotAt ? `No snapshot before this submission; the first came ${fmtFull(reference.nextSnapshotAt)}` : 'No snapshot was collected for this week'] };
}

/** One member's entry for a week and market: a sat-out entry wins, as the old screen read it. */
export function entryOf(week, userId, mode) {
  const entries = (week?.entries ?? []).filter(item => item.userId === userId && item.mode === mode);
  return entries.find(item => item.status === 'sat_out') ?? entries[0] ?? null;
}

/** A week's words for one entry: `{ status, points, notes }`; the notes (stored time, ruling, revisions) go behind ⓘ. */
export function weekSummary(entry) {
  if (!entry) return { status: 'No ballot.', points: null, notes: [] };
  const notes = [];
  if (entry.submittedAtKnown === false) notes.push('Original submission time was not recorded; the stored time is shown.');
  if (entry.ruling) notes.push(`Commissioner ruling · ${entry.ruling.decision || 'recorded'}`);
  if (entry.updatedAt) notes.push(`Last saved ${fmtFull(entry.updatedAt)}${entry.revisions ? ` · ${entry.revisions} revisions` : ''}`);
  const status = entry.status === 'sat_out' ? 'Sat out. Recorded as sat out, not zero.' : entry.status === 'draft' ? 'Draft · not submitted'
    : `Submitted${entry.submittedAt ? ` · ${fmtFull(entry.submittedAt)}` : ''}${entry.late ? ` · ${lateText(entry.late)}` : ''}`;
  const points = entry.status !== 'submitted' ? null : entry.eligible === false ? 'Not eligible for scoring'
    : entry.weekScored ? `${show(entry.weekPoints)} pts · ${entry.weekScored} games scored` : 'No scored result yet';
  return { status, points, notes };
}

/** The competition rank of `userId`'s week points among that week's scored, eligible ballots in `mode`, or null. */
export function weekRank(week, userId, mode) {
  const scored = (week?.entries ?? []).filter(e => e.mode === mode && e.status === 'submitted' && e.eligible !== false && e.weekScored > 0 && Number.isFinite(e.weekPoints));
  const mine = scored.find(e => e.userId === userId);
  return mine ? { rank: 1 + scored.filter(e => e.weekPoints > mine.weekPoints).length, of: scored.length } : null;
}

/** Week tiles, oldest first: `{ week, label, big, sub, aria }`. */
export function weekTiles(data, userId, mode) {
  return [...(data?.weeks ?? [])].sort((a, b) => a.week - b.week).map(week => {
    const entry = entryOf(week, userId, mode), rank = weekRank(week, userId, mode), big = rank ? show(entry.weekPoints) : DASH;
    const sub = rank ? ordinal(rank.rank) : !entry ? 'No ballot' : entry.status === 'sat_out' ? 'Sat out' : entry.status === 'draft' ? 'Draft' : entry.picksHidden && !entry.picks ? 'Hidden' : 'Not scored';
    return { week: week.week, label: `Week ${week.week}`, big, sub, aria: `Week ${week.week}, ${big === DASH ? 'no points' : `${big} points`}, ${rank ? `${ordinal(rank.rank)} of ${rank.of}` : sub}` };
  });
}

/** Season tiles when there is more than one season, newest first: `{ season, label, big, sub, on }`; else null. */
export function seasonTiles(data) {
  const seasons = [...new Set(data?.seasons ?? [])].sort((a, b) => b - a);
  return seasons.length < 2 ? null : seasons.map(season => ({ season, label: 'Season', big: String(season), sub: season === data.season ? 'Showing' : 'See weeks', on: season === data.season }));
}

/** The final's words as the old screen's Result cell read them (D-23): score, then the margin, "Tie" or the total, then the source. */
function resultNote(result, game, mode) {
  if (!result) return 'No final recorded';
  if (result.status !== 'final') return `${result.status === 'postponed' ? 'Postponed' : 'Cancelled'}${result.source ? ` · ${result.source}` : ''}`;
  const margin = result.home - result.away;
  const detail = mode === 'guess_total' ? `${result.home + result.away} total points` : margin === 0 ? 'Tie' : `${shortName(margin > 0 ? game.homeCode : game.awayCode)} by ${Math.abs(margin)}`;
  return `Final · ${game.awayCode} ${show(result.away)}, ${game.homeCode} ${show(result.home)} · ${detail}${result.origin === 'commissioner_reported' ? ' · Commissioner-reported final' : result.source ? ` · ${result.source}` : ''}`;
}

/**
 * One game's row in a week layer: `{ id, away, home, hidden, guess, line, points, notes }`. `now` (the server's clock) lets a
 * sent guess whose game has not kicked off read "Scores at kickoff" once the week's per-game gate is live (M-01), else "Unscored".
 */
export function weekGame(week, entry, game, mode, now) {
  const pick = (entry?.picks ?? []).find(item => item.gameId === game.id), hidden = pick?.hidden === true || (entry?.picksHidden === true && !pick);
  if (hidden) return { id: game.id, away: game.awayCode, home: game.homeCode, hidden, guess: 'Hidden', line: 'Hidden', points: 'Hidden', notes: [`Kickoff ${fmtFull(game.kickoff)}`] };
  const line = lineWords(pick?.reference, mode, game), at = Date.parse(now);
  const pending = !!week?.gate && !!pick && entry?.status === 'submitted' && Number.isFinite(pick.reference?.value) && Number.isFinite(at) && !(Date.parse(game.kickoff) <= at);
  const points = entry?.eligible === false ? NOT_SCORED[entry.eligibility] || NOT_SCORED.practice
    : Number.isFinite(pick?.points) ? `${show(pick.points)} / 10` : pending ? 'Scores at kickoff' : 'Unscored';
  return { id: game.id, away: game.awayCode, home: game.homeCode, hidden, guess: pickText(mode, game.awayCode, game.homeCode, pick?.guess), line: line.value, points,
    notes: [`Kickoff ${fmtFull(game.kickoff)}`, ...line.notes, resultNote(week?.results?.[game.id], game, mode)] };
}
