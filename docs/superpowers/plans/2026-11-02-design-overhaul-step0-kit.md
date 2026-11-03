# Design overhaul step 0: the shared kit — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** give every later page of the D-69 overhaul one shared kit:
- the moments engine (Sean's PICK column);
- a launch guard so nothing plays on page load;
- nesting-card entrance and back motion;
- a tab-change fade;
- count-ups that wait for the launch;
- vibration that respects reduced motion;
- loading placeholders in place of "Loading…" text.

The existing badge and award celebration moves onto the engine.

**Architecture:**
- **Pure modules** under `web/src/next/moments/` (catalog, seen record, detect and plan, launch guard, a
  framework-free engine) carry every rule and are tested with `node:test`.
- **A thin React layer** (`MomentsProvider`, `useMomentScope`, `useNewCount`, `usePopped`) mounts once in `Shell.jsx`.
- **Existing kit pieces** (`Nest.jsx`, `CountUp.jsx`, `haptics.js`, `Skeleton.jsx`) gain the launch guard and the new
  motion. No server, migration or token change.

**Tech stack:** React 19, plain CSS under `.gx` with `--gx-` tokens, `node:test` for `tests/*.test.mjs`, Vitest
for `tests/*.test.jsx` (static-markup renders), Playwright for `tests/cloud-browser/*.spec.js`.

**Spec:** `docs/superpowers/specs/2026-11-02-design-overhaul-design.md` (D-69), sections 4, 7, 8 and 9.

## Global Constraints

Copied from the spec. Each task's requirements include these.

- **Motion values (D-58):**
  - Durations: tap 100, quick 160, base 240, exit 200, big 600 and pulse 1800 ms, through `--gx-dur-*` tokens.
  - Easings: standard, enter, exit and pop, through `--gx-ease-*`.
  - "Only transform and opacity animate."
- **Moments:**
  - "One big moment at a time, never on page load, never more than 3 flashes a second."
  - "The LIVE dot is the only loop."
  - "A moment plays only on confirmed data", meaning a fresh server read; "a request that is still pending confirms
    nothing."
  - "It never replays." The seen record is per account under a `gtl.` key and holds moment ids only. "Signing out or
    switching accounts clears it."
  - "On launch every number shows its final value. A result from while you were away is marked NEW on its tile, and
    its moment plays the first time you open the card that holds it. Opening a card by tapping is not a page load."
  - "Several big moments arriving together become the one existing `ov.flash` card ("New results", at most three
    lines). Small moments wait 240 ms after one another."
  - "A loss or miss stays quiet."
- **Moment sizes (Q3, "Use PICK column"):**
  - Lock in a pick: small.
  - Whole week locked: small.
  - Bullseye: big.
  - Week final: big.
  - Rank up: small; reaching 1st: big.
  - Guess the Points exact: big.
  - Badge or award: big.
  - Pick streak grows: small.
  - Tracked bet wins: small.
  - Loss or big miss: quiet.
- **Entrance motion:**
  - "A new layer rises in over 240 ms (enter easing). Its units rise in over 160 ms, 30 ms apart, for the first six
    units only."
  - "Going back (a lip or Back) restores the parent with a 200 ms settle, with no rise."
  - "A tab change fades only the content area over 160 ms. The top bar, tab bar and dock never animate, and no
    ancestor of them gets a transform."
- **Count-ups:** "It counts from the last value shown on this device to the new value over 600 ms. The first view of
  a number, a page load and reduced motion all show the final value."
- **Vibration:** "`ui/haptics.js` gains `tap` (10 ms) and `win` (20 ms), only where `navigator.vibrate` exists."
  Reduced motion "stops every animation, transition, count-up and buzz. Words and final numbers always show."
- **Loading:** "every layer shows `ui/Skeleton.jsx` blocks … This replaces the 'Loading' text in Home, Feed and
  `DeferredScreen`." Placeholders stay static, with no shimmer.
- **Phone rules:**
  - No sideways scroll at 320 and 390 px.
  - Targets of at least 44 px.
  - No text under 12 px.
  - Axe clean in Light and Dark.
  - Every stylesheet passes `tests/next-tokens.test.mjs` (gx- prefix, tokens only, keyframes animate only transform
    and opacity, reduced motion stops everything).
- **Card motion:** a nesting card's own motion is a short translate only, never a fade or a scale. This follows the
  `ui/nest.css` rule that "a scale would shrink 44px targets and a fade would leave text below its contrast".
- **Files:** LF line endings in every touched file. Check `git diff --cached --stat` and `git ls-files --eol <files>`
  before each commit.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Frontend only:** no deploy, migration or workflow run.

## Test commands

- One `node:test` file: `node --test tests/<file>.test.mjs`
- One Vitest file: `npx vitest run tests/<file>.test.jsx`
- The full local suite on this PC: `node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run`. Default
  concurrency runs out of commit memory here.
- One browser spec: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/<file>.spec.js`. It needs
  local PGlite in `.local/sql-check`; check that the report says `skipped 0`.

## File structure

| File | Responsibility |
|---|---|
| `web/src/next/moments/catalog.js` (new) | The PICK table: moment kind to size, plus the scope names. Pure. |
| `web/src/next/moments/seen.js` (new) | The per-account seen record in `localStorage` (`gtl.next.moments.v1.<account>`). |
| `web/src/next/moments/detect.js` (new) | `freshMoments` (new against seen, seeding on a first read) and `planMoments` (what plays now). Pure. |
| `web/src/next/moments/launch.js` (new) | The launch guard: `isSettled`, `markSettled`, `onSettled`, `armLaunch`, `resetLaunch`. |
| `web/src/next/moments/engine.js` (new) | `createMomentsEngine`: pending moments, open scopes, playing, NEW counts. No React. |
| `web/src/next/moments/MomentsProvider.jsx` (new) | The React context and hooks over the engine; plays big moments through `ov.flash`. |
| `web/src/next/moments/moments.css` (new) | The small-moment pop (`[data-moment="pop"]`). |
| `web/src/next/ui/motion.js` (new) | `motionReduced(element)`, moved out of `CountUp.jsx`. |
| `web/src/next/ui/haptics.js` | Gains `winHaptic`, `WIN_MS` and a `reduced` argument. |
| `web/src/next/ui/Button.jsx` | Passes reduced motion to `lightHaptic`. |
| `web/src/next/play/PerGamePlay.jsx` | The lock-in buzz uses `lightHaptic` (10 ms), honoring reduced motion. |
| `web/src/next/shell/Shell.jsx` | Mounts `MomentsProvider`, arms the launch guard, clears the seen record on sign-out, sets the tab fade. |
| `web/src/next/shell/tabFade.js` (new) | `useTabFade(tab)`. |
| `web/src/next/shell/shell.css` | The tab-change fade rule. |
| `web/src/next/ui/Nest.jsx`, `ui/nest.css` | `nestEnter` and entrance/back motion keyed on the layer, with the unit stagger. |
| `web/src/next/shell/router.js` | Generic `layer` and `item` view keys for every section. |
| `web/src/next/ui/CountUp.jsx`, `ui/countUp.js`, `ui/countUp.css` | Moved from `home/` (git mv); the launch guard. |
| `web/src/next/features/model.js`, `useFeatures.js` | `featureMoments` replaces `newCelebrations`; reports to the engine. |
| `web/src/next/features/FeaturesScreen.jsx`, `FeatureRows.jsx`, `home/Home.jsx`, `league/LeagueScreen.jsx` | Open their scopes; the Play badges row shows NEW. |
| `web/src/next/ui/Deferred.jsx` (new) | The new app's lazy-screen frame (Boundary, Suspense and a Skeleton). |
| `web/src/next/home/Home.jsx`, `feed/Feed.jsx`, `bets/Bets.jsx` | Skeletons in place of the "Loading" text; Bets uses `Deferred`. |
| `docs/BRAND_GUIDE.md` | The moments table, the nesting-everywhere rule and the stale glow-card line. |

---

### Task 1: The moments catalog, seen record and planner (pure)

**Files:**
- Create: `web/src/next/moments/catalog.js`, `web/src/next/moments/seen.js`, `web/src/next/moments/detect.js`
- Test: `tests/next-moments.test.mjs` (new)

**Interfaces:**
- Produces:
  - **Catalog:** `MOMENTS` (frozen object kind→size), `sizeOf(kind) → 'big'|'small'|'quiet'`, `SCOPES` (frozen
    `{ home, play, league, features }`).
  - **Seen record:** `momentsKey(account) → string|null`, `readMomentSeen(account, storage?) → Set<string>|null`,
    `writeMomentSeen(account, ids, storage?)`, `clearMomentSeen(storage?)`, `SEEN_CAP = 1000`.
  - **Detection:** `freshMoments(candidates, seen) → { fresh, seed }` and
    `planMoments({ pending, open }) → { big, small, keep }`, plus `SMALL_GAP_MS = 240`.
  - **A candidate:** `{ id: string, kind: string, scopes: string[], title: string, meta?, icon?, rarity?, parts? }`.
  - **A pending moment:** a candidate plus `late: boolean`, true when it arrived after the launch settled.
  - **`open`** is a `Map<scope, 'launch'|'settled'>`: when each open scope was opened.

- [ ] **Step 1: Write the failing tests**

```js
// tests/next-moments.test.mjs
// D-69 moments engine, the pure rules (web/src/next/moments). Each test names the contract it guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MOMENTS, SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';
import { SEEN_CAP, clearMomentSeen, momentsKey, readMomentSeen, writeMomentSeen } from '../web/src/next/moments/seen.js';
import { SMALL_GAP_MS, freshMoments, planMoments } from '../web/src/next/moments/detect.js';

const memory = () => {
  const map = new Map();
  return { map, getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k),
    key: i => [...map.keys()][i] ?? null, get length() { return map.size; } };
};
const m = (id, kind, scopes = [SCOPES.features], extra = {}) => ({ id, kind, scopes, title: id, ...extra });

