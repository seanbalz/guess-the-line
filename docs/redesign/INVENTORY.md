# GTL web app inventory for the D-35 redesign

Date: October 13, 2026 · Branch read: `claude/d35-dashboard-redesign` at `cecff9e` · Read-only. No code, data or database was changed or read beyond the repository files.

Sources read: every `web/src/*.jsx` and its stylesheet, `web/src/api.js`, `marketStatus.js`, `communityFormat.js`, `dashboardPreferences.js`, `cloud/community.mjs`, `cloud/virtual-units.mjs`, migration `20261013010000`, and the docs `DECISIONS.md` (D-35), `BRAND_GUIDE.md`, `RULES.md`, `DASHBOARD_APP.md`, `SIMPLE_DASHBOARD.md`, `SOCIAL_COMMUNITY.md`, `DASHBOARD_VISUAL_AUDIT_2026_10_12.md`, `PERSONA_AUDIT_2026_10_09.md`, `DASHBOARD_UI_DESIGN_HANDOFF.md` (D1 to D15).

## How to read the table

- **Who:** P = player, C = commissioner, Dev = local owner preview only.
- **D-35 home:** Home · Play (Guess the Line) · Bets · Lines & Trends (incl. game detail) · League (leaderboards, feed, switcher) · History · Settings/Profile · Commissioner tools · Retire to History.
- **Treatment:** default-visible · behind-a-tap · settings · commissioner-only · retired-but-records-in-History. One extra label, **cut**, marks things that should leave the screens entirely (DASH-9); the data behind them stays stored (D-23).
- **Unclear** in the Note column means D-35 gives the item no clear home. These need a ruling.

## Today's app in one paragraph

There are really five apps stitched together. (1) **Community home** (`CommunityHome.jsx`): feed, picks-due card, a combined leaderboard, a Picks tab and a History tab. (2) **My games hub** (`GameHub.jsx`): group list, invites, and side doors to Solo and Bet Tracker. (3) **Group game app** (`App.jsx`): a sidebar with 9 entries (Dashboard, My picks, Virtual Units, Bet Tracker, Unit Betting, Compare picks, Leaderboard, Edge board, History & audit) plus Settings and a commissioner Design lab. (4) **Solo** (`PersonalWorkspace.jsx`): a third copy of the weekly ballot, Favorites, forecasts and a private journal. (5) **Bet Tracker / Unit Betting** (`SocialBetTracker.jsx`): shared real-money slips, tailing, following and charts. One weekly ballot can be entered on three different screens. Bet records live in five places.

---

## A. Sign-in and first run (`AuthGate.jsx`, `GameHub.jsx`, `styles.css`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 1 | Sign-in and create-account card | AuthGate.jsx | Email and password, Sign in / Create account tabs | P | Settings/Profile | default-visible | Sits before the app; first-run work is DASH-11 |
| 2 | Continue with Google | AuthGate.jsx, oauth.js | One-tap Google sign-in | P | Settings/Profile | default-visible | First-run |
| 3 | Forgot password, reset, new password, resend confirmation | AuthGate.jsx | Account recovery flows | P | Settings/Profile | behind-a-tap | |
| 4 | One-line game pitch | AuthGate.jsx | "Guess every NFL game's spread and total… No real-money wagers." | P | Settings/Profile | default-visible | Rewrite for two games (Guess the Line + Bets) |
| 5 | Saved invitation notice | AuthGate.jsx, invitations.js | "Your invitation is saved in this tab…" | P | League | default-visible | Only when an invite link was used |
| 6 | Display-name step | GameHub.jsx (NameStep, ProfileForm) | "First, what should we call you?" full-screen form | P | Settings/Profile | default-visible | Once, first-run |
| 7 | Edit display name | GameHub.jsx | "Playing as X · Edit display name" | P | Settings/Profile | settings | |

## B. My games hub (`GameHub.jsx`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 8 | My games heading and explainer | GameHub.jsx | "A group is optional: a private leaderboard…" | P | League | behind-a-tap | Becomes the league switcher sheet |
| 9 | Your games list | GameHub.jsx | Game cards: name, Duel/Group/Triple Threat/Practice badge, members x of y, your role, Open game | P | League | behind-a-tap | League switcher; Community is the default league |
| 10 | New game dialog | GameHub.jsx (NewGame) | Name, Duel or Group, practice checkbox | P | League | behind-a-tap | "Create a league" inside the switcher |
| 11 | Invite players dialog | GameHub.jsx (InvitePlayers) | Email → invite link, copy, list with status and expiry, revoke | C | League | commissioner-only | League host only |
| 12 | Invitations for you | GameHub.jsx | Pending invites with Join game | P | League | default-visible | Also worth a Home notice when present |
| 13 | Invitation link card | GameHub.jsx | Accept or Dismiss a saved link | P | League | default-visible | Only when present |
| 14 | Play Solo card | GameHub.jsx | Opens the Solo workspace | P | Play | cut | Solo is split up (rows 164–172) |
| 15 | Bet Tracker card | GameHub.jsx | Open Bet Tracker / My Unit Betting week | P | Bets | cut | The Bets tab replaces it |
| 16 | Refresh games and footer line | GameHub.jsx | "Private games · No real-money wagers", Refresh | P | League | cut | |
| 17 | "← Community" link | GameHub.jsx | Back to the Community home | P | Home | cut | Tab bar replaces it |
| 18 | Hub header | GameHub.jsx (Shell) | Brand, name, Sign out | P | Settings/Profile | settings | Sign out moves to Profile |

