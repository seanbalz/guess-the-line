// D-82 Player Props jobs (cloud/player-prop-jobs.mjs, scripts/player-props-jobs.mjs, scripts/player-props-sources.mjs).
// Synthetic fixtures only: no provider, no hosted read, no credit. Lines, stats and players are illustrative values, not
// bookmaker quotes, nflverse records or account data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { PROP_CHECK_REASONS, PROP_JOB_RPCS, PROP_JOB_TABLES, PROP_OFFER_REASONS, decidePropResult, latestRetainedQuotes, observePropResult, propCandidates,
  propRosterFacts, propScheduleGames, propWeekSnaps, propWeekStats, reviewPropCandidate, runPropOffersJob, runPropResultsJob } from '../cloud/player-prop-jobs.mjs';
import { createPropJobsService, parseArgs, run } from '../scripts/player-props-jobs.mjs';
import { propSourceSpecs, readPropSource } from '../scripts/player-props-sources.mjs';
import { SEASON, WEEK, EVENT, GAME, WR, RB, QB, CUT, KICK, NOW, RUN, REQ, at, gamesCsv, rosterCsv, statsCsv, snapsCsv, quote, threeBooks, fetchRow, file,
  fakeSources, fakeService } from './helpers/player-prop-job-fixtures.mjs';

test('parsers: schedule kickoffs in UTC with app codes and finality, roster facts fail closed on conflicts, week stats and snaps', () => {
  const games = propScheduleGames(gamesCsv({ scored: true }), { season: SEASON });
  assert.deepEqual(games[0], { eventId: EVENT, week: 10, away: 'DAL', home: 'PHI', kickoff: KICK, scored: true });
  assert.equal(games[1].away, 'LAR', 'nflverse LA is the app\'s LAR');
  assert.equal(propScheduleGames(gamesCsv(), { season: SEASON })[0].scored, false);
  const roster = propRosterFacts(rosterCsv(), { season: SEASON, week: WEEK, playerIds: [WR, QB, 'not-gsis'] });
  assert.deepEqual(roster.get(WR), { team: 'DAL', position: 'WR', status: 'ACT', name: 'Fixture Receiver', pfrId: 'pfrWR' });
  assert.equal(roster.has(RB), false, 'only requested players');
  const twice = propRosterFacts(rosterCsv([[WR, 'DAL', 'WR', 'ACT', 'Fixture Receiver', 'p'], [WR, 'NYG', 'WR', 'ACT', 'Fixture Receiver', 'p']]), { season: SEASON, week: WEEK, playerIds: [WR] });
  assert.deepEqual(twice.get(WR), { conflict: true });
  const stats = propWeekStats(statsCsv(), { season: SEASON, week: WEEK });
  assert.ok(stats.games.has(EVENT)); assert.equal(stats.byPlayer.get(WR)[0].receiving_yards, '87');
  assert.equal(propWeekSnaps(snapsCsv([['pfrQB', 0], ['pfrWR', 40]]), { season: SEASON, week: WEEK }).get(`${EVENT}:pfrWR`), 40);
});

test('retained quotes: only the newest finished fetch per game and market counts, so a later empty reply invalidates older quotes', () => {
  const older = fetchRow(threeBooks(), { requestId: REQ[1], minutesAgo: 30 });
  const newerEmpty = fetchRow([], { requestId: REQ[0], minutesAgo: 4 });
  assert.deepEqual(latestRetainedQuotes([older, newerEmpty]), []);
  const kept = latestRetainedQuotes([older, fetchRow(threeBooks(), { requestId: REQ[0], minutesAgo: 4, markets: ['player_receptions'] })]);
  assert.equal(kept.length, 6, 'a fetch of another market leaves this market\'s newest quotes in place');
  assert.ok(kept.every(k => k.requestId === REQ[1]));
  assert.deepEqual(latestRetainedQuotes([fetchRow(threeBooks(), { status: 'running' }), fetchRow(threeBooks(), { error: 'provider_unavailable' })]), []);
  const mixed = fetchRow([...threeBooks(), quote('draftkings', 'over', 0.5, { key: 'player_anytime_td' }), quote('draftkings', 'over', 70.5, { key: 'player_reception_yds_alternate' })],
    { markets: ['player_reception_yds', 'player_anytime_td', 'player_reception_yds_alternate'] });
  const { candidates, outsideCatalog } = propCandidates(latestRetainedQuotes([mixed]));
  assert.equal(candidates.length, 1); assert.equal(outsideCatalog, 2, 'binary TD and alternate lines are outside the numeric catalog');
  assert.deepEqual(candidates[0].requests, [REQ[0]]);
});

