// D-82 Player Props pilot input builder (cloud/player-prop-quote-requests.mjs, scripts/player-props-quote-requests.mjs).
// Synthetic fixtures only: not bookmaker quotes, nflverse records or account data. No network: every fetch is a fake.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { PROP_CREDIT_REGIONS, PROP_INTAKE_LIMITS, PROP_MAX_CREDITS_CAP, PROP_PILOT_DEFAULTS, PROP_PILOT_GAME_REASONS, PROP_PILOT_PLAYER_REASONS, PropPilotRefusal,
  buildPropQuoteRequests, propRequestPlan, propRosterReceipt, propWeekRoster } from '../cloud/player-prop-quote-requests.mjs';
import { createMarketSnapshotReader, parseArgs, run } from '../scripts/player-props-quote-requests.mjs';
import { collectResearchQuotes } from '../cloud/research-provider.mjs';
import { latestRetainedQuotes, propCandidates, propRosterFacts, propScheduleGames, reviewPropCandidate } from '../cloud/player-prop-jobs.mjs';
import { validateAssessmentSnapshot } from '../shared/research-assessments.mjs';
import { PROP_STAT_KEYS, validPlayerId } from '../shared/player-props.mjs';
import { easternToUtc } from '../shared/nfl-schedule.mjs';

// Week 2 dates lie in the past, so research intake's own clock never sees the built input as future-dated.
const SEASON = 2026, WEEK = 2;
const KICK = easternToUtc('2026-09-20', '13:00'), LATE = easternToUtc('2026-09-20', '16:25'), NIGHT = easternToUtc('2026-09-20', '20:20');
const NOW = Date.parse(KICK) - 6 * 3_600_000;
const iso = ms => new Date(ms).toISOString();
const SCHEDULE = ['game_id,season,game_type,week,gameday,gametime,away_team,home_team,away_score,home_score',
  '2026_02_NYJ_NE,2026,REG,2,2026-09-17,20:15,NYJ,NE,,',
  '2026_02_DAL_PHI,2026,REG,2,2026-09-20,13:00,DAL,PHI,,',
  '2026_02_GB_CHI,2026,REG,2,2026-09-20,13:00,GB,CHI,,',
  '2026_02_SEA_ARI,2026,REG,2,2026-09-20,16:05,SEA,ARI,,',
  '2026_02_LA_SF,2026,REG,2,2026-09-20,16:25,LA,SF,,',
  '2026_02_KC_BUF,2026,REG,2,2026-09-20,20:20,KC,BUF,,'].join('\n');
const P = n => `00-${String(n).padStart(7, '0')}`;
const ROSTER_ROWS = [
  [2, P(1), 'DAL', 'QB', 'ACT', 'Dak Fixture'], [2, P(2), 'DAL', 'WR', 'ACT', 'Cee Fixture'], [2, P(3), 'DAL', 'RB', 'INA', 'Tony Fixture'],
  [2, P(4), 'DAL', 'K', 'ACT', 'Kick Fixture'], [2, P(5), 'DAL', 'WR', 'ACT', 'Same Name'], [2, P(7), 'DAL', 'WR', 'ACT', 'José Fixturé'],
  [1, P(6), 'DAL', 'WR', 'ACT', 'Last Week Only'],
  [2, P(11), 'PHI', 'QB', 'ACT', 'Jalen Fixture'], [2, P(12), 'PHI', 'RB', 'ACT', 'Saquon Fixture'], [2, P(13), 'PHI', 'CB', 'ACT', 'Same Name'],
  [2, P(14), 'PHI', 'WR', 'ACT', 'A.J. Fixture'], [2, P(14), 'PHI', 'WR', 'ACT', 'A.J. Fixture'], [2, 'NA', 'PHI', 'TE', 'ACT', 'No Id Fixture'],
  [2, P(15), 'PHI', 'TE', 'ACT', 'Changed Fixture'], [2, P(15), 'PHI', 'TE', 'RES', 'Changed Fixture'],
  [2, P(21), 'LA', 'QB', 'ACT', 'Matthew Fixture'], [2, P(31), 'SF', 'RB', 'ACT', 'Christian Fixture'],
  [2, P(41), 'KC', 'QB', 'ACT', 'Patrick Fixture'], [2, P(51), 'GB', 'QB', 'ACT', 'Jordan Fixture'], [2, P(52), 'CHI', 'QB', 'ACT', 'Caleb Fixture'],
];
const rosterCsv = (rows = ROSTER_ROWS) => ['season,week,game_type,gsis_id,team,position,status,full_name,pfr_id',
  ...rows.map(([week, id, team, pos, status, name]) => `2026,${week},REG,${id},${team},${pos},${status},${name},pfr${id}`)].join('\n');
