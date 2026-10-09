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
