import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { T, corrections, historyCsv, read, registry, registryText, seasonCsv, venues } from './trends-fixture.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const sources = { history: { file: 'shared/trends/history-1999-2025.csv', sha256: sha(historyCsv) },
  season: { file: 'shared/trends/season-2026.csv', sha256: sha(seasonCsv) }, registrySha256: sha(registryText) };
const generate = (season = seasonCsv, extra = {}) => T.generateWeek({ historyCsv, seasonCsv: season, season: 2026, week: 6, registry, venues, corrections, allowPending: true, sources, ...extra });
const committedText = read('shared/trends/2026-week-06.json');
const week = generate();
const game = id => week.games.find(g => g.id === id);

test('regenerating from the committed inputs reproduces the committed week file byte for byte', () => {
  assert.equal(JSON.stringify(week) + '\n', committedText);
  assert.equal(week.schema, T.WEEK_SCHEMA_VERSION);
  assert.equal(week.games.length, 14);
  assert.deepEqual(week.games.map(g => g.id), ['SEA-DEN', 'HOU-JAX', 'BAL-CLE', 'CAR-PHI', 'CHI-ATL', 'NO-NYG', 'NYJ-NE', 'PIT-TB', 'TEN-IND', 'ARI-LAR', 'BUF-LV', 'LAC-KC', 'DAL-GB', 'WAS-SF']);
  assert.match(read('web/src/trendWeeks.generated.js'), /'2026-06': \(\) => import\('\.\.\/\.\.\/shared\/trends\/2026-week-06\.json'\)/);
});

test('hidden lines: any current-week line, odds or moneyline in the input gives byte-identical output', () => {
  const { columns, rows } = T.parseCsvRows(seasonCsv);
  const filled = rows.map((r, i) => (T.rowPlayed(r) ? r : { ...r, spread_line: String((i % 9) - 4.5), total_line: String(40 + (i % 13)), home_spread_odds: '-120',
    away_spread_odds: '100', over_odds: '-105', under_odds: '-115', home_moneyline: '-200', away_moneyline: '170', temp: '20', wind: '25', referee: 'Scott Novak' }));
  const text = [columns.join(','), ...filled.map(r => columns.map(c => r[c]).join(','))].join('\n') + '\n';
  assert.equal(JSON.stringify(generate(text)), JSON.stringify(week));
  const redacted = T.parseCsvRows(T.writeCompactCsv(filled, { redactUnplayed: true })).rows.filter(r => !T.rowPlayed(r));
  assert.ok(redacted.every(r => T.REDACTED_COLUMNS.every(c => r[c] === '')));
});

test('an earlier game without a final stops generation unless pending is allowed', () => {
  const blanked = seasonCsv.replace(/^(2026_05_CHI_GB,(?:[^,]*,){7})[^,]*,([^,]*,)[^,]*,/m, '$1,$2,');
  assert.notEqual(blanked, seasonCsv);
  assert.throws(() => generate(blanked, { allowPending: false }), err => err instanceof T.TrendsPendingError && err.games.includes('2026_05_CHI_GB'));
  const unplayedEarlier = T.parseCsvRows(seasonCsv).rows.filter(r => !T.rowPlayed(r) && Number(r.week) < 6).map(r => r.game_id).sort();
  const pendingIds = [...new Set(week.pending.map(p => p.gameId))].sort();
  assert.deepEqual(pendingIds, unplayedEarlier);
  for (const { team } of week.pending) {
    const g = week.games.find(x => x.away === team || x.home === team);
    assert.ok(g.pending.includes(team));
    assert.ok(!g.tier2.some(t => t.team === team), `${team} has no Tier 2 card while its previous game is pending`);
    assert.ok(g.notes.some(n => n.startsWith(`Previous game pending: ${team}`)));
  }
});

test('game flags: international morning, TNF at altitude, MNF, SNF, domes and unknown retractable roofs', () => {
  const hou = game('HOU-JAX');
  assert.equal(hou.flags.international, true); assert.equal(hou.flags.window, 'morning'); assert.equal(hou.flags.stadium.id, 'LON00');
  assert.ok(hou.notes.includes('International: London (LON00), 09:30 ET'));
  const sea = game('SEA-DEN');
  assert.equal(sea.flags.day, 'TNF'); assert.equal(sea.flags.window, 'primetime'); assert.equal(sea.flags.altitude, true);
  assert.equal(game('WAS-SF').flags.day, 'MNF');
  assert.equal(game('DAL-GB').flags.day, 'SNF');
  for (const id of ['ARI-LAR', 'BUF-LV']) assert.equal(game(id).flags.roof, 'dome', id);
  for (const id of ['CHI-ATL', 'TEN-IND']) {
    const g = game(id);
    assert.equal(g.flags.roof, 'unknown');
    assert.ok(g.notes.includes('Roof status unknown until game day (retractable roof)'));
    assert.ok(g.gatedCards.both.some(x => x.card === 'fav_ats|g:g_fav_tt_ge28+g:g_indoor' && x.roofUnknown), `${id}: indoor big-favorite card waits for both ballots and the roof`);
  }
  assert.ok(game('DAL-GB').context.find(c => c.family === 'venue').more.includes('team_ats|t:t_dome_team_outdoors@DAL'));
  assert.ok(game('HOU-JAX').context.find(c => c.family === 'venue').more.includes('team_ats|t:t_dome_team_outdoors@HOU'));
  // JAX played at CIN, then Tottenham, then Wembley: a third straight game away from Jacksonville, never a homecoming.
  const streak = game('HOU-JAX').context.find(c => c.family === 'road_streak');
  const streakItems = [streak.lead.ats, streak.lead.ou, ...streak.more].filter(Boolean);
  assert.ok(streakItems.includes('team_ats|t:t_3rd_road@JAX'), streakItems.join(', '));
  assert.ok(!streakItems.some(id => id.includes('t_homecoming') || id.includes('t_3rd_home')), streakItems.join(', '));
});

