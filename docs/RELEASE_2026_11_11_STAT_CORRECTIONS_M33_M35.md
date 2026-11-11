# Stat corrections release and M-33 to M-35 — November 11, 2026 UTC

**Deployed, applied and verified.** The `api-and-frontend` release from `main` at `5105abed`
shipped `gtl-api` v55 and Pages `dc662a68`. Then three migrations from the
[November 10 apply packet](MIGRATION_APPLY_PACKET_2026_11_10.md) were applied:

- M-33, the Tuesday stat recheck audit;
- M-34, private EPL standings storage;
- M-35, the corrected draft order and the capture-interval guard.

History now has 86 rows. Every repo migration is hosted. The standings collector and Player Props
stay off.

## Approvals

All three were Sean's words in this session (session `42c1a86c`), on November 11, 2026:

- **"lets turn these on"**, for Player Props and M-33 to M-35.
- **"Yes, import opens it"**. This accepts the commissioner's M-43 screenshot import as M-35's
  manual recovery plan ([D-83 addendum](DECISIONS.md)).
- **"Yes, deploy"**, at about 17:03 UTC. It answered "Deploy the API and website with this
  stat-corrections card?". The plan he approved: deploy `api-and-frontend`, verify, then apply
  M-33, M-35 and M-34 with the same guarded SQL editor checks as November 10.

## The release

| Evidence | Result |
| --- | --- |
| Run | [43064597743](https://github.com/seanbalz/guess-the-line/actions/runs/43064597743), Shared production release, deploy mode, success |
| Source | `main` at `5105abedadd0c0913de503b01a7413770d4910f9` |
| CI on that SHA | Tests 42993401197, Dashboard checks 42993401187, Brand QA 42993401212: all success |
| Inputs | target `api-and-frontend`; release card [PR #531](https://github.com/seanbalz/guess-the-line/pull/531); `migration_history_sha256` `3eb690d75c75068443d8fe7c791a779534597bb655078f14742a64c9176de022` (83 rows); `compatibility_reviewed` true |
| API | `gtl-api` v54 (bundle `dfd897ace1e41acaa9addd71de2d09a7e2a998c6ebc4a4282c86ab23936a0cbd`) to **v55**, ACTIVE, `verify_jwt` true, bundle `85f4191c2c6e29cb5eb5fc78b28701fefd8edc661484bae7b91b915f0e0d0e95` |
| Pages | `c83c99f8-83e9-4bef-894f-edff90c189d5` to **`dc662a68-ec54-4080-bce3-b89d6aa0899d`**; deployment URL protected; production URL checked, 144 assets |
| Frontend SHA-256 | `b22688f69b5c0c5ea264dc4e0ee58c9eec89b8601dc29721969c4c6a69a0f9dc` |
| Boundary (before the applies) | 519 checked, 495 denied, 24 awaiting; checked at 2026-11-11T17:08:41.334Z |

The source includes PR #531 (the D-83 stat-corrections card), PRs #532 and #533 (Player Props
pilot tooling) and PRs #534 to #536 (the security-audit workflow).

- **Who ran it.** `seanbalz` dispatched the run at 2026-11-11T17:04:48Z, outside this session.
  Its inputs matched the approved batch. This session approved the production gate at about
  17:06 UTC through the GitHub API, under Sean's "Yes, deploy" (the
  [shared deployment](SHARED_DEPLOYMENT.md) "Approvals" rule).
- **API source.** `apiSourceVerified` is false. This is the standard limitation: bundle metadata
  alone does not prove the hosted source equals `5105abed`. No separate source-file comparison
  is recorded here.
- **The 24 awaiting entries** were the 19 M-33, M-34 and M-35 probes, whose migrations were not
  applied yet, and the five Player Props routes behind `GTL_PLAYER_PROPS`. `pendingRepoMigrations` was
  `[20261029151727, 20261029161613, 20261029162144]`.

## Before the applies (P0, read-only, 17:08:21 UTC)

- 83 history rows, newest `20261110204307`, digest `3eb690d7…`. This equals the release input.
- 0 half-applied rows. None of the new objects existed.
- Eight EPL schedules enabled: `dnb-check`, `fixtures`, `moneyline`, `nudge`, `resolve`, `results`,
  `settle` and `snapshot`. Eight `gtl-epl-*` cron jobs active.
