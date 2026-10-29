# EPL standings integration source — October 29, 2026

Status: **source implementation; M-34 is not applied, collection is not enabled, and hosted acceptance is open.** This
work connects the bounded community-source adapter to private persistence and the strict deadline resolver in source.
No sports-provider request, signup, hosted write, migration/history apply, job enablement or deployment was performed
by this integration lane. Tests use the previously captured, licensed fixture and disposable local databases.

The source includes the release owner's authoritative M-32 apply record (hosted `20261029162422`) and preserves its
APPLIED entry and live-boundary probes. M-32's deployment/apply evidence does not establish M-33 or M-34 completion.

## Collection and storage

M-34 was generated with the repository's installed Supabase CLI as
`supabase/migrations/20261029161613_gtl_epl_standings.sql`. It adds private, RLS-protected, service-only tables:

- `gtl_epl_standings`: append-only normalized snapshots with season, completed round, capture/data dates, source revision
  and the full bounded source/license/change-notice record. Exact replay is idempotent; a different payload cannot replace
  the same snapshot identity. The service role cannot update or delete rows.
- `gtl_epl_standings_usage`: one immutable snapshot reference per draft whose resolution needed table positions, including
  the claimed run and use time. Later captures cannot replace that reference.

The migration widens the schedule check for a separate `standings` job. It creates **no schedule row** and enables
nothing. It is explicitly fix-forward: stop collection by disabling its row and retain captured evidence and usage.
Apply order follows M-33; the shared migration ledger keeps M-34 in `NOT_HOSTED` and `FIX_FORWARD`.

The separate admin-only `supabase/admin/epl_standings_cron.sql` is a future configuration step: it creates the row disabled
and registers one daily cron entry. It is not automatically run. Separate apply/release/readback and explicit enablement
are required before any collection. Existing five/six job rows and their enabled states are not changed.
Do not replay `epl_jobs_cron.sql` as part of standings setup: that broader script contains a separate DNB block. M-32 apply
did not authorize creating or enabling a DNB row/cron. Standings setup uses only its own reviewed standalone file.

When separately enabled, the job checks private SQL state before any request, collects only for an open draft before its
first kickoff, requires the previous complete round, and skips a fresh same-day capture. It makes one free bounded
Wikimedia read, without retry or alternate-provider calls. Invalid/stale/incomplete/unmapped responses are not persisted.
It never reserves or records Odds API credits, and does not relax the shared 50-credit reserve on the existing paid jobs.

## Deadline behavior and compatibility

The resolver first tries the existing queue and price rules with strict position requirements. If those choices are
decisive, it performs no standings read and uses the existing writer. Neither missing standings nor a failed standings
service becomes an unrelated dependency for that path.

Only an actual position dependency reads `gtl_epl_standings_state`. The worker and database validate the dated record
again: known 20-club set, unique integer positions 1–20, requested season/completed round, points/W-D-L/goals arithmetic,
unambiguous ordering, source revision and license metadata, capture age of at most 24 hours and source-date age of at most
seven days. The database uses UTC for the source-date boundary. A later capture cannot make an old data date current.
Only a snapshot observed before the deadline is eligible. Partial/postponed rounds, unsupported adjustments and unresolved
ranking ties remain unavailable; there is no club-code substitution for a missing table.

`gtl_epl_resolve_with_standings` locks the week, revalidates the same latest eligible snapshot at use time, resolves through
the existing writer and stores the immutable usage link in one transaction. Stale/conflicting evidence writes no picks
and returns the run to `needs_review`. Exact replay preserves the original link. Entered picks and queues are preserved.
Resolution never fetches a replacement table after kickoff.

Before M-34 apply, only the exact missing optional entry returns `GTL_EPL_STANDINGS_OFF`; dependent choices become
`needs_review`. Permission, transport and nested SQL failures are not classified as an unapplied feature. Existing jobs
continue safely. The centralized optional-RPC map also preserves the agreed M-33/M-35 snapshot compatibility entries;
this does not apply those migrations or run their new operations.

## Provenance in the current child card

An authenticated closed-draft read may retrieve `gtl_epl_standings_provenance`: source/date and attribution for a reference
actually used by that draft. It does not return the full table, run credentials or additional player information. On old
schema, the exact absent reader leaves the existing board available. Historical references retain attribution after their
freshness window ends; they are not labelled current.

The Pick a Team child card shows the saved table date and uses the existing InfoButton/About sheet for Wikimedia
contributor credit, community-data status, changes and the CC BY-SA 4.0 source/license links. It makes no claim of independent
official Premier League verification. No EplApp, SportEntry, shared Frame, profile or sport-switch behavior is changed.
The derived data license remains separate from independently written application code and private player data. The
[capture/license review](EPL_STANDINGS_READINESS_2026_10_29.md) records the precise source and alternative-provider evidence.

## Boundary and verification evidence

All two new private tables and five new RPCs have inert anonymous boundary probes, marked awaiting the specific M-34
apply/release. A pending table may report only exact 404/PGRST205; a pending RPC only exact 404/PGRST202. Missing is
reported as awaiting, not denied. Strict mode rejects absence, and accidentally granted responses always fail. The shared
checker change and generic regressions are isolated in `7f8900eda5fd02944726f953650322d93ae1f068`; the integration agent's
generic pending-migration assertions are retained too.

The release owner's earlier live 393-probe M-32 result is historical evidence for that baseline. New M-34 probes and local
mock denial tests do **not** establish any live M-34 boundary. A future apply owner must verify the expanded strict live
set and remove only the actually applied M-34 pending descriptors with its authoritative release record.

Local checks at this source stage:

- 424 targeted Node tests passed, zero skips: EPL, real PGlite schema/worker/persistence/resolver flows, migration/rollback
  and boundary suites. The worker tests cover old M-30/M-31 five-job and M-32/M-33 six-job capability paths before/after
  M-34, disabled/cache-hit/no-provider paths, preserved budget, exact missing-entry handling and stale-at-use rejection.
- 62 combined EPL/commissioner UI tests passed, including 25 Pick a Team tests covering source/date/About credit, valid links and malformed-provenance rejection.
- Typecheck, 14 token checks, Brand QA, cloud build and bundle-only privacy verification passed. The existing large-chunk
  build warning remains. Full live verification and M-34 CI remain separate from these local results.

## Still required for operational completion

1. Review the exact integration source and green CI, including the canonical release owner's changes.
2. Complete Gate M preflight/apply/readback for M-33/M-34 in dependency order, preserving existing data and grants.
3. Release compatible worker/API/frontend source through the existing release process and verify old/new schema paths.
4. Separately authorize and configure the disabled collection job, then enable it only after those gates.
5. Verify a real complete dated community-source capture, private persistence, deadline use/reference and visible source
   credit without using a historical fixture as current. Exercise missing/stale evidence and the expanded strict boundary.

The workflow remains open at these hosted gates. Local tests are not collection, deployment or real matchweek acceptance.
