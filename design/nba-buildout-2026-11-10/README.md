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
  Odds API spread read per game day (1 credit a call per the tracker direction's
  check; not re-verified). NBA is always the lane that pauses first.
- **N3 (mockups 10–11, preview only).** Nightly Guess the Spread per game with
  the NFL GuessPicker and points formula, per-game D-31 reveal, Tonight, Week and
  Season standings, and each team's W–L beside its badge (D-62), counted from
  stored BALLDONTLIE finals with no extra provider call.
- **N4.** Tonight moments, one opt-in reminder and rest chips. Not mocked here.

## Alternative: zero-credit nightly Pick'em (mockup 12)

If Sean gives NBA 0 Odds API credits: pick the straight-up winner, graded from
BALLDONTLIE finals only, 1 point per correct pick. N1 is unchanged. It costs $0
but has no hidden number to guess, and favorites win most nights (assumed).

## Judge scores

The workflow's judge scored three directions. The scores are as the workflow
supplied them (not re-run here); each reason is this record's plain summary, not
the judge's wording.

| Direction | Score | Used here as | Reason |
|---|---|---|---|
| Parity-first | 7/10 | The recommended basis | NBA gets the Prism shell and the same Guess the Spread the league already plays in NFL, for about one capped credit a game day. |
| Social-first | 6.5/10 | Its zero-credit Pick'em is the alternative (mockup 12) | It costs nothing, but picking winners has no hidden number, so players separate slowly. |
| Tracker-and-research-first | 5/10 | Source of the per-call credit figures only | It polishes a private tracker that has no saved ticket yet (`bet_changes` 0) and adds no shared game. |

## Sean's questions

1. **Scope.** Build N1 first? For the game: Guess the Spread (recommended) or
   the zero-credit Pick'em (mockup 12)?
2. **Credit cap.** NBA's monthly Odds API cap (proposed 31, about one per game
   day) and the pause threshold (proposed 100 shared credits remaining)?
3. **Who plays.** Which accounts may play NBA Guess the Spread?
4. **Badges.** Approve the letters-only team badges (mockup 02), the original
   "NBA" text badge, and 44 px league circles below 360 px wide (mockup 01)?
5. **Unhide timing.** When should NBA appear on the sport switch?
6. **Team records.** Records come only from stored BALLDONTLIE finals, with no
   extra calls, and stored finals may not reach back to opening night; without
   a backfill most teams would show "—" this season (assumed; stored dates not
   counted). Allow one free backfill of the earlier game days (a few Games
   requests, once, through the existing lease and 35 s cooldown)?

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
stylesheets, and the D-62 `ui/matchup.css`) in a local Vite preview, as the
November 9 records did. Pieces the proposal adds (`NbaTeamBadge`, its matchup
with records on pick cards, the NBA text badge, the NBA top bar) are drawn in
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
`web/src/next/play/prismPlay.css`; and the Tonight preview's lock-all button
and dialog count only unlocked drafts instead of offering to lock games that
were already locked (the counts changed again in the second review below).

Second review corrections (executed; mockups 01, 02, 03, 04, 05, 09, 10 and 12
re-captured at both widths and themes with the same checks, all passing; the
other 16 PNGs are byte-identical):

- **One slate.** Every board shows the same moment: Tuesday 6:44 PM PT, with the
  board observed at 6:42 PM PT. PHI @ MIA and OKC @ SAC (overtime) tipped at
  4:00 PM and are final; DEN @ MIN tipped at 5:30 PM and is in the 2nd quarter;
  BOS @ NYK and DAL @ PHX (7:00 PM) and LAL @ GSW (7:30 PM) are still to come.
  Home's first tip (4:00 PM PT) is the earliest game, the Research board shows
  all six games (so every team in the Play preview is on it), and mockup 02's
  observed line uses the same time.
- **Home matches Bets.** Open tickets reads 4 · 3.6 U pending, the four
  Bets › Open tickets (1 + 1.1 + 1 + 0.5 U). This month reads +1.38 U ·
  8 settled, History's November totals before the 76ers result is confirmed.
  The typed-matchup ticket is now Monday's Spurs at Rockets, so nothing in the
  queue waits on a game that has not tipped off.
