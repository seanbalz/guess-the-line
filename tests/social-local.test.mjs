import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createStore } from '../server/store.mjs';

test('local shared tracker persists across players and restart, with owner checks and one weekly record', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtl-social-local-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json'), clock = () => Date.parse('2026-10-08T16:00:00Z');
  let store = createStore(file, clock);
  const scope = { season: 2026, week: 5 }, initial = await store.socialAction('sean', 'read', scope);
  assert.equal(initial.entries.length, 0, 'test stores never ingest personal supplied tickets');
  const payload = { ...scope, requestId: randomUUID(), weekRevision: initial.weekRevision, kind: 'parlay', origin: 'tracked', stakeUnits: 1, odds: 210,
    source: 'Synthetic test evidence', legs: [{ gameId: 'PHI-JAX', market: 'spread', side: 'away', line: 7.5 }, { gameId: 'CIN-MIA', market: 'spread', side: 'away', line: -6.5 }] };
  const created = await store.socialAction('sean', 'create', payload);
  assert.equal(created.entries.length, 1); assert.equal(created.summary.qualificationUnits, 1);
  assert.equal((await store.socialAction('sean', 'create', Object.fromEntries(Object.entries(payload).reverse()))).replayed, true);
  const bet = created.entries[0];
  const anotherPlayer = await store.socialAction('troy', 'read', scope);
  assert.equal(anotherPlayer.entries[0].id, bet.id); assert.equal(anotherPlayer.entries[0].canTail, true);
  await assert.rejects(store.socialAction('troy', 'settle', { ...scope, requestId: randomUUID(), weekRevision: created.weekRevision, entryId: bet.id, revision: bet.revision, outcome: 'win', reason: 'Not the owner' }), /unavailable/);
  const settled = await store.socialAction('sean', 'settle', { ...scope, requestId: randomUUID(), weekRevision: created.weekRevision, entryId: bet.id, revision: bet.revision, outcome: 'win', reason: 'Test reported result' });
  assert.equal(settled.summary.roiPercent, 210); assert.equal(settled.summary.record, '1-0-0'); assert.equal(settled.summary.settledStakeUnits, 1);
  store = createStore(file, clock);
  const history = await store.socialAction('luke', 'read', { allHistory: true });
  assert.equal(history.entries.length, 1); assert.equal(history.summary.netUnits, 2.1);
  assert.ok(history.entries[0].audit.length >= 2); assert.equal(history.localOnly, true);
  assert.ok(!JSON.stringify(history).includes('originalPick')); assert.ok(!JSON.stringify(history).includes('ballots'));
});

test('supplied intake keeps unknown ticket prices and screenshot terms without inventing unit stakes', async () => {
  const data = JSON.parse(fs.readFileSync(new URL('../data/bets/2026-week-05-social-intake.json', import.meta.url), 'utf8'));
  const troy = data.entries.filter(e => e.owner === 'troy');
  assert.equal(troy.length, 14); assert.ok(troy.every(e => e.stakeUnits === 1 && e.odds === null && e.countsForRecord));
  const parlays = data.entries.filter(e => e.kind === 'parlay');
  assert.equal(parlays.length, 2); assert.ok(parlays.every(e => e.stakeUnits === null && e.placedAt === null));
  assert.equal(parlays[0].odds, 2100); assert.equal(parlays[1].odds, 337.24);
  assert.match(parlays[1].notes, /\$50 risked and \$218.62 total payout/);
  assert.ok(parlays[0].legs.some(leg => leg.selection.includes('Jalon Daniels')));
});
