# Research formatting — October 29, 2026

Owner: Codex UI workflow · Issue [#388](https://github.com/seanbalz/guess-the-line/issues/388)

## Reproduction and repair

Sean's two October 29 desktop screenshots show NFL Research → Fantasy with its
heading, filters and rankings spanning the viewport while the shared frame stays
centered. The 3:18 PM screenshot identifies the production Fantasy route. Fresh
authenticated desktop inspection reproduced the defect: at a 1260px viewport,
the loaded Fantasy region was 1245px wide with zero gutter, while the header was
520px wide. Production served `index-CT-LnSLy.js` at that observation.

All four loaded Fantasy layers omitted the shared `gx-screen` class. Restoring it
to rankings, player, report card and comparison applies the existing 520px content
limit, 16px gutters and vertical spacing. Loading/error views already had this
layout. The comparison table now has a named keyboard-focusable scroll region
and the existing focus token, so its columns remain accessible on narrow screens.

Trends already had the shared content column. A separate narrow-screen defect
was reproduced in loaded browser fixtures at 320px: its section controls split
Teams, Players and Build mid-word. Only the Trends section group now uses two
columns below 360px, preserving the existing 44px targets and typography. The
market selector, page content and shared app navigation keep their existing layout.

No scoring, data access, account, sport switching or release logic changes.
This is a repair within the selected D-38/D-55/D-66 system, under DESIGN-01/Q19.

## Local evidence

- The new Fantasy geometry assertion failed before its fix: expected a 16px
  gutter, received 0. It checks alignment with the shared header as well as page
  overflow; overflow alone could not detect this defect.
- The Trends text-line assertion failed before its fix, identifying all four
  section labels wrapping at 320px. Screenshots separately show the mid-word
  breaks on Teams, Players and Build.
- Browser validation uses the bundled public Fantasy snapshot, prepared public
  Trends history and disposable local accounts/database. These are populated
  rendering and privacy regression checks, not new hosted or physical evidence.
- The matrix covers 320/390px phones and 1390px desktop, Light/Dark, loaded
  Fantasy layers and all four Trends sections. It includes filters, nested/back
  navigation, keyboard use, accessibility, header alignment and no page overflow.
  Fantasy long-list top/middle/end checks also verify the final control clears
  the fixed bottom navigation.

Final local verification passed:

- 15 integrated browser cases in `fantasy.spec.js`,
  `research-fantasy-loading.spec.js` and `next-trends.spec.js` (1.9 minutes).
- 41 Fantasy tools/nesting and Trends nesting component tests.
- 32 Fantasy ranking/loader and new-app token tests; the 14 token checks were
  repeated after the final scoped Trends CSS change.
- Typecheck, Brand QA, test-mode production build and `git diff --check`.

Reviewed fixture captures: [Fantasy desktop Light](../design/qa/research-formatting-2026-10-29/fantasy-desktop-light.png),
[Fantasy 320px Dark](../design/qa/research-formatting-2026-10-29/fantasy-320-dark.png),
[Trends 320px Dark](../design/qa/research-formatting-2026-10-29/trends-320-dark.png).
These show local public/synthetic fixtures, including deliberately stale fallback
states and fixture-only sport availability. Additional report, comparison, Teams
and Build captures were inspected locally; the full screenshot matrix remains in
ignored test output. Raw signed-in screenshots remain private and ignored.

## Release and iPhone acceptance

PR [#389](https://github.com/seanbalz/guess-the-line/pull/389) merged as
`d9f81905cdec2666af0b4a02ed31207f5157419b` after all twelve checks passed on
`7af604b8b4000e38382063f7fab3685bdd14c3fc` and independent code/visual review.
The merged-main Persona job then exposed an existing keyboard-test race
([run 40942802489](https://github.com/seanbalz/guess-the-line/actions/runs/40942802489/job/123690289958)).
Deployment paused; no failing gate was bypassed.

The trace shows the keyboard loop moving straight to Research after accepting
any visible screen following Bets. The scheduled Bets heading
focus then wins; the failure screenshot shows that heading focused on `#bets`.
Neither Fantasy nor Trends had been entered. Five exact-main local repeats
independently reproduced the race once. The follow-up changes only the test:
after Enter it awaits the selected tab and the exact destination heading's focus
handoff before advancing. Already-current Home has no new route handoff. The
navigation focus assertion stays in place, with no sleep or automatic retry.
All three Persona cases then passed five repetitions each (15/15), including
the keyboard handoff on every iteration. Syntax, Brand QA and diff checks passed.

Source repair does not close #388. Exact-source CI, frontend deployment, served
asset verification and physical iPhone acceptance remain required. The existing
moneyline release keeps its pinned source. The agreed next #388 frontend-only
release has one merge/deploy actor, the Redraft logo and favicon captain, after
the moneyline owner's explicit batch-complete handoff. That captain also owns
the sole post-deployment phone input; this implementation lane does not operate
the phone concurrently.

On the actual iPhone, verify loaded Fantasy rankings, filters, player/report/
comparison layers, top/middle/end scrolling and fixed-navigation clearance;
verify Trends This Week, Teams, Players and Build, including nested return paths.
Check the shared profile and Research navigation remain available, and record
Safari versus Home Screen and Light/Dark scope explicitly. Prior #385 acceptance
covers sport switching, not these formatting repairs.
