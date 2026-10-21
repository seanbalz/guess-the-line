# Guess The Line — four-tab simplification

Owner: Sean Balsiger · Version 1 · October 21, 2026 (Pacific)

Status: Sean approved this design and implementation on October 21: “Yes, that
captures it. Go ahead and build the four-tab redesign using One thing first.”
Implementation and verification are tracked in the [build plan](../plans/2026-10-21-four-tab-simplification.md)
and [completion register](../../COMPLETION_REGISTER.md). Approval does not establish
merge, deployment or actual-iPhone acceptance.

## Decisions from the design review

Sean asked to simplify every tab using ten supplied visual references, with
compact cards or rows and details reached on tap. He selected:

1. **Consolidate navigation**, including combining and renaming destinations.
2. **Equal priority for guessing/competition and actual-bet research/tracking.**
3. **Home / Play / Bets / Research**, with League inside Play and Fantasy inside
   Research. Account and settings remain behind the profile control.
4. **One thing first**, the third of five interactive layout options. Sean's
   reply was "C" to the comparison; this specification maps C to that third
   option. The alternatives were Quiet cards, Grouped lists, One thing first,
   Glance tiles and Open sections, in that order.

The selected layout puts one useful task at the top of each destination and a
short list of secondary destinations below. Its content is driven by real app
state. It does not require every tab to show the same hero copy or a large number.

## Product scope

Apply the design to the existing mobile web application and Home Screen web
experience in `web/src/next/`. The goal is an iPhone-like interaction hierarchy,
touch layout and navigation. A separate native iOS binary remains a separate
deliverable in the [platform queue](../../../planning/PLATFORM_WORK_QUEUE.md).

Reorganize the existing capabilities, including their detail screens. Do not
stop at changing the tab bar while leaving long, dense landing screens behind
it. Keep every existing record and working destination accessible. Preserve
the existing app switch/recovery path until the separate Q20 transition passes
its preservation and release checks.

New Fantasy feeds, player comparisons, simulator features and unhosted readers
retain their existing backlog and dependency status. A mockup destination does
not establish that a feature is delivered or connected. Only real, supported
capabilities appear as working actions in the shipped UI.

## Navigation and destination map

Exactly four labeled bottom-navigation items appear, in this order. Icon and
label together identify the selected item; a color change is not sufficient.

| Main tab | Landing screen | Detail destinations |
| --- | --- | --- |
| Home | The next useful action and a short personal weekly overview | Your scores, actual tickets and the current league |
| Play | Continue the eligible Guess activity; compact rows for the other market, league and results | Spread/Total game entry, locked-in receipts, weekly scores, standings, league activity and historical results |
| Bets | Add a tracked bet; rows for active tickets, settled tickets, Recommended and Virtual Units | Existing ticket entry/review, ticket details/corrections, filters/history, recommendation review, virtual picks and supported challenges |
| Research | Open games and lines; compact rows for Fantasy and Trends | Lines board, game details, source/book comparison, weather, game notes, existing Fantasy rankings/profiles and available trends |

Retain the original G mark, the existing league switcher and profile control in
the compact header. Put the relevant week beside the screen title or inside its
summary, without adding another permanent toolbar. A league-dependent result
always identifies its league. Actual tracked tickets retain their account scope
and shared audience even while a private league is selected.

Profile opens the existing account, appearance, notifications and supported
administration/recovery destinations. Keep feature-specific history beside its
feature, with the existing general History access preserved where needed for
older records, exports and read-only journals.

Existing entry links must continue to reach their intended content:

| Existing entry | New home |
| --- | --- |
| `#home` | Home |
| `#play`, `#picks`, `#picks-spread`, `#picks-total` | Play, preserving the requested market |
| `#bets` | Bets, preserving supported tracked/recommended/virtual state |
| `#lines` | Research → Games & lines |
| `#fantasy` | Research → Fantasy |
| `#league` | Play → My league |
| `#feed` | Play → My league → Activity |
| `#groups` | Existing league switcher |

