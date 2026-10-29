// EPL-DATA-01: all requests are fake. No daily player-map request or real roster is fetched by these tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fetchSleeperSnapshot, SLEEPER_DIRECTORY_MAX_BYTES, SLEEPER_LEAGUE } from '../cloud/epl-sources.mjs';
import { createEplSources, runEplJob } from '../cloud/epl-jobs.mjs';
import { enrichPlayerDisplay, mergePlayerDirectories, snapshotScoringDirectory } from '../shared/epl-player-directory.mjs';
import { teamProjection } from '../shared/epl-fantasy.mjs';
import { trimSleeperSnapshot } from '../shared/epl-sleeper.mjs';
import { buildFantasyView } from '../cloud/epl-fantasy-view.mjs';

const NOW = Date.parse('2026-10-29T15:00:00Z'), DAY = 'daily-2026-10-29', PATH = '/v1/players/clubsoccer:epl';
const OWNER = '865667912365666304';
const scoring = { pos_m_g: 9, pos_f_g: 100, pos_d_g: 1000 };
const roster = { owner_id: OWNER, roster_id: 1, starters: ['1'], players: ['1', '2'], settings: { fpts: 100, fpts_decimal: 0, fpts_against: 90, fpts_against_decimal: 0, wins: 1, losses: 0 } };
const embedded = { first_name: 'Snapshot', last_name: 'Midfielder', position: 'M', team_abbr: 'ARS' };
const directory = {
  1: { full_name: 'Directory renamed forward', position: 'F', fantasy_positions: ['F'], team_abbr: 'MCI' },
  2: { first_name: 'Fixture', last_name: 'Bench', full_name: 'Fixture Bench', position: 'D', fantasy_positions: ['D'], team_abbr: 'LIV', age: 25, injury_notes: 'PRIVATE_UNUSED_SENTINEL', birth_date: '1990-01-01', metadata: { channel_id: 'UNUSED_CHANNEL' } },
  3: { full_name: 'Unrostered sentinel', position: 'GK', team_abbr: 'CHE', metadata: { unused: 'NO_LEAK_SENTINEL' } },
};
function fixture({ response, body = directory, headers, status = 200, throwDirectory, withoutEmbedded = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const u = new URL(url); calls.push({ url: u, options });
    if (u.pathname === PATH) {
      if (throwDirectory) throw new Error('secret URL / account data must not escape');
      return response ? response() : new Response(JSON.stringify(body), { status, headers });
    }
    const values = {
      '/v1/state/clubsoccer:epl': { week: 9, season: '2026' },
      [`/v1/league/${SLEEPER_LEAGUE}`]: { scoring_settings: scoring },
      [`/v1/league/${SLEEPER_LEAGUE}/users`]: [{ user_id: OWNER, display_name: 'Fixture manager' }],
      [`/v1/league/${SLEEPER_LEAGUE}/rosters`]: [roster],
    };
    const rows = [{ player_id: '1', stats: { g: 1 }, ...(withoutEmbedded ? {} : { player: embedded }) }];
    return new Response(JSON.stringify(u.pathname.startsWith('/stats/') || u.pathname.startsWith('/projections/') ? rows : values[u.pathname]));
  };
  return { calls, fetchImpl };
}
const capture = options => fetchSleeperSnapshot({ label: DAY, statsWeek: 8, projectionsWeek: 9, clock: () => NOW, enrichDirectory: true, ...options });
const sha = body => createHash('sha256').update(body).digest('hex');

