# Player Props — production captures (flag on, local build)

Date: November 10, 2026. Scope: the six approved Player Props boards in the parent
folder ([README](../README.md), [manifest](../manifest.json)), compared with the
implemented screens, plus the History and shared-guess views this change adds
using existing approved patterns.

**How these were made.** `GTL_PROPS_CAPTURE=1 npx playwright test --config
playwright.player-props.config.js` (local Chromium) builds the app with
`VITE_GTL_PLAYER_PROPS=on` and runs `tests/cloud-browser/player-props-on.spec.js`
against the real gtl-api handler with `GTL_PLAYER_PROPS=on`, every repository
migration (including the unapplied D-82 files) on local PGlite and
`gtl_prop_capability.live_lock_in` set true in that disposable database only
(`tests/cloud-browser/player-props-world.mjs`). No hosted request, Supabase
project, provider call or deployment was involved. Every guess, line, final stat
and player besides the CeeDee Lamb identity is a **synthetic fixture value**,
chosen to reproduce the boards' illustrative figures (receiving misses 6/5/2/3/4,
average 4.0 yd; reception misses 1/0.5/0.5/0/1, average 0.6; paper 5–2–1 with 2
awaiting finals). The fixture's "three-book" lines are not bookmaker quotes.

Each state is captured in Dark and Light at 320 and 390 px wide. The viewport is
grown to the full content height (as the approved boards show it) so the shared
floating bottom bar sits at the end. Before every capture the spec asserts: no
layout problems (`tests/helpers/phone-layout.mjs`), no horizontal scroll, 44px
targets for the prop controls, no segmented label broken inside a word, the last
control above the bottom bar, and axe WCAG 2.1 AA clean. The default (flag-off)
build is checked separately by `tests/cloud-browser/player-props-dark.spec.js`:
no Player Props control, `/props` request or prop chunk appears anywhere.

