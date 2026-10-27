import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_FILTERS } from '../shared/fantasy-rankings.mjs';
import { markupProblems, decode } from './helpers/ui-markup.mjs';

vi.mock('../web/src/fantasyData.js', () => ({
  FANTASY_AVAILABLE: [{ key: '2026-06', season: 2026, week: 6 }],
  FANTASY_INITIAL: '2026-06',
  useFantasySnapshot: () => ({ status: 'loading' }),
}));
vi.mock('../web/src/fantasyContext.js', () => ({ useFantasyGameContext: () => ({ key: null, lines: null, wind: null }) }));
import { FantasyRankingsView } from '../web/src/FantasyFootball.jsx';
import { FantasyTools, PlayerCompare, PlayerProfileSheet, PlayerToolButtons } from '../web/src/next/fantasy/FantasyTools.jsx';

// Fictional players and defenses are render fixtures only.
const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0, targets: 0, carries: 0, passingAttempts: 0 };
const wrWeek = (week, receptions, yards, targets) => ({ ...zero, week, receptions, receivingYards: yards, targets });
const wr = {
  id: 'fx-wr', name: 'Fixture Receiver', team: 'SEA', position: 'WR', sampleGames: 4, status: 'Questionable · active roster',
  weekly: { status: 'scheduled', opponent: '@ DEN', kickoff: '2026-10-18T20:25:00Z', stats: { ...zero, receptions: 5, receivingYards: 60, targets: 8 } },
  restOfSeason: { games: 11, stats: { ...zero, receptions: 55, receivingYards: 660, targets: 88 } },
  history: [wrWeek(1, 4, 40, 6), wrWeek(2, 6, 80, 9), wrWeek(4, 2, 20, 4), { ...wrWeek(5, 8, 100, null), targets: null }],
};
const rb = { id: 'fx-rb', name: 'Fixture Runner', team: 'DEN', position: 'RB', sampleGames: 2, status: 'Active',
  weekly: { status: 'bye', opponent: null, kickoff: null, stats: null }, restOfSeason: { games: 10, stats: null },
  history: [{ ...zero, week: 4, carries: 15, rushingYards: 70 }, { ...zero, week: 5, carries: 20, rushingYards: 110, rushingTds: 1 }] };
