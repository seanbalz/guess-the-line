// One week of game-feature inputs, checked and put in one shape (redesign build plan stage 68). The features job reads
// them with gtl_read_feature_inputs (stage 69, service role only) and the pure badge, award and streak modules read only
// this shape. Pure and import-free.
//
// The shape, every line and guess a number on the Guess the Line scale (a spread is the home team's line, so "SEA −3"
// at SEA @ DEN is +3; a total is the combined points):
//   { season, week,
//     games:   [{ id, home, away, kickoff, result: null | { status: 'final' | 'void', home, away } }],
//     kickoff: { [gameId]: { spread: number | null, total: number | null } }   the kickoff line (gtl_kickoff_line, M-06):
//              the newest qualifying three-book line captured in the 12 hours before kickoff, else null.
//     guesses: [{ userId, market, gameId, guess, reference, points, late }]   eligible locked-in guesses only (D-39, D-41);
//              `reference` is the guess's own scoring line (D-27, the line at the guess) or null while pending or
//              unavailable, and `points` is null exactly when it is unscored.
//     ballots: [{ userId, market, submitted, locked: [gameId], closed: [gameId], satOut, eligible }]   for the Pick streak.
//     bets:    [{ userId, gameId, market, side, line, odds, units, status, netUnits, kind: 'book' }]   Virtual Units only:
//              real slips never enter (D-36: they never count on any board), and challenge bets wait for stage 55.
//   }
// A malformed input throws: the job must fail closed and record nothing rather than award from a half-read week.

export const MARKETS = Object.freeze(['spread', 'total']);
export const SIDES = Object.freeze({ spread: Object.freeze(['home', 'away']), total: Object.freeze(['over', 'under']) });
export const BET_STATUSES = Object.freeze(['pending', 'win', 'loss', 'push', 'void']);

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const finite = value => typeof value === 'number' && Number.isFinite(value);
const halfPoint = value => finite(value) && Number.isInteger(value * 2);
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const fail = message => { throw new TypeError(`Invalid game-feature input: ${message}.`); };
const time = value => (typeof value === 'string' ? Date.parse(value) : NaN);
// A guess or a bet line is a half point (the writers refuse anything else); a consensus line is a three-book median, so
// only its range is checked.
const inRange = (market, value) => finite(value) && (market === 'spread' ? Math.abs(value) <= 100 : value >= 0 && value <= 200);
const lineOk = (market, value) => value === null || inRange(market, value);
const pickOk = (market, value) => halfPoint(value) && inRange(market, value);
/** gtl_pick_points: 10 minus 1 per half point off, floor 0, rounded to 2 places. */
export const pickPoints = (guessValue, reference) => Math.round(Math.max(0, 10 - 2 * Math.abs(guessValue - reference)) * 100) / 100;

function game(raw) {
  if (!isRecord(raw) || !text(raw.id) || !text(raw.home) || !text(raw.away) || !Number.isFinite(time(raw.kickoff))) fail('game');
  let result = null;
  if (raw.result !== null && raw.result !== undefined) {
    const r = raw.result;
    if (!isRecord(r) || !['final', 'void'].includes(r.status)) fail(`result for ${raw.id}`);
    if (r.status === 'final' && !(Number.isInteger(r.home) && Number.isInteger(r.away) && r.home >= 0 && r.away >= 0)) fail(`final score for ${raw.id}`);
    result = r.status === 'final' ? { status: 'final', home: r.home, away: r.away } : { status: 'void', home: null, away: null };
  }
  return { id: raw.id, home: raw.home, away: raw.away, kickoff: new Date(time(raw.kickoff)).toISOString(), result };
}

function guess(raw, games) {
  if (!isRecord(raw) || !text(raw.userId) || !MARKETS.includes(raw.market) || !games.has(raw.gameId)) fail('guess');
  if (!pickOk(raw.market, raw.guess) || !lineOk(raw.market, raw.reference ?? null)) fail(`guess value for ${raw.gameId}`);
  const reference = raw.reference ?? null, points = raw.points ?? null;
  // Points exist exactly when a reference does, and are the scorer's own (gtl_pick_points; RULES.md).
  if ((reference === null) !== (points === null)) fail(`points for ${raw.gameId}`);
  if (points !== null && points !== pickPoints(raw.guess, reference)) fail(`points for ${raw.gameId}`);
  return { userId: raw.userId, market: raw.market, gameId: raw.gameId, guess: raw.guess, reference, points, late: raw.late === true };
}

function ballot(raw, games) {
  if (!isRecord(raw) || !text(raw.userId) || !MARKETS.includes(raw.market)) fail('ballot');
  const ids = list => (Array.isArray(list) && list.every(id => games.has(id)) ? [...new Set(list)] : fail(`ballot games for ${raw.userId}`));
  return { userId: raw.userId, market: raw.market, submitted: raw.submitted === true, locked: ids(raw.locked ?? []), closed: ids(raw.closed ?? []),
    satOut: raw.satOut === true, eligible: raw.eligible !== false };
}

