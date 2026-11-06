# Guess The Line — eight whole-app style directions

Owner: Sean Balsiger · Version 31 · November 4, 2026


## Track a bet button cleared from ticket divider — November 5, 2026

Sean reported the Track a bet bubble touching/overlapping the divider below the
two-selection ticket in the phone capture. Computed bounds reproduced zero gap
at 320/390/768/1440px in both themes. A scoped 16px top margin on the tracking
button now separates its glass edge and shadow from the last row divider.
The same measurement check passed at all eight theme/width combinations, with
no overflow and preserved 44px targets; four ticket opens and two tracking opens
also passed. Updated dark/light phone captures were inspected. JavaScript syntax,
Brand document QA and whitespace checks passed. This fixes the mockup spacing;
visual approval remains pending. Production and parked Signal files are untouched.


## Bets glossy ticket icons and status badges — November 5, 2026

Sean authorized the Bets mockup and clarified that he is on a phone and cannot
see local files. Present review images directly in chat using phone-accessible
URLs; do not rely on localhost or local-path links for owner review. The Bets
mockup now replaces 01/02 number blocks with the selected glossy ticket glyph
and adds visible Pending/Settled badges using existing sample status. Titles,
receipt/tracker text, sample result and native buttons remain. The
[dark phone capture](previews/bets-ticket-review-dark.png)
and [light phone capture](previews/bets-ticket-review-light.png)
were inspected. Chromium checked both themes at 320/390/768/1440px, badge
contents, icon replacement, row bounds, 44px action targets, four ticket opens
and two tracking opens, with no page errors. JavaScript syntax and Brand document
QA passed. Ticket visual approval is pending. No new wagers, recommendations,
private data or production behavior were introduced. Parked Signal files stay
untouched and unpublished.


## Individual team-logo tiles added to Play — November 5, 2026

Sean authorized carrying the reviewed Home/Research treatment into Play. Each
logo in the Spread and Total sample matchup cards now has its own 42px glass
tile with a 34px mark. Names and the at separator sit outside the tiles; the pair
container is transparent. Draft/To pick status and native card handlers remain.
The [Play viewer](selected-system-review.html?screen=Play)
and [paired capture](previews/play-separate-logo-tiles.png)
are ready for review; visual approval is pending. Startup ordering was corrected
so base content cannot overwrite these enhancements on an initial iframe load.
Chromium checked both themes at 320/390/768/1440px, eight individual tile
backgrounds, asset loads and card bounds, four native Spread/Total opens,
Home/Research preservation, eight fresh direct loads and all 26 paired preview
states. No page errors were found. Captures were inspected; JavaScript syntax
and Brand document QA passed. Production, deferred avatars/awards and the parked
Signal exploration remain unchanged.


## Separate team-logo tiles carried into Research — November 5, 2026

Sean authorized applying the Home treatment to Research. The
[Research viewer](selected-system-review.html?screen=Research)
now places each logo in its own glass tile in the main matchup and Games/Teams
previews, with matching available detail matchup treatment. Main tiles are 64px;
quick-card tiles are 42px. Names and the at separator stay outside the tiles.
The shared layout container remains transparent, and existing Home choices,
trend charts and fictional usage values are retained. The
[paired capture](previews/research-separate-logo-tiles.png)
was inspected. Chromium verified 12 individual tiles across both themes, loaded
marks and bounds at 320/390/768/1440px, plus ten native game/games/teams/trends/
fantasy opens. JavaScript syntax and Brand document QA passed. This change is
ready for visual review; it does not establish full Research or app acceptance.
Production and the parked Signal exploration are unchanged.


## Separate backgrounds for each Home team logo — November 5, 2026

Sean corrected the paired Home treatment: each logo needs its own background.
The [Home mockup](selected-system-review.html?screen=Home)
now puts each team mark in its own 34x38px glass tile, with the @ outside both
and a fully transparent shared layout container. Each tile has its own border
and shadow in dark and light mode. Names, sample status, selected compact card
and native actions remain intact. [Updated paired capture](previews/home-separate-logo-tiles.png)
was inspected. Chromium verified eight individual tile backgrounds across both
themes, no shared background/shadow, layouts at 320/390/768/1440px, loaded marks
and four game opens. JavaScript syntax and Brand document QA passed. Whole-screen
review remains pending; production and parked Signal files are unchanged.


## Both team marks in Home matchup rows — November 5, 2026

Sean authorized continuing with the recommendation to show both teams in Home
matchup rows. The [selected viewer](selected-system-review.html?screen=Home)
now shows Seahawks/Broncos and Bears/Lions marks in away/home order beside the
existing names and draft/status text. The compact selected action card is retained.
Marks reuse the unchanged registered assets; no new live data or private picks
are added. [Paired dark/light detail capture](previews/home-matchup-logos.png)
shows the proposed treatment. Chromium checked both themes at 320/390/768/1440px,
loaded marks, readable row bounds, 44px actions and four native game opens with no
page errors. Brand document and JavaScript syntax QA passed. No new Home or
whole-app sign-off is inferred. The parked Signal files remain untouched.


## Compact Home action card selected — November 5, 2026

Sean selected the compact version from the Home comparison. The
[selected whole-app viewer](selected-system-review.html?screen=Home)
now uses the shorter "Finish your picks" headline, 60px progress ring and 18px
action-card padding in dark and light Home. Existing colors, materials, G,
button styling, data and native navigation are retained. The
[comparison](home-compact-review.html)
preserves the previous layout beside the selected version. This accepts the
action-card layout only; fresh review of the rest of Home remains pending.
The stopped Signal exploration is untouched and unpublished.


## Compact Home action-card comparison — November 5, 2026

Sean agreed to review a compact Home card beside the existing card. The
[local comparison](home-compact-review.html)
keeps both dark/light themes, selected materials, G, ring data and native button
nodes. The proposal shortens the headline and progress row, saving approximately
108px at 320, 390, 768 and 1440px in both themes. Chromium checked eight layouts,
nav fit, retained 28px card radius, glossy icons and four Continue picks actions;
no page errors were found. [Dark capture](previews/home-compact-dark.png)
and [light capture](previews/home-compact-light.png)
were inspected. This is a proposed comparison, not selection or Home acceptance.
The selected whole-app viewer is unchanged. The stopped Signal branding files
remain preserved and unpublished; no work on that exploration resumed.


## Selected icon finish: 03 Glossy glass — November 4, 2026

