// D-82 Player Props in the new app: dark by default, entry-only market hiding, the locked pick and draft recovery, and
// per-stat native-unit accuracy with a separate paper record (approved sheets 01-06). Static renders with fixture
// identities and the approved boards' illustrative values only; no bookmaker quote or account record is used.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, readText } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ propsApi: vi.fn(), linesApi: vi.fn(), cloudApi: vi.fn(), communityApi: vi.fn() }));
const { PLAYER_PROPS_FLAG, PROPS_MARKET, playerPropsEnabled, withPlayerProps } = await import('../web/src/next/props/flag.js');
const { playMarkets, PropsNest } = await import('../web/src/next/play/PicksNest.jsx');
const { SCORE_MARKETS } = await import('../web/src/next/play/scoring.js');
const { PropsEntryScreen, athletesOf, filterAthletes } = await import('../web/src/next/props/PlayerPropsEntry.jsx');
const { PropRecordScreen, propWeeks } = await import('../web/src/next/props/PropRecord.jsx');

const EVENT = '2026_10_DAL_PHI', WR = '00-0036358', RB = '00-0037000';
const offer = (playerId, stat, extra = {}) => ({ eventId: EVENT, playerId, stat, playerName: playerId === WR ? 'Fixture Receiver' : 'Fixture Back', team: 'DAL',
  position: playerId === WR ? 'WR' : 'RB', away: 'DAL', home: 'PHI', kickoff: '2026-11-15T21:25:00Z', closed: false, ...extra });
const OFFERS = [offer(WR, 'player_reception_yds'), offer(WR, 'player_receptions'), offer(RB, 'player_rush_yds'), offer(RB, 'player_reception_yds')];
const STATE = { filter: { position: 'all', query: '' }, pick: null, value: null, typed: null, editing: false, phase: 'entry', busy: false, notice: '' };
const ON = Object.fromEntries(['retry', 'filter', 'pick', 'another', 'value', 'edit', 'type', 'lock', 'keepEditing'].map(k => [k, () => {}]));
const render = node => {
  const html = renderToStaticMarkup(<div className="gx">{node}</div>);
  expect(markupProblems(html)).toEqual([]);
  return { html, text: readText(html) };
};
const entry = (data, state = {}) => render(<PropsEntryScreen read={{ status: 'ready', data: { available: true, offers: OFFERS, own: [], ...data } }} state={{ ...STATE, ...state }} on={ON}/>);
const REFERENCE = { line: 66.5, books: ['betmgm', 'draftkings', 'fanduel'].map(book => ({ book, line: 66.5, observedAt: '2026-11-12T19:55:00Z' })), observedTo: '2026-11-12T19:55:00Z' };

describe('flag off (default build): Player Props is hidden everywhere', () => {
  it('the build flag is off unless it is exactly "on"', () => {
    expect(playerPropsEnabled()).toBe(false);
    for (const value of [undefined, '', 'true', '1', 'yes', 'off']) expect(playerPropsEnabled({ [PLAYER_PROPS_FLAG]: value })).toBe(false);
    expect(playerPropsEnabled({ [PLAYER_PROPS_FLAG]: ' ON ' })).toBe(true);
  });
  it('Your guesses keeps exactly Spread and Total, and the props panel renders nothing', () => {
    expect(playMarkets(SCORE_MARKETS)).toBe(SCORE_MARKETS);
    expect(playMarkets(SCORE_MARKETS).map(o => o.label)).toEqual(['Spread', 'Total']);
    expect(renderToStaticMarkup(<PropsNest season={2026} week={10}/>)).toBe('');
    expect(withPlayerProps(SCORE_MARKETS, PROPS_MARKET, true).map(o => o.label)).toEqual(['Spread', 'Total', 'Player Props']);
  });
  it('the Bets market control and Gap record only offer Player Props behind the flag', async () => {
    const fs = await import('node:fs');
    // D-69 step 4: Bets › Your gap (gap/YourGap.jsx) draws the market control Bets.jsx drew on main.
    const bets = fs.readFileSync('web/src/next/bets/gap/YourGap.jsx', 'utf8'), gap = fs.readFileSync('web/src/next/bets/GapRecord.jsx', 'utf8');
    expect(bets).toMatch(/propsSelected = propsOn && route\.recommendedMarket === PROPS_GAP_MARKET/);
    expect(bets).toMatch(/withPlayerProps\(MARKETS, PROPS_GAP_MARKET, propsOn\)/);
    expect(gap).toMatch(/props\.market === PROPS_GAP_MARKET && \(props\.propsEnabled \?\? playerPropsEnabled\(\)\)/);
    // No static import pulls the prop screens into a dark build: both are lazy chunks.
    for (const source of [bets, gap, fs.readFileSync('web/src/next/bets/Bets.jsx', 'utf8'), fs.readFileSync('web/src/next/play/PicksNest.jsx', 'utf8')]) expect(source).not.toMatch(/^import .*props\/(PlayerPropsEntry|PropRecord)/m);
  });
});