const file = (key, name, text, updatedAt = iso(NOW - 2 * 3_600_000)) => ({ key, name: `nflverse ${name}`, url: `https://example.invalid/${name}`, text,
  sha256: createHash('sha256').update(text).digest('hex'), bytes: Buffer.byteLength(text), updatedAt, retrievedAt: iso(NOW), license: 'CC BY 4.0' });
const game = (gameId, kickoff, extra = {}) => {
  const names = { DAL: 'Dallas Cowboys', PHI: 'Philadelphia Eagles', LAR: 'Los Angeles Rams', SF: 'San Francisco 49ers', KC: 'Kansas City Chiefs', BUF: 'Buffalo Bills',
    NYJ: 'New York Jets', NE: 'New England Patriots', GB: 'Green Bay Packers', CHI: 'Chicago Bears', SEA: 'Seattle Seahawks', ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', NO: 'New Orleans Saints' };
  const [away, home] = gameId.split('-');
  return { gameId, home: names[home], away: names[away], kickoff, providerEventId: `evt-${gameId.toLowerCase()}`, matchStatus: 'matched', markets: {}, ...extra };
};
const SNAPSHOT_GAMES = [
  game('NYJ-NE', easternToUtc('2026-09-17', '20:15')),
  game('KC-BUF', NIGHT), game('LAR-SF', LATE), game('DAL-PHI', KICK),
  game('GB-CHI', iso(Date.parse(KICK) + 5 * 60_000)),
  game('ATL-NO', KICK, { providerEventId: null, matchStatus: 'event_missing' }),
  game('SEA-ARI', easternToUtc('2026-09-20', '16:05'), { home: 'Arizona Cards' }),
];
const snapshot = (games = SNAPSHOT_GAMES) => ({ createdAt: iso(NOW - 30 * 60_000), games });
let ids = 0;
const nextId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;
const build = ({ games = 2, stats = PROP_PILOT_DEFAULTS.stats, maxCredits = 6, only = null, roster = rosterCsv(), snap = snapshot(), now = NOW } = {}) =>
  buildPropQuoteRequests({ season: SEASON, week: WEEK, now, plan: propRequestPlan({ games, stats, maxCredits }), only, snapshot: snap,
    schedule: file('schedule', 'games.csv', SCHEDULE), rosters: file('rosters', 'roster_weekly_2026.csv', roster), newRequestId: nextId });

test('credit plan: the default pilot is 2 games × 3 yardage stats × 1 region = 6 credits, and a larger scope is refused before any read', () => {
  assert.deepEqual(PROP_PILOT_DEFAULTS, { games: 2, stats: ['player_pass_yds', 'player_rush_yds', 'player_reception_yds'], maxCredits: 6 });
  assert.equal(PROP_CREDIT_REGIONS, 1); assert.deepEqual(PROP_INTAKE_LIMITS, { requests: 4, marketsPerRequest: 8 }); assert.equal(PROP_MAX_CREDITS_CAP, 32);
  const plan = propRequestPlan();
  assert.equal(plan.credits, 6); assert.equal(plan.requests, 2); assert.deepEqual(plan.perGame, [3]); assert.equal(plan.formula, '2 games × 3 stats × 1 region = 6 credits');
  assert.equal(propRequestPlan({ games: 1, stats: ['player_reception_yds'], maxCredits: 1 }).credits, 1);
  // All eleven stats need two requests a game (eight markets at most per request).
  assert.throws(() => propRequestPlan({ games: 2, stats: PROP_STAT_KEYS }), error => error instanceof PropPilotRefusal
    && error.message === 'Refused: 2 games × 11 stats × 1 region = 22 credits, above --max-credits 6.');
  const full = propRequestPlan({ games: 2, stats: PROP_STAT_KEYS, maxCredits: 22 });
  assert.equal(full.requests, 4); assert.deepEqual(full.perGame, [8, 3]); assert.equal(full.credits, 22);
  assert.throws(() => propRequestPlan({ games: 3, stats: PROP_STAT_KEYS, maxCredits: 32 }), /needs 6 requests; research intake allows 4/);
  assert.throws(() => propRequestPlan({ games: 3 }), /9 credits, above --max-credits 6/);
  for (const bad of [{ games: 0 }, { games: 5 }, { stats: [] }, { stats: ['player_anytime_td'] }, { stats: ['player_pass_yds', 'player_pass_yds'] }, { stats: ['spreads'] },
    { maxCredits: 0 }, { maxCredits: 33 }, { maxCredits: 2.5 }]) assert.throws(() => propRequestPlan(bad), error => !(error instanceof PropPilotRefusal), JSON.stringify(bad));
});

test('roster receipt: GSIS-keyed ACT QB/RB/WR/TE rows of the two teams only, failing closed on conflicts, missing IDs and shared names', () => {
  const people = propWeekRoster(rosterCsv(), { season: SEASON, week: WEEK });
  assert.equal(people.has(P(6)), false, 'another week is never this week\'s roster');
  assert.deepEqual(people.get(P(15)), { id: P(15), valid: true, conflict: true, teams: ['PHI'], names: ['Changed Fixture'] });
  const g = { id: 'DAL-PHI', homeCode: 'PHI', awayCode: 'DAL' }, availableAt = iso(NOW - 3_600_000);
  const { receipt, excluded, complete } = propRosterReceipt(people, { game: g, availableAt });
  assert.equal(complete, true);
  assert.deepEqual(receipt.map(p => p.id), [P(1), P(2), P(7), P(11), P(12), P(14)]);
  assert.ok(receipt.every(p => validPlayerId(p.id) && p.gameId === 'DAL-PHI' && p.current === true && p.availableAt === availableAt && ['DAL', 'PHI'].includes(p.team)));
  assert.deepEqual(excluded, { roster_inactive: 1, position_unsupported: 2, name_ambiguous: 1, player_id_invalid: 1, roster_conflict: 1 });
  assert.ok(Object.keys(excluded).every(reason => PROP_PILOT_PLAYER_REASONS.includes(reason)));
  // nflverse LA is the app's LAR; a game with one team missing from the roster is incomplete.
  assert.deepEqual(propRosterReceipt(people, { game: { id: 'LAR-SF', homeCode: 'SF', awayCode: 'LAR' }, availableAt }).receipt.map(p => [p.id, p.team]), [[P(21), 'LAR'], [P(31), 'SF']]);
  assert.equal(propRosterReceipt(people, { game: { id: 'KC-BUF', homeCode: 'BUF', awayCode: 'KC' }, availableAt }).complete, false);
});

test('builder: the earliest eligible snapshot games, their provider events and receipts, within the credit plan', () => {
  const { input, summary } = build();
  assert.deepEqual(summary.games, ['DAL-PHI', 'LAR-SF']); assert.equal(summary.status, 'ok'); assert.equal(summary.requests, 2);
  assert.deepEqual(summary.credits.perRequest, [3, 3]); assert.equal(summary.credits.total, 6); assert.equal(summary.credits.max, 6); assert.equal(summary.credits.regions, 1);
  assert.deepEqual(summary.excluded.games, { kickoff_too_close: 1, kickoff_mismatch: 1, event_unmatched: 1, schedule_unmapped: 1, team_names_mismatch: 1 });
  assert.ok(Object.keys(summary.excluded.games).every(reason => PROP_PILOT_GAME_REASONS.includes(reason)));
  assert.equal(summary.rosterPlayers, 8);
  const [first, second] = input.quoteRequests;
  assert.deepEqual(Object.keys(first).sort(), ['eventId', 'game', 'markets', 'requestId', 'roster']);
  assert.equal(first.eventId, 'evt-dal-phi'); assert.deepEqual(first.markets, ['player_pass_yds', 'player_rush_yds', 'player_reception_yds']);
  assert.deepEqual(first.game, { id: 'DAL-PHI', home: 'Philadelphia Eagles', away: 'Dallas Cowboys', kickoff: KICK, homeCode: 'PHI', awayCode: 'DAL' });
  assert.equal(second.eventId, 'evt-lar-sf'); assert.equal(second.game.kickoff, LATE);
  assert.match(first.requestId, /^[0-9a-f-]{36}$/); assert.notEqual(first.requestId, second.requestId);
  // A valid research-intake snapshot with nothing to publish: research intake refuses --publish without a publicationId.
  assert.deepEqual(validateAssessmentSnapshot(input.snapshot), { version: 1, season: 2026, week: 2, generatedAt: iso(NOW), candidates: [], quotes: [], sources: [] });
  assert.equal(Object.hasOwn(input, 'publicationId'), false); assert.deepEqual(input.discovery, []);
  assert.deepEqual(input.propPilot.games, ['DAL-PHI', 'LAR-SF']); assert.equal(input.propPilot.credits, 6);
  assert.equal(input.propPilot.sources.rosters.sha256, summary.sources.rosters);
  // The summary is counts, game IDs, stat keys, credits and digests: no player, provider event ID or roster row.
  const line = JSON.stringify(summary);
  for (const secret of ['evt-', 'Fixture', '00-00', 'Same Name']) assert.ok(!line.includes(secret), secret);
});

test('builder: named games must each be eligible, a short slate is reported as short, and no eligible game refuses', () => {
  assert.deepEqual(build({ games: 1, maxCredits: 3, only: ['LAR-SF'] }).summary.games, ['LAR-SF']);
  assert.throws(() => build({ games: 1, maxCredits: 3, only: ['GB-CHI'] }), /Refused: GB-CHI cannot be requested \(kickoff_mismatch\)/);
  assert.throws(() => build({ games: 1, maxCredits: 3, only: ['NYJ-NE'] }), /NYJ-NE cannot be requested \(kickoff_too_close\)/);
  assert.throws(() => build({ games: 1, maxCredits: 3, only: ['MIA-NYG'] }), /MIA-NYG cannot be requested \(not_in_snapshot\)/);
  assert.throws(() => build({ games: 1, maxCredits: 3, only: ['KC-BUF'] }), /KC-BUF cannot be requested \(roster_unavailable\)/);
  assert.throws(() => build({ games: 2, only: ['LAR-SF'] }), /Name each pilot game once/);
  const short = build({ games: 3, maxCredits: 9 });
  assert.equal(short.summary.status, 'short'); assert.deepEqual(short.summary.games, ['DAL-PHI', 'LAR-SF']); assert.equal(short.summary.credits.total, 6);
  assert.equal(short.summary.excluded.games.roster_unavailable, 1);
  // Fifteen minutes before kickoff a game is left out: the reservation and the provider adapter refuse it at kickoff.
  assert.deepEqual(build({ now: Date.parse(KICK) - 14 * 60_000 }).summary.games, ['LAR-SF']);
  assert.throws(() => build({ snap: snapshot([SNAPSHOT_GAMES[0]]) }), /no game in the core market snapshot can be requested/);
  assert.throws(() => build({ snap: { createdAt: iso(NOW + 1), games: SNAPSHOT_GAMES } }), /snapshot is unavailable or invalid/);
  assert.throws(() => buildPropQuoteRequests({ season: SEASON, week: WEEK, now: NOW, plan: propRequestPlan(), snapshot: snapshot(),
    schedule: file('schedule', 'games.csv', SCHEDULE), rosters: { ...file('rosters', 'r.csv', rosterCsv()), updatedAt: null }, newRequestId: nextId }), /roster release time/);
});

// The wiring: a builder request runs through research intake's own collector (fake reservation, fake provider reply) and
// the retained quotes become an ELIGIBLE offer in the offers job, keyed by GSIS ID. Reservations equal the credit math.
test('wiring: builder requests pass through research intake to eligible GSIS-keyed offers, reserving exactly the planned credits', async () => {
  const { input, summary } = build();
  const reserved = [], rows = [];
  const books = ['draftkings', 'fanduel', 'betmgm'];
  const outcomes = (name, line) => [{ name: 'Over', description: name, point: line, price: -110 }, { name: 'Under', description: name, point: line, price: -110 }];
  const event = request => ({ id: request.eventId, sport_key: 'americanfootball_nfl', home_team: request.game.home, away_team: request.game.away, commence_time: request.game.kickoff,
    bookmakers: books.map((key, i) => ({ key, markets: [{ key: 'player_reception_yds', last_update: iso(NOW - (i + 1) * 60_000),
      outcomes: [...outcomes('Cee Fixture', 66.5 + i), ...outcomes('Jose Fixture', 40.5), ...outcomes('Same Name', 20.5), ...outcomes('Unknown Fixture', 30.5)] }] })) });
  for (const request of input.quoteRequests) {
    const rpc = async (name, body) => {
      if (name === 'gtl_begin_research_quotes') { reserved.push(body.p_markets.length); assert.equal(body.p_game, request.game.id); return { replay: false, lease: 'lease', expiresAt: iso(NOW + 90_000) }; }
      assert.equal(name, 'gtl_finish_research_quotes');
      rows.push({ request_id: request.requestId, game_id: request.game.id, markets: request.markets, status: 'finished', error: body.p_error, started_at: iso(NOW), quote_payload: body.p_quotes });
      return { status: 'finished' };
    };
    const fetchImpl = async url => {
      const target = new URL(url);
      assert.equal(target.pathname, `/v4/sports/americanfootball_nfl/events/${request.eventId}/odds`);
      assert.equal(target.searchParams.get('markets'), request.markets.join(',')); assert.equal(target.searchParams.get('bookmakers'), books.join(','));
      return new Response(JSON.stringify(event(request)), { headers: { 'x-requests-last': String(request.markets.length), 'x-requests-remaining': '400', 'x-requests-used': '100' } });
    };
    const reply = await collectResearchQuotes({ ...request, season: input.snapshot.season, week: input.snapshot.week, rpc, apiKey: 'fixture-only-key', fetchImpl, clock: () => NOW });
    assert.equal(reply.status, 'collected');
  }
  assert.deepEqual(reserved, summary.credits.perRequest, 'each reservation is the request\'s market count');
  assert.equal(reserved.reduce((a, b) => a + b, 0), 6);
  const retained = latestRetainedQuotes(rows);
  // Only receipt players survive: the accent-stripped name matches, the shared name and the unknown player do not.
  assert.deepEqual([...new Set(retained.map(r => r.quote.selection.playerId))].sort(), [P(2), P(7)]);
  const { candidates } = propCandidates(retained);
  const games = propScheduleGames(SCHEDULE, { season: SEASON });
  const roster = propRosterFacts(rosterCsv(), { season: SEASON, week: WEEK, playerIds: candidates.map(c => c.playerRef) });
  const reviews = candidates.map(c => reviewPropCandidate(c, { season: SEASON, week: WEEK, games, roster, now: NOW + 60_000, sourceName: 'fixture' }));
  assert.deepEqual(reviews.map(r => [r.offer?.playerId ?? null, r.eligible, r.eventId]), [[P(2), true, '2026_02_DAL_PHI'], [P(7), true, '2026_02_DAL_PHI']]);
  assert.equal(reviews[0].offer.playerName, 'Cee Fixture', 'the offer name comes from the roster, never the provider');
});

const releaseAsset = (tag, name, text) => {
  const bytes = Buffer.from(text), url = `https://github.com/nflverse/nflverse-data/releases/download/${tag}/${name}`;
  return { tag, url, bytes, metadata: { assets: [{ name, browser_download_url: url, size: bytes.byteLength, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    updated_at: iso(NOW - 2 * 3_600_000) }] } };
};
function fakeNetwork({ snapshotRows = [{ created_at: iso(NOW - 30 * 60_000), games: SNAPSHOT_GAMES }] } = {}) {
  const assets = [releaseAsset('schedules', 'games.csv', SCHEDULE), releaseAsset('weekly_rosters', 'roster_weekly_2026.csv', rosterCsv())];
  const calls = [];
  const fetchImpl = async (target, options = {}) => {
    const url = new URL(String(target));
    calls.push({ url: url.href, method: options.method ?? 'GET', headers: { ...(options.headers ?? {}) } });
    assert.notEqual(url.hostname, 'api.the-odds-api.com', 'never the odds provider');
    if (url.hostname === 'abc.supabase.co') {
      assert.equal(url.pathname, '/rest/v1/gtl_market_snapshots'); assert.equal(options.method, 'GET');
      assert.equal(url.searchParams.get('select'), 'created_at,games:payload->games'); assert.equal(url.searchParams.get('limit'), '1');
      assert.equal(url.searchParams.get('season'), 'eq.2026'); assert.equal(url.searchParams.get('week'), 'eq.2');
      return new Response(JSON.stringify(snapshotRows), { status: 200 });
    }
    for (const asset of assets) {
      if (url.href === `https://api.github.com/repos/nflverse/nflverse-data/releases/tags/${asset.tag}`) return new Response(JSON.stringify(asset.metadata), { status: 200 });
      if (url.href === asset.url) return new Response(asset.bytes, { status: 200 });
    }
    assert.fail(`unexpected request ${url.host}${url.pathname}`);
  };
  return { fetchImpl, calls };
}
const ENV = { GTL_RESEARCH_SUPABASE_URL: 'https://abc.supabase.co', GTL_RESEARCH_SERVICE_ROLE_KEY: 'service-key-fixture' };
const localDir = t => {
  const dir = path.resolve('.local', `prop-quote-requests-test-${randomUUID()}`); fs.mkdirSync(dir, { recursive: true });
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('CLI: one read-only snapshot GET plus verified nflverse files, a new ignored output, a counts-only line and no provider call', async t => {
  assert.deepEqual(parseArgs(['--season', '2026', '--week', '2']), { season: 2026, week: 2, games: 2, only: [], stats: PROP_PILOT_DEFAULTS.stats, maxCredits: 6, output: null });
  assert.deepEqual(parseArgs(['--season', '2026', '--week', '2', '--game', 'DAL-PHI']).games, 1);
  assert.throws(() => parseArgs(['--season', '2026', '--week', '2', '--game', 'DAL-PHI', '--games', '2']), /must equal/);
  assert.throws(() => parseArgs(['--season', '2026']), /Use --season/);
  assert.throws(() => parseArgs(['--season', '2026', '--week', '2', '--collect-quotes']), /Use --season/);
  const dir = localDir(t), output = path.relative(process.cwd(), path.join(dir, 'pilot.json'));
  const network = fakeNetwork(), lines = [];
  const result = await run(['--season', '2026', '--week', '2', '--output', output], { env: ENV, fetchImpl: network.fetchImpl, clock: () => NOW, newRequestId: nextId, out: line => lines.push(line) });
  assert.equal(result.written, true); assert.equal(result.credits.total, 6); assert.deepEqual(result.games, ['DAL-PHI', 'LAR-SF']);
  assert.ok(network.calls.every(call => call.method === 'GET'), 'reads only');
  assert.deepEqual(network.calls.map(call => new URL(call.url).hostname), ['abc.supabase.co', 'api.github.com', 'github.com', 'api.github.com', 'github.com']);
  for (const call of network.calls) if (new URL(call.url).hostname !== 'abc.supabase.co') assert.equal(call.headers.apikey, undefined, 'the service key goes only to research storage');
  const saved = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(saved.quoteRequests.map(r => r.game.id), ['DAL-PHI', 'LAR-SF']); assert.ok(saved.quoteRequests.every(r => r.roster.every(p => validPlayerId(p.id))));
  assert.equal(lines.length, 1);
  for (const secret of ['service-key-fixture', 'supabase.co', 'evt-', 'Fixture']) assert.ok(!lines[0].includes(secret), secret);
  // A built file is never overwritten: its request IDs may already have been spent.
  await assert.rejects(run(['--season', '2026', '--week', '2', '--output', output], { env: ENV, fetchImpl: fakeNetwork().fetchImpl, clock: () => NOW, out: () => {} }), /output file exists/);
});

test('CLI: a scope over the cap, a public output path or missing credentials stops before any request', async () => {
  for (const [args, env, pattern] of [
    [['--season', '2026', '--week', '2', '--stats', PROP_STAT_KEYS.join(',')], ENV, /22 credits, above --max-credits 6/],
    [['--season', '2026', '--week', '2', '--games', '3'], ENV, /9 credits, above --max-credits 6/],
    [['--season', '2026', '--week', '2', '--max-credits', '40'], ENV, /from 1 to 32/],
    [['--season', '2026', '--week', '2', '--output', 'docs/pilot.json'], ENV, /ignored \.local/],
    [['--season', '2026', '--week', '2'], {}, /not configured/],
    [['--season', '2026', '--week', '2'], { ...ENV, GTL_RESEARCH_SUPABASE_URL: 'https://example.com' }, /not configured/],
  ]) {
    const network = fakeNetwork();
    await assert.rejects(run(args, { env, fetchImpl: network.fetchImpl, clock: () => NOW, out: () => assert.fail('no output') }), pattern);
    assert.equal(network.calls.length, 0, `${args.join(' ')}: nothing was read`);
  }
  const empty = fakeNetwork({ snapshotRows: [] });
  await assert.rejects(run(['--season', '2026', '--week', '2'], { env: ENV, fetchImpl: empty.fetchImpl, clock: () => NOW, out: () => {} }), /No core market snapshot/);
  assert.equal(empty.calls.length, 1, 'no source file is read without a snapshot');
  const reader = createMarketSnapshotReader({ url: ENV.GTL_RESEARCH_SUPABASE_URL, serviceRoleKey: 'k', fetchImpl: async () => new Response('<html>', { status: 200 }) });
  await assert.rejects(reader.latest(2026, 2), /^Error: The core market snapshot is invalid\.$/);
});

test('research intake accepts the built input for validation, refuses to publish it, and cannot collect without its own credentials', async t => {
  const dir = localDir(t), input = path.join(dir, 'pilot.json');
  fs.writeFileSync(input, JSON.stringify(build().input));
  // Never inherit an operator's real research credentials into this test.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GTL_RESEARCH_/.test(key)));
  const intake = args => spawnSync(process.execPath, ['scripts/research-intake.mjs', '--input', input, ...args], { encoding: 'utf8', timeout: 20_000, env });
  const validation = intake([]);
  assert.equal(validation.status, 0, validation.stderr);
  const receipt = JSON.parse(validation.stdout);
  assert.equal(receipt.candidates, 0); assert.equal(receipt.published, false); assert.equal(receipt.availableSources, 0);
  assert.equal(intake(['--publish']).status, 1, 'no publicationId: an empty snapshot can never replace the published one');
  const collect = intake(['--collect-quotes']);
  assert.equal(collect.status, 1); assert.match(collect.stderr, /Research intake failed/);
});

test('boundaries: the builder never calls or imports the odds provider, reserves credits or writes hosted state', () => {
  const strip = name => fs.readFileSync(name, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const name of ['cloud/player-prop-quote-requests.mjs', 'scripts/player-props-quote-requests.mjs', 'scripts/local-private-file.mjs']) {
    const source = strip(name);
    assert.doesNotMatch(source, /collectResearchQuotes|gtl_begin_research_quotes|gtl_finish_research_quotes|gtl_publish_research_snapshot|api\.the-odds-api\.com|ODDS_API|apiKey/, name);
    assert.doesNotMatch(source, /research-provider\.mjs|research-intake\.mjs|odds-provider\.mjs/, `${name} never imports a provider adapter or the collector`);
    assert.doesNotMatch(source, /method: '(?:POST|PATCH|PUT|DELETE)'|\/rest\/v1\/rpc\//, `${name} makes no hosted write`);
  }
  assert.match(strip('scripts/player-props-quote-requests.mjs'), /method: 'GET'/);
  for (const name of ['cloud/handler.mjs', 'cloud/player-props.mjs', 'supabase/functions/gtl-api/index.ts']) assert.doesNotMatch(fs.readFileSync(name, 'utf8'), /player-prop-quote-requests/, `${name}: no page view reaches the builder`);
});
