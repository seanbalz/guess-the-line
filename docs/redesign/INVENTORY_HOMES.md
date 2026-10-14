# Inventory homes for the redesign

Owner: Sean Balsiger · Version 1 · October 14, 2026
Status: planning record for stage 5 of [the redesign build plan](../REDESIGN_BUILD_PLAN.md). Nothing in this file is built, applied or deployed.

---

## Why this table exists

D-23: nothing a player entered is deleted, moved or hidden. The old app retires at stage 81, so every item on today's screens needs a home in the new app first. This table gives each of the 191 items in the feature inventory of today's app (October 13, 2026, read at `cecff9e` on `claude/d35-dashboard-redesign`) one home now, so no stage finds a missing screen at cut-over.

The inventory itself is kept with the prototype sources. Each row below repeats its number and item name, so this table can be checked on its own.

## How to read it

- **#** and **Item today:** the inventory row and what it is called today. The section heading names today's screen and files.
- **Home:** exactly one of four:
  - `Stage`: the item's job continues in the new app, built by the stages named.
  - `History`: the item retires from the main screens; its records stay readable, read-only, in Me › History (stages 73 and 74).
  - `Commissioner`: Me › Commissioner tools (stage 77), then a native page (stage 78).
  - `Cut, data kept`: the item leaves the screens when the old app retires (stage 81). Anything a player entered through it stays stored and readable where **Data kept** says.
- **Stages:** the build plan stages that put the home on screen. A stage's own Build-after stages (its server, its reader) come with it, so they are not repeated. A `Cut, data kept` row always names stage 81, and no other row does. No row names a stage that D-39 dropped.
- **In the new app:** tab › screen › layer, using the prototype's names (`sh.` sheet, `dlg.` dialog, `page.` page).
- **Data kept:** what a player entered through this item and where it stays readable. "None" means the item only shows or explains; it holds no entries of its own.

## D-39 applied

- **Journal (rows 168 to 171):** read-only in History (stage 74). The new app has no form to add or correct a journal record. My bets (stage 45) holds Virtual Units bets and challenges only.
- **Tester list:** stage 49 and M-14 are dropped. No row depends on them. "Try the new app" shows to every signed-in member (stage 9).
- **Per-game lock-in:** rows about sending picks (43, 52, 113, 114, 125) follow the D-39 section of the plan: each game's guess is final once locked in, and that opens its line and friends' guesses for that market.
- **Real slips:** dollar stakes on new slips; old slips keep their units; a tail asks to confirm and has no undo (rows 157, 160).

## Rows this table adds to a stage's scope

These homes are not spelled out in the stage text yet. The stage that builds them takes them in.

- **Stage 28, row 40:** when no week is open, Play shows "Week N opens Mon 12:00 AM PT" instead of an empty board. Stage 36 puts the same words on Home.
- **Stage 59, row 73:** an existing practice game stays in the switcher with a "Practice" tag. New leagues have no practice switch.
- **Stage 73, row 55:** History keeps a season picker once a second season has records.
- **Stage 73, row 73:** a practice-origin ballot reads "Practice · unofficial" in the week detail.
- **Stage 73, row 128:** the week detail shows your own changes (`/me/changes`, stage 72) in plain words, to you only.
- **Stage 74, row 129:** the older group scoring views list the archived invalid-matchup predictions with their count.
- **Stage 74, row 170:** archived journal records are listed with an "Archived" label, never left out.

## The cut-over audit

The cut-over checklist (plan section 10) ticks the D-23 audit when every row is done:

- a `Stage`, `History` or `Commissioner` row is done when every stage it names has merged and is live;
- a `Cut, data kept` row is done when its Data kept entries are readable where it says; stage 81 then removes the old screen.

When a later stage moves a home, it updates the row in the same PR. `tests/inventory-homes.test.mjs` checks that rows 1 to 191 each have a home and that every stage named exists in the plan.

## Counts

| Home | Rows |
|---|---|
| Stage | 136 |
| History | 26 |
| Commissioner | 6 |
| Cut, data kept | 23 |
| Total | 191 |

---

## The 191 rows

