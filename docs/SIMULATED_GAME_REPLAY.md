# Simulated NFL game replay

Owner: Sean Balsiger · Implementation: Codex · October 15, 2026

Tracked in [issue #128](https://github.com/seanbalz/guess-the-lines-repo/issues/128).
This work is separate from the deployed [October 15 formatting release](RELEASE_2026_10_15.md).

## Confirmed scope

Sean selected **“Animated game replay with score, clock, player stats and play
captions”**, then **“Real NFL teams and players—finish the data/model work before
publishing replay results.”** The first release therefore requires real,
reviewed inputs and an evaluated model. A fictional demo is not the requested
production deliverable. Test fixtures remain confined to tests.

The [reference video](https://x.com/rotobot_ai/status/2110512433282625965/video/1?s=46)
was inspected in the browser. Observed elements include a perspective field,
scoreboard, quarter/clock, passing/rushing/receiving panels and play captions.
The author's claims about 2,000 runs, current coverage inputs and representative
run selection are not independently verified or adopted as GTL requirements.
Build original visuals using the approved GTL system; do not copy video assets.

## Implementation boundaries

- One ordered event ledger drives the field position, score, clock, player
  statistics and caption. Rewinding selects an earlier snapshot; it never
  subtracts from a mutable running total.
- The viewer has Play/Pause, Previous/Next, Restart and playback speed. It
  starts paused and stops when covered, hidden, unmounted or complete. Device
  and app reduced-motion preferences offer static stepping instead of timed
  playback. User-requested finite replay motion is a narrow addition to the
  brand motion policy, not a decorative loop or an actual-game LIVE signal.
- Each view says **Simulation**. A research build also says its model is not
  validated. Model version, input time and repeatable seed accompany results.
  A simulation's outcome never becomes an actual score or settlement input.
- Use the existing five-tab shell when the publication gates pass: a secondary
  Home tile and a Lines entry open a `page.simulation` layer. Do not attach an
  unvalidated run to a real matchup or add a sixth primary tab.
- No replay code reads or writes picks, bets, notes, account state or saved
  odds. Future real projections require an authenticated server reader and
  the current per-game visibility gates: a score pair reveals both markets.
  No projections, model input rows or sample games belong in the public bundle.

## Research and publication gates

The existing final-score model ends in February 2021 and is insufficient for
this feature. The new `model/replay_model.py` is an offline next-play research
baseline, not a full game generator. It samples whole observed outcome labels
conditioned on down, distance and field band, with a training-prior fallback
for sparse states. It does not assign historical players to a future roster.
Its six evaluation labels use precedence: lost fumble, interception, sack,
run, completed pass, incomplete pass. These are lossy research classes, not
playable football transitions. Original outcome flags are retained; a recorded
touchdown can belong to the defense, and double turnovers need full play
resolution. The sampler exposes its requested/historical state, support and
prior fallback. It does not infer the scoring side or an offensive touchdown.

Before any real-data evaluation, version 0.1 fixed its split: training through
2023, calibration in 2024, held-out evaluation in 2025. The model never updates
from calibration or held-out rows. It reports multiclass Brier score and yards
error against an unconditional training baseline, exclusion counts and class
frequencies. These are next-play checks, not full-game accuracy or a betting
advantage. Inspected evaluation seasons become development evidence for any
subsequent model version.

| Gate | Required evidence | Current state |
| --- | --- | --- |
| Input rights | Exact files, fields, producer lineage, applicable grant and attribution; free use within that scope | Exact CC BY 4.0 release grant supports the recorded local factual-field research; production review remains open, without asserting a second NFL grant is required |
| Current coverage | Canonical completed games, team/week completeness, roster membership and availability, timestamps and missing/stale rejection | Verified schedule/current-source adapters, sealed pregame inputs and prior-game usage audits are implemented. Current game-day availability, exact usage totals and historical input vintages remain unverified |
| Football engine | Score/clock/possession/stat consistency, special teams, penalties, safeties, conversion tries and current overtime rules | Narrow replay ledger and separate 2026 clock/administration foundation implemented; unsupported facts halt explicitly. Full NFL support is incomplete |
| Player model | Current roster-bound participation/usage, injuries and substitutions or stated measurable limitations | Observed usage counts preserve missing attribution and historical team identity. Participation probabilities and player forecasts are not implemented |
| Whole-game evaluation | Untouched chronological games; score and player-stat distributions, calibration, baselines and rare-event checks | Metric calculations, declaration checks and a league-wide paired-score development baseline are implemented. The proposed team/player replay model has not been evaluated; no untouched prospective validation is established |
| Serving/privacy | Versioned server results and reader, allowed inputs only, both market gates, no writes to competition records | Not implemented; no production route registered |
| UI acceptance/release | Mobile light/dark, 320/390 widths, keyboard/axe, motion/lifecycle checks; Sean's phone acceptance; exact-SHA release evidence | Local browser checks pass at both widths/themes, including keyboard/axe and playback lifecycle; phone acceptance remains; not deployed |

The prototype canvas was not accessible in the inspected Claude status
session. No new simulation canvas markups or visual acceptance are claimed.
Its layout follows the user-selected reference features and D-38 tokens.

## Observed data and first research result

The exact [nflverse-data release license](https://github.com/nflverse/nflverse-data/blob/master/LICENSE.md)
is CC BY 4.0. Its attribution, source/license links and notice of modifications
must accompany any future permitted use. The factual field subset excludes
play narrative, images, odds and the publisher's EPA/WP models. The producer
uses NFL-origin feeds, but no additional applicable restriction was established
for local research from this distributor. The [source register](../model/sources.json)
records this limited review; it is not a grant of image, trademark or endorsement
rights. No paid data was used.

| Season | Games observed in source | Rows retained for research |
| --- | ---: | ---: |
| 2022 | 284 | 47,859 |
| 2023 | 285 | 48,087 |
| 2024 | 285 | 47,898 |
| 2025 | 285 | 47,196 |
| 2026, Weeks 1–5 | 79 | 13,403 |

These counts include postseason games in completed years. The
[schedule reconciliation](../model/reports/replay-coverage-2026-10-15.json)
matches every completed game ID, date, team pair and final score in the approved
schedule at 14:54 UTC on October 15, with no missing or extra games. The 193
future 2026 schedule rows have no outcomes and are excluded. The model below
uses regular-season run/pass plays only. The current source's 35 excluded run/pass rows are
two-point attempts without ordinary downs, not missing values to replace with
zero. The 2026 roster audit retains 3,042 of 3,043 rows; one has no GSIS ID.
Every retained play participant joins a roster identity, but mixed latest-row
weeks 1–6 do not establish current availability or a game-day active roster.

First evaluation: 66,099 eligible training plays from 2022–2023. Latest training
date: January 7, 2024. The declared calendar split and hyperparameters were
fixed before these evaluation results were inspected. Lower errors are better.

| Measure | 2024 calibration, 32,652 plays | 2025 held-out, 32,116 plays |
| --- | ---: | ---: |
| State-conditioned multiclass Brier | 0.633548 | 0.631693 |
| Unconditional training baseline Brier | 0.668461 | 0.668178 |
| State-conditioned yards MAE | 5.654814 | 5.591916 |
| Unconditional training baseline yards MAE | 5.745348 | 5.686523 |

Each evaluation season covers 272 observed regular-season games. Sparse-state
fallback was used for 28 calibration plays and 39 held-out plays. These results
support a next-play starting point only. They do not measure full-game scores,
player totals, simulated clock/drive behavior, betting returns or injury effects.
Excluded penalties, overtime, special teams and two-point attempts prevent
extrapolating these errors to a complete game. The source is today's corrected
snapshot, so this is retrospective chronological evaluation, not a reconstructed
historical publication-time feed. No model tuning followed this first report.

The [aggregate report](../model/reports/replay-next-play-0.1.0.json) records class
frequencies, normalized input hashes and exclusions. Raw inputs, normalized
rows and retrieval receipts remain in ignored `.local/replay-data/`; no
individual game projection is published. Public issue #128 remains open.

## Current inputs and observed reconstruction — October 15 continuation

PR [#131](https://github.com/seanbalz/guess-the-lines-repo/pull/131) merged the
isolated viewer and next-play baseline after its four required checks passed.
The next implementation stage adds verified schedule, weekly roster, injury and
depth-chart adapters, a sealed pregame matchup contract and observed-event
reconstruction. These modules are offline research tools with no app route.

The [aggregate input audit](../model/reports/replay-input-audit-2026-10-15.json)
records exact source and metadata hashes. The schedule contains 1,411 games in
the reviewed seasons: 1,218 reported finals and 193 unplayed games. Future scores
remain null. Scheduled Eastern times normalize to UTC; ambiguous IDs, partial
scores, invalid times and altered receipts fail validation. Re-fetching old
bytes cannot give them a new source freshness date. Earlier observations of
identical republished bytes retain their separately verified receipt reference.

The current audit retains 15,319 weekly roster rows across available weeks,
1,697 injury rows and 2,292 rows from the latest depth snapshot per team.
Seven roster rows lack stable player IDs; six current depth rows have missing
or invalid identity/name fields. Those rows are quarantined. The retained
Week 6 roster scope covers 28 scheduled teams, but an `ACT` roster status is
not a confirmed game-day active list. Blank injury designations and absent
reports remain unknown. Original row publication/revision times are unavailable;
the first verified local observation is used conservatively, without backdating.

The matchup builder derives teams, week and kickoff from the verified schedule,
removes final-score labels, joins players by stable identity and records any
missing role, availability or usage facts. Its versioned freshness policy and
rule-implementation hash are sealed with the sources. The rulebook URL is a
reference to the selected edition; the code hash does not certify complete
implementation of that rulebook. A sealed snapshot always remains withheld
from generation and publication at this stage.

The verified SEA–DEN input smoke check contains 159 roster records, including
non-active membership. It reports 153 unknown availability states and 36 missing
roles; these are not 159 eligible participants. Three exact, reviewed name
variants retain their stable IDs and original source names. The repeated run
produces the same snapshot hash with zero unresolved identity joins, while
generation and publication remain disabled.

Observed play reconstruction uses scoring flags and scoring actors, dedicated
individual yardage fields, conversion exclusions, and explicit lateral gaps.
It does not fill missing flags with zero. Its results are:

| Regular season | Games | Known score subtotals match schedule | Complete scoring reconstruction | Player-stat games without identified attribution gaps |
| --- | ---: | ---: | ---: | ---: |
| 2022 | 271 | 271 | 222 | 247 |
| 2023 | 272 | 272 | 231 | 254 |
| 2024 | 272 | 272 | 211 | 246 |
| 2025 | 272 | 272 | 210 | 252 |
| 2026 through Week 5 | 79 | 79 | 68 | 73 |

All 1,166 known score subtotals match, with no missing or extra schedule game
IDs and no internal post-play score-checkpoint mismatches. Only 942 games have
complete scoring reconstruction: 244 source rows lack scoring flags across
the remaining 224 games. The individual-stat counts are **not independently
verified box-score totals**. Known gaps include lateral chains whose intermediate
actors are unavailable. Internal PBP checkpoints and the
[nflverse player-stat export](https://nflreadr.nflverse.com/news/index.html)
are not independent evidence: that export uses
[statistics calculated from PBP](https://nflfastr.com/reference/calculate_stats.html).
No full-game forecast accuracy is established by these reconstruction checks.

A separate manual spot-check against the
[official Raiders–Patriots Week 5 gamebook](https://www.patriots.com/news/gamebook-raiders-at-patriots-week-5)
matched all 83 implemented numeric cells across 32 category rows and 22 players,
with zero differences. The PDF supplies no GSIS identifiers, so the local audit
records the manually reviewed team/name joins to the pinned roster. One lateral
attribution gap remains withheld even though its end total matches. This single
game does not certify the other games or every intermediate event. The document
has a media-use restriction; no redistribution, automated input feed or product
display permission is inferred. Only the audit summary and source hash are
committed, with the factual comparison kept local.

## Prior-game usage and evaluation contracts

`model/replay_usage.py` binds prior observations to the exact sealed matchup and
schedule. Its recorded history window excludes the target, same-day games and
future games. Passing attempts, rush attempts and identified intended receivers
remain separate counts; an unknown receiver never becomes a guessed player or
a known zero. A source row labelled with the wrong competition is a coverage gap,
not an exclusion that makes an incomplete total appear complete. Event credits
are atomic, and historical team attribution remains separate from a player's
current team. Recorded usage games do not establish an appearance denominator.

The [aggregate usage audit](../model/reports/replay-usage-audit-2026-10-15.json)
checks all 79 completed 2026 regular-season games before the frozen input cutoff.
Of the 159 selected roster records, 28 have attributed usage. Their known
subtotals are 309 passing attempts, 258 rush attempts and 289 identified targets.
These are **subtotals**, not complete or predicted player totals: the source has
228 passes without an identified receiver, plus one kickoff with missing flags
that produces three metric gaps. Exact totals remain unavailable. The analysis
policy was recorded after the frozen input cutoff and is explicitly disclosed
as an analysis choice, not a preregistered forecast protocol. Source hashes,
producer hash and artifact hash accompany the report; individual rows remain
local.

`model/replay_evaluation.py` implements empirical CRPS, binary Brier scores,
type-7 quantiles and inclusive central-interval coverage/width. Home and away
scores stay paired when deriving margins and totals. Home wins, away wins and
ties are three explicit binary events. Player evaluation retains every frozen
player, including missing outcomes; only caller-supplied, evidenced
nonparticipation can imply zero. This module does not independently verify that
outcome evidence.

The protocol validator checks the declared cutoff, cohort, seed, sample count,
metric definitions and exact bytes of five referenced artifacts. It does not
decode those artifacts to establish eligibility, independently attest their
recording times, verify baseline bytes or validate a forecast. Already inspected
2022–2025 games and 2026 Weeks 1–5 remain development evidence. A successful
declaration check still returns `forecastEvaluated: false`,
`promotionAllowed: false` and `publicationReady: false`.

`shared/simulation-game-state.mjs` adds separate research administration for
coin-toss and half choices, quarter/half transitions, game/play clocks, ordinary
timeouts and the two-minute warning under the 2026 rules. Halftime receiving
choices are explicit. Declared research checkpoints remain unverified in every
descendant state. An event must bind to the exact previous state and sequence;
unsupported live plays, penalties, period extensions and overtime decisions
halt for a ruling. This module cannot settle a game, assign players or upgrade
the earlier narrow replay ledger to a complete NFL engine.

## Whole-game comparison baseline

`model/replay_game_baseline.py` provides a league-wide benchmark for the future
simulator. Its configuration was frozen at 16:49:46 UTC on October 15 before
the first result was computed. Each target uses every eligible reported-final
regular-season home/away score pair since July 2022 on strictly earlier calendar
dates. The two scores from each game stay together. The exact empirical
distribution retains ties, repeated outcomes and extreme scores, with no random
sampling, tail removal, team weighting or tuning after inspection.

The [aggregate baseline report](../model/reports/replay-paired-score-baseline-2026-10-15.json)
evaluates all 272 games in each of 2024 and 2025, with no missing-outcome cohort
exclusions. Training pools range from 543–801 games in 2024 and 815–1,073 in 2025.
Each evaluated game has equal weight. Lower CRPS and Brier values are better;
these values establish a comparison, not an improvement over another model.

| Development season | Home-score CRPS | Away-score CRPS | Margin CRPS | Total CRPS | Home-win Brier |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2024 | 5.77450 | 5.29557 | 8.05780 | 7.36271 | 0.249668 |
| 2025 | 5.56175 | 5.68032 | 7.97854 | 7.85092 | 0.249050 |

The report also preserves away-win/tie Brier scores and 50%, 80% and 95%
interval coverage and width. It pins the source, configuration and producer
hashes, and a repeated run with the same observation cutoff is byte-identical.
Individual game results and empirical pairs remain local. This uses the
currently corrected schedule; chronological ordering does not recreate the
historical feed available at each kickoff. Both seasons were already inspected
and remain development evidence. There is no team/player-conditioned forecast,
animated game generation, prospective certification or publication permission.

## Initial local verification — PR #131

- Full application suites: 1,272 Node tests and 184 Vitest tests pass, with no
  skipped tests. This includes 20 replay ledger tests and 10 viewer render tests.
- Source and model: 22 Python tests pass. Independent review checked the
  source receipt/metadata chain, chronological cutoff handling, training
  isolation, compound-event flags and explicitly labelled sparse-state fallback.
- Browser: five focused tests pass, covering ledger-consistent controls,
  speed, rewind/restart, hidden/covered/unmounted cancellation, reduced motion,
  invalid/end states, 320/390 widths in both themes, 44px controls, keyboard
  and axe. Browser fixtures contain invented test-only plays and are not model
  evidence or real NFL replay results.
- Typecheck and brand QA pass. No production route imports the viewer.
- At PR #131's isolated source head, the cloud boundary check passed and all 93 build files were byte-identical
  to the October 15 production-source build at `d71a988`. That comparison predates
  the independently merged recommended-bets changes and is not a comparison of
  today's combined main branch. The replay work adds no
  replay, fixture or model data to the website bundle and requires no deployment.

These checks establish the isolated implementation, not full-game model
accuracy, phone acceptance or a production replay release.

The input/reconstruction stage passes **102 Python tests with no
skips**, including schedule, current-source, matchup and reconstruction cases.
Independent reviews covered timestamp/receipt integrity, unavailable inputs,
compound scoring, unknown competition labels and the real cached-input CLI.
Brand-document QA and whitespace checks pass. GitHub checks and release state
are tracked separately; local test success is not a deployment.

The following usage/evaluation/administration stage passes **158 integrated
Python tests**, **43 focused JavaScript tests**, and the application suites
of **1,335 Node tests plus 184 Vitest tests**, with no skips. Independent review
checked usage attribution and completeness, clock boundaries, paired-score
metrics, equal per-game evaluation weight and declaration timing. The cached
usage and baseline runs are repeatable; publication remains disabled. These
research modules have no production imports or app routes.

## Reproduction

Research modules use Python's standard library and have no account or provider
credentials. Raw public inputs, retrieval receipts, normalized rows and
per-game research output remain under ignored `.local/replay-data/`.

```sh
python3 -m unittest discover -s model -p 'test_replay_*.py' -v
node --test tests/simulation-replay.test.mjs
python3 model/replay_schedule.py audit
python3 model/replay_current_sources.py audit
python3 model/replay_matchup.py --help
python3 model/replay_reconstruction.py --seasons 2022 2023 2024 2025 2026
```

Publication remains blocked in code; there is no flag that turns this
next-play baseline into a production forecast. Completing the gates requires
implementation and evidence, not changing a status label.
