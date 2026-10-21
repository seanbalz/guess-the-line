import test from 'node:test';
import assert from 'node:assert/strict';
const api = await import('../shared/nba-bets.mjs').catch(() => ({}));
export const fixture = (changes = {}) => ({
  id: '00000000-0000-4000-8000-000000000010', season: '2026-27', eventDate: '2026-10-21',
  kind: 'single', label: 'Synthetic test ticket',
  legs: [{ gameId: 'NBA:synthetic:1', matchup: 'AAA at BBB', market: 'spread', team: 'AAA', line: -2.5 }],
  priceInput: { format: 'american', value: -120 }, stakeUnits: 0.6, outcome: 'pending', ...changes,
});

test('probability conversion preserves four-decimal American terms', () => {
  assert.equal(typeof api.probabilityToAmerican, 'function', 'NBA conversion is implemented');
  assert.equal(api.probabilityToAmerican(57), -132.5581);
  assert.equal(api.probabilityToAmerican(49), 104.0816);
  assert.equal(api.probabilityToAmerican(50), 100);
  assert.equal(api.probabilityToAmerican(79.52), -388.2813);
  assert.equal(api.probabilityToAmerican(7.952e1), -388.2813);
  assert.equal(api.probabilityToAmerican(20.48), 388.2813);
  assert.equal(api.probabilityToAmerican(1e-2), 999900);
  assert.equal(api.probabilityToAmerican(99.99), -999900);
  for (const value of [0, 100, -1, NaN, Infinity, '57', 0.00001]) assert.throws(() => api.probabilityToAmerican(value));
});

test('tickets require complete independent legs and explicitly quoted combined parlay odds', () => {
  assert.equal(typeof api.normalizeNbaTicket, 'function', 'NBA ticket normalization is implemented');
  const normalized = api.normalizeNbaTicket(fixture());
  assert.equal(normalized.odds, -120); assert.equal(normalized.netUnits, null);
  assert.deepEqual(normalized.legs, fixture().legs);
  const second = { gameId: 'NBA:synthetic:2', matchup: 'CCC at DDD', market: 'total', side: 'over', line: 210.5 };
  assert.equal(api.normalizeNbaTicket(fixture({ kind: 'parlay', legs: [...fixture().legs, second], priceInput: { format: 'american', value: 250 } })).odds, 250);
  for (const change of [
    { priceInput: undefined }, { stakeUnits: 0 }, { stakeUnits: 0.123456789 }, { eventDate: '2026-02-30' }, { season: '2026-99' },
    { kind: 'parlay' }, { kind: 'single', legs: [second, second] }, { legs: [] }, { label: ' ' },
    { legs: [{ ...second, side: undefined }] }, { legs: [{ ...fixture().legs[0], line: undefined }] },
    { kind: 'parlay', legs: [second, { ...second, side: 'under' }] },
    { legs: [{ ...second, gameId: 'NFL:synthetic' }] }, { ownerId: 'forged' }, { odds: -110 },
  ]) assert.throws(() => api.normalizeNbaTicket(fixture(change)), JSON.stringify(change));
});

test('owner outcomes keep pending distinct and return push/void stakes without profit', () => {
  assert.equal(typeof api.normalizeNbaTicket, 'function', 'NBA accounting is implemented');
  for (const [outcome, netUnits] of [['pending', null], ['win', '0.50000000'], ['loss', '-0.60000000'], ['push', '0.00000000'], ['void', '0.00000000']]) {
    assert.equal(api.normalizeNbaTicket(fixture({ outcome })).netUnits, netUnits);
  }
  const result = api.normalizeNbaTicket(fixture({ priceInput: { format: 'probability', value: 57 }, outcome: 'win', stakeUnits: 0.12345678 }));
  assert.equal(result.odds, -132.5581); assert.equal(result.netUnits, '0.09313409');
});

test('accounting preserves exact eight-decimal payouts across accepted bounds and exponent numbers', () => {
  for (const [stakeUnits, value, netUnits] of [
    [999999.12345678, 999999.9876, '9999991110.56790869'],
    [1e-8, 150, '0.00000002'], [1e-8, -200, '0.00000001'],
    [999999.99999999, 1e6, '9999999999.99990000'],
  ]) assert.equal(api.normalizeNbaTicket(fixture({ stakeUnits, priceInput: { format: 'american', value }, outcome: 'win' })).netUnits, netUnits);
});
