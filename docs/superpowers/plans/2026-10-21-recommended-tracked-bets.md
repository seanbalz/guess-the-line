# Recommended tracked bets implementation plan

> **For agentic workers:** Use executing-plans task by task; requesting-code-review provides an independent review before merge.

**Goal:** Record recommendations as reviewed actual tickets and make those tickets easy to scan.

**Architecture:** The Bets screen owns a transient, account-bound ticket handoff. VirtualUnits emits a fresh recommendation snapshot; SocialBetTracker consumes it through its existing editor and idempotent writer. Grouped disclosures reuse the detail card instead of duplicating audit and result behavior.

**Tech Stack:** React, GTL tokens, Playwright, local PGlite, existing social API.

## Global constraints

- Actual bets first; Virtual Units remain separate. No automatic conversion.
- No hosted test tickets, provider calls, migrations or credential copying.
- Existing account/week scoping, line visibility and save recovery remain mandatory.
- Source/CI, hosted verification and three-machine sync precede completion.

## 1. Recommendation-to-ticket handoff

Files: web/src/next/bets/Bets.jsx, web/src/VirtualUnits.jsx,
web/src/SocialBetTracker.jsx, tests/cloud-browser/recommended-bets.spec.js.

- [x] Inspect existing writers/readers and verify a clean baseline (28 unit checks; one cloud-browser check).
- [x] Add a failing browser test: click Track this bet, confirm zero writes, inspect prefilled terms and unknown stake, confirm actual ticket, save, verify one social/create and zero virtual placements, reload.
- [x] Emit onTrackTicket({ season, week, kind: 'single', legs, odds, source, quotedAt }) from a freshly validated recommendation. Bets adds account identity and a transient request key, switches to Tracked bets only after its existing dirty-draft guard.
- [x] SocialBetTracker pins the seed week, waits for its matching read, consumes the seed once and opens create. BetEditor requires explicit actual-ticket confirmation for this source. Keep request/retry state inside the existing writer.
- [x] Add cancel and lost-response retry coverage. Keep separate Virtual Units actions and existing recommendation tests passing.

Run: npm run test:cloud-browser -- tests/cloud-browser/recommended-bets.spec.js
Expected: no skipped tests, one actual ticket per completed review.

## 2. Grouped tracked-ticket layout

Files: web/src/next/bets/TrackedBetRow.jsx,
web/src/next/bets/tracked-bets.css, web/src/SocialBetTracker.jsx,
tests/cloud-browser/next-bets-live.spec.js.

- [x] Add a native details/summary row wrapping the existing detail card for compact owner views only. Selection and matchup lead; labelled status and stake/net align right; parsable unknown values never become zero.
- [x] Style with existing theme tokens, rounded shared surface, inset row dividers and visible focus. Reduce header/filter/summary clutter without removing controls or records.
- [x] Extend fixture checks to open details, correct/report tickets, filter/reload, and capture 320/390px light/dark list and detail states. Run Axe and inspect captures.

Run: npm run test:cloud-browser -- tests/cloud-browser/next-bets-live.spec.js
Expected: complete existing flows, no overflow or accessibility violations.

## 3. Review and release

- [x] Update completion register, queue and release card with actual local evidence and remaining release state.
- [x] Independent code review; fix findings; typecheck, relevant tests, cloud boundary, brand QA and build.
- [ ] Commit named files, push, sync:check, attach PR, pass exact-head checks and merge.
- [ ] Protected exact-source frontend release and served-asset readback; verify API/data/migrations unchanged.
- [ ] Record actual evidence, finish its review/merge, sync clean Windows/Mini/Neo main. Preserve all other worktrees.
