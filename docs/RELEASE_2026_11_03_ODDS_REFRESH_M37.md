# Release card: M-37 odds refresh fixes — November 3, 2026

Board item 40. Sean, November 3, 2026, after the diagnosis: "Yes, build it". This card covers one migration (M-37,
Gate M) and one provider change that ships with the next Edge Function deploys. Nothing players see changes.

## Applied — November 3, 2026

Sean: "Yes, merge and apply" (merge #434 when green, then apply M-37 in the SQL editor in his signed-in Chrome).
PR #434 merged at 16:35:07 UTC as `5e89a2b21c424b156468ce8b4d7f1e5986b2561c`; the file is the newest migration on main.

- **Step 4 (read-only, 16:22 UTC):** both bodies matched the header md5s, no history row named the file, execute
  was `postgres` and `service_role` only. History: 72 rows, digest
  `b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`.
- **Step 5 (SQL editor, `postgres`, 16:24:30 UTC):** every 2026 ballot through `gtl_ballot_pick_scores` (user,
  season, week, mode, summed points, scored count): 38 ballots, md5 `fe86b774b3aff5e3bc596a242aa1a4dc`. Settled
  Virtual Units rows: 57, md5 `43a064a0490661770a06317f7f1eeae6`.
- **Step 6 (SQL editor, signed-in Chrome):** the file fetched in the editor tab from `raw.githubusercontent.com` at
  `5e89a2b`, 7044 bytes, SHA-256 equal to the repo copy. One implicit transaction:
  1. A guard that raised unless both bodies still had the step 4 md5s and no history row existed.
  2. The file.
  3. The history insert (`array[$gtlmig$<file>$gtlmig$]`, created by sbalsiger2@gmail.com).
  4. A readback.

  Hosted version **`20261103164210`**. The editor ran the script a second time. The guard refused it
  (`M-37 pre-check failed`) and that transaction rolled back, so there is one history row and no second write.
- **Step 7 (read-only and SQL editor):**
  - `md5(prosrc)` is `1957c8b35424403a59b84da046b1ee1f` (claim) and `3da4153389266b140673ed08ea3cb9e8` (complete),
    equal to the repo bodies. One `pg_proc` row each.
  - ACL `{postgres=X/postgres,service_role=X/postgres}`, security invoker, `search_path=""`.
  - The history row has 1 statement, 7044 bytes, md5 `d6a840a8988001b2497c3a253ed65c33`, equal to the file.
  - History has 73 rows. The 72 before it are unchanged (same digest `b3b13f6f…`); the new digest is
    `e3f8d25533509a50af089c762f0492c91a007e247df0f4f7b6ac7fa2d021e066`.
  - Score hash at 16:43:03 UTC: 38 ballots `fe86b774b3aff5e3bc596a242aa1a4dc` and 57 settlements
    `43a064a0490661770a06317f7f1eeae6`, unchanged.
- **Step 8:** `tests/migrations.mjs` moves `20261103170000` to `APPLIED`.
  - `check:cloud` (signed-out probes, after the apply): 425 denied, including anonymous `gtl_claim_odds_refresh` and
    `gtl_complete_odds_refresh` (401).
  - 19 are awaiting deploy, all for the unapplied M-33/M-34/M-35, so `--strict` was not run. Those failures are not
    M-37's.
- **Still to read back:** the first scheduled run after the apply (18:15 UTC, November 3).
- **Deployed November 3:** the provider change (`providerSchedule`) reached `gtl-api` with v48 (deploy run 41726861800).
  `gtl-odds-refresh` reached it through the new `odds-refresh` release target, without the Mac mini: v6 to v7, deploy run
  41735886452 from `4cf149e7`. Sean said "Yes, release it" and "Go ahead", and the session approved both gates after
  checking each run title. The history digest was unchanged (`4345486d…4066`), and a signed-out call with no token or a
  wrong one is refused (401). The first scheduled run on v7 (06:15 UTC, November 4) is still to be read back.

## What the hosted runs showed (read-only, November 3)

From October 25 to November 3, 19 twelve-hour runs: 15 partial, 2 skipped, 2 succeeded (Week 9's two so far, 15 of
15 games matched). The odds provider stops listing a game once it kicks off, so after Thursday's game every run counted
against the whole week was "partial". Two real faults:

- **A run skipped by a preflight race.** October 29 06:15 UTC, the last overnight run before Thursday Night Football,
  was skipped as `budget_guard` with 400 credits left. `gtl_claim_odds_refresh` asks for a zero-credit preflight only
  when the last one is over 24 hours old, and the collection refuses one over 24 hours old a second or two later. The
  last real preflight was October 28 06:15:01.94; at the next slot it was 23h59m58s old at the claim and over 24 hours
  at the collection. With slots 12 hours apart this is a coin-flip about every other day.
- **One game never matched.** Week 8 CHI-SEA (Monday, November 2, 8:15 PM ET) got `schedule_mismatch` at all three
  books in all 13 runs. It is the only mismatch this season. nflverse agrees with our slate (CHI at SEA, played 34-17),
  so the provider listed a different kickoff or home team; nothing recorded which.

Budget: about 2 credits per run; 469 of 500 left in November.

## The change

| Part | What | Ships by |
| --- | --- | --- |
| M-37 `20261103170000_gtl_odds_refresh_fixes.sql` | `gtl_claim_odds_refresh`: preflight once the last one is over **23** hours old. `gtl_complete_odds_refresh`: partial only against games not yet started when the collection began. Both bodies are otherwise the hosted ones, byte for byte. | Gate M apply (Sean's "apply M-37") |
| `cloud/odds-provider.mjs` | A `schedule_mismatch` game records `providerSchedule`: up to three provider listings for the same two teams, each with its kickoff and whether home and away are reversed. Matched games are unchanged; readers check only `matchStatus`; the SQL validator accepts the extra key. | Next `gtl-api` release (submission collections) and a `gtl-odds-refresh` deploy from the Mac mini (scheduled runs; there is no shared-workflow target for it, v6 is live) |

Not in this card: extra runs in the hours before each deadline (board item 40's next step), and the cause of the
CHI-SEA mismatch, which the provider change will show the next time it happens.

## Gate M for M-37

1. **Queue.** Nothing else is waiting on the two functions; M-33/M-34/M-35 touch EPL functions only.
2. **Deploy first.** Nothing. Reply shapes are unchanged, and `gtl-odds-refresh` v6 already preflights when asked.
   Either order with the provider deploy is safe.
3. **Approval.** Sean says "apply M-37", and approves the route: the SQL editor in his signed-in Chrome.
4. **Pre-check (read-only).** `md5(prosrc)` of `gtl_claim_odds_refresh` is `de8b1651570a0d8119522d5250022c6f` and of
   `gtl_complete_odds_refresh` is `bd3c40ae00acfc271946ee95cb265107` (both matched on November 3 at 16:22 UTC);
   no history row names `gtl_odds_refresh_fixes`.
5. **Score hash.** As in the M-36 record. M-37 reads and writes no ballot, pick or settlement.
6. **Apply.** The file from `main`: 7044 bytes, SHA-256
   `955aa0941db31952b9ea5832bae2f9a0b2936dcebf8fed2a7b710c7f8d5bb13f`. Two `create or replace function` statements;
   rerunnable.
7. **Verify.** `md5(prosrc)` becomes `1957c8b35424403a59b84da046b1ee1f` (claim) and `3da4153389266b140673ed08ea3cb9e8`
   (complete); one `pg_proc` row each; execute still service-role only; score hash unchanged. Then the next scheduled
   run (06:15 or 18:15 UTC): `succeeded`, or `partial` only with an upcoming game unmatched; a preflight row in
   `gtl_odds_collections` whenever the last one was over 23 hours old.
8. **Record.** The hosted version here and in the register; move `20261103170000` from `NOT_HOSTED` to `APPLIED` in
   `tests/migrations.mjs`.
9. **Rollback.** `supabase/rollback/20261103170000_gtl_odds_refresh_fixes.sql` (SHA-256
   `d6af69dd76e4b655df722b82093b8ca664c649bb6f8e17340115be1939a5bab9`) restores both previous bodies; tested on PGlite
   by `tests/rollback.test.mjs`.

## Thursday, November 5

The last preflight was November 2 18:15:01.98 UTC. Without M-37, tonight's 18:15 run and the November 5 06:15 run
(Wednesday 10:15 PM PT) can each be skipped by the race. The November 5 18:15 run, the last before Thursday's
kickoff, preflights either way. Saves never depend on the race: a submission that finds the preflight stale
preflights and retries (`cloud/submission-collection.mjs`).

## Evidence (local, executed)

- `tests/odds-open-weeks-sql.test.mjs` (PGlite, the deployed worker and provider adapter in process; skipped 0):
  - On the hosted body, the claim at 23h59m58s skips the preflight and the collection then refuses with
    `GTL_ODDS_PREFLIGHT_REQUIRED`. With M-37 the same claim asks for one. Under 23 hours it still skips it, and the
    collection accepts ten minutes later.
  - A full run at 23h30m preflights (0 credits) and succeeds.
  - Partial labels: hosted body against M-37 for five cases. Thursday started with every other game priced, and
    Monday night alone, become `succeeded`. A game still to play without lines stays `partial`.
  - A static check that each body is the one it replaces, with only its own change.
- Mutation checks: reverting the 23 hours, or counting the whole week, fails these tests. Dropping
  `providerSchedule` fails `tests/odds-provider.test.mjs`.
- `tests/rollback.test.mjs`, `tests/migrations.test.mjs`, `tests/migration-functions.test.mjs` and the other odds
  suites pass.
