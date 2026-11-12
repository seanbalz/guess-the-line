# NBA N1 — real-build phone captures for review

Owner: Sean Balsiger · November 11, 2026 · Milestone N1 of the
[NBA build-out](../../docs/superpowers/specs/2026-11-10-nba-buildout-design.md),
built in the PR that adds this folder. **Merged and deployed November 12, 2026 UTC (Pages
`b8019df1`, [release record](../../docs/RELEASE_2026_11_12_NBA_N1.md)).**

These are screenshots of the actual app, not drawings: the production React
components and stylesheets, built with `vite build --mode cloud-test` and served on
loopback (`127.0.0.1:5198`) by `playwright.cloud.config.js`, signed in as the
synthetic fixture account "Luke Fixture". Tickets live in the real SQL ticket store
(disposable PGlite) behind the real cloud handler; the BALLDONTLIE board is a
synthetic slate (`tests/cloud-browser/nba-fixture.mjs`). Every game, score, ticket and
time is synthetic. No real player's ticket or pick, no account, provider, hosted
read or write was used (executed).

The browser clock is fixed at Tuesday, November 10, 2026, 6:44 PM PT, with the
board observed at 6:42 PM PT, the same moment as the
[November 10 mockups](../nba-buildout-2026-11-10/README.md). The lobby reply says EPL
is open to the account, as it is for every account once M-30 is applied (D-68
addendum), so the switch shows its real three circles.

## Sean's decisions these show (D-85)

- "Approve badges", immediately corrected by "we need nba logo and team logos not
  letters": every team shows its **official NBA logo** in its own glass circle and the
  sport switch shows the **official NBA league logo** in its own circle (no letter
  badges, no "NBA" text badge). Letters appear only if a logo fails to load.
- **44 px league circles below 360 px wide** (three 52 px circles do not fit beside the
  G and the avatar): the 320 px captures measure 44 px, the 390 px ones 52 px.
- **NBA stays off the production switch** (`NBA_ON_SWITCH = false`): NFL and EPL
  screens show two circles. While a saved `#nba` link shows NBA, its circle is drawn
  selected so you can see where you are. `01-sport-switch-flag-on-320-dark.png` was
  taken from a local build with the constant temporarily set to `true`, then set back
  (review only; never committed): NFL Home with the NBA circle unselected.

## Checks on every capture (executed)

Run by `tests/cloud-browser/nba-n1-capture.spec.js`, which also runs these checks in
CI without writing files; results per file are in [evidence.json](evidence.json):
no sideways page scroll; every visible control at least 44 × 44 px; no visible text
under 12 px; form fields at 16 px; every team and league mark a circle of its own;
every NBA logo decoded before the capture (none fell back to letters); league
circles 44 px below 360 px and 52 px from 360 px when three show. All 37 passed.
Full-page captures size the frame to the page so the floating tab bar sits at its
foot; sheet captures grow the frame until the whole sheet shows.

Reproduce: `GTL_NBA_CAPTURE=1 npx playwright test --config playwright.cloud.config.js
tests/cloud-browser/nba-n1-capture.spec.js` (PGlite in `.local/sql-check`).

## What each screen shows (mockup number)

1. **Sport switch.** NFL, Premier League and NBA league logos, each in its own glass
   circle; NBA selected.
2. **All 30 team logos.** Research › Games on a synthetic 15-game Tomorrow slate, so
   every team's official logo shows on one real board, with the trademark notice and
   BALLDONTLIE source line at its foot.
3. **Home.** Tonight (first tip, live game, next two), Needs your result (a suggested
   Win from a final score, and a typed-matchup ticket to confirm by hand), this month's
   net, open tickets, and the Play-coming card.
4. **Research › Games.** Yesterday / Today / Tomorrow with Prism's outline-and-tint
   selection, the observation line, In progress / Scheduled / Final groups, LIVE only
   in progress, an overtime final.
5. **Bets › Open.** Private tickets in the Prism receipt with whole American prices
   (49.5% Novig shows +102), result chips: suggested, waiting for finals, confirm by hand.
6. **Confirm result sheet.** The final score, the graded leg, the suggestion and the
   prefilled reason "Confirmed from final score"; one tap saves an audited correction.
7. **Bets › History.** Filters, filtered totals (rounded tiles, exact server totals
   below), and an expanded ticket with its original price and correction history.
8. **Track bet sheet.** The ticket editor as a shell sheet, from the board's BOS @ NYK
   card, with the matchup's logos on its leg.
9. **Play.** The held card until Guess the Spread (N3) ships.

Physical-iPhone acceptance, hosted behavior and Sean's approval are not claimed.

