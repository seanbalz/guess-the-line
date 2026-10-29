# Varied trend discovery engine — October 29, 2026

Owner: Codex · Q21 / DESIGN-01 · Source implementation; product integration open

Sean asked to continue developing varied, relevant situations across distinct
samples. `shared/trends-discovery.mjs` and `scripts/discover-trends.mjs` now
implement the first offline discovery batch. It extends the existing historical
engine without changing the frozen study, published shortlist, leans or scoring.

## Implemented behavior

- Team, starting-QB and coach identities combine with one of 13 defined
  situations: team win/loss, blowout/close loss, bye, short rest, rest advantage,
  home/road, favorite/underdog, divisional and primetime. ATS backs the entity;
  totals evaluate both fixed Over and Under sides. Historical QB/coach results
  follow that identity across teams. Previous result means the preceding team
  game within the same season, not the QB's preceding start.
- Every query evaluates last 10, 12, 20 and 30 qualifying games, current season,
  previous season and full history since 2002. Pushes stay in game counts and
  leave win-rate denominators. Short windows show their actual count and an
  explicit incomplete-window flag. No arbitrary “best-looking” start date is
  searched. Season/full windows make no claim of a complete future season.
- Each selected window includes a strictly earlier, disjoint comparison. Recent
  windows overlap each other and are never presented as separate confirmations.
  Records before discovery and games beginning after registration remain
  separate; a retrospectively found streak never becomes a new holdout.
- All evaluated candidates remain in the report, including losing and empty
  queries, with exact game IDs, dates, exclusions and searched-window counts.
  Fixed -110 units are illustrative; actual-price returns stay unavailable.
- Variety selection uses entity-kind/market/side/family balance and latest activity, with
  entity/family caps. It never reads win rate, units or streak. Within a market,
  candidates sharing at least half the smaller selected sample form connected
  overlap groups. At most one representative per group appears. Transitive
  overlap and opposite Over/Under descriptions cannot manufacture extra votes;
  groups are not claims of statistical independence.
- An optional NFL week limits the catalogue to identities historically
  associated with teams on the remaining upcoming schedule. It verifies no
  current starter/coach or condition, prints that limitation, and cannot expand
  an empty week to the whole league. Unknown conditions are excluded and counted.
  Future finals/identities/quotes are removed before evaluation; duplicate source
  game IDs are refused.

## Fresh-source run

The existing free [nflverse schedule release](https://github.com/nflverse/nflverse-data/releases/tag/schedules)
was fetched, with original bytes retained locally. Source SHA-256:
`bf6c4fb7289d03e4927bbffd40e8578d4b2501298628f2dd526fdbb0608a0015`.
The last completed schedule date is **October 26**, versus **October 19** in the
committed Research snapshot and **October 11** in the older raw season file.
This task did not refresh/deploy the production snapshot or inspect hosted data.
Kickoff timestamps in results are UTC; evening US games can be the following UTC
date. The source does not document a bookmaker for its last recorded line.

Pinned run:

```sh
node scripts/discover-trends.mjs --season 2026 --week 8 \
  --file .local/trends-discovery/source-2026-10-29.csv \
  --now 2026-10-29T14:38:52Z
```

Use `--teams CAR,GB` for an explicit team scope and `--window recent20` to change
only the displayed discovery window. `--out` is restricted to `.local/`; no
network call occurs when `--file` is supplied. Default fetching uses the same
free source, without an odds-provider credit request or a recurring schedule.

The run evaluated **121 identities × 13 situations × 3 fixed market/sides =
4,719 candidates**, with **33,033 window evaluations**, retaining **312 empty
queries**. The complete report stays in ignored `.local/trends-discovery/`;
its checksum, input hashes, search counts and selected examples are committed in
[the compact run record](../model/trends/discovery-2026-10-29.json). Raw source and
complete query output are not covered by Git sync. Preserve those local inputs
for exact reproduction; a later upstream fetch can have different bytes.

The deterministic eight-example selection follows. These are discovered
historical records, not ranked betting recommendations or verified applications
to next week's games. “Earlier” uses the same conditions and side.

| Historical situation | Selected W-L-P | Games | Earlier W-L-P |
| --- | --- | --- | --- |
| Brian Schottenheimer as favorite · over | 9–3–0 | 12 | 2–1–0 |
| Jalen Hurts in divisional games · ATS | 6–6–0 | 12 | 8–10–2 |
| PHI at home · under | 6–6–0 | 12 | 101–96–6 |
| Andy Reid after a team win · ATS | 5–7–0 | 12 | 135–123–6 |
| Sam Darnold with 3+ more rest days · over | 7–4–0 | 11 | No earlier games |
| KC as underdog · ATS | 8–4–0 | 12 | 75–62–3 |
| Nick Sirianni in primetime games · under | 8–4–0 | 12 | 8–8–0 |
| SEA at home · ATS | 6–4–2 | 12 | 105–88–7 |

The Sam Darnold sample contains 11 games, fewer than the requested 12, and spans
multiple seasons; it is not described as 12 games or a current-season result.
The Bryce Young after-loss query is also retained in the full report, reproducing
12–0–0 recently and 17–11–2 overall. It need not displace another entity simply
because its record is perfect; default selection is result-independent.

## Verification

38 targeted Node tests passed with zero skips: discovery, existing Research
rules/diagnostics and prepared-snapshot checks. New cases cover disjoint earlier
samples, push denominators, partial windows, strict date/availability boundaries,
conflicting/duplicate games, both team sides, independent spread/total data,
future-identity redaction, same-season prior-game semantics, overlap chains,
kind/market/side/family variety, outcome/input-order invariance, empty-week scope, and CLI
reproduction/public-output refusal. The real checked-in Bryce example matches
the existing engine's exact game membership. Typecheck passed. Brand QA passed;
final source review accompanies publication; no UI changed, so browser or
physical-phone acceptance is not inferred from this engine test run.

## Remaining delivery

Own CI and merge are open. Next: compact reviewed publication and D-66 Research/
Explore integration, linked game-by-game evidence, entity/builder controls,
verified current assignments/conditions, prospective registration storage and
held-out/shuffled discovery evaluation. Keep the existing consistency thresholds
and reveal gates. Do not serve the large offline report or add thousands of
synchronous evaluations to an Edge request. No deployment, database apply,
automatic X ingestion or new source-budget approval was exercised here.
