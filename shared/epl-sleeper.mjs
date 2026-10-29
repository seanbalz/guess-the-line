// Sleeper snapshot math for the Premier League fantasy league. Sleeper's public API returns no weekly matchups for
// this soccer league, so a matchweek's score is the difference between two saved season-total snapshots and
// head-to-head pairs are inferred (one manager's points-against change equals exactly one other manager's
// points-for change). Pure: no I/O, no imports.

// Keyed on Sleeper's immutable owner_id (user_id). display_name is mutable and user-controlled, so it is
// presentation only. Null prototype so untrusted keys such as "constructor" never resolve through Object.prototype.
export const MANAGER_NAMES = Object.freeze(Object.assign(Object.create(null), {
  '719658248843632640': 'Evan',
  '473955676301815808': 'Sean',
  '702644837370929152': 'Steven',
  '1259267898757611520': 'Cullen',
  '1395236217460633600': 'Darin',
  '1257180071064510465': 'Mark',
  '865667912365666304': 'Nemo',
  '719745569895018496': 'Adam',
}));

const round2 = x => Math.round(x * 100) / 100;

export function seasonPoints(settings = {}) {
  return round2((settings.fpts ?? 0) + (settings.fpts_decimal ?? 0) / 100);
}

export function seasonAgainst(settings = {}) {
  return round2((settings.fpts_against ?? 0) + (settings.fpts_against_decimal ?? 0) / 100);
}

export function managersFromSnapshot(snapshot) {
  const sleeperNames = new Map((snapshot?.users ?? []).map(u => [u.user_id, u.display_name]));
  return (snapshot?.rosters ?? []).map(r => {
    const sleeperName = sleeperNames.get(r.owner_id) ?? null;
    return {
      ownerId: r.owner_id,
      rosterId: r.roster_id,
      sleeperName,
      name: Object.hasOwn(MANAGER_NAMES, String(r.owner_id)) ? MANAGER_NAMES[String(r.owner_id)] : sleeperName,
      seasonTotal: seasonPoints(r.settings),
      seasonAgainst: seasonAgainst(r.settings),
      wins: r.settings?.wins ?? 0,
      losses: r.settings?.losses ?? 0,
    };
  });
}

// Only owners present in both snapshots get a weekly score.
export function weeklyScores(prev, next) {
  const before = new Map(managersFromSnapshot(prev).map(m => [m.ownerId, m]));
  const out = {};
  for (const m of managersFromSnapshot(next)) {
    const p = before.get(m.ownerId);
    if (!p) continue;
    out[m.ownerId] = { for: round2(m.seasonTotal - p.seasonTotal), against: round2(m.seasonAgainst - p.seasonAgainst) };
  }
  return out;
}

// A pairs with B when A.against === B.for and B.against === A.for. An owner is paired only when it has exactly one
// candidate and that candidate has exactly it; everything else is unpaired so nothing is guessed.
export function pairMatchups(weekly) {
  const ids = Object.keys(weekly);
  const candidates = id => ids.filter(o => o !== id && weekly[id].against === weekly[o].for && weekly[o].against === weekly[id].for);
  const cand = new Map(ids.map(id => [id, candidates(id)]));
  const pairs = [];
  const paired = new Set();
  for (const id of ids) {
    const [other] = cand.get(id);
    if (cand.get(id).length !== 1 || cand.get(other).length !== 1 || cand.get(other)[0] !== id) continue;
    if (paired.has(id)) continue;
    paired.add(id).add(other);
    pairs.push(id < other ? [id, other] : [other, id]);
  }
  pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return { pairs, unpaired: ids.filter(id => !paired.has(id)).sort() };
}

// --- Stored snapshot shape (plan 2026-10-28-epl-fantasy.md, Task 2) ---------------------------------------------------
// A stored snapshot keeps only what settle and the fantasy view read: state, the league's scoring settings, users
// (id, display name), rosters (id, owner, starters, players, settings), the stats and projections of rostered players
// (stats only), and `players`, a directory of those players built from the `player` objects Sleeper embeds in its stats
// and projections rows. The directory keeps Sleeper's key names `position` and `fantasy_positions`, which
// shared/epl-fantasy.mjs positionOf reads.

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
export const SLEEPER_STATS_KEY = /^(?:stats|projections)_mw(\d{1,2})$/;

