import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCloudHandler } from '../cloud/handler.mjs';
import { createStore, seed } from '../server/store.mjs';
import { createServer } from '../server/index.mjs';
import { LOCAL_SOCIAL_IDS } from '../server/social-store.mjs';
import { applySocialMutation, emptySocialState } from '../shared/social-bets.mjs';
import { socialBetExport } from '../shared/social-export.mjs';

const clock = () => Date.parse('2026-10-08T20:00:00Z');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const intake = JSON.parse(fs.readFileSync(new URL('../data/bets/2026-week-05-social-intake.json', import.meta.url), 'utf8'));

function fixtures() {
  const gameState = seed(), games = gameState.games;
  let old = emptySocialState(), serial = 1000;
  for (const { owner, ...body } of intake.entries) old = applySocialMutation(old, {
    actorId: LOCAL_SOCIAL_IDS[owner], action: 'create', body, games, now: clock(), uuid: () => id(++serial),
  });
  const first = old.entries.find(entry => entry.ownerId === LOCAL_SOCIAL_IDS.sean);
  old = applySocialMutation(old, { actorId: first.ownerId, action: 'include',
    body: { season: 2026, week: 5, entryId: first.id, revision: first.revision, requestId: id(++serial), countsForRecord: false, reason: 'Synthetic export exclusion test' }, games, now: clock() });
  const newer = applySocialMutation(emptySocialState(), { actorId: LOCAL_SOCIAL_IDS.sean, action: 'create', now: clock(), games, uuid: () => id(++serial),
    body: { season: 2026, week: 6, requestId: id(++serial), kind: 'single', odds: -110, stakeUnits: 1, source: 'Synthetic export test', legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'home', line: -3 }] } });
  const weeks = [{ season: 2026, week: 5, revision: 17, games, state: old }, { season: 2026, week: 6, revision: 1, games, state: newer }];
  return { gameState, weeks, raw: { season: 2026, week: 6, availableWeeks: weeks.map(({ season, week }) => ({ season, week })), following: [LOCAL_SOCIAL_IDS.troy],
    profiles: Object.entries(LOCAL_SOCIAL_IDS).map(([displayName, id]) => ({ id, displayName, email: 'do-not-export@example.invalid' })), weeks } };
}

function cloudFixture({ failRead = false, missingService = false } = {}) {
  const data = fixtures(), calls = [];
  const handler = createCloudHandler({ clock,
    authenticate: async token => LOCAL_SOCIAL_IDS[token] ? { id: LOCAL_SOCIAL_IDS[token], emailConfirmed: true, email: `${token}@example.invalid` } : null,
    storage: { membership: async user => ({ player_id: Object.keys(LOCAL_SOCIAL_IDS).find(key => LOCAL_SOCIAL_IDS[key] === user), active: true }) },
    weekly: { load: async () => ({ revision: 0, leagueRevision: 0, state: data.gameState }) },
    social: missingService ? undefined : { rpc: async (name, args) => { calls.push({ name, args }); if (failRead) throw new Error('private provider failure'); return data.raw; } },
  });
  return { calls, data, request: (owner = 'sean', suffix = '') => handler(new Request(`https://fixture.invalid/export${suffix}`, { headers: owner ? { Authorization: `Bearer ${owner}` } : {} })) };
}

test('cloud export includes every owned ticket, all weeks and all parlay legs without other owners or private state', async () => {
  const app = cloudFixture();
  const response = await app.request();
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const exported = await response.json(), social = exported.socialBets;
  assert.equal(exported.ballots.guess_spread.picks['TB-DAL'], -9.5, 'existing private own ballot export is preserved');
  assert.equal(social.ticketCount, 3); assert.equal(social.selectionCount, 9); assert.equal(social.historyScope, 'all');
  assert.deepEqual([...new Set(social.entries.map(entry => entry.week))].sort(), [5, 6]);
  assert.ok(social.entries.every(entry => entry.ownerId === LOCAL_SOCIAL_IDS.sean));
  assert.equal(social.entries.filter(entry => entry.kind === 'parlay').length, 2);
  assert.equal(social.entries.filter(entry => entry.kind === 'parlay').every(entry => entry.stakeUnits === null), true);
  assert.ok(social.entries.some(entry => entry.legs.some(leg => leg.selection.includes('Jalon Daniels'))));
  const excluded = social.entries.find(entry => !entry.countsForRecord);
  assert.equal(excluded.audit.length, 2); assert.equal(excluded.audit[0].after.legs.length, 5);
  assert.equal(excluded.audit[1].before.countsForRecord, true); assert.equal(excluded.audit[1].after.countsForRecord, false);
  assert.equal(social.summary.bets, 2); assert.equal(social.summary.excludedCount, 1);
  assert.ok(social.games.every(game => social.entries.some(entry => entry.week === game.week && entry.legs.some(leg => leg.gameId === game.id))));
  assert.deepEqual(app.calls, [{ name: 'gtl_read_social', args: { p_user: LOCAL_SOCIAL_IDS.sean, p_season: null, p_week: null, p_all: true } }]);
  const json = JSON.stringify(social);
  for (const forbidden of ['do-not-export', 'receipts', 'signature', 'following', 'ballots', 'profiles', LOCAL_SOCIAL_IDS.troy]) assert.equal(json.includes(forbidden), false, forbidden);
  const troy = await (await app.request('troy')).json();
  assert.equal(troy.socialBets.ticketCount, 14); assert.equal(troy.socialBets.selectionCount, 14);
  assert.ok(troy.socialBets.entries.every(entry => entry.odds === null && entry.stakeUnits === 1));
  assert.deepEqual(troy.ballots, {});
  const luke = await (await app.request('luke')).json();
  assert.deepEqual(luke.socialBets.entries, []); assert.equal(luke.socialBets.ticketCount, 0);
});

