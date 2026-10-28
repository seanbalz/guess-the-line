// Design upgrade ("game feel"): the contracts behind the new app's touch interaction, without a browser (the browser
// checks are tests/cloud-browser/next-gestures.spec.js). Each test names what a player relies on:
// - a drag picks its axis from its first movement, so a vertical drag always scrolls and a sideways one turns a page;
// - a short drag snaps back, a long drag or a quick flick closes a sheet or turns a page, never past the first or last;
// - past an end the content follows less than the finger (edge resistance), and never further than the screen;
// - the game sheet pages in the Lines board's own order, with its place in words ("2 of 4");
// - the haptic tick is one 10ms vibration where the device has one, and nothing (no error) where it does not;
// - the press, sheet and skeleton styles move only transform and opacity, on the motion tokens, keep only the dim under
//   reduced motion, never loop, and never put a transform on an ancestor of the fixed bars.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  GESTURE, closeThreshold, lockAxis, pageOffset, pagerPlace, pageStep, pageThreshold, rubberBand, scrimOpacity, sheetOffset, shouldClose, velocityOf,
} from '../web/src/next/ui/gesture.js';
import { HAPTIC_MS, lightHaptic } from '../web/src/next/ui/haptics.js';
import { boardOrder, openedBoardOrder, gamePager } from '../web/src/next/lines/gameOrder.js';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('axis: nothing is decided inside the slop; then the larger movement wins, and a tie scrolls', () => {
  assert.equal(GESTURE.slop, 10);
  for (const [dx, dy] of [[0, 0], [9, 0], [0, -9], [7, 7], [-9.9, 3]]) assert.equal(lockAxis(dx, dy), null, `${dx},${dy}`);
  assert.equal(lockAxis(12, 3), 'x');
  assert.equal(lockAxis(-30, 29), 'x');
  assert.equal(lockAxis(3, 12), 'y');
  assert.equal(lockAxis(2, -40), 'y');
  assert.equal(lockAxis(15, 15), 'y', 'a diagonal start scrolls rather than turning the page');
  assert.equal(lockAxis(Number.NaN, 20), 'y');
  assert.equal(lockAxis(Number.NaN, Number.NaN), null);
});

test('swipe to close: a short drag snaps back, a quarter of the sheet (80 to 160px) or a downward flick closes', () => {
  assert.equal(closeThreshold(200), 80, 'a short sheet still needs 80px');
  assert.equal(closeThreshold(480), 120);
  assert.equal(closeThreshold(788), 160, 'a tall sheet never needs more than 160px');
  assert.equal(closeThreshold(Number.NaN), 80);
  // Short drags snap back however fast they were (a test's mouse moves in a few milliseconds).
  assert.equal(shouldClose({ dy: 30, velocity: 5, height: 788 }), false);
  assert.equal(shouldClose({ dy: GESTURE.flickMin - 1, velocity: 5, height: 788 }), false);
  assert.equal(shouldClose({ dy: 159, velocity: 0, height: 788 }), false);
  assert.equal(shouldClose({ dy: 160, velocity: 0, height: 788 }), true);
  assert.equal(shouldClose({ dy: 300, velocity: -2, height: 788 }), true, 'far enough closes even when moving back up');
  assert.equal(shouldClose({ dy: 60, velocity: 0.6, height: 788 }), true, 'a downward flick');
  assert.equal(shouldClose({ dy: 60, velocity: 0.4, height: 788 }), false, 'too slow to be a flick');
  assert.equal(shouldClose({ dy: 60, velocity: -0.9, height: 788 }), false, 'an upward flick');
  assert.equal(shouldClose({ dy: -200, velocity: 3, height: 788 }), false, 'dragging up never closes');
  // The sheet follows the finger down, never above its resting place; the scrim fades with it.
  assert.equal(sheetOffset(42), 42);
  assert.equal(sheetOffset(-42), 0);
  assert.equal(sheetOffset(Number.NaN), 0);
  assert.equal(scrimOpacity(0, 600), 1);
  assert.equal(scrimOpacity(150, 600), 0.75);
  assert.equal(scrimOpacity(900, 600), 0);
});

