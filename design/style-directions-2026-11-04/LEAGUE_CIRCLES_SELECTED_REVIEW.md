# Selected league logos — 02 Glass circles

Sean selected **02** from the five-way comparison in both themes at
`a234f2f4bcddd8ec46218169f0110ff7dc395c0a`. This applies that selected treatment
to the existing sport switchers throughout the paired mockup viewer. Earlier
screen and specialized-state approvals remain scoped to their reviewed content.

| Current placement | Dark | Light |
|---|---|---|
| Home | [Dark](previews/league-circles-home-dark-phone.png) | [Light](previews/league-circles-home-light-phone.png) |
| Play | [Dark](previews/league-circles-play-dark-phone.png) | [Light](previews/league-circles-play-light-phone.png) |
| Bets | [Dark](previews/league-circles-bets-dark-phone.png) | [Light](previews/league-circles-bets-light-phone.png) |
| Research | [Dark](previews/league-circles-research-dark-phone.png) | [Light](previews/league-circles-research-light-phone.png) |
| EPL | [Dark](previews/league-circles-epl-dark-phone.png) | [Light](previews/league-circles-epl-light-phone.png) |
| Account | [Dark](previews/league-circles-account-dark-phone.png) | [Light](previews/league-circles-account-light-phone.png) |
| Isolated native NFL frame | [Dark](previews/league-circles-native-nfl-dark-phone.png) | [Light](previews/league-circles-native-nfl-light-phone.png) |
| Isolated native EPL frame | [Dark](previews/league-circles-native-epl-dark-phone.png) | [Light](previews/league-circles-native-epl-light-phone.png) |

Each original button remains in place with its original action and state.
The adapter changes presentation and accessible full-name labels only: 52px
circles, 30x32px contain-fit marks, independent glass/background/border/shadow,
8px gap and a lime/deep-green active outline. The shared container is clear.
Original official NFL artwork and the white/purple Premier League variants
are unchanged from the [source register](visual-assets/league-marks/sources.json).
No GTL logo recolor or new avatar feature. Existing text children are retained
for native reconciliation but visually replaced by the logo; accessible names
are National Football League and Premier League.

The primary six-screen gallery now points to these current screenshots. The
comparison boards and 01 context examples remain historical choice evidence;
they are not the selected treatment. No production header, provider, route,
permission, stored preference, record or save logic changed. NBA stays hidden.

## Verification

80 responsive layouts across six overview screens, native NFL/EPL/NFL-only
navigation and the existing EPL History shell passed at 320/390/768/1440 widths,
in both themes. 52 action checks and 152 league-mark decodes passed. Exactly
one visible switcher and one active league were retained; NFL-only still has
one option. Buttons remain 52px circles, without horizontal overflow or a
shared background/shadow. Prototype route actions and native React selection
callbacks were exercised. All sixteen captures were inspected; Account uses
an extended 1100px phone capture so its fixture footer remains visible.

No page errors, provider/auth reads, non-GET requests, storage writes or OS
dialogs were observed. This is a standalone presentation adapter; no bundle
entry or production component changed, and no bundle rebuild is needed.
Syntax, Brand QA, JSON, hashes and index links are checked before publication.

## One remaining scope clarification

For explanatory text such as “View NFL history,” should we use the full league name or replace the league reference with a logo too?

Recommendation: retain full league names in explanatory text, with logos for
navigation identity. The inspected views still contain sample league captions,
shared-frame review labels and native History wording. Those are unchanged
while the question is pending. The audit covers the ten listed representative
views, not every nested team label, chart axis or source statement. App-wide
abbreviation replacement and the first project's completion are not claimed.
New avatars/photos and popup/award exploration remain held; NBA is parked.
Parked Signal assets are untouched/unpublished. No merge, deploy or migration.
