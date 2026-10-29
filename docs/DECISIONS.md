# Decision log

## Release timing policy - October 19, 2026

Sean explicitly instructed: "permanently remove the gated window". Deployments
and migration applies no longer wait for weekdays, quiet windows, kickoff
buffers, Sunday/Monday/Thursday freezes or daylight-saving date exclusions.
This supersedes older timing restrictions throughout the release documentation
and migration ledger. Migration dependencies and individual apply order remain
mandatory. Exact source/CI, fresh hosted evidence, data-preservation hashes,
permissions/privacy checks, compatibility, rollback readiness and verification
remain required. Player pick deadlines and locks are unchanged.


## D-68 — Premier League: Sleeper FEPL, Pick a Team and EPL moneyline (October 28, 2026)

**Status: approved by Sean on October 28, 2026.** It adopts the design in
[docs/superpowers/specs/2026-10-28-epl-fantasy-and-moneyline-design.md](superpowers/specs/2026-10-28-epl-fantasy-and-moneyline-design.md)
(mockups v3), including the twelve "calls I made" in its section 10. Plan 1
([docs/superpowers/plans/2026-10-28-epl-pick-a-team.md](superpowers/plans/2026-10-28-epl-pick-a-team.md)) builds the
foundation and Pick a Team. Research → Fantasy (EPL) and the EPL moneyline game follow as plans 2 and 3. Nothing here
is deployed: M-30 (`20261028190000_gtl_epl_pick_a_team.sql`) is written and **not applied** until Sean says "apply M-30".

1. **Who and where.** EPL is a third option on the sport switch (NFL / NBA / EPL). It keeps the four tabs (Home, Play,
   Bets, Research). Only GTL accounts linked to one of the 8 managers of Sean's Sleeper league **FEPL** (league
   `1395122699423993856`, `clubsoccer:epl`, season 2026), plus the commissioner, see the EPL option or read its data.
   Bets shows nothing new for EPL. EPL games are not open to the wider community.
2. **Linking.** Each Sleeper manager links to exactly one GTL account, and only the commissioner links or unlinks. A
   manager without a GTL account gets an invite link from the commissioner to create one, which the commissioner then
   links (spec section 10, call 1). Manager map: nemoheye = Nemo, steezyc9 = Cullen, aharrison2 = Adam, seanbalz = Sean, NLGooner = Evan, LFCRed = Mark,
   sthomas111 = Steven, Freudian = Darin. An unlinked manager still appears in standings but cannot draft or guess.
3. **Sleeper is read only.** Nothing is ever written to Sleeper. Weekly scores are the change in each roster's saved
   season `fpts` (with decimals) between snapshots, because Sleeper gives no matchups for this league. Opponents are
   paired by matching a manager's `fpts_against` change to another manager's `fpts` change; an ambiguous pair shows
   "matchup unavailable". MW1 to MW8 have season totals only. Snapshots Sean captured outside the repo
   (`/Users/seanbalsiger/gtl-epl-snapshots/`, a SHA-256 per Sleeper response) are imported as captured. A matchweek is
   final the Monday after its last match and is checked again Tuesday for stat corrections.
4. **Pick a Team order.** Managers pick in ascending order of last matchweek's score plus that matchweek's Pick a Team
   bonus. A tie goes to the lower season total. MW9 is seeded by hand: order Nemo, Cullen, Adam, Sean, Evan, Mark,
   Steven, Darin; chat picks Man City, Aston Villa, Liverpool, Tottenham, Arsenal, Brentford, Newcastle (stored as
   source `seeded`), Darin to pick. From MW10 the order is automatic.
5. **Picking.** One club per manager per matchweek, on the manager's own turn. A club can be taken once. Any club with
   a match that matchweek can be picked. A pick can be changed until the next manager picks, then it is final. The last
   pick is final at the deadline. The board (who picked what, who is on the clock) is visible to the linked managers as
   it happens. The next manager is notified through the existing push channel if opted in.
6. **Deadline, queues and auto-picks.** The deadline is the matchweek's first kickoff; there is no per-turn timer. Any
   manager may keep a private ranked queue. At the deadline the manager on the clock gets their best available queued
   club, or no pick and 0 bonus. Each later manager without a pick gets their best available queued club, else the
   available club with the shortest 2-way price, falling back to the shortest 3-way win price, then the higher league
   position.
7. **Matchweek.** Sleeper's week. A club without a match that week cannot be drafted. In a double gameweek only the
   club's first match counts. A match moved out of the week counts as postponed.
8. **Bonus.** Only the widest winning margin among drafted clubs scores, at `margin × 5`. Ties go to more goals scored,
   then fewer conceded; still tied, every tied manager gets the full points. No drafted winner means nobody scores. A
   postponed or abandoned match scores 0. The bonus counts in GTL only (standings and the next order); the commissioner
   is shown the amounts to apply in Sleeper by hand if he wants.
9. **EPL moneyline (plan 3).** The 8 managers guess the favorite and its 2-way "draw no bet" American price for every
   match. The score is the distance from the real price of the club chosen, where −100 and +100 are the same point
   (−110 to +120 = 30). The real price is the D-27 median (DraftKings, FanDuel, BetMGM) at lock-in, pending and never
   refused. Each match locks at its kickoff and a locked guess is final (D-37/D-39). Others' guesses are hidden until you
   lock that match or it kicks off (D-31). Its own leaderboard ranks lowest average distance per match guessed; a tie
   goes to more matches guessed. 3-way, spreads and totals are not offered. Building it waits on a live check that
   `draw_no_bet` returns prices from those three books.
10. **Sources and design.** Free sources only. EPL odds share The Odds API free plan with NFL and never take remaining
    credits below the existing reserve of 50. Crests for all 20 clubs are self-hosted at 128 px under the D-46 rule
    with the notice "Premier League and club names, crests and marks are trademarks of their owners; used here only to
    identify the clubs. No endorsement." Screens use the D-38/D-55 kit and tokens only.
11. **Data rules.** The EPL tables are service-role only, with no RLS policy and no browser grant. They are reached
    through `gtl_epl_*` functions (`security invoker`, empty `search_path`) called by `gtl-api` and the `gtl-epl-jobs`
    worker. The off switch is the jobs schedule row (`enabled=false`); nothing is dropped. Commissioner tools:
    `scripts/epl-seed-mw09.mjs` (MW9 seed and account links) and `scripts/epl-import-snapshots.mjs` (snapshot
    import, read-only on the snapshot folder). Both are dry runs unless given `--apply`.

## D-67 — Your picks becomes the account-level Virtual Units placing screen (October 28, 2026)

Sean chose Q06 next, then, asked where the new placing screen (redesign stages 43 and 44) should live: "Replace Your
picks". This settles where stage 43's Place board goes under the approved four-tab Bets (One thing first), which
replaced the old section switch (Place, Challenges, My bets, Real slips).
- **Bets › Virtual › Your picks** is one screen for every player, Community included, on the published week from
  `/bets/read`: each game's best named-book prices per side, your saved bet, friends' faces, and a slip in the dock with
  0.5 to 3U chips and a half-unit stepper. It places and edits through `/bets/place` (M-11, stage 41).
- **The private-league requirement goes away.** The league showing only filters whose faces appear; the bets are the
  account's, the same rows in every league. The old group Virtual Units screen is no longer reached from Bets; every
  row it wrote stays and keeps counting (D-23).
- **Unchanged:** the line lock (a market's prices show after you lock in that game's guess, or at kickoff), kickoff
  closes a game, half units, and Recommended's own Virtual Units placement.

## D-66 — Research becomes nesting cards: one smaller layer per tap (October 28, 2026)

Sean, October 28: "theres still way too much text across the app and not enough visuals and easy navigation and
progression like a chinese doll that you open and get a smaller version each time", then "im referring to the research
sections mostly". Of five options on the comparison canvas (nesting cards, mosaic zoom, orbit, story deck, unfold
strips), he chose: "Use option 1, Nesting cards, for Research."
- **Every Research layer does one job.** A heading, at most one meta line, then tappable units. Each unit has one
  picture and one big number. No sentence over twelve words sits on a layer's surface.
- **Parents stay visible as lips**, stacked tabs above the current card, each inset one step further. Tapping a lip
  returns to that layer; back closes one layer; each layer has its own address.
- **Honesty stays visible as tags** (sample size, tier words). Sentences, conditions, notes, the trends footnote,
  freshness and credits move behind the layer's ⓘ and stay in Guidance (D-55 rule 10). Gates (D-31, D-36) are
  unchanged.
- **Rollout, one PR each:** Trends › Teams first, then Players, This Week, Explore games, Build and Fantasy. The
  contract and the first rollout's details are in
  [the design spec](superpowers/specs/2026-10-28-research-nesting-cards-design.md). This updates the D-38 / "One thing
  first" layout for Research only; the four tabs and D-58's type, palette, icons and motion stay.

## D-65 — the new app is the only app; access to the old app is removed (October 28, 2026)

The request on October 28: "Change the app to only show the new version. Remove access to the
old version entirely." This completes D-60 step 2's access removal (RETIRE-02) now, ahead of its
checklist, which is the "remove it entirely now" option D-60 first put forward.
- **One app.** `web/src/main.jsx` loads only the new app. `GameHub.jsx` (the old shell) and
  `TryNewApp.jsx` (its "Back to the new app") are deleted; no old-app chunk is built or served.
- **No way in.** Menu › Older records and tools is gone. `?app=classic` opens the new app and is
  dropped from the address (other parameters and the hash kept). A saved `gtl.app` is forgotten.
- **Failures reload.** Every "Use the old app" on a failure screen, error card or failed-layer toast
  is now **Reload the app**. When the new app's chunk cannot load or throws, `main.jsx` shows a
  reload screen instead of the old app.
- **What has no new-app home yet** and so is unreachable from the UI until its page ships: the
  commissioner tools (settlement and schedule status, week opening, referee assignments, final
  scores, the odds connection; stages 77–78) and the old group game screens (`App.jsx` in cloud
  mode). Player records already have homes (History, Older records, Export; M-27, M-28).
- **Tests.** The old-app-only browser specs (25 files, plus `old-app.mjs`) and the old-app
  accessibility suite are removed with the shell; mixed specs keep their new-app cases.

### What does not change

No record is deleted, moved or hidden in the database (D-23); every server route and rule is
unchanged. Shared components the new app reuses (`CommunityHome` `WeekPicks`, `SocialBetTracker`,
`VirtualUnits`, `FantasyFootball`, `ChipPicker`) stay. The local, non-cloud `npm run dev` dashboard
(`App.jsx` without Supabase settings) stays as an engineering tool. Old hosted deployments
(RETIRE-03) and leftover old-UI source (RETIRE-04) remain separate follow-ups. Rollback is to
restore the previous Pages deployment.

## D-64 — pending shared bets settle automatically after the game's day (October 28, 2026)

**Status: approved by Sean on October 28, 2026 ("approve D-63 and D-64").** Sean: "make sure that all pending bets are settled after the day that the game
completes. There are still pending bets from week 7." Virtual Units and recommended picks already settle on every
`gtl-results-refresh` run (D-26). Shared Bet Tracker tickets had no automatic path, so they stayed pending until their
owner reported a result. The draft PR adds `20261028120000_gtl_social_auto_settle.sql` (the shared-ticket part of M-19):

1. **When.** A pending single settles once its game's latest D-26 ledger row is a verified `final` **and** the game's
   America/Los_Angeles calendar day has ended (00:00 Pacific the day after kickoff; Pacific day is the convention the
   app already uses for week opening and pick days). A game the ledger ever recorded as postponed or cancelled uses the
   day its final (or cancellation) was observed, so a rescheduled game waits for its actual day. Latest `postponed`:
   stays pending. Latest `cancelled`: void.
2. **What.** Spread and total singles, graded exactly as D-26 (cover the saved line; exactly on it is a push); net units
   from the ticket's saved odds and stake. The tracker has no moneyline market. Parlays and props stay pending and are
   reported as needing a manual result.
3. **Who.** A `settle` audit event by actor `system`, with source, sourceUrl and observedAt; `settlementSource`
   `automatic_final`. A result the owner reported is never overwritten, a ticket its owner reopened is left alone, and
   an owner can still report a different result over the system's. A corrected final re-grades only system settlements.
4. **How.** The results worker calls it after storing finals (every 30 minutes); `supabase/admin/settle_pending_backfill.sql`
   previews and, once, settles the backlog (Week 7 and earlier).