- **Records (D-62).** The Guess the Spread and Pick'em cards (10, 12) show each
  team's W–L under its code, in the NFL Play card's `Matchup` stack layout;
  Pick'em result cards show it beside each code. Cards after a final count it.
- **Locked Pick'em.** A locked card shows Locked in only, with no LOCKS IN
  countdown. Its line now reads "Picks so far · BOS 4 · NYK 2", because your own
  lock opens others' locked picks (D-31); it had said they reveal at tip-off.
- **Legacy-link landing (09).** The selected tab uses the same lime tint and edge
  as 05 and 07 (computed styles compared equal in both themes).
- **Tonight (10).** 3 of 6 locked (the three games already tipped off) and
  3 drafts, with Lock in all 3 for BOS @ NYK, DAL @ PHX and LAL @ GSW.

Physical-iPhone acceptance, real data, hosted behavior and Sean's approval are
not claimed.

## Captures (SHA-256)

| # | Screen | Width (px) | Theme | File | SHA-256 |
|---|---|---|---|---|---|
| 01 | Sport switch | 320 | Dark | [01-sport-switch-320-dark.png](01-sport-switch-320-dark.png) | `b70cc9bbd12e6fa4d7aa6dd1ab7a995c0ad0bd9991687cd58b4ef53d2738c660` |
| 01 | Sport switch | 390 | Dark | [01-sport-switch-390-dark.png](01-sport-switch-390-dark.png) | `3973667d0b62ce410b477b0a7d8a0cf46a757b468e19a3178db0645c9e3d1f43` |
| 01 | Sport switch | 320 | Light | [01-sport-switch-320-light.png](01-sport-switch-320-light.png) | `13c5848b4d3dd679c9e07f8c0d3338cca2e3cadd2eaafed628b43cda36276b9b` |
| 01 | Sport switch | 390 | Light | [01-sport-switch-390-light.png](01-sport-switch-390-light.png) | `b3016bf6f7429f267dfc736bdd733f5bd36d5e9b405dc2e1f17c8a6ba2c4d564` |
| 02 | Team badge sheet | 320 | Dark | [02-team-badges-320-dark.png](02-team-badges-320-dark.png) | `bb78a0d0fbeb7102ec8262d8d2e8ba843484a0799e21bf6f35783dccd585e683` |
| 02 | Team badge sheet | 390 | Dark | [02-team-badges-390-dark.png](02-team-badges-390-dark.png) | `244e8f0866c3d92a45e94d9b645371360e4379e2ba4c02dc7cd42b7800e4f18b` |
| 02 | Team badge sheet | 320 | Light | [02-team-badges-320-light.png](02-team-badges-320-light.png) | `10079b30eacc0cc0d753b564cf516d5f6cf0d54870d56681b9d80df4680bc24e` |
| 02 | Team badge sheet | 390 | Light | [02-team-badges-390-light.png](02-team-badges-390-light.png) | `00bf450831d08e8311f0801ff9feccbf388b4298c1904cd566e0a7ab03a0627c` |
| 03 | NBA Home | 320 | Dark | [03-home-320-dark.png](03-home-320-dark.png) | `e20096ca93916ab729653805b3160886d0a409c0cc6fde3214d24099adb6d663` |
| 03 | NBA Home | 390 | Dark | [03-home-390-dark.png](03-home-390-dark.png) | `73f2ea03f682af80b81967ca675de2c87fe75c407cd5e3c937b35587613457f2` |
| 03 | NBA Home | 320 | Light | [03-home-320-light.png](03-home-320-light.png) | `e60be0a364bfc9fdb26658014274fe49b1b9e8323131f43e9fa8f12597aaf6a0` |
| 03 | NBA Home | 390 | Light | [03-home-390-light.png](03-home-390-light.png) | `63148591ee938f4f86671f6dd0099ce688dc83f501e418a22b14961179969c06` |
| 04 | Research › Games | 320 | Dark | [04-research-games-320-dark.png](04-research-games-320-dark.png) | `f62728fb133f4318c1ef3740b2a5b8b185f3509b27bd4dc5e4ab8325e0171ac2` |
| 04 | Research › Games | 390 | Dark | [04-research-games-390-dark.png](04-research-games-390-dark.png) | `a86e61d5d163b7998adbcb804371fdb3b4ce986c95a5c72d45008047b9cd43fd` |
| 04 | Research › Games | 320 | Light | [04-research-games-320-light.png](04-research-games-320-light.png) | `71b047132abc31f71ea06eaf6d21cfe7aa2d2962162c1503c8df5b875339d76c` |
| 04 | Research › Games | 390 | Light | [04-research-games-390-light.png](04-research-games-390-light.png) | `6c35f38f55b3891470a7556eacb21906cd5f5c8edf47fd7b873c172fb5600e0c` |
| 05 | Bets › Open | 320 | Dark | [05-bets-open-320-dark.png](05-bets-open-320-dark.png) | `8dd6f8eab0e2c7b11c5e8bcf3c81cc70eaabda047f0778efe83135cd7c34a303` |
| 05 | Bets › Open | 390 | Dark | [05-bets-open-390-dark.png](05-bets-open-390-dark.png) | `95b23520ae63723614feff870a9465ea184a0e8cdbdb1089d238c0418f4487a5` |
| 05 | Bets › Open | 320 | Light | [05-bets-open-320-light.png](05-bets-open-320-light.png) | `17095b89a91a26954c8c352d5434d222b31e96f7577fceda93cc6f8134dde4b1` |
| 05 | Bets › Open | 390 | Light | [05-bets-open-390-light.png](05-bets-open-390-light.png) | `a0b468181b1802f340bc75e271d1d26e39c7c976f43f6caadfd376fb3c41d813` |
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
| 09 | Play held card and legacy links | 320 | Dark | [09-play-held-320-dark.png](09-play-held-320-dark.png) | `94bcca89011574637116bc081c7cf9bd9dfd5eb9825b71b47ff75df1c556776f` |
| 09 | Play held card and legacy links | 390 | Dark | [09-play-held-390-dark.png](09-play-held-390-dark.png) | `a4a51bcf013b97ee6ee70e8dcddff3364f77ba0cf42f611edbf27fe9afdffc47` |
| 09 | Play held card and legacy links | 320 | Light | [09-play-held-320-light.png](09-play-held-320-light.png) | `7128e3ddf8fb11288f345e58d77362b7db548112b0bab6058fc4a8029bad0149` |
| 09 | Play held card and legacy links | 390 | Light | [09-play-held-390-light.png](09-play-held-390-light.png) | `3c2f3658e938a5a08eef8d4a5f98ec8fe9784bc96cb711636f6677c51a30d432` |
| 10 | Preview · Play › Tonight | 320 | Dark | [10-n3-tonight-320-dark.png](10-n3-tonight-320-dark.png) | `3f173e25ebe8ba5bdfe635a67cafd31619fae60e478faa957fa002ceb6bd34c0` |
| 10 | Preview · Play › Tonight | 390 | Dark | [10-n3-tonight-390-dark.png](10-n3-tonight-390-dark.png) | `1cf19e0add11ae17b1a708ae30dd12f32a5e4cb71ee54a52a44406493e443434` |
| 10 | Preview · Play › Tonight | 320 | Light | [10-n3-tonight-320-light.png](10-n3-tonight-320-light.png) | `e0e18a1bdf493bf3354b1401b79c7725cd81cedbed13657f176e537a0c7988d2` |
| 10 | Preview · Play › Tonight | 390 | Light | [10-n3-tonight-390-light.png](10-n3-tonight-390-light.png) | `ff1724490e4e1a83cd0151c2522e69903561ae0cc38c25d11577081773295350` |
| 11 | Preview · Play › Standings | 320 | Dark | [11-n3-standings-320-dark.png](11-n3-standings-320-dark.png) | `f67e6b7b651955c99a3afcd842171707ba17a0c864b4a321ceab1d9752a4ffdc` |
| 11 | Preview · Play › Standings | 390 | Dark | [11-n3-standings-390-dark.png](11-n3-standings-390-dark.png) | `63ccb4a387313364ac2e66f2beb8a90fd6e862eae4144639a10c9fbb5240c1c8` |
| 11 | Preview · Play › Standings | 320 | Light | [11-n3-standings-320-light.png](11-n3-standings-320-light.png) | `bf032e1e58cface77961a76f2c2f4b61b08ca623f6e6567df58021197bb462ac` |
| 11 | Preview · Play › Standings | 390 | Light | [11-n3-standings-390-light.png](11-n3-standings-390-light.png) | `1302c1445a65cef55e69d31e510b17a76c3ae8c4f76bd2e97825c8660380d487` |
| 12 | Alternative · Pick’em | 320 | Dark | [12-alt-pickem-320-dark.png](12-alt-pickem-320-dark.png) | `7e20353c0d51906e2e98c79c027d44b3a8275565207448218e59cc282fcd52a0` |
| 12 | Alternative · Pick’em | 390 | Dark | [12-alt-pickem-390-dark.png](12-alt-pickem-390-dark.png) | `cd1d22e902a83283b635ea461a89af9d5bf3af92ea3906ee4eb818dfda108101` |
| 12 | Alternative · Pick’em | 320 | Light | [12-alt-pickem-320-light.png](12-alt-pickem-320-light.png) | `729dcd9219cf5c451448e872dd62e484b8f054172c952edc315c0c036ddf9e8c` |
| 12 | Alternative · Pick’em | 390 | Light | [12-alt-pickem-390-light.png](12-alt-pickem-390-light.png) | `4e477ce6b6c20761338ad33bf47e0068ee272ac9b13b6f0355eb66e9c7aea8c0` |