- The job constraint already listed nine jobs, including `standings`, `moneyline` and `results`
  (from M-44).
- The kept functions matched the packet:

| Function | md5 |
| --- | --- |
| `gtl_community_admin` | `1b3ac35ca7caf77450df37132e86b881` |
| `gtl_epl_reserve_credits` | `14028d4ecdc63e080c581ffe244c323c` |
| `gtl_epl_resolve_week` | `f5e5d5779ff93b086ea8f1ecd98c4bef` |
| `gtl_epl_score_import_head` | `a22c6aa5a21d63cd15128ae6a5dffb86` |

## Method

The method was the same as on [November 10](RELEASE_2026_11_10_MIGRATIONS_M41_M47.md#method).
Each file ran in the Supabase SQL editor in Sean's signed-in Chrome (device `ee065095`, on this
computer), as `postgres`. The page fetched the file from `raw.githubusercontent.com` at `5105abed`
and checked its SHA-256 before running it.

Each migration was one implicit transaction:

1. Take P1, P2 and the kept functions' md5s and grants into a temporary table. For M-34, also
   take the job constraint text.
2. Guard. Stop unless the history row count is right, the migration is not applied, the kept
   md5s match, the new objects are absent and the M-33/M-43 prerequisites hold.
3. Run the exact file.
4. Insert the history row. The version is the UTC apply time, `statements` is the file and
   `created_by` is `sbalsiger2@gmail.com`.
5. Take the same hashes again and stop on any difference. Then check:
   - each function's md5 against the packet, security invoker, `search_path=""` and
     service-only execute;
   - each new table: RLS on, 0 policies, no anon or authenticated select or insert, service
     select and insert only (no update or delete), and zero rows.

The editor warned "Potential issue detected: creates tables without RLS". It meant the
temporary hash tables. **Run without RLS** was chosen, so the query ran unchanged.

### Order

Sean's approved plan named M-33, M-35, M-34. They were applied in filename order: M-33, M-34,
M-35. That is the packet's section 2 order (Gate M step 1: the topological order that is also
filename order). Both orders meet every dependency: M-34 and M-35 each need only M-33, and M-35
also needs M-43, which is hosted.

## Results

| Ledger | File | File SHA-256 | `statements` md5 (= file md5) | Hosted version | History rows after |
| --- | --- | --- | --- | --- | ---: |
| M-33 | `20261029151727_gtl_epl_stat_rechecks` | `444394a01579d3c1cb59f5e0a774e418b225f6bc6abddbde76a6cb99c0215ea3` | `cfee5715ab9e0b25305af2838c87a1d0` | **`20261111171228`** | 84 |
| M-34 | `20261029161613_gtl_epl_standings` | `9f8479c764eb2a7fd800740542cf2785db54b53144b32be832a69ef506148b16` | `d128bd352c6ea83ea0693c3836e4a8de` | **`20261111171317`** | 85 |
| M-35 | `20261029162144_gtl_epl_corrected_draft_order` | `fed66ad06a97b0ec776f9d799095895029dd59a30cb32308da987018b25ca87c` | `f4b87a7760ef5416e5ae73004dff4129` | **`20261111171357`** | 86 |

History went from 83 to **86** rows. The new digest is
**`5dd179dce5d388163cb6f17b6b84aa6b5cdfe8666298fd9284a7a6e29871b382`**.

M-34 left the job constraint unchanged:
`CHECK (job = ANY (ARRAY['snapshot','fixtures','resolve','settle','nudge','dnb-check','standings','moneyline','results']))`.
It created no `standings` schedule row.

### Preservation

P1 was identical before and after, inside all three transactions:

| Hash | Value |
| --- | --- |
| Ballots | 48, `cb0a6c27edbda66ed0a7f40828e452f1` |
| Week 5 Spread | `{128.0, 95.8, 91.4, 52.0, 37.6}` |
| Settled Virtual Units results | 7, `9cc9ac8b90c55e3b5b4f662157fa8cb0` |
| Settlements | 72, `39a749fcfc47d9309e053512867f4d43` |

