// Home as plain data (D-69 step 2, layout H1A, with the design audit's C9): the next-move card's words, the six tiles and
// This week's game tiles, from the replies Home already reads (the normalized /community/read reply and its shared hero,
// shared/home-view.mjs; the viewer's own /personal week; the features, tickets and saved-trends reads). Pure: no React,
// storage, network or clock of its own; every count and time is the server's.
// - The card: "Your next move" over "Lock in 9 games" and "before Thu 5:15 PM PT" while picks are due ("Next kickoff
//   Sun 10:00 AM PT" with per-game lock-in); otherwise "Week N" over one plain headline ("Week N locked in" once nothing
//   is left). Each market's meter carries its own words ("Spread · 3 of 14 locked").
// - The count is the games still to lock in the market with the most left: a per-game market's `openGames` (open and
//   not yet locked by you), a whole-market ballot's games until it is sent or sat out.
// - A game tile says only the viewer's own Spread state, in the picks card's words (play/moments.js gameState, CARD_STATE), never a
//   pick, a line or another player (D-31).
// "N games live" is not drawn: the Community read carries no per-game status and there is no approved live source
// (rule of restraint 8), so Home never claims a game is in progress.
import { MODES } from '../../../../shared/guess-board.mjs';
import { HOME_COPY } from '../../../../shared/home-view.mjs';
import { gamesOf, optOutsFor, teamOf } from '../../../../shared/lines-view.mjs';
import { weekOpenAt } from '../../../../shared/nfl-schedule.mjs';
import { show } from '../../communityFormat.js';
import { DASH, SEP, fmtWhen, plural, toMs } from '../format.js';
import { ballotProgress } from '../play/landing.js';
import { CARD_STATE, gameState } from '../play/moments.js';
import { rankChip } from '../play/yourScore.js';

/** Home's layers (`#home?layer=who`). */
export const HOME_LAYERS = Object.freeze({ who: 'who' });
/** Each tile's glyph (ui/Icon.jsx names); My bets and Trends take theirs from ui/destinations.js. */
export const HOME_TILE_ICONS = Object.freeze({ guess_spread: 'chart', guess_total: 'target', who: 'people', awards: 'award' });
/** How many of the week's games This week shows. */
export const GAME_TILES = 4;

export const HERO_COPY = Object.freeze({
  nextMove: 'Your next move',
  weekMove: week => `Week ${week} · Your next move`,
  yourWeek: 'Your week',
  lockIn: n => `Lock in ${plural(n, 'game')}`,
  before: when => `before ${when}`,
  nextKickoff: when => `Next kickoff ${when}`,
  allIn: week => `Week ${week} locked in`,
  satOut: week => `Week ${week} sat out`,
  locked: HOME_COPY.closed,
  opensSoon: 'Picks open soon',
  dueSoon: 'Due soon',
  streak: n => `${n}-week pick streak`,
});

/** Games still to lock in across the week's markets (the market with the most left), from the server's `due` rows. */
export function gamesToLock(community) {
  const due = Array.isArray(community?.due) ? community.due : [];
  const week = community?.week;
  const games = Array.isArray(week?.games) ? week.games.length : Number(week?.games) || 0;
  const perGame = community?.rules?.perGameScoring === true;
  const left = MODES.map(mode => {
    const row = due.find(d => d?.mode === mode);
    if (!row) return games;
    if (perGame && Number.isInteger(row.locked)) return Number.isInteger(row.openGames) && row.openGames > 0 ? row.openGames : 0;
    if (row.submitted === true || row.satOut === true) return 0;
    return Number(row.games) || games;
  });
  return Math.max(0, ...left);
}

/** Each market's week as Play's landing reads it (ballotProgress: a per-game sit-out keeps its locked count). */
const marketRows = community => ['spread', 'total'].map(market => ballotProgress(community, market)).filter(Boolean);
const doneTitle = (community, week) => {
  const rows = marketRows(community);
  return rows.length && rows.every(row => row.satOut) ? HERO_COPY.satOut(week) : HERO_COPY.allIn(week);
};