/** Every rostered player id (players and starters of every roster), as strings. */
export function rosteredIds(snapshot) {
  return new Set((Array.isArray(snapshot?.rosters) ? snapshot.rosters : []).filter(record)
    .flatMap(r => [...(Array.isArray(r.players) ? r.players : []), ...(Array.isArray(r.starters) ? r.starters : [])]).map(String));
}

/** A stats or projections source (Sleeper's array, or an id-keyed object) as `{playerId: stats}`. Null prototype. */
export function statsById(value) {
  const out = Object.create(null);
  if (Array.isArray(value)) {
    for (const e of value) if (record(e) && e.player_id !== undefined && record(e.stats)) out[String(e.player_id)] = e.stats;
  } else if (record(value)) {
    for (const [id, v] of Object.entries(value)) if (record(v)) out[id] = record(v.stats) ? v.stats : v;
  }
  return out;
}

const text = v => (typeof v === 'string' && v.length <= 120 ? v : null);
function directoryEntry(player) {
  const full = text(player.metadata?.full_name) ?? ([text(player.first_name), text(player.last_name)].filter(Boolean).join(' ') || null);
  return {
    name: full,
    position: text(player.position),
    fantasy_positions: Array.isArray(player.fantasy_positions) ? player.fantasy_positions.filter(p => typeof p === 'string').slice(0, 4) : [],
    team: text(player.team),
    team_abbr: text(player.team_abbr),
    injury_status: text(player.injury_status),
  };
}

/**
 * The rostered players' directory from a raw snapshot's stats and projections rows, or the stored `players` when the
 * snapshot is already trimmed. Later sources win, so the projections row (newer) names a player's current club.
 */
export function playersFromSnapshot(snapshot) {
  const rostered = rosteredIds(snapshot);
  const out = Object.create(null);
  if (record(snapshot?.players)) for (const [id, p] of Object.entries(snapshot.players)) if (rostered.has(id) && record(p)) out[id] = p;
  for (const [key, value] of Object.entries(record(snapshot) ? snapshot : {})) {
    if (!SLEEPER_STATS_KEY.test(key) || !Array.isArray(value)) continue;
    for (const e of value) if (record(e) && rostered.has(String(e.player_id)) && record(e.player)) out[String(e.player_id)] = directoryEntry(e.player);
  }
  return out;
}

/** The stored form of a Sleeper snapshot (see above). `keep` names the top-level provenance keys copied as they are. */
export function trimSleeperSnapshot(snapshot, keep = ['capturedAt', 'label', 'purpose', 'source', 'leagueId', 'sources']) {
  const out = { ...pick(snapshot, keep), trimmed: true };
  if (Object.hasOwn(snapshot, 'state')) out.state = snapshot.state;
  if (record(snapshot.league)) out.league = pick(snapshot.league, ['scoring_settings']);
  if (Array.isArray(snapshot.users)) out.users = snapshot.users.filter(record).map(u => pick(u, ['user_id', 'display_name']));
  if (Array.isArray(snapshot.rosters)) out.rosters = snapshot.rosters.filter(record).map(r => pick(r, ['roster_id', 'owner_id', 'starters', 'players', 'settings']));
  const rostered = rosteredIds(out);
  for (const [key, value] of Object.entries(snapshot)) {
    if (!SLEEPER_STATS_KEY.test(key)) continue;
    if (Array.isArray(value)) out[key] = value.filter(e => record(e) && rostered.has(String(e.player_id))).map(e => ({ player_id: e.player_id, stats: e.stats ?? null }));
    else if (record(value)) out[key] = Object.fromEntries(Object.entries(value).filter(([id]) => rostered.has(id)).map(([id, v]) => [id, record(v) && record(v.stats) ? { stats: v.stats } : v]));
  }
  const players = playersFromSnapshot(snapshot);
  if (Object.keys(players).length) out.players = { ...players };
  return out;
}
