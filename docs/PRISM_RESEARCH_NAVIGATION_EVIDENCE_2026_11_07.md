# Research navigation evidence — November 7, 2026

Four exact Research navigation contexts now have paired native Dark/Light evidence
at 320 × 844 and 390 × 844. This is local implementation reconciliation against
existing scoped approval, pending independent review. No product file changed.
It neither answers the held Play/Bets framing question nor chooses a global frame.

The frozen product source is `1ba236960dfb8050538ba762b35e40eb2799e071`.
This task branch was created from freshly fetched `origin/main`
(`7aa93a6ffe79eafb58bd6c7d12ec230b6d77b0e9`) and fast-forwarded to that source.
The read-only owner authority is `3ac2eb50513ba73447ef890e4a47863cde7bdd76`.
Its `design/style-directions-2026-11-04/selected-system-review.json`,
`NFL_ACTIONS_NAVIGATION_REVIEW.md`, `populated-nfl-actions.jsx`,
`EPL_SHELL_REVIEW.md` and later league-circle/wording captures were checked.
The parent task's ignored contextual-navigation approval audit was read first.

## Exact row reconciliation

All links below are 390px viewport captures; each also has its 320px counterpart
in the same folder. The [capture manifest](../design/prism-research-navigation-native-2026-11-07/evidence.json)
records all 16 PNG hashes, actual routes, saved/resolved/computed themes, geometry,
targets, 18 authority-file hashes and 24 unchanged product/token-file hashes.

| Ledger row / exact scenario | Native evidence | Proposed scoped status after independent review |
|---|---|---|
| `Account/action-navigation-nfl` / `navigation-nfl` | [Dark](../design/prism-research-navigation-native-2026-11-07/navigation-nfl-dark-390.png), [Light](../design/prism-research-navigation-native-2026-11-07/navigation-nfl-light-390.png): authenticated National Football League Research, both sports offered, Community identity | Existing approved Research placement implemented and paired locally |
| `Account/action-navigation-epl` / `navigation-epl` | [Dark](../design/prism-research-navigation-native-2026-11-07/navigation-epl-dark-390.png), [Light](../design/prism-research-navigation-native-2026-11-07/navigation-epl-light-390.png): actual Premier League Research, both sports offered, FEPL header and FEPL Fantasy destination | Existing approved Research placement and separately grounded FEPL identity implemented and paired locally |
| `Account/action-navigation-nfl-only` / `navigation-nfl-only` | [Dark](../design/prism-research-navigation-native-2026-11-07/navigation-nfl-only-dark-390.png), [Light](../design/prism-research-navigation-native-2026-11-07/navigation-nfl-only-light-390.png): authenticated National Football League Research with no EPL access | Existing approved access-limited Research placement implemented and paired locally |
| `Account/action-navigation-layer-failed` / `navigation-layer-failed` | [Dark](../design/prism-research-navigation-native-2026-11-07/navigation-layer-failed-dark-390.png), [Light](../design/prism-research-navigation-native-2026-11-07/navigation-layer-failed-light-390.png): real failed lazy layer, retained Research frame and native error toast | Existing approved failure semantics implemented and paired locally; illustrative inline notice is not native toast geometry |

No aggregate ledger, status count or completion-register entry is changed here.
The evidence hold for these exact Research scenarios can be removed after review;
the broader owner question remains held. This is not a new owner-acceptance claim.

## Reference comparison and behavior

The original four specimens initialize `tab='research'`. Their authored order is
the G/league/menu header, a separate sports row, destination context, then the
four full-width tabs with Research selected. Native captures retain that order.
The later approved circles replace the original rectangular NFL/EPL text controls;
full National Football League / Premier League names remain on their accessible
names and titles. The later wording approval does not move this row into the header.
The original EPL example's generic Community fixture does not override the
separately approved native FEPL identity. The FEPL screen here is the real native
controller's **No Sleeper data is saved yet** state, because the disposable fixture
has no stored fantasy snapshots. No illustrative preview body is inserted.

