#!/usr/bin/env node
// Offline backtest of weekly fantasy projections (Board item 64). Analysis only: reads free public nflverse data
// (CC BY 4.0, D-56), writes .local/fantasy-backtest/, and changes no production path. Tunes on one season only.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { normalizePlayerStats, parseFantasyCsv } from '../shared/fantasy-build.mjs';
import { DEFAULT_SETTINGS, METHODS, POSITIONS, buildWeekContext, opponentFactor, pairedBootstrap, points, projectWeek, scaleStats, spearman, usage } from '../shared/fantasy-projections.mjs';
import { fetchSource, sourceHeaders } from './fantasy-sources.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cacheDir = path.join(root, '.local/fantasy-backtest');
const GITHUB_API = 'https://api.github.com';
const GRID = Object.freeze({ halfLife: [2, 3, 4, 6], kEff: [10, 25, 50, 100], kTd: [50, 100, 200, 400], kOpp: [2, 4, 8] });
const FIRST_GRADED_WEEK = 3, LAST_WEEK = 18;
const COMPARISONS = [['pace11', 'seasonAverage'], ['usage', 'seasonAverage'], ['usageOpp', 'seasonAverage'], ['usage', 'pace11'], ['usageOpp', 'pace11'], ['usageOpp', 'usage']];
const STATS_COLUMNS = ['player_id', 'position', 'season', 'season_type', 'week', 'game_id', 'team', 'opponent_team'];
const mean = values => values.reduce((total, value) => total + value, 0) / values.length;
const log = line => console.error(line);

const args = process.argv.slice(2), value = flag => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
if (args.includes('--help') || !value('--seasons')) {
  console.log('node scripts/fantasy-backtest.mjs --seasons 2024,2025 [--tune-season 2024] [--iterations 2000] [--seed 64]');
  process.exit(args.includes('--help') ? 0 : 1);
}
const seasons = value('--seasons').split(',').map(Number), tuneSeason = Number(value('--tune-season') ?? 2024);
const iterations = Number(value('--iterations') ?? 2000), seed = Number(value('--seed') ?? 64);
if (!seasons.every(Number.isInteger) || !seasons.includes(tuneSeason) || !Number.isInteger(iterations) || iterations < 100 || !Number.isInteger(seed)) throw new Error('Provide integer seasons that include the tuning season, at least 100 iterations and an integer seed.');

/** Same release URL pattern as scripts/fantasy-sources.mjs; a cached copy is reused only when its manifest SHA-256 matches. */
async function loadSource({ tag, file, columns }) {
  const url = `https://github.com/nflverse/nflverse-data/releases/download/${tag}/${file}`;
  const manifestPath = path.join(cacheDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '[]'));
  let entry = manifest.find(item => item.name === file && item.url === url), csv = null;
  if (entry) {
    csv = await readFile(path.join(cacheDir, file)).catch(() => null);
    if (csv && createHash('sha256').update(csv).digest('hex') !== entry.sha256) csv = null;
  }
  if (!csv) {
    const request = (target, timeoutMs) => fetchSource(target, { headers: sourceHeaders(target), timeoutMs, log });
    const release = await request(`${GITHUB_API}/repos/nflverse/nflverse-data/releases/tags/${tag}`, 30_000);
    if (!release.ok) throw new Error(`Source metadata unavailable (${release.status}).`);
    const asset = (await release.json()).assets.find(item => item.name === file && item.browser_download_url === url);
    if (!asset) throw new Error(`Source asset unavailable: ${file}`);
    const response = await request(url, 120_000);
    if (!response.ok) throw new Error(`Source unavailable (${response.status}): ${file}`);
    csv = Buffer.from(await response.arrayBuffer());
    const sha256 = createHash('sha256').update(csv).digest('hex');
    if (asset.size !== csv.byteLength || (asset.digest?.startsWith('sha256:') && asset.digest !== `sha256:${sha256}`)) throw new Error(`Source checksum mismatch: ${file}`);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path.join(cacheDir, `${file}.tmp`), csv);
    await rename(path.join(cacheDir, `${file}.tmp`), path.join(cacheDir, file));
    entry = { name: file, url, sha256, size: csv.byteLength, updatedAt: asset.updated_at, retrievedAt: new Date().toISOString() };
    await writeFile(manifestPath, JSON.stringify([...manifest.filter(item => item.name !== file), entry], null, 2) + '\n');
  }
  return { rows: parseFantasyCsv(csv.toString('utf8'), columns), source: { name: `nflverse ${file}`, url, license: 'CC BY 4.0', sha256: entry.sha256, updatedAt: entry.updatedAt, retrievedAt: entry.retrievedAt } };
}