## C. Community home (`CommunityHome.jsx`, `community.css`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 19 | Community header | CommunityHome.jsx | "CALL THE NUMBER. OWN THE BOARD." · Community · subtitle · people icon | P | Home | cut | Home gets the week hub instead; orphan icon (audit rank 14) |
| 20 | Sports switcher | CommunityHome.jsx (LeagueSwitcher) | NFL Live, NBA/MLB/NHL/CFB/CBB Coming soon | P | Settings/Profile | settings | **Unclear.** D-35's switcher is for leagues (groups), not sports. Wraps to 3 rows on phones |
| 21 | Coming-soon cards and Notify me | CommunityHome.jsx (ComingSoon) | Season window, Notify me toggle, "N members waiting" | P | Settings/Profile | settings | **Unclear.** Same as row 20 |
| 22 | Community tabs | CommunityHome.jsx | Feed · Picks (n due) · History · Groups & games | P | Home | cut | Replaced by the app tab bar |
| 23 | No week open state | CommunityHome.jsx (WeekUnpublished) | "No week is open yet…" | P | Home | default-visible | Only when true |
| 24 | Picks-due card | CommunityHome.jsx (PicksDue) | Week N picks due, per-market counts, due time, Make picks; not-open and closed variants | P | Home | default-visible | Becomes the deadline countdown and the one big action |
| 25 | Reminder prompt on the due card | PushReminders.jsx (PushReminderPrompt) | "Remind me 2 hours before picks lock" | P | Home | default-visible | Once; the switch lives in Settings |
| 26 | Community leaderboard | CommunityHome.jsx (Leaderboard) | Player, Spread wk/season, Total wk/season, footnote | P | League | default-visible | Becomes the Guess the Line tab. See DP-1, DP-2 |
| 27 | Feed post | CommunityHome.jsx (Post, PostText) | Joined, week opened, ballot submitted, bet posted, bet settled | P | League | default-visible | D-35 adds challenge results, badges, awards |
| 28 | Picks inside a feed post | CommunityHome.jsx (PostPicks) | List of every pick, or "Submit your picks to see these" | P | League | behind-a-tap | A 15-row list per post is too long by default |
| 29 | Likes | CommunityHome.jsx | Heart and count | P | League | default-visible | D-35 asks for emoji reactions |
| 30 | Comments | CommunityHome.jsx | Comment list and add-comment field | P | League | behind-a-tap | Show count by default |
| 31 | Older activity | CommunityHome.jsx | Loads older posts | P | League | default-visible | |
| 32 | Status notices | CommunityHome.jsx | "Your display name has been saved…", "Week N is open." | P | Home | default-visible | Short-lived |
| 33 | Preview / publish early panel | CommunityHome.jsx (PublishWeek) | Season and week fields, review schedule, publish | C | Commissioner tools | commissioner-only | Fallback to the Monday auto-open |
| 34 | Automatic opening status | CommunityHome.jsx (SchedulerStatus) | Enabled, last run, reason | C | Commissioner tools | commissioner-only | |
| 35 | Game referees form | RefereeAssignments.jsx | Pick each game's referee for every member's trends | C | Commissioner tools | commissioner-only | |
| 36 | Page footer | CommunityHome.jsx | Appearance select, "Everything here is shared", Refresh, Sign out | P | Settings/Profile | settings | |

## D. Community Picks tab (`CommunityHome.jsx` WeekPicks, `ChipPicker.jsx`, `SitOutWeek.jsx`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 37 | Market toggle | CommunityHome.jsx | Spread ✓ / Total · Sat out | P | Play | default-visible | |
| 38 | Show trends toggle | CommunityHome.jsx | Turns trend buttons on every card | P | Lines & Trends | cut | Replace with one trend chip per game card |
| 39 | Week status line | CommunityHome.jsx | "Week 6 · 3/15 picked · Due Thu 5:15 PM PT (in 2 days)" | P | Play | default-visible | |
| 40 | Not-open notice | CommunityHome.jsx | "Week N opens Mon…" | P | Play | default-visible | Only when true |
| 41 | Sat-out notice | CommunityHome.jsx | "You sat out Week N…" | P | Play | default-visible | Only when true |
| 42 | Closed-week notice | CommunityHome.jsx | Closed, submitted or not, next open | P | Play | default-visible | Only when true |
| 43 | Submit receipt | CommunityHome.jsx (SubmitReceipt) | "Spread submitted · 15 picks", time, what is still due, Make Total picks, See everyone's picks, Edit | P | Play | default-visible | Good pattern; keep |
| 44 | Unsaved picks recovery card | CommunityHome.jsx | Restore or Discard picks kept in this tab | P | Play | default-visible | Only when present |
| 45 | Chip help tip | ChipPicker.jsx (CHIP_HELP) | "Tap the team you think wins…" with Got it | P | Play | behind-a-tap | Show on first visit only |
| 46 | Game pick card header | CommunityHome.jsx | Away @ Home, kickoff | P | Play | default-visible | |
| 47 | Team records line | TeamFacts.jsx | "TB 1-4 · Road 1-1" | P | Lines & Trends | behind-a-tap | Game detail. See DP-16 |
| 48 | Line at your guess | LineAtGuess.jsx | Line, time, age, points/10, source, saved time | P | Play | default-visible | One short line; source and times behind a tap |
| 49 | Chip picker | ChipPicker.jsx | Favorite or Pick'em, chips 1–10, More 10.5–20, −/+, typed entry; total chips | P | Play | default-visible | Core input; keep |
| 50 | Revealed picks (after sit-out) | CommunityHome.jsx (RevealedPicks) | Other members' picks as read-only chips | P | Play | behind-a-tap | |
| 51 | Per-game Trends button | GameTrends.jsx | Opens the trends panel | P | Lines & Trends | behind-a-tap | |
| 52 | Sticky save bar | CommunityHome.jsx | x/15 ready, due, Save draft, Submit, hints, errors with Retry / Load latest / Sign in again | P | Play | default-visible | |
| 53 | Sit out this week | SitOutWeek.jsx | Text link and final confirm dialog (D-23) | P | Play | behind-a-tap | |