| Board | Captures |
| --- | --- |
| 01 Entry | `01-entry-*` |
| 02 Locked pick | `02-locked-*` (with other players' guesses, opened by your own lock-in), `02-receipt-*` (saved receipt opened) |
| 03 Accuracy | `03-accuracy-*` |
| 04 Paper record | `04-record-*` (custom range W1–W4) |
| 05 Draft recovery | `05-recovery-*` (a real refused lock: no qualifying reference) |
| 06 Missing/loading/error | `06-no-props-*`, `06-no-guesses-*`, `06-loading-*`, `06-error-*` (separate states) |
| History (existing pattern) | `history-props-*`, `history-props-week-*` |

## Deviations found and fixed

1. Draft recovery (05) never appeared in the real app: the client dropped every
   `GTL_PROPS_*` error code (`web/src/apiResponse.js`), so a refused lock showed a
   plain notice. The public prop codes are now kept; recovery opens as approved.
2. Athlete stats arrived in storage order (Receiving TDs first); they now follow
   the catalog order shown on 01 (yards, receptions, TDs). Choosing an athlete
   again opens their first stat not yet locked instead of the locked one.
3. The athlete line read "DAL · WR · DAL at PHI"; it now leads with the full team
   name as on 01/02/05 ("Dallas Cowboys · WR · TB at DAL"; no jersey number is in
   the verified data).
4. The search field showed a visible label and a long placeholder; it now matches
   01 (person icon inside, "Find an athlete"), with an accessible name kept.
5. The guess card lacked 01's help button; it now uses the shared ⓘ InfoButton.
6. The chosen stat chip now takes its own row as on 01; the extra "All athletes"
   button under the lock (not on 01) is removed: changing position or search
   returns to the list.
7. The direct numeric editor stayed open after typing; it now closes on Enter or
   leaving the field with a valid number, so the card reads as on 01.
8. The line under Your guesses was fixed text; it now follows the state as on
   01/02/05 ("Optional · …", "Player Props · your saved pick", "Your draft is safe
   · not locked in").
9. "Locked in" / "Editable draft" were uppercase micro labels; 02 and 05 show
   sentence case.
10. 02's saved receipt was a plain list; it now uses the Spread/Total receipt
    layout (`ScoreReceipt` + `PickScorecard` pattern) with the prop's athlete,
    stat, unit, event, saved three-book median, miss, comparison axis and the
    source time visible, books and times behind ⓘ.
11. 04's win rate sat beside the ring; it is now inside the ring with the divider
    above the graded/awaiting row, as approved.
12. 06's "No verified props" record state lacked "Check available props" and
    said "Spread and Total records remain available"; it now reuses the approved
    card. The no-guesses card gained "Choose an available prop" (opens Play on
    Player Props) and the loading card its refresh icon.
13. The accuracy bars were list items inside an image role (axe `listitem`
    failure); they are now presentational parts of one named picture.
14. At 320 px the four-option Bets market control broke "All", "Spreads" and
    "Totals" inside words; the segments keep whole words on tighter padding.

## Remaining, intentional differences

- The app's approved frames are kept, as the spec requires: Play shows the D-70
  nesting card (Back, Your score, the "Play" lip and "Player Props" title) and
  Bets its header and view switch above the boards' content; the boards used a
  simpler preview header.
- 04 keeps "Back to accuracy" and an in-page "Your Gap paper record" heading so
  the record has a way back; the board drew that title as the page title.
- 02 adds "Everyone's guesses" (other players' locked guesses) in the existing
  shared-picks row pattern, shown only after your own lock-in of that exact
  athlete and stat, or at kickoff.
- Shared components keep their app styling (Segmented selection fill, ⓘ icon).

## SHA-256

| File | Size (px) | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `01-entry-dark-320.png` | 320×1405 | 191517 | `a88b2190af4e4453ff214116a2fe99fd79e08ea77655139e03e142540be13705` |
| `01-entry-dark-390.png` | 390×1377 | 202764 | `5b52bc5dca484a49e232665d9e7cc3fe0f7ed22ca83a7a8d1b417faab5e51338` |
| `01-entry-light-320.png` | 320×1405 | 194447 | `ba91b70377f17662a6ba10796063ed2e0941b58c1a67beafacc1dbc5cd4b5604` |
| `01-entry-light-390.png` | 390×1377 | 208064 | `f2e2fae156e8d02e072518f33aa620164f1e48cc9dec32abf2e339ed78636800` |
| `02-locked-dark-320.png` | 320×1724 | 230223 | `3a78a8c2a89dc85117ef42179e813d958e5f1d74de926a9abbc4bd93c06b6ccc` |
| `02-locked-dark-390.png` | 390×1628 | 235563 | `bd62d4b19eb755ed4152103253431f6c880346572b194fc6c3630c9447e91350` |
| `02-locked-light-320.png` | 320×1724 | 244426 | `86d08935d3ac58a46db7ab7e5293bf84769de57707153d02e1bd6558420a5785` |
| `02-locked-light-390.png` | 390×1628 | 249902 | `392ce738e845db51891bd7b9a04edf19e82497228c363edec19025bcd0b70204` |
| `02-receipt-dark-320.png` | 320×2602 | 314717 | `51429960361539bac5f63b963d21d21a81d21f181844fee0a25811e09aff0cb6` |
| `02-receipt-dark-390.png` | 390×2439 | 323547 | `57cd9161d814c0b4695e9f784c4fd552cc5606f120473d6297643aa143f98d79` |
| `02-receipt-light-320.png` | 320×2602 | 329863 | `74e2e71ef08ab957c0cd2f56789a90175de1ed0bdff4c77a450dbb9a3ea0bfc3` |
| `02-receipt-light-390.png` | 390×2439 | 337662 | `95aef5c0b88a10f7b1b602d99aef9e3d089b78e37afed2c389ca62c933bc8e9b` |
| `03-accuracy-dark-320.png` | 320×1837 | 226348 | `388f4e63e15ba63ffe5c0a92ddbd2e96ac45f37fe638f890972a0e216b2945e6` |
| `03-accuracy-dark-390.png` | 390×1409 | 220121 | `83feacf7e3663184d343d94b0f21a67579cff4c0314b60b55da31bf2b83b5197` |
| `03-accuracy-light-320.png` | 320×1837 | 241981 | `6f1d9600e7b8fd0a296319b714a2961e43f407f229ea4362f9d2b588876f0b3f` |
| `03-accuracy-light-390.png` | 390×1409 | 233571 | `115216b4abdc6cc2cff924843751b600a3110962c6bd9f6f6315ff635453569a` |
| `04-record-dark-320.png` | 320×1822 | 224510 | `bc657b079701c623899d8369f9e9f67394e97936a53346facd02371a0ae95ea2` |
| `04-record-dark-390.png` | 390×1673 | 232269 | `b8a25213e643399de3a97b9e1a8e3bbb98a6a11de2342fa540d2d1c7e1dcf14e` |
| `04-record-light-320.png` | 320×1822 | 239660 | `401545aebe9e1dbff3d80e0714e13027453df1dfc69236234383b68a98b66925` |
| `04-record-light-390.png` | 390×1673 | 251266 | `8e0f9e0639674dc4ae8af4eac6438f404550762c64ff89b0c34ccb11d4e49733` |
| `05-recovery-dark-320.png` | 320×1385 | 195480 | `6afb8414e7fd96b678cfd247d0dc9c52a8cf69285a1f2dd81a6ac3d29c31b95b` |
| `05-recovery-dark-390.png` | 390×1325 | 204984 | `49465539fd15cdc239d2e33813f1b6895d73463e039d57ca48993db958b1bfdc` |
| `05-recovery-light-320.png` | 320×1385 | 204972 | `0257acbce2c109dc85be873a93cb1f98105e5c1c7c810e71d521b7de5b03f5d6` |
| `05-recovery-light-390.png` | 390×1325 | 217289 | `04a8d235d8f970140b95ab25593e96b0b71294007148b6fa9386e1b5eeb074b8` |
| `06-error-dark-320.png` | 320×922 | 139085 | `4c23b571cc61ddd4934da4ca73650526139e9fd9feaebb91086bbced2dca7b1a` |
| `06-error-dark-390.png` | 390×902 | 146668 | `427aac283298731841a44e6ae686bc1053c048615fbea4ff6dbef786962964ff` |
| `06-error-light-320.png` | 320×922 | 147528 | `9853fcda2ada0fffc3a71f3279a10bdf34b1769ef64e02f710cb969291a135e0` |
| `06-error-light-390.png` | 390×902 | 156819 | `db6ecd808e82aa3f55032fa17d5869662394a73aaa0555432ff79f749957149f` |
| `06-loading-dark-320.png` | 320×929 | 130651 | `fc09ca6b1c00b87f64417b671d693dd9b0ee6fa1d148338918edb3251300760e` |
| `06-loading-dark-390.png` | 390×890 | 137344 | `55750dd4b636a86fd0b88c02c835cf9fcb234cb1c9f83f9cd706610c61516abd` |
| `06-loading-light-320.png` | 320×929 | 137816 | `293f1e5b9420b945e069c23142f55876e8ae43e68f2b4b4504a021b3ce68813d` |
| `06-loading-light-390.png` | 390×890 | 146009 | `73d0bb0fea813b5eba3285622df8e1e1b48d5c884ec133b1ddbe83211f0cff71` |
| `06-no-guesses-dark-320.png` | 320×1314 | 178705 | `1851b5d39fec9f5e6c2f10eaac01fcc3ab6fddf971bd5ccda22ddb1df410864a` |
| `06-no-guesses-dark-390.png` | 390×1137 | 183021 | `16a44a2a7cbf463d40346ff4d22c84c25226900f912e42ea3cce289c1b30f6b9` |
| `06-no-guesses-light-320.png` | 320×1314 | 190792 | `e79f7fc85226b052ec9e73bb679784b7e76462ca85402a08a3fd73ffbfaf711b` |
| `06-no-guesses-light-390.png` | 390×1137 | 195144 | `555b1d2f36741e637f00387852b21b4bb22a700114e8f87ad05593205373b117` |
| `06-no-props-dark-320.png` | 320×962 | 145372 | `53d977dff4467a3d805e5b604e66e21d911ed391c11b564ab259b5f6c6005435` |
| `06-no-props-dark-390.png` | 390×918 | 151899 | `3be566af4a4c1ff56c7feeb4c6a1728989cddef8d7bb261b5c9f1ea61d48aa96` |
| `06-no-props-light-320.png` | 320×962 | 153867 | `4b0ef7141be750e219ff351ef81b7c249aaf6d2751c674cfb8edc094b788f893` |
| `06-no-props-light-390.png` | 390×918 | 162563 | `4a16c4a0a4aee96dfce9128e8bc4433d9bfd9b37cd5468a1977fe008972c04bb` |
| `history-props-dark-320.png` | 320×1754 | 206466 | `34dcc844536b83315f485eaa0d3fddcfb3b5415a5e9b4dbd591bc7c4e98d0bc9` |
| `history-props-dark-390.png` | 390×1455 | 214717 | `5643377b38d2eef980a1516d3533b32be5fc22ae11d6deefd6edf8ec881bd470` |
| `history-props-light-320.png` | 320×1754 | 212125 | `8070e069e26700f61bfc065e83e4424e3e56123de95c703a0dfe5729497828f4` |
| `history-props-light-390.png` | 390×1455 | 217792 | `2a66e4877051bad10c35ced920628e9a20c0820c1f12530e1aede5793c6358c0` |
| `history-props-week-dark-320.png` | 320×2403 | 287709 | `c90e8a74521fb9c1f0863e23134f73dfffa18e65e1518e4783aa6a0481572514` |
| `history-props-week-dark-390.png` | 390×2259 | 303472 | `887f402992d06a7b3be2a8be2f8417e627d3df4467bb52032445320349d2797b` |
| `history-props-week-light-320.png` | 320×2403 | 295605 | `269ad1cb3647cf1d109ce1dbc8ebf6943dab8c2baf7f0a11d1b9749d5ebc4c63` |
| `history-props-week-light-390.png` | 390×2259 | 313138 | `eecd5b8a42c173cba48e5d704ed974528a6fda7798b68dd4b9998f86fdad4ce3` |