test('moments size: every moment plays at the size Sean chose (Q3, "Use PICK column"); a loss is quiet', () => {
  assert.deepEqual({ ...MOMENTS }, {
    lockIn: 'small', weekLocked: 'small', bullseye: 'big', weekFinal: 'big', rankUp: 'small', rankFirst: 'big',
    pointsExact: 'big', badge: 'big', award: 'big', streak: 'small', betWin: 'small', loss: 'quiet',
  });
  assert.equal(sizeOf('loss'), 'quiet');
  assert.equal(sizeOf('somethingElse'), 'quiet', 'an unknown kind never celebrates');
  assert.equal(sizeOf('toString'), 'quiet', 'only own keys count');
});

test('seen record: per account under gtl.next.moments.v1, capped, cleared on sign-out, and never trusted when broken', () => {
  const store = memory();
  assert.equal(momentsKey('acct-1'), 'gtl.next.moments.v1.acct-1');
  assert.equal(momentsKey(''), null);
  assert.equal(readMomentSeen('acct-1', store), null, 'no record yet');
  writeMomentSeen('acct-1', ['a', 'b', 'a'], store);
  assert.deepEqual([...readMomentSeen('acct-1', store)], ['a', 'b']);
  assert.equal(readMomentSeen('acct-2', store), null, 'another account has its own record');
  writeMomentSeen('acct-1', Array.from({ length: SEEN_CAP + 5 }, (_, i) => `id-${i}`), store);
  const kept = [...readMomentSeen('acct-1', store)];
  assert.equal(kept.length, SEEN_CAP);
  assert.equal(kept.at(-1), `id-${SEEN_CAP + 4}`, 'the newest ids are kept');
  store.setItem('gtl.next.moments.v1.acct-3', '{not json');
  assert.equal(readMomentSeen('acct-3', store), null, 'a broken record reads as none (a first read seeds it again)');
  store.setItem('gtl.next.other', 'keep');
  clearMomentSeen(store);
  assert.equal(readMomentSeen('acct-1', store), null);
  assert.equal(store.getItem('gtl.next.other'), 'keep', 'only the moments records are cleared');
});

test('fresh: a first read on this device seeds everything and plays nothing; later only unseen ids are new', () => {
  const all = [m('badge:1', 'badge'), m('award:7:x', 'award'), m('loss:1', 'loss')];
  assert.deepEqual(freshMoments(all, null), { fresh: [], seed: ['badge:1', 'award:7:x', 'loss:1'] });
  const seen = new Set(['badge:1']);
  const { fresh, seed } = freshMoments([...all, m('badge:1', 'badge')], seen);
  assert.deepEqual(fresh.map(x => x.id), ['award:7:x'], 'unseen and not quiet; duplicates collapse');
  assert.deepEqual(seed, ['loss:1'], 'a quiet moment is remembered at once and never waits');
  assert.deepEqual(freshMoments([{ id: '', kind: 'badge', scopes: ['features'], title: 'x' }, { id: 'y', kind: 'badge', scopes: [], title: 'y' }], seen), { fresh: [], seed: [] }, 'malformed candidates are dropped');
});

test('plan: nothing plays at launch; a card opened after the launch plays what waited; a moment that arrives later plays where it is open', () => {
  const waiting = [{ ...m('badge:2', 'badge'), late: false }, { ...m('streak:5', 'streak', [SCOPES.home]), late: false }];
  assert.deepEqual(planMoments({ pending: waiting, open: new Map([[SCOPES.features, 'launch'], [SCOPES.home, 'launch']]) }), { big: [], small: [], keep: waiting }, 'open since launch: never on page load');
  const opened = planMoments({ pending: waiting, open: new Map([[SCOPES.features, 'settled']]) });
  assert.deepEqual(opened.big.map(x => x.id), ['badge:2']);
  assert.deepEqual(opened.keep.map(x => x.id), ['streak:5'], 'its card is not open');
  const late = [{ ...m('badge:3', 'badge'), late: true }];
  assert.deepEqual(planMoments({ pending: late, open: new Map([[SCOPES.features, 'launch']]) }).big.map(x => x.id), ['badge:3'], 'arrived while you watch: plays in place');
  const two = [{ ...m('a', 'badge'), late: true }, { ...m('b', 'award'), late: true }, { ...m('c', 'streak'), late: true }];
  const both = planMoments({ pending: two, open: new Map([[SCOPES.features, 'settled']]) });
  assert.deepEqual([both.big.map(x => x.id), both.small.map(x => x.id)], [['a', 'b'], ['c']], 'big ones together (one card), small ones apart');
  assert.equal(SMALL_GAP_MS, 240);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/next-moments.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/src/next/moments/catalog.js`.

- [ ] **Step 3: Write the catalog**

```js
// web/src/next/moments/catalog.js
// The moments map (D-69, Sean on November 2, 2026: "Use PICK column"): every moment the app can play and its size.
// BRAND_GUIDE Motion: saves get a small moment, verified wins a big one, losses stay quiet. Pure.

/** Moment kind to size. Anything not listed is quiet: an unknown kind never celebrates. */
export const MOMENTS = Object.freeze({
  lockIn: 'small', weekLocked: 'small', bullseye: 'big', weekFinal: 'big', rankUp: 'small', rankFirst: 'big',
  pointsExact: 'big', badge: 'big', award: 'big', streak: 'small', betWin: 'small', loss: 'quiet',
});

/** 'big' | 'small' | 'quiet'. */
export const sizeOf = kind => (typeof kind === 'string' && Object.hasOwn(MOMENTS, kind) ? MOMENTS[kind] : 'quiet');

/** The cards that hold moments. A moment plays when one of its scopes is open (see detect.js). */
export const SCOPES = Object.freeze({ home: 'home', play: 'play', league: 'league', features: 'features' });
```

- [ ] **Step 4: Write the seen record**

```js
// web/src/next/moments/seen.js
// The moments this device has already shown, per account (D-69 section 4.2, rule 2): ids only, never another player's
// pick or anything the server has not opened. Cleared on sign-out. A device that blocks storage keeps no record, so it
// seeds on every read and never replays.
export const MOMENTS_PREFIX = 'gtl.next.moments.v1.';
export const SEEN_CAP = 1000;

const deviceStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

/** The storage key for one account, or null without one. */
export const momentsKey = account => (typeof account === 'string' && account ? `${MOMENTS_PREFIX}${encodeURIComponent(account)}` : null);

/** The ids this device showed for `account`, or null when it has no record (a first read then seeds it). */
export function readMomentSeen(account, storage = deviceStorage()) {
  const key = momentsKey(account);
  if (!key || !storage) return null;
  try {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    const ids = JSON.parse(raw);
    return Array.isArray(ids) && ids.every(id => typeof id === 'string') ? new Set(ids) : null;
  } catch { return null; }
}

/** Remembers `ids` (the whole record, oldest first), keeping the newest SEEN_CAP. */
export function writeMomentSeen(account, ids, storage = deviceStorage()) {
  const key = momentsKey(account);
  if (!key || !storage) return;
  const unique = [...new Set(ids.filter(id => typeof id === 'string' && id))];
  try { storage.setItem(key, JSON.stringify(unique.slice(-SEEN_CAP))); } catch { /* No record: nothing replays, nothing new plays. */ }
}

/** Forgets every account's record (sign-out). Other gtl. keys stay. */
export function clearMomentSeen(storage = deviceStorage()) {
  if (!storage) return;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) { const key = storage.key(i); if (key?.startsWith(MOMENTS_PREFIX)) keys.push(key); }
    for (const key of keys) storage.removeItem(key);
  } catch { /* Storage blocked: there is nothing to clear. */ }
}
```

- [ ] **Step 5: Write the detector and planner**

```js
// web/src/next/moments/detect.js
// Which moments are new, and which play now (D-69 section 4.2). Pure: candidates come from fresh server reads only
// (rule 1); the caller never builds one from a request that is still pending.
import { sizeOf } from './catalog.js';

/** Small moments wait this long after one another. */
export const SMALL_GAP_MS = 240;

const valid = c => c && typeof c.id === 'string' && c.id && typeof c.kind === 'string' && typeof c.title === 'string'
  && Array.isArray(c.scopes) && c.scopes.length > 0 && c.scopes.every(s => typeof s === 'string' && s);

/**
 * `seen` null means this device has no record for the account: everything is seeded, nothing plays (a first sighting
 * shows the result as it is). Otherwise `fresh` holds the unseen moments that can play (big or small) and `seed` the
 * unseen quiet ones, remembered at once.
 */
export function freshMoments(candidates, seen) {
  const unique = [...new Map((candidates ?? []).filter(valid).map(c => [c.id, c])).values()];
  if (seen === null) return { fresh: [], seed: unique.map(c => c.id) };
  const unseen = unique.filter(c => !seen.has(c.id));
  return { fresh: unseen.filter(c => sizeOf(c.kind) !== 'quiet'), seed: unseen.filter(c => sizeOf(c.kind) === 'quiet').map(c => c.id) };
}

/**
 * What plays now. A pending moment plays when one of its scopes is open and either it arrived after the launch
 * (`late`, it plays in place) or that scope was opened after the launch ('settled': the member opened the card). A
 * scope open since the launch never plays what waited, so nothing plays on page load.
 */
