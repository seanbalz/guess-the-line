// NBA milestone N2 (docs/superpowers/specs/2026-11-10-nba-buildout-design.md, "N2"): the pure rules the gtl-nba-jobs worker
// applies before SQL stores anything. Server only: no browser imports this file, and nothing here is shown to players.
//   linkNbaSlate   pairs BALLDONTLIE games with The Odds API events by both providers' team names (shared/nba-teams.mjs)
//                  and start time; an event that pairs with no game stays unlinked and is counted.
//   nbaSpreadLine  one game's spread line from the odds adapter's normalized reply: the NFL rule (three books within
//                  5 points of their median, D-74's BetRivers stand-in) or an unqualified row with its reason.
// SQL re-checks every row it is given (supabase/migrations/20261112040000_gtl_nba_slate_lines.sql); these functions only decide
// what the worker sends.
import { nbaTeamFromBallDontLie, nbaTeamFromOddsApi } from './nba-teams.mjs';

export const NBA_TIME_ZONE = 'America/Los_Angeles';
/** A BALLDONTLIE start and an Odds API commence time this close describe the same game. */
export const NBA_LINK_WINDOW_MS = 12 * 3_600_000;
/** The three selected books; BetRivers may stand in for one of them (D-74). */
export const NBA_LINE_BOOKS = Object.freeze(['draftkings', 'fanduel', 'betmgm']);
export const NBA_BACKUP_BOOKS = Object.freeze(['betrivers']);
/** Every book must sit within this many points of the median, as in NFL. */
export const NBA_ALIGN_POINTS = 5;
/** A book's own observation must be at most this old when the read is collected (the adapter's freshness rule). */
export const NBA_FRESH_MS = 5 * 60_000;
/** The reasons an unqualified line can carry (SQL accepts exactly these). */
export const NBA_LINE_REASONS = Object.freeze(['too_few_books', 'books_disagree', 'event_missing', 'schedule_mismatch', 'ambiguous_event',
  'kickoff_passed', 'event_id_changed', 'not_returned']);

const pacificParts = ms => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: NBA_TIME_ZONE, year: 'numeric', month: '2-digit',
  day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms)).map(p => [p.type, p.value]));

/** The Pacific calendar date (YYYY-MM-DD) of an instant. */
export function pacificDate(ms) {
  const p = pacificParts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}
/** The date `days` after a YYYY-MM-DD date. */
export function addDays(date, days) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
/** The instant (ms) of 12:00 AM Pacific on a YYYY-MM-DD date, in daylight or standard time. */
export function pacificMidnight(date) {
  for (const hours of [7, 8]) {
    const ms = Date.parse(`${date}T0${hours}:00:00Z`), p = pacificParts(ms);
    if (pacificDate(ms) === date && p.hour === '00' && p.minute === '00') return ms;
  }
  throw new Error('Invalid date.');
}

/**
 * Links one slate. `games` are BALLDONTLIE games as shared/nba-games.mjs normalizes them; `events` are the odds adapter's
 * listEvents() events ({id, home, away, commenceTime}). A game links to the single event with the same home and away team
 * whose commence time is within 12 hours of the game's BALLDONTLIE start (on the same Pacific date when BALLDONTLIE has no
 * start yet). No candidate, or more than one, leaves the game unlinked; an event links at most one game. Teams the other way
 * round never link: a signed home spread would be read for the wrong team.
 * Returns the rows SQL stores and the counts the run records: every event that links no game is in unmatchedEvents.
 */
