# League and National Football League action layouts — November 7, 2026

Status: local native implementation and verification; independent review and
integration pending. No push, PR, merge, migration, hosted release or physical
phone acceptance is established here. This is the owned area 07/18 slice over
`35ae5fc6c7dfa9d87ff22a3797b11c369a409590` on
`codex/prism-league-actions-20261107`.

The authority is the selected-system review at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`, read without modifying the
owner-acceptance checkout. `populated-league.jsx/.css`, the supplied League
Spread/Total/Points/feed/comments pairs, and `populated-nfl-actions.css` with
`NFL_ACTIONS_NAVIGATION_REVIEW.md` establish the compositions. The
[rollout scope](CONFIRMED_VISUAL_ROLLOUT_2026_11_07.md) remains the reconciliation
checklist. Existing selected tokens supply both themes; native minimum type and
44px controls remain enforced.

The League board now has the approved two-column personal season standing above
the rows. Each market uses only its own permitted shared standings. Missing
results remain a dash, scored zero stays zero, and ties retain their shared rank.
Points uses rank and face at the left, season points at the right, a separate
unranked House card, and the existing first-six-plus-viewer slicing helper with
an explicit expansion. Earned badges, rank moments and every member remain
reachable. Native Nest keeps routes, Back actions and focus while its extra
League frame/insets are removed so the actual cards float on the canvas.

Feed posts put name, event and post time in separate lines. The folded card
has its face stack, names, participant count and full-width expansion. A revealed
shared result has individual team circles and names, points out of ten, the exact
saved guess, and an accessible accuracy bar; an unrevealed result has no number
or graphic. The post's native visibility projection remains the sole gate.
Reaction/comment actions retain their real handlers. Comments retain all text,
show a nonnumeric post summary, a visible input label and a stacked fixed footer.
Long read-only sheet bodies are keyboard reachable through an optional native
`Sheet.bodyTabIndex` property, enabled only for comments, reactors and picks.
Default Sheet behavior and the focus trap are unchanged.

The saved-pick/community-guesses, game-bets, feed-picks/reactors, Virtual entry/
slip and whole-week reveal layers use the approved body/header/footer spacing,
card padding, wrapped back control, result hierarchy and outlined controls.
Readers, source times, saved references, unavailable states, request IDs,
uncertain-write recovery, private roster scopes and accounting are retained.
No production fixture, adapter, API, migration or provider was added.

Local evidence is recorded with SHA-256 hashes in
[the capture manifest](../design/prism-league-actions-native-2026-11-07/evidence.json).
Those are actual native components driven by local PGlite and the real cloud
handlers, with fictional test records only. Captures compare the reference
hierarchy and material with dynamic fixture data; they are not pixel equality
claims. League captures include all three markets, long names, full page content,
long comment threads, saved draft input and scrolled sheet bodies at 320/390 in
both themes, plus forced colors. Action captures include saved Total references,
community guesses, game bets and the reveal dialog in the same matrix. The fixed
header naturally overlays content as it scrolls past; separate checks ensure the
last page action remains below the header and above the dock.

Verification commands and their actual outcomes are recorded in the manifest.
The main checks are the complete Vitest suite with bounded workers, typecheck,
48 focused Node contracts, existing controller/PGlite browser suites, full-page
and scrolled-sheet layout/44px/axe checks, Brand QA, cloud build and bundle-only
privacy scan. An initial unconstrained parallel Vitest run timed out in the heavy
Lines markup leak test; the bounded-worker run passed without changing its
assertions or source timeout. Existing import/loading contracts still fail on
the integration base's separately owned Bets CSS import/loading issues; the
parent integration task is correcting those files.

Remaining boundaries: the 106 approved action captures have not each been
recreated and compared. Error/loading/wrong-scope/uncertain/deadline states have
controller regression coverage but do not all have paired visual captures.
Menu/shared header/sports-row/dock structural work is outside this slice and
retains the pending owner clarification. Virtual Units continues to use the
functioning positive half-unit entry contract: the approved finer Custom/0.1U
controls need a separate SQL/API compatibility change and explicit migration
apply authorization. No unsupported stake is presented as saveable. Actual
accounts, hosted writes and physical devices still require their release gates.
