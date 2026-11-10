// Contract: defensive-matchup insights (shared/fantasy-defense.mjs, shared/fantasy-defense-view.mjs, the opponent
// adjustment in shared/fantasy-context.mjs and scripts/fantasy-defense-sources.mjs). Ranking math, split computation,
// estimate labelling, missing-data handling and fail-soft attachment, on a deterministic four-team league.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFENSE_COLUMNS, GAME_STATS, buildDefenseInsights, metric, normalizePlays, parseCsvColumns, parsePersonnel, rankTeams, validateDefenseInsights, defensiveInjuries } from '../shared/fantasy-defense.mjs';
import { bucketPoints, compareSplit, defenseInsights, defenseRankingTable, explainMatchup, gameScript, perUnit, playerMatchupView, scoreRaw, usageAverages } from '../shared/fantasy-defense-view.mjs';
import { adjustedAllowed, matchupTable } from '../shared/fantasy-context.mjs';
import { attachDefenseInsights, defenseSourceSpecs, readDefenseSources } from '../scripts/fantasy-defense-sources.mjs';
import { defenseInputs, defenseSnapshot, SEASON, WEEK } from './helpers/fantasy-defense-fixture.mjs';

const PPR = { scoring: 'ppr', passingTds: 4 }, STANDARD = { scoring: 'standard', passingTds: 4 };
const snapshot = defenseSnapshot();

test('CSV columns: only the named ones are kept; quotes, escaped quotes, quoted newlines and NA are handled; a missing column throws', () => {
  const text = '﻿a,b,c\n1,"x, ""y""\nz",NA\r\n2,plain,3\n';
  assert.deepEqual(parseCsvColumns(text, ['c', 'b']), [{ c: '', b: 'x, "y"\nz' }, { c: '3', b: 'plain' }]);
  assert.throws(() => parseCsvColumns(text, ['a', 'missing']), /Missing CSV columns: missing/);
  assert.deepEqual(parseCsvColumns(text, ['a', 'missing'], { optional: ['missing'] }).map(row => row.missing), ['', '']);
  assert.throws(() => parseCsvColumns('a,b\n1,2,3\n', ['a']), /Malformed CSV row 2/);
  assert.throws(() => parseCsvColumns('a\n"open\n', ['a']), /Unclosed CSV quote/);
});

test('personnel strings give defensive backs and down linemen; anything unparseable is null, never a guess', () => {
  assert.deepEqual(parsePersonnel('3 CB, 2 DE, 2 DT, 1 FS, 1 MLB, 1 OLB, 1 SS'), { dbs: 5, dl: 4 });
  assert.deepEqual(parsePersonnel('2 CB, 1 DE, 1 FS, 2 ILB, 1 NT, 2 OLB, 1 SS'), { dbs: 4, dl: 2 });
  for (const bad of ['', 'NA', 'four CB', '1 CB']) assert.equal(parsePersonnel(bad), null);
});

test('plays: regular season scrimmage plays before the selected week only; two-point tries and no-plays are dropped; scrambles are not designed runs', () => {
  const base = { game_id: 'G', play_id: '1', season_type: 'REG', week: '3', posteam: 'LA', defteam: 'SEA', play_type: 'run', qb_dropback: '0', qb_scramble: '0', two_point_attempt: '0' };
  const rows = [base, { ...base, play_id: '2', week: '4' }, { ...base, play_id: '3', season_type: 'POST' }, { ...base, play_id: '4', two_point_attempt: '1' },
    { ...base, play_id: '5', play_type: 'no_play' }, { ...base, play_id: '6', qb_dropback: '1', qb_scramble: '1' }];
  const plays = normalizePlays(rows, { season: 2026, beforeWeek: 4 });
  assert.deepEqual(plays.map(play => play.key), ['G|1', 'G|6']);
  assert.equal(plays[0].off, 'LAR', 'nflverse codes become app codes');
  assert.equal(plays[0].designedRun, true);
  assert.equal(plays[1].designedRun, false);
  assert.equal(plays[1].dropback, true);
});