test('strong wind is only a collapsed conditional note on upcoming outdoor games, never a top card', () => {
  const card = week.cards['total|g:g_wind10'];
  assert.equal(card.tier, 1);
  assert.equal(card.label, 'Strongest historical evidence (played games only)');
  assert.equal(card.timing, 'played_only');
  assert.equal(card.q, 0.103);
  for (const g of week.games) {
    const wind = g.conditional.find(c => c.card === 'total|g:g_wind10');
    const indoor = g.flags.roof === 'dome' || g.flags.roof === 'closed';
    assert.equal(Boolean(wind), !indoor, g.id);
    if (wind) { assert.equal(wind.status, 'forecast_unavailable'); assert.equal(week.copy[wind.note], 'Applies only if kickoff wind is 10+ mph; no forecast source'); }
    assert.ok(!g.tier2.some(t => week.cards[t.card].timing === 'played_only'));
  }
});

test('Tier 2 cards for Week 6: season-extreme ATS form and the upset-loss bounce, at most 3 per game', () => {
  const t2 = id => game(id).tier2.map(t => `${t.card}@${t.team}:${t.bet}`);
  assert.ok(t2('HOU-JAX').includes('team_ats|t:t_ats_season_cold@HOU:Back HOU ATS'));
  assert.ok(t2('CAR-PHI').includes('team_ats|t:t_ats_season_cold@PHI:Back PHI ATS'));
  assert.ok(t2('LAC-KC').includes('team_ats|t:t_ats_margin_cold@LAC:Back LAC ATS'));
  assert.ok(t2('DAL-GB').includes('team_ats|t:t_off_big_upset_loss@DAL:Back DAL ATS'));
  assert.ok(t2('NO-NYG').includes('team_ats|t:t_ats_season_hot@NYG:Fade NYG (NO ATS)'));
  assert.ok(t2('WAS-SF').includes('team_ats|t:t_ats_season_hot@SF:Fade SF (WAS ATS)'));
  for (const g of week.games) {
    assert.ok(g.tier2.length <= 3, g.id);
    for (const t of g.tier2) assert.equal(week.cards[t.card].tier, 2);
  }
  for (const id of ['team_ats|t:t_ats_margin_cold', 'team_ats|t:t_ats_season_cold', 'team_ats|t:t_ats_season_hot', 'team_ats|t:t_off_big_upset_loss',
    'total|any:t_good_def+g:g_indoor', 'fav_ats|g:g_fav_tt_ge28+g:g_indoor']) {
    const c = week.cards[id];
    assert.equal(c.label, 'Consistent in 2002-2017 and 2018-2025, not proven', id);
    assert.equal(c.selection.label, 'Results 2018-2025 (period used to select this card)');
    assert.deepEqual(c.sinceRegistered, { since: '2026-10-12', rec: [0, 0, 0] });
    assert.ok(c.gates.eligible && c.gates.robustness.every(v => v.pass), id);
    assert.equal(c.record.fileOdds, undefined, 'file-odds ROI stays hidden');
  }
  assert.ok(week.cards['total|any:t_good_def+g:g_indoor'].roofSplit, 'dome cards split fixed domes from closed retractable roofs');
});

test('every displayed trend carries in-sample and out-of-sample records and a quality score', () => {
  for (const [id, c] of Object.entries(week.cards)) {
    assert.equal(c.record.W + c.record.L + c.record.P, c.split.rec[0] + c.split.rec[1] + c.split.rec[2], id);
    assert.equal(c.selection.rec.length, 3); assert.equal(typeof c.score.score, 'number');
    assert.ok(c.score.score <= (c.tier === 3 ? 39 : 100));
  }
  for (const [id, r] of Object.entries(week.rows)) {
    assert.equal(r.split.length, 3, id); assert.equal(r.oos.length, 3, id);
    if (r.descriptive) { assert.equal(r.score, null, id); assert.equal(r.market, 'su'); continue; }
    assert.equal(typeof r.score, 'number', id);
    assert.ok(r.score <= (r.anecdote ? 15 : 39), id);
  }
  const ref = week.rows[week.referees['Scott Novak'].total];
  assert.deepEqual(ref.split, [56, 60, 0], 'Novak career: Over 56, Under 60');
  assert.equal(ref.score, 0);
  assert.equal(week.rows[week.referees['Scott Novak'].primetime.total].anecdote, true);
});

