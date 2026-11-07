# EPL league, History and Bets — phone review

Owner visual approval pending. These carry the selected Prism Glass system into
the three remaining native EPL shell states. No account data is read or changed.

| Mockup | Dark | Light |
|---|---|---|
| FEPL league selector | [Dark](previews/epl-shell-leagues-dark-phone.png) | [Light](previews/epl-shell-leagues-light-phone.png) |
| History and NFL-records handoff | [Dark](previews/epl-shell-history-dark-phone.png) | [Light](previews/epl-shell-history-light-phone.png) |
| Bets unavailable | [Dark](previews/epl-shell-bets-dark-phone.png) | [Light](previews/epl-shell-bets-light-phone.png) |
| About these examples | [Dark](previews/epl-shell-info-dark-phone.png) | [Light](previews/epl-shell-info-light-phone.png) |

FEPL is the native league identity. Its selected row closes the sheet; it does
not create, join or invite. The NFL leagues remain in NFL. The blurred page
behind the league sheet is a labelled review-context card, not live Home data.

The native source currently says EPL History is not available here yet and
offers **View NFL history**. EPL Bets currently says bets are not available for
the Premier League. These are existing availability notices, not empty-data
results or newly introduced restrictions. Existing notice/action wording is
retained. No new EPL wagering form or historical records are invented.

The FEPL header, NFL/EPL selector and four tabs use the previously reviewed
frame. No NFL badge counts appear on EPL. The account-wide Menu already has its
own scoped review; its actual commissioner/push-guard read is excluded here.

<details>
<summary>Source and verification</summary>

Native EplLeagues/EplHistory from EplShell.jsx and EplBets/EPL_COPY from
EplApp.jsx are isolated and source-compared. Adapters inject local shell and
navigation callbacks, disable Button haptics and add the existing clock/ticket
icons to the two notice cards. Native wording, FEPL row and available actions
remain. Sheet close/back and review reopen controls work in memory; other
destinations only show no-read notices. Review reopen controls are hidden while
the History page is open.

48 existing native tests, 24 responsive layouts, six native-flow checks, two
league-sheet keyboard/focus checks, eight Info checks and four prior mounts
passed. Source comparisons, controller/API/auth exclusions, Brand QA, syntax,
capture hashes and diff checks passed. No provider/auth reads, non-GET requests,
storage writes, bundle intervals, OS dialog or page error was observed.

This is visual evidence only. Production/data availability, actual route and
permission enforcement, physical-device acceptance and whole-app completion
remain separate. Retained NBA-route visuals remain a reconciliation item;
NBA is hidden from shared navigation. New avatar/photo/award work and parked
Signal files remain held. No merge, deployment or migration.

</details>
