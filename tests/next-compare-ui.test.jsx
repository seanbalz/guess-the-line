// tests/next-compare-ui.test.jsx
// D-69 step 1 Compare (Sean's P3B) markup. Contracts: no hidden guess, line or points of another player renders before
// its gate (D-31, spec test 12); the head-to-head card shows two faces, who leads, paired bars (You over them) and one
// stats line; the face chips are one pressed choice with Everyone last; nothing moves on the first paint.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ leagueApi: vi.fn(), communityApi: vi.fn(), cloudApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
import { ComparisonContent, lineNotes } from '../web/src/next/play/ScoreComparison.jsx';
import { markupProblems, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const SEA = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const BUF = { id: 'BUF-KC', awayCode: 'BUF', homeCode: 'KC', kickoff: '2026-10-26T00:20:00Z' };
const ref = value => ({ value, source: 'Fixture median', observedAt: '2026-10-20T17:00:00Z' });
const locked = (gameId, guess, line, points) => ({ gameId, guess, points, reference: ref(line), lockedIn: true, lockedAt: '2026-10-20T18:00:00Z', hidden: false });
const entry = (userId, picks) => ({ userId, mode: 'guess_spread', status: 'draft', eligible: true, picks, hiddenGames: [] });
const gate = (sea, buf) => ({ [SEA.id]: { spread: sea, total: false }, [BUF.id]: { spread: buf, total: false } });
const week = (n, entries, g = gate(true, true)) => ({ season: 2026, week: n, games: [SEA, BUF], gate: g, revealed: { guess_spread: false, guess_total: false }, entries });
const members = [{ id: 'luke', displayName: 'Luke Jun' }, { id: 'me', displayName: 'Sean B' }, { id: 'troy', displayName: 'Troy Jun' }];
const week8 = week(8, [entry('me', [locked(SEA.id, -3, -3, 10), locked(BUF.id, 2, 2.5, 9)]), entry('troy', [locked(SEA.id, -2.5, -3, 9), locked(BUF.id, 3.5, 2.5, 8)])]);
// Week 9: you have not locked SEA, yet a faulty reply still carries Troy's SEA values; Troy has not locked BUF.
const week9 = week(9, [entry('me', [locked(BUF.id, 2, 2.5, 9)]), entry('troy', [locked(SEA.id, -17.5, -16.5, 7), { gameId: BUF.id, guess: null, reference: null, points: null, hidden: false }])], gate(false, true));
const data = { viewer: 'me', season: 2026, seasons: [2026, 2025], now: '2026-10-24T12:00:00Z', members, weeks: [week9, week8] };
const render = (view, patch = {}) => renderToStaticMarkup(<div className="gx"><ComparisonContent data={{ ...data, ...patch }} currentWeek={9} scopeName="Community" view={view} onChange={() => {}}/></div>);

// Week 8 also carries a game Week 9 does not, so a matchup picked in Week 8 is not in Week 9's Matchup options.
const NYJ = { id: 'NYJ-MIA', awayCode: 'NYJ', homeCode: 'MIA', kickoff: '2026-10-25T17:00:00Z' };
const wide = { weeks: [week9, { ...week8, games: [SEA, BUF, NYJ] }] };

describe('Compare', () => {
  it('D-31: a game you have not locked renders HIDDEN with no guess, line or points of the other player, even when the reply carries them', () => {
    const html = render({});
    expect(markupProblems(html)).toEqual([]);
    expect(html).not.toMatch(/17\.5|16\.5/);
    const text = readText(html);
    expect(text).toContain('HIDDEN');
    expect(text).toContain('Lock yours to see Troy’s guess');
    expect(text).toContain('You Bills −2 · Troy hasn’t locked in');
    expect(text).toContain('No shared games yet');
  });
  it('the head-to-head card: two faces, who leads, paired bars You over them and one stats line; one face chip is pressed, Everyone last', () => {
    const html = render({ week: 8 });
    expect(markupProblems(html)).toEqual([]);
    const text = readText(html);
    expect(text).toContain('You lead by 2');
    expect(text).toContain('Bullseyes 1–0 · Avg miss 0.3–0.8 · 2 shared games');
    expect(text).toMatch(/You\s*19\s*Troy\s*17/);
    expect(html).toContain('aria-label="You 19, Troy 17 points on 2 shared games"');
    expect(text).toContain('YOU +1');
    const chips = [...walk(parseMarkup(html))].filter(n => n.tag === 'button' && (n.attrs.class ?? '').split(/\s+/).includes('gx-cmp-face'));
    expect(chips.map(n => [nameFrom(n).trim(), n.attrs['aria-pressed']])).toEqual([['Luke Jun', 'false'], ['Troy Jun', 'true'], ['Everyone', 'false']]);
  });
  it('a member who has not locked reads WAITING; Everyone keeps the D-53 benchmark with each game’s player count', () => {
    const luke = readText(render({ item: 'luke', week: 8 }));
    expect(luke).toContain('WAITING');
    expect(luke).toContain('You Broncos −3 · Luke hasn’t locked in');
    const everyone = readText(render({ item: 'everyone', week: 8 }));
    expect(everyone).toContain('You lead by 1');
    expect(everyone).toContain('Avg miss 0.3–0.5 · 2 shared games');
    expect(everyone).toContain('You Broncos −3 · 2 players avg 9.5');
  });
  it('after a week change no matchup filter stays applied that the Matchup select cannot show', () => {
    const stale = render({ week: 9, matchup: NYJ.id }, wide);
    expect(readText(stale)).not.toContain('No games match these filters.');
    expect(readText(stale)).toContain('Lock yours to see Troy’s guess');
    expect(stale).not.toContain('value="NYJ-MIA"');
    const kept = render({ week: 8, matchup: NYJ.id }, wide);
    expect(kept).toContain('<option value="NYJ-MIA" selected');
    expect(readText(kept)).toContain('New York Jets at Miami Dolphins');
    expect(readText(kept)).not.toContain('Seattle Seahawks');
  });
  it('a stale or foreign item opens on the default opponent, not an empty card', () => {
    for (const item of ['ghost', 'me', 'someone-removed']) {
      const html = render({ week: 8, item });
      const chips = [...walk(parseMarkup(html))].filter(n => n.tag === 'button' && (n.attrs.class ?? '').split(/\s+/).includes('gx-cmp-face'));
      expect(chips.map(n => n.attrs['aria-pressed'])).toEqual(['false', 'true', 'false']);
      expect(readText(html)).toContain('You lead by 2');
    }
  });
  it('a pending reference lists no line in the info dialog, only that it is waiting', () => {
    const text = value => String(value);
    const notes = lineNotes([['You', { reference: { value: null, status: 'pending' } }], ['Troy', { reference: ref(-3) }]], text);
    expect(notes[0]).toBe('You · waiting for a line');
    expect(notes[1]).toMatch(/^Troy · line -3 · Fixture median · /);
    expect(notes.join(' ')).not.toMatch(/line —|Source unavailable/);
  });
  it('nothing moves on the first paint: no bar carries the grow attribute', () => {
    expect(render({ week: 8 })).not.toContain('data-grow');
  });
  it('empty states are one sentence and at most one action', () => {
    expect(readText(render({}, { members: [members[1]] }))).toBe('No one else to compare with yet.');
    expect(readText(render({ week: 8, team: 'NYJ' }))).toContain('No games match these filters.');
  });
});
