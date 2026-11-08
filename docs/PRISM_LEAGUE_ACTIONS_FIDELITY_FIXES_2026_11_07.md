# League and NFL action review fixes — November 7, 2026

Status: local fixes and expanded native verification; independent parent review
and integration remain pending. Exclusive branch
`codex/league-action-fidelity-fixes-2026-11-07` starts at freshly fetched
`origin/main`, fast-forwards to `be6bc29e3978917be78e409896ca4f5ea5a3b531`,
then cherry-picks dependency `194ba410db4847594324243141fd1b6b09c10f3b` as
`4983138495f3d62268f3f1cfa39b21b477981297`. No push, PR, merge, deploy or
migration is part of this handoff.

## Final Picks / Reactors list-surface correction — November 7, 2026

The final focused review left two visual issues: the Picks and Reactors rows
showed the global List backplate, and Reactors' last-row separator selector did
not reach through the List's `li` wrapper. The scoped `.gx-nfl-action` rules now
make those existing lists transparent with zero gap; `ReactorsSheet` supplies
the class and the final separator targets its real last list item. The parent
flush glass card stays visible under the rows. No List default, controller, API,
SQL, privacy/reveal or unit gate changed.

The existing native browser fixtures now assert transparent computed list
backgrounds, zero row gap, a 1px first-row separator and no final separator with
two real local reactions. Hidden opponent picks retain their redaction. The two
focused browser cases passed with no skips at 320/390 in actual native Dark and
Light preferences; 44px targets, axe, keyboard, overflow, and a focused forced
colors separator check also passed. Reinspected captures against exact review
authority `3ac2eb50513ba73447ef890e4a47863cde7bdd76` retain the selected card face
and row hierarchy. The evidence manifest preserves all 200 unaffected images
from the 206-image prior set, refreshes the six affected 390px images and adds
their six 320px counterparts plus one forced-colors check. These
local results do not establish approval, deployment, hosted acceptance or full
106-state completion.

The exact approved reference checkout remains at
`3ac2eb50513ba73447ef890e4a47863cde7bdd76`. Its populated League, populated
NFL actions, isolated native presentation and selected-system review files were
read without modifying that checkout. Source and reference hashes and all native
capture hashes are in [the evidence manifest](../design/prism-league-actions-native-2026-11-07/evidence.json).

The five independent findings are corrected:

- Private Spread/Total standings explicitly pass the authenticated group's own
  scope, weekly period and native week. The hero says weekly standing rather
  than season standing. Community season figures are never substituted. Zero,
  ties and no scored result remain distinct. The Community hero derives its
  chase detail from that market's existing board rows; Points shows its actual
  week value separately from its season total.
- The uncertain sit-out close uses the native application Dialog with its own
  heading, warning, Keep checking and Close actions. Escape returns to checking
  and restores the safe action's focus. Closing keeps the session recovery marker;
  reopening checks before a retry. The running-write guard and underlying draft
  remain in place. No browser confirm is used by this controller.
- The comments list locally clears the inherited solid list background, border,
  radius and shadow. Individual rows sit on the sheet canvas, including long,
  scrolled and forced-color views.
- The standing hero is followed by a season heading and real weekly context;
  private groups receive a weekly heading. Newest posts and the full-width
  outlined primary Open the feed action restore the approved hierarchy. Existing
  History and feed/navigation handlers remain intact.
- Game bet name/market and selection/units lines use space-between alignment.
  A 14-row fixture verifies hidden terms stay hidden and the lower rows/actions
  remain reachable.

Expanded Virtual captures exposed a native accessibility defect: while a save
was busy, every body control was disabled and its scrolling region could not be
reached by keyboard. The slip now opts into the existing `bodyTabIndex={0}`;
End scrolls the busy body and the default Sheet focus trap is unchanged. No
stake precision, save logic, API, SQL, migration or provider was changed.

