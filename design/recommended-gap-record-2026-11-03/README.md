# Recommended: your gaps vs. closing lines — phone captures (D-77)

Owner: Sean Balsiger · November 3, 2026 · **Built to option 1, "Hit rate hero", for Sean's OK; nothing released.**

Sean called the first build "boring and bad". From five directions on the private canvas
[GTL Recommended Gap Card Options](https://claude.ai/artifact/2Dr55M7ZxHCLNKkd52gzkz), he picked **1 · Hit rate hero**.

These are screenshots of the real app (Bets › Your guess vs. market), at 390 × 844 and 320 × 844. They come from the
browser tests in `tests/cloud-browser/recommended-bets.spec.js`, run against the real handler and migrations on local
PGlite. All accounts, games and lines are fixtures. The tests block web fonts, so the text is in a fallback system font.

| Screenshot | What it shows |
| --- | --- |
| [gap-record-dark-390.png](gap-record-dark-390.png) · [light](gap-record-light-390.png) | A finished week: **71.4% beat the close**, "5–2 · +2.55U at −110" and one W/L dot per gap in kickoff order. |
| [gap-record-dark-320.png](gap-record-dark-320.png) · [light](gap-record-light-320.png) | The same hero at the narrowest phone width; the dots wrap. |
| [top3-midweek-dark-390.png](top3-midweek-dark-390.png) | Mid-week, before any game is final: "No finished games with a gap yet", then "Top 3 to act on · 7 gaps". (A full-page capture: the app's top bar overlaps in the middle; that is the capture, not the app.) |

## The card

- **The hero:** the app's hero card (`gx-card--hero`: deep blue in Dark, a white report card in Light). The big
  number is the share of your decided gaps that beat the closing line, W / (W + L) to one decimal, the same rule as
  D-75's win rate. Below it, the record and units at −110, then a dot per graded gap: W, L or P, each with its game and
  market for screen readers.
- **Behind ⓘ:** what counts (a paper record, not bets placed), the 1 U at −110 basis, the 10%+ gaps' record and how many
  are not graded yet.
- **Follows the filter:** All / Spreads / Totals. The list heading reads "Top 3 to act on" whenever any row can be acted
  on.

See [D-77](../../docs/DECISIONS.md).
