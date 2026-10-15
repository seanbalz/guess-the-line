# Guess The Line — current completion register

Owner: Sean Balsiger · Version 1 · Evidence reviewed October 15, 2026 (Pacific)

This register separates delivered work from the remaining implementation and
acceptance work. Its deployed source baseline is `main` at `d71a988`; later
documentation commits record that release without changing its source. It summarizes the
[build plan][plan], rather than replacing its dependencies or numbered decisions.
Implementation owners below are **unassigned** unless named. Sean owns product
decisions and visual/phone acceptance. No delivery dates or completion percentage
are committed here.

The [October 15 release record](RELEASE_2026_10_15.md) records deployed formatting,
profile and private-note changes, their checks and outstanding acceptance. The
current-status headers in [cloud setup](CLOUD_SETUP.md),
[account access](ACCOUNT_ACCESS_REGISTER.md) and [social community](SOCIAL_COMMUNITY.md)
were published with PR #127; their archived entries remain unchanged.

## Verified delivery baseline

All five opt-in tabs—Home, Play, Bets, Lines and League—are live through the
[existing hosted workflows][scope]. The [October 15 release][release]
records Pages `fc7f3cd2-7a5a-461c-9aaa-fc5bc0247aa4` from
`d71a988dd118c0e9bce69d112dfc6b1b87507d74`, with 92/92 served assets matching the
production and immutable URLs. API v23 remains active with JWT verification.
All four required checks passed; this frontend release applied no SQL. The
read-only signed-in production walkthrough completed at 08:51:39 UTC in a
390 × 844 browser viewport, including the five tabs, profile/notes and old-app
roundtrip. No player-data writes were made. Fixture-based save tests remain
separate evidence from production writes or actual iPhone acceptance.

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
| Recommended bets (D-48) | Implemented; release validation in progress / Codex task | Top three guess-based discrepancies, expandable remainder, both-side traffic lights and explicit Virtual Units card review. Current Community week and own picks, independent of private-league week; two additive API routes and one new service-only writer. | [Feature contract](RECOMMENDED_BETS.md) | Tests and release evidence, no draft/locked-line disclosure, no silent bet write or replacement; phone acceptance remains separate. |
| Lines / game details | Partial / Unassigned | Live schedule, own references, records, trends and weather. Private-note editor shipped October 15 using hosted M-09/M-29, including recovery and existing long-note compatibility. Current sportsbook lines, book offers/movement and everyone's picks still need stages 32–34 and M-06/M-08. | [Release][release], [scope][scope], [migration inventory][migrations] | V; note save/recovery/conflict/privacy checks pass; remove later-update messages only when their gated readers are live; source/age and hidden-market checks pass. |
| League | Partial / Unassigned | Live Community feed, comments/likes, market boards/history and private weekly boards. Feed/reference styling and collapsible replies retaining drafts shipped October 15; visual acceptance remains. Native creation/invitations, season/Bets boards, new reactions/embeds and player/features screens remain (stages 57–71). | [Release][release], [plan][plan] | V; no combined Spread/Total rank; private data clears on scope changes; every retained post/record stays reachable. |
| Me / Settings / sign-in | Partial / Unassigned | Appearance including Reduce motion, sign-out and old-app access are live. The profile editor shipped October 15 with save/recovery and account-change protection. Expanded settings, information/legal/source pages, reminders/install and sign-in presentation remain (stages 37–39, 76); OAuth delivery is tracked below. | [Release][release], [scope][scope], [plan][plan] | V; profile save/recovery and account-isolation checks pass; settings persist as documented; accessible auth and install paths work without implying unconfigured services work. |
| History / export / commissioner tools | Partial / Unassigned | Community history is live; other records and tools remain in the old app. Build the native destinations for revisions, journal/forecasts, old Challenge/group records, export and commissioner pages (stages 72–78). | [Inventory homes][homes], [plan][plan] | V; owner-only data/export remains private; all preserved entries have working destinations before retirement. |
| Simulated-game section | In progress; unreleased / Codex, Sean acceptance | Sean selected animated replay with score/clock/player stats/captions and real NFL teams/players, with data/model checks before publication. A strict research ledger, isolated viewer, source adapter and next-play baseline pass local checks. Current PBP/rosters audited; full-game/player model, current availability, publication serving and acceptance remain open. | [Task #128](https://github.com/seanbalz/guess-the-lines-repo/issues/128), [implementation and gates](SIMULATED_GAME_REPLAY.md) | Reviewed real inputs, complete model/rules and held-out evaluation; authenticated delivery and mobile acceptance; exact-source release evidence. No demo or research result is live. |
| Brand and shared formatting | Partial; acceptance pending / Unassigned | Retain Guess The Line and the approved G identity; use current D-38 type, spacing, surfaces and motion consistently. Record any further brand decision separately from #126's formatting work. | [Brand guide][brand], [tokens][tokens], [#126][visual] | V across all sections; no unauthorized new brand direction, copied marks or fabricated decorative data. |

## Backend and release dependencies

These six merged migrations remain in `NOT_HOSTED`. Their code is not proof their
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
| M-07 per-game saving/scoring | Unbuilt / Unassigned | M-01/M-02/M-05 and compatible old-app code; implement D-39/D-41/D-43 in both apps together (stages 24/25). | [Decisions][decisions], [plan][plan] | Each locked guess scores independently; drafts close at kickoff; sit-out/history preserve locked guesses; gates and tests pass. |
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
| Automatic GitHub → application deployment | Requires decision / Unassigned | No automatic GitHub-to-Pages deployment is established by the manual release. Decide whether to add a protected pipeline consistent with migration/deploy gates. | [Access register](ACCOUNT_ACCESS_REGISTER.md), [release][release] | If requested, verify the actual merge-to-deploy path and failure/rollback behavior; otherwise retain the documented manual process. |
| Production and full-week acceptance | Acceptance pending / Sean | Complete the planned flows, then run one full live week with real entries/results, both market gates, Monday coverage, privacy, notes/history and relevant jobs. Phone checks remain distinct from browser fixtures. | [Cutover checklist][cutover] | Full-week evidence, Sean's phone acceptance, required CI, unchanged preserved data and strict live checks pass; pending shipped-route checks are resolved. |
| New default | Requires decision / Sean | Complete the cutover checklist, supporting screens and inventory destinations; obtain Sean's approval. The present five-tab bridge does not satisfy that checklist by itself. | [Cutover checklist][cutover] | Approved small default-switch PR, permitted deployment, retained fallback and verified rollback. |
| Old-app retirement | Unbuilt; acceptance pending / Unassigned | After the approved flip, at least **two full weeks** on the new default without a blocking bug; native commissioner/history/export destinations and Sean's OK. | [Retirement checklist](REDESIGN_BUILD_PLAN.md#retiring-the-old-app-stage-81-later-with-seans-ok) | All retained records reachable; safe removal of old screens only, no deleted tables/records; server retirement handled separately. |

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

Sources: current repository and GitHub issue/PR inspection at the baseline above;
dated release records establish deployment. Private Status Board contents and
unpublished work outside this checkout were not reconciled in this register.

[release]: RELEASE_2026_10_15.md
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