Native verification uses the actual app, controllers and handlers over local
PGlite with fictional records. Explicit authenticated response intercepts supply
the large roster, long game-bets list, unavailable/loading/empty replies and
uncertain replies. They are confined to browser tests. The roster test checks
first six plus the viewer, expansion to nine, folded posts, hidden posts and
switching to the real local private-week reader. The forfeit tests verify no
repeated write, the recovery marker, drafts, Escape, focus return and busy guards.
Virtual retries preserve the same request and produce exactly two local picks.

Capture helpers set `gtl.theme` through the native storage-sync event, assert
both resolved theme and saved preference, then check the rendered canvas/text
tokens and normal-mode text color before capture. Media changes and navigation
therefore cannot silently turn a Light image into Dark. Dark/Light at 320/390,
forced colors, full pages, lower sheet bodies, 44px targets and axe are covered
for the principal affected compositions. Additional distinct-state pairs are at
390px; this is not a claim that every state has every viewport. Existing shared
header/sports-row/dock placement is retained pending the separate owner decision.

Verification on final product source:

- Typecheck passed; all 905 Vitest tests passed across 88 files. Existing unrelated
  BiasChart key warnings remain.
- 61 focused Node contracts passed, including the parent-corrected import and
  loading contracts, scope/reveal projections, references, brand and token checks.
- Final native theme-asserting browser regeneration: 17 passed in 3.7 minutes.
  Each regenerated image checks the saved preference, resolved theme and actual
  color tokens; the manifest verifies no duplicate normal Dark/Light pairs.
- Brand document QA, cloud build and bundle-only privacy scan passed. The build
  retains its existing chunk-size warning. Hosted probes were not run.

The 43-state source reconciliation follows. A paired capture demonstrates that
native state with local fictional data; it is not pixel equality or live-account
acceptance. The forfeit scope pair is a wrong-week reader refusal; the distinct
account-changed branch remains uncaptured. Populated reactors and all three read-state pairs use the native controller.

