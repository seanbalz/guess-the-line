# My bets — six layout mockups

Owner: Sean Balsiger · November 1, 2026 · Awaiting layout selection

Sean requested easier manual player-bet entry, more sportsbook choices and a
better-looking My bets section. He confirmed every parlay leg should be visible
immediately, then requested five to ten mockups with less clutter, less text and
more visual content. These six studies respond to that layout request. No
production layout, player record or sportsbook integration changes here.

Open [the self-contained interactive gallery](index.html) in a browser. Compare
all six, select one layout, switch Light/Dark, and select a 320/390/430px card
width. The filter, ticket menu and player-bet entry controls are previews; they
do not save data or place bets. Entry previews include additional sportsbook
names, separate player/market/pick fields and a cash-stake field. Implementation
and remaining entry decisions follow the layout selection.

| Option | Direction | Main difference |
| --- | --- | --- |
| 01 | Clean cards | Quiet cards, team marks and one totals row |
| 02 | Connected slip | A single vertical path connects all parlay legs |
| 03 | Open list | No ticket boxes; spacing and aligned text organize picks |
| 04 | Selection grid | Two columns of leg tiles with team marks |
| 05 | Numbers first | Larger line, odds and return values |
| 06 | By sportsbook | Book section headings replace repeated source labels |

[Options 01–03, Dark](comparison-1-dark.png) ·
[Options 04–06, Dark](comparison-2-dark.png) ·
[Options 01–03, Light](comparison-1-light.png) ·
[Options 04–06, Light](comparison-2-light.png).
Individual `option-<number>-<theme>.png` files provide full-size detail.

## Content and brand

Both tickets are fictional design fixtures, separate from actual account records.
Their prices are sample content, not live quotes, verified results or betting
recommendations. Every study uses the same $20 straight/$8 six-leg parlay to
keep layout comparisons fair. The displayed $100 unit is a design assumption,
not a global setting for all players. No private ticket, user ID, guessed line
or account state is included.

The gallery reads GTL's selected D-38/D-55 colors, type and radii from
`design/tokens-next.json`; fonts load from Google Fonts without redistributing
font files. It reuses the selected Balanced G, Lucide icons and existing D-46
team marks for identification. Team marks belong to their respective teams and
the NFL. Sportsbook names are plain text; no sportsbook logos are copied.
This proposes layout changes while retaining the selected brand system.

## Reproduction and verification

From the repository root, run `node design/my-bets-2026-11-01/build.mjs`.
Serve the repository with a local HTTP server, then open the gallery URL.
Export parameters are `?board=1&export=1&theme=dark`, `board=2`, or
`?option=4&export=1&theme=light`. The PNGs are rendered from that actual HTML,
not image-generated approximations.

Browser review covers all six layouts at 320px and 390px in both themes,
all six parlay legs visible without disclosure, horizontal overflow, actual
brand-font loading, ticket menus and the non-saving entry preview. Local
receipts remain ignored under `.local/my-bets-mockups`. These checks do not
establish production authentication, production data behavior or phone acceptance.
App implementation, full regression CI and deployment follow the selected layout.