test('metric labels: a missing value or empty sample is always Not available; small samples are flagged', () => {
  assert.deepEqual(metric(null, { kind: 'observed', n: 10, unit: 'rate', period: 'x' }), { value: null, kind: 'unavailable', n: 0, unit: 'rate', period: null, basis: null });
  assert.equal(metric(0.5, { kind: 'observed', n: 0, unit: 'rate', period: 'x' }).kind, 'unavailable');
  assert.equal(metric(0.5, { kind: 'estimate', n: 10, unit: 'rate', period: 'x', smallBelow: 60 }).small, true);
  assert.equal(metric(0.5, { kind: 'estimate', n: 60, unit: 'rate', period: 'x', smallBelow: 60 }).small, false);
});

test('team ranks: 1 is the highest value, equal values share a rank, missing values are unranked', () => {
  const { ranks, of } = rankTeams(new Map([['A', 0.3], ['B', 0.5], ['C', 0.3], ['D', null]]));
  assert.deepEqual(Object.fromEntries(ranks), { B: 1, A: 2, C: 2 });
  assert.equal(of, 3);
});

test('coverage without this season\'s participation: man rate, shells and nickel are last season\'s observed rates labelled as estimates', () => {
  const bbb = snapshot.defense.teams.BBB;
  assert.equal(bbb.coverage.man.kind, 'estimate');
  assert.equal(bbb.coverage.man.value, 1);
  assert.equal(bbb.coverage.man.period, '2025 season');
  assert.match(bbb.coverage.man.basis, /2025 observed rate stands in/);
  assert.equal(snapshot.defense.teams.CCC.coverage.man.value, 0);
  assert.equal(bbb.coverage.shells[0].shell, 'COVER_1');
  assert.equal(bbb.front.nickel.kind, 'estimate');
  assert.equal(bbb.front.base, '3-4');
  assert.equal(snapshot.defense.teams.CCC.front.base, '4-3');
  assert.equal(bbb.front.lightFront.kind, 'estimate', 'the front is always an estimate: position labels come from rosters');
});

test('blitz and box rates are observed this season from FTN charting; pressure without charting is the labelled sacks-plus-hits estimate', () => {
  const bbb = snapshot.defense.teams.BBB;
  assert.deepEqual([bbb.coverage.blitz.kind, bbb.coverage.blitz.value, bbb.coverage.blitz.period, bbb.coverage.blitz.rank], ['observed', 1, '2026 Weeks 1–3', 1]);
  assert.equal(snapshot.defense.teams.CCC.coverage.blitz.value, 0);
  assert.equal(bbb.front.box.kind, 'observed');
  assert.equal(bbb.front.box.value, 1);
  assert.equal(bbb.coverage.pressure.kind, 'estimate');
  assert.match(bbb.coverage.pressure.basis, /Sacks plus QB hits per dropback/);
  assert.equal(bbb.coverage.pressurePrior.kind, 'observed');
});

test('with this season\'s participation the same tendencies become observed; with none at all they are Not available', () => {
  const observed = buildDefenseInsights(defenseInputs({ currentParticipation: true }));
  assert.equal(observed.teams.BBB.coverage.man.kind, 'observed');
  assert.equal(observed.teams.BBB.coverage.man.period, '2026 Weeks 1–3');
  assert.equal(observed.teams.BBB.coverage.pressure.kind, 'observed');
  const none = buildDefenseInsights(defenseInputs({ priorParticipation: false }));
  for (const m of [none.teams.BBB.coverage.man, none.teams.BBB.front.nickel, none.teams.BBB.front.lightFront]) {
    assert.equal(m.kind, 'unavailable'); assert.equal(m.value, null);
  }
  assert.equal(none.teams.BBB.front.base, null);
  assert.equal(none.players['P-WR'].coverage, null, 'no man/zone split without any participation');
  assert.equal(none.players['P-WR'].usage.routeRate.kind, 'unavailable');
  assert.equal(validateDefenseInsights(none, { season: SEASON, week: WEEK }).valid, true);
});

