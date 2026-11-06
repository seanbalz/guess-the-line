# Monday recap design studies

Owner: Sean Balsiger · Version 2 · November 6, 2026

## Prism Glass revision · November 6

[View the revised Monday recap mockup at full size](monday-recap-prism-glass.png).

The board follows one player's path from Home to a weekly recap and then to a game's comparison with a friend. It uses the charcoal, ivory and Porcelain finishes from [the selected design review](https://github.com/seanbalz/guess-the-line/tree/59a1b55f225122aca9f7e9a1cd2d4a815d821e4e/design/style-directions-2026-11-04). The previous week has its own entry beside the newly opened week. All examples use fictional fixtures. The image is a design proposal for review.

## Original eight studies · November 5

Status: **design studies, awaiting selection**. Connor requested a Monday recap that compares a player's guesses with other players and the games' final results. Sean requested five to ten mockups using the new app layout. These eight images explore that request; they do not implement or release the feature.

[Open the comparison gallery](index.html). Select a screen to enlarge it; use Previous/Next or the arrow keys to compare. Escape closes the viewer.

| Option | Direction | What it emphasizes |
| --- | --- | --- |
| [01 — Week at a glance](01-week-at-a-glance.png) | Week at a glance | A quick weekly overview with separate ranks, results, and friends. |
| [02 — League first](02-league-first.png) | League first | The leaderboard leads; compare scoring points and open a matchup. |
| [03 — Matchup breakdown](03-matchup-breakdown.png) | Matchup breakdown | A game's final score, your line accuracy, and winning margin. |
| [04 — Friend faceoff](04-friend-faceoff.png) | Friend faceoff | A friend comparison using each player's saved scoring reference. |
| [05 — Results timeline](05-results-timeline.png) | Results timeline | Completed games and Monday's pending matchup in one timeline. |
| [06 — Recap stories](06-recap-stories.png) | Recap stories | A short sequence of recap cards within the app's existing frame. |
| [07 — Guesses on a line](07-guesses-on-a-line.png) | Guesses on a line | Visual comparisons of your total guess, saved line, and actual total. |
| [08 — Light mode recap](08-light-mode-recap.png) | Light mode recap | An airy light-theme recap using the same cards and navigation. |

## Design recommendation

Use **01** as the recap entry, **03** as the matchup detail and **04** for a friend comparison. **08** demonstrates Light. These are suggestions for selection, not approved app changes.

The shell follows the four-tab Home / Play / Bets / Research layout and the D-69 nesting contract: visible parent lips, one job per layer, glossy next-move cards and two-column tiles. It draws from the November 4 Home and Research overhaul, not the retired five-tab layout. Sources: [brand guide](../../docs/BRAND_GUIDE.md), [new-app tokens](../tokens-next.json), [D-69 spec](../../docs/superpowers/specs/2026-11-02-design-overhaul-design.md) and [Home release](../../docs/RELEASE_2026_11_04_HOME_STEP2.md).

## Data and interaction contract

- All teams, people, lines, ranks and scores in these images are fictional design fixtures. No real NFL schedule or bookmaker quote is asserted. No account data was read.
- Line accuracy is the miss from that player's own saved submission-time scoring reference. A friend's reference can differ. Spread and Total ranks remain separate; this proposal creates no combined score.
- The actual final score, winning margin and total are a separate comparison. A line guess does not become a wager, a result prediction or a new settlement.
- Demo arithmetic: NTH 20, STH 27 means STH won by 7 and the total was 47. Your STH −3 versus saved STH −3.5 differs by 0.5. Your total 45 versus saved 44.5 also differs by 0.5.
- A Monday recap can be PROVISIONAL while games remain. A FINAL game label does not make the entire week final. Later result corrections must remain visible.
- Future-game guesses and lines retain the existing per-game and market reveal gates. Option 05 demonstrates a locked pending game. Missing references stay unavailable, never zero.
- No automated delivery time, notification, new ranking formula, award or release is approved by this design study.

## Rendering and verification

Images were generated with the **built-in image_gen tool**, one call per concept and one targeted correction to Option 06. The [complete prompt set](prompts.json) preserves the shared design constraints, all eight variant prompts and that correction.

These are raster concept renderings. Lettering, icons, the G and spacing are approximations; production work must reuse the existing exact FieldMark, Lucide components and tokens. They are not replacement brand assets. Concept 03's small comparison explanation belongs behind the information button in implementation, following D-55.

All eight 1024 × 1536 images were visually reviewed. Chromium gallery checks passed at 320, 390 and 1440 px: eight images load, no page overflow, viewer opens, arrow navigation works, Escape closes, focus returns and no script errors. Brand/document QA and whitespace checks passed. The completion register records the evidence. Static-image review does not establish accessibility, responsive component behavior, production integration or real-phone acceptance. The gallery's controls are separate from the noninteractive app screens pictured inside it. Chart positions in these raster studies are schematic; implementation must calculate exact scales from the labeled values.
