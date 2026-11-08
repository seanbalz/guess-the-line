# Back-scroll restoration ownership

Owner: Sean Balsiger · Local verification: November 7, 2026

The Research Games board could return to the top after Back even though Shell
had correctly saved and restored its lower-row position. The history connection
now selects manual browser scroll restoration while connected, leaving Shell's
existing private scroll/focus memory as the owner. No visual tokens, layout,
navigation addresses, history payloads or player data are changed.

## Cause and controlled reproduction

Shell remembers position before dispatching navigation. React can commit and
focus the detail at scroll zero before the passive history synchronization writes
its new entry. The browser can therefore retain a different departing-entry
position from Shell's memory. If native Back completes after Shell has restored
the board and stopped its restoration observers, automatic browser restoration
can overwrite that correct position.

The new Research browser regression uses the real built app, fictional accounts,
local PGlite, a mouse press on the lower HOU-JAX row and actual browser history.
It holds native `pushState` until the detail's zero position has reached a render
boundary, and holds native `back` until the board has its original focus and
scroll. It then releases the original native methods with their original
arguments. It never assigns the resulting scroll according to restoration mode.
Before the source change, all three executions failed at the exact final scroll
assertion: Shell restored 1251; native Back changed it to 0 despite available
scroll height 1302. With the fix, all three retain 1251 through native traversal.

A separate diagnostic changed the position captured at the native push. The
requested 1251 was clamped to the loading detail's maximum 584. With the same
Back ordering, the browser restored 584, confirming that the native saved
position matters. This diagnostic still failed the expected 1251 assertion; it
is evidence of the competing owner, not a successful application flow.

The earlier automatic traces include a pass before `hashchange`. In that pass,
the URL already names the board when Shell restores; in the failure it still
names the detail. Hashchange timing alone does not identify when native
restoration occurred. Those traces do not expose the native saved position;
the controlled reproduction supplies the additional evidence.

## Lifecycle and compatibility

`connectHistory` captures the previous supported mode and selects manual before
writing entries. Disconnect removes its listener and restores the previous mode
if the current mode remains manual. Cleanup is idempotent and preserves a later
explicit auto choice. Pre-existing manual mode remains manual. Missing, read-only
or throwing APIs do not prevent navigation. Unsupported hosts retain their
previous behavior; this does not promise the race is fixed without that API.

The setting belongs to the active history entry; newly created entries inherit
it. Cleanup restores the current entry, not every historical entry. Shell's
existing restoration, explicit destination focus, input cancellation, dirty
guards and account lifecycle remain unchanged. The delayed-content browser test
now relies on production ownership instead of setting manual mode in its harness.
The [HTML History API](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-history-scroll-restoration)
and [persisted entry state algorithm](https://html.spec.whatwg.org/multipage/browsing-the-web.html#persisted-history-entry-state)
define the relevant browser behavior.

## Verification and limits

- 6 browser executions passed: the controlled race and the complete original
  one-game flow, three executions each, preserving reload, Forward, shared links,
  exact scroll, focus and no-rise assertions.
- 8 additional focused browser cases passed: pager, team nesting, forward focus
  handoff, nested origin/reload, delayed content and user cancellation, retained
  preferences, dirty guards, and avatar menu/sign-out.
- 58 router/state Node tests passed, including ownership, cleanup and unsupported
  API contracts. Typecheck, Brand/D-18 document QA and whitespace checks passed.
- All 1759 tracked files under `design/` retain their pre-task SHA-256 values.

Platform: Windows, Node 24.11.0, Playwright 1.64.0, Chromium 156.0.8078.4;
built cloud-test app on loopback port 5310, local PGlite 0.5.8. No tests skipped.
These are local results, not hosted, Safari, physical-phone, merge or release
evidence. Independent task review, the aggregate review addendum and combined
CI remain required before release.
