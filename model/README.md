# Guess The Line model research

Owner: Sean Balsiger · Prototype 0.1.0 · October 8, 2026.

This is a working historical **GTL** margin/total baseline, not an outside model
or a production betting recommendation. It reads only licensed public final-score
data. It never reads player guesses, sportsbook lines, keys or private app state.

```sh
python3 model/pipeline.py fetch
python3 model/pipeline.py evaluate
python3 -m unittest discover -s model -p 'test_*.py' -v
```

Python 3.10+ and its standard library are sufficient. No install or paid service
is needed. The approved public input is pinned by commit and SHA-256 in
[sources.json](sources.json); changed bytes require a new source review.

Raw data, retrieval receipt, fitted coefficients, aggregate validation and
per-game retrospective predictions are written only to `.local/model-data/`.
Do not put raw source files, player data or per-game research outputs in web
assets. This directory is not imported by the app or deployed to Supabase.

Read [the validation report](../docs/MODEL_VALIDATION.md) for the measured result,
source rights and production gates. The model did **not** outperform the simpler
rolling-score baseline on held-out MAE. The input stops in February 2021, so
2026 projections deliberately return unavailable. Historical mean predictions
and prediction-interval coverage are not calibrated betting probabilities.

The next input must supply a complete current result ledger with source rights,
canonical game identity, final status, and observation/available-at timestamps.
An outside forecast adapter is a separate source with its own permission,
version and input-dependence record. Neither path may overwrite locked guesses
or merge Spread and Total reveal gates.

## Animated NFL replay research (October 15, 2026)

Sean selected a real NFL replay with score, clock, player statistics and captions,
with the data/model work finished before results are published. See
[scope, measured research and publication gates](../docs/SIMULATED_GAME_REPLAY.md).

`replay_sources.py` audits fixed public nflverse release URLs and retains hash
receipts, field-filtered snapshots and coverage under `.local/replay-data/`.
It is separate from the pinned FiveThirtyEight baseline above. Run `--help`
for the `fetch`, `audit` and research-export options. `replay_model.py` evaluates
normalized PBP locally with fixed chronological splits; it cannot generate or
publish a complete game. Research fixtures do not ship with the frontend.

```sh
python3 model/replay_sources.py --help
python3 -m unittest discover -s model -p 'test_replay_*.py' -v
```

`replay_schedule.py` verifies the exact schedule release and preserves unknown
future scores. `replay_current_sources.py` captures and audits the fixed 2026
weekly-roster, injury and depth-chart assets. Both keep their raw bytes, release
metadata and receipts under `.local/replay-data/`. A new observation cannot be
backdated to a provider timestamp or an old cache file's modification time.

`replay_matchup.py` seals a selected schedule matchup, source references, current
player facts, cutoff, freshness policy and rule implementation version. Scores
are omitted from pregame inputs. Missing availability, roles and usage remain
explicit; a successful snapshot still forbids game generation and publication.
The freshness policy is a named research choice, not a verified availability
guarantee. Current source files cannot recreate an earlier historical input feed.

`replay_reconstruction.py` derives scores and the requested individual statistics
from observed regular-season plays, including compound scoring and separate try
rules. It compares scores with schedule labels and retains unresolved events.
Matching known subtotals are not proof of a complete game. Player totals still
need a separately verified box-score comparison; nflverse's player-stat export
is itself calculated from PBP and cannot establish independent source truth.

`replay_usage.py` audits passing/rushing attempts and identified targets in prior
completed games against the sealed matchup's exact sources. Same-day and future
games are excluded. Known subtotals, unresolved attribution, historical event
teams and missing appearance denominators remain explicit. It produces neither
usage shares nor player forecasts. Its analysis policy can be recorded after
the input cutoff only with that fact disclosed; it is not preregistration.

`replay_evaluation.py` supplies empirical CRPS, Brier, paired score/margin/total
metrics, intervals and frozen-player denominator handling. Protocol validation
checks declaration timing and five artifact hashes, not substantive eligibility,
baseline bytes or real outcomes. No whole-game evaluation or publication approval
is established by these helpers.

`replay_game_baseline.py` evaluates an exact empirical distribution of intact
prior-date home/away final-score pairs. Its fixed 2024/2025 rolling-origin cohorts
are development evidence from today's corrected schedule, not historically
available inputs or untouched validation. It is a league-wide comparison only;
no team/player-conditioned forecast or replay is generated. Aggregate metrics
can be reviewed publicly; individual game results and distributions stay local.

```sh
python3 model/replay_schedule.py fetch
python3 model/replay_current_sources.py fetch --source all
python3 model/replay_schedule.py audit
python3 model/replay_current_sources.py audit
python3 model/replay_matchup.py --help
python3 model/replay_reconstruction.py --seasons 2026
python3 model/replay_usage.py --help
python3 model/replay_game_baseline.py --help
```

Only aggregate research evidence belongs in `model/reports/`. These commands do
not register a website route, deploy anything, or produce a real matchup result.
