// Fantasy defensive-matchup insights: what each defense plays and allows, and how each QB, RB, WR and TE has produced
// against each kind of defense. Built once per snapshot by the scheduled refresh from free nflverse releases (play-by-play
// and schedules under CC BY 4.0; FTN charting and 2023+ participation under CC BY-SA 4.0, "FTN Data via nflverse"), so
// a page view never calls a provider. Every number carries its kind: 'observed' (counted from charted or recorded plays
// of the stated period), 'estimate' (derived from related stats, or a prior season standing in for a season that has no
// charting yet; the basis says which) or 'unavailable' (neither exists). Raw counts are stored, not fantasy points, so
// the app scores them under the viewer's format. Snap counts (Pro Football Reference) and Next Gen Stats carry no reuse
// license and are not read. Upcoming-game spreads and totals are never read or stored here (D-57).
import { appCode } from './nfl-schedule.mjs';
import { normalizePlayerStats } from './fantasy-build.mjs';

export const DEFENSE_SCHEMA = 1;
export const DEFENSE_POSITIONS = Object.freeze(['QB', 'RB', 'WR', 'TE']);
/** Below these samples a value is shown with a small-sample flag. */
export const SMALL_SAMPLE = Object.freeze({ plays: 100, dropbacks: 60, targets: 15, carries: 20, games: 4 });
export const DEFENSE_METHOD = Object.freeze({
  name: 'GTL defensive matchups', version: '1.0',
  description: 'Coverage, front, play-volume and run-direction tendencies are counted from nflverse play-by-play, FTN charting and participation for the stated weeks. When the current season has no participation charting yet, the previous season\'s observed rate is shown as an estimate. Pressure without charting is estimated from sacks plus QB hits per dropback, which undercounts true pressure. Player splits add up recorded plays and games against each kind of defense in this and the previous season; small samples are flagged. These describe history; they are not a forecast or an expert grade.',
});
export const DEFENSE_LICENSES = Object.freeze({
  nflverse: { license: 'CC BY 4.0', licenseUrl: 'https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md', attribution: 'nflverse' },
  ftn: { license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', attribution: 'FTN Data via nflverse' },
});
/** Only these CSV columns are kept (the play-by-play file has about 370). */
export const DEFENSE_COLUMNS = Object.freeze({
  pbp: ['game_id', 'play_id', 'season_type', 'week', 'posteam', 'defteam', 'play_type', 'qb_dropback', 'qb_scramble', 'sack', 'qb_hit',
    'pass_location', 'air_yards', 'run_location', 'run_gap', 'receiver_player_id', 'rusher_player_id', 'passer_player_id', 'complete_pass',
    'passing_yards', 'receiving_yards', 'rushing_yards', 'pass_touchdown', 'rush_touchdown', 'interception', 'fumble_lost', 'fumbled_1_player_id',
    'yardline_100', 'wp', 'half_seconds_remaining', 'two_point_attempt', 'no_huddle'],
  ftn: ['nflverse_game_id', 'nflverse_play_id', 'week', 'n_defense_box', 'n_blitzers', 'n_pass_rushers'],
  participation: ['nflverse_game_id', 'play_id', 'defense_personnel', 'was_pressure', 'defense_man_zone_type', 'defense_coverage_type', 'offense_players'],
  stats: ['player_id', 'position', 'position_group', 'season', 'season_type', 'week', 'game_id', 'team', 'opponent_team', 'player_display_name', 'carries', 'targets',
    'target_share', 'air_yards_share', 'receiving_air_yards', 'attempts', 'passing_air_yards', 'passing_yards', 'passing_tds', 'passing_interceptions',
    'rushing_yards', 'rushing_tds', 'receptions', 'receiving_yards', 'receiving_tds', 'fumbles_lost_total', 'passing_2pt_conversions', 'rushing_2pt_conversions',
    'receiving_2pt_conversions', 'special_teams_tds', 'def_tackles_solo', 'def_tackle_assists', 'def_sacks', 'def_qb_hits',
    'def_pass_defended', 'def_interceptions'],
});

const blank = value => value == null || value === '' || value === 'NA';
const num = value => (blank(value) ? null : Number.isFinite(Number(value)) ? Number(value) : null);
const flag = value => value === '1' || value === 'TRUE' || value === 'true' || value === 1 || value === true;
const r4 = value => Math.round(value * 1e4) / 1e4;
const ratio = (a, b) => (b > 0 ? a / b : null);
const range = (weeks) => (weeks.length ? [Math.min(...weeks), Math.max(...weeks)] : null);

/**
 * CSV parser that keeps only the named columns (quotes, escaped quotes and quoted newlines handled). Missing required
 * columns throw; `NA` becomes ''. Fast enough for a season of play-by-play (about 50,000 rows).
 */
export function parseCsvColumns(text, columns, { optional = [] } = {}) {
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = []; let header = null, pick = null, row = [], cell = '', quoted = false, start = 0;
  const finishRow = () => {
    if (!header) {
      header = row;
      const missing = columns.filter(key => !header.includes(key) && !optional.includes(key));
      if (missing.length) throw new Error(`Missing CSV columns: ${missing.join(', ')}`);
      pick = columns.map(key => header.indexOf(key));
    } else if (row.length > 1 || row[0] !== '') {
      if (row.length !== header.length) throw new Error(`Malformed CSV row ${rows.length + 2}.`);
      const out = {};
      for (let i = 0; i < columns.length; i++) { const value = pick[i] < 0 ? '' : row[pick[i]]; out[columns[i]] = value === 'NA' ? '' : value; }
      rows.push(out);
    }
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    if (quoted) {
      if (ch === 34) {
        if (source.charCodeAt(i + 1) === 34) { cell += source.slice(start, i + 1); i++; start = i + 1; }
        else { cell += source.slice(start, i); quoted = false; start = i + 1; }
      }
      continue;
    }
    if (ch === 34) { cell += source.slice(start, i); quoted = true; start = i + 1; }
    else if (ch === 44 || ch === 10 || ch === 13) {
      row.push(cell + source.slice(start, i)); cell = '';
      if (ch === 13 && source.charCodeAt(i + 1) === 10) i++;
      start = i + 1;
      if (ch !== 44) finishRow();
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  if (start < source.length || cell || row.length) { row.push(cell + source.slice(start)); finishRow(); }
  if (!header) throw new Error('Missing CSV header.');
  return rows;
}

/** "3 CB, 2 DE, 2 DT, 1 FS, 1 MLB, 1 OLB, 1 SS" → defensive backs and down linemen. Null when unparseable. */
export function parsePersonnel(text) {
  if (blank(text)) return null;
  let dbs = 0, dl = 0, total = 0;
  for (const part of text.split(',')) {
    const match = /^\s*(\d+)\s+([A-Z]+)\s*$/.exec(part);
    if (!match) return null;
    const count = Number(match[1]), role = match[2];
    total += count;
    if (['CB', 'FS', 'SS', 'S', 'DB'].includes(role)) dbs += count;
    if (['DE', 'DT', 'NT', 'DL'].includes(role)) dl += count;
  }
  return total >= 9 && total <= 12 ? { dbs, dl } : null;
}

/** Regular-season scrimmage plays (no two-point tries, kneels, spikes or no-plays) before `beforeWeek`, when given. */
export function normalizePlays(rows, { season, beforeWeek = null }) {
  const out = [];
  for (const row of rows) {
    if (row.season_type && row.season_type !== 'REG') continue;
    const week = num(row.week);
    if (!Number.isInteger(week) || (beforeWeek !== null && week >= beforeWeek)) continue;
    if (!['pass', 'run'].includes(row.play_type) || flag(row.two_point_attempt) || blank(row.posteam) || blank(row.defteam)) continue;
    const dropback = flag(row.qb_dropback);
    out.push({
      season, week, game: row.game_id, key: `${row.game_id}|${Number(row.play_id)}`, off: appCode(row.posteam), def: appCode(row.defteam), dropback,
      designedRun: row.play_type === 'run' && !dropback && !flag(row.qb_scramble), sack: flag(row.sack), hit: flag(row.qb_hit),
      loc: ['left', 'middle', 'right'].includes(row.pass_location) ? row.pass_location : null, air: num(row.air_yards),
      runLoc: ['left', 'middle', 'right'].includes(row.run_location) ? row.run_location : null,
      gap: ['end', 'tackle', 'guard'].includes(row.run_gap) ? row.run_gap : null,
      receiver: row.receiver_player_id || null, rusher: row.rusher_player_id || null, passer: row.passer_player_id || null,
      complete: flag(row.complete_pass), passYards: num(row.passing_yards) ?? 0, recYards: num(row.receiving_yards) ?? 0, rushYards: num(row.rushing_yards) ?? 0,
      passTd: flag(row.pass_touchdown), rushTd: flag(row.rush_touchdown), int: flag(row.interception),
      fumbleBy: flag(row.fumble_lost) ? row.fumbled_1_player_id || null : null, redZone: (num(row.yardline_100) ?? 99) <= 20,
      neutral: (num(row.wp) ?? -1) >= 0.2 && (num(row.wp) ?? 2) <= 0.8 && (num(row.half_seconds_remaining) ?? 0) > 120, noHuddle: flag(row.no_huddle),
    });
  }
  return out;
}

/** FTN charting by play: box count, blitzers and rushers, each only when within 0–11. */
export function indexFtn(rows) {
  const out = new Map(), count = value => { const n = num(value); return Number.isInteger(n) && n >= 0 && n <= 11 ? n : null; };
  for (const row of rows) out.set(`${row.nflverse_game_id}|${Number(row.nflverse_play_id)}`, { box: count(row.n_defense_box), blitzers: count(row.n_blitzers), rushers: count(row.n_pass_rushers), week: num(row.week) });
  return out;
}

/** Participation by play: man/zone, coverage shell, pressure, personnel and the offensive players on the field. */
export function indexParticipation(rows) {
  const out = new Map();
  for (const row of rows) {
    const manZone = row.defense_man_zone_type === 'MAN_COVERAGE' ? 'man' : row.defense_man_zone_type === 'ZONE_COVERAGE' ? 'zone' : null;
    out.set(`${row.nflverse_game_id}|${Number(row.play_id)}`, {
      manZone, shell: blank(row.defense_coverage_type) ? null : row.defense_coverage_type,
      pressure: row.was_pressure === 'TRUE' ? true : row.was_pressure === 'FALSE' ? false : null,
      personnel: parsePersonnel(row.defense_personnel), offense: row.offense_players || '',
    });
  }
  return out;
}

// --- metrics -------------------------------------------------------------------------------------------------------

/** One displayed number with its kind, sample, unit, period and basis. A missing value is always 'unavailable'. */
export function metric(value, { kind, n = 0, unit, period = null, basis = null, smallBelow = null }) {
  if (value === null || value === undefined || !Number.isFinite(value) || n <= 0) return { value: null, kind: 'unavailable', n: 0, unit, period: null, basis };
  return { value: r4(value), kind, n, unit, period, basis, small: smallBelow !== null && n < smallBelow };
}
export const unavailable = (unit, basis) => ({ value: null, kind: 'unavailable', n: 0, unit, period: null, basis });

const periodText = (season, weeks, full) => (full ? `${season} season` : weeks ? (weeks[0] === weeks[1] ? `${season} Week ${weeks[0]}` : `${season} Weeks ${weeks[0]}–${weeks[1]}`) : `${season}`);
const recv = () => ({ n: 0, rec: 0, yds: 0, td: 0, fum: 0 });
const rush = () => ({ n: 0, yds: 0, td: 0, fum: 0 });
const pass = () => ({ n: 0, yds: 0, td: 0, int: 0, rushYds: 0, rushTd: 0, fum: 0 });
const addRecv = (acc, play, id) => { acc.n++; if (play.complete) acc.rec++; acc.yds += play.recYards; if (play.passTd && play.complete) acc.td++; if (play.fumbleBy === id) acc.fum++; };
const addRush = (acc, play, id) => { acc.n++; acc.yds += play.rushYards; if (play.rushTd) acc.td++; if (play.fumbleBy === id) acc.fum++; };
const addPass = (acc, play, id) => {
  acc.n++; acc.yds += play.passYards; if (play.passTd) acc.td++; if (play.int) acc.int++; if (play.fumbleBy === id) acc.fum++;
  if (play.rusher === id) { acc.rushYds += play.rushYards; if (play.rushTd) acc.rushTd++; }
};
const round = acc => Object.fromEntries(Object.entries(acc).map(([key, value]) => [key, typeof value === 'number' ? r4(value) : value]));

function defenseAccumulator() {
  return {
    games: new Set(), weeks: new Set(), plays: 0, dropbacks: 0, sackOrHit: 0, ftnDropbacks: 0, blitz: 0, ftnRuns: 0, boxSum: 0, heavyBox: 0, ftnWeeks: new Set(),
    coverage: 0, man: 0, shells: {}, pressureN: 0, pressure: 0, personnelN: 0, nickel: 0, dime: 0, lightFront: 0, partWeeks: new Set(),
    runs: rush(), runLoc: { left: rush(), middle: rush(), right: rush() }, runGap: { end: rush(), tackle: rush(), guard: rush() },
    targets: { WR: recv(), TE: recv(), RB: recv() }, wrLoc: { outside: recv(), middle: recv() },
  };
}
function offenseAccumulator() { return { games: new Set(), plays: 0, neutral: 0, neutralDropbacks: 0, noHuddle: 0, dropbacks: 0 }; }

/** One season's per-team tallies from play-by-play joined to FTN charting and participation where each exists. */
export function tallyTeams(plays, { ftn = null, participation = null, positionOf = () => null }) {
  const defense = new Map(), offense = new Map();
  const of = (map, team, make) => { if (!map.has(team)) map.set(team, make()); return map.get(team); };
  for (const play of plays) {
    const d = of(defense, play.def, defenseAccumulator), o = of(offense, play.off, offenseAccumulator);
    d.games.add(play.game); d.weeks.add(play.week); d.plays++; o.games.add(play.game); o.plays++;
    if (play.noHuddle) o.noHuddle++;
    if (play.neutral) { o.neutral++; if (play.dropback) o.neutralDropbacks++; }
    const chart = ftn?.get(play.key), part = participation?.get(play.key);
    if (chart) d.ftnWeeks.add(play.week);
    if (part) d.partWeeks.add(play.week);
    if (part?.personnel) { d.personnelN++; if (part.personnel.dbs === 5) d.nickel++; if (part.personnel.dbs >= 6) d.dime++; if (part.personnel.dl <= 3) d.lightFront++; }
    if (play.dropback) {
      d.dropbacks++; o.dropbacks++; if (play.sack || play.hit) d.sackOrHit++;
      if (chart?.blitzers != null) { d.ftnDropbacks++; if (chart.blitzers > 0) d.blitz++; }
      if (part?.manZone) { d.coverage++; if (part.manZone === 'man') d.man++; }
      if (part?.shell) d.shells[part.shell] = (d.shells[part.shell] ?? 0) + 1;
      if (part?.pressure != null) { d.pressureN++; if (part.pressure) d.pressure++; }
      if (play.receiver) {
        const position = positionOf(play.receiver);
        if (d.targets[position]) addRecv(d.targets[position], play, play.receiver);
        if (position === 'WR' && play.loc) addRecv(d.wrLoc[play.loc === 'middle' ? 'middle' : 'outside'], play, play.receiver);
      }
    }
    if (play.designedRun) {
      addRush(d.runs, play, play.rusher);
      if (play.runLoc) addRush(d.runLoc[play.runLoc], play, play.rusher);
      if (play.gap) addRush(d.runGap[play.gap], play, play.rusher);
      if (chart?.box != null) { d.ftnRuns++; d.boxSum += chart.box; if (chart.box >= 8) d.heavyBox++; }
    }
  }
  return { defense, offense };
}

/** Ranks 1 = highest value among teams with a value; equal values (to 4 places) share a rank. */
export function rankTeams(values) {
  const known = [...values].filter(([, value]) => value !== null && Number.isFinite(value)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out = new Map(); let previous = null, current = 0;
  known.forEach(([team, value], index) => { const shown = r4(value); if (shown !== previous) current = index + 1; out.set(team, current); previous = shown; });
  return { ranks: out, of: known.length };
}

/**
 * The displayed rate for one tendency: the current season's observed rate when its charting exists, else the prior
 * season's observed rate as an estimate, else unavailable. `pick` reads [count, sample, weeks] from one accumulator.
 */
function seasonalRate({ current, prior, season, pick, smallBelow, basisCurrent, basisPrior, basisNone, priorFull = true, currentFull = false, kind = 'observed' }) {
  const now = current ? pick(current) : null;
  if (now && now[1] > 0) return metric(ratio(now[0], now[1]), { kind, n: now[1], unit: 'rate', period: periodText(season, range([...now[2]]), currentFull), basis: basisCurrent, smallBelow });
  const before = prior ? pick(prior) : null;
  if (before && before[1] > 0) return metric(ratio(before[0], before[1]), { kind: 'estimate', n: before[1], unit: 'rate', period: periodText(season - 1, range([...before[2]]), priorFull), basis: basisPrior, smallBelow });
  return unavailable('rate', basisNone);
}

function buildTeamProfiles({ season, week, current, prior, injuries, defensiveRoles }) {
  const teams = [...new Set([...current.defense.keys(), ...current.offense.keys()])].sort();
  const profiles = {};
  for (const team of teams) {
    const d = current.defense.get(team), p = prior?.defense.get(team) ?? null, o = current.offense.get(team), po = prior?.offense.get(team) ?? null;
    const weeks = range([...(d?.weeks ?? [])]), period = periodText(season, weeks, false), games = d?.games.size ?? 0;
    const runRow = acc => metric(ratio(acc.yds, acc.n), { kind: 'observed', n: acc.n, unit: 'yards per carry', period, smallBelow: SMALL_SAMPLE.carries });
    const shells = (acc, year, full, kind, basis) => {
      const total = Object.values(acc.shells).reduce((s, n) => s + n, 0);
      return total ? Object.entries(acc.shells).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([shell, n]) => ({ shell, ...metric(n / total, { kind, n: total, unit: 'rate', period: periodText(year, range([...acc.partWeeks]), full), basis, smallBelow: SMALL_SAMPLE.dropbacks }) })) : [];
    };
    const currentShells = d?.coverage ? shells(d, season, false, 'observed', 'Participation charting, this season') : [];
    const lightFront = seasonalRate({ current: d, prior: p, season, smallBelow: SMALL_SAMPLE.plays, kind: 'estimate', pick: acc => [acc.lightFront, acc.personnelN, acc.partWeeks],
      basisCurrent: 'Share of snaps with three or fewer down linemen listed (odd, 3-4 style front); position labels come from rosters', basisPrior: 'Previous season: share of snaps with three or fewer down linemen listed (odd, 3-4 style front)',
      basisNone: 'Needs participation charting, which is not published for this season or the previous one' });
    profiles[team] = {
      games, weeks,
      coverage: {
        man: seasonalRate({ current: d, prior: p, season, smallBelow: SMALL_SAMPLE.dropbacks, pick: acc => [acc.man, acc.coverage, acc.partWeeks],
          basisCurrent: 'Man coverage share of charted dropbacks (FTN participation)', basisPrior: `${season} participation charting is not published until after the season; the ${season - 1} observed rate stands in`,
          basisNone: 'No participation charting for this season or the previous one' }),
        shells: currentShells.length ? currentShells : p?.coverage ? shells(p, season - 1, true, 'estimate', `${season - 1} observed shells stand in for ${season}`) : [],
        blitz: seasonalRate({ current: d, prior: p, season, smallBelow: SMALL_SAMPLE.dropbacks, pick: acc => [acc.blitz, acc.ftnDropbacks, acc.ftnWeeks],
          basisCurrent: 'Dropbacks with at least one blitzer (FTN charting)', basisPrior: `No ${season} FTN charting yet; the ${season - 1} observed rate stands in`, basisNone: 'No FTN charting for this season or the previous one' }),
        pressure: d?.pressureN ? metric(ratio(d.pressure, d.pressureN), { kind: 'observed', n: d.pressureN, unit: 'rate', period: periodText(season, range([...d.partWeeks]), false), basis: 'Pressured dropbacks (participation charting)', smallBelow: SMALL_SAMPLE.dropbacks })
          : metric(ratio(d?.sackOrHit ?? 0, d?.dropbacks ?? 0), { kind: 'estimate', n: d?.dropbacks ?? 0, unit: 'rate', period, basis: 'Sacks plus QB hits per dropback from play-by-play; charted pressure is not published for this season and runs higher', smallBelow: SMALL_SAMPLE.dropbacks }),
        pressurePrior: p?.pressureN ? metric(ratio(p.pressure, p.pressureN), { kind: 'observed', n: p.pressureN, unit: 'rate', period: periodText(season - 1, range([...p.partWeeks]), true), basis: 'Pressured dropbacks (participation charting), previous season', smallBelow: SMALL_SAMPLE.dropbacks }) : unavailable('rate', 'No previous-season participation charting'),
      },
      front: {
        lightFront,
        base: lightFront.value === null ? null : lightFront.value >= 0.5 ? '3-4' : '4-3',
        nickel: seasonalRate({ current: d, prior: p, season, smallBelow: SMALL_SAMPLE.plays, pick: acc => [acc.nickel, acc.personnelN, acc.partWeeks],
          basisCurrent: 'Snaps with five defensive backs (participation)', basisPrior: `No ${season} participation charting yet; the ${season - 1} observed rate stands in`, basisNone: 'No participation charting for this season or the previous one' }),
        dime: seasonalRate({ current: d, prior: p, season, smallBelow: SMALL_SAMPLE.plays, pick: acc => [acc.dime, acc.personnelN, acc.partWeeks],
          basisCurrent: 'Snaps with six or more defensive backs (participation)', basisPrior: `No ${season} participation charting yet; the ${season - 1} observed rate stands in`, basisNone: 'No participation charting for this season or the previous one' }),
        box: seasonalRate({ current: d, prior: p, season, smallBelow: SMALL_SAMPLE.carries, pick: acc => [acc.heavyBox, acc.ftnRuns, acc.ftnWeeks],
          basisCurrent: 'Designed runs into a box of eight or more (FTN charting)', basisPrior: `No ${season} FTN charting yet; the ${season - 1} observed rate stands in`, basisNone: 'No FTN charting for this season or the previous one' }),
        runs: d ? runRow(d.runs) : unavailable('yards per carry', 'No designed runs recorded'),
        runLoc: Object.fromEntries(['left', 'middle', 'right'].map(key => [key, d ? { ...runRow(d.runLoc[key]), raw: round(d.runLoc[key]) } : unavailable('yards per carry', 'No designed runs recorded')])),
        runGap: Object.fromEntries(['end', 'tackle', 'guard'].map(key => [key, d ? { ...runRow(d.runGap[key]), raw: round(d.runGap[key]) } : unavailable('yards per carry', 'No designed runs recorded')])),
      },
      allowed: d ? {
        period,
        WR: round(d.targets.WR), TE: round(d.targets.TE), RB: round(d.targets.RB),
        wrOutside: round(d.wrLoc.outside), wrMiddle: round(d.wrLoc.middle), rushing: round(d.runs),
      } : null,
      pace: {
        playsFaced: metric(ratio(d?.plays ?? 0, games), { kind: 'observed', n: games, unit: 'plays per game', period, smallBelow: SMALL_SAMPLE.games }),
        offensePlays: metric(ratio(o?.plays ?? 0, o?.games.size ?? 0), { kind: 'observed', n: o?.games.size ?? 0, unit: 'plays per game', period, smallBelow: SMALL_SAMPLE.games }),
        neutralPassRate: metric(ratio(o?.neutralDropbacks ?? 0, o?.neutral ?? 0), { kind: 'observed', n: o?.neutral ?? 0, unit: 'rate', period, basis: 'Dropbacks on plays with win probability 20–80% outside the last two minutes of each half', smallBelow: SMALL_SAMPLE.plays }),
        noHuddle: metric(ratio(o?.noHuddle ?? 0, o?.plays ?? 0), { kind: 'observed', n: o?.plays ?? 0, unit: 'rate', period, smallBelow: SMALL_SAMPLE.plays }),
        priorOffensePlays: po ? metric(ratio(po.plays, po.games.size), { kind: 'observed', n: po.games.size, unit: 'plays per game', period: `${season - 1} season`, smallBelow: SMALL_SAMPLE.games }) : unavailable('plays per game', 'No previous-season games'),
      },
      injuries: defensiveInjuries({ team, season, week, injuries, roles: defensiveRoles.get(team) }),
    };
  }
  // League ranks and averages for the rate metrics the explanations use.
  const paths = [['coverage', 'man'], ['coverage', 'blitz'], ['coverage', 'pressure'], ['front', 'nickel'], ['front', 'dime'], ['front', 'box'], ['front', 'runs'],
    ['pace', 'playsFaced'], ['pace', 'offensePlays'], ['pace', 'neutralPassRate'], ['front', 'lightFront']];
  const league = {};
  for (const [group, key] of paths) {
    // Only rank like with like: an estimate is ranked among values of the same kind and basis family.
    const values = new Map(teams.map(team => [team, profiles[team][group][key].value]));
    const { ranks, of } = rankTeams(values);
    for (const team of teams) { const m = profiles[team][group][key]; if (m.value !== null) { m.rank = ranks.get(team); m.of = of; } }
    const known = [...values.values()].filter(value => value !== null);
    (league[group] ??= {})[key] = known.length ? r4(known.reduce((s, v) => s + v, 0) / known.length) : null;
  }
  for (const key of ['left', 'middle', 'right']) {
    const values = new Map(teams.map(team => [team, profiles[team].front.runLoc[key].value]));
    const { ranks, of } = rankTeams(values);
    for (const team of teams) { const m = profiles[team].front.runLoc[key]; if (m.value !== null) { m.rank = ranks.get(team); m.of = of; } }
  }
  const sumRaw = key => teams.reduce((acc, team) => { const raw = profiles[team].allowed?.[key]; if (raw) for (const [k, v] of Object.entries(raw)) acc[k] = r4((acc[k] ?? 0) + v); return acc; }, {});
  league.allowed = Object.fromEntries(['WR', 'TE', 'RB', 'wrOutside', 'wrMiddle', 'rushing'].map(key => [key, sumRaw(key)]));
  league.runLoc = Object.fromEntries(['left', 'middle', 'right'].map(key => {
    const raw = teams.reduce((acc, team) => { const r = profiles[team].front.runLoc[key].raw; if (r) { acc.n += r.n; acc.yds += r.yds; } return acc; }, { n: 0, yds: 0 });
    return [key, raw.n ? r4(raw.yds / raw.n) : null];
  }));
  return { profiles, league };
}

const DEFENSIVE_GROUP = { CB: 'CB', S: 'S', FS: 'S', SS: 'S', DB: 'S', DE: 'EDGE', OLB: 'EDGE', EDGE: 'EDGE', DT: 'IDL', NT: 'IDL', DL: 'IDL', LB: 'LB', ILB: 'LB', MLB: 'LB' };

/**
 * Each defense's per-player roles this season from recorded defensive statistics (an estimate of who plays a lot): games
 * with a stat line, combined tackles and disruptive plays (sacks, QB hits, passes defensed, interceptions) per game.
 */
export function defensiveRolesFrom(statsRows, { season, beforeWeek }) {
  const teams = new Map(), teamGames = new Map();
  for (const row of statsRows) {
    if (Number(row.season) !== season || row.season_type !== 'REG' || !(Number(row.week) < beforeWeek)) continue;
    const team = appCode(row.team);
    if (!teamGames.has(team)) teamGames.set(team, new Set());
    teamGames.get(team).add(row.game_id);
    if (!['DB', 'DL', 'LB'].includes(row.position_group)) continue;
    if (!teams.has(team)) teams.set(team, new Map());
    const players = teams.get(team), id = row.player_id;
    if (!players.has(id)) players.set(id, { games: 0, tackles: 0, disruptive: 0 });
    const p = players.get(id);
    p.games++; p.tackles += (num(row.def_tackles_solo) ?? 0) + (num(row.def_tackle_assists) ?? 0);
    p.disruptive += (num(row.def_sacks) ?? 0) + (num(row.def_qb_hits) ?? 0) + (num(row.def_pass_defended) ?? 0) + (num(row.def_interceptions) ?? 0);
  }
  const out = new Map();
  for (const [team, players] of teams) {
    const total = teamGames.get(team)?.size ?? 0, roles = new Map();
    for (const [id, p] of players) {
      const share = total ? p.games / total : 0, tackles = p.games ? p.tackles / p.games : 0, disruptive = p.games ? p.disruptive / p.games : 0;
      const role = share >= 0.6 && (tackles >= 2 || disruptive >= 0.4) ? 'regular' : share >= 0.3 ? 'rotational' : 'limited';
      roles.set(id, { role, games: p.games, teamGames: total, tackles: r4(tackles), disruptive: r4(disruptive) });
    }
    out.set(team, roles);
  }
  return out;
}

/** The defense's reported Out, Doubtful and Questionable players for the selected week, with an estimated role. */
export function defensiveInjuries({ team, season, week, injuries, roles }) {
  return (injuries ?? []).filter(row => Number(row.season) === season && Number(row.week) === week && (row.season_type || row.game_type) === 'REG'
    && appCode(row.team) === team && DEFENSIVE_GROUP[row.position] && ['Out', 'Doubtful', 'Questionable'].includes(row.report_status))
    .map(row => {
      const role = roles?.get(row.gsis_id) ?? null;
      return { id: row.gsis_id, name: row.full_name, position: row.position, group: DEFENSIVE_GROUP[row.position], status: row.report_status,
        injury: row.report_primary_injury || null, role: role?.role ?? 'unknown', games: role?.games ?? 0, teamGames: role?.teamGames ?? 0,
        tackles: role?.tackles ?? null, disruptive: role?.disruptive ?? null };
    })
    .sort((a, b) => ['Out', 'Doubtful', 'Questionable'].indexOf(a.status) - ['Out', 'Doubtful', 'Questionable'].indexOf(b.status) || a.name.localeCompare(b.name));
}

// --- player splits -------------------------------------------------------------------------------------------------

/** Game-level split buckets store [games, ...sums in GAME_STATS order] to keep the published file small. */
export const GAME_STATS = Object.freeze(['passingYards', 'passingTds', 'interceptions', 'rushingYards', 'rushingTds', 'receptions', 'receivingYards', 'receivingTds', 'fumblesLost', 'twoPointConversions', 'specialTeamsTds']);
const gameBucket = () => new Array(GAME_STATS.length + 1).fill(0);
const addGame = (bucket, stats) => {
  if (GAME_STATS.some(key => !Number.isFinite(stats[key]))) return;
  bucket[0]++; GAME_STATS.forEach((key, i) => { bucket[i + 1] = r4(bucket[i + 1] + stats[key]); });
};
/** A player metric without the repeated unit, period and basis (PLAYER_METRICS supplies them in the app). */
const compact = m => (m.kind === 'unavailable' ? { value: null, kind: 'unavailable', n: 0 } : { value: m.value, kind: m.kind, n: m.n, small: m.small, ...(m.season ? { season: m.season } : {}) });
/** Unit and basis of each player usage metric, by kind. */
export const PLAYER_METRICS = Object.freeze({
  snapShare: { unit: 'rate', unavailable: 'Snap counts come only from Pro Football Reference via nflverse, which carries no reuse license; not used.' },
  routeRate: { unit: 'rate', observed: 'Share of team dropbacks he was on the field for in his games (participation charting), a route-rate proxy.',
    estimate: 'This season has no participation charting yet; his previous-season share of team dropbacks on the field stands in.',
    unavailable: 'Route participation needs participation charting; none is published for this season or the previous one.' },
  middleShare: { unit: 'rate', estimate: 'Share of his targets thrown to the middle of the field: a slot-role proxy. Alignment itself is not charted in free data.', unavailable: 'No targets with a recorded pass location.' },
  deepShare: { unit: 'rate', observed: 'Share of his targets 20+ air yards downfield.', unavailable: 'No targets with recorded air yards.' },
  adot: { unit: 'air yards per target', observed: 'Average air yards per target.', unavailable: 'No targets with recorded air yards.' },
});
/** Columns of usage.games rows. */
export const USAGE_GAME_KEYS = Object.freeze(['week', 'targetShare', 'airYardsShare', 'airYards', 'carryShare', 'redZone', 'attempts']);

/**
 * Every QB, RB, WR and TE in the snapshot: play-level splits by coverage (man/zone, from participation seasons), blitz
 * (FTN), pressure (QBs, participation), box count and run direction (RBs), game-level splits by roof, surface and opposing
 * defense style, and this season's usage trend.
 */
function buildPlayerInsights({ season, week, players, seasons, teamStyles, schedule, statsBySeason }) {
  const gameInfo = new Map();
  for (const row of schedule) if ([season, season - 1].includes(Number(row.season)) && row.game_type === 'REG') gameInfo.set(row.game_id, row);
  // Plays by player role, and team dropbacks by game and offense, across the seasons read.
  const byReceiver = new Map(), byRusher = new Map(), byPasser = new Map(), teamDropbacks = new Map();
  const push = (map, key, value) => { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
  for (const data of seasons) for (const play of data.plays) {
    const entry = { play, data };
    if (play.dropback) { push(byPasser, play.passer, entry); if (play.receiver) push(byReceiver, play.receiver, entry); push(teamDropbacks, `${play.game}|${play.off}`, entry); }
    if (play.designedRun) push(byRusher, play.rusher, entry);
  }
  const teamCarries = new Map(), playerGames = new Map();
  for (const row of statsBySeason.get(season) ?? []) {
    if (Number(row.season) !== season || row.season_type !== 'REG') continue;
    const key = `${row.game_id}|${appCode(row.team)}`;
    teamCarries.set(key, (teamCarries.get(key) ?? 0) + (num(row.carries) ?? 0));
  }
  for (const [year, rows] of statsBySeason) for (const row of rows) {
    if (Number(row.season) !== year || row.season_type !== 'REG') continue;
    const key = `${year}|${row.player_id}`;
    if (!playerGames.has(key)) playerGames.set(key, new Set());
    playerGames.get(key).add(`${row.game_id}|${appCode(row.team)}`);
  }
  const statRows = new Map();
  for (const [year, rows] of statsBySeason) for (const row of rows) {
    if (Number(row.season) !== year || row.season_type !== 'REG' || (year === season && !(Number(row.week) < week))) continue;
    push(statRows, row.player_id, { year, row });
  }
  const out = {};
  for (const player of players) {
    if (!DEFENSE_POSITIONS.includes(player.position)) continue;
    const id = player.id, rows = statRows.get(id) ?? [];
    if (!rows.length) continue;
    const coverage = { man: player.position === 'QB' ? pass() : recv(), zone: player.position === 'QB' ? pass() : recv() };
    const onField = { man: 0, zone: 0 }, blitzTargets = { blitz: recv(), none: recv() }, blitzTeam = { blitz: 0, none: 0 };
    const qbBlitz = { blitz: pass(), none: pass() }, pressure = { pressured: pass(), clean: pass() };
    const box = { light: rush(), base: rush(), heavy: rush() }, runLoc = { left: rush(), middle: rush(), right: rush() };
    const covSeasons = new Set(), ftnSeasons = new Set(), pressureSeasons = new Set(), playSeasons = new Set();
    const games = new Set(rows.map(item => item.row.game_id));
    if (player.position === 'QB') {
      for (const { play, data } of byPasser.get(id) ?? []) {
        playSeasons.add(data.season);
        const part = data.participation?.get(play.key), chart = data.ftn?.get(play.key);
        if (part?.manZone) { addPass(coverage[part.manZone], play, id); covSeasons.add(data.season); }
        if (part?.pressure != null) { addPass(pressure[part.pressure ? 'pressured' : 'clean'], play, id); pressureSeasons.add(data.season); }
        if (chart?.blitzers != null) { addPass(qbBlitz[chart.blitzers > 0 ? 'blitz' : 'none'], play, id); ftnSeasons.add(data.season); }
      }
    } else {
      // Team dropbacks in this player's own games: on-field dropbacks by coverage, and team targets by blitz.
      for (const { row } of rows) {
        for (const { play, data } of teamDropbacks.get(`${row.game_id}|${appCode(row.team)}`) ?? []) {
          const part = data.participation?.get(play.key), chart = data.ftn?.get(play.key);
          if (part?.manZone && part.offense.includes(id)) { onField[part.manZone]++; covSeasons.add(data.season); }
          if (chart?.blitzers != null && play.receiver) { blitzTeam[chart.blitzers > 0 ? 'blitz' : 'none']++; ftnSeasons.add(data.season); }
        }
      }
      for (const { play, data } of byReceiver.get(id) ?? []) {
        playSeasons.add(data.season);
        const part = data.participation?.get(play.key), chart = data.ftn?.get(play.key);
        if (part?.manZone) addRecv(coverage[part.manZone], play, id);
        if (chart?.blitzers != null) addRecv(blitzTargets[chart.blitzers > 0 ? 'blitz' : 'none'], play, id);
      }
    }
    for (const { play, data } of byRusher.get(id) ?? []) {
      playSeasons.add(data.season);
      if (play.runLoc) addRush(runLoc[play.runLoc], play, id);
      const chart = data.ftn?.get(play.key);
      if (chart?.box != null) addRush(box[chart.box <= 6 ? 'light' : chart.box >= 8 ? 'heavy' : 'base'], play, id);
    }
    // Game-level splits.
    const env = { indoor: gameBucket(), outdoor: gameBucket(), grass: gameBucket(), turf: gameBucket() };
    const style = { manHeavy: gameBucket(), zoneHeavy: gameBucket(), blitzHeavy: gameBucket(), blitzLight: gameBucket(), odd: gameBucket(), even: gameBucket() };
    const styleKinds = { coverage: new Set(), blitz: new Set(), front: new Set() };
    for (const { year, row } of rows) {
      const stats = normalizePlayerStats(row), info = gameInfo.get(row.game_id), opponent = teamStyles.get(year)?.get(appCode(row.opponent_team));
      if (info?.roof) addGame(['dome', 'closed'].includes(info.roof) ? env.indoor : env.outdoor, stats);
      if (info?.surface) addGame(info.surface === 'grass' ? env.grass : env.turf, stats);
      if (opponent?.man) { addGame(opponent.man.heavy ? style.manHeavy : style.zoneHeavy, stats); styleKinds.coverage.add(opponent.man.kind); }
      if (opponent?.blitz) { addGame(opponent.blitz.heavy ? style.blitzHeavy : style.blitzLight, stats); styleKinds.blitz.add(opponent.blitz.kind); }
      if (opponent?.front) { addGame(opponent.front.odd ? style.odd : style.even, stats); styleKinds.front.add('estimate'); }
    }
    const kindOf = set => (set.size === 0 ? 'unavailable' : set.has('estimate') ? 'estimate' : 'observed');
    const label = set => [...set].sort().join(' and ');
    out[id] = {
      seasons: label(playSeasons) || null,
      coverage: covSeasons.size ? { kind: 'observed', seasons: label(covSeasons), man: round(coverage.man), zone: round(coverage.zone), onField: player.position === 'QB' ? null : onField } : null,
      blitz: ftnSeasons.size ? { kind: 'observed', seasons: label(ftnSeasons), ...(player.position === 'QB' ? { blitz: round(qbBlitz.blitz), none: round(qbBlitz.none) } : { blitz: round(blitzTargets.blitz), none: round(blitzTargets.none), teamTargets: blitzTeam }) } : null,
      pressure: player.position === 'QB' && pressureSeasons.size ? { kind: 'observed', seasons: label(pressureSeasons), pressured: round(pressure.pressured), clean: round(pressure.clean) } : null,
      box: player.position === 'RB' && box.light.n + box.base.n + box.heavy.n > 0 ? { kind: 'observed', light: round(box.light), base: round(box.base), heavy: round(box.heavy) } : null,
      runLoc: runLoc.left.n + runLoc.middle.n + runLoc.right.n > 0 ? { kind: 'observed', left: round(runLoc.left), middle: round(runLoc.middle), right: round(runLoc.right) } : null,
      environment: { kind: 'observed', games: games.size, ...env },
      style: { ...style, kinds: { coverage: kindOf(styleKinds.coverage), blitz: kindOf(styleKinds.blitz), front: kindOf(styleKinds.front) } },
      usage: usageTrend({ player, season, week, rows: rows.filter(item => item.year === season).map(item => item.row),
        plays: [...(byReceiver.get(id) ?? []), ...(byRusher.get(id) ?? [])].filter(item => item.data.season === season).map(item => item.play), teamCarries,
        routeRate: player.position === 'QB' ? null : routeRateFor({ id, season, seasons, teamDropbacks, playerGames }) }),
    };
  }
  return out;
}

/**
 * This season's usage by game, and the season and last-three-game averages, each with its own sample. `plays` are this
 * player's own targets and designed carries this season; `teamCarries` maps "game|team" to the team's carries.
 */
export function usageTrend({ player, season, week, rows, plays = [], teamCarries = new Map(), routeRate = null }) {
  const id = player.id, byGame = new Map(rows.map(row => [row.game_id, row]));
  const redZone = new Map(), middle = { n: 0, of: 0 }, deep = { n: 0, of: 0 }, air = { sum: 0, n: 0 };
  for (const play of plays) {
    if (!byGame.has(play.game) || play.week >= week) continue;
    const target = play.dropback && play.receiver === id, carry = play.designedRun && play.rusher === id;
    if ((target || carry) && play.redZone) redZone.set(play.game, (redZone.get(play.game) ?? 0) + 1);
    if (target && play.loc) { middle.of++; if (play.loc === 'middle') middle.n++; }
    if (target && play.air !== null) { deep.of++; if (play.air >= 20) deep.n++; air.sum += play.air; air.n++; }
  }
  const games = [...byGame.values()].sort((a, b) => Number(a.week) - Number(b.week)).map(row => {
    const carries = num(row.carries), team = teamCarries.get(`${row.game_id}|${appCode(row.team)}`) ?? null;
    const share = value => (num(value) === null ? null : r4(num(value)));
    return { week: Number(row.week), targetShare: share(row.target_share), airYardsShare: share(row.air_yards_share), airYards: num(row.receiving_air_yards),
      carryShare: carries !== null && team ? r4(carries / team) : null, redZone: redZone.get(row.game_id) ?? 0,
      attempts: player.position === 'QB' ? num(row.attempts) : null };
  });
  const weeks = range(games.map(game => game.week)), period = periodText(season, weeks, false);
  return {
    period, games: games.map(game => USAGE_GAME_KEYS.map(key => game[key])),
    snapShare: { value: null, kind: 'unavailable', n: 0 },
    routeRate: routeRate ? compact(routeRate) : { value: null, kind: 'unavailable', n: 0 },
    middleShare: compact(metric(ratio(middle.n, middle.of), { kind: 'estimate', n: middle.of, unit: 'rate', period, smallBelow: SMALL_SAMPLE.targets })),
    deepShare: compact(metric(ratio(deep.n, deep.of), { kind: 'observed', n: deep.of, unit: 'rate', period, smallBelow: SMALL_SAMPLE.targets })),
    adot: compact(metric(ratio(air.sum, air.n), { kind: 'observed', n: air.n, unit: 'air yards per target', period, smallBelow: SMALL_SAMPLE.targets })),
  };
}

/**
 * On-field share of team dropbacks in the player's own games: this season's participation when published (observed),
 * else the previous season's (an estimate for this season), else unavailable. Not computed for quarterbacks.
 */
export function routeRateFor({ id, season, seasons, teamDropbacks, playerGames }) {
  for (const data of [seasons.find(item => item.season === season), seasons.find(item => item.season === season - 1)]) {
    if (!data?.participation) continue;
    const kind = data.season === season ? 'observed' : 'estimate';
    let on = 0, of = 0;
    for (const key of playerGames.get(`${data.season}|${id}`) ?? []) for (const { play } of teamDropbacks.get(key) ?? []) {
      const part = data.participation.get(play.key);
      if (part) { of++; if (part.offense.includes(id)) on++; }
    }
    if (of > 0) return { ...metric(on / of, { kind, n: of, unit: 'rate', period: `${data.season}`, smallBelow: SMALL_SAMPLE.dropbacks }), season: data.season };
  }
  return null;
}

/** Each defense's style per season, for game-level splits: man-heavy, blitz-heavy and odd-front flags against the median. */
function styleBySeason({ season, tallies }) {
  const out = new Map();
  const median = values => { const sorted = values.filter(v => v !== null).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
  const rates = (tally, pick) => new Map([...tally.defense].map(([team, acc]) => { const [a, b] = pick(acc); return [team, b >= SMALL_SAMPLE.dropbacks ? a / b : null]; }));
  const current = tallies.get(season), prior = tallies.get(season - 1);
  for (const [year, tally] of [[season, current], [season - 1, prior]]) {
    if (!tally) continue;
    const fallback = year === season ? prior : null;
    const man = rates(tally, acc => [acc.man, acc.coverage]), blitz = rates(tally, acc => [acc.blitz, acc.ftnDropbacks]), odd = rates(tally, acc => [acc.lightFront, acc.personnelN]);
    const manFallback = fallback ? rates(fallback, acc => [acc.man, acc.coverage]) : new Map(), oddFallback = fallback ? rates(fallback, acc => [acc.lightFront, acc.personnelN]) : new Map();
    const blitzFallback = fallback ? rates(fallback, acc => [acc.blitz, acc.ftnDropbacks]) : new Map();
    const pick = (own, back) => { const known = [...own.values()].some(v => v !== null); return known ? { map: own, kind: 'observed' } : { map: back, kind: 'estimate' }; };
    const m = pick(man, manFallback), b = pick(blitz, blitzFallback), f = pick(odd, oddFallback);
    const mMed = median([...m.map.values()]), bMed = median([...b.map.values()]);
    const teams = new Map();
    for (const team of tally.defense.keys()) {
      const mv = m.map.get(team) ?? null, bv = b.map.get(team) ?? null, fv = f.map.get(team) ?? null;
      teams.set(team, { man: mv !== null && mMed !== null ? { heavy: mv > mMed, kind: m.kind } : null, blitz: bv !== null && bMed !== null ? { heavy: bv > bMed, kind: b.kind } : null, front: fv !== null ? { odd: fv >= 0.5 } : null });
    }
    out.set(year, teams);
  }
  return out;
}

/**
 * League pass-rate shift per point of the team's closing spread (positive = underdog), from completed games' archived
 * schedule lines. One coefficient, for the app's labelled expected pass rate; no upcoming line is read here.
 */
export function passRateBySpread({ seasons, schedule, beforeWeek, season }) {
  const lines = new Map();
  for (const row of schedule) {
    if (row.game_type !== 'REG' || blank(row.spread_line) || blank(row.home_score)) continue;
    if (Number(row.season) === season && !(Number(row.week) < beforeWeek)) continue;
    lines.set(row.game_id, { home: appCode(row.home_team), spread: Number(row.spread_line) });
  }
  const games = new Map(), neutral = new Map();
  for (const data of seasons) for (const play of data.plays) {
    const key = `${play.game}|${play.off}`;
    if (!games.has(key)) games.set(key, { dropbacks: 0, plays: 0, game: play.game, team: play.off, season: data.season });
    const g = games.get(key); g.plays++; if (play.dropback) g.dropbacks++;
    const nk = `${data.season}|${play.off}`;
    if (!neutral.has(nk)) neutral.set(nk, { d: 0, n: 0 });
    if (play.neutral) { neutral.get(nk).n++; if (play.dropback) neutral.get(nk).d++; }
  }
  const xs = [], ys = [];
  for (const g of games.values()) {
    const line = lines.get(g.game), base = neutral.get(`${g.season}|${g.team}`);
    if (!line || !base?.n || g.plays < 40) continue;
    // nflverse spread_line is the home margin the market expected; the team's spread is its negative for the home side.
    xs.push(line.home === g.team ? -line.spread : line.spread); ys.push(g.dropbacks / g.plays - base.d / base.n);
  }
  if (xs.length < 50) return { slope: null, games: xs.length };
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return { slope: r4(slope), intercept: r4(my - slope * mx), games: xs.length };
}

/** The upcoming game's roof, surface and stadium for each team scheduled in the selected week (schedule facts only). */
export function upcomingGames({ schedule, season, week }) {
  const out = {};
  for (const row of schedule) {
    if (Number(row.season) !== season || row.game_type !== 'REG' || Number(row.week) !== week) continue;
    const id = `${appCode(row.away_team)}-${appCode(row.home_team)}`;
    out[id] = { roof: row.roof || null, surface: row.surface || null, stadium: row.stadium || null,
      indoor: !row.roof ? null : ['dome', 'closed'].includes(row.roof), grass: !row.surface ? null : row.surface === 'grass' };
  }
  return out;
}

/**
 * The whole insights block for one snapshot. `current` and `prior` each hold raw CSV rows ({ pbp, ftn, participation,
 * stats }), any of which may be null when that release does not exist yet. Pure: no I/O.
 */
export function buildDefenseInsights({ season, week, players, schedule, injuries, current, prior = {}, sources = [], generatedAt }) {
  if (!current?.pbp?.length) throw new Error('Current-season play-by-play is required for defensive insights.');
  const positions = new Map();
  for (const rows of [prior.stats, current.stats]) for (const row of rows ?? []) if (row.player_id && row.position) positions.set(row.player_id, row.position);
  for (const player of players) positions.set(player.id, player.position);
  const positionOf = id => positions.get(id) ?? null;
  const seasons = [];
  for (const [year, data, beforeWeek] of [[season - 1, prior, null], [season, current, week]]) {
    if (!data?.pbp?.length) continue;
    seasons.push({ season: year, plays: normalizePlays(data.pbp, { season: year, beforeWeek }), ftn: data.ftn?.length ? indexFtn(data.ftn) : null, participation: data.participation?.length ? indexParticipation(data.participation) : null });
  }
  const tallies = new Map(seasons.map(data => [data.season, tallyTeams(data.plays, { ftn: data.ftn, participation: data.participation, positionOf })]));
  const now = tallies.get(season);
  if (!now?.defense.size) throw new Error('No current-season plays precede the selected week.');
  const defensiveRoles = defensiveRolesFrom(current.stats ?? [], { season, beforeWeek: week });
  const { profiles, league } = buildTeamProfiles({ season, week, current: now, prior: tallies.get(season - 1) ?? null, injuries, defensiveRoles });
  const statsBySeason = new Map([[season, current.stats ?? []], [season - 1, prior.stats ?? []]]);
  const playersOut = buildPlayerInsights({ season, week, players, seasons, teamStyles: styleBySeason({ season, tallies }), schedule, statsBySeason });
  const coverage = seasons.map(data => ({
    season: data.season, playWeeks: range([...new Set(data.plays.map(play => play.week))]),
    ftnWeeks: data.ftn ? range([...new Set([...data.ftn.values()].map(item => item.week).filter(Number.isInteger))]) : null,
    participation: !!data.participation,
  }));
  return {
    schemaVersion: DEFENSE_SCHEMA, season, week, generatedAt, method: DEFENSE_METHOD, sources, coverage,
    league: { ...league, passRateBySpread: passRateBySpread({ seasons, schedule, beforeWeek: week, season }) },
    games: upcomingGames({ schedule, season, week }), teams: profiles, players: playersOut,
  };
}

const isRecord = value => !!value && typeof value === 'object' && !Array.isArray(value);
const KINDS = new Set(['observed', 'estimate', 'unavailable']);
const checkCompact = m => isRecord(m) && KINDS.has(m.kind) && (m.kind === 'unavailable' ? m.value === null : typeof m.value === 'number' && Number.isFinite(m.value) && Number.isInteger(m.n) && m.n > 0);
function checkMetric(m) {
  if (!isRecord(m) || !KINDS.has(m.kind)) return false;
  if (m.kind === 'unavailable') return m.value === null;
  return typeof m.value === 'number' && Number.isFinite(m.value) && Number.isInteger(m.n) && m.n > 0 && typeof m.period === 'string';
}

/**
 * Fail-closed check of the insights block the app renders. An invalid block is shown as "Not available", never partly.
 * Every metric must name its kind; an estimate or observation needs a sample and a period.
 */
export function validateDefenseInsights(defense, { season, week } = {}) {
  const errors = [], fail = message => errors.push(message);
  if (!isRecord(defense) || defense.schemaVersion !== DEFENSE_SCHEMA) return { valid: false, errors: ['Unsupported defensive insights.'] };
  if ((season !== undefined && defense.season !== season) || (week !== undefined && defense.week !== week)) fail('Insights belong to another week.');
  if (!isRecord(defense.teams) || !isRecord(defense.players) || !isRecord(defense.league) || !Array.isArray(defense.sources)) fail('Insights are incomplete.');
  for (const source of defense.sources ?? []) if (!isRecord(source) || typeof source.license !== 'string' || !/^[a-f0-9]{64}$/.test(source.sha256 ?? '')) fail('An insights source has no license or checksum.');
  for (const [team, profile] of Object.entries(defense.teams ?? {})) {
    const metrics = [profile?.coverage?.man, profile?.coverage?.blitz, profile?.coverage?.pressure, profile?.front?.nickel, profile?.front?.dime, profile?.front?.box,
      profile?.front?.lightFront, profile?.front?.runs, profile?.pace?.playsFaced, profile?.pace?.offensePlays, profile?.pace?.neutralPassRate];
    if (metrics.some(m => !checkMetric(m))) fail(`Team ${team} has an unlabelled or invalid metric.`);
    if (!Array.isArray(profile?.injuries)) fail(`Team ${team} injuries are missing.`);
  }
  for (const [id, insight] of Object.entries(defense.players ?? {})) {
    const usage = insight?.usage;
    if (!isRecord(usage) || !['snapShare', 'routeRate', 'middleShare', 'deepShare', 'adot'].every(key => checkCompact(usage[key])) || usage.snapShare.kind !== 'unavailable'
      || !Array.isArray(usage.games) || usage.games.some(row => !Array.isArray(row) || row.length !== USAGE_GAME_KEYS.length)) fail(`Player ${id} usage is invalid.`);
    const buckets = [...Object.values(insight?.environment ?? {}).filter(Array.isArray), ...Object.values(insight?.style ?? {}).filter(Array.isArray)];
    if (buckets.some(bucket => bucket.length !== GAME_STATS.length + 1 || bucket.some(value => !Number.isFinite(value)))) fail(`Player ${id} splits are invalid.`);
  }
  return { valid: errors.length === 0, errors };
}
