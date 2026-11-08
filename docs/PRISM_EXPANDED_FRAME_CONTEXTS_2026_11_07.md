# Confirmed Prism frame contexts — November 7, 2026

This task maps additional supplied whole-screen approvals to existing production
destinations. The selected-system ledger at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76` remains the visual authority. The
binding context matrix is recorded in
[the frame authority reconciliation](PRISM_FRAME_AUTHORITY_RECONCILIATION_2026_11_07.md).
This checkout started from fetched `origin/main` and fast-forwarded to the reviewed
partial integration `250294f10587c6467f0dc426374f92b5437c147c`. Root reconciles the
aggregate completion ledger after independent task and whole-branch review.

The additional context mapping is implemented locally; review, publication,
deployment and physical-phone acceptance are separate. Neither this change nor
its disposable SQL fixtures applies a migration or enables M-41.

| Production context | Compact frame scope and positive authority |
|---|---|
| Play opened Spread/Total game draft | Actual Play, picks section, market and pickGame plus the editor's editable presentation signal. `playDraftLockIn`, reviewed draft/confirmation captures at `383cdf08`. Weekly/unopened, locked/receipt, late, busy, error, uncertain and storage-failure variants retain native framing. Prepared preview-confirmed pictures are not reviewed authority. |
| Points | Actual Points open week, editable slot, and populated player profile; native Dialog remains a Dialog. `pointsDraftPreview` at `881167ad`. Locked/pending/error/unavailable profiles or slots are not generalized from draft approval. |
| Score | Actual weekly score, selected scoreGame and existing local history selection. `scoreHistoryPreview` at `9bd5d6c9`. Compare and account History remain distinct identities. |
| League | Actual League board/feed and their existing supplied variants. `leaguePreview` at `77bf3123`. The existing Your leagues action remains. League's separate history adapter remains outside this frame scope. |
| NFL Research | Actual Games, Trends, Teams, Fantasy and their existing approved nesting layers. `populatedGameResearch`, `populatedTrendsList`, `populatedGamesList`, `populatedTeams`, `populatedFantasy`, `fantasyRankingsAccuracy`. The real ResearchLanding remains native. |
| Bets tools | Existing tracked/overview pane, historical recommended gap and Virtual PlaceBets board. `betsOverviewPreview` at `fb9ce818`, `gapRecordPreview` at `5490d6d1`, Virtual in `nflActionsNavigationPreview`. Generic active/settled lists, local ticket expansion, recommendations under view=research, Everyone and Add are distinct. Existing selected-ticket receipt intent retains the partial implementation's filter/collapse semantics. |
| NFL account History | Actual registered HistoryPage with Guess/Bets/Older page args, week and older subsection. `accountGuessHistoryPreview` at `e585b0af`, `historyBetsOlderPreview` at `5c421086`. It remains a Page, replaces the opener, and retains its Back/origin behavior. |
| EPL Home and Play | Actual EPL router and EplScreen, Home/default and pick/guess/leaderboard Play contexts, including their supplied recovery/read states. `eplHomeRecoveryPreview` at `d2ead64e`, `eplDraftPreview` at `59a1b55f`, `eplMoneylinePreview` at `6c543427`. Premier League is correctly selected. |
| Named access covers | Only actual LeagueCover, whose existing variants are access-pending and Community-removed. `leagueAccessPreview` at `5609f305`. Existing conditional recovery actions remain; arbitrary custom covers retain native controls. |
| Continuity hosts | Offline Home retains Home. Actual FantasyPage lazy import/Boundary failure retains the recognized Research/Fantasy host. Actual HistoryPage lazy failure opened from Research retains History's independently approved page frame. `continuityPreview` at `3797–3866` is scoped Research context evidence, not a new error-selected global frame. |

The inherited Home/Play/Bets roots and explicit selected-ticket receipts retain
their reviewed partial scope. Home body, data, spacing and lazy body/card rules
are unchanged. The same eagerly loaded shared CSS supplies frame geometry on
direct entry. Shared frame paint, 52px individual sport circles, the G without a
circle, complete league wording, four existing tabs and token floors are reused.

The pure frame policy uses recognized route metadata only after actual
router/screen/page/cover identity checks. EPL's existing lazy registry supplies
its identity check, so NFL entry does not import EPL bodies eagerly. A small
in-memory presentation signal names the existing draft/Points composition where
one route also renders unapproved variants. Its stable setter is bound to the
actual view object and account; cleanup only removes its own marker. It contains
no guess or scoring reference and never enters history, URL or storage. Modal
layers inherit their actual opener. No new route, Menu switcher or controller is
introduced.

The document's scroll padding now includes the real measured dock height as
well as floating-tab, safe-area and viewport clearance. PlaceBets' real portal
dock has no legacy save-bar class. Existing dock and toast positioning remains
8px apart. Browser resize coverage approximates keyboard opening/closing;
Chromium does not establish physical iPhone keyboard acceptance.

FEPL Research's frame is **held**. Its compact Fantasy full-screen approval and
native EPL Research navigation approval name the same production destination.
Both default Research and its fantasy alias, every local Fantasy tab and every
read state retain the existing native frame. No alias, data-state or illustrative
context-card route resolves that conflict. The owner question is queued by root
after the pending ROI question. EPL Bets and unavailable EPL History remain
native under their explicit approval. Unknown registries/pages/covers and
standalone auth/name/startup/account failure retain their prior semantics.

Fresh representative captures, reference hashes, exact source and verification
are recorded in
[the expanded evidence manifest](../design/prism-expanded-frame-native-2026-11-07/evidence.json).
Native Research root/NFL-only/FEPL/layer-failure captures use the separate
`prism-research-root-navigation-native-2026-11-07` directory. Normal replay writes
only ignored Playwright output. Capture refresh requires the explicit
`GTL_CAPTURE_EXPANDED_FRAME=1` or `GTL_NAVIGATION_CAPTURE=1` mode respectively.

The earlier 58 partial overview captures and 16 Research navigation captures,
their JSON receipts and their evidence manifests are frozen historical
artifacts. In particular the earlier NFL Research specimen used
`#research/games`; it does not establish the current native root mapping. It is
not relabeled as a fresh capture. Their original source versions and current
SHA-256 values are retained in the new manifest. Original per-area body reviews
continue to describe their original source; this task reviews outer frames.

