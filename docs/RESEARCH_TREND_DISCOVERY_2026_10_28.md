# Research trend discovery — October 28, 2026

Owner: Codex · DESIGN-01 follow-up · Open discovery work

Sean supplied [this Bet Labs post](https://x.com/bet_labs/status/2115511415985291720)
and asked how GTL can find the distinctive situations he sees on X. The post
reports a 12-game Bryce Young ATS streak after a loss and quotes Carolina +3.5
against Green Bay. The post text was retrieved from X's public syndication
response; direct page retrieval returned 403. The image was not inspected. This
record neither verifies that current quote nor establishes permission to reuse
the publisher's image, feed or proprietary database. No source feed was enabled.

## Reproduced example

An offline calculation using GTL's existing engine reproduces 12 wins, zero
losses and zero pushes in the latest 12 qualifying games available in the
checked-in history. That history's latest completed game is October 11, 2026;
this is not an up-to-date hosted audit. The matching games below run from
January 5, 2025 to October 4, 2026. The full qualifying sample is 17–11–2;
the earlier 18 games are 5–11–2. Showing the preceding sample is material to
understanding a perfect recent run. This is retrospective discovery, not an
independent prediction test or a reason to assume the next result.

Exact interpretation: Bryce Young is the recorded starter in the current game,
and Carolina lost its immediately preceding **team game in the same season**,
regardless of who started that previous game. A season opener has no prior-game
match in this engine. Regular season and postseason are included. A
recorded spread is required; the latest 12 qualifying games include pushes if
present. The post does not supply a full query specification, so matching its
headline does not establish identical author definitions or historical prices.

The existing `shared/trends.mjs` calculation uses:

```js
const preset = { market: 'team_ats', atoms: ['qb:00-0039150', 't:t_off_loss'] };
const rows = [...T.parseCsvRows(historyCsv).rows, ...T.parseCsvRows(seasonCsv).rows];
const config = { corrections, venues };
const features = T.buildFeatures(T.normalizeRows(rows, config), config);
const matches = T.betUnits(preset,
  features.filter(game => game.played && game.spread !== null),
  { rules: corrections.rules ?? {} }
).sort((a, b) => a.g.date.localeCompare(b.g.date) || a.g.id.localeCompare(b.g.id));
const latest = matches.slice(-12);
```

The line source is the nflverse schedule file's last recorded line; its book is
not documented. No actual-price ROI or current executable price is inferred.

| Game ID | Date | Carolina handicap | ATS result |
| --- | --- | --- | --- |
| `2024_18_CAR_ATL` | 2025-01-05 | +7.5 | Covered |
| `2025_02_CAR_ARI` | 2025-09-14 | +7 | Covered |
| `2025_03_ATL_CAR` | 2025-09-21 | +5.5 | Covered |
| `2025_05_MIA_CAR` | 2025-10-05 | +1.5 | Covered |
| `2025_09_CAR_GB` | 2025-11-02 | +12.5 | Covered |
| `2025_11_CAR_ATL` | 2025-11-16 | +4.5 | Covered |
| `2025_13_LA_CAR` | 2025-11-30 | +10 | Covered |
| `2025_16_TB_CAR` | 2025-12-21 | +3 | Covered |
| `2025_18_CAR_TB` | 2026-01-03 | +3 | Covered |
| `2025_19_LA_CAR` | 2026-01-10 | +10 | Covered |
| `2026_02_CAR_ATL` | 2026-09-20 | -2.5 | Covered |
| `2026_04_DET_CAR` | 2026-10-04 | +4.5 | Covered |

Input SHA-256 values:

- `shared/trends/history-1999-2025.csv`: `d41ad4312a9c5598628db2308acc04ca8f78d1d74547669cd47e2284fbfe7424`
- `shared/trends/season-2026.csv`: `5cd8cac04eae3fcb5a6b19de36b027a5cde492f543266124d909f8be3efe0a99`
- `shared/trends-corrections.json`: `fcac34e2b44421a75207fd45838217c36b0e1d7adc1896a7cce6a02fe6e3d5d9`
- `shared/nfl-venues.json`: `8f22d135f198c171e59f98d99e047eb33b71bbb71d4f1617d2464f2b7e944188`

## What already exists and what is missing

The engine already computes team, QB and coach identity, previous results,
ATS outcomes, rest, schedule and other historical conditions. The current
Research candidate wrapper draws from a frozen registry of non-variant presets
with at most two conditions. It does not generate QB-plus-prior-result
combinations from every entity. Its upcoming-game mapper explicitly declines
QB/coach/referee-dependent predicates; these need separately verified pregame
inputs before they can drive applicability or leans.

The D-63 builder is approved and source merged. Its exposed filters cover
schedule, rest, travel, venue, observed weather and numeric ranges, but it does
not expose QB identity or previous-game-result conditions. Its existing label
is "Found by search — not tested". The reviewed external-post reader exists,
but Bet Labs is not in its configured source list, and manual reviewed entries
are not an unattended X connection. Source discovery and calculation must be
tracked separately from the completed chart presentation work.

## Next work, in dependency order

1. **Freshness and definitions.** Verify the currently served history version
   and update through the latest permitted completed results. Expose the cutoff,
   missing lines, postseason setting and previous-team-game versus previous-QB-
   start definitions. Keep source attribution, access rules and free-only budget.
2. **Reproduce submitted examples.** Retain source URL/date and extract exact
   entity, market, side, conditions and window into a versioned candidate. Print
   matching games and differences from the author's claim. An unresolved claim
   remains source-reported; unknown data never becomes a passing condition.
3. **Broader candidate discovery.** Begin with bounded, versioned combinations
   of team/QB/coach and one supported situation: off a loss, blowout loss, bye,
   short rest, home/road or favorite/underdog. Keep fixed recent windows and full
   history visible. These are proposed families to implement, not already
   registered candidates or a change to the frozen study.
4. **Record selection and test stability.** Preserve every query and its failed
   results, searched windows and discovery time. Compare earlier history and
   season splits, group overlapping evidence, and track new games after
   registration. Searching more combinations can produce impressive records by
   chance. The committed October 21 diagnostic already illustrates the problem:
   three recent-consistency qualifiers on actual outcomes versus an average
   5.65 across 20 shuffled runs. That is a warning diagnostic, not a forecast
   probability or a new estimate of false-discovery rate.
5. **Surface relevant discoveries.** Match candidates to verified upcoming
   situations with the existing per-game market gates. Put small recent streaks
   in Explore with their discovery label and full context. Preserve the existing
   consistent-shortlist policy; a 12-game run alone does not meet its 30-game
   recent-consistency route. Do not relax thresholds merely to fill cards or
   order the default shortlist by the largest win rate.

Exit criteria: the submitted Bryce Young example is reproducible from a versioned,
fresh dataset in the product, its full and earlier samples remain inspectable,
entity/condition definitions are visible, missing starting-QB information blocks
current applicability, and derived findings retain their discovery/prospective
boundary. Source-code CI, hosted release/readback and physical-device acceptance
remain separate. Broader search, builder extensions and automated ingestion are
**unimplemented** in this batch; no new product-policy decision is recorded.
