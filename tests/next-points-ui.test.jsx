// Guess the Points screens (D-56 spec section 5; the D-56 addenda: option D glow cards, any number of them, and Sean's
// October 23 decisions 1C 2A 3B 4A 5B 6A): the ballot, the slot sheet, the
// results tiles, the coming-soon state, the Play landing row and the League board, rendered statically from fixture reads.
// Fixture members and players only; no real picks. The server applies the reveal gate (tests/points-cloud.test.mjs); these
// tests check the screens draw only what the read holds, keep D-38/D-55 restraint and say "—" for missing.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, matchups, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';
import { teamMarks } from '../web/src/teamLogoRegistry.js';

const state = vi.hoisted(() => ({ app: null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn(), pointsApi: vi.fn() }));
vi.mock('../web/src/CommunityHome.jsx', () => ({ WeekPicks: () => <div className="community-week-picks"/> }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app, useSharedRead: () => ({ data: null }) }));
const { PointsBallotView, PointsLandingCard } = await import('../web/src/next/play/points/PointsBallot.jsx');
const { PointsBoardView } = await import('../web/src/next/play/points/PointsBoard.jsx');
const model = await import('../web/src/next/play/points/pointsModel.js');
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Play } = await import('../web/src/next/play/Play.jsx');

const ME = '11111111-1111-4111-8111-111111111111', TROY = '22222222-2222-4222-8222-222222222222', LUKE = '33333333-3333-4333-8333-333333333333';
const face = (userId, displayName) => ({ userId, displayName });
const slot = (name, patch = {}) => ({
  slot: name, playerId: `00-fixture-${name}`, name: `Fixture ${name} Player`, team: 'PIT', position: name === 'FLEX' ? 'WR' : name,
  gameKey: `2026_07_${name === 'QB' ? 'PIT_CLE' : name === 'RB' ? 'KC_LV' : name === 'WR' ? 'SEA_DEN' : name === 'TE' ? 'NYJ_BUF' : 'MIA_NE'}`,
  kickoff: '2026-10-25T17:00:00Z', closed: false, state: 'open', actual: null, voidReason: null, revealed: false, own: null,
  house: null, lockedIn: [], guesses: [], ...patch,
});
const READ = {
  season: 2026, week: 7, status: 'open', groupId: null, opensAt: '2026-10-20T19:00:00Z', finalizeAt: '2026-10-29T19:00:00Z',
  scoringRules: { format: 'ppr', passingTds: 4, version: 'ppr4-v1' },
  result: { status: 'PROVISIONAL', maximum: 50, points: 6.6, finalizedAt: null, house: { points: 8.2, complete: true } },
  slots: [
    // Scored: You 18, actual 14.6, 6.6 points; Troy guessed 15 and was closest.
    slot('FLEX', { kickoff: '2026-10-23T00:15:00Z', closed: true, state: 'scored', actual: 14.6, revealed: true,
      own: { guess: 18, locked: true, lockedAt: '2026-10-21T18:00:00Z', points: 6.6 }, house: { estimate: 12.8, points: 8.2 },
      lockedIn: [face(ME, 'Sean Fixture'), face(TROY, 'Troy Fixture')], guesses: [{ ...face(TROY, 'Troy Fixture'), guess: 15, points: 9.6 }] }),
    // Locked, gate open, before kickoff: faces first with each guess and the House.
    slot('QB', { revealed: true, own: { guess: 22, locked: true, lockedAt: '2026-10-21T18:00:00Z', points: null }, house: { estimate: 19.4, points: null },
      lockedIn: [face(ME, 'Sean Fixture'), face(TROY, 'Troy Fixture'), face(LUKE, 'Luke Fixture')],
      guesses: [{ ...face(TROY, 'Troy Fixture'), guess: 24, points: null }, { ...face(LUKE, 'Luke Fixture'), guess: 17, points: null }] }),
    // A saved draft, gate closed: faces of who locked in, no numbers.
    slot('RB', { own: { guess: 18, locked: false, lockedAt: null, points: null }, lockedIn: [face(TROY, 'Troy Fixture')] }),
    slot('WR'),
    // Kicked off and never locked in: Closed, nothing scores, "—".
    slot('TE', { closed: true, state: 'pending', revealed: true, house: { estimate: 9.1, points: null } }),
  ],
  standings: {
    week: [{ ...face(TROY, 'Troy Fixture'), points: 9.6, exact: 0, off: 0.4, rank: 1, tied: false }, { ...face(ME, 'Sean Fixture'), points: 6.6, exact: 0, off: 3.4, rank: 2, tied: false }],
    season: [{ ...face(TROY, 'Troy Fixture'), points: 30.2, weeksPlayed: 2, perWeek: 15.1, provisional: true, beatHouse: 1, rank: 1, tied: true },
      { ...face(ME, 'Sean Fixture'), points: 30.2, weeksPlayed: 2, perWeek: 15.1, provisional: true, beatHouse: 2, rank: 1, tied: true },
      { ...face(LUKE, 'Luke Fixture'), points: null, weeksPlayed: 1, perWeek: null, provisional: false, beatHouse: 0, rank: null, tied: false }],
  },
};
const APP = { accountId: ME, league: { name: 'Community', community: true }, community: { status: 'ready', data: null }, refresh: vi.fn(), requestSignIn: vi.fn() };
const SHELL = { state: { views: { play: {}, league: {} } }, go: vi.fn(), setView: vi.fn(), setDirty: vi.fn() };
const ready = (data = READ) => ({ loading: false, data, error: null, retry: vi.fn() });
const ballot = (read = ready(), initialSlot = null) => renderToStaticMarkup(<div className="gx"><PointsBallotView app={APP} shell={SHELL} read={read} initialSlot={initialSlot}/></div>);
const text = node => [...walk(node)].filter(n => n.text !== undefined).map(n => n.text).join(' ');
const cards = html => [...walk(parseMarkup(html))].filter(n => n.attrs?.['data-slot']);
const card = (html, name) => cards(html).find(n => n.attrs['data-slot'] === name);
/** Numbers drawn as data on a card (gx-n- numerals); kickoff times and matchups are labels, not data. */
const dataNumbers = node => [...walk(node)].filter(n => /\bgx-n-/.test(n.attrs?.class || '')).length;