test('context follows Sean\'s family order; referees are a dropdown with no assignment yet', () => {
  const order = registry.families.map(f => f.id);
  for (const g of week.games) {
    assert.equal(g.context[0].family, 'referee');
    assert.equal(g.context[0].status, 'not_assigned');
    const idx = g.context.map(c => order.indexOf(c.family));
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b), g.id);
    for (const c of g.context.slice(1)) for (const item of [c.lead.ats, c.lead.ou, ...c.more].filter(Boolean)) assert.ok(week.rows[item.split('@')[0]], item);
  }
  assert.equal(week.refereeOptions.length, 18);
  assert.ok(week.refereeOptions.includes('Tra Blake'));
  assert.ok(Object.values(week.assignedReferees).every(v => v === null));
  const withRef = generate(seasonCsv, { referees: { 'SEA-DEN': 'Shawn Hochuli' } });
  assert.equal(withRef.games[0].context[0].referee, 'Shawn Hochuli');
});

test('size budget, copy guard, no user identifiers, and the core imports nothing from the app', () => {
  assert.ok(Buffer.byteLength(committedText) <= 300_000, `${Buffer.byteLength(committedText)} bytes`);
  assert.ok(gzipSync(committedText).length <= 80_000);
  const texts = [...Object.values(week.copy), ...Object.values(week.cards).flatMap(c => [c.title, ...c.filters, c.label, c.note ?? '']),
    ...Object.values(week.rows).map(r => r.title ?? ''), ...week.games.flatMap(g => [...g.notes, ...g.tier2.map(t => t.bet)])];
  // Proper names are data, not copy (QB Drew Lock would otherwise trip the guard).
  const names = new Set([...week.refereeOptions, ...week.games.flatMap(g => [...Object.values(g.entities.qbs).map(q => q.name), ...Object.values(g.entities.coaches).map(c => c.name)])]);
  const strip = t => [...names].reduce((acc, n) => acc.split(n).join(' '), t);
  for (const t of texts) assert.deepEqual(T.bannedCopy(strip(t)), [], t);
  assert.deepEqual(T.bannedCopy('QB Drew Lock starts: ATS (career)'), ['lock'], 'the guard itself is not name-aware');
  assert.doesNotMatch(committedText, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  assert.doesNotMatch(committedText, /[\w.+-]+@[\w-]+\.[\w.]+/);
  const source = read('shared/trends.mjs');
  const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map(m => m[1]);
  assert.deepEqual(imports, ['./nfl-schedule.mjs']);
  assert.doesNotMatch(source, /Date\.now|Math\.random|node:fs|fetch\(/);
});

test('the week file holds no current line: no unplayed game carries a line, odds, moneyline or weather, here or in the season file', () => {
  // The redesign's Lines tab (stage 13) reads this file for its trends, so it must never be a way to a hidden line (D-36, D-39).
  const LINE_KEY = /^(spread|spread_line|total|total_line|line|lines|odds|[a-z_]*_odds|[a-z_]*moneyline|consensus|wind|temp|weather)$/i;
  const offending = [];
  const walk = (node, path) => {
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (LINE_KEY.test(key) && value !== null && typeof value !== 'object') offending.push(`${path}.${key} = ${JSON.stringify(value)}`);
      walk(value, `${path}.${key}`);
    }
  };
  // The walk itself finds a line-shaped value (the check is live).
  walk({ flags: { spread_line: -3.5 }, market: { total: 41.5 } }, 'probe');
  assert.deepEqual(offending.splice(0), ['probe.flags.spread_line = -3.5', 'probe.market.total = 41.5']);
  const committed = JSON.parse(committedText);
  const upcoming = committed.games.filter(g => !g.played);
  assert.equal(upcoming.length, 14);
  for (const g of upcoming) walk(g, g.id);
  assert.deepEqual(offending, []);
  // The season file's unplayed rows: every redacted column is blank.
  const { rows } = T.parseCsvRows(seasonCsv);
  const unplayed = rows.filter(r => !T.rowPlayed(r));
  assert.ok(unplayed.some(r => r.game_id.startsWith('2026_06_')));
  for (const r of unplayed) for (const c of T.REDACTED_COLUMNS) assert.equal(r[c], '', `${r.game_id} ${c}`);
  assert.ok(['spread_line', 'total_line', 'home_spread_odds', 'over_odds', 'home_moneyline', 'wind', 'temp', 'referee'].every(c => T.REDACTED_COLUMNS.includes(c)));
});
