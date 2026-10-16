# Current handoff — October 15, 2026

Use [current rules](RULES.md), the [completion register](COMPLETION_REGISTER.md)
and the [October 15 release record](RELEASE_2026_10_15.md) before the historical
handoff below. Pages `fc7f3cd2` is deployed from `main` at `d71a988`; API v23
remains active with JWT verification. All five opt-in tabs use the existing hosted
workflows; the old app remains the default and fallback.

M-01 is hosted with `revealAt: "kickoff"`: the weekly deadline alone does not
reveal an unstarted game's picks or gated lines. M-02 remains unapplied, so
whole-market Submit and D-16 deadline edits continue (`sentFinal: false`,
`lateWindow: "deadline"`). M-03 and M-08 also remain unapplied; use the completion
register for the full migration inventory and apply gates. This handoff does not
authorize a migration or change a business rule.

The repository and committed `planning/project-tracker.json` are public. That
tracker is frozen historical evidence, not the current task ledger. Preserve
unrevealed picks and private account data outside public artifacts. Current
acceptance gaps, including actual-phone and full-week checks, remain in the
completion register; recorded fixture results are not production-write evidence.

Issue #1 remains open: the starter-archive audit is still unverified. Issues #3
and #7 are closure/supersession candidates for delivered backend/Total work and
obsolete common-kickoff scoring requirements; no issue closure is implied here.

## Archived October 8 handoff and status notes

Everything below is preserved historical text. Its "current" or "latest" labels,
private-repository/tracker statements, deployment versions and earlier rule
claims describe that earlier record; they do not override the current pointers
above. The archived starter-ZIP reference is not proof that an archive was found
or audited.

---

# Current status and precedence — October 8, 2026

**Latest verified release (October 8, 2026):** Pages `531d14b5` / authenticated
API v13 adds provisional Spread and Total comparisons in every matching group,
optional dashboard matchup filtering, and 13 transparent team marks. Troy and
Luke are linked to Triple Threat. Read `docs/CLOUD_SETUP.md` and the private
`planning/project-tracker.json` v15 for evidence and remaining work. Earlier
release counts below are historical. Global standings, timestamped scoring
reference changes, Solo stake/ROI tracking and Best Bets remain unfinished;
D-16's scoring-reference question was subsequently answered in the voice session:
use individual submission-time references, re-anchor changed guesses on edits
before the existing deadline, and show current consensus separately. The local
implementation and verification record is `docs/SUBMISSION_TIME_SCORING.md`;
this decision is not proof of a hosted deployment. Older permanent-lock and common
reference descriptions below are historical where they conflict with D-16.

Latest verified release: selected Yardline G / Field monogram identity, exact
Guess The Line site name, five dashboard layouts, section/motion/in-page notice
controls, and independent provisional Over/Under analysis are live. Both Sean
and Steven have submitted fifteen Spread and Total guesses. Scheduled twelve-hour
odds collection is enabled; actual first clock-boundary execution and official
freeze remain unverified. A historical GTL model prototype is measured but does
not beat its simple baseline and lacks current data. Thirteen team marks are deployed; the remaining nineteen require eligible sources. See `docs/MODEL_VALIDATION.md`,
`docs/VISUAL_POLISH.md` and the tracker for the exact remaining work.

Read docs/CLOUD_SETUP.md and planning/project-tracker.json for the current release evidence before relying on the original handoff below. Authenticated hosting, Sean’s private read and profile/game/invitation writes are verified; ordinary player signup delivery, connected data and a second physical device remain outstanding. D-02 locks submitted ballots and reveals analysis independently by market. D-05/D-06 require the same weekly guesses and Challenge selections in every group, with independent membership and standings. Functional Light/Dark/System is authorized using provisional tokens; final branding remains open. Implementation and deployment status of these additions are recorded separately in the tracker. Older edit-until-deadline, group-specific selection and no-hosting claims are historical, not current authority.

# New priority — Guess the Total and free account acquisition (2026-10-08)
Read docs/GUESS_TOTAL_IMPLEMENTATION.md, docs/ACCOUNT_ACCESS_REGISTER.md, and docs/ODDS_PROVIDER_EVALUATION.md. Build Guess the Total as an independent hidden-market prediction game with separate accuracy scoring, W-L-T and dashboard; preserve Guess the Spread and record-based Betting Challenge. Use free sources only, verify reuse rights, and never publish private league picks in static frontend assets. Account checklist is **not** evidence of connection. Do not request passwords.

# New confirmed constraints — 2026-10-08
Use FREE odds/data sources only unless the user explicitly revises the budget. Read docs/DESIGN_EXPLORATION.md before branding work. All existing colors/fonts are provisional. Produce five *visual* alternatives for each category (logo, app icon, typography, palette, UI, iconography, motion) and request user selection before finalizing. Do not claim text descriptions are finished designs.

# Archived multi-agent delivery handoff

Historical proposal: current rules are consolidated in docs/RULES.md and current worker assignments live in planning/project-tracker.json. This archived plan does not grant publishing authority or require new PRs for the ongoing shared dirty checkout.

Updated: 2026-10-08. Source of truth: this private GitHub repository.

## Mission
Ship a usable, tested, mobile-friendly web app and iPhone experience for Sean, Troy and Luke, with scalable league support. Complete implementation end-to-end rather than producing only specifications. No autonomous background execution or deployment is currently confirmed. Agents must report verified commits, tests, integrations and blockers.

## Read first / precedence
Read AGENTS.md, README.md, docs/RULES.md, docs/DECISIONS.md, data/games/sean-troy-luke.json and data/picks/2026-week-05.json. Newer explicit user decisions override conflicting older text. Preserve historical picks, including two archived invalid Week 5 matchups. Never silently rewrite predictions. Resolve conflicts in docs in a dedicated PR with audit notes.