test('missing FTN charting: blitz falls back to last season as an estimate, and with no charting at all is Not available', () => {
  const inputs = defenseInputs();
  const fallback = buildDefenseInsights({ ...inputs, current: { ...inputs.current, ftn: null } });
  assert.equal(fallback.teams.BBB.coverage.blitz.kind, 'estimate');
  assert.equal(fallback.teams.BBB.coverage.blitz.period, '2025 season');
  const none = buildDefenseInsights({ ...inputs, current: { ...inputs.current, ftn: null }, prior: { ...inputs.prior, ftn: null } });
  assert.equal(none.teams.BBB.coverage.blitz.kind, 'unavailable');
  assert.equal(none.players['P-WR'].blitz, null);
});

test('run defense by direction and gap is counted from designed runs; league ranks name the softest side', () => {
  const bbb = snapshot.defense.teams.BBB.front;
  assert.equal(bbb.runs.value, 6);
  assert.equal(bbb.runs.rank, 1);
  assert.deepEqual(bbb.runLoc.left.raw, { n: 24, yds: 144, td: 3, fum: 0 });
  assert.equal(snapshot.defense.teams.CCC.front.runs.value, 3);
  assert.equal(bbb.runGap.end.kind, 'observed');
});

test('player splits: man/zone and blitz splits are raw tallies scored by the app; game-level buckets hold games and stat sums', () => {
  const wr = snapshot.defense.players['P-WR'];
  assert.equal(wr.coverage.kind, 'observed');
  assert.equal(wr.coverage.seasons, '2025');
  assert.ok(wr.coverage.man.n > 0 && wr.coverage.zone.n > 0);
  assert.equal(wr.coverage.onField.man + wr.coverage.onField.zone, 4 * 36, 'every AAA dropback in its four 2025 games had him on the field');
  assert.equal(wr.blitz.seasons, '2025 and 2026');
  // Will Wide faced BBB (the man, blitz-heavy defense) in Weeks 1 and 4 of 2025 and Week 1 of 2026.
  assert.equal(wr.style.manHeavy[0], 3);
  assert.equal(wr.style.kinds.coverage, 'estimate', 'this season\'s games classify opponents by last season\'s man rate');
  assert.equal(wr.style.kinds.blitz, 'observed');
  assert.equal(wr.environment.indoor[0] + wr.environment.outdoor[0], 7);
  assert.equal(wr.style.manHeavy.length, GAME_STATS.length + 1);
  const qb = snapshot.defense.players['P-QB'];
  assert.ok(qb.pressure.pressured.n > 0 && qb.pressure.clean.n > 0);
  assert.equal(snapshot.defense.players['P-RB'].box.heavy.n > 0, true);
  assert.equal(snapshot.defense.players['P-K'], undefined, 'kickers get no splits');
});

test('scoring raw tallies follows the selected format; per-unit values carry their sample', () => {
  const raw = { n: 10, rec: 6, yds: 80, td: 1, fum: 1 };
  assert.equal(scoreRaw(raw, 'recv', PPR), 6 + 8 + 6 - 2);
  assert.equal(scoreRaw(raw, 'recv', STANDARD), 8 + 6 - 2);
  assert.equal(scoreRaw({ n: 30, yds: 250, td: 2, int: 1, rushYds: 20, rushTd: 0, fum: 0 }, 'pass', { scoring: 'ppr', passingTds: 6 }), 10 + 12 - 2 + 2);
  assert.deepEqual(perUnit(raw, 'recv', PPR), { value: 1.8, n: 10 });
  assert.deepEqual(perUnit({ n: 0, rec: 0, yds: 0, td: 0, fum: 0 }, 'recv', PPR), { value: null, n: 0 });
  assert.equal(scoreRaw(null, 'recv', PPR), null);
});

test('game buckets average to points per game; an empty bucket is unavailable', () => {
  const bucket = [2, 0, 0, 0, 20, 2, 4, 40, 0, 0, 0, 0];
  assert.deepEqual(bucketPoints(bucket, 'RB', PPR), { value: 1 + 6 + 2 + 2, games: 2 }, 'per game: 10 rushing yards, a TD, 2 catches, 20 receiving yards');
  assert.deepEqual(bucketPoints([0, ...new Array(11).fill(0)], 'RB', PPR), { value: null, games: 0 });
});

