# Premier League in Guess The Line: Sleeper league, Pick a Team, and moneyline guessing

Owner: Sean Balsiger · Drafted October 28, 2026 from the brainstorming session with Sean.
Status: design for approval. Nothing here is built. Proposed decision number: next free D-number (drafted as D-65; recorded as D-68 because D-65 to D-67 went to the new-app-only, Research nesting and Virtual Units placing decisions).
Mockups: [epl-mockups-v3.html](2026-10-28-epl-mockups-v3.html) (approved direction: everything inside the four tabs).

## 1. Intent

Sean runs a Premier League fantasy league on Sleeper (**FEPL**, league ID `1395122699423993856`, 8 managers). The league plays a side game in a group chat each matchweek: managers draft one real EPL club each in reverse order of last week's score, and whoever's club wins by the widest margin gets bonus points. Sean wants that side game, the Sleeper league itself, and a new EPL moneyline guessing game inside Guess The Line, in the new app's design. The Sleeper stats get the shiny hero cards and glass bubbles, crests and charts.

Success: the 8 FEPL managers run the weekly draft in the app instead of the chat, see their league with projections and insights, and play EPL moneyline guessing on its own leaderboard.

## 2. Goals, non-goals, anti-goals

Goals
- An **EPL** option on the existing sport switch (NFL / NBA / EPL), using the same four tabs: Home, Play, Bets, Research.
- **Research → Fantasy (EPL):** the FEPL league from Sleeper. Matchups, standings (including the Pick a Team bonus), rosters, projections, weekly insights, season high scores, top scorer per team.
- **Play → Pick a Team:** the weekly club draft with automatic order, backup queues and bonus scoring.
- **Play → Guess the Line (EPL):** guess the favorite and its 2-way moneyline price for every match, with its own leaderboard.
- Every club shows its crest.

Non-goals (for now)
- EPL Bets (Virtual Units). Bets shows nothing new for EPL.
- 3-way moneyline (home/draw/away) guessing. It can be a second game later.
- Spreads or totals for EPL.
- Opening EPL games to the wider GTL community. Only the 8 FEPL managers play.
- Writing anything back to Sleeper. The app reads Sleeper only.

Anti-goals (a failure even if it works)
- A manager's draft pick or moneyline guess is visible to others before the rules allow it (see section 6).
- A wrong draft order or a bonus given to the wrong manager. The draft is the league's money game.
- Paid data. Free sources only (standing constraint).
- Copying Sleeper's look. Use GTL's design system (D-38/D-55 tokens, `web/src/next/ui/`).

## 3. What exists today (checked October 28, 2026)

- **Sport switch:** `web/src/next/shell/Frame.jsx` and `web/src/next/nba/NbaApp.jsx` already render a `Segmented` NFL / NBA control. NBA is a separate mini-app (`#nba/...` routes). EPL adds a third option. Unlike NBA it uses the four-tab shell (`shell/state.js` `TABS = home, play, bets, research`).
- **Fantasy:** `web/src/next/fantasy/` holds NFL Fantasy Football under Research. EPL fantasy is a new screen beside it, not a change to it.
- **Odds:** The Odds API (`the-odds-api.com`) is connected on the free plan. NFL uses about 2 credits per collection; 496 of 500 monthly credits remained at last record (docs/ODDS_PROVIDER_EVALUATION.md). Its terms permit display, derived analytics and storage.
- **Team logos precedent:** D-46 uses ESPN CDN logos, self-hosted (never hotlinked), 128 px, with source URL, fetch time and SHA-256 per file in `web/public/team-logos/sources.json`, and a trademark notice. The same rule extends to EPL crests (section 8).

Sleeper data verified live today (free public API, no key):

