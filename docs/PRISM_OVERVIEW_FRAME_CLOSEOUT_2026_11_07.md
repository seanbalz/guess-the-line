# Confirmed NFL overview and selected-receipt framing — November 7, 2026

Status: partial local implementation/evidence checkpoint; independent parent review required. The three NFL overviews and two selected-receipt contexts are covered here; the additional confirmed contexts below remain unfinished. No push, PR, merge, deployment, migration apply or hosted verification is established. This is a scoped omission closeout, not whole-project completion.

## Authority resolution

Recipe authority is the read-only owner-acceptance tree at `3ac2eb50513ba73447ef890e4a47863cde7bdd76`, `design/style-directions-2026-11-04/`. `OVERVIEW_CLOSEOUT_REVIEW.md` and `selected-system-review.json.overviewCloseoutReview` approve fourteen whole-view images at `6bfcfdbe787bdc2d44019aa3e3c85530cf009ebd`. Home, Play and Bets overview wrappers deliberately include the compact header and floating dock (`app.js`), not only body cards. The later `league-wording-play/bets` Dark/Light captures approved at `5fe706bc7f1ecea2d51ab2b5f40d486f7d050718` reinforce those exact contexts with circular sport marks. Native NFL/EPL wording specimens are Research contexts, so they are not same-context counterexamples for these overviews.

The same fourteen-image approval includes open/settled receipt captures. Their visible compact wrapper is reinforced by the later `team-league-circles-ticket` pair approved at `d109e5386b49093f66b173492261bbb5e126739a`. In contrast, entry-selection and entry-terms show two scroll positions of the same fullscreen create dialog: header/dock are not visible. These modal approvals authorize their dialog presentation, not a new compact frame for arbitrary editor backgrounds.

This precise mapping supersedes the generic frame-conflict hold in [the parent rollout record](CONFIRMED_VISUAL_ROLLOUT_2026_11_07.md) only for the named implementation contexts below. It does not claim the owner answered the previous cross-context question, approve global unification, or close other states by inference. The separate Research navigation evidence and parent aggregate ledger are outside this commit. Existing specialized approval scopes remain valid; this document does not certify every other native detail frame as owner-approved.

## Exact implementation scope

- Actual default-registry NFL Home, Play and Bets overview roots use the existing Home frame recipes: original hybrid G without circle; individual circular sport marks in the header; 16px-inset, 72px floating dock; selected native typography, colors and glass. `gx-overview-frame` is separate from Home-only `gx-home-design` body rules.
- Actual NFL Bets receipt-opening intent from `BetsLanding.openTicket`: `view` active/settled plus existing nonempty `selectedTicket`, forwarded to `SocialBetTracker.initialExpandedTicket` and its matching `TrackedBetRow`. This intent is ephemeral in-memory navigation metadata, not a serialized receipt URL or live row-expansion state. Local collapse or filters do not invent a new shared frame controller. No receipt is fabricated if a filter hides it.
- Generic active/settled list entry clears `selectedTicket` in its existing navigation patch, preventing a prior receipt intent from reopening a ticket or compacting a generic list. Manually expanding a generic-list row retains its native frame.
- Existing Research, other nested/detail views, page layers, access covers, EPL and custom screen registries retain their current native framing in this implementation. Ordinary entry remains a fullscreen native dialog; no shell predicate is added from its hidden background. A modal over the same actual overview can retain that background frame with existing inert/focus behavior.
- Existing league access remains through Research's header and Play's League tile -> LeagueScreen -> Your leagues. Menu has no switcher; none is added. Sport access, pending-draft guard, Back, route behavior, counters, data reads, saved values and Home body/controller spacing remain intact.

The frame CSS is imported by Shell, so direct `#play` and `#bets` first entry does not depend on visiting Home or on Home's body stylesheet. Existing lazy JavaScript module boundaries remain. Dock/toast clearance is aligned with the floating bar's 72px height plus 12px bottom offset and uses existing safe-area/keyboard/dock-height variables.

## Local verification and evidence

Owned branch/worktree: `codex/prism-overview-frame-20261107`, `C:/Users/sbals/.codex/worktrees/prism-overview-frame/betting-repo`. Fresh fetched `origin/main` was `7aa93a6ffe79eafb58bd6c7d12ec230b6d77b0e9`; the new worktree was fast-forwarded to frozen integration base `1ba236960dfb8050538ba762b35e40eb2799e071` before edits. Canonical dependency junction and local PGlite 0.5.8 were used. Exclusive browser port 5298.

[Evidence manifest](../design/prism-overview-frame-native-2026-11-07/evidence.json) records native hashes, approved reference hashes, exact pairs, source commit/file hashes and limitations. Capture mode is explicitly `GTL_CAPTURE_OVERVIEW_FRAME=1`; normal checks write only `testInfo.outputPath` under ignored artifacts. No pre-task PNG or manifest is overwritten by this task.

Commands use ignored `.local/playwright.overview.config.mjs`, an adapter of the repository cloud config that changes only port 5298, root cwd and ignored artifact path. Its webServer rebuilds cloud-test assets with the repository's fictional public connection settings. The imports adapter changes only testDir to the existing performance folder.

