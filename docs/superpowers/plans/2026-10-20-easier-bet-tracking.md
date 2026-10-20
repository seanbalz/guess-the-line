# Easier bet tracking implementation plan

Owner: Sean Balsiger · October 20, 2026 · Version 1

> For agentic workers: use subagent-driven-development for implementation and review.

**Goal:** Deliver the approved actual-bets-first flow through deployment and three-machine sync.

**Architecture:** Reconcile existing button controls into SocialBetTracker. Keep one
ticket store and authoritative filtered projection. Extend the read-only outcome
filter to accept `settled`; deploy its backward-compatible API before Pages.

**Tech stack:** React, Node, PGlite, Playwright, Supabase Edge Functions, Cloudflare Pages.

## Constraints

Follow the adjacent approved design. Preserve all tickets, audits, line locks,
unknown prices, recovery and Virtual Units behavior. No migrations, real test
tickets, paid sources or changes to other worktrees. Use existing brand tokens.

## Task 1: Implement and verify the complete ticket flow

- [x] Extend `tests/social-bets.test.mjs` and `tests/social-cloud.test.mjs` with
  `filters: { outcome: 'settled' }` assertions: pending excluded; win/loss/push/void
  included; list and summary use identical scope; void excluded from ROI. Run
  `node --test tests/social-bets.test.mjs tests/social-cloud.test.mjs` before changes.
- [x] In `shared/social-bets.mjs` match settled using
  `['win', 'loss', 'push', 'void'].includes(entry.outcome)`; accept that value in
  `cloud/social.mjs` read validation. Preserve all existing exact outcome filters.
- [x] Reconcile the reviewed named patch and two source files from
  `.local/bet-entry-review/` into `web/src/SocialBetTracker.jsx`,
  `web/src/BetEntryControls.jsx`, `web/src/betEntryControls.css`,
  `web/src/liveBets.css` and the two existing browser tests. Do not import old docs.
- [x] Pass `initialView="mybets"` from `web/src/next/bets/Bets.jsx`. Make that
  mode owner-scoped for current, chosen and all weeks, independent of shared tabs.
  Add result/market buttons, clear-filter empty state and filtered-summary label.
  Preserve initialView units and feed for classic callers. Guard stale responses
  by query identity and request generation before displaying or storing data.
- [x] Extend `tests/cloud-browser/next-bets-live.spec.js` for owner default,
  cross-week scope, settled/market combinations, explicit shared/virtual views,
  button validation and recovery. Adapt existing selectors without weakening assertions.
- [x] Run targeted Node tests, `npm run typecheck`, classic social browser tests,
  and `npx playwright test --config playwright.cloud.config.js tests/cloud-browser/next-bets-live.spec.js`.
  Verify real test execution rather than skips; inspect 320/390 light/dark screenshots.
- [x] Review implementation for privacy, data retention, races and stale UI; fix
  findings, then commit named files and update PR155 to describe the implementation.

## Task 2: Release and synchronize

- [x] Run required checks and exact-head CI. Record compatibility and rollback
  in `docs/EASIER_BET_TRACKING_RELEASE.md`; update completion register and Q16.
- [x] Merge only after required checks pass. Recheck hosted API and Pages source
  plus migration/permission state. Deploy compatible API then exact tested Pages.
  Verify hosted source, live assets and permitted reads without synthetic tickets.
- [ ] Record actual versions and verification results, review/test/merge evidence.
  Run sync:pull and sync:check in the three clean integration checkouts only.
  Report full commits, PRs, deployment evidence and preserved unpublished work.