Sean accepted the assistant recommendation ("go with your rec"): use **03 Glossy
glass** for icons across the current dark/light mockups. The clear face, glossy
edge and restrained shadow fit the floating glass cards and hybrid G. Keep
functional glyphs readable and inactive navigation neutral so lime emphasis
stays selective. Geometry remains Lucide; notices and team-mark provenance are
retained. [Five-way visual reference](icon-treatment-options.html)
and [paired screen review](selected-system-review.html)
record the choice. Alternatives remain available for comparison. This selects
the icon finish; reopened screens still need fresh review. Production integration,
league-wide mark replacement, avatars and popup/award work retain their existing status.


## Team marks and icon exploration brought into the redesign — November 4, 2026

Sean explicitly authorized moving team/league logos and tab/other icons into the
current visual project. Avatars and popups/awards remain held. The paired viewer
now reuses existing NFL/EPL team marks beside names and offers five original
Lucide-based finish studies: outline, duotone, glossy glass, lime medallion and
inset relief. Home uses an 8/12 sample progress ring; Research uses actual team
marks, an illustrative trend and 8.0/6.5 sample comparison bars instead of repeated
instructions. Existing native buttons and selected theme recipes are retained.
[Five-way comparison](icon-treatment-options.html)
and [paired screens](selected-system-review.html)
are proposals for fresh review. No new screen acceptance, icon selection, league
mark replacement, production implementation or deployment is inferred.


Validation for the visual expansion: Chromium checked six screens at 320, 390,
768 and 1440px (24 layouts), all 26 paired views, all five selectable treatments,
and 16 native Home/Play/Research card clicks. No page errors, broken preview
images, document overflow or clipped bottom navigation were found in those
checks. Brand document QA passed. Extended-height Home/Research/EPL captures
show content for review; they are not device acceptance. The source manifest
records unchanged team-asset hashes and original source records, with bundled
Lucide license notices. New-head CI and visual selection remain pending.

Saved current previews: [icon finishes](previews/icon-treatment-options.png), [Home](previews/visual-review-home.png), [Research](previews/visual-review-research.png), and [EPL](previews/visual-review-epl.png). Six overview thumbnails are refreshed.

## Useful mini previews in reopened screens — November 4, 2026

Sean explicitly confirmed replacing sparse bubbles with useful content previews.
The [paired review](selected-system-review.html?screen=Home) now enriches Home,
Play, Bets and Research while retaining the exact selected theme/logo/card/button
recipes. [Scope and fixture sources](selected-content-preview.json) identify the
reused sample data: community rank 02/24, the existing Seahawks/Broncos and
Bears/Lions matchups, fantasy targets 8.0/6.5 and the existing trend-path geometry.
No private picks, live odds/projections or recommendations were added.

Home's League and Research cards contain summaries. Play draft/total cards show
full sample matchup names. Bets' recommendation panel previews matchup research.
Research's Games/Trends/Fantasy/Teams cards contain a matchup, mini chart, player
comparison and team names. Decorative football-field lines are replaced with a
clean full-name matchup in the affected overview/detail views. Native button
nodes and their bound click handlers are preserved; only their contents change.
This controller is scoped to the current selected-system review; the earlier
style studies, EPL/Account and held awards/avatar/team-mark/icon features are
unchanged. Real NFL/EPL marks remain deferred under Sean's earlier instruction.

Earlier screen acknowledgments remain historical, with fresh visual review
pending and Home/overview next. [Expanded Home](previews/selected-content-home-expanded.png)
and [expanded Research](previews/selected-content-research-expanded.png) captures
show more content than a standard phone viewport; the live review retains normal
850px frames with internal scrolling. All six standard primary captures and the
overview gallery were refreshed; expanded captures are presentation aids only.

Chromium rechecked all six screen pairs at four widths (24 layout cases / 48
frames), all 26 paired states (52 themed views), matching content/selected
recipes, notes/export/deep links and table/overview behavior. Separate pointer
checks verified eight Research quick-card open/Back flows and two Play pick-card
flows on both themes. Research has zero remaining `.field` placeholders, four
content previews and the expected sample usage values. No JavaScript errors were
observed. Syntax, local links/IDs, metadata/fixture/selected-source consistency
and Brand QA passed. Expanded Home/Research captures were inspected at full size;
updated primary and overview captures were checked. These are bounded mockup
checks, not full accessibility, hosted acceptance or final screen approval.
Production, frozen tracker, style selections and deferred scope are unchanged.

![Revised Research with meaningful previews and a clean matchup](previews/selected-content-research-expanded.png)

## Visual review progress — November 4, 2026

Sean requested a closer review after flagging the Research placeholder field,
missing team marks and sparse bubbles. **Home, Play and Bets overviews are
reopened in both themes**, with Research concerns still unresolved. Prior yes
acknowledgments remain in [acceptance history](selected-system-review.json), not
current completed sign-off. Chosen style recipes remain the starting point.
Sean confirmed useful miniature content previews; the implemented revision
is now ready for fresh review. Metadata scope and Brand QA passed. Visuals and production
are unchanged; whole-project completion and deferred work remain open.

## Selected dark + Porcelain across primary screens and layers — November 4, 2026

Sean authorized cross-screen review after selecting the Porcelain light base.
The [live paired review](selected-system-review.html) aligns dark and light
previews using six screen tabs and a layer selector. It covers Home, Play,
Bets, Research, EPL and Account: six primary views plus twenty available detail
states (26 pairs / 52 themed frame views). The [overview gallery](selected-system-overview.html)
shows browser captures of all six primary pairs and links back to each live view.
[Source manifest](selected-system-review.json) maps exact previously selected
dark recipes and the current Porcelain/light-adaptation recipes. No whole-app
approval or production acceptance is inferred.

Details include existing game/draft/score/league views, ticket/tracking/
recommendation layouts, Research lists/chart/table views, EPL drafting and
confirmation, and account/reminder sample states. The review reuses existing
fictional fixtures and click handlers; it does not build functional product
features. Existing awards/avatar/team/logo/icon work remains deferred. Screen
and layer controls align both phones; users can explore inside each separately
and use the parent controls to realign. Each frame uses a fixed device height
with flexible internal scrolling so navigation fits. Table rows are 16px,
headers 13px, inside named keyboard-focusable overflow regions in this review.

Optional notes are scoped to screen/layer, saved locally and exported as a
versioned JSON review file. They are not account data, approval or a release.
URL screen/layer parameters are validated against the manifest. The gallery is
a static browser-capture overview; the paired page is the interactive review.

