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
 * 'deadline' for legacy local data. Authenticated cloud reads fail if live rules cannot be verified.
 */
export const revealTime = rules => (rules?.revealAt === 'kickoff' || rules?.lateWindow === 'kickoff' ? 'kickoff' : 'deadline');
/**
 * A game's pick is locked in: a number in a submitted ballot, or one the ballot's `lockedAt` names (`{ submittedAt, picks,
 * lockedAt }`; M-02 records each per-game lock-in there). The same reading as gtl_guess_locked_in (gtl_ballot_locked_in),
 * the engine's ballotLockedIn and web/src/sentFinal.js lockedIn.
 */
export const guessLockedIn = (ballot, gameId) => finite(ballot?.picks?.[gameId])
  && !(Array.isArray(ballot?.closedAtKickoff) && ballot.closedAtKickoff.includes(gameId))
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
  const own = { submittedAt: data?.submittedAt, lockedAt: data?.lockedAt, closedAtKickoff: data?.closedAtKickoff, picks: { [gameId]: game?.prediction } };
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
/**
 * The D-47 refresh schedule (Sean, October 15, 2026: "Just need a weather update every 24 hours and then 2 hours and 12
 * hours before kickoff"): a snapshot is due again 24 h after it was taken and at each checkpoint (12 h, then 2 h before
 * kickoff) reached after it was taken; never at or after kickoff. The same numbers as cloud/wind.mjs and the SQL
 * gtl_begin_wind_fetch (tests keep all three equal).
 */
export const WIND_SCHEDULE = Object.freeze({ everyH: 24, beforeKickoffH: Object.freeze([12, 2]) });
export const WIND_HORIZON_H = 120;
/**
 * How long past its due time a snapshot still shows as current (D-47): one hour. A refresh happens only when someone
 * reads, so a due snapshot is first shown while the read that refreshes it is on its way: an open screen asks again at
 * the due time (a minute later when the server's single flight or 60 s spacing turned it away), and the first reader
 * after a quiet spell gets the refreshed snapshot in the same answer. An hour covers that, a device clock that runs a
 * little behind and the 15-minute backoff after one Open-Meteo failure, so a forecast that is merely waiting for the
 * next read never shows as out of date. It is shorter than the 10 h between the 12 h and 2 h checkpoints and than the
 * last 2 h, so a missed checkpoint stops showing as current an hour later: a 12 h-old forecast is never called current
 * in the last hour before kickoff, and after kickoff only a snapshot taken in the last 2 h (the 2 h checkpoint or
 * later) is the final pre-kickoff forecast.
 */
export const WIND_GRACE_MS = 60 * 60_000;
/**
 * An open screen asks again this long after an answer that left a game due (no snapshot, or one past its due time)
 * because the server held off (backoff, the daily budget, a failed fetch): gtl_begin_wind_fetch's shortest backoff.
 * When the server only spaced the request (busy, cooldown) or has just fetched, it asks again a minute later.
 */
export const WIND_RETRY_MS = 15 * 60_000;
export const WIND_CARD = 'total|g:g_wind10';
export const WIND15_CARD = 'total|g:g_wind15';
export const WIND_COPY = Object.freeze({
  evidence: 'In out-of-sample testing (2018-2025) only one trend beat chance: strong wind at kickoff (10+ mph) went Under, on played games. Its record uses observed kickoff wind. Signed-in community members see an Open-Meteo kickoff forecast for upcoming open-air and retractable-roof games, but using the record with a forecast has not been backtested.',
  windConditional: 'Applies only if kickoff wind is 10+ mph; no current forecast for this game',
  wind15Conditional: 'Applies only if kickoff wind is 15+ mph; no current forecast for this game',
  weatherConditional: 'Applies only to observed kickoff weather',
  windShown: 'Applies only if kickoff wind is 10+ mph; see the kickoff wind forecast above',
  wind15Shown: 'Applies only if kickoff wind is 15+ mph; see the kickoff wind forecast above',
  stale: 'The last forecast is out of date.',
  later: 'The kickoff forecast appears 5 days before kickoff.',
  loading: 'Loading kickoff forecast…',
  indoor: 'Strong wind trends do not apply indoors (dome or closed roof).',
});
/** Displayed card notes that supersede the frozen registry note; the registry itself is untouched. */
export const WIND_CARD_NOTES = Object.freeze({
  [WIND_CARD]: 'Observed kickoff wind. For upcoming open-air and retractable-roof games, signed-in community members see an Open-Meteo kickoff forecast beside this card (D-34); the record has not been tested on forecast wind.',
});
export const cardNote = card => (card ? WIND_CARD_NOTES[card.id] ?? card.note ?? null : null);
/** The conditional summary for a wind card: the week file's note unless the view overrides it. */
export function windNote(week, note, shown = false) {
  if (shown && note === 'windConditional') return WIND_COPY.windShown;
  if (shown && note === 'wind15Conditional') return WIND_COPY.wind15Shown;
  return WIND_COPY[note] ?? week?.copy?.[note] ?? note;
}

