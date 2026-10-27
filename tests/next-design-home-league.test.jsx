// Design lane ("game feel" and the Home and League pass), rendered with vitest + react-dom/server: the count-up's
// timing tokens and resting markup, Home's awards chips and Pick streak, the League board's weight (faces, the leader,
// week badges, the race strip, the empty state) and the recap post. The features read is stood in for, so nothing here
// reaches the network; the counting, the toast and the arrow run in a real browser in
// tests/cloud-browser/next-design-home-league.spec.js. Fixture people and points only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import tokens from '../design/tokens-next.json';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { featuresModel } from '../web/src/next/features/model.js';

const state = vi.hoisted(() => ({ features: { model: null } }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn() }));
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => state.features }));

const { ShellContext } = await import('../web/src/next/shell/context.js');
const { CountUp } = await import('../web/src/next/home/CountUp.jsx');
const { COUNT_UP_TOKENS, bezierEasing, countUpTiming, parseBezier } = await import('../web/src/next/home/countUp.js');
const { HomeAwards } = await import('../web/src/next/features/HomeAwards.jsx');
const { HomeStreak } = await import('../web/src/next/features/HomeStreak.jsx');
const { RecapPost, RECAP_POST_ROWS } = await import('../web/src/next/features/RecapPost.jsx');
const { CommunityBoard, communityRows, leadLine, raceItems } = await import('../web/src/next/league/LeagueBoard.jsx');

const YOU = 'u-casey', BLAKE = 'u-blake', AVERY = 'u-avery', DREW = 'u-drew';
const NAMES = { [YOU]: 'Casey Moore', [BLAKE]: 'Blake Rivers', [AVERY]: 'Avery Stone', [DREW]: 'Drew Lane' };
const shell = { go: vi.fn(), openSheet: vi.fn(), toast: vi.fn(), state: { views: {} } };
const render = node => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>);
const nodes = (root, test) => [...walk(typeof root === 'string' ? parseMarkup(root) : root)].filter(n => n.tag && test(n));
const attr = (name, value) => n => n.attrs[name] === value;
const hasClass = cls => n => (n.attrs.class ?? '').split(/\s+/).includes(cls);
const textOf = n => [...walk(n)].filter(x => x.text !== undefined).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
const shown = n => {
  const hiddenText = x => { for (let a = x.parent; a; a = a.parent) if (a.attrs && (hasClass('gx-sr-only')(a))) return true; return false; };
  return [...walk(n)].filter(x => x.text !== undefined && !hiddenText(x)).map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
};

const badge = (userId, id, week, facts = {}) => ({ userId, badge: id, key: `${id}:${userId}:${week}:${facts.gameId ?? ''}`, week, visibleAt: `2026-10-${10 + week}T01:00:00Z`, facts });
const REPLY = {
  leagueId: null, season: 2026, ran: true,
  badges: [
    badge(YOU, 'bullseye', 6, { gameId: 'SEA-DEN', away: 'SEA', home: 'DEN', market: 'total', guess: 41 }),
    badge(YOU, 'bullseye', 7, { gameId: 'PIT-TB', away: 'PIT', home: 'TB', market: 'spread', guess: 3 }),
    badge(YOU, 'bullseye', 7, { gameId: 'KC-LV', away: 'KC', home: 'LV', market: 'total', guess: 44 }),
    badge(YOU, 'dialed_in', 7, { market: 'spread', points: 20, full: 20 }),
    badge(BLAKE, 'sharp', 7, { gameId: 'KC-LV', away: 'KC', home: 'LV', market: 'total', side: 'over', line: 44, kickoff: 45.5, by: 1.5 }),
  ],
  awards: [{ week: 7, version: 1, createdAt: '2026-10-27T16:00:00Z', awards: [
    { id: 'spread_winner', winners: [BLAKE], entries: [], value: { points: 24 } },
    { id: 'total_winner', winners: [YOU], entries: [], value: { points: 18 } },
    { id: 'best_guess', winners: [YOU, AVERY], entries: [], value: { error: 0, points: 10 } },
    { id: 'sharpest_bet', winners: [BLAKE], entries: [], value: { by: 1.5 } },
    { id: 'worst_beat', winners: [DREW], entries: [], value: { lostBy: 0.5 } },
  ] }],
  seasonWinners: null,
  streaks: [{ userId: YOU, pick: { current: 4, best: 6 }, bets: { current: 0, best: 2 } }],
};
const model = (reply = REPLY) => featuresModel(reply, { viewer: YOU, nameOf: id => NAMES[id] ?? 'Former member' });