Chromium verified all six screen pairs at 320/390/768/1440 (24 layout cases / 48
frames), with matching content, selected theme recipes/logos, card geometry,
internal navigation fit and no page/frame horizontal overflow. All 26 paired
states opened correctly (52 themed views); notes persisted after reload,
exported JSON content was verified, and a Research/fantasy deep link worked.
Table font sizes/region semantics were verified; the gallery loaded all six
captures without overflow at four widths. No JavaScript errors were observed.
All primary captures were reviewed through the gallery, with Home/Bets/Account
also inspected at full size. Exact source recipes, HTML IDs/local links, syntax,
export metadata and Brand QA passed. These are bounded mockup checks, not a
comprehensive accessibility audit or physical-device/hosted acceptance.
Production code/assets/tokens, frozen tracker and deferred scope are unchanged.
Cross-screen visual sign-off and whole-project completion remain pending.

![Six primary dark/light screen pairs](previews/selected-system-overview.png)

## Selected light background: 02 Porcelain glass — November 4, 2026

Sean selected **02 / Porcelain glass** from the Research comparison. The
[exact selection](light-mode-options.json) uses base `#E9ECE8` and
`linear-gradient(150deg,#FAFBF6,#E9ECE8 55%,#E0E7DE)`. [Owner preferences](prism-owner-color-preferences.json)
resolve the prior 02/04/05 background shortlist. The shared dark-ink/deep-green
logo/light-glass adaptations remain the preview references for cross-screen
review, not a separate claim of final app-wide approval. Metadata consistency
and Brand QA passed; reviewed visuals are unchanged. Cross-screen review,
production integration, whole-project completion and deferred work remain open.

## Research comparison for light shortlist 02 / 04 / 05 — November 4, 2026

Sean shortlisted Porcelain (02), Pale sage (04) and Silver mist (05), asked how
to decide, and agreed to compare the same denser Research screen. The [three-way
Research board](light-research-comparison.html) holds content, type, glass,
logo and accents identical so the background undertone is the comparison.
No option or light logo adaptation is selected. [Metadata](light-research-comparison.json)
retains original option numbers and the exact shared source recipes.

The comparison-only Research composition reuses the existing fictional Player
A/B usage values and illustrative trend vector from `app.js`; it does not alter
production Research, add live research, projections or sportsbook quotes. Table
values and row labels are 16px; headers/caption and external chart labels are
13px. Tiny vector text labels are replaced with native Week 1/Week 5 labels.
A named, keyboard-focusable native table scroll region contains narrow-width
overflow. The existing game-action button node is moved into the composition,
preserving its native bound handler. Opening details/Back or leaving/returning
to Research restores the comparison consistently.

Chromium checked three frames at 320/390/768/1440: identical table/chart/card
recipes, three distinct backgrounds, matching light logo and text, correct
reading sizes, table caption/region, no page/frame horizontal overflow, and
fitting navigation. Each preview passed game-details/Back and Home/Research
round trips. No JavaScript errors were observed. Source option/recipe consistency,
local references, syntax and Brand QA passed. The final desktop capture was
inspected. This is bounded mockup verification, not independent device acceptance
or a full accessibility audit. Dark selections, production and deferred scope
remain unchanged.

![Research in shortlisted Porcelain, Pale sage and Silver mist](previews/light-research-comparison.png)

## Five light-mode alternatives — November 4, 2026

Sean agreed to compare light-mode options next. The [five-option board](light-mode-options.html)
shows Arctic glass, Porcelain glass, Warm ivory, Pale sage and Silver mist.
The first two revisit his earlier Arctic/Porcelain interests; no current light
option is selected. Shared floating-glass geometry, 18px blur, 28px corners,
selective lime action/stat accents, typography and transparent outlined button
family carry across the five. Dark ink replaces dark-mode ivory on light
surfaces. Dark green supplies readable labels, key figures, progress and outlines;
logo-lime remains in the surface tints. [Exact recipes](light-mode-options.json)
record the proposed adaptation and source mapping.

The [proposed deep-green hybrid SVG](logo-hybrid/light-deep-green.svg) retains all
paths, masks, grain and lighting from the selected dark logo, remapping only
base-derived gradient colors to existing light-theme green `#3B6309`. This is a
light-surface candidate, not a newly selected logo or a change to dark mode.
The dedicated light bridge does not alter earlier dark previews. Fixed-height
phone frames use flexible scrollable content so navigation fits without a dark
blank strip beneath the light scene.

Chromium verified five widths (320/390/768/1440/1920), five distinct backgrounds,
loaded adapted logos, light scheme, shared readable text/accent, selected card
geometry/blur, no page/frame horizontal overflow and fitting navigation/device
height. Thirty screen/light-option combinations retained the theme; all five
Home actions opened Play. The approved dark preview retained ivory and the lime
SVG in a regression check. No JavaScript errors were observed. Source checks
verified identical logo paths/masks/grain, local references and metadata.
Forty-five specified text/accent-to-gradient-endpoint pairs meet 4.5:1; this is
not a comprehensive audit of translucent glass or logo specular highlights.
Syntax and Brand QA passed; the final board capture was inspected. Transparency/
forced-color fallbacks were source-reviewed, not separately emulated.
Production code/assets/tokens and deferred follow-up remain unchanged.

![Five light-mode options with floating glass and selective lime](previews/light-mode-options.png)

## Selected refined lime emphasis — November 4, 2026

Sean confirmed that the [lime-priority Home/Play preview](lime-priority-preview.html)
looks good. [Selection metadata](lime-priority-preview.json) now records exact
logo lime for action cards and key rank/accuracy stats, neutral supporting
floating cards, retained charcoal gradient/ivory text/hybrid logo, and the
transparent outlined primary shown. This supersedes the pending-refinement
status below and refines the earlier raw selective-color study. Metadata
consistency and Brand QA passed; reviewed visuals are unchanged. Remaining
screen/light-mode review, whole-project completion, production integration and
deferred follow-up are not established by this selection.

## Selective logo-lime emphasis on actions and key stats — November 4, 2026

Sean preferred Selective color, clarified the accent should match the bright
lime of his logo rather than forest green, and specified action cards plus key
stats such as rank and accuracy. The [Home/Play preview](lime-priority-preview.html)
uses the exact logo lime `#B8F34B` at varying transparencies: a lime face/edge on
action cards, lightly tinted rank/accuracy tiles and lime key figures. Supporting
cards and ordinary navigation retain neutral floating glass. Ivory reading text,
charcoal gradient, selected hybrid SVG and card geometry remain fixed. The
existing transparent-primary/3px-lime-outline recipe is retained.

[Exact settings and scope](lime-priority-preview.json) distinguish the requested
emphasis from a final visual selection. The bounded action selectors cover the
Home next-action hero, Play draft/pick tiles, the tracking action panel and EPL
pick-a-team panel. Stat accents target Home rank/accuracy and the Play score.
Ordinary research/navigation cards, status semantics and fixtures do not change.
The preview frames are taller to show highlighted and quiet cards together.
No separate card colors or unrelated accent hues were introduced.

