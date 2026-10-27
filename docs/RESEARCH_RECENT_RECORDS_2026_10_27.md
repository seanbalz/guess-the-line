# Research recent-result tiles — October 27, 2026

Owner: Sean Balsiger · Approved D-55 chart follow-through · Source work

Recent-result blocks previously filled the wins and rendered losses and pushes
identically. Their fixed “Last 10” heading also overstated shorter samples, and
the grouped blocks could be mistaken for a chronological run of games.

The tile now labels its actual sample (Last 10, Last 3, etc.), always prints all
three W–L–P counts, and says “W · L · P; grouped counts.” Wins remain filled,
losses retain their track, and pushes use a hollow dashed border, including in
forced colors. A supplied empty record shows “No recent games” with no blocks;
an absent recent record still omits the tile. Both cumulative and season views
use the same supplied recent record. No game sequence is invented.

The source counts, outcome rules, win-rate denominator, units, qualification and
market gates are unchanged. This uses the existing GTL tokens and at most three
stat tiles. It adds no data provider, collection or backend work.

Two rendered regressions failed before the change and passed after it. All 48
chart/Lines/Research component tests and 20 chart/token model tests passed, as did
typecheck, Brand QA, the fixture build and bundle privacy scan. The new browser
case supplies fictional recent counts through the authenticated fixture reader,
checks both chart views, accessible markup, privacy and 320px Light/Dark plus
forced-color layouts. It passed; four screenshots were inspected. The fixture's
public season has a value that collides with a hidden-pick sentinel, so the leak
scan uses the cumulative view rather than treating public season units as a
private-data exposure. All 55 integrated Research/Lines/Trends/League-bets browser
cases passed after combining current main and the repaired PR #258. Two focused
combined-chart cases also passed. Source is in [PR #259](https://github.com/seanbalz/guess-the-lines-repo/pull/259)
on `codex/research-recent-records`.

PR #259 merged October 27 as `ba9c043e156229e10b97b4edf0851a7fa5833408` after all nine checks passed on `80aa7f1eb4835aee593548fdfa5223e21ad62952`, with no CI fixes or review findings.
Hosted release/readback and physical-iPhone acceptance remain open.
This task does not deploy or apply migrations; the frozen v62 tracker is intact.