export function linkNbaSlate({ games = [], events = [] } = {}) {
  const known = [], counts = { games: 0, unknownGames: 0, events: events.length, linkedGames: 0, unlinkedGames: 0, ambiguousGames: 0,
    linkedEvents: 0, unmatchedEvents: 0, unknownTeamEvents: 0, reversedEvents: 0 };
  for (const game of games) {
    const home = nbaTeamFromBallDontLie(game?.home), away = nbaTeamFromBallDontLie(game?.away);
    if (!home || !away || home.code === away.code) { counts.unknownGames++; continue; }
    known.push({ game, home: home.code, away: away.code });
  }
  const parsed = events.map(event => ({ event, home: nbaTeamFromOddsApi(event?.home)?.code ?? null, away: nbaTeamFromOddsApi(event?.away)?.code ?? null,
    at: Date.parse(event?.commenceTime) }));
  const near = (row, candidate) => {
    if (!Number.isFinite(candidate.at)) return false;
    const start = Date.parse(row.game.startTime ?? '');
    return Number.isFinite(start) ? Math.abs(candidate.at - start) <= NBA_LINK_WINDOW_MS : pacificDate(candidate.at) === row.game.sourceDate;
  };
  const candidates = known.map(row => parsed.filter(c => c.home === row.home && c.away === row.away && near(row, c)));
  // An event claimed by two games links neither (it cannot be told apart).
  const claims = new Map();
  candidates.forEach(list => { if (list.length === 1) claims.set(list[0].event.id, (claims.get(list[0].event.id) ?? 0) + 1); });
  const linked = new Set();
  const rows = known.map((row, i) => {
    const list = candidates[i], only = list.length === 1 && claims.get(list[0].event.id) === 1 ? list[0] : null;
    if (list.length > 1 || (list.length === 1 && !only)) counts.ambiguousGames++;
    if (only) { linked.add(only.event.id); counts.linkedGames++; } else counts.unlinkedGames++;
    const g = row.game;
    return { gameId: g.id, sourceDate: g.sourceDate, home: row.home, away: row.away, startTime: g.startTime ?? null, status: g.status,
      homeScore: g.homeScore ?? null, awayScore: g.awayScore ?? null,
      oddsEventId: only ? only.event.id : null, oddsCommenceTime: only ? new Date(only.at).toISOString() : null };
  });
  counts.games = rows.length;
  counts.linkedEvents = linked.size;
  for (const c of parsed) {
    if (linked.has(c.event?.id)) continue;
    counts.unmatchedEvents++;
    if (!c.home || !c.away) counts.unknownTeamEvents++;
    else if (known.some(row => row.home === c.away && row.away === c.home && near(row, c))) counts.reversedEvents++;
  }
  return { rows, counts };
}

const time = value => (typeof value === 'string' ? Date.parse(value) : NaN);
const iso = ms => new Date(ms).toISOString();

/**
 * One game's spread line from the odds adapter's normalized game (`collect()` reply `games[i]`, spreads market only).
 * Qualified when three books (the selected three, or two of them and BetRivers standing in) each give a paired, fresh signed
 * home spread, all within 5 points of their median, collected before the lock. The line is that median. Anything else is
 * unqualified with its reason, and keeps whatever book quotes it had as evidence.
 */
export function nbaSpreadLine(providerGame, { lockAt, collectedAt }) {
  const collected = time(collectedAt), lock = time(lockAt);
  const quotes = Array.isArray(providerGame?.markets?.spread?.quotes) ? providerGame.markets.spread.quotes : [];
  const books = quotes.filter(q => [...NBA_LINE_BOOKS, ...NBA_BACKUP_BOOKS].includes(q?.book)).slice(0, 4).map(q => ({ book: q.book, line: q.value,
    homePrice: q.outcomes?.home?.odds ?? null, awayPrice: q.outcomes?.away?.odds ?? null, observedAt: q.providerObservedAt ?? null }));
  const unqualified = reason => ({ qualified: false, line: null, reason, books, observedAt: null, collectedAt: Number.isFinite(collected) ? iso(collected) : null });
  if (!Number.isFinite(collected)) return unqualified('not_returned');
  const status = providerGame?.matchStatus;
  if (status !== 'matched') return unqualified(NBA_LINE_REASONS.includes(status) ? status : 'event_missing');
  if (!Number.isFinite(lock) || collected >= lock) return unqualified('kickoff_passed');
  const usable = books.filter(b => Number.isFinite(b.line) && Number.isInteger(b.line * 2) && Math.abs(b.line) <= 100
    && Number.isInteger(b.homePrice) && Number.isInteger(b.awayPrice)
    && Number.isFinite(time(b.observedAt)) && time(b.observedAt) <= collected && collected - time(b.observedAt) <= NBA_FRESH_MS);
  if (usable.length !== 3 || new Set(usable.map(b => b.book)).size !== 3) return unqualified('too_few_books');
  const median = usable.map(b => b.line).sort((a, b) => a - b)[1];
  if (usable.some(b => Math.abs(b.line - median) > NBA_ALIGN_POINTS)) return unqualified('books_disagree');
  return { qualified: true, line: Object.is(median, -0) ? 0 : median, reason: null, books: usable,
    observedAt: iso(Math.min(...usable.map(b => time(b.observedAt)))), collectedAt: iso(collected) };
}