/**
 * Player-weeks in weeks 3-18 where the player appeared, with every method able to project. Each week's context is
 * built from earlier weeks only; the week-w row supplies just the actual points being graded.
 */
function prepare(season, rows, schedule) {
  const weeks = [], excluded = { fewerThanTwoPrior: 0, actualUnscoreable: 0, noScheduledOpponent: 0, methodUnscoreable: 0 };
  let appeared = 0;
  for (let week = FIRST_GRADED_WEEK; week <= LAST_WEEK; week++) {
    const context = buildWeekContext({ rows, schedule, season, week }), defaults = projectWeek(context), graded = [];
    for (const row of rows) {
      if (Number(row.season) !== season || row.season_type !== 'REG' || Number(row.week) !== week || !POSITIONS.includes(row.position)) continue;
      appeared++;
      const player = context.players.get(row.player_id);
      if (!player || player.history.length < 2) { excluded.fewerThanTwoPrior++; continue; }
      const actual = points(normalizePlayerStats(row), row.position);
      if (actual === null) { excluded.actualUnscoreable++; continue; }
      // A traded player is looked up under his last team; if that team is on bye, there is no game to project.
      const opponent = context.opponents.get(player.team);
      if (!opponent) { excluded.noScheduledOpponent++; continue; }
      // Whether a method can project does not depend on its settings, so the default settings decide the paired set.
      const projections = defaults.get(row.player_id);
      if (METHODS.some(method => points(projections[method], player.position) === null)) { excluded.methodUnscoreable++; continue; }
      graded.push({ id: row.player_id, name: row.player_display_name, position: player.position, team: player.team, opponent, actual, player });
    }
    weeks.push({ week, context, graded });
  }
  return { season, weeks, appeared, excluded, graded: weeks.reduce((total, week) => total + week.graded.length, 0) };
}

/**
 * Full-grid MAE on one season; only the tuning season's best points become settings. Usage is computed once per
 * (H, K_eff, K_td) and reused across K_opp.
 */
function tune(prepared) {
  const results = [];
  for (const halfLife of GRID.halfLife) for (const kEff of GRID.kEff) for (const kTd of GRID.kTd) {
    let usageMiss = 0, n = 0; const oppMiss = GRID.kOpp.map(() => 0);
    for (const { context, graded } of prepared.weeks) for (const item of graded) {
      const base = { week: context.week, position: item.position, league: context.league, defenses: context.defenses, opponent: item.opponent };
      const line = usage(item.player.history, { ...base, halfLife, kEff, kTd });
      usageMiss += Math.abs(points(line, item.position) - item.actual);
      GRID.kOpp.forEach((kOpp, i) => { oppMiss[i] += Math.abs(points(scaleStats(line, opponentFactor({ ...base, kOpp })), item.position) - item.actual); });
      n++;
    }
    results.push({ method: 'usage', halfLife, kEff, kTd, mae: usageMiss / n });
    GRID.kOpp.forEach((kOpp, i) => results.push({ method: 'usageOpp', halfLife, kEff, kTd, kOpp, mae: oppMiss[i] / n }));
  }
  // Strictly lower MAE wins; ties keep the earlier grid point, so the choice is deterministic.
  const best = method => results.filter(row => row.method === method).reduce((a, b) => (b.mae < a.mae ? b : a));
  return { results, usage: best('usage'), usageOpp: best('usageOpp') };
}

