// Fixed local fixtures only: compose the three deferred source batches without wiring a provider or applying SQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveDeadline } from '../shared/epl-draft.mjs';
import { eplStandingsPositions, EPL_STANDINGS_CAPTURE_MAX_AGE_MS } from '../shared/epl-standings.mjs';
import { enrichPlayerDisplay } from '../shared/epl-player-directory.mjs';
import { buildFantasyView } from '../cloud/epl-fantasy-view.mjs';

test('dated standings readiness can satisfy the strict fallback locally, but expired data leaves it unavailable', () => {
  const record = JSON.parse(fs.readFileSync('data/epl/standings/wikimedia-2026-round-08-2026-10-29.json', 'utf8'));
  const context = { season: record.season, completedRound: record.completedRound, now: Date.parse(record.capturedAt) };
  const ready = eplStandingsPositions(record, context);
  assert.equal(ready.status, 'ready');
  const clubs = record.rows.slice().sort((a, b) => a.position - b.position).map(row => row.club);
  const input = { order: ['first', 'second', 'third'], picks: [], clubs: [clubs.at(-1), clubs[0]], requirePosition: true };
  assert.throws(() => resolveDeadline(input), /EPL_STANDINGS_REQUIRED/);
  const favorability = Object.fromEntries(Object.entries(ready.positions).map(([club, position]) => [club, { position }]));
  const picked = resolveDeadline({ ...input, favorability });
  assert.equal(picked[0].club, null, 'the on-clock manager with no queue retains the existing no-pick rule');
  assert.equal(picked[1].club, clubs[0]);
  assert.equal(picked[2].club, clubs.at(-1));
  const expired = eplStandingsPositions(record, { ...context, now: context.now + EPL_STANDINGS_CAPTURE_MAX_AGE_MS + 1 });
  assert.equal(expired.status, 'unavailable');
  assert.equal(expired.positions, undefined);
  assert.throws(() => resolveDeadline({ ...input, favorability: expired.positions }), /EPL_STANDINGS_REQUIRED/);
});

test('corrected totals and daily names coexist without borrowing later scoring positions or mutating original snapshots', () => {
  const owner = '865667912365666304', scoring = { pos_m_g: 9, pos_f_g: 100 };
  const roster = points => ({ roster_id: 1, owner_id: owner, starters: ['1'], players: ['1', '2'],
    settings: { fpts: points, fpts_decimal: 0, fpts_against: 80, fpts_against_decimal: 0, wins: 1, losses: 0 } });
  const payload = points => ({ state: { season: '2026', week: 10 }, league: { scoring_settings: scoring }, rosters: [roster(points)] });
  const before = { label: 'before-mw9-kickoff', week: 9, capturedAt: '2026-10-31T12:00:00Z', payload: {
    ...payload(100), state: { season: '2026', week: 9 }, players: { 1: { name: 'Earlier display only', team_abbr: 'ARS' } },
    projections_mw9: [{ player_id: '1', stats: { g: 1 } }],
  } };
  const original = { label: 'after-mw9', week: 9, capturedAt: '2026-11-03T02:00:00Z', payload: { ...payload(109), stats_mw9: [{ player_id: '1', stats: { g: 1 } }] } };
  const recheck = { label: 'after-mw9-recheck', week: 9, capturedAt: '2026-11-03T20:05:00Z', payload: {
    ...payload(110), players: { 1: { name: 'Later forward', position: 'F', team_abbr: 'LIV' } }, stats_mw9: [{ player_id: '1', stats: { g: 1 } }],
  } };
  const directory = { 1: { full_name: 'Current forward', position: 'F', team_abbr: 'LIV' }, 2: { full_name: 'Bench display', position: 'M', team_abbr: 'ARS' } };
  const daily = { label: 'daily-2026-11-04', week: 10, capturedAt: '2026-11-04T00:00:00Z', payload: {
    ...payload(110), projections_mw10: [{ player_id: '1', stats: { g: 1 } }],
  } };
  daily.payload.players = enrichPlayerDisplay(daily.payload, directory).players;
  const immutable = JSON.stringify([original, recheck, daily]);
  const view = buildFantasyView({ snapshots: [before, original, recheck, daily], viewerOwnerId: owner });
  assert.equal(view.insights.weekly.find(row => row.week === 9).points, 10, 'recheck replaces the derived weekly total');
  assert.equal(view.matchup.recent.find(row => row.week === 9).projected, null, 'later F cannot score the earlier display-only lineup');
  assert.equal(view.matchup.myProj, null, 'display-only daily metadata cannot supply a projection scoring position');
  assert.deepEqual(view.insights.topScorerPerTeam, []);
  assert.equal(view.rosters[0].bench[0].name, 'Bench display');
  assert.equal(view.rosters[0].bench[0].pos, null);
  before.payload.players['1'].position = 'M';
  const captured = buildFantasyView({ snapshots: [before, original, recheck, daily], viewerOwnerId: owner });
  assert.equal(captured.matchup.recent.find(row => row.week === 9).projected, 9);
  assert.equal(captured.insights.myTopScorer.points, 9);
  assert.equal(captured.insights.beatProjection.find(row => row.week === 9).diff, 1);
  assert.equal(JSON.stringify([original, recheck, daily]), immutable, 'source snapshots remain unchanged');
});