Chromium verified four widths (320/390/768/1200), selected logo/text/geometry,
page/frame overflow and navigation fit. Computed Home rank/accuracy and Play
score colors match logo lime; action surfaces differ from the untouched quiet
cards/pick-container. Twelve screen/frame combinations retained the design and
the Home primary action opened Play. No JavaScript errors were observed.
JavaScript syntax, local references, metadata, exact source recipe consistency
and Brand QA passed. The final Home/Play capture was visually inspected after
font readiness. Reduced-transparency/forced-color styles were source-reviewed,
not browser-emulated; this is not full accessibility/device acceptance.
Refined visual sign-off, production integration and deferred follow-up remain open.

![Logo-lime action cards and rank/accuracy accents on Home and Play](previews/lime-priority-preview.png)

## Five directions for a richer dark mode — November 4, 2026

Sean felt the neutral/transparent direction was becoming too grey and accepted
five visual approaches: [Forest glass, Midnight glass, Warm graphite, Prism
edges and Selective color](dark-character-options.html). These are exploratory
alternatives, not replacements of earlier selections. All retain exact selected
lime hybrid logo, ivory main/secondary text, charcoal base, font and floating-glass
geometry (28px corners, 18px blur, selected gloss/shadow and spacing). Tints,
reflections and primary-action presence vary. Midnight/warm add cool/warm dark
background undertones; Prism keeps neutral cards with colored edge reflections;
Selective color keeps supporting cards neutral and colors the hero and primary
button. Dark label text is retained on the bright lime primary in option 05.
[Exact recipes](dark-character-options.json) preserve all settings.

Card/metric tints and the selective green hero were kept dark to protect the
selected ivory labels. Tint is decorative, not a semantic result/status change.
No direction or button-fill change is selected. This does not start deferred
avatar/team-mark/icon/award work or alter production code/tokens/assets.

Chromium checked all five frames at 320/390/768/1440/1920: no page/frame overflow,
visible navigation, loaded selected logos, fixed text/base/geometry/blur, and
five distinct edge/hero recipes. Thirty screen/direction combinations retained
their material and button overrides. All five Home actions opened Play. No
JavaScript errors were observed. JavaScript syntax, local references, metadata
and source geometry/material consistency passed, as did Brand QA. The final
Home capture was inspected after waiting for frame fonts and settled rendering.
Reduced-transparency/forced-color rules were source-reviewed, not emulated.
These checks do not establish full accessibility or physical-device acceptance.

![Five richer dark-mode directions](previews/dark-character-options.png)

## Frosted button refinement: transparent face, bold lime outline — November 4, 2026

Sean chose the frosted-glass button family and requested a transparent face with
a bolder green outline. The [before/after preview](button-transparent-lime.html)
retains the exact selected logo/background/text/floating-card design. The revised
primary has no fill (`transparent`, computed alpha zero), no background image or
gloss wash, a full 3px `#B8F34B` border, ivory label, retained 20px corners and
18px backdrop blur. The existing frosted-family secondary styling is retained.
[Exact recipe](button-transparent-lime.json) records the request; the implemented
3px weight is shown for review, not treated as final visual sign-off.

The shared action bridge accepts optional backdrop filtering and defaults to
`none`, preserving earlier family appearances. Chromium verified four widths
(320/390/768/1100), transparent computed face/no image/no shine, exact border,
label/radius/blur, loaded selected logos, identical selected backgrounds/cards,
no page/frame overflow and fitting navigation. Twelve screen/column combinations
retained the recipe. The revised Home action opened Play and its keyboard focus
outline remained visible. The original frosted preview retained no backdrop
filter. No JavaScript errors were observed. Syntax, local references, metadata,
selected-card consistency and Brand QA passed; the desktop capture was inspected.
These are bounded mockup checks, not full accessibility/device acceptance.
Production and deferred follow-up are unchanged.

![Original frosted button and requested transparent lime-outline revision](previews/button-transparent-lime.png)

## Five button styles on the selected design — November 4, 2026

Sean requested five button styles with the selected background, ivory text,
lime logo and floating glass cards. The [button board](button-style-options.html)
compares classic lime pill (unmodified reference), glossy bubble, soft rectangle,
lime outline and frosted glass. Only primary action material/shape/edge/text-on-fill
and secondary action corners/shadows vary. The selected floating-card recipe,
charcoal gradient, general ivory text, hybrid SVG, font, spacing and navigation
styling stay fixed. Dark text remains on bright lime; ivory is used on dark/clear
button faces. [Exact recipes](button-style-options.json) record all values.
No button style is selected.

The dedicated bridge reapplies skins after navigation and supplies keyboard
focus, pressed, hover, disabled, reduced-motion and forced-color styles for the
four new families. Chromium verified all five frames at 320/390/768/1440/1920,
including no page/frame horizontal overflow, fitting navigation, fixed selected
logo/colors/cards, five distinct button appearances and 48px primary height.
Thirty screen/style combinations retained the selected design. All five Home
primary actions opened Play. Each of the four new primary styles showed its 3px
focus-visible outline through keyboard navigation. The 01 reference exactly
matches the primary button in selected card option 05. No JavaScript errors were
observed. Responsive state was tested in Chromium; reduced-motion, disabled and
forced-color rules were source-reviewed, not separately browser-emulated.

JavaScript syntax, local HTML references, source recipe consistency and Brand QA
passed. The desktop comparison was visually inspected. This is not a full
accessibility audit or physical-device acceptance. Production code/tokens/assets
and deferred follow-up are unchanged.

![Five button styles with selected logo, background, text and floating cards](previews/button-style-options.png)

## Selected card finish: 05 Floating clear glass — November 4, 2026

Sean selected **05 / Floating clear glass**, resolving the card-finish review.
Use the exact [selected recipe](glass-card-options.json): light clear tint,
18px blur, 28px corners, restrained gloss and deeper shadow separation, including
the navigation glass shown in the option. His selected charcoal gradient,
ivory text and lime hybrid logo remain fixed. [Owner preferences](prism-owner-color-preferences.json)
record these choices together. Earlier unselected-card status below is historical.
Metadata consistency and Brand QA passed; reviewed visuals are unchanged.
Remaining control/light-mode choices and whole-project completion remain open;
production integration and deferred follow-up have not started.

## Next decision: five glass card finishes — November 4, 2026

