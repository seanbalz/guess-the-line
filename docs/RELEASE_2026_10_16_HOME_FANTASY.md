# Guess The Line — Home and Fantasy release, October 16, 2026

Owner: Sean Balsiger · Version 4 · Execution: Codex

Status: compatible Pages deployed and independently verified; D-47 weather SQL applied and verified; API deployment is next. Full feature acceptance remains pending.

## Authorization and source

Sean authorized merging #143 first, then #149 after all checks pass, followed by
deployment under the existing release checklist and live verification. No further
deployment approval is requested by this record. Credentials and passing release
gates remain prerequisites.

- Fantasy #143 reviewed head: `fc3e7081e7bb6a8b59fe5bc82e411c7be14076e5`.
- Home/comparisons #149 reviewed head: `b991396d63cfdb39ae0f13bd9b86da1d0d9d570d`.
  Reconciliation with #143 leaves its tree identical to the previously tested
  `63e0ba2c22064dae60f26db70d6743e924a9337e`; final-head CI is still required.
- The Fantasy correction permits only the documented presentation adapter and
  prevents rank-column clipping. The shared app shells remain separate.

The production-configured #149 frontend built successfully and passed the private
bundle scan: 96 artifacts, source SHA-256
`df08417169e65c332e36a1cb3d8b76737f38dbc699791b6716be6165e0d9e35f`,
frontend SHA-256
`ea537169ba9b573a9be3ba2775fc63f769e530691e1e9f9af9958db53c07ce25`.
This is an undeployed preparation manifest; the release workflow rebuilds and
verifies the exact merged source. Final-head #149 Node CI passed 1,442 tests with
zero skips or failures. All five checks passed on both reviewed heads before merge.

Merge read-back:

- #143: `6be5a8138a4805b2bbc46fb1b423e7b7d751f5ac`, 17:40:50 UTC.
- #149: `8942725746f199270d79fce562ac37cf92d64d69`, 17:44:57 UTC.
- Final release source: `8942725746f199270d79fce562ac37cf92d64d69`. Its tree is
  identical to the tested #149 head.

