# Migrations M-41 to M-47 — apply record, November 10, 2026 UTC

**Applied and verified.** Seven migrations from the
[November 10 apply packet](MIGRATION_APPLY_PACKET_2026_11_10.md) are now hosted:
custom Virtual Units stakes in hundredths, EPL three-way moneyline, the EPL Sleeper
score import, EPL result announcements and the Player Props storage, jobs and shared
reader. Everything ships in the state the packet planned: the three-way capability
answers `true`; Player Props stays dark (`live_lock_in` false, `GTL_PLAYER_PROPS`
unset); no `results` schedule row exists; no job, secret, variable or flag changed.

Sean approved the batch and the route with **"Yes, apply M-41–M-47"**, answering a
question that named the Supabase SQL editor in his signed-in Chrome. His phrase also
accepts the packet's proposed ledger ids M-42 to M-47. M-33, M-34 and M-35 were not
part of the approval and stay unapplied.

## Before the applies

- **Compatible code was already live.** The `api-and-frontend` release
  [42765795305](https://github.com/seanbalz/guess-the-line/actions/runs/42765795305) from
  `1ba752821bddacedb725c0ebef2f9929827481d2` (`gtl-api` v54) and the `epl-jobs` release
  [42834904659](https://github.com/seanbalz/guess-the-line/actions/runs/42834904659) from the same
  source ([final batch record](RELEASE_2026_11_10_FINAL_BATCH.md)). That source contains PRs #497
  (M-41), #512–#515 (M-42 to M-44), #519 (M-46) and #522 (M-47).
- **Batch preflight (read-only, 20:27:39 UTC).** 76 history rows, newest `20261103233404` (M-39),
  digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1` (unchanged since the
  final batch release), 0 half-applied rows. All seven EPL schedules (`dnb-check`, `fixtures`,
  `moneyline`, `nudge`, `resolve`, `settle`, `snapshot`) are enabled, with seven active `gtl-epl-*`
  cron jobs. This settles packet contradiction 3: `nudge` and `fixtures` are enabled.
- **Per-migration preflights (read-only) matched the packet.** All 7 replaced bodies and 9 kept
  callee bodies matched. No new object existed. The `sean-troy-luke` league has one active
  commissioner, and there are 2 active push subscriptions. No job row is outside the nine-job list.
- **Files.** All ten pending files on `main` at `3ddc36d83aeb014efc7c448bf21d9fe22d1edeab` matched
  the packet's byte counts and SHA-256. The seven applied files contain no transaction statements and
  have LF line endings.

## Method

Each migration ran alone, in order, as one implicit transaction in the SQL editor as `postgres`.
The page fetched the file from `raw.githubusercontent.com` at `3ddc36d8` and refused it unless its
SHA-256 matched. Each transaction ran these steps in order:

1. Took the score hash (packet P1) and the preservation hashes (P2) into a temporary table. Where
   relevant, this included the md5 and grants of the functions the migration calls but does not
   replace.
2. Ran a guard. It stops the transaction unless:
   - the history row count is as expected;
   - the migration name is not already in history;
   - every body to replace or keep matches the packet's md5;
   - every new function and table is absent;
   - the packet's other preflight conditions hold.
3. Ran the exact file.
4. Inserted the history row: version is the UTC apply time, `statements` is the file, `created_by`
   is Sean's account.
5. Took the same hashes again and stopped the transaction if any differed. Then it checked:
   - the history row's md5 equals the file's;
   - every new or replaced function has exactly one row, the packet's md5, security invoker and
     service-only execute;
   - every new table has RLS on, no policies, no anon or authenticated select or insert, and no
     service delete;
   - each migration's own checks listed below.

The editor warned "Potential issue detected: creates tables without enabling Row Level Security".
The tables it meant were the two `on commit drop` temporary hash tables. **Run without RLS** was
chosen, so the query ran exactly as written. Each commit was then read back independently through
the read-only Supabase connector.

## Results

| Ledger | File | Hosted version | `statements` md5 (= file) |
| --- | --- | --- | --- |
| M-41 | `20261108022135_gtl_virtual_units_hundredths` | **`20261110203637`** | `8c3360b46c27b405f2a4c96087ca0200` |
| M-42 | `20261110100000_gtl_epl_three_way_moneyline` | **`20261110203759`** | `c78b960d1bdf4a3ddf37597385f5b3b2` |
| M-43 | `20261110110000_gtl_epl_score_import` | **`20261110203856`** | `b840ec1963369e5a02948dade0be120c` |
| M-44 | `20261110120000_gtl_epl_result_announcements` | **`20261110203957`** | `afc082615d4cff72dd89333ef85e781b` |
| M-45 | `20261110130000_gtl_player_props` | **`20261110204106`** | `0793ac03f0e23c309301b01e6f9e35c0` |
| M-46 | `20261110160000_gtl_player_props_jobs` | **`20261110204207`** | `4e78229b2aeb6191edc9874c50a37116` |
| M-47 | `20261110180000_gtl_player_props_shared` | **`20261110204307`** | `3a068865ffdf7054fc3f1d355494befa` |

History went from 76 to **83** rows. Each row's `created_by` is `sbalsiger2@gmail.com`. The new
digest is **`3eb690d75c75068443d8fe7c791a779534597bb655078f14742a64c9176de022`**. It was computed
read-only with the SQL equivalent of `migrationDigest`, the same formula that reproduced the
previous `d40fdad9…` digest.

Per migration, beyond the common checks (all post-apply md5s are the packet's "after" values):

- **M-41.** Five functions: the three writers `8c73ea15…`, `49a4dc46…` and `0bdb1aa2…`, plus
  `gtl_virtual_units_supported` `a9e15697…` and `gtl_virtual_unit_rules` `9c8f4d5d…`.
  `gtl_virtual_unit_rules()` = `{"version":1,"hundredths":true}`. No row was rewritten.
- **M-42.** Fourteen functions (4 replaced, 10 new). The six kept callees were unchanged.
  - All 71 guesses are `draw_no_bet` with no outcome.
  - `gtl_epl_three_way_collections` has 0 rows, RLS on and service select/insert only.
  - `gtl_epl_three_way_ready()` is `true`.
- **M-43.** Three functions. `gtl_epl_advance_queues` unchanged at `e24ecf47…`. Four import tables:
  RLS on, 0 policies, service select/insert only, 0 rows.
- **M-44.** Three functions. `gtl_epl_reserve_credits` unchanged.
  - The job constraint now lists nine jobs, including `results`.
  - There is no `results` schedule row and no `gtl-epl-results` cron.
  - Three result tables: RLS on, service select/insert only, 0 rows.
  - The seven schedules and the job-run counts were unchanged.
- **M-45.** Sixteen `gtl_props_*` functions, each matching the packet. Six tables:
  - `gtl_prop_capability`: service select only.
  - Offers and guesses: service select, insert and update.
  - References, guess events and results: service select and insert.
  - No delete anywhere.
  - Five triggers. One capability row, `live_lock_in = false`. No other prop rows.
  - `gtl_community_member` unchanged.
- **M-46.** Four functions. Two audit tables: service select/insert only, 0 rows.
  - Seven `gtl_prop%` triggers.
  - `gtl_props_jobs_capability()` = `{"jobs":true,"ready":false}`.
  - M-45 table counts unchanged; `gtl_props_ready` and `gtl_props_append_only` unchanged.
- **M-47.** `gtl_props_shared(uuid,integer,integer)` `2f2f4dcb…`: stable, security invoker,
  `search_path=""`, execute for `service_role` only (none for public, anon or authenticated).
  - No table or trigger change. M-45 counts unchanged. `live_lock_in` still false.
  - Not called with a real member id.

### Preservation

The score hash is identical before and after every apply:

| Hash | Value |
| --- | --- |
| Ballots | 46 ballots, `db10ee1cdea0a8a4d71c1e8fa7700740` |
| Week 5 Spread | `{128.0, 95.8, 91.4, 52.0, 37.6}` (anchors 95.8, 91.4 and 37.6 present) |
| Settled Virtual Units results | 7, `9cc9ac8b90c55e3b5b4f662157fa8cb0` |
| Settlements | 72, `39a749fcfc47d9309e053512867f4d43` |

The preservation hashes are identical inside each transaction:

| Migration | Table | Rows | Hash |
| --- | --- | ---: | --- |
| M-41 | `gtl_virtual_units_picks` | 7 | `0008b4d1…` |
| M-41 | `gtl_bet_versions` | 0 | |
| M-41 | `gtl_bet_receipts` | 0 | |
| M-41 | `gtl_weekly_versions` | 27 | `04f4bf77…` |
| M-42 | `gtl_epl_guesses` (without new columns) | 71 | `1a928270…` |
| M-42 | `gtl_epl_guess_history` (without new columns) | 72 | `7d488538…` |
| M-42 | `gtl_epl_moneyline_attempts` (without new columns) | 111 | `637cd961…` |
| M-42 | `gtl_epl_moneyline_collections` | 107 | `2a3a4b5a…` |
| M-42, M-44 | `gtl_epl_fixtures` | 20 | `2bae5539…` |
| M-42 | `gtl_epl_prices` | 80 | `90350678…` |
| M-43, M-44 | `gtl_epl_weeks` | 2 | `9fb198b0…` |
| M-43, M-44 | `gtl_epl_picks` | 16 | `2ce739f9…` |
| M-43 | `gtl_epl_pick_history` | 16 | `85dcca73…` |
| M-43 | `gtl_epl_queues` | 5 | `93e3c086…` |
| M-43 | `gtl_epl_bonus` | 3 | `461f00c3…` |
| M-43 | `gtl_epl_managers` | 8 | `5763cd0a…` |
| M-43 | `gtl_epl_snapshots` | 17 | `99053a39…` |
| M-44 | `gtl_epl_jobs_schedule` | 7 | `041a1f6c…` |

Nothing was deleted, truncated or rewritten (D-23).

## After the applies

- **Boundary check.** `npm run check:cloud` (signed-out, inert fixtures) gave **495 live denials**.
  Every M-41 to M-47 table and RPC, and the EPL score-import and `epl/bets/read` routes, is denied to
  anonymous callers. 24 entries remain awaiting:
  - M-33, M-34 and M-35, which are not applied;
  - the five `gtl-api/props/*` routes, which answer 404 while `GTL_PLAYER_PROPS` is off.

  `--strict` therefore still fails by design.
- **EPL jobs.** `resolve`, `nudge`, `moneyline` (nothing due) and `snapshot` ran normally from
  20:37 to 20:49 UTC on the new schema. All edge calls to `gtl-epl-jobs` returned 200.
- **Records.** In `tests/migrations.mjs`, the seven versions moved from `NOT_HOSTED` to `APPLIED`,
  and the M-46/M-47 `REQUIRES` entries left. The `awaitingDeploy` entries for the applied tables and
  RPCs left `scripts/boundary/bets.mjs`, `epl-moneyline.mjs`, `epl-results.mjs`,
  `epl-score-import.mjs` and `guess.mjs`; so did the deployed `epl/bets/read` and score-import routes.
- **Two rules conflicted for the Player Props routes.** The packet keeps the five `gtl-api/props/*`
  route entries awaiting while the flag is off. `tests/cloud-boundary.test.mjs` allowed an awaiting
  entry only when it named a migration still in `NOT_HOSTED`, which M-45 no longer is.
  - **Chosen:** the test now accepts a second kind of entry, `flag GTL_PLAYER_PROPS`, and only for
    `gtl-api/` routes. The routes still probe; their 404 is reported as awaiting, never as denied.
  - **Not chosen:** dropping the route probes, which would leave no check when the flag turns on.
  - **Cleanup:** remove the flag entries when `GTL_PLAYER_PROPS` is enabled.
- **Tests now match the hosted state:**
  - The M-42, M-45 and M-46 source tests assert the files are applied.
  - `tests/virtual-units-hundredths.test.mjs` builds its upgrade and rollback world with
    `without(HOSTED, M-41)`, so it still starts from the schema before M-41.
  - The recommendation writer's "malformed amount" example changed from 0.25 to 0.001, because
    0.25 is a valid cent stake on the hosted schema.
- **Local-only test failure.** `tests/epl-three-way-compat.test.mjs` fails on this PC's Node 24, which
  prints `ℹ fail 0` instead of the `# fail 0` the test looks for. The nested suites pass (30 pass,
  0 fail). CI uses Node 22 and passes it on `main`.

## Still off or open

- **EPL results job.** Created switched off at 21:19 UTC on Sean's "Yes, next". The script was
  `supabase/admin/epl_results_cron.sql` from `3ddc36d8` (SHA-256 `fd2a64a6…`), with the project ref
  filled in, run in one guarded SQL-editor transaction.
  - The `results` row is disabled; its endpoint is the same `gtl-epl-jobs` URL as the other seven
    jobs.
  - The `gtl-epl-results` cron is active at `9-59/15 * * * *`. While the row is off, each dispatch
    returns `disabled` without a run row or HTTP call.
  - The other seven schedules are unchanged, and there are 0 `results` runs so far.
  - **Enabled** at 00:06 UTC on November 11 on Sean's "Yes, enable it", through one guarded
    SQL-editor update. All eight EPL jobs are now on.
  - **First real run** at 00:09:00 UTC succeeded in under a second. It announced Matchweek 10:
    2 winners, 1 opted-in member, 1 push sent, 0 failed.
  - It made 0 final-result reads, because the finals were already stored, so it spent no odds
    credits (budget still 186, not paused).
  - Off switch: `update public.gtl_epl_jobs_schedule set enabled=false where job='results';`.
    Announcements and deliveries stay (D-23).
- **Player Props stays dark.** Turning it on is a set of separately reviewed steps:
  - the readiness audit (packet section 8);
  - jobs: the `GTL_PROPS_*` secrets, the `GTL_PLAYER_PROPS_JOBS` variable, a dry run, then write runs;
  - `live_lock_in`;
  - the `GTL_PLAYER_PROPS` and `VITE_GTL_PLAYER_PROPS` flags.
- **EPL three-way.** It is offered from now on. A three-way read costs 2 odds credits per event.
  The budget showed 186 conservative credits remaining, not paused.
- **M-33, M-34 and M-35.** Still held. M-35 needs its interval prerequisite, and Sean's ruling on
  import-versus-recheck precedence (packet contradiction 7) remains open.
- **Signed-in readback.** This record has no signed-in route evidence. No signed-in request reached
  `gtl-api` during the readback window. The first signed-in uses should be checked in the function
  logs for 2xx on:
  - `/bets/*` with a cent stake;
  - `/epl/*` with a three-way guess and `epl/bets/read`;
  - `epl/admin/scores/*`.
- **Phone acceptance** of custom stakes, three-way entry and the screenshot import remains open.

## Signed-in readback (view only)

After the applies, the live app was opened in Sean's signed-in Chrome to look only. No pick, stake
or import was made, and the hosted counts stayed the same: 7 Virtual Units picks, 71 EPL guesses
and 0 three-way rows. All of the following were executed:

| Request | Status | What the screen shows |
| --- | --- | --- |
| `bets/read` | 200 | The slip has the "Custom units" field and 0.1-unit steppers. M-41 is live. A test pick was added to the unsaved slip, then removed without placing. |
| `epl/guess/read` | 200 | Guess the Line offers "Draw no bet (draw = push) or 3-way (home, draw, away)". M-42 is live. |
| `epl/bets/read` | 200 | EPL Bets renders for Matchweek 10. |
| `epl/admin/scores/read` | 200 | Commissioner tools › Premier League weekly scores shows the Sleeper screenshot import. M-43 is live. |

No save, three-way guess, cent stake or import has been made through the app yet, and no phone
check has been done.

## Change breadcrumb

- **Session ID:** `42c1a86c-29dd-4d40-97ed-ff24c1f9c022`
- **Agent:** AI Agent (Claude Code, desktop app)
- **Timestamp:** applies 2026-11-10 20:36:37–20:43:07 UTC
- **Device:** Windows
- **Repository:** `seanbalz/guess-the-line`
- **Branch:** `claude/apply-record-m41-m47`
- **Commit and message:** see the PR
- **Objective:** make the merged and deployed November 10 features fully live in the hosted database.
- **Changes:** seven Gate M applies, plus the records above.
- **Validation:** in-transaction guards and hash compares, independent read-only readbacks, the
  signed-out boundary check and the local test suite.
- **Status:** Complete for the applies. Switch-on steps are listed above.
- **Next breadcrumb:** Sean's word on the `results` row, then Player Props readiness.
- **Jira:** N/A
- **GitHub:** this PR
