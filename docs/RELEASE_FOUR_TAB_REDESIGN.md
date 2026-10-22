# Guess The Line — four-tab redesign release

Owner: Sean Balsiger · October 21, 2026 · Deployed and verified (frontend only)

Sean authorized: “Check CI, fix anything that fails, then merge and deploy the
four-tab redesign.” [PR #162](https://github.com/seanbalz/guess-the-lines-repo/pull/162)
implements the approved **One thing first** design: Home, Play, Bets and Research.
League is under Play, Fantasy under Research, and existing editors open from
compact landing rows. The [build plan](superpowers/plans/2026-10-21-four-tab-simplification.md)
records implementation, local verification and acceptance limits.

## Release scope and recovery

Target: frontend only, through the protected Shared production release workflow.
Integration with newer main includes PR #164's relative-gap recommendation
ranking, PR #163/#165's separately applied private NBA archive, and PR #161's
trends research. The research API release has its own authorization and
[release card](TRENDS_RESEARCH_RELEASE.md); this frontend release must verify
its actual hosted version and compatibility at readiness. The new frontend retains
the existing API contracts, independent market gates, authenticated readers,
explicit ticket saves and old-app recovery path. The app-default switch is unchanged.

No database migration or collector change is part of this release. M-10 and both
D-53 migrations remain pending. Readiness must verify their actual hosted status
and provide a fresh migration-history digest before deployment.

Initial rollback baseline: Pages `dcfb977b-c388-4706-b728-d0c11e356228`, API v27.
Refresh this baseline if the independently authorized research release advances
production before readiness. Restore the prior Pages deployment while retaining
the current compatible API and all stored records. This does not delete or revert
picks, tickets, receipts, scores or groups. The protected production environment
and source/CI checks remain in force. The prior release's provenance is in the
[recommended tracking release](RECOMMENDED_TRACKING_RELEASE.md).

The independent [research release 39687111092](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39687111092)
subsequently verified Pages `0dde8b76-54c0-47e8-a0b0-08323bd60339` and API v29 at
22:34 UTC, from `fb86a3ea55bd91db1b1937dcd40ee70063d37716`. The four-tab merged
source changes no `cloud/`, `supabase/` or `shared/` files relative to that source.
Readiness must reconfirm this newer rollback and compatibility baseline.

## CI investigation

The first Typecheck and test and Persona jobs for reviewed head
`5f8c32fba3bd936c767cd40d18e8776054ca8382` failed during installation of the pinned
PGlite test runtime with npm `ECONNRESET`, before test execution. The test job's
retry installed the same dependency successfully and passed typechecking.

The broader local cloud-browser run found an obsolete Fantasy assertion:
the new app's retained Fantasy screen now returns to Research, while the test
still waited for “Back to Home.” The corrected assertion checks the Research
heading, active main tab and restored keyboard focus. The old app still returns
to Home. No product behavior was changed to accommodate the test. The corrected
four-case Fantasy suite passed in 54 seconds, including both apps' filters,
source details, keyboard access and light/dark layouts at 320, 390 and 1280px.
Brand/document QA and the whitespace check also passed.

Two other assertions needed the same navigation update: a legacy `#picks` link
now retains its default `market=spread` address, and Home's authenticated ticket
summary adds one `social/read` request per load. Their tests retain the selected
market check and exact shared-read/no-unexpected-write checks. The corrected
shell/switch browser suite passed all 28 cases, including legacy aliases, dirty
guards, Back/Forward, focus, scroll, reload and old-app recovery.

The full 271-case cloud-browser run finished with 268 passes and only those three
obsolete assertions failing; their corrected affected suites then passed 32/32.
Hosted CI subsequently found one stale architecture allowlist: the retained
Fantasy adapter reuses the existing `fantasyWeekKey` formatter to preserve a
snapshot week in its address. The named-import allowlist now explicitly includes
that helper, while default imports and other old-app shell imports remain
forbidden. The failure was reproduced locally before this correction, and all
12 app-view/boundary tests passed afterward. Brand/document QA also passed.

The final full local check then passed: 1,457 Node tests with zero skips,
198 Vitest tests, typecheck and production build. Hosted Node, Persona, Brand
and Windows checks passed too. Linux cloud-browser CI exposed a real 320px
layout defect: its wider fallback font pushed Research beyond the viewport in
six layout checks. The tab grid now reserves each label's intrinsic width with
small horizontal padding, preserving full labels, 16px text and touch targets.
A new browser regression reproduces wider text metrics on any host; it failed
before the CSS change and passed afterward. Token/navigation tests passed 20/20.
All eight affected layout/accessibility cases then passed locally, covering the
six Linux failure paths plus the wider-text regression and four-tab root flow.
Updated light/dark fixture screenshots were inspected; hosted verification must
pass on the new commit before merge.

While those checks were pending, main advanced through PRs #163 and #164. This
created three merge conflicts and prevented GitHub from starting the next PR
checks. Integration preserves both completion entries, the detail-specific Bets
heading with the newer contextual introduction, and both the All weeks return
regression and the recommendation card's new explicit expansion. Exact integrated
source must pass fresh CI before merge.
The integrated four-tab/recommendation browser run passed 13/13; focused
navigation/ranking Node tests passed 25/25 and landing/recommendation component
tests passed 9/9. Brand QA passed. The relative-gap computation runs in the
frontend against the existing authenticated API responses, so no API deployment
is required for the newer recommendation presentation.

PR #161 subsequently merged to main, followed by integration of the NBA closeout.
The two new conflicts preserve both completion entries and the Lines board's new
weekly-research action alongside the four-tab Trends matchup list. The research
sheet registry merges with the four root screens. The combined source requires
fresh PR and merged-main CI; the independent research API release is reconciled
from fresh hosted evidence before this frontend deployment.
The combined Lines/research/four-tab browser suite passed 12/12, including both
themes at 320px, read-only market boundaries, Back, stale replies, account changes
and quote/kickoff expiry. Component checks passed 32/32, navigation and architecture
checks 19/19, and Brand QA passed. No runtime change beyond conflict reconciliation
was needed for this integration.

The broader 278-case local browser run exposed a timing-dependent legacy-link
assertion: generic `#picks` leaves the market unspecified, then the retained
editor may add its selected default to URL metadata. The test now checks the
canonical destination and selected Spread button directly; explicit market links
still require their market metadata. The corrected legacy-link scenario passed
five consecutive runs. No application behavior changed for this correction.

## Required deployment evidence

PR #162 merged as `c6afb02e71b6c88d09212dfc525fe0fe59da64f9` from reviewed head
`74238117939929b7224546a4599a6ba64298d72a`. Its tree
`9dd01762fa42df2761fce0f4e35532fc5eeb1936` exactly matches the reviewed merge with
main's documentation-only PR #168. All five final PR checks passed:
[Tests and Windows](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39682783414),
[Dashboard and Persona](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39682783411),
and [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39682783500).
Results: 1,520 Node tests with zero skips, 217 component/engine tests, 278
authenticated browser tests, 41 legacy browser tests, four performance checks and
seven critical-path accessibility checks passed. The full local integrated
browser run had 277/278 passes and only the subsequently corrected legacy-link
assertion; the final hosted 278/278 result verifies that correction with the
complete suite. Latest fixture screenshots of all four roots were reviewed.

Windows `C:/Users/sbals/betting-repo`, Mini
`/Users/seanbalsiger/.codex/worktrees/shared-sync/betting-repo` and Neo
`/Users/seanbalsiger/betting-repo` passed sync:pull/check at the merged source on
October 21, 22:36–22:37 UTC, with zero ahead/behind/changed files. Neo used the
same synchronization script through its installed Codex Node runtime because
its SSH environment has no npm command. Other worktrees and ignored state remain
outside those checks.

## October 21 production evidence

Codex stopped at 23:06 UTC on a usage limit while waiting for merged-main CI.
Sean then handed the release lane to Claude Code: “finish the four-tab frontend
deploy from c6afb02 once main CI passes, then merge PR #169 and ship its API fix.”
The [PR #162 release card](https://github.com/seanbalz/guess-the-lines-repo/pull/162)
names the exact deploy inputs below.

All three required main-push workflows passed on the exact merge SHA:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39687544007),
[Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39687544264)
(including Persona) and
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39687544251).
`git diff fb86a3e..c6afb02 -- cloud supabase shared` is empty, so the hosted
research API stays compatible and unchanged.