const HOUR_MS = 3_600_000;
/**
 * When a snapshot taken at `fetchedMs` falls due (ms), the same rule as cloud/wind.mjs windNextDue and the SQL: 24 h after
 * it was taken, or the first checkpoint (12 h, then 2 h before kickoff) after it was taken, whichever comes first. null
 * when that is at or after kickoff: the snapshot is then the final pre-kickoff forecast and is never due again.
 */
export function windNextDue(kickoffMs, fetchedMs) {
  if (!finite(kickoffMs) || !finite(fetchedMs)) return null;
  let next = fetchedMs + WIND_SCHEDULE.everyH * HOUR_MS;
  for (const hours of WIND_SCHEDULE.beforeKickoffH) {
    const checkpoint = kickoffMs - hours * HOUR_MS;
    if (checkpoint > fetchedMs) next = Math.min(next, checkpoint);
  }
  return next < kickoffMs ? next : null;
}
/** Whether a snapshot is current at `at` (D-47): until its due time plus WIND_GRACE_MS, and for good once it is never due. */
export const windCurrent = (kickoffMs, fetchedMs, at) => {
  const due = windNextDue(kickoffMs, fetchedMs);
  return due === null || at <= due + WIND_GRACE_MS;
};
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
 * never overrides a known venue type.
 */
export const venueRoof = (venue, game = null) => {
  const type = venue?.type ?? game?.flags?.stadium?.type ?? null;
  return ROOF_TYPES.includes(type) ? type : null;
};
/**
 * Indoors (D-45): a dome; SoFi Stadium's canopy, a fixed roof over the field that nflverse and the trend records count
 * as a dome (never fetched); a retractable roof the week file records as closed; an unknown venue the week file
 * records as a dome or closed.
 */
export const indoorsFor = (roof, game = null) => roof === 'dome' || roof === 'canopy'
  || ((roof === 'retractable' || roof === null) && ['dome', 'closed'].includes(game?.flags?.roof));

/**
 * What the panel shows for one game's kickoff wind:
 * - loading: the read is in flight;
 * - indoor: a dome, a canopy or a closed roof (no fetch, no numbers, no credit), or a game the server answers 'indoor'
 *   for when no venue type is known;
 * - forecast: a pre-kickoff snapshot that is current (windCurrent, D-47): until an hour past the time it fell due on the
 *   24 h / 12 h / 2 h schedule;
 * - final: after kickoff, the last pre-kickoff snapshot if it was still current at kickoff, which is a snapshot taken
 *   2 h or less before kickoff (at or after the last checkpoint);
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
  if (lead > 0) state = windCurrent(kickoff, fetched, now) ? 'forecast' : null;
  else state = windCurrent(kickoff, fetched, kickoff) ? 'final' : null;
  if (!state) return { state: 'none', reason: 'stale' };
  const venue = entry.venue || null, band = windBand(wind.windMph), us = venue?.country === 'USA';
  return {
    state, wind, venue, kickoff: new Date(kickoff).toISOString(), band, close: band.close,
    age: Math.max(0, now - fetched), made, confidence: windConfidence(made, us),
    retractable: type === 'retractable', international: !!venue && !us, early: made > 72 * HOUR_MS,
  };
}

/**
 * When an open screen should ask the server again (ms since epoch), or null: the earliest of a game entering the 120 h
 * window, a snapshot falling due on the D-47 schedule (24 h after it was taken, 12 h and 2 h before kickoff), and
 * kickoff. A game still due when the answer came (no snapshot, or one past its due time) is asked again after
 * WIND_RETRY_MS when the server held off (backoff, budget, a failed fetch), or a minute later when it only spaced the
 * request or has just fetched. Never sooner than a minute from now.
 */
