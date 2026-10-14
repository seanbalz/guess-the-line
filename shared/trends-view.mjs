// Browser-side helpers for the situational trends panel: reveal gating, the app-to-nflverse
// spread sign, band matching from the viewer's own saved line, referee precedence, labels and
// formatting. Pure ESM with no imports and no clock, so the React components and the node tests
// share it and the eager bundle never pulls in the engine (shared/trends.mjs) or the history.
// The week file never carries a current-week line; the only line used here is the viewer's own
// saved line for a game and market already open to the viewer (locked in, sat out, or opened by the clock).

export const TRENDS_TOGGLE_KEY = 'gtl.trends.show';
// The same strings as shared/trends.mjs TRENDS_SOURCE and LINE_SOURCE (a test keeps them equal).
export const TRENDS_CREDIT = 'Data: nflverse; schedules maintained by Lee Sharpe (CC BY 4.0), modified';
export const TRENDS_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
export const TRENDS_SOURCE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv';
export const TRENDS_LINE_SOURCE = 'nflverse schedule file: last recorded line (book not documented)';
export const W110 = 0.9091;
const MINUS = '−';
const finite = value => typeof value === 'number' && Number.isFinite(value);

export const weekKey = (season, week) => `${season}-${String(week).padStart(2, '0')}`;
/** App spreads are home-perspective with the favorite negative (DEN −3.5); nflverse is positive when home is favored. */
export const appSpreadToNflverse = value => (finite(value) ? (value === 0 ? 0 : -value) : null);

// ---------------------------------------------------------------------------
// Reveal gating, per game and market (D-39 per-game lock-in, D-31 kickoff, D-23
// sit-out; the gate M-01's gtl_guess_revealed applies in SQL). A line-dependent
// trend for one game unlocks for a market when the viewer's own guess for that
// game and market is locked in, when the viewer sat out that market for the week
// (from M-03 a skip or "See picks now" writes the same sit-out), or when the clock
// opens the game: its own kickoff once the live rules say `revealAt: 'kickoff'`
// (M-01), else, under today's rules, also the week's deadline (D-23). A Total
// lock-in never unlocks a spread-gated trend, and "both" needs both markets.
// ---------------------------------------------------------------------------
const MARKET_MODES = Object.freeze({ spread: 'guess_spread', total: 'guess_total' });
const instant = value => {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};
/**
 * When the clock opens a game, from the server's live rules (cloud/live-rules.mjs `rules`): 'kickoff' once M-01 says so
 * (a kickoff late window always reveals at kickoff, M-07 being applied after M-01); anything else reads as today's
 * 'deadline', as cloud/live-rules.mjs and web/src/next/rules.js read a missing or malformed answer.
 */
export const revealTime = rules => (rules?.revealAt === 'kickoff' || rules?.lateWindow === 'kickoff' ? 'kickoff' : 'deadline');
/**
 * A game's pick is locked in: a number in a submitted ballot, or one the ballot's `lockedAt` names (`{ submittedAt, picks,
 * lockedAt }`; M-02 records each per-game lock-in there). The same reading as gtl_guess_locked_in (gtl_ballot_locked_in),
 * the engine's ballotLockedIn and web/src/sentFinal.js lockedIn.
 */
export const guessLockedIn = (ballot, gameId) => finite(ballot?.picks?.[gameId])
  && (Boolean(ballot?.submittedAt) || typeof ballot?.lockedAt?.[gameId] === 'string');

/**
 * One game's gate for the viewer: `{ spread, total, revealAt }`. Pure and clock-free (the caller passes `now`, the
 * server's time). `lockedIn` and `satOut` are `{ spread, total }` booleans for this viewer and this game's week; a
 * missing or unreadable kickoff or `now` never opens anything by the clock. Stage 13 (the new app's Lines) reuses it.
 */
export function gameAccess({ kickoff = null, deadline = null, now = null, rules = null, lockedIn = {}, satOut = {} } = {}) {
  const at = instant(now), ko = instant(kickoff), dl = instant(deadline), revealAt = revealTime(rules);
  const clock = at !== null && ((ko !== null && at >= ko) || (revealAt === 'deadline' && dl !== null && at >= dl));
  const open = market => clock || lockedIn?.[market] === true || satOut?.[market] === true;
  return { spread: open('spread'), total: open('total'), revealAt };
}

