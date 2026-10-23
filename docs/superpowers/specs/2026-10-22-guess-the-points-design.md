# Guess the Points and Trade verdicts design

Owner: Sean Balsiger · Designed with Sean in chat October 22–23, 2026 · Status:
**approved as written (D-56).** Sean answered every question below, approved each
of the five design sections in chat, and then reviewed this written
specification: "Spec approved as written." Nothing is built, migrated or deployed.
No implementation plan exists yet; writing one needs Sean's go.

*Update, October 23, 2026:* at Sean's request ("Update"), section 4.4 now maps
Points' data onto the approved Track 1 design (D-57). Track 1's snapshot supplies
the estimates and House. Its review file cannot be the only actuals source, so
Points loads nflverse stats and snap counts itself. No game rule changes.

Claim tags: **[inspected]** read in this repository; **[evidence]** from the
October 22, 2026 fantasy research report and its evidence records (kept in
Sean's local research folder, not in this repository; IDs such as B18 refer to
those records); **[assumed]** a design default or estimate, not measured.

## 1. Why this game

- Guess-then-reveal on a number works in fantasy: FAABLab asks for a mock waiver
  bid before revealing the crowd's, and its launch thread drew 763 upvotes and 300
  comments [evidence B18].
- Weekly predictions are what league-mates say they love; an exhaustive league
  history drew little interest [evidence B06, B07].
- Losing managers check out mid-season, and commissioners build side games to keep
  them playing [evidence A41, B04, B05].
- Generic fantasy tools (rankings, trade calculators, AI start/sit, league sync)
  are free and crowded, and league sync is blocked by terms: Sleeper requires
  written consent, ESPN/CBS/NFL.com prohibit it, Yahoo is approval-gated
  [evidence D03, D08–D10, D15, D17]. This game uses no league data.
- Users dislike Sleeper's more/less betting framing and its real-money promotion
  [evidence C10, C13]. Guess the Points is free, record-only and never framed as
  over/under against a line.
- Trade judgment is the largest fantasy discussion volume in the last 30 days, and
  trade calculators are used to persuade rather than to settle [evidence section
  4.5, B11]. Trade verdicts turns that argument into a graded guess.

It reuses what GTL already has: accounts, the Community and private groups, the
per-game lock-in, the D-31/D-39 reveal gate, boards with shared ranks, the feed
and opt-in web push [inspected].

## 2. Sean's answers (October 22–23, 2026)

Each question was asked one at a time with a recommended option.

| Question | Sean's answer |
| --- | --- |
| Is R6b Trade verdicts in this spec? | **Same spec, phase 2** (after Guess the Points). |
| Who chooses the players? | **GTL picks one slate** for everyone, automatically from its weekly estimates; the commissioner can swap a player before the week opens. |
| Scoring format | **Full PPR, 4-point passing TD**, GTL's disclosed weights. (Recommended was Half-PPR; Sean chose PPR.) |
| Scoring function | **10 minus fantasy points off**, floor 0, per player. |
| Slate size | **5: QB, RB, WR, TE, FLEX** (RB/WR/TE); no two from the same game; spread across kickoff windows. |
| Inactive or ruled-out player after the week opens | **Void for everyone**; the week's maximum drops by 10. |
| Stat corrections and FINAL | **PROVISIONAL** when stats land; corrections re-grade until the **following Thursday 12:00 PM PT**, then **FINAL** and frozen. |
| Ties | **Share the rank** (T-2), as D-36. |
| Which groups; relation to Spread/Total boards | **A third separate board**, one ballot per account reused in the Community and every private group; never added to Spread or Total. |
| Required or optional | **Optional, opt-in by playing**: your first lock-in of the season adds Points to your due list, Home's next move and the reminder. |
| Push | **One reminder 2 hours before your next unlocked slot's kickoff**, at most once per week, spoiler-free. |
| GTL's own estimate | **Unranked House row**, hidden until you lock in that slot or it kicks off. |
| Where it lives | **Play, beside Spread and Total**; Home hero bar for opted-in players; one row in Research › Fantasy. |
| When the week opens | **Tuesday 12:00 PM PT**, with a commissioner early-publish fallback. |
| Trade grading window | **Next 4 NFL weeks**, shrinking near season's end. |
| Trade voting | **Hidden vote** until the window's first kickoff; voters earn a **Trade judge W-L-P** record. |
| Who posts trades | **Any member, Community-wide**, 1–3 players per side, at most 2 open trades per member per week. |
| Build approach | **A: Points' own tables and functions** beside the Guess machinery. |

