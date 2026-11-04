# Design overhaul step 4: Bets (light touch) — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** rebuild Bets on the step 0–3 kit, spec section 6 "Step 4 · Bets (light touch)" with spec 5A:
- the next-move card (kit `NextMoveCard`): "Place your picks" while any game of the published week is still to kick
  off, otherwise "Track a bet"; then five kit tiles in two columns: My bets, Your picks, Everyone, Recommended, Your gap;
- My bets keeps the November 1 Roomy cards and filters (D-72) unchanged; a tracked ticket that settles as a win is a
  small moment (`betWin`) that pops its own ticket's "Won" pill once, only from that card, never on launch, only from a
  fresh read; a loss is quiet;
- Your picks (D-67): its game cards rise in after a tap, and a confirmed placement (the fresh read after the write shows
  the saved terms) pops each placed bet's "Your bet" tag; a pending request or a lost reply pops nothing;
- Everyone and Recommended: picture rows, faces (Everyone) or team marks (Recommended) first; Everyone's gates (D-31,
  D-36) unchanged, the leak scan extended to the new rows;
- Your gap (the old app's `VirtualUnits.jsx` Recommended view, D-77's hit-rate hero first) rebuilt in
  `web/src/next/bets/gap/` as tiles and rows on the same data, one gap as its own layer
  (`#bets/recommended?layer=gap&item=SEA-DEN:total`); the new app stops importing `VirtualUnits.jsx` (spec test 13), the
  old app keeps it.

**Architecture:**
- **Sections are screens, as Play's and Research's are.** Each section has its own address (the five already exist:
  `#bets/active` and its siblings, `#bets/virtual`, `#bets/everyone`, `#bets/research`, `#bets/recommended`), its title
  (one word with its tile), its ⓘ and the top bar's Back; a tap focuses its heading, Back returns focus to its tile by a
  stable id. The nesting card with lips frames only the deeper layers: one gap (new) and one assessment (D-66, kept).
  This keeps the Roomy cards full width, exactly as Sean approved them (Decisions for Sean, item 2).
- **Addresses in the reducer.** One new layer: Bets' generic `layer` and `item` keys, allowlisted (`BETS_LAYERS` in
  `shell/state.js`, the pattern of step 3's `RESEARCH_LAYERS`): only `layer=gap` with an item `SEA-DEN:total` on
  `#bets/recommended`. Opening or closing a gap is a step; a shared link's Back closes it to Your gap.
- **Pure first.** The landing's words come from `bets/betsModel.js`; the moments from `bets/betMoments.js` and
  `place.js` `confirmedPlacements`; Your gap's rows, tiles, words and checks from `bets/gap/gapModel.js` over
  `shared/recommended-bets.mjs` (unchanged). node:test or static-markup tests pin each.
- **No new read, route, migration or Edge Function.** The landing reads only the app's shared reads (`GET /personal`,
  as Home and Research do; the Community read) and the ticket summary Home's My bets tile already reads. Sections read
  what they read today; My bets also reads the shared ticket summary (15 s reuse) for its win moment.
- **Server clock only.** The landing counts kickoffs with `useServerNow(personal.now, at, { until })`; Your gap's
  kickoff closing uses the recommendations read's `personal.now` (the old screen used the device clock).

**Tech stack:** React 19, plain CSS under `.gx` with `--gx-` tokens, `node:test` for `tests/*.test.mjs`, Vitest for
`tests/*.test.jsx` (static-markup renders; `useEffect` mocked to run in place for hook tests, as
`tests/next-play-week-locked.test.jsx` does), Playwright for `tests/cloud-browser/*.spec.js`.

**Spec:** `docs/superpowers/specs/2026-11-02-design-overhaul-design.md` (D-69), sections 3, 4, 5, 6 "Step 4 · Bets", 7,
8, 9 and 10. Sean was not asked step 4 canvas questions; the build takes the spec's defaults, and every choice that
changes what a player sees is listed under "Decisions for Sean" and recorded in Task 9's D-69 addendum (reversible).
Lessons from steps 2 and 3 (`.superpowers/sdd/progress-step2.md`, `progress-step3.md`) are folded into the constraints
and tests below.

**Status:** written November 4, 2026. Not built.

**Before you start:**
- Step 3 (PR #486) must be merged: this step uses its kit (`PictureRow`, `KeptParent`, `NextMoveCard`, `StaleLine`,
  `useLayerFocus`, `useEntrance`, `.gx-stagger`, the meter skeleton). Create a new worktree from freshly fetched
  `origin/main`, under `C:\Users\sbals\betting-repo\.claude\worktrees\`, on branch `claude/overhaul-step4-bets`
  (`docs/REPOSITORY_SYNC.md`; never switch or reset another session's checkout). If #486 has not merged, branch from
  `origin/claude/overhaul-step3-research` instead and retarget the PR to `main` once it merges.
- The worktree needs `node_modules` (a junction to `C:\Users\sbals\betting-repo\node_modules`) and `.local/sql-check`,
  or the PGlite browser specs skip silently; every browser report must say `skipped 0`.
- Do not build from `C:\Users\sbals\betting-repo\.claude\worktrees\guess-the-points-design-0bfb1f`: on November 4 its
  working tree held another session's uncommitted `TEMP-WIDE-PROBE` edits in four step 3 specs.

## Global Constraints

Copied from the spec, the brief and steps 2–3's reviews. Each task's requirements include these.

- **First card (spec 5A):** the kit `NextMoveCard` (`Card variant="hero"`, labelled by its eyebrow), class `gx-b-hero`,
  `data-bets="hero"`, `data-kind` `place` or `track`, its one picture the kit `Meter`, one meta line
  (`data-bets="hero-line"`), the screen's one lime button (id `gx-b-hero-action`). Words (exact):
  - a game still to kick off: `Week N · Your next move` / `Place your picks` / meter filled = games still open /
    `K of N games still open` (`game` when N is 1) / `Place picks` → `#bets/virtual`;
  - otherwise: `Your next move` / `Track a bet` / meter filled = wins among your last five settled tracked tickets /
    `W of your last K settled tickets won` (`ticket` when K is 1), or `No settled tickets yet`, `Loading your tickets…`,
    `Your tickets didn’t load` / `Add a bet` → `#bets/add`.
- **Tiles:** the kit `Tile` in `.gx-tiles` (`data-bets="tiles"`, `.gx-stagger`), in this order with these ids and glyphs:
  My bets `gx-b-tile-mybets` (`DESTINATION_ICONS.activeTickets`), Your picks `gx-b-tile-picks` (`.virtualUnits`),
  Everyone `gx-b-tile-everyone` (`.everyone`), Recommended `gx-b-tile-recommended` (`.researchPicks`), Your gap
  `gx-b-tile-gap` (`.guessGap`). NEW only on My bets (a waiting tracked win, `useNewCount(SCOPES.bets)`).
- **Sections:** `h1.gx-t-title` with the section's word (`My bets`, `Your picks`, `Everyone`, `Recommended`,
  `Your gap`), its ⓘ, `data-bets-section` `mybets|picks|everyone|recommended|gap`. My bets' one meta line:
  `Active tickets · all weeks`, `Settled tickets · all weeks`, `Add a bet` (none on `#bets/tracked`). No section draws
  another section's switch. Every section's address is unchanged.