## E. Community History tab (`CommunityHistory.jsx`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 54 | Player picker | CommunityHistory.jsx | One button per member, You first, Removed flag | P | History | default-visible | |
| 55 | Season select and Refresh | CommunityHistory.jsx | | P | History | default-visible | |
| 56 | Week panel header | CommunityHistory.jsx | Week N · season, due, Open/Closed, game count | P | History | default-visible | |
| 57 | Ballot status and scoring basis | CommunityHistory.jsx (MarketHistory) | Submitted/changed time, revisions, origin, eligibility, a long scoring-basis sentence | P | History | behind-a-tap | Keep one status line visible |
| 58 | Week points | CommunityHistory.jsx | "95.8 / 150 pts · 15 of 15 scored" | P | History | default-visible | |
| 59 | Per-game history rows | CommunityHistory.jsx (HistoryLine, Result, Points) | Guess, line at guess (+ source, observed, gap, flags), final score, points | P | History | default-visible | Line provenance behind a tap |
| 60 | Hidden-until-you-submit note | CommunityHistory.jsx | "Hidden until you submit…" | P | History | default-visible | |
| 61 | Scoring footnote | CommunityHistory.jsx | Long footnote on how lines are chosen | P | History | cut | Link to How to play instead |

## F. Group game shell (`App.jsx`, `styles.css`, `entryExperience.css`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 62 | Sidebar league block | App.jsx | Brand, league chip, Current game select, My games, Invite players | P | League | behind-a-tap | League switcher |
| 63 | Sidebar navigation | App.jsx (`navigation`) | 9 entries: Dashboard, My picks, Virtual Units, Bet Tracker, Unit Betting, Compare picks, Leaderboard, Edge board, History & audit | P | Home | cut | Replaced by the D-35 tab bar. See DP-20 |
| 64 | Season card "Three games. One rivalry." | App.jsx | Slogan and How to play | P | Settings/Profile | behind-a-tap | Copy is out of date (two games now) |
| 65 | Design lab entry | App.jsx | Commissioner-only, Draft badge | C | Commissioner tools | commissioner-only | |
| 66 | Settings & setup entry | App.jsx | | P | Settings/Profile | settings | |
| 67 | "PRIVATE LEAGUE · v0.1" note | App.jsx | Status dot and version | P | Settings/Profile | cut | Stale |
| 68 | Topbar breadcrumb, season label, help icon | App.jsx | "Your league › name", "2026 SEASON", ? | P | League | cut | |
| 69 | Signed-in chip and Sign out | App.jsx | Initials, name, Sign out | P | Settings/Profile | settings | |
| 70 | Local player view switch | App.jsx | Sean / Troy / Luke preview; not a sign-in | Dev | Commissioner tools | cut | Local owner build only |
| 71 | Page heading | App.jsx | "NFL · WEEK 06 / 2026", slogan titles ("The weekly huddle." etc.), subtitles | P | Home | cut | Each tab gets a short plain title |
| 72 | Heading actions | App.jsx | Compare picks / Make your picks / Export my data | P | Home | default-visible | Keep only one big next action |
| 73 | Practice banners | App.jsx | Practice game / practice-origin ballot or selections | P | Play | default-visible | Shrink to a small badge |
| 74 | Commissioner eligibility ruling | App.jsx (EligibilityRuling) | "Week 5 counts · Commissioner ruling" | P | History | behind-a-tap | |
| 75 | Challenge results unavailable callout | App.jsx | "Reviewed results are temporarily unavailable…" | P | Retire to History | retired-but-records-in-History | |
| 76 | Spread benchmark summary | App.jsx (BenchmarkSummary) | Provisional/Frozen benchmark, score, details | P | History | behind-a-tap | Legacy Week 5 policy |
| 77 | Provisional analysis summary | App.jsx (ProvisionalAnalysisSummary) | Provisional comparison score | P | History | behind-a-tap | Legacy |
| 78 | Footer | App.jsx | Tagline, refresh label, "All times Pacific", Rules & scoring | P | Settings/Profile | settings | |
| 79 | Rules modal "Three ways to play" | App.jsx (Modal) | Rules per mode and reveal rules | P | Settings/Profile | behind-a-tap | Rewrite as How to play, two games. See DP-22 |
| 80 | App-wide states | App.jsx, DeferredScreen.jsx | Toast, error banner with Reload, loading, "Your league access is pending", "This screen couldn't load" | P | Home | default-visible | Only when needed |

## G. Group dashboard (`App.jsx` Overview, `VisualDashboard.jsx` and children)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 81 | Dashboard market tabs | App.jsx (Overview) | Spread / Total | P | Home | cut | Home shows both ballot states at once |
| 82 | Dashboard notices | VisualDashboard.jsx | "New saved market data", data issue | P | Lines & Trends | cut | Keep only a small "updated x ago" on the lines board |
| 83 | Accuracy matchup scoreboard | VisualDashboard.jsx | Status badge, source line, bars "95.8 / 150" per player, drilldown with closest W–L–T, exact, total error | P | League | default-visible | On League; Home shows only your rank. See DP-9 |
| 84 | "Your ballot comes first" lock | VisualDashboard.jsx | Locked state with Open ballot | P | Play | default-visible | |
| 85 | Source & scoring details | VisualDashboard.jsx | Policy or provenance text | P | Play | behind-a-tap | |
| 86 | Next action and mode tiles | VisualDashboard.jsx | "Next: Total ballot due…" and Spread / Total / Challenge tiles | P | Home | default-visible | Becomes the one big next action |
| 87 | Insights: Player points tab | DashboardInsights.jsx | Per-player bars, scored games, averages | P | League | behind-a-tap | Duplicate of row 83 |
| 88 | Insights: Accuracy mix donut | DashboardInsights.jsx | Exact / within 1 / farther / unscored counts | P | History | behind-a-tap | Good as a weekly recap card |
| 89 | Insights: Line movement tab | DashboardInsights.jsx | Embeds the line chart | P | Lines & Trends | behind-a-tap | |
| 90 | Saved references by game | DashboardInsights.jsx | Guess, saved reference, difference, times | P | Play | behind-a-tap | |
| 91 | How to read this | ChartGuide.jsx | Spread/total meaning, saved vs current, scoring example | P | Settings/Profile | behind-a-tap | Fold into How to play |
| 92 | Compare accuracy in detail | PlayerComparison.jsx | Error bins per player, mean/median, game-by-game difference vs another player | P | League | behind-a-tap | Head-to-head view |
| 93 | Compare across recorded snapshots | PlayerComparisonHistory.jsx | Retrospective line chart and table | P | History | behind-a-tap | Legacy (not shown under submission-time scoring) |
| 94 | Gap bars panel | VisualDashboard.jsx | Per game, per player error bars; drilldown with references, consensus, your points, trends | P | Play | behind-a-tap | "How close was I" after reveal. See DP-10 |
| 95 | Show all N games | VisualDashboard.jsx | Expands the gap list | P | Play | behind-a-tap | |
| 96 | Market line movement chart | App.jsx (LineMovement) | Matchup select, line chart, source values table | P | Lines & Trends | behind-a-tap | Game detail; also on History & audit |
| 97 | Refresh status | VisualDashboard.jsx, marketStatus.js | "12-hour refresh enabled", next update, warnings | P | Lines & Trends | behind-a-tap | |
| 98 | Game trends section | VisualDashboard.jsx | Trends for every game on the dashboard | P | Lines & Trends | default-visible | Trends tab cards; full panel behind a tap |
| 99 | Your betting week card | SocialDashboardCard.jsx | Record, known risk, pending, settled ROI, coverage, last 3 bets | P | Bets | default-visible | Home shows units only |
| 100 | Data connections panel | DataConnections.jsx | Refresh status, latest source, trends and wind source credits | P | Settings/Profile | settings | "Data sources" page. See DP-24 |
| 101 | Your forecast vs the recorded market | DecisionAnalysis.jsx | Saved guess, market reference, difference, personal and model forecast | P | Lines & Trends | cut | **Unclear.** Personal forecast is not in D-35 |
| 102 | Unavailable analysis sources | DataConnections.jsx | Five "Unavailable / Not connected" cards | P | Settings/Profile | cut | Shows things that do not exist |
| 103 | Research links | DataConnections.jsx | Action Network picks and injuries, NFL team stats | P | Lines & Trends | behind-a-tap | |
| 104 | Customize dashboard | DashboardPreferences.jsx | Layout (Command center / Matchup cards / Analytics lab), sections, motion, notices, reset | P | Settings/Profile | cut | **Unclear.** D-35 fixes the Home layout; keep only Reduce motion in Settings |
| 105 | Choose dashboard games | DashboardMatchupFilter.jsx | Show all or selected games | P | Lines & Trends | cut | Replace with a filter on the lines board if needed |

