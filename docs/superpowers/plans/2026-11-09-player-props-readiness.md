# Player Props Data Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to carry out this read-only plan inline, task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish whether existing permitted free sources can support the approved Player Props design before enabling any live lock-in.

**Architecture:** Keep the source audit separate from the new guessing mode. Use existing provider/roster contracts and public raw-stat releases, then obtain bounded aggregate hosted reads without collecting quotes or modifying production. Publish only whitelisted readiness facts; unavailable access is an unknown, not zero coverage.

**Tech Stack:** Existing Node ESM source, Python 3 standard library, GitHub CLI, connected Supabase read-only SQL, Markdown and JSON. No dependency or workflow changes.

## Global Constraints

- "Preserve the current free-only budget."
- "Page views must not become unreserved provider collection loops."
- "Never place unrevealed guesses or service credentials in public frontend assets."
- "Hide the market number **only on the guess-entry screen** before lock-in."
- "Use separate accuracy results for each stat type: average absolute miss in native units, lower is better."
- "Do not expose the mode until the required data, schema, API and frontend are ready together."
- "A new migration requires its own reviewed artifact, fresh hosted preflight, preservation/privacy/grant checks and Sean's named apply instruction."
- Sean's approval condition is mandatory: use the surrounding app's existing Prism tokens, components, fonts, circles, header context and shared floating bottom bar. The approved boards do not authorize a second design system.
- This is the first independently reviewable phase of the approved spec. It authorizes no provider-credit request, publication of private quotes, schema write, collector activation or production deployment.

## Files and responsibilities

- Read: `cloud/research-provider.mjs`, `shared/research-markets.mjs`, `scripts/research-intake.mjs` — recorded-quote identities and collection boundaries.
- Read: `supabase/migrations/20261030204548_gtl_research_assessments.sql` and the fresh applied ledger — actual table/lease contracts, not an apply instruction.
- Read: `scripts/fantasy-sources.mjs`, `shared/fantasy-build.mjs` — raw source integrity and current normalization limits.
- Modify: `docs/PLAYER_PROPS_READINESS_2026_11_09.md` — human-readable observed capability, limitations and the activation decision.
- Modify: `docs/evidence/PLAYER_PROPS_READINESS_2026_11_09.json` — whitelisted aggregate evidence; no account identities, quote terms or secrets.
- Modify: `docs/COMPLETION_REGISTER.md` — current stage with evidence link.
- Preserve: `docs/superpowers/specs/2026-11-09-player-props-design.md` — approved product rules and board fingerprints.
- Keep raw responses and downloaded public data ignored under `.local/player-props/`.

## Task 1: Verify source contracts and actual public result fields

**Interfaces:** Consumes the spec's eleven market keys; produces a market-to-raw-stat/unit map and a timestamped public asset receipt. This does not produce a hosted quote or final-result receipt.

- [x] Inspect the existing provider/roster and quota implementation. Record supported books, identity requirements, eight markets per request and four requests per intake job, the shared lease/reserve, explicit collection flag and zero collection from page reads.
- [x] Check current primary provider terms and V4 event/market documentation. Record display/retention versus raw redistribution limits, quota formula and paid-only historical odds.
- [x] Fetch public GitHub release metadata and the exact `stats_player_week_2026.csv` asset. Compare byte length and SHA-256 to its published digest before parsing. Raw metadata and the bounded standard-library audit are saved under `.local/player-props/`.
- [x] Count source rows/weeks, missing/duplicate player-game identities and numeric coverage for all eleven mapped fields. Preserve unknown/missing values. The observed receipt is in the readiness JSON; do not recompute it from fantasy estimates.

Reviewable result: all eleven fields exist in the verified Week 1–9 public file;
no hosted event mapping, participation, official finality or correction coverage
is inferred. No code or tests are needed for this documentation/read-only phase.

## Task 2: Obtain fresh bounded hosted coverage and capacity evidence

