# Guess The Line — retire the previous app without losing records

Owner: Sean Balsiger · Version 3 · October 21, 2026

Status: confirmed product direction (D-52); four open tasks, tracked as queue
item Q20. Preservation and cutover readiness remain unverified. This document
does not disable the old app or establish a production cutover. Delivery owners
are TBD and dates are not committed.

**October 21 update.** This plan was written on PR #144 (closed October 21) and
carried to main unchanged below this note. Since then:

- The new app is the four-tab **Home / Play / Bets / Research** shell (PR #162,
  Pages `46fb8ae6`). League lives inside Play; Lines, Trends and Fantasy live
  inside Research. Read the evidence table's five-tab wording (Home, Play, Bets,
  Lines, League) as these four roots.
- Core scoring, including per-game lock-in and the Community/Solo recovery
  readers from PR #141, went live October 19 (M-02 to M-08). Re-verify the
  recovery rows below against the hosted capability rather than "not hosted".
- `DEFAULT_APP` is still `classic` and the new app still offers "Use the old app".
- The `ed3fb50b` / `b883c77` identity and the `c251e8e1` HTTP 200 result are
  October 15 observations. Re-check current deployment URLs for RETIRE-03.
- PR #140's D-51 work is closed; only its reviewed-quote fix was carried forward.

Provenance: the earlier local draft called this direction D-48. Reconciliation
found that D-48 already identifies the shipped recommendations feature, while
D-51 identifies pending recommendation refinements. This record uses D-52 and
preserves the retirement request without renumbering those existing decisions.

## Required outcome

Sean: “Let’s also make sure no one can access the previous version. Let’s sunset
the previous version and only use the new app moving forward. Make sure nothing
is lost though”. The new app must be the only player-accessible app after cutover.
The old app cannot remain selectable through a menu, saved preference, direct
link or error fallback. Existing records and useful workflows must remain
accessible through the new app with their existing permissions.

This supersedes the optional classic mode in redesign stage 80. Stage 81 becomes
source/dependency cleanup after cutover; it must not leave the old app accessible
for a further two weeks. Prior rollout descriptions remain historical until the
retirement is implemented and verified.

## Evidence and current gaps

October 15 source review now uses the current implementation, inspected at
`94ef998` and carried into the reconciliation worktree based on `c60ab49`.
The separately inspected recommendations worktree at `3985acb` adds D-51 on top
of `94ef998`; its changes are not treated here as deployed.
PR #141 subsequently merged at `bb4f20a`, adding gated per-game scoring and a
Community/Solo recovery reader. That source is included in this reconciliation;
it has not been counted as hosted activation or completed preservation acceptance.

Fresh deployment metadata maps Pages `ed3fb50b` to
`b883c7742979d133720ed931c520821fdc4a13b5`. The canonical and immutable deployment
URLs returned matching SHA-256 values for the index, entry JavaScript and
NextApp JavaScript. The older `c251e8e1` deployment URL still returned HTTP 200.
The [dated retirement audit](../docs/RETIREMENT_AUDIT_2026_10_15.md) records the
checks and their scope. This is source/asset and URL evidence, not a fresh
signed-in workflow review, database audit, full-asset comparison or proof that
all older deployments have been inventoried.