## H. Group My picks and Betting Challenge (`PredictionEntry.jsx`, `App.jsx`, `ChallengeQuoteReview.jsx`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 106 | Ballot header | PredictionEntry.jsx | Badge, "Where would you set the line?", helper, x/15 | P | Play | default-visible | Second copy of the same ballot; merge with rows 37–53 |
| 107 | Open analysis / Compare picks buttons | PredictionEntry.jsx | Shown after submit | P | Play | behind-a-tap | |
| 108 | Weekly ballot note | PredictionEntry.jsx | "One weekly ballot across all groups" | P | Play | cut | Always true under D-35 |
| 109 | Deadline callout | PredictionEntry.jsx | Status and deadline text | P | Play | default-visible | One line |
| 110 | Save-check and recovery panels | PredictionEntry.jsx | Save not confirmed, check saved ballot, read-only expired copy, restore tab draft | P | Play | default-visible | Only when needed |
| 111 | Search, filter, trends toggle | PredictionEntry.jsx | Find a team, All / Missing, Show trends | P | Play | behind-a-tap | "Missing" filter is useful; trends toggle cut |
| 112 | Picks table | PredictionEntry.jsx | Matchup, kickoff, records, others' picks, current consensus, chips, Next game, conflict fix, reference, points, status | P | Play | default-visible | Simplify to the D-35 game card; reference and points behind a tap |
| 113 | Save state and save bar | PredictionEntry.jsx | x/15 ready, saved revisions, Save draft, Review & submit | P | Play | default-visible | |
| 114 | Review & submit dialog | PredictionEntry.jsx | Every pick, scoring and editing details | P | Play | default-visible | On submit |
| 115 | Mode tabs | App.jsx (ModeTabs) | Guess the Spread / Guess the Total / Betting Challenge | P | Play | default-visible | Spread and Total only |
| 116 | Betting Challenge screen | App.jsx (Betting) | Record W–L–P, selections x/15, quote source, weekly card, recorded selections | P | Retire to History | retired-but-records-in-History | D-35 |
| 117 | Record Challenge selection dialog | ChallengeQuoteReview.jsx | Collected or manual quote, immutable confirm, save check | P | Retire to History | retired-but-records-in-History | D-35 |

## I. Compare picks, Leaderboard, Edge board, History & audit (`App.jsx`, `SubmissionComparison.jsx`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 118 | Compare picks intro and Refresh | App.jsx (ComparePicks) | Title, explainer, Refresh picks | P | Play | behind-a-tap | "Everyone's picks" after reveal |
| 119 | Player submission tiles | App.jsx, SubmissionComparison.jsx | Submitted · Locked / Not submitted, points | P | League | default-visible | "Who has picked" strip |
| 120 | Side-by-side guesses table | App.jsx | Each player's guess per game, benchmark, your score | P | Play | behind-a-tap | |
| 121 | Submission comparison | SubmissionComparison.jsx | Guess and saved line per player, current consensus, forecast panel, scoring note, player comparison | P | Play | behind-a-tap | Same job as row 120 |
| 122 | "Analysis" and "Line movement" link cards | App.jsx | Two cards pointing to other pages | P | Play | cut | |
| 123 | Leaderboard stat tiles | App.jsx (Leaderboard, Stat) | "150", "Triple Threat", "At submission" | P | League | cut | Not stats. See DP-11 |
| 124 | Week standings table | App.jsx (Leaderboard) | Player, ballot, accuracy pts or W–L–P, closest W–L–T or win rate, exact, total error, note | P | League | default-visible | One of the two League tabs |
| 125 | Edge board | App.jsx (Edges) | Callouts, sort, saved guess, current consensus with provenance, absolute gap | P | Play | behind-a-tap | **Unclear** (Play or Lines & Trends). See DP-12 |
| 126 | Archived score movement chart | App.jsx (ScoreChart) | Legacy scoring method over snapshots | P | History | behind-a-tap | Legacy. See DP-17 |
| 127 | Source timeline | App.jsx (HistoryPage) | Legacy reference list with points, Unofficial | P | History | behind-a-tap | Legacy |
| 128 | Your revision audit | App.jsx (HistoryPage) | Event list with raw JSON before/after | P | History | behind-a-tap | See DP-15 |
| 129 | Archived invalid-matchup note | App.jsx | "N historical predictions … archived" | P | History | cut | |
| 130 | Export my data | App.jsx (download) | Downloads ballots and audit as JSON | P | Settings/Profile | settings | |

