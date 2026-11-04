// Bets › Everyone (M-10, D-36) screen markup, rendered with react-dom/server. Contracts: the kit's markup rules hold
// (gx- classes, named controls, hidden or labelled svgs); a friend's closed row has side, units and the lock
// sentence and no line, price or book anywhere in the HTML; an open row and your own row show their terms; the one
// banner offers a way to lock in; an unpublished or empty week says so in one sentence.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, matchups, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { teamMarks } from '../web/src/teamLogoRegistry.js';

// The board draws what it is given; the container's read and the app data are not under test here.
vi.mock('../web/src/api.js', () => ({ betsApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));

const { EveryoneBoard } = await import('../web/src/next/bets/EveryoneBets.jsx');
const { EVERYONE_COPY } = await import('../web/src/next/bets/everyone.js');
const { TrackedBetRow } = await import('../web/src/next/bets/TrackedBetRow.jsx');

const LUKE = '00000000-0000-4000-8000-000000000003', TROY = '00000000-0000-4000-8000-000000000002', SEAN = '00000000-0000-4000-8000-000000000001';
const data = {
  season: 2026, week: 7, published: true,
  roster: [{ userId: SEAN, displayName: 'Sean' }, { userId: TROY, displayName: 'Troy' }, { userId: LUKE, displayName: 'Luke' }],
  games: [{ id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00.000Z' }, { id: 'HOU-JAX', awayCode: 'HOU', homeCode: 'JAX', kickoff: '2026-10-25T17:00:00.000Z' }],
  markets: { 'SEA-DEN': { spread: { visible: false }, total: { visible: false } }, 'HOU-JAX': { spread: { visible: true }, total: { visible: false } } },
  bets: [
    { userId: TROY, gameId: 'SEA-DEN', market: 'spread', selection: { side: 'home', units: 1.5, line: -13.5, odds: -115, source: 'BetMGM' }, status: 'win', result: { netUnits: 1.3 } },
    { userId: LUKE, gameId: 'SEA-DEN', market: 'total', selection: { side: 'over', line: 44.5, odds: -110, units: 2, source: 'DraftKings' }, status: null, result: null },
    { userId: SEAN, gameId: 'HOU-JAX', market: 'spread', selection: { side: 'away', line: 3, odds: 120, units: 1, source: 'FanDuel' }, status: 'win', result: { netUnits: 1.2 } },
  ],
  faces: { 'SEA-DEN': [TROY, LUKE], 'HOU-JAX': [SEAN] },
  qualification: [{ userId: TROY, picks: 3, units: 4.5, qualified: true }, { userId: LUKE, picks: 1, units: 2, qualified: false }, { userId: SEAN, picks: 1, units: 1, qualified: false }],
};
const render = (props = {}) => renderToStaticMarkup(<div className="gx"><EveryoneBoard data={data} viewer={LUKE} scopeName="Community" onLockIn={() => {}} onOpenPlay={() => {}} onPlace={() => {}} onRefresh={() => {}} {...props}/></div>);
const slice = (html, key) => {
  const start = html.indexOf(`data-pick="${key}"`);
  return html.slice(start, html.indexOf('</li>', start));
};

describe('everyone’s picks', () => {
  const html = render();
  it('passes the kit markup rules', () => {
    expect(markupProblems(html)).toEqual([]);
  });
  it('shows a closed friend’s side and units with the lock sentence, and none of the terms the reply carried', () => {
    const troy = slice(html, `${TROY}:spread`);
    expect(troy).toContain('data-open="false"');
    expect(troy).toContain('DEN');
    expect(troy).toContain('1.5U');
    expect(troy).toContain(EVERYONE_COPY.locked('spread'));
    // Design audit A14: the row says only when it opens; the one banner explains why.
    expect(troy).toContain('Opens when you lock in or at kickoff');
    expect(troy).not.toContain(EVERYONE_COPY.banner);
    for (const secret of ['13.5', '115', 'BetMGM', '1.30', 'Win']) expect(troy).not.toContain(secret);
    expect(troy).not.toContain('gx-prow-word');
    expect(html).not.toContain('BetMGM');
    expect(html).not.toContain('13.5');
  });
  it('shows an open friend’s terms and result, and your own pick in full', () => {
    const sean = slice(html, `${SEAN}:spread`);
    expect(sean).toContain('HOU +3');
    expect(sean).toContain('+120 · FanDuel');
    expect(sean).toContain('Win +1.20U');
    const luke = slice(html, `${LUKE}:total`);
    expect(luke).toContain('You');
    expect(luke).toContain('Over 44.5');
    expect(luke).toContain('−110 · DraftKings');
  });
  it('draws one banner with a way to lock in, and the weekly list with qualification in words', () => {
    expect(html.split(EVERYONE_COPY.banner).length - 1).toBe(1);
    expect(html).toContain('Lock in a guess');
    expect(html).toContain('Qualified');
    expect(html).toContain('3 picks · 4.5U');
  });
  it('D-62: each game card’s heading is the matchup as marks, away first, and names the card in one sentence', () => {
    expect(matchups(html)).toEqual([ // kickoff order
      { srcs: [teamMarks.HOU.src, teamMarks.JAX.src], name: 'Houston Texans at Jacksonville Jaguars' },
      { srcs: [teamMarks.SEA.src, teamMarks.DEN.src], name: 'Seattle Seahawks at Denver Broncos' },
    ]);
    const nodes = [...walk(parseMarkup(html))];
    const heading = nodes.find(n => n.attrs?.id === 'gx-ev-SEA-DEN');
    expect(heading.tag).toBe('h3');
    expect(nameFrom(heading)).toBe('Seattle Seahawks at Denver Broncos');
    expect(nodes.find(n => n.attrs?.['aria-labelledby'] === 'gx-ev-SEA-DEN').attrs['data-game']).toBe('SEA-DEN');
    expect(html).not.toContain('SEA @ DEN');
  });
  // Design audit A12: a face stack in the game header repeated the faces that lead each pick row. The pickers are named
  // once, on their rows (face first, then the name), and the header draws no face.
  it('names each game’s pickers once, on rows that lead with their faces; the game header draws none', () => {
    const nodes = [...walk(parseMarkup(html))];
    const heads = nodes.filter(n => n.attrs?.class === 'gx-ev-game-head');
    expect(heads).toHaveLength(2);
    for (const head of heads) expect([...walk(head)].filter(n => /\bgx-av/.test(n.attrs?.class ?? ''))).toEqual([]);
    expect(html).not.toContain('picked this game');
    const rows = nodes.filter(n => n.attrs?.['data-pick']);
    expect(rows.map(row => /\bgx-prow-pic\b/.test(row.children[0].attrs?.class ?? '') && [...walk(row.children[0])].some(n => /\bgx-av\b/.test(n.attrs?.class ?? '')))).toEqual([true, true, true]);
    expect(rows.map(row => nameFrom([...walk(row)].find(n => /\bgx-prow-title\b/.test(n.attrs?.class ?? ''))))).toEqual(['Sean', 'You', 'Troy']);
  });
  it('D-31: a closed friend’s row says no term in its name, meta, number, word or attributes; the weekly list carries none', () => {
    const nodesOf = [...walk(parseMarkup(html))];
    const troy = nodesOf.find(n => n.attrs?.['data-pick'] === `${TROY}:spread`);
    const said = JSON.stringify(troy, (k, v) => (k === 'parent' ? undefined : v));
    for (const secret of ['13.5', '115', 'BetMGM', '1.30', '1.3']) expect(said).not.toContain(secret);
    const people = nodesOf.filter(n => n.attrs?.['data-person']);
    expect(people.map(n => n.attrs['data-person'])).toEqual([LUKE, SEAN, TROY]);
    for (const person of people) for (const secret of ['13.5', 'BetMGM', 'FanDuel', 'DraftKings']) expect(JSON.stringify(person, (k, v) => (k === 'parent' ? undefined : v))).not.toContain(secret);
  });
  it('faces first on the weekly list too; the word says Qualified', () => {
    const people = [...walk(parseMarkup(html))].filter(n => n.attrs?.['data-person']);
    expect(people.every(row => /\bgx-prow-pic\b/.test(row.children[0].attrs?.class ?? ''))).toBe(true);
    expect(html).toContain('3 picks · 4.5U');
  });
});

describe('quiet weeks', () => {
  it('an unpublished week is one sentence and one action (design audit A17)', () => {
    const html = render({ data: { season: 2026, week: 8, published: false, roster: [], games: [], bets: [], faces: {}, markets: {}, qualification: [] } });
    expect(html).toContain(EVERYONE_COPY.unpublished);
    expect(html).toContain('Open Play');
    expect(html).not.toContain('id="gx-ev-week"');
  });
  it('a week with no picks is one sentence and one action', () => {
    const html = render({ data: { ...data, bets: [], faces: {}, qualification: [] } });
    expect(html).toContain(EVERYONE_COPY.empty);
    expect(html).toContain('Place a pick');
    expect(markupProblems(html)).toEqual([]);
  });
});

describe('a tracked bet row (D-62)', () => {
  const games = [{ id: 'SEA-DEN', away: 'SEA', home: 'DEN' }, { id: 'KC-LV', away: 'KC', home: 'LV' }];
  const row = entry => renderToStaticMarkup(<div className="gx"><TrackedBetRow entry={{ week: 7, outcome: 'pending', stakeUnits: 1, source: 'BetMGM', ...entry }} games={games}/></div>);
  // Preview marks are decorative; the expanded ticket retains the complete spoken matchups.
  const spokenMatchups = html => matchups(html).filter(matchup => matchup.name);
  it('a full single draws its game as marks, away first, read as one sentence', () => {
    const html = row({ kind: 'single', legs: [{ gameId: 'SEA-DEN', selection: 'DEN −3' }] });
    expect(markupProblems(html)).toEqual([]);
    expect(spokenMatchups(html)).toEqual([{ srcs: [teamMarks.SEA.src, teamMarks.DEN.src], name: 'Seattle Seahawks at Denver Broncos' }]);
    expect(html).not.toContain('SEA @ DEN');
  });
  it('a parlay draws one matchup per leg in leg order; a leg outside the week keeps its id as text', () => {
    const html = row({ kind: 'parlay', legs: [{ gameId: 'KC-LV' }, { gameId: 'SEA-DEN' }] });
    expect(spokenMatchups(html).map(m => m.srcs)).toEqual([[teamMarks.KC.src, teamMarks.LV.src], [teamMarks.SEA.src, teamMarks.DEN.src]]);
    expect(spokenMatchups(html).map(m=>m.name)).toEqual(['Kansas City Chiefs at Las Vegas Raiders','Seattle Seahawks at Denver Broncos']);
    const lost = row({ kind: 'single', legs: [{ gameId: 'NYJ-BUF', selection: 'Over 40' }] });
    expect(matchups(lost)).toEqual([]);
    expect(lost).toContain('NYJ-BUF');
  });
});