**Interfaces:** Consumes authenticated database read access and the existing schema; produces aggregate observations or an explicit access error. It never returns private guesses or raw quote records to a public artifact.

- [ ] Restore the connected Supabase authentication. The current inventory call returned `UNAUTHORIZED`; do not request or copy passwords/service keys, bypass RLS or invoke mutating RPCs as a substitute. Confirm the intended project from the existing release configuration before querying.
- [ ] In a read-only transaction, verify schema presence and the actual budget row using these bounded SELECTs. Keep quota amounts and project metadata ignored; the public report needs only capacity status and observation time.

```sql
begin transaction read only;
set local statement_timeout = '10s';
select transaction_timestamp() as observed_at,
       to_regclass('public.gtl_research_quote_fetches') as quote_table,
       to_regclass('public.gtl_odds_budget') as budget_table;
select provider, conservative_remaining, observed_remaining, paused,
       last_successful_preflight_at, lease_until, updated_at
from public.gtl_odds_budget
where provider = 'the-odds-api';
rollback;
```

Expected: one verified project context, present existing tables and one budget
row; absent/unauthorized is not ready. These reads do not reserve credits, refresh
the provider, acquire a lease or reset budget state.

- [ ] Measure retained quote coverage without selecting names, guesses, prices, lines, request IDs or raw JSON. The following query uses table timestamps and aggregate counts only. It deliberately does not label three recorded books an eligible scoring reference.

```sql
begin transaction read only;
set local statement_timeout = '10s';
with expanded as (
  select f.season, f.week, f.game_id, m.market, f.started_at,
         f.request_id, f.quote_payload
  from public.gtl_research_quote_fetches f
  cross join lateral unnest(f.markets) m(market)
  where f.status = 'finished' and f.error is null
    and f.started_at >= transaction_timestamp() - interval '7 days'
    and m.market in (
      'player_pass_yds', 'player_pass_completions', 'player_pass_attempts',
      'player_pass_tds', 'player_pass_interceptions', 'player_rush_yds',
      'player_rush_attempts', 'player_rush_tds', 'player_reception_yds',
      'player_receptions', 'player_reception_tds'
    )
), latest as (
  select distinct on (season, week, game_id, market) *
  from expanded
  order by season, week, game_id, market, started_at desc, request_id desc
), identities as (
  select l.season, l.week, l.game_id, l.market,
         q.value #>> '{selection,playerId}' as player_id,
         q.value ->> 'providerEventId' as provider_event_id,
         max(l.started_at) as last_capture,
         count(distinct q.value ->> 'book') filter (
           where q.value ->> 'book' in ('draftkings', 'fanduel', 'betmgm')
         ) as recorded_books
  from latest l
  cross join lateral jsonb_array_elements(l.quote_payload) q(value)
  where q.value #>> '{selection,market}' = 'prop'
    and q.value #>> '{selection,key}' = l.market
    and nullif(q.value #>> '{selection,playerId}', '') is not null
    and nullif(q.value ->> 'providerEventId', '') is not null
  group by l.season, l.week, l.game_id, l.market,
           q.value #>> '{selection,playerId}', q.value ->> 'providerEventId'
)
select market, count(*) as recorded_identity_groups,
       count(distinct (season, week, game_id)) as recorded_games,
       count(*) filter (where recorded_books = 3) as groups_with_three_books,
       max(last_capture) as last_capture
from identities
group by market
order by market;
rollback;
```

Expected: an actual measured coverage matrix or an observed empty result. Neither
result proves eligibility: individually validate the retained current roster,
event/kickoff, canonical full-game stat, unit, matching side/line identity and
quote-time provenance under the approved Guess-reference policy before a prop
could be offered. Research offer age/availability is a different contract. Do
not publish row-level validation evidence; retain it privately.

