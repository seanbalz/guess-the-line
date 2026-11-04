# Quick wins, kit batch (design audit group A), November 4, 2026

Before and after phone captures for Sean's OK before release. Each pair is the same window of the same screen,
taken with the design-audit capture harness on local fixture accounts, at 390 x 844 and 320 x 640, in Light and
Dark. Names: `<item>-<screen>-<width>-<theme>-before.png` and `-after.png`. Times and countdowns differ between
the two runs; only the item's own change matters in each pair.

- **A3** (`a3-game-sheet`, `a3-trends`): a closed Expander no longer draws an empty band (the game sheet's
  "Everyone's guesses" row, Trends' "Source details"), and "Source details" sits in a rounded card. Files:
  `styles/base.css` (one `[hidden]` guard), `bets/tracked-bets.css`, `league/league.css`, `epl/guess/guess.css`
  (their own copies removed), `lines/parts.jsx`.
- **A4** (`a4-profile`, `a4-epl-guess`): an unchanged "Save name" no longer looks like a live lime button, and a
  disabled "Save draft" has no grey slab. Files: `styles/components.css`.
- **A6** (`a6-picks-game-card`): the nesting lip reads as the way back: the chevron first, then the layer name at
  16 px in sentence case on one line. "All 5 trends this week" is 16 px (visible in `a3-trends`). Files:
  `ui/Nest.jsx`, `ui/nest.css`.
- **A7**: no picture. Nesting tiles, lips, the trend hero, "All N" and Home's stat tiles now dip to 0.97 and dim
  while pressed (only the dim under reduced motion). A still capture never shows a press. Files: `ui/press.css`,
  `ui/Nest.jsx`.
- **A8** (`a8-appearance`): in a sheet the segmented control's track shows against the sheet. The selected label
  keeps its normal weight, so segments no longer change size when you switch (also seen in the NFL/EPL row and
  `a4-epl-guess`). Files: `styles/components.css`.
- **A10** (`a10-play`, `a10-your-picks`, `a10-home`): every week meter uses Home's look: 8 px pills, empty on the
  track, filled in the progress bar color (in Light no longer the win green; in Dark the two colors are the same
  value, so Dark changes the shape and the empty segments). Home keeps its look. Files: `styles/components.css`,
  `home/home.css`. `a10-your-picks` also shows the "1 of 3 bets" label bug that the bets batch fixes (A2).
- **A11** (`a11-play`): in Light the active tab's marker is a thin bar with a 1 px edge, not a heavy slab; Dark keeps
  its glow. The Play counter sits lower, clear of the marker. Files: `shell/shell.css`, `styles/components.css`.
- **A12** (`a12-your-picks`): the second face in an avatar stack no longer hides the first face's second initial
  ("LF", not "LI"). Files: `styles/components.css`.
- **A19** (`a19-history`, `a19-fantasy-loading`): no full-width focus lines above and below the page after you open
  History or Fantasy, and Fantasy shows one title, "Fantasy Football", while it loads, fails or shows. Files:
  `shell/shell.css`, `shell/LayerHosts.jsx`, `fantasy/FantasyPage.jsx`.
