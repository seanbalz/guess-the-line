# Player Props — source readiness and approved design

Owner: Sean Balsiger. Observed November 9, 2026.
Status: design approved with shared-app consistency required; source audit partial.
No Player Props implementation, SQL apply, collection activation or deployment.

The audit source baseline is `9a34f9e47d5fb7dd32eecd6fdc697cef53340ed9`.
Separate [PR #508](https://github.com/seanbalz/guess-the-line/pull/508) reserves
D-81 for NFL spread/total gap magnitudes. Player Props uses D-82; do not borrow
that game-line calibration for prop stats or infer its pending change is live.
Reconcile fresh main before writing executable product-subsystem plans.

## Approval and visual contract

Sean approved the [design and both Dark/Light boards](superpowers/specs/2026-11-09-player-props-design.md):
"Looks good as long as it's aligned with the rest of the apps designs."
The mockups define the approved compositions and interactions, not replacement
fonts, artwork or a second visual system. Their fingerprints are in the spec.

Implementation must reuse the [brand guide](BRAND_GUIDE.md),
`design/tokens-next.json`, the shared UI kit and the destination's approved frame.

| Part | Existing authority to reuse | Acceptance |
| --- | --- | --- |
| Canvas, text, typography | Shared Prism theme tokens and system font | Same charcoal/ivory and Porcelain/deep-green recipes as surrounding screens; no image-derived colors or fonts |
| Floating cards | `web/src/next/ui/Card.jsx` and shared styles | Existing glass, radius, outlines and elevation |
| Main action | `web/src/next/ui/Button.jsx` | Transparent primary action with the selected full green outline |
| G, team and league marks | `FieldMark.jsx`, `TeamMark.jsx`, shared league components | Selected G without a circle; each team/league mark has its own circle and existing artwork/error fallback |
| Filters and details | `Segmented.jsx`, `ChipRail.jsx`, `Nest.jsx` and existing field styles | Existing labels, targets, selected states, focus and entry/Back behavior |
| Bottom navigation | Shared `web/src/next/shell/` navigation | Same Home/Play/Bets/Research glass bar and measured content clearance; no per-screen replica |
| Accuracy and paper record | Existing chart and Bets card patterns | Native-unit accuracy and paper W–L–P visibly separate; no grids of empty stat tiles |

Compare the implemented screens with their actual adjacent app destinations in
both themes at 320/390/768px, short height and enlarged text. Include keyboard,
focus, reduced motion and accessible chart evidence. Synthetic browser approval
does not establish a real-phone or signed-in production pass. A new composition
beyond the approved boards and existing receipts needs its own visual review.

## Confirmed source capabilities

`shared/research-markets.mjs` recognizes all eleven selected quantitative market
keys. `cloud/research-provider.mjs` can normalize per-event quotes from DraftKings,
FanDuel and BetMGM when a unique eligible current-game roster identity is supplied.
It validates the scheduled matchup/kickoff and market observation time; names alone
are insufficient. These are implemented adapters, not proof of populated quotes.

`scripts/research-intake.mjs` collects only with an explicit operator flag and
job. It permits at most four requests per intake job and eight markets per request.
`gtl_begin_research_quotes` reserves the requested market count, requires recent
preflight, respects the existing shared lease and 50-credit reserve, and does not
refund uncertain requests. Existing core collector limits remain unchanged.
Page reads do not collect odds. A comprehensive eleven-market game needs at least
two such requests when every market is available; no all-slate sweep was enabled.

The provider's [current terms](https://the-odds-api.com/terms-and-conditions.html)
allow application display, retention and derived analysis while restricting
standalone raw-data redistribution. The [V4 documentation](https://the-odds-api.com/liveapi/guides/v4/)
prices event odds by returned markets and regions/bookmaker groups. Its historical
event-odds endpoint is paid-only. This audit used documentation, not the key or
any quote endpoint; it did not spend odds credits or authorize paid history.

The audited public [nflverse weekly player-stat asset](https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv)
was downloaded at 18:15:05 UTC and matched GitHub's published byte count and digest:

- Asset ID `727734232`, updated `2026-11-09T14:15:08Z`, 4,178,818 bytes.
- SHA-256 `dcebb2e00bfbf667a078d078af9a169adff10dde1bea2b8e8cae83c195d8584a`.
- 9,393 regular-season rows, covering weeks 1–9; 3,016 QB/RB/WR/TE rows.
- All 3,016 offensive rows have player/game identities, without duplicate
  player/game pairs. This does not verify a join to hosted application event IDs.
- Each selected raw-stat field exists and is numeric on those offensive rows.
  A numeric zero does not independently establish participation or official finality.

| Prop market key | Raw result column | Unit |
| --- | --- | --- |
| `player_pass_yds` | `passing_yards` | yards |
| `player_pass_completions` | `completions` | completions |
| `player_pass_attempts` | `attempts` | attempts |
| `player_pass_tds` | `passing_tds` | touchdowns |
| `player_pass_interceptions` | `passing_interceptions` | interceptions |
| `player_rush_yds` | `rushing_yards` | yards |
| `player_rush_attempts` | `carries` | attempts |
| `player_rush_tds` | `rushing_tds` | touchdowns |
| `player_reception_yds` | `receiving_yards` | yards |
| `player_receptions` | `receptions` | receptions |
| `player_reception_tds` | `receiving_tds` | touchdowns |

The [player-stat loader](https://nflreadr.nflverse.com/reference/load_player_stats.html)
documents weekly results and player identities; the upstream repository supplies
its [CC BY 4.0 license](https://github.com/nflverse/nflverse-data/blob/main/LICENSE.md).
Retain attribution and source hashes. The existing Fantasy adapter omits
completions and publishes estimates/aggregates rather than immutable per-prop
actual-result receipts. Reuse verified raw inputs, not fantasy points or projections.
Accuracy against a saved sportsbook line does not require a final player stat;
the separate paper win/loss record does.

## Unverified dependencies and activation decision

The connected Supabase project inventory returned `UNAUTHORIZED`, requiring
reauthentication. No hosted query was executed, so this audit cannot claim a
zero quote count, current eligible book coverage, remaining quota, a current
roster join or a ready Player Props schema. Existing release metadata confirms
API v52 and migration-history state for the separate period-filter release;
it does not answer these prop-data questions.

| Dependency | Result | Required next evidence |
| --- | --- | --- |
| Current prop market support | All eleven keys recognized in source | Actual retained complete quote coverage by event/player/stat and distinct book |
| Raw result columns | Verified public file through Week 9 | Mapped scheduled event, participation, finality and correction receipt before paper grading |
| Current roster/event mapping | Adapter requires it | Verified stable current roster and hosted event join; never name-only matching |
| Three-book scoring references | Existing Guess policy is authoritative | Reviewed prop-specific adapter and eligible median receipts in native units; do not call a single best-price quote a consensus |
| Current free quota | Reservation protections exist | Read-only current budget and cadence capacity, without increasing allowances |
| New guessing storage/API | Not implemented | Additive guarded domain/storage/API, immutable locks, audits and separate Guess-value privacy checks |
| Live lock-in | Not ready | All preceding data, capability, review and release gates satisfied together |

Research's recorded-offer expiry/visibility and a Guess scoring reference are
different contracts. Do not reuse the Research reader as an unaudited scoring
receipt. Sean's explicit choice hides market lines only on the guess-entry
screen; Research and other users' tracked-bet quote gates remain unchanged.
Drafts/opponent guesses still need their separate privacy protections.

The [readiness plan](superpowers/plans/2026-11-09-player-props-readiness.md)
finishes the missing read-only evidence before a live-lock-in implementation plan
is treated as actionable. Its outcome must distinguish incomplete access,
observed absence and verified coverage. No new consumer mode is enabled by this
document. Named migration applies and protected deployment remain separate.

The [structured projection](evidence/PLAYER_PROPS_READINESS_2026_11_09.json)
contains only source metadata and aggregate checks. Raw downloads, hashes,
inspection logs and the connector error remain ignored locally. No private
player guesses, roster memberships, provider key or service credential is published.
