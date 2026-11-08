# Premier League and FEPL native Prism rollout — November 7, 2026

Status: **implemented and checked locally; unpublished; independent parent review required**. No PR, merge, migration, hosted read or deployment.

The task branch is `codex/prism-epl-visuals-20261107`, owned worktree
`C:/Users/sbals/.codex/worktrees/prism-epl-visuals/betting-repo`.
It was created from freshly fetched `origin/main`, then fast-forwarded to shared
Prism baseline `7ce04475aaf5e1b7db80e4224fd4bca0a4c34b10`. The shared/root checkout
and the reference checkout were read-only throughout this work.

## Exact authority

[Rollout areas 35–40](CONFIRMED_VISUAL_ROLLOUT_2026_11_07.md#35-epl-manager-linking)
are binding. The approved source is
`design/style-directions-2026-11-04/selected-system-review.json` at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76` in the owner-acceptance worktree.
Its `eplManagerPreview`, `eplHomeRecoveryPreview`, `eplDraftPreview`,
`eplMoneylinePreview`, `eplFantasyPreview` and `eplShellPreview` records, associated
isolated/populated JSX/CSS, review records and PNGs were read. Later full league
wording and individual circle treatments supersede the older squared crest tiles.

No preview controller, fixture adapter, no-op callback or review-only data is
imported into production. The added Fantasy input module is under `tests/fixtures/`
and imported only by the Playwright test runner. All fixtures are synthetic;
PGlite is disposable. No actual account, live sportsbook quote or real future
schedule was supplied by these tests.

## Implementation and retained behavior

| Area | Native reconciliation | Verification |
| --- | --- | --- |
| 35 Manager linking | Approved claim-card hierarchy, spacing, outline choices and full manager labels. The existing first-claim/session-watching controller is retained. | Native choose, busy, linked, taken, already-linked, failed, uncertain, watching and no-managers states captured. Real first-claim concurrency and competing-claim regressions retained. |
| 36 Home/recovery | Body-family 600 headline at 24/36, larger separated countdown tiles, stacked club tile, highlighted pick-order tile, independent moneyline action. Retained boards now explicitly show stale status; actual review/source state opens native table guidance. Framed loading/error/refusal states reuse native retry/read logic. | Turn, picked, unlinked, all-in, locked, moneyline progress/failure, stale, review/source Info, loading, failed, forbidden, off and no-week captured. |
| 37 Draft/queue | Numbered circular draft nodes, existing clock icon, full-name two-column club cards, confirmed club card before the updated board, framed ordered backup rows, and explicit taken-club skip labels. Saved IDs and queue order are unchanged. | Waiting, can-pick, closed, manual/backup confirmation, latest-picker change action, ranked add/move and taken-club presentation captured. Real turn-start automatic assignment, no repeated popup or browser auto-pick write, queue persistence, deadline and tied-margin arithmetic regressions pass. |
| 38 Moneyline | Circular locked-status dots; full club names and separate crest circles in headers, favorite choices and other matches; approved input/stepper, outlined Save draft/navigation, result comparison and rank cards. Long typed prices retain the readable input fallback. | Entry, saved draft, scored/pending/unscored, closed unsaved draft, uncertain, stale, busy, read-only, unavailable, loading, failed, all leaderboard states and expanded permitted reveal captured. |
| 39 FEPL Fantasy | One FEPL Fantasy page heading, framed two-by-two tabs, wrapped manager/player names, framed projection bubbles, player grid/bar rows, standings cards and expanded totals, two-column insight tiles and paired observations. | All 16 reviewed scenario inputs, expanded standing and estimate Info captured through the native controller. Missing observations remain gaps; null capture time remains unavailable. Native win-chance, opponent inference, totals and bonus math are unchanged. |
| 40 Shell | Existing FEPL sheet uses its own locally transparent List backplate. Native clock/ticket notice graphics and full National Football League explanatory/history wording. | FEPL sheet, History unavailable, Back/focus return and Bets unavailable captured. The existing Community/FEPL switch remains reachable; no shared frame rearrangement or new history/betting feature. |

Production changes are scoped to `web/src/next/epl/`. The new stylesheet uses the
shared Prism tokens/effects. Primary reading and action labels use **16px**;
genuine metadata uses **13px**. This intentionally retains the native reading
floor instead of copying the preview's 8–12px mixed-case text. Headline/countdown/
score scale, layout, glass material, status meaning and full names are retained.
Dark selected panels use neutral glass with green emphasis; Light retains its
existing pale accent tint. Every crest has its own circle, including higher
specificity small/favorite/queue rules at 320px. The G remains unchanged.

`useEplDraft`, `draftModel`, `createGuessController`, the source/price/distance
helpers, Fantasy calculation helpers, API routes, SQL and provider integration
are unchanged. Existing account/request identity, permission refusal clearing,
CAS/readback, pending-draft, kickoff/reveal and lock behavior remains. Source
labels and times come from native reads. Unknown values are never converted to
zero, later quotes never replace a saved reference, and bonus totals are not
added again. Table-source URLs retain their native allowlist and attribution.

## Native evidence and commands

[The complete evidence manifest](../design/prism-epl-native-2026-11-07/evidence.json)
contains **600 unique captures across 67 native state IDs**, exact approved PNG
counterparts and SHA-256 hashes, native source hashes, theme/viewport/scroll
metadata and the retained-image flag. Every state has Dark/Light 320px and 390px
full-page and scrolled captures. Representative Home/Moneyline/Fantasy states
also have 768px/1440px layouts and selected states have 320px forced-color views.

**56 representative images** are committed in
`design/prism-epl-native-2026-11-07/`. The other raw images remain local in this
owned checkout at `.local/prism-epl-captures/`; their hashes and exact locations
are recorded, and they can be regenerated. This avoids treating local-only
artifacts as synchronized Git content.

The native capture helper uses the reviewed storage-event synchronized
ThemeProvider method from `theme-capture.mjs`, then asserts resolved preference
and computed tokens. It checks document width, individual circular crests,
16px primary reading and 44px targets. Forced-color captures additionally compare
selected-control fill/ink against the browser's Highlight/HighlightText colors.
Keyboard Escape, modal focus return, browser Back/Forward and dirty-draft guards
are exercised. Existing meaningful Axe checks remain in the real app flows.

Checks performed in this owned worktree:

- **91/91** focused Vitest UI/controller checks: `npx vitest run tests/epl-app.test.jsx tests/epl-pick.test.jsx tests/epl-guess.test.jsx tests/epl-home-moneyline.test.jsx tests/epl-fantasy.test.jsx`.
- **68/68** Node model/brand checks: `node --test tests/next-tokens.test.mjs tests/brand-mark.test.mjs tests/epl-draft.test.mjs tests/epl-moneyline.test.mjs tests/epl-fantasy-view.test.mjs`. This includes all 15 Brand QA checks; no floor/token exemptions were added.
- **21/21** complete EPL browser checks passed before the final minor visual refinements. **9/9** focused final-layout checks then passed, followed by **4/4** added manager/result/draft-state checks. These are separate runs, not 34 distinct tests. The final registered set has 23 distinct tests. The committed-port configuration also passed a direct results-state run; the final Fantasy matrix passed with primary-body checks, and the final recovery rerun passed after the under-review sentence was raised to 16px.
- `npm run typecheck` passed. Cloud-test builds in the browser runs and `npm run build:cloud` passed. The existing large-chunk advisory remains; no CSS syntax warning remains.
- `node scripts/check-cloud-boundary.mjs --bundle-only` passed against the final cloud build. This was a bundle privacy check, not a live hosted authorization check.

Browser commands used the task-local `.local/playwright-epl.config.mjs`, which
mirrors the committed `playwright.epl-prism.config.js`: same cloud-test build,
auth fixture boundary, one worker and exclusive port **5248**. The committed
configuration provides this reproducible command:

```powershell
$env:GTL_EPL_CAPTURE='1'
npx playwright test --config playwright.epl-prism.config.js tests/cloud-browser/epl.spec.js tests/cloud-browser/epl-navigation.spec.js tests/cloud-browser/epl-moneyline-shell.spec.js tests/cloud-browser/epl-moneyline-flow.spec.js --workers 1
```

The fixture and capture test additions verify actual native screens and
controllers, with real local handler/PGlite flows for claims, queue advancement,
lock/save/readback/reveal and settlement states. Explicit test response failures
exercise native recovery; they are not production adapters. No provider credit
or hosted data is used. The Home stale/review presentation regression was first
observed failing, then passed after the native status rendering was added.

## Explicit limits and remaining review

- Parent independent visual/fidelity review remains required. These checks are
  evidence for local implementation, not owner acceptance or blanket completion
  from shared tokens.
- The global Frame/header/sport row/dock placement remains under the root's
  separate owner clarification. Existing controls and routes were preserved.
- The preview-only Fantasy source-info and EPL shell-info explain fictional
  review examples. There is no corresponding native action to substitute. Native
  source footer, estimate Info, table-source Info and availability notices remain;
  no mock disclaimer or no-op Info action was installed in the product.
- Physical iPhone/VoiceOver, hosted authenticated behavior, live source freshness
  and deployment acceptance are unverified here. Native sources remain responsible
  for actual dates, rosters, manager identity, quotes and permissions.
- No avatar/photo/award exploration, NBA/Signal work, SQL, migration, paid data,
  deployment, PR or push. The parent requested a named local commit for review;
  the repository's default push/PR step is therefore intentionally deferred.
