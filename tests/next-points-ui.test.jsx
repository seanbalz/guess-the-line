// Guess the Points screens (D-56 spec section 5; the D-56 addenda: option D glow cards, any number of them, and Sean's
// October 23 decisions 1C 2A 3B 4A 5B 6A; D-69 P4A, November 3: the week card with slot tiles, then a
// slot layer): the week card, the slot layer, the
// results tiles, the coming-soon state, the Play landing row and the League board, rendered statically from fixture reads.
// Fixture members and players only; no real picks. The server applies the reveal gate (tests/points-cloud.test.mjs); these
// tests check the screens draw only what the read holds, keep D-38/D-55 restraint and say "—" for missing.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, matchups, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';
import { teamMarks } from '../web/src/teamLogoRegistry.js';

const state = vi.hoisted(() => ({ app: null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn(), pointsApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app, useSharedRead: () => ({ data: null }) }));
// Board i63: a Points slot sheet reads the week's Fantasy snapshot; these renders leave it loading.
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => ({ status: 'loading' }) }));
const { PointsBallotView } = await import('../web/src/next/play/points/PointsBallot.jsx');
const { PointsBoardView } = await import('../web/src/next/play/points/PointsBoard.jsx');
const model = await import('../web/src/next/play/points/pointsModel.js');
const { ShellContext } = await import('../web/src/next/shell/context.js');

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
// Every slot kicked off: no lock is left, so the week's meta line is its score.
const DONE = { ...READ, slots: READ.slots.map(s => ({ ...s, closed: true })) };
const withSlot = (name, patch) => ({ ...READ, slots: READ.slots.map(s => s.slot === name ? { ...s, ...patch } : s) });
const SHELL = { state: { views: { play: {}, league: {} } }, go: vi.fn(), setView: vi.fn(), setDirty: vi.fn() };
/** The shell at the Points address; `place` adds the layer keys (`item` the slot code, `layer` 'profile'). */
const at = (place = {}) => ({ ...SHELL, state: { views: { play: { section: 'points', ...place }, league: {} } } });
const ready = (data = READ) => ({ loading: false, data, error: null, retry: vi.fn() });
const ballot = (read = ready(), place = {}) => {
  const shell = at(place);
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><PointsBallotView app={APP} shell={shell} read={read}/></div></ShellContext.Provider>);
};
const text = node => [...walk(node)].filter(n => n.text !== undefined).map(n => n.text).join(' ');
const tiles = html => [...walk(parseMarkup(html))].filter(n => n.attrs?.['data-slot']);
const tile = (html, name) => tiles(html).find(n => n.attrs['data-slot'] === name);
const heading = html => [...walk(parseMarkup(html))].find(n => n.attrs?.['data-route-focus'] !== undefined && n.tag === 'h2');
const lips = html => [...walk(parseMarkup(html))].filter(n => n.tag === 'button' && /gx-nest-lip\b/.test(n.attrs?.class || '')).map(n => nameFrom(n).trim());
const card = html => [...walk(parseMarkup(html))].find(n => /\bgx-nest-card\b/.test(n.attrs?.class || ''));
const inDialog = node => { for (let n = node.parent; n; n = n.parent) if (n.tag === 'dialog') return true; return false; };
/** Numbers drawn as data on a tile (gx-n- numerals); kickoff times and matchups are labels, not data. */
const dataNumbers = node => [...walk(node)].filter(n => /\bgx-n-/.test(n.attrs?.class || '')).length;