describe('entry (sheet 01): hidden market, position/search, athlete and stat, half-point guess, per-prop lock', () => {
  it('discovery filters never remove a valid cross-position stat', () => {
    const athletes = athletesOf(OFFERS);
    expect(athletes.map(a => a.stats)).toEqual([['player_reception_yds', 'player_receptions'], ['player_rush_yds', 'player_reception_yds']]);
    expect(filterAthletes(athletes, { position: 'RB' })[0].stats).toContain('player_reception_yds');
    expect(filterAthletes(athletes, { query: 'receiver' }).map(a => a.playerId)).toEqual([WR]);
  });
  it('lists athletes and position chips before a pick', () => {
    const { text } = entry({});
    for (const word of ['All', 'QB', 'RB', 'WR', 'TE', 'Find an athlete', 'Fixture Receiver', 'Fixture Back']) expect(text).toContain(word);
  });
  it('shows only your guess: the market number never renders on the entry screen, even if a reply carried one', () => {
    const leaky = OFFERS.map(o => ({ ...o, line: 66.5, reference: { line: 66.5 } }));
    const { text } = entry({ offers: leaky, own: [{ ...OFFERS[0], guess: 72.5, status: 'draft', reference: null }] },
      { pick: { eventId: EVENT, playerId: WR, stat: 'player_reception_yds' }, value: 72.5 });
    for (const words of ['Guess the sportsbook line', 'Market hidden on this screen', '72.5', 'Your guess · yards', 'Edit number',
      'Buttons change the guess by 0.5', 'Lock in receiving yards', 'Final once locked in · other props stay optional', 'Receiving yards · draft']) expect(text).toContain(words);
    expect(text).not.toContain('66.5');
  });
  it('the direct editor refuses a negative count and accepts signed yards', () => {
    const count = entry({}, { pick: { eventId: EVENT, playerId: WR, stat: 'player_receptions' }, value: 4.5, typed: -1, editing: true });
    expect(count.text).toContain('Receptions cannot be negative.');
    expect(count.html).toMatch(/<button[^>]*disabled=""[^>]*>.*Lock in receptions/s);
    const yards = entry({}, { pick: { eventId: EVENT, playerId: RB, stat: 'player_rush_yds' }, value: -2.5 });
    expect(yards.text).toContain('−2.5');
    expect(yards.text).not.toContain('cannot be negative');
  });
  it('a closed game keeps the draft and offers no lock', () => {
    const { text, html } = entry({ offers: OFFERS.map(o => ({ ...o, closed: true })) }, { pick: { eventId: EVENT, playerId: WR, stat: 'player_reception_yds' }, value: 70 });
    expect(text).toContain('Closed at kickoff · your saved draft is kept');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*Lock in receiving yards/s);
  });
});

describe('locked pick (sheet 02), draft recovery (sheet 05) and unavailable (sheet 06)', () => {
  it('a locked prop shows its final guess with the saved receipt and latest market kept separate', () => {
    const own = [{ ...OFFERS[0], guess: 72.5, status: 'locked', lockedAt: '2026-11-12T20:00:00Z', reference: REFERENCE, latest: { line: 68.5, observedAt: '2026-11-13T19:00:00Z' } }];
    const { text } = entry({ own }, { pick: { eventId: EVENT, playerId: WR, stat: 'player_reception_yds' } });
    for (const words of ['Locked in', 'Receiving yards · your final guess', '72.5', 'This guess and its scoring reference stay fixed.', 'Your saved reference',
      'Open saved receipt', 'Latest market', 'Separate from your saved reference', 'They do not change your accuracy.', 'View latest recorded line', 'Choose another prop']) expect(text).toContain(words);
  });
  it('a failed lock-in keeps an editable draft and offers retry, never a score or reveal', () => {
    const { text } = entry({}, { pick: { eventId: EVENT, playerId: WR, stat: 'player_reception_yds' }, value: 72.5, phase: 'recovery' });
    for (const words of ['Receiving yards · saved draft', 'Editable draft', 'We couldn’t verify the market reference', 'Your guess was not locked in.',
      'Try lock-in again', 'Keep editing draft', 'A failed save changes nothing', 'No score, no reveal and no lost guess.', 'Back to Player Props']) expect(text).toContain(words);
  });
  it('no verified props (dark server, unapplied schema or none offered) is a clear state, not an empty number', () => {
    for (const data of [{ available: false }, { available: true, offers: [], own: [] }]) {
      const { text } = render(<PropsEntryScreen read={{ status: 'ready', data }} state={STATE} on={ON}/>);
      expect(text).toContain('No verified props available yet');
      expect(text).toContain('Other Guess modes remain available.');
    }
  });
});