test('daily capture fills a bench player absent from both stat/projection lists, keeps minimal rostered metadata and raw provenance', async () => {
  const { fetchImpl, calls } = fixture();
  const snapshot = await capture({ fetchImpl });
  assert.equal(calls.length, 7);
  assert.equal(calls.at(-1).url.href, 'https://api.sleeper.app/v1/players/clubsoccer:epl');
  assert.ok(calls.every(({ options }) => options.method === 'GET' && options.redirect === 'error' && options.credentials === 'omit' && options.signal instanceof AbortSignal));
  assert.deepEqual(calls.at(-1).options.headers, { Accept: 'application/json' });
  assert.deepEqual(snapshot.payload.players, {
    1: { name: 'Snapshot Midfielder', position: 'M', team_abbr: 'ARS' },
    2: { name: 'Fixture Bench', team_abbr: 'LIV' },
  });
  assert.equal(snapshot.sha256.player_directory, sha(JSON.stringify(directory)));
  assert.deepEqual(snapshot.payload.sources.player_directory, {
    path: PATH, attemptedAt: '2026-10-29T15:00:00Z', sha256: snapshot.sha256.player_directory,
    status: 'available', rostered: 2, mapped: 2, named: 2, missingEntries: 0, missingNames: 0,
  });
  const stored = JSON.stringify(snapshot.payload);
  for (const sentinel of ['Unrostered sentinel', 'PRIVATE_UNUSED_SENTINEL', 'NO_LEAK_SENTINEL', 'UNUSED_CHANNEL', 'birth_date', 'fantasy_positions']) assert.ok(!stored.includes(sentinel), sentinel);
  assert.deepEqual(trimSleeperSnapshot(snapshot.payload).players, snapshot.payload.players, 'a stored read/trim preserves the minimal supplement');
  const view = buildFantasyView({ snapshots: [snapshot], viewerOwnerId: OWNER });
  assert.equal(view.rosters[0].bench[0].name, 'Fixture Bench');
  assert.equal(view.rosters[0].bench[0].pos, null, 'current-directory position is not a snapshot scoring fact');
  assert.equal(view.matchup.myProj, 9, 'embedded M position wins over the directory F position');
});

test('only the worker current-day daily capture opts into the directory; no weekly, recheck, stale daily or API-view request does', async () => {
  const { fetchImpl, calls } = fixture();
  const sources = createEplSources({ fetchImpl, clock: () => NOW });
  await sources.sleeper({ label: 'before-mw9-kickoff', statsWeek: 8, projectionsWeek: 9 });
  await sources.sleeper({ label: 'after-mw8', statsWeek: 8, projectionsWeek: 9 });
  await sources.sleeper({ label: 'after-mw8-recheck', statsWeek: 8, projectionsWeek: 9 });
  await sources.sleeper({ label: 'daily-2026-10-28', statsWeek: 8, projectionsWeek: 9 });
  await fetchSleeperSnapshot({ fetchImpl, label: DAY, statsWeek: 8, projectionsWeek: 9, clock: () => NOW });
  assert.equal(calls.filter(c => c.url.pathname === PATH).length, 0);
  await sources.sleeper({ label: DAY, statsWeek: 8, projectionsWeek: 9 });
  assert.equal(calls.filter(c => c.url.pathname === PATH).length, 1);
});

test('display-only newer entries preserve embedded positions and historical scoring; an unknown position stays unknown', async () => {
  const original = { rosters: [{ ...roster, starters: ['1', '2'] }], players: { 1: { name: 'Recorded midfielder', position: 'M', team_abbr: 'ARS' } } };
  const frozen = JSON.stringify(original);
  const enriched = enrichPlayerDisplay(original, directory);
  assert.equal(JSON.stringify(original), frozen, 'supplement does not modify the historical input');
  assert.equal(enriched.players['1'].position, 'M'); assert.equal(enriched.players['2'].position, undefined);
  const projections = { 1: { g: 1 }, 2: { g: 1 } };
  assert.deepEqual(teamProjection(['1', '2'], projections, enriched.players, scoring), teamProjection(['1', '2'], projections, original.players, scoring));
  const old = { 1: { name: 'Recorded midfielder', position: 'M', team_abbr: 'ARS' } };
  const displayOnly = enrichPlayerDisplay({ rosters: [roster] }, directory).players;
  const merged = mergePlayerDirectories(old, displayOnly);
  assert.equal(merged['1'].position, 'M');
  assert.equal(mergePlayerDirectories(old, { 1: { position: null } })['1'].position, null, 'explicit snapshot null is not overwritten');
  // A later daily capture has projections but its stat rows do not embed players. Its display supplement cannot
  // borrow a scoring position from an older snapshot, even though names can use the display lookup.
  const { fetchImpl } = fixture({ withoutEmbedded: true });
  const daily = await capture({ fetchImpl });
  const earlier = structuredClone(daily); earlier.label = 'after-mw08'; earlier.capturedAt = '2026-10-28T15:00:00Z'; earlier.payload.players = old;
  const view = buildFantasyView({ snapshots: [earlier, daily], viewerOwnerId: OWNER });
  assert.equal(view.matchup.myProj, null);
  assert.equal(view.matchup.starters[0].proj, null);
  assert.equal(view.matchup.starters[0].pos, null);
});

