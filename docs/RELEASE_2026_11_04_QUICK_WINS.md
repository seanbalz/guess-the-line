# Release record: design audit quick wins, frontend Pages `010cca04` — November 4, 2026

This was one frontend release, from `main` at `68019b3e`. It shipped the design audit's 24 group A quick wins in three
merged pull requests:

- [#479](https://github.com/seanbalz/guess-the-line/pull/479), the shared kit: A3, A4, A6, A7, A8, A10, A11, A12 and A19.
- [#480](https://github.com/seanbalz/guess-the-line/pull/480), Research and Menu: A1, A5, A9, A20, A21, A23 and A24.
- [#478](https://github.com/seanbalz/guess-the-line/pull/478), Bets and Home: A2, A12's Everyone part, A13 to A18, and A22.

The release card is a [comment on #479](https://github.com/seanbalz/guess-the-line/pull/479#issuecomment-6627753411).

Sean's approvals (November 4, 2026), in the operating session:

- **"Yes, build them"**, to building all 24 as three PRs, each with mockups.
- **"Yes, merge and release"**, after the 390 px before/after sheets. Each PR's `design/qa/quick-wins-*-2026-11-04/`
  holds the 320 px pairs.
- The session approved both production gates after checking that each run title named this mode, `frontend` and
  `68019b3e`.

**Changes after the mockups (both in #479, from CI failures in its wider fallback font):**

- A long lip name now wraps to a second line instead of being cut to "…" (AUD-01). The mockups' labels were short
  enough to stay on one line.
- Avatar stacks overlap 2 px, not the mockups' 4 px.

## Release

- **Source:** `main` at `68019b3ea9cb2d188ede71d658b960b397daf172`, the merge of #479.
  - Since the live frontend `a10d28e9`, the only commits that change `web/` are the three PR merges. #476 (docs) also
    landed in between.
- **CI on `68019b3e`:** Tests 41807126013, Brand QA 41807126019 and Dashboard checks 41807126220 all succeeded.
  - Dashboard's first attempt failed before any test ran. The Persona suite job could not install the browser's font
    packages ("Unable to locate package fonts-unifont… Installation process exited with code: 100").
  - The rerun of that job, attempt 2, passed.
- **Runs:**
  - check-only [41809714241](https://github.com/seanbalz/guess-the-line/actions/runs/41809714241). An earlier
    check-only, 41809285915, also passed; the readiness dispatch after it hit HTTP 500.
  - readiness [41809760987](https://github.com/seanbalz/guess-the-line/actions/runs/41809760987).
  - deploy [41810080997](https://github.com/seanbalz/guess-the-line/actions/runs/41810080997), `deploy` · `frontend`.
  - All succeeded.
  - GitHub answered several workflow dispatches with HTTP 500/502 and created no run. The script retried only while no
    run with the same title existed.
- **Release lane:** this session was the only release captain. "Guess the Line repo and Codex sessions" and the step 1
  Play session dispatched nothing.
- **Hosted:**
  - Pages deployment `010cca04-418d-4556-ab53-642b1746a902` (`https://010cca04.guess-the-line.pages.dev`).
  - The release verify step (checked at 09:51:21 UTC) matched 126 assets on `https://guess-the-line.pages.dev`, with
    frontend digest `38b6732654fa11fa97056b52dd8ab16051b94625eac9d8612b6b5eac56d55a3f`.
  - `gtl-api` is unchanged: v50, bundle `c5ed571b…`, JWT verification on.
- **Migrations:** none. History digest `d40fdad9eb144738cdbd032e3c95ba433b4cb1606f3de3ab8079f0df1b8108f1`, unchanged.
- **Rollback:** redeploy `frontend` from `a10d28e9cdb0fdb20c323ad71b9c07893c41a35b` (run 41787052379).

## Readback

**Live bytes** (executed, signed out, 09:55 UTC). The production entry stylesheet and the new app chunk contain:

- the A3 `[hidden]:not([hidden=until-found])` guard;
- A12's `margin-left:-2px`;
- A11's `top:-3px`;
- A6's wrapping lip label rule;
- A1's `.gx-sheet-body>*{flex-shrink:0}`;
- A18's `[class~=spin]` guard;
- A14's lock lines, "Lock in your … guess to see prices" and "Opens when you lock in or at kickoff";
- A16's "· unknown" return label;
- A17's "Open Play".

A23's "The old app uses the same setting" is gone.

**Not checked:** signed in, and on a real phone.

## Left for later

- Two meta lines outside A20's call sites can still wrap at "·": TrendAvailability's and TrendHero's.
- The trends-only Lines board branch reuses the chart glyph on each matchup row.
- `play/playFrame.css` keeps its own `[hidden]` rule. The A3 test allows it as the one copy. The step 1 session will
  delete it in its B1 PR.
