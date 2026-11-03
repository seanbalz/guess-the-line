// D-69 step 1 (P6A): League as plain data (web/src/next/league/leagueModel.js). Each test names the contract it guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARD_FIRST, boardSlice, leagueLayer, leagueMode, leagueTile, lipIsBack, newPostIds, postArrivals } from '../web/src/next/league/leagueModel.js';

test('board first: no view, "board" or an unknown view is the board; a week needs History and a whole week number', () => {
  for (const view of [undefined, {}, { view: 'board', week: 8 }, { view: 'nope' }]) assert.deepEqual(leagueLayer(view), { layer: 'board', season: null, week: null });
  assert.equal(leagueLayer({ view: 'feed', week: 3 }).layer, 'feed');
  assert.deepEqual(leagueLayer({ view: 'history', season: 2025 }), { layer: 'history', season: 2025, week: null });
  assert.deepEqual(leagueLayer({ view: 'history', season: 2026, week: 8 }), { layer: 'week', season: 2026, week: 8 });
  for (const week of [0, -1, 1.5, '8', null]) assert.equal(leagueLayer({ view: 'history', week }).layer, 'history', String(week));
  assert.deepEqual(['total', 'guess_total', 'points', 'guess_points', 'spread', undefined].map(leagueMode),
    ['guess_total', 'guess_total', 'guess_points', 'guess_points', 'guess_spread', 'guess_spread']);
});
test('a lip is Back only when its layer is the place underneath (D-66), else a step', () => {
  const at = league => ({ tab: 'play', view: { section: 'league' }, adapters: { league } });
  assert.deepEqual([lipIsBack([at({})], 'board'), lipIsBack([at({ view: 'board' })], 'board'), lipIsBack([at({ view: 'history' })], 'board'),
    lipIsBack([at({ view: 'history', week: null })], 'history'), lipIsBack([{ tab: 'home', view: {} }], 'board'), lipIsBack([], 'board')], [true, true, false, true, false, false]);
});
test('the board shows its first rows with your row always in view; "N more" counts every other row (D-23)', () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ id: `u${i}`, you: i === 7 }));
  assert.deepEqual(boardSlice(rows).shown.map(r => r.id), ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u7']);
  assert.equal(boardSlice(rows).more, 2);
  assert.deepEqual(boardSlice(rows, true), { shown: rows, more: 0 });
  assert.equal(boardSlice(rows.slice(0, BOARD_FIRST)).more, 0);
  assert.equal(boardSlice(rows.map(r => ({ ...r, you: false }))).more, 3);
});
test('NEW posts are someone else\'s, newer than this device had shown; none on a device that has shown none', () => {
  const posts = [{ id: 'a', actorId: 'them', createdAt: '2026-11-02T10:00:00Z' }, { id: 'b', actorId: 'me', createdAt: '2026-11-02T09:00:00Z' },
    { id: 'c', actorId: 'them', createdAt: '2026-11-01T09:00:00Z' }];
  assert.deepEqual([...newPostIds(posts, 'me', '2026-11-01T12:00:00Z')], ['a']);
  assert.equal(newPostIds(posts, 'me', null).size, 0);
});
test('a post rises in only when a later read brings one newer than every post known; the first look and older pages never do', () => {
  const p = (id, hour) => ({ id, createdAt: `2026-11-02T${hour}:00:00Z` });
  const first = postArrivals(null, [p('a', '10'), p('b', '09')]);
  assert.equal(first.arrived.size, 0);
  const next = postArrivals(first.known, [p('c', '11'), p('a', '10'), p('b', '09')]);
  assert.deepEqual([...next.arrived], ['c']);
  assert.equal(postArrivals(next.known, [p('c', '11'), p('z', '01')]).arrived.size, 0);
});
test('the League tile: your Spread rank (never Total), the move this device saw, "New posts"; a group shows its players', () => {
  const data = { standings: [{ userId: 'them', mode: 'guess_spread', seasonPoints: 30, seasonScored: 4 }, { userId: 'me', mode: 'guess_spread', seasonPoints: 20, seasonScored: 4 },
    { userId: 'me', mode: 'guess_total', seasonPoints: 40, seasonScored: 4 }], posts: [{ id: 'a', actorId: 'them', createdAt: '2026-11-02T10:00:00Z' }] };
  assert.deepEqual(leagueTile({ data, viewer: 'me', stored: { rank: 4, from: null, n: 0 }, seen: '2026-11-01T00:00:00Z' }),
    { rank: 2, tied: false, big: '2nd', sub: '▲ 2 · New posts', tone: 'good', aria: 'League, 2nd on the Spread board, up 2, new posts' });
  const drop = leagueTile({ data, viewer: 'me', stored: { rank: 1, from: null, n: 0 }, seen: '2026-11-03T00:00:00Z' });
  assert.deepEqual([drop.sub, drop.tone], ['▼ 1', 'plain'], 'a drop carries its symbol and never the good tone');
  assert.equal(leagueTile({ data, viewer: 'me' }).sub, 'Spread board');
  assert.equal(leagueTile({ data: null, viewer: 'me' }).big, '—', 'loading or unranked is "—", never 0');
  assert.deepEqual(leagueTile({ community: false, players: 5 }), { rank: null, tied: false, big: '5', sub: 'Players', tone: 'plain', aria: 'League, 5 players' });
});