After selecting the combined dark direction, Sean asked to continue. The
[five-card-finish board](glass-card-options.html) compares current glass (the
unmodified reviewed reference), bubble glass, frosted glass, smoked glass and
floating clear glass. The selected charcoal gradient, ivory main/secondary text,
lime hybrid logo, typography, layout spacing and control colors stay fixed.
Only card material, corners and elevation change. The same treatment carries
into the navigation glass; no icons, features or functional behavior change.
[Exact recipes](glass-card-options.json) record backgrounds, borders, blur,
shadows, gloss and radii. No card finish is selected.

The dedicated bridge styles only this review's frames and reapplies the material
after screen changes. It includes reduced-transparency and forced-color styles;
these fallbacks were source-reviewed, not independently browser-emulated.
Chromium checked all five frames at 320/390/768/1440/1920: no page/frame
horizontal overflow, visible navigation, exact selected text/logo/accent,
identical phone backgrounds and five distinct computed card surfaces. Thirty
screen/finish combinations retained appearance across all six areas. The 01
card background matches the previously reviewed combined preview exactly.
No JavaScript errors were observed. JavaScript syntax, source metadata, local
HTML references and Brand QA passed. The desktop capture was visually inspected.
These are mockup checks, not full accessibility or physical-device acceptance.
Production code/tokens/assets and deferred follow-up remain unchanged.

![Five glass card finishes with selected logo/background/text](previews/glass-card-options.png)

## Selected combined dark direction — November 4, 2026

Sean confirmed the **middle combined preview**: 02's subtle charcoal gradient
and 04's warm ivory main/secondary text with the already selected lime hybrid G.
The [exact selection](charcoal-ivory-combination.json) and [owner preferences](prism-owner-color-preferences.json)
record base `#202126`, the 150-degree charcoal gradient, main `#F3E9D7`, secondary
`#C4B9A6` and selected `logo-hybrid/lime.svg`. This supersedes review-pending
statuses in the earlier entries below. The comparison itself stays as reviewed.
This records a dark background/text direction; it does not establish approval
of remaining card/control/light-mode decisions or whole-project completion.
Metadata consistency and Brand QA passed; reviewed visuals are unchanged.
Production integration and the deferred phase have not started.

## Combined preview: 02 gradient and 04 ivory — November 4, 2026

Sean shortlisted depth/text studies 02 and 04, asked which is better for users,
and agreed to see the proposed combination before choosing. The [three-column
comparison](charcoal-ivory-combination.html) shows original 02, the combined
preview, and original 04. The middle uses the exact 02 charcoal gradient with
04 main `#F3E9D7` and secondary `#C4B9A6` text. Card material, font, logo,
control colors and fictional fixtures are unchanged. The combined treatment is
requested for review, not selected or deployed. [Exact metadata](charcoal-ivory-combination.json)
records the source studies and shared selected logo.

Chromium verified four widths (320/390/768/1440), no page/frame horizontal
overflow, visible navigation, loaded selected logos, identical material/accent,
matching left/middle gradients and matching middle/right text colors. Eighteen
screen/column combinations retained those relationships during navigation.
No JavaScript errors were observed. Source metadata and local HTML references
were verified, the desktop capture was visually inspected, and Brand QA passed.
The earlier specified text-to-brightest-gradient endpoint calculations were
11.41:1 main and 7.09:1 secondary; these do not establish all translucent-card
contrast or user preference. No production or deferred-phase change occurred.

![02 versus combined gradient/ivory versus 04](previews/charcoal-ivory-comparison.png)

## Selected charcoal: ten depth and text studies — November 4, 2026

Sean selected background **01 / Obsidian charcoal** for dark mode, then asked to
compare solid charcoal, a subtle gradient and faint glow, plus more unique text
colors, in about ten examples. The [ten-option board](charcoal-depth-options.html)
uses the selected base `#202126` and exact selected lime hybrid SVG throughout.
Options 01–03 keep the same text pair and isolate depth. Options 04–10 explore
warm ivory, ice blue, pale sage, lavender, dusty rose, pale gold and soft copper
text pairs. Card material, font, logo, accent and fictional fixtures remain
consistent. No depth treatment or text pair is selected. This does not settle
light mode or select a new app accent/semantic color system.

[Exact settings](charcoal-depth-options.json) distinguish the three background
recipes and eight text pairs. Earlier 01–05 background numbers are separate from
this board's 01–10 numbers. The shared preview bridge accepts optional wash/text
attributes; its defaults preserve the earlier five-background comparison.

Chromium checked ten frames at 320/390/768/1440/1920 pixels, including loaded
selected logos, text colors, base color, page/frame overflow, navigation fit,
identical shared card/accent variables and the isolated 01–03 comparison.
Sixty screen/study combinations retained the logo, background treatment and
text overrides. The earlier five-background board retained solid backgrounds
and selected logos in a regression check. No JavaScript errors were observed.
Both rows were visually inspected. JavaScript syntax, HTML links/IDs, metadata,
and Brand QA passed. Twenty specified main/secondary text-to-base pairs meet
4.5:1; this is not a comprehensive composited-glass accessibility audit.
Production code/assets/tokens and deferred follow-up are unchanged.

![Options 01–05: controlled depth comparison, ivory and ice blue](previews/charcoal-options-01-05.png)

![Options 06–10: sage, lavender, rose, pale gold and copper](previews/charcoal-options-06-10.png)

## App background comparison with selected logo — November 4, 2026

Sean next requested a few app backgrounds with his selected logo. The
[five-background board](app-background-options.html) shows Obsidian charcoal,
Midnight navy, Forest night, Deep petrol and Smoked plum. The first three reuse
backgrounds from previous palettes 12, 18 and 11; the other two explore dark
petrol/plum bases. These local option numbers 01–05 refer only to backgrounds,
not the previous full-palette board. No background is selected.

Every interactive Home mockup uses the exact selected `logo-hybrid/lime.svg`,
neutral glass variables, identical lime controls, text, layout and fictional
fixtures. Only the solid phone background changes; translucent cards naturally
show the base behind them. Choosing a gradient or approving a control/card
palette remains a separate decision. [Metadata](app-background-options.json)
records exact hex values and source mapping. Original review pages and production
code/assets/tokens are unchanged. Logo/background overrides follow navigation.

Chromium verified all five frames at 320/390/768/1440/1920 pixels: no page/frame
horizontal overflow, navigation fits the preview, selected logos load, solid
backgrounds stay distinct, and accent/card variables remain shared. Thirty
screen/background combinations (six areas times five backgrounds) retained their
selected logo, base and shared accent. No JavaScript errors were observed.
JavaScript syntax, HTML local links/IDs, metadata and Brand QA passed. The
five-phone Home capture was visually inspected. These are mockup checks, not
physical-phone acceptance. The deferred phase remains held.