| Approved scenario | Native composition/controller | Actual coverage |
|---|---|---|
| forfeit-ready | play/ForfeitDialog.jsx | PAIRED NATIVE CAPTURES |
| forfeit-close-warning | play/ForfeitDialog.jsx | PAIRED NATIVE CAPTURES |
| forfeit-loading | play/ForfeitDialog.jsx | PAIRED NATIVE CAPTURES |
| forfeit-unconfirmed | play/ForfeitDialog.jsx | PAIRED NATIVE CAPTURES |
| forfeit-busy | play/ForfeitDialog.jsx | PAIRED NATIVE CAPTURES |
| forfeit-expired | play/ForfeitDialog.jsx | PAIRED NATIVE CAPTURES |
| forfeit-done | play/ForfeitDialog.jsx | PAIRED NATIVE CAPTURES |
| forfeit-scope | play/ForfeitDialog.jsx | PAIRED NATIVE CAPTURES · Wrong-week reader fixture fails closed; distinct account-changed dialog branch has not been captured. |
| saved-pick | lines/YourPickSheet.jsx + lines/EveryoneGuesses.jsx | PAIRED NATIVE CAPTURES |
| saved-total | lines/YourPickSheet.jsx + lines/EveryoneGuesses.jsx | PAIRED NATIVE CAPTURES |
| saved-draft | lines/YourPickSheet.jsx + lines/EveryoneGuesses.jsx | PAIRED NATIVE CAPTURES |
| saved-pending | lines/YourPickSheet.jsx + lines/EveryoneGuesses.jsx | PAIRED NATIVE CAPTURES |
| saved-stale | lines/YourPickSheet.jsx + lines/EveryoneGuesses.jsx | PAIRED NATIVE CAPTURES |
| saved-scope | lines/YourPickSheet.jsx + lines/EveryoneGuesses.jsx | UNVERIFIED: no paired native capture |
| game-bets | bets/GameBetsSheet.jsx + bets/EveryoneBets.jsx | PAIRED NATIVE CAPTURES |
| game-bets-loading | bets/GameBetsSheet.jsx + bets/EveryoneBets.jsx | PAIRED NATIVE CAPTURES |
| game-bets-failed | bets/GameBetsSheet.jsx + bets/EveryoneBets.jsx | PAIRED NATIVE CAPTURES |
| game-bets-empty | bets/GameBetsSheet.jsx + bets/EveryoneBets.jsx | PAIRED NATIVE CAPTURES |
| feed-picks | feed/PicksSheet.jsx | PAIRED NATIVE CAPTURES |
| feed-hidden | feed/PicksSheet.jsx | PAIRED NATIVE CAPTURES |
| feed-picks-loading | feed/PicksSheet.jsx | PAIRED NATIVE CAPTURES |
| feed-picks-failed | feed/PicksSheet.jsx | PAIRED NATIVE CAPTURES |
| feed-picks-empty | feed/PicksSheet.jsx | PAIRED NATIVE CAPTURES |
| feed-share-uncertain | feed/PicksSheet.jsx | PAIRED NATIVE CAPTURES |
| reactors | feed/ReactorsSheet.jsx | PAIRED NATIVE CAPTURES · Populated and read-state pairs freshly captured with native preference/color assertions. |
| reactors-loading | feed/ReactorsSheet.jsx | PAIRED NATIVE CAPTURES |
| reactors-failed | feed/ReactorsSheet.jsx | PAIRED NATIVE CAPTURES |
| reactors-empty | feed/ReactorsSheet.jsx | PAIRED NATIVE CAPTURES |
| virtual | bets/PlaceBets.jsx | PAIRED NATIVE CAPTURES |
| virtual-minimum | bets/PlaceBets.jsx | HELD: API/SQL half-unit compatibility |
| virtual-slip | bets/PlaceBets.jsx | PAIRED NATIVE CAPTURES |
| virtual-locked | bets/PlaceBets.jsx | PAIRED NATIVE CAPTURES |
| virtual-no-offer | bets/PlaceBets.jsx | PAIRED NATIVE CAPTURES |
| virtual-busy | bets/PlaceBets.jsx | PAIRED NATIVE CAPTURES |
| virtual-uncertain | bets/PlaceBets.jsx | PAIRED NATIVE CAPTURES |
| menu | me/MenuSheet.jsx | UNVERIFIED: no paired native capture |
| menu-admin | me/MenuSheet.jsx | UNVERIFIED: no paired native capture |
| menu-no-reminders | me/MenuSheet.jsx | UNVERIFIED: no paired native capture |
| menu-busy | me/MenuSheet.jsx | UNVERIFIED: no paired native capture |
| navigation-nfl | shell/Frame.jsx + shell/Shell.jsx | HELD: owner frame-placement question |
| navigation-epl | shell/Frame.jsx + shell/Shell.jsx | HELD: owner frame-placement question |
| navigation-nfl-only | shell/Frame.jsx + shell/Shell.jsx | HELD: owner frame-placement question |
| navigation-layer-failed | shell/Frame.jsx + shell/Shell.jsx | HELD: owner frame-placement question |

The 106-reference total includes more than the 43 core pairs. Its five scrolled
pairs map to native long game bets and Virtual slip/busy/uncertain captures;
Virtual minimum remains held. Saved-pick, community and game-bets rules Info
have native pairs. The fourth Info is the mockup's fictional-example disclaimer,
which has no corresponding production content and is deliberately not copied.
The manual tracked 0.01U example belongs to the separate Bets area. Four Menu
variants, saved-scope and the distinct forfeit account-change branch still lack
new native pairs. Four shared-navigation examples remain held. Virtual 0.01U /
0.1U steps require the separately authorized API/SQL compatibility work; these
captures use the working half-unit contract. No 106/106, hosted write or physical
phone acceptance is claimed.