test('a split leans only past the threshold, and flags a side below its minimum sample', () => {
  const big = { n: 40, rec: 20, yds: 300, td: 2, fum: 0 }, small = { n: 5, rec: 2, yds: 20, td: 0, fum: 0 };
  assert.equal(compareSplit(big, big, 'recv', PPR, 15).lean, 'even');
  const split = compareSplit(big, small, 'recv', PPR, 15);
  assert.equal(split.lean, 'left');
  assert.equal(split.small, true);
  assert.equal(compareSplit(big, null, 'recv', PPR, 15).lean, null);
});

test('opponent adjustment: each game minus that offense\'s average against its other opponents, ranked most-allowed first', () => {
  const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0 };
  const g = (week, opponent, yards) => ({ week, opponent, allowed: { QB: zero, RB: zero, TE: zero, WR: { ...zero, receivingYards: yards } } });
  // Offense X scores 10 against D2 and D3 and 30 against D1: D1 allowed 20 above expectation in that game.
  const snap = { matchups: {
    D1: [g(1, 'X', 300), g(2, 'Y', 100)], D2: [g(1, 'Y', 100), g(2, 'X', 100)], D3: [g(1, 'Z', 100), g(3, 'X', 100)], D4: [g(2, 'Z', 100), g(3, 'Y', 100)],
  } };
  const adjusted = adjustedAllowed(snap, 'WR', STANDARD);
  assert.equal(adjusted.get('D1').adjusted, (20 + 0) / 2);
  assert.equal(adjusted.get('D2').adjusted, ((10 - 20) + 0) / 2, 'X averaged 20 against its other opponents (30 and 10)');
  assert.equal(adjusted.get('D4').adjusted, null, 'Z has only one other game, so neither D4 game counts');
  const table = matchupTable(snap, 'WR', STANDARD);
  assert.equal(table.rows.get('D1').adjustedRank, 1);
  assert.equal(table.rows.get('D4').adjustedRank, null);
  assert.equal(table.rows.get('D1').seasonRank, 1, 'the unadjusted ranks are unchanged');
});

test('defense ranking table: sorted by the chosen column, unranked last, styles attached when insights exist', () => {
  const table = defenseRankingTable(snapshot, 'WR', PPR, 'adjusted');
  assert.equal(table.rows[0].team, 'BBB');
  assert.equal(table.rows[0].rank, 1);
  assert.equal(table.rows[0].style.man.kind, 'estimate');
  assert.equal(table.hasStyles, true);
  assert.equal(defenseRankingTable(snapshot, 'WR', PPR, 'bogus').sort, 'adjusted');
  const plain = defenseRankingTable(defenseSnapshot({ defense: false }), 'WR', PPR, 'season');
  assert.equal(plain.hasStyles, false);
  assert.equal(plain.rows[0].style, null);
  assert.equal(defenseRankingTable({}, 'WR', PPR), null);
});

test('player view statuses: no insights, kicker, bye, unknown opponent and ready', () => {
  assert.equal(playerMatchupView(defenseSnapshot({ defense: false }), 'P-WR', PPR).status, 'unavailable');
  assert.equal(playerMatchupView(snapshot, 'P-K', PPR).status, 'position');
  const bye = { ...snapshot, players: snapshot.players.map(p => p.id === 'P-WR' ? { ...p, weekly: { status: 'bye', opponent: null, kickoff: null, stats: null } } : p) };
  assert.equal(playerMatchupView(bye, 'P-WR', PPR).status, 'bye');
  const unknown = { ...snapshot, players: snapshot.players.map(p => p.id === 'P-WR' ? { ...p, weekly: { status: 'unknown', opponent: null, kickoff: null, stats: null } } : p) };
  assert.equal(playerMatchupView(unknown, 'P-WR', PPR).status, 'no-opponent');
  assert.equal(playerMatchupView(snapshot, 'nobody', PPR), null);
  const view = playerMatchupView(snapshot, 'P-WR', PPR);
  assert.equal(view.status, 'ready');
  assert.equal(view.opponent, 'BBB');
  assert.deepEqual(view.sections.map(s => s.id), ['coverage', 'front', 'environment', 'script', 'injuries', 'usage', 'alignment']);
});

