# Research nesting cards — design (D-66)

Sean, October 28, 2026: "theres still way too much text across the app and not enough visuals and easy navigation
and progression like a chinese doll that you open and get a smaller version each time", then "im referring to the
research sections mostly". From five options on the
[comparison canvas](https://claude.ai/artifact/GGUqLvq7EpNL4j2g4ayEjk) he chose "Use option 1, Nesting cards, for
Research."

## Why

Measured on the live app (Mac mini Chrome, signed in, October 28):

| Research view | Words on screen | Page height |
| --- | --- | --- |
| Trends › Players | about 3,000 | 16,145px |
| Trends › Teams | about 2,100 | 13,713px |
| Explore games | about 810 | 4,787px |
| Trends › This Week | about 725 | 5,256px |
| Trends › Build | about 655 | 3,252px |

Each view is one long page. Each tap should instead open one smaller layer that does one job.

## The nesting-card contract (every Research layer)

1. **One layer, one job.** A heading, at most one meta line, then a grid or list of tappable units. No sentence
   longer than twelve words sits on a layer's surface. The one exception is a lock tile's single sentence saying how
   to unlock it.
2. **One picture and one big number per unit.** A unit can be a team mark, a meter, a chart or result blocks. Numbers
   use the number type (Barlow Condensed).
3. **Parents stay visible as lips.** Every open parent layer stays visible as a stacked tab above the current card,
   each inset one step further, so the card reads as the smallest doll. Tapping a lip returns to that layer. Browser
   or OS back closes one layer. Each layer has its own address, so a reload or a shared link reopens it.
4. **Honesty stays on the surface as tags; fine print goes behind ⓘ.**
   - **On the surface:** the sample size and the tier words ("No proven edge", "Not proven" and so on) stay visible
     as tags.
   - **Behind ⓘ:** the plain sentence, conditions, notes, the trends footnote, the evidence freshness and the
     nflverse CC BY credit live in the layer's ⓘ. Each is one tap away and is also listed in Menu › Guidance (D-55
     rule 10).
5. **Gates are unchanged.** A line trend whose market is closed shows a lock tile and never its number (D-31, D-36).
   Player picks follow D-31.
6. **Tokens only.**
   - Colors and type come from the D-38/D-55 tokens.
   - Lime marks only your selection and the one primary action.
   - Icons are Lucide.
   - Motion is transform and opacity only, and respects reduced motion.

## The primitive

`web/src/next/ui/Nest.jsx` exports `Nest({ label, lips, title, info, children })`.

- `lips` is a list of the open parents, outermost first: `{ key, label, onOpen }`. Each lip is a real `<button>`
  labelled "Back to <label>", inset `--gx-nest-step` (8px) per depth.
- The card holds the `title` heading and the optional ⓘ `info`.
- When the layer changes, focus moves to the heading (`tabIndex=-1`) so screen readers hear the new layer.
- At 320px the inset stops at three steps, so the card keeps at least 254px of content width.

## First rollout: Trends › Teams

Today Teams is one section per published game, each with up to three trend cards and their window tables. The new
version has three layers, matching the canvas.

1. **Teams.** A grid with one tile per team playing in the published week.
   - **Tile content:** the team mark, plus the team's record in this venue as the one big number. That is the
     `teams[code].ats` row for Spread and the `teams[code].ou` row for Total, both from `game.entities`. A meter
     shows the side-A share with a break-even tick at 52.4%.
   - **Locks:** a team whose record is locked or missing shows "—" and no meter.
2. **One team.** The heading is the team name, with the game's matchup and kickoff in the one meta line. Below it,
   one tile per trend about that team, in the current market, strongest first:
   - the team's own venue rows: `ats`, `ou`, `su`;
   - the head coach and QB rows (the QB rows are tagged provisional);
   - situational and line cards whose `team` is this team.

   Each tile shows the short title, the record as the big number and a meter. A locked card shows the lock tile.
3. **One trend.**
   - **With chart points:** a card that has chart points opens the existing D-55 `TrendDetail`, which includes its
     pill and ⓘ.
   - **Otherwise:** the big record, then the sample and tier tags, then an ⓘ with `trendInfoBody`.
   - **Below either:** "Windows and dates" opens the existing window table, and "Game details" opens the game sheet.

Addresses: two new Trends view keys, `teamsTeam` (team code) and `teamsTrend` (card key). Both are added to the
router allowlist. Changing either one counts as navigation, so back closes one layer. Unknown or stale values fall
back to the nearest valid layer.

## Later rollouts (same contract, one PR each)

1. Trends › Players (second rollout): Players › player › measure. The player's By team layer goes to a team, then
   to one direction. Players also has This week › one game. The history window stays as one select. The team and
   matchup filters and "Compare history windows" are replaced by these layers.
2. Trends › This Week (third rollout): This week › game › trend. The first card keeps the evidence freshness line
   as its one meta line and holds the saved-trends tile, the top three trends and the game tiles. The Team and Matchup
   filters are replaced.
3. Explore games (fourth rollout): it already nests as board › game sheet › detail sheets, and the game sheet is
   lean (about 190 words). Half the board’s text was the same source and update line under every card, so the board
   now says it once. Its meta line carries the update time, the ⓘ carries the source, and each game sheet still lists
   its books and times. The per-quote freshness labels and final-score provenance stay on the cards.
4. Trends › Build (fifth rollout): a tool rather than a browse path, so it keeps its form. The result card leads
   with the record as one big W-L-P and a cover meter, and the other D-63 facts become tiles under their exact labels.
   “By season” moves into a disclosure. The paragraphs that repeated the card’s ⓘ (what “not tested” means, the
   period split, the reference note, the line source and the credit) come off the surface. The “Found by search — not
   tested” tag, the period table and its one-line reading stay.
5. Fantasy (sixth rollout): one rankings card leads to one player. The rankings card leads to the report card and
   to Compare.
   - **Rankings card:** one meta line (week, period, scoring, stats through). Period, season, week, scoring and
     position are visible, and the other filters sit under "More filters". Tiles lead to the report card and Compare,
     and each ranked player is one tile with one big estimate.
   - **Player layer:** the estimate, the trends as tiles, the matchup behind a disclosure, and the profile and compare
     tools. The method, scoring rules, sources and trend sentences sit behind ⓘ.
   - **Lips:** a lip that returns to the place just before goes back, rather than adding a step, so the next Back
     leaves the section.

## Tests

- Unit tests for the data mapping (`teamNest`): team ordering, market rows, lock tiles with no numbers, and that
  cards are attributed to the right team.
- A component test for `Nest`: lips are buttons, a lip returns to its layer, focus lands on the heading, and the ⓘ
  holds the fine print.
- A navigation test for the router allowlist and back-pops-one-layer.
- A cloud-browser spec, updating the current Teams case, that runs Teams › team › trend › back at 390px and 320px,
  passes axe, and checks the honesty tags and gate locks.