describe('Play › Points ballot (option D)', () => {
  it('draws five slot cards in kickoff order with one status word each and no lime button on the screen', () => {
    const html = ballot();
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('WEEK 7 POINTS');
    expect(html).toContain('You 6.6 of 50 · PROVISIONAL');
    expect(cards(html).map(n => n.attrs['data-slot'])).toEqual(['FLEX', 'QB', 'RB', 'WR', 'TE']);
    const status = name => text(card(html, name));
    expect(status('QB')).toContain('Locked in');
    expect(status('RB')).toContain('Draft');
    expect(status('WR')).toContain('To pick');
    expect(status('TE')).toContain('Closed');
    expect(html).not.toContain('gx-btn--primary');
    expect(html).toContain('About Guess the Points');
  });

  it('every slot card is a glow card (D-56 addendum, Oct 23), with at most six data numbers each, as one button', () => {
    const html = ballot();
    const glowing = cards(html).filter(n => /gx-card--hero/.test(n.attrs.class));
    expect(glowing.map(n => n.attrs['data-slot'])).toEqual(['FLEX', 'QB', 'RB', 'WR', 'TE']);
    for (const node of cards(html)) {
      expect(dataNumbers(node), node.attrs['data-slot']).toBeLessThanOrEqual(6);
      expect(node.tag).toBe('button');
      expect(node.attrs['aria-label']).toMatch(/^(Quarterback|Running back|Wide receiver|Tight end|Flex), Fixture/);
    }
  });

  it('2A + 5B: locked in shows "You N", and once the gate opens a number line whose exact values the card names', () => {
    const qb = card(ballot(), 'QB');
    expect(text(qb)).toMatch(/You\s+22/);
    expect(text(qb)).toContain('House 19.4');
    const line = [...walk(qb)].find(n => n.attrs?.['data-number-line'] !== undefined);
    expect(line.attrs['aria-hidden']).toBe('true');
    expect([...walk(line)].filter(n => n.attrs?.['data-guess']).map(n => n.attrs['data-guess'])).toEqual(['17', '22', '24']);
    // The card is one button: its accessible name carries every exact value.
    expect(qb.attrs['aria-label']).toContain('Luke Fixture 17, You 22, Troy Fixture 24, House 19.4');
    expect([...walk(qb)].filter(n => n.tag === 'button')).toHaveLength(0);
  });

  it('2A + 4A: a draft shows "Draft N"; before the gate opens, faces of who locked in with no numbers and no House', () => {
    const rb = card(ballot(), 'RB');
    expect(text(rb)).toContain('1 locked in · guesses open at kickoff');
    expect(text(rb)).not.toMatch(/House/);
    expect(text(rb)).toMatch(/Draft\s+18/);
    // D-62: the game as marks, away first; the card's name keeps the text form.
    const wr = card(ballot(), 'WR');
    expect(text(wr)).toContain('WR · Fixture WR Player');
    expect(readText(wr)).toContain('Seattle Seahawks at Denver Broncos · Sun 10:00 AM PT');
    expect(matchups(wr).map(m => m.srcs)).toEqual([[teamMarks.SEA.src, teamMarks.DEN.src]]);
    expect(wr.attrs['aria-label']).toContain('SEA @ DEN, Sun 10:00 AM PT');
  });

  it('results: You / Actual / Points tiles with PROVISIONAL, and one line naming the closest member', () => {
    const flex = text(card(ballot(), 'FLEX'));
    expect(flex).toContain('FLEX · Fixture FLEX Player PROVISIONAL');
    expect(flex).toMatch(/You\s+18\s+Actual\s+14\.6\s+Points\s+6\.6/);
    expect(flex).toContain('Troy Fixture was closest');
    expect(flex).toContain('House 12.8');
  });

  it('a slot never locked in reads "—", never 0', () => {
    const te = text(card(ballot(), 'TE'));
    expect(te).toMatch(/You\s+—\s+Actual\s+—\s+Points\s+—/);
    expect(te).not.toMatch(/\b0\b/);
  });

  it('a void slot says so for everyone and shows no tiles', () => {
    const data = { ...READ, slots: READ.slots.map(s => s.slot === 'FLEX' ? { ...s, state: 'void', actual: null, voidReason: 'inactive' } : s) };
    const flex = text(card(ballot(ready(data)), 'FLEX'));
    expect(flex).toContain('Void · inactive');
    expect(flex).not.toContain('Actual');
  });

  it('a FINAL week says FINAL', () => {
    const html = ballot(ready({ ...READ, result: { ...READ.result, status: 'FINAL' } }));
    expect(html).toContain('You 6.6 of 50 · FINAL');
    expect(text(card(html, 'FLEX'))).toContain('FINAL');
  });
});

