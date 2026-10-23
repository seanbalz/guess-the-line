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

// Fictional, fully specified players are render fixtures only; the production component imports no fixtures.
const zero = { passingYards: 0, passingTds: 0, interceptions: 0, rushingYards: 0, rushingTds: 0, receptions: 0, receivingYards: 0, receivingTds: 0, fumblesLost: 0, twoPointConversions: 0, specialTeamsTds: 0, targets: 0, carries: 0, passingAttempts: 0 };
const stats = { ...zero, receptions: 6, receivingYards: 80, receivingTds: 0.5 };
const player = (id = 'fictional-wr') => ({
  id, name: `Test Receiver ${id}`, team: 'SEA', position: 'WR', sampleGames: 5, status: 'Questionable · Active roster',
  weekly: { stats, opponent: 'at SF', kickoff: '2026-10-18T20:25:00Z', status: 'scheduled' },
  restOfSeason: { stats: Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, value * 10])), games: 10 },
  history: [1, 2, 3, 4, 5].map(week => ({ ...stats, week, targets: week < 4 ? 4 : 9 })),
});
const snapshot = {
  schemaVersion: 1, season: 2026, week: 6, statsThroughWeek: 5, asOf: '2026-10-14T12:00:00Z', generatedAt: '2026-10-15T12:00:00Z',
  method: { name: 'Fixture pace', version: '1', description: 'A test fixture for the recent-pace view.' },
  sources: [{ name: 'Fixture source', url: 'https://example.com/stats', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0/', sha256: 'a'.repeat(64), updatedAt: '2026-10-14T12:00:00Z', retrievedAt: '2026-10-15T12:00:00Z' }],
  players: [player()],
};
const now = Date.parse('2026-10-15T15:00:00Z');
const render = (props = {}) => renderToStaticMarkup(<FantasyRankingsView theme="next" state={{ status: 'ready', snapshot }} now={now} onBack={() => {}} {...props}/>);
const text = html => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

describe('fantasy rankings view', () => {
  it('uses only gx markup and accessible controls in the new shell', () => {
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    for (const label of ['Ranking period', 'Season', 'Week', 'Scoring', 'Passing touchdowns', 'Position', 'Team', 'Find a player', 'Strong trends only', 'Reset filters']) expect(html).toContain(label);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('role="switch"');
  });
  it('shows point estimates, position and overall rank, source time, availability, trend amounts and sample sizes', () => {
    const html = render();
    const out = text(html);
    for (const value of ['GTL estimates', 'not expert consensus', 'Test Receiver fictional-wr', 'WR 1', 'Overall 1', '17.0', 'Questionable', 'Targets rising', 'Recent: 9.0 / game (2 games)', 'Earlier: 4.0 / game (3 games)', 'Stats through Week 5', '4-point passing TDs']) expect(out).toContain(value);
    expect(html).toContain('href="https://creativecommons.org/licenses/by/4.0/"');
    expect(html).toContain('<details>');
    expect(html).toContain('aria-label="Overall rank 1"');
  });
  it('displays half-tenth estimates using the same rounding as ranks', () => {
    const rounded = player();
    rounded.weekly.stats = { ...zero, receivingYards: 73.5 };
    const out = text(render({ state: { status: 'ready', snapshot: { ...snapshot, players: [rounded] } } }));
    expect(out).toContain('7.4');
    expect(out).not.toContain('7.3');
  });
  it('shows remaining total and per-game pace under rest of season and selected scoring', () => {
    const out = text(render({ filters: { ...DEFAULT_FILTERS, scope: 'ros', scoring: 'standard', position: 'WR' } }));
    expect(out).toContain('110.0');
    expect(out).toContain('11.0 / game · 10 scheduled games');
    expect(out).toContain('Rest of season from this week');
    expect(out).toContain('healthy and available for every remaining scheduled game');
  });
  it('treats D/ST unavailable and zero search matches as distinct states', () => {
    expect(text(render({ filters: { ...DEFAULT_FILTERS, position: 'DST' } }))).toContain('Defense and special teams rankings are unavailable');
    const out = text(render({ filters: { ...DEFAULT_FILTERS, search: 'does not exist' } }));
    expect(out).toContain('No players match these filters.');
    expect(out).not.toContain('Test Receiver');
  });
  it('retains distinct loading, missing, error, invalid and stale states', () => {
    expect(text(render({ state: { status: 'loading' } }))).toContain('Loading Week 6 rankings');
    expect(text(render({ state: { status: 'missing' } }))).toContain('No fantasy snapshot is available for 2026 Week 6.');
    const failed = render({ state: { status: 'error' } });
    expect(failed).toContain('role="alert"');
    expect(text(failed)).toContain('Try again');
    expect(text(render({ state: { status: 'ready', snapshot: { ...snapshot, schemaVersion: 9 } } }))).toContain('Rankings data could not be verified.');
    const stale = text(render({ now: now + 10 * 86400000 }));
    expect(stale).toContain('Stale snapshot');
    expect(stale).toContain('Test Receiver');
  });
  it('limits a large result list and offers more without discarding the result count', () => {
    const players = Array.from({ length: 65 }, (_, index) => player(`fixture-${index}`));
    const html = render({ state: { status: 'ready', snapshot: { ...snapshot, players } } });
    expect((html.match(/class="gx-fantasy-player-item"/g) || []).length).toBe(50);
    expect(text(html)).toContain('65 players');
    expect(text(html)).toContain('Show more players (15 left)');
  });
  it('renders the same content in classic styling with a nested heading', () => {
    const html = render({ theme: 'classic', headingLevel: 2 });
    expect(html).toContain('<h2>Fantasy Football</h2>');
    expect(html).toContain('<h3>Player rankings</h3>');
    expect(html).not.toContain('class="gx-');
    expect(text(html)).toContain('Test Receiver');
  });
  it('shows the hosted update line, a context pill with the visible implied total, and detail context', () => {
    const wr = player('ctx');
    wr.weekly = { ...wr.weekly, opponent: '@ SF', kickoff: '2026-10-18T20:25:00Z' };
    const v2 = { ...snapshot, schemaVersion: 2, rosterFallbackTeams: [], matchups: {}, players: [wr] };
    const lines = { status: 'ready', games: new Map([['SEA-SF', { spread: { visible: true, value: -3, capturedAt: '2026-10-18T13:15:00Z', bookCount: 3 }, total: { visible: true, value: 47, capturedAt: '2026-10-18T13:15:00Z', bookCount: 3 } }]]) };
    const out = text(render({ state: { status: 'ready', origin: 'hosted', fallback: false, snapshot: v2 }, gameContext: { lines, wind: null } }));
    expect(out).toContain('Updated');
    expect(out).toContain('@ SF · Sun late · 22.0');
    expect(out).toContain('Implied team total 22.0');
  });
  it('shows the lock line, never a number, when either market is hidden', () => {
    const wr = player('lock');
    wr.weekly = { ...wr.weekly, opponent: '@ SF', kickoff: '2026-10-18T20:25:00Z' };
    const lines = { status: 'ready', games: new Map([['SEA-SF', { spread: { visible: true, value: -3 }, total: { visible: false } }]]) };
    const html = render({ state: { status: 'ready', snapshot: { ...snapshot, players: [wr] } }, gameContext: { lines, wind: null } });
    expect(markupProblems(html)).toEqual([]);
    const out = text(html);
    expect(out).toContain('Lock your SEA–SF total guess to see the implied team total.');
    expect(out).not.toContain('Implied team total 2');
  });
  it('says when the saved copy is shown', () => {
    expect(text(render({ state: { status: 'ready', origin: 'saved', fallback: true, snapshot } }))).toContain('Showing saved Week 6 · live refresh unavailable');
  });
  it('renders the accuracy card with PROVISIONAL, the baseline and no zero for missing stats', () => {
    const review = { schemaVersion: 1, season: 2026, week: 5, generatedAt: '2026-10-14T11:00:00Z', status: 'PROVISIONAL',
      estimate: { file: 'f', sha256: 'a'.repeat(64), generatedAt: '2026-10-07T12:00:00Z', publishedBeforeFreeze: true },
      actuals: { url: 'https://example.com' }, playedWithoutEstimate: 2,
      players: [
        { id: 'a', name: 'Alpha', team: 'SEA', position: 'WR', estimate: { ...zero, receptions: 5, receivingYards: 70 }, actual: { ...zero, receptions: 7, receivingYards: 100 }, baseline: { ...zero, receptions: 4, receivingYards: 50 } },
        { id: 'b', name: 'Bravo', team: 'SF', position: 'WR', estimate: { ...zero, receptions: 3, receivingYards: 30 }, actual: null, baseline: null },
      ] };
    const html = render({ state: { status: 'ready', origin: 'hosted', snapshot, review } });
    expect(markupProblems(html)).toEqual([]);
    const out = text(html);
    for (const value of ['Week 5 estimates', 'PROVISIONAL', 'Off by 5.0 points per player', 'Season average: 8.0', 'Within 5 points', '100%', 'Listed available, no stats row: 1', 'Played without an estimate: 2']) expect(out).toContain(value);
  });
});