/**
 * Community Picks (the /personal view: `games`, `deadline`, `now`, `rules`, `ballots`): one game's gate. `optOuts` is the
 * viewer's sat-out modes for the week (/community/read).
 */
export function communityAccess(data = {}, gameId, optOuts = []) {
  const game = Array.isArray(data?.games) ? data.games.find(g => g?.id === gameId) : null;
  const sat = Array.isArray(optOuts) ? optOuts : [];
  const by = fn => Object.fromEntries(Object.entries(MARKET_MODES).map(([market, mode]) => [market, fn(mode)]));
  return gameAccess({ kickoff: game?.kickoff, deadline: data?.deadline, now: data?.now, rules: data?.rules,
    lockedIn: by(mode => guessLockedIn(data?.ballots?.[mode], gameId)), satOut: by(mode => sat.includes(mode)) });
}

/**
 * The group ballot and dashboard (the /state view: `games`, `league.deadline`, `now`, `rules`, `statuses`, `marketAccess`,
 * `mode`, `revealed`, `submittedAt`, `lockedAt`): one game's gate. The view holds no other-market picks, so a market counts
 * as locked in for a game of the slate once that market's weekly ballot is submitted (a submission locks in every game in
 * it; `marketAccess` and this mode's `revealed` say the same). For the view's own mode a game also counts once its pick
 * (`games[].prediction`) is locked in on its own: M-02 records that in the view's `lockedAt` (guessLockedIn above).
 */
export function groupAccess(data = {}, gameId) {
  const game = Array.isArray(data?.games) ? data.games.find(g => g?.id === gameId) : null;
  const by = fn => Object.fromEntries(Object.entries(MARKET_MODES).map(([market, mode]) => [market, fn(market, mode)]));
  const own = { submittedAt: data?.submittedAt, lockedAt: data?.lockedAt, picks: { [gameId]: game?.prediction } };
  return gameAccess({ kickoff: game?.kickoff, deadline: data?.league?.deadline, now: data?.now, rules: data?.rules,
    lockedIn: by((market, mode) => !!game && (data?.marketAccess?.[market] === true || Boolean(data?.statuses?.[mode]?.submittedAt)
      || (data?.mode === mode && (data?.revealed === true || guessLockedIn(own, gameId))))),
    satOut: by((market, mode) => data?.statuses?.[mode]?.satOut === true) });
}
export const gateOpen = (access, gate) => (gate === 'both' ? !!(access?.spread && access?.total) : !!access?.[gate]);

/** The viewer's own saved lines (app convention in, nflverse convention out). Unknown stays null. */
export const savedLines = ({ spread = null, total = null } = {}) => ({ spread: appSpreadToNflverse(spread), total: finite(total) ? total : null });
/** A saved scoring reference's value when it is available, else null. */
export const referenceValue = reference => (reference && reference.status === 'available' && finite(reference.value) ? reference.value : null);

// ---------------------------------------------------------------------------
// Line atoms: the same definitions as buildFeatures in shared/trends.mjs.
// ---------------------------------------------------------------------------
const SPREAD_ATOMS = ['g_home_fav', 'g_road_fav', 'g_home_fav_1_3', 'g_home_fav_35_65', 'g_home_fav_7p', 'g_road_fav_1_3', 'g_road_fav_35_65',
  'g_road_fav_7p', 'g_pickem', 'g_s_15_25', 'g_s_3', 'g_s_35_65', 'g_s_7', 'g_s_75_95', 'g_s_10_135', 'g_s_14p', 'g_s_10p', 'g_s_key',
  'g_s_hook_above', 'g_s_hook_below'];
const TOTAL_ATOMS = ['g_t_le37', 'g_t_375_405', 'g_t_41_435', 'g_t_44_465', 'g_t_47_505', 'g_t_51p', 'g_t_49p', 'g_t_54p', 'g_t_key37', 'g_t_key41',
  'g_t_key43', 'g_t_key44', 'g_t_key47', 'g_t_key51', 'g_t_hook'];
const BOTH_ATOMS = ['g_dog_tt_le17', 'g_fav_tt_ge28', 'g_fav_tt_ge27'];
const H2H_ATOMS = ['g_h2h_last_high', 'g_h2h_last_low'];
export const LINE_ATOMS = new Set([...SPREAD_ATOMS, ...TOTAL_ATOMS, ...BOTH_ATOMS, ...H2H_ATOMS]);
export const BAND_LABELS = Object.freeze({
  g_t_le37: 'Total 37 or lower', g_t_375_405: 'Total 37.5 to 40.5', g_t_41_435: 'Total 41 to 43.5',
  g_t_44_465: 'Total 44 to 46.5', g_t_47_505: 'Total 47 to 50.5', g_t_51p: 'Total 51 or higher',
});
const DAY = 86_400_000;