test('cloud export rejects identity spoofing and returns an error instead of an incomplete download', async () => {
  const app = cloudFixture();
  assert.equal((await app.request(null)).status, 401);
  assert.equal((await app.request('sean', '?player=troy')).status, 400);
  assert.equal(app.calls.length, 0);
  for (const options of [{ failRead: true }, { missingService: true }]) {
    const response = await cloudFixture(options).request();
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(Object.hasOwn(body, 'ballots'), false); assert.equal(Object.hasOwn(body, 'socialBets'), false);
    assert.equal(JSON.stringify(body).includes('private provider'), false);
  }
});

test('export helper fails closed on partial history and a mismatched audit owner', () => {
  const own = LOCAL_SOCIAL_IDS.sean;
  assert.throws(() => socialBetExport({ actorId: own, historyScope: 'week', entries: [], games: [] }, own), /complete/);
  assert.throws(() => socialBetExport({ actorId: own, historyScope: 'all', games: [], entries: [
    { id: id(40), ownerId: own, legs: [], audit: [{ before: { id: id(40), ownerId: LOCAL_SOCIAL_IDS.troy } }] },
  ] }, own), /complete/);
});

test('local HTTP export preserves all supplied ticket legs and history across weeks and restarts', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-social-export-'));
  const file = path.join(directory, 'state.json'), fixture = fixtures();
  fs.writeFileSync(file, JSON.stringify(fixture.gameState));
  fs.writeFileSync(`${file}.social.json`, JSON.stringify({ version: 1, follows: {}, receipts: [],
    weeks: Object.fromEntries(fixture.weeks.map(({ season, week, ...data }) => [`${season}-${week}`, data])) }));
  const server = createServer(createStore(file, clock));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${base}/api/export?player=sean`);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const exported = await response.json();
  assert.equal(exported.socialBets.ticketCount, 3); assert.equal(exported.socialBets.selectionCount, 9);
  assert.equal(exported.socialBets.entries.find(entry => !entry.countsForRecord).audit.length, 2);
  assert.deepEqual((await createStore(file, clock).export('sean')).socialBets, exported.socialBets);
  const troy = await (await fetch(`${base}/api/export?player=troy`)).json();
  assert.equal(troy.socialBets.ticketCount, 14); assert.ok(troy.socialBets.entries.every(entry => entry.ownerId === LOCAL_SOCIAL_IDS.troy));
  assert.equal((await fetch(`${base}/api/export?player=intruder`)).status, 400);
});

test('a local historical week without its schedule prevents a silent partial export', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-social-export-incomplete-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json'), fixture = fixtures();
  const { games, ...older } = fixture.weeks[1];
  fs.writeFileSync(`${file}.social.json`, JSON.stringify({ version: 1, follows: {}, receipts: [], weeks: { '2026-6': older } }));
  await assert.rejects(createStore(file, clock).export('sean'), error => error.status === 503 && /older shared bet schedule/.test(error.message));
});

test('local writes keep the prior schedule available after the preview advances to another week', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-social-export-rollover-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'state.json'), state = seed();
  fs.writeFileSync(file, JSON.stringify(state));
  const create = week => ({ season: 2026, week, weekRevision: 0, requestId: id(3000 + week), kind: 'single', odds: -110, stakeUnits: 1,
    source: 'Synthetic rollover fixture', legs: [{ gameId: 'TB-DAL', market: 'spread', side: 'home', line: -3 }] });
  await createStore(file, clock).socialAction('sean', 'create', create(5));
  state.league.week = 6;
  fs.writeFileSync(file, JSON.stringify(state));
  const next = createStore(file, clock);
  await next.socialAction('sean', 'create', create(6));
  const exported = await createStore(file, clock).export('sean');
  assert.deepEqual(exported.socialBets.entries.map(entry => entry.week).sort(), [5, 6]);
  assert.equal(exported.socialBets.ticketCount, 2);
});