Continuity mapping is concrete implementation evidence: the original generic
failed-page preview supplied no production page ID. These captures pair it with
an existing independently approved HistoryPage opened from Research. They do not
assert the preview originally named History, nor apply its frame to other
unmapped failed pages. Body-only account, tools, saved-pick, comments, reaction,
confirmation, source and rules families retain their current layering semantics.

Local verification used production source
`d3c1b01b84fb6e14d80d05ebf7fa0d6dce7fdaa8` and final capture/test source
`9047ba20606fa0dca4004c1860497a54adec7ce8` (the latter changes only the new
browser fixture). Results: 104 scoped strict Node tests, 923 Vitest tests in 92
files, typecheck, Brand QA, cloud build and bundle privacy all passed. The fresh
capture suite passed 12/12 and the focused existing Shell, Play nesting, Points,
Score, History and EPL regression selection passed 46/46; lazy-loading acceptance
passed 1/1. No retries or skips occurred. The inherited 11 overview/receipt cases
also passed in ordinary replay. The two unrelated reminder cases were outside
the focused regression selection; their tests were not changed or marked skipped.

The manifest binds 112 new expanded-frame viewport PNGs and 16 corrected native
navigation viewport PNGs, each with its capture hash and actual dimensions. Dark
and Light preferences are saved through ThemeProvider and checked against
resolved/computed paint. All families have 320/390 representatives; selected wide,
forced-color, keyboard/resize, long-name, Back/focus and real failure/dock cases
add targeted coverage. Virtual dock images show end-of-document clearance after
scrolling; the other frame images show the top viewport. All 128 fresh PNG hashes
and dimensions and the 80 frozen historical file hashes were verified.

Root coordinates separate stale-frame expectation fixes in `four-tab-redesign`,
`next-scroll-navigation` and `next-data`. Those files are outside this task's diff
and focused regression selection. This record does not claim integrated CI is
green before that separate work and independent review finish.