- **Addresses:** `#bets/recommended?layer=gap&item=<GAME>:<market>` (item `^[A-Z]{2,3}-[A-Z]{2,3}:(spread|total)$`); any
  other `layer`/`item` on any Bets view is dropped, so the address draws the section. Opening or closing a gap is a step;
  its lip ("Back to Your gap") and Back close it; on a shared link or a reload Back closes it to Your gap, never to the
  landing; a fresh destination (a tile, a tab, another tab's link) never carries it; layers never cross tabs.
- **Focus:** a navigation into a section lands on its `h1` (the shell's; the lazy Recommended and Your gap screens call
  `useLayerFocus` on their `h1[data-route-focus]`); the gap layer focuses its Nest heading after a navigation; a direct
  load never moves focus; Back returns focus to the opener by stable id: tiles `gx-b-tile-<key>`, gap rows
  `gx-b-gap-<GAME>-<market>`, assessment rows `gx-b-ra-<routeId>`.
- **Moments (spec 4.2, D-58):** `betWin` is small, a loss quiet (it reports nothing). A tracked win's candidate comes only
  from a fresh ticket summary read (`useTicketSummary`); it waits on its own ticket's card (`ticketScope(id)`) and is
  counted (NEW) on the My bets tile (`SCOPES.bets`, which nothing opens). A placement's moment plays only after the fresh
  `/bets/read` that follows the write confirms the sent terms. Pops are `data-moment="pop"` (moments.css, `gx-pop-in`,
  `--gx-dur-base`, `--gx-ease-pop`); no buzz (the 10 ms buzz is the lock-in's).
- **Motion:** durations `--gx-dur-*`, easings `--gx-ease-*`; keyframes animate only transform and opacity (no new
  keyframes in this step); reduced motion (`prefers-reduced-motion` or `data-motion="reduce"`) stops everything. Units
  rise in 30 ms apart for the first six after the member's own navigation (`useEntrance`, `.gx-stagger`), never on a
  load, never twice for one visit (Your picks keeps its board on screen while a refresh reads).
- **Loading in the final shape:** the landing `Skeleton shape="landing" hero="meter" count={5}` (`gx-b-skel`); Your
  gap `shape="rows" count={4}` on `gx-gap-skel`; Everyone `shape="rows" count={4}` on `gx-ev-skel`. Task 8 measures each
  against the real card or row at 390 px: a next-move card within 64 px (CI's Linux fallback fonts) and never taller
  than the card + 8; a row within 8 px.
- **Phone rules:** no sideways scroll at 320 and 390 px in Light and Dark, and at 320 with the wide-font probe
  `.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }` on every new or changed address; targets
  ≥ 44 px; no text under 12 px; nothing clipped; axe clean; action rows wrap (`flex-wrap`) rather than clip; no
  transform, filter or will-change on any ancestor of the tab bar, dock or top bar; every stylesheet passes
  `tests/next-tokens.test.mjs` (tokens only: `--gx-space-*`, `--gx-size-*`, `--gx-radius-*`, colour tokens).
- **Words:** no surface sentence over twelve words (fine print behind ⓘ or D-77's own About toggle); a real space
  between a number and its word ("8 locked guesses"; amounts keep the app's "1.5U", "+2.55U"); a toned word always says
  its state (D-38); one lime button per screen; teams as D-62 marks.
- **Gates and privacy (D-31, D-36, spec 8):** the landing shows no line, price, pick or other player's bet; Everyone's
  model (`everyone.js`) is unchanged, so a friend's line, price, book and result show only where the reply opens that
  market for the viewer; the device stores only moment ids (`gtl.` seen record).
- **Frontend only:** no migration, Edge Function, server, workflow or data change; no deploy.
- **Old app:** `web/src/VirtualUnits.jsx`, `web/src/RecommendationTrends.jsx`, `web/src/recommendedBets.css` and
  `web/src/SocialBetTracker.jsx` are not edited. The new app keeps importing `SocialBetTracker.jsx` (its documented
  adapter) and stops importing the other three.
- **Files:** LF line endings. Before every commit run `git diff --cached --stat` and `git ls-files --eol <files>` (every
  line `i/lf w/lf`); a fully rewritten file means CRLF crept in: `sed -i 's/\r$//' <file>`. Commit only named files.
- **Commits:** every message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tests keep their contracts (R6):** a changed test keeps or replaces its contract; each task and Task 8's tables
  name every replacement, old → new.

## Test commands

Confirmed in `package.json` and `vitest.config.ts` (Vitest includes `tests/**/*.test.jsx`; `node --test` runs
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

The spec's defaults, taken without a canvas round; each changes something a player sees, so each is listed, and Task 9
records them as the D-69 addendum "Build decisions for Sean's review (step 4 Bets)". All are layout, words or
navigation; no game rule changes.

1. **Names.** The tiles say the spec's five words. "Recommended" opens Research recommendations (`#bets/research`, the
   independent assessments; step 3 promised they stay on Bets). "Your gap" opens Your guess vs. market
   (`#bets/recommended`, the old `VirtualUnits.jsx` view), and D-77's hit-rate hero stays its first card. (D-77 calls
   that view "Recommended"; the brief's "Recommended keeps D-77's hero" is read as that view.) The addresses keep their
   names so saved links, Home's My bets tile and Research's buttons still work.
2. **Sections are screens**, as Play's and Research's sections are: title, ⓘ and the top bar's Back. The nesting card
   with lips frames only one gap and one assessment. The Roomy cards stay full width (a nesting card would narrow them
   to 254 px of content at 320 px).
3. **The landing reads the shared `GET /personal`** (as Home's This week and Research's landing do) for the week's
   games and the server's clock. On a cold `#bets` load that is one shared read; from Home it is already in memory. No
   Bets, line or research read happens on the landing.
4. **First card:** "Place your picks" while any game is still open (meter filled = games still open, "K of N games
   still open", "Place picks"); otherwise "Track a bet" with your last five settled tracked tickets as its meter
   ("3 of your last 5 settled tickets won", "Add a bet"). During a season the week is almost always open, so "Add a
   bet" lives in My bets (its own Add bet button) most of the time.
5. **Tiles:** My bets shows your active tickets (Home's tile) and NEW for a waiting win; Your picks the games open to
   bet (still to kick off, prices open to you: locked in or sat out), "Lock in to see prices" with none; Everyone the
   Community's faces and player count ("—" for a private league); Recommended "—" with "Research assessments" (its read
   stays lazy, as Fantasy's on Research); Your gap your locked guesses this week.
6. **Switches leave the sections:** the Tracked / Your gap / Virtual buttons and the Your picks / Everyone switch; the
   tiles replace them (one layer, one job). The cross-links "Research recommendations" (in Your gap) and "Your guess vs.
   market" (in Recommended) leave too; the landing's tiles reach both.
7. **My bets' title is "My bets"** on all four addresses, the list it opened its one meta line ("Active tickets · all
   weeks", "Settled tickets · all weeks", "Add a bet"). The My bets tile opens Active tickets (as Home's does); Overview
   and Settled stay in the tracker's own controls.
8. **Titles say the tile's word:** "Your picks" (was "Virtual Units"), "Everyone" (was "Everyone’s picks"),
   "Recommended" (was "Research recommendations"), "Your gap" (was "Your guess vs. market"). The intro sentences move
   behind each ⓘ.
9. **A tracked win** pops its own ticket's "Won" pill once, when that card first shows after you navigate; a loss
   reports nothing. Its data is the ticket summary (your own tracked tickets), which My bets now also reads (shared,
   15 s reuse). A ticket you settle yourself plays when that summary next refreshes (focus, the timer).
10. **A placement** is one small moment: every bet it saved pops its "Your bet" tag together, after the fresh read shows
    the saved terms; no vibration (the buzz is the lock-in's).
11. **Your picks keeps its board on screen while it refreshes** (no skeleton flash): "Refresh prices" reads
    "Refreshing…", the price chips wait, and a failed refresh keeps the last prices with Try again.
12. **Everyone's rows are picture rows:** face, name, market and terms (or the lock line), units on the right over the
    result word; the game cards keep their marks heading. The banner shortens to twelve words: "Friends’ lines show once
    you lock in that game, or at kickoff." The League bets sheet (the same rows) changes with it.
13. **Recommended's rows are picture rows:** the game's marks, the assessment, the price on the right over its
    assessment word; the colour tints stay and the word says the state.
14. **Your gap:** D-77's hero first, then the market switch, four stat tiles (To act on, Gaps, Biggest gap, Your card),
    the ranked rows (marks, "SEA @ DEN · Total", "6.5 pt gap · Review Over · 2h old", the % on the right over "To act
    on", "Saved", "On your card" or "No quote"), "Your card" (unsaved selections whose row is not shown), "Your virtual
    card" (saved picks: terms, units or result). A saved pick's final score no longer shows on its row. One gap opens as
    a layer with your guess and the consensus, trends, both sides (text-labelled traffic lights), the suggestion, Track
    this bet, Play with Virtual Units and the review card.
15. **Your gap's clock is the server's** (the recommendations read's `now`), not the device's: a review closes when the
    server's clock passes kickoff.
16. **Your gap's words follow the app's style:** "Over 44.5 · −110 · 2U · BetMGM" (was "Over +44.5 (−110) · 2U ·
    BetMGM"); unit chips are named "2 units"; sentences over twelve words shorten (for example "Added to your card.
    Check the terms, then place it.").
17. **The old app keeps `VirtualUnits.jsx`** (its Virtual Units page and Recommended tab) unchanged.

## File structure

| File | Change |
|---|---|
| `web/src/next/shell/state.js`, `shell/router.js` | `BETS_LAYERS`, `betsLayerOf`, the gap step, Back, allowlist |
| `web/src/next/bets/betsNav.js` | Create: names, section addresses, ids, opening helpers |
| `web/src/next/bets/betsModel.js`, `BetsLanding.jsx`, `landing.css` | Create: the landing |
| `web/src/next/bets/Bets.jsx`, `bets/bets.css` | Sections as screens; switches removed; Your gap lazy (Task 7) |
| `web/src/next/moments/catalog.js` | `SCOPES.bets`, `ticketScope` |
| `web/src/next/bets/betMoments.js`, `useBetWins.js` | Create: the tracked win moment |
| `web/src/next/bets/TrackedBetRow.jsx` | Opens its ticket's scope; the Won pill pops |
| `web/src/next/bets/place.js`, `PlaceBets.jsx`, `place.css` | `confirmedPlacements`; kept board; entrance; tag pop |
| `web/src/next/bets/EveryoneBets.jsx`, `everyone.js`, `everyone.css` | Picture rows; banner words |
| `web/src/next/research/Assessments.jsx`, `assessments.css` | Title "Recommended"; picture rows; no cross-link |
| `web/src/next/bets/gap/gapModel.js`, `useGap.js`, `YourGap.jsx`, `GapParts.jsx`, `GapHero.jsx`, `GapLayer.jsx`, `GapReview.jsx`, `GapTrends.jsx`, `gap.css` | Create: Your gap |
| Tests, new: `next-bets-landing.test.mjs`, `next-bets-landing-ui.test.jsx`, `next-bets-sections.test.jsx`, `next-bets-moments.test.mjs`, `next-bets-moments-ui.test.jsx`, `next-bets-recommended-ui.test.jsx`, `next-bets-gap.test.mjs`, `next-bets-gap-ui.test.jsx`, `cloud-browser/next-bets-layers.spec.js` | New contracts |
| Tests, updated: `next-router.test.mjs`, `next-destination-icons.test.jsx`, `next-moments.test.mjs`, `next-bets-place.test.jsx`, `next-bets-everyone-ui.test.jsx`, `next-refresh-busy.test.jsx`, `next-app-view.test.mjs`; cloud-browser `next-bets-live`, `next-bets-everyone`, `recommended-bets`, `research-assessments`, `next-phone-layout`, `next-scroll-navigation` | Layout and navigation changes |
| `docs/COMPLETION_REGISTER.md`, `docs/DECISIONS.md` | Step 4 entry, D-69 addendum |

## Task map

| Task | What it builds |
|---|---|
| 1 | Bets' gap layer address in the reducer and router; the nav helpers |
| 2 | The landing: the next-move card and five tiles |
| 3 | The sections as screens: titles, ⓘ, no switches |
| 4 | Moments: a tracked win, a confirmed placement; Your picks' entrance and kept board |
| 5 | Everyone and Recommended as picture rows |
| 6 | Your gap: the model, the state, D-77's hero, tiles and rows |
| 7 | One gap as a layer; the review; Bets stops importing `VirtualUnits.jsx` |
| 8 | Browser specs: the new Bets spec, every touched spec updated, the phone and fixed-bar sweeps |
| 9 | Finish: full suite, register, D-69 addendum, screenshots for Sean, PR |

Shared names, used exactly as written: from `shell/state.js` `BETS_LAYERS`, `betsLayerOf(view)`; from
`bets/betsNav.js` `BETS_SECTIONS`, `BETS_NAMES`, `SECTION_VIEW`, `SECTION_OF`, `LIST_WORDS`, `BETS_FRESH`, `tileId`,
`HERO_ACTION_ID`, `gapItem`, `gapRowId`, `gapTitle`, `openView`, `openSection`, `openGap`, `closeGap`; from
`bets/betsModel.js` `BETS_TILE_ICONS`, `BETS_COPY`, `betsClock`, `clockUntil`, `recentResults`, `ownWeek`, `betsHero`,
`betsTiles`; `BetsLanding`; from `moments/catalog.js` `SCOPES.bets`, `ticketScope`; from `bets/betMoments.js`
`BET_WIN_SOURCE`, `betWinId`, `betWinMoments`; `useBetWins`; from `place.js` `confirmedPlacements`; from
`bets/gap/gapModel.js` `GAP_COPY`, `GAP_FINE_PRINT`, `MARKET_NAME`, `sideName`, `lineText`, `termsText`, `marketNumber`, `quoteAge`,
`gapUnits`, `closedReason`, `sameQuote`, `gapRow`, `gapTiles`, `savedRows`, `pendingRows`, `placeBody`, `confirmsChoice`,
`staleKeys`, `trackTicket`, `weekOptions`, `gapTrendCards`; `useGap`, `YourGap` (default export), `GapList`, `marks`, `GapMessages`, `GapHero`,
`GapLayer`, `GapReview`, `GapTrends`, `GapTrendsView`. Test hooks: `[data-landing="bets"]`, `[data-bets="hero"]`,
`[data-bets="hero-line"]`, `[data-bets="tiles"] li[data-tile]`, `[data-bets-section]`, `[data-ticket]`,
`[data-bets="place"] .gx-place-games`, `.gx-prow[data-pick]`, `.gx-prow[data-person]`, `[data-gap-row]`,
`[data-bets-layer="gap"]`, `[data-gap="hero|list|tiles|your-card|saved-card|notice|error|review|saved|selected"]`,
`[data-side][data-value-color]`.

---

## Task 1 · Bets' gap layer address

### Task 1: One gap is a step with its own address; any other Bets layer value draws the section

The router keeps `layer` and `item` on any tab (`KEYS`), so today `#bets/virtual?layer=x&item=y` reaches `views.bets`
untested. What is missing: the allowlist, the step, Back on a shared link, and the clearing that keeps a gap from
riding into a fresh destination. The five section addresses already exist and are steps (`navigationPatch`, `view`).

**Files:**
- Create: `web/src/next/bets/betsNav.js`
- Modify: `web/src/next/shell/state.js`, `web/src/next/shell/router.js`, `tests/next-router.test.mjs`

**Interfaces:**
- Consumes: `gameName` (`research/researchNav.js`), `RESEARCH_LAYER_CLEARED` and the step 3 Back path (`shell/state.js`).
- Produces: `BETS_LAYERS = { recommended: { layer: 'gap', item(value) } }`, `betsLayerOf(view)` → `{ layer, item } | null`
  (`view` is `views.bets` or a parsed place's view); `LAYER_KEYS.bets = ['layer', 'item']`; from `bets/betsNav.js` the
  names listed above.

- [ ] **Step 1: Write the failing tests.** In `tests/next-router.test.mjs`, change the state import to
`import { BETS_LAYERS, HOME_LAYER_IDS, RESEARCH_LAYERS, betsLayerOf, canGoBack, initialState, isDetail, layer, reduce, researchLayerOf } from '../web/src/next/shell/state.js';`,
add `import { BETS_FRESH } from '../web/src/next/bets/betsNav.js';`, and append (the `at` helper is step 3's, already in
the file):

```js
const GAP = '#bets/recommended?layer=gap&item=SEA-DEN%3Atotal';

test('D-69 step 4: one gap is a Bets layer with its own address; any other layer or item draws the section', () => {
  const place = placeFromFragment(GAP);
  assert.deepEqual([place.tab, place.view.view, place.view.layer, place.view.item], ['bets', 'recommended', 'gap', 'SEA-DEN:total']);
  const opened = initialState(place);
  assert.deepEqual(betsLayerOf(opened.views.bets), { layer: 'gap', item: 'SEA-DEN:total' });
  assert.equal(at(opened, 'bets'), GAP, 'a reload or a shared link reopens it');
  assert.equal(isDetail(opened), true);
  for (const fragment of ['#bets/recommended?layer=nope&item=SEA-DEN%3Atotal', '#bets/recommended?layer=gap&item=SEA-DEN',
    '#bets/recommended?layer=gap&item=SEA-DEN%3Amoneyline', '#bets/recommended?layer=gap&item=%3Cx%3E',
    '#bets/virtual?layer=gap&item=SEA-DEN%3Atotal', '#bets/active?layer=who', '#bets?layer=gap&item=SEA-DEN%3Atotal']) {
    const state = initialState(placeFromFragment(fragment));
    assert.equal(betsLayerOf(state.views.bets), null, fragment);
    assert.doesNotMatch(at(state, 'bets'), /layer=|item=/, `${fragment}: the address draws the section`);
  }
  assert.deepEqual(Object.keys(BETS_LAYERS), ['recommended']);
});

test('D-69 step 4: opening a gap is a step; the lip and Back close it; on a shared link both close it to Your gap, never to the landing', () => {
  const list = initialState({ tab: 'bets', view: { view: 'recommended' } });
  const gap = reduce(list, { type: 'view', tab: 'bets', patch: { layer: 'gap', item: 'SEA-DEN:total' } });
  assert.deepEqual([gap.trail.length, gap.navMode], [1, 'go'], 'opening a gap is a step');
  for (const closed of [reduce(gap, { type: 'back' }), reduce(gap, { type: 'view', tab: 'bets', patch: { layer: undefined, item: undefined } })]) {
    assert.deepEqual([closed.views.bets.view, betsLayerOf(closed.views.bets), closed.trail.length], ['recommended', null, 0]);
  }
  const linked = initialState(placeFromFragment(GAP));
  assert.equal(linked.trail.length, 0);
  for (const closed of [reduce(linked, { type: 'back' }), reduce(linked, { type: 'view', tab: 'bets', patch: { layer: undefined, item: undefined } })]) {
    assert.deepEqual([closed.tab, closed.views.bets.view, closed.navMode, betsLayerOf(closed.views.bets)], ['bets', 'recommended', 'back', null]);
  }
  assert.equal(reduce(reduce(linked, { type: 'back' }), { type: 'back' }).views.bets.view, undefined, 'the next Back leaves for the landing');
});

test('D-69 step 4: each Bets section is a step from the landing with its own address; Back returns to the landing', () => {
  const landing = initialState(placeFromFragment('#bets'));
  for (const [view, path] of [['active', '#bets/active'], ['virtual', '#bets/virtual'], ['everyone', '#bets/everyone'], ['research', '#bets/research'], ['recommended', '#bets/recommended']]) {
    const opened = reduce(landing, { type: 'go', tab: 'bets', view: { view, ...BETS_FRESH } });
    assert.equal(at(opened, 'bets').split('?')[0], path);
    assert.equal(opened.trail.length, 1);
    assert.equal(reduce(opened, { type: 'back' }).views.bets.view, undefined);
    assert.equal(initialState(placeFromFragment(path)).views.bets.view, view, 'a reload reopens it');
  }
});

test('D-69 step 4: a Bets layer never rides into a fresh destination or another tab, and other tabs’ layers never reach Bets', () => {
  const gap = initialState(placeFromFragment(GAP));
  const home = reduce(gap, { type: 'tab', tab: 'home' });
  assert.equal(home.views.home.layer, undefined, 'a Bets layer never reaches Home');
  assert.equal(at(reduce(home, { type: 'tab', tab: 'bets' }), 'bets'), '#bets', 'the Bets tab opens the landing');
  assert.equal(betsLayerOf(reduce(gap, { type: 'go', tab: 'bets', view: { view: 'recommended', ...BETS_FRESH } }).views.bets), null, 'the Your gap tile opens the list');
  assert.equal(at(reduce(gap, { type: 'go', tab: 'research', view: { section: 'teams' } }), 'research'), '#research/teams', 'a Bets layer never reaches Research');
  assert.equal(at(reduce(gap, { type: 'go', tab: 'play', view: { section: 'score' } }), 'play'), '#play/score', 'a Bets layer never reaches Play');
  const who = initialState(placeFromFragment('#home?layer=who'));
  assert.doesNotMatch(at(reduce(who, { type: 'go', tab: 'bets', view: { view: 'recommended' } }), 'bets'), /layer=|item=/, 'Home’s layer never reaches Bets');
  const team = initialState(placeFromFragment('#research/teams?layer=team&item=SEA'));
  assert.doesNotMatch(at(reduce(team, { type: 'go', tab: 'bets', view: { view: 'recommended' } }), 'bets'), /layer=|item=/, 'Research’s layer never reaches Bets');
  assert.equal(betsLayerOf(reduce(gap, { type: 'restore', place: placeFromFragment('#bets/recommended') }).views.bets), null, 'a restored list entry is the list');
});

test('D-69 step 4: browser Back closes the gap layer; Forward and a reload reopen it', async () => {
  const win = fakeWindow('https://gtl.test/#bets/recommended'); const shell = app(win);
  shell.dispatch({ type: 'view', tab: 'bets', patch: { layer: 'gap', item: 'SEA-DEN:total' } });
  await settle();
  assert.deepEqual(win.stack(), ['#bets/recommended', `[${GAP}]`]);
  win.history.back(); await settle();
  assert.equal(betsLayerOf(shell.state.views.bets), null);
  assert.equal(win.location.hash, '#bets/recommended');
  win.history.forward(); await settle();
  assert.equal(shell.state.views.bets.item, 'SEA-DEN:total');
  shell.connection.disconnect();
  const reloaded = app(win);
  assert.deepEqual(betsLayerOf(reloaded.state.views.bets), { layer: 'gap', item: 'SEA-DEN:total' });
  reloaded.connection.disconnect();
});
```

- [ ] **Step 2: Run them and see them fail.**

Run: `node --test tests/next-router.test.mjs`
Expected: FAIL (`BETS_LAYERS` is not exported; `bets/betsNav.js` does not exist).

- [ ] **Step 3: The allowlist and the step.** In `web/src/next/shell/state.js`, after `RESEARCH_LAYER_CLEARED` add:

```js
/**
 * D-69 step 4: Bets' one nested layer, one gap in Your gap (`#bets/recommended?layer=gap&item=SEA-DEN:total`: the game
 * and the market). Any other layer or item on any Bets view draws the section.
 */
export const BETS_LAYERS = Object.freeze({
  recommended: Object.freeze({ layer: 'gap', item: value => typeof value === 'string' && /^[A-Z]{2,3}-[A-Z]{2,3}:(spread|total)$/.test(value) }),
});
/** The open layer of a Bets view (`views.bets`, or a parsed place's view: `{ view, layer, item }`), or null. */
export function betsLayerOf(view) {
  const spec = Object.hasOwn(BETS_LAYERS, view?.view ?? '') ? BETS_LAYERS[view.view] : null;
  return spec && view.layer === spec.layer && spec.item(view.item) ? { layer: view.layer, item: view.item } : null;
}
```

Rename `researchOpenLayer` to `openLayerView` (update its two callers) and give it Bets' case first:

```js
/** Which view holds the layer open now: 'lines' (a game), 'research' (a team) or 'bets' (a gap), or null. */
function openLayerView(state) {
  if (state.tab === 'bets') return betsLayerOf(state.views.bets) ? 'bets' : null;
  if (state.tab !== 'research') return null;
  const section = state.views.research?.section;
  if (section === 'games' && researchLayerOf('games', state.views.lines)) return 'lines';
  if (section === 'teams' && researchLayerOf('teams', state.views.research)) return 'research';
  return null;
}
```

Rename `closesResearchLayer` to `closesOpenLayer` (body unchanged but calling `openLayerView`), update its caller in
case `'view'` and the comments there and in case `'back'` ("a layer reached by a shared link or a reload has nothing
under it; its lip is Back" / "Back on a layer with nothing under it closes that one layer"). In `navigationPatch`, after
the two D-69 step 3 lines add:

```js
  // D-69 step 4: opening or closing one gap in Your gap (Bets' `layer` and `item`) is a step, so Back closes it.
  || (tab === 'bets' && ['layer', 'item'].some(key => Object.hasOwn(patch, key) && (patch[key] ?? null) !== (state.views.bets?.[key] ?? null)))
```

Change `LAYER_KEYS` to
`Object.freeze({ play: PLAY_LAYER_KEYS, home: HOME_LAYER_KEYS, research: Object.freeze(['layer', 'item']), bets: Object.freeze(['layer', 'item']) })`
and update its doc comment ("a fresh destination on that tab never carries one over: Play's, Home's, Research's and
Bets' layers").

- [ ] **Step 4: The router.** In `web/src/next/shell/router.js`, import `betsLayerOf` from `./state.js` beside the others
and in `safeView`, after the Research line, add:

```js
  // D-69 step 4: Bets' one layer (one gap in Your gap) by allowlist; any other layer or item draws the section.
  if (tab === 'bets' && !betsLayerOf(result)) { delete result.layer; delete result.item; }
```

- [ ] **Step 5: The nav helpers.** Create `web/src/next/bets/betsNav.js`:

```js
// Bets' names, addresses and focus handles in one place (D-69 step 4): the landing's five sections, each with its own
// address (the addresses keep their earlier names, so saved links, Home's My bets tile and Research's buttons still
// work: #bets/research is Recommended, #bets/recommended is Your gap), one gap as a layer, and the stable ids the shell
// returns focus to on Back (a spoken name can change; an id does not).
import { BETS_LAYERS } from '../shell/state.js';
import { gameName } from '../research/researchNav.js';

export const BETS_SECTIONS = Object.freeze(['mybets', 'picks', 'everyone', 'recommended', 'gap']);
export const BETS_NAMES = Object.freeze({ title: 'Bets', mybets: 'My bets', picks: 'Your picks', everyone: 'Everyone', recommended: 'Recommended', gap: 'Your gap' });
/** Each section's address, its `view`: My bets opens Active tickets, as Home's My bets tile does. */
export const SECTION_VIEW = Object.freeze({ mybets: 'active', picks: 'virtual', everyone: 'everyone', recommended: 'research', gap: 'recommended' });
/** Each address's section: My bets has four (its three lists and Add a bet). */
export const SECTION_OF = Object.freeze({ tracked: 'mybets', active: 'mybets', settled: 'mybets', add: 'mybets', virtual: 'picks', everyone: 'everyone', research: 'recommended', recommended: 'gap' });
/** My bets' one meta line: the list its address opened. */
export const LIST_WORDS = Object.freeze({ active: 'Active tickets · all weeks', settled: 'Settled tickets · all weeks', add: 'Add a bet' });
/** A fresh section: no week, period, matchup or assessment carried in; My bets on its tickets. */
export const BETS_FRESH = Object.freeze({ season: null, week: null, period: null, matchup: null, assessment: null, trackedPane: 'tickets' });
export const tileId = key => `gx-b-tile-${key}`;
/** The landing's one lime button, whatever its words (Place picks, Add a bet). */
export const HERO_ACTION_ID = 'gx-b-hero-action';
export const gapItem = (gameId, market) => `${gameId}:${market}`;
export const gapRowId = item => `gx-b-gap-${String(item).replace(':', '-')}`;
/** "Seahawks @ Broncos · Total" from a gap's item: the layer's heading, the same while its read loads. */
export function gapTitle(item) {
  const [id = '', market] = String(item).split(':'), [away, home] = id.split('-');
  return `${away && home ? gameName(away, home) : id} · ${market === 'spread' ? 'Spread' : 'Total'}`;
}
export function openView(shell, view) { shell.go('bets', { view, ...BETS_FRESH }); }
export function openSection(shell, key) { openView(shell, SECTION_VIEW[key]); }
export function openGap(shell, item) { shell.setView('bets', { layer: BETS_LAYERS.recommended.layer, item }); }
export function closeGap(shell) { shell.setView('bets', { layer: undefined, item: undefined }); }
```

- [ ] **Step 6: Run them and see them pass, with the other navigation tests.**

Run: `node --test tests/next-router.test.mjs tests/next-shell-state.test.mjs tests/next-four-tab-navigation.test.mjs tests/next-features-layers.test.mjs`
Expected: PASS (next-shell-state's "filter preferences survive the root return" still deep-equals `{ market: 'total',
section: undefined, view: undefined }`: a Bets view with no layer key is unchanged by `LAYER_KEYS.bets`).

- [ ] **Step 7: Commit.**

```bash
git add web/src/next/shell/state.js web/src/next/shell/router.js web/src/next/bets/betsNav.js tests/next-router.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/shell/state.js web/src/next/shell/router.js web/src/next/bets/betsNav.js tests/next-router.test.mjs
git commit -m "Bets' gap layer has its own address: a step, allowlisted, closed by its lip and Back" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2 · The landing

### Task 2: The next-move card (place your picks, or track a bet) and five tiles

**Files:**
- Create: `web/src/next/bets/betsModel.js`, `web/src/next/bets/BetsLanding.jsx`, `web/src/next/bets/landing.css`,
  `tests/next-bets-landing.test.mjs`, `tests/next-bets-landing-ui.test.jsx`
- Modify: `web/src/next/bets/Bets.jsx` (the landing only), `tests/next-destination-icons.test.jsx`

**Interfaces:**
- Consumes: `gamesOf`, `optOutsFor`, `weekOf` (`shared/lines-view.mjs`), `guessLockedIn` (`shared/trends-view.mjs`),
  `betsTile` (`home/homeModel.js`), `useTicketSummary`, `useServerNow`, `useSharedRead`, kit `NextMoveCard`, `Meter`,
  `Tile`, `AvatarStack`, `Skeleton`, `StaleLine`, `useEntrance`; Task 1's `BETS_SECTIONS`, `BETS_NAMES`, `openSection`,
  `openView`, `tileId`, `HERO_ACTION_ID`.
- Produces: `BETS_TILE_ICONS`, `BETS_COPY`, `betsClock(personal)` → ms | null, `clockUntil(personal)` → ms,
  `recentResults(tickets, viewer)` → `{ shown, won }`, `ownWeek(personal, community, now)` → `{ open, ready, locked }`,
  `betsHero({ personal, tickets, viewer, now })` → `{ kind: 'place'|'track', week, eyebrow, title, meter: { done, of },
  line, action, target }`, `betsTiles({ personal, community, tickets, now, viewer, communityShowing, waitingWins })` →
  `[{ key, label, icon, big, sub, ariaLabel, faces, isNew }]`; `BetsLanding()`.

- [ ] **Step 1: Write the failing model test.** Create `tests/next-bets-landing.test.mjs`:

```js
// D-69 step 4 (spec 5A, "Next move + tiles"): Bets' landing as plain data. Contracts: the first card is "Place your picks"
// while any game is still to kick off by the server's clock, else "Track a bet" with your last settled tickets; five tiles
// in order with distinct glyphs, NEW only on My bets; no line, pick or market value ever reaches the landing (D-31); no
// surface line runs over twelve words.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BETS_SECTIONS } from '../web/src/next/bets/betsNav.js';
import { betsClock, betsHero, betsTiles, clockUntil, ownWeek, recentResults } from '../web/src/next/bets/betsModel.js';

const LUKE = '00000000-0000-4000-8000-000000000003', TROY = '00000000-0000-4000-8000-000000000002';
const ms = value => Date.parse(value), words = text => String(text).trim().split(/\s+/).length;
const personal = (now = '2026-11-08T19:00:00Z') => ({ season: 2026, week: 9, now, games: [
  { id: 'DAL-NYG', kickoff: '2026-11-06T01:15:00Z' }, { id: 'SEA-DEN', kickoff: '2026-11-08T18:00:00Z' },
  { id: 'KC-BUF', kickoff: '2026-11-08T21:25:00Z' }, { id: 'LAR-SF', kickoff: '2026-11-10T01:20:00Z' }],
  ballots: { guess_spread: { picks: { 'DAL-NYG': -3, 'KC-BUF': -2.5, 'LAR-SF': 3 }, lockedAt: { 'DAL-NYG': '2026-11-05T00:00:00Z', 'KC-BUF': '2026-11-07T00:00:00Z' } },
    guess_total: { picks: { 'LAR-SF': 47.5 }, lockedAt: { 'LAR-SF': '2026-11-08T00:00:00Z' } } } });
const community = { week: { season: 2026, week: 9 }, optOuts: [], members: [{ id: TROY, displayName: 'Troy' }, { id: LUKE, displayName: 'Luke' }, { id: 'x', displayName: 'Gone', removed: true }] };
const ticket = (id, outcome, settledAt, ownerId = LUKE) => ({ id, ownerId, outcome, settledAt, updatedAt: settledAt });
const tickets = (entries, extra = {}) => ({ loading: false, error: null, data: { entries }, active: entries.filter(e => e.outcome === 'pending').length, ...extra });

test('the server’s clock and where the landing’s clock stops, from the /personal read only', () => {
  assert.equal(betsClock(personal()), ms('2026-11-08T19:00:00Z'));
  assert.equal(betsClock({ season: 2026, week: 9 }), null, 'never the device clock');
  assert.equal(clockUntil(personal()), ms('2026-11-10T01:20:00Z'));
  assert.equal(clockUntil(null), 0);
});

test('while a game is still open: Place your picks, the games still open as its meter, the one lime button opens Your picks', () => {
  assert.deepEqual(betsHero({ personal: personal(), now: ms('2026-11-08T19:00:00Z') }), { kind: 'place', week: 9, eyebrow: 'Week 9 · Your next move',
    title: 'Place your picks', meter: { done: 2, of: 4 }, line: '2 of 4 games still open', action: 'Place picks', target: 'virtual' });
  assert.equal(betsHero({ personal: personal(), now: null }).line, '4 of 4 games still open', 'without the server’s clock nothing has kicked off');
});

test('once every game kicked off, or with no week: Track a bet, your last five settled tickets as its meter', () => {
  const after = ms('2026-11-10T05:00:00Z');
  const entries = [ticket('a', 'win', '2026-11-01T00:00:00Z'), ticket('b', 'loss', '2026-11-02T00:00:00Z'), ticket('c', 'pending', null),
    ticket('d', 'win', '2026-11-03T00:00:00Z'), ticket('e', 'push', '2026-11-04T00:00:00Z'), ticket('f', 'win', '2026-11-05T00:00:00Z'),
    ticket('g', 'void', '2026-11-06T00:00:00Z'), ticket('h', 'win', '2026-11-07T00:00:00Z', TROY)];
  assert.deepEqual(recentResults(tickets(entries), LUKE), { shown: 5, won: 2 }, 'your newest five settled: g f e d b');
  assert.deepEqual(betsHero({ personal: personal(), tickets: tickets(entries), viewer: LUKE, now: after }), { kind: 'track', week: 9, eyebrow: 'Your next move',
    title: 'Track a bet', meter: { done: 2, of: 5 }, line: '2 of your last 5 settled tickets won', action: 'Add a bet', target: 'add' });
  for (const [read, line] of [[tickets([]), 'No settled tickets yet'], [{ loading: true, data: null }, 'Loading your tickets…'], [{ loading: false, error: { status: 0 }, data: null }, 'Your tickets didn’t load']]) {
    const hero = betsHero({ personal: null, tickets: read, viewer: LUKE });
    assert.deepEqual([hero.kind, hero.week, hero.line, hero.meter], ['track', null, line, { done: 0, of: 5 }]);
  }
  assert.equal(betsHero({ tickets: tickets([ticket('a', 'win', '2026-11-01T00:00:00Z')]), viewer: LUKE }).line, '1 of your last 1 settled ticket won');
});

test('your week: games open to bet are still to kick off with a locked or sat-out market; every locked guess counts', () => {
  assert.deepEqual(ownWeek(personal(), community, ms('2026-11-08T19:00:00Z')), { open: 2, ready: 2, locked: 3 });
  assert.deepEqual(ownWeek(personal(), { ...community, optOuts: ['guess_total'] }, ms('2026-11-08T22:00:00Z')), { open: 1, ready: 1, locked: 3 }, 'a sit-out opens prices too');
  assert.deepEqual(ownWeek(null, null, null), { open: 0, ready: 0, locked: 0 });
});

test('five tiles in order with distinct glyphs; NEW only on My bets', () => {
  const now = ms('2026-11-08T19:00:00Z');
  const tiles = betsTiles({ personal: personal(), community, tickets: tickets([ticket('a', 'pending', null), ticket('b', 'pending', null)]), now, viewer: LUKE, waitingWins: 1 });
  assert.deepEqual(tiles.map(t => t.key), BETS_SECTIONS);
  assert.deepEqual(tiles.map(t => t.label), ['My bets', 'Your picks', 'Everyone', 'Recommended', 'Your gap']);
  assert.equal(new Set(tiles.map(t => t.icon)).size, 5);
  const [mine, picks, everyone, recommended, gap] = tiles;
  assert.deepEqual([mine.big, mine.sub, mine.ariaLabel, mine.isNew], ['2', 'active tickets', 'My bets, 2 active tickets', true]);
  assert.deepEqual([picks.big, picks.sub, picks.ariaLabel], ['2', 'games open to bet', 'Your picks, 2 games open to bet']);
  assert.deepEqual([everyone.big, everyone.sub, everyone.faces.map(f => [f.id, f.you])], ['2', 'players', [[LUKE, true], [TROY, false]]]);
  assert.deepEqual([recommended.big, recommended.sub, recommended.ariaLabel], ['—', 'Research assessments', 'Recommended, research assessments']);
  assert.deepEqual([gap.big, gap.sub, gap.ariaLabel], ['3', 'locked guesses', 'Your gap, 3 locked guesses against the lines']);
  assert.deepEqual(tiles.slice(1).map(t => t.isNew), [false, false, false, false]);
  const later = betsTiles({ personal: personal(), community, tickets: tickets([]), now: ms('2026-11-10T05:00:00Z'), viewer: LUKE });
  assert.deepEqual([later[1].big, later[1].sub], ['0', 'Week 9 closed']);
  const unlocked = betsTiles({ personal: { ...personal(), ballots: {} }, community, tickets: tickets([]), now, viewer: LUKE });
  assert.deepEqual([unlocked[1].big, unlocked[1].sub, unlocked[4].big], ['0', 'Lock in to see prices', '0']);
  const none = betsTiles({ personal: null, community: null, tickets: { loading: true }, viewer: LUKE, communityShowing: false });
  assert.deepEqual(none.map(t => t.big), ['—', '—', '—', '—', '—']);
  assert.deepEqual([none[1].sub, none[2].sub, none[2].faces, none[4].sub], ['No week open', 'Friends’ picks', null, 'No week open']);
});

test('D-31: no line, pick or market value reaches the landing; no surface line over twelve words', () => {
  const read = personal();
  for (const now of [ms('2026-11-08T19:00:00Z'), ms('2026-11-10T05:00:00Z'), null]) {
    const hero = betsHero({ personal: read, tickets: tickets([]), viewer: LUKE, now });
    const tiles = betsTiles({ personal: read, community, tickets: tickets([]), now, viewer: LUKE });
    const shown = JSON.stringify([hero, tiles.map(({ faces, ...tile }) => tile)]);
    // The tile key "picks" and its label "Your picks" are words, not values: only the read's values are secrets here.
    for (const secret of ['2.5', '47.5', 'ballots', 'lockedAt', '2026-11-07']) assert.equal(shown.includes(secret), false, secret);
    for (const text of [hero.eyebrow, hero.title, hero.line, hero.action, ...tiles.map(t => t.sub)]) assert.ok(words(text) <= 12, text);
  }
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `node --test tests/next-bets-landing.test.mjs`
Expected: FAIL (`Cannot find module …/bets/betsModel.js`).

- [ ] **Step 3: The model.** Create `web/src/next/bets/betsModel.js`:

```js
// Bets' landing (D-69 step 4, spec 5A, built for Sean's review) as plain data: the first card (place your picks while any
// game of the published week is still to kick off; otherwise track a bet) and five tiles (My bets, Your picks, Everyone,
// Recommended, Your gap). Pure. It reads only what the app already reads: the shared /personal reply (the week's games,
// your own ballots and the server's clock, as Home's This week and Research's landing read it), the Community read (its
// members and your sit-outs) and the ticket summary (your own tracked tickets: Home's My bets tile). No line, price,
// pick or other player's bet reaches it (D-31, D-36).
import { gamesOf, optOutsFor, weekOf } from '../../../../shared/lines-view.mjs';
import { guessLockedIn } from '../../../../shared/trends-view.mjs';
import { DESTINATION_ICONS } from '../ui/destinations.js';
import { DASH, SEP, toMs } from '../format.js';
import { betsTile } from '../home/homeModel.js';
import { BETS_NAMES, BETS_SECTIONS } from './betsNav.js';

export const BETS_TILE_ICONS = Object.freeze({ mybets: DESTINATION_ICONS.activeTickets, picks: DESTINATION_ICONS.virtualUnits,
  everyone: DESTINATION_ICONS.everyone, recommended: DESTINATION_ICONS.researchPicks, gap: DESTINATION_ICONS.guessGap });
export const BETS_COPY = Object.freeze({ loading: 'Loading this week’s games…', failed: 'This week didn’t load.', tryAgain: 'Try again', recent: 5 });
const MODES = Object.freeze({ spread: 'guess_spread', total: 'guess_total' });
const SETTLED = new Set(['win', 'loss', 'push', 'void']);
const kickedOff = (game, now) => Number.isFinite(now) && now >= toMs(game.kickoff);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The server's clock in the /personal read (ms), or null; never the device's. */
export function betsClock(personal) {
  const now = typeof personal?.now === 'string' ? Date.parse(personal.now) : NaN;
  return Number.isFinite(now) ? now : null;
}
/** Where the landing's clock stops: the week's last kickoff, or 0 (at once) with no game to wait for. */
export const clockUntil = personal => { const games = gamesOf(personal); return games.length ? toMs(games.at(-1).kickoff) : 0; };

/** Your last settled tracked tickets (newest first, at most five) and how many of them won. */
export function recentResults(tickets, viewer) {
  const entries = Array.isArray(tickets?.data?.entries) ? tickets.data.entries : [];
  const settled = entries.filter(e => e?.ownerId === viewer && SETTLED.has(e.outcome))
    .sort((a, b) => (toMs(b.settledAt ?? b.updatedAt) ?? 0) - (toMs(a.settledAt ?? a.updatedAt) ?? 0)).slice(0, BETS_COPY.recent);
  return { shown: settled.length, won: settled.filter(e => e.outcome === 'win').length };
}

/** Your week from your own read: games still to kick off, those whose prices are open to you, and your locked guesses. */
export function ownWeek(personal, community, now) {
  const games = gamesOf(personal), sat = optOutsFor(personal, community);
  const locked = (id, market) => guessLockedIn(personal?.ballots?.[MODES[market]], id);
  const priced = id => ['spread', 'total'].some(market => locked(id, market) || sat.includes(MODES[market]));
  const open = games.filter(g => !kickedOff(g, now));
  return { open: open.length, ready: open.filter(g => priced(g.id)).length,
    locked: games.reduce((sum, g) => sum + ['spread', 'total'].filter(market => locked(g.id, market)).length, 0) };
}

/** The first card. `target` is the Bets view its one lime button opens. */
export function betsHero({ personal = null, tickets = null, viewer = null, now = null } = {}) {
  const week = weekOf(personal)?.week ?? null, n = gamesOf(personal).length, open = ownWeek(personal, null, now).open;
  if (week !== null && open > 0) return { kind: 'place', week, eyebrow: `Week ${week}${SEP}Your next move`, title: 'Place your picks',
    meter: { done: open, of: n }, line: `${open} of ${plural(n, 'game', 'games')} still open`, action: 'Place picks', target: 'virtual' };
  const recent = recentResults(tickets, viewer);
  const line = tickets?.loading ? 'Loading your tickets…' : tickets?.error ? 'Your tickets didn’t load' : !recent.shown ? 'No settled tickets yet'
    : `${recent.won} of your last ${plural(recent.shown, 'settled ticket', 'settled tickets')} won`;
  return { kind: 'track', week, eyebrow: 'Your next move', title: 'Track a bet', meter: { done: recent.won, of: recent.shown || BETS_COPY.recent },
    line, action: 'Add a bet', target: 'add' };
}

/** The five tiles, in BETS_SECTIONS order. `waitingWins`: tracked wins waiting (NEW) for their own ticket's card. */
export function betsTiles({ personal = null, community = null, tickets = null, now = null, viewer = null, communityShowing = true, waitingWins = 0 } = {}) {
  const week = weekOf(personal)?.week ?? null, own = ownWeek(personal, community, now);
  const mine = betsTile({ loading: tickets?.loading, error: tickets?.error, active: tickets?.active });
  const picks = week === null ? { big: DASH, sub: 'No week open', ariaLabel: 'Your picks, no week open' }
    : !own.open ? { big: '0', sub: `Week ${week} closed`, ariaLabel: `Your picks, week ${week} closed` }
    : !own.ready ? { big: '0', sub: 'Lock in to see prices', ariaLabel: 'Your picks, lock in a guess to see prices' }
    : { big: String(own.ready), sub: own.ready === 1 ? 'game open to bet' : 'games open to bet', ariaLabel: `Your picks, ${plural(own.ready, 'game', 'games')} open to bet` };
  const members = communityShowing && Array.isArray(community?.members) ? community.members.filter(m => typeof m?.id === 'string' && !m.removed) : [];
  const faces = members.map(m => ({ id: m.id, name: m.displayName, you: m.id === viewer })).sort((a, b) => Number(b.you) - Number(a.you));
  const everyone = members.length ? { big: String(members.length), sub: 'players', ariaLabel: `Everyone, ${members.length} players, friends’ Virtual Units picks`, faces }
    : { big: DASH, sub: 'Friends’ picks', ariaLabel: 'Everyone, friends’ Virtual Units picks', faces: null };
  const gap = week === null ? { big: DASH, sub: 'No week open', ariaLabel: 'Your gap, no week open' }
    : { big: String(own.locked), sub: own.locked === 1 ? 'locked guess' : 'locked guesses', ariaLabel: `Your gap, ${plural(own.locked, 'locked guess', 'locked guesses')} against the lines` };
  const tiles = { mybets: { ...mine, isNew: waitingWins > 0 }, picks, everyone, gap,
    recommended: { big: DASH, sub: 'Research assessments', ariaLabel: 'Recommended, research assessments' } };
  return BETS_SECTIONS.map(key => ({ key, label: BETS_NAMES[key], icon: BETS_TILE_ICONS[key], faces: null, isNew: false, ...tiles[key] }));
}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `node --test tests/next-bets-landing.test.mjs`
Expected: PASS.

- [ ] **Step 5: Write the failing UI test.** Create `tests/next-bets-landing-ui.test.jsx`:

```jsx
// D-69 step 4 (spec 5A): the Bets landing drawn. Contracts: one glow card labelled by its eyebrow with the kit meter, one
// meta line and the screen's one lime button; five tiles with stable ids and faces on Everyone (Task 4 adds NEW on My bets); while
// /personal loads, the meter card's skeleton with five tile skeletons; a failed read says one sentence
// with Try again and keeps the tiles; a failed refresh keeps the last copy and says so. Fixture data only.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ personal: null, tickets: { loading: false, error: null, data: { entries: [] } }, waiting: 0 }));
const LUKE = '00000000-0000-4000-8000-000000000003';
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({ accountId: LUKE, league: { community: true }, refresh: vi.fn(), requestSignIn: vi.fn(),
  community: { data: { week: { season: 2026, week: 9 }, optOuts: [], members: [{ id: LUKE, displayName: 'Luke' }, { id: 'troy', displayName: 'Troy' }] } } }),
  useSharedRead: () => state.personal }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => state.tickets, LeagueFailure: () => null }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => null, useMomentScope: () => {}, useNewCount: () => state.waiting, useNewMoments: () => [], usePopped: () => false }));
vi.mock('../web/src/api.js', () => ({ socialApi: vi.fn(), betsApi: vi.fn(), cloudApi: vi.fn(), linesApi: vi.fn() }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Bets } = await import('../web/src/next/bets/Bets.jsx');

const personal = { season: 2026, week: 9, now: '2026-11-08T19:00:00Z', games: [
  { id: 'DAL-NYG', kickoff: '2026-11-06T01:15:00Z' }, { id: 'SEA-DEN', kickoff: '2026-11-08T18:00:00Z' }, { id: 'KC-BUF', kickoff: '2026-11-08T21:25:00Z' }],
  ballots: { guess_spread: { picks: { 'KC-BUF': -2.5 }, lockedAt: { 'KC-BUF': '2026-11-07T00:00:00Z' } } } };
const ready = { status: 'ready', data: personal, error: null, at: null };
const shell = { state: { views: { bets: {} } }, go: vi.fn(), setView: vi.fn() };
const render = (read = ready) => { state.personal = read; return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Bets/></div></ShellContext.Provider>); };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));
const byAttr = (html, name, value) => nodes(html).filter(n => n.attrs?.[name] === value);
const tiles = html => nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-tile'));

describe('the Bets landing', () => {
  it('one next-move card: its eyebrow names it, the meter, one meta line, the one lime button; then five tiles', () => {
    const html = render();
    expect(markupProblems(html)).toEqual([]);
    const [hero] = byAttr(html, 'data-bets', 'hero');
    expect(hero.attrs['data-kind']).toBe('place');
    expect(textOf(nodes(html).find(n => n.attrs?.id === hero.attrs['aria-labelledby']))).toBe('Week 9 · Your next move');
    expect(textOf([...walk(hero)].find(n => n.tag === 'h2'))).toBe('Place your picks');
    expect([...walk(hero)].filter(n => (n.attrs?.class ?? '').includes('gx-meter3-seg')).length).toBe(3);
    expect([...walk(hero)].filter(n => (n.attrs?.class ?? '').includes('gx-meter3-seg--on')).length).toBe(1);
    expect(textOf(byAttr(html, 'data-bets', 'hero-line')[0])).toBe('1 of 3 games still open');
    expect(nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-btn--primary')).map(textOf)).toEqual(['Place picks']);
    expect(tiles(html).map(t => t.attrs.id)).toEqual(['gx-b-tile-mybets', 'gx-b-tile-picks', 'gx-b-tile-everyone', 'gx-b-tile-recommended', 'gx-b-tile-gap']);
    expect(nameFrom(tiles(html)[1])).toBe('Your picks, 1 game open to bet');
    expect([...walk(tiles(html)[2])].some(n => /\bgx-av\b/.test(n.attrs?.class ?? '')), 'Everyone shows faces').toBe(true);
    expect(html).not.toContain('gx-new');
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual(['Bets']);
  });
  it('with no week: Track a bet, its meter and Add a bet', () => {
    const html = render({ status: 'error', data: null, error: { status: 404 }, at: null });
    const [hero] = byAttr(html, 'data-bets', 'hero');
    expect([hero.attrs['data-kind'], textOf([...walk(hero)].find(n => n.tag === 'h2'))]).toEqual(['track', 'Track a bet']);
    expect(textOf(byAttr(html, 'data-bets', 'hero-line')[0])).toBe('No settled tickets yet');
    expect(nodes(html).filter(n => n.tag === 'button' && (n.attrs.class ?? '').includes('gx-btn--primary')).map(textOf)).toEqual(['Add a bet']);
  });
  it('while /personal loads: the meter card’s skeleton and five tile skeletons', () => {
    const html = render({ status: 'loading', data: null, error: null, at: null });
    expect(markupProblems(html)).toEqual([]);
    const [skeleton] = byAttr(html, 'data-skeleton', 'landing');
    expect(skeleton.attrs.class).toContain('gx-b-skel');
    expect([...walk(skeleton)].filter(n => (n.attrs?.class ?? '').includes('gx-skel-hero--meter'))).toHaveLength(1);
    expect([...walk(skeleton)].filter(n => (n.attrs?.class ?? '').includes('gx-skel-tile'))).toHaveLength(5);
    expect(byAttr(html, 'data-bets', 'tiles')).toHaveLength(0);
  });
  it('a failed read: one sentence and Try again, the tiles still there; a failed refresh keeps the last copy and says so', () => {
    const failed = render({ status: 'error', data: null, error: { status: 0 }, at: null });
    expect(textOf(byAttr(failed, 'data-bets', 'failed')[0])).toContain('This week didn’t load.');
    expect(byAttr(failed, 'data-bets', 'tiles')).toHaveLength(1);
    const stale = render({ ...ready, status: 'error', error: { status: 0 } });
    expect(stale).toContain('This week could not refresh. Showing the last loaded update.');
    expect(byAttr(stale, 'data-bets', 'hero')).toHaveLength(1);
  });
});
```

In `tests/next-destination-icons.test.jsx` (contract kept: one glyph per destination; a destination keeps its glyph
everywhere; the landing headline is the title style):
- in "no two rows on one screen share a glyph": `const list = tiles(html);` for every screen; replace the Bets rows
  assertion with `expect(tiles(screens.Bets).map(([title]) => title)).toEqual(['My bets', 'Your picks', 'Everyone', 'Recommended', 'Your gap']);`
  and add `expect(rows(screens.Bets), 'Bets’ destinations are tiles, not rows').toEqual([]);`;
- in "a destination keeps its glyph…": `expect(tileGlyph(screens.Bets, 'Recommended')).toBe(glyphOf('researchPicks'));` and
  `expect(tileGlyph(screens.Bets, 'My bets')).toBe(glyphOf('activeTickets'));` replace the two Bets row lines (move the
  `tileGlyph` helper above them);
- in "the landing headline…": the Bets headline is the next-move card's `h2.gx-t-title` (the mocked `/personal` is a
  404, so it reads "Track a bet"):
  `const headline = nodes(screens.Bets).find(n => n.tag === 'h2' && n.parent?.attrs?.['data-bets'] === 'hero');`,
  `expect(headline.attrs.class, 'Bets').toBe('gx-t-title');`, `expect(textOf(headline)).toBe('Track a bet');`;
- the header comment: "Bets' rows became kit tiles (D-69 step 4)", and "Research recommendations on Bets" becomes
  "Recommended on Bets".

- [ ] **Step 6: Run them and see them fail.**

Run: `npx vitest run tests/next-bets-landing-ui.test.jsx tests/next-destination-icons.test.jsx`
Expected: FAIL (the landing still draws `FocusAction` and `FocusRows`).

- [ ] **Step 7: The landing.** Create `web/src/next/bets/BetsLanding.jsx`:

```jsx
// Bets (D-69 step 4, spec 5A, built for Sean's review): one next-move card (place your picks while any game is still to
// kick off; otherwise track a bet), then five tiles in two columns. It reads only the app's shared reads (/personal for
// the week, your own ballots and the server's clock; the Community read for faces and sit-outs) and the ticket summary
// Home's My bets tile reads; no Bets, line or research read happens until a section opens.
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { AvatarStack, Button, Card, Meter, NextMoveCard, Skeleton, StaleLine, Tile, useEntrance } from '../ui/index.js';
import { useServerNow } from '../home/useServerNow.js';
import { useTicketSummary } from './useTicketSummary.js';
import { BETS_COPY, betsClock, betsHero, betsTiles, clockUntil } from './betsModel.js';
import { BETS_NAMES, HERO_ACTION_ID, openSection, openView, tileId } from './betsNav.js';
import '../ui/focusLanding.css';
import './landing.css';

export function BetsLanding() {
  const app = useAppData(), shell = useShell(), enter = useEntrance();
  const personal = useSharedRead('personal');
  const tickets = useTicketSummary(app);
  const { data = null, status, error, at } = personal ?? {};
  // A 404 is a week with nothing published: the track card, not a failure.
  const none = !data && status === 'error' && error?.status === 404;
  const failed = !data && status === 'error' && !none;
  const loading = !data && !none && !failed;
  // `at`: when /personal landed, so a return here on an older read counts from the server's time now.
  const now = useServerNow(data ? betsClock(data) : null, at, { until: clockUntil(data) });
  const hero = data || none ? betsHero({ personal: data, tickets, viewer: app.accountId, now }) : null;
  const retry = () => app.refresh({ only: ['personal'] });
  const tiles = betsTiles({ personal: data, community: app.community?.data ?? null, tickets, now, viewer: app.accountId, communityShowing: app.league?.community !== false });
  return <section className="gx-screen gx-b-landing" data-landing="bets">
    <div className="gx-focus-heading"><h1 className="gx-t-title">{BETS_NAMES.title}</h1></div>
    {hero ? <NextMoveCard className="gx-b-hero" data-bets="hero" data-kind={hero.kind} eyebrow={hero.eyebrow} title={hero.title}
      picture={<Meter value={hero.meter.done} max={hero.meter.of}/>} line={hero.line} lineProps={{ 'data-bets': 'hero-line' }}
      action={{ id: HERO_ACTION_ID, label: hero.action, onClick: () => openView(shell, hero.target) }}/>
      : loading ? <Skeleton label={BETS_COPY.loading} shape="landing" hero="meter" count={5} className="gx-b-skel"/>
      : <Card variant="s2" role="alert" data-bets="failed"><p className="gx-t-body">{BETS_COPY.failed}</p><Button onClick={retry}>{BETS_COPY.tryAgain}</Button></Card>}
    {data && (status === 'error' || error) ? <StaleLine onRefresh={retry}/> : null}
    {loading ? null : <ul className="gx-tiles gx-stagger" data-enter={enter} aria-label="Bets sections" data-bets="tiles">
      {tiles.map(tile => <li key={tile.key} data-tile={tile.key}>
        <Tile id={tileId(tile.key)} label={tile.label} icon={tile.icon} big={tile.big} sub={tile.sub} isNew={tile.isNew} ariaLabel={tile.ariaLabel}
          picture={tile.faces?.length ? <AvatarStack people={tile.faces} max={3} size={24}/> : null} onClick={() => openSection(shell, tile.key)}/></li>)}
    </ul>}
  </section>;
}
```

Create `web/src/next/bets/landing.css`:

```css
/* D-69 step 4 (spec 5A): Bets' landing. The next-move card is the kit's (ui/nextMoveCard.css); five tiles sit under it in
   two columns on the page (the kit's .gx-tiles), the fifth alone on its row. Tokens only. */
.gx .gx-b-landing { gap: var(--gx-space-3); }
```

In `web/src/next/bets/Bets.jsx`, delete the `BetsLanding` function, its `FocusAction`/`FocusRows`/`FocusRow`,
`DESTINATION_ICONS` and `useTicketSummary` imports, and add `import { BetsLanding } from './BetsLanding.jsx';`.

- [ ] **Step 8: Run them and see them pass.**

Run: `npx vitest run tests/next-bets-landing-ui.test.jsx tests/next-destination-icons.test.jsx tests/four-tab-landings.test.jsx tests/next-home-ui.test.jsx && node --test tests/next-bets-landing.test.mjs tests/next-app-view.test.mjs tests/next-tokens.test.mjs tests/next-loading.test.mjs`
Expected: PASS.

- [ ] **Step 9: Commit.**

```bash
git add web/src/next/bets/betsModel.js web/src/next/bets/BetsLanding.jsx web/src/next/bets/landing.css web/src/next/bets/Bets.jsx tests/next-bets-landing.test.mjs tests/next-bets-landing-ui.test.jsx tests/next-destination-icons.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/bets/Bets.jsx tests/next-destination-icons.test.jsx
git commit -m "Bets' landing: place your picks or track a bet as the next move, then five tiles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3 · The sections as screens

### Task 3: Each section is its own screen: one-word title, ⓘ, no switches; Back is the top bar's

**Files:**
- Create: `tests/next-bets-sections.test.jsx`
- Modify: `web/src/next/bets/Bets.jsx`, `web/src/next/bets/bets.css`

**Interfaces:**
- Consumes: Task 1's `BETS_NAMES`, `SECTION_OF`, `LIST_WORDS`, `openSection`; `INFO` topics `trackedBets`, `virtual`,
  `everyone`, `recommended`; kit `InfoButton`, `MetaLine`.
- Produces: `Bets()` routes `views.bets.view` through `SECTION_OF` (unknown or none: the landing); a section screen is
  `section.gx-screen.gx-bets[data-bets-section]` with `h1#gx-bets-title`; `MyBets` (internal).

- [ ] **Step 1: Write the failing test.** Create `tests/next-bets-sections.test.jsx`:

```jsx
// D-69 step 4: each Bets section is its own screen (as Play's and Research's are). Contracts: its title is the tile's one
// word; My bets keeps one title on its four addresses and names the list as its one meta line; each has its ⓘ; no section
// draws the old Tracked / Your gap / Virtual buttons or the Your picks / Everyone switch; Everyone's empty week offers
// Your picks as a fresh section. Each section's reads are stand-ins; lazy chunks show their loading frame.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ read: { loading: true, data: null, error: null, retry: () => {} }, go: null }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: () => ({ accountId: 'luke', league: { community: true }, community: { data: null }, refresh: vi.fn(), requestSignIn: vi.fn() }), useSharedRead: () => ({ data: null }) }));
vi.mock('../web/src/next/league/useLeagueRead.jsx', () => ({ useLeagueRead: () => state.read, LeagueFailure: () => null }));
vi.mock('../web/src/api.js', () => ({ socialApi: vi.fn(), betsApi: vi.fn(), cloudApi: vi.fn(() => new Promise(() => {})), linesApi: vi.fn(() => new Promise(() => {})), date: v => v, signed: v => String(v) }));
// The lazy tracker and Your gap chunks load in the background of a static render; their old-app imports are stood in for.
vi.mock('../web/src/trendsLoaders.js', () => ({ loadTrendWeek: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/fantasyData.js', () => ({ useFantasySnapshot: () => ({ status: 'missing' }), fantasyWeekKey: (season, week) => `${season}-${week}` }));
const { ShellContext } = await import('../web/src/next/shell/context.js');
const { Bets } = await import('../web/src/next/bets/Bets.jsx');

const render = view => { state.go = vi.fn(); const shell = { state: { views: { bets: { view } }, nav: 1 }, go: state.go, setView: vi.fn(), setDirty: vi.fn(), toast: vi.fn(), confirmLeave: () => true };
  return renderToStaticMarkup(<ShellContext.Provider value={shell}><div className="gx"><Bets/></div></ShellContext.Provider>); };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));

describe('Bets sections', () => {
  for (const [view, section, title, meta, about] of [
    ['tracked', 'mybets', 'My bets', null, 'About tracked bets'], ['active', 'mybets', 'My bets', 'Active tickets · all weeks', 'About tracked bets'],
    ['settled', 'mybets', 'My bets', 'Settled tickets · all weeks', 'About tracked bets'], ['add', 'mybets', 'My bets', 'Add a bet', 'About tracked bets'],
    ['virtual', 'picks', 'Your picks', null, 'About Virtual Units'], ['everyone', 'everyone', 'Everyone', null, 'About everyone’s picks'],
  ]) it(`#bets/${view} is ${title}: its title, its ⓘ${meta ? ', its list as the meta line' : ''}, and no switch`, () => {
    const html = render(view);
    expect(markupProblems(html)).toEqual([]);
    const [screen] = nodes(html).filter(n => n.attrs?.['data-bets-section']);
    expect(screen.attrs['data-bets-section']).toBe(section);
    expect(nodes(html).filter(n => n.tag === 'h1').map(textOf)).toEqual([title]);
    expect(nodes(html).some(n => n.tag === 'button' && nameFrom(n) === about)).toBe(true);
    if (meta) expect(html).toContain(meta);
    for (const gone of ['aria-label="Bets view"', 'aria-label="Virtual Units view"', 'Tickets you placed elsewhere', 'Place play-money picks on this week']) expect(html).not.toContain(gone);
  });
  it('the landing is what any other view draws', () => {
    for (const view of [undefined, 'nope']) expect(nodes(render(view)).some(n => n.attrs?.['data-landing'] === 'bets')).toBe(true);
  });
  it('Everyone’s empty week offers Your picks as a fresh section', () => {
    state.read = { loading: false, error: null, data: { season: 2026, week: 9, published: true, roster: [], games: [], bets: [], faces: {}, markets: {}, qualification: [] }, retry: () => {} };
    const html = render('everyone');
    state.read = { loading: true, data: null, error: null, retry: () => {} };
    expect(html).toContain('Place a pick');
  });
});
```

- [ ] **Step 2: Run it and see it fail.**

Run: `npx vitest run tests/next-bets-sections.test.jsx`
Expected: FAIL (titles are "Active tickets", "Virtual Units", "Everyone’s picks"; the "Bets view" group is drawn).

- [ ] **Step 3: Sections as screens.** In `web/src/next/bets/Bets.jsx`:
- replace the header comment with:

```jsx
// Bets (D-69 step 4, built for Sean's review): the landing (BetsLanding.jsx: the next move and five tiles) and five
// sections, each a screen with its own address, its one-word title and its ⓘ, opened from its tile; the top bar's Back
// returns to the landing, with focus on that tile. My bets is #bets/tracked, active, settled or add (the November 1
// Roomy cards, D-72); Your picks #bets/virtual (D-67); Everyone #bets/everyone; Recommended #bets/research (its own
// screen, research/Assessments.jsx); Your gap #bets/recommended. Recommendations and Virtual Units placement follow the
// published account week.
```

- `Bets()` becomes
  `export function Bets() { const view = useShell().state.views.bets.view; return Object.hasOwn(SECTION_OF, view ?? '') ? <BetsSection destination={view}/> : <BetsLanding/>; }`;
- rename `BetsDetail` to `BetsSection({ destination })`; set `const section = SECTION_OF[destination];` and drop
  `view`, `choose`, `chooseVirtual`, `introduction`, `VIRTUAL_VIEWS` and the `TOPIC` object, replaced by
  `const TOPIC = Object.freeze({ mybets: 'trackedBets', picks: 'virtual', everyone: 'everyone', gap: 'recommended' });`;
- keep `trackerState`, `rememberTracker`, `recommendedMarket`, `chooseRecommendedMarket`, `marketControl`, the drafts,
  `ticketRequest`, `trackRecommendation` and `reviewDone` exactly as they are; add
  `const review = ticketRequest?.accountId === app.accountId ? <Deferred resetKey={ticketRequest.id} label="bet review"><SocialBetTracker key={ticketRequest.id} player={app.accountId} reviewOnly initialView="mybets" ticketRequest={ticketRequest} onReviewDone={reviewDone} onDirty={reviewDirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></Deferred> : null;`;
- the Recommended section draws its own screen (Task 5 renames its title):
  `if (section === 'recommended') return <><Deferred resetKey={`${app.accountId}:research`} label="research recommendations"><ResearchAssessments key={app.accountId} onDirty={dirty} onTrack={trackRecommendation}/></Deferred>{review}</>;`;
- the other four draw one frame:

```jsx
  const topic = INFO[TOPIC[section]];
  return <section className="gx-screen gx-bets gx-live-workflow" aria-labelledby="gx-bets-title" data-bets-section={section}>
    <header className="gx-bets-heading">
      <div className="gx-bets-titlebar"><h1 id="gx-bets-title" className="gx-t-title gx-grow">{BETS_NAMES[section]}</h1><InfoButton title={topic.title} body={topic.body}/></div>
      {LIST_WORDS[destination] ? <MetaLine parts={[LIST_WORDS[destination]]}/> : null}
    </header>
    {section === 'mybets' ? <MyBets destination={destination} trackerState={trackerState} rememberTracker={rememberTracker} onDirty={dirty} onSaved={saved}/>
      : section === 'picks' ? <PlaceBets key={app.accountId} onDirty={dirty}/>
      : section === 'everyone' ? <EveryoneBets onPlace={() => openSection(shell, 'picks')}/>
      // Your gap: the old app's screen until Task 7 rebuilds it (gap/YourGap.jsx draws its own screen then).
      : <><Deferred resetKey={`${app.accountId}:recommended`} label="recommended bets"><VirtualUnits key={`${app.accountId}:recommended`} accountId={app.accountId} embedded initialView="recommended" accountRecommendations showViewTabs={false} recommendedMarket={recommendedMarket} onRecommendedMarket={chooseRecommendedMarket} marketControl={marketControl} onTrackTicket={trackRecommendation} onDirty={dirty} onSaved={saved} onSignInAgain={app.requestSignIn}/></Deferred>{review}</>}
  </section>;
```

- add, below:

```jsx
/** My bets: the tracker with its November 1 Roomy cards (D-72), unchanged, on the list its address names. */
function MyBets({ destination, trackerState, rememberTracker, onDirty, onSaved }) {
  const app = useAppData(), shell = useShell(), route = shell.state.views.bets;
  return <Deferred label="tracked bets"><SocialBetTracker key={`${app.accountId}:${destination}:${shell.state.nav}`} player={app.accountId}
    initialOutcome={destination === 'active' ? 'pending' : destination === 'settled' ? 'settled' : ''} initialAllHistory={destination === 'active' || destination === 'settled'}
    autoCreate={destination === 'add'} navigationState={trackerState} onNavigationState={rememberTracker} initialView="mybets" embedded compactTickets
    TicketRow={TrackedBetRow} MetricsView={NetUnits} OverviewView={TrackedOverview} initialTrackedPane={route.trackedPane ?? 'tickets'}
    onDirty={onDirty} onSaved={onSaved} onSignInAgain={app.requestSignIn}/></Deferred>;
}
```

- imports: drop `Button`, `Segmented` stays (the interim `marketControl`), add `MetaLine` from `../ui/index.js`, and
  `import { BETS_NAMES, LIST_WORDS, SECTION_OF, openSection } from './betsNav.js';`.

In `web/src/next/bets/bets.css`, delete the `.gx-bets-views` rules and their D-55 comment (nothing draws the switch).

- [ ] **Step 4: Run it and see it pass, with the Bets unit tests.**

Run: `npx vitest run tests/next-bets-sections.test.jsx tests/next-bets-landing-ui.test.jsx tests/next-bets-review.test.jsx tests/next-bets-place.test.jsx tests/next-bets-everyone-ui.test.jsx tests/next-empty-actions.test.jsx && node --test tests/next-app-view.test.mjs tests/next-tokens.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add web/src/next/bets/Bets.jsx web/src/next/bets/bets.css tests/next-bets-sections.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/bets/Bets.jsx web/src/next/bets/bets.css
git commit -m "Bets' sections are screens: one-word titles, their info, no view switches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4 · Moments and Your picks' motion

### Task 4: A tracked win pops its own ticket once; a confirmed placement pops its tags; Your picks rises in and keeps its board

**Files:**
- Create: `web/src/next/bets/betMoments.js`, `web/src/next/bets/useBetWins.js`, `tests/next-bets-moments.test.mjs`,
  `tests/next-bets-moments-ui.test.jsx`
- Modify: `web/src/next/moments/catalog.js`, `web/src/next/bets/TrackedBetRow.jsx`, `web/src/next/bets/BetsLanding.jsx`,
  `web/src/next/bets/Bets.jsx` (`MyBets`), `web/src/next/bets/place.js`, `web/src/next/bets/PlaceBets.jsx`,
  `web/src/next/bets/place.css`, `tests/next-moments.test.mjs`, `tests/next-bets-place.test.jsx`, `tests/next-bets-landing-ui.test.jsx`

**Interfaces:**
- Consumes: `createMomentsEngine` (tests), `useMoments`, `useMomentScope`, `usePopped`, `useNewCount`
  (`moments/MomentsProvider.jsx`), `useTicketSummary`, `useEntrance`, `slipKey`.
- Produces: `SCOPES.bets = 'bets'`, `ticketScope(id)` → `'bets:ticket:<id>'`; `BET_WIN_SOURCE = 'bets:tickets'`,
  `betWinId(id)` → `'betWin:<id>'`, `betWinMoments(summary, viewer)` → candidates; `useBetWins(app)` → the ticket
  summary read; `confirmedPlacements(reply, viewer, sent)` → slip keys; `PlaceGame` prop `placed` (`{ id, keys }`);
  `TrackedBetRow` attributes `data-ticket`, `data-outcome`.

- [ ] **Step 1: Write the failing moment tests.** Create `tests/next-bets-moments.test.mjs`:

```js
// D-69 step 4, the moments table's "Tracked bet wins" (small) and "Loss" (quiet). Contracts: only your own ticket settled
// as a win is a candidate (never a loss, push, void, pending ticket or another player's); it waits on its own ticket's card
// and counts on the My bets tile; on the real engine it seeds on this device's first read, waits as NEW in a later
// session, never plays on a card opened on the launch screen, plays once on its own card after a navigation, never on
// another ticket's card and never again. And a placement's confirmation: only a fresh read that holds your sent terms.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMomentsEngine } from '../web/src/next/moments/engine.js';
import { MOMENTS, SCOPES, ticketScope } from '../web/src/next/moments/catalog.js';
import { BET_WIN_SOURCE, betWinId, betWinMoments } from '../web/src/next/bets/betMoments.js';
import { confirmedPlacements } from '../web/src/next/bets/place.js';

const LUKE = '00000000-0000-4000-8000-000000000003', TROY = '00000000-0000-4000-8000-000000000002';
const ticket = (id, outcome, ownerId = LUKE, extra = {}) => ({ id, ownerId, outcome, kind: 'single', legs: [{}], ...extra });
const memory = () => { const map = new Map(); return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k), key: i => [...map.keys()][i] ?? null, get length() { return map.size; } }; };
function rig(storage, { settled = false, navigated = false } = {}) {
  const small = [];
  const engine = createMomentsEngine({ account: LUKE, storage, isSettled: () => settled, hasNavigated: () => navigated, onBig: () => assert.fail('a tracked win is small'), onSmall: m => small.push(m.id), setTimer: fn => { fn(); return 0; } });
  return { engine, small };
}
const report = (engine, entries) => engine.report(betWinMoments({ entries }, LUKE), { source: BET_WIN_SOURCE });

test('candidates: your own tickets settled as a win, each on its own card and the My bets tile; nothing else', () => {
  const summary = { entries: [ticket('a', 'win'), ticket('b', 'loss'), ticket('c', 'push'), ticket('d', 'void'), ticket('e', 'pending'), ticket('f', 'win', TROY), ticket('g', 'win', LUKE, { kind: 'parlay', legs: [{}, {}, {}] })] };
  const found = betWinMoments(summary, LUKE);
  assert.deepEqual(found.map(m => m.id), [betWinId('a'), betWinId('g')]);
  assert.deepEqual(found[0].scopes, [ticketScope('a'), SCOPES.bets]);
  assert.deepEqual(found.map(m => m.title), ['Tracked bet won', '3-leg parlay won']);
  assert.equal(MOMENTS[found[0].kind], 'small');
  for (const empty of [null, {}, { entries: null }]) assert.deepEqual(betWinMoments(empty, LUKE), []);
  assert.deepEqual(betWinMoments(summary, ''), [], 'no viewer, no moment');
});

test('engine: this device’s first read seeds; a later session’s new win waits as NEW and never plays on a card opened at launch', () => {
  const storage = memory(), first = rig(storage);
  report(first.engine, [ticket('a', 'win')]);
  assert.equal(first.engine.newCount(SCOPES.bets), 0, 'a first sighting shows the result as it is');
  first.engine.dispose();
  const next = rig(storage);
  next.engine.open(ticketScope('b')); // a Roomy card on the launch screen (a reload at #bets/active)
  report(next.engine, [ticket('a', 'win'), ticket('b', 'win')]);
  assert.equal(next.engine.newCount(SCOPES.bets), 1);
  assert.deepEqual(next.small, [], 'never on launch');
});

test('engine: it plays once on its own card after a navigation, never on another ticket’s card, and never again on this device', () => {
  const storage = memory();
  report(rig(storage).engine, []); // seeded empty
  const r = rig(storage, { settled: true, navigated: true });
  report(r.engine, [ticket('a', 'win'), ticket('b', 'win')]);
  r.engine.open(ticketScope('zzz'));
  assert.deepEqual(r.small, [], 'another ticket’s card plays nothing');
  r.engine.open(ticketScope('b'));
  assert.deepEqual(r.small, [betWinId('b')]);
  assert.equal(r.engine.newCount(SCOPES.bets), 1, 'a still waits for its own card');
  r.engine.dispose();
  const again = rig(storage, { settled: true, navigated: true });
  report(again.engine, [ticket('a', 'win'), ticket('b', 'win')]);
  again.engine.open(ticketScope('b'));
  assert.deepEqual(again.small, [], 'never replays');
});

test('a placement is confirmed only by a fresh read that holds your sent terms', () => {
  const sent = [{ gameId: 'SEA-DEN', market: 'spread', side: 'home', line: -3, odds: -110, units: 2 }, { gameId: 'KC-BUF', market: 'total', side: 'over', line: 44.5, odds: -105, units: 1 }];
  const row = (userId, bet, change = {}) => ({ userId, gameId: bet.gameId, market: bet.market, selection: { side: bet.side, line: bet.line, odds: bet.odds, units: bet.units, ...change } });
  assert.deepEqual(confirmedPlacements({ bets: [row(LUKE, sent[0]), row(LUKE, sent[1])] }, LUKE, sent), ['SEA-DEN:spread', 'KC-BUF:total']);
  assert.deepEqual(confirmedPlacements({ bets: [row(LUKE, sent[0], { units: 3 }), row(TROY, sent[1])] }, LUKE, sent), [], 'other terms or another player confirm nothing');
  assert.deepEqual(confirmedPlacements(null, LUKE, sent), []);
});
```

In `tests/next-moments.test.mjs`, the "scopes" test (contract kept and extended: every card that holds moments has a
scope, so a landing tile can show NEW for it) becomes
`assert.deepEqual({ ...SCOPES }, { home: 'home', play: 'play', league: 'league', features: 'features', score: 'score', picks: 'picks', points: 'points', bets: 'bets' });`
plus `assert.equal(ticketScope('abc'), 'bets:ticket:abc');` (import `ticketScope`).

- [ ] **Step 2: Write the failing UI tests.** Create `tests/next-bets-moments-ui.test.jsx`:

```jsx
// D-69 step 4: the moments drawn. Contracts: a Roomy card opens its own ticket's moment scope and its Won pill pops only
// when that ticket's win plays (a loss never pops); useBetWins reports only a fresh ticket read, under one source, and
// nothing while the read is on its way or failed; a placed bet's "Your bet" tag pops only when its placement is confirmed.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ scopes: [], popped: [], moments: null, tickets: null }));
vi.mock('react', async importOriginal => ({ ...(await importOriginal()), useEffect: fn => { fn(); } }));
vi.mock('../web/src/next/moments/MomentsProvider.jsx', () => ({ useMoments: () => state.moments, useMomentScope: scope => { state.scopes.push(scope); },
  useNewCount: () => 0, useNewMoments: () => [], usePopped: id => Boolean(id) && state.popped.includes(id) }));
vi.mock('../web/src/next/bets/useTicketSummary.js', () => ({ useTicketSummary: () => state.tickets }));
vi.mock('../web/src/api.js', () => ({ betsApi: vi.fn(), socialApi: vi.fn(), cloudApi: vi.fn() }));
vi.mock('../web/src/next/data/AppData.jsx', () => ({ useAppData: vi.fn(), useSharedRead: vi.fn() }));
const { TrackedBetRow } = await import('../web/src/next/bets/TrackedBetRow.jsx');
const { useBetWins } = await import('../web/src/next/bets/useBetWins.js');
const { PlaceGame } = await import('../web/src/next/bets/PlaceBets.jsx');
const { BET_WIN_SOURCE, betWinId } = await import('../web/src/next/bets/betMoments.js');
const { ticketScope } = await import('../web/src/next/moments/catalog.js');

const LUKE = '00000000-0000-4000-8000-000000000003';
const nodes = html => [...walk(parseMarkup(html))];
const pill = html => nodes(html).find(n => (n.attrs?.class ?? '').includes('gx-pill'));
const row = entry => renderToStaticMarkup(<div className="gx"><TrackedBetRow entry={{ week: 9, stakeUnits: 1, source: 'BetMGM', kind: 'single', legs: [{ gameId: 'SEA-DEN', selection: 'DEN −3' }], ...entry }} games={[{ id: 'SEA-DEN', away: 'SEA', home: 'DEN' }]}/></div>);

describe('a Roomy card holds its own ticket’s win', () => {
  it('opens its ticket’s scope and pops its Won pill only when that win plays', () => {
    state.scopes = []; state.popped = [];
    const still = row({ id: 't1', outcome: 'win' });
    expect(state.scopes).toEqual([ticketScope('t1')]);
    expect(pill(still).attrs['data-moment']).toBeUndefined();
    state.popped = [betWinId('t1')];
    const html = row({ id: 't1', outcome: 'win' });
    expect([pill(html).attrs['data-moment'], nodes(html).find(n => n.tag === 'article').attrs['data-ticket']]).toEqual(['pop', 't1']);
    expect(pill(row({ id: 't2', outcome: 'loss' })).attrs['data-moment'], 'a loss stays quiet').toBeUndefined();
    state.popped = [];
  });
});

describe('useBetWins', () => {
  function Probe({ app }) { useBetWins(app); return null; }
  const app = { accountId: LUKE };
  it('reports a fresh ticket read’s wins under the tickets source', () => {
    const reportFn = vi.fn(); state.moments = { report: reportFn };
    state.tickets = { loading: false, error: null, data: { entries: [{ id: 'a', ownerId: LUKE, outcome: 'win' }, { id: 'b', ownerId: LUKE, outcome: 'loss' }] } };
    renderToStaticMarkup(<Probe app={app}/>);
    expect(reportFn).toHaveBeenCalledTimes(1);
    expect(reportFn.mock.calls[0][0].map(m => m.id)).toEqual([betWinId('a')]);
    expect(reportFn.mock.calls[0][1]).toEqual({ source: BET_WIN_SOURCE });
  });
  it('reports nothing while the read is on its way, after it failed, without a viewer or without an engine', () => {
    const reportFn = vi.fn(); state.moments = { report: reportFn };
    for (const tickets of [{ loading: true, data: null }, { loading: false, error: { status: 0 }, data: null }]) { state.tickets = tickets; renderToStaticMarkup(<Probe app={app}/>); }
    state.tickets = { loading: false, data: { entries: [{ id: 'a', ownerId: LUKE, outcome: 'win' }] } };
    renderToStaticMarkup(<Probe app={{ accountId: '' }}/>);
    expect(reportFn).not.toHaveBeenCalled();
    state.moments = null;
    expect(() => renderToStaticMarkup(<Probe app={app}/>)).not.toThrow();
  });
});

describe('a confirmed placement', () => {
  const game = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2099-10-25T20:05:00.000Z', started: false, faces: [],
    markets: [{ market: 'spread', name: 'Spread', visible: true, locked: null, sides: [], mine: { text: 'DEN −3 · −110', units: '2U', moved: false, selection: {} } }] };
  const tag = html => nodes(html).find(n => (n.attrs?.class ?? '').includes('gx-tag'));
  it('pops the placed bet’s tag only when its placement is confirmed', () => {
    const draw = placed => renderToStaticMarkup(<div className="gx"><PlaceGame game={game} slip={{}} disabled={false} placed={placed} onToggle={() => {}}/></div>);
    expect(tag(draw(null)).attrs['data-moment']).toBeUndefined();
    expect(tag(draw({ id: 'r1', keys: new Set(['KC-BUF:total']) })).attrs['data-moment']).toBeUndefined();
    expect(tag(draw({ id: 'r1', keys: new Set(['SEA-DEN:spread']) })).attrs['data-moment']).toBe('pop');
  });
});
```

In `tests/next-bets-landing-ui.test.jsx` (Task 2; its MomentsProvider stand-in already returns `state.waiting` from
`useNewCount`), add to "the Bets landing":

```jsx
  it('NEW only on My bets while a tracked win waits for its card', () => {
    state.waiting = 1;
    const html = render();
    state.waiting = 0;
    expect(nameFrom(tiles(html)[0])).toMatch(/^My bets, .*, new$/);
    expect(tiles(html).slice(1).every(t => !/, new$/.test(nameFrom(t)))).toBe(true);
  });
```

In `tests/next-bets-place.test.jsx`, add under "the placing board" (it imports `place.js` already):
`it('confirms only placements whose fresh read holds the sent terms', () => { … })` asserting the same three cases as
the node test above through `confirmedPlacements` (kept beside its siblings so the placing rules read in one file).

- [ ] **Step 3: Run them and see them fail.**

Run: `node --test tests/next-bets-moments.test.mjs tests/next-moments.test.mjs && npx vitest run tests/next-bets-moments-ui.test.jsx tests/next-bets-place.test.jsx`
Expected: FAIL (`betMoments.js` and `useBetWins.js` do not exist; `SCOPES.bets`, `ticketScope`, `confirmedPlacements`
are missing).

- [ ] **Step 4: The catalog and the tracked win.** In `web/src/next/moments/catalog.js`, add `bets: 'bets'` to
`SCOPES` and extend its doc comment ("D-69 step 4: `bets` is the My bets tile's count of waiting tracked wins; nothing
opens it, so a win plays only on its own ticket's card, `ticketScope`"), and add:

```js
/** One tracked ticket's Roomy card (D-69 step 4): its win waits on the card that draws that ticket ("bets:ticket:<id>"). */
export const ticketScope = id => `bets:ticket:${id}`;
```

Create `web/src/next/bets/betMoments.js`:

```js
// D-69 step 4, the moments table's "Tracked bet wins" (small; a loss stays quiet): from each fresh ticket summary read
// (useTicketSummary: your own tracked tickets, every week) one candidate per ticket of yours settled as a win. It waits on
// that ticket's own Roomy card (ticketScope), so only the card that draws the ticket plays it, and the My bets tile counts
// it as NEW (SCOPES.bets, which nothing opens). A loss, a push, a void, a pending ticket and another player's ticket
// report nothing. Pure.
import { SCOPES, ticketScope } from '../moments/catalog.js';

export const BET_WIN_SOURCE = 'bets:tickets';
export const betWinId = entryId => `betWin:${entryId}`;
const titleOf = entry => (entry.kind === 'parlay' && Array.isArray(entry.legs) ? `${entry.legs.length}-leg parlay` : 'Tracked bet');

export function betWinMoments(summary, viewer) {
  const entries = Array.isArray(summary?.entries) ? summary.entries : [];
  if (typeof viewer !== 'string' || !viewer) return [];
  return entries.filter(e => typeof e?.id === 'string' && e.id && e.ownerId === viewer && e.outcome === 'win')
    .map(e => ({ id: betWinId(e.id), kind: 'betWin', scopes: [ticketScope(e.id), SCOPES.bets], title: `${titleOf(e)} won`, icon: 'ticket' }));
}
```

Create `web/src/next/bets/useBetWins.js`:

```js
// D-69 step 4: the ticket summary (useTicketSummary, shared with Home's My bets tile) and, from each fresh read of it, the
// tracked wins it shows (betMoments.js) reported to the moments engine. A read on its way or a failed one reports nothing:
// useLeagueRead holds no data until a read succeeds (spec 4.2 rule 1). Bets' landing and My bets call it.
import { useEffect } from 'react';
import { useMoments } from '../moments/MomentsProvider.jsx';
import { useTicketSummary } from './useTicketSummary.js';
import { BET_WIN_SOURCE, betWinMoments } from './betMoments.js';

export function useBetWins(app) {
  const tickets = useTicketSummary(app);
  const report = useMoments()?.report, data = tickets?.data ?? null, viewer = app?.accountId ?? '';
  useEffect(() => {
    if (!report || !data || !viewer) return;
    report(betWinMoments(data, viewer), { source: BET_WIN_SOURCE });
  }, [report, data, viewer]);
  return tickets;
}
```

In `web/src/next/bets/TrackedBetRow.jsx`, add the imports
`import {useMomentScope,usePopped} from '../moments/MomentsProvider.jsx';`, `import {ticketScope} from '../moments/catalog.js';`,
`import {betWinId} from './betMoments.js';`; at the top of the component:

```jsx
  // D-69 step 4: this card holds its own ticket's win; its Won pill pops once when that win plays. A loss stays quiet.
  useMomentScope(ticketScope(entry.id));
  const pop=usePopped(entry.outcome==='win'?betWinId(entry.id):'');
```

give the `<article>` `data-ticket={entry.id} data-outcome={entry.outcome}`, and the preview head's pill
`<Pill tone={tone} data-moment={pop?'pop':undefined}>{status}</Pill>` (the expanded ticket's pill stays still: it shows
only after a tap, when the moment has played).

In `web/src/next/bets/BetsLanding.jsx`, replace `useTicketSummary(app)` with `useBetWins(app)` (import from
`./useBetWins.js`), add `const waitingWins = useNewCount(SCOPES.bets);` (imports `useNewCount` from
`../moments/MomentsProvider.jsx`, `SCOPES` from `../moments/catalog.js`) and pass `waitingWins` to `betsTiles`. In
`Bets.jsx` `MyBets`, call `useBetWins(app);` first (its rows can then play a win that arrives while you watch).

- [ ] **Step 5: The confirmed placement and Your picks' motion.** In `web/src/next/bets/place.js`, after `placeRequest`
add:

```js
/**
 * D-69 step 4: the placed bets a fresh /bets/read confirms (spec 4.2 rule 1, a moment plays on confirmed data only): each
 * bet the request sent whose saved row for you now has the same side, line, price and units. A refusal, a lost reply or a
 * bet saved elsewhere with other terms confirms nothing. Their slip keys, in the request's order.
 */
export function confirmedPlacements(reply, viewer, sent) {
  const bets = Array.isArray(reply?.bets) ? reply.bets : [];
  return (Array.isArray(sent) ? sent : []).filter(bet => bets.some(row => row?.userId === viewer && row.gameId === bet.gameId && row.market === bet.market
    && row.selection?.side === bet.side && row.selection?.line === bet.line && row.selection?.odds === bet.odds && row.selection?.units === bet.units))
    .map(bet => slipKey(bet.gameId, bet.market));
}
```

In `web/src/next/bets/PlaceBets.jsx`:
- import `useEntrance` with the kit, and `confirmedPlacements` with `place.js`'s names;
- after `const read = useLeagueRead(…)`, replace the `board` line with:

```jsx
  const enter = useEntrance();
  // D-69 step 4: the last good reply stays on screen while a refresh reads (spec 4.5), so the cards never flash to a
  // skeleton or rise in twice; a failed refresh keeps it under its failure line.
  const [last, setLast] = useState(null);
  useEffect(() => { if (read.data) setLast({ key, data: read.data }); }, [read.data, key]);
  const data = read.data ?? (last?.key === key ? last.data : null);
  const refreshing = read.loading && !read.data && data !== null;
  const board = useMemo(() => (data ? placeBoard(data, app.accountId) : null), [data, app.accountId]);
  // D-69 step 4, a placement's small moment: it waits for the fresh read after the write and pops the tags of the bets that
  // read confirms (confirmedPlacements); a refusal, a lost reply or a request still on its way pops nothing.
  const [confirming, setConfirming] = useState(null), [placed, setPlaced] = useState(null);
  useEffect(() => {
    if (!confirming || read.loading || !read.data || read.data === confirming.before) return;
    const keys = confirmedPlacements(read.data, app.accountId, confirming.bets);
    setPlaced(keys.length ? { id: confirming.id, keys: new Set(keys) } : null);
    setConfirming(null);
  }, [confirming, read.loading, read.data, app.accountId]);
```

- in `place()`: build `const body = placeRequest(board, entries, request.current);` before the `try`, send
  `betsApi('place', body)`, and on success call
  `setConfirming({ id: body.requestId, bets: body.bets, before: read.data });` before `read.retry();`;
- `if (read.loading && !board)` and `if (read.error && !board)` keep their returns; under the meta line add
  `{read.error ? <LeagueFailure error={read.error} onRetry={read.retry}/> : null}`; `WeekCard` reads
  `weekCard(data, app.accountId)`;
- the games become a list that rises in after a navigation:

```jsx
    <ol className="gx-place-games gx-stagger" data-enter={enter} aria-label={`Week ${board.week} games`}>
      {board.games.map(game => <li key={game.id}><PlaceGame game={game} slip={slip} disabled={busy || uncertain || refreshing} placed={placed} onToggle={toggle}/></li>)}
    </ol>
    <Button variant="ghost" onClick={read.retry} disabled={busy || refreshing} aria-busy={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh prices'}</Button>
```

- the slip's place button: `disabled={busy || refreshing}`;
- `PlaceGame({ game, slip, disabled, placed = null, onToggle })`: the saved-bet tag becomes

```jsx
        {market.mine ? (() => { const pop = placed?.keys.has(slipKey(game.id, market.market)) ? placed.id : null;
          // A new confirmation remounts the tag (its key), so an edit confirmed again pops again; a re-render never does.
          return <Tag key={pop ?? 'mine'} k="Your bet" data-moment={pop ? 'pop' : undefined}>{market.mine.text} · {market.mine.units}</Tag>; })() : null}
```

In `web/src/next/bets/place.css` add:

```css
/* D-69 step 4: the games as a list (units rise in after a navigation: .gx-stagger, nest.css). */
.gx .gx-place-games { display: grid; gap: var(--gx-space-4); min-width: 0; margin: 0; padding: 0; list-style: none; }
.gx .gx-place-games > li { min-width: 0; }
```

- [ ] **Step 6: Run them and see them pass, with the moments and Bets tests.**

Run: `node --test tests/next-bets-moments.test.mjs tests/next-moments.test.mjs tests/next-home-moments.test.mjs tests/next-tokens.test.mjs && npx vitest run tests/next-bets-moments-ui.test.jsx tests/next-bets-place.test.jsx tests/next-bets-landing-ui.test.jsx tests/next-bets-sections.test.jsx tests/next-bets-everyone-ui.test.jsx tests/next-empty-actions.test.jsx tests/next-home-ui.test.jsx`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add web/src/next/moments/catalog.js web/src/next/bets/betMoments.js web/src/next/bets/useBetWins.js web/src/next/bets/TrackedBetRow.jsx web/src/next/bets/BetsLanding.jsx web/src/next/bets/Bets.jsx web/src/next/bets/place.js web/src/next/bets/PlaceBets.jsx web/src/next/bets/place.css tests/next-bets-moments.test.mjs tests/next-bets-moments-ui.test.jsx tests/next-moments.test.mjs tests/next-bets-place.test.jsx tests/next-bets-landing-ui.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/bets/PlaceBets.jsx web/src/next/bets/TrackedBetRow.jsx web/src/next/moments/catalog.js
git commit -m "Bets moments: a tracked win pops its own ticket once; a confirmed placement pops its tags; Your picks rises in" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5 · Everyone and Recommended as picture rows

### Task 5: Faces first on Everyone, marks first on Recommended; Everyone's gates unchanged and scanned on the new rows

**Files:**
- Create: `tests/next-bets-recommended-ui.test.jsx`
- Modify: `web/src/next/bets/EveryoneBets.jsx`, `web/src/next/bets/everyone.js` (the banner words only),
  `web/src/next/bets/everyone.css`, `web/src/next/research/Assessments.jsx`, `web/src/next/research/assessments.css`,
  `tests/next-bets-everyone-ui.test.jsx`

**Interfaces:**
- Consumes: kit `PictureRow`, `Avatar`, `TeamMark`, `LockLine`, `Skeleton`, `useEntrance`, `useLayerFocus`;
  `BETS_NAMES.recommended`.
- Produces: Everyone pick rows `.gx-prow[data-pick][data-open]`, person rows `.gx-prow[data-person]`, skeleton
  `gx-ev-skel`; Recommended rows `button.gx-prow[data-assessment]` with ids `gx-b-ra-<routeId>`;
  `EVERYONE_COPY.banner = 'Friends’ lines show once you lock in that game, or at kickoff.'`.

- [ ] **Step 1: Change and write the failing tests.** In `tests/next-bets-everyone-ui.test.jsx` (contracts kept, R6):
- "names each game's pickers once, on rows that lead with their faces": the rows are now
  `nodes.filter(n => n.attrs?.['data-pick'])` (the picture row, not its `li`); each row's first child is the picture
  (`/\bgx-prow-pic\b/`) and holds the face (`[...walk(row.children[0])].some(n => /\bgx-av\b/.test(n.attrs?.class ?? ''))`);
  names read from `/\bgx-prow-title\b/` → `['Sean', 'You', 'Troy']`;
- "shows a closed friend's side and units…": unchanged (the slice still runs from `data-pick` to its `</li>`), plus
  `expect(troy).not.toContain('gx-prow-word')` (a closed row has no result word);
- add to "everyone's picks":

```jsx
  it('D-31: a closed friend’s row says no term in its name, meta, number, word or attributes; the weekly list carries none', () => {
    const nodesOf = [...walk(parseMarkup(html))];
    const troy = nodesOf.find(n => n.attrs?.['data-pick'] === `${TROY}:spread`);
    const said = JSON.stringify(troy);
    for (const secret of ['13.5', '115', 'BetMGM', '1.30', '1.3']) expect(said).not.toContain(secret);
    const people = nodesOf.filter(n => n.attrs?.['data-person']);
    expect(people.map(n => n.attrs['data-person'])).toEqual([LUKE, SEAN, TROY]);
    for (const person of people) for (const secret of ['13.5', 'BetMGM', 'FanDuel', 'DraftKings']) expect(JSON.stringify(person)).not.toContain(secret);
  });
  it('faces first on the weekly list too; the word says Qualified', () => {
    const people = [...walk(parseMarkup(html))].filter(n => n.attrs?.['data-person']);
    expect(people.every(row => /\bgx-prow-pic\b/.test(row.children[0].attrs?.class ?? ''))).toBe(true);
    expect(html).toContain('3 picks · 4.5U');
  });
```

Create `tests/next-bets-recommended-ui.test.jsx`:

```jsx
// D-69 step 4: Bets › Recommended (research assessments) drawn. Contracts: its title is "Recommended", focusable for the
// navigation that opens it; each assessment is a picture row: the game's marks first, the assessment, the price on the
// right over its assessment word, with a stable id; the spoken name keeps the title and the label; no "Your guess vs.
// market" cross-link. The research read is a stand-in.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

const state = vi.hoisted(() => ({ assessments: null }));
vi.mock('../web/src/api.js', () => ({ linesApi: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/next/shell/context.js', () => ({ useShell: () => ({ go: vi.fn(), state: { views: { bets: { view: 'research' } } } }) }));
vi.mock('../web/src/next/lines/linesData.js', () => ({ useLinesData: () => ({ app: { accountId: 'luke' } }) }));
vi.mock('../web/src/next/research/useAssessments.js', () => ({ useAssessments: () => state.assessments }));
const { default: ResearchAssessments } = await import('../web/src/next/research/Assessments.jsx');

const assessment = { id: 'a1', routeId: 'r-0123456789abcdef01234567', gameId: 'SEA-DEN', title: 'Synthetic Receiver over 65.5 yards', label: 'Research lean', color: 'yellow',
  hasConflicts: true, quote: { odds: -115, source: 'FanDuel', observedAt: '2099-10-08T15:00:00Z' }, selection: { market: 'prop' }, reasons: [], evidence: [], evidenceGroups: 1 };
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));

describe('Bets › Recommended', () => {
  state.assessments = { status: 'ready', reload: vi.fn(), data: { season: 2026, week: 9, assessments: [assessment], statistics: [], sources: [], coverage: null } };
  const html = renderToStaticMarkup(<div className="gx"><ResearchAssessments/></div>);
  it('is titled Recommended, focusable, with no cross-link to Your gap', () => {
    expect(markupProblems(html)).toEqual([]);
    const h1 = nodes(html).find(n => n.tag === 'h1');
    expect([textOf(h1), h1.attrs.tabindex, 'data-route-focus' in h1.attrs]).toEqual(['Recommended', '-1', true]);
    expect(html).not.toContain('Your guess vs. market');
  });
  it('draws each assessment as a picture row: marks first, the price over its word, a stable id', () => {
    const row = nodes(html).find(n => n.tag === 'button' && n.attrs?.['data-assessment']);
    expect(row.attrs.id).toBe('gx-b-ra-r-0123456789abcdef01234567');
    expect(nameFrom(row)).toBe('Synthetic Receiver over 65.5 yards Research lean, opposing evidence present');
    expect(/\bgx-prow-pic\b/.test(row.children[0].attrs?.class ?? '')).toBe(true);
    expect([...walk(row.children[0])].filter(n => /\bgx-team\b/.test(n.attrs?.class ?? '')).length).toBe(2);
    expect(textOf(nodes(html).find(n => /\bgx-prow-value\b/.test(n.attrs?.class ?? '')))).toBe('−115');
    expect(textOf(nodes(html).find(n => /\bgx-prow-word\b/.test(n.attrs?.class ?? '')))).toBe('Research lean');
  });
});
```

(The kit's team mark's root is `span.gx-team`, `ui/TeamMark.jsx`.)

- [ ] **Step 2: Run them and see them fail.**

Run: `npx vitest run tests/next-bets-everyone-ui.test.jsx tests/next-bets-recommended-ui.test.jsx`
Expected: FAIL (rows are `li.gx-ev-pick`; the h1 is "Research recommendations"; the rows are `gx-ra-tile`).

- [ ] **Step 3: Everyone's rows.** In `web/src/next/bets/everyone.js` set `banner: 'Friends’ lines show once you lock
in that game, or at kickoff.'` (twelve words; the model and every gate are unchanged). In
`web/src/next/bets/EveryoneBets.jsx` import `PictureRow` and `useEntrance` from the kit and `SEP` from `../format.js`;
the loading skeleton becomes `<Skeleton label="Loading everyone’s picks…" shape="rows" count={4} className="gx-ev-skel"/>`;
in `EveryoneBoard`, `const enter = useEntrance();`, and the weekly list becomes:

```jsx
        <ol className="gx-prows gx-stagger" data-enter={enter} aria-label="This week’s players">
          {board.qualification.map(row => <li key={row.id}><PictureRow data-person={row.id} className={cx(row.you && 'gx-ev-you')}
            picture={<Avatar id={row.id} name={row.display} you={row.you}/>} title={row.name} meta={`${row.picks} ${row.picks === 1 ? 'pick' : 'picks'}${SEP}${row.units}`}
            word={row.qualified ? 'Qualified' : null} tone={row.qualified ? 'good' : 'plain'}/></li>)}
        </ol>
```

and the game cards sit in `<ol className="gx-vstack gx-gap-24 gx-ev-games" aria-label="Picks by game">` with one `<li>`
each. In `EveryoneGame` the pick list becomes:

```jsx
    <ol className="gx-prows" aria-label="Picks on this game">
      {game.picks.map(pick => <li key={pick.key}><PictureRow data-pick={pick.key} data-open={pick.open ? 'true' : 'false'} className={cx(pick.you && 'gx-ev-you')}
        picture={<Avatar id={pick.userId} name={pick.display} you={pick.you}/>} title={pick.name}
        meta={pick.open ? `${pick.marketName}${SEP}${pick.terms.pick}${SEP}${pick.terms.odds} · ${pick.terms.book}`
          : <>{`${pick.marketName}${SEP}${pick.side}`} <LockLine as="span">{pick.locked}</LockLine></>}
        value={pick.units} word={pick.result ? (pick.result.net ? `${pick.result.label} ${pick.result.net}` : pick.result.label) : null}
        tone={pick.result?.tone === 'win' ? 'good' : 'plain'}/></li>)}
    </ol>
```

(a loss's word is plain: losses stay quiet). In `web/src/next/bets/everyone.css` replace the `.gx-ev-person` and
`.gx-ev-pick` rules (the picture row draws them) with:

```css
/* D-69 step 4: the players and each game's picks are the kit's picture rows (face first); your rows keep the your-row
   tint. A skeleton row is a picture row's height (measured in Task 8). Tokens only. */
.gx .gx-ev-games { margin: 0; padding: 0; list-style: none; }
.gx .gx-ev-games > li { min-width: 0; }
.gx .gx-ev .gx-prow.gx-ev-you { background: var(--gx-accent-tint); box-shadow: inset 3px 0 0 var(--gx-accent-ink); }
.gx .gx-ev-skel .gx-skel-row { min-height: 64px; }
```

keeping `.gx-ev`, `.gx-ev-game-head` and its `> .gx-grow` rule.

- [ ] **Step 4: Recommended's rows and title.** In `web/src/next/research/Assessments.jsx`:
- import `useRef` with React, `PictureRow`, `TeamMark`, `useEntrance`, `useLayerFocus` from `../ui/index.js` (beside
  `Button`, `InfoButton`, `Skeleton`) and `BETS_NAMES` from `../bets/betsNav.js`;
- add `const TONE = Object.freeze({ green: 'good', yellow: 'plain', red: 'warn', gray: 'plain' });` and
  `const marks = gameId => { const [away, home] = String(gameId).split('-'); return <><TeamMark code={away} size={24} decorative/><TeamMark code={home} size={24} decorative/></>; };`;
- in `ResearchAssessments`: `const root = useRef(null), enter = useEntrance(); useLayerFocus(root);`; the section gets
  `ref={root}`; the heading becomes
  `<h1 id="gx-ra-title" className="gx-t-title" tabIndex={-1} data-route-focus>{BETS_NAMES.recommended}</h1>`; delete the
  `Your guess vs. market` button;
- the list's rows become:

```jsx
        {!rows.length ? <p className="gx-t-body" role="status">{assessmentEmptyMessage(data, { market, color })}</p>
          : <ol className="gx-prows gx-stagger" data-enter={enter} aria-label="Assessed bets">{rows.slice(0, limit).map(a => <li key={a.id}>
            <PictureRow id={`gx-b-ra-${a.routeId}`} data-assessment={a.color} picture={marks(a.gameId)} title={a.title}
              meta={a.hasConflicts ? 'Opposing evidence present' : null} value={a.quote ? odds(a.quote.odds) : '—'} word={a.label} tone={TONE[a.color] ?? 'plain'}
              ariaLabel={`${a.title} ${a.label}${a.hasConflicts ? ', opposing evidence present' : ''}`} onClick={() => select(a.routeId)}/></li>)}</ol>}
```

  (`odds()` already writes the real minus). The assessment layer (`Nest` with the "Assessed bets" lip) is unchanged.
In `web/src/next/research/assessments.css`, delete the `.gx-ra-tile` rule and its forced-colors line (the picture row
draws the row; the `[data-assessment]` tints stay and now tint the rows).

- [ ] **Step 5: Run them and see them pass.**

Run: `npx vitest run tests/next-bets-everyone-ui.test.jsx tests/next-bets-recommended-ui.test.jsx tests/research-assessments-ui.test.jsx tests/next-empty-actions.test.jsx tests/next-bets-sections.test.jsx && node --test tests/next-bets-everyone.test.mjs tests/next-game-bets.test.mjs tests/next-tokens.test.mjs tests/next-app-view.test.mjs`
Expected: PASS (the League bets sheet draws the same `EveryoneGame`; its pure test is unchanged).

- [ ] **Step 6: Commit.**

```bash
git add web/src/next/bets/EveryoneBets.jsx web/src/next/bets/everyone.js web/src/next/bets/everyone.css web/src/next/research/Assessments.jsx web/src/next/research/assessments.css tests/next-bets-everyone-ui.test.jsx tests/next-bets-recommended-ui.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/bets/EveryoneBets.jsx web/src/next/research/Assessments.jsx
git commit -m "Everyone and Recommended as picture rows: faces and marks first, the gates unchanged" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6 · Your gap: the screen

### Task 6: The model, the state, D-77's hero, the tiles and the rows, on the same data as the old screen

Before any change, run `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/recommended-bets.spec.js --reporter=line`
on the unchanged code and record the result (the characterization the rebuild must keep; Task 8 maps each test).

**Files:**
- Create: `web/src/next/bets/gap/gapModel.js`, `gap/useGap.js`, `gap/GapParts.jsx`, `gap/GapHero.jsx`, `gap/YourGap.jsx` (the list; Task 7
  adds the layer), `gap/gap.css`, `tests/next-bets-gap.test.mjs`, `tests/next-bets-gap-ui.test.jsx`

**Interfaces:**
- Consumes: `buildRecommendations`, `recommendationList`, `gapRecord`, `recommendationMarket` (`shared/recommended-bets.mjs`,
  unchanged), `gameTrends`, `TRENDS_*` (`shared/trends-view.mjs`), `cloudApi`, `linesApi` (`web/src/api.js`),
  `useServerNow`, kit `PictureRow`, `Segmented`, `InfoButton`, `KeptParent`, `Skeleton`, `TeamMark`, `Card`, `Button`,
  `useEntrance`, `useLayerFocus`, `INFO.recommended`, Task 1's `BETS_NAMES`, `gapRowId`, `openGap`, `closeGap`,
  `betsLayerOf`.
- Produces: the `gapModel.js` names in the shared list; `useGap({ accountId, market, onDirty, onSaved, onSignInAgain,
  onTrackTicket, confirm })` → `{ data, personal, info, now, loading, busy, error, notice, selections, uncertain,
  expanded, historical, ranked, shown, gaps, picks, canTrack, setExpanded, choose, changeUnits, remove, add, track, save,
  refresh, changeWeek, selectedWeek }`; `GapHero({ record, week })`; `GapList({ gap, market, messages, onMarket, onOpen })`;
  `YourGap({ onTrackTicket, onDirty, onSaved })` (default export).

- [ ] **Step 1: Write the failing model test.** Create `tests/next-bets-gap.test.mjs`:

```js
// D-69 step 4: Bets › Your gap's rules as plain data (the old VirtualUnits.jsx Recommended view, rebuilt). Contracts: a
// row says its game as marks and codes, its point gap, the side to review and the quote's age, the % on the right over a
// word that says its state; four tiles; the saved card in the app's words; the review closes at kickoff by the server's
// clock; the placement body is the reviewed quote's exact terms; a lost reply is confirmed only by the exact saved terms;
// a locked or already saved market's selection is dropped; the trends are the market's own; D-77's units keep their style.
import test from 'node:test';
import assert from 'node:assert/strict';
import week7 from '../shared/trends/2026-week-07.json' with { type: 'json' };
import { GAP_COPY, closedReason, confirmsChoice, gapRow, gapTiles, gapTrendCards, gapUnits, pendingRows, placeBody, quoteAge, savedRows, staleKeys, termsText, trackTicket, weekOptions } from '../web/src/next/bets/gap/gapModel.js';

const now = Date.parse('2099-10-08T17:00:00Z');
const game = { id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', kickoff: '2099-10-08T20:00:00Z', offers: { total: { over: { book: 'betmgm', source: 'BetMGM', side: 'over', line: 44.5, odds: -110, observedAt: '2099-10-08T15:00:00Z' } } }, locked: { spread: false, total: false } };
const row = { key: 'SEA-DEN:total', game, market: 'total', guess: 55, gap: 10.5, gapPercent: 23.595, side: 'over', reference: { value: 44.5, books: 3, observedAt: '2099-10-08T15:00:00Z' }, offer: game.offers.total.over, savedPick: null, actionable: true, evaluations: {} };
const words = text => String(text).trim().split(/\s+/).length;

test('a row: marks and codes, the point gap, the side to review and the quote’s age; the % over a word that says its state', () => {
  assert.deepEqual(gapRow(row, { now }), { item: 'SEA-DEN:total', gameId: 'SEA-DEN', market: 'total', away: 'SEA', home: 'DEN', title: 'SEA @ DEN · Total',
    meta: '10.5 pt gap · Review Over · 2h old', value: '23.6%', word: 'To act on', tone: 'good', ariaLabel: 'SEA at DEN total, 23.6% gap, 10.5 points, review Over, To act on' });
  assert.deepEqual([gapRow({ ...row, savedPick: {}, actionable: false }, { now }).word, gapRow(row, { now, selection: {} }).word, gapRow({ ...row, offer: null, actionable: false }, { now }).word], ['Saved', 'On your card', 'No quote']);
  assert.equal(quoteAge('2099-10-08T16:48:00Z', now), '12m old');
});

test('four tiles: to act on, gaps, the biggest gap and your card', () => {
  const rows = [row, { ...row, key: 'HOU-JAX:spread', market: 'spread', gapPercent: 42.9, actionable: false, game: { ...game, id: 'HOU-JAX', awayCode: 'HOU', homeCode: 'JAX' } }];
  assert.deepEqual(gapTiles({ rows, picks: [{}] }).map(t => [t.key, t.label, t.big, t.sub]), [['act', 'To act on', '1', 'favorable quote'], ['gaps', 'Gaps', '2', 'this week'],
    ['top', 'Biggest gap', '42.9%', 'HOU @ JAX · Spread'], ['card', 'Your card', '1', 'saved pick']]);
  assert.deepEqual(gapTiles({ rows: [], picks: [] }).map(t => t.big), ['0', '0', '—', '0']);
});

test('your card and your virtual card in the app’s words; a closed selection says so', () => {
  const selection = { gameId: 'SEA-DEN', market: 'total', side: 'over', units: 2, offer: game.offers.total.over, game };
  assert.equal(termsText(game, 'total', 'over', selection.offer, 2), 'Over 44.5 · −110 · 2U · BetMGM');
  const [pending] = pendingRows({ 'SEA-DEN:total': selection }, new Set(), { games: [game] }, now);
  assert.deepEqual([pending.item, pending.meta, pending.word], ['SEA-DEN:total', 'Over 44.5 · −110 · 2U · BetMGM', 'Ready']);
  assert.equal(pendingRows({ 'SEA-DEN:total': selection }, new Set(['SEA-DEN:total']), { games: [game] }, now).length, 0, 'a shown row holds its own review');
  assert.equal(pendingRows({ 'SEA-DEN:total': selection }, new Set(), { games: [game] }, Date.parse('2099-10-08T20:01:00Z'))[0].word, 'Closed');
  const [saved] = savedRows({ games: [game], picks: [{ gameId: 'SEA-DEN', market: 'total', status: 'pending', selection: { side: 'over', line: 44.5, odds: -110, units: 1, source: 'BetMGM' } }] });
  assert.deepEqual([saved.title, saved.meta, saved.value, saved.word], ['SEA @ DEN · Total', 'Over 44.5 · −110 · 1U · BetMGM', '1U', 'Pending']);
  const [won] = savedRows({ games: [game], picks: [{ gameId: 'SEA-DEN', market: 'total', status: 'win', result: { netUnits: 0.91 }, selection: { side: 'over', line: 44.5, odds: -110, units: 1, source: 'BetMGM' } }] });
  assert.deepEqual([won.value, won.word, won.tone], ['+0.91U', 'Won', 'good']);
});

test('the review closes at kickoff by the server’s clock; a started, final or missing game is closed', () => {
  assert.equal(closedReason(game, now, null), null);
  assert.equal(closedReason(game, Date.parse('2099-10-08T20:00:00Z'), null), 'Kickoff reached');
  assert.equal(closedReason({ ...game, started: true }, now, null), 'Game closed');
  assert.equal(closedReason(game, now, { status: 'final' }), 'Game closed');
  assert.equal(closedReason(null, now, null), 'Matchup unavailable');
});

test('the placement sends the reviewed quote’s exact terms; a lost reply is confirmed only by the same saved terms', () => {
  const choice = { gameId: 'SEA-DEN', market: 'total', side: 'over', units: 2, offer: game.offers.total.over };
  assert.deepEqual(placeBody(choice, { season: 2099, week: 5, revision: 7 }), { gameId: 'SEA-DEN', market: 'total', side: 'over', line: 44.5, odds: -110, units: 2,
    source: 'betmgm', quotedAt: '2099-10-08T15:00:00Z', season: 2099, week: 5, revision: 7 });
  const saved = selection => ({ picks: [{ gameId: 'SEA-DEN', market: 'total', selection }] });
  const exact = { side: 'over', line: 44.5, odds: -110, units: 2, source: 'BetMGM', quotedAt: '2099-10-08T15:00:00.000Z' };
  assert.equal(confirmsChoice(saved(exact), choice), true);
  for (const change of [{ units: 1 }, { odds: -105 }, { source: 'FanDuel' }, { quotedAt: '2099-10-08T15:30:00Z' }]) assert.equal(confirmsChoice(saved({ ...exact, ...change }), choice), false, JSON.stringify(change));
  assert.deepEqual(trackTicket({ ...row, offer: game.offers.total.over }, { season: 2099, week: 5 }), { season: 2099, week: 5, kind: 'single',
    legs: [{ gameId: 'SEA-DEN', market: 'total', side: 'over', line: 44.5 }], odds: -110, source: 'BetMGM', quotedAt: '2099-10-08T15:00:00Z', stakeUnits: null, placedAt: null });
});

test('a selection on a market now locked, or already saved, is dropped; the week options name older weeks', () => {
  const selections = { 'SEA-DEN:total': { gameId: 'SEA-DEN', market: 'total' }, 'HOU-JAX:spread': { gameId: 'HOU-JAX', market: 'spread' }, 'KC-BUF:total': { gameId: 'KC-BUF', market: 'total' } };
  const data = { games: [{ ...game, locked: { total: true } }, { id: 'HOU-JAX', locked: {} }, { id: 'KC-BUF', locked: {} }], picks: [{ gameId: 'HOU-JAX', market: 'spread' }] };
  assert.deepEqual(staleKeys(data, selections).sort(), ['HOU-JAX:spread', 'SEA-DEN:total']);
  assert.deepEqual(weekOptions({ publishedWeek: { season: 2099, week: 6 }, slates: [{ season: 2099, week: 6 }, { season: 2099, week: 5 }] }),
    [{ value: 'current', label: 'Current · 2099 Week 6' }, { value: '2099:5', label: '2099 Week 5' }]);
  assert.deepEqual(weekOptions(null), []);
});

test('trends are the market’s own from the published week; D-77’s units keep their style; no copy runs over twelve words', () => {
  const spread = gapTrendCards(week7, 'PIT-NO', 'spread', -3), total = gapTrendCards(week7, 'PIT-NO', 'total', 45);
  assert.ok(spread.every(card => week7.cards[card.id].market.endsWith('_ats')));
  assert.ok(total.length > 0 && total.every(card => week7.cards[card.id].market.startsWith('total')));
  assert.deepEqual(gapTrendCards(week7, 'NOT-A-GAME', 'total', 45), []);
  assert.deepEqual([gapUnits(2.55), gapUnits(-1), gapUnits(0), gapUnits(2.5)], ['+2.55U', '−1U', '0U', '+2.5U']);
  for (const [key, text] of Object.entries(GAP_COPY)) if (typeof text === 'string') assert.ok(words(text) <= 12, key);
});
```

(If the repository's Node does not accept `with { type: 'json' }`, read the file with `fs.readFileSync` and `JSON.parse`,
as other node tests do.)

- [ ] **Step 2: Run it and see it fail.**

Run: `node --test tests/next-bets-gap.test.mjs`
Expected: FAIL (`Cannot find module …/bets/gap/gapModel.js`).

- [ ] **Step 3: The model.** Create `web/src/next/bets/gap/gapModel.js`:

```js
// Bets › Your gap (D-69 step 4; the old app's VirtualUnits.jsx Recommended view, rebuilt as tiles and rows on the same
// data): your locked guesses against the latest consensus in D-54's percentage ranking with D-77's actionable rows first
// (shared/recommended-bets.mjs decides every row) and D-77's paper record against the closing lines. Pure: the words, rows,
// tiles and checks the screen and its gap layer draw and run. Every time is the server's (the read's `now`).
import { gameTrends } from '../../../../../shared/trends-view.mjs';
import { DASH, MINUS, PICKEM, SEP, fmtNum, fmtOdds, fmtSigned, fmtU, toMs } from '../../format.js';

export const MARKET_NAME = Object.freeze({ spread: 'Spread', total: 'Total' });
export const GAP_COPY = Object.freeze({
  loading: 'Loading your gaps…', region: 'Gaps this week', week: 'Recommendation week', current: 'Current',
  top: 'Top 3 to act on', topDiff: 'Top 3 differences', all: 'All differences', showTop: 'Show top 3',
  none: 'No differences to show yet. Lock in guesses, then check back.', viewAll: 'View all markets',
  mismatch: 'Your guesses and these lines are not available for the same week.', refreshRecs: 'Refresh recommendations',
  historical: 'View only · older week', leftOut: 'Drafts, locked markets and started games are left out.',
  added: 'Added to your card. Check the terms, then place it.', saved: 'Virtual pick saved with its book, line, odds and unit stake.',
  confirmed: 'Your saved Virtual Units pick is confirmed.', recheck: 'Saved picks refreshed. Review your selection before saving again.',
  closedNotice: 'This game is closed. Your selected terms stay on your card.', refresh: 'Refresh lines', refreshing: 'Refreshing…',
  tryAgain: 'Try again', checkSaved: 'Check saved picks', yourCard: 'Your card', savedCard: 'Your virtual card',
  savedNote: 'Saved picks stay here when a line changes or a game starts.', baseline: 'Percentage uses a 3-point minimum spread for pick’em and small lines.',
  noQuote: 'No usable named-book quote on this side. It cannot be added yet.', unsavedStays: 'Your unsaved selection remains here while the ranked list changes.',
  gone: 'This gap is not on your list now.', reviewLabel: 'Review your card · play money only',
});
/** Fine print, behind the screen's ⓘ (D-55 rule 10), so it may run longer than a surface line. */
export const GAP_FINE_PRINT = Object.freeze({
  ranking: 'Ranked by percentage gap. Spread lines below 3 use 3 as a baseline. These gaps are not win probabilities.',
});
export const showAllLabel = n => `Show all ${n} differences`;
export const noneForMarket = market => `No ${market} differences to show yet.`;
export const closedLine = reason => `Closed · ${reason}. New placement is closed; your selected terms remain here.`;
const CLOSED = new Set(['started', 'live', 'in_progress', 'final', 'complete', 'completed', 'cancelled', 'canceled', 'postponed', 'suspended']);
const codes = game => [game?.awayCode || game?.away || DASH, game?.homeCode || game?.home || DASH];

export const sideName = (game, market, side) => (market === 'total' ? (side === 'over' ? 'Over' : 'Under') : codes(game)[side === 'home' ? 1 : 0]);
/** "Over 44.5", "DEN −3", "SEA Pick'em". */
export function lineText(game, market, side, line) {
  if (!Number.isFinite(line)) return sideName(game, market, side);
  return market === 'total' ? `${sideName(game, market, side)} ${fmtNum(line)}` : `${sideName(game, market, side)} ${line === 0 ? PICKEM : fmtSigned(line)}`;
}
/** "Over 44.5 · −110 · 2U · BetMGM": a quote's or a saved pick's terms. */
export function termsText(game, market, side, quote, units) {
  return [lineText(game, market, side, quote?.line), Number.isFinite(quote?.odds) ? fmtOdds(quote.odds) : null, Number.isFinite(units) ? fmtU(units) : null, quote?.source || null].filter(Boolean).join(SEP);
}
/** Your guess or the consensus: a spread as home's line ("−3.5", "Pick'em"), a total as points. */
export const marketNumber = (market, value) => (market === 'spread' ? (value === 0 ? PICKEM : fmtSigned(value)) : fmtNum(value));
export function quoteAge(observedAt, now) {
  const at = toMs(observedAt);
  if (at === null || !Number.isFinite(now)) return DASH;
  const minutes = Math.max(0, Math.floor((now - at) / 60000));
  return minutes < 60 ? `${minutes}m old` : `${Math.floor(minutes / 60)}h old`;
}
/** D-77's units, as its approved card writes them: "+2.55U", "+2.5U", "−1U", "0U". */
export function gapUnits(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n === 0) return '0U';
  return `${n > 0 ? '+' : MINUS}${Math.abs(n).toFixed(2).replace(/\.?0+$/, '')}U`;
}
/** Why a review is closed now (the server's `now`), or null: the old card's reasons, word for word. */
export function closedReason(game, now, result) {
  const kickoff = toMs(game?.kickoff);
  if (!game || kickoff === null) return 'Matchup unavailable';
  if (Number.isFinite(now) && kickoff <= now) return 'Kickoff reached';
  if (game.started || game.final || result || CLOSED.has(String(game.status || '').toLowerCase())) return 'Game closed';
  return null;
}
/** A reviewed quote is its exact terms: line, price, book and observation time. */
export const sameQuote = (a, b) => Boolean(a && b) && a.line === b.line && a.odds === b.odds && a.book === b.book && a.source === b.source && toMs(a.observedAt) === toMs(b.observedAt);

const rowWord = (row, selection) => (row.savedPick ? { word: 'Saved', tone: 'plain' } : selection ? { word: 'On your card', tone: 'warn' }
  : row.actionable ? { word: 'To act on', tone: 'good' } : { word: 'No quote', tone: 'plain' });
/** One ranked gap as a picture row. */
export function gapRow(row, { selection = null, now = null } = {}) {
  const { game, market, side, reference } = row, [away, home] = codes(game), pct = `${row.gapPercent.toFixed(1)}%`, review = sideName(game, market, side);
  const { word, tone } = rowWord(row, selection);
  return { item: `${game.id}:${market}`, gameId: game.id, market, away, home, title: `${away} @ ${home}${SEP}${MARKET_NAME[market]}`,
    meta: `${fmtNum(row.gap)} pt gap${SEP}Review ${review}${SEP}${quoteAge(reference.observedAt, now)}`, value: pct, word, tone,
    ariaLabel: `${away} at ${home} ${market}, ${pct} gap, ${fmtNum(row.gap)} points, review ${review}, ${word}` };
}
/** The four tiles over the chosen market's ranked rows and your saved picks. */
export function gapTiles({ rows = [], picks = [] } = {}) {
  const act = rows.filter(r => r.actionable).length, top = rows.reduce((best, r) => (!best || r.gapPercent > best.gapPercent ? r : best), null);
  return [
    { key: 'act', label: 'To act on', big: String(act), sub: act === 1 ? 'favorable quote' : 'favorable quotes' },
    { key: 'gaps', label: 'Gaps', big: String(rows.length), sub: 'this week' },
    { key: 'top', label: 'Biggest gap', big: top ? `${top.gapPercent.toFixed(1)}%` : DASH, sub: top ? `${codes(top.game).join(' @ ')}${SEP}${MARKET_NAME[top.market]}` : 'None yet' },
    { key: 'card', label: 'Your card', big: String(picks.length), sub: picks.length === 1 ? 'saved pick' : 'saved picks' },
  ];
}
const OUTCOME = Object.freeze({ pending: ['Pending', 'plain'], win: ['Won', 'good'], loss: ['Lost', 'plain'], push: ['Push', 'plain'], void: ['Void', 'plain'] });
/** Your virtual card for the week shown: each saved pick's terms, its units or its result, and a word (a loss is plain). */
export function savedRows(data) {
  const games = Array.isArray(data?.games) ? data.games : [];
  return (Array.isArray(data?.picks) ? data.picks : []).map(pick => {
    const [awayId, homeId] = String(pick.gameId).split('-');
    const game = games.find(g => g.id === pick.gameId) ?? { id: pick.gameId, awayCode: awayId, homeCode: homeId };
    const [away, home] = codes(game), s = pick.selection ?? {}, [word, tone] = OUTCOME[pick.status] ?? ['Pending', 'plain'];
    const net = pick.status && pick.status !== 'pending' && Number.isFinite(pick.result?.netUnits) ? gapUnits(pick.result.netUnits) : null;
    const terms = termsText(game, pick.market, s.side, s, s.units);
    return { key: `${pick.gameId}:${pick.market}`, away, home, title: `${away} @ ${home}${SEP}${MARKET_NAME[pick.market]}`, meta: terms,
      value: net ?? fmtU(s.units), word, tone, ariaLabel: `${away} at ${home} ${pick.market}, ${terms}, ${word}` };
  });
}
/** Your card: each unsaved selection whose row is not shown (a filter, the top three, a kickoff), as a row to its layer. */
export function pendingRows(selections, shownKeys, data, now) {
  return Object.entries(selections ?? {}).filter(([key]) => !shownKeys.has(key)).flatMap(([key, s]) => {
    const current = data?.games?.find(g => g.id === s.gameId), game = current ?? s.game;
    if (!game || current?.locked?.[s.market]) return [];
    const [away, home] = codes(game), closed = closedReason(current, now, data?.results?.[s.gameId]), terms = termsText(game, s.market, s.side, s.offer, s.units);
    return [{ key, item: key, away, home, title: `${away} @ ${home}${SEP}${MARKET_NAME[s.market]}`, meta: terms, value: fmtU(s.units),
      word: closed ? 'Closed' : 'Ready', tone: closed ? 'plain' : 'warn', ariaLabel: `${away} at ${home} ${s.market}, your card, ${terms}, ${closed ? 'closed' : 'ready to place'}` }];
  });
}
/** The POST /bets/recommendations/place body: the reviewed quote's exact terms, for the week and revision read. */
export function placeBody(choice, data) {
  return { gameId: choice.gameId, market: choice.market, side: choice.side, line: choice.offer.line, odds: choice.offer.odds, units: choice.units,
    source: choice.offer.book, quotedAt: choice.offer.observedAt, season: data.season, week: data.week, revision: data.revision };
}
/** After a lost reply: the saved pick confirms the selection only with its exact side, line, price, units, book and quote time. */
export function confirmsChoice(latest, choice) {
  const saved = (Array.isArray(latest?.picks) ? latest.picks : []).find(p => p.gameId === choice.gameId && p.market === choice.market)?.selection;
  return Boolean(saved) && saved.side === choice.side && saved.line === choice.offer.line && saved.odds === choice.offer.odds && saved.units === choice.units
    && saved.source === choice.offer.source && toMs(saved.quotedAt) === toMs(choice.offer.observedAt);
}
/** Selections that can no longer be saved: their market locked in a newer read (D-36), or a pick saved elsewhere. */
export function staleKeys(data, selections) {
  const saved = new Set((Array.isArray(data?.picks) ? data.picks : []).map(p => `${p.gameId}:${p.market}`));
  return Object.keys(selections ?? {}).filter(key => { const s = selections[key]; return data?.games?.find(g => g.id === s.gameId)?.locked?.[s.market] === true || saved.has(key); });
}
/** A tracked-ticket draft from a current row's quote: a quote, never evidence of a stake or a placement. */
export function trackTicket(current, data) {
  return { season: data.season, week: data.week, kind: 'single', legs: [{ gameId: current.game.id, market: current.market, side: current.side, line: current.offer.line }],
    odds: current.offer.odds, source: current.offer.source || current.offer.book, quotedAt: current.offer.observedAt, stakeUnits: null, placedAt: null };
}
/** The week select's options: the current published week, then every older week with a slate. */
export function weekOptions(info) {
  if (!info) return [];
  const pub = info.publishedWeek;
  return [{ value: 'current', label: `${GAP_COPY.current}${pub ? `${SEP}${pub.season} Week ${pub.week}` : ''}` },
    ...(info.slates || []).filter(w => w.season !== pub?.season || w.week !== pub?.week).map(w => ({ value: `${w.season}:${w.week}`, label: `${w.season} Week ${w.week}` }))];
}
/** The first two trends of this game in this market with a sample (the old RecommendationTrends.jsx rule). */
export function gapTrendCards(weekData, gameId, market, consensus) {
  if (!weekData) return [];
  const { all } = gameTrends(weekData, gameId, { access: { [market]: true }, saved: { [market]: consensus } });
  return all.filter(card => {
    const cardMarket = weekData.cards?.[card.id]?.market;
    const same = market === 'spread' ? cardMarket?.endsWith('_ats') : cardMarket?.startsWith('total');
    return !card.locked && same && (!card.gate || card.gate === market) && card.games > 0;
  }).slice(0, 2);
}
```

- [ ] **Step 4: Run it and see it pass.**

Run: `node --test tests/next-bets-gap.test.mjs`
Expected: PASS.

- [ ] **Step 5: The state.** Create `web/src/next/bets/gap/useGap.js` (the old view's state, moved; every rule is the
model's):

```js
// Bets › Your gap's state (D-69 step 4): the account's recommendation read for the published week (or an older one, view
// only), D-77's /lines/read for the paper record, the review card's selections and the one virtual-pick write. It is the
// old VirtualUnits.jsx Recommended view's state, moved, with the server's clock in place of the device's: the read's
// `personal.now`, ticking from when it landed (useServerNow), until the week's last kickoff.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cloudApi, linesApi } from '../../../api.js';
import { buildRecommendations, gapRecord, recommendationList } from '../../../../../shared/recommended-bets.mjs';
import { useServerNow } from '../../home/useServerNow.js';
import { GAP_COPY, closedReason, confirmsChoice, placeBody, staleKeys, trackTicket } from './gapModel.js';

const lastKickoff = data => { const t = (data?.games || []).map(g => Date.parse(g.kickoff)).filter(Number.isFinite); return t.length ? Math.max(...t) : 0; };
const omit = (object, keys) => (keys.length ? Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key))) : object);

export function useGap({ accountId, market, onDirty, onSaved, onSignInAgain, onTrackTicket, confirm = () => true }) {
  const [reply, setReply] = useState(null); // { virtual, personal, info, at }
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selections, setSelections] = useState({}), [uncertain, setUncertain] = useState(null), [expanded, setExpanded] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null), [board, setBoard] = useState(null);
  const inflight = useRef(null), generation = useRef(0), shownScope = useRef(null), lastScope = useRef(null), signIn = useRef(onSignInAgain);
  signIn.current = onSignInAgain;
  const data = reply?.virtual ?? null, personal = reply?.personal ?? null, info = reply?.info ?? null;
  const now = useServerNow(personal ? Date.parse(personal.now) : null, reply?.at ?? null, { until: lastKickoff(data) });
  const nowRef = useRef(now); nowRef.current = now;
  const take = useCallback(result => setReply({ virtual: result.virtual, personal: result.personal, at: Date.now(),
    info: { slates: result.slates || [], publishedWeek: result.publishedWeek, current: result.current !== false } }), []);
  const load = useCallback(async signal => {
    inflight.current?.abort();
    const controller = new AbortController(); inflight.current = controller;
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort(); else signal?.addEventListener('abort', abort, { once: true });
    try {
      const result = await cloudApi('bets/recommendations', selectedWeek || {}, { signal: controller.signal });
      if (!controller.signal.aborted) take(result);
      return result;
    } catch (failure) {
      // As before: a failed recommendation read shows no older week's card (it could be another week's).
      if (!controller.signal.aborted) { if (failure.status === 401 && !failure.uncertain) signIn.current?.(); setReply(null); }
      throw failure;
    } finally { signal?.removeEventListener('abort', abort); }
  }, [selectedWeek, take]);
  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    setReply(null); setSelections({}); setUncertain(null); setBusy(false); setExpanded(false); setLoading(true); setError('');
    load(controller.signal).catch(failure => { if (failure.name !== 'AbortError' && !controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { generation.current += 1; controller.abort(); inflight.current?.abort(); };
  }, [load, accountId]);
  // A new week or account never shows the last one's selections; the scope also guards a save's late reply.
  const scope = data ? `${accountId || data.playerId}:account:${data.season}:${data.week}` : null;
  shownScope.current = scope;
  useEffect(() => {
    if (!scope) return;
    if (lastScope.current && lastScope.current !== scope) { setSelections({}); setUncertain(null); setNotice(''); }
    lastScope.current = scope; setExpanded(false);
  }, [scope]);
  useEffect(() => { onDirty?.(busy || Boolean(uncertain) || Object.keys(selections).length > 0); }, [busy, uncertain, selections, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  useEffect(() => { if (data) setSelections(current => omit(current, staleKeys(data, current))); }, [data]);
  // D-77: your own lines board for the week on screen, read once per week; a failed read only hides the record.
  const gapWeek = data ? `${data.season}:${data.week}` : null;
  useEffect(() => {
    if (!gapWeek) return undefined;
    const controller = new AbortController(), [season, week] = gapWeek.split(':').map(Number);
    linesApi('read', { season, week }, controller.signal).then(b => { if (!controller.signal.aborted) setBoard({ week: gapWeek, board: b }); },
      () => { if (!controller.signal.aborted) setBoard({ week: gapWeek, board: null }); });
    return () => controller.abort();
  }, [gapWeek, accountId]);
  const historical = info?.current === false || data?.current === false;
  const ranked = useMemo(() => buildRecommendations({ personal, virtual: data, now }), [personal, data, now]);
  // BETS-NEXT-01: the market narrows the whole ranked set before the top three; display only.
  const shown = useMemo(() => recommendationList(ranked.rows, { market, expanded }), [ranked.rows, market, expanded]);
  const gaps = useMemo(() => (board?.week === gapWeek && board.board ? gapRecord(board.board, { market }) : null), [board, gapWeek, market]);
  const picks = useMemo(() => Object.fromEntries((data?.picks || []).map(p => [`${p.gameId}:${p.market}`, p])), [data]);
  const closed = gameId => closedReason(data?.games.find(g => g.id === gameId), nowRef.current, data?.results?.[gameId]);
  const current = key => buildRecommendations({ personal, virtual: data, now: nowRef.current }).rows.find(item => item.key === key);
  function choose(game, mkt, side, units) {
    const offer = game.offers?.[mkt]?.[side];
    if (!offer || closedReason(game, nowRef.current, data?.results?.[game.id])) return;
    const matchup = { id: game.id, home: game.home, away: game.away, homeCode: game.homeCode, awayCode: game.awayCode, kickoff: game.kickoff };
    setSelections(list => ({ ...list, [`${game.id}:${mkt}`]: { gameId: game.id, market: mkt, side, units, offer, game: matchup } }));
  }
  // Units change only the stake: the quote reviewed stays on the selection until a newer one is chosen.
  function changeUnits(key, units) { const s = selections[key]; if (!s || closed(s.gameId)) return; setSelections(list => (list[key] ? { ...list, [key]: { ...list[key], units } } : list)); }
  function remove(key) { setSelections(list => omit(list, [key])); }
  function add(row) {
    if (busy || loading || uncertain || historical || picks[row.key] || selections[row.key]) return;
    const fresh = current(row.key); if (!fresh?.offer) return;
    choose(fresh.game, fresh.market, fresh.side, 1); setNotice(GAP_COPY.added);
  }
  function track(row) {
    if (busy || loading || uncertain || historical || !onTrackTicket) return;
    const fresh = current(row.key); if (!fresh?.offer) return;
    onTrackTicket(trackTicket(fresh, data));
  }
  async function save(key) {
    const choice = selections[key]; if (!choice || busy || uncertain || loading || !data || historical) return;
    if (closed(choice.gameId)) { setNotice(GAP_COPY.closedNotice); return; }
    const gen = generation.current, at = scope, still = () => gen === generation.current && at === shownScope.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await cloudApi('bets/recommendations/place', placeBody(choice, data), { save: true });
      if (!still()) return;
      take(response); remove(key); onSaved?.(); setNotice(GAP_COPY.saved);
    } catch (failure) {
      if (!still()) return;
      setError(failure.message);
      if (failure.status === 401 && !failure.uncertain) signIn.current?.();
      if (failure.uncertain) setUncertain({ key, choice });
    } finally { if (still()) setBusy(false); }
  }
  async function refresh() {
    if (loading || busy) return;
    setLoading(true); setError('');
    let request;
    try {
      const pending = load(); request = inflight.current;
      const latest = await pending;
      if (request !== inflight.current || request.signal.aborted) return;
      if (uncertain) {
        const ok = confirmsChoice(latest.virtual, uncertain.choice);
        if (ok) { remove(uncertain.key); onSaved?.(); }
        setNotice(ok ? GAP_COPY.confirmed : GAP_COPY.recheck); setUncertain(null);
      }
    } catch (failure) { if (!request?.signal.aborted && request === inflight.current) setError(failure.message); }
    finally { if (request === inflight.current && !request?.signal.aborted) setLoading(false); }
  }
  function changeWeek(value) {
    if (busy || loading) return;
    const next = value === 'current' ? null : info?.slates.find(w => `${w.season}:${w.week}` === value);
    if (value !== 'current' && !next) return;
    if ((uncertain || Object.keys(selections).length) && !confirm()) return;
    setNotice(''); setSelectedWeek(next ? { season: next.season, week: next.week } : null);
  }
  return { data, personal, info, now, loading, busy, error, notice, selections, uncertain, expanded, historical, ranked, shown, gaps, picks,
    canTrack: Boolean(onTrackTicket), setExpanded, choose, changeUnits, remove, add, track, save, refresh, changeWeek, selectedWeek };
}
```

- [ ] **Step 6: Write the failing UI test.** Create `tests/next-bets-gap-ui.test.jsx` (Task 7 adds the layer's cases):

```jsx
// D-69 step 4: Bets › Your gap drawn from a fixed state (GapList and GapHero draw what `gap` holds). Contracts: D-77's hero
// is the first card with its approved words, dots and About toggle; the market switch; four tiles; the ranked rows as
// picture rows (marks first, a stable id, the % over its word); Show all names its count; your card's unsaved
// selections; your virtual card with its count and week; an older week is view only; the Refresh lines button says
// Refreshing… and is busy while a read is on its way; the title is focusable for the navigation that opens it.
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { markupProblems, nameFrom, parseMarkup, walk } from './helpers/ui-markup.mjs';

vi.mock('../web/src/api.js', () => ({ cloudApi: vi.fn(() => new Promise(() => {})), linesApi: vi.fn(() => new Promise(() => {})) }));
vi.mock('../web/src/trendsLoaders.js', () => ({ loadTrendWeek: vi.fn(() => new Promise(() => {})) }));
const { GapList } = await import('../web/src/next/bets/gap/YourGap.jsx');
const { GapHero } = await import('../web/src/next/bets/gap/GapHero.jsx');

const now = Date.parse('2099-10-08T17:00:00Z');
const game = (id, away, home) => ({ id, awayCode: away, homeCode: home, kickoff: '2099-10-08T20:00:00Z', offers: {}, locked: {} });
const ref = { value: -3.5, books: 3, observedAt: '2099-10-08T15:00:00Z' };
const ranked = id => ({ key: `${id}:spread`, game: game(id, ...id.split('-')), market: 'spread', guess: -10, gap: 6.5, gapPercent: 185.7, side: 'home', reference: ref, offer: { line: -3.5 }, savedPick: null, actionable: true, evaluations: {} });
const rows = ['SEA-DEN', 'HOU-JAX', 'KC-BUF', 'LAR-SF'].map(ranked);
const record = { wins: 5, losses: 2, pushes: 0, netUnits: 2.55, favorable: { wins: 4, losses: 2, pushes: 0 }, notGraded: { noFinal: 0, noLine: 0 },
  graded: [{ gameId: 'SEA-DEN', market: 'spread', outcome: 'win' }, { gameId: 'HOU-JAX', market: 'spread', outcome: 'loss' }] };
const gap = (patch = {}) => ({ data: { season: 2099, week: 5, games: rows.map(r => r.game), picks: [{ gameId: 'SEA-DEN', market: 'total', status: 'pending', selection: { side: 'over', line: 44.5, odds: -110, units: 1, source: 'BetMGM' } }] },
  info: { publishedWeek: { season: 2099, week: 5 }, slates: [{ season: 2099, week: 5 }, { season: 2099, week: 4 }] }, now, loading: false, busy: false, error: '', notice: '',
  selections: { 'NYJ-BUF:total': { gameId: 'NYJ-BUF', market: 'total', side: 'over', units: 2, offer: { line: 44.5, odds: -110, source: 'BetMGM', observedAt: ref.observedAt }, game: game('NYJ-BUF', 'NYJ', 'BUF') } },
  uncertain: null, expanded: false, historical: false, ranked: { status: 'ready', rows, counts: { locked: 1, missingReference: 0 } },
  shown: { rows, visible: rows.slice(0, 3) }, gaps: record, picks: {}, canTrack: true, setExpanded: vi.fn(), refresh: vi.fn(), changeWeek: vi.fn(), ...patch });
const draw = (state = gap()) => renderToStaticMarkup(<div className="gx"><GapList gap={state} market="all" messages onMarket={vi.fn()} onOpen={vi.fn()}/></div>);
const nodes = html => [...walk(parseMarkup(html))];
const textOf = n => (n.text ?? (n.children ?? []).map(textOf).join(''));

describe('Your gap', () => {
  const html = draw();
  it('keeps the kit markup rules; its title is Your gap, focusable', () => {
    expect(markupProblems(html)).toEqual([]);
    const h1 = nodes(html).find(n => n.tag === 'h1');
    expect([textOf(h1), h1.attrs.tabindex, 'data-route-focus' in h1.attrs]).toEqual(['Your gap', '-1', true]);
  });
  it('D-77’s hero is the first card: the rate, the record, one dot per gap, the About toggle', () => {
    const list = nodes(html).find(n => n.attrs?.['data-gap'] === 'list');
    const first = list.children.find(n => n.tag);
    expect([first.attrs['aria-label'], first.attrs['data-gap']]).toEqual(['Your gaps vs. closing lines', 'hero']);
    for (const text of ['Your gaps · Week 5', '71.4%', 'beat the close', '5–2 · +2.55U at −110']) expect(textOf(first)).toContain(text);
    expect(nodes(html).filter(n => n.attrs?.['data-outcome']).map(n => [n.attrs['data-outcome'], n.attrs['aria-label']])).toEqual([['win', 'SEA at DEN spread: Win'], ['loss', 'HOU at JAX spread: Loss']]);
    expect(nodes(html).find(n => n.tag === 'button' && nameFrom(n) === 'About your gaps').attrs['aria-expanded']).toBe('false');
    expect(html).not.toContain('a paper record, not bets placed');
  });
  it('the market switch, four tiles, the top three as picture rows, and Show all with its count', () => {
    expect(nodes(html).some(n => n.attrs?.role === 'group' && n.attrs['aria-label'] === 'Recommendation market')).toBe(true);
    expect(nodes(html).filter(n => n.attrs?.['data-gap-tile']).map(n => n.attrs['data-gap-tile'])).toEqual(['act', 'gaps', 'top', 'card']);
    const gapRows = nodes(html).filter(n => n.attrs?.['data-gap-row']);
    expect(gapRows.map(n => [n.attrs['data-gap-row'], n.attrs.id])).toEqual([['SEA-DEN:spread', 'gx-b-gap-SEA-DEN-spread'], ['HOU-JAX:spread', 'gx-b-gap-HOU-JAX-spread'], ['KC-BUF:spread', 'gx-b-gap-KC-BUF-spread']]);
    expect(/\bgx-prow-pic\b/.test(gapRows[0].children[0].attrs?.class ?? '')).toBe(true);
    expect(textOf(gapRows[0])).toContain('6.5 pt gap');
    expect(html).toContain('Top 3 to act on');
    expect(html).toContain('4 gaps · Week 5');
    expect(nodes(html).some(n => n.tag === 'button' && textOf(n) === 'Show all 4 differences')).toBe(true);
  });
  it('your card lists an unsaved selection whose row is not shown; your virtual card counts its picks', () => {
    const card = nodes(html).find(n => n.attrs?.['data-gap'] === 'your-card');
    expect(textOf(card)).toContain('Over 44.5 · −110 · 2U · BetMGM');
    const saved = nodes(html).find(n => n.attrs?.['data-gap'] === 'saved-card');
    expect(saved.attrs['aria-label']).toBe('Your virtual card');
    for (const text of ['1 saved · Week 5', 'Over 44.5 · −110 · 1U · BetMGM', 'Pending']) expect(textOf(saved)).toContain(text);
    expect(nodes(html).find(n => n.tag === 'select').attrs['aria-label']).toBe('Recommendation week');
  });
  it('an older week is view only: no rows, no placement', () => {
    const older = draw(gap({ historical: true }));
    expect(older).toContain('View only · older week');
    expect(nodes(older).filter(n => n.attrs?.['data-gap-row'])).toHaveLength(0);
  });
  it('Refresh lines says Refreshing… and is busy while a read is on its way, with the rows’ skeleton', () => {
    const busy = draw(gap({ data: null, loading: true, gaps: null }));
    const button = nodes(busy).find(n => n.tag === 'button' && nameFrom(n) === 'Refreshing…');
    expect(button.attrs['aria-busy']).toBe('true');
    expect(nodes(busy).find(n => n.attrs?.['data-skeleton'] === 'rows').attrs.class).toContain('gx-gap-skel');
  });
  it('the hero with nothing graded says so', () => {
    const empty = renderToStaticMarkup(<div className="gx"><GapHero record={{ ...record, graded: [] }} week={5}/></div>);
    expect(empty).toContain('No finished games with a gap yet.');
  });
});
```

- [ ] **Step 7: Run it and see it fail.**

Run: `npx vitest run tests/next-bets-gap-ui.test.jsx`
Expected: FAIL (`YourGap.jsx` and `GapHero.jsx` do not exist).

- [ ] **Step 8: The hero, the list and the styles.** Create `web/src/next/bets/gap/GapHero.jsx`:

```jsx
// D-77 (Sean, November 3, 2026: "Your gaps' paper record", then option 1, "Hit rate hero"): one hero card with the share of
// your decided gaps that beat the closing line (W / (W + L), as D-75's win rate), the record and units at −110, and one dot
// per graded gap in kickoff order; its fine print opens from its info button. Moved from VirtualUnits.jsx unchanged
// (D-69 step 4): the same words, names, dots and toggle; only its classes are the new app's (gap.css, the same tokens).
import { useState } from 'react';
import { Icon } from '../../ui/index.js';
import { gapUnits } from './gapModel.js';

const GAP_WORDS = Object.freeze({ win: ['W', 'Win'], loss: ['L', 'Loss'], push: ['P', 'Push'] });

export function GapHero({ record, week }) {
  const [about, setAbout] = useState(false);
  const decided = record.wins + record.losses, waiting = record.notGraded.noFinal + record.notGraded.noLine, favorable = record.favorable;
  const rate = decided ? `${(record.wins / decided * 100).toFixed(1)}%` : '—';
  const tally = value => `${value.wins}–${value.losses}${value.pushes ? `–${value.pushes}` : ''}`;
  return <section className="gx-card gx-card--hero gx-gap-hero" aria-label="Your gaps vs. closing lines" data-gap="hero">
    <div className="gx-gap-hero-top"><span className="gx-t-micro">Your gaps · Week {week}</span>
      <button type="button" className="gx-gap-about" aria-label="About your gaps" aria-expanded={about} onClick={() => setAbout(open => !open)}><Icon icon="info" size={20}/></button></div>
    {record.graded.length ? <>
      <div className="gx-gap-rate"><span className="gx-n-xl">{rate}</span><span className="gx-t-body">beat the close</span></div>
      <p className="gx-t-meta">{tally(record)} · {gapUnits(record.netUnits)} at −110</p>
      <ol className="gx-gap-dots" aria-label="Each gap, in kickoff order">{record.graded.map(g => <li key={`${g.gameId}:${g.market}`} data-outcome={g.outcome}
        aria-label={`${g.gameId.replace('-', ' at ')} ${g.market === 'spread' ? 'spread' : 'total'}: ${GAP_WORDS[g.outcome][1]}`}><span aria-hidden="true">{GAP_WORDS[g.outcome][0]}</span></li>)}</ol>
    </> : <p className="gx-t-body">No finished games with a gap yet.</p>}
    {about ? <p className="gx-t-meta">Each locked guess that differed from the last three-book line before kickoff, graded on the side your guess favored: a paper record, not bets placed. 1 U a gap at −110. Gaps of 10% or more: {tally(favorable)}.{waiting ? ` ${waiting} not graded yet.` : ''}</p> : null}
  </section>;
}
```

Create `web/src/next/bets/gap/GapParts.jsx` (drawn by both the list and the gap layer, so neither imports the other):

```jsx
// Your gap's two shared pieces (D-69 step 4): a game's two marks for a picture row, and the error and notice lines,
// drawn by whichever of the list and the gap layer shows (the hidden one draws none, so each line is said once).
import { Button, Card, TeamMark } from '../../ui/index.js';
import { GAP_COPY } from './gapModel.js';

export const marks = (away, home) => <><TeamMark code={away} size={24} decorative/><TeamMark code={home} size={24} decorative/></>;

export function GapMessages({ gap }) {
  return <>
    {gap.error ? <Card variant="s2" role="alert" data-gap="error"><p className="gx-t-body">{gap.error}</p>
      <Button onClick={gap.refresh} disabled={gap.loading || gap.busy}>{gap.uncertain ? GAP_COPY.checkSaved : GAP_COPY.tryAgain}</Button></Card> : null}
    {gap.notice ? <p className="gx-t-body" role="status" data-gap="notice">{gap.notice}</p> : null}
  </>;
}
```

Create `web/src/next/bets/gap/YourGap.jsx`:

```jsx
// Bets › Your gap (D-69 step 4, spec 6 "rebuilt as tiles and rows on the same data", built for Sean's review): the old
// app's VirtualUnits.jsx Recommended view in the new app. D-77's hit-rate hero is its first card, then the market
// switch, four tiles, your gaps as picture rows (one opens as a layer: GapLayer.jsx, Task 7), your card's unsaved
// selections and your saved virtual card. useGap.js holds the state, gapModel.js every rule. The old app keeps
// VirtualUnits.jsx.
import { useRef } from 'react';
import { Button, InfoButton, PictureRow, Segmented, Skeleton, useEntrance, useLayerFocus } from '../../ui/index.js';
import { INFO } from '../../info.js';
import { SEP } from '../../format.js';
import { BETS_NAMES, gapRowId } from '../betsNav.js';
import { GAP_COPY, GAP_FINE_PRINT, gapRow, gapTiles, noneForMarket, pendingRows, savedRows, showAllLabel, weekOptions } from './gapModel.js';
import { GapMessages, marks } from './GapParts.jsx';
import { GapHero } from './GapHero.jsx';
import './gap.css';

const MARKETS = [{ value: 'all', label: 'All' }, { value: 'spread', label: 'Spreads' }, { value: 'total', label: 'Totals' }];

export function GapList({ gap, market, messages = true, onMarket, onOpen }) {
  const root = useRef(null), group = useRef(null), enter = useEntrance();
  useLayerFocus(root);
  const { data, shown, ranked, historical, expanded } = gap;
  const visible = historical ? [] : shown.visible, shownKeys = new Set(visible.map(r => r.key));
  const actionable = shown.rows.filter(r => r.actionable).length, options = weekOptions(gap.info);
  const showAllMarkets = () => { onMarket('all'); group.current?.querySelector('button')?.focus(); };
  const pending = data && !historical ? pendingRows(gap.selections, shownKeys, data, gap.now) : [], saved = data ? savedRows(data) : [];
  return <section ref={root} className="gx-screen gx-bets" aria-labelledby="gx-b-gap-title" data-bets-section="gap">
    <header className="gx-bets-heading"><div className="gx-bets-titlebar">
      <h1 id="gx-b-gap-title" className="gx-t-title gx-grow" tabIndex={-1} data-route-focus>{BETS_NAMES.gap}</h1>
      <InfoButton title={INFO.recommended.title} body={[...INFO.recommended.body, GAP_FINE_PRINT.ranking]}/></div></header>
    {messages ? <GapMessages gap={gap}/> : null}
    {!data && gap.loading ? <Skeleton label={GAP_COPY.loading} shape="rows" count={4} className="gx-gap-skel"/> : null}
    {data ? <section className="gx-vstack gx-gap-16" aria-label={GAP_COPY.region} data-gap="list">
      {gap.gaps ? <GapHero record={gap.gaps} week={data.week}/> : null}
      {options.length > 1 ? <label className="gx-gap-week gx-t-body">Week<select aria-label={GAP_COPY.week} value={gap.selectedWeek ? `${gap.selectedWeek.season}:${gap.selectedWeek.week}` : 'current'}
        disabled={gap.busy || gap.loading} onChange={event => gap.changeWeek(event.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label> : null}
      {historical ? <p className="gx-t-body" role="status">{GAP_COPY.historical}</p>
        : ranked.status !== 'ready' ? <div className="gx-vstack gx-gap-8" role="status"><p className="gx-t-body">{GAP_COPY.mismatch}</p><Button onClick={gap.refresh}>{GAP_COPY.refreshRecs}</Button></div>
        : <>
          <div ref={group}><Segmented label="Recommendation market" value={market} onChange={onMarket} options={MARKETS}/></div>
          <ul className="gx-tiles" aria-label="Your gaps in numbers" data-gap="tiles">{gapTiles({ rows: shown.rows, picks: data.picks || [] }).map(t => <li key={t.key}>
            <div className="gx-nest-tile gx-gap-stat" data-gap-tile={t.key}><span className="gx-nest-tile-label">{t.label}</span><span className="gx-n-l gx-nest-num">{t.big}</span><span className="gx-t-meta gx-tile-sub">{t.sub}</span></div></li>)}</ul>
          <div className="gx-gap-head"><h2 className="gx-t-section">{expanded ? GAP_COPY.all : actionable ? GAP_COPY.top : GAP_COPY.topDiff}</h2><span className="gx-t-meta">{`${shown.rows.length} gaps${SEP}Week ${data.week}`}</span></div>
          {visible.length ? <ol className="gx-prows gx-stagger" data-enter={enter} aria-label="Gaps">{visible.map(row => { const r = gapRow(row, { selection: gap.selections[row.key], now: gap.now });
            return <li key={r.item}><PictureRow id={gapRowId(r.item)} data-gap-row={r.item} data-market={r.market} picture={marks(r.away, r.home)} title={r.title} meta={r.meta}
              value={r.value} word={r.word} tone={r.tone} ariaLabel={r.ariaLabel} onClick={() => onOpen(r.item)}/></li>; })}</ol>
            : market === 'all' ? <p className="gx-t-body" role="status">{GAP_COPY.none}</p>
            : <div className="gx-vstack gx-gap-8" role="status"><p className="gx-t-body">{noneForMarket(market)}</p><Button onClick={showAllMarkets}>{GAP_COPY.viewAll}</Button></div>}
          {shown.rows.length > 3 ? <Button aria-expanded={expanded} onClick={() => gap.setExpanded(value => !value)}>{expanded ? GAP_COPY.showTop : showAllLabel(shown.rows.length)}</Button> : null}
          {pending.length ? <section className="gx-vstack gx-gap-8" aria-label={GAP_COPY.yourCard} data-gap="your-card"><h2 className="gx-t-section">{GAP_COPY.yourCard}</h2>
            <ol className="gx-prows">{pending.map(r => <li key={r.item}><PictureRow id={`${gapRowId(r.item)}-card`} data-gap-card={r.item} picture={marks(r.away, r.home)} title={r.title} meta={r.meta}
              value={r.value} word={r.word} tone={r.tone} ariaLabel={r.ariaLabel} onClick={() => onOpen(r.item)}/></li>)}</ol></section> : null}
          {ranked.counts.locked > 0 || ranked.counts.missingReference > 0 ? <p className="gx-t-meta">{GAP_COPY.leftOut}</p> : null}
        </>}
      {saved.length ? <section className="gx-vstack gx-gap-8" aria-label={GAP_COPY.savedCard} data-gap="saved-card">
        <div className="gx-gap-head"><h2 className="gx-t-section">{GAP_COPY.savedCard}</h2><span className="gx-t-meta">{`${saved.length} saved${SEP}Week ${data.week}`}</span></div>
        <p className="gx-t-meta">{GAP_COPY.savedNote}</p>
        <ol className="gx-prows">{saved.map(r => <li key={r.key}><PictureRow data-saved={r.key} picture={marks(r.away, r.home)} title={r.title} meta={r.meta} value={r.value} word={r.word} tone={r.tone}/></li>)}</ol>
      </section> : null}
    </section> : null}
    <Button variant="ghost" onClick={gap.refresh} disabled={gap.loading || gap.busy} aria-busy={gap.loading}>{gap.loading ? GAP_COPY.refreshing : GAP_COPY.refresh}</Button>
  </section>;
}

/** Task 7 adds the state owner (`useGap`), the gap layer and the default export here. */
```

Create `web/src/next/bets/gap/gap.css`:

```css
/* D-69 step 4: Bets › Your gap. D-77's hero keeps the look Sean approved (moved from recommendedBets.css with the same
   tokens); the rows are the kit's picture rows; the gap layer's comparison, sides and actions. Tokens only. */
.gx .gx-gap-hero { display: flex; flex-direction: column; gap: var(--gx-space-3); color: var(--gx-text-1); }
.gx .gx-gap-hero .gx-t-micro, .gx .gx-gap-hero .gx-t-meta, .gx .gx-gap-rate .gx-t-body { margin: 0; color: var(--gx-text-2); }
.gx .gx-gap-hero-top { display: flex; align-items: center; justify-content: space-between; gap: var(--gx-space-2); }
.gx .gx-gap-about { display: grid; place-items: center; width: var(--gx-size-touch); height: var(--gx-size-touch); margin: calc(var(--gx-space-3) * -1) calc(var(--gx-space-3) * -1) calc(var(--gx-space-3) * -1) 0; padding: 0; border: 0; border-radius: var(--gx-radius-pill); background: none; color: var(--gx-text-2); cursor: pointer; }
.gx .gx-gap-about:focus-visible { outline: 2px solid var(--gx-focus); outline-offset: 2px; }
.gx .gx-gap-rate { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--gx-space-2); }
.gx .gx-gap-dots { display: flex; flex-wrap: wrap; gap: var(--gx-space-2); margin: 0; padding: 0; list-style: none; }
.gx .gx-gap-dots li { display: grid; place-items: center; width: var(--gx-space-7); height: var(--gx-space-7); border-radius: var(--gx-radius-pill); background: var(--gx-win); color: var(--gx-on-state); font: 700 13px/1 var(--gx-font-body); }
.gx .gx-gap-dots li[data-outcome="loss"] { background: var(--gx-loss); }
.gx .gx-gap-dots li[data-outcome="push"] { background: var(--gx-pending); }
.gx .gx-gap-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-gap-week { display: flex; flex-direction: column; gap: var(--gx-space-2); min-width: 0; }
.gx .gx-gap-week select { min-height: var(--gx-size-touch); width: 100%; min-width: 0; padding: var(--gx-space-2); color: var(--gx-text-1); background: var(--gx-surface-2); border: 1px solid var(--gx-border-strong); border-radius: var(--gx-radius-sm); font: inherit; }
.gx .gx-gap-stat { justify-content: space-between; }
/* A skeleton row is a gap row's height (measured in Task 8 at 390 px). */
.gx .gx-gap-skel .gx-skel-row { min-height: 72px; }
```

- [ ] **Step 9: Run them and see them pass.**

Run: `npx vitest run tests/next-bets-gap-ui.test.jsx && node --test tests/next-bets-gap.test.mjs tests/next-tokens.test.mjs tests/next-app-view.test.mjs tests/recommended-bets.test.mjs`
Expected: PASS (Bets still imports `VirtualUnits.jsx` until Task 7, so the app-view adapter list is unchanged here).

- [ ] **Step 10: Commit.**

```bash
git add web/src/next/bets/gap/gapModel.js web/src/next/bets/gap/useGap.js web/src/next/bets/gap/GapParts.jsx web/src/next/bets/gap/GapHero.jsx web/src/next/bets/gap/YourGap.jsx web/src/next/bets/gap/gap.css tests/next-bets-gap.test.mjs tests/next-bets-gap-ui.test.jsx
git diff --cached --stat && git ls-files --eol web/src/next/bets/gap/*.js web/src/next/bets/gap/*.jsx web/src/next/bets/gap/gap.css
git commit -m "Your gap in the new app: the model, the state, D-77's hero, tiles and rows on the same data" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7 · One gap as a layer

### Task 7: The gap layer and its review card; Bets draws Your gap and stops importing VirtualUnits.jsx

**Files:**
- Create: `web/src/next/bets/gap/GapLayer.jsx`, `gap/GapReview.jsx`, `gap/GapTrends.jsx`
- Modify: `web/src/next/bets/gap/YourGap.jsx` (the state owner and default export), `gap/gap.css`,
  `web/src/next/bets/Bets.jsx`, `tests/next-bets-gap-ui.test.jsx`, `tests/next-refresh-busy.test.jsx`,
  `tests/next-app-view.test.mjs`

**Interfaces:**
- Consumes: Task 6's `useGap`, `gapModel.js`, `GapList`, `GapMessages` (`GapParts.jsx`); kit `Nest`, `KeptParent`, `Chip`,
  `ChipRail`, `IconButton`, `LockLine`, `MetaLine`, `Icon`, `Skeleton`, `useLayerFocus`; `lineLocked` (`copy.js`);
  `UNIT_CHIPS`, `stepUnits` (`place.js`); `loadTrendWeek` (`web/src/trendsLoaders.js`, a shared module); Task 1's
  `betsLayerOf`, `gapTitle`, `openGap`, `closeGap`.
- Produces: `GapLayer({ gap, item, onClose })`, `GapReview({ gap, game, market, selection, pick })`,
  `GapTrends({ season, week, gameId, market, consensus })`, `GapTrendsView({ trend })`; `YourGap` default export.

- [ ] **Step 1: Write the failing layer tests.** In `tests/next-bets-gap-ui.test.jsx`, add to its imports
`import { isValidElement } from 'react';` and, beside the `GapList` import,
`const { GapLayer } = await import('../web/src/next/bets/gap/GapLayer.jsx');`,
`const { GapReview } = await import('../web/src/next/bets/gap/GapReview.jsx');` and
`const { GapTrendsView } = await import('../web/src/next/bets/gap/GapTrends.jsx');`; extend the header comment with the
layer's contracts; then append:

```jsx
// A component tree walked for its controls (kit components included), so a press calls the handler it was given.
function controls(node, found = []) {
  if (Array.isArray(node)) { node.forEach(child => controls(child, found)); return found; }
  if (!isValidElement(node)) return found;
  if (typeof node.props?.onClick === 'function') found.push(node);
  controls(node.props?.children, found);
  return found;
}
const said = node => Array.isArray(node) ? node.map(said).join('') : isValidElement(node) ? said(node.props.children) : node == null || node === false ? '' : String(node);
const press = (tree, name) => { const hit = controls(tree).find(c => c.props.label === name || c.props['aria-label'] === name || said(c.props.children) === name); if (!hit) throw new Error(`No ${name}`); hit.props.onClick(); };

describe('one gap’s layer', () => {
  const reviewed = { book: 'draftkings', source: 'DraftKings', line: -11.5, odds: -110, observedAt: '2099-10-08T15:00:00.000Z' };
  const newer = { book: 'fanduel', source: 'FanDuel', line: -10.5, odds: -105, observedAt: '2099-10-08T16:00:00.000Z' };
  const tbDal = { id: 'TB-DAL', awayCode: 'TB', homeCode: 'DAL', kickoff: '2099-10-08T20:00:00.000Z', locked: { spread: false }, offers: { spread: { home: newer, away: { ...newer, line: 10.5 } } } };
  const selection = { gameId: 'TB-DAL', market: 'spread', side: 'home', units: 1.5, offer: reviewed, game: tbDal };
  const review = (patch = {}) => { const state = { ...gap(), choose: vi.fn(), changeUnits: vi.fn(), save: vi.fn(), remove: vi.fn(), ...patch }; return { state, tree: GapReview({ gap: state, game: tbDal, market: 'spread', selection, pick: null }) }; };
  it('keeps the reviewed quote and shows a newer one apart, taken only through Use updated quote', () => {
    const html = renderToStaticMarkup(<div className="gx">{review().tree}</div>);
    expect(html).toContain('Your selected quote: DAL −11.5 · −110 · 1.5U · DraftKings');
    expect(html).toContain('Updated quote: DAL −10.5 · −105 · FanDuel');
    const { state, tree } = review();
    press(tree, 'Use updated quote');
    expect(state.choose).toHaveBeenCalledWith(tbDal, 'spread', 'home', 1.5);
    expect(state.changeUnits).not.toHaveBeenCalled();
  });
  it('changes only the units from every unit control', () => {
    const { state, tree } = review();
    press(tree, '2 units'); press(tree, 'Increase units'); press(tree, 'Decrease units');
    expect(state.changeUnits.mock.calls).toEqual([['TB-DAL:spread', 2], ['TB-DAL:spread', 2], ['TB-DAL:spread', 1]]);
    expect(state.choose).not.toHaveBeenCalled();
  });
  it('at kickoff by the server’s clock it is closed: the terms stay, Remove from card, no placement', () => {
    const html = renderToStaticMarkup(<div className="gx">{review({ now: Date.parse('2099-10-08T20:00:01Z') }).tree}</div>);
    expect(html).toContain('Closed · Kickoff reached');
    expect(html).toContain('DAL −11.5 · −110 · 1.5U · DraftKings');
    expect(html).toContain('Remove from card');
    expect(html).not.toContain('Place virtual pick');
  });
  it('a market locked in a newer read shows its lock sentence and no controls (D-36)', () => {
    const html = renderToStaticMarkup(<div className="gx"><GapReview gap={gap()} game={{ ...tbDal, locked: { spread: true } }} market="spread" selection={selection} pick={null}/></div>);
    expect(html).toContain('to see this line.');
    expect(html).not.toContain('Place virtual pick');
  });
  it('the layer: its title from the item, the Your gap lip, both sides with their words, the actions, and the old card’s words', () => {
    const evaluations = { away: { side: 'away', advantage: 1, color: 'green', label: 'Favorable', offer: null }, home: { side: 'home', advantage: -1, color: 'red', label: 'Against your guess', offer: null } };
    const row = { ...rows[0], key: 'SEA-DEN:spread', reference: { ...ref, value: -2 }, denominator: 3, evaluations, offer: null, actionable: false };
    const html = renderToStaticMarkup(<div className="gx"><GapLayer gap={gap({ ranked: { status: 'ready', rows: [row], counts: {} } })} item="SEA-DEN:spread" onClose={() => {}}/></div>);
    expect(markupProblems(html)).toEqual([]);
    expect(nodes(html).find(n => n.tag === 'h2').children.map(textOf).join('')).toBe('Seahawks @ Broncos · Spread');
    expect(html).toContain('Back to </span>');
    for (const text of ['Latest consensus', '3-point minimum spread', 'No usable named-book quote', 'Track this bet', 'Play with Virtual Units']) expect(html).toContain(text);
    expect(nodes(html).filter(n => n.attrs?.['data-side']).map(n => [n.attrs['data-side'], n.attrs['data-value-color'], textOf(n).includes(n.attrs['data-value-color'] === 'green' ? 'Favorable' : 'Against your guess')]))
      .toEqual([['away', 'green', true], ['home', 'red', true]]);
  });
  it('the trends: the actual record, sample, years and credit, never a forecast', () => {
    const html = renderToStaticMarkup(<div className="gx"><GapTrendsView trend={{ status: 'ready', reference: 'Historical schedule through 2026', cards: [{ key: 'past', title: 'Past home games', record: '8–4–0', sample: '12 games', years: [2018, 2026] }] }}/></div>);
    for (const text of ['8–4–0', '12 games', '2018–2026', 'not forecasts', 'CC BY 4.0']) expect(html).toContain(text);
  });
});
```

In `tests/next-refresh-busy.test.jsx`, the "Your gap" case (contract kept: Your gap's Refresh lines says Refreshing…,
is busy and does not spin) renders the new screen: mock `../web/src/next/data/AppData.jsx`
(`useAppData: () => ({ accountId: LUKE, requestSignIn: () => {} })`) and `../web/src/next/shell/context.js`
(`useShell: () => ({ state: { views: { bets: { view: 'recommended' } } }, setView: () => {}, confirmLeave: () => true })`),
import `const { default: YourGap } = await import('../web/src/next/bets/gap/YourGap.jsx');`, and render
`<div className="gx"><YourGap/></div>` in place of `<VirtualUnits … initialView="recommended" embedded/>` (keep the
`VirtualUnits` import out of the file; the old app's own refresh is not this test's contract).

In `tests/next-app-view.test.mjs` (spec test 13):
- the Bets adapter becomes `'web/src/next/bets/Bets.jsx': ['SocialBetTracker.jsx', 'DeferredScreen.jsx', 'liveBets.css'],`
  with the comment "D-69 step 4: Your gap is the new app's own (bets/gap/); the old app keeps VirtualUnits.jsx";
- the last assertion's pattern becomes
  `/CommunityHome|PlayPresentation|FantasyAccuracy|VirtualUnits|RecommendationTrends|recommendedBets\.css/` and its
  comment "the rebuilt Play, Research and Bets pages no longer import the old screens they replace".

- [ ] **Step 2: Run them and see them fail.**

Run: `npx vitest run tests/next-bets-gap-ui.test.jsx tests/next-refresh-busy.test.jsx && node --test tests/next-app-view.test.mjs`
Expected: FAIL (`GapLayer`, `GapReview`, `GapTrendsView` and the default `YourGap` are missing; Bets still imports
`VirtualUnits.jsx`).

- [ ] **Step 3: The trends.** Create `web/src/next/bets/gap/GapTrends.jsx`:

```jsx
// One gap's historical trends (D-69 step 4; the old RecommendationTrends.jsx in the new app): the published week's public
// trends file through the shared loader (trendsLoaders.js, the cache every trends screen shares), and the market's own
// first two trends with a sample (gapModel.js gapTrendCards). Past records are context, not forecasts; the credit and the
// licence stay in view.
import { useEffect, useMemo, useState } from 'react';
import { TRENDS_CREDIT, TRENDS_LICENSE_URL, TRENDS_SOURCE_URL } from '../../../../../shared/trends-view.mjs';
import { loadTrendWeek } from '../../../trendsLoaders.js';
import { gapTrendCards } from './gapModel.js';

export function useGapTrends({ season, week, gameId, market, consensus }) {
  const [state, setState] = useState({ status: 'loading', weekData: null });
  useEffect(() => {
    let active = true;
    setState({ status: 'loading', weekData: null });
    loadTrendWeek(season, week).then(weekData => { if (active) setState({ status: weekData ? 'ready' : 'missing', weekData }); },
      () => { if (active) setState({ status: 'error', weekData: null }); });
    return () => { active = false; };
  }, [season, week]);
  const cards = useMemo(() => gapTrendCards(state.weekData, gameId, market, consensus), [state.weekData, gameId, market, consensus]);
  return { status: state.status, cards, reference: state.weekData?.copy?.reference };
}

export function GapTrendsView({ trend }) {
  if (trend.status === 'loading') return <p className="gx-t-meta" role="status">Loading historical trends…</p>;
  if (trend.status !== 'ready') return <p className="gx-t-meta">Historical trends unavailable for this week.</p>;
  if (!trend.cards.length) return <p className="gx-t-meta">No matching historical trends with a sample for this game.</p>;
  return <section className="gx-vstack gx-gap-8" aria-label="Historical trends">
    <h3 className="gx-t-label gx-c-2">Historical context</h3>
    <ul className="gx-prows">{trend.cards.map(card => <li key={card.key}><div className="gx-prow gx-prow--nopic gx-prow--static">
      <span className="gx-prow-main"><span className="gx-t-strong gx-prow-title">{card.title}</span><span className="gx-t-meta gx-prow-meta">{`${card.sample} · ${card.years?.join('–') || 'Period unavailable'}`}</span></span>
      <span className="gx-prow-end"><span className="gx-n-s gx-prow-value">{card.record}</span></span></div></li>)}</ul>
    <p className="gx-t-meta">Past records are context, not forecasts. {trend.reference || TRENDS_CREDIT} · <a className="gx-ra-link" href={TRENDS_SOURCE_URL} target="_blank" rel="noreferrer">Source</a> · <a className="gx-ra-link" href={TRENDS_LICENSE_URL} target="_blank" rel="noreferrer">CC BY 4.0</a></p>
  </section>;
}

export function GapTrends(props) { return <GapTrendsView trend={useGapTrends(props)}/>; }
```

(`.gx-ra-link` comes from `research/assessments.css`; import it here:
`import '../../research/assessments.css';`.)

- [ ] **Step 4: The review card.** Create `web/src/next/bets/gap/GapReview.jsx`:

```jsx
// One gap's review card (D-69 step 4; the old Virtual Units card's terms, D-18 and the #140 salvage): the side chosen with
// the exact quote reviewed (line, price, book and when it was seen), the units, and the one placement. A refresh that
// brings a newer quote for that side shows it apart; it applies only through "Use updated quote". Units change only the
// stake. At kickoff by the server's clock it closes and keeps the terms. A market locked in a newer read shows its lock
// sentence and no controls (D-36).
import { Button, Chip, ChipRail, IconButton, LockLine } from '../../ui/index.js';
import { SEP, fmtNum, fmtOdds, fmtU, fmtWhen } from '../../format.js';
import { lineLocked } from '../../copy.js';
import { UNIT_CHIPS, stepUnits } from '../place.js';
import { GAP_COPY, MARKET_NAME, closedLine, closedReason, lineText, sameQuote, termsText } from './gapModel.js';
import '../place.css';

export function GapReview({ gap, game, market, selection, pick }) {
  const key = `${game.id}:${market}`, busy = gap.busy || gap.loading || Boolean(gap.uncertain);
  if (game.locked?.[market]) return <div data-gap="review" data-locked="true"><LockLine as="p" className="gx-t-meta">{lineLocked(market, gap.data?.rules)}</LockLine></div>;
  const reason = closedReason(game, gap.now, gap.data?.results?.[game.id]);
  const terms = `${termsText(selection.game ?? game, market, selection.side, selection.offer, selection.units)}${SEP}quoted ${fmtWhen(selection.offer.observedAt)}`;
  if (reason) return <div className="gx-vstack gx-gap-8" data-gap="review">
    <LockLine as="p" className="gx-t-body" role="status">{closedLine(reason)}</LockLine>
    <p className="gx-t-meta">Your selection: {terms}</p>
    <Button disabled={gap.busy || Boolean(gap.uncertain)} onClick={() => gap.remove(key)}>Remove from card</Button>
  </div>;
  const offers = game.offers?.[market] || {}, latest = offers[selection.side], updated = Boolean(latest) && !sameQuote(selection.offer, latest);
  const sides = market === 'spread' ? ['away', 'home'] : ['over', 'under'];
  return <div className="gx-vstack gx-gap-12" role="group" data-gap="review" aria-label={`Review ${game.awayCode} at ${game.homeCode} ${market} virtual pick`}>
    <p className="gx-t-label">{GAP_COPY.reviewLabel}</p>
    <p className="gx-t-body" data-gap="selected">Your selected quote: {terms}</p>
    {updated ? <><p className="gx-t-meta">Updated quote: {termsText(game, market, selection.side, latest)}{SEP}quoted {fmtWhen(latest.observedAt)}</p>
      <Button disabled={busy} onClick={() => gap.choose(game, market, selection.side, selection.units)}>Use updated quote</Button></> : null}
    <ChipRail label={`${MARKET_NAME[market]} sides`} className="gx-place-sides">{sides.map(side => { const offer = offers[side];
      return <Chip key={side} tall selected={selection.side === side} disabled={!offer || busy} onClick={() => gap.choose(game, market, side, selection.units)}
        label={offer ? `${lineText(game, market, side, offer.line)}, ${fmtOdds(offer.odds)}, ${offer.source}` : `${lineText(game, market, side)}, no saved quote`}>
        <span className="gx-place-chip"><span className="gx-n-s">{lineText(game, market, side, offer?.line)}</span>
          <span className="gx-t-meta gx-c-2">{offer ? `${fmtOdds(offer.odds)}${SEP}${offer.source}` : 'No saved quote'}</span></span></Chip>; })}</ChipRail>
    <ChipRail label={`${MARKET_NAME[market]} units`} className="gx-place-units">{UNIT_CHIPS.map(value => <Chip key={value} selected={selection.units === value} disabled={busy}
      label={`${fmtNum(value)} units`} onClick={() => gap.changeUnits(key, value)}>{fmtU(value)}</Chip>)}</ChipRail>
    <div className="gx-hstack gx-gap-8 gx-place-stepper">
      <IconButton icon="minus" label="Decrease units" onClick={() => gap.changeUnits(key, stepUnits(selection.units, -1))} disabled={busy || selection.units <= 0.5}/>
      <span className="gx-n-xs" aria-live="polite">{fmtU(selection.units)}</span>
      <IconButton icon="plus" label="Increase units" onClick={() => gap.changeUnits(key, stepUnits(selection.units, 1))} disabled={busy}/>
    </div>
    <Button variant="primary" block disabled={busy} onClick={() => gap.save(key)}>{gap.busy ? 'Saving…' : pick ? 'Save edit' : 'Place virtual pick'}</Button>
  </div>;
}
```

- [ ] **Step 5: The layer.** Create `web/src/next/bets/gap/GapLayer.jsx`:

```jsx
// Bets › Your gap › one gap (D-69 step 4): a nesting card under the Your gap lip with its own address
// (`#bets/recommended?layer=gap&item=SEA-DEN:total`). It holds what the old Recommended card opened to: your guess and the
// latest consensus, the market's historical trends, both sides against your guess (text-labelled traffic lights, D-54),
// the suggested side and its saved quote, Track this bet and Play with Virtual Units, and the review card. A selection
// whose row has left the list (a filter, the top three, a kickoff) is still reviewed here.
import { useRef } from 'react';
import { Circle } from 'lucide-react';
import { Button, Icon, MetaLine, Nest, Skeleton, useLayerFocus } from '../../ui/index.js';
import { MINUS, SEP, fmtNum, fmtWhen } from '../../format.js';
import { BETS_NAMES, gapTitle } from '../betsNav.js';
import { GAP_COPY, marketNumber, quoteAge, sideName, termsText } from './gapModel.js';
import { GapMessages } from './GapParts.jsx';
import { GapReview } from './GapReview.jsx';
import { GapTrends } from './GapTrends.jsx';

const GLYPH = Object.freeze({ green: 'plus', red: 'minus' });

function GapDetail({ gap, row, selection, pick }) {
  const { game, market, reference, evaluations } = row, home = game.homeCode || game.home;
  const busy = gap.busy || gap.loading || Boolean(gap.uncertain), sides = market === 'spread' ? ['away', 'home'] : ['over', 'under'];
  const current = gap.data.games.find(g => g.id === game.id) ?? game;
  return <>
    <MetaLine parts={[`Kickoff ${fmtWhen(game.kickoff)}`]}/>
    {market === 'spread' && Math.abs(reference.value) < 3 ? <p className="gx-t-meta">{GAP_COPY.baseline}</p> : null}
    <dl className="gx-gap-compare">
      <div className="gx-nest-tile"><dt className="gx-nest-tile-label">{`Your guess${market === 'spread' ? `${SEP}${home}` : ''}`}</dt><dd className="gx-n-l">{marketNumber(market, row.guess)}</dd></div>
      <div className="gx-nest-tile"><dt className="gx-nest-tile-label">{`Latest consensus${market === 'spread' ? `${SEP}${home}` : ''}`}</dt><dd className="gx-n-l">{marketNumber(market, reference.value)}</dd></div>
    </dl>
    <p className="gx-t-meta">{[reference.source || 'Named-book median', `${reference.books} books`, fmtWhen(reference.observedAt), quoteAge(reference.observedAt, gap.now)].join(SEP)}</p>
    <GapTrends season={gap.data.season} week={gap.data.week} gameId={game.id} market={market} consensus={reference.value}/>
    <ul className="gx-gap-sides" aria-label="How each side compares with your guess">{sides.map(side => { const e = evaluations[side];
      return <li key={side} className="gx-gap-side" data-side={side} data-value-color={e.color}>
        <span className="gx-t-strong">{sideName(game, market, side)}</span>
        <span className="gx-gap-side-word"><Icon icon={GLYPH[e.color] ?? Circle} size={16}/>{e.label}</span>
        <span className="gx-t-meta">{`${e.advantage > 0 ? '+' : e.advantage < 0 ? MINUS : ''}${fmtNum(Math.abs(e.advantage))} pts vs your guess`}</span></li>; })}</ul>
    <div className="gx-vstack gx-gap-4">
      <p className="gx-t-strong">Suggested: {sideName(game, market, row.side)}</p>
      <p className="gx-t-meta">{row.offer ? `Saved quote: ${termsText(game, market, row.side, row.offer)}${SEP}${quoteAge(row.offer.observedAt, gap.now)}` : GAP_COPY.noQuote}</p>
    </div>
    <div className="gx-gap-actions">
      {gap.canTrack ? <Button icon="plus" disabled={busy || !row.offer} onClick={() => gap.track(row)}>Track this bet</Button> : null}
      <Button icon={pick || selection ? 'check' : 'plus'} disabled={busy || !row.offer || Boolean(pick) || Boolean(selection)} onClick={() => gap.add(row)}>{pick ? 'Virtual pick saved' : selection ? 'Review below' : 'Play with Virtual Units'}</Button>
    </div>
    {pick ? <p className="gx-t-body" data-gap="saved">Saved: {termsText(game, market, pick.selection.side, pick.selection, pick.selection.units)}</p> : null}
    {selection ? <GapReview gap={gap} game={current} market={market} selection={selection} pick={pick}/> : null}
  </>;
}

export function GapLayer({ gap, item, onClose }) {
  const root = useRef(null);
  useLayerFocus(root);
  const row = gap.ranked.rows.find(r => r.key === item) ?? null, selection = gap.selections[item] ?? null, pick = gap.picks[item] ?? null;
  const title = gapTitle(item), game = selection ? (gap.data?.games.find(g => g.id === selection.gameId) ?? selection.game) : null;
  return <section ref={root} className="gx-screen gx-bets" data-bets-layer="gap" data-gap-item={item}>
    <h1 className="gx-t-title">{BETS_NAMES.gap}</h1>
    <GapMessages gap={gap}/>
    <Nest label={title} lips={[{ key: 'gap', label: BETS_NAMES.gap, onOpen: onClose }]} layer={`gap:${item}`} title={title}>
      {!gap.data ? <Skeleton label={GAP_COPY.loading} shape="panels" count={2}/>
        : row ? <GapDetail gap={gap} row={row} selection={selection} pick={pick}/>
        : selection ? <><p className="gx-t-meta">{GAP_COPY.unsavedStays}</p><GapReview gap={gap} game={game} market={selection.market} selection={selection} pick={pick}/></>
        : <p className="gx-t-body">{GAP_COPY.gone}</p>}
    </Nest>
  </section>;
}
```

In `web/src/next/bets/gap/YourGap.jsx`, replace the closing comment with the state owner (imports `KeptParent` with the
kit, `useAppData`, `useShell`, `betsLayerOf`, `recommendationMarket`, `openGap`, `closeGap`, `useGap`, `GapLayer`):

```jsx
/** Bets › Your gap: the state (useGap) for the list and the gap layer; the list stays mounted, hidden, under the layer. */
export default function YourGap({ onTrackTicket, onDirty, onSaved }) {
  const app = useAppData(), shell = useShell(), route = shell.state.views.bets;
  // BETS-NEXT-01: All / Spreads / Totals is a Bets view preference: it survives a review and a return within Bets.
  const market = recommendationMarket(route.recommendedMarket);
  const gap = useGap({ accountId: app.accountId, market, onDirty, onSaved, onSignInAgain: app.requestSignIn, onTrackTicket, confirm: () => shell.confirmLeave() });
  const open = betsLayerOf(route);
  const layer = open ? <GapLayer gap={gap} item={open.item} onClose={() => closeGap(shell)}/> : null;
  return <KeptParent layer={layer}><GapList gap={gap} market={market} messages={!open} onMarket={value => shell.setView('bets', { recommendedMarket: value })} onOpen={item => openGap(shell, item)}/></KeptParent>;
}
```

Append to `web/src/next/bets/gap/gap.css`:

```css
.gx .gx-gap-compare { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gx-space-3); margin: 0; }
.gx .gx-gap-compare dd { margin: 0; }
.gx .gx-gap-sides { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gx-space-2); margin: 0; padding: 0; list-style: none; }
.gx .gx-gap-side { display: flex; flex-direction: column; gap: var(--gx-space-1); min-width: 0; padding: var(--gx-space-3); border-radius: var(--gx-radius-md); background: var(--gx-surface-3); overflow-wrap: anywhere; }
.gx .gx-gap-side-word { display: flex; align-items: center; gap: var(--gx-space-1); font-weight: 600; }
.gx .gx-gap-side[data-value-color="green"] .gx-gap-side-word { color: var(--gx-win); }
.gx .gx-gap-side[data-value-color="red"] .gx-gap-side-word { color: var(--gx-loss); }
.gx .gx-gap-side[data-value-color="yellow"] .gx-gap-side-word { color: var(--gx-pending); }
/* The two actions wrap under each other rather than clip (step 3's lesson: a wide font at 320 px). */
.gx .gx-gap-actions { display: flex; flex-wrap: wrap; gap: var(--gx-space-2); }
.gx .gx-gap-actions > .gx-btn { flex: 1 1 auto; }
@media (forced-colors: active) { .gx .gx-gap-side { border: 1px solid CanvasText; } }
```

- [ ] **Step 6: Bets draws Your gap.** In `web/src/next/bets/Bets.jsx`: replace the `VirtualUnits` lazy import with
`const YourGap = lazy(() => import('./gap/YourGap.jsx'));`; before the four-section frame add
`if (section === 'gap') return <><Deferred resetKey={`${app.accountId}:gap`} label="your gap"><YourGap key={app.accountId} onDirty={dirty} onSaved={saved} onTrackTicket={trackRecommendation}/></Deferred>{review}</>;`;
delete the frame's Your gap branch, `recommendedMarket`, `chooseRecommendedMarket`, `marketControl`,
`RECOMMENDED_MARKETS`, the `Segmented` and `recommendationMarket` imports, and `gap` from `TOPIC`. Update the header
comment ("Your gap #bets/recommended (its own screen, gap/YourGap.jsx; one gap as a layer)").

- [ ] **Step 7: Run them and see them pass, with every Bets unit test.**

Run: `npx vitest run tests/next-bets-gap-ui.test.jsx tests/next-refresh-busy.test.jsx tests/next-bets-sections.test.jsx tests/next-bets-landing-ui.test.jsx tests/recommended-bets-ui.test.jsx tests/virtual-units-quote-ui.test.jsx && node --test tests/next-app-view.test.mjs tests/next-bets-gap.test.mjs tests/next-tokens.test.mjs tests/recommended-bets.test.mjs`
Expected: PASS (`recommended-bets-ui` and `virtual-units-quote-ui` still test the old app's `VirtualUnits.jsx`, which
is unchanged).

- [ ] **Step 8: Commit.**

```bash
git add web/src/next/bets/gap/GapLayer.jsx web/src/next/bets/gap/GapReview.jsx web/src/next/bets/gap/GapTrends.jsx web/src/next/bets/gap/YourGap.jsx web/src/next/bets/gap/gap.css web/src/next/bets/Bets.jsx tests/next-bets-gap-ui.test.jsx tests/next-refresh-busy.test.jsx tests/next-app-view.test.mjs
git diff --cached --stat && git ls-files --eol web/src/next/bets/gap/*.jsx web/src/next/bets/Bets.jsx
git commit -m "One gap as a layer with its review; the new app stops importing VirtualUnits.jsx" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8 · Browser checks

### Task 8: The new Bets spec, every touched spec updated, the phone and fixed-bar sweeps

Every browser spec that read the old landing rows, the view switches, the old titles or `VirtualUnits.jsx`'s markup
moves to the tiles, sections, rows and layer; none is deleted.

**Files:**
- Create: `tests/cloud-browser/next-bets-layers.spec.js`
- Modify: `tests/cloud-browser/next-bets-live.spec.js`, `next-bets-everyone.spec.js`, `recommended-bets.spec.js`,
  `research-assessments.spec.js`, `next-phone-layout.spec.js`, `next-scroll-navigation.spec.js`; and
  `web/src/next/ui/skeleton.css`, `web/src/next/bets/gap/gap.css`, `web/src/next/bets/everyone.css` (only if a
  measured height differs)

- [ ] **Step 1: Write the new spec.** Create `tests/cloud-browser/next-bets-layers.spec.js`:

```js
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { assertNoLeak, lineSecrets } from '../helpers/leak-scan.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';

// D-69 step 4 (Bets) on the real app and handler with every migration on local PGlite. Checked: the landing's first card
// and five tiles, and that it makes no Bets, lines or research read; the track card; the loading card and rows against the
// real ones at 390 px; each section's own address (a tap focuses its heading, a reload never moves focus, Back returns
// to its tile); one gap as a layer (a row, its heading, the lip, Back, Forward, a reload, a shared link); layers never
// crossing tabs; a tracked win's small moment (once, on its own ticket, never on launch or a failed read; a loss quiet);
// a confirmed placement's moment (never on a lost reply); the entrance (after a tap, never on a load; nothing moves on the
// first paint); faces first on Everyone and no closed line on any Bets screen; the phone rules at 320 and 390 px in both
// themes with the wide fallback font. Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const WIDE_FONT = '.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// The recommended-bets fixture's guesses against -3.5 and 44.5: seven gaps, the top three spreads.
const SPREAD = [-10, -7, -5, -3], TOTAL = [55, 49, 43, 44.5];
const landing = page => page.locator('[data-landing="bets"]');
const hero = page => page.locator('[data-bets="hero"]');
const tile = (page, key) => page.locator(`#gx-b-tile-${key}`);
const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });
const back = page => page.getByRole('button', { name: 'Back', exact: true });
const gapRow = (page, item) => page.locator(`[data-gap-row="${item}"]`);
const gapLayer = page => page.locator('[data-bets-layer="gap"]');
const running = page => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.animationName ?? 'transition'));
async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}
function gtlCalls(page) {
  const calls = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.origin === SUPABASE && url.pathname.startsWith('/functions/v1/gtl-api/')) calls.push(`${request.method()} ${url.pathname.replace('/functions/v1/gtl-api', '')}`); });
  return calls;
}
async function world4(page, baseURL, { guesses = true } = {}) {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, virtualUnits: true, games: 4 });
  await storeBookLines(world, { spread: Object.fromEntries(world.state.games.map(g => [g.id, -3.5])), total: Object.fromEntries(world.state.games.map(g => [g.id, 44.5])) });
  if (guesses) {
    await sendBallot(world, 'luke', 'guess_spread', Object.fromEntries(world.state.games.map((g, i) => [g.id, SPREAD[i]])));
    await sendBallot(world, 'luke', 'guess_total', Object.fromEntries(world.state.games.map((g, i) => [g.id, TOTAL[i]])));
  }
  return world;
}
async function openAt(page, address = '#bets') {
  await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank */ } });
  await page.goto(`/${address}`);
  await signIn(page, 'luke', { navigate: false });
}
/** A fresh document at `address` with no history entry behind it: what a shared link opens. */
async function shared(page, address) { await page.goto('about:blank'); await page.goto(`/${address}`); }
/** One tracked ticket for `account` (next-bets-live's seeding, through the real social routes). */
async function seedTicket(world, label, account = 'luke') {
  const { season, week } = world.state.league, gameId = world.state.games[0].id;
  const read = await world.api(account, 'social/read', { season, week });
  const reply = await world.api(account, 'social/create', { season, week, weekRevision: read.body.weekRevision, requestId: randomUUID(), kind: 'single',
    legs: [{ gameId, market: 'prop', side: 'Fixture Runner', line: 30, selection: 'Fixture Runner 30+ receiving yards' }], stakeUnits: 1, odds: 100, source: 'Book A', notes: label });
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  return reply.body.entries.find(e => e.notes === label);
}
async function settleTicket(world, id, outcome, account = 'luke') {
  const { season, week } = world.state.league;
  const read = await world.api(account, 'social/read', { season, week }), entry = read.body.entries.find(e => e.id === id);
  const reply = await world.api(account, 'social/settle', { season, week, weekRevision: read.body.weekRevision, requestId: randomUUID(), entryId: id, revision: entry.revision, outcome, actualReturnUnits: null, reason: 'Local fixture reported result' });
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
}
async function loseReplyAfterCommit(page, world, action) {
  await page.route(url => url.origin === SUPABASE && url.pathname === `/functions/v1/gtl-api/${action}`, async route => {
    const req = route.request();
    const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
    expect(response.status, `${action} committed in the fixture`).toBe(200);
    await response.text();
    await route.abort('failed');
  }, { times: 1 });
}
/** The server's clock in /personal moved past the week's last kickoff (the landing's track card), nothing else changed. */
async function afterLastKickoff(page) {
  await page.route(`${SUPABASE}/functions/v1/gtl-api/personal`, async route => {
    const response = await route.fetch(); const text = await response.text();
    if (!text) return route.fulfill({ response });
    const body = JSON.parse(text), last = Math.max(...(body.games ?? []).map(g => Date.parse(g.kickoff)).filter(Number.isFinite));
    await route.fulfill({ response, json: Number.isFinite(last) ? { ...body, now: new Date(last + 3_600_000).toISOString() } : body });
  });
}
/** Spec 3's phone rules for the page: no sideways scroll, layoutProblems, 44 px targets, no text under 12 px, axe. */
async function phoneProblems(page) {
  const problems = [];
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) problems.push('sideways scroll');
  problems.push(...(await page.evaluate(layoutProblems)));
  problems.push(...(await page.locator('.gx').first().evaluate(scope => {
    const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [hidden], .gx-sr-only');
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44).map(r => `small target ${r.name} ${r.w}x${r.h}`);
    const small = [...scope.querySelectorAll('*')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12)
      .map(el => `small text ${el.textContent.trim().slice(0, 40)}`);
    return [...targets, ...small];
  })));
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  problems.push(...axe.violations.map(v => `axe ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`));
  return problems;
}

