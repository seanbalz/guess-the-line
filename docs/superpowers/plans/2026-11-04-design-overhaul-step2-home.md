# Design overhaul step 2: Home — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rebuild Home on the step 0 kit and the step 1 frame, as the recommended board on Sean's canvas, **H1A ·
"Tiles, then This week as game tiles"**, with the design audit's **C9** next-move card:
- the next-move card: the eyebrow ("Your next move", or "Week N" when nothing is due) with the Pick streak beside it,
  the action in words, one meta line, the countdown (the card's one picture), the Spread and Total meters side by side
  when the card is wide enough, and the screen's one lime button;
- six tiles in two columns, the same tile as Play's landing: Spread rank, Total rank, Who's in, Awards, My bets, Trends;
- "This week": up to four game tiles with team marks, kickoff and your own Spread word, then "All N games";
- Who's in as a Home layer (`#home?layer=who`) under a "Home" lip;
- Home plays only Whole week locked and the Pick streak, in place; every other result from while you were away shows
  NEW on its tile and plays when that tile's card opens, never on launch.

**Architecture:**
- **Kit first (design audit B0-1, B0-2).** Play's landing tile moves into the kit as `ui/Tile.jsx` (`Tile`, `spokenName`,
  `TILE_TONES`) with a `.gx-tiles` two-column list; `play/PlayTile.jsx` becomes a one-line re-export, so Play's code,
  tests and their mock seams do not change. `ui/Skeleton.jsx` gains `tiles` and `landing` shapes.
- **Pure first.** Every word Home shows comes from `home/homeModel.js` (node:test). The This week tiles reuse the picks
  card's own state rule (`play/moments.js` `gameState`, `STATE_WORDS`), fed only with the viewer's own `/personal` ballot.
- **Moments by scope, engine unchanged.** Candidates change which cards hold them: Whole week locked and the Pick streak
  add `SCOPES.home`; badges and awards drop it; a Community board rank move also waits on a new per-market Your score
  scope (`scoreScope(mode)`), where Your score pops its season rank chip. `moments/engine.js` and `detect.js` do not change.
- **One new address key, no new read.** `layer=who` on the home view is a step (Back closes it, the lip goes back, a
  reload reopens it). Home asks for the shared `/personal` read (`useSharedRead('personal')`, already made by Play and
  Research); no new server route, request type, migration or Edge change.

**Tech stack:** React 19, plain CSS under `.gx` with `--gx-` tokens, `node:test` for `tests/*.test.mjs`, Vitest for
`tests/*.test.jsx` (static-markup renders), Playwright for `tests/cloud-browser/*.spec.js`.

