# Approved Home — native captures

These are unedited browser captures of the real React app at 390 px in Dark and
Light, using fictional local PGlite accounts. They contain no hosted player data.
The expanded page height shows the complete composition; this is browser
verification, not acceptance on a physical iPhone. Both 320 and 390 px layouts,
scrolling, target sizes, contrast and keyboard focus are checked separately.

Approved reference: `3ac2eb50513ba73447ef890e4a47863cde7bdd76`,
`design/style-directions-2026-11-04/previews/league-wording-home-{dark,light}-phone.png`.
Sean approved both references (“Good deploy”) and separately requested the
Spread / Total selector. Real account states replace reference sample figures;
the sport switch continues to show only leagues the account can access. The
concept badge, sample-data disclaimer and simulated phone status bar do not ship.

| Native capture | SHA-256 |
| --- | --- |
| [Dark](native-home-dark.png) | `1cdfffca9258e9c191e1edb81f5ee33c4fd7182416456666e8286094ae175c08` |
| [Light](native-home-light.png) | `1f83183fe10d719ab9ab3ce3b6983424a61cbe038d5be8bf8271ff714c504782` |

Source review fixed market routing, expired-game counts, filter restoration,
logo/control bounds and streak-result consumption. Awards stay available on
Play; a streak waits for its visible Features card. Submitted and sat-out weeks
have their own accessible progress wording.

Only Home is approved for this release. See
[the release plan](../../docs/APPROVED_HOME_RELEASE_2026_11_07.md) for evidence and
the remaining exact-source CI and hosted release steps.