P2 was identical before and after, inside each transaction that took it:

| Table | Rows | Hash |
| --- | ---: | --- |
| `gtl_epl_snapshots` | 19 | `b3ac4e20545cfed27ce8dc7fca9b2f83` |
| `gtl_epl_weeks` | 3 | `1d13ca5f86f07fa2fb8e6906f08309ae` |
| `gtl_epl_picks` | 16 | `2ce739f9ae1cbf102b2027d380fbe9c2` |
| `gtl_epl_pick_history` | 16 | `85dcca731f516afde858981eb45156e3` |
| `gtl_epl_bonus` | 5 | `cb0df48f1203fa270a307b40f18570c8` |
| `gtl_epl_jobs_schedule` | 8 | `fb021b57f1020a8565883643ca765d59` |
| `gtl_epl_stat_rechecks`, `gtl_epl_score_imports`, `gtl_epl_score_import_openings` (M-35) | 0 each | |

Nothing was deleted, truncated or rewritten (D-23).

### Independent readback (read-only Supabase connector, after)

- 86 rows, digest `5dd179dc…`. Each new history row's `statements` md5 equals the file md5,
  with one statement and `created_by` `sbalsiger2@gmail.com`.
- Every new function is security invoker, `search_path=""`, and executable by `service_role`
  only (not anon, not authenticated):

| Ledger | Function | md5 |
| --- | --- | --- |
| M-33 | `gtl_epl_recheck_due_at` | `2a42a20e0e5aa722ba9b5ed8c909fe3d` |
| M-33 | `gtl_epl_recheck_state` | `a3cc736ee0c631f8830fd946a4fe8eb6` |
| M-33 | `gtl_epl_record_recheck` | `401facecc7fc86086382fee7246f78cc` |
| M-34 | `gtl_epl_standings_valid` | `4fd8358341921c4e2ebc40151137a17a` |
| M-34 | `gtl_epl_standings_state` | `8dfadc9664f88a211f8bda1dcdb6894a` |
| M-34 | `gtl_epl_save_standings` | `bb520694634f6d34ca997ccc178af63f` |
| M-34 | `gtl_epl_resolve_with_standings` | `5110e1bb96aade8aec0d2e68d400092d` |
| M-34 | `gtl_epl_standings_provenance` | `c8ca113f6db43a59d7381faa5d9dae96` |
| M-35 | `gtl_epl_attest_capture_interval` | `8ec52abb93c876bec23162d2a33f23c0` |
| M-35 | `gtl_epl_capture_interval` | `100720c54cae86de2d395bd6bd281d04` |
| M-35 | `gtl_epl_reserve_result_read` | `53d9324e7004d907b15e7719a8c87cf4` |
| M-35 | `gtl_epl_apply_recheck_orders` | `76221a01b945924303a560b97019f061` |
| M-35 | `gtl_epl_order_correction_state` | `9d92e37baf7b6edca7aebe0852a907fa` |

- Six new tables: `gtl_epl_stat_rechecks`, `gtl_epl_standings`, `gtl_epl_standings_usage`,
  `gtl_epl_order_corrections`, `gtl_epl_result_reads` and `gtl_epl_capture_intervals`. Each has
  RLS on, 0 policies, no anon or authenticated select, service select and insert only, no update
  or delete, and 0 rows.
- The schedules are unchanged: eight enabled, no `standings` row.
- M-33 was hosted alone for 89 seconds (17:12:28 to 17:13:57 UTC). No EPL snapshot job ran in
  that time (the snapshot cron is `4-59/15`). So no recheck ran on M-33 alone, as the packet
  requires.
- The `gtl-epl-jobs` worker is still v4. Its source has not changed since its November 10 deploy
  from `1ba75282`.

## After the applies

- **First snapshot run.** The first EPL snapshot run with M-33 and M-35 hosted ran at 17:19:00
  UTC. It finished `skipped` / `snapshot_pending` in 1 second. That is the same outcome as all 161
  snapshot runs since November 9, before the applies. It wrote no recheck, correction or
  result-read rows (all 0). There are still 19 snapshots.