Sean then approved, in order, Section 1 (weekly game rules), Section 2 (data and
architecture), Section 3 (screens and copy), Section 4 (Trade verdicts) and
Section 5 (failures, tests, rollout) as presented in chat. Sections 3–8 below
are those sections written out.

### Defaults chosen in this spec (not asked separately)

These are design defaults [assumed]. Sean can change any of them in review.

1. Guesses are whole numbers from 0 to 60.
2. Actual fantasy points are rounded to one decimal before scoring, so every score,
   sum and tie is exact to the tenth.
3. The slate is a reproducible, seeded draw inside fixed estimate pools
   (section 3.2), not always the top-ranked stars.
4. Kickoff windows are Thursday night, Sunday early (before 12:00 PM PT), Sunday
   late (12:00–4:59 PM PT), Sunday night, Monday night, and any other day (each
   Saturday, holiday or international slot is its own window).
5. A week goes FINAL at Thursday 12:00 PM PT only if every non-void slot has
   actuals; otherwise at the first load after that time that covers all slots.
6. The House's week counts only when it has an estimate for every non-void slot.
7. Weekly winners are declared from FINAL weeks only; season standings sum every
   week, with PROVISIONAL weeks labelled.
8. Trades carry no free text; discussion happens in the feed card's comments.
9. Trade verdicts sends no push notifications.

## 3. Guess the Points rules (phase 1)

### 3.1 The week

- **Open.** Tuesday 12:00 PM `America/Los_Angeles` of each NFL competition week,
  after nflverse has loaded Monday night's stats and Track 1's 11:00 UTC refresh
  has published that week's estimate snapshot (section 4.4). A scheduler publishes the slate; the commissioner's
  "Preview / publish early (fallback)" follows the D-24 pattern. If no fresh
  estimate snapshot exists by the open, the week stays unopened and says why; no
  older snapshot is substituted. If nothing can be published before the slate's
  first kickoff, the week reads "No Points this week" and nobody scores zero.
- **Close.** Each slot closes at its own game's kickoff. There is no weekly
  deadline and no late window.
- **Season.** NFL regular season, Weeks 1–18. The first live week is the first
  Tuesday open after release; past weeks are never back-filled.

### 3.2 The slate

- Five slots: **QB, RB, WR, TE, FLEX** (any RB, WR or TE). Kickers are not on the
  slate.
- **Eligible players:** on an active weekly roster, not listed Out or Doubtful,
  not on IR or another reserve list, and with a GTL weekly estimate in the fresh
  snapshot.
- **Pools** [assumed]: QB top 12, RB top 24, WR top 24, TE top 12 by GTL weekly
  estimate under the game's scoring; FLEX from RB and WR ranks 1–36 and TE ranks
  1–12 not already chosen.
- **Constraints:** no two slots from the same NFL game; at least two kickoff
  windows across the five slots.
- **Draw:** a seeded pseudo-random draw within the pools, with the seed derived
  from season, week and the selection-rule version, so the same inputs always
  produce the same slate and a test can reproduce it. If no valid slate exists
  under the constraints, the builder fails closed and the week stays unopened.
- **Commissioner swap:** before the open, the commissioner may replace a slot with
  another eligible player of that slot's position. Every swap is audited. After the
  open the slate is fixed.
- The published slate (players, games, kickoffs) is public to every member.

### 3.3 Guessing and locking

- A guess is a whole number of fantasy points from 0 to 60.
- An unlocked guess is a private draft and can change freely until that slot's
  kickoff.
- **Lock-in** is per slot and final, the D-39 pattern: once a slot is locked in,
  no writer can change it. A save after the slot's kickoff is refused.
- A slot never locked in by its kickoff scores nothing and shows "—", never 0
  (D-41 pattern).
- Who has locked in (faces, no numbers) is visible at any time, as D-21 shows who
  has submitted.

### 3.4 Reveal

- Another member's guess for a slot, and the House estimate for that slot, are
  visible to a viewer once the viewer has locked in that slot, or at that slot's
  kickoff (the D-31/D-39 per-game rule, applied per slot).
- The gate also protects standings, aggregates, feed text and exports: nothing
  derived from a hidden guess is shown.
- The House estimate is not a secret: the same GTL pace estimate is public in
  Research › Fantasy. The ballot withholds it only so it does not anchor the
  guess. The ⓘ says so.

### 3.5 Scoring