export function planMoments({ pending, open }) {
  const plays = c => c.scopes.some(s => open.has(s) && (c.late || open.get(s) === 'settled'));
  const now = pending.filter(plays);
  return { big: now.filter(c => sizeOf(c.kind) === 'big'), small: now.filter(c => sizeOf(c.kind) === 'small'), keep: pending.filter(c => !plays(c)) };
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/next-moments.test.mjs`
Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add web/src/next/moments/catalog.js web/src/next/moments/seen.js web/src/next/moments/detect.js tests/next-moments.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/moments tests/next-moments.test.mjs
git commit -m "Add the D-69 moments catalog, seen record and planner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The launch guard and the moments engine (no React)

**Files:**
- Create: `web/src/next/moments/launch.js`, `web/src/next/moments/engine.js`
- Test: `tests/next-moments-engine.test.mjs` (new)

**Interfaces:**
- Consumes (Task 1): `freshMoments`, `planMoments`, `SMALL_GAP_MS`, `readMomentSeen`, `writeMomentSeen`.
- Produces:
  - **Launch guard:** `isSettled() → boolean`, `markSettled()`, `onSettled(fn) → unsubscribe`,
    `armLaunch(target) → disarm`, `resetLaunch()`.
  - **Engine:** `createMomentsEngine({ account, storage?, isSettled, onBig(moments), onSmall(moment), setTimer? })`
    returns `{ report(candidates), open(scope) → close, newCount(scope) → number, subscribe(fn) → unsubscribe }`.

- [ ] **Step 1: Write the failing tests**

```js
// tests/next-moments-engine.test.mjs
// D-69 moments engine: the launch guard and the engine that plays moments (web/src/next/moments). Fixture data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { armLaunch, isSettled, markSettled, onSettled, resetLaunch } from '../web/src/next/moments/launch.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES } from '../web/src/next/moments/catalog.js';

const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
const badge = id => ({ id, kind: 'badge', scopes: [SCOPES.features, SCOPES.home], title: id });
const streak = id => ({ id, kind: 'streak', scopes: [SCOPES.home], title: id });
function rig({ storage = memory(), settled = { value: false } } = {}) {
  const big = [], small = [], timers = [];
  const engine = createMomentsEngine({ account: 'acct', storage, isSettled: () => settled.value, onBig: ms => big.push(ms.map(x => x.id)), onSmall: x => small.push(x.id),
    setTimer: (fn, ms) => { timers.push(ms); fn(); } });
  return { engine, big, small, timers, settled, storage };
}

test('launch guard: settled only by the member\'s own press or key, once; tests and sign-in reset it', () => {
  resetLaunch();
  const handlers = {};
  const target = { addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener: type => { delete handlers[type]; } };
  const disarm = armLaunch(target);
  let calls = 0; onSettled(() => { calls += 1; });
  assert.equal(isSettled(), false);
  handlers.pointerdown({ isTrusted: false });
  assert.equal(isSettled(), false, 'a script-made event is not the member');
  handlers.keydown({ isTrusted: true });
  assert.equal(isSettled(), true);
  markSettled();
  assert.equal(calls, 1, 'listeners hear it once');
  disarm();
  assert.deepEqual(Object.keys(handlers), []);
  resetLaunch();
  assert.equal(isSettled(), false);
});

test('engine: a first read seeds silently; a new badge at launch waits as NEW and plays when its card is opened after the launch', () => {
  const r = rig();
  r.engine.open(SCOPES.home);
  r.engine.report([badge('b1')]);
  assert.deepEqual(r.big, [], 'first read on this device: nothing plays');
  r.engine.report([badge('b1'), badge('b2')]);
  assert.deepEqual(r.big, [], 'never on page load');
  assert.equal(r.engine.newCount(SCOPES.features), 1, 'marked NEW');
  r.settled.value = true;
  const close = r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['b2']], 'opening its card plays it');
  assert.equal(r.engine.newCount(SCOPES.features), 0);
  close();
  r.engine.report([badge('b1'), badge('b2')]);
  r.engine.open(SCOPES.features);
  assert.deepEqual(r.big, [['b2']], 'never replays');
});

test('engine: after the launch a moment that arrives where you are plays in place; two big ones share one card; small ones 240 ms apart', () => {
  const r = rig({ settled: { value: true } });
  r.engine.report([]);
  r.engine.open(SCOPES.home);
  r.engine.report([badge('b1'), badge('b2'), streak('s1'), streak('s2')]);
  assert.deepEqual(r.big, [['b1', 'b2']]);
  assert.deepEqual(r.small, ['s1', 's2']);
  assert.deepEqual(r.timers, [0, 240]);
});

test('engine: the record survives a reload; another account starts its own; a quiet loss never waits', () => {
  const storage = memory();
  const a = rig({ storage, settled: { value: true } });
  a.engine.report([]);
  a.engine.open(SCOPES.features);
  a.engine.report([badge('b1'), { id: 'l1', kind: 'loss', scopes: [SCOPES.features], title: 'l1' }]);
  assert.deepEqual(a.big, [['b1']]);
  assert.equal(a.engine.newCount(SCOPES.features), 0, 'the loss is never pending');
  const reload = rig({ storage, settled: { value: true } });
  reload.engine.open(SCOPES.features);
  reload.engine.report([badge('b1')]);
  assert.deepEqual(reload.big, [], 'seen before the reload');
  const other = createMomentsEngine({ account: 'acct-2', storage, isSettled: () => true, onBig: () => assert.fail('a first read for a new account seeds'), onSmall: () => {} });
  other.open(SCOPES.features);
  other.report([badge('b9')]);
});

