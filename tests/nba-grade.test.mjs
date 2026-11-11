import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatNbaPrice, gradeNbaLeg, gradeNbaTicket, nbaConfirmReason, nbaLegSide, nbaNoSuggestionReason, NBA_CONFIRM_REASON } from '../shared/nba-grade.mjs';
import { normalizeNbaTicket, probabilityToAmerican } from '../shared/nba-bets.mjs';

const team = (abbreviation, name) => ({ id: abbreviation.length, abbreviation, name });
const game = (id, away, home, awayScore, homeScore, extra = {}) => ({ id: `NBA:balldontlie:${id}`, away, home, awayScore, homeScore, status: 'final', statusText: 'Final', ...extra });
const PHI = team('PHI', 'Philadelphia 76ers'), MIA = team('MIA', 'Miami Heat'), POR = team('POR', 'Portland Trail Blazers'), LAL = team('LAL', 'Los Angeles Lakers'), LAC = team('LAC', 'LA Clippers');
const games = new Map([
  game(1, PHI, MIA, 112, 108),
  game(2, POR, LAL, 100, 110),
  game(3, LAC, LAL, 121, 117, { statusText: 'Final/OT' }),
  game(4, PHI, MIA, null, null, { status: 'in_progress', statusText: '3rd Qtr' }),
].map(row => [row.id, row]));
const single = leg => ({ id: 't', kind: 'single', outcome: 'pending', legs: [leg] });
const outcome = leg => gradeNbaTicket(single(leg), games)?.outcome ?? null;

test('contract: moneyline suggests the winner only for a linked final whose team text names one side', () => {
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'moneyline', team: 'PHI' }), 'win');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'moneyline', team: '76ers' }), 'win');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'moneyline', team: 'Miami Heat' }), 'loss');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:2', market: 'moneyline', team: 'Trail Blazers' }), 'loss');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'moneyline', team: 'Celtics' }), null, 'a team not in the game');
  assert.equal(nbaLegSide('Lakers', game(9, LAC, LAL, 1, 2)), 'home');
  assert.equal(nbaLegSide('Clippers', game(9, LAC, LAL, 1, 2)), 'away');
  assert.equal(nbaLegSide('Los Angeles', game(9, LAC, LAL, 1, 2)), null, 'a city alone is not a team');
  assert.equal(nbaLegSide('', game(9, LAC, LAL, 1, 2)), null);
});

test('contract: spread grades half points and pushes on a whole number', () => {
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'spread', team: 'PHI', line: -3.5 }), 'win');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'spread', team: 'PHI', line: -4.5 }), 'loss');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'spread', team: 'PHI', line: -4 }), 'push');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'spread', team: 'MIA', line: 4.5 }), 'win');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'spread', team: 'MIA', line: 4 }), 'push');
});

test('contract: totals grade over, under and push from both scores', () => {
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'total', side: 'over', line: 219.5 }), 'win');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'total', side: 'under', line: 219.5 }), 'loss');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'total', side: 'under', line: 221.5 }), 'win');
  assert.equal(outcome({ gameId: 'NBA:balldontlie:1', market: 'total', side: 'over', line: 220 }), 'push');
});

test('contract: unlinked, missing or non-final games give no suggestion, and say why', () => {
  for (const gameId of ['NBA:manual:abc', 'NBA:balldontlie:99', 'NBA:synthetic:1']) assert.equal(outcome({ gameId, market: 'moneyline', team: 'PHI' }), null, gameId);
  assert.equal(outcome({ gameId: 'NBA:balldontlie:4', market: 'moneyline', team: 'PHI' }), null, 'in progress');
  assert.equal(nbaNoSuggestionReason(single({ gameId: 'NBA:balldontlie:4', market: 'moneyline', team: 'PHI' }), games), 'waiting');
  assert.equal(nbaNoSuggestionReason(single({ gameId: 'NBA:manual:abc', market: 'moneyline', team: 'PHI' }), games), 'unlinked');
  assert.equal(gradeNbaTicket({ ...single({ gameId: 'NBA:balldontlie:1', market: 'moneyline', team: 'PHI' }), outcome: 'win' }, games), null, 'only pending tickets are graded');
  assert.equal(gradeNbaLeg({ gameId: 'NBA:balldontlie:1', market: 'moneyline', team: 'PHI' }, null).reason, 'unlinked');
});

test('contract: parlays suggest Win only when every leg won and Loss when all are graded with a loss; any push, unlinked or non-final leg gives none', () => {
  const parlay = legs => gradeNbaTicket({ id: 'p', kind: 'parlay', outcome: 'pending', legs }, games)?.outcome ?? null;
  const won = { gameId: 'NBA:balldontlie:1', market: 'moneyline', team: 'PHI' }, lost = { gameId: 'NBA:balldontlie:2', market: 'moneyline', team: 'POR' };
  const pushed = { gameId: 'NBA:balldontlie:1', market: 'spread', team: 'PHI', line: -4 };
  assert.equal(parlay([won, { gameId: 'NBA:balldontlie:2', market: 'total', side: 'under', line: 215.5 }]), 'win');
  assert.equal(parlay([won, lost]), 'loss');
  assert.equal(parlay([won, pushed]), null, 'a push changes the payout');
  assert.equal(parlay([lost, pushed]), null);
  assert.equal(parlay([won, { gameId: 'NBA:manual:x', market: 'moneyline', team: 'PHI' }]), null, 'unlinked');
  assert.equal(parlay([lost, { gameId: 'NBA:balldontlie:4', market: 'moneyline', team: 'PHI' }]), null, 'not final');
});

test('contract: an overtime final carries the overtime note into the audited reason', () => {
  const suggestion = gradeNbaTicket(single({ gameId: 'NBA:balldontlie:3', market: 'spread', team: 'LAC', line: -2.5 }), games);
  assert.equal(suggestion.outcome, 'win');
  assert.equal(suggestion.overtime, true);
  assert.equal(nbaConfirmReason(suggestion), 'Confirmed from final score (final includes overtime)');
  assert.equal(nbaConfirmReason({ outcome: 'win', overtime: false }), NBA_CONFIRM_REASON);
  assert.equal(NBA_CONFIRM_REASON, 'Confirmed from final score');
});

test('contract: prices show whole American odds; 49.5% Novig shows +102 and the stored value is never rewritten (D-23)', () => {
  const odds = probabilityToAmerican(49.5);
  assert.equal(odds, 102.0202);
  assert.equal(formatNbaPrice(odds), '+102');
  assert.equal(formatNbaPrice(-110.1234), '−110');
  assert.equal(formatNbaPrice(-132.5581), '−133');
  assert.equal(formatNbaPrice(100), '+100');
  assert.equal(formatNbaPrice(undefined), '—');
  const terms = normalizeNbaTicket({ id: '00000000-0000-4000-8000-000000000001', season: '2026-27', eventDate: '2026-11-10', kind: 'single', label: '76ers moneyline',
    legs: [{ gameId: 'NBA:balldontlie:1', matchup: 'PHI at MIA', market: 'moneyline', team: 'PHI' }], priceInput: { format: 'probability', value: 49.5 }, stakeUnits: 1, outcome: 'win' });
  assert.deepEqual(terms.priceInput, { format: 'probability', value: 49.5 });
  assert.equal(terms.odds, odds);
});

test('contract: grading has no write or request path', () => {
  const code = readFileSync(new URL('../shared/nba-grade.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /^\s*import\b|\bimport\(|fetch\(|cloudApi|nba\/save|localStorage|Date\.now/m);
});