/**
 * Atom values computable from the saved lines (nflverse convention) and the game entry's last
 * meetings. Atoms whose line is unknown are absent from the map.
 */
export function lineAtoms({ spread = null, total = null } = {}, game = null) {
  const out = new Map();
  const s = finite(spread) ? spread : null, tl = finite(total) ? total : null;
  if (s !== null) {
    const a = Math.abs(s);
    const v = {
      g_home_fav: s > 0, g_road_fav: s < 0, g_home_fav_1_3: s > 0 && s <= 3, g_home_fav_35_65: s >= 3.5 && s <= 6.5, g_home_fav_7p: s >= 7,
      g_road_fav_1_3: s >= -3 && s < 0, g_road_fav_35_65: s >= -6.5 && s <= -3.5, g_road_fav_7p: s <= -7, g_pickem: a <= 1,
      g_s_15_25: a >= 1.5 && a <= 2.5, g_s_3: a === 3, g_s_35_65: a >= 3.5 && a <= 6.5, g_s_7: a === 7, g_s_75_95: a >= 7.5 && a <= 9.5,
      g_s_10_135: a >= 10 && a <= 13.5, g_s_14p: a >= 14, g_s_10p: a >= 10, g_s_key: [3, 7, 10, 14].includes(a),
      g_s_hook_above: [3.5, 7.5, 10.5, 14.5].includes(a), g_s_hook_below: [2.5, 6.5, 9.5, 13.5].includes(a),
    };
    for (const [k, x] of Object.entries(v)) out.set(k, x);
  }
  if (tl !== null) {
    const v = {
      g_t_le37: tl <= 37, g_t_375_405: tl >= 37.5 && tl <= 40.5, g_t_41_435: tl >= 41 && tl <= 43.5, g_t_44_465: tl >= 44 && tl <= 46.5,
      g_t_47_505: tl >= 47 && tl <= 50.5, g_t_51p: tl >= 51, g_t_49p: tl >= 49, g_t_54p: tl >= 54, g_t_hook: (tl * 2) % 2 === 1,
    };
    for (const k of [37, 41, 43, 44, 47, 51]) v[`g_t_key${k}`] = tl === k;
    for (const [k, x] of Object.entries(v)) out.set(k, x);
    // Last meeting within two years scored 10+ more (or fewer) than this total (the engine's 730-day rule).
    let high = false, low = false;
    const last = game?.entities?.h2h?.[0], match = last && /^[A-Z]{2,3} (\d+), [A-Z]{2,3} (\d+)$/.exec(last.score || '');
    if (match && (Date.parse(game.date) - Date.parse(last.date)) / DAY <= 730) {
      const scored = Number(match[1]) + Number(match[2]);
      high = scored - tl >= 10; low = scored - tl <= -10;
    }
    out.set('g_h2h_last_high', high); out.set('g_h2h_last_low', low);
  }
  if (s !== null && tl !== null) {
    out.set('g_dog_tt_le17', (tl - Math.abs(s)) / 2 <= 17);
    out.set('g_fav_tt_ge28', (tl + Math.abs(s)) / 2 >= 28);
    out.set('g_fav_tt_ge27', (tl + Math.abs(s)) / 2 >= 27);
  }
  return out;
}

const atomsOf = id => id.slice(id.indexOf('|') + 1).split('+').map(part => ({ kind: part.slice(0, part.indexOf(':')), value: part.slice(part.indexOf(':') + 1) }));
/**
 * Whether a line-dependent item applies to this game at the viewer's saved lines: true, false,
 * or null when a needed line (or a fact only known on game day) is not held here.
 */
export function itemApplies(id, team, game, atoms, lines = {}) {
  let unknown = false, lineAtom = false;
  for (const { kind, value } of atomsOf(id)) {
    if (kind === 'g' && LINE_ATOMS.has(value)) {
      lineAtom = true;
      if (!atoms.has(value)) unknown = true; else if (!atoms.get(value)) return false;
    } else if (kind === 'role' && (value === 'fav' || value === 'dog')) {
      lineAtom = true;
      if (!finite(lines.spread) || !team || !game) unknown = true;
      else {
        if (lines.spread === 0) return false;
        const favored = (team === game.home) === (lines.spread > 0);
        if (favored !== (value === 'fav')) return false;
      }
    } else if (kind === 't' && value === 't_mkt_down3') { lineAtom = true; unknown = true; }
    else if (kind === 'g' && value === 'g_indoor') {
      const roof = game?.flags?.roof;
      if (roof === 'unknown' || !roof) unknown = true; else if (roof !== 'dome' && roof !== 'closed') return false;
    }
  }
  return !lineAtom || unknown ? null : true;
}