test('offer review: exact event, kickoff, stable player ID, current roster and a three-book median, or explicit reasons', () => {
  const games = propScheduleGames(gamesCsv(), { season: SEASON });
  const roster = propRosterFacts(rosterCsv(), { season: SEASON, week: WEEK, playerIds: [WR, RB, QB, CUT] });
  const ctx = { season: SEASON, week: WEEK, games, roster, now: NOW, sourceName: 'fixture' };
  const candidate = (quotes, playerRef = WR, stat = 'player_reception_yds') => ({ gameId: GAME, playerRef, stat, quotes, requests: [REQ[0]] });
  const ok = reviewPropCandidate(candidate(threeBooks([66.5, 70.5, 67.5])), ctx);
  assert.equal(ok.eligible, true); assert.deepEqual(ok.reasons, []);
  assert.equal(ok.reference.line, 67.5); assert.equal(ok.reference.books.length, 3);
  assert.deepEqual(ok.offer, { season: SEASON, week: WEEK, eventId: EVENT, playerId: WR, stat: 'player_reception_yds', playerName: 'Fixture Receiver', team: 'DAL',
    position: 'WR', away: 'DAL', home: 'PHI', kickoff: KICK, source: 'fixture' });
  assert.notEqual(ok.offer.playerName, 'Provider Name', 'the name comes from the verified roster, never the provider');
  const reasons = (c, extra = {}) => reviewPropCandidate(c, { ...ctx, ...extra }).reasons;
  assert.deepEqual(reasons(candidate(threeBooks(undefined, { player: 'roster-7' }), 'roster-7')), ['player_id_invalid']);
  assert.deepEqual(reasons(candidate(threeBooks(undefined, { player: QB }), QB)), ['roster_inactive']);
  assert.deepEqual(reasons(candidate(threeBooks(undefined, { player: CUT }), CUT)), ['position_unsupported']);
  assert.deepEqual(reasons(candidate(threeBooks(undefined, { player: '00-0000001' }), '00-0000001')), ['roster_unverified']);
  assert.deepEqual(reasons(candidate(threeBooks().filter(q => q.book !== 'betmgm'))), ['reference_missing_book']);
  assert.deepEqual(reasons(candidate(threeBooks([60.5, 67.5, 68.5]))), ['reference_books_disagree']);
  assert.deepEqual(reasons(candidate(threeBooks(undefined, { kickoff: '2026-11-15T21:25:00.000Z' }))), ['kickoff_mismatch']);
  assert.deepEqual(reasons(candidate(threeBooks()), { now: Date.parse(KICK) }), ['kicked_off']);
  assert.deepEqual(reasons({ ...candidate(threeBooks()), gameId: 'NYG-WAS' }), ['event_unmapped']);
  const traded = propRosterFacts(rosterCsv([[WR, 'NYG', 'WR', 'ACT', 'Fixture Receiver', 'p']]), { season: SEASON, week: WEEK, playerIds: [WR] });
  assert.deepEqual(reasons(candidate(threeBooks()), { roster: traded }), ['roster_team_mismatch']);
  for (const r of ['player_id_invalid', 'roster_inactive', 'reference_missing_book']) assert.ok(PROP_OFFER_REASONS.includes(r));
});

