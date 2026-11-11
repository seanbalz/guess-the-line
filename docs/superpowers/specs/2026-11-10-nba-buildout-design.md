# Guess the Line NBA build-out — design proposal

Status: **N1 approved and built on a branch (not merged or deployed); N2 to N4 still
proposals.** On November 11, 2026 Sean chose "Guess the Spread" (N1 first, then N3),
replaced the letter badges with official NBA league and team logos, approved the 31-credit
cap and 100-credit pause threshold, opened NBA Guess the Spread to all Community
members and allowed one free records backfill (D-85; see "Waiting on Sean"). Nothing is
applied or deployed.
Owner: Sean Balsiger. Date: November 10, 2026.
Phone mockups: [design/nba-buildout-2026-11-10](../../../design/nba-buildout-2026-11-10/README.md)
(48 captures, 320 and 390 px, Dark and Light, synthetic data).

Evidence tags: **executed** (run and observed), **inspected** (read in source or
docs), **assumed** (not checked). The base is `origin/main` at
`3ddc36d83aeb014efc7c448bf21d9fe22d1edeab` (inspected through git). The hosted
counts come from the audit's read-only queries (executed by the audit; not
re-run for this record). The per-call credit figures come from the tracker
direction's provider check (not re-checked here).

## Answer for Sean: is NBA fully built out?

No. What exists is v1 from October 22, 2026 (PR #167,
[release card](../../NBA_SECTION_RELEASE.md)): a private ticket tracker with a
daily Games board, My Bets and History (inspected).

- It has been hidden from the sport switch since October 29
  ([release record](../../RELEASE_2026_10_29_NBA_EPL.md); inspected) and was
  parked on November 6 (brand guide; inspected).
- It never moved into Prism Glass. `NbaApp` still renders its own header, an
  account panel and a three-button nav (inspected).
- It has no game, scoring, standings, reminders or research (inspected).
- No ticket has ever been saved through the app in production: `bet_changes`
  has 0 rows (executed by the audit; re-counted read-only in review on
  November 10). The 10 tickets `/nba/read` returns are the October archive
  import (`nba_private.bets` has 10 rows; count only, executed in review).

This plan fixes and restyles what exists first, then adds one nightly game:
Guess the Spread, the same game the league already plays in NFL. Every
milestone is additive, ships only after Sean has reviewed real phone mockups,
and needs his named approval for any migration, deploy or schedule.

## Judge scores

The workflow's judge scored three directions. The scores are as the workflow
supplied them (not re-run for this record); each reason is this record's plain
summary, not the judge's wording.

- **Parity-first: 7/10, the recommended basis.** NBA gets the Prism shell and
  the same Guess the Spread the league already plays in NFL, for about one
  capped Odds API credit a game day.
- **Social-first: 6.5/10.** Its zero-credit nightly Pick'em is this plan's
  alternative (mockup 12). It costs nothing, but picking winners has no hidden
  number, so players separate slowly.
- **Tracker-and-research-first: 5/10.** It polishes a private tracker that has
  no saved ticket yet (`bet_changes` 0) and adds no shared game. This plan uses
  only its per-call credit figures.

## Rules for every milestone

- **Design.** Read [the brand guide](../../BRAND_GUIDE.md), `design/tokens.json`
  and `design/tokens-next.json`, and use Prism Glass only (selected-system
  authority `3ac2eb50`).
- **Mockups.** Built from the app's real components with synthetic data, at 320
  and 390 px, in Light and Dark. Sean sees them before the build and again
  before release. Never put real picks or tickets in static assets (D-31).
- **Identity (amended by D-85, November 11, 2026).** Official NBA league and team
  logos, self-hosted under the D-46 rule, each in its own glass circle, looked up by
  NBA code only (`resolveNbaTeamLogo`), with the notice "NBA and team names, logos and
  marks are trademarks of the NBA and its teams; used here only to identify the teams.
  No endorsement." The proposal's letters-only badges and "NBA" text badge are
  superseded; letters show only while a logo loads or if it fails. Keep BALLDONTLIE's
  unofficial-source line and observation times.
