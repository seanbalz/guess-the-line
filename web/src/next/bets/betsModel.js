// Bets' landing (D-69 step 4, spec 5A, built for Sean's review) as plain data: the first card (place your picks while any
// game of the published week is still to kick off; otherwise track a bet) and five tiles (My bets, Your picks, Everyone,
// Recommended, Your gap). Pure. It reads only what the app already reads: the shared /personal reply (the week's games,
// your own ballots and the server's clock, as Home's This week and Research's landing read it), the Community read (its
// members and your sit-outs), the ticket summary (your own tracked tickets: Home's My bets tile) and, as main's approved
// landing did, the account's research assessments for the Recommended tile. No line, price, pick or other player's bet
// reaches it (D-31, D-36).
//
// Main's confirmed Prism landing (#495: "Your tracked bets", "Tickets" and "Recommended" cards) folds into these tiles:
// My bets carries its net units and its Open and Settled counts; Recommended its one permitted assessed matchup.
import { gamesOf, optOutsFor, weekOf } from '../../../../shared/lines-view.mjs';
import { guessLockedIn } from '../../../../shared/trends-view.mjs';
import { DESTINATION_ICONS } from '../ui/destinations.js';
import { DASH, SEP, fmtAmt, plural, toMs } from '../format.js';
import { gameName } from '../research/researchNav.js';
import { BETS_NAMES, BETS_SECTIONS, SECTION_VIEW } from './betsNav.js';

export const BETS_TILE_ICONS = Object.freeze({ mybets: DESTINATION_ICONS.activeTickets, picks: DESTINATION_ICONS.virtualUnits,
  everyone: DESTINATION_ICONS.everyone, recommended: DESTINATION_ICONS.researchPicks, gap: DESTINATION_ICONS.guessGap });
export const BETS_COPY = Object.freeze({ loading: 'Loading this week’s games…', failed: 'This week didn’t load.', tryAgain: 'Try again', recent: 5 });
const MODES = Object.freeze({ spread: 'guess_spread', total: 'guess_total' });
const SETTLED = new Set(['win', 'loss', 'push', 'void']);
const kickedOff = (game, now) => Number.isFinite(now) && now >= toMs(game.kickoff);

/** The server's clock in the /personal read (ms), or null; never the device's. */
export function betsClock(personal) {
  const now = typeof personal?.now === 'string' ? Date.parse(personal.now) : NaN;
  return Number.isFinite(now) ? now : null;
}
/** Where the landing's clock stops: the week's last kickoff, or 0 (at once) with no game to wait for. */
export const clockUntil = personal => { const games = gamesOf(personal); return games.length ? toMs(games.at(-1).kickoff) : 0; };

/** Your last settled tracked tickets (newest first, at most five) and how many of them won. */
export function recentResults(tickets, viewer) {
  const entries = Array.isArray(tickets?.data?.entries) ? tickets.data.entries : [];
  const settled = entries.filter(e => e?.ownerId === viewer && SETTLED.has(e.outcome))
    .sort((a, b) => (toMs(b.settledAt ?? b.updatedAt) ?? 0) - (toMs(a.settledAt ?? a.updatedAt) ?? 0)).slice(0, BETS_COPY.recent);
  return { shown: settled.length, won: settled.filter(e => e.outcome === 'win').length };
}

/** Your week from your own read: games still to kick off, those whose prices are open to you, and your locked guesses. */
export function ownWeek(personal, community, now) {
  const games = gamesOf(personal), sat = optOutsFor(personal, community);
  const locked = (id, market) => guessLockedIn(personal?.ballots?.[MODES[market]], id);
  const priced = id => ['spread', 'total'].some(market => locked(id, market) || sat.includes(MODES[market]));
  const open = games.filter(g => !kickedOff(g, now));
  return { open: open.length, ready: open.filter(g => priced(g.id)).length,
    locked: games.reduce((sum, g) => sum + ['spread', 'total'].filter(market => locked(g.id, market)).length, 0) };
}

