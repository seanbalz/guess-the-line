// TEST ONLY. Invented names and statistics exercise display states, not a model or an NFL result. This file
// stays under tests, has no production importer, and must never be used as a public demo or forecast.
import { buildReplay } from '../../../shared/simulation-replay.mjs';
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const stats = (id, name, teamId, extra = {}) => ({ id, name, teamId, passingYards: 0, rushingYards: 0, receivingYards: 0, passingTD: 0, rushingTD: 0, receivingTD: 0, receptions: 0, ...extra });
const quarterback = extra => stats('fixture-qb', 'Fixture Quarterback', 'test-away', extra);
const receiver = extra => stats('fixture-wr', 'Fixture Receiver With A Long Name', 'test-away', extra);

// The deliberately artificial shape fixture lets SSR tests target nullable/malformed/escaping edge cases.
export const shapeReplayFixture = freeze({
  id: 'test-only-replay', simulationLabel: 'Simulation', modelVersion: 'test-only-v1',
  inputAsOf: '2026-10-15T12:00:00.000Z', seed: 'test-only-seed', status: 'complete',
  readiness: 'research_only', publicationReady: false,
  teams: { home: { id: 'test-home', name: 'Test Home', abbreviation: 'HME' }, away: { id: 'test-away', name: 'Test Away', abbreviation: 'AWY' } },
  events: [
    { id: 'fixture-start', quarter: 1, clockSeconds: 900, possessionTeamId: 'test-away', fieldPosition: 25, down: 1, distance: 10, score: { home: 0, away: 0 }, caption: 'Test-only opening state at the away team’s own 25.', playerStats: [quarterback(), receiver()] },
    { id: 'fixture-pass', quarter: 1, clockSeconds: 862, possessionTeamId: 'test-away', fieldPosition: 43, down: 1, distance: 10, score: { home: 0, away: 0 }, caption: 'Test-only completion: Fixture Quarterback passes to Fixture Receiver With A Long Name for 18 yards.', playerStats: [quarterback({ passingYards: 18 }), receiver({ receivingYards: 18, receptions: 1 })] },
    { id: 'fixture-score', quarter: 1, clockSeconds: 823, possessionTeamId: null, fieldPosition: null, down: null, distance: null, score: { home: 0, away: 6 }, caption: 'Test-only touchdown reception for 57 yards. The try has not been supplied.', playerStats: [quarterback({ passingYards: 75, passingTD: 1 }), receiver({ receivingYards: 75, receivingTD: 1, receptions: 2 })] },
    { id: 'fixture-end', quarter: 4, clockSeconds: 0, possessionTeamId: null, fieldPosition: null, down: null, distance: null, score: { home: 0, away: 6 }, caption: 'Test-only terminal snapshot. Intermediate plays are intentionally omitted from this UI fixture.', playerStats: [quarterback({ passingYards: 75, passingTD: 1 }), receiver({ receivingYards: 75, receivingTD: 1, receptions: 2 })] },
  ],
});

// The browser harness uses the real reducer so score, clock, field, captions and cumulative player statistics
// come from one coherent sequence. Names and outcomes remain explicitly test-only; example.test is not a source.
export const replayFixture = buildReplay({
  id: 'test-only-replay', modelVersion: 'test-only-v1', inputAsOf: '2026-10-15T00:00:00Z', seed: 'test-only-seed',
  teams: { home: { id: 'BUF', name: 'Buffalo Bills', abbreviation: 'BUF' }, away: { id: 'SEA', name: 'Seattle Seahawks', abbreviation: 'SEA' } },
  roster: { asOf: '2026-10-15T00:00:00Z', sourceUrl: 'https://example.test/test-only-roster', licenseUrl: 'https://example.test/test-only-license', players: [
    { id: 'h-qb', name: 'Fixture Quarterback', teamId: 'BUF' },
    { id: 'h-wr', name: 'Fixture Receiver With A Long Name', teamId: 'BUF' },
    { id: 'h-k', name: 'Fixture Kicker', teamId: 'BUF' },
    { id: 'a-rb', name: 'Fixture Runner', teamId: 'SEA' },
  ] },
  initialReceivingTeamId: 'BUF',
  plays: [
    { id: 'fixture-start', type: 'kickoff', quarter: 1, clockSeconds: 900, receivingTeamId: 'BUF', fieldPosition: 25 },
    { id: 'fixture-pass', type: 'pass', quarter: 1, clockSeconds: 850, passerId: 'h-qb', receiverId: 'h-wr', complete: true, yards: 15 },
    { id: 'fixture-score', type: 'pass', quarter: 1, clockSeconds: 800, passerId: 'h-qb', receiverId: 'h-wr', complete: true, yards: 60 },
    { id: 'fixture-xp', type: 'extra_point', quarter: 1, clockSeconds: 800, kickerId: 'h-k', made: true },
    { id: 'fixture-kickoff', type: 'kickoff', quarter: 1, clockSeconds: 790, receivingTeamId: 'SEA', fieldPosition: 25 },
    { id: 'fixture-q1', type: 'period_end', quarter: 1, clockSeconds: 0 },
    { id: 'fixture-q2-run', type: 'run', quarter: 2, clockSeconds: 890, rusherId: 'a-rb', yards: 5 },
    { id: 'fixture-q2', type: 'period_end', quarter: 2, clockSeconds: 0 },
    { id: 'fixture-half', type: 'kickoff', quarter: 3, clockSeconds: 900, receivingTeamId: 'SEA', fieldPosition: 30 },
    { id: 'fixture-q3-run', type: 'run', quarter: 3, clockSeconds: 890, rusherId: 'a-rb', yards: 5 },
    { id: 'fixture-q3', type: 'period_end', quarter: 3, clockSeconds: 0 },
    { id: 'fixture-q4-run', type: 'run', quarter: 4, clockSeconds: 890, rusherId: 'a-rb', yards: 1 },
    { id: 'fixture-end', type: 'period_end', quarter: 4, clockSeconds: 0 },
  ],
});
