# Persona audit bigger changes — claims and progress

**Session:** cloud (claude.ai/code, session_01BYnHUEx2GP1nqpKATUiBcA) · **Agent:** AI Agent (Claude Code, cloud) · **Repository:** seanbalz/guess-the-lines-repo · **Base:** `main` at `b5491a2`
**Objective:** Sean ruled on October 9 that the persona audit's quick wins ship first (PR #34, merged as `1d8deba`) and the "Bigger changes" follow once the Codex reconciliation (PR #30) has landed. This file claims each bigger change for one cloud agent and one branch so the dashboard handoff agents (PR #35) and the Mac mini session do not start the same item. Baseline on `main` at `b5491a2`: 62 findings (0 / 7 / 29 / 26 by severity), 12 persona specs green, 34 axe scans clean; see the audit's "Baseline after PR #34" paragraph.

| Item (audit rows) | Branch | Scope | Spec that proves it | Status |
|---|---|---|---|---|
| Draft persistence and navigation (#3; phone severity-2 rows) | `claude/persona-bc-drafts` | Community Picks tab drafts in `sessionStorage` per account and mode, hash per screen (`#feed`, `#picks`, `#groups`), `popstate` so Back works; reuse `predictionDraft.js` patterns, no new storage of picks outside the device | `phone.spec.js` (tab switch, reload, back) | claimed |
| Keyboard model for chip rows (#9, #23) | `claude/persona-bc-keyboard` | `ChipPicker` only: radiogroup with roving tabindex, arrow keys within a row, numeric type-ahead, typed-value escape hatch; signed-chip contract unchanged | `power.spec.js` (≤ 100 presses for 14 games), `motor.spec.js`, `low-vision.spec.js` | claimed |
| Submission receipt and half-done flow (#25, #15, #30) | `claude/persona-bc-receipt` | One confirmation panel after Submit that takes focus, names the other ballot and links to the feed reveal; reveals only the submitted market | `power.spec.js` (focus), `confused.spec.js` (half done) | claimed |
| Sit-out placement and reveal (#40, #41, #42) | `claude/persona-bc-sitout` | "Sit out this week" as a text link below the ballot with the unchanged D-23 dialog; revealed picks on the sat-out screen; a feed post for the opt-out only if it needs no new hosted migration, otherwise proposed in the PR | `motor.spec.js` (tab order), `confused.spec.js`, `d23.spec.js` | claimed |
| Onboarding step (#29, #33, #16) | `claude/persona-bc-onboarding` | Name prompt alone, a one-line pitch on sign-in, a sentence on the groups screen about what groups are for | `first-timer.spec.js`, `confused.spec.js` | claimed |
| Targets (quick win 12: #19, #21, #24, #32) and group game helper parity (#31) | `claude/persona-bc-targets` | 44px like button, two-line team chips, due time in the save bar with bottom padding, 44px dialog radios, 44px mode tabs and the helper sentence on group game screens; no type-scale change | `motor.spec.js`, `phone.spec.js`, `first-timer.spec.js`, `scripts/persona-static-checks.mjs` | claimed |
| Type scale and density (#20, #28, #12) | — | Not claimed here: token, type scale and chart styling belong to the design agent of the dashboard handoffs (PR #35) | — | left to PR #35 |

Rules every branch follows: one branch per item, worktree from `main` at `b5491a2`, spec extended before the change, `npm run test:personas`-equivalent run for the specs named above plus the suites they share files with, `python3 scripts/check-brand-docs.py`, `git diff --check`, no `.local/` files committed, no hosted mutation. Each PR links this file; this table is updated when a PR opens and when it merges.

**Sync:** GITHUB_SYNCED on push of `claude/persona-baseline-after-pr34`.
