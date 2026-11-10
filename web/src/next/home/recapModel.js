// Monday recap (design record design/monday-recap-2026-11-05, Prism Glass revision; built November 10, 2026). Pure: it
// words only what the existing gated `/league/comparison` read sent (cloud/league.mjs, the reply Play › Compare and
// League › History already read). The database withholds another member's guess, line and points until that game and
// market is open to the viewer (D-31: the viewer's own lock-in, or that game's kickoff); compare.js gates each game a
// second time, and this file adds no third source: a friend's value appears here only through compareRows. The viewer's
// own guesses are always theirs to see (scoreRows of their own entry). Spread and Total stay separate; a week with a
// game still to play is PROVISIONAL, and a missing line or score is never read as zero.
import { pickText, show } from '../../communityFormat.js';
import { ordinal } from '../league/rankMoment.js';
import { compareRows, defaultOpponent, firstName, opponents } from '../play/compare.js';
import { ownEntry, scoreRows } from '../play/scoring.js';

/** Home's layer name for the recap (`#home?layer=recap&season=2026&week=9&market=spread&item=MIA-GB`). */
export const RECAP_LAYER = 'recap';
export const RECAP_MARKETS = Object.freeze([{ value: 'spread', label: 'Spread' }, { value: 'total', label: 'Total' }]);
export const recapMode = market => (market === 'total' || market === 'guess_total' ? 'guess_total' : 'guess_spread');
const finite = value => typeof value === 'number' && Number.isFinite(value);
const ms = value => { const n = Date.parse(value ?? ''); return Number.isFinite(n) ? n : null; };
/** "1 point", "0.5 points", "2 points". */
export const pointsWord = n => `${show(n)} ${n === 1 ? 'point' : 'points'}`;
/** The game-id allowlist the shell uses for one game (`SEA-DEN`). */
export const isGameId = value => typeof value === 'string' && /^[A-Z]{2,4}-[A-Z]{2,4}$/.test(value);

/** The week `{ season, week }` names in a comparison reply, or null. */
export function recapWeek(data, { season, week } = {}) {
  if (!Number.isInteger(week)) return null;
  if (Number.isInteger(season) && Number.isInteger(data?.season) && season !== data.season) return null;
  return (data?.weeks ?? []).find(item => item.week === week) ?? null;
}

/**
 * One game's state from the week's recorded results and the server clock: 'final' (a recorded final with both scores),
 * 'postponed' or 'cancelled' (as recorded), 'live' (kicked off, no final yet) or 'upcoming'. A game without a usable
 * clock is never assumed to have kicked off.
 */
export function gameState(week, game, now) {
  const result = week?.results?.[game.id];
  if (result?.status === 'final' && finite(result.away) && finite(result.home)) return 'final';
  if (result?.status === 'postponed' || result?.status === 'cancelled') return result.status;
  const kickoff = ms(game.kickoff);
  return finite(now) && kickoff !== null && kickoff <= now ? 'live' : 'upcoming';
}
const LEFT = new Set(['live', 'upcoming']);

/** The week's games, earliest kickoff first, each with its state and recorded final; `left` counts games still to finish. */
export function recapGames(week, now) {
  const games = [...(week?.games ?? [])].sort((a, b) => (ms(a.kickoff) ?? Infinity) - (ms(b.kickoff) ?? Infinity) || (a.id < b.id ? -1 : 1)).map(game => {
    const state = gameState(week, game, now), result = week.results?.[game.id];
    return { game, state, final: state === 'final' ? { away: result.away, home: result.home } : null };
  });
  return { games, left: games.filter(item => LEFT.has(item.state)).length };
}

/** "1 game left", "All games final". */
export const leftText = left => (left > 0 ? `${left} ${left === 1 ? 'game' : 'games'} left` : 'All games final');

/**
 * The viewer's weekly standing in one market: the competition rank (ties share) of their week points among that week's
 * scored, eligible ballots (the rule League › History's weekRank uses), `{ rank, of, tied, points, label, line }`, or
 * `{ rank: null, label: '—', line }` when the viewer has nothing scored. `line` names only who is ahead or just behind and
 * by how many week points: "1.5 points behind Maya", "Leading Troy by 2", "Tied for 1st with Troy".
 */
