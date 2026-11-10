# NBA build-out — phone mockups for review

Owner: Sean Balsiger · November 10, 2026 · Proposal awaiting Sean's review.
Nothing here is built, applied, merged into the app or deployed.

Open [the review board](index.html) to switch screens, width (320 or 390 px)
and theme (Dark or Light). The written proposal is
[the NBA build-out spec](../../docs/superpowers/specs/2026-11-10-nba-buildout-design.md).

Evidence tags: **executed** (run and observed), **inspected** (read in source or
docs), **assumed** (not checked).

## Audit verdict: NBA is not fully built out

NBA v1 shipped October 22, 2026 (PR #167): a private ticket tracker with a daily
Games board, My Bets and History (inspected). It has been hidden from the sport
switch since October 29 and parked since November 6 (inspected). It never moved
into Prism Glass, and it has no game, scoring, standings, reminders or research
(inspected). No ticket has been saved through the app in production:
`bet_changes` has 0 rows (executed by the audit's read-only query and
re-counted read-only in review). The 10 tickets the app shows are the October
archive import (`nba_private.bets` has 10 rows; count only). The later milestones the October spec names (recommendations,
competitions, social sharing, Virtual Units, player-prop automation, Fantasy)
are not started (inspected).

## Recommended: NBA in Prism, then a nightly Guess the Spread on a capped line budget

- **N1 (mockups 01–09, Pages only, no migration, 0 credits).** NBA moves into the
  Prism shell with Home, Play, Bets and Research tabs; letters-only team badges;
  whole American prices; a "Needs your result" queue that suggests a result from
  BALLDONTLIE finals and saves only when you tap Confirm; the Track bet editor as
  a sheet; old `#nba/...` links land on their new place. NBA stays off the
  production switch (`NBA_ON_SWITCH = false`) until Sean says so.
- **N2 (no screens).** A worker stores the nightly slate and one capped
  Odds API spread read per game day (1 credit a call per the runner-up's check;
  not re-verified). NBA is always the lane that pauses first.
- **N3 (mockups 10–11, preview only).** Nightly Guess the Spread per game with
  the NFL GuessPicker and points formula, per-game D-31 reveal, Tonight, Week and
  Season standings.
- **N4.** Tonight moments, one opt-in reminder and rest chips. Not mocked here.

## Alternative: zero-credit nightly Pick'em (mockup 12)

If Sean gives NBA 0 Odds API credits: pick the straight-up winner, graded from
BALLDONTLIE finals only, 1 point per correct pick. N1 is unchanged. It costs $0
but has no hidden number to guess, and favorites win most nights (assumed).

## Judge scores

Not supplied to this step. The workflow's judge scoring for the recommended and
alternative directions was not passed into this task, so this record does not
state or invent any score. The recommendation cites a "runner-up" (tracker)
direction only for its per-call credit figures.

## Sean's questions

1. **Scope.** Build N1 first? For the game: Guess the Spread (recommended) or
   the zero-credit Pick'em (mockup 12)?
2. **Credit cap.** NBA's monthly Odds API cap (proposed 31, about one per game
   day) and the pause threshold (proposed 100 shared credits remaining)?
3. **Who plays.** Which accounts may play NBA Guess the Spread?
4. **Badges.** Approve the letters-only team badges (mockup 02), the original
   "NBA" text badge, and 44 px league circles below 360 px wide (mockup 01)?
5. **Unhide timing.** When should NBA appear on the sport switch?

Also waiting on Sean: every migration apply, deploy and schedule enable; one real
production save; the physical-iPhone check; and the stale Codex NBA worktree
(`private-nba-storage`, 15 uncommitted paths, last commit October 21; executed
read-only, untouched).

## How these were made