- **Data.** Free sources only. NBA may spend Odds API credits only up to Sean's
  cap, and NBA pauses before NFL or EPL is ever refused.
- **Preservation and privacy.** D-23: player rows are append-only; corrections
  and voids are new rows, nothing is deleted. D-31 and D-36: reveal and line
  hiding are enforced in SQL. Every RPC is service_role only, with
  `search_path=''`, a server-derived user ID and no client clock.
- **Migrations and release.** Each migration takes the next free ledger number
  after M-47 (assumed; take it from the ledger when writing), ships with a
  rollback that revokes access and keeps every row, and is applied only on
  Sean's named approval through his Chrome SQL editor route, never a generic
  `db push`. Release order: migration, `gtl-api`, the `gtl-nba-jobs` worker,
  schedule rows (created disabled, enabled by Sean), then Pages.
- **Repository.** Worktree from a fresh `origin/main` under
  `betting-repo-worktrees` or `.claude/worktrees`; LF endings; the
  `node_modules` junction and `.local/sql-check`, with every run reporting
  `# skipped 0`; the 9 required CI checks; never touch another session's or
  Codex's checkout.

## Decisions made here (no question needed)

- **Reveal.** EPL M-32's per-game D-31 rule: other players' locked guesses for
  a game show once you have locked that game, or at tip-off. Drafts are never
  shown. The line stays hidden until your own lock or tip-off (D-36).
- **Lock.** A game locks at tip-off with no late window, as in EPL; D-30 stays
  NFL-only. A locked guess is final; unlocked guesses stay drafts (D-37/D-39).
- **Market.** Spread only at launch. The table allows `total`, but the writer
  refuses it until a later approved milestone.
- **Points.** NFL's `round(greatest(0, 10 - 2*abs(guess - line)), 2)` on a
  signed, home-referenced spread.
- **Standings.** Tonight, Week (Monday to Sunday PT) and Season, ranked by total
  points with the average per game beside it. Shared standings count a game only
  after its tip-off (Q-02); your own points show at once (D-50). Standings are
  computed when read.
- **Tracker.** NBA tickets stay private and apart from NFL and Virtual Units.
  Suggested results never settle a ticket on their own.

## N1: NBA in the Prism shell, plus tracker fixes (Pages only, no migration)

Mockups 01 to 09.

1. **Shell.** Add `web/src/next/nba/NbaShell.jsx` (`NBA_SHELL`, copied from
   `EPL_SHELL`), `nba/shellRoute.js` and `nbaFrameContext` in
   `shell/confirmedFrame.js`. `NextApp` passes `shellProps` when the sport is
   NBA and `SportEntry` stops rendering `NbaApp` in its place. Retire the
   gx-nba header, account panel and three-button nav. The NBA mount starts no
   NFL week, roster or community read (the EplMenu guard pattern).
2. **Tabs.** Home (`#nba/home`): Tonight card, "Needs your result" queue, This
   month net tile. Play (`#nba/play`): a held card until N3. Bets
   (`#nba/bets/open`, `#nba/bets/history`): the Track bet editor becomes a
   shell sheet. Research › Games (`#nba/research/games`): the existing board.
3. **Legacy links.** `#nba/games`, `#nba/bets` and `#nba/history` redirect with
   `replaceState`, with no Back loop; unknown fragments go to `#nba/home`.
4. **Badges (as built under D-85).** `NbaTeamBadge` draws the team's official NBA
   logo in the same glass circle (24, 32 or 48 px) with the full team name as its
   accessible name; letters (SVG text with `textLength`) hold the circle until the
   logo decodes and stay only if it fails. It never calls `resolveTeamMark` or
   `resolveTeamBadge`: those take a code with no league (inspected), so PHI, DAL,
   DEN, MIA, MIN, DET, HOU, CLE, CHI, ATL, IND, WAS and LAC would otherwise resolve
   to NFL logos. The official NBA league logo sits in its own league circle of the
   sport switch (52 px; 44 px below 360 px wide when three circles show).
