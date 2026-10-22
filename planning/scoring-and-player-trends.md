# Guess The Line — scoring and player trends backlog

Owner: Sean Balsiger · Version 5 · October 15, 2026

Status (rechecked October 22): core scoring has been live since October 19; weekly and player Trends (PR #166) deployed October 22 as API v31 / Pages `af617cd2`, with its CPU fix in API v32.
No delivery dates are committed. Current implementation owners and verification
state are recorded in the active checkpoint below.

## Approved weekly and player Trends — October 21

Core scoring is now applied and verified; see the [production release record](../docs/CORE_SCORING_PRODUCTION_RELEASE.md). Sean approved the [weekly and player Trends design](../docs/superpowers/specs/2026-10-21-weekly-player-trends-design.md), extending the earlier accuracy/bias scope with actual-outcome evidence and current permitted guesses. The [Trends release record](../docs/WEEKLY_PLAYER_TRENDS_RELEASE.md) tracks implementation, review and release separately. Earlier discovery questions below are historical where this design or D-53 supplies the answer; optional recaps, saved rival views and private journals remain separate scope.

The approved defaults use mean miss and signed bias with exact samples, recent and multi-season windows, and small-sample descriptions. Recurring directional records require five decided games across three competition weeks, with exact W-L-P and uncertainty. Player profiles remain within the selected Community/private roster and existing game/market reveal gates. None of these records changes competition scoring or establishes profitability.

## Approved follow-up — October 16

D-53 resolves comparison audience, time windows, sample rules, Home structure,
account preferences and the staged wager/Fantasy scope. The first-release plan was
explicitly approved in this chat. See [the current release record](../docs/HOME_COMPARISONS_RELEASE.md)
for implementation evidence and [D-53](../docs/DECISIONS.md) for the complete rules.

The earlier Q-03 onward discovery wording below is historical where D-53 answers
it. All-player games require the owner plus at least one other eligible revealed
score; explicitly selected players use a strict intersection. Both benchmark forms
include the owner. Per-team bias metrics and ranked model-based wagers remain
separate follow-ups; the implemented trend chart shows points/game and samples.

## Active implementation checkpoint — October 15

Sean requested “Continue with recommendations” after the prioritized status review.
Work is isolated on `codex/per-game-scoring`, based on `main` at `e5dfda1`.
Codex owns the core implementation and verification, with parallel SQL, UI and
independent review lanes. This is not a release authorization or a hosted change.
The original working checkout and its planning edits are preserved.

| Scope | Current owner | State | Evidence / exit |
| --- | --- | --- | --- |
| 01–02, 08: locks, immediate personal scores, shared standings | Codex SQL and API lanes | Live October 19: M-02–M-08 applied and verified | M-07 migration and adversarial SQL/engine/API tests; [production release](../docs/CORE_SCORING_PRODUCTION_RELEASE.md) |
| 03–05: receipt, weekly scoring, filters | Codex UI lane | Live October 19; phone acceptance pending | Shared per-game editor; weekly score page; mobile/theme/recovery tests |
| 09: core acceptance | Codex integration and independent review | Live October 19; real-phone and multi-account acceptance pending | [Release checklist](../docs/PER_GAME_SCORING_RELEASE.md); [production release](../docs/CORE_SCORING_PRODUCTION_RELEASE.md) |
| 06–07: player Trends metrics and charts | Codex and Claude Code (PRs #166, #180, #182) | Deployed October 22 (API v31 / Pages `af617cd2`; CPU fix API v32); real-phone acceptance open | [Trends release record](../docs/RELEASE_2026_10_22_TRENDS_FILTER.md) |

The task table below expands this checkpoint. The pre-implementation evidence
section preserves its dated source snapshot; no row is released until the hosted
evidence and required acceptance exist.

## Confirmed scope

Source: the preserved local planning record of Sean's October 15 request,
reconciled as D-50 in [DECISIONS](../docs/DECISIONS.md). One game's Spread and Total lock independently.
A locked-in guess cannot be changed, removed, replaced or re-anchored by another
save. Its available scoring reference establishes its points at lock-in, and those
points appear immediately in the player's score for that competition week. Each
locked-in game counts even if the rest stay drafts (D-41). Spread and Total remain
separate competitions; football final scores and Bets settlement are separate.

Sean also requested easy weekly scoring access, week/team/game filters, a player
Trends page, and targeted questions to identify useful additions. Sean confirmed
accuracy and bias as the page's primary purpose (Q-01): whether guesses improve,
which teams a player consistently misjudges, and whether guesses run too high or
too low, with each insight linked to its contributing games. Exact metric
definitions, comparison windows and audience were open on October 15; D-53
and the October 21 Trends design later answered them (Q-03a–Q-04 below).

Q-02 is confirmed: personal weekly points update immediately; shared weekly and
season standings count each game at its kickoff, using the same started games for
everyone, including the owner's leaderboard row. Label “Your weekly points”
separately from “Standings · games started” and show the own contributions waiting
for kickoff. Other players' per-game scores follow the existing game/market reveal
permissions. This changes standings inclusion, not the saved reference or points.

D-27's no-line case remains explicit: lock-in succeeds with a pending reference;
points read “Waiting for scoring line,” never a fabricated zero. The existing
permitted resolver can establish the first qualifying reference before kickoff.
Later market movement never replaces an established scoring reference. Existing
historical and commissioner-ruled evidence stays intact.

## Reconciliation and source provenance — October 15, 2026

This backlog preserves the local planning work found on checkout
`e5a45f6d73e66505841044f532f4ed644576f635`, including its recorded Q-01 answer.
Two source versions were preserved:

- Initial version 2, SHA-256
  `b7a7962a73fccb92059e573b5fcbada05e5cd35d35c0f0f93f0e0a654242e9a9`.
- Follow-up version 3, captured October 15 at 16:19 UTC, SHA-256
  `1a4ae6479f9c5ca7ad7f9762789cabc68f357e00b4e2ce2889f96b3c49dd6bc2`.
  It records Q-02 as confirmed and splits Q-03 into three focused questions.

The original checkout remained active after the first snapshot; these captures
do not claim to include any edits made there after the follow-up capture.
The source files and patch were preserved in an ignored local recovery snapshot
before reconciliation; the original checkout was not edited by this step.
This review did not retrieve the original conversation or the private Status Board.
The quotations and approvals in this document are attributed to that preserved planning
record, not a newly inspected transcript or a new approval in the sync request.

The local record used D-47. That number is already reserved by the weather-schedule
draft (PR #123); D-48 is the recommendations decision, and D-49 is referenced for
proposed Lines tables in the October 14 release record. The scoring entry and its
cross-references are therefore D-50. No scoring or weather requirement was combined
or discarded to resolve the identifier collision.

## Repository evidence at the pre-implementation reconciliation

Evidence was checked against `main` at `1df92bd59cfb6af0a2a64c1d9fa6925b8caa244d`.
This is a source review and review of recorded releases, not a fresh hosted audit.
The latest dated release records Pages `ed3fb50b` / API v24 from `b883c77`; this
reconciliation does not change that deployed source or activate pending migrations.

| Finding | Evidence | Consequence |
|---|---|---|
| M-02 implements per-game lock enforcement through both writers and a direct-update trigger; it is listed as not applied | `supabase/migrations/20261015030000_gtl_sent_picks_final.sql`; `tests/guess-write-rules-sql.test.mjs`; `tests/migrations.mjs` | Finish and verify the existing lock work; do not build a second lock model |
| The October 15 release preserves hosted M-01 with `sentFinal: false` and `lateWindow: deadline`; M-02 remains unapplied | [Latest release record](../docs/RELEASE_2026_10_15_RECOMMENDATIONS.md#preserved-state-and-live-readback); [completion register](../docs/COMPLETION_REGISTER.md) | A rule in the docs is not evidence of live enforcement; the D-48 recommendations deployment did not apply the pending scoring migrations |
| M-02's interim partial ballot does not score until the market is complete; D-41 assigns per-game scoring to stage 24/M-07 | [D-41 and D-43](../docs/DECISIONS.md); [build plan](../docs/REDESIGN_BUILD_PLAN.md) | M-07 is listed as unbuilt in the completion register and its migration is absent from the reviewed source; it must implement the immediate timing below |
| M-01, M-06 and M-08 readers gate points on kickoff; API/UI logic repeats that timing | `supabase/migrations/20261014223000_gtl_guess_gate_per_game.sql`; `20261015010000_gtl_lines_read.sql`; `20261015020000_gtl_guess_picks_reader.sql`; `cloud/community.mjs`; `web/src/CommunityHistory.jsx`; `web/src/next/rules.js`; `tests/next-rules.test.mjs` | D-50 changes personal and permitted per-game score timing across readers and screens, not only the Submit button; Q-02 retains kickoff timing for shared standings |
| The new Play module has slots/counters, but the per-game entry screen is not present | `web/src/next/play/index.js`; stages 28–31 | Complete those stages and connect the scoring receipt |
| History offers player/season browsing; dashboard matchup filters only change selected charts | `web/src/CommunityHistory.jsx`; `web/src/DashboardMatchupFilter.jsx`; stages 57–58, 67, 72–73 | Reuse the readers and controls, add a coherent scoring destination and filter contract |
| Existing trends describe NFL game situations, not an individual player's guessing performance | [TRENDS](../docs/TRENDS.md); `web/src/TrendsPanel.jsx` | A player Trends page is distinct from matchup trend cards |
| The old project tracker is explicitly frozen at v62 | `planning/project-tracker.json`, `frozen` field | This is a repo backlog supplement; the private Status Board was not accessed or updated |

## Task register

Updated October 15, 2026 for the isolated implementation workstream; states
rechecked October 22 against the [core scoring](../docs/CORE_SCORING_PRODUCTION_RELEASE.md)
and [Trends](../docs/RELEASE_2026_10_22_TRENDS_FILTER.md) release records. Codex owns the
core code and local checks; Sean owns product decisions and release approval.
Owner “TBD” is an assignment gap for later work. P0 means correctness/privacy before
release; P1 means the requested experience. Both releases still await real-phone
acceptance; other open checks are noted per row.

| ID | Priority | Task | State | Suggested lane / owner | Dependencies | Target |
|---|---|---|---|---|---|---|
| SCORE-NEXT-01 | P0 | Finish permanent per-game lock-in across every save path | Live October 19 (M-02–M-08 verified); multi-account write acceptance pending | Codex SQL/API/UI | Existing stages 15, 18, 24–25, 28–31 | Not scheduled |
| SCORE-NEXT-02 | P0 | Count available per-game points immediately at lock-in | Live October 19; a signed-in check confirmed immediate points | Codex SQL/API | SCORE-NEXT-01; stage 24/M-07; SCORE-NEXT-08 for shared reads | Not scheduled |
| SCORE-NEXT-03 | P0 | Show a durable lock-in receipt and refresh weekly scoring | Live October 19; device acceptance pending | Codex UI/API | SCORE-NEXT-02; per-game entry | Not scheduled |
| SCORE-NEXT-04 | P1 | Add a clear weekly scoring destination and navigation | Live October 19; visual/device acceptance pending | Codex UI | SCORE-NEXT-02/03; stages 57–58, 72–73 | Not scheduled |
| SCORE-NEXT-05 | P1 | Filter scoring by season, week, market, team and matchup | Live October 19; visual/device acceptance pending | Codex UI | SCORE-NEXT-04; canonical game identity | Not scheduled |
| SCORE-NEXT-06 | P1 | Define and compute accuracy and bias metrics from scored guesses | Deployed October 22 in PR #166 (October 21 Trends design); Week 8 publication on October 26 to be confirmed | B + E / TBD | SCORE-NEXT-02/05/08; Q-03a–Q-03c | Not scheduled |
| SCORE-NEXT-07 | P1 | Build the accuracy and bias Trends page with drill-down evidence | Deployed October 22 in PR #166; signed-in real-phone check open; private-league views await the D-53 reader | A + E / TBD | SCORE-NEXT-06; Q-03a–Q-03c, Q-04 | Not scheduled |
| SCORE-NEXT-08 | P0 | Implement confirmed shared score visibility and protect hidden games | Live October 19; multi-account acceptance pending | Codex SQL/API/review | Existing D-39 reveal gates; Q-02 confirmed | Not scheduled |
| SCORE-NEXT-09 | P0 | Verify core scoring first, then Trends in its own release | Core live October 19; Trends October 22 (CPU fix API v32); device acceptance remains | Codex integration | Core: 01–05/08; Trends: 06–07 when ready; existing release gates | Not scheduled |

### SCORE-NEXT-01 — permanent lock-in

- Reuse the server's per-account/season/week/game/market identity across groups.
  Drafts remain editable only while allowed. Locking Spread never locks Total.
- Refuse changed values, removal, clearing a lock, reference replacement and
  stale draft overwrite through every RPC, direct update, old app and new app.
  Repeating the same request cannot count twice or refresh the scoring reference.
- Handle stale tabs, a second device, concurrent autosave/lock-in and a lost save
  response. Read back the committed state before describing an uncertain save as
  successful; keep the user-entered draft available while the outcome is unknown.
- Exit: server rejection plus matching read-only UI are demonstrated across these
  cases; D-27 reference resolution still works and preserves the guess/lock time.

### SCORE-NEXT-02 — immediate points, independent of kickoff

- The successful server lock captures the guess, lock time and server-selected
  reference atomically. Reuse the canonical scoring function and eligibility rules.
- A single eligible locked-in game with a reference contributes its points before
  kickoff and before the other games are locked to the player's personal score.
  Other-player per-game points follow the existing reveal permission; shared
  weekly/season standings wait for that game's kickoff (Q-02). Update readers and
  projections to distinguish these scopes, including Lines, Everyone's picks,
  History and group views; retain kickoff filters on shared standing aggregates.
- Distinguish draft, locked/pending-reference, locked/scored, ineligible and skipped.
  A real scored zero is valid; missing evidence is not zero. Show scored count,
  locked count and remaining games beside week totals. Sit-out keeps prior scores.
- Save receipt, personal weekly summary, History and future trends must reconcile
  exactly for the same scope; the shared board reconciles to started games only.
  Later quotes do not change established points. A permitted pending resolution
  adds points once and retains the original guess/lock timestamp and audit.
- Exit: one pre-kickoff lock changes the player's weekly total immediately; repeated
  reads/retries do not add it again, and unrelated markets/weeks remain unchanged.

### SCORE-NEXT-03 — receipt and state refresh

- Show “Locked in” plus the guess, reference value/source/time, error and points,
  or the pending reason, with a direct link to that week/game's scoring detail.
  Keep the compact receipt within the design guide's information limits.
- Refresh affected score, progress, History and permitted board data after confirmed
  success. A pending reference resolves on the next successful read without another
  lock-in. Do not report fabricated instant success during an offline/uncertain save.
- Exit: receipt and refreshed/reloaded weekly detail agree, including when a user
  submits last week's Monday game after a new competition week has opened.

### SCORE-NEXT-04 — weekly scoring destination

- Make the current week's scoring one tap from Home and reachable after lock-in,
  from League and from History. Preserve the existing five-tab architecture.
- Separate Spread and Total; show points, scoring coverage, progress and a game
  breakdown. Explain points from the saved line, separately from NFL results.
- Offer previous/next week and an explicit season/week selector; keep historical
  weeks discoverable without scrolling through every ballot. Missing weeks and
  pending scores get explicit states, not empty charts or zero totals.
- Exit: a mobile user can reach this week's score, an older week and a game receipt,
  then return to the same selection. Label personal points separately from Q-02's
  shared standings and explain which own contributions await kickoff. A week in progress
  must not be presented as a final weekly win.

### SCORE-NEXT-05 — one filter contract

- Core filters: season, week (or week range for Trends), Spread/Total, team and
  specific matchup. Teams match either home or away; use stable game IDs plus
  season/week so rematches cannot collide. Combine filters with AND semantics.
- Label filtered points/sample counts as a selected subset. Filtering must not
  silently redefine the official whole-week leaderboard or create a new rank.
  Draft/pending/ineligible counts remain visible separately from scored samples.
- Keep filters when drilling into a game and returning; supply Clear filters and
  a useful no-match state. A shareable route may carry filter IDs, never private
  guesses or lines; access is always checked again on the server.
- Exit: team, week and matchup combinations reconcile with the same detail rows,
  including cross-season games and empty selections. Q-05 may add optional slices.

### SCORE-NEXT-06 — accuracy and bias metrics (focus confirmed; definitions proposed)

- Q-01 confirms the first release helps players improve Guess accuracy and identify
  team/directional bias. Competition and betting-performance views are later scope
  choices, not substitutes for this first page.
- Candidate core: points per scored guess, mean absolute error, exact-guess rate,
  completion/coverage, and signed bias, separated by Spread and Total.
- Compare equal units (per scored guess) across unequal slates. Every metric shows
  its sample size, date/week range and exclusions. Missing/unlocked guesses are not
  scored zeros. Eligible zero-point guesses stay in the denominator.
- Normalize Spread bias to a documented signed-home convention; switching the
  displayed team must not reverse the interpretation. For Total, distinguish
  guesses above vs below the saved line. Team/opponent slices need explicit labels.
- Reuse stored references and eligibility; no new odds subscription or speculative
  historical backfill. Do not label benchmark accuracy as betting profit or an edge.
- Exit: approved metric definitions include formulas, denominators, scope and small
  sample treatment; aggregates match the drill-down records under the same filters.

### SCORE-NEXT-07 — player Trends page

- Q-01's confirmed lead questions are “Are my guesses improving?”, “Which teams
  do I misjudge?” and “Do I guess too high or too low?” Build from SCORE-NEXT-06's
  approved metrics. Candidate layout: weekly performance chart, team strengths/weaknesses, direction
  of bias and recent vs longer-term comparison, each linking to contributing games.
- Entry points: Me and the weekly score. Other-player comparison/audience awaits
  Q-04 and SCORE-NEXT-08; private drafts and notes never become trend inputs for others.
- Use D-38 components/tokens, text equivalents for charts, touch/keyboard access,
  explicit empty/partial states and reduced motion. No unsupported “you're improving”
  claim from a tiny or noncomparable sample.
- Exit: an approved first version answers the selected player question, survives
  reload/filter changes and reconciles to scoring receipts; its chart has an
  accessible table and works at the required mobile widths.

### SCORE-NEXT-08 — visibility and fair comparisons

- Immediate personal points do not authorize exposing another player's hidden game.
  Keep D-39's per-viewer/game/market reveal gate on details and derived data.
- Q-02 is confirmed: the personal total includes every eligible locked-in scored
  guess immediately; shared weekly/season totals and ranks include only games that
  have kicked off. Apply that same shared scope to every row, including the viewer's
  own. A permitted pending reference that resolves later contributes only when
  available and eligible; kickoff does not invent a score.
- Another player's per-game points become visible through the existing game/market
  reveal gate. Opening a detail does not change the shared standings' common scope.
- Label the personal and shared totals separately; explain own points awaiting
  kickoff without suggesting the underlying score changed. Aggregate points, ranks,
  deltas, badges, charts, counts, exports and feed text must not leak hidden
  contributions. Do not calculate a visible total from forbidden rows.
- Define progressive/partial vs final weekly rank semantics and comparable sample
  labels. Preserve independent Spread/Total ranks and existing tie rules.
- Exit: two viewers with different unlocked games receive only authorized details
  and the same shared standings. An 8-point Monday lock adds 8 to the owner's week
  immediately, contributes nothing to shared standings before its kickoff, and
  contributes 8 afterward without changing the reference. No shared figure permits
  subtraction to recover a hidden contribution. Final closest-pick results, awards
  and weekly winners retain their separate completion rules.

### SCORE-NEXT-09 — acceptance and release evidence

Use two checkpoints: core lock/scoring/navigation acceptance for SCORE-NEXT-01–05
and 08, then separate Trends acceptance for SCORE-NEXT-06/07 when those are ready.
Open analytics decisions must not block the lock-enforcement or personal immediate-
scoring fix; shared-board changes must pass the confirmed Q-02 visibility checks.

- Extend meaningful existing SQL/handler/browser tests for lock bypasses, races,
  retries, partial-week scoring, pending resolution, current-vs-saved line separation,
  eligibility, reveals and filtering. Use synthetic fixtures, not real new guesses.
- Verify no data/reference/history rewriting; preserve existing ruled Week 5 results.
  Include old/new app agreement, 320/390px mobile, keyboard, themes and brand QA.
- Update “scores at kickoff” UI/tests for personal scores and permitted per-game
  details; retain and clarify that timing for shared standings under Q-02. Do not
  rewrite historical release evidence or claim old applies were undone.
- Exit: local evidence is recorded; a separately authorized migration/deploy has its
  own hosted readback and device acceptance. Mark release done only with that evidence.

## Targeted discovery queue

Ask one at a time. Answers become decisions and update affected tasks; proposed
options below are not approvals unless explicitly marked confirmed. Q-01 and Q-02
are confirmed; D-53 and the October 21 Trends design answer Q-03a–Q-04, so their
questions below are historical. Each “Go ahead with rec” accepts the immediately
preceding recommendation, not the remaining queue.

| ID | Decision to resolve | Concrete question and recommendation | Affects |
|---|---|---|---|
| Q-01 | Confirmed October 15: primary job of Trends | Sean: “Go ahead with rec”, accepting accuracy and bias first: show whether guesses improve, which teams are consistently misjudged and whether guesses run too high/low, with every insight linked to actual games. Exact formulas, sample thresholds and audience remain separate decisions. | SCORE-NEXT-06/07 |
| Q-02 | Confirmed October 15: shared pre-kickoff scores | Sean: “Go ahead with rec”, accepting immediate personal weekly points and shared weekly/season standings that add each game at kickoff. Other-player per-game scores follow the existing viewer/game/market unlock. The shared board includes your own row on the same started-game basis, labelled separately from Your weekly points. An 8-point Monday lock counts personally now, then in shared standings at that game's kickoff. | SCORE-NEXT-02/04/08 |
| Q-03a | Headline improvement metric — answered October 21: the approved Trends defaults (above) use mean miss and signed bias with exact samples | Should Trends lead with average miss per scored guess, with competition points and scored-game count alongside? Recommended: yes. Lower average miss means closer guesses; Trends must not confuse playing more games with improved accuracy. Spread and Total stay separate; pending/unscored guesses do not enter this average. | SCORE-NEXT-06/07 |
| Q-03b | Comparison window — answered October 21: last 5/10 games, current season, 3/5 seasons and all history, shown together | Choose a recent period and a non-overlapping earlier baseline after Q-03a. Do not average averages from unequal samples or invent a baseline when history is missing. | SCORE-NEXT-06/07 |
| Q-03c | Sample size — answered October 21: a recurring label needs at least five decided directional games over at least three competition weeks; smaller samples stay visible | How many scored guesses are enough for a team strength/weakness or improvement label? Keep raw counts visible and small samples labelled; a threshold and claim wording still need selection. | SCORE-NEXT-06/07 |
| Q-04 | Audience and rivalry — answered October 16 and 21: D-53 compares you with one, several or all Community members; October 21 player profiles stay within the selected Community or private roster | Is Trends your own learning page, every member's visible profile, or a side-by-side comparison with a chosen friend? A public-to-members view still needs per-game reveal rules; no draft or private-note access follows from it. | SCORE-NEXT-07/08 |
| Q-05 | Highest-value filters | Beyond week/team/matchup, which question matters most: home/away bias, favorite/underdog bias, divisional games, or large/small lines? Add only the first useful slice, using existing permitted evidence. | SCORE-NEXT-05/06 |
| Q-06 | Next useful asset | After reviewing a weak week, should the app provide a weekly learning recap, a saved comparison with a rival, or a personal game-review note? Choose the next action before adding more dashboard cards. | Candidate assets below |

## Candidate assets — proposals, not committed builds

| ID | Asset and user value | Dependency / exit if selected | Owner / state / target |
|---|---|---|---|
| IDEA-01 | Weekly learning recap: biggest misses, exact guesses and one evidenced recurring bias | SCORE-NEXT-06/07; selected metrics and sufficient sample; every statement links to supporting games | TBD / Proposed; Q-06 / Not scheduled |
| IDEA-02 | Saved rival comparison: return to a chosen friend, market and period | Q-04; SCORE-NEXT-08; comparison uses permitted, labelled samples without silently ranking unequal totals | TBD / Proposed; Q-06 / Not scheduled |
| IDEA-03 | Guess review journal: connect an owner's reasoning to the locked guess and later review | Reuse existing private notes/history; clearly separate pre-lock reasoning from later reflection, preserve timestamps and visibility | TBD / Proposed; Q-06 / Not scheduled |

## Maintenance

Update this file and the decision log as Sean answers. Link implementation PRs and
dated verification to each task when they exist. The [completion register](../docs/COMPLETION_REGISTER.md) remains the overall delivery
ledger; keep it linked to this scoped backlog. The frozen tracker and the private
Status Board are not updated by this file; publication and live operation require
their own recorded actions. No player data or lines are included in this backlog.