Needs Sean: approve the rule (Pacific day end; parlays/props manual; owners may override), "apply M-19", and a
`results-refresh` deploy. Details: [SOCIAL_BET_TRACKER.md](SOCIAL_BET_TRACKER.md#automatic-settlement-m-19-d-64-proposed--october-28-2026)
and the [release card](RELEASE_2026_10_28_AUTO_SETTLE.md).

## D-63 — user trend builder and saved-trend matches (October 28, 2026)

**Status: approved by Sean on October 28, 2026 ("approve D-63 and D-64").** Sean asked why TrendsCenter "finds things like this and we aren't". The draft PR
adds Trends › Build: up to three conditions from the prepared nflverse history, a result card always labelled "Found by
search — not tested" with W-L-P, cover rate, Wilson interval, sample, dates, "Illustrative units at -110" and the
2002–2017 / 2018-on split; this week's matching games (line conditions only from the viewer's own saved line once that
market is open, D-39); and up to 20 saved trends per device with a "matches this week" line on Trends and Home. Nothing
is ranked by result. D-32's tested presets are unchanged and stay the only tiered trends. No migration and no `gtl-api`
change; a Pages deploy ships it. Needs Sean: approve the feature and its labels; whether held-out agreement may be
shown at all; alerts (push/email) and account-synced saved trends as follow-ups. Details:
[TRENDS.md](TRENDS.md#trend-builder-and-saved-trend-matches--proposed-d-63-october-28-2026).

## D-62 — Teams as marks, this weekend's records when picking, and a team page (October 27, 2026)

Sean: "Anytime teams are mentioned it should show the first team logo @ the other team logo.. this app needs to prefer
visual over overloading data, simple graphs and charts and things like logos in place of names or including names. Some
of the dissemination of information is too confusing, people need to see the records of teams updated that's weekend as
well when they are making picks, and they need to show it on a page with charts and graphs and more info"

For the new app (`web/src/next/`; the old app is retiring under D-60 and is not changed):

1. **Matchups are marks.** Every matchup drawn as a heading, row or card shows the away team's mark, "@", then the home
   team's mark, each with its code beside it (`ui/Matchup.jsx`). Screen readers hear one sentence ("Seattle Seahawks at
   Denver Broncos"). Only places that take plain text keep "SEA @ DEN": a select option, a sheet's back label, a toast,
   an accessible name.
2. **Records when picking, current through this weekend.** Each team's regular-season record (W–L, with T when there is
   one) sits with its mark wherever a player makes a pick (Play's game card, the Lines board and game sheet). Records
   count every final so far in the free nflverse schedule file, so Sunday's and Monday's finals show the same weekend,
   with no hand refresh or deploy. `gtl-api` reads them (`POST /lines/teams`); the bundled file is only the fallback and
   says which week it is through. This amends rule of restraint 3 for records: two numbers per game on the card; splits
   and game logs open on tap.
3. **A team page.** Tapping a team's mark or record opens that team: mark and name, record, home and road records, the
   last five results as W/L blocks, a margin chart (one bar per game, up for a win, down for a loss), points scored and
   allowed per game, the season's games as marks with scores, and the next game. Simple charts in the D-55 style;
   numbers carry words (rule 7). No spread, total or other market for a game that has not finished: market visibility
   stays with the per-game gate (D-31, D-36).
4. **Less text, more picture.** A card leads with its picture (marks, a meter, a small chart) and one headline number;
   time stamps, sources and provenance move behind ⓘ (rule 10). Nothing a player entered is hidden or removed (D-23).

Data: nflverse nfldata `games.csv` final scores (already the source for team records, slates and Virtual Units
settlement), credited in Guidance and sources. Free sources only.


## D-61 — Fantasy (Guess the Points) opens Tuesday 12:00 AM PT, with every data feed refreshed first (October 27, 2026)

Sean: "change the start of the fantasy guess the line to post at 12AM PST on tuesdays. i need all data to be updated as
well so that people can make informed decisions and bets." "12AM PST" is read as midnight Pacific time all season: 07:00
UTC in daylight time, 08:00 UTC in standard time. This replaces "Tuesday 12:00 PM PT" everywhere for Points. FINAL time
(the following Thursday 12:00 PM PT) is unchanged.

| Data | Before the open |
|---|---|
| Fantasy projections (Track 1 snapshot) and last week's fantasy scores | Tuesday Fantasy refresh runs at 06:17, 06:47 and 07:17 UTC, after nflverse's Monday-night stats run (05:33 UTC); the 11:00 UTC daily run stays. |
| Points slate | Points jobs at 07:00 and 08:00 UTC Tuesday draft and publish; hourly catch-ups publish as soon as a late snapshot lands. |
| Market data (odds) | The twelve-hour odds slots move from 08:15/20:15 to 06:15/18:15 UTC: a refresh 45 minutes (PDT) or 1 hour 45 minutes (PST) before the open. Same two runs a day, same credits. |
| Games, scores and trends | Unchanged: results every 30 minutes and league features every 15 minutes, all week. |

Hosted steps, each on Sean's word: deploy `gtl-points-jobs` from this commit; run
`supabase/admin/points_jobs_cron_d61.sql`; apply `20261027160000_gtl_odds_slots_before_points_open.sql`, then run
`supabase/admin/odds_refresh_cron_d61.sql`; deploy the frontend for the new copy. The Fantasy refresh schedule takes
effect when this merges to main.

## D-60 — everyone uses the new app; the old app retires in two steps (October 26, 2026)

Sean asked to "remove the old app entirely, just use the new app". Some records and
tools still exist only in the old app, and D-23 forbids hiding a player's data, so
two options were put to him:
- switch everyone now and delete the old app once its features have new homes;
- remove it entirely now, leaving those items unreachable until their new pages ship.

He chose **"two steps"**.

### Step 1: everyone uses the new app now

This step amends stage 80 and part of RETIRE-02.
- **One app for everyone.** Every signed-in member opens the new app
  (`DEFAULT_APP = 'next'`). "Try the new app" is gone. A device's old saved choice
  (`gtl.app`) no longer counts and is forgotten. Other preferences and drafts stay.
- **One everyday way into the old app.** Menu › **Older records and tools** opens it
  at `?app=classic`. That address works only for that visit: nothing is saved, and
  the old app's footer offers **Back to the new app**.
- **Escape routes that stay:** the switcher's old-app row is removed. The failure
  screens keep "Use the old app" as a way out. `main.jsx` still falls back to the old
  app when the new app cannot load, and the next visit tries the new app again.

### Step 2: delete the old app once nothing depends on it

The old app is deleted (RETIRE-02 to RETIRE-04) once every item below has a native
home. The checklist is in
[the retirement plan](../planning/new-app-retirement.md#d-60-two-step-retirement-october-26-2026).
- **Player records (stages 72–75):** full change history and closed drafts; the
  retired Betting Challenge and old group archives, including the Week 5 freeze;
  saved games and forecasts; the journal, read-only; real slips by week; and the
  export.
- **Commissioner tools (stages 77–78):** settlement and schedule status (PR #214),
  week opening, referee assignments, final scores, and the odds connection.
- **Draft recovery:** group-draft reconciliation and recovery on real devices
  (RETIRE-01).

### What does not change

No record is deleted, moved or hidden (D-23). Rollback is to restore the previous Pages
deployment. Step 1 changes no server, data or migration.

## D-59 — Fantasy feed bucket and machine upload (October 26, 2026)

Sean wants his private fantasy toolkit (`seanbalz/fantasy-football`) usable inside GTL. On
October 26 he chose separate repositories plus a data feed, and the whole community as the
audience. He then approved the per-feature gates: "Spec approved with the proposed audience
gates." Community players see nflverse-derived usage only. FantasyPros ECR, per-source expert
ranks, league tools and draft/SHFL intel (which names league members) are Sean-only, by his
user id rather than the commissioner role. None of it may enter this public repository or
the Pages bundle.

For transport he chose a private Supabase Storage bucket over private release files: "Use
the fantasy-feed bucket. Draft the migration plus a gtl-fantasy-ingest function with its own
upload secret on a task branch; apply nothing live." The bucket has no storage policy, so
only `service_role` reaches it. A machine-only `gtl-fantasy-ingest` function, holding its own
`GTL_FANTASY_FEED_UPLOAD_SECRET`, stores each validated file once and fixes its audience by
feature. A community file must fit an exact table and column allowlist of nflverse-derived
columns and carry no owner-only name or email address; adding a column there is a reviewed
widening. See the [release card](FANTASY_FEED_RELEASE.md). Nothing is applied, deployed or
served by this entry. The signed-in read route and app views are later work.

## D-58 — the D-38 and D-55 system is the final brand selection (October 26, 2026)

Sean answered the open decision recorded in
[DESIGN_EXPLORATION.md](DESIGN_EXPLORATION.md#open-decision-for-sean):
"Yes: the D-38 prototype and D-55 approvals are my final selection for typography, palette, supporting icons and motion."

- **Final selection:** the four categories that never went through the
  five-option boards are now selected. Each is the system as approved and built
  for the new app.
  - **Typography:** Figtree for reading text, Big Shoulders Display for words 20px
    and up, Barlow Condensed for every number and team abbreviation.
  - **Palette:** `design/tokens-next.json`. This is the D-38 darker system (canvas
    `#070B16`, Electric Lime for the one primary action, cyan for data in dark,
    violet for live only, and a Light theme), together with the D-55 glow, glass,
    track, chart-line, bar and soft-light-card tokens.
  - **Supporting icons:** the Lucide outline set.
  - **Motion:** the durations, easings, one-loop rule and reduced-motion behavior
    in the brand guide's D-38 Motion section.
- **Already selected:** the logo (Yardline G) and the app icon (Field monogram)
  were selected October 8 (D-12) and refined by D-14 and D-44. UI and layout were
  chosen through D-35, D-38, the four-tab "One thing first" and D-55. Team marks
  follow D-46.
- **Brand guide review:** this answer also settles the review that the written
  D-38 section of `docs/BRAND_GUIDE.md` was waiting for (build plan stage 6).
- **The old app:** its earlier sections in `docs/BRAND_GUIDE.md` and
  `design/tokens.json` are not re-selected. They stay as the old app's legacy
  styling until it retires (D-52, queue Q20). New work uses the new app's system.
- **Unchanged:** every data-integrity, contrast, accessibility and
  rule-of-restraint requirement stays. A new token still needs both themes and the
  contrast test. Changing any selected category later needs a new decision.
- **Scope:** this changes no code, token or asset, and deploys nothing.

## D-57 — Fantasy Track 1: refresh, accuracy record and gated game context (October 23, 2026)

After the October 22 fantasy research review, Sean chose Track 1 first and
answered its two design questions in chat. Fantasy may show a game's implied
team totals, calculated from the median collected spread and total GTL already
shows, only to a viewer for whom both that game's spread and total are visible
under D-39 (that viewer locked in or sat out that market, or the game kicked
off). Otherwise Fantasy shows a lock line naming the hidden market. Totals are
calculated in the viewer's app from the viewer's own gated lines reply; no line
enters a Fantasy snapshot, review, static asset or Fantasy route. Public nflverse
matchup context (points allowed by position, kickoff window) and the existing
weather forecast are shown without that gate.

Refreshed snapshots are published by a scheduled GitHub build as release files in
this repository (Option A) and read through a new signed-in `/fantasy/week`
route; the committed snapshots remain the fallback. Each finished week's
published estimates are graded against nflverse actuals with a season-average
baseline. Sean approved the design on October 23 and then the
[written specification](superpowers/specs/2026-10-23-fantasy-track1-design.md)
("Approved"). Nothing else in D-39 changes. Nothing is built, released or
applied by this entry.


## D-56 — Guess the Points and Trade verdicts (October 23, 2026)

Sean designed a weekly fantasy guessing game and a trade-grading add-on in chat
on October 22–23, 2026, answering each question one at a time and approving each
design section, then reviewed the written design: "Spec approved as written."
Written design: [Guess the Points and Trade verdicts](superpowers/specs/2026-10-22-guess-the-points-design.md).

- **Guess the Points.** A third Play game. Each week GTL publishes one slate of
  five NFL players (QB, RB, WR, TE, FLEX), drawn from its weekly estimates, no two
  from the same game, across at least two kickoff windows; the commissioner may
  swap before the open. The week opens Tuesday 12:00 PM PT. Each member guesses
  each player's Full PPR fantasy points (4-point passing TD, whole numbers 0–60).
  Each slot locks in on its own, is final once locked, and closes at its game's
  kickoff; an unlocked slot scores nothing.
- **Reveal.** Other members' guesses and GTL's House estimate for a slot show
  once the viewer has locked in that slot, or at its kickoff.
- **Scoring.** 10 minus fantasy points off, floor 0, per slot, against nflverse
  actuals. PROVISIONAL when stats land; corrections re-grade until the following
  Thursday 12:00 PM PT, then FINAL and frozen. A player with no snap, a team change
  or a game moved out of the week voids the slot for everyone.
- **Boards.** A separate Points board with weekly and season standings, reused in
  the Community and every private group, never added to Spread or Total. Ties
  share the rank. House is an unranked row. Optional: a member joins the board,
  due list and reminder with their first lock-in of the season.
- **Push.** One opt-in reminder 2 hours before the member's next unlocked slot
  kicks off, at most once a week, never naming a player, guess or score.
- **Trade verdicts (phase 2).** Any member posts 1–3 players per side (at most 2
  open trades a week); members cast one hidden, final vote until the first kickoff
  of the four-week window; GTL grades each side's Full PPR points over that window
  (push within 5%); voters earn a Trade judge W-L-P record that never enters a
  points board.
- **Data and limits.** Free nflverse data only (CC BY 4.0, credited); no league
  data, odds, props or money. Built in its own tables beside the Guess machinery
  (approach A). Depends on the weekly fantasy refresh producing fresh estimates
  and a weekly actuals export. Guesses and votes never enter public assets.

This decision authorizes an implementation plan for review. It does not apply a
migration, deploy, or establish phone acceptance.

*Addendum, October 23, 2026 — Ballot card: option D, Glow card (Oct 23, 2026).*
Under the design-exploration rule (spec section 5, "Before build"), Sean reviewed
five visual alternatives for the Points slot card and its results state and picked
**option D, "Glow card"**: the D-55 deep-blue glow card with glass pills. After
lock-in the card shows faces first, with each member's guess and the House; results
show You / Actual / Points tiles and one line naming the closest member. It follows
the D-55 rules (at most two glow cards in view, glass only on a glow card, lime only
for the one primary action) and the spec's at-most-four-numbers rule. This selects
the card's look only; it changes no rule above and builds no screen.

*Addendum, October 23, 2026 — Points screens: glow cards and decisions 1C 2A 3B 4A 5B 6A.*
Sean, Oct 23: any number of glow cards may be on screen; this replaces D-55's two-card limit.
Sean then reviewed six Points screen mockups ("Points screens: six decisions", built for PR #199 with made-up
sample data) and chose, as relayed to the Points build by the coordinator:
- **1C, Play tab row:** Points is a glow card with a glass pill "Guess the Points", a big "2/5" (locked of 5) and
  the line "Next locks Sun 10:00 AM PT". The Spread and Total rows stay plain.
- **2A, slot cards:** full cards, all five glowing. Each has a glass pill "POS · Player", a status word and the
  matchup and kickoff line; then the You / Actual / Points tiles once scored (PROVISIONAL or FINAL), "You N" once
  locked in, "Draft N" for a draft, and nothing more while the slot is still to pick.
- **3B, entering a guess:** a big stepper (− / the number in lime / +, at 56px; holding moves by 5) instead of the
  chip rail, clamped to 0–60. Save draft, the one lime "Lock in N" with its confirm dialog, and Retry same save stay.
- **4A, before the gate opens:** faces of the members who locked in, with no numbers, and "N locked in · guesses
  open at kickoff".
- **5B, after the gate opens:** a number line from 0 to max(30, the highest guess or House estimate rounded up to
  10). Faces sit at their guesses (yours is the lime "You" face) and the House is a tick labelled "House N"; a tap
  shows the exact number, and each face and the tick name their value for keyboard and screen readers. Overlapping
  faces are offset vertically; every target stays 44px.
- **6A, League board:** the House stays unranked at the bottom, with "Beat the House ›".
These choose the screens' look only; no game rule above changes.

## D-55 — trend charts and a softer brand direction (October 21, 2026)

Sean reviewed five trend-chart directions for the game sheet (A headline line, B
season stems, C glow area, D stat tiles, E light report), built from the real
Week 7 IND @ MIN trends. He wrote: "I do like the detail of a and b but I like
the styling of c and e. I want the brand styling to change more towards that but
I love the information and detail of a and b and how you can drag the chart."

Selected for trend charts: A's headline number, readable line with a drag
crosshair and tooltip and B's per-season view, styled like C (deep-blue glow
cards, gradient area under a white line, glass pills) in dark and E (white soft
cards, pill selectors, gradient bars, one insight line) in light. Charts return to
the game sheet's trend rows. Every honesty rule stays: records, samples,
"not proven" labels, the break-even line, hidden line trends and source credits.

Before this work continued, Sean asked that every formatting issue be fixed
first, starting with the Bets toolbar's clipped Following button (PR #174).

After the hybrid boards, Sean asked for less on-screen text ("some items … have
unnecessary callout text … they can be on an information button or in the
settings") and more of A, B and D. The round 3 boards (R1–R5) answered that, and
Sean approved them on October 21: "build round 3 (R1–R5) into the app, update the
brand tokens and guide to match, and move the fine print behind info buttons."
This approves the D-55 tokens (glow, glass, track, chart line, bars and soft
light cards), lime as the decorative last stop of the dark chart glow only, and
the new rule of restraint 10: fine print lives behind ⓘ, collected in Menu ›
Guidance and sources. It also brings back the Home rank tiles and who's in that
the four-tab "One thing first" Home had removed, and sets the Bets section labels
to Tracked / Recommended / Virtual. `docs/BRAND_GUIDE.md` (D-55 section) records
the system. Data rules, labels, locks and the Open-Meteo credit beside forecasts
are unchanged; the nflverse credit moves into each trend ⓘ and Guidance.

## D-54 — relative Recommended gaps and compact Bets (October 21, 2026)

Sean requested that Spread and Total differences be compared by percentage
rather than raw points: 5 points on a 50-point total and 1 point on a 10-point
spread are equal at 10%. He approved a 3-point minimum denominator for
pick’em and spreads below 3, clearly labeled to avoid a near-zero denominator
dominating the list. This replaces D-48's absolute-point ranking and one-point
traffic-light bands. The same 10% relative boundary now guides green/red;
yellow is a smaller difference. It is a display comparison, not a model,
probability or claim of expected value.

Sean also asked for a clearer Bets page and smaller recommendation rows that
expand to show the point discrepancy, dated lines, and a little historical
trend context. The opt-in app keeps Tracked bets, Recommended and Virtual Units
as distinct destinations. Historical trends come from the published, free
nflverse week file, carry their record/sample/period and source, match the
recommendation's market, and never affect rank or eligibility. The current
Week 7 file has its own redacted source snapshot; Week 6 remains frozen.
See [the implementation design](superpowers/specs/2026-10-21-recommended-percent-trends-design.md).

This decision authorizes a code change for review. It does not establish
merge, deployment, real-phone acceptance or a new data integration.

## D-53 — Home, scored comparisons and research readiness (October 16, 2026)

Sean approved the implementation plan after sequential product questions. His
final sample clarification is “Just me + 1 other community member at least.”
This extends D-50 and the wager research presentation in D-48/D-51. D-51 was
reserved on the separate recommendation PR (#140, closed October 21 without a
log entry); D-52 is recorded below.

- Compare yourself with one, several or all Community members. Inside a private
  league, restrict the response and selection to that league's roster. Retain
  historical records of former members; require active membership for the viewer.
- **All players:** a game qualifies with your eligible scored, revealed result and
  at least one other member's. Include you in the benchmark. Show each game's
  contributor count. **Choose players:** use the strict intersection across you
  and every selected member. Never relax a selected intersection silently.
- Spread and Total stay separate. Show guesses, each player's saved reference and
  points game by game, summary points, scored games and points/game. Single-week,
  range and season filters default to the current competition week, with team and
  matchup filters. Games stay in their original week, including Monday carryover.
  Missing, hidden, pending and ineligible are not zero. Filtered comparisons never
  change official standings. The benchmark averages the contributor points per
  game, then gives each qualifying game equal weight; player sample counts remain
  visible when All contributors differ between games.
- Home shows the next move, own weekly points/locked/scored/remaining counts,
  official standings context, interesting research and clear exploration links.
  Newcomer guidance starts open and can be collapsed, saved per account.
- Keep three projection sources distinct: a validated independent model (the
  ranking basis), permitted Community guesses including the owner, and personal
  guess context. Do not substitute one for another. Ranked wagers need a measurable
  model discrepancy against a fresh book line plus independent trend or verified
  expert/sharp support. Popularity is not sharp support. Explain conflicts,
  sources, timestamps and uncertainty. Rank estimated value only when validated
  model output supports it; otherwise show unranked research, not invented
  confidence percentages or best-bet claims.
- Qualified Home recommendations eventually show up to three, across Spreads and
  Totals with All/Spreads/Totals filters and an expandable list. Fewer qualifying
  offers means fewer cards. Each offer uses the best fresh line **and price** among
  the player's selected connected books, with book and capture time; consensus is
  separate context. Account Settings and Home provide sportsbook selection. Only
  identities present in collected source data are offered; that does not establish
  a fresh offer for any matchup. Before selection, explain the need to choose books.
- Fantasy has a separate top-level tab and a compact Home preview. Reuse #143's
  dated public Week 6 snapshot and its limitations: static pace estimates, no
  automatic refresh, no D/ST. Fantasy does not change Guess or wager projections.
- **Approved first release:** Home, guidance, comparisons, account preferences and
  the Fantasy entry. Ranked wager activation, new paid data/expert integrations and
  automatic wagering are outside this release. The existing Virtual Units research
  remains available; it is not a validated independent-model recommendation.

Implementation, dependency order and actual verification are recorded in
[HOME_COMPARISONS_RELEASE.md](HOME_COMPARISONS_RELEASE.md). Approval to implement
is not evidence of merge, SQL application or deployment. Existing release gates
and unavailable production access remain unchanged.

## D-52 — retire previous-app access while preserving records (October 15, 2026)

Sean requested: “Let’s also make sure no one can access the previous version.
Let’s sunset the previous version and only use the new app moving forward.
Make sure nothing is lost though”. He then approved the recommendation to match
the deployed app to current source before deciding what still needs work:
“Move forward with rec”. This entry was recorded on PR #144 and carried to main
on October 21, after PR #144 closed; the [dated October 15 audit](RETIREMENT_AUDIT_2026_10_15.md)
is historical evidence for the app as deployed then (Pages `ed3fb50b`).

- **New app only after cutover.** Remove classic selection through defaults,
  preferences, query parameters, menus, deep links, error fallbacks and published
  older entry points. Verify stale connected clients and installed launches too;
  changing the default alone does not meet this request.
- **Preservation before removal.** Retain accounts, memberships, guesses and
  revisions, references, scores, bets, notes, journals, forecasts, Favorites,
  history, audits and recoverable drafts with their permissions and provenance.
  Finish missing new-app history/export/admin destinations and verify private
  backup, recovery and before/after reconciliation before cutover. Do not
  re-enter, re-score, silently submit or delete records to change the frontend.
- **Keep working shared features.** The `WeekPicks`, `VirtualUnits` and
  `SocialBetTracker` workflows already serve the new app. Preserve their
  dependencies, add missing group draft recovery, and protect memory-only edits
  and uncertain saves before any forced reload.
- **Amends stages 80/81.** Stage 80 becomes the verified new-only cutover,
  superseding D-38's optional classic mode and the two-week period of continued
  old-app access. Stage 81 removes only unused source after cutover; shared code,
  data readers and recovery support remain until proven unnecessary. Recovery
  uses a compatible new-app build or a controlled recovery state, not an automatic
  return to the previous UI.

[RETIRE-01–04](../planning/new-app-retirement.md) track the work as queue item
Q20; the [scrolling and recommendation-filter tasks](../planning/mobile-bets-followups.md)
feed Q03 and Q04. October 21 context: the new app is now the four-tab Home / Play /
Bets / Research shell (PR #162), with League inside Play and Lines and Fantasy
inside Research, and `DEFAULT_APP` is still `classic`. This decision does not
apply pending migrations, change Guess rules, or claim a production cutover.

## D-50 — immediate per-game scoring, score browsing and player trends (October 15, 2026)

Sean requested: "You should not be able to make guesses or change saves for guesses after you lock in that games guesses" and scoring "should immediately show for that weeks scoring", with week/team/game filters and a user trend page. These requirements and the Q-01 answer below are preserved from the local planning record on source checkout `e5a45f6`; Q-02 is preserved from that active checkout's follow-up record captured at 16:19 UTC on October 15; the synchronization review did not retrieve the original conversation. This entry adds the [repo backlog and targeted discovery queue](../planning/scoring-and-player-trends.md), without implementing or deploying the requirements. The local record called this D-47; that number belongs to the weather-schedule draft, D-48 is the recommendations decision, and D-49 is referenced for proposed Lines tables. This reconciled entry uses D-50; it grants no new product or deployment approval.

- **Lock-in reaffirmed (D-39/D-41).** Each game's Spread and Total guesses lock independently and permanently. Another save cannot change, remove or re-anchor a locked-in guess. Drafts for other games/markets remain separate. Each locked-in guess counts even if the rest of the week remains unfinished.
- **Immediate personal scoring.** With an available server-selected scoring reference, a successful lock-in establishes that game's points and immediately updates the player's personal score for its competition week. No wait for kickoff, football finals, or completion of the remaining ballot. Personal scores and permitted per-game details must stop using the blanket kickoff-only point guards in M-01/M-06/M-08 and the related redesign stages. Shared standings retain the kickoff basis confirmed in Q-02 below, including stage 57; readers and tests must distinguish these scopes. The formula, eligibility and separate Spread/Total competitions stay unchanged.
- **Missing line.** D-27's pending-reference path remains: the guess can lock in, but points remain visibly pending until a permitted reference resolves. Missing is never a scored zero. Existing saved/ruled references and historical audit records stay intact; later market movement does not re-anchor an established score.
- **Easy score access.** Provide a clear weekly scoring destination, linked from Home and a successful lock-in, with season/week, market, team and matchup filters and a per-game scoring explanation. Filtered subsets must be labelled separately from official whole-week totals/ranks.
- **Player Trends.** Add a dedicated view of player performance across weeks. The preserved planning record reports Sean's Q-01 answer on October 15, “Go ahead with rec”: prioritize accuracy and bias, showing whether guesses improve, which teams a player consistently misjudges, and whether guesses run too high or too low, with every insight linked to actual games. This confirms the page's first purpose; exact metric definitions, comparison windows, sample thresholds and audience remain in discovery. Matchup situation trends are a separate feature.
- **Shared standings and reveal timing (Q-02 confirmed).** Sean answered the next question on October 15, “Go ahead with rec”: personal weekly points update immediately, while shared weekly and season standings add each game at its kickoff. Everyone's board row, including the viewer's own, uses the same started games. Other players' per-game scores follow the existing game/market reveal permissions. Label personal points separately from shared standings and explain own contributions awaiting kickoff: an 8-point guess locked Monday adds 8 to the personal week immediately, then to the board at its kickoff. The underlying score/reference does not change. D-39 gates still protect hidden contributions in aggregates, trends, exports and feed text. Final closest-pick results, awards and winner declarations retain their separate completion rules.

Evidence reconciled against `main` at `1df92bd` and the [October 15 recommendations release](RELEASE_2026_10_15_RECOMMENDATIONS.md): Pages `ed3fb50b` / API v24 were recorded live from `b883c77`, with M-01 hosted and M-02 still unapplied. No fresh hosted audit was performed for this documentation reconciliation. Stage 24/M-07 and the new per-game entry flow remain unfinished. All nine backlog tasks remain open, delivery owners/dates are unassigned, and the frozen v62 tracker and private Status Board are unchanged.

## D-48 — recommendations from your own guesses (October 15, 2026)

Sean requested deployment of a Recommended section in Bets, then revised its
initial three-point cutoff: “make it a red yellow green situation” and
“it recommends the top 3 bets and then from there you can expand the table”.

Show both sides relative to the player’s own submitted or locked-in Spread/Total
guess and the accessible current consensus. Rank all positive discrepancies,
including those below three points, show the top three first, and expand the rest.
Green is favorable to that guess, red is against it, and yellow is a small gap or
near match. The implementation chooses a one-point boundary for green/red; this
is a display rule, not a validated model threshold. Show text and signed points
with every color. Adding a suggestion prepares a Virtual Units card for explicit
review and placement; it does not place a real-money wager or overwrite a pick.

This authorizes a simple guess-based suggestion without a predictive model.
It amends earlier wording that no recommendation can be generated from gaps;
the gap still establishes neither a probability nor positive expected value.
Recommendations use the current Community week and the player’s own picks,
independent of private-league membership or its older week. The narrow placement
path adds a service-only writer; it does not apply the pending redesign migrations.
Scoring, reveal gates, quote provenance and free-data limits are unchanged.
See [the feature contract](RECOMMENDED_BETS.md). D-47 remains reserved by the
weather-schedule draft. Implementation and deployment require their own evidence.

## D-47 — weather every 24 hours, then 12 hours and 2 hours before kickoff (October 15, 2026)

Sean answered, in the coordinating cloud session, "The new Lines board reads the weather forecast every time it shows a week; with the 200/day cap Weeks 14, 17 and 18 run out on Sundays. What should we do?" Verbatim: "Just need a weather update every 24 hours and then 2 hours and 12 hours before kickoff".

- **What it changes in [D-34](#d-34--kickoff-wind-forecast-from-open-meteo-october-13-2026) and [D-45](#d-45--weather-on-every-game-and-a-weather-chip-on-the-board-october-14-2026).** The refresh tiers (a 1 h TTL within 18 h of kickoff, 3 h within 72 h, 6 h within 120 h) give way to Sean's schedule. A fetched game (open air or a retractable roof, inside the 120 h forecast window) is due when it has no snapshot for this kickoff, when its newest snapshot is 24 h old, or when kickoff minus 12 h, then kickoff minus 2 h, has been reached and its newest snapshot was taken before that checkpoint. Never at or after kickoff: the final pre-kickoff forecast stays.
- **Unchanged.** Refreshes still happen only when a member reads (no cron). Single flight, the 20 s lease, the 60 s spacing, the backoff and the cap of 200 Open-Meteo calls per UTC day stay as they are (Sean did not ask to change the cap). So do the fetched stadiums (SoFi Stadium stays Indoors), the 120 h window, the values, the credit, the words ("Kickoff forecast", "No current forecast", "Roof may close", "Indoors", the age line), the board chip and every guardrail of D-34 and D-45.
- **When a forecast shows as current (the builder's rule).** Until one hour past the time it falls due. A refresh happens only when someone reads, so a snapshot that has just fallen due is shown while the read that refreshes it is on its way. An open screen asks again at the due time, or a minute later if the single flight or the 60 s spacing turned it away. The first reader after a quiet spell gets the refreshed snapshot in the same answer. An hour covers that, a device clock a little behind, and the 15-minute backoff after one Open-Meteo failure. It is shorter than the gaps between checkpoints, so a missed checkpoint stops showing as current an hour later: a 12 h-old forecast is never called current in the last hour before kickoff. After kickoff only a snapshot taken 2 h or less before kickoff is the final pre-kickoff forecast, the same window as D-34.
- **When screens read again.** The old trends panel, the new app's Lines board and its game sheet read again only at the next due point, at kickoff, when a game enters the 120 h window and when the tab becomes visible. Until now the board read once per week shown. A game still due after an answer is asked again a minute later when the server only spaced the request, and 15 minutes later when it held off (backoff, budget, a failed fetch).
- **Cap math.** With a reader every minute, the busiest UTC day of each 2026 week from Week 6 on now needs 17 to 28 calls. The upper bound for any reader timing is 24 to 40, and no game is ever without a current forecast with the cap enforced. Weeks 14, 17 and 18 needed 210, 245 and 234 calls under the tiers; now they need 24, 28 and 26. With every week's readers together, the season's busiest day is Sunday, January 3, 2027 at 28 calls. The per-week table is in [TRENDS.md](TRENDS.md#kickoff-wind-forecast-d-34), and `tests/wind-cloud.test.mjs` recomputes it with the real planner.
- **Where it is built.** Migration `supabase/migrations/20261015120000_gtl_wind_refresh_schedule.sql` replaces `gtl_begin_wind_fetch` (only its due re-check changes; rollback in `supabase/rollback/`). `cloud/wind.mjs` (the `gtl-api` planner), `shared/trends-view.mjs` (when a snapshot is current, and when a screen reads again), `web/src/windTimer.js` and the Lines board's hook. Not applied and not deployed.
- **Release.** Deploy Pages first: the new display rule works with the old, more frequent refreshes, while today's Pages would call most D-47 snapshots out of date. Then apply `20261015120000` through Gate M on a quiet day with Sean's approval, then deploy `gtl-api`. Either backend order is safe, because `gtl_begin_wind_fetch` re-checks every game it is sent. An old planner asking for a game the new SQL calls not due gets `not_due`, or the game is dropped from the request, and its reader is served what is stored. A new planner against the old SQL only asks for games the schedule calls due, and the old SQL fetches those once its own tier allows (at most an hour late at a checkpoint). Applying the SQL first makes the schedule hold from that moment, whatever planner runs. Rollback: the rollback file restores the D-34 body; every stored snapshot stays (D-23).

## D-46 — official logos for all 32 teams (October 14, 2026)

Sean answered two questions in the Mac mini session.

| Question | Ruling |
|---|---|
| Switch all 32 teams to ESPN's official logos, shown next to each team's name with a trademark notice? | **"Yes"** |
| What should the 17 teams show? (options: keep badges / 4 letter marks / redesign badges) | **"Find all logos for all nfl teams and use them"** |

- **Supersedes D-22's public-domain-only rule for team marks.** Team marks no longer need a public-domain file record. All 32 teams, including the 15 that had public-domain Commons marks, now show their official logo from one source. The [D-22](#d-22--coming-soon-leagues-and-team-marks-october-9-2026) original badges stay in `web/public/team-logos/badges/` and show only when a team's logo fails to load.
- **Basis and limits.** The marks are used only to identify teams next to their names. They carry the trademark notice "NFL and team names, logos and marks are trademarks of the NFL and its teams; used here only to identify the teams. No endorsement." (Terms page, "Team names and logos"). They are not licensed, and no NFL or team endorsement is claimed. No team mark becomes Guess The Line branding, the app icon or advertising.
- **Source.** The logo PNGs come from ESPN's CDN (`a.espncdn.com`), listed in the `team_logo_espn` column of the nflverse teams file (`teams_colors_logos.csv`). They are self-hosted, never hotlinked, as 128 px downscaled copies with nothing else changed: no recolor, no crop, aspect ratio and transparency kept. Every file's source URL, fetch time and SHA-256 (original and shipped) are in `web/public/team-logos/sources.json` and the [register](TEAM_LOGO_SOURCES.md#official-logos-d-46).
- **Backing chip.** Sean also approved a backing behind the logos, so that the low-contrast ones read ("Yes I want that"). The rule is the same for all 32 teams:
  - **Dark:** a round light-neutral chip with small padding behind every official logo, using the token text color (`#F8FAFC` in the old app, `--gx-text-1` in the new one).
  - **Light:** no chip, because no neutral token separates the mostly-white KC, PIT and TEN marks without sinking others.
  - **Badges and letters:** unchanged.
  - Measurements are in [the register](TEAM_LOGO_SOURCES.md#backing-chip-approved-by-sean-october-14-2026-yes-i-want-that).
- **Backing override** (Sean: "Move forward with rec"). The measurement picked **KC, LAC, PIT and TEN** for `backing: 'dark'` in the registry. They are the logos whose default backing was flagged in Light in either app, and which the dark chip clears.
  - **What they get:** a round dark chip with the same padding in both themes. The chip is the canvas token in Dark (`#0B1020` old app, `#070B16` new app) and the text token `#0B1020` in Light. All four measure better on it in Dark too.
  - **Everyone else:** keeps the default rule.
  - **Result:** no logo is flagged in either theme or app. See the [override table](TEAM_LOGO_SOURCES.md#backing-override).
- **Backing removed** (Sean, October 15, 2026, Mac mini session: "Remove the black background behind some of the logos. They does not need any of them"). Supersedes both the backing chip and the backing override above: every official logo sits directly on the page, or in the new app's tile, with no chip in either theme. `darkBackingTeams`, the `backing` registry field and the chip CSS are removed. The contrast notes in the register remain as history: some marks (for example NYG and CAR on Dark, KC, PIT and TEN on Light) have low contrast against the page, accepted by this ruling.
- Nothing is applied or deployed by this entry.

## D-45 — weather on every game, and a weather chip on the board (October 14, 2026)

Sean answered "Weather and wind forecast: what should change?" in the coordinating cloud session. He chose, verbatim: "Full weather on every game (Recommended)" — "Every game gets a weather row: open-air games show the kickoff forecast; domes and closed roofs say "Indoors" (retractable roofs say "Roof may close"). The new app's game sheet shows the full card; the board gets one small chip only when wind is 15+ mph or rain/snow is likely. Updates D-34 to allow that chip."

- **What it changes in [D-34](#d-34--kickoff-wind-forecast-from-open-meteo-october-13-2026).** Forecast claims still stay out of every written summary: collapsed trend summaries, the trends intro, feed posts and notifications carry no forecast value or link. The one new board element is a word chip on a Lines board row, with no number and no link; the values and the Open-Meteo credit stay in the game sheet's full card. Everything else in D-34 stands: Open-Meteo is the only source, the CC BY 4.0 credit sits next to every value, only signed-in community members see forecasts, and the fetched stadiums, refresh tiers, single flight and daily cap are unchanged.
- **Venue rules.** Sean's option names open-air games, domes and closed roofs, and retractable roofs. The SoFi Stadium row is the builder's reading, not his ruling (see the next point).

| Venue | Weather row | Fetched from Open-Meteo |
|---|---|---|
| Open air | The kickoff forecast | Yes, as before |
| Retractable roof | The kickoff forecast and "Roof may close": it is the outside weather, and the team decides the roof on game day. Without a forecast the row says "No current forecast" and "Roof may close" | Yes, as before |
| Dome (Detroit, Minneapolis, New Orleans, Las Vegas) | "Indoors", with no numbers and no credit | Never, as before |
| SoFi Stadium (a canopy: a fixed roof over the field, open at the sides) | "Indoors", like a dome. Builder's reading of "domes and closed roofs" | Never, as before |
| A retractable roof the trends file records as closed (only played games carry it) | "Indoors", with no numbers | Yes: the planner fetches every retractable stadium |
| No stored forecast, more than 120 h out, a stale snapshot, the provider down, or signed out | "No current forecast" | — |

- **SoFi Stadium.** The first build of this decision fetched SoFi and labelled its forecast "Covered, open-sided stadium". Review ran the real planner over the 2026 schedule: SoFi would push Week 8 (Sunday, November 1) to 210 calls and Week 9 (November 8) to 217, against 191 and 198 without it, and with the cap enforced games on those Sundays would show "No current forecast" for 1 to 4.7 hours before kickoff. So SoFi stays unfetched, as under D-34, and says "Indoors": its roof is fixed over the field, nflverse lists it as a dome, and the trend records count it as one. Sean can rule otherwise. Fetching SoFi is one entry (`'canopy'` in `WIND_VENUE_TYPES`, `shared/wind-venues.mjs`), and it needs a higher cap or different refresh tiers first.
- **The board chip.** At most one per row, and only for a current forecast: "Rain likely" or "Snow likely" when the kickoff-hour precipitation chance is 50% or more; otherwise "Windy" when the kickoff-hour sustained wind is 15 mph or more (gusts never count). Precipitation wins over Windy. "Snow likely" means a kickoff-hour temperature of 32 °F or colder: the stored Open-Meteo fields carry no weather code or snowfall, and adding one would need a migration, so with no temperature there is no precipitation chip. Thresholds use the unrounded stored values (14.9 mph is not Windy, 49% is not likely). "Indoors" and "No current forecast" rows never get a chip, so a dome and SoFi never do. A retractable stadium can, because the chip describes the outside weather. After kickoff the chip follows the final pre-kickoff forecast (made within 2 h of kickoff) for as long as the board shows the game, like the sheet's card.
- **Cap math.** The cap stays 200 Open-Meteo calls (locations) per UTC day, failures included. This decision fetches no new stadium, so every figure is D-34's. With a reader every minute and every game refreshed the moment its TTL allows, the busiest UTC day of each remaining 2026 week is under 200 except Week 14 (210), Week 17 (245) and Week 18 (234, on placeholder kickoff times). With the cap enforced, some of those Sundays' games show "No current forecast" for 1 to 7.7 hours before kickoff. That is a D-34 limit that this decision does not change. Raising the cap (a migration) or changing the refresh tiers needs Sean's call. [D-47](#d-47--weather-every-24-hours-then-12-hours-and-2-hours-before-kickoff-october-15-2026) (October 15) is that call: Sean's schedule replaced the tiers, and no week comes near the cap. The per-week table is in [TRENDS.md](TRENDS.md#kickoff-wind-forecast-d-34), and `tests/wind-cloud.test.mjs` recomputes it from the season file with the real planner.
- **Where it is built.** `shared/weather-view.mjs` (`weatherRow`, `weatherChip`), the roof rule in `shared/trends-view.mjs`, and the old app's trends panel (`web/src/WindForecast.jsx`, `web/src/TrendsView.jsx`). The new app's Lines board and game sheet are redesign stage 13 ([build plan](REDESIGN_BUILD_PLAN.md)), not built yet; their scope now names the chip and the full card. No migration and no `gtl-api` change: the fetched stadiums are D-34's. The rows start with the next Pages deploy.
- **Unchanged.** Weather is reference only. It never changes scoring, picks, lines, line locks, kickoff locks or the D-23 reveal, and it is not gated because it reveals no line or pick. The old app's card keeps its Eastern times. See [TRENDS.md](TRENDS.md#kickoff-wind-forecast-d-34).

## D-44 — the logo is the green Yardline G on a transparent background (October 14, 2026)

Sean asked, in the coordinating cloud session: "The logo needs to have a transparent background, also, let’s just make it the G with a more subtle backgroud like transparent and green logo" and "Let’s remove logo on brand but update the brand logo everywhere else".

- **"Brand" is Google's consent screen.** Google's consent screen shows no app logo: the Mac mini session removes it on the Google Auth Platform Branding page, outside this repository, so a logo does not trigger Google's brand review. [GOOGLE_SIGN_IN_SETUP.md](GOOGLE_SIGN_IN_SETUP.md) already says to leave it empty. "Everywhere else" is every place the app shows its logo.
- **The mark.** The Yardline G alone: no tile, no rounded rectangle, no shadow, nothing behind it. The G's two paths, with the four yard-line strokes, stay exactly as selected in D-12 and D-14. The svg is now framed by the G's own bounds (`22 20 81 53` instead of the study's `0 0 130 90`), so the G fills the box the tile used to fill; every box keeps its size, so nothing around it moves.
- **Two greens, both existing tokens.** No token is added.

| Surface | Green | Why |
|---|---|---|
| Dark: the dark theme, a dark browser tab, the PNG icons | Lime `#B8F34B` (`primaryForeground` and `accent-ink` in dark) | 14.39:1 on `#0B1020`, 14.94:1 on the new app's `#070B16`, 15.96:1 on black (iOS shows a transparent home-screen icon on black). |
| Light: the light theme, a light browser tab | Deep green `#3B6309` (`primaryForeground` and `accent-ink` in light) | Lime on white is only 1.32:1. Deep green is 7.06:1 on white, 6.75:1 on the old light canvas and 6.24:1 on the new one, above the 3:1 WCAG 1.4.11 asks of a graphic. |

- **Where it changed.** `web/public/favicon.svg` (deep green, lime when the browser is in dark mode, through `prefers-color-scheme` inside the file); `web/public/app-icon.svg` (the lime G with a 12% margin, the source of the PNGs); `app-icon-180.png` (iPhone home screen), `app-icon-192.png` (manifest and notification badge) and `app-icon-512.png` (manifest), now RGBA with transparent corners; the old app's mark (`Brand.jsx`, `brand.css`: sign-in card, lobby headers, sidebar) in `--primaryForeground`; the new app's `FieldMark` (top bar, start and load-failed screens) in `--gx-accent-ink`, and `.gx-av-sys`, the system-post avatar style, which no component uses yet; the Brand Lab's applied app-icon study, framed like the product so the G shows at the same scale. Forced-colors mode no longer draws a border around the mark, and the unused `.brand-mark` tile rule is removed.
- **Android and notifications: the same transparent G.** Android draws a non-maskable icon inside a white circle, and a light notification card is near white, where the lime G is 1.32:1. Asked "What should those two places show?" with a navy square for those two places only as the recommended option, Sean chose "Transparent everywhere" (October 14, 2026). So the manifest lists only the two transparent `purpose: "any"` icons, and the push notification's `icon` and `badge` are both the transparent `app-icon-192.png`.
- **Unchanged.** The existing asset file names (no new files), `web/index.html`, the manifest's two `purpose: "any"` icons and its navy `background_color` and `theme_color`; the accessible name and browser title Guess The Line; the name Field monogram for the icon-only mark (D-14).
- **Known limits.** Where a system shows the transparent icon on a light surface (Android's white launcher circle, a light notification card, a desktop install on a light taskbar), the lime G is low contrast (1.32:1 on white); Sean accepted this with "Transparent everywhere". The favicon follows the system color scheme, not the tab strip, so a light system with a dark browser theme shows the deep green on a dark tab (2.68:1 on `#0B1020`).
- **After deploy.** iPhones that already added the app to the Home Screen keep the old tile icon until it is added again, and browsers keep a cached favicon for a while; `web/public/_headers` sets no cache rule for the icons. The release record should say so.
- `tests/brand-mark.test.mjs` checks the files (the transparent PNGs: RGBA, transparent corners and margin, every visible pixel lime, nothing behind the G; no maskable or navy icon, and the notification icon and badge are the transparent G; both SVGs draw only the two paths, with no tile, CSS background or style attribute), every stylesheet rule that names the mark, the old app's mark and the Brand Lab study; `tests/next-ui.test.jsx` checks `FieldMark`.
- Nothing is applied or deployed by this entry.

## D-43 — slip notes, the old sit-out window and locked-in guesses in History (October 14, 2026)

Sean answered the questions PR #98 (redesign stage 21, M-04) and PR #99 (stage 19, M-03) raised, in the cloud session.

| Question | Ruling |
|---|---|
| While another player's slip leg is line-locked for the viewer, are the slip's free-text note and change reasons hidden too? (#98) | **Hidden until the line opens.** A note can carry the line ("took -6.5 early"); it shows once the viewer locks in, sits out, or the game kicks off. |
| Does the old app's "Sit out this week" stay open until the last kickoff, like Skip and "See picks now"? (#99) | **Yes, open until the last kickoff too.** Both apps match. |
| Does the old app's History show a sat-out market's locked-in guesses (D-41)? (#99) | **Yes, with per-game scoring.** From the day M-07 scores each locked-in guess on its own, the old History lists those guesses and their points, as the new app does (D-39: live in both apps). |
| Does History show other players' locked-in guesses in a market that is neither sent nor sat out? (#99) | **Yes, gated per game, with M-07.** Each locked-in guess shows to another player once that game and market is open to them, the same rule as Everyone's picks (M-08). Unlocked drafts are never shown. It lands with per-game scoring so History and points change together. |

- **Where it is built.** M-04 (#98) already holds notes back. M-07 (stage 24) moves the old sit-out (`gtl_sit_out_week`) to the last-kickoff window, replaces `gtl_read_community_history` again to list locked-in guesses per game, and lets D-27 pending-line resolution through for a sat-out market's locked-in guesses. Stage 25 updates the old app's sit-out button and History rows the same day.
## D-42 — account deletion keeps the display name; public contact address on the legal pages (October 14, 2026)

Sean answered, in the coordinating session, the two questions PR #62 (the public Privacy Policy and Terms of Service pages) asked him to confirm.

| Question | Ruling |
|---|---|
| When a player asks to delete their account, what happens to their past game entries? The options were "keep the draft (name or anonymous label)", "Always keep the name" and "always anonymize". | **Always keep the name.** The sign-in details and email address are removed; past game entries stay under the player's display name so the competition record stays complete. |
| CI's privacy check (`scripts/check-cloud-boundary.mjs`) refuses any real email address in the built site. May the Privacy and Terms pages publish the contact address? | **Allow it on those two pages.** Only the top-level `privacy.html` and `terms.html` may carry an address, and only as a `mailto:` link on the same page. A bare address, `index.html` and nested files still fail. |

- **Fits [D-23](#d-23--user-data-is-never-deleted-moved-or-hidden-october-9-2026).** Nothing a player entered is deleted, moved or hidden, so a deletion removes only the sign-in details and email address. The picks, posts and records stay in the record, under the name they were made under, and nobody's entry is relabelled.
- **Where it is.** `web/public/privacy.html` ("Your choices and requests") states the deletion rule, and both pages link the contact address as `mailto:`. `tests/legal-pages.test.mjs` checks the deletion sentence, that no "anonymous label" wording comes back, and the scanner's limits: a linked address passes only on the two top-level pages, while a bare or second unlinked address, `index.html` and nested copies fail.
- **Unchanged.** Deletion is still a request by email, handled by hand; no deletion feature is built (the redesign adds none, build plan section 12). Every other file in the built site still refuses any real address.
- Nothing is applied or deployed by this entry.

## D-41 — each locked-in guess counts on its own; the old sit-out keeps them (October 14, 2026)

Sean answered the two questions PR #94 (redesign stage 18, migration M-02) raised about D-39's per-game lock-in, choosing the recommended option each time.

| Question | Ruling |
|---|---|
| A player locks in some of a week's games and never locks in the rest. Do the locked-in guesses score? | **Each counts alone.** Every locked-in guess (one game, one market) scores on its own; a game never locked in scores nothing. There is no market-level send (D-39). |
| After some games are locked in, can the old app's "Sit out this week" (D-23) still be used? | **Yes, and the locked-in guesses keep counting.** The sit-out covers only the games not yet locked in, the same rule as D-39's "Skip" and "See picks now". |

- **Where it is built.** Per-game scoring lands with stage 24 (M-07), when each game also closes at its own kickoff. Until then M-02 keeps its interim rule: the save that locks in the last game of a market is the send, and a partly locked-in market scores nothing. No player can reach the difference before stage 29 sends per-game lock-ins. The sit-out rule is built in M-03 (stage 19).
- Nothing is applied or deployed by this entry.

## D-40 — a game note never makes a Favorite (October 14, 2026)

Sean ruled in the cloud session, answering the "Open choice for Sean" that PR #83 (redesign stage 27, private notes server, migration M-09) raised in `docs/redesign/PRIVATE_NOTES.md`. He chose "No, and fix old Save": "The note doesn't create a Favorite (matches D-36: Favorites leave the screens). A small extra old-app change makes 'Save to Favorites' keep a stored note instead of overwriting it with a blank one."

- **A note on a game with no row.** A note written in the new app on a game the player has no Favorites row for creates that row as not saved (`saved = false`). The game does not join the old app's Favorites tab or History's saved games.
- **A game that already has a row.** A note never changes its saved flag, either way: a saved game stays saved and an unsaved game stays unsaved.
- **The old app's "Save to Favorites".** It keeps a stored note instead of overwriting it with a blank one. The old app cannot see a note on a game that is not saved, so the fix is on the server: stage 27a (M-29, a separate PR) changes `gtl_mutate_personal` so that saving a game that is not saved, with an empty note, keeps the stored note. Stage 35 (notes in the game sheet) waits for M-29. Stage 27 does not change the old app.
- **Why.** D-36 takes Favorites off the screens, so writing a note must not make a Favorite the player never asked for. And saving a game in the old app must not blank a note the player wrote, in either app. The audit keeps every earlier text either way (D-23).

M-09 (`supabase/migrations/20261014224500_gtl_game_notes.sql`) follows this rule before it is merged or applied. Nothing is applied or deployed by this entry.

## D-39 — per-game lock-in and the build plan answers (October 14, 2026)

Sean answered the build plan's open questions in the cloud session, one at a time.

- **Per-game lock-in (amends D-36 and D-37).** Sean: "once you make a pick that game is revealed. you can change bets up until game start but you cannot guess the spread or total again once youve locked in that games guess". Each game's Spread guess and Total guess is locked in on its own and is final once locked in. Locking in a game's guess for a market opens, for that player, that game's line for that market and everyone's guesses for that game and market. The game's other market stays hidden until its own guess is locked in, and other games stay hidden. Unlocked guesses are drafts and change freely until that game's kickoff. Virtual Units bets and challenges keep D-18's edits until kickoff. This replaces D-37's market-level "sent" step and D-36's market-level line lock with a per-game one; the "Skip this week's Guess the Line" and "See picks now" buttons (D-36) still open everything after a warning and forfeit the rest of the week.

| Question | Ruling |
|---|---|
| Skip or "See picks now" after Thursday's deadline | **Yes, until the last kickoff.** Guesses already locked in keep counting; only the rest of the week is forfeited. |
| When the new pick rules go live | **Live in both apps once built.** The server switches both apps the same day; the old app's screens are updated to match. |
| Monday-night lines after a new week opens | **Keep collecting games that haven't started** (same calls, no extra credits). |
| Who tests the new app before it is the default | **Whole league, opt-in.** Every member sees "Try the new app" from the first look. |
| Real slips | **Dollar stakes allowed on new slips; old slips keep their units; no conversion. A tail asks to confirm and cannot be undone.** |
| Friend challenges | **Line may move up to 3 points either way, in half points; a voided challenge keeps weekly-minimum credit; taking the other side of your own book bet is allowed (play money), with a note on the slip.** |
| The old private journal | **Read-only in History.** My bets holds Virtual Units bets and challenges only. |
| Push reminder wording | **"Due", not "lock"** (for example "Week 6 picks are due 5:15 PM PT. 9 games still open."). |
| When the new app becomes the default | Sean: "asap". Each stage ships as soon as it passes its gates; risky migrations still go one at a time with Sean's approval; the flip happens once all five tabs are done and checked on real data (D-38). |

## D-38 — redesign prototype approved; rollout and deploys (October 14, 2026)

Sean ruled in the cloud session, after reviewing the D-35 clickable prototype (canvas artifact "Guess The Line redesign prototype", version 2): "i like this design a lot", then answered:

| Question | Ruling |
|---|---|
| Approval | **Approved; start the build.** The real app is built to match the prototype in staged PRs; changes can still be marked up on the prototype as the build goes. |
| Rollout | **New app beside the old.** The new app is built as a separate view, first behind a "Try the new app" switch for Sean. The current app keeps working for everyone. When all five tabs are done and checked on real data, the new app becomes the default and the old one is retired; nothing a player entered is deleted, moved or hidden (D-23). |
| Deploys | **Unarchive the "Cloud/local repo sync for Guess the Line" session on the Mac mini.** It deploys with the credentials it already holds, after green merges Sean approves, and runs the live checks. |

## D-37 — sent Guess picks are final (October 14, 2026)

Sean ruled in the cloud session, answering the conflict the D-35 prototype review found between D-16 and D-36: **sent picks are final**.

- **Why it was needed.** D-36 opens a market's lines as soon as the player submits that market. If a submitted pick could still be edited until kickoff (D-16), a player could submit, read the line, and change each pick to match it exactly.
- **Rule.** Drafts can change freely until submitted. Once a player submits a market (Spread or Total) for the week, that market's picks are final and its lines open for that player. Games not yet picked in a submitted market follow D-36 (each game closes at its kickoff; late saves carry the D-30 Late marker).
- **Amends.** D-16's pre-deadline edits of a submitted ballot no longer apply to Guess the Spread or Guess the Total. Original submission times and revisions already stored are kept (D-16, D-23). Virtual Units bets and challenges keep D-18's edits until kickoff.

Nothing is built or deployed by this entry; the D-35 prototype already follows it.

## D-36 — Redesign rulings: real slips, boards, line lock, visibility (October 13, 2026)

Sean answered these one at a time in the cloud session after the D-35 prototype spec raised them. Quotes are verbatim where Sean typed his own answer.

| Question | Ruling |
|---|---|
| Shared real-money Bet Tracker | A **Real slips** section inside Bets, next to Place bets and My bets. Friends keep posting, tailing and following real slips there as today. It is kept apart from Virtual Units, never counts in any leaderboard, and GTL never moves money. |
| Real slips in the feed | **Yes, as today**: posting or settling a real slip makes a feed post friends can react to, comment on and tail, marked "Real slip". |
| Guess the Line board | **Two sub-tabs, Spread and Total**, each ranked on its own; the points are never combined (the existing rule). The Community board's hidden Spread + Total sort is a display defect to fix. |
| Ties on a Guess the Line board | **Share the rank** (T-2). The old tiebreakers (total miss, then exact guesses) show as context on tap. |
| Line lock | Sean: "Hide until you guess, or there’s a button that you confirm you are skipping this weeks guess the line and then it will show". A game's spread or total line stays hidden in Bets, Lines and challenges until the player submits that market's guesses, or confirms a skip of that week's Guess the Line (a D-23 sit-out, final for the week), after which the lines show. |
| Late picks and the late window | Sean: "Picks are allowed until the game kicks off, you can view other people’s bets at any time". A Guess pick for a game is accepted until **that game's kickoff**; the D-30 15-minute window after kickoff is withdrawn. A pick saved after the week's deadline (TNF kickoff) still carries the D-30 Late marker. D-31's late-window guard no longer applies. |
| Other players' bets | Virtual Units bets and challenges of other players are **visible at any time** (replaces D-18's "after kickoff unless shared earlier"). |
| Other players' Guess the Line guesses | Sean: "Hidden until submit or kickoff, optional button to bypass but then you forego the guess the line game for that week with a warning after clicking that button". D-31 stands (visible after your own submission for that market or at that game's kickoff), plus an optional reveal button that, after a warning, forfeits that week's Guess the Line (a D-23 sit-out). |
| Challenges and weekly qualification | Friend challenges **count toward** D-18's weekly minimum (3 bets or 3 units). |
| Bets season board | Lists anyone who **qualified in at least one week**, ranked by season ROI, then net units, then wins (D-18, D-35). |
| Edge board | Moves **into Play after you submit**: each game shows the line now and how far your guess was, with a sort by biggest gap. No separate screen. |
| Solo extras | **Private notes** on a game stay (in the game detail sheet). Favorites and personal forecasts leave the screens; saved records stay readable in History (D-23). |
| Other sports | One row, **"More sports, coming soon"** with Notify me, in the Me menu; off Home. |
| Pick streak | A sit-out (including the skip above) **breaks** the Pick streak. Bets streaks are separate. |

These rulings amend D-18 (bet visibility), D-30 (late window) and D-31 (late-window guard) as stated, and add to D-35. Visual choices (colors, type sizes, award names, prices on bet buttons) are reviewed on the prototype. Nothing here is built or deployed yet.

## D-35 — Dashboard redesign direction (October 13, 2026)

Sean (product owner), verbatim: "There are still some major items open. The formatting looks horrible, this is not an intuitive dashboard, this does not feel gamified, the formatting and spacing is poor, the design is poor, it’s super confusing, and the data doesn’t display properly and there’s too much information. It can be overwhelming and majorly confusing. Guess the line is a game, that part is social, there also should be areas to place bets, bet against friends, see lines, see trends, and everything in between."

Answers given one question at a time in the cloud session, each the recommended option:

| Question | Ruling |
|---|---|
| Bet currency | **Virtual Units** for all bets, including bets against friends. No real money moves; GTL stays non-commercial (D-34 basis). |
| Home screen | **This week's game hub**: deadline countdown, your pick status, your rank and units, and one big next action (make picks, place a bet, answer a challenge). Everything else is one tap away. |
| Look and feel | **Sleeper-style** social, card-based app; a **FanDuel-style market row and bet slip inside the Bets tab only**. |
| Friend bets | **One-game challenge**: offer a side, line and units on one game to a friend or the whole league; whoever accepts takes the other side at the same line. |
| Challenge line and standings | Starts at the **current best book line**, which the challenger can change before sending; acceptance allowed **until kickoff**; the result counts in both players' **Bets results and their head-to-head record**. |
| Challenge payout | **Even money**: both risk the same units, the winner takes them, a push returns both stakes. No house cut. |
| Game features | **Streaks, badges, weekly awards** (e.g. Bullseye for an exact guess, Sharp for beating the closing line; Best guess, Biggest upset, Worst beat). No levels or XP. |
| Ways to play | **Two games**: Guess the Line (spread and total guesses, closest wins) and Bets (Virtual Units with friend challenges). Record-only Betting Challenge and Best Bets (D-15) leave the main screens; their past records stay visible in History (D-23). The private journal becomes "My bets" inside Bets. |
| Standings | **Two leaderboards**, one per game, as two tabs on one League screen, each with its own weekly and season winner. |
| Bets ranking | **D-18 unchanged**: ROI, then net units, then wins, with D-18's weekly qualification (3 picks or 3 units). No bankroll or cap. |
| Bet types | **Spread and total** only (D-18), inside the free odds budget. No moneyline or parlays. |
| Game card | **Minimal**: teams, kickoff, current spread and total, your guess or bet, at most one standout trend chip. Book lines, line movement, referee and full trends open on tap. |
| Social | **League feed + reactions + comments**: automatic posts (picks revealed per D-31, bet and challenge results, badges, weekly awards), emoji reactions and comments. |
| Leagues | **One app with a league switcher**: one set of tabs; picks and bets made once count in every league the player is in; the Community is the default league. |
| Brand | **Keep the name and Field monogram; refresh colors, type and spacing** into a darker, higher-energy system. Dark is the default; light stays. |
| Approval | **Clickable phone prototype first** (new app map and main screens), approved by Sean before the build, then staged PRs. The prototype uses public schedule and lines with sample picks only; no player's private picks. |

Work items DASH-1 to DASH-12 track the redesign (app map, design system, game features, Bets, friend challenges, lines board, trends cards, data display fixes, cutting information, social, first-run, phone-first). DASH-1 (the app map, delivered as the prototype) is next. This ruling changes no scoring, settlement, pick or ballot rule and deploys nothing.

## D-34 — Kickoff wind forecast from Open-Meteo (October 13, 2026)

Sean (product owner), verbatim: "go ahead with the wind forecast too".

- **Context.** Only one situational trend beat chance out of sample: strong observed kickoff wind (10+ mph) going Under. The committed card `total|g:g_wind10` in `shared/trends/2026-week-06.json` shows **Results 2018-2025 (period used to select this card): 282-196-5** (hit 0.590), permutation p 0.0099 (best score in each shuffled run), every game since 2002: 898-730-22, this season 6-6-0; the 15+ mph card `total|g:g_wind15` shows 91-68-2 for 2018-2025. The context given with the ruling said 282-197-5 / 58.9%, one game off; the app always renders the file's numbers and never hard-codes them. Until now the card could only apply after a game, because no forecast source was approved.
- **Source.** Open-Meteo, <https://open-meteo.com>, forecast endpoint `https://api.open-meteo.com/v1/forecast`, no key. The server code (<https://github.com/open-meteo/open-meteo>) is AGPLv3; that does not reach GTL, which only calls the hosted API and ships none of its code.
- **Licence.** Open-Meteo's README: "API data is offered under the Attribution 4.0 International license (CC BY 4.0)" and "Include an attribution link next to any location where Open-Meteo data is displayed". GTL shows "Weather data by Open-Meteo.com" linked to <https://open-meteo.com/>, the CC BY 4.0 link and the change note "Kickoff-hour values selected by GTL; wind direction shown as compass points" (one string, kept equal in `cloud/wind.mjs`, `shared/trends-view.mjs` and the SQL `license_note` by tests). It sits next to every forecast value: the wind card on Community Picks, the group ballot and the dashboard game detail, and the trends footer; Data connections names the source with both links. Collapsed summaries never carry forecast values or links.
- **Non-commercial basis.** Open-Meteo's terms: the free API is "for non-commercial use", "Less than 10'000 API calls per day, 5'000 per hour and 600 per minute", and a qualifying example is "private or non-profit websites or apps that do not have subscriptions or advertising". GTL is a private, non-commercial friends' league with no subscriptions, ads, paid tiers or entry fees; the shared Bet Tracker records members' own real-money slips, but GTL itself takes no money. GTL caps itself at **200 Open-Meteo calls (locations) per UTC day**, failures included, enforced in SQL (2% of the free limit).
- **What GTL does.** The hosted `gtl-api` Edge Function is the only caller; the browser never contacts Open-Meteo and the CSP is unchanged. On a member's read (`POST /wind/read`), the server refreshes outdoor and retractable-roof games of that published week that kick off within 120 h: 6 h TTL at 72–120 h, 3 h at 18–72 h, 1 h within 18 h, never after kickoff ([D-47](#d-47--weather-every-24-hours-then-12-hours-and-2-hours-before-kickoff-october-15-2026), October 15, replaced these tiers with a refresh every 24 h, then 12 h and 2 h before kickoff; the rest of this entry stands). Every published week is eligible, so Monday night's game keeps its hourly refresh after D-24 opens the next week on Monday. One multi-location request per refresh, single flight under an advisory lock and a 20 s lease, 60 s spacing, 15/60-minute and until-midnight backoff, and the daily cap (a request that would pass it is trimmed, nearest kickoff first). Values are the nearest model hour to kickoff for sustained wind, direction and temperature, and the hour containing kickoff for gusts and precipitation. Snapshots are append-only in three service-only tables; only stadium coordinates leave GTL, and no member id is stored with an attempt (the lease, spacing, budget and audit need none, so it would only log who opened a panel). Members only: signed-out, local and non-member views keep the "no current forecast" note.
- **Guardrails.** Reference only. Forecasts never change scoring, pick deadlines, kickoff locks, sit-outs or the D-23 reveal; the route reads only the slate and the wind tables. They never enter static assets or the week file, and the frozen registry and week-file copy are superseded on screen only (registry sha256 unchanged).
- **Honesty.** Using the record with a forecast has **not been backtested**, and the panel says so every time it shows forecast numbers, with the file's record label, the full history and this season. A 10 m wind forecast commonly misses by 6–8 mph from day two, so each value is labelled by lead time and a close-call note appears within 3 mph of 10 or 15 mph; the band sentence says what "would fit if this holds", never what to pick. The planned check, Open-Meteo's Previous Runs API (archived since January 2024) against 2024–2025 observed wind, could not be reached from GTL's build environment (egress 403) and is a follow-up from an environment with egress.
- **Revisit triggers.** GTL adds subscriptions, ads, paid tiers, real-money entry fees, sportsbook affiliate or referral links, or sponsorships (commercial use under Open-Meteo's terms); usage approaches 10,000 calls a day; Open-Meteo changes its terms; the backtest result.
- **Delivery.** Branch `claude/wind-forecast` (stacked on `claude/trends-engine`): `cloud/open-meteo.mjs`, `cloud/wind.mjs`, `shared/wind-venues.mjs`, the `cloud/handler.mjs` route and adapter, `web/src/WindForecast.jsx` and `web/src/windTimer.js`, the trends panel wiring, `scripts/check-cloud-boundary.mjs` probes (awaiting deploy) and migration `supabase/migrations/20261013060000_gtl_wind_forecasts.sql`, which is written and **not applied** to the hosted project. Shipping needs Sean's go for the hosted apply (Supabase MCP or SQL editor, never `db push`), a `gtl-api` deploy and a Pages deploy (either order; the panel falls back cleanly), then the post-deploy reachability check in [SOCIAL_COMMUNITY.md](SOCIAL_COMMUNITY.md#deployed-state). See [TRENDS.md](TRENDS.md#kickoff-wind-forecast-d-34).

## D-33 — the timed October 8 eDraft pages are reference lines for the Week 5 ballots saved without a line (October 13, 2026)

- **October 13, 2026, about 02:20 UTC — Sean (product owner), in the cloud session:** "communicate with the other sessions to get things completed. you have full approval for deploying all recommendations". (D-28 to D-32 are reserved for rulings on other branches; this approval is recorded for branch `claude/week5-line-at-guess` as D-33.)
- **What it approves.** The recommendation recorded in D-27's October 13 bullet below ("eDraft reference lines need their own ruling"): the two October 8 eDraft consensus pages that carry a recorded capture time are imported through `gtl_import_reference_lines` as reference lines for the 2026 Week 5 ballots saved without a line, each counted from its capture time and selected in D-27's line-at-the-guess order (the newest stored line at or before the guess, else the first line stored after it and before that game's kickoff):
  - `data/snapshots/2026-week-05-20261008T090121436Z.json`, the 04:33 ET page, captured at 09:01:21.436 UTC;
  - `data/snapshots/2026-week-05-20261008T150212589Z.json`, the 10:03 ET page, captured at 15:02:12.589 UTC.

  Consensus home spreads only (15 lines per page, no totals), from the committed payload `data/reference-lines/2026-week-05-edraft.json`; the pages stay byte-identical (pinned sha256).
- **Not imported.** The 03:33 ET page (`data/snapshots/2026-week-05-edraft-0333ET.json`) records no capture time, so it is not imported (D-16: no invented timestamps). Its spreads equal the 04:33 ET page's.
- **Expected Week 5 result after the import** (each checked by the PGlite replay in `tests/line-at-guess-sql.test.mjs`):
  - Sean's spread scores **95.8**: compared at its stored `submittedAt` (07:33 UTC, original time not recorded), the first line stored after it is the 04:33 ET page captured at 09:01:21 UTC (`first-after-submission`). Before the import it reads 95 against the 19:15 UTC hosted collection. The 96.4 provisional cited in D-25 is the 10:03 ET page, which D-27's order does not select for his spread.
  - Steven's ruled-eligible spread (18:43 UTC) uses the **10:03 ET page** (`newest-at-or-before`, observed 4 h 40 min before the guess) instead of the first hosted collection after it (19:15 UTC).
  - The six later ballots (Sean's and Steven's totals, TJ's and Cuh's spreads and totals) use hosted snapshot **`751dfb85`** (the 20:21 UTC collection), as before the import.
  - Ben's commissioner-ruled spread keeps its D-25 lines and **37.6**; Ben has no Week 5 Total ballot.
- **Unchanged.** No ballot, pick, eligibility ruling or feed post is written: the import appends one `gtl_reference_line_imports` row and 15 `gtl_reference_lines` rows per page (idempotent per file and payload; corrected only by appending a void through `gtl_void_reference_line_import`, nothing deleted, D-23). Sean's Week 5 picks file and the three eDraft pages stay byte-identical.
- **Release order: the hosted apply and the import run after this branch merges.** The prerequisite migrations are applied on the hosted project: `20261012223000_gtl_community_history.sql` as hosted version `20261013023146` and `20261012230000_gtl_submit_with_line_at_guess.sql` as `20261013023542`. After the merge: the read-only pre-flight, then the migration through the Supabase MCP or the SQL editor (never `db push`), then `node scripts/import-reference-lines.mjs --decision D-33 --actor <commissioner uuid> --sql` (or `--execute`), then the `gtl-api` and Pages deploys, in the order of the [release steps](SOCIAL_COMMUNITY.md#line-at-the-guess-and-d-08-eligibility--october-13-2026).
- **Done, October 13, 2026.** `20261013010000` applied hosted as `20261013040845` (byte-identical to `main`); both pages imported, 15 lines each; `gtl-api` v17 and Pages `9dd92b5b` deployed from `main` at `c1f3092`. Hosted Week 5 spreads read as expected: Sean 95.8, Steven 91.4 (10:03 ET page), Ben 37.6; the six later ballots on hosted snapshots. Record: [RELEASE_2026_10_09.md](RELEASE_2026_10_09.md#october-13-second-deploy).

## D-32 — Situational trends beside every game (October 12, 2026)

- Sean, product owner, chose option A: "Preset trend cards from the free data on Picks and the dashboard. Referee trends use a referee you pick from a dropdown for each game once assignments come out".
- He added: "it needs to be more than referee trends, home vs away trends, divisional games, totals, whether it is a night game/primetime game, the teams playing being from afc and nfc, one team traveling, coming off bye week rest, coming off a short week. these are just to name a couple of examples".
- His follow-up the same day: "that is a shortsided trend list. you may be missing trends with the most statistical impact to the outcome. we need quality trends".
- Delivery, on branch `claude/trends-engine`:
  - Every trend is a frozen preset of at most two filters, ranked by an out-of-sample quality score and never by ROI or streak.
  - Sean's families are always shown as context labelled "No proven edge".
  - The only trend that beat chance out of sample (2018–2025) is strong wind at kickoff (10+ mph) → Under. It needs observed wind, so on an upcoming game it is a collapsed conditional note.
  - Tier 2 cards are labelled "not proven". Tier 3 and entity records are shown both ways, with walk-forward card fields.
  - Line-dependent records unlock only after the matching ballot is submitted, sat out or closed. Rows are marked only with the player's own saved line.
  - The commissioner sets each game's referee from a dropdown in the commissioner area. Every member sees that referee's records, or "Referee not assigned yet". Any member can look up another referee on screen without saving it.
- Trend cards are reference only and never change scoring. This ruling places them beside each game, so D-21's "no tips or analysis" line now covers the plain team-records line only.
- Week files and panels ship with a Pages deploy. Shared referee assignments also need migration `20261012234500_gtl_game_officials.sql` (written, **not applied to the hosted project**) and a `gtl-api` deploy.
- Details: [TRENDS.md](TRENDS.md).

## D-31 — when other players' picks become visible (October 12, 2026)

Sean ruled that every player's Guess the Spread and Guess the Total picks become visible to all members on a per-game, per-market basis:

- **At kickoff.** Everyone's pick for a game is visible once that game kicks off.
- **After your own submission.** A player who has submitted their own full ballot for a market sees everyone's submitted picks for that market, as today.
- **Late window guard (with D-30).** A late pick for a game closes for a player the moment that player views that game's revealed picks before submitting their own; the lock is recorded with the time and kept in the audit trail. Without viewing, the D-30 window (15 minutes after that game's kickoff) applies.
- **Unchanged.** A weekly sit-out (D-23) still reveals that market. Spread and Total reveal independently. Drafts stay private. Market lines, references and analysis stay behind the same gate.

This replaces the whole-week deadline reveal with a per-game kickoff reveal. D-30 extends D-27's per-game kickoff lock by the 15-minute late window. Not built yet; this entry records the rule the build must follow.

## D-30 — late picks are accepted and marked Late (October 12, 2026)

Sean ruled that a late Guess the Spread or Guess the Total pick is always accepted, with no request or approval step, and is visibly marked as late.

- **Late.** A pick saved after the week's deadline (TNF kickoff, D-24) is late.
- **Window.** A late pick for a game is accepted until 15 minutes after that game's own kickoff. After that, the game is closed. Games that kick off later in the week (Sunday, Monday) stay open for late picks until 15 minutes after their kickoff.
- **Marker.** Every late pick carries a visible Late indicator with the minutes past the deadline (for example "Late · 12 min"), using the pending (amber) token plus text, never color alone, wherever the pick appears: ballots, comparisons, the Community feed and history, leaderboards and exports.
- **Scoring.** A late pick scores normally against the line at the time of the guess (D-27). Being late does not reduce points.
- **Record.** The save time and lateness are stored with the pick and kept in its audit trail. Nothing is deleted, moved or hidden (D-23); a weekly sit-out (D-23) still closes that market.

This replaces the earlier extension-request, player-vote and commissioner-override process for Guess picks. Betting Challenge selections keep their pre-kickoff quote rules. Not built yet; this entry records the rule the build must follow.

## D-29 — Best Bets rules and friends contests (October 12, 2026)

Sean approved the recommended rule package for Best Bets, the separate optional confidence contest confirmed by D-15. D-27 (line at the guess) and D-28 (web push reminders) are numbered for their own pull requests.

- **Size.** Exactly 3 games per week.
- **Selection.** One spread or total per pick, recorded from a named sportsbook quote with its observation time, the same receipt as the Betting Challenge.
- **Confidence.** The three picks carry 3, 2 and 1 points, each value used once.
- **Scoring.** A win earns its confidence points; a loss earns 0; a push or void earns 0 and is not counted as a decision. Settlement uses the final score and the saved line, as in D-26.
- **Deadline.** Each pick locks at its own game's kickoff. The full set of three must be saved before the first of those games kicks off.
- **Visibility.** Another player's Best Bets are visible after that game's kickoff, or once the viewer has saved a full set for the week.
- **Ties.** Ties stand; there is no tiebreaker.
- **Corrections.** Commissioner only, with an audit entry. Nothing is deleted, moved or hidden (D-23).
- **Friends contests.** A contest is an existing group. Joining a group means accepting its rules. Members see only entries submitted to that contest, never another player's Solo journal, Favorites or private bets.

Historical Challenge selections and scoring are unchanged. Best Bets is not built yet; this entry records the rules the build must follow.

## D-28 — opt-in web push, one deadline reminder (October 12, 2026)

Sean decided the first external notification channel and event:

- **Channel.** Web push only. No email and no SMS. Opt-in per device from Settings & setup (next to Install app) or the one-line "Remind me 2 hours before picks lock" on the Community picks-due card; nothing is registered with the browser or sent to the server until the player taps it. On iPhone and iPad it needs iOS 16.4 or later and the Home Screen app; the app explains this when the browser has no PushManager.
- **Event.** One reminder: a player whose Spread or Total ballot for the open week is neither submitted nor sat out (D-23) gets one push 2 hours before that week's deadline (TNF kickoff, D-24). At most once per player, week, mode and kind; the reminder is recorded before it is sent. Line-movement alerts and every other event stay out of scope (NOT-03).
- **Spoiler protection.** The notification carries the week, the lock time and the modes still due, for example "Week 6 picks lock at 5:15 PM PT. Spread still due." Never a pick, a line, a score or another player. A tap opens the app's own Picks screen; the payload cannot choose a URL.
- **Data.** A push subscription is a device setting, not a pick or other player entry, so turning reminders off deletes that device's row (D-23 governs entries). A dead subscription (push service 404/410) is deleted; five failures in a row disable it. The sent log is append-only. Both tables are service-only (RLS on, no browser grants).
- **Delivery.** Migration `20261013030000_gtl_web_push_reminders.sql`, `gtl-api` routes `/push/status`, `/push/subscribe`, `/push/unsubscribe`, Edge Function `gtl-push-reminders` (D-24 capability pattern, every 15 minutes), `web/public/sw.js` (push and notification click only, no fetch handler or cache) and `worker-src 'self'` in the CSP. The VAPID keys are generated and stored by Sean as Edge Function secrets; no agent creates or handles them. Nothing is applied, deployed or enabled by this decision; Sean's steps are in [WEB_PUSH_SETUP.md](WEB_PUSH_SETUP.md).
## D-27 — October 12, 2026 rulings: weeks still open Monday 12:00 AM PT; submit any time against the line at the guess; every guess kept

Sean, product owner, ruled three things on October 12, 2026.

1. **The week still opens Monday 12:00 AM PT (unchanged).** Each week keeps opening at 12:00 AM `America/Los_Angeles` on the Monday of game week and closing at that week's Thursday kickoff (D-24). Nothing below moves the open, the deadline or a per-game kickoff lock.
2. **Submit any time; scored against the line at the guess.** "they can submit their guesses whenever. The spread when they guessed is the spread that their points total will be compared against". He approved the recommended path ("Complete all open items implementing recommended path forward for each"), which also confirms the October 12 submission odds window constants below (5-minute collect cooldown, six collections per UTC day).
   - **Never refused for refresh limits.** No submission or edit before the deadline is refused because of the collect cooldown, the daily cap, the budget guard, a busy lease or a provider failure. When the newest stored line is more than five minutes old the save still tries one collection inside the free limits; the save never depends on it.
   - **The line at the guess.** Each changed guess saves, server-selected from `gtl_market_snapshots` (a client cannot supply a reference or a line value), the newest qualifying stored line for that game and market at the save instant, with `observedAt` and `ageSeconds`. Points compare the guess with that line. The five-minute freshness rule no longer decides whether a reference is scored; the age is shown.
   - **Pending, then the first line after submission.** With no qualifying stored line yet (for example right after the Monday open), the guess saves with reference status `pending` (unscored). Its reference becomes the first qualifying line collected after the save and before that game's kickoff, labelled "First line after submission", with its `observedAt` and `ageSeconds`. Book observation times are not compared with the save: a book whose last update precedes the save still counts (D-17 already keeps each observation within five minutes of its collection, so the age is then at most five minutes before the guess). A collection made before the save is never used for a pending guess, also when it was stored after the save. The collection that stores the line resolves it in the same transaction, replacing only the pending reference and appending a `reference_resolved` audit event (picks, save times and the weekly revision stay). Resolution can happen after the deadline, up to each game's kickoff; a guess on the first game (kickoff = deadline) stays pending and unscored if no line arrives before that kickoff.
3. **Every guess is kept in the player's account and shown.** "all historical guesses for all individuals should be saved in their accounts", and shown in the Community. Nothing a player saved is rewritten or deleted by this change: references stored before it (`available`, `stale`, `unavailable`, or none for the imported Week 5 ballots) keep their exact bytes, `stale` and `unavailable` ones keep no value and stay unscored, nothing is rescored, and every save and resolution appends to the ballot's audit. The Community Picks game cards show each of the player's submitted guesses with its saved line ("Line at your guess" or "First line after submission", its time and age) or its pending state. The all-players, all-weeks Community history view is separate work from branch `claude/community-history`, recorded under ruling 3 below.

- **Unchanged.** The deadline, kickoff locks, the full-ballot rule, revision conflicts, membership, D-23 and D-18.
- **Delivery.** Migration `20261012230000_gtl_submit_with_line_at_guess.sql` (apply after `20261012213000`); `cloud/submission-odds.mjs` (the refresh is advisory, the database commit is authoritative); engine, source projection and UI copy ("Line at your guess: −3.5 at 2:11 PM PT · observed 14 min before your guess"). Verified locally on PGlite through the real `gtl-api` handler; as of October 12 not applied to the hosted project and not deployed. The hosted apply and the `gtl-api` and Pages deploys are a separate, authorized and recorded release. *October 13, 2026:* the migration is applied on the hosted project as version `20261013023542`, verified byte-identical to the repo file and entered in both repair lists in [step 2 of the release checklist](SOCIAL_COMMUNITY.md#release-checklist--october-9-2026). The `gtl-api` and Pages deploys that ship it are still to come: none is recorded yet (the live `gtl-api` v15 and Pages `06c71c14` are built from `17c22b5`).

### D-27 ruling 3 — Community history: every guess is kept and shown (October 12, 2026)

- **October 12, 2026 — Sean (product owner):** "all historical guesses for all individuals should be saved in their accounts and shown in the community section, make sure you accumulate all data that's been stored. All players made picks last week for totals and spreads." And on the scoring line: "the spread when they guessed is the spread that their points total will be compared against."
- **What this means.** Every stored Guess the Spread and Guess the Total ballot of every member, for every season, week and market, is shown in the Community under a History tab, one player at a time with the weeks newest first: each guess, the line saved with it (D-16), the final when one is recorded, and the points that saved line gives (the same expression as the leaderboard). The D-23 reveal gate still applies to another member's open-week guesses; weekly totals are shared as they are on the leaderboard; the last change, the revision count (edits after submitting) and the provenance stay the owner's own, as the group reader keeps audits and provenance. A draft saved before sitting out stays stored and the week reads sat out. Nothing is deleted, moved or hidden (D-23); existing rows are not touched.
- **Ballots without a saved line.** The Week 5 ballots migrated from the group leagues (Cuh, Fistathon, Sthomas, TJ; Spread and Total) carry no saved scoring reference and no hosted snapshot exists before their submission instants, so under D-16 no line is invented: the history shows the newest hosted 3-book snapshot captured at or before each submission, labelled "nearest snapshot at submission" and never used for points, or "no line stored" when there is none. Scoring them against "the spread when they guessed" needs a commissioner-ruled reference per player on the D-25 pattern (a separate, ruled write path; not part of this read path). Ben has no Week 5 Total ballot, which the history shows as no totals ballot, not as an error.
- **Delivery.** Migration `20261012223000_gtl_community_history.sql` (service-only readers `gtl_read_community_history`, `gtl_history_reference` and the lifted standings expression `gtl_pick_points`; no table changes), route `POST /community/history`, the Community `#history` tab, and local PGlite, handler and browser tests. As of October 12 not deployed: the migration was to be applied through the Supabase MCP or SQL editor (never `db push`) and the route ships with the next `gtl-api` and Pages deploys; see [SOCIAL_COMMUNITY.md](SOCIAL_COMMUNITY.md#community-history--october-12-2026). *October 13, 2026:* the migration is applied on the hosted project as version `20261013023146`, verified byte-identical to the repo file and entered in both repair lists in [step 2 of the release checklist](SOCIAL_COMMUNITY.md#release-checklist--october-9-2026). The `/community/history` route and the History tab still ship with the next `gtl-api` and Pages deploys: none is recorded yet (the live `gtl-api` v15 and Pages `06c71c14` are built from `17c22b5`).
- **October 13, 2026 — the line at the guess for ballots without a saved line; D-08 eligibility in the community.** Sean's rulings of October 12, 2026: (2) "they can submit their guesses whenever. The spread when they guessed is the spread that their points total will be compared against" and (3) "all historical guesses for all individuals should be saved in their accounts and shown in the community section, make sure you accumulate all data that's been stored. All players made picks last week for totals and spreads". D-08 (October 8): Sean and Steven's submitted Week 5 spread guesses count; the practice designation is superseded by the recorded eligibility rulings while `origin_practice` and the provenance stay.
  - **Read time only.** No ballot, eligibility ruling or feed post is written. A submitted guess with no saved line is compared, whenever the community readers run, with the line at the guess in D-27's order: the newest stored line at or before the guess, of any age, else the first line stored after the guess and before that game's kickoff. Stored lines are the hosted 3-book collections, judged exactly as D-27's save path and pending resolver judge them, and commissioner-imported reference lines counted from their recorded capture time (a page's own time is never treated as the time it was stored). The guess instant is the newest submission or post-submission edit event that set the pick (an edit re-anchors), else `submittedAt`. Saved (D-16/D-27) and ruled (D-25) lines always win and are never re-resolved; `stale`, `unavailable` and `pending` ones stay unscored as D-27 keeps them.
  - **Supersedes ruling 3's reading for ballots without a saved line.** Its sentences "labelled 'nearest snapshot at submission' and never used for points" and "Scoring them against 'the spread when they guessed' needs a commissioner-ruled reference per player on the D-25 pattern" are kept above as the October 12 record; from this change those ballots are scored against the line at the guess, which for every Week 5 ballot is a hosted line or, after the D-33 import, an imported one. The nearest-snapshot label remains only for a provider that still returns it.
  - **Eligibility.** Every community reader that filtered `not origin_practice` now uses the effective eligibility the group reader has used since October 8: the ballot's eligibility ruling if one is recorded, else `not origin_practice`. Sean's and Steven's Week 5 spreads (eligible rulings) are scored and ranked; Steven's row keeps `origin_practice = true`. A practice ballot without an eligible ruling, or a ballot ruled ineligible, is listed in History with its guesses and lines, labelled, and never scored or ranked (D-23).
  - **Sean's Week 5 Spread is compared at its stored submission time.** The seed that migrated it records "original submission time unavailable", and its `submittedAt` (07:33 UTC) is the 03:33 ET eDraft page's own time. That stored `submittedAt` is the submission time the ballot carries, kept as stored (D-16; ruling 3: "make sure you accumulate all data that's been stored"), so it is the guess instant; only a later edit would re-anchor a pick, and a submission event in the audit never stands in for it. Every instant the record allows for his guesses (the stored 07:33 UTC and the repository's pick commits, `23647e8` at 08:03:33 UTC to `78a2928` at 08:17:14 UTC) selects the same stored line, because nothing was stored between 07:33 UTC and the 09:01:21 UTC eDraft capture: before the eDraft import (approved as D-33; see the next bullet), the first hosted collection after it (19:15 UTC, 95 points); after it, the 04:33 ET page captured at 09:01:21 UTC (95.8, the same 15 values as the 03:33 ET page). The ballot counts (D-08) and is ranked with those points; History labels its time "original time not recorded" and each line "compared at the stored submission time". A ballot whose stored `submittedAt` cannot be read has no line and no points; none is invented.
  - **eDraft reference lines need their own ruling (approved October 13, 2026: D-33).** D-27 makes a line server-selected from stored collections; it does not make an eDraft page a stored line. The import path (`gtl_import_reference_lines`, commissioner-only, limited to 2026 Week 5, idempotent per file and payload, voidable through `gtl_void_reference_line_import`) and the payload of the two captured October 8 pages (`data/reference-lines/2026-week-05-edraft.json`, consensus spreads only) are ready; an import needs Sean's ruling recorded here under its own number after D-27 (the script refuses any other number). Sean approved it on October 13, 2026, recorded as D-33 above; the hosted apply of `20261013010000` and the import run after this branch merges. The 03:33 ET page is never imported: it records no capture time. Before the import Steven's Week 5 spread (18:43 UTC) is compared with the first hosted collection after it (19:15 UTC, observed 31 minutes after the guess); after it, with the 10:03 ET page captured at 15:02 UTC (observed 4 h 40 min before the guess). Sean's Week 5 spread (stored 07:33 UTC) likewise reads the 19:15 UTC collection before the import and the 04:33 ET page captured at 09:01 UTC after it. Every other Week 5 ballot is compared with the 20:21 UTC hosted collection either way. Ben's ruled spread keeps its D-25 lines (37.6); Ben has no Week 5 Total ballot.
  - **One scoring function.** The leaderboard standings and the History tab take every per-pick reference and point from `gtl_ballot_pick_scores`, so they cannot disagree.
  - **Flag for Sean.** D-27 keeps D-16-era `stale` and `unavailable` saved references unscored even where a line existed at the guess, while a ballot that saved no reference at all is now scored against a line of any age, so the two cases are treated differently under the same ruling. Sean's own Week 5 spread reads 95 (the 19:15 UTC hosted collection) until the eDraft import (approved as D-33) and 95.8 after it, not the 96.4 provisional cited in D-25 and RULES.md: that figure is the 10:03 ET page captured at 15:02 UTC, later than the first line after his stored submission time, so D-27 does not select it for him (Ben's ruled spread keeps it). A different reference for his spread would be a new ruling.
  - **Delivery.** Migration `20261013010000_gtl_line_at_guess_reads.sql` (apply after `20261012223000` and `20261012230000`), `scripts/import-reference-lines.mjs`, the `/community/history` fields `eligible`, `eligibility`, `submittedAtKnown` and the `line-at-guess` reference (with `guessedAtKnown`), and the History copy. Verified locally on PGlite through the real handler and in the browser at 390 px and 1280 px; not applied to the hosted project, not imported and not deployed yet: under Sean's approval (D-33) the hosted apply and the import run after this branch merges, then the `gtl-api` and Pages deploys. Its prerequisites `20261012223000` and `20261012230000` are applied hosted (`20261013023146`, `20261013023542`). See [SOCIAL_COMMUNITY.md](SOCIAL_COMMUNITY.md#line-at-the-guess-and-d-08-eligibility--october-13-2026).

## D-26 — Virtual Units settlement (October 9, 2026)

Sean confirmed how D-18 Virtual Units picks settle. Each pick settles with standard sportsbook rules against the **final score**, using the named-book line and odds saved with the pick:

- **Grading.** A spread pick wins if the chosen side covers the saved line; a total pick wins if the final combined score is over or under the saved total as chosen. Landing exactly on the line is a push.
- **Units.** A win credits units × (decimal payout − 1), where the decimal payout is 1 + (odds > 0 ? odds / 100 : 100 / |odds|), the American-odds conversion the shared Bet Tracker code already uses (1U at −110 earns +0.9091U, 2U at +120 earns +2.4U; the product is rounded once to four places from the unrounded multiplier, so 0.5U at −110 earns +0.4545U). A loss debits the staked units. A push returns the stake with no change. Record, net units and ROI count settled picks only.
- **Void.** A postponed, cancelled or otherwise unplayed game voids the pick: the stake is returned and the pick is not counted in the record or ROI. Weekly qualification rules from D-18 are unchanged, so a voided pick keeps its pick and unit credit.
- **Audit.** Settlement never changes a pick's saved side, line, odds, units or timestamps. It appends a settlement result (final score, settled time, source) to the pick and a before/after event to its audit. Re-running the same finals changes no settled pick and writes no new version; a pick placed or re-saved since is graded against the recorded result so nothing stays pending behind it. A later corrected final re-settles affected picks from their original saved terms and records the previous outcome. A postponed void is terminal for that placement (a fresh pick at the rescheduled market replaces it); a cancelled void is a ruling and is re-graded if a later verified final corrects it.
- **Source.** Finals come from the free public nflverse `games.csv` that team records already use; the file carries no game status, so postponement and cancellation are never inferred from it and stay an explicit input for a verified-source path. The file carries every NFL game of the week while a published slate may be a subset, so a row for a game that is not on the slate is reported as skipped and settles nothing; it never blocks the rest of the week. A settlement run from a local copy of the file records that file, not the public URL, as its source.
- **Delivery.** Migration `20261009170000_gtl_virtual_units_settlement.sql` (ledger `gtl_virtual_units_settlements`, service-only `gtl_settle_virtual_units(p_season, p_week, p_results)`), the finals builder `cloud/virtual-settlement.mjs` and script `scripts/virtual-units-settle.mjs`, the commissioner-only route `POST /virtual-units/settle`, and settled results on the Virtual Units screen. No cron job is registered by this decision; a scheduled run is the documented follow-up. Settlement ships after the next `gtl-api` deploy; see the runbook in [planning/virtual-units-game.md](../planning/virtual-units-game.md#settlement-runbook--d-26). *Addendum, October 9, 2026 (18:46 UTC):* after PR #33 merged, the migration was applied to the hosted project through the Supabase MCP as hosted version `20261009184601`; the ledger is empty until the first settlement. The pre-existing `isfinite(numeric)` defect in `gtl_save_virtual_units_pick` (every D-18 pick save fails with SQLSTATE 42883 on the hosted project) is fixed by a separate follow-up migration. *Addendum, October 10, 2026 (about 14:45 UTC):* Sean ruled that `gtl-api` v15 and the Cloudflare Pages frontend are deployed from `main` at `17c22b5` by the "Cloud/local repo sync for Guess the Line" session on the Mac mini, with the credentials that session already holds and no new tokens; the same session fills the PENDING rows of the [October 9 release record](RELEASE_2026_10_09.md). A second deploy follows with the keyboard model (PR #47) and PR #36.

- **Ruling, October 12, 2026 — submission odds window (constants confirmed with D-27 above; the refusal it addressed no longer exists under D-27).** Steven's complete Week 6 ballot was refused with `GTL_SUBMISSION_REFRESH_COOLDOWN` (HTTP 429) eight to ten minutes after Sean's 21:11 UTC submission collection. A saved market reference is usable for five minutes (the D-16/D-17 freshness rule, unchanged), but the submission path refused a new collection for fifteen minutes after any collection, so about ten of every fifteen minutes were a guaranteed refusal (reproduced locally at 5, 6, 8, 10, 12 and 14 minutes). Separately, both October 12 scheduled runs skipped with `slate_changed`: the collector derived its slate from the private group league (still Week 5, fifteen games; nothing advances it) while `gtl_publish_week` had pointed the schedule at the community Week 6 slate (fourteen games), and the claim demanded exactly fifteen games. Branch `claude/fix-submission-odds-window` carries migration `20261012213000_gtl_submission_odds_window.sql`: the collect cooldown in both begin RPCs becomes **5 minutes**, equal to the freshness window, and the shared cap becomes **6 collections per UTC day** (the two scheduled runs count inside it; worst case 6 × 2 × 31 = 372 credits, 128 above the 50-credit reserve on the 500-credit free plan); scheduled and manual collection resolve their slate from the published week (`gtl_weekly_slates` plus the matching `gtl_schedule_templates` row, the submission path's own source) and accept the published game count. The freshness rule, the two-credit reservation, the preflight cooldown, the lease and the replay rules are unchanged, and the file only replaces functions: no collection, snapshot, intent, ballot or budget row is written. The five-minute cooldown was recorded as **not approved** in the [October 8 release record](RELEASE_2026_10_08.md) and in `planning/audits/pick-completion-verification.json` ("fifteen-minute / four-attempt rules retained"), so this amends the D-10 and D-17 operating limits only once Sean confirms the constants. The migration was **applied to the hosted project on October 12, 2026** through the Supabase MCP as version `20261012235554` after Sean confirmed the constants, and verified (both begin RPCs read the 5-minute cooldown and the 6-per-day cap); before that the hosted limits were four attempts and fifteen minutes.

## D-25 — Ben's Week 5 picks and scoring reference (October 9, 2026)

Ben signed up and gave Sean his 15 Week 5 spread picks on Thursday, October 8 at 12:00 PM PT, before the 5:15 PM PT deadline. Sean ruled they count as on-time and are recorded in `data/picks/2026-week-05-ben.json`. Because no D-16 consensus snapshot exists for 12:00 PM PT, Sean ruled that Ben's Week 5 picks score against the eDraft snapshot updated 10:03 ET (`data/snapshots/2026-week-05-20261008T150212589Z.json`), the same reference as Sean's provisional 96.4, labelled a commissioner-ruled reference. This is a one-week ruling, not a change to D-16.

*Addendum, October 9, 2026 (later the same day):* Sean ruled **where** the picks count: on the shared community leaderboard and feed only (the D-21/D-23 world). The Triple Threat group roster stays Sean, Troy, Luke: no `gtl_memberships` row, no league roster entry and no group standings entry for Ben. Delivery: migration `20261009160000_gtl_ruled_ballot_import.sql` adds the service-only RPC `gtl_import_ruled_ballot`, callable only by the community commissioner, which writes Ben's hosted ballot exactly as a submission-time save would have (the ruled eDraft 10:03 ET value as each game's saved scoring reference, `submittedAt` 12:00 PM PT October 8), records the ruling in `gtl_ruled_ballot_imports` and `gtl_access_audit`, and lets the unchanged feed trigger post the submission dated at that time so the D-23 reveal gate applies as usual. The fresh-submission guard is bypassed only while that one function is on the call stack; every other writer is checked as before. `scripts/import-ruled-ballot.mjs` validates `data/picks/2026-week-05-ben.json` (unchanged) and runs the RPC with the service role from the environment. *Second addendum, October 9, 2026 (17:44 UTC):* after PR #32 merged, the migration was applied to the hosted project through the Supabase MCP (hosted version `20261009174341`) and the import ran once (15 picks, 15 references, feed post `d07a0746-c4f0-4146-a6b9-7ac584fa3a6a`); a replay changed nothing. Details in the [October 9 release record](RELEASE_2026_10_09.md).

## D-24 — automatic weekly pick window (October 9, 2026)

Sean confirmed that each NFL week's pick window opens by itself and closes at the existing deadline:

- **Open.** Guess the Spread and Guess the Total picks for a week open at **12:00 AM America/Los_Angeles on the Monday of game week** — the Monday at or before the week's first kickoff, three days before a Thursday night game. Nobody can save a draft or submit before the open; the database refuses the write (`GTL_PREDICTION_NOT_OPEN`, shown as "Week N picks open Monday 12:00 AM PT.").
- **Close.** The window closes at that week's Thursday Night Football kickoff, the existing deadline. Deadline, edit-until-deadline and D-16 submission-time scoring rules are unchanged.
- **Automatic publish.** A hosted scheduler (pg_cron → `gtl-week-open` Edge function, the same one-run capability pattern as the twelve-hour odds collector) publishes the week whose first game is the next one after now, through the same `gtl_publish_week` RPC as the commissioner's Publish Week, acting as the authorized commissioner. An identical republish is a no-op. Monday 00:00 Pacific is registered as two UTC cron jobs, `0 7 * * 1` (PDT) and `0 8 * * 1` (PST); the worker itself refuses to open a week before its Monday, so the off-season-time job is a recorded no-op and nothing ever opens early.
- **Fallback.** The commissioner's manual panel stays as "Preview / publish early (fallback)" and shows the scheduler status.
- **Notice.** The picks-due notice starts at the open; before then Home and the Picks tab show "Week N opens Mon <date> 12:00 AM PT" with entry disabled.
- **Delivery.** Migration `20261009150000_gtl_auto_open_week.sql`, function `gtl-week-open`, and an administrator-run cron registration recorded in [SOCIAL_COMMUNITY.md](SOCIAL_COMMUNITY.md). Nothing is enabled by default and nothing was deployed from the cloud session. *Addendum, October 9, 2026 (later the same day):* the migration (hosted version `20261009110743`), `gtl-week-open` v1, both cron jobs and the enabled `nfl-weekly` schedule row were applied to the hosted project through the Supabase MCP; see the [October 9 release record](RELEASE_2026_10_09.md).

## D-23 — user data is never deleted, moved or hidden (October 9, 2026)

Sean confirmed the data rule for everything a player enters:

- **Nothing is deleted, moved or hidden.** Posts, comments, likes, submitted and draft ballots, Challenge selections, virtual units, Bet Tracker entries, standings rows and member entries stay where they are and stay visible to every community member. Commissioner removal blocks the removed account from reading, posting and picking in the community; it hides nothing from anyone else, and the member list carries a `removed` flag instead of dropping the entry.
- **The single exception is the Guess pick reveal gate.** A viewer sees other players' Guess the Spread or Guess the Total picks for a season/week/mode only after submitting their own full ballot for that mode, or after a final weekly opt-out ("Sit out this week") for that mode. After the deadline everything is visible, as before.
- **Sitting out is final.** It forfeits that mode's score for that week, which is recorded as *sat out* and never as zero, clears that mode's picks-due notice, reveals the other players' picks for that mode, and closes that mode's ballot for the week: no draft or submission can follow it. It is per mode, so sitting out Total does not touch Spread. It is refused after the deadline and once that mode's ballot is submitted.
- **Group game screens follow the same gate.** The league engine treats an opt-out exactly like a submitted ballot for the reveal, with no change to scoring references.

## D-22 — coming-soon leagues and team marks (October 9, 2026)

The product owner confirmed two changes:

1. **Coming-soon leagues.** NFL stays the only live league. The Community home has a league switcher: NFL (live, selected by default) plus NBA, MLB, NHL, College Football and College Basketball, each marked "Coming soon". Choosing a coming-soon league shows only that league's card. It does not open anything live. The Feed tab has a "Coming soon" section with one card per upcoming league. Each card shows the league name, the league's typical season window (not dates for a specific season) and a "Notify me" toggle. Interest is saved per account in `gtl_league_interest`. Each card also shows how many members want to be notified. These leagues have no games, picks, schedules or odds. The visuals are original: text badges and generic icons, no league logos. See [SOCIAL_COMMUNITY.md](SOCIAL_COMMUNITY.md#coming-soon-leagues--d-22).
2. **Team marks.** The 13 official team marks that were reviewed as public domain stay. The other 19 teams get original Guess The Line color badges, merged on `main` through PR #17 (`web/public/team-logos/badges/`, registry `originalTeamBadges`). Rights checks on the official marks for those 19 teams are still pending: commons.wikimedia.org is blocked in the cloud session, so they could not be checked there. *Addendum, October 9, 2026 (later the same day):* the BUF and NYJ official marks, reviewed on the Mac mini from their public-domain Commons records, were activated through PR #30, so the registry now holds 15 official marks and 17 original badges; see [TEAM_LOGO_SOURCES.md](TEAM_LOGO_SOURCES.md#buf) and [#nyj](TEAM_LOGO_SOURCES.md#nyj). *Second addendum, October 10, 2026 (about 14:45 UTC):* Sean ruled that, after the first deploy from `main` at `17c22b5`, the same "Cloud/local repo sync for Guess the Line" session on the Mac mini reviews and fetches the 17 remaining official team marks from Wikimedia Commons with provenance, the way BUF and NYJ were done on October 9, because commons.wikimedia.org stays blocked for the cloud container.

## D-21 — social community, feed and button entry (October 9, 2026)

Sean confirmed that Guess The Line works as a social leaderboard game:

- **One community.** Every signed-up account joins one community with one feed and one overall leaderboard. Existing private groups remain as leaderboard filters with their own standings and preserved history. New sign-ups join automatically; the commissioner can remove an account.
- **Sharing.** All user data is shared with every community member: scores, records, standings, Challenge selections, virtual units, Bet Tracker activity and submitted ballots. The one exception is Guess the Spread / Guess the Total picks. A player sees others' picks for a market only after submitting their own full ballot for that market. Before then they see who has submitted, not the numbers.
- **Home feed.** Home is an activity feed with a combined leaderboard strip (Spread points, Total points, Challenge W-L-P, Units ROI) and a pinned picks-due card. Automatic posts cover ballot submissions, revealed picks, score changes, Bet Tracker bets and results, and weekly winners. Members can like and comment. Each game is a tab off Home, and secondary pages live inside those tabs.
- **Required picks.** Every account owes a full Guess the Spread and a full Guess the Total ballot each week. The in-app notice ("Week N picks due · Spread x/N · Total y/N") appears on Home and as tab badges when the slate is published, and becomes urgent 2 hours before TNF kickoff. Betting Challenge, Virtual Units and Bet Tracker stay optional.
- **Button entry.** Tap the favorite team or Pick'em, then tap a number chip from 1 to 10 in half points. A More chip covers 10.5–20, and −/+ 0.5 buttons fine-tune. Typing is removed. Totals use the same chip pattern around a central value with a ±10 range.
- **Team facts.** Each game shows one line per team with no tips or analysis: overall W-L(-T) plus the away team's road record and the home team's home record. Records are computed from 2026 final scores in the free public nflverse schedule file, refreshed after each week's finals, and labelled "as of Week N".
- **Delivery.** The work ships as reviewable PRs that must pass CI. Sean, or a machine with the Cloudflare and Supabase logins, applies the migrations and deploys using a written checklist. Nothing is deployed from the cloud session.

## D-20 — Week 6 scoring engine under D-16 (October 9, 2026)

Sean confirmed a commissioner-run TypeScript engine for Guess the Spread and Guess the Total: separate points out of 10 per game and separate closest-pick W-L-T for Sean, Troy and Luke, with tests. Picks are commissioner-entered in `data/picks/2026-week-06.json` as append-only revisions, editable any number of times until actual Thursday Night Football kickoff. Consensus comes from manually recorded, timestamped named-book quotes in `data/snapshots/` behind a 3-book median gate. After the October 9 branch consolidation, Sean confirmed that D-16 submission-time scoring governs both modes from Week 6 on: each pick is scored against the verified consensus that was fresh when its current value was saved, a same-value save does not refresh it, and later market moves never rescore it. This replaces the engine's original common kickoff-freeze benchmark. The deployed app remains the system of record; the engine is a local audit and fallback tool. This entry was briefly numbered D-19 on `main`; D-19 is the social Bet Tracker. See the [scoring engine guide](SCORING_ENGINE.md).

## D-18 remaining mechanics — confirmed October 8, 2026

Sean approved the recommended defaults for BET-07-Q20 through Q30. A pick proven to have been placed after actual kickoff is voided, its virtual stake is returned, it is excluded from ROI and weekly qualification, and the placement/correction audit and player notice are retained. Once play has actually started, picks and edits do not reopen; a suspended game remains pending through a verified resumption and grades its eventual final, while an official cancellation/no contest uses the confirmed void path. A fresh pick after a different-day reschedule requires a saved named-book quote mapped to the verified rescheduled event and market; the old event quote is not recycled. Any edit, including units-only, confirms the full revised side/line/odds/units and creates an immutable revision. Withdraw-and-replace is not a separate action in v1. Unit controls include 0.5–3U presets and ±0.5U steps above 3U with no business cap, using finite positive half-unit values. Eligible weekly standings rank ROI, then net units, then wins, with shared ties; a qualified week with no settled picks shows ROI unavailable. One account-level virtual pick is reused across groups; the player's picks are immediate and other players' picks appear after kickoff unless shared earlier. Competition week comes from the canonical NFL schedule. Equal offers prefer the newest observation, then a stable book-key tie-break. Late-pick and corrected-result notices persist in-app and use opt-in push/email only when each channel is connected, with delivery receipts. These mechanics are confirmed product rules, but source verification, implementation and deployment remain separate evidence gates.

Addendum, October 9, 2026 (save-path defect, found in the PR #33 review): the hosted `gtl_save_virtual_units_pick` from `20261008240000_gtl_virtual_units.sql` checks its numeric terms with `isfinite()`, which PostgreSQL defines only for date/timestamp/interval, so every D-18 pick save fails with SQLSTATE 42883 (`function isfinite(numeric) does not exist`) and no pick can be saved on the live project. Follow-up migration `20261009190000_gtl_virtual_units_save_isfinite.sql` re-creates the function verbatim with the three numeric checks routed through an immutable helper (`gtl_numeric_is_finite`) and, on the same check line, refuses a missing or null `quotedAt` or `source` (the original let those null terms through SQL three-valued logic; a saved named-book quote is mandatory above); no rule above changes. Applied to the hosted project from the cloud session on October 9 at 21:32 UTC as hosted version `20261009213204`, after PR #40 merged (see [RELEASE_2026_10_09.md](RELEASE_2026_10_09.md)).

The reconciled current rules are in [RULES.md](RULES.md). This log preserves the order and wording of historical decisions, including subsequently superseded readiness claims. Only entries explicitly marked confirmed are decisions; D-16 records submission-time scoring, D-17 adds fresh-source enforcement and sportsbook detail, D-18 establishes a separate virtual units game, and D-19 adds deliberately shared bet tracking. Use the current tracker and linked verification records for implementation and deployment state.

- **D-11 — October 8, 2026: GTL model plus permitted outside sources.** Sean selected “Build our model plus permitted outside sources (recommended).” Build separate spread/margin and total forecasts from licensed free inputs, validate with point-in-time historical tests, identify current-input gaps and label the model Guess The Line. Add outside forecasts or expert material only when access and reuse permission are established. Keep original sportsbook guesses separate from outcome predictions; neither agreement nor a point gap is established EV. No paid data authorized.
- **D-12 — October 8, 2026: selected identity and usable presentation controls.** Site title: “Guess The Line.” Primary logo: option 01 Yardline G. App icon: option 01 Field monogram. Make dashboard layouts, section visibility, motion and in-page notices usable and saved, while clearly separating those notices from future push/email/SMS. Other brand categories remain provisional.
- **D-13 — October 8, 2026: Total dashboard parity.** Sean requires Over/Under alongside Spread, with simplified visual comparisons and provisional results before benchmark freeze. Show each submitted mode's separate accuracy, gaps, opponents and real recorded history; preserve independent reveal gates and immutable guesses. Provisional Total analysis uses one complete recorded three-book snapshot; this is not an automatic extension of D-09's official Spread-only policy or an actual kickoff freeze.
- **D-10 — October 8, 2026: twelve-hour collection and visual dashboard.** Sean requested automatic market refresh every 12 hours, simpler visual summaries (line charts and bar charts) that open into detailed data, and a concrete path to connect the unavailable analysis sources. Run collection on hosted infrastructure, reuse the existing free provider and quota protections, and preserve prediction locks and the separate fresh-at-kickoff scoring requirement. Existing GTL colors/fonts remain provisional; this is a functional dashboard change, not final brand approval. Source cards require actual licensed inputs; the request does not authorize paid data or fabricated projections, public activity or sharp signals. Implementation and live verification are recorded in the tracker and CLOUD_SETUP.
- Fixed initial game: Sean Balsiger, Troy Jun, Luke Jun. Commissioner Sean; no backup manager.
- Multiple independent competitions and scoring modes, including Duel, Triple Threat, Free-for-All.
- Six requested sources: Action Network consensus, ESPN, DraftKings, FanDuel, Circa, Pinnacle. Cross-check sources; consensus is second gate. >=85% within +/-5 of normalized median, with stronger independent-source requirements.
- Thursday 12 PM Pacific benchmark; kickoff cutoff normally 5:15 PM Pacific; 15-minute extension-request grace to 5:30 PM when kickoff 5:15.
- One edit PER PICK before kickoff (supersedes older unlimited-edits wording and erroneous one edit per week).
- Other players' guesses visible once a player's entire ballot is submitted; no premature benchmark/score reveal.
- Missed deadline case by case; player voting by default; commissioner Sean can override; default approved forfeit zero; extenuating circumstances extensions.
- Notify slate availability, incomplete-player reminder two hours before kickoff, commissioner kickoff summary. No 30-minute reminder.
- Immediate movement alerts at 1.5 and 3 points, via independently optional push, text, email.
- Mobile-friendly website and native iPhone app desired.
- 2026 Week 5 Game 1 Sean entered Dallas Cowboys -9.5 vs Tampa Bay. Earlier -7.5 was assistant transcription error; correcting does not consume an edit.
- Many features remain unimplemented. Do not imply this GitHub repo already contains deployed app or live integrations.
- 2026-10-08: User clarified Guess the Line and Betting Challenge are two separate games with separate records. Guess the Line predictions are editable until submission deadline; prior one-edit-per-pick rule superseded for Guess the Line. Betting Challenge supports virtual spread, moneyline, and over/under picks throughout the week.

- 2026-10-08: Betting Challenge is based on win-loss record, not profit or bankroll. Remove virtual $100 bankroll as default. Track wins, losses, pushes and win percentage for spread, total and moneyline picks.

- 2026-10-08: Record-based Betting Challenge default is one pick per game per player, either spread or over/under; leagues can override the per-game pick limit. Moneyline is not part of this default mode.

- 2026-10-08: Link Guess the Line to Betting Challenge with a comparative edge board: user's original predicted spread, verified market consensus, and independently sourced professional model; rank largest gaps and closest guesses; record potential betting edges and eventual W-L-P outcomes. Keep totals projections separate, preserve predictions, and never invent live odds or professional projections.

- 2026-10-08: For Guess the Line, add separate per-matchup closest-to-actual-spread W-L-T record for head-to-head and three-player formats alongside existing accuracy points; compare absolute errors, record ties fairly, show weekly and season totals. Keep separate from Betting Challenge W-L-P.

- 2026-10-08: User supersedes Thursday-noon scoring freeze: provide a continuously updated provisional score dashboard after picks are submitted, with historical point movement as consensus spreads change; lock the official benchmark at actual TNF kickoff. Preserve timestamped source snapshots and a locked immutable scoring reference. Live polling/hosting not yet confirmed.

- 2026-10-08 — D-01 confirmed: Sean selected the recommended separation of values. Guess the Spread and Guess the Total remain competitions predicting the sportsbook benchmark. Add a separate optional personal forecast of the expected winning margin or combined points for analysis alongside independently sourced models. Personal forecasts must not overwrite competition guesses or affect their accuracy scoring; a point discrepancy alone is not a probability or positive expected value. Implementation remains open as PRED-01 in `planning/project-tracker.json`. The post-submission reveal/edit policy is a separate unanswered decision (D-02); current behavior is unchanged.

- 2026-10-08 — D-03 confirmed: Sean requested universal account signup and player-created private games/groups with invitations, beginning with Steven Olmstead. Implemented initial scope: confirmed accounts, display names, My games, independent two-person Duels or Groups up to 20, creator-managed recipient-bound invitations, and explicit acceptance. The fixed Sean/Troy/Luke competition remains protected. Spectator roles, nested groups and accepted-member removal remain future work. Recipient contact and invitation links remain private.
- 2026-10-08 — First new-game setup: Sean & Steven was created as a separate practice Duel because the supplied conversation reports prior line exposure. Practice retains the original deadline and cannot generate official benchmarks. The invitation is prepared, not emailed or accepted. Live signup for ordinary players still requires email/OAuth configuration; no account was created on Steven’s behalf. This setup does not resolve D-02 or alter existing reveal/edit rules.

- 2026-10-08 — D-02 confirmed: Sean approved locking each complete spread or total ballot when it is submitted, with immediate reveal of that mode’s analysis. Drafts remain editable before submission and the deadline; scored guesses cannot be revised after submission. Apply independently to spread and total, including practice games. Existing saved guesses, imported timestamps and audit history are preserved without inventing past exposure times. Official benchmark freeze remains a separate actual-kickoff requirement. Separate editable personal forecasts remain approved future work (PRED-01), not an existing product feature.
- 2026-10-08 — Analysis scope expanded: the post-submission board should include independently sourced models, guess-versus-market gaps, public betting ticket percentages, public money/handle percentages, betting volume and sharp-action evidence. Free sources and lawful multiuser display/storage rights remain required. Public splits describe the named provider’s sample, not the whole market; a money/ticket difference alone is not proof of sharp bettors. Model gaps and a player’s benchmark guess are research signals, not established positive expected value. “Public total bets” meaning is the next clarification (D-04); no connected feeds are claimed.

- 2026-10-08 — D-04 confirmed: public total bets includes both reported absolute ticket counts and Over/Under ticket percentages, when a permitted source actually supplies each. Preserve sample coverage, source and timestamp; money/handle share remains separate. No connected feeds or inferred ticket counts.
- 2026-10-08 — D-05 confirmed: one Guess the Spread ballot and one Guess the Total ballot per authenticated player, season and week, reused across all groups and matchups. Creating or joining a group cannot produce new guesses or bypass a submitted lock. Preserve original numbers, import provenance and audits. Group rosters and comparative standings remain separate.
- 2026-10-08 — D-06 confirmed: Betting Challenge selections are also entered once and reused across every group. One immutable spread OR total selection per player/week/NFL matchup, preserving the selected side, line, odds, source and timestamps. This supersedes group-specific selection variants; any future exception needs an explicit decision.
- 2026-10-08 — D-07 confirmed: set up The Odds API free plan. User completed signup and saved THE_ODDS_API_KEY in Supabase Edge Function Secrets; secret name verified. Server-only, quota-limited manual collection is under test. No paid upgrade, automatic polling or official benchmark is implied.
- 2026-10-08 — D-08 confirmed: Sean and Steven's submitted Week 5 spread guesses count despite Steven having seen spreads. The Duel's earlier practice designation is superseded. Both exact ballots remain immutable, with the original provenance preserved and a separate eligibility ruling recorded. Total and Challenge do not inherit this exception; verified scoring benchmark remains pending.
- 2026-10-08 — Appearance request: add functional Light, Dark and System choices now, with per-browser/device persistence using provisional GTL tokens. This is not final brand approval; the five-option identity review remains separate.

- 2026-10-08 — D-09 confirmed: Sean selected “Use the three-book median for Week 5.” The DraftKings / FanDuel / BetMGM median may score the real Sean & Steven Duel's 2026 Week 5 spread competition without an Action Network cross-check. Only that cross-check is waived, only in this competition. Keep exact-event matching, all 15 matchups, three distinct approved books, timestamp/freshness and 85%-within-five-points checks, submitted-ballot privacy and permanent locks. Total, Challenge, other groups and later weeks retain their existing requirements.
- 2026-10-08 — D-09 scoring correction: collected lines had reached analysis, but competition scores still used archived references because the new feed had no approved scoring policy. The implementation now projects provisional accuracy and closest-pick W-L-T from the latest complete qualifying three-book snapshot for the approved Duel. Archived scores, exact predictions and provenance remain intact. Stale saved medians remain visible with a stale label instead of disappearing after five minutes; they are not presented as current betting lines.
- 2026-10-08 — D-09 freeze and verification boundary: the commissioner must separately provide actual kickoff and its evidence. The immutable freeze accepts only a complete snapshot collected before that start with observations within the preceding five minutes. Future starts, starts earlier than scheduled minus 30 minutes, a different Pacific date, missing valid quotes and attempts to replace a freeze are rejected. No actual start, official frozen result, automated collection or deadline adjudication is inferred.
- 2026-10-08 — D-09 release verified: 137 backend/SQL, 26 cloud-browser and 6 local-browser checks passed; the migration was applied and the scoped policy activated at 19:34:24 UTC. Edge v10 and Pages 4d23cfc9 show Sean 95/150 with a 7–5–3 closest-pick record and Sthomas 93/150 with 5–7–3 across Dashboard, My picks, Compare picks and Leaderboard. Both use the same 15-game benchmark from the 12:15 PM Pacific collection, explicitly stale and provisional. All 58 live access-denial checks passed; both players' ballot/audit/provenance hashes are unchanged, and Total stays gated. SCORE-05 is complete for this scoped implementation and deployment. Actual kickoff remains unrecorded and there are no frozen benchmark rows; the operational freeze stays open under DATA-05. Later release evidence belongs in docs/CLOUD_SETUP.md and the tracker.

## D-14 — Icon-only Field monogram (October 8, 2026)
Sean requested removing text beside the logo and supplied the selected Field
monogram screenshot. Use its rounded lime tile and dark original mark in product
brand placements. Preserve the accessible name and browser title Guess The Line.
This refines D-12 presentation without choosing new type or palette options.

- **D-15 — October 8, 2026: separate Best Bets competition.** Sean confirmed optional games and confidence weighting belong to a separate Best Bets competition. Spread and Total keep existing full-slate accuracy rules. The numerical confidence budget, deadline, scoring and settlement rules remain undecided; planning documents are not shipped features.
- **D-16 — earlier pending question, now answered below: submission-time versus common scoring reference.** Sean requested a global member leaderboard, stronger player comparisons, time-of-selection odds comparisons and actual stake/result/ROI tracking. The earlier question was whether to use a common benchmark or individual submission-time references. Its pending state is superseded by the following answer; global visibility/eligibility and journal privacy remain separate.

- **D-16 — confirmed October 8, 2026, subsequent voice session:** Sean requested that Guess the Spread and Guess the Total award points against the consensus when each player submits the guesses, and show current consensus in a separate box alongside comparisons with other players. Asked whether editing a guess should update its scoring benchmark to consensus at the edit, Sean answered, "yes. it should." He then explicitly requested actual repository work and proactive implementation. Apply a separate saved reference to each player's guesses; changed submitted guesses receive a new reference at save time before the existing deadline. Unchanged guesses retain their references. This supersedes permanent post-submit immutability for Spread/Total and the shared-reference scoring display; it does not change Challenge, private-group visibility, full-ballot initial submission, eligibility rulings or the deadline. Keep original submission time and revision history. Preserve historical artifacts and frozen records, and do not invent missing historical lines or timestamps. Source freshness and unavailable evidence remain explicit; the existing twelve-hour collector is not an instantaneous quote service. Implementation, verification and deployment are separate states in [SUBMISSION_TIME_SCORING.md](SUBMISSION_TIME_SCORING.md).

- **D-17 — confirmed October 8, 2026, fresh submissions and source transparency:** Sean approved reusing eligible consensus or requesting fresh shared odds within the existing free allowance, with an unavailable result leaving the draft unsubmitted. He also requested the dashboard show sportsbook spreads, their sources and the consensus determining points, including FanDuel (interpreting the voice transcription “candle”), DraftKings, Caesars and Action Network where available. New submission and changed-guess saves require all eligible references; unchanged guesses retain their original receipts. Show the saved scoring median and latest collected median separately with book-level evidence. Keep the free-only budget and existing collection limits. Caesars is unavailable on the current provider's free tier; Action requires an authorized feed and display permission. This request does not authorize a paid upgrade, provider outreach or production deployment. See [implementation and source evidence](FRESH_SUBMISSION_AND_SOURCES.md).

- **D-18 — confirmed October 8, 2026, separate virtual units game:** Sean clarified that the requested Picks tab is its own game using play money, not a private record of an externally placed bet and not real sportsbook execution. Players choose spread or total sides and stake units; one unit represents $100 of virtual money, with quick amounts including 0.5, 1, 1.5, 2, 2.5 and 3 units. A player may place **one spread and one total virtual pick per NFL matchup**, with no repeat pick in the same market for that matchup. The game has its own win/loss/push record and unit-based net and ROI, separate from Guess the Spread, Guess the Total, record-only Betting Challenge, the private journal and Best Bets. To **qualify for a week**, a player must place **at least three picks OR at least 3 units** in that week. The two thresholds are alternatives; one 3-unit pick or three smaller picks meets the stated threshold. A week below both thresholds is unqualified for weekly standings, but its virtual picks still count in that player's personal overall record and ROI. Show eligible consensus for comparison and the actual named-book side, line, odds and time used for a virtual pick; never treat a derived median as an executable book quote. **Sean confirmed no starting bankroll or bankroll cap:** unit stakes are not rejected for insufficient virtual balance. Both first placement and edits are allowed **right up until that specific game's kickoff**; this supersedes the earlier one-hour-prior edit cutoff. Preserve prior side, line, odds, units and timestamps in the audit. Settlement, tie and reschedule handling remain to be specified before implementation. Track this as BET-07; the request is not a shipped feature or authority to change existing modes.

- **D-18 quote and button-flow clarification — confirmed October 8, 2026:** For each virtual spread or total side, show the best line drawn from the most recently accessible named-book quotes across available books. When newer eligible quotes are saved, update the line and odds offered in the pick buttons; an already placed pick retains its saved line and odds unless the player explicitly edits it before that matchup's kickoff. The main flow should use simple side and unit buttons; players should not have to type a line or odds to make a pick. **There is no quote-age cutoff for this virtual game:** before kickoff, the latest retained named-book quote for the applicable game and market remains selectable if collection fails **or a successful refresh omits that book's market**. A newer saved quote from another book still competes for the best point line. Do not block virtual picks solely because the app's quote collection is delayed or a market is omitted. Show the actual book, observation/collection time and prominent age label; save the exact historical terms and never call an aged quote a current executable offer. A newer saved quote replaces the offered button terms, not existing placed picks. **If no named-book quote has ever been saved for a matchup's spread or total, disable only that unavailable market's virtual-pick button until a genuine quote is saved.** Keep other games and markets available; do not invent line/odds terms or substitute consensus as a book quote. Schedule changes and voids retain their own rules. **Sean chose the better point line over better payout odds** when books trade off; among equal point lines, use the more favorable odds. For a selected team spread, more points are better; for Over, a lower total is better; for Under, a higher total is better. The consensus remains a separate comparison. No live-price claim, paid source or deployment is implied. The successful-refresh omission rule follows Sean's “Continue” response to the recommended path and may be revised if he clarifies otherwise.

- **D-18 virtual return clarification — confirmed October 8, 2026:** Sean chose returns based on each pick's saved American odds. One unit is $100 virtual risked; a 1-unit loss is −1 net unit, and a 1-unit win at −110 earns about +0.9091 net units. ROI is total net units divided by units risked on settled picks, with pending/void picks excluded and pushes returning the stake for zero net. Keep W-L-P and ROI separate; neither is an actual cash balance or a sportsbook-confirmed payout. **Sean chose automatic final-score settlement only:** a permitted, verified automatic result feed must supply the final score before virtual picks settle; commissioner-entered results do not settle this game. No such feed is connected yet, so future picks remain pending until it is implemented and verified. **The permitted automatic feed grades initial finals and regrades whenever it verifies a corrected final, even after weekly standings appear.** Preserve the original saved line, odds and units; append a before/after result audit, recalculate the affected W-L-P, net units, ROI and standings, and notify affected players. Commissioner-entered corrections do not regrade this game.

- **D-18 postponement and cancellation clarification — confirmed October 8, 2026:** If a matchup is postponed before kickoff but remains on the same calendar day, its virtual spread and total picks carry over at their originally saved line, odds and units. Retain the original quote and placement audit; the game-specific placement/edit deadline follows the revised kickoff. If the game moves to a different calendar day, void the old virtual picks, return their virtual stakes, preserve the audit and allow fresh picks at the rescheduled market; notify affected players through a persistent in-app notice plus push and email when each external channel is connected and the player opts in. This is the three-channel choice from Sean's “All” answer; SMS was not among the offered channels and remains separate. **A voided pick retains its original pick and unit credit toward that week's three-pick-or-3-unit qualification threshold if it is not replaced, but does not qualify the entire week by itself.** For example, one voided 1-unit pick counts as one pick and one unit; the player still needs two more picks or two more units to qualify. **If a replacement pick for the same matchup and market falls in the same competition week, the original and replacement count as one qualifying pick, not two, and qualification uses the replacement's unit stake only.** Thus a voided 3-unit pick replaced by a 1-unit pick counts as one pick and 1 unit. **If the rescheduled matchup moves into another competition week, the voided original keeps its pick/unit qualification credit in its original week; a fresh pick at the rescheduled game counts only in the new competition week at its own unit stake.** Do not transfer the old week’s credit or combine stakes across weeks. Voided stakes are returned and excluded from settled ROI. **For a possible cancellation or no contest, keep affected virtual picks pending while status is uncertain. Only after a permitted official source confirms cancellation or no contest, void those picks, return their virtual stakes, preserve their original pick/unit qualification credit and notify affected players through the same agreed channels.** An unconfirmed report does not settle or void a pick. Use the `America/Los_Angeles` calendar to compare the original and revised kickoff dates for this same-day/different-day rule; store actual kickoff timestamps in UTC for evidence and show the Pacific date to players. **During an automated schedule-feed outage, the commissioner may enter a revised kickoff only from a verifiable official league notice.** Save the notice link and time, commissioner identity, old/new kickoff and an immutable change audit. This schedule update changes the pick deadline but cannot grade results; only the permitted verified automatic result feed may do that. Verified schedule-change, cancellation and actual-kickoff sources remain open; no external notification delivery has been activated by this decision.

- **D-19 — confirmed October 8, 2026, social Bet Tracker:** Sean requested a separate menu for singles/parlays that also shows the same records in each player's Unit Betting week, visible to all users, with bets counting toward records by default and configurable inclusion. He requested following, tailing, ROI/history comparisons, filters and selection/record visualizations. Implement the shared audience as signed-in players and preserve existing private journals and hidden guesses. Tail records belong to the follower, retain attribution and use their own reviewed terms; one parlay is one bet/stake. Tracked results remain explicitly user-reported, and unknown prices, unit conversions and times remain unknown. Local implementation, supplied Week 5 intake, accounting and verification boundaries are documented in [SOCIAL_BET_TRACKER.md](SOCIAL_BET_TRACKER.md). This does not claim deployment, live account import, sportsbook execution or completion of the D-18 virtual quote/results flow.
