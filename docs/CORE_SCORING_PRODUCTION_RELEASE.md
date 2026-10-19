# Guess The Line — core scoring production release

## Superseding release policy - October 19, 2026

Sean instructed: "permanently remove the gated window". All calendar, weekday,
DST and game-buffer release restrictions below are superseded permanently.
The implementation is PR #151. Exact source/CI, fresh hosted state, compatibility,
data-preservation checks, individual migration order and rollback remain required.
No further time-window approval or wait is required.

## Production activation — October 19, 2026

PR #151 passed all five required checks and merged as
`5b1f3677479a3def3d3957e127ea933701d8034d` at 23:45:39 UTC.
Core scoring was activated at 23:46–23:47 UTC, with each migration applied
separately after its predecessor and verified before continuing:

| Stage | Repo version | Actual hosted version |
| --- | --- | --- |
| M-02 | 20261015030000 | 20261019234625 |
| M-03 | 20261015040000 | 20261019234645 |
| M-04 | 20261015050000 | 20261019234708 |
| M-08 | 20261015020000 | 20261019234713 |
| M-05 | 20261014221500 | 20261019234718 |
| M-06 | 20261015010000 | 20261019234724 |
| M-07 | 20261015190710 | 20261019234729 |

D-47 was already hosted as `20261016223357` by the October 16 release;
its function body and history were reconciled, and it was not reapplied.
Unrelated Bets, comparison and preferences migrations remain unapplied.

The compatible Home/Fantasy runtime was retained: source
`8942725746f199270d79fce562ac37cf92d64d69`, Pages
`0933a030-ff36-4a22-8cd7-fb2b7675863c`, API v25 with JWT verification,
and collector v4. Exact-source CI and clean source were verified. All 95
served assets matched the production and immutable deployment URLs. All 46
API files and four collector files matched source. No older build was uploaded.
API bundle SHA-256: `b688829ee7e07c980765113b42d80cc9f9f24bd45cd1df64c3ba356489fdffe2`.
Collector bundle SHA-256: `5f47a2ee11e391d94e2462949488a052e256e77eb0e2c2f9bbf467fa524c4b68`.

Each apply checked function bodies, signatures, security settings, search paths,
grants and intended schema changes. The new forfeit table has RLS enabled and
no anonymous/authenticated table grants. Historical Week 5 scores (135 game
rows, nine ballots, 655.8 total points) and ballot audits remained unchanged.
All 23 complete ballot rows retained MD5 `9845424e7b611149b727f692e9e49bd1`.
Historical per-game score MD5: `9c487dda5871e6b1135c42ff6fb062f7`;
per-ballot score MD5: `5f54ec162dae278032647abd6969529a`.
Private before/after evidence is retained locally and contains no public release payload.

Live rules now report `sentFinal:true`, `lateWindow:kickoff`,
`perGameScoring:true`, `revealAt:kickoff`. Authenticated read-only browser
checks confirmed locked receipts, saved-reference provenance, immediate personal
points, previous-week navigation and independent Spread/Total scores.
No competition picks were created or changed for testing.

Live boundary verification returned 255 expected denials from 261 probes.
The six pending RPC probes belong only to unapplied Bets/comparison/preferences;
no core scoring probe is allowed to remain missing. This is not a claim that
the unrelated full strict rollout passed.

Windows main, Mac Mini shared-sync and MacBook Neo main were all clean and
synced to `5b1f3677479a3def3d3957e127ea933701d8034d` after the activation.
Release evidence will be synced again after PR #145 merges.

Local validation: 198 Vitest tests, typecheck and Brand QA passed. The 1,430
Node functional tests passed across the full run and targeted correction reruns
(no skips). All 12 rollback tests passed across the suite and corrected
M-05 fixture rerun. Historical pre-apply
fixtures now explicitly select their earlier schema. Rollback fixtures stop at
the target migration so later dependent bodies cannot overwrite the scenario.

Remaining closeout: final evidence CI, PR #145 merge and sync, and a successful
scheduled collection after activation. Existing collection cron is `15 8,20 * * *` UTC; the next execution
is October 20 at 08:15 UTC (01:15 Pacific). Do not force a provider collection
to manufacture scheduled evidence. Real-phone and multi-account write acceptance
remain separate from this read-only production verification.

## Historical preparation record

The following sections describe earlier preparation. Their pending-apply,
access-blocker, old-source and timing statements are historical and superseded
by the production activation above.

Owner: Sean Balsiger; release execution: Codex
Version 3 · October 19, 2026 · Status: scoring active; closeout in progress

## Authorization and source

Sean authorized this release in the Windows task:

> Go ahead with the production release for the core scoring milestone. Apply the required migrations in the proper order, deploy it, and verify the live app.

This covers the required scoring migrations and compatible deployments. Sean
then selected **“Use the first verified quiet window”** in response to the
one-time weekday-exception question. This authorizes this release outside the
M-02 Friday–Saturday and M-05/M-06/M-07 Tuesday–Wednesday limits. The live
game-window guard remains in force. No further release or weekday approval is
required; the authorization does not establish that an apply occurred.

