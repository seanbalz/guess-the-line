# Research game-sheet guesses — October 26, 2026

Owner: Sean Balsiger · Approved D-55/D-39 continuation · Source work, not a release

The game sheet already had personal saved references, current market details,
weather and trends. Stage 34 also calls for Everyone's picks. This batch adds
an expandable **Everyone’s guesses** section through the existing M-08
`/community/picks` reader. No migration, API contract or scoring change is needed.

## Behavior and access boundaries

- Opening the disclosure reads only the selected game, market, season and week.
  The section starts closed and makes no request until opened. Spread and Total
  are independent controls; closing it unmounts the reader.
- The list is explicitly **Community**, even if a private league is selected in
  the header. Names come from the existing account-scoped Community read. No
  private roster or group standings are inferred from this community reader.
- Each row has a name/avatar, lock-in status and the permitted guess. The owner's
  saved draft remains visible. Other players' drafts never appear, even in a
  malformed visible row. A locked but hidden guess shows an icon and words.
- Counts use the reader's public entry statuses. Late, sit-out and former-member
  labels are retained. Guess spreads use the same favored-team notation as the
  existing personal-guess rows; market chart lines keep their separate labelled
  home-team convention.
- Points and distance are supplied by the reader, using each saved reference.
  Missing scores say Score pending, genuine zero scores stay zero, and ineligible
  entries say Not scoring. Closest/tied/rank labels require a scored row and the
  server's started flag; the client never calculates standings.
- Account, week, game, market or personal-access changes hide the old reply
  during render. Abort, scope and generation checks reject late responses.
  Invalid viewer/week/mode/game replies and failures show Retry without old
  guesses. Focus/reconnect/visibility/manual refresh clear previous data first;
  the next kickoff refresh uses server time and monotonic elapsed time.
- A closed market offers a link to the existing Play flow. Browsing, opening the
  list and switching markets never lock in guesses or sit the player out.

The explanation is available from the section's information button and Menu →
Guidance and sources. Existing tokens, 44px controls and the shared disclosure,
segmented control, avatar, list and row components are reused.

## Verification

Tests use disposable fixtures and the existing real handler/migration chain.
Focused cases cover lazy reads and explicit request scope, hidden Spread versus
visible Total, own drafts, no browsing writes, long names, failure/wrong-viewer
retry, delayed market/account responses, and kickoff versus later-game gates.
Model/render checks also cover forced hidden values, removed/Late/sit-out rows,
zero versus missing scores, eligibility and tied ranks. Light/Dark 320px
screenshots are inspected with accessibility and phone-width checks.
All 33 integrated Research/Lines/Trends browser tests passed. The five new
focused cases passed again after the final reply-shape guard. All 28 rendered
component tests, 38 model/API-contract/SQL/token tests, typecheck, Brand QA,
fixture production build and bundle-only privacy scan passed. Final Light/Dark
320px screenshots were inspected. These are local fixture checks, not a hosted
readback or a physical iPhone acceptance test.

## Remaining work

This delivers the per-game list portion of stage 34, reusing the stage-31 reader.
Stage 31's dedicated Your pick sheet and direct See picks now/forfeit confirmation
are not completed by this disclosure. The existing confirmed Play sit-out path
remains the destination. Stage 34's slot-based action bar and League bets remain
open under their dependencies; verified live-game status remains separate from
kickoff/final evidence. Hosted release, signed-in readback and physical iPhone
Safari/Home Screen acceptance remain open. The frozen v62 tracker and Sean's
corrected no-scroll-bug report are preserved.