### A. Sign-in and first run (`AuthGate.jsx`, `GameHub.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 1 | Sign-in and create-account card | Stage | 76 | Sign-in page (`NextSignIn`): email and password | Accounts and sign-in methods unchanged |
| 2 | Continue with Google | Stage | 76 | Sign-in page: Google | Accounts unchanged |
| 3 | Forgot password, reset, new password, resend confirmation | Stage | 76 | Sign-in page: recovery, resend, confirmation | Accounts unchanged |
| 4 | One-line game pitch | Stage | 76 | Sign-in page, rewritten for two games (Guess the Line and Bets) | None |
| 5 | Saved invitation notice | Stage | 11 | Saved invite card after sign-in | The saved invite link, until joined or dismissed |
| 6 | Display-name step | Stage | 11, 76 | Name step on an empty display name (logic in 11, look in 76) | Display names kept in full |
| 7 | Edit display name | Stage | 37 | Me › Settings › Display name (`/profile`) | Existing names never cut (D-23); new edits up to 60 characters |

### B. My games hub (`GameHub.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 8 | My games heading and explainer | Stage | 11 | League switcher (`sh.switcher`) | None |
| 9 | Your games list | Stage | 11, 59 | League switcher rows with faces and ranks | Every membership and game, practice games included |
| 10 | New game dialog | Stage | 59 | League › switcher › Create a league (`sh.createLeague`) | Existing games keep their format |
| 11 | Invite players dialog | Stage | 59 | League › Invite (host only, `sh.invite`): invite list, status, expiry, Revoke, New link | Every invite with its status and expiry |
| 12 | Invitations for you | Stage | 11 | League switcher › invites with Join | Pending invites |
| 13 | Invitation link card | Stage | 11 | Saved invite card: Join or Dismiss | The saved invite link |
| 14 | Play Solo card | Cut, data kept | 81 | No door; Solo's parts move (rows 164 to 172) | Solo entries: rows 165 to 171 |
| 15 | Bet Tracker card | Stage | 43, 46 | Bets › Real slips | Every real slip (rows 157 to 163) |
| 16 | Refresh games and footer line | Stage | 11 | Refresh on focus and every 5 minutes; the footer line goes | None |
| 17 | "← Community" link | Stage | 10 | Tab bar | None |
| 18 | Hub header | Stage | 10, 37 | Top bar; Me menu › Sign out | None |

### C. Community home (`CommunityHome.jsx`, `PushReminders.jsx`, `RefereeAssignments.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 19 | Community header | Cut, data kept | 81 | Home's week hub replaces it | None |
| 20 | Sports switcher | Stage | 38 | Me menu › More sports, coming soon (`sh.moreSports`, DP-19) | None |
| 21 | Coming-soon cards and Notify me | Stage | 38 | More sports sheet with Notify me per sport (`/community/interest`) | Every Notify me choice |
| 22 | Community tabs | Stage | 10, 11 | Tab bar; the Play counter | None |
| 23 | No week open state | Stage | 36 | Home hero: no week published | None |
| 24 | Picks-due card | Stage | 12, 36 | Home hero: countdown, status line, one next action; not-open and closed states | None |
| 25 | Reminder prompt on the due card | Stage | 36 | Home: the one-time "Remind me" when `pushConfigured` | None (the device switch is row 133) |
| 26 | Community leaderboard | Stage | 12, 58 | League › Guess the Line › Spread and Total boards (DP-1, DP-2); Home rank tile | None |
| 27 | Feed post | Stage | 64 | League › Feed: every old kind renders | Every old post: joined, week published, ballot submitted, bet posted, bet settled |
| 28 | Picks inside a feed post | Stage | 64 | Ballot post: a lock row, then one friend's picks (`sh.picks`) once revealed | Picks, shown under the per-game reveal (D-31, D-39) |
| 29 | Likes | Stage | 65 | Feed reactions; an old like reads as a thumbs up | Every current like, kept as a reaction (M-21) |
| 30 | Comments | Stage | 64 | Comments sheet (`sh.comments`) | Every old comment renders; no edit or delete |
| 31 | Older activity | Stage | 64 | Feed paging | Every older post stays reachable |
| 32 | Status notices | Stage | 10 | Toasts | None |
| 33 | Preview / publish early panel | Commissioner | 77, 78 | Commissioner tools › Week opening | Published weeks and their slates |
| 34 | Automatic opening status | Commissioner | 77, 78 | Commissioner tools › Week opening, schedule status | Week-open run records |
| 35 | Game referees form | Commissioner | 77, 78 | Commissioner tools › Game referees | Every referee assignment |
| 36 | Page footer | Stage | 11, 37 | Me › Settings › Appearance; Me menu › Sign out; automatic refresh | None |

