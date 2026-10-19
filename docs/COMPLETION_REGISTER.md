# Guess The Line — current completion register

## October 19 - release timing policy

Sean permanently removed deployment and migration time gates. The release
preflight validates schedule evidence without rejecting active games or calendar
windows. All ten targeted preflight tests passed, covering former freezes and
retained evidence checks. Production scoring migration/deployment completion
remains separate; no hosted changes are established by this policy change.

Owner: Sean Balsiger · Version 5 · Evidence reviewed October 15, 2026 (Pacific)

This register separates delivered work from the remaining implementation and
acceptance work. Its deployed source baseline is `main` at `b883c77`; later
documentation commits record that release without changing its source. It summarizes the
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

## October 16 — approved Home and comparisons follow-up

Implementation branch `codex/home-comparisons` integrates Fantasy #143 and adds
D-53 Home guidance, weekly score context, scoped comparisons and account settings.
See [the release record](HOME_COMPARISONS_RELEASE.md) for dependency order,
verification and the explicit not-deployed state. Frozen v62 remains unchanged.
Ranked model-based wagers remain unavailable until validated sources exist.


## Current PR reconciliation — October 15

Source reviewed: `origin/main` at `bb4f20a095de61ac283b62cfee819d533470fa39`.
The eight source PRs below were read directly from GitHub. Their implementation,
validation and release reports are attributed to those PRs; this reconciliation
performed no hosted preflight, deployment, database apply or phone acceptance.
Open PR content is not yet part of `main`. The release baseline below remains
separate from the newer repository source.