| Evidence | Consequence |
|---|---|
| `web/src/appView.js` defaults to classic and honors `gtl.app=classic` and `?app=classic` | Changing the default alone does not retire access |
| `web/src/main.jsx` renders Classic after a new-app failure; non-cloud builds render the legacy App | Replace production entry/fallback routes and check every published build mode |
| `web/src/next/shell/registry.jsx` registers concrete Home, Play, Bets, Lines and League screens | The earlier placeholder finding came from a stale checkout and is superseded; source matching is complete, while workflow preservation remains open |
| Play imports `WeekPicks`; Bets imports `SocialBetTracker` and `VirtualUnits`; League History imports `HistoryLine` | The new app already uses these shared components. Retiring the classic entry must not delete their code, styles, readers or recovery support |
| Home, Play, tracked/recommended bets, selected-group Units, Lines/notes, Community feed/boards/history, private weekly boards and Profile are present | Preserve and verify these existing new-app workflows; a working main tab does not establish complete coverage of the 191-row inventory |
| New-app menu, switcher, shell and error cards still offer the old app | Replace every reachable exit with new-app navigation or recovery |
| League creation/invite management, journal/archive, Favorites, old Challenge/group history, freeze/revision records, export and commissioner tools lack complete new-app destinations | Finish the required destinations before cutover; Community History alone does not cover these records or operations |
| [Inventory homes](../docs/redesign/INVENTORY_HOMES.md) maps 191 older features, but is a plan; row 44 previously left tab drafts in the old app | Verify each destination, extend the inventory for later additions and recover drafts before removing their only reader |
| New Play uses the same `WeekPicks` and `communityDraft.js` recovery as classic Community | Retained Community tab drafts already have a new-app reader; verify preservation across cutover instead of inventing a second migration |
| Group `predictionDraft.js` copies still lack a new-app recovery destination. PR #141 adds Community/Solo readers in `PerGamePlay.jsx` behind the unhosted per-game capability; notes/profile/comments already use account-scoped recovery | Add group recovery; verify activation and acceptance of the merged Solo reader, per-game copies/uncertain saves, conflicts and account isolation |
| `VirtualUnits.jsx` selections/uncertain saves and tracked-ticket editors retain unsaved work in React state, with leave guards | A forced reload can lose in-memory edits; database backups and session-storage migration alone are insufficient |
| `web/public/sw.js` handles push without a fetch cache | Do not assume a cached app worker is the cause; still check deployed assets, open tabs, browser caches, launch URLs and older deployments |
| Historical Pages `c251e8e1` still answers HTTP 200 | RETIRE-03 remains open; the fresh check establishes an accessible old hosted entry point, not retirement |

The [completion register](../docs/COMPLETION_REGISTER.md) and
[existing-workflow scope](../docs/ALL_TABS_LIVE_WORKFLOWS.md) describe the current
bridge and remaining destinations. Per-game lock-in/scoring and pending redesign
migrations retain their own implementation and apply gates; this retirement
request does not silently change Guess rules or establish those features as live.

## D-60 two-step retirement (October 26, 2026)

Sean chose two steps ([D-60](../docs/DECISIONS.md)).

**Step 1 (built):** everyone lands in the new app.
- A device's saved choice no longer counts, and "Try the new app" is gone.
- The old app opens only at `?app=classic`, from four places:
  - Menu › **Older records and tools**;
  - the failure screens' "Use the old app";
  - the automatic fallback when the new app cannot load;
  - the address typed by hand.
- Nothing is saved, and the old footer offers **Back to the new app**.
- The contracts are `tests/next-app-view.test.mjs` and `tests/cloud-browser/next-switch.spec.js`.
- The old-app browser specs open their pages at `?app=classic` (`tests/cloud-browser/old-app.mjs`).

**Step 2, access (done October 28, 2026, [D-65](../docs/DECISIONS.md)):** the old app is no longer reachable: the Menu row, the failure screens' "Use the old app", `?app=classic` and the classic fallback are gone, and a reload screen replaces the fallback. The rows below without a new home are unreachable from the UI until their pages ship.

**Step 2 (remaining):** give each item below a native home, close old hosted entry points (RETIRE-03) and remove leftover old-UI source (RETIRE-04).

| Still only in the old app | New home | Lane |
| --- | --- | --- |
| Full change history, closed drafts, older records | History (stages 72–74, M-27) | History and export lane |
| Retired Betting Challenge, group archives, Week 5 freeze | History: older records (stage 74) | History and export lane |
| Saved games and forecasts; the journal (read-only) | History: older records (stage 74) | History and export lane |
| Real slips by week | History (stage 74) | History and export lane |
| Export my data | `/me/export` (stage 75, M-28) | History and export lane |
| Settlement and schedule status | Menu › Commissioner tools › Schedule and settlement status (October 28, D-65 follow-up; built, not deployed) | Commissioner tools |
| Week opening, referee assignments, final scores, odds connection | Menu › Commissioner tools (October 28, D-65 follow-up; built, not deployed) | Commissioner tools |
| Group-draft reconciliation and device recovery | RETIRE-01 | Integration |

When the table is clear:
1. Remove the Menu row, the failure screens' "Use the old app", `?app=classic` and the
   classic fallback, which a retry and reload screen replaces (RETIRE-02).
2. Close the old hosted entry points (RETIRE-03).
3. Remove the old UI source (RETIRE-04).

