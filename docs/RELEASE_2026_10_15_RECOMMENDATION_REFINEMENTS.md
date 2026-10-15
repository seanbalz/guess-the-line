# Guess The Line — recommendation refinement release card

Owner: Sean Balsiger · Implementation: Codex · October 15, 2026

Status: implemented on `codex/recommendation-refinements`, based on `main` at `94ef9987d6f2184484eb9e7fe8318c6d817647f6`. Focused validation passed; final full-suite and CI results belong to the PR checks. **Not applied or deployed.** The existing D-48 release remains Pages `ed3fb50b` / API v24 from `b883c77`; see its [dated record](RELEASE_2026_10_15_RECOMMENDATIONS.md).

## Scope

[D-51](DECISIONS.md) records Sean’s “Move forward with recs” approval: actual-offer comparisons, actionable top three, explicit quote changes, removable reviews, optional personal forecasts, current-week pick edits and compact summaries. [The feature contract](RECOMMENDED_BETS.md) contains the behavior and service boundaries. This release preserves the old-app default, scoring references, submitted guesses, private visibility and free collection limits.

## Apply and publication hold

The local clock was October 15 at 12:08 PM Pacific when work resumed. [Gate D](REDESIGN_BUILD_PLAN.md#43-gate-d-deploys) says: “Freeze windows (no deploy, no apply): Thu 12:00 PM PT until 1 h after the Thursday kickoff”. No override was requested. Recheck the actual published slate, quiet period and the chosen release workflow’s more conservative game-window guards before any apply or deploy; elapsed time alone is not release approval.

The migration PR stays draft and unmerged until it is next in the apply queue (Gate M); restamp after the newest migration on main at merge. This is separate from the deployment freeze. The new unapplied migration is `20261015190955_gtl_edit_recommended_virtual_pick.sql`. Apply only that additive service-only function after Gate M preflight, with prior function bodies and historical ballot/score hashes, recorded hosted version/body/grants, and preserved history readback. Never use generic database push. M-02/M-03/M-04/M-05/M-06/M-08 remain out of scope and unapplied by this task.

Use the [shared release workflow](SHARED_DEPLOYMENT.md) once its required secrets and first verified run are established, or the existing authenticated Mac mini release path under the same gates. A merged PR alone is not hosted deployment. Keep JWT verification enabled.

## Verification register

### October 15 deployment request and fresh preflight

Sean subsequently requested **“Deploy”**, authorizing this recommendation release
and its necessary additive edit writer. A one-time exception to the active
Thursday freeze was requested separately and remains unanswered. No hosted
mutation has occurred in this release attempt. The separate per-game scoring
release must be sequenced with this release; its M-02/M-08/M-07 activation is not
included in a recommendation-only exception.

At **20:31 UTC / 1:31 PM Pacific**, a SELECT-only hosted preflight confirmed:

- Published Week 6 has 14 games; Thursday kickoff is **5:15 PM Pacific**. The
  shared workflow's actual quiet-window function rejects starts through
  **11:15 PM Pacific**, with 11:16 PM the first whole-minute start, subject to
  another fresh check. No release is scheduled by this record.
- The new edit function and migration history row are absent. The existing
  placement function has one signature, source MD5
  `da5c1747a0c095b4ff37a4b56053802a`, security invoker, and service-role-only
  execution. The expected new edit source MD5 is
  `aaadb107e60b096438ac01ed54d7126c` (local PGlite evidence).
- Historical ballots: 9, MD5 `f25cea85d98688f716412725258396b3`;
  historical scores: 9, MD5 `a94e272b5a29042e747ce92bc7a3b7ee`.
  All virtual picks, settled results and settlement ledger rows are each zero,
  MD5 `d751713988987e9331980363e24189ce`. These match the prior release baseline.
- Migration history: 34 rows, MD5 `a7b67824af41f4c8ea638c9c42a6e654`;
  the six unrelated pending redesign migrations remain absent.
- API v24 remains ACTIVE with JWT verification. The existing project-isolated
  Cloudflare login confirms Pages `ed3fb50b-388b-4330-8767-8bd08adb9255` from
  `b883c77`; public entry HTML/JS/CSS match that immutable deployment. This
  three-file readback is not a new all-assets release verification.

The reviewed PR head `3985acb06e45fbeaa4d873ef2a26caa967713121` passed all five
CI checks, including 1,388 Node, 184 Vitest, 41 local browser, **254 cloud
browser**, 16 persona, four performance and seven accessibility tests. Main
advanced during deployment preparation; integrated-source verification and its
exact final release SHA must be recorded before publication. The source at
`7845c8f97ef46c9c7275773a2a2365e3df8de078` includes `c60ab49`, passes typecheck
and the cloud build/privacy scan, and has the same frontend digest
`5a386fea5c39c452b9d0b63bf19aeab0f1693bf7709e460bb5435bafb55a641f`.
It does not yet include the subsequently merged per-game source `bb4f20a`.
That intermediate source also passed 1,400 Node tests, 184 Vitest tests and all
23 focused browser cases (17 recommendation and six classic Virtual Units).
The subsequent integration commit `6a483d45a775e1282075a3b8b96aefafc2e222e4`
includes main at `bb4f20a095de61ac283b62cfee819d533470fa39`; its single rules-table
conflict retains both the updated scoring implementation state and D-51's
recommendation rules. Integrated checks are tracked on PR #140. Source
synchronization does not apply the per-game migrations or activate their rules.

| Check | Current evidence | Exit condition |
| --- | --- | --- |
| Logic | 24 helper tests passed, including offered-line ranking, consensus matches, and forecast fail-closed gates | Actual offer direction, consensus separation, actionable rank and forecast gate cases pass |
| API/SQL | 106 combined API/SQL/boundary/migration/off-switch checks passed, followed by 46 SQL/API checks including four real two-account/current-and-historical-week privacy reads | Revision, quote, kickoff, own-account, audit, missing RPC and off-switch tests pass |
| Browser and brand | 17 recommendation browser scenarios passed; four axe/overflow combinations (390/320, dark/light); first 390px card starts at y518 and its 44px Add action ends at y771.5, above navigation at y780. Typecheck, cloud build/bundle privacy scan, token and brand checks passed | New regression file; 390/320 dark/light, compact row, keyboard, 44px targets, minimum type, no overflow and axe pass |
| Required CI | Tracked on the refinement PR; local final full-suite rerun was in progress when this card was prepared | All required checks green on reviewed commit; exact merged source checks before deployment |
| Hosted apply/deploy/readback | Held | Permitted window, Gate M/D, release source and served assets/API/function evidence |
| Real placement and phone acceptance | Not performed | Explicit real-account acceptance evidence; fictional fixture saves do not establish this |

Local historical checks: preserved Week 5 source SHA-256 remains `a4ee8f13c4b58777767dbd94a022dbc0a721ff6ece90522e4ddf4e25d2d9f1dd`; snapshot arithmetic check, 9 Python tests and 158 model tests passed with zero skips after restoring the pinned public-data cache. These do not establish live score/odds verification. Phone screenshots use fictional fixtures and stay under ignored `.local/previews/`. The task supplied no new prototype-canvas markup; none is claimed retrieved or accepted. Sean's visual/physical-phone acceptance remains open.

## Rollback and limits

The edit-only SQL off switch, `supabase/admin/disable_recommended_virtual_pick_edit.sql`, retains all records. `GTL_FEATURE_OFF=recommendation-edits` disables only the edit API; `recommendations` disables the whole recommendation feature. Keep the previous known-good frontend/API as rollback artifacts. Forecast records use the already hosted personal mutation and its existing audit; no new forecast table or automatic odds refresh is introduced. Gate D requires compatible Pages first for the additive response shape, then API error mapping, then the edit migration. The forecast editor stays disabled when the older API omits its personal revision; missing edit service/RPC fails closed. Do not claim editing live until all three layers and readback pass.

No physical iPhone acceptance, production pick write, new settlement automation, predictive model, paid data, or external sportsbook wager is established by this change. The private screenshots remain outside the public repository.
