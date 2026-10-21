# Percentage Ranked Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rank recommendations by comparable percentage gaps and make the Bets views easier to scan with compact, expandable historical context.

**Architecture:** `shared/recommended-bets.mjs` computes and sorts relative gaps while retaining raw points and offer eligibility. The existing Bets shell and `VirtualUnits` reuse the authenticated recommendation read, and the existing same-origin trend-week loader provides context through the reveal-aware `gameTrends` selector. CSS stays token based.

**Tech Stack:** React 19, Vite, Node test runner, Vitest, Playwright, existing GTL design tokens.

## Global Constraints

- Ranking: `abs(guess - consensus) / denominator * 100`; spread denominator `max(abs(consensus), 3)`; total denominator `consensus` when positive.
- Keep both point and percentage gaps. Equal 5/50 and 1/10 gaps both show 10%.
- Percentage is disagreement, never predicted win probability or validated edge.
- Only the existing authenticated recommendation path may supply personal guesses and offers.
- Use existing trend-week cache and its source/period/sample labels; no invented trend.
- Keep explicit Track this bet review and Virtual Units placement. No background write.
- Use shared GTL tokens, 44px controls and source timestamps.

---

### Task 1: Ranking and guidance

**Files:**
- Modify: `shared/recommended-bets.mjs`
- Test: `tests/recommended-bets.test.mjs`

**Interfaces:**
- `buildRecommendations(input)` still returns `rows`, each with `gap`; add `gapPercent` and `denominator`.
- `evaluation(side, value, offer, denominator)` returns text/color using absolute relative 10% guidance.

- [ ] **Step 1: Add failing tests.** Check 5/50 = 1/10, ranking across markets, spread values 0, 0.5 and -10, zero total exclusion, deterministic tie order, and equal guidance for equal relative gaps.
- [ ] **Step 2: Run `node --test tests/recommended-bets.test.mjs`.** Expect failures for the new fields and ordering.
- [ ] **Step 3: Compute `denominator = market === 'spread' ? Math.max(Math.abs(reference.value), 3) : reference.value`; skip nonpositive denominators; calculate `gapPercent = 100 * gap / denominator`. Sort by percentage, then existing kickoff and key. Compare each side's signed advantage divided by denominator with 10% for green/red, preserving `gap` and existing quote/lock rules.**
- [ ] **Step 4: Run `node --test tests/recommended-bets.test.mjs`.** Expect zero failures.

### Task 2: Compact Recommended rows with history

**Files:**
- Modify: `web/src/VirtualUnits.jsx`, `web/src/recommendedBets.css`
- Create: `web/src/RecommendationTrends.jsx`
- Test: `tests/cloud-browser/recommended-bets.spec.js`

**Interfaces:**
- `RecommendationTrends({ season, week, gameId, market, consensus })` reads `loadTrendWeek` and `gameTrends`; displays at most two matching historical cards.
- `RecommendationCard` retains all existing handlers and selection terms; use a native `details/summary` disclosure.

- [ ] **Step 1: Add browser expectations.** The first three rows use descending percentage gaps; summary includes percentage and point gaps; disclosure shows quote details, trend status and actions; a saved selection survives collapse and a refresh.
- [ ] **Step 2: Run targeted browser test and confirm failure.** Use `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/recommended-bets.spec.js`.
- [ ] **Step 3: Render a compact summary with matchup, market, side, percentage/points, quote age and short sourced historical record when available. Put full comparisons, side guidance, quote provenance, trend records and actions in the expanded section. Keep a selected Virtual Units review visible until explicitly saved/cancelled.**
- [ ] **Step 4: Style both classic and redesign shells with semantic tokens, bounded text, touch targets and clear expanded state. Label small-spread 3-point normalization in details and explain ranking in the header.**
- [ ] **Step 5: Run targeted browser test again.** Expect zero failures; capture any optional PGlite skips accurately.

### Task 3: Bets navigation and handoff

**Files:**
- Modify: `web/src/next/bets/Bets.jsx`, `web/src/next/bets/bets.css`
- Modify: `docs/COMPLETION_REGISTER.md`
- Modify: `docs/RECOMMENDED_BETS.md`

**Interfaces:**
- Three Bets destinations remain `tracked`, `recommended`, `virtual` with existing shell state and editor callbacks.

- [ ] **Step 1: Make each Bets destination's purpose readable on mobile and adjust tab wrapping without horizontal overflow. Keep active state and keyboard navigation.**
- [ ] **Step 2: Update the feature contract and completion register with the percentage formula, display limits and actual review state.**
- [ ] **Step 3: Run `npm run typecheck`, `npm test`, `npm run build`, targeted Playwright, `git diff --check` and the brand QA command from CI. Confirm zero required failures before committing.**
- [ ] **Step 4: Stage named files, inspect `git diff --cached` and `git diff --cached --check`, commit, push, open a PR, run `npm run sync:check`, and report exact branch/commit/PR and outstanding release state.**

### Task 4: Current-week historical input

**Files:**
- Modify: `scripts/trends.mjs`, `web/src/trendWeeks.generated.js`, `docs/TRENDS.md`
- Create: `shared/trends/season-2026-week-07.csv`, `shared/trends/2026-week-07.json`
- Test: `tests/trends-week7.test.mjs`

**Interfaces:**
- `scripts/trends.mjs --season-file shared/trends/season-2026-week-07.csv` records a dated input for Week 7 without replacing the Week 6 source.

- [ ] **Step 1: Use the existing free nflverse schedule fetch, its source hash and redaction rules to prepare the Week 7 input. Keep the committed Week 6 season input unchanged.**
- [ ] **Step 2: Regenerate the Week 7 file with the dated input path and test byte-for-byte reproducibility, privacy redaction and same-market trend selection.**
- [ ] **Step 3: Run `node scripts/trends.mjs --season 2026 --week 7 --reuse-season-file --season-file shared/trends/season-2026-week-07.csv --check` and `node --test tests/trends-*.test.mjs tests/trends-week7.test.mjs`. Expect zero failures.**
