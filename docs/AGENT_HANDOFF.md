# Guess the Lines — Multi-Agent Delivery Handoff
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
The repository currently has rules, decision logs and 2026 Week 5 Sean picks. Past conversation referenced a local starter ZIP, but full application import/deployment has not been verified. Earlier 95.8/150 provisional score and third-party consensus quotes were reported conversationally; do NOT treat as validated persisted feed snapshots. Week 5 has 15 eligible Sean picks plus 2 archived invalid-matchup picks. Other players' picks and a production odds feed are not yet confirmed.

## Nudge protocol
Ask Sean only decision-blocking, specific questions, one at a time, with recommended default and impact. Continue all independent work while awaiting response. Initial blocker: choose data provider/budget if a licensed odds API is required. Avoid minor implementation preference questions. Every progress update must identify completed commit/PR, passing tests, remaining blocker, and next milestone.