describe('Play › Points, the week card (P4A)', () => {
  it('"Week 7 Points" over a five-part bar and one meta line, five glow slot tiles in kickoff order, the board tile, and no lime button', () => {
    const html = ballot();
    expect(markupProblems(html)).toEqual([]);
    expect(text(heading(html))).toBe('Week 7 Points');
    expect(lips(html)).toEqual(['Back to Play']);
    const bar = [...walk(parseMarkup(html))].find(n => n.attrs?.['data-points-bar'] !== undefined);
    expect(bar.attrs.role).toBe('img');
    expect(bar.attrs['aria-label']).toBe('2 of 5 slots locked, 1 draft');
    expect(bar.children.map(n => n.attrs.class)).toEqual(['locked', 'locked', 'draft', 'open', 'closed'].map(s => `gx-pt-bar-part gx-pt-bar-part--${s}`));
    expect(html).toContain('2 of 5 locked · next locks Sun 10:00 AM PT');
    expect(tiles(html).map(n => n.attrs['data-slot'])).toEqual(['FLEX', 'QB', 'RB', 'WR', 'TE']);
    for (const node of tiles(html)) {
      expect(node.tag).toBe('button');
      expect(node.attrs.class).toMatch(/gx-card--hero/);
      expect(node.attrs.id).toBe(`gx-pt-slot-${node.attrs['data-slot']}`);
    }
    expect(html).not.toContain('gx-btn--primary');
    expect(html).not.toContain('gx-sheet');
    expect(html).toContain('About Guess the Points');
  });

  it('each tile: position, status word, player and one value line, named in words; never another member’s guess or the House', () => {
    const html = ballot();
    const expected = {
      FLEX: ['PROVISIONAL', '6.6 / 10', 'Flex, Fixture FLEX Player, MIA @ NE, Thu 5:15 PM PT, PROVISIONAL, 6.6 of 10 points'],
      QB: ['Locked in', 'You 22', 'Quarterback, Fixture QB Player, PIT @ CLE, Sun 10:00 AM PT, Locked in, You 22'],
      RB: ['Draft', 'Draft 18', 'Running back, Fixture RB Player, KC @ LV, Sun 10:00 AM PT, Draft, Draft 18'],
      WR: ['To pick', 'Locks Sun 10:00 AM PT', 'Wide receiver, Fixture WR Player, SEA @ DEN, Sun 10:00 AM PT, To pick, locks Sun 10:00 AM PT'],
      TE: ['Closed', '— no guess', 'Tight end, Fixture TE Player, NYJ @ BUF, Sun 10:00 AM PT, Closed, no guess'],
    };
    for (const [name, [word, value, label]] of Object.entries(expected)) {
      const node = tile(html, name);
      expect(text(node).replace(/\s+/g, ' ').trim()).toBe(`${name} ${word} PIT Fixture ${name} Player ${value}`);
      expect(node.attrs['aria-label']).toBe(label);
      expect(dataNumbers(node), name).toBeLessThanOrEqual(6);
      // D-31: the number line and the House stay in the slot's layer, behind the viewer's own lock or kickoff.
      expect(`${text(node)} ${node.attrs['aria-label']}`).not.toMatch(/Troy|Luke|House|19\.4|12\.8|\b24\b|\b17\b/);
    }
  });

  it('the sixth tile is the Points board: the viewer’s season rank in words, "1st", "of 2 · tied"', () => {
    const board = [...walk(parseMarkup(ballot()))].find(n => n.tag === 'button' && n.attrs['aria-label']?.startsWith('Points board'));
    expect(board.attrs['aria-label']).toBe('Points board, 1st of 2, tied');
    expect(text(board)).toMatch(/Points board\s+1st\s+of 2 · tied/);
    expect(model.boardTile({ ...READ, standings: { week: [], season: [] } }, ME)).toEqual({ big: '—', sub: 'No rank yet', label: 'Points board, no rank yet' });
  });

  it('once no slot can be locked the meta line is the week’s score, PROVISIONAL or FINAL', () => {
    expect(ballot(ready(DONE))).toContain('You 6.6 of 50 · PROVISIONAL');
    const final = ballot(ready({ ...DONE, result: { ...READ.result, status: 'FINAL' } }));
    expect(final).toContain('You 6.6 of 50 · FINAL');
    expect(text(tile(final, 'FLEX'))).toContain('FINAL');
  });

  it('a void slot says so on its tile and shows no tiles in its layer', () => {
    const data = withSlot('FLEX', { state: 'void', actual: null, voidReason: 'inactive' });
    expect(text(tile(ballot(ready(data)), 'FLEX'))).toMatch(/Void · inactive.*No points/);
    const layer = ballot(ready(data), { item: 'FLEX' });
    expect(layer).toContain('Void for everyone. This week’s maximum drops by 10.');
    expect(layer).not.toContain('Actual');
  });
});