test('an invalid or other-week insights block is treated as absent, never shown in part', () => {
  const broken = { ...snapshot, defense: { ...snapshot.defense, teams: { ...snapshot.defense.teams, BBB: { ...snapshot.defense.teams.BBB, coverage: { ...snapshot.defense.teams.BBB.coverage, man: { value: 0.4, kind: 'guess' } } } } } };
  assert.equal(validateDefenseInsights(broken.defense).valid, false);
  assert.equal(defenseInsights(broken), null);
  assert.equal(playerMatchupView(broken, 'P-WR', PPR).status, 'unavailable');
  assert.equal(defenseInsights({ ...snapshot, week: WEEK + 1 }), null);
  const unlabelled = { ...snapshot.defense, players: { ...snapshot.defense.players, 'P-WR': { ...snapshot.defense.players['P-WR'], usage: { ...snapshot.defense.players['P-WR'].usage, snapShare: { value: 0.8, kind: 'observed', n: 3 } } } } };
  assert.equal(validateDefenseInsights(unlabelled).valid, false, 'snap share must stay Not available: its only source carries no reuse license');
  const noLicense = { ...snapshot.defense, sources: [{ name: 'x', sha256: 'a'.repeat(64) }] };
  assert.equal(validateDefenseInsights(noLicense).valid, false);
});

test('every displayed row names its kind; Not available rows carry no number or sample', () => {
  for (const id of ['P-QB', 'P-RB', 'P-WR', 'P-TE']) {
    const view = playerMatchupView(snapshot, id, PPR);
    for (const section of view.sections) for (const row of [...section.opponent, ...section.player]) {
      assert.ok(['observed', 'estimate', 'unavailable'].includes(row.kind), `${id} ${row.id}`);
      if (row.kind === 'unavailable') { assert.equal(row.text, 'Not available'); assert.equal(row.sample, ''); }
      else assert.notEqual(row.text, 'Not available');
    }
  }
  const wr = playerMatchupView(snapshot, 'P-WR', PPR);
  const rows = Object.fromEntries(wr.sections.flatMap(s => [...s.opponent, ...s.player]).map(row => [row.id, row]));
  assert.equal(rows['use-snapShare'].kind, 'unavailable');
  assert.match(rows['use-snapShare'].basis, /no reuse license/);
  assert.equal(rows['use-routeRate'].kind, 'estimate');
  assert.equal(rows['use-routeRate'].period, '2025 season');
  assert.equal(rows['align-middleShare'].kind, 'estimate');
  assert.match(rows['align-middleShare'].basis, /slot-role proxy/);
  assert.equal(rows['opp-wr-slot'].kind, 'unavailable');
  assert.equal(rows['opp-man'].kind, 'estimate');
  assert.equal(rows['opp-blitz'].kind, 'observed');
  assert.equal(rows['game-roof'].text, 'Dome · AAA Field');
});

test('small samples are flagged on the rows and notes that rest on them', () => {
  const wr = playerMatchupView(snapshot, 'P-WR', PPR);
  const rows = wr.sections.flatMap(s => s.player);
  const byGame = rows.filter(row => row.id.startsWith('split-') && row.sample.endsWith('games'));
  assert.ok(byGame.length > 0 && byGame.every(row => row.small === (row.n < 4)));
  const adjusted = wr.explanations.find(note => note.id === 'adjusted');
  assert.equal(adjusted.small, true, 'three games is below the four-game threshold');
});

