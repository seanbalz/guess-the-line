// D-69 step 1, Play › Badges and awards (Sean's P5A) and the landing's Badges tile, rendered with react-dom/server: each
// layer draws one job from the features read (stood in for), with its heading, lips and accessible names; NEW follows
// the moments engine (stood in for). Fixture people, badges and numbers only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { featuresModel } from '../web/src/next/features/model.js';

const state = vi.hoisted(() => ({ features: null, app: null, waiting: [], popped: new Set(), tile: null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn() }));
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => state.features }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useMomentScope: () => {}, usePopped: id => state.popped.has(id), useNewCount: () => state.waiting.length, useNewMoments: () => state.waiting,
}));
// Passes PlayTile through and keeps its props, so a test can press the tile (react-dom/server cannot click).
vi.mock('../web/src/next/play/PlayTile.jsx', async () => {
  const actual = await vi.importActual('../web/src/next/play/PlayTile.jsx');
  return { PlayTile: props => { state.tile = props; return actual.PlayTile(props); } };
});

const { ShellContext } = await import('../web/src/next/shell/context.js');
const { FeaturesScreen } = await import('../web/src/next/features/FeaturesScreen.jsx');
const { BadgesTile } = await import('../web/src/next/features/BadgesTile.jsx');

const YOU = 'u-casey', BLAKE = 'u-blake';
const NAMES = { [YOU]: 'Casey Moore', [BLAKE]: 'Blake Rivers' };
const badge = (userId, id, week, facts = {}) => ({ userId, badge: id, key: `${id}:${userId}:2026:${week}:${facts.gameId ?? ''}`, week, visibleAt: `2026-10-${10 + week}T01:00:00Z`, facts });
const REPLY = {
  leagueId: null, season: 2026, ran: true, seasonWinners: null,
  badges: [
    badge(YOU, 'bullseye', 6, { gameId: 'SEA-DEN', away: 'SEA', home: 'DEN', market: 'total', guess: 41 }),
    badge(YOU, 'bullseye', 7, { gameId: 'PIT-TB', away: 'PIT', home: 'TB', market: 'spread', guess: 3 }),
    badge(BLAKE, 'sharp', 7, { gameId: 'KC-LV', away: 'KC', home: 'LV', market: 'total', side: 'over', line: 44, kickoff: 45.5, by: 1.5 }),
  ],
  awards: [
    { week: 6, version: 1, createdAt: '2026-10-20T16:00:00Z', awards: [{ id: 'spread_winner', winners: [BLAKE], entries: [], value: { points: 21 } }] },
    { week: 7, version: 1, createdAt: '2026-10-27T16:00:00Z', awards: [
      { id: 'spread_winner', winners: [BLAKE], entries: [], value: { points: 24 } },
      { id: 'best_guess', winners: [YOU], entries: [], value: { error: 0, points: 10 } },
    ] },
  ],
  streaks: [{ userId: YOU, pick: { current: 4, best: 6 }, bets: { current: 1, best: 2 } }],
};
const read = (reply = REPLY, extra = {}) => ({ data: reply, loading: false, error: null, off: false, retry: vi.fn(), model: reply ? featuresModel(reply, { viewer: YOU, nameOf: id => NAMES[id] ?? 'Former member' }) : null, ...extra });
const shellAt = view => ({ go: vi.fn(), setView: vi.fn(), openSheet: vi.fn(), state: { views: { play: { section: 'features', ...view } } } });
// The words on screen, one space between elements.
const words = html => [...walk(parseMarkup(html))].filter(n => n.text !== undefined).map(n => n.text.trim()).filter(Boolean).join(' ');
const render = (node, shell = shellAt({})) => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>);
const setup = (features = read()) => {
  state.features = features;
  state.app = { accountId: YOU, league: { name: 'Community', community: true }, community: { data: { members: Object.entries(NAMES).map(([id, displayName]) => ({ id, displayName })) } } };
};
afterEach(() => { state.waiting = []; state.popped = new Set(); vi.clearAllMocks(); });