export function nextWindRefresh(data, now) {
  if (!data || typeof data !== 'object' || !finite(now) || !data.games || typeof data.games !== 'object') return null;
  const retry = ['busy', 'cooldown', 'fetched'].includes(data.refresh?.outcome) ? 60_000 : WIND_RETRY_MS;
  let next = Infinity;
  for (const entry of Object.values(data.games)) {
    if (!entry || entry.status === 'indoor' || entry.status === 'unknown_venue') continue;
    const kickoff = Date.parse(entry.kickoff);
    if (!Number.isFinite(kickoff) || kickoff <= now) continue;
    if (kickoff - now > WIND_HORIZON_H * HOUR_MS) { next = Math.min(next, kickoff - WIND_HORIZON_H * HOUR_MS); continue; }
    const fetched = validWind(entry.wind) ? Date.parse(entry.wind.fetchedAt) : NaN;
    const due = Number.isFinite(fetched) ? windNextDue(kickoff, fetched) : now;
    next = Math.min(next, kickoff, due === null ? Infinity : due > now ? due : now + retry);
  }
  return Number.isFinite(next) ? Math.max(next, now + 60_000) : null;
}

// ---------------------------------------------------------------------------
// Simplified trends (DASH-7; redesign build plan stage 13, with the All trends sheet pulled forward from stage 34).
// Sean, October 14, 2026: "Per game: the top 3 trends in plain words, each with its record and sample size, plus
// wind, weather and referee rows and an All trends sheet." These helpers turn the week file into short cards for
// the new app's Lines tab. They never invent a trend, a record or a sample size: every number comes from the week
// file's own card or row, a card that does not fit this game is never shown as fitting, and a line trend whose
// market is not open to the viewer carries no title, record or number at all (only its market, so the screen can
// say how it opens). The gate is gameAccess above (the per-game access function, D-39), fed by the server's rules.
// ---------------------------------------------------------------------------
/** Plain tier words: the engine's tier (1, 2, 3) and its watch list, never re-ranked. */
export const TIER_WORDS = Object.freeze({ 1: 'Strongest evidence (played games only)', 2: 'Consistent, not proven', watch: 'Watch list, no proven edge', 3: 'No proven edge' });
/** The board's short tier word after a trend line ("… since 2002 · Not proven"). */
export const BOARD_TIER_WORDS = Object.freeze({ 1: 'Strongest evidence', 2: 'Not proven' });
export const TRENDS_FOOTNOTE = 'Past results since 2002. Not a tip. Never changes your score.';
export const LINE_TREND_TITLE = 'Line-based trend';

const tierKey = entry => (entry?.tier === 1 ? 1 : entry?.tier === 2 ? 2 : entry?.watch ? 'watch' : 3);
const TIER_RANK = Object.freeze({ 1: 0, 2: 1, watch: 2, 3: 3 });
const scoreOfEntry = entry => (finite(entry?.score?.score) ? entry.score.score : finite(entry?.score) ? entry.score : 0);
/**
 * Strength as the engine defines it (shared/trends.mjs grade and its per-game sort): the tier first (Tier 1, Tier 2,
 * the watch list, then the rest), then the out-of-sample quality score, highest first. Never ROI, win rate or streak.
 * Returns `[rank, -score]` for sorting.
 */
export function trendStrength(week, id) {
  const entry = lookup(week, id)?.entry;
  return [TIER_RANK[tierKey(entry)], -scoreOfEntry(entry)];
}
const byStrength = (a, b) => a.strength[0] - b.strength[0] || a.strength[1] - b.strength[1] || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) || String(a.team || '').localeCompare(String(b.team || ''));

/**
 * The market a trend needs open before it can show: the engine's own gate for a card or row ('spread', 'total' or
 * 'both'), and, for a card whose side is the favorite or the underdog, the Spread (the prototype's review R9: "Favorite
 * ATS" only means something once the spread is known). Null when it needs no line.
 */
export function lineGate(week, id) {
  const found = lookup(week, id);
  const gate = found?.entry?.gate;
  if (gate === 'spread' || gate === 'total' || gate === 'both') return gate;
  if (found?.kind === 'card' && found.entry.market === 'fav_ats') return 'spread';
  return null;
}