describe('accuracy (sheet 03) and paper record (sheet 04)', () => {
  const row = (stat, guess, line, closingLine, result, playerId = WR) => ({ eventId: EVENT, playerId, playerName: 'Fixture Receiver', stat, guess, status: 'locked',
    reference: { line }, closingLine, result });
  const final = actual => ({ status: 'final', participated: true, actual });
  const ROWS = [
    ...[[72.5, 66.5], [60, 65], [80.5, 78.5], [45.5, 48.5], [90, 86]].map(([g, l]) => row('player_reception_yds', g, l, l, final(g > l ? 100 : 0))),
    ...[[5.5, 4.5], [4, 4.5], [6, 5.5], [3.5, 3.5], [7.5, 6.5]].map(([g, l]) => row('player_receptions', g, l, l, null)),
  ];
  const STATE = { period: 'season', range: null, filters: { playerId: 'all', stat: 'all' }, tier: 'all', view: 'accuracy' };
  const ON = Object.fromEntries(['period', 'range', 'filters', 'tier', 'view', 'retry'].map(k => [k, () => {}]));
  const record = (read, state = {}) => render(<PropRecordScreen read={read} state={{ ...STATE, ...state }} on={ON} weeks={propWeeks(2026, 10)}/>);
  it('one card per stat in its own unit, lower is better, never one combined score', () => {
    const { text } = record({ status: 'ready', rows: ROWS });
    for (const words of ['Your prop accuracy', 'Average miss vs. saved reference · lower is better', 'Receiving yards', '4.0', 'yd', 'Receptions', '0.6', 'rec',
      'Average miss · 5 guesses', 'Last 5 guesses', 'Each stat stays separate', 'Yards and receptions never become one score.', 'View Gap paper record',
      'Record period', 'Athlete', 'Stat type']) expect(text).toContain(words);
    expect(text).not.toMatch(/\/ ?100|%|overall/i);
  });
  it('the paper record grades verified finals only; waiting evidence is ungraded, never a loss', () => {
    const { text, html } = record({ status: 'ready', rows: ROWS }, { view: 'paper' });
    // The rate sits inside its ring (sheet 04); the ring's own name carries it for assistive technology.
    expect(html).toContain('aria-label="100.0% paper win rate"'); expect(html).toMatch(/<b aria-hidden="true">100\.0<small>%<\/small><\/b>/);
    for (const words of ['Your Gap paper record', 'Gap size', '5–0–0', '5 graded', '4 awaiting finals', 'Paper record · 1U at −110',
      'Waiting for verified finals', 'Pending evidence stays ungraded, never a loss.', 'Gap size narrows the paper record only.']) expect(text).toContain(words);
  });
  it('no guesses is no score (not zero); loading and failure never show a partial period', () => {
    expect(record({ status: 'ready', rows: [] }).text).toContain('No guesses means no accuracy score—not zero.');
    expect(record({ status: 'ready', rows: [] }).text).not.toContain('0.0');
    const loading = record({ status: 'loading', rows: [] }).text;
    expect(loading).toContain('Loading the complete period'); expect(loading).toContain('A partial period won’t be shown as All time.');
    const failed = record({ status: 'error', rows: [] }).text;
    expect(failed).toContain('This record couldn’t load'); expect(failed).toContain('Retry this period');
    expect(record({ status: 'unavailable', rows: [] }).text).toContain('No verified props available yet');
  });
  it('retained weeks run from the first prop season through the current week', () => {
    expect(propWeeks(2026, 3)).toEqual([1, 2, 3].map(week => ({ season: 2026, week })));
    expect(propWeeks(2025, 3)).toEqual([]);
    expect(propWeeks(2027, 1).at(-1)).toEqual({ season: 2027, week: 1 });
  });
});

