// The League feed's view model and cards (redesign build plan stages 64 and 65), rendered statically from fixture posts.
// Contracts: folding never hides a post with reactions or comments and keeps a way to each post (D-23); the reactions
// row keeps yours in view and never shows more than three; a ballot post with every game withheld is a lock row with no
// number; a hidden shared result shows no guess or points; every emoji sits inside data-emoji-ok and every control has a
// name; Pacific times stay right across the Nov 1 change; the comment limit is 500. Fixture accounts only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), leagueApi: vi.fn(), date: value => String(value) }));
const model = await import('../web/src/next/feed/feedModel.js');
const { PostCard } = await import('../web/src/next/feed/PostCard.jsx');
const { DigestCard } = await import('../web/src/next/feed/DigestCard.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');

const ME = '00000000-0000-4000-8000-000000000001', AVERY = '00000000-0000-4000-8000-000000000002', BLAKE = '00000000-0000-4000-8000-000000000003', CASEY = '00000000-0000-4000-8000-000000000004';
const names = new Map([[ME, { id: ME, displayName: 'Luke Fixture' }], [AVERY, { id: AVERY, displayName: 'Avery Fixture' }], [BLAKE, { id: BLAKE, displayName: 'Blake Fixture' }], [CASEY, { id: CASEY, displayName: 'Casey Fixture' }]]);
let n = 0;
const post = (kind, patch = {}) => ({ id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, actorId: AVERY, kind, season: 2026, week: 8, mode: null, leagueId: null,
  createdAt: '2026-10-26T18:00:00Z', reactions: { counts: {}, total: 0, mine: null }, commentCount: 0, comments: [], embed: {}, ...patch });
const shell = { state: { views: {} }, go: vi.fn(), openSheet: vi.fn(), openPopover: vi.fn(), toast: vi.fn() };
const render = node => renderToStaticMarkup(<ShellContext.Provider value={shell}>{node}</ShellContext.Provider>).replace(/<!-- -->/g, '');
const card = p => render(<PostCard post={p} names={names} viewer={ME} now="2026-10-26T20:00:00Z" leagueId={null}/>);

describe('folding friends\' ballots (review D4)', () => {
  const ballot = (actorId, createdAt, patch = {}) => post('ballot_submitted', { actorId, createdAt, mode: 'guess_spread', embed: { picks: {}, hiddenGames: ['SEA-DEN'], late: null }, ...patch });
  it('folds friends\' ballots of one Pacific day, keeps yours and engaged ones apart, and keeps every post in the digest', () => {
    const a = ballot(AVERY, '2026-10-26T18:00:00Z'), b = ballot(BLAKE, '2026-10-26T17:00:00Z'), mine = ballot(ME, '2026-10-26T16:00:00Z');
    const liked = ballot(CASEY, '2026-10-26T15:00:00Z', { reactions: { counts: { fire: 1 }, total: 1, mine: null } });
    const commented = ballot(CASEY, '2026-10-26T14:00:00Z', { commentCount: 1 });
    const c = ballot(CASEY, '2026-10-26T13:00:00Z');
    const items = model.foldPosts([a, b, mine, liked, commented, c], ME);
    expect(items.map(item => item.type)).toEqual(['digest', 'post', 'post', 'post']);
    expect(items[0].posts.map(p => p.id)).toEqual([a.id, b.id, c.id]);
    expect(items.slice(1).map(item => item.post.id)).toEqual([mine.id, liked.id, commented.id]);
    // Every post is still reachable: the digest holds the folded ones, the rest are posts.
    const all = items.flatMap(item => (item.type === 'digest' ? item.posts : [item.post])).map(p => p.id).sort();
    expect(all).toEqual([a, b, mine, liked, commented, c].map(p => p.id).sort());
  });
  it('does not fold across Pacific days (evening PT is the next day in UTC) or a lone post', () => {
    const late = ballot(AVERY, '2026-10-27T06:30:00Z'), early = ballot(BLAKE, '2026-10-26T18:00:00Z');
    expect(model.ptDay(late.createdAt)).toBe('2026-10-26');
    expect(model.foldPosts([late, early], ME).map(item => item.type)).toEqual(['digest']);
    expect(model.foldPosts([ballot(AVERY, '2026-10-28T18:00:00Z'), early], ME).map(item => item.type)).toEqual(['post', 'post']);
  });
  it('draws a digest with every face and a "Show each post" button', () => {
    const html = render(<DigestCard posts={[ballot(AVERY, '2026-10-26T18:00:00Z'), ballot(BLAKE, '2026-10-26T17:00:00Z'), ballot(CASEY, '2026-10-26T16:00:00Z')]} names={names} viewer={ME} now="2026-10-26T20:00:00Z"/>);
    expect(html).toContain('Avery Fixture, Blake Fixture and Casey Fixture locked in picks');
    expect(html).toContain('Show each post (3)');
    expect(markupProblems(html)).toEqual([]);
  });
});

