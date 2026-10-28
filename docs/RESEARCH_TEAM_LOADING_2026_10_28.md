# On-demand team details — October 28, 2026

Owner: Codex · Approved Research/chart follow-through and OPT-01

Team details previously shipped in the initial new-app bundle. The sheet frame
and cached record reader remain in `TeamSheet.jsx`; the detailed view, margin
chart and team styles now load through `TeamView.jsx` when requested. Pick-screen
records retain their existing read/cache path. Loading shows the shared static
panels inside the stable frame. Back, Close and Escape work throughout.

A failed download stays inside the sheet with an explicit retry. Retry replaces
only the view loader and moves focus into the details group; it does not refetch
records or reload the app. Closing a held download restores the original game
control; a late failure cannot reopen the abandoned sheet. Successful reopen
uses the shared module promise. A failed stylesheet is repaired before the view
can render; repeated failures keep the local error state. The loader tracks
actual stylesheet error events because a failed Chrome stylesheet can still
have a `sheet` object, and Vite remembers its failed preload URL. Team values, chart selection and market gates
are unchanged.

## Bundle measurement

Compared two local fixture builds from baseline `1d9b38c891753af7a32686db2dd3e2fbd8c404e2`
using `vite build --mode cloud-test --manifest`, the same test Supabase URL/key
and `VITE_GTL_OFFER_NEW_APP=1`. Counts cover the static JS/CSS dependency graph
needed to load NextApp, including its entry dependencies; dynamic feature/data
requests are outside this count. Gzip uses Python's local level-9 estimate.
These are asset measurements, not production transfer bytes or Core Web Vitals.

| Asset / graph | Before bytes | After bytes | Reduction |
| --- | ---: | ---: | ---: |
| NextApp JavaScript | 466,155 | 460,756 | 5,399 |
| NextApp CSS | 93,860 | 89,655 | 4,205 |
| Initial static dependency graph (13 files) | 1,485,659 | 1,476,055 | 9,604 |
| Same graph, estimated gzip | 424,156 | 421,963 | 2,193 |

First team opening adds a 7,662-byte JS chunk and a 4,206-byte CSS chunk
(4,008 bytes combined estimated gzip). That adds two asset requests on demand;
once opened, the combined estimated payload is 1,815 bytes larger than the old
eager graph because of the loader/recovery boundary and chunk overhead. The
benefit is deferring that optional view at startup, not reducing every journey's
total bytes. No additional API request is introduced.

## Verification

The regression failed before the change because opening already rendered the
view instead of waiting for its held chunk. It now verifies no team-view JS/CSS
request before opening, an immediately usable frame, cancellation/focus return,
a late failure, inline error, explicit retry with focus retained, successful
recovery and module reuse without another code request or record read.
A second regression reproduced a stylesheet failure rendering an unstyled view
on retry. It now covers two failed stylesheet attempts, successful repair,
styled chart rendering and retained focus. All four final team browser cases
passed, including linked selection and enlarged readouts.
All 68 integrated Lines/Research/Trends/gesture browser cases, 84 component
tests, 19 token/brand tests and typecheck passed. The final focused rerun uses
the actual stored theme preference for both loading/error matrices and passed;
eight 320px Light/Dark and forced-color screenshots were inspected. Brand QA,
fixture bundle privacy checks and a final build-size readback passed.

## Remaining checkpoints

Branch: `codex/lazy-team-sheet`. CI/merge, release/readback, signed-in production
performance and physical-iPhone acceptance remain open. The queue records #293's
merge separately. No deployment, migration apply or frozen v62 tracker change.
Verified live-game status and dependent Bet/Challenge destinations remain open.