![Five app backgrounds with the selected hybrid lime logo](previews/app-background-options.png)

## Selected logo direction — November 4, 2026

Sean selected **01 / Current lime hybrid** after clarifying "original" as option
01 on this board, not the flat app mark. Use the [reviewed lime SVG](logo-hybrid/lime.svg)
as the selected direction: exact existing G shape, lime `#B8F34B`, glossy edges
and frosted center. [Selection metadata](logo-hybrid/manifest.json) records the
scope. The five other colors remain unselected. This supersedes the earlier
unapproved-hybrid status below; broader app palette and project completion
remain open. Production integration and deferred follow-up have not started.

## Glossy/frosted hybrid and additional colors — November 4, 2026

Sean shortlisted finishes **1 / Glossy glass** and **2 / Frosted glass** and asked
for a hybrid with glossy edges and a frosted center, keeping the same G and
current color while also adding colors. The [hybrid board](logo-hybrid.html)
retains current lime as option 01 and adds evergreen, ice blue, warm amber,
soft violet and rose quartz. Every version shares exact canonical G/hash paths,
fixed frontal orientation, lighting, size, grain seed and dark background.

Native SVG layers place the frosted face inside an eroded canonical-body mask,
leaving a glossy rim and reflective yard-line strokes. Reflections are confined
to the rim; fine grain and a broad diffuse wash sit in the center. Base colors
and the exploratory status are in the [manifest](logo-hybrid/manifest.json).
These are editable vector material concepts; no raster edit or production asset
replacement occurred. Finish shortlist is not final approval of the hybrid/color.

Chromium verified six options, all twelve large/header images loaded, identical
card backgrounds and no horizontal overflow at 320/390/768/1440 pixels. XML
checks verified canonical paths and stroke, correct base swatches, fixed view,
shared inset masks and noise seed, and no shape transforms for all six SVGs.
HTML local links and Brand QA passed. The desktop board was visually inspected.
The separate avatar/team-mark/icon/award phase remains held.

![Glossy edges and a frosted center, current lime plus five colors](previews/logo-hybrid.png)

## Finish before color — November 4, 2026

Sean clarified that he wants to change the flat/2D appearance first. He explicitly
requested five finishes, including glossy glass, keeping the same G shape and
color for now. The [finish comparison](logo-finish-first.html) therefore supersedes
the color-first sequence. Options are glossy glass, frosted glass, polished
enamel, brushed metal and satin ceramic. Every preview uses current lime
`#B8F34B`, identical backgrounds, frontal orientation and sizing. Highlights and
shading vary with the material; they are not additional base-color proposals.

Native SVG gradients, lighting filters, clipped reflections and grain preserve
the exact canonical body/hash paths and hash stroke. This is editable vector
exploration, not raster editing. [Source manifest](logo-finishes/manifest.json)
records the method, swatch and filenames; standalone SVG links support closer
inspection. No new geometry, app tile or production asset was adopted.

Chromium checked all ten preview images loaded, five options, identical card
backgrounds and no horizontal overflow at 320/390/768/1600 pixels. XML/path
checks verified exact body/clip/hash geometry, stroke, base lime and viewBox for
all five vectors; HTML local links and Brand QA passed. The final desktop
capture was inspected after reducing the ceramic/frosted highlights to keep
materials distinct. These are material concepts, not physical renders or an
approved finish. The earlier color board remains provenance, not the next step.
The deferred phase remains held.

![Five finishes with the same G and base lime](previews/logo-finish-first.png)

## Logo color first — November 4, 2026

Sean found the full customizer difficult to narrow down and chose to start with
logo color/style. He confirmed keeping the current G shape. The [five-color
comparison](logo-color-first.html) keeps the exact Balanced Yardline G geometry,
flat finish and identical dark surround at large and header sizes. Soft lime
and warm amber reuse options 18 and 12; mint, blue and violet are exploratory
hues under his existing authorization to explore new colors. This chooses
neither the app palette nor a finish. One next question: which logo color?

[Color metadata](logo-color-first.json) records exact swatches. Chromium verified
five choices/ten SVG marks and no horizontal overflow at 320/390/1400 pixels;
computed colors match the swatches. Source verification confirms every path
matches the approved SVG and that no gradient/effect was added. The desktop
capture was visually reviewed; Brand QA passed. No production asset changed.
The deferred avatar/team-logo/icon/award phase remains held.

![Five logo colors, same shape and finish](previews/logo-color-first.png)

## Interactive Prism Glass customizer

Open the [live customizer](prism-customizer.html). Sean requested direct color
selection, background gradient on/off and additional style controls. The studio
previews Home, Play, Bets, Research, EPL and Account, including opened layers.
It offers background/card/accent/text colors, two gradient colors, strength and
angle; polished/frosted/clear/solid materials; opacity, blur, gloss, shadow,
corner radius and spacing; and system, rounded or editorial typography.

Dark and light configurations stay independent. Settings persist in this browser;
named designs contain both modes. Export/import transfers a versioned JSON file.
Storage is local, not account synchronization. The shortlist includes 12, 18, 11,
01 and 24; Sean likes only 18 and 24 from the additional round. The studio starts
from his previously stated 12-dark/01-light preferences. No final dark selection
between 12 and 18 has been inferred. All 24 starting palettes remain available.
Choosing a starting palette resets that mode's appearance to its preset.

Local Chromium verification: 26 targeted assertions passed for custom colors,
gradient off, independent modes, all six screens, child navigation, solid/clear
materials, radius, typography, named restore, export/import, invalid inputs,
reload persistence and layouts at 320/390/736/1440 pixels. Additional checks
confirmed gradient restoration, color-picker invalid-state recovery, and retained
appearance inside Research game and Account reminder layers. No JavaScript
errors were observed. Desktop dark and mobile dark/light captures were inspected.
Brand QA, JavaScript syntax and local HTML references/IDs were checked.
Contrast figures compare base text/background and button colors only; arbitrary
user colors and composited translucent surfaces require their own review.

![Interactive studio, dark preview](previews/prism-studio-desktop.png)

This is a coded visual prototype using fictional fixtures, not production UI or
functional betting/account verification. The requested colors/fonts are an
explicit exploration exception; production tokens and approved G geometry remain
unchanged. Approval and the deferred avatar/logo/icon/award phase remain pending.

## More unique palettes and an optional card-color experiment

Sean prefers original **12 / Obsidian Amber for dark mode** and **01 / Arctic
Blue for light mode**, and also likes **11 / Forest Night**. These remain the
reference choices and their numbers have not changed. He clarified that
"separate colors" meant "unique, different, new". He additionally authorized
seeing different colors per card; that is an optional experiment, not an
interpretation of the original request or a selected design.

