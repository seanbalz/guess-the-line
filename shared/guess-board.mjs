// The Guess the Line board as plain data (redesign build plan stage 12; design system 7.10; DP-1, DP-2, D-36):
// who's in for a week, each player's season rank and the chase line. Pure and import-free: no React, storage,
// network or clock, so the server and both apps can share it. It reads the normalized /community/read reply
// (cloud/community.mjs `normalize`: members, submissions, standings) and returns only what the screens draw.
//
// Three rules the old board got wrong, each kept here so Home and the League board can never disagree:
// - Spread and Total are ranked apart. A row's Total points never move its Spread rank; there is no Spread + Total
//   sum anywhere in this file (DP-2, D-36).
// - A shared rank is shown shared ("T-2", then 4: competition ranking), never broken by a made-up order.
// - No ballot is never 0. A player without ranked points has rank null and reads "—" (DP-1); points stay null.

export const MODES = Object.freeze(['guess_spread', 'guess_total']);
export const MODE_LABEL = Object.freeze({ guess_spread: 'Spread', guess_total: 'Total' });
const DASH = '—';

const byName = (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const nameOf = member => String(member?.displayName ?? member?.name ?? member?.id ?? '');
const idOf = value => (value === null || value === undefined ? '' : String(value));

/** `{ [userId]: displayName }` from the members list, for names beside standings rows. */
function namesOf(members) {
  return Object.fromEntries((Array.isArray(members) ? members : []).map(m => [idOf(m?.id), nameOf(m)]));
}

/**
 * Who has finished the week for one mode: `{ in, of, label, people }`. A member is 'in' once a submission for that
 * mode carries `submittedAt`, 'satOut' with a sit-out (D-23; a skip or "See picks now" writes the same), else 'out'.
 * Both 'in' and 'satOut' are done with the week, so `in` counts both. Removed members are not counted or listed.
 * `people` puts the viewer first, then the players in, then the sit-outs, then everyone still out, each by name.
 */
export function whosIn({ members = [], submissions = [], viewer = null, mode } = {}) {
  const me = idOf(viewer);
  const mine = (Array.isArray(submissions) ? submissions : []).filter(s => s?.mode === mode);
  const people = (Array.isArray(members) ? members : []).filter(m => m && m.removed !== true).map(m => {
    const id = idOf(m.id);
    const own = mine.filter(s => idOf(s.userId) === id);
    const status = own.some(s => s.submittedAt) ? 'in' : own.some(s => s.satOut === true) ? 'satOut' : 'out';
    return { id, name: nameOf(m), you: me !== '' && id === me, status };
  });
  const order = { in: 0, satOut: 1, out: 2 };
  people.sort((a, b) => (Number(b.you) - Number(a.you)) || (order[a.status] - order[b.status]) || byName(a, b));
  const done = people.filter(p => p.status !== 'out').length;
  return { in: done, of: people.length, label: `${done} of ${people.length} in`, people };
}

/**
 * One mode's ranking, the single source for the rank tile, the chase line and the board: the mode's standings
 * rows that have scored points, ordered by season points descending, with competition ranks (1, 2, 2, 4). Rows
 * with no points (`seasonPoints` null: no ballot, DP-1) or nothing scored yet are left out: they are unranked, not
 * last. Tied rows keep a stable order by name so the board reads the same on every load.
 */
function ranking(standings, mode, names = {}) {
  const rows = (Array.isArray(standings) ? standings : [])
    .filter(r => r && r.mode === mode && finite(r.seasonPoints) && (Number(r.seasonScored) || 0) > 0)
    .map(r => ({ id: idOf(r.userId), name: names[idOf(r.userId)] ?? idOf(r.userId), points: r.seasonPoints, scored: Number(r.seasonScored) || 0 }));
  rows.sort((a, b) => (b.points - a.points) || byName(a, b));
  return rows.map(row => {
    const equal = rows.filter(r => r.points === row.points).length;
    return { ...row, rank: 1 + rows.filter(r => r.points > row.points).length, tied: equal > 1 };
  });
}

/** The viewer's own standings row for a mode, ranked or not, so the tile can show points beside an unranked "—". */
function ownRow(standings, viewer, mode) {
  const me = idOf(viewer);
  return (Array.isArray(standings) ? standings : []).find(r => r && r.mode === mode && idOf(r.userId) === me) ?? null;
}

/**
 * The Home rank tile for one mode: `{ rank, tied, label, points, scored, of }`. `label` is "2", "T-2" when the rank
 * is shared, or "—" when the viewer has no ranked row; `rank` is then null, never 0. `of` is how many players are
 * ranked in that mode.
 */
export function rankTile({ standings = [], viewer = null, mode } = {}) {
  const ranked = ranking(standings, mode);
  const me = idOf(viewer);
  const mine = ranked.find(r => r.id === me) ?? null;
  const own = ownRow(standings, viewer, mode);
  return {
    rank: mine ? mine.rank : null,
    tied: mine ? mine.tied : false,
    label: mine ? (mine.tied ? `T-${mine.rank}` : String(mine.rank)) : DASH,
    points: finite(own?.seasonPoints) ? own.seasonPoints : null,
    scored: Number(own?.seasonScored) || 0,
    of: ranked.length,
  };
}

/** A points gap the way the old board prints points: "2", never "2.0"; otherwise one decimal, "1.5". Gaps are never negative. */
function fmtGap(gap) {
  const rounded = Math.round(Math.abs(gap) * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * The one chase line under the rank tile: "You lead by 1.5" (or "You lead" alone on the board), "Tied for the lead",
 * or "2 behind Troy" with the leader's name from `names` ({ [userId]: displayName }; "the leader" for an unknown id).
 * Null while the viewer is unranked: there is nothing to chase from "—".
 */
export function chaseLine({ standings = [], viewer = null, mode, names = {} } = {}) {
  const ranked = ranking(standings, mode, names && typeof names === 'object' ? names : {});
  const me = idOf(viewer);
  const mine = ranked.find(r => r.id === me);
  if (!mine) return null;
  if (mine.rank === 1) {
    if (mine.tied) return 'Tied for the lead';
    const second = ranked.find(r => r.rank > 1);
    return second ? `You lead by ${fmtGap(mine.points - second.points)}` : 'You lead';
  }
  const leader = ranked[0];
  const leaderName = names && typeof names === 'object' && Object.hasOwn(names, leader.id) ? String(names[leader.id]) : 'the leader';
  return `${fmtGap(leader.points - mine.points)} behind ${leaderName}`;
}

/**
 * The League board for one mode: ranked rows only, in rank order, `[{ id, name, rank, tied, points, scored, you }]`.
 * It is the same ranking the tile uses, so the two never disagree. Names come from `members`; a row whose member
 * is unknown keeps its id as its name rather than vanishing (D-23).
 */
export function boardFor({ standings = [], members = [], viewer = null, mode } = {}) {
  const me = idOf(viewer);
  return ranking(standings, mode, namesOf(members)).map(r => ({ id: r.id, name: r.name, rank: r.rank, tied: r.tied, points: r.points, scored: r.scored, you: me !== '' && r.id === me }));
}