describe('a slot’s layer (P4A; it replaces the slot sheet)', () => {
  it('3B: under the lips Play › Week 7 Points, the big stepper, Save draft, and the one lime "Lock in N" with a confirm dialog', () => {
    const html = ballot(ready(), { item: 'RB' });
    expect(markupProblems(html)).toEqual([]);
    expect(text(heading(html))).toBe('RB · Fixture RB Player');
    expect(lips(html)).toEqual(['Back to Play', 'Back to Week 7 Points']);
    expect(html).not.toContain('gx-sheet');
    const root = parseMarkup(html);
    expect(html).toContain('aria-label="One point less, hold for 5"');
    expect(html).toContain('aria-label="One point more, hold for 5"');
    expect(html).toContain('Hold to move by 5');
    const spin = [...walk(root)].find(n => n.attrs?.role === 'spinbutton');
    expect([spin.attrs['aria-valuemin'], spin.attrs['aria-valuemax'], spin.attrs['aria-valuenow'], text(spin)]).toEqual(['0', '60', '18', '18']);
    expect(html).toContain('Save draft');
    const lime = [...walk(root)].filter(n => /gx-btn--primary/.test(n.attrs?.class || ''));
    expect(lime.filter(n => !inDialog(n)).map(n => text(n))).toEqual(['Lock in 18']);
    expect(lime.filter(inDialog).map(n => text(n))).toEqual(['Confirm lock-in']);
    for (const words of ['Lock in 18?', 'Confirm lock-in', 'Keep editing', 'This guess is final.', '1 locked in · guesses open at kickoff']) expect(html).toContain(words);
  });

  it('the stepper clamps to 0–60 at the ends', () => {
    const data = value => withSlot('RB', { own: { guess: value, locked: false, lockedAt: null, points: null } });
    expect(ballot(ready(data(60)), { item: 'RB' })).toMatch(/aria-label="One point more, hold for 5" disabled=""/);
    expect(ballot(ready(data(0)), { item: 'RB' })).toMatch(/aria-label="One point less, hold for 5" disabled=""/);
    expect([model.step(58, 5), model.step(3, -5), model.step(null, 5)]).toEqual([60, 0, 0]);
  });

  it('with no guess yet, the lock button waits for one', () => {
    expect(ballot(ready(), { item: 'WR' })).toMatch(/gx-btn--primary[^>]*disabled=""[^>]*>Choose a guess to lock in/);
  });

  it('5B: a revealed slot shows "You N" and a number line of focusable faces and a House tick, each naming its exact value', () => {
    const html = ballot(ready(), { item: 'QB' });
    expect(markupProblems(html)).toEqual([]);
    expect(html).not.toContain('role="spinbutton"');
    expect(text(card(html))).toMatch(/You\s+22/);
    const line = [...walk(parseMarkup(html))].find(n => n.attrs?.role === 'group' && /scale from 0 to 30/.test(n.attrs['aria-label'] || ''));
    const names = [...walk(line)].filter(n => n.tag === 'button').map(n => n.attrs['aria-label']);
    expect(names).toEqual(['Luke Fixture: 17', 'You: 22', 'Troy Fixture: 24', 'House, unranked: 19.4']);
  });

  it('4A: before the gate opens and after kickoff, only who locked in shows, never a number', () => {
    const data = withSlot('WR', { closed: true, state: 'pending', lockedIn: [face(TROY, 'Troy Fixture')] });
    const layer = card(ballot(ready(data), { item: 'WR' }));
    expect(text(layer)).toContain('1 locked in · guesses open at kickoff');
    expect([...walk(layer)].some(n => n.attrs?.role === 'spinbutton' || n.attrs?.['data-number-line'] !== undefined)).toBe(false);
  });

  it('results: You / Actual / Points tiles, the closest line, and "Exact · 10 points" only for an exact guess', () => {
    const flex = text(card(ballot(ready(), { item: 'FLEX' })));
    expect(flex).toMatch(/You\s+18\s+Actual\s+14\.6\s+Points\s+6\.6/);
    expect(flex).toContain('Troy Fixture was closest');
    expect(flex).toContain('PROVISIONAL');
    expect(flex).not.toContain('Exact');
    const exact = withSlot('FLEX', { actual: 18, own: { guess: 18, locked: true, lockedAt: '2026-10-21T18:00:00Z', points: 10 } });
    expect(text(card(ballot(ready(exact), { item: 'FLEX' })))).toMatch(/You\s+18\s+Actual\s+18\s+Points\s+10\s+Exact · 10 points/);
  });

  it('a slot never locked in reads "—" in its results, never 0, and offers no lock-in', () => {
    const layer = card(ballot(ready(), { item: 'TE' }));
    const results = text([...walk(layer)].find(n => n.attrs?.['aria-label'] === 'Results'));
    expect(results).toMatch(/You\s+—\s+Actual\s+—\s+Points\s+—/);
    expect(results).not.toMatch(/\b0\b/);
    expect(text(layer)).toContain('You did not lock in this player. No points, shown as —.');
    expect(text(layer)).not.toMatch(/Lock in|null/);
  });

  it('the profile is the slot’s next card: under Play › Week 7 Points › QB · Player, with no Lock in', () => {
    const html = ballot(ready(), { item: 'QB', layer: 'profile' });
    expect(markupProblems(html)).toEqual([]);
    expect(text(heading(html))).toBe('Fixture QB Player');
    expect(lips(html)).toEqual(['Back to Play', 'Back to Week 7 Points', 'Back to QB · Fixture QB Player']);
    expect(html).not.toContain('Lock in');
  });

  it('an address naming no slot of this week shows the week card; D-62 marks draw the slot’s game', () => {
    for (const item of ['K', '<b>']) expect(text(heading(ballot(ready(), { item })))).toBe('Week 7 Points');
    const wr = card(ballot(ready(), { item: 'WR' }));
    expect(readText(wr)).toContain('Wide receiver · Seattle Seahawks at Denver Broncos · locks Sun 10:00 AM PT');
    expect(matchups(wr).map(m => m.srcs)).toEqual([[teamMarks.SEA.src, teamMarks.DEN.src]]);
  });
});

describe('feature flag and empty states', () => {
  it('a 404 from the routes (P-01 not hosted) reads "Points is coming soon", with no score and no editor', () => {
    for (const error of [{ status: 404, message: 'Guess the Points is coming soon.', code: 'GTL_POINTS_OFF' }, { status: 404, message: 'Not found.' }]) {
      const html = ballot({ loading: false, data: null, error, retry: vi.fn() }, { item: 'QB' });
      expect(markupProblems(html)).toEqual([]);
      expect(text(heading(html))).toBe('Guess the Points');
      expect(html).toContain('Points is coming soon');
      expect(html).not.toContain('Try again');
      expect(html).not.toMatch(/of 50|Lock in/);
    }
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
  it('number line: the scale is max(30, top value rounded up to 10) and faces closer than a third of it take separate lanes', () => {
    const line = model.numberLine(READ.slots[1], ME);
    expect(line.max).toBe(30);
    // 17, 22 and 24 on a 0–30 line are under 10 apart: three lanes, so no two 44px faces overlap on a 170px line (320 wide).
    expect(line.markers.map(m => [m.name, m.lane])).toEqual([['Luke Fixture', 0], ['You', 1], ['Troy Fixture', 2]]);
    expect(line.lanes).toBe(3);
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
