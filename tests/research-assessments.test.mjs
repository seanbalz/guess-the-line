import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResearchAssessments, submittedResearchLink, validResearchSelection, reviewResearchEvidence } from '../shared/research-assessments.mjs';
import { matchupStatistics } from '../shared/matchup-statistics.mjs';
import { NOW, S, fixture } from './fixtures/research-assessments.mjs';
const run = f => buildResearchAssessments({ ...f, now: NOW });

test('a source-reported qualitative prop is yellow, independent of any guess; never green', () => {
  const f = fixture(), before = JSON.stringify(f), row = run(f).assessments[0];
  assert.equal(row.color, 'yellow'); assert.equal(row.evidence[0].label, 'Source-reported · not independently reproduced');
  assert.equal(row.quote.odds, -110); assert.equal(row.hasConflicts, false); assert.equal(row.evidenceGroups, 1);
  assert.equal(JSON.stringify(f), before); assert.equal(run(f).model.status, 'not-qualified');
});
test('credible opposition is red, absence is gray, and conflicting support remains yellow with both reasons visible', () => {
  for (const [stance, expected] of [['oppose', 'red'], ['context', 'gray']]) {
    const f = fixture(); f.snapshot.candidates[0].evidence[0].stance = stance;
    assert.equal(run(f).assessments[0].color, expected);
  }
  const f = fixture(); f.snapshot.candidates[0].evidence.push({ ...f.evidence, id: 'opposition', stance: 'oppose' });
  const a = run(f).assessments[0]; assert.equal(a.color, 'yellow'); assert.equal(a.hasConflicts, true); assert.equal(a.evidenceGroups, 1);
});
test('invalid definitions, time, conditions and source claims remain pending instead of contributing votes', async t => {
  const changes = [
    { sample: null }, { sample: { count: 0, unit: 'routes' } }, { metric: { name: 'Yards', value: 3, unit: 'yards' } }, { conditionsKnown: false },
    { sourceId: '4thdownvip' }, { sourceUrl: 'https://x.com/unselected/status/1000001' }, { sourceUrl: 'javascript:alert(1)' },
    { publishedAt: '2026-11-01T00:00:00Z' }, { observedAt: '2026-11-01T00:00:00Z' }, { asOf: '2026-09-01T00:00:00Z' },
    { period: { from: '2026-11-01T00:00:00Z', to: '2026-09-01T00:00:00Z' } }, { rights: 'reference-only' }, { primary: false },
    { family: 'simulation', terms: null }, { terms: { ...S, line: 66.5 } }, { terms: { ...S, unit: 'yards per dropback' } },
    { origin: 'computed', reproduced: false },
  ];
  for (const patch of changes) await t.test(JSON.stringify(patch), () => {
    const f = fixture(); Object.assign(f.snapshot.candidates[0].evidence[0], patch);
    const a = run(f).assessments[0]; assert.equal(a.color, 'gray'); assert.ok(a.evidence[0].reasons.length);
  });
});
test('exact quote identity, market thresholds and expiry are required', async t => {
  for (const patch of [
    { selection: { ...S, line: 66.5 } }, { selection: { ...S, playerId: 'other-player' } }, { selection: { ...S, key: 'player_rush_yds' } },
    { gameId: 'DEN-SEA' }, { kickoff: '2026-10-31T19:00:00Z' }, { provider: 'author-reported' }, { odds: 50 }, { odds: null },
    { observedAt: '2026-10-30T18:59:00Z' }, { capturedAt: '2026-10-30T20:01:00Z' }, { observedAt: '2026-10-30T19:59:00Z' },
  ]) await t.test(JSON.stringify(patch), () => {
    const f = fixture(); Object.assign(f.snapshot.quotes[0], patch); const a = run(f).assessments[0];
    assert.equal(a.color, 'gray'); assert.equal(a.quote, null);
  });
});
test('closed markets never leak a title, source claim, player, sample, quote, ID or count through filtering', () => {
  for (const gate of ['spread', 'total']) {
    const f = fixture(); f.board.games[0][gate].visible = false;
    const out = run(f); assert.deepEqual(out.assessments, []);
    const encoded = JSON.stringify(out);
    for (const secret of ['Synthetic Receiver', '65.5', 'fixture-over', '1000001', 'receiver-zone']) assert.ok(!encoded.includes(secret), secret);
    assert.deepEqual(buildResearchAssessments({ ...f, now: NOW, color: 'yellow', market: 'prop' }).assessments, []);
  }
});
test('every declared dependency must be accessible; wrong season, future source and changed kickoff cannot match', () => {
  const f = fixture(); f.snapshot.candidates[0].dependencies.push({ gameId: 'CAR-GB', market: 'spread' }); assert.equal(run(f).assessments.length, 0);
  for (const patch of [{ season: 2027 }, { generatedAt: '2026-11-01T00:00:00Z' }]) {
    const f = fixture(); Object.assign(f.snapshot, patch); assert.equal(run(f).assessments.length, 0);
  }
  const h = fixture(); h.board.games[0].kickoff = '2026-11-01T00:00:00Z'; assert.equal(run(h).assessments.length, 0);
});
test('multiple books choose the best price at the exact same terms, never the biggest number of source posts', () => {
  const f = fixture(); f.snapshot.quotes.push({ ...f.quote, book: 'fanduel', source: 'FanDuel', odds: 105 });
  f.snapshot.candidates[0].evidence.push({ ...f.evidence, id: 'syndicated-copy', sourceId: '4thdownvip', sourceUrl: 'https://x.com/4thdownvip/status/1000002' });
  const row = run(f).assessments[0]; assert.equal(row.quote.odds, 105); assert.equal(row.evidenceGroups, 1); assert.equal(row.evidence.length, 2);
});
test('a newer same-book price supersedes a better older price; moving the line removes the old offer', () => {
  const f = fixture(); f.snapshot.quotes.push({ ...f.quote, odds: -140, capturedAt: new Date(NOW).toISOString(), observedAt: new Date(NOW).toISOString() });
  assert.equal(run(f).assessments[0].quote.odds, -140);
  f.snapshot.quotes[1].selection = { ...S, line: S.line + 1 };
  assert.equal(run(f).assessments[0].quote, null);
});
test('unsupported selections and malformed snapshots fail closed; no green can be asserted by a source', () => {
  assert.equal(validResearchSelection({ ...S, line: '65.5' }), false);
  const f = fixture(); f.snapshot.candidates[0].color = 'green'; f.snapshot.candidates[0].model = { validated: true, edge: 0.9 };
  assert.equal(run(f).assessments[0].color, 'yellow');
  f.snapshot.quotes = null; assert.equal(run(f).status, 'invalid-source');
});
test('link submission strips tracking parameters, canonicalizes selected identities, and rejects arbitrary fetch targets', () => {
  assert.deepEqual(submittedResearchLink('https://x.com/ActionNetworkHQ/status/1000001?a=tracking&s=46'), { sourceId: 'actionnetworkhq', url: 'https://x.com/actionnetworkhq/status/1000001' });
  for (const url of ['http://x.com/rotobot_ai/status/1', 'https://x.com.evil.test/rotobot_ai/status/1', 'https://x.com:444/rotobot_ai/status/1', 'https://user:pass@x.com/rotobot_ai/status/1', 'https://127.0.0.1/a', 'https://x.com/unselected/status/1', 'https://x.com/rotobot_ai/status/1/photo/1']) assert.throws(() => submittedResearchLink(url));
});
test('observed scoring averages use complete, prior games and preserve missing values', () => {
  const { board } = fixture();
  const rows = [
    { season: 2026, game_id: 'past1', gameday: '2026-10-01', away_team: 'SEA', home_team: 'DEN', away_score: '0', home_score: '21' },
    { season: 2026, game_id: 'past2', gameday: '2026-10-20', away_team: 'SEA', home_team: 'GB', away_score: '', home_score: '14' },
    { season: 2026, game_id: 'future', gameday: '2026-11-20', away_team: 'SEA', home_team: 'GB', away_score: '40', home_score: '10' },
  ];
  const result = matchupStatistics(board, rows, NOW, date => `${date}T23:59:59Z`)[0].teams;
  assert.equal(result[0].sample, 1); assert.equal(result[0].pointsPerGame, 0); assert.equal(result[0].pointsAllowedPerGame, 21);
  assert.deepEqual(rows[1].away_score, '');
  assert.equal(reviewResearchEvidence(fixture().evidence, S, NOW, Date.parse('2026-10-31T18:00:00Z')).eligible, true);
});