describe('the slot sheet', () => {
  it('3B: a big stepper (− / number / +, 56px, hold to move by 5), Save draft, and one lime "Lock in N" with a confirm dialog', () => {
    const html = ballot(ready(), 'RB');
    expect(markupProblems(html)).toEqual([]);
    const root = parseMarkup(html);
    expect(html).not.toContain('Quick guesses');
    expect(html).toContain('aria-label="One point less, hold for 5"');
    expect(html).toContain('aria-label="One point more, hold for 5"');
    expect(html).toContain('Hold to move by 5');
    const spin = [...walk(root)].find(n => n.attrs?.role === 'spinbutton');
    expect([spin.attrs['aria-valuemin'], spin.attrs['aria-valuemax'], spin.attrs['aria-valuenow'], text(spin)]).toEqual(['0', '60', '18', '18']);
    expect(html).toContain('Save draft');
    const foot = [...walk(root)].find(n => n.attrs?.class === 'gx-sheet-foot');
    const lime = [...walk(foot)].filter(n => /gx-btn--primary/.test(n.attrs?.class || ''));
    expect(lime.map(n => text(n))).toEqual(['Lock in 18']);
    for (const words of ['Lock in 18?', 'Confirm lock-in', 'Keep editing', '1 locked in · guesses open at kickoff']) expect(html).toContain(words);
  });

  it('the stepper clamps to 0–60 at the ends', () => {
    const data = value => ({ ...READ, slots: READ.slots.map(s => s.slot === 'RB' ? { ...s, own: { guess: value, locked: false, lockedAt: null, points: null } } : s) });
    expect(ballot(ready(data(60)), 'RB')).toMatch(/aria-label="One point more, hold for 5" disabled=""/);
    expect(ballot(ready(data(0)), 'RB')).toMatch(/aria-label="One point less, hold for 5" disabled=""/);
    expect([model.step(58, 5), model.step(3, -5), model.step(null, 5)]).toEqual([60, 0, 0]);
  });

  it('with no guess yet, the lock button waits for one', () => {
    expect(ballot(ready(), 'WR')).toMatch(/gx-btn--primary[^>]*disabled=""[^>]*>Choose a guess to lock in/);
  });

  it('5B: a revealed slot shows a number line of focusable faces and a House tick, each naming its exact value', () => {
    const html = ballot(ready(), 'QB');
    expect(markupProblems(html)).toEqual([]);
    expect(html).not.toContain('role="spinbutton"');
    const root = parseMarkup(html);
    const line = [...walk(root)].find(n => n.attrs?.role === 'group' && /scale from 0 to 30/.test(n.attrs['aria-label'] || ''));
    const names = [...walk(line)].filter(n => n.tag === 'button').map(n => n.attrs['aria-label']);
    expect(names).toEqual(['Luke Fixture: 17', 'You: 22', 'Troy Fixture: 24', 'House, unranked: 19.4']);
  });

  it('before the gate opens and after kickoff, only who locked in shows, never a number', () => {
    const data = { ...READ, slots: READ.slots.map(s => s.slot === 'WR' ? { ...s, closed: true, state: 'pending', lockedIn: [face(TROY, 'Troy Fixture')] } : s) };
    const sheet = [...walk(parseMarkup(ballot(ready(data), 'WR')))].find(n => n.attrs?.role === 'dialog');
    expect(text(sheet)).toContain('1 locked in · guesses open at kickoff');
    expect([...walk(sheet)].some(n => n.attrs?.role === 'spinbutton' || n.attrs?.['data-number-line'] !== undefined)).toBe(false);
  });
});

