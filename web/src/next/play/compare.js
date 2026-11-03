// Compare (D-69 step 1, Sean's P3B): you and one other member, game by game, each scored against their own saved line.
// Pure. The comparison reply is already gated by the database (D-31: another member's guess, line and points only once
// that game and market is open to you). This is the second gate: a game the reply does not open, or marks hidden, is
// HIDDEN and its row carries no value of either player, whatever the reply holds. Totals count only games scored for both.
import { pickText, show } from '../../communityFormat.js';
import { buildComparison, comparisonRows } from '../../../../shared/score-comparison.mjs';
import { number, ownEntry, scoreRows } from './scoring.js';

export const COMPARE_STATES = Object.freeze(['hidden', 'waiting', 'noGuess', 'unscored', 'scored']);
const MODES = Object.freeze(['guess_spread', 'guess_total']);
const DASH = '—';
/** The last face chip (D-53 "All players"): you against each game's benchmark. Never the default. */
export const EVERYONE = 'everyone';

/** "Troy Jun" → "Troy": the name the head-to-head card, its rows and its tags use. */
export const firstName = name => String(name ?? '').trim().split(/\s+/)[0] || 'Member';

/** The other members in roster order, current members first, then former ones (D-23 keeps them comparable). */
export function opponents(data) {
  const others = (data?.members || []).filter(m => m.id !== data?.viewer);
  return [...others.filter(m => !m.removed), ...others.filter(m => m.removed)];
}

/** The viewer's own gate for one game and market: per game from M-01 (`week.gate`), the whole week before it. */
export function gameOpen(week, gameId, mode) {
  const market = mode === 'guess_total' ? 'total' : 'spread';
  return week?.gate ? week.gate[gameId]?.[market] === true : week?.revealed?.[mode] === true;
}

function side(row, entry) {
  if (!row?.locked || row.guess === null) return { locked: false, satOut: entry?.status === 'sat_out', points: null };
  const line = number(row.reference?.value);
  return { locked: true, satOut: false, guess: row.guess, points: row.points, reference: row.reference,
    miss: row.points === null || line === null ? null : Math.abs(row.guess - line) };
}

/**
 * One row per game of the chosen weeks, oldest first: `{ key, season, week, game, state, me, them }`. A hidden row's
 * `me` and `them` are null. `now` (ms) tells a game that has kicked off; it defaults to the reply's own `now`.
 */
export function compareRows(data, { mode = 'guess_spread', opponent = null, from = null, to = null, team = '', matchup = '', now = Date.parse(data?.now ?? '') } = {}) {
  return (data?.weeks || []).filter(w => (from === null || w.week >= from) && (to === null || w.week <= to)).sort((a, b) => a.week - b.week).flatMap(week => {
    const myEntry = ownEntry(week, data.viewer, mode), theirEntry = opponent ? ownEntry(week, opponent, mode) : null;
    const byGame = entry => new Map(scoreRows(week, entry).map(row => [row.game.id, row]));
    const mine = byGame(myEntry), theirs = byGame(theirEntry);
    return (week.games || []).filter(g => (!team || [g.awayCode, g.homeCode].includes(team)) && (!matchup || g.id === matchup)).map(game => {
      const base = { key: `${week.season}:${week.week}:${game.id}`, season: week.season, week: week.week, game };
      const t = theirs.get(game.id);
      if (!gameOpen(week, game.id, mode) || t?.hidden || theirEntry?.hiddenGames?.includes(game.id)) return { ...base, state: 'hidden', me: null, them: null };
      const me = side(mine.get(game.id), myEntry), them = side(t, theirEntry);
      const started = Date.parse(game.kickoff) <= now;
      const state = !them.locked ? (started || them.satOut ? 'noGuess' : 'waiting') : !me.locked ? 'noGuess'
        : me.miss === null || them.miss === null ? 'unscored' : 'scored';
      return { ...base, state, me, them };
    });
  });
}

/** Only rows scored for both count: each side's points, Bullseyes and average miss, the shared count and your lead. */
export function headToHead(rows) {
  const shared = rows.filter(row => row.state === 'scored');
  const of = key => shared.length ? { points: shared.reduce((sum, row) => sum + row[key].points, 0),
    bullseyes: shared.filter(row => row[key].miss === 0).length, avgMiss: shared.reduce((sum, row) => sum + row[key].miss, 0) / shared.length } : null;
  const me = of('me'), them = of('them');
  return { shared: shared.length, me, them, lead: me && them ? me.points - them.points : null };
}

/** The member Compare opens on: the most shared games this season over both markets; ties keep roster order. */
export function defaultOpponent(data) {
  let best = null, most = -1;
  for (const member of opponents(data)) {
    const shared = MODES.reduce((sum, mode) => sum + headToHead(compareRows(data, { mode, opponent: member.id })).shared, 0);
    if (shared > most) { best = member.id; most = shared; }
  }
  return best;
}
/** The address's `item` when it names another member of this roster, otherwise the default (a stale or foreign item). */
export const chooseOpponent = (data, item) => item === EVERYONE && opponents(data).length ? EVERYONE
  : opponents(data).some(member => member.id === item) ? item : defaultOpponent(data);

