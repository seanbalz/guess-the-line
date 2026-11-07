# Selected Prism Glass design handoff

Owner: Sean Balsiger. Consolidated November 6; updated November 7, 2026.
**Approved global recipes; requested compact pill placement still pending.** This document is a
reference for implementation and review, not a production release record.

## Design authority and scope

The [selection record](selected-system-review.json) is the detailed recipe,
capture-hash and scoped-approval ledger. The [current gallery](selected-system-overview.html)
and [paired viewer](selected-system-review.html) are rendered evidence; old
comparison boards remain history. The [coverage record](NATIVE_COVERAGE_REVIEW.md)
maps native areas and preserves limitations. Sean accepts navigation unless an
issue is reported; new design sign-off requires visual mockups. Do not reopen
an explicit prior approval without a concrete issue or owner change.

The first visual project includes the selected whole-app materials/colors,
type/icon direction, useful graphical content, team/league marks and reviewed
native-state presentations. NBA is explicitly parked and stays hidden. New
avatars/profile-photo options and popup/award exploration remain held.

## Approved recipes

| Element | Dark | Light / Porcelain |
|---|---|---|
| Canvas | `#202126` | `#E9ECE8` |
| Background | `linear-gradient(150deg,#2A2D37 0%,#202126 50%,#17181D 100%)` | `linear-gradient(150deg,#FAFBF6,#E9ECE8 55%,#E0E7DE)` |
| Reading text / muted | `#F3E9D7` / `#C4B9A6` | `#243128` / `#536252` |
| Primary emphasis | Logo lime `#B8F34B` | Deep green `#3B6309` |
| G artwork | Original hybrid, `logo-hybrid/lime.svg` | Same geometry, `logo-hybrid/light-deep-green.svg` |
| Floating card face | `linear-gradient(135deg,#FFFFFF14,#FFFFFF06)` | `linear-gradient(135deg,#FFFFFFC7,#FFFFFF66)` |
| Card border | `#FFFFFF38` | `#FFFFFFD9` |
| Card shape/material | 28px radius, 18px blur, selected inset gloss and depth | Same shape/material, light-theme shadow recipe |
| Primary action | Transparent; full 3px lime outline; 20px radius | Transparent; full 3px deep-green outline; 20px radius |
| Typography | `-apple-system, BlinkMacSystemFont, Inter, "Segoe UI", sans-serif` | Same selected stack |
| Functional icons | Lucide geometry, 03 Glossy glass | Same, with theme-appropriate contrast |

Exact shadows, secondary actions and card-gloss values are in the selection
JSON; do not approximate them from screenshot pixels. Selected typography is
the Prism refinement override in `prism-refinement.css`, not the earlier
Outfit/Manrope base exploration or current production token families.

Selective lime belongs on action cards and key rank/accuracy figures. Keep
supporting cards neutral, with useful charts, marks and miniature content.
The compact Home action uses “Finish your picks”, a 60px progress ring and
18px padding. Each team logo has its own glass circle; paired marks never
share a background. Preserve image aspect and source artwork. League controls
use 52px circles, contain-fit 30x32px marks, 8px gap and a clear active outline.
Team-circle sizes follow context; only former portrait tiles are squared.
The GTL G is explicitly excluded from the circle rule. Existing initials are
not new avatar/photo functionality.

Use National Football League and Premier League in explanations and
descriptive accessible labels, with circular logos in navigation. FEPL is the
existing named league identity. Preserve route IDs, underlying option/team
codes, code/source literals and typed values. Official marks are identification
assets with provenance/notices, not GTL branding or a claimed reuse license.

## Settled interaction directions to preserve

- Unit quick choices start at 0.5U; Custom allows smaller positive values,
  including 0.01U. Unit +/− taps change 0.1U. Preview limits/precision and actual
  server compatibility are separate; do not silently widen production rules.
- Sportsbook choice labels are a manual source catalog, not evidence of
  connected feeds. Do not invent quotes, observed times or sportsbook identity.
- The general app invitation uses a shareable link. A displayed link or Share
  button does not authorize sending messages to other people.
- Preserve native drafts/locks/reveal/privacy/permission boundaries, source
  provenance, unavailable/error/loading states and stored records. Visual
  approval does not establish real-account/source/device acceptance.
- Charts and histories retain meaningful missing/stale states and source
  labels. Fictional rule-math examples and historical public references are
  not live bookmaker quotes or valid submission-time scoring benchmarks.

## Remaining visual closeout

[Full-pill team-reference revision](TEAM_VALUE_PILL_REVIEW.md): Sean requested
a complete pill containing the circled logo/value, with smaller team name
and location. This supersedes the earlier unchosen A/B treatment. Two label
placements are shown: 01 below the capsule and 02 inside it. Owner answer is
pending. Denver is illustrated as a city/region word from the existing team
name; the question includes that interpretation. No broader venue/location
catalog or geolocation integration is created.

After placement confirmation, update the identified History/Bets/shared-sheet
presentation labels using typed team/game context. Preserve original values,
hidden/fallback semantics, code/source literals and stored IDs. Supply targeted
mockups and finalize the handoff's visual status. Avoid broad token replacement:
MIN can mean minutes, NEW is a status word and NO can be a notice. The final
inventory's Home/game circle correction remains valid. Do not revisit settled
palettes, fonts, materials, the G exclusion or circle selection for this task.

## Production boundary and implementation handoff

Current selected styling lives in review assets/adapters. Native components are
isolated into previews with fictional or source-labelled public fixtures and
disabled controllers. **Do not ship the iframe viewer, fixture payloads,
storybook state guards or DOM adapters as the production application.**

Native `web/src/next/styles/tokens.css` still uses Big Shoulders Display,
Barlow Condensed and Figtree. The selected recipes have not been integrated
into the production token/component system. An implementation task must start
from freshly fetched `origin/main` in an owned task worktree, reconcile current
native source, update `design/tokens-next.json` and native tokens together,
and move recipes into reusable native components. The existing token parity
test remains mandatory. Legacy `design/tokens.json` is not silently rewritten
by this mockup work.

Map real data/controllers to native views; preserve rules, saved inputs,
private reveal gates, source freshness and free-only provider limits. Check
unit-entry server compatibility rather than treating preview callbacks as
real saves. Verify responsive rendering, keyboard/focus/touch, image fallback,
reduced motion, typography and both themes using the approved captures. Run
the change-appropriate native tests and required Brand/source checks. Merge,
deployment and migration applies use their separate release evidence/gates;
this visual handoff grants none of those outcomes.

The current completion register records dated state. The frozen v62 tracker,
unpublished Mini worktrees and three parked Signal files remain preserved.