export function weekStanding(data, week, mode) {
  const viewer = data?.viewer, names = new Map((data?.members ?? []).map(m => [m.id, firstName(m.displayName)]));
  const scored = (week?.entries ?? []).filter(e => e.mode === mode && e.status === 'submitted' && e.eligible !== false && e.weekScored > 0 && finite(e.weekPoints));
  const mine = scored.find(e => e.userId === viewer);
  if (!mine) return { rank: null, of: scored.length, tied: false, points: null, label: '—', line: 'No scored games yet' };
  const others = scored.filter(e => e !== mine), name = e => names.get(e.userId) ?? 'Member';
  const rank = 1 + others.filter(e => e.weekPoints > mine.weekPoints).length;
  const level = others.filter(e => e.weekPoints === mine.weekPoints), tied = level.length > 0;
  const label = `${tied ? 'T-' : ''}${ordinal(rank)}`;
  let line;
  if (!others.length) line = 'Only scored player so far';
  else if (rank === 1 && tied) line = `Tied for 1st with ${level.length === 1 ? name(level[0]) : `${level.length} others`}`;
  else if (rank === 1) {
    const next = others.reduce((best, e) => (best === null || e.weekPoints > best.weekPoints ? e : best), null);
    line = `Leading ${name(next)} by ${show(mine.weekPoints - next.weekPoints)}`;
  } else {
    const top = Math.max(...others.map(e => e.weekPoints)), leaders = others.filter(e => e.weekPoints === top);
    line = `${pointsWord(top - mine.weekPoints)} behind ${leaders.length === 1 ? name(leaders[0]) : `${leaders.length} leaders`}`;
  }
  return { rank, of: scored.length, tied, points: mine.weekPoints, label, line };
}

/** The friend the recap compares with: `chosen` when it is another member of this roster, else Compare's default. */
export function recapFriend(data, chosen = null) {
  const others = opponents(data);
  if (!others.length) return null;
  const id = others.some(m => m.id === chosen) ? chosen : defaultOpponent(data) ?? others[0].id;
  const member = others.find(m => m.id === id);
  return { id, name: member?.displayName || 'Member', short: firstName(member?.displayName) };
}

/** The viewer's own side of one game: always theirs to see. `miss` only once the game is scored (never before kickoff). */
function ownSide(week, viewer, mode, gameId) {
  const entry = ownEntry(week, viewer, mode), row = scoreRows(week, entry, { matchup: gameId })[0] ?? null;
  const line = finite(row?.reference?.value) ? row.reference.value : null;
  const guess = row?.locked ? row.guess : null, points = row?.points ?? null;
  return { locked: row?.locked === true, satOut: entry?.status === 'sat_out', draft: !row?.locked && finite(row?.guess),
    guess, line, points, miss: guess !== null && line !== null && points !== null ? Math.abs(guess - line) : null };
}

/** The friend's side of one game, only as compareRows opens it (D-31). 'hidden' carries no value at all. */
function friendSide(row) {
  if (!row || row.state === 'hidden') return { state: 'hidden' };
  const them = row.them;
  const line = finite(them?.reference?.value) ? them.reference.value : null;
  return { state: row.state, locked: them?.locked === true, satOut: them?.satOut === true, guess: them?.locked ? them.guess : null,
    line: them?.locked ? line : null, points: them?.points ?? null, miss: finite(them?.miss) ? them.miss : null };
}

/**
 * One game of the week in one market: `{ game, state, final, me, friend, verdict }`. `friend` is null with no one to
 * compare with; `verdict` is set only when both misses are known.
 */
export function recapGame(data, week, gameId, { mode, friend = null, now } = {}) {
  const game = (week?.games ?? []).find(item => item.id === gameId);
  if (!game) return null;
  const state = gameState(week, game, now), result = week.results?.[game.id];
  const me = ownSide(week, data.viewer, mode, game.id);
  const row = friend ? compareRows(data, { mode, opponent: friend.id, from: week.week, to: week.week, matchup: game.id, now })[0] : null;
  const them = friend ? friendSide(row) : null;
  let verdict = null;
  if (me.miss !== null && them?.miss !== null && them?.miss !== undefined) {
    const gap = them.miss - me.miss;
    verdict = gap > 0 ? { lead: 'you', text: `You were ${pointsWord(gap)} closer than ${friend.short}.` }
      : gap < 0 ? { lead: 'friend', text: `${friend.short} was ${pointsWord(-gap)} closer than you.` }
      : { lead: 'even', text: `You and ${friend.short} were equally close.` };
  }
  return { game, state, final: state === 'final' ? { away: result.away, home: result.home } : null, me, friend: them, verdict };
}

/** A spread or total value in words (a home-referenced spread: −3 is the home team by 3). */
export const valueText = (mode, game, value) => pickText(mode, game.awayCode, game.homeCode, value, { even: 'Even' });