test('engine: subscribers hear NEW counts change; without an account nothing ever plays', () => {
  const r = rig();
  r.engine.report([]);
  let heard = 0; const off = r.engine.subscribe(() => { heard += 1; });
  r.engine.report([badge('b3')]);
  assert.ok(heard >= 1);
  off();
  const none = createMomentsEngine({ account: null, isSettled: () => true, onBig: () => assert.fail('no account'), onSmall: () => assert.fail('no account') });
  none.open(SCOPES.features);
  none.report([badge('b1')]);
  none.report([badge('b1'), badge('b2')]);
  assert.equal(none.newCount(SCOPES.features), 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/next-moments-engine.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `launch.js`.

- [ ] **Step 3: Write the launch guard**

```js
// web/src/next/moments/launch.js
// "Never on page load" (D-69 section 4.2, rule 3): the app counts as settled only after the member's own first press or
// key inside it. Until then every number shows its final value and no moment plays. Module state: one app per page.
let settled = false;
const listeners = new Set();

export const isSettled = () => settled;

/** Marks the launch over and tells each listener once. */
export function markSettled() {
  if (settled) return;
  settled = true;
  for (const fn of [...listeners]) { listeners.delete(fn); fn(); }
}

/** Calls `fn` when the launch settles (at once if it has). Returns an unsubscribe. */
export function onSettled(fn) {
  if (settled) { fn(); return () => {}; }
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Listens on `target` (the window) for the member's first trusted press or key. Returns a disarm. */
export function armLaunch(target) {
  const fire = event => { if (event?.isTrusted !== false) { markSettled(); disarm(); } };
  const options = { capture: true };
  function disarm() { target.removeEventListener('pointerdown', fire, options); target.removeEventListener('keydown', fire, options); }
  target.addEventListener('pointerdown', fire, options);
  target.addEventListener('keydown', fire, options);
  return disarm;
}

/** A new sign-in (and tests): the next screen is a launch again. */
export function resetLaunch() { settled = false; listeners.clear(); }
```

- [ ] **Step 4: Write the engine**

```js
// web/src/next/moments/engine.js
// The moments engine (D-69 section 4.2), without React: it remembers what this device showed, holds what waits (NEW),
// knows which cards are open, and plays through the callbacks it is given. MomentsProvider.jsx wraps it.
import { freshMoments, planMoments, SMALL_GAP_MS } from './detect.js';
import { readMomentSeen, writeMomentSeen } from './seen.js';

/**
 * `onBig(moments)` shows one card for every big moment playing together; `onSmall(moment)` pops one small moment.
 * `isSettled()` is the launch guard (launch.js). `storage` defaults to localStorage.
 */
export function createMomentsEngine({ account, storage, isSettled, onBig, onSmall, setTimer = (fn, ms) => setTimeout(fn, ms) }) {
  let seen = account ? readMomentSeen(account, storage) : null;
  const pending = new Map();
  const open = new Map();
  const subscribers = new Set();
  const notify = () => { for (const fn of [...subscribers]) fn(); };
  const remember = ids => {
    if (!account || !ids.length) return;
    seen = new Set([...(seen ?? []), ...ids]);
    writeMomentSeen(account, [...seen], storage);
  };
  function flush() {
    const plan = planMoments({ pending: [...pending.values()], open });
    const now = [...plan.big, ...plan.small];
    if (!now.length) return;
    for (const m of now) pending.delete(m.id);
    remember(now.map(m => m.id));
    if (plan.big.length) onBig(plan.big);
    plan.small.forEach((m, i) => setTimer(() => onSmall(m), i * SMALL_GAP_MS));
    notify();
  }
  return {
    /** Every moment a fresh server read shows (rule 1). New ones play where their card is open, or wait as NEW. */
    report(candidates) {
      if (!account) return;
      const { fresh, seed } = freshMoments(candidates, seen);
      if (seen === null) seen = new Set();
      remember(seed);
      const late = isSettled();
      for (const m of fresh) if (!pending.has(m.id)) pending.set(m.id, { ...m, late });
      flush();
      notify();
    },
    /** A card that holds moments is showing. Returns its close. */
    open(scope) {
      // A scope keeps the state of its first opening until every holder has closed it.
      if (!open.has(scope)) open.set(scope, isSettled() ? 'settled' : 'launch');
      const count = (open.get(`#${scope}`) ?? 0) + 1;
      open.set(`#${scope}`, count);
      flush();
      return () => {
        const left = (open.get(`#${scope}`) ?? 1) - 1;
        if (left > 0) { open.set(`#${scope}`, left); return; }
        open.delete(`#${scope}`);
        open.delete(scope);
      };
    },
    /** How many moments wait (NEW) for `scope`. */
    newCount(scope) { return [...pending.values()].filter(m => m.scopes.includes(scope)).length; },
    subscribe(fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
  };
}
```

The `#scope` entries hold the open count beside each scope's state. Moment scopes never start with `#`, so a count
entry can never match a moment.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/next-moments-engine.test.mjs tests/next-moments.test.mjs`
Expected: PASS, 9 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add web/src/next/moments/launch.js web/src/next/moments/engine.js tests/next-moments-engine.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/moments tests/next-moments-engine.test.mjs
git commit -m "Add the launch guard and the D-69 moments engine" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The React layer, the shell wiring and vibration

**Files:**
- Create: `web/src/next/moments/MomentsProvider.jsx`, `web/src/next/moments/moments.css`, `web/src/next/ui/motion.js`
- Modify: `web/src/next/ui/haptics.js`, `web/src/next/ui/Button.jsx:7,20`, `web/src/next/ui/index.js:37`,
  `web/src/next/home/CountUp.jsx:22-26`, `web/src/next/play/PerGamePlay.jsx:37,113`, `web/src/next/shell/Shell.jsx`
- Test: `tests/next-gestures.test.mjs` (haptics block), `tests/next-moments-ui.test.jsx` (new)

**Interfaces:**
- Consumes:
  - Task 2: `createMomentsEngine` and `armLaunch`/`isSettled`/`resetLaunch`.
  - Task 1: `clearMomentSeen`.
  - The shell's existing `actions.showOverlay(id, args)`.
- Produces:
  - **Provider:** `<MomentsProvider account showOverlay>`.
  - **Hooks:** `useMoments() → { report } | null`, `useMomentScope(scope)`, `useNewCount(scope) → number`,
    `usePopped(id) → boolean`.
  - **Motion check:** `motionReduced(element)` in `ui/motion.js`.
  - **Vibration:** `lightHaptic(nav?, reduced?)`, `winHaptic(nav?, reduced?)`, `HAPTIC_MS = 10`, `WIN_MS = 20`.

- [ ] **Step 1: Write the failing tests**

Replace the haptics test in `tests/next-gestures.test.mjs` (lines 142–156), keeping its import line updated to
`import { HAPTIC_MS, WIN_MS, lightHaptic, winHaptic } from '../web/src/next/ui/haptics.js';`:

```js
test('haptics: a 10ms tap and a 20ms win where the device vibrates; nothing under reduced motion or where it cannot', () => {
  assert.equal(HAPTIC_MS, 10);
  assert.equal(WIN_MS, 20);
  const calls = [];
  const phone = { vibrate(pattern) { calls.push(pattern); return true; } };
  assert.equal(lightHaptic(phone), true);
  assert.equal(winHaptic(phone), true);
  assert.deepEqual(calls, [10, 20]);
  assert.equal(lightHaptic(phone, true), false, 'reduced motion stops every buzz');
  assert.equal(winHaptic(phone, true), false);
  assert.deepEqual(calls, [10, 20]);
  assert.equal(lightHaptic({ vibrate: () => false }), false, 'a refusal (no user gesture yet) is not an error');
  assert.equal(lightHaptic({}), false, 'iPhone Safari has no vibrate');
  assert.equal(lightHaptic(undefined), false);
  assert.equal(winHaptic({ vibrate() { throw new Error('blocked'); } }), false);
  const button = fs.readFileSync(new URL('../web/src/next/ui/Button.jsx', import.meta.url), 'utf8');
  assert.match(button, /const tick = haptic \?\? kind === 'primary';/);
  assert.match(button, /lightHaptic\(undefined, motionReduced\(event\.currentTarget\)\); onClick\?\.\(event\);/);
});
```

(If `fs` is not imported at the top of that file, add `import fs from 'node:fs';`.)

Create `tests/next-moments-ui.test.jsx`:

```jsx
// D-69 moments: the React layer renders nothing of its own and its hooks are safe without a provider.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MomentsProvider, useNewCount, usePopped, useMomentScope, useMoments } from '../web/src/next/moments/MomentsProvider.jsx';

function Probe() {
  useMomentScope('features');
  const n = useNewCount('features');
  const popped = usePopped('badge:1');
  const moments = useMoments();
  return <span data-n={n} data-popped={String(popped)} data-has={String(moments !== null)}>x</span>;
}

describe('MomentsProvider', () => {
  it('without a provider the hooks do nothing: no NEW, no pop, no engine', () => {
    expect(renderToStaticMarkup(<Probe/>)).toBe('<span data-n="0" data-popped="false" data-has="false">x</span>');
  });
  it('with a provider it adds no markup and starts with nothing new', () => {
    const html = renderToStaticMarkup(<MomentsProvider account="acct" showOverlay={() => {}}><Probe/></MomentsProvider>);
    expect(html).toBe('<span data-n="0" data-popped="false" data-has="true">x</span>');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/next-gestures.test.mjs` then `npx vitest run tests/next-moments-ui.test.jsx`
Expected: FAIL. `WIN_MS` and `winHaptic` are not exported, and `MomentsProvider.jsx` is not found.

- [ ] **Step 3: Move `motionReduced` into `ui/motion.js`**

```js
// web/src/next/ui/motion.js
// Reduced motion (BRAND_GUIDE Motion): the device setting, or the app's own (data-motion="reduce" on the .gx root).
// Everything that moves or buzzes asks this first.

/** True when motion should stop for `element` (or for the page when no element is given). */
export function motionReduced(element) {
  const device = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scope = element ?? (typeof document !== 'undefined' ? document.querySelector('.gx') : null);
  return device || Boolean(scope?.closest?.('[data-motion="reduce"]'));
}
```

In `web/src/next/home/CountUp.jsx`, delete the local `motionReduced` function (lines 22–26). Import it instead with
`import { motionReduced } from '../ui/motion.js';`, and re-export it for existing callers with
`export { motionReduced } from '../ui/motion.js';` placed after the imports.

- [ ] **Step 4: Extend `ui/haptics.js`**

```js
// A light haptic tick and a win buzz (design upgrade, "game feel"; D-69 section 4.6): one short vibration where the
// device offers one (Android Chrome), nothing where it does not (iPhone Safari has no Vibration API, desktops ignore
// it) and nothing under reduced motion. The tick is for primary actions and a confirmed lock-in; the win is for big
// moments. A refusal or a missing API is not an error.

export const HAPTIC_MS = 10;
export const WIN_MS = 20;

function buzz(nav, ms, reduced) {
  if (reduced) return false;
  try {
    return typeof nav?.vibrate === 'function' ? nav.vibrate(ms) === true : false;
  } catch {
    return false;
  }
}
const device = () => (typeof navigator === 'undefined' ? undefined : navigator);

/** One HAPTIC_MS tick when the device can and motion is not reduced; true when the browser accepted it. */
export const lightHaptic = (nav = device(), reduced = false) => buzz(nav, HAPTIC_MS, reduced);
/** One WIN_MS buzz for a big moment, on the same terms. */
export const winHaptic = (nav = device(), reduced = false) => buzz(nav, WIN_MS, reduced);
```

In `web/src/next/ui/Button.jsx`:
- Add `import { motionReduced } from './motion.js';` after line 7.
- Change line 20 to:
  `const press = tick ? event => { lightHaptic(undefined, motionReduced(event.currentTarget)); onClick?.(event); } : onClick;`

In `web/src/next/ui/index.js` line 37, export the new names:
`export { lightHaptic, winHaptic, HAPTIC_MS, WIN_MS } from './haptics.js';` and add
`export { motionReduced } from './motion.js';`.

In `web/src/next/play/PerGamePlay.jsx`:
- Replace line 37 (`const vibrate = …20…`) with `const vibrate = () => lightHaptic(undefined, motionReduced());`.
- Add `import { lightHaptic } from '../ui/haptics.js';` and `import { motionReduced } from '../ui/motion.js';` to its
  imports. The spec gives the lock-in a 10 ms tick, so this replaces the old 20 ms.

- [ ] **Step 5: Write the provider, its hooks and the pop style**

```jsx
// web/src/next/moments/MomentsProvider.jsx
// D-69 moments in React: one engine per signed-in account (Shell.jsx keys this by account). Big moments play through
// the existing celebration overlay (`ov.flash`, one card however many arrived) with a win buzz; small ones mark an
// element to pop in place (`data-moment="pop"`, moments.css). Without a provider every hook is a no-op.
import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createMomentsEngine } from './engine.js';
import { isSettled } from './launch.js';
import { winHaptic } from '../ui/haptics.js';
import { motionReduced } from '../ui/motion.js';
import './moments.css';

const MomentsContext = createContext(null);
const none = () => () => {};

/** The overlay's item from a moment (FlashOverlay reads key, title, meta, parts, icon and rarity). */
export const flashItem = m => ({ key: m.id, title: m.title, meta: m.meta, parts: m.parts, icon: m.icon, rarity: m.rarity });

export function MomentsProvider({ account, showOverlay, children }) {
  const overlay = useRef(showOverlay);
  overlay.current = showOverlay;
  const [popped, setPopped] = useState(() => new Set());
  const engine = useMemo(() => createMomentsEngine({
    account: typeof account === 'string' && account ? account : null,
    isSettled,
    onBig: moments => { winHaptic(undefined, motionReduced()); overlay.current?.('ov.flash', { items: moments.map(flashItem) }); },
    onSmall: m => setPopped(prev => new Set(prev).add(m.id)),
  }), [account]);
  // One `report` per engine, so a caller's effect that depends on it runs only when its read changes.
  const report = useMemo(() => candidates => engine.report(candidates), [engine]);
  const value = useMemo(() => ({ engine, popped, report }), [engine, popped, report]);
  return <MomentsContext.Provider value={value}>{children}</MomentsContext.Provider>;
}

/** `{ report(candidates) }`, or null outside the app (tests, the old app). */
export function useMoments() {
  const ctx = useContext(MomentsContext);
  return ctx ? { report: ctx.report } : null;
}

/** Marks `scope` as showing while the calling card is mounted (a card that holds moments). */
export function useMomentScope(scope) {
  const ctx = useContext(MomentsContext);
  useEffect(() => (ctx ? ctx.engine.open(scope) : undefined), [ctx?.engine, scope]);
}

/** How many moments wait (NEW) for `scope`. */
export function useNewCount(scope) {
  const ctx = useContext(MomentsContext);
  return useSyncExternalStore(ctx ? ctx.engine.subscribe : none, () => (ctx ? ctx.engine.newCount(scope) : 0), () => 0);
}

/** True once the small moment `id` has played: render `data-moment="pop"` on its element. */
export function usePopped(id) {
  const ctx = useContext(MomentsContext);
  return Boolean(ctx?.popped.has(id));
}
```

```css
/* web/src/next/moments/moments.css
   D-69 small moments: the tag or chip that just earned its moment pops once in place (pop easing, base duration).
   Reduced motion: base.css stops it; the tag itself always shows. */
@media (prefers-reduced-motion: no-preference) {
  .gx [data-moment="pop"] { animation: gx-pop-in var(--gx-dur-base) var(--gx-ease-pop); }
}
```

- [ ] **Step 6: Wire the shell**

In `web/src/next/shell/Shell.jsx`:
- Add imports:
  `import { MomentsProvider } from '../moments/MomentsProvider.jsx';`,
  `import { armLaunch, resetLaunch } from '../moments/launch.js';` and
  `import { clearMomentSeen } from '../moments/seen.js';`.
- After the `useFixedBarsPinned();` line add:
  `useEffect(() => armLaunch(window), []);`
- In `signOut`, right after `await onSignOutRef.current?.();`, add:
  `clearMomentSeen(); resetLaunch();`
- Wrap the content of `<ShellContext.Provider value={value}>` (the whole `<div className={`gx …`}>` tree) in
  `<MomentsProvider key={member?.id ?? 'signed-out'} account={member?.id} showOverlay={actions.showOverlay}> … </MomentsProvider>`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/next-gestures.test.mjs tests/next-moments.test.mjs tests/next-moments-engine.test.mjs`
then `npx vitest run tests/next-moments-ui.test.jsx tests/next-design-home-league.test.jsx` then
`node --test tests/next-tokens.test.mjs`.
Expected: all PASS. The tokens test accepts `moments.css` (gx-pop-in is defined in `base.css`).

- [ ] **Step 8: Commit**

```bash
git add web/src/next/moments/MomentsProvider.jsx web/src/next/moments/moments.css web/src/next/ui/motion.js web/src/next/ui/haptics.js web/src/next/ui/Button.jsx web/src/next/ui/index.js web/src/next/home/CountUp.jsx web/src/next/play/PerGamePlay.jsx web/src/next/shell/Shell.jsx tests/next-gestures.test.mjs tests/next-moments-ui.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/moments web/src/next/ui/motion.js web/src/next/ui/haptics.js
git commit -m "Mount the moments engine in the shell; vibration respects reduced motion" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Badges and awards on the engine

**Files:**
- Modify: `web/src/next/features/model.js:131-151` (`newCelebrations` becomes `featureMoments`),
  `web/src/next/features/useFeatures.js`, `web/src/next/features/FeaturesScreen.jsx`,
  `web/src/next/features/FeatureRows.jsx`, `web/src/next/home/Home.jsx`, `web/src/next/league/LeagueScreen.jsx`
- Test: `tests/next-features.test.mjs` (the celebrations test, lines 76–84)

**Interfaces:**
- Consumes:
  - Task 1: `SCOPES`.
  - Task 3: `useMoments`, `useMomentScope`, `useNewCount`.
- Produces: `featureMoments(reply, viewer) → candidate[]`. Every one of the viewer's badges and awards is a candidate,
  with `scopes: FEATURE_SCOPES`. `FEATURE_SCOPES = [features, home, league, play]` is exported from `model.js`.

- [ ] **Step 1: Write the failing test**

Replace the test at `tests/next-features.test.mjs:76-84` with:

```js
test('celebrations: every badge and award of the viewer is a moment candidate, oldest badge first; never another player\'s', () => {
  const items = M.featureMoments(REPLY, YOU);
  const mine = items.map(i => [i.kind, i.title]);
  assert.deepEqual(mine.filter(([k]) => k === 'award').map(([, t]) => t), ['Spread winner', 'Best guess'], 'the viewer\'s awards only');
  assert.ok(mine.some(([k, t]) => k === 'badge' && t === 'Double Bullseye'));
  assert.ok(!items.some(i => i.title === 'Sharp'), 'another player\'s badge is not your celebration');
  assert.ok(items.every(i => typeof i.icon === 'string' && i.icon.length > 10));
  assert.ok(items.every(i => /^(badge|award):/.test(i.id)), 'stable ids: the seen record matches them across reads');
  assert.deepEqual(items[0].scopes, M.FEATURE_SCOPES);
  assert.deepEqual(M.FEATURE_SCOPES, ['features', 'home', 'league', 'play']);
  assert.deepEqual(M.featureMoments(null, YOU), []);
  assert.equal(M.newCelebrations, undefined, 'the per-session baseline is gone (D-69: results from while you were away are not lost)');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/next-features.test.mjs`
Expected: FAIL, `M.featureMoments is not a function`.

- [ ] **Step 3: Replace `newCelebrations` in `features/model.js`**

Delete the `newCelebrations` doc comment and function (lines 131–151) and add:

```js
/** The cards that hold badge and award moments (D-69): they play when one of these opens after the launch. */
export const FEATURE_SCOPES = Object.freeze([SCOPES.features, SCOPES.home, SCOPES.league, SCOPES.play]);

/**
 * Every badge and award of the viewer in a features reply, as moments (moments/detect.js decides which are new):
 * `{ id, kind: 'badge' | 'award', scopes, title, meta, icon, rarity }`; a badge also carries `parts` (badgeParts) so the
 * overlay draws its game as marks. Badges oldest first, then awards. Ids are stable across reads.
 */
export function featureMoments(reply, viewer) {
  if (!record(reply) || typeof viewer !== 'string' || !viewer) return [];
  const out = (reply.badges ?? []).filter(b => b.userId === viewer && BADGE_BY_ID[b.badge])
    .sort((a, b) => Date.parse(a.visibleAt) - Date.parse(b.visibleAt))
    .map(b => ({ id: `badge:${b.key}`, kind: 'badge', scopes: [...FEATURE_SCOPES], title: BADGE_BY_ID[b.badge].name, meta: badgeLine(b), parts: badgeParts(b), icon: BADGE_ICONS[b.badge], rarity: BADGE_BY_ID[b.badge].rarity }));
  for (const w of reply.awards ?? []) for (const a of w.awards) {
    if (!a.winners.includes(viewer)) continue;
    out.push({ id: `award:${w.week}:${a.id}`, kind: 'award', scopes: [...FEATURE_SCOPES], title: AWARD_BY_ID[a.id]?.name ?? a.id, meta: `Week ${w.week}${SEP}${awardValue(a)}`, icon: AWARD_ICONS[a.id], rarity: 'rare' });
  }
  return out;
}
```

Add `import { SCOPES } from '../moments/catalog.js';` to the imports of `model.js`.

- [ ] **Step 4: Report from `useFeatures.js`**

Replace the header's celebration paragraph and the baseline code:
- Delete `const baselines = new Map();`, `forgetFeatureBaselines`, and the `useEffect` that compared `before` with
  `read.data`.
- Change the import to `import { featuresModel, featureMoments } from './model.js';`.
- Add `import { useMoments } from '../moments/MomentsProvider.jsx';`.
- Add this effect in their place:

```js
  const moments = useMoments();
  // D-69: every fresh features read reports the viewer's badges and awards; the engine plays the new ones only where
  // their card opens after the launch, and keeps the rest as NEW. `celebrate: false` (a badge's own sheet) reports nothing.
  useEffect(() => {
    if (!read.data || !viewer || !celebrate || !moments) return;
    moments.report(featureMoments(read.data, viewer));
  }, [read.data, viewer, celebrate, moments?.report]);
```

Keep the signature `useFeatures(app, shell, options)` so callers don't change, even though `shell` is no longer used
for celebrating. Update the header comment to say celebrations come from the D-69 moments engine.

`useMoments()` returns a new object each render, but its `report` keeps one identity per engine (Task 3), so the
effect depends on `moments?.report`.

- [ ] **Step 5: Open the scopes and show NEW**

- `FeaturesScreen.jsx`: add `import { useMomentScope } from '../moments/MomentsProvider.jsx';` and call
  `useMomentScope('features');` as the first line of `FeaturesScreen()`.
- `home/Home.jsx`: in the component that renders the Home screen (`export function Home…`), call
  `useMomentScope('home');` (same import).
- `league/LeagueScreen.jsx`: in its screen component, call `useMomentScope('league');`.
- `FeatureRows.jsx` (`PlayFeaturesRow`): call `useMomentScope('play');` and show the NEW count, never by color alone.

```jsx
export function PlayFeaturesRow({ app }) {
  const shell = useShell();
  useMomentScope('play');
  const fresh = useNewCount('features');
  const { model } = useFeatures(app, shell);
  if (!model) return null;
  const sub = model.recap ? `Week ${model.recap.week} awards are in` : 'Your badges, streaks and awards';
  return <FocusRow icon="trophy" title="Badges and awards" sub={fresh ? `${fresh} new · ${sub}` : sub} onClick={open(shell)}/>;
}
```

(import `useMomentScope, useNewCount` from `'../moments/MomentsProvider.jsx'`).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/next-features.test.mjs tests/next-moments-engine.test.mjs`, then
`npx vitest run tests/next-design-home-league.test.jsx`, then
`grep -rn "newCelebrations\|forgetFeatureBaselines" web/src tests`.
Expected: the tests PASS and the grep finds nothing.

- [ ] **Step 7: Commit**

```bash
git add web/src/next/features/model.js web/src/next/features/useFeatures.js web/src/next/features/FeaturesScreen.jsx web/src/next/features/FeatureRows.jsx web/src/next/home/Home.jsx web/src/next/league/LeagueScreen.jsx tests/next-features.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/features
git commit -m "Celebrate badges and awards through the moments engine; away results wait as NEW" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Nesting-card entrance and back motion, and layer addresses

**Files:**
- Modify: `web/src/next/ui/Nest.jsx`, `web/src/next/ui/nest.css:49-54`, `web/src/next/shell/router.js:4`
- Test: `tests/next-nest-motion.test.jsx` (new), `tests/next-router.test.mjs` (add one test)

**Interfaces:**
- Consumes: Task 2 `isSettled`.
- Produces:
  - `nestEnter({ settled, mounted, prevDepth, depth, prevLayer, layer }) → 'in'|'back'|undefined`.
  - The `.gx-nest-card[data-enter]` attribute.
  - Router view keys `layer` and `item` on every section of every tab.

- [ ] **Step 1: Write the failing tests**

```jsx
// tests/next-nest-motion.test.jsx
// D-69 section 4.3: a nesting card rises in when a deeper layer opens, settles when a parent comes back, and never
// moves on a launch or when its layer stays the same.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Nest, nestEnter } from '../web/src/next/ui/Nest.jsx';

describe('nestEnter', () => {
  it('a launch never animates, settled or not, on the first card', () => {
    expect(nestEnter({ settled: false, mounted: false, prevDepth: 0, depth: 0, layer: 'a' })).toBeUndefined();
    expect(nestEnter({ settled: false, mounted: true, prevDepth: 0, depth: 1, prevLayer: 'a', layer: 'b' })).toBeUndefined();
  });
  it('after the launch: a deeper layer rises in, a parent settles back, the same layer stays still', () => {
    expect(nestEnter({ settled: true, mounted: false, prevDepth: 0, depth: 0, layer: 'a' })).toBe('in');
    expect(nestEnter({ settled: true, mounted: true, prevDepth: 0, depth: 1, prevLayer: 'a', layer: 'b' })).toBe('in');
    expect(nestEnter({ settled: true, mounted: true, prevDepth: 2, depth: 1, prevLayer: 'c', layer: 'b' })).toBe('back');
    expect(nestEnter({ settled: true, mounted: true, prevDepth: 1, depth: 1, prevLayer: 'b', layer: 'b' })).toBeUndefined();
  });
});

describe('Nest markup', () => {
  it('the first render has no entrance (a page load)', () => {
    const html = renderToStaticMarkup(<div className="gx"><Nest label="Trends" layer="root" title="Trends"><div className="gx-nest-grid"><span>1</span></div></Nest></div>);
    expect(html).toContain('class="gx-nest-card"');
    expect(html).not.toContain('data-enter');
  });
});
```

Add to `tests/next-router.test.mjs`:

```js
test('D-69 layer addresses: every section keeps a layer and an item, so a reload or a shared link reopens a card', () => {
  for (const [tab, view] of [['play', { section: 'score' }], ['research', { section: 'games' }], ['bets', { view: 'tracked' }], ['home', {}]]) {
    const fragment = fragmentFor(tab, { ...view, layer: 'game', item: '2026_08_SEA_DEN' });
    assert.match(fragment, /layer=game/, tab);
    assert.match(fragment, /item=2026_08_SEA_DEN/, tab);
    const place = placeFromFragment(fragment);
    assert.equal(place.view.layer, 'game', tab);
    assert.equal(place.view.item, '2026_08_SEA_DEN', tab);
  }
  assert.equal(placeFromFragment('#play/score?layer=%3Cscript%3E').view?.layer, undefined, 'only safe characters');
});
```

(Use the file's existing imports of `fragmentFor` and `placeFromFragment`; add them to its import line if missing.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/next-nest-motion.test.jsx` and `node --test tests/next-router.test.mjs`
Expected: FAIL. `nestEnter` is not exported, and the `layer=game` match fails.

- [ ] **Step 3: Add the router keys**

In `web/src/next/shell/router.js` line 4, add `'layer'` and `'item'` to `KEYS`:

```js
const KEYS = new Set(['market','season','week','weekId','leagueId','accountId','period','team','matchup','scoreGame','comparisonKind','layer','item']);
```

Check that the home tab keeps them too. If `#home?layer=…` fails because `routePlace('home', …)` drops keys, follow
`safeView`: it already copies every key in `KEYS` for any tab, so no further change should be needed. Confirm with the
test.

- [ ] **Step 4: Add `nestEnter` and key the card on its layer**

In `web/src/next/ui/Nest.jsx`, add `import { isSettled } from '../moments/launch.js';`, then add above `Nest`:

```js
/**
 * How the card enters (D-69 section 4.3): 'in' when a deeper layer opens (or the card first shows after the launch),
 * 'back' when a parent layer is restored, and nothing on a launch or while the layer stays the same.
 */
export function nestEnter({ settled, mounted, prevDepth = 0, depth = 0, prevLayer, layer }) {
  if (!settled) return undefined;
  if (!mounted) return 'in';
  if (prevLayer === layer) return undefined;
  return depth < prevDepth ? 'back' : 'in';
}
```

Inside `Nest`, replace `const heading = useRef(null), shown = useRef(layer);` and keep the focus effect. Add:

```js
  const heading = useRef(null), shown = useRef(layer), last = useRef(null);
  const enter = nestEnter({ settled: isSettled(), mounted: last.current !== null, prevDepth: last.current?.depth, depth: lips.length, prevLayer: last.current?.layer, layer });
  useLayoutEffect(() => { last.current = { depth: lips.length, layer }; });
```

Change the card element to remount per layer and carry the entrance:

```jsx
      <div key={layer ?? 'layer'} className="gx-nest-card" style={depth(lips.length)} data-enter={enter}>
```

- [ ] **Step 5: Replace the card animation in `ui/nest.css`**

Replace lines 49–54 (the no-preference block, its comment and `@keyframes gx-nest-in`) with:

```css
.gx .gx-nest { --gx-nest-stagger: 30ms; }
@media (prefers-reduced-motion: no-preference) {
  /* D-69 4.3: a deeper layer rises in; a restored parent settles; the first six units follow 30 ms apart. Only on a
     layer change after the launch (data-enter, Nest.jsx), never on a page load. */
  .gx .gx-nest-card[data-enter="in"] { animation: gx-nest-in var(--gx-dur-base) var(--gx-ease-enter); }
  .gx .gx-nest-card[data-enter="back"] { animation: gx-nest-back var(--gx-dur-exit) var(--gx-ease-standard); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(-n+6) { animation: gx-nest-unit-in var(--gx-dur-quick) var(--gx-ease-enter) both; }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(2) { animation-delay: var(--gx-nest-stagger); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(3) { animation-delay: calc(var(--gx-nest-stagger) * 2); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(4) { animation-delay: calc(var(--gx-nest-stagger) * 3); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(5) { animation-delay: calc(var(--gx-nest-stagger) * 4); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(6) { animation-delay: calc(var(--gx-nest-stagger) * 5); }
}
/* A short slide only: a scale would shrink 44px targets and a fade would leave text below its contrast while the
   card enters, and checks (or a quick reader) can land mid-animation. */
@keyframes gx-nest-in { from { transform: translateY(8px); } to { transform: none; } }
@keyframes gx-nest-back { from { transform: translateY(-4px); } to { transform: none; } }
@keyframes gx-nest-unit-in { from { transform: translateY(8px); } to { transform: none; } }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/next-nest-motion.test.jsx tests/next-trends-nest.test.jsx tests/next-fantasy-nest.test.jsx`,
then `node --test tests/next-router.test.mjs tests/next-tokens.test.mjs`.
Expected: all PASS. If `tests/next-tokens.test.mjs` rejects the local `--gx-nest-stagger`, read its "every var()"
test (line 152): component-local custom properties are allowed when set in the same file under `.gx`. Fix the
declaration to match the rule and re-run.

- [ ] **Step 7: Commit**

```bash
git add web/src/next/ui/Nest.jsx web/src/next/ui/nest.css web/src/next/shell/router.js tests/next-nest-motion.test.jsx tests/next-router.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/ui/Nest.jsx web/src/next/ui/nest.css
git commit -m "Nesting cards enter on a layer change only, never on a page load; layer addresses everywhere" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The tab-change fade, and count-ups that wait for the launch

**Files:**
- Create: `web/src/next/shell/tabFade.js`
- Move: `web/src/next/home/CountUp.jsx`, `countUp.js` and `countUp.css` to `web/src/next/ui/` (with `git mv`)
- Modify: `web/src/next/shell/Shell.jsx` (the `<main>` element), `web/src/next/shell/shell.css`,
  `web/src/next/ui/countUp.js` (`countUpPlan`), `web/src/next/ui/CountUp.jsx`, `web/src/next/home/Home.jsx`,
  `web/src/next/league/LeagueBoard.jsx:10`
- Test: `tests/next-count-up.test.mjs`, `tests/next-design-home-league.test.jsx` (import paths),
  `tests/cloud-browser/next-design-home-league.spec.js` (launch behavior)

**Interfaces:**
- Consumes: Task 2 `isSettled`.
- Produces: `useTabFade(tab) → boolean`, and `countUpPlan({ seen, value, reduced, hidden, launch })`, where
  `launch: true` means show the final value and remember nothing. `CountUp` now lives at `web/src/next/ui/CountUp.jsx`.

- [ ] **Step 1: Write the failing tests**

In `tests/next-count-up.test.mjs`, change the import to `'../web/src/next/ui/countUp.js'` and add:

```js
test('D-69: a page load shows the final value and remembers nothing, so the count plays when the card is next opened', () => {
  assert.deepEqual(C.countUpPlan({ seen: 12, value: 20, launch: true }), { animate: false, from: 20, to: 20, remember: false });
  assert.deepEqual(C.countUpPlan({ seen: 12, value: 20 }), { animate: true, from: 12, to: 20, remember: true });
  assert.deepEqual(C.countUpPlan({ seen: 12, value: 20, reduced: true }), { animate: false, from: 20, to: 20, remember: true }, 'reduced motion still moves on');
  assert.deepEqual(C.countUpPlan({ seen: null, value: 20 }), { animate: false, from: 20, to: 20, remember: true }, 'a first sighting shows the number');
});
```

Every other assertion in that file that checks `countUpPlan` output needs `remember: true` added to the expected
object, unless it passes `launch: true`. Update those assertions to match.

In `tests/next-design-home-league.test.jsx` lines 17–18, change `../web/src/next/home/CountUp.jsx` to
`../web/src/next/ui/CountUp.jsx`, and `../web/src/next/home/countUp.js` to `../web/src/next/ui/countUp.js`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/next-count-up.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`, because the file has not moved yet.

- [ ] **Step 3: Move the count-up into the kit**

```bash
git mv web/src/next/home/CountUp.jsx web/src/next/ui/CountUp.jsx
git mv web/src/next/home/countUp.js web/src/next/ui/countUp.js
git mv web/src/next/home/countUp.css web/src/next/ui/countUp.css
```

In the moved `ui/CountUp.jsx`:
- Change `import { cx } from '../ui/cx.js';` to `import { cx } from './cx.js';`.
- Change `import { motionReduced } from '../ui/motion.js';` (from Task 3) to `import { motionReduced } from './motion.js';`,
  and its re-export likewise.
- Add `import { isSettled } from '../moments/launch.js';`.

In `ui/countUp.js`, change `import { DASH, MINUS } from '../format.js';` (the path is unchanged: `ui/` and `home/`
are siblings under `next/`). Confirm it still resolves.

Update the imports:
- `home/Home.jsx`: `import { CountUp } from '../ui/CountUp.jsx';`
- `league/LeagueBoard.jsx:10`: `import { CountUp } from '../ui/CountUp.jsx';`
- `tests/cloud-browser/next-design-home-league.spec.js:9`: `import { countUpKey } from '../../web/src/next/ui/countUp.js';`

Then run `grep -rn "home/CountUp\|home/countUp" web/src tests` and fix anything it finds.

- [ ] **Step 4: Teach the plan about the launch**

Replace `countUpPlan` in `ui/countUp.js`:

```js
/**
 * Whether to count and from where: `{ animate, from, to, remember }`. It counts only from a value this device saw
 * (finite and different), never from 0 or a guess, and never under reduced motion or while the page is hidden. On a
 * launch (D-69: nothing moves on page load) it shows the final value and remembers nothing, so the count plays the
 * next time the member opens the card.
 */
export function countUpPlan({ seen, value, reduced = false, hidden = false, launch = false } = {}) {
  if (!finite(value)) return { animate: false, from: null, to: null, remember: false };
  if (launch) return { animate: false, from: value, to: value, remember: false };
  const animate = finite(seen) && seen !== value && !reduced && !hidden;
  return { animate, from: animate ? seen : value, to: value, remember: true };
}
```

In `ui/CountUp.jsx`, inside the layout effect:
- Compute the plan before writing: `const plan = countUpPlan({ …, launch: !isSettled() });`.
- Replace the unconditional `writeSeen(key, final);` with `if (plan.remember) writeSeen(key, final);`, placed after
  the plan line.
- Keep the rest. Update the header comment: the remembered value is written once the launch has settled.

- [ ] **Step 5: Add the tab-change fade**

```js
// web/src/next/shell/tabFade.js
// D-69 section 4.3: once the member switches tabs after the launch, every new tab screen fades in over the quick
// duration. The top bar, tab bar and dock never animate (the fade rule targets only <main>'s screen, a sibling of them).
import { useRef, useState } from 'react';
import { isSettled } from '../moments/launch.js';

/** True from the first tab change the member makes after the launch. */
export function useTabFade(tab) {
  const first = useRef(tab);
  const [on, setOn] = useState(false);
  if (!on && tab !== first.current && isSettled()) setOn(true);
  return on;
}
```

In `Shell.jsx`, add `import { useTabFade } from './tabFade.js';`. Near the `Screen` constant add
`const tabFade = useTabFade(state.tab);`, and change the main element to
`<main className="gx-main" id="main" tabIndex={-1} data-tab-enter={tabFade ? 'fade' : undefined}>`.

Append to `web/src/next/shell/shell.css`:

```css
@media (prefers-reduced-motion: no-preference) {
  /* D-69 4.3: a new tab screen fades in; <main> is not an ancestor of the top bar, tab bar or dock. */
  .gx .gx-main[data-tab-enter="fade"] > .gx-screen { animation: gx-fade-in var(--gx-dur-quick) var(--gx-ease-standard); }
}
```

Run `grep -n 'className="gx-screen' web/src/next/home/Home.jsx web/src/next/play/Play.jsx web/src/next/bets/Bets.jsx web/src/next/research/Research.jsx`
to confirm each tab's root is a `.gx-screen` rendered directly inside `<main>`. `Boundary` renders its children with
no wrapper. If a root is not `.gx-screen`, add that class to the root rather than widening the selector.

- [ ] **Step 6: Update the browser spec for the launch rule**

In `tests/cloud-browser/next-design-home-league.spec.js`:

1. Add a tab helper below `toNumber`:
   `const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });`
2. In the Home test, replace step 1, from `// 1. The count-up:` through the `toBe('20');` storage assertion, with:

```js
    // 1. The count-up (D-69): a page load shows the server's 20 at once and remembers nothing; once Luke has used the
    // app, opening Home again counts from the 12 this device saw, stays between 12 and 20, rests on 20 and remembers it.
    const spreadPoints = page.locator('[data-tile="spread"] [data-home="points"] .gx-countup');
    await expect(spreadPoints).toHaveAttribute('data-count', 'rest');
    await expect(spreadPoints).toHaveText('20');
    expect((await frames(page, 'spread')).filter(f => f.state === 'run'), 'nothing counts on page load').toEqual([]);
    expect(await page.evaluate(key => localStorage.getItem(key), countUpKey(LUKE, spreadFigure(LUKE)))).toBe('12');
    await page.evaluate(() => { window.__frames = []; });
    await tab(page, 'Play').click();
    await tab(page, 'Home').click();
    await expect(spreadPoints).toHaveAttribute('data-count', 'rest');
    await expect(spreadPoints).toHaveText('20');
    const spread = await frames(page, 'spread');
    const counted = spread.filter(f => f.state === 'run').map(f => toNumber(f.text));
    expect(counted[0], 'the count starts from the value this device saw').toBe(12);
    expect(counted.every(n => n >= 12 && n <= 20), `frames ${counted}`).toBe(true);
    expect(spread.at(-1)).toMatchObject({ state: 'rest', text: '20' });
    const firstRun = spread.find(f => f.state === 'run'), rest = spread.at(-1);
    expect(rest.t - firstRun.t, 'count-up duration in ms').toBeGreaterThan(550);
    expect(rest.t - firstRun.t, 'count-up duration in ms').toBeLessThan(3000);
    expect(await page.evaluate(key => localStorage.getItem(key), countUpKey(LUKE, spreadFigure(LUKE)))).toBe('20');
```

3. In the reduced-motion test, change `.toBe('12');` (Troy's stored value after the page load) to `.toBe('4');` and add
   the comment `// D-69: a page load remembers nothing; the next opening after the launch moves the record on.`
4. In the League board test, replace the Troy count block, from `const troyTotal = …` through the `counted.every`
   line, with:

```js
    const troyTotal = board.locator(`[data-board-row="${TROY}"] .gx-countup`);
    await expect(troyTotal).toHaveAttribute('data-count', 'rest');
    await expect(troyTotal).toHaveText('12');
    expect((await frames(page, TROY)).filter(f => f.state === 'run'), 'nothing counts on page load').toEqual([]);
    await page.evaluate(() => { window.__frames = []; });
    await tab(page, 'Home').click();
    await tab(page, 'Play').click();
    await expect(troyTotal).toHaveAttribute('data-count', 'rest');
    const counted = (await frames(page, TROY)).filter(f => f.state === 'run').map(f => toNumber(f.text));
    expect(counted[0], 'Troy’s total counts from the 4 this device saw, once the card is opened again').toBe(4);
    expect(counted.every(n => n >= 4 && n <= 12), `frames ${counted}`).toBe(true);
```

Play's view is kept per tab, so Play returns to the League board. If the board is not showing after the Play click,
navigate with `await page.evaluate(() => { location.hash = '#play/league?view=board'; });` instead of the two clicks.
Keep the rank toast assertions as they are: the rank moment moves onto the engine in step 1 (Play), not here.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/next-count-up.test.mjs tests/next-tokens.test.mjs`, then
`npx vitest run tests/next-design-home-league.test.jsx`, then
`npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-design-home-league.spec.js tests/cloud-browser/next-scroll-navigation.spec.js`.
Expected: all PASS, with `skipped 0` in the Playwright report. The scroll-navigation spec proves no bar ancestor gained a
transform.

- [ ] **Step 8: Commit**

```bash
git add -A web/src/next/ui/CountUp.jsx web/src/next/ui/countUp.js web/src/next/ui/countUp.css web/src/next/home web/src/next/league/LeagueBoard.jsx web/src/next/shell/tabFade.js web/src/next/shell/Shell.jsx web/src/next/shell/shell.css tests/next-count-up.test.mjs tests/next-design-home-league.test.jsx tests/cloud-browser/next-design-home-league.spec.js
git diff --cached --stat && git ls-files --eol web/src/next/ui/CountUp.jsx web/src/next/ui/countUp.js web/src/next/shell/tabFade.js
git commit -m "Fade new tab screens after the launch; count-ups wait for the member" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Loading placeholders in place of "Loading…" text

**Files:**
- Create: `web/src/next/ui/Deferred.jsx`
- Modify: `web/src/next/home/Home.jsx:183`, `web/src/next/feed/Feed.jsx:28`, `web/src/next/features/FeaturesScreen.jsx`
  (loading branch), `web/src/next/bets/Bets.jsx:3,113,114`
- Test: `tests/next-loading.test.mjs` (new)

**Interfaces:**
- Consumes: `Skeleton` (`ui/Skeleton.jsx`), `Boundary` and `FailCard` (`shell/Boundary.jsx`), `reloadApp`
  (`appView.js`).
- Produces: `<Deferred resetKey label>{lazy children}</Deferred>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/next-loading.test.mjs
// D-69 section 4.5: while a layer loads it shows Skeleton blocks in its final shape; no new-app screen announces a bare
// "Loading…" sentence as its only content, and the new app no longer waits on the old app's DeferredScreen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const files = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? files(`${dir}/${e.name}`) : /\.(jsx|js)$/.test(e.name) ? [`${dir}/${e.name}`] : []));

test('loading: no bare role="status" Loading sentence in the new app; Skeleton carries the words for screen readers', () => {
  const offenders = [];
  for (const file of files('web/src/next')) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    if (/<p[^>]*role="status"[^>]*>\s*(\{[A-Z_]*LOADING[A-Z_]*\}|Loading[^<]*)<\/p>/.test(text)) offenders.push(file);
    if (/FEATURES_COPY\.loading\}<\/p>/.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test('loading: the new app frames lazy screens with ui/Deferred (a Skeleton), not the old app\'s DeferredScreen', () => {
  const users = files('web/src/next').filter(file => fs.readFileSync(path.join(root, file), 'utf8').includes('DeferredScreen'));
  assert.deepEqual(users, []);
  const deferred = fs.readFileSync(path.join(root, 'web/src/next/ui/Deferred.jsx'), 'utf8');
  assert.match(deferred, /<Skeleton /);
  assert.match(deferred, /<Boundary /);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/next-loading.test.mjs`
Expected: FAIL. It lists `home/Home.jsx`, `feed/Feed.jsx` and `features/FeaturesScreen.jsx`, and `Bets.jsx` as a
DeferredScreen user.

- [ ] **Step 3: Write `ui/Deferred.jsx`**

```jsx
// The new app's frame for a lazy screen (D-69 section 4.5): while its code loads it shows Skeleton blocks (the words
// stay for screen readers); if it fails, the tab's own failure card offers Try again and an explicit reload, so a
// missing deployment chunk never reloads an edited ballot by itself. Replaces the old app's DeferredScreen here.
import { Suspense } from 'react';
import { reloadApp } from '../../appView.js';
import { Boundary, FailCard } from '../shell/Boundary.jsx';
import { Skeleton } from './Skeleton.jsx';

export function Deferred({ resetKey, label = 'screen', children }) {
  return (
    <Boundary resetKey={resetKey} fallback={reset => <FailCard title="This screen couldn’t load" onRetry={reset} onReload={reloadApp}/>}>
      <Suspense fallback={<Skeleton label={`Loading ${label}…`} shape="panels" count={2}/>}>{children}</Suspense>
    </Boundary>
  );
}
```

- [ ] **Step 4: Swap in the placeholders**

- `home/Home.jsx:183`: replace `<p className="gx-t-body gx-c-2" role="status">{HOME_LOADING}</p>` with
  `<Skeleton label={HOME_LOADING} shape="panels" count={3}/>`. Import Skeleton with
  `import { Skeleton } from '../ui/Skeleton.jsx';`, unless `Home.jsx` already imports from `'../ui/index.js'` and the
  index exports `Skeleton` (check with `grep -n Skeleton web/src/next/ui/index.js`).
- `feed/Feed.jsx:28`: replace the loading `<p …>Loading the feed…</p>` with
  `<Skeleton label="Loading the feed…" shape="rows" count={4}/>` and import it the same way.
- `features/FeaturesScreen.jsx`: replace
  `<p className="gx-t-body gx-c-2" role="status">{FEATURES_COPY.loading}</p>` with
  `<Skeleton label={FEATURES_COPY.loading} shape="panels" count={2}/>`.
- `bets/Bets.jsx`: replace `import DeferredScreen from '../../DeferredScreen.jsx';` with
  `import { Deferred } from '../ui/Deferred.jsx';`, and rename both uses at lines 113–114 from `DeferredScreen` to
  `Deferred`, opening and closing tags alike.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/next-loading.test.mjs tests/next-tokens.test.mjs`, then
`npx vitest run tests/next-features-ui.test.jsx tests/next-bets-everyone-ui.test.jsx`. Run whichever of those two Vitest
files exist (`ls tests | grep -E "next-(features|bets).*\.test\.jsx"`), plus `tests/four-tab-landings.test.jsx`.
If `tests/next-loading.test.mjs` lists other new-app files with a bare `role="status"` Loading paragraph, convert each
the same way: a `Skeleton` with the same words, and the shape of what is loading. Then run it again.
Expected: all PASS. If a markup test asserted the old Loading `<p>`, change it to assert
`data-skeleton="panels"` (Home and Features) or `data-skeleton="rows"` (Feed), and that the visually hidden label
text is present.

- [ ] **Step 6: Commit**

```bash
git add web/src/next/ui/Deferred.jsx web/src/next/home/Home.jsx web/src/next/feed/Feed.jsx web/src/next/features/FeaturesScreen.jsx web/src/next/bets/Bets.jsx tests/next-loading.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/ui/Deferred.jsx tests/next-loading.test.mjs
git commit -m "Show loading placeholders in Home, Feed, badges and Bets' lazy screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Nothing moves on page load (browser check), and the brand guide

**Files:**
- Modify: `tests/cloud-browser/next-home.spec.js` (add one test), `docs/BRAND_GUIDE.md` (Motion section and the
  D-55 glow line)
- Test: the new browser test; `PYTHONUTF8=1 python scripts/check-brand-docs.py`

**Interfaces:** none new.

- [ ] **Step 1: Write the browser test**

Add after the first test in `tests/cloud-browser/next-home.spec.js`, using that file's helpers (`lukesWeek`,
`tryNewApp`, `tab`, `tabBar`):

```js
test('D-69: nothing animates on the first paint; a tab change after the launch fades only the screen, never the bars', async ({ page, baseURL }) => {
  const { world } = await lukesWeek(page, baseURL);
  try {
    await page.addInitScript(() => {
      window.__anims = [];
      document.addEventListener('animationstart', event => window.__anims.push({ name: event.animationName, cls: String(event.target.className || '') }), true);
    });
    await tryNewApp(page);
    await page.waitForTimeout(1200);
    // The LIVE dot is the one loop, and the countdown's digit tick belongs to the clock, not to the page load.
    const onLoad = await page.evaluate(() => window.__anims.filter(a => a.name !== 'gx-live-pulse' && !/gx-countdown/.test(a.cls)));
    expect(onLoad, 'no animation on page load').toEqual([]);
    await tab(page, 'Play').click();
    await expect.poll(() => page.evaluate(() => window.__anims.some(a => a.name === 'gx-fade-in' && /gx-screen/.test(a.cls)))).toBe(true);
    const barMoved = await page.evaluate(() => window.__anims.some(a => /gx-(tabbar|topbar|dock)/.test(a.cls)));
    expect(barMoved, 'the bars never animate').toBe(false);
  } finally { await world.db.close(); }
});
```

If a load-time animation fails this test, the cause is one of the ones the spec forbids. Fix its source by gating it
on `data-enter` or the launch guard. Don't widen the allowlist, except when the animation is the countdown digit tick:
check its class name in the failure output and match the regex to it. That clock tick is already approved.

- [ ] **Step 2: Run the browser test**

Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-home.spec.js`
Expected: PASS, with `skipped 0`.

- [ ] **Step 3: Update the brand guide**

In `docs/BRAND_GUIDE.md` "### Motion", under the D-38 redesign system, append this paragraph and table:

```markdown
**Moments (D-69, November 2, 2026).** One engine (`web/src/next/moments/`) decides every moment's size from Sean's
choice ("Use PICK column"), plays only on a fresh server read, never replays (a per-account seen record on the device,
cleared on sign-out), never plays on page load (results from while you were away show NEW and play when their card is
opened) and shows one big moment at a time (`ov.flash`, "New results"). Small moments are 240 ms apart.

| Moment | Size |
|---|---|
| Lock in a pick · Whole week locked · Rank up · Pick streak grows · Tracked bet wins | Small |
| Bullseye · Week final · Reaching 1st · Guess the Points exact · Badge or award | Big |
| Loss or big miss | Quiet |

**Nesting cards on every tab (D-69).** Every tab's sections are D-66 nesting cards: a deeper layer rises in (240 ms),
its first six units follow 30 ms apart (160 ms), a restored parent settles (200 ms), and a tab change fades only the
screen (160 ms). The bars never animate.
```

Find the D-55 line `- At most two glow cards in view: …` and change its start to
`- Any number of glow cards may be in view (D-56 addendum, October 23, 2026, which replaced D-55's two-card limit): …`.
Keep the rest of the line's meaning.

- [ ] **Step 4: Run the document checks**

Run: `PYTHONUTF8=1 python scripts/check-brand-docs.py`
Expected: `Brand and D-18 document QA passed`.

- [ ] **Step 5: Run the full local suite**

Run: `npm run typecheck && node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run && npm run build`
Expected: typecheck clean; node tests with 0 failures and `skipped 0`; every Vitest file passes; the build succeeds.
If `rollback.test.mjs` or another PGlite file crashes with `out of memory` on this PC, re-run that file alone with
`--test-concurrency=1` and report both results. A memory crash is environmental; CI is the check.

- [ ] **Step 6: Commit**

```bash
git add tests/cloud-browser/next-home.spec.js docs/BRAND_GUIDE.md
git diff --cached --stat && git ls-files --eol docs/BRAND_GUIDE.md tests/cloud-browser/next-home.spec.js
git commit -m "Check that nothing animates on page load; brand guide gains the D-69 moments and nesting rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## After the tasks

- Push the branch, open the step 0 PR against `main`, run `npm run sync:check`, and record the step in
  `docs/COMPLETION_REGISTER.md`. The register row says "built for review"; nothing is released.
- Each later step (1 Play, 2 Home, 3 Research, 4 Bets, 5 Menu and EPL) gets its own plan. Each adds its page's
  candidate builders (for example `bullseye`, `weekFinal`, `rankFirst`, `pointsExact`, `betWin`) beside the page,
  reports them through `useMoments().report`, and opens its scopes with `useMomentScope`.

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| 4.1 Nesting cards on every tab (layer addresses, entrance) | 5 (kit); pages adopt it in steps 1–5 |
| 4.2 Moments engine, rules 1–5 and the table | 1, 2, 3; badges and awards wired in 4; other moments wired per page in steps 1–5 |
| 4.3 Entrance, back, tab fade, chart reveal | 5, 6; the chart reveal comes with Research (step 3), where the charts are |
| 4.4 Count-ups (kit piece, launch rule) | 6 |
| 4.5 Loading, empty and error | 7 (loading); empty and error follow per page |
| 4.6 Vibration and reduced motion | 3 |
| 7 Failure handling (lost reply, account change) | 2 (confirmed reads only; per-account engine), 3 (sign-out clear) |
| 8 Privacy (ids only, cleared on sign-out) | 1, 3 |
| 9 Tests 1–9 | 1 (1, 3), 2 (2, 3, 5), 3 (6), 6 (4, 7), 5 (8), the existing tokens test (9) |
| 9 Tests 10–11 | existing scroll-navigation and phone specs, run in 6 and 8 |
| 9 Tests 12–13 | apply per page in steps 1–5 |
| 10 Brand guide update | 8 |