The same pass moves `web/index.html` fonts, the meta description and the manifest
colors to the new app.

## Task register

Reviewed October 15, 2026. P0 means a cutover prerequisite. Suggested lanes are
routing from the redesign plan, not assigned workers.

| ID | Priority | Task | State | Suggested lane / owner | Dependencies | Target |
|---|---|---|---|---|---|---|
| RETIRE-01 | P0 | Reconcile the active build and prove record/workflow preservation | Open — source matching done; destinations, draft recovery and preservation verification remain | A + B + C + E / TBD | Matched deployed source; full inventory; stages 28–31, 47, 72–78 | Not committed |
| RETIRE-02 | P0 | Make the new app the only runtime and remove every classic escape path | Built October 28 (D-65): the new app is the only runtime; no escape path, `?app=classic` dropped, failures reload; commissioner tools still need new homes | A / TBD | RETIRE-01; stages 9–11, 37, 76–80; shared-shell acceptance | Not committed |
| RETIRE-03 | P0 | Close old hosted entry points and verify cutover on existing devices | Open — October 28 read-only [inventory](../docs/RETIRE_03_INVENTORY_2026_10_28.md): production is new-app only; 47 of 48 recorded deployment URLs still serve an old-app build against the hosted API; closure plan awaits Sean's approval | Integration / TBD | RETIRE-01/02; release checks; actual hosting access | Not committed |
| RETIRE-04 | P1 | Remove unused old UI code while preserving recovery evidence | Open — follows verified cutover | A / TBD | RETIRE-03; stage 81; dependency audit | Not committed |

### RETIRE-01 — preservation before access removal

- **Source matching done:** production metadata identifies `b883c77`, selected
  canonical/immutable assets match, and the working new screens are located in
  current source. Continue the preservation audit, including newer work added
  after the 191-row inventory and the separately pending D-51 branch. Mark each
  existing capability as a working new screen, readable History entry, or an
  explicit unresolved gap. A planned destination is not proof of access.
- Preserve account IDs/sign-in, groups/memberships/invites, all weeks, guesses,
  draft/locked states, original timestamps/revisions, saved and ruled references,
  scores, eligibility/sit-outs, bets/slips/units/results, challenges, journals,
  forecasts/favorites, notes, posts/comments/reactions and historical audits.
  Preserve supported preferences, reminders and exports too. Reuse canonical
  records; do not re-enter or re-score them merely to change the frontend.
- Capture a recoverable private backup/export and a before/after reconciliation
  manifest using stable IDs, record counts and relevant hashes. Include archived,
  removed-member and commissioner-ruled records. Verify recovery; keep private
  contents out of Git, static assets and public logs.
- Preserve the separate loopback owner workspace (`.local/state.json` and source
  snapshots) as its own data set. It is not automatically synchronized with hosted
  accounts; do not delete it or silently upload/merge it during frontend retirement.
- Inventory device/tab-only drafts and unsaved forms. Provide account-scoped
  recovery into the new app before forcing reload or clearing storage. Keep the
  existing Community draft reader shared through `WeekPicks`; add destinations
  for group recovery copies; verify the merged, gated Solo recovery reader and
  the account/week/market per-game draft and pending-save copies. Provide a safe handoff for memory-only
  bet selections and uncertain saves before any forced refresh. Preserve
  conflicts and expired/locked drafts as readable recovery where they cannot be
  legally resubmitted; never turn a draft into a submitted guess automatically.
  Check existing TTL behavior so retirement does not silently expire or discard
  a recoverable copy. Do not claim access to drafts on devices not inspected.
- Exit: every retained data category has an accessible destination and reconciled
  evidence; representative old and current weeks, an old account, archived data,
  notes, slips and a draft recovery are verified. Native History/export and admin
  tools work without opening the previous UI. Any unresolved loss/access gap
  prevents the cutover from being marked ready.

### RETIRE-02 — one app, including errors and deep links

- Make the authenticated production entry render only the working new app.
  Eliminate classic selection from defaults, stored settings, query parameters,
  menus, placeholders, settings, error boundaries and commissioner links.
  Storage disabled, stale `classic` preferences and `?app=classic` must still
  open the new app without deleting unrelated preferences or drafts.
