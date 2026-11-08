# Native Account, access and recovery Prism rollout — November 7, 2026

Status: implemented locally on exclusive unpublished branch
`codex/prism-account-recovery-20261107`; parent review/integration, CI, release
and physical-phone acceptance remain separate. This work starts from freshly
fetched `origin/main` (`70c2b85ea7466ca308c8e69006b4ec09888267a7`) and fast-forwards
to integration `35ae5fc6c7dfa9d87ff22a3797b11c369a409590`.

## Exact authority and native mapping

The read-only reference checkout was verified at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`:
`design/style-directions-2026-11-04/selected-system-review.json`, its listed
paired captures, and the corresponding `populated-*` source/stylesheet files.
The [rollout plan](CONFIRMED_VISUAL_ROLLOUT_2026_11_07.md) areas 19–28 govern
scope. The [evidence manifest](../design/prism-account-native-2026-11-07/evidence.json)
records exact reviewed commits, approval scopes, source capture SHA-256 values,
native capture SHA-256 values and state-to-reference mappings.

| Area | Approved ledger / source | Native implementation |
|---|---|---|
| 19 Account, Profile, Reminders | `accountProfileRemindersPreview`; `populated-account` | `me/MenuSheet.jsx`, `ProfileSettings.jsx`, `PickReminders.jsx`: individual Account row cards, identity card, spaced form and retained-draft/problem boxes, fixed Profile save footer, state-specific bell/lock/unsupported graphics, two-hour/market strip, device facts and actual switch |
| 20 Settings, Guidance | `accountToolsPreview`; `populated-account-tools` | `me/AccountPreferences.jsx`, `MenuSheet.jsx`: selected-count header, two-column book checkbox cards, retained-unavailable labels, getting-started switch and expandable topics with original bodies/links |
| 21 Public app invite | `appInvitePreview`; `populated-app-invite` | `me/AppInvite.jsx`, `appInvite.js`: selected G, connection graphic, public payload card, explicit device Share, Copy and selected-text fallback; Account entry |
| 22 Authentication / name | `accessPreview`, `accessRecoveryPreview`; `populated-access` | `web/src/AuthGate.jsx`, `me/NameStep.jsx`: branded access panel, sign-in/create forms, actual email-confirmation card, neutral reset notice, reset/mismatch/loading/error presentations and native retained first-name setup |
| 23 Session / retained name | `sessionRecoveryPreview`; `populated-session-recovery` | `me/SignInAgain.jsx`, `NameStep.jsx`: existing same-account Dialog, actual password/Google methods, retained draft and distinct Check/Continue actions |
| 24 Appearance | `appearancePreview`; `populated-appearance` | `me/Appearance.jsx`: native theme store, selected miniature card/material graphic, motion card/effective OS resolution and storage notice |
| 25 Export | `exportPreview`; `populated-export` | `me/ExportSheet.jsx`: file hero, four category cards, owner/privacy card and actual preparing/completion/unavailable/failure/retry messages and downloads |
| 26 Continuity | `continuityPreview`; `populated-continuity` | `shell/AppScreens.jsx`, `Boundary.jsx`, scoped `.gx-offline`: selected startup skeleton, account/error/access surfaces and retained native navigation/retry/reload controllers |
| 27 League setup / invites | `leagueSetupPreview`; `populated-league-setup` | `league/SwitcherSheet.jsx`, `CreateLeague.jsx`, `InvitePlayers.jsx`: Community-first separate row cards, actual incoming invites, capacity graphic, private form, host-only link/status/revoke controls |
| 28 League access recovery | `leagueAccessPreview`; `populated-league-access` | `shell/AppScreens.jsx` and actual Switcher saved-link cards: pending/removed cover graphics, private fallback, retained records and native joining/uncertainty states |

Native `me/accountPrism.css`, `me/accessPrism.css` and league-scoped styles use
canonical selected tokens. This ports composition, spacing, graphics, forms,
expanded topics and sheet hierarchy as well as material. Metadata has a 12px
floor in the Account sheets; inputs remain 16px, and controls retain 44px targets.
The existing shell intentionally ellipsizes a long league title, with its full
accessible name retained. The new check permits only that existing, verified
clipped title; all content/form labels remain subject to overflow checks.

`AccountSheet` retains the real Sheet modal, gestures, close/back callbacks and
footer. It places the title before the independent back row, as the approved
Account presentations do, and explicitly preserves focus on in-place subview
changes. Empty alert/status regions retain their announcer semantics without a
layout footprint. Access-brand regression checks require exactly one visible G
color asset in each theme. This is native composition, without a preview DOM adapter.

## Preserved operations and boundaries

Profile still uses fresh account readback, explicit overwrite review, account/tab
scoped draft storage and Check after an uncertain save. Reminders still use the
actual store and `/push/*` routes; reading never requests permission or registers
a worker. The permission fact reads the browser permission separately from
delivery, so turning off never claims to revoke an existing grant. The server's
push-configured gate still controls the Menu row.

Settings retain catalog keys, live supported-book reads, original guidance
mapping, versions/CAS and explicit save semantics. An unavailable choice stays
until explicitly removed. A concurrent saved-account change never silently
replaces the draft. Every original Guidance paragraph and source/license link
is preserved and compared against the canonical `INFO` content in browser tests.

The public invitation contains exactly the approved title, generic message and
`https://guess-the-line.pages.dev/`. It contains no account identity, recipient,
league ID, token, pick, quote or referral field. Sharing requires a deliberate tap;
cancellation is reported as cancellation, and closing device sharing never claims
that a message was sent. Clipboard refusal exposes and selects the public link.
Private email-bound league invitations keep their separate host/access rules.

Auth keeps the provider/session, recovery, resend cooldown, minimum-password,
account-neutral reset, sign-out and returning-account/name rules. The confirmation
card is shown only after the existing sign-up response has no session; a recovery
event clears that presentation and retains the real reset flow. Successful recovery
and returning-account sign-in still proceed through the existing app gate.

Appearance uses the existing device-only stores and OS motion precedence. Its
labelled miniature is a decorative material sample, without fictional progress,
player records or a new controller. Export still checks `ownerId` before building
its actual JSON/Blob/download and excludes push devices; it writes/deletes no
account records. Startup, removal, access, retry and reload gates retain their
controllers. Dirty reload continues to use the browser-owned confirmation in the
existing confirm-before-clear order; the approved reload storyboard does not
introduce a replacement app dialog or a new browser permission.

There are no API, SQL, provider, migration, hosted account, collector, deployment,
Home, History/scorecard (areas 41–43), new avatar/award, NBA or Signal changes.
The shared header/sports-row/dock arrangement remains the separately held owner
question. Community/FEPL access and native league switching remain reachable.

## Documented auth-entry visual bridge

`AuthGate.jsx` is the shared native authentication entry under D-65; it is not a
second app shell. Rendering the approved signed-out design before the lazy app
loads needs exactly three native visual imports: named-only `PrismBrand` from
`./next/ui/PrismBrand.jsx`, and side-effect-only
`./next/styles/tokens.css` / `./next/me/accessPrism.css`. The narrow contract in
`tests/next-app-view.test.mjs` validates those exact paths and named access, while
preserving the blanket boundary for every other file/import. No native shell,
AppData controller, whole-kit namespace or app mount crosses that bridge. This
avoids duplicated brand artwork/tokens. Existing pure account-clear helpers stay
under their prior contracts.

## Verification

Local browser tests use port **5232**, the existing native controllers, real cloud
handlers and PGlite, with fictional accounts and fake browser/OS services only at
the test edge. The real push handler and local SQL RPCs verify subscription writes;
this does not establish an actual phone notification or a hosted delivery.

Capture checks traverse the start/middle/end of every scrollable surface at
**320×844 and 390×844 in Dark and Light**, check overflow/target sizes and Axe,
and include **forced-colors at 320**. Extended 390px browser captures expose whole
sheet compositions; they are recorded as extended viewports, not phone acceptance.

Final local results and exact capture counts are recorded in the evidence manifest.
The separate source-boundary/loading contracts still encounter the known baseline
Bets imports/bare-loading failures at this task's integration base; the parent owns
those fixes. The new auth-only bridge contract passes independently. No live
credential/denial probe, push delivery, OS share-sheet delivery, real email/reset
mail delivery or physical iPhone acceptance is claimed.

### Reproduce the local checks

`playwright.account-prism.config.js` uses the area-owned port 5232 and build/output
folders; it does not reuse another session's browser server. The final source
passed these checks:

- `npm run typecheck`
- `node node_modules/vitest/vitest.mjs run` — 88 files, 903 tests
- `node --test tests/me-export-sql.test.mjs tests/me-cloud.test.mjs tests/next-data.test.mjs tests/next-shell-state.test.mjs tests/sign-in-pending.test.mjs tests/google-sign-in.test.mjs tests/comparison-preferences.test.mjs` — 63 tests
- `node --test --test-name-pattern 'shared native auth entry' tests/next-app-view.test.mjs` — 1 exact import-bridge contract
- `node node_modules/playwright/cli.js test --config playwright.account-prism.config.js tests/cloud-browser/next-prism-account.spec.js` — 8 native matrices / 38 states
- Original browser suites `next-profile`, `next-export`, `next-invitations`, `next-league-create`, `google-sign-in` — 23 passing controller/provider tests
- Existing targeted `next-data`/`next-shell` checks — 11 passing recovery, access, Appearance, keyboard/focus, dirty navigation, tab failure, offline and failed-sign-out checks
- `python scripts/check-brand-docs.py` with UTF-8 Python mode — passed
- `npm run build:cloud` with test-only public client configuration, then `npm run check:cloud -- --bundle-only` — passed; existing chunk-size advisory only

The capture manifest contains **190 hashed native images across 38 states**,
including both full-composition themes, both 320px bottom/scroll views and one
320px forced-colors image per state. The source approval-capture hashes are
recorded separately; no preview fixture enters production source.