const MINUS_SIGN = '−';
const thousands = n => (finite(n) ? Math.round(n).toLocaleString('en-US') : '—');
/** "8–3", "117–89–7", "3,087–3,217–170" (pushes only when there are some). */
export const recordText = (a, b, p = 0) => `${thousands(a)}–${thousands(b)}${p ? `–${thousands(p)}` : ''}`;
/** "11 games", "1 game". */
export const sampleText = n => `${thousands(n)} ${n === 1 ? 'game' : 'games'}`;
const sinceText = years => (Array.isArray(years) && years[0] && years[1] && years[0] !== years[1] ? `since ${years[0]}` : Array.isArray(years) && years[0] ? `in ${years[0]}` : 'since 2002');
const pushesText = (p, word = 'push') => (p ? ` (${thousands(p)} ${p === 1 ? word : word === 'push' ? 'pushes' : `${word}s`})` : '');
const capitalized = text => (text ? text[0].toUpperCase() + text.slice(1) : text);

/** A team's nickname from its full name ("Seattle Seahawks" → "Seahawks"); the code when the name is unknown. */
export function teamNickname(names, code) {
  const name = names?.[code];
  return typeof name === 'string' && name.trim() ? name.trim().split(/\s+/).at(-1) : code;
}
const possessive = nick => (/s$/i.test(nick) ? `${nick}’` : `${nick}’s`);

/** One plain sentence for a card's registered side and its record over every game since its first year. */
function cardSentence(card, { team, game, names, season }) {
  const r = rec(card.record), since = sinceText(yearsOf(card, season)), w = thousands(r.W), l = thousands(r.L);
  const side = card.sideRule;
  if (card.market === 'home_ats') return `${side === 'A' ? 'Home teams' : 'Road teams'} in this spot covered ${w} times and missed ${l} ${since}.`;
  if (card.market === 'fav_ats') return `${side === 'A' ? 'Favorites' : 'Underdogs'} in this spot covered ${w} times and missed ${l} ${since}.`;
  if (card.market === 'total') return `The ${side === 'A' ? 'Over' : 'Under'} hit ${w} times and missed ${l} in games like this ${since}.`;
  if (card.market === 'team_ats' && team && game) {
    // Back the team with the trait (side A), or fade it, which backs its opponent (side B).
    const backed = side === 'A' ? team : team === game.home ? game.away : game.home;
    return `Teams in the ${possessive(teamNickname(names, backed))} spot covered ${w} times and missed ${l} ${since}.`;
  }
  const label = typeof card.sideLabel === 'string' ? card.sideLabel.replace(/, /g, ' and ') : 'This side';
  return `${capitalized(label)}: right ${w} times and wrong ${l} ${since}.`;
}
/** The short form for the board: a percent instead of the counts ("Teams in the Saints’ spot covered 54% since 2002"). */
function cardShortLine(card, { team, game, names, season }) {
  const sentence = cardSentence(card, { team, game, names, season });
  const r = rec(card.record), pct = r.W + r.L ? Math.round((100 * r.W) / (r.W + r.L)) : null;
  if (pct === null) return null;
  return sentence.replace(/ (covered|hit|right) [\d,]+ times and (missed|wrong) [\d,]+/, (m, verb) => ` ${verb === 'right' ? 'right' : verb} ${pct}%`).replace(/\.$/, '');
}

/** One plain sentence for a two-sided row (shown both ways, never as a side with a record). */
function rowSentence(row, id, { names, season }) {
  const [a = 0, b = 0, p = 0] = Array.isArray(row.split) ? row.split : [];
  const since = sinceText(yearsOf(row, season)), A = thousands(a), B = thousands(b);
  if (row.market === 'home_ats') return `Home teams covered ${A} times and road teams ${B} ${since}${pushesText(p)}.`;
  if (row.market === 'fav_ats') return `Favorites covered ${A} times and underdogs ${B} ${since}${pushesText(p)}.`;
  if (row.market === 'total') return `Overs hit ${A} times and unders ${B} ${since}${pushesText(p)}.`;
  if (row.market === 'total_rev') return `With the rule ${A} times and against it ${B} ${since}${pushesText(p)}.`;
  const subject = rowSubject(id);
  const who = /^[A-Z]{2,3}$/.test(subject) ? `The ${teamNickname(names, subject)}` : subject === 'Coach’s team' ? 'The coach’s teams' : subject === 'QB’s team' ? 'The QB’s teams' : 'Teams with the trait';
  if (row.market === 'su') return `${who} won ${A} and lost ${B} ${since}${pushesText(p, 'tie')}.`;
  return `${who} covered ${A} times and their opponents ${B} ${since}${pushesText(p)}.`;
}

