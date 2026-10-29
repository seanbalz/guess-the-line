# Research and shared NFL/EPL interface release — October 29, 2026

Owner: Sean Balsiger · Version 1

## Authorization and source

Sean explicitly instructed: “Go ahead and merge PR #376 once all checks pass,
then deploy the fixes and recheck Research and the NFL/EPL switch on the iPhone.”
His coordinated shared-interface request requires the same account/profile,
navigation and current primary section in both sports, with sport-specific modes.

- [PR #376](https://github.com/seanbalz/guess-the-line/pull/376) merged after all checks passed as `cde3e4f377b1d2839de482e5c19e3dbfb6d4ae4f`. It fixes loaded Research quote/team layout on phones and versions favicon/apple-touch-icon references. Its partial EPL rewrite was removed in favor of #379.
- [PR #379](https://github.com/seanbalz/guess-the-line/pull/379) merged after all twelve checks passed as **`a41f68362acb5165b17ef6f20673d23d1a2c9ec8`**, the exact released source. It retains the shared account provider, Shell, menu/profile and current primary section, adds the Sports landmark and preserves keyboard access.
- The source also includes already-merged #377. Its optional commissioner correction-review frontend handles the existing API's unavailable state. Its API/worker changes remain undeployed and M-33 remains pending. The subsequent #384 moneyline source is outside this pinned release.

## Compatibility and recovery

Target: **frontend only**. Existing API contracts are retained. No SQL apply,
backend/worker deployment, cron, privacy rule, collection budget or pick deadline
was changed by this run. Recovery is a separately gated frontend release of
previous source `5c1b775f05a69306f20f911f4b0455c207c65ffc`, Pages
`72eb400b-77df-4ef0-944f-8ceb7b04c38f`, or a reviewed narrow revert atop main.
Preserve existing drafts/storage; do not clear them to repair a retained old tab.

## Production evidence

| Gate | Verified result |
| --- | --- |
| Exact-main CI | [Tests 40924170231](https://github.com/seanbalz/guess-the-line/actions/runs/40924170231), [Dashboard 40924170504](https://github.com/seanbalz/guess-the-line/actions/runs/40924170504) including all four browser shards and Persona, and [Brand QA 40924170395](https://github.com/seanbalz/guess-the-line/actions/runs/40924170395): SUCCESS |
| Source | [40925739398](https://github.com/seanbalz/guess-the-line/actions/runs/40925739398): SUCCESS |
| Protected readiness | [40925817831](https://github.com/seanbalz/guess-the-line/actions/runs/40925817831): SUCCESS; observed `2026-10-29T17:55:55.998Z` |
| Reviewed release card | [PR #376](https://github.com/seanbalz/guess-the-line/pull/376), recorded before dispatch with source, target, digest, compatibility, recovery and Sean's authorization |
| Deploy/verification | [40926218502](https://github.com/seanbalz/guess-the-line/actions/runs/40926218502): SUCCESS; verified `2026-10-29T18:00:01.863Z` |
| Pages | `1d0fc9f1-bb82-4816-85c1-f53be63e7776`; [production](https://guess-the-line.pages.dev) |
| Frontend SHA-256 | `5010912c1599de1563e05c1b2b9079acfac19a18fb14ab61a58272b4e7c93ccd` |
| Served assets | All 125 manifest assets matched production. Immutable deployment URL is Access-protected; verifier recorded `deploymentUrlAccess: protected` |
| Migration history | 70 rows, unchanged digest `904f30b98e82e3705f72f2bc8efc787352bb616bbed0b3433f461041596803c1`; M-33 `20261029151727` remains pending |
| Boundaries | 399 checked: 394 denied as expected; five explicitly awaiting M-33/compatible API (table, three service-only RPCs, unauthenticated corrections read route). Awaiting is not a successful denial |
| Schedule | Week 8, 28 games; evidence passed with `timeRestrictions: false` |
| Backend preservation | All function metadata unchanged. API v42 ACTIVE/JWT on, bundle `81c4c8087d4a5afdf8815ff06a4b0aedcfb7ab1aba6ac6cfe85ff037c6a8ce1a`; EPL jobs v2 unchanged. This frontend release does not independently verify hosted API source bytes |

A separate public HTTP read at `2026-10-29T18:02:48.229683Z` matched the manifest
for canonical HTML, the live entry `assets/index-CT-LnSLy.js` (SHA-256
`41d080ea481b05ce65b1d44c48e697fb28f3bc69841c29708af28360a7600fbe`),
versioned favicon and apple-touch icon. A further direct read also matched
`assets/NextApp-DRdq-iGe.js` (`13846b3310d4d68a482fb2b00345d3c72861ba80b041a9490cc9f5a6b1eaa562`).
The fresh authenticated desktop document
used that entry. Icon references include `?v=balanced-20261029`; this confirms
served references/bytes, not replacement of every cached iOS icon.

## Combined validation

The isolated integration tree combined #376, #377 and #379. All 69 broad browser
cases passed, including full Research Lines/privacy/recovery, phone layout,
scrolling, EPL account flows, correction reviews and retained NBA compatibility.
After the final narrow Sports landmark correction, 16 focused browser cases
passed, including full-page all-rule Axe at 320/390 in both themes, both-sport
keyboard navigation/modal containment, profile/tab retention and loaded quotes.
The final combined tree exactly matches the released main tree.

Also passed: 76 Node tests, 74 component tests, typecheck, Brand/document QA,
cloud build and bundle privacy scan. Local writes used disposable PGlite and
synthetic accounts only. Existing large-chunk build warnings remain.

## Authenticated production readback

Fresh desktop document, existing signed-in account; no player-write controls
activated. Profile was opened read-only in both sports: same display name,
account and disabled Save name button. The same avatar/menu and four navigation
buttons remained throughout. League selector correctly changes Community/FEPL.

| Starting section | NFL → EPL | EPL → NFL |
| --- | --- | --- |
| Home | Home selected, `#epl/home` | Home selected, `#home` |
| Play | Play selected, sport-specific Pick a Team | Play selected, NFL game modes |
| Bets | Bets selected; existing EPL unavailable state retained | Bets selected, existing tickets remain available |
| Research | Research selected, EPL Fantasy | Research selected, NFL Fantasy |

Research Lines loaded actual permitted quotes and saved-reference labels. A
390px production screenshot visibly confirms full Panthers/Packers names with
spread/provenance on its own row; temporary browser size was restored. Fantasy
finished loading. No warnings/errors were captured in this verification tab.
Production screenshots/profile details stay private in ignored local QA output;
no player information is copied into this public record.

## Physical acceptance and remaining work

Post-deploy physical Research/switch acceptance remains pending. Mirroring first
reported “iPhone in Use”; reconnecting later showed Safari. A new Safari tab at
`https://guess-the-line.pages.dev/?release=a41f683` loaded the signed-in Home with
the expected logo/navigation. Research taps were rejected by the Mac automation
surface (`noWindowsAvailable`), so no physical Research/switch pass is claimed.
Restarting only the Mac mirroring app reached “Unlock Your iPhone”; Sean was
asked to complete that OS prompt and lock again. Existing tabs, installation,
storage, drafts and original appearance settings were preserved. Desktop
responsive checks and earlier physical logo/theme observations remain separate
evidence, not substitutes for this release's physical Research/switch readback.

[The regression audit](REGRESSION_AUDIT_2026_10_29.md) retains AUD-03 (safe recovery
for older running clients), the cached adaptive-favicon uncertainty, and separate
unfinished EPL modes. This release does not claim exhaustive app acceptance.
