# EPL moneyline screens — October 29, 2026

Owner: EPL access/UI workflow agent. Scope: approved D-68 moneyline Task 5,
using the v3 Play direction and D-38/D-55 tokens.

| Area | Current source status | Remaining acceptance |
| --- | --- | --- |
| Guess entry | Child screen implemented: progress, next/other matches, favorite toggle, typed American prices, steps across even odds, draft save, final match lock | Shared shell must wire the child into Play |
| Results | Saved guess/reference, captured reference source/time, pending and permanently unscored states; permitted opponent locks only | Combined API/collector/browser flow and deployed readback |
| Leaderboard | Separate child, server ordering, one decimal average, guessed/unscored counts, explicit unranked rows | Shared shell wiring and combined acceptance |
| Save/account safety | Account-scoped in-memory drafts, response generation guards, exact requested week, final lock double-tap guard, uncertain-save readback before another write, disabled stale entry | Real-device acceptance remains open |
| Unavailable/older API | Explicit unavailable week and older-API sentences; existing permitted history remains inspectable; nonmembers read-only | API Task 3 and collector Task 4 remain separate source lanes |

## Shell and API contract

- Default `EplGuess` from `web/src/next/epl/guess/EplGuess.jsx` accepts
  `{api, accountId, onNavigate?, onDirtyChange?}`. `accountId` is the authenticated
  GTL account ID. `onNavigate` receives `{tab: 'play', section: 'leaderboard'}`.
  The optional dirty callback lets the shell protect its own internal tab changes;
  sport switching and browser unloading already have draft guards in the child.
  Supplying the callback delegates sport/internal navigation guards to the shell,
  preventing duplicate confirmations; unmount clears the callback's dirty key.
- Default `EplGuessLeaderboard` from the adjacent file accepts
  `{api, accountId, season?}`. Both injectable APIs default to `eplApi`.
- Reads: `guess/read {season?, week?}` and `guess/leaderboard {season?}`.
  The EPL server chooses the default season/week and supplies authoritative
  `weeks`, `reason`, and the optional `ownerNames` dictionary. No NFL week or
  inferred fixture range is used.
- Write: `guess/save {eventId, club, price, lock}` returns the saved guess.
  Only this action is classified as a write. A lost or malformed write response
  requires `guess/read` for the same EPL season/week before another write.
  Failed readback leaves entry paused and retains entered values.
- Readiness comes from `available`; a false value disables entry while retaining
  API-permitted history. `ownerId: null` is read-only. Full public refusal codes
  and M-32 draft/locked, pending/scored/unscored semantics remain authoritative.
- Postponed/final/unknown fixture status prevents entry. Opponent reveal still
  requires the viewer's own match lock or actual kickoff; postponement alone
  does not reveal guesses.

No EplApp, shared shell, profile, router, server, SQL, collector or schedule files
are changed by this batch. The release owner's separate
`epl-moneyline-flow.spec.js` is untouched. The child must be integrated with those
owners' source before claiming Task 5 complete in the release register.

## Local verification

The new component/model tests cover even odds, drafts/final locks, double taps,
exact request payloads, pending/unscored references, per-match privacy,
postponement, closed-match retained drafts, malformed replies, failed and
recovered uncertain readback, stale/wrong-week responses, disposed accounts and
in-flight writes, manager changes, older API, and read/write request flags.

An isolated loopback fixture rendered the actual children under React StrictMode
at 390px dark and 320px light. It exercised stepper input, successful final lock
and readback, committed-but-unconfirmed lock with failed then recovered readback,
no repeated write, unavailable-week saved history, account remount and the
leaderboard. Three axe analyses passed; no page errors or horizontal overflow
were observed. The fixture blocked all non-loopback requests and used fabricated
2099 data. It did not execute SQL or the real API/collector.

Ignored review artifacts are under `.local/epl-moneyline-ui/`: the fixture driver,
390px entry screenshot, 320px results and leaderboard screenshots. These local
artifacts are not public application assets. Token checks, typecheck, Brand QA
and the existing cloud build also passed; the main cloud entry does not bundle
the unwired children yet. Deployed/API/collector and physical-device acceptance
are still separate gates.