## Confirmed product behavior
- Distinct games: Guess the Line (predict sportsbook spread without seeing benchmark) and Betting Challenge (one required spread OR total pick per game by default; league-configurable limit; W-L-P and win percentage, not money).
- Guess the Line: 10 points exact, subtract 1 per half-point of absolute spread error, floor 0. Normalize signed spread to a single home-team reference before comparing. League supports 2, 3 or 4+ players; separate closest-to-line per-game W-L-T standings. Ties count as ties, never fabricated wins.
- Predictions may be revised until configured submission deadline; no one-edit cap for Guess the Line. Opponent pick visibility after full ballot, per rules; benchmark visibility and score reveal need deliberate privacy design: user wants a running score after predictions are in, so avoid leaking market lines to users still making predictions. Commissioner and submitted players may see permitted score views; add tests.
- Live provisional score: capture timestamped, source-attributed multi-book consensus snapshots; recalculate per-game and weekly totals on new verified lines, persist time-series, show history chart and changes. Freeze official benchmark at ACTUAL Thursday Night Football kickoff in America/Los_Angeles, using last valid pre-kickoff snapshot. Never overwrite frozen record; handle missing data with explicit stale/unverified state. Do not use old Thursday-noon freeze instruction.
- Sources: Action Network consensus where licensed/accessible, Circa and Pinnacle as sharp checks, major US books as comparisons. Do not assume Action Network offers an API or scrape contrary to terms. Keep odds provider configurable; evaluate lawful commercial feeds. Verify actual quote timestamps and spread conventions.
- Notifications: weekly slate available, incomplete ballots two hours pre-kickoff, commissioner kickoff summary, movement milestone 1.5 and 3 points, immediate opt-in push/SMS/email with per-channel opt-out; actual delivery integrations not confirmed.
- Edge board: original player spread vs consensus vs named independent model, rank biggest gaps and closest guesses, distinguish disagreement from proven expected value; totals need a separate totals model.
- Platforms: responsive web plus iPhone app. League-specific rules and independent games.

## Parallel agent workstreams and interfaces
1. **Product / rules agent**: reconcile conflicting docs and specify permissions, submissions, deadline exceptions, freeze behavior, and acceptance scenarios. Output canonical docs and tests.
2. **Data / odds agent**: provider evaluation and legal access, adapter interface, game ID mapping, quote normalization, stale/consensus gates, historical snapshot persistence, replay fixtures. Do not claim live integration until proven.
3. **Backend / scoring agent**: database schema, authenticated league membership, picks + immutable revisions, two game modes, provisional recalculation, freeze job with idempotent lock, standings and audit events. Expose typed API.
4. **Web / dashboard agent**: accessible mobile-first picks, live provisional totals, historical score chart, source timestamps, closest-to-line table, privacy states, league settings.
5. **iOS / notifications agent**: native iPhone client or explicitly documented implementation approach, authenticated APIs, opt-in channel preferences, push/SMS/email provider adapters, reliable scheduling.
6. **QA / release agent**: fixtures, unit/integration/end-to-end tests, timezone DST and kickoff cases, quote outages, data integrity, auth privacy, staging deploy, release checklist, docs.

Agents work in separate branches and PRs; do not concurrently edit the same file. Backend publishes API contract before web/iOS integration. QA gates merges. Never commit credentials or personal contact details. Use GitHub issues and PRs as work ledger.

## Delivery sequence
P0: Audit repository and starter ZIP availability; confirm real code vs docs; reconcile rule contradictions; define architecture and API; create issues.
P1: Implement canonical schedule and authenticated persistent data model, validated odds adapter + fixture replay, scoring engine and unit tests.
P2: Implement live provisional dashboard, score history, privacy rules, freeze job and W-L-T standings; integrate test odds replay before real feed.
P3: Implement Betting Challenge, edge analysis, notifications and mobile UX.
P4: iOS app, production odds integration, staging and production deployment, observability, security review and handoff.

## Definition of done
- A real user can create/join a league, enter and edit picks, and see a permitted provisional score dashboard updating from verified odds.
- Same odds snapshot yields identical scores for all players; frozen benchmark remains immutable after kickoff and can be audited.
- Both scoring modes and standings work with 2/3/4+ participants; no cross-mode pick contamination.
- Historical chart reflects actual stored snapshots; stale quotes labeled; replayable deterministic tests pass.
- iPhone and web experiences tested; notification channel preferences and delivery verified where connected.
- README documents setup, deployment, env variables, providers, costs, test commands, open limitations.
- No claim of production readiness without live end-to-end validation.

## Known current state / caveats
The repository has rules, decision logs, 2026 Week 5 Sean picks, and three saved provisional snapshots (95.8, 95.8, 96.4). The local viewer reads those files through a validated loopback-only API; both dashboard routes share one implementation. Stored arithmetic, prediction identity and deltas reconcile; market quotes and the schedule have not been independently reverified. See `docs/WEEK_5_SNAPSHOT_LINK.md` for the linked chat and coverage, and README.md for run/update commands. This is not a production feed, authenticated app, or official freeze implementation. Past conversation referenced a local starter ZIP, but full application import/deployment has not been verified. Week 5 has 15 eligible Sean picks plus 2 archived invalid-matchup picks. Other players' picks and a production odds feed are not yet confirmed.

## Nudge protocol
Ask Sean only decision-blocking, specific questions, one at a time, with recommended default and impact. Continue all independent work while awaiting response. Initial blocker: choose data provider/budget if a licensed odds API is required. Avoid minor implementation preference questions. Every progress update must identify completed commit/PR, passing tests, remaining blocker, and next milestone.
