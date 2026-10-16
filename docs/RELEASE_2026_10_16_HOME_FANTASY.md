# Guess The Line — Home and Fantasy release, October 16, 2026

Owner: Sean Balsiger · Version 2 · Execution: Codex

Status: #143 and #149 merged in order; exact-main CI and source verification passed; deployment blocked pending credential setup.

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

The Supabase connector denied project access and the pinned CLI on this task's
host reported no access token. The separate #148 release record reports working
Supabase CLI access on the Mac mini; that does not establish access here.
GitHub repository and production-environment secret inventories were empty;
the production inventory remained empty after source verification.
The local Wrangler OAuth login exposes account
`01f95c9d694864ce2322fe858948c21b`, while production requires
`83bd659d712e968e7a61efa14107465a`.

Add the existing production-scoped `SUPABASE_ACCESS_TOKEN` and
`CLOUDFLARE_API_TOKEN` through GitHub's secure production environment settings,
preserving its reviewer and main-only policy. Do not put credentials in this
record or chat. No SQL apply, API deployment or Pages upload has been attempted
by this release task.

Credential setup uses scoped tokens, entered directly into GitHub:

- Cloudflare: `GTL GitHub Releases`, restricted to production account
  `83bd659d712e968e7a61efa14107465a`, Cloudflare Pages **Edit**. Save it as
  `CLOUDFLARE_API_TOKEN`. See [Cloudflare's Pages token requirements](https://developers.cloudflare.com/pages/configuration/api/).
- Supabase: `GTL GitHub Releases`, restricted to project
  `onmrgvcehkflfaizvedl` in Gambling, Project Settings **Read**, Database **Read**,
  Edge Functions **Read-write**. Save it as `SUPABASE_ACCESS_TOKEN`.
  The workflow reads migration history through its read-only SQL preflight and
  does not apply migrations. See [Supabase's scoped token permissions](https://supabase.com/docs/guides/platform/personal-access-tokens).

Credential creation/entry remains in the user's provider and GitHub interfaces;
this record contains no token value or copied login store. Sean requested setup
help; Chrome is left at Apple sign-in for the intended Cloudflare account.
No token has been created or entered by this task. Protected readiness,
deployment and new-feature live acceptance remain incomplete.

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
