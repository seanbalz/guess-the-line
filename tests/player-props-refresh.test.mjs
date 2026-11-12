import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createCloudHandler, createSupabaseAdapter } from '../cloud/handler.mjs';
import { normalizeResearchEvent } from '../cloud/research-provider.mjs';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.parse('2026-11-15T19:00:00Z');
const iso = value => new Date(value).toISOString();
const kickoff = '2026-11-15T21:25:00.000Z';
const stat = 'player_reception_yds';
const offer = { eventId: '2026_10_DAL_PHI', playerId: '00-0036358', stat, playerName: 'Fixture Receiver', team: 'DAL', position: 'WR', away: 'DAL', home: 'PHI', kickoff, closed: false };
const teammate = { ...offer, playerId: '00-0036359', playerName: 'Another Receiver', team: 'PHI' };
const unoffered = { ...offer, playerId: '00-0036360', playerName: 'Unoffered Receiver' };
const game = { id: 'DAL-PHI', awayCode: 'DAL', homeCode: 'PHI', away: 'Dallas Cowboys', home: 'Philadelphia Eagles', kickoff };
const marketGame = { gameId: game.id, away: game.away, home: game.home, kickoff, providerEventId: 'evt-fixture', matchStatus: 'matched' };
const week = { season: 2026, week: 10 };
const key = 'private-fixture-odds-key';
const rosterFile = 'roster_weekly_2026.csv';
const rosterUrl = `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/${rosterFile}`;
const rosterMeta = 'https://api.github.com/repos/nflverse/nflverse-data/releases/tags/weekly_rosters';
const csv = (players = [offer, teammate, unoffered], rosterWeek = week.week) => [
  'season,week,game_type,gsis_id,team,position,status,full_name,notes',
  ...players.map(p => `${week.season},${rosterWeek},REG,${p.playerId},${p.team},${p.position},ACT,"${p.playerName}","one,two\nthree"`),
].join('\n') + '\n';
const save = (changes = {}) => ({ eventId: offer.eventId, playerId: offer.playerId, stat, guess: 72.5, requestId: id(90), ...changes });

function providerEvent({ lines = [66.5, 67.5, 68.5], bookCount = 3 } = {}) {
  return { id: marketGame.providerEventId, sport_key: 'americanfootball_nfl', home_team: game.home, away_team: game.away, commence_time: kickoff,
    bookmakers: ['draftkings', 'fanduel', 'betmgm'].slice(0, bookCount).map((book, i) => ({ key: book, markets: [
      { key: stat, last_update: iso(now - 60_000), outcomes: [offer.playerName, teammate.playerName, unoffered.playerName, 'Unverified Receiver'].flatMap((description, j) =>
        ['Over', 'Under'].map(name => ({ name, description, point: lines[i] + j * 10, price: -110 }))) },
      { key: 'player_rush_yds', last_update: iso(now - 60_000), outcomes: [{ name: 'Over', description: offer.playerName, point: 19.5, price: -110 }] },
    ] })) };
}

function capture({ bookCount = 3, ...rest } = {}) {
  const roster = [{ id: offer.playerId, name: offer.playerName, team: offer.team, gameId: game.id, current: true, availableAt: iso(now - 600_000) }];
  const quotes = normalizeResearchEvent(providerEvent({ bookCount }), { game, roster, now });
  return { markets: [stat], status: 'finished', error: null, quote_payload: quotes.filter(q => q.selection.key === stat), ...rest };
}

