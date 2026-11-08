# Whole-app UX, formatting and scrolling sweep

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development for fixes and reviewed integration.

**Goal:** Find and correct visible UX/UI, formatting and scrolling regressions across the current native app, and make bottom navigation match Home on every tab.

**Authority:** Sean asked for a comprehensive sweep, matching menu bars and no scrolling issues. His clarification is “Bottom navigation only (Recommended)”: reuse Home’s approved floating glass bar across tabs. Top headers retain their current section-specific layouts. This newer bottom-bar instruction supersedes old per-context native/floating bottom-bar exceptions only.

**Base:** freshly fetched origin/main `0c83bb4b3c55409b234c5587a735a096d100a866`; current app code equals deployed ROI source1c5a9da0, API52, Pagesb3bd6187.

## Global constraints

- Preserve approved body layouts and materials, current top-header/context policy, independent market scores, controllers, routes, locks/drafts/reveal, private roster/auth guards, data/history, API and SQL behavior.
- Use one Home bottom navigation recipe everywhere the authenticated app bar is present: same width/insets/height/material/icons/type/selected treatment, allowing active tab and real badge/availability differences. Keep standalone auth/fullscreen-layer semantics intact.
- Keep sticky action docks/toasts and focus/scroll clearance aligned with the actual shared bar and safe areas; retain Back scroll restoration and account/scope cleanup. Do not hide overflow or shrink text to conceal defects.
- No production writes, provider collection, paid sources, migrations, M41 enablement or credential/profile extraction. M41 remains separate draft497. No avatars/new icon options/awards/NBA/parked Signal work.
- Freeze the approved design evidence and v62; new audit output is ignored under output/playwright/ or .local/ux-sweep. Label fixture data and distinguish local native checks from real-phone/signed-in production acceptance.

## Task 1: Baseline audit (read-only, independent domains)

- [x] Build an immutable current-main cloud-test snapshot and production signed-out check; run browser review using fresh isolated profiles and actual native controllers with local hosted-schema fixture accounts.
- [x] Inspect Home, Play/Spread/Total/Points/Score/League, Bets and receipts/tracking/tools, NFL Research Games/Trends/Teams/Fantasy, Account/settings/history/auth/recovery/commissioner, EPL Home/draft/moneyline/FEPL and shared sheets/dialogs/offline/access states.
- [x] Check Dark and Light at 320,390,768,1440 widths, short/tall phones and representative landscape; review screenshots, long/empty/loading/error states and long labels.
- [x] Check no global sideways scroll, clipped/overlapping primary text/controls, broken mark images, misleading active tabs, inaccessible final content, swallowed wheel/touch, focus traps, scroll jumps, lost Back position, nested dialog scroll or fixed-bar drift. Compare bar geometry and visual properties across tabs.
- [x] Produce named reproducible findings with route/state/theme/viewport, screenshots and measurements; record passed/failed/unreachable coverage honestly. Do not treat prior green tests as a fresh visual sweep.

## Task 2: Fix confirmed issues

- [x] Reproduce navigation inconsistency and each actual defect before changing source; use shared primitives/recipes for common causes.
- [x] Decouple bottom bar styling/clearance from top-header/context classification so all existing native/compact destinations share the selected Home bar without changing top headers or bodies.
- [x] Add meaningful focused regressions appropriate to the defect, preserve old privacy/source/controller assertions, and update old per-context bar geometry expectations to the new explicit uniform requirement.
- [x] Correct additional formatting/scroll defects from the baseline, keeping existing design choices; raise one concrete question only if an actual new layout choice is required.

## Task 3: Verify, review and release

- [ ] Repeat failed cases and representative whole-app matrix on candidate; exercise actual scroll/Back/modal/dock/keyboard paths, both themes and fallback fonts. Run relevant existing browser/component/Node/token/type/Brand/build/privacy checks without default skips.
- [ ] Perform task and whole-branch review with exact source/capture evidence; preserve frozen hashes and record residual device/access limits.
- [ ] Update current completion record, commit reviewed named files, push/open PR and sync:check. After exact CI/merge use existing protected release gates for the authorized frontend corrections, preserving API/database state.
- [ ] Verify production bytes/metadata and publish actual release evidence; report source/branch/full commit/PR/verification/unpublished work. No blanket claim of every physical-device state.

## CI followup — Nest layer entry

- [x] Reproduce initial PR502 browser-shard failure and distinguish actual entry-scroll defect from resize/paint occlusion; preserve original failed evidence.
- [x] Reset changed Nest layers to their top before existing heading focus, keeping Shell/manual-history Back ownership, headers, bodies and scanner assertions intact.
- [x] Verify RED0/45 to GREEN, exact settled browser Back scroll/focus, and48 covering browser cases plus component/token/type/Brand checks.
- [ ] Review the two-file delta, update the audit evidence and run fresh exact-head CI before normal merge/release.