5. **Switch flag.** `sportOptions()` gains an NBA row behind the source constant
   `NBA_ON_SWITCH = false`; it turns on only on Sean's word.
6. **Price display.** Whole American odds (+102). The stored eight-decimal value
   is never rewritten; details show the original input ("49.5% Novig").
7. **"Needs your result" queue.** A pure `shared/nba-grade.mjs` (modeled on
   `gradeSocialEntry`) suggests results. Singles only when the leg's gameId is
   `NBA:balldontlie:<id>`, the team text matches that game and the game is final
   with both scores. Parlays: Loss if any leg lost, Win if every leg won; any
   push, void, unlinked or non-final leg gives no suggestion. One owner tap saves
   an ordinary audited correction through the existing `/nba/save` with the
   reason "Confirmed from final score", with an overtime note. Nothing is
   written automatically.
8. **Draft guard.** BetEditor's dirty-draft guard moves to `shell.setDirty` as
   well as `useSportGuard`.
9. **Mockup-only preview.** The N1 set also shows the N3 game screens and the
   zero-credit alternative from synthetic fixtures (mockups 10 to 12).

**Data and API.** Nothing new. `/nba/read`, `/nba/save` and `/nba/games` stay
unchanged, and so does the BALLDONTLIE limit: 5-minute TTL, 15 s lease and 35 s
global cooldown, at most about 1.7 calls a minute (inspected by the audit). The
queue reads at most one cached date per pending ticket. No Odds API credits.

**Tests (each names its contract).** `tests/nba-team-badge.test.jsx` (as built
under D-85): all 30 codes draw their own `/team-logos/nba/<CODE>.png`, and every
NFL-colliding code resolves to the NBA file, never an NFL logo or badge;
`tests/nba-logos.test.mjs` checks every shipped logo against its record.
`tests/nba-shell-route.test.mjs`:
legacy fragments map through `replaceState` with no added history entry;
unknown fragments go home. Sport switch: no NBA row while the flag is false,
one while true. `tests/nba-grade.test.mjs`: moneyline, spread (half points and a
whole-number push), total (over, under, push), parlay rules, unlinked or
non-final gives null, no write path. Price format: 49.5% Novig shows "+102" and
the save payload keeps the stored value (D-23). Mount isolation: `NBA_SHELL`
makes no NFL week, roster or community request. Draft guard: a dirty editor plus
a tab or sport change shows the confirm and Cancel keeps the draft. Existing
NBA suites, `tests/nba-ui.test.jsx`, sport-switch and EPL route tests, the
updated `tests/cloud-browser/nba.spec.js`, Prism frame CI contracts and axe stay
green.

**Acceptance.** Sean approves the mockups; CI green; Pages through the manual
release workflow with NBA still off the switch unless Sean says otherwise;
hosted logs show signed-in 2xx on `/nba/read` and `/nba/games` and a fresh board
observation. Sean-gated: one real save or confirmation (`bet_changes` ≥ 1) and
his physical-iPhone check.

## N2: Slate and capped spread lines (server only; players see nothing)

- **Durable slate.** A machine-only `gtl-nba-jobs` worker (the gtl-epl-jobs and
  M-30 one-run-capability pattern) runs a `slate` job at 9:00 AM and 3:00 PM PT:
  one BALLDONTLIE request for date−1 to date+1 and one free Odds API `/events`
  read, both through the existing NBA lease and cooldown.
