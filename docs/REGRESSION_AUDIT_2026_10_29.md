# Production regression and iPhone audit — October 29, 2026

Owner: Sean Balsiger · Version 1

Sean requested a fresh formatting/functionality sweep and real iPhone logo/favicon
checks. He identified Research and the NFL/EPL transition: changing sports feels
like opening a different app. This audit starts from main
`e9bf525acb97fee42e84b746ae27f593080346b5`; the latest verified frontend release
at audit start was `5c1b775f05a69306f20f911f4b0455c207c65ffc`, Pages `72eb400b`.

## Findings, repairs and remaining gates

| ID | Finding and evidence | State / exit criterion |
| --- | --- | --- |
| AUD-01 | On signed-in production at 390px, loading quotes squeezes the Lines board's team names to “Pa…”. Provenance, the quote and saved-pick tags compete for three columns. The broad phone test permits deliberate ellipsis and did not flag this loss of useful names. | Fixed in this branch: phone cards put the spread quote and provenance on their own full-width row. A new loaded-quote regression fails against the original implementation and passes after repair at 320/390 in both themes. Source/CI, merge, release and physical readback of the repair remain required. |
| AUD-02 | Production EPL removes the league/account header controls, moves the sport selector into the header, and always enters Home from NFL Research. Source mounts a separate EPL frame. | First integration repair in this branch: reuse TopBar, keep the selector below it, expose shared Appearance plus account/sign-out controls, retain the active primary tab across sport changes, and use the fixed-bar viewport correction hook. Existing NBA return routes and unsaved-change guards remain. New browser coverage checks appearance at both phone widths and Research → EPL → NFL context. |
| AUD-03 | The existing physical Safari tab showed NBA navigation and a Trends error. A fresh Safari tab showed current NFL/EPL navigation; fresh desktop Trends loaded successfully with no captured warnings/errors. | Open: retained older running UI is observed; the exact old source and cause of its Trends failure were not established. Add a safe update/reload affordance and test background/resume, preserving drafts and uncertain writes. Do not solve this by clearing storage or forcing an automatic reload. |
| AUD-04 | Safari displayed a readable deep-green G on a white favicon badge in both system appearances. Its expected automatic lime rendering in Dark was not established. The installed app icon rendered after an initially blank Spotlight result. | Versioned favicon and apple-touch-icon references added in this branch for new document loads. Recheck after deployment on this existing installation. Changing HTML does not prove replacement of an already-cached iOS launcher icon. |
| AUD-05 | EPL still has different available account tools and sport content. Its new menu supplies Appearance and sign-out, while Profile/History/Export/admin tools remain in the NFL shell. EPL Bets and moneyline/leaderboard placeholders are existing delivery gaps. | Open: complete account-tool integration and working sport destinations through their real contracts. The header repair does not establish complete feature parity. Keep real unavailable states; do not fabricate football, fantasy or betting data. |

Owner for source repairs and AUD-03/AUD-05 follow-through: Codex. Physical
acceptance: Sean with Codex. This report is persisted backlog evidence, not a
claim that the remaining items are implemented or released.

## Physical iPhone observations

A paired iPhone 17 was inspected through iPhone Mirroring, not a simulator.
The user unlocked/locked it as requested and manually changed Safari/system
appearance when the mirroring tool stopped accepting pointer events.

| Surface | Light | Dark | Limits |
| --- | --- | --- | --- |
| Installed Home Screen app | Launched existing installation; deep-green logo visible on light app surfaces. | Appearance changed through its menu; lime logo visible on dark app surfaces. | App launched through Spotlight's installed-app result. No reinstall, icon removal, draft clearing or storage clearing. |
| Fresh iPhone Safari | Current Home loaded with deep-green logo; NFL/EPL selector present. | Current Home loaded with lime logo and dark app surfaces. | Fresh tab preserved the old tab and its failure state. Full authenticated write acceptance was not exercised. |
| Safari favicon | Green G visible in address suggestions. | Green G remained visible on a white badge in Dark-system suggestions. | Visibility observed; exact raster/cache version and automatic theme-color adaptation not independently established. |
| Installed app icon | G eventually visible in Spotlight; initial white tile was transient/inconclusive. | G visible on the installed-app result under Dark system appearance. | No pixel hash of the OS-cached icon and no claim of automatic cached-icon replacement. |

Sean confirmed restoring his original device/app appearance settings after the
check. Mirroring was returned to its original Actual Size. No player selection,
account link, league membership, public post or bet was written by live checks.

## Verification scope

- Baseline: six existing browser scenarios passed: broad phone formatting,
  phone scrolling/fixed bars, score/chip spacing, four-tab roots and EPL routing.
- Repairs: 56 affected browser scenarios passed, including all Research Lines
  cases, per-market reveal/privacy, stale replies/account isolation, recovery,
  charts, loaded quotes, phone formatting/scrolling and EPL navigation.
- Three additional EPL acceptance scenarios passed: claim contention, linking,
  read-only browsing, held replies/account switching, Fantasy, 320/390/1440
  layouts, Light/Dark and axe checks. Writes in these tests use disposable local
  PGlite only, never production.
- 73 shared/EPL/viewport component tests and seven commissioner UI tests passed.
  33 Node token/theme/brand/routing tests passed, with zero skips.
- Typecheck, Brand QA, cloud build and bundle-only privacy scan passed. Existing
  Vite large-chunk warnings remain. All five retained-NBA compatibility scenarios passed, including saved-ticket
  access, uncertain replies, accounting, returning to NFL and dirty-draft guards.
- Signed-in production reads covered Home, Play/locked-pick receipts, Research
  entry/Lines/game detail/Trends, and EPL Home/Research. These are observations
  from the available signed-in account, not every role or server-side operation.

Synthetic local previews (no private player data):
[Research repair](../design/audits/2026-10-29/research-loaded-light.png) ·
[EPL shared appearance](../design/audits/2026-10-29/epl-menu-dark.png).
The EPL preview deliberately exercises a failed Fantasy fixture read and its retry
state. It is not a production outage screenshot. Private device/production page
contents are not copied into this public repository.

The existing trend-variety work is [PR #363](https://github.com/seanbalz/guess-the-line/pull/363),
a separate offline discovery change; this audit does not mark its API/UI integration
complete. Passing tests and a partial device matrix do not establish that every
feature of the app is operating correctly. Remaining gates above stay open.
