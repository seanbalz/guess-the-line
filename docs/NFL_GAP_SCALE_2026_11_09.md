# Guess The Line — comparable NFL gap sizes

Owner: Sean Balsiger · Version 1 · November 9, 2026

Status: checked locally on
`codex/nfl-gap-scale-2026-11-09`; not merged or deployed. D-81 records Sean's
NFL-wide baseline and top-quarter highlight choices. Existing GTL typography,
semantic colors and components are retained; no new brand choice is introduced.

## Behavior

Recommended previously divided each gap by the current line's magnitude, with
a three-point spread floor. That made a hypothetical one-point gap at a spread
of three appear three times larger than a five-point gap at a total of 45.
Now each point gap is compared with historical final-minus-market errors for
its own market. Every player uses the same fixed scale.

| Hypothetical point gap | Spread size / 100 | Total size / 100 |
| --- | ---: | ---: |
| 1 | 10.7 | 6.5 |
| 3 | 23.1 | 19.9 |
| 5 | 36.1 | 32.0 |
| 10 | 61.1 | 57.3 |
| Large starts | 14 points | 14.5 points |

The numeric score is an empirical percentile of **absolute outcome errors**,
not the percentile of players' guesses. For positive `gap`, it is
`100 * count(historical absolute error <= gap) / sample count`; zero returns
zero. No normal-distribution assumption, multiplier or line-size division is
used. Equal historical errors are included; non-half-point consensus gaps are
evaluated against the empirical steps without rounding. Scores are shown to
one decimal but sorted at full precision. Same-score ties retain kickoff/key
ordering and actionable rows remain first.

Small is below 50, Moderate is 50 to below 75, and Large is 75 or above. Sean
selected the top-quarter Large boundary. Both sides retain their signed points;
Large in the guess's direction is green, the opposite side red, and smaller
gaps yellow, always accompanied by text. Raw point gaps remain visible.

The paper record's Large gaps filter uses the identical function. All-gaps
outcomes, stakes, W–L–P and paper ROI keep their existing formulas. Period and
market filters apply to the same complete permitted history. A Large filter
with no eligible games has its own empty message. Past gaps are reclassified
retrospectively with this fixed baseline; this is not a historical strategy
backtest, especially for games within the baseline period.

## Source and reproducibility

The generator reads the existing frozen `shared/trends/history-1999-2025.csv`
and no-contest exclusions in `shared/trends-corrections.json`. It retains
regular-season 2016–2025 finals and valid lines, separately per market, excluding
missing values rather than turning them into zero. There are 2,639 observations
in each market; mean absolute errors are 9.788177 spread points and 10.416446
total points. Medians are 8 and 9 points, respectively.

The [nflverse dictionary](https://raw.githubusercontent.com/nflverse/nflreadr/main/data-raw/dictionary_schedules.csv)
defines a positive `spread_line` as a home favorite. Thus the spread calibration
error is `abs(home_score - away_score - spread_line)`, whereas GTL's signed
home handicap has the opposite sign. Total error is
`abs(home_score + away_score - total_line)`. Sign orientation, pick’em, missing
finals/lines, no-contests, excluded seasons/types and duplicate IDs are checked.

`node scripts/prepare-nfl-gap-baseline.mjs --check` reproduces
`shared/nfl-gap-baseline.mjs`. The generated aggregate includes counts,
histograms, period, version, source/credit/license, limitations and SHA-256s of
both inputs, canonicalized to UTF-8/LF so Windows checkout line endings do not
change the identity. No player data or current/unplayed line is added to assets.
Regeneration is offline and deterministic; the app never downloads the raw CSV.

Data: nflverse / Lee Sharpe, CC BY 4.0, modified. Existing source caveats remain:
the historical line's book is not documented and the dataset license does not
establish upstream rights to individual bookmaker data. The calculation reuses
the repository's existing historical aggregate use; it adds no feed or paid data.
Credits and the definition are available from the recommendation and gap-record
info buttons and Guidance. The regular-season baseline is an overall NFL
yardstick, not separately fitted by matchup, spread band, venue or playoffs.

## Scope and verification

This changes client-side interpretation and presentation only. Saved picks,
scoring references, standings, quotes, results, APIs, permissions, migrations,
providers and collection schedules are unchanged. Larger disagreement does not
establish predictive skill, a win probability or expected value. The source
dictionary was checked for sign/field semantics; the calculation does not
independently verify every historical bookmaker quote.

Local checks passed: typecheck; 65 focused Node checks (calibration, ranking,
cutoff parity, historical periods and brand/tokens); all 930 Vitest UI/scoring
checks, plus targeted reruns after final wording changes; deterministic baseline
reproduction; UTF-8 Brand QA; cloud-test build and bundle privacy scan. The
19 recommendation browser cases passed across the initial run and targeted
reruns after updating two assertions that depended on the previous ordering.
They cover real fixture handlers/SQL, immutable reviewed terms, market/period
behavior, 320/390px Light/Dark and axe. Final targeted checks cover the shared
info wording and phone presentation. Screenshots were visually inspected in
both themes. All data/saves were fictional and local.

The first sandboxed dependency install failed on registry DNS; the approved
retry succeeded. The sandboxed browser run did not reach test execution; its
approved retry ran normally. Brand QA needed Python's UTF-8 mode on Windows.
Existing Vite chunk-size/NO_COLOR and unrelated BiasChart key warnings remain;
they did not fail checks. Exact PR CI is separate from these local results.

Merge, protected frontend deployment, hosted readback and physical-phone
acceptance remain separate release steps. Rollback is the previous frontend;
no data transformation or database rollback is required.

The first PR #508 CI run passed Tests and Brand QA, but browser shard 2 failed
the existing badge shelf setup: visibility produced 72px scroll while the test
required more than 100px before clicking. PR #507 already corrects that setup
by explicitly centering the badge without weakening the navigation assertions.
Its existing commits and prior-release evidence are integrated here rather than
duplicating the fix. The completion-register merge preserves both task records.
This correction changes no product scrolling code; renewed exact-head CI is
required. The corrected badge case passes locally with the combined source;
Brand QA, evidence JSON and whitespace checks also pass. The original failed
run 42670166783 remains recorded as failed.