- **Lines.** `cloud/odds-provider.mjs` takes a sport parameter (it hard-codes
  `americanfootball_nfl` today; inspected). The `lines` job runs once per game
  day, 90 minutes before the first tip-off, with `basketball_nba`,
  `markets=spreads`, `regions=us` and DraftKings, FanDuel, BetMGM plus BetRivers
  as the D-74 backup: 1 credit a call whatever the number of games (the
  tracker direction's figure; not re-verified). Per-book normalization and median as in
  NFL; too few books is stored as unqualified. One retry 30 minutes later only
  if the first attempt spent 0 credits.
- **Budget guard (SQL).** Begin/finish functions lock the shared
  `gtl_odds_budget` row (schema unchanged), keep the 50-credit reserve, apply
  the NBA monthly cap (31, approved by Sean on November 11, 2026, D-85) and pause
  NBA when the shared conservative remaining falls below 100 (approved, D-85). NBA
  is always the lane that is refused.
- **Linking.** `shared/nba-teams.mjs` maps the 30 teams across both providers;
  unmatched events stay unlinked and counted. Lock time is the earlier of the
  two start times; an in-progress or final BALLDONTLIE status closes the game at
  once, so a lock never fails open.
- **Shadow gate.** The N3 writer stays off until 10 consecutive game days show
  at least 80% of games linked and qualified, NBA credits at or under the cap,
  and nothing refused to NFL or EPL because of NBA.
- **Migration M-48 (assumed number) `gtl_nba_slate_lines`.** `gtl_nba_games`
  (a final never returns to scheduled; a start time moves only before it has
  passed), append-only `gtl_nba_game_observations` and `gtl_nba_lines`,
  `gtl_nba_line_attempts`, one-row `gtl_nba_budget`, `gtl_nba_jobs_schedule`
  and `gtl_nba_job_runs`; service_role-only functions `gtl_nba_publish_slate`,
  `gtl_nba_begin_lines_read`, `gtl_nba_finish_lines_read`,
  `gtl_nba_lines_due`, `gtl_dispatch_nba_jobs`, `gtl_nba_claim_job`,
  `gtl_nba_finish_job`. RLS on, no anon/authenticated grants, no delete grants,
  append-only triggers. Schedule rows in `supabase/admin/nba_jobs_cron.sql`,
  inserted disabled; Sean runs it.
- **Tests.** PGlite: lines append-only; the cap refuses the 32nd credit; an NBA
  claim is refused below the pause threshold while an NFL claim succeeds; leases
  serialize against NFL; a slate upsert never deletes; a final never regresses;
  a passed start time cannot move. Boundary: anon and authenticated reach no
  `gtl_nba_*` table or function. Adapter: sport parameter used, cost 1, all 30
  aliases map, unmatched counted. Worker: run capability verified; nothing due
  means no network call.

## N3: Nightly Guess the Spread

Mockups 10 and 11 (preview only).

- Per game, an eligible player saves a draft or locks a signed home spread with
  the existing GuessPicker, which gains an NBA range prop (0.5 to 25, an assumed
  safe bound; the mockups show today's 0.5 to 20 picker). Lock in per game, or
  "Lock in all N" for the night.
- **Records (D-62).** Each team's W–L sits with its badge on every pick card:
  under its code on the 48 px game card (the NFL `Matchup` stack layout in
  `ui/matchup.css`) and beside it on 32 px rows (mockups 10 and 12).
  Records are computed when read, in SQL, from BALLDONTLIE finals already
  stored (`gtl_nba_games` from N2's slate job, plus the existing
  `nba_private.game_cache`): regular-season games that are final with both
  scores. That is zero extra provider calls, and the BALLDONTLIE call budget
  (5-minute TTL, 15 s lease, 35 s global cooldown) is unchanged. There is no
  standings call: the free tier offers Teams, Players and Games only, and Team
  Standings needs the paid GOAT tier at $39.99 a month (executed: read
  nba.balldontlie.io on November 10). A team with a game day missing from
  storage shows "—", never a partial count (rule 8). The NBA Cup final does not
  count toward records and needs a rule checked against fixtures (assumed).
  The badges are not buttons, because an NBA team sheet is not in this plan.
  Sean allowed one free backfill of the earlier game days (question 6, D-85):
  a few BALLDONTLIE Games requests, once, through the same TTL, lease and
  cooldown; days still missing after it show "—".
- **Reference.** The newest qualified line at or before the server's lock time
  (at-lock); else the first qualified line after the lock and before tip-off
  (first-after); else unscored, "No line before tip-off" (D-27). A lock never
  calls the provider.
- **Commissioner void** for a postponed game or a bad line: required reason, an
  append-only void row; guesses kept and marked void; scores exclude the game
  when read.
- **API** (gtl-api, verify_jwt on, `cloud/nba-guess.mjs`, ROUTE_GROUPS
  allow-list): `POST /nba/guess/read`, `/nba/guess/save {eventId, value, lock}`,
  `/nba/guess/standings {period, anchorDate}`, `/nba/guess/void {eventId,
  reason}` (commissioner only). Errors `GTL_NBA_GUESS_INVALID` 400,
  `_NOT_ELIGIBLE` 403, `_OFF` 404, `_LOCKED` 409 with the accepted guess,
  `_CLOSED` 409 with the kept draft, `_UNCERTAIN` 503 with `readbackRequired`.
  `GTL_FEATURE_OFF=nba-guess` stops the writer. Aggregation stays in SQL (an Edge
  CPU limit was hit before on v31 trends).
- **Migration M-49 (assumed number) `gtl_nba_guess`.** `gtl_nba_guesses`
  (primary key event, user, market; half-point check; draft or locked; reference
  value/observed/source all-or-none; points), insert-only
  `gtl_nba_guess_history`, append-only `gtl_nba_game_voids`; functions
  `gtl_nba_points`, `gtl_nba_player`, `gtl_nba_save_guess` (FOR UPDATE on the
  game row), `gtl_nba_save_guess_current` (M-36 wrapper sampling database time
  after the lock), `gtl_nba_resolve_pending_references`, `gtl_nba_guess_board`
  (D-31/D-36 filters), `gtl_nba_guess_standings` (tipped-off games only, voids
  excluded), `gtl_nba_void_game`, `gtl_nba_team_records` (computed when read
  from stored finals). Updates only through the writer and only on
  drafts; no delete grants.
- **Tests.** SQL: second lock returns LOCKED with the accepted guess; saves close
  at tip-off by database time; a double-tapped lock gives one final guess;
  at-lock, first-after and unscored references; the points table (0, 0.5, 4.5,
  5+ errors); others' drafts never visible; others' locks hidden before your own
  lock and before tip-off; line hidden until your lock or tip-off; standings
  never include an untipped game; a void deletes no row; history insert-only;
  `total` refused; records count only stored regular-season finals, a team
  with a missing game day reads "—", and no record read calls the provider.
  Boundary probes (`scripts/boundary/nba-guess.mjs`): anon 401,
  forged owner ignored, pre-tip reveal denied, non-commissioner void denied. UI:
  ported EPL guessModel state tests and the picker's NBA range. Browser: draft,
  lock, reveal and standings in PGlite.
- **Acceptance.** M-49 applied on Sean's approval, API deployed, shadow gate
  passed, writer on; signed-in 2xx on all four routes and the D-31 probes pass;
  Sean's first real night produces correct references and points (counts and
  states only).

## N4: Tonight moments, one reminder and rest chips (NBA-local)

Home Tonight strip of revealed games (from the D-31 board RPC), a last-night
recap (top scorer, closest guess, ties listed) and a week leader card. One
opt-in push per account per PT date, off by default, in the 15-minute slot when
the account's earliest open unlocked game tips within 90 minutes; spoiler-free;
EPL nudge pattern with NBA tables; delivery recorded before the send; the D-28
dispatcher untouched. Rest chips ("2nd night of a back-to-back", "3 days rest")
from a rolling 7-day window of stored games; the slate job's window widens to
date−6, still one request. Migration M-50 (assumed number) `gtl_nba_moments`:
append-only `gtl_nba_settings`, `gtl_nba_nudges` (one row per account per
date), `gtl_nba_nudge_candidates`, `gtl_nba_mark_nudge`, `gtl_nba_recap`,
`gtl_nba_team_rest`; service_role only, no deletes. Tests: a retry never sends
twice; copy has no team or player names; no nudge once every game is locked;
rest math against fixtures, including late West Coast games and the provider's
date convention (assumed ET; qualify against fixtures first). N4 mockups are not
in this record; they come with the N4 build request.

## Later, each separately approved

- **Guess the Total:** about 1 more credit per game day after NFL's season frees
  budget (February 2027, assumed); needs an NBA totals scoring scale, because
  the NFL formula zeroes any total off by 5 or more.
- **NBA posts in the shared feed:** replaces `gtl_feed_embed` and
  `gtl_feed_in_league`, the highest blast radius anywhere; NFL branches must
  stay byte-identical (md5 compared before apply) and NBA must already be
  unhidden.
- **Closest-to-line W-L-T.**
- **NBA team sheet (D-62 rule 3):** home and road records, last five and a
  margin chart from the same stored finals; until then NBA badges and records
  are not buttons.
- **Not planned without paid data or more credits:** NBA Virtual Units,
  recommendations and gap record, research beyond rest and back-to-back, player
  props, Fantasy.

## Alternative: zero-credit nightly NBA Pick'em

Taken if Sean gives NBA 0 Odds API credits. Mockup 12 compares it with the
recommended card.

N1 is unchanged. The worker is the same without a lines job. Each member picks
the straight-up winner of each game; drafts stay private and a lock is final at
tip-off. Grading uses BALLDONTLIE finals only (status final with both scores;
the clock never makes a final), with an append-only commissioner ruling for a
corrected final or a void. 1 point per correct pick; ties share a rank;
postponed games are void with picks kept. Same per-game D-31 reveal and the
same team records as N3, from stored finals. Reuses M-30
(schedule and run capability), the M-32 board and history shape, M-23 tip-off
timing and EPL ResultsCard's Final vs Pending wording. Cost: $0; at worst about
30 BALLDONTLIE requests a day through the existing 35 s cooldown.

Trade-offs: no hidden number to guess; favorites win most nights (assumed), so
six active players separate slowly; it needs a results job and a ruling path;
a shared-feed version carries the `gtl_feed_embed` blast radius, so keep it
NBA-local. Upgrade path: the `gtl_nba_guesses` market check can include
`winner`, `spread` and `total` from day one, so funded lines add Guess the
Spread to the same card without a new table.

## Waiting on Sean

1. ~~Scope.~~ **Answered November 11, 2026 (D-85): "Guess the Spread".** Build N1
   first, then nightly Guess the Spread (N3); the zero-credit Pick'em is not taken.
2. ~~Credit cap.~~ **Answered November 11, 2026 (D-85): "Approve 31 / 100".** NBA's
   Odds API cap is 31 credits a month and NBA pauses when the shared conservative
   remaining is below 100; NBA is always the refused lane. For N2; not built.
3. ~~Who plays.~~ **Answered November 11, 2026 (D-85): "All community members".**
   Every Community member may play NBA Guess the Spread (the `gtl_nba_player` rule),
   like EPL's open access, with one shared NBA standings. For N3; not built.
4. ~~Badges.~~ **Answered November 11, 2026 (D-85): "Approve badges", immediately
   corrected by "we need nba logo and team logos not letters".** Official NBA league
   and team logos replace the letter badges and the "NBA" text badge; the 44 px
   league circles below 360 px wide are approved. N1 is built on that basis
   ([real-build captures](../../../design/nba-n1-2026-11-11/README.md)).
5. When NBA appears on the sport switch (`NBA_ON_SWITCH`).
6. ~~Team records.~~ **Answered November 11, 2026 (D-85): "Backfill once, free".**
   One backfill of the earlier regular-season game days storage lacks (a few free
   BALLDONTLIE Games requests, once, through the existing TTL, 15 s lease and 35 s
   cooldown; no Odds API credit). Days still missing afterwards show "—". For N3;
   not built or run.
7. Every migration apply, deploy and schedule enable; one real production save;
   the physical-iPhone check.
8. The stale Codex NBA worktree under
   `C:\Users\sbals\.codex\worktrees\private-nba-storage` (branch
   `codex/nba-section-design`, last commit October 21, 15 uncommitted paths;
   executed with a read-only `git status --no-optional-locks`). It is untouched.
