# Recommended: your gaps vs. closing lines — phone mockups (D-77)

Owner: Sean Balsiger · November 3, 2026 · **For Sean's review; nothing released.**

These are screenshots of the real app: Bets › Your guess vs. market, at 390 × 844 and 320 × 844. They come from the
browser tests in `tests/cloud-browser/recommended-bets.spec.js`, run against the real handler and migrations on local
PGlite. All accounts, games and lines are fixtures. The tests block web fonts, so the text is in a fallback system font.

| Screenshot | What it shows |
| --- | --- |
| [gap-record-dark-390.png](gap-record-dark-390.png) · [light](gap-record-light-390.png) | A finished week. Four games, spread and total guesses: 5–2–0 and +2.55U (ROI 36.4%) at −110; the 10%+ gaps went 4–2–0. |
| [gap-record-dark-320.png](gap-record-dark-320.png) · [light](gap-record-light-320.png) | The same card at the narrowest phone width. |
| [top3-midweek-dark-390.png](top3-midweek-dark-390.png) | Mid-week, before any game is final: "No finished games with a gap yet", 8 not graded, and the list heading "7 to act on · 7 gaps". (A full-page capture: the app's top bar overlaps in the middle; that is the capture, not the app.) |

## What it counts

Each locked guess that differed from the last three-book line before kickoff is graded on the side your guess favored,
against the final. Each graded gap is 1 unit at −110. It's a paper record of your gaps, not bets you placed. Games
without a final or a closing line, even guesses, drafts and sit-outs are left out; the not-yet-graded count is shown. The
card follows All / Spreads / Totals. See [D-77](../../docs/DECISIONS.md).