test('offer job dry run: reads retained quotes and the verified roster/schedule only, writes nothing, counts-only summary', async () => {
  const service = fakeService({ ready: false, rows: [fetchRow([...threeBooks(), ...threeBooks(undefined, { player: QB })])] });
  const sources = fakeSources({ schedule: file('schedule', gamesCsv()), rosters: file('rosters', rosterCsv()) });
  const summary = await runPropOffersJob({ service, sources, season: SEASON, week: WEEK, now: NOW, runId: RUN });
  assert.deepEqual({ ...summary, written: undefined }, { job: 'offers', season: SEASON, week: WEEK, runId: RUN, mode: 'dry_run', status: 'ok', ready: false, blocked: null,
    fetches: 1, candidates: 2, outsideCatalog: 0, eligible: 1, ineligible: 1, reasons: { roster_inactive: 1 }, written: undefined });
  assert.deepEqual(service.calls.map(c => c[0]), ['gtl_props_jobs_capability', 'rows'], 'no writer in a dry run');
  const query = service.calls[1][2];
  assert.equal(query.status, 'eq.finished'); assert.equal(query.error, 'is.null'); assert.equal(query.started_at, `gte.${at(360)}`);
  assert.deepEqual(sources.reads, ['schedule', 'rosters']);
  assert.doesNotMatch(JSON.stringify(summary), /Fixture|Provider|67\.5|-110/, 'no name, line or price in the summary');
});

test('offer job writes only when asked; while dark it also needs record-while-dark; an unapplied schema is a no-op', async () => {
  const rows = [fetchRow([...threeBooks(), ...threeBooks(undefined, { player: QB })])];
  const sources = () => fakeSources({ schedule: file('schedule', gamesCsv()), rosters: file('rosters', rosterCsv()) });
  const dark = fakeService({ ready: false, rows });
  const blocked = await runPropOffersJob({ service: dark, sources: sources(), season: SEASON, week: WEEK, now: NOW, runId: RUN, write: true });
  assert.equal(blocked.mode, 'dry_run'); assert.equal(blocked.blocked, 'dark');
  assert.ok(dark.calls.every(([name]) => ['gtl_props_jobs_capability', 'rows'].includes(name)));

  const service = fakeService({ ready: false, rows });
  const summary = await runPropOffersJob({ service, sources: sources(), season: SEASON, week: WEEK, now: NOW, runId: RUN, write: true, recordWhileDark: true });
  assert.equal(summary.mode, 'write');
  assert.deepEqual(summary.written, { offers: 1, references: 1, reviews: 2 });
  const names = service.calls.map(c => c[0]).filter(n => n !== 'rows');
  assert.deepEqual(names, ['gtl_props_jobs_capability', 'gtl_props_record_offer', 'gtl_props_record_reference', 'gtl_props_record_review', 'gtl_props_record_review']);
  const reviews = service.calls.filter(c => c[0] === 'gtl_props_record_review').map(c => c[1].p_review);
  assert.deepEqual(reviews.map(r => [r.playerRef, r.eligible, r.reasons]), [[WR, true, []], [QB, false, ['roster_inactive']]]);
  assert.equal(reviews[0].referenceId, '00000000-0000-4000-8000-00000000beef'); assert.equal(reviews[1].referenceId, null);
  assert.deepEqual(reviews[0].quoteRequests, [REQ[0]]); assert.equal(reviews[0].sources.length, 2);
  const ref = service.calls.find(c => c[0] === 'gtl_props_record_reference')[1];
  assert.equal(ref.p_line, 67.5); assert.equal(ref.p_event_id, EVENT);

  const refused = fakeService({ ready: true, rows, refuse: { gtl_props_record_reference: 'GTL_PROPS_REFERENCE_UNAVAILABLE' } });
  const r = await runPropOffersJob({ service: refused, sources: sources(), season: SEASON, week: WEEK, now: NOW, runId: RUN, write: true });
  assert.deepEqual(r.reasons, { reference_refused: 1, roster_inactive: 1 }); assert.equal(r.eligible, 0);
  const changed = fakeService({ ready: true, rows, refuse: { gtl_props_record_offer: 'GTL_PROPS_INVALID' } });
  assert.equal((await runPropOffersJob({ service: changed, sources: sources(), season: SEASON, week: WEEK, now: NOW, runId: RUN, write: true })).reasons.offer_identity_changed, 1);

  const missing = fakeService({ missing: true });
  const none = await runPropOffersJob({ service: missing, sources: fakeSources({}), season: SEASON, week: WEEK, now: NOW, runId: RUN, write: true, recordWhileDark: true });
  assert.equal(none.status, 'schema_unavailable'); assert.equal(missing.calls.length, 1);
  const empty = fakeService({ rows: [] }), emptySources = fakeSources({});
  assert.equal((await runPropOffersJob({ service: empty, sources: emptySources, season: SEASON, week: WEEK, now: NOW, runId: RUN })).candidates, 0);
  assert.deepEqual(emptySources.reads, [], 'no candidate, no source read');
  await assert.rejects(runPropOffersJob({ service: empty, sources: emptySources, season: SEASON, week: 0, now: NOW, runId: RUN }), /season and week/);
});