// ---------------------------------------------------------------------------
// Items, cards and rows
// ---------------------------------------------------------------------------
/** Context, gated and band items are row ids; "id@TEAM" binds a team trait to that team. */
export function parseItem(item) {
  const at = item.lastIndexOf('@'), team = at > 0 ? item.slice(at + 1) : '';
  return /^[A-Z]{2,3}$/.test(team) ? { id: item.slice(0, at), team } : { id: item, team: null };
}
export function lookup(week, id) {
  if (week?.cards?.[id]) return { kind: 'card', entry: week.cards[id] };
  if (week?.rows?.[id]) return { kind: 'row', entry: week.rows[id] };
  return null;
}
/** Referee rows carry no title in the week file; label them from the id. */
export function refereeTitle(id) {
  const match = /^(total|home_ats)\|ref:([^+]+)(?:\+g:(\w+))?$/.exec(id);
  if (!match) return null;
  const what = match[1] === 'total' ? 'over/under' : 'home vs road ATS';
  const scope = !match[3] ? 'career' : match[3] === 'g_prime' ? 'primetime' : match[3] === 'g_div' ? 'divisional games' : (BAND_LABELS[match[3]] || match[3]).toLowerCase();
  return `Referee ${match[2]}, ${scope}: ${what}`;
}
export function itemTitle(week, id, team = null) {
  const base = lookup(week, id)?.entry.title || refereeTitle(id) || id;
  return team && !base.includes(team) ? `${base} · ${team}` : base;
}
export const familyTitle = (week, family) => week?.families?.find(f => f.id === family)?.title || family;

const OUTCOMES = {
  home_ats: ['Home covered', 'Road covered', 'Pushes'], fav_ats: ['Favorite covered', 'Underdog covered', 'Pushes'],
  total: ['Over', 'Under', 'Pushes'], total_rev: ['With the rule', 'Against the rule', 'Pushes'],
};
/**
 * Whose record a team-market row counts, from its id. Only a team:X row is that team's own record;
 * a trait row counts every team with the trait league-wide, a coach row every team the coach led and
 * a QB row every team the QB started for, so those get generic subjects even when bound to a team.
 */
export function rowSubject(id = '') {
  const parts = typeof id === 'string' && id.includes('|') ? atomsOf(id) : [];
  const own = parts.find(({ kind }) => kind === 'team');
  if (own) return /^[A-Z]{2,3}$/.test(own.value) ? own.value : 'Team';
  const kinds = new Set(parts.map(({ kind }) => kind));
  return kinds.has('coach') ? 'Coach’s team' : kinds.has('qb') ? 'QB’s team' : kinds.has('t') ? 'Team with the trait' : 'Team';
}
/** Labels for a two-sided split [A, B, pushes] (in-sample, shown both ways), named from the row id, never from the game's team. */
export function splitLabels(market, id = '') {
  if (market === 'team_ats') return [`${rowSubject(id)} covered`, 'Opponent covered', 'Pushes'];
  if (market === 'su') { const who = rowSubject(id); return [`${who} won`, `${who} lost`, 'Ties']; }
  return OUTCOMES[market] || ['Side A', 'Side B', 'Pushes'];
}
/** A side as the panel names it: "Under", "Road team ATS", "Back HOU ATS", "Fade NYG ATS". */
export function sideText(week, market, side, team = null) {
  if (side !== 'A' && side !== 'B') return null;
  if (market === 'team_ats' && team) return side === 'A' ? `Back ${team} ATS` : `Fade ${team} ATS`;
  if (market === 'su' && team) return side === 'A' ? `${team} wins` : `${team} loses`;
  const sides = week?.markets?.[market]?.sides;
  return sides ? sides[side === 'A' ? 0 : 1] : null;
}

