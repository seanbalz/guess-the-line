# Design overhaul step 3: Research — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rebuild Research on the step 0 kit and the step 1–2 frame, spec section 6 "Step 3 · Research" with spec 5A:
- the next-move card: this week's games and lines ("Week N · This week’s lines", "14 games", the week meter as its one
  picture, one meta line, the screen's one lime button "Open games"), or the latest week's results once every game has
  kicked off;
- four kit tiles in two columns: Games, Trends, Fantasy, Teams (no NEW: Research holds no moment kind);
- Research › Games: the board as picture rows (marks, matchup, the consensus Spread on the right with its word), and one
  game as its own layer (`#research/games?layer=game&item=SEA-DEN`) in place of the game sheet on this path, holding the
  lines, the movement chart (it reveals left to right on its first opening), your pick, trends and the matchup
  statistics, with the sheet's swipe paging between games;
- Research › Trends: its nesting cards keep their shape and gain entrance motion for lists, count-ups on the win rates
  and the chart reveal;
- Research › Teams: every team as a picture row and one team as a layer (`#research/teams?layer=team&item=SEA`) with the
  mark, record and margin chart;
- Research › Fantasy: the report card (the old `FantasyAccuracy.jsx`) rebuilt as tiles and rows inside
  `web/src/next/fantasy/` (opened by the Track 1 owner on November 4, 2026, under binding conditions).

**Architecture:**
- **Kit first.** `ui/PictureRow.jsx` (spec 5's picture row, for this step and steps 4–5), `ui/ChartReveal.jsx` (spec
  4.3), `ui/LayerPager.jsx` (the sheet's pager inside a nesting card), `ui/KeptParent.jsx` (a list stays mounted under
  its layer, as it stayed under the sheet), `useEntrance` and `.gx-stagger` (units rise in on a page list), the landing
  skeleton's meter card, and `focusLayerHeading` moved to the kit.
- **Addresses in the reducer.** Research's layers use the generic `layer` and `item` keys (step 0's convention, already
  in `router.js` `KEYS`), allowlisted per section (`RESEARCH_LAYERS` in `shell/state.js`): a game in the lines view (the
  `lines` adapter), a team in Research's own view. Opening or closing is a step; the pager's swap is not.
- **Pure first.** Every word on the landing comes from `research/researchModel.js`; every board row from
  `lines/boardRows.js`; every team row from `teams/teamModel.js` `teamRows`; the report card from
  `fantasy/fantasyReport.js`. node:test or static-markup tests pin each.
- **No new read.** The landing reads only the shared Community read and this device's saved trends. The game layer
  reads what the game sheet read; the board stays mounted under it, so Back makes no second board read. No server
  route, request type, migration or Edge Function changes.

**Tech stack:** React 19, plain CSS under `.gx` with `--gx-` tokens, `node:test` for `tests/*.test.mjs`, Vitest for
`tests/*.test.jsx` (static-markup renders), Playwright for `tests/cloud-browser/*.spec.js`.

**Spec:** `docs/superpowers/specs/2026-11-02-design-overhaul-design.md` (D-69), sections 3, 4, 5, 6 "Step 3 · Research",
7, 8, 9 and 10. Sean was not asked step 3 canvas questions; the build takes the spec's defaults, and every choice that
changes what a player sees is listed under "Decisions for Sean" and recorded in Task 10's D-69 addendum (reversible).
Lessons from step 2's reviews (`.superpowers/sdd/progress-step2.md`) are folded into the constraints and tests below.

**Status:** written November 4, 2026. Not built.