const FINAL_AT = Date.parse(KICK) + 30 * 3_600_000;
const resultFiles = ({ stats = statsCsv(), snaps = snapsCsv(), roster = rosterCsv(), scored = true, moved = false, statsSha = null, updatedAt = new Date(FINAL_AT - 3_600_000).toISOString() } = {}) => ({
  stats: file('stats', stats, { updatedAt, sha: statsSha }), snaps: file('snaps', snaps, { updatedAt }), rosters: file('rosters', roster, { updatedAt }),
  schedule: file('schedule', gamesCsv({ scored, moved }), { updatedAt }) });
const offerOf = (playerId, stat = 'player_reception_yds', extra = {}) => ({ eventId: EVENT, playerId, stat, team: 'DAL', away: 'DAL', home: 'PHI', kickoff: KICK, result: null, lastCheck: null, ...extra });
function observe(offer, opts = {}, now = FINAL_AT) {
  const files = resultFiles(opts);
  return observePropResult(offer, { season: SEASON, week: WEEK, now, files, games: propScheduleGames(files.schedule.text, { season: SEASON }),
    stats: propWeekStats(files.stats.text, { season: SEASON, week: WEEK }), snaps: propWeekSnaps(files.snaps.text, { season: SEASON, week: WEEK }),
    roster: propRosterFacts(files.rosters.text, { season: SEASON, week: WEEK, playerIds: [offer.playerId] }) });
}

test('result observation: participation before a zero, finality, and every unverifiable case stays ungraded with its reason', () => {
  const pick = ({ status, actual, participated, reason }) => ({ status, actual, participated, reason });
  assert.deepEqual(pick(observe(offerOf(WR))), { status: 'final', actual: 87, participated: true, reason: undefined });
  assert.deepEqual(pick(observe(offerOf(RB))), { status: 'final', actual: 0, participated: true, reason: undefined }, 'a stats row is participation: 0 is a real result');
  assert.equal(observe(offerOf(WR), { scored: false }).reason, 'not_final');
  assert.equal(observe(offerOf(WR), { updatedAt: KICK }).reason, 'not_final', 'a release from during the game is not final');
  assert.equal(observe(offerOf(WR), {}, Date.parse(KICK) - 1).reason, 'not_started');
  assert.equal(observe(offerOf(WR), { stats: statsCsv([]) }).reason, 'stats_not_covering_game');
  // No row: a missing row is never a zero without participation evidence.
  const noRow = statsCsv([[RB, EVENT, 0, 2]]);
  assert.equal(observe(offerOf(WR), { stats: noRow }).reason, 'participation_unverified');
  assert.deepEqual(pick(observe(offerOf(WR), { stats: noRow, snaps: snapsCsv([['pfrWR', 31]]) })), { status: 'final', actual: 0, participated: true, reason: undefined });
  assert.deepEqual(pick(observe(offerOf(WR), { stats: noRow, snaps: snapsCsv([['pfrWR', 0]]) })), { status: 'dnp', actual: null, participated: false, reason: undefined });
  assert.deepEqual(pick(observe(offerOf(QB, 'player_pass_yds'), { stats: noRow })), { status: 'dnp', actual: null, participated: false, reason: undefined }, 'inactive');
  assert.equal(observe(offerOf(WR), { stats: statsCsv([[WR, EVENT, 87, 6], [WR, EVENT, 88, 6], [RB, EVENT, 0, 2]]) }).reason, 'duplicate_stat_rows');
  assert.equal(observe(offerOf(WR), { stats: statsCsv([[WR, EVENT, '', 6]]) }).reason, 'stat_missing');
  assert.equal(observe(offerOf(WR), { stats: statsCsv([[WR, '2026_10_LA_SF', 87, 6], [RB, EVENT, 0, 2]]) }).status, 'identity_unverified');
  assert.equal(observe(offerOf(WR), { moved: true }).status, 'cancelled');
  assert.equal(observe({ ...offerOf(WR), eventId: '2026_10_NYG_WAS', away: 'NYG', home: 'WAS' }).reason, 'event_missing');
  for (const reason of ['not_final', 'participation_unverified', 'stat_missing']) assert.ok(PROP_CHECK_REASONS.includes(reason));
});