## J. Settings and commissioner controls (`App.jsx` SettingsPage and controls)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 131 | Appearance (Dark / Light / System) | Theme.jsx | Saved per device | P | Settings/Profile | settings | Today it also sits on sign-in, My games, Bet Tracker, Solo, Community foot |
| 132 | Install app | InstallApp.jsx | Install button and steps | P | Settings/Profile | settings | |
| 133 | Pick reminders | PushReminders.jsx | Push on/off for this device | P | Settings/Profile | settings | |
| 134 | Final-result review | ResultReviewControls.jsx | Record or correct a final score | C | Commissioner tools | commissioner-only | Needed for bet and challenge settlement |
| 135 | Scoring benchmark freeze | BenchmarkControls.jsx | Freeze Week 5 Spread benchmark | C | Commissioner tools | commissioner-only | Legacy; text hard-coded. See DP-4 |
| 136 | Manual market connection | ManualOddsControls.jsx | Check connection, fetch lines, quota limits | C | Commissioner tools | commissioner-only | |
| 137 | League rules panel | App.jsx (SettingsPage) | League, commissioner, roster, scoring formula, edits, deadline, challenge limit, formats | P | Settings/Profile | settings | Fold into How to play and League info |
| 138 | Account & access checklist | App.jsx (SettingsPage) | GitHub, Cloudflare, Supabase, market data, models, notifications | C | Commissioner tools | commissioner-only | Developer status shown to players today. See DP-24 |
| 139 | Storage explainer callout | App.jsx (SettingsPage) | Where picks are stored, tab recovery | P | Settings/Profile | cut | |
| 140 | Schedule source | App.jsx (SettingsPage) | NFL schedule link | P | Settings/Profile | settings | In Data sources |

## K. Virtual Units (`VirtualUnits.jsx`, `styles.css`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 141 | Virtual Units header and Refresh lines | VirtualUnits.jsx | "PICKS · PLAY MONEY", "Every unit represents $100 virtual risk" | P | Bets | default-visible | Drop the dollar framing |
| 142 | Settle finals | VirtualUnits.jsx | Grades the week from finals | C | Commissioner tools | commissioner-only | |
| 143 | Saved book lines note | VirtualUnits.jsx | How lines are chosen and settled | P | Bets | behind-a-tap | |
| 144 | Stats row | VirtualUnits.jsx | Record, Net units, ROI, Qualification | P | Bets | default-visible | Home shows units; League shows rank |
| 145 | Settlement status line | VirtualUnits.jsx | Pending count, settled as of | P | Bets | default-visible | |
| 146 | Game card | VirtualUnits.jsx (GameCard) | Away at Home, kickoff, final, badge | P | Bets | default-visible | FanDuel-style market row |
| 147 | Side buttons | VirtualUnits.jsx (Market) | Team or Over/Under, line, odds, book, observed time, age | P | Bets | default-visible | See DP-5 |
| 148 | Consensus line | VirtualUnits.jsx | Consensus value, books, time | P | Lines & Trends | behind-a-tap | See DP-5 |
| 149 | Stake buttons and Place pick | VirtualUnits.jsx | −0.5, 0.5–3U, +0.5, Place virtual pick / Save edit | P | Bets | default-visible | Becomes the bet slip |
| 150 | Saved pick and result | VirtualUnits.jsx (settledLabel) | Saved side, line, odds, units; W/L/P/V, net units, final | P | Bets | default-visible | "My bets" |

## L. Bet Tracker and Unit Betting (`SocialBetTracker.jsx`, `socialBetTracker.css`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 151 | Bet Tracker header and Add bet | SocialBetTracker.jsx | "THE SHARED BETTING BOARD", Bet Tracker or Unit Betting title | P | Bets | behind-a-tap | **Unclear.** Records real-money slips placed elsewhere; D-35 bets are Virtual Units only |
| 152 | View tabs | SocialBetTracker.jsx | All bets / My week / Compare / History | P | Bets | cut | Folds into Bets and League |
| 153 | Week select and Refresh | SocialBetTracker.jsx | Week or "All available history" | P | Bets | behind-a-tap | See DP-3 |
| 154 | Filters panel | SocialBetTracker.jsx | Type, market, outcome, origin, team, player, following, record settings | P | Bets | cut | Too much for a friends' game |
| 155 | Metrics row | SocialBetTracker.jsx (Metrics) | W–L–P, Net units, ROI, Win rate | P | Bets | default-visible | Duplicate of row 144. See DP-21 |
| 156 | Performance charts | SocialBetTracker.jsx (NetChart, Selections) | Cumulative net units line; selection and record bars | P | Bets | behind-a-tap | |
| 157 | Bet card | SocialBetTracker.jsx (BetCard) | Owner, kind, status, legs, tailed from, risk/odds/profit, return, notes, late flag, book and times, counts toggle | P | Bets | default-visible | **Unclear** (real-money slips, parlays excluded by D-35) |
| 158 | Bet details & history | SocialBetTracker.jsx | Revision, Bet ID, settlement source, audit, correct / report result / include | P | Bets | behind-a-tap | See DP-15 |
| 159 | Follow / Following | SocialBetTracker.jsx | Follow a player's bets | P | League | behind-a-tap | **Unclear.** D-35 social is the league feed |
| 160 | Tail a bet | SocialBetTracker.jsx | Copy another player's bet with your own terms | P | Bets | behind-a-tap | **Unclear.** Overlaps the D-35 friend challenge |
| 161 | Compare players table | SocialBetTracker.jsx (Leaderboard) | Record, net units, ROI, settled risk, ROI sample, weekly status, follow; sort | P | League | default-visible | Becomes the Bets leaderboard tab (D-18 order: ROI, net, wins) |
| 162 | Add or correct bet editor | SocialBetTracker.jsx (BetEditor) | Single/parlay, legs, odds, stake, book, times, notes | P | Bets | behind-a-tap | **Unclear** (same as row 151) |
| 163 | Report result editor | SocialBetTracker.jsx (ResultEditor) | Win/loss/push/void and returned units | P | Bets | behind-a-tap | |

