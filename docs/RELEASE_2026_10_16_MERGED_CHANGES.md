# Merged weather and Bets release — October 16, 2026

Owner: Sean Balsiger · Execution: Codex · Status: authorized; blocked before deployment

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
was still running at preparation. Refresh its final result before dispatch.

## Verified access blockers

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

These are access/configuration blockers, not a request for another deployment
approval. No SQL apply, API deployment or Pages deployment was attempted.
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
5. For M-10, first verify M-01 and M-04 are hosted. If M-04 is absent, apply
   `20261015050000_gtl_social_line_lock.sql` after compatible API deployment and
   its Gate M checks. Then apply `20261015190820_gtl_bets_read.sql` and verify
   its new table, RLS, service-only grants, one RPC definition per signature and
   unchanged historical score/settlement hashes. Do not run a generic db push.
6. Record actual hosted versions and update NOT_HOSTED/awaitingDeploy only from
   successful readback. Other pending scoring migrations belong to the separate
   coordinated core-scoring release; M-10 itself requires M-01 and M-04.

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