test('versioning: first verified final records, repeats are unchanged, a correction waits for a second verified release', () => {
  const offer = offerOf(WR);
  const obs = (actual, sha) => ({ status: 'final', actual, participated: true, source: { name: 'nflverse stats', sha256: sha, retrievedAt: KICK } });
  const first = decidePropResult({ offer, latest: null, lastCheck: null, observation: obs(87, 'a'.repeat(64)) });
  assert.equal(first.outcome, 'recorded'); assert.equal(first.receipt.status, 'final'); assert.equal(first.receipt.actual, 87);
  const latest = { version: 1, status: 'final', actual: 87 };
  assert.equal(decidePropResult({ offer, latest, lastCheck: null, observation: obs(87, 'b'.repeat(64)) }).outcome, 'unchanged');
  const corr = decidePropResult({ offer, latest, lastCheck: null, observation: obs(91, 'b'.repeat(64)) });
  assert.equal(corr.outcome, 'correction_pending'); assert.equal(corr.receipt.status, 'correction_pending'); assert.equal(corr.receipt.actual, null);
  const pending = { version: 2, status: 'correction_pending', actual: null };
  const seen = { observedStatus: 'final', observedActual: 91, sourceSha256: 'b'.repeat(64) };
  assert.equal(decidePropResult({ offer, latest: pending, lastCheck: seen, observation: obs(91, 'b'.repeat(64)) }).outcome, 'correction_unconfirmed', 'the same file twice confirms nothing');
  assert.equal(decidePropResult({ offer, latest: pending, lastCheck: seen, observation: obs(92, 'c'.repeat(64)) }).outcome, 'correction_unconfirmed');
  const confirmed = decidePropResult({ offer, latest: pending, lastCheck: seen, observation: obs(91, 'c'.repeat(64)) });
  assert.equal(confirmed.outcome, 'recorded'); assert.equal(confirmed.receipt.actual, 91);
  assert.deepEqual(decidePropResult({ offer, latest, lastCheck: null, observation: { status: null, reason: 'participation_unverified', source: {} } }),
    { outcome: 'ungraded', receipt: null }, 'a missing row never regresses a recorded final');
});

test('result job dry run and write: due offers only, verified files read once, receipts and checks written only when allowed', async () => {
  const state = { ready: true, season: SEASON, week: WEEK, offers: [offerOf(WR), offerOf(RB), offerOf(QB, 'player_pass_yds'), { ...offerOf(WR, 'player_receptions'), kickoff: '2026-11-30T18:00:00.000Z' }] };
  const files = resultFiles({ stats: statsCsv([[WR, EVENT, 87, 6]]) });
  const dry = fakeService({ state }), drySources = fakeSources(files);
  const summary = await runPropResultsJob({ service: dry, sources: drySources, season: SEASON, week: WEEK, now: FINAL_AT, runId: RUN });
  assert.deepEqual({ offers: summary.offers, due: summary.due, outcomes: summary.outcomes, ungraded: summary.ungraded, observed: summary.observed, mode: summary.mode },
    { offers: 4, due: 3, outcomes: { recorded: 2, ungraded: 1 }, ungraded: { participation_unverified: 1 }, observed: { final: 1, dnp: 1 }, mode: 'dry_run' });
  assert.deepEqual(dry.calls.map(c => c[0]), ['gtl_props_jobs_capability', 'gtl_props_jobs_state']);
  assert.deepEqual(drySources.reads, ['stats', 'snaps', 'rosters', 'schedule']);

  const service = fakeService({ state, ready: false });
  const written = await runPropResultsJob({ service, sources: fakeSources(files), season: SEASON, week: WEEK, now: FINAL_AT, runId: RUN, write: true, recordWhileDark: true });
  assert.deepEqual(written.written, { results: 2, checks: 3 });
  const results = service.calls.filter(c => c[0] === 'gtl_props_record_result').map(c => c[1].p_result);
  assert.deepEqual(results.map(r => [r.playerId, r.status, r.actual, r.participated]), [[WR, 'final', 87, true], [QB, 'dnp', null, false]]);
  assert.equal(results[0].sourceSha256, files.stats.sha256); assert.equal(results[1].sourceSha256, files.rosters.sha256);
  const checks = service.calls.filter(c => c[0] === 'gtl_props_record_check').map(c => c[1].p_check);
  assert.deepEqual(checks.map(c => [c.playerId, c.outcome, c.reason, c.resultVersion]), [[WR, 'recorded', null, 1], [RB, 'ungraded', 'participation_unverified', null], [QB, 'recorded', null, 2]]);

  const early = fakeService({ state }), earlySources = fakeSources({});
  assert.equal((await runPropResultsJob({ service: early, sources: earlySources, season: SEASON, week: WEEK, now: NOW, runId: RUN })).due, 0);
  assert.deepEqual(earlySources.reads, [], 'nothing is downloaded before a kickoff');
  const missing = await runPropResultsJob({ service: fakeService({ missing: true }), sources: fakeSources({}), season: SEASON, week: WEEK, now: FINAL_AT, runId: RUN, write: true });
  assert.equal(missing.status, 'schema_unavailable');
  const darkOnly = await runPropResultsJob({ service: fakeService({ state, ready: false }), sources: fakeSources(files), season: SEASON, week: WEEK, now: FINAL_AT, runId: RUN, write: true });
  assert.equal(darkOnly.blocked, 'dark'); assert.deepEqual(darkOnly.written, { results: 0, checks: 0 });
});