Rendered from the app's real shared components and stylesheets (inspected:
`Button`, `Card`, `Chip`, `Segmented`, `Pill`, `Rank`, `Avatar`, `Countdown`,
`LockLine`, `InfoButton`, `Sheet`, `Skeleton`, `Toast`, `TabBar`, `HomeBrand`,
`GuessPicker`, `WeekProgress`; `tokens.css`, `base.css`, `components.css`, the
shell, overview-frame, NBA, tracked-ticket, Prism Bets and Prism Play
stylesheets) in a local Vite preview, as the November 9 records did. Pieces the
proposal adds (`NbaTeamBadge`, the NBA text badge, the NBA top bar) are drawn in
the preview with existing classes and tokens only; no app source changed.
Sheets, dialogs and toasts are drawn in place so several states fit one capture;
in the app each appears alone over the page. Every game, score, ticket, line,
time and person is synthetic. No account, API, provider, hosted read or write
was used. The preview source is ignored local tooling (`.local/`).

Each capture is the full phone page. Checks per capture (executed; results in
[evidence.json](evidence.json)): no sideways page scroll; every visible control
at least 44 px; no text under 12 px; no text outside the viewport; no clipped
text or control; the last control above the floating tab bar. All 48 captures
passed, with zero page errors, console errors, external requests or non-GET
requests. A negative run with an injected 11 px font, 30 px buttons and a
clipping container reported all three faults, so the checks do catch them
(executed). PNGs were recompressed losslessly; decoded pixels were compared
equal for every file (executed).

Findings from the checks (executed): three 52 px league circles do not fit
beside the G and avatar below 360 px wide, so the mockups use 44 px circles
there (question 4). An early draft let the date chips scroll at 320 px and
showed a header row clipped inside a bordered demo; both were fixed before
these captures.

Independent review corrections (executed; mockups 04 and 10 re-captured at both
widths and themes with the same checks, all passing): the Yesterday / Today /
Tomorrow date chips now select with Prism's outline, tint and check instead of
a solid lime fill, matching the approved glass controls in
`web/src/next/play/prismPlay.css`; and the Tonight preview now shows 1 locked,
3 drafts and 1 open with "Lock in all 3", so the lock-all button and dialog
count only unlocked drafts instead of offering to lock all 5 games when 2 were
already locked.

Physical-iPhone acceptance, real data, hosted behavior and Sean's approval are
not claimed.

## Captures (SHA-256)