test('explanations: favorable when the player is better against what the opponent plays, unfavorable when worse', () => {
  const wr = playerMatchupView(snapshot, 'P-WR', PPR).explanations;
  assert.equal(wr.find(note => note.id === 'coverage').tone, 'favorable');
  assert.equal(wr.find(note => note.id === 'coverage').kind, 'estimate', 'the man rate is last season\'s, so the note is an estimate');
  assert.equal(wr.find(note => note.id === 'blitz').kind, 'observed');
  const te = playerMatchupView(snapshot, 'P-TE', PPR).explanations;
  assert.equal(te.find(note => note.id === 'coverage').tone, 'unfavorable');
  const rb = playerMatchupView(snapshot, 'P-RB', PPR).explanations;
  assert.equal(rb.find(note => note.id === 'run').tone, 'favorable');
  assert.ok(rb.find(note => note.id === 'direction'));
  // Without splits there is nothing to compare: no coverage or blitz note.
  const player = snapshot.players.find(p => p.id === 'P-WR');
  const bare = explainMatchup({ player, insight: null, profile: snapshot.defense.teams.BBB, league: snapshot.defense.league, table: null, settings: PPR });
  assert.equal(bare.some(note => ['coverage', 'blitz'].includes(note.id)), false);
});

test('opponent injuries: reported defenders with an estimated role; only regular or rotational Out/Doubtful players change the read', () => {
  const view = playerMatchupView(snapshot, 'P-WR', PPR);
  const injuries = view.sections.find(s => s.id === 'injuries');
  assert.deepEqual(injuries.opponent.map(row => row.label), ['Cory Back · CB', 'Lee Backer · LB']);
  assert.match(injuries.opponent[0].text, /^Out \(Hamstring\) · regular contributor$/);
  assert.match(injuries.effects[0], /cornerback/);
  const rb = playerMatchupView(snapshot, 'P-RB', PPR).sections.find(s => s.id === 'injuries');
  assert.deepEqual(rb.effects, [], 'a questionable linebacker of unknown role does not change a running back\'s read');
  assert.deepEqual(defensiveInjuries({ team: 'BBB', season: SEASON, week: WEEK + 1, injuries: snapshot.defense.teams && [], roles: new Map() }), []);
  assert.equal(snapshot.defense.teams.AAA.injuries.length, 0, 'offensive players on AAA\'s report are not defensive injuries');
});

test('game script: locked or missing lines say so; visible lines give the implied total and spread, and labelled estimates', () => {
  const player = snapshot.players.find(p => p.id === 'P-WR');
  const args = { player, profile: snapshot.defense.teams.BBB, teamProfile: snapshot.defense.teams.AAA, league: snapshot.defense.league };
  assert.equal(gameScript({ ...args, lines: null }).status, 'Lines are not available right now.');
  const locked = { status: 'ok', games: new Map([['BBB-AAA', { spread: { visible: false }, total: { visible: true, value: 44 } }]]) };
  assert.equal(gameScript({ ...args, lines: locked }).status, 'Lock your BBB–AAA spread guess to see the game script.');
  assert.equal(gameScript({ ...args, lines: locked }).opponent.some(row => row.id === 'script-total'), false, 'no total leaks while a guess is unlocked');
  const open = { status: 'ok', games: new Map([['BBB-AAA', { spread: { visible: true, value: -3, bookCount: 3, capturedAt: '2026-09-30T12:00:00Z' }, total: { visible: true, value: 44, bookCount: 3, capturedAt: '2026-09-30T12:00:00Z' } }]]) };
  // The fixture has too few completed games for the spread coefficient, so expected pass rate is Not available.
  assert.equal(gameScript({ ...args, lines: open }).opponent.find(row => row.id === 'script-pass').kind, 'unavailable');
  const script = gameScript({ ...args, league: { ...args.league, passRateBySpread: { slope: 0.005, intercept: 0, games: 400 } }, lines: open });
  const rows = Object.fromEntries(script.opponent.map(row => [row.id, row]));
  assert.equal(script.status, null);
  assert.equal(rows['script-total'].value, 23.5);
  assert.equal(rows['script-spread'].text, '-3.0');
  assert.equal(rows['script-plays'].kind, 'estimate');
  assert.equal(rows['script-pass'].kind, 'estimate');
  assert.ok(rows['script-pass'].value >= 0.3 && rows['script-pass'].value <= 0.9);
});