test('edge resistance: past an end the page follows less than the finger, more slowly the further it goes, never past the width', () => {
  const width = 390;
  let last = 0;
  for (const pull of [10, 50, 100, 200, 400, 1000, 5000]) {
    const moved = rubberBand(pull, width);
    assert.ok(moved > last, `${pull}px still moves a little further`);
    assert.ok(moved < pull, `${pull}px is resisted`);
    assert.ok(moved < width, `${pull}px stays on screen`);
    assert.equal(rubberBand(-pull, width), -moved, 'the same both ways');
    last = moved;
  }
  assert.ok(rubberBand(100, width) < 60, 'a 100px pull past the end moves well under 100px');
  assert.equal(rubberBand(50, 0), 0);
  assert.equal(rubberBand(0, width), 0);
  // Between pages the content follows the finger exactly; toward an end with nothing beyond it, resisted.
  const middle = { canPrev: true, canNext: true, width };
  assert.equal(pageOffset(-120, middle), -120);
  assert.equal(pageOffset(120, middle), 120);
  const first = { canPrev: false, canNext: true, width };
  assert.equal(pageOffset(-120, first), -120);
  assert.ok(pageOffset(120, first) > 0 && pageOffset(120, first) < 120 / 2);
  const last2 = { canPrev: true, canNext: false, width };
  assert.ok(pageOffset(-120, last2) < 0 && pageOffset(-120, last2) > -120 / 2);
});

test('swipe between pages: a quarter of the width (64 to 120px) or a flick turns it; short drags and ends snap back', () => {
  assert.equal(pageThreshold(200), 64);
  assert.equal(pageThreshold(390), 97.5);
  assert.equal(pageThreshold(520), 120);
  const middle = { width: 390, canPrev: true, canNext: true };
  assert.equal(pageStep({ dx: -120, ...middle }), 1, 'finger moved left: the next page');
  assert.equal(pageStep({ dx: 120, ...middle }), -1, 'finger moved right: the previous page');
  assert.equal(pageStep({ dx: -97, ...middle }), 0, 'just short of the threshold');
  assert.equal(pageStep({ dx: -30, velocity: -5, ...middle }), 0, 'a short drag snaps back however fast');
  assert.equal(pageStep({ dx: -50, velocity: -0.6, ...middle }), 1, 'a flick to the left');
  assert.equal(pageStep({ dx: -50, velocity: 0.6, ...middle }), 0, 'a flick back the other way cancels');
  assert.equal(pageStep({ dx: 0, ...middle }), 0);
  assert.equal(pageStep({ dx: 300, width: 390, canPrev: false, canNext: true }), 0, 'never before the first page');
  assert.equal(pageStep({ dx: -300, width: 390, canPrev: true, canNext: false }), 0, 'never after the last page');
});

test('release velocity reads only the last 100ms, so a finger that stops before it lifts is not a flick', () => {
  const samples = [{ x: 0, y: 0, t: 0 }, { x: 0, y: 50, t: 50 }, { x: 0, y: 100, t: 100 }];
  assert.equal(velocityOf(samples, 'y', 100), 1);
  assert.equal(velocityOf(samples, 'x', 100), 0);
  assert.equal(velocityOf([...samples, { x: 0, y: 100, t: 400 }], 'y', 400), 0, 'held still for 300ms');
  assert.equal(velocityOf([{ x: 0, y: 0, t: 0 }], 'y', 0), 0);
  assert.equal(velocityOf([], 'y', 0), 0);
  assert.equal(velocityOf([{ x: 0, y: 0, t: 10 }, { x: 0, y: 40, t: 10 }], 'y', 10), 0, 'no elapsed time is no velocity');
});