| # | Screen | Width (px) | Theme | File | SHA-256 |
|---|---|---|---|---|---|
| 01 | Sport switch | 320 | Dark | [01-sport-switch-320-dark.png](01-sport-switch-320-dark.png) | `a5415a4826a9966efa507d16608f85565afddaa5ebf5a3b99b6117eef40a9d22` |
| 01 | Sport switch | 390 | Dark | [01-sport-switch-390-dark.png](01-sport-switch-390-dark.png) | `a1eb45314083a41fd0646944538cf20d456cf39162c542222d0e0464384ca380` |
| 01 | Sport switch | 320 | Light | [01-sport-switch-320-light.png](01-sport-switch-320-light.png) | `1e13d256ede46e22fd45eebde8dc5418497cf060b539ea5eccb246b0ee7a3ed5` |
| 01 | Sport switch | 390 | Light | [01-sport-switch-390-light.png](01-sport-switch-390-light.png) | `bbced8d459f20253820db1c3794c5cc676db7e6465ec9c157f45874be6e1c69a` |
| 02 | Team badge sheet | 320 | Dark | [02-team-badges-320-dark.png](02-team-badges-320-dark.png) | `091f356746cc9e805066359e56867e73415a6ebfbe895affd7b34e27c8237378` |
| 02 | Team badge sheet | 390 | Dark | [02-team-badges-390-dark.png](02-team-badges-390-dark.png) | `b2e6f4d1fc370c1f50bd811691dc48f6719799595752a97afc7c6fb35f2a1c58` |
| 02 | Team badge sheet | 320 | Light | [02-team-badges-320-light.png](02-team-badges-320-light.png) | `1f50c3e2d42e094c98fc3cd66d5f0ee5627c230eb9bbccdf76bd4b743f50d561` |
| 02 | Team badge sheet | 390 | Light | [02-team-badges-390-light.png](02-team-badges-390-light.png) | `f8ed856ee0fb420b5774ffefd4883c480cfba1d96a684730c6febab7aff329cc` |
| 03 | NBA Home | 320 | Dark | [03-home-320-dark.png](03-home-320-dark.png) | `d0a65096351cdd08b5c59c0fa9974df785c20e26bd2deb6b7ce4e41c78e43b09` |
| 03 | NBA Home | 390 | Dark | [03-home-390-dark.png](03-home-390-dark.png) | `e98a9b0e414bf818918ff3ea1ad0ba4678f4d17915527848c7bddd7e02294555` |
| 03 | NBA Home | 320 | Light | [03-home-320-light.png](03-home-320-light.png) | `9db89989f52b8a4d57836e0c7348b698cf0e4ef70bfd383ea5315bdbf52f4680` |
| 03 | NBA Home | 390 | Light | [03-home-390-light.png](03-home-390-light.png) | `d0ccf9a843bab47542e8bde70215cfe4c884c83f56fd252c187d6ee659adc245` |
| 04 | Research › Games | 320 | Dark | [04-research-games-320-dark.png](04-research-games-320-dark.png) | `e1a8987119fb09e0b0f7e467b00af83fcbfc73b6d50a36aef2b84b9c6f81d9f2` |
| 04 | Research › Games | 390 | Dark | [04-research-games-390-dark.png](04-research-games-390-dark.png) | `e972c0282519d63737315406f54c76308acaeb3e15edf0ba67341d9d638decbf` |
| 04 | Research › Games | 320 | Light | [04-research-games-320-light.png](04-research-games-320-light.png) | `f883b0e40fdca37ebfdda2af9ddc2cf6d5a26dcf47ad1b9d8c88f40cdaf07f95` |
| 04 | Research › Games | 390 | Light | [04-research-games-390-light.png](04-research-games-390-light.png) | `25567d0cbafa23016d91bdb8d8285fa5fbf2caaeb92370cdcf5808ae76dffc83` |
| 05 | Bets › Open | 320 | Dark | [05-bets-open-320-dark.png](05-bets-open-320-dark.png) | `630b5af004fd1a74d056a5f61c8ab14682270245fe8d41ecc44c06fbce821aa6` |
| 05 | Bets › Open | 390 | Dark | [05-bets-open-390-dark.png](05-bets-open-390-dark.png) | `94a2b5476ea63d3e26201cfc4464d01ee028744129f9dcb953991fdd62fe7b68` |
| 05 | Bets › Open | 320 | Light | [05-bets-open-320-light.png](05-bets-open-320-light.png) | `cbfcc2b94ff269b529e7d6343e70fa6e477cbb58610f435412aa12f2e7cc0018` |
| 05 | Bets › Open | 390 | Light | [05-bets-open-390-light.png](05-bets-open-390-light.png) | `8a192760ab6446301d3642f9bf4917de9e4d4cf9c0398bb901354ec67e23be0d` |
| 06 | Confirm result sheet | 320 | Dark | [06-confirm-result-320-dark.png](06-confirm-result-320-dark.png) | `865b608386885e944d8cf3f94f45f59e4b9c2c5c442db1ba9a8c55428241a394` |
| 06 | Confirm result sheet | 390 | Dark | [06-confirm-result-390-dark.png](06-confirm-result-390-dark.png) | `bbd586207e919bcd5a7d68c6a11883421a764ebef18d257e13673c9089e6d534` |
| 06 | Confirm result sheet | 320 | Light | [06-confirm-result-320-light.png](06-confirm-result-320-light.png) | `25527fbba3ca68d3dfb500944b2200fb4fc0f69859220800d4b5be86635b86fa` |
| 06 | Confirm result sheet | 390 | Light | [06-confirm-result-390-light.png](06-confirm-result-390-light.png) | `8904a5ab8f9d140f25a791d6c79f10a1627a6d9a14b88de4801f04969794d5f1` |
| 07 | Bets › History | 320 | Dark | [07-bets-history-320-dark.png](07-bets-history-320-dark.png) | `796b6dc1d499a74086aefea8351f51a949e727fcf3d2120b5cb8144f4e458b20` |
| 07 | Bets › History | 390 | Dark | [07-bets-history-390-dark.png](07-bets-history-390-dark.png) | `676b7891d0185d65612e4675cfc456a59a382a90ca7851b0caa5b4f9d0f98aa1` |
| 07 | Bets › History | 320 | Light | [07-bets-history-320-light.png](07-bets-history-320-light.png) | `29c221d87cb1bd0e860f749ca58abe901d246c8db2da794047d81190032ae190` |
| 07 | Bets › History | 390 | Light | [07-bets-history-390-light.png](07-bets-history-390-light.png) | `50100ec22a720d402e9805bc554bb2d2badb637dc3deddf470c06be5b20bfeed` |
| 08 | Track bet sheet | 320 | Dark | [08-track-bet-320-dark.png](08-track-bet-320-dark.png) | `d7c8d54ec690d55bc2a0656d7e08027c33a8ace54511394d06d2c3afdc0901b1` |
| 08 | Track bet sheet | 390 | Dark | [08-track-bet-390-dark.png](08-track-bet-390-dark.png) | `f54b4a1dec326193a0c86ecc183c63283c298987f98a129981689505e236d5e6` |
| 08 | Track bet sheet | 320 | Light | [08-track-bet-320-light.png](08-track-bet-320-light.png) | `e718b0944240f5e039c6efe7e79ae81af15e2e72d6943d1f6337e2721887938e` |
| 08 | Track bet sheet | 390 | Light | [08-track-bet-390-light.png](08-track-bet-390-light.png) | `453435098294569ba8081ff8844bbab425b70c69fba43f4fd21bd0473baf34db` |
| 09 | Play held card and legacy links | 320 | Dark | [09-play-held-320-dark.png](09-play-held-320-dark.png) | `cb2b79b8d8c1361f01f76b8eee4969efc8a833670794428c69d2bee2c59db999` |
| 09 | Play held card and legacy links | 390 | Dark | [09-play-held-390-dark.png](09-play-held-390-dark.png) | `195118e4f3b2668a7a11ff0b26fb5313e03bd46640cb08dbe2fa395ca27e514f` |
| 09 | Play held card and legacy links | 320 | Light | [09-play-held-320-light.png](09-play-held-320-light.png) | `86290e02a48c597d9f1ee9e3e5125b29b35e586f814b29cfb5694291c3a708fd` |
| 09 | Play held card and legacy links | 390 | Light | [09-play-held-390-light.png](09-play-held-390-light.png) | `ead47268c3cd48bf0694751bf5550b4ecf79e03e19713749f0cb664e9b0d19b0` |
| 10 | Preview · Play › Tonight | 320 | Dark | [10-n3-tonight-320-dark.png](10-n3-tonight-320-dark.png) | `fd73149ff2797c5e80373001226893d16fa70c46860b61da7f4a276509ab5c06` |
| 10 | Preview · Play › Tonight | 390 | Dark | [10-n3-tonight-390-dark.png](10-n3-tonight-390-dark.png) | `fc343883105bdc9c9bf169e2c5bfad27a060b4768745b90d8367adb79b940394` |
| 10 | Preview · Play › Tonight | 320 | Light | [10-n3-tonight-320-light.png](10-n3-tonight-320-light.png) | `6ddb7a19b7923ad4315410f627e9e09880bd67ac37f7f2ae7ae43375f86e2b46` |
| 10 | Preview · Play › Tonight | 390 | Light | [10-n3-tonight-390-light.png](10-n3-tonight-390-light.png) | `325f3b6af2629ddba4dc76e8e1c279b304d4f5a16cb63d7ac9d3b7c271e32c57` |
| 11 | Preview · Play › Standings | 320 | Dark | [11-n3-standings-320-dark.png](11-n3-standings-320-dark.png) | `f67e6b7b651955c99a3afcd842171707ba17a0c864b4a321ceab1d9752a4ffdc` |
| 11 | Preview · Play › Standings | 390 | Dark | [11-n3-standings-390-dark.png](11-n3-standings-390-dark.png) | `63ccb4a387313364ac2e66f2beb8a90fd6e862eae4144639a10c9fbb5240c1c8` |
| 11 | Preview · Play › Standings | 320 | Light | [11-n3-standings-320-light.png](11-n3-standings-320-light.png) | `bf032e1e58cface77961a76f2c2f4b61b08ca623f6e6567df58021197bb462ac` |
| 11 | Preview · Play › Standings | 390 | Light | [11-n3-standings-390-light.png](11-n3-standings-390-light.png) | `1302c1445a65cef55e69d31e510b17a76c3ae8c4f76bd2e97825c8660380d487` |
| 12 | Alternative · Pick’em | 320 | Dark | [12-alt-pickem-320-dark.png](12-alt-pickem-320-dark.png) | `e12b6a66cd9acec5ed3074566ebbd8713418c40e63dc9c9e97d6c6731fca7d6c` |
| 12 | Alternative · Pick’em | 390 | Dark | [12-alt-pickem-390-dark.png](12-alt-pickem-390-dark.png) | `b82998728736bdaeb602c32fe35315f2939173ab9caa50acb096f01aaf20cb9a` |
| 12 | Alternative · Pick’em | 320 | Light | [12-alt-pickem-320-light.png](12-alt-pickem-320-light.png) | `89dfcc049e7cd2b46ed5b17bc2f94417e5ed72b00b29a930f792d263f40f0c57` |
| 12 | Alternative · Pick’em | 390 | Light | [12-alt-pickem-390-light.png](12-alt-pickem-390-light.png) | `6877cbe70fcde6c793265e16cb4503b37fbb1aa357102bd1ff6c70becd572a51` |