test('usage averages: season and last three games, each with its own sample; unknown values are skipped, not zero', () => {
  const games = [[1, 0.2, null, 50, null, 1, null], [2, 0.3, null, 70, null, 0, null], [3, null, null, 60, null, 2, null], [4, 0.1, null, 40, null, 1, null]];
  const share = usageAverages(games, 'targetShare');
  assert.ok(Math.abs(share.season.value - 0.2) < 1e-9); assert.equal(share.season.n, 3);
  assert.ok(Math.abs(share.recent.value - 0.2) < 1e-9); assert.equal(share.recent.n, 2, 'the unknown Week 3 value is skipped');
  assert.deepEqual(usageAverages(games, 'carryShare').season, { value: null, n: 0 });
});

test('sources: specs cover both seasons with licenses; FTN files are CC BY-SA 4.0; snap counts and Next Gen Stats are never read', () => {
  const specs = defenseSourceSpecs(2026);
  assert.deepEqual(specs.map(spec => spec.file), ['play_by_play_2026.csv.gz', 'ftn_charting_2026.csv', 'pbp_participation_2026.csv', 'play_by_play_2025.csv.gz', 'ftn_charting_2025.csv', 'pbp_participation_2025.csv', 'stats_player_week_2025.csv']);
  assert.deepEqual(specs.filter(spec => spec.license === 'ftn').map(spec => spec.tag), ['ftn_charting', 'pbp_participation', 'ftn_charting', 'pbp_participation']);
  assert.equal(specs.find(spec => spec.file === 'play_by_play_2026.csv.gz').optional, false);
  assert.ok(specs.every(spec => !/snap|nextgen|ngs|pfr/i.test(spec.url)));
});

test('cached sources: checked against the manifest, optional files may be absent, a tampered file is refused', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'gtl-defense-'));
  const csv = columns => `${columns.join(',')}\n${columns.map(() => '1').join(',')}\n`;
  const pbp = gzipSync(Buffer.from(csv(DEFENSE_COLUMNS.pbp))), ftn = Buffer.from(csv(DEFENSE_COLUMNS.ftn));
  const entry = (name, tag, bytes) => ({ name, browser_download_url: `https://github.com/nflverse/nflverse-data/releases/download/${tag}/${name}`, sha256: createHash('sha256').update(bytes).digest('hex'), updated_at: '2026-09-30T10:00:00Z' });
  await writeFile(path.join(dir, 'play_by_play_2026.csv.gz'), pbp);
  await writeFile(path.join(dir, 'ftn_charting_2026.csv'), ftn);
  await writeFile(path.join(dir, 'manifest.json'), JSON.stringify([entry('play_by_play_2026.csv.gz', 'pbp', pbp), entry('ftn_charting_2026.csv', 'ftn_charting', ftn)]));
  const read = await readDefenseSources({ season: 2026, inputDir: dir, root: '/' });
  assert.equal(read.current.pbp.length, 1);
  assert.equal(read.current.ftn.length, 1);
  assert.deepEqual(read.missing, ['pbp_participation_2026.csv', 'play_by_play_2025.csv.gz', 'ftn_charting_2025.csv', 'pbp_participation_2025.csv', 'stats_player_week_2025.csv']);
  assert.deepEqual(read.sources.map(source => source.license), ['CC BY 4.0', 'CC BY-SA 4.0']);
  assert.equal(read.sources[1].attribution, 'FTN Data via nflverse');
  await writeFile(path.join(dir, 'ftn_charting_2026.csv'), Buffer.from('tampered'));
  await assert.rejects(readDefenseSources({ season: 2026, inputDir: dir, root: '/' }), /Unverified cached source: ftn_charting_2026.csv/);
});

