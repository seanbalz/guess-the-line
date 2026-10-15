# Guess The Line — current completion register

Owner: Sean Balsiger · Version 4 · Evidence reviewed October 15, 2026 (Pacific)

This register separates delivered work from the remaining implementation and
acceptance work. Its deployed source baseline is `b883c77`, freshly matched to
Pages `ed3fb50b` by the [October 15 audit][retirement-audit]. The current repository
review uses `c60ab49`, with PR #141's later per-game recovery source inspected at
`bb4f20a`; a later repository commit is not a deployed source claim. It summarizes the
[build plan][plan], rather than replacing its dependencies or numbered decisions.
Implementation owners below are **unassigned** unless named. Sean owns product
decisions and visual/phone acceptance. No delivery dates or completion percentage
are committed here.

The [recommendations release](RELEASE_2026_10_15_RECOMMENDATIONS.md) adds D-48 to
the [earlier October 15 release](RELEASE_2026_10_15.md), which records formatting,
profile and private-note changes. Both retain their acceptance limits. The
current-status headers in [cloud setup](CLOUD_SETUP.md),
[account access](ACCOUNT_ACCESS_REGISTER.md) and [social community](SOCIAL_COMMUNITY.md)
were published with PR #127; their archived entries remain unchanged.

## Active scoring implementation — October 15

The `codex/per-game-scoring` workstream implements the confirmed D-50 core:
per-game lock-in, immediate personal points, kickoff-based shared standings,
receipts and weekly score navigation/filtering. Its **local checks pass; hosted
activation and physical-phone acceptance remain pending**. [Implementation and release checklist](PER_GAME_SCORING_RELEASE.md)
records the owners, checks and remaining gates. The nine-row
[scoring backlog](../planning/scoring-and-player-trends.md) remains the detailed
scope; Trends metrics and comparison decisions are a later checkpoint.

## Verified delivery baseline

All five opt-in tabs—Home, Play, Bets, Lines and League—are already live through the
[existing hosted workflows][scope]. The [latest October 15 release][release]
records Pages `ed3fb50b-388b-4330-8767-8bd08adb9255` from
`b883c7742979d133720ed931c520821fdc4a13b5`, with 93/93 served assets matching the
production and immutable URLs. That release records API v24 active with JWT verification.
All four required checks passed. The single additive D-48 writer was applied;
the six pending redesign migrations remain unapplied. The signed-in read-only
walkthrough verified the current-week top three, expansion, 390px layout and
older-week view-only state. No production pick was saved. The earlier release
retains its five-tab/profile/notes walkthrough evidence. Fictional-account save
tests do not establish production placement or physical iPhone acceptance.

The fresh audit matched production metadata, HTML, entry JavaScript and NextApp
JavaScript to the canonical immutable deployment; it did not repeat the earlier
93-asset comparison, signed-in walkthrough or database checks. It also found an
older deployment URL still accessible. The former placeholder finding came from
a stale checkout; rebuilding all five tabs is not a retirement prerequisite.

The deployed old app remains the default and available as a fallback. **D-52 now
confirms the new app will become the only available app**, after record/workflow
preservation, draft recovery, missing destinations and access checks pass. The
[retirement tasks][retirement] distinguish that confirmed direction from pending
implementation. The last recorded hosted Guess rules are
`{revealAt: "kickoff", sentFinal: false, lateWindow: "deadline"}`:
whole-market Submit and deadline edits still apply. A working tab is not proof
that every planned screen, rule or visual treatment is complete.

| State | Meaning |
| --- | --- |
| Shipped live | A dated release and live readback establish the stated scope. |
| Implemented, not hosted | Code exists, but its required merge, apply or deployment has not happened. |
| Partial | Some of the stated scope is delivered; the row lists what remains. |
| Unbuilt | The planned replacement or capability has no completed implementation established here. |
| Requires decision | A scope, external configuration or approval choice remains. |
| Acceptance pending | Implementation or deployment exists; the specified real-world or visual check remains. |

