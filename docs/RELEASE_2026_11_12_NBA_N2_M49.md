# NBA N2 live: M-49 applied, `gtl-nba-jobs` deployed, slate on — November 12, 2026 UTC

**Applied, deployed and verified. The slate job is on; the lines job is off.** M-49
(`20261112040000_gtl_nba_slate_lines.sql`) is hosted as `20261112055355`. The `gtl-nba-jobs`
worker is deployed as v1. The NBA `slate` schedule is on, and `lines` (the paid read) is off.
History now has 87 rows. Players see nothing: N2 is server only
([spec, N2](superpowers/specs/2026-11-10-nba-buildout-design.md#n2-slate-and-capped-spread-lines-server-only-players-see-nothing),
[apply packet](MIGRATION_APPLY_PACKET_2026_11_12_NBA_N2.md)).

Evidence tags: **executed** (run and observed in the captain session), **inspected** (read in
source or records), **assumed** (not checked). Everything from "Approvals" through "The schedule"
is executed by the captain session (session `42c1a86c`, Windows). This record was written from that
evidence; no hosted read or write was made to write it.

## Approvals

All were Sean's words in this session, on November 11, 2026 (Pacific):

- **"Yes, build N2"**.
- **"Yes, avoid that hour"**, for [D-85](DECISIONS.md) item 7: NBA's lines read stays out of the
  hour before any NFL kickoff.
- **"Yes, merge it"**, for PR #558.
- **"Yes, all three"**, answering "Apply M-49, deploy the NBA job and switch on its schedule after
  the merge?".

## Source and merges

| Evidence | Result |
| --- | --- |
| N2 | [PR #558](https://github.com/seanbalz/guess-the-line/pull/558), merged by this session at head `b2515b1d` after all checks passed, at 2026-11-12T05:51:12Z, as `main` `2345d78fb84bead757c1c65d360e87168a7882d2` |
| Release target | [PR #560](https://github.com/seanbalz/guess-the-line/pull/560) (`nba-jobs` → `gtl-nba-jobs`), merged by this session at head `c03a3df3` after all checks passed, as `main` `635e15cc6547e1dc00617c16c49cc3af5f0cda58` (merge commit time 2026-11-12T06:15:14Z; inspected with git) |
| CI on `635e15cc` (push to `main`) | Tests, Dashboard checks and Brand QA: all success |
| Migration file | `20261112040000_gtl_nba_slate_lines.sql`, fetched in the SQL editor page from `raw.githubusercontent.com` at `2345d78f`; 59001 bytes; SHA-256 `098728669080f731111c55aac8414d521bd5fb97c5987c39f61f636949d4efe0` (checked in the page; equals packet version 2); md5 `0f2472c60227979ec188aaa625d2517c` |

## Preflight (read-only, Supabase connector, 05:51:55 UTC)

- 86 history rows, newest `20261111171357`, digest
  `5dd179dce5d388163cb6f17b6b84aa6b5cdfe8666298fd9284a7a6e29871b382`.
- 0 history rows for M-49 or M-48. No N2 table existed.
- The NBA functions were exactly the four hosted ones. The two lease bodies matched the packet:
  `gtl_nba_claim_games` `f2a8ce30c561d9dedb4be6dace10fa63` and `gtl_nba_finish_games`
  `afeed594711e205ba577a0a77d37f956`.
- The shared Odds API budget: 142 remaining, not paused, no lease.
- The columns M-49 reads: `gtl_odds_budget` 9, `gtl_odds_refresh_runs` 4, `gtl_epl_job_runs` 4,
  `gtl_weekly_slates` 3 (as the packet expects).
- NFL kickoffs for the NFL hour: 86, 0 not numeric, the latest 2026-11-17T01:15Z.
- `pg_cron` and `pg_net` present.

## The apply

**Where and who.** The Supabase SQL editor, in Sean's signed-in Chrome on this computer, as
`postgres`, at about 05:53 UTC.

**How.** One implicit transaction, built by the session's gate builder. The builder was first
dry-run on local PGlite with every hosted migration and Supabase's default grants: it applied, it
verified, and a second run was refused. On the hosted project, in order:

1. **Guard.** Stop unless history has 86 rows, M-49 is not applied, the kept lease md5s match, the
   new objects are absent and the dependencies are present.
2. **Before hashes.** P1, `gtl_weekly_slates`, `gtl_odds_budget` and the four existing NBA
   functions.
3. **The exact file.**
4. **The history row.**
5. **After hashes.** Stop on any difference from the before hashes.
6. **Verify.**
   - The history row's md5 equals the file's.
   - The 14 function md5s equal the packet. Each is security invoker with `search_path=""`, with
     no anon or authenticated execute, and service execute on all but the cron-only dispatcher.
   - The 8 tables: RLS on, 0 policies, no anon or authenticated access, no service delete.
   - 8 triggers.
   - The budget row: cap 31, pause below 100, not paused.
   - No schedule, game, line, attempt or run rows.

The editor warned "Potential issue detected: creates tables without RLS". It meant the gate's
temporary hash tables. **Run without RLS** was chosen, so the query ran unchanged.

### Result

| Ledger | File | File SHA-256 | `statements` md5 (= file md5) | Hosted version | History rows |
| --- | --- | --- | --- | --- | --- |
| M-49 | `20261112040000_gtl_nba_slate_lines` | `098728669080f731111c55aac8414d521bd5fb97c5987c39f61f636949d4efe0` | `0f2472c60227979ec188aaa625d2517c` | **`20261112055355`** | 86 before, **87** after |

The new history digest is **`d0bcee513cb5be6d8d0ddb6115f2949f451953aa8c3c875ff006f4866533e2f3`**
(from the independent readback below).

### Hashes inside the transaction (before = after)

| Hash | Rows | Value |
| --- | ---: | --- |
| P1 ballots | 49 | `0a4a2e2d72985c90f048e18c0b9c158d` |
| P1 Week 5 Spread | | `{128.0, 95.8, 91.4, 52.0, 37.6}` |
| P1 settled Virtual Units results | 7 | `9cc9ac8b90c55e3b5b4f662157fa8cb0` |
| P1 Virtual Units settlements | 72 | `39a749fcfc47d9309e053512867f4d43` |
| `gtl_weekly_slates` | 6 | `d085106c04cc6bf122789ed70f34e95f` |
| `gtl_odds_budget` | 1 | `202ee2e3bef7df914157dc8e88ea841e` |

Each pair was compared before and after inside the same transaction. The settled Virtual Units
and settlement hashes also equal November 11's
([record](RELEASE_2026_11_11_STAT_CORRECTIONS_M33_M35.md#preservation)). The file creates new
objects only and drops, truncates or deletes nothing (inspected; `tests/nba-slate-lines-sql.test.mjs`
pins it), so every earlier record is kept (D-23).

### Independent readback (read-only Supabase connector, after)

- 87 rows, digest `d0bcee51…`. The new history row's `statements` md5 is `0f2472c6…` (the file),
  with one statement, created by Sean's account.
- 18 NBA functions: the 14 new ones and the 4 from October. The only security-definer ones are the
  four October tracker functions; they have no anon or authenticated execute, and their md5s are
  unchanged.
- The read-only role is refused execute on `gtl_nba_lines_plan` (42501), as intended.
- 8 N2 tables: RLS on, no anon or authenticated select, no service delete.
- `gtl_nba_budget`: `monthly_cap` 31, `pause_below` 100, `paused` false.
- 0 schedule rows at that point.
- The shared budget: 142 remaining, not paused, no lease (as in the preflight).

## The worker release

| Evidence | Result |
| --- | --- |
| Run | [43169209526](https://github.com/seanbalz/guess-the-line/actions/runs/43169209526), Shared production release, deploy mode, **success** |
| Dispatched | by this session at 06:35:37 UTC; the release lane was empty before and after |
| Inputs | target `nba-jobs`; source `635e15cc`; release card [PR #558](https://github.com/seanbalz/guess-the-line/pull/558); `migration_history_sha256` `d0bcee513cb5be6d8d0ddb6115f2949f451953aa8c3c875ff006f4866533e2f3` (87 rows, read fresh); `compatibility_reviewed` true |
| Production gate | approved by this session under "Yes, all three" |
| Before | `nbaJobsBefore`: present false |
| Worker | **`gtl-nba-jobs` v1**, ACTIVE, `verify_jwt` false, bundle `88d932c186ffd138703c698ce4d6b5b9be5ccb73e28313333932ca4b711b1371`; `nbaJobsCreated` true |
| Source check | `nbaJobsSourceVerified` false: the standard limitation (bundle metadata alone does not prove the hosted source equals `635e15cc`) |
| `gtl-api` | v56, unchanged |
| History | digest unchanged by the release |
| Boundary | 539 checked, 538 denied, 1 awaiting: "anonymous gtl_props_begin_refresh RPC", which is M-48's (not applied), not N2's |
| `pendingRepoMigrations` | `[20261112031000, 20261112040000]`: the repo list still said M-49 was not hosted. This PR fixes that. |

**Signed-out probes** (curl, 06:41 UTC):

- `POST /functions/v1/gtl-nba-jobs` with a made-up `runId`: **401**.
- An empty `POST`: **401**.

## The schedule

**Where.** The Supabase SQL editor in Sean's Chrome, at about 06:44 UTC.

**What ran.** `supabase/admin/nba_jobs_cron.sql` steps 1 to 3, plus step 4 for `slate` only. A
guard ran first: M-49 applied, no schedule rows, no `gtl-nba-%` cron jobs.

| Job | Schedule row | Cron job | Cron | Cron active |
| --- | --- | --- | --- | --- |
| `slate` | **enabled** | `gtl-nba-slate` | `0 16,17,22,23 * * *` | yes |
| `lines` | **disabled** | `gtl-nba-lines` | `4-59/5 * * * *` | yes |

- Both rows point at `https://onmrgvcehkflfaizvedl.supabase.co/functions/v1/gtl-nba-jobs`.
- `gtl-nba-lines` fires every five minutes, but its schedule row is disabled. So each dispatch
  answers `disabled` and posts nothing.
- **Readback** (read-only connector): schedule `{lines: false, slate: true}`; both cron rows
  active; `gtl_nba_job_runs` 0.
- **The first slate run** is due at **17:00 UTC on November 12** (9:00 AM Pacific).
- **Lines stays off** until a slate run has stored a game day. That is the order step 4 of the
  cron file sets.

## The records (this PR)

- `tests/migrations.mjs`: `20261112040000` moved from `NOT_HOSTED` to `APPLIED`, at the end, in
  filename order. `NOT_HOSTED` now holds only M-48 (`20261112031000`), which is not applied.
  `REQUIRES` stays empty.
- `scripts/boundary/nba-jobs.mjs`: M-49's 19 `awaitingDeploy` entries (8 tables and 11 RPCs) are
  gone. The probes stay, so each must deny; a missing one is now an unexpected 404.
- `scripts/boundary/bets.mjs`: the worker probe `['scheduled nba jobs', 'gtl-nba-jobs', { runId:
  missingId }]` joined `workerChecks`. `check:cloud` now calls `gtl-nba-jobs` twice, without a
  token and with an all-zeros token, and each must answer 401. That makes 541 probes from this
  source (executed locally with a mock that denies everything; not run against the hosted
  project).
- Tests that said M-49 was pending now assert it is hosted, and a new test pins the worker probe.

## What is not done or verified yet

- **The first slate run**, due 17:00 UTC November 12 (9:00 AM Pacific). At the schedule readback,
  `gtl_nba_job_runs` had 0 rows.
- **Switching on `lines`** (paid, at most 31 credits a month). It waits until a slate run has
  stored a game day.
- **A real lines read.** None has happened: `lines` has been disabled since its row was created,
  and the apply's verify found no attempt or line rows.
- **The shadow gate.** `gtl_nba_shadow_gate()` must report 10 consecutive covered game days before
  N3's writer is turned on.
- **The physical-iPhone check.**
- **`check:cloud` from this branch.** Not run here: this checkout has no `.env.cloud`.
  `check:cloud --strict` will still fail while M-48 is not applied: its `gtl_props_begin_refresh`
  RPC was the one awaiting entry in the release check.

## Change breadcrumb

- **Session ID:** `42c1a86c-29dd-4d40-97ed-ff24c1f9c022`
- **Agent:** AI Agent (Claude Code, desktop app)
- **Timestamp:** merge 05:51:12 UTC; apply about 05:53 UTC; release dispatched 06:35:37 UTC;
  schedule about 06:44 UTC, November 12, 2026
- **Device:** Windows
- **Repository:** `seanbalz/guess-the-line`
- **Branch:** `claude/record-nba-n2-live-2026-11-12`
- **Commit and message:** see the PR
- **Objective:** make NBA N2 live on the server: M-49, the worker and the slate job.
- **Changes:** two merges, one Gate M apply, one `nba-jobs` release, the schedule rows and the
  records above.
- **Validation:** the read-only preflight, the in-transaction guard and hash compares, the
  independent read-only readback, release verification, signed-out probes, the schedule readback
  and the local test suite.
- **Status:** complete for the apply, the deploy and the slate switch-on. The items above stay
  open.
- **Next breadcrumb:** the first slate run's readback, then the lines switch-on.
- **Jira:** N/A
- **GitHub:** this PR