- **Format:** Full PPR (1 per reception), 4 points per passing TD, and the rest of
  GTL's disclosed offensive weights in
  [FANTASY_FOOTBALL.md](../../FANTASY_FOOTBALL.md#model-and-scoring) [inspected]. The
  slate stores the scoring-rules version it was published under; later weight
  changes never re-score that week.
- **Actual:** the player's fantasy points for that week's game from nflverse, under
  the pinned rules, rounded to one decimal.
- **Slot points:** `max(0, 10 − |guess − actual|)`. A guess of 18 against an actual
  of 14.6 earns 6.6. Exact earns 10.
- **Week maximum:** 50, minus 10 per void slot.
- **PROVISIONAL:** points appear as soon as a slot's actual is loaded: the first
  daily load after nflverse publishes that game's stats, usually the next morning
  (nflverse updated the weekly stats file at 04:46 UTC on October 23, as observed
  in Track 1's design; its timing varies). Each later load re-grades
  every non-FINAL week and records the before/after in the audit.
- **FINAL:** the following Thursday at 12:00 PM PT, once every non-void slot has an
  actual. The week's member and House totals are then frozen. A correction that
  arrives after FINAL is recorded as a note and changes nothing. This answers the
  stat-correction disputes commissioners report [evidence A07, A08].
- Personal points and shared standings update together, when actuals load. The
  D-50 split (personal immediately, shared at kickoff) is not needed: no reference
  exists before the game is played, and every guess is revealed by then.

### 3.6 Void

- A slot is **Void · inactive** for everyone when its player records no
  offensive or special-teams snap in that game, plays that week for a team other
  than the one on the slate, or the game is postponed out of the competition week
  or cancelled.
- A player who plays one snap and leaves injured still counts.
- A kickoff time change inside the week moves that slot's lock time with it.
- A void slot scores nothing for anyone and lowers the week's maximum by 10.
  Because every member faces the same voids, weekly and season sums stay fair.

### 3.7 Boards

- **Points** is a third board beside Spread and Total, with its own weekly and
  season standings and its own weekly winner. Its points are never added to
  Spread or Total.
- One Points ballot per account and week, reused in the Community and in every
  private group the member belongs to (D-05/D-06). Private-group boards filter the
  roster, as the other boards do.
- **Week:** the sum of that week's slot points. **Season:** the sum of all weeks,
  PROVISIONAL weeks labelled. Points per played week and weeks played show on tap.
- **Ties** share the rank (T-2, D-36). Total fantasy points off and exact guesses
  show as context on tap; they are not tiebreakers.
- **House:** GTL's weekly estimate for each slot is scored the same way and shown
  as an unranked row labelled "House". It never takes a rank or wins a week. A
  member's "beat the House" count is the number of weeks their week total exceeded
  the House's. If the House lacks an estimate for any non-void slot, its week shows
  "—" and does not count.
- **Opt-in:** a member appears on the Points board from their first lock-in of the
  season. Weeks they did not play show "—", never 0.

## 4. Architecture and data (approach A)

Sean chose approach A over (B) a third `guess_points` mode inside
`gtl_weekly_ballots` and (C) a shared mode registry refactor. Reasons
[inspected]: the Guess ballot keys picks by game ID
(`^[A-Z]{2,4}-[A-Z]{2,4}$` in `cloud/personal.mjs`), every lock-in saves a
sportsbook line through `gtl_reference_at_save`, and the two modes are listed by
hand in about 30 places, including six CHECK constraints and the live scoring
functions that core scoring has used since October 19. Points has no reference
until after the game. Separate tables keep this work away from live scoring.

### 4.1 Tables (new)

| Table | Holds |
| --- | --- |
| `gtl_points_slates` | One row per season and week: `opens_at`, status (draft / published), `scoring_rules` (format `ppr`, passing TD 4, weights version), five slots (slot, nflverse player ID, name, team, position, GTL game key, kickoff), House estimates per slot, provenance (estimate snapshot season/week, checksum, selection-rule version, seed), publisher and an append-only swap audit. |
| `gtl_points_guesses` | One row per user, season, week and slot: guess (CHECK 0–60, integer), `locked_at`, created and updated times. A trigger refuses any update of a locked row (`GTL_POINTS_LOCKED`, HTTP 409) and any write after the slot's kickoff (`GTL_POINTS_CLOSED`, HTTP 409). |
| `gtl_points_guess_events` | Append-only history of every draft save and lock-in (D-23). |
| `gtl_points_actuals` | One row per season, week and nflverse player ID for every player in that week's stats file: the stat fields scoring needs, points under each pinned rules version, a played flag with its basis, the GTL game key and the load that wrote it. |
| `gtl_points_actual_loads` | Append-only load records: source URL and release, upstream publish time, retrieval time, SHA-256, row counts, and saved/skipped/failed status. |
| `gtl_points_week_final` | Frozen per-member and House totals, per-slot results and void reasons for a FINAL week, with the load it froze from. |

Row-level security is on for every table. Browsers get no direct grants; reads and
writes go through `gtl-api` and service-only SQL functions, as the existing
tables do [inspected].

### 4.2 Functions and routes

- `gtl_points_revealed(p_viewer, p_season, p_week, p_slot, p_now) → boolean`:
  true when the viewer has locked in that slot or `p_now` is at or after its
  kickoff.
- `gtl_points_lock_in` and `gtl_points_save_draft`: refuse before the open, after
  the slot's kickoff, out of range, or on a locked slot. Retries are idempotent
  through the existing receipt pattern (`gtl_personal_receipts`).
- `gtl_points_read(p_viewer, p_season, p_week, p_group)`: slate, the viewer's own
  guesses, other members' gated guesses, the gated House, results with
  PROVISIONAL/FINAL/void state, and week and season standings, with the
  roster-scoped group filter.
- `gtl_points_load_actuals(p_payload)` (service only): idempotent per checksum;
  re-grades every non-FINAL week; appends before/after audit events.
- `gtl_points_finalize(p_season, p_week)` (service only): freezes a week when its
  conditions are met (section 3.5); an identical re-run is a no-op.
- `gtl_points_publish_slate` (commissioner or scheduler): preview, publish and
  pre-open swap.
- Routes on `gtl-api`: `POST /points/read`, `POST /points/draft`,
  `POST /points/lock`, commissioner `POST /points/slate`, service
  `POST /points/actuals`.
- **Slate builder:** a pure shared module (for example `shared/points-slate.mjs`)
  that takes the estimate snapshot, roster and injury status and the schedule and
  returns the slate. It is tested on its own.
- **Schedules** (pg_cron, two UTC jobs per local time, as D-24 does, with the
  worker refusing the wrong local hour):
  - open: Tuesday 12:00 PM PT (`0 19 * * 2` PDT, `0 20 * * 2` PST)
  - finalize: Thursday 12:00 PM PT (`0 19 * * 4` PDT, `0 20 * * 4` PST)
  - actuals load: daily from Monday to Thursday after Track 1's 11:00 UTC run,
    plus once just before the Thursday finalize (section 4.4).

### 4.3 Small changes to existing code

- `gtl_feed_posts` kind CHECK: add `points_played` and `points_final`; mode CHECK:
  add `guess_points` where the post carries a mode.
- `gtl_push_reminders_sent` mode CHECK: add `guess_points`. A separate claim
  function, `gtl_claim_points_reminders`, finds opted-in members with an unlocked
  slot whose kickoff is 2 hours away. The existing 15-minute dispatcher and
  `cloud/push-reminders.mjs` mode list gain the new mode.
- UI lists that name the games: the Play landing (`web/src/next/play/Play.jsx`),
  the League board switcher (`communityFormat.js` `MODE`, `shared/guess-board.mjs`
  `MODES` or a Points-specific board beside it), the Home hero progress bars and
  the Play tab-bar due counter (`web/src/next/play/index.js`, which today assumes
  at most two ballots due).
- Spread and Total scoring, gates, references and readers are not changed.

### 4.4 Dependency on Track 1 (the weekly fantasy refresh)

Guess the Points cannot open without Track 1's weekly estimates. This spec does
not edit `scripts/fantasy.mjs`, `shared/fantasy*`, `web/src/FantasyFootball.jsx`,
`web/src/next/fantasy/` or the fantasy docs.

**Track 1 as designed.** Track 1 is the approved fantasy refresh (D-57,
[PR #192](https://github.com/seanbalz/guess-the-lines-repo/pull/192), open and not
built when this section was written; read on its branch October 23, 2026
[inspected]):
- a GitHub workflow, `fantasy-refresh.yml`, runs daily at 11:00 UTC, after
  nflverse's nightly stats and its 07:00 UTC roster and injury refresh;
- it publishes content-addressed data files and an `index.json` to the release
  tag `fantasy-data-<season>`, with source URLs, retrieval times and SHA-256 inside
  every file;
- **snapshot W** (the coming week) is rebuilt every run until F(W), the first
  Saturday or Sunday kickoff of week W, then frozen;
- **review of week N** holds, for every player who had a weekly estimate in the
  published week-N snapshot, the estimate, the actual week-N stats (or `null` when
  nflverse has no stats row), a season-average baseline, the actual-stats source
  time and checksum, and only a *count* of players who played without an
  estimate. It is PROVISIONAL until F(N+1), then FINAL.

Before Track 1 [inspected on `main`]: `scripts/fantasy.mjs` builds only
forward-looking snapshots and refuses a past week; a week's actuals appear only as
`players[].history` in the next week's snapshot, and only the Week 6 snapshot is
committed.

**Estimates and House: Track 1 snapshot.** The Tuesday 12:00 PM PT slate is built
from the snapshot W in `index.json` at that moment (published by that morning's
11:00 UTC run). The slate pins that file's name and SHA-256; the House estimates
are that version's, even though Track 1 keeps rebuilding snapshot W until F(W).
If no snapshot W built from stats through week W−1 is listed, the week does not
open (section 3.1).

**Actuals: not the review file alone.** The review file is the natural source of
actual stats, but it has three gaps for Points:

1. **Coverage follows the final estimates.** A player is in the review only if he
   had an estimate in the *last* snapshot built before freeze. Estimates exclude
   players reported Out or Doubtful, so a slate player downgraded to Doubtful
   after Tuesday who then plays is missing; the review gives only a count. Trade
   verdicts can name any player, so it has the same gap more often.
2. **No played flag.** A `null` stats row does not separate an inactive player
   (void) from one who played and recorded nothing (scored as 0). Track 1
   deliberately excludes snap counts.
3. **Freeze time.** The review freezes at the next week's first weekend kickoff;
   Points goes FINAL earlier, Thursday 12:00 PM PT (section 3.5). This needs no rule
   change; it only means Points cannot wait for the review's FINAL label.

So Points loads actuals itself, from the same source Track 1 reads:
- **Stats:** the nflverse `stats_player_week_{season}.csv` release asset, every
  player and every row for the week (the same file and checksum the review
  records). When a review file for that week exists and names a different
  actual-stats checksum than the file Points loaded, the load is flagged for
  review and nothing changes until the next load agrees.
- **Played flag:** the nflverse snap counts file for the week, used on the server
  only. Snap counts come from Pro Football Reference: GTL may use them and may not
  republish the raw files in this public repository [evidence D38, D39]. A slate
  player with no snap row stays pending (section 7) until a later load or a
  commissioner ruling.
- **When:** after Track 1's 11:00 UTC run each day from Monday to Thursday, and
  once more just before the Thursday 12:00 PM PT finalize.
- **Where it runs** is an implementation-plan decision with a measured check. One
  option is a scheduled Supabase function that fetches and parses the CSVs. The
  Trends release in API v31 hit the Edge CPU limit, so CSV parse time must be
  measured on a full-season file first [assumed: a few MB by Week 18]. The other is
  a compact all-player actuals file added to Track 1's release by its builder,
  which Points reads with a small fetch. That second option changes Track 1's
  files, so it needs the Track 1 owner's agreement and Sean's approval.

The Points loader imports `scoreStats` from `shared/fantasy-rankings.mjs`
read-only and computes points under the slate's pinned rules version. A loader
that cannot reproduce that version refuses to write points. Track 1 keeps
`method.version` and states that scoring weights are unchanged; a later weight
change must carry a version Points can pin.

## 5. Screens and copy

Every screen follows the D-38 rules of restraint and the D-55 system
[inspected `docs/BRAND_GUIDE.md`]: one screen, one job, one lime button in view;
at most 6 numbers on a card; "—" for missing, never 0; PROVISIONAL and FINAL
written out; never color alone; faces first; fine print behind ⓘ; team
abbreviations, never logos for players, no player photos.

- **Play landing.** A third row, **Points**, under Spread and Total, with one
  status line ("3 of 5 locked · next locks Sun 10:00 AM PT"). Before the open:
  "Week 8 Points opens Tue 12:00 PM PT". Waiting on data: "Week 8 Points waiting
  on fresh estimates".
- **Play › Points ballot.** Title "WEEK 7 POINTS"; one line under it,
  "You 24.6 of 50 · PROVISIONAL". Five slot cards in kickoff order.
  - Card: slot tag (QB / RB / WR / TE / FLEX), player name, "PIT @ CLE", kickoff,
    and one status word: To pick, Draft, Locked in, Closed, Void · inactive,
    Pending stats.
  - Tap opens a sheet: chip rail 0, 5, 10 … 40 and More (45–60), with −1 / +1.
    The sheet's one lime button is "Lock in 18", followed by a confirm dialog,
    as the Spread/Total per-game editor does (`PerGamePlay.jsx`) [inspected].
  - After lock-in: your guess, then **Everyone** (faces and guesses once the gate
    opens) and **House**.
  - After stats: actual and your points. At most four numbers per card: guess,
    actual, points, House.
- **League › board.** The switcher becomes Spread / Total / Points. Rows: rank,
  face and name, week points, season points. House is an unranked row; "beat the
  House" opens on tap. Group filters as today.
- **Home.** For opted-in members only, the hero adds a "Points 3/5" progress bar
  and next move also includes their open Points slots. Members who have not played
  Points this season see no change.
- **Research › Fantasy.** One compact row, "Guess the Points · Week 7", linking to
  Play › Points. It sits on Research's landing, not inside `web/src/next/fantasy/`,
  which Track 1 owns. If Track 1 changes that landing first, the row is passed to it
  as a request.
- **Feed** (faces first): "Troy is playing Week 7 Points" on a member's first
  lock-in of the week, with no numbers; "Week 7 Points FINAL · Troy 38.4 ·
  House 31.2" once FINAL.
- **ⓘ About Guess the Points:** rules, the Full PPR weights, void, PROVISIONAL and
  FINAL timing, the House note (section 3.4) and the nflverse credit (CC BY 4.0).
  Listed in Menu › Guidance and sources.
- **Push** (opt-in web push, D-28 channel): "Week 7 Points: 3 players still open.
  Next locks 10:00 AM PT." Never a player name, guess, actual or score. At most
  once per member and week, recorded before it is sent; only for members who have
  played Points this season; a tap opens Play › Points.
- **Accessibility:** 44px targets, 320px minimum width, Light/Dark/System, reduced
  motion, forced colors, labelled controls.
- **Before build:** under the design-exploration rule, five visual alternatives
  for the ballot card and its results state go to Sean for a pick. That is a
  pre-build step, not part of this specification.
  **Picked October 23, 2026:** option D, "Glow card" (the D-55 glow card with glass
  pills; faces first after lock-in with each member's guess and the House; results
  as You / Actual / Points tiles and one line naming the closest member). Recorded
  as a D-56 addendum in [DECISIONS.md](../../DECISIONS.md).

## 6. Trade verdicts (phase 2)

Phase 2 starts after Guess the Points is live and at least two Points weeks have
gone FINAL. It gets its own implementation plan.

### 6.1 Rules

- **Post.** Any member posts Side A and Side B, each with 1 to 3 NFL players (QB,
  RB, WR, TE or K) chosen from search. A player cannot be on both sides. There are
  no league names, rosters or free text. At most 2 open trades per member per
  competition week.
- **Withdraw.** The poster may withdraw before the first vote; the trade then shows
  as "Withdrawn" and stays in the record (D-23). After the first vote it is final.
- **Window.** The four NFL competition weeks starting with the first week that has
  no kickoff yet when the trade is posted. A trade posted Wednesday of Week 8 is
  graded on Weeks 8–11; one posted Friday of Week 8 on Weeks 9–12. Near season's
  end the window shrinks to the weeks left through Week 17. No trade can be posted
  once Week 17's first game has kicked off.
- **Vote.** One vote per member, Side A or Side B, final once cast. The poster may
  vote. Votes are hidden until voting closes at the first kickoff of the window's
  first week; then the split shows as faces and counts. A member always sees their
  own vote.
- **Grade.** Each side's total Full PPR points (same pinned rules as Points) over
  the games of the window's weeks, from `gtl_points_actuals`. Missed games, byes and
  suspensions count 0; points count for whatever team the player is on. The higher
  total wins. It is a **push** when the totals are within 5% of the larger total,
  and when both are 0.
- **Status.** PROVISIONAL as each window week's actuals load; FINAL when the last
  window week goes FINAL under the Thursday 12:00 PM PT rule.
- **Trade judge record.** Each voter earns W-L-P per graded trade: a win for the
  winning side, a loss for the other, a push for every voter on a push. The season
  record is filterable by private group and is never added to any points board.

### 6.2 Screens

- **Play › Trades:** Open (vote), Closed (awaiting grade) and Graded, plus your
  Trade judge record. The post sheet's one lime button is "Post trade".
- **Graded card:** each side's players, the two totals and the margin; at most 6
  numbers.
- **Feed:** trade posted, voting closed (with the split) and graded. Members react
  and comment as on any post.
- No push notifications.

### 6.3 Data

| Table | Holds |
| --- | --- |
| `gtl_trade_posts` | Poster, created time, Side A and Side B player IDs, window start week and length, voting close time, status (open / closed / withdrawn / graded), audit. |
| `gtl_trade_votes` | One immutable row per trade and member: side and cast time. |
| `gtl_trade_results` | Per-week side totals, overall totals, outcome, PROVISIONAL/FINAL status and the loads used. |

Routes: `POST /trades/read`, `/trades/post`, `/trades/vote`, `/trades/withdraw`.
The vote gate is `now >= voting_closes_at`, with the voter's own vote always
visible to them.

## 7. Failure handling

Fail closed; missing is never 0.

| Case | Behavior |
| --- | --- |
| No fresh estimate snapshot by Tuesday 12:00 PM PT | Week stays unopened with "waiting on fresh estimates". The commissioner fallback may publish only from a snapshot whose stats end at the prior week. No publish before the first slot's kickoff: "No Points this week", recorded, no zeros. |
| Slate builder finds no valid slate | Fails closed; the commissioner may publish a manual slate meeting the same constraints, audited. |
| Stats missing for a player who played | Slot shows "Pending stats"; the week cannot go FINAL until it resolves. |
| Played flag unknown | Slot stays pending; before FINAL the commissioner may rule it void or played, with an audit entry. |
| Player changes teams, game postponed out of the week or cancelled | Slot void for everyone. |
| Kickoff time changes inside the week | The slot's lock follows the new kickoff from the schedule source. |
| Actuals fetch, validation or checksum failure | The last good load stays; source time and failure are shown; nothing is re-graded. |
| Save after kickoff, locked slot changed, duplicate request | Refused (`GTL_POINTS_CLOSED` / `GTL_POINTS_LOCKED`) or idempotent replay through the receipt pattern. Only server time counts. |
| Correction after FINAL | Recorded as a note on the week; points, ranks and winners do not change. |

## 8. Privacy and rights

- Guesses and votes exist only in the database behind authenticated readers. No
  unrevealed guess, draft or vote enters a public asset, the public repository or
  an unauthenticated route (AGENTS.md; D-31).
- The slate, the actuals and the House estimates are derived from public nflverse
  data under CC BY 4.0, credited "nflverse" behind ⓘ and in Guidance and sources.
- Snap counts (PFR via nflverse) are used on the server for the played flag only
  and never committed raw [evidence D38, D39].
- Free data only; no paid feed, odds credits, player props, league sync or expert
  rankings. Trades contain only player IDs.
- Nothing a member enters is deleted, moved or hidden (D-23); drafts, events,
  withdrawals and votes stay in the record.

## 9. Tests (each protects a named contract)

- **Scoring:** `max(0, 10 − |guess − actual|)` to the tenth; a void slot lowers the
  maximum and scores nothing for anyone; an unlocked slot scores nothing and reads
  "—"; PROVISIONAL re-grades on a corrected load; FINAL freezes; a correction after
  FINAL changes no total, rank or winner; the pinned rules version is used even
  after the weights change.
- **Gate:** before the viewer's lock-in or kickoff, another member's guess and the
  House estimate are absent from `/points/read`, standings, aggregates, feed text
  and exports (hidden-sentinel tests in the M-08 style); after either, they appear.
- **Locks:** a locked row cannot be updated by any writer or a direct update; a
  write after kickoff is refused; a duplicate request replays its receipt.
- **Boards:** a member appears only after their first lock-in of the season;
  weeks not played read "—"; ties share the rank; House never takes a rank; "beat
  the House" counts only weeks with a complete House.
- **Slate builder:** the same inputs give the same slate; positions, pools,
  eligibility, one slot per game and at least two kickoff windows always hold;
  no valid slate fails closed.
- **Actuals loader:** idempotent per checksum; partial coverage reported, not
  hidden; failure keeps the last good load; re-grades audited; a slate player
  missing from the review file (downgraded to Doubtful, then played) is still
  scored from the stats file; a checksum that differs from the review's recorded
  actual-stats checksum is flagged and changes nothing; a slate player with no
  snap row stays pending, never 0 or void.
- **Slate pinning:** the slate keeps the snapshot file and SHA-256 it was built
  from, and the House keeps those estimates after Track 1 rebuilds snapshot W.
- **Trades:** window start and the end-of-season shrink; posting refused after
  Week 17's first kickoff; vote hidden until close and final once cast; withdraw
  only before the first vote; 5% push and 0–0 push; judge W-L-P.
- **UI and boundary:** brand QA, axe, 320/390/1280px, Light and Dark, 44px
  targets, keyboard and focus, and the public bundle scan proving no guesses or
  votes ship in assets. Database and route tests use the existing PGlite and
  `gtl-api` handler pattern.

## 10. Rollout

- **Migrations** (working names; file names set in the implementation plan), each
  applied on its own after Sean's explicit "apply P-0N", with the existing release
  evidence (exact source and CI, fresh hosted evidence, data-preservation hashes,
  permission and privacy checks, rollback readiness and verification):
  - **P-01:** Points tables, gate, lock-in, read, load and finalize functions.
  - **P-02:** feed and push CHECK extensions and the Points reminder claim.
  - **P-03:** the open, finalize and load schedules.
  - **T-01** (phase 2): trade tables, gate and functions.
- `gtl-api` and Pages deploys follow the manual release workflow
  ([SHARED_DEPLOYMENT.md](../../SHARED_DEPLOYMENT.md)). The October 19 policy removed
  release timing windows; player locks are unchanged.
- **Order:** Track 1's daily refresh (D-57) live first; then P-01 with the Points
  actuals loader (section 4.4), the
  routes and the screens; then P-02 and P-03; the first live week is the next
  Tuesday open. Phase 2 follows after two FINAL Points weeks.
- **Effort** [assumed]: phase 1 about 1–2 weeks (L) including tests and release
  verification; phase 2 about 3–5 days (M).
- **NFL only.** The NBA section (PR #167) and other sports are unchanged.

## 11. Out of scope

Real money or stakes; over/under or more/less framing; league sync or roster
import; D/ST; kickers on the Points slate; player props; consensus or expert
rankings; LLM-written text; superflex or TE-premium scoring; a combined
cross-game standing; back-filled weeks; push for trades. The weekly league paper
(R7) is a separate item that may later read Points results.

## 12. Decision entry

Sean approved this specification on October 23, 2026; the entry below is recorded
as D-56 in [DECISIONS.md](../../DECISIONS.md#d-56--guess-the-points-and-trade-verdicts-october-23-2026),
with the approval added. The draft as reviewed:

> ## D-56 — Guess the Points and Trade verdicts (proposed October 22, 2026)
>
> Sean designed a weekly fantasy guessing game and a trade-grading add-on in chat
> on October 22–23, 2026, answering each question one at a time and approving each
> design section. Written design:
> `docs/superpowers/specs/2026-10-22-guess-the-points-design.md` (linked from
> `docs/DECISIONS.md` when the entry is added).
>
> - **Guess the Points.** A third Play game. Each week GTL publishes one slate of
>   five NFL players (QB, RB, WR, TE, FLEX), drawn from its weekly estimates, no two
>   from the same game, across at least two kickoff windows; the commissioner may
>   swap before the open. The week opens Tuesday 12:00 PM PT. Each member guesses
>   each player's Full PPR fantasy points (4-point passing TD, whole numbers 0–60).
>   Each slot locks in on its own, is final once locked, and closes at its game's
>   kickoff; an unlocked slot scores nothing.
> - **Reveal.** Other members' guesses and GTL's House estimate for a slot show
>   once the viewer has locked in that slot, or at its kickoff.
> - **Scoring.** 10 minus fantasy points off, floor 0, per slot, against nflverse
>   actuals. PROVISIONAL when stats land; corrections re-grade until the following
>   Thursday 12:00 PM PT, then FINAL and frozen. A player with no snap, a team change
>   or a game moved out of the week voids the slot for everyone.
> - **Boards.** A separate Points board with weekly and season standings, reused in
>   the Community and every private group, never added to Spread or Total. Ties
>   share the rank. House is an unranked row. Optional: a member joins the board,
>   due list and reminder with their first lock-in of the season.
> - **Push.** One opt-in reminder 2 hours before the member's next unlocked slot
>   kicks off, at most once a week, never naming a player, guess or score.
> - **Trade verdicts (phase 2).** Any member posts 1–3 players per side (at most 2
>   open trades a week); members cast one hidden, final vote until the first kickoff
>   of the four-week window; GTL grades each side's Full PPR points over that window
>   (push within 5%); voters earn a Trade judge W-L-P record that never enters a
>   points board.
> - **Data and limits.** Free nflverse data only (CC BY 4.0, credited); no league
>   data, odds, props or money. Depends on the weekly fantasy refresh producing fresh
>   estimates and a weekly actuals export. Guesses and votes never enter public
>   assets.
>
> This decision authorizes an implementation plan for review. It does not apply a
> migration, deploy, or establish phone acceptance.