// ---------------------------------------------------------------------------
// Referees: precedence is the commissioner's hosted assignment (including a cleared one),
// then the week file's static map (scripts/trends.mjs --referees), then not assigned.
// ---------------------------------------------------------------------------
export function refereeFor(week, gameId, hosted = null) {
  const assignments = hosted && typeof hosted === 'object' ? hosted.assignments : null;
  if (assignments && Object.hasOwn(assignments, gameId)) {
    const row = assignments[gameId];
    return { name: row?.referee || null, source: row?.referee ? 'commissioner' : null, setAt: row?.setAt || null };
  }
  const file = week?.assignedReferees?.[gameId] || null;
  return { name: file, source: file ? 'file' : null, setAt: null };
}
/** The referee's rows that apply to this game: career, plus primetime, divisional and the total band when known. */
export function refereeRows(week, name, game, { total = null } = {}) {
  const ref = name ? week?.referees?.[name] : null;
  if (!ref) return [];
  const rows = [{ id: ref.total, label: 'Career: over/under' }, { id: ref.homeAts, label: 'Career: home vs road ATS' }];
  if (game?.flags?.window === 'primetime') rows.push({ id: ref.primetime.total, label: 'Primetime (19:00 ET or later): over/under' }, { id: ref.primetime.homeAts, label: 'Primetime: home vs road ATS' });
  if (game?.flags?.divisional) rows.push({ id: ref.divisional.total, label: 'Divisional games: over/under' }, { id: ref.divisional.homeAts, label: 'Divisional games: home vs road ATS' });
  if (finite(total)) {
    const atoms = lineAtoms({ total });
    const band = Object.keys(ref.totalBands || {}).find(b => atoms.get(b));
    if (band) rows.push({ id: ref.totalBands[band], label: `${BAND_LABELS[band] || band} (your saved total): over/under` });
  }
  return rows.filter(row => week.rows?.[row.id]);
}

// ---------------------------------------------------------------------------
// Records and formatting
// ---------------------------------------------------------------------------
export const rec = r => (Array.isArray(r) ? { W: r[0] ?? 0, L: r[1] ?? 0, P: r[2] ?? 0 } : { W: r?.W ?? 0, L: r?.L ?? 0, P: r?.P ?? 0 });
export const fmtRecord = r => { const { W, L, P } = rec(r); return `${W}-${L}-${P}`; };
export const winRate = r => { const { W, L } = rec(r); return W + L ? W / (W + L) : null; };
/** Units at −110: +0.9091 per win, −1 per loss, 0 per push. */
export const units110 = r => { const { W, L } = rec(r); return Math.round((W * W110 - L) * 10000) / 10000; };
/** ROI = net units / (W + L + P): risk includes pushes (the repo's Virtual Units rule). */
export const roi110 = r => { const { W, L, P } = rec(r); const n = W + L + P; return n ? (W * W110 - L) / n : null; };
export const fmtUnits = x => (!finite(x) ? '—' : Math.abs(x) < 0.005 ? '0.00' : `${x > 0 ? '+' : MINUS}${Math.abs(x).toFixed(2)}`);
export const fmtPct = (x, digits = 1) => (!finite(x) ? '—' : `${(x * 100).toFixed(digits)}%`);
export const fmtSignedPct = x => (!finite(x) ? '—' : Math.abs(x) < 0.0005 ? '0.0%' : `${x > 0 ? '+' : MINUS}${Math.abs(x * 100).toFixed(1)}%`);
export const fmtNumber = x => (!finite(x) ? '—' : Number.isInteger(x) ? String(x) : x.toFixed(1));
export const fmtSigned = x => (!finite(x) ? '—' : x === 0 ? '0' : `${x > 0 ? '+' : MINUS}${fmtNumber(Math.abs(x))}`);
export const fmtStreak = s => (!s ? '—' : typeof s === 'string' ? s : `${s.result}${s.length}`);
export const yearsOf = (entry, season) => entry?.years || [2002, season];
export const fmtYears = ([from, to] = []) => (from === to ? String(from) : `${from}–${to}`);
/** Distinct seasons with games; a row without seasons has games in every season of its years. */
export const seasonsOf = (entry, season) => entry?.seasons ?? (yearsOf(entry, season)[1] - yearsOf(entry, season)[0] + 1);

