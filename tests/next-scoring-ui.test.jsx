import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
import { WeeklyScoreContent } from '../web/src/next/play/WeeklyScore.jsx';
import { ScoreReceipt, receiptDetails } from '../web/src/next/play/ScoreReceipt.jsx';
import { markupProblems } from './helpers/ui-markup.mjs';

const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-18T20:00:00Z' };
const entry = { userId: 'owner', mode: 'guess_spread', status: 'draft', eligible: true, scoreTiming: 'immediate', weekPoints: 8, weekScored: 1, standingsPoints: 0, awaitingKickoffPoints: 8, picks: [{ gameId: game.id, guess: -3, lockedIn: true, lockedAt: '2026-10-15T18:00:00Z', points: 8, reference: { value: -5, source: 'Synthetic three-book median', observedAt: '2026-10-15T17:59:00Z' } }] };
const data = { viewer: 'owner', season: 2026, seasons: [2026, 2025], weeks: [{ season: 2026, week: 6, games: [game], entries: [entry] }] };
const render = (view = {}) => renderToStaticMarkup(<div className="gx"><WeeklyScoreContent data={data} view={view} onChange={() => {}} onRefresh={() => {}} onPicks={() => {}}/></div>);
describe('weekly personal scoring', () => {
  it('labels immediate own points separately from started-game standings with source and lock evidence', () => {
    const html = render({ scoreGame: game.id });
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('Your weekly points'); expect(html).toContain('Standings · games started');
    expect(html).toContain('8 personal points waiting for kickoff'); expect(html).toContain('Synthetic three-book median');
    expect(html).toContain('Missed by 2 points'); expect(html).toContain('Your eligible locked guesses count immediately.');
  });
  it('AND filters have an explicit empty state and a subset label, never an invented rank', () => {
    const html = render({ team: 'HOU', matchup: game.id });
    expect(html).toContain('Selected games'); expect(html).toContain('No games match both filters');
    expect(html).not.toContain('8 personal points waiting'); expect(html).not.toContain('rank 1');
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
  it('D-62: the locked-in card leads with the points, one sentence and your guess beside the saved line; the rest sits behind ⓘ', () => {
    const row = { lockedIn: true, eligible: true, points: 8, reference: { value: -2, source: 'Synthetic three-book median', observedAt: '2026-10-27T19:29:00Z', rule: 'first_line_after_submission' } };
    const props = { game: { id: 'PHI-JAX', awayCode: 'PHI', homeCode: 'JAX' }, mode: 'guess_spread', row, guess: -3, lockedAt: '2026-10-27T19:30:00Z' };
    const html = renderToStaticMarkup(<div className="gx"><ScoreReceipt {...props} onScore={() => {}}/></div>);
    expect(markupProblems(html)).toEqual([]);
    const words = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Picture first: the score, the one sentence, then "You JAX −3" beside "Line JAX −2", and the weekly-score link.
    expect(words).toBe('8 / 10 points Missed by 1 You JAX −3 Line JAX −2 View weekly score');
    expect(html.indexOf('gx-n-l')).toBeLessThan(html.indexOf('Missed by 1'));
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
  it('weekly expanded rows keep recorded lateness and a missing-reference reason', () => {
    const lateEntry = { ...entry, weekPoints: null, picks: [{ ...entry.picks[0], points: null, late: { minutes: 0 }, reference: { value: null, status: 'pending', reason: 'First qualifying quote has not arrived' } }] };
    const html = renderToStaticMarkup(<WeeklyScoreContent data={{ ...data, weeks: [{ ...data.weeks[0], entries: [lateEntry] }] }} view={{ scoreGame: game.id }} onChange={() => {}}/>);
    expect(html).toContain('Late · 0 min'); expect(html).toContain('First qualifying quote has not arrived');
  });
});