afterEach(() => { state.features = { model: null }; vi.clearAllMocks(); });

describe('CountUp', () => {
  it('times its count with the brand tokens: the big duration (the 600 ms cap for count-ups) and the enter easing', () => {
    // CountUp reads the two custom properties tokens.css defines from tokens-next.json (`--gx-<group>-<key>`).
    expect(COUNT_UP_TOKENS).toEqual({ duration: '--gx-dur-big', ease: '--gx-ease-enter' });
    const css = { '--gx-dur-big': ` ${tokens.dur.big}`, '--gx-ease-enter': ` ${tokens.ease.enter}` };
    const timing = countUpTiming(name => css[name]);
    expect(timing.ms).toBe(Number.parseFloat(tokens.dur.big));
    expect(timing.ms).toBeLessThanOrEqual(600);
    const enter = bezierEasing(parseBezier(tokens.ease.enter));
    for (const p of [0.1, 0.25, 0.5, 0.9]) expect(timing.ease(p)).toBeCloseTo(enter(p), 6);
  });

  it('at rest it is one text node holding exactly the server value, in tabular figures; nothing sent reads "—"', () => {
    for (const [value, text] of [[20, '20'], [46.5, '46.5'], [-3, '−3'], [null, '—'], [Number.NaN, '—']]) {
      const html = render(<CountUp value={value} account={YOU} figure="community.guess_spread.season.x"/>);
      expect(markupProblems(html)).toEqual([]);
      const el = nodes(html, hasClass('gx-countup'))[0];
      expect(el.attrs['data-count']).toBe('rest');
      expect(el.children).toEqual([expect.objectContaining({ text })]);
    }
  });
});