/** Points for every method on the paired set, through projectWeek so the graded numbers come from the shared functions. */
function score(prepared, settings) {
  const rows = [];
  for (const { week, context, graded } of prepared.weeks) {
    const projections = projectWeek(context, settings);
    for (const { id, name, position, team, opponent, actual } of graded) {
      const projected = projections.get(id), row = { id, name, week, position, team, opponent, actual };
      for (const method of METHODS) row[method] = points(projected[method], position);
      if (METHODS.some(method => row[method] === null)) throw new Error(`Unpaired projection for ${id} in week ${week}.`);
      rows.push(row);
    }
  }
  return rows;
}

/** MAE, bias (projected − actual), within-5 share, and Spearman averaged over position-week groups. */
function metrics(rows, method) {
  if (!rows.length) return null;
  const errors = rows.map(row => row[method] - row.actual), groups = new Map();
  for (const row of rows) { const key = `${row.position}|${row.week}`; (groups.get(key) ?? groups.set(key, []).get(key)).push(row); }
  const rhos = [...groups.values()].map(group => spearman(group.map(row => row[method]), group.map(row => row.actual))).filter(rho => rho !== null);
  return { n: rows.length, mae: mean(errors.map(Math.abs)), bias: mean(errors), within5: errors.filter(error => Math.abs(error) <= 5).length / rows.length, spearman: rhos.length ? mean(rhos) : null, spearmanGroups: rhos.length };
}

function compare(rows) {
  return COMPARISONS.map(([method, baseline]) => {
    const a = rows.map(row => Math.abs(row[method] - row.actual)), b = rows.map(row => Math.abs(row[baseline] - row.actual));
    return { method, baseline, playerWeek: pairedBootstrap(a, b, { iterations, seed }), player: pairedBootstrap(a, b, { iterations, seed, clusters: rows.map(row => row.id) }) };
  });
}

function summarize(rows) {
  const all = Object.fromEntries(METHODS.map(method => [method, metrics(rows, method)]));
  const by = (key, values) => values.map(item => { const subset = rows.filter(row => row[key] === item); return { [key]: item, n: subset.length, methods: Object.fromEntries(METHODS.map(method => [method, metrics(subset, method)])) }; });
  return {
    overall: all, comparisons: compare(rows),
    byPosition: by('position', POSITIONS).map(entry => ({ ...entry, comparisons: compare(rows.filter(row => row.position === entry.position)) })),
    byWeek: by('week', [...new Set(rows.map(row => row.week))].sort((a, b) => a - b)),
  };
}

// Sanity check on the scorer: our Full PPR / 4-pt pass TD points should equal nflverse's own fantasy_points_ppr.
function scorerCheck(season, rows) {
  const offense = rows.filter(row => Number(row.season) === season && row.season_type === 'REG' && POSITIONS.includes(row.position));
  const off = offense.filter(row => Math.abs(points(normalizePlayerStats(row), row.position) - Number(row.fantasy_points_ppr)) > 0.011);
  return { rows: offense.length, mismatches: off.length, examples: off.slice(0, 5).map(row => ({ id: row.player_id, week: Number(row.week), ours: points(normalizePlayerStats(row), row.position), nflverse: Number(row.fantasy_points_ppr) })) };
}

const f = (x, digits = 3) => (x === null || x === undefined ? 'n/a' : x.toFixed(digits));
const signed = (x, digits = 3) => (x > 0 ? '+' : '') + f(x, digits);
const pct = x => `${(x * 100).toFixed(1)}%`;
const ci = c => `${signed(c.diff)} [${signed(c.low)}, ${signed(c.high)}]`;