/**
 * A short card for one trend in a game: `{ key, id, team, kind, gate, locked, title, sentence, record, sample, games,
 * pct, tier, tierLabel, strength, notes }`. `ref` is a card reference (`{ card, team?, stacked?, conflict? }`) or a row
 * item (`{ id, team? }`). `access` is the game's gate (gameAccess); a line trend whose market is closed comes back
 * locked: `{ key, kind, gate, locked: true, title: LINE_TREND_TITLE, strength }` and nothing else, so no record, sample,
 * percent or title can reach the screen before the gate opens. `names` maps team codes to full names (TEAM_NAMES).
 */
export function shortCard(week, ref, { game = null, access = null, names = null } = {}) {
  const id = ref?.card ?? ref?.id ?? null;
  const found = id ? lookup(week, id) : null;
  if (!found) return null;
  const team = ref.team || null, entry = found.entry, gate = lineGate(week, id);
  const key = `${id}@${team || ''}`, strength = trendStrength(week, id), tier = tierKey(entry);
  if (gate && !gateOpen(access, gate)) return { key, kind: found.kind, gate, locked: true, title: LINE_TREND_TITLE, strength };
  if (found.kind === 'card') {
    const r = rec(entry.record), games = r.W + r.L + r.P;
    const notes = [ref.stacked ? (week?.copy?.stacked || 'Same side as another card; they are not independent confirmations.') : null,
      ref.conflict ? 'Conflicting trends: another trend here backs the other side.' : null].filter(Boolean);
    return {
      key, id, team, kind: 'card', gate, locked: false,
      title: team && !entry.title.includes(team) ? `${entry.title} · ${team}` : entry.title,
      sentence: cardSentence(entry, { team, game, names, season: week?.season }),
      shortLine: cardShortLine(entry, { team, game, names, season: week?.season }),
      record: recordText(r.W, r.L, r.P), sample: sampleText(games), games,
      pct: r.W + r.L ? Math.round((100 * r.W) / (r.W + r.L)) : null,
      tier, tierLabel: TIER_WORDS[tier], strength, notes, years: yearsOf(entry, week?.season),
    };
  }
  const [a = 0, b = 0, p = 0] = Array.isArray(entry.split) ? entry.split : [];
  return {
    key, id, team, kind: 'row', gate, locked: false,
    title: capitalized(itemTitle(week, id, team)),
    sentence: rowSentence(entry, id, { names, season: week?.season }),
    record: recordText(a, b, p), sample: sampleText(a + b + p), games: a + b + p, pct: null,
    tier: 3, tierLabel: entry.descriptive ? 'Straight-up record, no line' : TIER_WORDS[3], strength, notes: [], years: yearsOf(entry, week?.season),
  };
}

/** The viewer's own saved lines for a game, only for the markets open to them (nflverse convention; see savedLines). */
export function openSavedLines(access, { spread = null, total = null } = {}) {
  return { spread: access?.spread ? appSpreadToNflverse(spread) : null, total: access?.total && finite(total) ? total : null };
}

/**
 * The trends that fit one game, strongest first (trendStrength), as short cards, and the top three (Sean's "top 3").
 * Candidates: the week file's Tier 2 and watch-list cards for this game (a card the engine fires on this game's facts;
 * a favorite-or-underdog card stays locked while the Spread is closed), and a line-dependent card only once its market
 * is open and the viewer's own saved line shows that it fits (itemApplies). A Tier 1 or weather card that needs
 * observed kickoff weather, a card that waits for an earlier final, and a line card whose fit is unknown are never
 * candidates: they live in the All trends sheet with their condition. `saved` is the viewer's own saved line per
 * market in app convention (used only for an open market).
 */