/**
 * The game's result beside your guess, a separate comparison from line accuracy (the design record's contract):
 * `{ headline, detail }`. Spread: who won and by how much, what your guess implied, and how far the final margin was
 * from it. Total: the combined score and how far it was from your guess. Null until there is a final.
 */
export function resultWords(item, mode, shortName) {
  if (!item?.final) return null;
  const { away, home } = item.final, game = item.game, guess = item.me.guess;
  if (mode === 'guess_total') {
    const total = away + home;
    return { headline: `${show(total)} total points.`, detail: guess === null ? 'You had no locked guess.' : guess === total ? 'Exactly your guess.' : `Your guess was ${show(guess)}, ${pointsWord(Math.abs(total - guess))} away.` };
  }
  const margin = home - away;
  const headline = margin === 0 ? 'Tie game.' : `${shortName(margin > 0 ? game.homeCode : game.awayCode)} won by ${show(Math.abs(margin))}.`;
  if (guess === null) return { headline, detail: 'You had no locked guess.' };
  const implied = guess === 0 ? 'a tie' : `${shortName(guess < 0 ? game.homeCode : game.awayCode)} by ${show(Math.abs(guess))}`;
  const off = Math.abs(guess - (away - home));
  return { headline, detail: off === 0 ? `Your guess implied ${implied}, exactly the margin.` : `Your guess implied ${implied}, ${pointsWord(off)} from the final margin.` };
}

/** The friend's line for a game row or the matchup: their miss, or why there is none. Never a hidden value. */
export function friendText(item, mode) {
  const f = item.friend, who = item.friendName;
  if (!f) return null;
  if (f.state === 'hidden') return item.me.locked ? `${who}’s guess opens at kickoff` : `Lock yours or wait for kickoff to see ${who}’s guess`;
  if (f.satOut) return `${who} sat out`;
  if (!f.locked) return f.state === 'waiting' ? `${who} hasn’t locked in` : `${who} didn’t lock in`;
  if (f.miss !== null) return `${who} ${valueText(mode, item.game, f.guess)} · ${show(f.miss)} off`;
  return `${who} ${valueText(mode, item.game, f.guess)} · ${item.state === 'upcoming' ? 'scores at kickoff' : 'not scored yet'}`;
}

/** Your own line for a game row or the matchup: your miss against your saved line, or why there is none. */
export function ownText(item, mode) {
  const me = item.me;
  if (!me.locked) return me.satOut ? 'You sat out' : me.draft ? 'Your draft was not locked in' : 'No locked guess';
  if (me.miss !== null) return `You ${valueText(mode, item.game, me.guess)} · ${show(me.miss)} off`;
  return `You ${valueText(mode, item.game, me.guess)} · ${item.state === 'upcoming' ? 'scores at kickoff' : 'not scored yet'}`;
}

/** The state pill: words, never color alone. */
export const STATE_PILL = Object.freeze({
  final: { tone: 'neutral', word: 'FINAL' },
  live: { tone: 'live', word: 'LIVE' },
  upcoming: { tone: 'pending', word: 'PENDING' },
  postponed: { tone: 'neutral', word: 'POSTPONED' },
  cancelled: { tone: 'neutral', word: 'CANCELLED' },
});

/**
 * The miss chart's scale from the labeled values: whole points from 0 to the larger miss (at least 1), with ticks at
 * each point up to 4 and at halves of the range beyond, so a bar's length always matches the number beside it.
 */
export function missScale(misses) {
  const known = misses.filter(finite);
  const max = Math.max(1, Math.ceil(Math.max(0, ...known)));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 2, max];
  return { max, ticks, width: value => (finite(value) ? Math.max(0, Math.min(1, value / max)) : 0) };
}

/**
 * The whole recap for one week and market: `{ week, left, provisional, standings: { guess_spread, guess_total }, friend,
 * games: [recapGame + friendName] }`, or null when the reply has no such week.
 */
export function buildRecap(data, { season, week: weekNumber, market, friendId = null, now = ms(data?.now) } = {}) {
  const week = recapWeek(data, { season, week: weekNumber });
  if (!week) return null;
  const mode = recapMode(market), friend = recapFriend(data, friendId);
  const { games, left } = recapGames(week, now);
  return {
    season: week.season, week: week.week, mode, left, provisional: left > 0, friend,
    standings: { guess_spread: weekStanding(data, week, 'guess_spread'), guess_total: weekStanding(data, week, 'guess_total') },
    games: games.map(({ game }) => ({ ...recapGame(data, week, game.id, { mode, friend, now }), friendName: friend?.short ?? null })),
  };
}