### D. Community Picks tab (`CommunityHome.jsx` WeekPicks, `ChipPicker.jsx`, `SitOutWeek.jsx`, `LineAtGuess.jsx`, `TeamFacts.jsx`, `GameTrends.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 37 | Market toggle | Stage | 28 | Play › Spread / Total switch | None |
| 38 | Show trends toggle | Cut, data kept | 13, 81 | One trend chip per Lines card; trends in the game sheet | None |
| 39 | Week status line | Stage | 28 | Play section head: "6 LEFT TO PICK", due time, who's in | None |
| 40 | Not-open notice | Stage | 28, 36 | "Week 7 opens Mon 12:00 AM PT" on Home and as Play's empty state | None |
| 41 | Sat-out notice | Stage | 30, 73 | Play's sat-out state; "Skipped" in History | Every sit-out, with its reason |
| 42 | Closed-week notice | Stage | 30, 36 | "Closed at kickoff" rows in Play; Home after the last kickoff | None |
| 43 | Submit receipt | Stage | 29 | Play save moment: "Sent picks are final." | Submission times (D-16) |
| 44 | Unsaved picks recovery card | Stage | 28, 29 | Drafts save themselves; a failed save keeps the typed values | Drafts on the server; the old tab copy stays in the old app until stage 81 |
| 45 | Chip help tip | Stage | 28 | Up next card: "Tap a number" | None |
| 46 | Game pick card header | Stage | 28 | Up next card: matchup and kickoff | None |
| 47 | Team records line | Stage | 13 | Game sheet header: team records in words (DP-16) | None |
| 48 | Line at your guess | Stage | 31 | Your pick sheet (`sh.yourPick`): "Line at your guess", "First line after submission" or "Line pending" | Every saved line at the guess (D-27) |
| 49 | Chip picker | Stage | 28 | Up next card chips and the ± readout | Picks, as drafts and sent ballots |
| 50 | Revealed picks (after sit-out) | Stage | 31 | Everyone's picks (`sh.everyone`) | Other players' picks, under the per-game reveal |
| 51 | Per-game Trends button | Stage | 13, 34 | Game sheet trends; All trends | None |
| 52 | Sticky save bar | Stage | 28, 29 | Play dock: left to pick, Review & submit; errors keep the typed values | Drafts and sent ballots with every revision (D-16) |
| 53 | Sit out this week | Stage | 30 | Skip dialog (`dlg.sitOut`) and See picks now (`dlg.revealForfeit`) | Every sit-out (D-23) and forfeit record |

### E. Community History tab (`CommunityHistory.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 54 | Player picker | History | 73 | Me › History person chips; removed members listed | None |
| 55 | Season select and Refresh | History | 73 | History season and week picker | None |
| 56 | Week panel header | History | 73 | History week detail head | None |
| 57 | Ballot status and scoring basis | History | 73 | Week detail status line, Late pill, "original time not recorded"; the basis behind a tap | Submission times, revisions, origin and eligibility |
| 58 | Week points | History | 73 | Week detail points and scored count | None |
| 59 | Per-game history rows | History | 73 | Week detail game rows; line provenance behind a tap | Every guess and its line at the guess |
| 60 | Hidden-until-you-submit note | History | 73 | Week detail lock row | None |
| 61 | Scoring footnote | Cut, data kept | 30, 81 | How to play explains how lines are chosen | None |