- [Source check 39695324181](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39695324181) passed for `c6afb02`.
- [Protected readiness 39695405810](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39695405810) passed with hosted evidence at 23:45:52 UTC.
- [Protected frontend release 39695653304](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39695653304) passed, with live verification at 23:49:49 UTC.

Readiness and deploy both found 46 hosted migrations with SHA-256
`c571cd2de3d53ae0239a98d792cd0a1b542c2cbdda08190d2fa98ca4b126910f`, unchanged
after deploy. Pending repository migrations `20261015190820`, `20261016010000`
and `20261016011000` were not applied. The published Week 7 schedule (28 games)
passed with timing restrictions disabled. Before and after boundary checks each
covered 270 signed-out probes: 264 denials and the same six documented
pending-migration allowances.

Pages deployment `46fb8ae6-0df8-478c-8762-9607c2c6fdec` serves the exact
frontend source at [the immutable URL](https://46fb8ae6.guess-the-line.pages.dev)
and [production](https://guess-the-line.pages.dev). All 97 served assets at each
URL matched the manifest; frontend SHA-256 was
`86801ac6bafd555e5a002c17fd3cf4322b99334c99c0cc8a7f7820d54c65accd` and source
SHA-256 `02d8c1bfe7f7a77ad048a197483c53d7f6d4a97c3715d1a9c692ce9fded1b43b`.
An independent fetch of `/` from both URLs hashed to the manifest's
`index.html` value. Hosted `gtl-api` remained v29 ACTIVE with JWT verification
and bundle SHA-256 `de802dd78c3bb8e1b5eba843c92e8e2bd250a79a520f66634ae1d92279e8fe5b`;
the other four Edge functions kept their versions and digests. Rollback: restore
Pages `0dde8b76-54c0-47e8-a0b0-08323bd60339` (source `fb86a3e`) and keep API v29.

Read-only hosted snapshots at 23:44:35 UTC (before) and 23:50:13 UTC (after)
matched exactly in count and ordered whole-row MD5. Function bodies and ACLs
for `gtl_read_social`, `gtl_commit_social`, `gtl_follow_social`,
`gtl_mutate_personal` and `gtl_ballot_pick_scores` were also unchanged. These
used a project-scoped read-only connection, which cannot execute
`gtl_ballot_pick_scores`, so Week 5/6 score hashes were replaced by the ballot
hash plus that function's body hash. These hashes are not comparable with
earlier releases' tables (different connection, and players may have saved
entries in between); only this same-connection before/after pair is compared.

| Data | Rows | MD5 |
| --- | ---: | --- |
| Weekly ballots | 23 | `a45bf0bf9c59e4543407f544e86d6987` |
| Social commits | 101 | `ea8de1440cc94cda79f188eb3433ca7b` |
| Social weeks | 3 | `e2f2585903d04376035be78773b399fe` |
| Leagues | 5 | `a1f06fa4c7aadced4df70a33d57437fb` |
| Memberships | 9 | `04975f153218ad4228399f5929927c76` |
| Virtual Units picks | 7 | `7d4859aeb58ce26d13cd6a00274e6bb8` |
| Personal events | 17 | `962ad7b067517622e20c296c69af102e` |
| Personal receipts | 17 | `5410ce89048b9aa8b7ff3b21e6645f7f` |
| Personal versions | 6 | `c2b0a74efef7f28a05bdde8c88a47bb9` |

Journal entries, forecasts, favorites/notes, weekly selections, opt-outs,
forfeits, follows and follow receipts each had zero rows before and after.

Automated mobile/browser verification does not establish physical iPhone or
Home Screen acceptance. Those checks and the separate native iOS deliverable
remain open.