## What each screen shows

1. **Sport switch** (N1). Original NBA text badge in the 52px league circle: selected, unselected, keyboard focus, the hidden production default and the narrow-screen size.
2. **Team badge sheet** (N1). All 30 teams as letters-only glass circles at 48, 32 and 24 px; the 13 codes shared with NFL; trademark notice and BALLDONTLIE source line.
3. **NBA Home** (N1). Tonight card, Needs your result queue, This month net and the Play-coming card; loading, empty day, empty account, read error, stale and 401.
4. **Research › Games** (N1). Date chips and picker; In progress, Scheduled and Final groups; LIVE only when in progress; loading, empty date, error keeping the last board, cached vs observed, cooldown, postponed.
5. **Bets › Open** (N1). Private tickets in the Prism receipt with whole American prices and result chips; loading, empty account, empty filter, error, paging.
6. **Confirm result sheet** (N1). Final score, graded leg, suggested outcome and prefilled reason; overtime note, three no-suggestion cases, saving, saved, uncertain recovered by receipt, 409 and error with values kept.
7. **Bets › History** (N1). Filters, filtered totals, an expanded ticket with legs, original Novig price and correction history; loading, filtered empty, error, paging.
8. **Track bet sheet** (N1). BetEditor as a sheet: single, 3-leg parlay, American vs Novig, review step, saving, saved, uncertain, 409, correction reason required and the leave guard.
9. **Play held card and legacy links** (N1). The held Play card, an old #nba/bets address landing on #nba/bets/open, and the full link map.
10. **Preview · Play › Tonight** (N3 preview). Guess the Spread per game in the approved Play draft layout; saved draft, locked pending, locked and scored, tipped-off draft, no line, postponed, lines paused, and both lock dialogs.
11. **Preview · Play › Standings** (N3 preview). Tonight, Week and Season standings with ties and no-guess rows; week final, empty, error, stale; the game layer after tip-off and before your lock.
12. **Alternative · Pick’em** (Alternative). Recommended Guess the Spread card beside the zero-credit Pick’em card; draft, locked, revealed split, awaiting final, final Right and Wrong, postponed void.
