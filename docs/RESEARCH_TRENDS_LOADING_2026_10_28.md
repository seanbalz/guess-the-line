# On-demand Trends page — October 28, 2026

Owner: Codex · Approved Research/chart follow-through and OPT-01

Research previously imported the entire Trends screen into the initial new-app
bundle, including its player charts and builder. `TrendsPage.jsx` now keeps a
small local loading/error boundary available while that screen loads on a visit.
The four main tabs and Back remain available. A failed download has an explicit
retry; focus stays in the named Trends content region. Leaving a pending load
cannot reopen the page after its code succeeds or fails.

The shared view importer from the team-sheet fix repairs failed stylesheet
preloads before rendering. Repeated failures keep the local error message;
retry does not refresh the app or request player history while the code is
unavailable. After success, later visits share the loaded module. Existing
player/account filters, market gates, chart values, source labels and evidence
readers remain unchanged. This changes loading only; the existing D-63 builder
continues to be described as proposed in its source and decision record.

Home's saved-trend summary remains a separate small module. Even when this
device has saved trends and Home renders their summary, it does not download
the Trends screen. Saved items keep their existing device-only storage.

## Bundle measurement

Compared local fixture builds with `vite build --mode cloud-test --manifest`,
the same fixture Supabase URL/key and `VITE_GTL_OFFER_NEW_APP=1`. Baseline source
is the repaired team-sheet head `bfe99eb07ad46f31a62e79b82e33d8c8fc67db9d`.
Counts cover the unique static JS/CSS dependency graph needed to load NextApp;
dynamic feature/data requests are outside that graph. Gzip is a local Python
level-9 estimate. These are asset/request checks, not production transfer bytes,
Core Web Vitals or physical-device timings.

| Asset / graph | Before bytes | After bytes | Reduction |
| --- | ---: | ---: | ---: |
| NextApp JavaScript | 460,756 | 413,695 | 47,061 |
| NextApp CSS | 89,655 | 86,298 | 3,357 |
| Initial static dependency graph (13 files) | 1,476,055 | 1,425,637 | 50,418 |
| Same graph, estimated gzip | 421,963 | 408,308 | 13,655 |

First Trends opening adds a 47,715-byte screen JS chunk, a 3,358-byte CSS chunk
and a 1,700-byte saved-summary JS chunk (16,363 bytes combined estimated gzip).
These are three on-demand asset requests; if Home already loaded the saved
summary, only the first two are new. A Home visit that loads that summary still
saves 12,783 estimated gzip bytes against the old eager graph. After opening all
three, the combined graph is 2,708 estimated gzip bytes larger than the baseline
because of the loading/recovery boundary and extra chunks. The benefit is
removing optional code from startup; existing data read timing and cache remain
controlled by their readers.

## Verification checkpoint

The code-loading regression failed on the eager implementation because there
was no loading boundary. It covers a saved Home summary without a screen-code
request, leaving a held download, a late failure, local error/retry, focus,
320px Light/Dark and forced-color states, hidden-value scans, player entry and
loaded-module reuse. A second browser case covers repeated stylesheet failures
and restored player-chart styling, including leaving/reopening a pending repair
without bypassing its styles or repeating its request. All 71 integrated
Lines/Research/Trends/gesture browser cases and both final focused cases passed, along with 84 component tests, 19 token/brand tests,
typecheck, Brand QA and the fixture bundle privacy scan. Eight 320px Light/Dark
and forced-color loading/error screenshots were inspected; error-state axe,
touch-target and hidden-value checks also passed. CI/merge remains a separate
publication checkpoint.

## Remaining checkpoints

Source branch: `codex/lazy-research-trends`. CI/merge, release/readback, signed-in
production performance and physical-iPhone acceptance remain open. Verified
live-game status and dependent Bet/Challenge destinations remain open. No
production deploy, migration apply or frozen v62 tracker change.