/**
 * Everyone (D-53 "All players", kept as the last chip): each game scored and revealed for you and at least one other
 * member, against its benchmark, the average of every scored player there, you included (shared/score-comparison.mjs,
 * the existing tested reader and its gate). Rows have the head-to-head shape; `field` is the game's player count.
 */
export function fieldRows(data, { mode = 'guess_spread', from = null, to = null, team = '', matchup = '' } = {}) {
  const { games } = buildComparison({ rows: comparisonRows(data, mode), selection: { viewer: data.viewer, kind: 'all' }, filters: { season: data.season, from, to, team, matchup } });
  const miss = p => Math.abs(p.guess - p.reference.value);
  return [...games].sort((a, b) => a.week - b.week).map(g => ({ key: g.key, season: g.season, week: g.week, game: g.game, state: 'scored', field: g.contributors,
    me: { locked: true, satOut: false, guess: g.mine.guess, points: g.mine.points, reference: g.mine.reference, miss: miss(g.mine) },
    them: { locked: true, satOut: false, guess: null, points: g.benchmark, reference: null, miss: g.players.reduce((sum, p) => sum + miss(p), 0) / g.players.length } }));
}

export function leadLine(h, name) {
  if (!h.shared) return 'No shared games yet';
  return h.lead > 0 ? `You lead by ${show(h.lead)}` : h.lead < 0 ? `${name} leads by ${show(-h.lead)}` : 'All square';
}
export const statLine = (h, everyone = false) => `${everyone ? '' : `Bullseyes ${h.me.bullseyes}–${h.them.bullseyes} · `}Avg miss ${show(h.me.avgMiss)}–${show(h.them.avgMiss)} · ${h.shared} shared ${h.shared === 1 ? 'game' : 'games'}`;

/** The row's tag: always words (never color alone). A game you lost is quiet (neutral), never a loss color. */
export function rowTag(row, name) {
  if (row.state === 'hidden') return { text: 'HIDDEN', tone: 'neutral' };
  if (row.state === 'waiting') return { text: 'WAITING', tone: 'data' };
  if (row.state === 'noGuess') return { text: 'NO GUESS', tone: 'neutral' };
  if (row.state === 'unscored') return { text: 'NOT SCORED', tone: 'pending' };
  const diff = row.me.points - row.them.points;
  return diff > 0 ? { text: `YOU +${show(diff)}`, tone: 'win' } : diff < 0 ? { text: `${name.toUpperCase()} +${show(-diff)}`, tone: 'neutral' } : { text: 'EVEN', tone: 'neutral' };
}

/** The row's one line: both guesses, or why one is missing. A hidden row says only how to open it. */
export function rowLine(row, mode, name) {
  if (row.state === 'hidden') return `Lock yours to see ${name}’s guess`;
  const text = value => pickText(mode, row.game.awayCode, row.game.homeCode, value);
  if (row.field) return `You ${text(row.me.guess)} · ${row.field} players avg ${show(row.them.points)}`;
  const mine = row.me.locked ? `You ${text(row.me.guess)}` : row.me.satOut ? 'You sat out' : 'You didn’t lock in';
  const theirs = row.them.locked ? `${name} ${text(row.them.guess)}` : row.them.satOut ? `${name} sat out`
    : row.state === 'waiting' ? `${name} hasn’t locked in` : `${name} didn’t lock in`;
  return `${mine} · ${theirs}`;
}

/**
 * The Play landing tile (P1B): your lead over the member Compare opens on, in the latest week up to `current.week`
 * with a game scored for both (Spread before Total), and the view `openPlay(shell, 'compare', view)` opens it with.
 */
export function compareTile(data, current) {
  const view = { period: 'week', team: '', matchup: '' };
  const plain = { big: DASH, sub: 'Head-to-head', tone: 'plain', ariaLabel: 'Compare: head-to-head with another player', view };
  const opponent = data ? defaultOpponent(data) : null;
  if (!opponent) return plain;
  const name = firstName((data.members || []).find(member => member.id === opponent)?.displayName);
  const weeks = [...new Set((data.weeks || []).map(w => w.week))].filter(w => !Number.isInteger(current?.week) || w <= current.week).sort((a, b) => b - a);
  for (const week of weeks) for (const mode of MODES) {
    const { shared, lead } = headToHead(compareRows(data, { mode, opponent, from: week, to: week }));
    if (!shared) continue;
    const words = lead > 0 ? `you lead ${name} by ${show(lead)}` : lead < 0 ? `${name} leads you by ${show(-lead)}` : `you and ${name} are even`;
    return { big: lead > 0 ? `+${show(lead)}` : lead < 0 ? `−${show(-lead)}` : '0', sub: `vs ${name}`, tone: lead > 0 ? 'good' : 'plain',
      ariaLabel: `Compare: Week ${week} ${mode === 'guess_total' ? 'Total' : 'Spread'}, ${words}`,
      view: { ...view, item: opponent, season: data.season, week, market: mode === 'guess_total' ? 'total' : 'spread' } };
  }
  return { ...plain, sub: `vs ${name}`, ariaLabel: `Compare: no shared games with ${name} yet`, view: { ...view, item: opponent, season: data.season } };
}
