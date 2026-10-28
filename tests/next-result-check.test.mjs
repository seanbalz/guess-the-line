import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedGameResult } from '../web/src/next/lines/resultCheck.js';

const game = { id: 'SEA-DEN', away: { code: 'SEA' }, home: { code: 'DEN' } };
const row = { id: game.id, awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-18T17:00:00Z', started: true,
  final: { status: 'final', away: 0, home: 0, source: 'Fixture final', observedAt: '2026-10-18T20:00:00Z', origin: 'commissioner_reported', picks: { secret: 99.125 } },
  spread: { visible: false, value: 97.625 } };
const reply = { season: 2026, week: 6, now: '2026-10-18T21:00:00Z', games: [row] };
const scope = { season: 2026, week: 6, game };

test('an explicit check retains only the selected result and server check time, with zero/ties intact', () => {
  const check = checkedGameResult(reply, scope);
  assert.equal(check.result.score, 'Final · SEA 0–DEN 0');
  assert.match(check.result.provenance, /Commissioner-reported result.*Observed/);
  assert.equal(check.checkedAt, reply.now);
  assert.doesNotMatch(JSON.stringify(check), /99.125|97.625|picks|spread/);
});

test('a valid check distinguishes no complete final from a zero score and does not infer live status', () => {
  for (const final of [null, { ...row.final, status: 'pending' }, { ...row.final, away: null }, { ...row.final, home: -1 }]) {
    assert.equal(checkedGameResult({ ...reply, games: [{ ...row, final }] }, scope).result, null);
  }
  assert.equal(checkedGameResult({ ...reply, games: [{ ...row, started: false }] }, scope).result, null);
  assert.equal(checkedGameResult({ ...reply, now: '2026-10-18T16:00:00Z' }, scope).result, null);
});

test('wrong week, missing selected game, invalid clock and mismatched teams fail closed', () => {
  for (const patch of [{ season: 2025 }, { week: 7 }, { now: 'never' }, { now: 0 }, { games: [] }, { games: null },
    { games: [{ ...row, homeCode: 'SF' }] }, { games: [{ ...row, kickoff: null }] }]) {
    assert.throws(() => checkedGameResult({ ...reply, ...patch }, scope), /Wrong result/);
  }
});

test('unknown result provenance stays explicit after a check', () => {
  const check = checkedGameResult({ ...reply, games: [{ ...row, final: { ...row.final, source: null, observedAt: '2026-10-19T21:00:00Z' } }] }, scope);
  assert.match(check.result.provenance, /Source unavailable.*Result time unverified/);
});