const { PropReceipt } = await import('../web/src/next/props/PropReceipt.jsx');
const { PropReveal } = await import('../web/src/next/props/PropReveal.jsx');
const { HistoryPropsScreen, propWeeksOf, propPaperWords } = await import('../web/src/next/props/HistoryProps.jsx');
describe('saved receipt, other players’ guesses and History (the remaining D-82 frontend)', () => {
  const GUESS = { ...OFFERS[0], season: 2026, week: 10, guess: 72.5, status: 'locked', lockedAt: '2026-11-12T20:00:00Z', reference: { ...REFERENCE, recordedAt: '2026-11-12T19:56:00Z' } };
  it('the receipt reuses the Spread/Total receipt and scorecard pattern with the prop identity, unit and source time', () => {
    const { html, text } = render(<PropReceipt athlete={GUESS} guess={GUESS}/>);
    expect(html).toContain('gx-lock-receipt'); expect(html).toContain('gx-pick-scorecard'); expect(html).toContain('data-prop-scorecard');
    for (const words of ['Receiving yards', 'Locked in', 'Fixture Receiver', 'Your saved guess', '72.5', 'Saved reference', '66.5', 'Three-book median', 'Miss', '6',
      'yards from saved reference', 'Saved line observed', '3 books', 'Missed by 6 yd']) expect(text).toContain(words);
    expect(text).not.toMatch(/points|\/ ?10|%/i);
  });
  it('other players’ guesses render only for an opened selection, values and names only', () => {
    const rows = [{ userId: '00000000-0000-4000-8000-000000000002', name: 'Troy Fixture', removed: false, guess: 70.5 }, { userId: '00000000-0000-4000-8000-000000000003', name: 'Sean Fixture', removed: true, guess: 64 }];
    expect(renderToStaticMarkup(<PropReveal selection={{ ...OFFERS[0], ownLocked: false, started: false, rows }}/>)).toBe('');
    const { text } = render(<PropReveal selection={{ ...OFFERS[0], ownLocked: true, started: false, rows }} own={72.5}/>);
    for (const words of ['Everyone’s guesses', 'Open', 'Troy Fixture', '70.5 yd', 'Sean Fixture', 'Former member', '64 yd', 'Your guess · 72.5 yd']) expect(text).toContain(words);
    expect(render(<PropReveal selection={{ ...OFFERS[0], ownLocked: true, started: false, rows: [] }}/>).text).toContain('No one else has locked in this prop.');
  });
  it('History lists your own locked props by week with per-stat accuracy; another member sees no prop rows', () => {
    const rows = [{ ...GUESS, week: 9, closingLine: 66.5, result: { status: 'final', participated: true, actual: 80 } }, { ...GUESS, stat: 'player_receptions', guess: 5, week: 10, reference: { ...REFERENCE, line: 4.5 }, closingLine: null, result: null }];
    expect(propWeeksOf(rows).map(w => w.week)).toEqual([10, 9]);
    expect(propPaperWords(rows[0]).word).toBe('Win'); expect(propPaperWords(rows[1]).word).toBe('Not graded');
    const list = render(<HistoryPropsScreen read={{ status: 'ready', rows }} own week={null} onWeek={() => {}} onRetry={() => {}}/>).text;
    for (const words of ['Your prop accuracy', 'Receiving yards', 'Receptions', 'Week 10', 'Week 9', 'Spread and Total points stay separate.']) expect(list).toContain(words);
    const week = render(<HistoryPropsScreen read={{ status: 'ready', rows }} own week={9} onWeek={() => {}} onRetry={() => {}}/>).text;
    for (const words of ['Week 9 · Player Props', 'Fixture Receiver · Receiving yards', 'Missed by 6 yd', 'Paper · Win']) expect(week).toContain(words);
    expect(render(<HistoryPropsScreen read={{ status: 'loading', rows: [] }} own={false}/>).text).toContain('Player Props history lists your own locked props.');
    expect(render(<HistoryPropsScreen read={{ status: 'ready', rows: [] }} own/>).text).toContain('No guesses means no accuracy score—not zero.');
  });
  it('History offers Player Props only behind the flag, as a lazy chunk', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync('web/src/next/me/HistoryGuess.jsx', 'utf8');
    expect(source).toMatch(/withPlayerProps\(HISTORY_MARKETS, PROPS_MARKET, propsEnabled\)/);
    expect(source).toMatch(/const props = propsEnabled && args\.mode === PROPS_MARKET/);
    expect(source).toMatch(/lazy\(\(\) => import\('\.\.\/props\/HistoryProps\.jsx'\)\)/);
    expect(source).not.toMatch(/^import .*props\/HistoryProps/m);
  });
});