### F. Group game shell (`App.jsx`, `DeferredScreen.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 62 | Sidebar league block | Stage | 11, 59 | League pill and switcher; Invite for the host | None |
| 63 | Sidebar navigation | Stage | 10 | Tab bar (DP-20) | None |
| 64 | Season card "Three games. One rivalry." | Stage | 30 | How to play, two games (`sh.howToPlay`) | None |
| 65 | Design lab entry | Cut, data kept | 81 | Leaves with the old app; the code stays in git | None (choices were saved per browser only) |
| 66 | Settings & setup entry | Stage | 37 | Me menu › Settings (`page.settings`) | None |
| 67 | "PRIVATE LEAGUE · v0.1" note | Cut, data kept | 81 | Leaves (stale) | None |
| 68 | Topbar breadcrumb, season label, help icon | Stage | 10, 30 | Top bar league pill; How to play from Me | None |
| 69 | Signed-in chip and Sign out | Stage | 10, 37 | Avatar menu › Sign out | None |
| 70 | Local player view switch | Cut, data kept | 81 | Leaves (a local owner preview, not a sign-in) | None |
| 71 | Page heading | Stage | 10 | One short plain title per tab | None |
| 72 | Heading actions | Stage | 31, 36, 75 | Home's one next action; Everyone's picks; Me › Settings › Export my data | None |
| 73 | Practice banners | History | 59, 73 | "Practice" tag on an existing practice game in the switcher; "Practice · unofficial" in History | Practice games and practice-origin ballots, still unofficial |
| 74 | Commissioner eligibility ruling | History | 73 | Week detail ruling label | Every eligibility ruling |
| 75 | Challenge results unavailable callout | History | 74 | Betting Challenge · retired page, with its own unavailable state | None |
| 76 | Spread benchmark summary | History | 74 | The Week 5 benchmark freeze record, read-only (DP-4) | The freeze record |
| 77 | Provisional analysis summary | History | 74 | Older group scoring views, read-only | None |
| 78 | Footer | Stage | 7, 30 | "PT" on every time; How to play from Me | None |
| 79 | Rules modal "Three ways to play" | Stage | 30 | How to play, worded for D-35 to D-39 (DP-22) | None |
| 80 | App-wide states | Stage | 10, 11 | Toasts, offline banner, per-tab error cards with "Use the old app"; access-pending and removed-account screens | None |

### G. Group dashboard (`App.jsx` Overview, `VisualDashboard.jsx`, `DashboardInsights.jsx`, `DataConnections.jsx`, `DashboardPreferences.jsx` and others)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 81 | Dashboard market tabs | Stage | 12 | Home status line covers Spread and Total at once | None |
| 82 | Dashboard notices | Stage | 33 | Lines: "Updated … PT" or "Latest line" | None |
| 83 | Accuracy matchup scoreboard | Stage | 58, 67 | League boards (group boards hold members only, DP-9); head-to-head closest record | None |
| 84 | "Your ballot comes first" lock | Stage | 33, 43 | One gate banner per screen, with the way in | None |
| 85 | Source & scoring details | Stage | 30, 31 | Your pick sheet; How to play | None |
| 86 | Next action and mode tiles | Stage | 12, 36 | Home's next action and rank tiles | None |
| 87 | Insights: Player points tab | Stage | 58 | League boards (the same numbers as row 83) | None |
| 88 | Insights: Accuracy mix donut | Stage | 67 | Player sheet stats: exact guesses, average miss | None |
| 89 | Insights: Line movement tab | Stage | 34 | Game sheet line movement (DP-26) | None |
| 90 | Saved references by game | Stage | 31, 32 | Your pick sheet; Edge board gap | Every saved line at the guess |
| 91 | How to read this | Stage | 30 | How to play | None |
| 92 | Compare accuracy in detail | Stage | 67 | Player sheet head-to-head (`sh.player`) | None |
| 93 | Compare across recorded snapshots | History | 74 | Older group scoring views, read-only, dates on every axis | None |
| 94 | Gap bars panel | Stage | 31, 32 | Edge board results; everyone's picks for a game | None |
| 95 | Show all N games | Stage | 32 | The Edge board lists every game | None |
| 96 | Market line movement chart | Stage | 34 | Game sheet line movement with team names (DP-26) | None |
| 97 | Refresh status | Stage | 33, 38 | "Updated … PT" on Lines; Me › Data sources | None |
| 98 | Game trends section | Stage | 13, 34 | Board trends (at most 3); game sheet trends | None |
| 99 | Your betting week card | Stage | 46 | Bets › Real slips on the current week; its totals go with the tracker metrics (row 155) | Every real slip |
| 100 | Data connections panel | Stage | 38 | Me › Data sources (`page.dataSources`, DP-24) | None |
| 101 | Your forecast vs the recorded market | History | 32, 74 | Guess against the line on the Edge board; personal forecasts read-only in History (D-36) | Every personal forecast and its revisions |
| 102 | Unavailable analysis sources | Cut, data kept | 81 | Leaves (DP-24) | None |
| 103 | Research links | Stage | 38 | Me › Data sources › research links | None |
| 104 | Customize dashboard | Cut, data kept | 37, 81 | Reduce motion moves to Me › Settings; the layouts go | None (choices were saved per device) |
| 105 | Choose dashboard games | Cut, data kept | 81 | Leaves; the Lines board shows every game | None (choices were saved per device) |

