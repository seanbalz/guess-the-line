# Merged weather and Bets release — October 16, 2026

Owner: Sean Balsiger · Execution: Codex · Status: authorized; blocked before deployment

## October 16, 9:20 AM Pacific preflight update

The Mac mini's project-linked Supabase CLI now reaches the production project
`onmrgvcehkflfaizvedl`; the connector denial below describes the earlier task,
not this CLI's current access. All three exact-`main` push workflows (Tests,
Dashboard checks and Brand QA) passed on `521e7dc`. The release-card branch
differs from that SHA only in this document; its identical source tree built
the cloud frontend, passed the bundle privacy scan, and produced an
undeployed 99-artifact manifest (frontend SHA-256
`8cb7c19046c9b0350c7121047bd966af067e92e9edc5974624574dcc54f12c7c`).

The read-only live query at 16:19 UTC found no published game before Sunday
October 18, 6:30 AM Pacific. M-02, M-03, M-04 and M-10 are absent; live rules
remain `{revealAt: "kickoff", sentFinal: false, lateWindow: "deadline"}` and
`gtl_bet_versions` is absent. All five M-02 predecessor body hashes match its
file headers; `gtl_begin_wind_fetch` matches D-47's predecessor
`027f2797275a447f49d080dfac787b2b`, and `gtl_read_social` matches M-04's
predecessor `a7f96942d52ffd86c992a1fbccfc2a0b`. Every checked RPC has one
signature, `service_role` execute and no `authenticated` execute. The pinned
finished-week score hash is `cb51deda461c6049e24f7a1cbe950f4d` across 135
game scores; settled Virtual Units has zero rows and empty MD5
`d41d8cd98f00b204e9800998ecf8427e`. Refresh these checks at execution.

The current Wrangler OAuth login exposes account
`01f95c9d694864ce2322fe858948c21b` only. A read-only Pages project list
for the production account `83bd659d712e968e7a61efa14107465a` returned
Cloudflare authentication error 10000. Its Pages project is absent from the
default account's project list. Thus Pages cannot deploy from this login, and
the later SQL/API steps must wait for the required Pages-first transition.
No hosted write, SQL apply or deployment was attempted. The release tasks were
notified to avoid parallel execution.

## Source and authorization

Sean requested: “Move forward with deploying the merged changes. Follow the release checklist and dependency order, then verify the live app.”

Pinned source: `521e7dce2177fcf45099d2535481b5fb231135c6`, main after PRs
[#123](https://github.com/seanbalz/guess-the-lines-repo/pull/123),
[#139](https://github.com/seanbalz/guess-the-lines-repo/pull/139) and
[#146](https://github.com/seanbalz/guess-the-lines-repo/pull/146).
All fifteen final PR checks passed before merge. The merged tree is identical to
#146's tested head `b892e84452e8a5dd141b3aa8d0359d0e763a9548`.
The separate exact-main push checks are required by the shared release workflow:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38865480909)
and [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38865480918)
passed; [Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38865480948)
was still running at preparation; it passed in the October 16 preflight above.

## Earlier access blockers (superseded for Supabase CLI, still relevant to CI)

- GitHub's `production` environment has all five expected variable names but zero
  secrets; repository-level secrets are also empty. The shared workflow needs
  `SUPABASE_ACCESS_TOKEN` and `CLOUDFLARE_API_TOKEN` entered through the secure
  environment settings. No credentials were printed, copied or committed.
- The available Supabase connector returned `projects: []`; project metadata and
  migration history requests for `onmrgvcehkflfaizvedl` were denied with
  “You do not have permission to perform this action.”
- The pinned Supabase CLI reported “Access token not provided.” Consequently
  hosted migration state, replacement-function bodies/grants, historical score
  hashes and the live slate/quiet window could not be verified.

The Supabase CLI denial above no longer applies to the current Mac mini session;
the CI secrets and production Cloudflare account access still block their
respective release paths. These are access/configuration blockers, not a request
for another deployment approval. No SQL apply, API deployment or Pages deployment
was attempted.
The separate core-scoring release in #145 reports the same access blocker and
an older source SHA. Before either release proceeds, reconcile the active release
owner and source; do not run both release paths concurrently or later deploy the
older SHA over this release.

## Dependency order after access is restored

1. Confirm exact-main push CI, then run `check-only` for the pinned SHA and
   `frontend` target. Run protected `readiness`; review fresh migration history,
   its digest, hosted functions/grants and the two newest published slates.
   Require a passing 30-minute quiet window and capture historical score hashes.
   Do not substitute the older #142/#145 hosted snapshot for these checks.
2. Deploy the compatible Pages frontend first, as D-47 requires. Verify all
   served manifest assets at both immutable and production URLs. The new display
   accepts the old, more frequent weather updates; old Pages would incorrectly
   age the new D-47 snapshots. Keep the existing default app unchanged.
3. Apply `20261015120000_gtl_wind_refresh_schedule.sql` through Gate M only after
   confirming its predecessor body, grants and score hashes. Read back the
   replacement function and hosted migration version. Preserve all snapshots.
4. Refresh the readiness digest after that apply, then deploy `gtl-api` from the
   same source. This activates the new planner and provides M-10 error mapping
   before its SQL; verify ACTIVE/JWT metadata and signed-out boundaries.
5. Coordinate the approved core scoring release before Bets. Its recorded apply
   order starts M-02 → M-03 → M-04 after compatible Pages/API; M-02 is high risk
   and runs alone in its quiet window. Do not bypass it by treating the later
   M-04 as an independent first step. The remaining core sequence is M-08 → M-05
   → M-06 → M-07, each under its own Gate M/D requirements. Use the current
   `main` SHA, never deploy the older #145 source over this release.
6. For M-10, verify M-01 and M-04 are hosted, then apply
   `20261015190820_gtl_bets_read.sql` and verify
   its new table, RLS, service-only grants, one RPC definition per signature and
   unchanged historical score/settlement hashes. Do not run a generic db push.
7. Record actual hosted versions and update NOT_HOSTED/awaitingDeploy only from
   successful readback. M-10 itself requires M-01 and M-04.

The workflow's `api-and-frontend` target is unsuitable for the initial D-47
transition because it deploys API first. Use separate frontend then API runs,
with a release card and freshly reviewed migration digest for each. The shared
workflow does not apply SQL. A timeout requires state inspection before retry.

## Verification and recovery

Run bundle/privacy and live boundary checks; distinguish pending unrelated
migrations from successful denials. Verify signed-in Lines weather on board and
sheet, refresh timing and attribution, retained private notes, and M-10 reads
without exposing closed-market terms. Check account isolation and mobile layouts
without submitting production picks. Record any missing signed-in/device access
rather than claiming acceptance.

Before mutation, capture the current Pages deployment ID and API version/bundle
hash. D-47's rollback file restores the previous function without deleting
snapshots; M-04's rollback restores its prior reader. M-10 is additive: use
`GTL_FEATURE_OFF=bets` as its off switch, never drop retained records. Keep
compatible Pages while recovering backend pieces. The workflow verifies served
frontend bytes; API metadata does not independently prove source equivalence
(`apiSourceVerified: false`). Record that limitation in the completed release.

References: [shared release checklist](SHARED_DEPLOYMENT.md),
[Gate M/D](REDESIGN_BUILD_PLAN.md#4-gates),
[D-47 release order](DECISIONS.md#d-47--weather-every-24-hours-then-12-hours-and-2-hours-before-kickoff-october-15-2026).
