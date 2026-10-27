import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../web/src/next/features/model.js';
import { BADGE_ICONS, AWARD_ICONS } from '../web/src/next/features/icons.js';
import { BADGES, LIVE_BADGES } from '../shared/game-features/catalog.mjs';

// Redesign build plan stage 71: the badges, streaks and awards screen model (web/src/next/features/model.js) over the
// POST /league/features reply. Fixture accounts and numbers only; no sample data from the prototype.
const YOU = 'u-you', ANA = 'u-ana', BO = 'u-bo';
const names = { [YOU]: 'Casey', [ANA]: 'Ana', [BO]: 'Bo' };
const nameOf = id => names[id] ?? 'Former member';
const badge = (userId, id, week, facts, visibleAt = '2026-10-20T01:00:00Z', key = `${id}:${userId}:2026:${week}:${facts.gameId ?? facts.market ?? ''}`) => ({ userId, badge: id, key, week, visibleAt, facts });
const REPLY = {
  leagueId: null, season: 2026, ran: true,
  badges: [
    badge(YOU, 'bullseye', 6, { gameId: 'SEA-DEN', away: 'SEA', home: 'DEN', market: 'total', guess: 41 }, '2026-10-16T00:15:00Z'),
    badge(YOU, 'bullseye', 7, { gameId: 'PIT-TB', away: 'PIT', home: 'TB', market: 'spread', guess: 3 }, '2026-10-25T17:00:00Z'),
    badge(YOU, 'double_bullseye', 7, { gameId: 'PIT-TB', away: 'PIT', home: 'TB', spread: 3, total: 44.5 }),
    badge(ANA, 'sharp', 7, { gameId: 'KC-LV', away: 'KC', home: 'LV', market: 'total', side: 'over', line: 44, kickoff: 45.5, by: 1.5 }),
  ],
  awards: [
    { week: 6, version: 1, createdAt: '2026-10-20T16:00:00Z', awards: [{ id: 'spread_winner', winners: [ANA], entries: [{ userId: ANA }], value: { points: 104 } }] },
    { week: 7, version: 2, createdAt: '2026-10-27T16:00:00Z', awards: [
      { id: 'spread_winner', winners: [YOU, ANA], entries: [], value: { points: 112.5 } },
      { id: 'bets_winner', winners: [BO], entries: [], value: { roi: 0.527, net: 2.64, wins: 4, losses: 1, pushes: 0 } },
      { id: 'best_guess', winners: [YOU], entries: [], value: { error: 0, points: 10 } },
      { id: 'sharpest_bet', winners: [ANA], entries: [], value: { by: 1 } },
      { id: 'saw_it_coming', winners: [BO], entries: [], value: { moved: 1.5 } },
      { id: 'worst_beat', winners: [BO], entries: [], value: { lostBy: 0.5 } },
    ] },
  ],
  seasonWinners: null,
  streaks: [{ userId: YOU, pick: { current: 4, best: 6 }, bets: { current: 2, best: 3 } }],
};

test('no reply, or a run that has not happened: no recap, no sample, and a shelf of live badges to earn', () => {
  const empty = M.featuresModel({ leagueId: null, season: 2026, ran: false, badges: [], awards: [], seasonWinners: null, streaks: [] }, { viewer: YOU, nameOf });
  assert.equal(empty.recap, null, 'no recap card before the job has run');
  assert.deepEqual(empty.shelf.earned, []);
  assert.deepEqual(empty.shelf.toEarn.map(b => b.id), [...LIVE_BADGES], 'only badges that can be earned today');
  assert.deepEqual(empty.streaks, [{ id: 'pick', name: 'Pick streak', unit: 'weeks', current: 0, best: 0 }, { id: 'bets', name: 'Bets streak', unit: 'wins', current: 0, best: 0 }]);
  assert.equal(M.featuresModel(null, { viewer: YOU }).ok, false);
});

test('the recap is the newest week with awards; each value is in words; ties name everyone; the viewer is "You"', () => {
  const model = M.featuresModel(REPLY, { viewer: YOU, nameOf });
  assert.equal(model.recap.week, 7);
  assert.deepEqual(model.recap.rows.map(r => [r.name, r.who, r.value]), [
    ['Spread winner', 'You and Ana', '112.5 PTS'],
    ['Bets winner', 'Bo', '52.7% return · +2.64U · 4–1–0'],
    ['Best guess', 'You', 'Exact · 10 PTS'],
    ['Sharpest bet', 'Ana', '1 pt better than the kickoff line'],
    ['Saw it coming', 'Bo', 'Line moved 1.5 toward the guess'],
    ['Worst beat', 'Bo', 'Lost by 0.5'],
  ]);
  assert.equal(model.recap.mine.name, 'Spread winner', 'your first award there');
  assert.deepEqual(model.recap.rows[0].people, [{ id: YOU, name: 'Casey', you: true }, { id: ANA, name: 'Ana', you: false }]);
  assert.deepEqual(model.history.map(w => w.week), [6]);
  assert.equal(M.boardFact(model, YOU, 'guess_spread'), 'Won Week 7');
  assert.equal(M.boardFact(model, YOU, 'guess_total'), null, 'the Total board has its own winner');
  assert.equal(M.boardFact(model, BO, 'guess_spread'), null);
});

