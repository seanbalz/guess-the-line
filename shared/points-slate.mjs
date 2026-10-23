// Guess the Points slate builder (D-56; docs/superpowers/specs/2026-10-22-guess-the-points-design.md section 3.2).
// Pure and deterministic: the same season, week, selection-rule version and inputs always give the same slate, and
// no valid slate fails closed (the week stays unopened). Track 1's weekly refresh supplies the inputs; this module
// reads nothing itself. gtl_points_kickoff_window in the P-01 migration uses the same kickoff windows.

export const SELECTION_VERSION = 'points-slate-v1';
export const SLOT_ORDER = Object.freeze(['QB', 'RB', 'WR', 'TE', 'FLEX']);
/** Pools [assumed]: top N by GTL weekly estimate per position (spec 3.2). */
export const POOLS = Object.freeze({ QB: 12, RB: 24, WR: 24, TE: 12 });
/** FLEX draws from RB and WR ranks 1–36 and TE ranks 1–12 not already chosen. */
export const FLEX_POOLS = Object.freeze({ RB: 36, WR: 36, TE: 12 });

const LA_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * The kickoff window of a game (spec default 4, Pacific time): thursday-night (Thursday from 5:00 PM), sunday-early
 * (9:00–11:59 AM), sunday-late (12:00–4:59 PM), sunday-night (from 5:00 PM), monday-night (any Monday kickoff), and
 * every other kickoff its own window ("other:<local date and time>"): Saturday, holiday and Friday games, Thursday
 * daytime holiday games and international Sunday mornings before 9:00 AM.
 */