test('a pager names its place in words, and has no place without two pages', () => {
  assert.deepEqual(pagerPlace(1, 14), { index: 1, count: 14, canPrev: true, canNext: true, text: '2 of 14' });
  assert.deepEqual(pagerPlace(0, 2), { index: 0, count: 2, canPrev: false, canNext: true, text: '1 of 2' });
  assert.equal(pagerPlace(13, 14).canNext, false);
  for (const [index, count] of [[0, 1], [-1, 4], [4, 4], [1.5, 4], [undefined, 4], [0, undefined]]) assert.equal(pagerPlace(index, count), null, `${index} of ${count}`);
});

test('the game sheet pages in the board\'s order: games to come by kickoff, then the games that kicked off', () => {
  const now = '2026-10-18T20:00:00Z';
  const personal = { now, games: [
    { id: 'WAS-SF', kickoff: '2026-10-19T00:20:00Z' },
    { id: 'SEA-DEN', kickoff: '2026-10-18T17:00:00Z' },
    { id: 'NO-NYG', kickoff: '2026-10-18T20:25:00Z' },
    { id: 'HOU-JAX', kickoff: '2026-10-18T20:25:00Z' },
    { id: 'bad', kickoff: 'never' },
  ] };
  const order = boardOrder(personal);
  assert.deepEqual(order.map(g => g.id), ['HOU-JAX', 'NO-NYG', 'WAS-SF', 'SEA-DEN'], 'same kickoff by id; SEA @ DEN kicked off, so it is last');
  assert.deepEqual(order.map(g => g.title), ['HOU @ JAX', 'NO @ NYG', 'WAS @ SF', 'SEA @ DEN']);
  assert.deepEqual(boardOrder({ games: personal.games }).map(g => g.id), ['SEA-DEN', 'HOU-JAX', 'NO-NYG', 'WAS-SF'], 'without the server clock, every game is still to come');
  assert.deepEqual(boardOrder(null), []);
  const second = gamePager(order, 'NO-NYG');
  assert.deepEqual(second, { index: 1, count: 4, unit: 'game', prev: 'HOU-JAX', next: 'WAS-SF', prevLabel: 'Previous game, HOU @ JAX', nextLabel: 'Next game, WAS @ SF' });
  assert.equal(pagerPlace(second.index, second.count).text, '2 of 4');
  const first = gamePager(order, 'HOU-JAX');
  assert.equal(first.prev, null);
  assert.equal(first.prevLabel, 'Previous game');
  assert.equal(gamePager(order, 'SEA-DEN').nextLabel, 'Next game');
  assert.equal(gamePager(order, 'XX-YY'), null, 'a game not on the board has no pager');
  assert.equal(gamePager(order.slice(0, 1), 'HOU-JAX'), null, 'a one-game week has no pager');
});

test('haptics: one 10ms tick where the device vibrates; nothing, and no error, where it cannot', () => {
  assert.equal(HAPTIC_MS, 10);
  const calls = [];
  const phone = { vibrate(pattern) { calls.push([this, pattern]); return true; } };
  assert.equal(lightHaptic(phone), true);
  assert.deepEqual(calls, [[phone, 10]], 'called once, on the navigator, with 10ms');
  assert.equal(lightHaptic({ vibrate: () => false }), false, 'a refusal (no user gesture yet) is not an error');
  assert.equal(lightHaptic({}), false, 'iPhone Safari has no vibrate');
  assert.equal(lightHaptic(undefined), false);
  assert.equal(lightHaptic({ vibrate() { throw new Error('blocked'); } }), false);
  // Primary buttons tick; nothing else does unless asked.
  const button = read('web/src/next/ui/Button.jsx');
  assert.match(button, /const tick = haptic \?\? kind === 'primary';/);
  assert.match(button, /lightHaptic\(\); onClick\?\.\(event\);/);
});