- `npx playwright test --config .local/playwright.overview.config.mjs tests/cloud-browser/next-overview-frame.spec.js`: exact direct-root Dark/Light preference/resolved-theme/paint assertions;390/320/768; forced-color320;44px targets and Axe; full-root end-content/focus clearance; modal inert/Tab/Escape; nested Back and league access; EPL and pending-guess sport guard; dock/toast keyboard resize/close probes; receipt-opening, filters/collapse, generic lists and account isolation. 11 passed in the final full matrix; the subsequent two-sport receipt recapture and account/filter checks passed 2/2.
- Targeted existing `next-shell.spec.js`:9 passed, including the retained overview/Menu/Appearance/switcher Axe checks, custom registries, actual-registry access covers, focus handoff, dirty details, Back and dock/toast geometry. Updated its expected compact selectors and used the retained Research header to open the switcher.
- Original Home browser-chrome/Total navigation, original keyboard dock pin, nested origin/reload, delayed root-scroll restoration, NFL skip-link/modal-focus and direct Play after baseline restoration:6 passed.
- Existing `performance/lazy-loading.spec.js`:1 passed; NextApp once, optional/local-only modules unloaded.
- `node --test tests/next-shell-state.test.mjs tests/next-tokens.test.mjs tests/theme-tokens.test.mjs tests/next-loading.test.mjs tests/approved-home-model.test.mjs`: 43 passed.
- `npx vitest run tests/next-bets-landing.test.jsx tests/next-bets-overview.test.jsx tests/next-home-ui.test.jsx tests/four-tab-landings.test.jsx`: 34 passed.
- `npm run typecheck`, `python -X utf8 scripts/check-brand-docs.py`, `npm run build:cloud`, `node scripts/check-cloud-boundary.mjs --bundle-only`, `git diff --check`:passed at the reported source.

Regression evidence: the exact direct-Play test fails against temporarily restored frozen-base Shell/Frame/Home CSS because compact framing is absent, then passes with the implementation restored. The receipt generic-list countercheck also failed before `selectedTicket:null` was added, then passed after it. No assertions/retries/skips/allowlists were weakened to obtain those results.

## Remaining confirmed frames and concrete hold

The completed 43-area authority audit and independent architecture review found further supplied compact compositions. This checkpoint does not close their frame work. Existing body work remains in place; these are implementation/evidence gaps unless a specific hold is identified.

| Context family outside this checkpoint | Remaining frame/evidence work |
| --- | --- |
| NFL Play opened Spread/Total game draft; Points week/draft/profile; Score weekly/game/local History; League board/feed | Map actual existing section/layer/market state and verify each named supplied context. Do not infer all closed/error/locked variants from a draft capture. |
| NFL Research Games/Trends/Teams/Fantasy sections and approved layers | Distinct real sections can receive their named compact compositions while actual Research landing retains its reviewed native frame. This checkpoint only verifies retained landing league access. |
| NFL Bets performance analytics, historical guess gap, Virtual board | Respect existing trackedPane/recommended/virtual distinctions; preserve real slip/dock/controller behavior. Generic active/settled lists are not these contexts. |
| NFL Account History | Existing `page.history` is already a Page. Port only its approved outer frame while preserving its arguments, Back and title/actions; create no Sheet or route. |
| NFL named AccessPending/Community-removed covers; exact continuity failure hosts | Match actual component/host identity. An arbitrary truthy cover or failure must not adopt unrelated framing. Current generic test-harness covers intentionally remain native. |
| EPL Home, Play pick/recovery, moneyline entry/leaderboard | Have named compact approvals; not implemented by this NFL-only checkpoint. EPL Bets and its History unavailable page retain their explicitly approved native contexts. |
| FEPL Research/Fantasy | Concrete held overlap: the real router's default/fantasy aliases render the same destination, but both compact Fantasy and native EPL Research navigation frames are explicitly approved. No new split/route/state or global answer is inferred here. Keep body work and hold frame choice for the parent's queued pointed clarification. |

The remaining general frame question has not been answered. The FEPL overlap is a concrete mapping issue rather than a reason to reopen unambiguous prior approvals. No new owner question was asked by this task. Parent owns aggregate ledger updates; this checkpoint does not edit the completion register or prior rollout ledger.

## Limits

All data is fictional local fixture data. Browser screenshots and SHA-256 establish reproducible bytes/provenance and functional geometry checks, not pixel equality with illustrative device-framed mockups, production data, owner phone acceptance, release readiness, merge or deployment. Native account/counters/game content and safe-area framing differ from the concept. Chromium keyboard probes simulate viewport changes; real iPhone keyboard behavior remains device verification. Existing Vite>500kB warnings remain; the known unrelated BiasChart fixture-key warning is not resolved here. No broad full suite was rerun. Full `check:cloud` requires the intentionally absent `.env.cloud`; only the successful bundle-only privacy scan is claimed, with no hosted calls.
