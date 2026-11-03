# BetRivers stand-in — phone mockups (D-74 proposal)

Owner: Sean Balsiger · November 3, 2026 · **Draft for review; nothing released.**

These are screenshots of the real app (the Lines tab's game sheet, Total › Book lines) at 390 × 844. They were taken by
the browser test `tests/cloud-browser/next-lines.spec.js` ("D-74 draft: a BetRivers stand-in shows by name…") against
the real handler and every migration, including M-39, on local PGlite.

The fixture: FanDuel is missing from the provider's reply and BetRivers stands in. The lines and prices are synthetic,
not live quotes. The test blocks web fonts, so the text uses a fallback system font rather than the app's fonts.

| Theme | Screenshot |
| --- | --- |
| Dark | [backup-book-lines-390-dark.png](backup-book-lines-390-dark.png) |
| Light | [backup-book-lines-390-light.png](backup-book-lines-390-light.png) |

## What changes on screen

- **The book list:** it shows BetMGM, BetRivers and DraftKings instead of BetMGM, DraftKings and FanDuel, only while
  BetRivers stands in.
- **Unchanged:** the line reads "The Odds API · 3-book median" and "Consensus from 3 books", as today. Nothing else on the
  sheet changes.
- **"Best recorded":** it can land on BetRivers when its price is best, here −105 against −110.

## Open choice

Nothing says BetRivers is standing in for FanDuel. A small "Standing in for FanDuel" line under BetRivers is possible. It
would need `gtl_book_quotes_from_snapshot` (M-39) to pass the stand-in through, plus the book row to show it. Not built
unless Sean asks.