test('the landing: the next move, five tiles, no Bets, line or research read; Back from each section returns to its tile', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    const calls = gtlCalls(page);
    await openAt(page);
    await expect(hero(page)).toHaveAttribute('data-kind', 'place', { timeout: 30000 });
    const n = world.state.games.length;
    await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText('Place your picks');
    await expect(hero(page).locator('[data-bets="hero-line"]')).toHaveText(new RegExp(`^\\d+ of ${n} games still open$`));
    await expect(hero(page).locator('.gx-meter3-seg')).toHaveCount(n);
    await expect(page.locator('.gx-btn--primary')).toHaveCount(1);
    await expect(page.locator('[data-bets="tiles"] > li')).toHaveCount(5);
    for (const [key, name] of [['mybets', /^My bets, /], ['picks', /^Your picks, \d+ games? open to bet$/], ['everyone', /^Everyone, /], ['recommended', 'Recommended, research assessments'], ['gap', 'Your gap, 8 locked guesses against the lines']]) await expect(tile(page, key)).toHaveAccessibleName(name);
    await page.waitForLoadState('networkidle');
    expect(calls.filter(call => /\/(bets\/|lines\/|research)/.test(call)), 'the landing reads only the shared reads').toEqual([]);
    expect(await running(page), 'nothing moves on the first paint').toEqual([]);
    for (const [key, heading, address] of [['mybets', 'My bets', /#bets\/active/], ['picks', 'Your picks', /#bets\/virtual/], ['everyone', 'Everyone', /#bets\/everyone/], ['recommended', 'Recommended', /#bets\/research/], ['gap', 'Your gap', /#bets\/recommended/]]) {
      await tile(page, key).click();
      await expect(page).toHaveURL(address);
      await expect(page.getByRole('heading', { name: heading, level: 1, exact: true })).toBeVisible();
      await back(page).click();
      await expect(landing(page)).toBeVisible();
      await expect(tile(page, key), 'Back returns focus to the tile by its id').toBeFocused();
    }
    await hero(page).getByRole('button').click();
    await expect(page).toHaveURL(/#bets\/virtual/);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('with every game kicked off the next move is Track a bet: your last settled tickets as its meter; Add a bet opens the editor', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL, { guesses: false });
  try {
    const won = await seedTicket(world, 'won'), lost = await seedTicket(world, 'lost');
    await settleTicket(world, won.id, 'win'); await settleTicket(world, lost.id, 'loss');
    await afterLastKickoff(page);
    await openAt(page);
    await expect(hero(page)).toHaveAttribute('data-kind', 'track', { timeout: 30000 });
    await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText('Track a bet');
    await expect(hero(page).locator('[data-bets="hero-line"]')).toHaveText('1 of your last 2 settled tickets won');
    await expect(hero(page).locator('.gx-meter3-seg--on')).toHaveCount(1);
    await expect(tile(page, 'picks')).toHaveAccessibleName(/^Your picks, week \d+ closed$/);
    await hero(page).getByRole('button', { name: 'Add a bet', exact: true }).click();
    await expect(page).toHaveURL(/#bets\/add/);
    await expect(page.getByRole('dialog', { name: 'Add a tracked bet' })).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('loading in the final shape: the landing’s card and tiles, Your gap’s rows and Everyone’s rows at 390 px', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    const { season, week } = world.state.league, [g0] = world.state.games, now = new Date().toISOString();
    await world.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [ACCOUNTS.troy.id, season, week]);
    await world.db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,$2,$3,$4,$5,$6)',
      [ACCOUNTS.troy.id, season, week, g0.id, 'spread', { gameId: g0.id, market: 'spread', side: 'home', line: -3.5, odds: -110, units: 1, source: 'BetMGM', quotedAt: now, selectedAt: now }]);
    await openAt(page);
    await expect(hero(page)).toBeVisible({ timeout: 30000 });
    await settle(page);
    const card = await hero(page).evaluate(el => el.getBoundingClientRect().height);
    const hold = async (path, address, skeleton, real) => {
      let release; const held = new Promise(resolve => { release = resolve; });
      await page.route(`${SUPABASE}/functions/v1/gtl-api/${path}`, async route => { await held; await route.fallback(); });
      await (address ? shared(page, address) : page.reload());
      await expect(page.locator(skeleton).first()).toBeVisible();
      const drawn = await page.locator(skeleton).first().evaluate(el => el.getBoundingClientRect().height);
      release(); await page.unroute(`${SUPABASE}/functions/v1/gtl-api/${path}`);
      if (real) await expect(page.locator(real).first()).toBeVisible({ timeout: 30000 });
      return drawn;
    };
    const drawn = await hold('personal', null, '[data-skeleton="landing"] .gx-skel-hero', null);
    test.info().annotations.push({ type: 'heights', description: `landing skeleton ${drawn}px, card ${card}px` });
    // Step 2's rule: fallback fonts differ by platform; no jump larger than one title line, never taller than the card.
    expect(Math.abs(drawn - card), `the skeleton card is ${drawn}px, the card ${card}px`).toBeLessThanOrEqual(64);
    expect(drawn, 'the skeleton is never taller than the card').toBeLessThanOrEqual(card + 8);
    for (const [path, address, skeleton, real] of [['bets/recommendations', '#bets/recommended', '.gx-gap-skel .gx-skel-row', '[data-gap-row]'], ['bets/read', '#bets/everyone', '.gx-ev-skel .gx-skel-row', '.gx-prow[data-person]']]) {
      await shared(page, address);
      await expect(page.locator(real).first()).toBeVisible({ timeout: 30000 });
      const height = await page.locator(real).first().evaluate(el => el.getBoundingClientRect().height);
      const skel = await hold(path, address, skeleton, real);
      test.info().annotations.push({ type: 'heights', description: `${address} skeleton row ${skel}px, row ${height}px` });
      expect(Math.abs(skel - height), `${address}: the skeleton row is ${skel}px, a row ${height}px`).toBeLessThanOrEqual(8);
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('each section has its own address: a tap focuses its heading, a reload never moves focus, unknown layers draw the section', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await openAt(page);
    await expect(landing(page)).toBeVisible({ timeout: 30000 });
    for (const [key, heading] of [['mybets', 'My bets'], ['picks', 'Your picks'], ['everyone', 'Everyone'], ['recommended', 'Recommended'], ['gap', 'Your gap']]) {
      await shared(page, '#bets');
      await tile(page, key).click();
      const h1 = page.getByRole('heading', { name: heading, level: 1, exact: true });
      await expect(h1, `${heading}: focus lands on the heading`).toBeFocused();
      await page.reload();
      await expect(h1).toBeVisible();
      await expect(h1, 'a load never moves focus').not.toBeFocused();
    }
    for (const fragment of ['#bets/virtual?layer=gap&item=SEA-DEN%3Atotal', '#bets/recommended?layer=nope&item=x', '#bets/active?layer=who']) {
      await shared(page, fragment);
      await expect(page.locator('[data-bets-section]')).toBeVisible({ timeout: 30000 });
      await expect(gapLayer(page)).toHaveCount(0);
      expect(new URL(page.url()).hash, fragment).not.toMatch(/layer=|item=/);
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('one gap is a layer: a row, its heading focused, the lip, Back and Forward, a reload; a shared link closes to Your gap', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await openAt(page, '#bets/recommended');
    const first = page.locator('[data-gap-row]').first();
    await expect(first).toBeVisible({ timeout: 30000 });
    const item = await first.getAttribute('data-gap-row'), address = `#bets/recommended?layer=gap&item=${encodeURIComponent(item)}`;
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${address.replace(/[?]/g, '\\?')}$`));
    const title = gapLayer(page).getByRole('heading', { level: 2 });
    await expect(title).toBeFocused();
    await expect(gapLayer(page).getByRole('button', { name: 'Back to Your gap', exact: true })).toBeVisible();
    await expect(page.locator('[data-gap-row]').first(), 'the list stays mounted, hidden, under the layer').toBeHidden();
    await page.reload();
    await expect(title).toBeVisible({ timeout: 30000 });
    await expect(title, 'a load never moves focus').not.toBeFocused();
    await page.goBack(); await expect(gapRow(page, item)).toBeVisible();
    await page.goForward(); await expect(title).toBeVisible();
    await gapLayer(page).getByRole('button', { name: 'Back to Your gap', exact: true }).click();
    await expect(gapRow(page, item)).toBeVisible();
    await gapRow(page, item).click();
    await back(page).click();
    await expect(page.locator(`#gx-b-gap-${item.replace(':', '-')}`), 'Back returns focus to the row by its id').toBeFocused();
    await shared(page, address);
    await expect(title).toBeVisible({ timeout: 30000 });
    await back(page).click();
    await expect(gapRow(page, item), 'Back on a shared link closes one layer, to Your gap').toBeVisible();
    await back(page).click();
    await expect(landing(page)).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('layers never cross tabs: a gap left open never rides into Home, the Bets tab or a fresh Your gap tile', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await openAt(page, '#bets/recommended');
    await page.locator('[data-gap-row]').first().click();
    await expect(gapLayer(page)).toBeVisible();
    await tab(page, 'Home').click();
    await expect(page).toHaveURL(/#home$/);
    await tab(page, 'Bets').click();
    await expect(landing(page)).toBeVisible();
    await tile(page, 'gap').click();
    await expect(page.locator('[data-bets-section="gap"]')).toBeVisible();
    const hash = new URL(page.url()).hash;
    expect(hash).toMatch(/^#bets\/recommended/);
    expect(hash, 'a fresh Your gap tile carries no layer').not.toMatch(/layer=|item=/);
    await expect(gapLayer(page)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a tracked win pops once on its own ticket, never on launch or a failed read; a loss stays quiet', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL, { guesses: false });
  try {
    const win = await seedTicket(world, 'to-win'), lose = await seedTicket(world, 'to-lose'), later = await seedTicket(world, 'later');
    await openAt(page, '#bets'); // this device's first ticket read: seeded, nothing waits
    await expect(tile(page, 'mybets')).toHaveAccessibleName('My bets, 3 active tickets', { timeout: 30000 });
    await settleTicket(world, win.id, 'win'); await settleTicket(world, lose.id, 'loss');
    await shared(page, '#bets/active'); // a launch: the rows show and nothing pops
    await expect(page.locator(`[data-ticket="${win.id}"]`)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(0);
    await back(page).click(); // the landing: the win waits as NEW on My bets
    await expect(tile(page, 'mybets')).toHaveAccessibleName(/, new$/);
    await tile(page, 'mybets').click();
    const won = page.locator(`[data-ticket="${win.id}"] .gx-tracked-preview .gx-pill`);
    await expect(won).toHaveAttribute('data-moment', 'pop');
    await expect(page.locator(`[data-ticket="${lose.id}"] [data-moment]`), 'a loss stays quiet').toHaveCount(0);
    await back(page).click();
    await expect(tile(page, 'mybets')).not.toHaveAccessibleName(/, new$/);
    await tile(page, 'mybets').click();
    await expect(page.locator(`[data-ticket="${win.id}"]`)).toBeVisible();
    await expect(won, 'it never plays again').not.toHaveAttribute('data-moment', 'pop');
    // A failed ticket read reports nothing: the next win waits for a read that succeeds.
    await settleTicket(world, later.id, 'win');
    const summary = JSON.stringify({ allHistory: true, filters: { playerId: ACCOUNTS.luke.id, origin: 'tracked' } });
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/social/read'), route => (route.request().postData() === summary ? route.abort('failed') : route.fallback()));
    await shared(page, '#bets');
    await expect(tile(page, 'mybets')).toHaveAccessibleName(/could not load/, { timeout: 30000 });
    await tile(page, 'mybets').click();
    await expect(page.locator(`[data-ticket="${later.id}"]`)).toBeVisible({ timeout: 30000 });
    await expect(page.locator(`[data-ticket="${later.id}"] [data-moment]`)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Your picks: the cards rise in after a tap, never on a load; a confirmed placement pops its tag once; a lost reply pops nothing', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await openAt(page);
    await tile(page, 'picks').click();
    const place = page.locator('[data-bets="place"]'), [g0] = world.state.games;
    await expect(place).toBeVisible({ timeout: 30000 });
    expect(await place.locator('.gx-place-games').getAttribute('data-enter')).toBe('in');
    await place.locator(`[data-game="${g0.id}"] [data-market="spread"] .gx-chip`).nth(1).click();
    await page.getByRole('button', { name: 'Review slip', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Your slip' });
    await loseReplyAfterCommit(page, world, 'bets/place');
    await sheet.getByRole('button', { name: /^Place 1 bet/ }).click();
    await expect(sheet.getByRole('alert')).toContainText('could not confirm');
    await expect(place.locator('[data-moment="pop"]'), 'a lost reply pops nothing').toHaveCount(0);
    await sheet.getByRole('button', { name: 'Retry the same save', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    const tag = place.locator(`[data-game="${g0.id}"] [data-market="spread"] .gx-tag`);
    await expect(tag).toHaveAttribute('data-moment', 'pop');
    await expect(place.locator('[data-moment="pop"]')).toHaveCount(1);
    await page.reload();
    await expect(tag).toBeVisible({ timeout: 30000 });
    await expect(tag).not.toHaveAttribute('data-moment', 'pop');
    expect(await place.locator('.gx-place-games').getAttribute('data-enter'), 'a load draws no entrance').toBeNull();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Everyone leads every row with a face, and no friend’s line or closed market’s line reaches any Bets screen', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, troyBallots: false });
  try {
    const { season, week } = world.state.league, [g0, g1] = world.state.games, now = new Date().toISOString();
    // Unusual half-point lines, so nothing else on a page can equal them (tests/helpers/leak-scan.mjs).
    const lines = { spread: { [g0.id]: -2.5, [g1.id]: 6.5 }, total: { [g0.id]: 47.5, [g1.id]: 41.5 } };
    await storeBookLines(world, lines);
    await sendBallot(world, 'luke', 'guess_spread', { [g0.id]: -3, [g1.id]: 7 }); // Spread opens for Luke; Total stays closed
    await world.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [ACCOUNTS.troy.id, season, week]);
    await world.db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,$2,$3,$4,$5,$6)',
      [ACCOUNTS.troy.id, season, week, g0.id, 'total', { gameId: g0.id, market: 'total', side: 'over', line: 47.5, odds: -110, units: 1.5, source: 'BetMGM', quotedAt: now, selectedAt: now }]);
    await openAt(page, '#bets/everyone');
    const rows = page.locator('.gx-prow[data-pick], .gx-prow[data-person]');
    await expect(rows.first()).toBeVisible({ timeout: 30000 });
    expect(await rows.evaluateAll(list => list.every(row => row.firstElementChild?.classList.contains('gx-prow-pic') && !!row.firstElementChild.querySelector('.gx-av')))).toBe(true);
    const secrets = lineSecrets(lines.total, { market: 'total' });
    for (const address of ['#bets', '#bets/everyone', '#bets/virtual', '#bets/recommended']) {
      await shared(page, address); await page.waitForLoadState('networkidle');
      const { text, attributes } = await page.evaluate(() => ({ text: document.body.innerText,
        attributes: [...document.body.querySelectorAll('*')].flatMap(el => [...el.attributes].filter(a => (el.closest('svg') ? a.name === 'aria-label' : a.name !== 'style' && a.name !== 'class')).map(a => `${a.name}=${a.value}`)) }));
      assertNoLeak({ text, attributes }, { viewer: ACCOUNTS.luke.id, secrets }, address);
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('phone rules on every Bets address: 320 and 390 px, Dark and Light, the wide fallback font, 44 px targets, 12 px text, axe', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await seedTicket(world, 'open');
    await openAt(page, '#bets/recommended');
    const first = page.locator('[data-gap-row]').first();
    await expect(first).toBeVisible({ timeout: 30000 });
    const item = await first.getAttribute('data-gap-row');
    const found = {};
    for (const { theme, width, wide = false } of [{ theme: 'dark', width: 390 }, { theme: 'light', width: 390 }, { theme: 'dark', width: 320 }, { theme: 'light', width: 320, wide: true }]) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.setViewportSize({ width, height: 844 });
      for (const address of ['#bets', '#bets/active', '#bets/settled', '#bets/add', '#bets/virtual', '#bets/everyone', '#bets/research', '#bets/recommended', `#bets/recommended?layer=gap&item=${encodeURIComponent(item)}`]) {
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

- [ ] **Step 2: Run it.** (Tasks 1–7 are committed, so a failure here is a real defect.)

Run: `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/next-bets-layers.spec.js --reporter=line`
Expected: 10 passed, skipped 0. If a skeleton height is off: set `.gx-skel-hero--meter`'s `min-height` in
`ui/skeleton.css` only if the 64 px / +8 rule fails (step 3 measured 218 px for the same card shape), and the
`.gx-gap-skel .gx-skel-row` (`gap.css`) or `.gx-ev-skel .gx-skel-row` (`everyone.css`) `min-height` to the measured
row height; run again and note the numbers for the register.

- [ ] **Step 3: Update `tests/cloud-browser/next-bets-live.spec.js` (keep every test).** Add helpers
`const tile = (page, key) => page.locator(`#gx-b-tile-${key}`);` and delete `view`. Then:

| Test | Contract kept, and how |
|---|---|
| `openBets` (shared) | `#bets/tracked`, heading "My bets" level 1, Add bet enabled: unchanged |
| tracked Overview shows owner charts… | Every "Bets tab → the landing's Overview row" becomes Bets tab → `tile(page, 'mybets')` → the tracker's "Tracked bets section" Overview button; all-weeks scope (`Competition week` `all`), charts, cash, filters and the remembered filter after Home → Bets → My bets unchanged |
| Bets roots open creation from fresh all-week lists… | "Active tickets" via `tile(page, 'mybets')`; "Settled tickets" via `page.goto('/#bets/settled')`; each opens Add bet with the current week, as before. "Add a bet" on the landing becomes My bets' own Add bet; the remembered scope is My bets' (choose `all`, Bets tab, the My bets tile: still `all`); nothing saved |
| Community tracked bets work without private membership… | `view(page, 'Virtual Units')` → Bets tab → `tile(page, 'picks')`; `view(page, 'Tracked bets')` → `page.goBack()` twice (back to `#bets/tracked`); everything else unchanged |
| Your picks places two bets… | `view(page, 'Virtual Units')` → Bets tab → `tile(page, 'picks')`; the final heading "Virtual Units" → "Your picks" (level 1); after the lost reply and retry, also `await expect(place.locator(`[data-game="${g0.id}"] [data-market="spread"] .gx-tag`)).toHaveAttribute('data-moment', 'pop')` |
| every other test | Unchanged (they open `#bets/tracked` and use the tracker's own controls) |

- [ ] **Step 4: Update `tests/cloud-browser/recommended-bets.spec.js` (keep every test).** Replace the helpers:

```js
const tile = (page, key) => page.locator(`#gx-b-tile-${key}`);
const yourGap = page => page.getByRole('heading', { name: 'Your gap', level: 1, exact: true });
const myBets = page => page.getByRole('heading', { name: 'My bets', level: 1, exact: true });
// D-69 step 4: the ranked gaps are picture rows; one gap opens as a layer (they were <details> cards).
const cards = page => page.locator('[data-gap-row]:visible');
const layer = page => page.locator('[data-bets-layer="gap"]');
const cardMarkets = page => cards(page).evaluateAll(list => list.map(card => card.dataset.market));
const percents = page => cards(page).locator('.gx-prow-value').allTextContents();
const region = page => page.getByRole('region', { name: 'Gaps this week', exact: true });
const lip = page => layer(page).getByRole('button', { name: 'Back to Your gap', exact: true });
async function openTotal(page, gameId) {
  const row = page.locator(`[data-gap-row="${gameId}:total"]`);
  if (await row.count() === 0) await page.getByRole('button', { name: /Show all/i }).click();
  await row.click();
  await expect(layer(page)).toBeVisible();
  return layer(page);
}
async function goToSection(page, key) {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: /^Bets(,|$)/ }).click();
  await tile(page, key).click();
}
async function viewSavedTicket(page) {
  await savedToast(page).getByRole('button', { name: 'View', exact: true }).click();
  await expect(myBets(page)).toBeVisible();
}
```

`openRecommended` clicks `tile(page, 'gap')` (not "Your guess vs. market"), then expects
`page.locator('[data-bets-section="gap"]')` visible and "Refresh lines" enabled. `moveBrowserPastKickoff(page, game)`
becomes, with `await page.clock.install();` at the start of the two tests that use it (before `openRecommended`):

```js
async function moveBrowserPastKickoff(page, game) {
  // D-69 step 4: Your gap's clock is the server's, ticking from when its read landed (useServerNow); Playwright's clock
  // moves Date and performance.now in the page only. No API read or write may follow.
  await page.clock.fastForward(Math.max(0, Date.parse(game.kickoff) - await page.evaluate(() => Date.now())) + 1000);
}
```

Then, in every test: `view(page, 'Your guess vs. market')` pressed checks → `await expect(yourGap(page)).toBeVisible()`
(or the layer's heading while a layer is open); `view(page, 'Tracked bets').click()` → `await goToSection(page, 'mybets')`;
`view(page, 'Your guess vs. market').click()` → `await goToSection(page, 'gap')`; `card.locator('summary')` text → the
row's text; `card.locator('summary').click()` → the row's click (the layer opens); `.virtual-units` → the visible section
or layer (`page.locator('[data-bets-section="gap"]:visible, [data-bets-layer="gap"]')`); `.auth-notice` →
`page.locator('[data-gap="notice"]:visible')`; `.recommended-bets` (the reach check) →
`page.locator('[data-gap="list"]')`; `'Over +44.5 (−110) · 2U'` → `'Over 44.5 · −110 · 2U'`; `'Over 44.5 (−110) · 1U'`
→ `'Over 44.5 · −110 · 1U'`; the `'2U'` unit button → `'2 units'`; `'185.7% gap'`-style percents → `'185.7%'`. These
tests need more than the mapping; change each as written and keep its contract:

| Test | Contract kept, and how |
|---|---|
| a reviewed recommendation becomes one actual tracked ticket… | Track this bet from the gap layer opens "Review recommended bet"; after saving, the layer is still open (`await expect(layer(page)).toBeVisible()`, in place of `card` `open`); the saved ticket is in My bets after reload |
| two recommended bets save in a row without leaving Recommended | Each total opens its layer, tracks and saves; after each save the layer is still open and the scroll unchanged; then the lip back to the list, where Totals is still pressed |
| cancelling a recommendation review… | Unchanged through the layer; "Tracked bets" → `goToSection(page, 'mybets')` |
| recommendation ticket recovery keeps its original week… | Unchanged through the layer |
| saved guesses rank the top three… | The three rows, their percents and point gaps on the row; the traffic lights in the first row's layer (`layer(page).locator('[data-side="home"][data-value-color="green"]')`); the lip back; Show all → 7 rows; the last row's layer has two yellow sides, "Small gap", and its row says "1.5 pt gap"; axe and fit on the list |
| Add to card only prepares the retained quote… | Play with Virtual Units in the total's layer; Place virtual pick sends the same body; the layer then shows "Virtual pick saved" disabled; the lip back; Refresh lines → still 7 rows (Show all stays on: it lives in Your gap's state) |
| draft guesses and locked markets never generate recommendations… | `.virtual-units` /saved\|submit\|locked/ → `region(page)` contains "No differences to show yet"; the counts and the next-week check unchanged |
| a failed recommendation read is explicit… | The alert and its Try again; the row's "10.5 pt gap" then "8.5 pt gap"; its layer contains "46.5" |
| Community recommendations use the current published week… | Unchanged through the layer; `region` names `Week ${next}` |
| a lost successful recommendation reply is confirmed… | The alert in the layer, "Check saved picks", the notice in the layer; `[data-gap="saved"]` in the layer shows `Over 44.5 · −110 · 1U · BetMGM`; after the lip, the "Your virtual card" region shows the same; no second placement |
| a pending review retains the chosen terms at kickoff… | In the layer after `moveBrowserPastKickoff`: `[data-gap="review"]` says "Closed · Kickoff reached" and `Over 44.5 · −110 · 2U · BetMGM`; no Place virtual pick; Remove from card removes the review; no write |
| a saved virtual pick stays visible when its difference disappears… | Place in the layer, then the lip; the saved card keeps the pick after the line moves and after `moveBrowserPastKickoff` ("Pending"); the row is gone |
| the week selector keeps the player’s older saved card… | Place in the layer, the lip, then the same week-select steps on the list; "View only · older week" on the list; `1 saved · Week N` |
| All, Spreads and Totals filter… | Unchanged on the list (rows, percents, markets, "N gaps", Show all 4 differences, keyboard, no read, reach above the tab bar via `[data-gap="list"]`) |
| a market without eligible recommendations says so… | Unchanged on the list ("No spread differences to show yet.", "0 gaps", View all markets returns focus to All) |
| a prepared card selection survives filter changes… | Totals → the total's layer → Play with Virtual Units → "2 units" → the lip; Spreads hides the row and `[data-gap="your-card"]` lists the selection with `Over 44.5 · −110 · 2U`; its row opens the layer whose review places; under Totals the row's layer shows "Review below" disabled and the terms; placing sends units 2 |
| the chosen market stays while tracking a bet… | Track from the layer, Cancel: the layer is still open; the lip: Totals still pressed, three totals; Bets tab → `tile(page, 'gap')`: Totals still pressed |
| D-77: your gaps vs. closing lines… | Unchanged: the hero's region, words, dots, About toggle and the market filter are the same (GapHero) |

- [ ] **Step 5: Update the other specs (keep every test).**

`tests/cloud-browser/next-bets-everyone.spec.js`:
- `openEveryone` expects the heading "Everyone" (was "Everyone’s picks");
- the banner text → `'Friends’ lines show once you lock in that game, or at kickoff.'`;
- "the landing row and the Virtual switch reach Everyone" keeps its contract (the landing reaches Everyone, and
  Everyone reaches Your picks): `#gx-b-tile-everyone` → heading "Everyone" and `#bets/everyone`; Back → the landing with
  focus on that tile; `#gx-b-tile-picks` → heading "Your picks"; Back; the Everyone tile again → "Community · Week";
  the private league part unchanged;
- rows: `row(page, who, market)` keeps `[data-pick="…"]` (now the picture row) and every text assertion.

`tests/cloud-browser/research-assessments.spec.js`: both "Research recommendations" headings → "Recommended" (the
one-line check reads the word "Recommended": `node.textContent.indexOf('Recommended')`, length 11); the last step's
"Your guess vs. market" button → `page.getByRole('button', { name: 'Back', exact: true }).click()` then
`page.locator('#gx-b-tile-gap').click()` and the heading "Your gap" (the contract: Recommended reaches Your gap through
Bets).

`tests/cloud-browser/next-phone-layout.spec.js`: add `'#bets/research'` after `'#bets/recommended'` in `ADDRESSES`.

`tests/cloud-browser/next-scroll-navigation.spec.js`: add `'#bets/research'` and
`'#bets/recommended?layer=gap&item=TB-DAL%3Atotal'` after `'#bets/everyone'` (a gap not on the list still draws its
layer's frame, which is what the fixed-bar check needs).

- [ ] **Step 6: Run every touched spec.**

Run: `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/next-bets-layers.spec.js tests/cloud-browser/next-bets-live.spec.js tests/cloud-browser/next-bets-everyone.spec.js tests/cloud-browser/recommended-bets.spec.js tests/cloud-browser/research-assessments.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js tests/cloud-browser/next-home.spec.js tests/cloud-browser/next-home-layers.spec.js tests/cloud-browser/shared-sport-interface.spec.js --reporter=line`
Expected: every test passes, skipped 0.

- [ ] **Step 7: Commit.**

```bash
git add tests/cloud-browser/next-bets-layers.spec.js tests/cloud-browser/next-bets-live.spec.js tests/cloud-browser/next-bets-everyone.spec.js tests/cloud-browser/recommended-bets.spec.js tests/cloud-browser/research-assessments.spec.js tests/cloud-browser/next-phone-layout.spec.js tests/cloud-browser/next-scroll-navigation.spec.js
git diff --cached --stat
git commit -m "Bets browser checks: the landing, sections, gap layer, moments, gates and the phone sweeps" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

If Step 2 changed a measured height, add that stylesheet to the commit and say "measured" in its message.

---

## Task 9 · Finish

### Task 9: Full suite, register, decision addendum, screenshots for Sean, PR

**Files:**
- Modify: `docs/COMPLETION_REGISTER.md`, `docs/DECISIONS.md`
- Temporary (never committed):
  `C:\Users\sbals\AppData\Local\Temp\claude\C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f\e86e4bf8-003c-4c44-b10c-b3127309473f\scratchpad\step4-shots\zz-step4-shots.spec.js`

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
grep -rn "VirtualUnits\|RecommendationTrends\|recommendedBets.css\|FocusAction\|FocusRows" web/src/next/bets web/src/next/research/Assessments.jsx
grep -rn "from '\.\./\.\./[A-Z][A-Za-z]*\.jsx'" web/src/next/bets
grep -n "VirtualUnits" web/src/App.jsx
```

Expected: the first prints nothing; the second prints only `SocialBetTracker.jsx` (its documented adapter in
`Bets.jsx`); the third prints the old app's import (it keeps the screen). The Everyone leak scans in
`next-bets-everyone.spec.js` and `next-bets-layers.spec.js` passed in Step 1 with the rows on screen.

- [ ] **Step 3: Screenshots for Sean (local fixtures only).** Write the scratchpad spec, copy it in for the run, delete
it after; never `git add` it. A 1500 px tall viewport keeps the fixed tab bar at the bottom of each full-page shot.

```js
// TEMPORARY (never committed): Bets after D-69 step 4 at 390 px, Dark and Light, on local PGlite fixtures only (fictional
// accounts; no hosted data), for Sean's review of the step 4 build decisions.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { ACCOUNTS, communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';
const OUT = process.env.SHOTS_OUT;
test.use({ viewport: { width: 390, height: 1500 } });
test.setTimeout(600000);
test.beforeEach(() => test.skip(!pgliteAvailable || !OUT, 'Local PGlite and SHOTS_OUT required.'));

test('step 4 Bets screenshots', async ({ page, baseURL }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, virtualUnits: true, games: 4 });
  try {
    const games = world.state.games, { season, week } = world.state.league, now = new Date().toISOString();
    await storeBookLines(world, { spread: Object.fromEntries(games.map(g => [g.id, -3.5])), total: Object.fromEntries(games.map(g => [g.id, 44.5])) });
    await sendBallot(world, 'luke', 'guess_spread', Object.fromEntries(games.map((g, i) => [g.id, [-10, -7, -5, -3][i]])));
    await sendBallot(world, 'luke', 'guess_total', Object.fromEntries(games.map((g, i) => [g.id, [55, 49, 43, 44.5][i]])));
    await world.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [ACCOUNTS.troy.id, season, week]);
    await world.db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,$2,$3,$4,$5,$6)',
      [ACCOUNTS.troy.id, season, week, games[0].id, 'spread', { gameId: games[0].id, market: 'spread', side: 'home', line: -3.5, odds: -110, units: 1.5, source: 'BetMGM', quotedAt: now, selectedAt: now }]);
    const read = await world.api('luke', 'social/read', { season, week });
    await world.api('luke', 'social/create', { season, week, weekRevision: read.body.weekRevision, requestId: randomUUID(), kind: 'single', legs: [{ gameId: games[0].id, market: 'spread', side: 'home', line: -3.5 }], stakeUnits: 1, odds: -110, source: 'DraftKings', notes: 'shot' });
    await page.addInitScript(() => { localStorage.setItem('gtl.app', 'next'); localStorage.setItem('gtl.motion', 'reduce'); });
    await page.goto('/#bets');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="bets"]')).toBeVisible();
    await page.goto('/#bets/recommended');
    const item = await page.locator('[data-gap-row]').first().getAttribute('data-gap-row');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      for (const [name, address] of [['landing', '#bets'], ['mybets', '#bets/active'], ['picks', '#bets/virtual'], ['everyone', '#bets/everyone'],
        ['recommended', '#bets/research'], ['gap', '#bets/recommended'], ['gap-layer', `#bets/recommended?layer=gap&item=${encodeURIComponent(item)}`]]) {
        await page.goto('about:blank');
        await page.goto(`/${address}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT, `390-${theme}-${name}.png`), fullPage: true });
      }
    }
  } finally { await world.db.close(); }
});
```

```bash
SHOTS="C:/Users/sbals/AppData/Local/Temp/claude/C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f/e86e4bf8-003c-4c44-b10c-b3127309473f/scratchpad/step4-shots"
cp "$SHOTS/zz-step4-shots.spec.js" tests/cloud-browser/zz-step4-shots.spec.js
SHOTS_OUT="$SHOTS" npx playwright test --config playwright.cloud.config.js tests/cloud-browser/zz-step4-shots.spec.js --reporter=line
rm tests/cloud-browser/zz-step4-shots.spec.js
git status --short tests/cloud-browser
ls "$SHOTS"
```

Expected: 1 passed; `git status` shows nothing under `tests/cloud-browser`; fourteen PNGs in
`C:\Users\sbals\AppData\Local\Temp\claude\C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f\e86e4bf8-003c-4c44-b10c-b3127309473f\scratchpad\step4-shots\`
(`390-dark-landing.png` … `390-light-gap-layer.png`). Look at each before handing them over.

- [ ] **Step 4: The register entry.** Insert at the top of `docs/COMPLETION_REGISTER.md`, under the title, filling every
`<…>` from Steps 1–3 (evidence exists only at build time):

```markdown
## D-69 design overhaul, step 4: Bets — <Month D, YYYY>

Built on `claude/overhaul-step4-bets` from the
[step 4 plan](superpowers/plans/2026-11-04-design-overhaul-step4-bets.md), verified at `<full commit SHA>`,
[PR #<n>](https://github.com/seanbalz/guess-the-line/pull/<n>). Not merged or released. Bets' landing is the next-move
card ("Place your picks", the games still open as its meter, read from the shared `GET /personal`; "Track a bet" once
every game has kicked off) and five kit tiles (My bets, Your picks, Everyone, Recommended, Your gap). Each section is a
screen with its own address and a one-word title; the old view switches are gone. My bets keeps its November 1 Roomy
cards; a tracked win pops its own ticket's Won pill once (the ticket summary read; never on launch; a loss quiet). Your
picks rises in and pops a placed bet's tag after the fresh read confirms it. Everyone and Recommended are picture rows.
Your gap (the old `VirtualUnits.jsx` Recommended view) is rebuilt in `web/src/next/bets/gap/` with D-77's hero first and
one gap as a layer (`#bets/recommended?layer=gap&item=<GAME>:<market>`); the old app keeps `VirtualUnits.jsx`. Measured at
390: landing card <N> px (skeleton <N>), gap row <N> px, Everyone row <N> px. Every choice is a build decision for Sean's
review (D-69 addendum, step 4).
Evidence (local, at that commit): `node --test` <N> tests, <N> pass, 1 fails (`tests/research-intake.test.mjs`, the
Windows file-mode check on untouched code), skipped 0; Vitest <F> files, <T> tests pass; typecheck and build pass; the
full browser run <P> passed, skipped 0. Screenshots for Sean: 390 px Dark and Light.
Not yet: Sean's review of the step 4 decisions, the nine CI checks, the release and his iPhone check (spec section 10).
```

- [ ] **Step 5: The decision addendum.** In `docs/DECISIONS.md`, after D-69's step 3 build decisions, add:

```markdown
*Build decisions for Sean's review (step 4 Bets, <Month D>).* Sean has not approved these. His step 4 questions were not
asked before the build, so it took the spec's defaults; each is reversible:
- **Names:** the tiles are My bets, Your picks, Everyone, Recommended (Research recommendations, `#bets/research`) and
  Your gap (Your guess vs. market, `#bets/recommended`, D-77's hero first). The addresses keep their names.
- **Sections are screens** with a one-word title, their ⓘ and Back, as Play's and Research's are; nesting cards frame
  one gap and one assessment. The Roomy cards stay full width.
- **Landing:** "Place your picks" while any game is open (the games still open as the meter), else "Track a bet" (your
  last five settled tickets as the meter); it reads the shared `GET /personal`, no Bets read.
- **Tiles:** active tickets (NEW for a waiting win), games open to bet, the Community's faces and player count,
  Recommended "—", your locked guesses.
- **Switches and cross-links leave** the sections (Tracked / Your gap / Virtual, Your picks / Everyone, and the two
  links between Recommended and Your gap).
- **My bets** is titled "My bets" on all four addresses, with the list as its meta line.
- **Moments:** a tracked win pops its own ticket's Won pill once (from the ticket summary, which My bets now also reads);
  a placement pops every placed bet's tag together after the fresh read confirms it; no vibration.
- **Your picks** keeps its board while it refreshes.
- **Everyone and Recommended** are picture rows; Everyone's banner is twelve words; the League bets sheet changes too.
- **Your gap:** hero, market switch, four tiles, ranked rows, your card, your virtual card; one gap is a layer with the
  review; the server's clock; the app's words ("Over 44.5 · −110 · 2U · BetMGM", "2 units"); a saved pick's final score
  no longer shows on its row.
- **The old app** keeps `VirtualUnits.jsx`.
Layout, words and navigation only; no game rule changes.
Plan: [2026-11-04-design-overhaul-step4-bets.md](superpowers/plans/2026-11-04-design-overhaul-step4-bets.md).
```

- [ ] **Step 6: Commit, push and open the PR.**

```bash
SHOTS="C:/Users/sbals/AppData/Local/Temp/claude/C--Users-sbals-betting-repo--claude-worktrees-guess-the-points-design-0bfb1f/e86e4bf8-003c-4c44-b10c-b3127309473f/scratchpad"
git add docs/COMPLETION_REGISTER.md docs/DECISIONS.md
git diff --cached --stat && git ls-files --eol docs/COMPLETION_REGISTER.md docs/DECISIONS.md
git commit -m "Register D-69 step 4 (Bets) and record its build decisions for Sean's review" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git fetch origin && git merge origin/main
git push -u origin claude/overhaul-step4-bets
gh pr create --base main --title "D-69 step 4: Bets (first card, tiles, sections, Your gap rebuilt) on the kit" --body-file "$SHOTS/step4-pr-body.md"
npm run sync:check
```

The PR body (written to `$SHOTS/step4-pr-body.md`, the scratchpad) lists the seventeen decisions, the old-app files that
stay and their callers (`App.jsx`'s Virtual Units page; `tests/recommended-bets-ui.test.jsx` and
`tests/virtual-units-quote-ui.test.jsx`), the moments' contracts and the tests that pin them
(`tests/next-bets-moments.test.mjs`, `next-bets-layers.spec.js`), the evidence counts, where the screenshots are, and
ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then update the register entry's PR number
and SHA in one more commit if they changed. Merging and releasing follow the lane protocol (Sean's word, the release
captain); this task does neither.

**Notes — risks to watch:**
- **Your gap is the largest change.** Seventeen browser tests in `recommended-bets.spec.js` move from `<details>` cards
  to rows and a layer; the characterization run before Task 6 is the baseline, and Task 8's table names every
  contract kept. The selection state lives in `YourGap` (not the list), so a direct link to a gap and the hidden list
  under it share it.
- **Server clock in Your gap.** Two browser tests move time with `page.clock` (Date and performance.now). The server
  still refuses a placement after kickoff (`GTL_VIRTUAL_CLOSED`) if the page's clock is behind.
- **The win moment's data** is the ticket summary, not the tracker's own read: a ticket settled while My bets is open
  plays at the summary's next refresh (focus, the timer); two scopes (`ticketScope`, `SCOPES.bets`) keep it on its own
  card. My bets now makes one more shared read (reused for 15 s).
- **A placement's confirmation** compares the reply objects (`before`), so the stale pre-write read can never confirm;
  placing is disabled while a refresh reads.
- **Cold `#bets` loads** ask for `/personal` (shared with Home and Research).
- **The League bets sheet** draws the same Everyone rows; its gate test (`next-game-bets.test.mjs`) is unchanged.

---

## Spec coverage

| Spec item | Where |
|---|---|
| 6 step 4 "First card: the next move (track a bet, or place your picks when a week is open), then tiles for My bets, Your picks, Everyone, Recommended and Your gap" | Tasks 2 (model, screen), 8 (browser) |
| 6 step 4 "My bets: keeps the November 1 Roomy cards and filters. A settled win is a small moment; a loss is quiet" | Tasks 3 (the tracker unchanged), 4 (`betWin`), 8 (once, own card, never on launch or a failed read) |
| 6 step 4 "Your picks (D-67): entrance motion, plus a small moment when a placement is confirmed" | Task 4 (stagger, kept board, `confirmedPlacements`), 8 (lost reply pops nothing) |
| 6 step 4 "Everyone and Recommended: picture rows with faces first" | Task 5 (faces on Everyone, marks on Recommended; D-77's hero stays first on Your gap, Decisions item 1) |
| 6 step 4 "Your gap (old VirtualUnits.jsx): rebuilt as tiles and rows on the same data" | Tasks 6, 7, 8 (`shared/recommended-bets.mjs` unchanged; every old contract mapped) |
| 4.1 every layer has its own address; Back closes one; focus on the heading | Tasks 1, 3, 5, 6, 7, 8 (sections as screens: Decisions item 2) |
| 4.2 moments: confirmed only, never replays, never on page load, small spacing, losses quiet | Task 4 (engine tests), 8 (browser) |
| 4.3 entrance, settle back | Tasks 2, 4, 5, 6 (`.gx-stagger`), 7 (`KeptParent`, the Nest's entrance) |
| 4.5 loading in the final shape; error with Try again and the last copy | Tasks 2, 4 (kept board), 5, 6, 8 (measured) |
| 5 card anatomy (one lime button, ≤ six numbers, toned words, ≤ twelve words, picture rows) | Tasks 2, 5, 6 (copy test), 7 |
| 7 failure handling (failed read, lost reply) | Tasks 4 (no moment), 6 (Try again, Check saved picks) |
| 8 privacy (own data only; no hidden pick or line) | Task 2 (D-31 test), Task 5 (row leak tests), Task 8 (rendered-page leak scan) |
| 9 test 1 (moment sizes) | Task 4 (`betWin` small; a loss reports nothing) |
| 9 test 2, 3, 4 (confirmed only, never replays, never on page load) | Task 4 (unit), Task 8 (browser) |
| 9 test 6 (reduced motion) | the kit's CSS gates (moments.css, nest.css); screenshots run with Reduce motion |
| 9 test 8 (nesting addresses: reload, shared link, Back, focus) | Tasks 1, 8 |
| 9 test 9 (transform and opacity only) | no new keyframes; `tests/next-tokens.test.mjs` in Tasks 2, 4, 5, 6, 7 |
| 9 test 10 (fixed bars) and 11 (phone layout, 44 px, 12 px, axe, both themes, wide font) | Task 8 (new spec, scroll navigation, phone layout) |
| 9 test 12 (gates in tiles and rows) | Tasks 2, 5, 8 |
| 9 test 13 (old-app retirement) | Task 7 (`next-app-view.test.mjs`), Task 9 Step 2 |
| 10 delivery (frontend only, its own PR, register evidence) | Task 9 |