Authentication, invitation and recovery fragments remain untouched. Detail
addresses must survive reload with their intended market, week, account and
league scope; compatibility aliases must not silently fall back to Home.

## Screen behavior

### Home

Use the existing next-action logic and eligibility to present one clear primary
action. When eligible guesses remain, lead with their real progress and a
Continue action. When that task is complete or unavailable, use the appropriate
existing state rather than a permanently displayed "finish your guesses" card.

Below it, use compact rows for Your scores, My bets and My league. The score row
may summarize Spread and Total separately; tapping opens the complete score
view. The bets row shows an actual ticket count with a useful status. Do not
show full leaderboards, game lists, Fantasy rankings or recommendation lists on
Home. Relevant warnings and save failures remain visible beside their action.

### Play

Lead with one eligible Guess task. A short row opens the other market; My league
and Your results lead to focused pages. The primary action opens the actual
game-entry flow, retaining the user's selected week and unfinished draft.

Keep the existing team/Pick'em choice and half-point chip entry. The preview's
plus/minus controls were an illustrative interaction, not approval to replace
the existing pick controls. Each game's Spread and Total remain independent.
Review and final-lock feedback identify the specific game and market.

My league opens standings and friend activity, with the appropriate market and
period controls inside that destination. Scores, hidden contributions, tied
ranks, provisional/final labels and per-game receipts retain their current
meaning. Do not combine Spread and Total into one score or leaderboard.

### Bets

The selected concept uses a concise actual-ticket entry card followed by four
rows: Active tickets, Settled tickets, Recommended and Virtual Units. Ticket
lists and their result/market/week filters live on the reached page. An individual
ticket row opens the existing details, notes, corrections and result controls.

Reuse the recently released recommendation-to-tracked-ticket flow. A recommended
selection opens an explicit review with its exact original terms; only the
existing save action writes the record. The player confirms the actual bet was
placed elsewhere. Do not convert Virtual Units into actual tickets, infer
missing stake/placement time, or change monetary/unit semantics to match the
preview's illustrative dollar amounts.

Virtual Units keeps a separate destination, eligibility, league context and
record. Existing audience and player-reported-result explanations remain
available at the point where they affect entry, sharing or interpretation.

### Research

Lead with Explore games and two compact rows, Fantasy football and Trends.
Games & lines opens the existing game list. A game opens its detailed lines,
source/time information, weather, trends and private note. Show at most one
useful preview fact on a summary row; the remainder belongs in the detail.

Fantasy opens existing rankings and available player detail. Its scoring,
position and period controls appear there, rather than on Research's landing
screen. Keep the real source/update/coverage limitations visible. The preview's
comparison and deeper usage destinations do not authorize inventing data or
building later Q11–Q15 capabilities as part of this layout work.

## Interaction and visual contract

- Use a full page for a substantial list, score breakdown, league view, Fantasy
  screen or ticket history. Use a sheet for a short contextual choice or small
  detail, and the existing confirmation dialog for an irreversible lock-in.
- Opening a row has one obvious result. Avoid nested buttons, a second set of
  main tabs, permanently expanded filter panels and several competing primary
  buttons on the same screen.
- Back returns to the actual origin, including when a Home shortcut opens a
  feature in another tab. Restore list position, selected filters and relevant
  context. Preserve drafts and the existing unsaved-change protection.
- Retain each main tab's local state during a visit. Selecting its active tab
  returns to its landing screen; selecting it at the landing screen goes to the
  top. Browser Back/Forward, reload and notification entry must stay coherent.
- Use the [D-38 GTL tokens](../../BRAND_GUIDE.md), original G geometry, semantic
  colors, readable type, rounded opaque surfaces, quiet separators and restrained
  elevation. The selection approves the layout direction, not a new logo,
  palette, font family or final motion system.
- Keep Light/Dark/System behavior and the existing stored preference. Use at
  least 44px touch targets, 16px interactive text, one column at phone widths,
  and proper safe-area spacing for both top and bottom chrome. Bottom navigation
  and any save bar must leave the last content/control fully reachable.
