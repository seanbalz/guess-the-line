# Trends research implementation plan

Owner: Sean Balsiger · October 21, 2026
Status: approved design; implementation started in PR #161.

**Goal:** Put a focused recent-consistency shortlist, reproducible historical charts,
market-aware research leans and a separate Book It With Trent feed in the new app.

**Architecture:** Keep the frozen study unchanged. Add a pure research evaluator,
a versioned candidate adapter over existing NFL predicates, an authenticated Lines
research reader, and shared weekly/matchup UI. An offline generator prepares a
server-only historical snapshot. The server checks the free nflverse schedule
source on demand and caches source data (never viewer projections). Reviewed
social entries enter through a bounded server-only configuration, with validation
and original-post provenance. Unconfigured sources have an honest unavailable state.

**Tech:** existing Node ESM, React/Vite, node:test/Vitest, Supabase Edge handler and
the existing SQL line reader. No migration or new paid service is required.

**Design:** [approved specification](../specs/2026-10-21-trends-research-design.md).

## Global constraints

- Guess means expected sportsbook line, never a fair-line model. Do not derive EV,
  probability, stake size or predictive confidence from the guess gap or hit rate.
- NFL spreads and game totals only for analytics. Trent's original plays remain
  independent of evidence and may include other markets.
- Recent means last 30 qualifying completed games, pushes included, across seasons.
  Explore also supports last 25, current/previous season, rolling 12 months and
  full available history with actual dates. Display filters never change canonical
  qualification or the full evidence used for a lean.
- Canonical qualification: unchanged existing Tier 1/2 plus positive last-30 -110
  units and at least 20 decisive games; OR 30 games in three chronological
  non-overlapping blocks of ten, each at least eight decisive and positive -110
  units. If earlier history has at least 30 decisive games, it too must be positive.
  At most two conditions. New candidates remain retrospective, not Tier 1/2.
- Shortlist at most three; emerging and source-reported material in Explore.
- Rank by Tier 1, then existing Tier 2/recent consistent equally, latest match,
  prospective sample, stable ID. Never rank by historical ROI or hit rate.
- Same-market evidence groups are connected components using same nonempty
  deduplication group, same family, or at least 50% overlap of the smaller set of
  matched game IDs. Mixed-direction groups vote neither way.
- Lean needs at least two agreeing groups and strictly more than the other side.
  Opposing Tier 1 with none on the count winner overrides to No clear lean.
  Qualifying opposition otherwise stays yellow Alternative. Green supports the
  lean; red is not a synonym for opposition. Groups are not statistical independence.
- Lean additionally requires pregame, open market, exact known applicable
  conditions, fresh history and a server-timed current reference whose observation
  is neither future nor more than 12 hours old. Missing/stale references disable
  this new lean only; do not alter retained lines, guess anchors or D-18 bet saving.
- Charts and tables use the exact selected sample. Label modeled returns
  "Illustrative units at -110"; actual-price performance only for fully priced
  samples. Pushes are excluded from hit-rate denominator. Show exclusions/coverage.
- Enforce reveal in the server response, including trend titles, IDs, counts,
  source previews and URLs. Never put unplayed lines or unrevealed user information
  in public files. A Trent parlay needs every associated NFL market open.
- No automated X ingestion is assumed. Source-reported claims cannot vote.
  Preserve revisions and original terms. No synthetic live plays.
- Follow GTL brand/token rules, text equivalents for color, keyboard access,
  44px controls, 320px and dark/light layouts. Preserve the frozen tracker/study.
- Work sequentially in this task worktree. Commit reviewed named files, push,
  update completion register and verify sync. No merge/deploy/migration claim.

## Task 1 — Pure research records, qualification, grouping and leans

Files:
- Create `shared/trends-research.mjs`
- Create `tests/trends-research.test.mjs`

Public contract:
- `selectResearchPeriod(records, { period = 'recent30', season, now })`
- `researchRecord(records)`
- `evaluateResearchCandidate(candidate, { now, season, period })`
- `groupResearchEvidence(evidence)`
- `researchLean({ evidence, market, visible, kickoff, now, reference, historyFresh })`
- `researchShortlist(evidence, limit = 3)`

A candidate has id, version, family, dedupGroup, market (spread/total), direction
(home/away/over/under when applied), title, conditions, registeredAt, sourceState,
historicalTier (1/2/3 from frozen study adapter), and records. Each record has
gameId, date (ISO game time), optional availableAt (result availability), season, result (-1/0/1), odds
(nullable valid American price). Missing/unknown results do not become losses.
Evaluation returns the selected period record and chart, canonical qualification
and reasons, retrospective/prospective records, matched IDs and date coverage.
Keep canonical IDs separate from a per-game UI key. Build immutable outputs.

