# Research data flow repair

Owner: Sean Balsiger · November 1, 2026 · Implementation and local validation

Sean reported an empty research view after the October 31 release and requested
further development. That release delivered the interface and private storage,
but no research snapshots had been published, no source-feed worker was running,
and the October 21 bundled trend snapshot no longer matched the public source.
Deployment and access-denial checks did not establish populated research.

This repair connects free nflverse results and play-by-play to a separate data
release. It preserves Guess the Line guesses, scoring, references, locks and
reveal rules. It introduces no migration, paid feed, odds quota or quote request.

## Data production and delivery

`scripts/research-refresh.mjs` downloads schedule history and current-season
play-by-play, computes the existing registered trend rules offline, and produces
six compressed period files plus a checksum index. Each file contains completed
historical evidence, redacted upcoming schedule context and observed matchup
statistics. No account data, user guesses, external post payloads or current
sportsbook offers are published. Exact downloaded source bytes remain ignored.

The builder refuses an absent season, overdue missing finals, missing completed
games in play-by-play, invalid publication shapes and oversized artifacts.
The assessment adapter accepts the engine's actual ISO event timestamps as well
as legacy date-only coverage, preserving chronology and rejecting invalid dates.
The prior date-only check discarded otherwise qualifying prepared findings.
Pass attempts include observed incompletions/interceptions with zero passing
yards. The importer accepts actual nflverse quoted CSV and uses its `play_type`
field when the optional `no_play` column is absent. No-play penalties are excluded;
unknown play status stays unknown. Team aliases follow GTL's established mapping.
Every matchup's sample excludes its own game and all later observations.

The Research data refresh workflow runs every four hours on main, with a manual
dry-run option. It needs only GitHub's repository token, and never receives
Supabase or odds-provider credentials. Immutable files upload and pass public
byte readback before `research-data-<season>/index.json` changes. Superseded files
remain for 48 hours for cached readers, then only generated, noncurrent assets
are pruned after successful readback. This bounds release growth. Workflow failure retains the
previous publication; a green build alone does not prove upload/readback.

`cloud/research-data.mjs` reads that release with bounded, allowlisted GitHub
redirects, compressed/decompressed size caps, SHA-256 verification, schema checks,
coalesced requests, a five-minute index cache and two decoded period entries.
Failures back off for a minute. The bundled snapshot remains a fallback. Neither
fallback nor a cached publication bypasses the existing live completed-source,
schedule and missing-final freshness checks. Changed data pauses historical
recommendations until a matching build arrives; normal delay can be four hours
plus GitHub scheduling/publication delay.

## What players see

Research recommendations requests the latest published account week from the
server, independently of a private league's older selected week. It displays that
season/week. Research's main landing links to recommendations. Every week's game
statistics are reachable from the recommendations list, including when there is
no qualifying bet. Matchup views expose observed scoring, recent games, play
success, passing yards per attempt, rushing yards per carry and observed sacks,
with samples, exclusions, dates, definitions and attribution.

Public completed scoring facts remain available under the existing team-record
policy. Play statistics retain both-market reveal gates and source/as-of checks.
Assessment claims, quotes, colors and dependencies retain their existing gates.
No new selection qualifies merely because descriptive statistics exist.

Data coverage distinguishes fresh/stale/unavailable historical research, current
retained prices, observed plays and separately imported external evidence. Empty
states distinguish locked markets, pregame closure, unavailable prop/moneyline
coverage and filters. Refresh reads stored research/prices; it does not collect
odds. The existing twelve-hour quote collector and six-hour game-quote validity
can still leave periods without qualifying prices; those stay gray.

## Verified real-source build

The November 1, 03:34 UTC build used schedule SHA-256
`49563bdbea5280553254b146302ad40ceb82b688da535447e2bf2229b65d72ac`
and compressed play-by-play SHA-256
`653bf713cb9851a8a9d37787388f27a3a339c0e3429d0e64f611402d4328fe6f`.
It observed 108 completed games through October 29, produced 750 registered
trends (eight qualified by the existing historical rules), and 272 season
matchup-statistics entries. All 14 Week 8 matchups/28 teams have observed plays.
Qualification here describes the registered historical tests, not predictive
validation or a guarantee that eight trends apply to the current week's quotes.

An independent Python calculation matched Baltimore's 201 attempts, 1,694
passing yards (8.42786 yards/attempt), and 125 successful pass plays out of 237
known eligible dropbacks. Original source files and detailed receipts remain
under ignored `.local/research*` paths.

Local checks passed the 79 focused research tests, 28 focused component tests,
and both research browser flows. The flows cover source intake, filters,
opaque detail navigation, empty-with-statistics behavior, current-week requests,
and 320/390px Light/Dark accessibility. Exact committed CI, data publication,
app release, real signed-in populated readback and physical-phone acceptance
must be recorded separately before this repair is called live and accepted.

## Remaining source limitations

The eight selected X accounts still have no verified free automatic extraction
feed configured. Submitted URLs remain pending manual extraction/checks. The
three reference studies remain attributed source analyses in
[the stage-one record](RESEARCH_ASSESSMENTS_STAGE_ONE.md); this public-statistics
refresh does not turn those old posts into current recommendations. Proprietary
coverage/route/pressure charting, fresh prop offers and a validated green model
remain unavailable unless their own inputs and checks are completed.

## Operator reproduction

```sh
node scripts/research-refresh.mjs --season 2026
node scripts/research-refresh.mjs --season 2026 --schedule .local/research-release/schedule.csv --pbp .local/research-release/pbp.csv.gz --now <receipt-generatedAt> --out .local/research-reproduced
```

`node scripts/research-publish.mjs` publishes only the validated six files and
index from `.local/research-release`; raw sources and the local receipt are not
uploaded as release assets. Publication is separate from the protected API and
frontend release. Rollback can restore the previous index without deleting
evidence. The existing research off switches remain available.