Final PR dashboard evidence: [#143](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38937585750)
and [#149](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38938180341).
The older intermediate-main Tests/Dashboard runs were cancelled after #149 merged
to unblock CI on the combined release source. No release gate was removed.
Exact final-main [Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38942064937),
[Dashboard](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38942064960)
and [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38942064945)
all passed on the pinned source. The [check-only release run](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38946664176)
also passed. Its downloaded source report confirms source, workflowSource and
fetchedMain all equal `8942725746f199270d79fce562ac37cf92d64d69`, target
`frontend`, and `deployed: false`. This does not establish hosted readiness.

## Verified access and live baseline

At 17:17 UTC on October 16, the signed-out boundary baseline returned 233 expected
denials and 27 probes awaiting deployment. Those pending probes include the
comparison and preferences routes/RPCs and existing core-scoring prerequisites;
they are not successful checks of absent features. Chrome opened the existing
authenticated Home screen successfully. This verifies current app availability,
not deployment or acceptance of the new features.

Chrome's Supabase session can read the intended project and its migration list.
The newest listed migration is `20261015143006`, `gtl_recommended_virtual_pick`.
The per-game scoring chain and new comparison/preferences migrations are absent
from that list. No replacement-function body/grant, score hash or fresh quiet
window is certified by this inventory read.

## Protected readiness — October 16, 2:58 PM Pacific

Both dedicated production secrets are saved in GitHub. Sean approved the
protected readiness job; [run 38971438272](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38971438272)
passed on `8942725746f199270d79fce562ac37cf92d64d69`. The source, dependency
install, production build/privacy scan, configuration, hosted preflight and
quiet-window checks all passed. No deployment or SQL apply occurred.

The downloaded read-only report at 21:58:12 UTC records:

- Target: `frontend`; `deployed: false`.
- Hosted migration count: 34; reviewed history SHA-256:
  `eb8e51838144388a3e6e287974347357421b5f3a2098821bd0e44e269c1977e9`.
- Quiet window: next 30 minutes passed against 29 games in the two newest
  published slates; newest published week is 2026 Week 6. Deployment repeats
  this check immediately before mutation.
- Current Pages: `ed3fb50b-388b-4330-8767-8bd08adb9255`, source
  `b883c7742979d133720ed931c520821fdc4a13b5`.
- Current API: `gtl-api` v24, ACTIVE, JWT verification enabled, bundle SHA-256
  `22bb9a8023a3804f640b33322c06aa168666894eb9ffbaac794ecc07b43a464a`.
- Other functions: odds-refresh v4, push-reminders v2, week-open v3.
- Boundaries: 233 expected denials; 27 explicitly pending probes. The 11
  NOT_HOSTED migration entries remain pending, including weather, the core
  scoring chain, Bets, comparison and preferences.

A separate read-only SQL-editor query at 21:59:24 UTC confirmed all five M-02
predecessor hashes, the D-47 weather predecessor
`027f2797275a447f49d080dfac787b2b`, and the M-04 social predecessor
`a7f96942d52ffd86c992a1fbccfc2a0b`. Each checked RPC has one signature, an empty
search path, service-role execute and no anon/authenticated execute. The Bets
and account-preferences tables are absent.

The same query captured 135 finished-week game scores and exactly one Week 5
anchor each at 95.8, 91.4 and 37.6. This task's reproducible, ordered JSON score
fingerprint is `d40a51d62a9e42393f5f95ff05f900fd`; settled Virtual Units has zero
rows and JSON-empty-array fingerprint `d751713988987e9331980363e24189ce`.
These use a different serialization from #148's earlier hashes and are a new
pre-mutation baseline, not a claimed equality to that earlier digest. The exact
SELECT-only query and full readback are retained in ignored local evidence.

The prepared first deploy is **frontend only**, source
`8942725746f199270d79fce562ac37cf92d64d69`, with the history digest above and
[this release card](https://github.com/seanbalz/guess-the-lines-repo/pull/150).
Compatible Pages must precede the D-47 weather SQL/API transition. Existing
per-game capability gates keep unhosted scoring unavailable; missing comparison
and preference routes degrade as covered by final-main CI. The default app
remains unchanged. The deploy workflow verifies served manifest bytes at the
immutable and production URLs and checks unchanged API/history. Rollback uses
the recorded prior Pages deployment; retain the compatible Pages if recovering
a later backend step. Subsequent SQL applies still require fresh Gate M evidence.

Credentials were created and entered by Sean directly in the providers and
GitHub. Cloudflare is Pages Write on the production account; Supabase is
Project Settings Read, Database Read and Edge Functions Read-write on the
production project. Both expire after 90 days. No token value is in this record.
The shared workflow has verified access; separate local login stores and the
Supabase connector's earlier denial do not describe this protected workflow.

## Pages and weather execution — October 16, 3:34 PM Pacific

[Frontend run 38973163044](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38973163044)
deployed source `8942725746f199270d79fce562ac37cf92d64d69` successfully to Pages
`0933a030-ff36-4a22-8cd7-fb2b7675863c`. The workflow is **failed**, because its
post-deploy verifier rejects Cloudflare's normal 308 HTML canonicalization for
`index.html`, `privacy.html` and `terms.html`. This is not a failed upload.
Independent verification requested the canonical HTML routes with redirects
still rejected: **95 of 95 served asset SHA-256 values match** at both
[the immutable deployment](https://0933a030.guess-the-line.pages.dev) and
[production](https://guess-the-line.pages.dev). All other asset paths are unchanged.
The manifest source/frontend digests match the preparation hashes above.

The verifier correction in #150 requests canonical HTML paths; regression tests
cover both origins, nested index pages, mismatched content and unexpected
redirects. It is a proposed repair, not yet part of the deployed source. The
API-only target does not execute the affected asset-verification branch.

Authenticated Home shows the newcomer guidance, weekly market cards, Compare
players and Fantasy Football preview. Comparison and preference backends remain
unavailable. Post-frontend boundary checks returned 233 expected denials and 27
explicitly awaiting-deployment probes (260 total). No production picks or settings
were changed. Multi-account and physical-phone acceptance remain pending.

After verifying Pages, a fresh 22:32:55 UTC quiet-window check covered 29 games
in the two newest published slates and passed for the next 30 minutes. The exact
repo weather migration `20261015120000_gtl_wind_refresh_schedule.sql` was applied
in a guarded transaction at 22:33:57 UTC and recorded as hosted version
**`20261016223357`**, name `gtl_wind_refresh_schedule`. The history row retains
verbatim migration and rollback SQL. Transaction assertions verified the prior
body, service-only grants and unchanged score/settlement fingerprints.

Independent SELECT readback at 22:34:26 UTC confirmed:

- `gtl_begin_wind_fetch` body MD5 `2ff30257c8a36ef04fa347be23ce5035` (prior
  `027f2797275a447f49d080dfac787b2b`), exactly one signature,
  `p_user uuid, p_request uuid, p_season integer, p_week integer, p_games jsonb`,
  empty search path, service-role execute only; anon/authenticated denied.
- All 135 finished-game scores and all three Week 5 anchors unchanged; score
  fingerprint `d40a51d62a9e42393f5f95ff05f900fd`. Settled count remains zero,
  fingerprint `d751713988987e9331980363e24189ce`.
- All five M-02 predecessors and the M-04 social predecessor unchanged.
  Bets/preferences tables remain absent.
- Hosted migration count **35**, canonical history SHA-256
  **`ba428e1d8fa7031951fcce63b79fb91bcb9213869ffb2b7b4f96e76bd3b9428b`**.
  This supersedes the pre-weather digest for the next deployment.

The migration registry moves only D-47 to APPLIED. Ten other migrations remain
NOT_HOSTED. The next protected run is **API only**, exact source
`8942725746f199270d79fce562ac37cf92d64d69`, with the new history digest and
#150 as release card. It must repeat hosted preflight and quiet-window checks,
then verify API version/JWT/bundle metadata, unchanged other functions/history
and signed-out boundaries. Retain compatible Pages during recovery; the prior
API is v24 with bundle hash recorded above. Weather rollback is the exact file
`supabase/rollback/20261015120000_gtl_wind_refresh_schedule.sql`, subject to the
same fresh gates. Core scoring and comparison/preferences applies follow only
after this compatible API is verified. Sean retains the final publish click.

Validation of the #150 repair and apply registry: 39 focused Node tests pass
with zero skips (including disposable PostgreSQL weather/rollback tests), and
brand/document QA passes. The post-weather signed-out boundary result is recorded
in local evidence; the absent comparison/core routes are not accepted features.

## Combined release order

Use one exact reviewed main SHA for the combined release. Do not deploy the older
#145 or #148 source over it. Keep the current app default and preserve all
NOT_HOSTED entries until actual hosted verification.

1. Require all final PR checks, merge #143 then #149, and require successful
   Tests, Dashboard checks and Brand QA **main push** runs on the final source.
   Dispatch `check-only`, then protected `readiness` under
   [the shared checklist](SHARED_DEPLOYMENT.md).
2. Refresh hosted history/digest, replacement-function bodies/grants, historical
   score and settlement hashes, the two newest published slates and quiet window.
   Coordinate the existing core-scoring release; old preflight is historical.
3. Preserve D-47's Pages-first transition: deploy compatible Pages, verify served
   manifest bytes, apply its weather migration under Gate M, then deploy the
   compatible API from the same source. Do not use the combined API-first target
   for this initial transition.
4. Follow the separately authorized core-scoring Gate M/D sequence, including
   M-02 alone in its required quiet window, through M-07. M-10 follows its M-01
   and M-04 prerequisites. This release record does not waive any named-apply,
   predecessor, quiet-window or historical-score checks.
5. After M-07 and its full chain, apply
   `20261016010000_gtl_score_comparison.sql`. After compatible API deployment,
   apply `20261016011000_gtl_account_preferences.sql`. Read back exact bodies,
   signatures, grants and unchanged existing scores. Never use generic db push.
6. Verify the final Pages/API state, private membership boundaries, reveal rules,
   separate Spread/Total comparisons, common-game counts, preferences/reload and
   account switching with two authorized test accounts. Verify mobile Light/Dark
   behavior without submitting or changing production player picks.

Comparisons must remain unavailable before M-07. Missing projections or expert
inputs must remain unavailable, not invented recommendations. Fantasy is an
attributed static Week 6 estimate snapshot, not an automatic weekly feed.

## Recovery and acceptance limits

Capture the current Pages ID and API version/bundle hash immediately before any
mutation. Use the existing weather/core rollback instructions and compatible
Pages. `GTL_FEATURE_OFF=comparisons` disables comparison reads;
`GTL_FEATURE_OFF=preferences` disables preference writes while retaining readable
versions. Preserve records and snapshots; no DROP or score re-anchoring.

The shared workflow verifies served frontend bytes. Its API metadata/bundle hash
does not independently prove source equivalence (`apiSourceVerified: false`).
Signed-in multi-account and physical-phone acceptance remain separate from CI.
See [the feature release contract](HOME_COMPARISONS_RELEASE.md) and the latest
[merged-release card](https://github.com/seanbalz/guess-the-lines-repo/pull/148).
