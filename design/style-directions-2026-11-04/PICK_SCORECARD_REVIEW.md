# Pick-focused scorecard — November 7, 2026

Sean rejected both full-pill placements: “Neither option looks good”. He
requested more information, “kind of like a scorecard”, because it looked too
empty. He then explicitly selected **Pick-focused scorecard (recommended)**
in response to the pick-versus-game focus question. That resolves the focus;
the older below/inside placement question is superseded, not pending.

One fuller composition is supplied in both selected themes. Its visual
approval is **pending**. Earlier approved recipes remain closed.

| Dark | Light / Porcelain |
|---|---|
| [Phone scorecard](previews/pick-scorecard-dark-phone.png) | [Phone scorecard](previews/pick-scorecard-light-phone.png) |

[Rendered source](pick-scorecard-review.html) retains the selected glass,
charcoal/Porcelain, ivory/ink and lime/deep-green typography. It adds an
opponent row, separate circled team marks, smaller Broncos / Denver lines,
saved guess, comparison, difference, points ring, status and comparison chart.
Denver identifies the illustrated team's market, not a stadium or GPS result.
The original G and the rest of the app are unchanged by this proposal.

## Data and graphical meaning

The existing `historyExample('week')` in
[account-history-examples.mjs](account-history-examples.mjs) supplies fictional
Week 9 Denver/Seattle values. A local assertion executed against that fixture
verified guess −3.5, example comparison −4, absolute difference 0.5, locked
status and 9 of 10 illustrative points: `10 − (2 × 0.5) = 9`.
`reference.exampleMath` is true; source and observed time are null. These are
not actual saved records, fresh quotes or a verified game schedule.

The ring represents points, not win probability. On the −5 to −2 chart,
comparison −4 and guess −3.5 use a shared linear scale. Sample fields are
explicitly labelled. In production each mode must use its actual data and
reveal gates: do not apply Guess points to tracked sportsbook bets or expose
hidden comparisons/results. No new bookmaker identity or source time is made up.

## Verification and next step

Eight theme layouts at 320/390/768/1440 widths and sixteen team-image decodes
passed. Checks covered preserved fixture fields, two separate circular
backgrounds, contain-fit art, no horizontal overflow/clipped labels, linear
chart positions and a 90% points-ring fill. Both 390px captures were inspected.
Zero page errors, failed resources, external browser requests or non-GET
requests were observed. Brand QA, capture hashes and links are checked before
publication. This isolated static proposal has no controller, save, production
bundle entry or API change; a production rebuild is not claimed.

After visual review, adapt the identified History/Bets/shared-sheet labels
using typed team/game/mode context and retain fallback/privacy semantics.
The [deployment roadmap](DESIGN_DEPLOYMENT_ROADMAP.md) groups the work after
this scorecard into five workstreams. No merge, deployment or migration is
performed here. NBA, new avatars/photos and popup/award exploration stay held;
parked Signal files remain untouched and unpublished.