Open [twelve additional combinations, numbered 13–24](prism-new-colors.html).
Ten dark and two light combinations emphasize darker surrounds, contrasting
accents, clearer edges and shadow gaps. Typography, layout and the glass
material remain consistent. Original options 01–12 remain on the first board.

The **Different colors per card** checkbox switches a presentation-only view.
The [side-by-side experiment on favorites 12, 01 and 11](prism-card-color-comparison.html)
compares unified and individually tinted cards. Notes concern each palette
across both views; exports include the active card-color mode. The tint
categories are decorative, not a new result/status color system.

![Original favorite 12: unified versus different card colors](previews/prism-card-colors-dark-comparison.png)

[New unified palettes](previews/prism-new-color-combinations.png) ·
[New palettes with varied cards](previews/prism-new-colors-varied-cards.png).

| Number | Additional scheme | Mode |
| --- | --- | --- |
| 13 | [Ink & Cobalt](prism.html?style=prism&palette=ink-cobalt) | dark |
| 14 | [Carbon & Copper](prism.html?style=prism&palette=carbon-copper) | dark |
| 15 | [Petrol & Coral](prism.html?style=prism&palette=petrol-coral) | dark |
| 16 | [Forest & Orchid](prism.html?style=prism&palette=forest-orchid) | dark |
| 17 | [Burgundy & Ice](prism.html?style=prism&palette=burgundy-ice) | dark |
| 18 | [Midnight & Lime](prism.html?style=prism&palette=midnight-lime) | dark |
| 19 | [Slate & Apricot](prism.html?style=prism&palette=slate-apricot) | dark |
| 20 | [Espresso & Turquoise](prism.html?style=prism&palette=espresso-turquoise) | dark |
| 21 | [Graphite & Cherry](prism.html?style=prism&palette=graphite-cherry) | dark |
| 22 | [Indigo & Gold](prism.html?style=prism&palette=indigo-gold) | dark |
| 23 | [Ice & Pomegranate](prism.html?style=prism&palette=ice-pomegranate) | light |
| 24 | [Porcelain & Evergreen](prism.html?style=prism&palette=porcelain-evergreen) | light |

Verification: 144 embedded palette/screen/card-mode combinations and 288 focused
palette/screen/card-mode/width combinations at 320/390px passed the targeted
layout checks. All six favorite anchor/mode views rendered. Original option
numbers, round-specific board counts, favorite/note reload persistence and a
round-2 export's ID/number/mode were checked. Sixty new specified token pairs
meet 4.5:1; this is not a complete composited-glass accessibility audit. New
palette and card-comparison captures were visually inspected. No production
implementation or optional card-color adoption is inferred.

## Prism Glass — twelve color schemes

Sean requested at least ten color schemes while retaining the refined glass
style. Open [the 12-palette comparison board](prism-colors.html). Seven light
and five dark palettes share the same material, typography and layouts across
Home, Play, Bets, Research, EPL and Account, including deeper layers.

Use the Screen selector to compare the same area across twelve palettes. Open
any palette to navigate its full mockup or switch colors. Save palettes and notes
on the comparison board, then export gtl-prism-color-favorites.json. A focused
palette review exports gtl-prism-color-review.json with its current palette ID
and notes. Notes stay attached to their palette when switching or reloading,
and are shared between the focused review and the comparison board. These remain review preferences, not production approval.

| Number | Scheme | Mode |
| --- | --- | --- |
| 01 | [Arctic Blue](prism.html?style=prism&palette=arctic) | light |
| 02 | [Pearl Graphite](prism.html?style=prism&palette=pearl) | light |
| 03 | [Champagne](prism.html?style=prism&palette=champagne) | light |
| 04 | [Sea Glass](prism.html?style=prism&palette=sea) | light |
| 05 | [Peach Coral](prism.html?style=prism&palette=coral) | light |
| 06 | [Rose Quartz](prism.html?style=prism&palette=rose) | light |
| 07 | [Lavender Mist](prism.html?style=prism&palette=lavender) | light |
| 08 | [Sapphire Night](prism.html?style=prism&palette=sapphire) | dark |
| 09 | [Midnight Teal](prism.html?style=prism&palette=teal) | dark |
| 10 | [Aubergine](prism.html?style=prism&palette=aubergine) | dark |
| 11 | [Forest Night](prism.html?style=prism&palette=forest) | dark |
| 12 | [Obsidian Amber](prism.html?style=prism&palette=obsidian) | dark |

![Twelve Prism Glass color schemes](previews/prism-twelve-color-schemes.png)

Complete palette tokens are in prism-palettes.json, with CSS and browser data
exports. Color overrides include atmospheric backgrounds, frosted surfaces,
edge highlights, text, buttons, graphs, tables, navigation and opened layers.
No production app tokens are changed.

Local checks: 72 embedded palette/screen combinations, 144 focused palette/
screen/width combinations at 320/390px with no detected horizontal overflow,
selected-token application after navigation, a dark game layer, favorites and
notes reload persistence, light/dark/favorites filters, and both export filenames.
All twelve Home previews were visually inspected. Sixty specified token pairs
(body/base, muted/base, accent/base and both primary-button gradient endpoints)
meet 4.5:1; this is not a comprehensive audit of composited glass backgrounds.
No palette has been selected or deployed.

## Prism Glass — refinement round 2

Sean selected Prism Glass to refine first: "Make the cards glossier and more
Apple-like, and carry that style across the whole app." This is a mockup
refinement request, not final brand selection or production implementation.

Open [the six-screen Prism board](prism-board.html) or the
[focused Prism review](prism.html). The shared material is applied to all six
primary areas and their opened layers: double-edge highlights, translucent
panels, a brighter glazed cobalt action, softer depth, frosted segmented controls
and floating navigation. Typography now uses system UI (the Apple system face
where available) with Inter/Segoe UI fallbacks. No font binaries are redistributed.

![Prism Glass round 2 across the app](previews/prism-refined-whole-app.png)

[Full Home capture](previews/prism-refined-home.png).

The new CSS is scoped to Prism; other style directions retain their systems.
The eight-direction gallery now shows the refined Prism. Older eight-style
comparison PNGs below preserve round 1, before this refinement.

Targeted round 2 verification: 18 primary screen/width combinations across
320/390/736px, six embedded screens with no horizontal document overflow, four
representative layers (game/Back, Fantasy, EPL recorded-team confirmation,
reminders), note/shortlist reload persistence and export. Original comparison
still renders eight directions. The Home and six-screen captures were visually
inspected. JavaScript syntax, local links and Brand QA pass. This does not
establish live app integration or a comprehensive accessibility audit.

