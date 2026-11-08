# Confirmed Bets composition closeout — November 7, 2026

Status: locally implemented and verified; unpublished. This completes the four
composition gaps explicitly retained in the earlier
[Bets landing handoff](PRISM_BETS_LANDING_2026_11_07.md).

The exclusive worktree is `prism-bets-closeout/betting-repo`, branch
`codex/prism-bets-closeout-2026-11-07`. It starts from freshly fetched
`origin/main` at `70c2b85ea7466ca308c8e69006b4ec09888267a7`, fast-forwarded to the
requested integration base `3a57e4886ca90e293d89520f255bde128252e652`.
Only the subsequent closeout commit is this handoff's new work.

Authority is the read-only owner-acceptance design tree at verified commit
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`. The selected-system review,
`overview-closeout-bets` pair, populated Bets/overview/changes sources, entry
and history captures were inspected. Their SHA-256 hashes and sixteen final
native captures are in the [evidence record](../design/prism-bets-closeout-2026-11-07/evidence.json).

| Confirmed composition | Native result |
| --- | --- |
| Individual Tickets previews with status and Open/View | Uses `useTicketSummary`'s actual owner-only `model.entries`. Shows one open and one settled ticket when present, otherwise up to two actual tickets. Exclusions, literal selections, unknown source/price and full parlay selection counts remain explicit. Each action opens the matching real ticket expanded. All ticket lists remain reachable through the compact All ticket views disclosure; Overview/Add retain their native destinations. |
| Recommended matchup teaser | Reuses the existing account-scoped `useAssessments` controller and shared personal access version, with the published account week. Only a permitted open assessment supplies the actual matchup and qualitative label. The existing theme-aware team marks form the circles. The CTA opens its real ResearchAssessments route. Loading, error/retry, locked, closed and missing assessments retain honest text and no sample game. This reads retained research and adds no quote collection/provider. |
| Full-name team choices in entry | Canonical schedule codes/full names resolve through existing NFL metadata and the team-mark registry. Stored away/home values, selection text and custom literals stay unchanged. Two full-name choices with marks fit the phone form in both themes. |
| Receipt → actions → numbered history | The receipt is its own card; owner result/correction/inclusion actions and the separate numbered history card are visible after expanding the ticket, without opening Ticket details or a nested history disclosure. Receipt metadata stays optional. Existing actual history/reasons/revisions and per-event changed-field disclosures remain intact. Other players receive no owner actions. |

The native frame and league reachability remain as integrated. The unresolved
header/dock placement question is outside this four-item closeout. Guess points
are never introduced into real-ticket receipts or returns.

## Verification

- `npm run typecheck`: passed.
- `npx vitest run`: 87 files / 900 tests passed on final source. Existing BiasChart
  key warnings remain outside this change. The stale destination-icon mock now
  retains real module exports and asserts the approved Bets hierarchy; meaningful
  glyph/access markup checks and Home/Research contracts are preserved.
- Focused Node accounting/privacy/manual-control/token tests: 68 passed; the
  subsequent shared-read/token run passed 20, including five additional cache
  contracts. No failures or skips.
- Browser: 25 passed, using the real cloud handler and migrated local PGlite,
  on exclusive port 5224. The suites are `next-bets-landing.spec.js`,
  `next-bets-live.spec.js`, and `research-assessments.spec.js`.
- Browser checks cover actual create/correct/report/include writes, exact 0.01U
  persistence, unknown prices, manual sources, four-decimal stakes, all six
  parlay legs, expansion/collapse focus, loss of replies and duplicate-safe
  recovery, expired-sign-in recovery, owner/account changes, pending/obsolete
  reads, summary cache invalidation and existing filters.
- A retained research fixture exercised the populated teaser and real assessment
  controller; empty/locked/loading/failure/retry states were separately checked.
  A new account with a pending read showed none of the prior account's previews
  or totals. No quote refresh/collection was requested.
- Light/Dark at 320px and 390px, forced colors, and zero axe violations in the
  tested landing/editor/history regions. Direct visual review compared the four
  final compositions with the approved captures. Evidence uses synthetic test
  accounts, not a hosted player's data.
- `npm run build:cloud` and `npm run check:cloud -- --bundle-only`: passed.
  The existing large-chunk build advisory remains. Full hosted denial probes
  were unavailable because this fresh checkout has no `.env.cloud`; no hosted
  access claim is made.
- `git diff --check`: passed before staging.

The existing [Virtual Units precision dependency](PRISM_BETS_NATIVE_2026_11_07.md#virtual-units-compatibility-dependency)
remains: Virtual Units is half-unit only; this change does not widen writers,
APIs or SQL. Tracked manual stakes retain their existing precision, quick-choice
minimum 0.5U and 0.1U taps. No migrations, push, PR, merge or deployment were
performed. Physical-phone acceptance remains separate.
