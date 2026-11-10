// Pick a Team result announcements (docs/EPL_FEATURES_2026_11_09.md, confirmed behavior 6; delivery stage 4). Pure
// functions only: no clock, no I/O. A matchweek's result is announced as soon as every one of its fixtures is verified final
// (whole goals for both sides) or explicitly postponed under the existing rules (positive feed evidence or the
// commissioner), independently of the Sleeper snapshots, the weekly-score import and the next draft. Elapsed time and a
// missing feed row are never evidence of a final: such a match stays pending, and the announcement waits visibly.
//
// The award rules are shared/epl-draft.mjs settleBonus unchanged: each drafted club's first match of the week counts; the
// widest winning margin wins (margin x 5), ties break on more goals scored, then fewer conceded; managers still tied all
// receive the full award; a draw, loss or postponed match earns nothing, so a week can end with no winner.
// supabase/migrations/20261110120000_gtl_epl_result_announcements.sql recomputes the same winners in SQL before it records
// an announcement (tests/epl-results-sql.test.mjs checks both agree).
import { settleBonus } from './epl-draft.mjs';
import { verifiedEplResults } from './epl-corrections.mjs';

const list = v => (Array.isArray(v) ? v : []);
const ms = v => { const t = Date.parse(v); return Number.isFinite(t) ? t : null; };
const goals = v => Number.isInteger(v) && v >= 0;
const isFinal = f => f?.status === 'final' && goals(f.homeGoals) && goals(f.awayGoals);

/** Each club's first match of the week (a double gameweek counts its first match only), by kickoff then event id. */
export function firstMatchByClub(fixtures) {
  const sorted = list(fixtures).filter(f => f && typeof f.home === 'string' && typeof f.away === 'string')
    .sort((a, b) => (ms(a.commenceTime) ?? 0) - (ms(b.commenceTime) ?? 0) || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0));
  const first = new Map();
  for (const f of sorted) for (const club of [f.home, f.away]) if (!first.has(club)) first.set(club, f);
  return first;
}

/** One club's side of its first match: final (with goals and opponent), postponed or pending. */
function clubResult(club, f) {
  if (!f) return { status: 'pending' };
  const home = f.home === club, opponent = home ? f.away : f.home;
  if (f.status === 'postponed') return { status: 'postponed', opponent, home };
  if (!isFinal(f)) return { status: 'pending', opponent, home };
  return { status: 'final', goalsFor: home ? f.homeGoals : f.awayGoals, goalsAgainst: home ? f.awayGoals : f.homeGoals, opponent, home };
}

/**
 * The announcement for one matchweek from its stored picks and fixtures, or null when the week has no fixtures yet.
 *   status 'final'    every fixture is verified final or postponed and every drafted club has its match: `winners` holds
 *                     each winning manager (several on a full shared tie; none when no drafted club won)
 *   status 'pending'  at least one fixture still lacks a verified final; `matches.pending` says how many. Nothing is
 *                     inferred from the clock or from a fixture the feed stopped listing.
 * Each winner: { ownerId, club, opponent, home, goalsFor, goalsAgainst, margin, bonus } with bonus = margin x 5 (the
 * commissioner adds it in Sleeper; GTL never adds it again).
 */
export function pickATeamResults({ season, week, picks, fixtures } = {}) {
  const all = list(fixtures);
  if (!all.length) return null;
  const postponed = all.filter(f => f?.status === 'postponed').length;
  const final = all.filter(isFinal).length;
  const matches = { total: all.length, final, postponed, pending: all.length - final - postponed };
  const drafted = list(picks).filter(p => p && typeof p.ownerId === 'string' && typeof p.club === 'string' && p.club)
    .map(p => ({ managerId: p.ownerId, club: p.club }));
  const first = firstMatchByClub(all);
  const results = Object.fromEntries(drafted.map(p => [p.club, clubResult(p.club, first.get(p.club))]));
  const bonus = settleBonus(drafted, results);
  if (!verifiedEplResults(all) || !bonus.ready) return { season, week, status: 'pending', matches, winners: [] };
  const clubOf = new Map(drafted.map(p => [p.managerId, p.club]));
  const winners = bonus.winners.map(ownerId => {
    const club = clubOf.get(ownerId), r = results[club];
    return { ownerId, club, opponent: r.opponent, home: r.home, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
      margin: r.goalsFor - r.goalsAgainst, bonus: bonus.awards[ownerId] };
  }).sort((a, b) => (a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : 0));
  return { season, week, status: 'final', matches, winners };
}

/** A score line from the winner's side: "3-0 vs Chelsea" at home, "2-1 at Everton" away. */
export const scoreLine = (w, clubName = code => code) => `${w.goalsFor}-${w.goalsAgainst} ${w.home ? 'vs' : 'at'} ${clubName(w.opponent)}`;

const names = parts => (parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);
const MAX_BODY = 160; // web/public/sw.js shows at most 160 characters

/**
 * The opt-in push for a final announcement: the matchweek, the winning manager(s), their club(s), margin and bonus, or the
 * no-winner sentence. Only league members are sent it; it names no unrelated account and no private data.
 */
export function resultsPayload({ season, week, winners }, { managerName = id => id, clubName = code => code } = {}) {
  const tag = `gtl-epl-results-${season}-${week}`;
  const rows = list(winners);
  let body;
  if (!rows.length) body = `Pick a Team MW${week} results are final: no drafted club won, so no bonus this week.`;
  else if (rows.length === 1) {
    const w = rows[0];
    body = `Pick a Team MW${week}: ${managerName(w.ownerId)} wins with ${clubName(w.club)}, ${scoreLine(w, clubName)}. Won by ${w.margin}, +${w.bonus} bonus.`;
  } else {
    const w = rows[0];
    body = `Pick a Team MW${week}: ${names(rows.map(r => `${managerName(r.ownerId)} (${clubName(r.club)})`))} share the bonus. Won by ${w.margin}, +${w.bonus} each.`;
  }
  if (body.length > MAX_BODY) body = rows.length > 1
    ? `Pick a Team MW${week}: ${rows.length} managers share the bonus. Won by ${rows[0].margin}, +${rows[0].bonus} each.`
    : body.slice(0, MAX_BODY);
  return { title: 'Guess The Line', body, tag };
}