function tables(results) {
  const lines = [], { chosen } = results.tuning;
  lines.push('## Chosen settings (tuned on ' + results.tuneSeason + ' only)', '', '| Method | H (weeks) | K_eff | K_td | K_opp | ' + results.tuneSeason + ' MAE |', '|---|---|---|---|---|---|');
  for (const method of ['usage', 'usageOpp']) { const c = chosen[method]; lines.push(`| ${method} | ${c.halfLife} | ${c.kEff} | ${c.kTd} | ${c.kOpp ?? '—'} | ${f(c.mae)} |`); }
  for (const method of ['usage', 'usageOpp']) {
    const grid = results.tuning.results.filter(row => row.method === method).sort((a, b) => a.mae - b.mae);
    lines.push('', `Grid for ${method}: ${grid.length} points, ${results.tuneSeason} MAE from ${f(grid[0].mae)} to ${f(grid.at(-1).mae)}. Best five:`, '', '| H | K_eff | K_td | K_opp | MAE |', '|---|---|---|---|---|');
    for (const row of grid.slice(0, 5)) lines.push(`| ${row.halfLife} | ${row.kEff} | ${row.kTd} | ${row.kOpp ?? '—'} | ${f(row.mae, 4)} |`);
  }
  lines.push('', 'Sensitivity, not selection: every grid point scored on every season. Only the ' + results.tuneSeason + ' grid chose the settings above.', '', '| Season | usage grid MAE | usageOpp grid MAE | seasonAverage MAE | pace11 MAE |', '|---|---|---|---|---|');
  for (const season of results.seasons) {
    const { usage: u, usageOpp: o } = results.sensitivity[season], overall = results.bySeason[season].summary.overall;
    lines.push(`| ${season} | ${f(u.min)}–${f(u.max)} | ${f(o.min)}–${f(o.max)} | ${f(overall.seasonAverage.mae)} | ${f(overall.pace11.mae)} |`);
  }
  // Holdout seasons first; the tuning season is in-sample and shown for reference only.
  for (const season of [...results.seasons].sort((a, b) => (a === results.tuneSeason) - (b === results.tuneSeason) || a - b)) {
    const s = results.bySeason[season], label = season === results.tuneSeason ? 'in-sample (tuning season)' : 'holdout';
    lines.push('', `## ${season} ${label}`, '', `Graded player-weeks: ${s.graded} of ${s.appeared} QB/RB/WR/TE appearances in weeks ${FIRST_GRADED_WEEK}-${LAST_WEEK}. Excluded: ${Object.entries(s.excluded).map(([key, count]) => `${key} ${count}`).join(', ')}.`, '');
    lines.push('| Method | MAE | Bias | Within 5 | Spearman (mean of ' + s.summary.overall.seasonAverage.spearmanGroups + ' position-weeks) |', '|---|---|---|---|---|');
    for (const method of METHODS) { const m = s.summary.overall[method]; lines.push(`| ${method} | ${f(m.mae)} | ${signed(m.bias)} | ${pct(m.within5)} | ${f(m.spearman)} |`); }
    lines.push('', 'Paired MAE difference (method − baseline; negative means the method is more accurate), 95% bootstrap CI, ' + results.iterations + ' resamples, seed ' + results.seed + ':', '', '| Method vs baseline | Resampling player-weeks | Resampling players (clustered) |', '|---|---|---|');
    for (const c of s.summary.comparisons) lines.push(`| ${c.method} vs ${c.baseline} | ${ci(c.playerWeek)} | [${signed(c.player.low)}, ${signed(c.player.high)}] |`);
    lines.push('', '### By position', '', '| Position | n | Method | MAE | Bias | Within 5 | Spearman |', '|---|---|---|---|---|---|---|');
    for (const entry of s.summary.byPosition) for (const method of METHODS) { const m = entry.methods[method]; lines.push(`| ${entry.position} | ${entry.n} | ${method} | ${f(m.mae)} | ${signed(m.bias)} | ${pct(m.within5)} | ${f(m.spearman)} |`); }
    lines.push('', 'Paired MAE difference by position, 95% CI resampling player-weeks:', '', '| Position | usage vs seasonAverage | usage vs pace11 | usageOpp vs seasonAverage | usageOpp vs pace11 |', '|---|---|---|---|---|');
    for (const entry of s.summary.byPosition) {
      const get = (method, baseline) => ci(entry.comparisons.find(c => c.method === method && c.baseline === baseline).playerWeek);
      lines.push(`| ${entry.position} | ${get('usage', 'seasonAverage')} | ${get('usage', 'pace11')} | ${get('usageOpp', 'seasonAverage')} | ${get('usageOpp', 'pace11')} |`);
    }
    lines.push('', '### Week-by-week accuracy trend (MAE)', '', '| Week | n | seasonAverage | pace11 | usage | usageOpp |', '|---|---|---|---|---|---|');
    for (const entry of s.summary.byWeek) lines.push(`| ${entry.week} | ${entry.n} | ${METHODS.map(method => f(entry.methods[method].mae)).join(' | ')} |`);
  }
  return lines.join('\n') + '\n';
}

