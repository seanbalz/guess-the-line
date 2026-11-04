# Quick wins: Bets and Home (design audit group A, bets batch), November 4, 2026

Before and after phone captures for Sean's OK before release. Each pair is cut from full-page captures at 390 x 844 and
320 x 640, in Light and Dark, by the design audit's capture harness on local fixture accounts (PGlite, no hosted data).
Before is `origin/main` c309e1e8; after is `claude/quick-wins-bets`. Both crops of a pair are cut around the same
elements, so heights can differ where a fix removes space. Files are `<items>-<screen>-<width>-<theme>-<before|after>.png`.

- **A2** Your picks › Your week: "1 of 3 bets · 2U of 3U" sits above a full-width meter instead of one letter a line
  beside it. `web/src/next/bets/PlaceBets.jsx`, `place.css`; the phone-layout scan now flags such text
  (`tests/helpers/phone-layout.mjs`). Shots: `a2-a14-a15-your-picks-*`.
- **A12** Everyone: the game headers lose the face stack; each pick row still leads with its face.
  `web/src/next/bets/EveryoneBets.jsx`. Shots: `a12-a14-everyone-*`. (The stack's own overlap is the kit batch's part.)
- **A13** My bets, Overview and Your week: one style for units, odds and records ("−0.25U", "+1U", "+0.75U", "1–1–0"),
  amounts in n-m, and a missing return as "—" with "Total return · unknown". `TrackedBetRow.jsx`, `tracked-bets.css`,
  `NetUnits.jsx`, `place.js`. Shots: `a13-my-bets-*`, `a13-a16-my-bets-overview-*`, and the week card in
  `a2-a14-a15-your-picks-*`.
- **A14** Your picks and Everyone: short lock lines under the one banner; under your saved bet, "Lock in your Total guess
  to change this bet". `place.js`, `everyone.js`. Shots: `a2-a14-a15-your-picks-*`, `a12-a14-everyone-*`.
- **A15** Your picks: price chips are two lines, "SEA +3.5" over "−110 · BetMGM". `PlaceBets.jsx`, `place.js`,
  `place.css`. Shots: `a2-a14-a15-your-picks-*` (the 320 px pair shows the difference most).
- **A16** Overview: short dates with one axis label for a single day, push in pending, gradient bars, and a one-row
  breakdown ("Markets per ticket") as a stat line. `NetUnits.jsx`, `TrackedOverview.jsx`, `tracked-overview.css`.
  Shots: `a13-a16-my-bets-overview-*`.
- **A17** Empty states with one action: "Open Play" on an unpublished week (Your picks, Everyone) and "Try again" under
  Game research's message. `PlaceBets.jsx`, `EveryoneBets.jsx`, `web/src/next/research/Assessments.jsx`. Shots:
  `a17-*`; these states are reached by stubbing one read in the local capture harness (fixture weeks are published and
  have statistics).
- **A18** Your gap: "Refresh lines" reads "Refreshing…" while busy instead of spinning (`web/src/VirtualUnits.jsx`).
  Shots: `a18-your-gap-refreshing-*` (the read is held open to show the busy state; the before shot freezes the loop
  mid-turn). No visible change for My bets' toolbar refresh: its 44 px icon button stops spinning and is named
  "Refreshing…" with aria-busy (`web/src/SocialBetTracker.jsx`). The `.spin` guard in `web/src/next/styles/base.css`
  has no visual of its own.
- **A22** Home › My bets tile: "1 active ticket". `web/src/next/home/Home.jsx`. Shots: `a22-home-*`.