/** `{ eyebrow, title, sub }` for the card: the eyebrow, the one headline and the meta line under it (null when none). */
export function heroHeadline({ hero, community }) {
  const week = hero?.week ?? null;
  if (hero?.state === 'none' || week === null) return { eyebrow: null, title: HOME_COPY.noWeek, sub: null };
  const eyebrow = HOME_COPY.weekTitle(week);
  if (hero.action?.primary) {
    const n = gamesToLock(community);
    if (n === 0) return { eyebrow: HERO_COPY.yourWeek, title: doneTitle(community, week), sub: null };
    const when = hero.countdownTarget ? fmtWhen(hero.countdownTarget) : null;
    return { eyebrow: HERO_COPY.weekMove(week), title: HERO_COPY.lockIn(n), sub: when ? (hero.perGame ? HERO_COPY.nextKickoff(when) : HERO_COPY.before(when)) : null };
  }
  if (hero.state === 'done') return { eyebrow: HERO_COPY.yourWeek, title: doneTitle(community, week), sub: null };
  if (hero.state === 'not_open') return { eyebrow: HERO_COPY.weekMove(week), title: HERO_COPY.opensSoon, sub: null };
  return { eyebrow, title: HERO_COPY.locked, sub: null };
}

/** C9: one meter per market with its own words, for the card's one status row. No week, no meters. */
export function heroMeters(community) {
  return marketRows(community).map(row => ({ mode: row.mode, done: row.done, of: row.of,
    words: `${row.label}${SEP}${row.satOut ? 'sat out' : row.state === 'sent' ? 'sent' : `${row.done} of ${row.of} ${row.state === 'locked' ? 'locked' : 'picked'}`}` }));
}

/**
 * A rank tile (`tile` is shared/guess-board.mjs rankTile): the ordinal as the big number, the move this device last saw
 * as "▲ 2" (good) or "▼ 1" (plain; a drop stays quiet), the season points under it. Unranked is said, never a zero.
 */
export function rankTileView({ label, tile, move = null }) {
  const chip = rankChip(tile, move);
  if (!chip) return { ranked: false, big: DASH, arrow: null, points: null, tone: 'plain', ariaLabel: `${label}, ${HOME_COPY.notScored.toLowerCase()}` };
  const points = typeof tile.points === 'number' && Number.isFinite(tile.points) ? tile.points : null;
  const arrow = chip.move > 0 ? `▲ ${chip.move}` : chip.move < 0 ? `▼ ${-chip.move}` : null;
  const said = [chip.move > 0 ? `up ${chip.move}` : chip.move < 0 ? `down ${-chip.move}` : null, points === null ? null : `${show(points)} ${points === 1 ? 'point' : 'points'}`];
  return { ranked: true, big: chip.label, arrow, points, tone: chip.move > 0 ? 'good' : 'plain', ariaLabel: [`${label}, ${chip.label}`, ...said].filter(Boolean).join(', ') };
}

/** Who's in (`whosIn` is shared/guess-board.mjs whosIn for the Spread ballot): "4 / 6", up to four faces, you first. */
export function whoTile({ whosIn, week }) {
  if (week === null || week === undefined) return { big: DASH, sub: 'No week open', people: [], ariaLabel: 'Who’s in, no week open' };
  if (!(whosIn?.of > 0)) return { big: DASH, sub: 'No members yet', people: [], ariaLabel: 'Who’s in, no members yet' };
  return { big: `${whosIn.in} / ${whosIn.of}`, sub: 'Spread ballots in', people: whosIn.people.slice(0, 4), ariaLabel: `Who’s in, ${whosIn.in} of ${whosIn.of} Spread ballots in` };
}

/**
 * Awards: the newest week's award count (features model `recap`), your own award named ("New:" only while its moment
 * waits, as the Badges tile does), and NEW while any award or badge moment waits for Badges and awards (`waiting` is
 * useNewMoments(SCOPES.features)). A waiting Pick streak is the card's, not this tile's.
 */