- [ ] Check current free capacity against the actual intended event/market cadence. Use `requested events × returned unique markets × effective regions/bookmaker groups` per pass, add existing collection obligations, and preserve the 50-credit reserve/lease and existing core limits. Eleven markets across sixteen games would be 176 credits per complete one-region pass if all are returned; that is a planning example, not measured usage or an approved sweep. If the current allowance cannot cover collection and retained pre-kickoff evidence, record the limitation; do not upgrade or activate a collector.
- [ ] Verify a stable current roster/event mapping and a raw result/participation/final/correction path. A numeric public stat, old team roster or absence of a row cannot establish those gates. Record precise ungraded reasons instead of inventing zeros.

Reviewable result: a timestamped capability matrix distinguishes recorded
coverage, actual eligible references, capacity and unknowns. If access or any
required path remains unresolved, `liveLockInReady` stays false.

## Task 3: Publish the decision and split the product build by dependency

**Interfaces:** Consumes the observed audit, approved spec and visual contract; produces a reviewed readiness result. Each subsequent product subsystem gets a separate implementation plan after its inputs are verified, avoiding an executable storage/UI plan built on invented provider availability.

- [ ] Update the readiness Markdown and JSON with actual results. The allowed public projection is observation time, source byte/hash metadata, stat-column coverage, aggregate capability statuses, access limitations and `liveLockInReady`. Never copy raw service responses, private memberships, guesses, player quote terms or credentials.
- [ ] Reconcile freshly fetched main and current open work before mapping the approved product requirements to the following dependent build plans. PR #508 separately reserves D-81 for NFL spread/total gap magnitudes; this feature is D-82. Its game-line calibration must not be applied to prop stats, and native-unit prop accuracy must not be normalized or combined. Do not start live-lock-in work while Task 2 is incomplete.

| Subsequent plan | Required output and acceptance |
| --- | --- |
| Native-unit prop domain | Eleven canonical full-game stat identities/units; stable event/player/stat keys; signed-yard versus nonnegative-count validation; immutable saved-reference absolute miss and stat-specific mean/count; no combined prop score |
| Guarded storage/API | Owner-only audited drafts, per-prop final/idempotent lock, server kickoff/membership/reference checks, shared cross-group identity, old-client/unapplied-schema compatibility and independent Guess-value privacy |
| Quote and actual-result receipts | Permitted quota-backed recorded books and median provenance, unchanged entry-only market presentation, retained pre-kickoff evidence, participation/finality/correction audits and explicit ungraded outcomes |
| Existing-design frontend | `web/src/next/play/PicksNest.jsx` integration with optional athlete/stat selection; typed prop-specific entry; saved/current reference separation; `web/src/next/bets/GapRecord.jsx` integration with market/athlete/stat/complete-period filters; per-stat MAE cards/charts and distinct D-77 paper results; reuse the approved UI/frame/bar |
| Review and protected release | Meaningful domain/SQL/handler/browser regressions; both-theme adjacent-screen comparison, focus/Back/end clearance; fresh exact-source CI/preservation/privacy/compatibility evidence; reviewed named migration apply and separately scoped API/worker/frontend deploy order |

- [ ] Run documentation validation and inspect exactly the named public files before committing:

```powershell
python -X utf8 scripts/check-brand-docs.py
python -X utf8 -m json.tool docs/evidence/PLAYER_PROPS_READINESS_2026_11_09.json
git diff --check
git diff --stat
```

Expected: Brand QA passes, the JSON parses and whitespace is clean. Those are
documentation checks, not passing prop domain, SQL, browser or live-source tests.
Record any external CI outage explicitly rather than bypassing required checks.

- [ ] Request independent review of the scoped docs/plan, commit reviewed named files, push the task branch, open a draft PR and run `npm run sync:check`. Report exact branch/head/PR and unpublished work. Finish the hosted-data audit and then write executable product-subsystem plans before requesting their required apply/deploy gates.

## Progress and scope

Task 1 is checked against an actual verified public source. Task 2 is blocked on
connected Supabase reauthentication and therefore the live-readiness decision is
incomplete. This plan is preparatory; no product source is changed. The accepted
Player Props design, units, optional participation and entry-only quote hiding
remain as recorded, including the mandatory shared-app visual alignment.
