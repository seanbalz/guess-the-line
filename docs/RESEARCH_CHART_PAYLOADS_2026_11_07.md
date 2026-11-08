# Canonical Research chart data — November 7, 2026

Status: **implemented and checked locally; unpublished and not deployed**.
Implementation commit: `0bec834d6d21f6dc2ec88d0610b9fdc0b2f1b00b`, on exclusive
branch `codex/research-chart-payloads-20261107`, based on fresh `origin/main`
then fast-forwarded to parent `2ef9ca46b462f2217c3fcb4b35b447b7ab7346c9`.
No other checkout was modified. The selected-system review at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`, specifically populated Trends,
and rollout items 08/10 authorize the existing native chart composition.
The shared frame/navigation question remains separately owned.

## Data and native behavior

Each offline candidate/period now stores `perSeason` from exactly
`researchRecord(selectResearchPeriod(candidate.records, {now, season, period})).records`.
Rows use the NFL season field, including January games, and the existing
`researchRecord` units, price coverage and rounding. Nothing is reconstructed
from cross-year bins or joined to weekly-card IDs. The fixed fields are season,
sample, wins, losses, pushes, illustrative units, actual units and price coverage.
Publication rejects more than 100 season rows; current public history has 25.
The existing research version, candidate IDs, source predicates, qualifications
and weekly-card season charts are unchanged.

Every permitted candidate receives a separate `rowSeries` of at most 12 bins.
It merges adjacent prepared bins, summing their sample/W-L-P and retaining the
last exact cumulative endpoint. The full series remains at most 48 bins and is
projected only for the shortlist or requested detail. No raw records or matched
game IDs enter the authenticated reply. Existing reveal, applicability and
fingerprint gates still apply before either chart shape is projected. Hosted
requests perform no family evaluation; old assets can compact their existing
48 prepared bins without reading historical records.

Native collapsed rows draw only the bounded preview. Opening a non-shortlist
row makes one scoped detail read; opening its evidence reuses that reply. Its
full chart and table share the exact full-series key and selection. Shortlisted
rows retain the separate lazy evidence read and original key guard when that
reply differs. The existing account/access/game/candidate/period scopes,
abort/late-reply masking and retry controls remain. The opened chart passes the
exact season rows to the existing TrendDetail / SeasonStems / SeasonTable
controller. The chart is labelled **Illustrative units at -110**; actual-price
returns retain their own complete-price requirement in the evidence. No source
clock time is invented.

## Local evidence

The [capture and data manifest](../design/prism-research-chart-payloads-2026-11-07/evidence.json)
records source hashes, exact returned season rows, capture hashes and asset
checksums. Its ten native captures cover 320/390px collapsed lists in both
themes, and the opened line, season stems and selected season table in both
themes. Theme changes use the real `gtl.theme` preference and storage event,
then assert the resolved theme and computed native text token.

The browser charts use 1,424 unmodified completed nflverse rows from the
committed 2021–2025 public history (CC BY 4.0). Only accounts, the future test
slate and current reference are fixtures. The captured canonical candidate has
126 games, 42 exact full bins and 11 preview bins. Each season's sample/record
and units are recorded in the manifest. No fixture research reply or invented
curve supplies those results. Full-page list captures include fixed bars at
the capture viewport position; chart/table captures show the native viewport.
These are controlled local captures, not physical-phone or hosted acceptance.

Passed verification on the implementation source:

- 39 focused Node checks: numerical NFL/calendar-season boundaries, cross-year
  bins, counts/endpoints, canonical price coverage and rounding, invalid/future
  exclusions, missing/zero data, old assets, publication validation/redaction,
  reply bounds and reveal gates.
- 46 component checks across Research UI, landing and native research kit.
- Eight native browser checks: all collapsed curves without per-row reads,
  exact season/table selection, a single opened non-shortlist detail read,
  late detail replies across period/account changes, existing summary races,
  retries and download failures, and mismatched evidence selection isolation.
- Typecheck, Brand QA, cloud build, bundle-only privacy scan and whitespace.
  Vite retains its existing large-chunk advisory; no build failure occurred.

## Offline public preparation and reproduction

The existing free nflverse schedule/PBP pipeline completed a local dry run for
`2026-11-07T20:00:00.000Z`: 7,548 schedule rows, finals through November 5,
122 completed games/PBP games, 750 candidates, six qualifiers and 272 statistic
matchups. Source SHA-256:
`b7e2fb72f522f31f0b2b624a14fd03e2941927975373a5f3790d6947058d5122`.
PBP SHA-256:
`c42cd6d6a86c4be337aaa1185176e8904cba8407eacbdbf21afab341a82b77e5`.
The generated server module is 2,939,726 bytes. The largest full release asset
is 1,050,801 bytes packed / 14,984,731 bytes decoded. Existing 3.5 MB packed
and 24 MB decoded limits are enforced; optional chart arrays are fixed-field
validated without rejecting older assets that omit them.

All six gzip assets and the release index reproduced byte for byte using the
saved exact schedule/PBP bytes and the same time. Regenerating the server
module from its saved snapshot also matched exactly. The ignored artifacts
remain in this worktree at `.local/research-chart-release/`,
`.local/research-chart-release-reproduced/` and
`.local/research-chart-payloads/`; no generated production artifact was replaced.

```powershell
node scripts/research-refresh.mjs --season 2026 --schedule .local/research-chart-release/schedule.csv --pbp .local/research-chart-release/pbp.csv.gz --now 2026-11-07T20:00:00.000Z --out .local/research-chart-release-reproduced
```

An additional read-only projection audit used the real public Week 9 slate,
with current quote values explicitly unavailable. All six periods returned
320 permitted bounded row curves and one full shortlist curve. Replies measured
1.14–1.31 MB JSON. Warm local Node reads took 38–49 ms; the first source/hash
read took 163 ms. These measurements are local observations, not hosted Edge
CPU guarantees. The manifest records every period and the absence of raw
records/matched IDs.

## Compatibility and remaining release work

Recommended target order: **compatible API, frontend, then the existing hourly
public research refresh from merged source**. No SQL, migration, new odds
collection, paid source, provider-budget or scheduled-job change is required.

The added fields are optional. Old readers ignore new asset/API fields.
The new API reads old prepared assets, derives honest compact previews from
their existing full bins, and omits unavailable season rows. The new frontend
also reads an old API: available full curves remain usable, non-shortlist
details still use the existing endpoint, and missing seasons display
“Season summaries unavailable for this prepared sample.” Empty samples do
not acquire curves or a fabricated season. No calendar-year inference fills
that gap.

The existing hourly refresh must execute the new merged preparation source
before exact season arrays appear in published assets. This branch does not
publish that data, deploy API/frontend, change production credentials, open a
PR or establish release approval. Parent review, integration/CI, hosted release
verification and physical-phone acceptance remain. Preserve other unpublished
worktrees and the frozen v62 tracker.
