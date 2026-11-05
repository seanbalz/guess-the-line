# Guess The Line — eight whole-app style directions

Owner: Sean Balsiger · Version 2 · November 4, 2026

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
