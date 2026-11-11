import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, decode } from './helpers/ui-markup.mjs';
import { OpportunitySignalSection, SignalBoard, signalCounts } from '../web/src/next/fantasy/OpportunitySignals.jsx';
import { PlayerProfileBody } from '../web/src/next/fantasy/FantasyTools.jsx';
import { playerProfile } from '../shared/fantasy-tools.mjs';

// Fictional receivers are render fixtures only: targets rise with i and production is flat, except Receiver 00.
const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0, targets: 0, carries: 0, passingAttempts: 0 };
const game = (week, targets, receptions, yards, tds = 0) => ({ ...zero, week, targets, receptions, receivingYards: yards, receivingTds: tds });
const players = Array.from({ length: 12 }, (_, i) => ({ id: `fx-wr${i}`, name: `Fixture Receiver ${String(i).padStart(2, '0')}`, team: 'SEA', position: 'WR', sampleGames: 2, status: 'Active',
  weekly: { status: 'bye', opponent: null, kickoff: null, stats: null }, restOfSeason: { games: 10, stats: null },
  history: i === 0 ? [game(1, 2, 2, 30, 2), game(2, 2, 2, 30, 2)] : [game(1, 2 + i, 3, 40), game(2, 2 + i, 3, 40)] }));
const snapshot = { schemaVersion: 2, season: 2026, week: 3, statsThroughWeek: 2, players, matchups: {} };
const ppr = { scoring: 'ppr', passingTds: 4 };
const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const noop = () => {};

describe('opportunity signals in the new app', () => {
  it('profile section names the read in words, with expected and actual points per game', () => {
    const html = renderToStaticMarkup(<OpportunitySignalSection snapshot={snapshot} playerId="fx-wr11" settings={ppr}/>);
    expect(markupProblems(html)).toEqual([]);
    const out = text(html);
    expect(out).toContain('Opportunity signal Buy Role ranks well above production');
    for (const value of ['Expected / game', 'Actual / game', '2 games', 'Over expected', 'Role / production', 'WR percentile', 'Descriptive, not a projection.']) expect(out).toContain(value);
  });
  it('the usage profile carries the section, and the Points presentation does not', () => {
    const profile = playerProfile(snapshot, 'fx-wr0', ppr);
    expect(text(renderToStaticMarkup(<PlayerProfileBody profile={profile} snapshot={snapshot} settings={ppr}/>))).toContain('Opportunity signal Sell');
    expect(text(renderToStaticMarkup(<PlayerProfileBody profile={profile} snapshot={snapshot} settings={ppr} pointsPresentation/>))).not.toContain('Opportunity signal');
  });
  it('board lists Buy and Sell with profile buttons, the sample and the backtest evidence', () => {
    const html = renderToStaticMarkup(<SignalBoard snapshot={snapshot} settings={ppr} scoringLabel="PPR" onProfile={noop}/>);
    expect(markupProblems(html)).toEqual([]);
    const out = text(html);
    expect(out).toContain('Buy / sell signals PPR · 4-point passing TDs · Stats through Week 2 · 12 qualified players');
    expect(out).toMatch(/Buy: role ahead of production .*Fixture Receiver 11 SEA WR/);
    expect(out).toMatch(/Sell: production ahead of role .*Fixture Receiver 00 SEA WR/);
    expect(out).toContain('Checked on 2024 and 2025');
    expect(html).toContain('aria-label="Signal position"');
  });
  it('counts reads for the Fantasy tile', () => {
    const counts = signalCounts(snapshot, ppr);
    expect(counts.buy).toBeGreaterThan(0);
    expect(counts.sell).toBeGreaterThan(0);
  });
});