function bet(raw, games) {
  if (!isRecord(raw) || !text(raw.userId) || !MARKETS.includes(raw.market) || !games.has(raw.gameId) || !SIDES[raw.market].includes(raw.side)) fail('bet');
  if (!pickOk(raw.market, raw.line) || !finite(raw.odds) || !(finite(raw.units) && raw.units > 0)) fail(`bet terms for ${raw.gameId}`);
  if (!BET_STATUSES.includes(raw.status) || (raw.netUnits !== null && raw.netUnits !== undefined && !finite(raw.netUnits))) fail(`bet result for ${raw.gameId}`);
  if ((raw.kind ?? 'book') !== 'book') fail('bet kind');
  return { userId: raw.userId, gameId: raw.gameId, market: raw.market, side: raw.side, line: raw.line, odds: raw.odds, units: raw.units,
    status: raw.status, netUnits: raw.netUnits ?? null, kind: 'book' };
}

/** Checks one week's inputs and returns them in the shape above, games in kickoff order. Throws on anything malformed. */
export function normalizeWeek(raw) {
  if (!isRecord(raw) || !Number.isInteger(raw.season) || !Number.isInteger(raw.week) || raw.week < 1 || raw.week > 25) fail('season or week');
  if (!Array.isArray(raw.games)) fail('games');
  const games = raw.games.map(game).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff) || a.id.localeCompare(b.id));
  const byId = new Map(games.map(g => [g.id, g]));
  if (byId.size !== games.length) fail('duplicate game');
  const kickoff = {};
  for (const g of games) {
    const row = isRecord(raw.kickoff?.[g.id]) ? raw.kickoff[g.id] : {};
    const spread = row.spread ?? null, total = row.total ?? null;
    if (!lineOk('spread', spread) || !lineOk('total', total)) fail(`kickoff line for ${g.id}`);
    kickoff[g.id] = { spread, total };
  }
  const list = (name, fn) => (raw[name] === undefined ? [] : Array.isArray(raw[name]) ? raw[name].map(item => fn(item, byId)) : fail(name));
  const guesses = list('guesses', guess), ballots = list('ballots', ballot), bets = list('bets', bet);
  const unique = (rows, key, name) => { if (new Set(rows.map(key)).size !== rows.length) fail(`duplicate ${name}`); };
  unique(guesses, g => `${g.userId}|${g.market}|${g.gameId}`, 'guess');
  unique(ballots, b => `${b.userId}|${b.market}`, 'ballot');
  unique(bets, b => `${b.userId}|${b.market}|${b.gameId}`, 'bet');
  return { season: raw.season, week: raw.week, games, kickoff, guesses, ballots, bets };
}

/** The game's kickoff in ms. */
export const kickoffMs = (week, gameId) => Date.parse(week.games.find(g => g.id === gameId)?.kickoff ?? '');
/** The week's last kickoff (ISO), or null for an empty slate. */
export const lastKickoff = week => (week.games.length ? week.games[week.games.length - 1].kickoff : null);
/** True once every game of the week has a final or void result. */
export const allFinal = week => week.games.length > 0 && week.games.every(g => g.result !== null);

/** A bet's line from its own side, and the kickoff line from the same side: a spread side's line is the home line or its negative. */
export function kickoffFromSide(market, side, kickoffLine) {
  if (!finite(kickoffLine)) return null;
  return market === 'spread' ? (side === 'home' ? kickoffLine : -kickoffLine) : kickoffLine;
}

/**
 * How many points better a bet's line is than the kickoff line, for its own side (positive: better for the bettor).
 * Spread: a higher number is better (+3.5 beats +3, −2.5 beats −3). Over: a lower total is better; under: a higher one.
 */
export function beatKickoffBy(bet, kickoffLine) {
  const close = kickoffFromSide(bet.market, bet.side, kickoffLine);
  if (close === null) return null;
  if (bet.market === 'spread') return bet.line - close;
  return bet.side === 'over' ? close - bet.line : bet.line - close;
}

/**
 * The bet's margin against its saved line on a final score, as D-26 settles it: positive covers, 0 pushes, negative
 * loses ("lost by 0.5" is −0.5). Null without a final.
 */
export function coverMargin(bet, result) {
  if (!result || result.status !== 'final') return null;
  if (bet.market === 'spread') return (bet.side === 'home' ? result.home - result.away : result.away - result.home) + bet.line;
  return (result.home + result.away - bet.line) * (bet.side === 'over' ? 1 : -1);
}

/**
 * How far the line moved toward a guess between the guess's own scoring line and the kickoff line: the size of the
 * move when it went the guess's way, else 0. Null when either line is missing (no kickoff line: the game is skipped).
 * An exact guess has no direction to move toward, so it is 0.
 */
export function movedToward({ guess, reference }, kickoffLine) {
  if (!finite(reference) || !finite(kickoffLine) || !finite(guess)) return null;
  const way = Math.sign(guess - reference), move = kickoffLine - reference;
  return way !== 0 && Math.sign(move) === way ? Math.abs(move) : 0;
}

/** Plain list order for a user's bets or guesses: kickoff, then game, then Spread before Total. */
export function inKickoffOrder(week, rows) {
  const k = new Map(week.games.map(g => [g.id, Date.parse(g.kickoff)]));
  return [...rows].sort((a, b) => (k.get(a.gameId) - k.get(b.gameId)) || a.gameId.localeCompare(b.gameId) || MARKETS.indexOf(a.market) - MARKETS.indexOf(b.market));
}
