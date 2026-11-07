# Team and league logos — individual glass circles

Sean said **“Looks good. All logos should have circles”** after the league
placements at `935f457b9219b51376f3be4405f2109759bdd895`, then clarified
**“Team and league logos only (recommended)”**. The GTL G is excluded.
The supplied league and team-circle placements are now approved by Sean
(“Good.. continue”), reviewed at `d109e5386b49093f66b173492261bbb5e126739a`.
[Current full-name wording review](LEAGUE_WORDING_REVIEW.md) preserves this approval.

| Current mockup | Dark | Light |
|---|---|---|
| Home | [Dark](previews/team-league-circles-home-dark-phone.png) | [Light](previews/team-league-circles-home-light-phone.png) |
| Play | [Dark](previews/team-league-circles-play-dark-phone.png) | [Light](previews/team-league-circles-play-light-phone.png) |
| Bets | [Dark](previews/team-league-circles-bets-dark-phone.png) | [Light](previews/team-league-circles-bets-light-phone.png) |
| Research | [Dark](previews/team-league-circles-research-dark-phone.png) | [Light](previews/team-league-circles-research-light-phone.png) |
| EPL | [Dark](previews/team-league-circles-epl-dark-phone.png) | [Light](previews/team-league-circles-epl-light-phone.png) |
| Account | [Dark](previews/team-league-circles-account-dark-phone.png) | [Light](previews/team-league-circles-account-light-phone.png) |
| Research team list | [Dark](previews/team-league-circles-teams-dark-phone.png) | [Light](previews/team-league-circles-teams-light-phone.png) |
| Spread draft entry | [Dark](previews/team-league-circles-draft-dark-phone.png) | [Light](previews/team-league-circles-draft-light-phone.png) |
| Tracked ticket | [Dark](previews/team-league-circles-ticket-dark-phone.png) | [Light](previews/team-league-circles-ticket-light-phone.png) |
| FEPL Fantasy | [Dark](previews/team-league-circles-fepl-dark-phone.png) | [Light](previews/team-league-circles-fepl-light-phone.png) |

Each team keeps its own glass circle, border and shadow. Paired logos retain
separate backgrounds. Artwork proportions, displayed team names, dimensions
and actions are preserved. Two former portrait tiles become square before
rounding: Home 34x34 and compact research list 32x32. Other sizes stay as
defined by their existing component. Images use contain-fit and unclipped
overflow so their artwork is not cropped. Operational marks with a nested
TeamMark use a transparent inner tile and one outer glass circle.

The adapter covers the existing prototype tiles, native NFL TeamMark, EPL
crests and game/draft/research/operational wrappers. The selected league
circles continue unchanged. The original G, existing initials and source
artwork are untouched. No new avatar or award work is included.

## Evidence and limits

200 responsive layouts across 25 representative views at 320/390/768/1440
widths and both themes passed shape/image checks: 1,584 circle measurements
and 1,712 decoded team marks. All audited known wrappers are square circles,
all matching team images have a recognized wrapper and contain-fit, the G is
outside those wrappers, and no horizontal phone overflow was found. Twenty
phone captures were inspected. No page errors, provider/auth reads, non-GET
requests, storage writes or OS dialogs were observed. A local CSS connection
failure in the initial rapid audit prompted a separate settled-resource audit
before publication; final results are recorded in the selection metadata.

Coverage includes six overviews, league, games/teams/Fantasy/game research,
Spread/Total/Points/score, receipt/entry, EPL draft/confirmation/moneyline/
leaderboard/Fantasy, game bets and referee operations. This is representative
verification of the shared adapter, not an assertion that every nested state
has new owner approval or that every abbreviation has been replaced.

The six-screen gallery now uses these current captures. Historical approved
captures remain unchanged. Existing public historical/fictional labels and
unknown ticket terms remain; no live account, source or preference is read or
changed. Standalone preview stylesheet injection only; no production source
or bundle entry changed. Brand QA, syntax, JSON, hashes and links are checked
before publication. No merge, deployment or migration.

The explanatory wording question is now resolved: full league names in
explanations, logos in navigation. See the current wording review linked above.
NBA is parked. New avatars/photos and popup/award exploration remain held,
and the three parked Signal files remain untouched and unpublished.