The exact release source is `bb4f20a095de61ac283b62cfee819d533470fa39`, merged
through [PR #141](https://github.com/seanbalz/guess-the-lines-repo/pull/141).
Its main-push [Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38802704508),
[Dashboard and Persona checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38802704512),
and [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38802704506)
passed. The release source checker confirmed the exact SHA, clean checkout,
main ancestry and required successful jobs during this task.

## Prepared evidence

- Fresh Windows verification: 1,400 Node tests and 188 Vitest tests passed with
  no failures or skips; four core browser scenarios passed. Each Mac passed 35
  focused scoring, SQL and live-rule tests. Builds, bundle privacy and brand QA
  passed. The full Node run includes migration and rollback compatibility.
- All three clean integration checkouts were verified at the release SHA, with
  zero ahead/behind and no unpublished source changes, before release preparation.
- The Mac Mini built production-configured assets from a separate clean checkout
  at the exact SHA. The privacy scan passed: 99 artifacts, 2,165,217 bytes;
  frontend manifest digest `21b6e9b7025d4512d1726dee1f73147c8ddd3bd19719954dab86279a11d78116`;
  source digest `5d186fe75c541ef6c9f6cc593f3b7171291637071d148b6b008dbddf597201d1`.
  These digests identify prepared artifacts, not served production bytes.
- The existing project-scoped Cloudflare login has Pages write access to the
  intended account. The production deployment list was captured privately.
- A fresh signed-out boundary check returned 229 expected denials and 17 probes
  awaiting deployment. These are not authenticated flow checks or proof of
  fresh hosted migration state; strict rollout acceptance has not passed.

## Current blockers

At 12:20 AM Pacific on October 16, Supabase connector tools became available,
but `list_projects` returned an empty list. Project details, Edge Function
metadata and a read-only rules/slate query for `onmrgvcehkflfaizvedl` all returned
"You do not have permission to perform this action." The connection needs access
to the intended Gambling organization/project before hosted preflight can run.
This is a provider project-access failure, not a request for another release
approval. No production query succeeded and no mutation was attempted.

The earlier pinned Supabase CLI checks on the Mac Mini reported no access token,
including from the earlier scoring worktree. The GitHub production environment
had no deployment secrets. No credential was copied or printed. Cloudflare
access alone is insufficient to perform the database preflight or release.

The CLI access check at 10:00 PM Pacific on October 15 still reported no Supabase
login. An hourly follow-up in the release chat checks at 16 minutes past the hour
and continues once access is available and the live quiet-window check passes.
It stays quiet while the known blocker is unchanged and stops after completion.

The earlier read-only database evidence in
[the approval checkpoint](https://github.com/seanbalz/guess-the-lines-repo/pull/142)
must be refreshed. Its reported seven absent migrations, function-body matches
and historical score hashes are not asserted as current here.

The [release plan](REDESIGN_BUILD_PLAN.md#6-migration-ledger) assigns M-02 to
Friday–Saturday and M-05/M-06/M-07 to Tuesday–Wednesday; Sean's one-time exception
above supersedes those weekday limits for this release. The earlier published
slate snapshot places tonight's game buffer through 11:15 PM Pacific. A fresh
hosted slate and a passing 30-minute quiet-window check are required at execution;
the earlier timestamp is not a reservation or permission to bypass the guard.

## Execution order after access is restored and the quiet-window check passes

1. Refresh hosted function metadata, permissions, migration history, published
   slates and historical score/ballot hashes. Pin the finished-week comparison
   set; verify Week 5 anchors 95.8, 91.4 and 37.6 and settled Virtual Units hashes.
   Check for concurrent releases or a partial apply before making any mutation.
2. Deploy the prepared compatible Pages, then `gtl-api`, before new response
   shapes and rules activate. Verify the hosted collector has the stage-22
   multi-week adapter; deploy that compatible collector if its provenance does
   not establish the prerequisite. Preserve its schedule and provider budget.
3. Confirm the existing full-market flow while M-07 is absent. Apply each
   migration separately in this dependency order in a verified quiet window:

   | Order | Stage | Repository migration |
   | --- | --- | --- |
   | 1 | M-02 | `20261015030000_gtl_sent_picks_final.sql` |
   | 2 | M-03 | `20261015040000_gtl_guess_week_forfeit.sql` |
   | 3 | M-04 | `20261015050000_gtl_social_line_lock.sql` |
   | 4 | M-08 | `20261015020000_gtl_guess_picks_reader.sql` |
   | 5 | M-05 | `20261014221500_gtl_odds_open_weeks.sql` |
   | 6 | M-06 | `20261015010000_gtl_lines_read.sql` |
   | 7 | M-07 | `20261015190710_gtl_guess_write_window.sql` |

4. Around every apply, run the reviewed predecessor and successor checks:
   function bodies, signatures, search paths, grants, one RPC definition, new
   table permissions and unchanged historical scores/references. Record the
   hosted migration version. After an uncertain response, inspect hosted state
   before any retry. Never run a generic database push.
5. Verify live rules include final picks, per-game scoring and kickoff windows;
   receipts, own immediate points, shared started-game standings and independent
   market reveal agree across both app paths. Verify permitted signed-in reads
   without creating real competition picks solely for test evidence.
6. Run strict boundary checks and compare every served frontend asset with the
   manifest at the immutable and production URLs. Verify API JWT protection,
   active version and provenance; a hosted bundle digest alone is not source
   equivalence. Confirm the next scheduled collection succeeds without forcing
   an extra provider collection.
7. Record actual hosted versions, deployment identities, historical hash results
   and acceptance limits. Move only verified applied versions in the migration
   registry, update the boundary allowances and completion register, run required
   checks and merge the evidence PR. Sync the clean integration checkouts again.

## Recovery and scope

Each SQL file has its corresponding tested file under `supabase/rollback/`.
Recover in reverse dependency order, restoring function bodies without dropping
tables or rewriting player ballots, references, audits or scores. Select the
captured previous Pages deployment if the frontend needs reversal. Use the
compatible previous API only after checking its rules/error compatibility.

This release does not change the default app, launch Player Trends, enable
unrelated services, create competition entries or increase data-provider usage.
Physical-phone and genuine multi-connection PostgreSQL acceptance remain distinct
from browser emulation and PGlite results. No hosted mutation or deployment has
been performed by this release task as of this record.
