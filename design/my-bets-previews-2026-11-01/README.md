# My bets — preview, then full ticket

Owner: Sean Balsiger · November 1, 2026 · Option 01 selected; inline expansion confirmed

After the selection-grid release, Sean requested better spacing and a compact
bet preview that opens the detail currently shown on the page when tapped. These
five new studies compare the preview while retaining the full two-column ticket
grid after opening. This revises the earlier request for every leg to be visible
immediately: the full selections stay available on tap. No app implementation or
production deployment is included in these mockup artifacts.

Open [the self-contained interactive gallery](index.html) in a browser. Tap a
parlay or straight preview to expand its full ticket, then use the upward chevron
to collapse it. Ticket details opens the sample notes/history. Light/Dark and
320/390/430px controls support comparison. Track bet, Settled and Filters are
labelled non-saving preview controls; no account connection is used.

Sean selected **01 — Roomy cards**: “1 is the best.” He separately confirmed
**“Expand in place, as shown.”** The selected preview therefore opens its full
ticket inline. [Implementation and release state](../../docs/MY_BETS_ROOMY_2026_11_01.md)
are recorded separately; these visual artifacts do not establish app deployment.

| Option | Preview | Difference |
| --- | --- | --- |
| **01 selected** | **Roomy cards** | Spacious card, selection first, team marks and a short amount row |
| 02 | Open rows | Wide gaps and rules replace enclosing card boxes |
| 03 | Team strip | Team marks lead above the selection |
| 04 | Split summary | Selection left; risk and total return right |
| 05 | Mini grid | Small team tiles preview the full selection grid |

[Options 01–03, Dark](comparison-1-dark.png) ·
[Options 04–05, Dark](comparison-2-dark.png) ·
[Options 01–03, Light](comparison-1-light.png) ·
[Options 04–05, Light](comparison-2-light.png).

[Preview → full ticket, Dark](preview-to-full-dark.png) ·
[Preview → full ticket, Light](preview-to-full-light.png).
Individual `option-<number>-<theme>.png` files show each preview at full size.

## Content, brand and verification

All three tickets are fictional design fixtures, separate from private account
records. Players, matchups and prices are example content, not a current roster,
live slate, offer, result or recommendation. The sample $100 unit is a design
assumption. Total return includes the stake. No player IDs, private notes,
guessed lines or production read inputs are included.

Colors, fonts, spacing and radii come from `design/tokens-next.json`. The gallery
reuses the selected Balanced G, Lucide icons and the existing D-46 team marks for
example matchup identification. Team marks belong to their teams and the NFL.
Fonts load from Google Fonts; font files are not redistributed. Sportsbooks are
plain-text names. This is a layout study within the selected brand.

Rebuild from the repository root with
`node design/my-bets-previews-2026-11-01/build.mjs`, then serve the repository
locally. Export URLs accept `?board=1&export=1&theme=dark`, `board=2`,
`?option=4&export=1&theme=light`, or `?flow=1&export=1&theme=dark`.

Browser review covered all five options at 320/390px in both themes: preview
and expanded horizontal overflow, all six full parlay legs, straight-bet terms,
sample history and focus restoration on collapse. Twenty theme/width cases
passed with brand fonts loaded and no browser script errors. Dark/Light boards,
individual previews and the before/after images were rendered from this HTML.
Detailed receipts remain ignored under `.local/my-bets-previews`.

These checks establish the local mockup interaction only. The current production
release remains [the November 1 grid release](../../docs/RELEASE_2026_11_01_MY_BETS.md).
No saved bets, units, provider connections, guessing/scoring/reveal rules or
frozen tracker were changed. Actual app implementation follows the chosen study.