| Data | Endpoint | Works for FEPL? |
|---|---|---|
| League, scoring settings | `/v1/league/{id}` | Yes. `sport: clubsoccer:epl`, season 2026, 8 rosters, full scoring settings. |
| Managers | `/v1/league/{id}/users` | Yes. 8 display names and user IDs. |
| Rosters, starters, records, season points | `/v1/league/{id}/rosters` | Yes. Current starters, W–L, `fpts`, `fpts_against` (plus `_decimal`). |
| Current matchweek | `/v1/state/clubsoccer:epl` | Yes. Week 9 today. |
| Weekly matchups | `/v1/league/{id}/matchups/{week}` | **No. Returns `null` for this league.** |
| Player stats per matchweek | `api.sleeper.app/stats/clubsoccer:epl/2026/{week}?season_type=regular` | Yes. |
| Player projections per matchweek | `api.sleeper.app/projections/clubsoccer:epl/2026/{week}?season_type=regular` | Yes. Includes `pts_std`. |

ESPN's public endpoints `site.api.espn.com/apis/site/v2/sports/soccer/eng.1/teams` and `/scoreboard` return this season's 20 clubs (including Coventry, Hull, Ipswich), crest URLs, fixtures, kickoff times and results. Reuse rights for ESPN's fixtures/results feed are **not verified**. Section 9 asks the builder to confirm or use another free source.

## 4. Linking managers to GTL accounts

Each Sleeper manager is linked to exactly one GTL account. Most FEPL managers already have one.

Confirmed mapping (Sleeper display name → the name the league uses):

| Sleeper | Name | Sleeper | Name |
|---|---|---|---|
| nemoheye | Nemo | NLGooner | Evan |
| steezyc9 | Cullen | LFCRed | Mark |
| aharrison2 | Adam | sthomas111 | Steven |
| seanbalz | Sean | Freudian | Darin |

- Sean links existing accounts from a commissioner screen *(my call: commissioner-only)*.
- A manager without a GTL account gets an invite link that links them to their Sleeper name on sign-up.
- An unlinked manager still appears in standings (from Sleeper) but cannot draft or guess until linked.

## 5. Research → Fantasy (EPL)

Sub-tabs: **Matchup · Standings · Rosters · Insights** (mockup screen 4).

- **Matchup:** your opponent this matchweek, both projected totals (sum of each starter's Sleeper projection, scored with FEPL's own scoring settings), a win-chance bar, each starter's projected points with a bar, and a projected-vs-actual chart for recent matchweeks.
- **Standings:** W–L and season points **plus Pick a Team bonus** (section 6.5), drawn as bars, with Sleeper's raw total visible on tap.
- **Rosters:** every manager's starters and bench with club crests.
- **Insights:** season high single-week score, your top scorer, top scorer per team, how far each manager beat or missed projection, weekly points line chart (you vs league average).

How weekly numbers are made, since Sleeper gives no matchups for this league:

- **Weekly score:** the difference between a manager's saved season `fpts` (with decimals) after this matchweek and after the last one. The app saves every roster's `fpts` and `fpts_against` once each matchweek is final.
- **Who played whom:** a manager's `fpts_against` change equals exactly one other manager's `fpts` change that week. Pair them that way. If two managers have identical weekly scores, the pairing is ambiguous: show "matchup unavailable" for that pair rather than guess.
- **Per-player weekly points:** player stats × FEPL scoring settings, for the starters saved at that matchweek's first kickoff. Sleeper keeps only current starters, so starters must be saved every matchweek.
- **History before tracking starts:** season totals and records only. No per-week or per-player detail for MW1–MW8.
- **Tracking already started (Sean, October 28):** snapshots saved outside the repo in `/Users/seanbalsiger/gtl-epl-snapshots/` (`snapshot.py`, one JSON per capture with a SHA-256 per Sleeper response): after MW8 (Oct 28, 17:32 UTC), before MW9 first kickoff (scheduled Sat Oct 31, 5:25 AM PT) and after MW9 (scheduled Tue Nov 3, 9:00 AM PT). The build imports these so MW9 scores and the MW10 order are automatic. A copy of the first is uncommitted at `data/epl/sleeper-snapshots/`; the repo is public, so committing it waits for Sean.
- *(My call)* "Final" means the Monday after the matchweek's last match, checked again Tuesday so Sleeper stat corrections land. The saved snapshot and its time are shown.

## 6. Play → Pick a Team (the weekly club draft)