test('historical display-only lineups never borrow a later scoring position; an actual captured historical position wins', () => {
  const beforePayload = { state: { week: 9, season: '2026' }, league: { scoring_settings: scoring }, rosters: [roster],
    players: { 1: { name: 'Earlier display only', team_abbr: 'ARS' } }, projections_mw9: [{ player_id: '1', stats: { g: 1 } }] };
  const afterPayload = { ...structuredClone(beforePayload), state: { week: 10, season: '2026' },
    rosters: [{ ...roster, settings: { ...roster.settings, fpts: 109 } }], stats_mw9: [{ player_id: '1', stats: { g: 1 } }] };
  const laterPayload = { ...structuredClone(afterPayload), players: { 1: { name: 'Later forward', position: 'F', fantasy_positions: ['F'], team_abbr: 'LIV' } }, projections_mw10: [{ player_id: '1', stats: { g: 1 } }] };
  const snapshots = [
    { label: 'before-mw9-kickoff', capturedAt: '2026-10-31T12:00:00Z', week: 9, payload: beforePayload },
    { label: 'after-mw9', capturedAt: '2026-11-04T00:00:00Z', week: 9, payload: afterPayload },
    { label: 'daily-2026-11-05', capturedAt: '2026-11-05T00:00:00Z', week: 10, payload: laterPayload },
  ];
  const view = buildFantasyView({ snapshots, viewerOwnerId: OWNER });
  assert.equal(view.matchup.myProj, 100, 'the later projection can use its own captured F position');
  assert.equal(view.matchup.recent.find(row => row.week === 9).projected, null, 'earlier display-only lineup stays unknown');
  assert.deepEqual(view.insights.topScorerPerTeam, []);
  assert.equal(view.insights.myTopScorer, null);
  assert.equal(view.insights.beatProjection.find(row => row.week === 9).diff, null);
  const missing = snapshotScoringDirectory(beforePayload, laterPayload.players)['1'];
  assert.equal(missing.position, undefined); assert.equal(missing.fantasy_positions, undefined);
  beforePayload.players['1'].position = 'M';
  const recorded = buildFantasyView({ snapshots, viewerOwnerId: OWNER });
  assert.equal(recorded.matchup.recent.find(row => row.week === 9).projected, 9);
  assert.equal(recorded.insights.myTopScorer.points, 9, 'captured M scores 9, not later F 100');
  assert.equal(recorded.insights.beatProjection.find(row => row.week === 9).diff, 0);
});

test('partial, malformed, inherited and oversized metadata remain missing and prototype fields never become players', async () => {
  const snapshot = { rosters: [{ players: ['2', '3', '4', '5', '0', '__proto__', 'constructor'] }], players: { 3: { position: 'D', name: null, team_abbr: null } } };
  const map = Object.assign(Object.create({ 4: { full_name: 'Inherited sentinel' } }), {
    2: { first_name: '  Fixture ', last_name: ' Bench ', team_abbr: ' liv ', position: 'D' },
    3: { full_name: 'x'.repeat(121), first_name: '\u0000bad', team_abbr: '<html>' },
    5: null,
  });
  const { players, coverage } = enrichPlayerDisplay(snapshot, map);
  assert.deepEqual(players, { 2: { name: 'Fixture Bench', team_abbr: 'LIV' }, 3: { position: 'D', name: null, team_abbr: null } });
  assert.deepEqual(coverage, { rostered: 6, mapped: 2, named: 1, missingEntries: 4, missingNames: 5 }, 'a directory key alone does not establish a usable name');
  assert.equal(Object.getPrototypeOf(mergePlayerDirectories(JSON.parse('{"__proto__":{"position":"F"},"constructor":{"name":"bad"}}'))), null);
  assert.deepEqual(Object.keys(mergePlayerDirectories(JSON.parse('{"__proto__":{"position":"F"},"constructor":{"name":"bad"}}'))), []);
});