| PR / source reviewed | Current state | Remaining work |
| --- | --- | --- |
| [#142](https://github.com/seanbalz/guess-the-lines-repo/pull/142), `b2f0758` | Open documentation; records #141's merge and scoring release approval | Merge/reconcile the approval evidence. Its earlier timing question is answered by #145; refresh its hosted preflight at execution. |
| [#145](https://github.com/seanbalz/guess-the-lines-repo/pull/145), `757f23e` | Draft release card; authorized and prepared, not deployed | Usable Supabase access and a fresh passing quiet-window/hosted preflight. Sean's one-time weekday exception is recorded; do not request that approval again. |
| [#144](https://github.com/seanbalz/guess-the-lines-repo/pull/144), `7a383d4` | Draft documentation; D-52 retirement and mobile follow-ups | UX-NEXT-01 navigation/scrolling, BETS-NEXT-01 All / Spreads / Totals before limiting results, and RETIRE-01–04 preservation/recovery/destinations/access closure. No runtime fix or retirement is delivered by the audit. |
| [#143](https://github.com/seanbalz/guess-the-lines-repo/pull/143), `64c3d2a` | Open implementation; Fantasy rankings, scoring filters and weekly trends | Verify current-head CI, merge and coordinate one exact-source frontend release. Static Week 6 estimates; no automatic refresh or D/ST. No migration required; not deployed. |
| [#147](https://github.com/seanbalz/guess-the-lines-repo/pull/147), `22c418f` | Open requirements; Fantasy Usage Tracker analysis added to PLAY-05 | Usage/actuals, weekly and rest-of-season projections, private league context and partial-source behavior remain deferred. Reconcile with #143’s narrower static rankings implementation; source rights, roster access and refresh integration are not delivered. |
| [#140](https://github.com/seanbalz/guess-the-lines-repo/pull/140), `ae25212` | Draft implementation; offer-based recommendations and private forecasts | Current-head checks, merge/apply queue, additive edit-writer migration and compatible release/readback. Earlier green checks belong to earlier SHAs. Does not complete #144's market filter or navigation repair. |
| [#123](https://github.com/seanbalz/guess-the-lines-repo/pull/123), `a9f3b2b` | Draft weather schedule; main conflicts resolved and pushed | Retains D-47, D-48/D-50, private notes and the weather watcher. A follow-up keeps the published slate kickoff in weather views instead of an older static trends kickoff; 49 view checks and all four targeted browser checks pass, including refresh timing and Light/Dark accessibility at 320/390/1440px. GitHub reports mergeable; full current-head CI remains pending. Retain Pages-before-SQL/API release order. |
| [#139](https://github.com/seanbalz/guess-the-lines-repo/pull/139), `224098c` | Open M-10 Bets reader; main conflicts resolved and pushed | Preserves M-07 and M-10 dependency metadata and both NOT_HOSTED entries. GitHub reports mergeable. The staged M-06 schema test now scans only its installed readers; 19 Lines SQL tests pass. The same published-kickoff fix from #123 is included, with 49 related view checks passing; full CI is rerunning. Follow M-04 → M-10 hosted dependencies. Account-level placement and native screens remain separate. |

Conflict-resolution order: first reconcile this register, then #123's independent
weather branch, then #139 against the already merged scoring prerequisites.
The features are independent, but #139 now includes #123 for final integration
validation: their pending migration entries collided, and both are retained.
#146 includes that combined source so its final checks cover the merge result.
Merge order is #123 → #139 → #146 after passing checks; the inherited changes
drop out of each later PR as its predecessor merges. Preserve all
`NOT_HOSTED` entries and dependency declarations. Resolving source conflicts does
not establish an apply, main merge or deployment.

Local validation also passed typecheck, brand docs, migration headers and cloud
build/boundary checks on the reconciled branches. Weather passed 95 focused
Node/SQL checks and 190 Vitest tests before its kickoff follow-up; the follow-up
passed 49 related view checks and four browser scenarios. Bets passed 84 focused
Node/SQL checks, two rollback metadata checks, 188 Vitest tests and all 19 Lines
SQL tests after the staged-reader correction. Local exhaustive runs were stopped
to avoid resource contention; no full local-suite pass is claimed. Full GitHub
CI is rerunning on the combined final heads; earlier green checks are not final-head
release evidence.

## Active scoring implementation — October 15

PR #141 merged the D-50 core: per-game lock-in, immediate personal points,
kickoff-based shared standings, receipts and weekly score navigation/filtering.
**Implementation is merged; hosted activation and physical-phone acceptance
remain pending.** #142 records approval and earlier hosted preflight; #145 records
the later authorized production release at the first verified quiet window.
The latter supersedes the former's unanswered weekday/timing question. Execution
still requires usable Supabase access and fresh live checks; its release chat
already has an hourly follow-up, so this task does not create another monitor.

The recorded core apply order is **M-02 → M-03 → M-04 → M-08 → M-05 → M-06 → M-07**,
after compatible Pages/API and collector prerequisite checks. This is an
execution dependency order, not filename sorting or a generic database push.
The [implementation checklist](PER_GAME_SCORING_RELEASE.md) and nine-row
[scoring backlog](../planning/scoring-and-player-trends.md) retain the detailed
scope; Trends metrics and comparison decisions remain a later checkpoint.

## Verified delivery baseline

All five opt-in tabs—Home, Play, Bets, Lines and League—are live through the
[existing hosted workflows][scope]. The [latest October 15 release][release]
records Pages `ed3fb50b-388b-4330-8767-8bd08adb9255` from
`b883c7742979d133720ed931c520821fdc4a13b5`, with 93/93 served assets matching the
production and immutable URLs. API v24 is active with JWT verification.
All four required checks passed. The single additive D-48 writer was applied;
the six pending redesign migrations remain unapplied. The signed-in read-only
walkthrough verified the current-week top three, expansion, 390px layout and
older-week view-only state. No production pick was saved. The earlier release
retains its five-tab/profile/notes walkthrough evidence. Fictional-account save
tests do not establish production placement or physical iPhone acceptance.

The old app remains the default and available as a fallback. Hosted Guess rules
remain `{revealAt: "kickoff", sentFinal: false, lateWindow: "deadline"}`:
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
| Bets | Partial / Unassigned | Live tracker, corrections, reported results, following/history and selected-group Virtual Units. Form, summary, amount and action styling shipped October 15; visual acceptance remains. Account-level placement/boards, friend challenges and planned native replacement screens remain (stages 40–56). | [Release][release], [plan][plan] | V; Community/group scope stays explicit; old records remain readable; new paths pass their apply and settlement gates. |
| Recommended bets (D-48) | Shipped live; phone acceptance pending / Unassigned | Top three guess-based discrepancies, expandable remainder, both-side traffic lights and explicit Virtual Units card review. Current Community week and own picks, independent of private-league week; two additive API routes and one new service-only writer. | [Feature contract](RECOMMENDED_BETS.md), [release][release] | Live reads and fixture save tests passed; actual production placement and phone acceptance remain separate. Preserve draft/locked-line privacy and explicit placement. |
| Lines / game details | Partial / Unassigned | Live schedule, own references, records, trends and weather. Private-note editor shipped October 15 using hosted M-09/M-29, including recovery and existing long-note compatibility. Current sportsbook lines, book offers/movement and everyone's picks still need stages 32–34 and M-06/M-08. | [Release][release], [scope][scope], [migration inventory][migrations] | V; note save/recovery/conflict/privacy checks pass; remove later-update messages only when their gated readers are live; source/age and hidden-market checks pass. |
| League | Partial / Unassigned | Live Community feed, comments/likes, market boards/history and private weekly boards. Feed/reference styling and collapsible replies retaining drafts shipped October 15; visual acceptance remains. Native creation/invitations, season/Bets boards, new reactions/embeds and player/features screens remain (stages 57–71). | [Release][release], [plan][plan] | V; no combined Spread/Total rank; private data clears on scope changes; every retained post/record stays reachable. |
| Me / Settings / sign-in | Partial / Unassigned | Appearance including Reduce motion, sign-out and old-app access are live. The profile editor shipped October 15 with save/recovery and account-change protection. Expanded settings, information/legal/source pages, reminders/install and sign-in presentation remain (stages 37–39, 76); OAuth delivery is tracked below. | [Release][release], [scope][scope], [plan][plan] | V; profile save/recovery and account-isolation checks pass; settings persist as documented; accessible auth and install paths work without implying unconfigured services work. |
| History / export / commissioner tools | Partial / Unassigned | Community history is live; other records and tools remain in the old app. Build the native destinations for revisions, journal/forecasts, old Challenge/group records, export and commissioner pages (stages 72–78). | [Inventory homes][homes], [plan][plan] | V; owner-only data/export remains private; all preserved entries have working destinations before retirement. |
| Simulated-game section | In progress; unreleased / Codex, Sean acceptance | Sean selected animated replay with score/clock/player stats/captions and real NFL teams/players, with data/model checks before publication. PR #131 merged the viewer/research foundation; PRs #135 and #136 add verified matchup inputs, stricter observed reconstruction, prior-game usage audits, 2026 clock administration, evaluation metrics and a league-wide score-pair baseline. The baseline evaluates 544 historical development games; it does not validate the proposed team/player simulator. Availability, full live-play/player generation, prospective evaluation, serving and acceptance remain open. | [Task #128](https://github.com/seanbalz/guess-the-lines-repo/issues/128), [implementation and gates](SIMULATED_GAME_REPLAY.md), [aggregate baseline](../model/reports/replay-paired-score-baseline-2026-10-15.json) | Reviewed real inputs, complete model/rules and held-out evaluation; authenticated delivery and mobile acceptance; exact-source release evidence. No replay result is live. |
| Brand and shared formatting | Partial; acceptance pending / Unassigned | Retain Guess The Line and the approved G identity; use current D-38 type, spacing, surfaces and motion consistently. Record any further brand decision separately from #126's formatting work. | [Brand guide][brand], [tokens][tokens], [#126][visual] | V across all sections; no unauthorized new brand direction, copied marks or fabricated decorative data. |

## Backend and release dependencies

The seven merged core migrations, including M-07, remain in the repository's `NOT_HOSTED` list. Their code is not proof their
behavior is live. Each apply follows [Gate M][gates]: explicit approval, prior-body
and historical **score** hashes, tested rollback/off switch, function/grant
readback, recorded hosted version and the applicable live checks. A ballot-content
checksum from a frontend release does not replace the score hash. **Never run a
generic `npx supabase db push` against this project.**

| Work | State / implementation owner | Dependency / next action | Evidence | Exit condition |
| --- | --- | --- | --- | --- |
| M-02 final Guess picks | Implemented, not hosted / Unassigned | Core release approval and a one-time weekday exception are recorded in #142/#145. Apply separately after fresh quiet-window, predecessor, historical-score and live-rule checks; usable Supabase access remains the reported blocker. | [AGENTS](../AGENTS.md), [release][release], [gates][gates] | Gate M complete; both apps report actual finality; no editable-state fallback during transient rule-read errors. |
| M-03 skip / See picks now | Implemented, not hosted / Unassigned | M-01 is hosted; coordinate the skip UI and retained locked-pick behavior with M-07. The core release quiet-window check remains; approval is recorded in #145. | [Migrations][migrations], [plan][plan] | Gate M; warnings, forfeiture and retained scoring match the live rule version. |
| M-04 real-slip line gate | Implemented, not hosted / Unassigned | M-01 and compatible Pages/API; protect locked leg values, notes/change reasons and Tail. | [Migrations][migrations], [plan][plan] | Gate M; four-moment leak checks across tracker/feed and both apps. |
| M-05 Monday-night collection | Implemented, not hosted / Unassigned | The core release has the #145 weekday exception; apply separately after fresh quiet-window checks and verify current plus previous unstarted games within the existing free budget. | [Migrations][migrations], [plan][plan] | Gate M; next scheduled collection succeeds with correct coverage and quota accounting. |
| M-06 current-line readers | Implemented, not hosted / Unassigned | M-01, M-02, M-04 and stages 20/21 live; connect stages 32/33 after those dependencies. | [Migrations][migrations], [plan][plan] | Gate M; permitted current/book/kickoff lines show and hidden lines remain absent from responses. |
| M-08 everyone's picks reader | Implemented, not hosted / Unassigned | M-01; corresponding UI and M-07 per-game scoring adaptation remain separate. | [Migrations][migrations], [plan][plan] | Gate M; per-game visibility, removed-member records and score labels verified. |
| M-07 per-game saving/scoring | Merged in #141; hosted activation pending / Codex SQL, API and UI lanes | Pending M-02/M-03/M-04/M-05/M-06/M-08 and compatible app release; the authorized core release still requires a fresh passing quiet-window check. Both apps follow the server capability. | [Implementation checklist](PER_GAME_SCORING_RELEASE.md), [plan][plan] | Each locked guess scores independently; drafts close at kickoff; sit-out/history preserve locked guesses; gates and tests pass. |
| Immediate personal scoring and player trends (D-50) | Core merged in #141; Trends discovery open / Codex core lanes; Trends unassigned | Lock-in, immediate personal points, weekly score browsing/filters and kickoff-only shared standings pass local checks; hosted and device acceptance remain. Trends metrics, samples, periods and audience remain decisions. Existing migration and privacy gates apply. | [Recovered planning and provenance](../planning/scoring-and-player-trends.md), [D-50][decisions] | Each task's acceptance conditions pass with hosted/phone evidence where required; imported planning is not delivery. |
| Remaining redesign services | Partial; M-10 implemented on open PR #139 / Unassigned | Account-level Bets read is on #139, not hosted; account-level writers, friend challenges, league/social features, awards, history/export and their jobs need the staged APIs/SQL in phases 4–6. Follow D-39 amendments, including the dropped tester-list stage. | [Plan][plan] | Each capability has code, tests, hosted evidence and its matching screen; a planned migration number alone is not completion. |
| D-47 weather schedule | Implemented on draft PR, not hosted / Unassigned | [PR #123][weather] at `a9f3b2b`; reconciled with current main; targeted view/browser checks pass, full CI and review remain. Compatible Pages first, then its separately approved migration/API sequence. | [PR release card][weather] | Green reviewed head, merge, ordered deployment/apply and readback; no claim of the new schedule before that. |

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
| New default | D-52 direction recorded in open PR #144; implementation pending / Sean acceptance | #144 records a new-app-only cutover after preservation, recovery, missing destinations and access checks. Reconcile its detailed plan before implementation; the deployed classic default remains unchanged. | [Cutover checklist][cutover] | Preservation and phone checks, an exact-source new-only release, hosted-access verification and operator recovery without a player-facing classic fallback, as recorded in #144. |
| Old-app retirement | Unbuilt; acceptance pending / Unassigned | Open PR #144 records D-52 superseding the two-week classic fallback requirement. RETIRE-01–04 still require preservation, recovery, missing destinations, hosted access closure and verified cutover before unused source cleanup; preserve modules still used by the new app. | [Retirement checklist](REDESIGN_BUILD_PLAN.md#retiring-the-old-app-stage-81-later-with-seans-ok) | All retained records reachable; safe removal of old screens only, no deleted tables/records; server retirement handled separately. |

## Ledger maintenance

The [191-item inventory][inventory] and [inventory homes][homes] map existing
features to destinations; neither is a completed-work count. Reconcile each row's
actual destination before the old app retires. The frozen
`planning/project-tracker.json` and generated historical tracker remain untouched;
reconcile this register with Sean's private Status Board when that artifact is
available, without claiming an unverified synchronization.

| Ledger work | State / owner | Dependency and evidence | Exit condition |
| --- | --- | --- | --- |
| Issues #1–#9 | Partial / Unassigned | [Open issues](https://github.com/seanbalz/guess-the-lines-repo/issues): October 8 starter bodies contain obsolete rules and service assumptions. #1 remains open for its unverified starter-archive audit. #3/#7 are closure/supersession candidates: the backend and independent Total game are delivered, while common-kickoff scoring was superseded by D-16/D-27. Split remaining work from #2/#4/#5/#6/#8 and replace #9's outdated provider premise. | Review each original scope, link delivered evidence and successor tasks, then record completed, superseded or deferred precisely. No closures are implied by this register. |
| Issue #126 | Acceptance pending / Sean | [Photo 1 defect and visual criteria][visual]; section work above. | V accepted and linked to the actual release; functional tests alone cannot close it. |
| Stale current-status documentation | Partial / Unassigned | Current headers in `CLOUD_SETUP.md`, `ACCOUNT_ACCESS_REGISTER.md` and `SOCIAL_COMMUNITY.md` were reconciled in PR #127; this evidence update points them at the October 15 deployment. `RULES.md` now records hosted M-01 and the frozen public tracker, and `AGENT_HANDOFF.md` separates the current handoff from its preserved October 8 text. Other historical rule/status notes have not all been reconciled. | Keep current pointers aligned with dated evidence and retain labelled history; reconcile remaining conflicts individually. |
| Update this register | Partial / Unassigned | A merged PR, hosted apply/deploy or acceptance result changes a row. | Record the specific evidence and new state together. Do not mark local work live or an external setup complete from a plan. |
| Local/cloud repository handoff | Implemented; verification required per checkout / Each task owner | Use a separate worktree, reviewed commits/pushes and `npm run sync:check`. Six local planning files were preserved and reconciled in the shared-sync branch; the original shared checkout remains untouched. | [Sync workflow and recovery](REPOSITORY_SYNC.md) | At each handoff, matching local/remote branch commits, 0 ahead/behind and no unpublished files; separately report PR merge, deployment and private artifacts. |
| Windows development and local recovery | Implemented; verification required per checkout / Codex | Local recovery uses protected Windows ACLs, preserving POSIX permissions on macOS/Linux. Git race and UI tests use portable execution/paths; a Windows CI job covers the affected suites. | [Recovery contract](OPERATIONS_RUNBOOK.md#local-recovery); 30 focused tests passed on Windows Node 24, including independent read-only review. | Green full suite and PR checks; verify each machine against the merged commit with `npm run sync:check`. Local recovery and source sync do not establish hosted restore or deployment. |

Sources: current repository and the seven GitHub PR heads listed above;
dated release records establish deployment. Private Status Board contents and
unpublished work outside this checkout were not reconciled in this register.

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