// ---------- the styles ----------
/** `{ selectors, body, inMedia }` for each style rule; `inMedia` when it sits in a prefers-reduced-motion block. */
function cssRules(file) {
  const out = [], open = [];
  let buffer = '';
  for (const char of read(file).replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') { open.push(buffer.trim()); buffer = ''; }
    else if (char === '}') {
      const prelude = open.pop();
      if (prelude && !prelude.startsWith('@')) {
        out.push({ selectors: prelude.split(',').map(s => s.trim().replace(/\s+/g, ' ')), body: buffer, inMedia: open.some(p => p.includes('prefers-reduced-motion: reduce')) });
      }
      buffer = '';
    } else buffer += char;
  }
  return out;
}
const decl = (rule, prop) => rule?.body.split(';').map(d => d.split(':')).find(([p]) => p.trim() === prop)?.slice(1).join(':').trim();

test('press feedback: every tappable kit control dips to 0.97 and dims, on the tap tokens; reduced motion keeps only the dim', () => {
  const press = cssRules('web/src/next/ui/press.css');
  const components = read('web/src/next/styles/components.css');
  const controls = ['gx-btn', 'gx-icon-btn', 'gx-chip', 'gx-seg-btn', 'gx-card-btn', 'gx-row-btn', 'gx-link-row', 'gx-sheet-back'];
  const pressed = cls => `.gx .${cls}:active:not(:disabled)`;
  for (const cls of controls) {
    const timing = press.find(r => r.selectors.includes(`.gx .${cls}`) && decl(r, 'transition'));
    assert.equal(decl(timing, 'transition'), 'transform var(--gx-dur-tap) var(--gx-ease-standard), opacity var(--gx-dur-tap) var(--gx-ease-standard)', cls);
    assert.ok(press.some(r => !r.inMedia && r.selectors.includes(pressed(cls)) && decl(r, 'opacity') === '0.85'), `${cls} dims`);
    const scaled = press.some(r => r.selectors.includes(pressed(cls)) && decl(r, 'transform') === 'scale(0.97)')
      || new RegExp(`\\.${cls}:active:not\\(:disabled\\)[^{]*\\{\\s*transform: scale\\(0\\.97\\)`).test(components);
    assert.ok(scaled, `${cls} dips to 0.97`);
    assert.ok(press.some(r => r.inMedia && r.selectors.includes(pressed(cls)) && decl(r, 'transform') === 'none'), `${cls}: the device's reduced motion drops the dip`);
    assert.ok(press.some(r => r.selectors.includes(`.gx[data-motion="reduce"] .${cls}:active:not(:disabled)`) && decl(r, 'transform') === 'none'), `${cls}: the app's reduced motion drops the dip`);
    assert.ok(!press.some(r => r.inMedia && r.selectors.includes(pressed(cls)) && decl(r, 'opacity')), `${cls}: reduced motion keeps the dim`);
  }
  for (const cls of ['gx-btn', 'gx-chip', 'gx-seg-btn', 'gx-card-btn', 'gx-row-btn']) assert.match(components, new RegExp(`\\.${cls}:active:not\\(:disabled\\)`), `${cls} keeps its components.css dip`);
  // Every kit control that draws one of these classes loads the press styles.
  for (const file of ['Button.jsx', 'IconButton.jsx', 'Card.jsx', 'Row.jsx', 'Chip.jsx', 'Segmented.jsx', 'Sheet.jsx']) assert.match(read(`web/src/next/ui/${file}`), /import '\.\/press\.css';/, file);
});