## M. Solo (`PersonalWorkspace.jsx`, `personalWorkspace.css`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 164 | Solo header, week select, refresh, tabs | PersonalWorkspace.jsx | Favorites / Guesses / Journal | P | Bets | cut | Solo is split up |
| 165 | Solo Guesses | PersonalWorkspace.jsx (GuessForm) | Typed number inputs per game, line at guess, recovery, review | P | Play | cut | Third copy of the same ballot; still uses typed signed numbers |
| 166 | Favorites and private notes | PersonalWorkspace.jsx (FavoriteCard) | Save a game, write a private note | P | Lines & Trends | behind-a-tap | **Unclear.** Could become "star a game" |
| 167 | Personal outcome forecast | PersonalWorkspace.jsx (FavoriteCard) | Your own spread/total forecast with revisions | P | Lines & Trends | cut | **Unclear.** Not in D-35 |
| 168 | Journal add / correct form | PersonalWorkspace.jsx (JournalForm) | Private record of a bet placed elsewhere | P | Bets | behind-a-tap | Becomes "My bets" (D-35) |
| 169 | Journal performance | PersonalWorkspace.jsx | Records, win rate, outcomes, net and ROI per currency, pending stake | P | Bets | behind-a-tap | Currency amounts vs units; see DP-21 |
| 170 | Journal records list | PersonalWorkspace.jsx | Game id, market, side, line, outcome, odds, stake/return, times, notes, original context; archive/restore | P | Bets | behind-a-tap | See DP-15 |
| 171 | Journal record history | PersonalWorkspace.jsx | Every change to a record | P | Bets | behind-a-tap | |
| 172 | Solo footer | PersonalWorkspace.jsx | "Only you can read this workspace", Sign out | P | Settings/Profile | cut | |

## N. Trends (`GameTrends.jsx`, `TrendsPanel.jsx`, `TrendsView.jsx`, `TrendCard.jsx`, `WindForecast.jsx`, `trends.css`)

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 173 | Trends intro notes | TrendsView.jsx | "Reference only", evidence note | P | Lines & Trends | behind-a-tap | |
| 174 | Strongest historical evidence | TrendsView.jsx | Tier 1 card (strong wind → Under) | P | Lines & Trends | default-visible | The one standout trend chip on the game card |
| 175 | Kickoff wind forecast | WindForecast.jsx | Venue, wind and direction, gusts, temp, rain chance, ET hour, age, band sentence, honesty note, model, credit | P | Lines & Trends | behind-a-tap | Game detail. See DP-7 |
| 176 | Consistent, not proven | TrendsView.jsx | Tier 2 cards | P | Lines & Trends | behind-a-tap | |
| 177 | Updates after the final | TrendsView.jsx | Records waiting on an earlier final | P | Lines & Trends | cut | |
| 178 | Watch list | TrendsView.jsx | Watch-list cards | P | Lines & Trends | behind-a-tap | |
| 179 | Referee section | TrendsView.jsx | Assigned referee, look-up select, career O/U, modifiers | P | Lines & Trends | behind-a-tap | |
| 180 | Context families | TrendsView.jsx | Home/away, division, primetime, rest… "no proven edge" | P | Lines & Trends | behind-a-tap | |
| 181 | Teams, coaches, QBs, head to head | TrendsView.jsx | Entity tables and last meetings | P | Lines & Trends | behind-a-tap | |
| 182 | Line-dependent records | TrendsView.jsx (GatedSection) | Locked until your ballot; band tables marked "This game" | P | Lines & Trends | behind-a-tap | |
| 183 | Trend card | TrendCard.jsx | Title, chips, record, win rate + 95% range, ROI, units, streak, last 10, games, years, sparkline, filters, selection record, q, permutation p, prospective record, score breakdown | P | Lines & Trends | behind-a-tap | Card face needs 3 numbers, not 15. See DP-18 |
| 184 | Trends source footer | TrendsView.jsx | nflverse credit, licence, as-of, wind credit | P | Lines & Trends | default-visible | Required attribution; keep small |

## O. Shared pieces and internal tools

| # | Item | Source | Shows / does | Who | D-35 home | Treatment | Note |
|---|---|---|---|---|---|---|---|
| 185 | Team marks and matchup | TeamIdentity.jsx, teamLogoRegistry.js | Logo or original badge, Away/Home labels | P | Lines & Trends | default-visible | Used on every game card |
| 186 | Saved line vs current consensus box | ScoringReference.jsx (ReferenceValue, CurrentConsensus) | Value, label, age, source, saved/observed/collected times | P | Play | behind-a-tap | |
| 187 | Sportsbook sources | SportsbookSources.jsx | Saved vs latest consensus, per-book quotes table, method, Action Network "Not connected" | P | Lines & Trends | behind-a-tap | Game detail "book lines" |
| 188 | Scoring policy note | ScoringReference.jsx (ScoringPolicyNote) | Long paragraph on the line at your guess | P | Settings/Profile | behind-a-tap | How to play |
| 189 | Source note | App.jsx (SourceNote) | Provenance paragraph, 4 variants | P | Lines & Trends | behind-a-tap | Repeated on 4 screens today |
| 190 | Brand mark | Brand.jsx | Field monogram | P | Home | default-visible | Keep (D-35) |
| 191 | Design lab | BrandLab.jsx | 7 categories × 5 options, saved per browser | C | Commissioner tools | commissioner-only | Cut candidate once the D-35 brand refresh lands |

---

## Counts

- **191 items** in total: 179 player, 11 commissioner, 1 local-owner preview.
- By D-35 home:

| Home | Play | Bets | Lines & Trends | League | History | Settings/Profile | Commissioner tools | Retire to History |
|---|---|---|---|---|---|---|---|---|
| 14 | 38 | 26 | 29 | 24 | 17 | 29 | 11 | 3 |

