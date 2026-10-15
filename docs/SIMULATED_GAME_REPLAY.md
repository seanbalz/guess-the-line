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
| Current coverage | Canonical completed games, team/week completeness, roster membership and availability, timestamps and missing/stale rejection | Completed 2022–2026 games reconcile to the approved schedule at the October 15 cutoff with no missing/extra IDs or factual mismatches; current roster availability and historical input vintages remain unverified |
| Football engine | Score/clock/possession/stat consistency, special teams, penalties, safeties, conversion tries and current overtime rules | Strict research ledger implemented; unsupported plays fail explicitly. Full NFL support is incomplete |
| Player model | Current roster-bound participation/usage, injuries and substitutions or stated measurable limitations | Not implemented |
| Whole-game evaluation | Untouched chronological games; score and player-stat distributions, calibration, baselines and rare-event checks | Not implemented; measured next-play research below does not pass this gate |
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

## Local verification

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
- The cloud boundary check passes, and all 93 build files are byte-identical
  to the October 15 production-source build at `d71a988`. This work adds no
  replay, fixture or model data to the website bundle and requires no deployment.

These checks establish the isolated implementation, not full-game model
accuracy, phone acceptance or a production replay release.

## Reproduction

Research modules use Python's standard library and have no account or provider
credentials. Raw public inputs, retrieval receipts, normalized rows and
per-game research output remain under ignored `.local/replay-data/`.

```sh
python3 -m unittest discover -s model -p 'test_replay_*.py' -v
node --test tests/simulation-replay.test.mjs
```

Publication remains blocked in code; there is no flag that turns this
next-play baseline into a production forecast. Completing the gates requires
implementation and evidence, not changing a status label.