test('optional directory outages and invalid maps preserve the base snapshot and record a safe unavailable reason', async () => {
  for (const [config, code] of [
    [{ status: 503 }, 'EPL_SOURCE_UNAVAILABLE'], [{ status: 429 }, 'EPL_SOURCE_RATE_LIMIT'],
    [{ throwDirectory: true }, 'EPL_SOURCE_UNAVAILABLE'], [{ body: [] }, 'EPL_SOURCE_PAYLOAD'],
    [{ body: null }, 'EPL_SOURCE_PAYLOAD'], [{ body: Object.fromEntries(Array.from({ length: 10001 }, (_, i) => [i, {}])) }, 'EPL_SOURCE_PAYLOAD'],
    [{ response: () => new Response('{not json') }, 'EPL_SOURCE_PAYLOAD'],
    [{ headers: { 'content-length': String(SLEEPER_DIRECTORY_MAX_BYTES + 1) } }, 'EPL_SOURCE_BODY_LIMIT'],
    [{ response: () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(SLEEPER_DIRECTORY_MAX_BYTES + 1)); controller.close(); } })) }, 'EPL_SOURCE_BODY_LIMIT'],
  ]) {
    const { fetchImpl, calls } = fixture(config);
    const snapshot = await capture({ fetchImpl });
    assert.equal(snapshot.payload.state.week, 9);
    assert.deepEqual(snapshot.payload.rosters, [roster]);
    assert.equal(snapshot.payload.players['1'].position, 'M');
    assert.equal(snapshot.payload.players['2'], undefined);
    assert.equal(snapshot.payload.sources.player_directory.status, 'unavailable');
    assert.equal(snapshot.payload.sources.player_directory.code, code);
    assert.equal(snapshot.payload.sources.player_directory.missingNames, 1);
    assert.equal(calls.filter(c => c.url.pathname === PATH).length, 1, 'no immediate retry');
    assert.ok(!JSON.stringify(snapshot).includes('secret URL'));
  }
});

for (const recheckInstalled of [false, true]) test(`a good daily base capture with a failed optional directory is saved without same-day retry (M33 ${recheckInstalled ? 'installed' : 'absent'})`, async () => {
  const { fetchImpl, calls } = fixture({ status: 503 });
  let now = NOW;
  const sources = createEplSources({ fetchImpl, clock: () => now });
  const state = { week: { season: 2026, week: 9, status: 'open', firstKickoff: '2026-10-31T12:30:00Z', windowEnd: '2026-11-04T00:00:00Z' }, fixtures: [], snapshots: [] };
  const saved = [];
  const service = { async rpc(name, args) {
    if (name === 'gtl_epl_jobs_state') return state;
    if (name === 'gtl_epl_recheck_state') {
      if (recheckInstalled) return null;
      throw Object.assign(new Error('Optional M33 RPC not installed.'), { code: 'GTL_EPL_RECHECK_OFF' });
    }
    assert.equal(name, 'gtl_epl_save_snapshot');
    saved.push(args); state.snapshots.push(args.p_label); return true;
  } };
  const run = () => runEplJob({ job: 'snapshot', service, sources, now, run: {} });
  const first = await run();
  assert.equal(first.reason, null);
  assert.equal(first.detail.recheckReady, recheckInstalled);
  assert.equal(saved[0].p_label, DAY);
  assert.equal(saved[0].p_payload.sources.player_directory.status, 'unavailable');
  assert.equal(saved[0].p_payload.players['1'].position, 'M');
  now += 3600000;
  assert.equal((await run()).reason, 'nothing_due');
  assert.equal(saved.length, 1);
  assert.equal(calls.filter(c => c.url.pathname === PATH).length, 1);
  now += 86400000;
  assert.equal((await run()).reason, null);
  assert.equal(saved[1].p_label, 'daily-2026-10-30');
  assert.equal(calls.filter(c => c.url.pathname === PATH).length, 2, 'next UTC day may try once again');
});
