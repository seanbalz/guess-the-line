# GUESS THE LINE — BRAND & DESIGN SYSTEM v1.0

## NBA marks: official league and team logos — November 11, 2026 (D-85)

Sean: "Approve badges", immediately corrected by "we need nba logo and team logos not
letters". NBA screens show the official NBA league logo and the official logo of each of
the 30 teams, each in its own glass circle like every NFL and Premier League mark; the
G keeps no circle. The proposal's letters-only badges and "NBA" text badge are
superseded; letters hold a circle only while its logo loads or if it fails. Look NBA
teams up by NBA code only (`resolveNbaTeamLogo`, `NbaTeamBadge`): 13 codes are also NFL
codes. Below 360 px wide, three league circles are 44 px. NBA stays off the production
sport switch (`NBA_ON_SWITCH = false`) until Sean says otherwise. Marks identify the
league and teams only, under the NBA trademark notice; sources, hashes and rights are in
[the logo register](TEAM_LOGO_SOURCES.md#nba-team-logos). This is not deployment or
physical-phone acceptance.

## Approved shared Prism foundation — November 7, 2026

Sean authorized the remaining selected visual updates after reviewing the November
4–7 Prism Glass mockups. The selected-system review at commit
`3ac2eb50513ba73447ef890e4a47863cde7bdd76` is the recipe authority;
PR #491 is source material only. Shared native tokens now carry the selected
charcoal gradient / Porcelain canvas, ivory / deep-green ink, system typography,
28px floating glass cards and transparent primary actions with a full 3px green
outline. Lucide geometry stays; shell icons use the selected glossy glass material.
Muted and semantic colors keep their meanings and tested contrast.

Each team and league mark has its own circle with contain-fit artwork and the
existing decode/error fallback. The selected hybrid G has no circle. Sport control
accessible names use National Football League and Premier League; the existing
access, route values, dirty-draft guards and hidden NBA remain. The shared shell
retains its separate league switcher in native contexts, including the actual NFL
Research landing and held FEPL Research destination. Confirmed compact contexts
retain existing league access through Play's League and named access covers. Asset provenance
is recorded in `web/src/next/ui/brand-assets/sources.json`.

This foundation does not establish completion of the remaining per-screen layouts,
actual-phone acceptance, merge or deployment. Home files and additive `home-*`
tokens remain separately scoped as described below.

## Shared Home bottom navigation — November 8, 2026

The authenticated app now shares Home's selected floating bottom navigation in
all contexts, including native headers, custom screens and access covers. It uses
the same 72px minimum height, 16px side insets, 12px bottom gap above the safe area,
glass material, icons, typography and selected treatment. Tab labels retain Home's
14px size (13px below 359px). Enlarged labels may wrap
and grow the bar; measured clearance keeps docks, toasts and keyboard focus above
it. Active tabs and genuine badges/availability still reflect the destination.
The compact/native context map below continues to govern top headers and bodies;
it no longer selects a different bottom bar. Standalone authentication and
fullscreen layers retain their existing semantics. This is local implementation
evidence only, not real-phone acceptance, merge or deployment.

## Confirmed overview framing closeout — November 7, 2026

The separately approved whole-view Play/Bets overview captures at `6bfcfdbe`
and later `league-wording-play/bets` captures at `5fe706bc` use Home's compact
header and floating dock; the approved open/settled receipt views use that same
frame. Entry selection/terms remain fullscreen dialogs. This port implements existing
approval; it does not choose a global frame or answer the older cross-context
question. [Scoped authority and local evidence](PRISM_OVERVIEW_FRAME_CLOSEOUT_2026_11_07.md)
record the boundaries. League access remains in the Research header and Play's
League layer. No Menu switcher is added.

## Expanded confirmed context framing — November 7, 2026

The [expanded context record](PRISM_EXPANDED_FRAME_CONTEXTS_2026_11_07.md)
maps additional supplied whole-screen approvals to their existing production
router, screen, page and named cover identities. Play's opened editable drafts,
Points week/draft/profile, Score and League board/feed; named NFL Research
sections; Bets performance/gap/Virtual; actual NFL History; EPL Home/Play; and
pending/removed covers share the eagerly loaded compact frame. Home body rules
remain Home-only. Unshown draft/Points locked, busy, error and pending variants
retain their existing frame; no unseen receipt approval is inferred.

FEPL Research remains native with its frame choice held because its two approved
directions overlap on the same actual destination. NFL Research's distinct root,
EPL Bets and unavailable EPL History retain native navigation. Body-only layers
inherit their opener. This is a context mapping, not a global frame selection.

## Approved Home release — November 7, 2026

Sean approved the two `league-wording-home` phone mockups at review commit
`3ac2eb50513ba73447ef890e4a47863cde7bdd76` and said **“Good deploy”**.
This approval covers the National Football League Home landing only. It replaces
Home's previous countdown and six-tile composition with the compact progress
ring, separate season stats, graphical League/Research shortcuts, two upcoming
game rows and Community activity card. Sean separately selected a Spread / Total
selector for season rank and accuracy points; these markets must never be summed.

Home uses the selected glossy-edge/frosted-center G (lime in Dark, deep green in
Light), charcoal gradient / pale green canvas, ivory / dark-green text, floating
glass cards and transparent primary button with the full green outline. The
canonical `home-*` colors/effects and native Home font are additive entries in
`design/tokens-next.json`. The approved compact context frame shares
these recipes under `.gx-overview-frame`; Home body rules stay under
`.gx-home-design`. The expanded record above names the additional compact contexts
and exact native/held boundaries; unknown/custom destinations stay native. Each team
and league mark has its own circle; the G has no circle. The sport switch keeps
its existing access rules. Browser chrome follows the approved compact frame while it is mounted and
restores the existing theme when leaving it.

Use live shared reads for player figures. Home's mini Research chart is explicitly
historical scoring (2026 weeks 1–6), derived from the fingerprinted public
nflverse subset, with no forecast or invented bookmaker quote. Asset sources and
hashes are in `web/src/next/home/assets/sources.json`. League marks identify the
sport and are third-party trademarks; no license, affiliation or endorsement is
claimed. The [Home release plan](APPROVED_HOME_RELEASE_2026_11_07.md) records the
exact approval and verification scope. The broader foundation PR #491 is excluded.

> **Design-exploration history (merged from PR #488).** The November 4–7 sections below record the Prism Glass exploration and selection. Where they say an approval or production port is pending, the approved shared Prism foundation above and [the November 8 Prism rollout release](RELEASE_2026_11_08_PRISM_ROLLOUT.md) supersede them. Design assets under `design/` are review material, not production code.

## Pick-focused scorecard and deployment roadmap — November 7, 2026

Sean rejected both previous full-pill placements as too empty and explicitly
selected “Pick-focused scorecard (recommended)”. The old placement question is
superseded. [One fuller composition in both themes](../design/style-directions-2026-11-04/PICK_SCORECARD_REVIEW.md)
adds opponent, team/market, saved guess, comparison, difference, points ring,
status and a shared-scale chart. Visual approval is pending; earlier global
palette/material/type/circle/G-exclusion/wording approvals stay closed.

Existing fictional History values were asserted against the fixture: −3.5,
comparison −4, difference 0.5, locked status, 9/10 example points. No actual
saved record, bookmaker quote, time or verified schedule is claimed. Eight
theme layouts at four widths, sixteen image decodes, chart/ring math and no
overflow/clipped labels passed; both captures inspected. Zero observed page
errors, failed resources, external browser requests or non-GET requests.

The [five-workstream deployment roadmap](../design/style-directions-2026-11-04/DESIGN_DEPLOYMENT_ROADMAP.md)
separates production implementation, actual data/interaction integration,
regression/CI, release-candidate phone acceptance and approved hosted release.
Production styling is not yet integrated. Main CI was green at the checked
SHA; the prior draft head had five EPL timing/order failures across two test
shards, with root cause unestablished. Exact integrated source must pass.
No production/controller/data change, merge, deployment or migration here.
NBA, new avatars/photos/awards and unpublished Signal files remain held.


## Full-pill team-label revision prepared — November 7, 2026

Sean requested a full pill with the name smaller underneath and the team's
location. This supersedes the earlier unchosen A/B compact-label comparison;
no A/B approval is recorded. [Two placements in both themes](../design/style-directions-2026-11-04/TEAM_VALUE_PILL_REVIEW.md) show the
requested capsule with its existing circled logo/value and smaller Broncos /
Denver lines: 01 below the pill, 02 inside. The active one-question clarification
asks which placement he means, including city/region as the illustrated
location interpretation. Neither placement is selected or applied to existing
History/Bets/shared-sheet labels while that answer is pending.

Selected theme/material/type/G-exclusion/circle decisions are retained. The
example's −3.5 and comparison −4 reuse existing fictional History math values;
no saved record, bookmaker quote, source time, live venue or broader location
catalog is supplied. Name 13px, location 12px, value 30px, logo circle 38px.
Eight theme layouts / sixteen placement layouts and sixteen image decodes
passed at four widths; both captures inspected. No page errors, external
browser requests or non-GET requests observed. Static proposal only: no native
production/bundle/controller, data/permission, merge/deploy/migration change.

The design handoff points to this revised pending choice. Earlier approvals
remain closed; NBA, new avatars/photos/awards and parked Signal files stay held.
No first-project completion claim while the label arrangement is unresolved.

## Wording approved; final identity inventory and handoff prepared — November 6, 2026

Sean answered “Good” to the twenty full-name wording captures in both themes
at `5fe706bc7f1ecea2d51ab2b5f40d486f7d050718`. This closes that copy/layout
review; previous circle, G-exclusion and native-state approvals remain scoped
and closed. No palette/material/type choice is reopened.

The final 268-route, 536-theme readback decoded 1,492 team images. It found
one legacy Home/game view with two bare marks; the existing circle adapter now
wraps only such unwrapped prototype matchup images, with separate 64px glass
circles. Native React marks and the G are untouched. The repair passed eight
layouts and two Back/reopen flows; the repeated all-route inventory has zero
unwrapped matching team images, page errors, provider/auth reads, non-GET
requests, resource failures or OS dialogs.

Remaining team codes occur in compact History/Bets/shared-sheet labels:
33 distinct text variants, 45 text/style combinations and nine codes repeated
across states/themes, rather than hundreds of separate gaps. [Two visual
format options and the Home repair](../design/style-directions-2026-11-04/TEAM_IDENTITY_CLOSEOUT_REVIEW.md) are supplied in both themes. A is
recommended: circled logo beside a compact number, full names in explanations.
B uses full names in both. Neither is applied to existing record labels while
the owner question is pending. MIN timer text, NEW proposal labels and NO
notices are unrelated and preserved. Comparison passed eight layouts; all four
captures inspected.

The consolidated [selected-design handoff](../design/style-directions-2026-11-04/SELECTED_DESIGN_HANDOFF.md) records approved recipes,
that single format question and the actual production gap. This is review
work only; no native production/bundle entry, data/scoring/provider, merge,
deploy or migration change. NBA and new avatar/photo/award work remain held;
parked Signal files remain untouched/unpublished. No first-project completion
claim while compact identity formatting is unresolved.

## Circle set approved; full league names applied — November 6, 2026

Sean's “Good.. continue” approves the twenty team/league circle captures at
`d109e5386b49093f66b173492261bbb5e126739a`. He then explicitly selected
“Full names in explanations; logos in navigation (recommended)”. The prior
wording question is resolved. Use National Football League and Premier League
in explanatory copy and descriptive labels; retain the selected circular marks
in navigation. FEPL remains the existing named league identity; G exclusion
and all prior scoped circle/screen approvals remain.

[Twenty updated copy/layout captures](../design/style-directions-2026-11-04/LEAGUE_WORDING_REVIEW.md) show six overviews, both native
sport frames, History's expanded action and explanatory Info in both themes.
Current copy/layout review is pending. A display-only adapter expands text
and descriptive attributes while preserving original controls, route/option
values, native callbacks, user-entered fields and code/source literals. Native
production source and bundle inputs are unchanged; no rebuild required.

144 responsive layouts/wording checks across 18 views, twelve action/input
checks and two Info checks passed. All 268 registered views were also swept
through review controls in both themes at 390px: 536 readbacks, no residual
NFL/EPL display text outside documented exclusions or horizontal phone
overflow. All twenty captures inspected. No observed page errors, provider/
auth reads, non-GET requests, resource failures, console errors, storage writes
or OS dialogs. This is automated rendering/wording evidence, not fresh owner
acceptance of every state or actual production behavior.

The History unavailable notice is the same existing state with fuller names,
not missing-data inference or a new restriction. Six-screen gallery refreshed.
No merge, deployment, migration or whole-project completion claim. NBA stays
parked; new avatars/photos/awards and parked Signal files remain held.

## Individual circles for all team/league mockup marks — November 6, 2026

Sean accepted the sixteen league-circle placements at
`935f457b9219b51376f3be4405f2109759bdd895` (“Looks good. All logos should have
circles”), then explicitly chose “Team and league logos only (recommended)”.
The original GTL G is excluded. Each existing team-logo container now uses a
circle, retaining separate glass backgrounds, artwork aspect, names and
actions. Home/compact-list portrait tiles are made square; nested operational
marks retain one outer background. No artwork asset is changed.

[Twenty updated phone captures](../design/style-directions-2026-11-04/TEAM_LEAGUE_CIRCLES_REVIEW.md) show six overviews plus team list,
Spread draft, tracked ticket and FEPL Fantasy in both themes. The six-screen
gallery is refreshed. 200 responsive layouts across 25 representative views,
1,584 circle measurements and 1,712 image decodes passed shape checks. All
twenty captures inspected. No G wrapped, unwrapped audited team image,
horizontal phone overflow, page error, provider/auth read, non-GET request,
storage write or OS dialog observed. A transient local CSS connection failure
in the initial rapid audit prompted explicit settled-resource verification
before publication; final result is retained in selection metadata.

This is a shared mockup adapter, not native production code or a bundle-input
change. Prior approvals remain scoped, and current whole-view review does not
automatically cover every nested state. The earlier explanatory-text naming
question remains unanswered; circle scope does not decide wording. NBA is
parked; new avatars/photos/awards and parked Signal assets remain held. No
merge, deploy, migration or whole-project completion claim.

## 02 Glass circles selected and applied to mockups — November 6, 2026

Sean selected “02” from the league-logo comparison at
`a234f2f4bcddd8ec46218169f0110ff7dc395c0a`. The selected sport-switcher treatment
is now applied throughout the paired viewer, including its isolated native
NFL/EPL frames. Each original button and action/state remains; official marks
use separate 52px circular glass tiles with an active lime/deep-green outline.
Accessible full league names and hidden NBA/current NFL-only options remain.

[Sixteen current placement captures](../design/style-directions-2026-11-04/LEAGUE_CIRCLES_SELECTED_REVIEW.md) show the six overview screens and
both native sport frames in both themes. The primary gallery is refreshed to
these current captures; earlier choice boards remain historical evidence.
80 layouts at four widths, 52 action checks and 152 league-mark decodes passed.
All sixteen captures inspected; Account's fixture footer is visible in an
extended-height capture. No observed page errors, provider/auth reads, non-GET
requests, storage writes or OS dialogs. Standalone adapter only; native
production sources and bundle inputs are unchanged.

One owner question remains: should explanatory references such as “View NFL
history” use full league names or logos too? Full names are recommended for
readability. Existing explanatory wording is unchanged pending the answer;
the ten-view audit is not a claim that all nested team/chart/source labels are
converted. Prior approvals remain scoped. NBA is parked; new avatars/photos,
popup/award exploration and parked Signal files remain held. No merge,
deployment or migration; the first project is not declared complete.

## Overview/ticket set approved; league-logo choices prepared — November 6, 2026

Sean answered “Approved continue” to the fourteen current overview/ticket/entry
captures in both themes at `6bfcfdbe787bdc2d44019aa3e3c85530cf009ebd`. This
closes the older Home/Play/Bets whole-view re-review flags and accepts the
supplied open/settled ticket and selection/terms views. Earlier scoped NFL/EPL
approvals remain valid; no actual production save/device acceptance is inferred.

The next active requirement is league-logo replacement, brought into this
project by Sean on November 4. [Five switcher tile treatments](../design/style-directions-2026-11-04/LEAGUE_LOGO_SWITCHER_REVIEW.md) now show
the official NFL shield and theme-appropriate Premier League lion, with each
logo on its own glass tile and accessible full names. Recommendation: 01,
rounded glass squares with a lime active outline. Six captures include both
theme comparison boards and 01 with each league active in fictional context.
Choice is pending; no approved viewer or production header was replaced.

32 responsive layouts, 48 pointer/keyboard selection checks and 56 image
decodes passed; all six final captures inspected. No observed page errors,
external browser requests, non-GET requests, storage writes or OS dialogs.
The new source register preserves official-site asset URLs, hashes and
identification-only scope; no licensing or affiliation is claimed. Original
colors/proportions and selected GTL recipes are retained.

After selection, carry that placement into the viewer and reconcile remaining
sport/team abbreviation placements before claiming full replacement. NBA stays
parked; new avatars/photos and popup/award exploration remain held. No native
production code, scoring, provider, migration, merge or deploy change. Parked
Signal files are untouched and unpublished.

## Play matchup logo-tile treatment approved — November 5, 2026

Sean confirmed "Looks good" for the reviewed Play Spread and Total cards in
both themes. The individual logo-tile treatment is approved for those reviewed
placements. [Selection record](../design/style-directions-2026-11-04/selected-system-review.json)
and [reviewed capture](../design/style-directions-2026-11-04/previews/play-separate-logo-tiles.png)
preserve the scope. This approval does not cover every Play detail state or
establish whole-app completion. No UI or production code changes accompany this
record. Bets is the recommended next review area, awaiting Sean's direction.
The parked Signal files remain untouched and unpublished.


## Play team marks — November 5, 2026

The Play mockup carries the reviewed Home/Research treatment into Spread and
Total matchup cards: each logo has a separate 42px glass tile, its own border
and shadow, and a 34px mark. Names and the at separator remain outside the tiles.
Use selected light/dark surface variables. This is authorized visual exploration;
Play approval remains pending.


## Research logo-tile treatment approved — November 5, 2026

Sean answered yes to the reviewed Research matchup and Games/Teams previews.
The individual glass-tile treatment is approved for those reviewed placements
in both themes. [Selection record](../design/style-directions-2026-11-04/selected-system-review.json)
and [reviewed capture](../design/style-directions-2026-11-04/previews/research-separate-logo-tiles.png)
preserve the scope. This does not establish approval of every Research detail
view or whole-app completion. No UI code or production changes accompany this
approval record. Play is the recommended next review area; its changes await
Sean's direction. Parked Signal files remain untouched and unpublished.


## Research team marks — November 5, 2026

Carry the separate-logo glass-tile treatment from Home into Research. Each logo
has its own border, translucent background and shadow; keep the team name and
at separator outside each tile. Use 64px main matchup tiles and 42px quick-card
tiles in the current mockups, with selected theme variables for light and dark.
This is authorized preview work; whole-screen visual review remains pending.


## Separate backgrounds for each Home team logo — November 5, 2026

Sean corrected the paired Home treatment: each logo needs its own background.
The [Home mockup](../design/style-directions-2026-11-04/selected-system-review.html?screen=Home)
now puts each team mark in its own 34x38px glass tile, with the @ outside both
and a fully transparent shared layout container. Each tile has its own border
and shadow in dark and light mode. Names, sample status, selected compact card
and native actions remain intact. [Updated paired capture](../design/style-directions-2026-11-04/previews/home-separate-logo-tiles.png)
was inspected. Chromium verified eight individual tile backgrounds across both
themes, no shared background/shadow, layouts at 320/390/768/1440px, loaded marks
and four game opens. JavaScript syntax and Brand document QA passed. Whole-screen
review remains pending; production and parked Signal files are unchanged.


## Compact Home action card selected — November 5, 2026

Sean selected the compact version from the Home comparison. The
[selected whole-app viewer](../design/style-directions-2026-11-04/selected-system-review.html?screen=Home)
now uses the shorter "Finish your picks" headline, 60px progress ring and 18px
action-card padding in dark and light Home. Existing colors, materials, G,
button styling, data and native navigation are retained. The
[comparison](../design/style-directions-2026-11-04/home-compact-review.html)
preserves the previous layout beside the selected version. This accepts the
action-card layout only; fresh review of the rest of Home remains pending.
The stopped Signal exploration is untouched and unpublished.


## Selected icon finish: 03 Glossy glass — November 4, 2026

Sean accepted the assistant recommendation ("go with your rec"): use **03 Glossy
glass** for icons across the current dark/light mockups. The clear face, glossy
edge and restrained shadow fit the floating glass cards and hybrid G. Keep
functional glyphs readable and inactive navigation neutral so lime emphasis
stays selective. Geometry remains Lucide; notices and team-mark provenance are
retained. [Five-way visual reference](../design/style-directions-2026-11-04/icon-treatment-options.html)
and [paired screen review](../design/style-directions-2026-11-04/selected-system-review.html)
record the choice. Alternatives remain available for comparison. This selects
the icon finish; reopened screens still need fresh review. Production integration,
league-wide mark replacement, avatars and popup/award work retain their existing status.


## Selected light background: 02 Porcelain glass — November 4, 2026

Sean selected **02 / Porcelain glass** after the [three-way Research comparison](../design/style-directions-2026-11-04/light-research-comparison.html).
Use background `#E9ECE8` with `linear-gradient(150deg,#FAFBF6,#E9ECE8 55%,#E0E7DE)`
for the light background direction. [Selection metadata](../design/style-directions-2026-11-04/light-mode-options.json)
records the exact choice. The shared light-preview foreground, floating glass,
selective lime and deep-green hybrid-logo adaptation remain available for the
next cross-screen review; this background choice does not establish whole-app
completion or a release. Dark selections and shipped code/tokens/assets are unchanged.

## Selected selective lime emphasis — November 4, 2026

Sean approved the [Home/Play lime-priority preview](../design/style-directions-2026-11-04/lime-priority-preview.html).
Use the logo's exact lime `#B8F34B` to emphasize action cards and key stats such
as rank and accuracy. Action cards have a light lime face/edge; key stat tiles
have a restrained lime tint with lime figures. Supporting cards remain neutral
floating clear glass. Retain the selected charcoal gradient, ivory reading text,
original G geometry/hybrid finish, and transparent primary with a full 3px lime
outline. [Exact reviewed recipes and scope](../design/style-directions-2026-11-04/lime-priority-preview.json)
supersede the earlier raw selective-color study and pending-refinement status.
This selects the reviewed dark visual treatment; remaining screen/light-mode
review, whole-project completion and production integration are separate.
Shipped tokens, assets and code are unchanged.

## Selected card finish: 05 Floating clear glass — November 4, 2026

Sean selected **05 / Floating clear glass** from the [five-finish board](../design/style-directions-2026-11-04/glass-card-options.html).
Retain his selected charcoal gradient, warm ivory text and lime hybrid G.
The finish uses `linear-gradient(135deg,#FFFFFF14,#FFFFFF06)`, border `#FFFFFF38`,
18px backdrop blur, 28px card corners, gloss opacity `.65`, and the specified
inset/depth shadow. [Exact recipe and selection](../design/style-directions-2026-11-04/glass-card-options.json)
include the navigation glass shown in option 05. This resolves the card-finish
choice and supersedes the earlier open-card status. Remaining control/light-mode
decisions, whole-project completion and production integration are separate;
shipped tokens/assets/code remain unchanged.

## Selected charcoal-gradient / warm-ivory dark direction — November 4, 2026

Sean confirmed the **middle combined preview** in the [three-way comparison](../design/style-directions-2026-11-04/charcoal-ivory-combination.html):
02's subtle charcoal gradient with 04's warm ivory text. Selected settings are
base `#202126`, `linear-gradient(150deg,#2A2D37 0%,#202126 50%,#17181D 100%)`,
main text `#F3E9D7`, and secondary text `#C4B9A6`. Retain the previously selected
lime `#B8F34B` glossy-edge/frosted-center G. [Exact selection](../design/style-directions-2026-11-04/charcoal-ivory-combination.json)
is the source for this direction. This supersedes earlier open dark-depth/text
statuses. Card/control decisions, light mode, whole-project completion and
production integration remain separate; shipped tokens and assets are unchanged.

## Selected dark background base — November 4, 2026

Sean selected **01 / Obsidian charcoal, `#202126`**, from the [background board](../design/style-directions-2026-11-04/app-background-options.html)
for dark mode. This selects the base color only. The subsequent [ten-study
comparison](../design/style-directions-2026-11-04/charcoal-depth-options.html)
explores solid/gradient/glow treatments and text colors with the selected lime
hybrid logo; none of those treatments or text pairs is selected. Light-mode,
card/control palette and production integration remain separate decisions.
Existing production tokens/assets/code are unchanged.

## Selected glossy/frosted logo direction — November 4, 2026

Sean selected **01 / Current lime** from the [hybrid comparison](../design/style-directions-2026-11-04/logo-hybrid.html),
clarifying that "original" meant that option rather than the flat app logo.
The [selected vector](../design/style-directions-2026-11-04/logo-hybrid/lime.svg)
keeps exact Balanced Yardline G geometry and base lime `#B8F34B`, adding glossy
edges and a frosted center. The [manifest](../design/style-directions-2026-11-04/logo-hybrid/manifest.json)
records the selection. This is the selected finish/color direction; production
integration, light-surface treatment and small-icon adaptation remain pending.
It does not select a replacement app palette or change existing shipped assets.

Status: canonical for all product UI, documents, dashboards, presentations, notifications, iOS, and agent-generated assets. Updated 2026-10-08.
The new app (D-38, `web/src/next/`) follows the [D-38 section](#d-38-redesign-system-the-new-app--october-14-2026) at the end of this guide. Since D-65 (October 28, 2026) it is the only app; the old app is no longer built or served. Everything above is the old app's legacy styling, which only the sign-in screen (until build plan stage 76) and the local engineering dashboard still use.

## Balanced logo refinement — October 29, 2026

Sean selected **01 Balanced** from the [five-option comparison board](../design/logo-redraft-2026-10-29/concepts.png).
The [selected vector preview](../design/logo-redraft-2026-10-29/selected-preview.png)
shows the implementation: equal outer corner cuts, consistent body weight and
mirrored yard-line lengths/spacing. The letter G remains intentionally open on
its right; balanced proportions do not mean literal mirror symmetry.

This supersedes the original-path geometry requirement below. Both app logo
components use `0 8 64 48`; the browser favicon omits the fine yard lines and
frames the G at `8 8 48 48` for small-size clarity. D-44 transparency, accessible
name, lime/deep-green theme colors and 12% home-screen margins remain in effect.
The 180/192/512 PNG icons use the updated full mark, including notification uses.

Five dark-surface color exports (lime, cyan, emerald, amber, white) and a deep-green
light-surface export use existing `tokens-next.json` colors. They are alternate
brand assets, not new semantic UI colors or a change to the selected app palette.
The app continues to use its existing theme green. The image-generated concept
board is visual exploration; the SVG exports and component paths are the exact
implementation. See the [asset record](../design/logo-redraft-2026-10-29/README.md).

## Brand position
Competitive NFL spread prediction meets fantasy-sports game day. Tone: precise, fast, confident, playful competition; NOT a real-money sportsbook. Inspiration: DraftKings (dense live stats), FanDuel (clear market rows), Sleeper (social competition), ESPN/CBS (scoreboard hierarchy). Borrow interaction patterns only; do not copy their logos, trade dress, artwork or proprietary iconography.

## Selected identity — October 8, 2026
Sean selected **Primary logo 01: Yardline G** and **App icon 01: Field monogram** from the visual Identity board. Apply the exact original study geometry through `web/src/Brand.jsx` and the Field monogram favicon/app icon. The site title and visible wordmark are **Guess The Line**, with no GTL prefix in the browser title. This approval covers these two identity choices only; type, palette, icon language and broader motion remain provisional.

**Later same-day display refinement:** Sean supplied the Field monogram screenshot
and requested the icon alone, without adjacent site-name text. Product brand
placements now use the dark Yardline G inside the rounded lime Field monogram
tile, including its soft shadow. Keep the accessible name and browser title
**Guess The Line**. This overrides the visible-wordmark instruction above;
the underlying selected original geometry and other provisional categories stay
unchanged.

**October 14, 2026 (D-44): the G alone, on a transparent background.** Sean asked
for "the G with a more subtle backgroud like transparent and green logo". The
mark is now the Yardline G by itself, with no tile, rounded rectangle or shadow
behind it, in the theme green: lime `#B8F34B` on dark surfaces and deep green
`#3B6309` on light ones (`primaryForeground`; `accent-ink` in the new app), so the
G keeps at least 3:1 against what it sits on (lime on white is only 1.32:1). The
G's two paths stay exactly as selected; the svg is framed by the G's own bounds
(`22 20 81 53`), so the G fills the box the tile used to fill and every box keeps
its size. The favicon is deep green and turns lime in a dark browser tab
(`prefers-color-scheme` inside the file). The PNG icons (home screen, manifest,
notification icon and badge) are the lime G on a transparent background with a
12% margin, everywhere, including Android's launcher and push notifications
(Sean, October 14: "Transparent everywhere"; low contrast on a white launcher
circle or a light notification card is accepted). This overrides the tile and
shadow above. Google's consent screen shows no logo.

## Identity background
Working wordmark: **GUESS THE LINE**. Short label: **GTL**. Tagline: **Call the number. Own the board.** Brand mark direction: custom stylized G/L monogram integrated with a yard-line / ascending line chart. Use only original vector assets. Team logos may be shown when properly licensed/authorized; otherwise use team abbreviations in custom shields. Do not substitute league or sportsbook marks as our brand.

## Palette (dark-first)
- Canvas / Midnight: #0B1020
- Surface / Slate: #151D30
- Elevated card: #202B43
- Hairline border: #34425C
- Primary text: #F8FAFC
- Secondary text: #AAB8CF
- Primary action / Electric Lime: #B8F34B
- Primary action text: #101B0A
- Data accent / Cyan: #38BDF8
- Win / Emerald: #34D399
- Loss / Coral: #FB7185
- Pending / Amber: #FBBF24
- Neutral tie: #94A3B8
Use semantic meaning, not color alone. Meet WCAG AA contrast for text and controls.

## Type
UI and body: **Inter** (fallback system-ui, -apple-system, Segoe UI, sans-serif). Display/score numerals: **Barlow Condensed** bold (fallback Impact, Arial Narrow, sans-serif). Monospace for odds/line columns: **IBM Plex Mono** (fallback ui-monospace, SFMono-Regular, monospace). Do not distribute font files; load from licensed providers or use fallbacks.
Scale: hero 40/44; page title 28/34; section 20/28; body 16/24; metadata 13/18; stat numeral 36/40. Minimum interactive font 16px mobile.

## Grid and components
8px spacing system (4,8,12,16,24,32,48); 12px card radius, 8px control radius; 44px minimum touch targets; max content width 1200px; responsive one-column below 640px.
Navigation: Home / Guess the Line / Betting Challenge / League / History / Settings.
Top scoreboard: projected points, delta from previous verified snapshot, locked/provisional state, source + timestamp.
Matchup card: away/home shields, kickoff time PT, your signed spread, current consensus if permitted, model projection if sourced, points, delta arrow. Never use red/green alone.
Leaderboard: accuracy points and closest-pick W-L-T in separate columns. Betting Challenge W-L-P belongs in separate tab.
Charts: cyan line for provisional total, lime dot for current snapshot, vertical kickoff lock marker; hover/tap for source timestamp and per-game movement. Missing data shown as em dash with stale warning, not 0.
Buttons: lime filled primary, dark outlined secondary, ghost tertiary. Focus ring cyan 2px.
Micro-interactions: subtle 150–220ms easing, number count transitions, score delta pulses; honor reduced-motion. Avoid casino slot-machine animations and misleading win confetti.

## Documents / marketing
Use Midnight header, lime rule, white background for print when appropriate, Inter body, consistent GTL wordmark, source/date footer. Include version and owner. Social graphics: scoreboard-style typography, original shapes and team abbreviations, no unauthorized third-party logos. Notifications concise: matchup, movement, original/current line, timestamp, deep link.

## Data integrity and accessibility
Never display a provisional score as final; use explicit PROVISIONAL or LOCKED text. Separate market line from player's prediction; protect pre-submission visibility. Use signed spread conventions consistently and display both team and sign. Quote source and timestamp for every line. AA contrast, keyboard navigation, semantic tables, aria-live for score changes, readable reduced-motion fallback.

## Agent compliance checklist
1. Read this guide and tokens before any UI/document/image change.
2. Use shared tokens, typography, components; no ad hoc hex colors.
3. Confirm logo/team mark rights; create original assets instead of copying.
4. Test 320px mobile, iPhone safe areas, dark/light print, keyboard and contrast.
5. Screenshots/PR must show brand consistency and state labeling.
6. Design deviations require an explicit documented exception.

## Deliverables still needed
The selected original logo and app icon are implemented. The final type, palette, icon and motion selection is the new app's D-38 and D-55 system (D-58, October 26, 2026). This section's old-app type and palette are legacy until the old app retires. The new app's component kit is `web/src/next/ui/`. The native iOS asset catalog remains incomplete. The provisional functional theme is described below.

## Provisional functional theme option — 2026-10-08
The user requested a working Light option alongside Dark and System. This is a functional exception to waiting for final visual selection, not approval of the final brand identity. Dark remains the default. The preference is saved per browser/device, not synchronized to the game account. Light uses the existing print-paper white and print-ink navy, with pale surfaces; lime action fills retain dark text. `themes.light.primaryForeground` supplies dark green for readable accent text; cyan, win, loss, pending and tie foregrounds are darkened for contrast on light surfaces. Both themes use shared semantic tokens and respect the device choice only when System is selected. The five-option identity review remains open.

## D-38 redesign system (the new app) — October 14, 2026
Status: **final** (D-58, October 26, 2026). Sean confirmed the D-38 prototype and D-55 approvals as his final selection for typography, palette, supporting icons and motion, which also settles this section's review (build plan stage 6). Sean approved the redesign prototype (canvas version 2) on October 14, 2026 (D-38) and asked for it as soon as possible (D-39). This section is the brand system for the new app in `web/src/next/`, built beside the old app. Where it differs from the sections above, it governs the new app only. The old app keeps the sections above and `design/tokens.json` until the flip (build plan stage 80); `design/tokens.json` is retired only when nothing uses it (stage 81).

Sources of truth, in this order:
- `design/tokens-next.json`: every value (colors per theme, type scale, spacing, radii, motion, layers, avatar fills, the font link).
- `web/src/next/styles/tokens.css`: the same values as `--gx-` custom properties. `base.css` (root, resets, motion) and `components.css` (the shared `gx-` classes, ported from the prototype's shared classes).
- `tests/next-tokens.test.mjs`: the gate for every stylesheet under `web/src/next/` (prefix, tokens defined in both themes, CSS equal to the JSON, contrast, font floor, tabular numbers, reduced motion, no hard-coded colors).

### What stays and what changes
- **Stays:** the name **Guess The Line**, the Field monogram (since D-44 the Yardline G alone in `accent-ink` on a transparent background, with no tile; `Brand.jsx` geometry), Electric Lime `#B8F34B` for the one primary action, cyan for data in dark mode, dark as the default with Light and System per device, and every data-integrity rule above.
- **Darker navy** (D-35 "darker"): canvas `#070B16` instead of Midnight `#0B1020`; surfaces one step darker on the same hue. Browser theme color `#070B16` dark, `#EEF1F6` light: `web/index.html` names one per color scheme, `Theme.jsx` sets the bar to the theme in use, and the manifest's single theme and splash color is the dark canvas (Dark is the default).
- **Type:** Figtree replaces Inter for reading text; Big Shoulders Display for words only (titles, 20px and up); Barlow Condensed for every number and team abbreviation. IBM Plex Mono is not used.
- **Violet means live** (`#D08CFF` dark, `#7B2CBF` light), for games in progress only. It is the color most distinct from loss for color-blind players.
- **Loss** is `#FC7C8E` in dark. The separate tie color retires: a push uses pending plus the word PUSH.
- **Radii** 6 / 10 / 16 / 24 / pill (the old 12 card and 8 control radii stay in the old app).
- **12px floor** for uppercase status pills, tags and counters, and the initials in a 24px avatar, only. Reading text and every tappable label are 16px; meta is 13px.

### Palette
Tints are solid colors (the state color mixed into surface-1), so contrast is predictable. Never put white text on a colored fill; text on lime is always `accent-text`.

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `canvas` | `#070B16` | `#EEF1F6` | App background |
| `surface-1` | `#111A2D` | `#FFFFFF` | Cards, tab bar |
| `surface-2` | `#1B253B` | `#F3F5F9` | Controls on cards, sheets, dialogs |
| `surface-3` | `#26314B` | `#E3E8F0` | Pills, badges, pressed state |
| `border` | `#303D57` | `#D3DAE5` | Hairlines between rows (decorative only) |
| `border-strong` | `#7A89A6` | `#6E7D96` | Control outlines, dashed "not available" |
| `text-1` | `#F5F7FB` | `#0B1020` | Main text and numbers |
| `text-2` | `#BAC6D8` | `#3C4A63` | Secondary text, odds prices |
| `text-3` | `#95A2BB` | `#526078` | Meta and icons only |
| `accent` | `#B8F34B` | `#B8F34B` | Lime fill: the primary button, your selection, the active tab marker |
| `accent-text` | `#101B0A` | `#101B0A` | Text and icons on lime |
| `accent-ink` | `#B8F34B` | `#3B6309` | Lime as text or an edge on a surface; in light, the 1px edge of every lime fill; the logo (D-44) |
| `accent-tint` | `#283831` | `#EAFBC9` | Your row, your tag, your reaction |
| `data` / `data-tint` | `#38BDF8` / `#17344D` | `#03658A` / `#DBF3FE` | Links, line movement, charts, info |
| `win` / `win-tint` | `#34D399` / `#17383E` | `#067247` / `#DAF7ED` | Win, cover, rank up |
| `loss` / `loss-tint` | `#FC7C8E` / `#372A3D` | `#B32643` / `#FEE7EB` | Loss, rank down |
| `pending` / `pending-tint` | `#FBBF24` / `#32312C` | `#8C5200` / `#FEF3D8` | Push, pending, Late, due soon, Real slip |
| `live` / `live-tint` | `#D08CFF` / `#332F53` | `#7B2CBF` / `#F5E8FF` | Games in progress only |
| `on-state` | `#070B16` | `#FFFFFF` | Text on a solid state fill |
| `focus` | `#38BDF8` | `#03658A` | 2px focus ring with a 2px gap |
| `overlay` | `#070B16CC` | `#0B102099` | Scrim behind sheets, dialogs and celebrations |

Avatars (faces first): eight fills, the same in both themes, with initials in `#0B1020`: Iris `#B7ADFF`, Peach `#FFB79E`, Sky `#8FD8FF`, Mint `#8FE6C0`, Butter `#FFD97A`, Rose `#FFA3BE`, Lilac `#DDB3FF`, Sand `#DCCDAE`. Each player keeps one fill from a stable hash of the account, never by rank or result; a name always sits beside the face. In light mode avatars get a 1px `border` ring.

Dark-only lighting is decorative: a faint floodlight wash at the top of the canvas and yard lines inside the Home hero card. Text never sits on the wash. Light mode drops both; its glows become solid 2px rings.

### Type
Fonts load from Google Fonts with `display=swap` (no font file is distributed): Barlow Condensed 500/600/700, Big Shoulders Display 700/800, Figtree 400 to 800. The new app adds the link when it mounts (`web/src/next/styles/fonts.js`), and `web/index.html` links the same stylesheet, so these are the only webfonts the site loads (Board item 73); the legacy styling's Inter and IBM Plex Mono fall back to system fonts. Both content security policies already allow `fonts.googleapis.com` and `fonts.gstatic.com`. Fallbacks: Big Shoulders → Impact, Arial Narrow; Barlow → Arial Narrow; Figtree → system-ui, -apple-system, Segoe UI; then sans-serif.

| Style | Family, weight | Size / line | Case, tracking | Use |
|---|---|---|---|---|
| `display` | Big Shoulders 800 | 40 / 40 | upper, 0.01em | Home hero line, celebration title (one per screen at most) |
| `title` | Big Shoulders 800 | 28 / 32 | upper, 0.01em | The one screen title |
| `section` | Big Shoulders 700 | 20 / 24 | upper, 0.04em | Section heads, sheet and dialog titles |
| `team` | Barlow 700 | 20 / 24 | upper, 0.02em | Team abbreviations |
| `body` | Figtree 500 | 16 / 24 | — | Reading text, inputs |
| `strong` | Figtree 700 | 16 / 24 | — | Names, button labels |
| `label` | Figtree 600 | 14 / 20 | 0.01em | Chip captions (not tappable text) |
| `meta` | Figtree 500 | 13 / 18 | 0.01em | Kickoff, source and age |
| `micro` | Figtree 700 | 12 / 16 | upper, 0.06em | Status pills and counters only |
| `n-xl` | Barlow 700 | 56 / 56 | — | Home countdown only |
| `n-l` | Barlow 700 | 32 / 32 | — | Final scores, your guess readout |
| `n-m` | Barlow 600 | 24 / 28 | 0.01em | Lines on cards, board values |
| `n-s` | Barlow 600 | 18 / 22 | 0.01em | Odds lines, chip numbers |
| `n-xs` | Barlow 600 | 16 / 20 | 0.01em | Odds prices, to-win amounts |

Every number style sets `font-variant-numeric: tabular-nums` after its font, because Barlow and Figtree ship tabular figures switched off. Big Shoulders has no tabular figures, so it never sets a number. Spreads use the real minus sign (−3), never a hyphen.

### Spacing, radii, layers
- Spacing on a 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Page gutter 16; card padding 16 (Home hero 20); 24 between sections; touch targets at least 44, primary buttons 52 tall.
- One column at 390; at most 520 wide, centered, on larger screens. No horizontal page scroll; chip rails scroll inside their own track. Top headers retain the context mapping above. The shared floating tab bar is at least 72px tall with a 12px bottom gap; dock bar 56, plus safe-area insets.
- Radii: `xs` 6 (pills, tags), `sm` 10 (buttons, chips, odds buttons, inputs), `md` 16 (cards, toasts), `lg` 24 (sheets, dialogs, Home hero, celebrations), `pill` (avatars, segmented controls). The badge keeps its own 14 (the Pylon shape).
- Elevation: cards `e1`, floating bars, toasts and menus `e2`, sheets `e3` with a scrim. Glows mark state, not height (selection, live, a settled win).
- Layer order: content 1, top bar 20, tab bar 30, dock 35, sheet 40, dialog 45, popover 48, toast 50, celebration overlay 60.

### Rules of restraint
1. One screen, one job, one title, and one lime button in view. Repeated buttons on cards are secondary.
2. Lime only for the primary action, your selections, the active tab and you. Ghost buttons and links use `data`.
3. A card shows at most 6 numbers; book lines, movement, records, referee, wind and full trends open on tap.
4. One meta line for source and time per row.
5. Empty state: one sentence and one action.
6. Plain words: Spread, Total, Units (U), Pick streak.
7. Never color alone: every state has a word or an icon (WIN, LOST, PUSH, LIVE, Late · 12 min).
8. Honest data: a value, "—" for missing (never 0), or a lock icon with a sentence for a hidden market. PROVISIONAL and FINAL are written out. No live score until a free live source is approved.
9. Faces first: every social item leads with an avatar.
10. Fine print lives behind ⓘ (D-55, below): explanations, disclaimers and credits open from an "About …" button; the one-word labels stay.

### Motion
Durations: tap 100ms, quick 160ms, base 240ms (sheets in), exit 200ms, big 600ms (bursts, count-ups, at most), pulse 1800ms (the LIVE dot, the only loop). Easing: standard, enter, exit and pop (a small overshoot for selections, saves and wins). Only transform and opacity animate. Motion explains a change; saves get a small moment, verified wins a big one, losses stay quiet; one big moment at a time and never on page load; never more than 3 flashes a second. Reduced motion (the device setting, or `data-motion="reduce"` on the app root) stops every animation and transition; numbers show their final value.

**Moments (D-69, November 2, 2026).** One engine (`web/src/next/moments/`) decides every moment's size from Sean's
choice ("Use PICK column"), plays only on a fresh server read, never replays (a per-account seen record on the device,
cleared on sign-out), never plays on page load (results from while you were away show NEW and play when their card is
opened) and shows one big moment at a time (`ov.flash`, "New results"). Small moments are 240 ms apart.

| Moment | Size |
|---|---|
| Lock in a pick · Whole week locked · Rank up · Pick streak grows · Tracked bet wins | Small |
| Bullseye · Week final · Reaching 1st · Guess the Points exact · Badge or award | Big |
| Loss or big miss | Quiet |

**Nesting cards on every tab (D-69).** Every tab's sections are D-66 nesting cards: a deeper layer rises in (240 ms),
its first six units follow 30 ms apart (160 ms), a restored parent settles (200 ms), and a tab change fades only the
screen (160 ms). The bars never animate.

### Themes, contrast and other modes
- Dark is the default. Light applies when `Theme.jsx` sets `data-theme="light"` on `<html>` (it resolves System), or `data-theme="light"` on the app root. Light keeps the layout; glows become 2px rings; every lime fill gets a 1px `accent-ink` edge, since lime on the light surfaces is only 1.08 to 1.23:1 (the outlined primary now uses accent-ink directly).
- Checked on the token values for both themes (`tests/next-tokens.test.mjs`): at least 4.5:1 for every text and icon color on every surface and on your-row tint, each state color and `text-1`/`text-2` on the state tints, text on lime and on solid state fills; at least 3:1 for control outlines, the focus ring and the edge of a lime fill. Lowest text pairs: dark `text-3` on your-row tint 4.80, light `win` on surface-3 4.87. Lowest outline: light `border-strong` on surface-3 3.39. Avatar initials 9.41 (Iris) to 13.94 (Butter).
- Known limits, handled by rule 7: win and lime are close in lightness, live and loss are similar in lightness, and the `border` hairline is decorative.
- Forced colors (Windows high contrast): controls draw a real border; selected chips, odds buttons and segments use Highlight.

### For agents building the new app
1. Use the `gx-` classes and `--gx-` tokens. Every class starts with `gx-` (screen classes too, for example `gx-home-hero`) and every selector stays under the `.gx` root. Never use the old app's custom properties inside `.gx`.
2. No hex, rgb or named colors outside `tokens.css`. A new color is a new token in `design/tokens-next.json` and `tokens.css`, in both themes, and must pass the contrast test.
3. Load `tokens.css`, `base.css` and `components.css` in that order. `base.css` cancels the old app's element rules (`styles.css` is loaded on every page); keep element selectors inside `:where()`.
4. Build screens from the React components in `web/src/next/ui/` (stage 8: Text, Button, IconButton, Card, List, Row, Pill, Tag, Chip, ChipRail, Segmented, GateBanner, LockLine, Countdown, Rank, Meter, Badge, Strip, Sheet, Dialog, Toast, Overlay, TeamMark, the Field monogram and Lucide icons). They only draw what they are given; the server and `web/src/next/rules.js` decide what is hidden. Check a screen's markup with `tests/helpers/ui-markup.mjs` (gx- classes, accessible names, every svg hidden or labelled, emoji only inside `data-emoji-ok`).
5. Any deviation from this section needs a recorded decision.

## Four-tab simplification direction — October 21, 2026

Sean approved consolidating navigation to **Home / Play / Bets / Research**, with
League inside Play and Fantasy inside Research, giving guessing/competition and
actual-bet research/tracking equal priority. He selected **One thing first**,
the third of five interactive layout examples, with one clear task above compact
rows that open into detail. See the [written design](superpowers/specs/2026-10-21-four-tab-simplification-design.md)
for coverage, navigation behavior, preservation requirements and preview evidence.

Sean approved the written specification and authorized implementation on October
21. The four-tab implementation is tracked in PR #162. Existing GTL tokens,
identity, type, semantic colors and Light/Dark/System remain the baseline. The
selection does not finalize unrelated brand categories, change game rules or
establish a native iOS release.

## D-55 glow, glass and trend charts — October 21, 2026

Sean approved the round 3 boards on the review canvas (R1–R5): the trend detail
and dragging of directions A and B, D's stat tiles and hit-rate bars, C's glow
styling in Dark and E's soft report styling in Light, and less text on screen.
This section extends the D-38 system for the new app; everything above still
applies unless this section says otherwise. Values live in `design/tokens-next.json`
and `web/src/next/styles/tokens.css`; `tests/next-tokens.test.mjs` checks them.

### New tokens

| Token | Dark | Light | Use |
|---|---|---|---|
| `hero-card` (effect) | deep-blue radial + linear glow | white to `#F4F9FD` | Glow cards: a screen's action card (`gx-card--hero`) and an opened trend, any number in view (D-56) |
| `hero-ring` (effect) | 1px cyan edge + deep shadow | 1px `#E3E8F0` + soft shadow | The same glow cards |
| `hero-base` | `#0C2540` | `#FFFFFF` | The card's base color, for contrast checks |
| `hero-text-2` | `#C9DCEB` | `#3C4A63` | Secondary words on a glow card |
| `glass` / `glass-line` | `#FFFFFF1A` / `#FFFFFF33` | `#FFFFFF` / `#E3E8F0` | Pills, tooltips and tiles on a glow card |
| `glass-shadow`, `glass-blur` (effects) | inner highlight, 14px blur | soft shadow, none | The same |
| `track` | `#FFFFFF29` | `#E3E8F0` | Empty part of a bar or meter |
| `chart-line` | `#F5F7FB` | `#03658A` | The line over a glow area |
| `glow-1`, `glow-2`, `glow-3` | `#7DD3FC`, `#34D399`, `#B8F34B` | `#7DD3FC`, `#6EE7B7`, `#D9F99D` | Area fill, top to bottom |
| `bar-1`, `bar-2` | `#7DD3FC`, `#34D399` | `#0284C7`, `#059669` | Hit-rate and progress bars, start to end |
| `chart-glow` (effect) | `0.6` | `0` | Opacity of the blurred copy under a dark area |

Light cards now float on a soft shadow (`e1`: `0 0 0 1px #E3E8F0, 0 8px 24px`)
instead of a hairline border. Dark's page wash is a deeper blue at the top.

### Where glow and glass may appear

- Any number of glow cards may be in view (D-56 addendum, October 23, 2026, which replaced D-55's two-card limit), for example the screen's one action card (each root's hero, the kit's
  `gx-card--hero`) and one opened trend.
- Glass only on a glow card: its pills, tooltips, segmented control and tiles.
- **Lime exception:** in Dark, lime is the decorative last stop of the chart
  glow (`glow-3`). It is never text, a state or a second button; the one primary
  action keeps the lime fill. The token test allows lime only as `accent`,
  `accent-ink` or `glow-3`.
- The glow gradient means "this is the chart", never win or loss. A season below
  break-even is drawn in `loss` with its sign and word.

### Trend charts

- **Research loading:** reuse the static loading skeletons from the shared kit:
  panels for a full Research read, compact lines for expanded evidence and its
  historical table. Keep the status in words for assistive technology; never
  draw sample charts or records while waiting. A failed read replaces the
  placeholder with its explanation and retry action. No shimmer or new loop.
  A failed historical-table download stays inside its evidence section. Keep
  the chart, selection and summary usable; retry only the table on request and
  keep keyboard focus in that section. Do not dismiss Research or reload the
  app automatically for a table failure.
- **Compact row:** title, side and percent, a 80 × 30 mini area, and units.
  Tapping opens the detail in place.
- **Opened trend:** title, a one-word state pill ("Not proven"), an ⓘ button, and
  a "Since 2002 / By season" control when seasons exist. Under them sit the
  headline number ("+45.2 U" or "7 of 8"), the chart and at most three tiles.
- **Line:** cumulative units, a 2px `chart-line` over the glow area, a solid
  `0 U` baseline, and a crosshair with a glass tooltip that follows the pointer
  or a finger. A range input moves it from the keyboard. The tooltip never
  claims more than the data: binned points say "after about N games".
  Line and season tooltips reserve the tallest supplied readout so wrapped labels
  never move the plot while scrubbing; the full current text remains visible.
- **Seasons:** one stem per season from the break-even line. Each stem is a
  button that shows its record and units, and a table with hit-rate bars follows.
  Stem lengths stay proportional; exact zero uses a hollow baseline marker.
  A visible 0 U key names break-even, and missing units have no mark.
- **Player comparison scales:** signed point bars show their negative/positive bounds; absolute-error bars start at
  zero and percentage bars use 0–100%. Labels describe the actual plotting range, including the existing one-point
  minimum frame. Absent observations say the scale is unavailable. Keep exact observations and their equivalent table.
- **Unit scales:** line and season views show the plotted range beside the
  chart, including zero. Read the range when comparing independently scaled
  charts. Small nonzero bounds retain their sign; all-zero evidence says
  break-even, while absent unit evidence says unavailable. The scale also
  describes the chart to assistive technology.
- **Research evidence:** date buttons in the historical table select matching
  cumulative endpoints; scrubbing selects the matching period row. The initial
  zero baseline has no period row. Keep period records distinct from cumulative
  chart records, preserve keyboard focus and use a check plus a tint/outline.
  Link separate reads only when their charted evidence matches. Keep the sample
  description outside the horizontal scroll region, with a native table caption.
- **Recorded market movement:** collected-time buttons select their charted
  observations, with the same check and selected-row treatment as Research.
  Keep missing observations as plain readable rows and preserve gaps in the
  chart. Duplicate timestamps have distinct observation names. One observation
  stays a static readout; selection adds no collection or network requests.
  Show the recorded range above the plot, with the home-team sign for spreads
  and points for totals. Use only plotted evidence for its bounds; identify a
  single observation and a flat series without inventing movement or a zero
  baseline. The same visible range describes the chart to assistive technology.
- **Tiles (from D):** win rate with a bar and a break-even tick at 52.4%, last
  10 as blocks, and games or units. Every bar carries its number in words.

In forced-colors mode, chart marks use the system Canvas/CanvasText colors and
selection uses Highlight/HighlightText. Decorative glow and area fills hide;
lines, a dashed zero baseline, stems, bar tracks and last-ten blocks retain their
shapes. The selected season keeps its check and gains a visible border; the
selected stem has an outline. Use real borders instead of relying on shadows.
Initials avatars use Canvas/CanvasText with a real border in forced colors.
This follows the user’s contrast palette without changing ordinary Light/Dark.

### Home and Bets (round 3)

- **Home:** the hero says "Lock in Week N" over glass countdown tiles and one progress
  bar per market (the status words stay beside each bar). Under it sit three stat tiles
  (Spread rank, Total rank, active tickets), who's in for the league (faces, one status
  word each, Standings and Invite) and a row to this week's trends. This brings the
  rank tiles and who's in back, which the four-tab "One thing first" Home had left out.
- **Bets:** one pill row of short labels (Tracked / Recommended / Virtual) with their
  full names for screen readers. Each view's fine print sits behind the title's ⓘ, and
  your tracked bets lead with a net-units line you can drag and Record / ROI / Win rate
  tiles.
- **My bets, November 1, 2026:** after the Selection grid release, Sean selected
  **01 — Roomy cards** from the preview refinement and confirmed **Expand in place,
  as shown**. Use a compact preview with 20px internal padding and 24px between
  tickets. Tapping opens the full two-column selection grid with every parlay leg
  and exact terms; the upward chevron collapses it. Full ticket notes/history
  remain behind Ticket details. Show recorded matchup marks without inferring a
  manually entered player's team. Comparison and record/performance content stay
  inside Filters. This supersedes always-visible full selections and the earlier
  always-open performance lead for My bets only. Retain both themes and tokens.
- **Bets › Virtual › Everyone (M-10):** a Your picks / Everyone switch under the pill row.
  - Everyone starts with this week's players: face, name, picks and units, and a
    Qualified pill.
  - Then one card per game: both team marks, the matchup, the kickoff and its faces.
  - Each pick row leads with a face. Your rows wear the your-row tint and lime
    edge.
  - A friend's closed market keeps side and units with a lock line (rule 8). One
    gate banner per screen.

### Rule of restraint 10: fine print lives behind ⓘ

Screens keep the one-word labels (Not proven, Pending, Locked, Sample, PROVISIONAL,
FINAL), missing values as "—", and the hidden-market lock lines. Explanations,
disclaimers and data credits open from a 44px ⓘ button named "About …" beside
the thing they explain. Every ⓘ topic is also listed in Menu › Guidance and
sources. One exception: the Open-Meteo credit stays beside forecast values
(D-34). The nflverse credit (CC BY 4.0) is one tap away in each trend ⓘ and in
Guidance and sources.

## D-62 team marks, records and the team page — October 27, 2026

- **Matchup:** `ui/Matchup.jsx` draws away mark, code, "@", home mark, code. Sizes 24 (rows), 32 (cards) and 48 (the
  game card at the top of a pick screen, `layout="stack"` with each record under its code). Codes use Barlow 700; the
  "@" is `text-3`; records are Barlow 600 in `text-2`. With `onTeam`, each side is a 44px button named "Seattle
  Seahawks, 4–2. Open team". Text-only places keep "SEA @ DEN".
- **Records:** a team's record sits with its mark on every pick screen (two numbers per game). It amends rule of
  restraint 3 for records only; splits and game logs open on tap.
- **Team page:** a sheet, not a tab. One headline record, at most three tiles (Home, Road, Points per game), the last
  five as W/L blocks with the letter in each block, a margin chart in `win`/`loss` with its value in words, and the
  season's games as Matchup rows with scores. No market for a game that has not finished.

- **Team game selection:** a completed game with known scores has a 44px week button that selects its margin bar.
  Scrubbing the chart selects the matching season row. Use a check plus a row tint, and a real outline in forced
  colors; keep keyboard focus on the control used. Upcoming games and finals without scores stay plain rows.
  Put the result beneath its matchup so marks, codes and scores remain readable at 320px.
  Reserve the tallest supplied margin readout so enlarged/wrapped game labels never shift the plot or slider; keep
  the full selected label visible and expose only its existing accessible chart/slider descriptions.

- **Team detail loading:** defer the detailed team view/chart and its styles until the sheet opens. Keep the sheet
  frame, back and close controls stable while the existing panels load. A failed download stays inside the frame
  with one explicit retry; preserve focus in the details and reuse the cached record read. Closing a pending view
  must return focus to its opener and a late download must not reopen it.

- October 28, 2026: the optional Research Trends page uses the existing static
  panel skeleton and a local text/retry state while code loads. Navigation stays
  available; the same named content region retains retry focus. Existing tokens,
  chart treatment and D-63 proposed labels are unchanged.

- **Recorded final cards (October 28):** keep completed matchups in a named Final
  section, with a strong readable score and separate result-source/observation
  metadata. Label commissioner-reported results and kickoff times explicitly.
  Use Kickoff passed when only the scheduled time is known; reserve live styling
  for a verified in-progress state. Existing card, text and wrapping tokens apply.
  Game-sheet arrows and swipes follow the displayed board order captured on
  opening, with account/week guards; this snapshot stays out of URL/history.

- **Recorded result in a game sheet:** reuse the board's already permitted final
  score and source in a card below the matchup. Say Recorded when opened and
  direct the player to the board for updates; keep this distinct from current
  market quotes. Preserve commissioner-reported and unverified-time wording,
  account/week guards, current-game paging and long-source wrapping. Reconnect
  focus to a recreated opener only within its captured account/week scope;
  unkeyed openers keep their normal modal behavior.

- **Checking recorded results:** reuse the secondary button inside the result
  card. Start the read only on request, keep its button focusable with a checking
  status and prevent duplicate activation. Keep old observations labelled on
  failure; show no-complete-final separately from zero. Distinguish the server
  check time from the result's observation time and preserve scope guards.

- **Game detail downloads:** keep the sheet frame, title, pager and action slots
  available while shared static panels say Loading game details. Keep download
  failures local with explicit retry and focus in the details group. Preserve
  the existing 16px content gaps, themes and forced-color treatment; never draw
  sample game data while waiting.

- **Weekly-trend recovery in game sheets:** use a secondary Refresh weekly trends
  control, labelled Retry weekly trends after failure, beside the existing
  weekly evidence status. Keep it mounted and focusable during loading, expose
  the busy/disabled state, and retain focus when the evidence returns. Preserve
  stale provenance, access refusals and independent market locks.

- **Trend chart control names:** append the visible trend title to line/season
  slider names and the Chart view group name. Keep exact point/season values in
  the value announcement. This adds accessible context without visible text or
  plot changes; standalone charts retain their existing fallback names.

- **Fantasy view loading in Research:** reuse static panels and the Fantasy title
  while its detail code loads; keep Back and tab navigation available. Keep code/
  style failure and explicit retry local, with a stable content region for focus
  through loading and recovery. Reuse existing screen styles and public data
  behavior; do not draw sample rankings while waiting.

- **Full Research sheet downloads:** keep its title and Close available while
  shared static panels say Loading research details. Keep code errors and
  explicit retry local, preserving focus in a stable details group. Reuse the
  original 16px gaps and existing Research styles; filters, charts and data gates
  remain the same after loading. Keep shared Research styles eager for reliable
  recovery across views. Inline game research stays a separate view.

- **Season-table readability:** keep records, percentages and units at the normal
  16px reading size at narrow widths; headers keep the meta style. Keep values
  together and use a named, keyboard-focusable table scroll region when columns
  exceed the available width, with the shared focus ring and native caption.
  Scrolling preserves chart selection; year controls retain their 44px targets,
  selected check and chart relationship. Keep the page within the viewport.

- **Historical Research tables:** use the 16px numeric reading style with tabular
  figures for records, games and cumulative units; keep column headers in meta.
  Keep the sample description outside the native scroll area and retain the
  caption, period records and cumulative endpoint meanings. Name the table region
  and period controls with their visible research title; scrolling keeps chart
  selection, while period controls keep focus and their matching chart link.