test('sheet and skeleton styles: tokens only, transform and opacity only, a reduced-motion block for each motion, no loop', () => {
  const skeleton = read('web/src/next/ui/skeleton.css');
  const sheetRules = cssRules('web/src/next/ui/sheet.css');
  const moving = sheetRules.filter(r => !r.inMedia && decl(r, 'transition') && decl(r, 'transition') !== 'none');
  assert.ok(moving.length >= 6);
  for (const rule of moving) {
    for (const part of decl(rule, 'transition').split(/,\s*/)) assert.match(part, /^(transform|opacity) var\(--gx-dur-(quick|exit|base)\) var\(--gx-ease-(standard|exit|enter)\)$/, `${rule.selectors}: ${part}`);
    for (const selector of rule.selectors) {
      assert.ok(sheetRules.some(r => r.inMedia && r.selectors.includes(selector) && decl(r, 'transition') === 'none'), `${selector}: device reduced motion`);
      assert.ok(sheetRules.some(r => r.selectors.includes(`.gx[data-motion="reduce"] ${selector}`) && decl(r, 'transition') === 'none'), `${selector}: app reduced motion`);
    }
  }
  // The skeleton is a static tint: no animation, no transition, so nothing joins the LIVE dot's one loop.
  assert.doesNotMatch(skeleton.replace(/\/\*[\s\S]*?\*\//g, ''), /animation|transition|@keyframes/);
  assert.ok(cssRules('web/src/next/ui/skeleton.css').some(r => r.selectors.includes('.gx-skel-bar') && decl(r, 'background') === 'var(--gx-surface-3)'));
  // Nothing here styles an ancestor of the fixed tab bar: the drag moves the sheet or its body, inline, on that element.
  for (const file of ['sheet.css', 'skeleton.css', 'press.css']) for (const rule of cssRules(`web/src/next/ui/${file}`)) {
    for (const selector of rule.selectors) {
      const last = selector.split(' ').at(-1);
      if (/^\.gx(\[[^\]]*\])?$|^\.gx-(app|layer|layer--sheet|main)$/.test(last)) assert.doesNotMatch(rule.body, /transform|filter|will-change|perspective|contain/, `${file}: ${selector}`);
    }
  }
  const gestures = read('web/src/next/ui/useSheetGestures.js');
  assert.doesNotMatch(gestures, /willChange|will-change|\.filter\s*=|style\.filter/);
  for (const [, target] of gestures.matchAll(/(\w+)\.style\.transform =/g)) assert.ok(['panel', 'node'].includes(target), `${target}.style.transform: only the sheet panel or its body moves`);
  // Dialogs keep their own behaviour: no drag gestures on the native <dialog>.
  assert.doesNotMatch(read('web/src/next/ui/Dialog.jsx'), /useSheetGestures|onPointerDown/);
});


test('game paging follows the opened final-section order only for the complete current account/week slate', () => {
  const personal = { season: 2026, week: 6, now: '2026-10-18T20:00:00Z', games: [
    { id: 'SEA-DEN', kickoff: '2026-10-18T17:00:00Z' }, { id: 'HOU-JAX', kickoff: '2026-10-18T18:00:00Z' },
    { id: 'NO-NYG', kickoff: '2026-10-18T19:00:00Z' },
  ] };
  const context = { accountId: 'fixture', season: 2026, week: 6, ids: ['HOU-JAX', 'NO-NYG', 'SEA-DEN'] };
  const opened = openedBoardOrder(personal, 'fixture', context);
  assert.deepEqual(opened.map(game => game.id), context.ids);
  assert.equal(gamePager(opened, 'SEA-DEN').next, null);
  assert.equal(gamePager(opened, 'SEA-DEN').prev, 'NO-NYG');
  const fallback = boardOrder(personal);
  for (const patch of [{ accountId: 'other' }, { season: 2025 }, { week: 5 }, { ids: ['HOU-JAX'] },
    { ids: ['HOU-JAX', 'HOU-JAX', 'SEA-DEN'] }, { ids: ['HOU-JAX', 'NO-NYG', 'UNKNOWN'] }, { ids: null }]) {
    assert.deepEqual(openedBoardOrder(personal, 'fixture', { ...context, ...patch }), fallback);
  }
  assert.deepEqual(openedBoardOrder(personal, null, context), fallback);
  assert.deepEqual(openedBoardOrder(personal, 'fixture'), fallback);
  assert.deepEqual(openedBoardOrder(null, 'fixture', context), []);
});
