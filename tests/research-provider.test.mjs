import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverResearchLinks, normalizeResearchEvent, collectResearchQuotes } from '../cloud/research-provider.mjs';
import { observedPlayStatistics, projectPlayStatistics } from '../shared/research-play-statistics.mjs';
import { fixture, NOW, AT, KICKOFF } from './fixtures/research-assessments.mjs';
import { readAssessments } from '../cloud/research-assessments.mjs';

const game = { id: 'SEA-DEN', home: 'Denver Broncos', away: 'Seattle Seahawks', homeCode: 'DEN', awayCode: 'SEA', kickoff: KICKOFF };
const roster = [{ id: 'fixture-player', name: 'Synthetic Receiver', team: 'SEA', gameId: game.id, current: true, availableAt: AT }];
const event = () => ({ id: 'event1', sport_key: 'americanfootball_nfl', home_team: game.home, away_team: game.away, commence_time: KICKOFF,
  bookmakers: [{ key: 'draftkings', markets: [{ key: 'player_reception_yds', last_update: AT, outcomes: [{ name: 'Over', description: 'Synthetic Receiver', point: 65.5, price: -110 }, { name: 'Under', description: 'Synthetic Receiver', point: 65.5, price: -105 }] }] }] });
test('documented props normalize only the exact event and unique pregame roster identity', () => {
  assert.equal(normalizeResearchEvent(event(), { game, roster, now: NOW }).length, 2);
  assert.deepEqual(normalizeResearchEvent(event(), { game: { ...game, home: game.away }, roster, now: NOW }), []);
  assert.deepEqual(normalizeResearchEvent(event(), { game, roster: [...roster, { ...roster[0], id: 'ambiguous' }], now: NOW }), []);
  assert.deepEqual(normalizeResearchEvent(event(), { game, roster: [{ ...roster[0], availableAt: KICKOFF }], now: NOW }), []);
  const duplicate = event(); duplicate.bookmakers[0].markets.push(structuredClone(duplicate.bookmakers[0].markets[0]));
  assert.deepEqual(normalizeResearchEvent(duplicate, { game, roster, now: NOW }), []);
});
test('moneylines and alternate game lines retain their exact market and team terms without a player roster', () => {
  const e = event(); e.bookmakers[0].markets = [
    { key: 'h2h', last_update: AT, outcomes: [{ name: game.home, price: -150 }, { name: game.away, price: 130 }] },
    { key: 'alternate_spreads', last_update: AT, outcomes: [{ name: game.away, point: 7.5, price: -200 }] },
    { key: 'alternate_totals', last_update: AT, outcomes: [{ name: 'Under', point: 49.5, price: -180 }] },
  ];
  const q = normalizeResearchEvent(e, { game, now: NOW });
  assert.equal(q.length, 4); assert.deepEqual(q[0].selection, { market: 'moneyline', key: 'h2h', side: 'home', line: null, unit: 'win' });
  assert.equal(q[2].selection.line, 7.5); assert.equal(q[3].selection.key, 'alternate_totals');
  e.bookmakers[0].markets[0].outcomes.push({ name: 'Draw', price: 1500 });
  assert.equal(normalizeResearchEvent(e, { game, now: NOW }).some(q => q.selection.market === 'moneyline'), false);
});
test('provider reservations precede a charged request; replay makes no request and errors do not leak credentials', async () => {
  const calls = [];
  const rpc = async (name, body) => { calls.push(name); return name === 'gtl_begin_research_quotes' ? { lease: 'lease', expiresAt: KICKOFF } : { status: 'finished' }; };
  const result = await collectResearchQuotes({ rpc, apiKey: 'fixture-secret', requestId: 'fixture', season: 2026, week: 8, game, eventId: 'event1', markets: ['player_reception_yds'], roster, clock: () => NOW,
    fetchImpl: async () => { assert.deepEqual(calls, ['gtl_begin_research_quotes']); return new Response(JSON.stringify(event()), { headers: { 'x-requests-last': '1', 'x-requests-remaining': '100' } }); } });
  assert.equal(result.status, 'collected'); assert.equal(result.quotes.length, 2); assert.equal(calls.at(-1), 'gtl_finish_research_quotes');
  const replay = await collectResearchQuotes({ rpc: async () => ({ replay: true }), apiKey: 'fixture-secret', game, eventId: 'event1', markets: ['player_reception_yds'], roster, fetchImpl: () => assert.fail('no replay request') });
  assert.equal(replay.status, 'already-attempted');
});
test('discovery reports unavailable honestly; only verified free feed origins can be fetched', async () => {
  let calls = 0;
  const config = { sourceId: 'rotobot_ai', free: true, reusePermitted: true, verifiedAt: AT, permissionUrl: 'https://publisher.example/permission', feedUrl: 'https://publisher.example/feed', allowedOrigins: ['https://publisher.example'] };
  const data = await discoverResearchLinks([config], { now: NOW, fetchImpl: async () => { calls++; return new Response('<rss><link>https://x.com/rotobot_ai/status/1234</link><link>https://x.com/rotobot_ai/status/1234</link><link>https://x.com/unselected/status/9</link></rss>'); } });
  assert.equal(calls, 1); assert.deepEqual(data.find(s => s.id === 'rotobot_ai').links, ['https://x.com/rotobot_ai/status/1234']);
  assert.equal(data.filter(s => s.status === 'unavailable').length, 7);
  for (const patch of [{ free: false }, { reusePermitted: false }, { feedUrl: 'https://api.x.com/2/users', allowedOrigins: ['https://api.x.com'] }, { feedUrl: 'https://127.0.0.1/private', allowedOrigins: ['https://127.0.0.1'] }, { verifiedAt: KICKOFF }]) {
    assert.equal((await discoverResearchLinks([{ ...config, ...patch }], { now: NOW, fetchImpl: () => assert.fail('no unapproved fetch') })).every(s => s.status === 'unavailable'), true);
  }
});
test('final server time closes an assessment if source preparation crosses kickoff', async () => {
  const f = fixture();
  const reply = await readAssessments({ board: f.board, userId: 'fixture', now: NOW, clock: () => Date.parse(KICKOFF), service: {
    rpc: async name => name === 'gtl_read_research_snapshot' ? f.snapshot : name === 'gtl_read_research_quotes' ? f.snapshot.quotes : { game: { id: 'SEA-DEN', kickoff: KICKOFF } },
  } });
  assert.equal(reply.assessments[0].color, 'gray'); assert.ok(reply.assessments[0].reasons.includes('pregame_closed'));
});
test('a source-authored quote cannot become a verified betting offer, and hidden selections are never queried', async () => {
  const f = fixture(), calls = [];
  const service = { rpc: async (name, body) => { calls.push([name, body]); return name === 'gtl_read_research_snapshot' ? f.snapshot : name === 'gtl_read_research_quotes' ? [] : {}; } };
  const reply = await readAssessments({ board: f.board, userId: 'fixture', now: NOW, service });
  assert.equal(reply.assessments[0].color, 'gray'); assert.equal(reply.assessments[0].quote, null);
  assert.equal(calls.find(([name]) => name === 'gtl_read_research_quotes')[1].p_selections.length, 1);
  calls.length = 0; f.board.games[0].total.visible = false;
  await readAssessments({ board: f.board, userId: 'fixture', now: NOW, service });
  assert.equal(calls.some(([name]) => name === 'gtl_read_research_quotes'), false);
});
test('existing reproduced trends can qualify at the evaluated consensus line, preserving date and decisive-game definitions', async () => {
  const { board } = fixture();
  const existing = { history: { status: 'fresh', source: { url: 'https://github.com/nflverse/nflverse-data' }, snapshotAsOf: AT, snapshotSha256: 'a'.repeat(64) },
    games: [{ id: game.id, spread: { visible: true, candidateIds: ['test'], currentReference: { value: -3 } } }],
    candidates: [{ id: 'test', title: 'Synthetic historical home trend', qualification: { qualifies: true }, applications: [{ gameId: game.id, direction: 'home' }],
      conditionDescriptions: ['Synthetic condition'], record: { sample: 21, decisive: 20, hitRate: 0.7, coverage: { from: '2025-10-01', to: '2026-10-28' } } }] };
  const lines = { game, spread: { visible: true, line: { capturedAt: AT }, books: [{ book: 'draftkings', line: -3, observedAt: AT, prices: { home: -110, away: -110 } }] } };
  const service = { rpc: async name => name === 'gtl_read_game_lines' ? lines : null, research: { read: async () => existing } };
  const run = () => readAssessments({ board, userId: 'fixture', now: NOW, service });
  assert.equal((await run()).assessments.find(a => a.selection.side === 'home').color, 'yellow');
  assert.equal((await run()).assessments[0].evidence[0].sample.count, 20);
  lines.spread.books[0].line = -4;
  assert.ok((await run()).assessments.every(a => a.color === 'gray'));
});
test('observed play statistics preserve zero, missingness and exact 40/60/100 definitions without inventing charting', () => {
  const base = { game_id: 'completed', posteam: 'SEA', no_play: 0, qb_spike: 0, qb_kneel: 0, qb_scramble: 0, rush_attempt: 0, qb_dropback: 1, pass_attempt: 1, sack: 0, down: 1, ydstogo: 10 };
  const facts = observedPlayStatistics({ team: 'SEA', asOf: AT, sourceHash: 'a'.repeat(64), completedGames: [{ id: 'completed', date: '2026-10-20', availableAt: '2026-10-21T12:00:00Z' }],
    plays: [{ ...base, yards_gained: 4, passing_yards: 4 }, { ...base, yards_gained: 0, passing_yards: 0 }, { ...base, yards_gained: '', passing_yards: '' }, { ...base, game_id: 'future', yards_gained: 99, passing_yards: 99 }] });
  assert.equal(facts.metrics[0].value, 0.5); assert.equal(facts.metrics[0].excluded, 1); assert.equal(facts.metrics[2].value, 2);
  assert.equal(facts.sampleGames, 1); assert.ok(!JSON.stringify(facts).includes('99'));
  const { board } = fixture(); board.games[0].spread.visible = false;
  assert.deepEqual(projectPlayStatistics([{ gameId: 'SEA-DEN', teams: [facts] }], board, NOW), []);
});