- Translate old bookmarks, invitations, sign-in callbacks and notification links
  to their new destinations. Preserve meaningful route context and access checks.
  New-app load failures offer retry/reload/sign-in recovery with draft protection;
  they must never mount the old UI.
- Ensure production bundles do not import a runnable legacy app through an
  alternate build mode or hidden route. Local source archives may remain for
  engineering recovery; they are not player-facing app options. Shared editors
  such as `WeekPicks`, `SocialBetTracker`, `VirtualUnits` and `HistoryLine` may
  remain in the new app; removing the classic shell is not blanket removal of
  files outside `web/src/next/`.
- Exit: meaningful tests cover first visit, old/new preferences, blocked storage,
  query/hash links, browser Back, error/chunk failures, account changes and reload.
  No tested path renders classic; existing new-app workflows and privacy gates
  pass. Complete UX-NEXT-01's mobile navigation checks for the cutover build.

### RETIRE-03 — hosting, stale clients and release evidence

- **October 28 inventory:** [RETIRE_03_INVENTORY_2026_10_28.md](../docs/RETIRE_03_INVENTORY_2026_10_28.md)
  (curl only, signed out, no hosting change). Production `0a4c0d25` has no
  `GameHub` chunk. 47 of the 48 deployment URLs recorded in the repository answer
  HTTP 200 with an old-app build (37 with a `GameHub` chunk, 10 pre-redesign),
  all pointed at the hosted Supabase project. The full Pages deployment list
  still needs the Cloudflare login. No custom domain or preview alias is
  recorded; the service worker never cached pages. The proposed closure plan
  (Access policy on non-production URLs, then deletion after RETIRE-01 backups)
  waits for Sean's approval.
- Inventory canonical/custom domains, preview/branch and historical deployment
  URLs and any separately served legacy build. Redirect or disable old hosted
  entry points without deleting player records; changing the current frontend
  alone does not establish that old deployment URLs are inaccessible. The fresh
  `c251e8e1` HTTP 200 result is a known open entry point to resolve, not a complete
  hosting inventory.
- Check already-open old tabs and installed Home Screen launches. Provide a
  safe upgrade path that preserves recoverable edits; verify old clients cannot
  continue obsolete workflows after the transition. Retain shared API routes
  needed by the new app and enforce current rules server-side. A hidden switch
  or client-only flag is not sufficient evidence of retirement.
- Record backup/reconciliation results, exact release SHA, deploy/readback and
  phone checks. Verify authenticated and signed-out visits, old links, old saved
  preferences, failures and historical URLs. Previously downloaded offline code
  cannot be recalled; completion means supported hosted access and connected
  workflows no longer serve or operate the previous app.
- Keep an operator recovery plan using a compatible new-app build or a controlled
  recovery state. Do not silently roll players back into classic or restore an
  old database over newer entries. Any exception to the new-only direction must
  be explicit and recorded.
- Exit: hosted entry-point checks and device acceptance pass, before/after data
  reconciles, every preserved record category is readable with its permissions,
  and no player-facing classic path remains. Record unresolved devices/URLs
  honestly; do not label an incomplete audit “no one can access the old app”.

### RETIRE-04 — source cleanup

- Once RETIRE-03 passes, remove unused old screens, CSS, switch helpers and obsolete
  fallback tests. Preserve shared modules, authentication, data readers, draft
  import/recovery support and tokens until dependency checks prove them unused.
- Keep Git history and private release/backup evidence. Do not drop tables, rows,
  historical snapshots or still-used server routes as UI cleanup. Replace old
  test coverage with preservation/navigation coverage before deleting it.
- Exit: stage 81's dependency/bundle checks pass and retained records/workflows
  still pass their new-app acceptance checks after cleanup.

## Existing tasks updated

Stages 9–11, 37 and 76 replace switching/fallback behavior at cutover; 28–31 keep
existing Community recovery and add the missing old-draft recovery; 47 and 72–78
must supply all retained history, export and admin
destinations before stage 80. Stage 79 checks new-only access and preservation;
stage 80 enforces it for everyone; stage 81 only cleans up afterward. DASH-1,
DASH-9 and Rollout include this work. Scoring and Bets tasks keep their own rules
and verification; retirement does not itself change score or settlement logic.

The frozen v62 tracker is unchanged. The private Status Board has not been
updated. Link implementation and live evidence here when those actions occur.