/** Inline SVG path for a cumulative-units series, with the zero baseline. */
export function sparkPath(series, { width = 120, height = 32, pad = 2 } = {}) {
  if (!Array.isArray(series) || series.length < 2 || !series.every(finite)) return null;
  const lo = Math.min(0, ...series), hi = Math.max(0, ...series), span = hi - lo || 1;
  const r = n => Math.round(n * 100) / 100;
  const x = i => pad + (i * (width - 2 * pad)) / (series.length - 1);
  const y = v => pad + ((hi - v) * (height - 2 * pad)) / span;
  return { d: series.map((v, i) => `${i ? 'L' : 'M'}${r(x(i))} ${r(y(v))}`).join(' '), zeroY: r(y(0)), endX: r(x(series.length - 1)), endY: r(y(series.at(-1))), last: series.at(-1) };
}
export function summarizeSpark(series, { bets = null, low = null } = {}) {
  if (!Array.isArray(series) || !series.length) return 'No cumulative units yet';
  const after = finite(bets) ? ` after ${bets.toLocaleString('en-US')} bets` : '';
  const lowest = low && finite(low.units) ? `; lowest ${fmtUnits(low.units)}${low.season ? ` in ${low.season}` : ''}` : '';
  return `Cumulative units at ${MINUS}110: ${fmtUnits(series.at(-1))}${after}${lowest}`;
}

// ---------------------------------------------------------------------------
// Kickoff wind forecast (D-34). Open-Meteo snapshots come from gtl-api /wind/read for signed-in
// community members; this file only shapes them. Every age and state is computed from an explicit
// `now` (the server's asOf plus the time since the response arrived), never from a clock read here.
// The frozen week file and registry still say "no forecast source"; WIND_COPY and WIND_CARD_NOTES
// supersede those strings on screen only, so no artifact (and no registry sha256) changes.
// ---------------------------------------------------------------------------
// The same strings as cloud/wind.mjs WIND_ATTRIBUTION (a test keeps them equal).
export const WIND_CREDIT = 'Weather data by Open-Meteo.com';
export const WIND_SOURCE_URL = 'https://open-meteo.com/';
export const WIND_LICENSE = 'CC BY 4.0';
export const WIND_LICENSE_URL = TRENDS_LICENSE_URL;
export const WIND_CHANGES = 'Kickoff-hour values selected by GTL; wind direction shown as compass points';
/** Refresh tiers by lead; the same numbers as cloud/wind.mjs and the SQL (a test keeps them equal). */
export const WIND_TIERS = Object.freeze([
  Object.freeze({ maxLeadH: 18, ttlMin: 60 }), Object.freeze({ maxLeadH: 72, ttlMin: 180 }), Object.freeze({ maxLeadH: 120, ttlMin: 360 }),
]);
export const WIND_HORIZON_H = 120;
/** A final pre-kickoff forecast must be at most this old at kickoff: twice the 1 h TTL, the same rule as the last hour before kickoff. */
export const WIND_FINAL_MAX_MS = 2 * 60 * 60_000;
export const WIND_CARD = 'total|g:g_wind10';
export const WIND15_CARD = 'total|g:g_wind15';
export const WIND_COPY = Object.freeze({
  evidence: 'In out-of-sample testing (2018-2025) only one trend beat chance: strong wind at kickoff (10+ mph) went Under, on played games. Its record uses observed kickoff wind. Signed-in community members see an Open-Meteo kickoff forecast for every upcoming game not played in a dome, but using the record with a forecast has not been backtested.',
  windConditional: 'Applies only if kickoff wind is 10+ mph; no current forecast for this game',
  wind15Conditional: 'Applies only if kickoff wind is 15+ mph; no current forecast for this game',
  weatherConditional: 'Applies only to observed kickoff weather',
  windShown: 'Applies only if kickoff wind is 10+ mph; see the kickoff wind forecast above',
  wind15Shown: 'Applies only if kickoff wind is 15+ mph; see the kickoff wind forecast above',
  stale: 'The last forecast is out of date.',
  later: 'The kickoff forecast appears 5 days before kickoff.',
  loading: 'Loading kickoff forecast…',
  indoor: 'Strong wind trends do not apply indoors (dome or closed roof).',
  canopy: 'Strong wind trends do not apply here: the trend records count this covered stadium as a dome.',
});
/** Displayed card notes that supersede the frozen registry note; the registry itself is untouched. */
export const WIND_CARD_NOTES = Object.freeze({
  [WIND_CARD]: 'Observed kickoff wind. For upcoming outdoor games, signed-in community members see an Open-Meteo kickoff forecast beside this card (D-34); the record has not been tested on forecast wind.',
});
export const cardNote = card => (card ? WIND_CARD_NOTES[card.id] ?? card.note ?? null : null);
/** The conditional summary for a wind card: the week file's note unless the view overrides it. */
export function windNote(week, note, shown = false) {
  if (shown && note === 'windConditional') return WIND_COPY.windShown;
  if (shown && note === 'wind15Conditional') return WIND_COPY.wind15Shown;
  return WIND_COPY[note] ?? week?.copy?.[note] ?? note;
}