function releaseFetch({ text = 'a,b\n1,2\n', size, digest, tag = 'stats_player', name = 'stats_player_week_2026.csv' } = {}) {
  const bytes = Buffer.from(text);
  const url = `https://github.com/nflverse/nflverse-data/releases/download/${tag}/${name}`;
  const calls = [];
  const fetchImpl = async (target, options) => {
    calls.push({ url: String(target), headers: { ...(options?.headers ?? {}) } });
    if (String(target).startsWith('https://api.github.com/')) return new Response(JSON.stringify({ assets: [{ name, browser_download_url: url, size: size ?? bytes.byteLength,
      digest: digest === undefined ? `sha256:${createHash('sha256').update(bytes).digest('hex')}` : digest, updated_at: '2026-11-16T10:00:00Z' }] }), { status: 200 });
    if (String(target) === url) return new Response(bytes, { status: 200 });
    return new Response('no', { status: 404 });
  };
  return { fetchImpl, calls };
}

test('sources: published byte length and SHA-256 must both match, a missing digest is refused, the token goes only to api.github.com', async () => {
  const spec = propSourceSpecs(2026).stats;
  assert.equal(spec.url, 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv');
  const ok = releaseFetch();
  const read = await readPropSource(spec, { fetchImpl: ok.fetchImpl, env: { GH_TOKEN: 'ghs_testOnly' }, clock: () => NOW });
  assert.equal(read.sha256, createHash('sha256').update('a,b\n1,2\n').digest('hex'));
  assert.equal(read.license, 'CC BY 4.0'); assert.equal(read.updatedAt, '2026-11-16T10:00:00.000Z'); assert.equal(read.text, 'a,b\n1,2\n');
  for (const call of ok.calls) assert.equal(call.headers.Authorization, call.url.startsWith('https://api.github.com/') ? 'Bearer ghs_testOnly' : undefined);
  await assert.rejects(readPropSource(spec, { fetchImpl: releaseFetch({ size: 3 }).fetchImpl }), /changed during download/);
  await assert.rejects(readPropSource(spec, { fetchImpl: releaseFetch({ digest: `sha256:${'0'.repeat(64)}` }).fetchImpl }), /checksum mismatch/);
  await assert.rejects(readPropSource(spec, { fetchImpl: releaseFetch({ digest: null }).fetchImpl }), /digest unavailable/);
  await assert.rejects(readPropSource(spec, { fetchImpl: releaseFetch({ name: 'other.csv' }).fetchImpl }), /asset unavailable/);
  await assert.rejects(readPropSource({ ...spec, maxBytes: 2 }, { fetchImpl: releaseFetch().fetchImpl }), /too large/);
});

test('CLI and adapter: explicit inputs, allow-listed RPCs and table, missing schema is SCHEMA_MISSING, credentials required and never printed', async () => {
  assert.deepEqual(parseArgs(['offers', '--season', '2026', '--week', '10']), { job: 'offers', write: false, recordWhileDark: false, runId: null, season: 2026, week: 10 });
  assert.throws(() => parseArgs(['collect', '--season', '2026', '--week', '10']), /offers or results/);
  assert.throws(() => parseArgs(['results', '--season', '2026']), /--season and --week/);
  assert.throws(() => createPropJobsService({ url: 'https://example.com', serviceRoleKey: 'k' }), /not configured/);
  assert.throws(() => createPropJobsService({ url: 'https://abc.supabase.co', serviceRoleKey: '' }), /not configured/);
  const seen = [];
  const fetchImpl = async (target, options) => {
    seen.push([String(target), options.method, options.headers.Authorization]);
    return new Response(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }), { status: 404 });
  };
  const service = createPropJobsService({ url: 'https://abc.supabase.co', serviceRoleKey: 'service-key-fixture', fetchImpl });
  await assert.rejects(service.rpc('gtl_props_jobs_capability', {}), error => error.code === 'SCHEMA_MISSING');
  await assert.rejects(service.rpc('gtl_begin_research_quotes', {}), /Invalid Player Props jobs operation/);
  await assert.rejects(service.rows('gtl_prop_guesses', {}), /Invalid Player Props jobs read/);
  const lines = [];
  const summary = await run(['offers', '--season', '2026', '--week', '10', '--write'], { env: { GTL_PROPS_SUPABASE_URL: 'https://abc.supabase.co', GTL_PROPS_SERVICE_ROLE_KEY: 'service-key-fixture' },
    fetchImpl, clock: () => NOW, out: line => lines.push(line) });
  assert.equal(summary.status, 'schema_unavailable');
  assert.equal(seen.length, 2); assert.ok(seen.every(([url]) => url.startsWith('https://abc.supabase.co/rest/v1/rpc/gtl_props_jobs_capability')));
  assert.doesNotMatch(lines.join(''), /service-key-fixture|supabase\.co/);
  await assert.rejects(run(['offers', '--season', '2026', '--week', '10'], { env: {}, fetchImpl, out: () => {} }), /not configured/);
});