describe('Home: the recap as award chips and the Pick streak', () => {
  it('draws nothing before the features read has a recap (loading, off, failed, or no week posted)', () => {
    state.features = { model: null };
    expect(render(<HomeAwards app={{ accountId: YOU }}/>)).toBe('<div class="gx"></div>');
    state.features = { model: model({ ...REPLY, awards: [] }) };
    expect(render(<HomeAwards app={{ accountId: YOU }}/>)).toBe('<div class="gx"></div>');
  });

  it('one toggle chip per award in a named rail, your own award open first with its winners and value', () => {
    state.features = { model: model() };
    const html = render(<HomeAwards app={{ accountId: YOU }}/>);
    expect(markupProblems(html)).toEqual([]);
    const card = nodes(html, attr('data-home', 'awards'))[0];
    expect(textOf(nodes(card, n => n.tag === 'h2')[0])).toBe('Week 7 awards');
    expect(shown(card)).toContain('You won Total winner');
    const rail = nodes(card, attr('role', 'group'))[0];
    expect(rail.attrs['aria-label']).toBe('Week 7 awards');
    const chips = nodes(rail, n => n.tag === 'button');
    expect(chips.map(textOf)).toEqual(['Spread winner', 'Total winner', 'Best guess', 'Sharpest bet', 'Worst beat']);
    expect(chips.map(c => c.attrs['aria-pressed'])).toEqual(['false', 'true', 'false', 'false', 'false']);
    const open = nodes(card, attr('data-award', 'total_winner'))[0];
    expect(shown(open)).toBe('Total winner CM You · 18 PTS'); // CM: the winner's face, beside the words
    expect(nodes(card, n => n.tag === 'button' && !rail.children.includes(n)).map(textOf)).toContain('All badges and awards');
  });

  it('without an award of your own, the first award is open', () => {
    state.features = { model: featuresModel(REPLY, { viewer: 'u-nobody', nameOf: id => NAMES[id] }) };
    const card = nodes(render(<HomeAwards app={{ accountId: 'u-nobody' }}/>), attr('data-home', 'awards'))[0];
    expect(nodes(card, attr('aria-pressed', 'true')).map(textOf)).toEqual(['Spread winner']);
    expect(shown(card)).not.toContain('You won');
  });

  it('the Pick streak: a flame and "4-week pick streak"; nothing at 0 or while the read is not there', () => {
    state.features = { model: model() };
    const html = render(<HomeStreak app={{ accountId: YOU }}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(textOf(nodes(html, attr('data-home', 'streak'))[0])).toBe('4-week pick streak');
    state.features = { model: featuresModel({ ...REPLY, streaks: [{ userId: YOU, pick: { current: 0, best: 6 }, bets: { current: 0, best: 0 } }] }, { viewer: YOU }) };
    expect(render(<HomeStreak app={{ accountId: YOU }}/>)).toBe('<div class="gx"></div>');
    state.features = { model: null };
    expect(render(<HomeStreak app={{ accountId: YOU }}/>)).toBe('<div class="gx"></div>');
  });
});

describe('the League board', () => {
  const row = (userId, mode, seasonPoints, extra = {}) => ({ userId, mode, weekPoints: 4, weekScored: 2, seasonPoints, seasonScored: 6, weeksSubmitted: 3, satOut: false, ...extra });
  const feed = (standings, members = Object.keys(NAMES)) => ({ viewer: YOU, week: { season: 2026, week: 8 }, members: members.map(id => ({ id, displayName: NAMES[id], removed: false })), standings });
  const board = (f, features = model()) => render(<CommunityBoard feed={f} mode="guess_spread" features={features} app={{ accountId: YOU }} shell={shell}/>);

  it('every row leads with a 40px face; the leader wears a Leader pill and the lead in words, and your row is yours', () => {
    const html = board(feed([row(BLAKE, 'guess_spread', 24), row(YOU, 'guess_spread', 21.5), row(AVERY, 'guess_spread', 12)]));
    expect(markupProblems(html)).toEqual([]);
    const rows = nodes(html, n => n.attrs['data-board-row']);
    expect(rows.map(r => r.attrs['data-board-row'])).toEqual([BLAKE, YOU, AVERY, DREW]);
    for (const r of rows) expect(nodes(r, hasClass('gx-av--40'))).toHaveLength(1);
    const lead = rows[0];
    expect(lead.attrs['data-leader']).toBe('true');
    expect(lead.attrs.class).toContain('gx-l-row--lead');
    expect(nodes(lead, hasClass('gx-pill')).map(textOf)).toEqual(['Leader']);
    expect(shown(lead)).toContain('Leads by 2.5');
    expect(rows.slice(1).every(r => r.attrs['data-leader'] === undefined)).toBe(true);
    expect(rows[1].attrs.class).toContain('gx-row--you');
    expect(shown(rows[1])).toContain('Casey Moore · You');
    // The season total is the server's number, in the count-up's resting form; no ballot stays "—", never 0.
    expect(nodes(rows[1], hasClass('gx-countup')).map(textOf)).toEqual(['21.5']);
    expect(shown(rows[3])).toContain('Season: —');
    expect(nodes(rows[3], hasClass('gx-countup'))).toHaveLength(0);
  });

  it('a shared first place reads "Tied for the lead" on each leader', () => {
    const rows = communityRows(feed([row(BLAKE, 'guess_spread', 20), row(YOU, 'guess_spread', 20), row(AVERY, 'guess_spread', 12)]), 'guess_spread');
    expect(rows.filter(r => r.rank === 1).map(r => leadLine(rows, r))).toEqual(['Tied for the lead', 'Tied for the lead']);
    expect(leadLine(rows, rows.find(r => r.id === AVERY))).toBeNull();
  });

  it('rows show the newest badge week\'s badges as 44px buttons (rarest first) that open the detail for that player; "+N" past four', () => {
    const html = board(feed([row(BLAKE, 'guess_spread', 24), row(YOU, 'guess_spread', 21.5)]));
    expect(markupProblems(html)).toEqual([]);
    const mine = nodes(html, attr('data-board-row', YOU))[0];
    const group = nodes(mine, attr('data-badges', 'week'))[0];
    expect(group.attrs.role).toBe('group');
    expect(group.attrs['aria-label']).toBe('Your Week 7 badges');
    expect(shown(group)).toBe('Week 7 ×2'); // the week, the tiles, and the count of the Bullseye earned twice
    const buttons = nodes(group, n => n.tag === 'button');
    expect(buttons.map(b => b.attrs['aria-label'])).toEqual(['Dialed In, Week 7', 'Bullseye, 2 times, Week 7']); // Dialed In is rare, Bullseye uncommon
    expect(buttons.map(b => b.attrs['data-badge'])).toEqual(['dialed_in', 'bullseye']);
    const blake = nodes(html, attr('data-board-row', BLAKE))[0];
    expect(nodes(blake, attr('data-badges', 'week'))[0].attrs['aria-label']).toBe('Blake Rivers’s Week 7 badges');
    expect(nodes(blake, n => n.tag === 'button').map(b => b.attrs['aria-label'])).toEqual(['Sharp, Week 7']);
    // Avery earned nothing (and the Week 6 Bullseye is not the newest week): no badge line at all.
    const avery = nodes(html, attr('data-board-row', AVERY))[0];
    expect(nodes(avery, attr('data-badges', 'week'))).toHaveLength(0);
    // Five kinds: four buttons, then "+1" with its words for a screen reader.
    const more = model({ ...REPLY, badges: [...REPLY.badges, badge(YOU, 'dog_day', 7, { gameId: 'PIT-TB', away: 'PIT', home: 'TB', side: 'away', line: 3 }),
      badge(YOU, 'double_bullseye', 7, { gameId: 'PIT-TB', away: 'PIT', home: 'TB', spread: 3, total: 44.5 }), badge(YOU, 'perfect_week', 7, { wins: 3 })] });
    const five = nodes(nodes(board(feed([row(YOU, 'guess_spread', 21.5)]), more), attr('data-board-row', YOU))[0], attr('data-badges', 'week'))[0];
    expect(nodes(five, n => n.tag === 'button')).toHaveLength(4);
    expect(shown(five).endsWith('+1')).toBe(true);
    expect(textOf(nodes(five, hasClass('gx-sr-only')).at(-1))).toBe('and 1 more');
  });

  it('the race strip pictures every ranked total along the axis and names them in words; fewer than two, no strip', () => {
    const html = board(feed([row(BLAKE, 'guess_spread', 24), row(YOU, 'guess_spread', 21.5), row(AVERY, 'guess_spread', 12)]));
    const strip = nodes(html, attr('role', 'img')).find(n => hasClass('gx-strip')(n));
    expect(strip.attrs['aria-label']).toBe('Spread season points: Blake Rivers 24, You 21.5, Avery Stone 12');
    const race = raceItems(communityRows(feed([row(BLAKE, 'guess_spread', 24), row(YOU, 'guess_spread', 21.5), row(AVERY, 'guess_spread', 12)]), 'guess_spread'));
    expect(race.items.map(i => Math.round(i.pct))).toEqual([100, 79, 0]);
    expect(nodes(board(feed([row(YOU, 'guess_spread', 21.5)])), hasClass('gx-strip'))).toHaveLength(0);
  });

  it('an empty board is one sentence and one action, not an empty card', () => {
    const html = board({ viewer: YOU, week: null, members: [], standings: [] });
    expect(markupProblems(html)).toEqual([]);
    const empty = nodes(html, attr('data-league-state', 'empty'))[0];
    expect(shown(empty)).toBe('No members yet. Invite friends');
    expect(nodes(html, attr('role', 'list'))).toHaveLength(0);
  });
});

describe('the recap post', () => {
  it('a card at the top of the feed: the week, how many awards, yours first, at most four rows, and the way to all', () => {
    const html = render(<RecapPost model={model()}/>);
    expect(markupProblems(html)).toEqual([]);
    const post = nodes(html, attr('data-feed', 'recap'))[0];
    expect(post.tag).toBe('article');
    expect(textOf(nodes(post, n => n.tag === 'h2')[0])).toBe('Week 7 recap');
    expect(shown(post)).toContain('5 awards in · You won Total winner');
    const rows = nodes(nodes(post, attr('role', 'list'))[0], n => n.tag === 'li');
    expect(rows).toHaveLength(RECAP_POST_ROWS);
    expect(rows.map(r => shown(r).split(' ')[0] + ' ' + shown(r).split(' ')[1])).toEqual(['Total winner', 'Best guess', 'Spread winner', 'Sharpest bet']);
    expect(nodes(post, n => n.tag === 'button').map(textOf)).toEqual(['All badges and awards']);
    expect(render(<RecapPost model={null}/>)).toBe('<div class="gx"></div>');
  });
});
