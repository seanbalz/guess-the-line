# Guess The Line — implementation and audit program

Owner: Sean Balsiger · Version 1 · October 8, 2026

Objective: finish the discussed tools, skills, audits and product implementation,
then verify their intended results. The production release is a checkpoint,
not completion of this objective. The [project register](../planning/project-tracker.json)
retains all product requirements, decisions, dependencies and remaining acceptance.

## Work and evidence

| Work | Tool or workflow | Current evidence and next required result |
| --- | --- | --- |
| Beginner and returning-player pick entry | Independent implementation agents, browser fixtures, live UI inspection | Deployed entry/review improvements; now implementing expired-draft retention, Solo recovery and explicit reconciliation after uncertain saves. Real participant completion/error observations remain required. |
| Accessibility and readable visuals | Shared brand tokens, axe with Playwright, keyboard and responsive checks | Automated Light/Dark scans and corrections are in progress. Physical phone, assistive-technology and manual zoom checks remain separate. Automated checks cannot establish full accessibility conformance. |
| Loading and responsiveness | Web performance skill, compiled dependency graph, delayed/failed chunk tests | Optional-screen code splitting is implemented locally. Trace tooling is unavailable in this session; measured phone loading and interaction remain open. Bundle bytes are not Core Web Vitals. |
| Security and privacy | Dependency audit, server/database privilege tests, live boundary probes, optional Codex Security | Release has 130 passing live access checks and server-only tables. October 8 dependency audit reports zero known advisories. Codex Security was found in the plugin directory but is not installed; an earlier suggestion already exists. Do not claim a completed scan from availability. |
| Scoring and accounting integrity | Engine/SQL tests, independent review, preserved source evidence | D-16/D-17 deployed. Historical missing references remain unscored. Real fresh submissions, point-in-time comparisons, reviewed results and ROI must retain their distinct evidence and acceptance requirements. |
| Data, models and useful research | Permitted free sources, source-rights review, chronological model validation | Current forecast/public-betting/statistics feeds are not established. Continue source and validation work; no invented model scores, ticket counts, sharp action or guaranteed betting advantage. |
| Shared play and account persistence | Supabase account/roster isolation, canonical ballots, private Solo records, shared Bet Tracker | Backend and UI deployed. Preserve group privacy and deliberate shared-record consent; verify actual account/device flows. Best Bets, global standings terms and the separate virtual game remain individually tracked. |
| Notifications | Persistent notices, deduplicated event planning, explicit opt-in delivery tests | In-page notices exist. Account mail, push and email delivery need configured free services and actual receipt/opt-out evidence. Do not count a notification preview as delivery. |
| Release and recovery | GitHub CI, compiled-only deployment, source fingerprints, local restore drills | Application and release-record CI passed for `30d331e` and `41e1aa6`. Whole hosted recovery, retention decisions, compatible rollback and scheduled-boundary observations remain open. |
| Running work register | Private repository artifacts and generated tracker | Record each item's implementation, verification and deployment separately. Keep unresolved work visible; do not mark all items complete because a worker finished a pass. |

## Execution rules

1. Inspect current files and external evidence before using an older status.
2. Give parallel workers separate files or explicit handoffs. Preserve concurrent
   rule planning, production data, source archives and other users' work.
3. Implement safe independent work while one pointed product question is pending.
   A pending answer is not permission to change scoring, source budgets or privacy.
4. Verify behavior with a relevant failure case, not only a successful build.
   Use synthetic isolated records for destructive/failure tests.
5. Record actual test counts and source versions. Do not add overlapping runs or
   call a mocked browser flow a real account/device observation.
6. Publish only the authorized, checked application artifact. Keep local fixtures,
   private planning and raw prediction JSON out of public static assets.
7. Audit every unresolved register item against its exit criteria before declaring
   the overall goal complete. Items requiring user decisions, permissions, live
   feeds or human/device observation remain open until that evidence exists.

## Current pass

- Group recovery owner: `design_controls` — retain expired unsaved copies, protect
  account scope, and reconcile unknown save outcomes without automatic replay.
- Solo recovery owner: `solo_recovery` — explicit tab restoration/discard, expired
  copies, conflict handling and account/sign-out cleanup.
- Performance/accessibility owner: `performance_audit` — defer optional screens,
  contain load failures, run accessibility scans and fix evidenced defects.
- Integration owner: `/root` — typed save outcomes, clear reload/readback actions,
  Challenge confirmation recovery, dependency audit and combined verification.

These are assignments for this pass, not a claim that workers continue running
after a handoff. The register will record final results and outstanding work.

## Sources and limitations

- [Production release evidence](RELEASE_2026_10_08.md).
- [Pick completion audit](PICK_COMPLETION_AUDIT.md).
- [Independent scoring review](INDEPENDENT_SCORING_REVIEW.md).
- [Model validation](MODEL_VALIDATION.md) and [operational runbook](OPERATIONS_RUNBOOK.md).
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
  describes automated axe checks and their limits.
- [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
  supplies the contrast criterion used by the audit.

No new external messaging, paid service, browser permission, scoring exception or
collection-policy change is established by this program.
