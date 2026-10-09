# Guess The Line visual polish

## Current implementation — October 8, 2026

The team-logo follow-up expanded coverage to 15 transparent local team marks,
with individual source versions and checksums in [TEAM_LOGO_SOURCES.md](TEAM_LOGO_SOURCES.md).
The registry now lives in `web/src/teamLogoRegistry.js` and is imported by
`TeamIdentity`. Buffalo and the New York Jets now use individually verified
Commons assets. The other 17 teams show original Guess The Line badges under
D-22 (October 9, 2026); official-mark rights checks for them remain pending.
This is partial actual-logo coverage. Isolated
Light/Dark, 320px/390px/1440px, transparency, image failure and accessible-name
checks passed. These two additions are local; production release verification
is recorded separately in CLOUD_SETUP.

## Earlier empty-registry review (historical)

The following records the first pass before the dedicated logo worker. Statements
about no activated assets are historical, superseded by the current section above.


Owner: visual aesthetics workflow agent · Reviewed October 8, 2026

## Scope and current result

Sean requested a dedicated visual aesthetics agent, starting with transparent NFL team logos in place of abbreviation tiles. The selected Yardline G identity and Field monogram app icon remain unchanged. Type, palette and other brand categories remain provisional.

`web/src/TeamIdentity.jsx` and `web/src/teamIdentity.css` provide a reusable team identity component. An approved local transparent SVG, PNG or WebP can render without a tile, crop or background. Team names remain available to assistive technology, images reserve their size to avoid layout shifts, and a missing or failed asset displays an original abbreviation shield. All fallback styling uses the existing semantic tokens.

The same file exports `TeamMatchup({game, compact})`: equal-width away/home columns, an explicit location label, consistent image spacing and responsive team-name wrapping. The compact version retains full team names for assistive technology. Narrow screens align the full matchup's identities above their names instead of squeezing long names into one line.

**No official team logo assets are activated.** The approved asset registry is empty. Preparing a component does not establish permission or satisfy the request for actual team artwork. The component is ready for integration; publication and its first live appearance must be verified separately.

## Source evidence

| Source | Verified evidence | Decision |
| --- | --- | --- |
| [nflreadr team graphics](https://nflreadr.nflverse.com/reference/load_teams.html) | Provides current team metadata with ESPN and Wikipedia image URLs. | A usable image URL is not a redistribution grant. Do not import the image set solely on this basis. |
| [nflfastR license](https://raw.githubusercontent.com/nflverse/nflfastR/master/LICENSE.md) | MIT license covers the software and associated documentation. | Does not establish ownership or permission for linked NFL artwork. |
| [TheSportsDB terms](https://www.thesportsdb.com/docs_terms_of_use.php) | September 17, 2026 terms separate original artwork licensing from third-party logo rights. An API subscription does not itself grant those third-party rights. | No verified free NFL asset grant; no subscription purchased. |
| [NFL terms](https://www.nfl.com/legal/terms/) | Team-mark rights are reserved; no general reuse grant established. | No assets copied from NFL sites. |
| [Dallas Cowboys on Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Dallas_Cowboys.svg) | The star is marked public domain as simple geometry; the record separately flags trademark conditions. | Not treated as blanket clearance for a complete NFL logo set. No asset imported. |

This is an evidence record, not a conclusion that every reference to a team logo requires a paid license. The project specifically requires verified asset rights. No permission covering this app's use has been recorded, and no restricted source is substituted merely because the image can be downloaded.

## Activation path

1. Record an image-specific source and an applicable free display/redistribution grant or permission for this use. Keep third-party conditions distinct from a data library's software license.
2. Add the permitted, unmodified transparent assets under `web/public/team-logos/`. Record team, source, creator/rightsholder, applicable terms, attribution, review date and any expiry below. No private league data belongs in this folder.
3. Add each reviewed entry to `approvedLogos` in `TeamIdentity.jsx` with `src`, `rightsStatus: 'approved'`, `transparent: true`, and a `rightsReference` pointing to its record. Do not expose an arbitrary external image URL field to the client.
4. Check transparency, sizing and legibility against Light and Dark at 320px and desktop width. Confirm a missing file falls back cleanly and screen readers still announce the correct team.
5. Replace abbreviation markup in the common matchup component and compact dashboard matchup rows. Verify the production artifact and record the actual deployed coverage; do not label partial coverage as a complete set.

### Approved asset register

No entries as of this review.

## Visual priorities

| Priority | Improvement | State / exit condition |
| --- | --- | --- |
| 1 | Team identity is consistent in matchup rows, detail views and ballot cards, with clear home/away order. | Full and compact component prepared, including responsive alignment and labels. Official logos await a recorded eligible source. |
| 2 | Give each matchup one clear decision strip: your guess, dated market reference and a validated model projection when available. | Proposed. Keep unavailable model data explicit and keep Spread/Total reveal gates separate. |
| 3 | Keep one primary action per matchup and reveal supporting source, book and model detail on tap. | Proposed. Touch targets at least 44px; expanded information usable by keyboard. |
| 4 | Establish a quieter hierarchy: stronger key numbers, consistent compact source age, fewer repeating borders, aligned columns. | Proposed. Use shared tokens and verify Light/Dark at 320px before publishing. |
| 5 | Animate only meaningful changes with subtle movement; preserve stable positions and provide a reduced-motion version. | Existing dashboard controls are the foundation. Additional effects need real state changes, not simulated live activity. |

## Verification

JSX transformation and server rendering passed. The fallback's Light/Dark 390px screenshots were inspected, 320px viewport checks found no horizontal overflow, accessible team labels were present, and an empty approved registry made no image requests. Full and compact matchup previews also fit at 320px and 1440px; visual review prompted top alignment for mobile team identities when only one name wraps. Screenshots are `.local/previews/team-identity-fallback-light.png`, `.local/previews/team-identity-fallback-dark.png`, and the corresponding `team-matchup-fallback-*.png` pair.

After the primary agent integrated both placements, nine existing cloud-browser checks passed: desktop keyboard/layout behavior, all five layouts at 320/390px in both themes, separate Spread/Total comparison gates, and Total drilldown under league and weekly fixture scope. Screenshot review caught a legacy no-wrap style that made team names collide despite passing the page-width check. A scoped CSS override repaired wrapping; the six affected comparison and phone-layout checks then passed again. The inspected actual-app fixtures include `.local/previews/compare-picks-320.png`, `.local/previews/compare-picks-390.png` and `.local/previews/dashboard-preferences-390-dark.png`. All remote requests were intercepted with test accounts and fixture data; no live picks were accessed or changed. The temporary test server stopped after completion. The primary agent deployed Pages 3de3c6d1 and verified the live component, exact release asset and preserved Total scores. Production screenshot: `.local/previews/live-total-visual-release.png`. Actual team-logo screenshots cannot be provided until eligible assets are activated.

Integration points for the primary agent: import `TeamMatchup` into `App.jsx` and replace the body of its common `Matchup({game})` function with `<TeamMatchup game={game}/>`; import it into `VisualDashboard.jsx` and replace the raw abbreviation text inside `.gap-game-label` with `<TeamMatchup game={game} compact/>`. Keep the surrounding disclosure's accessible name and action behavior unchanged. Verify in actual ballot/comparison/challenge tables, since full team names can affect column width.

The final chart pass also separated y-axis labels from endpoint values and
increased the compact left gutter. The existing 320px Light layout check passed
and its regenerated screenshot was inspected before publication.