const allowed = yards => ({ QB: zero, RB: zero, WR: { ...zero, receptions: 10, receivingYards: yards }, TE: zero });
const snapshot = {
  schemaVersion: 2, season: 2026, week: 6, statsThroughWeek: 5, asOf: '2026-10-14T12:00:00Z', generatedAt: '2026-10-15T12:00:00Z', rosterFallbackTeams: [],
  method: { name: 'Fixture pace', version: '1', description: 'A test fixture for the recent-pace view.' },
  sources: [{ name: 'Fixture source', url: 'https://example.com/stats', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', sha256: 'a'.repeat(64), updatedAt: '2026-10-14T12:00:00Z', retrievedAt: '2026-10-15T12:00:00Z' }],
  matchups: {
    DEN: [[1, 100], [2, 200], [3, 300], [4, 50], [5, 150]].map(([week, yards]) => ({ week, opponent: 'KC', allowed: allowed(yards) })),
    AAA: [1, 2].map(week => ({ week, opponent: 'SEA', allowed: allowed(0) })), BBB: [4, 5].map(week => ({ week, opponent: 'SEA', allowed: allowed(0) })),
  },
  players: [wr, rb],
};
const ppr = { scoring: 'ppr', passingTds: 4 };
const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const noop = () => {};

describe('fantasy player profile (Q12, Q14)', () => {
  const html = renderToStaticMarkup(<PlayerProfileSheet snapshot={snapshot} playerId="fx-wr" settings={ppr} onClose={noop}/>);
  const out = text(html);
  it('is an accessible dialog with gx markup only', () => {
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Actual fantasy points by week. Week 1: 8.0 points; Week 2: 14.0 points; Week 3: bye; Week 4: 4.0 points; Week 5: 18.0 points."');
  });
  it('shows per-week usage and actual points, byes, and missing stats as a dash', () => {
    for (const value of ['Observed production', 'Usage and actual fantasy points by week', 'Bye', '4 games recorded', 'PPR · 4-point passing TDs · Stats through Week 5']) expect(out).toContain(value);
    expect(html).toContain('<th scope="row">5</th><td><span aria-hidden="true">—</span><span class="gx-sr-only">not recorded</span></td>');
    expect(html).toContain('<abbr title="Targets">Tgt</abbr>');
  });
  it('gives season and last-3-week averages with sample sizes', () => {
    expect(out).toContain('Season 4 games');
    expect(out).toContain('Last 3 weeks Weeks 3–5 · 2 games');
    expect(out).toContain('Fantasy points 11.0 11.0');
    expect(out).toContain('Targets 6.3 n = 3 4.0 n = 1');
  });
  it('keeps the pace estimate in its own labelled section', () => {
    expect(out).toContain('GTL pace estimate An estimate from 4 games of recorded pace, not an observed result or expert projection.');
    expect(out).toContain('Week 6 @ DEN 11.0 est. points');
    expect(out).toContain('Rest of season: 121.0 est. points over 11 games scheduled.');
  });
  it('describes what the opponent allowed to the position, with samples and no advantage claim', () => {
    for (const value of ['Opponent context', '@ DEN: what this defense allowed to WRs in its completed games (PPR).', 'Season per game 26.0 5 games', 'Last 3 games 26.7 3 games', 'All defenses 18.9 9 team games', 'Not a prediction or a matchup grade.']) expect(out).toContain(value);
    expect(out).not.toMatch(/advantage|favorable|smash|start him/i);
  });
  it('can add the player to the comparison from the sheet, and shows whole counts as whole numbers', () => {
    const sheet = renderToStaticMarkup(<PlayerProfileSheet snapshot={snapshot} playerId="fx-wr" settings={ppr} onClose={noop} compare={{ compared: true, full: false, onCompare: noop }}/>);
    expect(markupProblems(sheet)).toEqual([]);
    expect(sheet).toContain('aria-label="Remove from compare: Fixture Receiver"');
    expect(sheet).toContain('aria-pressed="true"');
    expect(out).toContain('1 6 0 0 4 8.0 2 9 0 0 6 14.0 3 Bye');
  });
  it('says why there is no opponent context for a bye or a schema 1 snapshot', () => {
    expect(text(renderToStaticMarkup(<PlayerProfileSheet snapshot={snapshot} playerId="fx-rb" settings={ppr} onClose={noop}/>))).toContain('Bye this week: no opponent.');
    const old = text(renderToStaticMarkup(<PlayerProfileSheet snapshot={{ ...snapshot, schemaVersion: 1, matchups: undefined }} playerId="fx-wr" settings={ppr} onClose={noop}/>));
    expect(old).toContain('Opponent history is not included in this snapshot.');
    expect(old).toContain('No recorded stats');
    expect(old).toContain('byes are not marked in this snapshot');
  });
});

describe('fantasy player comparison (Q13)', () => {
  const render = props => renderToStaticMarkup(<PlayerCompare snapshot={snapshot} ids={['fx-wr', 'fx-rb']} onChange={noop} onProfile={noop} settings={{ scoring: 'standard', passingTds: 4 }} {...props}/>);
  it('shows two players side by side in one scoring format and period, with samples', () => {
    const html = render(), out = text(html);
    expect(markupProblems(html)).toEqual([]);
    for (const label of ['Comparison scoring', 'Comparison period', 'Players in comparison', 'Remove Fixture Receiver from comparison']) expect(html).toContain(label);
    expect(out).toContain('Standard · 4-point passing TDs · Observed per game · Weeks 1–5');
    expect(out).toContain('Points / game 6.0 12.0');
    expect(out).toContain('Games 4 games 2 games');
    expect(out).toContain('Carries 0.0 17.5');
  });
  it('labels this week as an estimate and shows byes', () => {
    const out = text(render({ initialPeriod: 'week' }));
    expect(out).toContain('Week 6 GTL pace estimate, not a result');
    expect(out).toContain('Est. points 6.0 Bye');
    expect(out).toContain('Pace sample 4 games 2 games');
    expect(out).toContain('Opponent @ DEN Bye');
  });
  it('asks for a second player before comparing and stops at three', () => {
    const one = text(render({ ids: ['fx-wr'] }));
    expect(one).toContain('Pick 2–3 players');
    expect(one).not.toContain('Points / game');
    const buttons = renderToStaticMarkup(<PlayerToolButtons player={rb} compared={false} full onProfile={noop} onCompare={noop}/>);
    expect(markupProblems(buttons)).toEqual([]);
    expect(buttons).toContain('disabled=""');
    expect(text(buttons)).toContain('Comparison is full (3 players)');
  });
});

describe('fantasy tools in the rankings view', () => {
  it('adds player actions and the comparison card without changing the ranking markup rules', () => {
    const html = renderToStaticMarkup(<FantasyRankingsView theme="next" state={{ status: 'ready', snapshot }} now={Date.parse('2026-10-15T15:00:00Z')} filters={DEFAULT_FILTERS}
      renderPlayerTools={player => <PlayerToolButtons player={player} compared={false} full={false} onProfile={noop} onCompare={noop}/>}
      renderTools={({ snapshot: shown, filters }) => <FantasyTools snapshot={shown} filters={filters} profileId="fx-wr" onProfile={noop} onCloseProfile={noop} compareIds={[]} onCompareChange={noop}/>}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('aria-label="Usage &amp; production: Fixture Receiver"');
    expect(html).toContain('aria-label="Add to compare: Fixture Receiver"');
    expect(text(html)).toContain('Compare players');
    expect(html).toContain('role="dialog"');
  });
});