// The handler, HTTP adapter, retention selection and provider normalizer run as production code. This fetch boundary
// stands in for Supabase storage and The Odds API so fixtures can exercise reservations without a network or credits.
function fixture({ fetches = [], offers = [offer, teammate, { ...teammate, stat: 'player_receptions' }], snapshot = marketGame,
  oddsKey = key, featureOff, ready = true, auth = true, member = true, beginError, lease, kickOffAfterReservation = false,
  kickOffDuringProvider = false, peerCapture, providerStatus = 200, provider = providerEvent(), rosterCsv = csv(), rosterStatus = 200,
  rosterAsset = {} } = {}) {
  const calls = [];
  let saved, reference, serverNow = now;
  const bytes = new TextEncoder().encode(rosterCsv);
  const asset = { name: rosterFile, browser_download_url: rosterUrl, size: bytes.byteLength, updated_at: iso(now - 600_000), state: 'uploaded',
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`, ...rosterAsset };
  const error = (message, status = 400, code = 'P0001') => Response.json({ message, code }, { status });
  const fetchImpl = async (url, options = {}) => {
    const target = new URL(url);
    const name = target.pathname.split('/').at(-1);
    const args = options.body ? JSON.parse(options.body) : null;
    calls.push({ name, target, args, options });
    if (target.href === rosterMeta || target.href === rosterUrl) {
      assert.equal(options.credentials, 'omit');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers, undefined);
      assert.ok(options.signal instanceof AbortSignal);
      if (target.href === rosterMeta) return Response.json({ tag_name: 'weekly_rosters', draft: false, assets: [asset] }, { status: rosterStatus });
      return new Response(bytes);
    }
    if (target.hostname === 'api.the-odds-api.com') {
      if (kickOffDuringProvider) serverNow = Date.parse(kickoff);
      return Response.json(provider, { status: providerStatus, headers: { 'x-requests-remaining': '100', 'x-requests-used': '400', 'x-requests-last': '1' } });
    }
    assert.equal(target.hostname, 'fixture.supabase.co');
    switch (name) {
      case 'user': return auth ? Response.json({ id: id(1), role: 'authenticated', email: 'fixture@example.test', email_confirmed_at: iso(now) }) : error('Unauthorized', 401);
      case 'gtl_props_capability': return Response.json({ ready });
      case 'gtl_props_board': return Response.json({ ...week, ready, offers, own: saved ? [saved] : [] });
      case 'gtl_props_history': return Response.json({ complete: true, rows: [] });
      case 'gtl_props_shared': return Response.json({ ...week, selections: [] });
      case 'gtl_props_save_draft': {
        if (!member) return error('GTL_COMMUNITY_MEMBER');
        const selected = offers.find(o => o.eventId === args.p_event_id && o.playerId === args.p_player_id && o.stat === args.p_stat);
        if (!selected) return error('GTL_PROPS_INVALID');
        if (selected.closed) return error('GTL_PROPS_CLOSED');
        if (saved?.status === 'locked') return error('GTL_PROPS_LOCKED');
        saved = { ...week, eventId: args.p_event_id, playerId: args.p_player_id, stat: args.p_stat, guess: args.p_guess, status: 'draft', savedAt: iso(now), lockedAt: null };
        return Response.json(saved);
      }
      case 'gtl_research_quote_fetches': {
        const markets = target.searchParams.get('markets');
        const finished = fetches.filter(row => (markets === null || row.markets.some(m => markets === `cs.{${m}}`)) && (target.searchParams.get('error') !== 'is.null' || row.error === null));
        return Response.json(finished.slice(0, Number(target.searchParams.get('limit'))));
      }
      case 'gtl_props_record_reference': {
        const observed = args.p_books.map(b => b.observedAt).sort();
        reference = { line: args.p_line, books: args.p_books, observedFrom: observed[0], observedTo: observed.at(-1), recordedAt: iso(now) };
        return Response.json(reference);
      }
      case 'gtl_props_lock_in': {
        if (saved?.status === 'locked') return Response.json({ ...saved, replayed: true });
        if (!reference) return error('GTL_PROPS_REFERENCE_UNAVAILABLE');
        saved = { ...saved, status: 'locked', lockedAt: iso(now), reference };
        return Response.json(saved);
      }
      case 'gtl_market_snapshots': return Response.json(snapshot ? [{ created_at: iso(now - 180_000), games: Array.isArray(snapshot) ? snapshot : [snapshot] }] : []);
      case 'gtl_props_begin_refresh': {
        if (beginError === 'missing') return error(`Unapplied ${key}`, 404, 'PGRST202');
        if (beginError === 'revoked') return error(`Denied ${key}`, 403, '42501');
        if (peerCapture) fetches.unshift(capture());
        if (beginError) return error(beginError);
        if (kickOffAfterReservation) serverNow = Date.parse(kickoff);
        return Response.json(lease ?? { replay: false, lease: id(4), expiresAt: iso(serverNow + 90_000) });
      }
      case 'gtl_finish_research_quotes':
        fetches.unshift(capture({ error: args.p_error, quote_payload: args.p_quotes }));
        return Response.json({ status: 'finished' });
      default: throw new Error(`Unexpected request ${name}`);
    }
  };
  const adapter = createSupabaseAdapter({ url: 'https://fixture.supabase.co', anonKey: 'fixture-anon', serviceRoleKey: 'fixture-service', playerPropsOddsKey: oddsKey, fetchImpl, clock: () => serverNow });
  let nextId = 1;
  const handler = createCloudHandler({ ...adapter, playerProps: 'on', featureOff, clock: () => now, uuid: () => id(nextId++) });
  async function call(action = 'lock', body = save()) {
    const response = await handler(new Request(`https://fixture.test/props/${action}`, { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  }
  return { call, calls, saved: () => saved, providerCalls: () => calls.filter(c => c.target.hostname === 'api.the-odds-api.com') };
}

test('a missing lock-in reference refreshes one trusted game and stat, then retries the same final lock', async () => {
  const f = fixture({ fetches: [capture({ bookCount: 2 })] });
  const result = await f.call();
  assert.equal(result.status, 200);
  assert.equal(result.body.status, 'locked');
  assert.equal(result.body.reference.line, 67.5);
  assert.equal(result.body.reference.observedTo, iso(now - 60_000));
  assert.equal(f.providerCalls().length, 1);
  assert.deepEqual(f.calls.map(c => c.name), ['user', 'gtl_props_capability', 'gtl_props_save_draft', 'gtl_props_board', 'gtl_research_quote_fetches',
    'gtl_props_lock_in', 'gtl_market_snapshots', 'weekly_rosters', rosterFile, 'gtl_props_begin_refresh', 'odds', 'gtl_finish_research_quotes',
    'gtl_research_quote_fetches', 'gtl_props_record_reference', 'gtl_props_lock_in']);
  const [provider] = f.providerCalls();
  assert.equal(provider.target.pathname, `/v4/sports/americanfootball_nfl/events/${marketGame.providerEventId}/odds`);
  assert.deepEqual(Object.fromEntries(provider.target.searchParams), { apiKey: key, regions: 'us', bookmakers: 'draftkings,fanduel,betmgm', markets: stat, oddsFormat: 'american' });
  assert.equal(provider.options.redirect, 'error');
  assert.equal(provider.options.headers, undefined);
  const locks = f.calls.filter(c => c.name === 'gtl_props_lock_in').map(c => c.args);
  assert.equal(locks[0].p_request, save().requestId);
  assert.deepEqual(locks[0], locks[1]);
  const { args: begin } = f.calls.find(c => c.name === 'gtl_props_begin_refresh');
  assert.notEqual(begin.p_request, save().requestId);
  assert.deepEqual(begin, { p_request: begin.p_request, p_season: 2026, p_week: 10, p_event_id: offer.eventId, p_player_id: offer.playerId, p_stat: stat });
  const { args: finish } = f.calls.find(c => c.name === 'gtl_finish_research_quotes');
  assert.equal(finish.p_request, begin.p_request);
  assert.equal(finish.p_lease, id(4));
  assert.equal(finish.p_error, null);
  assert.equal(finish.p_quotes.length, 18);
  assert.ok(finish.p_quotes.every(q => q.selection.key === stat && [offer.playerId, teammate.playerId, unoffered.playerId].includes(q.selection.playerId)));
  assert.ok(finish.p_quotes.some(q => q.selection.playerId === unoffered.playerId), 'the full capture keeps eligible athletes absent from the board');
  assert.doesNotMatch(JSON.stringify(result.body), /private-fixture|Another Receiver|Unoffered Receiver|evt-fixture/);
  assert.equal((await f.call()).body.replayed, true);
  assert.equal(f.providerCalls().length, 1);
});

test('a provider failure settles the reservation and keeps the original blind draft recovery', async () => {
  const f = fixture({ providerStatus: 503, provider: { error: key, marketLine: 67.5 } });
  const result = await f.call();
  assert.equal(f.providerCalls().length, 1);
  const { args: finish } = f.calls.find(c => c.name === 'gtl_finish_research_quotes');
  assert.equal(finish.p_error, 'provider_unavailable');
  assert.deepEqual(finish.p_quotes, []);
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
  assert.equal(f.saved().status, 'draft');
  assert.equal(f.saved().guess, save().guess);
  assert.doesNotMatch(JSON.stringify(result.body), /private-fixture|67\.5|provider_unavailable/);
});

test('a missing migration or declined budget lease keeps the draft with zero provider calls', async () => {
  for (const beginError of ['missing', 'revoked', 'GTL_ODDS_BUDGET', 'GTL_ODDS_PREFLIGHT_REQUIRED', 'GTL_ODDS_BUSY', 'GTL_PROPS_WEEKLY_BUDGET']) {
    const f = fixture({ beginError });
    const result = await f.call();
    assert.equal(result.status, 409, beginError);
    assert.equal(result.body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE', beginError);
    assert.equal(f.saved().status, 'draft', beginError);
    assert.equal(f.calls.filter(c => c.name === 'gtl_props_begin_refresh').length, 1, beginError);
    assert.equal(f.providerCalls().length, 0, beginError);
  }
});

test('a peer fresh reference or cooldown rereads shared data and retries the original lock once with no odds request', async () => {
  for (const beginError of ['GTL_PROPS_REFERENCE_FRESH', 'GTL_PROPS_REFRESH_COOLDOWN']) {
    const f = fixture({ beginError, peerCapture: true });
    const result = await f.call();
    assert.equal(result.status, 200, beginError);
    assert.equal(result.body.reference.line, 67.5, beginError);
    const locks = f.calls.filter(c => c.name === 'gtl_props_lock_in');
    assert.deepEqual(locks.map(c => c.args.p_request), [save().requestId, save().requestId]);
    assert.equal(f.calls.filter(c => c.name === 'gtl_props_begin_refresh').length, 1);
    assert.equal(f.providerCalls().length, 0);
  }
  const noCapture = fixture({ beginError: 'GTL_PROPS_REFRESH_COOLDOWN' });
  assert.equal((await noCapture.call()).body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
  assert.equal(noCapture.saved().status, 'draft');
  assert.equal(noCapture.providerCalls().length, 0);
});

test('an unconfirmed reservation never sends a provider request', async () => {
  for (const lease of [{}, { replay: true, status: 'finished' }, { replay: false, lease: id(4), expiresAt: iso(now - 1) }]) {
    const f = fixture({ lease });
    assert.equal((await f.call()).body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
    assert.equal(f.calls.filter(c => c.name === 'gtl_props_begin_refresh').length, 1);
    assert.equal(f.providerCalls().length, 0);
  }
});

test('a kickoff between reservation and collection closes the lease without calling the provider', async () => {
  const f = fixture({ kickOffAfterReservation: true });
  assert.equal((await f.call()).status, 409);
  assert.equal(f.calls.filter(c => c.name === 'gtl_finish_research_quotes').length, 1);
  assert.equal(f.saved().status, 'draft');
  assert.equal(f.providerCalls().length, 0);
});

test('no refresh runs for reads, drafts, a qualifying retained capture, or an ineligible lock', async () => {
  const read = fixture();
  for (const [route, body] of [['read', week], ['history', { from: week, to: week }], ['shared', week], ['draft', save()]]) {
    assert.equal((await read.call(route, body)).status, 200, route);
  }
  assert.equal(read.calls.some(c => c.name === 'gtl_market_snapshots'), false);
  assert.equal(read.providerCalls().length, 0);
  const fresh = fixture({ fetches: [capture()], featureOff: 'player-props-refresh' });
  assert.equal((await fresh.call()).status, 200);
  assert.equal(fresh.calls.some(c => c.name === 'gtl_market_snapshots'), false);
  assert.equal(fresh.providerCalls().length, 0);
  for (const [options, body, status] of [
    [{ auth: false }, save(), 401],
    [{ member: false }, save(), 403],
    [{ ready: false }, save(), 404],
    [{ featureOff: 'player-props' }, save(), 503],
    [{ featureOff: 'player-props-refresh' }, save(), 409],
    [{ oddsKey: '' }, save(), 409],
    [{ offers: [{ ...offer, closed: true }] }, save(), 409],
    [{ offers: [{ ...offer, stat: 'player_receptions' }] }, save({ stat: 'player_receptions', guess: 4.5 }), 409],
    [{}, save({ playerId: '00-0099999' }), 400],
    [{}, save({ providerEventId: 'spoofed' }), 400],
  ]) {
    const f = fixture(options);
    assert.equal((await f.call('lock', body)).status, status);
    assert.equal(f.calls.some(c => c.name === 'gtl_props_begin_refresh'), false);
    assert.equal(f.providerCalls().length, 0);
  }
});

test('an untrusted event fails before reserving', async () => {
  for (const options of [
    { snapshot: null },
    { snapshot: { ...marketGame, matchStatus: 'unmatched' } },
    { snapshot: { ...marketGame, kickoff: iso(Date.parse(kickoff) + 60_000) } },
    { snapshot: { ...marketGame, home: game.away } },
    { snapshot: [marketGame, marketGame] },
  ]) {
    const f = fixture(options);
    assert.equal((await f.call()).body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
    assert.equal(f.saved().status, 'draft');
    assert.equal(f.calls.some(c => c.name === 'gtl_props_begin_refresh'), false);
    assert.equal(f.providerCalls().length, 0);
  }
});

test('missing, unverified or ambiguous weekly roster evidence fails before reserving', async () => {
  for (const options of [
    { rosterStatus: 429 },
    { rosterAsset: { name: 'wrong-file.csv' } },
    { rosterAsset: { size: 1 } },
    { rosterAsset: { size: 24 * 1024 * 1024 + 1 } },
    { rosterAsset: { digest: null } },
    { rosterAsset: { digest: `sha256:${'0'.repeat(64)}` } },
    { rosterAsset: { updated_at: iso(now + 60_000) } },
    { rosterCsv: csv([offer, teammate], 9) },
    { rosterCsv: csv([offer, unoffered]) },
    { rosterCsv: csv([offer, teammate, { ...unoffered, playerName: 'Fixture-Receiver' }]) },
    { rosterCsv: csv([{ ...offer, playerName: 'Different Receiver' }, teammate]) },
    { rosterCsv: csv([offer, teammate]) + '2026,9,REG,malformed\n' },
  ]) {
    const f = fixture(options);
    assert.equal((await f.call()).body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
    assert.equal(f.saved().status, 'draft');
    assert.equal(f.calls.some(c => c.name === 'gtl_props_begin_refresh'), false);
    assert.equal(f.providerCalls().length, 0);
  }
});

test('a warm isolate shares one bounded roster read across concurrent and repeated lock attempts', async () => {
  const f = fixture({ beginError: 'GTL_ODDS_BUDGET' });
  await Promise.all([f.call(), f.call()]);
  await f.call();
  assert.equal(f.calls.filter(c => c.target.href === rosterMeta).length, 1);
  assert.equal(f.calls.filter(c => c.target.href === rosterUrl).length, 1);
  assert.equal(f.providerCalls().length, 0);
});

test('a mismatched, completed or post-kickoff provider response never becomes a successful empty capture', async () => {
  for (const options of [
    { provider: { ...providerEvent(), home_team: 'Washington Commanders' } },
    { provider: { ...providerEvent(), commence_time: iso(Date.parse(kickoff) + 60_000) } },
    { provider: { ...providerEvent(), completed: true } },
    { provider: { ...providerEvent(), completed: 'false' } },
    { provider: { ...providerEvent(), bookmakers: undefined } },
    { kickOffDuringProvider: true },
  ]) {
    const f = fixture(options);
    assert.equal((await f.call()).body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
    const { args: finish } = f.calls.find(c => c.name === 'gtl_finish_research_quotes');
    assert.equal(finish.p_error, 'provider_unavailable');
    assert.deepEqual(finish.p_quotes, []);
    assert.equal(f.calls.filter(c => c.name === 'gtl_props_lock_in').length, 1);
    assert.equal(f.saved().status, 'draft');
  }
});

test('a valid exact provider response can withdraw the market with an empty successful capture', async () => {
  const f = fixture({ provider: { ...providerEvent(), bookmakers: [] } });
  assert.equal((await f.call()).body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
  const { args: finish } = f.calls.find(c => c.name === 'gtl_finish_research_quotes');
  assert.equal(finish.p_error, null);
  assert.deepEqual(finish.p_quotes, []);
  assert.equal(f.saved().status, 'draft');
});

test('stale, malformed or partial provider data cannot withdraw retained quotes', async () => {
  const stale = providerEvent();
  stale.bookmakers[0].markets[0].last_update = iso(now - 360_000);
  const malformed = providerEvent();
  malformed.bookmakers[0].markets[0].outcomes[0].price = '-110';
  const fractional = providerEvent();
  fractional.bookmakers[0].markets[0].outcomes[2].point = 66.25;
  const duplicate = providerEvent();
  const duplicateMarket = duplicate.bookmakers[0].markets[0];
  duplicateMarket.outcomes.push(duplicateMarket.outcomes[2]);
  const unmatched = providerEvent();
  for (const outcome of unmatched.bookmakers[0].markets[0].outcomes) outcome.description = 'Unknown Athlete';
  for (const options of [stale, malformed, fractional, duplicate, unmatched].map(provider => ({ provider })).concat({ providerStatus: 206 })) {
    const f = fixture(options);
    assert.equal((await f.call()).body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
    const { args: finish } = f.calls.find(c => c.name === 'gtl_finish_research_quotes');
    assert.equal(finish.p_error, 'provider_unavailable');
    assert.deepEqual(finish.p_quotes, []);
    assert.equal(f.saved().status, 'draft');
  }
});

test('a successful empty capture withdraws an older capture for that stat', async () => {
  const f = fixture({ fetches: [capture({ markets: ['player_rush_yds'], quote_payload: [] }), capture({ quote_payload: [] }), capture()], featureOff: 'player-props-refresh' });
  const result = await f.call();
  assert.equal(result.status, 409);
  assert.equal(result.body.code, 'GTL_PROPS_REFERENCE_UNAVAILABLE');
  assert.equal(f.saved().status, 'draft');
  assert.equal(f.calls.some(c => c.name === 'gtl_props_record_reference'), false);
});