### 6.1 Order
- Pick order is lowest to highest **last matchweek score plus that matchweek's Pick a Team bonus**.
- *(My call)* A tie in that number: the lower season total picks first.
- **MW9 (this weekend) is seeded by hand** from the order Sean gave. MW8 scores can't be rebuilt: Nemo, Cullen, Adam, Sean, Evan, Mark, Steven, Darin. Picks already made in the chat are imported as made: Nemo Man City, Cullen Aston Villa, Adam Liverpool, Sean Tottenham, Evan Arsenal, Mark Brentford, Steven Newcastle (changed from Crystal Palace), Darin to pick. From MW10, order is automatic.

### 6.2 Picking
- Each manager picks one club per matchweek, on their own turn. A club can be taken only once.
- Any club with a match that matchweek can be picked. *(My call)* With 8 managers and 10 matches, 12 clubs are always left over.
- A pick can be changed until the next manager picks. Then it is final. The last manager's pick is final at the deadline.
- Everyone sees the draft board as it happens: who picked what, who's on the clock.
- The app notifies the next manager when it's their turn *(my call: the existing push channel, if they've opted in)*.

### 6.3 Deadline, queues and auto-picks
- **Deadline:** the matchweek's first kickoff.
- Any manager can set a **backup ranking (queue)** of clubs before or during the draft.
- At the deadline, the draft resolves in order from whoever is on the clock:
  - The manager on the clock: their highest-ranked available queued club. **No queue → no pick, 0 bonus that week.**
  - Each manager after them who hasn't picked: their highest-ranked available queued club. No queue → the app picks the available club with **the best chance of a big win**. *(My call: the club with the shortest 2-way moneyline price at the deadline. Ties → the bigger favorite by 3-way price.)*
- A manager who wasn't stuck behind anyone and never picked or queued gets nothing. This case only arises for the manager on the clock.

- **No per-turn time limit** (Sean chose the first-kickoff deadline over a turn timer). A quiet manager holds the draft until first kickoff; queues are how the managers behind them protect themselves. The app should nudge everyone to set a queue while someone is on the clock.
- *(My call)* If 2-way prices aren't available at the deadline, the auto-pick uses the shortest 3-way win price, then the higher league position.

### 6.4 Matchweek definition
- *(My call)* A matchweek is Sleeper's week (`/v1/state/clubsoccer:epl`), and its matches are the Premier League gameweek Sleeper scores. A club with no match that week can't be drafted. A club with two matches in one week (double gameweek): only its first match counts for the bonus. A match moved out of the week counts as postponed (score 0).

### 6.5 Bonus scoring
- Only the manager whose club has the **widest winning margin** of the matchweek, among drafted clubs, scores: **margin × 5 points**. Everyone else scores 0. A drawn or lost club scores 0.
- Tiebreak on margin: more goals scored, then fewer goals conceded. Still tied: **every tied manager gets the full points.**
- If no drafted club wins, nobody scores.
- *(My call)* A postponed or abandoned match counts as no result: that club scores 0.
- The bonus is added to the manager's total **in GTL only** (standings in section 5 and the next draft order). The app cannot write to Sleeper. A note tells the commissioner the amounts in case he wants to apply them in Sleeper by hand.

## 7. Play → Guess the Line (EPL moneyline)