- Keep the page scroll natural and avoid a second vertical scroller inside the
  main phone screen. Use short transform/opacity transitions from the existing
  tokens and honor reduced motion. Never make a gesture the only route back.
- Retain semantic headings, labeled controls, visible keyboard focus, focus
  return after dismissal, status announcements and contrast in both themes.

## Data and error boundaries

Keep `AppDataProvider` and the existing authenticated readers/writers as the
source of truth. Presentation components receive summaries derived from already
authorized data; moving a value into a compact card must not bypass a reveal
gate, change a query's scope or cause additional odds-provider collection.

All current per-game final-lock, submission-time reference, kickoff, late,
shared-standings and privacy rules continue to apply. Saved references and
latest quotes are distinct. No sample value, generic player, fake schedule or
mock sportsbook quote from the design preview belongs in the production bundle.

Loading, empty, offline, access-denied and failed states belong inside the
affected destination. Preserve available content and drafts; use one concise
message and a relevant retry or recovery action. Do not substitute zero for a
missing score, show stale data as current, or present a save as completed when
its response is uncertain. Retain existing idempotency/receipt recovery.

The shell route adapters, four landing screens and existing feature details are
separate responsibilities. Reuse the shared UI components instead of introducing
a parallel design system. Extend the shell's state/history deliberately where
the new detail hierarchy requires it; do not replace data engines to obtain a
different layout.

## Implementation order after written-design approval

1. Reconcile Q03's recorded mobile/navigation work and relevant unpublished
   changes without resetting or absorbing another session's checkout wholesale.
2. Establish the four-tab shell, destination adapters, route compatibility and
   back/draft preservation.
3. Simplify Home and Play using the existing rule and score adapters.
4. Simplify Bets around the released actual-ticket and recommendation workflows.
5. Add Research's landing view and route existing Lines/Fantasy/Trends details.
6. Verify complete feature reachability, mobile behavior, privacy and user
   acceptance before the normal reviewed release path.

Work remains sequential. This design informs Q03 and related Q04/Q17 presentation
work; it does not declare other queue items complete. A dedicated implementation
plan follows the written-design review. Database changes are not part of this
design; if implementation exposes an unhosted capability, retain its existing
dependency and release process.

## Acceptance and evidence

The completed app must meet these criteria:

- Exactly four main tabs, with League under Play and Fantasy under Research.
- Each landing screen has one clear first task and short secondary rows; all
  previously available features/records have a tested, understandable path.
- Old links, reload, Back/Forward, tab state and dirty drafts preserve intent.
- Read/save/receipt behavior, account/league boundaries, market reveal and
  official scoring remain correct through the new paths.
- Inspect 320px and typical 390px phone layouts in both themes, long content,
  large text, keyboard and reduced motion. Verify no horizontal overflow,
  obstructed final controls, clipping or insufficient touch targets.
- Run focused shell/route and affected feature tests, existing privacy checks,
  Brand QA and required CI. Perform actual-iPhone visual/interaction acceptance
  separately; desktop emulation is not evidence of that acceptance.
- Follow [repository synchronization](../../REPOSITORY_SYNC.md) and the
  [manual release workflow](../../SHARED_DEPLOYMENT.md). Source publication and
  design approval do not themselves establish a deployed UI.

The October 21 conversation preview `gtl-four-tab-preview.html` is local review
material, not an application implementation. Its SHA-256 at selection is
`962959803e1380d1ec8bcb2a24382bc9d31772dc2ab6e69710fa23c0e118b8fa`.
The five layouts' twenty top-level tab combinations rendered without horizontal
overflow or touch targets below 44px in the local browser check. The first
layout's four tabs also passed a 320px outer-viewport check; Fantasy/back,
guess-review feedback, the ticket result filter and dark appearance were checked.
The dark primary-button text was corrected and rechecked. No browser runtime
errors were reported in that check. These are preview checks, not application,
hosted-data or physical-phone acceptance.

The preview's sample form controls, amounts, scores, generic matchups, fictional
standings and unfinished secondary detail pages are illustrative. The accepted
information hierarchy must be implemented with real authorized data, existing
working controls and complete destinations under the criteria above.