describe('Badges and awards: the first card', () => {
  it('two tiles, then the grid (earned first, the rest dashed), then the Season winners row; under the Play lip', () => {
    setup();
    const html = render(<FeaturesScreen/>);
    expect(markupProblems(html)).toEqual([]);
    expect(words(html)).toMatch(/^Back to Play Badges and awards/);
    expect(html).toContain('aria-label="Your streaks: Pick streak, 4 weeks"');
    expect(html).toContain('aria-label="Week 7 awards: you won Best guess"');
    expect(words(html)).toContain('1 of 9 earned');
    const order = [...html.matchAll(/data-badge="([a-z_]+)"/g)].map(m => m[1]);
    expect([order[0], order.length]).toEqual(['bullseye', 9]);
    expect(html).toContain('aria-label="Bullseye, Uncommon, earned 2 times"');
    expect(html).toContain('aria-label="Hot Hand, Rare, not earned yet. Win 5 bets in a row."');
    expect(words(html)).toContain('Uncommon · ×2');
    expect((html.match(/gx-badge--locked/g) ?? []).length).toBe(8);
    expect(words(html)).toContain('Season winners After Week 18');
    expect(html).not.toMatch(/>New<|>NEW</);
  });
  it('NEW marks the badge whose moment waits, and the streak tile while the streak moment waits', () => {
    setup();
    state.waiting = [{ id: 'score:bullseye:2026:7:guess_spread:PIT-TB', kind: 'badge', badge: 'bullseye', title: 'Bullseye' }, { id: 'streak:pick:2026:4:6', kind: 'streak', title: 'Pick streak' }];
    const html = render(<FeaturesScreen/>);
    expect(html).toContain('aria-label="Bullseye, Uncommon, earned 2 times, new"');
    // M3: the badge's pill and the streak tile's tag (PlayTile) are one NEW look with the text "NEW".
    expect((html.match(/>New<|>NEW</g) ?? []).length).toBe(2);
    expect(html.split('class="gx-pill gx-pill--accent gx-new">NEW</span>').length - 1).toBe(2);
  });
  it('F2: the streak and awards tiles with NEW say "new" (PlayTile adds it to their wording)', () => {
    setup();
    state.waiting = [{ id: 'streak:pick:2026:4:6', kind: 'streak', title: 'Pick streak' }, { id: 'award:2026:7:best_guess', kind: 'award', title: 'Best guess' }];
    const html = render(<FeaturesScreen/>);
    expect(html).toContain('aria-label="Your streaks: Pick streak, 4 weeks, new"');
    expect(html).toContain('aria-label="Week 7 awards: you won Best guess, new"');
    expect(html).not.toMatch(/new, new/i);
  });
  it('before the job has run: no awards number and one plain line; loading is a Skeleton; off is "coming soon"', () => {
    setup(read({ ...REPLY, badges: [], awards: [], streaks: [] }));
    const html = render(<FeaturesScreen/>);
    expect(html).toContain('aria-label="Weekly awards, posted once the week is final"');
    expect(words(html)).toContain('No badges yet. Your first one is a guess away.');
    expect(words(html)).not.toMatch(/Sunday Crew|Office Pool|Marcus|Priya|Jules|Kenny|\bDre\b|sample/i);
    setup(read(null, { loading: true }));
    expect(render(<FeaturesScreen/>)).toContain('Loading badges and awards…');
    setup(read(null, { error: { status: 404 }, off: true }));
    expect(words(render(<FeaturesScreen/>))).toContain('Badges and awards are coming soon.');
  });
});