describe('reactions (D-35)', () => {
  it('shows at most three chips, most first, and always keeps yours', () => {
    const chips = model.reactionChips({ counts: { thumbs_up: 4, fire: 3, laughing: 2, clap: 1 }, total: 10, mine: 'clap' });
    expect(chips.map(c => [c.key, c.count, c.mine])).toEqual([['thumbs_up', 4, false], ['fire', 3, false], ['clap', 1, true]]);
    expect(chips[2].label).toBe('Clap, 1 reaction, you reacted');
  });
  it('one per person: a new reaction moves yours, taking it back removes it', () => {
    const before = { counts: { fire: 2, clap: 1 }, total: 3, mine: 'clap' };
    expect(model.withReaction(before, 'fire')).toEqual({ counts: { fire: 3 }, total: 3, mine: 'fire' });
    expect(model.withReaction(before, null)).toEqual({ counts: { fire: 2 }, total: 2, mine: null });
    expect(model.withReaction({ counts: {}, total: 0, mine: null }, 'bullseye')).toEqual({ counts: { bullseye: 1 }, total: 1, mine: 'bullseye' });
  });
  it('the reactions row keeps every glyph inside data-emoji-ok and names every control', () => {
    const html = card(post('joined', { reactions: { counts: { fire: 2, thumbs_up: 1 }, total: 3, mine: 'fire' }, commentCount: 2,
      comments: [{ id: CASEY, userId: BLAKE, body: 'Nice', createdAt: '2026-10-26T18:10:00Z' }] }));
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('aria-label="Fire, 2 reactions, you reacted"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Add a reaction"');
    expect(html).toContain('aria-label="2 comments. Open comments"');
    expect(html).toContain('View all 2');
  });
});

describe('post cards draw only what the server let through', () => {
  it('a ballot post with every game withheld is a lock row and no number', () => {
    const html = card(post('ballot_submitted', { mode: 'guess_spread', embed: { picks: {}, hiddenGames: ['KC-LV', 'SEA-DEN'], late: { minutes: 12, deadline: null } } }));
    expect(html).toContain('Avery Fixture');
    expect(html).toContain('locked in Week 8 Spread picks');
    expect(html).toContain('data-locked="true"');
    expect(html).toContain('Avery Fixture’s Spread picks, hidden.');
    expect(html).toContain('Late · 12 min');
    expect(html).not.toMatch(/\d+\.5/);
    expect(markupProblems(html)).toEqual([]);
  });
  it('an open ballot links to the picks and counts the games still hidden', () => {
    const html = card(post('ballot_submitted', { mode: 'guess_total', embed: { picks: { 'SEA-DEN': 41.5 }, hiddenGames: ['KC-LV'], late: null } }));
    expect(html).toContain('See Avery Fixture’s Total picks');
    expect(html).toContain('1 game hidden until you lock in or each game kicks off.');
  });
  it('a hidden shared result shows no guess or points; an open one shows both, and an exact one is a Bullseye', () => {
    const hidden = card(post('result_shared', { mode: 'guess_spread', embed: { gameId: 'SEA-DEN', visible: false } }));
    expect(hidden).toContain('shared a Spread result');
    expect(hidden).toContain('Lock in your Spread pick for SEA @ DEN to see this result.');
    expect(hidden).not.toMatch(/PTS/);
    const exact = card(post('result_shared', { mode: 'guess_spread', embed: { gameId: 'SEA-DEN', visible: true, pick: -2.5, points: 10 } }));
    expect(exact).toContain('hit a Bullseye');
    expect(exact).toContain('DEN −2.5 · 10 PTS'); // the stored spread is the home side's: −2.5 is DEN by 2.5
    expect(exact).toContain('Spread · SEA @ DEN · Exact');
  });
  it('a kickoff post leads with the Guess The Line mark, lists who is in per game and opens the game thread', () => {
    const html = card(post('kickoff', { actorId: CASEY, createdAt: '2026-10-23T00:15:00Z', embed: { kickoff: '2026-10-23T00:15:00Z', games: [{ gameId: 'SEA-DEN', in: [AVERY, BLAKE], bets: 3 }] }, commentCount: 4 }));
    expect(html).toContain('Thursday night kicked off');
    expect(html).not.toContain('Casey Fixture');
    expect(html).toContain('SEA @ DEN, 2 players in · 3 bets. Open the game');
    expect(html).toContain('Game thread · 4');
    expect(markupProblems(html)).toEqual([]);
  });
  it('every old kind renders (joined, week opened, ballot, real slips, Points) and an unknown kind still shows', () => {
    expect(card(post('joined'))).toContain('joined Guess The Line');
    expect(card(post('week_published', { embed: { games: 14, deadline: '2026-10-30T00:15:00Z' } }))).toContain('Week 8 is open');
    expect(card(post('week_published', { embed: { games: 14, deadline: '2026-10-30T00:15:00Z' } }))).toContain('14 games · picks due Thu 5:15 PM PT');
    for (const kind of ['bet_posted', 'bet_settled']) { const html = card(post(kind, { embed: { entryId: 'e1' } })); expect(html).toContain('Real slip'); expect(html).toContain('See real slips'); }
    expect(card(post('points_played'))).toContain('is playing Week 8 Points');
    expect(card(post('points_final', { embed: { winners: [{ userId: AVERY, points: 38.4 }], house: null, max: 50 } }))).toContain('38.4 pts · House — · FINAL');
    // A kind with no writer and no line yet still shows as a post (challenges are not built).
    expect(card(post('challenge_offered'))).toContain('posted an update');
  });
  it('the recap, season, badge and streak posts say what happened and open Badges and awards', () => {
    // The features job (M-25) posts a week's recap and the season's awards as that week's publisher: the card leads with
    // the Guess The Line mark, never the publisher's face or name.
    const recap = card(post('weekly_recap', { actorId: CASEY, week: 7 }));
    expect(recap).toContain('Week 7 awards are in');
    expect(recap).not.toContain('Casey Fixture');
    expect(recap).toContain('See the awards');
    const season = card(post('season_champion', { actorId: CASEY, week: null }));
    expect(season).toContain('2026 season awards are in');
    expect(season).not.toContain('Casey Fixture');
    const badge = card(post('badge_earned'));
    expect(badge).toContain('Avery Fixture');
    expect(badge).toContain('earned a Week 8 badge');
    expect(badge).toContain('See badges');
    expect(card(post('streak_milestone'))).toContain('hit a streak milestone');
    for (const kind of ['weekly_recap', 'season_champion', 'badge_earned', 'streak_milestone']) {
      const html = card(post(kind));
      expect(html, kind).not.toContain('posted an update');
      expect(markupProblems(html), kind).toEqual([]);
      expect(model.postLink(post(kind)), kind).toMatchObject({ tab: 'play', view: { section: 'features' } });
    }
    expect(model.postLink(post('bet_posted'))).toEqual({ text: 'See real slips', tab: 'bets', view: { section: 'tracked' } });
    expect(model.postLink(post('joined'))).toBeNull();
  });
});

