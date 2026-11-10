# Guess The Line — current completion register

## Migration apply packet prepared — November 10, 2026

The [apply packet](MIGRATION_APPLY_PACKET_2026_11_10.md) covers all seven `NOT_HOSTED`
migrations (M-33, M-34, M-35 and the four November 10 files, proposed as M-42 to M-45
because M-41 is reserved by open PR #497): dependencies and filename apply order,
replaced-body md5s, read-only preflight, score and preservation hashes, apply method,
verification, off switches, follow-up deploys/schedule rows, the Player Props readiness
Task 2 queries and Sean's apply phrases. It records that M-40 is hosted in every repo
record, and flags that M-34 must not be applied after M-44 as written (job constraint
without `results`) and that M-43's RPCs have no boundary probes. Supabase was
unavailable: no hosted value was observed and nothing was applied or deployed.
Packet version 2 (apply-order fixes PR) resolves both: unapplied M-34's constraint
statement now widens to its list plus `results` plus every job already accepted, so any
apply order is safe (`tests/epl-apply-order-sql.test.mjs`; new M-34 SHA-256
`9f8479c764eb2a7fd800740542cf2785db54b53144b32be832a69ef506148b16`, 15669 bytes, function
md5s unchanged), and `scripts/boundary/epl-score-import.mjs` probes M-43's four tables,
three RPCs and two routes as awaiting deploy. The M-35/M-43 next-week order precedence is
documented as a run-time rule for Sean (packet contradiction 7). PR #519's
`20261110160000_gtl_player_props_jobs.sql` joins the packet as proposed M-46 (after M-45;
jobs secrets and `GTL_PLAYER_PROPS_JOBS` stay unset, then dry runs). Still nothing applied.

## Fantasy defensive-matchup insights merged — November 10, 2026

PR #517 merged as `0944bc2003780aa88b173c6aaf99b746f273cd83`: defensive-matchup views
for fantasy-relevant QB/RB/WR/TE and defense ranking tables on Research › Fantasy, built
by the scheduled Fantasy refresh from reuse-licensed nflverse/FTN releases (CC BY / CC
BY-SA attribution shown). **Merged, not deployed**: the frontend needs a release, and data
appears with the first scheduled Fantasy refresh after merge. No API, worker, migration or
Supabase change.

## EPL Sleeper screenshot score import merged — November 10, 2026

PR #515 merged as `2d54ae7b250ab422c86910d53334ea2671e65e8f` (EPL delivery stage 3):
on-device OCR (tesseract.js, assets self-hosted under `/ocr/`), commissioner review of
all eight scores and an atomic, audited import that opens the next draft. The API and
Pages are in deploy run 42744392202 (`api-and-frontend` at `2d54ae7b`), **pending
approval** at the time of writing. Migration `20261110110000_gtl_epl_score_import.sql`
(proposed M-43) is **not applied**. Real-screenshot phone acceptance, the boundary probes
and the hosted `nudge`/`fixtures` state remain open.

## Player Props mode merged dark — November 10, 2026

PR #514 merged as `bf29c5d6d2c1f71d259094bd4dbeae45255308dd` (D-82): native-unit
domain, storage, `/props/*` API and lazy frontend screens, all off by default. Included in
deploy run 42744392202, **pending approval**; the routes answer 404 while `GTL_PLAYER_PROPS`
is unset, and that secret is not to be enabled. Migration
`20261110130000_gtl_player_props.sql` (proposed M-45) is **not applied**. The readiness
Task 2 hosted audit and the offer/result ingestion jobs are still to do.

## EPL Pick a Team result announcements merged — November 10, 2026

PR #512 merged as `dfda1263a96c7450dee73643681bdca31b3c0e17` (EPL delivery stage 4):
results cards on EPL Home and Pick a Team from verified finals, a deduplicated opt-in push
and the bounded `results` job. API and Pages are in deploy run 42744392202, **pending
approval**. Migration `20261110120000_gtl_epl_result_announcements.sql` (proposed M-44) is
**not applied**; the `gtl-epl-jobs` deploy and `supabase/admin/epl_results_cron.sql`
(row created disabled) follow the apply, and enabling `results` is a separate step.

## EPL three-way moneyline and EPL Bets merged — November 10, 2026

PR #513 merged as `ddf859099e7c6dc12f3867af7416638fbdc6f419` (EPL delivery stages 1-2):
draw-no-bet or three-way entry with one guess per match, market-aware references and
collection, combined leaderboard and account-scoped EPL Bets recommendations. API and
Pages are in deploy run 42744392202, **pending approval**; they stay two-way until the
schema reports the capability. Migration `20261110100000_gtl_epl_three_way_moneyline.sql`
(proposed M-42) is **not applied**; a compatible `gtl-epl-jobs` deploy is also needed for
timed three-way collection.

## Points layout check measured after animation — November 10, 2026

PR #516 merged as `7afeb773fa35e49c3edcc6c3685aa76680a1dcd3`: the 320 px layout check in
`next-points.spec.js` waits for the restored card's back animation to settle. Test-only;
no application change and no deploy needed (the commit is included in `2d54ae7b`).

## Prior week's unfinished game stays visible — November 10, 2026

PR #511 merged as `0f656617916d63d67c7ab4e6932233ccfd7f6548`: a "Still playing from Week
N" card on Home, Play and Research › Games keeps a prior week's unfinished game (Monday
night, late or postponed) with the viewer's own guesses after the next week opens. Reads
only the existing gated `/lines/read`; locks and reveals unchanged. **Deployed**:
frontend-only release run 42733238277 (success). No API or migration change; real-phone
acceptance is not established by the release.

## Gap period follow-up fixes and mockups — November 9, 2026

The [post-release review and fix evidence](GAP_PERIOD_FOLLOWUP_REVIEW_2026_11_09.md)
record both PR #505 follow-ups fixed locally: period/applied-range intent survives
recommendation-week changes and Refresh lines, and expanded records include all
rows when the period grows. The existing account and read guards remain. Both
regressions failed before the fixes and passed after; 22 unique recommendation
browser cases, 39 Node checks, six UI checks and build/QA passed. Actual-component
[Dark/Light mockups](../design/gap-period-fixes-2026-11-09/index.html) use synthetic
data. Owner review, exact CI, merge, protected deploy and real-phone acceptance
remain separate. PR #507 still owns the prior release-evidence reconciliation.

## Comparable NFL gap scale checked locally — November 9, 2026

[D-81](DECISIONS.md) replaces percentage-of-line gap ranking with a shared
historical scale calibrated separately for Spread and Total. Sean chose the
NFL-wide baseline and top-quarter Large highlight. The
[implementation evidence](NFL_GAP_SCALE_2026_11_09.md) records the frozen
2016–2025 sample, reproducible aggregate, shared ranking/colors/history filter,
source limitations and verification. This is review work, not a merge or release
claim. No saved pick/reference, API, migration, provider or collector changes.

## Player Props design approved; source audit partial — November 9, 2026

Sean approved both Dark/Light boards with alignment to the rest of the app as a
condition. [D-82](DECISIONS.md) and the
[approved design](superpowers/specs/2026-11-09-player-props-design.md) preserve
optional athlete/stat selection, separate native-unit average-miss accuracy,
entry-only market hiding and the existing shared Prism components/navigation.

The [readiness audit](PLAYER_PROPS_READINESS_2026_11_09.md) verifies all eleven raw
stat fields in a checksum-matched public Week 1–9 source. Hosted prop-quote,
roster/event, quota and final-result readiness is unverified: the Supabase
connection requires reauthentication. The
[read-only readiness plan](superpowers/plans/2026-11-09-player-props-readiness.md)
keeps those unknowns distinct from observed absence. No Player Props mode,
migration, provider-credit request, collector activation or deployment is included.

The [full Player Props visual packet](../design/player-props-review-2026-11-09/README.md)
adds six component-rendered Dark/Light sheets after Sean explicitly chose
Player Props-only review. Sean then confirmed **"Approve the visual set"** for all
six exact sheets, including locked, custom-filter, recovery and empty/error states.
The twelve full-content preview captures preserve the shared bottom bar and
end-control clearance. This is mockup evidence, not product implementation,
real-phone acceptance or a new hosted-data claim.

Sean subsequently instructed **"Merge and deploy"**. The approved records are
being reconciled with current main and the existing shared navigation-test fix;
exact-head review/CI are required before merge. Supabase still requires
reauthentication for the hosted prop-data audit. Feature implementation and its
protected release remain pending; merging these records cannot enable the mode.

## EPL expansion requirements confirmed — November 9, 2026

The [requirements and delivery sequence](EPL_FEATURES_2026_11_09.md) and D-68
addendum record Sean's answers in this conversation: optional three-way entry,
one locked guess per match and a combined leaderboard; automatic recommendations
ranked by current favorable gap with supporting trends; reviewed final Sleeper
screenshot scores opening the next draft; and independent winner announcements
with opt-in push. Source inspection identified two-way storage, coupled
snapshot/award/rollover processing and roughly twelve-hourly result collection
as implementation work. Status: **planned, not built or deployed**. Sean supplied
a representative screenshot: human inspection established the four-card/eight-
manager layout, actual-score versus projection positions and absent season-total
tiebreak data. The requirements record now defines import/review handling; this
is not tested OCR or a live import. Private images/scores remain outside Git.
No runtime, database, migration, notification or frozen-v62 change.

## Gap record period filters deployed and verified — November 9, 2026 UTC

[Release evidence](RELEASE_2026_11_09_GAP_RECORD_PERIODS.md) records merged PR #505,
source `9a34f9e47d5fb7dd32eecd6fdc697cef53340ed9`, all twelve exact PR/main checks,
protected readiness and frontend-only deploy 42665392227. Pages
`3e81d5b5-5ad5-4f62-9014-c728f047e070` and all 132 production assets verified at
17:35:54 UTC. Week, This season, All time and inclusive Custom range combine
existing D-77 records without averaging weekly percentages. Recommendation week
and placement remain independent; failed periods do not show partial totals.

API v52 metadata and 76-migration history remain unchanged. No SQL/API/worker or
provider deployment. Local synthetic multiweek tests and public two-theme smoke
do not establish physical-phone or signed-in production acceptance. The new
Player Props guessing feature is still in design, not included in this release.
M-41, held FEPL framing, parked work and frozen v62 remain separate. Earlier
local/pending period-filter entries below are historical.

The publication followup also corrects an existing badge-test setup: visibility
alone need not create the required scrolled shelf. The release record preserves
the original failed PR #507 run and the explicit-centering correction, with all
navigation/focus/scroll assertions retained. This changes no application source
and does not require redeployment.

## EPL expansion requirements confirmed — November 9, 2026

The [requirements and delivery sequence](EPL_FEATURES_2026_11_09.md) and D-68
addendum record Sean's answers in this conversation: optional three-way entry,
one locked guess per match and a combined leaderboard; automatic recommendations
ranked by current favorable gap with supporting trends; reviewed final Sleeper
screenshot scores opening the next draft; and independent winner announcements
with opt-in push. Source inspection identified two-way storage, coupled
snapshot/award/rollover processing and roughly twelve-hourly result collection
as implementation work. Status: **planned, not built or deployed**. Sean supplied
a representative screenshot: human inspection established the four-card/eight-
manager layout, actual-score versus projection positions and absent season-total
tiebreak data. The requirements record now defines import/review handling; this
is not tested OCR or a live import. Private images/scores remain outside Git.
No runtime, database, migration, notification or frozen-v62 change.

## Gap record period filters deployed and verified — November 9, 2026 UTC

[Release evidence](RELEASE_2026_11_09_GAP_RECORD_PERIODS.md) records merged PR #505,
source `9a34f9e47d5fb7dd32eecd6fdc697cef53340ed9`, all twelve exact PR/main checks,
protected readiness and frontend-only deploy 42665392227. Pages
`3e81d5b5-5ad5-4f62-9014-c728f047e070` and all 132 production assets verified at
17:35:54 UTC. Week, This season, All time and inclusive Custom range combine
existing D-77 records without averaging weekly percentages. Recommendation week
and placement remain independent; failed periods do not show partial totals.

API v52 metadata and 76-migration history remain unchanged. No SQL/API/worker or
provider deployment. Local synthetic multiweek tests and public two-theme smoke
do not establish physical-phone or signed-in production acceptance. The new
Player Props guessing feature is still in design, not included in this release.
M-41, held FEPL framing, parked work and frozen v62 remain separate. Earlier
local/pending period-filter entries below are historical.

The publication followup also corrects an existing badge-test setup: visibility
alone need not create the required scrolled shelf. The release record preserves
the original failed PR #507 run and the explicit-centering correction, with all
navigation/focus/scroll assertions retained. This changes no application source
and does not require redeployment.


## Gap win rate period filters checked locally — November 9, 2026

Sean approved the [D-80](DECISIONS.md) dark/light period-control mockup. The
[implementation evidence](GAP_RECORD_PERIODS_2026_11_09.md) records Week,
This season, All time and inclusive Custom range, complete-period loading,
count-weighted rate, actual row provenance and unchanged D-77 grading. Existing
authenticated weekly reads are reused; recommendation selection/writes remain
independent. Both browser engines/themes and independent review passed locally.
Exact source/CI, merge and protected frontend release remain separate gates;
this entry is not a deployment claim. No SQL/API/provider change, M-41 apply,
parked feature work or new physical-phone acceptance is included.

## Whole-app UI/UX sweep deployed and verified — November 8, 2026 UTC

[Release evidence](RELEASE_2026_11_08_UI_UX_SWEEP.md) records exact source
`a17f2082e5e07e95179726ac948c44c55a506d1f`, merged PR #502, all twelve corrected
PR checks and all twelve main-push checks. Protected frontend release 42514212232
verified Pages `968d3b5d-a115-42ea-8293-ce405ef42f91` and all 132 production assets
at 19:21:34 UTC. Home’s selected floating bottom bar matches across existing
NFL/EPL tabs; headers/body layouts remain contextual. Guidance rows, singular
ticket counts and fresh detail entry/Back scrolling are corrected.

The [audit](UI_UX_SWEEP_2026_11_08.md) preserves both-theme/browser/viewport
coverage, controller/fixture limits, the initial CI failure and causal fix,
source reviews and warning noise. API v52/metadata, 76-migration history and
tracked data/backend source hashes are unchanged. No SQL, worker or API deploy.
Actual-phone and signed-in production acceptance are not newly inferred. M-41,
FEPL top-header choice, parked features and frozen v62 remain held/unchanged.
Earlier local/pending entries below are historical.

## Whole-app UI/UX sweep checked locally — November 8, 2026

[D-79](DECISIONS.md) confirms Home’s floating glass bottom navigation across all
existing NFL/EPL tabs while preserving contextual top headers and approved body
layouts. The [sweep record](UI_UX_SWEEP_2026_11_08.md) documents fresh screen,
formatting, chart, overlay and scrolling coverage in both themes, narrow/wide and
short/landscape viewports, plus Chromium and mobile WebKit emulation.

Local corrections share the bottom recipe/actual-height clearance, restore the
Guidance sheet’s intrinsically sized topic rows, and fix singular tracked-ticket
copy. Task reviews approve both initial source changes with no Critical/Important
findings; inherited validation warnings remain recorded. Initial PR CI exposed a
fourth issue: a short detail retained opener scroll. Nest’s entry reset is checked
locally at `219e546699368925a913b08e6cf34745349d2fd2`, preserving exact Back position
and focus; renewed delta review and CI are required. Source commits are
`4ce541942c12751862672d8cb89209d819fd452e` and
`3175462f6839e01fece3d4d43c8171b07983ff1e`. Final branch review, exact CI, publication,
merge and protected frontend release remain pending; this is not a deployment
claim. The separate held FEPL top-header choice, M-41, API/database/worker state,
parked features and frozen v62 remain unchanged. Actual-phone acceptance is not
newly inferred from emulation or Sean’s navigation assumption.

## Saved-precision Virtual Units ROI deployed — November 8, 2026 UTC

[Release evidence](RELEASE_2026_11_08_VIRTUAL_ROI.md) records exact source
`1c5a9da0deb479c15abf390a905acd47084cb338`, merged PR #500, all twelve exact-main
checks and protected deployment 42496125746. API v52 is ACTIVE/JWT-verified and
Pages `b3bd6187-adbf-4097-98e2-28417cac7d09` passed all 132 production asset
comparisons at 15:47:16 UTC. Week/season ROI and ranking now retain saved
four-place amounts under D-78; saved selections/results and settlement are not
rewritten. Exact ties remain shared; precision can split previously rounded ties.

Fresh history stays at 76 versions with the reviewed digest; pending M-33/M-34/
M-35 are unchanged. No SQL or worker deployment. Remote API source bytes,
hosted affected-rank/row-hash counts and new phone acceptance are not claimed.
Earlier local-only ROI entries below are historical. M-41 remains separate
unapplied draft PR #497 with its own Gate M checks and named approval; the FEPL
frame question is open. Parked work and frozen v62 remain unchanged.

## Saved-precision Virtual Units ROI checked locally — November 8, 2026

Sean approved the recommended saved-four-place accounting correction (D-78).
The [implementation record](VIRTUAL_ROI_SAVED_PRECISION_2026_11_08.md) documents
the shared week/season model correction, synthetic half-unit tie impact,
red/green arithmetic and SQL/API/native parity evidence. Existing percentage
and amount display styles, qualification, privacy and ranking order remain.
All saved selections/results/audits/timestamps are preserved in local read tests;
no migration or writer changed. Hosted affected-rank counts were unavailable
because the read connector requires reauthentication. Local verification does
not establish deployed source or actual-phone acceptance. Independent review,
exact-source CI and compatible API/frontend release remain open. Custom entry
PR #497 / M-41 remains separate and unapplied; FEPL framing is still queued.

## Confirmed Prism rollout deployed and verified — November 8, 2026 UTC

[Release evidence](RELEASE_2026_11_08_PRISM_ROLLOUT.md) records source
`e3f078b9e831dda46412487251b191ebdd5637c4`, merged PR #495, all twelve exact-main
CI checks, separate protected frontend-then-API runs and the actual public
Research publication. Pages `31417a19-3cea-47fc-bc0a-9b776df4724b` passed all 132
production asset checks at 07:52:55 UTC. API v51 is ACTIVE with JWT verification
true, verified at 08:04:54 UTC; remote API bytes were not independently matched.
The release record states that source-acceptance limit explicitly.

The approved unambiguous body/frame ports, spacing, readable EPL labels and
Back-scroll correction are shipped in both themes. Fresh history remains 76
versions with the reviewed digest; only existing M-33/M-34/M-35 are pending.
No SQL or workers were deployed. All six public Research assets were downloaded
and hash-verified with season rows and compact series in each sample.

Earlier local-only/not-deployed entries below are historical. FEPL's separate
frame choice remains queued separately; D-78 answers ROI policy; M-41 remains separate
PR #497 and unapplied. No new phone acceptance, private-board sync, avatar,
award, NBA or parked Signal work is claimed. Frozen v62 remains unchanged.

## Expanded CI corrections reviewed and combined — November 7, 2026

[The scoped closeout](PRISM_EXPANDED_CI_CLOSEOUT_2026_11_07.md) records all 22
previous browser CI failures, their reviewed corrections and the separately
exposed Back-scroll race. Source through `04daf0b6` has task approval: retained
league access, EPL label fitting, identical G assets served externally, precise
compact-header checks, capture output opt-ins and
[history scroll ownership](BACK_SCROLL_RESTORATION_2026_11_07.md).
Privacy scanners, API/SQL/scoring, saved references and frame-approval boundaries
remain intact. FEPL stays native pending its separate owner choice.

Fresh combined checks pass 923 component tests, 89 Node contracts and 11 browser
flows, plus typecheck, Brand QA, build, bundle privacy and whitespace. All 1,759
design-file hashes match the baseline. The final whole-branch addendum, exact-
source CI and protected frontend-then-API release remain open. Only Home is live.
M-41 remains separate and unapplied; frozen v62 and parked scope are unchanged.

## Browser Back-scroll ownership fixed locally — November 7, 2026

The [restoration record](BACK_SCROLL_RESTORATION_2026_11_07.md) documents a
deterministic native-history reproduction of the Research board returning to
zero after Shell restored its saved position. The history connection now owns
manual restoration for its lifetime and restores the prior mode on cleanup.
Controlled and original flows pass 6/6; eight focused browser cases and 58
router/state tests pass without skips. Typecheck and Brand QA pass; all 1759
tracked design files retain their hashes. No route, data, layout or frozen
artifact changes. Local fix only; independent review, aggregate addendum,
combined CI and release evidence remain open.

## EPL compact Play labels fitted — November 7, 2026

The [scoped fitting record](PRISM_EPL_COMPACT_LABELS_2026_11_07.md) addresses the
actual Linux CI Leaderboard overflow with an intrinsic minimum for the existing
last grid column. Full labels, 16px type, 44px targets and wide equal tracks
remain. A deterministic fallback-metric red/green regression plus the original
EPL expanded-frame case pass 5/5; Brand QA passes 15/15 and scoped EPL components
45/45. All 128 expanded PNGs, 30 receipts and 80 historical files retain their
SHA-256 values. Local verification only; independent review, combined CI and
release remain open. No API, data, scoring, migration or FEPL frame change.

## Expanded confirmed frames integrated; final combined verification — November 7, 2026

Independently approved expanded source `d3c1b01b` / `9047ba20` / `272e2b05`
is integrated as `d37de276` / `99a72f7c` / `f5a224c3`. The
[context record](PRISM_EXPANDED_FRAME_CONTEXTS_2026_11_07.md) closes every
unambiguous compact-frame row in the authority matrix, including actual editable
drafts, populated Points profiles, named Research sections, History, Bets tools,
Premier League Home/Play and named access covers. Actual NFL Research root,
FEPL Research and explicit EPL Bets/History remain native. FEPL's same-route
approval overlap remains queued after the pending ROI-policy question.

Fresh root reconciliation verified fourteen source, one ledger, 46 reference,
thirty receipt, 128 new PNG/dimension and eighty frozen historical hashes.
The corrected native Research specimens use the actual root; old Games-host
specimens retain their original provenance. Known continuity failures retain
their actual host; no global error-frame rule is introduced.

The [reviewed test-only CI corrections](PRISM_FRAME_CI_CONTRACTS_2026_11_07.md)
are integrated as `c5d7f10e`. They retain geometry, access/privacy, counts, replay,
focus and real-theme checks while replacing obsolete pinned/flush/root-opener
assumptions. At product/test head `c5d7f10e`, 923 component tests in 92 files,
31 strict Node contracts, typecheck, Brand QA and whitespace checks pass.
Fresh final whole-branch source review approves the integrated changes with
no Critical or Important findings. Combined browser verification is in progress;
exact-head CI and release remain open. Only the separate Home spacing release
is live. No SQL/M-41 apply, ROI decision, frozen v62 or parked-scope change.

## Confirmed frame scope reconciled; expanded implementation active — November 7, 2026

[Authority/context mapping](PRISM_FRAME_AUTHORITY_RECONCILIATION_2026_11_07.md)
replaces the earlier overbroad global-header hold with actual scoped approvals.
Reviewed landings/selected-receipt source is integrated through `250294f1`;
additional confirmed contexts remain in progress. FEPL Research has a genuine
same-route frame overlap, queued after the one pending Virtual ROI-policy question.
No unanswered question is inferred as approval. Four exact native Research cases
are reviewed/integrated (historical42paired component scenarios, zero unverified,
one held Virtual minimum). Fresh final-source native-root mapping is still open
as named Games moves to its confirmed compact frame. That also does not resolve
FEPL's separate content-frame choice.
The sole final-CI read-count race has a reviewed correction integrated `8d2b8112`;
root natural/delayed cases pass. Current combined 923 component / 27 strict Node /
typecheck and four integration browsers pass. Final expanded review/CI and release
remain open. No remaining rollout deployed; no SQL, M-41 enablement, frozen v62 or
parked-scope changes.

## Final Prism CI read observation correction — November 7, 2026

[Scoped reproduction and verification](PRISM_FINAL_CI_READ_FIX_2026_11_07.md)
proves that the team opener can paint before the lazy game readers mount,
causing CI's two-return counter to include an initial read. The browser test now
observes initial reads explicitly, keeps the <=2 return allowance, checks <=1
per actual return and zero reads during team loading/recovery/appearance phases,
and retains all no-write, cached-team, lazy-asset, phone/axe and focus gates.
The original and permanent delayed-mount regression passed with four nearby
cases; the final aggregate-accounting refinement passed both changed cases
again. Product source and all committed captures/manifests are unchanged.
Independent review, parent integration and fresh exact-source CI remain open;
no push, PR, deployment, SQL apply or hosted acceptance is claimed. Frozen v62
tracker unchanged.

## Whole-branch Prism source review passed — November 7, 2026

[Final review record](PRISM_FINAL_REVIEW_2026_11_07.md): no Critical or Important
findings for `7aa93a6f..48ad4b40`; reviewed documentation now follows frontend
then API release order. Final local 923 component / 27 strict Node / five native
browser checks, typecheck, Brand/build/privacy pass. Existing test-key/build-size
advisories remain disclosed. Exact-source CI and protected release remain open;
source review does not resolve the held frame positions or separate M-41 work.
Only the earlier Home release is live. The frozen v62 tracker is unchanged.

## Reviewed identity integration — November 7, 2026

The final identity/Menu/scope source and wording boundary repairs are integrated
through `966f8db3`; independent re-review closed both Important findings. The
[rollout ledger](CONFIRMED_VISUAL_ROLLOUT_2026_11_07.md) records the 38 paired,
zero unverified and five held core action scenarios, with exact evidence limits.
Fresh combined validation passed 92 files / 923 component tests, typecheck and
27 strict import/token/loading contracts. The global header/dock question is
still unanswered. Custom Virtual Units remains separate draft PR #497 and is
not integrated or enabled. Whole-branch review, exact-source CI and protected
release remain open. Only the previously recorded Home spacing release is live.
Frozen v62 tracker remains unchanged.

## Reviewed Commissioner integration and separate M-41 preparation — November 7, 2026

All six Commissioner source/evidence commits are integrated through `c8893d13`.
Final independent review at `212d43e6` closed every scoped Important/Minor issue;
[the final record](PRISM_COMMISSIONER_CAPTURE_PAINT_FIX_2026_11_07.md) distinguishes
89 refreshed and 143 retained captures. Root checks passed 915 component tests,
typecheck, 27 strict contracts and two actual-controller final/odds browser flows.
Whole-branch review, exact-source CI and release remain; no remaining rollout
deployment is claimed.

Separately, reviewed Custom Virtual Units preparation is published in draft
[PR #497](https://github.com/seanbalz/guess-the-line/pull/497) at
`a3bd900b7b65f7469a5d9400815e44be9fbb7580`, branch
`codex/m41-retry-precision-20261107`, synchronized 0/0 on November 8 at 03:02 UTC.
It remains outside the visual branch, with the documented ROI/accounting decision
and explicit named migration apply still held. No SQL, hosted write or release.

## Reviewed EPL integration and final browser layout repairs — November 7, 2026

Premier League/FEPL source `4ffd4572` / `64e7bfd5` is integrated as `8e528825` /
`726e8526` after independent re-review closed reading/glyph findings. The parent
History adapter `a0eb47bb` is also independently approved. Combined local source
passes 90 files / 914 component tests, typecheck and 29 focused Node contracts;
native moneyline recovery/leaderboard browser passed. [The rollout ledger](CONFIRMED_VISUAL_ROLLOUT_2026_11_07.md)
records source/capture provenance and the actual retained/refreshed split.
Earlier CI's two remaining layout defects reproduced locally and both original
cases now pass after scoped loader-height and saved-pick row-width repairs.
Their independent review/fresh CI and Commissioner/identity/unit compatibility/
owner frame decision/release work remain open. No remaining rollout deployment.
## Identity wording boundary corrections — November 7, 2026

[The scoped correction record](PRISM_IDENTITY_WORDING_BOUNDARIES_2026_11_07.md)
fixes two Important display misses: registered composite-ID trend titles and
computed Research historical/Why condition descriptions. Exact ID/title matching
and the source-reported exemption preserve custom/source literals and raw chart
keys. New real-registry/component and native computed Research evidence is
separate from the unchanged 114 prior captures. The 38 paired / zero unverified /
five held cumulative state remains. Local checks are recorded in its manifest;
independent re-review/integration remain pending. No push, PR, merge, API/SQL,
migration, deployment, hosted acceptance or frozen v62 tracker change.

## Shared identity, native Menu and saved-scope evidence — November 7, 2026

[The scoped local record](PRISM_IDENTITY_SCOPE_NATIVE_2026_11_07.md) adds all four
real Menu variants and saved-scope pairs, raising the 43-state action reconciliation
to 38 paired, zero unverified and five held. Actual account transitions purge the
open layers without a sit-out write; separately labeled component proofs cover
defensive account mismatch. Games labels/action names and league descriptions
follow approved full names; sit-out operational prose is restored to 16px.
Native marks/fallbacks, raw IDs, source attribution, controllers and held frame
positions are preserved. Final local type, 919 component tests, 41 Node contracts,
Brand/build/privacy and native browser/capture evidence are linked there.
Independent review/integration remain pending; no push, PR, merge, hosted change,
migration or deployment is part of this task. Frozen v62 tracker is unchanged.

## Integrated reviewed History and paper-gap scorecards — November 7, 2026

Source `c8a4f8ef` / `7426e705` / `115af6b6` is integrated as `df487a79` /
`78bf5040` / `b52e86b0`; independent re-review closed both color/icon findings.
[The parent adapter record](PRISM_HISTORY_SCORECARD_NATIVE_2026_11_07.md#parent-integration-adapter--november-7-2026)
records the retained-workflow view injection, restored local fallback and exact
full-name receipt assertion. The original strict import test is unchanged.
Two controller browsers, 29 focused Node checks, typecheck and the affected
28 component tests pass. Full run was 912/913 before the stale assertion fix;
fresh whole-branch validation remains required. This is local integration,
not deployment or complete acceptance of held/shared/hosted/phone work.
## Virtual Custom hundredths — prepared, enablement held — November 7, 2026

[M-41 preparation and compatibility inventory](VIRTUAL_UNITS_HUNDREDTHS_M41.md)
adds service-only gated support for 0.01–100U Custom entry, preserves existing
half-unit stakes, and maps the selected native slip field with 0.1U taps and
the amended 0.5U ordinary floor. Old schema/API reads keep half-unit controls.
No accounting, scoring or historic result is changed. Local SQL tests cover
three save paths, CAS/replay, grants and apply/rollback preservation; native
browser checks cover invalid drafts, busy/uncertain retry and phone-width layouts.
M-41 is not applied, merged or deployed. Enablement remains held for the explicit
Gate M queue/precheck, exact-source review/CI and Sean's separate `apply M-41`.
D-78 answers the ROI policy choice; PR #500 is merged at
`1c5a9da0deb479c15abf390a905acd47084cb338`, with its release pending.
The frozen v62 tracker is unchanged.

The [M-41 review corrections](VIRTUAL_UNITS_HUNDREDTHS_M41.md#review-corrections--november-7-2026)
resolve committed cent-request replay after capability loss/SQL rollback,
freeze exact browser retry bodies through a board refresh, reject excess
numeric precision consistently with SQL, and restore the Custom label's 16px
native floor. Prepared SQL/rollback and accounting remain unchanged. Local
verification passed 76 focused Node/SQL/import/token/parser tests, 19 component
tests and four browser scenarios; scoped captures include computed typography.
PR #497 carries the corrected artifact. Its November 8 reconciliation preserves
current main and D-78 saved-four-place accounting, all three reviewed writer
bodies and the four original M-41 design artifacts. Fresh local verification
and remaining release holds are recorded in the M-41 preparation document.
M-41 remains unapplied and held for queue/precheck, independent review,
exact-source CI and named apply approval. Supabase reauthentication is still
required for fresh hosted preservation hashes/grants; FEPL remains a separate
unanswered frame choice.

## Native Account integration and whole-page spacing repair — November 7, 2026

Reviewed Account source and both correction commits are integrated as `f2af6c90`,
`43fa91a8` and `52b900b5`. Independent review closed both final Important type/
forced-color findings and verified 254 native/134 reference/ten source hashes.
The [integration spacing record](PRISM_INTEGRATION_SPACING_2026_11_07.md) adds
scoped Games padding/team gaps and keyboard note clearance, retains all original
behavior checks, and records 18 unique browser passes across focused runs plus
913 component tests/type/27 strict Node contracts/Brand/build/privacy. Independent review approved parent repair
`596596f5852d74f703915620584fbd7c4a1fdc2e` without Critical/Important findings.
Exact-source CI and remaining full-scope ports/release gates remain required. No remaining rollout deployment is claimed.
## Commissioner capture and busy-action correction — November 7, 2026

Unpublished branch `fix/commissioner-capture-paint-20261107`, implementation
`1509910334291ab0b096dbe8019fe4314231196d`, refreshes the stale Light referee
bottom captures and stretches final-dialog busy actions to their approved full
width. Unchanged-source reproduction and actual pixel inspection found the
referee cards painted with the final helper; no referee product fix was needed.
[Evidence and limits](PRISM_COMMISSIONER_CAPTURE_PAINT_FIX_2026_11_07.md) record
four targeted browser flows, 13 components, 69 Node/PGlite checks, typecheck,
strict imports/tokens, Brand QA, build/privacy and 232 hashed images (89 refreshed,
143 retained). Prior footer/form/primary fixes remain. No push, PR, merge,
deployment or hosted writes; parent review remains pending.

## Commissioner tool fidelity correction — November 7, 2026

Unpublished branch `codex/commissioner-fidelity-fix`, source
`055e5840fa133e89b23a5bf2e155ce0da7e5e206`, pins each tool's footer, corrects retained
final-review primary and error typography, and adds five-game compact/full draft
coverage. [Evidence and limits](PRISM_COMMISSIONER_FIDELITY_FIXES_2026_11_07.md)
record 11 affected browser flows, 13 components, 69 Node/PGlite tests, typecheck,
Brand QA, final build/privacy and 227 hashed captures (205 refreshed, 22 retained).
No API/SQL/provider/controller-save rule changed. No push, PR, merge, migration
apply or deployment; independent review and integration remain pending.

## Integrated Research data and League/action review closeout — November 7, 2026

Branch `codex/confirmed-prism-shared-2026-11-07`, draft [PR #495](https://github.com/seanbalz/guess-the-line/pull/495),
now integrates independently reviewed canonical Research chart data and League/
National Football League action fixes. Source and scenario limits are recorded in
[the rollout ledger](CONFIRMED_VISUAL_ROLLOUT_2026_11_07.md). Research API changes
are additive; the hourly workflow can publish new fields after merge before API
release and old readers tolerate them. No SQL/migration or provider change.
League actions retain 33 paired, five unverified and five held core scenarios;
the distinct forfeit account-change branch also lacks its own capture. These
local integrations do not establish whole-app coverage, merge, hosted API/data
publication or deployment. Account, EPL, History and Commissioner work continues. Integrated validation
passed 911 component tests, typecheck, 51 focused data/token Node checks, four
controller browsers, Brand QA, cloud build and bundle privacy. Earlier PR CI
found remaining stale-path/keyboard-clearance/wide-font issues; repair and fresh
exact-source checks remain required before release.
## History and pick-focused Prism scorecards — November 7, 2026

Exclusive unpublished branch `codex/prism-history-scorecard-2026-11-07` ports the
confirmed historical-gap, Guess History, Bets/Older History and paired saved
Guess scorecard directions. Existing readers, owner/reveal boundaries, saved
references, authoritative points, paper grading and record-only controls remain.
[Scope, approval provenance and exact verification](PRISM_HISTORY_SCORECARD_NATIVE_2026_11_07.md)
link 64 native capture hashes and implementation source hashes. 59 Node / 12
component checks and 10 scoped handler/PGlite browser checks passed; final
three-test capture and two-test narrow-layout runs passed, with true saved
Dark/Light preference, 320/390, representative 768/1440 and forced colors.
Typecheck, Brand QA, cloud build and bundle privacy passed. Independent parent
review, held shell placement, actual-account/phone/hosted and release gates
remain open. No push, PR, merge, deployment or migration apply.

Independent review visual fixes are on isolated unpublished branch
`codex/history-visual-fidelity-fix`, based on `7426e705`. Gap W/L buttons now retain
semantic ink/borders over the neutral base rule; Older leading icons restore the
approved glass tile while chevrons stay muted. Three scoped browser checks and
15 token checks pass, with computed Dark/Light 320/390/768/1440 and forced-color
coverage. All 64 captures and 21 source hashes were refreshed (30 PNG hashes
changed); the nine reference hashes remain. Typecheck, Brand QA, cloud build,
bundle privacy and whitespace checks pass. The linked scope record details the
neutral-P style probe and limits. Parent re-review and the existing release gates
remain open; no push, PR, merge, deployment or migration apply.

## League/action list-surface correction — November 7, 2026

Exclusive unpublished branch `codex/fix-reactor-list-surfaces-2026-11-07` applies
the final focused feed-list review: Picks and Reactors inherit no list backplate
or extra row gap, and the Reactors separator ends at the actual last list item.
The selected parent glass card remains visible behind its rows. Existing global
List defaults, handlers, privacy/reveal rules and storage are unchanged. The
native browser checks pass at 320/390 in Dark/Light, including hidden-pick
redaction, two populated reactor rows, separator widths, 44px controls, keyboard,
overflow, axe and a focused forced-colors separator check. [Capture/source hashes,
visual review and exact checks](../design/prism-league-actions-native-2026-11-07/evidence.json)
preserve the 200 unaffected pre-existing images, update the six affected 390px
images and add six 320px counterparts plus one forced-colors image. No push, PR,
merge, deployment or hosted acceptance.
## Account native type and forced colors correction — November 7, 2026

Exclusive unpublished branch `codex/account-type-switch-floors`, based on
reviewed source `952ad5fca663d8413df05383cebb3f3d55f9ee9c`, fixes the remaining
primary Account action/reading-size overrides and scoped forced-color
switch/selected-theme cascade. **11 local browser cases passed, zero skipped**,
with 254 regenerated native captures across 38 states, including all wide
representatives. [Exact scope, checks and evidence](PRISM_ACCOUNT_NATIVE_2026_11_07.md#final-review-correction-primary-type-and-forced-colors--november-7-2026)
retain the prior reviewed fixes and metadata floors. Typecheck, unchanged token
and auth-bridge contracts, Brand QA, cloud build and bundle privacy pass. Parent
independent review, CI and release gates remain open; no push, PR or deployment.
## EPL reading fidelity review fixes — November 7, 2026

Exclusive unpublished branch `codex/prism-epl-reading-fix-20261107` corrects the
reviewed Moneyline instruction floor and expanded-reveal minus glyph, then audits
Home/Fantasy and action/recovery prose plus nested tappable labels. Primary
reading, labels and inputs compute at least 16px; targets retain 44px. Genuine
source/time/status metadata remains small. **24/24** native browser checks,
**91/91** focused UI/controller and **68/68** model/Brand checks pass, together
with typecheck, cloud build, bundle privacy and whitespace checks.
[Scope, red-to-green proof and limits](PRISM_EPL_NATIVE_2026_11_07.md#reading-fidelity-review-correction--november-7-2026)
and the [updated manifest](../design/prism-epl-native-2026-11-07/evidence.json)
record 640 images / 70 states: 410 regenerated affected captures, 230 original
captures preserved, and all 600 originals additionally archived locally. There
are 72 versioned representatives. Controllers/scoring/source/privacy and shared
shell positions are retained. Independent parent re-review is required; no push,
PR, merge, hosted apply or deployment is claimed.


## Premier League and FEPL native Prism — November 7, 2026

Exclusive unpublished branch `codex/prism-epl-visuals-20261107` carries the
approved area 35–40 native layouts: manager linking, Home/recovery, draft and
ordered backups, Moneyline, FEPL Fantasy and existing shell notices. Full names,
individual circular crests, 16px primary reading, 44px targets and actual-theme
capture guards are implemented without changing controllers/scoring/provider
logic. [Exact scope, authority and check runs](PRISM_EPL_NATIVE_2026_11_07.md) and
[600-image state/reference/hash mapping](../design/prism-epl-native-2026-11-07/evidence.json)
record local evidence; 56 representative images are versioned. Parent independent
review, shared global-frame clarification, physical-device/hosted acceptance and
release gates remain open. No push, PR, merge, migration or deployment.

## Research Light capture evidence correction — November 7, 2026

Exclusive unpublished branch `fix/research-light-evidence-20261107` fixes the
ThemeProvider preference/media race in the affected test matrices and replaces
the two 390px normal Light captures that review found identical to Dark. Product
source/layout is unchanged. **3 focused actual-handler/PGlite browser tests
passed, zero skipped**, including opposite-system/reload theme stability; the
cloud-test build, Brand QA, all 30 image hashes/dimensions and diff checks passed.
The other 28 captures remain unchanged. [Exact provenance, checks and hashes](PRISM_RESEARCH_NATIVE_2026_11_07.md#light-capture-correction--november-7-2026)
preserve the prior verification separately. Independent parent re-review,
canonical By-season/non-shortlist data, shared frame and hosted/phone/release
gates remain open. No push, PR, merge or deployment.

## Canonical Research season charts and row curves — November 7, 2026

Unpublished implementation `0bec834d6d21f6dc2ec88d0610b9fdc0b2f1b00b`
adds exact selected-record NFL season summaries, bounded real previews for all
permitted rows, and native By-season/detail selection with one lazy read for an
opened non-shortlist row. [Source, native captures, public-data reproduction and
release compatibility](RESEARCH_CHART_PAYLOADS_2026_11_07.md) record the scope.
39 Node / 46 component / eight focused native browser checks, typecheck, Brand
QA, cloud build and bundle privacy passed. Six actual free public-data assets
reproduced byte for byte within existing size limits. This resolves the earlier
canonical prepared-data dependency locally; API/frontend integration and the
existing hourly public refresh from merged source are still required. No
push/PR/merge, hosted publication, deployment or phone acceptance is claimed.

## Reviewed Research / Fantasy layout fixes — November 7, 2026

Exclusive unpublished branch `codex/research-visual-fidelity-2026-11-07`
implements the three independently identified composition gaps: actual observed
Players browse and addressable usage, full-width historical trend curves with a
separated sample footer, and compact game overview → actions → Research panels.
Native source/missing/bye, reveal, paging, comparison, Back/focus and scroll
controllers remain. [Area scope and evidence](PRISM_RESEARCH_NATIVE_2026_11_07.md#reviewed-layout-fixes--november-7-2026)
record the exact approval sources and local browser captures. Canonical candidate
By-season and non-shortlist curves remain backend dependencies; shared frame
placement remains the parent's owner question. This is local review work, not
whole-area approval, hosted acceptance, publication or deployment.
## League/action independent-review fixes — November 7, 2026

Exclusive unpublished branch `codex/league-action-fidelity-fixes-2026-11-07`
corrects private weekly-versus-season labels, the in-app uncertain sit-out close
warning, comments canvas rows, contextual League/feed hierarchy and game-bet
row alignment. Expanded actual-controller capture coverage also exposed and
fixed keyboard access to the busy Virtual slip's scroll body using its existing
optional Sheet property. Native source/reference hashes and the full 43-state
mapping are in [the fidelity fix record](PRISM_LEAGUE_ACTIONS_FIDELITY_FIXES_2026_11_07.md).
Saved-scope/Menu pairs, the distinct forfeit account-change branch, held shared
frame placement and finer Virtual stake compatibility remain explicit gaps.
No push, PR, merge, migration, hosted release or physical-phone acceptance.

## Reviewed Play/Points/Score visual closeout — November 7, 2026

The four reviewed gaps are implemented on exclusive unpublished branch
`codex/prism-play-score-closeout-2026-11-07`: Points usage-profile card hierarchy,
glass draft/score controls, score hero/row/game ordering, and the Points opponent
strip/usage action. The approved League supporting podium now uses the existing
rank read; native earned-badge counts and moment behavior remain intact.
[Approval mapping, verification and native capture hashes](PRISM_PLAY_SCORE_NATIVE_2026_11_07.md#native-closeout-of-reviewed-visual-gaps--november-7-2026)
record the actual scope. All figures use existing permitted source data and
missing/House states. Header/dock structure remains the separate pending owner
question; no hosted release or physical-phone acceptance is claimed.

## Confirmed Bets four-item closeout — November 7, 2026

Exclusive branch `codex/prism-bets-closeout-2026-11-07`, over integration
`3a57e4886ca90e293d89520f255bde128252e652`, closes the four remaining Bets
composition gaps: actual individual ticket previews/Open/View, permitted retained
research matchup teaser, full-name team choices with marks, and separate
receipt → owner actions → numbered history. The [closeout record](PRISM_BETS_CLOSEOUT_2026_11_07.md)
links sixteen capture hashes and the inspected approval sources. Final-source
verification: typecheck; 900 Vitest tests; focused accounting/privacy/cache/token
checks; 25 actual-controller browser checks including account isolation and both
phone themes/forced colors; cloud build and bundle-only privacy scan. This is
unpublished local work; no push/PR/merge/deploy, hosted denial probe or physical
phone acceptance is claimed. Virtual Units precision and the unresolved broader
frame placement remain as documented.

## Confirmed Bets landing and saved history — November 7, 2026

The missing approved Bets landing hierarchy is now native on exclusive branch
`codex/confirmed-prism-bets-landing-2026-11-07`: actual owner-only performance,
Tickets summary and Recommended cards, retaining detailed analytics and every
existing ticket/recommendation/Virtual controller. Numbered saved history adds
the omitted before/after source, note and quote/placement fields. Verification
and both-theme phone capture hashes are recorded with the
[approval mapping and explicit remaining composition differences](PRISM_BETS_LANDING_2026_11_07.md).
This is an unpublished local handoff over the first Bets integration slice;
no hosted release, whole-view parity or physical-phone acceptance is claimed.

## Remaining confirmed Prism visuals — implementation started November 7, 2026

Sean approved the Home spacing mockups and instructed deployment, then asked to
deploy the remaining confirmed visual updates. The
[rollout checklist](CONFIRMED_VISUAL_ROLLOUT_2026_11_07.md) records 43 areas and
268 registered review routes, preserving the held avatar/award/NBA/Signal work.
Shared theme/material/type/identity source is checked locally at `1e104fdf`:
32 Node, 58 component, 53 browser and 13 final focused checks passed, with
typecheck, Brand QA, cloud build and bundle privacy scanning. Independent review
found no important regressions. Per-area Play/Points/Score and Bets ports are in
separate owned task checkouts; remaining layouts are not claimed implemented.
A concrete conflict between approved Home and native-frame navigation layouts
has one owner question pending; structural changes are held without removing
existing league switching. Virtual finer-unit entry has a documented API/SQL
compatibility dependency. **Remaining rollout not merged or deployed.**

## Selected Prism Bets native slice — November 7, 2026

Locally checked on `codex/confirmed-prism-bets-2026-11-07`, over fresh main and
the shared native foundation. Reviewed receipts, detailed analytics and manual entry/result/
correction presentation use real controllers; exact terms, cash/units, missing
sources/times, complete-leg validation and save recovery remain. Custom 0.01U
tracked saves are compatible; Virtual half-unit writers remain unchanged with
their concrete dependency recorded in [scope and verification](PRISM_BETS_NATIVE_2026_11_07.md).
Unpublished area handoff only; no migration, PR, merge, hosted release or full
redesign/actual-phone acceptance is claimed. Independent review found no blocking
regression in this slice, but the approved Bets landing summary/chart, Tickets
and Recommended card composition still needs its native port. Full overview,
open/parlay, selection and correction/audit visual closeout remains separate.

## Approved Prism native Play, Points and Score — November 7, 2026

Locally implemented in the owned `codex/confirmed-prism-play-score-2026-11-07`
worktree from fresh main `42a5ad9930a5712c6b357564701fbb5628b12b43`, with the
shared Prism foundation for QA. [Scope, approval mapping and evidence](PRISM_PLAY_SCORE_NATIVE_2026_11_07.md)
cover the confirmed overview, draft/confirmation, Points lineup/context and
score/history arrangements against actual native readers/controllers. Markets,
final per-game locks, drafts, missing data and reveal/source gates remain native.
28 existing isolated Play/Points/Score browser regressions passed; focused
zero/missing/privacy/responsive checks and native fixture captures are recorded.
Local handoff only: no push/PR, merge, deployment, SQL/API or collector change.
Held shell positions, whole-app release and physical-phone acceptance are separate.
Parent review found no new writer/privacy/scoring defect, but selected outlined
controls, the Points usage profile/opponent strip and score metadata/chart order
still need their confirmed presentations. This area is not marked complete.

## Prism Research / Games / Trends / Teams / Fantasy — November 7, 2026

Locally checked on `codex/confirmed-prism-research-2026-11-07`; not published,
merged or deployed. [Scope, native captures and verification](PRISM_RESEARCH_NATIVE_2026_11_07.md)
map rollout areas 08–13 to real controllers and data, including native graphical
Games/comparison, searchable Teams, six-period historical rows and Fantasy
rankings/usage/comparison/accuracy. The canonical candidate By-season array and
non-shortlist summary curves remain explicit data-projection follow-ups; older
weekly season charts remain functional. Header/dock placement is unchanged.
The frozen tracker and other worktrees are preserved.

## Selected Prism shared native foundation — November 7, 2026

Locally checked on `codex/confirmed-prism-shared-2026-11-07`, based on fresh main
`42a5ad9930a5712c6b357564701fbb5628b12b43`. Shared palette/type, floating cards,
gloss/outlined primary, native hybrid G and circular team/league identity are
adapted from the selected review recipes; Home files/tokens are retained.
[Scope and verification](PRISM_SHARED_NATIVE_2026_11_07.md) records 32 token/brand,
58 component, 53 shell/UI browser and 13 final focused browser checks, with
native phone captures. Native-frame and prototype header/dock placements differ;
structural placement remains held for the parent’s pointed owner question.
Unpublished local handoff only: no PR, merge, deployment or data/API/SQL change.
Remaining per-screen compositions and real-phone acceptance are separate work.

## Home spacing review — November 7, 2026

Sean requested better format and spacing after the Home release. A
[Dark/Light mockup review](../design/home-spacing-review-2026-11-07/README.md)
initially used unchanged main app source with browser-only layout overrides.
Sean approved the exact review at `5faead67b9a66091c595168d89bfe21556dec01f`,
saying **“That looks better. Continue to deploy.”** The balanced layout removes
compounded gaps, aligns progress/stat/shortcut graphics with text and compacts
matchup rows. At 390px the same
fictional fixture is 1,279px tall instead of 1,561px (18.1% shorter).
Thirty layout cases passed across both themes, native/wider fonts and simulated
phone insets; 24 keyboard-focus observations cleared the bottom bar. Axe found
zero violations in either theme, with translucent contrast evaluation incomplete;
the existing token suite passed 15/15. These are local browser checks, not
physical-phone acceptance. **Released** from `70c2b85ea7466ca308c8e69006b4ec09888267a7`
as Pages `6a847959` through protected frontend run
[42426632652](https://github.com/seanbalz/guess-the-line/actions/runs/42426632652),
with all 127 production assets verified at 23:47:36 UTC. All 12 exact-main jobs
passed; the API, workers and migration history stayed unchanged. The first CI's
loading-height issue was repaired and all 17 Home/layers/scrolling cases passed.
See the [release record](RELEASE_2026_11_07_HOME_SPACING.md) for hashes and limits.
The original Home CSS declarations now carry the approved layout, preserving
Home tokens/fonts, 80px charts, 15px SVG labels, 44px targets, ring animation and
safe-area/focus behavior. Source data, controllers, privacy and API/database
behavior are unchanged. Local token/Home model checks passed 54/54 and seven
Home component suites passed 53/53. Existing Home and scroll/navigation browser
specs passed 7/7 without skips after a successful cloud-test build, including
both-theme narrow-screen layout/axe, no-write/privacy, navigation restoration
and cross-page scrolling/focus checks. No migration was applied for this update.

## Approved Prism Glass Home — November 7, 2026

Sean approved the exact Dark/Light Home mockups and instructed “Good deploy.”
The implementation is limited to Home, with his separately approved Spread /
Total selector for season rank and accuracy points. It uses the selected hybrid
G, floating glass cards, green outlined primary, graphic shortcuts, two game rows,
individual circular team/league marks and safe generic Community activity.
Existing picks, locks, reveal/privacy gates and league access remain shared.
Other pages retain their existing layouts; PR #491 is not part of this release.

Built from fresh main `7604cee25f4182d7c5262217c05f20d84b2994e3` on
`codex/approved-home-release-2026-11-07`. The [release plan and approval
record](APPROVED_HOME_RELEASE_2026_11_07.md) names the immutable mockups and hashes.
Local evidence so far: full Vitest 85 files / 886 tests passed; typecheck passed;
focused Node contracts passed, including historical-data and image provenance.
Browser checks cover both themes, 320/390 widths, wider fonts, keyboard focus,
screen-reader labels, no hidden-pick leaks and restoration of other pages.
Source review found and fixed Total-market navigation, expired-game counts,
stale score filters and silently consumed streak moments. All 12 exact-main checks
passed. **Released** from `4c6e91bba6f95cb20197c39185e91a58ce2b9b66` through
protected frontend run
[42400945688](https://github.com/seanbalz/guess-the-line/actions/runs/42400945688):
Pages `f31193e9`, 127 production asset URLs matched at 18:25:28 UTC. API v50,
all worker metadata and migration history are unchanged; no SQL was applied.
See the [release record](RELEASE_2026_11_07_APPROVED_HOME.md) for full hashes,
pending M-33/M-34/M-35, rollback and verification limits. Signed-in and physical
iPhone acceptance are separate from these hosted checks.

> **Design-exploration history (merged from PR #488).** The November 4–7 entries below come from the owner-acceptance design branch. Its approved recipes were ported natively and deployed in [the November 8 Prism rollout](RELEASE_2026_11_08_PRISM_ROLLOUT.md); entries below that say pending or not ported are historical.

## Pick-focused scorecard and deployment roadmap — November 7, 2026

Sean rejected both previous full-pill placements as too empty and explicitly
selected “Pick-focused scorecard (recommended)”. The old placement question is
superseded. [One fuller composition in both themes](../design/style-directions-2026-11-04/PICK_SCORECARD_REVIEW.md)
adds opponent, team/market, saved guess, comparison, difference, points ring,
status and a shared-scale chart. Visual approval is pending; earlier global
palette/material/type/circle/G-exclusion/wording approvals stay closed.

Existing fictional History values were asserted against the fixture: −3.5,
comparison −4, difference 0.5, locked status, 9/10 example points. No actual
saved record, bookmaker quote, time or verified schedule is claimed. Eight
theme layouts at four widths, sixteen image decodes, chart/ring math and no
overflow/clipped labels passed; both captures inspected. Zero observed page
errors, failed resources, external browser requests or non-GET requests.

The [five-workstream deployment roadmap](../design/style-directions-2026-11-04/DESIGN_DEPLOYMENT_ROADMAP.md)
separates production implementation, actual data/interaction integration,
regression/CI, release-candidate phone acceptance and approved hosted release.
Production styling is not yet integrated. Main CI was green at the checked
SHA; the prior draft head had five EPL timing/order failures across two test
shards, with root cause unestablished. Exact integrated source must pass.
No production/controller/data change, merge, deployment or migration here.
NBA, new avatars/photos/awards and unpublished Signal files remain held.


## Full-pill team-label revision prepared — November 7, 2026

Sean requested a full pill with the name smaller underneath and the team's
location. This supersedes the earlier unchosen A/B compact-label comparison;
no A/B approval is recorded. [Two placements in both themes](../design/style-directions-2026-11-04/TEAM_VALUE_PILL_REVIEW.md) show the
requested capsule with its existing circled logo/value and smaller Broncos /
Denver lines: 01 below the pill, 02 inside. The active one-question clarification
asks which placement he means, including city/region as the illustrated
location interpretation. Neither placement is selected or applied to existing
History/Bets/shared-sheet labels while that answer is pending.

Selected theme/material/type/G-exclusion/circle decisions are retained. The
example's −3.5 and comparison −4 reuse existing fictional History math values;
no saved record, bookmaker quote, source time, live venue or broader location
catalog is supplied. Name 13px, location 12px, value 30px, logo circle 38px.
Eight theme layouts / sixteen placement layouts and sixteen image decodes
passed at four widths; both captures inspected. No page errors, external
browser requests or non-GET requests observed. Static proposal only: no native
production/bundle/controller, data/permission, merge/deploy/migration change.

The design handoff points to this revised pending choice. Earlier approvals
remain closed; NBA, new avatars/photos/awards and parked Signal files stay held.
No first-project completion claim while the label arrangement is unresolved.

## Wording approved; final identity inventory and handoff prepared — November 6, 2026

Sean answered “Good” to the twenty full-name wording captures in both themes
at `5fe706bc7f1ecea2d51ab2b5f40d486f7d050718`. This closes that copy/layout
review; previous circle, G-exclusion and native-state approvals remain scoped
and closed. No palette/material/type choice is reopened.

The final 268-route, 536-theme readback decoded 1,492 team images. It found
one legacy Home/game view with two bare marks; the existing circle adapter now
wraps only such unwrapped prototype matchup images, with separate 64px glass
circles. Native React marks and the G are untouched. The repair passed eight
layouts and two Back/reopen flows; the repeated all-route inventory has zero
unwrapped matching team images, page errors, provider/auth reads, non-GET
requests, resource failures or OS dialogs.

Remaining team codes occur in compact History/Bets/shared-sheet labels:
33 distinct text variants, 45 text/style combinations and nine codes repeated
across states/themes, rather than hundreds of separate gaps. [Two visual
format options and the Home repair](../design/style-directions-2026-11-04/TEAM_IDENTITY_CLOSEOUT_REVIEW.md) are supplied in both themes. A is
recommended: circled logo beside a compact number, full names in explanations.
B uses full names in both. Neither is applied to existing record labels while
the owner question is pending. MIN timer text, NEW proposal labels and NO
notices are unrelated and preserved. Comparison passed eight layouts; all four
captures inspected.

The consolidated [selected-design handoff](../design/style-directions-2026-11-04/SELECTED_DESIGN_HANDOFF.md) records approved recipes,
that single format question and the actual production gap. This is review
work only; no native production/bundle entry, data/scoring/provider, merge,
deploy or migration change. NBA and new avatar/photo/award work remain held;
parked Signal files remain untouched/unpublished. No first-project completion
claim while compact identity formatting is unresolved.

## Circle set approved; full league names applied — November 6, 2026

Sean's “Good.. continue” approves the twenty team/league circle captures at
`d109e5386b49093f66b173492261bbb5e126739a`. He then explicitly selected
“Full names in explanations; logos in navigation (recommended)”. The prior
wording question is resolved. Use National Football League and Premier League
in explanatory copy and descriptive labels; retain the selected circular marks
in navigation. FEPL remains the existing named league identity; G exclusion
and all prior scoped circle/screen approvals remain.

[Twenty updated copy/layout captures](../design/style-directions-2026-11-04/LEAGUE_WORDING_REVIEW.md) show six overviews, both native
sport frames, History's expanded action and explanatory Info in both themes.
Current copy/layout review is pending. A display-only adapter expands text
and descriptive attributes while preserving original controls, route/option
values, native callbacks, user-entered fields and code/source literals. Native
production source and bundle inputs are unchanged; no rebuild required.

144 responsive layouts/wording checks across 18 views, twelve action/input
checks and two Info checks passed. All 268 registered views were also swept
through review controls in both themes at 390px: 536 readbacks, no residual
NFL/EPL display text outside documented exclusions or horizontal phone
overflow. All twenty captures inspected. No observed page errors, provider/
auth reads, non-GET requests, resource failures, console errors, storage writes
or OS dialogs. This is automated rendering/wording evidence, not fresh owner
acceptance of every state or actual production behavior.

The History unavailable notice is the same existing state with fuller names,
not missing-data inference or a new restriction. Six-screen gallery refreshed.
No merge, deployment, migration or whole-project completion claim. NBA stays
parked; new avatars/photos/awards and parked Signal files remain held.

## Individual circles for all team/league mockup marks — November 6, 2026

Sean accepted the sixteen league-circle placements at
`935f457b9219b51376f3be4405f2109759bdd895` (“Looks good. All logos should have
circles”), then explicitly chose “Team and league logos only (recommended)”.
The original GTL G is excluded. Each existing team-logo container now uses a
circle, retaining separate glass backgrounds, artwork aspect, names and
actions. Home/compact-list portrait tiles are made square; nested operational
marks retain one outer background. No artwork asset is changed.

[Twenty updated phone captures](../design/style-directions-2026-11-04/TEAM_LEAGUE_CIRCLES_REVIEW.md) show six overviews plus team list,
Spread draft, tracked ticket and FEPL Fantasy in both themes. The six-screen
gallery is refreshed. 200 responsive layouts across 25 representative views,
1,584 circle measurements and 1,712 image decodes passed shape checks. All
twenty captures inspected. No G wrapped, unwrapped audited team image,
horizontal phone overflow, page error, provider/auth read, non-GET request,
storage write or OS dialog observed. A transient local CSS connection failure
in the initial rapid audit prompted explicit settled-resource verification
before publication; final result is retained in selection metadata.

This is a shared mockup adapter, not native production code or a bundle-input
change. Prior approvals remain scoped, and current whole-view review does not
automatically cover every nested state. The earlier explanatory-text naming
question remains unanswered; circle scope does not decide wording. NBA is
parked; new avatars/photos/awards and parked Signal assets remain held. No
merge, deploy, migration or whole-project completion claim.

## 02 Glass circles selected and applied to mockups — November 6, 2026

Sean selected “02” from the league-logo comparison at
`a234f2f4bcddd8ec46218169f0110ff7dc395c0a`. The selected sport-switcher treatment
is now applied throughout the paired viewer, including its isolated native
NFL/EPL frames. Each original button and action/state remains; official marks
use separate 52px circular glass tiles with an active lime/deep-green outline.
Accessible full league names and hidden NBA/current NFL-only options remain.

[Sixteen current placement captures](../design/style-directions-2026-11-04/LEAGUE_CIRCLES_SELECTED_REVIEW.md) show the six overview screens and
both native sport frames in both themes. The primary gallery is refreshed to
these current captures; earlier choice boards remain historical evidence.
80 layouts at four widths, 52 action checks and 152 league-mark decodes passed.
All sixteen captures inspected; Account's fixture footer is visible in an
extended-height capture. No observed page errors, provider/auth reads, non-GET
requests, storage writes or OS dialogs. Standalone adapter only; native
production sources and bundle inputs are unchanged.

One owner question remains: should explanatory references such as “View NFL
history” use full league names or logos too? Full names are recommended for
readability. Existing explanatory wording is unchanged pending the answer;
the ten-view audit is not a claim that all nested team/chart/source labels are
converted. Prior approvals remain scoped. NBA is parked; new avatars/photos,
popup/award exploration and parked Signal files remain held. No merge,
deployment or migration; the first project is not declared complete.

## Overview/ticket set approved; league-logo choices prepared — November 6, 2026

Sean answered “Approved continue” to the fourteen current overview/ticket/entry
captures in both themes at `6bfcfdbe787bdc2d44019aa3e3c85530cf009ebd`. This
closes the older Home/Play/Bets whole-view re-review flags and accepts the
supplied open/settled ticket and selection/terms views. Earlier scoped NFL/EPL
approvals remain valid; no actual production save/device acceptance is inferred.

The next active requirement is league-logo replacement, brought into this
project by Sean on November 4. [Five switcher tile treatments](../design/style-directions-2026-11-04/LEAGUE_LOGO_SWITCHER_REVIEW.md) now show
the official NFL shield and theme-appropriate Premier League lion, with each
logo on its own glass tile and accessible full names. Recommendation: 01,
rounded glass squares with a lime active outline. Six captures include both
theme comparison boards and 01 with each league active in fictional context.
Choice is pending; no approved viewer or production header was replaced.

32 responsive layouts, 48 pointer/keyboard selection checks and 56 image
decodes passed; all six final captures inspected. No observed page errors,
external browser requests, non-GET requests, storage writes or OS dialogs.
The new source register preserves official-site asset URLs, hashes and
identification-only scope; no licensing or affiliation is claimed. Original
colors/proportions and selected GTL recipes are retained.

After selection, carry that placement into the viewer and reconcile remaining
sport/team abbreviation placements before claiming full replacement. NBA stays
parked; new avatars/photos and popup/award exploration remain held. No native
production code, scoring, provider, migration, merge or deploy change. Parked
Signal files are untouched and unpublished.

## NFL set approved; older overview/ticket review prepared — November 6, 2026

Sean answered “Approved” to the remaining NFL action/shared-navigation set in
both themes at `9c2aa961f14f6a68cc51858e777c4e0796a9b5e5`: 104 newly approved
captures plus two previously approved Virtual-minimum captures, 106 total.
The approval is recorded with its exact question and capture list.

The prior reconciliation missed explicit older whole-view flags for Home,
Play, Bets and the original tracked-ticket/entry screens. Component and later
specialized-state approvals remain valid. [Fourteen current phone captures](../design/style-directions-2026-11-04/OVERVIEW_CLOSEOUT_REVIEW.md)
now show those seven views in both themes; only this whole-view review is
pending. These are existing views, with a preview-only narrow-grid overflow
fix; no new feature or production code. 56 responsive layouts, 14 scenario
checks, 66 decoded images and inspection of all 14 captures passed. No observed
provider/auth read, non-GET request, storage write, bundle interval, OS dialog
or page error. Illustrative/historical data labels and unknown personal terms
remain explicit; no live account read or save.

The earlier league-wide logo replacement request also is not established as
fulfilled by the approved text sport selector; reconcile that requirement
before claiming the first project finished. NBA remains parked, and new
avatar/photo/award work remains held. No merge, deployment or migration.

## NBA parked; current visual review reconciled — November 6, 2026

Sean answered “Parked for now” to the retained NBA scope question. Existing
NBA Games/private Bets/History/editor visuals are excluded from this visual
pass. NBA stays hidden from shared navigation; its existing code, saved routes,
records and APIs are untouched. No NBA mockups were made. A later owner request
is required to resume that area. This parks NBA only, not the entire project.

The eight EPL shell captures remain approved in both themes. The outstanding
visual sign-off recorded in the register is the existing
[NFL actions and shared-navigation set](../design/style-directions-2026-11-04/NFL_ACTIONS_NAVIGATION_REVIEW.md). It already has 106
phone captures; the two shown Virtual-minimum captures are approved, leaving
104 captures without an explicit recorded visual approval. Those cover
reveal/recovery, saved picks, one-game league bets, sharing/reactions, entry
variants, Menu and shared-frame views. Navigation retains Sean’s standing
pass-unless-an-issue-is-reported instruction; the remaining request is visual
sign-off. Existing captures are reused rather than regenerated under new names.

No new avatar/photo options or awards/celebrations are started. Production
integration, actual account/source/device acceptance and whole-project
completion remain separate. Parked Signal files are unchanged/unpublished.

## EPL shell mockups approved — November 6, 2026

Sean replied “Looks good continue” to the eight EPL league/History/Bets/Info
mockups in both themes, reviewed at
`c6fb2b44bacc90fa44ba89e8932da7343e20cf4b`. The exact captures and approval
scope are recorded in [the selection record](../design/style-directions-2026-11-04/selected-system-review.json) and [phone index](../design/style-directions-2026-11-04/EPL_SHELL_REVIEW.md).
This accepts the supplied visual direction, not new EPL history/betting
availability, production/device acceptance or whole-app completion.

The next listed coverage item is the existing NBA Games/private Bets/History
and editor surfaces retained behind saved routes. NBA remains hidden from the
NFL/EPL navigation. A single owner scope question is pending before new NBA
mockups are made: include these existing pages in this visual pass, or leave
them parked. Existing records/routes, deferred avatar/photo/award work and
parked Signal files are preserved. No merge, deploy, migration or account read.

## EPL league, History handoff and Bets notices prepared — November 6, 2026

[Phone review: eight captures in both themes](../design/style-directions-2026-11-04/EPL_SHELL_REVIEW.md).

Sean’s “Good continue” records approval of the revised Virtual unit-entry
placement shown in the preceding final reply, at
`62a64773b544fbb8ffe679d8f6a8dc1fae552b9f`. The two reviewed Virtual captures
are named in the selection record. The confirmed unit behavior remains 0.5U
smallest quick choice, Custom down to 0.01U and 0.1U per +/− tap. This scoped
approval does not silently accept the entire 106-capture NFL batch or unseen
tracking placements.

The next three native EPL shell gaps now have selected dark/Porcelain mockups:
the single selected FEPL league row, History’s existing unavailable notice with
View NFL history, and Bets’ existing unavailable notice. Exact native copy and
actions remain. Native EplLeagues/EplHistory/EplBets/EPL_COPY presentation from
two files is extracted/source-compared after local shell/navigation injection,
export naming, haptics off and the existing clock/ticket notice glyphs. The
shared header and four tabs use FEPL with no invented NFL counter badges.

FEPL is a fixed native identity; Alex Lane is fictional. The league sheet’s
blurred Home underlay is labelled review context, not live Home data. The
source-defined unavailable states are not failed/empty reads or evidence of
missing/deleted records. No EPL create/join/invite or wagering form, historical
record, standings value, quote, feature status or permission is invented. The
already-reviewed account Menu is referenced, not duplicated; its real shared
community guard read is excluded. New avatars/photos/awards remain held.

Selected-row/Close/Escape and History Back work locally and return focus.
View NFL history reports its native #history handoff without changing the URL;
shared destination controls only show no-read notices. The review reopen button
is hidden while History is open. No API/auth/provider read, write, URL/device
storage change, polling or interval controller runs.

48 native tests, 24 responsive checks, six flow checks, two league-sheet
keyboard/focus checks, eight Info checks and four prior mounts passed. Source,
controller exclusions, Brand/syntax/diff and capture hash checks passed. Build:
1813 inputs, 934020-byte JS. No page error, provider/auth read, non-GET request,
storage write, bundle interval or OS dialog observed. Eight phone captures,
including source/scope Info, were inspected; owner visual approval is pending.

Only preview assets/evidence change. Production behavior/data, actual guarded
navigation, device acceptance, retained-route reconciliation and whole-app
completion remain separate. NBA navigation remains hidden and retained links
unchanged. Parked Signal files are untouched/unpublished. No merge/deploy/apply.

## Unit quick choices and Custom clarified — November 6, 2026

Sean confirmed “Yes” to the distinction: **0.5U is the smallest quick-select
option**, while **Custom may enter smaller values, including 0.25U or 0.01U**.
The previously selected **0.1U per +/− tap** remains. This confirms these
controls only, not the entire 106-capture batch or whole-app visual approval.

Both Virtual and manual tracking previews remove the 0.01U quick chip. Virtual
labels its amount field “Custom units”; it retains 0.01U–100U and hundredths
precision. Tracking retains its Custom toggle, 0.01U floor, existing field
precision/Unknown option and 10000U maximum. Buttons may adjust an entered
custom amount below 0.5U; quick options still start at 0.5U. No saved amount,
qualification threshold, production API/database rule or native writer changes.

The revised Virtual states and tracking unit placement are refreshed in both
themes in [the phone review index](../design/style-directions-2026-11-04/NFL_ACTIONS_NAVIGATION_REVIEW.md). Source-excerpt comparison, build,
Brand/syntax/diff checks, 56 Virtual responsive checks/eight entry flows and
eight tracking responsive/entry checks cover the correction. Checks verify
the absence of a sub-0.5U preset, the 0.5U shortcut, Custom 0.01U acceptance,
0.1U stepping, bounds/validation and busy/uncertain guards. No page errors or
non-GET requests are observed in the focused Virtual check. Native production
Virtual remains limited to its existing half-unit stakes; implementation and
release are separate work. Parked Signal files remain untouched/unpublished.

## NFL actions and shared navigation mockups prepared — November 6, 2026

[Phone review index: all 106 captures](../design/style-directions-2026-11-04/NFL_ACTIONS_NAVIGATION_REVIEW.md).

Sean approved the prior 60 Bets weeks / Older records captures at
`5c4210863f486bf77b1fec251073b26a55d5d89e`: “Looks good in both themes.
Continue with the remaining NFL action and shared-navigation mockups.”
That approval is recorded at its exact capture scope.

This batch adds 43 core states in both themes: whole-week sit-out/reveal and
its uncertain-close warning, saved Spread/Total/draft/pending/stale/scope states,
one-game league bets, feed pick sharing and reaction lists, Virtual Units and
its slip, native Menu gates/busy sign-out, NFL/EPL/native four-tab frame, and a
layer-open-failure toast. Existing switcher/invite/reaction-chooser/general
recovery and Menu-destination approvals are retained rather than duplicated.
Native navigation bodies are labelled context specimens, not replacement
features. Empty tab slots avoid invented counters; NBA stays hidden.

Sean then requested units down to **0.01U** and selected **0.1U per +/− tap**.
The Virtual and manual tracking preview controls now include the quick minimum
and custom entry. The Virtual field blocks invalid amounts, accepts hundredths,
keeps the 100U maximum, and freezes editing in busy/uncertain states. Manual
tracking preserves Unknown, existing precision and 10000U maximum. Existing
saved records and qualification thresholds stay intact. Native production
Virtual code still has its 0.5U floor; implementation/API/database compatibility
and deployment are separate unfinished work.

Ten native presentation files are source-compared after explicit adapters:
injected contexts/read/write states, no-op notices, haptics off, selected logo,
mark-only matchups, omitted real metadata times and the requested unit controls.
Native formatting/gameGuesses/everyoneBoard/accuracy, initial avatars, reaction
glyphs, Menu gates and Sheet/Dialog/Info behavior remain. Native API/auth/read/
write/polling/storage/timer controllers are excluded. New annotation Info stops
nested cancel/close from dismissing its parent. The unconfirmed close warning
uses existing words in a native Dialog storyboard, without an OS prompt or a
recovery marker. No preview action fabricates saved/revealed/shared success.

All identities, picks, terms, outcomes/counts and fixed recovery/confirmed states
are fictional. Math examples give 8 accuracy points for one-point error and a
normalized +0.91U entered-price result. Hidden guesses lack pick/error/points/
rank; closed bets lack terms/results. No real fixture, quote, kickoff,
observation, save receipt, post, reaction or transaction is supplied. Offer
timestamps remain null; example terms cannot qualify as live prices.

61 existing native tests passed (25 Node, 36 Vitest). Browser checks include
336 baseline responsive layouts, 56 revised Virtual and 8 revised tracking
layouts, 48 revised saved-pick layouts/12 flows, 84 baseline flows, 16 decimal-entry flows, 68 loaded separate marks,
10 modal keyboard/focus checks, 10 Info checks and six prior mounts. Source,
fixture, unit clamp/step, UTF-8, bundle exclusion, Brand, syntax and diff checks
passed. Instrumented core/modal passes observed no provider/auth reads, writes,
storage changes, bundle intervals, popup/OS dialog or page error; revised entry
checks observed no page errors or non-GET requests. Build: 1810 inputs,
927553-byte JS. 106 inspected captures include five scrolled sheet pairs and
four rule/example Info pairs, plus revised tracking. Current owner approval is
pending; navigation retains Sean’s standing pass-unless-reported instruction.

Only preview assets/evidence change. No production controller, scoring,
collector, migration, frozen v62, account data, merge or deploy change.
Retained-route reconciliation and whole-app implementation/acceptance remain
unfinished. New avatars/photos/awards stay held; parked Signal files are
untouched and unpublished.

## History Bets weeks and Older records mockups prepared — November 6, 2026

[Phone review index: all sixty captures](../design/style-directions-2026-11-04/HISTORY_BETS_OLDER_REVIEW.md).

Selected dark/Porcelain visuals now cover Bets weeks and all seven existing
Older record sections: retired Betting Challenge, saved games/notes, forecasts,
journal, real slips by week, older group scoring and Week 5 benchmark freeze.
Two native feature files are extracted and compared against explicit preview
adapters: injected read/context/args, haptics off, mark-only native matchups,
a negative-net styling hook, and illustrative note/archive/freeze metadata.
Native formatting/grouping/outcome/record/journal helpers and About History
copy remain unchanged. Existing initial avatars and section icons are reused.

Every identity, ticket, amount, quote-like entered term, outcome/final, note,
forecast, change, qualification, archive and freeze state is fictional/math.
No real private record, actual transaction, fixture, bookmaker quote/source,
source URL or observation/save/archive/freeze time is supplied. Thirty-six time
fields stay null. Example archive/frozen-record captions explicitly avoid real
provenance claims. Withheld Bets rows contain side/units only and no line/odds/
source/result/time; the locked slip has a side only. Challenge/journal withheld
counts and archive/benchmark hidden comparisons have no private values.

Native calculations are checked: +0.91U sample Bets record; qualification at three
picks or three units; Challenge W/L/P from gradeBet; journal net USD90.91 from one
active placed bet, excluding the still-listed archived loss and unstaked research
note; +150 combined sample parlay terms with 2U stake yield +3U; archived accuracy
math is 9+8+4=21. Virtual Units and journal cash remain separate. No simulated
book integration or new automatic settlement is introduced.

Twenty-four states plus four expanded views and source/rules Info in both themes
produce 60 inspected phone captures. Native loading/failed/unavailable/empty paths
are included. Local tabs, seven section links/back, disclosure rows and two Bets
weeks run in memory. Retry, Slip week and header Back are no-read notices.
Slips stays independently reachable when Older records is unavailable. No
API/hook/controller, auth/provider read, write/import/freeze, persistent storage,
polling, bundle interval, browser popup/dialog or page error was observed.

Checks passed: sixteen existing history/journal tests, two native feature source
comparisons, 24 fixture cases, native qualification/grade/accounting/math/hidden
checks; 192 layouts, 48 scenario flows, 88 loaded individual marks, fourteen
section opens, sixteen Info layout/scroll/Escape/focus checks and six prior mounts.
Build, Brand QA, syntax/diff and API/hook/storage/timer exclusions passed.
320/390/768/1440 bounds, 44px controls and footer reachability are checked separately
from extended captures. Loss words and negative example net use the existing
semantic loss color; selected lime remains on positive/key values.

[Native coverage queue](../design/style-directions-2026-11-04/NATIVE_COVERAGE_REVIEW.md) retains remaining NFL/action,
shared-shell and retained-route reconciliation. Real permissions/redaction,
account scope/completeness, source/timestamp evidence, settlement/import/freeze
validity and phone behavior remain separate. No whole-app completion, production
integration, merge/deploy/migration or frozen-v62 change. New avatars/photos,
awards and parked Signal files remain held.

## Account Guess History direction approved — November 6, 2026

Sean confirmed: "Looks good in both themes. Continue with the Bets weeks and
Older records mockups." This accepts the supplied nineteen Guess History states
plus expanded game/source/rules Info in both themes at
`e585b0afa23deb49996f4b044010d5b41656d5ce` (44 captures). Actual private records,
reference/source/timestamp evidence, device behavior and whole-app completion
remain separate. The structured record preserves exact confirmation and scope.


## Account Guess History mockups prepared — November 6, 2026

Account → History → Guess now carries the selected dark/Porcelain system:
season/player/market controls, week list, opened Spread/Total weeks, game
comparison disclosures, own draft/change timeline and independent read states.
Five native presentation blocks are source-compared with explicit adapters:
injected local reads/args/rules, fixed data clock, haptics off, mark-only native
matchups and labelled mathematical comparisons. Pure native formatting/status/
points/hidden/change helpers remain unchanged. The native About History topic
is retained. Header Back and History choices are shown; only Guess content is
supplied this batch, with no-action notices for other view/back/season/retry.

All identities, matchups, guesses, comparisons, points and change events are
fictional or mathematical. No actual fixture/kickoff, private pick, sportsbook
quote/source/observation, save/submission or change timestamp is invented.
Mathematical references say Example comparison and rule-math/no bookmaker quote;
source/observedAt stay null. Native pickPoints gives 9+8+4=21. Pending references,
unlocked active drafts and drafts closed at kickoff remain unscored. Current
sentFinal/revealAt/lateWindow rules preserve per-game lock-in/kickoff wording.
Sit-out retains its one already locked example; practice says not eligible.
Owner changes illustrate draft edits then lock-in, not a new post-lock edit.
Another player has hidden markers only and no owner-only timeline/drafts.

Nineteen states plus expanded game and two Info views in both themes produce
44 inspected phone captures. Cases include removed members, sit-out, practice,
active/closed draft, empty/loading/failed history, optional records failure,
and loading/failed/empty/held changes. Late, commissioner-ruled/eligible and
no-ballot status examples are included. Local controls never read/save accounts.
Bets weeks and Older records remain next, separately from approved Play scores
and Bets corrections. NBA is intentionally hidden from navigation (October 29
record and current sportOptions/Frame); retained links and records are preserved,
not new navigation targets or completed review evidence.

Checks passed: fourteen existing history-formatting tests, five native source
comparisons, nineteen fixture cases, 204 mathematical reference checks and 480
hidden rows without values across fixtures; 152 layouts, 38 scenario flows,
304 loaded separate marks, sixteen Info layout/scroll/Escape/focus checks and
six prior mounts. Build, Brand QA, syntax/diff and API/hook/storage/timer
exclusions passed. No writes, provider/auth reads, storage changes, bundle
intervals, browser popups/dialogs or page errors observed. 320/390/768/1440 bounds,
44px controls and footer reachability checked separately from extended captures.

[Native coverage queue](../design/style-directions-2026-11-04/NATIVE_COVERAGE_REVIEW.md) retains the remaining History,
NFL action/shared-shell and retained-route scope. Real records, authorization,
source completeness, submission references, clocks and phone acceptance remain
separate. Whole-app completion is not established. No production integration,
merge/deploy/migration or frozen-v62 change; avatars/photos/awards and parked
Signal files remain held.

## FEPL Fantasy direction approved — November 6, 2026

Sean confirmed: "Looks good in both themes. Continue with the next mockups."
This accepts the supplied sixteen FEPL states, expanded own standing and source/
estimate Info in both themes at `ad99d39390d63295cf87995d00558fb0a500c875`
(38 captures). Actual private/source/roster/inference/device behavior and whole-app
completion remain separate. The structured record keeps the exact confirmation
and capture list.


## FEPL Fantasy mockups prepared — November 6, 2026

Matchup, Standings, Rosters and Insights now carry the selected dark/Porcelain
system, with projection bubbles/bars, separate club-crest glass tiles,
expandable points/bonus rows, full lineups and the native weekly points chart.
Five native presentation panels are imported unchanged; the isolated view
wrapper is source-compared with two explicit adaptations: retry haptics off
and illustrative-data footer instead of a claimed saved Sleeper timestamp.
Production source descriptions inside panels remain, with prominent fictional
labels and source Info explaining the review contains no actual observations.

All eight managers and their eleven starters/three bench players, records,
matchweeks, pairing/repeat metadata, projections and results are fictional.
Registered club crests identify the catalog, not real affiliations. capturedAt
is null. Starter projections sum to 104.2; native winChance against 98.6 rounds
to 59%. Standings already include bonuses; the disclosed 20 is not added twice.
Thirty-two weekly sample values, high 141 and latest projection difference +8.6
are checked. Missing values stay null/dashes; chart gaps and isolated dots remain
native. Main screens are populated; deliberate edge-state examples are separate.

Sixteen states plus expanded own standing, source Info and estimate Info in
both themes produce 38 inspected phone captures. The state set includes three
unavailable-matchup reasons, missing projection/standings/chart data, detail
not started, loading, failed, manager-only refusal, feature off and no saved data.
Tabs/details operate in memory; retry is a no-read notice and stays failed.
Refused states contain no league data, even after a local section change. The
Fantasy hook/API/controller is excluded. No provider/auth read, non-GET request,
roster write, storage write, polling, interval, browser dialog/popup or page error
was observed. No real private league/player data is included in public assets.

Build, source/fixture checks, 128 responsive layouts, 32 scenario flows, 312 loaded
individual crest tiles, sixteen Info layout/scroll/Escape/focus checks, six prior
mounts, eighteen existing native view tests and forty domain/source tests passed.
320/390/768/1440 bounds, 44px controls and footer reachability are checked separately
from extended captures. Native panels and scoring/source code are unchanged.

[Native coverage review](../design/style-directions-2026-11-04/NATIVE_COVERAGE_REVIEW.md) records remaining existing
sport/shell/account/NFL reconciliation; whole-app completion is not established.
Actual Sleeper completeness, source times, permission enforcement, inferred
opponents, current rosters and physical-device behavior require separate evidence.
No production integration, merge, deployment or migration. Frozen v62 and parked
Signal files are unchanged; new avatar/photos and awards remain held.

## EPL moneyline and leaderboard direction approved — November 6, 2026

Sean confirmed: "Looks good in both themes. Continue with the FEPL Fantasy
mockups." This accepts the supplied fifteen moneyline/leaderboard states and
expanded fictional reveal in both themes, reviewed at
`6c54342754972f1a31ec5b42842adae66e2cf4ba` (32 captures). It does not establish
real price/source evidence, save/lock/reveal/privacy acceptance, physical-device
acceptance or whole-app completion. The structured selection record preserves
the exact confirmation and reviewed capture list.


## EPL moneyline and leaderboard mockups prepared — November 6, 2026

The selected dark/Porcelain system now covers sample entry, saved-draft example,
rule-math/pending/unscored results, closed unsaved draft, uncertain save, stale
read, fixed busy, read-only, unverified prices, loading, failed read, rule-math
leaderboard and its empty/loading/failed states. Five native presentation blocks
(GuessList, GuessCard, PriceStepper, DistanceLine, GuessLeaderboard) are isolated
and compared against source with documented preview adaptations. Native input,
closure/own/reveal helpers, validGuessPrice, distance and leaderboard are reused.

Adaptations suppress Button haptics, replace visible test kickoff with an
illustrative caption, use full club names and separate registered crest tiles,
keep long typed prices readable, retain local drafts across memory navigation
without discard confirmation, add an example-owner styling hook, and replace
real-reference provenance assertions only in the mathematical scored example.
Native pending/unscored copy and reveal guards remain. No native controller,
API or app source is changed.

Every fixture, eligibility date, sample guess, manager, reply and standing is
synthetic. The year-2000 test clock is not a real displayed kickoff. Entry has no
opponent rows; results contain fictional locked opponents only. −120 vs +120
uses the existing pure helper to produce 40 points off, labelled Example
reference with no bookmaker quote or observation time. No real line is invented.
Reference observation/source fields remain null. The schematic comparison line
retains an explicit distance number. Native leaderboard calculates six synthetic
rows with averages 0/10/15/15/25/null; the tied 15 over three scored matches sorts
before 15 over two, and all-unscored has no rank/average/meter. These are rule-math
examples, not player performance or sportsbook evidence.

Native five-point stepping across even odds, whole-price validation/storage
bounds, separate drafts/final locks, closed unsaved-draft retention, permitted
history when prices are unverified, read-only and paused stale/uncertain entry
are retained. Local edits affect memory only. Lock/save/refresh/week/retry show
no-action notices, never a saved success, reference read, unlock or reveal.
Busy stays fixed. Leaderboard/back preserves the local draft. No API/auth/
provider request, polling, persistent storage, clock interval, actual save/lock/
readback, budget change or message occurs. The original controllers/EPL API and
unused guess/read/guess/save execution paths are excluded from the bundle.

Thirty-two phone captures were inspected and subsequently approved in both themes
at `6c54342754972f1a31ec5b42842adae66e2cf4ba`. Checks
passed: 120 layouts, thirty scenario flows, 92 loaded individual crest tiles,
five native presentation comparisons with stated adaptations, fifteen fixture
cases, three visibility-gate cases, three even-step cases, three native
controller-source checks, exact rule-math scoring/order and missing-reference
handling, 24 existing native Guess UI/controller tests and eleven pure moneyline
rules tests. Field validation/storage-bound behavior, paused/busy guards, memory
navigation, native Info scrolling/Escape/focus, footer reachability and six prior
mounts passed. No storage writes, bundle intervals, provider/auth reads, non-GET
requests, popups, browser dialogs or page errors observed. Build, adapter/API/
storage/timer/controller exclusions, Brand QA, syntax and diff checks passed.
All content fits extended captures; narrow 320/390/768/1440 bounds and 44px
controls were checked separately. Expanded revealed example is included in both
themes; no real private data is exposed.

[NATIVE_COVERAGE_REVIEW.md](../design/style-directions-2026-11-04/NATIVE_COVERAGE_REVIEW.md)
records FEPL Fantasy's Matchup/Standings/Rosters/Insights next, then remaining
native reconciliation. Whole-app completion is not established. Native identity/
grants, real deadlines/locks/reveal/reference behavior, accounts/picks/drafts,
quotes/data, production tokens, collectors, budgets, migrations and frozen v62
are unchanged. No merge/deploy. New avatar/photos, awards and parked Signal
files remain held.

## EPL Home/recovery direction approved — November 6, 2026

Sean replied "Looks good in both themes. Continue with the EPL moneyline and
leaderboard mockups." to the supplied Home/recovery/source Info batch at reviewed
commit `d2ead64e55adb3d8c3b1ee7d55505236f995bc90`. That visual direction is
approved in both themes. Real clocks/permissions/turn acceptance, source
completeness/provenance, recovery/readbacks, device behavior and whole-app
completion remain separate. EPL moneyline and leaderboard are authorized next.

## EPL Home and draft-recovery mockups prepared — November 6, 2026

The selected dark/Porcelain system now covers your turn, picked club, unlinked
Home, all picks in, locked draft, independent progress failure, first loading,
failed draft read, refused access, feature off, no open matchweek, retained stale
board and results/source review. Seven native presentation blocks are isolated
from controllers/APIs: HOME_COPY, headline, EplHomeView, DraftReadState,
PrimaryAction, StandingsSource and HomeMoneylineProgress. Button haptics are
suppressed. Source Info alone adds an illustrative-only paragraph and omits
outbound fixture URLs. Native Countdown, boardModel/draftReducer/readProblem/
deadlineLine, DraftBoard/MarginChart and formatters are reused.

All managers, matchweeks, picks, counts, draft statuses and remaining time are
fictional clones of the unchanged existing EPL preview export. The explicit
fixed year-2000 clock is not a real kickoff. No fixture pairings, bookmaker
prices, saved moneyline rows, real identity/grants or permissions are supplied.
Home keeps the selected logo and shared tab bar. Linked club/slot tiles and the
unlinked omission are native. Ready 2-of-10 progress is illustrative; read-only,
prices-not-verified, loading, idle and failed-progress states keep native wording.
A progress problem never hides/disables the Home draft action.

Native reducer behavior is retained: first failure/loading show no board;
generic failure has Try again; 401/403/off/no-week drop prior data and have no
Retry. An ordinary failed refresh retains its last board, stale copy and turn
eligibility, with no new stale gate. Under-review uses the native locked action
and review wording, without inventing a bonus. Recovery visuals focus on the
existing board/action/status/source section; previously approved pool, queue and
confirmation remain separate. Native source guidance uses existing view-test
metadata only; visible/Info caveats state no table was fetched/used. Wikipedia-
contributor, not-official and CC BY-SA wording remains; fixture source links
are omitted. The source popup's default browser box and narrow long-word
overflow were found, styled with selected tokens, fixed and rechecked.

Buttons show no-action notices only; Retry does not pretend to refresh. Watch
hides the manager card in component memory and focuses Home's title; Reset
restores the card/watch focus. No API/auth/provider/source/permission read,
progress/draft refresh, saved readback, claim, pick/queue write, polling, storage,
automatic countdown/completion or message occurs. Actual Home/PickATeam/draft
reader/progress hook/API imports stay excluded.

Twenty-eight captures were inspected: thirteen screen states and source Info
in both themes; visual approval is pending. Checks passed: 104 layouts, 26
scenario flows, eighteen loaded crest tiles, sixteen popup layout/Escape/focus
checks, seven exact isolated presentation blocks with the stated adaptations,
thirteen fixtures, four native refusal-clear cases, stale retention, unchanged
source fixture, fixed Countdown and 36 existing native Pick/Home/progress tests.
Nested information, watch/reset focus, footer reachability, selected logo/tab
and six prior mounts passed. No storage writes, bundle intervals, provider/
source/auth reads, non-GET requests, popups, browser dialogs or page errors
observed. Build, adapter/controller/API/storage/timer exclusions, Brand QA,
syntax and diff checks passed. All supplied content/source dialogs fit their
extended captures; narrow 320/390/768/1440 bounds, 44px buttons and reachability
were checked separately. Popup-only corrections received targeted rechecks.

[NATIVE_COVERAGE_REVIEW.md](../design/style-directions-2026-11-04/NATIVE_COVERAGE_REVIEW.md)
records dedicated EPL moneyline/leaderboard next, followed by FEPL Fantasy and
remaining native reconciliation. Whole-app completion is not established.
Native controllers, server turn/refusal rules, actual clocks/schedules, grants,
accounts/picks/draft order, moneyline quotes/data, production tokens, collectors,
migrations and frozen v62 are unchanged. No merge/deploy. New avatar/photos,
awards and parked Signal files remain held.

## EPL manager direction approved — November 6, 2026

Sean replied "Looks good in both themes. Continue with the EPL Home and draft
recovery mockups." to the nine-state manager-link batch at reviewed commit
`0db5eafd47d6e6325c7cd0164ae392b42b78d4e8`. The supplied visual direction is
approved in both themes. Real identity/grants, claims/first-claim concurrency,
session watching, saved readbacks/device behavior and whole-app completion
remain separate. EPL Home and draft recovery are the authorized next batch.

## EPL manager-link mockups prepared — November 6, 2026

The selected dark/Porcelain system now covers Choose your manager, Just watching,
illustrative linked result, already-claimed conflict, already-linked account,
failed claim, unconfirmed save reply, fixed busy state and empty offered list.
Native CLAIM_COPY, claimManagers and ClaimCardView are isolated exactly from the
session/claim controller; only their two button sites add haptic=false. Native
boardModel/DraftBoard, Sheet/Button/InfoButton/Toast and SaveUncertainError text
are reused. This is existing manager-link UI, not new avatar/photo work.

The existing fictional EPL draft export is unchanged: eight sample managers,
two registered club crests in separate glass tiles and three example offered
identities. The conflict's fixed offer list excludes Alex; linked examples have
no chooser. Unlinked models cannot pick and have no queue; no board in this batch
has club/queue controls. The internal fixed test clock is not displayed as an
actual kickoff. No real grant, account, link, private pick or Sleeper read occurs.

Manager taps show a no-action notice, never a successful link or refresh. Just
watching hides the card in component memory only and moves focus to the board;
it does not change the real browser-session preference. Reset restores the
current scenario. Busy manager/watch controls are guarded and disabled. Native
Toast copy, role and tone are reused inside the preview Sheet, with duration=null
so supplied notices remain visible until dismissal; dismissal focuses Reset.
Every result is labelled illustrative/nothing attempted. Uncertain stays
unconfirmed; no saved readback is fabricated. Actual first-claim and refresh-vs-
ordinary-failure branches were source checked, not executed here.

Eighteen phone captures were inspected; visual approval is pending. Checks
passed: 72 layouts, eighteen scenario flows, 36 individually loaded crest tiles,
three exact isolated native blocks, two haptic-only adaptations, nine fixtures,
seven read-only unlinked model cases, four native outcome source branches,
unchanged source fixture, exact uncertain copy, fixed native Toast, 27 existing
native Pick a Team/claim/Home/queue view tests, nested information focus, Sheet
keyboard/Escape/opener return and six prior mounts. No storage writes, provider/
auth reads, non-GET requests, popups, browser dialogs or page errors observed.
Build, adapter/API/storage/timer exclusions, Brand QA, syntax and diff checks
passed. All content fits the extended captures; narrow scroll/footer bounds,
44px controls and focus checks were verified separately.

[NATIVE_COVERAGE_REVIEW.md](../design/style-directions-2026-11-04/NATIVE_COVERAGE_REVIEW.md)
records the remaining queue: native EPL Home/recovery, moneyline/leaderboard,
FEPL Fantasy and reconciliation of other existing sport/account/NFL layers.
It distinguishes confirmed gaps from areas still needing mapping, without
reopening approved states or claiming hosted availability. Native Home and draft
recovery are next. Whole-app completion is not established. Native controller,
first-claim enforcement/session watching, accounts/grants/picks/draft order,
production tokens, collectors, migrations and frozen v62 are unchanged. No
merge/deploy; new avatar/photos, awards and parked Signal files remain held.

## EPL correction direction approved — November 6, 2026

Sean replied "Looks good in both themes. Continue with the next mockups." to
the nine-state EPL correction batch at reviewed commit
`d340a248cf0e6696ca83d68c46aa6398ffb27ff1`. The supplied visual direction is
approved in both themes. Real permissions, source completeness/provenance,
cancellation, refresh/device behavior and whole-app completion remain separate.
The next batch follows the native coverage reconciliation: FEPL manager linking.

## EPL stat-correction mockups prepared — November 6, 2026

The selected dark/Porcelain system now covers comparison, partial totals with
no next-week picks, successful empty list, unavailable checks, read failure,
restricted access, first loading, refreshing and last-loaded refresh failure.
Paired original/recheck glass tiles preserve decimals and signed differences;
no performance trend is inferred. Source capture times remain separate in a
44px disclosure, open in populated review captures. Native Sheet/Button/
InfoButton/static Skeleton and unchanged fmtFull/fmtNum/fmtSigned are reused.
Ten static native copy fields and recorded-picks/no-picks guidance are retained.

Every person, matchweek, pick count, capture time and normalized total is
fictional. The two pairs are 611.25 to 613.5 (+2.25) season points and 584.75 to
583.25 (−1.5) points against. Partial corrected points and delta stay —, never
zero. No private roster or pick payload appears. Denied/failed/first-loading
fixtures contain no review data; empty and unavailable remain distinct.
Refreshing/stale retain the original supplied examples and timestamps. Stale
content is explicitly labelled fictional last-loaded reviews.

The existing tool remains read-only. There is no Apply/Reorder/Acknowledge/Save
control. Refresh shows a no-action notice only; loading/refreshing are guarded,
disabled and fixed, without automatic completion. No API/auth/permission read,
Sleeper/source read, audit, status readback, storage, polling, timer, message or
pick/draft/order change occurs. Actual controller/API imports stay excluded.

Eighteen phone captures were inspected; visual approval is pending. Checks
passed: 72 layouts, eighteen scenario flows, ten native copy fields, nine fixture
states, two paired deltas, three next-week copy cases, native number/Pacific
formatters, two native access/abort source checks, five existing endpoint tests,
two existing view tests, nested information focus, Sheet keyboard/Escape/opener
return and six prior views. No storage writes, provider/auth reads, non-GET
requests, popups, browser dialogs or page errors observed. Build, import/write
exclusions, Brand QA, syntax and diff checks passed. All content fits the supplied
extended captures; narrow scroll/footer bounds and 44px controls were checked
separately. Local Vitest initially could not resolve dependencies; an ignored
worktree node_modules junction to the existing shared dependencies allowed its
two native view tests to pass without installing or changing dependencies.

Review assets/evidence only; no merge/deploy. Actual Community grants,
normalized/source reads, snapshots/audits, picks/draft order, APIs/auth/storage,
production tokens, migrations and frozen v62 are unchanged. Hosted permission,
source completeness/provenance, cancellation, refresh and physical-device
acceptance remain separate. Remaining native coverage will be reconciled next;
whole-app completion is not established. New avatars/photos, awards and parked
Signal work stay held.

## Odds connection direction approved — November 6, 2026

Sean replied "Looks good in both themes. Continue with the next mockups." to
the supplied seven-state, fourteen-capture odds-connection batch at reviewed
commit `05a7cc5f5c0db3641654924ef96de44e08693951`. That visual direction is
approved in both themes. Real authorization/connection, measured quota/cost,
pending request reuse/readback, actual collection/benchmark eligibility,
physical-device acceptance and whole-app completion remain separate. EPL stat-
correction mockups are next. New avatars/photos and awards stay held.

## Odds connection mockups prepared — November 6, 2026

The selected dark/Porcelain system now covers before-check, successful measured-
check example, manual-fetch counts, low-quota block, pending collect, provider
rate-limit and fixed checking. Native Sheet/Button/InfoButton, unchanged
oddsCount/oddsFetchAllowed/oddsSummary, seventeen native copy fields and the
isolated schedule label formatter are reused. Existing zero-credit check,
up-to-two-credit fetch, six-per-UTC-day limit, five-minute gap, 50-credit reserve,
52-credit measured gate and benchmark/reveal guidance are retained.

Every connection/reply/count/quota/schedule state is fictional. Example check
counts are 15 events, 316 remaining and zero used; fetch counts are 90 quotes,
314 remaining and two used. No provider success, measured quota or stored quote
is asserted. The 51-credit example blocks Fetch. Fetched/pending examples retain
an explicit earlier successful measured-check fixture; readiness is never inferred
from a collect reply alone. Native unknown counts remain Unavailable behind
Request counts rather than invented zeros. Free quota rules are expandable;
0/2/50 glass tiles repeat the existing limits without changing them.

All actions show no-action notices. Initial/low-quota/failed/checking guards and
disabled controls prevent fetch previews. Pending stays pending; its same-action
retry wording is unchanged. The real controller's retained request ID is source-
checked, never generated/exposed or executed here. No API/auth/provider request,
saved-status read, collection, credit/budget/schedule change, persistent storage,
refresh, timer or message occurs. No key fields, provider identity or market
values are present.

Fourteen phone captures were visually inspected; visual approval is pending.
Checks passed: 56 layouts, fourteen scenario flows, seventeen native copy fields,
seven fixture cases, two prior-check preservation cases, four unknown-count
cases, four quota/cost cases, four native guard/request-retention source checks,
three existing native odds-rule tests, nested information focus, Sheet keyboard/
Escape/opener return and six prior views. No storage writes, provider/auth reads,
non-GET requests, popups, browser dialogs or page errors observed. Build,
count-only shape and controller/provider/write exclusions, Brand QA, syntax and
diff checks passed. Extended captures show content; narrow reachability/footer
bounds and 44px controls/disclosures were checked separately.

Review assets/evidence only; no merge/deploy. Real original-commissioner grants,
connection/configuration, measured quota/cost, pending readback/idempotency,
actual collection/benchmark eligibility and physical-device acceptance remain
separate. Native controller/grants, provider/key/configuration, request IDs,
server limits/reserve, automatic schedule, quotes/reveal rules, APIs/auth/storage,
collectors, production tokens, migrations and frozen v62 are unchanged. EPL stat-
correction review is next. New avatars/photos, awards and parked Signal work
stay held.

## Final score review direction approved — November 6, 2026

Sean replied "looks good continue" to the supplied entry, confirmation, source-
correction, conflict, unavailable and fixed recording direction in both themes
at reviewed commit `d9113bdd0070ab49ef79cd64ec0ff6281a7c4cf3`. That visual
direction is approved. Live authorization, source checks, idempotency, receipts/
concurrency/audits, Challenge grading, persistence, physical-device acceptance
and whole-app completion remain separate. Odds connection is next, then EPL
stat-correction reviews. New avatars/photos and awards stay held.

## Final-score review mockups prepared — November 6, 2026

The selected dark/Porcelain system now covers final-score entry, confirmation,
metadata correction, version conflict, unavailable service and fixed recording.
Exact native emptyFields/sourceURL/validate helpers and fourteen display-copy
fields are retained. Native Sheet/Dialog/Button/InfoButton/TeamMark and Pacific
formatting are reused. Ordinary-final/commissioner-reported/Challenge grading
warnings, completed-game assertion, Keep editing first and prior-version audit
wording remain. Input edits reset the assertion.

Fourteen Week 8 matchups, kickoff times and recordedFinal values reuse the
previously hash-verified public score-history export unchanged, including zero
scores. Source name, example.invalid URL, observation time, reasons, versions,
prior entries, conflict readback and service states are fictional. The example
clock is the public publication time. The correction changes source metadata
while retaining the archived final; no real wrong score, original observation/
review timestamp, server receipt or saved success is invented.

The conflict keeps fields and blocks another review. Explicit Refresh preview
reveals fictional version 2; separate Use version resets acknowledgment before
a new review. There is no automatic rebase. Confirmation/Refresh only show
no-action notices. The unavailable state stays unavailable. No results API/auth,
source URL request, request-ID generation, grading, audit, refresh, persistent
storage, provider fetch, timer or message occurs.

The selected native Dialog replaces the legacy presentation frame only. A
preview key/cancel/close boundary keeps it inside Sheet behavior and isolates
nested information; heading focus, Keep editing/Escape opener return and a
fixed busy state that survives repeated Escape are verified. Actual legacy
controllers, request reuse and exact receipt checks remain unchanged/excluded.

Twelve phone captures were visually inspected; approval is pending. Checks
passed: 48 layouts, twelve scenario flows, eight individually loaded logo tiles,
three exact validation helpers, fourteen native copy fields, sixteen validation
cases, fourteen public final games/56 field comparisons, six fixture scenarios,
three metadata-correction checks, three native version/request/receipt source
checks, nested information focus, confirmation Escape/opener return, repeated
busy Escape and six prior views. No storage writes, result/example-source reads,
non-GET requests, popups, browser dialogs or page errors observed. Build,
controller/clock/write exclusions, Brand QA, syntax and diff checks passed.
Extended captures show content; narrow reachability/footer/dialog bounds, 44px
controls, 16px fields and 29px score entry were checked separately.

Review assets/evidence only; no merge/deploy. Real authorization, source checks,
idempotency, exact receipts, concurrent corrections, audits, Challenge grading,
persistence and physical-device acceptance remain separate. Actual controllers,
permissions, versions/history, grading/data/locks, APIs/auth/storage, collectors,
production tokens, migrations and frozen v62 are unchanged. Odds connection is
next, then EPL stat-correction reviews. New avatars/photos, awards and parked
Signal work stay held.

## Game referee direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
for the supplied current/draft/busy/partial-save/read-error referee direction at
reviewed commit `c743e553fea52362381650ac8818d927d06886ea`. That visual direction
is approved in both themes. Live crews/options, permissions, reads/saves,
partial/uncertain recovery, cache/audit consistency, persistence, physical-device
acceptance and whole-app completion remain separate. Final-score review is next.
New avatars/photos and awards stay held.

## Game referee assignment mockups prepared — November 6, 2026

The selected dark/Porcelain system now covers current fictional assignments,
editable drafts, a fixed saving state, partial-save error and read-error disabled
controls. Native Sheet/Button/InfoButton/TeamMark, Pacific formatting and the
unchanged refereeFor helper are reused. Seven native copy fields, hosted-over-
file precedence (including a cleared assignment), changed-row calculation,
extra-option retention, busy/ready guards and partial-error shape are retained.

All fifteen matchups/times and the neutral flag reuse the verified archived
public schedule. Example official A/B/C, assignments, draft selections and
partial outcome are deliberately fictional; no real NFL crew announcement,
referee, audit timestamp or revision is asserted. Read-error has no hosted map
and falls back to the fictional static map while disabling controls. A neutral
clock marks an unassigned example; changed choices use lime Draft markers.

Three games show initially; Show all 15 keeps the whole list available. Draft
counts include hidden rows. Choice/clear/preview and collapse/reopen retain
component-memory drafts. Busy rejects changes and submits without auto-resolving.
The partial scene has one explicitly fictional already-recorded row and two
remaining drafts; preview never claims a real retry succeeded. Controls do not
read/save assignments, change trends/cache/history, clear draft storage or call
any API/auth/provider operation, timer or message.

Ten phone captures were visually inspected; visual approval is pending. Checks
passed: 40 layouts, ten scenario flows, 60 loaded individual logo tiles, seven
native copy fields, five fixture projections, fifteen unchanged public schedule
rows, seven precedence/option cases, three changed/clear cases, three partial-
retention checks, three native busy/ready source guards, nested information focus,
Sheet keyboard/Escape/opener return and six prior views. No storage writes,
officials reads, non-GET requests, popups, browser dialogs or page errors observed.
Build, controller/write exclusions, Brand QA, syntax and diff checks passed.
Extended captures show content; narrow scrolling/footer bounds, 44px controls
and 16px themed native selects were checked separately.

Review assets/evidence only; no merge/deploy. Real crew/options, permissions,
reads/saves, partial/uncertain recovery, cache/audit consistency, persistence and
physical-device acceptance remain separate. Native controllers/cache, real
assignments/history, APIs/auth/storage, collectors, production tokens, migrations
and frozen v62 are unchanged. Final-score review is next. New avatars/photos,
awards and parked Signal work stay held.

## Weekly operations direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
for the supplied status, pause, uncertain settlement, week input/review/error
visual direction at reviewed commit
`e7cd9497ca3947dbfec761cc827feb0ac59ae7ac`. That direction is approved in both
themes. Live jobs, permissions, settlement/readback, publication/deadlines,
freshness/quota, physical-device acceptance and whole-app completion remain
separate. Game referee assignment details are next. New avatars/photos and
awards stay held.

## Commissioner status and week opening mocked — November 6, 2026

The selected dark/Porcelain system now covers automatic week opening, odds
refresh, illustrative Virtual Units settlement progress, free-quota pause,
uncertain settlement checks, week entry, archived schedule review and connection
error. Native Sheet/Button/InfoButton/TeamMark and Pacific formatting are reused.
Twelve native display-copy fields and exact pure refreshLabel/scheduleDetails/
API-date bodies are isolated from their controllers. Schedule guidance is behind
a disclosure. All system statuses, example last-run time and 8-of-15 settlement
counts are explicitly fictional; no hosted freshness or provider-credit claim.

The schedule-only export projects fifteen matchups, kickoffs and neutral flags
from the already verified November 5 public season snapshot, SHA-256
`579f59616c4e51b678fe3f180fea3730995cc2aac73a76c59cf7ad2a8f3dda41`.
It includes the neutral Bengals/Falcons game and follows native buildSlate's
earliest-kickoff deadline rule. This archived slate is not a live/upcoming week
publication. Three rows show initially; Show all 15 retains every game. Each
team mark has its own tile and hides fallback letters once loaded. No odds,
guesses, scores, account or private fields are exported. The public projection
is hash-verified, schema-checked and byte-for-byte deterministic.

Uncertain settlement remains check-only with no automatic replay or pretend
readback. Settle/Check/Publish show preview notices only. Changing season/week
immediately clears the old reviewed schedule; local review supplies only the
archived 2026 Week 9 slate. No API/auth read/write, refresh, provider collection,
persistent storage, timer, publishing, settlement, lock change or message occurs.
No operational policy is changed.

Twelve dark/light phone captures were visually inspected; approval is pending.
Checks passed: 48 layouts, twelve scenario flows, 60 individually loaded logo
tiles, twelve native copy fields, three exact formatter bodies, ten formatter
comparisons, fifteen public schedule rows/60 field comparisons, one neutral flag,
two earliest-kickoff checks, nine input cases, three native check/guard/edit
source checks, nested information focus, Sheet keyboard/Escape/opener return
and six prior views. No storage writes, operational reads, non-GET requests,
popups, browser dialogs or page errors observed. Build, deterministic preparation,
controller/write exclusions, public-field whitelist, Brand QA, syntax and diff
checks passed. Extended captures show content; narrow reachability, frame/footer
bounds, 44px controls and 16px inputs were checked separately.

Review assets/evidence only; no merge/deploy. Actual jobs, permissions, settlement/
readback, publication/deadlines, freshness/quota and physical-device acceptance
remain separate. Production controllers, schedules/locks, provider limits,
collectors, records, APIs/auth/storage, tokens, migrations and frozen v62 are
unchanged. Referee assignment details are next. New avatars/photos, awards and
parked Signal work remain held.

## Commissioner menu and member direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
for the supplied commissioner menu, member list, remove/restore, pending check
and restriction direction at reviewed commit
`7c2ba3da13ddeb1bf5574445cb2d9341a012771d`. That visual direction is approved in
both themes. Live authorization, fresh reads, concurrency, persistence/readback,
audit attribution, physical-device acceptance and whole-app completion remain
separate. Commissioner schedule/settlement and week-opening details are next.
New avatars/photos and awards stay held.

## Commissioner menu and Community members mocked — November 6, 2026

The selected dark/Porcelain system now covers the commissioner menu, Community
member list, remove/restore confirmations, pending access check and Community-
admin restriction. Six native tool destinations/icon keys, fourteen static
member copy fields and both native confirmation titles are retained. Native
Sheet, LinkRow, Button, InfoButton and existing initials Avatar are reused.

Alex Lane, Morgan Reed and Jamie Park are fictional. Removal preserves entered
records under existing visibility rules and leaves private memberships unchanged;
it does not delete an account. Cancel stays first, your own row has no access
change action, and pending shows a check instead of another change. The restricted
private-host example has no Community-admin grant, roster or privileged action.
All controls affect selection/notices only. Remove/Restore leave fixture access
unchanged; Check stays pending and never claims real readback or replays a write.
Refresh reads nothing. Tool rows show entry notices: their details are outside
this batch. No API, auth, storage, membership, settlement, publishing, fetch or
message operation is performed.

Twelve dark/light phone captures were visually inspected; visual approval is
pending. Checks passed: 48 responsive/frame/footer layouts, twelve scenario
flows, six native tool rows, fourteen member copy fields, one dynamic-title
comparison, three permission/self/pending source guards, two native read-before-
write/single-write checks, fixture independence, nested information focus return,
Sheet keyboard/Escape/opener return and six prior views. No storage writes,
privileged reads, non-GET requests, popups, browser dialogs or page errors were
observed. Build, controller/write exclusions, Brand QA, syntax and diff checks
passed. Extended captures show content; narrow scroll reachability and 44px
controls were checked separately.

Review assets/evidence only; no merge/deploy. Real authorization, fresh reads,
concurrency, pending-check persistence/readback, audits and physical-device
acceptance remain separate. Native controllers, Community-admin/original Triple
Threat grants, real memberships/history, visibility rules, APIs/auth, collectors/
budgets, production tokens, migrations and frozen v62 are unchanged. Commissioner
status/week-opening details are next. New avatars/photos, awards and parked
Signal work stay held.

## Session and name recovery direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
for the supplied session-expiry and retained first-name recovery direction at
reviewed commit `9d5d0ad85dcf779802cbf0ae6777691b5758ae19`. That visual direction
is approved in both themes. Actual reauthentication/provider return, persistence,
save/readback, invitation access, physical-device acceptance and whole-app
completion remain separate. Commissioner menu and Community member controls are
next. New avatars/photos and awards stay held.

## Session-expiry and first-name recovery mocked — November 6, 2026

The selected dark/Porcelain system now covers Sign in again with password plus
Google, failed password and Google-only examples, uncertain/offline/sign-in-
required first-name saves, and first-name setup with a saved private invitation.
Native Dialog, Button, InfoButton and existing initials Avatar are reused.
Isolated session copy (10 fields) and name copy (14 fields) match native source;
the existing 60-character name bound is retained. No new account rules or
avatar/photo choices are proposed.

Alex Rivera, alex@example.com and the read-only password are fictional.
Underlying names remain only in component memory. Not now/Escape dismisses the
example session prompt and keeps its typed name; actual Sign out has separate
draft-clearing rules and is never invoked. The uncertain-name Check if it saved
example keeps the exact typed text and shows native still-not-saved wording,
explicitly labelled an example. Source verification confirms the real check
reads lobby only and never resubmits. Continue/sign-in/Google/sign-out controls
show preview notices only; no real success or readback is asserted. The saved
private-invite presence flag contains no token, URL, recipient or access grant.

Fourteen phone captures were visually inspected; visual approval is pending.
Checks passed: 56 layouts across four viewport widths and both themes, fourteen
scenario flows, ten session and fourteen name copy fields, four native dismiss/
check source checks, nested information focus/Escape, session dismiss/opener/
draft retention, conditional methods, read-only password, failure semantics,
name validation, check-versus-retry distinction and six prior-view mounts.
No storage writes, auth/profile reads, non-GET requests, popups, browser dialogs
or page errors were observed. Build, controller/write exclusions, Brand QA
(using Python UTF-8 mode on Windows), syntax and diff checks passed. Extended
captures show content; narrow scrolling, touch targets and input sizing were
checked separately.

A regression was reproduced: nested information cancel events bubbled through
React to the parent session dialog. A preview-only cancel/close propagation
boundary fixes it. Escape closes information alone with focus return, then a
separate Escape dismisses the session example. Native UI primitives and live
auth/session components are unchanged.

Review assets/evidence only; no merge/deploy. Actual reauthentication, provider
return, tab-draft persistence across reload, name-save/readback, invitation
access and physical-device acceptance remain separate. Production controllers,
draft storage, account/provider configuration, APIs/data, invitations, tokens,
migrations and frozen v62 are unchanged. New avatars/photos, awards and parked
Signal work remain held. Reconcile remaining native coverage after this review.

## League access direction approved — November 6, 2026

Sean replied "good. continue" to the supplied private access pending,
Community removed with/without groups and saved-link/joining/uncertain visual
direction in both themes at reviewed commit
`5609f305f905b6949a337508a30be55a5ce7ebc7`. That visual direction is approved.
Actual access rules, token behavior, joining, retention/persistence,
physical-device acceptance and whole-app completion remain separate. Session
expiry and retained first-name draft recovery are next. New avatars/photos
and awards remain held.

## League access and saved private invitations mocked — November 6, 2026

The selected dark/Porcelain system now covers private-league access pending,
Community access removed with/without private groups, saved private invite
links, joining and uncertain join replies. Native AccessPending, RemovedScreen
and InviteCard presentation bodies are copied exactly except disabling haptics
and exporting the renamed saved-card component. Native switcher copy (21 fields)
and existing leagueRows projection are retained. No change to access rules is
proposed. The Community-removal copy retains Everything you entered is kept;
Your leagues appears on that screen only in the has-private-groups example.

Saturday Club is deliberately not in the fixture membership list. Existing
fictional Community/Head to Head/Weekend Crew rows/counts and Alex Lane initials
are reused. The saved-link card has no usable token/URL, recipient address or
expiry. It is distinct from the selected general public app invite. Join only
shows an explicit preview notice; the busy example rejects another action and
never transitions automatically. The uncertain checked-list words are labelled
an example, not a claim of actual readback. Dismiss removes the example card
only; membership rows and real stored invitations/records remain unchanged.
Choosing a fixture league changes its checkmark, with an explicit no-real-view/
permission-change notice. Access-cover actions keep the surrounding frame.

Twelve dark/light phone captures were inspected; visual approval is pending.
Checks passed: 48 responsive/frame/footer layouts, twelve scenario flows,
21 native switcher copy fields, three exact presentation bodies, three fixture
membership checks and two source checks of the real join guard. Conditional
fallback, local list ordering/selection, no-grant notices, saved-card join/
dismiss, retained fixture rows, no uncertain replay, busy semantics, native
information focus return, Sheet trap/Escape/opener return and six prior views
passed. No storage writes, auth/join reads, non-GET requests, browser dialogs
or page errors were observed. Build, controller/token/write exclusions, Brand
QA and syntax/diff checks passed. Extended captures show content; narrow
scrolling and touch targets were checked separately.

Production AppGate/access rules, switcher/join/invitation controllers, actual
rosters and records, tokens, storage, APIs/auth, collectors, branding/tokens,
migrations and frozen v62 are unchanged; no merge/deploy. Actual permissions,
recipient matching, token expiry/consumption, concurrency, uncertain-join recovery,
retention/persistence and physical-device acceptance remain separate. New
avatars/photos, awards and parked Signal work remain held.

## App continuity direction approved — November 6, 2026

Sean replied "looks good continue" to the supplied offline, startup, account/
tab/page failure and reload-warning storyboard direction in both themes at
reviewed commit `6e634d1fd8e1452585a5b5536855a5c337aff655`. That visual direction
is approved. Actual connection, data-preservation/reload behavior, permissions,
physical-device acceptance and whole-app completion remain separate. League
access pending, Community removal and saved private-invitation examples are next.
New avatars/photos and awards remain held.

## App offline/loading/failure and reload warning mocked — November 6, 2026

The selected dark/Porcelain system now covers offline with illustrative content,
startup placeholders, account-load failure, failed tab, failed page and a dirty-
reload warning storyboard. Startup/account failure correctly precede the frame;
offline/tab/page examples keep the frame and navigation. The Home/Research
context highlight is scoped to these review states. Native OfflineBanner and
FailCard presentation bodies are reused exactly except disabling haptics, with
31 isolated native copy fields and the existing static Skeleton component.

The offline example keeps the reviewed fictional 8/12 Home visual visible.
Retry does not read connection state or refresh; the native still-offline words
are attributed to the example. Failed-view retry, account reload and sign-out
only show preview notices. The loaded-view reload storyboard uses the exact
existing Leave without saving your changes? prompt; Keep editing and Leave
neither reload, navigate, save nor clear. Account-load failure does not invent
a dirty-shell guard before the frame. The actual confirm-before-clear/reload
logic remains unchanged. No browser confirmation is fabricated or triggered.

Twelve dark/light phone captures were inspected; visual approval is pending.
Checks passed: 48 responsive layouts, ten continuity scenario flows, 31 native
copy fields, two exact presentation bodies, two source checks of the dirty-
reload guard, static skeletons and information Escape/focus return in both
themes, all 48 frame distinctions, 32 framed navigation bounds, eight contextual
navigation checks and six prior views. An initially cropped dark-tab dock was
corrected with a scoped flex/min-height rule; the checks and captures were
repeated after that fix. No page errors, auth reads, non-GET requests, storage
writes or browser confirmation dialogs were observed. Build, controller/reload
exclusions, Brand QA and syntax/diff checks passed.

No real connection, account, cached player record or unsaved draft is read.
Production shell/frame/gate/boundary logic, auth, connection events, reload and
dirty-state behavior, data/drafts, collectors, branding/tokens, migrations and
frozen v62 are unchanged; no merge/deploy. Actual offline/readback, preservation,
recovery, access restrictions, updates/reloads and physical-device acceptance
remain separate. New avatars/photos, awards and parked Signal work stay held.

## Export direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
The supplied export overview, preparation, completion example and failed/
unavailable direction is approved in both themes at reviewed commit
`34d2902a1bb886c40a014710a8a0b62eba60835e`. Actual export bytes, account isolation,
full database runtime tests, hosted availability, physical-device file handling
and whole-app completion remain separate. App-wide offline/loading/failure
screens and the reload-warning storyboard are next. New avatars/photos and
awards remain held.

## Export my data mocked — November 6, 2026

The selected dark/Porcelain glass system now covers Export my data, preparation,
a labelled completion example, failure/retry and unavailable service. A JSON
file hero and four record-category cards give the existing personal-export
flow a visual hierarchy. The seven native export copy fields and exact filename
helper are isolated without the controller. All three original INFO.export
paragraphs are unchanged: own records and revisions, no other-player records or
push-device addresses/keys, and nothing changed or deleted.

No account record, private pick/line, record count, payload or export time is
read or invented. YYYY-MM-DD is a filename pattern, and the completion card is
explicitly labelled an example with no file created. Preparation disables the
main action and has no timer or automatic transition. Its completion button is
a storyboard step. Failed retry and unavailable check affect example memory
only; the unavailable example never asserts a service recovery.

Ten dark/light phone captures were inspected; visual approval is pending.
Checks passed: 40 responsive layouts, six export scenario flows, seven native
copy fields, three filename cases/exact helper parity and six native guidance
paragraph comparisons. Busy guard, explicit transitions, failure/unavailable
behavior, narrow action reachability, native information and Sheet keyboard/
Escape/opener return, memory on reopen and six prior views passed. No object
URL, download, storage write, auth read, non-GET request or page error was
observed. Build, controller/file-operation exclusions, Brand QA and syntax/diff
checks passed. The existing SQL suite passed one source check; two optional
PGlite runtime checks were skipped because that local runtime is not installed.
No remote database test was run; no new database/hosted isolation claim is made.

Production export controller and ownerId check, account records, API/database,
collectors, branding/tokens, migrations and frozen v62 are unchanged; no merge
or deployment. Actual export bytes, complete database runtime verification,
owner isolation, file handling and physical-phone acceptance remain separate.
New avatars/photos, awards and parked Signal work remain held.

## Appearance direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
The supplied Appearance, System, explicit/device-reduced motion and unavailable
storage direction is approved in both themes at reviewed commit
`9ac86fc282cfd55c6121b2a4141e44406f76b229`. Actual persistence, OS/browser
behavior, animation, physical-device acceptance and whole-app completion remain
separate. Export my data and its preparation/completion/error examples are next.
New avatars/photos and awards remain held.

## Appearance controls mocked — November 6, 2026

The selected dark/Porcelain glass system now covers Appearance: Dark, Light,
System, Reduce motion, device-requested reduced motion and unavailable storage.
Native Sheet, Segmented, Switch, Button and InfoButton are reused, with seven
native Appearance copy fields and the exact isolated resolveDashboardMotion
body. An illustrative 8/12 Home action card previews the already selected
palettes and Gs. Choosing a theme changes this miniature only; the paired review
frames keep their named themes. Reviewer device-scenario controls live behind
information and are not proposed product settings.

The explicit Reduce motion toggle remains off when reduced motion is requested
only by the example device, while the effective label correctly reads Reduced.
Native storage messages are clearly labelled examples; no actual Saved state
is asserted. Unavailable storage never becomes a persisted-success state.
All card graphics are static; motion labels demonstrate preference resolution,
not observed animation or an OS setting. All changes stay in component memory.

Ten dark/light phone captures were inspected; visual approval is pending.
Checks passed: 40 responsive layouts; four appearance/unavailable-storage flows;
all 36 valid theme/device/motion combinations against the native Theme logic
and native motion function; seven native copy fields; four invalid preference
fallbacks; seven scoped palette checks; exact native motion-body parity.
System changes, device motion override, native information Escape/focus return,
Sheet trap/opener return, memory on reopen, narrow lower-card reachability,
selected-logo loads and six prior views passed. No storage writes, auth reads,
non-GET requests or page errors were observed. Build, controller/store exclusions,
Brand QA and syntax/diff checks passed. Extended captures show content; narrow
scrolling/touch reachability was checked separately.

Production Theme/Menu providers, preference stores, browser metadata,
branding/tokens, accounts, collectors, migrations and frozen v62 are unchanged;
no merge/deploy. Actual persistence/cross-tab behavior, OS/browser appearance,
animation, updates/icons and real-phone acceptance remain separate. New
avatars/photos, awards and parked Signal work remain held.

## Recovery direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
The supplied Forgot password, reset notice/form/mismatch, unavailable sign-in
and loading visual direction is approved in both themes at reviewed commit
`75764996412d6ba78982513def909fc9f5f51d84`. The unseen sign-in recovery-entry
update, actual reset/email/auth behavior, persistence, physical-device
acceptance and whole-app completion remain separate. Appearance controls and
device-only storage/motion examples are next. New avatars/photos and awards
remain held.

## Account recovery, unavailable sign-in and loading mocked — November 6, 2026

The selected dark/Porcelain access skin now covers Forgot password entry,
account-neutral reset request notice, new/confirm password, mismatch,
sign-in-unavailable and session-loading examples. The already-native Forgot
password control is brought into the preview's sign-in/create form, keeping
its actual implementation unchanged. All eight native recovery/loading copy
passages are retained, including "If this address has a game account".

Every email/password field is a fixed read-only example. The reset-form and
loading exit are explicit storyboard controls, not authentication bypasses.
The mismatch stays an error until the viewer chooses the matching fixture.
No email, valid recovery session, changed password or real sign-out is claimed.
Loading has no timer, automatic retry, transition or account read. Existing
actual recovery/session checks, provider setup and cooldown rules are unchanged.

Fourteen dark/light phone captures, including sign-in recovery entry, were
visually inspected; visual approval is pending. Checks passed: 48 responsive
layouts, eight recovery/error/loading scenario flows, eight native copy matches,
account-neutral notice and controller/automatic-retry exclusions. Prior 14-key
name copy, six auth passages, eight name cases and controller checks still pass.
Native information Escape/focus return passed in both themes; legal links were
reachable across all layouts; six earlier views still mount. All scenario write
counters stayed zero; no page errors, non-GET requests, auth reads or provider
popups were observed. Build, Brand QA and syntax/diff checks passed. Extended
captures show content; scrolling/touch targets were checked separately.

Production auth, credentials/accounts, real email/Google service, recovery and
sign-out handlers, storage, branding/tokens, migrations and frozen v62 are
unchanged; no merge/deployment. Actual recovery, token/session/mail behavior,
persistence, other unseen errors and phone acceptance remain separate. New
avatars/photos, awards and parked Signal work remain held.

## Account access direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
The supplied sign-in, account-creation, email-confirmation and first-name visual
direction is approved in both themes at reviewed commit
`f3479d4afa7aabc3d234ccf3c76c431d1da9c05d`. Actual authentication, email/profile
saves, provider configuration, unseen errors, physical-device acceptance and
whole-app completion remain separate. Password recovery, reset/mismatch,
sign-in-unavailable and loading states are next. New avatars/photos and awards
remain held.

## Account access and first-name setup mocked — November 6, 2026

The selected dark/Porcelain glass system now covers sign in, account creation,
email confirmation and first-name setup. The selected theme G, floating form
surfaces, outlined primary and glossy icon treatment carry through the
full-screen flow. Signed-in header/navigation hide only while this preview is
mounted and restore on return to other views.

Email and password are fixed read-only fictional examples. Google, sign-in,
creation, resend and name-preview controls never contact a provider or account.
The confirmation notice retains native wording; its example card explicitly
says no email was sent. View first-name example is a storyboard step after
confirmation, not an authentication or confirmation bypass. Existing returning
players with saved names skip this setup in the real flow. First-name input
uses the existing name rule and native initials avatar, in memory only.
No saved private invitation or granted membership is invented.

Eight dark/light phone captures were visually inspected; approval is pending.
Checks passed: 32 responsive layouts, two complete access flows including
Google/sign-in no-action notices, creation/confirmation/resend storyboard,
empty-name error/focus, trimmed name and native initials; all 14 isolated native
NAME_STEP_COPY keys, six AuthGate copy passages, eight name-validation cases,
two fictional-credential checks and two controller/call exclusions. Native
information dialog Escape/focus return and selected logo loads passed in both
themes. Privacy/Terms remained reachable across all layouts and retained their
public destinations. Six prior views restored signed-in chrome. No page errors,
non-GET requests, storage writes or provider popups were observed. Build,
Brand QA and syntax/diff checks passed. Capture heights are extended to show
content; scrolling and touch targets were checked separately at narrow width.

Production auth/name controllers, provider configuration, accounts, drafts,
branding/tokens, migrations and frozen v62 are unchanged; no merge/deployment.
Recovery, loading/failure/uncertain-name layouts, actual auth, persistence and
physical-device acceptance remain separate. New avatars/photos, awards and
parked Signal work remain held.

## General app shareable link selected and direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Go with the shareable link and
continue with the next mockups." The public shareable link is now selected,
and the supplied invitation card, Account entry and linked fallback direction
are approved in both themes at reviewed commit
`80cd719da27b7da5a768c96f4013cc8f0591cd71`. The earlier link-versus-email question
is resolved. Private-league invitations remain separate and email-bound.

The unseen device-sharing illustration, native sharing/copy integration,
actual delivery, physical-device acceptance and whole-app completion remain
separate. Sign-in, create-account, email confirmation and first-name setup are
next. New avatars/photos and awards remain held.

## General app invitation proposed and mocked — November 6, 2026

Sean requested app-wide invitations while approving the supplied league setup
mockups. The recommended shareable public link is now demonstrated in Account
entry, invitation, app-owned sharing explanation and link fallback views. The
link-versus-specific-email question was asked; no answer has arrived as of
preparation. These mockups show the recommendation as a working assumption,
not an approved product choice. Both themes require fresh visual approval.

Every player would get Account > Invite friends. The public root opens the
existing sign-in/create-account screen. The generic payload has no player,
email, league, token, pick, odds or referral identifier and grants no private
membership. In production, a deliberate share tap would use the device menu;
Copy link/manual selection would provide a fallback. OS destinations are
illustrative, and dismissing a share menu never establishes delivery. No
contacts, automated email/SMS, rewards or attribution are proposed.

Eight phone captures were visually inspected. Checks passed: 32 responsive
layouts, full entry/share/dismiss/fallback/reopen flows in both themes, narrow
share-action reachability, selected-logo loads, keyboard Escape/focus return,
nested information, six prior views, and 14 payload/privacy/isolation assertions.
No share calls, clipboard/storage writes, non-GET requests or page errors were
observed. Build, controller exclusions, Brand QA and syntax/diff checks passed.
The preview selects link text only. The initial invocation-detection check
matched explanatory text; its pattern was narrowed to actual call syntax and
then passed. No UI change was needed for that check correction.

This is a new feature proposal and mockup, not a shipped invite capability.
Native sharing/copy integration, live route and physical-device acceptance
remain open. Existing league behavior, production source/tokens, accounts,
collectors, migrations and frozen v62 are unchanged; no merge or deployment.
New avatars/photos, awards and the three parked Signal files remain held.

## League setup direction approved; general app invites requested — November 6, 2026

Sean confirmed "Looks good in both themes" for the supplied league switcher,
invitation entry and linked creation mockups at reviewed commit
`5b917a92f2dcad726ab152aaa4350364f666d713`, then requested the ability to invite
to Guess the Line generally and continuation of the mockups. This accepts the
supplied visual direction in both themes; unseen link-ready, scrolled/revoked
and pending-check states, actual account/invitation actions, physical-device
acceptance and whole-app completion remain separate.

General app invitation is an additional requested mockup scope, separate from
email-bound private-league access. Sharing a public app link is the recommended
approach; the link-versus-address preference is being clarified one question
at a time before the dependent design. New avatars/photos and awards remain held.

## League setup and invitations mocked — November 6, 2026

The selected dark/Porcelain glass system now covers the Community-first league
switcher, incoming invitation, Duel/Group creation, host invitation entry,
non-operational link and pending/accepted/revoked status cards. Native Sheet,
Row, List, Avatar, Button, Segmented and InfoButton are reused, with native
leagueRows/pendingInvites projection and isolated native email normalization.
Fictional leagues, counts and example.com emails replace all private data.

Preview actions change component memory only. Each league keeps a separate
invitation list, including after creating a new example league. Host controls
exclude Community, member-only groups and the fixed founding roster. Name and
email validation, two-/20-player formats, shared weekly picks, separate rosters
and started-game locks are retained. The pending-check example never repeats
a join. The example.invalid link has no usable token or invented expiry;
Select example link selects text without writing to the clipboard.

Twelve dark/light phone captures were inspected; visual approval is pending.
Checks passed: 24 responsive layouts; six scenario flows covering switching,
joining, creation, link selection, self/duplicate rejection, status retention,
revocation, per-league isolation and check-only pending behavior; 43 pure
checks with native email parity; nine existing cloud lobby tests; keyboard
Escape/opener return, narrow lower-action reachability and nested information
in both themes; and six prior views. No page errors, non-GET requests, storage
or clipboard writes were observed. Build, authenticated controller exclusions,
Brand QA and syntax/diff checks passed. Capture heights are extended to show
content; scroll reachability is checked separately at narrow phone width.

Production source/tokens, real accounts/invitations, collectors, migrations and
frozen v62 are unchanged. No merge or deployment. Actual authorization,
capacity, idempotency, expiry, persistence and live recovery remain separate.
New avatars/photos, awards and parked Signal work remain held.

## Account Settings and Guidance direction approved — November 6, 2026

Sean replied "looks good continue" to the supplied Settings and Guidance/source
mockups in both themes at reviewed commit
`51709782dad3ba7250b474b797a60284ae829bbf`. The supplied direction and linked
source/unavailable/conflict examples are approved. This does not approve unseen
states, live saves, provider availability, rule/content changes, physical-device
behavior or whole-app completion. League switching, creation and invitations
are next. New avatars/photos and awards remain held.

## Account Settings and Guidance mocked — November 6, 2026

The selected dark/Porcelain glass treatment now covers sportsbook preferences,
Home guidance and expandable Guidance/source topics. Native Sheet, Avatar,
Switch, Button and InfoButton are reused. Book cards show a selected count;
supporting topic icons stay neutral until opened. Unchanged example settings
keep Preview disabled. Changes and previewing affect component memory only.

The existing nine-key account sportsbook catalog is retained, separately from
the 33 manual tracking source labels. Standard, retained-unavailable and
conflict-draft scenarios are explicitly fictional; no current provider status,
connection, offer or actual account preference is asserted. Native
preferenceValue/validBooks preserve sorted choices and the inverse Home guide
flag. A retained unavailable option stays visible until explicitly removed.
The conflict example preserves the draft for a separate explicit preview;
no account read, save, retry or tab-draft write is performed.

Guidance retains all 19 topics in native GUIDANCE_ORDER, with all 70 paragraphs
and 13 credit/license links from INFO unchanged. Topics open in place with
readable text and external source buttons. Existing badge/award guidance text
is retained; it does not introduce or approve new award designs or behavior.

Fourteen phone captures were inspected; visual approval is pending. Checks
passed: 16 responsive layouts, six settings scenario flows, all 1,024 book-subset/
guidance combinations and four invalid preference cases; unavailable retention
and conflict-draft preservation. Both themes matched all guidance paragraphs
(140 comparisons), source links (26) and topic order. Native sheet keyboard,
Escape/opener return, narrow source reachability, six prior views and zero
settings storage writes passed. Browser checks recorded no page errors or
non-GET requests. Build, authenticated controller/reader/push/draft-store
exclusions, Brand QA and syntax/diff checks passed. Production source/tokens,
accounts, connections, collectors, migrations and frozen v62 remain unchanged;
no merge or deployment was performed. Actual saving/persistence/fresh-read
conflict handling remains separate. New avatars/photos, awards and parked
Signal work stay held.

[Selection and evidence](../design/style-directions-2026-11-04/selected-system-review.json).

## Historical gap-record direction approved — November 6, 2026

Sean replied "good continue" to the question asking whether the supplied gap
record looked right in both themes. The supplied historical direction is
approved at reviewed commit `5490d6d16a44b5d0f34c58053219dc06a6b785fc`, including
linked outcome, Total-detail and 10%+ examples. This does not establish approval
of unseen states, actual player history, live offers, real-phone behavior or
whole-app completion. Account Settings and Guidance/source cards are next.
New avatars/photos and awards remain held.

## Historical gap record mocked — November 6, 2026

The selected dark/Porcelain system now covers the Your guess vs. market paper
record: hit-rate hero, cumulative paper-unit chart, W/L/P outcome controls,
week/market/10%+ filters, first-six/full gap list, and Spread/Total details.
Each team keeps its own registered glass-logo tile and full name. Detail views
show the historical close, sample guess, favored side and line, native number
axis, gap size, illustrative paper units and recorded final. Opening a detail
retains the chart; Back restores selection, filters, focus and scroll.

Native gapRecord/recommendationMarket, TrendDetail/TrendLine, StatTiles,
numberLine/NumberLine and ordinary UI components are reused. All guesses are the
existing labeled sample guesses from the reviewed Weeks 6–8 score examples.
Closing references and final scores match the same verified public source.
These are historical references, not qualifying three-book consensus,
submission-time references or current quotes. No account/player ballot,
sportsbook identity/price or save/observation time is supplied. Paper units
illustrate the native 1U per graded gap at standard −110; they are not actual
wagers, probabilities or a tested edge. Negative paper totals use the selected
loss color. Filters and detail interactions affect preview memory only.

Ten phone captures were inspected; visual approval is pending. Checks passed:
18 independent week/market/tier views with 210 row/cumulative-point comparisons,
72 full-name favored-side terms, 84 historical line references and 42 finals.
The completed-source SHA-256 matches the reviewed publication. All 26 native
recommended-bet domain tests passed. Browser checks covered eight responsive
layouts, 36 filter states, two complete chart/detail/Back flows, four narrow
market details, 12 detail-logo loads, two source dialogs and six prior views.
Chart selection, expanded list, focus and scroll are preserved; no checked
horizontal overflow or page errors/non-GET requests occurred. Build, reader
exclusions, Brand QA and syntax/diff checks passed. Production source/tokens,
accounts, storage, collectors, migrations and frozen v62 remain unchanged;
no merge or deployment was performed. Unseen live recommendation/Virtual Units
paths remain unreviewed; new avatars/photos, awards and parked Signal work stay
held.

[Selection and evidence](../design/style-directions-2026-11-04/selected-system-review.json).

## Bets result and correction direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
The supplied result reporting and ticket correction/history direction is
approved in dark and Porcelain at reviewed commit
`9478c56246352ffa8388bbbbb65c624562e31fc4`, including linked form, correction
reason, receipt and validation examples. Unseen states, live saves, real-phone
behavior and whole-app completion remain separate. The next visual review is
Your guess vs. market's historical gap record. New avatars/photos and awards
remain held.

## Bets result reporting and corrections mocked — November 6, 2026

The selected dark/Porcelain system now covers the native result form, filled and
invalid-return states, an updated example receipt, open-ticket correction and
before/after history. Native ResultEditor is copied exactly without its account
controller, using the existing preview Modal/banner. The native BetEditor body
is unchanged except its earlier ordinary create-save preview caption; correction
controls, required reason and approved odds/unit steppers remain intact.

The fictional ticket uses a sample 0.5U stake and the already-reviewed public
Week 8 historical closing reference. No new line, sportsbook price, quote or
placement time, account record or outcome verification is asserted. Results are
explicitly player reported. Native pure mutation/revision/accounting helpers
validate returns and corrections in memory only. A 1.25U full return produces
+0.75U net. Inconsistent returns retain the draft and display the existing error;
return-to-pending clears the result. Settled terms cannot be rewritten. An open
stake correction from 0.5U to 0.75U retains the prior version and supplied reason.
The example history shows before/after values and expandable changed fields and
selection text. Internal test-seed/generated recording metadata is omitted from
the visual history; no actual save is claimed.

Twelve dark/Porcelain phone captures were inspected; visual approval is pending.
Checks passed: 16 responsive forms, 10 outcome/theme cases, two invalid-return
and two correction flows, two narrow full-audit and keyboard/Escape cases, and
six prior views. Six valid and six invalid pure return cases, revision/history,
settled-term protection, required reasons and all 21 selected native domain
tests passed. Native body equality, reader exclusions, build, Brand QA and
syntax/diff checks passed. Browser checks recorded no page errors or non-GET
requests. No production source/tokens, accounts, storage, collectors, migrations
or frozen v62 changed; no merge or deployment was performed. New avatars/photos,
awards and parked Signal work remain held. Unseen flows remain unreviewed.

[Selection and evidence](../design/style-directions-2026-11-04/selected-system-review.json).

## My bets Overview direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
The supplied Overview direction is approved in dark and Porcelain at reviewed
commit `fb9ce8186157076db818a81ca8653ed9a4522d86`, including linked matching-ticket,
filter and cash examples. This does not accept unseen states, real account
history/writes, physical-device behavior or whole-app completion. The next visual
review is Bets result reporting, open-ticket corrections and example history.
New avatars/photos and awards remain held.

## My bets performance Overview mocked — November 6, 2026

The selected dark/Porcelain glass treatment now covers My bets Overview, its
chart, result/type/market/source breakdowns, matching tickets, filters and cash
display. Native socialView/trackedOverview projections and TrackedOverview,
NetUnits, TrendDetail/TrendLine, StatTiles and TrackedBetRow are reused. The
chart retains its zero baseline, displayed range and pointer/keyboard selection.
Detailed controls live inside Filters & options so the chart leads. Result,
type and source links open matching tickets; excluded tickets stay available.

The ten-ticket history is explicitly fictional: source names, hypothetical
manual-input prices, reported outcomes, amounts and recording dates are sample
entries, never bookmaker quotes or saved account history. Selection lines reuse
the two reviewed public Week 8 historical closing references. No new quote,
observation/submission time or account record is invented. Nine included tickets
produce five wins, two losses, one push and one open; eight settled tickets risk
5.5U for +2.5U net and 45.5% ROI. One excluded ticket stays visible, and the open
ticket's price remains unknown. The optional example $20/U conversion displays
$50 net without changing unit stakes. All interactions affect fixture memory;
no account or device preference is read or written.

Ten phone captures were inspected; visual approval remains pending. Checks
passed: eight responsive layouts, two full interaction themes, 72 independent
filter/accounting cases, eight cumulative points, two pure date cases and all
21 selected native domain tests. Two narrow themes cover filters, expanded
tickets, six zero/one/invalid-range cases and 56 existing logo loads. Six prior
views still mount. Reader exclusions, build, Brand QA and syntax/diff checks
passed; browser checks recorded no page errors or non-GET requests. Production
source/tokens, collectors, migrations and frozen v62 remain unchanged. No merge
or deployment was performed. Unseen Bets flows remain unreviewed; new
avatars/photos, awards and parked Signal work remain held.

[Selection and evidence](../design/style-directions-2026-11-04/selected-system-review.json).

## Profile and Reminders direction approved — November 6, 2026

Sean confirmed "Looks good in both themes. Continue with the next mockups."
The supplied Profile and Pick reminders direction is approved in dark and
Porcelain at reviewed commit `bd5637779686b624f7c2384e20fe329aafa11f20`, including
the linked Off, blocked and Home Screen examples. This is visual approval of the
supplied direction; unseen recovery/unsupported/unconfigured states, real account
saving, permissions, push delivery and whole-app completion remain separate.
New avatars/photos and awards remain held. My bets Overview is the next review.

## Profile and reminder examples mocked — November 6, 2026

The selected dark/Porcelain glass system now covers Profile and Pick reminders.
Native initials avatars, Sheet, Button, InfoButton and Switch are retained.
Profile shows display-name editing, unchanged/invalid states, an unsaved draft,
conflict and needs-checking examples. Checking unlocks the retained draft for a
separate explicit preview; it never automatically replays a save. Whitespace is
trimmed, names retain the native 1–60-character/control-character rules, and
previewing updates only fixture memory.

Reminders show On/Off, blocked, Home Screen setup, unsupported and unconfigured
examples. Exact native copy/status/switch helpers are isolated from the push
store. The existing two-hours-before-due, device-only wording remains. Turning
off the example retains granted permission. No signed-in identity, permission or
subscription state is read. All identity/device data is explicitly fictional;
no account, storage, permission request, service-worker registration,
subscription or notification is changed.

Twenty dark/Porcelain phone captures were inspected; visual approval is pending.
Checks passed: eight profile layouts, 12 reminder states, two recovery flows,
12 narrow reminder layouts, profile focus trap/Escape/return, four prior views,
nine validation and eight reminder-helper cases. Native copy/helper and avatar
equality, reader exclusions, build, Brand QA and syntax/diff checks passed.
Browser checks recorded zero page errors, non-GET requests, permission requests
or worker registrations. These are local preview checks, not live account or
physical-device acceptance. Production source/tokens, collectors, migrations
and frozen v62 remain unchanged; no merge or deployment was performed. New
avatar/photo options, awards and parked Signal work remain held.

[Selection and evidence](../design/style-directions-2026-11-04/selected-system-review.json).

## EPL draft direction approved — November 6, 2026

Sean replied "Good continue" to the supplied EPL Pick a Team, backup ranking and
confirmation review. The supplied direction, including linked backup, waiting
and closed examples, is approved at reviewed commit
`59a1b55f225122aca9f7e9a1cd2d4a815d821e4e`. This does not accept unseen claim,
failure or deadline-resolution states, live draft writes or whole-project
completion. Profile and reminders are next; new avatar/photo options and awards
remain held. The selection record preserves the supplied capture scope.

## EPL Pick a Team flow mocked — November 6, 2026

The selected dark/Porcelain system now covers Pick a Team, a backup ranking
sheet, manual/team-from-ranking confirmations, and waiting/closed scenarios.
Eight example managers appear in native pick order; pending nodes use a quiet
clock glyph. Each available club has its own glass crest tile and full name.
The first eight cards lead; Show all exposes the 18 initially available clubs.
Play is highlighted within the opened EPL flow.

Managers, picks, rankings, results and draft state are **fictional**. The pool
uses the existing configured 20-club catalog, not a claimed current fixture list.
No live table, bookmaker price, Sleeper/account history or actual kickoff is
invented. An internal fixed year-2000 test clock drives native eligibility only;
it is not displayed as a match or recording time. The 20 registered crests and
source register are unchanged copies of the existing public assets, used for
club identification under their existing trademark notice.

Presentation reuses native DraftBoard/Crest/MarginChart, boardModel/moveClub and
the pure pick-order, turn, eligibility and bonus helpers. The native queue view
is isolated from its API controller, with a Preview caption, a taken-club note
and optional fixture wording. Reorder/add/remove controls remain. The local
ranking example skips taken Chelsea for Liverpool. An empty or taken-only
ranking leaves the manual turn open; waiting managers can rank without being
assigned, and the closed scenario prevents changes. Latest-picker changes and
two tied fictional 3-0 margin bonuses (15 points each) retain existing rules.
All interactions change fixture memory only; no pick, ranking or account claim
is saved, and no new avatar, award or celebration feature is added.

Twelve phone captures were inspected. **EPL draft visual approval remains
pending.** Checks passed: eight responsive layouts, 24 scenario states, two
complete pick/change/queue flows, two narrow sheet/keyboard/waiting/taken-only
cases, 176 crest image loads, 20 byte-identical original crest copies, four prior
view checks and all 11 native draft-domain tests. Independent order/bonus checks,
deterministic preparation, direct confirmation routing, reader exclusions, Brand
QA and syntax/diff checks passed. Browser checks produced no page errors or
non-GET requests. These are local review checks, not hosted or physical-device
acceptance. Production code/tokens, collectors, migrations, frozen v62 and parked
Signal files remain unchanged; no merge or deployment was performed.

[Selection and evidence](../design/style-directions-2026-11-04/selected-system-review.json).

## Bets source choices and tap sizes approved — November 6, 2026

Sean replied "Good next" to the revised source choices and tap-size review.
The supplied 12 upfront/33 searchable manual source choices and plus/minus
controls are approved, with 5 odds points and 0.25U per tap. The [selection
record](../design/style-directions-2026-11-04/selected-system-review.json) preserves the four supplied dark/Porcelain captures and reviewed
commit. This does not establish acceptance of unseen states, real account writes
or whole-project completion. No new sportsbook integration is implied.

EPL Pick a Team, backup ranking and team confirmation are the next visual review.
New avatar and award work remains held; parked Signal files remain untouched.

## Bets source choices and entry steppers revised — November 6, 2026

Sean requested more sportsbooks and plus/minus controls for odds and units.
The preview now puts 12 existing source choices upfront, with the remaining 21
available through the searchable More sportsbooks & sources control. The original
33-label manual catalog is retained; this does not assert new integrations or
current service availability.

Odds and units now have named 48px minus/plus buttons and a live value output.
Presets, Unknown and optional Custom entry remain. A starting preset enables the
buttons; unknown prices never acquire an assumed value. American odds cross
canonical +100 without producing invalid prices between −99 and +99. Unit
adjustments retain native four-decimal precision, cannot reach zero and respect
the existing editor limits. Tapping does not open a typing field automatically.
Single/combined parlay odds and the native one-stake accounting are retained.

The pictured increments, **5 odds points and 0.25U**, are a provisional
recommendation. One direct tap-size question was asked; owner selection and
visual approval remain pending. The adjusted capture demonstrates manual taps
from +100 to +105 and 0.5U to 0.75U; these are sample entry values, not sportsbook
quotes or actual stakes. The underlying example still has no saved price or
quote/placement times. No account, database or preference is written.

Eight dark/Porcelain phone captures were inspected. Checks passed: 28 arithmetic
cases plus odds-domain round trips; eight responsive form layouts with 44px+
targets and no checked overflow; two book-search/parlay/local-receipt flows;
exact 33-label catalog comparison; native editor body preservation (ordinary
Save caption remains Preview); reader exclusions, Brand QA and syntax/diff checks.
Browser checks produced no page errors or non-GET requests. Production app code,
tokens, collectors, frozen v62 and parked Signal files remain unchanged.

[Selection and evidence](../design/style-directions-2026-11-04/selected-system-review.json). Prior Bets captures remain as historical review
evidence; this revision is not an approval, release or physical-device acceptance.

## Bets ticket details and entry mocked — November 6, 2026

The selected glass treatment now covers a settled two-selection receipt, an open
single example, opened receipt context and the Track a bet form in both themes.
Each team has its own glass tile. Full-width selection cards, lime return values
and the approved clear outlined buttons preserve the prior visual selections.

The receipt is **fictional**. Its two selection lines reuse the reviewed public
Week 8 historical closing references; these are not anyone’s placed terms or
current quotes. The sample 0.5U stake and 1.25U player-reported full return give
+0.75U net. Prices, sportsbook and quote/placement times remain unknown. NFL
research cannot supply personal receipt terms, and unknown prices never default
to −110 or an invented return.

The preview uses native TrackedBetRow and the native BetEditor body, exact except
the ordinary Save caption is marked Preview. A local Modal adds the preview
notice, and native matchup choices gain separate logo tiles/full-name options.
Native entry controls, cash conversion and pure domain validation/normalization
are retained. The callback validates ephemeral fixture memory, then discards
generated recording metadata; no account, database, record or preference changes.
No API reader/writer is imported. Existing manual prop entry remains available;
player suggestions and further prop/correction/tail/settlement flows are outside
this supplied review. New avatars and awards stay held.

Twelve phone captures were inspected, including a 1300px extended terms view.
**Ticket/form visual approval remains pending.** Checks passed: eight responsive
layouts and eight form layouts, two advanced entry flows, two cash conversion
flows, 32 logo loads and four prior-view regressions. All 21 selected native
model tests pass. Two historical references and the sample return arithmetic
were independently checked. Native editor-body equality, reader exclusions,
Brand document QA and syntax/diff checks pass. Browser checks produced no page
errors or non-GET requests. These checks do not establish physical-device or
production acceptance.

[Selection and evidence](../design/style-directions-2026-11-04/selected-system-review.json) · [Ticket mockup](../design/style-directions-2026-11-04/selected-system-review.html?screen=Bets&layer=ticket).
Production source/tokens, scoring, collectors, migrations, frozen v62 and parked
Signal files remain unchanged. No merge or deployment was performed.

## League visual direction approved — November 6, 2026

Sean replied "Yes good continue" after the supplied League leaderboard, feed and
comment sheet, with Points/hidden-pick and Porcelain views linked. The supplied
League direction is approved. [Selection record](../design/style-directions-2026-11-04/selected-system-review.json) preserves the exact
reviewed commit and eight supplied captures. This covers the supplied visual
direction, not every unseen market/state, live account behavior or whole-project
completion. Fictional sample activity remains labeled; no post was sent.

Bets ticket details and the Track a bet form are the next visual review.
Avatars, awards and parked Signal branding remain held.

## League leaderboard and feed mocked — November 6, 2026

The selected glass system now covers a League leaderboard, separate Spread,
Total and Points boards, shared tied ranks, pinned viewer row, ranked zero and
unranked new member. The first six plus the viewer lead; Show more exposes all
nine example members. Points keeps its unranked House value separate.

The feed includes individual team-logo tiles, result accuracy bars, folded pick
activity that opens each post, six existing reactions and a native comment sheet.
Comment drafts survive closing and changing views; the sheet retains the native
500-character rule, keyboard focus trap/return and inert background. Reactions
and added comments change preview memory only. Existing initials avatars are
retained; new avatar options and awards remain deferred.

All identities, standings, ranks, posts, reactions, comments and fixed demo times
are **fictional examples**. Spread/Total examples reuse the reviewed public
Weeks 6–8 closing references and fictional guesses; Points/House are demonstration
totals. Hidden-pick embeds contain identifiers and counts only, with no guesses
or scoring references. No account history, private group or authenticated writer
is included. The production API, reveal gates, saved-reference scoring and data
are unchanged.

Twelve dark/Porcelain phone captures were inspected. **League visual approval
remains pending.** Checks passed: 16 independent season arithmetic validations,
eight responsive layouts, 24 board/market cases, two themes of feed/comment
interactions, four narrow feed layouts, four sheet layouts, 24 logo loads and
three prior-view checks. All 26 selected native model tests pass. Native reaction
cap/retention, comment bounds, deterministic preparation, reader exclusions,
Brand document QA and syntax/diff checks pass. Browser checks produced no page
errors or non-GET requests. These are local review checks, not physical-device
acceptance, hosted evidence or whole-app completion.

[Selection and evidence](../design/style-directions-2026-11-04/selected-system-review.json) ·
[League mockup](../design/style-directions-2026-11-04/selected-system-review.html?screen=Play&layer=league).
Parked Signal files and the frozen v62 tracker remain untouched and unpublished.

## Score and history direction approved — November 6, 2026

Sean confirmed "Good" after the weekly score, game accuracy and history mockups,
with Porcelain versions and Total views linked. The supplied score/history
visual direction is approved: separate markets, individual team-logo tiles,
accuracy ring and bars, signed game axis and linked weekly history. The
[selection record](../design/style-directions-2026-11-04/selected-system-review.json) preserves the reviewed commit and captures.

Historical closing references and fictional sample guesses remain labelled
examples. This approval does not establish acceptance of every unseen game,
filter/state, actual saved account history, live sources, production integration
or whole-project completion. No UI, source data or image changes accompany this
approval record.

League’s leaderboard and feed are the recommended next visual review. Deferred
avatars/awards and parked Signal files remain unchanged.

## Play score and history mocked — November 5, 2026

Sean selected the recommendation to continue with labelled historical examples.
The score review now has separate Spread/Total weekly summaries, game cards,
week chips, team AND matchup filters, filtered subtotals, a three-week history
view and opened game accuracy charts in dark/Porcelain. Cards retain individual
team-logo tiles and the selected clear glass, ivory/ink type and lime emphasis.
The first six games lead; Show all exposes each week’s full 14-game example.
History bars share a fixed 0–10 points/game scale and open their week.

Public completed-game records for Weeks 6–8 (42 games, 84 market references)
match the existing November 5 publication’s completed-source SHA-256:
`48fbdd6f9f63ffcc0a0322dd7f5b22fa0faa0303874f21200baebff5d30831df`.
The upstream [nflfastR reference](https://nflverse.r-universe.dev/nflfastR/nflfastR.pdf#page=27)
defines spread_line and total_line as closing lines, with positive spread_line
meaning the home team was favored. The adapter negates that spread for GTL’s
home-referenced sign and uses native appCode for historical team aliases.

Guesses are **fictional samples**, and the resulting example points use the
unchanged accuracy helper (10 minus twice the gap, floored at zero), which agrees
with the SQL scorer. These recorded closing references are not anyone’s saved,
qualifying submission-time reference, current quotes or three-book consensus.
No player accounts, private guesses, rank, quote-observation/save time or book
identity is invented. The production saved-reference scorer is unchanged.

Presentation reuses scoreRows/scoreSummary, heroModel/rowView/gameView,
WeekChips/FilterToggle/Segmented and the native number-line component’s exact
isolated body. Only its supplied labels identify the historical/sample context;
its geometry is retained. The source distinction and recorded final are behind
About this example game. Score accuracy remains separate from the game outcome.

Ten extended-height phone captures were inspected. **Visual approval remains
pending.** They are visual review assets, not physical-device acceptance,
production integration, live account evidence or whole-project completion.

Checks passed: 84 independent reference/arithmetic validations; eight responsive
layouts (320/390/768/1440 × dark/light), 672 displayed score rows, 48 native axis
checks, 24 filter cases and 48 history-bar checks. Four additional narrow-phone
cases covered zero points, opposite favored sides, nonexact marker/gap placement,
44px controls and navigation clearance; 112 registered-logo loads passed. Prior
Points and Fantasy Rankings views mount. Corrected-source runs produced no page
errors or non-GET requests. Deterministic preparation, exact number-line copy,
production-reader exclusions, Brand QA and syntax/diff checks passed.

Production code/tokens, private data, previous source exports, collectors, free
budgets, scoring, migrations, frozen v62, deferred avatars/awards and parked
Signal files are unchanged. No merge or deployment was performed.

## Guess the Points direction approved — November 5, 2026

Sean explicitly confirmed "Approved continue" after the Guess the Points review.
The supplied five-player overview, opened draft, lock-in confirmation and linked
native usage-profile direction are approved in the selected dark/Porcelain
system. The [selection record](../design/style-directions-2026-11-04/selected-system-review.json) binds this approval to the reviewed
commit and captures. The fixed lineup and draft values remain labelled examples.

This is visual acceptance of the supplied direction, not separate acceptance of
all unseen players/states, the unshown preview-confirmed card, actual account
saves, production integration or whole-project completion. No UI, data or image
changes accompany the approval record. Continuing with Play score/history is
authorized; a data-presentation question is pending before those mockups are built.
Deferred avatars/awards and parked Signal files remain unchanged.

## Guess the Points mocked — November 5, 2026

Sean approved moving on to Guess the Points. The selected review now shows a
five-position week overview, opened player draft, lock-in confirmation, usage
profile and in-memory preview-confirmed card in dark and Porcelain. Each team
mark has its own glass tile. Five fixed public NFL players form an explicitly
labelled **example lineup**, not the published Points slate: Josh Allen (QB),
Bijan Robinson (RB), Ja’Marr Chase (WR), Brock Bowers (TE), Justin Jefferson (FLEX).
Prefilled guesses 24/18/22/14/20 are sample user entries only.

The overview’s small charts, recent/season averages, opponent-allowed values and
usage profile use the existing public Week 9 Fantasy snapshot and native player
context/profile helpers. Every example’s kickoff matches the validated public
schedule. Native context-number formatting preserves the same rounded tenths as
the full profile, including Chase’s last-three-calendar-weeks average of 24.2
(two recorded games). Phone-width context charts remain visible. The existing
PointsProfile keeps the House estimate behind its original lock line; a local
demo lock never grants server reveal permissions or fabricates member guesses.

The 0–60 whole-point stepper is copied exactly from the native component, with
±1 taps, held ±5, arrows/Page keys and boundary behavior. Save draft and Confirm
lock-in change memory only. Edits survive overview/profile visits, and a lock in
one slot leaves the others separate. The Points board tile opens GTL’s existing
board in a new tab; this does not claim a new board mockup or live result read.
No account/API/storage/save readers or writers are imported into the preview.

Ten extended-height phone captures are available. **Visual approval remains
pending.** These are presentation captures, not physical-iPhone acceptance,
production integration or whole-project completion.

Checks passed: eight responsive theme/width layouts (320/390/768/1440), 40
independent decimal-weight context/chart comparisons, 48 profile/House-gate
checks, 40 draft/profile/overview preservation cases and eight stepper/confirmation
flows. Four narrow-phone scroll/touch checks verified navigation clearance and
44px minimum control heights; two held-five-point checks passed. Prior Spread
and Fantasy Rankings views still mount. No page errors or non-GET requests were
observed. Native stepper-copy equality, unchanged public snapshot SHA-256,
production-reader exclusions, Brand QA and syntax/diff checks passed.

Production code/tokens, private picks, source exports, collectors, budgets,
scoring, migrations, frozen v62, deferred avatars/awards and parked Signal files
are unchanged. No merge or deployment was performed.

## Play draft and confirmation direction approved — November 5, 2026

Sean confirmed "Good" after the Spread and Total draft mockups and the supplied
Spread lock-in confirmation in dark mode, with Porcelain versions linked. The
reviewed draft/confirmation visual direction is approved: separate team-logo
tiles, editable guess chips and half-point controls, outlined lock action, and a
confirmation that highlights the final choice and separate other market.
The [selection record](../design/style-directions-2026-11-04/selected-system-review.json) preserves the scope and reviewed commit.

This accepts the supplied visual direction, not separate acceptance of unseen
confirmation/receipt variants, late/error/pending states, live saves, production
integration or whole-project completion. The preview remains a no-save demo with
sample user guesses. No UI, source data or image changes accompany this record.

Guess the Points is the recommended next visual review. Its draft/detail flow,
Play score/history and remaining league/detail views still need review. Deferred
avatars/awards and parked Signal files remain unchanged.

## Play draft-entry and lock-in mocked — November 5, 2026

Sean approved proceeding with Play’s draft-entry and lock-in mockups. Spread
and Total now use the existing GuessPicker, Chip, Button, Dialog and InfoButton
components under the selected glass skin. Separate team-logo tiles, the public
Week 9 Cardinals/Seahawks schedule and recorded 3–5 / 4–4 records are retained.
The prefilled −3 Spread and 44.5 Total are explicitly **sample user guesses**,
not sportsbook quotes or any player’s saved picks.

The preview retains favorite/Pick’em selection, half-point steps, More, typed
and keyboard entry. Each market has its own editable state. The confirmation
highlights the chosen guess, finality and the independent other market, with
Keep editing before Confirm lock-in. Confirming changes in-memory demo state
only; the resulting card says Preview confirmed. It does not simulate a saved
server receipt or fabricate revealed book lines, opponents’ picks or scores.
The real app’s fresh-read confirmation and per-game rules remain unchanged.

Ten phone-width captures show Spread/Total drafts, both market confirmations
and the preview-confirmed Spread card in dark and Porcelain themes. Capture
heights are extended for presentation; these are not physical-device checks.
**Visual approval of this Play detail direction remains pending.**

Local checks passed: eight responsive theme/width layouts (320, 390, 768, 1440),
16 market layout states, 16 confirmation dialogs and eight native-picker flows,
including signs, Pick’em zero, half steps, keyboard/typed values, cancel and
independent-market preservation. Eight additional narrow-phone scroll states
confirmed the lock button clears bottom navigation and visible controls retain
44px minimum heights. No page errors or non-GET requests were observed. The
approved Fantasy rankings still mount. The bundle excludes production API,
Supabase and authenticated Fantasy readers. Brand document QA and syntax/diff
checks passed.

Production code/tokens, private picks, public source exports, collectors, budgets,
scoring, migrations and the frozen v62 tracker are unchanged. Avatars/awards and
the parked Signal work remain deferred. No merge or deployment was performed.

## Fantasy ranking/report direction approved — November 5, 2026

Sean confirmed "Good" after the Week 9 ranking and provisional Week 8 report
previews in the selected dark/light themes, with expanded biggest-miss detail
available. The reviewed visual direction is approved, retaining native
calculations, source/provisional status, paired baseline charts and the supplied
team-logo treatment. The
[selection record](../design/style-directions-2026-11-04/selected-system-review.json) preserves the reviewed scope.
This is not separate acceptance of every unseen filter/player/state, current live
feeds, production integration or whole-project completion. No UI, source data or
asset changes accompany this approval record.

Play draft-entry and lock-in screens are the recommended next review. The
existing Play approval covers the reviewed matchup-card logo tiles; its detail
flows remain unapproved. Deferred avatars/awards and parked Signal files stay
unchanged.

## Fantasy rankings and accuracy report mocked — November 5, 2026

Sean instructed continuing with weekly rankings and the accuracy report. The
selected Fantasy review now adds Rankings and Accuracy beside the approved
Players/Compare views. Rankings use the existing buildRankings engine, unchanged:
weekly/rest-of-season totals, displayed-point tie ranks, positional ranks,
eligibility and bye handling. Search, team and strong-trend filters preserve
ranks within the chosen position. Cards show separate registered team-logo tiles,
rank/estimated points, sampled games and native trend signals. Row opening uses
the existing usage profile and restores rank-list focus on Back. Scoring settings
are folded for these new views; existing player/comparison content is retained.

The Week 8 report imports the original FantasyReport/reportModel/summarizeReview.
The published status remains **PROVISIONAL**. PPR/four-point passing TDs grade
301 players: 4.7-point mean absolute error, 4.7 for the season-average baseline
(both rounded), 66% within five points. Missing actual-stat rows are excluded;
65 available-estimate rows without actuals and 36 players without an estimate
are not converted into zero results. Original position rows and biggest misses
remain available. An additional zero-based paired-error chart compares the same
players with a baseline across QB/RB/WR/TE/K. Lower is closer; comparisons use
unrounded errors even where displayed tenths tie. No model-return or betting
claim is made.

[Dark rankings](../design/style-directions-2026-11-04/previews/fantasy-rankings-dark-phone.png),
[light rankings](../design/style-directions-2026-11-04/previews/fantasy-rankings-light-phone.png),
[dark report](../design/style-directions-2026-11-04/previews/fantasy-accuracy-dark-phone.png) and
[light report](../design/style-directions-2026-11-04/previews/fantasy-accuracy-light-phone.png)
were inspected at phone width with extended capture heights. Expanded biggest-
miss detail crops are available in [dark](../design/style-directions-2026-11-04/previews/fantasy-accuracy-misses-dark-phone.png)
and [light](../design/style-directions-2026-11-04/previews/fantasy-accuracy-misses-light-phone.png). Those native rows now
identify teams with individual registered logo tiles; original error values and
ordering are unchanged. **Visual approval
of these new views remains pending.** Captures are not physical-device acceptance
or production integration; the first design project is not declared finished.

The original Week 9 snapshot remains unchanged. The added public Week 8 review
is copied byte-for-byte as fantasy-review.json (293,986 bytes), SHA-256
69d9802563d3a131ead39484368f78cd970a18670e6bf4a43a69880d8db00b9d.
Its referenced historical estimate file, 2026-week-08.93d26154.json, was downloaded
and checked against the review's SHA-256, week and generation time. Every one of
its 366 review estimate objects matches that exact pre-freeze publication; no
estimate was rebuilt from later actuals. Shared index/snapshot/review validators
passed. Attribution, actual-stat source hash, original report status and both
source links remain available in metadata/source information.

Independent stat-weight calculations checked 96 ranking settings/horizon states
and 576 displayed rows, 48 report settings and 240 paired position charts across
eight width/theme layouts. Forty filter cases, pagination, unsupported defensive
scoring, source/exclusion dialogs, profile Back/focus, original Players/Compare
and Teams regressions also passed. No page errors or checked page/card overflow.
Two final source-dialog checks confirmed readable publication/review dates and
the historical estimate link; 12 narrow-phone miss-detail views checked 120 logo
tiles without overflow. Brand QA, syntax, public-export scope and deterministic
preparation passed.
Production code/tokens, collectors, budgets, accounts, scoring, migrations,
frozen v62, deferred avatars/awards and parked Signal files remain unchanged.
No merge or deployment occurred.

## Fantasy usage/comparison direction approved — November 5, 2026

Sean confirmed "Good" after the player-list and comparison previews and the
linked full usage-profile captures in the selected dark/light themes. The
reviewed Fantasy usage/comparison direction is approved, including the selected
glass styling and preservation of observed statistics and original tools. The
[selection record](../design/style-directions-2026-11-04/selected-system-review.json) retains the reviewed scope.
This does not establish separate acceptance of every unseen player/state,
weekly rankings/report cards, current live feeds, production integration or
whole-project completion. No UI, data or asset changes accompany this record.
Fantasy weekly rankings and the accuracy report are the recommended next review.
Deferred avatars/awards and parked Signal files remain unchanged.

## Populated Fantasy usage and comparisons — November 5, 2026

Sean approved preparing the Fantasy mockup with existing usage charts and player
comparisons. The generic Player A/B fixture is replaced with a checksummed
published Week 9 Fantasy snapshot: 525 public NFL athletes, generated November 5
at 18:25 UTC, statistics through Week 8. The PPR observed-production browse has
470 players with recorded points, six fixed named examples initially displayed,
search/position filters and show-more pagination. The order is a demonstration
selection, not a new performance ranking. Team marks keep separate glass tiles.

The mockup imports the original PlayerProfileBody, PlayerCompare and
PlayerToolButtons, plus the shared Fantasy scoring/profile functions. It retains
weekly point bars and usage tables, season/recent averages with game samples,
bye/missing distinctions, labelled public GTL pace estimates and opponent history.
Standard/Half PPR/PPR and four/six-point passing TDs work. Comparison preserves
Season/Last 3/This week, two/three-player selection, search/add/remove and the cap.
Two-player comparisons fit on a phone; three-player data stays in a named local
scroll region. Back keeps the browse state and restores focus. No private Points
ballot, user guesses, current sportsbook line or production context reader is used.

[Dark players](../design/style-directions-2026-11-04/previews/fantasy-players-dark-phone.png),
[light players](../design/style-directions-2026-11-04/previews/fantasy-players-light-phone.png),
[dark comparison](../design/style-directions-2026-11-04/previews/fantasy-compare-dark-phone.png),
[light comparison](../design/style-directions-2026-11-04/previews/fantasy-compare-light-phone.png),
[dark profile](../design/style-directions-2026-11-04/previews/fantasy-profile-dark-phone.png) and
[light profile](../design/style-directions-2026-11-04/previews/fantasy-profile-light-phone.png)
are extended-height phone captures, not physical-device acceptance. **Fantasy
visual approval remains pending.** This pass covers usage/profile/comparison;
weekly rankings/report cards and unseen states are not declared reviewed.

The public index and snapshot pass their existing shared validators. The exact
1,223,180 published snapshot bytes are copied unchanged as fantasy-snapshot.json,
SHA-256 ef4d505200eb2e09ecb6b8635e288a8a6c7449f0c67d23357e3916477eae3339.
Source URLs, licences, dates, original method and input fingerprints are retained.
prepare-populated-fantasy.mjs reproduces that export from the ignored downloaded
index/content-addressed file; its small metadata is populated-fantasy-data.json.
All original Research data and registered logo assets remain unchanged.

Chromium passed eight width/theme layouts, 288 card-point checks against
independent stat-weight calculations, 24 profile views, 72 comparison views,
24 search states, 16 comparison add/remove checks and four phone keyboard-scroll/
three-player-cap checks. Usage chart samples, original profile averages, scoring
and period values, two-player fit, profile focus return and Back/Teams/Games/
Trends regressions were checked. No page errors or checked page/card overflow.
Syntax, public-export scope and Brand QA passed. The publication index was read
once; no collector, provider budget, account state, production code/tokens,
scoring, migration or frozen v62 changes. Avatars/awards and parked Signal files
remain untouched. No merge or deployment occurred.

## Teams layout and Seattle profile approved — November 5, 2026

Sean confirmed "Good" after reviewing the Teams list and Seattle profile in the
selected dark/light themes. The reviewed visual direction is approved: individual
logo tiles, records/recent form, home/road and scoring tiles, the original margin
chart and season log. The
[selection record](../design/style-directions-2026-11-04/selected-system-review.json) preserves that scope and
the phone captures. This does not establish separate acceptance of every unseen
team profile, current live feeds, production integration or whole-project
completion. No UI, source data or asset changes accompany this approval record.
Research / Fantasy is the recommended next review. Deferred avatars/awards and
parked Signal files remain unchanged.

## Populated Teams mockup — November 5, 2026

Sean approved preparing Research / Teams with the selected glass styling and
real records, recent form and game-by-game charts. The opened Teams mockup now
provides all 32 NFL teams, name/code search, separate registered team/opponent
logo tiles, record headlines and last-five result chips. Each row opens the
original TeamView component: home/road records, scoring averages, last-five
blocks, the original MarginChart, chart-linked season-result controls and all
17 season games. Scheduled games retain their actual published kickoff times;
no future result or market is invented. Back preserves the search, list scroll
and focus; the existing team-record information dialog retains its source context.

[Dark Teams](../design/style-directions-2026-11-04/previews/research-teams-dark-phone.png),
[light Teams](../design/style-directions-2026-11-04/previews/research-teams-light-phone.png),
[dark Seattle profile](../design/style-directions-2026-11-04/previews/research-team-profile-dark-phone.png) and
[light Seattle profile](../design/style-directions-2026-11-04/previews/research-team-profile-light-phone.png)
are phone-width extended-height captures of the upper list/profile portions.
All teams and season rows remain reachable. **Teams visual approval is pending**;
these captures are not physical-device acceptance or production integration.

The original shared teamSeason builder uses 121 fingerprint-matched completed
regular-season games plus 151 redacted schedules from the same checksummed
public research snapshot. It produces 32 teams, 544 team-season rows and records
through Week 8 / November 2. Upcoming scores/results remain null. Native TeamMark
URLs resolve to 32 unchanged registered copies in the review's team-logos folder;
all original source records and asset SHA-256 values are retained. No API/auth
reader is imported into the review bundle. Previously approved game, Games and
Trends model fields remain unchanged.

Independent CSV calculations confirmed every team's overall/home/road record
(neutral finals count toward overall only), points scored/allowed and original
logo bytes. Preparation reproduces the same model hash. Chromium passed eight
width/theme layouts, 256 list record/form checks, 32 search states, 76 profiles
(including all 32 in both phone themes), 1,292 season rows, chart/row/keyboard
selection, search/focus return, source dialogs and Back/Trends/Games regressions.
No page errors or checked document/card overflow were found. Captures were
inspected after waiting for native logo decoding. Syntax, public-export scope
and Brand QA passed. Production code/tokens, scoring, collectors, migrations,
private data, frozen v62, deferred avatars/awards and parked Signal files remain
unchanged. No merge or deployment occurred.

## Populated Games layout approved — November 5, 2026

Sean confirmed "Good" after the populated Games list and expanded team-comparison
previews. The reviewed Games visual direction is approved in both selected
themes: separate team-logo tiles, records/form chips, scoring bars and the
original margin/play-stat presentation. The
[selection record](../design/style-directions-2026-11-04/selected-system-review.json) retains the scope and
reviewed phone captures. This records the reviewed list and Jaguars/Ravens
comparison; it does not establish separate acceptance of every unseen matchup
detail, current live feeds, production integration or whole-project completion.
No UI, data or asset changes accompany this approval record. Research / Teams
is the recommended next review. Deferred avatars/awards and parked Signal files
remain unchanged.

## Populated Games preview and Trends approval — November 5, 2026

Sean replied "Good continue" to the populated Trends list and expanded evidence
previews. That reviewed direction is approved at its recorded scope, including
the selected dark/light styling, six example cards, filters and original charts.
It is not blanket approval of all catalogue content or production integration.

The next Research / Games mockup replaces its generic field/paragraph fixture
with all 15 Week 9 matchups from the same hash-verified public publication.
Each of the 30 participating teams has an individual registered logo tile,
record, last-five W/L/T chips and a scoring-average bar. All bars share a zero-
based points/game scale. Day filters retain all 15 games (Thursday 1, Sunday 13,
Monday 1), with scheduled Pacific times explicitly labelled PT. Compare stats
opens the existing team presentation and original interactive MarginChart,
record/scoring averages and observed play metrics; each team's values and
samples remain available. Research links open the matching real GTL route with
its own account/market-access rules, without exporting gated values here.

[Dark Games](../design/style-directions-2026-11-04/previews/research-games-dark-phone.png),
[light Games](../design/style-directions-2026-11-04/previews/research-games-light-phone.png),
[dark comparison](../design/style-directions-2026-11-04/previews/research-games-expanded-dark-phone.png) and
[light comparison](../design/style-directions-2026-11-04/previews/research-games-expanded-light-phone.png)
are phone-width, extended-height captures. The list images show its upper portion;
all games are reachable by scrolling/filtering. They are mockup evidence, not
physical-device acceptance. **Games visual approval remains pending.**

The schedule is taken from the validated, checksummed publication targets.
Only fingerprint-matched completed rows are used from the local schedule CSV;
its later/unplayed rows are not a source for this schedule preview. Records and
statistics are dated through November 2, not presented as current live readings.
An independent CSV calculation confirmed all 30 team records and scoring
averages. All 30 logo copies match registered repository assets. Existing
approved game and Trends model fields are unchanged. No source is replaced
with a made-up line, quote timestamp or current-game prediction.

Chromium passed eight width/theme layouts, 240 displayed team-record checks,
32 day-filter states, 36 expanded games and 72 team views, including every
matchup in both themes at phone width. It checked logo loading, records, form,
scoring averages, scheduled times/route links, chart sample counts, observed
values, keyboard chart selection, Back and approved Trends/game regressions.
No page errors or document/card overflow were found. Brand QA, syntax,
public-export scope and deterministic data-preparation checks passed. Production
code/tokens, collectors, migrations, private data, frozen v62, deferred avatars/
awards and the unpublished parked Signal exploration remain unchanged.

## Populated Research Trends list preview — November 5, 2026

Sean approved moving the populated research approach to Research's Trends list.
The review now reuses GTL's actual TrendRow, TrendDetail and ResearchChart
components, with six fixed examples from the same 750-candidate public research
snapshot used by the approved game view. Cards show real win rates, W-L-P
records, sample sizes and cumulative illustrative-unit sparklines. All/Spread/
Totals and six evidence-period filters work. Each card expands to the original
interactive chart, 25 season comparisons and linked supporting-result tables.
The examples include positive and negative returns; they are category samples,
not ranked recommendations or a complete catalogue implementation.

[Dark list](../design/style-directions-2026-11-04/previews/trends-list-dark-phone.png),
[light list](../design/style-directions-2026-11-04/previews/trends-list-light-phone.png),
[dark expanded card](../design/style-directions-2026-11-04/previews/trends-list-expanded-dark-phone.png) and
[light expanded card](../design/style-directions-2026-11-04/previews/trends-list-expanded-light-phone.png)
provide phone-accessible review captures. Extended capture height shows more
scrollable content; it does not establish physical-device acceptance. The
selection record marks this new list **pending visual approval**. The approved
game direction and previous screen decisions remain recorded at their own scope.

Source preparation validates six publication hashes/shared schemas and the
completed schedule fingerprint. All six candidates' reconstructed full-history
records/illustrative units match the publication. Chromium checked eight
width/theme layouts, 288 displayed source records, 48 expanded charts, 24 market
filter states, season/keyboard/supporting-result linkage, native Back and the
approved game header. No page errors or document/expanded-card overflow was
found in these checks. Original 16px table values and local table scrolling are
retained. Brand QA, syntax and the public-export scope check passed.

Only review assets/records changed. No new authenticated reads, private picks,
upcoming quotes, collector changes, production integration, migration, merge or
deployment occurred. Avatars/awards stay deferred; parked Signal files remain
unpublished. The first design project is not declared complete.

## Populated game-detail direction approved — November 5, 2026

Sean confirmed "Good" after the rebuilt phone previews using existing GTL chart
components and verified public research. The reviewed populated Arizona/Seattle
Trends/Team presentation is approved as the visual/data-depth direction. The
[selection record](../design/style-directions-2026-11-04/selected-system-review.json)
preserves that scope. Existing data and chart capabilities must remain the
redesign baseline; the superseded sparse fixture is not restored. Approval is
not production integration, live quote or physical-device acceptance, or whole-
project completion. No UI changes accompany this record. Research's Trends list
is the recommended next review area. Deferred features and parked Signal files
remain unchanged.


## Populated game research rebuilt from existing app components — November 5, 2026

Sean instructed continuing after challenging the sparse mockup. The active opened
Research game now uses a verified Week 9 Arizona-at-Seattle example from GTL's
published data, replacing the fictional matchup and the disconnected blank-card/
touchdown comparison. Approved visual materials and header geometry are retained.
The prototype imports the actual TrendDetail, ResearchChart and MarginChart React
components. It supports six evidence periods, interactive cumulative curves,
25 season stems with linked tables, team switching, records/scoring averages,
eight-game margin charts and observed play metrics. The existing app game route
is linked for market history, retaining its own access/freshness checks; no private
or gated quote values are exported into public assets.

[Dark trends](../design/style-directions-2026-11-04/previews/populated-game-trends-dark-phone.png),
[light trends](../design/style-directions-2026-11-04/previews/populated-game-trends-light-phone.png),
[dark teams](../design/style-directions-2026-11-04/previews/populated-game-teams-dark-phone.png)
and [light teams](../design/style-directions-2026-11-04/previews/populated-game-teams-light-phone.png)
phone-width captures were inspected. Extended-height captures show scrollable
content for review, not device acceptance. Public-data provenance, exact source
hashes, original-component paths and reproduction commands are in the
[prototype README](../design/style-directions-2026-11-04/README.md).

All six public files passed published SHA-256 and shared schema validation.
The completed schedule fingerprint matches the publication. Reconstructed full
history matches its published record (2,362 games); by-season summaries and team
finals use existing shared calculation functions and verified completed rows.
No historical result is relabeled as a current prediction or profitable lean.
Chromium checked eight theme/width layouts, 48 evidence-period views, 16 team
views, season/keyboard selection, linked evidence tables, eight fresh direct
loads and all 26 paired navigation states. No page errors; syntax, public-export
key checks and Brand QA passed. Production app code/tokens, live data, collectors,
credentials, migrations and parked Signal files are unchanged. Visual approval
remains pending; the first design project is not declared finished.


## Redesign data-content correction and inventory — November 5, 2026

Sean challenged the many no-data mockup states, citing the app's existing rich
charts and research. The [source/data inventory](DESIGN_DATA_INVENTORY_2026_11_05.md)
confirms recorded market movement, book comparisons, historical/season charts,
team statistics, evidence/assessments, player analysis and Fantasy tools. A fresh
public release read verified the November 5 22:43 UTC research build, 750 registered
candidates, matching season-file SHA-256 and shared schema validation. The last
four inspected refresh runs succeeded; November 2 documentation records populated
signed-in research. No fresh authenticated production read was performed today.
The approved visual choices are retained, but sparse research fixture content
must be replaced using the actual populated app components/readers. The mockup's
missing line fixture is not evidence of missing production data. Production,
private data, refreshes and parked Signal files remain unchanged.


## Both game research views mocked — November 5, 2026

Sean chose both line movement and team performance. The approved compact
Research/game header now leads to a glass tabbed research card, replacing the
undefined chart and explanatory placeholder paragraph. Line movement offers
Spread/Total selection and explicitly unavailable history/opening/latest/source
fields: no sportsbook line, trace or timestamp is invented. Team performance
shows a historical 2025 regular-season total-touchdown comparison from
[NFL.com](https://www.nfl.com/stats/team-stats/offense/scoring/2025/reg/all),
with source-linked data in game-research-data.json and individual logo tiles.
[Line dark](../design/style-directions-2026-11-04/previews/game-research-line-dark-phone.png),
[line light](../design/style-directions-2026-11-04/previews/game-research-line-light-phone.png),
[team dark](../design/style-directions-2026-11-04/previews/game-research-team-dark-phone.png)
and [team light](../design/style-directions-2026-11-04/previews/game-research-team-light-phone.png)
phone captures were inspected. The longer capture height presents both layouts;
it is not physical-device acceptance. Chromium checked both views/themes at
320/390/768/1440px, source values, no invented quote fields, tab semantics and
keyboard navigation, market selection, Back returns and six native game actions.
Eight fresh direct loads and all 26 paired states passed without page errors.
JavaScript syntax and Brand document QA passed. Visual approval remains pending.
No production data/behavior, live collection, deferred features or parked Signal
files changed. Historical team comparison is not current-season performance or
verification of the illustrative matchup schedule.


## Compact opened-game header approved — November 5, 2026

Sean answered "Yes" after the compact game-detail phone mockups. The reviewed
Game overview header, individual logo tiles and action placement are approved
in both themes. The [selection record](../design/style-directions-2026-11-04/selected-system-review.json)
preserves that scope. The generic research paragraph and undefined illustrative
chart are still pending; chart purpose needs clarification before a meaningful
research-panel mockup. This is not full detail-screen or whole-project approval.
No UI or production changes accompany this record. Deferred features and parked
Signal files remain unchanged.


## Compact opened-game matchup header prepared — November 5, 2026

Sean replied "Good" to the recommendation to mock a compact matchup header.
The Research/game fixture now combines its title and matchup in one glass
Game overview card, preserving separate 48px tiles for each logo and keeping
names outside. The repeated standalone title is removed; existing actions and
research sit higher. [Dark phone capture](../design/style-directions-2026-11-04/previews/game-detail-compact-dark-phone.png)
and [light phone capture](../design/style-directions-2026-11-04/previews/game-detail-compact-light-phone.png)
were inspected. Chromium checked both themes at 320/390/768/1440px, loaded and
contained individual tiles, heading consolidation, preserved action labels,
nav fit, two Back returns and six Spread/Total/Bets opens. JavaScript syntax and
Brand document QA passed. The generic paragraph and illustrative chart meaning
remain subsequent review items; no data or production behavior changes. Visual
approval is pending, deferred features remain held, and parked Signal files are
untouched and unpublished.


## Opened game screen prepared for phone review — November 5, 2026

Sean authorized reviewing an opened game/detail screen. Current Research/game
[dark](../design/style-directions-2026-11-04/previews/game-detail-review-dark-phone.png)
and [light](../design/style-directions-2026-11-04/previews/game-detail-review-light-phone.png)
phone-width captures were prepared and inspected without changing UI code.
Chromium checked both themes at 320/390/768/1440px, loaded separate team tiles,
Spread/Total/Bets action labels, document overflow, bottom-nav fit and two Back
returns to Research. Captures use extended 1000px presentation height, not
physical-device acceptance. Recommended first change: combine the duplicated
matchup title and team tiles into a compact glass header, bringing actions and
research higher. The generic chart's meaning and example-data labeling remain
subsequent review items. No detail-screen or whole-project acceptance is inferred.
Production, deferred features and parked Signal files remain unchanged.


## Account glossy row icons approved — November 5, 2026

Sean answered "Yes" to the reviewed Profile, Reminders and Community icon
mockups in both themes. The [selection record](../design/style-directions-2026-11-04/selected-system-review.json)
preserves approval of those icons alongside the separately approved Appearance
control. No UI or production changes accompany this record. Main-screen
refinements reviewed in this sequence do not establish approval of all opened
detail views or whole-project completion. Suggested next review: an opened game
screen, with phone-accessible previews. Avatars and popup/award work remain held;
parked Signal files are untouched and unpublished.


## Glossy Account row icons prepared for review — November 5, 2026

Sean authorized matching glossy icons for Profile, Reminders and Community.
The mockup now uses Lucide circle-user-round, bell and users glyphs in the
selected 03 glass finish, replacing the placeholder symbols. Each icon has its
own tile beside the existing label; the original wrapper is transparent to avoid
a second background. [Dark phone capture](../design/style-directions-2026-11-04/previews/account-icons-dark-phone.png)
and [light phone capture](../design/style-directions-2026-11-04/previews/account-icons-light-phone.png)
were inspected. Pinned 0.468.0 SVG sources and existing ISC/MIT notices are
recorded in the asset manifest. Chromium matched all six displayed glyphs to
the registered source geometry; checked four widths, 44px targets, six native
Account opens, six Appearance choice clicks and two keyboard selections, with
no page errors. JavaScript syntax and Brand document QA passed. Avatar placeholder
and approved Appearance styling are preserved; no avatar controls, production
changes or whole-screen approval are inferred. Parked Signal files are unchanged.


## Account Appearance selector visual approved — November 5, 2026

Sean answered "Yes" after the phone-accessible Appearance mockups. The glass
Light/Dark/System choices, preview thumbnails and selected outline are approved
for the reviewed dark/light designs. The [selection record](../design/style-directions-2026-11-04/selected-system-review.json)
preserves this visual scope; paired previews remain fixed and preference
persistence/device-theme behavior are not implemented by this mockup. No UI or
production changes accompany this record. Suggested next review: proper glossy
icons for Profile, Reminders and Community. Avatar and popup/award work remains
held; parked Signal files are untouched and unpublished.


## Account Appearance selector mocked — November 5, 2026

Sean instructed "Go with your rec and mock." The Account Appearance card now
replaces design notes with glass Light/Dark/System choices, small theme previews
and a selected accent outline. [Dark phone capture](../design/style-directions-2026-11-04/previews/account-appearance-dark-phone.png)
and [light phone capture](../design/style-directions-2026-11-04/previews/account-appearance-light-phone.png)
were inspected. The mock demonstrates click/keyboard selection feedback only:
paired preview themes stay fixed, with no stored preference, OS-theme listener
or production changes. Existing AL placeholder and account rows are preserved;
avatar work remains held. Chromium checked both themes at 320/390/768/1440px,
button fit and 44px minimum targets, six choice clicks, two keyboard selections
and six native profile/reminder/community opens; no page errors. Brand document
and JavaScript syntax QA passed. Captures use extended presentation height and
are not physical-device acceptance. Appearance visual approval remains pending;
parked Signal files are untouched and unpublished.


## Account overview prepared for phone review — November 5, 2026

Sean authorized Account review while avatar work remains held. Current
[dark](../design/style-directions-2026-11-04/previews/account-review-dark-phone.png)
and [light](../design/style-directions-2026-11-04/previews/account-review-light-phone.png)
phone-width captures were prepared and inspected without UI changes. Chromium
checked both themes at 320/390/768/1440px for overflow, bottom-nav fit, the three
existing settings rows and the unchanged AL placeholder. Captures use an extended
1100px presentation height, not physical-device acceptance. Recommended first
change: replace Appearance design notes with a Light/Dark/System control using
the selected visual language. Implementation awaits Sean's response; no Account
approval is inferred. Production, deferred avatar/popup/award work and parked
Signal files are unchanged.


## EPL overview crest tiles approved — November 5, 2026

Sean confirmed "Good" after the updated phone-accessible previews. The
individual glass tiles around the four reviewed EPL club crests are approved
in both themes. [Selection record](../design/style-directions-2026-11-04/selected-system-review.json)
preserves that scope; approval does not cover all EPL details or establish
whole-app completion. No UI or production changes accompany this record.
Account is the recommended next main-screen review. Avatars and popup/award
work remain held; parked Signal files remain untouched and unpublished.


## Individual EPL crest tiles prepared for review — November 5, 2026

Sean replied "Good" to the recommendation to apply individual glass tiles to
EPL's four example club crests. Each unchanged crest now has its own responsive
glass tile, up to 52px square, with its club name outside. The shared layout is
transparent. [Dark phone capture](../design/style-directions-2026-11-04/previews/epl-crest-tiles-dark-phone.png)
and [light phone capture](../design/style-directions-2026-11-04/previews/epl-crest-tiles-light-phone.png)
were inspected; paired/gallery captures were refreshed. Chromium verified eight
independent tile backgrounds, loaded marks, image/tile containment and overflow
at 320/390/768/1440px in both themes. Six native Pick a Team/Fantasy/Turn queue
opens passed, with original three-row sample standings preserved. JavaScript
syntax and Brand document QA passed. Phone captures use extended presentation
height and do not establish physical-device acceptance. Visual approval remains
pending; production, deferred features and parked Signal files are unchanged.


## EPL overview prepared for phone review — November 5, 2026

Sean authorized reviewing EPL with previews delivered directly in chat. Current
[dark](../design/style-directions-2026-11-04/previews/epl-review-dark-phone.png)
and [light](../design/style-directions-2026-11-04/previews/epl-review-light-phone.png)
phone-width captures were prepared and inspected without changing UI code.
Chromium checked both themes at 320/390/768/1440px, all eight loaded crest images,
three sample standing rows per theme, document overflow and bottom-nav fit.
No page errors were found. Captures use an extended 1200px presentation height
to show the full overview; they do not establish physical-device acceptance.
Recommended next change: individual glass tiles around the four club crests.
No new EPL approval or whole-app completion is inferred. Production and parked
Signal files are unchanged.


## Bets Recommended logo tiles approved — November 5, 2026

Sean confirmed "Good" after the phone-accessible dark/light previews. The
individual glass tiles for the Recommended matchup logos are approved for the
reviewed card in both themes. [Selection record](../design/style-directions-2026-11-04/selected-system-review.json)
preserves this scope; it does not establish blanket approval of Bets details
or whole-app completion. No UI or production changes accompany this record.
EPL is the recommended next review area, awaiting Sean's direction. Parked
Signal files remain untouched and unpublished.


## Individual logo tiles in Bets Recommended card — November 5, 2026

Sean authorized separate glass backgrounds for each Recommended matchup logo.
The mockup now uses one 64px tile per mark in both themes, with names and at
outside and no shared background. Existing source assets, sample content,
glossy ticket icons and approved 16px Track a bet separation are preserved.
[Dark phone capture](../design/style-directions-2026-11-04/previews/bets-recommended-tiles-dark.png)
and [light phone capture](../design/style-directions-2026-11-04/previews/bets-recommended-tiles-light.png)
show the result at phone width with an extended 930px presentation height, not
physical-device acceptance. Chromium checked separate loaded tiles and bounds at
320/390/768/1440px in both themes, two recommendation opens, four ticket opens,
two tracking opens and the 16px gap at all widths. JavaScript syntax, Brand
document QA and whitespace checks passed. Approval remains pending; production
and parked Signal files are unchanged.


## Bets tracking-button spacing approved — November 5, 2026

Sean confirmed "Good" after the corrected phone previews. The 16px separation
between the two-selection ticket divider and Track a bet button is approved.
The [selection record](../design/style-directions-2026-11-04/selected-system-review.json)
preserves this specific scope; it does not establish blanket Bets or whole-app
acceptance. No UI or production changes accompany this approval record. The
parked Signal files remain untouched and unpublished.


## Track a bet button cleared from ticket divider — November 5, 2026

Sean reported the Track a bet bubble touching/overlapping the divider below the
two-selection ticket in the phone capture. Computed bounds reproduced zero gap
at 320/390/768/1440px in both themes. A scoped 16px top margin on the tracking
button now separates its glass edge and shadow from the last row divider.
The same measurement check passed at all eight theme/width combinations, with
no overflow and preserved 44px targets; four ticket opens and two tracking opens
also passed. Updated dark/light phone captures were inspected. JavaScript syntax,
Brand document QA and whitespace checks passed. This fixes the mockup spacing;
visual approval remains pending. Production and parked Signal files are untouched.


## Bets glossy ticket icons and status badges — November 5, 2026

Sean authorized the Bets mockup and clarified that he is on a phone and cannot
see local files. Present review images directly in chat using phone-accessible
URLs; do not rely on localhost or local-path links for owner review. The Bets
mockup now replaces 01/02 number blocks with the selected glossy ticket glyph
and adds visible Pending/Settled badges using existing sample status. Titles,
receipt/tracker text, sample result and native buttons remain. The
[dark phone capture](../design/style-directions-2026-11-04/previews/bets-ticket-review-dark.png)
and [light phone capture](../design/style-directions-2026-11-04/previews/bets-ticket-review-light.png)
were inspected. Chromium checked both themes at 320/390/768/1440px, badge
contents, icon replacement, row bounds, 44px action targets, four ticket opens
and two tracking opens, with no page errors. JavaScript syntax and Brand document
QA passed. Ticket visual approval is pending. No new wagers, recommendations,
private data or production behavior were introduced. Parked Signal files stay
untouched and unpublished.


## Play matchup logo-tile treatment approved — November 5, 2026

Sean confirmed "Looks good" for the reviewed Play Spread and Total cards in
both themes. The individual logo-tile treatment is approved for those reviewed
placements. [Selection record](../design/style-directions-2026-11-04/selected-system-review.json)
and [reviewed capture](../design/style-directions-2026-11-04/previews/play-separate-logo-tiles.png)
preserve the scope. This approval does not cover every Play detail state or
establish whole-app completion. No UI or production code changes accompany this
record. Bets is the recommended next review area, awaiting Sean's direction.
The parked Signal files remain untouched and unpublished.


## Individual team-logo tiles added to Play — November 5, 2026

Sean authorized carrying the reviewed Home/Research treatment into Play. Each
logo in the Spread and Total sample matchup cards now has its own 42px glass
tile with a 34px mark. Names and the at separator sit outside the tiles; the pair
container is transparent. Draft/To pick status and native card handlers remain.
The [Play viewer](../design/style-directions-2026-11-04/selected-system-review.html?screen=Play)
and [paired capture](../design/style-directions-2026-11-04/previews/play-separate-logo-tiles.png)
are ready for review; visual approval is pending. Startup ordering was corrected
so base content cannot overwrite these enhancements on an initial iframe load.
Chromium checked both themes at 320/390/768/1440px, eight individual tile
backgrounds, asset loads and card bounds, four native Spread/Total opens,
Home/Research preservation, eight fresh direct loads and all 26 paired preview
states. No page errors were found. Captures were inspected; JavaScript syntax
and Brand document QA passed. Production, deferred avatars/awards and the parked
Signal exploration remain unchanged.


## Research logo-tile treatment approved — November 5, 2026

Sean answered yes to the reviewed Research matchup and Games/Teams previews.
The individual glass-tile treatment is approved for those reviewed placements
in both themes. [Selection record](../design/style-directions-2026-11-04/selected-system-review.json)
and [reviewed capture](../design/style-directions-2026-11-04/previews/research-separate-logo-tiles.png)
preserve the scope. This does not establish approval of every Research detail
view or whole-app completion. No UI code or production changes accompany this
approval record. Play is the recommended next review area; its changes await
Sean's direction. Parked Signal files remain untouched and unpublished.


## Separate team-logo tiles carried into Research — November 5, 2026

Sean authorized applying the Home treatment to Research. The
[Research viewer](../design/style-directions-2026-11-04/selected-system-review.html?screen=Research)
now places each logo in its own glass tile in the main matchup and Games/Teams
previews, with matching available detail matchup treatment. Main tiles are 64px;
quick-card tiles are 42px. Names and the at separator stay outside the tiles.
The shared layout container remains transparent, and existing Home choices,
trend charts and fictional usage values are retained. The
[paired capture](../design/style-directions-2026-11-04/previews/research-separate-logo-tiles.png)
was inspected. Chromium verified 12 individual tiles across both themes, loaded
marks and bounds at 320/390/768/1440px, plus ten native game/games/teams/trends/
fantasy opens. JavaScript syntax and Brand document QA passed. This change is
ready for visual review; it does not establish full Research or app acceptance.
Production and the parked Signal exploration are unchanged.


## Separate backgrounds for each Home team logo — November 5, 2026

Sean corrected the paired Home treatment: each logo needs its own background.
The [Home mockup](../design/style-directions-2026-11-04/selected-system-review.html?screen=Home)
now puts each team mark in its own 34x38px glass tile, with the @ outside both
and a fully transparent shared layout container. Each tile has its own border
and shadow in dark and light mode. Names, sample status, selected compact card
and native actions remain intact. [Updated paired capture](../design/style-directions-2026-11-04/previews/home-separate-logo-tiles.png)
was inspected. Chromium verified eight individual tile backgrounds across both
themes, no shared background/shadow, layouts at 320/390/768/1440px, loaded marks
and four game opens. JavaScript syntax and Brand document QA passed. Whole-screen
review remains pending; production and parked Signal files are unchanged.


## Both team marks in Home matchup rows — November 5, 2026

Sean authorized continuing with the recommendation to show both teams in Home
matchup rows. The [selected viewer](../design/style-directions-2026-11-04/selected-system-review.html?screen=Home)
now shows Seahawks/Broncos and Bears/Lions marks in away/home order beside the
existing names and draft/status text. The compact selected action card is retained.
Marks reuse the unchanged registered assets; no new live data or private picks
are added. [Paired dark/light detail capture](../design/style-directions-2026-11-04/previews/home-matchup-logos.png)
shows the proposed treatment. Chromium checked both themes at 320/390/768/1440px,
loaded marks, readable row bounds, 44px actions and four native game opens with no
page errors. Brand document and JavaScript syntax QA passed. No new Home or
whole-app sign-off is inferred. The parked Signal files remain untouched.


## Compact Home action card selected — November 5, 2026

Sean selected the compact version from the Home comparison. The
[selected whole-app viewer](../design/style-directions-2026-11-04/selected-system-review.html?screen=Home)
now uses the shorter "Finish your picks" headline, 60px progress ring and 18px
action-card padding in dark and light Home. Existing colors, materials, G,
button styling, data and native navigation are retained. The
[comparison](../design/style-directions-2026-11-04/home-compact-review.html)
preserves the previous layout beside the selected version. This accepts the
action-card layout only; fresh review of the rest of Home remains pending.
The stopped Signal exploration is untouched and unpublished.


## Compact Home action-card comparison — November 5, 2026

Sean agreed to review a compact Home card beside the existing card. The
[local comparison](../design/style-directions-2026-11-04/home-compact-review.html)
keeps both dark/light themes, selected materials, G, ring data and native button
nodes. The proposal shortens the headline and progress row, saving approximately
108px at 320, 390, 768 and 1440px in both themes. Chromium checked eight layouts,
nav fit, retained 28px card radius, glossy icons and four Continue picks actions;
no page errors were found. [Dark capture](../design/style-directions-2026-11-04/previews/home-compact-dark.png)
and [light capture](../design/style-directions-2026-11-04/previews/home-compact-light.png)
were inspected. This is a proposed comparison, not selection or Home acceptance.
The selected whole-app viewer is unchanged. The stopped Signal branding files
remain preserved and unpublished; no work on that exploration resumed.


## Selected icon finish: 03 Glossy glass — November 4, 2026

Sean accepted the assistant recommendation ("go with your rec"): use **03 Glossy
glass** for icons across the current dark/light mockups. The clear face, glossy
edge and restrained shadow fit the floating glass cards and hybrid G. Keep
functional glyphs readable and inactive navigation neutral so lime emphasis
stays selective. Geometry remains Lucide; notices and team-mark provenance are
retained. [Five-way visual reference](../design/style-directions-2026-11-04/icon-treatment-options.html)
and [paired screen review](../design/style-directions-2026-11-04/selected-system-review.html)
record the choice. Alternatives remain available for comparison. This selects
the icon finish; reopened screens still need fresh review. Production integration,
league-wide mark replacement, avatars and popup/award work retain their existing status.


## Team marks and icon exploration brought into the redesign — November 4, 2026

Sean explicitly authorized moving team/league logos and tab/other icons into the
current visual project. Avatars and popups/awards remain held. The paired viewer
now reuses existing NFL/EPL team marks beside names and offers five original
Lucide-based finish studies: outline, duotone, glossy glass, lime medallion and
inset relief. Home uses an 8/12 sample progress ring; Research uses actual team
marks, an illustrative trend and 8.0/6.5 sample comparison bars instead of repeated
instructions. Existing native buttons and selected theme recipes are retained.
[Five-way comparison](../design/style-directions-2026-11-04/icon-treatment-options.html)
and [paired screens](../design/style-directions-2026-11-04/selected-system-review.html)
are proposals for fresh review. No new screen acceptance, icon selection, league
mark replacement, production implementation or deployment is inferred.


Validation for the visual expansion: Chromium checked six screens at 320, 390,
768 and 1440px (24 layouts), all 26 paired views, all five selectable treatments,
and 16 native Home/Play/Research card clicks. No page errors, broken preview
images, document overflow or clipped bottom navigation were found in those
checks. Brand document QA passed. Extended-height Home/Research/EPL captures
show content for review; they are not device acceptance. The source manifest
records unchanged team-asset hashes and original source records, with bundled
Lucide license notices. New-head CI and visual selection remain pending.

## Mini content previews added for fresh review — November 4, 2026

Sean confirmed useful mini previews. The [paired viewer](../design/style-directions-2026-11-04/selected-system-review.html?screen=Home)
now adds summaries and richer matchup/draft/research content in Home, Play,
Bets and Research. Research's decorative field grid is replaced with full-name
matchup details; the four quick cards show matchup, trend, usage and team
previews. [Sources and evidence](../design/style-directions-2026-11-04/README.md)
record original fictional fixtures, retained native handlers/selected recipes,
26 paired-state regression checks, four responsive widths, eight Research and
two Play pointer flows, refreshed/expanded captures and Brand QA. Fresh review
starts at Home; earlier acknowledgments remain historical, with no current
screen sign-off inferred. Actual team marks/icons/avatars/awards stay held;
production, frozen tracker and selected style recipes are unchanged.

## Earlier screen approvals reopened for closer review — November 4, 2026

Sean said the Research matchup lines and sparse bubbles were unsatisfactory and
that he had not looked closely at the earlier screens. Reopen Home, Play and
Bets overviews in both themes, then revisit Research. The [review manifest](../design/style-directions-2026-11-04/selected-system-review.json)
preserves prior yes acknowledgments as history and records fresh review as
pending. Existing selected style recipes remain the starting point. Useful
miniature content previews versus simple identifiers still require clarification;
no new logo/icon asset work or deferred-phase start is inferred. Metadata scope
and Brand QA passed; visuals, production and whole-project status are unchanged.

## Bets overview accepted in both themes — November 4, 2026

Sean accepted Bets/overview in dark and Porcelain in response to the specific
Bets question. The [review manifest](../design/style-directions-2026-11-04/selected-system-review.json)
records Home, Play and Bets overviews accepted; Research/overview is next.
Other screens/layers, production acceptance and whole-project completion remain
open; deferred work stays held. Metadata/source-reference and Brand QA passed.
Reviewed visuals and production are unchanged.

## Play overview accepted in both themes — November 4, 2026

Sean accepted Play/overview in dark and Porcelain in response to the specific
Play question. The [review manifest](../design/style-directions-2026-11-04/selected-system-review.json)
now records Home and Play overviews accepted, with Bets/overview next. Other
screens/layers, production acceptance and whole-project completion remain open;
deferred work stays held. Metadata/source-reference and Brand QA checks passed.
Reviewed visuals and production are unchanged.

## Home overview accepted in both themes — November 4, 2026

Sean replied "yes good" to the explicit Home-in-both-modes question. The
[review manifest](../design/style-directions-2026-11-04/selected-system-review.json)
records acceptance of Home/overview in dark and Porcelain only. Play/overview
is next. Other primary screens and detail views retain their pending visual
review status; no production/whole-project acceptance or deferred-phase start
is inferred. Metadata/source-reference and Brand QA checks passed. Reviewed
visuals and production are unchanged.

## Dark/light cross-screen review available — November 4, 2026

Sean authorized the next cross-screen review. The [paired viewer](../design/style-directions-2026-11-04/selected-system-review.html)
and [six-screen overview](../design/style-directions-2026-11-04/selected-system-overview.html)
carry selected dark recipes and Porcelain/light adaptations across six existing
primary mockup screens and twenty detail states (26 pairs / 52 themed views).
Local screen/layer notes and export support review; no approval is inferred.
[Evidence and limitations](../design/style-directions-2026-11-04/README.md) record
four widths across six screen pairs, all 26 paired states, matching content and
source recipes, table readability/overflow, notes persistence/export/deep links,
gallery/visual checks and Brand QA. Cross-screen visual sign-off, whole-project
completion and production integration remain pending. Frozen v62, production
code/assets/tokens and deferred avatar/team-logo/icon/award scope are unchanged.

## Light background 02 Porcelain selected — November 4, 2026

Sean selected **02 / Porcelain glass** from the Research comparison, resolving
the light background shortlist. [Exact selection](../design/style-directions-2026-11-04/light-mode-options.json)
and [brand guidance](BRAND_GUIDE.md) record base `#E9ECE8` and its light gradient.
The next design step is cross-screen dark/light review using the selected
backgrounds and the shared light-preview adaptations. Production integration,
whole-project completion and deferred work are not established. Metadata
consistency and Brand QA passed; reviewed visuals and production remain unchanged.

## Research comparison of light shortlist — November 4, 2026

Sean shortlisted 02 / Porcelain, 04 / Pale sage and 05 / Silver mist and agreed
to compare the same denser Research screen. The [three-way board](../design/style-directions-2026-11-04/light-research-comparison.html)
uses identical existing fictional usage values and trend vector, with readable
16px table rows and 13px metadata/chart labels. No final light-mode option is
selected. [Evidence and source recipes](../design/style-directions-2026-11-04/README.md)
record four responsive widths, exact shared content/styles, native table region,
game-details/Back and Home/Research round trips, inspected capture, syntax/local
references/metadata and Brand QA. Production, dark selections and deferred scope
are unchanged.

## Five light-mode options — November 4, 2026

Sean agreed to light-mode comparison next. The [board](../design/style-directions-2026-11-04/light-mode-options.html)
shows Arctic, Porcelain, Warm ivory, Pale sage and Silver mist with floating
glass, selective lime surface accents, readable dark text/green labels and a
proposed deep-green adaptation of the same hybrid G. No light option or adapted
logo is selected. [Evidence and scope](../design/style-directions-2026-11-04/README.md)
record five widths, thirty screen/option combinations, five working Home actions,
matched logo geometry, specified endpoint contrast pairs, dark-preview regression,
inspected capture, syntax/local references/metadata and Brand QA. Production and
deferred scope remain unchanged.

## Logo-lime action/stat emphasis selected — November 4, 2026

Sean confirmed that the refined lime-priority preview looks good. [Exact
selected settings](../design/style-directions-2026-11-04/lime-priority-preview.json)
apply logo lime to action cards and rank/accuracy stats, leave supporting cards
neutral, and retain selected background, ivory text, logo, floating-card geometry
and transparent outlined primary. [Brand guidance](BRAND_GUIDE.md) and owner
preferences record the choice. This supersedes the prior pending-refinement
status; it does not mark the whole project complete or start production/deferred
work. Metadata consistency and Brand QA passed; reviewed visuals are unchanged.

## Selective color refined toward logo lime — November 4, 2026

Sean preferred Selective color, clarified the green should match the brighter
logo lime, and requested emphasis on action cards plus rank/accuracy stats.
The [Home/Play preview](../design/style-directions-2026-11-04/lime-priority-preview.html)
uses exact logo lime for card edges/tints and key figures while supporting cards
remain neutral. Selected background/ivory text/logo/card geometry and the
transparent outlined primary are retained. [Evidence and scope](../design/style-directions-2026-11-04/README.md)
record four widths, twelve screen/frame combinations, exact computed lime,
quiet-card distinction, click route, inspected capture and Brand QA.
The direction/emphasis request is recorded; refined visual sign-off, production
and deferred follow-up remain pending.

## Five richer dark-mode explorations — November 4, 2026

Sean said the design was becoming too grey and accepted five mockups showing
how dark mode could have more character. The [board](../design/style-directions-2026-11-04/dark-character-options.html)
compares forest glass, midnight glass, warm graphite, prism edges and selective
color while retaining selected logo/ivory text and floating-card geometry.
Tints, edge lighting, background undertones and primary-action presence vary;
none is selected. [Evidence and recipes](../design/style-directions-2026-11-04/README.md)
record five responsive widths, thirty screen/direction combinations, all five
Home-to-Play actions, fixed selected settings, inspected capture, syntax/local
references/metadata and Brand QA. Earlier selections remain recorded;
production and deferred scope are unchanged.

## Transparent frosted button with bold green outline — November 4, 2026

Sean chose frosted glass and requested transparent color with a bolder green
outline. The [before/after preview](../design/style-directions-2026-11-04/button-transparent-lime.html)
uses a transparent primary face, full 3px logo-lime outline, ivory label, retained
20px corners and 18px glass blur with his selected floating cards/background/logo.
[Evidence](../design/style-directions-2026-11-04/README.md) records exact computed
styles, four widths, twelve screen/column combinations, keyboard focus and click
route, inspected capture and Brand QA. The 3px revision awaits visual review;
production and deferred scope remain unchanged.

## Five button styles with selected design — November 4, 2026

Sean requested five button styles while preserving his selected dark background,
ivory text, lime logo and floating glass cards. The [comparison](../design/style-directions-2026-11-04/button-style-options.html)
shows classic lime pill, glossy bubble, soft rectangle, lime outline and frosted
glass action buttons. No style is selected. [Evidence and recipes](../design/style-directions-2026-11-04/README.md)
record five responsive widths, thirty screen/style combinations, unchanged
selected recipe/reference, five functioning Home-to-Play actions, keyboard
focus checks, inspected capture, syntax/references/metadata and Brand QA.
Production and deferred scope are unchanged.

## Floating clear glass selected — November 4, 2026

Sean selected **05 / Floating clear glass**. [Selection metadata](../design/style-directions-2026-11-04/glass-card-options.json)
and [brand guidance](BRAND_GUIDE.md) preserve the exact reviewed tint, border,
18px blur, shadow, gloss and 28px corners, including the navigation glass.
The selected charcoal gradient, ivory text and lime hybrid logo are retained.
This resolves the card-finish decision, not whole-project completion or
production integration. The reviewed visuals are unchanged; metadata
consistency and Brand QA passed. Deferred follow-up remains held.

## Next comparison: glass card finish — November 4, 2026

Sean asked to continue after selecting the combined dark direction. The
[five-finish board](../design/style-directions-2026-11-04/glass-card-options.html)
compares the reviewed current glass with bubble, frosted, smoked and floating
clear glass while holding his selected background/text/logo and shared
font/control styling fixed. No finish is selected. [Evidence](../design/style-directions-2026-11-04/README.md)
records five responsive widths, thirty screen/finish combinations, unchanged
reference, exact shared settings, inspected capture, syntax/links/metadata and
Brand QA. Production and the deferred phase are unchanged.

## Combined dark direction selected — November 4, 2026

Sean confirmed the middle combined preview: 02's subtle charcoal gradient plus
04's warm ivory main/secondary text with the selected lime hybrid G. [Selection
metadata](../design/style-directions-2026-11-04/charcoal-ivory-combination.json)
and [brand guidance](BRAND_GUIDE.md) record the exact settings. This resolves the
dark background/depth/text decision and supersedes the earlier review-pending
status; it does not establish whole-app completion, production integration,
light-mode acceptance or a start of deferred avatar/team-logo/icon/award work.
Metadata consistency and Brand QA passed. This update records the decision;
the reviewed visuals and production code/assets/tokens are unchanged.

## Combined gradient/ivory preview — November 4, 2026

Sean shortlisted charcoal studies 02 and 04 and requested a visual preview of
the suggested combination. The [three-way comparison](../design/style-directions-2026-11-04/charcoal-ivory-combination.html)
places 02's gradient with 04's ivory text between the original studies, retaining
the selected lime hybrid logo and shared card/font/control styling. The
combination remains unapproved. [Evidence](../design/style-directions-2026-11-04/README.md)
records four responsive widths, eighteen screen/column combinations, exact
source settings, inspected screenshot and Brand QA. Production and deferred
scope are unchanged.

## Selected dark base: ten depth/text options — November 4, 2026

Sean selected 01 / Obsidian charcoal as the dark-mode base, then requested
solid/gradient/faint-glow comparisons and unique text colors, around ten examples.
The [ten-option board](../design/style-directions-2026-11-04/charcoal-depth-options.html)
isolates depth in 01–03 and explores seven additional text pairs in 04–10, always
with the selected lime hybrid logo and shared material/layout/accent styling.
No depth/text treatment is approved. [Evidence](../design/style-directions-2026-11-04/README.md)
covers five responsive widths, sixty screen/study combinations, earlier-board
regression, inspected captures, specified text/base contrast pairs and Brand QA.
Production tokens/assets/code and deferred follow-up remain unchanged.

## App backgrounds with the selected logo — November 4, 2026

Sean requested a few background options after selecting the lime hybrid logo.
The [five-background board](../design/style-directions-2026-11-04/app-background-options.html)
compares solid charcoal, midnight navy, forest, petrol and plum using the same
selected SVG, neutral glass material, text and control colors. No background
or whole-app palette is approved. [Evidence and exact swatches](../design/style-directions-2026-11-04/README.md)
record five responsive widths, thirty screen/background combinations, selected
logo retention, layout/material checks, visual inspection and Brand QA.
Production code/assets/tokens and the deferred phase are unchanged.

## Selected hybrid logo, option 01 — November 4, 2026

Sean selected **01 / Current lime** on the hybrid logo board after explicitly
clarifying that "original" meant option 01, not the flat app logo. The selected
[vector](../design/style-directions-2026-11-04/logo-hybrid/lime.svg) retains the
Balanced Yardline G with glossy edges, a frosted center and base `#B8F34B`.
The [manifest](../design/style-directions-2026-11-04/logo-hybrid/manifest.json)
records this choice. App palette and whole-project completion remain open;
production integration/release and the deferred phase have not started.
This supersedes the unapproved-hybrid status in the earlier exploration entry.

## Glossy/frosted logo hybrid — November 4, 2026

Sean shortlisted finishes 1 and 2 and requested glossy edges with a frosted
center, preserving the G shape and current color plus additional colors.
The [six-color hybrid board](../design/style-directions-2026-11-04/logo-hybrid.html)
keeps current lime as 01, then explores evergreen, ice blue, amber, violet and
rose using identical native SVG material layers on exact canonical paths.
[Evidence and swatches](../design/style-directions-2026-11-04/README.md) record
four responsive widths, twelve loaded previews, geometry/stroke/mask/base-color
checks, desktop inspection and Brand QA. The hybrid and color are not approved;
production assets and deferred scope remain unchanged.

## Finish before logo color — November 4, 2026

Sean clarified that the flat/2D appearance should change first, then explicitly
requested five finishes including glossy glass with the same G shape and color.
The [five-finish comparison](../design/style-directions-2026-11-04/logo-finish-first.html)
shows glossy glass, frosted glass, polished enamel, brushed metal and satin
ceramic using current lime and exact canonical vector paths. The comparison
supersedes the preceding color-first review sequence. No finish/color is chosen.
[Evidence and source manifest](../design/style-directions-2026-11-04/README.md)
record four responsive widths, ten loaded previews, exact-path/stroke/base-color
checks, visual inspection and Brand QA. Production assets and deferred scope
remain unchanged.

## Logo color before finish — November 4, 2026

Sean found the customizer hard to narrow down and asked to choose logo color
and style first, retaining the current G shape. The [five-color visual
comparison](../design/style-directions-2026-11-04/logo-color-first.html)
shows exact canonical geometry at large/header sizes on identical backgrounds
with a flat finish. Color selection precedes finish exploration; neither is
approved. Layout, computed-color and exact-path checks passed, desktop capture
was inspected, and Brand QA passed. [Scope and swatches](../design/style-directions-2026-11-04/README.md)
record the exploratory exception. Production assets and the deferred phase remain
unchanged.

## Interactive Prism Glass studio — November 4, 2026

Sean requested a mockup with editable colors, gradient on/off and style options.
The [customizer](../design/style-directions-2026-11-04/prism-customizer.html)
provides independent dark/light settings, all 24 palette starts with favorites
first, glass/depth/shape/type controls and six navigable mockup areas. Named
browser-local designs and versioned export/import preserve both modes. From the
new palette round Sean likes only 18 and 24; this does not replace his earlier
12-dark/01-light preference without a further decision.

[Evidence and scope](../design/style-directions-2026-11-04/README.md) record 26
passing targeted Chromium assertions plus gradient restoration, invalid-state
recovery and two deeper-layer retention checks. Desktop/mobile captures were
inspected. Prototype only; approval, production work and the deferred phase
remain pending. Frozen v62 and production tokens are unchanged.

## Preferred anchors, twelve more palettes and optional card tints — November 4, 2026

Sean prefers 12 for dark mode, 01 for light mode and also likes 11 from the
original color board. He clarified "separate colors" as "unique, different,
new", while separately agreeing to see different colors per card. The
[new 13–24 board](../design/style-directions-2026-11-04/prism-new-colors.html)
and [optional comparison](../design/style-directions-2026-11-04/prism-card-color-comparison.html)
retain original numbering and distinguish the two explorations. The
[record](../design/style-directions-2026-11-04/README.md) covers 144 embedded and
288 focused layout checks, preferences and exports. The next phase stays held
under the separate deferred-phase record until Sean confirms current completion.

## Deferred phase after glass/color completion — November 4, 2026

Sean queued avatar/profile-picture controls with preloaded options, team/league
logos replacing visible abbreviations/text, tab/other icon examples and options,
and identification of interactive popups and awards. He explicitly holds this
phase until the current project is 100% finished and requests detailed questions
then. The [deferred phase record](../planning/AFTER_GLASS_COLOR_PROJECT.md)
preserves the scope and sequencing. No work on these items has started.

## Twelve Prism Glass color schemes — November 4, 2026

Sean requested at least ten schemes for the refined Prism material. The
[12-palette board](../design/style-directions-2026-11-04/prism-colors.html)
provides seven light and five dark options across all six mockup areas and
opened layers. [Palette mapping and evidence](../design/style-directions-2026-11-04/README.md)
record 72 embedded and 144 focused layout/token checks, filters, persisted
favorites/notes and exports. All twelve Home previews were inspected; specified
text/base and button-endpoint token pairs meet 4.5:1. This is exploratory palette
review, not final brand selection or a comprehensive accessibility audit.

## Prism Glass refinement across the mockup app — November 4, 2026

Sean chose Prism Glass for the first refinement and requested glossier,
Apple-like cards across the whole app. The [six-screen board](../design/style-directions-2026-11-04/prism-board.html)
and [focused review](../design/style-directions-2026-11-04/prism.html) apply the
shared glass material to Home, Play, Bets, Research, EPL, Account and opened
layers. [Round 2 evidence](../design/style-directions-2026-11-04/README.md)
records 18 targeted layout checks, six embedded views, four layer/state checks,
notes/export verification and inspected captures. This selects a direction for
refinement only; no final brand or production change is approved or deployed.

## Eight new whole-app style mockups — November 4, 2026

Sean selected 25 references and explicitly authorized new palettes and typography
for 5–10 distinct whole-app styles. The [eight-direction review](../design/style-directions-2026-11-04/index.html)
contains 48 new primary concepts across Home, Play, Bets, Research, EPL and Account,
plus representative deeper layers. [Source mapping and evidence](../design/style-directions-2026-11-04/README.md)
link all 25 selected references. These are exploratory coded mockups, not the
earlier existing-screen gallery. No style is selected or implemented in production.
New color/type variables are scoped to the artifact under Sean's explicit request;
current product tokens and the selected Yardline G geometry are preserved.
Targeted local browser layout, navigation, note persistence and export checks pass.

## Style references before new mockups — November 4, 2026

Sean clarified that the 5–10 mockups must represent different styles across the whole app, with glossy glass as one option. He requested **50–100 references first**. The [87-reference visual library](../design/style-references-2026-11-04/index.html) provides 12 search groups, 84 publisher preview links and 3 source-only entries; [all sources](../design/style-references-2026-11-04/REFERENCES.md) remain attributed. These are selection candidates, not newly implemented GTL screens or completed visual audits. Private Twitter bookmarks were not accessed. The earlier 39-pair gallery mostly shows existing screens and is context only; it does not satisfy the new-style request. No new mockups or implementation are approved.

## Owner verification and mockups for every sign-off — November 4, 2026

Sean passed Home readability/scrolling/navigation clearance in the iPhone Home
Screen app, Research Games/detail, and Research Trends/chart. He then directed:
"Assume navigation all passes until I identify an isssue." Broader navigation
is accepted **by owner direction**, not represented as independently tested.

Sean requires mockups for **everything** needing his sign-off. The
[acceptance record](OWNER_ACCEPTANCE_2026_11_04.md) separates performed passes,
that navigation assumption, existing approvals and remaining technical evidence.
The [visual board](../design/owner-review-2026-11-04/index.html) collects 39
Dark/Light screen pairs, reminder states, eight functional check sequences and
X references. Older captures and missing current-state visuals are labelled.
No new design choice is approved by assembling this board. No production
data, migration or deployment was changed; the frozen v62 tracker is preserved.

## D-69 design overhaul, step 3: Research — November 4, 2026

Built on `claude/overhaul-step3-research` from the
[step 3 plan](superpowers/plans/2026-11-04-design-overhaul-step3-research.md), merged as
[#486](https://github.com/seanbalz/guess-the-line/pull/486). Research's landing
is the next-move card ("Open games", with the week meter as its picture, read from the shared `GET /personal`) and four
kit tiles (Games, Trends, Fantasy, Teams). Games are picture rows with full team names. One game opens as a layer at
`#research/games?layer=game&item=<id>`, with paging, the line-movement chart reveal and the Spread, Total and Bets
actions at the end of the layer. Teams is a list of all 32 teams, and one team is a layer. Trends' win rates count up and
its opened chart reveals. The Fantasy report card is tiles and rows, with the Track 1 owner's conditions kept. The kit
gained PictureRow, ChartReveal, LayerPager, KeptParent, useLayerFocus, NextMoveCard and StaleLine. The old game sheet stays
only for the League feed, and the old team sheet only for Play's pick cards. Every choice is a build decision for Sean's
review (D-69 addendum, step 3).
Evidence (local): `node --test` 2931 tests, 2930 pass, 1 fails (`tests/research-intake.test.mjs`, the Windows file-mode
check on untouched code), skipped 0; Vitest 85 files, 889 tests pass; typecheck and build pass; the full browser run
at `423c5c40` 378 passed, skipped 0; after the final review fixes the 17 touched specs passed 159, skipped 0.
Sean said "Deploy when ready" and then "Deploy". The 390 px screenshots went to him before the merge, and two CI font
fixes landed after them.

**Released** November 4, 2026, about 20:31 UTC: Pages `a73e79f7` from `main` at `87372514`, run 41906859675. See the
[release record](RELEASE_2026_11_04_RESEARCH_STEP3.md). Live bytes were checked signed out.
November 4 owner acceptance: Games/detail and Trends/chart readability and Back passed on the iPhone; broader navigation is accepted by owner direction. See the [acceptance record](OWNER_ACCEPTANCE_2026_11_04.md). Fresh signed-in technical readback and unapproved D-69 visual choices remain open.

## D-69 design overhaul, step 2: Home — November 4, 2026

Built on `claude/overhaul-step2-home` from the
[step 2 plan](superpowers/plans/2026-11-04-design-overhaul-step2-home.md), merged as
[#482](https://github.com/seanbalz/guess-the-line/pull/482). Home is layout H1A
(the recommended board, "Tiles, then This week as game tiles"), chosen by the build because Sean's step 2 questions
were not answered before it, with the design audit's C9; both are build decisions for Sean's review. The next-move card
carries the week in its eyebrow, the countdown as its picture and the Spread and Total meters side by side from a
332 px card (C9), so on a 390 px phone. Below it are six kit tiles (Spread rank, Total rank, Who's in, Awards, My bets,
Trends) and This week as up to four game tiles in the picks card's words ("Locked in", "To pick", "Draft", "Closed at
kickoff", "Skipped"). Who's in is a Home layer at `#home?layer=who`. The kit gained `Tile` (B0-1) and the `tiles` and
`landing` skeletons (B0-2). Home plays only Whole week locked and the Pick streak, in place. Badges and awards leave
Home and wait as NEW on the Awards tile. A Community rank move waits on Your score and plays once when its season rank
chip is drawn; Play's Your score tile shows NEW for it. Home now reads `GET /personal`, the shared read Research uses.
Evidence (local): `node --test` 2910 tests, 2909 pass, 1 fails (`tests/research-intake.test.mjs`, the Windows file-mode
check on untouched code), skipped 0; Vitest 79 files, 834 tests pass; typecheck and build pass; the full browser run
365 passed, skipped 0.
After the 390 px captures Sean said "Yes, merge #482", then "Yes, release it".

**Released** November 4, 2026, about 16:35 UTC: Pages `beab6d1b` from `main` at `7bb83a5b`, run 41868177237. See the
[release record](RELEASE_2026_11_04_HOME_STEP2.md). Live bytes were checked signed out.
The signed-in readback is done (hosted logs). An iPhone visit at 17:52 UTC got 200 from Home's `GET /personal` in
1.1 s. All 17 `gtl-api` routes in that visit returned 200, and no CPU or worker-limit message appeared.
November 4 owner acceptance: Home readability, scrolling and bottom-navigation clearance passed in the iPhone Home Screen app. H1A/C9 and the other unapproved build choices still require mockup-based review; see the [acceptance record](OWNER_ACCEPTANCE_2026_11_04.md).

## Design audit quick wins (group A) — November 4, 2026

The design audit found 24 small fixes ready to ship now (group A). Sean said "Yes, build them". They went into three PRs,
each with 320 and 390 px before/after captures in Light and Dark:
- [#479](https://github.com/seanbalz/guess-the-line/pull/479), the shared kit.
- [#480](https://github.com/seanbalz/guess-the-line/pull/480), Research and Menu.
- [#478](https://github.com/seanbalz/guess-the-line/pull/478), Bets and Home.

Every new check fails with its fix reverted, and each batch passed review. Sean then said "Yes, merge and release".

**Released** November 4, 2026, about 09:50 UTC: Pages `010cca04` from `main` at `68019b3e`, run 41810080997. See the
[release record](RELEASE_2026_11_04_QUICK_WINS.md). Live bytes were checked signed out; a signed-in phone check is
still open. The record lists two small leftovers.

## Recommended: your gaps vs. closing lines, D-77 — November 3, 2026

Board item 10. Sean chose "Recommendation card", then "Your gaps' paper record". After calling the first build "boring and
bad", he picked option 1, "Hit rate hero", from five on a private canvas. Bets › Your guess vs. market now opens with one
hero card: the share of your gaps that beat the closing three-book line, the record and units at −110, and a dot per
gap. The fine print and the 10%+ record are behind ⓘ. Rows you can still act on rank first within D-54's order. It is frontend only (`shared/recommended-bets.mjs`,
`web/src/VirtualUnits.jsx`) and reads your own `/lines/read`. Local checks pass: unit tests of the grading, units and
exclusions, and a browser test with four finished games (phone rules and axe in both themes). Sean approved the
[captures](../design/recommended-gap-record-2026-11-03/README.md): "Ok". **Released** November 4, 2026 06:42 UTC
with #474 and #473 (Sean: "Ship all three"): Pages `62e6b278` from `main` at `a10d28e9`, run 41787052379; see the
[release record](RELEASE_2026_11_04_RECOMMENDED_GAP.md).

## D-69 design overhaul, step 1: Play — November 3, 2026

Built on `claude/overhaul-step1-play`, verified at `9ebb2056c2589160b03a4cd2fd3ba254371ca31a`,
[PR #473](https://github.com/seanbalz/guess-the-line/pull/473), merged by Sean as `59a2a2ef`. **Released** November 4,
06:42 UTC, in the frontend from `a10d28e9` (Pages `62e6b278`) on Sean's "Release step 1"; see the
[step 1 release note](RELEASE_2026_11_04_OVERHAUL_STEP1.md). Every Play section is a nesting
card under a "Play" lip, with its own address: the landing's next-ballot card and six tiles (P1B), Your score and its
game layer (P2B), Compare one member at a time (P3B), Guess the Points slot tiles and slot layers (P4A), Badges and
awards grid first (P5A), and League board first with the feed, History and week layers (P6A). Bullseye, Week final,
Whole week locked, Points exact, rank moments and the Pick streak play through the moments engine, never on launch,
NEW on their landing tiles. The old picks fallback (`CommunityHome.jsx` WeekPicks) and League history
(`CommunityHistory.jsx`) are no longer imported. Evidence, from the local runs at that commit or its parent (the only
later change merged two release records from `main`): `node --test` 2877 tests, 2876 pass and 1 fails, skipped 0 (the
one is `tests/research-intake.test.mjs`, a Windows file-mode check that also fails on untouched code here and is
unrelated to step 1; CI runs Linux); Vitest 67 files, 763 tests pass; typecheck and build pass; the 16 step 1 browser
specs, the phone, fixed-bar and scroll sweeps among them, 69 passed, skipped 0, at `9ebb2056`. Axe ran inside those step 1 specs; `npm run test:accessibility` covers the legal links only. The nine
required CI checks run on the PR. A signed-in desktop visit on November 4 returned 200 for every call the released Play
made (see the release note). Not yet: a logged phone visit, a Picks game card (`/personal/read`) in the released Play,
and Sean's iPhone check of Play, which stands in for device acceptance (spec section 10).

## Fantasy weekly estimate switches to usage, D-76 — November 3, 2026

Sean: "Yes, switch to usage" (ask a19, Board item 64).
- **Method:** "GTL usage" 2.0 replaces "GTL statistical pace" 1.1 for QB, RB, WR and TE, with the settings the
  [backtest](FANTASY_BACKTEST_2026_11_03.md) chose on 2024 (half-life 4, K_eff 25, K_td 50). Kickers keep pace 1.1, and
  a skill player whose usage stats are incomplete falls back to pace 1.1 instead of losing his estimate.
- **Screen copy:** "pace" no longer appears in player-facing Fantasy wording. That covers the rankings ⓘ intro and its
  fallback, the report card, the player detail in both apps, the profile's and comparison's "GTL estimate" and
  "Sample", and the unregistered home tile's first sentence. The method description is 120 words.
- **Code:** the usage pieces moved to `shared/fantasy-usage.mjs`, which both the build and the backtest import, so the
  build ships exactly what the backtest graded. Rerunning `node scripts/fantasy-backtest.mjs --seasons 2024,2025` after the
  move gave a `results.json` identical apart from its timestamp.
- **Checks:** a test proves the build's weekly estimate equals `usage()` called directly on the same history, week and
  league rates. Another proves the pace fallback. The nine named Fantasy and Points test files pass with `# skipped 0`,
  and the kicker and fallback mutations are caught.
- **Mockups:** `design/qa/fantasy-usage-2026-11-03/` has 390 px shots in Light and Dark, each with a before pair:
  - the method ⓘ;
  - the player detail ⓘ;
  - the profile's estimate section;
  - the comparison's this-week estimate with its Sample row.

  The home tile is not mounted anywhere (`homeTiles` in `web/src/next/fantasy/index.js` is empty), so it has no shot.
- **Status:**
  - **Approval:** Sean OK'd the mockups ("OK, merge when clear").
  - **Merge:** PR #468 merged as `7a10cbd3` on November 4 after #466.
  - **Screen wording: released.** Sean said "Yes, release it". The frontend went out in check-only 41752810898, readiness 41752864340 (history digest `d40fdad9…08f1`) and deploy 41753107909 from `7a10cbd3`. The session approved both gates after checking each run title. The result is Pages `60fffc36`. A crawl of all 31 served chunks finds the new wording and no "statistical pace", "GTL pace estimate" or "Pace sample".
  - **Numbers: not yet published.** They land with the next Fantasy refresh, which builds snapshots with method 2.0; the first one is still to be read back. Published snapshots, reviews, Points slates and Houses are never recomputed.

## Trends glass tiles (D-75) — November 3, 2026

Sean chose "5 · Top three, rest folded" for the Trends tiles and chart ([D-75](DECISIONS.md),
[spec](superpowers/specs/2026-11-03-trends-glass-tiles-design.md),
[plan](superpowers/plans/2026-11-03-trends-glass-tiles.md)). Built on `claude/trends-glass-tiles`:
- glass tiles with one win rate (W/(W+L), one decimal) and "N games · since YYYY";
- This Week's hero, two tiles and the All trends layer (`weekList=all`);
- a team's two trends and a fold that opens in place, and glass Teams landing tiles;
- one glass chart card for an opened trend, its tier and conditions behind ⓘ.

Local checks pass: 676 component tests, the router, token and trends-view node tests (`# skipped 0`), typecheck,
Brand QA, and 13 cloud-browser cases. Those are next-trends with All trends and the fold, four-tab and phone layout,
with axe at 320 and 390px in Light and Dark. They ran on a private port because 5198 was held by another server.
**Released November 4 (UTC)** after Sean's "Looks good, release": the frontend from `472acf89` as Pages `5fe72e52`
(run 41749126731). All 129 assets matched, and a signed-in readback passed. See the
[release record](RELEASE_2026_11_04_TRENDS_GLASS.md).

## BetRivers backup book, D-74 — November 3, 2026

Sean: "Ship D-74 now". From 18:15 UTC the provider sent no FanDuel prices, so no three-book line could be made. BetRivers
now stands in for a selected book the reply could not quote, in the same two-credit request, and the game sheet says
"Standing in for FanDuel". Local checks pass: a PGlite run of the deployed handler, unit and browser tests (phone rules and
axe in both themes), and six mutation checks. **Applied and deployed November 3–4:** M-39 by Gate M as hosted
`20261103233404`, `gtl-api` v50 (release run 41741408404) and `gtl-odds-refresh` v8 (release run 41744806151), both from
`49f60718`. Not yet seen live: a collection with BetRivers standing in. See the [card](PROPOSAL_2026_11_03_BACKUP_BOOK.md).

## Pick a Team turn queues — November 3, 2026

Sean requested immediate assignment from the highest available saved backup when
the turn begins, confirmed an exhausted ranking waits for a manual pick, and
requested a visible team confirmation. The
[implementation record](EPL_TURN_QUEUES_2026_11_03.md) covers transactional server
advancement, a persistent note and a one-time popup. **Live:** compatible API v49
and Pages `06129739` deployed from `4cf149e7c4361547647db3573651fcd57204e36d`
before M-40 applied as hosted `20261103232119`. The
[release record](RELEASE_2026_11_03_EPL_TURN_QUEUE_M40.md) verifies four function
bodies/grants, active reader capability, 129 served assets and unchanged data
hashes. Local checks pass: 74 focused Node, 87 boundary/migration, 670 component
checks, the M-40 rollback harness and four EPL browser scenarios, plus typecheck,
build/privacy and Brand QA. The apply performed no pick/queue backfill; live
signed-in/phone confirmation acceptance remains separate.

## Reminder worker error answer, gtl-push-reminders v6 — November 3, 2026

The `gtl-ops-alerts` review (item 22) found that `cloud/push-reminders.mjs` returned `finish(...)` inside `try` without
`await`. A refused completion (a finished or reclaimed run, or a database outage) therefore answered a generic 500, not the
mapped 400, 401 or 503. The run state in SQL was already right. PR #450 (merged as `067ce119`) awaits both finish paths, and a
test written first failed before the fix and passes after it (39 reminder tests, `# skipped 0`).

Released at Sean's word in the operating session ("you have full approval and permission"). The session approved both
production gates after checking each run title:
- check-only 41719765821;
- readiness 41719845465, history digest `4345486d…4066`;
- deploy 41720249887, release card on PR #450.

`gtl-push-reminders` is **v6**, ACTIVE, `verify_jwt` false, bundle SHA-256 `460389e9…952b`. Nothing else was deployed. Signed
out, the live worker refuses calls with no token or a wrong one (401). Nothing players see changed.

## Signed-in production readback — November 3, 2026

On Sean's request, a read-only check ran in the Mac mini's Chrome, signed in as the commissioner, against the
frontend at `134f17c8`. Passed:
- Home and Play › Your guesses (D-70: 15 tiles, 71 words);
- My bets (D-72: Roomy previews, 32px gaps);
- the Virtual Units placing screen (D-67);
- Research Games, Trends and Fantasy;
- Odds connection;
- the step 0 tab fade.

**Defect:** a cold load of Bets › Research recommendations (D-73) can fail with "Research is unavailable right
now". `POST /lines/assessments` logged 546 "CPU Time exceeded" at 20:53:58 UTC. Warm loads return 200. The fix,
PR #453, is **deployed** as `gtl-api` v48 (November 3, 22:04 UTC, release run 41726861800). The first signed-in cold load
on v48 returned 200, with no 546 or "CPU Time exceeded"; see the
[release record](RELEASE_2026_11_03_ASSESSMENTS_CPU.md).

Not checked: the 320/390px phone widths and a real iPhone. See the
[readback record](READBACK_2026_11_03_SIGNED_IN.md).

## Supabase job alerts by phone push, M-38 — November 3, 2026

Item 22, second half. A pg_cron row says `succeeded` when the dispatcher ran, not when the work happened (Points
logged `nothing_due` six times while Week 9 had no slate). M-38 (`20261103190000`) reads each job family's own run table
and the weekly outcomes, keeps each problem as an incident, and the new `gtl-ops-alerts` worker pushes one alert per
change to Sean's phone. The `ops-alerts` release target, `supabase/admin/ops_alerts_cron.sql` (row disabled first, with
a findings read-back before the enable) and `ops_alerts_test.sql` are written. Local checks, executed on branch
`claude/ops-watchdog`: the M-38 PGlite suite (boundaries, no duplicate pushes, re-alert after recovery, privacy), the
worker suite with an end-to-end run, the release-target contract and migration/rollback registry tests, with
`# skipped 0`. M-38 is **applied and verified** as hosted `20261103184656` (Sean's "apply M-38", SQL editor, November 3): 7 functions with the reviewed grants, 3 empty RLS tables, history unchanged before it. `gtl-ops-alerts` is **deployed** as v1 (deploy run 41699378146, Sean approved both gates), and the schedule is **enabled**
since 20:20 UTC November 3: the findings were empty, and the test alert and its clear each pushed once (sent 1, failed 0). See the [release card](RELEASE_2026_11_03_OPS_ALERTS_M38.md).

## No refresh while a selected book is missing — November 3, 2026

Sean: "do not waste credits. correct this asap". The 18:15 UTC scheduled run's reply had no FanDuel prices for any of the
15 games. A saved line needs all three books, so after D-71 each lock-in refresh would have spent two credits for
nothing. `gtl-api` now skips the collection when the newest stored snapshot of the week has a selected book missing for
every game the save needs. The save still goes through (D-27), and the scheduled runs keep checking. No collection ran
between 18:16 UTC and the deploy of D-71. Local checks pass:
- all 2,751 node tests, apart from one research-intake check that is Windows-only (POSIX file modes);
- a PGlite run of the deployed handler;
- two mutation checks.

**Deployed** November 3, 19:36 UTC as `gtl-api` v47 from `2c0c18b7` (release run 41704220392). See the [release card](RELEASE_2026_11_03_BOOK_OUTAGE.md).

## Lock-in refresh, D-71 — November 3, 2026

Sean chose "Refresh on lock-in" ([D-71](DECISIONS.md)). Since redesign stage 18 a per-game lock-in skipped the D-17
refresh. The new app saves by lock-in, so lines saved with guesses had a median age of 6.9 hours in Week 8, against 68
seconds in Week 7. `gtl-api` now sends lock-ins through the same refresh; the hosted SQL already accepted them (M-07).
Local checks pass, including a PGlite run of the deployed handler and mutation checks. **Deployed** November 3, 18:47 UTC:
`gtl-api` v46 from `ff7b27f5` (release run 41696516851); see the [release card](RELEASE_2026_11_03_LOCKIN_REFRESH.md).

## Odds refresh fixes, M-37 — November 3, 2026

Board item 40. A read-only hosted readback found most "partial" odds runs were only the label: the provider stops
listing a game once it kicks off. Two real faults remain. A preflight race skipped October 29's 06:15 UTC run as
`budget_guard` with 400 credits left. Week 8 CHI-SEA never matched at any book, and nothing recorded why. M-37
(`20261103170000`) preflights after 23 hours instead of 24 and counts partial only against unstarted games. The provider now
records what it listed for a mismatched game. Local checks pass, including PGlite runs of the deployed worker and
mutation checks. M-37 is **applied and verified** as hosted `20261103164210`. On Sean's "merge and apply" it went in
through his SQL editor; both bodies, permissions and the earlier history rows were checked, and the score hash is unchanged.
The provider change is **deployed**: `gtl-api` v48 (run 41726861800), then `gtl-odds-refresh` v7 through the new
`odds-refresh` release target (run 41735886452 from `4cf149e7`, Sean's "Yes, release it"; no Mac mini). The first
scheduled run on v7 (06:15 UTC, November 4) is still to be read back. See the [release card](RELEASE_2026_11_03_ODDS_REFRESH_M37.md).

## Ops alerts for the data refreshes (item 22) — November 3, 2026

On November 3 the Fantasy refresh failed on every run from Monday night (PT)
until about 3:00 AM PT on Tuesday, and nothing reported it; Points Week 9 opened about
three and a half hours late. The new `Ops alerts` workflow starts whenever the Fantasy or Research data
refresh completes on main. A failure opens one issue per workflow, labelled
`ops-alert` and assigned to Sean, so GitHub notifies his phone and email; later
failures only update that issue, and the next run that publishes comments and
closes it. A dry run or a skipped publish never closes an alert. The repository
is public, so an alert holds only the workflow name, run link, event, failed
step and times, never log text.
Local checks: 17 Node tests (alert decisions, GitHub calls, the workflow's
triggers, permissions and step names), each mutation of the publish, staleness
and count rules failing its test, and read-only dry runs against today's real
runs. PR #433 merged as `ed92ec9e`. Live check on November 3: replaying the
10:14 UTC failed run opened issue #435 (assigned to Sean, labelled), and a real
delayed scheduled refresh, run 41672840130, published at 16:19 UTC; its own
workflow_run alert closed #435. A manual replay of the 11:02 UTC recovery ran at
the same moment in a different concurrency group and also closed it, leaving two
"Recovered" comments, so the follow-up removes the manual trigger: every alert
run for a workflow now shares one group. Supabase cron jobs are not covered
yet: their failures and missed outcomes need a server-side check.

## Tracked bets Overview — November 2, 2026

The [Overview follow-up](TRACKED_BETS_OVERVIEW_2026_11_02.md) restores a first-class
chart destination beside Tickets, with performance, outcome, type, market and
sportsbook breakdowns, shared filters and optional cash display. Accounting uses
the existing core; this frontend change does not alter saved tickets or guesses.
Local checks pass: 43 focused Node tests, 650 component tests and 16 tracked-bet
browser scenarios, plus typecheck, build, bundle privacy scan and Brand QA.
PR #420 is merged and [deployed November 3](RELEASE_2026_11_03_TRACKED_BETS_OVERVIEW.md)
from `c6d6434` in protected run 41596638055. Independent readback matched all 129
served files and found Overview in the live bundle. API v45, all hosted function
summaries and migration history stayed unchanged. Signed-in production and
physical-phone acceptance remain separate evidence states.

## Sleeper owns FEPL bonus accounting — November 2, 2026

Sean confirmed he adds the bonuses in Sleeper. The source fix uses finalized
Sleeper weekly/season totals directly for draft order, standings and season
tie-breaks; no second GTL bonus is added. Settlement retains earned margins
with zero additional GTL points, and the API still shows the earned bonus from
that margin. Updated screen copy explains where bonuses are applied. The
pending M-35 correction function follows the same rule; fresh read-only hosted
evidence confirms M-35 and its correction function are still absent, so its
existing unapplied source was updated without applying SQL.

The earlier MW10 data repair remains intact; this change does not rewrite
picks, snapshots, cron or Sleeper data. Add bonuses before the final weekly
capture. Later manual adjustments require order review with pick preservation;
automatic recognition of commissioner completion is unavailable. Source checks
passed: 405 EPL Node/SQL tests (no skips), 89 EPL component tests, typecheck,
cloud build, bundle privacy scan and Brand QA. All four browser scenarios
passed, including 320/390/1440px and both themes. Release status and real-phone
limits are recorded in [the delivery card](EPL_BONUS_ACCOUNTING_2026_11_02.md).
API, frontend and EPL worker publication remains with the release captain.

## EPL Week 9 results and weekly automation — November 2, 2026

Owner: Sean Balsiger · Verified hosted data maintenance; no source deployment.
Sean subsequently confirmed that the supplied Sleeper scores already include
the bonuses. The initial settlement added them a second time; the live correction
at `2026-11-02T23:48:45Z` is authoritative. MW10 was still open with zero picks
and queues. Under the week-row lock, its order was recomputed from the saved
weekly deltas alone, with raw Sleeper season totals breaking ties. The three
duplicate GTL additions are now zero; the bonus rows/margins remain, and their
previous values and both orders are retained in the original settlement run's
private `detail.commissionerBonusCorrection` audit. All picks and snapshots were
hash-verified unchanged. The first-kickoff deadline is unchanged.

The existing automation assumes bonuses are absent from Sleeper and adds them
in GTL. That assumption is wrong for MW9; automatic bonus-accounting support
needs its own source fix and release before it can be claimed correct for
future commissioner-adjusted weeks. No bonus-inclusion detection is connected.

The supplied FEPL screenshot agrees with all eight weekly points-for and
points-against deltas from the stored `after-mw08` baseline to a fresh public
Sleeper capture at `2026-11-02T23:28:21Z` (season 2026, state week 10). The six
responses retain their raw-body SHA-256 provenance; only the existing trimmed
form was saved through `gtl_epl_save_snapshot` as `after-mw9`. Raw captures and
individual player data remain outside this public repository.

An ordinary `gtl_epl_dispatch_jobs('settle')` run
`13cbd5e0-7c97-4709-93a9-080c8a64ab16` collected the tenth final fixture and
correctly stopped at `snapshot_pending` before the import. All ten fixtures are
now final. The existing eight picks retain digest
`f6d56eb4181d8d0430b7b4f4af97335e`; all seven earlier snapshots retain digest
`0deee1439cb6851753964334187bb079` (MD5 of ordered complete row JSON).

Live schedule/cron readback confirms seven enabled jobs. Snapshots run every
15 minutes; settlement runs at 09:41 and 21:41 UTC; fixture collection at
05:47 and 17:47 UTC; draft deadline resolution every five minutes. Reuse these
jobs rather than adding a duplicate ChatGPT automation. M-33/M-35 correction
and verified capture-interval RPCs are still absent: the current worker reports
those optional capabilities unavailable and uses its legacy window-end path.
This maintenance does not apply migrations, change cron, or establish future
Tuesday correction/full-cycle acceptance.

Settlement run `8b87b1b7-0ff9-4700-8427-fd3e08d432ed` succeeded after the import:
three tied winning-margin additions were initially written and MW10 opened
using the existing scoring/order functions. Those additions duplicated points
already in Sleeper and were corrected as described above. MW9 is settled; its
eight picks retain the same digest. The final draft order uses the supplied
scores as shown and the season-total tie-break. Individual scores/picks were
verified privately, not committed here.

Fixture run `36d05e98-a65c-42eb-a07c-2b004d270a7d` then succeeded: ten MW10
fixtures and twenty median h2h prices were stored, no unknown clubs, 485 free
credits remaining. The real first kickoff moved the draft deadline to
`2026-11-06T20:00:00Z` (November 6, noon Pacific). All earlier snapshots still
match their preservation digest. MW10 is open with a usable fixture slate.

Local verification: all 53 existing Sleeper math/job tests and the document
brand check passed. Hosted readback confirmed the imported label/state and
unchanged preservation digests; browser/phone acceptance remains separate.

## My bets spacing and entry follow-up — November 2, 2026

Sean's screenshot reproduced a legacy CSS override that removed the card gap.
The [follow-up record](RELEASE_2026_11_02_MY_BETS.md) covers the actual 32px
separation, searchable manual sources/matchups, same-week player suggestions and
clearer Monday pending-answer refresh. Local checks pass: 31 focused Node, 621
component and 27 browser scenarios, typecheck, build, privacy scan and brand QA.
PR #408 is merged as `e02fed3b2e3cd9acf5bc63b4ecda1d0c3bcf5356` after all twelve PR checks.
Its interrupted exact-main browser checks recovered in attempt 3, then source
check 41543354162 passed. An external controller deployed the newer combined
`e7a38c6e9017a9c49cdf2a526482c05f8219f29f` in protected run 41542487945; this
lane did not deploy or approve it and did not overwrite it with e02. All seven
#408 runtime files are identical. Independent readback matched all 127 served
files, and protected-data aggregates stayed unchanged before/after deployment
and browser QA. Actual signed-in checks verify 32px gaps across populated tickets
at 320/390px in Light/Dark, expansion/reload, search/Enter, roster/manual entry,
prop resets and a read refresh of 15 already-available locked receipts. Only the
unsaved QA draft was discarded; original settings/filter/viewport were restored.
Approximate completion is **90–95%**: physical iPhone acceptance is pending the
OS-required phone lock. Research acceptance follows the verified stable release;
#388 remains open for its physical matrix. Points retains D-61's Tuesday opening
and fresh-snapshot prerequisites; no existing locked guess was reset.

Owner: Sean Balsiger · Reconciled October 29, 2026 · Release status checked November 3, 2026

**November 3 truth pass.** Every merge recorded below as "not released", "not deployed" or "draft" was checked against
the protected release runs. The entries now name the first frontend release that carried each one. Production is the
frontend from `134f17c8` (Pages `489e8b38`). The entries above this note are newer and kept their own wording.

The current task list is [the sequential platform queue](../planning/PLATFORM_WORK_QUEUE.md).
Sean approved finishing the existing redesign and optimizations before expanding
scope. The approved direction remains Home / Play / Bets / Research, “One thing
first,” with D-55 Round 3 charts. No new design selection is required for this work.
The frozen v62 tracker is unchanged. The previous, cumulative register is retained
as a [dated archive](COMPLETION_REGISTER_ARCHIVE_2026_10_26.md).

## D-69 design overhaul, step 0: the shared kit — November 2, 2026

PR #428 merged as `975744c5`. **Released November 3** in the frontend from `134f17c8` (Pages `489e8b38`, run
41660239622); the [release record](RELEASE_2026_11_03_OVERHAUL_STEP0.md) has the evidence and what is not verified.
Step 0 adds the
kit the page-by-page steps build on: the moments engine (`web/src/next/moments`:
the Q3 sizes, a per-account seen record of ids only, nothing played on page
load or on the launch screen, results from while you were away marked NEW and
played when their card opens, several big moments as one `ov.flash` card,
small ones 240 ms apart), with badges and awards moved onto it (awards per league
and season); `ui/CountUp.jsx`, counting from the last value shown; nesting-card
entrances (`ui/Nest.jsx`) and the 160 ms tab fade, with the bars never moving;
`tap` and `win` vibration that reduced motion stops; `ui/Skeleton.jsx`
placeholders in place of the "Loading" text; and the brand guide's moments
and nesting rules. Follow-ups: reset `usePopped` before step 1; the tab fade
stays on once it starts; a tab change into a Nest moves twice; and the old app's
AuthGate spinner.

## Play › Your guesses nesting cards (D-70) — November 2, 2026

Sean asked for the next design pass, to cut text on Home and Play. On the live app Home (139 words) and the Play
landing (59) were already lean. Your guesses was the long screen: 15 stacked 525px cards, 9,043px, 1,317 words
and 252 buttons on the open Total ballot. From five options on the
[comparison canvas](https://claude.ai/artifact/5Kj42mrQJZ2UJGqsxm4nSn) he chose **1 · Nesting cards** and approved the
[design spec](superpowers/specs/2026-11-02-play-picks-nesting-cards-design.md).

- **Built in PR #418.**
  - **The week:** one card, with one tile per game showing your own guess only.
  - **One game:** a tile opens that game's card, with a lip back to the week. It holds the picker and Lock in, or the
    receipt and the reveal, then Next.
  - **Navigation:** a game has its own address, and Next replaces the open game in both the trail and the browser
    history. Moving between the week and its games never asks to leave an unsaved draft; leaving Your guesses still
    does.
  - **Recovery:** checking and retrying an unconfirmed save is reachable from either card.
- **Evidence (local).**
  - **Unit and navigation:** 12 component tests and 17 router tests.
  - **Cloud browser:** the per-game scoring, moments, Lines game actions and new `next-play-nest` cases pass against
    the real handler on PGlite. They cover 390px and 320px, Dark and Light, axe, 44px targets and no sideways scroll.
- **Released.** PR #418 merged as `ffaefd64`, released November 3 at 00:47 UTC from that commit as Pages `53d2991a`
  ([release record](RELEASE_2026_11_02_PLAY_NEST.md), card #426).
  - **Signed-in readback:** Total Week 9 is 15 tiles in 68 words on 1,338 px, down from 1,317 words on 9,043 px. A
    game card and browser Back work. Preservation matched before and after the deploy.
- **Not done:** no real-iPhone check yet. The other Play screens (League, Your weekly score, Badges, Guess the Points)
  are not in this pass.

## Pick reminders follow-ups from the #411 review — November 2, 2026

Menu › Pick reminders now shows in EPL as well as NFL: the EPL frame takes the
push guard (`pushConfigured`) from the same Community read its Menu already
opens for commissioner access, and the row opens the same per-device switch.
Tapping a Points reminder (tag `gtl-points-…`) opens Play › Points
(`/#play/points`); every other tag still opens `/#picks`. `web/public/sw.js`
maps only the fixed tag prefix to one of these two addresses, so the payload
still cannot choose a URL. Node tests run the worker itself (points, other,
missing and look-alike tags; payload `url`/`data` ignored; focus an open
window, else open one); a 390 px browser check covers the EPL Menu row. Phone
captures of the Menu in EPL and NFL, Light and Dark, are in
[design/qa/reminder-followups-2026-11-02](../design/qa/reminder-followups-2026-11-02/).
Frontend only; released November 2 in Pages `8c9b193e` from `82f1c2b`
([release record](RELEASE_2026_11_02_POINTS_CONTEXT.md), card #422). A tap on a real phone is not verified.

## Player context on the Points ballot (Board i63) — November 2, 2026

Each Points slot showed only the player, matchup and kickoff. A slot's sheet
now has a player context card from the week's public Fantasy Track 1 snapshot
(signed-in `/fantasy/week`, committed copy as fallback): last-3 and season Full
PPR averages with game counts, the opponent and what it allows to the position,
and the game or practice report with the snapshot time; missing values are "—".
"Open profile" shows the existing Fantasy profile as the sheet's sub-view, its
code loaded on that tap (the player tools' styles now have their own
`fantasyTools.css`, so `FantasyScreen` keeps its own lazy chunk). GTL's
weekly estimate is the House, so the strip never shows it and the profile keeps
it (and the rest-of-season estimate) behind a lock line until the read carries
the House (lock-in or kickoff, D-56). No implied team totals (D-57). The ballot
is keyed by account. Also fixed: the slot sheet's glow card shrank under later
cards once the sheet overflowed, and the profile's sideways-scrolling tables are
now focusable regions. Frontend only; released November 2 in Pages `8c9b193e` from
`82f1c2b` ([release record](RELEASE_2026_11_02_POINTS_CONTEXT.md), card #422) after Sean OK'd the mockups.

## Pick reminders opt-in in the new app (Board i39) — November 2, 2026

Verified November 2: 0 push subscriptions and 0 reminders ever sent, although
`gtl-push-reminders` v5 (Spread/Total and Points) runs every 15 minutes; the
opt-in lived only in the retired old app. The new app now has Menu › Pick
reminders (one switch per device: on, off, blocked, unsupported, or an iPhone
Safari tab's one-line "add to Home Screen first") and a one-time prompt under
Play's Points card, remembered per account on the device. Both reuse
`web/src/webPush.js` and the existing `/push/*` routes, ask for permission only
on a tap and show only while `pushConfigured` is true. Frontend only; no route,
migration or Edge Function changed. Released November 2 in Pages `6c458d6d` from
`e7a38c6` ([release record](RELEASE_2026_11_02_REMINDERS.md), card #414); the release
owner saw the prompt and Menu row live, signed in, and reported 0 subscriptions
at that observation. This acceptance lane did not opt in or change notification
permission. Delivery to a real iPhone from the Home Screen app is not verified.

## My bets Roomy cards and inline expansion — November 1, 2026

Sean requested more spacing and compact previews that open the current full bet
details on tap. [Five new preview mockups](../design/my-bets-previews-2026-11-01/README.md)
include a clickable gallery, Dark/Light boards and before/after examples. All
five reuse the full selection grid after opening. Twenty local theme/width
cases passed, including six-leg expansion, exact straight terms, history and
collapse focus. Sean selected **01 — Roomy cards**, then confirmed inline
expansion. Design PR #404 merged after all twelve checks passed.
[The implementation](MY_BETS_ROOMY_2026_11_01.md) adds spacious previews that
open the full grid in place, retains existing ticket details and restores focus
on collapse. All 620 component tests and 30 bet/recommendation browser flows
passed locally. PR #405 merged as `46097802899472cdfb1bdb00c7c50248e2f24dab`;
all twelve PR and exact-main checks passed. The [protected frontend release](RELEASE_2026_11_01_MY_BETS_ROOMY.md)
succeeded in run 41354776316. Pages `90a7bf99` serves all 127 verified files;
API v45/history and the checked saved tickets, units and historical scoring rows
are unchanged. Legitimate scheduled current-week settlement appends were retained.
Actual signed-in production/physical-phone acceptance remains open. No provider
connection or frozen tracker changed.

## Earlier My bets selection grid release — November 1, 2026

Sean requested easier manual player-bet tracking, more sportsbook choices and a
better-looking My bets section. He confirmed all parlay legs should remain
visible, then requested five to ten examples with less text and clutter.
[Six visual mockups](../design/my-bets-2026-11-01/README.md) provide an interactive
gallery, individual previews and Dark/Light comparison boards with fictional
tickets. They retain GTL's selected brand. These
artifacts change no production interface, records, sportsbook connections or
frozen tracker. Sean then selected **04 — Selection grid**. The design PR #400
is merged; [the actual implementation](MY_BETS_GRID_2026_11_01.md) adds the grid,
guided player props, exact cash/unit entry and eight more manual book choices.
[PR #401](https://github.com/seanbalz/guess-the-line/pull/401) is merged as
`43768a44b3cbbef2bc104b5e16f1512ab526eaaf`; all twelve PR and exact-main checks
passed. The [protected frontend release](RELEASE_2026_11_01_MY_BETS.md) succeeded
in run 41344546549. Pages `83caec6d` serves all 127 verified files. API v45,
migration history, checked scoring records and the bounded saved-ticket records
are unchanged. Real signed-in production/physical-phone acceptance remains open.

## Research data population repair — November 1, 2026

Sean reported the deployed view had no research data and requested further
development. The previous release's operational content readiness was incomplete:
zero imported research snapshots and an obsolete bundled trend snapshot.
[The data-flow repair](RESEARCH_LIVE_DATA.md), merged in PR #397, adds
a scheduled free-data publication, checksum-verified server loading, current
published-week selection, reachable observed matchup statistics and explicit
coverage/empty states. A real-source build covers 108 completed games through
October 29, 750 registered trends (eight historically qualified), and all 14
Week 8 matchups. Source feeds and current betting quotes remain separate.
All twelve PR and exact-main checks passed. The [November 1 production record](RELEASE_2026_11_01_RESEARCH_DATA.md)
verifies the public data publication, protected API v45 and frontend release,
127 matching production assets, nine matching critical API source files, strict
research access denials and unchanged score/ballot/settlement fingerprints.
The real public loader plus captured production read inputs return 14 scoring/
play-statistics matchups, 68 assessments and eight evidence entries; this is a
local projection. [November 2 acceptance evidence](RESEARCH_ACCEPTANCE_2026_11_02.md)
verifies automatic publication, all six current public assets and resolution of
schedule drift through one coordinated normal refresh (run 41544353761). Both
normalized source dependencies match, with zero missing finals at 23:21 UTC.
A real signed-in account on stable #408 frontend shows Week 9, 15 statistics
links and populated qualitative assessments/evidence; read-only refresh, filters,
Light/Dark and 320/390-pixel layouts pass. Physical iPhone acceptance remains
with the sole device owner; #398 stays open at the bounded 85–95% estimate.
The record distinguishes one-account browser checks from device, cross-account
and unlocked-market acceptance. No automatic X feed is connected.

## Independent research assessments — October 30, 2026

Sean approved the first research/recommendation stage after the source-review
and alignment discussion. [Scope, the three reference analyses, operating
contract and release boundaries](RESEARCH_ASSESSMENTS_STAGE_ONE.md) record the
implementation. Research recommendations have their own filtered nested list;
the existing gap list is labelled Your guess vs. market. Guess/scoring/reveal
rules are preserved. Stage one supports qualitative yellow/red/gray assessments,
attributed checked evidence, observed statistics, private submitted links and
budget-reserved selective odds collection. Green requires a later tested model.
Automatic X monitoring and arbitrary graphic extraction are not connected.
Production API v44, the additive migration and frontend are deployed from
`89acd94cfd1f5e0ab837b0150dd28e12807ff5e8`. [The October 31 release record](RELEASE_2026_10_31_RESEARCH_ASSESSMENTS.md)
documents all six protected workflows, seven matching function bodies, private
RLS/grants, unchanged scoring fingerprints and 127 matching production assets.
The applied ledger and research boundary probes now reflect that hosted state.
Real signed-in/physical-phone acceptance and source-feed configuration remain
separate; no green model or complete X automation is claimed.

Sean then requested “Merge and deploy”; feature PR #393 merged. Exact-main CI
caught another quota-fixture clock assumption: the test mixed a moving clock
with a fixed October 30 attempt date and could cross UTC midnight. The fixture
now uses a future UTC midday and consistently timestamps its synthetic attempts;
all 16 collector SQL checks pass locally. Production quota/scoring logic is
unchanged. [Release card #394](https://github.com/seanbalz/guess-the-line/issues/394)
tracks the required source checks, schema/app release order and preservation proof.

## Research formatting follow-up — October 29, 2026

[#388](https://github.com/seanbalz/guess-the-line/issues/388) remains open under
DESIGN-01/Q19. [Reproduction, repair and acceptance scope](RESEARCH_FORMATTING_2026_10_29.md)
cover the loaded Fantasy page losing its shared content width/gutters and
Trends section names breaking mid-word at 320px. The implementation restores
the existing Fantasy layout, makes its comparison table keyboard-scrollable,
and gives the narrow Trends section controls two columns. This work has its own
source/CI/deployment and physical-phone gates; prior shared-interface acceptance
and the parallel moneyline release do not close it.

PRs #389/#390 are merged and the [frontend release](RELEASE_2026_10_29_RESEARCH_FORMATTING.md)
from `f5225bb085dada8378d6ff61ce4eedd2352d6521` passed exact-main CI, protected
readiness/deployment and verification of all 125 production assets. Fresh signed-in
Light browser checks verify the restored Fantasy column, loaded nested layers,
filtering, comparison scrolling, bottom clearance and all four Trends sections;
320px controls remain one line and 44px high. Physical iPhone acceptance is pending:
Mirroring reports iPhone in Use, with the phone-lock request awaiting Sean.
No phone pass is claimed. #388 stays open.

## Shared sport interface — October 29, 2026

Deployed and checked in fresh authenticated desktop readback: NFL/EPL use the same frame, profile/menu
and navigation, retain the current primary section when switching, and keep
sport-specific game modes and data contexts separate. See the
[scope, test evidence and visual review](SHARED_SPORT_INTERFACE.md).
PR #379 merged after all twelve checks passed; the frontend release from
`a41f68362acb5165b17ef6f20673d23d1a2c9ec8` verified all 125 served assets.
[Release and desktop acceptance](RELEASE_2026_10_29_RESEARCH_SHARED_INTERFACE.md)
cover the same read-only profile and all four primary sections in both directions.
Physical Safari checks now verify loaded Research, the same read-only profile,
all four primary sections in both sport directions. Seven directions were
operator-observed; the final NFL→EPL Bets transition was user-confirmed directly
on the phone, with its EPL Bets endpoint separately observed and reviewed.
The existing unavailable EPL Bets content remains a separate delivery gap.
Existing EPL moneyline work retains its own owner and gates.
The skip-link CI correction includes focused regression and both-sport keyboard
evidence in that record; exact-main CI and protected release gates have passed.
These shared-shell checks do not establish moneyline gameplay deployment or
moneyline physical-phone acceptance.

## EPL priority — October 29, 2026

**Live DNB gate follow-up:** Sean authorized enabling/testing the bounded daily check. The first hosted run
succeeded October 29 at 16:44:48 UTC, qualifying all three sampled fixtures across all three books; the actual
MW9 gate evaluates true. Budget is 404 after three credits, player/scoring hashes are preserved, and daily
checking is enabled. [Live evidence and remaining implementation](RELEASE_2026_10_29_DNB.md). This supersedes
older “no live DNB verdict” statements for MW9. The later [moneyline release](RELEASE_2026_10_29_EPL_MONEYLINE.md)
separately records the completed API, collector/screens deployment and natural production captures.

Sean requested parallel EPL work before returning to the remaining approved backlog. The first frontend/worker batch from `5c1b775` is deployed; API v42 and EPL jobs v2 are recorded in [release evidence](RELEASE_2026_10_29_NBA_EPL.md). M-32 is [applied and verified](RELEASE_2026_10_29_M32.md), and the live MW9 DNB check passed as recorded above.

[PR #377](https://github.com/seanbalz/guess-the-line/pull/377) merged as `e220b8d8f7663f55156e019de1d80c44493c440a` after all 12 checks. It atomically includes #370/#371, commissioner correction review, roster display enrichment and standings readiness. This establishes source completion, not new hosted operation or metadata coverage. M-33 remains unapplied; correction operation needs the M-35 cutoff guard and operator prerequisites.

PR #384 merged the reviewed API, collector, moneyline/Home/leaderboard screens, canonical rules and correction/standings compatibility source as `d04e5c951d3e53fe2b5502b226c3da964955119f`, after all twelve checks passed on `ea1d616af47bcfe983949e951b47e4e63107694d`. Component PRs #378/#381/#382/#383 are merged/closed; #380's reviewed source was superseded by the combined branch. M-33/M-34/M-35 remain unapplied with their operator/source prerequisites. M-36 is [applied and verified](RELEASE_2026_10_29_M36.md). The [completed moneyline release](RELEASE_2026_10_29_EPL_MONEYLINE.md) from `d891291c8a21e2de7827826e0d194fc2e0da11a6` deployed API v43, worker v3 and all 125 frontend assets, enabled/tested collection and passed signed-in readback. Later production lock-ins produced ten priced captures with consistent references/distances; no test prediction was manufactured. Timed priced collection, shared live concurrency, kickoff/full-cycle and physical-moneyline acceptance remain open. The frozen v62 tracker is unchanged.

## October 29 — Balanced logo and favicon

Sean selected 01 Balanced from five visual directions. Both app logo components,
the design lab, browser favicon, home-screen and notification icons now use the
refined geometry in this task branch. Five color variants plus the light-surface
green are exported. [Asset record and selected preview](../design/logo-redraft-2026-10-29/README.md).
Local verification: five brand asset tests (including PNG alpha, color, margins,
centering and favicon theme behavior), 52 shared UI tests, Brand QA and production
build passed. The small browser favicon omits side hashes. Production release
[40907820747](https://github.com/seanbalz/guess-the-line/actions/runs/40907820747)
succeeded from `5c1b775f05a69306f20f911f4b0455c207c65ffc`: Pages `72eb400b`,
124 served assets verified, 385 boundary checks passed, and direct favicon/icon
readback matched the source. [Release evidence](RELEASE_2026_10_29_BALANCED_LOGO.md).
Physical-device acceptance remains separate.

## October 29 — Research/EPL regression and physical iPhone sweep

[Audit evidence and remaining gates](REGRESSION_AUDIT_2026_10_29.md) records
production Research quote/name crowding, EPL shell/context discontinuity and a
retained older Safari tab with a Trends error. Research phone-layout and favicon-reference repairs are in #376. Full shared
EPL shell/profile ownership is #379; #376’s overlapping partial implementation
was removed before merge. Both PRs merged green; combined frontend release
[40926218502](https://github.com/seanbalz/guess-the-line/actions/runs/40926218502)
passed from `a41f68362acb5165b17ef6f20673d23d1a2c9ec8`, with 125 served assets
verified. Fresh desktop checks pass loaded Research at 390px and the same
profile/navigation/current primary section across both sports in all four tabs.
[Release/readback evidence](RELEASE_2026_10_29_RESEARCH_SHARED_INTERFACE.md)
records the completed, bounded physical Safari matrix, including the final
user-assisted transition and its observed endpoint. Physical iPhone
logo observations cover installed app and Safari in Light/Dark; exact favicon
Dark adaptation/cache freshness remains open. Sean confirmed restoring test
appearance settings. Older running-client recovery and exact cached-favicon
adaptation remain open; this is not blanket app acceptance.

## What the evidence establishes

GitHub main was `7d0a48f116ae5b607bab0f92b103ebf447e20188` at this audit.
There were no open pull requests or issues; that does **not** mean the product is
finished. Unfinished issue scope was carried into the repository queue when the
issues were closed October 23. CI at this main revision passed Tests, Brand QA and
Dashboard. No app runtime file changed between the latest recorded deployed
source `1efd802bea78d298b1c30ede7824b6a6213c23aa` and that main revision.

The latest recorded app release is October 23 Eastern / October 24 UTC:
API v36 and Pages `3d274d87-8b1c-470d-9ede-de1287b2ea9f`, including Points P-01/P-02
and Bets Everyone. See the [Points release evidence](RELEASE_2026_10_23_POINTS.md).
These are dated deployment records, not a new authenticated production audit.
Since then, October 26: `gtl-api` v37 and Pages `b8a31940` from `17afa76` (faster app
start: cached preflights, shared and parallel boot reads, immutable assets, no sign-in
jump; also #209); see the [release record](RELEASE_2026_10_26_PERF.md).
Current physical-iPhone acceptance and cross-machine synchronization were not
established by this repository audit.

## October 26 merge follow-through

[PR #209](https://github.com/seanbalz/guess-the-lines-repo/pull/209) merged as
`c42148747ecdc6c3190c4a1582baa921807376af` after all nine checks passed on
`ea4daae2cd7206db9316ee2c0c163ff88b37c660`. Its CI fixes preserve Join as the
single primary action when an invitation is pending and stabilize historical
Trends/Lines browser fixtures. The full Node suite passed 1,766 tests with zero
skips; all 25 Vitest files passed. The initial audit above remains dated evidence.

The refreshed main also includes [PR #210](https://github.com/seanbalz/guess-the-lines-repo/pull/210),
merged separately as `417b800e735242560c45ef7e275520c3a6e61e59`: shared/parallel
startup reads, preflight and hashed-asset caching, nonblocking fonts and sign-in
continuity. Its reported Lighthouse measurements are PR-author evidence, not a
new production or physical-phone measurement by this task. Neither merge alone
establishes deployment. This task has not deployed the app or applied SQL.

## Delivered versus remaining

| Area | Implemented and released evidence | Still open |
| --- | --- | --- |
| Four-tab design | [PR #162 release](RELEASE_FOUR_TAB_REDESIGN.md): four roots, compact summaries, retained editors and reversible detail routes. [D-55 Round 3 release](RELEASE_2026_10_22_ROUND3.md): charts, disclosures and Home/Bets styling. | Q17 missing destinations; Q19 visual/device acceptance. Since the [October 27 release](RELEASE_2026_10_27_API_FRONTEND.md) (`gtl-api` v38, Pages `4a03e6cd`) every signed-in member opens the new app (D-60 step 1); that release retained classic at `?app=classic`. D-65 merged in #305 and its [October 28 release](RELEASE_2026_10_28_NEW_APP_ONLY.md), recorded by #312, removes that entry and uses Reload the app on failures. Pages `0a4c0d25` is recorded from `91e3f51`; this task read the release record without repeating hosted verification. |
| Mobile layout | PR #174 toolbar/spacing fixes; PR #181 focus scroll padding released as Pages `9fb54fe4`. | October 26: Sean corrected his initial reply and reports the app does not have the scroll bug. The movement symptom is user-reported resolved. Broader Q19 device acceptance remains separate. |
| Bets | [Actual tracking](EASIER_BET_TRACKING_RELEASE.md), [recommendation handoff](RECOMMENDED_TRACKING_RELEASE.md), [Recommended filters](RELEASE_2026_10_22_TRENDS_FILTER.md), M-10 reader and PR #204 Everyone are released. | Q06 account-level placement M-11 and the remaining dedicated Virtual Units screens. Boards M-12 [applied October 27](RELEASE_2026_10_27_FEED_MIGRATIONS.md) with `/bets/board` and `/bets/season` in `gtl-api` v38; no screen reads them yet. Reader delivery does not close the full Bets plan. |
| Scoring and comparisons | [Core scoring](CORE_SCORING_PRODUCTION_RELEASE.md): per-game lock, personal points and receipts. [Migrations release](RELEASE_2026_10_22_MIGRATIONS.md): D-53 comparisons/preferences applied and signed-in reads verified. | Q07/Q08 phone privacy, save/reload and account-isolation acceptance; Q18 operating evidence. |
| Trends and optimization | [Trends release](RELEASE_2026_10_22_TRENDS_FILTER.md); PR #182 CPU repair shipped as API v32. PR #207 runs the Node/Vitest suite once and shards browser CI; PR #208 restores release compatibility gates. | PR #210 startup optimizations and signed-out measurements have a [recorded October 26 release](RELEASE_2026_10_26_PERF.md). Signed-in startup and phone performance measurements remain open. On-demand invitation, creation and Members code is verified locally; lazy-loading checks are not phone performance evidence. |
| NBA | [October 22 release](RELEASE_2026_10_22_MIGRATIONS.md): daily games and private bet tracking, migrations, API v34 and Pages `7ae80e71`; archived tickets preserved. | Physical-iPhone acceptance. NBA competitions remain later scope. |
| Fantasy | [Track 1](RELEASE_2026_10_23_FANTASY_TRACK1.md) released, first data published, readback retry fixed in #202, daily schedule in #205. Scheduled runs succeeded October 24–26; [October 26 run](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40365251250). | Phone readback; richer usage/comparisons/matchup/trade tools Q12–Q15 and connected roster work follow current redesign completion. D-59 fantasy feed: the private `fantasy-feed` bucket migration `20261026220000` is applied (hosted as `20261028131021`, October 28, [card](RELEASE_2026_10_28_D59_TRENDS.md)); the machine-only `gtl-fantasy-ingest` upload is deployed (v1, October 28, through the `fantasy-ingest` release target) and answers 503 until Sean sets its upload secret; the read route, app views and exporter follow ([release card](FANTASY_FEED_RELEASE.md)). |
| Guess the Points | P-01/P-02, API v36 and frontend released; signed-in `/points/read` verified in the release record. | P-03 actuals loader/jobs (PR #219) and the worker release targets (PR #223) merged October 26 (`9da3ce6`). [October 26 release](RELEASE_2026_10_26_POINTS_JOBS.md): P-03 applied (hosted `20261026213106`, 54 migrations, digest `bd53dcf4…`), `gtl-points-jobs` v1 and `gtl-push-reminders` v5 deployed, cron jobs registered with the schedule row disabled. Open: [release card](GUESS_THE_POINTS_P03.md) step 5 (enable and one verified run) and step 6 (first actuals readback); until then no slate is drafted or published automatically and automatic Points scoring is not verified. Commissioner "Publish now" on Play › Points (preview a drafted week, confirm, publish through the existing `POST /points/slate`; no server change) merged in PR #277 (`671e3ec`) and live in Pages `48a36ee4-a4f9-48c8-a64b-b030a7d2d29a` from `9460635` (October 28, release card PR #279); signed-in commissioner acceptance on a phone is still open. |
| Social and rewards | Existing feed/comments and group membership work. League feed (stages 61–63) and badges, awards and streaks (stage 69): routes in `gtl-api` v38 and M-13, M-21, M-22, M-23, M-25, M-26 [applied October 27](RELEASE_2026_10_27_FEED_MIGRATIONS.md); signed-in feed and features reads answer 200 in hosted logs. Badges worker `gtl-league-features` v1 and its weekly schedule (Tuesday 12:00 UTC, on Sean's "once a week") are live since October 27 ([release record](RELEASE_2026_10_27_LEAGUE_FEATURES.md)); the first scheduled run recorded 58 badges, 18 awards and 10 streaks and posted the Week 7 recap. Open: phone checks. | Remaining approved friend challenges, player/social detail screens and badge/streak/award/recap pipeline; each needs its real contract and implementation gate, not a completion claim based on a mockup. |
| Preservation and transition | [RETIRE-01–04 checklist](../planning/new-app-retirement.md) exists. Me › History (older records included) and Export my data: routes in `gtl-api` v38, M-27 and M-28 [applied October 27](RELEASE_2026_10_27_FEED_MIGRATIONS.md); no signed-in use yet. RETIRE-03 [hosted inventory](RETIRE_03_INVENTORY_2026_10_28.md) (October 28, read-only): 47 of 48 recorded deployment URLs served an old-app build; step 1 (October 28) put every non-production URL behind Cloudflare Access (49 checked, all HTTP 302); deletion and device checks await approval. | Q17 history/export, commissioner tools (Menu › Commissioner tools built October 28 for D-65: status, week opening, referees, final scores, odds connection; PR #316, merged October 29 and released in the frontend from `4564fff` that day; no signed-in use recorded), invitations/creation and older-record destinations; Q09/Q10/Q19 device/full-week acceptance, then Q20 transition. No cutover or record deletion authorized by this audit. |
| EPL Pick a Team | M-30 is [applied](RELEASE_2026_10_29_M30.md); `gtl-api` v42 and `gtl-epl-jobs` v2 are active. Fresh October 29 read-only checks verify all 26 current EPL function hashes, browser-role denial, five enabled jobs, seeded MW9 and after-MW8/daily snapshots. See the [workflow record](EPL_WORKFLOW_CONTROL_2026_10_29.md). | Rollover validation repair [#366](https://github.com/seanbalz/guess-the-line/pull/366) deployed in worker v2 with [verified release evidence](RELEASE_2026_10_29_NBA_EPL.md); Tuesday capture/audit is in #370 with M-33 pending; the commissioner flag and current league-table source remain open. Sean confirmed preserve picks/order and flag review (D-68 item 23). Full MW9 → MW10 automatic cycle and phone acceptance remain open. |
| EPL Research → Fantasy | Stored-snapshot routes and Matchup/Standings/Rosters/Insights screens are implemented and included in the recorded [M-31/API/frontend release](RELEASE_2026_10_29_M31.md). An after-MW8 and October 29 daily snapshot are hosted; no per-request Sleeper fetch is introduced. | [PR #369](https://github.com/seanbalz/guess-the-line/pull/369) supplies tested narrow-screen and account-discovery fixes plus disposable-SQL browser acceptance; merged and deployed in the [October 29 batch](RELEASE_2026_10_29_NBA_EPL.md). EPL-DATA-01 tracks 16/150 rostered players lacking saved metadata. Before-kickoff/after-MW9 captures, full-cycle readback and a real linked/unlinked phone check remain open. Opponent inference remains unavailable until the approved scored-repeat evidence exists (first possible MW17). |
| EPL open access and automatic linking | [M-31 is applied](RELEASE_2026_10_29_M31.md); its function hashes and service-only permissions match current source. Fresh October 29 aggregate readback shows eight managers, seven linked. Confirmed-account open reads and audited auto-link/claim flows are implemented. | Remaining manager must claim or be linked by the commissioner under the existing identity flow. Agent acceptance covers account switching, aliases, claim conflicts and private queues without changing a real account; real phone acceptance remains separate. Manual links remain manual audit events. |

EPL moneyline readiness is separately published in [PR #367](https://github.com/seanbalz/guess-the-line/pull/367):
pure rules, service-only M-32 and a disabled `dnb-check` path. M-32 is now
[applied and verified](RELEASE_2026_10_29_M32.md), hosted as `20261029162422`. The real DNB gate has never run; routes, ongoing
collection and player screens remain gated and are not completed by this PR.

The independent [NBA/EPL release-verification record](RELEASE_2026_10_29_NBA_EPL.md)
also records eight MW9 picks, ten fixtures and signed-in desktop reads of all
four Fantasy sections. That record is distinct from this workflow's aggregate
SQL audit and from physical-phone acceptance. Do not reseed MW9 or reapply M-30/M-31.

## Current implementation lane

Q17-A invitation management and Q17-B Duel/Group creation are merged in #209.
Their October 26 frontend release is recorded in [the performance release](RELEASE_2026_10_26_PERF.md); signed-in recipient/device readback remains separate. Both use existing
routes, include uncertain-write recovery and load only when opened; see the
[implementation record](REDESIGN_COMPLETION_2026_10_26.md).

Sean’s next priority is **Research and charts**, selected October 26. The current
[design batch](RESEARCH_DESIGN_2026_10_26.md) applies D-55 to Research’s information
hierarchy, tooltip spacing, narrow-screen stat/season layouts and chart gestures.
It also fixes Escape closing the underlying sheet when dismissing chart
information. PR #216 merged as `275c57fa1fedd4876cdf706e7b16a5e77bb52d66`
after all nine checks passed on `06c500a124ca5eaf8730d41f024063edb625cbd7`.
[PR #218](https://github.com/seanbalz/guess-the-lines-repo/pull/218) merged as
`657eb1946b20927cc8a668373276c3844127095e` after all nine checks passed on
`7bfbe8546bcc5370dc8e1f57555f318031386a95`; no CI fixes were needed. It adds
faithful curve geometry, visible season headings/percentages and missing-versus-zero
win rates. Neither Research merge establishes a new deployment.

PR #222 makes each season in the table selectable, synchronizes it
with dragging and the keyboard slider, and retains the selected year when
switching chart views. A check and outline identify the selection, with 44px
minimum touch targets. All 19 integrated Research/Lines/Trends browser tests,
two focused tests, nine rendered-chart tests, 20 chart/token tests, typecheck,
Brand QA, fixture build and bundle privacy scan passed. Light/Dark 320px
screenshots were inspected. [PR #222](https://github.com/seanbalz/guess-the-lines-repo/pull/222)
merged as `71bb47b46737fc309ad778a593a72d130a1c67d5` after all nine checks passed
on `8cc4042b6bdd94c65095d2bd8105e6a27a00a969`; no CI fixes were needed.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open. The queue lists each
checkpoint separately; this does not close all Research work or Q19.

PR #224 supplies [game market details](RESEARCH_MARKET_DETAILS_2026_10_26.md):
per-market current/latest consensus with source times, named-book quote comparison,
and recorded line movement with a chart and table. Local verification passed:
23 integrated browser tests, five focused market/freshness cases, 26 rendered
component tests, 37 model/API-contract/price-order/token tests, typecheck, Brand
QA, fixture build and bundle privacy scan. [PR #224](https://github.com/seanbalz/guess-the-lines-repo/pull/224)
merged as `97273e9652cf29dca77208488deb7c6c858646a4` after all nine checks passed on
`473be765f015fcf7d88853979bc8d246f878ddf1`. No CI fixes or review responses were needed.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.
PR #225 adds [board current quotes and gate entry](RESEARCH_BOARD_LINES_2026_10_26.md):
current/latest values with source times, one banner leading to Play, scoped
failure/retry behavior and time-based freshness without odds polling. All 28
selected browser cases passed across integrated/focused runs; 26 component,
43 model/contract/token and 19 SQL gate tests passed, plus typecheck, Brand QA,
build/privacy scan and inspected Light/Dark 320px screenshots. [PR #225](https://github.com/seanbalz/guess-the-lines-repo/pull/225)
merged as `733e95d586e005427350ba156d7ad1a05c139094` after all nine checks passed on
`cf9ebe16c88975fefcc0d0a2168cc069741152c3`; no CI fixes or review responses were needed.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

Stage 33’s direct in-board confirmation is supplied by the Research reveal
batch recorded below. Verified live-game status beyond kickoff/final evidence
remains open. PR #230 adds [Community guesses in the game
sheet](RESEARCH_GAME_GUESSES_2026_10_26.md), implementing stage 34’s per-game list:
independent markets, private drafts, reader-provided scores/ranks, on-demand
reads and scoped retry handling. All 33 integrated browser cases, five focused
reruns, 28 component and 38 model/API-contract/SQL/token tests passed, along with
typecheck, Brand QA, build/privacy scan and inspected 320px Light/Dark screenshots.
[PR #230](https://github.com/seanbalz/guess-the-lines-repo/pull/230) merged as
`f8997f66b3f70512cf988ea905664bb7e828f62e` on October 26; verified October 27:
all nine checks passed on `60d66647f5a4c4cccc749106c63cea204687a710`, with no
review findings or CI fixes. The October 27 frontend release card includes it;
this session has not independently verified hosted deployment or device acceptance.

PR #242 adds the [game action bar](RESEARCH_GAME_ACTIONS_2026_10_27.md):
Spread and Total slots open the explicit week and focus the selected matchup in
Play. Existing drafts, receipts and lock-in confirmations remain in the full
ballot. [PR #242](https://github.com/seanbalz/guess-the-lines-repo/pull/242) merged
October 27 as `ec5c0358c70aee273edcfea70c6b39799a14f443` after all nine checks passed on
`b163ceaaf1ebe41802b36f79e6f3301d3d22f852`. No CI fixes or review findings. Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

PR #243 supplies stage 31's [Your pick sheet](RESEARCH_YOUR_PICK_2026_10_27.md):
per-market saved references, explicit pending/first-after/commissioner labels,
recorded Late, account/week guards and fixed-market Community guesses. Its
validation and publication checkpoints are recorded separately. It merged October 27
as `f5a9551bd2c7d5e9a1d617dee54445c3da499f11` after all nine checks passed on
`4dfb665a259ba98220d2ad6be48a708b468507b2`. No CI fixes or review findings.

[PR #245](https://github.com/seanbalz/guess-the-lines-repo/pull/245) adds [per-game League bets](RESEARCH_GAME_BETS_2026_10_27.md) from
the Bets action slot, using the existing M-10 reader and shared Everyone rows.
43 integrated browser cases plus four final focused cases, 24 component and
42 model/shell/token tests passed,
along with typecheck, Brand QA, build/privacy scan and inspected 320px screenshots.
It merged October 27 as `1db1c44062e2b63b7b945c6b0478a1ca6d72c8b6` after all nine checks
passed on `58f4d14240308e999cbede1aec1de13dd65d4362`, with no CI fixes or review findings.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

[PR #246](https://github.com/seanbalz/guess-the-lines-repo/pull/246) supplies [direct Research reveal confirmation](RESEARCH_REVEAL_2026_10_27.md)
from the board and closed game guesses. It uses the existing whole-week M-03
forfeit contract, with fresh eligibility, an explicit warning, preserved locked
scores/drafts and recovery by checking an uncertain write. All 49 integrated
browser cases plus five final focused cases, 24 component, 47 model/contract/shell/token and 23 database tests
passed, along with typecheck, Brand QA, build/privacy scan and inspected 320px
Light/Dark screenshots. PR #246 merged October 27 as
`6494a629e567d54aa05520ac339472322ee062bb` after all nine checks passed on
`c191ec8a8e56a71f4023002a1e2df18296331096`; no CI fixes or review findings.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [Research chart correction](RESEARCH_DESIGN_2026_10_26.md#cumulative-chart-records--october-27)
pairs cumulative units with a cumulative record in tooltips and keyboard
announcements. The evidence table keeps each period’s own record with explicit
column labels. Source is in [PR #248](https://github.com/seanbalz/guess-the-lines-repo/pull/248)
on `codex/research-chart-records`; all 50 integrated
browser tests, 25 component and 72 model/handler tests passed, as did typecheck,
Brand QA and build/privacy validation. Light/Dark 320px screenshots were inspected.
PR #248 merged October 27 as `bc5a06cb74252c8da7af6c87a4531878b7ea67fe`
after all nine checks passed on `459e24f3680a3ee0fb0792ba5905dfe7d7d397ee`;
no CI fixes or review findings. Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [chart interaction correction](RESEARCH_DESIGN_2026_10_26.md#retained-line-selection--october-27)
retains the cumulative-line point while comparing the season view. Line and
season selections remain independent; changed evidence and reopened details
start at the latest line point. Source is in [PR #249](https://github.com/seanbalz/guess-the-lines-repo/pull/249)
on `codex/chart-selection`: all 50
integrated browser tests plus two final focused checks, 27 component and 20
chart/token tests passed, along with typecheck, Brand QA and build/privacy checks.
Light/Dark 320px screenshots were inspected. PR #249 merged October 27 as
`b1bc64b493e6a6723ba7ee58582fdbd2569d448c` after all nine checks passed on
`0c1918d992eaba0b595ab029877e87857a068daf`, with no CI fixes or review findings.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [chart frontend release card](RELEASE_2026_10_28_CHARTS.md), merged in
PR #296, records Pages `b57d894a-34b8-4df7-8125-a46d4438475d` from
`b4413bf6504d9e8286ca0f7ae1a3b3b7db0e5f6b`, verified by the release lane at
15:42:36 UTC October 28. It includes the Research/chart work through #293,
superseding #292's `58bd9959` checkpoint. API v39 and the 65-row migration
history are unchanged; 380 signed-out probes denied access. This task read the
committed release evidence and did not repeat that hosted audit. A signed-in
desktop readback of #291 and #293 on the later `91e3f51` frontend passed October 28
(Mac mini Chrome; see the card). Phone acceptance remains open. The on-demand team-detail and Trends
batches are subsequently included in the [D-65 release](RELEASE_2026_10_28_NEW_APP_ONLY.md),
which records source `91e3f51` and Pages `0a4c0d25`. D-63 and D-64 were approved
in PR #307; no feature/label approval remains. This task read these committed
records without repeating their hosted checks.

The [high-contrast chart correction](RESEARCH_DESIGN_2026_10_26.md#high-contrast-chart-fallback--october-27)
restores marks that disappeared under forced colors: season stems, win-rate bars
and Last 10 blocks. It also preserves selected-season boundaries and uses system
foregrounds for line and movement plots. Source is in [PR #250](https://github.com/seanbalz/guess-the-lines-repo/pull/250)
on `codex/chart-high-contrast`;
all 51 integrated browser tests, 30 component and 23 model/token tests passed,
along with typecheck, Brand QA and build/privacy checks. Before/after screenshots
were inspected. PR #250 merged October 27 as
`fddcaf3d1ae6211324a80a9d3fef3f65d87ca003` after all nine checks passed on
`a8b0571f32577ee05517db59dacadc1faa2935bf`, with no CI fixes or review findings. Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [kickoff-marker batch](RESEARCH_DESIGN_2026_10_26.md#kickoff-marker-in-market-movement--october-27)
adds a dashed, timestamped landmark within recorded movement history, preserving
quote selection, gaps and market gates. Source is in [PR #252](https://github.com/seanbalz/guess-the-lines-repo/pull/252)
on `codex/movement-kickoff`;
all 52 integrated browser tests, the focused browser test, 24 model/token tests
and 31 component tests passed, along with typecheck, Brand QA and build/privacy
checks. Four 320px ordinary/forced-color screenshots were inspected. PR #252 merged October 27 as
`c54cc42045af534da0b1b474e45282858768f0ed` after all nine checks passed on
`0d143f95e68215ce9b153dbbdcb3757908923868`, with no CI fixes or review findings.
Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [Research source-time batch](RESEARCH_DESIGN_2026_10_26.md#pacific-source-times-in-research--october-27)
uses readable Pacific times for quotes, source posts and provenance, retaining
exact source timestamps and historical calendar dates. Missing or unzoned times
stay unavailable. Source is in [PR #253](https://github.com/seanbalz/guess-the-lines-repo/pull/253)
on `codex/research-source-times`: nine Research and
52 integrated browser cases passed, followed by kickoff/source-time checks on
the combined branch, 33 component and 27 format/token tests. Typecheck, Brand QA
and build/privacy checks passed; six 320px Light/Dark screenshots inspected.
PR #253 merged October 27 as
`a887fd162560e3aa6e6eb29fe3cdd3686fcfb137` after all nine checks passed on
`d58d94addcf63f20aef980fc772b371bcb843903`, with no CI fixes or review findings. Frontend release is recorded through #289 in the current release checkpoint; signed-in readback and device acceptance remain open.

The [player comparison chart batch](RESEARCH_DESIGN_2026_10_26.md#labelled-player-comparison-charts--october-27)
labels each observation and value directly, preserves shared scales and the
evidence table, and distinguishes real zero from a missing sample. A forced-color
avatar fallback accompanies it. Source is in [PR #258](https://github.com/seanbalz/guess-the-lines-repo/pull/258)
on `codex/research-chart-values`;
54 integrated browser cases and five final Trends cases passed, along with 52
component and 24 model/token tests, typecheck, Brand QA and build/privacy checks.
Six 320px screenshots were inspected; narrow evidence tables keep whole headings
inside their scroll container. PR #258 merged October 27 as `e4c0c07ecf3d75bb68f87789cd7c1ea4e8bb1484` after all nine checks passed on repaired head `b0874306f81477f79dae38240d8238d929fe2406`. The CI brand-mark failure was fixed with an explicit initials-avatar class; no review findings remained.
Hosted release and device acceptance remain open.

The [recent-result tile batch](RESEARCH_RECENT_RECORDS_2026_10_27.md)
shows actual sample sizes and all three W–L–P counts, with pushes distinct from
losses and an explicit grouped-count label. Source is in [PR #259](https://github.com/seanbalz/guess-the-lines-repo/pull/259)
on `codex/research-recent-records`; 55 integrated browser cases on current main plus
repaired #258, two focused combined-chart
cases, 48 component and 20 model/token tests passed. Four 320px Light/Dark and
forced-color screenshots were inspected. Typecheck, Brand QA and build/privacy
checks passed. PR #259 merged October 27 as `ba9c043e156229e10b97b4edf0851a7fa5833408` after all nine checks passed on `80aa7f1eb4835aee593548fdfa5223e21ad62952`, with no CI fixes or review findings.
Hosted release and device acceptance remain open.

The [season-baseline batch](RESEARCH_SEASON_BASELINE_2026_10_27.md)
removes the minimum positive stub for zero and small values, uses a hollow
break-even marker and keeps missing units unplotted. Source is in [PR #261](https://github.com/seanbalz/guess-the-lines-repo/pull/261)
on `codex/season-zero-markers`; all 56 integrated browser cases, focused browser,
49 component and 26 geometry/token/brand-mark tests passed, along with typecheck,
Brand QA and build/privacy checks. Four 320px ordinary/forced-color screenshots
were inspected. PR #261 merged October 27 as `95eaa18b027c5ccdafffa571ee1083540f0591e6` after all nine checks passed on `1a9add3b3024b274ef12b515a0d528868d0eb32f`, with no CI fixes or review findings.
Release/readback and device acceptance remain open.

The [steady-tooltip batch](RESEARCH_STABLE_TOOLTIP_2026_10_27.md)
keeps line and season plots in place when tooltip labels wrap during scrubbing.
The browser regression reproduced an 18px shift and passed after the fix;
49 component and 26 geometry/token/brand-mark tests passed. All 57 browser cases
are covered by the integrated run and corrected season-fixture rerun. Eight
320px ordinary/forced-color screenshots inspected; typecheck, Brand QA and
fixture build/privacy checks passed. Source is in [PR #262](https://github.com/seanbalz/guess-the-lines-repo/pull/262)
on `codex/chart-stable-tooltip`. PR #262 merged October 27 as `6799e78e90a73805f9a337953a92d90f9fb0991e` after all nine checks passed on `d77e0ecca6300dd8d5ba48a5c089677e664160e0`, with no CI fixes or review findings.
Release/readback and device acceptance remain open.

The [Research evidence-selection batch](RESEARCH_EVIDENCE_SELECTION_2026_10_27.md)
links historical date rows and cumulative chart points, retaining period records,
focus and market gates while refusing controls for mismatched snapshots.
All 59 integrated browser cases and 12 final Research cases, 51 component and
26 geometry/token/brand-mark tests passed, along with typecheck, Brand QA and
fixture build/privacy checks. Four final 320px ordinary/forced-color screenshots
inspected. Source is in [PR #263](https://github.com/seanbalz/guess-the-lines-repo/pull/263)
on `codex/research-evidence-selection`. PR #263 merged October 27 as `6f427fb8ba00e1dc7b751a9aacb730ea4bc0f0e2` after all nine checks passed on `25b0dc5824a4050d6bea142262aabc2b2f70ebaf`, with no CI fixes or review findings.
Release/readback and device acceptance remain open.

The [recorded-movement selection batch](RESEARCH_MOVEMENT_SELECTION_2026_10_27.md)
links game-sheet timestamps to their chart observations, preserving missing
rows, duplicate times, keyboard focus and the locked-market boundary. The
focused browser regression, 57 component checks, 30 geometry/token/brand checks,
typecheck and fixture build/privacy checks passed locally. The first integrated
run exposed a Research-to-Play focus race; a deterministic regression failed
before and passed after the shell was repaired to preserve the requested game’s
focus. All 85 final integrated browser cases passed, including shell/navigation
and per-game scoring. Four 320px ordinary/forced-color screenshots were inspected.
Source is in [PR #265](https://github.com/seanbalz/guess-the-lines-repo/pull/265)
on `codex/market-movement-selection`. PR #265 merged October 27 as `63dbdaa3b5ebc39b89841f153f1f82682fc11689` after all nine checks passed on `0c0f2cd5fc3e7d36c1fe02a7767421c14693ece3`, with no CI code fixes or review findings.
Release/readback and physical-device acceptance remain open.

The [visible unit-scale batch](RESEARCH_CHART_SCALES_2026_10_27.md)
adds the plotted unit bounds to line and season charts. Zero and missing evidence
stay distinct; each image references its own accessible scale. All 59 component,
31 geometry/token/brand tests and typecheck passed. Browser coverage includes
59 passing integrated cases and all 12 Research cases after correcting a scale
expectation to match the plotted fixture value. Eight 320px Light/Dark and
forced-color screenshots were inspected; Brand QA and fixture build/privacy
checks passed. PR #267 merged October 27 as `21f9799064cf5f853279de7378449ff98307b475` after all nine checks passed on `03462dedaac1d8d4850a4cfb3a763eb8a98ae4b8`, with no CI fixes or review findings.
Source is in [PR #267](https://github.com/seanbalz/guess-the-lines-repo/pull/267).
Release/readback and phone acceptance remain open.

The [recorded market-range batch](RESEARCH_MOVEMENT_SCALE_2026_10_27.md),
`codex/market-movement-scale`, makes movement-chart bounds visible as well as
accessible. Spread signs and total points stay distinct from cumulative units;
single observations, flat series and missing evidence retain explicit states.
After integrating main with #266 and #267, all 65 browser cases passed, including
gesture coverage. The combined branch passed 112 component and 41
geometry/gesture/token/brand tests, typecheck, Brand QA and fixture build/privacy checks. Four 320px ordinary
and forced-color screenshots were inspected. PR #270 merged October 27 as `d98fb81ff0e84f392cf00ae235d7f09bd12b0e8b` after all nine checks passed on `edaab840546c379a781778e999fa3399b0314158`, with no CI fixes or review findings.
Source is in [PR #270](https://github.com/seanbalz/guess-the-lines-repo/pull/270).
Release is recorded in the current checkpoint; signed-in readback and physical-iPhone acceptance remain open.

The [Research-loading batch](RESEARCH_LOADING_2026_10_27.md),
`codex/research-loading-states`, extends the approved static skeletons to the
Research sheet, on-demand evidence and lazy historical table. Stale data still
hides before replacement reads; failures restore the existing explanation and
retry. All 66 integrated browser cases, two focused cases, 86 component tests,
19 token/brand tests and typecheck passed. Brand QA and fixture build/privacy
checks passed; six 320px ordinary/forced-color screenshots were inspected.
PR #272 merged as `e85e7859ae3714e3ec4e699d2bc4a33c7380a462` after all nine
checks passed on `41b8cf9132b8e9ac6520664c8953c1be6f611b65`. Initial browser CI
failed two Play haptic checks; integrating main’s PR #271 fix resolved them
without relaxing the lock-in assertions. All 21 local Play/Research cases and
all 110 cases in the repaired CI shard passed. No review findings remained.
Release is recorded in the current checkpoint; signed-in readback and phone acceptance remain open.

The [historical-table recovery batch](RESEARCH_TABLE_RECOVERY_2026_10_27.md),
`codex/research-table-recovery`, contains failed table downloads inside the
evidence section. The chart, selection, summary and sheet remain usable; retry
loads only the table and retains keyboard focus. Its browser regression failed
before the fix and passed afterward. All 14 Research browser cases, 86 component
and 19 token/brand tests and typecheck passed; four 320px ordinary/forced-color
screenshots were inspected. All 53 integrated Lines/Trends/Bets Everyone/gesture
cases also passed (67 browser cases total), along with Brand QA and fixture
build/privacy checks. After integrating the PR #272 CI repair from main’s
PR #271, all 22 combined Play-moment and Research browser cases passed again.
PR #275 merged October 27 as `a14852ec92aecb14a3c530fea7396e0a3aeb56c3`;
all nine checks passed on `65d2e03ed137a16420694b495740f644a4aca27a`, with no
review findings or further CI fixes. Verified October 28. Its release is now
recorded in the current checkpoint above; signed-in/device acceptance remains open.

The [team-chart selection follow-up](RESEARCH_TEAM_SELECTION_2026_10_28.md)
restores the full team sheet by removing its collision with the 32px team-mark
class, and connects completed season results to the margin chart with keyboard/focus
preservation, missing-score guards and readable narrow rows. Source branch:
`codex/team-chart-selection`. All 60 integrated Lines/Research/gesture browser
cases, 59 team/Research/chart component tests, 19 token/brand tests and typecheck
passed. Eight 320px Light/Dark and forced-color chart/result screenshots were
inspected; Brand QA and fixture bundle privacy checks passed. PR #289 merged
October 28 as `13c1b35198e8028205059088afa5f25043ad9e8e` after all nine
checks passed on `1582b786c4386433199e7874820bfba57700102f`, with no review
findings or CI fixes. Release is recorded in the current checkpoint; signed-in
readback and device acceptance remain open.

The [player comparison scale batch](RESEARCH_PLAYER_SCALES_2026_10_28.md)
adds visible point/percentage bounds to the existing comparison bars, derived
from their actual plotting range. Signed bias, absolute error, fixed 0–100%
rates and unavailable samples stay distinct. Source branch:
`codex/player-comparison-scales`. All 25 integrated Trends/Research/gesture
browser cases and the final focused case passed, as did 62 component and
19 token/brand tests, typecheck, Brand QA and fixture bundle privacy checks.
Eight 320px Light/Dark and forced-color signed/percentage screenshots were
inspected. PR #291 merged October 28 as `437766277102ef6488696fc623107937138dba1f`
after all nine checks passed on `e0d0f71ae471bf7d81d61ec41342d35a741cb4ca`, with no
review findings or CI fixes. Frontend release is recorded in #296; signed-in desktop readback passed
October 28 (see the chart card); device acceptance remains open.

The [steady team-chart readout batch](RESEARCH_TEAM_READOUT_2026_10_28.md)
reserves the tallest supplied game label so enlarged text does not move the
plot or slider when selection changes. Source branch: `codex/team-chart-readout`.
The regression failed before and passed after the fix; all 67 integrated
Lines/Research/Trends/gesture browser cases passed before the final main
integration; both affected team browser cases and 84 component tests passed
on the final source. 19 token/brand tests, typecheck, Brand QA and fixture bundle
privacy checks passed. Four 320px
enlarged-text ordinary/forced-color screenshots were inspected. PR #293 merged
October 28 as `1d9b38c891753af7a32686db2dd3e2fbd8c404e2` after all nine checks passed
on `754a38d28b354f552a07abff2ad7aa902c95a264`, with no review findings or CI fixes.
Frontend release is recorded in #296; signed-in desktop readback passed October 28
(see the chart card); device acceptance remains open.

The [on-demand team-detail batch](RESEARCH_TEAM_LOADING_2026_10_28.md) defers
team view/chart code and styles until the sheet opens. Its frame remains usable
while loading or retrying, and retry does not repeat the cached record read.
The local static dependency graph is 9,604 bytes smaller (2,193 estimated gzip),
with a 1,815-byte estimated gzip overhead once the optional view is opened.
The original 68 integrated browser cases and all four final team cases (including
repeated stylesheet-failure recovery), 84 component tests,
19 token/brand tests, typecheck, Brand QA and fixture bundle privacy checks passed.
Eight 320px Light/Dark and forced-color loading/error screenshots were inspected.
Source branch: `codex/lazy-team-sheet`. PR #295 merged as
`107fc8e65971c79ee4db4cdbd7180ed3b06978f1` after all nine checks passed on
`bfe99eb07ad46f31a62e79b82e33d8c8fc67db9d`; reviews and review threads were empty.
The stylesheet-retry defect was repaired before merge, with main's #294 test
reconciliation included. Release/readback, signed-in performance and device
acceptance remain open.

The [on-demand Trends page](RESEARCH_TRENDS_LOADING_2026_10_28.md) source batch on `codex/lazy-research-trends`: the optional screen and chart styles
load on a visit, with scoped loading/retry and navigation retained. Home's saved
summary remains independent. Local asset measurements reduce the initial static
graph by 50,418 raw bytes (13,655 estimated gzip), with a 2,708-byte estimated
gzip overhead after opening Trends. All 71 integrated browser cases, both final
focused cases, 84 component and 19 token/brand tests, typecheck, Brand QA and fixture privacy checks
passed; eight 320px loading/error screenshots were inspected. PR #298 merged as
`34f18a69d48f4fb3544783221352ba7ef7d495ce` after all nine checks passed on
`33b44f8173bb9f560aebf4c04cbbfde8482376b6`. Reviews and review threads were empty;
no CI repairs were needed. Release/readback, signed-in performance and phone
acceptance remain open.

Verified live-game status, stage 34’s Bet/Challenge action slots, the remaining
Play skip flow and device acceptance stay open. Correction: the base schedule
model carries kickoff only, but `marketBoard()` already adds recorded final
scores from `/lines/read`. The [final-result presentation batch](RESEARCH_FINAL_RESULTS_2026_10_28.md)
on `codex/research-final-results` separates Final from Kickoff passed, exposes
result provenance and rejects incomplete/mismatched scores. All 70 integrated
browser cases passed before the Trends integration; seven final board/Trends/
viewport cases passed after integrating main through #297. The 116 focused
component and 41 model/token/brand tests, full 466-test Vitest suite, typecheck,
Brand QA and fixture build/privacy checks passed; four 320px theme/forced-color
captures were inspected. Before merge, a navigation review found the new final
section was not reflected in the game pager. The scoped in-memory board-order
repair passed its regression and pointer/touch checks (three browser cases),
36 model/navigation/token/brand tests, full 466-test Vitest suite and typecheck.
PR #299 merged as `a5bd54391b7c7e410b20088b343943d1c94045ab` after all nine checks passed
on `6a8b6e8715c3c1bfdf5348c3ca5db6937a457627`. Reviews and review threads were empty;
the paging defect was repaired before the fresh CI run. Release/readback and
phone acceptance remain open. Live/postponed/cancelled status still needs a supported data
path; the queue keeps its source/time, missing/stale and privacy exit criteria.
These batches do not complete the whole stages.

The [game-sheet result batch](RESEARCH_RESULT_SHEET_2026_10_28.md),
`codex/research-result-sheet`, keeps a Final card's already permitted score and
provenance visible on opening, explicitly labelled Recorded when opened. Scoped
account/week/slate/game guards and an allowlisted result record keep quotes and
picks out of the context; paging uses each selected game's result. No extra
weekly read or URL/history persistence. The focused browser case, four 320px
theme/forced-color captures, full 466-test Vitest suite, 55 model/navigation/
modal/token/brand tests and typecheck passed. The first 72-case run passed 71 and
caught lost close-focus after a board refresh recreated the card. The scoped
return-key repair passed the focused correction/reopen case and all 94 expanded
final shell/Research/Lines/Trends/gesture cases. Brand QA and final fixture
build/privacy checks passed.
PR [#300](https://github.com/seanbalz/guess-the-lines-repo/pull/300) merged as
`7dda6d758a3218f1ec9286db4ce5ca901eb33444` after all nine checks passed on
`a1ea585719d2e2361d32a0b3eff4fceec9d2623d`. Reviews and review threads were empty;
no CI repairs were needed. Release/readback and phone acceptance remain open.

The [in-sheet result check](RESEARCH_RESULT_CHECK_2026_10_28.md),
`codex/research-result-check`, adds an explicit check through the existing
weekly reader. Direct started-game opens from Trends can request a final;
opening/paging/focus adds no read. Pending clicks deduplicate, changing games
aborts old reads, per-game observations remain scoped and errors retain their
labelled prior observation. Both focused browser cases, four 320px checked-result
theme captures, full Vitest (466), 59 result/navigation/model/modal/token/brand
tests and typecheck passed. All 95 final expanded shell/Research/Lines/Trends/
gesture browser cases, Brand QA and final fixture build/privacy checks passed.
The existing game reader is shared with the market section so current kickoff
eligibility works despite a stale personal-week clock, with one game request.
PR [#301](https://github.com/seanbalz/guess-the-lines-repo/pull/301) merged as
`327b8e83409c3b564bd652697ed54261fd8ac741` after all nine checks passed on
`c5573f099b120901df3f4112067fe8eaf73e04cf`. Reviews and review threads were empty;
no CI repairs were needed.
Release/readback and phone acceptance remain open. Live/postponed/cancelled
status remains separate work.

The [on-demand game details](RESEARCH_GAME_LOADING_2026_10_28.md) batch,
`codex/lazy-game-details`, keeps the frame and pager eager and loads its result,
market/research and notes content on opening, with local download/style retry.
The local initial static dependency graph is 25,622 raw bytes smaller (6,269
estimated gzip); after opening, total estimated gzip is 2,738 bytes larger.
Both focused browser cases, full Vitest (466), 59 model/navigation/modal/token/
brand tests and typecheck passed; the 97-case expanded browser run passed 96
cases and caught a Trends harness
reading section order before deferred content was ready. That assertion now
awaits those sections; all five final download/style/result/Trends cases passed.
Eight 320px theme/forced-color captures were inspected; Brand QA and fixture
privacy checks passed. PR [#302](https://github.com/seanbalz/guess-the-lines-repo/pull/302) merged as
`97c45a23e594e2490d3993c3266c8aa068012ab1` after all nine checks passed on
`bb96fa182bd1978640027ac18f535f0ec8cbeee2`. Reviews and review threads were empty;
no CI repairs were needed.
Release/readback, signed-in performance and phone acceptance remain open. This does not complete stage 33
live status or stage 34's dependent Bet/Challenge action slots.

The [weekly-trend recovery](RESEARCH_WEEKLY_TREND_RETRY_2026_10_28.md) batch,
`codex/research-weekly-trend-retry`, adds local refresh/retry in the game and All
trends sheets through the existing weekly reader. Controls retain focus through
loading, stale fallback, refusal and recovery; independent market locks remain.
The initial missing-control regression now passes, with eight inspected 320px
theme/forced-color captures, axe/touch checks, full Vitest (466), 35 shared
weekly-loader/state/token/brand tests and typecheck. All 98 expanded shell/
Research/Lines/Trends/gesture cases, Brand QA and final fixture privacy checks
passed. PR [#303](https://github.com/seanbalz/guess-the-line/pull/303) merged as
`d737a0c8deaee8ba81faef3144d89a284b65b69e` after all nine checks passed on
`d190fac6f18098ad25e3a766fa1e7e76be71072a`. Reviews and review threads were empty;
no CI repairs were needed.
Release/readback and phone acceptance remain open. No live-status or dependent
action-slot closure.

The [chart control names](RESEARCH_CHART_CONTROL_NAMES_2026_10_28.md) batch,
`codex/research-chart-control-names`, appends each visible trend title to line/
season slider and view-group accessible names, preserving the exact value
announcement and existing selection behavior. The name regressions failed
before and passed after implementation. Full Vitest (468), 27 chart-geometry/
token/brand tests and typecheck passed. All 98 expanded browser cases, final
fixture privacy and Brand QA passed. PR [#304](https://github.com/seanbalz/guess-the-line/pull/304) merged as
`c73f7230c8435c2770eb1f031d9595576e07b20c` after all nine checks passed on
`2db07ae00fd251f27335c9026823e2ac3909e3dc`. Reviews and review threads were empty;
no CI repairs were needed.
Release/readback and device/assistive-technology acceptance remain open.
GitHub’s canonical repository name
is now `seanbalz/guess-the-line`, verified against the unchanged repository ID;
the repository synchronization pointer is updated.

The [on-demand Fantasy view](RESEARCH_FANTASY_LOADING_2026_10_28.md) batch,
`codex/lazy-research-fantasy`, defers the existing detail view/styles within
Research, with static loading panels, stable route/retry focus and local code/
stylesheet repair. Initial static graph is 26,093 raw bytes smaller (6,267
estimated gzip); once opened, total estimated gzip is 1,311 bytes larger.
Both focused browser cases, eight inspected 320px theme/forced-color captures,
axe/touch checks, Vitest (468), 37 Fantasy-loader/ranking/token/brand tests
and typecheck passed. All 108 expanded browser cases, both final focused cases,
final fixture privacy and Brand QA passed. PR [#306](https://github.com/seanbalz/guess-the-line/pull/306)
merged as `3387457f69d0724c3faf04a51c552fe151df4fb1` after all nine checks passed
on `25236cc486b81bd3b34697c635b6348c660e69fd`; reviews/threads were empty and
no CI repair was needed. Release/readback, signed-in performance and phone
acceptance remain open. Q12–Q14's old branch-only wording is corrected: their
existing tools merged in PR #269 as `a6d655ed03b375e48b5159a70dd82ecd2b0030fb`.
Their feature-specific release/readback and device acceptance remain separate;
this batch adds no Fantasy feature or integration.

The [on-demand full Research sheet](RESEARCH_SHEET_LOADING_2026_10_28.md) batch,
`codex/lazy-matchup-research`, keeps its frame eager and loads the existing full
view on opening, with local code retry, stable focus and no view
read while held. Inline game research moves to its own module; its body and the
full view's markup are unchanged. Shared CSS stays eager after a regression
exposed cross-view style recovery coupling. The pre-D-65 asset measurement
found an initial graph 21,391 raw bytes smaller (6,229 estimated gzip);
total estimated gzip is 2,211 bytes larger after full Research opening, or
597 bytes larger for a game-first journey, with one additional game-detail
asset. Focused loading coverage, eight inspected 320px
captures, axe/touch checks, Vitest (468), 56 chart/shell-state/modal/gesture/token/
brand tests and typecheck passed. All 110 broad cases passed before retaining
shared CSS eagerly; five final focused Research/recovery cases and final
game-detail stylesheet/inline-research checks passed after that adjustment.
Final fixture privacy and Brand QA passed.
PR [#310](https://github.com/seanbalz/guess-the-line/pull/310) merged as
`06a4de7e4513e04fd2555b734045d09756bc2518` after all nine checks passed on repaired
head `6f5e324d2cd69772b47ae9fb88d39d125522c334`; reviews/threads were empty.
The repair waits for authenticated Main navigation and integrates D-65’s current
entry flow in the Research/Trends/gesture/style-recovery fixtures. Release/
readback, signed-in performance and phone acceptance remain open. No stage 33
live-status or dependent slot closure.

The [readable season-table batch](RESEARCH_SEASON_TABLE_2026_10_28.md),
`codex/research-season-table`, retains 16px record/percentage/unit text at narrow
widths, with native table semantics, a trend-named keyboard scroll region and
shared focus treatment. Year selection and chart synchronization remain.
Its 320px regression failed against the old 13px rule. Both focused browser
cases, 24 inspected 320/390px theme/forced-color start/end captures (including
simulated 200% table text), axe, Vitest (469), 27 chart/token/brand tests,
typecheck, Brand QA and fixture privacy pass. All 109 final current-app browser
cases pass after the authentication-readiness repair and D-65 integration. The additional 37 app-view/shell/router and 21
Fantasy API/publish checks pass. PR [#313](https://github.com/seanbalz/guess-the-line/pull/313)
merged October 28 as `9eadb74370ff819496ba5457059f5b643a99e9da` after all
nine checks passed on `81c9286825151e1a725d367ea4b60cb0a5a0c288`; reviews
and threads were empty, with no failed checks requiring repair. Release/readback
and device acceptance remain open.

The [readable Research evidence batch](RESEARCH_EVIDENCE_TABLE_2026_10_28.md),
[PR #321](https://github.com/seanbalz/guess-the-line/pull/321) on
`codex/research-evidence-table`, brings historical records/game counts/units to
16px numeric text with meta headers, native horizontal scrolling and candidate-
named table/period controls. Raw records, units and chart selection remain.
The 320px regression fails against the old 13px style; Vitest (470), 27 chart/
token/brand checks and typecheck pass. All 17 Research/style-recovery and five
nearby Lines browser cases pass, as do Brand QA and final fixture privacy.
Twenty-four captures were saved and six representative theme/forced-color/
enlarged-text screenshots were inspected. Own CI/merge, release/readback
and device acceptance remain open.

Sean's October 28 [Bet Labs example and trend-discovery follow-up](RESEARCH_TREND_DISCOVERY_2026_10_28.md)
is tracked in Q21. The existing engine reproduces a 12–0 recent Bryce Young
ATS sample after a team loss from checked-in history through October 11; the
full sample is 17–11–2 and the earlier sample is 5–11–2. This is an offline,
retrospective calculation, not current market verification or a new predictive
signal. QB-plus-situation discovery, builder filters and verified upcoming
applicability remain unimplemented; chart delivery does not close that work.

Q17-C remains open. Community Members merged in
[PR #211](https://github.com/seanbalz/guess-the-lines-repo/pull/211) as
`36024875d7a04b01eaafc2bc3d46b3625538d16e` after all nine checks passed.
Manual Settlement is in [PR #214](https://github.com/seanbalz/guess-the-lines-repo/pull/214).
It does not close M-18 challenge grading or M-19 scheduled settlement/status.
M-19's shared-ticket part (D-64, approved October 28): automatic settlement of pending Bet Tracker tickets after the game's
Pacific day, called by the existing results worker, plus a one-time backfill for Week 7 and earlier, is written in
`20261028120000_gtl_social_auto_settle.sql`, applied by Sean in the SQL editor with the backfill run, and live with `gtl-results-refresh` deployed from `42329566` (see the [release card](RELEASE_2026_10_28_AUTO_SETTLE.md)).
Challenge settlement (M-18) and a status reader remain open.
Week opening is the next commissioner page after the current design focus.
The [preservation matrix](REDESIGN_PRESERVATION_2026_10_26.md) still identifies
history, export, journal, older-record and recovery gaps. Keep one implementation
lane at a time; new Fantasy integrations, simulator work and native iOS remain
later scope. The broader redesign and measured performance work are unfinished.

History and export (Q17-C, stages 72–75) is in parallel review. Stages 72–73 are on
branch `claude/redesign-history`: M-27 (`20261026230000_gtl_me_history.sql`), the
`/me/changes` and `/me/records` routes, and Me › History with Guess and Bets weeks.
M-27 is written and not applied; its routes await Sean's "apply M-27" and a
gtl-api deploy. Local PGlite, handler and browser checks are recorded in its PR;
they are not hosted or phone evidence. Stages 72–73 are [PR #232](https://github.com/seanbalz/guess-the-lines-repo/pull/232).
Stage 74 (History › Older records, read-only, no migration of its own) is
[PR #235](https://github.com/seanbalz/guess-the-lines-repo/pull/235), on branch `claude/redesign-history-older`.
Stage 75 (Export my data) is on branch `claude/redesign-export`: M-28
(`20261026231000_gtl_me_export.sql`, apply after M-27), `/me/export` and Menu ›
Export my data, written and not applied.

## Trend builder (D-63, approved October 28)

Built on `claude/trend-builder`: Trends › Build, honest result card, this week's matches and per-device saved
trends with a Home indicator ([TRENDS.md](TRENDS.md#trend-builder-and-saved-trend-matches--proposed-d-63-october-28-2026)).
Frontend only; merged in PR #285 (`c091ec0`) and live in Pages `0f9312bf` (release run 40691552196). D-63 approved by Sean October 28.

## Research nesting cards (D-66, chosen October 28)

Sean chose option 1, Nesting cards, from five options on the comparison canvas. See the
[design spec](superpowers/specs/2026-10-28-research-nesting-cards-design.md). The first rollout is on branch
`claude/research-nesting-cards`: Trends › Teams becomes Teams › team › trend.

- **Layers:** each team shows its venue record and a meter. Each team layer holds that team's own rows, its coach
  and QB rows, and its bound situational cards. An opened trend shows the big record and its tags, or the D-55
  chart, with the windows behind a disclosure.
- **Navigation:** stacked lips go back up a layer, back closes one layer, and every layer has its own address. A
  trend's address is a hash, never its key.
- **Fine print:** the footnote, freshness and credits move behind ⓘ.
- **Evidence:** the cloud-browser Trends case runs the three layers at 390px and 320px, with axe and the overflow
  check. Eleven component and navigation tests cover the mapping, the locks and the addresses.
- **Not done:** the real-phone check. This Week, Explore games, Build and Fantasy followed one PR each, below; this
  rollout was released October 28 with Players and This Week.

**Second rollout: Trends › Players**, on branch `claude/research-nesting-players`, stacked on the Teams branch. The
layers are:

- Players, one tile per member with points per game, viewer first, plus a This week tile.
- One player: points, market error, strength gap, record at saved line, and By team.
- One measure: its weekly chart and the contributing games.
- By team › one team: the team-oriented gap chart, the record, and the for/against tiles.
- One direction: the record, recent and earlier, the games and this week's same-direction guesses.
- This week › one game: the median, above/equal/below, and the distribution.

These layers replace the Player team and Player matchup filters and the "Compare history windows" panel; the
history window stays as one select. The seven Players browser cases run the new path at 320px and 390px, in light,
dark and forced colors, with axe. Released October 28 with Teams and This Week; no real-phone check yet.

**Third rollout: Trends › This Week**, on branch `claude/research-nesting-week`. Its layers are This week › one game
› one trend.

- **The first card** holds:
  - the evidence freshness line, with its "Source details";
  - the saved-trends tile, which opens Build;
  - the top three trends, each opening its game and trend;
  - a tile per published game, showing its logos, how many trends are open and a lock when the market is closed.
- **A game** lists its trends, or a lock tile while the market is closed, plus Game details. A trend is the same
  innermost card as on Teams.
- **Removed:** the Team and Matchup filters and the always-open "Matchup evidence" lists.
- **Shared code:** `TrendLayer.jsx` now holds what Teams and This Week share: the tile, the lock tile, the opened
  trend and its address.
- **Not done:** the real-phone check.

**Released October 28** with Teams and Players: frontend from `4564fff`, Pages `a78d867c`, verified at 01:03:10 UTC
on October 29. The [release card](RELEASE_2026_10_28_RESEARCH_NESTING.md) holds the evidence and the signed-in readback.

## Recommended bets stay on Recommended (player feedback, October 28)

A player asked to keep loading recommended bets without being sent to My bets. PR #315, from
`claude/quizzical-ritchie-2b5da5`: Track this bet now opens the tracker's review editor over Recommended
(`SocialBetTracker` `reviewOnly`), so the market choice, scroll position and open card stay put. A save shows
"Bet saved to My bets" with a View action to that ticket's week. Failure and uncertain-save recovery stay in the
editor; the review and the Virtual Units card keep separate draft guards. Unit test `tests/next-bets-review.test.jsx`;
browser test in `tests/cloud-browser/recommended-bets.spec.js` saves two in a row at 390 and 320 px. Merged October 29
(00:27 UTC) and released in the frontend from `4564fff` (run 40797726894, 01:00 UTC); no signed-in or real-phone
check recorded.

**Fourth rollout: Explore games**, on branch `claude/research-nesting-games`. The board said the same source and
update line under every card, 28 lines and about 390 of its 800 words on the live board. It now says them once: the
update time in the header’s one meta line and the source behind its ⓘ. Each game sheet keeps its sources, books and
times. The “Current line” and “Latest recorded line” labels and final-score provenance stay on the cards, and so
does the card’s screen-reader sentence. PR #332, released October 29 in Pages `5f242880` from `1998e4c` (run
40812649921, card #346; the deploy step succeeded and its post-deploy verify timed out, see
[the M-11 record](RELEASE_2026_10_29_M11.md)). No real-phone check yet.

**Fifth rollout: Trends › Build**, on branch `claude/research-nesting-build`. The result card leads with the
record as one big W-L-P and a cover meter. Cover rate, Wilson 95% interval, sample and “Illustrative units at -110”
become tiles, and “By season” moves into a disclosure. The paragraphs that repeated the card’s ⓘ (the label’s
explanation, the period-split note, the reference note, the line source and the history credit) move behind it. D-63’s
visible labels and the period table stay. Nesting cards now enter with a short slide only, with no fade or scale,
because checks caught text mid-fade below its contrast. PR #336, released with the fourth rollout in Pages
`5f242880` from `1998e4c`. No real-phone check yet.

**Sixth rollout: Research › Fantasy**, on branch `claude/research-nesting-fantasy`. The new-app `FantasyNest.jsx`
replaces the wrapped old `FantasyFootball` rankings; the same `shared/fantasy-*` engine, reads and gates stay.

- **Rankings card:** one meta line, then period, season, week, scoring and position. The other filters sit under
  “More filters”, and tiles open the report card and Compare. Each ranked player is one tile with one big estimate.
- **Player layer:** the estimate, trends as tiles, the matchup behind a disclosure, and the profile and compare tools.
  The method, scoring, sources and trend sentences sit behind ⓘ.
- **Lips now go back:** a lip that returns to the place just before goes back instead of adding a step, in every
  nesting card, so Back after a lip leaves the section.
- **Released** October 29: PR #343, in Pages `58fd60f1` from `25b5f3c` (run 40818790945, card #351, 104 assets
  checked).
- **Not done:** the real-phone check.

## M-11 Virtual Units placement (Q06, stage 41, October 28)

Sean chose Q06 next. Stage 41 is written on `claude/q06-m11-placement`: M-11
(`20261028181000_gtl_bets_place.sql`: `gtl_bet_receipts`, `gtl_place_bets`, `gtl_bets_newest_quote`, `gtl_bets_terms`) and
`POST /bets/place` with the `bets-place` off switch. PGlite and handler checks in `tests/bets-place-sql.test.mjs`
cover a two-bet slip, an edit with audit, replay, line lock, half units, a stale quote, kickoff, a Guess autosave
with no 409 and an old `/virtual-pick` edit giving "This bet changed". **Applied and deployed October 29:** PR #334
merged, `/bets/place` deployed from `1998e4c`, then M-11 applied on Sean's "apply M-11" as hosted `20261029041843`.
See [the M-11 record](RELEASE_2026_10_29_M11.md).

Stages 43–44 (D-67) are on `claude/q06-bets-place-ui`, stacked on M-11: Bets › Virtual › Your picks is the
account-level placing screen (`web/src/next/bets/place.js`, `PlaceBets.jsx`) with the slip in the dock. Unit tests in
`tests/next-bets-place.test.jsx`; the browser case in `tests/cloud-browser/next-bets-live.spec.js` places two bets,
confirms a lost reply without a duplicate, edits, refuses a bet changed elsewhere and fits 390/320px in both themes.
PR #340 merged October 29 and was released after the M-11 apply, in Pages `58fd60f1` from `25b5f3c` (run
40818790945). Signed-in placement on a phone is not recorded.

## Native Odds connection (redesign stage 78, October 29)

Branch `claude/native-odds-connection`: Menu › Commissioner tools › Odds connection is now a native page
(`web/src/next/me/commissioner/OddsConnection.jsx`) instead of the old `ManualOddsControls` inside the adapter. The rules
are unchanged and shared with the old editor through `web/src/oddsConnection.js`: a zero-credit check must measure at least
52 free credits before a fetch is allowed, a request that has not finished keeps its request ID so checking again never
starts a second one, and only counts are shown, never the provider key or a market value. Same routes (`/odds/preflight`,
`/odds/collect`) and the same original-Triple-Threat-commissioner gate. Week opening, status and referees were already native
(#316). Final scores is the last stage 78 page still on the old editor.

- **Evidence:** `tests/odds-connection-rules.test.mjs`; `tests/next-commissioner-ui.test.jsx`; the cloud-browser
  `next-commissioner.spec.js` drives a pending check, a low-quota check, a good check and a fetch at 390 and 320 px in
  light and dark, with axe and the phone-layout check, and confirms a reply's market value never reaches the page.
- **Released** October 29: PR #357, in Pages `452d9304` from `76329b7f` (run 40887118540, card #362, 124 assets
  checked).
- **Not done:** no signed-in hosted check and no real-phone check.

## What needs Sean

- Complete the named phone, notification, second-device and live-week acceptance
  checks when their source/release prerequisites are ready.
- Reconfirm the superseded D-51 ideas in Q05 only when that lane is reached.
  They do not block the approved redesign now.
- A production release/cutover is a distinct action with its existing preservation
  and release gates. This implementation audit does not claim one occurred.

No additional palette, navigation or chart-direction answer is needed to continue.

## October 29 NBA visibility and EPL reconciliation

Sean requested hiding NBA and deploying all EPL work. NBA is removed from the NFL/EPL sport switch; existing NBA ticket links and records remain available. [Earlier release evidence](RELEASE_2026_10_29_NBA_EPL.md) and the [completed moneyline release](RELEASE_2026_10_29_EPL_MONEYLINE.md) supersede older not-deployed entries. M-32/M-36 and the live weekly DNB gate are verified; API v43, worker v3, Home/Play/leaderboard screens, approved collection and signed-in readback are delivered. Remaining timed/concurrent/kickoff/device and M-33/M-34/M-35 operation gates stay explicit.

## EPL moneyline combined source acceptance — October 29

API, durable shared collection and shared-shell moneyline/leaderboard screens are implemented and locally
verified together: 534 Node/SQL checks, 89 component checks, ten actual-service flows and six full-page
Axe analyses passed. [Composition, evidence and release limits](EPL_MONEYLINE_ACCEPTANCE_2026_10_29.md).
Home includes own locked-match progress and a working moneyline shortcut; saved/reference values use the existing glass tokens.
M-36 is applied as hosted `20261029183135`: six exact private invoker functions, two empty private RLS tables,
all 32 prior EPL functions and 17 data/scoring sets preserved at apply, and eight strict live denials.
The moneyline job is enabled every 15 minutes; protected worker/API/frontend releases and live readback passed.
Fourteen strict moneyline privacy probes and all 125 served asset hashes passed; natural production lock-ins later
produced ten captures/references with consistent distance calculations. Timed checkpoint, live shared/concurrency,
kickoff/full-cycle and physical-phone moneyline acceptance remain open. See the production release record for dated scopes.

## Research formatting remains separate — October 29

Sean reported persistent formatting, especially Trending. [Issue #388](https://github.com/seanbalz/guess-the-line/issues/388)
distinguishes the screenshot-observed Fantasy full-width/gutter defect from Trending details needing reproduction.
The UI workflow owns [PR #389](https://github.com/seanbalz/guess-the-line/pull/389), whose source has merged;
Redraft owns its separate frontend release and physical-phone verification. This moneyline batch includes no formatting fix
and does not close that acceptance. Shared-shell navigation/phone checks also do not close it.


## League and National Football League action composition port — November 7, 2026

Owned unpublished branch `codex/prism-league-actions-20261107` ports the selected
League standing/board/feed/result/comment hierarchy and scoped native action
spacing, with real readers/writers and privacy/accounting unchanged. The
[implementation and limits](PRISM_LEAGUE_ACTIONS_NATIVE_2026_11_07.md) link native
capture hashes, full-page and scrolled-sheet checks, long names, keyboard
scrolling, both phone widths/themes and forced colors. The optional read-only
Sheet-body tab stop fixes keyboard access exposed by the long-thread check.
The complete 106-action visual matrix, finer Virtual Units compatibility, shared
header/dock decision, independent review, integration and hosted/phone acceptance
remain separate work; this entry does not close them or claim deployment.
## Native Account, access and recovery Prism port — November 7, 2026

Areas 19–28 are implemented locally on the exclusive unpublished branch
`codex/prism-account-recovery-20261107`, based on integration
`35ae5fc6c7dfa9d87ff22a3797b11c369a409590` after a fresh `origin/main` fetch.
The [area record](PRISM_ACCOUNT_NATIVE_2026_11_07.md) maps the approved selected
review at `3ac2eb50513ba73447ef890e4a47863cde7bdd76` to native cards, graphics,
forms, sheets and controllers. [Evidence](../design/prism-account-native-2026-11-07/evidence.json)
contains 190 native capture hashes for 38 states and exact approval-reference
hashes. Local verification passed 903 Vitest tests, 63 Node/PGlite contracts,
the strict auth visual-bridge contract, 8 new native browser matrices, 23
existing controller/provider browser checks and 11 targeted recovery/access/
keyboard/continuity checks; typecheck, Brand QA, cloud build and bundle-only
privacy scan passed. The separately known baseline Bets boundary/loading failures
remain assigned to the integration owner; this entry does not claim full CI.

Actual Profile/settings/version checks, device reminder permission/subscription,
owner-only export, provider/recovery/name handling, and private league create/
join/invite/access/retention gates remain operational. The selected generic
public app invitation now uses explicit native sharing/copy and manual fallback
without account, recipient or league payload fields. The auth entry imports only
the three documented selected visual assets/styles; the boundary remains strict
for all other imports. Shared header/dock structure is held, Community/FEPL access
remains, and History/scorecard, new avatars/awards, NBA/Signal, API/SQL/provider and
hosted data are outside this work. No push, PR, merge, migration, deployment or
physical-phone acceptance is claimed; the task worktree is preserved for review.


## Account Prism review correction — November 7, 2026

Local fix on exclusive `fix/prism-account-visual-fidelity`, from integration
`b5dea82d89029f644f504e436b610b215f7ea939` plus Account dependency
`8cc6f349afa88cce4777446f2e347d67bddd3182`; parent independent review remains open.
The [area correction](PRISM_ACCOUNT_NATIVE_2026_11_07.md#review-correction-actual-themes-and-scoped-cascade--november-7-2026)
explains why direct dataset captures left preference/legacy variables stale.
The [corrected evidence](../design/prism-account-native-2026-11-07/evidence.json)
supersedes the original 190 captures and adds 64 category-wide captures: 254
images, 38 states, actual themes, 320/390px phone checks and 768/1440px
representatives. Scoped Account/Switcher backplates and auth cascade collisions
are corrected; Guidance now uses approved topic icons and actual-source hints.
All original guidance copy/links and auth/provider/profile/export/push/invite
controllers remain. Native type floors are retained: 13px sentence-case meta,
16px explicit reading/actions/inputs; gx-auth aliases and explicit font weights
satisfy all 15 unchanged native-token checks and the strict auth bridge. Fresh nine-matrix browser, 68-component and 51-Node checks,
typecheck and Brand QA passed. The existing Google/Profile suite passed 14
cases (23 unique browser cases overall), followed by successful cloud build
and bundle-only privacy verification; evidence is in the manifest. No hosted, phone, full-app or release acceptance, push, PR,
merge or deploy. Shared-frame placement and the held exploration areas remain
separate. Prior dependency checks above are historical, not rerun totals.


## Commissioner native Prism layouts — November 7, 2026

Local branch `codex/prism-commissioner-2026-11-07` ports rollout areas 29–34:
member access decisions, weekly operations, referee drafts, final-score review,
count-only odds controls and read-only Premier League correction comparisons.
[Scope, safeguards, checks and limitations](PRISM_COMMISSIONER_NATIVE_2026_11_07.md)
link the source/capture hashes and native controller-state evidence. Existing
authorization, concurrency/readback, free-quota, schedule/source and grading
gates remain; the busy final dialog also retains keyboard scrolling while its
actions are disabled. Independent review/integration and physical-phone/hosted
acceptance remain separate. No push, PR, merge, deployment or migration apply.