At both tested widths the native header is y=0, height=57px; sports begin at y=57,
height=68px. Each sport has its own 52 × 52px circle with a contained, decoded mark.
The native dock spans x=0 through the viewport width at y=780, height=64px.
All four tabs remain present with Research active. The full league-control names,
44px minimum frame/toast targets, 16px tab labels and readable toast copy are
asserted. Narrow wrapping remains within the viewport. All 16 captures were
visually inspected, with original and later approved reference representatives.

For the failure state, the browser blocks only the real built `ExportSheet-*.js`
chunk when the member opens Menu → Export my data. React's existing layer boundary
closes that layer, retains the non-inert Research app, and asks the existing
ToastHost to announce **That couldn’t open.** assertively. Its persistent native
toast includes **Reload the app** and Dismiss, with its bottom 8px above the dock;
at 320px the message and reload label wrap inside their targets. Activating Reload
performs real document navigation and restores Research without the failed layer.
The preview's inline notice is illustrative context. Transplanting it would
replace the actual controller, so its exact body position is not claimed as native
pixel equality. No contradictory placement within these scoped Research contexts
was identified, and no product correction was necessary.

The fixture uses fictional authenticated accounts, ALL migrations on disposable
local PGlite **0.5.8**, the real NFL handler, and the real EPL manager RPC through
the EPL handler. As in existing EPL browser tests, the lobby capability adapter
sets `epl` true/false to exercise account-specific availability. It is not evidence
of hosted entitlement. The native league switcher opens with Community or FEPL
and returns focus on Escape. Sport changes keep Research selected. A saved EPL
Research link with access false returns to NFL without an EPL control or screen.
NBA remains absent. The existing profile-draft test verifies cancel/confirm guards,
draft recovery across sports, commissioner-menu access and no profile write.

## Verification and reproduction

The owned [focused config](../playwright.research-navigation.config.js) uses port
5296, isolated build/results directories and no reused preview. Ordinary test
runs do not write committed captures or manifests. Explicit refresh:

```powershell
$env:GTL_NAVIGATION_CAPTURE='1'
npx playwright test --config playwright.research-navigation.config.js tests/cloud-browser/next-prism-research-navigation.spec.js tests/cloud-browser/shared-sport-interface.spec.js tests/cloud-browser/next-shell.spec.js --grep 'Research native|EPL profile drafts guard leaving|a layer that fails closes and says so'
node tests/cloud-browser/research-navigation-evidence.mjs <read-only-owner-acceptance-worktree>
```

Results: **6/6 browser cases passed** (43.1s); the new cases each validate both
themes at both widths. The existing harness failure and actual profile guard cases
also passed. A normal capture-disabled replay passed **4/4** (29.6s), with all
**21 reviewed evidence files unchanged** by SHA-256. Scoped axe checks cover the header, sports row and dock; geometry and
target checks additionally cover the real toast. The normal Research body receives
the existing phone-layout checks; the floating failure toast is checked separately
so its intentional overlay is not treated as a replacement body layout.

`node --test tests/next-tokens.test.mjs tests/next-loading.test.mjs tests/brand-mark.test.mjs`
passed **22/22**. `node --test tests/next-app-view.test.mjs` passed **10/10**,
including strict shared-hook/import inventory. Brand QA passed with
`python -X utf8 scripts/check-brand-docs.py`; the Windows default cp1252 invocation
could not decode the pre-existing guide, so UTF-8 mode was used without modifying
the checker. Whitespace checks passed. The first new test run rejected the valid
token radius `999px` by assuming its CSS spelling must be `50%`; the assertion now
checks circular geometry. No product change followed that test correction.

The manifest generator verifies every capture hash against its per-scenario file,
each approved reference image hash against the authority selection JSON, and all
listed product/token text against the frozen source (normalizing checkout line
endings only). Full suites were not rerun. Captures are desktop Chromium at CSS
viewport sizes with reduced motion and zero simulated safe-area inset; no actual
iPhone, browser-chrome or enlarged-text acceptance is claimed. Wider layouts are
outside these phone evidence rows. No hosted data, migration apply, push, PR,
merge or deployment occurred; this task's commits remain unpublished for review.
