# Gap period fixes — mockup review

Owner: Sean Balsiger · November 9, 2026 · Local implementation, not deployed.

Open [the interactive review](index.html) to switch Dark/Light and Before/After.
The [Dark overview](dark-overview.png) and [Light overview](light-overview.png)
show the fixed behavior in three 390px browser captures:

1. All time remains selected after recommendation-week changes and Refresh lines.
2. An applied Custom range retains its endpoints after Refresh lines.
3. An expanded seven-gap week grows to all fourteen rows when selecting All time.

These are rendered app captures using the existing approved Prism design. Every
account, slate, reference, final and displayed result is synthetic. The two-week
fixture deliberately copies one authenticated local board into a second
published week; it does not claim live sportsbook or historical-account evidence.
The original and fixed observations are in `before-observations.json` and
`after-observations.json`. The original app source for the comparison is
`9a34f9e47d5fb7dd32eecd6fdc697cef53340ed9` (PR #505); the before build substitutes
only the three changed app modules from that source into the current base.

[Implementation and test evidence](../../docs/GAP_PERIOD_FOLLOWUP_REVIEW_2026_11_09.md)
describe the regression checks and limits. No new scoring rule, provider, API,
migration or app visual recipe is introduced. Physical-iPhone and signed-in
production acceptance remain separate. The capture scripts/fixture and build
directories are ignored local tooling; the public captures contain no real
player information.
