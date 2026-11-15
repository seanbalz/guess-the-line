import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ linesApi: vi.fn() }));
import PropModelPanels from '../web/src/next/research/PropModelPanels.jsx';
import { buildPropBaselineProjection } from '../shared/prop-baseline-projections.mjs';
import { buildPositionDefenseMatchups } from '../shared/position-defense-matchups.mjs';
import { projectPropResearch } from '../shared/project-prop-research.mjs';
import { expireAssessments } from '../web/src/next/research/useAssessments.js';

const NOW = Date.parse('2026-11-15T18:00:00Z');
const at = new Date(NOW).toISOString(), kickoff = '2026-11-16T18:00:00Z';
const playerId = '00-0036358', day = 86400000;
// Synthetic observations are transformed by the actual mathematical helpers and
// public allowlist. No illustrative output values are injected into a model.
function fixture({ observations = 8, constant = null, quote = true } = {}) {
  const rows = Array.from({ length: observations }, (_, i) => ({ playerId, gameId: `history-${i}`,
    kickoff: new Date(NOW - (observations + 2 - i) * 7 * day).toISOString(),
    availableAt: new Date(NOW - (observations + 2 - i) * 7 * day + day).toISOString(), value: constant ?? 50 + i }));
  const baseline = buildPropBaselineProjection({ rows, playerId, gameId: 'SEA-DEN', kickoff, asOf: at });
  const completedGames = ['DEN', 'CHI'].flatMap(defense => [1, 2, 3].map(i => ({ gameId: `${defense}-${i}`, defense,
    season: 2026, kickoff: new Date(NOW - i * 7 * day).toISOString(), availableAt: new Date(NOW - i * 7 * day + day).toISOString(), complete: true })));
  const allowed = completedGames.flatMap(g => [1, 2].map(i => ({ gameId: g.gameId, playerId: `synthetic-${i}`, position: 'WR',
    opponent: g.defense, kickoff: g.kickoff, availableAt: g.availableAt, value: g.defense === 'DEN' ? 50 : 25 })));
  const ranking = buildPositionDefenseMatchups({ rows: allowed, completedGames, position: 'WR', season: 2026, asOf: at });
  const match = { ...ranking.teams.find(t => t.defense === 'DEN'), rankedDefenses: ranking.rankedDefenses };
  const board = { season: 2026, week: 11, games: [{ id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff,
    started: false, spread: { visible: true }, total: { visible: true } }] };
  const source = { stats: { url: 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv', sha256: 'a'.repeat(64), updatedAt: at, retrievedAt: at },
    rosters: { url: 'https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_2026.csv', sha256: 'b'.repeat(64), updatedAt: at, retrievedAt: at },
    schedule: { url: 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv', sha256: 'c'.repeat(64), semanticSha256: 'd'.repeat(64), updatedAt: at, retrievedAt: at } };
  const raw = { version: 1, generatedAt: at, source, games: [{ gameId: 'SEA-DEN', week: 11, kickoff, players: [{ playerId,
    playerName: 'Synthetic Receiver', team: 'SEA', opponent: 'DEN', position: 'WR', markets: [{ key: 'player_reception_yds', unit: 'yards',
      baseline, matchups: { season: match, last5: match } }] }] }] };
  const assessments = [{ gameId: 'SEA-DEN', selection: { playerId, key: 'player_reception_yds', unit: 'yards', side: 'over', line: 65.5 },
    quote: quote ? { source: 'Synthetic Book', observedAt: at, odds: -110 } : null }];
  return { research: projectPropResearch(raw, board, NOW), assessments, raw, board };
}
const render = ({ research, assessments }, category = 'All props') => renderToStaticMarkup(<PropModelPanels research={research} assessments={assessments} category={category}/>);

describe('Prop model panels', () => {
  it('shows the calculated baseline beside the exact player/stat/unit quote, not a betting edge', () => {
    const data = fixture(); expect(data.research.status).toBe('available');
    const html = render(data);
    expect(html).toContain('53.5'); expect(html).toContain('over 65.5 yards');
    expect(html).toContain('Synthetic Book'); expect(html).toContain('8 recorded appearances');
    expect(html).toContain('3 chronological holdouts');
    expect(html).toContain('A gap to the market is not a betting edge');
    expect(html).toContain('Not adjusted for injuries, role, opponent or price');
  });
  it('keeps a genuine baseline with no quote and cannot borrow another player or unit price', () => {
    const data = fixture({ quote: false });
    data.assessments.push({ ...fixture().assessments[0], selection: { ...data.assessments[0].selection, playerId: '00-OTHER' } });
    data.assessments.push({ ...fixture().assessments[0], selection: { ...data.assessments[0].selection, unit: 'receptions' } });
    const html = render(data);
    expect(html).toContain('53.5'); expect(html).toContain('Market line</dt><dd>Unavailable');
    expect(html).not.toContain('over 65.5'); expect(html).not.toContain('Synthetic Book');
  });
  it('withholds an empirical range below20 holdouts and renders retrospective limitations and sources', () => {
    const html = render(fixture());
    expect(html).toContain('Range unavailable: fewer than 20 historical holdouts');
    expect(html).not.toContain('Empirical residual range:');
    expect(html).toContain('Retrospective chronological holdout');
    expect(html).toContain('not archived real-time editions');
    expect(html).toContain('Current-final-data retrospective evaluation');
    expect(html).toContain('later stat revisions');
    expect(html).toContain('nflverse player statistics'); expect(html).toContain('Weekly rosters'); expect(html).toContain('CC BY 4.0');
  });
  it('renders helper-derived residual ranges only as uncalibrated historical ranges', () => {
    const data = fixture({ observations: 25, constant: 7 });
    expect(data.research.games[0].players[0].markets[0].baseline.holdout.count).toBe(20);
    const html = render(data);
    expect(html).toContain('Empirical residual range: 7.0–7.0 yards. Not calibrated coverage.');
    expect(html).toContain('20 chronological holdouts');
    expect(html).not.toContain('Range unavailable:');
  });
  it('renders actual aggregate rank, covered-game denominator and player sample without favorable claims', () => {
    const html = render(fixture());
    expect(html).toContain('WR vs DEN'); expect(html).toContain('100.0 yards');
    expect(html).toContain('Rank 1 of 2 covered defenses');
    expect(html).toContain('3 covered / 3 selected games'); expect(html).toContain('6 player appearances');
    expect(html).toContain('0 missing games');
    expect(html).toContain('Totals across published players at this position, not a prediction for one player');
    expect(html).toContain('Descriptive, not opponent-adjusted');
    expect(html).not.toContain('Favorable matchup');
  });
  it('respects an unavailable projected view and category scope without substituting sample players', () => {
    const data = fixture(), gated = projectPropResearch(data.raw, { ...data.board, games: [] }, NOW);
    const hidden = render({ ...data, research: gated });
    expect(hidden).toContain('No eligible baseline projections'); expect(hidden).not.toContain('Synthetic Receiver'); expect(hidden).not.toContain('WR vs DEN');
    const filtered = render(data, 'Passing');
    expect(filtered).toContain('Position-defense rankings unavailable'); expect(filtered).not.toContain('Synthetic Receiver'); expect(filtered).not.toContain('over 65.5');
  });
  it('expires targets at their exact kickoff without exposing player or matchup metadata', () => {
    const data = fixture(), target = new Date(NOW + 2 * 3600000).toISOString();
    data.raw.games[0].kickoff = target; data.board.games[0].kickoff = target;
    const propResearch = projectPropResearch(data.raw, data.board, NOW);
    const scoped = { season: 2026, week: 11, now: at, assessments: [], propResearch };
    const before = JSON.stringify(scoped);
    const live = expireAssessments(scoped, 2 * 3600000 - 1);
    expect(live.propResearch.status).toBe('available');
    const expired = expireAssessments(scoped, 2 * 3600000);
    expect(expired.propResearch).toEqual({ version: 1, status: 'unavailable', generatedAt: null, source: null, games: [] });
    const html = render({ research: expired.propResearch, assessments: expired.assessments });
    expect(html).not.toContain('Synthetic Receiver'); expect(html).not.toContain('WR vs DEN'); expect(html).not.toContain('53.5');
    expect(JSON.stringify(expired.propResearch)).not.toContain(playerId);
    expect(JSON.stringify(scoped)).toBe(before);
  });
  it('expires model summaries at24h even when target kickoff is later, and cannot reopen an empty scope', () => {
    const data = fixture(), target = new Date(NOW + 2 * day).toISOString();
    data.raw.games[0].kickoff = target; data.board.games[0].kickoff = target;
    const propResearch = projectPropResearch(data.raw, data.board, NOW);
    const scoped = { season: 2026, week: 11, now: at, assessments: [], propResearch };
    expect(expireAssessments(scoped, 0).propResearch).toEqual(propResearch);
    expect(expireAssessments(scoped, -1).propResearch).toEqual(propResearch);
    expect(expireAssessments(scoped, day - 1).propResearch.status).toBe('available');
    const expired = expireAssessments(scoped, day);
    expect(expired.propResearch.status).toBe('unavailable'); expect(expired.propResearch.games).toEqual([]);
    expect(expired.propResearch.source).toBeNull();
    const html = render({ research: expired.propResearch, assessments: expired.assessments });
    expect(html).not.toContain('Synthetic Receiver'); expect(html).not.toContain('WR vs DEN');
    expect(expireAssessments(expired, 0).propResearch.status).toBe('unavailable');
    expect(expireAssessments({ ...scoped, propResearch: undefined }, 0).propResearch.games).toEqual([]);
  });
});