- By treatment:

| default-visible | behind-a-tap | settings | commissioner-only | retired-but-records-in-History | cut |
|---|---|---|---|---|---|
| 63 | 68 | 15 | 11 | 3 | 31 |

- Only 63 of 191 items (one in three) stay on screen by default, and only 8 of those are on Home. 31 should leave the screens.
- **12 items have no clear home** (marked Unclear): rows 20, 21, 101, 104, 125, 151, 157, 159, 160, 162, 166, 167. They group into five rulings:
  1. **Bet Tracker** (rows 151, 157, 159, 160, 162): shared real-money slips, parlays, tailing and following. D-35 makes Bets Virtual Units only and names the private journal as "My bets", but says nothing about the shared Bet Tracker.
  2. **Sports switcher and Coming soon / Notify me** (rows 20, 21): D-35's switcher is for leagues, not sports.
  3. **Solo Favorites, notes and personal forecasts** (rows 101, 166, 167).
  4. **Customize dashboard** (row 104): D-35 fixes the Home layout.
  5. **Edge board** (row 125): "your guess vs the current line" fits Play or Lines & Trends.
- One model gap, not a screen: Virtual Units are stored per group (`VirtualUnits.jsx` loads by `leagueId`), but D-35 says bets made once count in every league.

## D-35 features with no screen yet