- [x] Write focused failing tests first: period bounds, cross-season last30,
  pushes and chart reconciliation, partial prices, each qualification boundary,
  future results, prospective boundary, canonical period invariance.
- [x] Implement pure evaluator with deterministic chronology and stable ties.
- [x] Add failing grouping/lean tests: overlap chains, 50% boundary, duplicate
  source, family overlap, mixed groups, two-vs-one yellow alternative, two-vs-two,
  stronger historical conflict, fourth opposition beyond top3, old/future/
  missing quote, kickoff and closed market.
- [x] Implement grouping/leans; closed response exposes no evidence.
- [x] Run focused tests and inspect diff. Commit named files. Report RED/GREEN
  commands and results in `.local/trends-task-1-report.md`.

## Task 2 — Historical/source adapters and authenticated research API

Files:
- Create `shared/trends-research-candidates.mjs` and
  `shared/trends-research-sources.mjs`
- Create `cloud/trends-research.mjs`
- Create a server-only prepared snapshot module and offline generation helper;
  compress the artifact when needed to fit Edge function packaging limits.
- Modify `cloud/lines.mjs`, `cloud/handler.mjs`,
  `supabase/functions/gtl-api/index.ts`
- Create `scripts/trends-research.mjs` and `tests/trends-research-cloud.test.mjs`
- Update relevant Lines boundary/route tests if their allowlists need the new route.

Interfaces:
- Candidate adapter reuses the existing frozen registry and predicates. Preserve
  registered sides; for unregistered presets register both explicit sides as
  new versioned candidates, not a retrospectively selected winner. Supported
  pregame spread/total predicates only, max two conditions, deterministic IDs
  and Oct 21, 2026 registration. Existing frozen tiers are recalculated using the
  original completed-season horizon/gates; new sides stay Tier 3.
- Source registry identifies the five trend accounts and separately Trent.
  Reviewed feed schema has version, checkedAt, availability, entries, immutable
  revision ID/previous revision, source URL, capturedAt/postedAt, original terms
  and explicit NFL game/market dependencies. Validate URLs, dates, bounded text
  and sizes; reject unknown fields that could bypass gates. Source claims are
  never promoted to verified computed candidates.
- `createResearchProvider({ loadSchedule, loadSnapshot, clock, reviewedFeed, venues, corrections })`
  caches only parsed public source and prepared research, coalesces concurrent
  reads and expires source checks after five minutes. An offline generator
  performs the expensive full-history evaluation. The runtime compares a content
  fingerprint of observable completed rows and current schedule identity with the
  prepared snapshot. Changed results, missed finals, new completed games, unknown
  target conditions or source failure disable dependent leans; historical samples
  retain their explicit snapshot date. No cached viewer response.
  The snapshot may contain redacted upcoming feature context but never unplayed
  lines/odds/weather/referee terms or user data. Runtime current-line predicates
  must match the frozen engine on parity tests; unsupported state-dependent
  predicates remain unavailable. Verify schema and future observations. Reuse
  existing corrections/venues and CC BY attribution.
- `POST /lines/research` accepts only optional season/week, gameId, period,
  market, family, team and candidateId for visible detail. Authenticate through existing handler. Read
  `gtl_read_lines` through current service; project it before research evaluation.
  Use authoritative server time. Open markets only enter applicability; inject
  accessible spread using app-to-nflverse sign conversion. Unknown weather/ref/
  line predicates cannot fire. Historical-only views may exist after kickoff,
  but never produce a live lean.
- Response: version, season/week/now, history status/provenance, sources,
  shortlist (max3), games with gated spread/total research, explore candidates,
  separate trent status/plays. For each open market include own guess, saved
  reference and current reference separately. Compute lean before display filters.
  Do not expose server-only records or locked-market metadata.
- Edge entry point supplies optional `GTL_RESEARCH_REVIEWED_FEED` JSON configuration
  (bounded, server-only). Missing configuration means Source unavailable.
  No public bundled picks. Invalid configuration fails this feature closed.
- CLI validates a reviewed feed from an ignored local path without logging plays,
  and can run deterministic replay/null evaluation using local historical inputs;
  refresh input uses the existing free nflverse URL and preserves originals.

- [x] Write failing adapter/API tests for normalized directions, no future
  leakage, unavailable sources, refresh failure, caches, bad requests and quote age.
- [x] Build adapter and provider; preserve frozen files and source budgets.
- [x] Profile cold/warm source verification and research projection. Keep the
  prepared artifact under packaging limits; document exact local measurements
  and the remaining hosted performance check.