const HOUR_MS = 3_600_000;
/** TTL in minutes for a lead in ms, or null at or after kickoff and beyond 120 h. */
export function windTtl(leadMs) {
  if (!finite(leadMs) || leadMs <= 0) return null;
  return WIND_TIERS.find(tier => leadMs <= tier.maxLeadH * HOUR_MS)?.ttlMin ?? null;
}
/** The effective server time: the response's asOf plus the time since it arrived on this device. */
export function windClock(asOf, receivedAt, nowMs) {
  const base = typeof asOf === 'string' ? Date.parse(asOf) : NaN;
  return Number.isFinite(base) && finite(receivedAt) && finite(nowMs) ? base + Math.max(0, nowMs - receivedAt) : null;
}
const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** Meteorological direction (where the wind comes from) as one of 16 compass points: 247° is WSW. */
export const compass = deg => (finite(deg) && deg >= 0 && deg <= 360 ? POINTS[Math.round(deg / 22.5) % 16] : null);
/** "less than a minute", "12 min", "5 h", "3 days". */
export function fmtAge(ms) {
  if (!finite(ms) || ms < 0) return '—';
  if (ms < 60_000) return 'less than a minute';
  if (ms < HOUR_MS) return `${Math.floor(ms / 60_000)} min`;
  if (ms < 48 * HOUR_MS) return `${Math.floor(ms / HOUR_MS)} h`;
  return `${Math.floor(ms / (24 * HOUR_MS))} days`;
}
const etParts = (iso, options) => {
  const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...options }).format(ms) : null;
};
/** "8 PM" (Eastern, like the panel's kickoffEt). */
export const etHour = iso => etParts(iso, { hour: 'numeric', hour12: true })?.replace(/\s/g, ' ') ?? null;
/** "8:15 PM" (Eastern). */
export const etTime = iso => etParts(iso, { hour: 'numeric', minute: '2-digit', hour12: true })?.replace(/\s/g, ' ') ?? null;
/** The band from the unrounded source value, so the shown number and the threshold test never disagree. */
export function windBand(mph) {
  if (!finite(mph)) return null;
  const band = mph >= 15 ? '15+' : mph >= 10 ? '10-14' : 'below';
  return { band, wind10: mph >= 10, wind15: mph >= 15, close: Math.abs(mph - 10) < 3 || Math.abs(mph - 15) < 3 };
}
/** The short-range labels: the hourly high-resolution claim, and the lead-only wording used everywhere else. */
export const WIND_SHORT_RANGE_US = 'Short range: high-resolution model updated hourly';
export const WIND_SHORT_RANGE = 'Short range (within 18 h of kickoff)';
/**
 * Confidence label from a snapshot's lead (kickoff minus when it was made). Within 18 h the label
 * claims an hourly high-resolution model only when `us` is true (a known U.S. stadium): every one sits
 * inside NOAA HRRR's CONUS domain (tests/wind-venues.test.mjs), which Open-Meteo's best match uses
 * there. Abroad best match picks other models (its ForecastapiController best_match branch: ICON-D2,
 * updated every 3 h, at Saint-Denis and Munich; ICON-EU, IFS and GFS at Madrid; the global GFS, ICON
 * and IFS mix at Mexico City, which is south of the HRRR domain), so the label names only the lead and
 * makes no model or update-rate claim. Anything but `true` (an unknown venue, an array index) counts as abroad.
 */
export function windConfidence(leadMs, us = false) {
  if (!finite(leadMs)) return null;
  if (leadMs <= 18 * HOUR_MS) return us === true ? WIND_SHORT_RANGE_US : WIND_SHORT_RANGE;
  if (leadMs <= 48 * HOUR_MS) return 'Next-day guidance';
  if (leadMs <= 72 * HOUR_MS) return 'Trend indicator only (2 to 3 days out)';
  return 'Early outlook, low confidence (3 to 5 days out)';
}
const validWind = w => !!w && typeof w === 'object' && finite(w.windMph) && Number.isFinite(Date.parse(w.fetchedAt)) && Number.isFinite(Date.parse(w.forecastHour));
export const ROOF_TYPES = Object.freeze(['outdoor', 'canopy', 'retractable', 'dome']);
/**
 * A game's roof for the weather row (D-45): the venue's type ('outdoor', 'canopy', 'retractable' or 'dome'), from
 * the server's venue (or the week file's stadium when there is none), else null. The week file's nflverse `roof`
 * never overrides a known venue type: it lists SoFi Stadium's canopy as a dome.
 */