Friend one-game challenge and head-to-head record (DASH-5); FanDuel-style market row and bet slip in Bets (DASH-4, today's Virtual Units cards are the closest); lines board (DASH-6); deadline countdown, rank and units on Home (DASH-1); streaks, badges, weekly awards (DASH-3); emoji reactions and automatic posts for bet and challenge results, badges and awards (DASH-10); two-tab League screen (DASH-1/10). Also unbuilt rules the screens must carry: the Late marker (D-30) and the per-game kickoff reveal (D-31). Best Bets (D-29) was never built, so there is nothing to retire.

---

## Data-display problems

Severity: 1 = wrong number or misleading, 2 = confusing or unreadable, 3 = polish. "Status" says whether the audits' item is still in today's code.

| # | Sev | Problem | Where | Evidence |
|---|---|---|---|---|
| DP-1 | 1 | **Community leaderboard shows 0 for a player who has not submitted this week**, though its footnote says "— means no submitted ballot". | CommunityHome.jsx (Leaderboard `cell`), cloud/community.mjs:43, migration 20261013010000 ~L399 | SQL makes a standings row for anyone with any submitted ballot this season and sets `week_points` with `coalesce(sum(...) filter (where b.week=w),0)`; the handler adds `Number(x.weekPoints) \|\| 0`; the UI shows "—" only when there is no row. `weekScored` is sent but never shown, so "not submitted" and "unscored" both read as 0. |
| DP-2 | 1 | **Leaderboard order uses a hidden Spread + Total sum.** No rank and no column shows the number it is sorted by. The group leaderboard says the opposite rule. | CommunityHome.jsx (Leaderboard), App.jsx:146 | `season: (spread?.seasonPoints \|\| 0) + (total?.seasonPoints \|\| 0)` then `sort`. App.jsx table note: "Spread and total points are never combined." D-35 wants one leaderboard per game. |
| DP-3 | 1 | **Bet Tracker opened from My games always shows 2026 Week 5.** Week 6 opened October 12. | GameHub.jsx, SocialBetTracker.jsx:143 | `SocialBetTracker({ …, season = 2026, week = 5 })`; GameHub renders it without `season` or `week`. Only the in-game entry passes the league week. |
| DP-4 | 1 | Commissioner freeze panel hard-codes the week and format. | BenchmarkControls.jsx:14, :51 | "freezes the approved Week 5 Spread benchmark for this Duel"; "Week 5 Spread · This Duel only". |
| DP-5 | 1 | **Virtual Units lines read wrong.** Totals get a plus sign ("Over +44.5"); the saved pick shows raw words ("Saved over +44.5", "Saved home −3.5"); consensus shows a sign with no team ("Consensus: -3.5", hyphen-minus); quote times have no zone; kickoff date printed twice. | VirtualUnits.jsx (`line`, Market `saved`, `.virtual-consensus`, GameCard), cloud/virtual-units.mjs:79 | `${offer.line > 0 ? '+' : ''}${offer.line}` for every market; `pick.selection.side` printed raw; `${reference.value > 0 ? '+' : ''}${reference.value}`; `date(current.observedAt)` without "PT"; `{date(game.kickoff)} PT · {game.pacificDate}` where `pacificDate` is "Oct 15". |
| DP-6 | 2 | **One spread, four notations.** Group screens: bare home-referenced number ("−3.5" = home favored, explained in a header). Community: favorite name ("Cowboys −9.5"). Virtual Units: side team ("Dallas Cowboys -3.5 (−110)"). Book table: "DAL −3 · TB +3". Even game is "PK", "Pick'em", "Even (pick'em)" or "Even". | api.js:38 `signed`, communityFormat.js `pickText`, VirtualUnits.jsx `line`, SportsbookSources.jsx `Line`, TrendsView.jsx `appSpread` | Brand guide: "display both team and sign" consistently. |
| DP-7 | 2 | **Mixed time zones.** Footer says "All times Pacific", but the wind panel uses Eastern; the book table adds seconds and "PDT"; Virtual Units shows no zone. | App.jsx:105, WindForecast.jsx, SportsbookSources.jsx `formatter`, VirtualUnits.jsx | "Forecast for the {etHour} ET hour (kickoff {etTime} ET)"; `timeZoneName: 'short'`, `second: '2-digit'`. |
| DP-8 | 2 | "Observed Not available PT" can appear. `date()` returns "Not available" for a missing time, and some cells add " PT" without a guard. | api.js:39; App.jsx:162 (Edge board); DecisionAnalysis.jsx | `Observed {date(reference(g).observedAt)} PT<br/>Collected {date(…)} PT` with no null check. (Code reading; not seen on screen.) |
| DP-9 | 2 | "— / 150" rows above empty bars for players who have not submitted. Status: **still present** (visual audit rank 5 / D2, part not fixed). | VisualDashboard.jsx:94, DashboardInsights.jsx (Points) | `{fmt(value)}<small> / {data.maxPoints}</small>` with `value` null. |
| DP-10 | 2 | Gap rows print "Reference unavailable" / "Not submitted" per player per game when some gaps exist. Status: **partly fixed** (the all-empty case now has one message). | VisualDashboard.jsx:107 | `gap-missing` spans per player inside every row. |
| DP-11 | 2 | Group leaderboard opens with three tiles that are not stats ("150", "Triple Threat", "At submission"), pushing the table below the fold; the table scrolls sideways on phones and cuts the accuracy column. Status: **still present** (visual audit rank 12). | App.jsx:146 (`Stat` tiles, `.table-scroll`) | Audit: tiles take about 380px at 390 wide. |
| DP-12 | 2 | Edge board consensus cell: one number under three lines of provenance per row. Status: **still present** (rank 13 / D9; type size since raised). | App.jsx:162 | `source · N books<br/>Observed … PT<br/>Collected … PT · Unverified`. |
| DP-13 | 2 | **Same data shown many times.** Weekly score in six places (accuracy bars, Player points tab, Compare accuracy in detail, Leaderboard, Compare picks tiles, Community leaderboard). Line movement on Dashboard and History. Data connections on Dashboard and Edge board. Source notes on four screens. One weekly ballot entered on three screens (Community Picks, group My picks, Solo Guesses). Appearance control on six screens. | VisualDashboard.jsx, DashboardInsights.jsx, PlayerComparison.jsx, App.jsx, CommunityHome.jsx, PersonalWorkspace.jsx, Theme.jsx | Component map in sections C–M. |
| DP-14 | 3 | Rounding and unit labels differ by screen: 1, 2 or 3 decimals; "1.5u" vs "+1.5U". | api.js:37 `fmt` (1 dp), DashboardInsights.jsx `fmt` (2 dp), SocialBetTracker.jsx `units` (3 dp, "u"), VirtualUnits.jsx `units` ("U") | The same kind of number can read differently between tabs. |
| DP-15 | 2 | **Raw IDs and code shown to players.** "Your spread guess for TB-DAL", "Private note for TB-DAL", journal title "TB-DAL · spread · home −3.5"; Bet Tracker audit lists field names ("stakeUnits", "countsForRecord") and the full Bet ID; History & audit prints raw JSON. | PersonalWorkspace.jsx (GuessForm, FavoriteCard, journal), SocialBetTracker.jsx (BetCard audit), App.jsx:189 | `<pre>{JSON.stringify({before:a.before,after:a.after},null,2)}</pre>`; `<dt>{key}</dt>`. |
| DP-16 | 3 | Team records read as code ("TB 1-4 · Road 1-1"); screen readers hear codes. Status: **open** (persona #37, #11 remainder). | TeamFacts.jsx | `matchupFacts` output in a mono line. |
| DP-17 | 3 | Archived score chart labels the x-axis with times only, no dates, and sits beside current data although it is a retired scoring method. | App.jsx:125 (ScoreChart), :189 | `date(h.quotedAt,{month:undefined,day:undefined})`. |
| DP-18 | 2 | **Trend cards carry about 15 numbers each** (record, win rate and 95% range, ROI, units, streak, last 10, games, years, sparkline, selection record, q value, permutation p, prospective record, 7-part score); one game's panel stacks up to nine sections. | TrendCard.jsx, TrendsView.jsx | Owner: "too much information". |
| DP-19 | 2 | Sports switcher wraps to three rows on phones; five of six chips lead to "Coming soon". Status: **still present** (rank 11 / D14). | CommunityHome.jsx (LeagueSwitcher), community.css | |
| DP-20 | 2 | Nine sidebar entries with reused icons (`TrendingUp` for Virtual Units and Unit Betting; `Users` for Bet Tracker and Compare picks). Status: **still present** (rank 6 / D8); Design lab is now commissioner-only. | App.jsx:32 | |
| DP-21 | 1 | **Five bet records with overlapping stats** (W–L–P, net, ROI): Virtual Units (per group, units), Bet Tracker metrics (shared, units), "Your betting week" card, Solo journal (per currency), Betting Challenge (W–L–P). Bet Tracker is also called "Unit Betting". | VirtualUnits.jsx, SocialBetTracker.jsx, SocialDashboardCard.jsx, PersonalWorkspace.jsx, App.jsx (Betting) | A player cannot tell which record is "theirs". |
| DP-22 | 2 | **Out-of-date rules text.** "Three ways to play" and "Three games. One rivalry." (D-35: two games); "Missed deadlines and extensions need commissioner review" and "Extensions require commissioner review" (D-30: late picks accepted and marked Late, not built yet); "v0.1"; "Every unit represents $100 virtual risk". | App.jsx:92, :109; PredictionEntry.jsx (closed callout); VirtualUnits.jsx header | |
| DP-23 | 3 | The second market is "Total", "Guess the Total" and "Over / Under". Status: **partly fixed** (dashboard tabs fixed). | SportsbookSources.jsx header chip, DataConnections.jsx, ChartGuide.jsx | |
| DP-24 | 2 | Screens list things that do not exist or are for developers: five "Unavailable / Not connected" sources; GitHub / Cloudflare / Supabase status in player Settings. | DataConnections.jsx, App.jsx:196 | |
| DP-25 | 3 | Feed post picks mix codes and names ("TB @ DAL · Cowboys −3"). Status: **partly fixed** (persona #30). | CommunityHome.jsx (PostPicks) | |
| DP-26 | 3 | Line chart labels only the first and last time, and spread values carry no team name. | App.jsx (LineMovement) | |
| DP-27 | 3 | Insights tabs wrap on phones; large Bills and Rams PNGs decode late. Status: **not re-checked** (ranks 8–9 / D5, D10). | DashboardInsights.jsx, web/public/team-logos | From the October 12 audit only. |

Fixed since the audits (not counted above): sidebar Design lab hidden from players, 16px root and the small-type floor, score-first dashboard order, chip states and keyboard model, draft recovery, sit-out reveal, receipt after submit.