export function kickoffWindow(kickoff) {
  const time = Date.parse(kickoff);
  if (!Number.isFinite(time)) throw new TypeError(`Invalid kickoff ${kickoff}.`);
  const p = Object.fromEntries(LA_PARTS.formatToParts(new Date(time)).map(x => [x.type, x.value]));
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  if (p.weekday === 'Thu' && minutes >= 17 * 60) return 'thursday-night';
  if (p.weekday === 'Sun' && minutes >= 9 * 60 && minutes < 12 * 60) return 'sunday-early';
  if (p.weekday === 'Sun' && minutes >= 12 * 60 && minutes < 17 * 60) return 'sunday-late';
  if (p.weekday === 'Sun' && minutes >= 17 * 60) return 'sunday-night';
  if (p.weekday === 'Mon') return 'monday-night';
  return `other:${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Eligible (spec 3.2): on an active weekly roster, not listed Out or Doubtful, not on IR or another reserve list, with
 * a finite GTL weekly estimate, a scheduled game and a valid kickoff. Kickers and other positions are never eligible.
 */
export function isEligible(player) {
  return !!player && ['QB', 'RB', 'WR', 'TE'].includes(player.position)
    && typeof player.id === 'string' && player.id !== '' && typeof player.gameKey === 'string' && player.gameKey !== ''
    && player.rosterStatus === 'ACT' && !player.reserve
    && !['Out', 'Doubtful'].includes(player.reportStatus)
    && typeof player.estimate === 'number' && Number.isFinite(player.estimate)
    && Number.isFinite(Date.parse(player.kickoff));
}

/** FNV-1a 32-bit hash of the seed text. */
function hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** mulberry32: a small, reproducible PRNG (never used for anything but the draw order). */
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed text: season, week and selection-rule version (spec 3.2). */
export const slateSeed = (season, week, version = SELECTION_VERSION) => `${season}-${String(week).padStart(2, '0')}-${version}`;

function shuffled(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/** Players of one position ranked by estimate (ties by ID, so the order never depends on input order). */
function ranked(players, position) {
  return players.filter(p => p.position === position).sort((a, b) => b.estimate - a.estimate || a.id.localeCompare(b.id));
}

/** The draw pools: QB/RB/WR/TE top-N, and FLEX candidates (RB/WR 1–36, TE 1–12). */
export function slatePools(players) {
  const eligible = players.filter(isEligible);
  const pools = Object.fromEntries(Object.entries(POOLS).map(([position, n]) => [position, ranked(eligible, position).slice(0, n)]));
  pools.FLEX = Object.entries(FLEX_POOLS).flatMap(([position, n]) => ranked(eligible, position).slice(0, n));
  return pools;
}

/**
 * Builds the week's slate. Input: { season, week, players: [{ id, name, team, position, estimate, rosterStatus,
 * reportStatus, reserve, gameKey, kickoff }], selectionVersion }. Each pool is shuffled once by the seeded PRNG, then
 * slots are filled in QB, RB, WR, TE, FLEX order by a depth-first search over those orders, so the first slate that
 * meets every constraint (one slot per game, one player once, at least two kickoff windows) is chosen.
 * Returns { ok: true, slate } or { ok: false, reason } (fail closed).
 */
export function buildPointsSlate({ season, week, players, selectionVersion = SELECTION_VERSION }) {
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) return { ok: false, reason: 'invalid_week' };
  if (!Array.isArray(players)) return { ok: false, reason: 'invalid_players' };
  const ids = players.map(p => p?.id);
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'duplicate_player' };
  const seed = slateSeed(season, week, selectionVersion);
  const random = prng(hash(seed));
  const base = slatePools(players);
  const pools = Object.fromEntries(SLOT_ORDER.map(slot => [slot, shuffled(base[slot], random)]));
  if (SLOT_ORDER.some(slot => pools[slot].length === 0)) return { ok: false, reason: 'empty_pool', seed };
  // A fast fail-closed check: every candidate's game in one kickoff window can never meet the two-window rule.
  const windows = new Set(SLOT_ORDER.flatMap(slot => pools[slot].map(p => kickoffWindow(p.kickoff))));
  if (windows.size < 2) return { ok: false, reason: 'one_kickoff_window', seed };
  if (new Set(SLOT_ORDER.flatMap(slot => pools[slot].map(p => p.gameKey))).size < SLOT_ORDER.length) return { ok: false, reason: 'too_few_games', seed };
  const chosen = [];
  const search = depth => {
    if (depth === SLOT_ORDER.length) return new Set(chosen.map(p => kickoffWindow(p.kickoff))).size >= 2;
    for (const player of pools[SLOT_ORDER[depth]]) {
      if (chosen.some(p => p.id === player.id || p.gameKey === player.gameKey)) continue;
      chosen.push(player);
      if (search(depth + 1)) return true;
      chosen.pop();
    }
    return false;
  };
  if (!search(0)) return { ok: false, reason: 'no_valid_slate', seed };
  const slots = chosen.map((p, i) => ({ slot: SLOT_ORDER[i], playerId: p.id, name: p.name, team: p.team, position: p.position, gameKey: p.gameKey, kickoff: new Date(Date.parse(p.kickoff)).toISOString() }));
  return {
    ok: true,
    slate: {
      season, week, selectionVersion, seed,
      // Cards are shown in kickoff order; the stored slots keep slot order.
      slots,
      house: Object.fromEntries(chosen.map((p, i) => [SLOT_ORDER[i], Math.round(p.estimate * 10) / 10])),
    },
  };
}

/** An absolute ISO 8601 instant with an explicit offset (the same pattern gtl_points_slate_problem enforces). */
const KICKOFF_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * Checks a slate against the same constraints (a commissioner swap or a manual slate, spec 3.2 and 7). Returns null
 * when valid, or the first problem: 'slots', 'position', 'player', 'kickoff', 'duplicate_player', 'same_game' or
 * 'one_kickoff_window' (the codes gtl_points_slate_problem returns).
 */
export function slateProblem(slots) {
  if (!Array.isArray(slots) || slots.length !== SLOT_ORDER.length || slots.some((s, i) => s?.slot !== SLOT_ORDER[i])) return 'slots';
  for (const s of slots) {
    const allowed = s.slot === 'FLEX' ? ['RB', 'WR', 'TE'] : [s.slot];
    if (!allowed.includes(s.position)) return 'position';
    if (!s.playerId || !s.name || !s.team || !s.gameKey) return 'player';
    if (typeof s.kickoff !== 'string' || !KICKOFF_PATTERN.test(s.kickoff) || !Number.isFinite(Date.parse(s.kickoff))) return 'kickoff';
  }
  if (new Set(slots.map(s => s.playerId)).size !== slots.length) return 'duplicate_player';
  if (new Set(slots.map(s => s.gameKey)).size !== slots.length) return 'same_game';
  if (new Set(slots.map(s => kickoffWindow(s.kickoff))).size < 2) return 'one_kickoff_window';
  return null;
}