- [x] Test closed-market absence of titles/counts/IDs/URLs and multi-market Trent
  gating, account/week changes, primary play corrections and no auto-fade.
- [x] Run focused boundary tests. Commit named files, report RED/GREEN evidence.

## Task 3 — Shared research UI and matchup/weekly entry points

Files:
- Create `web/src/next/research/ResearchSheet.jsx`,
  `ResearchCards.jsx`, `ResearchChart.jsx`, `useResearch.js`, `research.css`
- Modify `web/src/next/lines/LinesBoard.jsx`, `GameSheet.jsx`,
  `web/src/next/shell/registry.jsx` and its route allowlist if needed.
- Create `tests/next-research-ui.test.jsx`; update scoped existing tests only
  when integration changes their contracts.

- [ ] Hook calls existing linesApi('research'), scoped by account/week, aborts
  old requests and drops stale results after account/market/week changes.
- [ ] Add Trends access from Lines board and inside each matchup, without
  restructuring navigation owned by other worktrees.
- [ ] This week shows at most3 consistent cards with chart, date/sample, label,
  why applicable; same shared projection powers matchup detail and Explore.
- [ ] Explore has period, market, team and supported situation/family filters;
  emerging is easy to select. Defaults recent30. Show actual data date range.
- [ ] Detail expands full evidence including yellow alternatives and overlap,
  uncertainty reasons, modeled chart with zero baseline and accessible table,
  retrospective/prospective and price coverage. No fabricated confidence.
- [ ] Show expected market guess, saved line and accessible current line in
  separate labelled rows. Explain the gap without treating it as a bet signal.
- [ ] Separate Trent section shows original plays/source state, revisions,
  source URL/time/terms when open. Never fabricate empty feed contents.
- [ ] Use existing tokens/components and lazy detail chart; empty/error/closed/
  stale/loading states readable and accessible.
- [ ] Run focused React tests including weekly/matchup consistency, hidden
  market content, alternatives, period selection and async race protection.
  Commit named files; report RED/GREEN evidence.

## Task 4 — Integration, research diagnostics and review

Files: scoped fixes from review, `docs/TRENDS_RESEARCH.md`,
`docs/COMPLETION_REGISTER.md`, this plan and approved spec status.

- [x] Run deterministic historical replay and shuffled-outcome diagnostic for
  the registered candidate family; save version/hash/counts and explain limits.
  It is a false-discovery diagnostic, not betting-performance validation.
- [x] Attempt a free source refresh and record actual coverage or explicit
  unavailable/stale state. Never invent current results to populate the UI.
- [ ] Run focused privacy/line/boundary tests, full npm test, typecheck/build,
  brand QA and relevant browser checks (320px, dark/light, key states).
- [ ] Have task reviewers verify each implementation and a fresh broad reviewer
  check the complete branch. Fix material findings and recheck changed behavior.
- [ ] Document configuration, data refresh, reviewed-feed workflow, rollback
  feature switch, unconnected sources, tests and hosted/real-phone limits.
- [ ] Update PR #161 title/body for final behavior and evidence; push and run
  sync:check. Report full commit, PR and unpublished work. No deployment inferred.

## Execution record

- Design approved by Sean on October 21, 2026.
- Plan reviewed for internal consistency before implementation.
- Implementation uses sequential implementers and independent task reviews;
  parent coordinates integration and verification.
- Task 1: commit 202d46cfe1e1f658cc02336718e5e30008076d1f; 38 focused/regression
  tests passed and independent review approved with no findings.
- Runtime design adjustment: direct live catalogue evaluation measured about
  15 seconds and 516 MB RSS locally. Supabase's documented request CPU limit is
  2 seconds and memory limit is 256 MB. The build therefore prepares historical
  research offline and checks source freshness before serving any lean; it does
  not add a scheduler. Refreshing the prepared snapshot is part of the existing
  manual data publication workflow. Hosted performance is still unverified.
- Task 2: authenticated API, adapters and generated artifact completed; 62 focused
  tests and 80 SQL/boundary tests passed at the initial checkpoint. Independent
  review found a delayed-request clock bug; three regressions and commit beaf18f
  fixed it, and review approved. Follow-up allocation/fingerprint optimization
  in 2d18257 preserved four response hashes; 25 API tests passed and independent
  review approved with no findings. Hosted runtime acceptance remains separate.
- Offline replay/null diagnostics completed against the recorded October 21
  source: three recent-rule qualifiers versus 5.65 average in 20 null runs.
  Results and limits are preserved in model/trends/research-diagnostics-2026-10-21.json.