/** The first card. `target` is the Bets view its one lime button opens. */
export function betsHero({ personal = null, tickets = null, viewer = null, now = null } = {}) {
  const week = weekOf(personal)?.week ?? null, n = gamesOf(personal).length, open = ownWeek(personal, null, now).open;
  if (week !== null && open > 0) return { kind: 'place', week, eyebrow: `Week ${week}${SEP}Your next move`, title: 'Place your picks',
    meter: { done: open, of: n }, line: `${open} of ${plural(n, 'game', 'games')} still open`, action: 'Place picks', target: 'virtual' };
  const recent = recentResults(tickets, viewer);
  const line = tickets?.loading ? 'Loading your tickets…' : tickets?.error ? 'Your tickets didn’t load' : !recent.shown ? 'No settled tickets yet'
    : `${recent.won} of your last ${plural(recent.shown, 'settled ticket', 'settled tickets')} won`;
  return { kind: 'track', week, eyebrow: 'Your next move', title: 'Track a bet', meter: tickets?.loading || tickets?.error ? null : { done: recent.won, of: recent.shown || BETS_COPY.recent },
    line, action: 'Add a bet', target: 'add' };
}

/**
 * My bets (main's "Your tracked bets" and "Tickets" cards): net units over all weeks, then the Open and Settled counts, from
 * the owner-only projection of your included tracked tickets (useTicketSummary's `model`, trackedOverview). Net units need
 * a settled ticket with a complete return: none is "—", never a made-up 0U. Loading and failed stay apart from empty.
 */
export function myBetsTile(tickets) {
  if (tickets?.error) return { big: DASH, sub: 'Open to retry', ariaLabel: 'My bets, could not load, open to retry' };
  const model = tickets?.model, summary = model?.summary;
  if (tickets?.loading || !summary) return { big: DASH, sub: 'Loading tickets…', ariaLabel: 'My bets, loading' };
  const open = summary.pending, settled = summary.bets - summary.pending, net = summary.roiSampleCount ? fmtAmt(summary.netUnits) : DASH;
  const tracked = Array.isArray(model.entries) ? model.entries.length : summary.bets;
  return { big: net, sub: `${open} open${SEP}${settled} settled`,
    ariaLabel: `My bets, ${net === DASH ? 'no net units yet' : `${net} net`}, ${open} open, ${settled} settled, ${plural(tracked, 'tracked ticket', 'tracked tickets')}` };
}

const ASSESSED_GAME = /^[A-Z]{2,4}-[A-Z]{2,4}$/;
/**
 * The assessments the Recommended tile may name (main's teaser rule): an open game whose market is open to you (a spread
 * or total assessment its own market; any other, both), from the account-scoped research reply, in its order.
 */
export function openAssessments(data) {
  const games = Array.isArray(data?.coverage?.games) ? data.coverage.games : [];
  return (Array.isArray(data?.assessments) ? data.assessments : []).filter(a => {
    const g = games.find(game => game.id === a.gameId);
    return g && !g.closed && (a.selection?.market === 'spread' ? g.spreadAccessible : a.selection?.market === 'total' ? g.totalAccessible : g.spreadAccessible && g.totalAccessible)
      && ASSESSED_GAME.test(a.gameId);
  });
}
/** The one assessment main's landing teased: the first open to you, or null. */
export const teaserAssessment = data => openAssessments(data)[0] ?? null;

/**
 * Recommended (main's "Recommended" card): how many assessments are open to you and the first one's matchup (its marks are
 * the tile's picture) and label. Like every tile it opens its section (Recommended's list, where that matchup is a row);
 * main's Explore went straight to the one assessment (a decision for Sean). Loading and a failed read never draw a sample
 * matchup; locked and closed weeks say so.
 */
