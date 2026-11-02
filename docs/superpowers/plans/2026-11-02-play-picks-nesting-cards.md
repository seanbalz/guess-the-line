# Play › Your guesses nesting cards (D-69) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Executed inline on November 2, 2026, in the session that wrote the spec; code lives in the commits, not repeated here.

**Goal:** Play › Your guesses shows a week layer of game tiles and a one-game layer instead of 15 stacked cards.

**Architecture:** `PerGameEditor` keeps every piece of state and logic. A new optional `nest` prop
(`{ game, onOpen(id), onWeek(), onNext(id) }`) switches its render. With `nest`, it draws the shared `Nest`: the week
grid, or the open game's card. Without it (the old app, unit fixtures), it draws today's stacked list. `SelectedPlay`
builds `nest` from the shell (`view.pickGame`). The shell counts a `pickGame` change under Play › picks as a step.

**Tech Stack:** React 19, the new-app kit (`web/src/next/ui`), Vitest with `renderToStaticMarkup`, node:test for the
shell reducer, Playwright cloud-browser specs against the real handler and PGlite.

## Global Constraints

- Rules unchanged: D-16, D-20, D-30, D-31, D-36, D-37, D-39. The server decides every state.
- D-66 contract: one job per layer, at most one meta line, one picture and one big number per tile, and no surface
  sentence over 12 words. Fine print sits behind ⓘ.
- Lime only for your selection and the one primary action; the next-to-lock ring uses `data`.
- Tokens only (`--gx-` custom properties, `gx-` classes under `.gx`); `tests/next-tokens.test.mjs` must pass.
- A tile never shows the line, points or another player's guess.
- Files keep LF line endings; `git diff --check` must be clean.
- Run local tests only for files changed (Sean's standing instruction for this lane).

---

### Task 1: The shell counts opening a game as a step

**Files:**
- Modify: `web/src/next/shell/state.js` (`navigationPatch`)
- Test: `tests/next-router.test.mjs`

**Interfaces:**
- Produces: `reduce(state, { type: 'view', tab: 'play', patch: { pickGame } })` under `section: 'picks'` pushes a trail
  step. A patch whose result equals the prior trail place pops it (existing `returnsToPrior`).

- [ ] Write failing node tests:
  - opening `pickGame` is a step, so Back returns to the week with no `pickGame`;
  - a lip patch `{ pickGame: undefined }` after opening goes back (the trail shrinks);
  - Next (back, then open) keeps the trail at one step;
  - a deep link's Back returns to its origin tab.
- [ ] Run `node --test --test-reporter=tap tests/next-router.test.mjs` and expect the new cases to fail.
- [ ] Add the `pickGame` clause to `navigationPatch`.
- [ ] Run again and expect all to pass with `# skipped 0`.

### Task 2: The editor draws the week and game layers

**Files:**
- Create: `web/src/next/play/PicksNest.jsx` (`WeekTiles`, `gameTag(state, game)`, `tileGuess(mode, game, value)`)
- Create: `web/src/next/play/picksNest.css`
- Modify: `web/src/next/play/PerGamePlay.jsx` (extract `GameCard`; branch on `nest`)
- Modify: `web/src/next/play/Play.jsx` (`SelectedPlay` passes `nest`)
- Modify: `web/src/next/play/WeekProgress.jsx` (`strip` prop; the nest hides the state strip)
- Test: `tests/next-play-nest.test.jsx` (new)

**Interfaces:**
- Consumes: `weekProgress()` rows `{ id, game, state }`; `STATE_ICONS`; `pickText`; `Nest`, `InfoButton`, `TeamMark`.
- Produces: `PerGameEditor({ …, nest })`, where
  `nest = { game: string|undefined, onOpen(id), onWeek(), onNext(id) }`. Tiles are `button.gx-nest-tile` with
  `data-game` and `data-state`. The game layer keeps `article.gx-play-game[data-game]` so existing selectors still match
  inside it.

- [ ] Write failing Vitest cases:
  - The week shows one tile per game, in order.
  - Each tile shows its state tag and guess, and no line, points or others' values.
  - A tile's click calls `onOpen`.
  - The game layer shows the "Back to Week N · Market" lip, the picker and the primary Lock button for an open game,
    and the receipt for a locked one.
  - An unknown `game` falls back to the week.
  - No surface sentence runs over 12 words.
  - Without `nest`, the stacked list renders.
- [ ] Run `npx vitest run tests/next-play-nest.test.jsx` and expect it to fail.
- [ ] Implement `PicksNest.jsx`, the `GameCard` extraction and the `nest` branch; wire `SelectedPlay`.
- [ ] Run Vitest on `next-play-nest`, `next-play-moments-ui` and `next-app-view`, plus node `next-tokens`, and expect a
  pass.

### Task 3: Cloud-browser specs open games through tiles

**Files:**
- Modify: `tests/cloud-browser/next-per-game-scoring.spec.js`, `next-play-moments.spec.js`, `next-play-live.spec.js`,
  `next-lines.spec.js` (the Your pick › Open in Play case)
- Create: `tests/cloud-browser/next-play-nest.spec.js`: week › game › lock › Next › lock, a reload on a game address,
  390px and 320px, and axe on both layers.

- [ ] Add a helper `openGame(page, id)` that clicks the week tile when the game layer is not open.
- [ ] Run `npx playwright test --config playwright.cloud.config.js <spec>` for each changed spec and expect a pass.

### Task 4: Records, PR and merge

**Files:**
- Modify: `docs/COMPLETION_REGISTER.md` (D-69 entry: built, not released)
- Modify: `docs/ALL_TABS_LIVE_WORKFLOWS.md` (Play section note)

- [ ] `PYTHONUTF8=1 python scripts/check-brand-docs.py`, `npm run typecheck` and `git diff --check`.
- [ ] Commit, push and open a PR, then set auto-merge when green.
- [ ] Release only through the manual release workflow, on Sean's word.