export function gameTrends(week, gameId, { access = null, saved = {}, names = null } = {}) {
  const game = week?.games?.find(g => g.id === gameId) ?? null;
  if (!game) return { game: null, all: [], top: [] };
  const lines = openSavedLines(access, saved), atoms = lineAtoms(lines, game);
  const refs = [...(game.tier2 || []), ...(game.watch || [])];
  for (const gate of ['spread', 'total', 'both']) {
    if (!gateOpen(access, gate)) continue;
    for (const ref of game.gatedCards?.[gate] || []) if (itemApplies(ref.card, ref.team || null, game, atoms, lines) === true) refs.push(ref);
  }
  const seen = new Set(), all = [];
  for (const ref of refs) {
    const card = shortCard(week, ref, { game, access, names });
    if (!card || seen.has(card.key)) continue;
    seen.add(card.key);
    all.push({ ...card, id: card.id ?? null });
  }
  all.sort((a, b) => a.strength[0] - b.strength[0] || a.strength[1] - b.strength[1] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { game, all, top: all.slice(0, 3) };
}

/**
 * At most three trend lines for the whole board (prototype C23): each game's strongest trend that needs no line, from
 * the "Consistent, not proven" tier or stronger, ordered by tier, then the most games in its record, then kickoff, then
 * game id. `eligible` limits it to the games the board still shows (not kicked off). One per game.
 */
export function boardTrends(week, { eligible = null, names = null, limit = 3 } = {}) {
  const ids = eligible ? new Set(eligible) : null, out = [];
  for (const game of week?.games || []) {
    if (ids && !ids.has(game.id)) continue;
    const best = (game.tier2 || []).map(ref => shortCard(week, ref, { game, access: null, names }))
      .filter(card => card && !card.locked && !card.gate && (card.tier === 1 || card.tier === 2)).sort(byStrength)[0];
    if (best?.shortLine) out.push({ gameId: game.id, kickoff: game.kickoff, card: best });
  }
  out.sort((a, b) => a.card.strength[0] - b.card.strength[0] || b.card.games - a.card.games || Date.parse(a.kickoff) - Date.parse(b.kickoff) || (a.gameId < b.gameId ? -1 : 1));
  return out.slice(0, limit).map(({ gameId, card }) => ({ gameId, text: card.shortLine, tier: BOARD_TIER_WORDS[card.tier], key: card.key }));
}

const ALL_GROUPS = Object.freeze([
  ['team', 'Team'], ['situational', 'Situational'], ['line', 'Line'], ['weather', 'Weather'], ['referee', 'Referee'],
]);
export const ALL_TRENDS_GROUPS = Object.freeze(ALL_GROUPS.map(([key, title]) => Object.freeze({ key, title })));

/**
 * Every trend the week file holds for one game, grouped for the All trends sheet: team (each team in its venue role,
 * the head coaches, the expected starting quarterbacks and the last meetings), situational (the cards that fit and
 * Sean's context families), line (records that need a line, locked with their market), weather (records that need
 * observed kickoff weather, and the indoor note) and referee (the assigned referee's records, or "not assigned").
 * Each item is a short card with its record and sample size, strongest first; a locked market shows one locked item and
 * no numbers. `referee` is refereeFor's answer; `forecastShown` says the kickoff wind forecast is on screen (D-34).
 */
export function allTrends(week, gameId, { access = null, saved = {}, names = null, referee = null, forecastShown = false } = {}) {
  const game = week?.games?.find(g => g.id === gameId) ?? null;
  if (!game) return { game: null, groups: [] };
  const lines = openSavedLines(access, saved), atoms = lineAtoms(lines, game);
  const make = ref => shortCard(week, ref, { game, access, names });
  const sorted = list => {
    const seen = new Set();
    return list.filter(card => card && !seen.has(card.key) && seen.add(card.key)).sort((a, b) => a.strength[0] - b.strength[0] || a.strength[1] - b.strength[1] || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  };
  const groups = Object.fromEntries(ALL_GROUPS.map(([key, title]) => [key, { key, title, items: [], notes: [], locks: [] }]));

  // Team: each team in its venue role, the head coaches, the starting quarterbacks (provisional) and the last meetings.
  const { teams = {}, coaches = {}, qbs = {}, h2h = [] } = game.entities || {};
  groups.team.items = sorted([
    ...Object.entries(teams).flatMap(([team, e]) => [make({ id: e.ats, team }), make({ id: e.ou }), make({ id: e.su, team })]),
    ...Object.entries(coaches).flatMap(([team, c]) => [make({ id: c.ats, team }), make({ id: c.ou })]),
    ...Object.entries(qbs).flatMap(([team, q]) => [make({ id: q.ats, team }), make({ id: q.ou })]),
  ]);
  if (Object.keys(qbs).length) groups.team.notes.push(week?.copy?.qbProvisional || 'Starting QBs for upcoming games are nflverse’s expected starters (provisional).');
  groups.team.meetings = h2h.map(m => ({ date: m.date, score: m.score, ats: m.ats === 'push' ? 'push against the spread' : m.ats ? `${m.ats} covered` : 'no line', ou: m.ou || 'no total' }));

  // Situational: the cards that fit this game, then Sean's context families (no proven edge).
  const firing = [...(game.tier2 || []), ...(game.watch || [])].map(make);
  const context = (game.context || []).filter(entry => entry.family !== 'referee' && entry.family !== 'weather')
    .flatMap(entry => [entry.lead?.ats, entry.lead?.ou, ...(entry.more || [])].filter(Boolean).map(parseItem).map(item => make(item)));
  groups.situational.items = sorted([...firing, ...context]);
  if (game.pending?.length || game.pendingCards?.length) {
    const who = game.pending?.length ? game.pending.join(' and ') : 'A team here';
    groups.situational.notes.push(`${who} ${game.pending?.length === 1 ? 'has' : 'have'} an earlier game without a final score, so ${game.pendingCards?.length || 'some'} trends that need it wait for that final.`);
  }

  // Line: the records and cards that need a line, locked with their market until it opens for this viewer.
  for (const gate of ['spread', 'total', 'both']) {
    const rows = (game.gated?.[gate] || []).map(parseItem), cards = game.gatedCards?.[gate] || [];
    const bands = Object.values(week?.bandTables?.[gate] || {}).flat();
    if (!rows.length && !cards.length && !bands.length) continue;
    if (!gateOpen(access, gate)) {
      for (const market of gate === 'both' ? ['spread', 'total'] : [gate]) if (!access?.[market] && !groups.line.locks.includes(market)) groups.line.locks.push(market);
      continue;
    }
    const known = gate === 'spread' ? finite(lines.spread) : gate === 'total' ? finite(lines.total) : finite(lines.spread) && finite(lines.total);
    const items = [];
    for (const item of rows) items.push({ ...make(item), fits: itemApplies(item.id, item.team, game, atoms, lines) });
    for (const ref of cards) {
      const fits = itemApplies(ref.card, ref.team || null, game, atoms, lines);
      if (fits !== false) items.push({ ...make(ref), fits });
    }
    // The band rows are the same for every game; only the band that holds the viewer's own saved line belongs here.
    if (known) for (const id of bands) if (itemApplies(id, null, game, atoms, lines) === true) items.push({ ...make({ id }), fits: true });
    groups.line.items.push(...items.filter(Boolean));
    if (!known) groups.line.notes.push(`Which ${gate === 'both' ? 'spread and total' : gate} records fit this game depends on your own saved line, which this screen does not have.`);
  }
  groups.line.items = sorted(groups.line.items);

  // Weather: records that need observed kickoff weather (never a top trend on an upcoming game), and the indoor note.
  const indoor = game.flags?.roof === 'dome' || game.flags?.roof === 'closed' || game.flags?.stadium?.type === 'dome' || game.flags?.stadium?.type === 'canopy';
  if (indoor) groups.weather.notes.push(WIND_COPY.indoor);
  groups.weather.items = sorted((game.conditional || []).map(c => {
    const card = make(c);
    if (!card || card.locked) return card;
    const note = c.note === 'roofConditional' ? (week?.copy?.roofConditional ? `${week.copy.roofConditional}.` : null) : windNote(week, c.note, forecastShown);
    return { ...card, notes: [...card.notes, note].filter(Boolean) };
  }));

  // Referee: the assignment's records (career, plus primetime, divisional and, with the Total open, the saved total's band).
  const name = referee?.name || null;
  if (!name) groups.referee.notes.push('Referee not assigned yet. Crews are announced during game week, and the commissioner enters them.');
  else if (!week?.referees?.[name]) groups.referee.notes.push(`No referee records for ${name} in this file.`);
  else {
    groups.referee.name = name;
    groups.referee.items = refereeRows(week, name, game, { total: lines.total }).map(row => {
      const card = make({ id: row.id });
      return card && !card.locked ? { ...card, title: `${name}: ${row.label.replace(/^Career: /, 'career ')}` } : card;
    }).filter(Boolean);
  }
  return { game, groups: ALL_GROUPS.map(([key]) => groups[key]) };
}
