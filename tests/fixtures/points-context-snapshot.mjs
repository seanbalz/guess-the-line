// A Fantasy Track 1 snapshot (schema 2) for the Points player context (Board i63), shared by
// tests/next-points-context.test.jsx and tests/cloud-browser/next-points.spec.js. It covers the fixture week those specs
// seed (2026 Week 7: QB PIT @ CLE, RB KC @ LV, WR SEA @ DEN, TE NYJ @ BUF, FLEX MIA @ NE) with fictional players and
// fictional numbers. The FLEX player is left out on purpose, so his slot shows "not in this week's player data".
//
// Full PPR with 4-point passing TDs, by construction:
// - QB: 18, 14, (bye in Week 3), 22, 10, 14 → season 15.6 over 5 games, last 3 (Weeks 4–6) 15.3 over 3 games. Weekly
//   estimate 19.4, the same value as the specs' House for that slot. CLE allowed QBs 12, 16, 20, 12, 16 → 15.2 over 5.
// - RB: Weeks 4–6 only: 13, 16, 7 → 12.0 over 3 games both ways; LV has no defense games here, so "—".
// - WR: a rookie with no recorded games: "—" and "no games"; DEN allowed WRs 10, 20 → 15.0 over 2.
// - TE: 6.0 a game in every week 1–6; no BUF defense games.
export const CONTEXT_SNAPSHOT_TIMES = Object.freeze({ asOf: '2026-10-21T14:00:00Z', generatedAt: '2026-10-21T15:00:00Z', asOfText: 'Oct 21, 7:00 AM PT' });
export const CONTEXT_HOUSE = Object.freeze({ QB: 19.4 });

const ZERO = Object.freeze({ passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0,
  receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0, targets: 0, carries: 0, passingAttempts: 0 });
const stats = patch => ({ ...ZERO, ...patch });
const qbWeek = (week, tds) => ({ week, ...stats({ passingYards: 250, passingTds: tds, passingAttempts: 34 }) });
const allowedQb = points => ({ QB: stats({ passingYards: 200, passingTds: (points - 8) / 4 }), RB: stats({}), WR: stats({}), TE: stats({}) });
const allowedWr = points => ({ QB: stats({}), RB: stats({}), WR: stats({ receivingYards: points * 10 }), TE: stats({}) });
const kickoff = '2026-10-25T17:00:00.000Z';

export function pointsContextSnapshot() {
  const player = (id, name, team, position, opponent, history, weekly, status) => ({
    id, name, team, position, sampleGames: Math.min(history.length, 6), status,
    weekly: { status: 'scheduled', opponent, kickoff, stats: weekly },
    restOfSeason: { games: 10, stats: Object.fromEntries(Object.entries(weekly).map(([key, value]) => [key, value * 10])) },
    history,
  });
  return {
    schemaVersion: 2, season: 2026, week: 7, statsThroughWeek: 6, asOf: CONTEXT_SNAPSHOT_TIMES.asOf, generatedAt: CONTEXT_SNAPSHOT_TIMES.generatedAt,
    rosterFallbackTeams: [],
    method: { name: 'Fixture pace', version: '1', description: 'A fixture for the Points player context tests.' },
    sources: [{ name: 'Fixture source', url: 'https://example.com/stats', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      sha256: 'a'.repeat(64), updatedAt: CONTEXT_SNAPSHOT_TIMES.asOf, retrievedAt: CONTEXT_SNAPSHOT_TIMES.asOf }],
    matchups: {
      CLE: [[1, 12], [2, 16], [4, 20], [5, 12], [6, 16]].map(([week, points]) => ({ week, opponent: 'BAL', allowed: allowedQb(points) })),
      DEN: [[5, 10], [6, 20]].map(([week, points]) => ({ week, opponent: 'KC', allowed: allowedWr(points) })),
    },
    players: [
      player('00-fixture-0', 'Fixture QB Player', 'PIT', 'QB', '@ CLE', [qbWeek(1, 2), qbWeek(2, 1), qbWeek(4, 3), qbWeek(5, 0), qbWeek(6, 1)],
        stats({ passingYards: 250, passingTds: 2, rushingYards: 14, passingAttempts: 34 }), 'Limited Participation in Practice · active roster as of Week 7'),
      player('00-fixture-1', 'Fixture RB Player', 'KC', 'RB', '@ LV', [4, 5, 6].map((week, i) => ({ week, ...stats({ rushingYards: [130, 160, 70][i], carries: 15 }) })),
        stats({ rushingYards: 90, carries: 15 }), 'Full Participation in Practice · active roster as of Week 7'),
      player('00-fixture-2', 'Fixture WR Player', 'SEA', 'WR', '@ DEN', [], stats({ receptions: 3, receivingYards: 40, targets: 5 }), 'Questionable · active roster as of Week 7'),
      player('00-fixture-3', 'Fixture TE Player', 'NYJ', 'TE', '@ BUF', [1, 2, 3, 4, 5, 6].map(week => ({ week, ...stats({ receptions: 2, receivingYards: 40, targets: 3 }) })),
        stats({ receptions: 2, receivingYards: 40, targets: 3 }), 'Game availability not confirmed · active roster as of Week 7'),
    ],
  };
}