### H. Group My picks and Betting Challenge (`PredictionEntry.jsx`, `App.jsx`, `ChallengeQuoteReview.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 106 | Ballot header | Stage | 28 | Play, the one ballot screen | None |
| 107 | Open analysis / Compare picks buttons | Stage | 31, 32 | Everyone's picks; Edge board | None |
| 108 | Weekly ballot note | Cut, data kept | 30, 81 | How to play says picks count in every league | None |
| 109 | Deadline callout | Stage | 28, 30 | Play section head; the late card | None |
| 110 | Save-check and recovery panels | Stage | 11, 29 | An unconfirmed save keeps the typed values; a 409 keeps them too | Drafts and sent ballots |
| 111 | Search, filter, trends toggle | Stage | 28 | Still-to-pick rows do the Missing filter's job; search and the trends toggle go | None |
| 112 | Picks table | Stage | 28, 31, 32 | Play game card; Everyone's picks; Edge board | Picks |
| 113 | Save state and save bar | Stage | 28, 29 | Play dock | Drafts and sent ballots with every revision |
| 114 | Review & submit dialog | Stage | 29 | Review sheet (`sh.review`) | None |
| 115 | Mode tabs | Stage | 28, 74 | Spread / Total switch; Betting Challenge in History | None |
| 116 | Betting Challenge screen | History | 74 | Me › History › Betting Challenge · retired, every player's record | Every Betting Challenge selection and result |
| 117 | Record Challenge selection dialog | History | 74 | No new selections (D-35); recorded selections read-only in History | Every recorded selection with its quote |

### I. Compare picks, Leaderboard, Edge board, History & audit (`App.jsx`, `SubmissionComparison.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 118 | Compare picks intro and Refresh | Stage | 31 | Everyone's picks (`sh.everyone`) | None |
| 119 | Player submission tiles | Stage | 12, 30 | Who's in faces on Home; Who's in sheet (`sh.whosIn`) | None |
| 120 | Side-by-side guesses table | Stage | 31 | Everyone's picks per game, with the strip | Other players' picks, under the per-game reveal |
| 121 | Submission comparison | Stage | 31, 67, 74 | Everyone's picks; head-to-head; forecasts in History | Personal forecasts (row 167) |
| 122 | "Analysis" and "Line movement" link cards | Cut, data kept | 81 | Leaves; line movement is in the game sheet (row 96) | None |
| 123 | Leaderboard stat tiles | Cut, data kept | 81 | Leaves (DP-11) | None |
| 124 | Week standings table | Stage | 58, 67, 74 | League boards (Week); closest record in the player sheet; Betting Challenge W–L–P in History | None |
| 125 | Edge board | Stage | 32 | Play, once a guess is locked in (D-36, D-39) | None |
| 126 | Archived score movement chart | History | 74 | Older group scoring views, dates on every axis (DP-17) | None |
| 127 | Source timeline | History | 74 | Older group scoring views | None |
| 128 | Your revision audit | History | 73 | Week detail › your changes, in plain words (DP-15) | Every revision and audit event (D-16) |
| 129 | Archived invalid-matchup note | History | 74 | Older group scoring views list the archived predictions | Archived predictions (`gtl_prediction_archives`) |
| 130 | Export my data | Stage | 75 | Me › Settings › Export my data | Your own rows, Late marker included |