test('downloaded sources: release metadata decides; an unpublished optional file is skipped and a checksum mismatch is refused', async () => {
  const body = Buffer.from(`${DEFENSE_COLUMNS.ftn.join(',')}\n${DEFENSE_COLUMNS.ftn.map(() => '1').join(',')}\n`);
  const pbp = gzipSync(Buffer.from(`${DEFENSE_COLUMNS.pbp.join(',')}\n`));
  const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const assets = { pbp: [{ name: 'play_by_play_2026.csv.gz', bytes: pbp }], ftn_charting: [{ name: 'ftn_charting_2026.csv', bytes: body }], pbp_participation: [], stats_player: [] };
  const fetchImpl = async url => {
    const tag = /releases\/tags\/(.+)$/.exec(url)?.[1];
    if (tag) return new Response(JSON.stringify({ assets: (assets[tag] ?? []).map(asset => ({ name: asset.name, size: asset.bytes.byteLength, digest: digest(asset.bytes), browser_download_url: `https://github.com/nflverse/nflverse-data/releases/download/${tag}/${asset.name}`, updated_at: '2026-09-30T10:00:00Z' })) }));
    const asset = Object.values(assets).flat().find(item => url.endsWith(`/${item.name}`));
    return asset ? new Response(asset.bytes) : new Response('missing', { status: 404 });
  };
  const read = await readDefenseSources({ season: 2026, root: '/', fetchImpl, env: {}, log: () => {} });
  assert.equal(read.current.ftn.length, 1);
  assert.ok(read.missing.includes('pbp_participation_2026.csv'));
  assets.ftn_charting[0] = { ...assets.ftn_charting[0], bytes: body };
  const tampered = async url => { const response = await fetchImpl(url); return url.endsWith('ftn_charting_2026.csv') ? new Response(Buffer.from(body.toString().replace('1', '2'))) : response; };
  await assert.rejects(readDefenseSources({ season: 2026, root: '/', fetchImpl: tampered, env: {}, log: () => {} }), /checksum mismatch/);
});

test('attachment is fail-soft: a source failure or invalid block keeps the snapshot as built; an oversize file drops player splits first', async () => {
  const built = defenseSnapshot({ defense: false }), rows = { schedule: [], injuries: [], stats: [] };
  const failed = await attachDefenseInsights(built, { rows, season: SEASON, root: '/', maxBytes: 3_000_000, read: async () => { throw new Error('Source metadata unavailable (403).'); } });
  assert.equal(failed.snapshot, built);
  assert.match(failed.note, /skipped: Source metadata unavailable/);
  const sources = { current: {}, prior: {}, sources: [], missing: [] };
  const invalid = await attachDefenseInsights(built, { rows, season: SEASON, root: '/', maxBytes: 3_000_000, read: async () => sources, build: () => ({ schemaVersion: 99 }) });
  assert.equal(invalid.snapshot.defense, undefined);
  const insights = snapshot.defense;
  const ok = await attachDefenseInsights(built, { rows, season: SEASON, root: '/', maxBytes: 3_000_000, read: async () => sources, build: () => structuredClone(insights) });
  assert.equal(Object.keys(ok.snapshot.defense.players).length, Object.keys(insights.players).length);
  const full = Buffer.byteLength(JSON.stringify(ok.snapshot)), teamsOnly = Buffer.byteLength(JSON.stringify({ ...built, defense: { ...insights, players: {}, trimmed: true } }));
  const trimmed = await attachDefenseInsights(built, { rows, season: SEASON, root: '/', maxBytes: Math.floor((full + teamsOnly) / 2) + 150_000, read: async () => sources, build: () => structuredClone(insights) });
  assert.equal(trimmed.snapshot.defense.trimmed, true);
  assert.deepEqual(trimmed.snapshot.defense.players, {});
  const tooBig = await attachDefenseInsights(built, { rows, season: SEASON, root: '/', maxBytes: 150_000, read: async () => sources, build: () => structuredClone(insights) });
  assert.equal(tooBig.snapshot.defense, undefined);
  assert.match(tooBig.note, /size cap/);
});

test('the insights never store an upcoming spread or total (D-57): only completed-game lines feed one league coefficient', () => {
  const text = JSON.stringify(snapshot.defense);
  assert.doesNotMatch(text, /spread_line|total_line|moneyline/);
  assert.deepEqual(Object.keys(snapshot.defense.games['BBB-AAA']).sort(), ['grass', 'indoor', 'roof', 'stadium', 'surface']);
  assert.ok(Object.keys(snapshot.defense.league.passRateBySpread).every(key => ['games', 'intercept', 'slope'].includes(key)));
});