- **Logs.** No 5xx in the `gtl-api` or `gtl-epl-jobs` logs from 17:08 to 17:20 UTC. Signed-out
  probes got 401 or 404 as expected on v55.
- **Boundary check after the applies.** `npm run check:cloud` ran from this branch (signed out,
  inert fixtures) between 17:26:36 and 17:28:24 UTC: **514 live denials**, 5 awaiting. All 19 M-33,
  M-34 and M-35 tables and RPCs now answer 401 with a database permission denial. The 5 awaiting
  entries are the `gtl-api/props/*` routes behind `GTL_PLAYER_PROPS`.
- **Signed-in readback** (Sean's Chrome, view only, nothing saved). Commissioner tools ›
  Premier League stat corrections opened. The card read "No Premier League stat corrections are
  awaiting review." The log shows `POST /gtl-api/epl/admin/corrections/read` 200 on v55 at
  17:15:39 UTC, after M-35 was applied.
- **Records** (this PR):
  - `tests/migrations.mjs`: the three versions moved from `NOT_HOSTED` to `APPLIED`, so
    `NOT_HOSTED` is empty. M-35's `REQUIRES` entry left, so `REQUIRES` is empty. `FIX_FORWARD`
    is unchanged.
  - The `awaitingDeploy` entries left `scripts/boundary/guess.mjs` (M-33), `league.mjs` (M-34)
    and `epl-operations.mjs` (M-35). The 19 tables and RPCs are still probed. A missing one is now
    an unexpected 404, not "awaiting".
  - Only the five `gtl-api/props/*` routes still await, under `flag GTL_PLAYER_PROPS`. So
    `check:cloud --strict` still fails by design until that flag is on.
  - Tests that said these three were pending now assert they are hosted.

## What changes for players and the commissioner

- **Automatic EPL final capture fails closed.** No capture-interval evidence has been admitted.
  With M-35 hosted, the worker will not anchor a final or a correction without it
  ([finalization order](EPL_FINALIZATION_ORDER_2026_10_29.md)).
- **The commissioner's screenshot import is the way through.** Under "Yes, import opens it", a
  confirmed M-43 import settles the round and opens and orders the next draft.
- **A Tuesday recheck never overrides a confirmed import's order** (D-83). It records
  `preserved_import` beside the kept order. A week without an import still gets its corrected
  order automatically, if the next draft is still empty and open.

## Still off

- **Standings collector.** Not configured: there is no `standings` schedule row. Turning it on
  is separately unauthorized.
- **Player Props.** `GTL_PLAYER_PROPS` is unset, so the routes answer 404. `live_lock_in` is
  false. The pilot waits on two GitHub secrets from Sean: `GTL_PROPS_SERVICE_ROLE_KEY` and
  `GTL_PROPS_ODDS_API_KEY`. Only `GTL_PROPS_SUPABASE_URL` is set.

## Not verified

- A real Tuesday recheck and correction cycle.
- A real screenshot import under M-35. There were 0 import rows when M-35 was applied.
- Real-phone acceptance.

## Change breadcrumb

- **Session ID:** `42c1a86c-29dd-4d40-97ed-ff24c1f9c022`
- **Agent:** AI Agent (Claude Code, desktop app)
- **Timestamp:** release dispatched 17:04:48 UTC; applies 17:12:28–17:13:57 UTC, November 11, 2026
- **Device:** Windows
- **Repository:** `seanbalz/guess-the-line`
- **Branch:** `claude/apply-m33-m35-2026-11-11`
- **Commit and message:** see the PR
- **Objective:** ship the D-83 stat-corrections card and make M-33 to M-35 live.
- **Changes:** one `api-and-frontend` release, three Gate M applies, and the records above.
- **Validation:** release verification, in-transaction guards and hash compares, independent
  read-only readbacks, the first snapshot run, hosted logs, a signed-in readback, the signed-out
  boundary check after the applies and the local test suite.
- **Status:** Complete for the release and the applies. The switch-on steps above stay open.
- **Next breadcrumb:** the first real screenshot import or Tuesday recheck; Player Props secrets.
- **Jira:** N/A
- **GitHub:** this PR