## What each screen shows

1. **Sport switch** (N1). Original NBA text badge in the 52px league circle: selected, unselected, keyboard focus, the hidden production default and the narrow-screen size.
2. **Team badge sheet** (N1). All 30 teams as letters-only glass circles at 48, 32 and 24 px; the 13 codes shared with NFL; trademark notice and BALLDONTLIE source line.
3. **NBA Home** (N1). Tonight card (first tip, the live game and the next two), Needs your result queue, This month net, open tickets matching Bets › Open and the Play-coming card; loading, empty day, empty account, read error, stale and 401.
4. **Research › Games** (N1). Date chips and picker; all six games in In progress, Scheduled and Final groups; LIVE only when in progress; loading, empty date, error keeping the last board, cached vs observed, cooldown, postponed.
5. **Bets › Open** (N1). Private tickets in the Prism receipt with whole American prices and result chips; loading, empty account, empty filter, error, paging.
6. **Confirm result sheet** (N1). Final score, graded leg, suggested outcome and prefilled reason; overtime note, three no-suggestion cases, saving, saved, uncertain recovered by receipt, 409 and error with values kept.
7. **Bets › History** (N1). Filters, filtered totals, an expanded ticket with legs, original Novig price and correction history; loading, filtered empty, error, paging.
8. **Track bet sheet** (N1). BetEditor as a sheet: single, 3-leg parlay, American vs Novig, review step, saving, saved, uncertain, 409, correction reason required and the leave guard.
9. **Play held card and legacy links** (N1). The held Play card, an old #nba/bets address landing on #nba/bets/open, and the full link map.
10. **Preview · Play › Tonight** (N3 preview). Guess the Spread per game in the approved Play draft layout with each team’s W–L under its badge (D-62), 3 of 6 locked and Lock in all 3; saved draft, locked pending, locked and scored, tipped-off draft, no line, postponed, lines paused, and both lock dialogs.
11. **Preview · Play › Standings** (N3 preview). Tonight, Week and Season standings with ties and no-guess rows; week final, empty, error, stale; the game layer after tip-off and before your lock.
12. **Alternative · Pick’em** (Alternative). Recommended Guess the Spread card beside the zero-credit Pick’em card, both with team records (D-62); draft, locked (no countdown), revealed split, awaiting final, final Right and Wrong, postponed void.