test('boundaries: no provider call, reservation, collector or route; the workflow is manual, variable-gated and dry by default', () => {
  const strip = name => fs.readFileSync(name, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const name of ['cloud/player-prop-jobs.mjs', 'scripts/player-props-jobs.mjs', 'scripts/player-props-sources.mjs']) {
    const source = strip(name);
    assert.doesNotMatch(source, /collectResearchQuotes|gtl_begin_research_quotes|gtl_finish_research_quotes|api\.the-odds-api\.com|ODDS_API|apiKey/, name);
    assert.doesNotMatch(source, /research-provider\.mjs/, `${name} never imports the provider adapter`);
  }
  for (const name of ['cloud/handler.mjs', 'cloud/player-props.mjs', 'supabase/functions/gtl-api/index.ts']) assert.doesNotMatch(fs.readFileSync(name, 'utf8'), /player-prop-jobs/, `${name}: no page view reaches the jobs`);
  assert.ok(!PROP_JOB_RPCS.some(name => /save_draft|lock_in|_write$|board|history/.test(name)), 'the jobs never call a member writer or reader');
  const yaml = fs.readFileSync('.github/workflows/player-props-jobs.yml', 'utf8');
  assert.match(yaml, /^on:\n {2}workflow_dispatch:/m);
  assert.doesNotMatch(yaml, /^\s+schedule:/m, 'no schedule');
  assert.match(yaml, /if: github\.ref == 'refs\/heads\/main' && vars\.GTL_PLAYER_PROPS_JOBS == 'on'/);
  assert.match(yaml, /write:\n(?:.*\n){2} {8}default: false/);
  assert.match(yaml, /record_while_dark:\n(?:.*\n){2} {8}default: false/);
  assert.match(yaml, /^permissions:\n {2}contents: read$/m);
});
