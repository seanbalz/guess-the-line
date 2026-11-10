# Migration apply packet — November 10, 2026

Owner: Sean Balsiger · Version 3 · prepared from `main` at
`0944bc2003780aa88b173c6aaf99b746f273cd83` (PR #517 merge); version 2 (the apply-order
fixes PR) amends unapplied M-34 so any apply order is safe, adds M-43's boundary probes and
corrects stale records (contradictions 1, 2, 5, 6 and 7 below), and adds PR #519's
`20261110160000_gtl_player_props_jobs.sql` as proposed M-46. Version 3 adds PR #522's
`20261110180000_gtl_player_props_shared.sql` (merge `1ba75282`) as proposed M-47.

Status, November 10, 20:43 UTC: **M-41 to M-47 applied and verified** (hosted `20261110203637` to `20261110204307`; [apply record](RELEASE_2026_11_10_MIGRATIONS_M41_M47.md)). M-33, M-34 and M-35 remain unapplied. The rest of this packet is the preparation as written.

Original status: **preparation only.** Nothing in this packet has been run against the hosted
project. Supabase access was unavailable when it was written, so every hosted value
below is the **last recorded** value, not a fresh observation. Each apply still needs
Sean's named "apply M-xx", a fresh read-only preflight and the full
[Gate M](REDESIGN_BUILD_PLAN.md#42-gate-m-applying-a-migration) sequence. This packet
authorizes no apply, deploy, schedule change, secret or provider call.

## 1. What is pending

This packet covers ten repo migrations, all in `tests/migrations.mjs` `NOT_HOSTED`: the
eight listed by version 2, M-41 (added when PR #497 was reconciled with this packet) and
M-47 (added in version 3).
Every other repo
migration is in `APPLIED`.

| Ledger | File (repo version) | Bytes | SHA-256 | Replaces | Rollback file | Off switch |
| --- | --- | ---: | --- | --- | --- | --- |
| M-33 | `20261029151727_gtl_epl_stat_rechecks.sql` | 9474 | `444394a01579d3c1cb59f5e0a774e418b225f6bc6abddbde76a6cb99c0215ea3` | nothing | none | disable the `snapshot` schedule (rechecks run inside it) |
| M-34 | `20261029161613_gtl_epl_standings.sql` | 15669 | `9f8479c764eb2a7fd800740542cf2785db54b53144b32be832a69ef506148b16` | nothing | none (FIX_FORWARD) | no `standings` row exists; keep it absent/disabled |
| M-35 | `20261029162144_gtl_epl_corrected_draft_order.sql` | 15343 | `329ce872d88f76ed16e133e9d6b38a79c3400541b9c0f3ba567408ec42514baf` | nothing | none | disable `snapshot`/`settle` schedules |
| M-41 | `20261108022135_gtl_virtual_units_hundredths.sql` | 22535 | `20e4711ecc9a5134baef333825555eb9a63823905012375da6299ba775e7a876` | 3 writer bodies (section 4) | `supabase/rollback/20261108022135_gtl_virtual_units_hundredths.sql` (21637 bytes, SHA-256 `068fbc95f30bb087e833f2b68dc6c752cb9e916fdac737ee696dcef520ea6bdf`) | rollback file; capability then answers `hundredths:false` |
| **M-42** (proposed) | `20261110100000_gtl_epl_three_way_moneyline.sql` | 43676 | `60118d30f3671eb5386b5e74e5f60ada786fef75c78a93d07e52283dd72a09c4` | 4 bodies (section 4) | none (FIX_FORWARD) | `gtl_epl_three_way_ready()` answers `false` |
| **M-43** (proposed) | `20261110110000_gtl_epl_score_import.sql` | 24672 | `17f9ad5ac62114d17faefc79f9386ba64b1738515f54ef7f9137ecd40f6d3bb3` | nothing | none needed | do not call the two commissioner routes |
| **M-44** (proposed) | `20261110120000_gtl_epl_result_announcements.sql` | 15469 | `3b8dc8acb25f92d12b7cbcd310955fb099d6694f050f0af1d48a5bb03139f9f3` | nothing | none (FIX_FORWARD) | disable the `results` schedule row |
| **M-45** (proposed) | `20261110130000_gtl_player_props.sql` | 30416 | `cde5e2bd40426d42c9118f8a4ace7fce3beaaab26963eddc1d1d75eb63008795` | nothing | none needed | ships dark: `live_lock_in=false`, `GTL_PLAYER_PROPS` unset |
| **M-46** (proposed) | `20261110160000_gtl_player_props_jobs.sql` | 16309 | `31c1db1e78c96c17effcb967eb534bb3fd01ce1cc9d0ed52af99292426dc946e` | nothing | none needed | jobs stay off: `GTL_PLAYER_PROPS_JOBS` unset, no schedule, dry run by default |
| **M-47** (proposed) | `20261110180000_gtl_player_props_shared.sql` | 4073 | `e495adb74be4e624527766d20597f105d4aaae5cfb6b5cc204fc2a71ae3defae` | nothing | none needed | ships dark: `/props/shared` stays behind `GTL_PLAYER_PROPS` (unset) and the reader adds no write |

Byte counts and SHA-256 are of the files on `main` at `0944bc20` (M-46: at `f6a5409c`, PR #519;
M-47: at `1ba75282`, PR #522; M-41: of PR #497's files, unchanged by its reconciliation merges), except M-34, which version 2
amended before any apply (it was 14716 bytes, `8f8fdb5d7cf2a143d5e77b0b1ef3b2e04037ccdf25c8b861348a9939a05c8948`;
only its job-constraint statement changed, every function body and md5 is unchanged). Before an apply,
recompute them from the exact merged SHA you apply from (`wc -c`, `sha256sum`).

**Proposed ledger ids.** The [migration ledger](REDESIGN_BUILD_PLAN.md#6-migration-ledger)
ends at M-40, plus the M-41 row written by PR #497 (custom Virtual Units stakes,
`20261108022135_gtl_virtual_units_hundredths.sql`). When this packet was first written
M-41 was not on `main`; PR #497's reconciliation merge adds the file, its rollback, its
`NOT_HOSTED` line and its section below. The next free ids, in filename order, are therefore
M-42 to M-45, M-46 for PR #519's jobs file (added in version 2) and M-47 for PR #522's
shared reader (added in version 3). They are
**proposed**: none of the six authors assigned an id, and the ledger rows are not
written yet. Use them in Sean's apply phrases only after he accepts them; until then
name the file version as well (section 9).

### Records checked for M-40 (`20261103212932_gtl_epl_turn_queue`)

M-40 is **hosted** according to every repo record, and they agree:

- `tests/migrations.mjs` `APPLIED`: hosted as `20261103232119`, Supabase MCP, November 3.
- Ledger row M-40: "Applied and verified as hosted `20261103232119`".
- [Release record](RELEASE_2026_11_03_EPL_TURN_QUEUE_M40.md), `docs/SOCIAL_COMMUNITY.md`
  "November 3 M-40 apply record", `docs/RULES.md`, `docs/EPL_TURN_QUEUES_2026_11_03.md`.
- The M-39 record counts it in the 76-row history (digest `d40fdad9…08f1`), and the
  November 9 gap-period release still read 76 rows with that digest.
- M-43's header and its `NOT_HOSTED` comment both say "apply after hosted M-30 and M-40",
  which matches.

M-40 is therefore **not** in this packet. Preflight P0 still checks its body, because
M-43 calls `gtl_epl_advance_queues`.

### Contradictions and gaps found while preparing this packet

1. **Job-constraint hazard between M-34 and M-44 (blocking if order is wrong).** M-34
   rewrites `gtl_epl_jobs_schedule_job_check` to the eight jobs
   `snapshot…moneyline` **without `results`**. M-44 rewrites it to nine jobs including
   `results`. Applied in filename order (M-34 before M-44) this is fine. If M-44 is
   applied first and M-34 later, M-34 either fails (if a `results` row exists:
   `23514`, the transaction rolls back) or silently stops accepting `results` (if no row
   exists yet), which breaks `supabase/admin/epl_results_cron.sql` and any future
   re-insert. PR #512 asked that a later file include `results`; M-34 is an *earlier*
   file and did not. **Resolved in version 2:** M-34 is unapplied, so it was amended in
   place (no fix-forward file needed; it stays in `NOT_HOSTED` and `FIX_FORWARD`). Its
   constraint statement is now an order-safe widening: the new check is M-34's own list
   plus `results` plus every job the existing constraint already accepts, so applying it
   before or after M-44 (or after any later file that adds a job) never narrows admission
   and never fails over a saved row. `tests/epl-apply-order-sql.test.mjs` applies M-42..M-45
   then M-33/M-34/M-35 (with and without a saved `results` row), filename order, a re-run of
   M-34 and a synthetic later job, and asserts `results` is still accepted in every case.
   M-34's function bodies and md5s are unchanged; its size and SHA-256 changed (section 1).
2. **M-43 score import has no boundary probes.** M-43 adds four service-only tables and
   three RPCs (`gtl_epl_score_import_head`, `gtl_epl_import_weekly_scores`,
   `gtl_epl_score_import_state`) and two routes (`epl/admin/scores/read`,
   `epl/admin/scores/import`). None is in any `scripts/boundary/*.mjs` file, although
   Gate 4.1 requires every new RPC in its area's boundary file with `awaitingDeploy`.
   **Resolved in version 2:** `scripts/boundary/epl-score-import.mjs` (joined by
   `league.mjs`) probes the four tables, three RPCs and both routes signed out with inert
   fixtures, all `awaitingDeploy` until `20261110110000` is applied and a compatible
   `gtl-api` is deployed (`tests/epl-score-import-boundary.test.mjs`). The apply record
   removes the table/RPC entries; the route entries leave with the `gtl-api` deploy.
3. **EPL `nudge`/`fixtures` enabled state disagrees.** PR #515 says "enabling the `nudge`
   and `fixtures` schedules" is still hosted work. The October 29 records
   (`RELEASE_2026_10_29_NBA_EPL.md`, the register's EPL row) say the five original jobs
   were **enabled**. No later record shows them disabled. Treat the state as unknown and
   read it in P0 before claiming either.
4. **Ledger M-33 dependency text.** The ledger says M-33 applies after M-31; the file
   header says after M-32. Both are hosted, so this does not change the order.
5. **Ledger M-40 row was stale.** It said "independent of pending … M-39"; M-39
   has been hosted since November 3 (`20261103233404`). Corrected in version 2.
6. **`docs/SHARED_DEPLOYMENT.md` is stale on `epl-jobs`.** It says `epl-jobs` is "covered by
   local tests only until their first runs", but `RELEASE_2026_10_29_EPL_MONEYLINE.md` records a
   protected `epl-jobs` deploy (run 40937265809, worker v3). Corrected in version 2 (with
   `fantasy-ingest`'s October 28 run 40699619045, v1, from `RELEASE_2026_10_28_D59_TRENDS.md`).
7. **M-35 and M-43 interact at run time, not at apply time.** Checked in version 2: the
   eight files replace no one another's function and alter no shared column (M-46 only
   calls M-45's `gtl_props_ready`/`gtl_props_append_only` and adds triggers on its own tables;
   M-47, checked in version 3, only adds one new reader over M-45's tables and replaces nothing); the only shared DDL is
   the job constraint (contradiction 1, now order-safe). Every M-35/M-43 table and
   function applies in either order (the batch-order test applies M-35 after M-43). The
   remaining interaction is a precedence rule, the same in every apply order:
   - Both writers set `gtl_epl_weeks.pick_order` of week *n+1* under that row's lock and
     only while it is untouched: M-43's `gtl_epl_import_weekly_scores` while it is `open`,
     before `first_kickoff` and without a pick; M-35's `gtl_epl_apply_recheck_orders` (run
     by the `snapshot` job) while it is `open`, without a pick, before `first_kickoff` and
     before the admitted capture-interval cutoff, and only for a week *n* that is
     `settled` and has a changed-score `needs_review` M-33 recheck.
   - So a Tuesday recheck can replace an order that a confirmed commissioner import
     opened, and a later import (or correction import) can replace an order a recheck
     applied: the last writer wins. Each side records it append-only
     (`gtl_epl_order_corrections.previous_order`, `gtl_epl_score_import_openings`), so
     nothing is lost (D-23), but the commissioner's reviewed order is not protected.
   - No guard was added: deciding which source wins (reviewed screenshot totals or the
     Sleeper correction recheck) is Sean's rule, and a guard would need a new M-35 outcome
     value and a changed M-35 body. Until he rules, keep Tuesday correction rechecks
     undispatched after an import (the packet already says not to dispatch them on M-33
     alone), or apply M-33/M-35 only after that rule is written.
   - M-35 also intentionally pauses automatic finals/next-week opening without verified
     interval evidence ([operator prerequisite](EPL_FINALIZATION_ORDER_2026_10_29.md));
     M-43's import opening does not read capture intervals, so it still opens the next
     week while automatic opening is paused.

## 2. Apply order

Dependencies (file headers, ledger and the PR bodies):

| Migration | Needs (hosted unless marked) | Must come before |
| --- | --- | --- |
| M-33 | M-31, M-32 | M-34 (ledger), M-35 (`REQUIRES`) |
| M-34 | **M-33 (pending)** | — (order-safe against M-44 since version 2) |
| M-35 | **M-33 (pending)**; operator interval prerequisite | — |
| M-41 | M-11 and the existing Virtual/Recommended writers; compatible `gtl-api`/Pages | — |
| M-42 | M-30, M-31, M-32, M-36 | — |
| M-43 | M-30, M-40 | — |
| M-44 | M-30, M-36 | — |
| M-45 | none | M-46, M-47 (`REQUIRES`) |
| M-46 | **M-45 (pending)** | — |
| M-47 | **M-45 (pending)**; hosted `gtl_community_member` (`20261009120000_gtl_community_feed`) | — (independent of M-46) |

A topological order that is also filename order (Gate M step 1):

1. **M-33** `20261029151727`
2. **M-34** `20261029161613`
3. **M-35** `20261029162144`
4. **M-41** `20261108022135`
5. **M-42** `20261110100000`
6. **M-43** `20261110110000`
7. **M-44** `20261110120000`
8. **M-45** `20261110130000`
9. **M-46** `20261110160000`
10. **M-47** `20261110180000`

**Recommended batch when Supabase is back:** M-42, M-43, M-44, M-45, M-46, M-47 in that order
(M-46 and M-47 only after M-45; they do not depend on each other). None of them reads M-33/M-34/M-35. M-41 is independent of all of
them (it touches only the three Virtual Units writers) and may go before or after that
batch; it needs its own compatible `gtl-api`/Pages deploy first. M-33 to M-35 have their own unresolved operator
prerequisites (M-35's interval evidence, M-33 "not safe correction enablement" alone)
and have been held since October 29. Deferring them is allowed ("a merged file Sean
chose not to apply stays in NOT_HOSTED"). Since version 2, deferring M-34 past M-44 is
safe: amended M-34 keeps `results` and every other accepted job (contradiction 1). M-35
after M-43 still carries the run-time precedence question in contradiction 7.

Each apply is its own transaction and its own "apply M-xx". After a timeout, rerun that
migration's preflight before any retry (Gate M step 6).

## 3. Shared steps (every migration)

### Apply method used by this repo

Two methods have been used; both apply the exact merged file once and record one
history row.

- **Supabase MCP `apply_migration`** (M-32, M-36, M-40): name = the file's name without
  the version (for example `gtl_epl_three_way_moneyline`), query = the exact file
  contents from the merged SHA. The hosted version is the apply time, not the filename.
  Run the preflight guard with `execute_sql` immediately before; do not prepend it to the
  migration text (the history row must equal the file).
- **SQL editor in Sean's signed-in Chrome** (M-11, M-30, M-31, M-37, M-38, M-39): the file
  fetched in the editor tab from `raw.githubusercontent.com` at the merged SHA, its
  SHA-256 checked against section 1, then one implicit transaction: (1) a guard that
  raises unless the preflight state still holds, (2) the file, (3) the history insert
  `insert into supabase_migrations.schema_migrations(version,name,statements,created_by)
  values('<UTC yyyymmddhhmiss>','<name>',array[$gtlmig$<file>$gtlmig$],'<Sean's account>')`,
  (4) a readback. A second accidental run is refused by the guard (M-37 precedent).

Never run `npx supabase db push` against this project.

### P0. Batch preflight (read-only, once per session)

```sql
begin transaction read only;
set local statement_timeout = '15s';
select clock_timestamp() as observed_at, current_setting('server_version') as pg,
  (select count(*) from supabase_migrations.schema_migrations) as history_rows,          -- last recorded: 76
  (select max(version) from supabase_migrations.schema_migrations) as newest_version;    -- last recorded: 20261103233404 (M-39)
-- No pending file is half-applied: expect 0 rows.
select version, name from supabase_migrations.schema_migrations
where name ~ '(stat_rechecks|epl_standings|corrected_draft_order|three_way_moneyline|score_import|result_announcements|player_props|virtual_units_hundredths)'
order by version;
-- History rows for the digest (paste the JSON into the node command below).
select jsonb_agg(jsonb_build_object('version',version,'name',name) order by version) from supabase_migrations.schema_migrations;
-- EPL schedules (contradiction 3), cron entries and budget. No endpoints or capabilities.
select job, enabled from public.gtl_epl_jobs_schedule order by job;
select jobname, schedule, active from cron.job where jobname like 'gtl-epl-%' order by jobname;
select conservative_remaining, paused, updated_at from public.gtl_odds_budget where provider='the-odds-api';
-- The job constraint as hosted now (M-36 text: eight jobs, no 'results').
select pg_get_constraintdef(oid) from pg_constraint where conname='gtl_epl_jobs_schedule_job_check';
rollback;
```

History digest, comparable to the release workflow's `migrationHistorySha256`
(last recorded `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1`, 76 rows):

```sh
node --input-type=module -e "import fs from 'node:fs'; import {migrationDigest} from './scripts/release-preflight.mjs'; console.log(migrationDigest(JSON.parse(fs.readFileSync(0,'utf8'))))" < history.json
```

If the history is not 76 rows with that digest, stop and reconcile what changed before
continuing. The readiness mode of the Shared production release workflow reports the
same digest without the SQL editor.

EPL function bodies against the applied ledger, in one SELECT (no player data):

```sh
node scripts/epl-operations-preflight.mjs            # expected = hosted ledger; every row source_matches = true
node scripts/epl-operations-preflight.mjs --all-source   # after the batch: expected = every repo file
```

### P1. Score hash (Gate M step 5; SQL editor as `postgres`)

The read-only connection cannot execute `gtl_ballot_pick_scores`, so run this in the SQL
editor. It returns counts and digests only. Run it immediately before and after each
apply in the same session and compare those two results; the formula is this packet's
own, so do not compare it to digests in earlier release records.

```sql
begin;
with b as (
  select x.user_id, x.season, x.week, x.mode,
         round(sum(ps.points),4) as points, count(ps.points) as scored
  from public.gtl_weekly_ballots x
  left join lateral public.gtl_ballot_pick_scores(x.season,x.week,x.mode,x.ballot,x.audit) ps on true
  group by 1,2,3,4
)
select count(*) as ballots,
       md5(string_agg(concat_ws('|',user_id,season,week,mode,points,scored), E'\n' order by user_id,season,week,mode)) as score_md5,
       (select array_agg(points order by points desc) from b where season=2026 and week=5 and mode='guess_spread') as week5_spread
       -- anchors present: 95.8 (Sean), 91.4 (Steven), 37.6 (Ben)
from b;
select count(*) as settled_vu,
       md5(coalesce(string_agg(to_jsonb(v)::text, E'\n' order by v.user_id,v.season,v.week,v.game_id,v.market),'')) as vu_md5
from public.gtl_virtual_units_picks v where v.status<>'pending';
select count(*) as vu_settlements,
       md5(coalesce(string_agg(to_jsonb(s)::text, E'\n' order by s.season,s.week,s.game_id,s.version),'')) as settlement_md5
from public.gtl_virtual_units_settlements s;
rollback;
```

None of the nine migrations in this packet writes ballots, picks or settlements during the
apply (M-41 replaces the Virtual Units writers but rewrites no row), so these must be unchanged.

### P2. Preservation hash template (read-only)

Each complete row becomes JSONB, columns a migration **adds** are removed by name so
before and after compare like for like, rows are sorted by their text, and the JSONB
array text is MD5-hashed. Counts and digests only.

```sql
-- repeat one line per table named in the migration's section
select '<table>' as t, count(*) as n, md5(coalesce(jsonb_agg(r order by r::text),'[]'::jsonb)::text) as h
from (select to_jsonb(x) /* - 'added_column' */ as r from public.<table> x) s;
```

### P3. Function and grant readback template (read-only)

```sql
select p.oid::regprocedure::text as signature, md5(p.prosrc) as body_md5, p.prosecdef as definer, p.proconfig,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authed,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname = any(array['<fn>', '...'])
order by 1;
-- expected for every new function: one row per name, definer=false, proconfig {search_path=""},
-- anon=false, authed=false, service=true

select c.relname, c.relrowsecurity as rls, (select count(*) from pg_policy where polrelid=c.oid) as policies,
       has_table_privilege('anon',c.oid,'SELECT') as anon_select,
       has_table_privilege('authenticated',c.oid,'SELECT') as authed_select,
       has_table_privilege('service_role',c.oid,'SELECT') as svc_select,
       has_table_privilege('service_role',c.oid,'INSERT') as svc_insert,
       has_table_privilege('service_role',c.oid,'UPDATE') as svc_update,
       has_table_privilege('service_role',c.oid,'DELETE') as svc_delete
from pg_class c where c.relnamespace='public'::regnamespace and c.relname = any(array['<table>', '...'])
order by 1;
-- expected for every new table: rls=true, policies=0, anon/authed false, svc_delete false
```

### After every apply (Gate M step 8)

- Record the hosted version, history row md5 (= file md5) and readbacks in a dated
  `docs/RELEASE_2026_11_xx_*.md` and the register; add the version to the release
  checklist repair list in `docs/SOCIAL_COMMUNITY.md`.
- Move the version from `NOT_HOSTED` to `APPLIED` in `tests/migrations.mjs` (keep
  `FIX_FORWARD`); add the ledger row with the accepted M-id.
- Remove that version's `awaitingDeploy` entries (only those whose deploy half is also
  done), run `check:cloud`, then `--strict` once nothing else is awaiting.

## 4. Per migration

### M-33 `20261029151727_gtl_epl_stat_rechecks`

- **Purpose:** D-68 Tuesday Sleeper recheck: service-only append-only
  `gtl_epl_stat_rechecks` and an immutable corrected snapshot; changed totals flag review.
  Preserves original snapshots, picks and orders.
- **Replaces:** nothing. New functions: `gtl_epl_recheck_due_at`
  `2a42a20e0e5aa722ba9b5ed8c909fe3d`, `gtl_epl_recheck_state`
  `a3cc736ee0c631f8830fd946a4fe8eb6`, `gtl_epl_record_recheck`
  `401facecc7fc86086382fee7246f78cc`.
- **Preflight:**
  ```sql
  begin transaction read only;
  select to_regclass('public.gtl_epl_stat_rechecks') as rechecks;                 -- null
  select to_regprocedure('public.gtl_epl_recheck_due_at(timestamptz,timestamptz)'); -- null
  rollback;
  ```
  P2 on `gtl_epl_snapshots`, `gtl_epl_weeks`, `gtl_epl_picks`, `gtl_epl_pick_history`,
  `gtl_epl_bonus`, `gtl_epl_jobs_schedule`.
- **Verify:** P3 for the three functions (md5s above) and the table (service select/insert
  only); P2 unchanged; P1 unchanged; zero recheck rows.
- **Off switch:** the recheck runs inside the existing `snapshot` job; disable `snapshot`
  only if a recheck misbehaves. Evidence is kept (D-23). Do not dispatch Tuesday
  correction rechecks on M-33 alone ([finalization order](EPL_FINALIZATION_ORDER_2026_10_29.md)).
- **Follow-up:** `scripts/boundary/guess.mjs` M-33 `awaitingDeploy` entries; compatible API
  already deployed per the October 29 records.

### M-34 `20261029161613_gtl_epl_standings`

- **Purpose:** private append-only dated community standings and immutable per-draft
  usage; widens the EPL job constraint to `standings`, `moneyline` and `results` while
  keeping every job the existing constraint accepts (version 2, contradiction 1).
- **Needs:** M-33 applied first. Before or after M-44 (order-safe since version 2).
- **Replaces:** nothing. New: `gtl_epl_standings_valid` `4fd8358341921c4e2ebc40151137a17a`,
  `gtl_epl_standings_state` `8dfadc9664f88a211f8bda1dcdb6894a`, `gtl_epl_save_standings`
  `bb520694634f6d34ca997ccc178af63f`, `gtl_epl_resolve_with_standings`
  `5110e1bb96aade8aec0d2e68d400092d`, `gtl_epl_standings_provenance`
  `c8ca113f6db43a59d7381faa5d9dae96`. Calls hosted `gtl_epl_resolve_week`
  `f5e5d5779ff93b086ea8f1ecd98c4bef`.
- **Preflight:** tables `gtl_epl_standings`, `gtl_epl_standings_usage` absent; M-33 history
  row present; and no schedule row outside the new list:
  ```sql
  select pg_get_constraintdef(oid) from pg_constraint where conname='gtl_epl_jobs_schedule_job_check';
  -- record it: M-36's eight jobs, or nine with 'results' if M-44 is applied; either is fine
  select job from public.gtl_epl_jobs_schedule order by job;   -- record; every row stays admitted
  ```
  P2 on `gtl_epl_jobs_schedule`, `gtl_epl_weeks`.
- **Verify:** P3 (5 functions, 2 tables); the constraint lists the nine jobs
  `snapshot…moneyline`, `results` plus any other job the preflight readback listed; P2 and
  P1 unchanged; no `standings` schedule row.
- **Off switch:** no `standings` row is created; leave it absent or disabled. Fix-forward;
  never narrow the constraint over saved rows.
- **Follow-up:** `scripts/boundary/league.mjs` M-34 entries; collector configuration is
  separately unauthorized.

### M-35 `20261029162144_gtl_epl_corrected_draft_order`

- **Purpose:** corrected-score recomputation of an empty next draft, append-only outcomes,
  a shared 12h / 8 × 2-credit result-read envelope and explicit capture-interval admission.
- **Needs:** M-33 (`REQUIRES` in `tests/migrations.mjs`). **Operator prerequisite before
  the apply phrase:** review that missing interval evidence intentionally stops automatic
  final captures and can prevent the next week opening; have verified interval evidence or
  a manual recovery plan. Interacts with M-43 (contradiction 7).
- **Replaces:** nothing. New: `gtl_epl_attest_capture_interval`
  `8ec52abb93c876bec23162d2a33f23c0`, `gtl_epl_capture_interval`
  `100720c54cae86de2d395bd6bd281d04`, `gtl_epl_reserve_result_read`
  `53d9324e7004d907b15e7719a8c87cf4`, `gtl_epl_apply_recheck_orders`
  `50bf2a9a3c02480866e24c5cd3425537`, `gtl_epl_order_correction_state`
  `4c6749d39276ad40b32b2041ae71bd89`. Calls hosted `gtl_community_admin`
  `1b3ac35ca7caf77450df37132e86b881` and `gtl_epl_reserve_credits`
  `14028d4ecdc63e080c581ffe244c323c`.
- **Preflight:** tables `gtl_epl_order_corrections`, `gtl_epl_result_reads`,
  `gtl_epl_capture_intervals` absent; `gtl_epl_stat_rechecks` present; P2 on
  `gtl_epl_weeks`, `gtl_epl_picks`, `gtl_epl_snapshots`, `gtl_epl_stat_rechecks`.
- **Verify:** P3 (5 functions, 3 tables); P2, P1 unchanged; no rows in the three tables.
- **Off switch:** disable `snapshot`/`settle`. Records kept.
- **Follow-up:** `scripts/boundary/epl-operations.mjs` M-35 entries; worker/API identity
  check per the finalization record.

### M-41 `20261108022135_gtl_virtual_units_hundredths`

- **Purpose:** PR #497 custom Virtual Units stakes: Custom accepts 0.01 to 100U in
  hundredths; existing positive half-unit stakes keep their domain. Adds the service-only
  capability `gtl_virtual_unit_rules()` so pre-apply or rolled-back clients stay on half
  units. Settlement, eligibility, rounding, terms/CAS, idempotency and grants unchanged.
  Full record: [VIRTUAL_UNITS_HUNDREDTHS_M41.md](VIRTUAL_UNITS_HUNDREDTHS_M41.md).
- **Needs:** hosted M-11 and the existing Virtual/Recommended writers. Independent of
  M-33/M-34/M-35 and M-42 to M-45 (no shared function or table). Sean's D-78 ROI release
  is already shipped (API v52, Pages `b3bd6187`).
- **Replaces** (verify each hosted body before apply; argument lists do not change):

  | Function | Hosted md5 that must match (header) | md5 after apply | md5 after rollback |
  | --- | --- | --- | --- |
  | `gtl_save_virtual_units_pick(uuid,text,bigint,jsonb)` | `616fcc330a7e055e183ba2ceda14099e` | `8c73ea152e5442f34b601ce1482ecba8` | `616fcc330a7e055e183ba2ceda14099e` |
  | `gtl_save_recommended_virtual_pick(uuid,integer,integer,bigint,jsonb)` | `da5c1747a0c095b4ff37a4b56053802a` | `49a4dc46b8170e1023cd160665ff245c` | `da5c1747a0c095b4ff37a4b56053802a` |
  | `gtl_place_bets(uuid,integer,integer,uuid,jsonb)` | `b8ea906c82f8fd4105c9700220e4a389` | `0bdb1aa207c2cd6ce299d5acda436e8b` | `b8ea906c82f8fd4105c9700220e4a389` |

  New functions (md5 after apply): `gtl_virtual_units_supported(numeric)`
  `a9e15697e71498d77a558fbc1aced2b8`, `gtl_virtual_unit_rules()`
  `9c8f4d5dc900aef38f595ee9da252e84` (returns `{version:1,hundredths:true}`; after
  rollback it stays, service-only, returning `{version:1,hundredths:false}`).
- **Preflight:**
  ```sql
  begin transaction read only;
  set local statement_timeout = '15s';
  select p.oid::regprocedure::text, md5(p.prosrc) from pg_proc p where p.pronamespace='public'::regnamespace
   and p.proname in ('gtl_save_virtual_units_pick','gtl_save_recommended_virtual_pick','gtl_place_bets')
   order by 1;   -- exactly 3 rows (no overloads), md5s = the "must match" column
  select to_regprocedure('public.gtl_virtual_units_supported(numeric)') as supported,   -- null
         to_regprocedure('public.gtl_virtual_unit_rules()') as rules;                   -- null
  rollback;
  ```
  P1 (Virtual Units settled results and settlements) and P2 on `gtl_virtual_units_picks`,
  `gtl_bet_versions`, `gtl_bet_receipts`, `gtl_weekly_versions`.
- **Verify:** P3 for the five functions (md5s above; service-only execute on the two new
  ones, writer grants unchanged); P2 and P1 identical; half- and cent-unit boundary probes,
  gates/CAS/replay as listed in the M-41 record. No row is rewritten by the apply.
- **Off switch:** the rollback file restores the three prior writer bodies byte for byte
  (md5 column above) and makes the capability answer `hundredths:false`; saved cent
  stakes, audits, receipts and settled results stay (D-23). The existing `bets-place`/`bets`
  feature switches remain available.
- **Deploys:** compatible `gtl-api` and Pages from the merged PR #497 SHA **before** the
  apply (they read the capability and stay on half units while it is absent).
- **Follow-up:** remove M-41's two `awaitingDeploy` entries in `scripts/boundary/bets.mjs`
  after the permission checks pass; move `20261108022135` to `APPLIED`.

### M-42 (proposed) `20261110100000_gtl_epl_three_way_moneyline`

- **Purpose:** EPL delivery stages 1-2 (PR #513): one guess per match in either the
  two-way draw-no-bet or the three-way home/draw/away market, market-aware references and
  collection (`gtl_epl_three_way_collections`), the capability `gtl_epl_three_way_ready()`
  and account-scoped EPL Bets recommendations.
- **Needs:** hosted M-30, M-31, M-32, M-36. Independent of M-33/M-34/M-35.
- **Replaces** (verify each hosted body before apply):

  | Function | Hosted md5 that must match (header) | Defined by | md5 after apply |
  | --- | --- | --- | --- |
  | `gtl_epl_save_guess(uuid,text,text,integer,boolean,timestamptz)` | `6313572abc96d5cc228927cafb3c3256` | M-32 | `39ed7fa3da46bcf2c36d6871f93f59a1` |
  | `gtl_epl_guess_board(uuid,integer,integer)` | `fb066860e7f8ae1d62cbf8ae57519ec6` | M-32 | `b3e9fb7f8b11aa1a9bf0b9a6614c6f65` |
  | `gtl_epl_resolve_pending_references(text)` | `a17965fe1bf51ae572297a96a4b7be5a` | M-32 | `405786e489467223987e0e682fde01cf` |
  | `gtl_epl_finish_moneyline_read(uuid,uuid,jsonb,jsonb,text,timestamptz)` | `df13d404443822fe91252f0e673fd20a` | M-36 | `4f5bf38294c7e84c707b00b7361195df` |

  New functions (md5 after apply): `gtl_epl_three_way_ready` `7330325ebbea3b41b64113c40e7a7d39`,
  `gtl_epl_moneyline_line` `d1b79037a29983f88e6ae28a352c4a80`, `gtl_epl_guess_market_json`
  `6d746c264d0ee25d5a61dd9c93e97cca`, `gtl_epl_write_guess` `4e91da3048b8de3b0fbbc60cce12f449`,
  `gtl_epl_save_market_guess` `e0f609aa8cc79d4f6b86711c8081ceb9`,
  `gtl_epl_save_market_guess_current` `2456784f7cb50aec89eaf9510f3e8619`,
  `gtl_epl_guess_board_markets` `5c62b4b365e8486e3c204ce0a6060f69`,
  `gtl_epl_bet_recommendations` `a87ee47850c2e04cc95cb6dff30d3844`,
  `gtl_epl_begin_moneyline_markets` `0fadf6e4c9fb0d6ca699ba44eb407659`,
  `gtl_epl_finish_moneyline_markets` `374b100b3091541deb160b47c60985a2`.
  (`gtl_epl_three_way_ready` and hosted `gtl_epl_moneyline_save_ready` share an md5
  because both bodies are `select true;`.)
- **Preflight:**
  ```sql
  begin transaction read only;
  set local statement_timeout = '15s';
  select p.proname, md5(p.prosrc) from pg_proc p where p.pronamespace='public'::regnamespace
   and p.proname in ('gtl_epl_save_guess','gtl_epl_guess_board','gtl_epl_resolve_pending_references','gtl_epl_finish_moneyline_read')
   order by 1;   -- exactly 4 rows, md5s = the "must match" column
  -- unchanged callees: guess_json 3502ed6d6e54093dc4ff4085c1f58c42, member b8449c91e2f55ebea5a9ef71b3aee754,
  -- moneyline_distance 728c32146f3a52f0760be82ce44d9c3d, moneyline_gate 036c1ac0d627fa027dbd23ef0c3d51a2,
  -- begin_moneyline_read fd6a413a49cd217eaab7dcb2bb64fed8, save_guess_current 726b6fc29938294bafee10abb08a2322
  select p.proname, md5(p.prosrc) from pg_proc p where p.pronamespace='public'::regnamespace
   and p.proname in ('gtl_epl_guess_json','gtl_epl_member','gtl_epl_moneyline_distance','gtl_epl_moneyline_gate',
                     'gtl_epl_begin_moneyline_read','gtl_epl_save_guess_current') order by 1;
  select to_regclass('public.gtl_epl_three_way_collections') as three_way_table,   -- null
         to_regprocedure('public.gtl_epl_three_way_ready()') as capability;         -- null
  select column_name from information_schema.columns where table_schema='public'
   and table_name in ('gtl_epl_guesses','gtl_epl_guess_history','gtl_epl_moneyline_attempts')
   and column_name in ('market','outcome','three_way');                             -- 0 rows
  select count(*) filter (where club is null) as null_club from public.gtl_epl_guesses;  -- 0 (shape check validates)
  rollback;
  ```
  P2 with the added columns removed so after-apply hashes compare:
  ```sql
  select 'guesses' t, count(*) n, md5(coalesce(jsonb_agg(r order by r::text),'[]'::jsonb)::text) h
    from (select to_jsonb(x)-'market'-'outcome' r from public.gtl_epl_guesses x) s
  union all select 'guess_history', count(*), md5(coalesce(jsonb_agg(r order by r::text),'[]'::jsonb)::text)
    from (select to_jsonb(x)-'market'-'outcome' r from public.gtl_epl_guess_history x) s
  union all select 'moneyline_attempts', count(*), md5(coalesce(jsonb_agg(r order by r::text),'[]'::jsonb)::text)
    from (select to_jsonb(x)-'three_way' r from public.gtl_epl_moneyline_attempts x) s
  union all select 'moneyline_collections', count(*), md5(coalesce(jsonb_agg(r order by r::text),'[]'::jsonb)::text)
    from (select to_jsonb(x) r from public.gtl_epl_moneyline_collections x) s
  union all select 'fixtures', count(*), md5(coalesce(jsonb_agg(r order by r::text),'[]'::jsonb)::text)
    from (select to_jsonb(x) r from public.gtl_epl_fixtures x) s
  union all select 'prices', count(*), md5(coalesce(jsonb_agg(r order by r::text),'[]'::jsonb)::text)
    from (select to_jsonb(x) r from public.gtl_epl_prices x) s;
  ```
  The `alter table … add column … default` statements are metadata-only and the two
  shape checks validate existing rows (all `draw_no_bet` with a club). They take a brief
  `ACCESS EXCLUSIVE` lock on `gtl_epl_guesses`/`gtl_epl_guess_history`/
  `gtl_epl_moneyline_attempts`; apply when no lock-in is in flight.
- **Verify:** P3 for the 14 functions (md5 after apply) and `gtl_epl_three_way_collections`
  (service select/insert only); P2 identical; P1 identical;
  `select market, outcome is null, count(*) from public.gtl_epl_guesses group by 1,2` is
  only `draw_no_bet / true`; zero three-way collections; `select public.gtl_epl_three_way_ready()`
  as `service_role`/`postgres` is `true`.
- **Off switch (fix-forward):**
  ```sql
  create or replace function public.gtl_epl_three_way_ready() returns boolean
  language sql stable security invoker set search_path='' as $$ select false; $$;
  ```
  `create or replace` keeps its grants; reads stay market-aware and two-way entry
  continues. Never restore the old bodies once a three-way row exists.
- **Deploys:** `gtl-api` and Pages from `2d54ae7b` (run 42744392202) are safe before the
  apply (they detect absence). Three-way references are collected by the `gtl-api` lock-in
  hook and by the `moneyline` job, so **deploy `gtl-epl-jobs` (target `epl-jobs`) from a
  green `main` SHA at or after `ddf85909`** before or right after the apply; until then
  three-way guesses can stay reference-pending. A three-way read costs 2 credits per event
  instead of 1: confirm the free allocation before relying on it.
- **Follow-up:** boundary entries in `scripts/boundary/epl-moneyline.mjs` (tables/RPCs) and
  `scripts/boundary/guess.mjs` (`gtl-api/epl/bets/read`).

### M-43 (proposed) `20261110110000_gtl_epl_score_import`

- **Purpose:** EPL delivery stage 3 (PR #515): the commissioner's reviewed Sleeper
  screenshot weekly-score import (hashes and eight reviewed scores only), audited, which
  settles the week from stored verified finals and opens the next draft.
- **Needs:** hosted M-30 and M-40 (`gtl_epl_advance_queues`). Independent of M-33/M-34/M-35
  (but see contradiction 7).
- **Replaces:** nothing. New: `gtl_epl_score_import_head` `a22c6aa5a21d63cd15128ae6a5dffb86`,
  `gtl_epl_import_weekly_scores` `0de093da0dd4ca3084edd301400c3c47`,
  `gtl_epl_score_import_state` `65752e3d00cff767fa5d196a9c55cf31`.
- **Preflight:**
  ```sql
  begin transaction read only;
  select to_regclass('public.gtl_epl_score_imports'), to_regclass('public.gtl_epl_score_import_rows'),
         to_regclass('public.gtl_epl_score_import_sources'), to_regclass('public.gtl_epl_score_import_openings');  -- all null
  select md5(prosrc) from pg_proc where pronamespace='public'::regnamespace and proname='gtl_epl_advance_queues';
  -- e24ecf47884f3b7e7be4166bbfe3e287 (M-40), one row
  select count(*) from public.gtl_memberships
   where league_id='sean-troy-luke' and role='commissioner' and active;   -- >= 1, else the writer refuses everyone
  select has_table_privilege('service_role','public.gtl_epl_bonus','INSERT') as bonus_insert,
         has_table_privilege('service_role','public.gtl_epl_weeks','INSERT') as weeks_insert,
         has_table_privilege('service_role','public.gtl_epl_weeks','UPDATE') as weeks_update;  -- all true
  rollback;
  ```
  P2 on `gtl_epl_weeks`, `gtl_epl_picks`, `gtl_epl_pick_history`, `gtl_epl_queues`,
  `gtl_epl_bonus`, `gtl_epl_managers`, `gtl_epl_snapshots`.
- **Verify:** P3 (3 functions, 4 tables, service select/insert only); P2, P1 identical;
  zero import rows. The apply itself writes nothing to EPL tables.
- **Off switch:** no rollback file (nothing replaced). While the functions are absent
  `gtl-api` answers the two routes as unavailable; once present, simply do not use the
  commissioner screen.
- **Deploys:** `gtl-api` + Pages from `2d54ae7b` (run 42744392202) carry the routes and the
  Commissioner tools screen. The first-turn push uses the existing `nudge` job and needs
  next-week fixtures from `fixtures`: read their state in P0 (contradiction 3) and enable
  only on Sean's word.
- **Follow-up:** the boundary probes exist since version 2 (contradiction 2); the apply
  record removes the table/RPC `awaitingDeploy` entries in `scripts/boundary/epl-score-import.mjs`
  and the route entries leave with the compatible `gtl-api` deploy. Real-screenshot OCR
  acceptance on a phone is still open.

### M-44 (proposed) `20261110120000_gtl_epl_result_announcements`

- **Purpose:** EPL delivery stage 4 (PR #512): durable Pick a Team result announcements
  once every fixture is verified final or postponed, one delivery row per member before any
  push, and the bounded `results` read job (≤ 4 × 2 credits a matchweek, shared 50-credit
  reserve).
- **Needs:** hosted M-30 and M-36, plus hosted `gtl_push_subscriptions` and
  `gtl_odds_budget`. Before or after M-34 (order-safe since version 2, contradiction 1).
- **Replaces:** nothing. New: `gtl_epl_results_state` `be4e248a31fdc0b3c2f1ef93088d4953`,
  `gtl_epl_reserve_final_result_read` `835c96c43f96d5bdc82a8047ee2b8fdd`,
  `gtl_epl_record_result_announcement` `4cb4c7c9254f8b8c92c98ad7cb3edc2f`. Calls hosted
  `gtl_epl_reserve_credits` `14028d4ecdc63e080c581ffe244c323c`.
- **Preflight:**
  ```sql
  begin transaction read only;
  select to_regclass('public.gtl_epl_result_announcements'), to_regclass('public.gtl_epl_result_deliveries'),
         to_regclass('public.gtl_epl_final_result_reads');                         -- all null
  select to_regclass('public.gtl_push_subscriptions'), to_regclass('public.gtl_odds_budget');  -- both present
  select count(*) as active_push from public.gtl_push_subscriptions where disabled_at is null;  -- count only
  select job from public.gtl_epl_jobs_schedule
   where job not in ('snapshot','fixtures','resolve','settle','nudge','dnb-check','standings','moneyline','results');  -- 0 rows
  rollback;
  ```
  P2 on `gtl_epl_jobs_schedule`, `gtl_epl_weeks`, `gtl_epl_fixtures`, `gtl_epl_picks`; and
  `select job, status, count(*) from public.gtl_epl_job_runs group by 1,2` before/after.
- **Verify:** P3 (3 functions, 3 tables, service select/insert only);
  `pg_get_constraintdef` lists nine jobs including `results`; no `results` schedule row and
  no `gtl-epl-results` cron yet; P2, P1 identical.
- **Off switch (fix-forward):** `update public.gtl_epl_jobs_schedule set enabled=false where
  job='results';` Announcements, deliveries and read records stay (D-23).
- **Deploys and schedule rows, in PR #512's order:** apply; deploy `gtl-epl-jobs` (target
  `epl-jobs`) and `gtl-api` from exact green CI at or after `dfda1263` (one `epl-jobs`
  deploy at or after `2d54ae7b` covers M-42 and M-44); then, on Sean's word, run
  `supabase/admin/epl_results_cron.sql` with the real project ref, which inserts the
  `results` row **disabled** and registers `gtl-epl-results` (`9-59/15 * * * *`).
  Enabling it (`update … set enabled=true where job='results'`) is a separate word from
  Sean, followed by one real run readback. THE_ODDS_API_KEY and the VAPID secrets are
  reused; no new secret.
- **Follow-up:** `scripts/boundary/epl-results.mjs` entries (the apply half; the worker
  half follows its deploy).

### M-45 (proposed) `20261110130000_gtl_player_props`

- **Purpose:** D-82 Player Props storage (PR #514): six RLS tables (capability, offers,
  append-only references, guesses, append-only audit events, append-only result versions)
  and the `gtl_props_*` functions. **Ships dark**: one capability row with
  `live_lock_in=false`; every writer refuses `GTL_PROPS_OFF`.
- **Needs:** nothing pending. PR #514 lists the readiness audit (section 8) as step 1 of
  enabling, before the apply; the SQL itself does not require it.
- **Replaces:** nothing. New (md5 after apply): `gtl_props_append_only`
  `f5e872cf2f7e4545a6eb44557c8ae3cf`, `gtl_props_offer_guard` `ca87d954b7de89e46ae77f31a36f6c7a`,
  `gtl_props_guess_guard` `0680c338f8ad07ed6acaa2c4e85542b6`, `gtl_props_ready`
  `cb7f6499d304e26c4728306c461bce2e`, `gtl_props_valid_value` `b5d900ae5b09fdbbf436c7d655dc6475`,
  `gtl_props_reference_json` `1f007222f427926b3918cd6dd0150486`, `gtl_props_guess_json`
  `2266f6eb9e6ad5ec0202db2d6f497ddd`, `gtl_props_record_offer` `4720d6e0a50e7756cedad9ee2320375b`,
  `gtl_props_record_reference` `473473ce8a1e4980cc54910b9a9c9310`, `gtl_props_record_result`
  `9129c44d688731b5a0b87a46cc2e6774`, `gtl_props_write` `f391a2a48bbfa6ed9bd87e3e0376cd5c`,
  `gtl_props_save_draft` `0d71ce6e3b164c69b5e74f3ff49e6159`, `gtl_props_lock_in`
  `478deab8b1b4fbcdd5004bb11c3f5c2f`, `gtl_props_board` `7a331c6cb2d32c1314811eec7b780e37`,
  `gtl_props_history` `88177128c62676ba6cf859433f822d57`, `gtl_props_capability`
  `19fcc173342edbb1c1577c79c5d2740b`. Calls hosted `gtl_community_member`
  `7f482474d44c9ba376b19cfc7d05353d`.
- **Preflight:**
  ```sql
  begin transaction read only;
  select c.relname from pg_class c where c.relnamespace='public'::regnamespace and c.relname like 'gtl_prop%';  -- 0 rows
  select proname from pg_proc where pronamespace='public'::regnamespace and proname like 'gtl_props_%';           -- 0 rows
  select md5(prosrc) from pg_proc where pronamespace='public'::regnamespace and proname='gtl_community_member';   -- 7f482474…
  rollback;
  ```
  P1 only (no existing table is touched).
- **Verify:** P3 (16 functions, 6 tables; `gtl_prop_capability` service select only;
  offers/guesses service select/insert/update; references/events/results service
  select/insert; no delete anywhere); triggers present:
  `select tgname from pg_trigger where tgrelid::regclass::text like 'gtl_prop%' and not tgisinternal order by 1`
  (5 rows); `select live_lock_in from public.gtl_prop_capability` is exactly one `false`
  row; P1 identical.
- **Off switch:** it is off. Do **not** set `gtl_prop_capability.live_lock_in=true`, do
  **not** set the `gtl-api` secret `GTL_PLAYER_PROPS=on`, and do **not** build Pages with
  `VITE_GTL_PLAYER_PROPS=on`; each is a separately reviewed step after the readiness audit
  and the offer/result ingestion jobs (not built). `GTL_FEATURE_OFF=player-props` pauses
  the writers if needed.
- **Deploys:** none required. `gtl-api` from `2d54ae7b` contains the routes, which answer
  404 while `GTL_PLAYER_PROPS` is unset.
- **Follow-up:** move only the table/RPC `awaitingDeploy` entries in
  `scripts/boundary/guess.mjs`; the four `gtl-api/props/*` route entries stay awaiting
  while the flag is off.

### M-46 (proposed) `20261110160000_gtl_player_props_jobs`

- **Purpose:** D-82 Player Props jobs audit trail (PR #519): two append-only, service-only
  tables for the `offers` and `results` jobs (`cloud/player-prop-jobs.mjs`,
  `scripts/player-props-jobs.mjs`): `gtl_prop_offer_reviews` (every offer candidate the
  offer job evaluated from already retained research quotes, eligible or not, with
  reasons) and `gtl_prop_result_checks` (every nflverse result observation, ungraded ones
  and correction evidence included). Neither holds a guess, draft, member or price.
  Additive only; creates no schedule and enables nothing.
- **Needs:** M-45 applied and verified first (`REQUIRES` in `tests/migrations.mjs`: its
  foreign keys name `gtl_prop_references` and `gtl_prop_offers`, its triggers use
  `gtl_props_append_only` and its capability calls `gtl_props_ready`). Independent of every
  EPL migration.
- **Replaces:** nothing. New (md5 after apply, PGlite on the merged file):
  `gtl_props_jobs_capability` `4598d0b428af93c14a584614eee11bef`, `gtl_props_record_review`
  `971547e9d89990e33b950c625a27b599`, `gtl_props_record_check`
  `f0dcb5bf4f090d83219e5a1929f67e43`, `gtl_props_jobs_state`
  `d80325082b2dbea7b512776a5fb2ec24`. Calls M-45's `gtl_props_ready`
  `cb7f6499d304e26c4728306c461bce2e` and `gtl_props_append_only`
  `f5e872cf2f7e4545a6eb44557c8ae3cf`.
- **Preflight:**
  ```sql
  begin transaction read only;
  select to_regclass('public.gtl_prop_offer_reviews'), to_regclass('public.gtl_prop_result_checks');  -- both null
  select to_regprocedure('public.gtl_props_jobs_capability()'), to_regprocedure('public.gtl_props_jobs_state(integer,integer)');  -- both null
  select proname, md5(prosrc) from pg_proc where pronamespace='public'::regnamespace
   and proname in ('gtl_props_ready','gtl_props_append_only') order by 1;   -- 2 rows, M-45's md5s above
  select to_regclass('public.gtl_prop_offers'), to_regclass('public.gtl_prop_references'),
         to_regclass('public.gtl_prop_results');                                 -- all present (M-45 applied)
  select live_lock_in from public.gtl_prop_capability;                           -- one row, false
  rollback;
  ```
  P1 only (no existing table is touched); also record the M-45 table counts
  (`select count(*)` on the six `gtl_prop%` tables) before and after.
- **Apply:** as section 3 (Supabase MCP `apply_migration` name `gtl_player_props_jobs`, or
  the SQL editor), the exact merged file once, its own transaction and its own "apply M-46".
- **Verify:** P3 (4 functions, service-only execute; 2 tables, RLS on, service
  select/insert only, no update/delete); triggers present:
  `select tgname from pg_trigger where tgrelid::regclass::text like 'gtl_prop%' and not tgisinternal order by 1`
  (7 rows: M-45's five plus `gtl_prop_offer_reviews_append_only`,
  `gtl_prop_result_checks_append_only`); zero rows in both new tables; the six M-45 table
  counts unchanged; `gtl_prop_capability.live_lock_in` still exactly one `false`; P1
  identical. `select public.gtl_props_jobs_capability()` as service answers
  `{"jobs": true, "ready": false}`.
- **Off switch:** it is off. Nothing writes these tables until an operator runs the manual
  workflow with `write`. The workflow has no schedule and does nothing unless the
  repository variable `GTL_PLAYER_PROPS_JOBS` is `on`; without the schema the jobs are a
  no-op (`schema_unavailable`). To stop after enabling: unset `GTL_PLAYER_PROPS_JOBS`
  (the variable) and, if needed, remove the two secrets. Rows stay (D-23).
- **Deploys:** none. No Edge Function or Pages deploy; no route.
- **Enabling (each a separate word from Sean, after the apply, in this order):**
  1. The apply leaves the repository secrets `GTL_PROPS_SUPABASE_URL` and
     `GTL_PROPS_SERVICE_ROLE_KEY` **unset** and the repository variable
     `GTL_PLAYER_PROPS_JOBS` **unset**. Adding the two secrets and setting the variable to
     `on` is its own approval.
  2. Research intake must already retain prop quotes for the week under its existing
     authorization; these jobs never call an odds provider or reserve credits.
  3. A **dry run** of each job (`write` false, the default): `offers` then `results` for one
     season/week, with the summary artifact (counts and reason names only) reviewed.
  4. Only then write runs, with `record_while_dark` while `live_lock_in` is false, until the
     readiness audit passes and a reviewed SQL change sets `live_lock_in`. A cron schedule
     is a separate reviewed change. See
     [the readiness record](PLAYER_PROPS_READINESS_2026_11_09.md#offer-and-result-jobs--november-10-2026).
- **Follow-up:** the apply record removes the two table and four RPC `awaitingDeploy`
  entries (`PROP_JOBS_MIGRATION`) in `scripts/boundary/guess.mjs`; none is a route.

### M-47 (proposed) `20261110180000_gtl_player_props_shared`

- **Purpose:** D-82 Player Props shared view (PR #522): one service-only reader,
  `gtl_props_shared(p_user, p_season, p_week)`, that returns other members' **locked** prop
  guesses under the existing reveal rules (D-31 as amended by D-39): a selection opens only
  when the viewer locked in that exact selection (event, stable player ID, canonical stat) or
  the event has kicked off. Only guess value, lock-in time, display name and the removed-member
  label (D-23) are returned; never a draft, saved reference, line, quote or audit row.
  Additive only: no table, row, grant on an existing object or existing function changes.
- **Needs:** M-45 applied and verified first (`REQUIRES` in `tests/migrations.mjs`: it reads
  `gtl_prop_offers` and `gtl_prop_guesses`). Also reads hosted `gtl_profiles` and
  `gtl_community_removals` and calls hosted `gtl_community_member`. Independent of M-46 and
  of every EPL migration.
- **Replaces:** nothing. New (md5 after apply, `parseFunctions` in
  `scripts/migration-functions.mjs` on the merged file): `gtl_props_shared`
  `2f2f4dcb43899626cacd547ac96b5473` (`language plpgsql stable security invoker`,
  `search_path=''`). Calls hosted `gtl_community_member` `7f482474d44c9ba376b19cfc7d05353d`.
- **Preflight:**
  ```sql
  begin transaction read only;
  select to_regprocedure('public.gtl_props_shared(uuid,integer,integer)');          -- null
  select md5(prosrc) from pg_proc where pronamespace='public'::regnamespace
   and proname='gtl_community_member';                                              -- 7f482474…
  select to_regclass('public.gtl_prop_offers'), to_regclass('public.gtl_prop_guesses'),
         to_regclass('public.gtl_profiles'), to_regclass('public.gtl_community_removals');  -- all present (M-45 applied)
  select t, has_table_privilege('service_role', t, 'select')
    from unnest(array['public.gtl_prop_offers','public.gtl_prop_guesses','public.gtl_profiles',
                      'public.gtl_community_removals']) t;                         -- all true (security invoker)
  select live_lock_in from public.gtl_prop_capability;                              -- one row, false
  rollback;
  ```
  P1 only (no existing table is touched); also record the six M-45 `gtl_prop%` table counts
  before and after.
- **Apply:** as section 3 (Supabase MCP `apply_migration` name `gtl_player_props_shared`, or
  the SQL editor), the exact merged file once, its own transaction and its own "apply M-47".
- **Verify:** P3 (1 function, md5 above; `prosecdef` false, `provolatile` `s`,
  `proconfig` `{search_path=""}`; execute for `service_role` only, none for `public`, `anon`
  or `authenticated`):
  ```sql
  select r, has_function_privilege(r, 'public.gtl_props_shared(uuid,integer,integer)', 'execute')
    from unnest(array['anon','authenticated','service_role']) r;                    -- false, false, true
  ```
  No new table or trigger (`gtl_prop%` trigger count unchanged); the six M-45 table counts
  unchanged; `gtl_prop_capability.live_lock_in` still exactly one `false`; P1 identical.
  Do not call the reader with a real member id to "test" it; the signed-out boundary probe
  is the run-time check.
- **Off switch:** it is off. The reader is reachable only through `gtl-api` `/props/shared`,
  which answers 404 while the `GTL_PLAYER_PROPS` secret is unset, and the Pages screen stays
  behind `VITE_GTL_PLAYER_PROPS`. `GTL_FEATURE_OFF=player-props` does not apply (no writer).
  If it must stop after the flag is on, unset `GTL_PLAYER_PROPS` (every Player Props route
  answers 404). No rollback file: the apply changes no data.
- **Deploys:** none required. `/props/shared` is merged in the `gtl-api` code (PR #522,
  `1ba75282`, `cloud/player-props.mjs`); before the apply it answers
  `{ available: false, selections: [] }` on PGRST202, and the Pages view draws nothing.
- **Follow-up:** the apply record removes the one RPC `awaitingDeploy` entry
  (`PROP_SHARED_MIGRATION`, `rpc/gtl_props_shared`) in `scripts/boundary/guess.mjs`; the
  `gtl-api/props/shared` route entry stays awaiting while `GTL_PLAYER_PROPS` is off.

## 5. Deploy state of the code these migrations go with

| Item | State at time of writing |
| --- | --- |
| PR #511 (prior-week card) | Deployed: frontend, run 42733238277 from `0f656617` (success). |
| PRs #512–#515 (+ test-only #516) | In api-and-frontend run 42744392202 from `2d54ae7b`, **waiting for approval**. |
| PR #517 (fantasy defense) | Merged `0944bc20`; frontend not deployed; data arrives with the next scheduled Fantasy refresh. |
| `gtl-epl-jobs` | Last recorded v3 (October 29, `epl-jobs` deploy run 40937265809 from `d891291c`). M-42's timed three-way collection and M-44's `results` job need a new `epl-jobs` deploy. |
| PR #519 (Player Props jobs) | Merged `f6a5409c`. No Edge Function or Pages deploy is needed; the manual `player-props-jobs.yml` workflow runs only from `main` with `GTL_PLAYER_PROPS_JOBS=on` (unset). |
| PR #522 (Player Props shared view, History, receipt) | Merged `1ba75282`, not deployed. `/props/shared` shipped in the `gtl-api` code with an `available:false` fallback while `gtl_props_shared` is absent (PGRST202); all Player Props routes stay 404 while `GTL_PLAYER_PROPS` is unset. Needs no deploy before the M-47 apply. |
| PR #497 (M-41 custom Virtual Units) | Merged code not deployed; needs `gtl-api` + Pages before the M-41 apply. |
| Migrations M-33…M-35, M-41, M-42…M-47 | **Not applied.** |

Gate D order for these: compatible `gtl-api`/Pages first (run 42744392202), worker
(`epl-jobs`), then the SQL applies, then admin schedule rows. All new API code detects an
absent schema (PGRST202) and stays on the legacy path.

## 6. Things not to do

- Do not apply the version 1 text of M-34 (`8f8fdb5d…`) after M-44; apply only the amended
  file from a merged SHA at or after version 2 (contradiction 1).
- Do not enable `results`, `nudge`, `fixtures`, `standings` or Tuesday rechecks as part of
  an apply; each is its own word from Sean.
- Do not set `GTL_PLAYER_PROPS`, `VITE_GTL_PLAYER_PROPS` or `live_lock_in`.
- Do not add the `GTL_PROPS_SUPABASE_URL`/`GTL_PROPS_SERVICE_ROLE_KEY` secrets, set
  `GTL_PLAYER_PROPS_JOBS`, add a schedule to `player-props-jobs.yml` or run it with `write`
  as part of the M-46 apply.
- Do not set `GTL_PLAYER_PROPS` or call `/props/shared` with a real member as part of the
  M-47 apply.
- Do not submit real picks, guesses or imports to manufacture acceptance.
- Do not `db push`, drop, delete or truncate anything (D-23).

## 7. Post-batch check

After the last apply of the batch and its record PR:

```sh
node scripts/epl-operations-preflight.mjs           # every EPL row source_matches = true against the new ledger
npm run check:cloud                                  # signed-out probes; only deploy-half entries may remain awaiting
```

## 8. Player Props readiness — Task 2 read-only queries

From [the readiness plan](superpowers/plans/2026-11-09-player-props-readiness.md) Task 2,
unchanged. Run on the intended project (confirm `SUPABASE_PROJECT_REF` from the release
configuration first) with an authenticated administrator. Do not request or copy
passwords or service keys, bypass RLS or invoke mutating RPCs. Keep quota amounts and
project metadata out of the public report; record only capacity status and observation
time in `docs/PLAYER_PROPS_READINESS_2026_11_09.md` and
`docs/evidence/PLAYER_PROPS_READINESS_2026_11_09.json`.

**2a. Schema presence and budget row** (does not reserve credits, refresh the provider,
take a lease or reset budget state):

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

Expected: one verified project, both tables present, one budget row. Absent or
unauthorized is "not ready", not zero.

**2b. Retained prop-quote coverage, last 7 days** (aggregate counts and timestamps only;
three recorded books is not an eligible scoring reference):

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

Expected: a measured coverage matrix or an observed empty result. Neither proves
eligibility; row-level validation stays private.

**2c. Capacity (arithmetic, no query that spends):** `requested events × returned unique
markets × effective regions/bookmaker groups` per pass, plus existing collection
obligations, keeping the 50-credit reserve and core limits. Eleven markets × sixteen games
= 176 credits per complete one-region pass is a planning example only. If the allowance
cannot cover it, record the limitation; do not upgrade or activate a collector.

**2d. Roster/event mapping and result path:** verify a stable current roster/event mapping
and a raw result/participation/final/correction path. A numeric public stat, an old roster
or a missing row does not establish them; record precise ungraded reasons.

If access or any path stays unresolved, `liveLockInReady` stays **false**.

## 9. Sean says — checklist

Each phrase is its own approval, given after that migration's preflight passes. The M-42
to M-47 ids are proposed; until Sean accepts them, say the file version too.

Recommended batch (section 2):

1. "Approve deploy run 42744392202" (compatible `gtl-api` + Pages first; not an apply).
2. "Deploy epl-jobs" from a green `main` SHA at or after `2d54ae7b` (not an apply).
3. "apply M-42" (`20261110100000`, three-way moneyline)
4. "apply M-43" (`20261110110000`, score import)
5. "apply M-44" (`20261110120000`, result announcements)
6. "Run epl_results_cron.sql" (creates the `results` row disabled), then, separately,
   "Enable results".
7. "apply M-45" (`20261110130000`, Player Props, stays dark). Not followed by any
   `GTL_PLAYER_PROPS` or `live_lock_in` change.
8. "apply M-46" (`20261110160000`, Player Props jobs audit tables), only after M-45's
   verification. Not followed by any secret, variable, schedule or write run; those are
   the separate enabling words in M-46's section.
9. "apply M-47" (`20261110180000`, Player Props shared reader, stays dark), only after
   M-45's verification (before or after M-46). Not followed by any `GTL_PLAYER_PROPS`,
   `VITE_GTL_PLAYER_PROPS` or `live_lock_in` change.

Only if Sean also wants the October 29 EPL corrections/standings (any time after the batch
or before it; see contradiction 7 for M-35 after an import):

- "apply M-33" (`20261029151727`)
- "apply M-34" (`20261029161613`), the amended file, before or after M-44
- "apply M-35" (`20261029162144`), only after the operator interval prerequisite is reviewed

Independently, for custom Virtual Units stakes (PR #497): "Deploy api-and-frontend" from the
merged PR #497 SHA, then "apply M-41" (`20261108022135`).

Full filename order if everything goes: apply M-33, apply M-34, apply M-35, apply M-41, apply M-42,
apply M-43, apply M-44, apply M-45, apply M-46, apply M-47.