describe('feature flag and empty states', () => {
  it('a 404 from the routes (P-01 not hosted) reads "Points is coming soon", with no score and no editor', () => {
    for (const error of [{ status: 404, message: 'Guess the Points is coming soon.', code: 'GTL_POINTS_OFF' }, { status: 404, message: 'Not found.' }]) {
      const html = ballot({ loading: false, data: null, error, retry: vi.fn() });
      expect(markupProblems(html)).toEqual([]);
      expect(html).toContain('Points is coming soon');
      expect(html).not.toContain('Try again');
      expect(html).not.toMatch(/of 50|Lock in/);
    }
    expect(model.landingCard(null, { status: 404 })).toEqual({ progress: null, meta: 'Points is coming soon', label: 'Guess the Points, Points is coming soon' });
  });

  it('another failure offers a retry instead of coming soon', () => {
    const html = ballot({ loading: false, data: null, error: { status: 503, message: 'Guess the Points is unavailable.' }, retry: vi.fn() });
    expect(html).toContain('Try again');
    expect(html).not.toContain('coming soon');
  });

  it('an unopened week says when weeks open', () => {
    const html = ballot(ready({ season: null, week: null, status: 'unopened', groupId: null, slots: [], result: null, standings: { week: [], season: [] } }));
    expect(html).toContain('A new week opens Tuesdays at 12:00 AM PT.');
  });
});

describe('Play landing row', () => {
  it('1C: Guess the Points is a glow card under the plain Spread and Total rows', () => {
    state.app = { ...APP, community: { status: 'ready', data: { week: { season: 2026, week: 7, games: [] }, picksDue: { state: 'due', week: 7, modes: [{ mode: 'guess_total' }] }, due: [{ mode: 'guess_spread', submitted: true }, { mode: 'guess_total', filled: 0, games: 2 }] } } };
    const html = renderToStaticMarkup(<ShellContext.Provider value={{ ...SHELL, league: APP.league, tab: vi.fn(), reload: vi.fn() }}><div className="gx"><Play/></div></ShellContext.Provider>);
    expect(markupProblems(html)).toEqual([]);
    const order = ['Guess the Spread', 'data-points-landing', 'My league'].map(name => html.indexOf(name));
    const glowing = [...walk(parseMarkup(html))].filter(n => /gx-card--hero/.test(n.attrs?.class || ''));
    expect(glowing.some(n => n.attrs['data-points-landing'] !== undefined)).toBe(true);
    expect([...walk(parseMarkup(html))].filter(n => n.attrs?.['aria-label'] === 'Guess the Spread')[0]?.attrs.class).not.toMatch(/hero/);
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect((html.match(/gx-btn--primary/g) || [])).toHaveLength(1);
  });

  it('1C: a glass pill, a big "2/5" (locked of 5) and the meta line "Next locks …"', () => {
    expect(model.landingCard(READ, null)).toEqual({ progress: '2/5', meta: 'Next locks Sun 10:00 AM PT', label: 'Guess the Points, 2 of 5 locked, Next locks Sun 10:00 AM PT' });
    const done = { ...READ, slots: READ.slots.map(s => ({ ...s, closed: true })) };
    expect(model.landingCard(done, null).meta).toBe('Week 7 · You 6.6 of 50 · PROVISIONAL');
    expect(model.landingCard({ status: 'unopened', slots: [] }, null)).toMatchObject({ progress: null, meta: 'Opens Tuesdays at 12:00 AM PT' });
    expect(model.landingCard(null, { status: 503 }).meta).toBe('Points could not be loaded');
    const html = renderToStaticMarkup(<div className="gx"><PointsLandingCard read={ready()} onOpen={() => {}}/></div>);
    expect(markupProblems(html)).toEqual([]);
    expect(html).toMatch(/gx-card--hero/);
    expect(text(parseMarkup(html))).toMatch(/Guess the Points\s+2\/5\s+Next locks Sun 10:00 AM PT/);
  });
});