**Before you start:** work in this worktree on `claude/overhaul-step3-research`, stacked on `claude/overhaul-step2-home`
(PR #482, head `391c0e46`). The worktree must have `node_modules` (a junction to `C:\Users\sbals\betting-repo\node_modules`)
and `.local/sql-check`, or the PGlite browser specs skip silently; every browser report must say `skipped 0`.

## Global Constraints

Copied from the spec, the brief and the owner's conditions. Each task's requirements include these.

- **First card (spec 5A):** one glow card (`Card variant="hero"`, `.gx-r-hero`), labelled by its eyebrow, holding: the
  eyebrow, the title (`h2.gx-t-title`), the kit `Meter` (one segment per game, filled = kicked off), one meta line and
  the screen's one lime button. Words (exact): week open `Week N · This week’s lines` / `N games` / `K of N kicked off` /
  `Open games`; every game kicked off `Week N · Results` / `Week N results` / `All N games kicked off` / `See results`;
  no week `Research` / `No week is open yet` / `Trends, teams and Fantasy are still here.` / `Open trends`.
- **Tiles:** the kit `Tile` in `.gx-tiles`, in this order with these ids: Games `gx-r-tile-games`, Trends
  `gx-r-tile-trends`, Fantasy `gx-r-tile-fantasy`, Teams `gx-r-tile-teams`. Glyphs: `DESTINATION_ICONS.games` (`chart`),
  `.trends` (`trendingUp`), `.fantasy` (`people`), `.teams` (`shieldCheck`). No NEW on any tile.
- **Picture rows (spec 5):** `ui/PictureRow.jsx`: picture first (hidden from assistive technology), the name and at most
  one meta line, one number on the right over its status word; a toned word always says its state (D-38). Row ids: a
  game `gx-l-row-<gameId>`, a team `gx-r-team-<CODE>`. Board row words: `Locked`, `Current`, `Latest`, `Unverified`,
  `No line`, `Kicked off`, `Final`. Team row words: `Won last` (good), `Lost last`, `Tied last` (plain: a loss is quiet).
- **Addresses:** `#research/games?layer=game&item=<gameId>` (item `^[\w-]{1,100}$`), `#research/teams?layer=team&item=<CODE>`
  (item a key of `TEAM_NAMES`). Any other `layer`/`item` on a Research section is dropped, so the address draws the list.
  Opening or closing a layer is a step; Back and the lip close one layer; on a shared link or a reload (nothing under it)
  Back closes the layer to its list, never to the landing; a fresh destination (a tile, Home's "All N games", a tab) never
  carries a layer; the pager's swap is not a step (the entry is rewritten). Layers never cross tabs.
- **Focus:** a layer that mounts after a navigation focuses its own `[data-route-focus]` heading (`useLayerFocus`); a
  direct load never moves focus; Back returns focus to the opener by its stable id; paging keeps focus on the button.
- **Server time only:** the landing's "kicked off" counts read `useServerNow(serverNow, at, { until })`
  (`home/useServerNow.js`), from the Community read's clock and the read's landing time; never the device clock.
- **Motion (D-58):** durations `--gx-dur-*`, easings `--gx-ease-*`; keyframes animate only transform and opacity; reduced
  motion (`prefers-reduced-motion` or `data-motion="reduce"`) stops everything. A new layer rises in through `Nest`; units
  rise in 30 ms apart for the first six (now also a nesting card's `.gx-nest-list` and a page's `.gx-stagger` list); a
  list kept under a closed layer settles back (200 ms). A chart reveals left to right once, `--gx-dur-big` (600 ms) with
  `--gx-ease-enter`, only after the member's own tap and never on a load. Count-ups only from the element that draws the
  number, only while drawn with data (`ui/CountUp.jsx`).
- **Loading in the final shape:** the landing's skeleton is `shape="landing" hero="meter" count={4}`; the board's is
  `shape="rows" count={4}` on `.gx-l-skel`; both measured against the real card and row at 390 px (Task 9), within 8 px.
- **Phone rules:** no sideways scroll at 320 and 390 px in Light and Dark and with the wide fallback font
  (`.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }`; CI runs Linux); targets at least 44 px; no
  text under 12 px, nothing clipped; axe clean; no transform, filter or will-change on any ancestor of the tab bar, dock
  or top bar; every stylesheet passes `tests/next-tokens.test.mjs`. Lucide icons through `ui/Icon.jsx`; teams as D-62
  marks. No surface sentence over twelve words; at most six numbers per card; one lime button per screen.
- **Gates and privacy (D-31, D-36, spec 8):** the landing shows no line, pick or market; the board shows a lock (never
  "—") on a closed market; no new value moves into the public bundle.
- **Fantasy (the Track 1 owner's binding conditions, November 4, 2026):**
  - D-76 copy exactly: the rankings ⓘ says "from recent usage and statistics"; the report card says "GTL’s weekly
    estimates"; the word "pace" appears nowhere on screen (no app string says it; see Decisions for Sean, item 15).
  - The method's name and version come from each snapshot's own data (`snapshot.method.name`, `.version`), never
    hard-coded (published weeks keep pace 1.1; the first usage 2.0 snapshot arrives at the next refresh).
  - The Fantasy chunk stays lazy (`e38039d2`); every new-app file parses (`13869fc7`); the NBA status region stays
    mounted; there is one Fantasy title, "Fantasy Football" (A19, `f70f2362`).
  - `web/src/FantasyAccuracy.jsx` stays for the old app; the new app stops importing it (spec test 13).
  - Off limits: `shared/fantasy*`, `scripts/fantasy.mjs`, `web/src/FantasyFootball.jsx`; also not opened by the owner and
    not edited here: `web/src/fantasyData.js`, `web/src/fantasyLoader.js`, `web/src/fantasyContext.js`.
- **Frontend only:** no migration, Edge Function, server, workflow or data change; no deploy.
- **Files:** LF line endings. Before every commit run `git diff --cached --stat` and `git ls-files --eol <files>` (every
  line `i/lf w/lf`); a fully rewritten file means CRLF crept in: `sed -i 's/\r$//' <file>`. Commit only named files.
- **Commits:** every message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests keep their contracts (R6):** a changed test keeps or replaces its contract; Task 9 lists each replacement.

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

The spec's defaults, taken without a canvas round; each changes something a player sees, so each is listed, and Task 10
records them as the D-69 addendum "Build decisions for Sean's review (step 3 Research)". All are layout or navigation;
no game rule changes.

1. **First card:** the week meter is its one picture (one segment per game, filled = kicked off) with "K of N kicked
   off". The brief's example picture, how many games have verified lines, needs the board's line read, which the
   landing must not add; the meter reads the Community read the shell already makes.
2. **Games tile** shows the next game: its two marks, its kickoff time as the number ("1:25 PM") and "Sun · next game";
   "N · all kicked off" once none is left; "— · No week open" with no week. (A count of games would repeat the card.)
3. **Trends tile** is Home's (`trendsTile`): saved trends, or "0 · Charts for every game".
4. **Fantasy tile** shows "—" with "Player rankings": its number would need the Fantasy read, and the owner's condition
   keeps that chunk and read lazy until Fantasy opens. **Teams tile** shows "32" with "Records and margins".
5. **"Research recommendations" leaves the Research landing** (the spec's four tiles). It stays on Bets and in every game
   layer ("Bet assessments and statistics").
6. **The landing drops the "Week N" line under its title** (the eyebrow says it).
7. **The board's title "Lines" becomes "Games"**, so the tile, the title and the lip say one word.
8. **Board rows:** two 24 px marks, "SEA @ DEN", the records (or a final's score, "SEA 24–DEN 17") as the one meta line,
   the consensus Spread on the right over its word. The Total, your saved guesses, the trend line, the weather word and
   the late pill leave the row's face; the row's spoken name keeps every one of them, and the game layer shows them.
9. **The game layer replaces the game sheet on Research's paths** (board rows and Trends' "Game details"). The sheet
   stays only for the League feed's kickoff rows (`feed/PostCard.jsx`). All trends, Your pick, Matchup research and
   League bets stay sheets over the layer (short tasks); turning them into layers is a follow-up.
10. **Paging swaps the game in place:** no Back step, the address follows, focus stays on Previous/Next; Back lands on the
    board, as closing the sheet did.
11. **Chart reveal:** the movement chart reveals on the first opening of its "Line movement" disclosure in each game
    visit; Trends' opened trend chart and a team's margin chart reveal when their layer opens by a tap; never on a direct
    load. The spec names scaleX on a clip group; this build slides the clip group and its content in opposite directions
    (transform only), because a scaled clip squashes the chart unless its content is counter-scaled by 1/s (unbounded at
    the start), and WebKit's support for animating an SVG clipPath is uneven on the iPhone, the target device.
12. **Teams:** 32 rows by full name (mark, name, "Next @ DEN", record over "Won last"/"Lost last"/"Tied last"). From a
    game, a team opens Research › Teams › that team (its lip goes to Teams; Back returns to the game). Play's pick cards
    keep the team sheet (`teams/TeamMatchup.jsx` in `play/PerGamePlay.jsx`).
13. **Trends count-ups** on the win rates (tiles, the hero, the opened trend), one remembered value per trend on the
    device. Players' numbers stay static: they are other players' guesses, and spec 8 lets the device remember only your
    own numbers.
14. **Entrance:** units now rise in for lists inside nesting cards (Trends' lists, Fantasy's ranked players) and for
    Research's tiles and rows, the first six only; a list kept under a closed layer settles back.
15. **Fantasy report card:** four tiles (Off by, Season average, Within 5 points, Players graded), one row per position
    ("Beat average"/"Behind average"), the biggest misses behind one disclosure, fine print behind ⓘ; the rankings card's
    report tile shows the miss in points. The method's name and version join the rankings ⓘ from the snapshot. **For the
    Track 1 owner:** the ⓘ prints the snapshot's own method text verbatim, which says "pace" for published pace weeks
    ("GTL statistical pace 1.1") and in the usage 2.0 description ("the earlier pace method", `shared/fantasy-build.mjs`,
    off limits here). This build reads "pace appears nowhere on screen" as: no app string says it, and nothing drawn
    before an ⓘ opens says it. If the owner means the ⓘ too, the snapshot text must change in Track 1.

## File structure

| File | Change |
|---|---|
| `web/src/next/ui/PictureRow.jsx`, `ui/pictureRow.css` | Create: spec 5's picture row |
| `web/src/next/ui/ChartReveal.jsx`, `ui/chartReveal.css` | Create: spec 4.3's chart reveal |
| `web/src/next/ui/LayerPager.jsx`, `ui/pager.css` | Create: the sheet's pager inside a layer |
| `web/src/next/ui/KeptParent.jsx`, `ui/focusLayer.js` | Create: a list kept under its layer; layer focus on mount |
| `web/src/next/ui/Nest.jsx`, `ui/nest.css`, `ui/press.css` | `useEntrance`; list stagger, `.gx-stagger`, `.gx-kept`; row press |
| `web/src/next/ui/Skeleton.jsx`, `ui/skeleton.css` | `hero="meter"` on the landing shape |
| `web/src/next/ui/destinations.js`, `ui/index.js` | `games`, `teams` glyphs; new exports |
| `web/src/next/home/focusRules.js` | Re-export `focusLayerHeading` from the kit |
| `web/src/next/shell/state.js`, `shell/router.js` | `RESEARCH_LAYERS`, steps, Back, allowlist, `teams` section |
| `web/src/next/research/researchNav.js` | Create: names, ids and opening helpers |
| `web/src/next/lines/boardRows.js`, `lines/boardContext.js` | Create: row model; the board order kept in memory |
| `web/src/next/lines/LinesBoard.jsx`, `lines/lines.css` | Picture rows, title "Games"; board-only card CSS removed |
| `web/src/next/lines/GameLayer.jsx`, `lines/GamesScreen.jsx` | Create: one game as a layer; board kept under it |
| `web/src/next/lines/GameDetails.jsx`, `teams/TeamMatchup.jsx` | `onTeam` override |
| `web/src/next/lines/MarketDetails.jsx` | Movement chart reveal on the first opening |
| `web/src/next/trends/TrendLayer.jsx`, `WeekNest.jsx`, `TeamsNest.jsx`, `TrendsScreen.jsx` | `TrendRate` count-ups, chart reveal, Game details → layer |
| `web/src/next/teams/TeamsScreen.jsx`, `TeamLayer.jsx`, `TeamViewSlot.jsx` | Create: the list, one team, the lazy view slot |
| `web/src/next/teams/TeamSheet.jsx`, `TeamView.jsx`, `MarginChart.jsx`, `teamModel.js` | Slot reuse, reveal, `teamRows` |
| `web/src/next/research/researchModel.js`, `ResearchLanding.jsx`, `landing.css` | Create: the landing |
| `web/src/next/research/Research.jsx`, `shell/registry.jsx` (one comment) | Section routing; `sh.game` caller note |
| `web/src/next/fantasy/fantasyReport.js`, `FantasyReport.jsx` | Create: the report card as tiles and rows |
| `web/src/next/fantasy/FantasyNest.jsx`, `fantasy/fantasy.css` | Report layer, method line, report tile; old CSS removed |
| Tests: new `next-kit-research.test.jsx`, `next-board-rows.test.mjs`, `next-game-layer.test.jsx`, `next-research-landing.test.mjs`, `next-research-landing-ui.test.jsx`, `next-trends-motion.test.jsx`, `next-fantasy-report.test.jsx`, `helpers/fantasy-review-fixture.mjs`, `cloud-browser/next-research-layers.spec.js` | New contracts |
| Tests updated: `next-router.test.mjs`, `next-lines-ui.test.jsx`, `next-market-details-ui.test.jsx`, `next-teams.test.jsx`, `next-destination-icons.test.jsx`, `next-app-view.test.mjs`, cloud-browser `next-lines`, `next-gestures`, `next-game-notes`, `next-research`, `research-style-recovery`, `four-tab-redesign`, `next-trends`, `next-shell`, `next-phone-layout`, `next-scroll-navigation`, `fantasy` | Layout and navigation changes |
| `docs/COMPLETION_REGISTER.md`, `docs/DECISIONS.md` | Step 3 entry, D-69 addendum |

## Task map

| Task | What it builds |
|---|---|
| 1 | Sync; kit: PictureRow, ChartReveal, LayerPager, KeptParent, entrance lists, meter skeleton, layer focus, glyphs |
| 2 | Research's layer addresses in the reducer and router, and the nav helpers |
| 3 | Research › Games as picture rows |
| 4 | One game as a layer: the details, the pager, the movement chart reveal, Trends' Game details |
| 5 | Research › Teams: the list and one team as a layer, with the margin chart reveal |
| 6 | The landing: the next-move card and four tiles |
| 7 | Trends: count-ups on the win rates, the chart reveal |
| 8 | Fantasy: the report card as tiles and rows, under the owner's conditions |
| 9 | Browser specs: the new Research spec, every touched spec updated, phone and fixed-bar sweeps |
| 10 | Finish: full suite, register, D-69 addendum, screenshots for Sean, PR |

Shared names, used exactly as written: `PictureRow`, `PICTURE_ROW_TONES`, `.gx-prows`, `ChartReveal`, `LayerPager`,
`KeptParent`, `useEntrance`, `.gx-stagger`, `focusLayerHeading`, `useLayerFocus`, `SKELETON_HEROES`,
`DESTINATION_ICONS.games`, `DESTINATION_ICONS.teams`, `RESEARCH_LAYERS`, `researchLayerOf(section, view)`; from
`research/researchNav.js`: `RESEARCH_NAMES`, `gameRowId`, `teamRowId`, `tileId`, `layerTitle`, `openSection`, `gameView`,
`teamView`, `openGame`, `pageGame`, `closeGame`, `openTeam`, `closeTeam`; `boardRow`, `ROW_WORDS`, `withRecords`,
`rememberBoard`, `rememberedBoard`, `GameLayer`, `GamesScreen`, `teamRows`, `TeamsScreen`, `TeamLayer`, `TeamViewSlot`;
from `research/researchModel.js`: `RESEARCH_TILES`, `RESEARCH_TILE_ICONS`, `LANDING_COPY`, `weekGamesOf`,
`researchClock`, `lastKickoffOf`, `researchHero`, `researchTiles`; `ResearchLanding`; `TrendRate`, `rateFigure`;
`reportModel`, `reportTile`, `REPORT_COPY`, `FantasyReport`, `methodBody`. Test hooks: `[data-landing="research"]`,
`[data-research="hero"]`, `[data-research="hero-line"]`, `[data-research="tiles"] li[data-tile]`, `.gx-prow[data-game]`,
`.gx-prow[data-team]`, `[data-research="game"]`, `[data-research="teams"]`, `[data-research="team"]`, `[data-pager]`,
`.gx-pager-body`, `.gx-reveal[data-reveal]`, `[data-report]`, `[data-report-position]`.

---

## Task 1 · The kit for Research

### Task 1: Sync, then the kit pieces Research and the next steps share

**Files:**
- Create: `web/src/next/ui/PictureRow.jsx`, `ui/pictureRow.css`, `ui/ChartReveal.jsx`, `ui/chartReveal.css`,
  `ui/LayerPager.jsx`, `ui/pager.css`, `ui/KeptParent.jsx`, `ui/focusLayer.js`, `tests/next-kit-research.test.jsx`
- Modify: `web/src/next/ui/Nest.jsx`, `ui/nest.css`, `ui/press.css`, `ui/Skeleton.jsx`, `ui/skeleton.css`,
  `ui/destinations.js`, `ui/index.js`, `web/src/next/home/focusRules.js`

**Interfaces:**
- Consumes: `cx`, `Icon`, `IconButton`, `pagerPlace` (`ui/gesture.js`), `usePagerSwipe` (`ui/useSheetGestures.js`),
  `motionReduced` (`ui/motion.js`), `hasNavigated`, `tabFading` (`moments/launch.js`), `nestEnter` (`ui/Nest.jsx`).
- Produces (all exported from `ui/index.js`): `PictureRow({ id, picture, title, meta, value, word, tone, onClick,
  ariaLabel, className, ...data })`, `PICTURE_ROW_TONES = ['plain', 'good', 'warn']`; `ChartReveal({ play, className,
  children })`; `LayerPager({ title, pager, page, children })` with `pager = { index, count, unit, prevLabel, nextLabel,
  onMove(step) }`; `KeptParent({ layer, children })`; `useEntrance()` → `'in' | undefined`; `focusLayerHeading(root,
  navigated)` → boolean, `useLayerFocus(ref)`; `Skeleton` prop `hero` in `SKELETON_HEROES = ['countdown', 'meter']`;
  `DESTINATION_ICONS.games = 'chart'`, `.teams = 'shieldCheck'`. Classes `gx-prows`, `gx-prow`, `gx-prow--nopic`,
  `gx-prow--static`, `gx-prow-pic`, `gx-prow-main`, `gx-prow-title`, `gx-prow-meta`, `gx-prow-end`, `gx-prow-value`,
  `gx-prow-word--plain|good|warn`, `gx-reveal`, `gx-reveal-in`, `gx-pager-head`, `gx-pager-body`, `gx-kept`,
  `gx-stagger`, `gx-skel-hero--meter`, `gx-skel-meter`.

- [ ] **Step 1: Sync with step 2 and `main`.**

```bash
git fetch origin
git merge origin/claude/overhaul-step2-home
git merge origin/main
git log --oneline -5
```

If #482 merged and its branch is gone, merge `origin/main` only. Re-read `ui/Nest.jsx`, `ui/nest.css`, `ui/Tile.jsx` and
`ui/Skeleton.jsx` if the merge touched them.

- [ ] **Step 2: Write the failing test.** Create `tests/next-kit-research.test.jsx`:

```jsx
// D-69 step 3: the kit pieces Research needs, each shared with the steps after it. PictureRow is spec 5's picture row
// (marks or a face first, the name, one number on the right with its word); ChartReveal is section 4.3's left-to-right
// chart reveal (transform only, never on a page load); LayerPager is the game sheet's paging moved into a nesting card
// (spec 4.1); KeptParent keeps a list mounted under its layer; the landing skeleton gains the meter card's shape;
// focusLayerHeading moves to the kit. Static markup and the stylesheets only; the browser checks are
// tests/cloud-browser/next-research-layers.spec.js.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import * as ui from '../web/src/next/ui/index.js';
import * as focusRules from '../web/src/next/home/focusRules.js';

const render = node => renderToStaticMarkup(<div className="gx">{node}</div>);
const nodes = html => [...walk(parseMarkup(html))];
const byClass = (html, cls) => nodes(html).filter(n => (n.attrs?.class ?? '').split(/\s+/).includes(cls));
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const css = file => readFileSync(new URL(`../web/src/next/${file}`, import.meta.url), 'utf8');

describe('PictureRow (spec 5: lists that must stay lists)', () => {
  const marks = <><ui.TeamMark code="SEA" size={24} decorative/><ui.TeamMark code="DEN" size={24} decorative/></>;
  it('one button: the picture hidden (the name says it), the name and one meta line, one number over its word', () => {
    const html = render(<ui.PictureRow id="gx-l-row-SEA-DEN" data-game="SEA-DEN" picture={marks} title="SEA @ DEN" meta="3–2 · 2–2–1"
      value="DEN −1.5" word="Current" ariaLabel="Seahawks at Broncos. Spread DEN −1.5. Current line. Open game details" onClick={() => {}}/>);
    expect(markupProblems(html)).toEqual([]);
    const [row] = nodes(html).filter(n => n.tag === 'button');
    expect([row.attrs.id, row.attrs['data-game'], row.attrs.type]).toEqual(['gx-l-row-SEA-DEN', 'SEA-DEN', 'button']);
    expect(nameFrom(row)).toBe('Seahawks at Broncos. Spread DEN −1.5. Current line. Open game details');
    expect(byClass(html, 'gx-prow-pic')[0].attrs['aria-hidden']).toBe('true');
    expect(byClass(html, 'gx-n-s').map(textOf)).toEqual(['DEN −1.5']);
    expect(byClass(html, 'gx-prow-word').map(textOf)).toEqual(['Current']);
    expect(byClass(html, 'gx-prow-word--plain')).toHaveLength(1);
  });
  it('a toned word keeps its word; an unknown tone is plain; with nothing to open it is a plain row, never a button', () => {
    expect(render(<ui.PictureRow title="Seattle Seahawks" value="6–2" word="Won last" tone="good" ariaLabel="x" onClick={() => {}}/>)).toContain('gx-prow-word--good');
    expect(render(<ui.PictureRow title="QB" value="4.2" word="Beat average" tone="loud" ariaLabel="x" onClick={() => {}}/>)).toContain('gx-prow-word--plain');
    const html = render(<ui.PictureRow title="QB" meta="31 graded" value="4.2" word="Beat average"/>);
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html).filter(n => n.tag === 'button')).toHaveLength(0);
    expect(byClass(html, 'gx-prow--static')).toHaveLength(1);
    expect(byClass(html, 'gx-prow--nopic')).toHaveLength(1);
    expect(ui.PICTURE_ROW_TONES).toEqual(['plain', 'good', 'warn']);
  });
  it('a pressed row dips and dims like every kit control; the list is a plain list on tokens', () => {
    expect(css('ui/press.css').match(/\.gx(\[data-motion="reduce"\])? button\.gx-prow\b/g)).toHaveLength(5);
    expect(css('ui/pictureRow.css')).toMatch(/\.gx \.gx-prows \{[^}]*list-style: none/);
  });
});

describe('ChartReveal (spec 4.3: charts reveal left to right)', () => {
  const chart = <svg viewBox="0 0 320 140" role="img" aria-label="Spread movement"><path d="M0 0L320 140"/></svg>;
  it('plays only when asked (a tap opened it), and the chart is drawn whole either way', () => {
    const played = render(<ui.ChartReveal play>{chart}</ui.ChartReveal>);
    expect(markupProblems(played)).toEqual([]);
    expect(byClass(played, 'gx-reveal')[0].attrs['data-reveal']).toBe('in');
    expect(byClass(played, 'gx-reveal-in')).toHaveLength(1);
    const still = render(<ui.ChartReveal>{chart}</ui.ChartReveal>);
    expect(byClass(still, 'gx-reveal')[0].attrs['data-reveal']).toBeUndefined();
    expect(still).toContain('aria-label="Spread movement"');
  });
  it('transform only, on the big duration with the enter easing, only without reduced motion, clipped only while it plays', () => {
    const sheet = css('ui/chartReveal.css');
    expect(sheet).toMatch(/@keyframes gx-reveal-clip \{ from \{ transform: translateX\(-100%\); \} to \{ transform: none; \} \}/);
    expect(sheet).toMatch(/@keyframes gx-reveal-hold \{ from \{ transform: translateX\(100%\); \} to \{ transform: none; \} \}/);
    expect(sheet).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\n {2}\.gx \.gx-reveal\[data-reveal="in"\] \{ overflow: hidden; animation: gx-reveal-clip var\(--gx-dur-big\) var\(--gx-ease-enter\) both; \}/);
    expect(sheet).not.toMatch(/\.gx \.gx-reveal \{[^}]*overflow/);
  });
});

describe('LayerPager (spec 4.1: the game sheet’s paging, inside the game layer)', () => {
  const pager = { index: 1, count: 3, unit: 'game', prevLabel: 'Previous game, SEA @ DEN', nextLabel: 'Next game, NO @ NYG', onMove: () => {} };
  it('says its place with the title, names both neighbours on 44 px buttons, and its body takes the sideways swipe', () => {
    const html = render(<ui.LayerPager title="HOU @ JAX" pager={pager} page="HOU-JAX"><p className="gx-t-body">Body</p></ui.LayerPager>);
    expect(markupProblems(html)).toEqual([]);
    const [place] = nodes(html).filter(n => n.attrs?.['aria-live'] === 'polite');
    expect(textOf(place)).toBe('HOU @ JAX, game 2 of 3');
    expect(byClass(html, 'gx-sheet-page').map(n => [n.attrs['aria-label'], n.attrs['aria-disabled']]))
      .toEqual([['Previous game, SEA @ DEN', undefined], ['Next game, NO @ NYG', undefined]]);
    expect(byClass(html, 'gx-pager-body')[0].attrs.class.split(' ')).toContain('gx-sheet-body--pager');
    expect(nodes(html).filter(n => n.attrs?.['data-pager'] !== undefined)).toHaveLength(1);
  });
  it('at an end the button stays, named and focusable, drawn unavailable; with no neighbours there is no pager', () => {
    const first = render(<ui.LayerPager title="SEA @ DEN" pager={{ ...pager, index: 0, prevLabel: 'Previous game' }} page="SEA-DEN">x</ui.LayerPager>);
    expect(byClass(first, 'gx-sheet-page').map(n => n.attrs['aria-disabled'])).toEqual(['true', undefined]);
    const none = render(<ui.LayerPager title="SEA @ DEN" pager={null} page="SEA-DEN"><span>x</span></ui.LayerPager>);
    expect(byClass(none, 'gx-sheet-page')).toHaveLength(0);
    expect(byClass(none, 'gx-pager-body')[0].attrs.class).toBe('gx-pager-body');
  });
});

describe('KeptParent (a list stays mounted under its layer, as it stayed under the sheet)', () => {
  const list = <ol className="gx-prows" aria-label="Games"><li>row</li></ol>;
  it('with no layer the list shows; with one, the layer comes first and the list stays, hidden', () => {
    expect(byClass(render(<ui.KeptParent>{list}</ui.KeptParent>), 'gx-kept')[0].attrs.hidden).toBeUndefined();
    const layered = render(<ui.KeptParent layer={<section className="gx-nest" aria-label="SEA @ DEN">layer</section>}>{list}</ui.KeptParent>);
    expect(nodes(layered).filter(n => ['gx-nest', 'gx-kept'].includes(n.attrs?.class)).map(n => n.attrs.class)).toEqual(['gx-nest', 'gx-kept']);
    expect(byClass(layered, 'gx-kept')[0].attrs.hidden).toBe('');
  });
});

describe('the landing skeleton in the meter card’s shape (Research’s first card, as Play’s)', () => {
  it('a meter bar where Home’s countdown goes, the meter card’s own height, then the tiles', () => {
    const html = render(<ui.Skeleton label="Loading this week’s games…" shape="landing" hero="meter" count={4}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(byClass(html, 'gx-skel-hero--meter')).toHaveLength(1);
    expect(byClass(html, 'gx-skel-meter')).toHaveLength(1);
    expect(byClass(html, 'gx-skel-countdown')).toHaveLength(0);
    expect(byClass(html, 'gx-skel-tile')).toHaveLength(4);
    expect(byClass(render(<ui.Skeleton label="Loading Home…" shape="landing" count={6}/>), 'gx-skel-countdown')).toHaveLength(1);
    expect(ui.SKELETON_HEROES).toEqual(['countdown', 'meter']);
    expect(css('ui/skeleton.css')).toMatch(/\.gx-skel-hero--meter \{ min-height: \d+px; \}/);
  });
});

describe('kit moves and names', () => {
  it('focusLayerHeading is the kit’s; Home keeps importing it from its rules; only a navigation moves focus', () => {
    expect(focusRules.focusLayerHeading).toBe(ui.focusLayerHeading);
    const focused = [], heading = { focus: () => focused.push('heading') };
    const root = { querySelector: selector => (selector === '[data-route-focus]' ? heading : null) };
    expect(ui.focusLayerHeading(root, false)).toBe(false);
    expect(ui.focusLayerHeading(root, true)).toBe(true);
    expect(focused).toEqual(['heading']);
    expect(ui.useLayerFocus).toBeTypeOf('function');
  });
  it('Games and Teams have their own glyphs from the kit’s Lucide set', () => {
    expect([ui.DESTINATION_ICONS.games, ui.DESTINATION_ICONS.teams]).toEqual(['chart', 'shieldCheck']);
    for (const name of ['games', 'teams']) expect(ui.icons[ui.DESTINATION_ICONS[name]]).toBeTruthy();
  });
  it('units rise in for a nesting card’s lists and a page’s .gx-stagger list after a navigation; a kept list settles back', () => {
    const sheet = css('ui/nest.css');
    expect(sheet).toMatch(/\.gx \.gx-nest-card\[data-enter="in"\] \.gx-nest-list > :nth-child\(-n\+6\)/);
    expect(sheet).toMatch(/\.gx \.gx-stagger\[data-enter="in"\] > :nth-child\(-n\+6\)/);
    expect(sheet).toMatch(/\.gx \.gx-stagger \{ --gx-nest-stagger: 30ms; \}/);
    expect(sheet).toMatch(/\.gx \.gx-kept\[data-enter="back"\] \{ animation: gx-nest-back var\(--gx-dur-exit\) var\(--gx-ease-standard\); \}/);
    expect(ui.useEntrance).toBeTypeOf('function');
  });
});
```

- [ ] **Step 3: Run it and see it fail.**

Run: `npx vitest run tests/next-kit-research.test.jsx`
Expected: FAIL (`ui.PictureRow` is undefined; then each describe's missing piece).

- [ ] **Step 4: The picture row.** Create `web/src/next/ui/PictureRow.jsx`:

```jsx
// D-69 step 3 (spec 5, "Lists that must stay lists ... use picture rows"): picture first (marks, a face), the name over
// at most one meta line, one number on the right over its word (the word carries the state, D-38). One button that
// opens the item's layer; with nothing to open, a plain row. Research uses it; Bets' rows will (step 4).
import { cx } from './cx.js';
import './pictureRow.css';
import './press.css';

export const PICTURE_ROW_TONES = Object.freeze(['plain', 'good', 'warn']);

/**
 * `<PictureRow id picture title meta value word tone onClick ariaLabel data-game="SEA-DEN"/>`. `picture` is hidden from
 * assistive technology: `ariaLabel`, the row's whole spoken name, says it. A stable `id` is the shell's handle for focus
 * return on Back. Other props (`data-*`) reach the row.
 */
export function PictureRow({ id, picture, title, meta, value, word, tone = 'plain', onClick, ariaLabel, className, ...rest }) {
  const t = PICTURE_ROW_TONES.includes(tone) ? tone : 'plain';
  const classes = cx('gx-prow', !picture && 'gx-prow--nopic', !onClick && 'gx-prow--static', className);
  const body = <>
    {picture ? <span className="gx-prow-pic" aria-hidden="true">{picture}</span> : null}
    <span className="gx-prow-main">
      <span className="gx-t-strong gx-prow-title">{title}</span>
      {meta ? <span className="gx-t-meta gx-prow-meta">{meta}</span> : null}
    </span>
    <span className="gx-prow-end">
      <span className="gx-n-s gx-prow-value">{value}</span>
      {word ? <span className={cx('gx-t-label', 'gx-prow-word', `gx-prow-word--${t}`)}>{word}</span> : null}
    </span>
  </>;
  if (!onClick) return <div id={id} className={classes} {...rest}>{body}</div>;
  return <button id={id} type="button" className={classes} aria-label={ariaLabel} onClick={onClick} {...rest}>{body}</button>;
}
```

Create `web/src/next/ui/pictureRow.css`:

```css
/* D-69 step 3 (spec 5): a picture row (ui/PictureRow.jsx). Its picture, its name over one meta line, then one number over
   its word. Inside a nesting card a row takes the card's tile surface, as .gx-nest-tile does. Tokens only. */
.gx .gx-prows { display: flex; flex-direction: column; gap: var(--gx-space-2); margin: 0; padding: 0; list-style: none; }
.gx .gx-prows > li { display: flex; min-width: 0; }
.gx .gx-prow {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: var(--gx-space-3);
  width: 100%; min-width: 0; min-height: 64px; padding: var(--gx-space-3) var(--gx-space-4);
  border: 1px solid var(--gx-border); border-radius: var(--gx-radius-md); background: var(--gx-surface-1);
  color: var(--gx-text-1); font: inherit; text-align: left;
}
.gx button.gx-prow { cursor: pointer; }
.gx .gx-prow--nopic { grid-template-columns: minmax(0, 1fr) auto; }
.gx .gx-nest-card .gx-prow { background: var(--gx-surface-3); }
.gx .gx-nest[data-depth="0"] .gx-prow { background: var(--gx-surface-2); }
.gx .gx-prow-pic { display: flex; align-items: center; gap: var(--gx-space-1); }
.gx .gx-prow-main { display: flex; flex-direction: column; gap: var(--gx-space-1); min-width: 0; }
.gx .gx-prow-title, .gx .gx-prow-meta { min-width: 0; overflow-wrap: anywhere; }
.gx .gx-prow-end { display: flex; flex-direction: column; align-items: flex-end; gap: var(--gx-space-1); text-align: right; }
.gx .gx-prow-value { display: flex; align-items: center; justify-content: flex-end; white-space: nowrap; }
.gx .gx-prow-word { color: var(--gx-text-2); }
.gx .gx-prow-word--good { color: var(--gx-win); }
.gx .gx-prow-word--warn { color: var(--gx-pending); }
@media (forced-colors: active) { .gx .gx-prow { border-color: CanvasText; } }
```

In `web/src/next/ui/press.css`, add the row to each of its five selector lists, right after the `.gx-h-stat` entry of
that list: `.gx button.gx-prow` (the transition list), `.gx button.gx-prow:active:not(:disabled)` (the dim list, the dip
list and the `prefers-reduced-motion: reduce` list) and `.gx[data-motion="reduce"] button.gx-prow:active:not(:disabled)`
(the app setting's list). Keep the trailing commas and the closing selector of each list valid.

- [ ] **Step 5: The chart reveal.** Create `web/src/next/ui/ChartReveal.jsx`:

```jsx
// D-69 section 4.3: a chart reveals left to right once, when it first shows after the member's own tap (a layer opened, a
// disclosure opened), never on a page load. Transform only: the clip group slides in from the left while its content
// slides the other way, so the drawing never moves and only the window over it grows. (The spec names scaleX on the clip
// group; a scaled clip squashes the chart unless its content is counter-scaled by 1/s, unbounded at the start, so this is
// the same wipe with translate alone; WebKit's support for animating an SVG clipPath is uneven, and the iPhone is the
// target.) Reduced motion never starts it, and the chart is always drawn whole for assistive technology.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from './cx.js';
import { motionReduced } from './motion.js';
import './chartReveal.css';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** `<ChartReveal play={opened}><svg …/></ChartReveal>`: `play` turning true (or true at mount) reveals it once. */
export function ChartReveal({ play = false, className, children }) {
  const ref = useRef(null), played = useRef(play);
  const [phase, setPhase] = useState(() => (play ? 'in' : null));
  useClientLayoutEffect(() => {
    if (motionReduced(ref.current)) { setPhase(null); return; }
    if (play && !played.current) { played.current = true; setPhase('in'); }
  }, [play]);
  const end = event => { if (event.target === event.currentTarget) setPhase(null); };
  return <span ref={ref} className={cx('gx-reveal', className)} data-reveal={phase ?? undefined} onAnimationEnd={end}>
    <span className="gx-reveal-in">{children}</span>
  </span>;
}
```

Create `web/src/next/ui/chartReveal.css` (the test reads these lines exactly):

```css
/* D-69 section 4.3: a chart's reveal, left to right, once (ui/ChartReveal.jsx). The clip group slides in from the left
   while its content slides the other way, so the drawing stays put and only the window over it grows. Transform only;
   clipped only while it plays; reduced motion never starts it (and base.css stops every animation anyway). */
.gx .gx-reveal { display: block; min-width: 0; }
.gx .gx-reveal-in { display: block; }
@media (prefers-reduced-motion: no-preference) {
  .gx .gx-reveal[data-reveal="in"] { overflow: hidden; animation: gx-reveal-clip var(--gx-dur-big) var(--gx-ease-enter) both; }
  .gx .gx-reveal[data-reveal="in"] > .gx-reveal-in { animation: gx-reveal-hold var(--gx-dur-big) var(--gx-ease-enter) both; }
}
@keyframes gx-reveal-clip { from { transform: translateX(-100%); } to { transform: none; } }
@keyframes gx-reveal-hold { from { transform: translateX(100%); } to { transform: none; } }
```

- [ ] **Step 6: The layer pager and the kept parent.** Create `web/src/next/ui/LayerPager.jsx`:

```jsx
// D-69 step 3 (spec 4.1: "Its swipe paging between games moves into the game layer"): the game sheet's pager inside a
// nesting card. Its place ("2 of 14", said with the title) and 44 px previous and next buttons sit at the top of the
// card; a sideways drag of its body turns the page with the sheet's own gesture and thresholds (useSheetGestures.js
// usePagerSwipe, sheet.css's motion classes). The body moves with an inline transform on itself only, never on an
// ancestor of the fixed bars. Turning a page is not a navigation: the owner swaps the item in place, so focus stays on
// the button, and the page scrolls back to the top when the item (`page`) changes.
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { pagerPlace } from './gesture.js';
import { IconButton } from './IconButton.jsx';
import { cx } from './cx.js';
import { usePagerSwipe } from './useSheetGestures.js';
import './sheet.css';
import './pager.css';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function LayerPager({ title, pager, page, children }) {
  const body = useRef(null), shown = useRef(page);
  const place = pagerPlace(pager?.index, pager?.count);
  const paging = usePagerSwipe(body, place ? pager : null);
  useClientLayoutEffect(() => {
    if (shown.current !== page) window.scrollTo(0, 0);
    shown.current = page;
  }, [page]);
  const button = (step, icon, label, can) => <IconButton icon={icon} label={label} className="gx-sheet-page"
    aria-disabled={can ? undefined : 'true'} onClick={() => { if (can) paging.turn(step); }}/>;
  return <>
    {place ? <div className="gx-pager-head" data-pager="">
      <p className="gx-t-meta gx-c-2" aria-live="polite"><span className="gx-sr-only">{title}, {pager.unit ?? 'page'} </span>{place.text}</p>
      {button(-1, ChevronLeft, pager.prevLabel ?? 'Previous', place.canPrev)}
      {button(1, ChevronRight, pager.nextLabel ?? 'Next', place.canNext)}
    </div> : null}
    <div ref={body} className={cx('gx-pager-body', place && 'gx-sheet-body--pager')} onPointerDown={place ? paging.onPointerDown : undefined}>{children}</div>
  </>;
}
```

Create `web/src/next/ui/pager.css`:

```css
/* D-69 step 3: a layer's pager (ui/LayerPager.jsx): its place over the previous and next buttons, then the body a sideways
   drag turns (sheet.css times the motion). Tokens only. */
.gx .gx-pager-head { display: flex; align-items: center; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-pager-head > p { flex: 1 1 auto; min-width: 0; margin: 0; }
.gx .gx-pager-body { display: flex; flex-direction: column; gap: var(--gx-space-4); min-width: 0; }
```

Create `web/src/next/ui/KeptParent.jsx`:

```jsx
// D-69 step 3: a section's list stays mounted, hidden, under the layer that opened from it, as it stayed under the sheet
// that layer replaces: its reads and timers, its scroll and the row that opened the layer are all still there when Back
// closes the layer, and the list then settles back in (spec 4.3: 200 ms, no rise). The layer is drawn first, so the
// page's first heading is the layer's.
import { useRef } from 'react';
import { hasNavigated } from '../moments/launch.js';

export function KeptParent({ layer = null, children }) {
  const open = layer !== null && layer !== undefined && layer !== false;
  const latch = useRef({ open, enter: undefined });
  // Decided once per change, so a re-render (a read landing) never cuts the settle short.
  if (latch.current.open !== open) latch.current = { open, enter: !open && hasNavigated() ? 'back' : undefined };
  return <>{open ? layer : null}<div className="gx-kept" hidden={open} data-enter={latch.current.enter}>{children}</div></>;
}
```

- [ ] **Step 7: Layer focus, entrance and glyphs.** Create `web/src/next/ui/focusLayer.js`:

```js
// Where a fresh layer puts focus (D-69, step 2's lesson): a Nest moves focus only when its layer changes, so a layer
// that mounts fresh after a navigation (the tile or row that opened it is gone) focuses its own heading; a direct load
// (a reload, a shared link) is not a navigation and never moves focus. Home's Who's in and Research's layers use it.
import { useLayoutEffect } from 'react';
import { hasNavigated } from '../moments/launch.js';

/** Focuses `root`'s `[data-route-focus]` heading after a navigation; false when it did not. */
export function focusLayerHeading(root, navigated) {
  if (!navigated) return false;
  const heading = root?.querySelector?.('[data-route-focus]');
  if (!heading) return false;
  heading.focus({ preventScroll: true });
  return true;
}

/** Once, on mount: the layer at `ref` focuses its heading when the member navigated here. */
export function useLayerFocus(ref) {
  useLayoutEffect(() => { focusLayerHeading(ref.current, hasNavigated()); }, []); // once per mount, by design
}
```

In `web/src/next/home/focusRules.js`, delete the `focusLayerHeading` function and its comment and add, after the first
comment line:

```js
// Who's in mounts a fresh Nest; the kit's rule puts focus on its heading after a navigation (ui/focusLayer.js).
export { focusLayerHeading } from '../ui/focusLayer.js';
```

In `web/src/next/ui/Nest.jsx`, change the React import to `import { useLayoutEffect, useRef, useState } from 'react';`,
import `tabFading` beside `hasNavigated` (it already is) and add after `nestEnter`:

```js
/**
 * A page list's entrance (D-69 4.3): 'in' when it first shows after the member's own navigation, never on the launch
 * screen nor inside a tab change's fade (the screen already moves once). Decided once per mount.
 */
export function useEntrance() {
  const [enter] = useState(() => nestEnter({ navigated: hasNavigated(), tabFade: tabFading(), mounted: false }));
  return enter;
}
```

In `web/src/next/ui/nest.css`, replace the `@media (prefers-reduced-motion: no-preference)` block with:

```css
.gx .gx-stagger { --gx-nest-stagger: 30ms; }
@media (prefers-reduced-motion: no-preference) {
  /* D-69 4.3: a deeper layer rises in; a restored parent settles; the first six units follow 30 ms apart. Only on a
     layer change after the launch (data-enter, Nest.jsx), never on a page load. D-69 step 3: a nesting card's lists rise
     in like its grid, a page list does too after a navigation (.gx-stagger, useEntrance), and a list kept under a closed
     layer settles back (.gx-kept, KeptParent.jsx). */
  .gx .gx-nest-card[data-enter="in"] { animation: gx-nest-in var(--gx-dur-base) var(--gx-ease-enter); }
  .gx .gx-nest-card[data-enter="back"] { animation: gx-nest-back var(--gx-dur-exit) var(--gx-ease-standard); }
  .gx .gx-kept[data-enter="back"] { animation: gx-nest-back var(--gx-dur-exit) var(--gx-ease-standard); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(-n+6), .gx .gx-nest-card[data-enter="in"] .gx-nest-list > :nth-child(-n+6), .gx .gx-stagger[data-enter="in"] > :nth-child(-n+6) { animation: gx-nest-unit-in var(--gx-dur-quick) var(--gx-ease-enter) both; }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(2), .gx .gx-nest-card[data-enter="in"] .gx-nest-list > :nth-child(2), .gx .gx-stagger[data-enter="in"] > :nth-child(2) { animation-delay: var(--gx-nest-stagger); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(3), .gx .gx-nest-card[data-enter="in"] .gx-nest-list > :nth-child(3), .gx .gx-stagger[data-enter="in"] > :nth-child(3) { animation-delay: calc(var(--gx-nest-stagger) * 2); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(4), .gx .gx-nest-card[data-enter="in"] .gx-nest-list > :nth-child(4), .gx .gx-stagger[data-enter="in"] > :nth-child(4) { animation-delay: calc(var(--gx-nest-stagger) * 3); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(5), .gx .gx-nest-card[data-enter="in"] .gx-nest-list > :nth-child(5), .gx .gx-stagger[data-enter="in"] > :nth-child(5) { animation-delay: calc(var(--gx-nest-stagger) * 4); }
  .gx .gx-nest-card[data-enter="in"] .gx-nest-grid > :nth-child(6), .gx .gx-nest-card[data-enter="in"] .gx-nest-list > :nth-child(6), .gx .gx-stagger[data-enter="in"] > :nth-child(6) { animation-delay: calc(var(--gx-nest-stagger) * 5); }
}
```

In `web/src/next/ui/destinations.js`, under `// Research (and Home's row to this week's trends)` add:

```js
  games: 'chart', // Research › Games: the board and one game's lines (D-69 step 3)
  teams: 'shieldCheck', // Research › Teams: a team's mark, record and margins (D-69 step 3)
```

- [ ] **Step 8: The meter skeleton.** In `web/src/next/ui/Skeleton.jsx`, add after `SKELETON_SHAPES`:

```js
/** The landing shape's card: Home's (a countdown block) or a meter card (Research's, as Play's: one bar). */
export const SKELETON_HEROES = Object.freeze(['countdown', 'meter']);
```

change `function art(shape, count)` to `function art(shape, count, hero)` and its `'landing'` case to:

```jsx
    case 'landing':
      return (
        <>
          {hero === 'meter' ? (
            <span className="gx-skel-card gx-skel-hero gx-skel-hero--meter">
              <Bar width={2}/><Bar title/><span className="gx-skel-bar gx-skel-meter"></span><Bar width={1}/>
              <span className="gx-skel-button"></span>
            </span>
          ) : (
            <span className="gx-skel-card gx-skel-hero">
              <Bar width={2}/><Bar title/><Bar width={1}/>
              <span className="gx-skel-block gx-skel-countdown"></span>
              <Bar width={0}/>
              <span className="gx-skel-button"></span>
            </span>
          )}
          {tilesOf(each)}
        </>
      );
```

and the component's signature and call to:

```jsx
export function Skeleton({ label, shape = 'lines', count = 3, hero = 'countdown', className, ...rest }) {
  const name = needLabel(label, 'Skeleton');
  const kind = SKELETON_SHAPES.includes(shape) ? shape : 'lines';
  const look = SKELETON_HEROES.includes(hero) ? hero : 'countdown';
```

with `art(kind, n, look)` in the returned markup. In `web/src/next/ui/skeleton.css`, after the `.gx-skel-button` rule add
(232 px is the estimate; Task 9 measures the real card and sets the value):

```css
/* D-69 step 3: the meter next-move card (Research's first card, as Play's): eyebrow, title, the week meter, one meta line
   and the button, measured at a 390 px phone (tests/cloud-browser/next-research-layers.spec.js). */
.gx-skel-hero--meter { min-height: 232px; }
.gx-skel-bar.gx-skel-meter { width: 100%; height: 8px; }
```

- [ ] **Step 9: Export everything.** In `web/src/next/ui/index.js`, change the `Nest` and `Skeleton` lines to
`export { Nest, NestMeter, NestSpark, NEST_MAX_STEPS, useEntrance } from './Nest.jsx';` and
`export { Skeleton, SKELETON_SHAPES, SKELETON_HEROES } from './Skeleton.jsx';`, and add:

```js
export { PictureRow, PICTURE_ROW_TONES } from './PictureRow.jsx';
export { ChartReveal } from './ChartReveal.jsx';
export { LayerPager } from './LayerPager.jsx';
export { KeptParent } from './KeptParent.jsx';
export { focusLayerHeading, useLayerFocus } from './focusLayer.js';
```

- [ ] **Step 10: Run it and see it pass, with the kit's other tests.**

Run: `npx vitest run tests/next-kit-research.test.jsx tests/next-kit-tile.test.jsx tests/next-ui.test.jsx tests/next-home-ui.test.jsx tests/next-destination-icons.test.jsx && node --test tests/next-tokens.test.mjs tests/next-parse.test.mjs`
Expected: PASS (the tokens test accepts the new keyframes and the local `--gx-nest-stagger`).

- [ ] **Step 11: Commit.**

```bash
git add web/src/next/ui/PictureRow.jsx web/src/next/ui/pictureRow.css web/src/next/ui/ChartReveal.jsx web/src/next/ui/chartReveal.css web/src/next/ui/LayerPager.jsx web/src/next/ui/pager.css web/src/next/ui/KeptParent.jsx web/src/next/ui/focusLayer.js web/src/next/ui/Nest.jsx web/src/next/ui/nest.css web/src/next/ui/press.css web/src/next/ui/Skeleton.jsx web/src/next/ui/skeleton.css web/src/next/ui/destinations.js web/src/next/ui/index.js web/src/next/home/focusRules.js tests/next-kit-research.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/ui/Nest.jsx web/src/next/ui/nest.css web/src/next/ui/press.css web/src/next/ui/Skeleton.jsx web/src/next/home/focusRules.js
git commit -m "Kit for Research: picture rows, the chart reveal, the layer pager, kept lists, list entrance, the meter skeleton" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2 · Research's layer addresses

### Task 2: One game and one team are steps with their own addresses; the pager's swap is not

The router keeps `layer` and `item` on any tab (`KEYS`), and step 0's test already proves a research games address
round-trips them. What is missing: the allowlist (unknown values draw the list), the Teams section, the steps, Back on a
shared link, the pager's in-place swap, and the clearing that keeps a layer from riding into a fresh destination.

**Files:**
- Create: `web/src/next/research/researchNav.js`
- Modify: `web/src/next/shell/state.js`, `web/src/next/shell/router.js`, `tests/next-router.test.mjs`

**Interfaces:**
- Consumes: `TEAM_NAMES` (`shared/nfl-schedule.mjs`).
- Produces: from `shell/state.js` `RESEARCH_LAYERS = { games: { layer: 'game', item(value) }, teams: { layer: 'team',
  item(value) } }` and `researchLayerOf(section, view)` → `{ layer, item } | null`; `SECTIONS.research` gains `'teams'`.
  From `research/researchNav.js`: `RESEARCH_NAMES = { title: 'Research', games: 'Games', trends: 'Trends', fantasy:
  'Fantasy', teams: 'Teams' }`, `gameRowId(id)`, `teamRowId(code)`, `tileId(key)`, `layerTitle(id)`,
  `openSection(shell, section, view = {})`, `gameView(id)`, `teamView(code)`, `openGame(shell, id)`, `pageGame(shell, id)`,
  `closeGame(shell)`, `openTeam(shell, code)`, `closeTeam(shell)`. A game lives in `views.lines` (the `lines` adapter),
  a team in `views.research`.

- [ ] **Step 1: Write the failing tests.** In `tests/next-router.test.mjs`, change the state import to
`import { HOME_LAYER_IDS, RESEARCH_LAYERS, canGoBack, initialState, isDetail, layer, reduce, researchLayerOf } from '../web/src/next/shell/state.js';`
and append:

```js
const at = (state, tab) => fragmentFor(tab, state.views[tab], state.views);

test('D-69 step 3: one game and one team are Research layers with their own addresses; unknown values draw the list', () => {
  const game = placeFromFragment('#research/games?layer=game&item=SEA-DEN');
  assert.deepEqual([game.tab, game.view.section, game.adapters.lines.layer, game.adapters.lines.item], ['research', 'games', 'game', 'SEA-DEN']);
  const opened = initialState(game);
  assert.deepEqual(researchLayerOf('games', opened.views.lines), { layer: 'game', item: 'SEA-DEN' });
  assert.equal(opened.views.research.layer, undefined, 'the game lives in the lines view, never in Research’s own');
  assert.equal(at(opened, 'research'), '#research/games?layer=game&item=SEA-DEN', 'a reload or a shared link reopens it');
  const team = initialState(placeFromFragment('#research/teams?layer=team&item=SEA'));
  assert.deepEqual([team.views.research.section, team.views.research.layer, team.views.research.item], ['teams', 'team', 'SEA']);
  assert.equal(at(team, 'research'), '#research/teams?layer=team&item=SEA');
  for (const fragment of ['#research/games?layer=nope&item=SEA-DEN', '#research/games?layer=team&item=SEA', '#research/games?layer=game&item=%3Cx%3E',
    '#research/teams?layer=team&item=ZZZ', '#research/teams?layer=game&item=SEA-DEN', '#research/trends?layer=game&item=SEA-DEN']) {
    const state = initialState(placeFromFragment(fragment));
    const section = state.views.research.section;
    assert.equal(researchLayerOf(section, section === 'games' ? state.views.lines : state.views.research), null, fragment);
    assert.doesNotMatch(at(state, 'research'), /layer=|item=/, `${fragment}: the address draws the list`);
    assert.equal(isDetail(state), true, `${fragment}: the section is still a detail (Back leaves it), with no layer open`);
  }
  assert.deepEqual(Object.keys(RESEARCH_LAYERS), ['games', 'teams']);
});

test('D-69 step 3: opening a game or a team is a step; the lip and Back close it; the pager swaps the game in place, no step', () => {
  const board = initialState({ tab: 'research', view: { section: 'games' } });
  const game = reduce(board, { type: 'view', tab: 'lines', patch: { layer: 'game', item: 'SEA-DEN' } });
  assert.deepEqual([game.trail.length, game.navMode], [1, 'go'], 'opening the game is a step');
  const paged = reduce(game, { type: 'view', tab: 'lines', patch: { item: 'HOU-JAX' } });
  assert.deepEqual([paged.views.lines.item, paged.trail.length, paged.nav], ['HOU-JAX', 1, game.nav], 'the pager swaps the game in place: no step, no navigation');
  for (const closed of [reduce(paged, { type: 'back' }), reduce(paged, { type: 'view', tab: 'lines', patch: { layer: undefined, item: undefined } })]) {
    assert.equal(closed.views.research.section, 'games');
    assert.equal(researchLayerOf('games', closed.views.lines), null);
    assert.deepEqual(closed.trail, [], 'the lip is Back, so the next Back leaves the board');
  }
  const list = initialState({ tab: 'research', view: { section: 'teams' } });
  const team = reduce(list, { type: 'go', tab: 'research', view: { section: 'teams', layer: 'team', item: 'SEA' } });
  assert.equal(team.trail.length, 1);
  assert.equal(reduce(team, { type: 'view', tab: 'research', patch: { layer: undefined, item: undefined } }).views.research.layer ?? null, null);
  // From a game, a team opens Research › Teams › that team; Back returns to the game.
  const fromGame = reduce(game, { type: 'go', tab: 'research', view: { section: 'teams', layer: 'team', item: 'DEN' } });
  assert.deepEqual([fromGame.views.research.section, fromGame.views.research.item, fromGame.trail.length], ['teams', 'DEN', 2]);
  const back = reduce(fromGame, { type: 'back' });
  assert.deepEqual([back.views.research.section, researchLayerOf('games', back.views.lines)?.item], ['games', 'SEA-DEN']);
});

test('D-69 step 3: on a shared link or a reload, Back and the lip close one Research layer, to its list, never to the landing', () => {
  for (const [fragment, section, key] of [['#research/games?layer=game&item=SEA-DEN', 'games', 'lines'], ['#research/teams?layer=team&item=SEA', 'teams', 'research']]) {
    const linked = initialState(placeFromFragment(fragment));
    assert.equal(linked.trail.length, 0);
    for (const closed of [reduce(linked, { type: 'back' }), reduce(linked, { type: 'view', tab: key, patch: { layer: undefined, item: undefined } })]) {
      assert.deepEqual([closed.tab, closed.views.research.section, closed.navMode], ['research', section, 'back'], fragment);
      assert.equal(researchLayerOf(section, closed.views[key]), null, fragment);
      assert.deepEqual(closed.trail, []);
    }
    assert.equal(reduce(reduce(linked, { type: 'back' }), { type: 'back' }).views.research.section, undefined, 'the next Back leaves for the landing');
  }
});

test('D-69 step 3: a Research layer never rides into a fresh destination or another tab, and other tabs’ layers never reach Research', () => {
  const game = initialState(placeFromFragment('#research/games?layer=game&item=SEA-DEN'));
  const home = reduce(game, { type: 'tab', tab: 'home' });
  assert.equal(home.views.home.layer, undefined, 'a Research layer never reaches Home');
  assert.equal(at(reduce(home, { type: 'go', tab: 'research', view: { section: 'games' } }), 'research'), '#research/games', 'the Games tile and Home’s "All N games" open the board');
  assert.equal(at(reduce(game, { type: 'tab', tab: 'research' }), 'research'), '#research', 'the Research tab opens the landing');
  const who = initialState(placeFromFragment('#home?layer=who'));
  assert.equal(at(reduce(who, { type: 'go', tab: 'research', view: { section: 'teams' } }), 'research'), '#research/teams', 'Home’s layer never reaches Research');
  const awards = initialState(placeFromFragment('#play/features?layer=awards'));
  assert.equal(reduce(awards, { type: 'go', tab: 'research', view: { section: 'teams' } }).views.research.layer, undefined, 'Play’s layer never reaches Research');
  const team = initialState(placeFromFragment('#research/teams?layer=team&item=SEA'));
  assert.equal(at(reduce(team, { type: 'go', tab: 'play', view: { section: 'score' } }), 'play'), '#play/score', 'a Research layer never reaches Play');
  assert.equal(at(reduce(team, { type: 'go', tab: 'research', view: { section: 'teams' } }), 'research'), '#research/teams', 'the Teams tile opens the list');
  const restored = reduce(game, { type: 'restore', place: placeFromFragment('#research/games') });
  assert.equal(researchLayerOf('games', restored.views.lines), null, 'a restored board entry is the board, never the game left open');
});

test('D-69 step 3: browser Back closes the game layer; the pager rewrites its entry; Forward and a reload reopen the game shown', async () => {
  const win = fakeWindow('https://gtl.test/#research/games'); const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'lines', patch: { layer: 'game', item: 'SEA-DEN' } });
  await settle();
  shell.dispatch({ type: 'view', tab: 'lines', patch: { item: 'HOU-JAX' } });
  await settle();
  assert.deepEqual(win.stack(), ['#research/games', '[#research/games?layer=game&item=HOU-JAX]']);
  win.history.back(); await settle();
  assert.equal(researchLayerOf('games', shell.state.views.lines), null);
  assert.equal(win.location.hash, '#research/games');
  win.history.forward(); await settle();
  assert.equal(shell.state.views.lines.item, 'HOU-JAX');
  shell.connection.disconnect();
  const reloaded = app(win);
  assert.deepEqual(researchLayerOf('games', reloaded.state.views.lines), { layer: 'game', item: 'HOU-JAX' });
  reloaded.connection.disconnect();
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `node --test tests/next-router.test.mjs`
Expected: FAIL (`RESEARCH_LAYERS` is not exported; then `#research/teams` parses as null, and the steps).

- [ ] **Step 3: The allowlist and the steps.** In `web/src/next/shell/state.js`, add at the top after the header comment:

```js
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
```

After `HOME_LAYER_IDS` add:

```js
/**
 * D-69 step 3: Research's layers by section, each one layer name and its item's allowlist: one game in Research › Games
 * (`#research/games?layer=game&item=SEA-DEN`, kept in the lines view) and one team in Research › Teams
 * (`#research/teams?layer=team&item=SEA`, kept in Research's own view). Any other value draws the section's list.
 */
export const RESEARCH_LAYERS = Object.freeze({
  games: Object.freeze({ layer: 'game', item: value => typeof value === 'string' && /^[\w-]{1,100}$/.test(value) }),
  teams: Object.freeze({ layer: 'team', item: value => typeof value === 'string' && Object.hasOwn(TEAM_NAMES, value) }),
});
/** The open layer of a Research `section` in `view` (`{ layer, item }`), or null when its values are not allowlisted. */
export function researchLayerOf(section, view) {
  const spec = Object.hasOwn(RESEARCH_LAYERS, section ?? '') ? RESEARCH_LAYERS[section] : null;
  return spec && view?.layer === spec.layer && spec.item(view.item) ? { layer: view.layer, item: view.item } : null;
}
/** Which view holds the Research layer open now ('lines' for a game, 'research' for a team), or null. */
function researchOpenLayer(state) {
  if (state.tab !== 'research') return null;
  const section = state.views.research?.section;
  if (section === 'games' && researchLayerOf('games', state.views.lines)) return 'lines';
  if (section === 'teams' && researchLayerOf('teams', state.views.research)) return 'research';
  return null;
}
/** The game layer's pager shows another game in place (the same layer, a new item): not a step. */
const pagesGame = (state, patch) => !!researchLayerOf('games', state.views.lines) && !Object.hasOwn(patch, 'layer') && RESEARCH_LAYERS.games.item(patch.item);
/** A patch that closes the Research layer open now. */
const closesResearchLayer = (state, tab, patch) => researchOpenLayer(state) === tab && Object.hasOwn(patch, 'layer') && !patch.layer;
const RESEARCH_LAYER_CLEARED = Object.freeze({ layer: undefined, item: undefined });
```

In `navigationPatch`, after the D-69 step 2 Home line add:

```js
  // D-69 step 3: opening or closing one game (the lines view) or one team (Research's view) is a step, so Back closes
  // it; the game layer's pager showing another game is not (it swaps the item in place, and Back still lands on the board).
  || (tab === 'lines' && ['layer', 'item'].some(key => Object.hasOwn(patch, key) && (patch[key] ?? null) !== (state.views.lines?.[key] ?? null)) && !pagesGame(state, patch))
  || (tab === 'research' && ['layer', 'item'].some(key => Object.hasOwn(patch, key) && (patch[key] ?? null) !== (state.views.research?.[key] ?? null)))
```

Change `LAYER_KEYS` to `Object.freeze({ play: PLAY_LAYER_KEYS, home: HOME_LAYER_KEYS, research: Object.freeze(['layer', 'item']) })`.
Change `mergeAdapters` to:

```js
const mergeAdapters = (views, adapters) => Object.fromEntries(Object.entries(adapters ?? {}).map(([tab, view]) => [tab, { ...views[tab],
  ...(tab === 'league' ? LEAGUE_LAYER_CLEARED : tab === 'lines' ? RESEARCH_LAYER_CLEARED : {}), ...view }]));
```

In `reduce`, case `'tab'`/`'go'`, replace the `const view = …` and `const adapterFrom = …` lines with:

```js
      const opened = action.type === 'tab' || !target.view ? root : target.adapter === 'league' ? ownMarket({ ...next, ...target.view }, current) : { ...next, ...target.view };
      // D-69 step 3: a game's keys live in the lines view (the address reads them there), never in Research's own.
      const view = target.adapter === 'lines' ? { ...opened, ...RESEARCH_LAYER_CLEARED } : opened;
      const adapterFrom = target.adapter === 'league' && !onLeague(state) ? { ...state.views.league, ...LEAGUE_LAYER_CLEARED }
        // A fresh Research › Games destination opens the board unless it names a game itself.
        : target.adapter === 'lines' ? { ...state.views.lines, ...RESEARCH_LAYER_CLEARED } : state.views[target.adapter];
```

In case `'view'`, right after the `returnsToPrior` line add:

```js
        // D-69 step 3: a Research layer reached by a shared link or a reload has nothing under it; its lip is Back.
        if (!state.trail.length && closesResearchLayer(state, action.tab, action.patch)) return reduce(state, { type: 'back' });
```

In case `'back'`, replace `if (!prior) return isDetail(state) ? … : state;` with:

```js
      if (!prior) {
        // D-69 step 3: Back on a Research layer with nothing under it (a shared link, a reload) closes that one layer.
        const open = researchOpenLayer(state);
        if (open) return { ...state, ...closed, views: { ...state.views, [open]: { ...state.views[open], ...RESEARCH_LAYER_CLEARED } }, nav: state.nav + 1, navMode: 'back' };
        return isDetail(state) ? { ...reduce(state, { type: 'tab', tab: state.tab }), navMode: 'back' } : state;
      }
```

- [ ] **Step 4: The router.** In `web/src/next/shell/router.js`, import `researchLayerOf` from `./state.js` beside the
others, change `SECTIONS.research` to `['games','fantasy','trends','teams']`, and in `safeView`, after the Home line add:

```js
  // D-69 step 3: Research's layers (one game, one team) by allowlist; any other layer or item draws the section's list.
  if (tab === 'research' && !researchLayerOf(result.section, result)) { delete result.layer; delete result.item; }
```

- [ ] **Step 5: The nav helpers.** Create `web/src/next/research/researchNav.js`:

```js
// Research's names, addresses and focus handles in one place (D-69 step 3): the sections, one game
// (`#research/games?layer=game&item=SEA-DEN`), one team (`#research/teams?layer=team&item=SEA`), and the stable ids the
// shell returns focus to on Back (a spoken name can change; an id does not).
import { RESEARCH_LAYERS } from '../shell/state.js';

export const RESEARCH_NAMES = Object.freeze({ title: 'Research', games: 'Games', trends: 'Trends', fantasy: 'Fantasy', teams: 'Teams' });
export const gameRowId = id => `gx-l-row-${id}`;
export const teamRowId = code => `gx-r-team-${code}`;
export const tileId = key => `gx-r-tile-${key}`;
/** "SEA @ DEN" from a game id, the layer's heading while its week loads (so the heading never changes under the reader). */
export const layerTitle = id => (typeof id === 'string' && /^[A-Za-z]{2,4}-[A-Za-z]{2,4}$/.test(id) ? id.replace('-', ' @ ') : id);
/** A Research section on its first layer, as the landing's card and tiles open it. */
export function openSection(shell, section, view = {}) { shell.go('research', { section, season: null, week: null, ...view }); }
export const gameView = id => ({ section: 'games', layer: RESEARCH_LAYERS.games.layer, item: id });
export const teamView = code => ({ section: 'teams', layer: RESEARCH_LAYERS.teams.layer, item: code });
export function openGame(shell, id) { shell.setView('lines', { layer: RESEARCH_LAYERS.games.layer, item: id }); }
/** The pager: another game in place (not a step). The caller asks shell.confirmLeave() first. */
export function pageGame(shell, id) { shell.setView('lines', { item: id }); }
export function closeGame(shell) { shell.setView('lines', { layer: undefined, item: undefined }); }
/** From the Teams list or from a game: a step to Research › Teams › that team. */
export function openTeam(shell, code) { shell.go('research', teamView(code)); }
export function closeTeam(shell) { shell.setView('research', { layer: undefined, item: undefined }); }
```

- [ ] **Step 6: Run them and see them pass, with the other navigation tests.**

Run: `node --test tests/next-router.test.mjs tests/next-shell-state.test.mjs tests/next-four-tab-navigation.test.mjs tests/next-features-layers.test.mjs && npx vitest run tests/next-fantasy-nest.test.jsx tests/next-trends-nest.test.jsx`
Expected: PASS (step 0's "every section keeps a layer and an item" test still passes: `layer=game&item=2026_08_SEA_DEN`
is allowlisted).

- [ ] **Step 7: Commit.**

```bash
git add web/src/next/shell/state.js web/src/next/shell/router.js web/src/next/research/researchNav.js tests/next-router.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/shell/state.js web/src/next/shell/router.js web/src/next/research/researchNav.js
git commit -m "Research's layers have their own addresses: one game and one team are steps; the pager swaps in place" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3 · Research › Games as picture rows

### Task 3: The board becomes picture rows that open the game layer

**Files:**
- Create: `web/src/next/lines/boardRows.js`, `web/src/next/lines/boardContext.js`, `tests/next-board-rows.test.mjs`
- Modify: `web/src/next/lines/LinesBoard.jsx`, `web/src/next/lines/lines.css`, `tests/next-lines-ui.test.jsx`

**Interfaces:**
- Consumes: `PictureRow`, `useEntrance`, `TeamMark`, `MetaLine` (kit); `marketBoard` cards (`lines/boardMarkets.js`);
  `matchupRecords` (`teams/teamModel.js`); `openGame`, `gameRowId`, `RESEARCH_NAMES` (Task 2).
- Produces: `ROW_WORDS`, `withRecords(aria, card, records)` (moved from `LinesBoard.jsx`), `boardRow(card, records)` →
  `{ id, title, meta: string[], value: { lock } | { loading } | { text, line }, word, tone, ariaLabel }`;
  `rememberBoard(context)`, `rememberedBoard()` (the `openedBoardOrder` context `{ accountId, season, week, ids, now,
  results }`); rows `button.gx-prow[data-game]` with id `gx-l-row-<id>`; the board's h1 reads "Games".

- [ ] **Step 1: Write the failing model test.** Create `tests/next-board-rows.test.mjs`:

```js
// D-69 step 3 (spec 5 and 6, "The board becomes picture rows"): one board card as one row, as plain data. Contract: the
// row's face is the marks, the matchup, one meta line and the consensus Spread over its word; a closed market is a lock,
// never "—"; every word for a state is a word, not a color; and the row's spoken name keeps everything the card said
// (the Total, your saved guesses, a trend, the weather), so nothing leaves the screen reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROW_WORDS, boardRow, withRecords } from '../web/src/next/lines/boardRows.js';
import { rememberBoard, rememberedBoard } from '../web/src/next/lines/boardContext.js';

const card = (patch = {}) => ({ id: 'SEA-DEN', matchup: 'SEA @ DEN', away: { code: 'SEA', nick: 'Seahawks' }, home: { code: 'DEN', nick: 'Broncos' },
  time: '1:05 PM PT', showTime: false, started: false, final: null, spread: { open: true, line: 'DEN −1.5', label: 'Current line' },
  aria: 'Seahawks at Broncos, Sun 1:05 PM PT. Spread DEN −1.5. Current line. Total 43.5. Your total pick 44. Trend: Broncos at home. Open game details', ...patch });

test('an open line: the quote over "Current"; the records as the meta line, said after the matchup in the name', () => {
  const row = boardRow(card(), { away: '3–2', home: '2–2–1' });
  assert.deepEqual([row.id, row.title, row.value, row.word, row.tone], ['SEA-DEN', 'SEA @ DEN', { text: 'DEN −1.5', line: true }, 'Current', 'plain']);
  assert.deepEqual(row.meta, ['3–2 · 2–2–1']);
  assert.match(row.ariaLabel, /^Seahawks at Broncos, Sun 1:05 PM PT\. Records: Seahawks 3–2, Broncos 2–2–1\. Spread DEN −1\.5/);
  for (const kept of ['Total 43.5', 'Your total pick 44', 'Trend: Broncos at home']) assert.ok(row.ariaLabel.includes(kept), kept);
});

test('a closed market is a lock with "Locked", never "—"; loading has no word; a missing quote says "No line"', () => {
  assert.deepEqual([boardRow(card({ spread: { open: false } })).value, boardRow(card({ spread: { open: false } })).word], [{ lock: true }, 'Locked']);
  const loading = boardRow(card({ spread: { open: true, line: null, label: 'Loading', loading: true } }));
  assert.deepEqual([loading.value, loading.word], [{ loading: true }, null]);
  const missing = boardRow(card({ spread: { open: true, line: null, label: 'Unavailable' } }));
  assert.deepEqual([missing.value, missing.word], [{ text: '—', line: false }, 'No line']);
});

test('an old or unverified quote says so in its word, with the pending tone; a kickoff or a final says that instead', () => {
  for (const [label, word] of [['Latest recorded line', 'Latest'], ['Time unverified', 'Unverified']]) {
    const row = boardRow(card({ spread: { open: true, line: 'DEN −1.5', label } }));
    assert.deepEqual([row.word, row.tone], [word, 'warn'], label);
  }
  assert.equal(boardRow(card({ started: true })).word, 'Kicked off');
  const final = boardRow(card({ started: true, final: { score: 'Final · SEA 24–DEN 17' } }), { away: '3–2', home: '2–2–1' });
  assert.deepEqual([final.word, final.tone, final.meta], ['Final', 'plain', ['SEA 24–DEN 17']]);
  assert.deepEqual(Object.values(ROW_WORDS), ['Current', 'Latest', 'Unverified', 'No line']);
});

test('several kickoff times in one group put the time first in the meta line; no records and no time is no meta line', () => {
  assert.deepEqual(boardRow(card({ showTime: true }), { away: '3–2', home: null }).meta, ['1:05 PM PT', '3–2 · —']);
  assert.deepEqual(boardRow(card(), null).meta, []);
  assert.equal(withRecords('A at B, Sun. Spread hidden', card(), null), 'A at B, Sun. Spread hidden');
});

test('the board’s order is kept in memory only, for the layer’s pager; anything else forgets it', () => {
  rememberBoard({ accountId: 'u-1', season: 2026, week: 6, ids: ['SEA-DEN'], now: 1, results: {} });
  assert.deepEqual(rememberedBoard().ids, ['SEA-DEN']);
  rememberBoard('not a context');
  assert.equal(rememberedBoard(), null);
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node --test tests/next-board-rows.test.mjs`
Expected: FAIL (`Cannot find module …/lines/boardRows.js`).

- [ ] **Step 3: The row model and the kept order.** Create `web/src/next/lines/boardRows.js`:

```js
// D-69 step 3 (spec 5, picture rows; spec 6 step 3, "The board becomes picture rows"): one board card (boardMarkets.js
// marketBoard) as one row. Pure. A row shows the two marks, the matchup, the records (or a final's score) as its one
// meta line, and the consensus Spread on the right over its word. The Total, your saved guesses, a trend line, the
// weather word and the late pill leave the row's face for the game layer; the row's spoken name keeps every one of them.
import { DASH, SEP } from '../format.js';

/** The Spread cell's state in one word (D-38: the word carries it; color only repeats it). */
export const ROW_WORDS = Object.freeze({ 'Current line': 'Current', 'Latest recorded line': 'Latest', 'Time unverified': 'Unverified', Unavailable: 'No line' });
const PENDING = new Set(['Latest recorded line', 'Time unverified']);

/** The card's sentence with the records said after the matchup: "Seahawks at Broncos, Sun 1:05 PM PT. Records: Seahawks 4–2, Broncos 3–3. …". */
export function withRecords(aria, card, records) {
  const words = [['away', card.away], ['home', card.home]].filter(([key]) => records?.[key]).map(([key, side]) => `${side.nick} ${records[key]}`);
  if (!words.length) return aria;
  const at = aria.indexOf('. '), said = `Records: ${words.join(', ')}`;
  return at < 0 ? `${aria}. ${said}` : `${aria.slice(0, at)}. ${said}${aria.slice(at)}`;
}

/**
 * `{ id, title, meta, value, word, tone, ariaLabel }` for one card. `value` is `{ lock: true }` (the market is closed: a
 * lock, never "—"), `{ loading: true }`, or `{ text, line }` (the quote, or "—" with none). `meta` is the meta line's parts.
 */
export function boardRow(card, records = null) {
  const cell = card.spread ?? { open: false };
  const value = !cell.open ? { lock: true } : cell.loading ? { loading: true } : cell.line ? { text: cell.line, line: true } : { text: DASH, line: false };
  const word = card.final ? 'Final' : card.started ? 'Kicked off' : !cell.open ? 'Locked' : cell.loading ? null : ROW_WORDS[cell.label] ?? cell.label ?? null;
  const tone = !card.final && !card.started && cell.open && PENDING.has(cell.label) ? 'warn' : 'plain';
  const score = typeof card.final?.score === 'string' ? card.final.score.replace(/^Final · /, '') : null;
  const recs = records && (records.away || records.home) ? `${records.away ?? DASH}${SEP}${records.home ?? DASH}` : null;
  return { id: card.id, title: card.matchup, meta: [card.showTime ? card.time : null, score ?? recs].filter(Boolean), value, word, tone,
    ariaLabel: withRecords(card.aria, card, records) };
}
```

Create `web/src/next/lines/boardContext.js`:

```js
// The board's order and recorded finals as they were when a row opened the game layer (gameOrder.js openedBoardOrder and
// openedBoardResult read them back, scoped to the account and week), kept in memory only: the address names the game,
// never the order, so a reload or a shared link falls back to the week's own order.
let remembered = null;

export function rememberBoard(context) { remembered = context !== null && typeof context === 'object' ? context : null; }
export const rememberedBoard = () => remembered;
```

- [ ] **Step 4: Run it and see it pass.**

Run: `node --test tests/next-board-rows.test.mjs`
Expected: PASS.

- [ ] **Step 5: Update the board's UI tests (keep each contract).** In `tests/next-lines-ui.test.jsx`, in
`describe('the Lines board', …)` replace the first four tests with:

```jsx
  it('picture rows: a lock and "Locked" on every closed Spread, never "—"; the Total, your tags and the trend lines said in each row’s name', () => {
    state.lines = data();
    const html = render(<LinesBoard/>);
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html, n => n.tag === 'h1').map(textOf)).toEqual(['Games']);
    const rows = nodes(html, n => n.tag === 'button' && n.attrs['data-game']);
    expect(rows).toHaveLength(14);
    for (const row of rows) expect(row.attrs.id).toBe(`gx-l-row-${row.attrs['data-game']}`);
    const locked = nodes(html, attr('data-cell', 'locked'));
    expect(locked).toHaveLength(14, 'every Spread is closed (drafts only)');
    for (const cell of locked) {
      expect(cell.children.filter(c => c.tag === 'svg')).toHaveLength(1);
      expect(textOf(cell)).toBe('');
    }
    expect(nodes(html, n => (n.attrs.class ?? '').split(' ').includes('gx-prow-word')).map(textOf)).toEqual(Array(14).fill('Locked'));
    const sea = rows.find(attr('data-game', 'SEA-DEN'));
    expect(sea.attrs['aria-label']).toContain('Spread line hidden. Total 43.5. Current line. fixture. Updated');
    expect(sea.attrs['aria-label']).toContain('Your spread pick');
    expect(textOf(sea)).not.toContain('You −4'); // your saved guess is in the row's name and the game layer, not its face
    const trends = rows.filter(row => /Trend: /.test(row.attrs['aria-label']));
    expect(trends.length).toBeLessThanOrEqual(3);
    for (const row of rows) expect((row.attrs['aria-label'].match(/(Trend|Kickoff weather): /g) ?? []).length).toBeLessThanOrEqual(1);
    expect(nodes(html, n => n.attrs['data-chip'])).toHaveLength(0);
    expect(nodes(html, n => n.tag === 'button' && n.attrs['aria-label'] === 'About trends')).toHaveLength(1);
    expect(text(html)).not.toContain('Line now arrives in a later update.');
    expect(text(html)).not.toContain('11.5');
  });

  it('D-62: each row’s meta line is the two records in text-2, said after the matchup; the row stays one button', () => {
    state.lines = data();
    const record = (w, l, t = 0) => ({ overall: { w, l, t }, home: null, road: null, pointsFor: null, pointsAgainst: null, games: [] });
    const season = year => ({ status: 'ready', data: { season: year, throughWeek: 6, fallback: false, teams: { SEA: record(3, 2), DEN: record(2, 2, 1) } } });
    state.teams = season(2026);
    const html = render(<LinesBoard/>);
    expect(markupProblems(html)).toEqual([]);
    const rows = Object.fromEntries(nodes(html, n => n.tag === 'button' && n.attrs['data-game']).map(n => [n.attrs['data-game'], n]));
    const meta = row => [...walk(row)].filter(n => (n.attrs?.class ?? '').split(' ').includes('gx-prow-meta')).map(textOf);
    expect(meta(rows['SEA-DEN']).join(' ')).toMatch(/3–2.*2–2–1/);
    expect(rows['SEA-DEN'].attrs['aria-label']).toMatch(/^Seahawks at Broncos, \w{3} [^.]+ PT\. Records: Seahawks 3–2, Broncos 2–2–1\. Spread line hidden\./);
    expect([...walk(rows['SEA-DEN'])].filter(n => n.tag === 'button'), 'no team buttons nested in the row').toHaveLength(0);
    expect(meta(rows['HOU-JAX']), 'a team the read does not have shows no record').toEqual([]);
    state.teams = season(2025);
    expect(render(<LinesBoard/>)).not.toContain('3–2');
  });

  it('D-45: one weather word per game in the row’s name from the week’s forecasts, never digits; a trend keeps its place; none for a dome', () => {
    state.lines = data();
    const forecast = (id, values) => {
      const g = week.games.find(x => x.id === id), k = Date.parse(g.kickoff);
      return { kickoff: g.kickoff, venue: g.flags.stadium, status: 'forecast', wind: { windMph: 9, gustMph: 12, directionDeg: 180, temperatureF: 60, precipitationProbability: 10,
        forecastHour: new Date(Math.round(k / HOUR) * HOUR).toISOString(), fetchedAt: new Date(NOW - HOUR).toISOString(), ...values } };
    };
    state.wind = { loading: false, now: NOW, wind: { season: 2026, week: 6, asOf: new Date(NOW).toISOString(), games: {
      'SEA-DEN': forecast('SEA-DEN', { windMph: 21.3 }), 'NO-NYG': forecast('NO-NYG', { precipitationProbability: 80 }),
      'BUF-LV': { kickoff: week.games.find(x => x.id === 'BUF-LV').kickoff, venue: { name: 'Allegiant Stadium', city: 'Las Vegas', country: 'USA', type: 'dome' }, status: 'indoor', wind: null },
    } } };
    const html = render(<LinesBoard/>);
    expect(markupProblems(html)).toEqual([]);
    const name = id => nodes(html, n => n.tag === 'button' && n.attrs['data-game'] === id)[0].attrs['aria-label'];
    expect(name('SEA-DEN')).toContain('Kickoff weather: Windy.');
    expect(name('NO-NYG')).toMatch(/Trend: /);
    expect(name('NO-NYG')).not.toContain('Kickoff weather');
    expect(name('BUF-LV')).not.toContain('Kickoff weather');
    for (const row of nodes(html, n => n.tag === 'button' && n.attrs['data-game'])) {
      const word = row.attrs['aria-label'].match(/Kickoff weather: ([^.]+)\./)?.[1];
      if (word) expect(word).not.toMatch(/\d/);
    }
  });
```

Keep "says what is happening while the week loads…" as it is. Replace the skeleton test's card assertions with:

```jsx
    expect(status.attrs['data-skeleton']).toBe('rows');
    ...
    expect(nodes(html, attr('class', 'gx-skel-row'))).toHaveLength(4);
```

(the rest of that test, the words and the `aria-hidden` art, stays). The `describe('the game sheet pages through the
week …')` tests stay as they are: the sheet stays for the League feed (Decisions for Sean, item 9).

- [ ] **Step 6: Run the UI tests and see the board tests fail.**

Run: `npx vitest run tests/next-lines-ui.test.jsx`
Expected: FAIL in the four board tests (the h1 is "Lines"; cards, not rows).

- [ ] **Step 7: The board.** In `web/src/next/lines/LinesBoard.jsx`:
- change the header comment's last sentence to "D-69 step 3: each game is a picture row (marks, matchup, records, the
  consensus Spread over its word) that opens the game's layer; the row's spoken name keeps what the card said.";
- change the ui import to `import { Button, DESTINATION_ICONS, GateBanner, Icon, IconButton, InfoButton, MetaLine, PictureRow, Skeleton, TeamMark, useEntrance } from '../ui/index.js';`;
- add `import { boardRow } from './boardRows.js';`, `import { rememberBoard } from './boardContext.js';` and
  `import { RESEARCH_NAMES, gameRowId, openGame } from '../research/researchNav.js';`;
- delete `MarketValue`, `withRecords` (moved), `GameCard`, `TRENDS_INTRO` and the `trendsOnly` prop and every branch
  that reads it (nothing passes it: `grep -rn "trendsOnly" web/src/next/lines web/src/next/research` prints only this
  file before the change);
- delete the `openerId`/`openerScope`/`focusScope` lines (the shell returns focus to the row by its id);
- replace `Group` with:

```jsx
/** A spread row's right side: a lock while closed (never "—"), a skeleton bar while quotes load, else the quote or "—". */
function RowValue({ value }) {
  if (value.lock) return <span className="gx-l-lock" data-cell="locked"><Icon icon="lock" size={16}/></span>;
  if (value.loading) return <span className="gx-l-wait" data-cell="loading" aria-hidden="true"><span className="gx-skel-bar gx-l-wait-bar"></span></span>;
  return <span data-cell={value.line ? 'line' : 'none'}>{value.text}</span>;
}

function GameRow({ card, records, onOpen }) {
  const row = boardRow(card, records);
  return <PictureRow id={gameRowId(card.id)} data-game={card.id} ariaLabel={row.ariaLabel} onClick={onOpen}
    picture={<><TeamMark code={card.away.code} name={card.away.name} size={24} decorative/><TeamMark code={card.home.code} name={card.home.name} size={24} decorative/></>}
    title={row.title} meta={row.meta.length ? <MetaLine as="span" className="" parts={row.meta}/> : null}
    value={<RowValue value={row.value}/>} word={row.word} tone={row.tone}/>;
}

/** One kickoff group: its heading and its rows. Only the board's first list rises in (the first six units). */
function Group({ label, time, cards, season, onOpen, enter }) {
  const id = useId();
  return (
    <section className="gx-l-group" aria-labelledby={id}>
      <div className="gx-l-ghead">
        <h2 className="gx-t-section" id={id}>{label}</h2>
        {time ? <span className="gx-t-meta">{time}</span> : null}
      </div>
      <ol className="gx-prows gx-stagger" data-enter={enter} aria-labelledby={id}>
        {cards.map(card => <li key={card.id}><GameRow card={card} records={matchupRecords(season.data, card.away.code, card.home.code, season.game)} onOpen={() => onOpen(card.id)}/></li>)}
      </ol>
    </section>
  );
}
```

- in `LinesBoard()`: `const enter = useEntrance();`, `const markets = useBoardLines(lines, true);`, `const board = savedBoard ? marketBoard(savedBoard, markets) : null;`,
  `const quotes = boardQuotes(board);`, the refresh button shown whenever `board` is, and replace `open` with:

```jsx
  // The board's order and its recorded finals, as shown now, travel with the opening (in memory, for the pager).
  const open = gameId => {
    if (board && shown) rememberBoard({ accountId: app.accountId, season: shown.season, week: shown.week,
      ids: [...board.groups.flatMap(group => group.cards), ...(board.started?.cards ?? []), ...(board.finals?.cards ?? [])].map(card => card.id),
      now: markets.status === 'ready' ? markets.now : null,
      results: Object.fromEntries((board.finals?.cards ?? []).map(card => [card.id, card.final.record])) });
    openGame(shell, gameId);
  };
```

- the title: `<h1 className="gx-t-title gx-grow">{RESEARCH_NAMES.games}</h1>` with the ⓘ body `[...quotesInfo, ...INFO.trends.body]`;
- the loading skeleton: `<Skeleton label={LINES_COPY.loading} shape="rows" count={4} className="gx-l-skel"/>`;
- the groups: `board.groups.map((group, i) => <Group key={group.key} … onOpen={open} enter={i === 0 ? enter : undefined}/>)`,
  and the started and finals groups with `enter={board.groups.length ? undefined : enter}` for the started one and
  `undefined` for finals.

In `web/src/next/lines/lines.css`, delete the board card's rules, each confirmed unused first with
`grep -rn "<class>" web/src/next --include=*.jsx --include=*.js`: `.gx-l-card`, `.gx-l-chead`, `.gx-l-teams`,
`.gx-l-team`, `.gx-l-team--2`, `.gx-l-tname` (both rules), `.gx-l-rec`, `.gx-l-tag1`, `.gx-l-tag2`, `.gx-l-val` (all
three rules), `.gx-l-cfoot` (both), `.gx-l-trend` (both), `.gx-l-observation`, `.gx-l-market-label` and the narrow-phone
`@media` block that only restyles those. Keep `.gx-l-lock`, `.gx-l-wait`, `.gx-l-group`, `.gx-l-ghead` and every sheet
rule. Add:

```css
/* D-69 step 3: while the week loads, skeleton rows stand in at a picture row's height (measured in Task 9). */
.gx .gx-l-skel .gx-skel-row { min-height: 64px; }
```

- [ ] **Step 8: Run the board's tests and see them pass.**

Run: `npx vitest run tests/next-lines-ui.test.jsx tests/next-destination-icons.test.jsx && node --test tests/next-board-rows.test.mjs tests/next-tokens.test.mjs tests/next-loading.test.mjs`
Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add web/src/next/lines/boardRows.js web/src/next/lines/boardContext.js web/src/next/lines/LinesBoard.jsx web/src/next/lines/lines.css tests/next-board-rows.test.mjs tests/next-lines-ui.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/lines/LinesBoard.jsx web/src/next/lines/lines.css
git commit -m "Research › Games: the board as picture rows that open each game's layer; its title is Games" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4 · One game as a layer

### Task 4: The game layer holds the sheet's details and paging; the movement chart reveals; Trends' Game details opens it

**Files:**
- Create: `web/src/next/lines/GameLayer.jsx`, `web/src/next/lines/GamesScreen.jsx`, `tests/next-game-layer.test.jsx`
- Modify: `web/src/next/research/Research.jsx`, `web/src/next/lines/GameDetails.jsx`, `web/src/next/teams/TeamMatchup.jsx`,
  `web/src/next/lines/MarketDetails.jsx`, `web/src/next/trends/TrendLayer.jsx` (`GameDetailsButton` only),
  `web/src/next/shell/registry.jsx` (one comment), `tests/next-market-details-ui.test.jsx`

**Interfaces:**
- Consumes: `Nest`, `LayerPager`, `KeptParent`, `ChartReveal`, `useLayerFocus`, `Skeleton`, `Button` (kit);
  `gameSheet`, `LINES_COPY` (`shared/lines-view.mjs`); `openedBoardOrder`, `openedBoardResult`, `gamePager`
  (`lines/gameOrder.js`); `actionsForGame`, `GameActions`; `GameDetailsSlot`; `rememberedBoard` (Task 3);
  `researchLayerOf` (Task 2); `closeGame`, `pageGame`, `openTeam`, `gameView`, `layerTitle`, `RESEARCH_NAMES` (Task 2).
- Produces: `GameLayer({ id })` (`[data-research="game"]`, Nest `layer="game"` so paging never re-enters or refocuses),
  `GamesScreen()`; `GameDetails` and `TeamMatchup` accept `onTeam(code)`; `MarketMovement` accepts `reveal`.

- [ ] **Step 1: Write the failing tests.** Create `tests/next-game-layer.test.jsx`:

```jsx
// D-69 step 3 (spec 6, "The game layer holds the lines, the movement chart, your pick, trends and the matchup
// statistics"; spec 4.1, "Its swipe paging between games moves into the game layer"): Research › Games › one game as a
// nesting card with its own address, in place of the game sheet on this path. Fixture week (the committed Week 6
// trends file); the data hook and readers are stood in for, so nothing reaches the network.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import week from '../shared/trends/2026-week-06.json';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { gamesOf } from '../shared/lines-view.mjs';

const state = vi.hoisted(() => ({ lines: null }));
vi.mock('../web/src/next/lines/GameDetailsSlot.jsx', async () => ({ GameDetailsSlot: (await import('../web/src/next/lines/GameDetails.jsx')).default }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), linesApi: vi.fn(), communityApi: vi.fn(), betsApi: vi.fn(), readTeams: vi.fn() }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => state.lines }));
vi.mock('../web/src/next/lines/useGameLines.js', () => ({ useGameLines: () => ({ status: 'loading', data: null }), useBoardLines: () => ({ status: 'loading', data: null, reload: vi.fn() }) }));
vi.mock('../web/src/next/research/useResearch.js', async importOriginal => ({ ...(await importOriginal()), useResearch: () => ({ status: 'loading', data: null, reload: () => {} }) }));
vi.mock('../web/src/next/lines/trendsHooks.js', () => ({ useOfficials: () => null, useWind: () => ({ loading: false, wind: null, now: null }), useTrendWeek: () => ({ status: 'ready', week }) }));

const { ShellContext } = await import('../web/src/next/shell/context.js');
const { GameLayer } = await import('../web/src/next/lines/GameLayer.jsx');
const { GamesScreen } = await import('../web/src/next/lines/GamesScreen.jsx');
const { rememberBoard } = await import('../web/src/next/lines/boardContext.js');

const GAMES = week.games.map(g => ({ id: g.id, away: g.away, home: g.home, awayCode: g.away, homeCode: g.home, kickoff: g.kickoff }));
const NOW = Date.parse(week.games[0].kickoff) - 24 * 3_600_000;
const personal = { season: 2026, week: 6, now: new Date(NOW).toISOString(), deadline: week.games[0].kickoff, games: GAMES,
  rules: { sentFinal: false, lateWindow: 'deadline', revealAt: 'deadline' }, ballots: { guess_spread: { picks: { 'SEA-DEN': 4 } }, guess_total: { picks: {} } } };
const lines = (patch = {}) => ({ app: { accountId: 'fixture-account', refresh: vi.fn(), requestSignIn: vi.fn() }, personal: { status: 'ready', data: personal, error: null },
  community: { week: { season: 2026, week: 6 }, optOuts: [] }, shown: { season: 2026, week: 6 }, trends: { status: 'ready', week }, trendsWeek: week, records: null, ...patch });
const shellOf = views => ({ state: { tab: 'research', views: { research: { section: 'games' }, lines: {}, ...views }, sheets: [] },
  setView: vi.fn(), go: vi.fn(), openSheet: vi.fn(), setDirty: vi.fn(), confirmLeave: vi.fn(() => true), reload: vi.fn() });
const render = (node, shell = shellOf({})) => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const byClass = (html, cls) => nodes(html).filter(n => (n.attrs?.class ?? '').split(/\s+/).includes(cls));

afterEach(() => { state.lines = null; rememberBoard(null); });

describe('the game layer', () => {
  const order = gamesOf(personal);
  const titleOf = g => `${g.away} @ ${g.home}`;
  it('one nesting card under a Games lip: the page title, the game’s heading, its place and both neighbours, the details', () => {
    state.lines = lines();
    const html = render(<GameLayer id={order[1].id}/>);
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html).filter(n => n.attrs?.['data-research'] === 'game')).toHaveLength(1);
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Games']);
    const heading = nodes(html).find(n => n.tag === 'h2' && n.attrs['data-route-focus'] !== undefined);
    expect(textOf(heading)).toBe(titleOf(order[1]));
    expect(byClass(html, 'gx-nest-lip').map(nameFrom)).toEqual(['Back to Games']);
    expect(textOf(nodes(html).find(n => n.attrs?.['aria-live'] === 'polite'))).toBe(`${titleOf(order[1])}, game 2 of ${order.length}`);
    expect(byClass(html, 'gx-sheet-page').map(n => n.attrs['aria-label'])).toEqual([`Previous game, ${titleOf(order[0])}`, `Next game, ${titleOf(order[2])}`]);
    expect(byClass(html, 'gx-pager-body')[0].attrs.class).toContain('gx-sheet-body--pager');
    // What the sheet held: the market lines, your pick, the trends and the matchup statistics, and both teams as buttons.
    // (The lazy slot is stood in for by GameDetails itself here; its "Game details" region is the browser spec's.)
    expect(nodes(html).some(n => n.attrs?.['aria-label'] === 'Market lines')).toBe(true);
    expect(nodes(html).some(n => n.attrs?.['aria-label'] === 'You on this game')).toBe(true);
    expect(textOf(nodes(html).find(n => n.attrs?.['data-section'] === 'trends'))).toContain('Trends');
    expect(nodes(html).filter(n => n.tag === 'button' && /Open team$/.test(n.attrs['aria-label'] ?? ''))).toHaveLength(2);
    expect(html).toContain('Bet assessments and statistics');
  });
  it('the pager follows the board order captured when the row opened it, for that account and week only', () => {
    state.lines = lines();
    const shown = [order[2].id, order[0].id, ...order.filter((_, i) => i !== 0 && i !== 2).map(g => g.id)];
    rememberBoard({ accountId: 'fixture-account', season: 2026, week: 6, ids: shown, now: NOW, results: {} });
    expect(textOf(nodes(render(<GameLayer id={order[0].id}/>)).find(n => n.attrs?.['aria-live'] === 'polite'))).toMatch(/game 2 of/);
    rememberBoard({ accountId: 'someone-else', season: 2026, week: 6, ids: shown, now: NOW, results: {} });
    expect(textOf(nodes(render(<GameLayer id={order[0].id}/>)).find(n => n.attrs?.['aria-live'] === 'polite'))).toMatch(/game 1 of/);
  });
  it('while the week loads the heading is the game from its address; a game not on this board says so, with the lip back', () => {
    state.lines = lines({ personal: { status: 'loading', data: null, error: null } });
    const loading = render(<GameLayer id="SEA-DEN"/>);
    expect(markupProblems(loading)).toEqual([]);
    expect(textOf(nodes(loading).find(n => n.tag === 'h2'))).toBe('SEA @ DEN');
    expect(nodes(loading).some(n => n.attrs?.['data-skeleton'] === 'panels')).toBe(true);
    state.lines = lines();
    const missing = render(<GameLayer id="XX-YY"/>);
    expect(missing).toContain('This game isn’t on this week’s board.');
    expect(byClass(missing, 'gx-nest-lip').map(nameFrom)).toEqual(['Back to Games']);
    expect(byClass(missing, 'gx-sheet-page')).toHaveLength(0);
  });
  it('Research › Games draws the layer first and keeps the board mounted under it, hidden', () => {
    state.lines = lines();
    const html = render(<GamesScreen/>, shellOf({ lines: { layer: 'game', item: 'SEA-DEN' } }));
    const [kept] = byClass(html, 'gx-kept');
    expect(kept.attrs.hidden).toBe('');
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Games', 'Games']);
    expect(html.indexOf('data-research="game"')).toBeLessThan(html.indexOf('gx-kept'));
    expect(byClass(render(<GamesScreen/>, shellOf({ lines: { layer: 'nope', item: 'SEA-DEN' } })), 'gx-kept')[0].attrs.hidden).toBeUndefined();
  });
});
```

Append to `tests/next-market-details-ui.test.jsx`:

```jsx
it('D-69 step 3: the movement chart reveals on its disclosure’s first opening, inside its plot, never at mount', () => {
  const rows = [41.5, 42, 43].map((value, i) => ({ value, capturedAt: new Date(now + i * 60000).toISOString() }));
  const played = render(<MarketMovement game={game} market="total" rows={rows} reveal/>);
  expect(markupProblems(played)).toEqual([]);
  expect(played).toMatch(/<div class="gx-md-plot"[^>]*><span class="gx-reveal" data-reveal="in"><span class="gx-reveal-in"><svg /);
  expect(render(<MarketMovement game={game} market="total" rows={rows}/>)).not.toContain('data-reveal');
  const panel = render(<MarketPanel game={game} market="total" now={now} cell={{ visible: true, line: { value: 43, observedAt: new Date(now).toISOString() }, books: [], movement: rows }}/>);
  expect(panel).toContain('Line movement');
  expect(panel).not.toContain('data-reveal');
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `npx vitest run tests/next-game-layer.test.jsx tests/next-market-details-ui.test.jsx`
Expected: FAIL (`Cannot find module …/lines/GameLayer.jsx`; the reveal test finds no `gx-reveal`).

- [ ] **Step 3: The layer.** Create `web/src/next/lines/GameLayer.jsx`:

```jsx
// D-69 step 3: Research › Games › one game, a nesting card under the Games lip with its own address
// (`#research/games?layer=game&item=SEA-DEN`), in place of the game sheet on Research's paths (spec 4.1). It holds what
// the sheet held, unchanged (lines-view gameSheet and GameDetails: the market lines with the movement chart, your pick,
// everyone's guesses, weather, the trends and the matchup statistics, the referee, your private note, the game's
// actions) and the sheet's paging (LayerPager: the same swipe, the same buttons, the same board-order snapshot). Paging
// swaps the game in place, so the Nest's layer stays "game" (no new entrance, no focus jump) and Back lands on the board.
// A team opens Research › Teams › that team. The game sheet stays for the League feed's kickoff rows (feed/PostCard.jsx).
import { useMemo, useRef } from 'react';
import { LINES_COPY, gameSheet } from '../../../../shared/lines-view.mjs';
import { useShell } from '../shell/context.js';
import { Button, LayerPager, Nest, Skeleton, useLayerFocus } from '../ui/index.js';
import { RESEARCH_NAMES, closeGame, layerTitle, openTeam, pageGame } from '../research/researchNav.js';
import { actionsForGame, GameActions } from './GameActions.jsx';
import { gamePager, openedBoardOrder, openedBoardResult } from './gameOrder.js';
import { GameDetailsSlot } from './GameDetailsSlot.jsx';
import { rememberedBoard } from './boardContext.js';
import { useLinesData } from './linesData.js';
import './lines.css';

function Waiting({ personal, onRetry }) {
  if (personal.status === 'error' && personal.error?.status === 404) return <p className="gx-t-body gx-c-2" role="status">{LINES_COPY.unpublished}</p>;
  if (personal.status === 'error') return <div className="gx-vstack gx-gap-8" role="alert"><p className="gx-t-body">{LINES_COPY.failed}</p>
    <Button variant="secondary" onClick={onRetry}>{LINES_COPY.tryAgain}</Button></div>;
  return <Skeleton label={LINES_COPY.loading} shape="panels" count={3}/>;
}

export function GameLayer({ id }) {
  const shell = useShell(), lines = useLinesData(), root = useRef(null);
  const { app, personal, community, trends, trendsWeek, records, shown } = lines;
  useLayerFocus(root);
  const view = useMemo(() => (personal.data ? gameSheet({ personal: personal.data, community, trends: trendsWeek, trendsStatus: trends.status, records, gameId: id }) : null),
    [personal.data, community, trendsWeek, trends.status, records, id]);
  const context = rememberedBoard();
  const order = useMemo(() => openedBoardOrder(personal.data, app.accountId, context), [personal.data, app.accountId, context]);
  const result = openedBoardResult(personal.data, app.accountId, context, id);
  const title = view?.title ?? layerTitle(id);
  const place = view ? gamePager(order, view.id) : null;
  const pager = place ? { ...place, onMove: step => {
    const target = step < 0 ? place.prev : place.next;
    if (target && shell.confirmLeave()) pageGame(shell, target);
  } } : null;
  const actionGame = view ? { ...view, season: shown?.season, week: shown?.week } : null;
  const actions = actionGame ? actionsForGame(actionGame, { accountId: app.accountId, personal: personal.data }) : [];
  const lips = [{ key: 'games', label: RESEARCH_NAMES.games, onOpen: () => closeGame(shell) }];
  return <div ref={root} className="gx-screen" data-research="game" data-game-layer={id}>
    <h1 className="gx-t-title">{RESEARCH_NAMES.games}</h1>
    <Nest label={title} lips={lips} layer="game" title={title}>
      {!personal.data ? <Waiting personal={personal} onRetry={() => app.refresh({ only: ['personal'] })}/>
        : !view ? <p className="gx-t-body gx-c-2" role="status">{LINES_COPY.notOnBoard}</p>
        : <LayerPager title={view.title} pager={pager} page={view.id}>
            <GameDetailsSlot lines={lines} view={view} result={result} onTeam={code => openTeam(shell, code)}/>
            {actions.length ? <GameActions game={actionGame} actions={actions} shell={shell}/> : null}
          </LayerPager>}
    </Nest>
  </div>;
}
```

Create `web/src/next/lines/GamesScreen.jsx`:

```jsx
// Research › Games (D-69 step 3): the board, and one game as its own layer over it. The board stays mounted under the
// layer (KeptParent), as it stayed under the game sheet: no second read of the week's lines on Back, its scroll kept,
// and the shell returns focus to the row that opened the game.
import { researchLayerOf } from '../shell/state.js';
import { useShell } from '../shell/context.js';
import { KeptParent } from '../ui/index.js';
import { GameLayer } from './GameLayer.jsx';
import { LinesBoard } from './LinesBoard.jsx';

export function GamesScreen() {
  const open = researchLayerOf('games', useShell().state.views.lines);
  return <KeptParent layer={open ? <GameLayer id={open.item}/> : null}><LinesBoard/></KeptParent>;
}
```

In `web/src/next/research/Research.jsx`, import `GamesScreen` from `../lines/GamesScreen.jsx` in place of `LinesBoard`
and return `<GamesScreen/>` for `section === 'games'`.

- [ ] **Step 4: Teams from the layer, the chart reveal, and Trends' Game details.**

In `web/src/next/teams/TeamMatchup.jsx`, add `onTeam = null` to the props and use it:

```jsx
export function TeamMatchup({ away, home, season = null, size = 48, layout = 'stack', from = null, onTeam = null, as: Heading = null, className, headingClassName }) {
  const shell = useShell();
  const { data } = useTeamSeason();
  const records = matchupRecords(data, away, home, season);
  // D-69 step 3: inside Research a team opens its own layer (`onTeam`); elsewhere (Play's picks) its sheet.
  const open = onTeam ?? (code => shell.openSheet('sh.team', from ? { team: code, from } : { team: code }));
```

In `web/src/next/lines/GameDetails.jsx`, change the signature to `export default function GameDetails({ lines, view, result, onTeam = null })`
and pass it on: `<TeamMatchup away={view.away.code} home={view.home.code} season={shown?.season ?? null} from={view.title} onTeam={onTeam}/>`.

In `web/src/next/lines/MarketDetails.jsx`: import `ChartReveal` beside the other kit imports; change
`export function MarketMovement({ rows, game, market })` to `({ rows, game, market, reveal = false })` and wrap the
`<svg …>…</svg>` inside `.gx-md-plot` with `<ChartReveal play={reveal}>…</ChartReveal>`; in `MarketPanel`, add
`const [opened, setOpened] = useState(false);` and change the Line movement disclosure to:

```jsx
    {/* D-69 step 3: the movement chart reveals left to right on this disclosure's first opening in this game. */}
    <details className="gx-md-disclosure" onToggle={event => { if (event.currentTarget.open) setOpened(true); }}><summary><span>Line movement</span><Icon icon="chevronDown" size={16}/></summary>
      <MarketMovement rows={cell.movement ?? []} game={game} market={market} reveal={opened}/></details>
```

In `web/src/next/trends/TrendLayer.jsx`, import `gameView` from `../research/researchNav.js` and replace
`GameDetailsButton` with:

```jsx
/** The game's own layer in Research › Games (D-69 step 3), one tap from a game's trends; Back returns here. */
export function GameDetailsButton({ view }) {
  const shell = useShell();
  return <Button variant="secondary" onClick={() => shell.go('research', gameView(view.id))}>Game details · {view.title}</Button>;
}
```

In `web/src/next/shell/registry.jsx`, change the `sh.game` comment to
`// lines (stage 13): one game, read-only; since D-69 step 3 only the League feed's kickoff rows open it (Research opens the game layer)`.

- [ ] **Step 5: Run them and see them pass, with every test that draws the details.**

Run: `npx vitest run tests/next-game-layer.test.jsx tests/next-market-details-ui.test.jsx tests/next-lines-ui.test.jsx tests/next-teams.test.jsx tests/next-trends-nest.test.jsx tests/next-trends-ui.test.jsx tests/next-research-ui.test.jsx && node --test tests/next-app-view.test.mjs tests/next-parse.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add web/src/next/lines/GameLayer.jsx web/src/next/lines/GamesScreen.jsx web/src/next/research/Research.jsx web/src/next/lines/GameDetails.jsx web/src/next/teams/TeamMatchup.jsx web/src/next/lines/MarketDetails.jsx web/src/next/trends/TrendLayer.jsx web/src/next/shell/registry.jsx tests/next-game-layer.test.jsx tests/next-market-details-ui.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/lines/GameLayer.jsx web/src/next/lines/MarketDetails.jsx web/src/next/trends/TrendLayer.jsx
git commit -m "One game is a layer: the sheet's details and paging in a nesting card; the movement chart reveals" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5 · Research › Teams

### Task 5: Every team as a picture row, one team as a layer with its mark, record and margin chart

**Files:**
- Create: `web/src/next/teams/TeamsScreen.jsx`, `web/src/next/teams/TeamLayer.jsx`, `web/src/next/teams/TeamViewSlot.jsx`
- Modify: `web/src/next/teams/teamModel.js`, `teams/TeamSheet.jsx`, `teams/TeamView.jsx`, `teams/MarginChart.jsx`,
  `web/src/next/research/Research.jsx`, `tests/next-teams.test.jsx`

**Interfaces:**
- Consumes: `PictureRow`, `KeptParent`, `Nest`, `ChartReveal`, `useEntrance`, `useLayerFocus`, `TeamMark`, `MetaLine`,
  `teamName`, `teamRecordText` (kit); `useTeamSeason` (`teams/teamsData.js`); `researchLayerOf`, `openTeam`,
  `closeTeam`, `teamRowId`, `RESEARCH_NAMES` (Task 2); `hasNavigated` (`moments/launch.js`).
- Produces: `teamRows(season)` → `[{ code, name, record, word, tone, meta, ariaLabel }]` by full name;
  `TeamsScreen()` (`[data-research="teams"]`, rows `button.gx-prow[data-team]`, ids `gx-r-team-<CODE>`);
  `TeamLayer({ code, status, season, onClose })` (`[data-research="team"]`); `TeamViewSlot({ status, season, code })`
  (the lazy `TeamView` chunk, its region "Team details" and its retry; shared with `TeamSheet`); `MarginChart` and
  `TeamView` accept nothing new from callers (`TeamView` decides the reveal itself).

- [ ] **Step 1: Write the failing tests.** In `tests/next-teams.test.jsx`, add after the existing imports:

```jsx
const { TeamsScreen } = await import('../web/src/next/teams/TeamsScreen.jsx');
const { TeamLayer } = await import('../web/src/next/teams/TeamLayer.jsx');
```

and append:

```jsx
describe('D-69 step 3: Research › Teams', () => {
  const shellOf = research => ({ state: { tab: 'research', views: { research: { section: 'teams', ...research }, lines: {} }, sheets: [] }, setView: vi.fn(), go: vi.fn(), openSheet: vi.fn() });
  const draw = (node, shell) => renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx">{node}</div></ShellContext.Provider>);
  const all = html => [...walk(parseMarkup(html))];
  const text = n => (n.text ?? (n.children ?? []).map(text).join(''));

  it('teamRows: every team by full name, its record the row’s number, the last final its word (a loss plain), the next game its meta', () => {
    const final = (week, pf, pa, opponent, home) => ({ week, gameId: '', opponent, home, neutral: false, kickoff: '2026-09-13T20:00:00Z', final: true, pf, pa, result: pf > pa ? 'W' : pf < pa ? 'L' : 'T' });
    const season = { season: 2026, throughWeek: 2, fallback: false, teams: {
      SEA: { overall: { w: 1, l: 1, t: 0 }, home: null, road: null, pointsFor: 41, pointsAgainst: 37, games: [final(1, 24, 17, 'DEN', true), final(2, 17, 20, 'LA', false),
        { week: 3, gameId: '', opponent: 'ARI', home: true, neutral: false, kickoff: '2026-09-27T20:05:00Z', final: false, pf: null, pa: null, result: null }] },
      ARI: { overall: { w: 2, l: 0, t: 0 }, home: null, road: null, pointsFor: 50, pointsAgainst: 20, games: [final(2, 30, 10, 'SF', true)] } } };
    const rows = model.teamRows(season);
    expect(rows.map(r => r.code)).toEqual(['ARI', 'SEA']);
    const sea = rows.find(r => r.code === 'SEA');
    expect([sea.name, sea.record, sea.word, sea.tone, sea.meta]).toEqual(['Seattle Seahawks', '1–1', 'Lost last', 'plain', 'Next vs ARI']);
    expect(sea.ariaLabel).toBe('Seattle Seahawks, 1–1, lost 17–20 @ LA in Week 2, next vs ARI. Open team');
    expect(rows.find(r => r.code === 'ARI')).toMatchObject({ word: 'Won last', tone: 'good', meta: null });
    // The bundled records alone: the record and nothing else.
    const bundledRows = model.teamRows(fallbackTeamSeason());
    expect(bundledRows).toHaveLength(32);
    expect(bundledRows.every(r => r.word === null && r.meta === null)).toBe(true);
  });

  it('the list: 32 picture rows on the bundled records (it never waits for the read), each with its id, mark and record', () => {
    const html = draw(<TeamsScreen/>, shellOf({}));
    expect(markupProblems(html)).toEqual([]);
    const rows = all(html).filter(n => n.tag === 'button' && n.attrs['data-team']);
    expect(rows).toHaveLength(32);
    for (const row of rows) expect(row.attrs.id).toBe(`gx-r-team-${row.attrs['data-team']}`);
    expect(all(html).filter(n => n.tag === 'h1').map(text)).toEqual(['Teams']);
    expect(all(html).filter(n => (n.attrs?.class ?? '').includes('gx-kept'))[0].attrs.hidden).toBeUndefined();
  });

  it('one team: a Teams lip, its heading, the lazy team view’s region; the list stays mounted under it, hidden', () => {
    const html = draw(<TeamsScreen/>, shellOf({ layer: 'team', item: 'SEA' }));
    expect(markupProblems(html)).toEqual([]);
    const layer = all(html).find(n => n.attrs?.['data-research'] === 'team');
    expect(layer.attrs['data-team']).toBe('SEA');
    expect(text([...walk(layer)].find(n => n.tag === 'h2'))).toBe('Seattle Seahawks');
    expect([...walk(layer)].filter(n => (n.attrs?.class ?? '').includes('gx-nest-lip')).map(nameFrom)).toEqual(['Back to Teams']);
    expect([...walk(layer)].some(n => n.attrs?.role === 'group' && n.attrs['aria-label'] === 'Team details')).toBe(true);
    expect(all(html).find(n => (n.attrs?.class ?? '').includes('gx-kept')).attrs.hidden).toBe('');
    expect(draw(<TeamsScreen/>, shellOf({ layer: 'team', item: 'ZZZ' }))).not.toContain('data-research="team"');
  });

  it('the margin chart reveals only when its view mounts after a navigation', async () => {
    const { markNavigated, markSettled, resetLaunch } = await import('../web/src/next/moments/launch.js');
    expect(renderToStaticMarkup(<div className="gx"><TeamView season={live()} code="SEA"/></div>)).not.toContain('data-reveal');
    markSettled(); markNavigated();
    try {
      expect(renderToStaticMarkup(<div className="gx"><TeamView season={live()} code="SEA"/></div>)).toMatch(/class="gx-team-plot"[^>]*><span class="gx-reveal" data-reveal="in">/);
    } finally { resetLaunch(); }
  });
});
```

Add `nameFrom` to the file's `./helpers/ui-markup.mjs` import. `live()` is the file's existing season built from its
`/lines/teams` reply fixture (SEA with six finals).

- [ ] **Step 2: Run them and see them fail.**

Run: `npx vitest run tests/next-teams.test.jsx`
Expected: FAIL (`Cannot find module …/teams/TeamsScreen.jsx`).

- [ ] **Step 3: The rows.** Append to `web/src/next/teams/teamModel.js`:

```js
const LAST = Object.freeze({ W: Object.freeze({ word: 'Won last', tone: 'good' }), L: Object.freeze({ word: 'Lost last', tone: 'plain' }), T: Object.freeze({ word: 'Tied last', tone: 'plain' }) });

/**
 * Research › Teams (D-69 step 3): every team in the season as a picture row, by full name: `{ code, name, record, word,
 * tone, meta, ariaLabel }`. The record is the row's one number; its word is the last final ("Won last"; a loss stays
 * plain, D-58: losses are quiet); the meta line is the next game ("Next @ DEN"). The bundled records give the record only.
 */
export function teamRows(season) {
  return Object.keys(season?.teams ?? {}).map(code => {
    const team = teamOf(season, code), name = teamName(code), record = teamRecordText(team?.overall);
    const last = finals(team).at(-1) ?? null, next = nextGame(team);
    const said = [name, record ?? 'no record', last ? `${RESULTS[last.result].verb} ${scoreText(last)} ${whereText(last)} in Week ${last.week}` : null, next ? `next ${whereText(next)}` : null];
    return { code, name, record: record ?? '—', word: last ? LAST[last.result].word : null, tone: last ? LAST[last.result].tone : 'plain',
      meta: next ? `Next ${whereText(next)}` : null, ariaLabel: `${said.filter(Boolean).join(', ')}. Open team` };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: The slot, the layer and the list.** Create `web/src/next/teams/TeamViewSlot.jsx`:

```jsx
// The team view's lazy chunk (TeamView-*.js) behind one boundary with a local retry, shared by the team sheet (Play's
// picks) and Research's team layer (D-69 step 3), so both keep loading the details only on opening.
import { lazy, Suspense, useRef, useState } from 'react';
import { Button, Skeleton } from '../ui/index.js';
import { Boundary } from '../shell/Boundary.jsx';
import { retryViewImport } from '../ui/retryViewImport.js';

const importView = retryViewImport(() => import('./TeamView.jsx'));
const loadView = () => lazy(importView);
const loading = <Skeleton label="Loading team record…" shape="panels" count={3}/>;

export function TeamViewSlot({ status, season, code }) {
  const [View, setView] = useState(loadView), [attempt, setAttempt] = useState(0);
  const region = useRef(null);
  const retry = () => {
    region.current?.focus({ preventScroll: true });
    setView(loadView); setAttempt(n => n + 1);
  };
  return <div ref={region} role="group" aria-label="Team details" tabIndex={-1}>
    <Boundary key={attempt} fallback={() => <div className="gx-vstack gx-gap-8" role="alert">
      <p className="gx-t-body">Team details couldn’t load. Check your connection and try again.</p>
      <Button variant="secondary" onClick={retry}>Try team details again</Button>
    </div>}>
      {status === 'loading' ? loading : <Suspense fallback={loading}><View season={season} code={code}/></Suspense>}
    </Boundary>
  </div>;
}
```

Replace the body of `web/src/next/teams/TeamSheet.jsx` below its header comment with:

```jsx
import { useShell } from '../shell/context.js';
import { Sheet, teamCode, teamName } from '../ui/index.js';
import { useTeamSeason } from './teamsData.js';
import { TeamViewSlot } from './TeamViewSlot.jsx';

export function TeamSheet({ args }) {
  const shell = useShell();
  const { status, data } = useTeamSeason();
  const code = teamCode(args?.team), name = code === '—' ? 'Team' : teamName(code);
  const back = typeof args?.from === 'string' && args.from ? { label: args.from, onBack: shell.closeSheet } : undefined;
  return (
    <Sheet title={name} back={back} onClose={shell.closeSheet} closeLabel={`Close ${name}`} tall className="gx-team-sheet">
      <TeamViewSlot status={status} season={data} code={code}/>
    </Sheet>
  );
}
```

Create `web/src/next/teams/TeamLayer.jsx`:

```jsx
// D-69 step 3 (spec 6, "the Team sheet becomes a layer, with the mark, record and margin chart"): Research › Teams › one
// team as a nesting card under the Teams lip, with its own address (`#research/teams?layer=team&item=SEA`). Its body is
// the team sheet's view (TeamViewSlot: the lazy TeamView chunk, its retry). Play's pick cards keep the sheet.
import { useRef } from 'react';
import { Nest, teamName, useLayerFocus } from '../ui/index.js';
import { RESEARCH_NAMES } from '../research/researchNav.js';
import { TeamViewSlot } from './TeamViewSlot.jsx';

export function TeamLayer({ code, status, season, onClose }) {
  const root = useRef(null);
  useLayerFocus(root);
  const name = teamName(code);
  return <div ref={root} className="gx-screen" data-research="team" data-team={code}>
    <h1 className="gx-t-title">{RESEARCH_NAMES.teams}</h1>
    <Nest label={name} lips={[{ key: 'teams', label: RESEARCH_NAMES.teams, onOpen: onClose }]} layer={`team:${code}`} title={name}>
      <TeamViewSlot status={status} season={season} code={code}/>
    </Nest>
  </div>;
}
```

Create `web/src/next/teams/TeamsScreen.jsx`:

```jsx
// Research › Teams (D-69 step 3): every team as a picture row (its mark, its name, the next game, the record over the
// last result) and one team as its own layer. The list stays mounted under the layer (KeptParent). Records come from
// the shared team read (teamsData.js), the bundled file standing in until it answers, so the list never waits.
import { researchLayerOf } from '../shell/state.js';
import { useShell } from '../shell/context.js';
import { KeptParent, MetaLine, PictureRow, TeamMark, useEntrance } from '../ui/index.js';
import { RESEARCH_NAMES, closeTeam, openTeam, teamRowId } from '../research/researchNav.js';
import { TeamLayer } from './TeamLayer.jsx';
import { teamRows, throughText } from './teamModel.js';
import { useTeamSeason } from './teamsData.js';
import './teams.css';

export function TeamsScreen() {
  const shell = useShell(), enter = useEntrance();
  const { status, data } = useTeamSeason();
  const open = researchLayerOf('teams', shell.state.views.research);
  const layer = open ? <TeamLayer code={open.item} status={status} season={data} onClose={() => closeTeam(shell)}/> : null;
  return <KeptParent layer={layer}>
    <div className="gx-screen" data-research="teams">
      <div className="gx-vstack gx-gap-2"><h1 className="gx-t-title">{RESEARCH_NAMES.teams}</h1><MetaLine parts={[throughText(data)]}/></div>
      <ol className="gx-prows gx-stagger" data-enter={enter} aria-label={RESEARCH_NAMES.teams}>
        {teamRows(data).map(row => <li key={row.code}><PictureRow id={teamRowId(row.code)} data-team={row.code}
          picture={<TeamMark code={row.code} name={row.name} size={32} decorative/>} title={row.name} meta={row.meta}
          value={row.record} word={row.word} tone={row.tone} ariaLabel={row.ariaLabel} onClick={() => openTeam(shell, row.code)}/></li>)}
      </ol>
    </div>
  </KeptParent>;
}
```

In `web/src/next/research/Research.jsx`, import `TeamsScreen` from `../teams/TeamsScreen.jsx` and return `<TeamsScreen/>`
for `section === 'teams'`.

- [ ] **Step 5: The margin chart reveal.** In `web/src/next/teams/TeamView.jsx`, import `useState` beside `useId` and
`hasNavigated` from `../moments/launch.js`; in `TeamView`, add `const [reveal] = useState(() => hasNavigated()); // a tap opened it; never on a load`
and pass `reveal={reveal}` to `<MarginChart …/>`. In `web/src/next/teams/MarginChart.jsx`, import `ChartReveal` from
`../ui/ChartReveal.jsx`, add `reveal = false` to the props and wrap the `<svg className="gx-team-svg" …>…</svg>` inside
`.gx-team-plot` with `<ChartReveal play={reveal}>…</ChartReveal>`.

- [ ] **Step 6: Run them and see them pass.**

Run: `npx vitest run tests/next-teams.test.jsx tests/next-game-layer.test.jsx tests/next-lines-ui.test.jsx && node --test tests/next-router.test.mjs tests/next-tokens.test.mjs`
Expected: PASS (the existing "registered as a sheet layer" test still finds `TeamSheet` in the registry).

- [ ] **Step 7: Commit.**

```bash
git add web/src/next/teams/TeamsScreen.jsx web/src/next/teams/TeamLayer.jsx web/src/next/teams/TeamViewSlot.jsx web/src/next/teams/teamModel.js web/src/next/teams/TeamSheet.jsx web/src/next/teams/TeamView.jsx web/src/next/teams/MarginChart.jsx web/src/next/research/Research.jsx tests/next-teams.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/teams/TeamSheet.jsx web/src/next/teams/TeamView.jsx web/src/next/teams/MarginChart.jsx web/src/next/teams/teamModel.js
git commit -m "Research › Teams: every team as a picture row, one team as a layer; the margin chart reveals" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6 · The landing

### Task 6: The next-move card (this week's games and lines) and four tiles

**Files:**
- Create: `web/src/next/research/researchModel.js`, `web/src/next/research/ResearchLanding.jsx`,
  `web/src/next/research/landing.css`, `tests/next-research-landing.test.mjs`, `tests/next-research-landing-ui.test.jsx`
- Modify: `web/src/next/research/Research.jsx`, `tests/next-destination-icons.test.jsx`

**Interfaces:**
- Consumes: `homeHero` (`shared/home-view.mjs`, for the server clock), `TEAM_NAMES`, `trendsTile` (`home/homeModel.js`),
  `useSavedTrends` (`trends/builderData.js`), `useServerNow` (`home/useServerNow.js`), `Card`, `Meter`, `Tile`,
  `TeamMark`, `Skeleton`, `Button`, `useEntrance` (kit), `RESEARCH_NAMES`, `openSection`, `tileId` (Task 2).
- Produces: `RESEARCH_TILES`, `RESEARCH_TILE_ICONS`, `LANDING_COPY`, `weekGamesOf(community)`, `researchClock(community)`
  → ms | null, `lastKickoffOf(community)` → ms | null, `researchHero(community, now)` → `{ kind: 'week'|'played'|'none',
  week, eyebrow, title, meter: { done, of } | null, line, action, target }`, `researchTiles({ community, now, saved })` →
  `[{ key, label, icon, next, big, sub, ariaLabel, open }]`; `ResearchLanding()`.

- [ ] **Step 1: Write the failing model test.** Create `tests/next-research-landing.test.mjs`:

```js
// D-69 step 3 (spec 5A, "Next move + tiles"): Research's landing as plain data. Contracts: the first card is this week's
// games and lines while a game is still to kick off, the latest week's results once all have, and a plain card with no
// week; "kicked off" follows the server's clock only; four tiles in order, none of them NEW; no line, pick or market
// ever reaches the landing (D-31); and no surface line runs over twelve words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RESEARCH_TILES, lastKickoffOf, researchClock, researchHero, researchTiles, weekGamesOf } from '../web/src/next/research/researchModel.js';
import { trendsTile } from '../web/src/next/home/homeModel.js';

const GAMES = [
  { id: 'KC-BUF', awayCode: 'KC', homeCode: 'BUF', away: 'Kansas City Chiefs', home: 'Buffalo Bills', kickoff: '2026-11-08T21:25:00Z', line: -2.5 },
  { id: 'DAL-NYG', awayCode: 'DAL', homeCode: 'NYG', away: 'Dallas Cowboys', home: 'New York Giants', kickoff: '2026-11-06T01:15:00Z' },
  { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: '2026-11-08T18:00:00Z' },
];
const community = (now = '2026-11-08T19:00:00Z', week = 9) => ({ week: { season: 2026, week, deadline: GAMES[1].kickoff, games: GAMES },
  picksDue: { state: 'due', week, now }, picks: { 'SEA-DEN': -3 }, ballots: { guess_spread: { picks: { 'SEA-DEN': -3 } } } });
const ms = value => Date.parse(value);
const words = text => String(text).trim().split(/\s+/).length;

test('the week’s games in kickoff order, the server’s clock and the last kickoff, from the Community read only', () => {
  assert.deepEqual(weekGamesOf(community()).map(g => g.id), ['DAL-NYG', 'SEA-DEN', 'KC-BUF']);
  assert.equal(researchClock(community()), ms('2026-11-08T19:00:00Z'));
  assert.equal(researchClock({ week: community().week }), null, 'never the device clock');
  assert.equal(lastKickoffOf(community()), ms('2026-11-08T21:25:00Z'));
  assert.equal(lastKickoffOf(null), null);
});

test('the first card while games are left: the slate, the week meter and how many kicked off; the one lime button opens the games', () => {
  const hero = researchHero(community(), ms('2026-11-08T19:00:00Z'));
  assert.deepEqual(hero, { kind: 'week', week: 9, eyebrow: 'Week 9 · This week’s lines', title: '3 games', meter: { done: 2, of: 3 },
    line: '2 of 3 kicked off', action: 'Open games', target: 'games' });
  assert.equal(researchHero(community(), ms('2026-11-04T12:00:00Z')).line, '0 of 3 kicked off');
  assert.equal(researchHero(community(), null).meter.done, 0, 'without the server’s clock nothing counts as kicked off');
});

test('once every game kicked off it is the week’s results; with no week a plain card that opens Trends', () => {
  assert.deepEqual(researchHero(community(), ms('2026-11-09T02:00:00Z')), { kind: 'played', week: 9, eyebrow: 'Week 9 · Results', title: 'Week 9 results',
    meter: { done: 3, of: 3 }, line: 'All 3 games kicked off', action: 'See results', target: 'games' });
  for (const none of [null, { week: null }, { week: { season: 2026, week: 9, games: [] } }]) {
    assert.deepEqual(researchHero(none, null), { kind: 'none', week: none?.week?.week ?? null, eyebrow: 'Research', title: 'No week is open yet', meter: null,
      line: 'Trends, teams and Fantasy are still here.', action: 'Open trends', target: 'trends' });
  }
});

test('four tiles in order: the next game, Home’s saved-trends tile, Fantasy and Teams; none is NEW', () => {
  const tiles = researchTiles({ community: community(), now: ms('2026-11-08T19:00:00Z'), saved: [] });
  assert.deepEqual(tiles.map(t => t.key), RESEARCH_TILES);
  assert.deepEqual(tiles.map(t => t.label), ['Games', 'Trends', 'Fantasy', 'Teams']);
  const [games, trends, fantasy, teams] = tiles;
  assert.deepEqual([games.big, games.sub, games.ariaLabel, games.next.id], ['1:25 PM', 'Sun · next game', 'Games, next game KC at BUF, Sun 1:25 PM PT', 'KC-BUF']);
  assert.deepEqual([trends.big, trends.sub, trends.ariaLabel, trends.open], [trendsTile([]).big, trendsTile([]).sub, trendsTile([]).ariaLabel, trendsTile([]).open]);
  assert.equal(researchTiles({ community: community(), now: null, saved: [{ id: 'a' }, { id: 'b' }] })[1].ariaLabel, 'Trends, 2 saved');
  assert.deepEqual([fantasy.big, fantasy.sub, fantasy.ariaLabel, fantasy.open], ['—', 'Player rankings', 'Fantasy, player rankings', { section: 'fantasy' }]);
  assert.deepEqual([teams.big, teams.sub, teams.ariaLabel, teams.open], ['32', 'Records and margins', 'Teams, all 32, records and margins', { section: 'teams' }]);
  assert.equal(tiles.some(t => 'isNew' in t), false);
  const played = researchTiles({ community: community(), now: ms('2026-11-09T02:00:00Z') })[0];
  assert.deepEqual([played.big, played.sub, played.next], ['3', 'all kicked off', null]);
  const none = researchTiles({ community: null })[0];
  assert.deepEqual([none.big, none.sub, none.ariaLabel], ['—', 'No week open', 'Games, no week open']);
  assert.equal(new Set(tiles.map(t => t.icon)).size, 4, 'no two tiles share a glyph');
});

test('D-31: no line, pick or market reaches the landing, whatever the read carries; no surface line over twelve words', () => {
  const read = community();
  const shown = JSON.stringify([researchHero(read, ms('2026-11-08T19:00:00Z')), researchTiles({ community: read, now: ms('2026-11-08T19:00:00Z') })]);
  for (const secret of ['-2.5', '−2.5', '-3', '−3', 'picks', 'ballots']) assert.equal(shown.includes(secret), false, secret);
  for (const now of [ms('2026-11-04T12:00:00Z'), ms('2026-11-08T19:00:00Z'), ms('2026-11-09T02:00:00Z'), null]) {
    const hero = researchHero(now === null ? null : read, now);
    for (const text of [hero.eyebrow, hero.title, hero.line, hero.action]) assert.ok(words(text) <= 12, text);
    for (const tile of researchTiles({ community: read, now })) assert.ok(words(tile.sub) <= 12, tile.sub);
  }
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node --test tests/next-research-landing.test.mjs`
Expected: FAIL (`Cannot find module …/research/researchModel.js`).

- [ ] **Step 3: The model.** Create `web/src/next/research/researchModel.js`:

```js
// Research's landing (D-69 step 3, spec 5A) as plain data: the first card (this week's games and lines, or the latest
// week's results once every game has kicked off) and four tiles (Games, Trends, Fantasy, Teams). Pure: it reads only
// the shared /community/read reply (its week's games and the server's clock, through home-view's homeHero) and this
// device's saved trends, so the landing makes no read of its own (no line, pick or Fantasy read: D-31, and Fantasy's
// chunk stays lazy). No moment kind lives on Research, so no tile shows NEW.
import { homeHero } from '../../../../shared/home-view.mjs';
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
import { DESTINATION_ICONS } from '../ui/destinations.js';
import { DASH, fmtDay, fmtTime, fmtWhen } from '../format.js';
import { trendsTile } from '../home/homeModel.js';
import { RESEARCH_NAMES } from './researchNav.js';

export const RESEARCH_TILES = Object.freeze(['games', 'trends', 'fantasy', 'teams']);
export const RESEARCH_TILE_ICONS = Object.freeze({ games: DESTINATION_ICONS.games, trends: DESTINATION_ICONS.trends, fantasy: DESTINATION_ICONS.fantasy, teams: DESTINATION_ICONS.teams });
export const LANDING_COPY = Object.freeze({ loading: 'Loading this week’s games…', failed: 'This week didn’t load.', tryAgain: 'Try again',
  refreshFailed: 'This week could not refresh. Showing the last loaded update.', refresh: 'Refresh week' });
const at = value => (typeof value === 'string' ? Date.parse(value) : NaN);
const sortTime = game => (Number.isFinite(at(game.kickoff)) ? at(game.kickoff) : Infinity);
const kickedOff = (game, now) => Number.isFinite(now) && Number.isFinite(at(game.kickoff)) && now >= at(game.kickoff);

/** The week's games from the Community read, in kickoff order (a game without a time sorts last): ids, codes, kickoffs only. */
export function weekGamesOf(community) {
  const games = Array.isArray(community?.week?.games) ? community.week.games : [];
  return games.filter(g => g && typeof g.id === 'string').map(g => ({ id: g.id, awayCode: g.awayCode, homeCode: g.homeCode, kickoff: g.kickoff ?? null }))
    .sort((a, b) => sortTime(a) - sortTime(b));
}
/** The server's clock in the Community read (ms), or null; never the device's. */
export const researchClock = community => homeHero({ community }).now;
/** The week's last kickoff (ms): after it nothing on the landing changes. Null without one. */
export function lastKickoffOf(community) {
  const times = weekGamesOf(community).map(g => at(g.kickoff)).filter(Number.isFinite);
  return times.length ? Math.max(...times) : null;
}

/** The first card. `target` is the section its one lime button opens. */
export function researchHero(community, now) {
  const week = Number.isInteger(community?.week?.week) ? community.week.week : null;
  const games = weekGamesOf(community), n = games.length, noun = n === 1 ? 'game' : 'games';
  if (week === null || !n) return { kind: 'none', week, eyebrow: RESEARCH_NAMES.title, title: 'No week is open yet', meter: null, line: 'Trends, teams and Fantasy are still here.', action: 'Open trends', target: 'trends' };
  const started = games.filter(g => kickedOff(g, now)).length;
  if (started < n) return { kind: 'week', week, eyebrow: `Week ${week} · This week’s lines`, title: `${n} ${noun}`, meter: { done: started, of: n }, line: `${started} of ${n} kicked off`, action: 'Open games', target: 'games' };
  return { kind: 'played', week, eyebrow: `Week ${week} · Results`, title: `Week ${week} results`, meter: { done: n, of: n }, line: `All ${n} ${noun} kicked off`, action: 'See results', target: 'games' };
}

/** The four tiles. `next` is the Games tile's next game (its marks are the tile's picture); `open` the section view it opens. */
export function researchTiles({ community = null, now = null, saved = [] } = {}) {
  const games = weekGamesOf(community), week = Number.isInteger(community?.week?.week) ? community.week.week : null;
  const next = games.find(g => Number.isFinite(at(g.kickoff)) && !kickedOff(g, now)) ?? null;
  const gamesTile = week === null || !games.length ? { big: DASH, sub: 'No week open', ariaLabel: 'Games, no week open', next: null }
    : next ? { big: fmtTime(next.kickoff), sub: `${fmtDay(next.kickoff)} · next game`, ariaLabel: `Games, next game ${next.awayCode} at ${next.homeCode}, ${fmtWhen(next.kickoff)}`, next }
    : { big: String(games.length), sub: 'all kicked off', ariaLabel: `Games, all ${games.length} kicked off`, next: null };
  const trends = trendsTile(saved), teams = Object.keys(TEAM_NAMES).length;
  return [
    { key: 'games', label: RESEARCH_NAMES.games, icon: RESEARCH_TILE_ICONS.games, ...gamesTile, open: { section: 'games' } },
    { key: 'trends', label: RESEARCH_NAMES.trends, icon: RESEARCH_TILE_ICONS.trends, next: null, big: trends.big, sub: trends.sub, ariaLabel: trends.ariaLabel, open: trends.open },
    { key: 'fantasy', label: RESEARCH_NAMES.fantasy, icon: RESEARCH_TILE_ICONS.fantasy, next: null, big: DASH, sub: 'Player rankings', ariaLabel: 'Fantasy, player rankings', open: { section: 'fantasy' } },
    { key: 'teams', label: RESEARCH_NAMES.teams, icon: RESEARCH_TILE_ICONS.teams, next: null, big: String(teams), sub: 'Records and margins', ariaLabel: `Teams, all ${teams}, records and margins`, open: { section: 'teams' } },
  ];
}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `node --test tests/next-research-landing.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the failing UI test.** Create `tests/next-research-landing-ui.test.jsx`:

```jsx
// D-69 step 3 (spec 5A): the Research landing drawn. Contracts: one glow card labelled by its eyebrow with the week meter,
// one meta line and the screen's one lime button; four tiles with stable ids; while the Community read loads, the meter
// card's skeleton with four tiles; a failed read says one sentence with Try again and keeps the tiles; a failed refresh
// keeps the last copy and says so. Fixture data only; Research's sections are stood in for.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ community: null }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({ accountId: 'fixture', community: state.community, refresh: vi.fn(), requestSignIn: vi.fn() }), useSharedRead: () => ({ data: null }) }));
vi.mock('../web/src/next/lines/GamesScreen.jsx', () => ({ GamesScreen: () => null }));
vi.mock('../web/src/next/teams/TeamsScreen.jsx', () => ({ TeamsScreen: () => null }));
vi.mock('../web/src/next/trends/TrendsPage.jsx', () => ({ TrendsPage: () => null }));
vi.mock('../web/src/next/fantasy/FantasyPage.jsx', () => ({ FantasyPage: () => null }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Research } = await import('../web/src/next/research/Research.jsx');

const week = { season: 2026, week: 9, games: [
  { id: 'DAL-NYG', awayCode: 'DAL', homeCode: 'NYG', kickoff: '2026-11-06T01:15:00Z' },
  { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2026-11-08T18:00:00Z' },
  { id: 'KC-BUF', awayCode: 'KC', homeCode: 'BUF', kickoff: '2026-11-08T21:25:00Z' }] };
const ready = { status: 'ready', data: { week, picksDue: { state: 'due', week: 9, now: '2026-11-08T19:00:00Z' } }, error: null, at: null };
const shell = { state: { views: { research: {}, lines: {} } }, go: vi.fn(), setView: vi.fn() };
const render = community => { state.community = community; return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Research/></div></ShellContext.Provider>); };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const byAttr = (html, name, value) => nodes(html).filter(n => n.attrs?.[name] === value);

describe('the Research landing', () => {
  it('one next-move card: its eyebrow names it, the week meter, one meta line, the one lime button; then four tiles', () => {
    const html = render(ready);
    expect(markupProblems(html)).toEqual([]);
    const [hero] = byAttr(html, 'data-research', 'hero');
    const eyebrow = nodes(html).find(n => n.attrs?.id === hero.attrs['aria-labelledby']);
    expect(textOf(eyebrow)).toBe('Week 9 · This week’s lines');
    expect(textOf([...walk(hero)].find(n => n.tag === 'h2'))).toBe('3 games');
    expect([...walk(hero)].filter(n => (n.attrs?.class ?? '').includes('gx-meter3-seg')).length).toBe(3);
    expect([...walk(hero)].filter(n => (n.attrs?.class ?? '').includes('gx-meter3-seg--on')).length).toBe(2);
    expect(textOf(byAttr(html, 'data-research', 'hero-line')[0])).toBe('2 of 3 kicked off');
    expect((html.match(/gx-btn--primary/g) || [])).toHaveLength(1);
    expect(nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-btn--primary')).map(textOf)).toEqual(['Open games']);
    const tiles = nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-tile'));
    expect(tiles.map(t => t.attrs.id)).toEqual(['gx-r-tile-games', 'gx-r-tile-trends', 'gx-r-tile-fantasy', 'gx-r-tile-teams']);
    expect(nameFrom(tiles[0])).toBe('Games, next game KC at BUF, Sun 1:25 PM PT');
    expect(nameFrom(tiles[2])).toMatch(/^Fantasy/);
    expect(html).not.toContain('gx-new');
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Research']);
  });
  it('while the read loads: the meter card’s skeleton and four tile skeletons, the words for screen readers', () => {
    const html = render({ status: 'loading', data: null, error: null, at: null });
    expect(markupProblems(html)).toEqual([]);
    const [skeleton] = byAttr(html, 'data-skeleton', 'landing');
    expect(skeleton.attrs.class).toContain('gx-r-skel');
    expect([...walk(skeleton)].filter(n => (n.attrs?.class ?? '').includes('gx-skel-hero--meter'))).toHaveLength(1);
    expect([...walk(skeleton)].filter(n => (n.attrs?.class ?? '').includes('gx-skel-tile'))).toHaveLength(4);
    expect(byAttr(html, 'data-research', 'tiles')).toHaveLength(0);
  });
  it('a failed read: one sentence and Try again, the tiles still there; a failed refresh keeps the last copy and says so', () => {
    const failed = render({ status: 'error', data: null, error: { status: 0 }, at: null });
    expect(markupProblems(failed)).toEqual([]);
    expect(textOf(byAttr(failed, 'data-research', 'failed')[0])).toContain('This week didn’t load.');
    expect(byAttr(failed, 'data-research', 'tiles')).toHaveLength(1);
    const stale = render({ ...ready, status: 'error', error: { status: 0 } });
    expect(stale).toContain('This week could not refresh. Showing the last loaded update.');
    expect(byAttr(stale, 'data-research', 'hero')).toHaveLength(1);
  });
});
```

In `tests/next-destination-icons.test.jsx`:
- replace the Research mocks with the four sections' screens: `vi.mock('../web/src/next/lines/GamesScreen.jsx', () => ({ GamesScreen: () => null }));`
  and `vi.mock('../web/src/next/teams/TeamsScreen.jsx', () => ({ TeamsScreen: () => null }));` beside the Trends and
  Fantasy ones (drop the `LinesBoard` mock);
- in "no two rows on one screen share a glyph", read Research's destinations as tiles: `const list = ['Home', 'Research'].includes(name) ? tiles(html) : rows(html);`,
  replace the Research rows assertion with
  `expect(tiles(screens.Research).map(([title]) => title)).toEqual(['Games', 'Trends', 'Fantasy', 'Teams']);` and add
  `expect(rows(screens.Research), 'Research’s destinations are tiles, not rows').toEqual([]);`;
- in "a destination keeps its glyph…", replace the two Research row lines with
  `expect(tileGlyph(screens.Research, 'Trends')).toBe(glyphOf('trends'));`, `expect(tileGlyph(screens.Research, 'Fantasy')).toBe(glyphOf('fantasy'));`,
  `expect(tileGlyph(screens.Research, 'Games')).toBe(glyphOf('games'));` and `expect(tileGlyph(screens.Research, 'Teams')).toBe(glyphOf('teams'));`
  (keep the Bets Research recommendations line: that destination's glyph is still the same wherever it is linked);
- update the header comment: Research's rows became kit tiles (D-69 step 3), and "Research recommendations from Research
  and from Bets" becomes "Research recommendations from Bets and from every game layer".

- [ ] **Step 6: Run it and see it fail.**

Run: `npx vitest run tests/next-research-landing-ui.test.jsx tests/next-destination-icons.test.jsx`
Expected: FAIL (the landing still draws `FocusAction`).

- [ ] **Step 7: The landing.** Create `web/src/next/research/ResearchLanding.jsx`:

```jsx
// Research (D-69 step 3, spec 5A, built for Sean's review): one next-move card, this week's games and lines (the week
// meter its one picture, one meta line, the screen's one lime button), or the latest week's results once every game has
// kicked off; then four tiles in two columns. It reads only the shared Community read and this device's saved trends;
// the server's clock, never the device's, says which games have kicked off.
import { useId } from 'react';
import { useAppData } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, Card, Meter, Skeleton, TeamMark, Tile, useEntrance } from '../ui/index.js';
import { useSavedTrends } from '../trends/builderData.js';
import { useServerNow } from '../home/useServerNow.js';
import { LANDING_COPY, lastKickoffOf, researchClock, researchHero, researchTiles } from './researchModel.js';
import { RESEARCH_NAMES, openSection, tileId } from './researchNav.js';
import '../ui/focusLanding.css';
import './landing.css';

function NextMove({ hero, onOpen }) {
  const id = useId();
  return <Card as="section" variant="hero" className="gx-r-hero" aria-labelledby={id} data-research="hero" data-kind={hero.kind}>
    <p className="gx-t-micro gx-r-hero-eyebrow" id={id}>{hero.eyebrow}</p>
    <h2 className="gx-t-title">{hero.title}</h2>
    {hero.meter ? <Meter value={hero.meter.done} max={hero.meter.of} className="gx-r-hero-meter"/> : null}
    <p className="gx-t-meta" data-research="hero-line">{hero.line}</p>
    <Button variant="primary" block onClick={onOpen}>{hero.action}</Button>
  </Card>;
}

export function ResearchLanding() {
  const app = useAppData(), shell = useShell(), enter = useEntrance();
  const { data, status, error, at } = app.community;
  const saved = useSavedTrends().items;
  // `at`: when the Community read landed, so a return here on an older read counts from the server's time now.
  const now = useServerNow(data ? researchClock(data) : null, at, { until: lastKickoffOf(data) });
  const hero = data ? researchHero(data, now) : null;
  const loading = !data && status !== 'error';
  const retry = () => app.refresh({ only: ['community'] });
  return <section className="gx-screen gx-r-landing" data-landing="research">
    <div className="gx-focus-heading"><h1 className="gx-t-title">{RESEARCH_NAMES.title}</h1></div>
    {hero ? <NextMove hero={hero} onOpen={() => openSection(shell, hero.target)}/>
      : loading ? <Skeleton label={LANDING_COPY.loading} shape="landing" hero="meter" count={4} className="gx-r-skel"/>
      : <Card variant="s2" role="alert" data-research="failed"><p className="gx-t-body">{LANDING_COPY.failed}</p><Button onClick={retry}>{LANDING_COPY.tryAgain}</Button></Card>}
    {data && (status === 'error' || error) ? <p className="gx-t-body" role="status">{LANDING_COPY.refreshFailed} <Button variant="ghost" onClick={retry}>{LANDING_COPY.refresh}</Button></p> : null}
    {loading ? null : <ul className="gx-tiles gx-stagger" data-enter={enter} aria-label="Research sections" data-research="tiles">
      {researchTiles({ community: data, now, saved }).map(tile => <li key={tile.key} data-tile={tile.key}>
        <Tile id={tileId(tile.key)} label={tile.label} icon={tile.icon} big={tile.big} sub={tile.sub} ariaLabel={tile.ariaLabel}
          picture={tile.next ? <><TeamMark code={tile.next.awayCode} size={24} decorative/><TeamMark code={tile.next.homeCode} size={24} decorative/></> : null}
          onClick={() => openSection(shell, tile.open.section, tile.open)}/></li>)}
    </ul>}
  </section>;
}
```

Create `web/src/next/research/landing.css`:

```css
/* D-69 step 3 (spec 5A): Research's landing. One glow card (the kit's hero card) holds the next move; four tiles sit
   under it in two columns on the page (the kit's .gx-tiles). Tokens only. */
.gx .gx-r-landing { gap: var(--gx-space-3); }
.gx .gx-r-hero { display: flex; flex-direction: column; gap: var(--gx-space-3); }
/* The eyebrow is a label, not lime: lime marks only the one main button and your selections (D-38). */
.gx .gx-r-hero-eyebrow { color: var(--gx-hero-text-2); }
.gx .gx-r-hero .gx-t-title { overflow-wrap: anywhere; }
.gx .gx-r-hero-meter .gx-meter3-seg { height: 8px; border-radius: 4px; }
.gx .gx-r-hero > .gx-btn { margin-top: var(--gx-space-1); }
```

Replace `web/src/next/research/Research.jsx` with:

```jsx
// Research (D-69 step 3): the landing (ResearchLanding.jsx) and its four sections, each with its own address: Games
// (the board and one game's layer), Trends (D-66 nesting cards), Fantasy (lazy, D-66) and Teams (the list and one
// team's layer).
import { useShell } from '../shell/context.js';
import { TrendsPage } from '../trends/TrendsPage.jsx';
import { FantasyPage } from '../fantasy/FantasyPage.jsx';
import { GamesScreen } from '../lines/GamesScreen.jsx';
import { TeamsScreen } from '../teams/TeamsScreen.jsx';
import { ResearchLanding } from './ResearchLanding.jsx';

export function Research() {
  const section = useShell().state.views.research.section;
  if (section === 'games') return <GamesScreen/>;
  if (section === 'trends') return <TrendsPage/>;
  if (section === 'fantasy') return <FantasyPage/>;
  if (section === 'teams') return <TeamsScreen/>;
  return <ResearchLanding/>;
}
```

- [ ] **Step 8: Run them and see them pass.**

Run: `npx vitest run tests/next-research-landing-ui.test.jsx tests/next-destination-icons.test.jsx tests/four-tab-landings.test.jsx tests/next-home-ui.test.jsx && node --test tests/next-research-landing.test.mjs tests/next-app-view.test.mjs tests/next-tokens.test.mjs tests/next-loading.test.mjs`
Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add web/src/next/research/researchModel.js web/src/next/research/ResearchLanding.jsx web/src/next/research/landing.css web/src/next/research/Research.jsx tests/next-research-landing.test.mjs tests/next-research-landing-ui.test.jsx tests/next-destination-icons.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/research/Research.jsx tests/next-destination-icons.test.jsx
git commit -m "Research's landing: this week's games as the next move, then Games, Trends, Fantasy and Teams tiles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7 · Trends motion

### Task 7: Count-ups on the win rates and the opened trend's chart reveal; Trends keeps its nesting

Trends' layers already rise in through `Nest`, and Task 1 made its lists stagger too. This task adds the count-ups and
the reveal.

**Files:**
- Create: `tests/next-trends-motion.test.jsx`
- Modify: `web/src/next/trends/TrendLayer.jsx`, `trends/WeekNest.jsx`, `trends/TeamsNest.jsx`, `trends/TrendsScreen.jsx`

**Interfaces:**
- Consumes: `CountUp` (`ui/CountUp.jsx`), `ChartReveal` (kit), `hasNavigated` (`moments/launch.js`), `winRateText`,
  `trendSlug`.
- Produces: `rateFigure(key)` → `'trends.rate.<slug>'`; `TrendRate({ share, account, figure, className })`;
  `TrendTile`, `TrendHero` and `trendLayer` accept `account`; `TeamsNest` accepts `account`; `WeekNest` reads
  `lines?.app?.accountId`.

- [ ] **Step 1: Write the failing test.** Create `tests/next-trends-motion.test.jsx`:

```jsx
// D-69 step 3 (spec 6, "Trends: … it gets entrance motion, count-ups and the chart reveal"): each win rate counts from the
// last value this device showed for that trend (spec 4.4), keyed by the trend's slug, never its key (a key can carry a
// line band); the opened trend's chart reveals only after a tap, never on a load. Hand-built week; no network.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/auth', () => ({ cloudEnabled: false, supabase: null }));
vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(), communityApi: vi.fn(), leagueApi: vi.fn(), linesApi: vi.fn(), readTeams: vi.fn(), trendsApi: vi.fn() }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => null }));
const { TrendRate, TrendTile, rateFigure, trendLayer, trendSlug } = await import('../web/src/next/trends/TrendLayer.jsx');
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { markNavigated, markSettled, resetLaunch } = await import('../web/src/next/moments/launch.js');

const KEY = 'team_ats|team:GB+v:home@band:-3.5';
const card = { key: KEY, id: 'team_ats|team:GB+v:home', kind: 'card', title: 'GB at home: ATS', share: 5 / 7, games: 7, years: [2019, 2026], record: '5–2', chart: { spark: [0, 1, 2, 1, 3], units: 2.6, record: { W: 5, L: 2 } } };
const render = node => renderToStaticMarkup(<ShellContext.Provider value={{ go: vi.fn(), state: { sheets: [] } }}><div className="gx">{node}</div></ShellContext.Provider>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const byClass = (html, cls) => nodes(html).filter(n => (n.attrs?.class ?? '').split(/\s+/).includes(cls));

afterEach(() => resetLaunch());

describe('Trends count-ups and the chart reveal', () => {
  it('a win rate is a count-up of the one-decimal rate, with "%" after it; the tile reads as before', () => {
    const html = render(<ul><TrendTile card={card} rules={{}} onOpen={() => {}} account="u-1"/></ul>);
    expect(markupProblems(html)).toEqual([]);
    const [count] = byClass(html, 'gx-countup');
    expect([count.attrs['data-count'], textOf(count)]).toEqual(['rest', '71.4']);
    expect(textOf(byClass(html, 'gx-nest-num')[0])).toBe('71.4%');
    expect(render(<TrendRate share={null} account="u-1" figure="x" className="gx-n-m"/>)).not.toContain('gx-countup');
    expect(textOf(nodes(render(<TrendRate share={null} account="u-1" figure="x" className="gx-n-m"/>)).find(n => n.tag === 'span'))).toBe('—');
  });
  it('the remembered value is one per trend, by its slug: no key text (and no line band) in device storage', () => {
    expect(rateFigure(KEY)).toBe(`trends.rate.${trendSlug(KEY)}`);
    expect(rateFigure(KEY)).not.toMatch(/band|GB|\|/);
  });
  it('the opened trend’s chart reveals after a tap, never on a load; its big number counts up', () => {
    const view = { id: 'CAR-GB', title: 'CAR @ GB' };
    const layer = () => render(trendLayer({ label: 'Week trends', layer: 'trend:t1', card, week: { rows: {}, games: [] }, view, lips: [], account: 'u-1' }));
    expect(byClass(layer(), 'gx-reveal')[0].attrs['data-reveal']).toBeUndefined();
    markSettled(); markNavigated();
    const opened = layer();
    expect(markupProblems(opened)).toEqual([]);
    expect(byClass(opened, 'gx-reveal')[0].attrs['data-reveal']).toBe('in');
    expect(byClass(opened, 'gx-n-xl').map(textOf)).toEqual(['71.4%']);
    expect(byClass(opened, 'gx-countup')).toHaveLength(1);
  });
  it('every Trends number that is a win rate goes through TrendRate', () => {
    for (const file of ['TrendLayer.jsx', 'WeekNest.jsx', 'TeamsNest.jsx']) {
      const source = readFileSync(new URL(`../web/src/next/trends/${file}`, import.meta.url), 'utf8');
      expect(source.match(/<span className="gx-n-(m|l|xl)[^"]*">\{winRateText\(/g), file).toBeNull();
    }
  });
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `npx vitest run tests/next-trends-motion.test.jsx`
Expected: FAIL (`TrendRate` is undefined).

- [ ] **Step 3: The rate, the tiles, the chart.** In `web/src/next/trends/TrendLayer.jsx`:
- change the React import to `import { useId, useState } from 'react';`, import `ChartReveal` beside the other kit
  imports, `import { CountUp } from '../ui/CountUp.jsx';` and `import { hasNavigated } from '../moments/launch.js';`;
- add after `gamesText`:

```jsx
/** A trend's count-up figure on this device: one per trend, by its slug (its key can carry a line band). */
export const rateFigure = key => `trends.rate.${trendSlug(key)}`;

/**
 * A trend's win rate (D-75's one number), counting from the last value this device showed for that trend (D-69 4.4).
 * The resting text is exactly winRateText's; "—" with no decided game, which never counts.
 */
export function TrendRate({ share, account, figure, className }) {
  const pct = typeof share === 'number' && Number.isFinite(share) ? Number((share * 100).toFixed(1)) : null;
  if (pct === null) return <span className={className}>{winRateText(share)}</span>;
  return <span className={className}><CountUp value={pct} account={account} figure={figure} format={value => value.toFixed(1)}/>%</span>;
}
```

- `TrendTile({ card, rules, onOpen, account })`: replace its number with
  `<TrendRate className="gx-n-m gx-nest-num" share={card.share} account={account} figure={rateFigure(card.key)}/>`;
- `TrendHero({ card, rules, onOpen, account })`: pass `account` to its locked `TrendTile`, and replace its number with
  `<TrendRate className="gx-n-l gx-nest-num" share={card.share} account={account} figure={rateFigure(card.key)}/>`;
- `TrendChartCard({ card, account })`: add `const [reveal] = useState(() => hasNavigated()); // a tap opened it; never on a load`,
  replace its big number with `<TrendRate className="gx-n-xl" share={card.share} account={account} figure={rateFigure(card.key)}/>`
  and wrap its `<svg …>…</svg>` in `<ChartReveal play={reveal}>…</ChartReveal>`;
- `trendLayer({ label, layer, card, week, view, lips, account })`: draw `<TrendChartCard card={card} account={account}/>`.

In `web/src/next/trends/WeekNest.jsx`: add `const account = lines?.app?.accountId ?? null;` at the top of `WeekNest` and
pass `account={account}` to every `TrendTile` and `TrendHero`, and `account` to both `trendLayer({ … })` calls' objects.
In `web/src/next/trends/TeamsNest.jsx`: add `account = null` to `TeamsNest`'s props, pass it to every `TrendTile` and to
`trendLayer`, import `TrendRate` and `rateFigure` from `./TrendLayer.jsx`, and replace the team tile's number with
`{known ? <TrendRate className="gx-n-m gx-nest-num" share={t.share} account={account} figure={rateFigure(t.headline.key)}/> : <span className="gx-n-m gx-nest-num">—</span>}`.
In `web/src/next/trends/TrendsScreen.jsx`, pass `account={app.accountId}` to `<TeamsNest …/>`.

- [ ] **Step 4: Run it and see it pass, with Trends' other tests.**

Run: `npx vitest run tests/next-trends-motion.test.jsx tests/next-trends-nest.test.jsx tests/next-trends-ui.test.jsx tests/next-kit-research.test.jsx && node --test tests/next-tokens.test.mjs`
Expected: PASS (the nesting tests read "71.4%" from each number as before).

- [ ] **Step 5: Commit.**

```bash
git add web/src/next/trends/TrendLayer.jsx web/src/next/trends/WeekNest.jsx web/src/next/trends/TeamsNest.jsx web/src/next/trends/TrendsScreen.jsx tests/next-trends-motion.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/trends/TrendLayer.jsx web/src/next/trends/WeekNest.jsx web/src/next/trends/TeamsNest.jsx
git commit -m "Trends: win rates count up from the last value shown; the opened trend's chart reveals after a tap" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8 · Fantasy's report card

### Task 8: The report card as tiles and rows, under the Track 1 owner's conditions

The Track 1 owner opened `web/src/next/fantasy/` for this task only (November 4, 2026). The numbers stay
`summarizeReview`'s; only the layout changes, and the new app stops importing the old screen.

**Files:**
- Create: `web/src/next/fantasy/fantasyReport.js`, `web/src/next/fantasy/FantasyReport.jsx`,
  `tests/helpers/fantasy-review-fixture.mjs`, `tests/next-fantasy-report.test.jsx`
- Modify: `web/src/next/fantasy/FantasyNest.jsx`, `web/src/next/fantasy/fantasy.css`, `tests/next-app-view.test.mjs`,
  `tests/cloud-browser/fantasy.spec.js` (the report test only)

**Interfaces:**
- Consumes: `summarizeReview` (`shared/fantasy-review.mjs`), `formatFantasyNumber` (`shared/fantasy-rankings.mjs`), both
  read-only; `PictureRow`, `Pill` (kit).
- Produces: `REPORT_COPY.about`; `reportModel(review, filters, scoringLabel)` → `{ week, status, graded, mae, none,
  tiles: [{ key: 'miss'|'baseline'|'within'|'graded', label, big, sub }], positions: [{ position, value, meta, word,
  tone }], overs, unders: [{ id, title, meta, value, word }], fine: string[] }`; `reportTile(review, filters)` → `{ big,
  sub }`; `FantasyReport({ report })` (`section[aria-label="Week N accuracy"]`); `methodBody` exported from
  `FantasyNest.jsx` with a `Method: <name> <version>.` line from the snapshot.

- [ ] **Step 1: The review fixture.** Create `tests/helpers/fantasy-review-fixture.mjs`:

```js
// A deterministic weekly review (D-57's shape, as shared/fantasy-review.mjs validateFantasyReview checks it) built from a
// committed snapshot: the first two scheduled players at QB, RB, WR and TE, each with a recorded result above or below
// its estimate and a season-average baseline. Fixture numbers only; no real player's result.
const scale = (stats, k) => Object.fromEntries(Object.entries(stats).map(([key, value]) => [key, typeof value === 'number' ? Math.round(value * k * 100) / 100 : value]));

export function reviewFixture(snapshot, { week = snapshot.week - 1, status = 'PROVISIONAL' } = {}) {
  const players = [];
  for (const position of ['QB', 'RB', 'WR', 'TE']) {
    snapshot.players.filter(p => p.position === position && p.weekly?.status === 'scheduled' && p.weekly.stats).slice(0, 2).forEach((p, i) => {
      players.push({ id: p.id, name: p.name, team: p.team, position, estimate: p.weekly.stats, actual: scale(p.weekly.stats, i ? 0.6 : 1.3), baseline: scale(p.weekly.stats, 1.1) });
    });
  }
  return { schemaVersion: 1, season: snapshot.season, week, generatedAt: snapshot.generatedAt, status,
    estimate: { file: `fixture-${snapshot.season}-week-${String(week).padStart(2, '0')}.json`, sha256: 'a'.repeat(64), generatedAt: snapshot.generatedAt, publishedBeforeFreeze: true },
    actuals: { url: 'https://example.invalid/fixture-stats.csv' }, players: players.sort((a, b) => a.id.localeCompare(b.id)), playedWithoutEstimate: 3 };
}
```

- [ ] **Step 2: Write the failing test.** Create `tests/next-fantasy-report.test.jsx`:

```jsx
// D-69 step 3: Research › Fantasy's report card rebuilt as tiles and rows in the new app (the Track 1 owner opened
// web/src/next/fantasy/ for it on November 4, 2026). Contracts: the numbers are summarizeReview's; the old
// FantasyAccuracy.jsx leaves the new app (spec test 13) and stays for the old one; and the owner's binding conditions,
// one test each: D-76's copy, the method's name and version from each snapshot's own data, a lazy Fantasy chunk, every
// new-app Fantasy file parses, the NBA status region stays mounted, and one Fantasy title.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, parseMarkup, walk } from './helpers/ui-markup.mjs';
import { reviewFixture } from './helpers/fantasy-review-fixture.mjs';
import { DEFAULT_FILTERS, formatFantasyNumber } from '../shared/fantasy-rankings.mjs';
import { summarizeReview } from '../shared/fantasy-review.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const base = JSON.parse(read('shared/fantasy/2026-week-06.json'));
const USAGE = { name: 'GTL usage', version: '2.0', description: 'Usage estimates. Kickers, and any player with incomplete usage stats, use the earlier pace method.' };
const PACE = { name: 'GTL statistical pace', version: '1.1', description: 'For each statistic, a descriptive pace estimate.' };
const state = vi.hoisted(() => ({ value: null }));
vi.mock('../web/src/fantasyData.js', () => ({ FANTASY_AVAILABLE: [{ key: '2026-06', season: 2026, week: 6 }], FANTASY_INITIAL: '2026-06',
  fantasyWeekKey: (season, week) => `${season}-${String(week).padStart(2, '0')}`, useFantasySnapshot: () => state.value }));
vi.mock('../web/src/fantasyContext.js', () => ({ useFantasyGameContext: () => ({ lines: null, wind: null }) }));
const { FantasyNest, methodBody } = await import('../web/src/next/fantasy/FantasyNest.jsx');
const { REPORT_COPY, reportModel, reportTile } = await import('../web/src/next/fantasy/fantasyReport.js');
const { FantasyPage } = await import('../web/src/next/fantasy/FantasyPage.jsx');
const { Games } = await import('../web/src/next/nba/Games.jsx');

const review = reviewFixture(base);
const ready = method => ({ status: 'ready', snapshot: { ...base, method }, review, origin: 'hosted', weeks: [{ key: '2026-06', season: 2026, week: 6 }] });
const render = (view = {}) => renderToStaticMarkup(<div className="gx"><FantasyNest navigationState={{ selection: '2026-06' }} onNavigationState={() => {}} view={view} onLayer={() => {}}
  profileId={null} onProfile={() => {}} compareIds={[]} onCompareChange={() => {}} onCompare={() => {}}/></div>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const words = html => nodes(html).filter(n => n.text != null).map(n => n.text).join(' ');
const filesUnder = dir => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e => (e.isDirectory() ? filesUnder(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
const code = file => transformSync(read(file), { loader: file.endsWith('.jsx') ? 'jsx' : 'js', jsx: 'automatic', format: 'esm' }).code; // comments dropped
const FANTASY = filesUnder('web/src/next/fantasy').filter(file => /\.jsx?$/.test(file));
const SURFACES = [{}, { fantasyLayer: 'report' }, { fantasyLayer: 'compare' }];

describe('the report card as tiles and rows', () => {
  it('four tiles, one row per position and the biggest misses one tap away, every number summarizeReview’s', () => {
    state.value = ready(USAGE);
    const html = render({ fantasyLayer: 'report' });
    expect(markupProblems(html)).toEqual([]);
    const s = summarizeReview(review, DEFAULT_FILTERS);
    const tile = key => nodes(html).find(n => n.attrs?.['data-report'] === key);
    expect(textOf(tile('miss'))).toContain(formatFantasyNumber(s.mae));
    expect(textOf(tile('baseline'))).toContain(formatFantasyNumber(s.baselineMae));
    expect(textOf(tile('within'))).toContain(`${Math.round(s.within5 * 100)}%`);
    expect(textOf(tile('graded'))).toContain(String(s.graded));
    expect(nodes(html).filter(n => n.attrs?.['data-report-position']).map(n => n.attrs['data-report-position'])).toEqual(s.byPosition.map(r => r.position));
    expect(html).toContain(`aria-label="Week ${review.week} accuracy"`);
    expect(html).toContain('PROVISIONAL');
    expect(nodes(html).filter(n => n.tag === 'details' && n.attrs['data-fantasy'] === 'misses')).toHaveLength(1);
    expect(nodes(html).filter(n => n.tag === 'table')).toHaveLength(0);
    expect(reportModel(review, DEFAULT_FILTERS, 'Full PPR').overs.map(r => r.id)).toEqual(s.overs.map(r => r.id));
  });
  it('the rankings card’s report tile shows the miss in points; with nothing graded, the status', () => {
    state.value = ready(USAGE);
    const html = render();
    const tile = nodes(html).find(n => n.attrs?.['data-fantasy'] === 'report');
    expect(textOf(tile)).toContain(formatFantasyNumber(summarizeReview(review, DEFAULT_FILTERS).mae));
    expect(reportTile({ ...review, players: [] }, DEFAULT_FILTERS)).toEqual({ big: 'PROVISIONAL', sub: 'How close the estimates were' });
  });
  it('spec test 13: no new-app file imports the old FantasyAccuracy.jsx; the old app keeps it', () => {
    for (const file of filesUnder('web/src/next').filter(file => /\.jsx?$/.test(file))) expect(read(file), file).not.toMatch(/(from\s*|import\(\s*)['"][^'"]*FantasyAccuracy/);
    expect(read('web/src/FantasyFootball.jsx')).toMatch(/import \{ FantasyAccuracy \} from '\.\/FantasyAccuracy\.jsx'/);
  });
});

describe('the Track 1 owner’s conditions', () => {
  it('D-76 copy: the rankings ⓘ says "from recent usage and statistics"; the report card says "GTL’s weekly estimates"', () => {
    expect(methodBody({ ...base, method: USAGE }, DEFAULT_FILTERS, 'Full PPR')[0]).toContain('from recent usage and statistics');
    expect(REPORT_COPY.about).toContain('GTL’s weekly estimates');
    expect(reportModel(review, DEFAULT_FILTERS, 'Full PPR').fine[0]).toBe(REPORT_COPY.about);
  });
  it('"pace" nowhere on screen: no app string says it, and no surface says it, even when a snapshot’s own method does', () => {
    for (const file of FANTASY) expect(code(file), file).not.toMatch(/\bpace\b/i);
    for (const method of [USAGE, PACE]) for (const view of SURFACES) {
      state.value = ready(method);
      expect(words(render(view)), `${method.name} ${JSON.stringify(view)}`).not.toMatch(/\bpace\b/i);
    }
  });
  it('the method’s name and version come from each snapshot’s own data, never from the app', () => {
    expect(methodBody({ ...base, method: USAGE }, DEFAULT_FILTERS, 'Full PPR')).toContain('Method: GTL usage 2.0.');
    expect(methodBody({ ...base, method: PACE }, DEFAULT_FILTERS, 'Full PPR')).toContain('Method: GTL statistical pace 1.1.');
    for (const file of FANTASY) expect(code(file), file).not.toMatch(/GTL usage|statistical pace|['"`]2\.0['"`]|['"`]1\.1['"`]/);
    expect(JSON.stringify(reportModel(review, DEFAULT_FILTERS, 'Full PPR'))).not.toMatch(/GTL usage|statistical pace|usage 2\.0|pace 1\.1/); // a review names no method
  });
  it('the Fantasy chunk stays lazy: nothing the app loads first reaches the Fantasy screen except through import()', () => {
    const exts = ['', '.js', '.jsx', '.mjs', '/index.js'];
    const resolve = (from, spec) => exts.map(ext => path.join(path.dirname(from), spec) + ext).find(file => fs.existsSync(path.join(root, file)) && fs.statSync(path.join(root, file)).isFile());
    const staticImports = file => [...read(file).matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm)].map(m => m[1] ?? m[2]);
    const seen = new Set(), queue = ['web/src/next/NextApp.jsx'];
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file) || !/\.(m?js|jsx)$/.test(file)) { seen.add(file); continue; }
      seen.add(file);
      for (const spec of staticImports(file)) if (spec.startsWith('.')) { const next = resolve(file, spec); if (next) queue.push(path.normalize(next).replaceAll('\\', '/')); }
    }
    for (const lazy of ['web/src/next/fantasy/FantasyScreen.jsx', 'web/src/next/fantasy/FantasyNest.jsx', 'web/src/next/fantasy/FantasyReport.jsx', 'web/src/next/fantasy/fantasyReport.js', 'web/src/next/fantasy/fantasy.css']) {
      expect(seen.has(lazy), lazy).toBe(false);
    }
    expect(seen.has('web/src/next/fantasy/FantasyPage.jsx')).toBe(true);
    expect(read('web/src/next/fantasy/FantasyPage.jsx')).toMatch(/import\('\.\/FantasyScreen\.jsx'\)/);
  });
  it('every new-app Fantasy file parses', () => {
    for (const file of FANTASY) expect(() => code(file), file).not.toThrow();
  });
  it('the NBA status region stays mounted while games load and after', () => {
    const draw = props => renderToStaticMarkup(<div className="gx"><Games board={null} date="2026-11-04" timeZone="America/Los_Angeles" onDate={() => {}} onTrack={() => {}} refresh={() => {}} {...props}/></div>);
    for (const props of [{ loading: true }, { loading: false }, { loading: false, error: { status: 500, message: 'down' } }]) {
      expect(nodes(draw(props)).filter(n => n.tag === 'div' && n.attrs.role === 'status' && n.attrs['data-skeleton'] === undefined), JSON.stringify(props)).toHaveLength(1);
    }
  });
  it('one Fantasy title, "Fantasy Football", on every layer and while the code loads', () => {
    state.value = ready(USAGE);
    for (const view of SURFACES) expect(nodes(render(view)).filter(n => n.tag === 'h1').map(textOf), JSON.stringify(view)).toEqual(['Fantasy Football']);
    expect(nodes(renderToStaticMarkup(<div className="gx"><FantasyPage/></div>)).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Fantasy Football']);
  });
});
```

- [ ] **Step 3: Run it and see it fail.**

Run: `npx vitest run tests/next-fantasy-report.test.jsx`
Expected: FAIL (`Cannot find module …/fantasy/fantasyReport.js`).

- [ ] **Step 4: The model and the card.** Create `web/src/next/fantasy/fantasyReport.js`:

```js
// The week's report card for GTL’s weekly estimates as plain data (D-69 step 3: the old FantasyAccuracy.jsx's numbers as
// tiles and rows). Every number is shared/fantasy-review.mjs summarizeReview's under the chosen scoring, formatted as
// before; nothing is recomputed. A review grades the estimates published for its week and names no method, so the card
// never names one (the rankings ⓘ names the shown snapshot's own).
import { formatFantasyNumber as number } from '../../../../shared/fantasy-rankings.mjs';
import { summarizeReview } from '../../../../shared/fantasy-review.mjs';

const percent = value => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`);
const signed = value => `${value > 0 ? '+' : '−'}${number(Math.abs(value))}`;
export const REPORT_COPY = Object.freeze({
  about: 'A report card for GTL’s weekly estimates, not a forecast or betting claim. Each estimate is graded against the recorded result, beside a season-average baseline.',
});

export function reportModel(review, filters, scoringLabel) {
  const s = summarizeReview(review, filters);
  const miss = row => ({ id: row.id, title: row.name, meta: `${row.team} ${row.position} · est. ${number(row.estimate)} · actual ${number(row.actual)}`,
    value: signed(row.diff), word: row.diff > 0 ? 'too high' : 'too low' });
  return {
    week: review.week, status: review.status, graded: s.graded, mae: s.mae,
    none: `No graded players for Week ${review.week} under these settings.`,
    tiles: [
      { key: 'miss', label: 'Off by', big: number(s.mae), sub: `pts per player · ${scoringLabel}` },
      { key: 'baseline', label: 'Season average', big: number(s.baselineMae), sub: 'pts per player' },
      { key: 'within', label: 'Within 5 points', big: percent(s.within5), sub: 'of graded players' },
      { key: 'graded', label: 'Players graded', big: String(s.graded), sub: s.beatBaseline.length ? `Beat average: ${s.beatBaseline.join(', ')}` : 'Beat average: none' },
    ],
    positions: s.byPosition.map(r => {
      const beat = r.baselineMae !== null && r.pairedMae !== null && r.pairedMae < r.baselineMae;
      return { position: r.position, value: number(r.pairedMae), meta: `${r.graded} graded · season average ${number(r.baselineMae)}`,
        word: r.baselineMae === null ? 'No average' : beat ? 'Beat average' : 'Behind average', tone: beat ? 'good' : 'plain' };
    }),
    overs: s.overs.map(miss), unders: s.unders.map(miss),
    fine: [REPORT_COPY.about,
      s.withoutBaseline > 0 ? `GTL on the same players: ${number(s.pairedMae)}; ${s.withoutBaseline} without a season average.` : null,
      `Listed available, no stats row: ${s.noStatsRow} · Played without an estimate: ${s.playedWithoutEstimate}. Neither is scored as zero.`].filter(Boolean),
  };
}

/** The rankings card's report tile: the miss in points, or the status while nothing is graded. */
export function reportTile(review, filters) {
  const s = summarizeReview(review, filters);
  return s.graded ? { big: number(s.mae), sub: 'pts off per player' } : { big: review.status, sub: 'How close the estimates were' };
}
```

Create `web/src/next/fantasy/FantasyReport.jsx`:

```jsx
// D-69 step 3: the week's report card (fantasyReport.js) as four tiles, one picture row per position under "Off by, by
// position", and the biggest misses one tap away. The status pill stays (PROVISIONAL or FINAL, from the review); the fine
// print sits behind the layer's ⓘ (FantasyNest.jsx).
import { PictureRow, Pill } from '../ui/index.js';

function MissRows({ label, rows }) {
  return <section className="gx-vstack gx-gap-8" aria-label={label}><h4 className="gx-t-label gx-c-2">{label}</h4>
    {rows.length ? <ol className="gx-prows">{rows.map(row => <li key={row.id}><PictureRow title={row.title} meta={row.meta} value={row.value} word={row.word}/></li>)}</ol>
      : <p className="gx-t-meta">None.</p>}
  </section>;
}

export function FantasyReport({ report }) {
  return <section className="gx-vstack gx-gap-16 gx-fantasy-report" aria-label={`Week ${report.week} accuracy`}>
    <div className="gx-nest-tags"><Pill tone={report.status === 'FINAL' ? 'neutral' : 'pending'}>{report.status}</Pill></div>
    {report.graded ? <>
      <ul className="gx-nest-grid" aria-label="How close the estimates were">{report.tiles.map(tile => <li key={tile.key}><div className="gx-nest-tile" data-report={tile.key}>
        <span className="gx-nest-tile-label">{tile.label}</span><span className="gx-n-m gx-nest-num">{tile.big}</span><span className="gx-t-meta">{tile.sub}</span>
      </div></li>)}</ul>
      <section className="gx-vstack gx-gap-8" aria-label="Off by, by position"><h3 className="gx-t-label gx-c-2">Off by, by position</h3>
        <ol className="gx-prows">{report.positions.map(p => <li key={p.position} data-report-position={p.position}>
          <PictureRow title={p.position} meta={p.meta} value={p.value} word={p.word} tone={p.tone}/></li>)}</ol>
      </section>
      <details className="gx-tr-details" data-fantasy="misses"><summary className="gx-t-strong">Biggest misses</summary>
        <div className="gx-vstack gx-gap-12"><MissRows label="Estimated too high" rows={report.overs}/><MissRows label="Estimated too low" rows={report.unders}/></div>
      </details>
    </> : <p className="gx-t-body">{report.none}</p>}
  </section>;
}
```

- [ ] **Step 5: Wire it into the nesting cards.** In `web/src/next/fantasy/FantasyNest.jsx`:
- delete `import { FantasyAccuracy } from '../../FantasyAccuracy.jsx';` and add
  `import { FantasyReport } from './FantasyReport.jsx';` and `import { reportModel, reportTile } from './fantasyReport.js';`;
- export `methodBody` and give it the method line from the snapshot itself:

```js
/** The method (its name and version from the snapshot's own data), scoring rules and sources, behind the rankings ⓘ. */
export function methodBody(snapshot, filters, scoringLabel) {
  const rules = scoringRules(filters) || scoringRules(DEFAULT_FILTERS);
  const method = snapshot.method?.name && snapshot.method?.version ? `Method: ${snapshot.method.name} ${snapshot.method.version}.` : null;
  return [INTRO, method,
```

  (the rest of the array as it is, ending `].filter(Boolean);`);
- replace the report layer's body with:

```jsx
  // Fantasy › the week's report card (D-69 step 3: tiles and rows; the fine print behind ⓘ).
  if (snapshot && view.fantasyLayer === 'report' && filters.scope === 'weekly' && state.review) {
    const report = reportModel(state.review, filters, scoringLabel);
    return <section className="gx-screen gx-fantasy" aria-label="Fantasy Football"><h1 className="gx-t-title">Fantasy Football</h1><Nest label="Fantasy layers" layer="report" title={`Week ${state.review.week} report card`} lips={[toFantasy]}
      info={<InfoButton title="About the report card" body={report.fine} links={sourceLinks(snapshot)}/>}>
      <FantasyReport report={report}/>
    </Nest></section>;
  }
```

- on the rankings card, add `const reportCard = snapshot && filters.scope === 'weekly' && state.review ? reportTile(state.review, filters) : null;`
  before the `return`, and draw the report tile from it:

```jsx
        {reportCard ? <li><button type="button" className="gx-nest-tile" data-fantasy="report" onClick={() => onLayer({ fantasyLayer: 'report', fantasyPlayer: null })}>
          <span className="gx-nest-tile-label">Week {state.review.week} report card</span><span className="gx-n-m gx-nest-num">{reportCard.big}</span>
          <span className="gx-t-meta">{reportCard.sub}</span></button></li> : null}
```

In `web/src/next/fantasy/fantasy.css`, delete the `.gx-fantasy-accuracy` rules (`.gx-fantasy-accuracy`, `-head`,
`-headline strong`, `-tiles` and its `dd`/`dt`, `-table` and its cells) and change
`.gx .gx-fantasy-context a, .gx .gx-fantasy-accuracy summary {` to `.gx .gx-fantasy-context a {`. Confirm first:
`grep -rn "fantasy-accuracy" web/src/next` prints only `fantasy.css`.

In `tests/next-app-view.test.mjs`, change the Fantasy adapter line to
`'web/src/next/fantasy/FantasyNest.jsx': ['fantasyData.js', 'fantasyContext.js'],` with the comment
`// D-66: the Fantasy nesting cards reuse the snapshot and game-context reads; D-69 step 3: not the old report card.`,
and the spec test 13 line to
`for (const file of filesUnder('web/src/next')) for (const spec of importsOf(read(file))) assert.doesNotMatch(spec, /CommunityHome|PlayPresentation|FantasyAccuracy/, `${file} imports ${spec}`);`
(the old `FantasyAccuracy.jsx`'s own `./next/ui/index.js` exception stays: the old app still draws it).

In `tests/cloud-browser/fantasy.spec.js`, in the report test, after `await expect(card.getByText('PROVISIONAL', { exact: true })).toBeVisible();` add:

```js
          // D-69 step 3: tiles and rows; the misses one tap away.
          for (const key of ['miss', 'baseline', 'within', 'graded']) await expect(card.locator(`[data-report="${key}"]`)).toBeVisible();
          await expect(card.getByRole('heading', { name: 'Off by, by position', exact: true })).toBeVisible();
          await expect(card.locator('details[data-fantasy="misses"] > summary')).toHaveText('Biggest misses');
```

- [ ] **Step 6: Run them and see them pass, with every Fantasy test.**

Run: `npx vitest run tests/next-fantasy-report.test.jsx tests/next-fantasy-nest.test.jsx tests/nba-ui.test.jsx && node --test tests/next-app-view.test.mjs tests/next-parse.test.mjs tests/next-tokens.test.mjs && npx playwright test --config playwright.cloud.config.js tests/cloud-browser/fantasy.spec.js tests/cloud-browser/research-fantasy-loading.spec.js --reporter=line`
Expected: PASS, browser `skipped 0`.

- [ ] **Step 7: Commit.**

```bash
git add web/src/next/fantasy/fantasyReport.js web/src/next/fantasy/FantasyReport.jsx web/src/next/fantasy/FantasyNest.jsx web/src/next/fantasy/fantasy.css tests/helpers/fantasy-review-fixture.mjs tests/next-fantasy-report.test.jsx tests/next-app-view.test.mjs tests/cloud-browser/fantasy.spec.js
git diff --cached --stat && git ls-files --eol web/src/next/fantasy/FantasyNest.jsx web/src/next/fantasy/fantasy.css tests/next-app-view.test.mjs
git commit -m "Fantasy's report card as tiles and rows; the new app stops importing FantasyAccuracy.jsx" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 9 · Browser checks

### Task 9: The new Research spec, every touched spec updated, the phone and fixed-bar sweeps

Every browser spec that opened the game sheet from the board, read the board's cards or the landing's rows moves to the
rows and layers; none is deleted. The new spec drives what only a browser can show.

**Files:**
- Create: `tests/cloud-browser/next-research-layers.spec.js`
- Modify: `tests/cloud-browser/next-lines.spec.js`, `next-gestures.spec.js`, `next-game-notes.spec.js`,
  `next-research.spec.js`, `research-style-recovery.spec.js`, `four-tab-redesign.spec.js`, `next-trends.spec.js`,
  `next-shell.spec.js`, `next-phone-layout.spec.js`, `next-scroll-navigation.spec.js`; and
  `web/src/next/ui/skeleton.css`, `web/src/next/lines/lines.css` (only if a measured height differs)

- [ ] **Step 1: Write the new spec.** Create `tests/cloud-browser/next-research-layers.spec.js`:

```js
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { SUPABASE, communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';

// D-69 step 3 (Research) on the real app and handler with every migration on local PGlite. Checked: the landing's first
// card and four tiles, and that the landing reads nothing of its own; the loading card and rows against the real ones at
// 390 px; one game and one team as layers with their own addresses (a tap, a reload, a shared link, the lip, Back,
// Forward, focus on the heading after a navigation and never after a load, unknown values drawing the list); the pager
// swapping the game in place; a team from a game and back; layers never crossing tabs; motion (the layer's entrance, the
// movement chart's reveal: a tap, never a load, never under reduced motion, transform only; nothing moving on the first
// paint); and the phone rules at 320 and 390 px in both themes with the wide fallback font. Fictional accounts only;
// never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const WIDE_FONT = '.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// The committed trends file is 2026 Week 6, so a game has trends; the same two games as next-phone-layout.spec.js.
const WEEK6 = state => {
  state.league.season = 2026; state.league.week = 6;
  const [a, b] = state.games;
  state.games = [{ ...a, id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', matchup: 'Seattle Seahawks @ Denver Broncos' },
    { ...b, id: 'HOU-JAX', away: 'Houston Texans', home: 'Jacksonville Jaguars', awayCode: 'HOU', homeCode: 'JAX', matchup: 'Houston Texans @ Jacksonville Jaguars' }];
};
const landing = page => page.locator('[data-landing="research"]');
const hero = page => page.locator('[data-research="hero"]');
const tile = (page, key) => page.locator(`[data-research="tiles"] [data-tile="${key}"]`).getByRole('button');
const row = (page, id) => page.locator(`.gx-prow[data-game="${id}"]`);
const game = page => page.locator('[data-research="game"]');
const team = page => page.locator('[data-research="team"]');
const heading = (scope, name) => scope.getByRole('heading', { name, level: 2, exact: true });
const back = page => page.getByRole('button', { name: 'Back', exact: true });

function gtlCalls(page) {
  const calls = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.origin === SUPABASE && url.pathname.startsWith('/functions/v1/gtl-api/')) calls.push(`${request.method()} ${url.pathname.replace('/functions/v1/gtl-api', '')}`);
  });
  return calls;
}
const world6 = (page, baseURL) => communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, prepare: WEEK6 });
async function openAt(page, address = '#research') {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto(`/${address}`);
  await signIn(page, 'luke', { navigate: false });
}
/** A fresh document at `address` with no history entry behind it: what a shared link opens. */
async function shared(page, address) { await page.goto('about:blank'); await page.goto(`/${address}`); }
async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}
/** Spec 3's phone rules for the page: no sideways scroll, layoutProblems, 44 px targets, no text under 12 px, axe. */
async function phoneProblems(page) {
  const problems = [];
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) problems.push('sideways scroll');
  problems.push(...(await page.evaluate(layoutProblems)));
  const report = await page.locator('.gx').first().evaluate(scope => {
    const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [hidden], .gx-sr-only');
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44).map(r => `small target ${r.name} ${r.w}x${r.h}`);
    const small = [...scope.querySelectorAll('*')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12)
      .map(el => `small text ${el.textContent.trim().slice(0, 40)}`);
    return [...targets, ...small];
  });
  problems.push(...report);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  problems.push(...axe.violations.map(v => `axe ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`));
  return problems;
}

test('the landing: one next-move card for this week’s games, four tiles, and no read of its own', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    const calls = gtlCalls(page);
    await openAt(page);
    await expect(hero(page)).toBeVisible();
    const n = world.state.games.length;
    await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText(new RegExp(`^(${n} games|Week 6 results)$`));
    await expect(hero(page).locator('[data-research="hero-line"]')).toHaveText(new RegExp(`^(\\d+ of ${n} kicked off|All ${n} games kicked off)$`));
    await expect(hero(page).locator('.gx-meter3-seg')).toHaveCount(n);
    await expect(page.locator('.gx-btn--primary')).toHaveCount(1);
    await expect(page.locator('[data-research="tiles"] > li')).toHaveCount(4);
    for (const [key, name] of [['games', /^Games, /], ['trends', /^Trends, /], ['fantasy', 'Fantasy, player rankings'], ['teams', 'Teams, all 32, records and margins']]) await expect(tile(page, key)).toHaveAccessibleName(name);
    await page.waitForLoadState('networkidle');
    expect(calls.filter(call => /\/(personal|lines\/|fantasy\/|research)/.test(call)), 'the landing reads only what the shell already reads').toEqual([]);
    for (const [key, address] of [['teams', /#research\/teams/], ['games', /#research\/games/]]) {
      await tile(page, key).click();
      await expect(page).toHaveURL(address);
      await back(page).click();
      await expect(landing(page)).toBeVisible();
      await expect(page.locator(`#gx-r-tile-${key}`), 'Back returns focus to the tile by its id').toBeFocused();
    }
    await hero(page).getByRole('button').click();
    await expect(page).toHaveURL(/#research\/games/);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('loading in the final shape: the landing card’s skeleton and the board’s skeleton rows are the real heights at 390 px', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page);
    await expect(hero(page)).toBeVisible();
    const card = await hero(page).evaluate(el => Math.round(el.getBoundingClientRect().height));
    let release; const held = new Promise(resolve => { release = resolve; });
    await page.route(`${SUPABASE}/functions/v1/gtl-api/community/read`, async route => { await held; await route.fallback(); });
    await page.reload();
    const skeleton = page.locator('[data-skeleton="landing"] .gx-skel-hero');
    await expect(skeleton).toBeVisible();
    const drawn = await skeleton.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(Math.abs(drawn - card), `the skeleton card is ${drawn}px, the card ${card}px`).toBeLessThanOrEqual(8);
    await expect(page.locator('[data-skeleton="landing"] .gx-skel-tile')).toHaveCount(4);
    release(); await page.unroute(`${SUPABASE}/functions/v1/gtl-api/community/read`);
    await expect(hero(page)).toBeVisible();
    await shared(page, '#research/games');
    const real = await row(page, 'SEA-DEN').evaluate(el => Math.round(el.getBoundingClientRect().height));
    let open; const wait = new Promise(resolve => { open = resolve; });
    await page.route(`${SUPABASE}/functions/v1/gtl-api/personal`, async route => { await wait; await route.fallback(); });
    await page.reload();
    const skel = page.locator('[data-skeleton="rows"] .gx-skel-row').first();
    await expect(skel).toBeVisible();
    const rowDrawn = await skel.evaluate(el => Math.round(el.getBoundingClientRect().height));
    expect(Math.abs(rowDrawn - real), `the skeleton row is ${rowDrawn}px, a row ${real}px`).toBeLessThanOrEqual(8);
    open();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('one game is a layer: a row, its heading focused, a reload, Back and Forward, the lip; a shared link closes to the board', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page, '#research/games');
    await row(page, 'SEA-DEN').click();
    await expect(page).toHaveURL(/#research\/games\?(.*&)?layer=game&item=SEA-DEN$/);
    await expect(heading(game(page), 'SEA @ DEN')).toBeFocused();
    await expect(game(page).getByRole('button', { name: 'Back to Games', exact: true })).toBeVisible();
    await expect(page.locator('.gx-prow[data-game]').first(), 'the board stays mounted, hidden, under the layer').toBeHidden();
    await page.reload();
    await expect(heading(game(page), 'SEA @ DEN')).toBeVisible();
    await expect(heading(game(page), 'SEA @ DEN'), 'a load never moves focus').not.toBeFocused();
    await page.goBack();
    await expect(row(page, 'SEA-DEN')).toBeVisible();
    await page.goForward();
    await expect(heading(game(page), 'SEA @ DEN')).toBeVisible();
    await game(page).getByRole('button', { name: 'Back to Games', exact: true }).click();
    await expect(row(page, 'SEA-DEN')).toBeVisible();
    await row(page, 'SEA-DEN').click();
    await back(page).click();
    await expect(page.locator('#gx-l-row-SEA-DEN'), 'Back returns focus to the row by its id').toBeFocused();
    await shared(page, '#research/games?layer=game&item=SEA-DEN');
    await expect(heading(game(page), 'SEA @ DEN')).toBeVisible();
    await back(page).click();
    await expect(row(page, 'SEA-DEN'), 'Back on a shared link closes one layer, to the board').toBeVisible();
    await back(page).click();
    await expect(landing(page)).toBeVisible();
    await shared(page, '#research/games?layer=nope&item=SEA-DEN');
    await expect(row(page, 'SEA-DEN')).toBeVisible();
    await expect(game(page)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('the pager swaps the game in place: the address follows, no history entry is added, focus stays on Next, Back lands on the board', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page, '#research/games');
    const first = await page.locator('.gx-prow[data-game]').first().getAttribute('data-game');
    const second = await page.locator('.gx-prow[data-game]').nth(1).getAttribute('data-game');
    await row(page, first).click();
    const length = await page.evaluate(() => history.length);
    const next = game(page).locator('[data-pager]').getByRole('button', { name: /^Next game/ });
    await page.evaluate(() => scrollTo(0, 300));
    await next.click();
    await expect(page).toHaveURL(new RegExp(`item=${second}$`));
    await expect(heading(game(page), second.replace('-', ' @ '))).toBeVisible();
    await expect(next).toBeFocused();
    expect(await page.evaluate(() => [history.length, scrollY])).toEqual([length, 0]);
    await page.goBack();
    await expect(row(page, second)).toBeVisible();
    await expect(game(page)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('one team is a layer: the Teams list, its address, its heading, the lip; a team from a game, then Back to the game', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page, '#research/teams');
    await expect(page.locator('[data-research="teams"] .gx-prow')).toHaveCount(32);
    await page.locator('.gx-prow[data-team="SEA"]').click();
    await expect(page).toHaveURL(/#research\/teams\?(.*&)?layer=team&item=SEA$/);
    await expect(heading(team(page), 'Seattle Seahawks')).toBeFocused();
    await expect(team(page).getByRole('group', { name: 'Team details' })).toBeVisible();
    await team(page).getByRole('button', { name: 'Back to Teams', exact: true }).click();
    await expect(page.locator('#gx-r-team-SEA')).toBeFocused();
    await shared(page, '#research/games');
    await row(page, 'SEA-DEN').click();
    await game(page).getByRole('button', { name: /^Seattle Seahawks, .*Open team$/ }).click();
    await expect(page).toHaveURL(/#research\/teams\?(.*&)?layer=team&item=SEA$/);
    await back(page).click();
    await expect(heading(game(page), 'SEA @ DEN')).toBeVisible();
    await shared(page, '#research/teams?layer=team&item=ZZZ');
    await expect(team(page)).toHaveCount(0);
    await expect(page.locator('.gx-prow[data-team="SEA"]')).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('layers never cross tabs: a game left open never rides into Home, the Research tab or a fresh Games tile', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page, '#research/games');
    await row(page, 'SEA-DEN').click();
    const tabs = page.getByRole('navigation', { name: 'Main' });
    await tabs.getByRole('button', { name: /^Home(, .+)?$/ }).click();
    await expect(page).toHaveURL(/#home$/);
    await tabs.getByRole('button', { name: /^Research(, .+)?$/ }).click();
    await expect(landing(page)).toBeVisible();
    await tile(page, 'games').click();
    await expect(page).toHaveURL(/#research\/games(\?season=&week=)?$/);
    await expect(game(page)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('motion: the layer rises in after a tap; the movement chart reveals on its first opening, transform only; never on a load or under reduced motion', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await storeBookLines(world, { spread: { 'SEA-DEN': -1.5, 'HOU-JAX': 2.5 }, total: { 'SEA-DEN': 43.5, 'HOU-JAX': 41.5 } });
    await sendBallot(world, 'luke', 'guess_total', { 'SEA-DEN': 41, 'HOU-JAX': 44 });
    await openAt(page, '#research/games');
    await row(page, 'SEA-DEN').click();
    expect(await game(page).locator('.gx-nest-card').getAttribute('data-enter')).toBe('in');
    const total = game(page).locator('[data-market-details="total"]');
    const summary = total.locator('summary', { hasText: 'Line movement' });
    await summary.click();
    const reveal = total.locator('.gx-md-plot .gx-reveal');
    await expect(reveal).toHaveAttribute('data-reveal', 'in');
    expect(await reveal.evaluate(el => el.getAnimations({ subtree: true }).map(a => a.animationName).sort())).toEqual(['gx-reveal-clip', 'gx-reveal-hold']);
    await settle(page);
    expect(await reveal.getAttribute('data-reveal')).toBeNull();
    expect(await reveal.evaluate(el => getComputedStyle(el).transform)).toBe('none');
    await summary.click(); await summary.click();
    expect(await reveal.getAttribute('data-reveal'), 'the reveal is the first opening’s only').toBeNull();
    await page.reload();
    expect(await game(page).locator('.gx-nest-card').getAttribute('data-enter'), 'a load draws no entrance').toBeNull();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await game(page).locator('[data-market-details="total"] summary', { hasText: 'Line movement' }).click();
    expect(await game(page).locator('[data-market-details="total"] .gx-reveal').getAttribute('data-reveal')).toBeNull();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await shared(page, '#research');
    await expect(hero(page)).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).length), 'nothing moves on the first paint').toBe(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('phone rules on every Research layer: 320 and 390 px, Dark and Light, the wide fallback font, 44 px targets, 12 px text, axe', async ({ page, baseURL }) => {
  const world = await world6(page, baseURL);
  try {
    await openAt(page);
    await expect(hero(page)).toBeVisible();
    const found = {};
    for (const { theme, width, wide = false } of [{ theme: 'dark', width: 390 }, { theme: 'light', width: 390 }, { theme: 'dark', width: 320 }, { theme: 'light', width: 320, wide: true }]) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.setViewportSize({ width, height: 844 });
      for (const address of ['#research', '#research/games', '#research/games?layer=game&item=SEA-DEN', '#research/teams', '#research/teams?layer=team&item=SEA']) {
        await shared(page, address);
        await page.waitForLoadState('networkidle');
        if (wide) await page.addStyleTag({ content: WIDE_FONT });
        await settle(page);
        const problems = await phoneProblems(page);
        if (problems.length) found[`${theme} ${width}${wide ? ' wide' : ''} ${address}`] = problems;
      }
    }
    expect(found).toEqual({});
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});
```

- [ ] **Step 2: Run it.** (Tasks 1–8 are committed, so a failure here is a real defect.)

Run: `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/next-research-layers.spec.js --reporter=line`
Expected: 8 passed, skipped 0. If the loading test reports a skeleton height off by more than 8 px, set
`.gx-skel-hero--meter`'s `min-height` in `ui/skeleton.css` (and its comment) or `.gx-l-skel .gx-skel-row`'s in
`lines/lines.css` to the measured value and run again; note the measured numbers for the register.

- [ ] **Step 3: Update `tests/cloud-browser/next-lines.spec.js` (keep every test).** Replace the helpers:

```js
const card = (page, id) => page.locator(`.gx-prow[data-game="${id}"]`);
/** D-69 step 3: one game is a layer in Research › Games (it was the game sheet). */
const game = (page, name) => page.locator('[data-research="game"]').filter({ has: page.getByRole('heading', { name, level: 2, exact: true }) });
/** D-69 step 3: a team from a game is Research › Teams › that team (it was the team sheet). */
const team = (page, name) => page.locator('[data-research="team"]').filter({ has: page.getByRole('heading', { name, level: 2, exact: true }) });
```

Then apply, in every test:
- `sheet(page, '<AWAY> @ <HOME>')` → `game(page, '<AWAY> @ <HOME>')`; `sheet(page, '<Team name>')` →
  `team(page, '<Team name>')`; `sheet(page, 'All trends' | 'Your pick' | 'Trends' | 'League bets')` stays (still sheets);
- closing a game: its `Close` button → `getByRole('button', { name: 'Back to Games', exact: true })`; `Escape` on a game →
  `page.goBack()`; `toHaveCount(0)` on the closed game stays, followed by `await expect(card(page, id)).toBeVisible()`;
- closing a team opened from a game: `Close` → `page.goBack()` (back to the game) or the lip `Back to Teams` where the
  test asserts the team list;
- focus returned to a card after closing → `await expect(page.locator(`#gx-l-row-${id}`)).toBeFocused()`;
- `title(page, 'Lines')` → `title(page, 'Games')`; raw `.gx-l-card` selectors → `.gx-prow[data-game]`;
- after a click that opens a chart (a `Line movement` summary, a team), call `await settle(page)` before reading any
  chart geometry.

These tests need more than the mapping; change each as written and keep its contract:

| Test | Contract kept, and how |
|---|---|
| the board: kickoff groups, YOU tags, a lock icon on each closed market… | The groups and their order; every closed Spread a lock with "Locked", never "—"; the open quotes; your YOU tags now asserted in each row's accessible name (`/Your spread pick/`) and in the game layer's "You on this game" rows; no writes |
| game details wait for opening and keep their frame, pager, close and explicit retry… | The frame is the layer's lip, heading and pager (each visible while `GameDetails-*.js` is held); close is the lip; the local retry unchanged |
| the game sheet and the All trends sheet open and close with Back… | The game layer opens from a row and closes with Back (`page.goBack()`); the All trends sheet still opens over it and closes with Back |
| team details load only on opening; closing, failed download and explicit retry… | The team layer from a game; `TeamView-*.js` still requested only on opening; closing is Back to the game; reads unchanged |
| Research › Games puts its first game above the tab bar at 390 x 844… | `.gx-prow[data-game]` first row's bottom is above the tab bar's top; the one meta line rule unchanged |
| loaded spread quotes keep the full team-name column on phones | In each row the title box and the value box do not overlap, and the value is not clipped (`scrollWidth <= clientWidth`) |
| a delayed market reply for a closed sheet cannot populate a different game | The same for a closed game layer (opened, closed with the lip, another game opened) |
| a direct game open checks results on demand, ignores a late reply after paging… | The direct open is the address `#research/games?layer=game&item=<id>`; paging with the layer's Next |
| axe in Light and Dark at 390, 320 and 1440 on the board, the game sheet and All trends | The board, the game layer and All trends |
| your pick sheet separates draft and locked references and returns focus to the game row | Unchanged: the Your pick sheet over the layer returns focus to its "You on this game" row |

- [ ] **Step 4: Update the other specs (keep every test).**

`tests/cloud-browser/next-gestures.spec.js`:
- helpers: `const card = (page, id) => page.locator(`.gx-prow[data-game="${id}"]`);`,
  `const place = page => page.locator('[data-research="game"] [data-pager] [aria-live="polite"]');`,
  `const pageButton = (page, which) => page.locator('[data-research="game"] [data-pager] .gx-sheet-page').nth(which === 'prev' ? 0 : 1);`,
  and `openLines` expects `heading 'Games'`; `openGame` expects
  `page.locator('[data-research="game"]').getByRole('heading', { name: game.title, level: 2, exact: true })` visible;
- "press feedback": the `card` target is the row (`button.gx-prow` dips to 0.97 and dims to 0.85; its transition is
  `transform, opacity` at `0.1s, 0.1s`); the Research root's one lime button is "Open games";
- "swipe to close": keep the whole test on a tall sheet that still exists: after `openGame`, open All trends
  (`page.locator('[data-research="game"]').getByRole('button', { name: /^All trends/ }).click()`), use
  `panel = sheet(page, 'All trends')`, and after each close assert focus on that "All trends" row (the opener);
- "swipe between games": `body = page.locator('[data-research="game"] .gx-pager-body')`; every `place`/`pageButton`
  assertion stays; the turn asserts the new heading instead of `sheet(page, order[1].title)`; "A new game opens at its
  top" becomes `await page.evaluate(() => scrollTo(0, 400)); … expect(await page.evaluate(() => scrollY)).toBe(0);`; the
  ⓘ drag uses `.gx-pager-body .gx-info-btn`; `barTraps` during the drag stays `[]`;
- "on a touch screen": the vertical drag scrolls the page (`scrollY` grows by more than 50, the game stays); the sideways
  drag turns the game; "the handle closes it" becomes Back closes it (`page.goBack()`, the row visible), with
  `barTraps` still `[]`;
- "skeletons": the board's skeleton is `[data-skeleton="rows"]` (`.gx-skel-row` blocks, same tint and no animation);
  the held market lines show their skeleton panels inside the game layer.

`tests/cloud-browser/next-game-notes.spec.js`: `openSheet` clicks `.gx-prow[data-game]` first; each
`page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true })` closing the game becomes
`page.locator('[data-research="game"]').getByRole('button', { name: 'Back to Games', exact: true })` (the
`page.once('dialog', …)` confirms stay: the leave guard asks on the lip as it did on Close); "Explore games" becomes
"Open games".

`tests/cloud-browser/next-research.spec.js`: the setup's `heading 'Lines'` → `'Games'`; line 288's `.gx-l-card` →
`.gx-prow`, and `gameDialog` → `page.locator('[data-research="game"]')` (its research cards and "Open matchup research"
unchanged; the research sheet still opens as a dialog over it).

`tests/cloud-browser/research-style-recovery.spec.js`: `card = page.locator('.gx-prow[data-game]').first()`;
`game = page.locator('[data-research="game"]')`; after the alert, `await page.goBack()` and
`await expect(game).toHaveCount(0)` in place of Escape; the weekly research sheet part unchanged.

`tests/cloud-browser/four-tab-redesign.spec.js`: after "Game details", expect
`page.locator('[data-research="game"]')` visible (not a dialog); press Escape once (the All trends sheet only); then
Back three times: to the Trends game layer, to "This week", to the landing (Back closes one layer at a time).

`tests/cloud-browser/next-trends.spec.js`, the "Game details · CAR @ PHI" test: expect the game layer
(`page.locator('[data-research="game"]').getByRole('heading', { name: 'CAR @ PHI', level: 2 })`) and the All trends
sheet over it; in the test that opens a trend by a tap, add after the trend layer shows:

```js
  // D-69 step 3: the opened trend's chart reveals after the tap, then rests; its win rate is a count-up at rest.
  const chart = page.locator('.gx-nest-chart .gx-reveal');
  await expect(chart).toHaveAttribute('data-reveal', 'in');
  await expect.poll(() => chart.getAttribute('data-reveal')).toBeNull();
  await expect(page.locator('.gx-nest-chart .gx-countup')).toHaveAttribute('data-count', 'rest');
```

`tests/cloud-browser/next-shell.spec.js`: the legacy `['#lines', 'Lines', '#research/games']` row's heading becomes
`'Games'`.

`tests/cloud-browser/next-phone-layout.spec.js`: add `'#research/games?layer=game&item=SEA-DEN'`, `'#research/teams'`
and `'#research/teams?layer=team&item=SEA'` after `'#research/trends'` in `ADDRESSES`; in the `#research/games` branch
the first `[data-game]` opens the game layer (`check(`${pass} game layer`)`).

`tests/cloud-browser/next-scroll-navigation.spec.js`: add the same three addresses after `'#research/trends'`.

- [ ] **Step 5: Run every touched spec.**

Run: `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/next-research-layers.spec.js tests/cloud-browser/next-lines.spec.js tests/cloud-browser/next-gestures.spec.js tests/cloud-browser/next-game-notes.spec.js tests/cloud-browser/next-research.spec.js tests/cloud-browser/research-style-recovery.spec.js tests/cloud-browser/four-tab-redesign.spec.js tests/cloud-browser/next-trends.spec.js tests/cloud-browser/next-shell.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js tests/cloud-browser/fantasy.spec.js tests/cloud-browser/research-fantasy-loading.spec.js tests/cloud-browser/next-home-layers.spec.js --reporter=line`
Expected: every test passes, skipped 0.

- [ ] **Step 6: Commit.**

```bash
git add tests/cloud-browser/next-research-layers.spec.js tests/cloud-browser/next-lines.spec.js tests/cloud-browser/next-gestures.spec.js tests/cloud-browser/next-game-notes.spec.js tests/cloud-browser/next-research.spec.js tests/cloud-browser/research-style-recovery.spec.js tests/cloud-browser/four-tab-redesign.spec.js tests/cloud-browser/next-trends.spec.js tests/cloud-browser/next-shell.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js
git diff --cached --stat
git commit -m "Research browser checks: the landing, game and team layers, the pager, motion, and the phone sweeps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If Step 2 changed a measured height, add `web/src/next/ui/skeleton.css` or `web/src/next/lines/lines.css` to that commit
and say "measured" in its message.

---

## Task 10 · Finish

### Task 10: Full suite, register, decision addendum, screenshots for Sean, PR

**Files:**
- Modify: `docs/COMPLETION_REGISTER.md`, `docs/DECISIONS.md`
- Temporary (never committed): `C:\Users\sbals\AppData\Local\Temp\claude\C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f\e86e4bf8-003c-4c44-b10c-b3127309473f\scratchpad\zz-step3-shots.spec.js`

- [ ] **Step 1: Run everything.**

```bash
node --test --test-concurrency=6 tests/*.test.mjs
npx vitest run
npm run typecheck && npm run build
npx playwright test --config playwright.cloud.config.js --reporter=line
```

Expected: `node --test` fails only `tests/research-intake.test.mjs` (Windows file mode, untouched code); Vitest, typecheck
and build pass; the full browser run passes with `skipped 0`. Record each count.

- [ ] **Step 2: Old-app retirement, old sheets and leaks (spec tests 12 and 13).**

```bash
grep -rn "from '\.\./\.\./[A-Z][A-Za-z]*\.jsx'" web/src/next/research web/src/next/lines web/src/next/teams web/src/next/trends web/src/next/fantasy
grep -rn "FantasyAccuracy\|FocusAction\|FocusRows" web/src/next/research web/src/next/fantasy
grep -rn "'sh.game'\|'sh.team'" web/src/next --include=*.jsx --include=*.js
```

Expected: the first two print nothing. The third prints exactly the registry lines, `feed/PostCard.jsx` (`sh.game`, the
League feed's kickoff rows) and `teams/TeamMatchup.jsx` (`sh.team`, its fallback for Play's pick cards). The leak scans
in `next-lines.spec.js` and `next-home.spec.js` passed in Step 1 with the rows and layers on screen.

- [ ] **Step 3: Screenshots for Sean (local fixtures only).** Write the scratchpad spec, copy it in for the run, delete
it after; never `git add` it. A 1500 px tall viewport keeps the fixed tab bar at the bottom of each full-page shot.

```js
// TEMPORARY (never committed): Research after D-69 step 3 at 390 px, Dark and Light, on local PGlite fixtures only
// (fictional accounts; no hosted data), for Sean's review of the step 3 build decisions.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';
const OUT = process.env.SHOTS_OUT;
const WEEK6 = state => {
  state.league.season = 2026; state.league.week = 6;
  const [a, b] = state.games;
  state.games = [{ ...a, id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', matchup: 'Seattle Seahawks @ Denver Broncos' },
    { ...b, id: 'HOU-JAX', away: 'Houston Texans', home: 'Jacksonville Jaguars', awayCode: 'HOU', homeCode: 'JAX', matchup: 'Houston Texans @ Jacksonville Jaguars' }];
};
test.use({ viewport: { width: 390, height: 1500 } });
test.setTimeout(600000);
test.beforeEach(() => test.skip(!pgliteAvailable || !OUT, 'Local PGlite and SHOTS_OUT required.'));

test('step 3 Research screenshots', async ({ page, baseURL }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, prepare: WEEK6 });
  try {
    await storeBookLines(world, { spread: { 'SEA-DEN': -1.5, 'HOU-JAX': 2.5 }, total: { 'SEA-DEN': 43.5, 'HOU-JAX': 41.5 } });
    await sendBallot(world, 'luke', 'guess_total', { 'SEA-DEN': 41, 'HOU-JAX': 44 });
    await page.addInitScript(() => { localStorage.setItem('gtl.app', 'next'); localStorage.setItem('gtl.motion', 'reduce'); });
    await page.goto('/#research');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="research"]')).toBeVisible();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      for (const [name, address] of [['landing', '#research'], ['games', '#research/games'], ['game', '#research/games?layer=game&item=SEA-DEN'],
        ['teams', '#research/teams'], ['team', '#research/teams?layer=team&item=SEA'], ['trends', '#research/trends']]) {
        await page.goto('about:blank');
        await page.goto(`/${address}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT, `390-${theme}-${name}.png`), fullPage: true });
      }
      await page.locator('.gx-nest-hero').first().click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `390-${theme}-trend.png`), fullPage: true });
    }
  } finally { await world.db.close(); }
});
```

```bash
SHOTS="C:/Users/sbals/AppData/Local/Temp/claude/C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f/e86e4bf8-003c-4c44-b10c-b3127309473f/scratchpad"
cp "$SHOTS/zz-step3-shots.spec.js" tests/cloud-browser/zz-step3-shots.spec.js
SHOTS_OUT="$SHOTS/step3-shots" npx playwright test --config playwright.cloud.config.js tests/cloud-browser/zz-step3-shots.spec.js --reporter=line
rm tests/cloud-browser/zz-step3-shots.spec.js
git status --short tests/cloud-browser
# Fantasy's report card: fantasy.spec.js already writes it at 390 px in both themes (Step 1 ran it).
find test-results -name "fantasy-report-390-*.png" -exec cp {} "$SHOTS/step3-shots/" \;
ls "$SHOTS/step3-shots"
```

Expected: 1 passed; `git status` shows nothing under `tests/cloud-browser`; in
`C:\Users\sbals\AppData\Local\Temp\claude\C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f\e86e4bf8-003c-4c44-b10c-b3127309473f\scratchpad\step3-shots\`
fourteen Research PNGs (`390-dark-landing.png` … `390-light-trend.png`) and `fantasy-report-390-dark.png`,
`fantasy-report-390-light.png`. If the `find` copies nothing, re-run `tests/cloud-browser/fantasy.spec.js` alone and copy
from its `test-results` folder. Look at each before handing them over.

- [ ] **Step 4: The register entry.** Insert at the top of `docs/COMPLETION_REGISTER.md`, under the title, filling every
`<…>` from Steps 1–3 (evidence only exists at build time):

```markdown
## D-69 design overhaul, step 3: Research — <Month D, YYYY>

Built on `claude/overhaul-step3-research` (stacked on step 2's #482) from the
[step 3 plan](superpowers/plans/2026-11-04-design-overhaul-step3-research.md), verified at `<full commit SHA>`,
[PR #<n>](https://github.com/seanbalz/guess-the-line/pull/<n>). Not merged or released. Research's first card is this
week's games and lines (the week meter, "K of N kicked off", "Open games"), then four kit tiles (Games, Trends, Fantasy,
Teams). Research › Games is picture rows; one game is a layer (`#research/games?layer=game&item=<id>`) holding the game
sheet's details and paging, with the movement chart revealing on its first opening; the sheet stays only for the League
feed. Research › Teams lists every team; one team is a layer (`#research/teams?layer=team&item=<code>`). Trends' win
rates count up and its opened chart reveals. Fantasy's report card is tiles and rows (the Track 1 owner opened
`web/src/next/fantasy/`; `FantasyAccuracy.jsx` stays for the old app). The kit gained PictureRow, ChartReveal, LayerPager,
KeptParent, list entrance and the meter skeleton (measured: card <N> px, row <N> px at 390). Every choice is a build
decision for Sean's review (D-69 addendum, step 3).
Evidence (local, at that commit): `node --test` <N> tests, <N> pass, 1 fails (`tests/research-intake.test.mjs`, the
Windows file-mode check on untouched code), skipped 0; Vitest <F> files, <T> tests pass; typecheck and build pass; the
full browser run <P> passed, skipped 0. Screenshots for Sean: 390 px Dark and Light.
Not yet: Sean's review of the step 3 decisions, the Track 1 owner's read of the "pace" item, the nine CI checks, the
release and his iPhone check (spec section 10).
```

- [ ] **Step 5: The decision addendum.** In `docs/DECISIONS.md`, after D-69's step 2 addendum, add:

```markdown
*Addendum, November 4, 2026 — Build decisions for Sean's review (step 3 Research).* Step 3 takes the spec's defaults
(Sean was not asked step 3 canvas questions); each is reversible and waits for his review of the screenshots:
(1) the first card's one picture is the week meter ("K of N kicked off"), since a verified-lines count would need the
board's line read on the landing; (2) the Games tile shows the next game (marks, kickoff time, "Sun · next game");
(3) the Trends tile is Home's; (4) the Fantasy tile shows "—" (its number needs the lazy Fantasy read) and Teams "32";
(5) "Research recommendations" leaves the landing (it stays on Bets and in every game layer); (6) the landing drops the
"Week N" line under its title; (7) the board's title "Lines" becomes "Games"; (8) board rows show the marks, matchup,
records or final score and the consensus Spread over its word, while the Total, your tags, the trend and the weather
move into the row's spoken name and the game layer; (9) the game layer replaces the game sheet on Research's paths, the
sheet staying for the League feed, and All trends, Your pick, Matchup research and League bets stay sheets over it;
(10) paging swaps the game in place, so Back lands on the board; (11) charts reveal once after a tap, never on a load,
by sliding a clip group and its content in opposite directions (transform only) instead of the spec's scaleX;
(12) Teams lists all 32 teams by name, a team from a game opens Research › Teams › that team, and Play keeps the team
sheet; (13) Trends' win rates count up, Players' numbers stay static (other players' guesses are not remembered on the
device, spec 8); (14) units rise in for lists in nesting cards and on Research's tiles and rows; (15) Fantasy's report
card is four tiles, a row per position and the misses behind one disclosure, and the method's name and version join the
rankings ⓘ from the snapshot. For the Track 1 owner: the ⓘ prints the snapshot's own method text, which says "pace" for
published pace weeks and in the usage 2.0 description; this build keeps every app string and every surface free of it.
Layout and navigation only; no game rule changes.
Plan: [2026-11-04-design-overhaul-step3-research.md](superpowers/plans/2026-11-04-design-overhaul-step3-research.md).
```

- [ ] **Step 6: Commit, push and open the PR.**

```bash
SHOTS="C:/Users/sbals/AppData/Local/Temp/claude/C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f/e86e4bf8-003c-4c44-b10c-b3127309473f/scratchpad"
git add docs/COMPLETION_REGISTER.md docs/DECISIONS.md
git diff --cached --stat && git ls-files --eol docs/COMPLETION_REGISTER.md docs/DECISIONS.md
git commit -m "Register D-69 step 3 (Research) and record its build decisions for Sean's review" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin claude/overhaul-step3-research
gh pr create --base claude/overhaul-step2-home --title "D-69 step 3: Research (first card, tiles, game and team layers) on the kit" --body-file "$SHOTS/step3-pr-body.md"
npm run sync:check
```

The PR body (written to `$SHOTS/step3-pr-body.md`, the scratchpad) says it is stacked on #482 (retarget to `main` once
#482 merges), lists the fifteen decisions, the old sheets that stay and their callers, the owner's conditions with the
test that pins each (`tests/next-fantasy-report.test.jsx`), the evidence counts and where the screenshots are, and ends
with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then update the register entry's PR number and
SHA in one more commit if they changed.

**Notes — risks to watch:**
- **Old sheets that stay.** `sh.game` (`lines/GameSheet.jsx`) for `feed/PostCard.jsx`'s kickoff rows; `sh.team`
  (`teams/TeamSheet.jsx`) for `play/PerGamePlay.jsx`'s `TeamMatchup`; `sh.allTrends`, `sh.yourPick`, `sh.research` and
  `sh.gameBets` open over the game layer. Two ways to show one game remain until the feed moves (step 4 or 5); both draw
  `GameDetailsSlot`, so the details stay one.
- **Swipe paging in a Nest.** The pager body is a page element, not a scrolling sheet: `touch-action: pan-y` lets the
  page scroll natively while a sideways drag turns the game; iOS Safari's edge swipe (browser Back) can win near the left
  edge, as it could over the sheet. The body's inline transform is on itself only (the gestures spec's `barTraps` stays
  `[]`). Paging is not a navigation, so the shell's navigation focus never runs; `LayerPager` scrolls the page to the
  top on a new game, and the Nest's layer key stays "game" so nothing re-enters.
- **The chart reveal.** Transform only, but the clip group is offscreen-left for 600 ms: geometry checks must settle
  first (the next-lines mapping says so); phone sweeps settle before measuring. `overflow: hidden` applies only while it
  plays, so the margin chart's overflow-visible tie rings are clipped for those 600 ms only.
- **The kept board.** The hidden board keeps its reads and timers running under the layer, as under the sheet; its h1
  stays in the DOM, hidden, after the layer's (the layer is drawn first).
- **Count-up storage.** One remembered value per trend slug per account (`gtl.next.countUp.v1.…`), cleared on sign-out;
  it grows with the trends a member opens over a season.
- **Back on a shared link** pushes the list's entry (as step 2's Who's in does), so browser Forward returns to the layer.

---

## Spec coverage

| Spec item | Where |
|---|---|
| 6 step 3 "First card: the next move (this week's games and lines), then tiles for Games, Trends, Fantasy and Teams" | Tasks 6 (model, screen), 9 (browser) |
| 6 step 3 "Games: the board becomes picture rows" | Tasks 1 (PictureRow), 3 |
| 6 step 3 "The game layer holds the lines, the movement chart (it reveals left to right; the slider stays), your pick, trends and the matchup statistics" | Task 4 (the slider and table stay in `MarketMovement`) |
| 6 step 3 "The game sheet's swipe paging stays inside the game layer" | Tasks 1 (LayerPager), 2 (swap is not a step), 4, 9 (gestures) |
| 6 step 3 "Trends: … entrance motion, count-ups and the chart reveal" | Tasks 1 (list stagger), 7, 9 (next-trends) |
| 6 step 3 "Fantasy: the old FantasyAccuracy.jsx is rebuilt as tiles and rows" | Task 8 (owner-approved scope and conditions) |
| 6 step 3 "Teams: the Team sheet becomes a layer, with the mark, record and margin chart" | Task 5 |
| 4.1 every layer has its own address; Back closes one; focus on the heading | Tasks 2, 4, 5, 9 |
| 4.3 entrance, settle back, the chart reveal (transform only) | Tasks 1, 4, 5, 7, 9 (scaleX deviation: Decisions item 11) |
| 4.4 count-ups | Task 7 |
| 4.5 loading in the final shape, error with Try again and the last copy | Tasks 1, 3, 6, 9 (measured) |
| 5 card anatomy (one lime button, ≤ six numbers, toned words, ≤ twelve words, picture rows) | Tasks 1, 3, 5, 6, 8 |
| 7 failure handling | Tasks 4 (layer waits and fails), 6 (landing fails and keeps the last copy) |
| 8 privacy (own data only; no hidden pick or line; device stores only your numbers) | Task 6 (D-31 test), Task 3 (lock never "—"), Task 7 (Players excluded), Task 9 (leak scans) |
| 9 test 4 (never on page load) | Tasks 1, 4, 5, 7 (reveal only after a tap), 9 (no animation on first paint) |
| 9 test 6 (reduced motion) | Tasks 1 (`ChartReveal` checks it), 9 |
| 9 test 7 (count-up from the last shown value) | Task 7 (unit), 9 (next-trends at rest) |
| 9 test 8 (nesting addresses: reload, shared link, Back, focus) | Tasks 2, 9 |
| 9 test 9 (transform and opacity only) | `tests/next-tokens.test.mjs` in Tasks 1, 3, 5, 6, 8 |
| 9 test 10 (fixed bars) and 11 (phone layout, 44 px, 12 px, axe, both themes, wide font) | Task 9 (new spec, gestures, scroll navigation, phone layout) |
| 9 test 12 (gates: no hidden pick or line in a tile or row) | Tasks 3, 6, 9 |
| 9 test 13 (old-app retirement) | Task 8 (FantasyAccuracy out of the new app), Task 10 Step 2 |
| 10 delivery (frontend only, register evidence, PR, iPhone check after release) | Task 10 |