## Captures (SHA-256)

| # | Screen | Width (px) | Theme | File | SHA-256 |
|---|---|---|---|---|---|
| 01 | Sport switch (NBA showing, flag off) | 320 | Dark | [01-sport-switch-320-dark.png](01-sport-switch-320-dark.png) | `f300bb081d4dc3dd3ba3de4818ec0e749d9a0e686c54af16dbdfd343bc1069db` |
| 01 | Sport switch (NBA showing, flag off) | 390 | Dark | [01-sport-switch-390-dark.png](01-sport-switch-390-dark.png) | `eb1b3676a1303f9a3da769f0861edc15ae3752113fe84581a946b0f0f335324c` |
| 01 | Sport switch (NBA showing, flag off) | 320 | Light | [01-sport-switch-320-light.png](01-sport-switch-320-light.png) | `64da5abe18600ed164ac2d9ecced8fdc8abace6ce0385e4f710206bff251e2b1` |
| 01 | Sport switch (NBA showing, flag off) | 390 | Light | [01-sport-switch-390-light.png](01-sport-switch-390-light.png) | `91d03e43581c46901581e83b763190242a58fdcf9aedc034489106f2592f6020` |
| 01 | Sport switch, NBA_ON_SWITCH forced on locally (review only) | 320 | Dark | [01-sport-switch-flag-on-320-dark.png](01-sport-switch-flag-on-320-dark.png) | `f82023704ce2d16c15b6cd94f32c3b32b4d072844cd2bba045f3cd42201558f3` |
| 02 | All 30 team logos (Research › Games, Tomorrow) | 320 | Dark | [02-team-badges-320-dark.png](02-team-badges-320-dark.png) | `c01089d6c8b3360a7cebf2237aec73965a0c35b7e265fed4b0282577ab00d77d` |
| 02 | All 30 team logos (Research › Games, Tomorrow) | 390 | Dark | [02-team-badges-390-dark.png](02-team-badges-390-dark.png) | `4ef4788d0b3c86a541a45ffa23a35331fcbc432422ff5346e8a27ca910faa06d` |
| 02 | All 30 team logos (Research › Games, Tomorrow) | 320 | Light | [02-team-badges-320-light.png](02-team-badges-320-light.png) | `d65c7745f1e51a1a2ebd1807d9d9a4def8e9ec6c5e4f45d465eda0ac43bc4869` |
| 02 | All 30 team logos (Research › Games, Tomorrow) | 390 | Light | [02-team-badges-390-light.png](02-team-badges-390-light.png) | `9ceb5d1df407e9d95b7f6f54294466e0a1ad8bfeb906c7ebc10d40df889eaa65` |
| 03 | NBA Home | 320 | Dark | [03-home-320-dark.png](03-home-320-dark.png) | `a535e3d258fc6c300b5fe01ffa7b18c9591aa6aeffe8d7f751f50ec95a03e224` |
| 03 | NBA Home | 390 | Dark | [03-home-390-dark.png](03-home-390-dark.png) | `79bb4b836fa79bca0e9d44e9984664e0e2d329198f770b6c2a90aa82d72a798a` |
| 03 | NBA Home | 320 | Light | [03-home-320-light.png](03-home-320-light.png) | `5ffe223e92abd2d47870c6387a48132f9902aad70ba135f1a57e9f205f3ad414` |
| 03 | NBA Home | 390 | Light | [03-home-390-light.png](03-home-390-light.png) | `634c7f3d7cbdfc67082c6c924c3e931f393595f7673d902b629250d1a3d93c2d` |
| 04 | Research › Games (today) | 320 | Dark | [04-research-games-320-dark.png](04-research-games-320-dark.png) | `15d72d42b650094531bde56fabfa3ab93703dc695856918b8133105848fe27d0` |
| 04 | Research › Games (today) | 390 | Dark | [04-research-games-390-dark.png](04-research-games-390-dark.png) | `c3416589ba9483dd5719cafb0ca2c150dafc685a3f3d6760858b062b49e192d0` |
| 04 | Research › Games (today) | 320 | Light | [04-research-games-320-light.png](04-research-games-320-light.png) | `37199c90ac38b4910ffdd7ad413751874330af8955a7c1f9155abb342335ea11` |
| 04 | Research › Games (today) | 390 | Light | [04-research-games-390-light.png](04-research-games-390-light.png) | `10cae819d3e99b19437c902ca422639db1424df577b16e8d931f7721e7d75cf6` |
| 05 | Bets › Open | 320 | Dark | [05-bets-open-320-dark.png](05-bets-open-320-dark.png) | `2d08616fb8531f1b0325eedd23f78c8111f174d0eb639afb79450707984c4fdf` |
| 05 | Bets › Open | 390 | Dark | [05-bets-open-390-dark.png](05-bets-open-390-dark.png) | `4bf9465125f196683efe4bc6d170eaaa9a2d63890482116c72ddfd8f7ef698fe` |
| 05 | Bets › Open | 320 | Light | [05-bets-open-320-light.png](05-bets-open-320-light.png) | `656791dd3954a7e8249c0fcd4ac6f93afe2f9e53956a4c28aa739e499e668d07` |
| 05 | Bets › Open | 390 | Light | [05-bets-open-390-light.png](05-bets-open-390-light.png) | `a0df08555b560d4401367797684190b6442ccd00a5536647a5cfd46db78b5c6a` |
| 06 | Confirm result sheet | 320 | Dark | [06-confirm-result-320-dark.png](06-confirm-result-320-dark.png) | `e929c6b545747c9515fcadb9161420fc44e371cb611bccdedaf955787cc42938` |
| 06 | Confirm result sheet | 390 | Dark | [06-confirm-result-390-dark.png](06-confirm-result-390-dark.png) | `9c0b90598881998c2a3f8fa79049e360b2147137eda95079ee3d5402b93551f5` |
| 06 | Confirm result sheet | 320 | Light | [06-confirm-result-320-light.png](06-confirm-result-320-light.png) | `347e843f65d92bc04da5e859d74f876e49b91285d7aa39702672d073ee77dff8` |
| 06 | Confirm result sheet | 390 | Light | [06-confirm-result-390-light.png](06-confirm-result-390-light.png) | `94a2329ec1d42bf7419cca708b7acc0bde631613961b3eb173e0c557a38ea741` |
| 07 | Bets › History | 320 | Dark | [07-bets-history-320-dark.png](07-bets-history-320-dark.png) | `ff0b957cbf8a1b0f45fb152e55bac2ead56e5a8688703ce6b7b9b444749a8a0e` |
| 07 | Bets › History | 390 | Dark | [07-bets-history-390-dark.png](07-bets-history-390-dark.png) | `a623cb59187cfab6c656c0cbb9fab63254498a0b5e0e5b5c1b4269fac629c585` |
| 07 | Bets › History | 320 | Light | [07-bets-history-320-light.png](07-bets-history-320-light.png) | `1c42928e88744179fe9ec2ea0db4cfd96960c9aa281a9ddc0356f6acb97ce8ad` |
| 07 | Bets › History | 390 | Light | [07-bets-history-390-light.png](07-bets-history-390-light.png) | `52e2048b2bf320cc723bffe254d8caece21476fd4ae4f9db8ce6987550de56b8` |
| 08 | Track bet sheet | 320 | Dark | [08-track-bet-320-dark.png](08-track-bet-320-dark.png) | `22164f414b4cb79dcaabbf5555cc5e71c5bf254d4c151f925d80375b6cb92667` |
| 08 | Track bet sheet | 390 | Dark | [08-track-bet-390-dark.png](08-track-bet-390-dark.png) | `83657cf8a2d6040da1e8281bb851d1821ca8211b5397e510dcc1e132b31f37a9` |
| 08 | Track bet sheet | 320 | Light | [08-track-bet-320-light.png](08-track-bet-320-light.png) | `6d32d8821a13487197f2ea93bcb619bede7364b18ab63009b8cf0e2628c3c2b1` |
| 08 | Track bet sheet | 390 | Light | [08-track-bet-390-light.png](08-track-bet-390-light.png) | `9a380626adb7985a3b36b7a711314dce4c7dafa3251386c066e495e7c041dfd4` |
| 09 | Play held card | 320 | Dark | [09-play-held-320-dark.png](09-play-held-320-dark.png) | `707baf176addc6d275fcdc295cfaf2341541f23f81c5b829c4609cce3f329646` |
| 09 | Play held card | 390 | Dark | [09-play-held-390-dark.png](09-play-held-390-dark.png) | `89f4264dce80c19e58a697e0e8ba85c008b63fde871befc55474f899aa1895e1` |
| 09 | Play held card | 320 | Light | [09-play-held-320-light.png](09-play-held-320-light.png) | `0fc99475e47141ea0d50b5aff321d0b9c0b361d118fb1de782f59674436f6bb7` |
| 09 | Play held card | 390 | Light | [09-play-held-390-light.png](09-play-held-390-light.png) | `dc1e34b82e571595bb384e9de9ec4f2e9bbd36129031122ef937903b8caf121a` |