const started = Date.now();
const schedule = await loadSource({ tag: 'schedules', file: 'games.csv', columns: ['game_id', 'season', 'game_type', 'week', 'home_team', 'away_team'] });
const sources = [schedule.source], prepared = {}, statsRows = {};
for (const season of seasons) {
  const stats = await loadSource({ tag: 'stats_player', file: `stats_player_week_${season}.csv`, columns: [...STATS_COLUMNS, 'fantasy_points_ppr'] });
  sources.push(stats.source); statsRows[season] = stats.rows;
  prepared[season] = prepare(season, stats.rows, schedule.rows);
  log(`${season}: ${prepared[season].graded} graded player-weeks (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}
const tuning = tune(prepared[tuneSeason]);
log(`Tuned on ${tuneSeason}: usage ${JSON.stringify(tuning.usage)}, usageOpp ${JSON.stringify(tuning.usageOpp)} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
const pick = ({ halfLife, kEff, kTd, kOpp }) => ({ halfLife, kEff, kTd, kOpp: kOpp ?? DEFAULT_SETTINGS.kOpp });
const settings = { usage: pick(tuning.usage), usageOpp: pick(tuning.usageOpp) };
const bySeason = {};
for (const season of seasons) {
  const rows = score(prepared[season], settings), { appeared, excluded, graded } = prepared[season];
  bySeason[season] = { appeared, graded, excluded, scorerCheck: scorerCheck(season, statsRows[season]), summary: summarize(rows), rows };
}
// The grid and the shared projectWeek path must agree exactly on the tuning season, or the tuned numbers are suspect.
for (const method of ['usage', 'usageOpp']) if (Math.abs(bySeason[tuneSeason].summary.overall[method].mae - tuning[method].mae) > 1e-9) throw new Error(`Grid and scoring disagree for ${method}.`);
// The best new method is chosen on the tuning season, never on the holdout.
const bestNewMethod = tuning.usageOpp.mae < tuning.usage.mae ? 'usageOpp' : 'usage';
// How much the result depends on the setting: the whole grid on each season, reported but never used to choose.
const range = list => ({ min: Math.min(...list.map(row => row.mae)), max: Math.max(...list.map(row => row.mae)), points: list.length });
const sensitivity = Object.fromEntries(seasons.map(season => {
  const { results: grid } = season === tuneSeason ? tuning : tune(prepared[season]);
  return [season, { usage: range(grid.filter(row => row.method === 'usage')), usageOpp: range(grid.filter(row => row.method === 'usageOpp')) }];
}));
const results = {
  generatedAt: new Date().toISOString(), item: 64, scoring: 'Full PPR, 4-point passing TD', tuneSeason, seasons, iterations, seed, grid: GRID,
  gradedWeeks: [FIRST_GRADED_WEEK, LAST_WEEK], sources, bestNewMethod,
  tuning: { chosen: { usage: tuning.usage, usageOpp: tuning.usageOpp }, results: tuning.results }, settings, sensitivity, bySeason,
};
await mkdir(cacheDir, { recursive: true });
await writeFile(path.join(cacheDir, 'results.json'), JSON.stringify(results, null, 1) + '\n');
await writeFile(path.join(cacheDir, 'tables.md'), tables(results));
console.log(JSON.stringify({
  tuneSeason, settings, bestNewMethod, seconds: Math.round((Date.now() - started) / 1000),
  seasons: Object.fromEntries(seasons.map(season => [season, {
    graded: bySeason[season].graded, mae: Object.fromEntries(METHODS.map(method => [method, Number(bySeason[season].summary.overall[method].mae.toFixed(3))])),
    vs: bySeason[season].summary.comparisons.map(c => `${c.method}-${c.baseline} ${ci(c.playerWeek)} cluster [${signed(c.player.low)}, ${signed(c.player.high)}]`),
  }])),
}, null, 1));