export const venueRoof = (venue, game = null) => {
  const type = venue?.type ?? game?.flags?.stadium?.type ?? null;
  return ROOF_TYPES.includes(type) ? type : null;
};
/** Indoors: a dome; a retractable roof the week file records as closed; an unknown venue the week file records as a dome or closed. */
export const indoorsFor = (roof, game = null) => roof === 'dome'
  || ((roof === 'retractable' || roof === null) && ['dome', 'closed'].includes(game?.flags?.roof));

/**
 * What the panel shows for one game's kickoff wind:
 * - loading: the read is in flight;
 * - indoor: a dome or a closed roof (no fetch, no numbers, no credit); a canopy is fetched since D-45;
 * - forecast: a pre-kickoff snapshot no older than twice the TTL for the current lead;
 * - final: after kickoff, the last pre-kickoff snapshot if it was made within 2 h of kickoff;
 * - not_yet: more than 120 h before kickoff;
 * - none: missing, stale, invalid or unavailable (reason 'stale' or 'unavailable').
 */
export function windView({ game, entry = null, now = null, loading = false }) {
  const type = venueRoof(entry?.venue, game);
  if (indoorsFor(type, game) || (type === null && entry?.status === 'indoor')) return { state: 'indoor' };
  if (!entry || !finite(now)) return loading ? { state: 'loading' } : { state: 'none', reason: 'unavailable' };
  const kickoff = Date.parse(entry.kickoff ?? game?.kickoff);
  if (!Number.isFinite(kickoff)) return { state: 'none', reason: 'unavailable' };
  const lead = kickoff - now, wind = validWind(entry.wind) ? entry.wind : null;
  if (lead > WIND_HORIZON_H * HOUR_MS) return { state: 'not_yet' };
  if (!wind) return { state: 'none', reason: 'unavailable' };
  const fetched = Date.parse(wind.fetchedAt), made = kickoff - fetched;
  if (made <= 0) return { state: 'none', reason: 'unavailable' };
  let state;
  if (lead > 0) state = Math.max(0, now - fetched) <= 2 * windTtl(lead) * 60_000 ? 'forecast' : null;
  else state = made <= WIND_FINAL_MAX_MS ? 'final' : null;
  if (!state) return { state: 'none', reason: 'stale' };
  const venue = entry.venue || null, band = windBand(wind.windMph), us = venue?.country === 'USA';
  return {
    state, wind, venue, kickoff: new Date(kickoff).toISOString(), band, close: band.close,
    age: Math.max(0, now - fetched), made, confidence: windConfidence(made, us),
    retractable: type === 'retractable', canopy: type === 'canopy', international: !!venue && !us, early: made > 72 * HOUR_MS,
  };
}

/**
 * When an open panel should ask the server again (ms since epoch), or null: the earliest of a game
 * entering the 120 h window, a snapshot's age crossing the TTL for its lead, and kickoff. A game
 * within the window with no snapshot is retried after its TTL. Never sooner than a minute from now.
 */
export function nextWindRefresh(data, now) {
  if (!data || typeof data !== 'object' || !finite(now) || !data.games || typeof data.games !== 'object') return null;
  let next = Infinity;
  for (const entry of Object.values(data.games)) {
    if (!entry || entry.status === 'indoor' || entry.status === 'unknown_venue') continue;
    const kickoff = Date.parse(entry.kickoff);
    if (!Number.isFinite(kickoff) || kickoff <= now) continue;
    const lead = kickoff - now, ttl = windTtl(lead);
    if (ttl === null) { next = Math.min(next, kickoff - WIND_HORIZON_H * HOUR_MS); continue; }
    const fetched = validWind(entry.wind) ? Date.parse(entry.wind.fetchedAt) : NaN;
    next = Math.min(next, kickoff, Number.isFinite(fetched) ? fetched + ttl * 60_000 : now + ttl * 60_000);
  }
  return Number.isFinite(next) ? Math.max(next, now + 60_000) : null;
}