### J. Settings and commissioner controls (`App.jsx` SettingsPage, `Theme.jsx`, `InstallApp.jsx`, `PushReminders.jsx` and the control components)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 131 | Appearance (Dark / Light / System) | Stage | 10, 37 | Me › Settings › Appearance, on the old storage key | None |
| 132 | Install app | Stage | 39 | Me › Settings › Install app | None |
| 133 | Pick reminders | Stage | 39 | Me › Settings › Pick reminders, only when `pushConfigured` | Each device's reminder choice |
| 134 | Final-result review | Commissioner | 77, 78 | Commissioner tools › Final scores ("Never settles bets") | Recorded finals and corrections |
| 135 | Scoring benchmark freeze | History | 74 | The control stays in the old app until stage 81; the freeze record is read-only in History (DP-4) | The Week 5 freeze record |
| 136 | Manual market connection | Commissioner | 77, 78 | Commissioner tools › Odds connection (counts only, never secrets) | Collected odds snapshots |
| 137 | League rules panel | Stage | 30, 59 | How to play; League members (host and roster) | None |
| 138 | Account & access checklist | Cut, data kept | 77, 81 | Leaves (DP-24); odds status moves to Odds connection | None |
| 139 | Storage explainer callout | Cut, data kept | 81 | Leaves | None |
| 140 | Schedule source | Stage | 38 | Me › Data sources | None |

### K. Virtual Units (`VirtualUnits.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 141 | Virtual Units header and Refresh lines | Stage | 43 | Bets › Place, without the dollar framing (DP-22) | None |
| 142 | Settle finals | Commissioner | 77, 78 | Commissioner tools › Settle bets and challenges, with the schedule status | Settlement results |
| 143 | Saved book lines note | Stage | 30, 45 | How to play › Bets; "Results from final scores · last update …" | None |
| 144 | Stats row | Stage | 45 | My bets week card and the 3 bets or 3U meter; Home Bets tile through the slot | None |
| 145 | Settlement status line | Stage | 45 | My bets: "Results from final scores · last update …" | None |
| 146 | Game card | Stage | 43 | Bets › Place market rows | None |
| 147 | Side buttons | Stage | 43 | Market buttons with the best named-book price (DP-5) | None |
| 148 | Consensus line | Stage | 33, 34 | Lines middle line; game sheet line card (DP-5) | None |
| 149 | Stake buttons and Place pick | Stage | 44 | Bet slip (`sh.slip`): 0.5 to 3U chips and a stepper; edits until kickoff | Every bet with its terms and edits (D-18) |
| 150 | Saved pick and result | Stage | 45 | My bets lists and the bet sheet (`sh.bet`) | Every bet and result, from every group |

### L. Bet Tracker and Unit Betting (`SocialBetTracker.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 151 | Bet Tracker header and Add bet | Stage | 46 | Bets › Real slips › Post a slip (`sh.postSlip`) | None |
| 152 | View tabs | Stage | 46, 47 | Real slips list and past weeks; Compare goes (row 161) | None |
| 153 | Week select and Refresh | Stage | 46, 47 | The current published week by default (DP-3); a week picker for past weeks | None |
| 154 | Filters panel | Cut, data kept | 81 | Leaves (D-36) | Every slip stays in Real slips (rows 157 to 163) |
| 155 | Metrics row | Cut, data kept | 81 | Leaves (D-36, DP-21) | Slips and results stay in Real slips and History (stage 74) |
| 156 | Performance charts | Cut, data kept | 81 | Leaves (D-36) | Slips and results stay in Real slips and History (stage 74) |
| 157 | Bet card | Stage | 46, 47 | Real slip list and detail (`sh.realSlip`): legs, book, stake, notes, who tailed, late flag | Every real slip, note and tail; old slips keep their units (D-39) |
| 158 | Bet details & history | Stage | 47 | Slip history in plain words (DP-15); correct; report result | Every revision and audit entry |
| 159 | Follow / Following | Stage | 46 | Real slips › Follow | Every follow |
| 160 | Tail a bet | Stage | 46 | Real slips › Tail, with a confirm and no undo (D-39) | Every tail and its link to the original slip |
| 161 | Compare players table | Cut, data kept | 81 | Leaves: real slips never count on a board (D-36) | Slips and results stay in Real slips and History (stage 74) |
| 162 | Add or correct bet editor | Stage | 46, 47 | Post a slip; correct a slip; parlays of 2 to 20 legs | Every slip and correction |
| 163 | Report result editor | Stage | 47 | Real slip › Report result, which makes the feed post | Every reported result |