describe('League board: Spread / Total / Points', () => {
  it('ranks members with shared ranks, "—" for missing, and House as an unranked row', () => {
    const html = renderToStaticMarkup(<div className="gx"><PointsBoardView app={APP} read={ready()} initialBeat/></div>);
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('Points standings');
    expect((html.match(/Rank 1, tied/g) || [])).toHaveLength(2);
    expect(html).toContain('Week: 6.6 · Season: 30.2 · PROVISIONAL');
    expect(html).toContain('Week: — · Season: —');
    expect(html).toContain('House · unranked');
    expect(html).toContain('Week: 8.2 · Beat the House ›');
    expect(html).toMatch(/aria-expanded="true"[^>]*>|aria-expanded="true"/);
    const rows = [...walk(parseMarkup(html))].filter(n => n.tag === 'li' && n.parent?.attrs?.['aria-label'] === 'Points season standings');
    expect(text(rows.at(-1))).toContain('House · unranked');
    expect(html).toContain('Beat the House');
    expect(html).toContain('Sean Fixture: 2 of 2 weeks');
    const houseRow = [...walk(parseMarkup(html))].find(n => /gx-pt-board-house/.test(n.attrs?.class || ''));
    expect(text(houseRow)).not.toMatch(/Rank \d/);
  });

  it('shows coming soon on the board too', () => {
    const html = renderToStaticMarkup(<div className="gx"><PointsBoardView app={APP} read={{ loading: false, data: null, error: { status: 404 }, retry: vi.fn() }}/></div>);
    expect(html).toContain('Points is coming soon');
  });
});

describe('pointsModel', () => {
  it('number line: the scale is max(30, top value rounded up to 10) and close faces take separate lanes', () => {
    const line = model.numberLine(READ.slots[1], ME);
    expect(line.max).toBe(30);
    expect(line.markers.map(m => [m.name, m.lane])).toEqual([['Luke Fixture', 0], ['You', 0], ['Troy Fixture', 1]]);
    const wide = model.numberLine({ ...READ.slots[1], house: { estimate: 41.2 } }, ME);
    expect(wide.max).toBe(50);
    expect(model.numberLine({ own: { guess: 2, locked: true }, guesses: [{ userId: TROY, displayName: 'T', guess: 28 }], house: null }, ME).markers.map(m => m.lane)).toEqual([0, 0]);
  });

  it('steps stay within 0–60 and the closest line handles ties and the viewer', () => {
    expect([model.step(null, 1), model.step(0, -1), model.step(60, 1), model.step(18, -1)]).toEqual([0, 0, 60, 17]);
    const s = { state: 'scored', actual: 14, own: { guess: 16, locked: true }, guesses: [{ userId: TROY, displayName: 'Troy Fixture', guess: 12 }] };
    expect(model.closestLine(s, ME)).toBe('You and Troy Fixture were closest');
    expect(model.closestLine({ ...s, own: null }, ME)).toBe('Troy Fixture was closest');
    expect(model.closestLine({ ...s, state: 'pending' }, ME)).toBeNull();
    expect(model.pts(null)).toBe('—');
    expect(model.pts(0)).toBe('0');
    expect(model.matchupText({ gameKey: '2026_07_PIT_CLE' })).toBe('PIT @ CLE');
    expect(model.matchupCodes({ gameKey: '2026_07_PIT_CLE' })).toEqual({ away: 'PIT', home: 'CLE' });
    expect(model.matchupCodes({ gameKey: 'other', team: 'PIT' })).toBeNull();
    expect(model.matchupText({ gameKey: 'other', team: 'PIT' })).toBe('PIT');
  });
});