test('the shelf: earned badges rarest first with counts and dated lines; the rest to earn', () => {
  const model = M.featuresModel(REPLY, { viewer: YOU, nameOf });
  assert.deepEqual(model.shelf.earned.map(b => [b.name, b.rarityLabel, b.count]), [['Double Bullseye', 'Epic', 1], ['Bullseye', 'Uncommon', 2]]);
  assert.deepEqual(model.shelf.earned[1].lines, ['Week 7 · PIT @ TB · Spread PIT −3 exact', 'Week 6 · SEA @ DEN · Total 41 exact'], 'newest first; a home line of +3 reads as the away favorite');
  assert.equal(model.shelf.toEarn.length, LIVE_BADGES.length - 2);
  assert.equal(model.shelf.of, LIVE_BADGES.length);
  assert.deepEqual(model.badgesOf(ANA).map(b => [b.id, b.lines]), [['sharp', ['Week 7 · KC @ LV · Over 44 vs 45.5 at kickoff']]]);
  assert.deepEqual(model.streaks.map(s => [s.name, s.current, s.best]), [['Pick streak', 4, 6], ['Bets streak', 2, 3]]);
  assert.equal(M.earnedText(1), 'Earned once'); assert.equal(M.earnedText(3), 'Earned 3 times'); assert.equal(M.earnedText(0), 'Not earned yet');
});

test('celebrations: only what is new since the session\'s last read, only the viewer\'s, never on the first read', () => {
  const before = { ...REPLY, badges: REPLY.badges.slice(0, 1), awards: REPLY.awards.slice(0, 1) };
  const items = M.newCelebrations(before, REPLY, YOU);
  assert.deepEqual(items.map(i => [i.kind, i.title]), [['badge', 'Double Bullseye'], ['badge', 'Bullseye'], ['award', 'Spread winner'], ['award', 'Best guess']], 'badges oldest first, then awards');
  assert.ok(items.every(i => typeof i.icon === 'string' && i.icon.length > 10));
  assert.ok(!items.some(i => i.title === 'Sharp'), 'another player\'s badge is not your celebration');
  assert.deepEqual(M.newCelebrations(REPLY, REPLY, YOU), [], 'nothing new');
  assert.deepEqual(M.newCelebrations(null, REPLY, YOU), [], 'the first read sets the baseline');
});

test('every badge and award has an original one-path icon; no emoji, logos or sample names in the feature screens', () => {
  for (const b of BADGES) assert.match(BADGE_ICONS[b.id], /^M[\d.\s a-zA-Z-]+$/, b.id);
  for (const id of ['spread_winner', 'total_winner', 'bets_winner', 'best_guess', 'sharpest_bet', 'saw_it_coming', 'worst_beat']) assert.ok(AWARD_ICONS[id], id);
  const dir = new URL('../web/src/next/features/', import.meta.url);
  for (const file of fs.readdirSync(dir)) {
    const text = fs.readFileSync(new URL(file, dir), 'utf8');
    assert.doesNotMatch(text, /\p{Extended_Pictographic}/u, `${file}: no emoji`);
    assert.doesNotMatch(text, /Sunday Crew|Office Pool|Marcus|Priya|Jules|Kenny|\bDre\b/, `${file}: no prototype sample names`);
  }
});

// Design lane, League pass: board rows show the badges of the newest week anyone earned one, labelled with that week.
test('the newest badge week and each member\'s badges in it, grouped and rarest first; none before any badge', () => {
  const model = M.featuresModel(REPLY, { viewer: YOU, nameOf });
  assert.equal(model.badgeWeek, 7);
  assert.deepEqual(model.weekBadgesOf(YOU).map(b => [b.id, b.count]), [['double_bullseye', 1], ['bullseye', 1]], 'the Week 6 Bullseye is not this week\'s');
  assert.deepEqual(model.weekBadgesOf(ANA).map(b => b.id), ['sharp']);
  assert.deepEqual(model.weekBadgesOf(BO), []);
  const empty = M.featuresModel({ ...REPLY, badges: [] }, { viewer: YOU, nameOf });
  assert.equal(empty.badgeWeek, null);
  assert.deepEqual(empty.weekBadgesOf(YOU), []);
  assert.equal(M.featuresModel(null, { viewer: YOU }).badgeWeek, null);
  assert.deepEqual(M.featuresModel(null, { viewer: YOU }).weekBadgesOf(YOU), []);
});