describe('Badges and awards: the layers', () => {
  it('the Pick streak pops where it is on screen (the tile, the layer) and only while the moments hook says so: a remount after the pop stays still', () => {
    setup();
    // usePopped is true only when the pop happens while the element is mounted (Task 1), so a remount reads false.
    expect(render(<FeaturesScreen/>)).not.toContain('data-moment');
    expect(render(<FeaturesScreen/>, shellAt({ layer: 'streaks' }))).not.toContain('data-moment');
    state.popped = new Set(['streak:pick:2026:4:6']);
    expect(render(<FeaturesScreen/>)).toContain('data-features="streaks-tile" data-moment="pop"');
    expect(render(<FeaturesScreen/>, shellAt({ layer: 'streaks' }))).toContain('data-streak="pick" data-moment="pop"');
  });
  it('streaks: both streaks with their meter and best, under the Play and Badges and awards lips', () => {
    setup();
    const html = render(<FeaturesScreen/>, shellAt({ layer: 'streaks' }));
    expect(markupProblems(html)).toEqual([]);
    expect(words(html)).toMatch(/^Back to Play Back to Badges and awards Your streaks/);
    expect(html).toContain('aria-label="Pick streak, 4 weeks"');
    expect(html).toContain('aria-label="Bets streak, 1 win"');
    expect(words(html)).toContain('Weeks you sent both ballots · Best 6');
  });
  it('awards: the newest week, then the earlier weeks behind one disclosure; season: decided after Week 18', () => {
    setup();
    const awards = render(<FeaturesScreen/>, shellAt({ layer: 'awards' }));
    expect(markupProblems(awards)).toEqual([]);
    expect(words(awards)).toContain('Week 7 awards');
    expect(words(awards)).toContain('Earlier weeks Week 6');
    expect(words(render(<FeaturesScreen/>, shellAt({ layer: 'season' })))).toContain('Decided after Week 18.');
  });
  it('a badge: the 96 tile, rarity, rule, how often and when; another member\'s names them; unknown is the first card', () => {
    setup();
    const mine = render(<FeaturesScreen/>, shellAt({ layer: 'badge', item: 'bullseye' }));
    expect(markupProblems(mine)).toEqual([]);
    expect(mine).toContain('gx-badge--96');
    expect(words(mine)).toContain('Uncommon Guess a line exactly (10 points). Earned 2 times');
    expect(mine).toContain('aria-label="When Bullseye was earned"');
    expect(words(render(<FeaturesScreen/>, shellAt({ layer: 'badge', item: `sharp@${BLAKE}` })))).toContain('Blake Rivers: earned once');
    expect(words(render(<FeaturesScreen/>, shellAt({ layer: 'badge', item: 'hot_hand' })))).toContain('Not earned yet');
    expect(render(<FeaturesScreen/>, shellAt({ layer: 'badge', item: 'nope' }))).toContain('data-features-layer="top"');
  });
  it('a badge of a member who is not on the roster the board shows falls back to the grid and shows no badge for a stranger', () => {
    setup();
    for (const item of ['sharp@u-stranger', 'bullseye@u-stranger', `sharp@${'x'.repeat(5)}`]) {
      const html = render(<FeaturesScreen/>, shellAt({ layer: 'badge', item }));
      expect(html).toContain('data-features-layer="top"');
      expect(html).not.toContain('data-features="badge"');
      expect(words(html)).not.toMatch(/earned once|Former member/);
    }
    // The viewer themself, and a member on the roster, still open.
    expect(render(<FeaturesScreen/>, shellAt({ layer: 'badge', item: `bullseye@${YOU}` }))).toContain('data-features-layer="badge"');
    expect(render(<FeaturesScreen/>, shellAt({ layer: 'badge', item: `sharp@${BLAKE}` }))).toContain('data-features-layer="badge"');
    // Before the roster has loaded nobody else is known, so a link to another member's badge shows the grid too.
    state.app = { ...state.app, community: { data: null } };
    expect(render(<FeaturesScreen/>, shellAt({ layer: 'badge', item: `sharp@${BLAKE}` }))).toContain('data-features-layer="top"');
  });
  it('every number is written with a real space before its word, in the words and the accessible names', () => {
    setup();
    const pages = [{}, { layer: 'streaks' }, { layer: 'awards' }, { layer: 'badge', item: 'bullseye' }].map(view => render(<FeaturesScreen/>, shellAt(view)));
    const spoken = pages.flatMap(html => [words(html), ...[...html.matchAll(/aria-label="([^"]*)"/g)].map(m => m[1])]).join(' | ');
    expect(spoken).not.toMatch(/\d[A-Za-z]|\u00a0/);
    expect(spoken).toContain('Pick streak, 4 weeks');
    expect(spoken).toContain('earned 2 times');
  });
});

describe('the Play landing Badges tile', () => {
  it('the earned count; "New: <name>" and NEW while a badge waits; NEW alone for a streak; a dash before the read answers', () => {
    setup();
    const plain = render(<BadgesTile/>);
    expect(plain).toContain('aria-label="Badges, 1 earned"');
    expect(words(plain)).not.toMatch(/\bNEW\b/);
    state.waiting = [{ id: 'badge:x', kind: 'badge', badge: 'bullseye', title: 'Bullseye' }];
    const fresh = render(<BadgesTile/>);
    expect(fresh).toContain('aria-label="Badges, 1 earned, new: Bullseye"');
    expect(words(fresh)).toContain('New: Bullseye');
    expect(words(fresh)).toMatch(/\bNEW\b/);
    state.waiting = [{ id: 'streak:pick:2026:4:6', kind: 'streak', title: 'Pick streak' }];
    const streak = render(<BadgesTile/>);
    expect(streak).toContain('aria-label="Badges, 1 earned, new"');
    expect(words(streak)).toMatch(/\bNEW\b/);
    // With nothing waiting (a tile that shows NEW says "new", PlayTile's F2 rule).
    state.waiting = [];
    setup(read(null, { loading: true }));
    expect(words(render(<BadgesTile/>))).toContain('—');
    setup(read(null, { off: true }));
    expect(render(<BadgesTile/>)).toContain('aria-label="Badges, coming soon"');
  });
  it('the default onOpen opens the first card of Badges and awards', () => {
    setup();
    const shell = shellAt({});
    render(<BadgesTile/>, shell);
    state.tile.onClick();
    expect(shell.go).toHaveBeenCalledWith('play', { section: 'features', layer: undefined, item: undefined });
  });
});