export function recommendedTile(read) {
  if (!read || read.status === 'loading') return { big: DASH, sub: 'Research assessments', ariaLabel: 'Recommended, loading research assessments', marks: null };
  if (read.status === 'error') return { big: DASH, sub: 'Not loaded', ariaLabel: 'Recommended, research assessments not loaded', marks: null };
  const list = openAssessments(read.data), first = list[0] ?? null, games = Array.isArray(read.data?.coverage?.games) ? read.data.coverage.games : [];
  if (first) {
    const [away, home] = first.gameId.split('-');
    return { big: String(list.length), sub: first.label, marks: [away, home],
      ariaLabel: `Recommended, ${plural(list.length, 'assessment', 'assessments')} open to you, first ${gameName(away, home)}, ${first.label}` };
  }
  const locked = games.length > 0 && games.every(g => !g.spreadAccessible && !g.totalAccessible);
  const closed = games.length > 0 && games.every(g => g.closed);
  return locked ? { big: '0', sub: 'Lock in to see research', ariaLabel: 'Recommended, lock in a guess to see its research', marks: null }
    : closed ? { big: '0', sub: 'Assessments closed', ariaLabel: 'Recommended, pregame assessments closed', marks: null }
    : { big: '0', sub: 'None assessed yet', ariaLabel: 'Recommended, no assessed matchup yet', marks: null };
}

/**
 * The five tiles, in BETS_SECTIONS order. `waitingWins`: tracked wins waiting (NEW) for their own ticket's card; the My bets
 * tile then opens Settled tickets, where that card is drawn, so opening it plays the moment. `failed`: /personal did not load.
 * `research`: the assessments read (useAssessments) for the Recommended tile.
 */
export function betsTiles({ personal = null, community = null, tickets = null, research = null, now = null, viewer = null, communityShowing = true, waitingWins = 0, failed = false } = {}) {
  const week = weekOf(personal)?.week ?? null, own = ownWeek(personal, community, now);
  const mine = myBetsTile(tickets);
  const notLoaded = name => ({ big: DASH, sub: 'Not loaded', ariaLabel: `${name}, not loaded` });
  const picks = failed ? notLoaded('Your picks') : week === null ? { big: DASH, sub: 'No week open', ariaLabel: 'Your picks, no week open' }
    : !own.open ? { big: '0', sub: `Week ${week} closed`, ariaLabel: `Your picks, week ${week} closed` }
    : !own.ready ? { big: '0', sub: 'Lock in to see prices', ariaLabel: 'Your picks, lock in a guess to see prices' }
    : { big: String(own.ready), sub: own.ready === 1 ? 'game open to bet' : 'games open to bet', ariaLabel: `Your picks, ${plural(own.ready, 'game', 'games')} open to bet` };
  const members = communityShowing && Array.isArray(community?.members) ? community.members.filter(m => typeof m?.id === 'string' && !m.removed) : [];
  const faces = members.map(m => ({ id: m.id, name: m.displayName, you: m.id === viewer })).sort((a, b) => Number(b.you) - Number(a.you));
  const everyone = members.length ? { big: String(members.length), sub: members.length === 1 ? 'player' : 'players', ariaLabel: `Everyone, ${plural(members.length, 'player', 'players')}, friends’ Virtual Units picks`, faces }
    : { big: DASH, sub: 'Friends’ picks', ariaLabel: 'Everyone, friends’ Virtual Units picks', faces: null };
  const gap = failed ? notLoaded('Your gap') : week === null ? { big: DASH, sub: 'No week open', ariaLabel: 'Your gap, no week open' }
    : { big: String(own.locked), sub: own.locked === 1 ? 'locked guess' : 'locked guesses', ariaLabel: `Your gap, ${plural(own.locked, 'locked guess', 'locked guesses')} against the lines` };
  const tiles = { mybets: { ...mine, isNew: waitingWins > 0, ...(waitingWins > 0 ? { view: 'settled' } : { view: 'tracked', period: 'all' }) }, picks, everyone, gap,
    recommended: recommendedTile(research) };
  return BETS_SECTIONS.map(key => ({ key, label: BETS_NAMES[key], icon: BETS_TILE_ICONS[key], faces: null, marks: null, isNew: false, view: SECTION_VIEW[key], ...tiles[key] }));
}