export function awardsTile({ model = null, off = false, waiting = [] } = {}) {
  const fresh = (Array.isArray(waiting) ? waiting : []).filter(m => m?.kind === 'award' || m?.kind === 'badge');
  const isNew = fresh.length > 0;
  const recap = model?.recap ?? null;
  if (!recap?.rows?.length) {
    if (off) return { big: DASH, sub: 'Coming soon', tone: 'plain', isNew, ariaLabel: 'Awards, coming soon' };
    return model ? { big: DASH, sub: 'None posted yet', tone: 'plain', isNew, ariaLabel: 'Awards, none posted yet' }
      : { big: DASH, sub: 'Badges and awards', tone: 'plain', isNew, ariaLabel: 'Awards' };
  }
  const week = HOME_COPY.weekTitle(recap.week), n = recap.rows.length;
  // An award moment's id is award:<league>:<season>:<week>:<award> (features/model.js featureMoments).
  const named = fresh.filter(m => m.kind === 'award' && String(m.id).split(':')[3] === String(recap.week)).at(-1)?.title ?? null;
  const mine = recap.mine?.name ?? null;
  const sub = named ? `${week}${SEP}New: ${named}` : mine ? `${week}${SEP}You won ${mine}` : `${week} awards`;
  const said = named ? `new: ${named}` : mine ? `you won ${mine}` : null;
  return { big: String(n), sub, tone: named || mine ? 'good' : 'plain', isNew, ariaLabel: [`Awards, ${n} in ${week}`, said].filter(Boolean).join(', ') };
}

/** My bets (bets/useTicketSummary.js): active tickets, the word agreeing with the count (design audit A22). */
export function betsTile({ loading = false, error = null, active = null } = {}) {
  if (error) return { big: DASH, sub: 'Open to retry', ariaLabel: 'My bets, could not load, open to retry' };
  if (loading || !Number.isInteger(active)) return { big: DASH, sub: 'active tickets', ariaLabel: 'My bets, loading' };
  const word = active === 1 ? 'active ticket' : 'active tickets';
  return { big: String(active), sub: word, ariaLabel: `My bets, ${active} ${word}` };
}

/** Trends: this device's saved trends (trends/builderData.js useSavedTrends), opening on them; none, charts for every game. */
export function trendsTile(saved) {
  const n = Array.isArray(saved) ? saved.length : 0;
  if (n > 0) return { big: String(n), sub: 'saved', ariaLabel: `Trends, ${n} saved`, open: { section: 'trends', trendSection: 'build', season: null, week: null } };
  return { big: '0', sub: 'Charts for every game', ariaLabel: 'Trends, none saved, charts for every game', open: { section: 'trends', season: null, week: null } };
}

/**
 * This week (H1A): up to `limit` game tiles from the viewer's own /personal week, the first games in kickoff order that
 * had not kicked off at the server's `now` (the week's last ones when fewer remain), each with the viewer's own Spread
 * state in the picks card's words. `community` only says a sit-out of the same week (lines-view optOutsFor). Reads the
 * viewer's own ballot and nothing else. Null when the week has no games.
 */
export function weekGames(personal, community = null, { limit = GAME_TILES } = {}) {
  const games = gamesOf(personal);
  if (!games.length) return null;
  const ballot = personal.ballots?.guess_spread ?? null;
  const now = Date.parse(personal.now ?? '');
  const openAt = toMs(personal.deadline) !== null ? Date.parse(weekOpenAt(personal.deadline)) : NaN;
  const receipt = personal.scoring?.guess_spread?.satOut;
  const satOut = typeof receipt === 'boolean' ? receipt : optOutsFor(personal, community).includes('guess_spread');
  const ahead = Number.isFinite(now) ? games.findIndex(game => now < Date.parse(game.kickoff)) : 0;
  const start = Math.min(ahead === -1 ? games.length : ahead, Math.max(0, games.length - limit));
  const season = personal.season ?? null, week = personal.week ?? null;
  return { season, week, count: games.length, games: games.slice(start, start + limit).map(game => {
    const state = gameState(game, { ballot, picks: ballot?.picks ?? {}, now, openAt, satOut });
    const away = teamOf(game.away), home = teamOf(game.home), when = fmtWhen(game.kickoff), word = CARD_STATE[state][0];
    return { id: game.id, away: away.code, home: home.code, matchup: `${away.code} @ ${home.code}`, when, state, word,
      ariaLabel: `${away.nick} at ${home.nick}, ${when}, Spread ${word.toLowerCase()}`,
      open: { market: 'spread', season, week, pickGame: game.id } };
  }) };
}