## Visual acceptance shared by every section

**Photo 1 is the defect baseline: bad mobile Play formatting and lack of style
depth.** It is not an approved target. Photos 2–10 are references for spacing,
hierarchy and restrained depth, not approval of a new font, palette or copied
third-party design. [Issue #126][visual] remains open until Sean accepts the result.
Keep the original photographs private; Photo 1 contains account picks and saved
references. Public examples and test captures must use fictional or appropriately
redacted data.

Sean's later October 15 **Photo 1.jpg** reports a separate symptom on Bets →
Recommended: the bottom navigation crosses the middle of the scrolling cards.
[UX-NEXT-01 and BETS-NEXT-01][mobile-followups] add the navigation regression and
an All / Spreads / Totals recommendation filter. Both remain open; source matching
does not establish phone reproduction or a fix. These overlap #126's acceptance
scope, but this reconciliation did not update or close the external issue.

**V — visual exit condition:** consistent token-based page/card/inset surfaces,
padding and gaps; clear title, matchup, metadata and action hierarchy; aligned
controls; readable selected/focus/disabled states; 44px targets; no horizontal
overflow at 320px or 390px; all content scrolls above save bars and navigation,
including iPhone safe areas. Preserve source/time, missing/stale, provisional and
privacy labels. Review before/after phone screenshots in both themes and actual
iPhone Safari, with keyboard, reduced-motion, axe and brand checks. Sean's review
is required to mark visual quality accepted. Passing automation alone is not V.

The [D-38 brand guide][brand] and [new-app tokens][tokens] govern the new app;
the [classic tokens][classic-tokens] remain for the old app. The temporary editor
adapter is a [documented exception][scope], not the finished prototype replacement.

## App sections

| Work | State / implementation owner | Remaining work and dependency | Evidence | Exit condition |
| --- | --- | --- | --- | --- |
| Home | Partial / Unassigned | Weekly status, separate market ranks and Play navigation are live. Refine card hierarchy/spacing; finish first-run, next-action, other-week and later feature states (stage 36). | [Release][release], [plan][plan] | V; correct empty/unscored/zero states and the planned week transitions on real data. |
| Play | Partial / Unassigned | Live drafts, whole-market submission, permitted edits, sit-out and receipts. Card spacing, compact details/help, readable team controls and measured save-dock clearance shipped October 15; #126 acceptance remains. Per-game lock-in, skip/reveal, everyone's picks and Edge/results need their server gates (stages 28–32). | [Release][release], [scope][scope], [#126][visual] | V; existing save/recovery/privacy regressions pass; later per-game flows ship only with matching hosted rules. |
| Bets | Partial / Unassigned | Live tracker, corrections, reported results, following/history and selected-group Virtual Units. Form, summary, amount and action styling shipped October 15; UX-NEXT-01 adds the reported Recommended scrolling/navigation defect to visual acceptance. Account-level placement/boards, friend challenges and planned native replacement screens remain (stages 40–56). | [Release][release], [mobile tasks][mobile-followups], [plan][plan] | V and UX-NEXT-01; Community/group scope stays explicit; old records remain readable; new paths pass their apply and settlement gates. |
| Recommended bets (D-48) | Shipped live; follow-ups and phone acceptance open / Unassigned | Top three guess-based discrepancies, expandable remainder, both-side traffic lights and explicit Virtual Units card review. Current Community week and own picks, independent of private-league week. UX-NEXT-01 requires stable navigation while scrolling; BETS-NEXT-01 adds All / Spreads / Totals before the top-three limit. Neither follow-up is implemented by this audit. | [Feature contract](RECOMMENDED_BETS.md), [release][release], [mobile tasks][mobile-followups], [audit][retirement-audit] | Both task exits, preserved draft/locked-line privacy and explicit placement; actual production placement and phone acceptance remain separate from fixture tests. |
| Recommendation refinements (D-51) | Implemented on separate branch, not deployed / Codex | Inspected `3985acb` adds compact cards, offer-based ranking, forecast basis and reviewed-pick refinements. It lacks the requested market filter and navigation fix; coordinate edits to shared recommendation components. | [Audit][retirement-audit]; [PR #140](https://github.com/seanbalz/guess-the-lines-repo/pull/140), `codex/recommendation-refinements` at `3985acb` | Its own reviewed checks, merge/apply/deploy and readback; do not treat it as resolution of UX-NEXT-01 or BETS-NEXT-01. |
| Lines / game details | Partial / Unassigned | Live schedule, own references, records, trends and weather. Private-note editor shipped October 15 using hosted M-09/M-29, including recovery and existing long-note compatibility. Current sportsbook lines, book offers/movement and everyone's picks still need stages 32–34 and M-06/M-08. | [Release][release], [scope][scope], [migration inventory][migrations] | V; note save/recovery/conflict/privacy checks pass; remove later-update messages only when their gated readers are live; source/age and hidden-market checks pass. |
| League | Partial / Unassigned | Live Community feed, comments/likes, market boards/history and private weekly boards. Feed/reference styling and collapsible replies retaining drafts shipped October 15; visual acceptance remains. Native creation/invitations, season/Bets boards, new reactions/embeds and player/features screens remain (stages 57–71). | [Release][release], [plan][plan] | V; no combined Spread/Total rank; private data clears on scope changes; every retained post/record stays reachable. |
| Me / Settings / sign-in | Partial / Unassigned | Appearance including Reduce motion, sign-out and old-app access are live. The profile editor shipped October 15 with save/recovery and account-change protection. Expanded settings, information/legal/source pages, reminders/install and sign-in presentation remain (stages 37–39, 76); OAuth delivery is tracked below. D-52 removes classic links and error fallbacks at stage 80 after preservation checks. | [Release][release], [scope][scope], [retirement tasks][retirement], [plan][plan] | V; profile recovery/account isolation, settings and supported auth/install paths verified; no classic escape remains after cutover. |
| History / export / commissioner tools | Partial / Unassigned | Community history is live. Before stage 80, finish accessible destinations for revisions, Week 5 freeze evidence, journal/archive/forecasts/Favorites, old Challenge/group records, export, league/invite administration and commissioner operations (stages 47, 59, 72–78). Verify existing shared modules instead of rebuilding their delivered workflows. | [Inventory homes][homes], [audit][retirement-audit], [retirement tasks][retirement], [plan][plan] | Owner-only data/export remains private; every retained category and required operation works through the new app before classic access is removed. |
| Draft and unsaved-work preservation | Partial; new per-game recovery merged, not hosted / Unassigned | Live new Play reuses Community recovery through `WeekPicks`/`communityDraft.js`. PR #141 at `bb4f20a` adds Community/Solo retained-copy readers in `PerGamePlay` with explicit Use unlocked drafts, behind `perGameReady`; hosted availability and acceptance remain open. Group recovery is still missing. Protect memory-only bet/slip edits and uncertain saves, plus existing notes/profile/comment recovery before forced refresh. | [Audit][retirement-audit], [PR #141](https://github.com/seanbalz/guess-the-lines-repo/pull/141), RETIRE-01 in [retirement tasks][retirement] | Verify per-game capability gating, same-account retained copies, explicit unlocked adoption, server readback/uncertain saves, conflicts, expired/locked readable copies and account isolation. No draft silently submitted or lost; uninspected devices remain explicit gaps. |
| Simulated-game section | In progress; unreleased / Codex, Sean acceptance | Sean selected animated replay with score/clock/player stats/captions and real NFL teams/players, with data/model checks before publication. PR #131 merged the viewer/research foundation; PRs #135 and #136 add verified matchup inputs, stricter observed reconstruction, prior-game usage audits, 2026 clock administration, evaluation metrics and a league-wide score-pair baseline. The baseline evaluates 544 historical development games; it does not validate the proposed team/player simulator. Availability, full live-play/player generation, prospective evaluation, serving and acceptance remain open. | [Task #128](https://github.com/seanbalz/guess-the-lines-repo/issues/128), [implementation and gates](SIMULATED_GAME_REPLAY.md), [aggregate baseline](../model/reports/replay-paired-score-baseline-2026-10-15.json) | Reviewed real inputs, complete model/rules and held-out evaluation; authenticated delivery and mobile acceptance; exact-source release evidence. No replay result is live. |
| Brand and shared formatting | Partial; acceptance pending / Unassigned | Retain Guess The Line and the approved G identity; use current D-38 type, spacing, surfaces and motion consistently. Record any further brand decision separately from #126's formatting work. | [Brand guide][brand], [tokens][tokens], [#126][visual] | V across all sections; no unauthorized new brand direction, copied marks or fabricated decorative data. |

## Backend and release dependencies

The six previously merged migrations and the local M-07 implementation remain in `NOT_HOSTED`. Their code is not proof their
behavior is live. Each apply follows [Gate M][gates]: explicit approval, prior-body
and historical **score** hashes, tested rollback/off switch, function/grant
readback, recorded hosted version and the applicable live checks. A ballot-content
checksum from a frontend release does not replace the score hash. **Never run a
generic `npx supabase db push` against this project.**

| Work | State / implementation owner | Dependency / next action | Evidence | Exit condition |
| --- | --- | --- | --- | --- |
| M-02 final Guess picks | Implemented, not hosted / Unassigned | Sean must explicitly say **“apply M-02”**. Preserve Week 6 edit rights; apply alone in the recorded Friday–Saturday window after the TNF deadline. Repair/verify fail-safe live-rule error handling first. | [AGENTS](../AGENTS.md), [release][release], [gates][gates] | Gate M complete; both apps report actual finality; no editable-state fallback during transient rule-read errors. |
| M-03 skip / See picks now | Implemented, not hosted / Unassigned | M-01 is hosted; coordinate the skip UI and retained locked-pick behavior with M-07. Quiet-window approval remains. | [Migrations][migrations], [plan][plan] | Gate M; warnings, forfeiture and retained scoring match the live rule version. |
| M-04 real-slip line gate | Implemented, not hosted / Unassigned | M-01 and compatible Pages/API; protect locked leg values, notes/change reasons and Tail. | [Migrations][migrations], [plan][plan] | Gate M; four-moment leak checks across tracker/feed and both apps. |
| M-05 Monday-night collection | Implemented, not hosted / Unassigned | Apply alone in the approved Tuesday–Wednesday window; verify current plus previous unstarted games within the existing free budget. | [Migrations][migrations], [plan][plan] | Gate M; next scheduled collection succeeds with correct coverage and quota accounting. |
| M-06 current-line readers | Implemented, not hosted / Unassigned | M-01, M-02, M-04 and stages 20/21 live; connect stages 32/33 after those dependencies. | [Migrations][migrations], [plan][plan] | Gate M; permitted current/book/kickoff lines show and hidden lines remain absent from responses. |
| M-08 everyone's picks reader | Implemented, not hosted / Unassigned | M-01; corresponding UI and M-07 per-game scoring adaptation remain separate. | [Migrations][migrations], [plan][plan] | Gate M; per-game visibility, removed-member records and score labels verified. |
| M-07 per-game saving/scoring | Implemented locally; checks pass / Codex SQL, API and UI lanes | Pending M-02/M-03/M-04/M-05/M-06/M-08 and compatible app release; explicit apply window remains. Both apps follow the server capability. | [Implementation checklist](PER_GAME_SCORING_RELEASE.md), [plan][plan] | Each locked guess scores independently; drafts close at kickoff; sit-out/history preserve locked guesses; gates and tests pass. |
| Immediate personal scoring and player trends (D-50) | Core implemented locally; Trends discovery open / Codex core lanes; Trends unassigned | Lock-in, immediate personal points, weekly score browsing/filters and kickoff-only shared standings pass local checks; hosted and device acceptance remain. Trends metrics, samples, periods and audience remain decisions. Existing migration and privacy gates apply. | [Recovered planning and provenance](../planning/scoring-and-player-trends.md), [D-50][decisions] | Each task's acceptance conditions pass with hosted/phone evidence where required; imported planning is not delivery. |
| Remaining redesign services | Unbuilt / Unassigned | Account-level Bets, friend challenges, league/social features, awards, history/export and their jobs need the staged APIs/SQL in phases 4–6. Follow D-39 amendments, including the dropped tester-list stage. | [Plan][plan] | Each capability has code, tests, hosted evidence and its matching screen; a planned migration number alone is not completion. |
| D-47 weather schedule | Implemented on draft PR, not hosted / Unassigned | [PR #123][weather] at `a2b5270`; review/reconcile with current main. Compatible Pages first, then its separately approved migration/API sequence. | [PR release card][weather] | Green reviewed head, merge, ordered deployment/apply and readback; no claim of the new schedule before that. |

## Accounts, operations and acceptance

| Work | State / implementation owner | Dependency / next action | Evidence | Exit condition |
| --- | --- | --- | --- | --- |
| Auth and ordinary onboarding | Partial / Unassigned | Hosted authenticated app works. Verify Google setup/consent, invitation return, existing-account identity, ordinary signup/recovery and a second device; older setup documents are not live readback. | [Google setup](GOOGLE_SIGN_IN_SETUP.md), [access register](ACCOUNT_ACCESS_REGISTER.md) | Real supported account flow and cross-device persistence verified without moving existing records. |
| Two-hour web push | Acceptance pending / Unassigned | Migration, VAPID and cron were enabled October 14; sender is v2. Confirm actual iPhone Home Screen opt-in, due delivery and notification tap. | [Push setup](WEB_PUSH_SETUP.md), [earlier release](RELEASE_2026_10_09.md#october-14-deploy), [latest release][release] | Actual delivery and deep link evidenced, with opt-out and deduplication; service deployment alone is insufficient. |
| Other notifications | Requires decision / Unassigned | SMS, email alerts, movement alerts, commissioner summaries and corrected-result notices are outside the delivered D-28 reminder. Reconcile older promises with current decisions and free-only constraints before assigning builds. | [Rules](RULES.md), [access register](ACCOUNT_ACCESS_REGISTER.md) | Explicit current scope; any retained channel implemented, consented and delivery-tested, or explicitly deferred. |
| Slates, collection and settlement operations | Partial / Unassigned | Community Week 6 is live; latest private Triple Threat observation was Week 5. Verify intended private slate handling. Manual final-score settlement exists; scheduled settlement/features jobs and run monitoring need their later stages. | [Release][release], [D-26 runbook](../planning/virtual-units-game.md), [plan][plan] | Correct weeks labelled; permitted finals, correction/void handling and scheduled-run/failure evidence recorded; manual status remains explicit until automation is live. |
| Free odds, models and outside feeds | Partial; requires decision / Unassigned | The Odds API is connected. TheRundown's proposed free multiplayer use is not cleared in the provider record. Outside projections/splits/sharp feeds need rights and data; the historical GTL model is not a verified current forecast. | [Provider evaluation](ODDS_PROVIDER_EVALUATION.md), [model validation](MODEL_VALIDATION.md) | Only permitted, sourced, timestamped inputs ship; current model validation supports every forecast claim, or the feature stays unavailable. |
| Native iPhone application | Requires decision; unbuilt / Unassigned | Mobile web/Home Screen use is separate. No Swift/Xcode client is established in this repository; native distribution and any paid membership need their own scope/budget decision. | [Issue #5](https://github.com/seanbalz/guess-the-lines-repo/issues/5), [access register](ACCOUNT_ACCESS_REGISTER.md) | An explicit native deliverable is built and device/distribution tested, or its deferral is recorded. Do not count the PWA as native delivery. |
| Current GitHub → live release | Shipped live / Unassigned | Latest release used the Mac mini's manual deploy after green checks. Future changes still need an exact SHA, preflight, build, permitted deploy window and asset/backend readback. | [Release][release], [Gate D][gates] | Each new release has its own dated source, checks, hosted evidence and rollback reference. |
| Shared GitHub → application deployment | Setup in progress / Codex; Sean owns release approval | Sean authorized the recommended shared path October 15. A manual exact-commit workflow is being added; the production environment and main-only restriction are configured with Sean as reviewer and public project variables populated. Supabase and Cloudflare deployment secrets and the first hosted workflow run remain outstanding. No merge-triggered deploy or database apply is enabled. | [Shared deployment setup](SHARED_DEPLOYMENT.md), [release][release] | Workflow merged, required secrets provisioned securely, check-only and approved release evidence verified, including failure/rollback behavior. Current Mac mini release path remains available. |
| Production and full-week acceptance | Acceptance pending / Sean | Complete the planned flows, then run one full live week with real entries/results, both market gates, Monday coverage, privacy, notes/history and relevant jobs. Phone checks remain distinct from browser fixtures. | [Cutover checklist][cutover] | Full-week evidence, Sean's phone acceptance, required CI, unchanged preserved data and strict live checks pass; pending shipped-route checks are resolved. |
| New-only app at stage 80 (D-52) | Direction confirmed; implementation and acceptance open / Unassigned | Complete RETIRE-01 preservation inventory, missing destinations, draft recovery, admin/export and access verification; then RETIRE-02/03 remove classic default, stored/query choices, menus, failure fallbacks and hosted entry points. All five tabs already exist. | [Audit][retirement-audit], [retirement tasks][retirement], [cutover checklist][cutover], [D-52][decisions] | Exact-source release, new-app record/workflow readback, phone acceptance and supported hosted-access checks pass. Operator recovery uses a compatible new-app build or controlled recovery state, not a player-facing classic fallback. |
| Old UI source cleanup at stage 81 | Open; follows verified new-only cutover / Unassigned | RETIRE-04 removes unused screens/styles after RETIRE-03. D-52 supersedes the two-week classic fallback requirement; source cleanup does not delay access removal. Preserve `WeekPicks`, `SocialBetTracker`, `VirtualUnits`, `HistoryLine` and any other modules/styles/readers still used by the new app. | [Retirement tasks][retirement], [inventory homes][homes], [cutover checklist][cutover] | Dependency/bundle checks and preserved-record/recovery tests pass; no deleted tables, records or historical evidence; server retirement remains separate. |

## Ledger maintenance

The [191-item inventory][inventory] is a frozen October 13 baseline; its
[inventory homes][homes] map those historical features to destinations. The count
is neither current scope nor a completed-work count. Reconcile actual destinations
and add later capabilities to RETIRE-01's preservation evidence without rewriting
the frozen inventory. Complete that proof before stage 80 removes classic access. The frozen
`planning/project-tracker.json` and generated historical tracker remain untouched;
reconcile this register with Sean's private Status Board when that artifact is
available, without claiming an unverified synchronization.

| Ledger work | State / owner | Dependency and evidence | Exit condition |
| --- | --- | --- | --- |
| Issues #1–#9 | Partial / Unassigned | [Open issues](https://github.com/seanbalz/guess-the-lines-repo/issues): October 8 starter bodies contain obsolete rules and service assumptions. #1 remains open for its unverified starter-archive audit. #3/#7 are closure/supersession candidates: the backend and independent Total game are delivered, while common-kickoff scoring was superseded by D-16/D-27. Split remaining work from #2/#4/#5/#6/#8 and replace #9's outdated provider premise. | Review each original scope, link delivered evidence and successor tasks, then record completed, superseded or deferred precisely. No closures are implied by this register. |
| Issue #126 | Acceptance pending / Sean | [Original Photo 1 defect and visual criteria][visual]; related October 15 Recommended scrolling report in [UX-NEXT-01][mobile-followups]. This reconciliation did not update or close the external issue. | V accepted and linked to the actual release; actual scrolling/phone evidence required; functional tests alone cannot close it. |
| Stale current-status documentation | Partial / Unassigned | Current headers in `CLOUD_SETUP.md`, `ACCOUNT_ACCESS_REGISTER.md` and `SOCIAL_COMMUNITY.md` were reconciled in PR #127; this evidence update points them at the October 15 deployment. `RULES.md` now records hosted M-01 and the frozen public tracker, and `AGENT_HANDOFF.md` separates the current handoff from its preserved October 8 text. Other historical rule/status notes have not all been reconciled. | Keep current pointers aligned with dated evidence and retain labelled history; reconcile remaining conflicts individually. |
| Update this register | Partial / Unassigned | A merged PR, hosted apply/deploy or acceptance result changes a row. | Record the specific evidence and new state together. Do not mark local work live or an external setup complete from a plan. |
| Local/cloud repository handoff | Implemented; verification required per checkout / Each task owner | Use a separate worktree, reviewed commits/pushes and `npm run sync:check`. Six local planning files were preserved and reconciled in the shared-sync branch; the original shared checkout remains untouched. | [Sync workflow and recovery](REPOSITORY_SYNC.md) | At each handoff, matching local/remote branch commits, 0 ahead/behind and no unpublished files; separately report PR merge, deployment and private artifacts. |
| Windows development and local recovery | Implemented; verification required per checkout / Codex | Local recovery uses protected Windows ACLs, preserving POSIX permissions on macOS/Linux. Git race and UI tests use portable execution/paths; a Windows CI job covers the affected suites. | [Recovery contract](OPERATIONS_RUNBOOK.md#local-recovery); 30 focused tests passed on Windows Node 24, including independent read-only review. | Green full suite and PR checks; verify each machine against the merged commit with `npm run sync:check`. Local recovery and source sync do not establish hosted restore or deployment. |

Sources: current repository review, the separately inspected D-51 branch and the
[fresh public-asset/deployment audit][retirement-audit]; dated releases retain
their original backend and walkthrough evidence. Private Status Board contents,
uninspected devices and other unpublished work were not reconciled. External
issue #126 was linked, not updated.

[release]: RELEASE_2026_10_15_RECOMMENDATIONS.md
[scope]: ALL_TABS_LIVE_WORKFLOWS.md
[plan]: REDESIGN_BUILD_PLAN.md
[gates]: REDESIGN_BUILD_PLAN.md#4-gates
[cutover]: REDESIGN_BUILD_PLAN.md#10-cut-over-checklist-d-38
[decisions]: DECISIONS.md
[brand]: BRAND_GUIDE.md#d-38-redesign-system-the-new-app--october-14-2026
[tokens]: ../design/tokens-next.json
[classic-tokens]: ../design/tokens.json
[migrations]: ../tests/migrations.mjs
[inventory]: redesign/INVENTORY.md
[homes]: redesign/INVENTORY_HOMES.md
[visual]: https://github.com/seanbalz/guess-the-lines-repo/issues/126
[weather]: https://github.com/seanbalz/guess-the-lines-repo/pull/123
[retirement-audit]: RETIREMENT_AUDIT_2026_10_15.md
[retirement]: ../planning/new-app-retirement.md
[mobile-followups]: ../planning/mobile-bets-followups.md
