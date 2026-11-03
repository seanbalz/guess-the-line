// D-69 step 1, Play › Badges and awards (Sean's P5A): every layer has its own address, each is one step for Back, and
// the tiles and rows print what the features read says, never a sample. Fixture ids and numbers only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fragmentFor, placeFromFragment } from '../web/src/next/shell/router.js';
import { initialState, reduce } from '../web/src/next/shell/state.js';
import * as L from '../web/src/next/features/layers.js';

const MEMBER = '7f1c2d3e-0000-4000-8000-0123456789ab';

test('addresses: each layer reopens from its fragment (a reload or a shared link); anything unknown is the first card', () => {
  for (const [layer, options, fragment] of [
    [null, {}, '#play/features'],
    ['streaks', {}, '#play/features?layer=streaks'],
    ['awards', {}, '#play/features?layer=awards'],
    ['season', {}, '#play/features?layer=season'],
    ['badge', { badge: 'bullseye' }, '#play/features?layer=badge&item=bullseye'],
    ['badge', { badge: 'sharp', member: MEMBER }, `#play/features?layer=badge&item=sharp%40${MEMBER}`],
  ]) {
    assert.equal(fragmentFor('play', L.featuresView(layer, options)), fragment);
    const place = L.featuresLayer(placeFromFragment(fragment).view);
    assert.deepEqual(place, { layer: layer ?? 'top', badge: options.badge ?? null, member: options.member ?? null }, fragment);
  }
  for (const view of [{ layer: 'game' }, { layer: 'badge' }, { layer: 'badge', item: 'not_a_badge' }, { layer: 'badge', item: 'sharp@a@b' }, { layer: 'badge', item: 'sharp@' }, null]) {
    assert.deepEqual(L.featuresLayer(view), { layer: 'top', badge: null, member: null }, JSON.stringify(view));
  }
  assert.deepEqual(L.featuresView('badge', { badge: 'nope' }), { section: 'features', layer: undefined, item: undefined }, 'an unknown badge opens the first card');
});

test('steps: opening a layer is one step; its lip and Back return to the first card; a new section or the root drops it', () => {
  let state = initialState({ tab: 'home' });
  state = reduce(state, { type: 'go', tab: 'play', view: L.featuresView() });
  state = reduce(state, { type: 'view', tab: 'play', patch: L.featuresView('badge', { badge: 'bullseye' }) });
  assert.equal(state.views.play.layer, 'badge');
  assert.equal(state.trail.length, 2, 'the badge is a step over the first card');
  const lip = reduce(state, { type: 'view', tab: 'play', patch: L.featuresView() });
  assert.deepEqual([lip.views.play.layer, lip.views.play.item, lip.trail.length], [undefined, undefined, 1], 'the lip goes back, so the next Back leaves the page');
  const back = reduce(state, { type: 'back' });
  assert.deepEqual([back.views.play.section, back.views.play.layer, back.views.play.item], ['features', undefined, undefined], 'Back closes one layer');
  assert.equal(reduce(back, { type: 'back' }).tab, 'home');
  const root = reduce(state, { type: 'tab', tab: 'play' });
  assert.deepEqual([root.views.play.section, root.views.play.layer, root.views.play.item], [undefined, undefined, undefined], 'the Play root keeps no layer');
  const fromHome = reduce(reduce(state, { type: 'tab', tab: 'home' }), { type: 'go', tab: 'play', view: { section: 'features' } });
  assert.equal(fromHome.views.play.layer, undefined, 'a link from another tab opens the first card, not the layer left open');
  assert.equal(reduce(state, { type: 'restore', place: { tab: 'play', view: { section: 'features' } } }).views.play.layer, undefined, 'a restored place names its own layer');
});

const streak = (id, current, best) => ({ id, name: id === 'pick' ? 'Pick streak' : 'Bets streak', unit: id === 'pick' ? 'weeks' : 'wins', current, best });
const row = (name, you) => ({ id: name, name, you });

test('words: the two tiles, the streak lines, the earlier weeks and the season row say only what the read says', () => {
  assert.deepEqual(L.streakTile(streak('pick', 4, 6)), { big: '4', sub: 'Pick streak · weeks', ariaLabel: 'Your streaks: Pick streak, 4 weeks' });
  assert.equal(L.streakTile(streak('pick', 1, 1)).sub, 'Pick streak · week', 'one week is singular');
  assert.equal(L.streakLine(streak('pick', 4, 6)), 'Weeks you sent both ballots · Best 6');
  assert.equal(L.streakLine(streak('bets', 2, 3)), 'Bets won in a row · Best 3');
  assert.equal(L.streakMeterLabel(streak('bets', 1, 3)), 'Bets streak, 1 win');
  assert.deepEqual(L.awardsTile({ week: 7, rows: [row('Spread winner', true), row('Bets winner', false), row('Best guess', true)] }),
    { label: 'Week 7 awards', big: '2', sub: 'You won Spread winner', tone: 'good', ariaLabel: 'Week 7 awards: you won Spread winner, Best guess' });
  assert.deepEqual(L.awardsTile({ week: 7, rows: [row('Bets winner', false)] }), { label: 'Week 7 awards', big: '0', sub: 'See who won', tone: 'plain', ariaLabel: 'Week 7 awards: you won none, see who won' }, 'no award of yours stays quiet');
  assert.deepEqual([L.awardsTile(null).big, L.awardsTile(null).sub], ['—', 'Posts once the week is final'], 'before the job has run: no number');
  assert.equal(L.earlierRange([{ week: 6 }, { week: 1 }, { week: 3 }]), 'Weeks 1–6');
  assert.equal(L.earlierRange([{ week: 6 }]), 'Week 6');
  assert.equal(L.seasonLine(null), 'After Week 18');
  assert.equal(L.seasonLine([row('Spread champion', false), row('Total champion', true)]), 'You won Total champion');
  assert.equal(L.seasonLine([row('Spread champion', false)]), '1 winner');
  for (const text of Object.values(L.FEATURES_COPY).filter(v => typeof v === 'string')) assert.ok(text.split(/\s+/).length <= 12, `no surface sentence over twelve words: ${text}`);
});

test('the landing tile: earned count, "New: <name>" while a badge waits, and no sample before the read answers', () => {
  const model = { shelf: { earned: [{ id: 'bullseye' }, { id: 'sharp' }], toEarn: [], of: 9 } };
  assert.deepEqual(L.badgesTile({ model }), { big: '2', sub: 'earned', tone: 'plain', ariaLabel: 'Badges, 2 earned' });
  assert.deepEqual(L.badgesTile({ model, newest: 'Bullseye' }), { big: '2', sub: 'New: Bullseye', tone: 'good', ariaLabel: 'Badges, 2 earned, new: Bullseye' });
  assert.deepEqual(L.badgesTile({ model: null }), { big: '—', sub: 'Your badges, streaks and awards', tone: 'plain', ariaLabel: 'Badges' });
  assert.deepEqual(L.badgesTile({ model: null, off: true }), { big: '—', sub: 'Coming soon', tone: 'plain', ariaLabel: 'Badges, coming soon' });
});
