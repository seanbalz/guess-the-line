import test from 'node:test';
import assert from 'node:assert/strict';
import { gameBets } from '../web/src/next/bets/gameBets.js';
import { sheetActions } from '../web/src/next/bets/index.js';
const scope = { season: 2026, week: 6, gameId: 'SEA-DEN', leagueId: 'private' };
const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-15T20:00:00Z' };
const selection = { side: 'home', line: -13.5, odds: -115, source: 'Saved book', units: 2 };
const data = () => ({ season: 2026, week: 6, leagueId: 'private', published: true, now: '2026-10-14T12:00:00Z',
  games: [game, { ...game, id: 'HOU-JAX' }], roster: [{ userId: 'you', displayName: 'You' }, { userId: 'friend', displayName: 'Friend' }],
  markets: {}, bets: [
    { gameId: game.id, userId: 'friend', market: 'spread', selection, status: 'win', result: { netUnits: 4 } },
    { gameId: game.id, userId: 'you', market: 'total', selection: { ...selection, side: 'over', line: 44.5 } },
    { gameId: game.id, userId: 'outsider', market: 'total', selection },
    { gameId: 'HOU-JAX', userId: 'friend', market: 'total', selection },
  ], faces: { 'SEA-DEN': ['outsider', 'friend'] }, qualification: [] });
test('game bets project only this matchup and roster; closed friends keep side/units but no terms/results', () => {
  const view = gameBets(data(), scope, 'you');
  assert.equal(view.game.picks.length, 2); assert.equal(view.game.faces.length, 2);
  assert.equal(view.game.picks[0].you, true); assert.equal(view.game.picks[0].terms.pick, 'Over 44.5');
  const friend = view.game.picks[1]; assert.equal(friend.side, 'DEN'); assert.equal(friend.units, '2U');
  assert.equal(friend.terms, null); assert.equal(friend.result, null); assert.deepEqual(view.closed, ['spread']);
});
test('server-opened market exposes saved terms; unrelated open markets do not', () => {
  const reply = data(); reply.markets = { 'SEA-DEN': { total: { visible: true } } };
  assert.equal(gameBets(reply, scope, 'you').game.picks[1].terms, null);
  reply.markets['SEA-DEN'].spread = { visible: true };
  assert.equal(gameBets(reply, scope, 'you').game.picks[1].terms.pick, 'DEN −13.5');
});
test('mismatched week/league/game or invalid reply fails closed; unpublished and empty are distinct', () => {
  for (const patch of [{ week: 7 }, { leagueId: null }, { games: [] }, { now: 'invalid' }, { bets: null }]) assert.throws(() => gameBets({ ...data(), ...patch }, scope, 'you'));
  assert.equal(gameBets({ ...data(), bets: [] }, scope, 'you').game, null);
  assert.equal(gameBets({ ...data(), published: false, games: [] }, scope, 'you').published, false);
});
test('Bets owns a read-only game slot with explicit season/week', () => {
  const calls = [], target = { ...game, season: 2026, week: 6 };
  assert.equal(sheetActions[0].show(target, { accountId: 'you' }), true);
  assert.equal(sheetActions[0].show(target, {}), false);
  sheetActions[0].run(target, { openSheet: (...args) => calls.push(args) });
  assert.deepEqual(calls, [['sh.gameBets', { game: game.id, season: 2026, week: 6 }]]);
});