Sean requested 5–10 genuinely different styles across the whole app, based on
his 25 saved references. He explicitly authorized exploring new colors and
typography. These eight original directions are that visual exploration.
They are new coded mockups, not a gallery of existing GTL screens.

Open [the interactive review](index.html). The Screen selector compares Home,
Play, Bets, Research, EPL and Account across all eight. The Direction selector
opens a larger view of one style. Primary buttons, app tabs and the account/sport
controls navigate the mockups. Some content opens illustrated deeper layers.
[First-look overview](overview.html) crops each Home viewport for comparison;
use the full review for complete content.

## Review behavior and limits

- 48 primary screen concepts plus representative detail/state previews.
- Notes and shortlists persist locally in this browser. Export review downloads
  gtl-style-direction-review.json. These are preferences, not production approval.
- Game, Fantasy, Pick a Team and reminder states are visual fixtures. Generic
  deeper layers demonstrate the visual language; they are not full feature builds.
- All account names, points, tickets and player stats are fictional. No current
  bookmaker quote, player pick or private production data is included.
- No odds, model percentages, authenticated reads, subscriptions, actual pick
  submission or production integration is claimed by these screens.

## Source mapping

The reference numbers below match Sean's exported favorites and the
[87-reference library](../style-references-2026-11-04/REFERENCES.md).
All 25 selected IDs map to a direction. Original reference artwork was inspected
locally for #05, #06, #11, #23, #25, #33, #40, #47 and #56. Other selections
provide additional direction context; no comprehensive visual audit is claimed.
Original imagery, logos and athlete artwork are not copied into the mockups.

| Direction | New type | Palette / structure | Saved references |
| --- | --- | --- | --- |
| 1 · Prism Glass | System UI + Inter (round 2) | Airy glass, icy color, luminous edges. | [#05](https://dribbble.com/shots/15816152-Messanger-Chat-App-With-Glassmorphism-Effect), [#06](https://dribbble.com/shots/15073946-Smart-Home-Manager-App), [#82](https://www.behance.net/gallery/227826125/Liquid-Glass-UI-Design-ios-26-Apple-Liquid-Glass-UI), [#86](https://x.com/proskuaaa/status/2083260471302365520) |
| 2 · Pearl Touch | Nunito Sans | Soft relief, circular controls, quiet blue. | [#28](https://dribbble.com/shots/10725826-Neumorphism-Soldo-mobile-app), [#29](https://dribbble.com/shots/11443127-iOS-Neumorphism-Concept), [#30](https://dribbble.com/shots/22289315-Alarmly), [#31](https://dribbble.com/shots/25716286-Minimal-Futuristic-Music-Player-UI) |
| 3 · Paper Cut | Space Grotesk + IBM Plex Mono | Hard edges, bold ink, graphic lilac. | [#23](https://dribbble.com/shots/21692566-Neo-Brutalism-Cryptocurrency-Trading-and-Assets-Dashboard) |
| 4 · After Hours | Space Grotesk + Space Mono | Plum-black, hot magenta, technical type. | [#25](https://dribbble.com/shots/25514281-3D-Neumorphic-Design-Financial-Wallet-Mobile-App), [#33](https://dribbble.com/shots/27362502-AI-Trading-Mobile-iOS-App-Design), [#37](https://dribbble.com/shots/27242702-Fitness-App-Dashboard-UI-Design-Health-Tracking-Mobile-App) |
| 5 · Orbit Bento | Plus Jakarta Sans + DM Sans | Asymmetric modules, citrus, confident numbers. | [#40](https://dribbble.com/shots/25093522-Crypto-Wallet-Mobile-App-Bento-Grid), [#41](https://dribbble.com/shots/26828063-Crypto-Dashboard), [#43](https://dribbble.com/shots/25860105-Bento-Grid-Rive-animations), [#45](https://dribbble.com/shots/26434437-Bento-Cards), [#46](https://dribbble.com/shots/14234337-JUZZ-UP-mobile-card-ui) |
| 6 · Matchday | Oswald + Barlow | Coral, charcoal, oversized sports headlines. | [#47](https://dribbble.com/shots/16248566-Fantasy-Football-App), [#48](https://dribbble.com/shots/21459387-Fantasy-Cricket-App-Sports-Fantasy-App), [#51](https://dribbble.com/shots/25330262-UI-UX-Design-for-Sports-SaaS-Mobile-App), [#52](https://dribbble.com/shots/25571081-Sports-Betting-App-NBA), [#54](https://dribbble.com/shots/2073684-Fantasy-football-dashboard) |
| 7 · Summit | Instrument Sans + DM Serif Display | White space, editorial type, orange signals. | [#11](https://dribbble.com/shots/24562076-Slope-Mobile-iOS-App-Design-Concept) |
| 8 · Sunday Grove | DM Sans + Fraunces | Warm cream, sage, expressive serif. | [#56](https://dribbble.com/shots/26990857-Holistic-Health-Nutrition-Sustainable-Wellness-UI), [#57](https://dribbble.com/shots/25770562-Wellness-Meditation-Mobile-App-UI-UX-Design) |

## Explicit exploration exception

The brand guide and design/tokens.json were read before creating these assets.
Sean's November 4 instruction authorizes new colors and typography for these
mockups. Each direction defines its own scoped CSS color/type variables; this
exception applies to the design artifact only. The selected Yardline G geometry
is retained. Existing app tokens and production branding are not changed.
Fonts use the Google Fonts stylesheet with local fallbacks; font files are not
redistributed. Typography is exploratory and has not received final selection.

## Local verification

- JavaScript syntax and repository Brand QA.
- Browser: 96 primary screen/width combinations (8 styles × 6 areas × 320/390px),
  plus 12 comparison view/width combinations (6 areas × 736/1600px); no detected
  horizontal overflow in the checked controls/panels or document.
- 32 detail checks across styles: Research game/Back, Fantasy table, EPL recorded
  team confirmation and reminder enabled preview.
- Notes and shortlist reload persistence; export download filename.
- Original 8-style Home overview visually inspected; the sports panel contrast
  and narrow-header issues identified there were corrected before delivery.

This is targeted visual/mockup QA, not a full accessibility audit or live app
acceptance. Static captures are in previews/. Raw capture and CLI evidence are retained
under ignored .local helpers in the task checkout. No test credentials are involved.

## Round 1 comparison previews — before Prism refinement

![Eight Home directions](previews/home-overview.png)

[Bets comparison](previews/bets-overview.png) · [Research comparison](previews/research-overview.png)