- **Who:** the 8 FEPL managers only.
- **Market:** the **2-way "draw no bet" moneyline**: a draw is a push, so each match has two prices. Source: The Odds API soccer market `draw_no_bet` (exact key to confirm; section 9).
- **Guess per match:** which club is the favorite, plus that club's price in American odds.
- **Scoring:** distance between the guessed price and **the real price of the club the player chose**, at the moment the guess is locked in (like NFL, D-16). Picking the "wrong" favorite is not penalized separately; the distance is just measured from that club's real price.
- **Distance rule:** −100 and +100 are the same point. So −110 to +120 = 10 + 20 = **30**. Same sign: plain difference (−150 to −120 = 30).
- **Real price:** median of available books (DraftKings, FanDuel, BetMGM), using the NFL rule as it stands today (D-27, docs/RULES.md "Line at the guess"): the newest qualifying stored price at lock-in, after one shared quota-limited refresh attempt if useful. A lock-in is never refused for refresh limits. With no stored price yet, the guess saves as pending and the first qualifying price collected after it and before kickoff becomes its reference. Source and time shown.
- **Locks:** each match locks at its own kickoff. A locked guess is final (D-37/D-39 rule). Unlocked guesses are drafts.
- **Visibility:** others' guesses for a match are hidden until you lock that match or it kicks off (D-31 rule).
- **Leaderboard:** its own, ranked by **lowest average distance per match guessed** (Sean, October 28). A missed match is simply not counted. The leaderboard shows matches guessed beside the average. It does not add to fantasy totals. *(My call)* Ties on average: more matches guessed ranks higher. (The v3 mockup's "lowest total off" label is superseded.)

## 8. Design (mockups v3)

- Sport switch at the top: NFL / NBA / **EPL**. EPL keeps the four-tab bar. *(My call)* The EPL option appears only for GTL accounts linked to an FEPL manager (and the commissioner); everyone else sees NFL / NBA as today. League, draft and guess data are readable only by linked FEPL members (RLS).
- **Home (EPL):** a hero card with a countdown to first kickoff, who's still to pick, a button to the moneyline game ("3 of 10"), and tiles for your club, moneyline rank, fantasy projection and standing.
- **Play:** sub-tabs Guess the Line · Pick a Team · Leaderboard. The draft board is a grid of glass bubble nodes, one per manager in order, with the picked crest; the manager on the clock glows lime.
- **Research → Fantasy (EPL):** sub-tabs Matchup · Standings · Rosters · Insights.
- **Bets:** unchanged; nothing for EPL.
- Visual language: the new app's D-38/D-55 system. Hero cards (`--gx-hero-card`, `--gx-hero-ring`), glass tiles (`--gx-glass`, `--gx-glass-shadow`), lime glow (`--gx-glow-accent`) on the one active choice, Barlow Condensed numbers, existing chart kit (`web/src/next/charts/`). No hard-coded colors (the `tests/next-tokens.test.mjs` gate).
- **Crests:** all 20 clubs, from ESPN's CDN, self-hosted under the D-46 rule (128 px, no edits, provenance in `sources.json`, light chip behind them in dark mode), with the notice "Premier League and club names, crests and marks are trademarks of their owners; used here only to identify the clubs. No endorsement." Promoted/relegated clubs are added each season.
- Charts: weekly points line, standings bars, projected-vs-actual bars, last matchweek's margin bars (who won the bonus), and the moneyline "distance" line.

## 9. Left to the builder

- Database schema, RLS, RPC and Edge Function layout, following the repo's existing patterns and the migration ledger (one migration at a time, never a raw `supabase db push`).
- When and how often Sleeper and odds are fetched (cron), within free limits. Budget note: `draw_no_bet` is fetched per match on The Odds API, so one refresh of 10 matches costs about 10 credits. NFL already uses part of the 500/month.
- **Verify first:** a live call confirming `draw_no_bet` returns prices from at least the three books for this weekend's EPL matches. If it doesn't, stop and bring it back to Sean before building section 7.
- **Verify first:** a free, reuse-permitted source for EPL fixtures, kickoff times and final scores (ESPN's public feed is unverified for reuse; The Odds API `scores` endpoint is an option).
- Component breakdown and routes; reuse `web/src/next/ui/` and the chart kit.
- Copy wording, inside the brand guide's tone.
- Tests: the scoring rules in 6.5 and 7 (distance rule, tiebreaks, shared points), draft resolution at the deadline (6.3), and matchup pairing (5) need unit tests before UI.

## 10. Calls I made (Sean to check)

1. Commissioner-only account linking, with invite links for the rest.
2. Draft-order tie → lower season total picks first.
3. "Best chance of a big win" auto-pick = shortest 2-way price at the deadline.
4. Postponed match → that club scores 0.
5. Weekly scores final Monday, re-checked Tuesday for stat corrections.
6. Moneyline leaderboard average-ties → more matches guessed ranks higher.
7. Turn notifications through the existing push channel.
8. 2-way only for now (Sean didn't object to the recommendation).
9. Auto-pick falls back to 3-way price when 2-way is missing.
10. Matchweek = Sleeper's week; double gameweek counts the first match only.
11. EPL visible only to linked FEPL members.
12. Moneyline real price follows NFL's current D-27 rule (pending, never refused), not D-17.
