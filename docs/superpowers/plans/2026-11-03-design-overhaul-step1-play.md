# Design overhaul step 1: Play — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rebuild every Play page on the step 0 kit, as Sean chose on November 3, 2026:
- the first card (P1B): the ballot to do next, then six tiles;
- Your score with its game layer (P2B);
- Compare, one other member at a time (P3B);
- Guess the Points as slot tiles and a slot layer (P4A);
- Badges and awards, grid first (P5A);
- League, board first, with the feed and History as layers (P6A);
- the picks fallback rebuilt as per-game cards.

Every section becomes a nesting card under a "Play" lip, and each page's moments play through the engine.

**Architecture:**
- **One shared frame** (`play/PlayLayer.jsx`, `PlayTile.jsx`, `WeekChips.jsx`, `FilterToggle.jsx`) wraps `ui/Nest.jsx`
  and draws the landing tiles. Task 1 builds it; every other task uses it.
- **Each page task** rebuilds its page as Play layers with their own addresses, adds a pure moment detector tested
  with `node:test`, and exports its landing tile (`ScoreTile`, `CompareTile`, `PointsTile`, `BadgesTile`,
  `LeagueTile`). The tile reads what the landing or Home already reads, reports the page's moments, and shows NEW.
- **The landing task runs last.** It composes the hero and the tiles, and retires the old picks screen.
- No server, migration, Edge function, data shape or token change.

**Tech stack:** React 19, plain CSS under `.gx` with `--gx-` tokens, `node:test` for `tests/*.test.mjs`, Vitest
for `tests/*.test.jsx` (static-markup renders), Playwright for `tests/cloud-browser/*.spec.js`.

**Spec:** `docs/superpowers/specs/2026-11-02-design-overhaul-design.md` (D-69), sections 2 (step 1 answers), 3, 4, 5,
6 "Step 1 · Play", 7, 8 and 9. Mockups: the private canvas
[GTL Design Overhaul Mockups](https://claude.ai/artifact/YBJmR5XUV59juyGKPGphJ7), rows P1 to P6 (sample data).

**Before you start:** this builds on step 0 (PR #428, merged) and waits for Sean's word to build. Start from a freshly
fetched `origin/main` in its own worktree (`docs/REPOSITORY_SYNC.md`). In a new worktree, link `node_modules` and make
local PGlite available in `.local/sql-check`, or the PGlite browser specs skip silently; every browser report must say
`skipped 0`.

## Global Constraints

Copied from the spec. Each task's requirements include these.

- **Sean's choices (November 3):** P1B, P2B, P3B, P4A, P5A, P6A, as section 2 of the spec and the D-69 addendum
  describe them. The mockups set the layout; the app's kit, tokens and copy rules set the look.
- **Motion (D-58):** durations tap 100, quick 160, base 240, exit 200, big 600 ms through `--gx-dur-*`; easings
  through `--gx-ease-*`. "Only transform and opacity animate." "One big moment at a time, never on page load." "The
  LIVE dot is the only loop." Reduced motion (the device setting or `data-motion="reduce"`) "stops every animation,
  transition, count-up and buzz. Words and final numbers always show."
- **Moments:** "A moment plays only on confirmed data", meaning a fresh server read; "a request that is still pending
  confirms nothing." "It never replays." "A result from while you were away is marked NEW on its tile, and its moment
  plays the first time you open the card that holds it." "A loss or miss stays quiet." Sizes (Q3): lock-in small,
  whole week locked small, Bullseye big, week final big, rank up small, reaching 1st big, Points exact big, badge or
  award big, Pick streak small.
- **Nesting (D-66, spec 4.1):** "One layer, one job. One picture and one big number per unit. No surface sentence over
  twelve words. Parents stay as lips, and every layer has its own address." Lips are real buttons named "Back to …".
  A reload or a shared link reopens a layer, browser Back closes one layer, and focus moves to the new heading.
  "Sheets stay only where a short task floats over a page: comments, reactors, the reactions popover, and the menu."
- **Restraint (D-38):** one job and one lime button per screen; at most six numbers per card; never color alone;
  faces first; fine print behind ⓘ.
- **Gates (D-31, D-36) and D-23:** "no hidden pick, line or market shows before its gate opens." Nothing a player
  entered is deleted, moved or hidden. Teams show as marks (D-62).
- **Phone rules:** no sideways scroll at 320 and 390 px in Light and Dark; targets of at least 44 px; no text under
  12 px and no clipped text; axe clean; "no transform, filter or will-change on any ancestor of the tab bar, dock or
  top bar"; every stylesheet passes `tests/next-tokens.test.mjs` (gx- prefix, tokens only, keyframes animate only
  transform and opacity, reduced motion stops everything).
- **Old-app retirement (spec test 13):** "after each step, its rebuilt pages no longer import the old
  `web/src/*.jsx` screen they replace."
- **Frontend only:** no deploy, migration or workflow run. Use only reads that exist today; the Play landing adds no
  network read beyond what it or Home already makes.
- **Files:** LF line endings in every touched file. Check `git diff --cached --stat` and `git ls-files --eol <files>`
  before each commit. Commit only named files.
- **Commits:** every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Test commands

- One `node:test` file: `node --test tests/<file>.test.mjs`
- One Vitest file: `npx vitest run tests/<file>.test.jsx`
- The full local suite on this PC: `node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run`. Default
  concurrency runs out of commit memory here.
- One browser spec: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/<file>.spec.js`. It needs
  local PGlite in `.local/sql-check`; check that the report says `skipped 0`.
- Type check and build: `npm run typecheck && npm run build`.

## Decisions for Sean

Approving this plan approves these. Each one follows from the spec or his six choices, but it changes or removes
something a player sees today, so it is listed here. Task 8 records the approved ones as a D-69 addendum.

- **Compare (task 3, narrows D-53's "one, several or all players"):** one other member at a time, chosen by face, or a
  last "Everyone" chip that keeps today's league average. Choosing several players at once and the per-player sample
  table retire. Week range, full season, team and matchup stay behind the filter button. The head-to-head card Sean
  chose shows eight numbers, over D-38's six; it is kept as chosen.
- **League (task 6):** `#play/league` opens the board (it opened the feed); the feed and History are layers. The season
  race strip, the "Compare players in …" button and the "Refresh Community" and "Refresh group" buttons retire (the app
  refreshes on focus and on its timer, and every failed read keeps Try again). The board shows six rows plus yours,
  then "N more on the board". History's week tiles show your rank that week, which no screen shows today.
- **Rank moments (task 6):** the rank toast is replaced by engine moments: up is small (the rank chip pops), reaching
  1st is the big card, a drop is quiet.
- **Badges (task 5):** the badge sheet retires; every badge opens its layer. Another member's badge, opened from the
  League board, puts that member's account id in the address (the router already allows account ids).
- **Guess the Points (task 4):** a slot is a layer, not a sheet: Back and the week lip leave it, Escape no longer does,
  and leaving with an unsaved guess asks first (the sheet's Close dropped it). Below 360 px the slot tiles stack in one
  column. A slot tile's spoken name no longer lists other members' guesses or the House; the slot layer has them.
- **Picks (task 7, D-23):** the new app draws per-game cards for every rule set. On a server without per-game rules
  they are read-only, so the whole-market Save draft, Submit and whole-week sit-out stay in the old app only. Hosted
  always reports per-game rules. Every saved guess, draft and receipt still shows.
- **Your score (task 2):** the rank chip is the season rank ("Season 3rd ▲ 2"); no fair week rank exists mid-week. A
  pick receipt's "View weekly score" now opens that game's own layer. "Compare players" stays as a quiet button.
- **Bullseye plays once (tasks 2 and 5):** the score moment and the Bullseye badge share one id, so one exact guess
  celebrates once, whichever arrives first.
- **The Play landing (task 7):** the eyebrow is grey, not lime as in the mockup (D-38 keeps lime for the one button);
  the kickoff line adds "PT"; the reminder prompt sits under the hero. The Your score tile uses the season-score read
  Home already makes (`home-score`), so opening Play before Home makes that one request.
- **Motion (task 1b):** each navigation moves once: a tab change fades the content, and a card opening inside a tab
  rises. This settles two step 0 follow-ups.

## Task map

Run the tasks in this order, one at a time; each ends with its own tests passing and its own commit. Every task's
"Notes" section at its end records what its author ran and what they could not check.

| Task | What it builds | Owns |
|---|---|---|
| 1 | The Play frame: `PlayLayer` and its lips, `openPlay`, `PlayTile`, `WeekChips`, `FilterToggle`, the Play moment scopes, the celebration card's second button, the pop latch | `play/PlayLayer.jsx`, `PlayTile.jsx`, `WeekChips.jsx`, `FilterToggle.jsx`, `playFrame.css`; `moments/catalog.js`, `play.js`, `MomentsProvider.jsx`; `features/FlashOverlay.jsx` |
| 1b | One motion per navigation | `shell/tabFade.js`, `shell/Shell.jsx` (one line), `moments/launch.js`, `ui/Nest.jsx` |
| 2a–2c | Your score (Q1-B) and its game layer (P2B), the score moments, `ScoreTile`; the Play layer addresses in `shell/state.js` that tasks 4 and 5 rely on | `play/WeeklyScore.jsx`, its new rule and hook modules, `shell/state.js` |
| 3a–3c | Compare (P3B), `CompareTile` | `play/ScoreComparison.jsx`, its new rules module |
| 4a–4b | Guess the Points slot tiles and slot layers (P4A), the Points exact moment, `PointsTile` | `play/points/` |
| 5a–5e | Badges and awards (P5A), the Pick streak moment, the badge sheet's retirement, `BadgesTile` | `features/` |
| 6a–6b | League board first (P6A), the feed layer, rank moments, History and its week layer, `LeagueTile` | `league/`, `feed/`, `shell/state.js` (League week) |
| 7a–7b | The Play landing (P1B) composing the five tiles, Whole week locked, the picks without the old editor | `play/Play.jsx`, `PerGamePlay.jsx`, `WeekProgress.jsx` |
| 8 | The picks' Play lip, dead styles, the phone and fixed-bar sweeps, old-app retirement, the decisions addendum, the register, the PR | specs, docs |

Shared names, used exactly as written: `PLAY_ROOT`, `CLOSED_LAYER`, `openPlay(shell, section, view)`, `playLips`,
`usePlayLips`, `PlayLayer`, `PlayTile`, `WeekChips`, `weekList`, `FilterToggle`, `SCOPES.score | picks | points`,
`flashDestination`, `popLatch`; each page's tile is `XTile({ onOpen })` (`PointsTile` also takes `ref`).

---

## Task 1 · The shared frame

### Task 1: The Play frame (layer, lips, tile, week chips, filter toggle, scopes)

Every later task builds on these five small pieces. Nothing on screen changes yet.

**Files:**
- Create: `web/src/next/play/PlayLayer.jsx`, `web/src/next/play/PlayTile.jsx`, `web/src/next/play/WeekChips.jsx`,
  `web/src/next/play/FilterToggle.jsx`, `web/src/next/play/playFrame.css`
- Modify: `web/src/next/moments/catalog.js` (`SCOPES`), `web/src/next/moments/play.js` (`flashItem` carries the
  moment's kind; new `flashDestination`), `web/src/next/features/FlashOverlay.jsx` (the second button follows the
  moments it shows), `web/src/next/moments/MomentsProvider.jsx` (`usePopped` pops only an element on screen when the
  moment plays; new pure `popLatch` in `moments/play.js`)
- Test: `tests/next-play-frame.test.jsx` (new), `tests/next-moments.test.mjs` (one new test),
  `tests/next-moments-play.test.mjs` (one new test)

Why the overlay changes here: step 1 adds big moments that are not badges (Bullseye, Week final, Points exact,
reaching 1st). They play through the same `ov.flash` card (spec 4.2 rule 4, one card however many arrive), and today
that card's second button always says "See badges".

Why `usePopped` changes here: the provider's popped set lasts the session, so today an element that mounts after its
small moment played (going back to a tile, reopening a layer) renders `data-moment="pop"` again and replays the pop.
Spec 4.2 rule 2 says a moment never replays. Tasks 2, 4, 5 and 6 all pop elements that remount.

**Interfaces:**
- Produces:
  - `PLAY_ROOT` (`{ key: 'play', label: 'Play' }`), `CLOSED_LAYER` (`{ layer: undefined, item: undefined,
    scoreGame: undefined }`), `openPlay(shell, section, view = {})`, `playLips(shell, parents)`,
    `usePlayLips(parents)` and `PlayLayer({ label, parents, layer, title, info, className, children })` from
    `play/PlayLayer.jsx`. A parent is `{ key, label, open }`; `open()` navigates to that parent layer.
  - `PlayTile({ ref, label, icon, big, sub, tone, isNew, onClick, ariaLabel })` from `play/PlayTile.jsx`. `icon` is an
    `ui/Icon` name or a Lucide component; `tone` is `'plain' | 'good' | 'warn'`; `ref` reaches the button (the
    landing returns focus to the Points tile when the reminder prompt leaves); `ariaLabel` is the whole spoken name,
    and the caller includes "new" in it when `isNew`.
  - `WeekChips({ label, weeks, week, onWeek, seasons, season, onSeason })` and `weekList(weeks)` from
    `play/WeekChips.jsx`.
  - `FilterToggle({ label, active, children })` from `play/FilterToggle.jsx`.
  - `SCOPES.score`, `SCOPES.picks`, `SCOPES.points` (new) beside `home`, `play`, `league`, `features`.
  - `flashItem(m)` now adds `kind` when the moment has one; `flashDestination(items) → { label, section, view? } | null`
    from `moments/play.js`. Badges and awards (or items with no kind) → "See badges"; Bullseye and Week final →
    "See your score"; Points exact → "See Points"; reaching 1st → "See the board" (League, `view: 'board'`); a mix of
    places → null, and the card shows only "Nice".
  - `popLatch(latch, id, popped) → { latch, show }` from `moments/play.js`, and `usePopped(id)` built on it: true only
    when the pop happens while the calling element is mounted.
  - Every big-moment candidate from tasks 2 to 6 sets `kind` (it already must, for its size) and an `icon` path for the
    card's 96 tile (`features/icons.js` `BADGE_ICONS.bullseye` for score moments, `AWARD_ICONS.spread_winner` (the
    trophy) for reaching 1st).

- [ ] **Step 1: Write the failing tests**

Add to `tests/next-moments.test.mjs`, after the existing `moments size` test:

```js
test('scopes: Play cards that hold moments each have a scope, so a landing tile can show NEW for its own card', () => {
  assert.deepEqual({ ...SCOPES }, { home: 'home', play: 'play', league: 'league', features: 'features', score: 'score', picks: 'picks', points: 'points' });
});
```

Add to `tests/next-moments-play.test.mjs` (extend its import to `import { flashDestination, flashItem, playBig } from
'../web/src/next/moments/play.js';`):

```js
test('flash destination: the card\'s second button goes where the moment lives; a mix of places offers none', () => {
  assert.equal(flashItem(moment('a', { kind: 'bullseye' })).kind, 'bullseye');
  assert.equal('kind' in flashItem(moment('b')), false, 'a moment without a kind adds none');
  assert.deepEqual(flashDestination([{ kind: 'badge' }, { kind: 'award' }]), { label: 'See badges', section: 'features' });
  assert.deepEqual(flashDestination([{ kind: 'bullseye' }, { kind: 'weekFinal' }]), { label: 'See your score', section: 'score' });
  assert.deepEqual(flashDestination([{ kind: 'pointsExact' }]), { label: 'See Points', section: 'points' });
  assert.deepEqual(flashDestination([{ kind: 'rankFirst' }]), { label: 'See the board', section: 'league', view: { view: 'board' } });
  assert.equal(flashDestination([{ kind: 'badge' }, { kind: 'bullseye' }]), null, 'two places: no second button');
  assert.deepEqual(flashDestination([{}]), { label: 'See badges', section: 'features' }, 'an item with no kind keeps today\'s button');
});

test('pop latch: a small moment pops the element on screen when it plays, and never again for an element mounted later', () => {
  let step = popLatch(null, 'rank:1', false);
  assert.equal(step.show, false, 'nothing has played');
  step = popLatch(step.latch, 'rank:1', true);
  assert.equal(step.show, true, 'it played while this element was mounted');
  assert.equal(popLatch(null, 'rank:1', true).show, false, 'an element mounted after the pop stays still (going back never replays)');
  const other = popLatch(step.latch, 'rank:2', false);
  assert.equal(other.show, false);
  assert.equal(popLatch(other.latch, 'rank:2', true).show, true, 'a new id starts its own latch');
});
```

Extend that file's import to `import { flashDestination, flashItem, playBig, popLatch } from
'../web/src/next/moments/play.js';`.

Create `tests/next-play-frame.test.jsx`:

```jsx
// D-69 step 1, the Play frame (docs/superpowers/specs/2026-11-02-design-overhaul-design.md sections 4.1, 5 and 6):
// every Play section is a nesting card under a "Play" lip; landing tiles, week chips and the filter toggle are shared.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const { CLOSED_LAYER, PLAY_ROOT, PlayLayer, openPlay, playLips } = await import('../web/src/next/play/PlayLayer.jsx');
const { PlayTile } = await import('../web/src/next/play/PlayTile.jsx');
const { WeekChips, weekList } = await import('../web/src/next/play/WeekChips.jsx');
const { FilterToggle } = await import('../web/src/next/play/FilterToggle.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');

const nodes = html => [...walk(parseMarkup(html))];
const buttons = html => nodes(html).filter(n => n.tag === 'button');
const shellWith = () => ({ go: vi.fn(), setView: vi.fn(), state: { trail: [] } });
const render = (ui, shell = shellWith()) => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{ui}</div></ShellContext.Provider>);

describe('PlayLayer', () => {
  it('lips: the Play root lip comes first and opens the landing with every layer key cleared, so reopening a section never lands on an old layer', () => {
    const shell = shellWith(), toScore = vi.fn();
    const lips = playLips(shell, [{ key: 'score', label: 'Your score', open: toScore }]);
    expect(lips.map(l => [l.key, l.label])).toEqual([[PLAY_ROOT.key, 'Play'], ['score', 'Your score']]);
    lips[0].onOpen();
    expect(shell.go).toHaveBeenCalledWith('play', { section: undefined, ...CLOSED_LAYER });
    lips[1].onOpen();
    expect(toScore).toHaveBeenCalledTimes(1);
  });

  it('openPlay: a landing tile opens its section on its first layer, never a layer left open earlier', () => {
    const shell = shellWith();
    openPlay(shell, 'score');
    expect(shell.go).toHaveBeenCalledWith('play', { section: 'score', ...CLOSED_LAYER });
    openPlay(shell, 'league', { view: 'board' });
    expect(shell.go).toHaveBeenLastCalledWith('play', { section: 'league', ...CLOSED_LAYER, view: 'board' });
  });

  it('renders a nesting card: real "Back to" lip buttons, the heading, and clean markup', () => {
    const html = render(<PlayLayer label="Your score" layer="score:game:SEA-DEN" title="SEA @ DEN" parents={[{ key: 'score', label: 'Your score', open() {} }]}><p>Body</p></PlayLayer>);
    expect(buttons(html).map(nameFrom)).toEqual(['Back to Play', 'Back to Your score']);
    expect(html).toContain('SEA @ DEN');
    expect(markupProblems(html)).toEqual([]);
  });
});

describe('PlayTile', () => {
  it('one tile: label, one big number, one line, and NEW only when its card holds a waiting moment', () => {
    const quiet = render(<PlayTile label="Your score" icon="chart" big="32" sub="Week 8 · ▲ 2" tone="good" ariaLabel="Your score, 32 points, Week 8, up 2" onClick={() => {}}/>);
    const [tile] = buttons(quiet);
    expect(nameFrom(tile)).toBe('Your score, 32 points, Week 8, up 2');
    expect(quiet).toContain('gx-play-tile-sub--good');
    expect(quiet).not.toContain('NEW');
    const fresh = render(<PlayTile label="Badges" icon="trophy" big="4" sub="New: Called the Move" isNew ariaLabel="Badges, 4 earned, new badge" onClick={() => {}}/>);
    expect(fresh).toContain('NEW');
    expect(markupProblems(fresh)).toEqual([]);
  });

  it('an unknown tone falls back to plain, so a state color never appears without its word', () => {
    const html = render(<PlayTile label="League" icon="trophy" big="3rd" sub="4 new posts" tone="loud" ariaLabel="League, 3rd" onClick={() => {}}/>);
    expect(html).toContain('gx-play-tile-sub--plain');
  });
});

describe('WeekChips', () => {
  it('weekList: weeks ascending with no repeats and no bad values', () => {
    expect(weekList([8, 7, 8, 9, null, 'x', 0])).toEqual([7, 8, 9]);
  });

  it('week chips replace the dropdowns and Previous/Next: the chosen week is pressed, 44px chips, Season only with an older season', () => {
    const html = render(<WeekChips label="Week" weeks={[9, 7, 8]} week={8} onWeek={() => {}} seasons={[2026]} season={2026} onSeason={() => {}}/>);
    const chips = buttons(html);
    expect(chips.map(nameFrom)).toEqual(['Week 7', 'Week 8', 'Week 9']);
    expect(chips.find(c => nameFrom(c) === 'Week 8').attrs['aria-pressed']).toBe('true');
    expect(html).not.toContain('Season');
    const older = render(<WeekChips label="Week" weeks={[8]} week={8} onWeek={() => {}} seasons={[2026, 2025]} season={2026} onSeason={() => {}}/>);
    const season = buttons(older)[0];
    expect(nameFrom(season)).toBe('Season 2026');
    expect(season.attrs['aria-expanded']).toBe('false');
    expect(markupProblems(older)).toEqual([]);
  });
});

describe('FilterToggle', () => {
  it('filters sit behind one icon button that names its state; the panel is in place and hidden until opened', () => {
    const html = render(<FilterToggle active><label>Team<select><option>All teams</option></select></label></FilterToggle>);
    const [button] = buttons(html);
    expect(nameFrom(button)).toBe('Filter games, on');
    expect(button.attrs['aria-expanded']).toBe('false');
    const panel = nodes(html).find(n => n.attrs?.id === button.attrs['aria-controls']);
    expect(panel.attrs.hidden).toBeDefined();
    expect(nameFrom(buttons(render(<FilterToggle><span>x</span></FilterToggle>))[0])).toBe('Filter games');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/next-moments.test.mjs`
Expected: FAIL in `scopes:` (the object has four keys).

Run: `node --test tests/next-moments-play.test.mjs`
Expected: FAIL, "flashDestination is not a function" (the named import is undefined).

Run: `npx vitest run tests/next-play-frame.test.jsx`
Expected: FAIL, "Failed to load url ../web/src/next/play/PlayLayer.jsx".

- [ ] **Step 3: Add the scopes**

In `web/src/next/moments/catalog.js` replace the `SCOPES` line with:

```js
/** The cards that hold moments. A moment plays when one of its scopes is open (see detect.js). D-69 step 1 adds the
 * Play cards that hold their own moments: Your score (Bullseye, Week final), the picks (Whole week locked) and Guess
 * the Points (Points exact). */
export const SCOPES = Object.freeze({ home: 'home', play: 'play', league: 'league', features: 'features', score: 'score', picks: 'picks', points: 'points' });
```

In `web/src/next/moments/play.js` replace the `flashItem` line with:

```js
/** The overlay's item from a moment (FlashOverlay reads key, title, meta, parts, icon, rarity and kind). */
export const flashItem = m => ({ key: m.id, title: m.title, meta: m.meta, parts: m.parts, icon: m.icon, rarity: m.rarity, ...(m.kind ? { kind: m.kind } : {}) });

// Where the card's second button goes, by the place that holds each kind of moment. A kind not listed (or none, as in
// items made before D-69 step 1) is a badge or award.
const PLACES = Object.freeze({
  features: { label: 'See badges', section: 'features' },
  score: { label: 'See your score', section: 'score' },
  points: { label: 'See Points', section: 'points' },
  board: { label: 'See the board', section: 'league', view: { view: 'board' } },
});
const PLACE_OF = Object.freeze({ bullseye: 'score', weekFinal: 'score', pointsExact: 'points', rankFirst: 'board' });

/** `{ label, section, view? }` for the card's second button, or null when its moments live in different places. */
export function flashDestination(items = []) {
  const places = new Set(items.map(item => PLACE_OF[item?.kind] ?? 'features'));
  return places.size === 1 ? PLACES[[...places][0]] : null;
}
```

Append to `web/src/next/moments/play.js`:

```js
/**
 * Small-moment pops, per element: `latch` remembers whether the moment had already played when this element first saw
 * the id. It shows the pop only when the moment plays after that, so an element mounted later stays still.
 */
export function popLatch(latch, id, popped) {
  const next = latch?.id === id ? latch : { id, popped };
  return { latch: next, show: popped && !next.popped };
}
```

In `web/src/next/moments/MomentsProvider.jsx`:
- keep the React import as it is (it already imports `useRef`);
- change `import { playBig } from './play.js';` to `import { playBig, popLatch } from './play.js';`;
- replace `usePopped` with:

```jsx
/**
 * True once the small moment `id` has played while the calling element was on screen: render `data-moment="pop"` on
 * it. An element that mounts after the pop stays still, so going back to a card never replays it (spec 4.2 rule 2).
 */
export function usePopped(id) {
  const ctx = useContext(MomentsContext);
  const latch = useRef(null);
  const step = popLatch(latch.current, id, Boolean(ctx?.popped.has(id)));
  latch.current = step.latch;
  return step.show;
}
```

In `web/src/next/features/FlashOverlay.jsx`:
- add `import { flashDestination } from '../moments/play.js';` and `import { openPlay } from '../play/PlayLayer.jsx';`
  after the existing imports;
- after the line `const first = items[0], many = …;` add `const place = flashDestination(items);`;
- replace the "See badges" button line with:

```jsx
      {place ? <Button variant="ghost" onClick={() => { close(); openPlay(shell, place.section, place.view); }}>{place.label}</Button> : null}
```

- in the header comment, replace "the celebration for a new badge or award of your own" with "the celebration for a
  big moment of your own (a new badge or award, a Bullseye, a week final, a Points exact guess, reaching 1st)".

- [ ] **Step 4: Write the frame**

Create `web/src/next/play/PlayLayer.jsx`:

```jsx
// D-69 step 1: every Play section is a nesting card (ui/Nest.jsx, D-66) under a "Play" lip. A section's deeper layers
// add their parents as lips, outermost first. The Play lip opens the landing with every layer key cleared, and a
// landing tile opens its section the same way (`openPlay`), so a section never reopens on a layer left open earlier.
import { Nest } from '../ui/index.js';
import { useShell } from '../shell/context.js';

export const PLAY_ROOT = Object.freeze({ key: 'play', label: 'Play' });
/** The generic layer keys (shell/router.js KEYS) plus Your score's game key, all closed. */
export const CLOSED_LAYER = Object.freeze({ layer: undefined, item: undefined, scoreGame: undefined });

/** Opens a Play section on its first layer. `view` adds that section's own keys (League's `view`, a market). */
export function openPlay(shell, section, view = {}) {
  shell.go('play', { section, ...CLOSED_LAYER, ...view });
}

/** Nest lips for a Play layer: the Play root, then each parent `{ key, label, open }`. */
export function playLips(shell, parents = []) {
  return [
    { key: PLAY_ROOT.key, label: PLAY_ROOT.label, onOpen: () => shell.go('play', { section: undefined, ...CLOSED_LAYER }) },
    ...parents.map(p => ({ key: p.key, label: p.label, onOpen: p.open })),
  ];
}

export function usePlayLips(parents = []) {
  return playLips(useShell(), parents);
}

/** One Play layer. `layer` names it uniquely ('score', 'score:game:SEA-DEN'); it drives entrance motion and focus. */
export function PlayLayer({ label, parents = [], layer, title, info, className, children }) {
  return <Nest label={label} lips={usePlayLips(parents)} layer={layer} title={title} info={info} className={className}>{children}</Nest>;
}
```

Create `web/src/next/play/PlayTile.jsx`:

```jsx
// D-69 step 1 (spec section 5, "Under it, tiles in two columns"): one Play landing tile. A label and an icon, one big
// number, one short line, and NEW when its card holds a moment that waits (moments/MomentsProvider.jsx useNewCount).
// A toned line always carries its own word or symbol ("▲ 2", "New: …"), never color alone (D-38).
import { Icon, cx } from '../ui/index.js';
import './playFrame.css';

const TONES = new Set(['plain', 'good', 'warn']);

/** `ref` (a React 19 ref prop) reaches the button, so the landing can return focus to a tile. `ariaLabel` is the whole
 * spoken name: the caller says "new" in it when `isNew` (the visible NEW tag is the same word). */
export function PlayTile({ ref, label, icon, big, sub, tone = 'plain', isNew = false, onClick, ariaLabel }) {
  const t = TONES.has(tone) ? tone : 'plain';
  return (
    <button ref={ref} type="button" className="gx-nest-tile gx-play-tile" aria-label={ariaLabel} onClick={onClick}>
      <span className="gx-nest-tile-top">
        <span className="gx-nest-tile-label">{label}</span>
        {icon ? <Icon icon={icon} size={20}/> : null}
      </span>
      <span className="gx-n-l gx-nest-num">{big}</span>
      <span className="gx-play-tile-foot">
        <span className={cx('gx-t-meta', 'gx-play-tile-sub', `gx-play-tile-sub--${t}`)}>{sub}</span>
        {isNew ? <span className="gx-t-micro gx-play-tile-new">NEW</span> : null}
      </span>
    </button>
  );
}
```

Create `web/src/next/play/WeekChips.jsx`:

```jsx
// D-69 step 1 (spec section 6, Your score): week chips replace the season and week dropdowns and Previous/Next. Older
// seasons sit behind one "Season" chip that opens a row of season chips in place. Each chip is the kit's 44px Chip,
// selected lime with a check (never color alone).
import { useId, useState } from 'react';
import { Chip } from '../ui/index.js';
import './playFrame.css';

/** Weeks ascending, whole and positive, without repeats. */
export function weekList(weeks = []) {
  return [...new Set(weeks.filter(w => Number.isInteger(w) && w > 0))].sort((a, b) => a - b);
}

export function WeekChips({ label, weeks, week, onWeek, seasons = [], season, onSeason }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const older = seasons.length > 1;
  return (
    <div className="gx-week-chips-wrap">
      <div className="gx-week-chips" role="group" aria-label={label}>
        {older ? <Chip text aria-expanded={open ? 'true' : 'false'} aria-controls={panel} aria-pressed={undefined} onClick={() => setOpen(v => !v)}>Season {season}</Chip> : null}
        {weekList(weeks).map(w => <Chip key={w} text selected={w === week} onClick={() => onWeek(w)}>Week {w}</Chip>)}
      </div>
      {older ? (
        <div id={panel} className="gx-week-chips" role="group" aria-label="Season" hidden={!open}>
          {[...seasons].sort((a, b) => b - a).map(s => <Chip key={s} text selected={s === season} onClick={() => { setOpen(false); onSeason(s); }}>{s}</Chip>)}
        </div>
      ) : null}
    </div>
  );
}
```

The Season chip is a disclosure, not a toggle, so it passes `aria-pressed={undefined}` after `Chip` sets it: check
`ui/Chip.jsx` spreads `...rest` after its own `aria-pressed`, which it does (`aria-pressed={…}` then `{...rest}`), so
the explicit `undefined` removes it.

Create `web/src/next/play/FilterToggle.jsx`:

```jsx
// D-69 step 1 (spec section 6, Your score: "Filters move behind a filter icon button"): one 44px icon button that
// says whether a filter is on, and its panel in place under it. Its own open state; nothing navigates.
import { useId, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { IconButton } from '../ui/index.js';
import './playFrame.css';

export function FilterToggle({ label = 'Filter games', active = false, children }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className="gx-filter-toggle">
      <IconButton icon={SlidersHorizontal} label={active ? `${label}, on` : label} aria-expanded={open ? 'true' : 'false'} aria-controls={panel}
        className={active ? 'gx-filter-toggle-on' : undefined} onClick={() => setOpen(v => !v)}/>
      <div id={panel} className="gx-filter-panel gx-vstack gx-gap-12" hidden={!open}>{children}</div>
    </div>
  );
}
```

Create `web/src/next/play/playFrame.css`:

```css
/* D-69 step 1: the Play frame's shared pieces (PlayTile, WeekChips, FilterToggle). Tokens only. */
.gx .gx-play-tile { justify-content: space-between; min-height: 112px; }
.gx .gx-play-tile-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-play-tile-sub { min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.gx .gx-play-tile-sub--plain { color: var(--gx-text-2); }
.gx .gx-play-tile-sub--good { color: var(--gx-win); }
.gx .gx-play-tile-sub--warn { color: var(--gx-pending); }
.gx .gx-play-tile-new { flex: none; padding: 0 var(--gx-space-2); border-radius: var(--gx-radius-xs); background: var(--gx-accent); color: var(--gx-accent-text); }
.gx .gx-week-chips-wrap { display: flex; flex-direction: column; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-week-chips { display: flex; gap: var(--gx-space-2); min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
.gx .gx-week-chips > .gx-chip { flex: none; }
.gx .gx-filter-toggle { display: flex; flex-direction: column; align-items: flex-end; gap: var(--gx-space-3); }
.gx .gx-filter-panel { align-self: stretch; }
.gx .gx-filter-toggle-on { box-shadow: inset 0 0 0 2px var(--gx-accent-ink); }
@media (forced-colors: active) {
  .gx .gx-play-tile-new { border: 1px solid CanvasText; }
  .gx .gx-filter-toggle-on { outline: 2px solid Highlight; }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/next-moments.test.mjs tests/next-moments-play.test.mjs tests/next-tokens.test.mjs && npx vitest run tests/next-play-frame.test.jsx tests/next-feed.test.jsx tests/next-matchup-marks.test.jsx tests/next-moments-ui.test.jsx`
Expected: PASS. `playFrame.css` is checked by the tokens test (it reads every stylesheet under `web/src/next`), and
`next-feed.test.jsx` still finds "See badges" on a badge card.

- [ ] **Step 6: Commit**

```bash
git add web/src/next/play/PlayLayer.jsx web/src/next/play/PlayTile.jsx web/src/next/play/WeekChips.jsx web/src/next/play/FilterToggle.jsx web/src/next/play/playFrame.css web/src/next/moments/catalog.js web/src/next/moments/play.js web/src/next/moments/MomentsProvider.jsx web/src/next/features/FlashOverlay.jsx tests/next-play-frame.test.jsx tests/next-moments.test.mjs tests/next-moments-play.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/play/PlayLayer.jsx web/src/next/play/playFrame.css
git commit -m "Play frame: PlayLayer lips, landing tile, week chips, filter toggle and the Play moment scopes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1b: One motion per navigation (the step 0 fade follow-ups)

Step 0's register entry left two follow-ups: "the tab fade stays on once it starts" and "a tab change into a Nest moves
twice". Step 1 turns every Play section into a nesting card, so both would show on every Play tap: opening Your score
from the landing would fade the screen and also rise its card. Spec 4.3: "A tab change fades only the content area over
160 ms", and "A new layer rises in over 240 ms". This task makes each navigation play exactly one of them.

**Files:**
- Modify: `web/src/next/shell/tabFade.js` (the fade belongs to the one navigation that changed tabs),
  `web/src/next/shell/Shell.jsx` (one line), `web/src/next/moments/launch.js` (`tabFading`, `setTabFading`),
  `web/src/next/ui/Nest.jsx` (no entrance for a card that first shows inside a tab fade)
- Test: `tests/next-tab-fade.test.mjs` (rewrite), `tests/next-nest-motion.test.jsx` (one new test)

**Interfaces:**
- Produces: `tabFadeNext({ fadeNav, prevTab, tab, nav, settled }) → { fadeNav, prevTab }`,
  `fadesNow(step, nav) → boolean`, `useTabFade(tab, nav) → boolean` (tabFade.js); `tabFading() → boolean` and
  `setTabFading(value)` (launch.js, reset by `resetLaunch`); `nestEnter({ …, tabFade })` (Nest.jsx).

- [ ] **Step 1: Write the failing tests**

Replace the four tests in `tests/next-tab-fade.test.mjs` (keep its imports, and import `fadesNow` beside
`tabFadeNext`) with:

```js
// D-69 4.3: a tab change made after the launch settled fades the content; nothing else does.
const step = (prev, tab, nav, settled = true) => tabFadeNext({ ...prev, tab, nav, settled });

test('before the launch settles a tab change only moves the starting tab: a deep link or restore never fades', () => {
  const s = step({ fadeNav: null, prevTab: 'home' }, 'play', 3, false);
  assert.deepEqual(s, { fadeNav: null, prevTab: 'play' });
  assert.equal(fadesNow(s, 3), false);
});

test('after settling, staying on the same tab never fades (a deep-linked screen does not fade on first press)', () => {
  const s = step({ fadeNav: null, prevTab: 'play' }, 'play', 4);
  assert.equal(fadesNow(s, 4), false);
});

test('after settling, the navigation that lands on another tab fades, and a re-render of it keeps the fade', () => {
  const s = step({ fadeNav: null, prevTab: 'home' }, 'bets', 5);
  assert.equal(fadesNow(s, 5), true);
  assert.equal(fadesNow(step(s, 'bets', 5), 5), true, 'a data load inside the same navigation is the same fade');
});

test('the next navigation inside that tab does not fade: a nesting card opening there rises on its own (no double motion)', () => {
  const tabbed = step({ fadeNav: null, prevTab: 'home' }, 'play', 6);
  const inside = step(tabbed, 'play', 7);
  assert.equal(fadesNow(inside, 7), false);
  assert.equal(fadesNow(step(inside, 'home', 8), 8), true, 'going back to the first tab is a tab change, so it fades again');
});
```

Add to `tests/next-nest-motion.test.jsx`, inside `describe('nestEnter', …)`:

```jsx
  it('a card that first shows inside a tab fade does not rise too (one motion per navigation); its later layer changes do', () => {
    expect(nestEnter({ navigated: true, tabFade: true, mounted: false, prevDepth: 0, depth: 0, layer: 'a' })).toBeUndefined();
    expect(nestEnter({ navigated: true, tabFade: false, mounted: true, prevDepth: 0, depth: 1, prevLayer: 'a', layer: 'b' })).toBe('in');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/next-tab-fade.test.mjs && npx vitest run tests/next-nest-motion.test.jsx`
Expected: FAIL (`fadesNow` is not exported; `nestEnter` returns `'in'` for the first case).

- [ ] **Step 3: Implement**

Replace `web/src/next/shell/tabFade.js` with:

```js
// D-69 section 4.3: a tab change the member makes after the launch fades in the new tab's screen over the quick
// duration. Only that navigation fades: the next one inside the tab (opening a section, a nesting card's layer) plays
// that card's own entrance instead, so each navigation moves once. The top bar, tab bar and dock never animate (the
// fade rule targets only <main>'s screen, a sibling of them). A tab change before the first press (a deep link, a
// restore) never counts: that screen is the launch screen.
import { useRef } from 'react';
import { isSettled, setTabFading } from '../moments/launch.js';

/** The rule, pure. `fadeNav` is the navigation count (`state.nav`) that changed tabs; `prevTab` the tab before. */
export function tabFadeNext({ fadeNav = null, prevTab, tab, nav, settled }) {
  if (!settled) return { fadeNav: null, prevTab: tab };
  return tab !== prevTab ? { fadeNav: nav, prevTab: tab } : { fadeNav, prevTab };
}

/** True while the shell shows the navigation that changed tabs. */
export const fadesNow = (step, nav) => step.fadeNav !== null && step.fadeNav === nav;

/** True for the navigation that changed tabs, and tells ui/Nest.jsx (through launch.js) so its card does not rise too. */
export function useTabFade(tab, nav) {
  const step = useRef({ fadeNav: null, prevTab: tab });
  step.current = tabFadeNext({ ...step.current, tab, nav, settled: isSettled() });
  const on = fadesNow(step.current, nav);
  setTabFading(on);
  return on;
}
```

In `web/src/next/shell/Shell.jsx` replace `const tabFade = useTabFade(state.tab);` with
`const tabFade = useTabFade(state.tab, state.nav);`.

In `web/src/next/moments/launch.js`:
- after `let navigated = false;` add `let fading = false;`;
- after the `onLaunchScreen` export add:

```js
/** True while the shell renders a tab change's fade (shell/tabFade.js sets it each render, before the screen renders). */
export const tabFading = () => fading;
export function setTabFading(value) { fading = value === true; }
```

- in `resetLaunch`, change `settled = false; navigated = false;` to `settled = false; navigated = false; fading = false;`.

In `web/src/next/ui/Nest.jsx`:
- change `import { hasNavigated } from '../moments/launch.js';` to `import { hasNavigated, tabFading } from '../moments/launch.js';`;
- replace `nestEnter` and its comment with:

```jsx
/**
 * How the card enters (D-69 section 4.3): 'in' when a deeper layer opens (or the card first shows after the member's
 * first navigation), 'back' when a parent layer is restored, and nothing on the launch screen (`navigated` false, even
 * after a scroll press), while the layer stays the same, or when the card first shows inside a tab change's fade
 * (`tabFade`: the screen already fades in, and one navigation moves once).
 */
export function nestEnter({ navigated, tabFade = false, mounted, prevDepth = 0, depth = 0, prevLayer, layer }) {
  if (!navigated) return undefined;
  if (!mounted) return tabFade ? undefined : 'in';
  if (prevLayer === layer) return undefined;
  return depth < prevDepth ? 'back' : 'in';
}
```

- in `Nest`, change `nestEnter({ navigated: hasNavigated(), mounted: ` to
  `nestEnter({ navigated: hasNavigated(), tabFade: tabFading(), mounted: ` (the rest of the call unchanged).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/next-tab-fade.test.mjs tests/next-moments.test.mjs && npx vitest run tests/next-nest-motion.test.jsx tests/next-play-nest.test.jsx tests/next-trends-nest.test.jsx tests/next-fantasy-nest.test.jsx`
Expected: PASS.

Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-moments-strict.spec.js tests/cloud-browser/four-tab-redesign.spec.js tests/cloud-browser/next-scroll-navigation.spec.js`
Expected: PASS, `skipped 0` (the bars never move; the four-tab contrast check already waits for the fade to settle).

- [ ] **Step 5: Commit**

```bash
git add web/src/next/shell/tabFade.js web/src/next/shell/Shell.jsx web/src/next/moments/launch.js web/src/next/ui/Nest.jsx tests/next-tab-fade.test.mjs tests/next-nest-motion.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/shell/tabFade.js web/src/next/ui/Nest.jsx
git commit -m "One motion per navigation: the tab fade belongs to the tab change, and a card inside it does not rise too

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2 · Your score, its game layer and the Your score tile

Spec section 6 "Your score" (mockup Q1-B), Sean's P2B game layer (`PlayGameB.dc.html`), the Bullseye and Week final
moments (spec 4.2), and `ScoreTile` for task 7's landing. Three parts a reviewer can judge apart: **2a** the pure rules
and the moments, **2b** the two layers, their addresses and the browser contracts, **2c** the landing tile.

**Assumes task 1 is merged:** `play/PlayLayer.jsx` (`PlayLayer`), `play/WeekChips.jsx` (`WeekChips`, `weeks` is an array
of week numbers), `play/FilterToggle.jsx` (`FilterToggle`), `play/PlayTile.jsx` (`PlayTile`) and `SCOPES.score` in
`moments/catalog.js`, with the props in the brief. Every code block below was run before it was written here: the pure
modules, the router and state changes and the Vitest renders passed against the real repo modules and stubs of those
four task 1 components built from the brief's interfaces [executed]: node, the 15 tests in the three new files, the 3
appended router tests, and `next-router`, `next-shell-state`, `next-four-tab-navigation`, `next-data`, `next-tab-fade`,
`next-tokens` and `next-app-view` unchanged; Vitest, the rewritten `next-scoring-ui` (10) and `next-score-tile` (4), and
`four-tab-landings`, `next-points-ui`, `next-fantasy-nest`, `next-trends-nest` and `next-trends-ui` unchanged. The
browser spec edits were not run [inspected].

The decisions this section takes (the rank chip, Week final, the Bullseye styling, Compare kept) are in the
coordinator notes at the end.

---

### Task 2a: Your score rules and the score moments (pure)

**Files:**
- Create: `web/src/next/play/yourScore.js`, `web/src/next/play/scoreMoments.js`
- Test: `tests/next-your-score.test.mjs` (new), `tests/next-score-moments.test.mjs` (new)

**Interfaces:**
- `yourScore.js`: `MAX_POINTS` (10), `GAME_NAME`, `sideText(mode, game, value)`, `numberLine({ mode, game, guess, line })
  → { caption, ticks: [{ value, label, pct }], line: { pct, label, align }, you: { pct, label, align }, gap: { left,
  width, origin } | null, aria } | null`, `rowView(row, mode) → { meta, pill: { text, tier, number }, bullseye, share }`,
  `heroModel({ mode, week, entry, rows, filtered }) → { eyebrow, points, count, share, bar, meterLabel, line, note }`,
  `layerMeta({ week, known, summary, final })`, `gameView({ row, mode, week }) → { meta, scored, points, bullseye,
  sentence, you, line, late }`, `scoreFinePrint({ entry, summary, filtered }) → string[]`, `rankChip(tile, move) →
  { rank, label, move, said } | null`, `scoreTile({ data, mode, ranks, loading, error }) → { big, sub, tone, said,
  open }`. `row` is a `scoring.js` `scoreRows` row; `tier` is `'exact' | 'good' | 'low' | 'none'`.
- `scoreMoments.js`: `scoreSource(data)`, `weekFinal(week, entry, nowMs)`, `scoreMoments(data, viewer) → candidate[]`
  (ids `score:bullseye:<season>:<week>:<mode>:<gameId>` and `score:weekFinal:<season>:<week>:<mode>`, kinds `bullseye`
  and `weekFinal`, scopes `[SCOPES.score]`), `scoreReport(read) → { source, candidates } | null`.
- Consumes: `scoring.js` (`ownEntry`, `scoreRows`, `scoreSummary`, `number`, `lateLabel`), `format.js` (`fmtSpreadPick`,
  `MINUS`), `communityFormat.js` `show`, `shared/game-features/catalog.mjs` `THRESHOLDS.exactPoints`,
  `shared/guess-board.mjs` (`MODES`, `MODE_LABEL`), `league/rankMoment.js` `ordinal`, `features/icons.js` `BADGE_ICONS`,
  `moments/catalog.js` `SCOPES`.

- [ ] **Step 1: Write the failing tests**

```js
// D-69 Play › Your score (spec section 6, mockup Q1-B) and its game layer (P2B): the pure view rules in
// web/src/next/play/yourScore.js. Each test names the contract it guards. Fixture data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { gameView, heroModel, layerMeta, numberLine, rankChip, rowView, scoreFinePrint, scoreTile } from '../web/src/next/play/yourScore.js';
import { scoreRows, scoreSummary } from '../web/src/next/play/scoring.js';

const SEA_DEN = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const LAC_LV = { id: 'LAC-LV', awayCode: 'LAC', homeCode: 'LV', kickoff: '2026-10-25T20:25:00Z' };
const pick = (gameId, guess, points, line, extra = {}) => ({ gameId, guess, lockedIn: true, lockedAt: '2026-10-21T18:00:00Z', points, reference: { value: line, source: 'Fixture median' }, ...extra });
const entry = (picks, extra = {}) => ({ userId: 'u-me', mode: 'guess_spread', status: 'submitted', eligible: true, scoreTiming: 'immediate', weekPoints: 15, standingsPoints: 10, awaitingKickoffPoints: 5, picks, ...extra });
const week8 = { season: 2026, week: 8, games: [SEA_DEN, LAC_LV] };
const rowsOf = e => scoreRows(week8, e);

test('number line: a Spread is drawn as the favored team\'s margin, your dot and the saved line on one axis, the gap growing from the line', () => {
  const exact = numberLine({ mode: 'guess_spread', game: SEA_DEN, guess: -3, line: -3 });
  assert.equal(exact.caption, 'DEN wins by', 'a negative home spread favors the home team');
  assert.deepEqual(exact.ticks.map(t => t.label), ['1', '2', '3', '4', '5']);
  assert.deepEqual([exact.line.pct, exact.you.pct], [50, 50]);
  assert.equal(exact.gap, null, 'an exact guess has no gap');
  assert.equal(exact.aria, 'Line DEN −3, you DEN −3, exact');
  const away = numberLine({ mode: 'guess_spread', game: LAC_LV, guess: 4, line: 6.5 });
  assert.equal(away.caption, 'LAC wins by', 'a positive home spread favors the away team');
  assert.deepEqual([away.line.label, away.you.label], ['Line LAC −6.5', 'You LAC −4']);
  assert.deepEqual(away.gap, { left: 25, width: 31.3, origin: 'right' }, 'you are left of the line, so the gap grows leftward from it');
  assert.equal(away.aria, 'Line LAC −6.5, you LAC −4, off by 2.5');
  const flipped = numberLine({ mode: 'guess_spread', game: SEA_DEN, guess: 2, line: -3 });
  assert.equal(flipped.caption, 'DEN wins by', 'the saved line picks the team, never your guess');
  assert.deepEqual(flipped.ticks.map(t => t.label), ['−4', '−2', '0', '2', '4', '6'], 'your SEA −2 is DEN losing by 2');
  assert.equal(flipped.you.label, 'You SEA −2');
  const pickem = numberLine({ mode: 'guess_spread', game: SEA_DEN, guess: 0, line: 0 });
  assert.deepEqual([pickem.caption, pickem.line.label], ['DEN wins by', "Line Pick'em"]);
});

test('number line: a Total is the game\'s points; ticks stay whole and at most eight for any miss; edge labels stay on the card', () => {
  const total = numberLine({ mode: 'guess_total', game: SEA_DEN, guess: 46, line: 44.5 });
  assert.equal(total.caption, 'Total points');
  assert.deepEqual(total.ticks.map(t => t.label), ['42', '43', '44', '45', '46', '47', '48']);
  assert.deepEqual(total.gap, { left: 41.7, width: 25, origin: 'left' });
  const far = numberLine({ mode: 'guess_total', game: SEA_DEN, guess: 58, line: 40 });
  assert.deepEqual(far.ticks.map(t => t.label), ['35', '40', '45', '50', '55', '60']);
  assert.equal(far.you.align, 'end', 'a label near the right edge ends at its dot instead of leaving the card');
  for (let line = -30; line <= 80; line += 0.5) for (let guess = -30; guess <= 90; guess += 1.5) {
    const drawn = numberLine({ mode: line > 30 ? 'guess_total' : 'guess_spread', game: SEA_DEN, guess, line });
    assert.ok(drawn.ticks.length <= 8, `${guess} vs ${line}: ${drawn.ticks.length} ticks`);
    assert.ok(drawn.ticks.every(t => Number.isInteger(t.value)));
    for (const mark of [drawn.line, drawn.you]) assert.ok(mark.pct >= 0 && mark.pct <= 100);
  }
  assert.equal(numberLine({ mode: 'guess_total', game: SEA_DEN, guess: null, line: 44 }), null, 'no line is drawn without both numbers');
});

test('rows (Q1-B): a scored game says Line · You · off by with its points pill and bar; a legitimate 0 is 0 / 10; other games say their state', () => {
  const rows = rowsOf(entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]));
  assert.deepEqual(rowView(rows[0], 'guess_spread'), { meta: 'Line DEN −3 · You DEN −3 · exact', pill: { text: '10 / 10', tier: 'exact', number: true }, bullseye: true, share: 1 });
  assert.deepEqual(rowView(rows[1], 'guess_spread'), { meta: 'Line LAC −6.5 · You LAC −4 · off by 2.5', pill: { text: '5 / 10', tier: 'low', number: true }, bullseye: false, share: 0.5 });
  const zero = rowView(rowsOf(entry([pick('SEA-DEN', -3, 0, -9)]))[0], 'guess_spread');
  assert.deepEqual([zero.pill.text, zero.share], ['0 / 10', 0]);
  assert.equal(rowView(rowsOf(entry([pick('SEA-DEN', -3, 8, -4)]))[0], 'guess_spread').pill.tier, 'good');
  const waiting = rowView(rowsOf(entry([pick('SEA-DEN', -3, null, null, { reference: { status: 'pending', value: null } })]))[0], 'guess_spread');
  assert.deepEqual(waiting, { meta: 'You DEN −3 · waiting for a line', pill: { text: 'Waiting', tier: 'none', number: false }, bullseye: false, share: null });
  const draft = rowView(rowsOf(entry([{ gameId: 'SEA-DEN', guess: -3, lockedIn: false }], { status: 'draft' }))[0], 'guess_spread');
  assert.deepEqual([draft.meta, draft.pill.text], ['Draft · not scored', 'Draft']);
  assert.deepEqual(rowView(rowsOf(entry([]))[1], 'guess_spread').pill.text, 'No pick');
});

test('hero: the server\'s week total, out of what the scored games could earn, with Bullseyes and the average miss; a filter says Selected games', () => {
  const e = entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]);
  const hero = heroModel({ mode: 'guess_spread', week: 8, entry: e, rows: rowsOf(e) });
  assert.deepEqual(hero, { eyebrow: 'Week 8 · Spread', points: 15, count: true, share: 0.75, bar: 75, meterLabel: '15 of 20 possible points',
    line: '20 possible · 1 Bullseye · avg miss 1.3', note: null });
  const filtered = heroModel({ mode: 'guess_spread', week: 8, entry: e, rows: scoreRows(week8, e, { team: 'LV' }), filtered: true });
  assert.deepEqual([filtered.eyebrow, filtered.points, filtered.count], ['Selected games', 5, false], 'a filtered subtotal never counts up');
  assert.equal(heroModel({ mode: 'guess_total', week: 8, entry: null, rows: [] }).note, 'No saved Total guesses for this week.');
  const ineligible = heroModel({ mode: 'guess_spread', week: 8, entry: { ...e, eligible: false }, rows: rowsOf({ ...e, eligible: false }) });
  assert.deepEqual([ineligible.points, ineligible.note], [null, 'Not eligible for scoring this week.'], 'an ineligible ballot never shows points');
  assert.equal(layerMeta({ week: 8, known: true, summary: scoreSummary(rowsOf(e)) }), 'Week 8 · 2 of 2 scored');
  assert.equal(layerMeta({ week: 8, known: true, summary: scoreSummary(rowsOf(e)), final: true }), 'Week 8 · all games scored');
  assert.equal(layerMeta({ week: 7, known: false, summary: scoreSummary([]) }), 'Week 7 · no record');
});

test('fine print (D-38, behind ⓘ): immediate own points stay apart from the started-game standings; a filter never makes a rank', () => {
  const e = entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]);
  const lines = scoreFinePrint({ entry: e, summary: scoreSummary(rowsOf(e)) });
  assert.deepEqual(lines, ['2 scored · 2 locked · 0 not locked.', '0 waiting for a line · 0 ineligible.', 'Your eligible locked guesses count immediately.',
    '10 points in shared standings (games started).', '5 personal points waiting for kickoff.',
    'Every player, including you, uses the same games that have started. A week in progress is not a final weekly win.']);
  const filtered = scoreFinePrint({ entry: e, summary: scoreSummary([]), filtered: true });
  assert.ok(filtered.includes('A filtered subset. Filters do not change the whole-week standings or create a new rank.'));
  assert.ok(!filtered.some(line => line.includes('standings (games started)') || line.includes('waiting for kickoff')));
});

test('game layer (P2B): points, BULLSEYE, one sentence and the number line for a scored game; one sentence for a game not scored yet', () => {
  const [bull, miss] = rowsOf(entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5, { late: { minutes: 3 } })]));
  const exact = gameView({ row: bull, mode: 'guess_spread', week: 8 });
  assert.deepEqual([exact.meta, exact.points, exact.bullseye, exact.sentence], ['Week 8 · Guess the Spread', 10, true, 'Right on the line']);
  assert.equal(exact.line.aria, 'Line DEN −3, you DEN −3, exact');
  const off = gameView({ row: miss, mode: 'guess_spread', week: 8 });
  assert.deepEqual([off.sentence, off.bullseye, off.late], ['Off by 2.5', false, 'Late · 3 min']);
  const pending = gameView({ row: rowsOf(entry([pick('SEA-DEN', -3, null, null, { reference: { status: 'pending', value: null } })]))[0], mode: 'guess_spread', week: 8 });
  assert.deepEqual([pending.scored, pending.sentence, pending.line, pending.you], [false, 'Waiting for a scoring line.', null, 'DEN −3']);
  const ineligible = gameView({ row: rowsOf(entry([pick('SEA-DEN', -3, 10, -3)], { eligible: false }))[0], mode: 'guess_spread', week: 8 });
  assert.deepEqual([ineligible.scored, ineligible.sentence, ineligible.bullseye, ineligible.line], [false, 'Not eligible for scoring.', false, null]);
});

test('rank chip: ordinal or shared, the move as a number the symbol and the words both carry; unranked draws nothing', () => {
  assert.deepEqual(rankChip({ rank: 3, tied: false }, 2), { rank: 3, label: '3rd', move: 2, said: 'season rank 3rd, up 2' });
  assert.deepEqual(rankChip({ rank: 2, tied: true }, -1), { rank: 2, label: 'T-2', move: -1, said: 'season rank T-2, down 1' });
  assert.equal(rankChip({ rank: 1, tied: false }, 0).move, null, 'no change shows no arrow');
  assert.equal(rankChip({ rank: null, tied: false }, 2), null);
});

test('landing tile (P1B): the latest scored week of one market, "Week 8 · ▲ 2" with the good tone only for a rise, and the place it opens', () => {
  const data = { viewer: 'u-me', season: 2026, weeks: [
    { ...week8, week: 7, entries: [entry([pick('SEA-DEN', -3, 6, -1)], { weekPoints: 6 })] },
    { ...week8, entries: [entry([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)])] },
    { ...week8, week: 9, entries: [entry([{ gameId: 'SEA-DEN', guess: -3, lockedIn: false }], { status: 'draft', weekPoints: null })] },
  ] };
  const up = scoreTile({ data, mode: 'guess_spread', ranks: { guess_spread: rankChip({ rank: 3 }, 2) } });
  assert.deepEqual(up, { big: '15', sub: 'Week 8 · ▲ 2', tone: 'good', said: 'Your score, Week 8 Spread, 15 points, season rank 3rd, up 2', open: { season: 2026, week: 8, market: 'guess_spread' } });
  const down = scoreTile({ data, mode: 'guess_spread', ranks: { guess_spread: rankChip({ rank: 3 }, -1) } });
  assert.deepEqual([down.sub, down.tone], ['Week 8 · ▼ 1', 'plain'], 'a drop stays quiet: the symbol says it, no state color');
  assert.equal(scoreTile({ data, mode: 'guess_spread', ranks: { guess_spread: rankChip({ rank: 3 }, null) } }).sub, 'Week 8 · 3rd');
  const other = scoreTile({ data, mode: 'guess_total' });
  assert.deepEqual([other.big, other.open.market], ['15', 'guess_spread'], 'no Total scores: the tile shows Spread, never a Spread + Total sum');
  assert.deepEqual(scoreTile({ loading: true }).big, '—');
  assert.equal(scoreTile({ error: { status: 500 } }).sub, 'Open to retry');
  assert.equal(scoreTile({ data: { viewer: 'u-me', season: 2026, weeks: [] } }).sub, 'No scores yet');
});
```

```js
// D-69 Your score moments (web/src/next/play/scoreMoments.js) and how the moments engine plays them. Each test names
// the contract it guards. Fixture data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { scoreMoments, scoreReport, scoreSource, weekFinal } from '../web/src/next/play/scoreMoments.js';

const ME = 'u-me';
const SEA_DEN = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-11-01T21:05:00Z' };
const LAC_LV = { id: 'LAC-LV', awayCode: 'LAC', homeCode: 'LV', kickoff: '2026-11-02T01:20:00Z' };
const NYG_PHI = { id: 'NYG-PHI', awayCode: 'NYG', homeCode: 'PHI', kickoff: '2026-11-03T01:15:00Z' };
const pick = (gameId, guess, points, line) => ({ gameId, guess, lockedIn: true, lockedAt: '2026-10-28T18:00:00Z', points, reference: { value: line } });
const mine = (picks, extra = {}) => ({ userId: ME, mode: 'guess_spread', status: 'submitted', eligible: true, scoreTiming: 'immediate', weekPoints: 15, picks, ...extra });
const reply = (entries, games = [SEA_DEN, LAC_LV]) => ({ viewer: ME, season: 2026, now: '2026-10-29T12:00:00Z', seasons: [2026], weeks: [{ season: 2026, week: 8, games, entries }] });
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
const ids = list => list.map(m => m.id);
const words = list => JSON.stringify(list.map(({ id, title, meta }) => ({ id, title, meta })));

test('Bullseye: a scored 10 of 10 game of yours is one big moment for the score scope; a miss makes no moment at all', () => {
  const moments = scoreMoments(reply([mine([pick('SEA-DEN', -3, 10, -3)], { weekPoints: 10 })]), ME);
  assert.deepEqual(ids(moments), ['score:bullseye:2026:8:guess_spread:SEA-DEN'], 'stable ids: season, week, market and game');
  assert.equal(sizeOf(moments[0].kind), 'big');
  assert.deepEqual(moments[0].scopes, [SCOPES.score]);
  assert.deepEqual([moments[0].title, moments[0].meta], ['Bullseye', 'Week 8 · SEA at DEN · Spread']);
  assert.deepEqual(scoreMoments(reply([mine([pick('SEA-DEN', -3, 9, -3.5)], { weekPoints: 9 })]), ME), [], 'a 9 is quiet: nothing pops and nothing is kept');
});

test('Week final: every game of your week is scored or closed without a lock; a game still open or waiting for its line is not final', () => {
  const week = reply([]).weeks[0];
  const both = mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]);
  assert.equal(weekFinal(week, both, NaN), true, 'every game scored: final, whatever the clock');
  const oneOpen = mine([pick('SEA-DEN', -3, 10, -3)]);
  assert.equal(weekFinal(week, oneOpen, Date.parse('2026-11-01T00:00:00Z')), false, 'LAC at LV can still be locked');
  assert.equal(weekFinal(week, oneOpen, Date.parse('2026-11-02T02:00:00Z')), true, 'LAC at LV kicked off without a lock: the week is settled');
  assert.equal(weekFinal(week, oneOpen, NaN), false, 'without the server clock an unlocked game never counts as closed');
  assert.equal(weekFinal(week, mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, null, null)]), NaN), false, 'a locked game waiting for its line');
  assert.equal(weekFinal(week, { ...both, status: 'sat_out' }, NaN), false, 'a sit-out never celebrates');
  assert.equal(weekFinal(week, { ...both, eligible: false }, NaN), false, 'an ineligible ballot never celebrates');
  const final = scoreMoments(reply([both]), ME).find(m => m.kind === 'weekFinal');
  assert.deepEqual([final.id, final.title, final.meta, sizeOf(final.kind)], ['score:weekFinal:2026:8:guess_spread', 'Week 8 final', 'Spread · 15 points', 'big']);
});

test('D-31: moments read only your own entries and name no line or guess; another player\'s Bullseye is not yours', () => {
  const other = { ...mine([pick('SEA-DEN', -7, 10, -7), pick('LAC-LV', 1, 10, 1)]), userId: 'u-friend' };
  assert.deepEqual(scoreMoments(reply([other]), ME), []);
  const said = words(scoreMoments(reply([mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 4, 5, 6.5)]), other]), ME));
  for (const leak of ['u-friend', '−3', '-3', '6.5', '−7', '-7']) assert.ok(!said.includes(leak), leak);
  assert.deepEqual(scoreMoments(null, ME), []);
  assert.deepEqual(scoreMoments(reply([mine([pick('SEA-DEN', -3, 10, -3)])]), ''), []);
});

test('fresh reads only (rule 1): a pending or failed read reports nothing; a fresh answer reports its own season as the source', () => {
  const data = reply([mine([pick('SEA-DEN', -3, 10, -3)])]);
  assert.equal(scoreReport({ loading: true, data: null, error: null }), null);
  assert.equal(scoreReport({ loading: false, data: null, error: { status: 500 } }), null);
  assert.equal(scoreReport({ loading: false, data, error: { status: 500 } }), null, 'a kept copy beside a failure confirms nothing');
  assert.deepEqual(scoreReport({ loading: false, data, error: null }), { source: 'score:2026', candidates: scoreMoments(data, ME) });
  assert.equal(scoreSource({ season: null }), 'score:latest');
});

function rig() {
  const big = [];
  const engine = createMomentsEngine({ account: ME, storage: memory(), isSettled: () => true, hasNavigated: () => true, onBig: ms => big.push(ids(ms)),
    onSmall: () => assert.fail('score moments are never small'), setTimer: fn => fn(), now: () => 0 });
  const report = data => { const out = scoreReport({ loading: false, error: null, data }); engine.report(out.candidates, { source: out.source }); };
  return { engine, big, report };
}

test('engine: the first read seeds; a new Bullseye waits as NEW for the Play tile, plays once when Your score opens, and never replays', () => {
  const { engine, big, report } = rig();
  report(reply([mine([pick('SEA-DEN', -3, 10, -3)], { weekPoints: 10 })]));
  assert.deepEqual(big, [], 'this device\'s first read shows results as they are');
  assert.equal(engine.newCount(SCOPES.score), 0);
  report(reply([mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 6.5, 10, 6.5)], { weekPoints: 20 })]));
  assert.equal(engine.newCount(SCOPES.score), 2, 'the new Bullseye and the final week wait: the Play tile shows NEW');
  const close = engine.open(SCOPES.score);
  assert.deepEqual(big, [['score:bullseye:2026:8:guess_spread:LAC-LV', 'score:weekFinal:2026:8:guess_spread']], 'one card for both big moments');
  assert.equal(engine.newCount(SCOPES.score), 0);
  report(reply([mine([pick('SEA-DEN', -3, 10, -3), pick('LAC-LV', 6.5, 10, 6.5)], { weekPoints: 20 })]));
  close();
  engine.open(SCOPES.score);
  assert.equal(big.length, 1, 'a moment in the seen record never plays again');
});

test('engine: a miss stays quiet, and a Bullseye that arrives while Your score is open plays in place', () => {
  const { engine, big, report } = rig();
  const games = [SEA_DEN, LAC_LV, NYG_PHI];
  report(reply([mine([pick('SEA-DEN', -3, 9, -3.5)], { weekPoints: 9 })], games));
  engine.open(SCOPES.score);
  report(reply([mine([pick('SEA-DEN', -3, 9, -3.5), pick('LAC-LV', 4, 5, 6.5)], { weekPoints: 14 })], games));
  assert.deepEqual(big, [], 'a scored miss plays nothing, and NYG at PHI is still open');
  report(reply([mine([pick('SEA-DEN', -3, 9, -3.5), pick('LAC-LV', 4, 5, 6.5), pick('NYG-PHI', -7, 10, -7)], { weekPoints: 24 })], games));
  assert.deepEqual(big, [['score:bullseye:2026:8:guess_spread:NYG-PHI', 'score:weekFinal:2026:8:guess_spread']], 'it plays where you are, as one card');
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `node --test tests/next-your-score.test.mjs tests/next-score-moments.test.mjs`
Expected: FAIL, `Cannot find module '…/web/src/next/play/yourScore.js'` (and `scoreMoments.js`).

- [ ] **Step 3: Write `web/src/next/play/yourScore.js`**

```js
// D-69 Play › Your score (spec section 6, mockup Q1-B) and its game layer (P2B). Pure: what the two layers and the Play
// landing tile draw, from the history read (`/community/history`) and the rows scoring.js builds. Points always come
// from the SQL scorer (`row.points`); nothing here scores a guess. Only your own guess and your own saved line appear
// (D-31): every row comes from `ownEntry`.
import { show } from '../../communityFormat.js';
import { fmtSpreadPick, MINUS } from '../format.js';
import { THRESHOLDS } from '../../../../shared/game-features/catalog.mjs';
import { MODE_LABEL } from '../../../../shared/guess-board.mjs';
import { ordinal } from '../league/rankMoment.js';
import { lateLabel, number, ownEntry, scoreRows, scoreSummary } from './scoring.js';

/** A game's points out of this (RULES.md: 10 minus 1 per half point; 10 is a Bullseye, catalog.mjs). */
export const MAX_POINTS = THRESHOLDS.exactPoints;
/** The mockup's green band (Q1-B): a look, not a rule. The points and the words carry the meaning. */
const GOOD_POINTS = 7;
export const GAME_NAME = Object.freeze({ guess_spread: 'Guess the Spread', guess_total: 'Guess the Total' });
const pct = share => Math.round(share * 1000) / 10;
const signed = n => (n < 0 ? `${MINUS}${show(-n)}` : show(n));

/** Your guess or a saved line in a row's words: "DEN −3", "Pick'em", "44.5". */
export const sideText = (mode, game, value) => (mode === 'guess_total' ? show(value) : fmtSpreadPick(game.awayCode, game.homeCode, value));
const missOf = row => {
  const line = number(row.reference?.value);
  return row.points !== null && line !== null && row.guess !== null ? Math.abs(row.guess - line) : null;
};
const tierOf = points => (points === MAX_POINTS ? 'exact' : points >= GOOD_POINTS ? 'good' : 'low');

/**
 * The game layer's number line (P2B): the saved line and your guess on one axis, `pct` from the left. A Spread is drawn
 * as one team's winning margin: the team the saved line favors (on a pick'em line, the team your guess favors; the home
 * team when both are even). Ticks are whole numbers, every 1, 2, 5, 10, 20 or 50 points, so at most eight fit a 320px phone.
 * Null without both numbers.
 */
export function numberLine({ mode, game, guess, line }) {
  const g = number(guess), l = number(line);
  if (g === null || l === null || !game) return null;
  const total = mode === 'guess_total';
  const lead = total ? null : l < 0 || (l === 0 && g <= 0) ? game.homeCode : game.awayCode;
  const at = v => (total || lead === game.awayCode ? v : -v);
  const a = at(l), b = at(g), low = Math.min(a, b), high = Math.max(a, b);
  const from = Math.floor(low) - 2, to = Math.ceil(high) + 2, span = to - from;
  const step = [1, 2, 5, 10, 20, 50].find(s => span / s <= 6) ?? 100;
  const lo = Math.floor(from / step) * step, hi = Math.ceil(to / step) * step;
  const place = v => pct((v - lo) / (hi - lo));
  const align = p => (p < 12 ? 'start' : p > 88 ? 'end' : 'center');
  const ticks = [];
  for (let v = lo; v <= hi; v += step) ticks.push({ value: v, label: signed(v), pct: place(v) });
  const miss = Math.abs(g - l);
  return {
    caption: total ? 'Total points' : `${lead} wins by`,
    ticks,
    line: { pct: place(a), label: `Line ${sideText(mode, game, l)}`, align: align(place(a)) },
    you: { pct: place(b), label: `You ${sideText(mode, game, g)}`, align: align(place(b)) },
    // The gap grows from the saved line toward your guess (transform-origin), so it never starts where you are.
    gap: miss === 0 ? null : { left: place(low), width: Math.round((place(high) - place(low)) * 10) / 10, origin: b >= a ? 'left' : 'right' },
    aria: `Line ${sideText(mode, game, l)}, you ${sideText(mode, game, g)}, ${miss === 0 ? 'exact' : `off by ${show(miss)}`}`,
  };
}

const PILL_WORDS = Object.freeze({
  'Waiting for scoring line': 'Waiting', 'Scores at kickoff': 'Locked', 'Score unavailable': 'Locked', 'Not eligible': 'Not eligible',
  'Draft · not scored': 'Draft', 'No locked guess': 'No pick', Skipped: 'Sat out', Hidden: 'Hidden',
});

/**
 * One picture row (Q1-B): `{ meta, pill: { text, tier, number }, bullseye, share }`. A scored row says "Line · You · off
 * by" and fills its bar by its points; a legitimate 0 is "0 / 10", never a dash. Any other row says its state in words.
 */
export function rowView(row, mode) {
  const { game } = row, line = number(row.reference?.value);
  if (row.points !== null) {
    const miss = missOf(row);
    const meta = [line !== null ? `Line ${sideText(mode, game, line)}` : null, row.guess !== null ? `You ${sideText(mode, game, row.guess)}` : null,
      miss === null ? null : miss === 0 ? 'exact' : `off by ${show(miss)}`].filter(Boolean).join(' · ');
    return { meta, pill: { text: `${show(row.points)} / ${MAX_POINTS}`, tier: tierOf(row.points), number: true }, bullseye: row.points === MAX_POINTS,
      share: Math.min(1, Math.max(0, row.points / MAX_POINTS)) };
  }
  const word = row.status === 'Waiting for scoring line' ? 'waiting for a line' : row.status.toLowerCase();
  const meta = row.locked && row.guess !== null ? `You ${sideText(mode, game, row.guess)} · ${word}` : row.status;
  return { meta, pill: { text: PILL_WORDS[row.status] ?? row.status, tier: 'none', number: false }, bullseye: false, share: null };
}

/**
 * The week's hero (Q1-B): the eyebrow, the points (the server's week total; a filtered subtotal of scored rows), the bar
 * of points out of what the scored games could have earned, and one line ("40 possible · 1 Bullseye · avg miss 1").
 * A filtered subtotal never counts up: it is not a number this device remembers.
 */
export function heroModel({ mode, week, entry, rows, filtered = false }) {
  const summary = scoreSummary(rows);
  const points = !entry || entry.eligible === false ? null : filtered ? summary.points : number(entry.weekPoints);
  const scored = rows.filter(row => row.points !== null);
  const misses = scored.map(missOf).filter(miss => miss !== null);
  const possible = scored.length * MAX_POINTS;
  const bulls = scored.filter(row => row.points === MAX_POINTS).length;
  const avg = misses.length ? misses.reduce((sum, miss) => sum + miss, 0) / misses.length : null;
  const share = points !== null && possible > 0 ? Math.min(1, Math.max(0, points / possible)) : null;
  const market = MODE_LABEL[mode];
  return {
    eyebrow: filtered ? 'Selected games' : `${Number.isInteger(week) ? `Week ${week} · ` : ''}${market}`,
    points, count: !filtered,
    share, bar: share === null ? null : pct(share), meterLabel: share === null ? null : `${show(points)} of ${possible} possible points`,
    line: scored.length ? [`${possible} possible`, `${bulls} ${bulls === 1 ? 'Bullseye' : 'Bullseyes'}`, avg === null ? null : `avg miss ${show(avg)}`].filter(Boolean).join(' · ') : null,
    note: !entry ? `No saved ${market} guesses for this week.` : entry.eligible === false ? 'Not eligible for scoring this week.' : null,
  };
}

/** The layer's one meta line: "Week 8 · 4 of 14 scored", "Week 8 · all games scored", "Week 8 · no record". */
export function layerMeta({ week, known, summary, final = false }) {
  if (!Number.isInteger(week)) return 'No weeks yet';
  return `Week ${week} · ${!known ? 'no record' : final ? 'all games scored' : `${summary.scored} of ${summary.total} scored`}`;
}

const NOT_SCORED = Object.freeze({
  'Waiting for scoring line': 'Waiting for a scoring line.', 'Scores at kickoff': 'Scores at kickoff.', 'Score unavailable': 'Score unavailable. Refresh to check.',
  'Not eligible': 'Not eligible for scoring.', 'Draft · not scored': 'A draft. Only locked guesses score.', 'No locked guess': 'No locked guess for this game.',
  Skipped: 'You sat out this week.', Hidden: 'Hidden.',
});

/**
 * The game layer (P2B): the meta line, the points, BULLSEYE, one sentence ("Off by 2.5", "Right on the line", or why
 * the game is not scored), your guess, the number line and the Late marker. Lock-in time, source and the rule note are
 * the ⓘ (receiptDetails in ScoreReceipt.jsx).
 */
export function gameView({ row, mode, week }) {
  const scored = row.points !== null, miss = missOf(row);
  return {
    meta: `${Number.isInteger(week) ? `Week ${week} · ` : ''}${GAME_NAME[mode]}`,
    scored, points: row.points, bullseye: scored && row.points === MAX_POINTS,
    sentence: scored ? (miss === null ? null : miss === 0 ? 'Right on the line' : `Off by ${show(miss)}`) : NOT_SCORED[row.status] ?? row.status,
    you: row.guess === null ? null : sideText(mode, row.game, row.guess),
    line: miss === null ? null : numberLine({ mode, game: row.game, guess: row.guess, line: number(row.reference?.value) }),
    late: row.pick?.late ? lateLabel(row.pick.late) : null,
  };
}

/** What "About your scores" adds to INFO.scores (D-38: fine print behind ⓘ): the counts, the timing and the standings. */
export function scoreFinePrint({ entry, summary, filtered = false }) {
  const immediate = entry?.scoreTiming === 'immediate';
  const lines = [`${summary.scored} scored · ${summary.locked} locked · ${summary.remaining} not locked${filtered ? ' in this selection' : ''}.`,
    `${summary.pending} waiting for a line · ${summary.ineligible} ineligible.`];
  if (entry) lines.push(immediate ? 'Your eligible locked guesses count immediately.' : 'This saved history uses the scoring timing active for that week.');
  if (entry && !filtered) {
    lines.push(`${show(entry.standingsPoints ?? (immediate ? null : entry.weekPoints))} points in shared standings (games started).`);
    if (immediate) lines.push(`${show(entry.awaitingKickoffPoints)} personal points waiting for kickoff.`);
    lines.push('Every player, including you, uses the same games that have started. A week in progress is not a final weekly win.');
  }
  if (filtered) lines.push('A filtered subset. Filters do not change the whole-week standings or create a new rank.');
  return lines;
}

/** The season rank chip ("3rd ▲ 2") from `rankTile` and the board's last move (`peekMove`); null while unranked. */
export function rankChip(tile, move = null) {
  if (!tile || !Number.isInteger(tile.rank) || tile.rank < 1) return null;
  const label = tile.tied ? `T-${tile.rank}` : ordinal(tile.rank);
  const by = Number.isInteger(move) && move !== 0 ? move : null;
  return { rank: tile.rank, label, move: by, said: `season rank ${label}${by === null ? '' : by > 0 ? `, up ${by}` : `, down ${-by}`}` };
}

/**
 * The Play landing tile (P1B): the latest week of this season with your scored points for `mode` (the other market when
 * `mode` has none; Spread and Total are never summed, D-36), "Week 8 · ▲ 2", and the place it opens. `ranks` is
 * `{ guess_spread, guess_total }` rank chips.
 */
export function scoreTile({ data, mode = 'guess_spread', ranks = {}, loading = false, error = null } = {}) {
  if (!data) {
    if (loading) return { big: '—', sub: 'Loading…', tone: 'plain', said: 'Your score, loading', open: { market: mode } };
    if (error) return { big: '—', sub: 'Open to retry', tone: 'plain', said: 'Your score could not load. Open to retry', open: { market: mode } };
    return { big: '—', sub: 'No scores yet', tone: 'plain', said: 'Your score, no scores yet', open: { market: mode } };
  }
  const weeks = (data.weeks || []).slice().sort((x, y) => y.week - x.week);
  for (const m of [mode, mode === 'guess_total' ? 'guess_spread' : 'guess_total']) for (const week of weeks) {
    const entry = ownEntry(week, data.viewer, m);
    const points = entry && entry.eligible !== false ? number(entry.weekPoints) : null;
    if (points === null || !scoreSummary(scoreRows(week, entry)).scored) continue;
    const rank = ranks[m] ?? null, move = rank?.move ?? null;
    const tail = move > 0 ? ` · ▲ ${move}` : move < 0 ? ` · ▼ ${-move}` : rank ? ` · ${rank.label}` : '';
    return { big: show(points), sub: `Week ${week.week}${tail}`, tone: move > 0 ? 'good' : 'plain',
      said: `Your score, Week ${week.week} ${MODE_LABEL[m]}, ${show(points)} points${rank ? `, ${rank.said}` : ''}`,
      open: { season: week.season, week: week.week, market: m } };
  }
  return { big: '—', sub: 'No scores yet', tone: 'plain', said: 'Your score, no scores yet', open: { market: mode } };
}
```

- [ ] **Step 4: Write `web/src/next/play/scoreMoments.js`**

```js
// D-69 Your score moments (spec section 4.2): a newly scored Bullseye and a final week are big moments in the score
// scope (Sean's PICK column); a miss stays quiet, so it makes no candidate at all and the seen record stays small. Pure.
// Candidates come only from a fresh history read (scoreReport), never from a request still on its way, and they name
// only your own game, market and points: no line, no guess and nothing of another player (D-31).
import { THRESHOLDS } from '../../../../shared/game-features/catalog.mjs';
import { MODE_LABEL, MODES } from '../../../../shared/guess-board.mjs';
import { show } from '../../communityFormat.js';
import { SCOPES } from '../moments/catalog.js';
import { BADGE_ICONS } from '../features/icons.js';
import { number, ownEntry, scoreRows } from './scoring.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const kickoffAt = game => Date.parse(game?.kickoff ?? '');

/** The engine source for one season's history read: each season seeds silently on this device's first read of it. */
export const scoreSource = data => `score:${Number.isInteger(data?.season) ? data.season : 'latest'}`;

/**
 * True when every game of your week for one market is settled for scoring: each is scored, or can no longer be (it was
 * not locked when it kicked off). A sit-out, an ineligible ballot, a week with nothing scored, or a locked game still
 * waiting for its line is not final. `now` is the server's clock in ms; without it only a fully scored week is final.
 */
export function weekFinal(week, entry, now) {
  if (!entry || entry.eligible === false || entry.status === 'sat_out') return false;
  const rows = scoreRows(week, entry);
  if (!rows.length || !rows.some(row => row.points !== null)) return false;
  return rows.every(row => row.points !== null || (!row.locked && Number.isFinite(now) && now >= kickoffAt(row.game)));
}

/** Every score moment a history reply holds for `viewer`, with stable ids (the seen record matches them across reads). */
export function scoreMoments(data, viewer) {
  if (!record(data) || typeof viewer !== 'string' || !viewer || !Array.isArray(data.weeks)) return [];
  const now = Date.parse(data.now ?? ''), out = [];
  for (const week of data.weeks) {
    if (!record(week) || !Number.isInteger(week.season) || !Number.isInteger(week.week)) continue;
    for (const mode of MODES) {
      const entry = ownEntry(week, viewer, mode);
      if (!entry || entry.eligible === false) continue;
      const at = `${week.season}:${week.week}:${mode}`, market = MODE_LABEL[mode];
      for (const row of scoreRows(week, entry)) {
        if (row.points !== THRESHOLDS.exactPoints) continue;
        out.push({ id: `score:bullseye:${at}:${row.game.id}`, kind: 'bullseye', scopes: [SCOPES.score], title: 'Bullseye',
          meta: `Week ${week.week} · ${row.game.awayCode} at ${row.game.homeCode} · ${market}`, icon: BADGE_ICONS.bullseye, rarity: 'uncommon' });
      }
      if (weekFinal(week, entry, now)) {
        out.push({ id: `score:weekFinal:${at}`, kind: 'weekFinal', scopes: [SCOPES.score], title: `Week ${week.week} final`,
          meta: `${market} · ${show(number(entry.weekPoints))} points`, icon: BADGE_ICONS.dialed_in, rarity: 'common' });
      }
    }
  }
  return out;
}

/** What one history read reports (rule 1): `{ source, candidates }` from a fresh answer, null while pending or failed. */
export function scoreReport(read) {
  const data = read?.loading || read?.error ? null : read?.data;
  if (!record(data) || typeof data.viewer !== 'string' || !data.viewer) return null;
  return { source: scoreSource(data), candidates: scoreMoments(data, data.viewer) };
}
```

- [ ] **Step 5: Run the tests and see them pass**

Run: `node --test tests/next-your-score.test.mjs tests/next-score-moments.test.mjs tests/next-scoring.test.mjs`
Expected: PASS, 19 tests (8 + 6 new, the 5 existing scoring tests unchanged), `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add web/src/next/play/yourScore.js web/src/next/play/scoreMoments.js tests/next-your-score.test.mjs tests/next-score-moments.test.mjs
git diff --cached --stat
git ls-files --eol web/src/next/play/yourScore.js web/src/next/play/scoreMoments.js tests/next-your-score.test.mjs tests/next-score-moments.test.mjs
git commit -m "Play: Your score rules and the Bullseye and Week final moments (D-69 step 1)" -m "Pure view rules for Q1-B and P2B (rows, hero, number line, fine print, tile) and the score moment detector: a scored 10/10 game and a settled week are big moments in the score scope from a fresh read only; a miss makes no moment." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Every `--eol` line must read `i/lf w/lf`.

---

### Task 2b: The Your score layer, its game layer and their addresses

**Files:**
- Modify: `web/src/next/shell/state.js` (a `scoreGame` change, and for every Play section but Compare a `layer` or
  `item` change, is a step; none of them rides into a fresh Play destination or a restore; tasks 4 and 5 rely on this), `web/src/next/play/Play.jsx` (one line), `web/src/next/play/WeeklyScore.jsx` (rewrite)
- Create: `web/src/next/play/scoreHooks.js`, `web/src/next/play/yourScore.css`
- Test: `tests/next-router.test.mjs` (append), `tests/next-scoring-ui.test.jsx` (rewrite),
  `tests/next-your-score-motion.test.mjs` (new), and the browser specs in Step 9

**Interfaces:**
- `WeeklyScore()` (export kept; `Play.jsx` imports it): reads `/community/history` for `view.season` (key
  `${accountId}:score:${season ?? 'latest'}`, unchanged), holds `SCOPES.score` open, reports the score moments from each
  fresh answer, keeps the last good copy under a failure.
- `WeeklyScoreContent({ data, view, rank, loading, error, stale, onRetry, onChange, onRefresh, onPicks })` (only tests
  import it): one `PlayLayer` for both layers. List: `layer="score"`, lips "Play". Game: `layer="score:game:<id>"`,
  lips "Play" › "Your score" (its lip calls `onChange({ scoreGame: undefined })`).
- `gameDetails({ row, mode, entry }) → string[]` (the game's "About this score", from `receiptDetails`) and
  `ScoreFilters({ week, filters, onChange })` are exported for tests.
- `scoreHooks.js`: `useScoreMoments(read)` and `useSeasonRanks(app) → { season, guess_spread, guess_total }` (rank
  chips). Task 2c reuses both.
- Addresses: the list is `#play/score?market=…&season=…&week=…`; a game adds `scoreGame=<id>` (an existing router key).
  Week chips, market and filters change the list in place (no step).

- [ ] **Step 1: Write the failing router and state tests**

Append to `tests/next-router.test.mjs` (it already imports `initialState`, `reduce`, `fragmentFor`, `placeFromFragment`
and defines `fakeWindow`, `app` and `settle`):

```js
test('D-69: a game in Your score is its own layer: opening it is a step, the lip and Back close it, and its address reopens it', () => {
  const start = initialState({ tab: 'play', view: { section: 'score', market: 'guess_spread', season: 2026, week: 8 } });
  const game = reduce(start, { type: 'view', tab: 'play', patch: { scoreGame: 'SEA-DEN' } });
  assert.equal(game.views.play.scoreGame, 'SEA-DEN');
  assert.equal(game.trail.length, 1);
  const place = placeFromFragment(fragmentFor('play', game.views.play)); // a reload or a shared link reopens it
  assert.deepEqual([place.view.section, place.view.scoreGame, place.view.week, place.view.market], ['score', 'SEA-DEN', 8, 'guess_spread']);
  for (const list of [reduce(game, { type: 'back' }), reduce(game, { type: 'view', tab: 'play', patch: { scoreGame: undefined } })]) {
    assert.equal(list.views.play.section, 'score');
    assert.equal(list.views.play.scoreGame ?? null, null);
    assert.equal(list.views.play.week, 8);
    assert.deepEqual(list.trail, [], 'the lip back to the list is Back, so the next Back leaves Your score');
  }
  // Week chips, the market and the filters change the list in place: no step.
  for (const patch of [{ week: 7 }, { market: 'guess_total' }, { team: 'DEN' }, { season: 2025, week: null }]) assert.equal(reduce(start, { type: 'view', tab: 'play', patch }).trail.length, 0, JSON.stringify(patch));
  // A pick's "View weekly score" lands on the game layer; Back returns to the picks.
  const picks = initialState({ tab: 'play', view: { section: 'picks', market: 'spread', season: 2026, week: 8 } });
  const linked = reduce(picks, { type: 'view', tab: 'play', patch: { section: 'score', season: 2026, week: 8, market: 'guess_spread', scoreGame: 'SEA-DEN' } });
  assert.equal(linked.views.play.scoreGame, 'SEA-DEN');
  assert.equal(reduce(linked, { type: 'back' }).views.play.section, 'picks');
});

test('D-69: the browser Back button closes the Your score game layer and keeps the list', async () => {
  const win = fakeWindow('https://gtl.test/#play/score?market=guess_spread&season=2026&week=8');
  const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'play', patch: { scoreGame: 'SEA-DEN' } });
  await settle();
  assert.deepEqual(win.stack(), ['#play/score?market=guess_spread&season=2026&week=8', '[#play/score?market=guess_spread&season=2026&week=8&scoreGame=SEA-DEN]']);
  win.history.back();
  await settle();
  assert.equal(shell.state.views.play.section, 'score');
  assert.equal(shell.state.views.play.scoreGame ?? null, null);
  assert.equal(win.location.hash, '#play/score?market=guess_spread&season=2026&week=8');
});

test('D-69: an open Your score game follows Back but never rides into the Play tab or a fresh Your score link', () => {
  let state = initialState({ tab: 'play', view: { section: 'score', season: 2026, week: 8, scoreGame: 'SEA-DEN' } });
  state = reduce(state, { type: 'go', tab: 'research', view: { section: 'games' } });
  assert.equal(reduce(state, { type: 'back' }).views.play.scoreGame, 'SEA-DEN');
  assert.equal(reduce(state, { type: 'tab', tab: 'play' }).views.play.scoreGame, undefined);
  assert.equal(reduce(state, { type: 'go', tab: 'play', view: { section: 'score', week: 8 } }).views.play.scoreGame, undefined, 'the Play tile opens the list');
  assert.equal(reduce(state, { type: 'restore', place: { tab: 'play', view: { section: 'score' } } }).views.play.scoreGame, undefined);
});

test('D-69: any nested Play layer (layer, item) is a step Back closes and never rides into a fresh destination; Compare\'s player choice is not a step', () => {
  const grid = initialState({ tab: 'play', view: { section: 'features' } });
  const badge = reduce(grid, { type: 'view', tab: 'play', patch: { layer: 'badge', item: 'bullseye' } });
  assert.equal(badge.trail.length, 1, 'opening the badge is a step');
  const back = reduce(badge, { type: 'back' });
  assert.equal(back.views.play.section, 'features');
  assert.equal(back.views.play.layer ?? null, null);
  assert.equal(back.views.play.item ?? null, null);
  assert.equal(reduce(badge, { type: 'go', tab: 'play', view: { section: 'points' } }).views.play.layer, undefined, 'a tile opens its section on its first layer');
  assert.equal(reduce(badge, { type: 'restore', place: { tab: 'play', view: { section: 'features' } } }).views.play.item, undefined);
  const compare = initialState({ tab: 'play', view: { section: 'compare' } });
  assert.equal(reduce(compare, { type: 'view', tab: 'play', patch: { item: 'u-2' } }).trail.length, 0, 'choosing the other player is not a step');
});
```

- [ ] **Step 2: Write the failing render and motion tests**

Replace `tests/next-scoring-ui.test.jsx` with the file below. The two `ScoreReceipt` tests and the comparison heading
test are unchanged; the old weekly tests become the Q1-B and P2B tests, keeping their contracts (own immediate points
apart from the started-game standings, AND filters with a subset label and no rank, lateness and the missing-line
reason kept, matchups as marks, the text-only Matchup filter options).

```jsx
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
// The layer's Play lip opens the landing through the shell (PlayLayer.jsx).
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ state: { views: { play: {} } }, go: vi.fn(), setView: vi.fn() }) }));
import { ScoreFilters, WeeklyScoreContent, gameDetails } from '../web/src/next/play/WeeklyScore.jsx';
import { ScoreReceipt, receiptDetails } from '../web/src/next/play/ScoreReceipt.jsx';
import { ComparisonContent } from '../web/src/next/play/ScoreComparison.jsx';
import { scoreRows } from '../web/src/next/play/scoring.js';
import { markupProblems, matchups, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { teamMarks } from '../web/src/teamLogoRegistry.js';

const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-18T20:00:00Z' };
const entry = { userId: 'owner', mode: 'guess_spread', status: 'draft', eligible: true, scoreTiming: 'immediate', weekPoints: 8, weekScored: 1, standingsPoints: 0, awaitingKickoffPoints: 8, picks: [{ gameId: game.id, guess: -3, lockedIn: true, lockedAt: '2026-10-15T18:00:00Z', points: 8, reference: { value: -5, source: 'Synthetic three-book median', observedAt: '2026-10-15T17:59:00Z' } }] };
const data = { viewer: 'owner', season: 2026, seasons: [2026, 2025], weeks: [{ season: 2026, week: 6, games: [game], entries: [entry] }] };
const render = (view = {}, props = {}) => renderToStaticMarkup(<div className="gx"><WeeklyScoreContent data={data} view={view} onChange={() => {}} onRefresh={() => {}} onPicks={() => {}} {...props}/></div>);
const words = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('Your score (D-69, mockup Q1-B)', () => {
  it('shows your own points as the hero, the saved line and the miss on the row, and keeps the standings behind ⓘ', () => {
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const text = words(html);
    expect(html).toContain('aria-label="Personal score summary"');
    expect(text).toContain('Week 6 · Spread 8 points');
    expect(text).toContain('Line DEN −5 · You DEN −3 · off by 2');
    expect(text).toContain('8 / 10');
    expect(text).toContain('Week 6 · all games scored'); // the layer's one meta line
    // D-38: the standings and the counts sit behind "About your scores" (scoreFinePrint, tested in next-your-score).
    expect(html).toContain('aria-label="About your scores"');
    expect(html).not.toContain('Standings · games started');
    expect(text).toContain('Refresh scores'); expect(text).toContain('View this week’s picks'); expect(text).toContain('Compare players');
  });
  it('AND filters say "Selected games", have an explicit empty state and never draw a rank', () => {
    const rank = { rank: 1, label: '1st', move: 2, said: 'season rank 1st, up 2' };
    const html = render({ team: 'HOU', matchup: game.id }, { rank });
    expect(html).toContain('Selected games'); expect(html).toContain('No games match both filters. Clear filters to see this week.');
    expect(html).not.toContain('gx-ys-rank'); expect(html).not.toContain('1st');
  });
  it('the season rank chip says the move with a symbol and in words beside the total', () => {
    const html = render({}, { rank: { rank: 3, label: '3rd', move: 2, said: 'season rank 3rd, up 2' } });
    expect(words(html)).toContain('Season 3rd ▲2 up 2');
  });
  it('P2B: a game opens its own layer with the points, the miss and the number line, and only your guess and saved line', () => {
    const other = { userId: 'friend', mode: 'guess_spread', status: 'submitted', eligible: true, picks: [{ gameId: game.id, guess: -9, lockedIn: true, points: 4, reference: { value: -11, source: 'Other source' } }] };
    const html = render({ scoreGame: game.id }, { data: { ...data, weeks: [{ ...data.weeks[0], entries: [entry, other] }] } });
    expect(markupProblems(html)).toEqual([]);
    const text = words(html);
    expect(text).toContain('Back to Play'); expect(text).toContain('Back to Your score');
    expect(text).toContain('Week 6 · Guess the Spread'); expect(text).toContain('8 / 10 points'); expect(text).toContain('Off by 2');
    expect(html).toContain('role="img" aria-label="Line DEN −5, you DEN −3, off by 2"');
    expect(text).toContain('DEN wins by'); expect(text).toContain('Each half point off costs 1 point.'); expect(text).toContain('Kickoff Sun Oct 18, 1:00 PM PT');
    expect(html).toContain('aria-label="About this score"');
    expect(html).not.toContain('Personal score summary');
    for (const leak of ['−9', '−11', 'Other source']) expect(html).not.toContain(leak);
  });
  it('a game not scored yet says so in one sentence and keeps its Late marker; the reason stays one tap away', () => {
    const lateEntry = { ...entry, weekPoints: null, picks: [{ ...entry.picks[0], points: null, late: { minutes: 0 }, reference: { value: null, status: 'pending', reason: 'First qualifying quote has not arrived' } }] };
    const week = { ...data.weeks[0], entries: [lateEntry] };
    const html = render({ scoreGame: game.id }, { data: { ...data, weeks: [week] } });
    expect(html).toContain('Late · 0 min'); expect(html).toContain('Waiting for a scoring line.'); expect(words(html)).toContain('You · DEN −3');
    expect(html).not.toContain('/ 10 points'); expect(html).not.toContain('gx-ys-axis');
    expect(gameDetails({ row: scoreRows(week, lateEntry)[0], mode: 'guess_spread', entry: lateEntry })).toContain('First qualifying quote has not arrived');
  });
  it('a read on its way draws placeholders in the layer; a failure says why with Try again; a kept copy stays under one status line', () => {
    expect(render({}, { data: null, loading: true })).toContain('Loading your score…');
    const failed = words(render({}, { data: null, error: { status: 500, message: 'Server down' }, onRetry: () => {} }));
    expect(failed).toContain('Your score could not be loaded. Server down'); expect(failed).toContain('Try again');
    const stale = words(render({}, { error: { status: 500, message: 'Server down' }, stale: true, onRetry: () => {} }));
    expect(stale).toContain('Your score could not refresh. Showing the last loaded copy.'); expect(stale).toContain('8 / 10');
  });
  it('receipt keeps pending distinct from a legitimate zero and never uses a current quote', () => {
    const pendingRow = { lockedIn: true, points: null, late: { minutes: 12 }, reference: { value: null, status: 'pending', reason: 'No qualifying saved quote' } };
    const pending = renderToStaticMarkup(<ScoreReceipt game={game} mode="guess_total" guess={44} lockedAt="2026-10-15T18:00:00Z" row={pendingRow}/>);
    expect(pending).toContain('Waiting for scoring line'); expect(pending).not.toContain('0 / 10');
    // The Late state stays on the card; the reason is one tap away behind "About this score" (D-62 rule 4, D-23).
    expect(pending).toContain('Late · 12 min'); expect(pending).toContain('aria-label="About this score"');
    expect(receiptDetails({ game, mode: 'guess_total', row: pendingRow, guess: 44, lockedAt: '2026-10-15T18:00:00Z' })).toContain('No qualifying saved quote');
    const zero = renderToStaticMarkup(<ScoreReceipt game={game} mode="guess_total" guess={44} lockedAt="2026-10-15T18:00:00Z" row={{ lockedIn: true, points: 0, reference: { value: 60, source: 'Fixture' } }}/>);
    expect(zero).toContain('0 / 10'); expect(zero).toContain('Missed by 16');
  });
  it('D-62: the locked-in card leads with the points, one sentence and your guess beside the saved line; the rest sits behind ⓘ', () => {
    const row = { lockedIn: true, eligible: true, points: 8, reference: { value: -2, source: 'Synthetic three-book median', observedAt: '2026-10-27T19:29:00Z', rule: 'first_line_after_submission' } };
    const props = { game: { id: 'PHI-JAX', awayCode: 'PHI', homeCode: 'JAX' }, mode: 'guess_spread', row, guess: -3, lockedAt: '2026-10-27T19:30:00Z' };
    const html = renderToStaticMarkup(<div className="gx"><ScoreReceipt {...props} onScore={() => {}}/></div>);
    expect(markupProblems(html)).toEqual([]);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    // Picture first: the score, the one sentence, then "You JAX −3" beside "Line JAX −2", and the weekly-score link.
    expect(text).toBe('8 / 10 points Missed by 1 You JAX −3 Line JAX −2 View weekly score');
    expect(html.indexOf('gx-n-l')).toBeLessThan(html.indexOf('Missed by 1'));
    expect(html).toContain('aria-label="About this score"');
    // Nothing is removed: the lock-in time, the guess and line in words, the source with its observed time and the rule.
    expect(receiptDetails(props)).toEqual([
      'Locked in Tue Oct 27, 12:30 PM PT · Jaguars −3.',
      'Saved line · Jaguars −2.',
      'Synthetic three-book median · Observed Tue Oct 27, 12:29 PM PT.',
      'First qualifying line after lock-in. Later movement does not replace it.',
    ]);
    const exact = renderToStaticMarkup(<ScoreReceipt {...props} guess={-2} row={{ ...row, points: 10 }}/>);
    expect(exact).toContain('Right on the line'); expect(exact).not.toContain('Missed by');
    const ineligible = renderToStaticMarkup(<ScoreReceipt {...props} row={{ ...row, eligible: false }}/>);
    expect(ineligible).toContain('Not eligible for scoring.'); expect(ineligible).not.toContain('8 / 10');
  });
});

describe('matchups as marks (D-62)', () => {
  const SEA_DEN = { srcs: [teamMarks.SEA.src, teamMarks.DEN.src], name: 'Seattle Seahawks at Denver Broncos' };
  it('each Your score row leads with the matchup, away first; the game layer\'s heading is the matchup; the Matchup filter keeps its text options', () => {
    const html = render();
    expect(matchups(html)).toEqual([SEA_DEN]);
    const row = [...walk(parseMarkup(html))].find(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-ys-row'));
    expect(nameFrom(row)).toContain('Seattle Seahawks at Denver Broncos');
    const layer = render({ scoreGame: game.id });
    const heading = [...walk(parseMarkup(layer))].find(n => n.tag === 'h2');
    expect(nameFrom(heading)).toBe('Seattle Seahawks at Denver Broncos');
    const filters = renderToStaticMarkup(<div className="gx"><ScoreFilters week={data.weeks[0]} filters={{ team: '', matchup: '' }} onChange={() => {}}/></div>);
    expect(filters).toContain('<option value="SEA-DEN">SEA at DEN</option>');
  });
  it('each comparison card’s heading is the week and the matchup as 32px marks', () => {
    const pick = { gameId: game.id, guess: -3, lockedIn: true, points: 8, reference: { value: -5, source: 'Fixture', observedAt: '2026-10-15T17:59:00Z' } };
    const other = { ...pick, guess: -6, points: 9 };
    const history = { viewer: 'owner', season: 2026, seasons: [2026], members: [{ id: 'owner', displayName: 'You' }, { id: 'friend', displayName: 'Friend' }],
      weeks: [{ season: 2026, week: 6, revealed: { guess_spread: true }, games: [game], entries: [{ userId: 'owner', mode: 'guess_spread', status: 'submitted', picks: [pick] }, { userId: 'friend', mode: 'guess_spread', status: 'submitted', picks: [other] }] }] };
    const html = renderToStaticMarkup(<div className="gx"><ComparisonContent data={history} currentWeek={6} scopeName="Community" view={{}} onChange={() => {}} onRefresh={() => {}}/></div>);
    expect(markupProblems(html)).toEqual([]);
    const heading = [...walk(parseMarkup(html))].find(n => n.tag === 'h2' && nameFrom(n).startsWith('Week 6 · '));
    expect(nameFrom(heading)).toBe('Week 6 · Seattle Seahawks at Denver Broncos');
    expect(matchups(heading)).toEqual([SEA_DEN]);
    expect(html).toContain('gx-mu--32');
  });
});
```

Create `tests/next-your-score-motion.test.mjs`:

```js
// D-69 Your score motion (web/src/next/play/yourScore.css): the number line, the total's meter and the row bars reveal
// by a transform only, on a layer opened after the launch, and never under reduced motion. Source-level check.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('motion: the number line, meters and bars grow by transform only, on a layer opened after the launch, and never under reduced motion', () => {
  const css = fs.readFileSync(new URL('../web/src/next/play/yourScore.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = css.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/);
  assert.ok(block, 'the growth sits in one no-preference block');
  assert.ok(!css.replace(block[0], '').includes('animation'), 'nothing animates outside it');
  const rules = block[1].split('}').filter(rule => rule.includes('animation'));
  assert.ok(rules.length >= 1);
  for (const rule of rules) assert.match(rule, /\.gx-nest-card\[data-enter="in"\]/, 'only a layer that entered (never a page load: Nest sets data-enter after the first navigation)');
  assert.match(css, /@keyframes gx-ys-grow \{ from \{ transform: scaleX\(0\); \} to \{ transform: none; \} \}/);
});
```

- [ ] **Step 3: Run them and see them fail**

Run: `node --test tests/next-router.test.mjs tests/next-your-score-motion.test.mjs && npx vitest run tests/next-scoring-ui.test.jsx`
Expected: FAIL: the four new router tests (`scoreGame`, `layer` and `item` are not steps, the restore keeps
`SEA-DEN`), the motion test
(`ENOENT … yourScore.css`), and the Vitest file (`ScoreFilters`/`gameDetails` are not exported; "Personal score
summary" holds "Your weekly points").

- [ ] **Step 4: Make a game in Your score a step in `web/src/next/shell/state.js`**

In `navigationPatch`, after the line
`  || (tab === 'play' && state.views.play.section === 'picks' && Object.hasOwn(patch, 'pickGame') && (patch.pickGame ?? null) !== (state.views.play.pickGame ?? null))`
add:

```js
  // D-69: opening or closing one game's layer in Your score is a step too, so Back closes the game and leaves the week.
  || (tab === 'play' && state.views.play.section === 'score' && Object.hasOwn(patch, 'scoreGame') && (patch.scoreGame ?? null) !== (state.views.play.scoreGame ?? null))
  // D-69 step 1: a Play section's nested layer (the generic `layer` and `item` keys: a Points slot, a badge, the awards)
  // is a step, so Back closes one layer. Compare's `item` picks the other player in place, a choice inside one layer.
  || (tab === 'play' && state.views.play.section !== 'compare' && ['layer', 'item'].some(key => Object.hasOwn(patch, key) && (patch[key] ?? null) !== (state.views.play[key] ?? null)))
```

This step is shared: tasks 4 (Points `item`) and 5 (Badges `layer`/`item`) rely on it and add no `state.js` change.

After `const closed = { sheets: [], dialog: null, popover: null, page: null };` add:

```js
/** The Play view keys that open a nested layer (D-69): Your guesses (`pickGame`), Your score (`scoreGame`) and every
 * other section's generic `layer` and `item`. */
const PLAY_LAYER_KEYS = Object.freeze(['pickGame', 'scoreGame', 'layer', 'item']);
```

In `case 'go':` replace
`      const next = target.tab === 'play' && Object.hasOwn(current, 'pickGame') ? Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'pickGame')) : current;`
with:

```js
      // A nested layer is opened by its own address key, never carried into a fresh Play destination (a link that names
      // one, such as a receipt's scoreGame, passes it in `target.view`, which is merged after this).
      const next = target.tab === 'play' && PLAY_LAYER_KEYS.some(key => Object.hasOwn(current, key)) ? Object.fromEntries(Object.entries(current).filter(([key]) => !PLAY_LAYER_KEYS.includes(key))) : current;
```

In the `ROUTE_KEYS` list (the keys Back restores from the trail), add `'layer', 'item'` after `'pickGame'`. Nothing reads
the generic `layer` and `item` view keys yet (step 0 added them to the router only), so this changes no screen today;
without it, Back from a badge or a Points slot would keep the layer open.

In `case 'restore':` change `section: undefined, pickGame: undefined, ...(place.tab` to
`section: undefined, pickGame: undefined, scoreGame: undefined, layer: undefined, item: undefined, ...(place.tab` (a
popstate to the list must close the layer; the saved place carries its keys when it had one).

- [ ] **Step 5: Write `web/src/next/play/scoreHooks.js`**

```js
// D-69 Your score glue: a history read into the moments engine, and the season rank chip. React only; the rules live in
// scoreMoments.js and yourScore.js.
import { useEffect, useMemo } from 'react';
import { MODES, rankTile } from '../../../../shared/guess-board.mjs';
import { peekMove, rankKey, readRank } from '../league/rankMoment.js';
import { useMoments } from '../moments/MomentsProvider.jsx';
import { scoreReport } from './scoreMoments.js';
import { rankChip } from './yourScore.js';

/** Reports the score moments of each fresh history answer (rule 1). A pending or failed read reports nothing. */
export function useScoreMoments(read) {
  const report = useMoments()?.report;
  const fresh = read && !read.loading && !read.error ? read.data ?? null : null;
  useEffect(() => {
    const out = scoreReport({ data: fresh });
    if (out && report) report(out.candidates, { source: out.source });
  }, [fresh, report]);
}

/**
 * `{ season, guess_spread, guess_total }`: each market's season rank chip from the Community standings Home already
 * reads (`rankTile`), with the move the League board last showed on this device (`peekMove`: read only, so the board
 * still plays its own rank moment). `season` is the season those standings rank.
 */
export function useSeasonRanks(app) {
  const community = app?.community?.data ?? null, viewer = app?.accountId ?? '';
  return useMemo(() => {
    const out = { season: Number.isInteger(community?.week?.season) ? community.week.season : null };
    for (const mode of MODES) {
      const tile = community ? rankTile({ standings: community.standings, viewer, mode }) : null;
      out[mode] = rankChip(tile, tile?.rank ? peekMove(readRank(rankKey(viewer, 'community', mode)), { rank: tile.rank }) : null);
    }
    return out;
  }, [community, viewer]);
}
```

- [ ] **Step 6: Replace `web/src/next/play/WeeklyScore.jsx`**

```jsx
// D-69 Play › Your score (spec section 6, mockup Q1-B) and one game's layer under it (P2B, Sean on November 3, 2026).
// One read, the season's history, feeds both. Points come from the SQL scorer, never a latest-market calculation, and
// the game layer shows only your own guess and its saved line (D-31). The list is the `score` layer; a game is the
// `score:game:<id>` layer at the `scoreGame` address key, so a reload or a shared link reopens it and Back closes it.
// A newly scored Bullseye and a final week are big moments in the score scope, reported from a fresh read only.
import { useRef } from 'react';
import { communityApi } from '../../api.js';
import { show } from '../../communityFormat.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, InfoButton, Matchup, Move, Pill, Segmented, Skeleton, cx, matchupWords } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { useMomentScope } from '../moments/MomentsProvider.jsx';
import { SCOPES } from '../moments/catalog.js';
import { INFO } from '../info.js';
import { fmtFull } from '../format.js';
import { FilterToggle } from './FilterToggle.jsx';
import { PlayLayer } from './PlayLayer.jsx';
import { PlayEmpty, PlayFailure } from './PlayStates.jsx';
import { receiptDetails } from './ScoreReceipt.jsx';
import { WeekChips } from './WeekChips.jsx';
import { SCORE_MARKETS, modeOf, ownEntry, scoreRows, scoreSummary } from './scoring.js';
import { useScoreMoments, useSeasonRanks } from './scoreHooks.js';
import { weekFinal } from './scoreMoments.js';
import { gameView, heroModel, layerMeta, rowView, scoreFinePrint } from './yourScore.js';
import './scores.css';
import './yourScore.css';

export function WeeklyScore() {
  const app = useAppData(), shell = useShell(), view = shell.state.views.play;
  useMomentScope(SCOPES.score);
  const season = Number.isInteger(view.season) ? view.season : null;
  const key = `${app.accountId}:score:${season ?? 'latest'}`;
  const read = useLeagueRead(key, signal => communityApi('history', season ? { season } : {}, signal), error => { if (error.status === 401) app.requestSignIn(); });
  useScoreMoments(read);
  // Spec section 7: a failed or repeated read keeps the last good copy on screen (it never plays a moment).
  const kept = useRef(null);
  if (read.data) kept.current = { key, data: read.data };
  const copy = kept.current?.key === key ? kept.current.data : null;
  const data = read.data ?? copy;
  const ranks = useSeasonRanks(app);
  // The rank chip is this season's board rank: shown only beside a week of that season.
  const rank = data && ranks.season !== null && data.season === ranks.season ? ranks[modeOf(view.market)] : null;
  return <WeeklyScoreContent data={data} view={view} rank={rank} loading={!data && read.loading} error={read.error} stale={!read.data && !!copy}
    onRetry={read.retry} onChange={patch => shell.setView('play', patch)} onRefresh={read.retry} onPicks={patch => shell.setView('play', { ...patch, section: 'picks' })}/>;
}

/** The "About this score" lines for one game: today's receipt (lock-in, saved line, source, observed time, rule note). */
export function gameDetails({ row, mode, entry }) {
  return row?.locked ? receiptDetails({ game: row.game, mode, row, guess: row.guess, lockedAt: row.pick?.lockedAt || entry?.submittedAt }) : [];
}

/**
 * Both layers in one frame (one Nest), so a data load or a move between the list and a game never remounts the card.
 * `data` null with `loading` draws placeholders in the layer; with `error`, one sentence and Try again. `stale` (a kept
 * copy beside a failed read) adds one status sentence over the copy.
 */
export function WeeklyScoreContent({ data, view, rank = null, loading = false, error = null, stale = false, onRetry, onChange, onRefresh, onPicks }) {
  const mode = modeOf(view.market), gameId = typeof view.scoreGame === 'string' && view.scoreGame ? view.scoreGame : null;
  const weeks = (data?.weeks || []).slice().sort((a, b) => b.week - a.week);
  const weekNumber = Number.isInteger(view.week) ? view.week : weeks[0]?.week;
  const week = weeks.find(item => item.week === weekNumber) ?? null;
  const entry = data ? ownEntry(week, data.viewer, mode) : null;
  const all = scoreRows(week, entry);
  const filters = { team: view.team || '', matchup: view.matchup || '' }, filtered = Boolean(filters.team || filters.matchup);
  const rows = scoreRows(week, entry, filters);
  const row = gameId ? all.find(item => item.game.id === gameId) ?? null : null;
  const frame = gameId
    ? { label: row ? matchupWords(row.game.awayCode, row.game.homeCode) : 'Your score', layer: `score:game:${gameId}`,
      parents: [{ key: 'score', label: 'Your score', open: () => onChange({ scoreGame: undefined }) }],
      title: row ? <Matchup away={row.game.awayCode} home={row.game.homeCode} size={24}/> : 'Your score',
      info: row?.locked ? <InfoButton title="About this score" body={gameDetails({ row, mode, entry })}/> : null }
    : { label: 'Your score', layer: 'score', parents: [], title: 'Your score',
      info: <InfoButton title={INFO.scores.title} body={[...INFO.scores.body, ...scoreFinePrint({ entry, summary: scoreSummary(rows), filtered })]}/> };
  let body;
  if (!data) body = error ? <PlayFailure what="Your score" error={error} onRetry={onRetry}/> : loading ? <Skeleton label="Loading your score…" shape="rows" count={4}/> : null;
  else if (gameId) body = <GameBody row={row} mode={mode} week={weekNumber}/>;
  else body = <ScoreList data={data} mode={mode} weeks={weeks} weekNumber={weekNumber} week={week} entry={entry} all={all} rows={rows} filters={filters} filtered={filtered}
    rank={rank} onChange={onChange} onRefresh={onRefresh} onPicks={onPicks}/>;
  return <div className="gx-screen" data-play="score">
    <PlayLayer className="gx-ys" {...frame}>
      {data && error && stale ? <p className="gx-t-body" role="status">Your score could not refresh. Showing the last loaded copy. <Button variant="ghost" onClick={onRetry}>Try again</Button></p> : null}
      {body}
    </PlayLayer>
  </div>;
}

function ScoreList({ data, mode, weeks, weekNumber, week, entry, all, rows, filters, filtered, rank, onChange, onRefresh, onPicks }) {
  const hero = heroModel({ mode, week: weekNumber, entry, rows, filtered });
  const now = Date.parse(data.now ?? '');
  return <>
    <p className="gx-t-meta gx-c-2 gx-ys-meta">{layerMeta({ week: weekNumber, known: !!week, summary: scoreSummary(all), final: weekFinal(week, entry, now) })}</p>
    <WeekChips label="Week" weeks={weeks.map(item => item.week).sort((a, b) => a - b)} week={weekNumber} onWeek={n => onChange({ week: n, matchup: '' })}
      seasons={data.seasons || []} season={data.season} onSeason={year => onChange({ season: year, week: null, matchup: '' })}/>
    <Segmented label="Score market" options={SCORE_MARKETS} value={mode} onChange={market => onChange({ market })}/>
    <FilterToggle label="Filter games" active={filtered}><ScoreFilters week={week} filters={filters} onChange={onChange}/></FilterToggle>
    <ScoreHero hero={hero} rank={filtered ? null : rank} account={data.viewer} figure={`score.${mode}.${data.season}.${weekNumber}`}/>
    {!week ? <PlayEmpty>No scoring record for this week. Choose another week.</PlayEmpty>
      : !rows.length ? <PlayEmpty>No games match both filters. Clear filters to see this week.</PlayEmpty>
        : <ul className="gx-ys-rows" aria-label={`Week ${weekNumber} games`}>{rows.map(item => <ScoreRow key={`${week.season}:${week.week}:${mode}:${item.game.id}`} row={item} mode={mode} onOpen={() => onChange({ scoreGame: item.game.id })}/>)}</ul>}
    <div className="gx-score-navigation">
      <Button onClick={onRefresh}>Refresh scores</Button>
      {week && <Button onClick={() => onPicks({ season: week.season, week: week.week, market: mode })}>View this week’s picks</Button>}
      <Button variant="ghost" onClick={() => onChange({ section: 'compare' })}>Compare players</Button>
    </div>
  </>;
}

/** The week's hero (Q1-B): the total counting up from what this device last showed, the season rank chip, the bar. */
function ScoreHero({ hero, rank, account, figure }) {
  return <section className="gx-ys-hero" aria-label="Personal score summary">
    <div className="gx-ys-hero-top">
      <div className="gx-ys-hero-head">
        <h3 className="gx-t-micro gx-c-2">{hero.eyebrow}</h3>
        <p className="gx-ys-total">
          {hero.points === null ? <span className="gx-n-xl gx-c-3">—</span>
            : hero.count ? <CountUp className="gx-n-xl" value={hero.points} account={account} figure={figure}/> : <span className="gx-n-xl">{show(hero.points)}</span>}
          <span className="gx-t-body gx-c-2">points</span>
        </p>
      </div>
      {rank ? <p className="gx-ys-rank"><span className="gx-t-micro gx-c-2">Season</span> <span className="gx-n-s">{rank.label}</span>{rank.move ? <> <Move by={rank.move}/></> : null}</p> : null}
    </div>
    {hero.bar !== null ? <span className="gx-ys-meter" role="img" aria-label={hero.meterLabel}><span style={{ width: `${hero.bar}%` }}></span></span> : null}
    {hero.line ? <p className="gx-t-meta gx-c-2">{hero.line}</p> : null}
    {hero.note ? <p className="gx-t-body">{hero.note}</p> : null}
  </section>;
}

/** One picture row (Q1-B): the matchup as marks, BULLSEYE, the points pill, "Line · You · off by" and the bar. */
function ScoreRow({ row, mode, onOpen }) {
  const v = rowView(row, mode);
  return <li>
    <button type="button" className="gx-ys-row" data-game={row.game.id} onClick={onOpen}>
      <span className="gx-ys-row-top">
        <Matchup away={row.game.awayCode} home={row.game.homeCode} size={24}/>
        {v.bullseye ? <span className="gx-t-micro gx-ys-bull">Bullseye</span> : null}
        <span className={cx('gx-ys-pill', v.pill.number ? 'gx-n-s' : 'gx-t-micro')} data-tier={v.pill.tier}>{v.pill.text}</span>
      </span>
      <span className="gx-t-meta gx-c-2 gx-ys-row-meta">{v.meta}</span>
      {v.share !== null ? <span className="gx-ys-bar" data-tier={v.pill.tier} aria-hidden="true"><span style={{ width: `${Math.round(v.share * 1000) / 10}%` }}></span></span> : null}
    </button>
  </li>;
}

/** The filters behind the filter button: Team (either side) AND Matchup, and Clear filters. */
export function ScoreFilters({ week, filters, onChange }) {
  const teams = [...new Set((week?.games || []).flatMap(game => [game.awayCode, game.homeCode]))].sort();
  return <div className="gx-vstack gx-gap-12 gx-ys-filters">
    <label className="gx-t-body">Team<select className="gx-input" value={filters.team} onChange={event => onChange({ team: event.target.value })}><option value="">All teams</option>{filters.team && !teams.includes(filters.team) && <option value={filters.team}>{filters.team} · not this week</option>}{teams.map(team => <option key={team} value={team}>{team}</option>)}</select></label>
    <label className="gx-t-body">Matchup<select className="gx-input" value={filters.matchup} onChange={event => onChange({ matchup: event.target.value })}><option value="">All matchups</option>{(week?.games || []).map(game => <option key={game.id} value={game.id}>{game.awayCode} at {game.homeCode}</option>)}</select></label>
    <Button disabled={!filters.team && !filters.matchup} onClick={() => onChange({ team: '', matchup: '' })}>Clear filters</Button>
  </div>;
}

/** One game's layer (P2B): the points, BULLSEYE, one sentence, the number line, the rule and the kickoff. */
function GameBody({ row, mode, week }) {
  if (!row) return <PlayEmpty>This game is not in this week.</PlayEmpty>;
  const v = gameView({ row, mode, week });
  return <>
    <p className="gx-t-meta gx-c-2 gx-ys-meta">{v.meta}</p>
    {v.scored || v.late ? <div className="gx-ys-game-top">
      {v.scored ? <p className="gx-ys-points"><span className="gx-n-xl">{show(v.points)}</span><span className="gx-t-body gx-c-2">/ 10 points</span></p> : null}
      {v.bullseye ? <span className="gx-t-micro gx-ys-bull">Bullseye</span> : null}
      {v.late ? <Pill tone="pending">{v.late}</Pill> : null}
    </div> : null}
    {v.sentence ? <p className="gx-t-strong">{v.sentence}</p> : null}
    {v.line ? <NumberLine line={v.line}/> : v.you ? <p className="gx-t-body">You · {v.you}</p> : null}
    {v.line ? <p className="gx-t-meta gx-c-2">Each half point off costs 1 point.</p> : null}
    <p className="gx-t-meta gx-c-2">Kickoff {fmtFull(row.game.kickoff)}</p>
  </>;
}

/** The saved line as a sky tick, your guess as a lime dot and the gap between them (it grows on open, scaleX only). */
function NumberLine({ line }) {
  const at = value => `${value}%`;
  return <figure className="gx-ys-line">
    <div className="gx-ys-axis" role="img" aria-label={line.aria}>
      <span className="gx-t-meta gx-ys-axis-label gx-ys-axis-label--line" data-align={line.line.align} style={{ left: at(line.line.pct) }}>{line.line.label}</span>
      <span className="gx-ys-axis-track"></span>
      {line.gap ? <span className="gx-ys-axis-gap" style={{ left: at(line.gap.left), width: at(line.gap.width), transformOrigin: `${line.gap.origin} center` }}></span> : null}
      <span className="gx-ys-axis-tick" style={{ left: at(line.line.pct) }}></span>
      <span className="gx-ys-axis-you" style={{ left: at(line.you.pct) }}></span>
      <span className="gx-t-meta gx-ys-axis-label gx-ys-axis-label--you" data-align={line.you.align} style={{ left: at(line.you.pct) }}>{line.you.label}</span>
      {line.ticks.map(tick => <span key={tick.value} className="gx-t-meta gx-tnum gx-c-3 gx-ys-axis-num" style={{ left: at(tick.pct) }}>{tick.label}</span>)}
    </div>
    <figcaption className="gx-t-meta gx-c-3 gx-ys-caption">{line.caption}</figcaption>
  </figure>;
}
```

- [ ] **Step 7: Write `web/src/next/play/yourScore.css`**

```css
/* D-69 Play › Your score (mockup Q1-B) and its game layer (P2B). Tokens only. Lime marks only you: your total's bar,
   your dot, your Bullseye. Only transform moves, and only when the layer entered after the launch. */
.gx .gx-ys-meta { margin: 0; }
.gx .gx-ys-hero { display: flex; flex-direction: column; gap: var(--gx-space-2); min-width: 0; margin: 0; padding: var(--gx-space-3) var(--gx-space-4); border-radius: var(--gx-radius-md); background: var(--gx-surface-3); }
.gx .gx-ys-hero-top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-ys-hero-head { display: flex; flex-direction: column; gap: var(--gx-space-1); min-width: 0; }
.gx .gx-ys-hero-head > h3 { margin: 0; }
.gx .gx-ys-total, .gx .gx-ys-points { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gx-space-2); margin: 0; }
.gx .gx-ys-rank { display: inline-flex; align-items: center; gap: var(--gx-space-2); margin: 0; padding: var(--gx-space-1) var(--gx-space-3); border-radius: var(--gx-radius-pill); background: var(--gx-surface-2); }
.gx .gx-ys-meter { display: block; height: 8px; overflow: hidden; border-radius: var(--gx-radius-pill); background: var(--gx-surface-1); }
.gx .gx-ys-meter > span { display: block; height: 100%; border-radius: var(--gx-radius-pill); background: var(--gx-accent-ink); transform-origin: left center; }
.gx .gx-ys-rows { display: flex; flex-direction: column; gap: var(--gx-space-2); margin: 0; padding: 0; list-style: none; }
.gx .gx-ys-row {
  display: flex; flex-direction: column; gap: var(--gx-space-1); width: 100%; min-width: 0; min-height: var(--gx-size-touch);
  padding: var(--gx-space-3); border: 1px solid var(--gx-border); border-radius: var(--gx-radius-md);
  background: var(--gx-surface-3); color: var(--gx-text-1); font: inherit; text-align: left; cursor: pointer;
}
.gx .gx-ys-row-top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-ys-row-top > .gx-ys-pill { margin-left: auto; }
.gx .gx-ys-row-meta { min-width: 0; overflow-wrap: anywhere; }
.gx .gx-ys-pill, .gx .gx-ys-bull { display: inline-flex; align-items: center; min-height: 24px; padding: 0 var(--gx-space-2); border-radius: var(--gx-radius-xs); white-space: nowrap; }
.gx .gx-ys-pill { background: var(--gx-surface-2); color: var(--gx-text-1); }
.gx .gx-ys-pill[data-tier="exact"], .gx .gx-ys-bull { background: var(--gx-accent-tint); color: var(--gx-accent-ink); }
.gx .gx-ys-pill[data-tier="good"] { background: var(--gx-win-tint); color: var(--gx-win); }
.gx .gx-ys-pill[data-tier="none"] { color: var(--gx-text-2); }
.gx .gx-ys-bar { display: block; height: 4px; overflow: hidden; border-radius: var(--gx-radius-pill); background: var(--gx-surface-1); }
.gx .gx-ys-bar > span { display: block; height: 100%; border-radius: var(--gx-radius-pill); background: var(--gx-border-strong); transform-origin: left center; }
.gx .gx-ys-bar[data-tier="exact"] > span { background: var(--gx-accent-ink); }
.gx .gx-ys-bar[data-tier="good"] > span { background: var(--gx-win); }
.gx .gx-ys-filters label { display: grid; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-ys-filters select { width: 100%; min-width: 0; }
.gx .gx-ys-game-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gx-space-2); }
/* The number line (P2B): the saved line as a sky tick, your guess as a lime dot, the gap between them filled. */
.gx .gx-ys-line { display: flex; flex-direction: column; gap: var(--gx-space-2); margin: 0; }
.gx .gx-ys-axis { position: relative; height: 104px; margin: 0 var(--gx-space-4); }
.gx .gx-ys-axis-track { position: absolute; top: 38px; left: 0; right: 0; height: 4px; border-radius: var(--gx-radius-pill); background: var(--gx-surface-3); }
.gx .gx-ys-axis-gap { position: absolute; top: 34px; height: 12px; border-radius: var(--gx-radius-pill); background: var(--gx-accent-ink); opacity: 0.35; }
.gx .gx-ys-axis-tick { position: absolute; top: 26px; width: 3px; height: 28px; border-radius: var(--gx-radius-xs); background: var(--gx-data); translate: -50% 0; }
.gx .gx-ys-axis-you { position: absolute; top: 32px; width: 16px; height: 16px; border-radius: var(--gx-radius-pill); background: var(--gx-accent-ink); box-shadow: 0 0 0 3px var(--gx-surface-2); translate: -50% 0; }
.gx .gx-ys-axis-label { position: absolute; white-space: nowrap; translate: -50% 0; }
.gx .gx-ys-axis-label[data-align="start"] { translate: none; }
.gx .gx-ys-axis-label[data-align="end"] { translate: -100% 0; }
.gx .gx-ys-axis-label--line { top: 0; color: var(--gx-data); }
.gx .gx-ys-axis-label--you { top: 58px; color: var(--gx-accent-ink); }
.gx .gx-ys-axis-num { position: absolute; top: 84px; translate: -50% 0; }
.gx .gx-ys-caption { margin: 0; text-align: center; }
@media (prefers-reduced-motion: no-preference) {
  /* D-69 4.3: charts reveal by a transform on the drawn part (scaleX), only when the layer entered after the launch. */
  .gx .gx-nest-card[data-enter="in"] .gx-ys-axis-gap, .gx .gx-nest-card[data-enter="in"] .gx-ys-meter > span, .gx .gx-nest-card[data-enter="in"] .gx-ys-bar > span { animation: gx-ys-grow var(--gx-dur-base) var(--gx-ease-standard) var(--gx-dur-quick) both; }
}
@keyframes gx-ys-grow { from { transform: scaleX(0); } to { transform: none; } }
@media (forced-colors: active) {
  .gx .gx-ys-row, .gx .gx-ys-hero, .gx .gx-ys-pill, .gx .gx-ys-bull { border: 1px solid CanvasText; }
  .gx .gx-ys-meter > span, .gx .gx-ys-bar > span, .gx .gx-ys-axis-gap, .gx .gx-ys-axis-you { background: Highlight; }
  .gx .gx-ys-axis-track, .gx .gx-ys-axis-tick { background: CanvasText; }
}
```

`scores.css` keeps every rule: `PerGamePlay.jsx` and `ScoreComparison.jsx` still use `.gx-score-navigation`,
`.gx-score-detail`, `.gx-score-filters` and `.gx-score-matchup`.

- [ ] **Step 8: Let the layer draw its own heading in `web/src/next/play/Play.jsx`**

Replace the one line
`  if (score) return <div className="gx-screen gx-vstack gx-gap-16"><div className="gx-play-titlebar"><h1 className="gx-t-title gx-grow">Your weekly score</h1><InfoButton title={INFO.scores.title} body={INFO.scores.body}/></div><WeeklyScore/></div>;`
with:

```jsx
  if (score) return <WeeklyScore/>;
```

The `InfoButton` and `INFO` imports in `Play.jsx` are now unused; task 7 owns those lines and drops them.

- [ ] **Step 9: Update the browser specs that drive the old score page**

1. `tests/cloud-browser/next-per-game-scoring.spec.js`. After `choose()` add the helper:

```js
/** The phone contract at 390 and 320 px in Dark and Light: no sideways scroll, axe clean, a screenshot each. */
async function shots(page, info, name) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      expect(axe.violations.map(item => `${item.id}: ${item.nodes.map(node => node.target.join(' ')).join(', ')}`)).toEqual([]);
      await page.screenshot({ path: info.outputPath(`${name}-${width}-${theme}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}
```

   In the first test, replace everything from the line
   `    await (await openGame(page, game.id)).getByRole('button', { name: 'View weekly score', exact: true }).click();`
   through the closing `}` of the `weekly-score-${width}-${theme}.png` theme loop with:

```js
    await (await openGame(page, game.id)).getByRole('button', { name: 'View weekly score', exact: true }).click();
    // D-69 P2B: the receipt's link opens that game's own layer under Your score, at its own address.
    await expect(page.locator('.gx-nest-card')).toContainText('/ 10 points');
    await expect(page.getByRole('img', { name: /^Line .+, you .+, off by 2$/ })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`scoreGame=${game.id}`));
    await page.getByRole('button', { name: 'About this score', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About this score' })).toContainText('Synthetic three-book median');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.locator('.gx-nest-card')).toContainText('/ 10 points'); // a reload reopens the layer
    await shots(page, info, 'score-game');
    await page.getByRole('button', { name: 'Back to Your score', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Personal score summary' })).toContainText('8 points');
    await page.getByRole('button', { name: 'About your scores', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'About your scores' })).toContainText('8 personal points waiting for kickoff');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Filter games', exact: true }).click();
    await page.getByRole('combobox', { name: 'Team', exact: true }).selectOption(game.homeCode);
    await expect(page.getByRole('heading', { name: 'Selected games' })).toBeVisible();
    await page.getByRole('combobox', { name: 'Matchup', exact: true }).selectOption(world.personal.games[1].id);
    await expect(page.getByText('No games match both filters. Clear filters to see this week.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await page.getByRole('button', { name: `Week ${world.personal.week - 1}`, exact: true }).click();
    await expect(page.getByText('No saved Spread guesses for this week.')).toBeVisible();
    await page.getByRole('button', { name: `Week ${world.personal.week}`, exact: true }).click();
    await expect(page.getByRole('region', { name: 'Personal score summary' })).toContainText('8 points');
    await shots(page, info, 'weekly-score');
    // Back closes one layer: a row opens its game and the browser Back button returns to the list.
    await page.locator('.gx-ys-row').first().click();
    await expect(page).toHaveURL(/scoreGame=/);
    await page.goBack();
    await expect(page.getByRole('region', { name: 'Personal score summary' })).toBeVisible();
    await expect(page).not.toHaveURL(/scoreGame=/);
```

2. `tests/cloud-browser/four-tab-redesign.spec.js`: change
   `await expect(page.getByRole('heading', { name: 'Your weekly score', exact: true })).toBeVisible();` to
   `await expect(page.getByRole('heading', { name: 'Your score', exact: true })).toBeVisible();`.
3. `tests/cloud-browser/next-phone-layout.spec.js`: in `ADDRESSES`, after `'#play/score',` add
   `'#play/score?scoreGame=SEA-DEN',` (its `WEEK6` fixture names that game, so the game layer is checked at 320 and 390
   px in both themes). The "score buttons keep one-line labels" test keeps working: the buttons stay in
   `.gx-score-navigation`.
4. `tests/cloud-browser/next-scroll-navigation.spec.js`: in `ADDRESSES`, after `'#play/picks',` add `'#play/score',`
   (no ancestor of the bars gets a transform while the layer's bars and number line grow).

`tests/cloud-browser/comparisons-home.spec.js` needs no change ("Compare players" stays on the layer).

- [ ] **Step 10: Run everything this touches**

Run: `node --test tests/next-router.test.mjs tests/next-shell-state.test.mjs tests/next-four-tab-navigation.test.mjs tests/next-your-score-motion.test.mjs tests/next-tokens.test.mjs tests/next-app-view.test.mjs`
Expected: PASS, `fail 0` (`next-app-view` confirms the rebuilt layer imports no old `web/src/*.jsx` screen).
Run: `npx vitest run tests/next-scoring-ui.test.jsx tests/four-tab-landings.test.jsx tests/next-points-ui.test.jsx`
Expected: PASS.
Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-per-game-scoring.spec.js tests/cloud-browser/four-tab-redesign.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js tests/cloud-browser/comparisons-home.spec.js`
Expected: PASS with `skipped 0`. Open `score-game-320-light.png` and `weekly-score-320-dark.png` from the report and
check: no clipped label on the number line, the BULLSEYE tag and pill wrap rather than overflow, the rank chip sits
under the total when it does not fit beside it.
Then the full local suite: `node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run`.

- [ ] **Step 11: Commit**

```bash
git add web/src/next/shell/state.js web/src/next/play/Play.jsx web/src/next/play/WeeklyScore.jsx web/src/next/play/scoreHooks.js web/src/next/play/yourScore.css tests/next-router.test.mjs tests/next-scoring-ui.test.jsx tests/next-your-score-motion.test.mjs tests/cloud-browser/next-per-game-scoring.spec.js tests/cloud-browser/four-tab-redesign.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js
git diff --cached --stat
git ls-files --eol web/src/next/shell/state.js web/src/next/play/WeeklyScore.jsx web/src/next/play/scoreHooks.js web/src/next/play/yourScore.css
git commit -m "Play: Your score as a nesting layer with a game layer per game (D-69 step 1, Q1-B and P2B)" -m "Week chips and a Season chip replace the dropdowns; the total counts up beside the season rank chip; picture rows with marks, Line · You · off by, a bar and a points pill open the game layer (scoreGame address: a step, Back closes it, a reload reopens it) with the number line and About this score. Filters and the standings fine print move behind their buttons." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2c: The Your score tile for the Play landing

**Files:**
- Create: `web/src/next/play/ScoreTile.jsx`
- Test: `tests/next-score-tile.test.jsx` (new)

**Interfaces:**
- Produces: `ScoreTile({ onOpen })`, one `PlayTile`: label "Your score", icon `chart`, `big` the latest scored week's
  points for the Play market (`views.play.market`, Spread by default; the other market when it has none, never a sum),
  `sub` "Week 8 · ▲ 2" / "Week 8 · ▼ 1" / "Week 8 · 3rd", tone `good` only for a rise, `isNew` from
  `useNewCount(SCOPES.score) > 0`. `onOpen(patch)` gets `{ season, week, market }`; task 7 passes
  `onOpen={patch => shell.go('play', { section: 'score', ...patch })}` (the `go` reducer drops any open `scoreGame`,
  task 2b).
- Consumes: the shared read `${accountId}:home-score:${season}:${week}` that `ScoreHomeTile.jsx` makes (same key, same
  request, `{ shared: true }`); `useScoreMoments` and `useSeasonRanks` (task 2b); `scoreTile` (task 2a).

- [ ] **Step 1: Write the failing test**

```jsx
// D-69 Play landing (P1B): the Your score tile. It reuses the shared home-score history read, shows the latest scored
// week of one market and the board's last move, and says NEW while a score moment waits. Fixture data only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ state: { views: { play: {} } }, go: vi.fn(), setView: vi.fn() }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: vi.fn() }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useNewCount: vi.fn(() => 0) }));
// The tile's props are the contract here; PlayTile's own drawing is Task 1's test.
vi.mock('../web/src/next/play/PlayTile.jsx', () => ({ PlayTile: props => { globalThis.__scoreTile = props; return null; } }));
import { useAppData } from '../web/src/next/data/AppData.jsx';
import { useLeagueRead } from '../web/src/next/league/useLeagueRead.jsx';
import { useNewCount } from '../web/src/next/moments/MomentsProvider.jsx';
import { ScoreTile } from '../web/src/next/play/ScoreTile.jsx';

const ME = 'u-me', game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const week = (n, points) => ({ season: 2026, week: n, games: [game], entries: points === null ? [] : [{ userId: ME, mode: 'guess_spread', status: 'submitted', eligible: true, weekPoints: points, picks: [{ gameId: game.id, guess: -3, lockedIn: true, points, reference: { value: -3 } }] }] });
const history = { viewer: ME, season: 2026, seasons: [2026], weeks: [week(7, 6), week(8, 10), week(9, null)] };
const standings = [['u-a', 90], ['u-b', 80], [ME, 70]].map(([userId, seasonPoints]) => ({ userId, mode: 'guess_spread', seasonPoints, seasonScored: 9 }));
const app = { accountId: ME, requestSignIn: vi.fn(), community: { data: { week: { season: 2026, week: 9 }, standings } } };
const memory = values => { const map = new Map(Object.entries(values)); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) }; };
const tile = (read = { loading: false, error: null, data: history, retry() {} }, onOpen = vi.fn()) => {
  useAppData.mockReturnValue(app); useLeagueRead.mockReturnValue(read);
  renderToStaticMarkup(<ScoreTile onOpen={onOpen}/>);
  return globalThis.__scoreTile;
};

afterEach(() => { delete globalThis.localStorage; useNewCount.mockImplementation(() => 0); });

describe('ScoreTile (P1B)', () => {
  it('shows the latest scored week from the shared home-score read and opens Your score on that week', () => {
    const onOpen = vi.fn();
    const props = tile(undefined, onOpen);
    expect(props).toMatchObject({ label: 'Your score', icon: 'chart', big: '10', sub: 'Week 8 · 3rd', tone: 'plain', isNew: false });
    const [key, , , options] = useLeagueRead.mock.calls.at(-1);
    expect(key).toBe('u-me:home-score:2026:9'); expect(options).toEqual({ shared: true });
    props.onClick();
    expect(onOpen).toHaveBeenCalledWith({ season: 2026, week: 8, market: 'guess_spread' });
  });
  it('NEW: shows NEW (and says it) while a score moment waits for the score scope', () => {
    useNewCount.mockImplementation(scope => (scope === 'score' ? 1 : 0));
    const props = tile();
    expect(props.isNew).toBe(true);
    expect(props.ariaLabel).toBe('Your score, Week 8 Spread, 10 points, season rank 3rd, new result');
  });
  it('the move the League board last showed: a rise reads "▲ 2" in the good tone, a drop "▼ 2" stays plain', () => {
    globalThis.localStorage = memory({ 'gtl.next.rank.v1.u-me.community.guess_spread': JSON.stringify({ rank: 3, from: 5 }) });
    expect(tile()).toMatchObject({ sub: 'Week 8 · ▲ 2', tone: 'good' });
    globalThis.localStorage = memory({ 'gtl.next.rank.v1.u-me.community.guess_spread': JSON.stringify({ rank: 3, from: 1 }) });
    expect(tile()).toMatchObject({ sub: 'Week 8 · ▼ 2', tone: 'plain' });
  });
  it('a read on its way or a failed read shows a dash, never a made-up 0', () => {
    expect(tile({ loading: true, data: null, error: null, retry() {} })).toMatchObject({ big: '—', sub: 'Loading…' });
    expect(tile({ loading: false, data: null, error: { status: 500 }, retry() {} })).toMatchObject({ big: '—', sub: 'Open to retry' });
  });
});
```

- [ ] **Step 2: Run it and see it fail**

Run: `npx vitest run tests/next-score-tile.test.jsx`
Expected: FAIL: the import of `../web/src/next/play/ScoreTile.jsx` does not resolve.

- [ ] **Step 3: Write `web/src/next/play/ScoreTile.jsx`**

```jsx
// D-69 Play landing (P1B): the Your score tile. It reads the season history Home's score tile reads (the shared
// `home-score` read), reports the score moments from each fresh answer, and shows NEW while one waits for the score
// scope. One number: the latest scored week's points for one market (Spread and Total are never summed, D-36).
import { communityApi } from '../../api.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { useNewCount } from '../moments/MomentsProvider.jsx';
import { SCOPES } from '../moments/catalog.js';
import { PlayTile } from './PlayTile.jsx';
import { modeOf } from './scoring.js';
import { useScoreMoments, useSeasonRanks } from './scoreHooks.js';
import { scoreTile } from './yourScore.js';

/** `onOpen(patch)`: `patch` is `{ season, week, market }` (or `{ market }`), the week the tile shows. */
export function ScoreTile({ onOpen }) {
  const app = useAppData(), shell = useShell(), current = app.community.data?.week;
  const read = useLeagueRead(`${app.accountId}:home-score:${current?.season}:${current?.week}`, signal => communityApi('history', current?.season ? { season: current.season } : {}, signal), error => { if (error.status === 401) app.requestSignIn(); }, { shared: true });
  useScoreMoments(read);
  const fresh = useNewCount(SCOPES.score) > 0;
  const ranks = useSeasonRanks(app);
  const tile = scoreTile({ data: read.data, mode: modeOf(shell.state.views.play.market), ranks, loading: read.loading, error: read.error });
  return <PlayTile label="Your score" icon="chart" big={tile.big} sub={tile.sub} tone={tile.tone} isNew={fresh}
    ariaLabel={fresh ? `${tile.said}, new result` : tile.said} onClick={() => onOpen?.(tile.open)}/>;
}
```

- [ ] **Step 4: Run it and see it pass**

Run: `npx vitest run tests/next-score-tile.test.jsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/next/play/ScoreTile.jsx tests/next-score-tile.test.jsx
git diff --cached --stat
git ls-files --eol web/src/next/play/ScoreTile.jsx tests/next-score-tile.test.jsx
git commit -m "Play: the Your score landing tile (D-69 step 1, P1B)" -m "The latest scored week's points for one market, the season rank move the League board last showed, NEW while a score moment waits; reports the score moments from the shared home-score read." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Notes (task 2)

1. **Rank chip ("Season 3rd ▲2"):** the season board rank for the shown market from the Community standings Home
   already reads (`rankTile`), with the move the League board last showed on this device (`peekMove`, read only, so
   task 6 still spends the rank moment). No fair week rank exists mid-week (other players' week points count only
   started games). Shown only beside a week of that season, never beside a filtered subtotal.
2. **Week final:** every game of your week for that market is scored or can no longer be (not locked at its kickoff,
   by the reply's `now`); never for a sit-out or an ineligible ballot. With submission-time scoring it can come before
   Sunday. Always big, even for a low week (Sean's PICK column). A miss makes no candidate at all, so a season's up to
   504 score ids never fill the shared 1000-id seen record.
3. **Big score moments still play through `ov.flash`.** Spec 4.2 asks for a card-level burst on the layer; the merged
   engine has only `ov.flash`, whose ghost button says "See badges", and `tests/next-moments-play.test.mjs` pins
   `flashItem`'s shape. Tasks 4 and 6 hit the same gap: one shared fix in task 1 or 8 (pass `kind` through `flashItem`,
   or add the card burst).
4. **Double celebration:** the features job also writes a `bullseye` badge per exact guess (shown from kickoff), so one
   exact guess can celebrate twice: the score Bullseye after lock-in, the badge after kickoff. Ids differ on purpose.
5. **One new request on the Play landing:** `ScoreTile` makes the season history read (`home-score` key) that only the
   undrawn `ScoreHomeTile` and `HomeSummaries` define today; Home does not make it now.
6. **Outside `play/`:** `shell/state.js` makes a `scoreGame` change a step and clears `scoreGame` on `go`, `tab` and
   `restore` (as `pickGame` already is). A receipt's "View weekly score" (`ScoreReceipt`, `lines/YourPickSheet.jsx`)
   already passes `scoreGame`, so it now lands on that game's layer with "Your score" as its lip.
7. **For Sean's mockup check:** "Season" before the rank chip, "points" beside the total, the hero line "40 possible ·
   1 Bullseye · avg miss 1.3" (six numbers per card), the BULLSEYE tag in accent tint with accent-ink text (BRAND_GUIDE
   rule 2 keeps solid lime for the main button and selections), and Compare players kept as a ghost button (it keeps
   `comparisons-home.spec.js` passing until task 3 or 7 gives Compare its tile).
8. **Unverified:** the browser spec edits (not run), task 1's real `FilterToggle`/`WeekChips` markup and layout (my
   renders used stubs built from the brief), and `InfoButton`/`INFO` left unused in `Play.jsx` (task 7's lines).

---

## Task 3 · Compare (Sean's P3B) and its landing tile

Spec section 6 "Compare"; mockup `CompareB.dc.html`. **3a** the rules (pure), **3b** the layer, **3c** the landing tile.

**What the reply already gates (D-31)** [inspected `cloud/league.mjs`, `cloud/community.mjs` `historyPicks`, migrations
`20261016010000` and `20261015190710`]: `/league/comparison` is `gtl_read_community_history` cut to the league roster.
Each week has `gate` = `{ gameId: { spread, total } }` for the viewer, open from your own lock-in of that game and
market, a sit-out, or kickoff. Another member's pick with the gate shut is `{ guess: null, reference: null, points:
null, hidden: true }` (id in `hiddenGames`; all shut → `picks: null`); open and locked carries guess, saved line and
points; open and unlocked is `{ guess: null, hidden: false }`. An ineligible ballot's points are null; your own picks
always pass, drafts included. [executed] On the browser spec's PGlite fixture: Luke 9 + 9, Troy 9 + 10; a Troy Total
ballot Luke has not matched never reaches the reply.

`compare.js` is the second gate: a shut gate or a hidden pick makes the row HIDDEN with **no value of either player**.
Totals use only rows in state `scored`. Two states the brief does not name keep rows honest: **NO GUESS** (not locked
before kickoff, or sat out) and **NOT SCORED** (both locked, a saved line pending or a ballot ineligible).

**Decisions on today's page** (nothing is removed silently):

| Today | Now | Why |
|---|---|---|
| Choose one, several or all players | One face chip at a time; **several at once is retired** | P3B: one other member at a time. Narrows D-53 ("one, several or all"); see notes |
| All players, benchmark, contributor count | Kept as the last chip, **Everyone**: you against each game's benchmark (you included, games weighted equally), with its player count | D-53 capability; reuses the tested `shared/score-comparison.mjs` reader and its gate, so that module stays in use |
| Per-player sample table, points-per-week card | Retired; the head-to-head card gives the pair's shared-game count, week chips step through weeks | D-38: one job per card |
| Single week, week range, full season | Week chips and the Season chip choose week and season; range and full season stay in a **Period** select behind `FilterToggle`; `from`/`to` stay in memory as today (not router keys) | Rare uses behind the filter icon, like Your score |
| Team and matchup filters | Behind `FilterToggle`, with Clear filters | Same as Your score (Q1-B) |
| Spread / Total | `Segmented` on the surface | Same as Your score |
| Saved line sources | Per-row ⓘ "Saved lines, Week N AAA at BBB": each side's line, source and observed time | Fine print behind ⓘ |
| Refresh comparisons button; h1 and "Your weekly score" button | Retired; app refresh (`connectRefresh` in `useLeagueRead`), Try again, the layer heading and its Play lip remain | One heading, no extra buttons |

**Address.** `#play/compare?market=…&season=…&week=…&item=<member id | everyone>` (+ `period`, `team`, `matchup`). A
face chip is `shell.setView('play', { item })`: a choice inside one layer, like a week chip, so it rewrites the entry
and adds no Back step; Back closes Compare; `layer` stays unused. A stale or foreign `item` (from another Play section)
falls back to the default: most shared games this season over both markets, ties in roster order, former members last.

### Task 3a: Compare rules (pure)

**Files:**
- Create: `web/src/next/play/compare.js`
- Test: `tests/next-compare.test.mjs` (new)

**Interfaces:**
- Consumes: `play/scoring.js` (`number`, `ownEntry`, `scoreRows`), `communityFormat.js` (`pickText`, `show`),
  `shared/score-comparison.mjs` (`buildComparison`, `comparisonRows`).
- Produces: `COMPARE_STATES`, `EVERYONE`, `firstName(name)`, `opponents(data)`, `gameOpen(week, gameId, mode)`,
  `compareRows(data, { mode, opponent, from, to, team, matchup, now })` → `[{ key, season, week, game, state, me, them }]`,
  `headToHead(rows)` → `{ shared, me, them, lead }`, `defaultOpponent(data)`, `chooseOpponent(data, item)`,
  `fieldRows(data, filters)`, `leadLine(h, name)`, `statLine(h, everyone)`, `rowTag(row, name)` → `{ text, tone }`,
  `rowLine(row, mode, name)`, `compareTile(data, current)` → `{ big, sub, tone, ariaLabel, view }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/next-compare.test.mjs
// D-69 step 1 Compare (Sean's P3B): the pure rules in web/src/next/play/compare.js. Each test names the contract it guards.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVERYONE, chooseOpponent, compareRows, compareTile, defaultOpponent, fieldRows, firstName, headToHead, leadLine, opponents, rowLine, rowTag, statLine } from '../web/src/next/play/compare.js';

const SEA = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const BUF = { id: 'BUF-KC', awayCode: 'BUF', homeCode: 'KC', kickoff: '2026-10-26T00:20:00Z' };
const ME = 'me', TROY = 'troy', LUKE = 'luke', BEN = 'ben';
const ref = value => ({ value, source: 'Fixture median', observedAt: '2026-10-20T17:00:00Z' });
const locked = (gameId, guess, line, points) => ({ gameId, guess, points, reference: ref(line), lockedIn: true, lockedAt: '2026-10-20T18:00:00Z', hidden: false });
const entry = (userId, picks, extra = {}) => ({ userId, mode: 'guess_spread', status: 'draft', eligible: true, picks, hiddenGames: [], ...extra });
const OPEN = { [SEA.id]: { spread: true, total: false }, [BUF.id]: { spread: true, total: false } };
const CLOSED = { [SEA.id]: { spread: false, total: false }, [BUF.id]: { spread: false, total: false } };
const week = (n, entries, gate = OPEN) => ({ season: 2026, week: n, games: [SEA, BUF], gate, revealed: { guess_spread: false, guess_total: false }, entries });
const members = [{ id: BEN, displayName: 'Ben Former', removed: true }, { id: LUKE, displayName: 'Luke Jun' }, { id: ME, displayName: 'Sean B' }, { id: TROY, displayName: 'Troy Jun' }];
const history = (weeks, now = '2026-10-24T12:00:00Z') => ({ viewer: ME, season: 2026, seasons: [2026], now, members, weeks });
// Week 8, both games scored for both. You: SEA exact (10), BUF off 0.5 (9). Troy: SEA off 0.5 (9), BUF off 1 (8).
const week8 = week(8, [entry(ME, [locked(SEA.id, -3, -3, 10), locked(BUF.id, 2, 2.5, 9)]), entry(TROY, [locked(SEA.id, -2.5, -3, 9), locked(BUF.id, 3.5, 2.5, 8)])]);
const rows = (data, options = {}) => compareRows(data, { mode: 'guess_spread', opponent: TROY, ...options });

test('D-31: a game the reply does not open to you is HIDDEN and its row carries no value of either player, whatever the reply holds', () => {
  // A provider fault: Troy's SEA guess arrives with values although your gate is shut; BUF is open but marked hidden.
  const w = week(9, [entry(ME, [{ gameId: SEA.id, guess: -3, lockedIn: false }]), entry(TROY, [locked(SEA.id, -17.5, -16.5, 7), { ...locked(BUF.id, 17.5, 16.5, 7), hidden: true }])],
    { [SEA.id]: { spread: false, total: false }, [BUF.id]: { spread: true, total: false } });
  const out = rows(history([w]));
  assert.deepEqual(out.map(r => [r.game.id, r.state, r.me, r.them]), [[SEA.id, 'hidden', null, null], [BUF.id, 'hidden', null, null]]);
  assert.doesNotMatch(JSON.stringify(out), /17\.5|16\.5/);
  assert.equal(rowLine(out[0], 'guess_spread', 'Troy'), 'Lock yours to see Troy’s guess');
  assert.deepEqual(rowTag(out[0], 'Troy'), { text: 'HIDDEN', tone: 'neutral' });
  assert.equal(headToHead(out).shared, 0);
  assert.ok(rows(history([week8]), { mode: 'guess_total' }).every(r => r.state === 'hidden'), 'each market is its own gate');
});

test('a game the other player has not locked is WAITING before its kickoff and NO GUESS from it; a sit-out is NO GUESS', () => {
  // A shown game Troy has not locked arrives with no number (cloud/community.mjs historyPicks).
  const w = week(9, [entry(ME, [locked(SEA.id, -3, -3.5, 9), locked(BUF.id, 2, 2.5, 9)]), entry(TROY, [{ gameId: SEA.id, guess: null, reference: null, points: null, hidden: false }])]);
  const before = rows(history([w], '2026-10-25T12:00:00Z'));
  assert.deepEqual(before.map(r => r.state), ['waiting', 'waiting']);
  assert.equal(rowLine(before[0], 'guess_spread', 'Troy'), 'You Broncos −3 · Troy hasn’t locked in');
  assert.deepEqual(rowTag(before[0], 'Troy'), { text: 'WAITING', tone: 'data' });
  const after = rows(history([w], '2026-10-25T21:00:00Z'));
  assert.deepEqual(after.map(r => r.state), ['noGuess', 'waiting'], 'SEA has kicked off, BUF has not');
  assert.equal(rowLine(after[0], 'guess_spread', 'Troy'), 'You Broncos −3 · Troy didn’t lock in');
  const sat = rows(history([week(9, [w.entries[0], { userId: TROY, mode: 'guess_spread', status: 'sat_out', picks: null, hiddenGames: [] }])]));
  assert.deepEqual(sat.map(r => r.state), ['noGuess', 'noGuess']);
  assert.equal(rowLine(sat[0], 'guess_spread', 'Troy'), 'You Broncos −3 · Troy sat out');
  assert.equal(headToHead([...before, ...after, ...sat]).shared, 0, 'nothing waiting or missed counts');
});

test('the head-to-head counts only games scored for both: points, Bullseyes, average miss, shared games and the lead', () => {
  const w9 = week(9, [entry(ME, [locked(SEA.id, -3, -3, 10), locked(BUF.id, 2, 2.5, 9)]),
    entry(TROY, [{ ...locked(SEA.id, -3, null, null), reference: { value: null, status: 'pending' } }, { gameId: BUF.id, guess: null, reference: null, points: null, hidden: false }])]);
  const w10 = week(10, [entry(ME, [locked(SEA.id, -3, -3, 10)]), entry(TROY, [locked(SEA.id, -3, -3, null)], { eligible: false })]);
  const out = rows(history([w10, week8, w9]));
  assert.deepEqual(out.map(r => `${r.week}:${r.state}`), ['8:scored', '8:scored', '9:unscored', '9:waiting', '10:unscored', '10:waiting']);
  const h = headToHead(out);
  assert.deepEqual(h, { shared: 2, lead: 2, me: { points: 19, bullseyes: 1, avgMiss: 0.25 }, them: { points: 17, bullseyes: 0, avgMiss: 0.75 } });
  assert.equal(leadLine(h, 'Troy'), 'You lead by 2');
  assert.equal(statLine(h), 'Bullseyes 1–0 · Avg miss 0.3–0.8 · 2 shared games');
  assert.equal(leadLine(headToHead([]), 'Troy'), 'No shared games yet');
  assert.equal(leadLine({ shared: 1, lead: -1 }, 'Troy'), 'Troy leads by 1');
  assert.equal(leadLine({ shared: 1, lead: 0 }, 'Troy'), 'All square');
});

test('each player is scored against their own saved line, and the tag names who took the game', () => {
  // The same SEA guess against two saved lines: you are off 0.5, Troy is exact.
  const w = week(8, [entry(ME, [locked(SEA.id, -3.5, -3, 9), locked(BUF.id, 2, 2, 10)]), entry(TROY, [locked(SEA.id, -3.5, -3.5, 10), locked(BUF.id, 2.5, 2, 9)])]);
  const out = rows(history([w]));
  assert.deepEqual(out.map(r => [r.me.miss, r.them.miss]), [[0.5, 0], [0, 0.5]]);
  assert.equal(rowLine(out[0], 'guess_spread', 'Troy'), 'You Broncos −3.5 · Troy Broncos −3.5');
  assert.deepEqual(out.map(r => rowTag(r, 'Troy')), [{ text: 'TROY +1', tone: 'neutral' }, { text: 'YOU +1', tone: 'win' }]);
  const even = rows(history([week(8, [entry(ME, [locked(SEA.id, -3, -3, 10)]), entry(TROY, [locked(SEA.id, -3, -3, 10)])])]));
  assert.deepEqual(rowTag(even[0], 'Troy'), { text: 'EVEN', tone: 'neutral' });
});

test('Compare opens on the member with the most shared games this season over both markets, ties in roster order; a chosen member stays', () => {
  const data = history([week8]);
  assert.deepEqual(opponents(data).map(m => m.id), [LUKE, TROY, BEN], 'never the viewer; a former member comes last');
  assert.equal(defaultOpponent(data), TROY);
  assert.equal(chooseOpponent(data, LUKE), LUKE);
  assert.equal(chooseOpponent(data, BEN), BEN, 'a former member can still be compared (D-23)');
  for (const item of [ME, 'stranger', undefined, 'SEA-DEN']) assert.equal(chooseOpponent(data, item), TROY, String(item));
  assert.equal(defaultOpponent(history([])), LUKE, 'no shared games: the first current member');
  assert.equal(defaultOpponent({ viewer: ME, members: [{ id: ME, displayName: 'Sean B' }], weeks: [] }), null);
  assert.equal(firstName('Troy Jun'), 'Troy');
  assert.equal(firstName(''), 'Member');
});

test('Everyone (D-53 "All players", kept as the last chip): you against each game’s benchmark of every scored player, you included', () => {
  const data = history([week(8, [...week8.entries, entry(LUKE, [locked(SEA.id, -4, -3, 8)])])]);
  assert.equal(chooseOpponent(data, EVERYONE), EVERYONE);
  assert.notEqual(defaultOpponent(data), EVERYONE, 'never the default');
  const out = fieldRows(data, { mode: 'guess_spread' });
  assert.deepEqual(out.map(r => [r.game.id, r.field, r.me.points, r.them.points]), [[SEA.id, 3, 10, 9], [BUF.id, 2, 9, 8.5]]);
  const h = headToHead(out);
  assert.deepEqual([h.shared, h.me.points, h.them.points, h.lead], [2, 19, 17.5, 1.5]);
  assert.equal(rowLine(out[0], 'guess_spread', 'Everyone'), 'You Broncos −3 · 3 players avg 9');
  assert.deepEqual(rowTag(out[1], 'Everyone'), { text: 'YOU +0.5', tone: 'win' });
  assert.equal(statLine(h, true), 'Avg miss 0.3–0.6 · 2 shared games');
  assert.deepEqual(fieldRows(history([week(9, week8.entries, CLOSED)])), [], 'the field obeys the same gate (comparisonRows)');
});

test('team and matchup narrow the rows and from/to choose the weeks, oldest first', () => {
  const data = history([week(9, week8.entries), week8]);
  assert.deepEqual(rows(data).map(r => r.key), ['2026:8:SEA-DEN', '2026:8:BUF-KC', '2026:9:SEA-DEN', '2026:9:BUF-KC']);
  assert.deepEqual(rows(data, { team: 'KC' }).map(r => r.key), ['2026:8:BUF-KC', '2026:9:BUF-KC']);
  assert.deepEqual(rows(data, { matchup: SEA.id, from: 9, to: 9 }).map(r => r.key), ['2026:9:SEA-DEN']);
});

test('landing tile: the latest week with a shared game, a signed lead, the view that opens it, and no gated value (spec test 12)', () => {
  const leak = week(9, [entry(ME, []), entry(TROY, [locked(SEA.id, -17.5, -16.5, 7)])], CLOSED);
  const tile = compareTile(history([leak, week8]), { season: 2026, week: 9 });
  assert.deepEqual(tile, { big: '+2', sub: 'vs Troy', tone: 'good', ariaLabel: 'Compare: Week 8 Spread, you lead Troy by 2',
    view: { period: 'week', team: '', matchup: '', item: TROY, season: 2026, week: 8, market: 'spread' } });
  assert.doesNotMatch(JSON.stringify(tile), /17\.5|16\.5/);
  const behind = compareTile(history([week(8, [entry(ME, week8.entries[1].picks), entry(TROY, week8.entries[0].picks)])]), { season: 2026, week: 8 });
  assert.deepEqual([behind.big, behind.tone, behind.ariaLabel], ['−2', 'plain', 'Compare: Week 8 Spread, Troy leads you by 2']);
  assert.deepEqual([compareTile(history([week8]), { season: 2026, week: 7 }).big, compareTile(history([week8]), { season: 2026, week: 7 }).sub], ['—', 'vs Troy'], 'a later week never shows early');
  assert.deepEqual(compareTile(null, { season: 2026, week: 8 }), { big: '—', sub: 'Head-to-head', tone: 'plain', ariaLabel: 'Compare: head-to-head with another player',
    view: { period: 'week', team: '', matchup: '' } });
});
```

- [ ] **Step 2: Run it**

Run: `node --test tests/next-compare.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `web/src/next/play/compare.js`.

- [ ] **Step 3: Write `web/src/next/play/compare.js`**

```js
// Compare (D-69 step 1, Sean's P3B): you and one other member, game by game, each scored against their own saved line.
// Pure. The comparison reply is already gated by the database (D-31: another member's guess, line and points only once
// that game and market is open to you). This is the second gate: a game the reply does not open, or marks hidden, is
// HIDDEN and its row carries no value of either player, whatever the reply holds. Totals count only games scored for both.
import { pickText, show } from '../../communityFormat.js';
import { buildComparison, comparisonRows } from '../../../../shared/score-comparison.mjs';
import { number, ownEntry, scoreRows } from './scoring.js';

export const COMPARE_STATES = Object.freeze(['hidden', 'waiting', 'noGuess', 'unscored', 'scored']);
const MODES = Object.freeze(['guess_spread', 'guess_total']);
const DASH = '—';
/** The last face chip (D-53 "All players"): you against each game's benchmark. Never the default. */
export const EVERYONE = 'everyone';

/** "Troy Jun" → "Troy": the name the head-to-head card, its rows and its tags use. */
export const firstName = name => String(name ?? '').trim().split(/\s+/)[0] || 'Member';

/** The other members in roster order, current members first, then former ones (D-23 keeps them comparable). */
export function opponents(data) {
  const others = (data?.members || []).filter(m => m.id !== data?.viewer);
  return [...others.filter(m => !m.removed), ...others.filter(m => m.removed)];
}

/** The viewer's own gate for one game and market: per game from M-01 (`week.gate`), the whole week before it. */
export function gameOpen(week, gameId, mode) {
  const market = mode === 'guess_total' ? 'total' : 'spread';
  return week?.gate ? week.gate[gameId]?.[market] === true : week?.revealed?.[mode] === true;
}

function side(row, entry) {
  if (!row?.locked || row.guess === null) return { locked: false, satOut: entry?.status === 'sat_out', points: null };
  const line = number(row.reference?.value);
  return { locked: true, satOut: false, guess: row.guess, points: row.points, reference: row.reference,
    miss: row.points === null || line === null ? null : Math.abs(row.guess - line) };
}

/**
 * One row per game of the chosen weeks, oldest first: `{ key, season, week, game, state, me, them }`. A hidden row's
 * `me` and `them` are null. `now` (ms) tells a game that has kicked off; it defaults to the reply's own `now`.
 */
export function compareRows(data, { mode = 'guess_spread', opponent = null, from = null, to = null, team = '', matchup = '', now = Date.parse(data?.now ?? '') } = {}) {
  return (data?.weeks || []).filter(w => (from === null || w.week >= from) && (to === null || w.week <= to)).sort((a, b) => a.week - b.week).flatMap(week => {
    const myEntry = ownEntry(week, data.viewer, mode), theirEntry = opponent ? ownEntry(week, opponent, mode) : null;
    const byGame = entry => new Map(scoreRows(week, entry).map(row => [row.game.id, row]));
    const mine = byGame(myEntry), theirs = byGame(theirEntry);
    return (week.games || []).filter(g => (!team || [g.awayCode, g.homeCode].includes(team)) && (!matchup || g.id === matchup)).map(game => {
      const base = { key: `${week.season}:${week.week}:${game.id}`, season: week.season, week: week.week, game };
      const t = theirs.get(game.id);
      if (!gameOpen(week, game.id, mode) || t?.hidden || theirEntry?.hiddenGames?.includes(game.id)) return { ...base, state: 'hidden', me: null, them: null };
      const me = side(mine.get(game.id), myEntry), them = side(t, theirEntry);
      const started = Date.parse(game.kickoff) <= now;
      const state = !them.locked ? (started || them.satOut ? 'noGuess' : 'waiting') : !me.locked ? 'noGuess'
        : me.miss === null || them.miss === null ? 'unscored' : 'scored';
      return { ...base, state, me, them };
    });
  });
}

/** Only rows scored for both count: each side's points, Bullseyes and average miss, the shared count and your lead. */
export function headToHead(rows) {
  const shared = rows.filter(row => row.state === 'scored');
  const of = key => shared.length ? { points: shared.reduce((sum, row) => sum + row[key].points, 0),
    bullseyes: shared.filter(row => row[key].miss === 0).length, avgMiss: shared.reduce((sum, row) => sum + row[key].miss, 0) / shared.length } : null;
  const me = of('me'), them = of('them');
  return { shared: shared.length, me, them, lead: me && them ? me.points - them.points : null };
}

/** The member Compare opens on: the most shared games this season over both markets; ties keep roster order. */
export function defaultOpponent(data) {
  let best = null, most = -1;
  for (const member of opponents(data)) {
    const shared = MODES.reduce((sum, mode) => sum + headToHead(compareRows(data, { mode, opponent: member.id })).shared, 0);
    if (shared > most) { best = member.id; most = shared; }
  }
  return best;
}
/** The address's `item` when it names another member of this roster, otherwise the default (a stale or foreign item). */
export const chooseOpponent = (data, item) => item === EVERYONE && opponents(data).length ? EVERYONE
  : opponents(data).some(member => member.id === item) ? item : defaultOpponent(data);

/**
 * Everyone (D-53 "All players", kept as the last chip): each game scored and revealed for you and at least one other
 * member, against its benchmark, the average of every scored player there, you included (shared/score-comparison.mjs,
 * the existing tested reader and its gate). Rows have the head-to-head shape; `field` is the game's player count.
 */
export function fieldRows(data, { mode = 'guess_spread', from = null, to = null, team = '', matchup = '' } = {}) {
  const { games } = buildComparison({ rows: comparisonRows(data, mode), selection: { viewer: data.viewer, kind: 'all' }, filters: { season: data.season, from, to, team, matchup } });
  const miss = p => Math.abs(p.guess - p.reference.value);
  return [...games].sort((a, b) => a.week - b.week).map(g => ({ key: g.key, season: g.season, week: g.week, game: g.game, state: 'scored', field: g.contributors,
    me: { locked: true, satOut: false, guess: g.mine.guess, points: g.mine.points, reference: g.mine.reference, miss: miss(g.mine) },
    them: { locked: true, satOut: false, guess: null, points: g.benchmark, reference: null, miss: g.players.reduce((sum, p) => sum + miss(p), 0) / g.players.length } }));
}

export function leadLine(h, name) {
  if (!h.shared) return 'No shared games yet';
  return h.lead > 0 ? `You lead by ${show(h.lead)}` : h.lead < 0 ? `${name} leads by ${show(-h.lead)}` : 'All square';
}
export const statLine = (h, everyone = false) => `${everyone ? '' : `Bullseyes ${h.me.bullseyes}–${h.them.bullseyes} · `}Avg miss ${show(h.me.avgMiss)}–${show(h.them.avgMiss)} · ${h.shared} shared ${h.shared === 1 ? 'game' : 'games'}`;

/** The row's tag: always words (never color alone). A game you lost is quiet (neutral), never a loss color. */
export function rowTag(row, name) {
  if (row.state === 'hidden') return { text: 'HIDDEN', tone: 'neutral' };
  if (row.state === 'waiting') return { text: 'WAITING', tone: 'data' };
  if (row.state === 'noGuess') return { text: 'NO GUESS', tone: 'neutral' };
  if (row.state === 'unscored') return { text: 'NOT SCORED', tone: 'pending' };
  const diff = row.me.points - row.them.points;
  return diff > 0 ? { text: `YOU +${show(diff)}`, tone: 'win' } : diff < 0 ? { text: `${name.toUpperCase()} +${show(-diff)}`, tone: 'neutral' } : { text: 'EVEN', tone: 'neutral' };
}

/** The row's one line: both guesses, or why one is missing. A hidden row says only how to open it. */
export function rowLine(row, mode, name) {
  if (row.state === 'hidden') return `Lock yours to see ${name}’s guess`;
  const text = value => pickText(mode, row.game.awayCode, row.game.homeCode, value);
  if (row.field) return `You ${text(row.me.guess)} · ${row.field} players avg ${show(row.them.points)}`;
  const mine = row.me.locked ? `You ${text(row.me.guess)}` : row.me.satOut ? 'You sat out' : 'You didn’t lock in';
  const theirs = row.them.locked ? `${name} ${text(row.them.guess)}` : row.them.satOut ? `${name} sat out`
    : row.state === 'waiting' ? `${name} hasn’t locked in` : `${name} didn’t lock in`;
  return `${mine} · ${theirs}`;
}

/**
 * The Play landing tile (P1B): your lead over the member Compare opens on, in the latest week up to `current.week`
 * with a game scored for both (Spread before Total), and the view `openPlay(shell, 'compare', view)` opens it with.
 */
export function compareTile(data, current) {
  const view = { period: 'week', team: '', matchup: '' };
  const plain = { big: DASH, sub: 'Head-to-head', tone: 'plain', ariaLabel: 'Compare: head-to-head with another player', view };
  const opponent = data ? defaultOpponent(data) : null;
  if (!opponent) return plain;
  const name = firstName((data.members || []).find(member => member.id === opponent)?.displayName);
  const weeks = [...new Set((data.weeks || []).map(w => w.week))].filter(w => !Number.isInteger(current?.week) || w <= current.week).sort((a, b) => b - a);
  for (const week of weeks) for (const mode of MODES) {
    const { shared, lead } = headToHead(compareRows(data, { mode, opponent, from: week, to: week }));
    if (!shared) continue;
    const words = lead > 0 ? `you lead ${name} by ${show(lead)}` : lead < 0 ? `${name} leads you by ${show(-lead)}` : `you and ${name} are even`;
    return { big: lead > 0 ? `+${show(lead)}` : lead < 0 ? `−${show(-lead)}` : '0', sub: `vs ${name}`, tone: lead > 0 ? 'good' : 'plain',
      ariaLabel: `Compare: Week ${week} ${mode === 'guess_total' ? 'Total' : 'Spread'}, ${words}`,
      view: { ...view, item: opponent, season: data.season, week, market: mode === 'guess_total' ? 'total' : 'spread' } };
  }
  return { ...plain, sub: `vs ${name}`, ariaLabel: `Compare: no shared games with ${name} yet`, view: { ...view, item: opponent, season: data.season } };
}
```

- [ ] **Step 4: Run it again, with the D-53 tests it builds on**

Run: `node --test tests/next-compare.test.mjs tests/comparison-preferences.test.mjs`
Expected: PASS, `# skipped 0` (D-53's PGlite tests need `.local/sql-check`). [executed] All 8 new tests pass at `5e89a2b2`.

- [ ] **Step 5: Commit**

```bash
git add web/src/next/play/compare.js tests/next-compare.test.mjs
git commit -m "Compare rules: per-game D-31 gate, head-to-head totals, default opponent and the landing tile number

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3b: The Compare layer

**Files:**
- Modify (whole file): `web/src/next/play/ScoreComparison.jsx`, `web/src/next/play/comparison.css`
- Modify: `web/src/next/play/Play.jsx` (the `compare` line in `PlayDetail` only)
- Test: `tests/next-compare-ui.test.jsx` (new), `tests/next-router.test.mjs` (one test), `tests/next-scoring-ui.test.jsx`
  (one test updated), `tests/cloud-browser/comparisons-home.spec.js` (the Compare part rewritten)

**Interfaces:**
- Consumes: Task 1 `PlayLayer`, `WeekChips`, `FilterToggle`; Task 3a; ui kit `Avatar` (`anyone` for Everyone), `Chip`,
  `ChipRail`, `InfoButton`, `Matchup`, `Pill`, `Segmented`.
- Produces: `ScoreComparison()` (same export; now a `PlayLayer` with `layer="compare"`), `ComparisonContent({ data,
  currentWeek, scopeName, view, onChange })` (`onRefresh` is gone; its only other user is the test updated in Step 7).
  CSS `gx-cmp-*`; `gx-compare-members` stays for `me/AccountPreferences.jsx`, which imports this stylesheet.
- Motion: the head-to-head bars grow (`transform: scaleX`, base 240 ms, enter easing) only when you change the player,
  market or weeks, never on the first paint; the layer's entrance is Nest's. No moments, no loops.

- [ ] **Step 1: Write the failing markup test**

```jsx
// tests/next-compare-ui.test.jsx
// D-69 step 1 Compare (Sean's P3B) markup. Contracts: no hidden guess, line or points of another player renders before
// its gate (D-31, spec test 12); the head-to-head card shows two faces, who leads, paired bars (You over them) and one
// stats line; the face chips are one pressed choice with Everyone last; nothing moves on the first paint.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ leagueApi: vi.fn(), communityApi: vi.fn(), cloudApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
import { ComparisonContent } from '../web/src/next/play/ScoreComparison.jsx';
import { markupProblems, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const SEA = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const BUF = { id: 'BUF-KC', awayCode: 'BUF', homeCode: 'KC', kickoff: '2026-10-26T00:20:00Z' };
const ref = value => ({ value, source: 'Fixture median', observedAt: '2026-10-20T17:00:00Z' });
const locked = (gameId, guess, line, points) => ({ gameId, guess, points, reference: ref(line), lockedIn: true, lockedAt: '2026-10-20T18:00:00Z', hidden: false });
const entry = (userId, picks) => ({ userId, mode: 'guess_spread', status: 'draft', eligible: true, picks, hiddenGames: [] });
const gate = (sea, buf) => ({ [SEA.id]: { spread: sea, total: false }, [BUF.id]: { spread: buf, total: false } });
const week = (n, entries, g = gate(true, true)) => ({ season: 2026, week: n, games: [SEA, BUF], gate: g, revealed: { guess_spread: false, guess_total: false }, entries });
const members = [{ id: 'luke', displayName: 'Luke Jun' }, { id: 'me', displayName: 'Sean B' }, { id: 'troy', displayName: 'Troy Jun' }];
const week8 = week(8, [entry('me', [locked(SEA.id, -3, -3, 10), locked(BUF.id, 2, 2.5, 9)]), entry('troy', [locked(SEA.id, -2.5, -3, 9), locked(BUF.id, 3.5, 2.5, 8)])]);
// Week 9: you have not locked SEA, yet a faulty reply still carries Troy's SEA values; Troy has not locked BUF.
const week9 = week(9, [entry('me', [locked(BUF.id, 2, 2.5, 9)]), entry('troy', [locked(SEA.id, -17.5, -16.5, 7), { gameId: BUF.id, guess: null, reference: null, points: null, hidden: false }])], gate(false, true));
const data = { viewer: 'me', season: 2026, seasons: [2026, 2025], now: '2026-10-24T12:00:00Z', members, weeks: [week9, week8] };
const render = (view, patch = {}) => renderToStaticMarkup(<div className="gx"><ComparisonContent data={{ ...data, ...patch }} currentWeek={9} scopeName="Community" view={view} onChange={() => {}}/></div>);

describe('Compare', () => {
  it('D-31: a game you have not locked renders HIDDEN with no guess, line or points of the other player, even when the reply carries them', () => {
    const html = render({});
    expect(markupProblems(html)).toEqual([]);
    expect(html).not.toMatch(/17\.5|16\.5/);
    const text = readText(html);
    expect(text).toContain('HIDDEN');
    expect(text).toContain('Lock yours to see Troy’s guess');
    expect(text).toContain('You Bills −2 · Troy hasn’t locked in');
    expect(text).toContain('No shared games yet');
  });
  it('the head-to-head card: two faces, who leads, paired bars You over them and one stats line; one face chip is pressed, Everyone last', () => {
    const html = render({ week: 8 });
    expect(markupProblems(html)).toEqual([]);
    const text = readText(html);
    expect(text).toContain('You lead by 2');
    expect(text).toContain('Bullseyes 1–0 · Avg miss 0.3–0.8 · 2 shared games');
    expect(text).toMatch(/You\s*19\s*Troy\s*17/);
    expect(html).toContain('aria-label="You 19, Troy 17 points on 2 shared games"');
    expect(text).toContain('YOU +1');
    const chips = [...walk(parseMarkup(html))].filter(n => n.tag === 'button' && (n.attrs.class ?? '').split(/\s+/).includes('gx-cmp-face'));
    expect(chips.map(n => [nameFrom(n).trim(), n.attrs['aria-pressed']])).toEqual([['Luke Jun', 'false'], ['Troy Jun', 'true'], ['Everyone', 'false']]);
  });
  it('a member who has not locked reads WAITING; Everyone keeps the D-53 benchmark with each game’s player count', () => {
    const luke = readText(render({ item: 'luke', week: 8 }));
    expect(luke).toContain('WAITING');
    expect(luke).toContain('You Broncos −3 · Luke hasn’t locked in');
    const everyone = readText(render({ item: 'everyone', week: 8 }));
    expect(everyone).toContain('You lead by 1');
    expect(everyone).toContain('Avg miss 0.3–0.5 · 2 shared games');
    expect(everyone).toContain('You Broncos −3 · 2 players avg 9.5');
  });
  it('nothing moves on the first paint: no bar carries the grow attribute', () => {
    expect(render({ week: 8 })).not.toContain('data-grow');
  });
  it('empty states are one sentence and at most one action', () => {
    expect(readText(render({}, { members: [members[1]] }))).toBe('No one else to compare with yet.');
    expect(readText(render({ week: 8, team: 'NYJ' }))).toContain('No games match these filters.');
  });
});
```

- [ ] **Step 2: Add the address test** at the end of `tests/next-router.test.mjs` (it pins the router contract the
  page relies on; it passes on today's router, which already has `item`)

```js
test('D-69 Compare: the opponent is the item on section compare; a face is not a step, a reload reopens it, Back leaves', async () => {
  const troy = '00000000-0000-4000-8000-000000000002', sean = '00000000-0000-4000-8000-000000000003';
  assert.deepEqual(placeFromFragment(`#play/compare?market=total&season=2026&week=8&item=${troy}`).view, { section: 'compare', market: 'total', season: 2026, week: 8, item: troy });
  const win = fakeWindow('https://gtl.test/#home');
  let shell = app(win);
  shell.dispatch({ type: 'go', tab: 'play', view: { section: 'compare', item: troy, week: 8 } });
  shell.dispatch({ type: 'view', tab: 'play', patch: { item: sean } });
  assert.match(win.location.hash, new RegExp(`^#play/compare\\?.*item=${sean}$`));
  assert.equal(win.history.length, 2, 'choosing a face rewrites the entry; it adds no Back step');
  shell.connection.disconnect();
  shell = app(win);
  assert.equal(shell.state.views.play.item, sean, 'a reload reopens the same head-to-head');
  win.history.back(); await settle();
  assert.equal(shell.state.tab, 'home', 'Back closes Compare');
});
```

- [ ] **Step 3: Run both**

Run: `npx vitest run tests/next-compare-ui.test.jsx` — Expected: FAIL (today's `ComparisonContent` has no "Lock yours
to see Troy’s guess" and shows the benchmark table).
Run: `node --test tests/next-router.test.mjs` — Expected: PASS [executed on a copy at `5e89a2b2`].

- [ ] **Step 4: Rewrite `web/src/next/play/ScoreComparison.jsx`**

```jsx
// Compare (D-69 step 1, Sean's P3B): you and one other member at a time. Face chips set the address key `item` (the last,
// Everyone, keeps D-53's benchmark); week chips choose the week; filters sit behind the filter button. compare.js gates
// each game a second time (D-31). No moments (the catalog has none); the one motion is the head-to-head bars growing
// when you change what is compared.
import { useMemo, useRef } from 'react';
import { leagueApi } from '../../api.js';
import { pickText, show } from '../../communityFormat.js';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { Avatar, Button, Chip, ChipRail, InfoButton, Matchup, Pill, Segmented, cx } from '../ui/index.js';
import { fmtFull } from '../format.js';
import { PlayLayer } from './PlayLayer.jsx';
import { WeekChips } from './WeekChips.jsx';
import { FilterToggle } from './FilterToggle.jsx';
import { PlayEmpty, PlayFailure, PlayLoading } from './PlayStates.jsx';
import { modeOf, SCORE_MARKETS } from './scoring.js';
import { EVERYONE, chooseOpponent, compareRows, fieldRows, firstName, headToHead, leadLine, opponents, rowLine, rowTag, statLine } from './compare.js';
import './comparison.css';

const ABOUT = [
  'You and one other player, game by game. Each guess is scored against its own saved line.',
  'You see another player’s guess once you lock yours in, or from kickoff.',
  'Only games scored for both of you count. Hidden, waiting, missed and unscored games never count as zero.',
  'Everyone compares you with each game’s average of every scored player, you included, each game weighted equally.',
  'Spread and Total stay separate. Games keep their original week, Monday games included. Compare never changes the standings.',
];
const CLEAR = { period: 'week', team: '', matchup: '' };

export function ScoreComparison() {
  const app = useAppData(), shell = useShell(), view = shell.state.views.play;
  const season = Number.isInteger(view.season) ? view.season : app.community.data?.week?.season;
  const leagueId = app.league?.community === false ? app.league.id : null;
  const key = `${app.accountId}:comparison:${leagueId ?? 'community'}:${season ?? 'latest'}`;
  const read = useLeagueRead(key, signal => leagueApi('comparison', { ...(season ? { season } : {}), ...(leagueId ? { leagueId } : {}) }, signal), error => { if (error.status === 401) app.requestSignIn(); });
  const current = app.community.data?.week;
  return <PlayLayer label="Compare" layer="compare" title="Compare" info={<InfoButton title="About Compare" body={ABOUT}/>}>
    {read.loading ? <PlayLoading>Loading comparisons…</PlayLoading>
      : read.error ? <PlayFailure what="Comparisons" error={read.error} onRetry={read.retry}/>
      : <ComparisonContent key={key} data={read.data} currentWeek={read.data.season === current?.season ? current.week : null}
        scopeName={app.league?.name || 'Community'} view={view} onChange={patch => shell.setView('play', patch)}/>}
  </PlayLayer>;
}

function Bar({ who, points, max, me = false, grow = false }) {
  const width = `${Math.round(Math.max(0, Math.min(1, points / max)) * 1000) / 10}%`;
  return <span className="gx-cmp-bar"><span className="gx-t-meta">{who}</span>
    <span className="gx-cmp-track"><span className={cx('gx-cmp-fill', me && 'gx-cmp-fill--me')} data-grow={grow ? '' : undefined} style={{ width }}></span></span>
    <span className="gx-n-s gx-cmp-num">{show(points)}</span></span>;
}

function CompareRow({ row, mode, name, multi }) {
  const tag = rowTag(row, name), game = row.game, text = value => pickText(mode, game.awayCode, game.homeCode, value);
  const sides = row.state === 'hidden' ? [] : [['You', row.me, true], [name, row.them, false]];
  const scored = sides.filter(([, side]) => side.points !== null), lines = sides.filter(([, side]) => side.locked && side.reference);
  return <li className="gx-cmp-row">
    <div className="gx-cmp-row-top"><Matchup away={game.awayCode} home={game.homeCode}/>
      <span className="gx-cmp-row-end"><Pill tone={tag.tone}>{tag.text}</Pill>
        {lines.length ? <InfoButton title={`Saved lines, Week ${row.week} ${game.awayCode} at ${game.homeCode}`}
          body={lines.map(([who, side]) => `${who} · line ${text(side.reference.value)} · ${side.reference.source || 'Source unavailable'} · ${fmtFull(side.reference.observedAt)}`)}/> : null}</span></div>
    <p className="gx-t-meta gx-c-2">{multi ? `Week ${row.week} · ` : ''}{rowLine(row, mode, name)}</p>
    {scored.length ? <div className="gx-cmp-bars" role="img" aria-label={scored.map(([who, side]) => `${who} ${show(side.points)} points`).join(', ')}>
      {scored.map(([who, side, me]) => <Bar key={me ? 'me' : 'them'} who={who} points={side.points} max={10} me={me}/>)}</div> : null}
  </li>;
}

export function ComparisonContent({ data, currentWeek, scopeName, view, onChange }) {
  const mode = modeOf(view.market), others = opponents(data);
  const opponent = useMemo(() => chooseOpponent(data, view.item), [data, view.item]), everyone = opponent === EVERYONE;
  const weeks = [...new Set((data.weeks || []).map(w => w.week))].sort((a, b) => a - b);
  const period = ['range', 'season'].includes(view.period) ? view.period : 'week';
  const week = weeks.includes(view.week) ? view.week : weeks.includes(currentWeek) ? currentWeek : weeks.at(-1) ?? null;
  const from = period === 'season' ? null : period === 'range' ? (weeks.includes(view.from) ? view.from : weeks[0] ?? null) : week;
  const to = period === 'season' ? null : period === 'range' ? (weeks.includes(view.to) ? view.to : weeks.at(-1) ?? null) : week;
  const team = view.team || '', matchup = view.matchup || '', filtered = period !== 'week' || !!team || !!matchup;
  const rows = useMemo(() => !opponent ? [] : (opponent === EVERYONE ? fieldRows : compareRows)(data, { mode, opponent, from, to, team, matchup }),
    [data, mode, opponent, from, to, team, matchup]);
  // The bars grow when you change what is compared, never on the first paint (D-69: nothing moves on a page load).
  const selection = [opponent, mode, from, to, team, matchup].join(':'), first = useRef(selection), grow = first.current !== selection;
  if (!others.length) return <PlayEmpty>No one else to compare with yet.</PlayEmpty>;
  if (!weeks.length) return <PlayEmpty>No weeks to compare yet.</PlayEmpty>;
  const h = headToHead(rows), member = id => (data.members || []).find(m => m.id === id);
  const name = everyone ? 'Everyone' : member(opponent)?.displayName || 'Member', short = everyone ? 'Everyone' : firstName(name);
  const teams = [...new Set((data.weeks || []).flatMap(w => (w.games || []).flatMap(g => [g.awayCode, g.homeCode])))].sort();
  const games = [...new Map((data.weeks || []).filter(w => from === null || (w.week >= from && w.week <= to)).flatMap(w => w.games || []).map(g => [g.id, g])).values()];
  const when = period === 'season' ? `${data.season} season` : period === 'range' ? `Weeks ${from}–${to}` : `Week ${week}`;
  const weekOptions = weeks.map(w => <option key={w} value={w}>Week {w}</option>);
  const pick = id => () => { if (id !== opponent) onChange({ item: id }); };
  return <div className="gx-vstack gx-gap-12">
    <p className="gx-t-meta gx-c-2">{scopeName} · {when} · {mode === 'guess_total' ? 'Total' : 'Spread'}</p>
    <ChipRail label="Compare with">
      {others.map(m => <Chip key={m.id} text selected={m.id === opponent} className="gx-cmp-face" onClick={pick(m.id)}><Avatar id={m.id} name={m.displayName} size={32}/>{m.removed ? `${m.displayName} · former` : m.displayName}</Chip>)}
      <Chip text selected={everyone} className="gx-cmp-face" onClick={pick(EVERYONE)}><Avatar anyone size={32}/>Everyone</Chip>
    </ChipRail>
    <Segmented label="Compare market" options={SCORE_MARKETS} value={mode} onChange={value => onChange({ market: value === 'guess_total' ? 'total' : 'spread' })}/>
    <WeekChips label="Week" weeks={weeks} week={period === 'week' ? week : null} onWeek={value => onChange({ week: value, period: 'week' })}
      seasons={data.seasons || []} season={data.season} onSeason={year => onChange({ season: year, week: null, period: 'week', matchup: '' })}/>
    <FilterToggle label="Filter games" active={filtered}>
      <div className="gx-cmp-filters gx-vstack gx-gap-12">
        <label className="gx-t-body">Period<select className="gx-input" value={period} onChange={e => onChange({ period: e.target.value })}><option value="week">Single week</option><option value="range">Week range</option><option value="season">Full season</option></select></label>
        {period === 'range' && <><label className="gx-t-body">From week<select className="gx-input" value={from ?? ''} onChange={e => onChange({ from: Number(e.target.value) })}>{weekOptions}</select></label>
          <label className="gx-t-body">Through week<select className="gx-input" value={to ?? ''} onChange={e => onChange({ to: Number(e.target.value) })}>{weekOptions}</select></label></>}
        <label className="gx-t-body">Team<select className="gx-input" value={team} onChange={e => onChange({ team: e.target.value })}><option value="">All teams</option>{team && !teams.includes(team) && <option value={team}>{team}</option>}{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
        <label className="gx-t-body">Matchup<select className="gx-input" value={matchup} onChange={e => onChange({ matchup: e.target.value })}><option value="">All matchups</option>{games.map(g => <option key={g.id} value={g.id}>{g.awayCode} at {g.homeCode}</option>)}</select></label>
        <Button disabled={!filtered} onClick={() => onChange(CLEAR)}>Clear filters</Button>
      </div>
    </FilterToggle>
    <section className="gx-cmp-h2h" aria-label="Head to head">
      <div className="gx-cmp-vs">
        <span className="gx-cmp-who"><Avatar id={data.viewer} name={member(data.viewer)?.displayName || 'You'} size={40} you/><span className="gx-t-strong">You</span></span>
        <span className="gx-t-meta gx-c-2" aria-hidden="true">VS</span>
        <span className="gx-cmp-who"><span className="gx-t-strong">{name}</span>{everyone ? <Avatar anyone size={40}/> : <Avatar id={opponent} name={name} size={40}/>}</span>
      </div>
      <p className="gx-t-strong" aria-live="polite">{leadLine(h, short)}</p>
      {h.shared ? <>
        <div key={selection} className="gx-cmp-bars" role="img" aria-label={`You ${show(h.me.points)}, ${short} ${show(h.them.points)} points on ${h.shared} shared ${h.shared === 1 ? 'game' : 'games'}`}>
          <Bar who="You" points={h.me.points} max={h.shared * 10} me grow={grow}/><Bar who={short} points={h.them.points} max={h.shared * 10} grow={grow}/>
        </div>
        <p className="gx-t-meta gx-c-2">{statLine(h, everyone)}</p>
      </> : null}
    </section>
    {from !== null && to !== null && from > to ? <p className="gx-t-body" role="alert">Choose a through week at or after the from week.</p>
      : !rows.length ? <PlayEmpty action={filtered ? 'Clear filters' : undefined} onAction={() => onChange(CLEAR)}>{filtered ? 'No games match these filters.' : everyone ? 'No shared scored games yet.' : 'No games in this week.'}</PlayEmpty>
      : <ul className="gx-cmp-rows" aria-label="Games">{rows.map(row => <CompareRow key={row.key} row={row} mode={mode} name={short} multi={period !== 'week'}/>)}</ul>}
  </div>;
}
```

- [ ] **Step 5: Rewrite `web/src/next/play/comparison.css`**

```css
/* Compare (D-69 step 1, Sean's P3B), and the account settings checkbox groups (me/AccountPreferences.jsx) that share this file. */
.gx .gx-compare-members { border: 1px solid var(--gx-border-strong); padding: var(--gx-space-3); border-radius: var(--gx-radius-sm); }
.gx .gx-compare-members :where(label) { display: flex; align-items: center; gap: var(--gx-space-3); min-height: 44px; }
.gx .gx-compare-members :where(input) { width: 24px; height: 24px; accent-color: var(--gx-accent-ink); }
.gx .gx-cmp-face { border-radius: var(--gx-radius-pill); padding-inline: var(--gx-space-1) var(--gx-space-4); }
.gx .gx-cmp-h2h { display: flex; flex-direction: column; gap: var(--gx-space-3); padding: var(--gx-space-3) var(--gx-space-4); border-radius: var(--gx-radius-md); background: var(--gx-surface-3); }
.gx .gx-cmp-vs, .gx .gx-cmp-who { display: flex; align-items: center; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-cmp-vs { justify-content: space-between; }
.gx .gx-cmp-who > span { min-width: 0; overflow-wrap: anywhere; }
.gx .gx-cmp-bars { display: flex; flex-direction: column; gap: var(--gx-space-2); }
.gx .gx-cmp-bar { display: grid; grid-template-columns: 56px minmax(0, 1fr) 40px; align-items: center; gap: var(--gx-space-2); }
.gx .gx-cmp-bar > :first-child { min-width: 0; overflow-wrap: anywhere; }
.gx .gx-cmp-track { display: block; height: 10px; overflow: hidden; border-radius: var(--gx-radius-pill); background: var(--gx-surface-1); }
.gx .gx-cmp-row .gx-cmp-track { height: 6px; }
.gx .gx-cmp-fill { display: block; height: 100%; border-radius: var(--gx-radius-pill); background: var(--gx-text-2); transform-origin: left center; }
.gx .gx-cmp-fill--me { background: var(--gx-accent-ink); }
.gx .gx-cmp-num { text-align: right; }
.gx .gx-cmp-rows { display: flex; flex-direction: column; gap: var(--gx-space-2); margin: 0; padding: 0; list-style: none; }
.gx .gx-cmp-row { display: flex; flex-direction: column; gap: var(--gx-space-2); min-width: 0; padding: var(--gx-space-3); border-radius: var(--gx-radius-md); background: var(--gx-surface-3); }
.gx .gx-cmp-row-top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-cmp-row-end { display: flex; align-items: center; gap: var(--gx-space-1); margin-inline-start: auto; min-width: 0; }
.gx .gx-cmp-row .gx-pill { max-width: 100%; height: auto; min-height: 24px; white-space: normal; overflow-wrap: anywhere; }
.gx .gx-cmp-filters :where(label) { display: flex; flex-direction: column; gap: var(--gx-space-1); }
@media (prefers-reduced-motion: no-preference) {
  /* D-69 4.3: the head-to-head bars grow (scaleX) when you choose another player, market or week; never on a page load. */
  .gx .gx-cmp-fill[data-grow] { animation: gx-cmp-grow var(--gx-dur-base) var(--gx-ease-enter) both; }
}
@keyframes gx-cmp-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@media (forced-colors: active) {
  .gx .gx-cmp-track { border: 1px solid CanvasText; }
  .gx .gx-cmp-fill { background: CanvasText; }
}
```

- [ ] **Step 6: The `compare` line in `PlayDetail`** (`web/src/next/play/Play.jsx`, line 113). Old:

```jsx
  if (shell.state.views.play.section === 'compare') return <div className="gx-screen gx-vstack gx-gap-16"><h1 className="gx-t-title">Compare players</h1><Button variant="ghost" onClick={() => shell.setView('play', { section: 'score' })}>Your weekly score</Button><ScoreComparison/></div>;
```

New (the layer draws its own heading and Play lip):

```jsx
  if (shell.state.views.play.section === 'compare') return <ScoreComparison/>;
```

- [ ] **Step 7: Update the D-62 comparison test** in `tests/next-scoring-ui.test.jsx`. Replace the first line of the
  `it` that starts `it('each comparison card’s heading is the week and the matchup as 32px marks'` with
  `it('each comparison row leads with its matchup as marks, away first', () => {`, keep its `pick`, `other` and
  `history` lines, and replace its last six lines (from `const html = renderToStaticMarkup(` to `expect(html).toContain('gx-mu--32');`) with:

```jsx
    const html = renderToStaticMarkup(<div className="gx"><ComparisonContent data={history} currentWeek={6} scopeName="Community" view={{}} onChange={() => {}}/></div>);
    expect(markupProblems(html)).toEqual([]);
    const row = [...walk(parseMarkup(html))].find(n => n.tag === 'li' && (n.attrs.class ?? '').split(/\s+/).includes('gx-cmp-row'));
    expect(matchups(row)).toEqual([SEA_DEN]);
```

  The contract (D-62: matchups as marks, away first) is unchanged; the row replaces the old h2 card heading.

- [ ] **Step 8: Run the unit tests**

Run: `npx vitest run tests/next-compare-ui.test.jsx tests/next-scoring-ui.test.jsx tests/four-tab-landings.test.jsx tests/next-points-ui.test.jsx`
Run: `node --test tests/next-compare.test.mjs tests/next-router.test.mjs tests/next-tokens.test.mjs tests/next-app-view.test.mjs`
Expected: PASS. [executed] With task-1.md's `WeekChips` and `FilterToggle` the markup gives every string Step 1 checks, and the
stylesheet passes `tests/next-tokens.test.mjs` on a copy of the tree.

- [ ] **Step 9: Rewrite the Compare part of `tests/cloud-browser/comparisons-home.spec.js`.** Rename the first test to
  `'Home guide and account settings persist; Compare is one head-to-head at a time, gated per game, on accessible phone layouts'`.
  Replace lines 40–56 (from `await page.getByRole('button',{ name: 'Your results',exact: true }).click();` through
  `await page.getByRole('button',{ name: 'Spread',exact: true }).click();`) with the block below; the theme, 320 px and
  axe loop after it stays. The address opens Compare until Task 7's tile exists (Task 7 swaps in a tile click).

```js
    // D-69 step 1 Compare (P3B). Troy also sends a Total ballot Luke has not matched: it must stay hidden (D-31).
    await sendBallot(world,'troy','guess_total',Object.fromEntries(world.state.games.map((g,i) => [g.id,[41.5,52.5][i]])));
    await page.evaluate(() => { location.hash = '#play/compare'; });
    const layer = page.getByRole('region',{ name: 'Compare',exact: true });
    await expect(layer.getByRole('heading',{ name: 'Compare',exact: true })).toBeVisible();
    const faces = layer.getByRole('group',{ name: 'Compare with' });
    await expect(faces.getByRole('button',{ name: ACCOUNTS.troy.name })).toHaveAttribute('aria-pressed','true');
    await expect(layer.getByText('Troy leads by 1',{ exact: true })).toBeVisible();
    await expect(layer.getByText('Bullseyes 0–1 · Avg miss 0.5–0.3 · 2 shared games',{ exact: true })).toBeVisible();
    await expect(layer.getByText('EVEN',{ exact: true })).toBeVisible();
    await expect(layer.getByText('TROY +1',{ exact: true })).toBeVisible();
    await layer.getByRole('button',{ name: 'Total',exact: true }).click();
    await expect(layer.getByText('HIDDEN',{ exact: true })).toHaveCount(2);
    await expect(layer.getByText('Lock yours to see Troy’s guess',{ exact: true })).toHaveCount(2);
    for (const value of ['41.5','52.5']) await expect(layer).not.toContainText(value);
    await layer.getByRole('button',{ name: 'Spread',exact: true }).click();
    await faces.getByRole('button',{ name: 'Everyone',exact: true }).click();
    await expect(layer.getByText('Everyone leads by 0.5',{ exact: true })).toBeVisible();
    await faces.getByRole('button',{ name: ACCOUNTS.sean.name }).click();
    await expect(page).toHaveURL(new RegExp(`#play/compare\\?.*item=${ACCOUNTS.sean.id}`));
    await expect(layer.getByText('No shared games yet',{ exact: true })).toBeVisible();
    await expect(layer.getByText('Sean hasn’t locked in',{ exact: false }).first()).toBeVisible();
```

Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/comparisons-home.spec.js tests/cloud-browser/next-phone-layout.spec.js`
Expected: PASS, `skipped 0` (`next-phone-layout.spec.js` already visits `#play/compare` at 320 and 390 px, both themes).
[executed] Every number and line above is this module's output on that fixture's real SQL reply.

- [ ] **Step 10: Commit**

```bash
git add web/src/next/play/ScoreComparison.jsx web/src/next/play/comparison.css web/src/next/play/Play.jsx tests/next-compare-ui.test.jsx tests/next-router.test.mjs tests/next-scoring-ui.test.jsx tests/cloud-browser/comparisons-home.spec.js
git commit -m "Compare (P3B): one face at a time, head-to-head card, per-game D-31 rows, filters behind the filter button

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3c: The Compare landing tile

**Files:**
- Create: `web/src/next/play/CompareTile.jsx`
- Test: `tests/next-compare-tile.test.jsx` (new), `tests/next-compare.test.mjs` (one test added)

**Interfaces:**
- Consumes: Task 1 `PlayTile`; Task 3a `compareTile`; Home's history read as `home/HomeSummaries.jsx` makes it (same
  key, `communityApi('history', { season })`, `{ shared: true }`): one shared request, no new read on the landing.
- Produces: `CompareTile({ onOpen })`, calling `onOpen(view)` with the Compare keys of the head-to-head it shows
  (`item`, `season`, `week`, `market`, plus `period: 'week'` and cleared `team`/`matchup`); Task 7 passes
  `onOpen={view => openPlay(shell, 'compare', view)}` (Task 1's opener; a caller that ignores `view` lands on the default).
- Moments: none in the catalog for Compare, so `isNew` stays false and nothing reports.

- [ ] **Step 1: Write the failing tests.** The tile test:

```jsx
// tests/next-compare-tile.test.jsx
// D-69 step 1: the Play landing's Compare tile (P1B). Contracts: it reuses Home's history read (the same key and
// options, so no new read on the landing); it shows your lead over the player Compare opens on; it never shows NEW
// (Compare has no moments); a private league, whose roster the landing never reads, shows the plain label.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('../web/src/api.js', () => ({ communityApi: vi.fn(), leagueApi: vi.fn(), cloudApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: vi.fn() }));
import { useAppData } from '../web/src/next/data/AppData.jsx';
import { useLeagueRead } from '../web/src/next/league/useLeagueRead.jsx';
import { CompareTile } from '../web/src/next/play/CompareTile.jsx';
import { markupProblems } from './helpers/ui-markup.mjs';

const SEA = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-25T20:05:00Z' };
const BUF = { id: 'BUF-KC', awayCode: 'BUF', homeCode: 'KC', kickoff: '2026-10-26T00:20:00Z' };
const locked = (gameId, guess, line, points) => ({ gameId, guess, points, reference: { value: line, source: 'Fixture' }, lockedIn: true, hidden: false });
const entry = (userId, picks) => ({ userId, mode: 'guess_spread', status: 'draft', eligible: true, picks, hiddenGames: [] });
const history = { viewer: 'me', season: 2026, seasons: [2026], now: '2026-10-24T12:00:00Z',
  members: [{ id: 'me', displayName: 'Sean B' }, { id: 'troy', displayName: 'Troy Jun' }],
  weeks: [{ season: 2026, week: 8, games: [SEA, BUF], gate: { [SEA.id]: { spread: true, total: false }, [BUF.id]: { spread: true, total: false } }, revealed: {},
    entries: [entry('me', [locked(SEA.id, -3, -3, 10), locked(BUF.id, 2, 2.5, 9)]), entry('troy', [locked(SEA.id, -2.5, -3, 9), locked(BUF.id, 3.5, 2.5, 8)])] }] };
const app = league => ({ accountId: 'me', league, community: { data: { week: { season: 2026, week: 8 } } }, requestSignIn: vi.fn() });
const render = () => renderToStaticMarkup(<div className="gx"><CompareTile onOpen={() => {}}/></div>);

describe('CompareTile', () => {
  it('reads Home’s shared history read and shows your lead over the player Compare opens on, never NEW', () => {
    useAppData.mockReturnValue(app({ id: 'community', name: 'Community', community: true }));
    useLeagueRead.mockReturnValue({ loading: false, error: null, data: history });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('+2');
    expect(html).toContain('vs Troy');
    expect(html).toContain('Compare: Week 8 Spread, you lead Troy by 2');
    expect(html).not.toContain('NEW');
    const [key, , , options] = useLeagueRead.mock.calls.at(-1);
    expect(key).toBe('me:home-score:2026:8');
    expect(options).toEqual({ shared: true });
  });
  it('a private league shows the plain label: the landing never reads its roster', () => {
    useAppData.mockReturnValue(app({ id: `g_${'0'.repeat(32)}`, name: 'Friends', community: false }));
    useLeagueRead.mockReturnValue({ loading: false, error: null, data: history });
    const html = render();
    expect(html).toContain('Head-to-head');
    expect(html).not.toContain('vs Troy');
    expect(html).not.toContain('NEW');
  });
});
```

and, in `tests/next-compare.test.mjs`, add `import fs from 'node:fs';` under the `assert` import and this test at the end:

```js
test('Compare has no moments (the catalog has none): its page, rules and tile never use the moments engine', () => {
  for (const file of ['ScoreComparison.jsx', 'CompareTile.jsx', 'compare.js']) {
    assert.doesNotMatch(fs.readFileSync(new URL(`../web/src/next/play/${file}`, import.meta.url), 'utf8'), /moments\/|useMoments|useNewCount/, file);
  }
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run tests/next-compare-tile.test.jsx` and `node --test tests/next-compare.test.mjs`
Expected: FAIL (`CompareTile.jsx` does not exist: an import error, and `ENOENT` in the new node test).

- [ ] **Step 3: Write `web/src/next/play/CompareTile.jsx`**

```jsx
// The Play landing's Compare tile (D-69 step 1, P1B): your lead over the player Compare opens on, in the latest week you
// share a scored game ("+6", "vs Troy"). It reuses Home's history read (the same key and options, so one shared request
// and no new read on the landing). A private league's roster is not read on the landing, so there the tile shows the
// plain label. Compare has no moments (none in the catalog), so the tile never shows NEW. `onOpen(view)` receives the
// Compare keys for that head-to-head (`item`, `season`, `week`, `market`), for `openPlay(shell, 'compare', view)`.
import { useMemo } from 'react';
import { communityApi } from '../../api.js';
import { useAppData } from '../data/AppData.jsx';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { PlayTile } from './PlayTile.jsx';
import { compareTile } from './compare.js';

export function CompareTile({ onOpen }) {
  const app = useAppData(), current = app.community.data?.week;
  const read = useLeagueRead(`${app.accountId}:home-score:${current?.season}:${current?.week}`, signal => communityApi('history', current?.season ? { season: current.season } : {}, signal), error => { if (error.status === 401) app.requestSignIn(); }, { shared: true });
  const data = app.league?.community === false ? null : read.data;
  const tile = useMemo(() => compareTile(data, current), [data, current]);
  return <PlayTile label="Compare" icon="swap" big={tile.big} sub={tile.sub} tone={tile.tone} ariaLabel={tile.ariaLabel} onClick={() => onOpen?.(tile.view)}/>;
}
```

- [ ] **Step 4: Run them again**

Run: `npx vitest run tests/next-compare-tile.test.jsx` and `node --test tests/next-compare.test.mjs`
Expected: PASS. [executed] With task-1.md's `PlayTile`, the tile renders "+2", "vs Troy" and the spoken name above, and
reads `me:home-score:2026:8` with `{ shared: true }`.

- [ ] **Step 5: Commit**

```bash
git add web/src/next/play/CompareTile.jsx tests/next-compare-tile.test.jsx tests/next-compare.test.mjs
git commit -m "Compare tile for the Play landing: head-to-head number from Home's shared history read

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Notes (task 3)

- **Shared `item` [executed]:** `go` carries `item` across Play sections and Back does not restore it (not in
  `state.js` `ROUTE_KEYS`). Task 1's `openPlay` clears it, but the old openers (`LeagueScreen.jsx:175`,
  `ScoreHomeTile.jsx:20`, Task 2's "Compare players" button) do not, so Compare validates `item` against its roster;
  tasks 4–6 should validate theirs. `LeagueScreen`'s `comparisonKind`/`players` keys are now ignored (Task 6 may drop them).
- **D-53 narrowed, needs Sean's eye:** "several players at once" (strict intersection) and the per-player sample table
  are retired for P3B's one-at-a-time; "all players" survives as the Everyone chip. Task 8 should add a D-69 addendum
  under D-53 in `docs/DECISIONS.md` (no other rules doc describes the old controls).
- **D-38 numbers:** Sean's chosen head-to-head line puts eight numbers on the card (two points, the lead, two Bullseyes,
  two misses, shared games), above the six-number rule. It is kept as chosen and flagged here.
- **Tile in a private league:** the landing reads no league roster, so the tile shows "—" and "Head-to-head" there, not
  a number. Community shows the number from Home's read (the same request Task 2's `ScoreTile` makes). Task 7: wire
  `onOpen={view => openPlay(shell, 'compare', view)}` and switch `comparisons-home.spec.js` from the address to the tile.
- **Checked against task-1.md:** `FilterToggle` keeps its panel in the DOM (`hidden`), `WeekChips` takes `week={null}`
  while Period is a range or season, and the Play lip clears `section`; `FilterToggle` sits on its own row in the stack.
- **Unverified:** the Playwright run and axe on the real layer (the executed renders used task-1.md's `WeekChips`,
  `FilterToggle` and `PlayTile`, and a stand-in `PlayLayer`); the repo vitest runs; real-phone feel of the bar growth.

---

## Task 4 · Guess the Points (P4A) and its landing tile

### Task 4a: Guess the Points model, the exact moment and the landing tile

Sean's P1B tile ("Guess the Points", "2 / 5", "slots guessed") and the D-69 "Guess the Points exact" big moment. Pure
helpers with node:test coverage, plus a thin tile with a static-render test. Nothing on screen changes yet: Task 7 puts
`PointsTile` on the landing.

**Files:**
- Modify: `web/src/next/play/points/pointsModel.js` (new helpers; the number line's lane gap)
- Create: `web/src/next/play/points/pointsMoments.js`, `web/src/next/play/points/PointsTile.jsx`
- Modify: `web/src/next/play/points/PointsBallot.jsx` (adds `usePointsMoments` only; the rest is Task 4b)
- Test: `tests/points-play.test.mjs` (new), `tests/next-points-tile.test.jsx` (new), `tests/next-points-ui.test.jsx` (one
  model test)

**Interfaces:**
- Consumes: Task 1 `PlayTile` (`play/PlayTile.jsx`) and `SCOPES.points`; the merged engine (`useMoments`, `useNewCount`).
- Produces (pointsModel.js): `nextLock(read)`, `isExact(slot)`, `slotTile(slot, weekStatus)`, `weekBar(read)`,
  `weekLine(read)`, `boardTile(read, viewer)`, `pointsTile(read, error)`. (pointsMoments.js): `pointsMoments(read)` →
  candidates `{ id: 'points-exact:<season>:<week>:<slot>', kind: 'pointsExact', scopes: ['points'], title: 'Exact guess',
  meta, icon, rarity }`; `pointsSource(groupId)` → `'points:community'`. (PointsBallot.jsx): `usePointsMoments(read,
  groupId = null)`. (PointsTile.jsx): `PointsTile({ onOpen })`, `PointsTileView({ read, onOpen })`.
- `slotTile`, `weekBar`, `weekLine` and `boardTile` get their tests in Task 4b Step 2, where the week card draws them.

- [ ] **Step 1: Write the failing tests**

Create `tests/points-play.test.mjs`:

```js
// D-69 step 1, Guess the Points on Play (Sean's P4A and P1B, November 3, 2026): the "Guess the Points exact" moment
// (web/src/next/play/points/pointsMoments.js) through the real moments engine. Fixture players and values only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isExact } from '../web/src/next/play/points/pointsModel.js';
import { pointsMoments, pointsSource } from '../web/src/next/play/points/pointsMoments.js';
import { SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';

const slot = (name, patch = {}) => ({ slot: name, name: `Fixture ${name} Player`, team: 'PIT', gameKey: '2026_07_PIT_CLE', kickoff: '2026-10-25T17:00:00Z',
  closed: false, state: 'open', actual: null, revealed: false, own: null, house: null, lockedIn: [], guesses: [], ...patch });
const own = (guess, patch = {}) => ({ guess, locked: true, lockedAt: '2026-10-21T18:00:00Z', points: null, ...patch });
const scored = (name, guess, actual, patch = {}) => slot(name, { closed: true, state: 'scored', actual, revealed: true, own: own(guess, { points: Math.max(0, 10 - Math.abs(guess - actual)) }), ...patch });
const week = (slots, patch = {}) => ({ season: 2026, week: 7, status: 'open', result: { status: 'PROVISIONAL', maximum: 50, points: null }, standings: { week: [], season: [] }, slots, ...patch });
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig({ storage = memory(), settled = false, navigated = settled } = {}) {
  const big = [], small = [];
  const engine = createMomentsEngine({ account: 'acct', storage, isSettled: () => settled, hasNavigated: () => navigated, onBig: ms => big.push(ms.map(m => m.id)), onSmall: m => small.push(m.id), setTimer: fn => fn() });
  return { engine, big, small, storage };
}
const SOURCE = pointsSource(null);

test('exact: a scored slot whose locked whole-number guess is its actual; a miss, a draft, a pending or void slot is not', () => {
  assert.equal(isExact(scored('QB', 18, 18)), true);
  for (const miss of [scored('QB', 18, 18.1), scored('QB', 18, 17.9), scored('QB', 18, 18, { own: own(18, { locked: false }) }),
    slot('QB', { closed: true, state: 'pending', own: own(18) }), slot('QB', { state: 'void', actual: null, own: own(18) }), slot('QB', { own: own(18) })]) {
    assert.equal(isExact(miss), false, JSON.stringify(miss.own) + miss.state + miss.actual);
  }
});

test('pointsMoments: one big Points moment per exact slot, from a read only; a save reply, an unopened week or a miss gives none', () => {
  const read = week([scored('QB', 21, 21), scored('RB', 12, 9.2), slot('WR', { own: own(15, { locked: false }) })]);
  const moments = pointsMoments(read);
  assert.deepEqual(moments.map(m => [m.id, m.kind, m.scopes]), [['points-exact:2026:7:QB', 'pointsExact', [SCOPES.points]]]);
  assert.equal(sizeOf(moments[0].kind), 'big', 'D-69: Guess the Points exact is a big moment');
  assert.equal(moments[0].title, 'Exact guess');
  assert.equal(moments[0].meta, 'Week 7 · QB · Fixture QB Player · 21 points');
  assert.equal(typeof moments[0].icon, 'string');
  // A lock-in's own answer is not a read (rule 1: a request still pending confirms nothing), nor is a 404 or an unopened week.
  for (const reply of [{ season: 2026, week: 7, slot: 'QB', guess: 21, locked: true }, null, { status: 'unopened', slots: [] }, week([scored('RB', 12, 9.2)])]) {
    assert.deepEqual(pointsMoments(reply), []);
  }
  assert.equal(pointsSource(null), 'points:community');
  assert.equal(pointsSource('g1'), 'points:g1');
});

test('engine: an exact guess scored while you were away waits as NEW for the Points tile and plays once when the ballot opens, never on page load', () => {
  const storage = memory();
  const first = rig({ storage });
  first.engine.report(pointsMoments(week([slot('QB', { own: own(21) })])), { source: SOURCE });
  assert.equal(first.engine.newCount(SCOPES.points), 0, 'this device’s first Points read seeds silently');
  // A later launch: the stats landed while the member was away.
  const launch = rig({ storage });
  const close = launch.engine.open(SCOPES.points); // the ballot open at launch (a reload at #play/points)
  launch.engine.report(pointsMoments(week([scored('QB', 21, 21)])), { source: SOURCE });
  assert.deepEqual(launch.big, [], 'never on page load');
  assert.equal(launch.engine.newCount(SCOPES.points), 1, 'NEW on the Points tile');
  assert.equal(launch.engine.newCount(SCOPES.play), 0, 'no other tile counts it');
  close();
  // The member taps the tile: the ballot opens after the launch and the moment plays, once.
  const opened = rig({ storage, settled: true });
  opened.engine.report(pointsMoments(week([scored('QB', 21, 21)])), { source: SOURCE });
  assert.deepEqual(opened.big, []);
  opened.engine.open(SCOPES.points);
  assert.deepEqual(opened.big, [['points-exact:2026:7:QB']]);
  assert.equal(opened.engine.newCount(SCOPES.points), 0);
  opened.engine.report(pointsMoments(week([scored('QB', 21, 21)])), { source: SOURCE });
  assert.deepEqual(opened.big, [['points-exact:2026:7:QB']], 'never replays');
});

test('engine: an exact guess that arrives while the ballot is open plays in place; a miss stays quiet', () => {
  const r = rig({ settled: true });
  r.engine.report(pointsMoments(week([slot('QB', { own: own(21) }), slot('RB', { own: own(12) })])), { source: SOURCE });
  r.engine.open(SCOPES.points);
  r.engine.report(pointsMoments(week([scored('QB', 21, 18.4), slot('RB', { own: own(12) })])), { source: SOURCE });
  assert.deepEqual([r.big, r.small, r.engine.newCount(SCOPES.points)], [[], [], 0], 'a miss by 2.6: the number updates, nothing pops');
  r.engine.report(pointsMoments(week([scored('QB', 21, 18.4), scored('RB', 12, 12)])), { source: SOURCE });
  assert.deepEqual(r.big, [['points-exact:2026:7:RB']]);
});
```

Create `tests/next-points-tile.test.jsx`:

```jsx
// The Play landing's Guess the Points tile (D-69 P1B; web/src/next/play/points/PointsTile.jsx), rendered statically from
// fixture reads. Contracts: "2 / 5" counts locked slots of five; the line under it is the next lock, "All locked" (a word
// with its good tone) or "slots guessed"; a 404 keeps "Points is coming soon"; NEW comes from the Points moments' scope
// only. Fixture players only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';

const waiting = vi.hoisted(() => ({ scopes: new Map() }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn(), pointsApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => null, useSharedRead: () => ({ data: null }) }));
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: () => '2026-07', useFantasySnapshot: () => ({ status: 'loading' }) }));
// The engine's NEW counts by scope; the tile must ask for the Points scope only.
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useNewCount: scope => waiting.scopes.get(scope) ?? 0, useMoments: () => null, useMomentScope: () => {},
}));
const { PointsTileView } = await import('../web/src/next/play/points/PointsTile.jsx');
const { SCOPES } = await import('../web/src/next/moments/catalog.js');

const slot = (name, patch = {}) => ({ slot: name, name: `Fixture ${name} Player`, team: 'PIT', gameKey: '2026_07_PIT_CLE', kickoff: '2026-10-25T17:00:00Z',
  closed: false, state: 'open', actual: null, revealed: false, own: null, house: null, lockedIn: [], guesses: [], ...patch });
const locked = { guess: 18, locked: true, lockedAt: '2026-10-21T18:00:00Z', points: null };
const READ = { season: 2026, week: 7, status: 'open', result: null, standings: { week: [], season: [] },
  slots: [slot('QB', { own: locked }), slot('RB', { own: locked }), slot('WR', { own: { ...locked, locked: false } }), slot('TE'), slot('FLEX')] };
const ready = data => ({ loading: false, data, error: null, retry: vi.fn() });
const button = read => {
  const html = renderToStaticMarkup(<div className="gx"><PointsTileView read={read} onOpen={() => {}}/></div>);
  expect(markupProblems(html)).toEqual([]);
  const node = [...walk(parseMarkup(html))].find(n => n.tag === 'button');
  return { label: node.attrs['aria-label'], text: [...walk(node)].filter(n => n.text !== undefined).map(n => n.text).join(' ').replace(/\s+/g, ' ').trim() };
};

describe('Play landing › Guess the Points tile (P1B)', () => {
  it('"2 / 5" locked of five, and the next lock time while a slot can still be locked', () => {
    const tile = button(ready(READ));
    expect(tile.label).toBe('Guess the Points, 2 of 5 locked, Next locks Sun 10:00 AM PT');
    expect(tile.text).toContain('Guess the Points');
    expect(tile.text).toContain('2 / 5');
    expect(tile.text).toContain('Next locks Sun 10:00 AM PT');
  });

  it('"All locked" once every slot is locked; "slots guessed" once nothing is left to lock', () => {
    expect(button(ready({ ...READ, slots: READ.slots.map(s => ({ ...s, own: locked })) })).label).toBe('Guess the Points, 5 of 5 locked, All locked');
    expect(button(ready({ ...READ, slots: READ.slots.map(s => ({ ...s, closed: true })) })).label).toBe('Guess the Points, 2 of 5 locked, slots guessed');
  });

  it('keeps "Points is coming soon" on a 404, and says so for a failure, a loading read and an unopened week', () => {
    for (const error of [{ status: 404, code: 'GTL_POINTS_OFF' }, { status: 404 }]) {
      const tile = button({ loading: false, data: null, error, retry: vi.fn() });
      expect(tile.label).toBe('Guess the Points, Points is coming soon');
      expect(tile.text).toContain('Coming soon');
      expect(tile.text).not.toMatch(/\d \/ \d/);
    }
    expect(button({ loading: false, data: null, error: { status: 503 }, retry: vi.fn() }).label).toBe('Guess the Points, Points could not be loaded');
    expect(button({ loading: true, data: null, error: null, retry: vi.fn() }).label).toBe('Guess the Points, loading');
    expect(button(ready({ status: 'unopened', slots: [] })).label).toBe('Guess the Points, opens Tuesdays at 12:00 AM PT');
  });

  it('NEW comes from the Points scope only: a waiting exact guess marks the tile and its name; another scope does not', () => {
    waiting.scopes = new Map([[SCOPES.features, 2]]);
    expect(button(ready(READ)).label).not.toMatch(/new/);
    waiting.scopes = new Map([[SCOPES.points, 1]]);
    const tile = button(ready(READ));
    expect(tile.label).toBe('Guess the Points, 2 of 5 locked, Next locks Sun 10:00 AM PT, new result');
    expect(tile.text).toMatch(/new/i);
    waiting.scopes = new Map();
  });
});
```

In `tests/next-points-ui.test.jsx`, replace the first assertion pair of the `'number line: …'` test (the lanes changed, see
Step 3) with:

```jsx
  it('number line: the scale is max(30, top value rounded up to 10) and faces closer than a third of it take separate lanes', () => {
    const line = model.numberLine(READ.slots[1], ME);
    expect(line.max).toBe(30);
    // 17, 22 and 24 on a 0–30 line are under 10 apart: three lanes, so no two 44px faces overlap on a 170px line (320 wide).
    expect(line.markers.map(m => [m.name, m.lane])).toEqual([['Luke Fixture', 0], ['You', 1], ['Troy Fixture', 2]]);
    expect(line.lanes).toBe(3);
```

(keep the test's last three lines, `const wide = …` to the `[0, 0]` lanes check, as they are).

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/points-play.test.mjs`, then `npx vitest run tests/next-points-tile.test.jsx tests/next-points-ui.test.jsx`
Expected: FAIL. `pointsMoments.js` and `PointsTile.jsx` do not exist; `isExact` is not exported; the lanes are `[0, 0, 1]`.

- [ ] **Step 3: Add the helpers to `pointsModel.js`**

Add after the `GUESS_MAX, GUESS_MIN` import line: `import { ordinal } from '../../league/rankMoment.js';`

In `landingCard`, replace `const next = slots.filter(slot => editable(read, slot)).map(slot => slot.kickoff).sort()[0];`
with `const next = nextLock(read);`.

In `numberLine`'s doc comment replace "markers closer than a sixth of the scale share no lane, so overlapping faces are
offset vertically." with "markers closer than a third of the scale share no lane, so overlapping faces are offset
vertically: the slot layer's line is at least 170px wide at 320, where a third keeps two 44px faces apart." and replace
`const gap = max / 6, lanes = [];` with `const gap = max / 3, lanes = [];` (a sixth let 44px faces overlap on the
narrower nested line; measured at 320 and 390).

Insert above the `numberLine` doc comment:

```js
/** The earliest kickoff among the slots the viewer can still save or lock, or null when none is left. */
export const nextLock = read => (read?.slots ?? []).filter(slot => editable(read, slot)).map(slot => slot.kickoff).sort()[0] ?? null;

/** D-69 "Guess the Points exact": a scored slot whose locked guess (a whole number) is its actual (10 of 10). */
export const isExact = slot => slot?.state === 'scored' && slot.own?.locked === true && Number.isInteger(slot.own.guess) && slot.actual === slot.own.guess;

/**
 * One slot tile on the week card (P4A): `{ code, word, name, value, number, label }`. `value` is the tile's one value
 * line: "You 18" once locked, "Draft 14" for a draft, "Locks Sun 10:00 AM PT" while still to pick, "6.6 / 10" once
 * scored, "— no guess" after kickoff with nothing locked, "No points" when void. `number` says the line is a number (the
 * number style). `label` is the tile's whole accessible name, in words.
 */
export function slotTile(slot, weekStatus = null) {
  const word = slotStatus(slot, weekStatus), locked = slot.own?.locked === true;
  const line = (value, said = value, number = true) => ({ value, said, number });
  const shown = slot.state === 'void' ? line('No points', 'void, no points', false)
    : slot.state === 'scored' ? (locked ? line(`${pts(slot.own.points)} / 10`, `${pts(slot.own.points)} of 10 points`) : line('— no guess', 'no guess', false))
    : locked ? line(`You ${pts(slot.own.guess)}`)
    : slot.closed ? line('— no guess', 'no guess', false)
    : slot.own ? line(`Draft ${pts(slot.own.guess)}`)
    : line(`Locks ${kickoffText(slot.kickoff)}`, `locks ${kickoffText(slot.kickoff)}`, false);
  return { code: slot.slot, word, name: slot.name, value: shown.value, number: shown.number,
    label: `${SLOT_NAMES[slot.slot] ?? slot.slot}, ${slot.name}, ${matchupText(slot)}, ${kickoffText(slot.kickoff)}, ${word}, ${shown.said}` };
}

/**
 * The week card's five-part bar, one part per slot in the read's order: `{ parts: [{ slot, state }], label }`. A state is
 * 'locked', 'draft', 'open' (to pick) or 'closed' (kicked off, or void, with nothing locked); `label` says it in words.
 */
export function weekBar(read) {
  const slots = read?.slots ?? [];
  const parts = slots.map(slot => ({ slot: slot.slot, state: slot.own?.locked ? 'locked' : slot.closed || slot.state === 'void' ? 'closed' : slot.own ? 'draft' : 'open' }));
  const count = state => parts.filter(part => part.state === state).length, drafts = count('draft');
  return { parts, label: `${count('locked')} of ${slots.length} slots locked${drafts ? `, ${drafts} ${drafts === 1 ? 'draft' : 'drafts'}` : ''}` };
}

/** The week card's one meta line: "2 of 5 locked · next locks Sun 10:00 AM PT" while a slot can be locked, then the week's "You 24.6 of 50 · PROVISIONAL". */
export function weekLine(read) {
  const slots = read?.slots ?? [];
  const locked = slots.filter(slot => slot.own?.locked).length, next = nextLock(read);
  if (next) return `${locked} of ${slots.length} locked · next locks ${kickoffText(next)}`;
  return read?.result?.status ? summaryLine(read) : `${locked} of ${slots.length} locked`;
}

/** The week card's sixth tile, the Points board: the viewer's season rank ("3rd", "of 9" ranked), or "—" before one. */
export function boardTile(read, viewer) {
  const { members } = boardRows(read, viewer);
  const me = members.find(row => row.you), ranked = members.filter(row => row.rank !== null).length;
  if (!me || me.rank === null) return { big: '—', sub: 'No rank yet', label: 'Points board, no rank yet' };
  const place = ordinal(me.rank);
  return { big: place, sub: `of ${ranked}${me.tied ? ' · tied' : ''}`, label: `Points board, ${place} of ${ranked}${me.tied ? ', tied' : ''}` };
}

/**
 * The Play landing's Guess the Points tile (P1B): `{ big, sub, tone, label }`. While a week is open `big` is "2 / 5"
 * (locked of five) and `sub` the next lock ("Next locks Sun 10:00 AM PT"), "All locked" (tone good) or "slots guessed";
 * otherwise `big` is "—". A 404 keeps today's "Points is coming soon" (comingSoon).
 */
export function pointsTile(read, error) {
  const plain = (sub, said) => ({ big: '—', sub, tone: 'plain', label: `Guess the Points, ${said}` });
  if (comingSoon(error)) return plain('Coming soon', 'Points is coming soon');
  if (error) return plain('Could not load', 'Points could not be loaded');
  if (!read) return plain('Loading…', 'loading');
  if (read.status !== 'open') return plain('Opens Tuesday', 'opens Tuesdays at 12:00 AM PT');
  const slots = read.slots || [];
  const locked = slots.filter(slot => slot.own?.locked).length, next = nextLock(read);
  const all = slots.length > 0 && locked === slots.length;
  const sub = all ? 'All locked' : next ? `Next locks ${kickoffText(next)}` : 'slots guessed';
  return { big: `${locked} / ${slots.length}`, sub, tone: all ? 'good' : 'plain', label: `Guess the Points, ${locked} of ${slots.length} locked, ${sub}` };
}
```

- [ ] **Step 4: Create `web/src/next/play/points/pointsMoments.js`**

```js
// D-69 "Guess the Points exact" (big): a scored slot whose locked guess is its actual. Pure: built only from a fresh
// /points/read reply (PointsBallot.jsx reports usePointsRead's data, never a save still pending), so a moment plays only
// on confirmed data. A miss, a draft, an unlocked or a void slot gives nothing: a loss stays quiet.
import { SCOPES } from '../../moments/catalog.js';
import { BADGE_ICONS } from '../../features/icons.js';
import { SEP } from '../../format.js';
import { isExact, pts } from './pointsModel.js';

/** The moments engine's source for one Points read: the Community's on Play, a group's on its board. */
export const pointsSource = groupId => `points:${groupId ?? 'community'}`;

/** `[{ id, kind: 'pointsExact', scopes: ['points'], title, meta, icon, rarity }]`, one per exact slot of the read's week. */
export function pointsMoments(read) {
  if (read?.status !== 'open' || !Number.isInteger(read.season) || !Number.isInteger(read.week) || !Array.isArray(read.slots)) return [];
  return read.slots.filter(isExact).map(slot => ({
    id: `points-exact:${read.season}:${read.week}:${slot.slot}`, kind: 'pointsExact', scopes: [SCOPES.points],
    title: 'Exact guess', meta: `Week ${read.week}${SEP}${slot.slot} · ${slot.name}${SEP}${pts(slot.actual)} points`,
    icon: BADGE_ICONS.bullseye, rarity: 'rare',
  }));
}
```

- [ ] **Step 5: Add `usePointsMoments` to `PointsBallot.jsx`**

Add to the imports: `import { useMoments } from '../../moments/MomentsProvider.jsx';` and
`import { pointsMoments, pointsSource } from './pointsMoments.js';`. Insert after `usePointsRead`:

```jsx
/**
 * D-69: each fresh /points/read reply reports the viewer's exact slots to the moments engine. It runs on a new reply only:
 * a refresh in flight keeps the last reply, and a save's own answer is not a read, so nothing pending ever plays.
 */
export function usePointsMoments(read, groupId = null) {
  const report = useMoments()?.report;
  const data = read.data;
  useEffect(() => { if (data && report) report(pointsMoments(data), { source: pointsSource(groupId) }); }, [data, report, groupId]);
}
```

- [ ] **Step 6: Create `web/src/next/play/points/PointsTile.jsx`**

```jsx
// The Play landing's Guess the Points tile (D-69 step 1, Sean's P1B of November 3, 2026): "2 / 5" slots locked, then the
// next lock time, "All locked" or "slots guessed". It reads the week as the landing always has (usePointsRead, the one
// /points/read), reports the Points moments from that read (an exact guess waits as NEW here and plays when the ballot
// opens), and keeps "Points is coming soon" while the read answers 404 (P-01 not hosted).
import { useAppData } from '../../data/AppData.jsx';
import { useNewCount } from '../../moments/MomentsProvider.jsx';
import { SCOPES } from '../../moments/catalog.js';
import { PlayTile } from '../PlayTile.jsx';
import { pointsTile } from './pointsModel.js';
import { usePointsMoments, usePointsRead } from './PointsBallot.jsx';

/** `ref` reaches the tile's button: the landing returns focus there when the reminder prompt under it leaves. */
export function PointsTile({ ref, onOpen }) {
  const app = useAppData();
  return <PointsTileView ref={ref} read={usePointsRead(app)} onOpen={onOpen}/>;
}

/** One read state of the tile (tests render each one). */
export function PointsTileView({ ref, read, onOpen }) {
  usePointsMoments(read);
  const isNew = useNewCount(SCOPES.points) > 0;
  const tile = pointsTile(read.data, read.error);
  return <PlayTile ref={ref} label="Guess the Points" icon="people" big={tile.big} sub={tile.sub} tone={tile.tone} isNew={isNew}
    ariaLabel={isNew ? `${tile.label}, new result` : tile.label} onClick={onOpen}/>;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test tests/points-play.test.mjs tests/next-moments.test.mjs tests/next-moments-engine.test.mjs` and
`npx vitest run tests/next-points-tile.test.jsx tests/next-points-ui.test.jsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/next/play/points/pointsModel.js web/src/next/play/points/pointsMoments.js web/src/next/play/points/PointsTile.jsx web/src/next/play/points/PointsBallot.jsx tests/points-play.test.mjs tests/next-points-tile.test.jsx tests/next-points-ui.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/play/points tests/points-play.test.mjs tests/next-points-tile.test.jsx
git commit -m "Guess the Points: the exact moment, the landing tile and the week card's model" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4b: Guess the Points as Play layers (P4A)

The ballot becomes one Play layer whose card is the week ("Week N Points", the bar, one meta line, five glow slot tiles
and the board tile), one slot (address `item` = the slot code), or that slot's profile (`layer: 'profile'` with the same
`item`). The slot sheet goes. Every D-56 piece moves into the slot's card unchanged: the stepper, Save draft, the lime
"Lock in N" and its confirm `Dialog`, Retry same save, `setDirty`, 4A faces, 5B `NumberLine`, the House tick, the tiles
and the closest line, `SlotContext`, `PointsProfile`, `PointsPublish`.

**Files:**
- Modify: `web/src/next/play/points/PointsBallot.jsx`, `web/src/next/play/points/SlotContext.jsx`,
  `web/src/next/play/points/points.css`
- Test: `tests/next-points-ui.test.jsx`, `tests/next-points-context.test.jsx`, `tests/next-points-publish-ui.test.jsx`,
  `tests/next-router.test.mjs` (add one test), `tests/cloud-browser/next-points.spec.js`

**Interfaces:**
- Consumes: Task 1 `PlayLayer`, `PlayTile`; Task 2's shell rule (Task 2 made `item` a step: a `layer`/`item` change on a
  Play section is a navigation step, and `go`/`restore` drop `layer` and `item`). Because `go` drops `item`, every patch
  that keeps the slot names it: the profile opens with `{ item: code, layer: 'profile' }`, and its lip back to the slot
  sends `{ item: code, layer: undefined }`.
- Produces: `SlotLayer({ data, slot, viewer, profile, setDirty, onProfile, onSaved, onSignInAgain })` (replaces
  `SlotSheet`, imported only by `tests/next-points-context.test.jsx`). `PointsBallot`, `PointsBallotView({ app, shell,
  read })`, `PointsLandingCard`, `PointsComingSoon`, `usePointsRead`, `NumberLine` keep their names. `initialSlot` is
  gone: the address (`shell.state.views.play.item`, `.layer`) opens a slot. Stable tile ids `gx-pt-slot-<CODE>`, so the
  shell's Back focus finds the tile again after its status changes.

- [ ] **Step 1: Pin the addresses (router test)**

Add to `tests/next-router.test.mjs` (it uses the file's `initialState`, `reduce`, `fragmentFor`, `placeFromFragment`,
`fakeWindow`, `app` and `settle`):

```js
test('D-69 Guess the Points: a slot and its profile are steps with their own address; Back and a lip close one layer', () => {
  const list = initialState({ tab: 'play', view: { section: 'points' } });
  const slot = reduce(list, { type: 'view', tab: 'play', patch: { item: 'QB' } });
  assert.deepEqual([slot.views.play.section, slot.views.play.item, slot.trail.length], ['points', 'QB', 1]);
  assert.equal(fragmentFor('play', slot.views.play), '#play/points?item=QB');
  assert.deepEqual(placeFromFragment('#play/points?item=QB'), { tab: 'play', view: { section: 'points', item: 'QB' } }); // a reload or a shared link reopens it
  // PointsBallot.jsx sends these exact patches (the profile names its slot, since a go drops `item`).
  const profile = reduce(slot, { type: 'view', tab: 'play', patch: { item: 'QB', layer: 'profile' } });
  assert.deepEqual([profile.views.play.item, profile.views.play.layer, profile.trail.length], ['QB', 'profile', 2]);
  assert.equal(fragmentFor('play', profile.views.play), '#play/points?layer=profile&item=QB');
  for (const back of [reduce(profile, { type: 'back' }), reduce(profile, { type: 'view', tab: 'play', patch: { item: 'QB', layer: undefined } })]) {
    assert.deepEqual([back.views.play.item, back.views.play.layer ?? null, back.trail.length], ['QB', null, 1]);
  }
  for (const back of [reduce(slot, { type: 'back' }), reduce(slot, { type: 'view', tab: 'play', patch: { item: undefined, layer: undefined } })]) {
    assert.deepEqual([back.views.play.section, back.views.play.item ?? null, back.trail], ['points', null, []]);
  }
  // A fresh Play destination never reopens the slot or profile it last showed.
  assert.equal(reduce(slot, { type: 'tab', tab: 'play' }).views.play.item, undefined);
  assert.equal(reduce(reduce(slot, { type: 'tab', tab: 'home' }), { type: 'go', tab: 'play', view: { section: 'points' } }).views.play.item, undefined);
  const restored = reduce(profile, { type: 'restore', place: { tab: 'play', view: { section: 'points' } } }).views.play;
  assert.deepEqual([restored.item ?? null, restored.layer ?? null], [null, null]);
  assert.equal(placeFromFragment('#play/points?item=%3Cscript%3E').view.item, undefined);
});

test('D-69 Guess the Points: browser Back closes the slot layer, then leaves Points', async () => {
  const win = fakeWindow('https://gtl.test/#play/points');
  const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'play', patch: { item: 'RB' } });
  await settle();
  assert.equal(win.location.hash, '#play/points?item=RB');
  win.history.back();
  await settle();
  assert.equal(shell.state.views.play.section, 'points');
  assert.equal(shell.state.views.play.item, undefined);
});
```

Run: `node --test tests/next-router.test.mjs`. Expected: PASS once Task 2 is in (this task changes no shell code; the test
pins the patches below). If it fails, stop: Task 2's rule changed and the patches in Step 4 must follow it.

- [ ] **Step 2: Rewrite the static UI tests for the layers**

In `tests/next-points-ui.test.jsx`:
- Header comment: after "decisions 1C 2A 3B 4A 5B 6A" add "; D-69 P4A, November 3: the week card with slot tiles, then a
  slot layer", and say "the week card, the slot layer" for "the ballot, the slot sheet".
- Import `nameFrom` too: `import { markupProblems, matchups, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';`
- Replace the lines from `const SHELL = …` through `const dataNumbers = …` with:

```jsx
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
```

- Replace the two blocks `describe('Play › Points ballot (option D)', …)` and `describe('the slot sheet', …)` with:

```jsx
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
      expect(text(node).replace(/\s+/g, ' ').trim()).toBe(`${name} ${word} Fixture ${name} Player ${value}`);
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
```

- In `describe('feature flag and empty states')`, first test: render `ballot({ loading: false, data: null, error, retry: vi.fn() }, { item: 'QB' })`
  and add `expect(text(heading(html))).toBe('Guess the Points');` after `markupProblems`.
- In `describe('Play landing row')`, second test: replace the inline `done` fixture line and its assertion with
  `expect(model.landingCard(DONE, null).meta).toBe('Week 7 · You 6.6 of 50 · PROVISIONAL');`. The landing-row tests stay
  until Task 7 retires `PointsLandingCard`.

In `tests/next-points-context.test.jsx`:
- In the header comment and the two `describe`/`it` names that say "sheet", say "slot layer" ("the slot layer’s context
  strip"; "the ballot is keyed by account, so the slot layer, its view and its context start empty for the next account").
- `const { SlotSheet } = …` becomes `const { SlotLayer } = await import('../web/src/next/play/points/PointsBallot.jsx');`
  and the `sheet` helper renders `<SlotLayer data={READ} slot={target} viewer={ME} setDirty={vi.fn()} onProfile={vi.fn()} profile={view === 'profile'}/>`.
- Replace `describe('Open profile: the Fantasy profile as the sheet’s sub-view', …)`'s name and first test with:

```jsx
describe('Open profile: the Fantasy profile as the slot’s next card', () => {
  const profile = target => renderToStaticMarkup(<div className="gx"><PointsProfile snapshot={SNAPSHOT} slot={target} settings={PPR}/></div>);

  it('replaces the slot’s card, with no Lock in, while its code loads on the tap; the region can take focus through navigation', () => {
    const html = sheet(SLOTS.QB, 'profile');
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain(CONTEXT_COPY.profileLoading);
    expect(html).toMatch(/role="group" aria-label="Player profile" tabindex="-1"[^>]*data-route-focus/);
    expect(html).not.toContain('Lock in');
    expect(html).not.toContain('data-points-context');
  });

  it('opened from an address before the week’s player data is ready, it says so in place of the profile, never an empty one', () => {
    expect(sheet(SLOTS.QB, 'profile', { status: 'loading' })).toContain(CONTEXT_COPY.profileLoading);
    expect(text(sheet(SLOTS.QB, 'profile', { status: 'missing' }))).toBe('Player context isn’t available for Week 7 yet.');
    expect(text(sheet(SLOTS.QB, 'profile', { status: 'error', retry: vi.fn() }))).toBe(`${CONTEXT_COPY.failed} ${CONTEXT_COPY.retry}`);
    for (const state of [{ status: 'loading' }, { status: 'missing' }]) expect(sheet(SLOTS.QB, 'profile', state)).not.toMatch(/Lock in|Observed production/);
  });
```

(the old "A sheet whose snapshot is not ready stays on the slot" contract changes: a reload at a profile address must
show the profile's own loading state; the strip's "Open profile" still appears only once the player is found.)

In `tests/next-points-publish-ui.test.jsx`: add `const { ShellContext } = await import('../web/src/next/shell/context.js');`
after the `Button` import, change `'WEEK 7 POINTS'` to `'Week 7 Points'`, and replace the `shell` and `ballot` helpers with:

```jsx
const shell = admin => ({ state: { views: { play: { section: 'points' }, league: {} } }, go: vi.fn(), setView: vi.fn(), setDirty: vi.fn(), toast: vi.fn(), communityAdmin: admin });
// The ballot is a Play layer: its lips read the shell from context (PlayLayer.jsx).
const ballot = ({ admin, data = UNOPENED, week = 8 }) => {
  const value = shell(admin);
  return renderToStaticMarkup(<ShellContext.Provider value={value}><div className="gx"><PointsBallotView app={app(week)} shell={value} read={ready(data)}/></div></ShellContext.Provider>);
};
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/next-points-ui.test.jsx tests/next-points-context.test.jsx tests/next-points-publish-ui.test.jsx`
Expected: FAIL (`SlotLayer` is not exported; no `data-points-bar`, lips or `item` handling).

- [ ] **Step 4: Rebuild `PointsBallot.jsx` as layers**

Line numbers are today's file. (a) Replace the header comment and imports (lines 1–28) with:

```jsx
// Play › Guess the Points (D-56 spec section 5 and its addenda; D-69 step 1, Sean's P4A of November 3, 2026). Play
// layers (D-66 nesting cards):
// - The week card, "Week N Points": a five-part bar (one part per slot), one meta line, then five glow slot tiles in two
//   columns (position, status word, player, one value line) and a sixth tile, the Points board, which opens the League
//   board on the Points market.
// - A slot's layer (address `item` = the slot code): everything the slot sheet held (decisions 2A, 3B, 4A, 5B): the big
//   stepper, Save draft, the one lime "Lock in N" with its confirm dialog, Retry same save, the locked-in faces, the number
//   line with the House tick, the You / Actual / Points tiles and the closest line, then the player's context.
// - The player's profile (`layer` 'profile' on the slot's address, Board i63), in the same card so the guess being edited
//   stays.
// The server decides every gate (cloud/points.mjs): these layers draw only what /points/read returned. Until P-01 is
// applied the read answers 404 and the card says "Points is coming soon". A fresh read reports a slot guessed exactly as a
// big moment (pointsMoments.js); this card holds the Points moments' scope. The ballot is keyed by account, so an account
// switch starts it, and the context, empty.
import { useEffect, useRef, useState } from 'react';
import { pointsApi } from '../../../api.js';
import { fantasyWeekKey, useFantasySnapshot } from '../../../fantasyData.js';
import { useAppData } from '../../data/AppData.jsx';
import { useShell } from '../../shell/context.js';
import { useMomentScope, useMoments } from '../../moments/MomentsProvider.jsx';
import { SCOPES } from '../../moments/catalog.js';
import { PlayEmpty, PlayFailure, PlayLoading } from '../PlayStates.jsx';
import { PlayLayer } from '../PlayLayer.jsx';
import { PlayTile } from '../PlayTile.jsx';
import { Avatar, AvatarStack, Button, Card, CardButton, Dialog, Icon, InfoButton, Matchup, Pill, Skeleton } from '../../ui/index.js';
import { INFO } from '../../info.js';
import { GUESS_MAX, GUESS_MIN, SLOT_NAMES, boardTile, closestLine, comingSoon, editable, isExact, kickoffText, landingCard, matchupCodes, matchupText, numberLine, publishTarget, pts, resultTiles, slotStatus, slotTile, step, weekBar, weekLine } from './pointsModel.js';
import { pointsMoments, pointsSource } from './pointsMoments.js';
import { PointsPublish } from './PointsPublish.jsx';
import { ProfileView, SlotContext } from './SlotContext.jsx';
import { CONTEXT_COPY, contextSettings } from './pointsContext.js';
import './points.css';
```

(b) In the `usePointsRead` doc comment say "the Play landing tile" and "(an open slot stays open)". In `PointsLandingCard`'s
doc comment write "Decision 1C: the old Play landing's Points row. The new landing uses PointsTile.jsx (D-69 P1B)."
(c) Above `export function PointsBallot()` add
`const PointsInfo = () => <InfoButton title={INFO.points.title} body={INFO.points.body} links={INFO.points.links}/>;`.
(d) Replace `PointsBallotView` (lines 80–103) and delete `SlotHead` (105–111) and `SlotCard` (160–176); put this where
`PointsBallotView` was:

```jsx
/**
 * The ballot for one read state, as one Play layer whose card is the week, one slot, or that slot's profile, as the
 * address says (`item`, `layer`). Every state draws in the same layer, so a change of card moves focus to its heading.
 */
export function PointsBallotView({ app, shell, read }) {
  useMomentScope(SCOPES.points);
  usePointsMoments(read);
  const place = shell.state?.views?.play ?? {};
  const data = read.data;
  const open = !read.loading && !read.error && data?.status === 'open';
  const selected = open ? data.slots.find(slot => slot.slot === place.item) ?? null : null;
  const profile = Boolean(selected) && place.layer === 'profile';
  const week = open ? `Week ${data.week} Points` : 'Guess the Points';
  const toWeek = { key: 'points', label: week, open: () => shell.setView('play', { item: undefined, layer: undefined }) };
  const named = selected ? `${selected.slot} · ${selected.name}` : null;
  const frame = !selected ? { layer: 'points', title: week, parents: [], info: <PointsInfo/> }
    : profile ? { layer: `points:${selected.slot}`, title: selected.name, parents: [toWeek, { key: 'slot', label: named, open: () => shell.setView('play', { item: selected.slot, layer: undefined }) }], info: null }
    : { layer: `points:${selected.slot}`, title: named, parents: [toWeek], info: <PointsInfo/> };
  let body;
  if (read.loading) body = <PlayLoading>Loading Points…</PlayLoading>;
  else if (read.error) body = comingSoon(read.error) ? <PointsComingSoon/> : <PlayFailure what="Points" error={read.error} onRetry={read.retry}/>;
  else {
    // The commissioner alone sees a drafted week's preview and Publish now; gtl-api checks the grant again.
    const target = shell.communityAdmin === true ? publishTarget(data, app.community?.data?.week) : null;
    const published = n => { shell.toast?.(`Week ${n} is open for everyone.`); read.retry(); };
    const publish = target && <PointsPublish key={`${target.season}:${target.week}`} target={target} quiet={open} onPublished={published}/>;
    body = !open ? <><PlayEmpty>No Points week is open. A new week opens Tuesdays at 12:00 AM PT.</PlayEmpty>{publish}</>
      : selected ? <SlotLayer key={selected.slot} data={data} slot={selected} viewer={app.accountId} profile={profile} setDirty={shell.setDirty}
        onProfile={() => shell.setView('play', { item: selected.slot, layer: 'profile' })} onSaved={read.retry} onSignInAgain={app.requestSignIn}/>
      : <><WeekCard data={data} viewer={app.accountId} onSlot={code => shell.setView('play', { item: code })} onBoard={() => shell.go('league', { view: 'board', market: 'points' })}/>{publish}</>;
  }
  return <div className="gx-screen" data-screen="points">
    <PlayLayer label="Guess the Points" parents={frame.parents} layer={frame.layer} title={frame.title} info={frame.info} className="gx-pt">{body}</PlayLayer>
  </div>;
}

/** P4A: the bar and the meta line, then the five slot tiles and the board tile, two columns (one under 360px). */
function WeekCard({ data, viewer, onSlot, onBoard }) {
  const bar = weekBar(data), board = boardTile(data, viewer);
  return <>
    <span className="gx-pt-bar" role="img" aria-label={bar.label} data-points-bar>
      {bar.parts.map(part => <span key={part.slot} className={`gx-pt-bar-part gx-pt-bar-part--${part.state}`}></span>)}
    </span>
    <p className="gx-t-meta" data-points-summary>{weekLine(data)}</p>
    <ul className="gx-nest-grid gx-pt-grid" aria-label={`Week ${data.week} Points players`}>
      {data.slots.map(slot => <li key={slot.slot}><SlotTile slot={slot} weekStatus={data.result?.status} onOpen={() => onSlot(slot.slot)}/></li>)}
      <li><PlayTile label="Points board" icon="trophy" big={board.big} sub={board.sub} ariaLabel={board.label} onClick={onBoard}/></li>
    </ul>
  </>;
}

/** One glow tile (P4A): the position, its status word, the player and one value line. Its id lets Back return focus to it. */
function SlotTile({ slot, weekStatus, onOpen }) {
  const tile = slotTile(slot, weekStatus);
  return <CardButton variant="hero" id={`gx-pt-slot-${slot.slot}`} className="gx-pt-slot gx-vstack gx-gap-8" aria-label={tile.label} data-slot={slot.slot} onClick={onOpen}>
    <span className="gx-pt-slot-top"><span className="gx-t-section">{tile.code}</span><span className="gx-pt-word gx-t-micro">{tile.word}</span></span>
    <span className="gx-t-strong gx-pt-slot-name">{tile.name}</span>
    <span className={tile.number ? 'gx-n-s' : 'gx-t-meta gx-pt-sub'}>{tile.value}</span>
  </CardButton>;
}
```

(e) In `NumberLine`'s doc comment write "`interactive` (the slot layer) makes each face and the tick a 44px button … ;
otherwise the line is a picture whose holder names the exact values." (f) Replace `SlotSheet` (lines 219–287, with its
doc comment) with:

```jsx
/**
 * One slot's card: the stepper, Save draft and the one lime "Lock in N" while it is open; the number line or the locked-in
 * faces after lock-in or kickoff; the results once scored (an exact guess says so); then the player's context. With
 * `profile` it shows his Fantasy profile instead, and the guess being edited stays (this card stays mounted). Leaving
 * the slot with an unsaved guess asks first (setDirty; the profile keeps it, so it does not ask).
 */
export function SlotLayer({ data, slot, viewer, profile = false, setDirty, onProfile, onSaved, onSignInAgain }) {
  const fantasy = useFantasySnapshot(fantasyWeekKey(data.season, data.week));
  const settings = contextSettings(data);
  const [value, setValue] = useState(Number.isInteger(slot.own?.guess) ? slot.own.guess : null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(null);
  const alive = useRef(true), running = useRef(false), wasProfile = useRef(profile);
  const can = editable(data, slot);
  const dirty = can && value !== null && value !== slot.own?.guess;
  const dirtyKey = `points.${data.season}.${data.week}.${slot.slot}`;
  const code = slot.slot;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const keeps = next => next.tab === 'play' && next.views.play.section === 'points' && next.views.play.item === code;
    setDirty?.(dirtyKey, dirty || busy || Boolean(pending), keeps);
    return () => setDirty?.(dirtyKey, false);
  }, [dirtyKey, dirty, busy, pending, setDirty, code]);
  // The profile takes focus when it opens here (not on a page load at its address); Back returns focus to "Open profile".
  const focusProfile = profile && !wasProfile.current;
  useEffect(() => { wasProfile.current = profile; });
  async function send(action, retry = false) {
    if (running.current || (!retry && (!can || value === null))) return;
    const request = retry ? pending : { action, body: { season: data.season, week: data.week, slot: slot.slot, guess: value, requestId: crypto.randomUUID() } };
    running.current = true; setBusy(true); setConfirm(false); setError(''); setNotice(''); setPending(request);
    try {
      const saved = await pointsApi(request.action, request.body);
      if (!alive.current) return;
      setPending(null);
      setNotice(saved.locked ? `Locked in ${saved.guess}. Everyone’s guesses and the House for this player are open to you.` : `Draft saved: ${saved.guess}.`);
      onSaved?.();
    } catch (failure) {
      if (!alive.current) return;
      if (failure.uncertain) { setError('We could not confirm the save. Your guess is kept here. Retry sends the same request, so it cannot count twice.'); return; }
      setPending(null);
      setError(failure.status ? failure.message : 'No connection. Your guess is kept here; reconnect and try again.');
      if (failure.status === 401) onSignInAgain?.();
      if (['GTL_POINTS_LOCKED', 'GTL_POINTS_CLOSED', 'GTL_POINTS_NOT_OPEN'].includes(failure.code)) onSaved?.();
    } finally { running.current = false; if (alive.current) setBusy(false); }
  }
  const choose = update => { setValue(update); setNotice(''); };
  if (profile) return <SlotProfile fantasy={fantasy} slot={slot} settings={settings} week={data.week} focus={focusProfile}/>;
  const status = slotStatus(slot, data.result?.status);
  const settled = (slot.state === 'scored' || slot.closed) && slot.state !== 'void';
  const closest = closestLine(slot, viewer);
  return <>
    <Card variant="hero" className="gx-vstack gx-gap-12 gx-pt-card">
      <span className="gx-pt-word gx-t-micro">{status}</span>
      <p className="gx-t-meta gx-pt-sub">{SLOT_NAMES[slot.slot]} · <SlotGame codes={matchupCodes(slot)} text={matchupText(slot)}/> · {can ? 'locks ' : ''}{kickoffText(slot.kickoff)}</p>
      {settled && <><Tiles slot={slot}/>{isExact(slot) && <Pill tone="win" className="gx-pt-exact">Exact · 10 points</Pill>}{closest && <p className="gx-t-body">{closest}</p>}</>}
      {slot.state === 'void' && <p className="gx-t-body">Void for everyone. This week’s maximum drops by 10.</p>}
      {!can && !settled && slot.own?.locked && slot.state !== 'void' && <ValueRow label="You" value={slot.own.guess}/>}
      {can ? <section className="gx-vstack gx-gap-12" aria-label="Your guess">
        <Stepper value={value} onChange={choose} disabled={busy || Boolean(pending)}/>
        <Button block disabled={busy || !dirty || Boolean(pending)} onClick={() => send('draft')}>{busy ? 'Saving…' : 'Save draft'}</Button>
        <Button variant="primary" block disabled={busy || value === null || Boolean(pending)} onClick={() => setConfirm(true)}>{value === null ? 'Choose a guess to lock in' : `Lock in ${value}`}</Button>
        <LockedInFaces slot={slot}/>
      </section> : <Revealed slot={slot} viewer={viewer}/>}
    </Card>
    <SlotContext week={data.week} slot={slot} snapshot={fantasy} settings={settings} onProfile={onProfile}/>
    {pending && <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">Your last save is unconfirmed.</p><Button disabled={busy} onClick={() => send(pending.action, true)}>Retry same save</Button></Card>}
    {error && <p className="gx-t-body gx-c-loss" role="alert">{error}</p>}
    <p className="gx-t-body" role="status">{notice}</p>
    {can && <Dialog open={confirm} title={`Lock in ${value}?`} text={`${slot.name} (${slot.slot}): ${value} fantasy points. This guess is final. Everyone’s guesses and the House open to you.`} onClose={() => { if (!busy) setConfirm(false); }}>
      <Button onClick={() => setConfirm(false)}>Keep editing</Button>
      <Button variant="primary" disabled={busy} onClick={() => send('lock')}>Confirm lock-in</Button>
    </Dialog>}
  </>;
}

/** The profile card (Board i63): its code loads on the first visit; until the week's player data is ready, its state. */
function SlotProfile({ fantasy, slot, settings, week, focus }) {
  if (fantasy?.status === 'ready' && fantasy.snapshot) return <ProfileView snapshot={fantasy.snapshot} slot={slot} settings={settings} focus={focus}/>;
  if (!fantasy || fantasy.status === 'loading') return <Skeleton label={CONTEXT_COPY.profileLoading} shape="lines" count={3}/>;
  return <div className="gx-vstack gx-gap-8" role="alert">
    <p className="gx-t-body">{fantasy.status === 'error' ? CONTEXT_COPY.failed : CONTEXT_COPY.unavailable(week)}</p>
    {fantasy.status === 'error' && fantasy.retry ? <Button variant="ghost" onClick={fantasy.retry}>{CONTEXT_COPY.retry}</Button> : null}
  </div>;
}
```

`Tiles`, `ValueRow`, `LockedInFaces`, `Stepper` and `Revealed` stay as they are. Changes against the sheet, on purpose:
the two fine-print sentences under the card move to the layer's ⓘ (INFO.points already says both; D-66 twelve words);
the confirm text's last sentence is shortened to "Everyone’s guesses and the House open to you." (12-word rule); the
dialog renders only while the slot is editable (a closed slot drew "Lock in null?" hidden in the page); "You N" shows on
a locked slot before kickoff (mockup); the lip, not a sheet Close, leaves the slot, so an unsaved guess now asks (the
sheet used to drop it silently).

- [ ] **Step 5: Let the profile take focus (`SlotContext.jsx`)**

Header comment: "a Points slot's sheet" → "a Points slot's layer"; "(shown in place as the sheet's sub-view)" → "(the
slot's next card, its address `layer` 'profile')". Import `useLayoutEffect` from react. Replace `ProfileView`'s doc
comment, signature, and the lines up to its `return` opening tag with:

```jsx
/**
 * The profile's body: the lazily loaded profile, with a local retry if its code cannot load. `focus` (it just opened from
 * the slot) moves focus here; `data-route-focus` keeps it through the shell's navigation focus.
 */
export function ProfileView({ focus = false, ...props }) {
  const [Profile, setProfile] = useState(loadProfile), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  // Only the opening render asks; a later render of the same profile never moves focus again.
  const opening = useRef(focus);
  useLayoutEffect(() => { if (opening.current) region.current?.focus({ preventScroll: true }); }, []);
  const retry = () => { region.current?.focus({ preventScroll: true }); setProfile(loadProfile); setAttempt(n => n + 1); };
  return <div ref={region} role="group" aria-label="Player profile" tabIndex={-1} className="gx-vstack gx-gap-16" data-route-focus>
```

(The slot and its profile share one Nest layer id, `points:<CODE>`, so the card, and the guess state in it, stay mounted;
Nest therefore moves no focus, and this region does instead.)

- [ ] **Step 6: Restyle (`points.css`)**

Replace the first block (the header comment and the `.gx-pt-slots`, `.gx-pt-card`, `.gx-pt-head` rules, lines 1–6) with:

```css
/* Guess the Points (D-56; ballot card option D, "Glow card", D-56 addendum; D-69 P4A). Tokens only (D-38, D-55): every slot
   tile and the open slot's card are the kit's gx-card--hero (any number may be on screen, D-56 addendum of October 23), and
   glass pills and tiles appear only on a glow card. Outside one, the same pills fall back to surface-2. */
.gx .gx-pt-card { width: 100%; min-height: var(--gx-size-touch); align-items: stretch; padding: var(--gx-space-3); text-align: left; color: var(--gx-text-1); }
/* P4A, the week card: a five-part bar (one part per slot; its name and the meta line say each state in words, so no state
   is color alone), then five slot tiles and the board tile in two columns, one column under 360px so "PROVISIONAL" and a
   long name keep to their tile at 320. */
.gx .gx-pt-bar { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--gx-space-1); }
.gx .gx-pt-bar-part { height: 8px; border-radius: var(--gx-radius-pill); background: var(--gx-track); }
.gx .gx-pt-bar-part--locked { background: var(--gx-accent-ink); }
.gx .gx-pt-bar-part--draft { background: var(--gx-pending); }
.gx .gx-pt-bar-part--closed { background: transparent; box-shadow: inset 0 0 0 1px var(--gx-border-strong); }
.gx .gx-pt-slot { width: 100%; min-height: 120px; align-items: stretch; justify-content: space-between; padding: var(--gx-space-3); text-align: left; color: var(--gx-text-1); }
.gx .gx-pt-slot-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gx-space-1) var(--gx-space-2); min-width: 0; }
.gx .gx-pt-slot-name { min-width: 0; overflow-wrap: anywhere; }
.gx .gx-pt-exact { align-self: flex-start; }
/* Each tile fills its grid cell, so a row of tiles keeps one height. */
.gx .gx-pt-grid > li { display: flex; min-width: 0; }
.gx .gx-pt-grid > li > * { flex: 1 1 auto; }
@media (max-width: 359px) {
  .gx .gx-nest-grid.gx-pt-grid { grid-template-columns: minmax(0, 1fr); }
}
```

In `.gx .gx-pt-tile` replace `padding: var(--gx-space-2) var(--gx-space-3);` with `padding: var(--gx-space-2);` (the
nested card is narrower; "Actual" left its tile at 320). Delete the sheet rule and its comment
(`.gx .gx-pt-sheet .gx-sheet-body > * { flex-shrink: 0; }`). In the context-strip comment say "a slot's layer". After the
`.gx .gx-pt-context-tile dt, … dd` rule add:

```css
/* Nested in the slot's layer the strip is narrower: under 360px its three tiles stack, so no label breaks mid-word. */
@media (max-width: 359px) {
  .gx .gx-pt-context-tiles { grid-template-columns: minmax(0, 1fr); }
}
```

In the `forced-colors` block, add `.gx .gx-pt-bar-part` to the bordered list and `.gx .gx-pt-bar-part--locked` to the
`background: CanvasText` list.

- [ ] **Step 7: Run the unit tests**

Run: `npx vitest run tests/next-points-ui.test.jsx tests/next-points-context.test.jsx tests/next-points-publish-ui.test.jsx tests/next-points-feed.test.jsx tests/next-points-tile.test.jsx`
and `node --test tests/next-router.test.mjs tests/next-tokens.test.mjs tests/points-play.test.mjs tests/points-publish-model.test.mjs`
Expected: PASS.

- [ ] **Step 8: Update the browser spec (`tests/cloud-browser/next-points.spec.js`)**

The slot is no longer a dialog: scope to the layer, and Back (browser Back or a lip) replaces Escape and Close.
1. Header comment: after "the D-56 addendum" add "; D-69 P4A: the week card and a slot layer".
2. After `const guessRow = …` add `seedPlayedWeek`, `loadQbActual` and `pointsLayer`:

```js
/** A week under way: the QB kicked off a day ago with Luke's 21 locked in before it (written with triggers off, as
 * tests/points-sql.test.mjs writes played weeks); the other four slots are still open. */
async function seedPlayedWeek(world) {
  const now = Date.now(), hour = Math.ceil(now / 3_600_000) * 3_600_000;
  const kick = [hour - DAY, hour + 2 * DAY, hour + 3 * DAY, hour + 3 * DAY + 3 * 3_600_000, hour + 4 * DAY].map(iso);
  const games = ['PIT_CLE', 'KC_LV', 'SEA_DEN', 'NYJ_BUF', 'MIA_NE'];
  const slots = ['QB', 'RB', 'WR', 'TE', 'FLEX'].map((slot, i) => ({ slot, playerId: `00-fixture-${i}`, name: `Fixture ${slot} Player`, team: games[i].slice(0, games[i].indexOf('_')),
    position: slot === 'FLEX' ? 'WR' : slot, gameKey: `2026_07_${games[i]}`, kickoff: kick[i] }));
  await world.db.query(`insert into public.gtl_points_slates(season,week,status,opens_at,finalize_at,scoring_rules,slots,house,provenance,published_at)
    values(2026,7,'published',$1,$2,$3,$4,$5,$6,$1)`, [iso(now - 3 * DAY), iso(now + 8 * DAY), { format: 'ppr', passingTds: 4, version: 'ppr4-v1' }, JSON.stringify(slots),
    { QB: 19.4, RB: 13.2, WR: 15.8, TE: 9.1, FLEX: 12.6 }, { snapshotSeason: 2026, snapshotWeek: 7, checksum: 'f'.repeat(64), selectionVersion: 'points-slate-v1', seed: 'fixture' }]);
  await world.db.transaction(async tx => {
    await tx.exec('set local session_replication_role = replica');
    await tx.query("insert into public.gtl_points_guesses(user_id,season,week,slot,guess,locked_at) values($1,2026,7,'QB',21,$2)", [ACCOUNTS.luke.id, iso(now - 2 * DAY)]);
  });
}
/** The QB's stats land (one nflverse-shaped load through the real loader): `points` Full PPR. */
async function loadQbActual(world, points) {
  const now = Date.now();
  await world.db.query('select public.gtl_points_load_actuals($1::jsonb)', [{ season: 2026, week: 7,
    source: { url: 'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv', release: 'stats_player', publishedAt: iso(now - 3_600_000), retrievedAt: iso(now - 1_800_000), sha256: 'a'.repeat(64) },
    coverage: { expected: 1, received: 1, partial: false },
    players: [{ playerId: '00-fixture-0', name: 'Fixture QB Player', team: 'PIT', position: 'QB', gameKey: '2026_07_PIT_CLE', stats: { receptions: 0 }, points: { 'ppr4-v1': points }, played: true, playedBasis: 'snaps' }] }]);
}
/** The one Play layer the ballot draws its week card, a slot and a profile in (D-66 nesting cards). */
const pointsLayer = page => page.getByRole('region', { name: 'Guess the Points', exact: true });
```

3. Fixture-week test. After `await landing.click();` the heading check becomes
   `await expect(page.getByRole('heading', { name: 'Week 7 Points', exact: true })).toBeVisible();`, then add
   `const layer = pointsLayer(page);` and `await expect(layer.locator('[data-points-bar]')).toHaveAccessibleName('0 of 5 slots locked');`.
   After `await qb.click();` replace the `dialog` lines with:

```js
  // P4A: the slot opens as the next layer with its own address; its heading takes focus, the week stays as a lip.
  await expect(page).toHaveURL(/#play\/points\?item=QB$/);
  const sheet = layer;
  await expect(sheet.getByRole('heading', { name: 'QB · Fixture QB Player', exact: true })).toBeFocused();
  await expect(sheet.getByRole('button', { name: 'Back to Week 7 Points', exact: true })).toBeVisible();
```

   Rename the screenshots `points-sheet-editor-390.png` / `points-sheet-locked-390.png` to `points-slot-editor-390.png` /
   `points-slot-locked-390.png`. After `await expect(sheet).not.toContainText(String(SENTINEL));` (the draft check) add:

```js
  // An unsaved guess asks before the lip leaves the slot; staying keeps it.
  await spin.focus();
  await page.keyboard.press('ArrowUp');
  let asked = null;
  page.once('dialog', dialog => { asked = dialog.message(); dialog.dismiss(); });
  await sheet.getByRole('button', { name: 'Back to Week 7 Points', exact: true }).click();
  expect(asked).toBe('Leave without saving your changes?');
  await expect(page).toHaveURL(/#play\/points\?item=QB$/);
  await expect(spin).toHaveAttribute('aria-valuenow', '22');
  await spin.focus();
  await page.keyboard.press('ArrowDown');
```

   Replace the five lines from `await sheet.getByRole('button', { name: 'Close' }).click();` through the
   `toHaveAccessibleName(new RegExp(…House 19\\.4…))` line with:

```js
  // Browser Back closes one layer and returns focus to the slot's tile, which now says Locked in and never another guess.
  await page.goBack();
  await expect(page).toHaveURL(/#play\/points$/);
  await expect(qb).toBeFocused();
  await expect(qb).toContainText('Locked in');
  await expect(qb).toContainText(/You\s*21/);
  await expect(qb).not.toContainText(String(SENTINEL));
  await expect(qb).toHaveAccessibleName(/, Locked in, You 21$/);
  await expect(layer.locator('[data-points-bar]')).toHaveAccessibleName('1 of 5 slots locked');
```

   Before the test's final `expect(world.errors)` add:

```js
  // The sixth tile opens the League board on the Points market.
  await layer.getByRole('button', { name: /^Points board, / }).click();
  await expect(page.getByRole('heading', { name: 'Points standings' })).toBeVisible();
```

4. Keyboard test: rename it "…, and the week lip returns focus to its tile". Replace its `dialog` lines with
   `const sheet = pointsLayer(page);` and
   `await expect(sheet.getByRole('heading', { name: 'WR · Fixture WR Player', exact: true })).toBeFocused();`; say "layer"
   in the reduced-motion comment; replace the `Escape` / `toHaveCount(0)` lines (keep `await expect(wr).toBeFocused();`
   after them) with:

```js
  // The unsaved 14 asks first; leaving discards it and lands on the WR tile.
  page.once('dialog', dialog => dialog.accept());
  await sheet.getByRole('button', { name: 'Back to Week 7 Points', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#play\/points$/);
```

5. In `contextChecks`, after `setViewportSize` add
   `await page.evaluate(() => window.scrollTo(0, 0));` with the comment "The layer is part of the page now (no sheet
   over it): check from the top, where nothing sits under the sticky bar." (scrolled, the shell's Back row sits under the
   sticky top bar and `layoutProblems` reports an overlap; other specs do the same).
6. Player-context test: `page.getByRole('dialog', { name: 'QB · Fixture QB Player' })` becomes `pointsLayer(page)` plus
   `await expect(sheet.getByRole('heading', { name: 'QB · Fixture QB Player', exact: true })).toBeVisible();`; drop "(the
   sheet body scrolls)" from the glow-card comment. The profile part becomes:

```js
  // The profile is the slot's next layer, with its own address; the unsaved 21 goes with it, so nothing asks.
  await strip.getByRole('button', { name: 'Open profile: Fixture QB Player' }).click();
  await expect(page).toHaveURL(/#play\/points\?layer=profile&item=QB$/);
  const profile = sheet;
  await expect(profile.getByRole('heading', { name: 'Fixture QB Player', exact: true })).toBeVisible();
  await expect(profile.getByRole('group', { name: 'Player profile' })).toBeFocused();
  await expect(profile.getByRole('heading', { name: 'Observed production' })).toBeVisible();
```

   and `profile.getByRole('button', { name: 'QB · Fixture QB Player' })` becomes
   `profile.getByRole('button', { name: 'Back to QB · Fixture QB Player', exact: true })`, followed by
   `await expect(page).toHaveURL(/#play\/points\?item=QB$/);`. Replace the block from `// Missing values read "—"` through
   the `Escape` after the FLEX checks with:

```js
  // Missing values read "—", never 0: the WR has no recorded games, the FLEX is not in the snapshot. Back closes one
  // layer at a time: the profile, then the slot.
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/#play\/points$/);
  await page.locator('[data-slot="WR"]').click();
  await expect(sheet.getByRole('heading', { name: 'WR · Fixture WR Player', exact: true })).toBeVisible();
  const wr = sheet.getByRole('region', { name: 'Player context' });
  await expect(wr).toContainText(/Last 3\s*—\s*no recorded games\s*no games/);
  await expect(wr).toContainText(/@ DEN allows\s*15\.0\s*to WRs · 2 games/);
  await page.goBack();
  await page.locator('[data-slot="FLEX"]').click();
  await expect(sheet.getByRole('heading', { name: 'FLEX · Fixture FLEX Player', exact: true })).toBeVisible();
  const flex = sheet.getByRole('region', { name: 'Player context' });
  await expect(flex).toContainText('Not in this week’s player data');
  await expect(flex.getByRole('button', { name: /Open profile/ })).toHaveCount(0);
  expect(await flex.innerText()).not.toMatch(/(^|\s)0(\.0)?(\s|$)/);
  await page.goBack();
```

   For Sean: `const seanSheet = pointsLayer(page);`, and the two `page.getByRole('dialog', { name: 'Fixture QB Player' })`
   assertions check `seanSheet` instead.
7. Add the exact-moment test at the end:

```js
// D-69 "Guess the Points exact" (big): stats that land while the member is away wait (NEW), never play on a page load,
// and play once, through the moments engine's one celebration card, when the ballot is next opened.
test('an exact guess plays once when the ballot is opened after the launch, never on a page load, and never again', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  await seedPlayedWeek(world);
  await openNewApp(page);
  await page.locator('[data-points-landing]').click();
  const qb = page.locator('[data-slot="QB"]');
  await expect(qb).toContainText('Pending stats');
  // This device's first Points read seeded the moments record; now the QB's 21 lands while Luke is away.
  await loadQbActual(world, 21);
  await page.reload();
  await expect(qb).toContainText('10 / 10');
  const flash = page.getByRole('dialog', { name: 'Exact guess' });
  await expect(flash).toHaveCount(0);
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await page.locator('[data-points-landing]').click();
  await expect(flash).toBeVisible();
  await expect(flash).toContainText('Week 7 · QB · Fixture QB Player · 21 points');
  await flash.getByRole('button', { name: 'Nice', exact: true }).click();
  await expect(flash).toHaveCount(0);
  await qb.click();
  await expect(pointsLayer(page)).toContainText('Exact · 10 points');
  await page.goBack();
  await page.goBack();
  await page.locator('[data-points-landing]').click();
  await expect(qb).toBeVisible();
  await expect(flash).toHaveCount(0);
  expect(world.errors).toEqual([]);
});
```

Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-points.spec.js tests/cloud-browser/next-play-nest.spec.js`
Expected: 9 passed, `skipped 0`.

- [ ] **Step 9: Full suite**

Run: `node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run`. Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add web/src/next/play/points/PointsBallot.jsx web/src/next/play/points/SlotContext.jsx web/src/next/play/points/points.css tests/next-points-ui.test.jsx tests/next-points-context.test.jsx tests/next-points-publish-ui.test.jsx tests/next-router.test.mjs tests/cloud-browser/next-points.spec.js
git diff --cached --stat && git ls-files --eol web/src/next/play/points tests/next-points-*.test.jsx tests/cloud-browser/next-points.spec.js
git commit -m "Guess the Points as Play layers: the week card with slot tiles, then a slot layer (P4A)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Notes (task 4)

- Verified by execution [executed], in a scratch copy of the repo with stand-ins for Task 1 (`PlayLayer`, `PlayTile`,
  `SCOPES.points`, the Play lip clearing `section/layer/item/scoreGame`) and Task 2's rule (`layer`/`item` steps; `go`
  and `restore` drop `pickGame`, `scoreGame`, `layer`, `item`): every test above passes, the full vitest suite (675) and
  node suite pass (7 node failures were the copy's missing `.github`/git, unrelated), and `next-points.spec.js` (7) plus
  `next-play-nest.spec.js` (2) pass in Chromium on local PGlite. The `seedPlayedWeek` SQL was also checked against a
  real `gtl_points_read`: before the load the QB is pending with no moment, after it scored 21 of 21 with one candidate.
- Phone layout [executed]: static renders at 320/390, Dark/Light, pass `layoutProblems` and axe. That run found and fixed
  three faults: results-tile text overflow at 320, number-line faces overlapping (lane gap a sixth → a third, now three
  lanes for 17/22/24), and context-tile words breaking mid-word.
- Decision for Sean: under 360px the slot tiles and the context tiles drop to one column. Two columns of 105px tiles
  fitted with fallback fonts, but "PROVISIONAL" in Inter is borderline. On 360px and wider phones it is two columns, as
  P4A shows.
- Decision: the profile is an address (`layer: 'profile'` with the slot's `item`) in the same Nest layer id as its slot,
  so the unsaved guess survives it. It moves focus itself (`ProfileView` `focus` + `data-route-focus`), and from an
  address it shows its own loading or unavailable state. That replaces the old "stays on the slot until ready" contract.
- Decision: the slot tile's accessible name no longer lists other members' guesses or the House; they live only in the
  slot layer. The browser spec's old `Troy Fixture 47.*House 19.4` name check is replaced.
- Behavior change: the week lip now asks before dropping an unsaved guess (the sheet's Close dropped it silently).
  Escape no longer closes a slot; Back and the lip do.
- For Task 7: compose `<PointsTile onOpen={() => openPlay(shell, 'points')}/>` and remove `PlayLanding`'s own
  `usePointsRead`, `PointsLandingCard` (then delete it, `landingCard`, `.gx-pt-landing*` CSS and the two "Play landing
  row" tests), and update `next-points.spec.js`'s `[data-points-landing]` locators to the tile's name
  (`/^Guess the Points, /`). The ReminderPrompt's `onGone` currently focuses the Points card through a `ref`, and
  `PlayTile` has no `ref`. Also check that `PlayTile` does not add its own "new" to `ariaLabel`, because `PointsTile` adds
  ", new result".
- Unverified [assumed]: Task 1's real `PlayTile` markup and NEW text (my tile test only needs a `<button>` with the
  `aria-label` and visible label, big, sub and a "new" word). Also the "Nice" button in the `ov.flash` card for
  `kind: 'pointsExact'` (Task 1 makes the second button "See Points"; the spec clicks "Nice"). The shell's existing
  "‹ Back" row still shows above the Nest lips on every Play section; that is Task 1's frame.

---

## Task 5 · Badges and awards (spec 6 "Badges", Sean's P5A, mockup `BadgesA.dc.html`) and `BadgesTile`

Play › Badges and awards becomes one nesting layer (two tiles, the 3-column badge grid, a Season winners row) with four
deeper layers, each with its own address on section `features`: `layer=streaks`, `layer=awards`, `layer=season` and
`layer=badge&item=<badge id>` (`item=<badge id>@<member id>` for another member's badge). The `sh.badge` sheet retires:
spec 4.1 keeps sheets only for short tasks floating over a page (comments, reactors, reactions, the menu), and a badge's
detail is a read-only page with one picture and one number, so every caller (this page, the League board's week badges)
opens the badge layer, and Back returns to the caller. The Pick streak gains its small moment. Feed post links open the
layer they are about.

Verified before writing [executed]: the code below ran in a scratch copy of `origin/main` 5e89a2b2. That copy had
stand-ins for Task 1's `PlayLayer`/`PlayTile` (the brief's API) and a prototype of the shell rules Task 2 now owns.
- Node suite: only the 3 git-dependent tests failed, because the copy has no `.git`.
- Full Vitest: 55 files passed.
- Browser specs against local PGlite, `skipped 0`, 320/390 in Light and Dark, axe clean: `next-features.spec.js`, the
  board tests of `next-design-home-league.spec.js`, `next-phone-layout.spec.js` and `next-scroll-navigation.spec.js`.
- After the shared Bullseye id (5b) was added, node, Vitest and `next-features.spec.js` (5 passed) were run again.

### Task 5a: Layer addresses and words (pure)

**Files:**
- Create: `web/src/next/features/layers.js`, `tests/next-features-layers.test.mjs`
- Modify: `tests/next-router.test.mjs` (append one test). No `state.js` edit: Task 2 made these steps (any Play
  `layer`/`item` change is a navigation step, and `go`/`restore` drop `pickGame`, `scoreGame`, `layer`, `item`).

**Interfaces:**
- Produces: `FEATURES_LAYERS`, `FEATURES_COPY`, `featuresLayer(view) → { layer: 'top'|'streaks'|'awards'|'season'|'badge',
  badge, member }`, `featuresView(layer?, { badge, member }?) → { section: 'features', layer, item }`, and the words
  `streakTile`, `streakLine`, `streakMeterLabel`, `awardsTile`, `earlierRange`, `seasonLine`, `badgesTile`.
- Consumes: Task 2's shell rules. The `steps` test and the router test below guard them for this page: Back and the
  lip close one layer, and the Play root, another tab's link and a restored place start without a stale layer.

- [ ] **Step 1: Write the failing tests**

```js
// tests/next-features-layers.test.mjs
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
```

Append to `tests/next-router.test.mjs` (it uses the file's own `fakeWindow`, `app` and `settle`):

```js
test('D-69 Badges and awards: a shared badge link reopens it; each layer is one browser step; Back closes one layer', async () => {
  const win = fakeWindow('https://gtl.test/#play/features?layer=badge&item=bullseye');
  let shell = app(win);
  assert.deepEqual([shell.state.views.play.section, shell.state.views.play.layer, shell.state.views.play.item], ['features', 'badge', 'bullseye']);
  shell.connection.disconnect();
  const away = fakeWindow('https://gtl.test/#play/league?view=board');
  shell = app(away);
  shell.dispatch({ type: 'go', tab: 'play', view: { section: 'features', layer: 'badge', item: 'sharp@u-troy' } });
  assert.equal(away.location.hash, '#play/features?layer=badge&item=sharp%40u-troy');
  shell.dispatch({ type: 'view', tab: 'play', patch: { layer: undefined, item: undefined } });
  shell.dispatch({ type: 'view', tab: 'play', patch: { layer: 'streaks', item: undefined } });
  assert.deepEqual(away.stack(), ['#play/league?view=board', '#play/features?layer=badge&item=sharp%40u-troy', '#play/features', '[#play/features?layer=streaks]']);
  away.history.back(); await settle();
  assert.deepEqual([shell.state.views.play.section, shell.state.views.play.layer], ['features', undefined], 'Back closes the streaks layer');
  away.history.back(); await settle();
  assert.deepEqual([shell.state.views.play.layer, shell.state.views.play.item], ['badge', 'sharp@u-troy']);
  away.history.back(); await settle();
  assert.equal(shell.state.views.play.section, 'league', 'and then the board the badge was opened from');
  shell.connection.disconnect();
});
```

- [ ] **Step 2: Write `web/src/next/features/layers.js`**

```js
// Play › Badges and awards as nesting layers (D-66, D-69; Sean's P5A): the page's first card, then one layer each for
// your streaks, the week's awards, the season winners and one badge. The address holds the layer (`layer`) and, for a
// badge, its id (`item`), plus "@" and the member's id when it is another member's badge (the League board's week
// badges). Also the words the layers' tiles and rows print. Pure: no React, storage or clock.
import { BADGE_BY_ID, SEASON_FINAL_WEEK, STREAK_BY_ID } from '../../../../shared/game-features/catalog.mjs';
import { DASH, EN_DASH, plural } from '../format.js';

export const FEATURES_LAYERS = Object.freeze(['streaks', 'awards', 'season', 'badge']);

export const FEATURES_COPY = Object.freeze({
  title: 'Badges and awards',
  loading: 'Loading badges and awards…',
  off: 'Badges and awards are coming soon.',
  noRecap: 'Weekly awards post here once every game of the week is final.',
  noBadges: 'No badges yet. Your first one is a guess away.',
  season: `Decided after Week ${SEASON_FINAL_WEEK}.`,
  streaks: 'Your streaks',
  weekly: 'Weekly awards',
  awards: week => `Week ${week} awards`,
  badges: 'Badges',
  earnedOf: (n, of) => `${n} of ${of} earned`,
  seasonTitle: 'Season winners',
  earlier: 'Earlier weeks',
});

// A member id as the router keeps it (shell/router.js allows [\w .:@/+-], at most 100 characters in all).
const MEMBER = /^[\w.:+-]{1,80}$/;
const TOP = Object.freeze({ layer: 'top', badge: null, member: null });

/** The layer Play's view names: `{ layer: 'top' | 'streaks' | 'awards' | 'season' | 'badge', badge, member }`. */
export function featuresLayer(view) {
  const layer = FEATURES_LAYERS.includes(view?.layer) ? view.layer : 'top';
  if (layer === 'top') return TOP;
  if (layer !== 'badge') return { layer, badge: null, member: null };
  const [badge, member = null, ...rest] = typeof view.item === 'string' ? view.item.split('@') : [];
  if (!badge || !Object.hasOwn(BADGE_BY_ID, badge) || rest.length || (member !== null && !MEMBER.test(member))) return TOP;
  return { layer, badge, member };
}

/**
 * The view that opens a layer: `shell.setView('play', featuresView('streaks'))` inside the page, or
 * `shell.go('play', featuresView('badge', { badge, member }))` from another one. Every key is set, so no older layer
 * address stays behind. Pass `member` only for another member's badge.
 */
export function featuresView(layer = null, { badge = null, member = null } = {}) {
  const known = FEATURES_LAYERS.includes(layer) && (layer !== 'badge' || (typeof badge === 'string' && Object.hasOwn(BADGE_BY_ID, badge)));
  const item = known && layer === 'badge' ? (member ? `${badge}@${member}` : badge) : undefined;
  return { section: 'features', layer: known ? layer : undefined, item };
}

const unitOf = (streak, n) => (n === 1 ? streak.unit.replace(/s$/, '') : streak.unit);

/** The "Your streaks" tile: the Pick streak's length, "Pick streak · weeks". */
export function streakTile(streak) {
  const n = streak?.current ?? 0;
  return { big: String(n), sub: `${streak.name} · ${unitOf(streak, n)}`, ariaLabel: `${FEATURES_COPY.streaks}: ${streak.name}, ${n} ${unitOf(streak, n)}` };
}

/** One streak's line in its layer: the rule's first sentence and the best, "Weeks you sent both ballots · Best 6". */
export const streakLine = streak => `${STREAK_BY_ID[streak.id].rule.split('. ')[0].replace(/\.$/, '')} · Best ${streak.best}`;

/** The meter's name: "Pick streak, 4 weeks". */
export const streakMeterLabel = streak => `${streak.name}, ${streak.current} ${unitOf(streak, streak.current)}`;

/** The awards tile: what you won in the newest week, or one plain line before the job has run. */
export function awardsTile(recap) {
  if (!recap) return { label: FEATURES_COPY.weekly, big: DASH, sub: 'Posts once the week is final', tone: 'plain', ariaLabel: 'Weekly awards, posted once the week is final' };
  const won = recap.rows.filter(row => row.you);
  const label = FEATURES_COPY.awards(recap.week);
  if (!won.length) return { label, big: '0', sub: 'See who won', tone: 'plain', ariaLabel: `${label}: you won none, see who won` };
  return { label, big: String(won.length), sub: `You won ${won[0].name}`, tone: 'good', ariaLabel: `${label}: you won ${won.map(row => row.name).join(', ')}` };
}

/** The earlier weeks' range: "Week 6", "Weeks 1–7". */
export function earlierRange(history) {
  const weeks = history.map(w => w.week);
  if (!weeks.length) return '';
  const low = Math.min(...weeks), high = Math.max(...weeks);
  return low === high ? `Week ${low}` : `Weeks ${low}${EN_DASH}${high}`;
}

/** The Season winners row's line: "After Week 18" until decided, then your title or how many won. */
export function seasonLine(season) {
  if (!season?.length) return `After Week ${SEASON_FINAL_WEEK}`;
  const mine = season.find(row => row.you);
  return mine ? `You won ${mine.name}` : plural(season.length, 'winner');
}

/**
 * The Play landing's Badges tile (Sean's P1B): how many badges you have earned, then "New: <name>" while a new badge
 * waits to be seen, else "earned". Before the features read answers (or while the server has no features route) it
 * shows a dash and the old row's words, never a sample number.
 */
export function badgesTile({ model, off = false, newest = null }) {
  if (!model) return off ? { big: DASH, sub: 'Coming soon', tone: 'plain', ariaLabel: 'Badges, coming soon' }
    : { big: DASH, sub: 'Your badges, streaks and awards', tone: 'plain', ariaLabel: 'Badges' };
  const n = model.shelf.earned.length;
  return newest ? { big: String(n), sub: `New: ${newest}`, tone: 'good', ariaLabel: `Badges, ${n} earned, new: ${newest}` }
    : { big: String(n), sub: 'earned', tone: 'plain', ariaLabel: `Badges, ${n} earned` };
}
```

- [ ] **Step 3: Run the tests to verify they pass**

Run: `node --test tests/next-features-layers.test.mjs tests/next-router.test.mjs tests/next-shell-state.test.mjs`
Expected: PASS. If `steps` or the new router test fails, the gap is in Task 2's `state.js` rules. These checks passed
against the prototype of those rules [executed]: `layer`/`item` in `ROUTE_KEYS`, a step in `navigationPatch`, dropped on
`go`/`tab` when the section or tab changes, and dropped on `restore`. Fix the gap in Task 2's change and record it. Do
not add a second copy here.

- [ ] **Step 4: Commit**

```bash
git add web/src/next/features/layers.js tests/next-features-layers.test.mjs tests/next-router.test.mjs
git commit -m "Badges and awards: layer addresses and words (D-69 step 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5b: The Pick streak moment, the shared Bullseye id and the waiting-moments list

**Files:**
- Create: `web/src/next/features/streakMoment.js`, `tests/next-features-streak.test.mjs`
- Modify: `web/src/next/moments/engine.js`, `web/src/next/moments/detect.js`, `web/src/next/moments/MomentsProvider.jsx`,
  `web/src/next/features/model.js`, `web/src/next/features/useFeatures.js`, `tests/next-features.test.mjs`,
  `tests/next-moments-ui.test.jsx`

**Interfaces:**
- Produces: `pickStreakMoment(reply, viewer)`, `streakMoments(reply, viewer)`; engine `newMoments(scope)` (the waiting
  moments as reported, oldest first); hook `useNewMoments(scope)`; badge candidates gain `badge` (catalog id).
- Moment: `{ id: 'streak:pick:<season>:<current>:<best>', kind: 'streak' (small), scopes: [SCOPES.features] }`, reported in
  the same `report` call as the badges and awards (one report per source: a second call would drop the first's waiting
  moments). A longer streak is a new id, so it plays once; 0 is no candidate, so a break is quiet.
- One exact guess, one celebration (coordinator's decision): a `bullseye` badge's moment id is Task 2's Bullseye score
  id, `score:bullseye:<season>:<week>:guess_<market>:<gameId>`. The badge's `facts` carry `gameId` and `market`
  (`shared/game-features/badges.mjs`), `week` is on the badge, and `season` is the read's top-level `season`. The old id
  `badge:<key>` goes in a new candidate field `aka`. `detect.js` treats a candidate seen under any `aka` id as seen and
  remembers its new id. Without that, every device would replay each Bullseye badge it had already celebrated
  [executed: the test fails without it].

- [ ] **Step 1: Write the failing tests**

```js
// tests/next-features-streak.test.mjs
// D-69 "Pick streak grows" (small): the detector (web/src/next/features/streakMoment.js) and how the engine plays it
// from fresh features reads: once per longer streak, quiet when it breaks, NEW on the Badges tile while it waits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickStreakMoment, streakMoments } from '../web/src/next/features/streakMoment.js';
import { featureMoments } from '../web/src/next/features/model.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';

const YOU = 'u-you', ANA = 'u-ana';
const reply = (current, best = current, season = 2026) => ({ leagueId: null, season, ran: true, badges: [], awards: [], seasonWinners: null,
  streaks: [{ userId: YOU, pick: { current, best }, bets: { current: 0, best: 0 } }, { userId: ANA, pick: { current: 9, best: 9 }, bets: { current: 0, best: 0 } }] });
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig(storage = memory()) {
  const small = [], big = [], settled = { value: false };
  const engine = createMomentsEngine({ account: YOU, storage, isSettled: () => settled.value, hasNavigated: () => settled.value,
    onBig: ms => big.push(ms.map(m => m.id)), onSmall: m => small.push(m.id), setTimer: fn => { fn(); return 0; }, now: () => 0 });
  // What useFeatures does with every fresh read: one report of the badges, awards and streak moments.
  const read = data => engine.report([...featureMoments(data, YOU), ...streakMoments(data, YOU)], { source: 'features:community' });
  return { engine, small, big, settled, read, storage };
}

test('detector: your Pick streak as one small moment named by season, length and best; none for 0, no read or another player', () => {
  const m = pickStreakMoment(reply(4, 6), YOU);
  assert.deepEqual(m, { id: 'streak:pick:2026:4:6', kind: 'streak', scopes: [SCOPES.features], title: 'Pick streak', meta: '4 weeks in a row' });
  assert.equal(sizeOf(m.kind), 'small');
  assert.equal(pickStreakMoment(reply(1), YOU).meta, '1 week in a row');
  assert.equal(pickStreakMoment(reply(5, 3), YOU).id, 'streak:pick:2026:5:5', 'a best below the current reads as the current');
  assert.equal(pickStreakMoment(reply(0, 6), YOU), null, 'a broken streak is quiet');
  assert.equal(pickStreakMoment(reply(4, 6, null), YOU), null, 'no season, no id');
  assert.equal(pickStreakMoment(reply(4), 'u-nobody'), null);
  assert.equal(pickStreakMoment(null, YOU), null, 'a pending read (no data yet) confirms nothing');
  assert.deepEqual(streakMoments(reply(0), YOU), []);
});

test('engine: the first read seeds it; a longer streak in a later read plays once in place; a break and the same length stay quiet', () => {
  const r = rig();
  r.engine.open(SCOPES.features);
  r.read(reply(3, 3));
  assert.deepEqual(r.small, [], 'a first read on this device shows the streak as it is');
  r.settled.value = true;
  r.read(reply(3, 3));
  assert.deepEqual(r.small, [], 'the same streak again is not a moment');
  r.read(reply(4, 4));
  assert.deepEqual(r.small, ['streak:pick:2026:4:4'], 'it grew while you watched: one small pop in place');
  assert.deepEqual(r.big, [], 'never a big moment');
  r.read(reply(4, 4));
  assert.deepEqual(r.small, ['streak:pick:2026:4:4'], 'never replays');
  r.read(reply(0, 4));
  assert.deepEqual(r.small, ['streak:pick:2026:4:4'], 'a break is quiet');
  r.read(reply(1, 4));
  assert.deepEqual(r.small, ['streak:pick:2026:4:4', 'streak:pick:2026:1:4'], 'growing again from the break plays');
});

test('engine: a streak that grew while you were away waits as NEW on the Badges tile and plays when Badges and awards opens', () => {
  const yesterday = rig();
  yesterday.read(reply(2, 2));
  const today = rig(yesterday.storage); // a new session on the same device
  today.settled.value = true; // the member has pressed and moved around
  today.read(reply(3, 3)); // the session's first read brings what changed while away: it waits, pressed or not
  assert.equal(today.engine.newCount(SCOPES.features), 1, 'the Badges tile shows NEW');
  assert.deepEqual(today.engine.newMoments(SCOPES.features), [pickStreakMoment(reply(3, 3), YOU)], 'the waiting moment as reported, without the engine’s own fields');
  today.engine.open(SCOPES.play);
  assert.deepEqual(today.small, [], 'the Play landing does not play it');
  today.engine.open(SCOPES.features);
  assert.deepEqual(today.small, ['streak:pick:2026:3:3'], 'opening Badges and awards plays it');
  assert.equal(today.engine.newCount(SCOPES.features), 0);
});

test('a badge moment names its catalog badge, so the grid marks that badge NEW while it waits', () => {
  const data = { ...reply(0), badges: [{ userId: YOU, badge: 'bullseye', key: 'bullseye:u-you:2026:6:SEA-DEN', week: 6, visibleAt: '2026-10-16T00:15:00Z', facts: { gameId: 'SEA-DEN', away: 'SEA', home: 'DEN', market: 'total', guess: 41 } }] };
  assert.deepEqual(featureMoments(data, YOU).map(m => [m.kind, m.badge]), [['badge', 'bullseye']]);
});

test('one exact guess, one celebration: a Bullseye badge shares Your score\'s Bullseye id; one already celebrated never replays', () => {
  const memoryWith = ids => { const m = memory(); m.setItem(momentsKey(YOU), JSON.stringify(ids)); return m; };
  const data = { ...reply(0), badges: [{ userId: YOU, badge: 'bullseye', key: 'bullseye:u-you:2026:6:SEA-DEN:total', week: 6, visibleAt: '2026-10-16T00:15:00Z', facts: { gameId: 'SEA-DEN', market: 'total', guess: 41, points: 10 } }] };
  assert.deepEqual(featureMoments(data, YOU).map(m => [m.id, m.aka]), [['score:bullseye:2026:6:guess_total:SEA-DEN', ['badge:bullseye:u-you:2026:6:SEA-DEN:total']]]);
  const played = rig(memoryWith(['source:features:community', 'source:score']));
  played.settled.value = true;
  played.engine.open('score');
  played.engine.report([{ id: 'score:bullseye:2026:6:guess_total:SEA-DEN', kind: 'bullseye', scopes: ['score'], title: 'Bullseye' }], { source: 'score' });
  assert.equal(played.big.length, 1, 'Your score plays it');
  played.engine.open(SCOPES.features);
  played.read(data);
  assert.equal(played.big.length, 1, 'the badge is the same moment: it never plays again');
  const old = rig(memoryWith(['source:features:community', 'badge:bullseye:u-you:2026:6:SEA-DEN:total']));
  old.settled.value = true;
  old.engine.open(SCOPES.features);
  old.read(data);
  assert.deepEqual(old.big, [], 'celebrated under its award key before the ids were shared: never replays');
  assert.ok(JSON.parse(old.storage.getItem(momentsKey(YOU))).includes('score:bullseye:2026:6:guess_total:SEA-DEN'), 'and the shared id is remembered');
});
```

(Its imports also need `import { momentsKey } from '../web/src/next/moments/seen.js';`.)

In `tests/next-features.test.mjs`, test "celebrations: …", replace the `/^(badge|award):/` assertion and the `ids`
deepEqual after it with:

```js
  assert.ok(items.every(i => /^(badge|award|score:bullseye):/.test(i.id)), 'stable ids: the seen record matches them across reads');
  assert.deepEqual(items.map(i => i.id), ['score:bullseye:2026:6:guess_total:SEA-DEN', 'badge:double_bullseye:u-you:2026:7:PIT-TB',
    'score:bullseye:2026:7:guess_spread:PIT-TB', 'award:community:2026:7:spread_winner', 'award:community:2026:7:best_guess'],
  'a Bullseye shares Your score\'s Bullseye id (one exact guess, one celebration); another badge is its award key (no league); an award names the league and the season');
  assert.deepEqual(items[0].aka, ['badge:bullseye:u-you:2026:6:SEA-DEN'], 'the award key stays as an earlier id');
```

and replace its last badge assertion (`elsewhere.filter(id => id.startsWith('badge:'))…`, which mixed in a new season)
with:

```js
  const badgeIds = ids => ids.filter(id => !id.startsWith('award:'));
  assert.deepEqual(badgeIds(M.featureMoments({ ...REPLY, leagueId: 'L2' }, YOU).map(i => i.id)), items.filter(i => i.kind === 'badge').map(i => i.id), 'a badge is one moment in every league');
```

In `tests/next-moments-ui.test.jsx` add `useNewMoments` to the import from `MomentsProvider.jsx` and, inside the
`describe`, add:

```jsx
  it('useNewMoments: nothing waits without a provider, or before its engine exists', () => {
    function Waiting() { return <span data-n={useNewMoments('features').length}>x</span>; }
    expect(renderToStaticMarkup(<Waiting/>)).toBe('<span data-n="0">x</span>');
    expect(renderToStaticMarkup(<MomentsProvider account="acct" showOverlay={() => {}}><Waiting/></MomentsProvider>)).toBe('<span data-n="0">x</span>');
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/next-features-streak.test.mjs` and `npx vitest run tests/next-moments-ui.test.jsx`
Expected: FAIL (`streakMoment.js` and `useNewMoments` do not exist; the Bullseye ids are still `badge:…`).

- [ ] **Step 3: Implement**

`web/src/next/features/streakMoment.js`:

```js
// D-69 "Pick streak grows" (small; the moments table's PICK column): the viewer's Pick streak in a fresh features read
// as one moment. Its id names the season, the streak's length and the season's best, so a longer streak is a new id and
// plays once (the engine never replays an id, and seeds a device's first read); a broken streak (0) is no candidate,
// so a break stays quiet. The streak is the player's own in every league, so the id names no league. Pure.
import { SCOPES } from '../moments/catalog.js';
import { plural } from '../format.js';

/** The Pick streak moment, or null: `{ id, kind: 'streak', scopes: ['features'], title, meta }`. */
export function pickStreakMoment(reply, viewer) {
  if (reply === null || typeof reply !== 'object' || typeof viewer !== 'string' || !viewer || !Number.isInteger(reply.season)) return null;
  const pick = (Array.isArray(reply.streaks) ? reply.streaks : []).find(s => s?.userId === viewer)?.pick;
  const current = pick?.current;
  if (!Number.isInteger(current) || current < 1) return null;
  const best = Number.isInteger(pick.best) && pick.best > current ? pick.best : current;
  return { id: `streak:pick:${reply.season}:${current}:${best}`, kind: 'streak', scopes: [SCOPES.features], title: 'Pick streak', meta: `${plural(current, 'week')} in a row` };
}

/** The streak moments of a features reply (the Pick streak today), reported with its badges and awards. */
export const streakMoments = (reply, viewer) => [pickStreakMoment(reply, viewer)].filter(Boolean);
```

`web/src/next/moments/engine.js`, after the `newCount(scope) { … },` line:

```js
    /** The moments waiting (NEW) for `scope`, in the order they arrived, as their reader reported them. */
    newMoments(scope) {
      return [...pending.values()].filter(m => m.scopes.includes(scope)).map(({ late, sources, ...moment }) => moment);
    },
```

`web/src/next/moments/MomentsProvider.jsx`, above `/** True once the small moment …`:

```jsx
/** The moments waiting (NEW) for `scope`, in the order they arrived (a tile names the newest: "New: Bullseye"). */
export function useNewMoments(scope) {
  const ctx = useContext(MomentsContext);
  const engine = ctx?.engine ?? null;
  // The snapshot is the waiting ids as one string, so it only changes when the moments do.
  const ids = useSyncExternalStore(engine ? engine.subscribe : none, () => (engine ? engine.newMoments(scope).map(m => m.id).join('|') : ''), () => '');
  return useMemo(() => (engine && ids ? engine.newMoments(scope) : []), [engine, scope, ids]);
}
```

`web/src/next/moments/detect.js` `freshMoments`: replace its last two lines (`const unseen = …` and the `return`) with:

```js
  // A moment whose id changed lists its earlier ids in `aka`: seen under any of them, it is seen, and its new id is
  // remembered at once, so a device that showed it never shows it again.
  const known = unique.filter(c => !seen.has(c.id) && Array.isArray(c.aka) && c.aka.some(id => seen.has(id)));
  const unseen = unique.filter(c => !seen.has(c.id) && !known.includes(c));
  return { fresh: unseen.filter(c => sizeOf(c.kind) !== 'quiet'), seed: [...unseen.filter(c => sizeOf(c.kind) === 'quiet'), ...known].map(c => c.id) };
```

`web/src/next/features/model.js`: above `export function featureMoments` add:

```js
/**
 * A badge moment's id: its award key, `badge:<key>`, except a Bullseye, which celebrates the same exact guess as Your
 * score's Bullseye moment and so shares its id, `score:bullseye:<season>:<week>:guess_<market>:<gameId>` (the engine plays
 * one id once). `aka` keeps the award key, so a device that already celebrated it under that id never replays it.
 */
function badgeMomentId(b, season) {
  const own = `badge:${b.key}`, f = b.facts ?? {};
  if (b.badge !== 'bullseye' || !Number.isInteger(season) || !Number.isInteger(b.week) || !['spread', 'total'].includes(f.market) || typeof f.gameId !== 'string' || !f.gameId) return { id: own };
  return { id: `score:bullseye:${season}:${b.week}:guess_${f.market}:${f.gameId}`, aka: [own] };
}
```

and in the badge `.map(b => ({ id: \`badge:${b.key}\`, kind: 'badge', …` replace `id: \`badge:${b.key}\`, kind: 'badge', `
with `...badgeMomentId(b, season), kind: 'badge', badge: b.badge, `. In its doc comment replace "a badge also carries
`parts` (badgeParts) so the overlay draws its game as marks." with "a badge also carries `badge` (its catalog id, so the
grid marks it NEW while it waits) and `parts` (badgeParts) so the overlay draws its game as marks; a Bullseye's id is
Your score's (badgeMomentId)."

`web/src/next/features/useFeatures.js`: add `import { streakMoments } from './streakMoment.js';`, replace the report
line with `moments.report([...featureMoments(read.data, viewer), ...streakMoments(read.data, viewer)], { source: \`features:${leagueId ?? 'community'}\` });`,
and in the comment above it replace "`celebrate: false` (a badge's own sheet) reports nothing." with "the Pick streak's
small moment rides in the same report (one report per source). `celebrate: false` reports nothing."

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/next-features-streak.test.mjs tests/next-features.test.mjs tests/next-moments-engine.test.mjs tests/next-moments.test.mjs` and
`npx vitest run tests/next-moments-ui.test.jsx tests/next-matchup-marks.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/next/features/streakMoment.js web/src/next/moments/engine.js web/src/next/moments/detect.js web/src/next/moments/MomentsProvider.jsx web/src/next/features/model.js web/src/next/features/useFeatures.js tests/next-features-streak.test.mjs tests/next-features.test.mjs tests/next-moments-ui.test.jsx
git commit -m "Moments: Pick streak grows (small), one Bullseye celebration, the waiting-moments list (D-69 step 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5c: Play › Badges and awards as nesting layers

**Files:**
- Create: `web/src/next/features/BadgeLayer.jsx`, `tests/next-features-ui.test.jsx`
- Modify (rewrite): `web/src/next/features/FeaturesScreen.jsx` (exports `FeaturesScreen`, `FEATURES_COPY`, `AwardRows` stay)
- Modify: `web/src/next/features/features.css`, `web/src/next/ui/Icon.jsx`, `tests/cloud-browser/next-features.spec.js`,
  `tests/cloud-browser/next-phone-layout.spec.js`, `tests/cloud-browser/next-scroll-navigation.spec.js`

**Interfaces:**
- Consumes: Task 1 `PlayLayer` (one instance for every layer, so Nest stays mounted and focuses each new heading; a
  different component per layer remounts Nest and loses the focus, found by execution), `PlayTile`; 5a; 5b.
- Produces: `BadgeLayer({ features, badge, member, viewer, nameOf })` (content only; reusable by Task 6); icons
  `award`, `flame` in `ui/Icon.jsx`.

- [ ] **Step 1: Write the failing test** `tests/next-features-ui.test.jsx`

```jsx
// D-69 step 1, Play › Badges and awards (Sean's P5A) and the landing's Badges tile, rendered with react-dom/server: each
// layer draws one job from the features read (stood in for), with its heading, lips and accessible names; NEW follows
// the moments engine (stood in for). Fixture people, badges and numbers only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { featuresModel } from '../web/src/next/features/model.js';

const state = vi.hoisted(() => ({ features: null, app: null, waiting: [], popped: new Set() }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn() }));
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => state.features }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useMomentScope: () => {}, usePopped: id => state.popped.has(id), useNewCount: () => state.waiting.length, useNewMoments: () => state.waiting,
}));

const { ShellContext } = await import('../web/src/next/shell/context.js');
const { FeaturesScreen } = await import('../web/src/next/features/FeaturesScreen.jsx');

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
    expect(html).not.toContain('>New<');
  });
  it('NEW marks the badge whose moment waits, and the streak tile while the streak moment waits', () => {
    setup();
    state.waiting = [{ id: 'score:bullseye:2026:7:guess_spread:PIT-TB', kind: 'badge', badge: 'bullseye', title: 'Bullseye' }, { id: 'streak:pick:2026:4:6', kind: 'streak', title: 'Pick streak' }];
    const html = render(<FeaturesScreen/>);
    expect(html).toContain('aria-label="Bullseye, Uncommon, earned 2 times, new"');
    expect((html.match(/>New</g) ?? []).length).toBe(2);
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
  it('a Pick streak pop that already played stays still when a layer mounts again (no replay)', () => {
    setup();
    state.popped = new Set(['streak:pick:2026:4:6']);
    expect(render(<FeaturesScreen/>)).not.toContain('data-moment');
    expect(render(<FeaturesScreen/>, shellAt({ layer: 'streaks' }))).not.toContain('data-moment');
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/next-features-ui.test.jsx` — Expected: FAIL (no tiles, no layers; `BadgeLayer.jsx` missing).

- [ ] **Step 3: Add the two icons** — in `web/src/next/ui/Icon.jsx` add `Award` after `ArrowLeftRight,` and `Flame` after
`Eye,` in the `lucide-react` import, and in `icons` after `swap: ArrowLeftRight,` add
`award: Award, // Play's Badges tile (D-69 step 1)` and `flame: Flame, // the Pick streak tile (D-69 step 1)`. Skip a
key an earlier task already added.

- [ ] **Step 4: Write `web/src/next/features/BadgeLayer.jsx`**

```jsx
// Play › Badges and awards › one badge (D-69 section 4.1: the `sh.badge` sheet becomes a layer with its own address):
// the 96 tile (dashed when not earned), its rarity in words, its rule, how often it was earned and when ("Week 6 · SEA @
// DEN · Total 41 exact", the game as marks), newest first. Another member's badge (from the League board) names them.
// FeaturesScreen draws it inside its one PlayLayer (the badge's name is the heading), so the card stays mounted and
// its heading takes focus when the layer opens.
import { Badge, Card, Skeleton } from '../ui/index.js';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { BadgeLine } from './BadgeLine.jsx';
import { FEATURES_COPY } from './layers.js';
import { badgeMeta, earnedText } from './model.js';

/** `features` is useFeatures' result; `member` another member's id or null; `nameOf(id)` a member's display name. */
export function BadgeLayer({ features, badge, member, viewer, nameOf }) {
  const meta = badgeMeta(badge);
  const who = member && member !== viewer ? member : viewer;
  const owner = who === viewer ? null : nameOf(who);
  const earned = features.model?.badgesOf(who).find(b => b.id === badge) ?? null;
  const count = earned?.count ?? 0;
  const state = features.model ? <p className="gx-t-strong">{owner ? `${owner}: ${earnedText(count).toLowerCase()}` : earnedText(count)}</p>
    : features.off ? <Card><p className="gx-t-body">{FEATURES_COPY.off}</p></Card>
    : features.error ? <LeagueFailure error={features.error} onRetry={features.retry}/>
    : <Skeleton label={FEATURES_COPY.loading} shape="lines" count={2}/>;
  return <>
    <div className="gx-fx-detail" data-features="badge">
      <Badge iconPath={meta.icon} size={96} rarity={meta.rarity} locked={!earned}/>
      <p className="gx-t-micro gx-c-2">{meta.rarityLabel}</p>
      <p className="gx-t-body">{meta.rule}</p>
      {state}
    </div>
    {earned?.lines.length ? <ul className="gx-fx-lines" aria-label={`When ${meta.name} was earned`}>{earned.lines.map((line, index) => <li key={line} className="gx-t-body gx-c-2"><BadgeLine parts={earned.parts[index]}/></li>)}</ul> : null}
  </>;
}
```

- [ ] **Step 5: Rewrite `web/src/next/features/FeaturesScreen.jsx`** (replace the whole file)

```jsx
// Play › Badges and awards (redesign stage 71; D-35; Sean's P5A, D-69): a nesting layer with two tiles on top (your
// streaks; the newest week's awards and what you won), the badge grid (earned first, then the ones to earn, dashed, the
// rarity word under each, ×count, NEW while its moment waits) and the Season winners row. Each opens its own layer with
// its own address (layers.js): your streaks, the week's awards with the earlier weeks, the season winners and one badge
// (BadgeLayer.jsx). It reads POST /league/features for the league showing and draws only what the server sent: nothing
// before the job has run, no sample data, and a badge only from its game's kickoff. Fine print is behind ⓘ.
import { useId } from 'react';
import { useAppData } from '../data/AppData.jsx';
import { INFO } from '../info.js';
import { useShell } from '../shell/context.js';
import { Badge, Button, Card, DriveMeter, InfoButton, Pill, Row, Skeleton } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { PlayLayer } from '../play/PlayLayer.jsx';
import { PlayTile } from '../play/PlayTile.jsx';
import { SCOPES } from '../moments/catalog.js';
import { useMomentScope, useNewMoments, usePopped } from '../moments/MomentsProvider.jsx';
import { badgeMeta, earnedText } from './model.js';
import { AwardRows } from './AwardRows.jsx';
import { BadgeLayer } from './BadgeLayer.jsx';
import { FEATURES_COPY, awardsTile, earlierRange, featuresLayer, featuresView, seasonLine, streakLine, streakMeterLabel, streakTile } from './layers.js';
import { pickStreakMoment } from './streakMoment.js';
import { useFeatures } from './useFeatures.js';
import './features.css';

export { FEATURES_COPY };
// One award as a row lives in AwardRows.jsx (the League's recap post draws it too); it is re-exported here.
export { AwardRows };

// Task 1's `usePopped` is true only when the pop happens while this element is on screen, so going back to a tile
// never replays it.
const usePopOnce = id => usePopped(id ?? '');

/** Loading, coming soon (no features route) or the failure with Try again, in the layer's own card. */
function FeaturesState({ features, shape, count }) {
  if (features.off) return <Card><p className="gx-t-body">{FEATURES_COPY.off}</p></Card>;
  if (features.error) return <LeagueFailure error={features.error} onRetry={features.retry}/>;
  return <Skeleton label={FEATURES_COPY.loading} shape={shape} count={count}/>;
}

function BadgeTile({ badge, isNew, onOpen }) {
  const label = `${badge.name}, ${badge.rarityLabel}, ${badge.earned ? earnedText(badge.count).toLowerCase() : `not earned yet. ${badge.rule}`}${isNew ? ', new' : ''}`;
  return (
    <li>
      <button type="button" className="gx-fx-tile" aria-label={label} data-badge={badge.id} onClick={onOpen}>
        <Badge iconPath={badge.icon} rarity={badge.rarity} locked={!badge.earned}/>
        <span className="gx-t-label gx-fx-tile-name">{badge.name}</span>
        <span className="gx-t-meta gx-c-2">{badge.rarityLabel}{badge.count > 1 ? ` · ×${badge.count}` : ''}</span>
        {isNew ? <Pill tone="accent">New</Pill> : null}
      </button>
    </li>
  );
}

function TopLayer({ model, streakId, waiting, onOpen }) {
  const id = useId();
  const popped = usePopOnce(streakId);
  const streak = streakTile(model.streaks.find(s => s.id === 'pick')), awards = awardsTile(model.recap);
  const fresh = new Set(waiting.filter(m => m.kind === 'badge').map(m => m.badge));
  const { earned, toEarn, of } = model.shelf;
  return <>
    <div className="gx-fx-tiles">
      <div className="gx-fx-slot" data-features="streaks-tile" data-moment={popped ? 'pop' : undefined}>
        <PlayTile label={FEATURES_COPY.streaks} icon="flame" big={streak.big} sub={streak.sub} isNew={waiting.some(m => m.kind === 'streak')} ariaLabel={streak.ariaLabel} onClick={() => onOpen('streaks')}/>
      </div>
      <div className="gx-fx-slot" data-features="awards-tile">
        <PlayTile label={awards.label} icon="trophy" big={awards.big} sub={awards.sub} tone={awards.tone} isNew={waiting.some(m => m.kind === 'award')} ariaLabel={awards.ariaLabel} onClick={() => onOpen('awards')}/>
      </div>
    </div>
    <section className="gx-fx-badges" aria-labelledby={id} data-features="shelf">
      <div className="gx-fx-head"><h3 className="gx-t-section" id={id}>{FEATURES_COPY.badges}</h3><span className="gx-t-meta gx-c-2">{FEATURES_COPY.earnedOf(earned.length, of)}</span></div>
      {earned.length ? null : <p className="gx-t-body gx-c-2">{FEATURES_COPY.noBadges}</p>}
      <ul className="gx-fx-grid" aria-label={FEATURES_COPY.badges}>
        {[...earned, ...toEarn].map(b => <BadgeTile key={b.id} badge={b} isNew={fresh.has(b.id)} onOpen={() => onOpen('badge', { badge: b.id })}/>)}
      </ul>
    </section>
    <Row title={FEATURES_COPY.seasonTitle} sub={seasonLine(model.season)} chevron onClick={() => onOpen('season')} data-features="season-row"/>
  </>;
}

function StreaksLayer({ model, account, streakId }) {
  const popped = usePopOnce(streakId);
  return (
    <ul className="gx-fx-streaks" aria-label={FEATURES_COPY.streaks} data-features="streaks">
      {model.streaks.map(s => (
        <li key={s.id} className="gx-fx-streak" data-streak={s.id} data-moment={s.id === 'pick' && popped ? 'pop' : undefined}>
          <span className="gx-fx-streak-head"><span className="gx-t-strong">{s.name}</span><CountUp className="gx-n-l" value={s.current} account={account} figure={`features.streak.${s.id}`}/></span>
          <DriveMeter value={s.current} label={streakMeterLabel(s)}/>
          <span className="gx-t-meta gx-c-2">{streakLine(s)}</span>
        </li>
      ))}
    </ul>
  );
}

function AwardsLayer({ model }) {
  if (!model.recap) return <p className="gx-t-body gx-c-2">{FEATURES_COPY.noRecap}</p>;
  return <div className="gx-vstack gx-gap-12" data-features="awards">
    <AwardRows rows={model.recap.rows} label={FEATURES_COPY.awards(model.recap.week)}/>
    {model.history.length ? (
      <details className="gx-fx-more">
        <summary className="gx-t-strong">{FEATURES_COPY.earlier}<span className="gx-t-meta gx-c-2">{earlierRange(model.history)}</span></summary>
        {model.history.map(w => <section key={w.week} className="gx-fx-week" aria-label={FEATURES_COPY.awards(w.week)}><h3 className="gx-t-strong gx-fx-head">Week {w.week}</h3><AwardRows rows={w.rows} label={FEATURES_COPY.awards(w.week)}/></section>)}
      </details>
    ) : null}
  </div>;
}

function SeasonLayer({ model }) {
  return <div data-features="season">{model.season ? <AwardRows rows={model.season} label={FEATURES_COPY.seasonTitle}/> : <p className="gx-t-body gx-c-2">{FEATURES_COPY.season}</p>}</div>;
}

export function FeaturesScreen() {
  useMomentScope(SCOPES.features);
  const app = useAppData(), shell = useShell();
  const features = useFeatures(app, shell);
  const waiting = useNewMoments(SCOPES.features);
  const place = featuresLayer(shell.state.views.play);
  const { model } = features;
  const open = (layer, options) => shell.setView('play', featuresView(layer, options));
  const parents = [{ key: 'features', label: FEATURES_COPY.title, open: () => open(null) }];
  const streakId = pickStreakMoment(features.data, app.accountId)?.id ?? null;
  const members = Array.isArray(app.community?.data?.members) ? app.community.data.members : [];
  const nameOf = id => members.find(m => m.id === id)?.displayName ?? 'Former member';
  // One PlayLayer for every layer, so its card stays mounted: a new layer rises in and its heading takes focus (Nest).
  let title, body;
  if (place.layer === 'top') {
    title = FEATURES_COPY.title;
    body = <>
      <p className="gx-t-meta gx-c-2">{app.league?.name ?? 'Community'}</p>
      {model ? <TopLayer model={model} streakId={streakId} waiting={waiting} onOpen={open}/> : <FeaturesState features={features} shape="panels" count={2}/>}
      {!features.loading && !features.off ? <Button variant="ghost" onClick={features.retry}>Refresh</Button> : null}
    </>;
  } else if (place.layer === 'badge') {
    title = badgeMeta(place.badge).name;
    body = <BadgeLayer features={features} badge={place.badge} member={place.member} viewer={app.accountId} nameOf={nameOf}/>;
  } else {
    title = place.layer === 'streaks' ? FEATURES_COPY.streaks : place.layer === 'season' ? FEATURES_COPY.seasonTitle : model?.recap ? FEATURES_COPY.awards(model.recap.week) : FEATURES_COPY.weekly;
    body = !model ? <FeaturesState features={features} shape="rows" count={3}/>
      : place.layer === 'streaks' ? <StreaksLayer model={model} account={app.accountId} streakId={streakId}/>
      : place.layer === 'season' ? <SeasonLayer model={model}/> : <AwardsLayer model={model}/>;
  }
  const top = place.layer === 'top';
  return (
    <div className="gx-screen" data-landing="features" data-features-layer={place.layer}>
      <PlayLayer label={FEATURES_COPY.title} parents={top ? [] : parents} layer={top ? 'features' : `features:${place.layer}${place.badge ? `:${place.badge}@${place.member ?? ''}` : ''}`} title={title}
        info={top ? <InfoButton title={INFO.features.title} body={INFO.features.body}/> : undefined}>{body}</PlayLayer>
    </div>
  );
}
```

- [ ] **Step 6: Restyle** — in `web/src/next/features/features.css` replace the three lines `.gx .gx-fx-streaks …`,
`.gx .gx-fx-streak …` and `.gx .gx-fx-shelf …` (lines 6–8; `.gx-fx-shelf` is no longer used) with:

```css
/* The first card: two tiles in two columns, then the badges in three. */
.gx .gx-fx-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gx-space-3); }
.gx .gx-fx-slot { display: flex; min-width: 0; }
.gx .gx-fx-slot > * { flex: 1 1 auto; min-width: 0; }
.gx .gx-fx-badges { display: flex; flex-direction: column; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-fx-badges > .gx-fx-head { padding: 0; }
.gx .gx-fx-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gx-space-2); margin: 0; padding: 0; list-style: none; }
.gx .gx-fx-streaks { display: flex; flex-direction: column; gap: var(--gx-space-4); margin: 0; padding: 0; list-style: none; }
.gx .gx-fx-streak { display: flex; flex-direction: column; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-fx-streak-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--gx-space-2); }
```

and change `.gx .gx-fx-more > summary { display: flex; align-items: center; …` to
`.gx .gx-fx-more > summary { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gx-space-2); min-height: var(--gx-size-touch); cursor: pointer; }`.
Update the file's first comment to name "the two tiles, the badge grid, the streaks, the awards".

- [ ] **Step 7: Run the unit tests**

Run: `npx vitest run tests/next-features-ui.test.jsx` and `node --test tests/next-features.test.mjs tests/next-tokens.test.mjs tests/next-loading.test.mjs`
Expected: PASS.

- [ ] **Step 8: Update the browser specs** (contracts kept: no sample before the job, one overlay, phone checks, each
layer's address, focus on its heading, Back closes one layer, a reload reopens a badge)

`tests/cloud-browser/next-phone-layout.spec.js` and `tests/cloud-browser/next-scroll-navigation.spec.js`: after
`'#play/features', ` in `ADDRESSES` insert `'#play/features?layer=streaks', '#play/features?layer=awards', '#play/features?layer=season', '#play/features?layer=badge&item=bullseye', `.

`tests/cloud-browser/next-features.spec.js`, test "before the job has run…". Block A replaces the lines from
`const screen = …` through `await phoneChecks(page, info, 'features-empty');`. Keep the flash lines as they are, from
`// The commissioner's run records Week 4…` through `await expect(flash).toHaveCount(0);`. Block B replaces the lines
from `const recap = …` to the line before `expect(world.errors).toEqual([]);`.

Block A:

```js
  const screen = page.locator('[data-landing="features"]');
  // D-69 (Sean's P5A): the page is a nesting layer under the Play lip.
  await expect(screen.getByRole('heading', { name: 'Badges and awards', level: 2 })).toBeVisible();
  await expect(screen.getByRole('button', { name: 'Back to Play' })).toBeVisible();
  const streaksTile = screen.locator('[data-features="streaks-tile"]'), awardsTile = screen.locator('[data-features="awards-tile"]');
  await expect(awardsTile).toContainText('Posts once the week is final', { timeout: 2000 });
  await expect(awardsTile).not.toContainText(/\d/);
  await expect(streaksTile).toContainText('Pick streak');
  await expect(screen.locator('[data-features="shelf"]')).toContainText('0 of 9 earned');
  await expect(screen).not.toContainText(SAMPLE);
  await phoneChecks(page, info, 'features-empty');
```

Block B:

```js
  await expect(awardsTile).toContainText('You won Spread winner');
  await expect(screen.locator('[data-features="shelf"]')).toContainText('4 of 9 earned'); // Bullseye, Double Bullseye, Dialed In, Dog Day
  await expect(streaksTile.getByRole('button')).toHaveAttribute('aria-label', 'Your streaks: Pick streak, 1 week');
  await phoneChecks(page, info, 'features-top');
  await targets44(screen);

  // The awards layer: its own address, its heading focused, the week's awards; Back closes one layer.
  await awardsTile.getByRole('button').click();
  await expect(page).toHaveURL(/#play\/features\?layer=awards$/);
  await expect(screen.getByRole('heading', { name: 'Week 4 awards', level: 2 })).toBeFocused();
  await expect(screen.locator('[data-features="awards"]')).toContainText('Worst beat');
  await expect(screen.locator('[data-features="awards"]')).toContainText('Lost by 12.5');
  await phoneChecks(page, info, 'features-awards');
  await page.goBack();
  await expect(screen.getByRole('heading', { name: 'Badges and awards', level: 2 })).toBeVisible();

  // The streaks layer: both streaks with their meter and best; its lip returns to the first card.
  await streaksTile.getByRole('button').click();
  await expect(page).toHaveURL(/#play\/features\?layer=streaks$/);
  await expect(screen.getByRole('img', { name: 'Pick streak, 1 week' })).toBeVisible();
  await expect(screen.locator('[data-features="streaks"]')).toContainText('Weeks you sent both ballots · Best 1');
  await phoneChecks(page, info, 'features-streaks');
  await screen.getByRole('button', { name: 'Back to Badges and awards' }).click();
  await expect(page).toHaveURL(/#play\/features$/);

  // A badge's layer: the 96 tile, rarity in words, the rule, how often and when; a reload reopens it.
  await screen.getByRole('button', { name: /^Bullseye, Uncommon, earned 3 times/ }).click();
  await expect(page).toHaveURL(/#play\/features\?layer=badge&item=bullseye$/);
  await expect(screen.getByRole('heading', { name: 'Bullseye', level: 2 })).toBeFocused();
  await expect(screen).toContainText('Guess a line exactly (10 points).');
  await expect(screen).toContainText('Earned 3 times');
  // D-62: the game is drawn as marks (read as one sentence); the codes beside the marks sit between in textContent.
  await expect(screen).toContainText(/Week 4 · Seattle Seahawks at Denver Broncos[A-Z@]* · Spread DEN −8\.5 exact/);
  await phoneChecks(page, info, 'features-badge');
  await page.reload();
  await expect(screen.getByRole('heading', { name: 'Bullseye', level: 2 })).toBeVisible();
  await screen.getByRole('button', { name: 'Back to Badges and awards' }).click();
  await screen.getByRole('button', { name: /^Hot Hand, Rare, not earned yet\./ }).click();
  await expect(screen).toContainText('Not earned yet');
```

In the "reduced motion" test change `toContainText('Badges · 0 of 9')` to `toContainText('0 of 9 earned')`.

- [ ] **Step 9: Run the browser specs**

Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-features.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js`
Expected: PASS, `skipped 0` (executed with stand-in tiles: 5 + 2 + 2 passed).

- [ ] **Step 10: Commit**

```bash
git add web/src/next/features/FeaturesScreen.jsx web/src/next/features/BadgeLayer.jsx web/src/next/features/features.css web/src/next/ui/Icon.jsx tests/next-features-ui.test.jsx tests/cloud-browser/next-features.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js
git commit -m "Play: Badges and awards as nesting layers (P5A, D-69 step 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5d: Retire the badge sheet; callers open the layers

**Files:**
- Delete: `web/src/next/features/BadgeSheet.jsx`
- Modify: `web/src/next/shell/registry.jsx`, `web/src/next/league/LeagueBoard.jsx`, `web/src/next/feed/feedModel.js`,
  `tests/next-feed.test.jsx`, `tests/cloud-browser/next-design-home-league.spec.js`

No change is needed in Home's awards card, the League recap post or `FlashOverlay.jsx`. The first two keep
`shell.go('play', { section: 'features' })`, and Task 2's `go` rule makes that land on the first card. Task 1 owns
`FlashOverlay`'s "See badges".

- [ ] **Step 1: Write the failing tests** — in `tests/next-feed.test.jsx`, after
`expect(model.postLink(post('joined'))).toBeNull();` add:

```js
    // D-69: each post opens the layer it is about.
    expect(['badge_earned', 'streak_milestone', 'weekly_recap', 'season_champion'].map(kind => model.postLink(post(kind)).view.layer)).toEqual([undefined, 'streaks', 'awards', 'season']);
```

In `tests/cloud-browser/next-design-home-league.spec.js`, test "League board: faces, the leader, week badges…": delete
the seven lines from `// A row's badge opens that player's detail: the rule, how often and when.` through
`await expect(sheet).toHaveCount(0);` and the blank line after them (leaving the page would remount the board and spend
the count-up this test checks later), and insert this test before "League board: a drop reads…":

```js
// D-69 section 4.1: a row's badge opens that player's badge layer (Play › Badges and awards, its own address), and
// Back returns to the board. The test above checks the board's count-ups without leaving it, so this one is separate.
test('League board: a row\'s badge opens that player\'s badge layer; Back returns to the board', async ({ page, baseURL }) => {
  const world = await featuresWorld(page, baseURL);
  try {
    await openAs(page, 'luke', '#play/league?view=board');
    const board = page.getByRole('list', { name: 'Spread season standings' });
    await board.getByRole('group', { name: 'Your Week 4 badges' }).getByRole('button', { name: 'Bullseye, 3 times, Week 4' }).click();
    await expect(page).toHaveURL(/#play\/features\?layer=badge&item=bullseye$/);
    const layer = page.locator('[data-landing="features"]');
    await expect(layer.getByRole('heading', { name: 'Bullseye', level: 2 })).toBeVisible();
    await expect(layer).toContainText('Earned 3 times');
    await expect(layer).toContainText('Week 4 · Seattle Seahawks at Denver Broncos'); // D-62: the game as marks, read as one sentence
    await page.goBack();
    await expect(board).toBeVisible();
    await board.getByRole('group', { name: 'Troy Fixture’s Week 4 badges' }).getByRole('button', { name: 'Sharp, 2 times, Week 4' }).click();
    await expect(page).toHaveURL(new RegExp(`#play/features\\?layer=badge&item=sharp%40${TROY}$`));
    await expect(layer).toContainText('Troy Fixture: earned 2 times');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/next-feed.test.jsx` — Expected: FAIL (`[undefined, undefined, undefined, undefined]`).

- [ ] **Step 3: Implement**
  - `web/src/next/shell/registry.jsx`: delete `import { BadgeSheet } from '../features/BadgeSheet.jsx';` and the
    `'sh.badge': BadgeSheet, …` line. Delete `web/src/next/features/BadgeSheet.jsx` (`git rm`). Confirm with
    `git grep -n "sh.badge\|BadgeSheet" -- web tests` that only comments remain.
  - `web/src/next/league/LeagueBoard.jsx`: add `import { featuresView } from '../features/layers.js';` after the
    `boardFact` import, and replace `onBadge={(badge, userId) => shell?.openSheet?.('sh.badge', { badge, userId })}` with
    `onBadge={(badge, userId) => shell?.go?.('play', featuresView('badge', { badge, member: userId === app?.accountId ? null : userId }))}`.
  - `web/src/next/feed/feedModel.js`: add `import { featuresView } from '../features/layers.js';`; replace the
    `const FEATURES = …` line with
    `// D-69: each post opens the Badges and awards layer it is about.` and
    `const featuresLink = layer => Object.freeze({ tab: 'play', view: Object.freeze(featuresView(layer)) });`, and the
    three feature lines of `postLink` with:

```js
  if (post.kind === 'badge_earned') return { text: 'See badges', ...featuresLink(null) };
  if (post.kind === 'streak_milestone') return { text: 'See your streaks', ...featuresLink('streaks') };
  if (post.kind === 'weekly_recap') return { text: 'See the awards', ...featuresLink('awards') };
  if (post.kind === 'season_champion') return { text: 'See the awards', ...featuresLink('season') };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/next-feed.test.jsx tests/next-design-home-league.test.jsx` and
`npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-design-home-league.spec.js -g "League board"`
Expected: PASS, `skipped 0` (executed: 3 passed).

- [ ] **Step 5: Commit**

```bash
git add web/src/next/shell/registry.jsx web/src/next/league/LeagueBoard.jsx web/src/next/feed/feedModel.js tests/next-feed.test.jsx tests/cloud-browser/next-design-home-league.spec.js
git rm web/src/next/features/BadgeSheet.jsx
git commit -m "Badges: the badge sheet becomes the badge layer; board badges and feed posts open their layer (D-69 4.1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5e: The Play landing's `BadgesTile`

**Files:**
- Create: `web/src/next/features/BadgesTile.jsx`
- Modify: `tests/next-features-ui.test.jsx` (one `describe`)

**Interfaces:** `export function BadgesTile({ onOpen })` → one `PlayTile` ("Badges", icon `award`). Reads the shared
features read (no new request), reports through `useFeatures`, `isNew` from `useNewCount(SCOPES.features) > 0`, and holds
`SCOPES.play` open like the `PlayFeaturesRow` it replaces (so the step-0 race spec, "an away badge … plays when Play
opens", keeps passing; a second holder of the scope is harmless). `onOpen` defaults to `shell.go('play', featuresView())`.
`PlayFeaturesRow` (`FeatureRows.jsx`) stays until Task 7 removes its last import in `play/Play.jsx`; Task 7 then deletes
`FeatureRows.jsx`.

- [ ] **Step 1: Write the failing test** — in `tests/next-features-ui.test.jsx` add
`const { BadgesTile } = await import('../web/src/next/features/BadgesTile.jsx');` after the `FeaturesScreen` import,
and at the end:

```jsx
describe('the Play landing Badges tile', () => {
  it('the earned count; "New: <name>" and NEW while a badge waits; NEW alone for a streak; a dash before the read answers', () => {
    setup();
    expect(render(<BadgesTile/>)).toContain('aria-label="Badges, 1 earned"');
    state.waiting = [{ id: 'badge:x', kind: 'badge', badge: 'bullseye', title: 'Bullseye' }];
    const fresh = render(<BadgesTile/>);
    expect(fresh).toContain('aria-label="Badges, 1 earned, new: Bullseye"');
    expect(words(fresh)).toContain('New: Bullseye');
    state.waiting = [{ id: 'streak:pick:2026:4:6', kind: 'streak', title: 'Pick streak' }];
    expect(render(<BadgesTile/>)).toContain('aria-label="Badges, 1 earned"');
    setup(read(null, { loading: true }));
    expect(words(render(<BadgesTile/>))).toContain('—');
    setup(read(null, { off: true }));
    expect(render(<BadgesTile/>)).toContain('aria-label="Badges, coming soon"');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `npx vitest run tests/next-features-ui.test.jsx`: FAIL (no `BadgesTile.jsx`).

- [ ] **Step 3: Write `web/src/next/features/BadgesTile.jsx`**

```jsx
// Play's Badges tile (Sean's P1B; D-69): how many badges you have earned, then "New: <name>" while a new badge waits to
// be seen, else "earned", and NEW while any badge, award or Pick streak moment waits for Badges and awards. It reads
// the shared features read the page uses (M-25, POST /league/features: no new request) and reports its moments like
// every reader. Like the "More in Play" row it replaces, it holds the Play scope open, so a badge that waited plays
// when Play opens after a navigation. Nothing is a sample: before the read answers it shows a dash (layers.js).
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { PlayTile } from '../play/PlayTile.jsx';
import { SCOPES } from '../moments/catalog.js';
import { useMomentScope, useNewCount, useNewMoments } from '../moments/MomentsProvider.jsx';
import { badgesTile, featuresView } from './layers.js';
import { useFeatures } from './useFeatures.js';

export function BadgesTile({ onOpen }) {
  const app = useAppData(), shell = useShell();
  useMomentScope(SCOPES.play);
  const features = useFeatures(app, shell);
  const waiting = useNewCount(SCOPES.features);
  const newest = useNewMoments(SCOPES.features).filter(m => m.kind === 'badge').at(-1)?.title ?? null;
  const tile = badgesTile({ model: features.model, off: features.off, newest });
  return <PlayTile label="Badges" icon="award" big={tile.big} sub={tile.sub} tone={tile.tone} isNew={waiting > 0} ariaLabel={tile.ariaLabel}
    onClick={onOpen ?? (() => shell.go('play', featuresView()))}/>;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/next-features-ui.test.jsx` and the full local suite
`node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/next/features/BadgesTile.jsx tests/next-features-ui.test.jsx
git commit -m "Play: the Badges tile for the landing (P1B, D-69 step 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Hand-off to Task 7** (it owns `play/Play.jsx` and the landing spec lines): render `<BadgesTile/>` (or pass
`onOpen={() => shell.go('play', featuresView())}`), remove `PlayFeaturesRow` and delete `features/FeatureRows.jsx`. In
`tests/cloud-browser/next-features.spec.js`: the "without M-25" test's
`getByRole('button', { name: 'Badges and awards' })).toHaveCount(0)` becomes
`getByRole('button', { name: 'Badges, coming soon' })).toBeVisible()` (no number before M-25), and the next test's row
click becomes `page.getByRole('button', { name: /^Badges, 0 earned/ })`.

### Notes (task 5)

- No `state.js` edits: Task 2 made these steps. The 5a `steps` test and the router test guard that for this page. On
  `origin/main` they fail: a `layer` patch is no step, and Back keeps the layer [executed]. They need `layer`/`item` in
  `ROUTE_KEYS`, a step in `navigationPatch`, and a drop on `go`/`tab`/`restore`.
- Shared Bullseye id: the facts carry `gameId` and `market`, and the badge carries `week`. `season` comes only from the
  read's top level, which is not on each badge [inspected `cloud/features.mjs`]. The game ids are the published week's
  (`SEA-DEN`), the same as the score rows [inspected fixtures]. 5b adds an `aka` check in `detect.js` so old Bullseye
  badges do not replay once. Whichever reader reports first sets the card's words and icon.
- Decision: `sh.badge` retires and the League board opens `#play/features?layer=badge&item=<id>@<member>`. That puts a
  member's account id in the address (router-safe, and the board already shows the same data). Task 6 can host
  `BadgeLayer` in League instead.
- Kit additions: engine `newMoments(scope)`, hook `useNewMoments(scope)` (for "New: <name>" and per-badge NEW), icons `award`, `flame`.
- Resolved by the coordinator: Task 1 changes `usePopped` itself to pop only for an element on screen when the moment
  plays (`popLatch`), so every page gets it; 5c's `usePopOnce` is now a one-line alias.
- Streak id `streak:pick:<season>:<current>:<best>`: a regrown run that reaches the length an earlier run reached at the
  same best stays quiet (errs quiet). The pop itself is unit-tested, not browser-tested (needs a second finished week).
- `BadgesTile` keeps `useMomentScope(SCOPES.play)`, so badges and awards still play when Play opens. If Task 7 also holds
  that scope, the extra hold is harmless.
- Unverified: execution used stand-ins for `PlayLayer`/`PlayTile`. Re-run Task 5c Step 9 after Task 1 lands (tile
  heights for `targets44`).

---

## Task 6 · League (P6A) and its landing tile

### Task 6a: League board first, the feed layer, rank moments and the League tile (P6A)

**Spec:** section 6 "League" (D-69) and Sean's P6A (`LeagueA.dc.html`): board first; Spread / Total / Points; standings
rows (face, LEADER and "Leads by N", your row with the rank chip, count-ups); the two newest posts; "Open the feed";
"History". Reaching 1st is big, rank up is small, a drop is quiet.

**Decisions (also in the coordinator notes):**
- The landing is the board: a missing or unknown `view` is the board (it was the feed). `#feed` still opens the feed layer.
- The season race strip goes. Under D-66 the rows are the board's one picture, and P6A has no strip.
- "Compare players in …", "Refresh Community" and "Refresh group" go. Compare has its own landing tile, and every read
  already refreshes on focus, when back online and every 5 minutes.
- The board shows 6 rows with your row always in view, then "N more on the board", which opens the rest in place (D-23).
- The rank toast is replaced by the engine (`SCOPES.league`). The device record `{ rank, from }` gains `n` (changes seen),
  which names each moment. The board's fine print moves behind ⓘ. The recap post sits on the landing, above the newest posts.
- `LeagueTile` shows "League", your Community Spread rank and "▲ 2 · New posts". There is no count: the landing only has
  `/community/read` posts, and a count from them would disagree with the feed. A private group shows its player count,
  because its board is read only when League opens.

**Files:**
- Create: `web/src/next/league/leagueModel.js`, `web/src/next/league/LeagueTile.jsx`, `tests/next-league-model.test.mjs`,
  `tests/next-league-layers.test.jsx`.
- Modify: `web/src/next/league/{rankMoment.js,useRankMoment.js,LeagueBoard.jsx,LeagueScreen.jsx,league.css}`,
  `web/src/next/feed/{Feed.jsx,PostCard.jsx,DigestCard.jsx,feed.css}`, `web/src/next/shell/state.js`.
- Tests modified: `tests/next-rank-moment.test.mjs`, `next-router.test.mjs`, `next-design-home-league.test.jsx`,
  `next-points-feed.test.jsx`, `next-feed.test.jsx`, and `tests/cloud-browser/next-design-home-league.spec.js`,
  `next-league-live.spec.js`, `next-play-live.spec.js`, `next-points.spec.js`.

**Interfaces:**
- Consumes from Task 1 and the engine: `PlayLayer`, `PlayTile`, `SCOPES.league`, `useMoments`, `useMomentScope`,
  `useNewCount`, `usePopped`.
- Produces:
  - `LeagueTile({ onOpen })`, which Task 7 composes.
  - `leagueModel.js`: `BOARD_FIRST = 6`, `PREVIEW_POSTS = 2`, `leagueLayer(view) → { layer: 'board'|'feed'|'history'|'week',
    season, week }`, `leagueMode`, `lipIsBack(trail, layer)`, `boardSlice(rows, all?) → { shown, more }`,
    `newPostIds(posts, viewer, since) → Set`, `postArrivals(known, posts) → { known, arrived }`,
    `leagueTile({...}) → { rank, tied, big, sub, tone, aria }`.
  - `rankMoment.js` adds `rankSource`, `rankCandidate` and `rankReport`, and drops `rankToast`.
  - `Feed.jsx` exports `FeedView`, `FeedPreview`, `useFeedSeen`, `useSeenSince` and `usePostArrivals`. It drops `Feed` and
    `useNewPostsDot`, whose only importer was LeagueScreen.
- Addresses:
  - `#play/league` opens the board.
  - `?view=feed` opens the feed.
  - `?view=history` opens History; `season` is a filter there.
  - `?view=history&week=N` opens one week as its own step.
  - Lips read Play › League › History.

- [ ] **Step 1: Write the failing tests**

```js
// tests/next-league-model.test.mjs
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
```

Update `tests/next-rank-moment.test.mjs`. The toast becomes engine moments; the storage, ordinal and `peekMove` contracts
stay.

1. Add these imports: `import { createMomentsEngine } from '../web/src/next/moments/engine.js';` and
   `import { SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';`.
2. Give `memoryStorage` the methods the engine's seen record uses:
   `removeItem: key => map.delete(key), key: i => [...map.keys()][i] ?? null, get length() { return map.size; }`.
3. Replace the five tests from `'the first look on a device remembers the rank and says nothing'` through
   `'ordinals in words'` with:

```js
const board = { league: 'community', mode: 'guess_spread', market: 'Spread' };
test('the first look remembers the rank and says nothing; each change after it is counted once (no toast any more)', () => {
  assert.deepEqual(R.rankMoment(null, { rank: 3 }), { write: { rank: 3, from: null, n: 0 }, move: null });
  const up = R.rankMoment({ rank: 3, from: null }, { rank: 2 });
  assert.deepEqual(up, { write: { rank: 2, from: 3, n: 1 }, move: 1 });
  assert.deepEqual(R.rankMoment(up.write, { rank: 2 }), { write: null, move: 1 }, 'the same rank again keeps the arrow and writes nothing');
  assert.deepEqual(R.rankMoment(up.write, { rank: 3 }), { write: { rank: 3, from: 2, n: 2 }, move: -1 });
  for (const rank of [null, 0]) assert.deepEqual(R.rankMoment({ rank: 2, from: 3, n: 1 }, { rank }), { write: null, move: null }, 'unranked is not a rank');
  const cases = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 11: '11th', 12: '12th', 13: '13th', 21: '21st', 101: '101st', 112: '112th' };
  for (const [n, word] of Object.entries(cases)) assert.equal(R.ordinal(Number(n)), word);
});
test('candidates: rank up is small, reaching 1st is big, a drop or no change is none; each change has its own id', () => {
  const up = R.rankCandidate({ ...board, saved: { rank: 2, from: 3, n: 1 } });
  assert.deepEqual([up.id, up.kind, up.scopes, up.title, up.meta, sizeOf(up.kind)], ['rank:community:guess_spread:1', 'rankUp', [SCOPES.league], 'Up to 2nd', 'Spread board · up 1', 'small']);
  const first = R.rankCandidate({ ...board, saved: { rank: 1, from: 4, n: 5 } });
  assert.deepEqual([first.kind, sizeOf(first.kind), first.title], ['rankFirst', 'big', 'You’re 1st']);
  assert.equal(R.rankCandidate({ ...board, saved: { rank: 1, from: 2, n: 6 }, tied: true }).title, 'Tied for 1st');
  assert.notEqual(R.rankCandidate({ ...board, saved: { rank: 2, from: 3, n: 3 } }).id, up.id, 'a later move to 2nd plays again');
  for (const saved of [{ rank: 3, from: 2, n: 2 }, { rank: 2, from: null, n: 0 }, null]) assert.equal(R.rankCandidate({ ...board, saved }), null);
  assert.equal(R.rankReport({ ...board, fresh: false, stored: { rank: 3, from: null }, rank: 1 }), null, 'a read that is not fresh decides nothing');
  const once = R.rankReport({ ...board, fresh: true, stored: { rank: 3, from: null }, rank: 2 }), again = R.rankReport({ ...board, fresh: true, stored: once.write, rank: 2 });
  assert.deepEqual([again.write, again.candidates.map(c => c.id)], [null, once.candidates.map(c => c.id)], 'the same list on every read until the rank moves');
});
test('through the engine: a launch read waits as NEW, plays once when League opens after the launch, and a drop is quiet', () => {
  const storage = memoryStorage(), settled = { value: false }, played = [];
  const engine = createMomentsEngine({ account: 'acct', storage, isSettled: () => settled.value, hasNavigated: () => settled.value,
    onBig: ms => played.push(...ms.map(m => `big:${m.kind}`)), onSmall: m => played.push(`small:${m.kind}`), setTimer: fn => { fn(); return 0; }, now: () => 0 });
  let stored = null;
  const read = (rank, fresh = true) => {
    const result = R.rankReport({ ...board, fresh, stored, rank });
    if (!result) return null;
    if (result.write) stored = result.write;
    engine.report(result.candidates, { source: R.rankSource(board.league, board.mode) });
    return result;
  };
  read(3);
  assert.equal(engine.newCount(SCOPES.league), 0, 'this device\'s first look seeds; nothing waits');
  read(2);
  assert.equal(engine.newCount(SCOPES.league), 1, 'up to 2nd waits as NEW on the League tile');
  engine.open(SCOPES.league)();
  assert.deepEqual(played, [], 'League showing on the launch screen plays nothing (never on page load)');
  settled.value = true;
  const opened = engine.open(SCOPES.league);
  assert.deepEqual([played, engine.newCount(SCOPES.league)], [['small:rankUp'], 0]);
  read(2);
  assert.equal(read(1, false), null);
  assert.deepEqual([played, stored], [['small:rankUp'], { rank: 2, from: 3, n: 1 }], 'never replays; a stale read writes nothing');
  read(1);
  read(4);
  assert.deepEqual(played, ['small:rankUp', 'big:rankFirst'], 'reaching 1st while League shows plays big in place; the drop stays quiet');
  opened();
});
```

4. In `'storage: { rank, from } round-trips …'`, write and expect `{ rank: 2, from: 3, n: 4 }`, and expect `readRank('k2', store)`
   to be `{ rank: 2, from: null, n: 0 }`.

In `tests/next-router.test.mjs`, add `import { leagueLayer } from '../web/src/next/league/leagueModel.js';` and append:

```js
test('D-69 League layers: board first, #feed opens the feed, and a History week is its own step that browser Back closes', async () => {
  assert.equal(leagueLayer(placeFromFragment('#play/league').adapters.league).layer, 'board');
  assert.equal(leagueLayer(placeFromFragment('#feed').adapters.league).layer, 'feed');
  const fragment = fragmentFor('play', { section: 'league', view: 'history', season: 2026, week: 8 });
  assert.equal(fragment, '#play/league?season=2026&week=8&view=history');
  assert.deepEqual(leagueLayer(placeFromFragment(fragment).adapters.league), { layer: 'week', season: 2026, week: 8 }, 'a reload reopens it');
  let state = initialState(placeFromFragment('#play/league'));
  state = reduce(state, { type: 'view', tab: 'league', patch: { view: 'history', week: null } });
  state = reduce(state, { type: 'view', tab: 'league', patch: { week: 8 } });
  assert.equal(state.trail.length, 2);
  const lip = reduce(state, { type: 'view', tab: 'league', patch: { week: null } });
  assert.deepEqual([leagueLayer(lip.views.league).layer, lip.trail.length], ['history', 1], 'the History lip lands on the place under it: Back');
  assert.equal(reduce(lip, { type: 'view', tab: 'league', patch: { season: 2025 } }).trail.length, 1, 'a season tile is a filter, not a step');
  const win = fakeWindow('https://gtl.test/#play/league?view=history'), shell = app(win);
  shell.dispatch({ type: 'view', tab: 'league', patch: { week: 8 } }); await settle();
  assert.match(win.location.hash, /week=8/);
  win.history.back(); await settle();
  assert.equal(leagueLayer(shell.state.views.league).layer, 'history', 'an entry without a week restores History, not the week left');
  win.history.forward(); await settle();
  assert.equal(shell.state.views.league.week, 8);
  shell.connection.disconnect();
});
```

Run: `node --test tests/next-league-model.test.mjs tests/next-rank-moment.test.mjs tests/next-router.test.mjs`

Expected: FAIL. `leagueModel.js` does not exist yet, `rankMoment` still returns `toast`, and the week patch is not a step.

- [ ] **Step 2: Write `web/src/next/league/leagueModel.js`**

```js
// League as plain data (D-69 step 1, Sean's P6A "board first"): the layer an address opens, the board's first rows, the
// feed's new and arriving posts, and the Play landing's League tile. Pure: no React, storage, clock or network.
import { rankTile } from '../../../../shared/guess-board.mjs';
import { DASH } from '../format.js';
import { hasNewPosts } from '../feed/feedModel.js';
import { ordinal, peekMove } from './rankMoment.js';

/** The board shows this many rows before "N more on the board"; your own row always shows. */
export const BOARD_FIRST = 6;
/** The landing shows the two newest feed items. */
export const PREVIEW_POSTS = 2;
const whole = value => (Number.isInteger(value) && value > 0 ? value : null);
const at = iso => Date.parse(iso ?? '');

/** `{ layer, season, week }`: 'feed', 'history', 'week' (History plus a week), else 'board' (board first). */
export function leagueLayer(view) {
  if (view?.view === 'feed') return { layer: 'feed', season: null, week: null };
  if (view?.view !== 'history') return { layer: 'board', season: null, week: null };
  const season = whole(view.season), week = whole(view.week);
  return { layer: week ? 'week' : 'history', season, week };
}

/** The board's market: Spread unless the address names Total or Points (D-56: Points is its own board). */
export const leagueMode = market => (market === 'total' || market === 'guess_total' ? 'guess_total'
  : market === 'points' || market === 'guess_points' ? 'guess_points' : 'guess_spread');

/** True when the place under this one (the trail's last) is League's `layer`, so its lip is Back (D-66). */
export function lipIsBack(trail, layer) {
  const prior = Array.isArray(trail) ? trail.at(-1) : null;
  return prior?.tab === 'play' && prior.view?.section === 'league' && leagueLayer(prior.adapters?.league).layer === layer;
}

/** `{ shown, more }`: the first rows plus your own row when it sits lower; `all` shows every row (nothing hidden, D-23). */
export function boardSlice(rows, all = false, first = BOARD_FIRST) {
  if (all || rows.length <= first) return { shown: rows, more: 0 };
  const mine = rows.slice(first).find(row => row.you);
  const shown = mine ? [...rows.slice(0, first), mine] : rows.slice(0, first);
  return { shown, more: rows.length - shown.length };
}

/** Ids of posts by someone else newer than `since` (the newest post this device had shown); none without it. */
export function newPostIds(posts, viewer, since) {
  const from = at(since);
  if (!Number.isFinite(from)) return new Set();
  return new Set((posts ?? []).filter(post => post.actorId !== viewer && at(post.createdAt) > from).map(post => post.id));
}

/** Posts a later read brought, newer than every post known (older pages never arrive); `known` null is the first look. */
export function postArrivals(known, posts) {
  const list = posts ?? [], newest = Math.max(-Infinity, ...list.map(post => at(post.createdAt)).filter(Number.isFinite));
  if (!known) return { known: { ids: new Set(list.map(post => post.id)), newest }, arrived: new Set() };
  const arrived = new Set(list.filter(post => !known.ids.has(post.id) && at(post.createdAt) > known.newest).map(post => post.id));
  return { known: { ids: new Set([...known.ids, ...list.map(post => post.id)]), newest: Math.max(known.newest, newest) }, arrived };
}

/**
 * The Play landing's League tile from reads the landing already makes: the Community's Spread rank (the board League opens
 * on), the move this device last saw (read only, as Home's rank tile) and "New posts". A private group shows its player
 * count from the lobby. `stored` is this device's rank record, `seen` the newest post it showed.
 */
export function leagueTile({ community = true, data = null, viewer = '', stored = null, seen = null, players = null } = {}) {
  if (!community) {
    const big = Number.isInteger(players) ? String(players) : DASH;
    return { rank: null, tied: false, big, sub: 'Players', tone: 'plain', aria: big === DASH ? 'League' : `League, ${big} players` };
  }
  const tile = rankTile({ standings: data?.standings ?? [], viewer, mode: 'guess_spread' });
  const move = peekMove(stored, { rank: tile.rank }), posts = hasNewPosts(data?.posts, viewer, seen);
  const place = tile.rank ? `${ordinal(tile.rank)}${tile.tied ? ', tied,' : ''} on the Spread board` : 'not ranked on the Spread board';
  const sub = [tile.tied ? 'Tied' : null, move > 0 ? `▲ ${move}` : move < 0 ? `▼ ${-move}` : null, posts ? 'New posts' : null].filter(Boolean).join(' · ');
  return { rank: tile.rank, tied: tile.tied, big: tile.rank ? ordinal(tile.rank) : DASH, sub: sub || 'Spread board', tone: move > 0 ? 'good' : 'plain',
    aria: `League, ${place}${move > 0 ? `, up ${move}` : move < 0 ? `, down ${-move}` : ''}${posts ? ', new posts' : ''}` };
}
```

- [ ] **Step 3: Update `web/src/next/league/rankMoment.js` and replace `useRankMoment.js`**

1. Replace the header comment (lines 1–9) with the comment and the two imports below.

```js
// The League rank moment (D-69 PICK column: rank up is small, reaching 1st is big, a drop stays quiet). When your board
// rank differs from the rank this device last saw for that league and market, the change is remembered and becomes one
// moment for the engine, which plays it where League opens after the launch, never on page load. Pure: storage is passed in.
// - Per account, league and market on this device (`gtl.next.rank.v1.…`) as `{ rank, from, n }`: the rank last seen, the
//   one before the last change (the arrow keeps saying how it went) and how many changes this device saw (each change is
//   its own moment, so a later move to the same rank plays again). The first look remembers and says nothing; unranked
//   ("—") is not a rank.
import { SCOPES } from '../moments/catalog.js';
import { AWARD_ICONS } from '../features/icons.js';
```

2. After `const rankOf = …`, add `const countOf = value => (Number.isInteger(value) && value >= 0 ? value : 0);`.
3. In `readRank`, return `{ rank, from: rankOf(value.from), n: countOf(value.n) }`.
4. In `writeRank`, stringify `{ rank: value.rank, from: rankOf(value.from), n: countOf(value.n) }`.
5. Delete `rankToast`.
6. Replace `rankMoment` and its doc comment with the code below. `rankKey`, `ordinal` and `peekMove` stay. `peekMove` ignores
   `n`, so Home's arrow is unchanged.

```js
/** What a board read does with the rank: `{ write, move }` (`write` null when nothing changes; `move` positive is up). */
export function rankMoment(stored, current) {
  const rank = rankOf(current?.rank), last = rankOf(stored?.rank), before = rankOf(stored?.from);
  if (rank === null) return { write: null, move: null };
  if (last === null) return { write: { rank, from: null, n: 0 }, move: null };
  if (last === rank) return { write: null, move: before !== null && before !== rank ? before - rank : null };
  return { write: { rank, from: last, n: countOf(stored?.n) + 1 }, move: last - rank };
}

/** The engine's source for one league's market board: the first read of it on a device seeds silently. */
export const rankSource = (league, mode) => `rank:${league || 'community'}:${mode}`;

/** The moment for the last change in `saved` (the record after a read): up is `rankUp`, reaching 1st `rankFirst`; else null. */
export function rankCandidate({ league, mode, saved, tied = false, market }) {
  const rank = rankOf(saved?.rank), from = rankOf(saved?.from);
  if (rank === null || from === null || rank >= from) return null;
  return { id: `${rankSource(league, mode)}:${countOf(saved.n)}`, kind: rank === 1 ? 'rankFirst' : 'rankUp', scopes: [SCOPES.league],
    title: rank === 1 ? (tied ? 'Tied for 1st' : 'You’re 1st') : `Up to ${ordinal(rank)}`, meta: `${market} board · up ${from - rank}`,
    icon: AWARD_ICONS.spread_winner, rarity: 'rare' };
}

/** One board read (spec 4.2 rule 1): null unless `fresh`; else `{ write, move, candidates }`, the same list until the rank moves. */
export function rankReport({ fresh, stored, rank, tied = false, league, mode, market }) {
  if (!fresh) return null;
  const step = rankMoment(stored, { rank });
  const candidate = rankCandidate({ league, mode, saved: step.write ?? stored, tied, market });
  return { write: step.write, move: step.move, candidates: candidate ? [candidate] : [] };
}
```

7. Replace all of `web/src/next/league/useRankMoment.js` with:

```js
// The League rank moment as a hook (rankMoment.js holds the rules). On each fresh confirmed read of a board it compares
// your rank with the rank this device last saw, remembers the new one and reports the change to the D-69 engine under
// SCOPES.league: it plays where League opens after the launch and shows NEW on the Play landing's League tile meanwhile.
// A drop reports nothing (losses stay quiet). The old toast is gone.
import { useEffect, useState } from 'react';
import { useMoments } from '../moments/MomentsProvider.jsx';
import { rankKey, rankReport, rankSource, readRank, writeRank } from './rankMoment.js';

/** `{ move, id }`: the places moved at the last change (positive is up, null for none) and that change's moment id. */
export function useRankMoment({ account, league, mode, rank, tied = false, read, fresh, market }) {
  const report = useMoments()?.report;
  const [state, setState] = useState({ move: null, id: null });
  useEffect(() => {
    const key = rankKey(account, league, mode);
    const result = key && read ? rankReport({ fresh, stored: readRank(key), rank, tied, league, mode, market }) : null;
    if (!result) return;
    if (result.write) writeRank(key, result.write);
    // Before the engine exists this reports nothing; when it arrives the effect runs again and derives the same moment.
    report?.(result.candidates, { source: rankSource(league, mode) });
    setState({ move: result.move, id: result.candidates[0]?.id ?? null });
  }, [account, league, mode, rank, tied, read, fresh, market, report]);
  return state;
}
```

- [ ] **Step 4: Make a History week a step in `web/src/next/shell/state.js`**

1. In `navigationPatch`, after the line
   `  || (['bets', 'league'].includes(tab) && Object.hasOwn(patch, 'view') && patch.view !== state.views[tab]?.view)`, add:

```js
  // D-69: League › History › one week is a layer, so Back closes the week. A season tile is a filter inside History.
  || (tab === 'league' && (Object.hasOwn(patch, 'view') ? patch.view : state.views.league?.view) === 'history' && Object.hasOwn(patch, 'week') && (patch.week ?? null) !== (state.views.league?.week ?? null))
```

2. Replace the line that defines `const mergeAdapters =(views, adapters) => …` with:

```js
// A restored place brings its own League week (D-69): an entry without one is History or the board, never the week left.
const mergeAdapters = (views, adapters) => Object.fromEntries(Object.entries(adapters ?? {}).map(([tab, view]) => [tab, { ...views[tab], ...(tab === 'league' ? { week: undefined } : {}), ...view }]));
```

Run: `node --test tests/next-league-model.test.mjs tests/next-rank-moment.test.mjs tests/next-router.test.mjs tests/next-shell-state.test.mjs tests/next-four-tab-navigation.test.mjs`

Expected: PASS. Both changes were checked on copies of `state.js` and `router.js`. Without the `mergeAdapters` line, browser
Back from a week stays on the week, because the merge keeps `week: 8`.

- [ ] **Step 5: Write the failing render tests**

```jsx
// tests/next-league-layers.test.jsx
// D-69 step 1 (P6A): League as Play layers, rendered statically with the reads stood in for. Contracts: the landing is
// the board first (market switch, your rank chip, the total at the end, no race strip), then the two newest posts with NEW
// on one this device had not shown, "Open the feed" and History; the feed is its own layer under the League lip; the
// Play landing's League tile shows NEW while a League moment waits. Fixture people only.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ app: null, feed: null, read: null, waiting: 0 }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), leagueApi: vi.fn(), meApi: vi.fn(), date: value => String(value) }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app }));
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => ({ model: null }) }));
vi.mock('../web/src/next/feed/useLeagueFeed.js', () => ({ useLeagueFeed: () => state.feed, feedReaderKnown: () => true }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', async original => ({ ...(await original()), useLeagueRead: () => state.read }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useMomentScope: () => {}, usePopped: () => false, useNewCount: () => state.waiting }));
vi.mock('../web/src/next/play/PlayTile.jsx', () => ({ PlayTile: ({ label, big, sub, tone, isNew, ariaLabel }) => <output data-label={label} data-big={big} data-sub={sub} data-tone={tone} data-new={String(isNew)} aria-label={ariaLabel}/> }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { LeagueScreen } = await import('../web/src/next/league/LeagueScreen.jsx');
const { LeagueTile } = await import('../web/src/next/league/LeagueTile.jsx');
const { seenKey } = await import('../web/src/next/feed/feedModel.js');
const { rankKey } = await import('../web/src/next/league/rankMoment.js');

const YOU = 'u-casey', BLAKE = 'u-blake';
const members = [{ id: YOU, displayName: 'Casey Moore' }, { id: BLAKE, displayName: 'Blake Rivers' }];
const standing = (userId, seasonPoints) => ({ userId, mode: 'guess_spread', seasonPoints, seasonScored: 6, weekPoints: 4, weekScored: 2 });
const post = (id, createdAt) => ({ id, actorId: BLAKE, kind: 'joined', season: 2026, week: 8, mode: null, leagueId: null, createdAt, reactions: { counts: {}, total: 0, mine: null }, commentCount: 0, comments: [], embed: {} });
const posts = [post('p1', '2026-11-02T18:00:00Z'), post('p2', '2026-10-30T18:00:00Z'), post('p3', '2026-10-29T18:00:00Z')];
const community = { viewer: YOU, week: { season: 2026, week: 8 }, members, posts, standings: [standing(BLAKE, 24), standing(YOU, 21.5)] };
const shell = { state: null, go: vi.fn(), back: vi.fn(), setView: vi.fn(), openSheet: vi.fn(), openPopover: vi.fn(), toast: vi.fn() };
const store = new Map();
const find = (node, test) => [...walk(node)].filter(n => n.tag && test(n));
const cls = name => n => (n.attrs.class ?? '').split(/\s+/).includes(name);
function render(node, league = {}) {
  state.app = { accountId: YOU, league: { id: 'community', name: 'Community', community: true }, leagues: [{ id: 'community', on: true, players: 2 }],
    community: { status: 'ready', data: community, error: null }, refresh: vi.fn(), requestSignIn: vi.fn(), chooseLeague: vi.fn(), mutateCommunity: vi.fn() };
  state.feed = { status: 'ready', page: { posts, members, now: '2026-11-03T00:00:00Z', next: null }, posts, next: null, busy: false, error: null, more: vi.fn(), retry: vi.fn() };
  shell.state = { views: { play: { section: 'league' }, league }, trail: [] };
  vi.stubGlobal('localStorage', { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)) });
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>).replace(/<!-- -->/g, '');
}
afterEach(() => { store.clear(); state.waiting = 0; vi.unstubAllGlobals(); });

describe('League, board first (P6A)', () => {
  it('the landing: the league\'s board, your rank chip and total, then the newest two posts with NEW, the feed and History', () => {
    store.set(seenKey(YOU, null), '2026-11-01T00:00:00Z');
    const html = render(<LeagueScreen/>);
    expect(markupProblems(html)).toEqual([]);
    const root = parseMarkup(html), mine = find(root, n => n.attrs['data-board-row'] === YOU)[0];
    expect([find(root, n => n.tag === 'h1').map(readText), readText(find(root, n => n.tag === 'h2')[0])]).toEqual([['League'], 'Community']);
    expect(find(root, n => n.attrs['aria-label'] === 'Standings market')).toHaveLength(1);
    expect(find(mine, n => n.attrs['data-board'] === 'chip').map(readText)).toEqual(['2nd']);
    expect(find(mine, n => n.attrs['data-board'] === 'total').map(readText)).toEqual(['21.5']);
    expect(find(root, cls('gx-strip'))).toHaveLength(0);
    const preview = find(root, n => n.attrs['data-league'] === 'preview')[0];
    expect(find(preview, n => n.tag === 'article').map(a => a.attrs['data-post'])).toEqual(['p1', 'p2']);
    expect(readText(preview)).toContain('1 new post');
    expect(find(preview, cls('gx-feed-new')).map(readText)).toEqual(['NEW']);
    expect(find(root, n => n.tag === 'button').map(nameFrom)).toEqual(expect.arrayContaining(['Back to Play', 'Your leagues', 'Open the feed', 'History · Seasons and weeks']));
  });
  it('the feed is its own layer under the League lip, with every post and no preview', () => {
    const root = parseMarkup(render(<LeagueScreen/>, { view: 'feed' }));
    expect(find(root, n => n.tag === 'h2').map(readText)).toEqual(['Feed']);
    expect(find(root, cls('gx-nest-lip')).map(nameFrom)).toEqual(['Back to Play', 'Back to League']);
    expect(find(root, n => n.tag === 'article')).toHaveLength(3);
    expect(find(root, n => n.attrs['data-league'] === 'preview')).toHaveLength(0);
  });
  it('the League tile: your Spread rank, the move and "New posts" from the Community read; NEW while a League moment waits', () => {
    store.set(seenKey(YOU, null), '2026-11-01T00:00:00Z');
    store.set(rankKey(YOU, 'community', 'guess_spread'), JSON.stringify({ rank: 3, from: null }));
    state.waiting = 1;
    expect(find(parseMarkup(render(<LeagueTile onOpen={vi.fn()}/>)), n => n.tag === 'output')[0].attrs).toMatchObject({ 'data-label': 'League', 'data-big': '2nd',
      'data-sub': '▲ 1 · New posts', 'data-tone': 'good', 'data-new': 'true', 'aria-label': 'League, 2nd on the Spread board, up 1, new posts' });
    state.waiting = 0;
    expect(find(parseMarkup(render(<LeagueTile onOpen={vi.fn()}/>)), n => n.tag === 'output')[0].attrs['data-new']).toBe('false');
  });
});
```

Add a test to `tests/next-feed.test.jsx`, after the reactions `describe`:

```jsx
describe('D-69 feed moments', () => {
  it('NEW marks a post this device had not shown; an arriving post rises in; nothing pops on the first render', () => {
    const html = render(<PostCard post={post('joined', { reactions: { counts: { fire: 1 }, total: 1, mine: 'fire' } })} names={names} viewer={ME} now="2026-10-26T20:00:00Z" leagueId={null} isNew arrived/>);
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('data-arrived="true"');
    expect(html).toMatch(/class="gx-pill[^"]*gx-feed-new[^"]*"[^>]*>NEW</);
    expect(html).not.toContain('data-moment');
    expect(card(post('joined'))).not.toContain('data-arrived');
  });
});
```

Run: `npx vitest run tests/next-league-layers.test.jsx tests/next-feed.test.jsx`

Expected: FAIL. There is no `LeagueTile` yet, no `data-league="preview"` and no `isNew`.

- [ ] **Step 6: Replace `web/src/next/feed/Feed.jsx`**

```jsx
// The League feed (redesign build plan stage 64; D-35, D-36, D-23; D-69 step 1). Posts newest first, friends' ballots of
// one day folded into a digest, "Show older posts" by the server's cursor. Without the server's feed reader (M-22, or
// GTL_FEATURE_OFF=feed) the feed layer draws `legacy`, the old Community feed, unchanged. LeagueScreen reads the feed
// once (useLeagueFeed) for the landing's two newest posts and the feed layer. NEW marks a post newer than this device had
// shown when League opened; a post a refresh brings rises in; once ready, the newest post counts as seen (useFeedSeen).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useShell } from '../shell/context.js';
import { Button, Card, LinkRow, Skeleton } from '../ui/index.js';
import { plural } from '../format.js';
import { LeagueFailure } from '../league/useLeagueRead.jsx';
import { PREVIEW_POSTS, postArrivals } from '../league/leagueModel.js';
import { foldPosts, readSeen, seenKey, writeSeen } from './feedModel.js';
import { DigestCard } from './DigestCard.jsx';
import { PostCard } from './PostCard.jsx';
import { feedReaderKnown } from './useLeagueFeed.js';
import './feed.css';

const NONE = new Set();
const message = error => (error?.status ? error.message : 'No connection. Reconnect and try again.');

/** Once the read is ready, the newest post someone else made counts as seen here (it clears the tile's "New posts"). */
export function useFeedSeen(account, leagueId, feed) {
  const newest = feed.posts.find(post => post.actorId !== account)?.createdAt ?? null;
  useEffect(() => { if (feed.status === 'ready' && newest) writeSeen(seenKey(account, leagueId), newest); }, [feed.status, newest, account, leagueId]);
}
/** The newest post time this device had shown when League opened, read once per account and league. */
export function useSeenSince(account, leagueId) {
  const memo = useRef(null), key = seenKey(account, leagueId);
  if (memo.current?.key !== key) memo.current = { key, at: readSeen(key) };
  return memo.current.at;
}
/** Ids of first-page posts a later read brought (they rise in); nothing on the first look or for another league. */
export function usePostArrivals(page, key) {
  const known = useRef(null), [arrived, setArrived] = useState(NONE);
  useEffect(() => {
    if (!page) return;
    const next = postArrivals(known.current?.key === key ? known.current.value : null, page.posts);
    known.current = { key, value: next.known };
    if (next.arrived.size) setArrived(next.arrived);
  }, [page, key]);
  return arrived;
}

function FeedItems({ items, names, viewer, now, leagueId, fresh, arrived }) {
  return items.map(item => (item.type === 'digest'
    ? <DigestCard key={item.key} posts={item.posts} names={names} viewer={viewer} now={now} leagueId={leagueId} fresh={fresh} arrived={arrived}/>
    : <PostCard key={`${viewer}:${item.post.id}`} post={item.post} names={names} viewer={viewer} now={now} leagueId={leagueId} isNew={fresh.has(item.post.id)} arrived={arrived.has(item.post.id)}/>));
}
const useNames = feed => useMemo(() => new Map((feed.page?.members ?? []).map(member => [member.id, member])), [feed.page]);

/** The feed layer: every post, "Show older posts", and the old Community feed while the reader is not on the server. */
export function FeedView({ feed, app, leagueId = null, leagueName = 'Community', legacy = null, fresh = NONE, arrived = NONE }) {
  const shell = useShell(), names = useNames(feed);
  if (feed.status === 'legacy' || (feed.status === 'loading' && legacy && feedReaderKnown() !== true)) return legacy;
  if (feed.status === 'loading') return <Skeleton label="Loading the feed…" shape="rows" count={4}/>;
  if (feed.status === 'error' && !feed.page) return <LeagueFailure error={feed.error} onRetry={feed.retry}/>;
  const viewer = app.accountId, items = foldPosts(feed.posts, viewer);
  return <section className="gx-vstack gx-gap-16 gx-feed" aria-label={`${leagueName} feed`}>
    <FeedItems items={items} names={names} viewer={viewer} now={feed.page?.now ?? null} leagueId={leagueId} fresh={fresh} arrived={arrived}/>
    {!items.length ? <Card className="gx-vstack gx-gap-12"><p className="gx-t-body">No posts in {leagueName} yet.</p><Button onClick={() => shell.openSheet('sh.switcher')}>Invite friends</Button></Card> : null}
    {feed.error ? <p className="gx-t-body gx-c-loss" role="alert">{message(feed.error)}</p> : null}
    {feed.next ? <Button block aria-disabled={feed.busy || undefined} onClick={feed.more}>{feed.busy ? 'Loading…' : 'Show older posts'}</Button> : null}
  </section>;
}

/** The landing's two newest feed items (P6A), how many are new, and the way into the feed layer. */
export function FeedPreview({ feed, app, leagueId = null, fresh = NONE, arrived = NONE, onOpen }) {
  const names = useNames(feed), items = feed.status === 'ready' ? foldPosts(feed.posts, app.accountId).slice(0, PREVIEW_POSTS) : [];
  return <section className="gx-vstack gx-gap-12 gx-feed" aria-label="Newest posts" data-league="preview">
    <div className="gx-hstack gx-between gx-wrap gx-gap-8"><h3 className="gx-t-strong">Feed</h3>{fresh.size ? <span className="gx-t-meta gx-c-2">{plural(fresh.size, 'new post')}</span> : null}</div>
    {feed.status === 'loading' ? <Skeleton label="Loading the feed…" shape="rows" count={2}/> : null}
    <FeedItems items={items} names={names} viewer={app.accountId} now={feed.page?.now ?? null} leagueId={leagueId} fresh={fresh} arrived={arrived}/>
    <LinkRow icon="message" onClick={onOpen}>Open the feed</LinkRow>
  </section>;
}
```

- [ ] **Step 7: Add NEW, the rise-in and the reaction pop to the cards**

`web/src/next/feed/PostCard.jsx`:
1. Add `import { useEffect, useRef, useState } from 'react';` as the first import.
2. In `ReactionRow`, after `const comments = commentButton(post);`, add:

```jsx
  // D-69: your reaction pops once when you set it (a small moment), never on the first render; reduced motion stops it.
  const mine = post.reactions?.mine ?? null, last = useRef(mine), [pop, setPop] = useState(null);
  useEffect(() => { if (mine && mine !== last.current) setPop(mine); last.current = mine; }, [mine]);
```

3. On the chip button, replace `aria-label={chip.label}` with
   `aria-label={chip.label} data-moment={pop === chip.key ? 'pop' : undefined} onAnimationEnd={() => setPop(null)}`.
4. Change the `PostCard` signature to `({ post, names, viewer, now, leagueId, isNew = false, arrived = false })`.
5. On its `<Card as="article" …>`, add `data-arrived={arrived ? 'true' : undefined}`, and append `${isNew ? ', new' : ''}`
   inside the end of its `aria-label` template.
6. Before its `<time className="gx-t-meta gx-c-2 gx-none" …>`, add `{isNew ? <Pill tone="data" className="gx-feed-new">NEW</Pill> : null}`.

`web/src/next/feed/DigestCard.jsx`:
1. Add `const NONE = new Set();` above the component.
2. Change the signature to `({ posts, names, viewer, now, leagueId, fresh = NONE, arrived = NONE })`, with
   `const isNew = posts.some(post => fresh.has(post.id));` as its first line.
3. Pass `isNew={fresh.has(post.id)} arrived={arrived.has(post.id)}` to the `PostCard` inside the open digest.
4. On the folded `<Card as="article" …>`, add `data-arrived={posts.some(post => arrived.has(post.id)) ? 'true' : undefined}`.
5. Before its `<time …>`, add the same NEW `Pill`, and add `Pill` to its `ui/index.js` import.

`web/src/next/feed/feed.css`:
1. Delete the new-posts dot comment, the `.gx .gx-feed-dot { … }` rule and the `.gx .gx-feed-dot` line in the forced-colors
   block. The Feed segment they styled is gone.
2. Append:

```css
/* D-69: NEW marks a post newer than this device had shown; a post a refresh brings rises in (transform only, once). */
.gx .gx-feed-new { flex: none; }
@media (prefers-reduced-motion: no-preference) {
  .gx .gx-feed-post[data-arrived="true"] { animation: gx-feed-rise var(--gx-dur-quick) var(--gx-ease-enter); }
}
@keyframes gx-feed-rise { from { transform: translateY(8px); } to { transform: none; } }
```

- [ ] **Step 8: Update `web/src/next/league/LeagueBoard.jsx`**

1. Update the header comment. Rows now show the rank and the face first, the season total on the right, and your rank chip
   with the last move, which pops when its engine moment plays. The board shows 6 rows with your row in view. Under D-66 the
   race strip is gone.
2. Delete `raceItems`, `RaceStrip`, `useBoardMoment`, the `Strip` import and the `race`/`raceLabel` copy. Only this file and
   the race test used them.
3. Change the imports to:

```jsx
import { useState } from 'react';
import { MODE, show } from '../../communityFormat.js';
import { boardFor } from '../../../../shared/guess-board.mjs';
import { Avatar, Badge, Button, Card, List, Move, Pill, Rank, Row } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { boardFact } from '../features/model.js';
import { usePopped } from '../moments/MomentsProvider.jsx';
import { boardSlice } from './leagueModel.js';
import { ordinal } from './rankMoment.js';
import { useRankMoment } from './useRankMoment.js';
import { LeagueEmpty } from './useLeagueRead.jsx';
```

4. In `BOARD_COPY`, replace `race` and `raceLabel` with `more: n => `${n} more on the board`,` and `fewer: 'Show fewer',`, and
   add under it:

```jsx
/** The board's fine print, behind the landing's ⓘ (D-38). */
export const BOARD_NOTES = Object.freeze({
  community: Object.freeze(['Season ranking. Spread and Total score separately.', '— means no scored result. Tied scores share their rank. Removed members keep their records.']),
  group: Object.freeze(['Only this group’s members appear here.', '— means no scored result. Tied scores share their rank.', 'Weekly guesses are reused across groups; each group keeps its own roster.']),
});
```

5. Keep `leadLine`, `RowBadges` and `communityRows` as they are.
6. Replace `BoardRow`, `BoardCard` and `CommunityBoard` with:

```jsx
/** One row: `sub` is its words ("Week: 12 · Won Week 4"); `missing` stands in for a total the server did not send ("—"). */
export function BoardRow({ row, rows, account, figure, sub = '', missing = '—', badges, badgeWeek, onBadge, move = null, momentId = null }) {
  const lead = leadLine(rows, row), popped = usePopped(momentId ?? '');
  return (
    <Row you={row.you} className={lead ? 'gx-l-row gx-l-row--lead' : 'gx-l-row'} data-board-row={row.id} data-leader={lead ? 'true' : undefined}
      start={<span className="gx-lg-start"><Rank rank={row.rank} tied={row.tied}/><Avatar id={row.id} name={row.name} size={40} you={row.you}/></span>}
      title={<><span>{row.name}{row.you ? ' · You' : ''}</span>{lead ? <Pill tone="win" className="gx-l-lead-pill">{BOARD_COPY.leader}</Pill> : null}</>}
      sub={[sub, lead].filter(Boolean).join(' · ') || null}
      end={<>
        {row.you && row.rank ? <span className="gx-lg-chip" data-board="chip" data-moment={popped ? 'pop' : undefined}>{ordinal(row.rank)}{move ? <Move by={move} className="gx-l-move"/> : null}</span> : null}
        <span className="gx-n-m gx-lg-total" data-board="total">{Number.isFinite(row.points) ? <CountUp value={row.points} account={account} figure={figure}/> : missing}</span>
      </>}>
      <RowBadges week={badgeWeek} badges={badges} name={row.name} you={row.you} onBadge={badge => onBadge?.(badge, row.id)}/>
    </Row>
  );
}

/** A board: the first rows (yours in view), "N more on the board", and your rank's moment from `read` when it is `fresh`. */
export function BoardCard({ app, shell, league, mode, rows, label, features, rowProps, read = null, fresh = false }) {
  const [all, setAll] = useState(false), mine = rows.find(row => row.you) ?? null;
  const moment = useRankMoment({ account: app?.accountId ?? null, league, mode, rank: mine?.rank ?? null, tied: mine?.tied === true, read, fresh, market: MODE[mode] });
  if (!rows.length) return <LeagueEmpty text={BOARD_COPY.noMembers} actionLabel={BOARD_COPY.invite} onAction={() => shell?.openSheet?.('sh.switcher')}/>;
  const { shown, more } = boardSlice(rows, all), badgeWeek = features?.badgeWeek ?? null;
  return <>
    <Card variant="flush" className="gx-l-board" data-board={mode}>
      <List label={label}>
        {shown.map(row => <BoardRow key={row.id} row={row} rows={rows} account={app?.accountId ?? null} badgeWeek={badgeWeek}
          badges={features?.weekBadgesOf?.(row.id) ?? []} onBadge={(badge, userId) => shell?.openSheet?.('sh.badge', { badge, userId })}
          move={row.you ? moment.move : null} momentId={row.you ? moment.id : null} {...rowProps(row)}/>)}
      </List>
    </Card>
    {more > 0 || all ? <Button variant="ghost" className="gx-lg-more" aria-expanded={all} onClick={() => setAll(open => !open)}>{all ? BOARD_COPY.fewer : BOARD_COPY.more(more)}</Button> : null}
  </>;
}

/** The Community board for one market (Spread or Total); its fine print is BOARD_NOTES.community. */
export function CommunityBoard({ feed, mode, features = null, app, shell, fresh = false }) {
  const standings = feed.standings || [];
  return <section className="gx-vstack gx-gap-12" aria-label={`${MODE[mode]} leaderboard`}>
    <BoardCard app={app} shell={shell} league="community" mode={mode} rows={communityRows(feed, mode)} label={`${MODE[mode]} season standings`} features={features} read={feed} fresh={fresh}
      rowProps={row => {
        const standing = standings.find(item => item.userId === row.id && item.mode === mode);
        const removed = feed.members?.find(member => member.id === row.id)?.removed, fact = boardFact(features, row.id, mode);
        return { figure: `community.${mode}.season.${row.id}`, sub: `${removed ? 'Removed · ' : ''}Week: ${standing?.satOut ? 'Sat out' : standing?.weekScored > 0 ? show(standing.weekPoints) : '—'}${fact ? ` · ${fact}` : ''}` };
      }}/>
  </section>;
}
```

7. In `league.css`, delete `.gx .gx-l-race`, the `.gx-l-move--fresh` animation, `@keyframes gx-l-move-pop` and both of
   their reduced-motion rules. The chip pops through `[data-moment="pop"]` in `moments.css`. Append:

```css
/* ----- D-69 step 1 (P6A): board first. A row: rank and face first, the total on the right, your rank chip. ----- */
.gx .gx-lg-start { display: flex; flex: none; align-items: center; gap: var(--gx-space-2); }
.gx .gx-lg-chip { display: inline-flex; align-items: center; gap: var(--gx-space-1); min-height: 28px; padding: 0 var(--gx-space-2); border-radius: var(--gx-radius-pill); background: var(--gx-surface-2); color: var(--gx-text-1); font: 600 14px/20px var(--gx-font-num); font-variant-numeric: tabular-nums; }
.gx .gx-lg-total { min-width: 3ch; text-align: right; }
.gx .gx-lg-more { align-self: flex-start; }
@media (forced-colors: active) { .gx .gx-lg-chip { border: 1px solid CanvasText; } }
```

- [ ] **Step 9: Rebuild `web/src/next/league/LeagueScreen.jsx`**

1. Rewrite the header comment. League is a Play layer, board first. The landing is the board, the recap, the two newest
   posts and "Open the feed", then History. The feed and History are layers with their own addresses. The hosted-reader
   rules from today's comment stay.
2. In the imports:
   - add `communityPlayers` to the `../data/league.js` import;
   - set the `ui/index.js` import to `Avatar, Button, Card, InfoButton, LinkRow, Matchup, Segmented`;
   - change the `./LeagueBoard.jsx` import to `BOARD_NOTES, BoardCard, CommunityBoard`;
   - replace the `../feed/Feed.jsx` import with the imports below.

```jsx
import { PlayLayer } from '../play/PlayLayer.jsx';
import { FeedPreview, FeedView, useFeedSeen, usePostArrivals, useSeenSince } from '../feed/Feed.jsx';
import { useLeagueFeed } from '../feed/useLeagueFeed.js';
import { leagueLayer, leagueMode, lipIsBack, newPostIds } from './leagueModel.js';
import { SCOPES } from '../moments/catalog.js';
```

3. Keep `MARKETS`, `message`, the draft helpers, `postText`, `FeedPost` and `CommunityFeed` unchanged.
4. In `PrivateLeague`, keep its read, its three guards and its `rows` computation exactly as they are. It now returns only
   the group's board; the landing draws the heading, the Feed and the recap. Replace its `return` with:

```jsx
  return <section className="gx-vstack gx-gap-12" aria-label="Private league standings">
    <p className="gx-t-meta gx-c-2">Week {data.league.week}{data.league.practice ? ' · Practice results · unofficial' : ''}</p>
    <BoardCard app={app} shell={shell} league={id} mode={mode} rows={rows} label="Private group members" features={features} read={data} fresh
      rowProps={row => ({ figure: `${id}.${mode}.points.${row.id}`, sub: `${row.source.satOut ? 'Sat out' : row.source.submitted ? 'Submitted' : 'Not submitted'}${row.points === null ? ' · Not scored yet' : ''}` })}/>
  </section>;
```

5. Replace `LeagueScreen` with:

```jsx
export const LEAGUE_COPY = Object.freeze({
  heading: 'League', switcher: 'Your leagues', feed: 'Feed', history: 'History', seasons: 'Seasons and weeks',
  communityHistory: 'Community history', about: 'About the board', loading: 'Loading the Community…', members: n => `${n} member${n === 1 ? '' : 's'}`,
});

/** The landing (P6A): the board for the market showing, the recap, the two newest posts, then History. */
function BoardLanding({ app, shell, mode, features, feed, fresh, arrived, waiting, set }) {
  const community = app.league.community === true, data = app.community.data;
  const players = community ? communityPlayers(data) : app.leagues?.find(row => row.on)?.players ?? null;
  const meta = [Number.isInteger(players) ? LEAGUE_COPY.members(players) : null, community && data?.week ? `Week ${data.week.week}` : null].filter(Boolean).join(' · ');
  const board = waiting ?? (mode === 'guess_points' ? <PointsBoard key={`${app.accountId}:${app.league.id}`} app={app} groupId={community ? null : app.league.id}/>
    : community ? <CommunityBoard feed={data} mode={mode} features={features} app={app} shell={shell} fresh={app.community.status === 'ready' && !app.community.error}/>
    : <PrivateLeague key={`${app.accountId}:${app.league.id}`} app={app} shell={shell} mode={mode} features={features}/>);
  // History is Community-wide: from a group it switches to the Community, as today's "Open Community feed and history" did.
  const history = () => { if (!community) app.chooseLeague(COMMUNITY); set({ view: 'history', week: null }); };
  return <PlayLayer label="League board" layer="league" title={app.league.name} info={<InfoButton title={LEAGUE_COPY.about} body={community ? BOARD_NOTES.community : BOARD_NOTES.group}/>}>
    {meta ? <p className="gx-t-meta gx-c-2">{meta}</p> : null}
    <Segmented label="Standings market" options={MARKETS} value={mode} onChange={value => set({ market: value })}/>
    {board}
    <RecapPost model={features}/>
    <FeedPreview feed={feed} app={app} leagueId={community ? null : app.league.id} fresh={fresh} arrived={arrived} onOpen={() => set({ view: 'feed' })}/>
    <LinkRow icon="clock" onClick={history}>{community ? <>{LEAGUE_COPY.history}<span className="gx-t-meta gx-c-2"> · {LEAGUE_COPY.seasons}</span></> : LEAGUE_COPY.communityHistory}</LinkRow>
  </PlayLayer>;
}

export function LeagueScreen() {
  useMomentScope(SCOPES.league);
  const app = useAppData(), shell = useShell(), view = shell.state.views.league || {};
  const place = leagueLayer(view), mode = leagueMode(view.market);
  const community = app.league.community === true, leagueId = community ? null : app.league.id;
  const features = useFeatures(app, shell);
  const feed = useLeagueFeed({ accountId: app.accountId, leagueId, onRefused: error => { if (error.status === 401) app.requestSignIn?.(); else if (community) app.refresh({ only: ['community'] }); } });
  useFeedSeen(app.accountId, leagueId, feed);
  const since = useSeenSince(app.accountId, leagueId), arrived = usePostArrivals(feed.page, `${app.accountId}:${leagueId ?? 'community'}`);
  const fresh = newPostIds(feed.posts, app.accountId, since);
  const set = patch => shell.setView('league', patch);
  // A lip is Back when its layer is the place underneath (D-66), else a step to it.
  const lip = (key, label, layer, patch) => ({ key, label, open: () => (lipIsBack(shell.state.trail, layer) ? shell.back() : set(patch)) });
  const toBoard = lip('league', LEAGUE_COPY.heading, 'board', { view: 'board', week: null });
  const waiting = community && !app.community.data ? app.community.error ? <LeagueFailure error={app.community.error} onRetry={() => app.refresh({ only: ['community'] })}/> : <LeagueLoading label={LEAGUE_COPY.loading}/> : null;
  let body;
  if (place.layer === 'feed') {
    body = <PlayLayer label="League feed" parents={[toBoard]} layer="league:feed" title={LEAGUE_COPY.feed}>
      {waiting ?? <FeedView feed={feed} app={app} leagueId={leagueId} leagueName={app.league.name} fresh={fresh} arrived={arrived}
        legacy={community ? <CommunityFeed key={app.accountId} feed={app.community.data} app={app}/> : null}/>}
    </PlayLayer>;
  } else if (community && place.layer !== 'board') {
    // Task 6b replaces this with the rebuilt History (season tiles › week tiles › a week layer).
    body = <PlayLayer label="League history" parents={[toBoard]} layer="league:history" title={LEAGUE_COPY.history}><LeagueHistory key={app.accountId} app={app}/></PlayLayer>;
  } else {
    body = <BoardLanding app={app} shell={shell} mode={mode} features={features.model} feed={feed} fresh={fresh} arrived={arrived} waiting={waiting} set={set}/>;
  }
  return <div className="gx-screen gx-league">
    <div className="gx-league-heading"><div className="gx-hstack gx-between gx-wrap gx-gap-8"><h1 className="gx-t-title">{LEAGUE_COPY.heading}</h1><Button variant="ghost" onClick={() => shell.openSheet('sh.switcher')}>{LEAGUE_COPY.switcher}</Button></div></div>
    {body}
  </div>;
}
```

- [ ] **Step 10: Write `web/src/next/league/LeagueTile.jsx`**

```jsx
// Play landing › League (D-69 step 1, P1B): your rank on the board League opens by default (the Community's Spread board),
// the move this device last saw and "New posts", from the reads the landing already makes (the Community read; a group's
// player count from the lobby). It reports the Spread rank moment from that read and shows NEW while a League moment waits.
import { useMemo } from 'react';
import { useAppData } from '../data/AppData.jsx';
import { useNewCount } from '../moments/MomentsProvider.jsx';
import { SCOPES } from '../moments/catalog.js';
import { PlayTile } from '../play/PlayTile.jsx';
import { readSeen, seenKey } from '../feed/feedModel.js';
import { leagueTile } from './leagueModel.js';
import { rankKey, readRank } from './rankMoment.js';
import { useRankMoment } from './useRankMoment.js';

export function LeagueTile({ onOpen }) {
  const app = useAppData(), viewer = app.accountId, community = app.league.community === true, read = app.community;
  const players = app.leagues?.find(row => row.on)?.players ?? null;
  const tile = useMemo(() => leagueTile({ community, data: read.data, viewer, players,
    stored: readRank(rankKey(viewer, 'community', 'guess_spread')), seen: readSeen(seenKey(viewer, null)) }), [community, read.data, viewer, players]);
  useRankMoment({ account: viewer, league: 'community', mode: 'guess_spread', rank: tile.rank, tied: tile.tied, market: 'Spread',
    read: community ? read.data : null, fresh: community && read.status === 'ready' && !read.error });
  const isNew = useNewCount(SCOPES.league) > 0;
  return <PlayTile label="League" icon="trophy" big={tile.big} sub={tile.sub} tone={tile.tone} isNew={isNew} onClick={onOpen} ariaLabel={tile.aria}/>;
}
```

- [ ] **Step 11: Update the existing tests this changes**

`tests/next-design-home-league.test.jsx`. The race strip is gone and the total moved to the row's end.
1. Drop `raceItems` from the `LeagueBoard.jsx` import.
2. In "every row leads with a 40px face …", replace `expect(shown(rows[3])).toContain('Season: —');` with
   `expect(nodes(rows[3], attr('data-board', 'total')).map(textOf)).toEqual(['—']);`, and add
   `expect(nodes(rows[1], attr('data-board', 'chip')).map(textOf)).toEqual(['2nd']);`.
3. Replace the race-strip test with:

```jsx
  it('D-66: no race strip (the rows are the board\'s one picture); past six rows, "N more on the board" keeps the rest in reach', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => `u-${id}`);
    const html = render(<CommunityBoard feed={{ viewer: YOU, week: null, members: [...many, YOU].map(id => ({ id, displayName: id === YOU ? 'Casey Moore' : id, removed: false })),
      standings: [...many.map((id, i) => row(id, 'guess_spread', 30 - i)), row(YOU, 'guess_spread', 1)] }} mode="guess_spread" features={null} app={{ accountId: YOU }} shell={shell}/>);
    expect(nodes(html, hasClass('gx-strip'))).toHaveLength(0);
    expect(nodes(html, n => n.attrs['data-board-row']).map(r => r.attrs['data-board-row'])).toEqual([...many.slice(0, 6), YOU]);
    expect(nodes(html, n => n.tag === 'button' && n.attrs['aria-expanded'] === 'false').map(textOf)).toEqual(['2 more on the board']);
  });
```

`tests/next-points-feed.test.jsx`. The landing is now the board, so these posts live in the feed layer.
1. In the `useShell` mock, use `state: { views: { league: { view: 'feed' } }, trail: [] }, back: vi.fn()`.
2. In the `useLeagueRead.jsx` mock, add `LeagueLoading: () => null, LeagueEmpty: () => null`.

`tests/cloud-browser/next-design-home-league.spec.js`. The toast becomes the engine's moment, which never plays on page load.
1. Add `import { momentsKey } from '../../web/src/next/moments/seen.js';`.
2. In the header comment, item 2 becomes "the rank moment: nothing on page load, the arrow in your chip, then once when
   League opens after the launch (1st is big), a drop quiet". Item 4 says "no race strip".
3. In "reduced motion: …", replace the four lines from `// The rank's arrow is drawn …` through
   `toHaveText(/You moved up to 1st/)` with:
   - `await expect(board.locator(`[data-board-row="${LUKE}"] .gx-move`)).toHaveText('▲1up 1');`
   - `await expect(board.locator('[data-moment="pop"]')).toHaveCount(0);`
   - `await expect(page.locator('.gx-toast')).toHaveCount(0);`
4. In the "League board: faces, … race strip … toast per change" test:
   - Rename it to "League board: faces, the leader, week badges and counting totals; reaching 1st waits on the launch, then
     plays once".
   - Add `[momentsKey(LUKE)]: JSON.stringify(['source:rank:community:guess_spread'])` to the `openAs` storage, so the device
     has read this board before. Then add
     `const luke = board.locator(`[data-board-row="${LUKE}"]`), flash = page.getByRole('dialog', { name: 'You’re 1st' });`.
   - Replace the toast block (`// 2. The rank-change moment …` through the `{ rank: 1, from: 3 }` check) with:
     - `await expect(luke.locator('[data-board="chip"] .gx-move')).toHaveText('▲2up 2');`
     - `await expect(luke.locator('[data-board="chip"]')).toContainText('1st');`
     - the stored-record check, now expecting `{ rank: 1, from: 3, n: 1 }`;
     - `await page.waitForTimeout(800); await expect(flash).toHaveCount(0); await expect(page.locator('.gx-toast')).toHaveCount(0);`
   - Delete the old `const luke = …` line.
   - Replace `toContainText('Season: 20 · Won Week 4 · Leads by 8')` with `toContainText('· Won Week 4 · Leads by 8')`, and add
     `await expect(luke.locator('[data-board="total"]')).toHaveText('20');`.
   - Replace the `[data-board="race"]` line with `await expect(page.locator('.gx-strip')).toHaveCount(0);`.
   - After the `counted.every(…)` check (that is when League was opened again after Home), add
     `await expect(flash).toBeVisible(); await expect(flash).toContainText('Spread board · up 2'); await flash.getByRole('button', { name: 'Nice' }).click();`.
   - Replace `.gx-row-sub` with `[data-board="total"]` and `toContainText('Season: —')` with `toHaveText('—')` in Sean's check.
   - Delete the toast-leaves line.
   - After the reload, replace the two toast checks with `await page.waitForTimeout(800); await expect(flash).toHaveCount(0);`.
5. Rename "a drop reads 'Down to 2nd' once …" to "League board: a drop stays quiet". In it:
   - add `[momentsKey(TROY)]: JSON.stringify(['source:rank:community:guess_spread'])` to the storage;
   - delete the `Down to 2nd` toast check;
   - before the Total switch, add `await tab(page, 'Home').click(); await page.evaluate(() => { location.hash = '#play/league?view=board'; }); await expect(troy).toBeVisible(); await page.waitForTimeout(800);`
     and `await expect(page.locator('.gx-toast')).toHaveCount(0); await expect(page.locator('[role="dialog"]')).toHaveCount(0); await expect(troy.locator('[data-moment="pop"]')).toHaveCount(0);`;
   - delete the two remaining toast checks.

`tests/cloud-browser/next-league-live.spec.js`:
1. Replace the `section` helper with `const toBoard = page => page.getByRole('button', { name: 'Back to League', exact: true });`.
2. In test 1, `section(page, 'Boards').click()` becomes `toBoard(page).click()`, and `section(page, 'Feed').click()` becomes
   `page.getByRole('button', { name: 'Open the feed', exact: true }).click()`.
3. In test 3, `section(page, 'History').click()` becomes
   `toBoard(page).click(); await page.getByRole('button', { name: /^History/ }).click()`.
4. In test 4, replace the "Refresh group" click with `await page.evaluate(() => window.dispatchEvent(new Event('online')));`.

`tests/cloud-browser/next-play-live.spec.js`: the `'League sections'` visibility check becomes
`await expect(page.getByRole('heading', { name: 'Feed', level: 2 })).toBeVisible();`.

`tests/cloud-browser/next-points.spec.js`: delete the `'League sections'` › `'Boards'` click. The landing is the board.

- [ ] **Step 12: Run, then commit**

```
node --test tests/next-league-model.test.mjs tests/next-rank-moment.test.mjs tests/next-router.test.mjs tests/next-shell-state.test.mjs tests/next-four-tab-navigation.test.mjs tests/next-tokens.test.mjs tests/next-app-view.test.mjs
npx vitest run tests/next-league-layers.test.jsx tests/next-feed.test.jsx tests/next-design-home-league.test.jsx tests/next-points-feed.test.jsx tests/next-home-ui.test.jsx tests/next-matchup-marks.test.jsx
npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-design-home-league.spec.js tests/cloud-browser/next-league-live.spec.js tests/cloud-browser/next-feed.spec.js tests/cloud-browser/next-reactions.spec.js tests/cloud-browser/next-shell.spec.js tests/cloud-browser/next-points.spec.js tests/cloud-browser/next-play-live.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js
node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run
```

Expected: all PASS, and the Playwright report says `skipped 0`.

```bash
git add web/src/next/league/{leagueModel.js,LeagueTile.jsx,rankMoment.js,useRankMoment.js,LeagueBoard.jsx,LeagueScreen.jsx,league.css} web/src/next/feed/{Feed.jsx,PostCard.jsx,DigestCard.jsx,feed.css} web/src/next/shell/state.js tests/next-league-model.test.mjs tests/next-league-layers.test.jsx tests/next-rank-moment.test.mjs tests/next-router.test.mjs tests/next-design-home-league.test.jsx tests/next-points-feed.test.jsx tests/next-feed.test.jsx tests/cloud-browser/{next-design-home-league,next-league-live,next-play-live,next-points}.spec.js
git diff --cached --stat && git ls-files --eol web/src/next/league web/src/next/feed tests/next-league-model.test.mjs tests/next-league-layers.test.jsx
git commit -m "League board first: feed layer, rank moments through the engine, the League tile (P6A)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6b: League History rebuilt as season tiles › week tiles › a week layer

**Files:**
- Create: `web/src/next/league/historyModel.js`, `tests/next-league-history.test.mjs`.
- Replace: `web/src/next/league/LeagueHistory.jsx`. It stops importing `web/src/CommunityHistory.jsx` (spec test 13).
- Modify: `web/src/next/league/LeagueScreen.jsx` (the history branch) and `league.css`.
- Tests modified: `tests/next-app-view.test.mjs`, `next-matchup-marks.test.jsx`, `next-league-layers.test.jsx`, and
  `tests/cloud-browser/{next-league-live,next-design-home-league,next-phone-layout,next-scroll-navigation}.spec.js`.

**Interfaces:**
- `historyModel.js`:
  - `lineWords(reference, mode, game) → { value, notes }` covers every branch of `HistoryLine`.
  - It also exports `gapPhrase`, `entryOf`, `weekSummary(entry) → { status, points, notes }`,
    `weekRank → { rank, of } | null`, `weekTiles`, `seasonTiles → tiles | null` and `weekGame`.
- `LeagueHistory({ app, place, mode, parents, historyLip, onPlace, onScore })` is one component for both layers, so the read
  is shared.
  - History shows player face chips (you first, removed members listed, D-23), the "History market" switch, season tiles
    once there is a second season, and week tiles. The switch is the league `market` key, shared with the board.
  - The week layer shows the week's games as disclosures. The entry's stored-time note, ruling and revisions sit behind ⓘ.
    Your own week adds "Every game in Your score".

- [ ] **Step 1: Write the failing tests**

```js
// tests/next-league-history.test.mjs
// D-69 step 1 (P6A): League › History as plain data (web/src/next/league/historyModel.js). Contracts: every line note the
// old screen (CommunityHistory.jsx HistoryLine) showed stays (D-23); a withheld game is "Hidden" with no number (D-31);
// a week tile's rank is the shared competition rank of that week's points; no ballot and a sit-out are words, never 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineWords, seasonTiles, weekGame, weekRank, weekSummary, weekTiles } from '../web/src/next/league/historyModel.js';

const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-09T00:15:00Z' };
const entry = (userId, weekPoints, patch = {}) => ({ userId, mode: 'guess_spread', status: 'submitted', eligible: true, weekPoints, weekScored: 2, ...patch });
const week = { season: 2026, week: 5, games: [game], results: { 'SEA-DEN': { status: 'final', away: 20, home: 17, source: 'Fixture final', origin: 'settlement' } },
  entries: [entry('a', 15), entry('b', 15), entry('c', 9), entry('d', null, { status: 'sat_out' })] };

test('the line keeps every note the old screen showed (D-23)', () => {
  assert.deepEqual(lineWords(null, 'guess_spread', game), { value: '—', notes: ['No line saved · draft'] });
  assert.deepEqual(lineWords({ basis: 'saved', status: 'pending', value: null, savedAt: '2026-10-08T18:00:00Z' }, 'guess_spread', game),
    { value: '—', notes: ['Pending · the first line after submission becomes this guess\'s reference', 'Saved Thu Oct 8, 11:00 AM PT'] });
  const imported = lineWords({ basis: 'line-at-guess', origin: 'imported-reference', value: 2.5, source: 'Fixture archive', sourceFile: 'data/snapshots/w5.json',
    observedAt: '2026-10-08T17:00:00Z', capturedAt: '2026-10-08T19:00:00Z', gapSeconds: 3600 }, 'guess_spread', game);
  assert.deepEqual(imported, { value: 'Seahawks −2.5', notes: ['Line at guess', 'Fixture archive · w5.json',
    'Provisional · page time as published by the source; captured Thu Oct 8, 12:00 PM PT', 'Observed Thu Oct 8, 10:00 AM PT · 1h 0m before the guess'] });
  assert.deepEqual(lineWords({ basis: 'commissioner-ruled', value: -8.5, decision: 'D-25' }, 'guess_spread', game), { value: 'Broncos −8.5', notes: ['Commissioner-ruled line (D-25)'] });
  assert.equal(lineWords({ basis: 'nearest-snapshot', value: 44 }, 'guess_total', game).notes[0], 'Nearest snapshot at submission · not used for points');
  assert.deepEqual(lineWords({ basis: 'none', reason: 'guess-at-or-after-kickoff' }, 'guess_spread', game), { value: '—', notes: ['No line stored', 'Guessed at or after kickoff'] });
  assert.deepEqual(lineWords({ basis: 'none', reason: null }, 'guess_spread', game).notes, ['No line stored', 'No snapshot was collected for this week']);
});
test('a withheld game is "Hidden" with no guess, line or points; a shown one keeps kickoff, the line\'s notes and the final', () => {
  const hidden = weekGame(week, { ...entry('b', 15), picksHidden: true, picks: [{ gameId: 'SEA-DEN', hidden: true, guess: null, reference: null, points: null }] }, game, 'guess_spread');
  assert.deepEqual([hidden.guess, hidden.line, hidden.points, hidden.hidden], ['Hidden', 'Hidden', 'Hidden', true]);
  assert.doesNotMatch(JSON.stringify(hidden), /\d+ \/ 10|−/);
  const shown = weekGame(week, { ...entry('a', 15), picks: [{ gameId: 'SEA-DEN', guess: -3, points: 10, reference: { basis: 'saved', status: 'available', value: -3, source: 'Fixture median' } }] }, game, 'guess_spread');
  assert.deepEqual([shown.guess, shown.line, shown.points], ['Broncos −3', 'Broncos −3', '10 / 10']);
  assert.deepEqual(shown.notes, ['Kickoff Thu Oct 8, 5:15 PM PT', 'Line saved with guess', 'Fixture median', 'Final · SEA 20, DEN 17 · Fixture final']);
  assert.equal(weekGame(week, { ...entry('a', 0), eligible: false, picks: [{ gameId: 'SEA-DEN', guess: 1, points: null, reference: null }] }, game, 'guess_spread').points, 'Not scored');
});
test('week tiles: the week\'s points and its shared rank; a sit-out and no ballot are words, never 0', () => {
  assert.deepEqual([weekRank(week, 'b', 'guess_spread'), weekRank(week, 'c', 'guess_spread'), weekRank(week, 'd', 'guess_spread')], [{ rank: 1, of: 3 }, { rank: 3, of: 3 }, null]);
  const data = { weeks: [week, { ...week, week: 4, entries: [] }] };
  assert.deepEqual(weekTiles(data, 'a', 'guess_spread').map(t => [t.label, t.big, t.sub, t.aria]), [
    ['Week 4', '—', 'No ballot', 'Week 4, no points, No ballot'], ['Week 5', '15', '1st', 'Week 5, 15 points, 1st of 3']]);
  assert.equal(weekTiles(data, 'd', 'guess_spread').at(-1).sub, 'Sat out');
});
test('the week\'s words: status, Late and points on the surface; the time note, ruling and revisions behind ⓘ', () => {
  assert.deepEqual(weekSummary({ ...entry('a', 15), submittedAt: '2026-10-08T18:00:00Z', late: { minutes: 12 }, submittedAtKnown: false, ruling: { decision: 'D-25' }, updatedAt: '2026-10-08T18:00:00Z', revisions: 2 }),
    { status: 'Submitted · Thu Oct 8, 11:00 AM PT · Late · 12 min', points: '15 pts · 2 games scored',
      notes: ['Original submission time was not recorded; the stored time is shown.', 'Commissioner ruling · D-25', 'Last saved Thu Oct 8, 11:00 AM PT · 2 revisions'] });
  assert.equal(weekSummary(null).status, 'No ballot.');
  assert.equal(weekSummary(entry('d', null, { status: 'sat_out' })).status, 'Sat out. Recorded as sat out, not zero.');
  assert.equal(weekSummary(entry('a', 0, { eligible: false })).points, 'Not eligible for scoring');
});
test('season tiles appear only with a second season, newest first, the one showing marked in words', () => {
  assert.equal(seasonTiles({ season: 2026, seasons: [2026] }), null);
  assert.deepEqual(seasonTiles({ season: 2026, seasons: [2025, 2026] }).map(t => [t.big, t.sub, t.on]), [['2026', 'Showing', true], ['2025', 'See weeks', false]]);
});
```

Append to `tests/next-league-layers.test.jsx`:

```jsx
describe('League › History (P6A)', () => {
  const SEA = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-09T00:15:00Z' }, BUF = { id: 'BUF-KC', awayCode: 'BUF', homeCode: 'KC', kickoff: '2026-10-12T20:25:00Z' };
  const HISTORY = { viewer: YOU, season: 2026, seasons: [2026], members, weeks: [{ season: 2026, week: 5, games: [SEA, BUF],
    results: { 'SEA-DEN': { status: 'final', away: 20, home: 17, source: 'Fixture final', origin: 'settlement' } }, entries: [
      { userId: YOU, mode: 'guess_spread', status: 'submitted', submittedAt: '2026-10-08T18:00:00Z', eligible: true, weekPoints: 15, weekScored: 2, games: 2, picks: [
        { gameId: 'SEA-DEN', guess: -3, points: 10, reference: { basis: 'saved', status: 'available', value: -3, source: 'Fixture median' } },
        { gameId: 'BUF-KC', guess: 2.5, points: 5, reference: { basis: 'commissioner-ruled', value: 0, decision: 'D-25' } }] },
      { userId: BLAKE, mode: 'guess_spread', status: 'submitted', eligible: true, weekPoints: 12, weekScored: 2, games: 2, picksHidden: true, picks: null }] }] };
  it('History: you first among the player chips, and week tiles with the week\'s points and shared rank', () => {
    state.read = { loading: false, error: null, data: HISTORY, retry: vi.fn() };
    const html = render(<LeagueScreen/>, { view: 'history' });
    expect(markupProblems(html)).toEqual([]);
    const root = parseMarkup(html);
    expect(find(root, n => n.tag === 'h2').map(readText)).toEqual(['History · Spread']);
    expect(find(find(root, n => n.attrs['aria-label'] === 'Player')[0], n => n.tag === 'button').map(readText)).toEqual(['You', 'Blake Rivers']); // faces are aria-hidden
    expect(find(root, n => n.tag === 'button' && n.attrs['aria-label']?.startsWith('Week ')).map(n => n.attrs['aria-label'])).toEqual(['Week 5, 15 points, 1st of 2']);
  });
  it('a week layer: each game a disclosure with the line\'s fine print, and Your score for your own week', () => {
    state.read = { loading: false, error: null, data: HISTORY, retry: vi.fn() };
    const html = render(<LeagueScreen/>, { view: 'history', week: 5 });
    expect(markupProblems(html)).toEqual([]);
    const root = parseMarkup(html), games = find(root, n => n.tag === 'details');
    expect(readText(find(root, n => n.tag === 'h2')[0])).toBe('Week 5 · 2026');
    expect(find(root, cls('gx-nest-lip')).map(nameFrom)).toEqual(['Back to Play', 'Back to League', 'Back to History']);
    expect(games.map(g => nameFrom(find(g, n => n.tag === 'summary')[0]))).toEqual([
      'Seattle Seahawks at Denver Broncos · Line Broncos −3 · You Broncos −3 · 10 / 10', 'Buffalo Bills at Kansas City Chiefs · Line Even · You Bills −2.5 · 5 / 10']);
    expect([readText(games[0]), readText(games[1])]).toEqual([expect.stringContaining('Final · SEA 20, DEN 17 · Fixture final'), expect.stringContaining('Commissioner-ruled line (D-25)')]);
    expect(find(root, n => n.tag === 'button').map(nameFrom)).toContain('Every game in Your score');
  });
});
```

`tests/next-app-view.test.mjs` (spec test 13: no new-app file may import the old history screen):
1. Delete `'CommunityHistory.jsx': ['HistoryLine'], ` from `namedOnly`.
2. Delete the line `        if (target === 'CommunityHistory.jsx') assert.equal(file, 'web/src/next/league/LeagueHistory.jsx');`.

In `tests/next-matchup-marks.test.jsx`, render
`<LeagueHistory app={{ accountId: YOU, refresh: vi.fn() }} place={{ layer: 'week', season: null, week: 6 }} mode="guess_spread" parents={[]} onPlace={vi.fn()} onScore={vi.fn()}/>`
and expect `nameFrom(summary)` to be `'Seattle Seahawks at Denver Broncos · Line — · You Broncos −3 · 8 / 10'`.

Run: `node --test tests/next-league-history.test.mjs tests/next-app-view.test.mjs && npx vitest run tests/next-league-layers.test.jsx tests/next-matchup-marks.test.jsx`

Expected: FAIL. `historyModel.js` does not exist yet, and LeagueHistory still imports `CommunityHistory.jsx`.

- [ ] **Step 2: Write `web/src/next/league/historyModel.js`**

```js
// League › History as plain data (D-69 step 1, P6A). Pure: it words only what /community/history sent (cloud/community.mjs
// normalizeHistory) and keeps every value the old screen (CommunityHistory.jsx HistoryLine, the first LeagueHistory)
// showed (D-23). Another member's withheld game reads "Hidden", never a number (D-31, D-39). A week's rank is the
// competition rank of its points (ties share).
import { lateText, pickText, show } from '../../communityFormat.js';
import { DASH, fmtFull } from '../format.js';
import { ordinal } from './rankMoment.js';

const NONE_REASONS = Object.freeze({
  'submission-time-unavailable': 'No readable submission time is stored, so no line at the guess can be chosen',
  'guess-at-or-after-kickoff': 'Guessed at or after kickoff',
  'no-schedule-template': 'No schedule entry for this game',
});
const fileName = path => path.split('/').pop();

/** How long before or after the guess a line was observed: "4h 40m before the guess", "at the guess"; '' without one. */
export function gapPhrase(seconds, anchor = 'the guess') {
  if (!Number.isFinite(seconds)) return '';
  if (seconds === 0) return `at ${anchor}`;
  const minutes = Math.round(Math.abs(seconds) / 60), hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  const span = days >= 1 ? `${days}d ${hours % 24}h` : hours >= 1 ? `${hours}h ${minutes % 60}m` : minutes >= 1 ? `${minutes}m` : 'under a minute';
  return `${span} ${seconds > 0 ? 'before' : 'after'} ${anchor}`;
}

/** The line a guess is compared against: `{ value, notes }`, the value in words and each note HistoryLine showed. */
export function lineWords(reference, mode, game) {
  if (!reference) return { value: DASH, notes: ['No line saved · draft'] };
  const value = reference.value === null || reference.value === undefined ? DASH : pickText(mode, game.awayCode, game.homeCode, reference.value, { even: 'Even' });
  const source = reference.source ? [reference.source] : [], saved = reference.savedAt ? [`Saved ${fmtFull(reference.savedAt)}`] : [];
  const observed = (gap = '') => (reference.observedAt ? [`Observed ${fmtFull(reference.observedAt)}${gap ? ` · ${gap}` : ''}`] : []);
  if (reference.basis === 'saved' && reference.status === 'pending') return { value: DASH, notes: ['Pending · the first line after submission becomes this guess\'s reference', ...saved] };
  if (reference.basis === 'saved' && value === DASH) return { value, notes: [`Unscored · ${reference.status === 'stale' ? 'the saved line was stale at submission' : reference.reason || 'no eligible line was saved'}`, ...observed()] };
  if (reference.basis === 'saved') return { value, notes: [reference.rule === 'first_line_after_submission' ? 'First line after submission' : 'Line saved with guess', ...source, ...saved, ...observed()] };
  if (reference.basis === 'commissioner-ruled') return { value, notes: [`Commissioner-ruled line${reference.decision ? ` (${reference.decision})` : ''}`, ...source, ...observed()] };
  if (reference.basis === 'line-at-guess') {
    const stored = reference.guessedAtKnown === false, imported = reference.origin === 'imported-reference';
    return { value, notes: [reference.rule === 'first-after-submission' ? 'Line at guess · first line after it' : 'Line at guess',
      ...(stored ? ['Original guess time not recorded · compared at the stored submission time'] : []),
      ...(reference.source ? [`${reference.source}${imported && reference.sourceFile ? ` · ${fileName(reference.sourceFile)}` : ''}`] : []),
      ...(imported ? [`Provisional · page time as published by the source${reference.capturedAt ? `; captured ${fmtFull(reference.capturedAt)}` : '; capture time not recorded'}${reference.decision ? ` (${reference.decision})` : ''}`] : []),
      ...observed(gapPhrase(reference.gapSeconds, stored ? 'the stored submission time' : 'the guess'))] };
  }
  if (reference.basis === 'nearest-snapshot') return { value, notes: ['Nearest snapshot at submission · not used for points', ...source, ...observed(gapPhrase(reference.gapSeconds))] };
  if (NONE_REASONS[reference.reason]) return { value: DASH, notes: [reference.reason === 'submission-time-unavailable' ? 'Submission time unavailable' : 'No line stored', NONE_REASONS[reference.reason]] };
  return { value: DASH, notes: ['No line stored', reference.reason === 'snapshot-not-qualifying'
    ? `The snapshot before this submission (${fmtFull(reference.priorSnapshotAt)}) had no usable line for this game${reference.detail ? ` (${reference.detail})` : ''}`
    : reference.nextSnapshotAt ? `No snapshot before this submission; the first came ${fmtFull(reference.nextSnapshotAt)}` : 'No snapshot was collected for this week'] };
}

/** One member's entry for a week and market: a sat-out entry wins, as the old screen read it. */
export function entryOf(week, userId, mode) {
  const entries = (week?.entries ?? []).filter(item => item.userId === userId && item.mode === mode);
  return entries.find(item => item.status === 'sat_out') ?? entries[0] ?? null;
}

/** A week's words for one entry: `{ status, points, notes }`; the notes (stored time, ruling, revisions) go behind ⓘ. */
export function weekSummary(entry) {
  if (!entry) return { status: 'No ballot.', points: null, notes: [] };
  const notes = [];
  if (entry.submittedAtKnown === false) notes.push('Original submission time was not recorded; the stored time is shown.');
  if (entry.ruling) notes.push(`Commissioner ruling · ${entry.ruling.decision || 'recorded'}`);
  if (entry.updatedAt) notes.push(`Last saved ${fmtFull(entry.updatedAt)}${entry.revisions ? ` · ${entry.revisions} revisions` : ''}`);
  const status = entry.status === 'sat_out' ? 'Sat out. Recorded as sat out, not zero.' : entry.status === 'draft' ? 'Draft · not submitted'
    : `Submitted${entry.submittedAt ? ` · ${fmtFull(entry.submittedAt)}` : ''}${entry.late ? ` · ${lateText(entry.late)}` : ''}`;
  const points = entry.status !== 'submitted' ? null : entry.eligible === false ? 'Not eligible for scoring'
    : entry.weekScored ? `${show(entry.weekPoints)} pts · ${entry.weekScored} games scored` : 'No scored result yet';
  return { status, points, notes };
}

/** The competition rank of `userId`'s week points among that week's scored, eligible ballots in `mode`, or null. */
export function weekRank(week, userId, mode) {
  const scored = (week?.entries ?? []).filter(e => e.mode === mode && e.status === 'submitted' && e.eligible !== false && e.weekScored > 0 && Number.isFinite(e.weekPoints));
  const mine = scored.find(e => e.userId === userId);
  return mine ? { rank: 1 + scored.filter(e => e.weekPoints > mine.weekPoints).length, of: scored.length } : null;
}

/** Week tiles, oldest first: `{ week, label, big, sub, aria }`. */
export function weekTiles(data, userId, mode) {
  return [...(data?.weeks ?? [])].sort((a, b) => a.week - b.week).map(week => {
    const entry = entryOf(week, userId, mode), rank = weekRank(week, userId, mode), big = rank ? show(entry.weekPoints) : DASH;
    const sub = rank ? ordinal(rank.rank) : !entry ? 'No ballot' : entry.status === 'sat_out' ? 'Sat out' : entry.status === 'draft' ? 'Draft' : entry.picksHidden && !entry.picks ? 'Hidden' : 'Not scored';
    return { week: week.week, label: `Week ${week.week}`, big, sub, aria: `Week ${week.week}, ${big === DASH ? 'no points' : `${big} points`}, ${rank ? `${ordinal(rank.rank)} of ${rank.of}` : sub}` };
  });
}

/** Season tiles when there is more than one season, newest first: `{ season, label, big, sub, on }`; else null. */
export function seasonTiles(data) {
  const seasons = [...new Set(data?.seasons ?? [])].sort((a, b) => b - a);
  return seasons.length < 2 ? null : seasons.map(season => ({ season, label: 'Season', big: String(season), sub: season === data.season ? 'Showing' : 'See weeks', on: season === data.season }));
}

/** One game's row in a week layer: `{ id, away, home, hidden, guess, line, points, notes }`. */
export function weekGame(week, entry, game, mode) {
  const pick = (entry?.picks ?? []).find(item => item.gameId === game.id), hidden = pick?.hidden === true || (entry?.picksHidden === true && !pick);
  if (hidden) return { id: game.id, away: game.awayCode, home: game.homeCode, hidden, guess: 'Hidden', line: 'Hidden', points: 'Hidden', notes: [`Kickoff ${fmtFull(game.kickoff)}`] };
  const line = lineWords(pick?.reference, mode, game), result = week?.results?.[game.id];
  const final = result ? `${result.status === 'final' ? `Final · ${game.awayCode} ${show(result.away)}, ${game.homeCode} ${show(result.home)}` : result.status}${result.origin === 'commissioner_reported' ? ' · Commissioner-reported final' : result.source ? ` · ${result.source}` : ''}` : null;
  return { id: game.id, away: game.awayCode, home: game.homeCode, hidden, guess: pickText(mode, game.awayCode, game.homeCode, pick?.guess), line: line.value,
    points: entry?.eligible === false ? 'Not scored' : Number.isFinite(pick?.points) ? `${show(pick.points)} / 10` : DASH,
    notes: [`Kickoff ${fmtFull(game.kickoff)}`, ...line.notes, ...(final ? [final] : [])] };
}
```

- [ ] **Step 3: Replace `web/src/next/league/LeagueHistory.jsx`**

```jsx
// League › History (D-69 step 1, Sean's P6A: season tiles › week tiles › a week's game rows). One component draws both
// layers so they share one read. History (`view: history`, `season` a filter) shows the player chips, the market, season
// tiles once there is a second season, and week tiles; a week (`week` set) is its own layer, each game a disclosure
// holding the line's fine print. Another member's withheld guesses and lines stay hidden (D-31, D-39), and every value the
// old screen showed is still here (D-23). It no longer imports the old CommunityHistory.jsx (spec test 13).
import { useState } from 'react';
import { communityApi } from '../../api.js';
import { MODE } from '../../communityFormat.js';
import { Avatar, Chip, ChipRail, InfoButton, LinkRow, Matchup, Segmented } from '../ui/index.js';
import { PlayLayer } from '../play/PlayLayer.jsx';
import { LeagueEmpty, LeagueFailure, LeagueLoading, useLeagueRead } from './useLeagueRead.jsx';
import { entryOf, seasonTiles, weekGame, weekSummary, weekTiles } from './historyModel.js';

const MARKETS = Object.entries(MODE).map(([value, label]) => ({ value, label }));
export const HISTORY_COPY = Object.freeze({
  title: 'History', player: 'Player', market: 'History market', seasons: 'Seasons', empty: 'No history yet.', noWeek: 'No record for this week.',
  hidden: 'Picks hidden until your submission or each game\'s kickoff.', score: 'Every game in Your score', about: 'About history', aboutWeek: 'About this week',
  aboutBody: 'Saved guesses and their original references. Games the server withholds stay hidden.', weekTitle: (week, season) => `Week ${week}${season ? ` · ${season}` : ''}`,
});

function Tile({ tile, onClick, ...rest }) {
  return <li><button type="button" className="gx-nest-tile gx-lg-tile" onClick={onClick} {...rest}>
    <span className="gx-nest-tile-label">{tile.label}</span><span className="gx-n-m">{tile.big}</span><span className="gx-t-meta gx-c-2">{tile.sub}</span></button></li>;
}

export function LeagueHistory({ app, place, mode, parents = [], historyLip, onPlace, onScore }) {
  const [player, setPlayer] = useState(app.accountId);
  const season = place.season;
  const read = useLeagueRead(`${app.accountId}:history:${season || 'latest'}`, signal => communityApi('history', season ? { season } : {}, signal), error => {
    if (error.status === 401) app.requestSignIn?.(); else app.refresh({ only: ['community'] });
  });
  const market = mode === 'guess_total' ? 'guess_total' : 'guess_spread', data = read.data, viewer = data?.viewer;
  const members = data?.members ?? [], selected = members.find(m => m.id === player) ?? members.find(m => m.id === viewer) ?? members[0] ?? null;
  const own = !!selected && selected.id === viewer, who = own ? 'You' : selected?.displayName ?? '';
  const toHistory = historyLip ?? { key: 'history', label: HISTORY_COPY.title, open: () => onPlace({ week: null }) };
  const state = read.loading ? <LeagueLoading label="Loading history…"/> : read.error ? <LeagueFailure error={read.error} onRetry={read.retry}/> : null;
  const people = [...members].sort((a, b) => Number(b.id === viewer) - Number(a.id === viewer) || String(a.displayName).localeCompare(String(b.displayName)));
  const filters = <>
    <ChipRail label={HISTORY_COPY.player}>{people.map(m => <Chip key={m.id} text selected={m.id === selected?.id} onClick={() => setPlayer(m.id)}>
      <Avatar id={m.id} name={m.displayName} size={24}/>{m.id === viewer ? 'You' : m.displayName}{m.removed ? ' · Removed' : ''}</Chip>)}</ChipRail>
    <Segmented label={HISTORY_COPY.market} options={MARKETS} value={market} onChange={value => onPlace({ market: value })}/>
  </>;
  if (place.layer === 'week') {
    const week = (data?.weeks ?? []).find(w => w.week === place.week) ?? null, entry = week && selected ? entryOf(week, selected.id, market) : null;
    const summary = weekSummary(entry), games = entry && Array.isArray(entry.picks) ? (week.games ?? []).map(game => weekGame(week, entry, game, market)) : [];
    return <PlayLayer label="League history week" parents={[...parents, toHistory]} layer={`league:week:${season ?? 'latest'}:${place.week}`} title={HISTORY_COPY.weekTitle(place.week, season ?? data?.season)}
      info={summary.notes.length ? <InfoButton title={HISTORY_COPY.aboutWeek} body={summary.notes}/> : null}>
      {state ?? (!week || !selected ? <LeagueEmpty text={HISTORY_COPY.noWeek} actionLabel="Back to History" onAction={toHistory.open}/> : <>
        {filters}
        <p className="gx-t-meta gx-c-2">{[who, MODE[market], summary.points].filter(Boolean).join(' · ')}</p>
        <p className="gx-t-body">{summary.status}</p>
        {entry?.picksHidden && !entry.picks ? <p className="gx-t-body gx-c-2">{HISTORY_COPY.hidden}</p> : null}
        {games.length ? <ul className="gx-lg-games" aria-label={`${who} · Week ${week.week} ${MODE[market]} games`}>{games.map(game => <li key={game.id}>
          <details className="gx-lg-game"><summary><Matchup away={game.away} home={game.home}/>
            {game.hidden ? <span className="gx-grow">{' · Hidden'}</span> : <><span className="gx-grow">{` · Line ${game.line} · ${who} ${game.guess}`}</span><span className="gx-n-s">{` · ${game.points}`}</span></>}</summary>
            <ul className="gx-lg-notes">{game.notes.map(note => <li key={note} className="gx-t-meta gx-c-2">{note}</li>)}</ul></details>
        </li>)}</ul> : null}
        {own ? <LinkRow icon="chart" onClick={() => onScore(week.season, week.week, market)}>{HISTORY_COPY.score}</LinkRow> : null}
      </>)}
    </PlayLayer>;
  }
  const seasons = data ? seasonTiles(data) : null, weeks = data && selected ? weekTiles(data, selected.id, market) : [];
  return <PlayLayer label="League history" parents={parents} layer="league:history" title={`${HISTORY_COPY.title} · ${MODE[market]}`} info={<InfoButton title={HISTORY_COPY.about} body={[HISTORY_COPY.aboutBody]}/>}>
    {state ?? <>
      {filters}
      {seasons ? <ul className="gx-nest-grid" aria-label={HISTORY_COPY.seasons}>{seasons.map(tile => <Tile key={tile.season} tile={tile} aria-pressed={tile.on} onClick={() => onPlace({ season: tile.season, week: null })}/>)}</ul> : null}
      {weeks.length ? <ul className="gx-nest-grid" aria-label={`${own ? 'Your' : `${who}’s`} weeks`}>{weeks.map(tile => <Tile key={tile.week} tile={tile} aria-label={tile.aria} onClick={() => onPlace({ week: tile.week })}/>)}</ul>
        : <LeagueEmpty text={HISTORY_COPY.empty} actionLabel="Refresh" onAction={read.retry}/>}
    </>}
  </PlayLayer>;
}
```

- [ ] **Step 4: Route History through it in `LeagueScreen.jsx`, and its styles**

Replace the comment `// Task 6b replaces this …` and the `body = <PlayLayer label="League history" …>` line under it with:

```jsx
    body = <LeagueHistory key={app.accountId} app={app} place={place} mode={mode} parents={[toBoard]} onPlace={set}
      historyLip={lip('history', LEAGUE_COPY.history, 'history', { week: null })}
      onScore={(season, week, market) => shell.go('play', { section: 'score', season, week, market: market === 'guess_total' ? 'total' : 'spread' })}/>;
```

In `league.css`, delete the three `.gx-league-history-game` rules and the two `.gx-league-reference` rules, which only the old
history used. Append:

```css
/* History (P6A): a week's games, each a disclosure holding the line's fine print (D-23). */
.gx .gx-lg-games, .gx .gx-lg-notes { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.gx .gx-lg-game { border-top: 1px solid var(--gx-border); }
.gx .gx-lg-game > summary { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gx-space-2); min-height: var(--gx-size-touch); padding-block: var(--gx-space-3); cursor: pointer; }
.gx .gx-lg-notes { gap: var(--gx-space-1); margin-bottom: var(--gx-space-3); padding: var(--gx-space-3); border-radius: var(--gx-radius-sm); background: var(--gx-surface-1); }
.gx .gx-lg-tile[aria-pressed="true"] { box-shadow: inset 0 0 0 2px var(--gx-accent-ink); }
@media (forced-colors: active) { .gx .gx-lg-tile[aria-pressed="true"] { outline: 2px solid Highlight; } }
```

- [ ] **Step 5: Update the browser specs**

`tests/cloud-browser/next-league-live.spec.js`, in "history obeys each market reveal …". Replace the lines from the `Player`
`selectOption` through the first `await expect(region(page)).toContainText('2.5');` with the block below. The rest of the
test, from the evidence fixtures to the Total check, then runs in the week layer.

```js
    await page.getByRole('group', { name: 'Player' }).getByRole('button', { name: /Troy Fixture/ }).click();
    await expect(region(page)).not.toContainText('2.5');
    await expect(region(page)).not.toContainText('47.5');
    const { season, week } = world.state.league;
    await page.getByRole('button', { name: new RegExp(`^Week ${week},`) }).click();
    await expect(page.getByRole('heading', { name: `Week ${week} · ${season}`, level: 2 })).toBeVisible();
    await expect(region(page)).not.toContainText('2.5');
    expect((await world.api('luke', 'community/sit-out', { season, week, mode: 'guess_spread' })).status).toBe(200);
    const refreshed = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/community/history'));
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await refreshed;
    await expect(region(page)).toContainText('2.5');
```

`tests/cloud-browser/next-design-home-league.spec.js`, last test: the heading check `'Community history'` becomes
`await expect(page.getByRole('heading', { name: 'History · Spread', level: 2 })).toBeVisible();`.

`tests/cloud-browser/next-phone-layout.spec.js` and `next-scroll-navigation.spec.js`: add `'#play/league?view=history&week=6'`
after `'#play/league?view=history'` in `ADDRESSES`. This covers the week layer for spec tests 10 and 11.

- [ ] **Step 6: Run, then commit**

```
node --test tests/next-league-history.test.mjs tests/next-app-view.test.mjs tests/next-tokens.test.mjs
npx vitest run tests/next-league-layers.test.jsx tests/next-matchup-marks.test.jsx
npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-league-live.spec.js tests/cloud-browser/next-design-home-league.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js
node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run
```

Expected: PASS with `skipped 0`, and `grep -rn "CommunityHistory" web/src/next` prints nothing.

```bash
git add web/src/next/league/{historyModel.js,LeagueHistory.jsx,LeagueScreen.jsx,league.css} tests/next-league-history.test.mjs tests/next-league-layers.test.jsx tests/next-app-view.test.mjs tests/next-matchup-marks.test.jsx tests/cloud-browser/{next-league-live,next-design-home-league,next-phone-layout,next-scroll-navigation}.spec.js
git diff --cached --stat && git ls-files --eol web/src/next/league tests/next-league-history.test.mjs
git commit -m "League History as season tiles, week tiles and a week layer; retire the old history import" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Notes (task 6)

- **Decisions for Sean:**
  - `#play/league` now opens the board; it used to open the feed.
  - The race strip, "Compare players in …", "Refresh Community" and "Refresh group" are gone.
  - The board shows 6 rows plus your own, then "N more on the board".
  - Engine moments replace the rank toast. A drop is quiet, so the words "Down to 3rd" no longer show, but the arrow stays.
- **The week rank is new.** No other screen shows it: it is the competition rank of that week's `weekPoints` among scored,
  eligible ballots. Season tiles show only the year, because other seasons' ranks would need one read per season.
- **Private league:** History covers the whole Community, so a group's landing row reads "Community history" and switches
  league, as today's button did. A group's tile shows its player count, so the landing makes no new read.
- **`ov.flash` for "You're 1st"** shows the trophy and FlashOverlay's fixed "See badges" button. Task 8 may want a neutral
  second button for big moments that are not badges.
- **Frame assumptions:**
  - Lips are named "Back to Play" and "Back to League" (Nest's "Back to " plus the label).
  - `PlayTile` takes the brief's props.
  - `shell.go('play', {})`, the Play lip, keeps `section: 'league'` in today's reducer. Task 1 should pass
    `{ section: undefined }`, or the Play lip will not leave League.
- **Executed on scratch copies:**
  - The `state.js` change: the router, shell-state and four-tab tests pass. Without the `mergeAdapters` line, browser Back
    from a week stays on the week.
  - The three pure modules built from this plan's text, run against `next-league-model`, `next-league-history` and
    `next-rank-moment`: all 18 tests pass, including the engine path.
- **Unverified (inspection only):**
  - The component, vitest and Playwright steps. They depend on Task 1's `PlayLayer` and `PlayTile`.
  - Whether the phone-layout world has a Week 6 history record. If it does not, the check covers the week layer's empty state.
  - The 320 px row: it holds a 32 px rank, a 40 px face, the name, your chip and the total, and names wrap. If the checks
    find clipping, drop the left `Rank` on your own row, since the chip already gives the place.
- Points rank moments are not added. The Points board is Task 4's `PointsBoard`, left untouched.

---

## Task 7 · The Play landing (P1B) and Picks

### Task 7a: The Play landing (P1B) and the Whole week locked moment

The landing becomes Sean's P1B. One glow card shows the ballot to do next, from `nextGuess` and the shared Community
read. Six tiles follow in two columns: the other ballot, then Tasks 2 to 6's tiles. Whole week locked (small) reports
from the same read. `FocusAction`, `FocusRows`, the Points glow card, "More in Play" and `PlayFeaturesRow` leave Play.
`ui/FocusLanding.jsx` stays, because Home, Bets, Research, `HomeSummaries.jsx` and `SavedTrendsSummary.jsx` still use
it [inspected]. The landing makes no read of its own. Each tile makes the read its own task names.

**Files:**
- Create: `web/src/next/play/landing.js`, `web/src/next/play/useWeekLocked.js`, `web/src/next/play/landing.css`,
  `tests/next-play-landing.test.mjs`, `tests/next-play-landing.test.jsx`
- Modify: `web/src/next/play/Play.jsx` (header, imports, `Play`, `PlayLanding`), `web/src/next/play/moments.js`
  (`weekLockedId`), `web/src/next/play/points/PointsBallot.jsx`, `points/pointsModel.js` and `points/points.css` (the
  retired `PointsLandingCard`)
- Delete: `web/src/next/features/FeatureRows.jsx` (`PlayFeaturesRow`; Play was its only importer [inspected])
- Tests modified: `tests/next-router.test.mjs` (one test), `tests/four-tab-landings.test.jsx`,
  `tests/next-points-ui.test.jsx`, and the browser specs `next-play-nest`, `next-play-moments`,
  `next-per-game-scoring`, `nba`, `comparisons-home`, `next-data`, `next-features` and `next-points`

**Interfaces:**
- Consumes:
  - Task 1: `openPlay(shell, section, view)`, `PlayTile({ ref, … })` (the caller's `ariaLabel` says "new"), `SCOPES.picks`
    and the per-element `usePopped(id)`, which pops only when the moment plays while the element is mounted.
  - Tasks 2–6 tiles:
    - `ScoreTile({ onOpen(patch) })` and `CompareTile({ onOpen(view) })` pass the keys of what they show.
    - `PointsTile({ ref, onOpen })`, `BadgesTile({ onOpen })` and `LeagueTile({ onOpen })` pass a click event, so the
      landing ignores their argument.
  - `homeHero` and `heroProgress` (`shared/home-view.mjs`), and `nextGuess`.
- Produces:
  - `landing.js`: `MARKET_NAME`, `marketOf`, `otherMarket`, `ballotProgress(community, market)` and `allLocked(row)`.
  - `playHero(community) → { kind: 'next'|'done'|'results', week, eyebrow, title, market, progress, line, action, target }`.
  - `ballotTile(community, market) → { label, big, sub, tone, ariaLabel }`.
  - `WEEK_LOCKED_SOURCE` and `weekLockedMoments(community)`.
  - `moments.js`: `weekLockedId(season, week, mode)`.
  - `useWeekLocked(app)`.
  - Landing hooks for tests: `[data-play="hero"]` (`data-hero` = kind), `[data-play="hero-line"]`, `[data-play="tiles"]`,
    and `[data-play-tile="ballot|points|score|league|badges|compare"]`.
- Moment: kind `weekLocked`, id `weekLocked:<season>:<week>:<mode>`, scopes `[SCOPES.picks, SCOPES.play]`, one source
  `community:weekLocked`. The landing opens `SCOPES.play`. Task 7b's picks card opens `SCOPES.picks`. NEW shows on the
  ballot tile from `useNewCount(SCOPES.picks)`. While a ballot is open, a waiting moment can only be the tile's market,
  because the hero's market still has games to lock.
- Addresses: no new key. The hero and the ballot tile open `#play/picks?market=…&season=…&week=…` on the week, with
  no `pickGame`. The other tiles call `openPlay`.

- [ ] **Step 1: Write the failing pure tests.** Create `tests/next-play-landing.test.mjs`:

```js
// D-69 step 1, the Play landing (Sean's P1B) and the Whole week locked moment, as plain data (web/src/next/play/
// landing.js). Fixture weeks only: the server's picksDue and due rows decide every state. Each test names its contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEEK_LOCKED_SOURCE, ballotTile, playHero, weekLockedMoments } from '../web/src/next/play/landing.js';
import { weekLockedId } from '../web/src/next/play/moments.js';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES, sizeOf } from '../web/src/next/moments/catalog.js';

const DEADLINE = '2026-11-06T01:15:00.000Z'; // Thu Nov 5, 5:15 PM PT (the first kickoff, D-24)
const SUNDAY = '2026-11-08T18:00:00.000Z'; // Sun 10:00 AM PT
const TUESDAY = '2026-11-03T20:00:00.000Z';
const row = (mode, extra) => ({ mode, submitted: false, satOut: false, filled: 0, games: 14, ...extra });
/** A per-game week (M-07): Spread 3 of 14 locked, Total none, both open. */
const perGame = ({ spread = {}, total = {}, state = 'due', now = TUESDAY } = {}) => ({
  viewer: 'acct', rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  week: { season: 2026, week: 9, deadline: DEADLINE, games: 14 },
  picksDue: { state, week: 9, deadline: DEADLINE, now, modes: [] },
  due: [row('guess_spread', { openGames: 11, locked: 3, nextKickoff: DEADLINE, ...spread }), row('guess_total', { openGames: 14, locked: 0, nextKickoff: DEADLINE, ...total })],
});
/** The rules before per-game scoring: whole ballots, submitted or sat out. */
const wholeMarket = ({ spread = {}, total = {}, state = 'due', modes = ['guess_spread', 'guess_total'] } = {}) => ({
  viewer: 'acct', rules: { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' }, week: { season: 2026, week: 9, deadline: DEADLINE, games: 14 },
  picksDue: { state, week: 9, deadline: DEADLINE, now: TUESDAY, modes: modes.map(mode => ({ mode })) },
  due: [row('guess_spread', spread), row('guess_total', total)],
});
const words = line => line.split(/\s+/).filter(w => w !== '·').length;

test('next move: the open ballot nextGuess names, its week counted, the first kickoff, and the one "Make picks"', () => {
  const hero = playHero(perGame());
  assert.deepEqual({ ...hero, progress: hero.progress && { done: hero.progress.done, of: hero.progress.of } }, {
    kind: 'next', week: 9, eyebrow: 'Your next move', title: 'Guess the Spread', market: 'spread', progress: { done: 3, of: 14 },
    line: '3 of 14 locked · first kickoff Thu 5:15 PM PT', action: 'Make picks', target: { section: 'picks', market: 'spread' },
  });
  const total = playHero(perGame({ spread: { openGames: 0, locked: 14, nextKickoff: null } }));
  assert.equal(total.title, 'Guess the Total', 'a market with nothing left to lock is never the next move');
  assert.ok(words(hero.line) <= 12, 'no surface sentence over twelve words (D-66)');
});

test('after the first kickoff the line names that market\'s next open kickoff, from the server\'s due row', () => {
  const hero = playHero(perGame({ state: 'late', now: '2026-11-07T20:00:00.000Z', spread: { openGames: 0, locked: 14, nextKickoff: null }, total: { openGames: 9, locked: 4, nextKickoff: SUNDAY } }));
  assert.equal(hero.title, 'Guess the Total');
  assert.equal(hero.line, '4 of 14 locked · next kickoff Sun 10:00 AM PT');
});

test('whole-market rules (before per-game): the count says "picked", a sent ballot "Submitted", a sit-out "Sat out"; nothing says locked', () => {
  const hero = playHero(wholeMarket({ spread: { filled: 6 } }));
  assert.equal(hero.line, '6 of 14 picked · first kickoff Thu 5:15 PM PT');
  assert.deepEqual(ballotTile(wholeMarket({ total: { submitted: true, filled: 14 } }), 'total'), { label: 'Guess the Total', big: '14 / 14', sub: 'Submitted', tone: 'good', ariaLabel: 'Guess the Total, submitted' });
  assert.equal(ballotTile(wholeMarket({ total: { satOut: true } }), 'total').sub, 'Sat out');
  assert.equal(ballotTile(wholeMarket({ total: { filled: 2 } }), 'total').ariaLabel, 'Guess the Total, 2 of 14 picked');
});

test('both ballots done: "Week N locked in", "Review your guesses", and the one line says what is true of each market', () => {
  const done = playHero(perGame({ state: 'done', spread: { openGames: 0, locked: 14, nextKickoff: null }, total: { openGames: 0, locked: 14, nextKickoff: null } }));
  assert.deepEqual([done.kind, done.eyebrow, done.title, done.line, done.action, done.target], ['done', 'This week', 'Week 9 locked in', 'Spread and Total, all 28 locked', 'Review your guesses', { section: 'picks', market: 'spread' }]);
  const missed = playHero(perGame({ state: 'done', spread: { openGames: 0, locked: 13 }, total: { openGames: 0, locked: 2, satOut: true } }));
  assert.equal(missed.line, 'Spread 13 of 14 locked · Total sat out', 'a game that closed unlocked and a sit-out are said, never hidden');
  const satOut = playHero(perGame({ state: 'done', spread: { openGames: 0, locked: 0, satOut: true }, total: { openGames: 0, locked: 5 } }));
  assert.deepEqual([satOut.market, satOut.target.market], ['total', 'total'], 'the review opens the market that was not sat out');
});

test('no week open: the latest result, as "Your week, at a glance" did, with no meter and no false zero', () => {
  const none = playHero({ picksDue: { state: 'none', modes: [] }, due: [] });
  assert.deepEqual([none.kind, none.title, none.progress, none.line, none.action, none.target], ['results', 'Your week, at a glance', null, 'No week is open yet. Your past results are still here.', 'View your results', { section: 'score' }]);
  assert.equal(playHero(perGame({ state: 'not_open' })).line, 'Picks open Monday 12:00 AM PT');
  assert.equal(playHero(wholeMarket({ state: 'closed' })).line, 'Review your guesses and their saved scoring lines.');
});

test('the other ballot tile: "N / 14" and one word, "All locked" in the good tone with its word, and "—" without a read', () => {
  assert.deepEqual(ballotTile(perGame(), 'total'), { label: 'Guess the Total', big: '0 / 14', sub: 'locked', tone: 'plain', ariaLabel: 'Guess the Total, 0 of 14 locked' });
  assert.deepEqual(ballotTile(perGame({ spread: { openGames: 0, locked: 14 } }), 'spread'), { label: 'Guess the Spread', big: '14 / 14', sub: 'All locked', tone: 'good', ariaLabel: 'Guess the Spread, all 14 locked' });
  assert.deepEqual(ballotTile(perGame({ total: { openGames: 0, locked: 3, satOut: true } }), 'total'), { label: 'Guess the Total', big: '3 / 14', sub: 'Sat out', tone: 'plain', ariaLabel: 'Guess the Total, sat out this week' });
  assert.deepEqual(ballotTile(null, 'total'), { label: 'Guess the Total', big: '—', sub: 'Open your guesses', tone: 'plain', ariaLabel: 'Guess the Total, open your guesses' });
});

test('Whole week locked: one small moment per market at N of N on a per-game read; a missed game, a sit-out and whole-market rules stay quiet', () => {
  const all = perGame({ spread: { openGames: 0, locked: 14 } });
  assert.deepEqual(weekLockedMoments(all), [{ id: 'weekLocked:2026:9:guess_spread', kind: 'weekLocked', scopes: [SCOPES.picks, SCOPES.play], title: 'Week 9 Spread locked', meta: '14 of 14 locked', icon: 'lock' }]);
  assert.equal(weekLockedId(2026, 9, 'guess_spread'), 'weekLocked:2026:9:guess_spread');
  assert.equal(sizeOf('weekLocked'), 'small');
  assert.deepEqual(weekLockedMoments(perGame({ spread: { openGames: 0, locked: 13 } })), [], 'a game that closed unlocked: quiet');
  assert.deepEqual(weekLockedMoments(perGame({ spread: { openGames: 0, locked: 14, satOut: true } })), [], 'a sit-out: quiet');
  assert.deepEqual(weekLockedMoments(wholeMarket({ spread: { submitted: true, filled: 14 } })), [], 'whole-market rules lock no game');
  assert.deepEqual(weekLockedMoments(null), []);
});

const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig(storage = memory()) {
  const small = [], big = [], here = { settled: false, navigated: false };
  const engine = createMomentsEngine({ account: 'acct', storage, isSettled: () => here.settled, hasNavigated: () => here.navigated,
    onBig: ms => big.push(ms.map(m => m.id)), onSmall: m => small.push(m.id), setTimer: fn => { fn(); }, now: () => 0 });
  return { engine, small, big, here, storage };
}
const report = (engine, community) => engine.report(weekLockedMoments(community), { source: WEEK_LOCKED_SOURCE });

test('Whole week locked plays on the fresh read that reaches N of N while the picks card is open, once, and never for 13 of 14', () => {
  const r = rig();
  report(r.engine, perGame()); // this device's first read of the source seeds it silently
  r.here.settled = true; r.here.navigated = true;
  const close = r.engine.open(SCOPES.picks);
  report(r.engine, perGame({ spread: { openGames: 1, locked: 13 } }));
  assert.deepEqual(r.small, [], '13 of 14 is not the moment');
  const all = perGame({ spread: { openGames: 0, locked: 14 } });
  report(r.engine, all);
  assert.deepEqual(r.small, ['weekLocked:2026:9:guess_spread'], 'the confirming read plays it in place, small');
  report(r.engine, all);
  assert.deepEqual(r.small, ['weekLocked:2026:9:guess_spread'], 'the same read again never replays it');
  assert.deepEqual(r.big, [], 'a small moment never takes the big card');
  close();
  const again = rig(r.storage);
  report(again.engine, all);
  again.here.settled = true; again.here.navigated = true;
  again.engine.open(SCOPES.picks);
  assert.deepEqual(again.small, [], 'a later session on this device remembers it');
});

test('Whole week locked never plays on launch: it waits as NEW for the landing tile, then plays once when the card is opened', () => {
  const r = rig();
  report(r.engine, perGame()); // seeded on an earlier visit
  const later = rig(r.storage); // a new session: the week was locked on another device meanwhile
  const closeLanding = later.engine.open(SCOPES.play); // the app opens on the Play landing: a launch card
  report(later.engine, perGame({ spread: { openGames: 0, locked: 14 } }));
  assert.deepEqual(later.small, [], 'nothing plays on page load');
  assert.equal(later.engine.newCount(SCOPES.picks), 1, 'the landing\'s ballot tile shows NEW');
  closeLanding();
  later.here.settled = true; later.here.navigated = true;
  later.engine.open(SCOPES.picks); // the member opens the picks card
  assert.deepEqual(later.small, ['weekLocked:2026:9:guess_spread']);
  assert.equal(later.engine.newCount(SCOPES.picks), 0);
});
```

- [ ] **Step 2: Run it to verify it fails.** Run: `node --test tests/next-play-landing.test.mjs`. Expected: FAIL,
  `ERR_MODULE_NOT_FOUND` for `web/src/next/play/landing.js`.

- [ ] **Step 3: Write the model.** Append to `web/src/next/play/moments.js`:

```js

/** The Whole week locked moment's id for one market and week (D-69 step 1): play/landing.js reports it; the picks card
 * and the landing pop the line that says it. */
export const weekLockedId = (season, week, mode) => `weekLocked:${season}:${week}:${mode}`;
```

Create `web/src/next/play/landing.js`:

```js
// D-69 step 1, the Play landing (Sean's P1B, November 3, 2026) as plain data: the first card (the ballot to do next,
// "Week N locked in" once nothing is left to lock, or the latest result when no week is open), the other ballot's tile
// and the Whole week locked moment. Pure: it reads only the shared /community/read reply, through homeHero and
// heroProgress (shared/home-view.mjs) and nextGuess.js, so the landing makes no read of its own. The server's
// `picksDue` and `due` rows decide every state, never the device clock.
import { HOME_COPY, heroProgress, homeHero } from '../../../../shared/home-view.mjs';
import { SCOPES } from '../moments/catalog.js';
import { fmtWhen } from '../format.js';
import { weekLockedId } from './moments.js';
import { nextGuess } from './nextGuess.js';

export const MARKET_NAME = Object.freeze({ spread: 'Guess the Spread', total: 'Guess the Total' });
const MODE = Object.freeze({ spread: 'guess_spread', total: 'guess_total' });
const dueRow = (community, mode) => (Array.isArray(community?.due) ? community.due : []).find(d => d?.mode === mode);

/** 'spread' or 'total', for a mode id or a market. */
export const marketOf = value => (value === 'guess_total' || value === 'total' ? 'total' : 'spread');
export const otherMarket = market => (market === 'total' ? 'spread' : 'total');

/**
 * One market's week: heroProgress's `{ mode, label, done, of, state }` (state 'locked' per game, else 'sent', 'satOut'
 * or 'draft') plus `satOut` from its due row, since a per-game sit-out keeps its locked count. Null without a week.
 */
export function ballotProgress(community, market) {
  const mode = MODE[market];
  const row = heroProgress({ community }).find(r => r.mode === mode);
  return row ? { ...row, satOut: row.state === 'satOut' || dueRow(community, mode)?.satOut === true } : null;
}

/** Every game of the market is locked in. Per-game rules only; a sit-out never is. */
export const allLocked = row => Boolean(row) && row.state === 'locked' && !row.satOut && row.of > 0 && row.done >= row.of;

const counted = row => `${row.done} of ${row.of} ${row.state === 'draft' ? 'picked' : 'locked'}`;

/** "first kickoff Thu 5:15 PM PT" while the week's first game is ahead, else that market's next open kickoff. */
function kickoffWords(community, hero, mode) {
  const next = dueRow(community, mode)?.nextKickoff;
  const target = hero.perGame && typeof next === 'string' ? next : hero.deadline;
  const at = Date.parse(target ?? ''), first = Date.parse(hero.deadline ?? '');
  if (!Number.isFinite(at)) return null;
  return `${Number.isFinite(first) && at <= first ? 'first' : 'next'} kickoff ${fmtWhen(target)}`;
}

/**
 * The first card: `{ kind, week, eyebrow, title, market, progress, line, action, target }`.
 * - 'next': a ballot is open (homeHero's lime action): the ballot nextGuess names, its week counted, its kickoff.
 * - 'done': nothing is left to lock or submit: "Week N locked in" and a review of the first market not sat out.
 * - 'results': no week is open (none, not open yet, closed): the latest result, as "Your week, at a glance" was.
 * `progress` feeds the week meter (null draws none); `target` is where the one lime button goes.
 */
export function playHero(community) {
  const hero = homeHero({ community });
  const week = hero.week;
  if (hero.action.primary) {
    const market = nextGuess(community), row = ballotProgress(community, market);
    const shown = row && row.of > 0 && row.state !== 'sent' ? row : null;
    return { kind: 'next', week, eyebrow: 'Your next move', title: MARKET_NAME[market], market, progress: shown,
      line: [shown ? counted(shown) : null, kickoffWords(community, hero, MODE[market])].filter(Boolean).join(' · '),
      action: 'Make picks', target: { section: 'picks', market } };
  }
  if (hero.state === 'done') {
    const rows = ['spread', 'total'].map(m => ballotProgress(community, m)).filter(Boolean);
    const review = rows.find(r => !r.satOut) ?? null;
    const market = review ? marketOf(review.mode) : 'spread';
    const line = rows.length && rows.every(allLocked) ? `${rows.map(r => r.label).join(' and ')}, all ${rows.reduce((sum, r) => sum + r.of, 0)} locked`
      : rows.map(r => `${r.label} ${r.satOut ? 'sat out' : r.state === 'sent' ? 'sent' : counted(r)}`).join(' · ');
    return { kind: 'done', week, eyebrow: 'This week', title: review ? `Week ${week} locked in` : `Week ${week} sat out`, market,
      progress: review && review.of > 0 ? review : null, line, action: 'Review your guesses', target: { section: 'picks', market } };
  }
  return { kind: 'results', week, eyebrow: 'Your results', title: 'Your week, at a glance', market: nextGuess(community), progress: null,
    line: hero.state === 'none' ? 'No week is open yet. Your past results are still here.'
      : hero.state === 'not_open' ? HOME_COPY.notOpen : 'Review your guesses and their saved scoring lines.',
    action: 'View your results', target: { section: 'score' } };
}

/** The other ballot's tile (P1B): its name, "5 / 14" and one word. With no week or no read, "—", never a made-up zero. */
export function ballotTile(community, market) {
  const name = MARKET_NAME[market], row = community ? ballotProgress(community, market) : null;
  if (!row || !(row.of > 0)) return { label: name, big: '—', sub: 'Open your guesses', tone: 'plain', ariaLabel: `${name}, open your guesses` };
  const big = `${row.done} / ${row.of}`;
  if (row.satOut) return { label: name, big, sub: 'Sat out', tone: 'plain', ariaLabel: `${name}, sat out this week` };
  if (row.state === 'sent') return { label: name, big, sub: 'Submitted', tone: 'good', ariaLabel: `${name}, submitted` };
  if (row.state === 'draft') return { label: name, big, sub: 'picked', tone: 'plain', ariaLabel: `${name}, ${row.done} of ${row.of} picked` };
  const all = allLocked(row);
  return { label: name, big, sub: all ? 'All locked' : 'locked', tone: all ? 'good' : 'plain',
    ariaLabel: all ? `${name}, all ${row.of} locked` : `${name}, ${row.done} of ${row.of} locked` };
}

/** The one source the detector reports under, so a week locked on another device still plays here once. */
export const WEEK_LOCKED_SOURCE = 'community:weekLocked';

/**
 * Whole week locked (D-69 moments table, small): one candidate per market whose week reads N of N locked in this
 * Community read (per-game rules only). A market that closed with a game unlocked, or was sat out, has none: it stays
 * quiet. It plays on the picks card and on the landing (SCOPES.picks, SCOPES.play).
 */
export function weekLockedMoments(community) {
  const week = community?.week;
  if (!Number.isInteger(week?.season) || !Number.isInteger(week?.week)) return [];
  return ['spread', 'total'].map(m => ballotProgress(community, m)).filter(allLocked).map(row => ({
    id: weekLockedId(week.season, week.week, row.mode), kind: 'weekLocked', scopes: [SCOPES.picks, SCOPES.play],
    title: `Week ${week.week} ${row.label} locked`, meta: `${row.of} of ${row.of} locked`, icon: 'lock',
  }));
}
```

- [ ] **Step 4: Run it to verify it passes.** Run: `node --test tests/next-play-landing.test.mjs`. Expected: PASS, 9 tests
  [executed on a copy of the tree with Task 1's `SCOPES`].

- [ ] **Step 5: Write the failing landing render test and router test.** Create `tests/next-play-landing.test.jsx`:

```jsx
// D-69 step 1, the Play landing (Sean's P1B, November 3, 2026), rendered statically: one glow card with the ballot to
// do next, then six tiles in two columns. The five page tiles are each page task's own component with its own tests;
// here they are stand-ins, so this file guards only the landing's composition. Fixture weeks only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ app: null, newCounts: {}, scopes: [] }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => state.app, useSharedRead: () => ({ status: 'loading', data: null }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => ({ loading: true, data: null, error: null }), LeagueFailure: () => null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn() }));
vi.mock('../web/src/fantasyData.js', () => ({ fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => ({ status: 'loading' }) }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useMoments: () => null, useMomentScope: scope => { state.scopes.push(scope); },
  useNewCount: scope => state.newCounts[scope] ?? 0, usePopped: () => false,
}));
const stub = (name, label) => ({ [name]: ({ onOpen }) => <button type="button" className="gx-stub-tile" onClick={onOpen}>{label}</button> });
vi.mock('../web/src/next/play/ScoreTile.jsx', () => stub('ScoreTile', 'Your score'));
vi.mock('../web/src/next/play/CompareTile.jsx', () => stub('CompareTile', 'Compare'));
vi.mock('../web/src/next/play/points/PointsTile.jsx', () => stub('PointsTile', 'Guess the Points'));
vi.mock('../web/src/next/features/BadgesTile.jsx', () => stub('BadgesTile', 'Badges'));
vi.mock('../web/src/next/league/LeagueTile.jsx', () => stub('LeagueTile', 'League'));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Play } = await import('../web/src/next/play/Play.jsx');

const DEADLINE = '2026-11-06T01:15:00.000Z'; // Thu 5:15 PM PT
const due = (spread, total, extra = {}) => [
  { mode: 'guess_spread', submitted: false, satOut: false, filled: spread, games: 14, openGames: 14 - spread, locked: spread, nextKickoff: spread < 14 ? DEADLINE : null },
  { mode: 'guess_total', submitted: false, satOut: false, filled: total, games: 14, openGames: 14 - total, locked: total, nextKickoff: total < 14 ? DEADLINE : null, ...extra },
];
const week = (rows, state = 'due') => ({ viewer: 'fixture', rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  week: { season: 2026, week: 9, deadline: DEADLINE, games: 14 }, picksDue: { state, week: 9, deadline: DEADLINE, now: '2026-11-03T20:00:00.000Z', modes: [] }, due: rows, members: [], optOuts: [] });
function render(community, { newCounts = {} } = {}) {
  state.app = { accountId: 'fixture', community, league: { name: 'Community', community: true }, refresh: vi.fn(), requestSignIn: vi.fn() };
  state.newCounts = newCounts; state.scopes = [];
  const shell = { state: { views: { play: {} }, trail: [] }, go: vi.fn(), setView: vi.fn(), tab: vi.fn(), reload: vi.fn() };
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Play/></div></ShellContext.Provider>);
}
const ready = data => ({ status: 'ready', data, error: null });
const nodes = html => [...walk(parseMarkup(html))];
const byAttr = (html, name, value) => nodes(html).filter(n => n.attrs?.[name] !== undefined && (value === undefined || n.attrs[name] === value));
/** Each text run, trimmed, in order: the card's lines one by one. */
const texts = node => [...walk(node)].filter(n => n.text !== undefined && n.text.trim()).map(n => n.text.trim());
const primaries = html => nodes(html).filter(n => n.tag === 'button' && /\bgx-btn--primary\b/.test(n.attrs?.class ?? '')).map(nameFrom);

describe('P1B: the next move first, then six tiles', () => {
  const html = render(ready(week(due(3, 14))));
  it('one glow card holds the eyebrow, the next ballot\'s name, its 14-segment week, one meta line and the one lime "Make picks"', () => {
    expect(markupProblems(html)).toEqual([]);
    const [hero] = byAttr(html, 'data-play', 'hero');
    expect(hero.attrs['data-hero']).toBe('next');
    expect(texts(hero)).toEqual(['Your next move', 'Guess the Spread', '3 of 14 locked · first kickoff Thu 5:15 PM PT', 'Make picks']);
    expect([...walk(hero)].filter(n => /\bgx-meter3-seg\b/.test(n.attrs?.class ?? ''))).toHaveLength(14);
    expect([...walk(hero)].filter(n => /\bgx-meter3-seg--on\b/.test(n.attrs?.class ?? ''))).toHaveLength(3);
    expect(nodes(html).filter(n => /\bgx-card--hero\b/.test(n.attrs?.class ?? ''))).toHaveLength(1);
    expect(primaries(html)).toEqual(['Make picks']);
  });
  it('the tiles follow in Sean\'s order: the other ballot, Points, Your score, League, Badges, Compare', () => {
    expect(byAttr(html, 'data-play-tile').map(n => n.attrs['data-play-tile'])).toEqual(['ballot', 'points', 'score', 'league', 'badges', 'compare']);
    const [ballot] = byAttr(html, 'data-play-tile', 'ballot');
    const [button] = [...walk(ballot)].filter(n => n.tag === 'button');
    expect(nameFrom(button)).toBe('Guess the Total, all 14 locked');
    expect(readText(ballot)).toContain('14 / 14');
    expect(readText(ballot)).toContain('All locked');
  });
  it('replaces the focus card, the rows, the Points glow card and "More in Play"', () => {
    for (const gone of ['gx-focus-action', 'gx-focus-rows', 'Continue guessing', 'More in Play', 'My league', 'data-points-landing']) expect(html).not.toContain(gone);
  });
  it('opens the Play scope, so a moment waiting for this card plays where it shows', () => {
    expect(state.scopes).toContain('play');
  });
});

describe('the first card in its other states', () => {
  it('both ballots done: "This week", "Week 9 locked in" and "Review your guesses"', () => {
    const [hero] = byAttr(render(ready(week(due(14, 14), 'done'))), 'data-play', 'hero');
    expect(texts(hero)).toEqual(['This week', 'Week 9 locked in', 'Spread and Total, all 28 locked', 'Review your guesses']);
  });
  it('no week open: the latest result, as "Your week, at a glance" was, with no meter', () => {
    const html = render(ready({ viewer: 'fixture', picksDue: { state: 'none', modes: [] }, due: [], members: [] }));
    const [hero] = byAttr(html, 'data-play', 'hero');
    expect(texts(hero)).toEqual(['Your results', 'Your week, at a glance', 'No week is open yet. Your past results are still here.', 'View your results']);
    expect(html).not.toContain('gx-meter3');
    expect(primaries(html)).toEqual(['View your results']);
  });
  it('a first read that failed: the failure in the card\'s place, every tile still there, no false zero and no lime button', () => {
    const html = render({ status: 'error', data: null, error: { status: 503, message: 'Unavailable.' } });
    expect(html).toContain('could not be loaded');
    expect(byAttr(html, 'data-play-tile')).toHaveLength(6);
    expect(readText(byAttr(html, 'data-play-tile', 'ballot')[0])).toContain('—');
    expect(html).not.toMatch(/\b0 \/ 14\b|Make picks/);
    expect(primaries(html)).toEqual([]);
  });
  it('a failed refresh keeps the last copy and says so, with Refresh week', () => {
    const html = render({ status: 'ready', data: week(due(3, 0)), error: { status: 503 } });
    expect(html).toContain('This week could not refresh. Showing the last loaded update.');
    expect(html).toContain('Refresh week');
    expect(byAttr(html, 'data-play', 'hero')).toHaveLength(1);
  });
});

describe('Whole week locked on the landing', () => {
  it('NEW shows on the ballot tile while the moment waits for the picks card, and not otherwise', () => {
    const waiting = render(ready(week(due(3, 14))), { newCounts: { picks: 1 } });
    expect(readText(byAttr(waiting, 'data-play-tile', 'ballot')[0])).toContain('NEW');
    expect(nameFrom([...walk(byAttr(waiting, 'data-play-tile', 'ballot')[0])].find(n => n.tag === 'button'))).toBe('Guess the Total, all 14 locked, new');
    expect(readText(byAttr(render(ready(week(due(3, 14)))), 'data-play-tile', 'ballot')[0])).not.toContain('NEW');
  });
});
```

Append to `tests/next-router.test.mjs` (`initialState`, `reduce`, `fragmentFor` and `placeFromFragment` are imported):

```js
// play/PlayLayer.jsx CLOSED_LAYER (a .jsx module, so its value is restated here): what openPlay clears.
const CLOSED_LAYER = Object.freeze({ layer: undefined, item: undefined, scoreGame: undefined });
test('D-69 step 1: the Play landing opens each section on its first layer, a reload reopens it, and Back returns to the landing', () => {
  // A game card left open earlier, then the landing.
  let state = initialState({ tab: 'play', view: { section: 'picks', market: 'total', season: 2026, week: 9, pickGame: 'DEN-CAR' } });
  state = reduce(state, { type: 'go', tab: 'play', view: { section: undefined, ...CLOSED_LAYER } });
  assert.equal(placeFromFragment(fragmentFor('play', state.views.play)).view.section, undefined, 'the landing is Play with no section');
  assert.equal(state.views.play.pickGame, undefined);
  // "Make picks" and the ballot tile (openPlay with the week the landing shows): the week's card, never the old game.
  const picks = reduce(state, { type: 'go', tab: 'play', view: { section: 'picks', ...CLOSED_LAYER, market: 'spread', season: 2026, week: 9 } });
  assert.equal(picks.views.play.pickGame, undefined);
  assert.equal(fragmentFor('play', picks.views.play), '#play/picks?market=spread&season=2026&week=9');
  assert.deepEqual(placeFromFragment(fragmentFor('play', picks.views.play)), { tab: 'play', view: { section: 'picks', market: 'spread', season: 2026, week: 9 } });
  assert.equal(reduce(picks, { type: 'back' }).views.play.section, undefined, 'Back from a section returns to the landing');
  // "View your results" and the other tiles open their section the same way.
  for (const section of ['score', 'compare', 'points', 'features', 'league']) {
    const opened = reduce(state, { type: 'go', tab: 'play', view: { section, ...CLOSED_LAYER } });
    assert.equal(placeFromFragment(fragmentFor('play', opened.views.play)).view.section, section);
  }
});
```

- [ ] **Step 6: Run them.** Run: `npx vitest run tests/next-play-landing.test.jsx`. Expected: FAIL. There is no
  `data-play="hero"`, because the old landing renders `FocusAction`. Run: `node --test tests/next-router.test.mjs`.
  Expected: PASS. It guards routing that already exists, and Tasks 1 and 2 keep it [executed against `origin/main`'s
  and a Task 2-patched `state.js`].

- [ ] **Step 7: Write the hook, the stylesheet and the landing.** Create `web/src/next/play/useWeekLocked.js`:

```js
// D-69 step 1, Whole week locked (a small moment): the shared Community read reports it wherever Play is open, and the
// line that says "N of N locked" pops on the card that shows it. Moments come only from fresh server reads: the shared
// store changes `community.data` only when a read succeeds, so a request still on its way or a failed refresh reports
// nothing (D-69 section 4.2, rule 1).
import { useEffect } from 'react';
import { useMoments } from '../moments/MomentsProvider.jsx';
import { WEEK_LOCKED_SOURCE, weekLockedMoments } from './landing.js';

/** Reports this account's Whole week locked moments from each fresh Community read. Another account's read never reports. */
export function useWeekLocked(app) {
  const moments = useMoments(), data = app?.community?.data ?? null, viewer = app?.accountId ?? '';
  const report = moments?.report;
  useEffect(() => {
    if (!report || !data || !viewer) return;
    if (typeof data.viewer === 'string' && data.viewer.toLowerCase() !== viewer.toLowerCase()) return;
    report(weekLockedMoments(data), { source: WEEK_LOCKED_SOURCE });
  }, [report, data, viewer]);
}
```

Create `web/src/next/play/landing.css`:

```css
/* D-69 step 1 (Sean's P1B): the Play landing. One glow card (the kit's hero card) holds the next move; six tiles sit
   under it in two columns on the page. Tokens only. */
.gx .gx-play-landing { gap: var(--gx-space-3); }
.gx .gx-play-hero { display: flex; flex-direction: column; gap: var(--gx-space-3); }
/* The eyebrow is a label, not lime: lime marks only the one main button and your selections (D-38). */
.gx .gx-play-hero-eyebrow { color: var(--gx-text-2); }
.gx .gx-play-hero .gx-t-title { overflow-wrap: anywhere; }
.gx .gx-play-hero-meter .gx-meter3-seg { height: 8px; border-radius: 4px; }
.gx .gx-play-hero > .gx-btn { margin-top: var(--gx-space-1); }
.gx .gx-play-tiles > li { display: flex; min-width: 0; }
/* A tile that has nothing to show yet (its own read loading or off) leaves no empty cell. */
.gx .gx-play-tiles > li:empty { display: none; }
.gx .gx-play-tiles .gx-nest-tile { background: var(--gx-surface-1); }
```

In `web/src/next/play/Play.jsx`, replace everything from line 1 through the end of the import block with the
following. At this point Tasks 2 and 3 have shortened the `score` and `compare` lines, and Task 4 has kept
`PointsLandingCard`. The four imports marked `7b` serve the old `PlayDetail` until Task 7b.

```jsx
// Play (D-69 step 1). The landing is Sean's P1B (November 3, 2026): one glow card with the ballot to do next, then six
// tiles in two columns, each opening its own section on its first layer (openPlay). Picks are the per-game cards
// (PerGamePlay.jsx).
import { useCallback, useId, useMemo, useRef } from 'react';
import { WeekPicks } from '../../CommunityHome.jsx'; // 7b
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { COMMUNITY } from '../data/league.js'; // 7b
import { useShell } from '../shell/context.js';
import { Button, Card, Meter } from '../ui/index.js';
import '../ui/focusLanding.css';
import { HomeGuide } from '../home/HomeGuide.jsx';
import { useAccountPreferences } from '../me/AccountPreferences.jsx';
import { LeagueScreen } from '../league/LeagueScreen.jsx';
import { LeagueTile } from '../league/LeagueTile.jsx';
import { playPresentation } from './PlayPresentation.jsx'; // 7b
import './play.css';
import './landing.css';
import { cloudApi } from '../../api.js';
import { useLeagueRead } from '../league/useLeagueRead.jsx';
import { PerGameEditor } from './PerGamePlay.jsx';
import { PlayEmpty, PlayFailure, PlayLoading } from './PlayStates.jsx';
import { ScoreComparison } from './ScoreComparison.jsx';
import { WeeklyScore } from './WeeklyScore.jsx';
import { perGameReady } from './scoring.js'; // 7b
import { ScoreTile } from './ScoreTile.jsx';
import { CompareTile } from './CompareTile.jsx';
import { PlayTile } from './PlayTile.jsx';
import { openPlay } from './PlayLayer.jsx';
import { ballotTile, otherMarket, playHero } from './landing.js';
import { weekLockedId } from './moments.js';
import { useWeekLocked } from './useWeekLocked.js';
import { PointsBallot } from './points/PointsBallot.jsx';
import { PointsTile } from './points/PointsTile.jsx';
import { FeaturesScreen } from '../features/FeaturesScreen.jsx';
import { BadgesTile } from '../features/BadgesTile.jsx';
import { ReminderPrompt } from '../me/PickReminders.jsx';
import { SCOPES } from '../moments/catalog.js';
import { useMomentScope, useNewCount, usePopped } from '../moments/MomentsProvider.jsx';
```

`InfoButton`, `INFO`, `FocusLanding.jsx`, `homeHero`, `nextGuess`, `PointsLandingCard`, `usePointsRead` and
`PlayFeaturesRow` are no longer imported. Keep `modeOf`, `marketKey` and `rememberedMarket`. Then replace `Play()` and
the whole `PlayLanding()` with:

```jsx
export function Play() {
  const shell = useShell(), app = useAppData();
  // D-69: Whole week locked reads the shared Community read wherever Play is open (the landing or the picks card).
  useWeekLocked(app);
  const section = shell.state.views.play.section;
  if (section === 'league') return <LeagueScreen/>;
  if (section === 'points') return <PointsBallot/>;
  if (section === 'features') return <FeaturesScreen/>;
  if (!['picks', 'score', 'compare'].includes(section)) return <PlayLanding/>;
  return <PlayDetail/>;
}

function PlayLanding() {
  const app = useAppData(), shell = useShell(), data = app.community.data;
  const preferences = useAccountPreferences(app);
  useMomentScope(SCOPES.play);
  const heroButton = useRef(null), pointsTile = useRef(null), eyebrowId = useId();
  const hero = data ? playHero(data) : null, week = data?.week ?? null;
  const other = otherMarket(hero?.market ?? 'spread'), tile = ballotTile(data, other);
  // NEW: a Whole week locked moment waits for the picks card (while a ballot is open it can only be the tile's market).
  const waiting = useNewCount(SCOPES.picks) > 0;
  const lockedId = mode => (week && Number.isInteger(week.season) ? weekLockedId(week.season, week.week, mode) : '');
  const heroPop = usePopped(hero?.progress ? lockedId(hero.progress.mode) : '');
  const tilePop = usePopped(lockedId(modeOf(other)));
  const openPicks = market => openPlay(shell, 'picks', { market, season: week?.season ?? null, week: week?.week ?? null });
  const go = target => (target.section === 'picks' ? openPicks(target.market) : openPlay(shell, target.section));
  // The reminder prompt sits under the first card until it is answered; when it leaves, focus returns to that card's
  // button (or, with no week loaded, to the Points tile).
  const onPromptGone = () => (heroButton.current ?? pointsTile.current)?.focus();
  return <div className="gx-screen gx-play-landing" data-landing="play">
    <div className="gx-focus-heading"><h1 className="gx-t-title">Play</h1>{hero?.week != null && <p className="gx-t-meta">Week {hero.week}</p>}</div>
    {hero ? <Card as="section" variant="hero" className="gx-play-hero" aria-labelledby={eyebrowId} data-play="hero" data-hero={hero.kind}>
      <p className="gx-t-micro gx-play-hero-eyebrow" id={eyebrowId}>{hero.eyebrow}</p>
      <h2 className="gx-t-title">{hero.title}</h2>
      {hero.progress ? <Meter value={hero.progress.done} max={hero.progress.of} className="gx-play-hero-meter"/> : null}
      <p className="gx-t-meta" data-play="hero-line" data-moment={heroPop ? 'pop' : undefined}>{hero.line}</p>
      <Button ref={heroButton} variant="primary" block onClick={() => go(hero.target)}>{hero.action}</Button>
    </Card>
      : app.community.status === 'error' ? <PlayFailure what="Your picks" error={app.community.error} onRetry={() => app.refresh({ only: ['community'] })}/>
      : <PlayLoading>Loading your picks…</PlayLoading>}
    {/* A failed refresh keeps the last good copy with its error noted (data/store.js): say so under the card. */}
    {data && (app.community.status === 'error' || app.community.error) ? <p className="gx-play-state-line gx-t-body" role="status">This week could not refresh. Showing the last loaded update. <Button variant="ghost" onClick={() => app.refresh({ only: ['community'] })}>Refresh week</Button></p> : null}
    <ReminderPrompt key={app.accountId} onGone={onPromptGone}/>
    <ul className="gx-nest-grid gx-play-tiles" aria-label="Play sections" data-play="tiles">
      <li data-play-tile="ballot" data-moment={tilePop ? 'pop' : undefined}><PlayTile icon="target" label={tile.label} big={tile.big} sub={tile.sub} tone={tile.tone} ariaLabel={waiting ? `${tile.ariaLabel}, new` : tile.ariaLabel} isNew={waiting} onClick={() => openPicks(other)}/></li>
      <li data-play-tile="points"><PointsTile ref={pointsTile} onOpen={() => openPlay(shell, 'points')}/></li>
      <li data-play-tile="score"><ScoreTile onOpen={patch => openPlay(shell, 'score', patch)}/></li>
      <li data-play-tile="league"><LeagueTile onOpen={() => openPlay(shell, 'league')}/></li>
      <li data-play-tile="badges"><BadgesTile onOpen={() => openPlay(shell, 'features')}/></li>
      <li data-play-tile="compare"><CompareTile onOpen={view => openPlay(shell, 'compare', view)}/></li>
    </ul>
    <details className="gx-focus-help"><summary className="gx-t-strong">How to play</summary><HomeGuide key={app.accountId} preferences={preferences} perGame={data?.rules?.perGameScoring === true}/></details>
  </div>;
}
```

Two deliberate differences from the old landing:
- **The "could not refresh" line now shows.** It used to wait for `status === 'error'`. With a copy loaded, the store
  reports `status: 'ready'` and puts the failure in `error` (`data/store.js` `get`), so the line never appeared in the
  app [inspected]. This version checks for both. `home/Home.jsx` line 197 has the same pattern, flagged for step 2.
- **The landing holds `SCOPES.play` open**, as `PlayFeaturesRow` did. `BadgesTile` holds it too, and a second hold is
  harmless.

- [ ] **Step 8: Retire the Points glow card and the features row.** Nothing renders them now.
  - In `web/src/next/play/points/PointsBallot.jsx`:
    - Delete `export function PointsLandingCard({ ref, read, onOpen }) { … }` and its doc comment.
    - Remove `landingCard, ` from the `./pointsModel.js` import.
  - In `points/pointsModel.js`, delete `export function landingCard(read, error) { … }` and its doc comment.
  - In `points/points.css`, delete the `.gx .gx-pt-landing { … }` and `.gx .gx-pt-landing-top { … }` rules.
  - Run `git rm web/src/next/features/FeatureRows.jsx`.
  - Check: `git grep -n "landingCard\|PointsLandingCard\|gx-pt-landing\|PlayFeaturesRow\|FeatureRows" -- web` prints nothing.

- [ ] **Step 9: Update the unit tests this breaks** [executed on the copy].
  - `tests/four-tab-landings.test.jsx`. Replace line 6 (the `CommunityHome.jsx` mock) with:

```jsx
// D-69 step 1: Play's landing tiles are each page's own component with its own tests; here they are stand-ins.
const tile = (name, label) => ({ [name]: () => <button type="button">{label}</button> });
vi.mock('../web/src/next/play/ScoreTile.jsx', () => tile('ScoreTile', 'Your score'));
vi.mock('../web/src/next/play/CompareTile.jsx', () => tile('CompareTile', 'Compare'));
vi.mock('../web/src/next/play/points/PointsTile.jsx', () => tile('PointsTile', 'Guess the Points'));
vi.mock('../web/src/next/features/BadgesTile.jsx', () => tile('BadgesTile', 'Badges'));
vi.mock('../web/src/next/league/LeagueTile.jsx', () => tile('LeagueTile', 'League'));
```

  - In the same file, replace the `'Play leads with the still-due Total market and keeps Spread reachable'` test with
    the test below. It keeps the contract: the due market leads, the other market stays reachable, and there is one
    lime button.

```jsx
  // D-69 step 1 (P1B): the first card is the ballot to do next; the other ballot, your results and the League are tiles.
  it('Play leads with the still-due Total market and keeps Spread, your results and the League one tile away', () => {
    const html = render(Play);
    expect(markupProblems(html)).toEqual([]);
    expect(html).toContain('Guess the Total');
    expect(html).toContain('Guess the Spread');
    for (const name of ['ballot', 'score', 'league']) expect(html).toContain(`data-play-tile="${name}"`);
    expect((html.match(/gx-btn--primary/g) || [])).toHaveLength(1);
  });
```

  - In the `'an unavailable week …'` test:
    - `not.toContain('Continue guessing')` becomes `not.toContain('Make picks')`.
    - `toContain('My league')` becomes `toContain('data-play-tile="league"')`.
  - `tests/next-points-ui.test.jsx`:
    - Delete the whole `describe('Play landing row', …)`. Its glow-card contract is now `next-play-landing.test.jsx`'s
      "one glow card" test.
    - Delete the `expect(model.landingCard(null, { status: 404 }))…` line.
    - Remove `PointsLandingCard` from the line 17 import.

- [ ] **Step 10: Run the unit tests.** Run: `node --test tests/next-play-landing.test.mjs tests/next-router.test.mjs tests/next-tokens.test.mjs && npx vitest run tests/next-play-landing.test.jsx tests/four-tab-landings.test.jsx tests/next-points-ui.test.jsx`.
  Expected: PASS. `landing.css` must pass the tokens test [executed: 9 + 9 + 5 tests and tokens on the copy].

- [ ] **Step 11: Update the browser specs that enter Play from the old landing.** The selector changes are below.
  Each spec keeps its contract.
  - `next-play-moments.spec.js` line 83, `next-per-game-scoring.spec.js` (both entries), `nba.spec.js` line 345, and
    `next-play-nest.spec.js` line 38: `page.getByRole('button', { name: 'Continue guessing', exact: true })` becomes
    `page.getByRole('button', { name: 'Make picks', exact: true })`.
  - In `nba.spec.js`, the comment above it becomes "The Play landing (D-69 P1B) opens the per-game editor from its one
    primary action."
  - `next-play-nest.spec.js` line 109:
    `await expect(page.getByRole('button', { name: 'Continue guessing', exact: true })).toBeVisible();` becomes
    `await expect(page.locator('[data-landing="play"] [data-play="hero"]').getByRole('button', { name: 'Make picks', exact: true })).toBeVisible();`.
  - `comparisons-home.spec.js`: replace Task 3's `await page.evaluate(() => { location.hash = '#play/compare'; });` with
    `await page.locator('[data-play-tile="compare"]').getByRole('button').click();`.
  - `next-data.spec.js` line 397: `await page.getByRole('button', { name: 'My league', exact: true }).click();` becomes
    `await page.locator('[data-play-tile="league"]').getByRole('button').click();`.
  - `next-features.spec.js` (Task 5's hand-off):
    - Line 58: `page.getByRole('button', { name: 'My league' })` becomes
      `page.locator('[data-play-tile="league"]').getByRole('button')`.
    - Line 59: `await expect(page.getByRole('button', { name: 'Badges, coming soon' })).toBeVisible();`.
    - The next test's `const row = page.getByRole('button', { name: 'Badges and awards' });` becomes
      `const row = page.getByRole('button', { name: /^Badges, 0 earned/ });`.
  - `next-points.spec.js`. Task 4's tile names start "Guess the Points, ", so the old names still match.
    - Line 50: `await expect(row).toHaveClass(/gx-card--hero/);` becomes
      `await expect(row).not.toHaveClass(/gx-card--hero/); // P1B: Points is a tile; the one glow card is the next move`.
    - The `'My league'` click becomes the league-tile locator above.
    - Line 254 becomes
      `await expect(page.locator('[data-play="hero"] ~ [data-reminder-prompt] ~ [data-play="tiles"]')).toHaveCount(1);`,
      and its comment becomes "The prompt follows the first card, before the tiles, and offers no lime button."
    - `await expect(page.locator('[data-points-landing]')).toBeFocused();` becomes
      `await expect(page.locator('[data-play="hero"] .gx-btn--primary')).toBeFocused();`, and the comment above it
      ends "focus returns to the first card's button".
    - Every other `page.locator('[data-points-landing]')`, including Task 4's three new ones, becomes
      `page.getByRole('button', { name: /^Guess the Points, / })`.
  - Check: `git grep -n "Continue guessing\|My league\|data-points-landing\|Badges and awards' })" -- tests` lists no
    landing use.

- [ ] **Step 12: Run them.** Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/four-tab-redesign.spec.js tests/cloud-browser/next-play-nest.spec.js tests/cloud-browser/next-play-moments.spec.js tests/cloud-browser/next-per-game-scoring.spec.js tests/cloud-browser/comparisons-home.spec.js tests/cloud-browser/next-data.spec.js tests/cloud-browser/next-features.spec.js tests/cloud-browser/next-points.spec.js tests/cloud-browser/nba.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js`.
  Expected: PASS, `skipped 0`. `four-tab-redesign` holds the landing to one lime button, no sideways scroll at 320 and
  390 px in both themes, and axe clean. [executed on the copy, with stand-in tiles and the pre-Task 2/3/6 pages; the
  `next-features` and `next-points` name lines depend on Tasks 4 and 5]

- [ ] **Step 13: Commit.**

```bash
git add web/src/next/play/landing.js web/src/next/play/useWeekLocked.js web/src/next/play/landing.css web/src/next/play/Play.jsx web/src/next/play/moments.js web/src/next/play/points/PointsBallot.jsx web/src/next/play/points/pointsModel.js web/src/next/play/points/points.css tests/next-play-landing.test.mjs tests/next-play-landing.test.jsx tests/next-router.test.mjs tests/four-tab-landings.test.jsx tests/next-points-ui.test.jsx tests/cloud-browser/{next-play-nest,next-play-moments,next-per-game-scoring,nba,comparisons-home,next-data,next-features,next-points}.spec.js
git diff --cached --stat && git ls-files --eol web/src/next/play/landing.js web/src/next/play/landing.css web/src/next/play/Play.jsx
git commit -m "Play landing: the next ballot first, six tiles, and Whole week locked (P1B, D-69 step 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(The `git rm` in Step 8 has already staged the deletion of `FeatureRows.jsx`.)

### Task 7b: Picks without the old editor, and Whole week locked on the picks card

`PlayDetail` stops mounting `WeekPicks` from `CommunityHome.jsx` (spec test 13). Under rules that are not per-game,
the same per-game cards show the saved ballot read-only:
- Every saved guess shows, as do submitted receipts with the owner's saved line (the D-16 gate, as before) and older
  drafts. Nothing that writes is offered.
- D-23: nothing entered is deleted or hidden. The whole-market writes (Save draft, Submit, Save changes and the
  whole-week sit-out) are no longer reachable in the new app.
- Hosted `gtl_live_rules()` returns per-game rules as a constant (`20261015190710_gtl_guess_write_window.sql`).
  `cloud/live-rules.mjs` falls back to whole-market rules only when that function is missing [inspected]. In
  production this path was a fallback no player reached.
- The old app keeps its editor. The smallest safe path back to whole-market editing is the previous Pages build.

The picks card opens `SCOPES.picks`. The "N of N locked" lines pop through `usePopped`.

**Files:**
- Modify: `web/src/next/play/Play.jsx` (`PlayDetail`, `SelectedPlay`, the four `7b` imports, `marketKey`,
  `rememberedMarket`), `web/src/next/play/PerGamePlay.jsx`, `web/src/next/play/WeekProgress.jsx`,
  `docs/ALL_TABS_LIVE_WORKFLOWS.md`
- Delete: `web/src/next/play/PlayPresentation.jsx` (only `WeekPicks` in Play used it [inspected])
- Tests: `tests/next-play-nest.test.jsx` (one `describe`), `tests/next-teams.test.jsx`, `tests/next-app-view.test.mjs`,
  `tests/cloud-browser/next-play-live.spec.js` (rewritten), `tests/cloud-browser/next-play-nest.spec.js` (one test)

**Interfaces:** `PerGameEditor` keeps its props. When `perGameReady(data.rules)` is false (`active`), it:
- shows `[data-play="read-only"]` ("View only for now. Your saved guesses are shown and kept.");
- draws each unlocked game's guess as `[data-play="saved-guess"]` text instead of the picker;
- hides Save draft, Lock in, Next to lock and sit-out;
- registers no unsaved work;
- counts nothing as waiting for a line.
`WeekProgress` draws no Next button without `onNext`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/next-play-nest.test.jsx`:

```jsx

// D-69 step 1: Play no longer mounts the old whole-market editor (CommunityHome.jsx WeekPicks). Under rules that are not
// per-game (a server without M-07) the same cards show the saved ballot read-only: every guess shows, nothing is offered
// that would write, and the owner's saved line on a submitted ballot stays on its receipt (D-23, D-31 as before).
describe('rules that are not per-game: the same cards, read-only', () => {
  const SUBMITTED = at(-5 * 24 * 60);
  const wholeMarket = { ...data, rules: { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' }, scoring: undefined, ballots: {
    guess_total: { picks: { 'JAX-BAL': 44.5, 'DEN-CAR': 41, 'DET-MIA': 50.5 }, submittedAt: SUBMITTED,
      scoringReferences: { 'DEN-CAR': { value: 42.5, source: 'Synthetic three-book median', observedAt: SUBMITTED, savedAt: SUBMITTED, status: 'available' } } },
    guess_spread: { picks: { 'DEN-CAR': -3 } },
  } };
  const readOnly = (game, mode = 'guess_total') => render(nest(game), { initialData: wholeMarket, mode });
  const writers = name => /^(Save draft|Lock in|Sit out|Next to lock|Use unlocked)/.test(name);
  /** Buttons a player can reach now: the closed lock-in and sit-out dialogs keep their own Confirm buttons. */
  const reachable = html => { const found = [], visit = n => { if (n.tag === 'dialog') return; if (n.tag === 'button') found.push(nameFrom(n)); (n.children ?? []).forEach(visit); }; visit(parseMarkup(html)); return found; };
  it('the week: every saved guess on its tile, one line saying why, no lime button and nothing that writes', () => {
    const html = readOnly(undefined);
    expect(markupProblems(html)).toEqual([]);
    expect(textOf(nodes(html).find(n => n.attrs?.['data-play'] === 'read-only'))).toBe('View only for now. Your saved guesses are shown and kept.');
    expect(tiles(html).map(n => n.attrs['data-state'])).toEqual(['locked', 'locked', 'locked', 'open']);
    expect(tiles(html).map(nameFrom)).toEqual([
      'Jacksonville Jaguars at Baltimore Ravens, Locked, 44.5', 'Denver Broncos at Carolina Panthers, Locked, 41',
      'Detroit Lions at Miami Dolphins, Locked, 50.5', 'Buffalo Bills at Minnesota Vikings, Next, no guess',
    ]);
    expect(reachable(html).filter(writers)).toEqual([]);
    expect(reachable(html)).toContain('Check saved picks');
    expect(html).not.toContain('waiting for a sportsbook line');
    expect(primaries(html)).toEqual([]);
    for (const sentence of surface(html)) expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(12);
  });
  it('a submitted game: its receipt with your guess and your saved line, no picker and no Lock in', () => {
    const html = readOnly('DEN-CAR');
    expect(markupProblems(html)).toEqual([]);
    const receipt = nodes(html).find(n => n.attrs?.['aria-label'] === 'DEN at CAR Total receipt');
    expect(textOf(receipt)).toContain('41');
    expect(textOf(receipt)).toContain('42.5');
    expect(html).not.toContain('gx-guess');
    expect(reachable(html).filter(writers)).toEqual([]);
  });
  it('an open game says "No guess yet" and a draft says its guess in words, with no picker, Lock in or Next', () => {
    const open = readOnly('BUF-MIN');
    expect(textOf(nodes(open).find(n => n.attrs?.['data-play'] === 'saved-guess'))).toBe('No guess yet');
    const draft = readOnly('DEN-CAR', 'guess_spread');
    expect(textOf(nodes(draft).find(n => n.attrs?.['data-play'] === 'saved-guess'))).toBe('Your guess · Panthers −3');
    for (const html of [open, draft]) {
      expect(markupProblems(html)).toEqual([]);
      expect(html).not.toContain('gx-guess');
      expect(reachable(html).filter(writers)).toEqual([]);
      expect(html).not.toContain('Every game is locked in.');
      expect(primaries(html)).toEqual([]);
    }
  });
});
```

In `tests/next-teams.test.jsx`:
- Delete the line `const { playPresentation } = await import('../web/src/next/play/PlayPresentation.jsx');`.
- Delete the `it('the whole-market card (PlayPresentation) keeps its heading name …')` test. The per-game card's marks
  and records stay covered by the two `PerGameEditor` tests above it.

In `tests/next-app-view.test.mjs`:
- Remove `'CommunityHome.jsx': ['WeekPicks'], ` from `namedOnly`, and put this comment above that line:
  `// D-69 step 1 (spec test 13): Play no longer imports CommunityHome.jsx; its WeekPicks is gone from the new app.`
- Delete the line `if (target === 'CommunityHome.jsx') assert.equal(file, 'web/src/next/play/Play.jsx');`.
- After the `PerGameLegacy.jsx` assertion at the end of that test, add:

```js
  // Spec test 13: the rebuilt Play pages no longer import the old screens they replace.
  for (const file of filesUnder('web/src/next')) for (const spec of importsOf(read(file))) assert.doesNotMatch(spec, /CommunityHome|PlayPresentation/, `${file} imports ${spec}`);
```

- [ ] **Step 2: Run them to verify they fail.** Run: `npx vitest run tests/next-play-nest.test.jsx && node --test tests/next-app-view.test.mjs`.
  Expected: FAIL.
  - The read-only `describe` fails because there is no `data-play="read-only"`. The old alert is shown instead, and
    the picker and Lock in are still drawn.
  - `next-app-view` fails with `web/src/next/play/Play.jsx imports ../../CommunityHome.jsx from the old app`.

- [ ] **Step 3: Draw the cards read-only when the rules are not per-game.** Make these exact replacements, written
  as `-` old line and `+` new lines.

In `web/src/next/play/PerGamePlay.jsx`:

```diff
-import { confirmedLockIns, revealRows, weekProgress } from './moments.js';
+import { confirmedLockIns, revealRows, weekLockedId, weekProgress } from './moments.js';
+import { usePopped } from '../moments/MomentsProvider.jsx';
@@ directly above `export function PerGameEditor(`
+/** A line that pops once (D-69 Whole week locked) when it was on screen as the moment played; elsewhere just its words. */
+function LockedLine({ id, children, ...rest }) {
+  const pop = usePopped(id);
+  return <p {...rest} data-moment={pop ? 'pop' : undefined}>{children}</p>;
+}
+
-  const waitingAnswers = data.games.filter(game => {
+  // Rules that are not per-game send no score receipts, so no locked guess there waits for a line.
+  const waitingAnswers = !perGameReady(data.rules) ? 0 : data.games.filter(game => {
-  useEffect(() => { setDirty?.(key, !satOut && dirty || uncertain || busy, keeps); return () => setDirty?.(key, false); }, [key, dirty, satOut, uncertain, busy, setDirty, keeps]);
+  // Read-only rules (not per-game) keep no unsaved work to guard: nothing on these cards can be saved.
+  useEffect(() => { setDirty?.(key, active && !satOut && dirty || uncertain || busy, keeps); return () => setDirty?.(key, false); }, [key, active, dirty, satOut, uncertain, busy, setDirty, keeps]);
@@ after `const progress = weekProgress({ games: data.games, ballot, picks, now, openAt, satOut });`
+  const lockedId = weekLockedId(data.season, data.week, mode);
-    {!active && <p role="alert" className="gx-t-body">The scoring rules changed. Refresh before making another pick.</p>}
+    {/* D-69 step 1: rules that are not per-game show these cards read-only; the old whole-market editor is retired. */}
+    {!active && <p role="status" className="gx-t-body" data-play="read-only">View only for now. Your saved guesses are shown and kept.</p>}
-    {draft && dirty && !uncertain && !satOut && <p className="gx-t-meta gx-c-2">Unsaved guesses stay in this tab. Save draft to use another device.</p>}
+    {draft && dirty && active && !uncertain && !satOut && <p className="gx-t-meta gx-c-2">Unsaved guesses stay in this tab. Save draft to use another device.</p>}
@@ in `checkAndSave`, the Save draft button only:
-<Button disabled={busy || !dirty || uncertain || !active || satOut} onClick={() => save()}>Save draft</Button>
+{active ? <Button disabled={busy || !dirty || uncertain || satOut} onClick={() => save()}>Save draft</Button> : null}
-    const receipt = data.scoring?.[mode]?.games?.find(row => row.gameId === game.id);
+    // Whole-market rules send no score receipt; the owner's saved line on a submitted ballot stands in (D-16, as before).
+    const receipt = data.scoring?.[mode]?.games?.find(row => row.gameId === game.id) ?? (!active && ballot?.scoringReferences?.[game.id] ? { reference: ballot.scoringReferences[game.id] } : undefined);
@@ in `gameCard`, insert above the line that starts `        : <><div className="gx-play-entry">`
+        : !active ? <p className="gx-t-body" data-play="saved-guess">{number(value) === null ? 'No guess yet' : `${String(value) === String(base[game.id]) ? 'Your guess' : 'Unsaved guess'} · ${pickText(mode, game.awayCode, game.homeCode, number(value))}`}</p>
-        {after ? <Button variant={lockable(open) ? 'ghost' : 'primary'} iconEnd="chevronRight" className="gx-play-next" onClick={() => nest.onOpen(after.id)}>Next to lock · <Matchup away={after.game.awayCode} home={after.game.homeCode}/></Button>
-          : <p className="gx-t-meta gx-c-2">{progress.locked === progress.total ? 'Every game is locked in.' : 'Nothing left to lock this week.'}</p>}
+        {after && active ? <Button variant={lockable(open) ? 'ghost' : 'primary'} iconEnd="chevronRight" className="gx-play-next" onClick={() => nest.onOpen(after.id)}>Next to lock · <Matchup away={after.game.awayCode} home={after.game.homeCode}/></Button>
+          : active ? <LockedLine id={lockedId} className="gx-t-meta gx-c-2">{progress.locked === progress.total ? 'Every game is locked in.' : 'Nothing left to lock this week.'}</LockedLine> : null}
-          <p className="gx-t-meta" data-play="count">{progress.summary}</p>
+          <LockedLine id={lockedId} className="gx-t-meta" data-play="count">{progress.summary}</LockedLine>
-          <WeekProgress progress={progress} market={market} week={data.week} onNext={nest.onOpen} nested/>
+          <WeekProgress progress={progress} market={market} week={data.week} onNext={active ? nest.onOpen : undefined} nested/>
```

In `web/src/next/play/WeekProgress.jsx`, the doc comment's `` `onNext(gameId)` moves to that game's card. `` becomes
`` `onNext(gameId)` moves to that game's card (none, as on read-only cards, draws no Next button). ``, and:

```diff
-    {next ? <Button variant="ghost" iconEnd="chevronRight" className="gx-play-next" onClick={() => onNext?.(next.id)}>Next to lock · <Matchup away={next.game.awayCode} home={next.game.homeCode}/></Button>
+    {next ? onNext ? <Button variant="ghost" iconEnd="chevronRight" className="gx-play-next" onClick={() => onNext(next.id)}>Next to lock · <Matchup away={next.game.awayCode} home={next.game.homeCode}/></Button> : null
```

The old app's `PerGameLegacy` loads only under per-game rules (`active` true) and always passes `onNext`, so its page
does not change. It now also imports `MomentsProvider.jsx`, which with no provider is a no-op.

- [ ] **Step 4: Retire the old editor from Play.** In `web/src/next/play/Play.jsx`:
  - Delete the four imports marked `// 7b`, and the `marketKey` and `rememberedMarket` lines. Their only reader was
    `WeekPicks`' `marketNavigation`. Old `gtl.play-market.*` tab keys are left to expire with the tab.
  - Add this sentence to the header: "When the server's rules are not per-game, the same cards show the saved ballot
    read-only, so the old whole-market editor is retired from the new app (spec test 13)."
  - Replace `PlayDetail` and `SelectedPlay` with the code below. The `compare` and `score` lines are Tasks 3 and 2's,
    unchanged. "Your weekly score" now uses `openPlay`, so it opens the score layer's first layer, and Back returns
    to the picks.
  - Run `git rm web/src/next/play/PlayPresentation.jsx`.

```jsx
function PlayDetail() {
  const app = useAppData();
  const shell = useShell();
  const { refresh } = app;
  const personal = useSharedRead('personal');
  const score = shell.state.views.play.section === 'score';
  const market = modeOf(shell.state.views.play.market);
  const refreshBallot = useCallback(() => refresh({ only: ['community', 'personal'] }), [refresh]);
  if (shell.state.views.play.section === 'compare') return <ScoreComparison/>;
  if (score) return <WeeklyScore/>;
  const onMode = mode => shell.setView('play', { market: mode === 'guess_total' ? 'total' : 'spread' });
  return <div className="gx-screen gx-live-play gx-live-workflow gx-vstack gx-gap-16">
    <h1 className="gx-t-title">Your guesses</h1><Button variant="ghost" onClick={() => openPlay(shell, 'score')}>Your weekly score</Button>
    {/* Until the first /personal answer arrives nothing says which week to read, so the cards wait for it. */}
    {personal.data ? <SelectedPlay app={app} shell={shell} current={personal.data} mode={market || 'guess_spread'} onMode={onMode}/>
      : personal.status !== 'error' ? <PlayLoading>Loading your picks…</PlayLoading>
      : personal.error?.status === 404 ? <PlayEmpty>No week is open yet. Weeks open Monday 12:00 AM PT once the schedule is published.</PlayEmpty>
      : <PlayFailure what="Your picks" error={personal.error} onRetry={refreshBallot}/>}
  </div>;
}

function SelectedPlay({ app, shell, current, mode, onMode }) {
  // The picks card holds Whole week locked (D-69): the read that reaches N of N while it is open pops its count line.
  useMomentScope(SCOPES.picks);
  const view = shell.state.views.play;
  const season = Number.isInteger(view.season) ? view.season : current.season;
  const week = Number.isInteger(view.week) ? view.week : current.week;
  const read = useLeagueRead(`${app.accountId}:play:${season}:${week}:${mode}`, signal => cloudApi('personal/read', { season, week }, { signal }), error => { if (error.status === 401) app.requestSignIn(); });
  // D-70: the week and its games are nesting cards on one address key (`pickGame`); the editor and its drafts stay
  // mounted between them, so moving there never asks to leave unsaved guesses.
  const { setView } = shell, { market: viewMarket, season: viewSeason, week: viewWeek } = view;
  const keeps = useCallback(next => next.tab === 'play' && next.views.play.section === 'picks'
    && next.views.play.market === viewMarket && next.views.play.season === viewSeason && next.views.play.week === viewWeek, [viewMarket, viewSeason, viewWeek]);
  const nest = useMemo(() => ({ game: view.pickGame, keeps, onOpen: id => setView('play', { pickGame: id }), onWeek: () => setView('play', { pickGame: undefined }) }), [view.pickGame, keeps, setView]);
  if (read.loading) return <PlayLoading>Loading your picks…</PlayLoading>;
  if (read.error) return <PlayFailure what="Your picks" error={read.error} onRetry={read.retry}/>;
  // Rules that are not per-game (a server without M-07) draw these same cards read-only (PerGameEditor's `active`):
  // every saved guess shows and nothing can be written (D-23). The reveal names other players from the shared
  // Community read, and only when it is this account's read.
  const community = app.community.data, members = community?.viewer?.toLowerCase() === app.accountId.toLowerCase() ? community.members ?? [] : [];
  return <PerGameEditor key={`${app.accountId}:${season}:${week}:${mode}`} accountId={app.accountId} initialData={read.data} mode={mode} nest={nest} optOuts={app.community.data?.optOuts || []} reveal={{ members }}
    onMode={onMode} setDirty={shell.setDirty} onSignInAgain={app.requestSignIn} onSaved={() => app.refresh({ only: ['community', 'personal'] })}
    onScore={patch => shell.setView('play', { ...patch, section: 'score' })}/>;
}
```

- [ ] **Step 5: Run the unit tests.** Run: `npx vitest run tests/next-play-nest.test.jsx tests/next-play-moments-ui.test.jsx tests/next-teams.test.jsx tests/four-tab-landings.test.jsx tests/next-play-landing.test.jsx && node --test tests/next-app-view.test.mjs tests/next-tokens.test.mjs`.
  Expected: PASS. The existing per-game tests are unchanged and green [executed: 16 nest, 22 moments-ui, the rest of
  the 95 renders, and node 23/23 on the copy].

- [ ] **Step 6: Replace the D-16 browser spec and add the moment's end-to-end check.** The old
  `tests/cloud-browser/next-play-live.spec.js` drove `WeekPicks` in the new app: whole-market submit, D-16 edits, the
  recovery card and its own sit-out, including Task 6's one-line feed change. Replace the whole file with the version
  below. The per-game counterparts of its other contracts already live in `next-per-game-scoring.spec.js` (a lost
  reply, sit-out) and `next-play-nest.spec.js` (layout and themes). The in-place sign-in contract moves here, as
  test 3.

```js
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { HOSTED } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';
import { chooseMarket, openGame } from './play-nest.mjs';

// D-69 step 1 retires the old whole-market editor (CommunityHome.jsx WeekPicks) from the new app. Under the historical
// D-16 rules (before M-02) Play shows the same per-game cards read-only: every saved guess shows, nothing offers to
// write, and nothing is written. The per-game writer's own contracts (lock-in, a lost reply, sit-out) are in
// next-per-game-scoring.spec.js and next-play-nest.spec.js; the in-place sign-in one is the last test here.
const D16_MIGRATIONS = HOSTED.filter(file => file < '20261015030000_gtl_sent_picks_final.sql');
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(90000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });
const writer = /^(Save draft|Lock in|Submit|Save changes|Sit out|Next to lock)/;
async function fixture(page, baseURL, options = {}) {
  const world = await communityWorld(page, baseURL, { migrations: D16_MIGRATIONS, optionalRpc: true, ...options });
  const lines = values => Object.fromEntries(world.state.games.map((g, i) => [g.id, values[i]]));
  await storeBookLines(world, { spread: lines([-2.5, 6.5]), total: lines([41.5, 47.5]) });
  expect((await world.api('luke', 'personal')).body.rules.sentFinal).toBe(false);
  return world;
}
async function saveDraft(world, mode, picks) {
  const { season, week } = world.state.league, workspace = (await world.api('luke', 'personal')).body;
  const saved = await world.api('luke', 'personal/ballot', { season, week, mode, picks, submit: false, revision: workspace.revision, weeklyRevision: workspace.weeklyRevision, requestId: randomUUID() });
  expect(saved.status).toBe(200);
}
const watchWrites = page => { const writes = []; page.on('request', r => { if (/\/(personal\/ballot|community\/sit-out)$/.test(r.url())) writes.push(r.url()); }); return writes; };

test('historical D-16 rules: the landing and the per-game cards show every saved guess read-only, and nothing is written', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL);
  const [first, second] = world.state.games;
  await sendBallot(world, 'luke', 'guess_spread', { [first.id]: -3, [second.id]: 7 });
  await saveDraft(world, 'guess_total', { [first.id]: 44 });
  const writes = watchWrites(page);
  try {
    await signIn(page, 'luke');
    await tab(page, 'Play').click();
    const hero = page.locator('[data-landing="play"] [data-play="hero"]');
    await expect(hero).toContainText('Guess the Total');
    await expect(hero).toContainText('1 of 2 picked');
    await expect(page.locator('[data-play-tile="ballot"]')).toContainText('Submitted');
    await hero.getByRole('button', { name: 'Make picks', exact: true }).click();
    await expect(page).toHaveURL(/#play\/picks\?market=total/);
    const week = page.locator('.gx-per-game');
    await expect(week.locator('[data-play="read-only"]')).toHaveText('View only for now. Your saved guesses are shown and kept.');
    await expect(week.locator(`[data-tile="${first.id}"]`)).toHaveAttribute('data-state', 'draft');
    await expect(week.locator(`[data-tile="${first.id}"]`)).toContainText('44');
    await expect(page.getByRole('button', { name: writer })).toHaveCount(0);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}`).toBe(true);
        const small = await page.evaluate(() => [...document.querySelectorAll('.gx-per-game button')].filter(el => el.getClientRects().length && !el.closest('dialog:not([open])'))
          .filter(el => el.offsetWidth < 44 || el.offsetHeight < 44).map(el => el.textContent.trim()));
        expect(small, `${theme} ${width}`).toEqual([]);
        const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
        expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${theme} ${width}`).toEqual([]);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const draft = await openGame(page, first.id);
    await expect(draft.locator('[data-play="saved-guess"]')).toHaveText('Your guess · 44');
    await expect(draft.locator('[role="radio"]')).toHaveCount(0);
    await chooseMarket(page, 'Spread');
    await expect(page.locator(`.gx-per-game [data-tile="${first.id}"]`)).toHaveAttribute('data-state', 'locked');
    const sent = await openGame(page, first.id);
    await expect(sent.getByRole('region', { name: /Spread receipt/ })).toBeVisible();
    await expect(page.getByRole('button', { name: writer })).toHaveCount(0);
    expect(writes).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('after the historical Thursday deadline the landing offers results, the cards stay read-only, and nothing is written', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { deadline: new Date(Date.now() - 60 * 60_000).toISOString() });
  const writes = watchWrites(page);
  try {
    await signIn(page, 'luke');
    await tab(page, 'Play').click();
    const hero = page.locator('[data-landing="play"] [data-play="hero"]');
    await expect(hero).toHaveAttribute('data-hero', 'results');
    await expect(hero.getByRole('button', { name: 'View your results', exact: true })).toBeVisible();
    await page.locator('[data-play-tile="ballot"]').getByRole('button').click();
    await expect(page.locator('.gx-per-game [data-play="read-only"]')).toBeVisible();
    await expect(page.getByRole('button', { name: writer })).toHaveCount(0);
    expect(writes).toEqual([]);
    expect((await world.db.query('select mode from public.gtl_weekly_ballots where user_id=$1', [ACCOUNTS.luke.id])).rows).toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('per-game rules: a 401 on lock-in keeps the typed guess through in-place sign-in, and the retry reuses the request id', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: HOSTED, optionalRpc: true });
  const writes = [];
  let refuse = true;
  await page.route(`${SUPABASE}/functions/v1/gtl-api/personal/ballot`, async route => {
    writes.push(route.request().postDataJSON());
    if (!refuse) return route.fallback();
    refuse = false;
    return route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Sign in to continue.' }) });
  });
  try {
    await signIn(page, 'luke');
    await tab(page, 'Play').click();
    await page.getByRole('button', { name: 'Make picks', exact: true }).click();
    const [first] = world.state.games;
    const card = await openGame(page, first.id);
    await card.locator('[data-side="home"]').click();
    await card.locator('.gx-guess-num[data-value="3"]').click();
    await card.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'Lock in Spread?' }).getByRole('button', { name: 'Confirm lock-in' }).click();
    await expect(page.locator('.gx-per-game')).toContainText('Sign in again, then check saved picks. Your draft is kept.');
    const dialog = page.getByRole('alertdialog', { name: 'Sign in again', exact: true });
    await dialog.getByLabel('Password', { exact: true }).fill('test-password');
    await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('button', { name: 'Check saved picks', exact: true }).click();
    await page.getByRole('button', { name: 'Retry same save', exact: true }).click();
    await expect(card.getByRole('region', { name: /Spread receipt/ })).toBeVisible();
    expect(writes).toHaveLength(2);
    expect(writes[1].requestId).toBe(writes[0].requestId);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
```

In `tests/cloud-browser/next-play-nest.spec.js`:
- Change `async function fixture(page, baseURL) {` to `async function fixture(page, baseURL, { beforeSignIn } = {}) {`.
- Insert `  await beforeSignIn?.({ world, personal });` just before the fixture's `await signIn(page, 'luke');`.
- Append:

```js

// D-69 step 1, Whole week locked (small): the shared Community read that confirms the last lock-in plays it once, in
// place, on the line that says so. Going back to the week and a reload show the words without the pop (never replays).
test('Whole week locked pops once on the read that confirms the last lock; Back and a reload never replay it', async ({ page, baseURL }) => {
  const world = await fixture(page, baseURL, { beforeSignIn: async ({ world, personal }) => {
    // The fixture's /personal writes live in this page, so the Community read's per-game counts follow them.
    await page.route(routeName('community/read'), async route => {
      const request = route.request();
      const response = await world.handler(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
      const body = await response.json();
      body.due = body.due.map(row => {
        const locked = Object.keys(personal.ballots[row.mode]?.lockedAt ?? {}).length;
        return { ...row, locked, openGames: personal.games.length - locked, games: personal.games.length };
      });
      return reply(route, body);
    });
  } });
  try {
    const games = world.personal.games;
    for (const [i, game] of games.entries()) {
      const card = await openGame(page, game.id);
      await card.locator('[data-side="home"]').click();
      await card.locator('.gx-guess-num[data-value="3"]').click();
      await card.getByRole('button', { name: 'Lock in Spread', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'Lock in Spread?' }).getByRole('button', { name: 'Confirm lock-in' }).click();
      await expect(card.getByRole('region', { name: /Spread receipt/ })).toBeVisible();
      if (i < games.length - 1) await expect(page.locator('[data-moment="pop"]'), `${i + 1} of ${games.length} is not the moment`).toHaveCount(0);
    }
    await expect(page.locator('.gx-per-game p', { hasText: 'Every game is locked in.' })).toHaveAttribute('data-moment', 'pop');
    await openWeek(page);
    await expect(page.locator('[data-play="count"]')).toHaveText(`${games.length} of ${games.length} locked`);
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-play="count"]')).toHaveText(`${games.length} of ${games.length} locked`);
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
```

- [ ] **Step 7: Run them.** Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-play-live.spec.js tests/cloud-browser/next-play-nest.spec.js tests/cloud-browser/next-per-game-scoring.spec.js tests/cloud-browser/next-play-moments.spec.js tests/cloud-browser/next-phone-layout.spec.js`.
  Expected: PASS, `skipped 0`. [executed on the copy: next-play-live 3/3, next-play-nest 3/3 including the moment
  (pop on the fourth lock only, none after Back or a reload), and the others green]

- [ ] **Step 8: Record the change in `docs/ALL_TABS_LIVE_WORKFLOWS.md`.**
  - In the table, the Play row becomes:
    `| Play | The next move first (D-69 P1B), per-game lock-in, draft recovery, independent Spread/Total ballots, sit-out and receipts; read-only cards when the server's rules are not per-game | Existing account-wide personal ballot routes; the server's live rules decide editability |`.
  - Under "Intentional design exception":
    - "The existing WeekPicks, SocialBetTracker and VirtualUnits editors" becomes "The existing SocialBetTracker and
      VirtualUnits editors".
    - Delete the sentences from "Play now supplies optional presentation components" through "classic fallback remain
      intact.". Keep "Bets adds …".
  - After the **November 2 (D-69)** block, add:

```md
**November 3 (D-69 step 1):** Play no longer reuses WeekPicks or its presentation components. When the server's rules
are not per-game, Your guesses shows the same per-game cards read-only (every saved guess, no writes); the old app keeps
its own editor. The landing leads with the next ballot and six tiles (P1B).
```

- [ ] **Step 9: The full local suite and the build.** Run: `node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run && npm run typecheck && npm run build`.
  Expected: all PASS. Check that `git grep -n "CommunityHome\|PlayPresentation\|WeekPicks" -- web/src/next` prints
  only comments.

- [ ] **Step 10: Commit.**

```bash
git add web/src/next/play/Play.jsx web/src/next/play/PerGamePlay.jsx web/src/next/play/WeekProgress.jsx docs/ALL_TABS_LIVE_WORKFLOWS.md tests/next-play-nest.test.jsx tests/next-teams.test.jsx tests/next-app-view.test.mjs tests/cloud-browser/next-play-live.spec.js tests/cloud-browser/next-play-nest.spec.js
git diff --cached --stat && git ls-files --eol web/src/next/play/PerGamePlay.jsx tests/cloud-browser/next-play-live.spec.js
git commit -m "Play picks: retire the whole-market editor; read-only per-game cards; Whole week locked pops in place (D-69 step 1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(`git rm` in Step 4 has staged the deletion of `PlayPresentation.jsx`.)

### Notes (task 7)

- **Decision for Sean, D-23.** The new app no longer offers whole-market Save draft, Submit, Save changes or the
  whole-week sit-out.
  - They exist only when the server lacks `gtl_live_rules()`. Hosted has it, returning per-game rules as a constant.
  - Every saved guess, draft and receipt still shows. The old app keeps its editor. The rollback is the previous Pages
    build.
- **Decision, reminder prompt.** It sits directly under the hero, before the tiles. When it leaves, focus returns to
  the hero's lime button, the control just before it. The Points tile (through Task 1/4's `ref`) is used only when no
  hero is loaded. Task 1's interface text says the Points tile.
- **Decision, copy.**
  - The kickoff line adds "PT" ("first kickoff Thu 5:15 PM PT"). After that game kicks off it reads "next kickoff …".
  - The eyebrow is grey, not lime as in the mockup, because D-38 keeps lime for the one button.
  - With nothing left, "Week N locked in" shows even if a game closed unlocked; the meta line says "13 of 14".
  - With both markets sat out, the title is "Week N sat out".
- **Fix.** Play's "This week could not refresh" line never appeared in the app: the store keeps `status: 'ready'` once
  a copy exists. It now shows when there is a copy and an error. Home line 197 has the same dead check (step 2).
- **NEW is per scope, not per market.** In the "done" state, a moment waiting for the hero's market shows NEW on the
  other market's tile. When the picks card opens, both waiting moments play there, and only the open market's line
  pops.
- **Picks keep their h1 and no Play lip.** `play-nest.mjs` `openWeek` clicks the first lip, so a "Back to Play" lip
  would break it. Task 8 can unify this.
- **Cleanup left:** the `WeekPicks` presentation rules in `play/play.css` are dead code. `liveWorkflows.css` stays,
  because Bets uses it.
- **Unverified.** Execution used a copy of the tree [executed], with:
  - Task 1's files and the latched `usePopped`;
  - stand-in tiles;
  - the pre-Task 2/3/6 score, compare and league pages.
  The real tiles' names in the `next-features` and `next-points` specs, and Tasks 2/3's `PlayDetail` lines, are taken
  from their task files [inspected]. 7a and 7b ran together on that copy; 7a's interim `Play.jsx`, with the old
  `PlayDetail` and the `7b` imports, was not run alone [assumed: those imports are today's].
- **Length:** the section is about 1,190 lines, over the 700 asked for. Most of it is complete test and spec code.
  Split at 7a/7b for review.

---

## Task 8 · Finish

### Task 8: Finish: coverage, retirement, decisions and the register

Every page is built. This task proves the spec's cross-cutting tests (section 9) on the whole of step 1, records the
decisions Sean approved with this plan, and opens the PR. It changes no screen.

**Files:**
- Modify: `web/src/next/play/Play.jsx` and `web/src/next/play/PerGamePlay.jsx` (the picks cards get the Play lip),
  `tests/cloud-browser/play-nest.mjs`, `tests/next-play-nest.test.jsx`, `web/src/next/play/play.css` (dead rules),
  `tests/cloud-browser/next-phone-layout.spec.js`, `tests/cloud-browser/next-scroll-navigation.spec.js`
  (addresses), `docs/DECISIONS.md` (a D-69 addendum), `docs/COMPLETION_REGISTER.md` (the step 1 entry)

- [ ] **Step 1: The picks cards get the Play lip (D-66: parents stay as lips)**

After task 7, Your guesses is the only Play section whose cards do not show "Back to Play". Task 7 left it out
because the browser helper `openWeek` clicked the first lip it found.

Add to `tests/next-play-nest.test.jsx`, in the describe block that holds "an open game: a lip back to the week":

```jsx
  it('under the Play lip: the week shows "Back to Play", and an open game shows it before its week lip', () => {
    const root = { key: 'play', label: 'Play', onOpen() {} };
    expect(lips(render({ ...nest(undefined), root }))).toEqual(['Back to Play']);
    expect(lips(render({ ...nest('DEN-CAR'), root }))).toEqual(['Back to Play', 'Back to Week 9 · Total']);
  });
```

Run: `npx vitest run tests/next-play-nest.test.jsx`
Expected: FAIL (the week has no lips; the game has only its week lip).

In `web/src/next/play/PerGamePlay.jsx`, the game card's Nest: change
`lips={[{ key: 'week', label: \`Week ${data.week} · ${market}\`, onOpen: nest.onWeek }]}` to
`lips={[...(nest.root ? [nest.root] : []), { key: 'week', label: \`Week ${data.week} · ${market}\`, onOpen: nest.onWeek }]}`.
The week card's `<Nest label="Your guesses" layer="week" …>` gains `lips={nest.root ? [nest.root] : []}`.

In `web/src/next/play/Play.jsx` `SelectedPlay`, add `import { CLOSED_LAYER, PLAY_ROOT } from './PlayLayer.jsx';` (or
extend the existing `PlayLayer.jsx` import), take `go` with `setView` (`const { setView, go } = shell, …`), and give
the nest its root lip:

```jsx
  const nest = useMemo(() => ({ game: view.pickGame, keeps, onOpen: id => setView('play', { pickGame: id }), onWeek: () => setView('play', { pickGame: undefined }),
    root: { key: PLAY_ROOT.key, label: PLAY_ROOT.label, onOpen: () => go('play', { section: undefined, ...CLOSED_LAYER }) } }), [view.pickGame, keeps, setView, go]);
```

In `tests/cloud-browser/play-nest.mjs` `openWeek`, change
`const lip = page.locator('.gx-per-game .gx-nest-lip');` to
`const lip = page.locator('.gx-per-game .gx-nest-lip', { hasText: 'Week' });` (the week lip, never the Play lip).

Run: `npx vitest run tests/next-play-nest.test.jsx && npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-play-nest.spec.js tests/cloud-browser/next-play-moments.spec.js`
Expected: PASS, `skipped 0`.

- [ ] **Step 2: Remove the picks styles nothing uses any more**

Task 7 retired `PlayPresentation.jsx` and the old whole-market editor, so some `play/play.css` rules have no element.
List the classes in `play.css` that no file under `web/src` names:

```bash
for c in $(grep -o "gx-[a-z0-9-]*" web/src/next/play/play.css | sort -u); do git grep -q -e "$c" -- 'web/src/*.jsx' 'web/src/*.js' 'web/src/**/*.jsx' 'web/src/**/*.js' || echo "$c"; done
```

Delete each rule in `play.css` whose selector uses only listed classes (a rule that also styles a live class stays,
with the dead selector removed from its list). Leave `liveWorkflows.css`: Bets uses it.

Run: `node --test tests/next-tokens.test.mjs && npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-phone-layout.spec.js`
Expected: PASS, `skipped 0`.

- [ ] **Step 3: Every new layer is in the phone and fixed-bar sweeps (spec tests 10 and 11)**

In both specs' `ADDRESSES` lists, make sure each of these is present, adding only the missing ones next to the other
`#play` entries. Tasks 2, 3, 5 and 6 added some already; do not add any address twice.

- `next-phone-layout.spec.js`: `'#play/points'`, plus every game, slot, badge, awards, feed and week address those
  tasks added (keep theirs).
- `next-scroll-navigation.spec.js`: `'#play/score'`, `'#play/compare'`, `'#play/points'`, `'#play/league'` (the board,
  the landing since task 6).

Run: `npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js`
Expected: PASS and `skipped 0`: no sideways scroll, no clipped text, 44 px targets at 320 and 390 px in Dark and Light,
and no transform on any ancestor of the top bar, tab bar or dock on each address.

- [ ] **Step 4: The rebuilt pages no longer import the old screens they replace (spec test 13)**

Run: `git grep -n "CommunityHome.jsx\|CommunityHistory.jsx" -- web/src/next/play web/src/next/league web/src/next/features web/src/next/feed`
Expected: no output.

Run: `node --test tests/next-app-view.test.mjs tests/inventory-homes.test.mjs`
Expected: PASS (tasks 6 and 7 removed `HistoryLine` and `WeekPicks` from the old-app inventory).

- [ ] **Step 5: Gates, privacy and the whole suite**

Run: `node --test tests/leak-scan.test.mjs`
Expected: PASS (the readers are unchanged; this guards that nothing in step 1 widened a reply).

Run: `node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run`
Expected: PASS. A failure here is a real regression: fix it in the task that caused it, never by loosening a test.

Run: `npm run typecheck && npm run build`
Expected: PASS.

Run every browser spec step 1 touched, together:

```bash
npx playwright test -c playwright.cloud.config.js tests/cloud-browser/next-play-live.spec.js tests/cloud-browser/next-play-nest.spec.js tests/cloud-browser/next-play-moments.spec.js tests/cloud-browser/next-per-game-scoring.spec.js tests/cloud-browser/comparisons-home.spec.js tests/cloud-browser/next-points.spec.js tests/cloud-browser/next-features.spec.js tests/cloud-browser/next-league-live.spec.js tests/cloud-browser/next-feed.spec.js tests/cloud-browser/next-reactions.spec.js tests/cloud-browser/next-history.spec.js tests/cloud-browser/next-design-home-league.spec.js tests/cloud-browser/next-moments-strict.spec.js tests/cloud-browser/four-tab-redesign.spec.js
```

Expected: PASS, `skipped 0`.

Run: `npm run test:accessibility`
Expected: PASS (axe clean in Light and Dark).

- [ ] **Step 6: Record the decisions Sean approved with this plan**

In `docs/DECISIONS.md`, under the D-69 design overhaul entry, after the November 3 "Step 1 Play choices" addendum, add:

```markdown
*Addendum — Step 1 Play build.* Sean approved these with the step 1 plan
([2026-11-03-design-overhaul-step1-play.md](superpowers/plans/2026-11-03-design-overhaul-step1-play.md), its
"Decisions for Sean" section), and the build follows them:
- **Compare (narrows D-53):** one other member at a time, or "Everyone" with the league average; choosing several
  players at once and the per-player sample table retire. Week range, full season, team and matchup stay behind the
  filter button.
- **League:** `#play/league` opens the board; the feed and History are layers. The season race strip, the "Compare
  players in …" button and the Refresh buttons retire (the app refreshes on focus and on its timer). The board shows
  six rows plus yours, then "N more on the board".
- **Rank moments** replace the rank toast: up is small, reaching 1st is big, a drop is quiet.
- **Badges:** the badge sheet retires; every badge opens its layer, another member's with their id in the address.
- **Guess the Points:** a slot is a layer: Back and the week lip leave it (Escape no longer does), and leaving with an
  unsaved guess asks first.
- **Picks:** the new app draws per-game cards for every rule set; without per-game rules they are read-only, and the
  whole-market Save draft, Submit and whole-week sit-out stay in the old app only.
- **Your score:** the rank chip is the season rank; a receipt's "View weekly score" opens that game's layer.
- **Bullseye** plays once: the score moment and the Bullseye badge share one id.
- **Motion:** each navigation moves once (a tab change fades; a card inside a tab rises).
These change the layout and motion only; no game rule changes.
```

Before writing it, compare each bullet with the merged code and with the plan's "Decisions for Sean" list; remove any
bullet Sean declined, and record his words for any he changed.

- [ ] **Step 7: The completion register entry**

Add at the top of `docs/COMPLETION_REGISTER.md` (newest first), with today's date and the real commit and PR:

```markdown
## D-69 design overhaul, step 1: Play — <Month D, YYYY>

Built on `<branch>` at `<full commit>`, PR <link>; not released. Every Play section is a nesting card under a
"Play" lip, with its own address: the landing's next-ballot card and six tiles (P1B), Your score and its game layer
(P2B), Compare one member at a time (P3B), Guess the Points slot tiles and slot layers (P4A), Badges and awards grid
first (P5A), and League board first with the feed, History and week layers (P6A). Bullseye, Week final, Whole week
locked, Points exact, rank moments and the Pick streak play through the moments engine, never on launch, NEW on
their landing tiles. The old picks fallback (`CommunityHome.jsx` WeekPicks) and League history (`CommunityHistory.jsx`)
are no longer imported. Evidence: the full local suite, typecheck and build, the step 1 browser specs and the phone,
fixed-bar and accessibility sweeps (all `skipped 0`), and the nine required CI checks on the PR. Not yet: the Pages
release and Sean's iPhone check of Play, which stands in for device acceptance (spec section 10).
```

- [ ] **Step 8: Commit, push and open the PR**

```bash
git add web/src/next/play/Play.jsx web/src/next/play/PerGamePlay.jsx web/src/next/play/play.css tests/next-play-nest.test.jsx tests/cloud-browser/play-nest.mjs tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js docs/DECISIONS.md docs/COMPLETION_REGISTER.md
git diff --cached --stat && git ls-files --eol docs/DECISIONS.md docs/COMPLETION_REGISTER.md
git commit -m "Step 1 Play: phone and fixed-bar coverage for every new layer, the build decisions and the register entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin HEAD
npm run sync:check
```

Open the PR against `main` with the evidence above, every `skipped 0` line, and 390 px phone screenshots of each
rebuilt page in Dark and Light: Sean sees every visible change on a phone before it is released, and the P1–P6 canvas
rows are the mockups he approved. Do not merge, release or run a workflow without Sean's word.
