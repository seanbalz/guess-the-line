import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
// The layer's Play lip opens the landing through the shell (PlayLayer.jsx).
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ state: { views: { play: {} } }, go: vi.fn(), setView: vi.fn() }) }));
import { ScoreFilters, WeeklyScoreContent, gameDetails } from '../web/src/next/play/WeeklyScore.jsx';
import { ScoreReceipt, receiptDetails } from '../web/src/next/play/ScoreReceipt.jsx';
import { ComparisonContent } from '../web/src/next/play/ScoreComparison.jsx';
import { scoreRows } from '../web/src/next/play/scoring.js';
import { markupProblems, matchups, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { teamMarks } from '../web/src/teamLogoRegistry.js';

const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-18T20:00:00Z' };
const entry = { userId: 'owner', mode: 'guess_spread', status: 'draft', eligible: true, scoreTiming: 'immediate', weekPoints: 8, weekScored: 1, standingsPoints: 0, awaitingKickoffPoints: 8, picks: [{ gameId: game.id, guess: -3, lockedIn: true, lockedAt: '2026-10-15T18:00:00Z', points: 8, reference: { value: -5, source: 'Synthetic three-book median', observedAt: '2026-10-15T17:59:00Z' } }] };
const data = { viewer: 'owner', season: 2026, seasons: [2026, 2025], now: '2026-10-19T00:00:00Z', weeks: [{ season: 2026, week: 6, games: [game], entries: [entry] }] };
const render = (view = {}, props = {}) => renderToStaticMarkup(<div className="gx"><WeeklyScoreContent data={data} view={view} onChange={() => {}} onRefresh={() => {}} onPicks={() => {}} {...props}/></div>);
const words = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('Your score (D-69, mockup Q1-B)', () => {
  it('shows your own points as the hero, the saved line and the miss on the row, and keeps the standings behind ⓘ', () => {
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const text = words(html);
    expect(html).toContain('aria-label="Personal score summary"');
    expect(text).toContain('Week 6 · Spread Accuracy points');
    expect(html).toContain('aria-label="8 of 10 possible points"');
    expect(text).toContain('Saved scoring line DEN −5 Your guess DEN −3 Off by 2 Oct 18');
    expect(text).toContain('1 scored game 0 exact guesses');
    expect(text).toContain('8 / 10');
    expect(text).toContain('Week 6 · all games scored'); // the layer's one meta line
    // D-38: the standings and the counts sit behind "About your scores" (scoreFinePrint, tested in next-your-score).
    expect(html).toContain('aria-label="About your scores"');
    expect(html).not.toContain('Standings · games started');
    expect(text).toContain('Refresh scores'); expect(text).toContain('View this week’s picks'); expect(text).toContain('Compare players');
  });
  it('the accuracy ring names its actual score and denominator; the game layer separates the number and points', () => {
    const hero = render();
    expect(hero).toContain('role="img" aria-label="8 of 10 possible points"');
    expect(hero).toContain('stroke-dasharray="80 100"');
    const layer = render({ scoreGame: game.id });
    expect(layer).toMatch(/>8<\/span>\s+<span class="gx-t-body gx-c-2">\/ 10 points<\/span>/);
  });
  it('an unplayed week is never final: before the last kickoff, or with no clock, the list shows progress and not "all games scored"', () => {
    for (const now of ['2026-10-18T19:00:00Z', undefined]) {
      const text = words(render({}, { data: { ...data, now } }));
      expect(text).toContain('Week 6 \u00b7 1 of 1 scored');
      expect(text).not.toContain('all games scored');
    }
  });
  it('AND filters say "Selected games", have an explicit empty state and never draw a rank', () => {
    const rank = { rank: 1, label: '1st', move: 2, said: 'season rank 1st, up 2' };
    const html = render({ team: 'HOU', matchup: game.id }, { rank });
    expect(html).toContain('Selected games'); expect(html).toContain('No games match both filters. Clear filters to see this week.');
    expect(html).not.toContain('gx-ys-rank'); expect(html).not.toContain('1st');
  });
  it('the season rank chip says the move with a symbol and in words beside the total', () => {
    const html = render({}, { rank: { rank: 3, label: '3rd', move: 2, said: 'season rank 3rd, up 2' } });
    expect(words(html)).toContain('Season 3rd ▲2 up 2');
  });
  it('P2B: a game opens its own layer with the points, the miss and the number line, and only your guess and saved line', () => {
    const other = { userId: 'friend', mode: 'guess_spread', status: 'submitted', eligible: true, picks: [{ gameId: game.id, guess: -9, lockedIn: true, points: 4, reference: { value: -11, source: 'Other source' } }] };
    const html = render({ scoreGame: game.id }, { data: { ...data, weeks: [{ ...data.weeks[0], entries: [entry, other] }] } });
    expect(markupProblems(html)).toEqual([]);
    const text = words(html);
    expect(text).toContain('Back to Play'); expect(text).toContain('Back to Your score');
    expect(text).toContain('Week 6 · Guess the Spread'); expect(text).toContain('8 / 10 points'); expect(text).toContain('Off by 2');
    expect(html).toContain('role="img" aria-label="Line DEN −5, you DEN −3, off by 2"');
    expect(text).toContain('DEN wins by'); expect(text).toContain('Each half point off costs 1 point.'); expect(text).toContain('Kickoff Sun Oct 18, 1:00 PM PT');
    expect(html).toContain('aria-label="About this score"');
    expect(html).not.toContain('Personal score summary');
    for (const leak of ['−9', '−11', 'Other source']) expect(html).not.toContain(leak);
  });
  it('a game not scored yet says so in one sentence and keeps its Late marker; the reason stays one tap away', () => {
    const lateEntry = { ...entry, weekPoints: null, picks: [{ ...entry.picks[0], points: null, late: { minutes: 0 }, reference: { value: null, status: 'pending', reason: 'First qualifying quote has not arrived' } }] };
    const week = { ...data.weeks[0], entries: [lateEntry] };
    const html = render({ scoreGame: game.id }, { data: { ...data, weeks: [week] } });
    expect(html).toContain('Late · 0 min'); expect(html).toContain('Waiting for a scoring line.'); expect(words(html)).toContain('You · DEN −3');
    expect(html).not.toContain('/ 10 points'); expect(html).not.toContain('gx-ys-axis');
    expect(gameDetails({ row: scoreRows(week, lateEntry)[0], mode: 'guess_spread', entry: lateEntry })).toContain('First qualifying quote has not arrived');
  });
  it('a read on its way draws placeholders in the layer; a failure says why with Try again; a kept copy stays under one status line', () => {
    expect(render({}, { data: null, loading: true })).toContain('Loading your score…');
    const failed = words(render({}, { data: null, error: { status: 500, message: 'Server down' }, onRetry: () => {} }));
    expect(failed).toContain('Your score could not be loaded. Server down'); expect(failed).toContain('Try again');
    const stale = words(render({}, { error: { status: 500, message: 'Server down' }, stale: true, onRetry: () => {} }));
    expect(stale).toContain('Your score could not refresh. Showing the last loaded copy.'); expect(stale).toContain('8 / 10');
  });
  it('receipt keeps pending distinct from a legitimate zero and never uses a current quote', () => {
    const pendingRow = { lockedIn: true, points: null, late: { minutes: 12 }, reference: { value: null, status: 'pending', reason: 'No qualifying saved quote' } };
    const pending = renderToStaticMarkup(<ScoreReceipt game={game} mode="guess_total" guess={44} lockedAt="2026-10-15T18:00:00Z" row={pendingRow}/>);
    expect(pending).toContain('Waiting for scoring line'); expect(pending).not.toContain('0 / 10');
    // The Late state stays on the card; the reason is one tap away behind "About this score" (D-62 rule 4, D-23).
    expect(pending).toContain('Late · 12 min'); expect(pending).toContain('aria-label="About this score"');
    expect(receiptDetails({ game, mode: 'guess_total', row: pendingRow, guess: 44, lockedAt: '2026-10-15T18:00:00Z' })).toContain('No qualifying saved quote');
    const zero = renderToStaticMarkup(<ScoreReceipt game={game} mode="guess_total" guess={44} lockedAt="2026-10-15T18:00:00Z" row={{ lockedIn: true, points: 0, reference: { value: 60, source: 'Fixture' } }}/>);
    expect(zero).toContain('0 / 10'); expect(zero).toContain('Missed by 16');
  });
  it('approved pick-focused receipt shows the saved guess, authoritative points, team context and shared comparison; provenance stays behind ⓘ', () => {
    const row = { lockedIn: true, eligible: true, points: 8, reference: { value: -2, source: 'Synthetic three-book median', observedAt: '2026-10-27T19:29:00Z', rule: 'first_line_after_submission' } };
    const props = { game: { id: 'PHI-JAX', awayCode: 'PHI', homeCode: 'JAX' }, mode: 'guess_spread', row, guess: -3, lockedAt: '2026-10-27T19:30:00Z' };
    const html = renderToStaticMarkup(<div className="gx"><ScoreReceipt {...props} onScore={() => {}}/></div>);
    expect(markupProblems(html)).toEqual([]);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Full scorecard keeps saved values and the scorer's points, with two separate team circles.
    for (const value of ['Guess the Spread', '8 / 10', 'POINTS', 'Philadelphia Eagles', 'Jaguars', 'Jacksonville', 'Saved scoring line', 'Point difference', 'Missed by 1', 'View weekly score']) expect(text).toContain(value);
    expect(html).toContain('aria-label="8 of 10 points"');
    expect(html).toContain('Saved line −2, saved guess −3, difference 1 points on a scale');
    expect(html.match(/class="gx-team gx-team--/g)).toHaveLength(2);
    expect(html.indexOf('gx-pick-scorecard')).toBeLessThan(html.indexOf('Missed by 1'));
    expect(html).toContain('aria-label="About this score"');
    // Nothing is removed: the lock-in time, the guess and line in words, the source with its observed time and the rule.
    expect(receiptDetails(props)).toEqual([
      'Locked in Tue Oct 27, 12:30 PM PT · Jaguars −3.',
      'Saved line · Jaguars −2.',
      'Synthetic three-book median · Observed Tue Oct 27, 12:29 PM PT.',
      'First qualifying line after lock-in. Later movement does not replace it.',
    ]);
    const exact = renderToStaticMarkup(<ScoreReceipt {...props} guess={-2} row={{ ...row, points: 10 }}/>);
    expect(exact).toContain('Right on the line'); expect(exact).not.toContain('Missed by');
    const ineligible = renderToStaticMarkup(<ScoreReceipt {...props} row={{ ...row, eligible: false }}/>);
    expect(ineligible).toContain('Not eligible for scoring.'); expect(ineligible).not.toContain('8 / 10');
  });
});

describe('matchups as marks (D-62)', () => {
  const SEA_DEN = { srcs: [teamMarks.SEA.src, teamMarks.DEN.src], name: 'Seattle Seahawks at Denver Broncos' };
  it('each Your score row leads with the matchup, away first; the game layer\'s heading is the matchup; the Matchup filter keeps its text options', () => {
    const html = render();
    expect(matchups(html)).toEqual([SEA_DEN]);
    const row = [...walk(parseMarkup(html))].find(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-ys-row'));
    expect(nameFrom(row)).toContain('Seattle Seahawks at Denver Broncos');
    const layer = render({ scoreGame: game.id });
    const heading = [...walk(parseMarkup(layer))].find(n => n.tag === 'h2');
    expect(nameFrom(heading)).toBe('Seattle Seahawks at Denver Broncos');
    const filters = renderToStaticMarkup(<div className="gx"><ScoreFilters week={data.weeks[0]} filters={{ team: '', matchup: '' }} onChange={() => {}}/></div>);
    expect(filters).toContain('<option value="SEA-DEN">SEA at DEN</option>');
  });
  it('each comparison row leads with its matchup as marks, away first', () => {
    const pick = { gameId: game.id, guess: -3, lockedIn: true, points: 8, reference: { value: -5, source: 'Fixture', observedAt: '2026-10-15T17:59:00Z' } };
    const other = { ...pick, guess: -6, points: 9 };
    const history = { viewer: 'owner', season: 2026, seasons: [2026], members: [{ id: 'owner', displayName: 'You' }, { id: 'friend', displayName: 'Friend' }],
      weeks: [{ season: 2026, week: 6, revealed: { guess_spread: true }, games: [game], entries: [{ userId: 'owner', mode: 'guess_spread', status: 'submitted', picks: [pick] }, { userId: 'friend', mode: 'guess_spread', status: 'submitted', picks: [other] }] }] };
    const html = renderToStaticMarkup(<div className="gx"><ComparisonContent data={history} currentWeek={6} scopeName="Community" view={{}} onChange={() => {}}/></div>);
    expect(markupProblems(html)).toEqual([]);
    const row = [...walk(parseMarkup(html))].find(n => n.tag === 'li' && (n.attrs.class ?? '').split(/\s+/).includes('gx-cmp-row'));
    expect(matchups(row)).toEqual([SEA_DEN]);
  });
});