### M. Solo (`PersonalWorkspace.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 164 | Solo header, week select, refresh, tabs | Cut, data kept | 81 | Leaves; Solo's parts move (rows 165 to 171) | Solo entries: rows 165 to 171 |
| 165 | Solo Guesses | Stage | 28 | Play (the same weekly ballot) | The weekly ballot, one copy shared with Play |
| 166 | Favorites and private notes | Stage | 35, 74 | Private note in the game sheet ("Only you see this."); saved games read-only in History | Every note, never cut, and every saved game |
| 167 | Personal outcome forecast | History | 74 | Me › History › forecasts, read-only (D-36) | Every forecast and its revisions |
| 168 | Journal add / correct form | History | 74 | No new journal records (D-39); the records read-only in History | Every journal record |
| 169 | Journal performance | History | 74 | Me › History › journal summary, read-only | None |
| 170 | Journal records list | History | 74 | Me › History › journal, read-only; archived records listed with their label | Every journal record, archived ones included |
| 171 | Journal record history | History | 74 | Me › History › journal, read-only: each record's changes in plain words | Every change to a record |
| 172 | Solo footer | Cut, data kept | 81 | Leaves; Sign out is in the Me menu | None |

### N. Trends (`GameTrends.jsx`, `TrendsPanel.jsx`, `TrendsView.jsx`, `TrendCard.jsx`, `WindForecast.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 173 | Trends intro notes | Stage | 13, 34 | Game sheet trends; All trends | None |
| 174 | Strongest historical evidence | Stage | 13 | The one trend chip per card; board trends | None |
| 175 | Kickoff wind forecast | Stage | 13 | Game sheet weather row, times in PT (D-34, DP-7) | None |
| 176 | Consistent, not proven | Stage | 34 | All trends | None |
| 177 | Updates after the final | Cut, data kept | 81 | Leaves | None |
| 178 | Watch list | Stage | 34 | All trends | None |
| 179 | Referee section | Stage | 13, 34 | Game sheet referee row; the referee look-up | Referee assignments (row 35) |
| 180 | Context families | Stage | 34 | All trends, "No proven edge" | None |
| 181 | Teams, coaches, QBs, head to head | Stage | 34 | All trends | None |
| 182 | Line-dependent records | Stage | 13, 34 | Locked with their market until that guess is locked in | None |
| 183 | Trend card | Stage | 13, 34 | Short trend cards (DP-18); the full card in All trends | None |
| 184 | Trends source footer | Stage | 13, 38 | Lines footer credits; Me › Data sources | None |

### O. Shared pieces and internal tools (`TeamIdentity.jsx`, `ScoringReference.jsx`, `SportsbookSources.jsx`, `Brand.jsx`, `BrandLab.jsx`)

| # | Item today | Home | Stages | In the new app | Data kept |
|---|---|---|---|---|---|
| 185 | Team marks and matchup | Stage | 8 | `TeamMark` (the D-22 marks, sized for DP-27) | None |
| 186 | Saved line vs current consensus box | Stage | 31, 32 | Your pick sheet; "Line now" on the Edge board | Saved lines at the guess |
| 187 | Sportsbook sources | Stage | 34 | Game sheet › Book lines with the Best marker | None |
| 188 | Scoring policy note | Stage | 30 | How to play | None |
| 189 | Source note | Stage | 34, 38 | Line card provenance behind a tap; Me › Data sources | None |
| 190 | Brand mark | Stage | 8, 10 | The Field monogram in the top bar | None |
| 191 | Design lab | Cut, data kept | 81 | Leaves at stage 81; the code stays in git | None (choices were saved per browser only) |