describe('times, comments and the new-posts dot', () => {
  it('names kickoff slots in Pacific time across the Nov 1 change', () => {
    expect(model.kickoffSlot('2026-11-01T14:30:00Z', 1)).toBe('Sunday morning game'); // 6:30 AM PST after the change
    expect(model.kickoffSlot('2026-11-01T18:00:00Z', 6)).toBe('Sunday early games'); // 10:00 AM PST
    expect(model.kickoffSlot('2026-11-01T21:05:00Z', 3)).toBe('Sunday afternoon'); // 1:05 PM PST
    expect(model.kickoffSlot('2026-11-02T01:20:00Z', 1)).toBe('Sunday night'); // 5:20 PM PST
    expect(model.kickoffSlot('2026-11-03T01:15:00Z', 1)).toBe('Monday night');
    expect(model.kickoffSlot('2026-10-30T00:15:00Z', 1)).toBe('Thursday night'); // 5:15 PM PDT before the change
  });
  it('a comment is 1 to 500 characters after trimming; the counter shows from 450', () => {
    expect(model.commentDraft('   ').ok).toBe(false);
    expect(model.commentDraft('x').ok).toBe(true);
    expect(model.commentDraft('x'.repeat(500))).toEqual({ ok: true, counter: '500 of 500' });
    expect(model.commentDraft('x'.repeat(501)).ok).toBe(false);
    expect(model.commentDraft('x'.repeat(449)).counter).toBe('');
  });
  it('the dot shows for someone else\'s newer post on a device that has seen the feed, never for your own', () => {
    const posts = [post('joined', { actorId: ME, createdAt: '2026-10-26T19:00:00Z' }), post('joined', { createdAt: '2026-10-26T18:00:00Z' })];
    expect(model.hasNewPosts(posts, ME, '2026-10-26T17:00:00Z')).toBe(true);
    expect(model.hasNewPosts(posts, ME, '2026-10-26T18:00:00Z')).toBe(false);
    expect(model.hasNewPosts(posts, ME, null)).toBe(false);
    const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    model.writeSeen(model.seenKey(ME, null), '2026-10-26T18:00:00Z', storage);
    expect(model.readSeen(model.seenKey(ME, null), storage)).toBe('2026-10-26T18:00:00Z');
    expect(model.readSeen('x', { getItem: () => { throw new Error('blocked'); } })).toBe(null);
  });
});
