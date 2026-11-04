# Quick wins, research and menu batch: phone mockups (November 4, 2026)

Before and after captures of every visible change in this batch (design audit group A: A1, A5, A9, A20, A21, A23,
A24), for Sean's OK before release. Captured with the audit's harness on local fixture accounts (no hosted data), at
390 x 844 and 320 x 640, Light and Dark, with the app's web fonts. Names are
`<item>-<screen>-<width>-<theme>-before.png` and `-after.png`. Most are cropped to the changed part; `games` is the first
screen as a phone shows it on first paint (the tab bar laid over its bottom, where it sits).

- **A1** Menu at 320 scrolls instead of squeezing its list, so Settings, Guidance and Appearance can be reached:
  `a1-a9-menu-*` (at 390 the list already fit; the A9 icons change there).
- **A5** Research › Games: one meta line, refresh as an icon beside the ⓘ, no fine print in the gate card, the first
  game on the first screen: `a5-a20-games-*`; "Weekly research" as a row after the last game: `a5-games-end-*`.
- **A9** One icon per destination, row icons in text-2 instead of lime, landing headline at title size:
  `a9-research-*`, `a9-bets-*`, `a9-home-*` (the This week rows), `a1-a9-menu-*`, `a9-a23-commissioner-tools-*`.
  Play is not affected: since D-69 step 1 it no longer uses these landing rows or headline.
- **A20** Meta lines wrap only between their parts (no line starts with "·"; a date stays with its time): the board's
  line in `a5-a20-games-*`; the Trends subtitle (now a meta line) and the trend tile titles in `a20-trends-*`.
- **A21** Game sheet: "Bets" keeps the bar's buttons on one line; the note's buttons stack below 360 px:
  `a21-game-sheet-*`.
- **A23** "The old app uses the same setting." removed from Appearance: `a23-appearance-*`; "Commissioner only. Each tool
  checks your access." removed from Commissioner tools: `a9-a23-commissioner-tools-*`.
- **A24** EPL Fantasy standings: a chevron on each row, the "Tap a manager" line removed, and in Light the 1px edge on
  your lime bar: `a24-epl-table-*`.

No visual (checked by tests, not shown here): the refresh icon's name ("Refresh market lines", "Retry market lines"
after a failure) and its busy state while quotes load (A5); the research row's name "Open weekly research" (A5); the
Bets button's full name "Open League bets for SEA at DEN" (A21); the standings chevron's turn when a row opens (A24,
motion only, and none under reduced motion).