**Spec:** `docs/superpowers/specs/2026-11-02-design-overhaul-design.md` (D-69), sections 3, 4, 5, 6 "Step 2 · Home", 7, 8,
9 and 10. Board: H1A on the private canvas
[GTL Design Overhaul Mockups](https://claude.ai/artifact/YBJmR5XUV59juyGKPGphJ7) (sample data). Design audit items folded
in: B0-1 (kit tile), B0-2 (skeleton shapes), B0-4 (a twelve-word markup check per step), C9 (the card's one picture).

**Status:** written November 4, 2026. H1A and C9 are build decisions for Sean's review (see "Decisions for Sean"); he
has not chosen either. Not built.

**Before you start:** work in this worktree on `claude/overhaul-step2-home` (`docs/REPOSITORY_SYNC.md`). The worktree must
have `node_modules` (a junction to `C:\Users\sbals\betting-repo\node_modules`) and `.local/sql-check`, or the PGlite
browser specs skip silently; every browser report must say `skipped 0`.

## Global Constraints

Copied from the spec and the brief. Each task's requirements include these.

- **Layout (H1A):** the next-move card, then six tiles in two columns in this order: Spread rank, Total rank, Who's in,
  Awards, My bets, Trends; then "This week". Destinations: Spread/Total rank → Play › Your score on that market; Who's in
  → `#home?layer=who`; Awards → Play › Badges and awards (`featuresView()`); My bets → Bets › My bets
  (`{ view: 'active', season: null, week: null, period: null }`); Trends → Research › Trends (`trendSection: 'build'`
  when there are saved trends); a game tile → Play › Picks on that game's card
  (`openPlay(shell, 'picks', { market: 'spread', season, week, pickGame })`); "All N games" → Research › Games.
- **C9:** the countdown is the card's one picture. The card's padding is 24 px (`--gx-space-6`). The meter row is
  `grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr))` with a 12 px gap: two columns exactly when the
  card is at least 360 px wide (150 + 12 + 150 + 2 × 24), else stacked. At a 390 px phone the card is 358 px, so it stacks;
  from a 392 px phone (iPhone 15/16 at 393) the two meters sit side by side. Each meter's words:
  `"<Market> · <done> of <of> locked|picked"`, `"<Market> · sent"`, `"<Market> · sat out"`.
- **Tiles:** the kit tile (`gx-nest-tile gx-tile`): label 13/18 600, an icon (20 px) or a small picture, one number in
  `gx-n-l`, one meta line, NEW; min-height 112 px; `.gx-tiles` is two `minmax(0, 1fr)` columns with a 12 px gap and sits on
  `--gx-surface-1`. A toned line carries its word or symbol ("▲ 2", "New: …", "You won …"), never color alone.
- **Words (exact):** eyebrow `Your next move` | `Week N`; rank tile big `3rd` / `T-2` / `—`, sub `▲ 2 · 41 pts`,
  `▼ 1 · 36.5 pts`, `41 pts`, `Not scored yet`; Who's in big `4 / 6`, sub `Spread ballots in`; Awards big = the newest
  week's award count, sub `Week 8 · New: <award>` (your award's moment waits) | `Week 8 · You won <award>` |
  `Week 8 awards`; My bets `1 active ticket` / `N active tickets`; Trends big = saved count, sub `saved`, or `0` with
  `Charts for every game`; game words `Locked`, `Draft`, `Open`, `Kicked off`, `Sat out`, `Not open` (play/moments.js
  `STATE_WORDS`). A real space between every number and its word. No surface sentence over twelve words.
- **This week:** `GAME_TILES = 4`. The window is the first four games in kickoff order that had not kicked off at the
  server's `now`; when fewer than four remain, the week's last four. No pick value, line or other player ever (D-31).
- **Moments (spec 4.2, 6 step 2):** Home opens `SCOPES.home` only while its next-move card is mounted. Home plays only
  Whole week locked (small, the market's meter column pops) and the Pick streak (small, the streak pill pops), with
  `data-moment="pop"`. Rank moves NEW on their rank tile (`useNewCount(scoreScope(mode))`); badges and awards NEW on the
  Awards tile (`useNewMoments(SCOPES.features)`, kinds `award` and `badge`). "Never on page load"; "a loss or miss stays
  quiet"; the engine's semantics do not change.
- **Motion (D-58):** durations through `--gx-dur-*`, easings through `--gx-ease-*`; keyframes animate only transform and
  opacity; reduced motion (`prefers-reduced-motion` or `data-motion="reduce"`) stops everything. The Who's in layer rises
  in through `ui/Nest.jsx` (no new keyframes). Skeletons are static: no animation, no transition.
- **Phone rules:** no sideways scroll at 320 and 390 px in Light and Dark and with the wide fallback font
  (`.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }`); targets at least 44 px; no text under
  12 px, nothing clipped; axe clean; no transform, filter or will-change on any ancestor of the tab bar, dock or top bar;
  every stylesheet passes `tests/next-tokens.test.mjs`. Lucide icons through `ui/Icon.jsx`; teams as D-62 marks.
- **Coordination:** PR #478 is merged (Home's `DESTINATION_ICONS` and "1 active ticket"; this plan keeps both). PR #479
  (kit: Nest lips A6, `press.css` A7, `FocusLanding` A9, a `.gx [hidden]` guard A3, `.gx-meter3` 8 px pills A10) may land
  first: do not restyle Nest, press, FocusLanding or the kit meter. Home's own meter overrides in `home.css` may become
  redundant after A10; keep them, do not depend on A10.
- **Never touch Track 1:** `scripts/fantasy.mjs`, `shared/fantasy*`, `web/src/FantasyFootball.jsx`, `web/src/next/fantasy/`.
- **Frontend only:** no migration, Edge Function, server or workflow change, no deploy.
- **Files:** LF line endings. Before every commit run `git diff --cached --stat` and `git ls-files --eol <files>` (every
  line `i/lf w/lf`); a fully rewritten file means CRLF crept in: `sed -i 's/\r$//' <file>`. Commit only named files.
- **Commits:** every message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Test commands

Confirmed in `package.json` and `vitest.config.*` (Vitest includes `tests/**/*.test.jsx`; `node --test` runs
`tests/*.test.mjs`).

- One `node:test` file: `node --test tests/<file>.test.mjs`
- One Vitest file: `npx vitest run tests/<file>.test.jsx`
- Full local suite on this PC: `node --test --test-concurrency=6 tests/*.test.mjs && npx vitest run` (default concurrency
  runs out of commit memory here). `tests/research-intake.test.mjs` fails on Windows on untouched code (a file-mode
  check; CI runs Linux); every other test must pass.
- One browser spec: `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/<file>.spec.js --reporter=line`
  (the report must say `skipped 0`).
- Type check and build: `npm run typecheck && npm run build`.

## Decisions for Sean

H1A and C9 are the two the brief adopted for his review. The rest follow from them, the spec or the code, and each
changes something a player sees, so each is listed. Task 9 records H1A and C9 as a D-69 addendum.

- **H1A (layout):** next-move card, six tiles, This week as game tiles; Who's in becomes a Home layer; the awards card and
  the "This week" rows (trends and saved trends) become the Awards and Trends tiles.
- **C9 (the card's one picture):** the countdown is the picture; the two meters share one row when the card is at least
  360 px wide. At 390 px phones they still stack; Task 9 adds a 393 px capture so Sean sees the side-by-side row.
- **Rank moves play on Your score.** A Community board rank move now waits on its market's Your score card as well as on
  League, and plays (the season rank chip pops; reaching 1st is the big card) on whichever opens first, once.
- **Badges and awards no longer play on Home.** They wait as NEW on the Awards tile and play on Play or Badges and awards
  (before, a waiting badge could play its big card on Home after a navigation).
- **Game tile words** are the picks card's legend words, so a tile says what the card it opens says. The Research board
  has no one-word state (it shows your pick as a tag), and the picks strip's tile tag uses other words ("Closed",
  "Skipped") — flagged for cleanup in Play, not changed here.
- **Awards sub:** "New: <award>" only while that award's moment waits (as the Badges tile does), then "You won <award>".
- **Trends tile:** with nothing saved it reads "0 · Charts for every game". Home stops saying how many saved trends match
  this week; Research › Trends › This Week still does. The lazy `SavedTrendsHomeRow` is deleted.
- **The card's eyebrow** replaces the "Week N" label while picks are due; "Due soon" stays beside it when urgent; the done
  title becomes "Week N locked in" ("Week N sat out" when every market was sat out), as on Play.
- **Rank tiles** drop the chase line ("2 behind Blake Rivers"); H1A's sub is "▲ 2 · 41 pts".
- **Who's in layer** lists every member (the card showed six and "and N more"). Tapping Home in the tab bar or the top
  bar's logo closes it; the top bar shows Back on it.
- **Home reads `/personal` at launch** (it did not before): one more GET on every Home visit. See Risks in Task 9's notes.

## File structure

| File | Change |
|---|---|
| `web/src/next/ui/Tile.jsx`, `ui/tile.css` | Create: the kit tile and `.gx-tiles` (B0-1) |
| `web/src/next/ui/index.js` | Export `Tile`, `spokenName`, `TILE_TONES` |
| `web/src/next/play/PlayTile.jsx` | Becomes a re-export of the kit tile |
| `web/src/next/play/playFrame.css`, `play/landing.css`, `play/Play.jsx` (one class) | Tile styles move to the kit |
| `web/src/next/ui/Skeleton.jsx`, `ui/skeleton.css` | `tiles` and `landing` shapes (B0-2) |
| `web/src/next/shell/state.js`, `shell/Shell.jsx` (one line) | Home's `layer` key is a step |
| `web/src/next/home/homeModel.js` | All of Home's words and tile models |
| `web/src/next/moments/catalog.js` | `scoreScope(mode)` |
| `web/src/next/league/rankMoment.js` | Community rank moves also wait on Your score; `rankMomentId` |
| `web/src/next/features/model.js`, `features/streakMoment.js`, `play/landing.js` | Which cards hold each moment |
| `web/src/next/play/scoreHooks.js`, `play/WeeklyScore.jsx` | Your score opens its market's scope and pops its rank chip |
| `web/src/next/home/Home.jsx`, `home/home.css`, `home/homeData.js` | The new Home |
| `web/src/next/features/HomeStreak.jsx` | The streak pill pops |
| `web/src/next/features/HomeAwards.jsx`, `features/features.css` (3 rules) | Delete (only Home used it) |
| `web/src/next/trends/SavedTrendsSummary.jsx` | Delete `SavedTrendsHomeRow` (only Home used it) |
| Tests: new `next-kit-tile.test.jsx`, `next-home-model.test.mjs`, `next-home-moments.test.mjs`, `next-score-rank-pop.test.jsx`, `next-home-week.test.jsx`, `cloud-browser/next-home-layers.spec.js` | New contracts |
| Tests updated: `next-play-frame.test.jsx`, `next-ui.test.jsx`, `next-router.test.mjs`, `next-play-landing.test.mjs`, `next-features-streak.test.mjs`, `next-features.test.mjs`, `next-rank-moment.test.mjs`, `next-moments.test.mjs`, `next-home-ui.test.jsx`, `next-design-home-league.test.jsx`, `four-tab-landings.test.jsx`, cloud-browser `next-home`, `next-design-home-league`, `next-features`, `next-trends`, `next-phone-layout`, `next-scroll-navigation` | Layout changes |
| `docs/COMPLETION_REGISTER.md`, `docs/DECISIONS.md` | Step 2 entry, D-69 addendum |

## Task map

| Task | What it builds |
|---|---|
| 1 | Sync with `main`; the kit Tile (B0-1); Play draws it unchanged |
| 2 | Skeleton `tiles` and `landing` shapes (B0-2) |
| 3 | Home's `layer=who` address |
| 4 | Home as plain data: the card's words, six tile models, This week's game tiles |
| 5 | Moments: which cards hold Home's moments; Your score plays rank moves |
| 6 | The Home screen: next-move card (C9), six tiles, loading, Home's moments |
| 7 | This week's game tiles and the Who's in layer |
| 8 | Browser specs: existing Home specs updated, the new Home spec, phone and fixed-bar sweeps |
| 9 | Finish: full suite, register, decision addendum, screenshots for Sean, PR |

Shared names, used exactly as written: `Tile`, `spokenName`, `TILE_TONES`, `.gx-tiles`, `SKELETON_SHAPES` (`tiles`,
`landing`), `HOME_LAYERS.who`, `scoreScope(mode)`, `rankMomentId(saved, league, mode)`, `FEATURE_SCOPES`, and from
`homeModel.js`: `HERO_COPY`, `HOME_TILE_ICONS`, `GAME_TILES`, `gamesToLock`, `heroHeadline`, `heroMeters`,
`rankTileView`, `whoTile`, `awardsTile`, `betsTile`, `trendsTile`, `weekGames`. Test hooks: `[data-home="hero"]`,
`[data-home="eyebrow"]`, `[data-home="when"]`, `[data-home="status"]` (its `li[data-market]` columns),
`[data-home="streak"]`, `[data-home="tiles"]` with `li[data-tile="spread|total|who|awards|tickets|trends"]`,
`[data-home="points"]`, `[data-home="week"]` with `li[data-game-tile="<gameId>"]`, `[data-home="who-layer"]`.

---

## Task 1 · The kit Tile (design audit B0-1)

### Task 1: Sync, then move Play's tile into the kit

Play's landing tile becomes the kit's `Tile`, with one addition (`picture`, for Who's in faces). Play keeps importing
`PlayTile` from `play/PlayTile.jsx`, now a re-export, so Play's markup, behaviour and every test that stands in for that
module stay as they are. The two class-name assertions in `next-play-frame.test.jsx` move to the kit names.

**Files:**
- Create: `web/src/next/ui/Tile.jsx`, `web/src/next/ui/tile.css`, `tests/next-kit-tile.test.jsx`
- Modify: `web/src/next/ui/index.js`, `web/src/next/play/PlayTile.jsx`, `web/src/next/play/playFrame.css`,
  `web/src/next/play/landing.css`, `web/src/next/play/Play.jsx` (the tile list's class), `tests/next-play-frame.test.jsx`

**Interfaces:**
- Consumes: `Icon` (`ui/Icon.jsx`), `NewPill` (`ui/Pill.jsx`), `cx`.
- Produces: `Tile({ ref, label, icon, picture, big, sub, tone = 'plain', isNew = false, onClick, ariaLabel })`,
  `spokenName(ariaLabel, isNew)`, `TILE_TONES = ['plain', 'good', 'warn']` from `ui/Tile.jsx` and `ui/index.js`;
  classes `gx-tile`, `gx-tile-pic`, `gx-tile-foot`, `gx-tile-sub`, `gx-tile-sub--plain|good|warn`, `gx-tiles`.
  `play/PlayTile.jsx` exports `PlayTile` (=== `Tile`) and `spokenName`.

- [ ] **Step 1: Sync with `main`.**

```bash
git fetch origin && git merge origin/main
git log --oneline -5
```

If #479 merged, re-read `web/src/next/ui/Nest.jsx`, `ui/nest.css`, `ui/Meter.jsx` and `ui/focusLanding.css` before Task 6;
nothing in this plan restyles them.

- [ ] **Step 2: Write the failing test.** Create `tests/next-kit-tile.test.jsx`:

```jsx
// D-69 step 2 (design audit B0-1): the kit's Tile, the one tile Home and Play's landing draw. It keeps step 1's tile
// contract exactly (a label, an icon, one big number, one line, NEW said aloud) and adds a small picture for faces or
// marks. One source for both tabs, so Home and Play cannot drift.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import * as ui from '../web/src/next/ui/index.js';
import * as play from '../web/src/next/play/PlayTile.jsx';

const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const nodes = html => [...walk(parseMarkup(html))];
const buttons = html => nodes(html).filter(n => n.tag === 'button');
const byClass = (html, cls) => nodes(html).filter(n => (n.attrs?.class ?? '').split(/\s+/).includes(cls));
const css = file => readFileSync(new URL(`../web/src/next/${file}`, import.meta.url), 'utf8');

describe('Tile (kit)', () => {
  it('is the tile Play’s landing draws: PlayTile and spokenName are the kit’s own', () => {
    expect(play.PlayTile).toBe(ui.Tile);
    expect(play.spokenName).toBe(ui.spokenName);
  });

  it('one button: label, icon, one big number in the number style, one line in its tone, and NEW said in its name', () => {
    const html = render(<ui.Tile label="Spread rank" icon="chart" big="3rd" sub="▲ 2 · 41 pts" tone="good" isNew ariaLabel="Spread rank, 3rd, up 2, 41 points" onClick={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    const [tile] = buttons(html);
    expect(tile.attrs.type).toBe('button');
    expect(nameFrom(tile)).toBe('Spread rank, 3rd, up 2, 41 points, new');
    expect(byClass(html, 'gx-n-l').map(nameFrom)).toEqual(['3rd']);
    expect(byClass(html, 'gx-tile-sub--good')).toHaveLength(1);
    expect(byClass(html, 'gx-new')).toHaveLength(1);
  });

  it('a picture (faces, marks) sits under the label, hidden from screen readers because the name already says it', () => {
    const faces = <ui.AvatarStack people={[{ id: 'u-1', name: 'Avery Stone' }, { id: 'u-2', name: 'Blake Rivers' }]} max={4} size={24}/>;
    const html = render(<ui.Tile label="Who’s in" icon="people" picture={faces} big="4 / 6" sub="Spread ballots in" ariaLabel="Who’s in, 4 of 6 Spread ballots in" onClick={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    const [pic] = byClass(html, 'gx-tile-pic');
    expect(pic.attrs['aria-hidden']).toBe('true');
    expect(nameFrom(buttons(html)[0])).toBe('Who’s in, 4 of 6 Spread ballots in');
    expect(render(<ui.Tile label="My bets" big="2" sub="active tickets" ariaLabel="My bets, 2 active tickets" onClick={() => {}}/>)).not.toContain('gx-tile-pic');
  });

  it('an unknown tone falls back to plain, so a state color never shows without its word; "new" is never said twice', () => {
    expect(render(<ui.Tile label="League" big="3rd" sub="4 new posts" tone="loud" ariaLabel="League, 3rd" onClick={() => {}}/>)).toContain('gx-tile-sub--plain');
    expect(ui.spokenName('Awards, 3 in Week 8, new: Sharpshooter', true)).toBe('Awards, 3 in Week 8, new: Sharpshooter');
    expect(ui.TILE_TONES).toEqual(['plain', 'good', 'warn']);
  });

  it('one stylesheet owns the tile: the kit draws .gx-tile and .gx-tiles, and Play keeps no copy of them', () => {
    const kit = css('ui/tile.css');
    expect(kit).toMatch(/\.gx \.gx-tile \{[^}]*min-height: 112px/);
    expect(kit).toMatch(/\.gx \.gx-tiles \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css('play/playFrame.css')).not.toMatch(/gx-play-tile/);
    expect(css('play/landing.css')).not.toMatch(/gx-play-tiles/);
  });
});
```

- [ ] **Step 3: Run it and see it fail.**

Run: `npx vitest run tests/next-kit-tile.test.jsx`
Expected: FAIL (`ui.Tile` is undefined, so `play.PlayTile` is not it; `ui/tile.css` does not exist).

- [ ] **Step 4: Create the kit tile.** Create `web/src/next/ui/Tile.jsx`:

```jsx
// D-69 (design audit B0-1): the kit's tile, one per destination on a tab's first card (spec section 5, "Under it, tiles
// in two columns"). A label with an icon or a small picture, one big number, one short line, and NEW when its card holds
// a moment that waits (moments/MomentsProvider.jsx useNewCount). A toned line always carries its own word or symbol
// ("▲ 2", "New: …"), never color alone (D-38). Home and Play's landing draw it; play/PlayTile.jsx re-exports it.
import { Icon } from './Icon.jsx';
import { NewPill } from './Pill.jsx';
import { cx } from './cx.js';
import './tile.css';

export const TILE_TONES = Object.freeze(['plain', 'good', 'warn']);

/** The spoken name with NEW in it: ", new" is added when `isNew` and the caller's label does not already say the word. */
export const spokenName = (ariaLabel, isNew) => (isNew && typeof ariaLabel === 'string' && !/\bnew\b/i.test(ariaLabel) ? `${ariaLabel}, new` : ariaLabel);

/**
 * `ref` (a React 19 ref prop) reaches the button, so a screen can return focus to a tile. `ariaLabel` is the whole
 * spoken name; the tile says "new" in it whenever its NEW tag shows (spokenName). `icon` is an `Icon` name or a Lucide
 * component. `picture` (faces, marks) is drawn under the label and hidden from assistive technology: the name says it.
 */
export function Tile({ ref, label, icon, picture, big, sub, tone = 'plain', isNew = false, onClick, ariaLabel }) {
  const t = TILE_TONES.includes(tone) ? tone : 'plain';
  return (
    <button ref={ref} type="button" className="gx-nest-tile gx-tile" aria-label={spokenName(ariaLabel, isNew)} onClick={onClick}>
      <span className="gx-nest-tile-top">
        <span className="gx-nest-tile-label">{label}</span>
        {icon ? <Icon icon={icon} size={20}/> : null}
      </span>
      {picture ? <span className="gx-tile-pic" aria-hidden="true">{picture}</span> : null}
      <span className="gx-n-l gx-nest-num">{big}</span>
      <span className="gx-tile-foot">
        <span className={cx('gx-t-meta', 'gx-tile-sub', `gx-tile-sub--${t}`)}>{sub}</span>
        {isNew ? <NewPill/> : null}
      </span>
    </button>
  );
}
```

Create `web/src/next/ui/tile.css` (the tile rules move here from `play/playFrame.css` and `play/landing.css`, renamed):

```css
/* D-69 (design audit B0-1): the kit tile and the two-column tile list of a tab's first card. The frame is the nesting
   tile's (nest.css .gx-nest-tile), so a tile inside a layer takes that layer's surface; in a .gx-tiles list on a page it
   sits on surface-1. Tokens only. */
.gx .gx-tile { justify-content: space-between; min-height: 112px; }
.gx .gx-tile-pic { display: flex; align-items: center; min-width: 0; }
.gx .gx-tile-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-tile-sub { min-width: 0; font-weight: 600; overflow-wrap: anywhere; }
.gx .gx-tile-sub--plain { color: var(--gx-text-2); }
.gx .gx-tile-sub--good { color: var(--gx-win); }
.gx .gx-tile-sub--warn { color: var(--gx-pending); }
.gx .gx-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gx-space-3); margin: 0; padding: 0; list-style: none; }
.gx .gx-tiles > li { display: flex; min-width: 0; }
/* A tile that has nothing to show yet (its own read loading or off) leaves no empty cell. */
.gx .gx-tiles > li:empty { display: none; }
.gx .gx-tiles .gx-nest-tile { background: var(--gx-surface-1); }
```

In `web/src/next/ui/index.js`, after the `Nest` export line add:

```js
export { Tile, spokenName, TILE_TONES } from './Tile.jsx';
```

Replace all of `web/src/next/play/PlayTile.jsx` with:

```jsx
// D-69 step 1's landing tile is the kit's Tile since step 2 (ui/Tile.jsx, design audit B0-1). This module keeps Play's
// name for it, so Play's tiles and the tests that stand in for this module do not change. Flagged for cleanup: Play's
// tiles can import `Tile` from the kit once those tests stand in for the kit instead.
export { Tile as PlayTile, spokenName } from '../ui/Tile.jsx';
```

In `web/src/next/play/playFrame.css` delete the first seven rules (`.gx .gx-play-tile` through
`.gx .gx-play-tile-sub--warn`) and change its header to `/* D-69 step 1: the Play frame's shared pieces (WeekChips,
FilterToggle). The landing tile is the kit's (ui/tile.css). Tokens only. */`.

In `web/src/next/play/landing.css` delete the three `.gx .gx-play-tiles` rules (lines 10–13 with their comment); the
kit's `.gx-tiles` carries them.

In `web/src/next/play/Play.jsx`, `PlayLanding`, change the list's class only:

```jsx
    <ul className="gx-tiles gx-play-tiles" aria-label="Play sections" data-play="tiles">
```

- [ ] **Step 5: Move the two class names in Play's frame test.** In `tests/next-play-frame.test.jsx` replace
`'gx-play-tile-sub--good'` with `'gx-tile-sub--good'` and `'gx-play-tile-sub--plain'` with `'gx-tile-sub--plain'`. No
other Play test changes.

- [ ] **Step 6: Run the new test, Play's tile tests and the token rules.**

Run: `npx vitest run tests/next-kit-tile.test.jsx tests/next-play-frame.test.jsx tests/next-play-landing.test.jsx tests/next-features-ui.test.jsx tests/next-league-layers.test.jsx tests/next-score-tile.test.jsx tests/next-points-ui.test.jsx tests/next-ui.test.jsx tests/four-tab-landings.test.jsx`
Expected: PASS, every file.
Run: `node --test tests/next-tokens.test.mjs tests/next-play-landing.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add web/src/next/ui/Tile.jsx web/src/next/ui/tile.css web/src/next/ui/index.js web/src/next/play/PlayTile.jsx web/src/next/play/playFrame.css web/src/next/play/landing.css web/src/next/play/Play.jsx tests/next-kit-tile.test.jsx tests/next-play-frame.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/ui/Tile.jsx web/src/next/ui/tile.css web/src/next/play/PlayTile.jsx
git commit -m "Kit Tile (design audit B0-1): Play's landing tile moves into the kit; Play draws it unchanged" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Notes:** record what ran, and whether #479 had merged at Step 1.

---

## Task 2 · Loading in the final shape (design audit B0-2)

### Task 2: Skeleton `tiles` and `landing` shapes

Spec 4.5: "every layer shows `ui/Skeleton.jsx` blocks in its final shape while it loads." Home loads as three short
panels today, then jumps to a 460 px card and a tile row. `landing` is a next-move card plus `count` tiles in two
columns; `tiles` is the tiles alone (This week while `/personal` loads). Static: no shimmer.

**Files:**
- Modify: `web/src/next/ui/Skeleton.jsx`, `web/src/next/ui/skeleton.css`, `tests/next-ui.test.jsx`

**Interfaces:**
- Produces: `SKELETON_SHAPES = ['lines', 'rows', 'cards', 'panels', 'block', 'tiles', 'landing']`; classes `gx-skel-hero`,
  `gx-skel-countdown`, `gx-skel-button`, `gx-skel-tiles`, `gx-skel-tile`.

- [ ] **Step 1: Write the failing test.** In `tests/next-ui.test.jsx`, inside the describe that holds the existing
"a skeleton is a status that names what is loading" test, add after it:

```jsx
  it('D-69 step 2 (design audit B0-2): "landing" is a tab’s first card and its two-column tiles; "tiles" is the tiles alone; both static', () => {
    const landing = <ui.Skeleton label="Loading this week…" shape="landing" count={6}/>;
    expect(els(landing, byClass('gx-skel-hero'))).toHaveLength(1);
    expect(els(landing, byClass('gx-skel-button'))).toHaveLength(1);
    expect(els(landing, byClass('gx-skel-tiles'))).toHaveLength(1);
    expect(els(landing, byClass('gx-skel-tile'))).toHaveLength(6);
    const tiles = <ui.Skeleton label="Loading this week’s games…" shape="tiles" count={4}/>;
    expect(els(tiles, byClass('gx-skel-hero'))).toHaveLength(0);
    expect(els(tiles, byClass('gx-skel-tile'))).toHaveLength(4);
    expect(ui.SKELETON_SHAPES).toEqual(['lines', 'rows', 'cards', 'panels', 'block', 'tiles', 'landing']);
    clean(landing); clean(tiles);
    // The LIVE dot is the app's one loop (BRAND_GUIDE Motion): a placeholder never shimmers.
    expect(readFileSync(join(UI_DIR, 'skeleton.css'), 'utf8')).not.toMatch(/animation|transition/);
  });
```

- [ ] **Step 2: Run it and see it fail.**

Run: `npx vitest run tests/next-ui.test.jsx`
Expected: FAIL (`expected 0 to have length 1` for `gx-skel-hero`; `SKELETON_SHAPES` lacks `tiles` and `landing`).

- [ ] **Step 3: Add the shapes.** In `web/src/next/ui/Skeleton.jsx`:
- Change the header's shape list sentence to: `Shapes: lines (text), rows (a list of rows with a face), cards (game cards),
  panels (cards with a heading and two lines), block (one field, such as a note), tiles (a tab's two-column tiles) and
  landing (a tab's next-move card, then its tiles).`
- Replace the shapes constant and add the tile helper below `Bar`:

```jsx
export const SKELETON_SHAPES = Object.freeze(['lines', 'rows', 'cards', 'panels', 'block', 'tiles', 'landing']);
```

```jsx
const SkelTile = ({ i }) => <span className="gx-skel-tile"><Bar width={2}/><Bar title/><Bar width={1 + (i % 2)}/></span>;
const tilesOf = each => <span className="gx-skel-tiles">{each.map(i => <SkelTile key={i} i={i}/>)}</span>;
```

- In `art`, before `default:` add:

```jsx
    case 'tiles':
      return tilesOf(each);
    case 'landing':
      return (
        <>
          <span className="gx-skel-card gx-skel-hero">
            <Bar width={2}/><Bar title/><Bar width={1}/>
            <span className="gx-skel-block gx-skel-countdown"></span>
            <Bar width={0}/>
            <span className="gx-skel-button"></span>
          </span>
          {tilesOf(each)}
        </>
      );
```

In `web/src/next/ui/skeleton.css`, before the forced-colors block add:

```css
/* D-69 step 2 (design audit B0-2): a tab's next-move card (the glow card's padding and radius) and its two-column tiles
   (the kit's .gx-tiles: 112 px tiles, 12 px apart). */
.gx-skel-hero { gap: 16px; min-height: 320px; padding: 24px; border-radius: var(--gx-radius-lg); }
.gx-skel-block.gx-skel-countdown { height: 64px; }
.gx-skel-button { display: block; height: 52px; margin-top: auto; border-radius: var(--gx-radius-sm); background: var(--gx-surface-3); }
.gx-skel-tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.gx-skel-tile {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  min-height: 112px;
  padding: 12px;
  border-radius: var(--gx-radius-md);
  background: var(--gx-surface-1);
  box-shadow: var(--gx-e1);
}
```

and add `.gx-skel-tile,` and `.gx-skel-button,` to the forced-colors selector list.

- [ ] **Step 4: Run it and see it pass.**

Run: `npx vitest run tests/next-ui.test.jsx`
Expected: PASS (the existing every-shape loop now covers `tiles` and `landing` too).
Run: `node --test tests/next-tokens.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/next/ui/Skeleton.jsx web/src/next/ui/skeleton.css tests/next-ui.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/ui/Skeleton.jsx web/src/next/ui/skeleton.css
git commit -m "Skeleton tiles and landing shapes (design audit B0-2): a tab's first card loads in its final shape" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3 · Home's layer address

### Task 3: `layer=who` is a step on the home view

The router already keeps a safe `layer` on any tab (`router.js` `KEYS`), so `#home?layer=who` parses and writes today.
What is missing is the reducer: opening it must be a step, the lip must go back, Back after a reload must close it, and
the Home tab (or the logo) must open Home's root, as the Play tab opens Play's landing.

**Files:**
- Modify: `web/src/next/shell/state.js`, `web/src/next/shell/Shell.jsx` (`onHome`), `tests/next-router.test.mjs`

**Interfaces:**
- Produces: `navigationPatch` treats a change of `views.home.layer` as a step; `isDetail` is true on Home with a layer;
  the `tab`/`go` reducer clears Home's `layer` on a fresh Home destination (as it clears `PLAY_LAYER_KEYS`).

- [ ] **Step 1: Write the failing tests.** Append to `tests/next-router.test.mjs`:

```js
test('D-69 step 2: Who’s in is a Home layer at #home?layer=who: a step; its lip and Back close it; a reload reopens it; the Home tab opens the root', () => {
  const root = initialState({ tab: 'home' });
  const who = reduce(root, { type: 'view', tab: 'home', patch: { layer: 'who' } });
  assert.equal(who.views.home.layer, 'who');
  assert.equal(who.trail.length, 1, 'opening the layer is a step');
  assert.equal(who.navMode, 'go');
  assert.equal(fragmentFor('home', who.views.home), '#home?layer=who');
  for (const closed of [reduce(who, { type: 'back' }), reduce(who, { type: 'view', tab: 'home', patch: { layer: undefined } })]) {
    assert.equal(closed.views.home.layer ?? null, null);
    assert.deepEqual(closed.trail, [], 'the lip is Back, so the next Back leaves nothing open');
  }
  const reloaded = initialState(placeFromFragment('#home?layer=who'));
  assert.deepEqual([reloaded.tab, reloaded.views.home.layer, reloaded.trail.length], ['home', 'who', 0], 'a reload or a shared link reopens it');
  const back = reduce(reloaded, { type: 'back' });
  assert.deepEqual([back.tab, back.views.home.layer ?? null, back.navMode], ['home', null, 'back'], 'Back after a reload closes the layer');
  assert.equal(reduce(who, { type: 'tab', tab: 'home' }).views.home.layer ?? null, null, 'the Home tab opens Home’s root');
  assert.equal(reduce(who, { type: 'go', tab: 'home' }).views.home.layer ?? null, null, 'so does the logo');
  const away = reduce(who, { type: 'go', tab: 'play', view: { section: 'score' } });
  assert.equal(reduce(away, { type: 'back' }).views.home.layer, 'who', 'Back from another tab returns to the layer');
  assert.equal(placeFromFragment('#home?layer=%3Cscript%3E').view?.layer, undefined, 'only safe characters');
});

test('D-69 step 2: browser Back closes Home’s Who’s in layer, Forward reopens it, and a reload keeps it', async () => {
  const win = fakeWindow('https://gtl.test/#home'); const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'home', patch: { layer: 'who' } });
  assert.equal(win.location.hash, '#home?layer=who');
  win.history.back(); await settle();
  assert.equal(shell.state.views.home.layer ?? null, null);
  assert.equal(win.location.hash, '#home');
  win.history.forward(); await settle();
  assert.equal(shell.state.views.home.layer, 'who');
  shell.connection.disconnect();
  const reloaded = app(win);
  assert.equal(reloaded.state.views.home.layer, 'who');
  reloaded.connection.disconnect();
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `node --test tests/next-router.test.mjs`
Expected: FAIL (`opening the layer is a step`: trail length 0; then the Back-after-reload and Home-tab assertions).

- [ ] **Step 3: Make the layer a step.** In `web/src/next/shell/state.js`:

Replace `isDetail` with:

```js
// D-69 step 2: Home's layer (Who's in) is a detail too, so Back after a reload closes it and the top bar shows Back.
export const isDetail = state => !!state.views[state.tab]?.section || (state.tab === 'bets' && !!state.views.bets.view)
  || (state.tab === 'home' && !!state.views.home?.layer);
```

In `navigationPatch`, after the D-69 step 1 Play `layer`/`item` line add:

```js
  // D-69 step 2: opening or closing Home's layer (Who's in, `#home?layer=who`) is a step, so Back closes it and its lip goes back.
  || (tab === 'home' && Object.hasOwn(patch, 'layer') && (patch.layer ?? null) !== (state.views.home?.layer ?? null))
```

After `const PLAY_LAYER_KEYS = …` add:

```js
/** Home's layer key (D-69 step 2): Who's in opens over Home's root. */
const HOME_LAYER_KEYS = Object.freeze(['layer']);
/** The view keys that open a nested layer, per tab: a fresh destination on that tab never carries one over. */
const LAYER_KEYS = Object.freeze({ play: PLAY_LAYER_KEYS, home: HOME_LAYER_KEYS });
```

In `reduce`, case `'tab'`/`'go'`, replace the `const next = …` line with:

```js
      const layerKeys = LAYER_KEYS[target.tab] ?? null;
      const next = layerKeys && layerKeys.some(key => Object.hasOwn(current, key)) ? Object.fromEntries(Object.entries(current).filter(([key]) => !layerKeys.includes(key))) : current;
```

In `reduce`, case `'back'`: `originView` restores only `section` and `view` when the prior place is a tab root (newer
list and filter preferences survive), and Home's root has no section, so without this Back would leave `layer=who`
open. Replace its final `return` with:

```js
      const view = originView(state.views[prior.tab], prior.view, detail);
      // D-69 step 2: Home's layer is navigation, not a preference: Back puts it back as it was (closed at Home's root).
      if (prior.tab === 'home') for (const key of HOME_LAYER_KEYS) view[key] = prior.view?.[key];
      return { ...state, ...closed, tab: prior.tab, views: { ...state.views, ...adapters, [prior.tab]: view }, trail: state.trail.slice(0, -1), nav: state.nav + 1, navMode: 'back' };
```

In `web/src/next/shell/Shell.jsx`, so the logo on Home's layer opens Home's root:

```jsx
  const onHome = () => (state.tab === 'home' && !state.page && !isDetail(state) && !hasLayers(state) ? toTop() : actions.go('home'));
```

- [ ] **Step 4: Run them and see them pass, with the other navigation tests.**

Run: `node --test tests/next-router.test.mjs tests/next-shell-state.test.mjs tests/next-four-tab-navigation.test.mjs tests/next-features-layers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/next/shell/state.js web/src/next/shell/Shell.jsx tests/next-router.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/shell/state.js web/src/next/shell/Shell.jsx
git commit -m "Home's Who's in layer has its own address: #home?layer=who is a step, Back and the Home tab close it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4 · Home as plain data

### Task 4: The card's words, the six tile models and This week's game tiles

Every word Home draws comes from here. The tile models take the reads Home already makes; the game tiles take the
viewer's own `/personal` week (and the Community read only for a sit-out of the same week) and say each game's state in
the picks card's words (`play/moments.js` `gameState`, `STATE_WORDS`), never a value.

**Data, inspected:** `/personal` is `cloud/handler.mjs` lines 307–315 over `gtl_read_personal`
(`supabase/migrations/20261008224444_gtl_personal_workspace.sql` lines 73–77): `{ season, week, now, deadline, games:
[{ id, awayCode, homeCode, away, home, kickoff }], ballots: { <mode>: the viewer's own ballot (where user_id = p_user) },
rules, scoring? }`. A week without a published slate answers 404 (Play's `PlayDetail` already handles it). The
Community read carries no per-game lock state of the viewer (its `due` rows are counts), so the game tiles need
`/personal`.

**Files:**
- Modify: `web/src/next/home/homeModel.js`
- Create: `tests/next-home-model.test.mjs`

**Interfaces:**
- Consumes: `HOME_COPY`, `homeHero` (shared/home-view.mjs); `ballotProgress` (play/landing.js); `rankChip`
  (play/yourScore.js); `gameState`, `STATE_WORDS` (play/moments.js); `gamesOf`, `optOutsFor`, `teamOf`
  (shared/lines-view.mjs); `weekOpenAt` (shared/nfl-schedule.mjs); `show` (communityFormat.js).
- Produces (all pure):
  - `HOME_LAYERS = { who: 'who' }`; `HOME_TILE_ICONS = { guess_spread: 'chart', guess_total: 'target', who: 'people', awards: 'award' }`; `GAME_TILES = 4`.
  - `HERO_COPY` adds `nextMove`, `allIn(week)`, `satOut(week)` (keeps `lockIn`, `before`, `nextKickoff`, `locked`,
    `opensSoon`, `dueSoon`, `streak`); `gamesToLock(community)` unchanged.
  - `heroHeadline({ hero, community }) → { eyebrow, title, sub }`.
  - `heroMeters(community) → [{ mode, done, of, words }]`.
  - `rankTileView({ label, tile, move }) → { ranked, big, arrow, points, tone, ariaLabel }`.
  - `whoTile({ whosIn, week }) → { big, sub, people, ariaLabel }`.
  - `awardsTile({ model, off, waiting }) → { big, sub, tone, isNew, ariaLabel }`.
  - `betsTile({ loading, error, active }) → { big, sub, ariaLabel }`.
  - `trendsTile(saved) → { big, sub, ariaLabel, open }`.
  - `weekGames(personal, community, { limit }) → null | { season, week, count, games: [{ id, away, home, matchup, when,
    state, word, ariaLabel, open }] }`.

- [ ] **Step 1: Write the failing tests.** Create `tests/next-home-model.test.mjs`:

```js
// D-69 step 2, Home as plain data (web/src/next/home/homeModel.js): the next-move card's words (H1A, C9), the six tile
// models and This week's game tiles. Fixture weeks and fictional people only. Each test names the contract it protects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME_COPY, homeHero } from '../shared/home-view.mjs';
import { GAME_TILES, HERO_COPY, awardsTile, betsTile, heroHeadline, heroMeters, rankTileView, trendsTile, weekGames, whoTile } from '../web/src/next/home/homeModel.js';

const THU = '2026-11-06T01:15:00.000Z'; // Thu Nov 5, 5:15 PM PT: the deadline and first kickoff
const SUN10 = '2026-11-08T18:00:00.000Z', SUN1 = '2026-11-08T21:05:00.000Z', SUN5 = '2026-11-09T01:20:00.000Z', MON = '2026-11-10T01:15:00.000Z';
const TUESDAY = '2026-11-03T20:00:00.000Z';
const row = (mode, extra) => ({ mode, submitted: false, satOut: false, filled: 0, games: 4, ...extra });
const due = (spread = {}, total = {}) => [row('guess_spread', { filled: 2, ...spread }), row('guess_total', total)];
const community = ({ state = 'due', rows = due(), perGame = false } = {}) => ({ viewer: 'u-you', ...(perGame ? { rules: { perGameScoring: true } } : {}),
  week: { season: 2026, week: 9, deadline: THU, games: 4 }, picksDue: { state, week: 9, deadline: THU, opensAt: '2026-11-02T08:00:00.000Z', now: TUESDAY, modes: [] }, due: rows });
const headline = c => heroHeadline({ hero: homeHero({ community: c }), community: c });
const wordCount = text => String(text).split(/\s+/).filter(w => w && w !== '·').length;

test('the card while picks are due: "Your next move", the action in words and the deadline; per-game names the next kickoff', () => {
  assert.deepEqual(headline(community()), { eyebrow: 'Your next move', title: 'Lock in 4 games', sub: 'before Thu 5:15 PM PT' });
  const perGame = community({ perGame: true, rows: due({ locked: 1, openGames: 3, nextKickoff: SUN10 }, { locked: 2, openGames: 2, nextKickoff: SUN10 }) });
  assert.deepEqual(headline(perGame), { eyebrow: 'Your next move', title: 'Lock in 3 games', sub: 'Next kickoff Sun 10:00 AM PT' });
});

test('nothing due: "Week N" over one plain headline; both ballots done reads "Week N locked in", every market sat out "Week N sat out"', () => {
  assert.deepEqual(headline(community({ state: 'done', rows: due({ submitted: true, filled: 4 }, { satOut: true }) })), { eyebrow: 'Week 9', title: HERO_COPY.allIn(9), sub: null });
  assert.equal(HERO_COPY.allIn(9), 'Week 9 locked in');
  assert.equal(headline(community({ state: 'done', rows: due({ satOut: true, filled: 0 }, { satOut: true }) })).title, 'Week 9 sat out');
  assert.deepEqual(headline(community({ state: 'not_open' })), { eyebrow: 'Week 9', title: HERO_COPY.opensSoon, sub: null });
  assert.deepEqual(headline(community({ state: 'closed' })), { eyebrow: 'Week 9', title: HOME_COPY.closed, sub: null });
  assert.deepEqual(headline({ picksDue: { state: 'none', modes: [] }, due: [] }), { eyebrow: null, title: HOME_COPY.noWeek, sub: null });
});

test('C9: each market’s meter carries its own words: picked, locked, sent or sat out; no week, no meters', () => {
  assert.deepEqual(heroMeters(community()), [
    { mode: 'guess_spread', done: 2, of: 4, words: 'Spread · 2 of 4 picked' }, { mode: 'guess_total', done: 0, of: 4, words: 'Total · 0 of 4 picked' }]);
  const perGame = community({ perGame: true, rows: [row('guess_spread', { games: 14, locked: 3, openGames: 11 }), row('guess_total', { games: 14, locked: 0, openGames: 14 })] });
  assert.deepEqual(heroMeters(perGame).map(m => [m.words, m.done, m.of]), [['Spread · 3 of 14 locked', 3, 14], ['Total · 0 of 14 locked', 0, 14]]);
  assert.deepEqual(heroMeters(community({ state: 'done', rows: due({ submitted: true, filled: 4 }, { satOut: true }) })).map(m => [m.words, m.done, m.of]),
    [['Spread · sent', 4, 4], ['Total · sat out', 0, 4]]);
  assert.deepEqual(heroMeters({ picksDue: { state: 'none' }, due: [] }), []);
});

test('rank tiles: the ordinal big, "▲ 2 · 41 pts" with its word in the name; a drop is plain; unranked says so, never a zero', () => {
  assert.deepEqual(rankTileView({ label: 'Spread rank', tile: { rank: 2, tied: true, label: 'T-2', points: 10, scored: 4, of: 4 } }),
    { ranked: true, big: 'T-2', arrow: null, points: 10, tone: 'plain', ariaLabel: 'Spread rank, T-2, 10 points' });
  assert.deepEqual(rankTileView({ label: 'Spread rank', tile: { rank: 3, tied: false, label: '3', points: 41, scored: 6, of: 6 }, move: 2 }),
    { ranked: true, big: '3rd', arrow: '▲ 2', points: 41, tone: 'good', ariaLabel: 'Spread rank, 3rd, up 2, 41 points' });
  assert.deepEqual(rankTileView({ label: 'Total rank', tile: { rank: 5, tied: false, label: '5', points: 36.5, scored: 6, of: 6 }, move: -1 }),
    { ranked: true, big: '5th', arrow: '▼ 1', points: 36.5, tone: 'plain', ariaLabel: 'Total rank, 5th, down 1, 36.5 points' });
  assert.deepEqual(rankTileView({ label: 'Total rank', tile: { rank: null, tied: false, label: '—', points: null, scored: 0, of: 3 } }),
    { ranked: false, big: '—', arrow: null, points: null, tone: 'plain', ariaLabel: 'Total rank, not scored yet' });
});

test('Who’s in: "4 / 6" with up to four faces (you first) and "Spread ballots in"; no week or no members says so', () => {
  const people = ['you', 'a', 'b', 'c', 'd'].map((id, i) => ({ id: `u-${id}`, name: id, you: i === 0, status: 'in' }));
  assert.deepEqual(whoTile({ whosIn: { in: 4, of: 5, people }, week: 9 }), { big: '4 / 5', sub: 'Spread ballots in', people: people.slice(0, 4), ariaLabel: 'Who’s in, 4 of 5 Spread ballots in' });
  assert.deepEqual(whoTile({ whosIn: { in: 0, of: 5, people }, week: null }), { big: '—', sub: 'No week open', people: [], ariaLabel: 'Who’s in, no week open' });
  assert.deepEqual(whoTile({ whosIn: { in: 0, of: 0, people: [] }, week: 9 }), { big: '—', sub: 'No members yet', people: [], ariaLabel: 'Who’s in, no members yet' });
});

test('Awards: the newest week’s count; your award named, "New:" only while its moment waits; NEW for a waiting award or badge, never a streak', () => {
  const model = { recap: { week: 8, rows: [{ id: 'spread_winner' }, { id: 'total_winner' }, { id: 'best_guess' }], mine: { name: 'Sharpshooter' } } };
  assert.deepEqual(awardsTile({ model }), { big: '3', sub: 'Week 8 · You won Sharpshooter', tone: 'good', isNew: false, ariaLabel: 'Awards, 3 in Week 8, you won Sharpshooter' });
  const waiting = [{ id: 'award:community:2026:8:sharpshooter', kind: 'award', title: 'Sharpshooter' }];
  assert.deepEqual(awardsTile({ model, waiting }), { big: '3', sub: 'Week 8 · New: Sharpshooter', tone: 'good', isNew: true, ariaLabel: 'Awards, 3 in Week 8, new: Sharpshooter' });
  assert.deepEqual(awardsTile({ model: { recap: { ...model.recap, mine: null } }, waiting: [{ id: 'badge:x', kind: 'badge', title: 'Bullseye' }] }),
    { big: '3', sub: 'Week 8 awards', tone: 'plain', isNew: true, ariaLabel: 'Awards, 3 in Week 8' });
  assert.equal(awardsTile({ model, waiting: [{ id: 'streak:pick:2026:5:5', kind: 'streak', title: 'Pick streak' }] }).isNew, false, 'a waiting streak belongs to the card, not the Awards tile');
  assert.equal(awardsTile({ model, waiting: [{ id: 'award:community:2026:7:best_guess', kind: 'award', title: 'Best guess' }] }).sub, 'Week 8 · You won Sharpshooter', 'an older week’s award is NEW but never named as this week’s');
  assert.deepEqual(awardsTile({ model: null, off: true }), { big: '—', sub: 'Coming soon', tone: 'plain', isNew: false, ariaLabel: 'Awards, coming soon' });
  assert.deepEqual(awardsTile({ model: null }), { big: '—', sub: 'Badges and awards', tone: 'plain', isNew: false, ariaLabel: 'Awards' });
  assert.deepEqual(awardsTile({ model: { recap: null } }), { big: '—', sub: 'None posted yet', tone: 'plain', isNew: false, ariaLabel: 'Awards, none posted yet' });
});

test('My bets and Trends: one ticket in the singular, a dash while loading, retry on failure; saved trends counted, else charts for every game', () => {
  assert.deepEqual(betsTile({ loading: true, error: null, active: null }), { big: '—', sub: 'active tickets', ariaLabel: 'My bets, loading' });
  assert.deepEqual(betsTile({ loading: false, error: null, active: 1 }), { big: '1', sub: 'active ticket', ariaLabel: 'My bets, 1 active ticket' });
  assert.deepEqual(betsTile({ loading: false, error: null, active: 0 }), { big: '0', sub: 'active tickets', ariaLabel: 'My bets, 0 active tickets' });
  assert.deepEqual(betsTile({ loading: false, error: { status: 503 }, active: null }), { big: '—', sub: 'Open to retry', ariaLabel: 'My bets, could not load, open to retry' });
  assert.deepEqual(trendsTile([{ id: 'a' }, { id: 'b' }, { id: 'c' }]), { big: '3', sub: 'saved', ariaLabel: 'Trends, 3 saved', open: { section: 'trends', trendSection: 'build', season: null, week: null } });
  assert.deepEqual(trendsTile([]), { big: '0', sub: 'Charts for every game', ariaLabel: 'Trends, none saved, charts for every game', open: { section: 'trends', season: null, week: null } });
});

const G = (id, kickoff) => { const [away, home] = id.split('-'); return { id, awayCode: away, homeCode: home, away, home, kickoff }; };
const GAMES = [G('SEA-DEN', THU), G('BUF-KC', SUN10), G('LAC-LV', SUN10), G('NYG-PHI', SUN1), G('HOU-JAX', SUN5), G('CHI-GB', MON)];
// The viewer's own Spread ballot: a draft on BUF-KC, a lock on LAC-LV with its saved line (never shown on a tile).
const BALLOT = { picks: { 'BUF-KC': -4.5, 'LAC-LV': 7.5 }, lockedAt: { 'LAC-LV': '2026-11-04T18:00:00.000Z' }, scoringReferences: { 'LAC-LV': { status: 'available', value: 3.5 } } };
const personal = (now, extra = {}) => ({ season: 2026, week: 9, now, deadline: THU, rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  games: GAMES, ballots: { guess_spread: BALLOT }, ...extra });
// Sun Nov 8 9:00 AM PT; Mon Nov 9 10:00 AM PT (before Monday night); Wed Nov 11 10:00 AM PT (every game played).
const SUNDAY_MORNING = '2026-11-08T17:00:00.000Z', MONDAY_MORNING = '2026-11-09T18:00:00.000Z', WEDNESDAY_AFTER = '2026-11-11T18:00:00.000Z';

test('This week: the next four games in kickoff order with your own Spread word; when fewer remain, the week’s last four', () => {
  assert.equal(GAME_TILES, 4);
  const sunday = weekGames(personal(SUNDAY_MORNING));
  assert.deepEqual([sunday.season, sunday.week, sunday.count], [2026, 9, 6]);
  assert.deepEqual(sunday.games.map(g => [g.id, g.word]), [['BUF-KC', 'Draft'], ['LAC-LV', 'Locked'], ['NYG-PHI', 'Open'], ['HOU-JAX', 'Open']], 'Thursday’s game has gone');
  assert.deepEqual(sunday.games[0], { id: 'BUF-KC', away: 'BUF', home: 'KC', matchup: 'BUF @ KC', when: 'Sun 10:00 AM PT', state: 'draft', word: 'Draft',
    ariaLabel: 'Bills at Chiefs, Sun 10:00 AM PT, Spread draft', open: { market: 'spread', season: 2026, week: 9, pickGame: 'BUF-KC' } });
  assert.deepEqual(weekGames(personal(MONDAY_MORNING)).games.map(g => [g.id, g.word]), [['LAC-LV', 'Locked'], ['NYG-PHI', 'Kicked off'], ['HOU-JAX', 'Kicked off'], ['CHI-GB', 'Open']]);
  assert.deepEqual(weekGames(personal(WEDNESDAY_AFTER)).games.map(g => g.id), ['LAC-LV', 'NYG-PHI', 'HOU-JAX', 'CHI-GB'], 'all kicked off: the last four');
  assert.deepEqual(weekGames({ ...personal(SUNDAY_MORNING), games: GAMES.slice(4) }).games.map(g => g.id), ['HOU-JAX', 'CHI-GB'], 'a short week shows what it has');
  assert.equal(weekGames(personal('2026-11-01T12:00:00.000Z')).games[0].word, 'Not open', 'before Monday 12:00 AM PT the week is not open');
});

test('a sit-out: open games say "Sat out" and a locked guess stays "Locked"; another week’s sit-out is not this week’s', () => {
  assert.deepEqual(weekGames(personal(SUNDAY_MORNING, { scoring: { guess_spread: { satOut: true } } })).games.map(g => g.word), ['Sat out', 'Locked', 'Sat out', 'Sat out']);
  assert.deepEqual(weekGames(personal(SUNDAY_MORNING), { week: { season: 2026, week: 9 }, optOuts: ['guess_spread'] }).games.map(g => g.word), ['Sat out', 'Locked', 'Sat out', 'Sat out']);
  assert.deepEqual(weekGames(personal(SUNDAY_MORNING), { week: { season: 2026, week: 8 }, optOuts: ['guess_spread'] }).games.map(g => g.word), ['Draft', 'Locked', 'Open', 'Open']);
});

test('D-31: a game tile carries your own state word only: no pick, no saved line and nothing of another player, whatever the replies hold', () => {
  const leaky = personal(SUNDAY_MORNING, { others: [{ userId: 'u-troy', picks: { 'BUF-KC': 6.5 } }] });
  const view = weekGames(leaky, { week: { season: 2026, week: 9 }, optOuts: [], submissions: [{ userId: 'u-troy', mode: 'guess_spread', picks: { 'BUF-KC': 6.5 } }] });
  const text = JSON.stringify(view);
  for (const secret of ['6.5', '4.5', '7.5', '3.5', 'u-troy']) assert.ok(!text.includes(secret), `no ${secret} on Home`);
  for (const tile of view.games) assert.deepEqual(Object.keys(tile).sort(), ['ariaLabel', 'away', 'home', 'id', 'matchup', 'open', 'state', 'when', 'word']);
});

test('empty and failed shapes: no reply, no games or no kickoff draw no tiles; without the server’s clock nothing is offered as open', () => {
  assert.equal(weekGames(null), null);
  assert.equal(weekGames({ ...personal(SUNDAY_MORNING), games: [] }), null);
  assert.equal(weekGames({ ...personal(SUNDAY_MORNING), games: [{ id: 'SEA-DEN' }] }), null);
  assert.deepEqual(weekGames({ ...personal(SUNDAY_MORNING), now: null }).games.map(g => g.word), ['Kicked off', 'Kicked off', 'Locked', 'Kicked off']);
  assert.deepEqual(weekGames({ ...personal(SUNDAY_MORNING), ballots: {} }).games.map(g => g.word), ['Open', 'Open', 'Open', 'Open']);
});

test('no surface sentence over twelve words in anything Home says (D-66)', () => {
  const said = [
    ...[community(), community({ state: 'done', rows: due({ submitted: true, filled: 4 }, { satOut: true }) }), community({ state: 'not_open' })].flatMap(c => [...Object.values(headline(c)), ...heroMeters(c).map(m => m.words)]),
    rankTileView({ label: 'Spread rank', tile: { rank: 3, tied: false, label: '3', points: 41, scored: 6, of: 6 }, move: 2 }).ariaLabel,
    awardsTile({ model: { recap: { week: 8, rows: [{}], mine: { name: 'Best guess' } } }, waiting: [{ id: 'award:community:2026:8:best_guess', kind: 'award', title: 'Best guess' }] }).ariaLabel,
    ...weekGames(personal(SUNDAY_MORNING)).games.flatMap(g => [g.ariaLabel, g.when, g.word]),
  ].filter(Boolean);
  for (const line of said) assert.ok(wordCount(line) <= 12, line);
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `node --test tests/next-home-model.test.mjs`
Expected: FAIL (`SyntaxError: The requested module ... does not provide an export named 'GAME_TILES'`).

- [ ] **Step 3: Write the model.** Replace all of `web/src/next/home/homeModel.js` with:

```js
// Home as plain data (D-69 step 2, layout H1A, with the design audit's C9): the next-move card's words, the six tiles and
// This week's game tiles, from the replies Home already reads (the normalized /community/read reply and its shared hero,
// shared/home-view.mjs; the viewer's own /personal week; the features, tickets and saved-trends reads). Pure: no React,
// storage, network or clock of its own; every count and time is the server's.
// - The card: "Your next move" over "Lock in 9 games" and "before Thu 5:15 PM PT" while picks are due ("Next kickoff
//   Sun 10:00 AM PT" with per-game lock-in); otherwise "Week N" over one plain headline ("Week N locked in" once nothing
//   is left). Each market's meter carries its own words ("Spread · 3 of 14 locked").
// - The count is the games still to lock in the market with the most left: a per-game market's `openGames` (open and
//   not yet locked by you), a whole-market ballot's games until it is sent or sat out.
// - A game tile says only the viewer's own Spread state, in the picks card's words (play/moments.js gameState), never a
//   pick, a line or another player (D-31).
// "N games live" is not drawn: the Community read carries no per-game status and there is no approved live source
// (rule of restraint 8), so Home never claims a game is in progress.
import { MODES } from '../../../../shared/guess-board.mjs';
import { HOME_COPY } from '../../../../shared/home-view.mjs';
import { gamesOf, optOutsFor, teamOf } from '../../../../shared/lines-view.mjs';
import { weekOpenAt } from '../../../../shared/nfl-schedule.mjs';
import { show } from '../../communityFormat.js';
import { DASH, SEP, fmtWhen, plural } from '../format.js';
import { ballotProgress } from '../play/landing.js';
import { STATE_WORDS, gameState } from '../play/moments.js';
import { rankChip } from '../play/yourScore.js';

/** Home's layers (`#home?layer=who`). */
export const HOME_LAYERS = Object.freeze({ who: 'who' });
/** Each tile's glyph (ui/Icon.jsx names); My bets and Trends take theirs from ui/destinations.js. */
export const HOME_TILE_ICONS = Object.freeze({ guess_spread: 'chart', guess_total: 'target', who: 'people', awards: 'award' });
/** How many of the week's games This week shows. */
export const GAME_TILES = 4;

export const HERO_COPY = Object.freeze({
  nextMove: 'Your next move',
  lockIn: n => `Lock in ${plural(n, 'game')}`,
  before: when => `before ${when}`,
  nextKickoff: when => `Next kickoff ${when}`,
  allIn: week => `Week ${week} locked in`,
  satOut: week => `Week ${week} sat out`,
  locked: HOME_COPY.closed,
  opensSoon: 'Picks open soon',
  dueSoon: 'Due soon',
  streak: n => `${n}-week pick streak`,
});

/** Games still to lock in across the week's markets (the market with the most left), from the server's `due` rows. */
export function gamesToLock(community) {
  const due = Array.isArray(community?.due) ? community.due : [];
  const week = community?.week;
  const games = Array.isArray(week?.games) ? week.games.length : Number(week?.games) || 0;
  const perGame = community?.rules?.perGameScoring === true;
  const left = MODES.map(mode => {
    const row = due.find(d => d?.mode === mode);
    if (!row) return games;
    if (perGame && Number.isInteger(row.locked)) return Number.isInteger(row.openGames) && row.openGames > 0 ? row.openGames : 0;
    if (row.submitted === true || row.satOut === true) return 0;
    return Number(row.games) || games;
  });
  return Math.max(0, ...left);
}

/** Each market's week as Play's landing reads it (ballotProgress: a per-game sit-out keeps its locked count). */
const marketRows = community => ['spread', 'total'].map(market => ballotProgress(community, market)).filter(Boolean);
const doneTitle = (community, week) => {
  const rows = marketRows(community);
  return rows.length && rows.every(row => row.satOut) ? HERO_COPY.satOut(week) : HERO_COPY.allIn(week);
};

/** `{ eyebrow, title, sub }` for the card: the eyebrow, the one headline and the meta line under it (null when none). */
export function heroHeadline({ hero, community }) {
  const week = hero?.week ?? null;
  if (hero?.state === 'none' || week === null) return { eyebrow: null, title: HOME_COPY.noWeek, sub: null };
  const eyebrow = HOME_COPY.weekTitle(week);
  if (hero.action?.primary) {
    const n = gamesToLock(community);
    if (n === 0) return { eyebrow, title: doneTitle(community, week), sub: null };
    const when = hero.countdownTarget ? fmtWhen(hero.countdownTarget) : null;
    return { eyebrow: HERO_COPY.nextMove, title: HERO_COPY.lockIn(n), sub: when ? (hero.perGame ? HERO_COPY.nextKickoff(when) : HERO_COPY.before(when)) : null };
  }
  if (hero.state === 'done') return { eyebrow, title: doneTitle(community, week), sub: null };
  if (hero.state === 'not_open') return { eyebrow, title: HERO_COPY.opensSoon, sub: null };
  return { eyebrow, title: HERO_COPY.locked, sub: null };
}

/** C9: one meter per market with its own words, for the card's one status row. No week, no meters. */
export function heroMeters(community) {
  return marketRows(community).map(row => ({ mode: row.mode, done: row.done, of: row.of,
    words: `${row.label}${SEP}${row.satOut ? 'sat out' : row.state === 'sent' ? 'sent' : `${row.done} of ${row.of} ${row.state === 'locked' ? 'locked' : 'picked'}`}` }));
}

/**
 * A rank tile (`tile` is shared/guess-board.mjs rankTile): the ordinal as the big number, the move this device last saw
 * as "▲ 2" (good) or "▼ 1" (plain; a drop stays quiet), the season points under it. Unranked is said, never a zero.
 */
export function rankTileView({ label, tile, move = null }) {
  const chip = rankChip(tile, move);
  if (!chip) return { ranked: false, big: DASH, arrow: null, points: null, tone: 'plain', ariaLabel: `${label}, ${HOME_COPY.notScored.toLowerCase()}` };
  const points = typeof tile.points === 'number' && Number.isFinite(tile.points) ? tile.points : null;
  const arrow = chip.move > 0 ? `▲ ${chip.move}` : chip.move < 0 ? `▼ ${-chip.move}` : null;
  const said = [chip.move > 0 ? `up ${chip.move}` : chip.move < 0 ? `down ${-chip.move}` : null, points === null ? null : `${show(points)} points`];
  return { ranked: true, big: chip.label, arrow, points, tone: chip.move > 0 ? 'good' : 'plain', ariaLabel: [`${label}, ${chip.label}`, ...said].filter(Boolean).join(', ') };
}

/** Who's in (`whosIn` is shared/guess-board.mjs whosIn for the Spread ballot): "4 / 6", up to four faces, you first. */
export function whoTile({ whosIn, week }) {
  if (week === null || week === undefined) return { big: DASH, sub: 'No week open', people: [], ariaLabel: 'Who’s in, no week open' };
  if (!(whosIn?.of > 0)) return { big: DASH, sub: 'No members yet', people: [], ariaLabel: 'Who’s in, no members yet' };
  return { big: `${whosIn.in} / ${whosIn.of}`, sub: 'Spread ballots in', people: whosIn.people.slice(0, 4), ariaLabel: `Who’s in, ${whosIn.in} of ${whosIn.of} Spread ballots in` };
}

/**
 * Awards: the newest week's award count (features model `recap`), your own award named ("New:" only while its moment
 * waits, as the Badges tile does), and NEW while any award or badge moment waits for Badges and awards (`waiting` is
 * useNewMoments(SCOPES.features)). A waiting Pick streak is the card's, not this tile's.
 */
export function awardsTile({ model = null, off = false, waiting = [] } = {}) {
  const fresh = (Array.isArray(waiting) ? waiting : []).filter(m => m?.kind === 'award' || m?.kind === 'badge');
  const isNew = fresh.length > 0;
  const recap = model?.recap ?? null;
  if (!recap?.rows?.length) {
    if (off) return { big: DASH, sub: 'Coming soon', tone: 'plain', isNew, ariaLabel: 'Awards, coming soon' };
    return model ? { big: DASH, sub: 'None posted yet', tone: 'plain', isNew, ariaLabel: 'Awards, none posted yet' }
      : { big: DASH, sub: 'Badges and awards', tone: 'plain', isNew, ariaLabel: 'Awards' };
  }
  const week = HOME_COPY.weekTitle(recap.week), n = recap.rows.length;
  // An award moment's id is award:<league>:<season>:<week>:<award> (features/model.js featureMoments).
  const named = fresh.filter(m => m.kind === 'award' && String(m.id).split(':')[3] === String(recap.week)).at(-1)?.title ?? null;
  const mine = recap.mine?.name ?? null;
  const sub = named ? `${week}${SEP}New: ${named}` : mine ? `${week}${SEP}You won ${mine}` : `${week} awards`;
  const said = named ? `new: ${named}` : mine ? `you won ${mine}` : null;
  return { big: String(n), sub, tone: named || mine ? 'good' : 'plain', isNew, ariaLabel: [`Awards, ${n} in ${week}`, said].filter(Boolean).join(', ') };
}

/** My bets (bets/useTicketSummary.js): active tickets, the word agreeing with the count (design audit A22). */
export function betsTile({ loading = false, error = null, active = null } = {}) {
  if (error) return { big: DASH, sub: 'Open to retry', ariaLabel: 'My bets, could not load, open to retry' };
  if (loading || !Number.isInteger(active)) return { big: DASH, sub: 'active tickets', ariaLabel: 'My bets, loading' };
  const word = active === 1 ? 'active ticket' : 'active tickets';
  return { big: String(active), sub: word, ariaLabel: `My bets, ${active} ${word}` };
}

/** Trends: this device's saved trends (trends/builderData.js useSavedTrends), opening on them; none, charts for every game. */
export function trendsTile(saved) {
  const n = Array.isArray(saved) ? saved.length : 0;
  if (n > 0) return { big: String(n), sub: 'saved', ariaLabel: `Trends, ${n} saved`, open: { section: 'trends', trendSection: 'build', season: null, week: null } };
  return { big: '0', sub: 'Charts for every game', ariaLabel: 'Trends, none saved, charts for every game', open: { section: 'trends', season: null, week: null } };
}

/**
 * This week (H1A): up to `limit` game tiles from the viewer's own /personal week, the first games in kickoff order that
 * had not kicked off at the server's `now` (the week's last ones when fewer remain), each with the viewer's own Spread
 * state in the picks card's words. `community` only says a sit-out of the same week (lines-view optOutsFor). Reads the
 * viewer's own ballot and nothing else. Null when the week has no games.
 */
export function weekGames(personal, community = null, { limit = GAME_TILES } = {}) {
  const games = gamesOf(personal);
  if (!games.length) return null;
  const ballot = personal.ballots?.guess_spread ?? null;
  const now = Date.parse(personal.now ?? '');
  const openAt = personal.deadline ? Date.parse(weekOpenAt(personal.deadline)) : NaN;
  const receipt = personal.scoring?.guess_spread?.satOut;
  const satOut = typeof receipt === 'boolean' ? receipt : optOutsFor(personal, community).includes('guess_spread');
  const ahead = Number.isFinite(now) ? games.findIndex(game => now < Date.parse(game.kickoff)) : 0;
  const start = Math.min(ahead === -1 ? games.length : ahead, Math.max(0, games.length - limit));
  const season = personal.season ?? null, week = personal.week ?? null;
  return { season, week, count: games.length, games: games.slice(start, start + limit).map(game => {
    const state = gameState(game, { ballot, picks: ballot?.picks ?? {}, now, openAt, satOut });
    const away = teamOf(game.away), home = teamOf(game.home), when = fmtWhen(game.kickoff), word = STATE_WORDS[state];
    return { id: game.id, away: away.code, home: home.code, matchup: `${away.code} @ ${home.code}`, when, state, word,
      ariaLabel: `${away.nick} at ${home.nick}, ${when}, Spread ${word.toLowerCase()}`,
      open: { market: 'spread', season, week, pickGame: game.id } };
  }) };
}
```

- [ ] **Step 4: Run them and see them pass.**

Run: `node --test tests/next-home-model.test.mjs tests/home-hero.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/next/home/homeModel.js tests/next-home-model.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/home/homeModel.js tests/next-home-model.test.mjs
git commit -m "Home as plain data: the next-move card's words (H1A, C9), six tile models and This week's own-state game tiles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5 · Which cards hold Home's moments

### Task 5: Home plays Whole week locked and the Pick streak; rank moves play on Your score

Spec 6 step 2: "Home plays only the whole-week-locked and Pick streak moments, in place", and "results from while you
were away show NEW on their tile. Opening the tile plays the moment." A moment plays where one of its scopes is open
(`moments/detect.js` `planMoments`), so this task changes only the scopes the detectors list, plus one new per-market
scope for Your score, where the rank tiles lead:
- Whole week locked: `[picksScope(mode), SCOPES.play, SCOPES.home]` (Home's meter column pops).
- Pick streak: `[SCOPES.features, SCOPES.home]` (Home's streak pill pops).
- Badges and awards: `FEATURE_SCOPES = [features, league, play]` (no longer `home`).
- A Community board rank move: `[SCOPES.league, scoreScope(mode)]`; a private group's stays `[SCOPES.league]`. Your score
  opens `scoreScope(<its market>)` and pops its season rank chip with the moment's id; reaching 1st is the big card.

**Files:**
- Modify: `web/src/next/moments/catalog.js`, `web/src/next/league/rankMoment.js`, `web/src/next/features/model.js`,
  `web/src/next/features/streakMoment.js`, `web/src/next/play/landing.js`, `web/src/next/play/scoreHooks.js`,
  `web/src/next/play/WeeklyScore.jsx`
- Create: `tests/next-home-moments.test.mjs`, `tests/next-score-rank-pop.test.jsx`
- Tests modified: `tests/next-moments.test.mjs`, `tests/next-play-landing.test.mjs`, `tests/next-features-streak.test.mjs`,
  `tests/next-features.test.mjs`, `tests/next-rank-moment.test.mjs`

**Interfaces:**
- Produces: `scoreScope(mode) → 'score:<mode>'` (catalog.js); `rankMomentId(saved, league, mode) → string` (rankMoment.js);
  `useSeasonRanks(app)[mode]` gains `momentId`; Your score's `.gx-ys-rank` carries `data-moment="pop"` when its id plays.
- Consumes: `createMomentsEngine`, `weekLockedMoments`, `WEEK_LOCKED_SOURCE`, `streakMoments`, `featureMoments`,
  `rankCandidate`, `rankSource`, `usePopped`, `useMomentScope`.

- [ ] **Step 1: Write the failing engine-level tests.** Create `tests/next-home-moments.test.mjs`:

```js
// D-69 step 2 (spec 6 "Step 2 · Home", 4.2): Home plays only Whole week locked and the Pick streak, in place. Every other
// result from while you were away shows NEW on its Home tile and plays when that tile's card opens, never on launch. The
// detectors are the real ones; the engine is the real one with a test clock. Fixture accounts only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { SCOPES, scoreScope } from '../web/src/next/moments/catalog.js';
import { WEEK_LOCKED_SOURCE, weekLockedMoments } from '../web/src/next/play/landing.js';
import { streakMoments } from '../web/src/next/features/streakMoment.js';
import { FEATURE_SCOPES, featureMoments } from '../web/src/next/features/model.js';
import { rankCandidate, rankSource } from '../web/src/next/league/rankMoment.js';

const YOU = 'u-you';
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig(storage = memory()) {
  const small = [], big = [], here = { settled: false, navigated: false };
  const engine = createMomentsEngine({ account: YOU, storage, isSettled: () => here.settled, hasNavigated: () => here.navigated,
    onBig: ms => big.push(ms.map(m => m.id)), onSmall: m => small.push(m.id), setTimer: fn => { fn(); }, now: () => 0 });
  return { engine, small, big, here, storage };
}
const DEADLINE = '2026-11-06T01:15:00.000Z';
const community = locked => ({ viewer: YOU, rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  week: { season: 2026, week: 9, deadline: DEADLINE, games: 14 }, picksDue: { state: 'due', week: 9, deadline: DEADLINE, now: '2026-11-03T20:00:00.000Z', modes: [] },
  due: [{ mode: 'guess_spread', submitted: false, satOut: false, filled: locked, games: 14, openGames: 14 - locked, locked, nextKickoff: locked < 14 ? DEADLINE : null },
    { mode: 'guess_total', submitted: false, satOut: false, filled: 0, games: 14, openGames: 14, locked: 0, nextKickoff: DEADLINE }] });
const AWARD = { week: 8, version: 1, createdAt: '2026-11-03T16:00:00Z', awards: [{ id: 'total_winner', winners: [YOU], entries: [], value: { points: 18 } }] };
const features = (streak, award) => ({ leagueId: null, season: 2026, ran: true, seasonWinners: null, badges: [], awards: award ? [AWARD] : [],
  streaks: [{ userId: YOU, pick: { current: streak, best: streak }, bets: { current: 0, best: 0 } }] });
const rankUp = n => rankCandidate({ league: 'community', mode: 'guess_spread', saved: { rank: 2, from: 3, n }, market: 'Spread' });
/** One read of each source Home's hooks report: Whole week locked, the features read (awards and streak), the Spread rank. */
function readAll(engine, { locked = 13, streak = 4, award = false, rank = null } = {}) {
  engine.report(weekLockedMoments(community(locked)), { source: WEEK_LOCKED_SOURCE });
  const reply = features(streak, award);
  engine.report([...featureMoments(reply, YOU), ...streakMoments(reply, YOU)], { source: 'features:community' });
  engine.report(rank === null ? [] : [rankUp(rank)], { source: rankSource('community', 'guess_spread') });
}
const WEEK = 'weekLocked:2026:9:guess_spread', STREAK = 'streak:pick:2026:5:5', AWARD_ID = 'award:community:2026:8:total_winner', RANK = 'rank:community:guess_spread:1';

test('in place: with Home open after the launch, Whole week locked and a longer Pick streak pop on Home; an award and a rank move wait as NEW', () => {
  const r = rig();
  readAll(r.engine); // this device's first read of each source seeds it silently
  r.here.settled = true; r.here.navigated = true;
  r.engine.open(SCOPES.home);
  readAll(r.engine, { locked: 14, streak: 5, award: true, rank: 1 });
  assert.deepEqual(r.small.toSorted(), [STREAK, WEEK].toSorted(), 'two small moments, in place');
  assert.deepEqual(r.big, [], 'nothing big plays on Home');
  assert.deepEqual(r.engine.newMoments(SCOPES.features).filter(m => m.kind === 'award').map(m => m.id), [AWARD_ID], 'the award waits for the Awards tile');
  assert.equal(r.engine.newCount(scoreScope('guess_spread')), 1, 'the rank move waits for the Spread rank tile');
  assert.equal(r.engine.newCount(scoreScope('guess_total')), 0, 'and never for the Total tile');
});

test('never on launch: results from while you were away wait as NEW even with Home open; each plays once when its own card opens', () => {
  const storage = memory();
  readAll(rig(storage).engine); // yesterday: this device read every source
  const r = rig(storage);
  const launch = r.engine.open(SCOPES.home); // the launch screen
  readAll(r.engine, { locked: 14, streak: 5, award: true, rank: 1 }); // the session's first reads
  r.here.settled = true;
  assert.deepEqual([r.small, r.big], [[], []], 'nothing plays on the launch screen, even after a press');
  assert.equal(r.engine.newCount(SCOPES.home), 2, 'Whole week locked and the streak wait for Home’s card');
  r.here.navigated = true;
  const score = r.engine.open(scoreScope('guess_spread')); // the Spread rank tile opens Your score
  assert.deepEqual(r.small, [RANK], 'the rank move plays on Your score, small');
  launch(); const home = r.engine.open(SCOPES.home); // back to Home after a navigation
  assert.deepEqual(r.small.slice(1).toSorted(), [STREAK, WEEK].toSorted(), 'Home’s own two play when its card opens again');
  r.engine.open(SCOPES.features); // the Awards tile opens Badges and awards
  assert.deepEqual(r.big, [[AWARD_ID]], 'the award plays big there, once');
  score(); home(); r.engine.open(SCOPES.home); r.engine.open(scoreScope('guess_spread'));
  assert.equal(r.small.length, 3, 'nothing replays');
});

test('Home holds no badge or award, and a private group’s rank move never waits on Your score', () => {
  assert.deepEqual(FEATURE_SCOPES, ['features', 'league', 'play']);
  const r = rig();
  readAll(r.engine);
  r.here.settled = true; r.here.navigated = true;
  r.engine.open(SCOPES.home);
  readAll(r.engine, { award: true });
  assert.deepEqual(r.big, [], 'a new award never plays on Home');
  assert.deepEqual(rankCandidate({ league: 'L1', mode: 'guess_spread', saved: { rank: 2, from: 3, n: 1 }, market: 'Spread' }).scopes, [SCOPES.league]);
  assert.deepEqual(rankUp(1).scopes, [SCOPES.league, scoreScope('guess_spread')]);
});
```

Create `tests/next-score-rank-pop.test.jsx`:

```jsx
// D-69 step 2: a Community rank move plays on Your score when the rank tile on Home opens it, so the season rank chip pops
// in place (data-moment="pop") with that moment's id, and only while it is on screen. Fixture data only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ popped: [] }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn() }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ state: { views: { play: {} } }, go: vi.fn(), setView: vi.fn() }) }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useMomentScope: () => {}, useNewCount: () => 0, useNewMoments: () => [], usePopped: id => state.popped.includes(id) }));
const { WeeklyScoreContent } = await import('../web/src/next/play/WeeklyScore.jsx');

const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-10-18T20:00:00Z' };
const entry = { userId: 'owner', mode: 'guess_spread', status: 'draft', eligible: true, scoreTiming: 'immediate', weekPoints: 8, weekScored: 1, standingsPoints: 0, awaitingKickoffPoints: 8,
  picks: [{ gameId: game.id, guess: -3, lockedIn: true, lockedAt: '2026-10-15T18:00:00Z', points: 8, reference: { value: -5, source: 'Synthetic three-book median', observedAt: '2026-10-15T17:59:00Z' } }] };
const data = { viewer: 'owner', season: 2026, seasons: [2026], now: '2026-10-19T00:00:00Z', weeks: [{ season: 2026, week: 6, games: [game], entries: [entry] }] };
const rank = { rank: 2, label: '2nd', move: 1, said: 'season rank 2nd, up 1', momentId: 'rank:community:guess_spread:1' };
const chip = html => [...walk(parseMarkup(html))].find(n => (n.attrs?.class ?? '').split(/\s+/).includes('gx-ys-rank'));
const render = () => renderToStaticMarkup(<div className="gx"><WeeklyScoreContent data={data} view={{}} rank={rank} onChange={() => {}} onRefresh={() => {}} onPicks={() => {}}/></div>);

describe('Your score’s season rank chip', () => {
  it('pops when its rank move plays, and is still otherwise', () => {
    state.popped = [];
    expect(chip(render()).attrs['data-moment']).toBeUndefined();
    state.popped = ['rank:community:guess_spread:1'];
    expect(chip(render()).attrs['data-moment']).toBe('pop');
  });
});
```

Update the existing assertions to the new scopes:
- `tests/next-moments.test.mjs`: extend the catalog import to `import { SCOPES, scoreScope, sizeOf } …` (keep the file's other
  imports) and add after the `scopes:` test:

```js
test('scoreScope: Your score holds a scope per market, so a rank tile’s waiting move plays on its own market only', () => {
  assert.equal(scoreScope('guess_spread'), 'score:guess_spread');
  assert.equal(scoreScope('guess_total'), 'score:guess_total');
});
```

- `tests/next-play-landing.test.mjs` line 79: `scopes: [picksScope('guess_spread'), SCOPES.play, SCOPES.home]`.
- `tests/next-features-streak.test.mjs` line 27: `scopes: [SCOPES.features, SCOPES.home]`.
- `tests/next-features.test.mjs` line 95: `assert.deepEqual(M.FEATURE_SCOPES, ['features', 'league', 'play']);`
- `tests/next-rank-moment.test.mjs`: import `scoreScope` from catalog.js and change line 37's scopes to
  `[SCOPES.league, scoreScope('guess_spread')]`.

- [ ] **Step 2: Run them and see them fail.**

Run: `node --test tests/next-home-moments.test.mjs tests/next-moments.test.mjs tests/next-play-landing.test.mjs tests/next-features-streak.test.mjs tests/next-features.test.mjs tests/next-rank-moment.test.mjs`
Expected: FAIL (`does not provide an export named 'scoreScope'`).
Run: `npx vitest run tests/next-score-rank-pop.test.jsx`
Expected: FAIL (`expected undefined to be 'pop'`).

- [ ] **Step 3: Change the scopes.**

`web/src/next/moments/catalog.js`, after `picksScope`:

```js
/** Your score of one market ('guess_spread', 'guess_total'), D-69 step 2: a Community rank move waits on its market's
 * Your score card as well as on League, so Home's rank tile that opens it plays it there ("score:guess_total"). */
export const scoreScope = mode => `${SCOPES.score}:${mode}`;
```

`web/src/next/league/rankMoment.js`: import `scoreScope` beside `SCOPES`, and in `rankCandidate` replace
`scopes: [SCOPES.league],` with:

```js
    // A Community board move also waits on that market's Your score (its season rank chip), where Home's rank tile leads.
    scopes: !league || league === 'community' ? [SCOPES.league, scoreScope(mode)] : [SCOPES.league],
```

and add after `rankSource`:

```js
/** The id of the moment the last change in `saved` reported (rankCandidate's id), or '' when no change is on record. */
export const rankMomentId = (saved, league, mode) => (rankOf(saved?.rank) !== null && rankOf(saved?.from) !== null ? `${rankSource(league, mode)}:${countOf(saved.n)}` : '');
```

`web/src/next/features/model.js`:

```js
/** The cards that hold badge and award moments (D-69): they play when one of these opens after the launch. Home is not
 * one (D-69 step 2): a waiting badge or award shows NEW on Home's Awards tile and plays where that tile leads. */
export const FEATURE_SCOPES = Object.freeze([SCOPES.features, SCOPES.league, SCOPES.play]);
```

`web/src/next/features/streakMoment.js`: in `pickStreakMoment` return `scopes: [SCOPES.features, SCOPES.home]`, and change
its doc line to ``/** The Pick streak moment, or null: `{ id, kind: 'streak', scopes: ['features', 'home'], title, meta }`; Home's card pops its streak pill (D-69 step 2). */``.

`web/src/next/play/landing.js`, `weekLockedMoments`: `scopes: [picksScope(row.mode), SCOPES.play, SCOPES.home],` and add
"and on Home's card (SCOPES.home, D-69 step 2)" to its doc comment's last sentence.

`web/src/next/play/scoreHooks.js`: import `rankMomentId` beside `peekMove`, and in `useSeasonRanks` replace the loop body:

```js
    for (const mode of MODES) {
      const tile = community ? rankTile({ standings: community.standings, viewer, mode }) : null;
      const saved = readRank(rankKey(viewer, 'community', mode));
      const chip = rankChip(tile, tile?.rank ? peekMove(saved, { rank: tile.rank }) : null);
      // D-69 step 2: the chip carries the id of the rank move on record, so it pops when that move plays here.
      out[mode] = chip ? { ...chip, momentId: rankMomentId(saved, 'community', mode) } : null;
    }
```

`web/src/next/play/WeeklyScore.jsx`: import `usePopped` beside `useMomentScope` and `scoreScope` beside `SCOPES`; in
`WeeklyScore` after `useMomentScope(SCOPES.score);` add:

```jsx
  // D-69 step 2: the shown market's own scope, where a Community rank move from Home's rank tile plays (its chip pops).
  useMomentScope(scoreScope(modeOf(view.market)));
```

and in `ScoreHero`:

```jsx
function ScoreHero({ hero, rank, account, figure }) {
  const pop = usePopped(rank?.momentId ?? '');
  return <section className="gx-ys-hero" aria-label="Personal score summary">
```

with the chip line becoming:

```jsx
      {rank ? <p className="gx-ys-rank" data-moment={pop ? 'pop' : undefined}><span className="gx-t-micro gx-c-2">Season</span> <span className="gx-n-s">{rank.label}</span>{rank.move ? <> <Move by={rank.move}/></> : null}</p> : null}
```

- [ ] **Step 4: Run them and see them pass, with every moments, League and Your score test.**

Run: `node --test tests/next-home-moments.test.mjs tests/next-moments.test.mjs tests/next-moments-engine.test.mjs tests/next-moments-play.test.mjs tests/next-play-landing.test.mjs tests/next-features-streak.test.mjs tests/next-features.test.mjs tests/next-rank-moment.test.mjs tests/next-your-score.test.mjs tests/next-league-model.test.mjs`
Expected: PASS.
Run: `npx vitest run tests/next-score-rank-pop.test.jsx tests/next-scoring-ui.test.jsx tests/next-score-tile.test.jsx tests/next-features-ui.test.jsx tests/next-league-layers.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/next/moments/catalog.js web/src/next/league/rankMoment.js web/src/next/features/model.js web/src/next/features/streakMoment.js web/src/next/play/landing.js web/src/next/play/scoreHooks.js web/src/next/play/WeeklyScore.jsx tests/next-home-moments.test.mjs tests/next-score-rank-pop.test.jsx tests/next-moments.test.mjs tests/next-play-landing.test.mjs tests/next-features-streak.test.mjs tests/next-features.test.mjs tests/next-rank-moment.test.mjs
git diff --cached --stat
git commit -m "Moments for Home: week locked and the Pick streak play on Home; rank moves play on Your score; badges leave Home" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Notes:** run `tests/cloud-browser/next-design-home-league.spec.js` once here too (its League rank test reaches 1st on
the board); it must still pass unchanged, since League is still in the rank move's scopes.

---

## Task 6 · The Home screen

### Task 6: The next-move card (C9), six tiles, loading and Home's moments

`Home.jsx` is rewritten on the kit: the card, the six tiles, the B0-2 skeleton. Home reports the reads it shows
(Whole week locked, both Community rank moves) and holds `SCOPES.home` only while its card is mounted. The awards card
and the "This week" rows leave; `HomeAwards.jsx` and `SavedTrendsHomeRow` lose their only caller and are deleted. Task 7
adds This week and the Who's in layer.

**Files:**
- Modify: `web/src/next/home/Home.jsx` (rewrite), `web/src/next/home/home.css` (rewrite), `web/src/next/home/homeData.js`,
  `web/src/next/features/HomeStreak.jsx`, `web/src/next/features/features.css` (delete the three `.gx-fx-home` rules),
  `web/src/next/trends/SavedTrendsSummary.jsx` (delete `SavedTrendsHomeRow` and any import only it used)
- Delete: `web/src/next/features/HomeAwards.jsx`
- Tests modified: `tests/next-home-ui.test.jsx`, `tests/next-design-home-league.test.jsx`, `tests/four-tab-landings.test.jsx`

**Interfaces:**
- Consumes: Task 1 `Tile`; Task 2 `Skeleton shape="landing"`; Task 4 models; Task 5 `scoreScope`; `useRankMoment`,
  `useWeekLocked`, `useFeatures`, `useTicketSummary`, `useSavedTrends`, `featuresView`, `weekLockedId`, `pickStreakMoment`.
- Produces: `useHomeData() → { app, preferences, community, personal, viewer }` (`personal` is `useSharedRead('personal')`);
  the hooks listed in the Task map.

- [ ] **Step 1: Update the Home render test first.** In `tests/next-home-ui.test.jsx`:

Replace the import line and the mocks block (lines 7–15 today) with:

```jsx
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { HOME_COPY } from '../shared/home-view.mjs';
import { HERO_COPY } from '../web/src/next/home/homeModel.js';
import { rankKey } from '../web/src/next/league/rankMoment.js';
import { featuresModel } from '../web/src/next/features/model.js';
import { scoreScope } from '../web/src/next/moments/catalog.js';

vi.mock('../web/src/api.js', () => ({ meApi: vi.fn() }));
const state = vi.hoisted(() => ({ home: null, tickets: { loading: true, error: null, active: null }, features: { model: null }, waiting: {}, popped: [], scopes: [] }));
vi.mock('../web/src/next/home/homeData.js', () => ({ useHomeData: () => state.home }));
// The tickets tile's read, held loading (its real first render) unless a test sets a count.
vi.mock('../web/src/next/bets/useTicketSummary.js', () => ({ useTicketSummary: () => state.tickets }));
// The features read (awards, the Pick streak) and the moments engine stand in: each test says what read and what waits.
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => state.features }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({
  useMoments: () => null, useMomentScope: scope => { state.scopes.push(scope); },
  useNewCount: scope => (state.waiting[scope] ?? []).length, useNewMoments: scope => state.waiting[scope] ?? [], usePopped: id => state.popped.includes(id),
}));
```

Add after `const tile = …`:

```jsx
const button = n => nodes(n, x => x.tag === 'button')[0];
/** D-66 (design audit B0-4): each element's own visible text runs no longer than twelve words. */
const longLines = html => nodes(html, n => !hidden(n) && n.attrs['aria-hidden'] !== 'true')
  .map(n => n.children.filter(c => c.text !== undefined).map(c => c.text).join(' ').replace(/\s+/g, ' ').trim())
  .filter(text => text.split(' ').filter(w => w && w !== '·').length > 12);
const FEATURES = { leagueId: null, season: 2026, ran: true, badges: [], seasonWinners: null,
  awards: [{ week: 5, version: 1, createdAt: '2026-10-13T16:00:00Z', awards: [{ id: 'spread_winner', winners: ['u-blake'], entries: [], value: { points: 12 } }, { id: 'total_winner', winners: ['u-casey'], entries: [], value: { points: 7 } }] }],
  streaks: [{ userId: 'u-casey', pick: { current: 3, best: 3 }, bets: { current: 0, best: 0 } }] };
const features = () => ({ model: featuresModel(FEATURES, { viewer: 'u-casey', nameOf: id => id }), data: FEATURES });
```

Change `afterEach` to:

```jsx
afterEach(() => { state.home = null; state.features = { model: null }; state.waiting = {}; state.popped = []; state.scopes = []; vi.clearAllMocks(); });
```

Change these existing tests (same `it` names unless given):
- "one lime button…": the status expectation becomes
  `expect(nodes(html, attr('data-home', 'status')).map(textOf)).toEqual(['Spread · 2 of 4 picked Total · 0 of 4 picked']);`
- "the hero names the next action" → rename to `'the card names the next action under "Your next move": "Lock in 4 games" over "before Thu 5:15 PM PT"'`
  and replace its last two expectations (the week said once, no "Due soon") with:

```jsx
    expect(nodes(hero, attr('data-home', 'eyebrow')).map(textOf)).toEqual([HERO_COPY.nextMove]);
    expect(seen(hero)).not.toContain('Week 6');
    expect(textOf(hero)).not.toContain(HERO_COPY.dueSoon);
```

- "three stat tiles, who’s in with Standings and Invite…" → replace with:

```jsx
  it('H1A: six tiles in two columns, each one button with its spoken name; Who’s in is a tile, not a card', () => {
    home(reply());
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const list = nodes(html, attr('data-home', 'tiles'))[0];
    expect(list.attrs.class).toContain('gx-tiles');
    expect(nodes(list, n => n.tag === 'li').map(li => li.attrs['data-tile'])).toEqual(['spread', 'total', 'who', 'awards', 'tickets', 'trends']);
    expect(nodes(list, n => n.tag === 'button').map(nameFrom)).toEqual([
      'Spread rank, T-2, 10 points', 'Total rank, not scored yet', 'Who’s in, 4 of 5 Spread ballots in', 'Awards', 'My bets, loading', 'Trends, none saved, charts for every game']);
    expect(nodes(tile(html, 'who'), hasClass('gx-tile-pic'))).toHaveLength(1);
    expect(nodes(html, attr('data-home', 'whos-in'))).toHaveLength(0);
    expect(nodes(html, hasClass('gx-meter3'))).toHaveLength(2);
    expect(html).not.toContain('Your scores');
  });
```

- "a ranked tile shows its rank…": `expect(seen(spread)).toBe('Spread rank T-2 10 pts');` and
  `expect(seen(total)).toBe(\`Total rank — ${HOME_COPY.notScored}\`);` (keep the points and count-up expectations; delete
  the `gx-move` line).
- "a rank tile shows the last move…": replace the three `move` lines with

```jsx
      expect(seen(spread)).toBe('Spread rank T-2 ▲ 2 · 10 pts');
      expect(nameFrom(button(spread))).toBe('Spread rank, T-2, up 2, 10 points');
      expect(nodes(spread, hasClass('gx-tile-sub--good'))).toHaveLength(1);
```

- "closed… done… no week": the done heading becomes `expect(heading(html)).toEqual(['Week 6 locked in']);` and its
  status `['Spread · sent Total · sat out']`.
- "says it is loading in a status region": `expect(nodes(html, attr('data-skeleton', 'landing'))).toHaveLength(1);`

Add at the end of the file:

```jsx
describe('NEW on Home’s tiles (D-69 4.2: results from while you were away, never played on launch)', () => {
  it('a rank move that waits shows NEW on its own market’s tile and says it; the other tile stays quiet', () => {
    home(reply());
    state.waiting = { [scoreScope('guess_spread')]: [{ id: 'rank:community:guess_spread:1', kind: 'rankUp', title: 'Up to 2nd' }] };
    const html = render();
    expect(nameFrom(button(tile(html, 'spread')))).toBe('Spread rank, T-2, 10 points, new');
    expect(nodes(tile(html, 'spread'), hasClass('gx-new'))).toHaveLength(1);
    expect(nodes(tile(html, 'total'), hasClass('gx-new'))).toHaveLength(0);
  });

  it('the Awards tile: the newest week’s count, your award named, NEW for a waiting award or badge and never for a streak', () => {
    home(reply());
    state.features = features();
    expect(nameFrom(button(tile(render(), 'awards')))).toBe('Awards, 2 in Week 5, you won Total winner');
    state.waiting = { features: [{ id: 'award:community:2026:5:total_winner', kind: 'award', title: 'Total winner' }] };
    let awards = tile(render(), 'awards');
    expect(seen(awards)).toBe('Awards 2 Week 5 · New: Total winner NEW');
    expect(nameFrom(button(awards))).toBe('Awards, 2 in Week 5, new: Total winner');
    state.waiting = { features: [{ id: 'badge:x', kind: 'badge', title: 'Bullseye' }] };
    expect(nameFrom(button(tile(render(), 'awards')))).toBe('Awards, 2 in Week 5, you won Total winner, new');
    state.waiting = { features: [{ id: 'streak:pick:2026:4:4', kind: 'streak', title: 'Pick streak' }] };
    awards = tile(render(), 'awards');
    expect(nodes(awards, hasClass('gx-new'))).toHaveLength(0);
  });
});

describe('Home’s own moments (spec 6 step 2: only Whole week locked and the Pick streak, in place)', () => {
  it('Home holds only its own scope, from the next-move card, so a waiting badge, award or rank move never plays on Home', () => {
    home(reply()); state.scopes = [];
    render();
    expect(state.scopes).toEqual(['home']);
    home(null, { community: { status: 'loading', data: null, error: null, loading: true } }); state.scopes = [];
    render();
    expect(state.scopes, 'a loading Home holds no card, so nothing waiting is spent on a placeholder').toEqual([]);
  });

  it('Whole week locked pops its market’s meter in place; a longer Pick streak pops the streak pill', () => {
    home(reply());
    state.features = features();
    state.popped = ['weekLocked:2026:6:guess_spread', 'streak:pick:2026:3:3'];
    const html = render();
    const columns = nodes(nodes(html, attr('data-home', 'status'))[0], n => n.tag === 'li');
    expect(columns.map(li => [li.attrs['data-market'], li.attrs['data-moment'] ?? null])).toEqual([['guess_spread', 'pop'], ['guess_total', null]]);
    expect(nodes(html, attr('data-home', 'streak'))[0].attrs['data-moment']).toBe('pop');
  });
});

describe('words', () => {
  it('no surface sentence over twelve words on Home, in every card state (D-66; design audit B0-4)', () => {
    for (const community of [reply(), reply({ picksDue: { ...reply().picksDue, state: 'urgent' } }), reply({ picksDue: { state: 'done', modes: [] } }), reply({ week: null, due: [], submissions: [], standings: [], picksDue: { state: 'none', modes: [] } })]) {
      home(community); state.features = features();
      expect(longLines(render())).toEqual([]);
    }
  });
});
```

In `tests/next-design-home-league.test.jsx` delete the `HomeAwards` import and the three HomeAwards tests (their
contracts, nothing before a recap, your award first and the destination, now live in the Awards tile tests above and in
`next-home-model.test.mjs`), rename the describe to `'Home: the Pick streak'`, and keep the streak test unchanged.

In `tests/four-tab-landings.test.jsx`, the Home test becomes:

```jsx
  // D-69 step 2 (H1A): Home keeps one lime action; six tiles replace the stat tiles, the awards card and the trends row.
  it('Home has one action and six tiles instead of full boards and research', () => {
    const html = render(Home);
    expect(markupProblems(html)).toEqual([]);
    expect((html.match(/gx-btn--primary/g) || [])).toHaveLength(1);
    for (const name of ['Spread rank', 'Total rank', 'Who’s in', 'Awards', 'My bets', 'Trends']) expect(html).toContain(name);
    for (const removed of ['Explore the week', 'Research readiness', 'New here? Start here', 'Your scores', 'This week’s trends']) expect(html).not.toContain(removed);
  });
```

- [ ] **Step 2: Run them and see them fail.**

Run: `npx vitest run tests/next-home-ui.test.jsx tests/four-tab-landings.test.jsx tests/next-design-home-league.test.jsx`
Expected: FAIL (six tiles, eyebrow, meter words, NEW and scope tests; `next-design-home-league` passes already).

- [ ] **Step 3: Read `/personal` on Home.** Replace `web/src/next/home/homeData.js` with:

```js
// D-53: shared Community context plus an account-scoped preferences read. D-69 step 2: the viewer's own week
// (`/personal`, the shared read Play's picks and Research already ask for) feeds This week's game tiles.
import { useAccountPreferences } from '../me/AccountPreferences.jsx';
import { useAppData, useSharedRead } from '../data/AppData.jsx';

export function useHomeData() {
  const app = useAppData();
  const preferences = useAccountPreferences(app);
  const personal = useSharedRead('personal');
  return { app, preferences, community: app.community, personal, viewer: app.accountId || null };
}
```

- [ ] **Step 4: The streak pill pops.** In `web/src/next/features/HomeStreak.jsx` import `usePopped` from
`'../moments/MomentsProvider.jsx'` and `pickStreakMoment` from `'./streakMoment.js'`, and replace the component:

```jsx
export function HomeStreak({ app }) {
  const shell = useShell();
  const features = useFeatures(app, shell);
  const n = pickStreak(features.model);
  // D-69 step 2: a longer streak's moment waits on Home's card too; it pops this pill in place when it plays.
  const pop = usePopped(pickStreakMoment(features.data, app?.accountId)?.id ?? '');
  if (!n) return null;
  return (
    <span className="gx-fx-flame" data-home="streak" data-moment={pop ? 'pop' : undefined}>
      <Icon icon={Flame} size={16} className="gx-c-accent"/>
      <span className="gx-fx-flame-text">{HERO_COPY.streak(n)}</span>
    </span>
  );
}
```

- [ ] **Step 5: Rewrite Home.** Replace all of `web/src/next/home/Home.jsx` with:

```jsx
// Home (D-69 step 2, layout H1A, built for Sean's review with the design audit's C9). One next-move card, then six tiles
// in two columns, each opening its own card:
// - the card (spec section 5): "Your next move" (or "Week N" when nothing is due) with the Pick streak beside it, the
//   action in words ("Lock in 9 games" over "before Thu 5:15 PM PT"), the countdown (the card's one picture), the Spread
//   and Total meters (side by side once the card is 360 px wide, C9) and the screen's one lime button;
// - the tiles: the Spread and Total ranks (Play › Your score), Who's in (its Home layer), Awards (Play › Badges and
//   awards), My bets (Bets › My bets) and Trends (Research › Trends).
// Home plays only Whole week locked and the Pick streak, in place on the card. Every other result from while you were
// away shows NEW on its tile and plays when that tile's card opens, never on launch. Every number comes from the shared
// reads; this screen writes nothing.
import { useEffect, useId, useMemo, useState } from 'react';
import { APP_RELOAD_COPY } from '../../appView.js';
import { MODE_LABEL } from '../../../../shared/guess-board.mjs';
import { HOME_COPY, homeHero, homeTiles } from '../../../../shared/home-view.mjs';
import { HOME_LOADING } from '../copy.js';
import { SEP } from '../format.js';
import { useShell } from '../shell/context.js';
import { SHELL_COPY } from '../shell/tabs.js';
import { AvatarStack, Button, Card, Countdown, DESTINATION_ICONS, Meter, Pill, Skeleton, Tile } from '../ui/index.js';
import { CountUp } from '../ui/CountUp.jsx';
import { useTicketSummary } from '../bets/useTicketSummary.js';
import { HomeStreak } from '../features/HomeStreak.jsx';
import { featuresView } from '../features/layers.js';
import { useFeatures } from '../features/useFeatures.js';
import { peekMove, rankKey, readRank } from '../league/rankMoment.js';
import { useRankMoment } from '../league/useRankMoment.js';
import { SCOPES, scoreScope } from '../moments/catalog.js';
import { useMomentScope, useNewCount, useNewMoments, usePopped } from '../moments/MomentsProvider.jsx';
import { weekLockedId } from '../play/moments.js';
import { nextGuess } from '../play/nextGuess.js';
import { useWeekLocked } from '../play/useWeekLocked.js';
import { useSavedTrends } from '../trends/builderData.js';
import { useHomeData } from './homeData.js';
import { HERO_COPY, HOME_LAYERS, HOME_TILE_ICONS, awardsTile, betsTile, heroHeadline, heroMeters, rankTileView, trendsTile, whoTile } from './homeModel.js';
import '../ui/focusLanding.css';
import './home.css';

function useServerNow(serverNow) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(serverNow);
    if (serverNow === null || serverNow === undefined) return undefined;
    const start = performance.now();
    const timer = setInterval(() => setNow(serverNow + (performance.now() - start)), 1000);
    return () => clearInterval(timer);
  }, [serverNow]);
  return now;
}

/** One market's half of the card's status row (C9): its words and its meter; it pops when that market's week locks here. */
function MeterColumn({ meter, season, week }) {
  const pop = usePopped(Number.isInteger(season) && Number.isInteger(week) ? weekLockedId(season, week, meter.mode) : '');
  return (
    <li className="gx-h-meter" data-market={meter.mode} data-moment={pop ? 'pop' : undefined}>
      <span className="gx-t-label">{meter.words}</span>
      {meter.of > 0 ? <Meter value={meter.done} max={meter.of} className="gx-h-meter-bar" data-market={meter.mode}/> : null}
    </li>
  );
}

/**
 * The next-move card, Home's one primary card. It holds Home's moments (SCOPES.home) while it is on screen, so nothing
 * waiting is spent while Home loads or shows a layer.
 */
function Hero({ app, hero, headline, meters, season, onPicks, onLines }) {
  useMomentScope(SCOPES.home);
  const id = useId();
  const now = useServerNow(hero.now);
  // Before the week opens the countdown runs to the open, under its own words; "done" never says "locked" there.
  const countdownLabel = hero.state === 'not_open' ? HOME_COPY.notOpen : hero.perGame ? 'Next game kickoff' : HOME_COPY.picksDueIn;
  return (
    <Card as="section" variant="hero" className="gx-h-hero gx-focus-action" aria-labelledby={id} data-home="hero" data-state={hero.state}>
      <div className="gx-h-top">
        {headline.eyebrow ? <p className="gx-t-micro gx-h-eyebrow" data-home="eyebrow">{headline.eyebrow}</p> : null}
        {hero.state === 'urgent' ? <Pill tone="pending">{HERO_COPY.dueSoon}</Pill> : null}
        <HomeStreak app={app}/>
      </div>
      <div className="gx-h-head">
        <h2 className="gx-t-display" id={id}>{headline.title}</h2>
        {headline.sub ? <p className="gx-t-strong" data-home="when">{headline.sub}</p> : null}
      </div>
      {hero.countdownTarget ? (
        <div className="gx-h-cd">
          {/* The timer carries these words in its name, so the visible line is not read twice. */}
          <p className="gx-t-label gx-c-2" aria-hidden="true">{countdownLabel}</p>
          <Countdown target={hero.countdownTarget} now={now ?? undefined} label={countdownLabel} doneLabel={countdownLabel}/>
        </div>
      ) : null}
      {meters.length ? (
        <ul className="gx-h-meters" data-home="status">
          {meters.map(meter => <MeterColumn key={meter.mode} meter={meter} season={season} week={hero.week}/>)}
        </ul>
      ) : null}
      {hero.action.primary
        ? <Button variant="primary" block onClick={onPicks}>{hero.action.label}</Button>
        : <Button variant="primary" block iconEnd="chevronRight" onClick={onLines}>Explore games</Button>}
    </Card>
  );
}

/**
 * A rank tile: the Community board rank for one market (ranked apart, never summed), the move this device last saw and
 * the season points counting up from what it last showed. It reports that board's rank moment from each fresh Community
 * read (League does the same; one id, one play), and shows NEW while the move waits for its Your score card.
 */
function RankTile({ mode, label, tile, viewer, read, fresh, onOpen }) {
  const moment = useRankMoment({ account: viewer, league: 'community', mode, rank: tile.rank, tied: tile.tied, market: MODE_LABEL[mode], read, fresh });
  // The arrow this device last saw, read without spending it; the report above moves the record on.
  const move = useMemo(() => peekMove(readRank(rankKey(viewer, 'community', mode)), { rank: tile.rank }), [viewer, mode, tile.rank, moment.id]);
  const isNew = useNewCount(scoreScope(mode)) > 0;
  const view = rankTileView({ label, tile, move });
  const sub = !view.ranked ? HOME_COPY.notScored : (
    <>
      {view.arrow ? `${view.arrow}${SEP}` : null}
      {view.points !== null ? <span data-home="points"><CountUp value={view.points} account={viewer} figure={`community.${mode}.season.${viewer}`}/> pts</span> : null}
    </>
  );
  return <Tile label={label} icon={HOME_TILE_ICONS[mode]} big={view.big} sub={sub} tone={view.tone} isNew={isNew} ariaLabel={view.ariaLabel} onClick={onOpen}/>;
}

function WhoTile({ who, week, onOpen }) {
  const view = whoTile({ whosIn: who, week });
  const faces = view.people.length ? <AvatarStack people={view.people} max={4} size={24}/> : null;
  return <Tile label={HOME_COPY.whosIn} icon={HOME_TILE_ICONS.who} picture={faces} big={view.big} sub={view.sub} ariaLabel={view.ariaLabel} onClick={onOpen}/>;
}

/** Awards: reads the shared features read (M-25) like every reader, and shows NEW while a badge or award waits. */
function AwardsTile({ app, shell }) {
  const features = useFeatures(app, shell);
  const waiting = useNewMoments(SCOPES.features);
  const view = awardsTile({ model: features.model, off: features.off, waiting });
  return <Tile label="Awards" icon={HOME_TILE_ICONS.awards} big={view.big} sub={view.sub} tone={view.tone} isNew={view.isNew} ariaLabel={view.ariaLabel} onClick={() => shell.go('play', featuresView())}/>;
}

/** My bets: the ticket read starts here, so Home reads tickets only once it has a week to show. */
function BetsTile({ app, onOpen }) {
  const view = betsTile(useTicketSummary(app));
  return <Tile label="My bets" icon={DESTINATION_ICONS.activeTickets} big={view.big} sub={view.sub} ariaLabel={view.ariaLabel} onClick={onOpen}/>;
}

function TrendsTile({ onOpen }) {
  const view = trendsTile(useSavedTrends().items);
  return <Tile label="Trends" icon={DESTINATION_ICONS.trends} big={view.big} sub={view.sub} ariaLabel={view.ariaLabel} onClick={() => onOpen(view.open)}/>;
}

/** The six tiles (H1A), in the order Sean's board shows them. */
function HomeTiles({ app, shell, community, tiles, hero, week, viewer }) {
  const read = community.data;
  // A rank moment comes only from a fresh read of this account's Community reply (spec 4.2 rule 1).
  const fresh = community.status === 'ready' && !community.error && (typeof read?.viewer !== 'string' || !viewer || read.viewer.toLowerCase() === viewer.toLowerCase());
  const toScore = market => shell.go('play', { section: 'score', ...week, market, team: '', matchup: '', scoreGame: null });
  return (
    <ul className="gx-tiles gx-h-tiles" aria-label="Home sections" data-home="tiles">
      <li data-tile="spread"><RankTile mode="guess_spread" label={HOME_COPY.spreadRank} tile={tiles.spread} viewer={viewer} read={read} fresh={fresh} onOpen={() => toScore('spread')}/></li>
      <li data-tile="total"><RankTile mode="guess_total" label={HOME_COPY.totalRank} tile={tiles.total} viewer={viewer} read={read} fresh={fresh} onOpen={() => toScore('total')}/></li>
      <li data-tile="who"><WhoTile who={tiles.whosIn} week={hero.week} onOpen={() => shell.setView('home', { layer: HOME_LAYERS.who })}/></li>
      <li data-tile="awards"><AwardsTile app={app} shell={shell}/></li>
      <li data-tile="tickets"><BetsTile app={app} onOpen={() => shell.go('bets', { view: 'active', season: null, week: null, period: null })}/></li>
      <li data-tile="trends"><TrendsTile onOpen={open => shell.go('research', open)}/></li>
    </ul>
  );
}

export function Home() {
  const shell = useShell();
  const { app, community } = useHomeData();
  // D-69: Whole week locked reads the shared Community read here too, and plays on Home's card (SCOPES.home).
  useWeekLocked(app);
  const data = community.data ?? null;
  const viewer = app.accountId || null;
  const hero = useMemo(() => (data ? homeHero({ community: data }) : null), [data]);
  const meters = useMemo(() => (data ? heroMeters(data) : []), [data]);
  const headline = useMemo(() => (hero ? heroHeadline({ hero, community: data }) : null), [hero, data]);
  const tiles = useMemo(() => (data ? homeTiles({ community: data, viewer }) : null), [data, viewer]);
  // The tab bar names this screen; the title stays for screen readers and the page outline.
  const head = <h1 className="gx-t-title gx-sr-only">{HOME_COPY.title}</h1>;
  if (!hero) {
    // A read that failed with no copy to show; a refusal (403) or a 401 is covered by the app gate before Home draws.
    const failed = community.status === 'error';
    return (
      <div className="gx-screen gx-h">
        {head}
        {failed ? (
          <section className="gx-empty" role="alert" aria-label={SHELL_COPY.tabFailed}>
            <p className="gx-t-strong">{SHELL_COPY.tabFailed}</p>
            <p className="gx-t-body gx-c-2">{SHELL_COPY.failHelp}</p>
            <Button variant="secondary" block onClick={() => app.refresh({ only: ['community'] })}>{SHELL_COPY.tryAgain}</Button>
            <Button variant="ghost" onClick={shell.reload}>{APP_RELOAD_COPY.reload}</Button>
          </section>
        ) : (
          <Skeleton label={HOME_LOADING} shape="landing" count={6}/>
        )}
      </div>
    );
  }
  const week = { season: data.week?.season ?? null, week: data.week?.week ?? null };
  const toPicks = () => shell.go('play', { section: 'picks', market: nextGuess(data), ...week });
  const toLines = () => shell.go('research', { section: 'games', season: null, week: null });
  return (
    <div className="gx-screen gx-h" data-landing="home">
      {head}
      <Hero app={app} hero={hero} headline={headline} meters={meters} season={week.season} onPicks={toPicks} onLines={toLines}/>
      {community.status === 'error' && <p className="gx-t-body" role="status">This week could not refresh. Showing the last loaded update.</p>}
      <HomeTiles app={app} shell={shell} community={community} tiles={tiles} hero={hero} week={week} viewer={viewer}/>
    </div>
  );
}
```

- [ ] **Step 6: Rewrite Home's stylesheet.** Replace all of `web/src/next/home/home.css` with:

```css
/* Home (D-69 step 2, H1A): the next-move card, the six tiles (the kit's, ui/tile.css) and Who's in's list. Shared kit
   classes are composed, never restyled; everything here is gx-h-. Tokens only. */
.gx .gx-h { gap: var(--gx-space-3); }

/* ----- the next-move card ----- */
/* 24 px padding, as the focus-landing card gives it, set here because C9's 360 px rule below counts on it. */
.gx .gx-h-hero { display: flex; flex-direction: column; align-items: stretch; gap: var(--gx-space-4); padding: var(--gx-space-6); }
.gx .gx-h-hero > .gx-btn { margin-top: var(--gx-space-1); }
/* The eyebrow, "Due soon" while urgent, and the Pick streak. Nothing to show, no line. */
.gx .gx-h-top { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-h-top:empty { display: none; }
/* The eyebrow is a label, not lime (D-38), in the glow card's second text color, as on Play. */
.gx .gx-h-eyebrow { margin: 0; color: var(--gx-hero-text-2); }
.gx .gx-h-head { display: flex; flex-direction: column; gap: var(--gx-space-1); min-width: 0; }
.gx .gx-h-cd { display: flex; flex-direction: column; align-items: flex-start; gap: var(--gx-space-2); }
/* A wider fallback font wraps the last countdown tile under the others instead of pushing it out of the card. */
.gx .gx-h-cd .gx-cd { flex-wrap: wrap; }
/* C9: the two markets as one status row of half-width meters with their words when the card's content box is at least
   312 px (a 360 px card less 2 x 24 px padding: 150 + 12 + 150), else stacked. auto-fit decides from the card's own
   width, not the viewport's; a long word wraps inside its column. */
.gx .gx-h-meters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: var(--gx-space-3); margin: 0; padding: 0; list-style: none; }
.gx .gx-h-meter { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.gx .gx-h-meter > .gx-t-label { overflow-wrap: anywhere; }
/* The week meter on the glow card: empty segments on the track, filled ones in the bar's end color; the words beside it
   carry the count, so it is a picture only. Kept even if the kit's own 8 px pills (#479, A10) land: Home never relies on them. */
.gx .gx-h-hero .gx-meter3 { gap: 3px; }
.gx .gx-h-hero .gx-meter3-seg { height: 8px; border-radius: var(--gx-radius-pill); background: var(--gx-track); box-shadow: none; }
.gx .gx-h-hero .gx-meter3-seg--on { background: var(--gx-bar-2); }
@media (forced-colors: active) {
  .gx .gx-h-hero .gx-meter3-seg { border: 1px solid CanvasText; }
  .gx .gx-h-hero .gx-meter3-seg--on { forced-color-adjust: none; background: CanvasText; }
}

/* ----- Who's in (the layer, Task 7): faces first, one status word each, then Standings and Invite ----- */
.gx .gx-h-people { display: flex; flex-direction: column; gap: var(--gx-space-2); margin: 0; padding: 0; list-style: none; }
.gx .gx-h-person { display: flex; align-items: center; gap: 10px; min-width: 0; }
.gx .gx-h-person > .gx-t-body { min-width: 0; overflow-wrap: anywhere; }
.gx .gx-h-who-actions { display: flex; flex-wrap: wrap; gap: var(--gx-space-2); }
.gx .gx-h-who-actions > .gx-btn { flex: 1 1 140px; }

/* Play's How to play guide (HomeGuide.jsx). */
.gx .gx-home-guide { padding-left: var(--gx-space-6); display: grid; gap: var(--gx-space-3); }
```

- [ ] **Step 7: Retire the pieces Home no longer draws.**

```bash
git rm web/src/next/features/HomeAwards.jsx
grep -rn "HomeAwards\|HOME_AWARDS_COPY\|SavedTrendsHomeRow\|gx-fx-home" web/src tests
```

Delete `SavedTrendsHomeRow` from `web/src/next/trends/SavedTrendsSummary.jsx` (and its `FocusRow` import if nothing else
there uses it) and the three `.gx .gx-fx-home…` rules from `web/src/next/features/features.css`. The grep must then
print nothing.

- [ ] **Step 8: Run them and see them pass.**

Run: `npx vitest run tests/next-home-ui.test.jsx tests/four-tab-landings.test.jsx tests/next-design-home-league.test.jsx tests/next-home-score-read.test.jsx tests/next-trend-builder-ui.test.jsx tests/next-features-ui.test.jsx`
Expected: PASS.
Run: `node --test tests/next-tokens.test.mjs tests/next-home-model.test.mjs`
Expected: PASS.
Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 9: Commit.**

```bash
git add web/src/next/home/Home.jsx web/src/next/home/home.css web/src/next/home/homeData.js web/src/next/features/HomeStreak.jsx web/src/next/features/features.css web/src/next/trends/SavedTrendsSummary.jsx tests/next-home-ui.test.jsx tests/next-design-home-league.test.jsx tests/four-tab-landings.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/home/Home.jsx web/src/next/home/home.css
git commit -m "Home (H1A, C9): the next-move card with side-by-side meters, six kit tiles, a landing skeleton, Home's own moments" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7 · This week and the Who's in layer

### Task 7: Game tiles from your own week, and Who's in as a nesting card

**Files:**
- Modify: `web/src/next/home/Home.jsx`, `web/src/next/home/home.css`
- Create: `tests/next-home-week.test.jsx`

**Interfaces:**
- Consumes: `weekGames`, `HOME_LAYERS` (Task 4); `Skeleton shape="tiles"` (Task 2); `openPlay` (play/PlayLayer.jsx);
  `STATE_ICONS` (play/WeekProgress.jsx); `Nest`, `MetaLine`, `TeamMark`, `Avatar`, `Icon`, `Pill`, `cx` (kit);
  `LINES_COPY` (shared/lines-view.mjs).
- Produces: `[data-home="week"]` with `li[data-game-tile]`; `[data-home="who-layer"]`, a `Nest` with `layer="who"` and the
  lip `{ key: 'home', label: 'Home', onOpen: () => shell.setView('home', { layer: undefined }) }`.

- [ ] **Step 1: Write the failing tests.** Create `tests/next-home-week.test.jsx`:

```jsx
// D-69 step 2 (H1A): Home's This week game tiles and the Who's in layer, rendered statically over fixture replies (the
// browser drives them in tests/cloud-browser/next-home-layers.spec.js). Fixture people and games only. Each test names
// the contract it protects.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, readText, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ home: null, shell: null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), meApi: vi.fn(), socialApi: vi.fn() }));
vi.mock('../web/src/next/home/homeData.js', () => ({ useHomeData: () => state.home }));
vi.mock('../web/src/next/bets/useTicketSummary.js', () => ({ useTicketSummary: () => ({ loading: true, error: null, active: null }) }));
vi.mock('../web/src/next/features/useFeatures.js', () => ({ useFeatures: () => ({ model: null }) }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useMomentScope: () => {}, useNewCount: () => 0, useNewMoments: () => [], usePopped: () => false }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Home } = await import('../web/src/next/home/Home.jsx');

const THU = '2026-11-06T01:15:00.000Z', SUN10 = '2026-11-08T18:00:00.000Z', SUN1 = '2026-11-08T21:05:00.000Z', SUN5 = '2026-11-09T01:20:00.000Z', MON = '2026-11-10T01:15:00.000Z';
const G = (id, kickoff) => { const [away, home] = id.split('-'); return { id, awayCode: away, homeCode: home, away, home, kickoff }; };
const GAMES = [G('SEA-DEN', THU), G('BUF-KC', SUN10), G('LAC-LV', SUN10), G('NYG-PHI', SUN1), G('HOU-JAX', SUN5), G('CHI-GB', MON)];
const BALLOT = { picks: { 'BUF-KC': -4.5, 'LAC-LV': 7.5 }, lockedAt: { 'LAC-LV': '2026-11-04T18:00:00.000Z' }, scoringReferences: { 'LAC-LV': { status: 'available', value: 3.5 } } };
const personal = (extra = {}) => ({ season: 2026, week: 9, now: '2026-11-08T17:00:00.000Z', deadline: THU, rules: { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true },
  games: GAMES, ballots: { guess_spread: BALLOT }, ...extra });
const MEMBERS = ['Casey Moore', 'Avery Stone', 'Blake Rivers', 'Drew Lane', 'Emery Fox'].map(name => ({ id: `u-${name.split(' ')[0].toLowerCase()}`, displayName: name, removed: false }));
const sent = userId => ({ userId, mode: 'guess_spread', submittedAt: '2026-11-04T18:00:00Z', satOut: false, late: null });
const community = { viewer: 'u-casey', members: MEMBERS, week: { season: 2026, week: 9, deadline: THU, games: 6 }, optOuts: [],
  due: [{ mode: 'guess_spread', submitted: false, satOut: false, filled: 2, games: 6 }, { mode: 'guess_total', submitted: false, satOut: false, filled: 0, games: 6 }],
  submissions: [sent('u-avery'), sent('u-blake'), sent('u-drew'), { userId: 'u-emery', mode: 'guess_spread', submittedAt: null, satOut: true, late: null }],
  standings: [], posts: [], picksDue: { state: 'due', week: 9, deadline: THU, opensAt: '2026-11-02T08:00:00.000Z', now: '2026-11-03T20:00:00.000Z', modes: [] } };
const ready = data => ({ status: 'ready', data, error: null });
const app = { accountId: 'u-casey', refresh: vi.fn(), league: { name: 'Community', community: true } };
function home({ personal: read, community: reply = community, status = 'ready' } = {}, view = {}) {
  state.home = { app, viewer: 'u-casey', personal: read, community: { status, data: reply, error: status === 'error' ? { status: 503 } : null, loading: status === 'loading' } };
  state.shell = { state: { tab: 'home', sheets: [], views: { home: view }, trail: [] }, go: vi.fn(), setView: vi.fn(), openSheet: vi.fn(), tab: vi.fn(), reload: vi.fn(), league: { name: 'Community' } };
}
const render = () => renderToStaticMarkup(<ShellContext.Provider value={state.shell}><div className="gx"><Home/></div></ShellContext.Provider>);
const nodes = (root, test) => [...walk(typeof root === 'string' ? parseMarkup(root) : root)].filter(n => n.tag && test(n));
const byAttr = (root, name, value) => nodes(root, n => n.attrs[name] === value);
const under = (n, test) => { for (let a = n.parent; a; a = a.parent) if (a.attrs && test(a)) return true; return false; };
/** What a sighted reader sees, word runs joined by spaces: no sr-only and no aria-hidden text. */
const shown = n => [...walk(n)].filter(x => x.text !== undefined && !under(x, a => a.attrs['aria-hidden'] === 'true' || (a.attrs.class ?? '').split(/\s+/).includes('gx-sr-only')))
  .map(x => x.text).join(' ').replace(/\s+/g, ' ').trim();
const longLines = html => nodes(html, n => n.attrs['aria-hidden'] !== 'true').map(n => n.children.filter(c => c.text !== undefined).map(c => c.text).join(' ').replace(/\s+/g, ' ').trim())
  .filter(text => text.split(' ').filter(w => w && w !== '·').length > 12);

afterEach(() => { state.home = null; state.shell = null; vi.clearAllMocks(); });

describe('This week (H1A)', () => {
  it('a heading with the game count, the next four games as tiles with your own Spread word, then All N games', () => {
    home({ personal: ready(personal()) });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const week = byAttr(html, 'data-home', 'week')[0];
    expect(shown(nodes(week, n => n.tag === 'h2')[0])).toBe('This week');
    expect(shown(week)).toContain('6 games');
    const tiles = nodes(week, n => n.tag === 'li' && n.attrs['data-game-tile']);
    expect(tiles.map(li => li.attrs['data-game-tile'])).toEqual(['BUF-KC', 'LAC-LV', 'NYG-PHI', 'HOU-JAX']);
    expect(tiles.map(li => nameFrom(nodes(li, n => n.tag === 'button')[0]))).toEqual([
      'Bills at Chiefs, Sun 10:00 AM PT, Spread draft', 'Chargers at Raiders, Sun 10:00 AM PT, Spread locked',
      'Giants at Eagles, Sun 1:05 PM PT, Spread open', 'Texans at Jaguars, Sun 5:20 PM PT, Spread open']);
    expect(shown(tiles[1])).toBe('LAC @ LV Sun 10:00 AM PT Locked');
    expect(nodes(week, n => n.tag === 'button').map(nameFrom).at(-1)).toBe('All 6 games');
    expect(nodes(html, n => /\bgx-btn--primary\b/.test(n.attrs.class ?? ''))).toHaveLength(1);
    expect(longLines(html)).toEqual([]);
  });

  it('D-31: a game tile shows your own state word only: no pick, no line and nothing of another player, in its words or its name', () => {
    home({ personal: ready(personal({ others: [{ userId: 'u-troy', name: 'Troy', picks: { 'BUF-KC': 6.5 } }] })) });
    const week = byAttr(render(), 'data-home', 'week')[0];
    const said = [...walk(week)].flatMap(n => (n.text !== undefined ? [n.text] : n.attrs?.['aria-label'] ? [n.attrs['aria-label']] : [])).join(' ');
    for (const secret of ['6.5', '4.5', '7.5', '3.5', 'u-troy', 'Troy']) expect(said).not.toContain(secret);
  });

  it('while /personal loads: four tile placeholders; no week (404): no section; a failed read: one sentence and Try again', () => {
    home({ personal: { status: 'loading', data: null, error: null } });
    let html = render();
    expect(byAttr(html, 'data-skeleton', 'tiles')).toHaveLength(1);
    expect(byAttr(html, 'data-home', 'week')).toHaveLength(0);
    home({ personal: { status: 'error', data: null, error: { status: 404 } } });
    html = render();
    expect(byAttr(html, 'data-home', 'week')).toHaveLength(0);
    expect(byAttr(html, 'data-skeleton', 'tiles')).toHaveLength(0);
    home({ personal: { status: 'error', data: null, error: { status: 503 } } });
    html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(shown(byAttr(html, 'data-home', 'week')[0])).toBe('This week This week’s games didn’t load. Try again');
  });
});

describe('Who’s in, a Home layer (#home?layer=who)', () => {
  it('a nesting card under a Home lip: every member with their word, Standings and Invite, and no next-move card', () => {
    home({ personal: ready(personal()) }, { layer: 'who' });
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    expect(byAttr(html, 'data-home', 'hero')).toHaveLength(0);
    const layer = byAttr(html, 'data-home', 'who-layer')[0];
    expect(nodes(layer, n => n.tag === 'button').map(nameFrom)).toEqual(['Back to Home', 'Standings', 'Invite']);
    expect(shown(nodes(layer, n => n.tag === 'h2')[0])).toBe('Who’s in');
    expect(shown(nodes(layer, n => (n.attrs.class ?? '').includes('gx-meta-line'))[0])).toBe('Community · Week 9 · Spread ballots 4 of 5 in');
    const people = nodes(layer, n => n.tag === 'li' && (n.attrs.class ?? '').includes('gx-h-person'));
    expect(people).toHaveLength(5);
    expect(readText(people[0])).toContain('Casey Moore · You');
    expect(readText(people[0])).toContain('Not yet');
    expect(longLines(html)).toEqual([]);
  });

  it('while the Community read loads the layer shows row placeholders; a failed read is one sentence and Try again', () => {
    home({ community: null, status: 'loading' }, { layer: 'who' });
    expect(byAttr(render(), 'data-skeleton', 'rows')).toHaveLength(1);
    home({ community: null, status: 'error' }, { layer: 'who' });
    const layer = byAttr(render(), 'data-home', 'who-layer')[0];
    expect(nodes(layer, n => n.tag === 'button').map(nameFrom)).toEqual(['Back to Home', 'Try again', 'Standings', 'Invite']);
  });
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `npx vitest run tests/next-home-week.test.jsx`
Expected: FAIL (no `[data-home="week"]`, no `[data-home="who-layer"]`).

- [ ] **Step 3: Add This week and the layer.** In `web/src/next/home/Home.jsx`:

Change the imports: add `LINES_COPY` from `'../../../../shared/lines-view.mjs'`; `plural` beside `SEP` from
`'../format.js'`; `Avatar, Icon, MetaLine, Nest, TeamMark, cx` to the kit import; `openPlay` from
`'../play/PlayLayer.jsx'`; `STATE_ICONS` from `'../play/WeekProgress.jsx'`; `weekGames` to the homeModel import.

Add above `export function Home()`:

```jsx
const WHO = Object.freeze({ in: { word: 'In', tone: 'win' }, satOut: { word: 'Sat out', tone: 'neutral' }, out: { word: 'Not yet', tone: 'pending' } });

/** One game: its marks, the matchup, kickoff and your own Spread word with its icon (never color alone). */
function GameTile({ game, onOpen }) {
  return (
    <button type="button" className="gx-nest-tile gx-tile gx-h-game" aria-label={game.ariaLabel} onClick={onOpen}>
      <span className="gx-h-game-marks" aria-hidden="true"><TeamMark code={game.away} size={24} decorative/><TeamMark code={game.home} size={24} decorative/></span>
      <span className="gx-t-strong gx-h-game-match">{game.matchup}</span>
      <span className="gx-t-meta gx-c-2">{game.when}</span>
      <span className={cx('gx-t-meta', 'gx-h-game-state', `gx-h-game-state--${game.state}`)}><Icon icon={STATE_ICONS[game.state]} size={16}/>{game.word}</span>
    </button>
  );
}

/**
 * This week (H1A): the viewer's own /personal week as up to four game tiles, each opening that game's picks card, then
 * "All N games". It draws nothing until a screen asks for the read, nothing for a week with no slate (404), placeholders
 * while it loads, and one sentence with Try again when it fails.
 */
function ThisWeek({ app, shell, personal, community }) {
  const id = useId();
  const view = useMemo(() => (personal?.data ? weekGames(personal.data, community) : null), [personal?.data, community]);
  if (!personal) return null;
  if (!personal.data) {
    if (personal.status !== 'error') return <Skeleton label={LINES_COPY.loading} shape="tiles" count={4}/>;
    if (personal.error?.status === 404) return null;
    return (
      <section className="gx-h-week" aria-labelledby={id} data-home="week">
        <h2 className="gx-t-section" id={id}>This week</h2>
        <p className="gx-t-body" role="status">{LINES_COPY.failed}</p>
        <Button variant="secondary" onClick={() => app.refresh({ only: ['personal'] })}>{SHELL_COPY.tryAgain}</Button>
      </section>
    );
  }
  if (!view) return null;
  return (
    <section className="gx-h-week" aria-labelledby={id} data-home="week">
      <div className="gx-h-week-head">
        <h2 className="gx-t-section" id={id}>This week</h2>
        <p className="gx-t-meta gx-c-2">{plural(view.count, 'game')}</p>
      </div>
      <ul className="gx-tiles" aria-label="This week’s next games">
        {view.games.map(game => <li key={game.id} data-game-tile={game.id}><GameTile game={game} onOpen={() => openPlay(shell, 'picks', game.open)}/></li>)}
      </ul>
      <Button variant="secondary" block iconEnd="chevronRight" onClick={() => shell.go('research', { section: 'games', season: null, week: null })}>{`All ${plural(view.count, 'game')}`}</Button>
    </section>
  );
}

/**
 * Who's in (`#home?layer=who`): a nesting card under a "Home" lip with every member's Spread ballot state, faces first,
 * then Standings and Invite. It has its own loading and failure, so a reload at its address never shows Home's card.
 */
function WhosInLayer({ head, app, shell, community, hero, tiles }) {
  const league = shell.league?.name ?? app.league?.name ?? 'Community';
  const lips = [{ key: 'home', label: HOME_COPY.title, onOpen: () => shell.setView('home', { layer: undefined }) }];
  const who = tiles?.whosIn ?? null;
  let body;
  if (!hero) {
    body = community.status === 'error'
      ? <><p className="gx-t-body" role="status">{SHELL_COPY.tabFailed}</p><Button variant="secondary" onClick={() => app.refresh({ only: ['community'] })}>{SHELL_COPY.tryAgain}</Button></>
      : <Skeleton label={HOME_LOADING} shape="rows" count={4}/>;
  } else if (hero.week === null || !(who?.of > 0)) {
    body = <p className="gx-t-body">{HOME_COPY.noWeek}.</p>;
  } else {
    body = (
      <>
        <MetaLine parts={[league, HOME_COPY.weekTitle(hero.week), `Spread ballots ${who.in} of ${who.of} in`]}/>
        <ul className="gx-h-people">
          {who.people.map(person => (
            <li key={person.id} className="gx-h-person">
              <Avatar id={person.id} name={person.name} size={32} you={person.you}/>
              <span className="gx-t-body gx-grow">{person.you ? `${person.name} · You` : person.name}</span>
              <Pill tone={WHO[person.status].tone}>{WHO[person.status].word}</Pill>
            </li>
          ))}
        </ul>
      </>
    );
  }
  return (
    <div className="gx-screen gx-h" data-home="who-layer">
      {head}
      <Nest label={HOME_COPY.whosIn} lips={lips} layer={HOME_LAYERS.who} title={HOME_COPY.whosIn}>
        {body}
        <div className="gx-h-who-actions">
          <Button variant="secondary" onClick={() => shell.go('league', { view: 'board' })}>Standings</Button>
          <Button variant="ghost" icon="userPlus" onClick={() => shell.openSheet('sh.switcher')}>Invite</Button>
        </div>
      </Nest>
    </div>
  );
}
```

In `Home()`:
- change `const { app, community } = useHomeData();` to `const { app, community, personal } = useHomeData();`;
- after `const head = …` add:

```jsx
  if (shell.state?.views?.home?.layer === HOME_LAYERS.who) return <WhosInLayer head={head} app={app} shell={shell} community={community} hero={hero} tiles={tiles}/>;
```

- after `<HomeTiles … />` add `<ThisWeek app={app} shell={shell} personal={personal} community={data}/>`.

Append to `web/src/next/home/home.css`, before the Who's in block:

```css
/* ----- This week: up to four game tiles, then "All N games" ----- */
.gx .gx-h-week { display: flex; flex-direction: column; gap: var(--gx-space-3); margin-top: var(--gx-space-3); min-width: 0; }
.gx .gx-h-week-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gx-space-2); }
.gx .gx-h-week-head > * { margin: 0; }
.gx .gx-tile.gx-h-game { justify-content: flex-start; }
.gx .gx-h-game-marks { display: flex; gap: var(--gx-space-1); }
.gx .gx-h-game-match { overflow-wrap: anywhere; }
/* The state word sits at the tile's foot with its icon; a state color always has its word (D-38). */
.gx .gx-h-game-state { display: inline-flex; align-items: center; gap: var(--gx-space-1); margin-top: auto; font-weight: 600; color: var(--gx-text-2); }
.gx .gx-h-game-state--locked { color: var(--gx-win); }
.gx .gx-h-game-state--draft { color: var(--gx-pending); }
```

- [ ] **Step 4: Run them and see them pass, with Task 6's.**

Run: `npx vitest run tests/next-home-week.test.jsx tests/next-home-ui.test.jsx tests/four-tab-landings.test.jsx tests/next-nest-motion.test.jsx`
Expected: PASS.
Run: `node --test tests/next-tokens.test.mjs tests/next-router.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/next/home/Home.jsx web/src/next/home/home.css tests/next-home-week.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/home/Home.jsx web/src/next/home/home.css tests/next-home-week.test.jsx
git commit -m "Home's This week as game tiles with your own Spread word, and Who's in as a Home layer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8 · Browser checks

### Task 8: The existing Home specs updated, the new Home spec, the phone and fixed-bar sweeps

Every browser spec that read Home's old cards moves to the tiles; none is deleted. A new spec drives the layer's
address, the game tiles, the rank tile's NEW-then-play and C9 with the wide fallback font.

**Files:**
- Create: `tests/cloud-browser/next-home-layers.spec.js`
- Modify: `tests/cloud-browser/next-home.spec.js`, `next-design-home-league.spec.js`, `next-features.spec.js`,
  `next-trends.spec.js`, `next-phone-layout.spec.js`, `next-scroll-navigation.spec.js`

- [ ] **Step 1: Write the new spec.** Create `tests/cloud-browser/next-home-layers.spec.js`:

```js
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { seedFinishedWeek } from '../helpers/features-week.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { rankKey } from '../../web/src/next/league/rankMoment.js';
import { momentsKey } from '../../web/src/next/moments/seen.js';

// D-69 step 2 (Home, H1A with C9) on the real app and handler with every migration on local PGlite. Checked: Who's in's
// address (tile, reload, lip, Back, Forward, the Home tab); This week's game tiles and where they lead; a rank move from
// while you were away is NEW on its tile and plays when its card opens, never on launch; C9's meter row and the phone
// rules at 320, 390 and 393 px with the wide fallback font. Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const LUKE = ACCOUNTS.luke.id;
const WIDE_FONT = '.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }';
const tabs = page => page.getByRole('navigation', { name: 'Main' });
const hero = page => page.locator('[data-home="hero"]');
const tileButton = (page, name) => page.locator(`[data-tile="${name}"]`).getByRole('button');

/** Luke's open week with a saved Spread draft on every game (whole numbers: his own picks are never secrets). */
async function draftWeek(page, baseURL) {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  const { season, week } = world.state.league;
  const workspace = await world.api('luke', 'personal');
  expect(workspace.status).toBe(200);
  const picks = Object.fromEntries(world.state.games.map((game, i) => [game.id, i % 2 ? 4 : -9]));
  expect((await world.api('luke', 'personal/ballot', { season, week, mode: 'guess_spread', picks, submit: false,
    revision: workspace.body.revision, weeklyRevision: workspace.body.weeklyRevision, requestId: randomUUID() })).status).toBe(200);
  return world;
}

async function openHome(page, storage = {}) {
  await page.addInitScript(entries => {
    localStorage.setItem('gtl.app', 'next');
    if (sessionStorage.getItem('gtl-test-seeded')) return;
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    sessionStorage.setItem('gtl-test-seeded', '1');
  }, storage);
  await page.goto('/#home');
  await signIn(page, 'luke', { navigate: false });
  await expect(hero(page)).toBeVisible();
}

/** Phone rules (spec section 3) for the screen: layoutProblems, no sideways scroll, 44 px targets, no text under 12 px. */
async function phoneRules(page, label) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no sideways scroll`).toBe(true);
  expect(await page.evaluate(layoutProblems), label).toEqual([]);
  const report = await page.locator('.gx').first().evaluate(scope => {
    const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [hidden], .gx-sr-only');
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    const small = [...scope.querySelectorAll('*')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12)
      .map(el => el.textContent.trim().slice(0, 40));
    return { targets, small };
  });
  expect(report, label).toEqual({ targets: [], small: [] });
}

test('Who’s in is a Home layer: the tile opens #home?layer=who, a reload reopens it, the lip, Back and the Home tab close it', async ({ page, baseURL }) => {
  const world = await draftWeek(page, baseURL);
  try {
    await openHome(page);
    const who = tileButton(page, 'who');
    await expect(who).toHaveAccessibleName(/^Who’s in, \d+ of \d+ Spread ballots in$/);
    await who.click();
    await expect(page).toHaveURL(/#home\?layer=who$/);
    const layer = page.locator('[data-home="who-layer"]');
    await expect(layer.getByRole('heading', { name: 'Who’s in', level: 2 })).toBeFocused();
    await expect(layer.getByRole('button', { name: 'Standings', exact: true })).toBeVisible();
    await expect(layer.getByRole('button', { name: 'Invite', exact: true })).toBeVisible();
    await expect(hero(page)).toHaveCount(0);
    await page.reload();
    await expect(layer).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/#home$/);
    await expect(hero(page)).toBeVisible();
    await page.goForward();
    await expect(layer).toBeVisible();
    await layer.getByRole('button', { name: 'Back to Home', exact: true }).click();
    await expect(hero(page)).toBeVisible();
    await who.click();
    await tabs(page).getByRole('button', { name: /^Home(, .+)?$/ }).click();
    await expect(hero(page)).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('This week: the next games as tiles with your own Spread word; a tile opens that game’s picks card; "All N games" opens Research › Games', async ({ page, baseURL }) => {
  const world = await draftWeek(page, baseURL);
  try {
    await openHome(page);
    const games = page.locator('[data-home="week"] [data-game-tile]');
    await expect(games).toHaveCount(Math.min(4, world.state.games.length));
    // The window's first tile is the first game not yet kicked off by the server's clock.
    const firstId = await games.first().getAttribute('data-game-tile');
    const first = world.state.games.find(game => game.id === firstId);
    const firstTile = page.locator(`[data-game-tile="${first.id}"]`).getByRole('button');
    // Nicknames are one word ("Seahawks", "49ers"); the word is Luke's own saved draft.
    await expect(firstTile).toHaveAccessibleName(/^\S+ at \S+, (Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}:\d{2} (AM|PM) PT, Spread draft$/);
    await firstTile.click();
    expect(new URL(page.url()).hash).toContain(`pickGame=${first.id}`);
    expect(new URL(page.url()).hash).toContain('market=spread');
    await expect(page.getByRole('heading', { name: `${first.awayCode} @ ${first.homeCode}`, exact: true })).toBeFocused();
    await page.goBack();
    await expect(hero(page)).toBeVisible();
    await page.locator('[data-home="week"]').getByRole('button', { name: `All ${world.state.games.length} games` }).click();
    await expect(page).toHaveURL(/#research\/games/);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a rank move from while you were away is NEW on its rank tile and plays when Your score opens, never on launch', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await seedFinishedWeek(world);
    expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
    // This device last saw Luke 2nd on the Spread board and has read that board before; he now leads with 20.
    await openHome(page, { [rankKey(LUKE, 'community', 'guess_spread')]: JSON.stringify({ rank: 2, from: null }),
      [momentsKey(LUKE)]: JSON.stringify(['source:rank:community:guess_spread']) });
    const spread = tileButton(page, 'spread'), flash = page.getByRole('dialog', { name: 'You’re 1st' });
    await expect(spread).toHaveAccessibleName('Spread rank, 1st, up 1, 20 points, new');
    await expect(page.locator('[data-tile="spread"] .gx-new')).toBeVisible();
    await expect(tileButton(page, 'total')).not.toHaveAccessibleName(/, new$/);
    await page.waitForTimeout(800);
    await expect(flash, 'nothing plays on the launch screen').toHaveCount(0);
    await spread.click();
    await expect(page).toHaveURL(/#play\/score/);
    await expect(flash, 'it plays when the tile’s card opens').toBeVisible();
    await flash.getByRole('button', { name: 'Nice', exact: true }).click();
    await tabs(page).getByRole('button', { name: /^Home(, .+)?$/ }).click();
    await expect(spread).toHaveAccessibleName('Spread rank, 1st, up 1, 20 points');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('C9 and the phone rules: the meters share a row on a 393 px phone and stack at 390 and 320, in both themes and the wide font', async ({ page, baseURL }) => {
  const world = await draftWeek(page, baseURL);
  try {
    await openHome(page);
    const rows = () => page.locator('[data-home="status"] > li').evaluateAll(items => new Set(items.map(li => Math.round(li.getBoundingClientRect().top))).size);
    for (const { theme, width, wide = false, columns } of [{ theme: 'dark', width: 393, columns: 1 }, { theme: 'light', width: 393, wide: true, columns: 1 },
      { theme: 'light', width: 390, columns: 2 }, { theme: 'dark', width: 320, columns: 2 }, { theme: 'light', width: 320, wide: true, columns: 2 }]) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.setViewportSize({ width, height: 844 });
      for (const address of ['#home', '#home?layer=who']) {
        await page.goto('about:blank');
        await page.goto(`/${address}`);
        await page.waitForLoadState('networkidle');
        if (wide) await page.addStyleTag({ content: WIDE_FONT });
        const label = `${theme} ${width}${wide ? ' wide font' : ''} ${address}`;
        if (address === '#home') expect(await rows(), `${label}: ${columns === 1 ? 'one row' : 'stacked'}`).toBe(columns);
        await phoneRules(page, label);
      }
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
```

- [ ] **Step 2: Run it and see it fail before the build carries Tasks 6–7, then pass.** (Tasks 6 and 7 are committed, so
the build has them; a failure here is a real defect.)

Run: `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/next-home-layers.spec.js --reporter=line`
Expected: 4 passed, skipped 0.

- [ ] **Step 3: Update the existing Home specs (keep every test).**

`tests/cloud-browser/next-home.spec.js`:
- import `heroMeters` beside `heroHeadline`;
- `READS` gains `'GET /personal'` (the shared read This week uses);
- in "Home has one primary task…": replace the `statusLines` expectation and the `[data-home="status"] li` check with

```js
    const expectedMeters = heroMeters(reply).map(m => m.words);
    expect(expectedMeters).toEqual([`Spread · ${LUKE_SPREAD_DRAFT.length} of ${world.state.games.length} picked`, `Total · 0 of ${world.state.games.length} picked`]);
    await expect(hero(page).locator('[data-home="status"] li')).toHaveText(expectedMeters);
```

  replace the D-55 round 3 block with

```js
    // D-69 step 2 (H1A): six tiles, Who's in as a tile (its layer holds Standings and Invite), the week's game tiles,
    // and one meter per market.
    for (const name of ['spread', 'total', 'who', 'awards', 'tickets', 'trends']) await expect(rankTile(page, name)).toBeVisible();
    await expect(whosIn(page)).toHaveCount(0);
    await expect(page.locator('[data-home="week"] [data-game-tile]')).toHaveCount(Math.min(4, world.state.games.length));
    await expect(hero(page).locator('[data-home="status"] .gx-meter3')).toHaveCount(expectedMeters.length);
```

  (the leak scan `noLeak` that follows now covers the game tiles too);
- in "axe in Dark and Light…": after the Home checks of each width also check the layer:

```js
        await page.goto('/#home?layer=who');
        await expect(page.locator('[data-home="who-layer"]')).toBeVisible();
        await phoneChecks(page);
        found[`who ${theme} ${width}`] = await axe(page);
        await page.goto('/#home');
        await expect(hero(page)).toBeVisible();
```

`tests/cloud-browser/next-design-home-league.spec.js`, the Home test: the header comment's item 3 becomes "Home's one
primary card, the week meter, the Pick streak and the Awards tile"; replace the award chips block with

```js
    // The Awards tile (H1A): Week 4's awards counted, Luke's own named; it opens Play › Badges and awards.
    const awards = page.locator('[data-tile="awards"]').getByRole('button');
    await expect(awards).toHaveAccessibleName(/^Awards, \d+ in Week 4, you won Spread winner$/);
    await awards.click();
    await expect(page).toHaveURL(/#play\/features/);
    await tab(page, 'Home').click();
    await expect(hero).toBeVisible();
```

`tests/cloud-browser/next-features.spec.js`:
- "without M-25": replace `await expect(page.getByRole('button', { name: /awards$/ })).toHaveCount(0);` with
  `await expect(page.locator('[data-tile="awards"]').getByRole('button')).toHaveAccessibleName('Awards, coming soon');`;
- "Home's recap card…" (rename to "Home's Awards tile and the League board's "Won Week 4" show once the job has run, and
  open the screen"): replace the `recap` lines with

```js
  const awards = page.locator('[data-tile="awards"]').getByRole('button');
  await expect(awards).toHaveAccessibleName(/^Awards, \d+ in Week 4, you won Spread winner$/);
  await expect(page.getByRole('dialog', { name: 'New results' })).toHaveCount(0);
  await awards.click();
```

- the review race: replace the two `awards` lines with
  `const awards = page.locator('[data-tile="awards"]'); await expect(awards.locator('.gx-new')).toBeVisible(); // the away results wait as NEW on the tile`.

`tests/cloud-browser/next-trends.spec.js`:
- "Trends code waits for a visit…": replace the two `[data-home="saved-trends"]` lines with
  `await expect(page.locator('[data-tile="trends"]').getByRole('button')).toHaveAccessibleName('Trends, 1 saved');`;
- "trend builder…Home indicator": replace the `row` lines through the click with

```js
  const trendsTile = page.locator('[data-tile="trends"]').getByRole('button');
  await expect(trendsTile).toHaveAccessibleName('Trends, 1 saved');
  await page.reload();
  await expect(trendsTile).toHaveAccessibleName('Trends, 1 saved');
  await trendsTile.click();
```

`tests/cloud-browser/next-phone-layout.spec.js` and `tests/cloud-browser/next-scroll-navigation.spec.js`: add
`'#home?layer=who'` right after `'#home'` in `ADDRESSES`.

- [ ] **Step 4: Run every touched spec.**

Run: `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/next-home.spec.js tests/cloud-browser/next-home-layers.spec.js tests/cloud-browser/next-design-home-league.spec.js tests/cloud-browser/next-features.spec.js tests/cloud-browser/next-trends.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js tests/cloud-browser/next-shell.spec.js tests/cloud-browser/next-play-nest.spec.js tests/cloud-browser/next-play-moments.spec.js --reporter=line`
Expected: every test passes, skipped 0.

- [ ] **Step 5: Commit.**

```bash
git add tests/cloud-browser/next-home-layers.spec.js tests/cloud-browser/next-home.spec.js tests/cloud-browser/next-design-home-league.spec.js tests/cloud-browser/next-features.spec.js tests/cloud-browser/next-trends.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js
git diff --cached --stat
git commit -m "Home browser checks: the Who's in address, game tiles, NEW then play, C9 and the phone sweeps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9 · Finish

### Task 9: Full suite, register, decision addendum, screenshots for Sean, PR

**Files:**
- Modify: `docs/COMPLETION_REGISTER.md`, `docs/DECISIONS.md`
- Temporary (never committed): `C:\Users\sbals\AppData\Local\Temp\claude\C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f\e86e4bf8-003c-4c44-b10c-b3127309473f\scratchpad\zz-step2-shots.spec.js`

- [ ] **Step 1: Run everything.**

```bash
node --test --test-concurrency=6 tests/*.test.mjs
npx vitest run
npm run typecheck && npm run build
npx playwright test --config playwright.cloud.config.js --reporter=line
```

Expected: `node --test` fails only `tests/research-intake.test.mjs` (Windows file mode, untouched code); Vitest, typecheck
and build pass; the full browser run passes with `skipped 0`. Record each count.

- [ ] **Step 2: Old-app retirement and leaks (spec tests 12 and 13).**

```bash
grep -rn "from '\.\./\.\./[A-Z][A-Za-z]*\.jsx'" web/src/next/home
grep -rn "HomeAwards\|SavedTrendsHomeRow\|FocusRows" web/src/next/home
```

Expected: both print nothing (Home imports no old `web/src/*.jsx` screen and no retired piece). The leak scan in
`next-home.spec.js` passed in Step 1 with the game tiles on screen.

- [ ] **Step 3: Screenshots for Sean (local fixtures only).** Write the scratchpad spec, copy it in for the run, delete
it after; never `git add` it.

```js
// TEMPORARY (never committed): Home after D-69 step 2 at phone size, Dark and Light, on local PGlite fixtures only
// (fictional accounts; no hosted data), for Sean's review of H1A and C9.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from '../migrations.mjs';
import { seedFinishedWeek } from '../helpers/features-week.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
const reply = (route, body) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
const OUT = process.env.SHOTS_OUT;
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(600000);
test.beforeEach(() => test.skip(!pgliteAvailable || !OUT, 'Local PGlite and SHOTS_OUT required.'));

test('step 2 Home screenshots', async ({ page, baseURL }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  try {
    await seedFinishedWeek(world);
    expect((await world.api('sean', 'league/features/run', {})).status).toBe(200);
    // Hosted reports per-game rules (M-07); the local fixture does not.
    const personal = structuredClone((await world.api('luke', 'personal')).body);
    personal.rules = { sentFinal: true, lateWindow: 'kickoff', revealAt: 'kickoff', perGameScoring: true };
    for (const name of ['personal', 'personal/read']) await page.route(`${SUPABASE}/functions/v1/gtl-api/${name}`, route => reply(route, personal));
    await page.addInitScript(() => { localStorage.setItem('gtl.app', 'next'); localStorage.setItem('gtl.motion', 'reduce'); });
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    for (const [width, themes] of [[390, ['dark', 'light']], [393, ['dark']], [320, ['light']]]) {
      await page.setViewportSize({ width, height: 844 });
      for (const theme of themes) {
        await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
        for (const [name, address] of [['home', '#home'], ['who', '#home?layer=who']]) {
          await page.goto('about:blank');
          await page.goto(`/${address}`);
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(700);
          await page.screenshot({ path: path.join(OUT, `${width}-${theme}-${name}.png`), fullPage: true });
        }
      }
    }
  } finally { await world.db.close(); }
});
```

```bash
SHOTS="C:/Users/sbals/AppData/Local/Temp/claude/C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f/e86e4bf8-003c-4c44-b10c-b3127309473f/scratchpad"
cp "$SHOTS/zz-step2-shots.spec.js" tests/cloud-browser/zz-step2-shots.spec.js
SHOTS_OUT="$SHOTS/step2-shots" npx playwright test --config playwright.cloud.config.js tests/cloud-browser/zz-step2-shots.spec.js --reporter=line
rm tests/cloud-browser/zz-step2-shots.spec.js
git status --short tests/cloud-browser
ls "$SHOTS/step2-shots"
```

Expected: 1 passed; `git status` shows nothing under `tests/cloud-browser`; eight PNGs in
`C:\Users\sbals\AppData\Local\Temp\claude\C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f\e86e4bf8-003c-4c44-b10c-b3127309473f\scratchpad\step2-shots\`
(`390-dark-home.png`, `390-dark-who.png`, `390-light-home.png`, `390-light-who.png`, `393-dark-home.png` (C9 side by
side), `393-dark-who.png`, `320-light-home.png`, `320-light-who.png`). Look at each before handing them over.

- [ ] **Step 4: The register entry.** Insert at the top of `docs/COMPLETION_REGISTER.md`, under the title, filling every
`<…>` from Steps 1–3 (evidence only exists at build time):

```markdown
## D-69 design overhaul, step 2: Home — <Month D, YYYY>

Built on `claude/overhaul-step2-home` from the
[step 2 plan](superpowers/plans/2026-11-04-design-overhaul-step2-home.md), verified at `<full commit SHA>`,
[PR #<n>](https://github.com/seanbalz/guess-the-line/pull/<n>). Not merged or released. Home is layout H1A (Sean's
recommended board, "Tiles, then This week as game tiles") with the design audit's C9, both build decisions for Sean's
review: the next-move card (countdown as its one picture, the Spread and Total meters side by side from a 360 px card),
six kit tiles (Spread rank, Total rank, Who's in, Awards, My bets, Trends), This week as up to four game tiles with your
own Spread word, and Who's in as a Home layer (`#home?layer=who`). Home plays only Whole week locked and the Pick streak,
in place; rank moves are NEW on their tile and play on Your score; badges and awards are NEW on the Awards tile. The kit
gained `Tile` (B0-1) and the `tiles` and `landing` skeletons (B0-2). Home now reads the shared `/personal`.
Evidence (local, at that commit): `node --test` <N> tests, <N> pass, 1 fails (`tests/research-intake.test.mjs`, the
Windows file-mode check on untouched code), skipped 0; Vitest <F> files, <T> tests pass; typecheck and build pass; the
full browser run <P> passed, skipped 0. Screenshots for Sean: 390 px Dark and Light, 393 px Dark (C9), 320 px Light.
Not yet: Sean's review of H1A and C9, the nine CI checks, the release and his iPhone check (spec section 10).
```

- [ ] **Step 5: The decision addendum.** In `docs/DECISIONS.md`, after D-69's "Step 1 Play build" addendum, add:

```markdown
*Addendum, November 4, 2026 — Step 2 Home: H1A and C9, build decisions for Sean's review.* Step 2 is built as the
recommended Home board on the canvas, **H1A** ("Tiles, then This week as game tiles"): the next-move card, six tiles
(Spread rank, Total rank, Who's in, Awards, My bets, Trends) and up to four This week game tiles with your own Spread
word; Who's in is a Home layer; the awards card and the trends rows become the Awards and Trends tiles. **C9** (design
audit): the countdown is the card's one picture, and the Spread and Total meters share one row once the card is 360 px
wide. Sean has chosen neither; both wait for his review of the step 2 screenshots. Layout only; no game rule changes.
Plan: [2026-11-04-design-overhaul-step2-home.md](superpowers/plans/2026-11-04-design-overhaul-step2-home.md).
```

- [ ] **Step 6: Commit, push and open the PR.**

```bash
SHOTS="C:/Users/sbals/AppData/Local/Temp/claude/C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f/e86e4bf8-003c-4c44-b10c-b3127309473f/scratchpad"
git add docs/COMPLETION_REGISTER.md docs/DECISIONS.md
git diff --cached --stat && git ls-files --eol docs/COMPLETION_REGISTER.md docs/DECISIONS.md
git commit -m "Register D-69 step 2 (Home) and record H1A and C9 for Sean's review" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin claude/overhaul-step2-home
gh pr create --base main --title "D-69 step 2: Home (H1A, C9) on the kit" --body-file "$SHOTS/step2-pr-body.md"
npm run sync:check
```

The PR body (written to `$SHOTS/step2-pr-body.md`, the scratchpad) lists the decisions above, the evidence counts, where
the screenshots are, and ends with
`🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then update the register entry's PR number and SHA in
one more commit if they changed.

**Notes — risks to watch:**
- **`/personal` on every Home visit.** On hosted, with per-game scoring, each `/personal` also runs two
  `gtl_guess_score_receipt` calls (`cloud/handler.mjs` lines 307–313). Home now makes it at launch; check the release's
  signed-in readback for its latency and a 2xx, as the gtl-api Edge CPU limit has bitten a heavy read before.
- **Week boundary.** `/personal` and `/community/read` can name different weeks for a moment around Monday's open; the
  game tiles follow `/personal`, the card follows the Community read.
- **#479.** If it lands after this branch, its Nest and meter changes merge into files this plan does not edit; re-run
  Task 8's phone sweep after rebasing.

---

## Spec coverage

| Spec item | Where |
|---|---|
| 6 step 2 "The hero … becomes the next-move card" | Tasks 4, 6 (C9 in Global Constraints) |
| 6 step 2 "Tiles: the stat tiles; Who's in as faces; awards; This week as game tiles with marks; Saved trends as one tile" | Tasks 4, 6, 7 |
| 6 step 2 "NEW tags … Opening the tile plays the moment" | Task 5 (engine tests), Task 6 (NEW render), Task 8 (browser) |
| 6 step 2 "Home plays only the whole-week-locked and Pick streak moments, in place" | Tasks 5, 6 |
| 4.1 every layer has its own address; Back closes one; focus on the heading | Tasks 3, 7, 8 |
| 4.3 entrance (the layer rises through Nest) and 4.5 loading in the final shape | Tasks 2, 6, 7 |
| 5 card anatomy (one lime button, six numbers max, toned lines with words) | Tasks 4, 6 |
| 7 failure handling (failed reads keep the last copy, one sentence and Try again) | Tasks 6, 7 |
| 8 privacy (own data only; no hidden pick or line) | Task 4 (D-31 test), Task 7 (render), Task 8 (leak scan) |
| 9 test 3 (never replays) and 4 (never on page load; NEW then play on open) | Task 5 (engine), Task 6 (scope), Task 8 (browser) |
| 9 test 7 (count-up from the last shown value) | kept: `next-design-home-league.spec.js` Home test (Task 8 keeps its `data-tile`/`data-home="points"` hooks) |
| 9 test 8 (nesting addresses: reload, shared link, Back, focus on the heading) | Task 3 (reducer and history), Task 8 (browser) |
| 9 test 9 (transform and opacity only) | `tests/next-tokens.test.mjs` in Tasks 1, 2, 6, 7 (no new keyframes) |
| 9 test 10 (fixed bars) and 11 (phone layout, 44 px, 12 px, axe, both themes) | Task 8 (`next-scroll-navigation`, `next-phone-layout`, `next-home`, `next-home-layers`) |
| 9 test 12 (gates: no hidden pick or line in a tile or NEW tag) | Task 4 (D-31 model test), Task 7 (render), Task 8 (leak scan) |
| 9 test 13 (old-app retirement) | Task 9 Step 2 |
| 10 delivery (frontend only, register evidence, iPhone check after release) | Task 9 |
