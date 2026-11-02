# Design overhaul: game feel, nesting cards and a page-by-page pass

Owner: Sean Balsiger · Designed with Sean in chat October 26 and November 2, 2026 · Status: **proposed (D-69),
awaiting Sean's review of this written spec.** Sean answered five questions one at a time on a mockup canvas and
approved the three design parts in chat ("Looks right", "Looks right", "Looks right, write spec"). Nothing is built.
No implementation plan exists yet; writing one needs Sean's go.

Mockups: [GTL Design Overhaul Mockups](https://claude.ai/artifact/YBJmR5XUV59juyGKPGphJ7), a private canvas with
rows Q1 to Q5. The mockups use sample numbers and colored circles in place of team marks.

Claim tags: **[inspected]** read in this repository at `e7a38c6e` (or at `1f392fe1` where noted); **[assumed]** a
design default, not measured.

## 1. Why

- Sean, October 26: "The design needs a page by page node by node overhaul. The app doesn't have interactive and
  motion and game type features. It's limited on the design and needs to be upgraded as discussed."
- It continues two earlier complaints. D-35: "this does not feel gamified". D-66 (October 28): "theres still way too
  much text across the app and not enough visuals and easy navigation and progression like a chinese doll".
- Some game feel shipped between October 26 and 28 [inspected]:
  - **Play:** a lock-in stamp, week progress, the reveal and a native picker (#264).
  - **Touch:** press feedback, sheet swipe-down, game paging and skeletons (#266).
  - **Home and League:** count-ups and rank moments (#268).
  - **Game features:** badges, streaks, awards, the recap and the League feed.
- Most pages still have none of it [inspected at `1f392fe1`]:
  - **Pages with no motion:** Play's landing, Your score, Compare, Feed and Guess the Points. Bets' landing, Your
    picks, Everyone and Recommended. Menu, the History page, the Team page and the EPL screens.
  - **Old-app screens still inside the new app:** the picks fallback (`CommunityHome.jsx` WeekPicks), League history
    (`CommunityHistory.jsx`), My bets (`SocialBetTracker.jsx`, reskinned as Roomy cards on November 1), Your gap
    (`VirtualUnits.jsx`), Fantasy accuracy (`FantasyAccuracy.jsx`), the Menu theme control (`Theme.jsx`) and the
    commissioner tools (`ResultReviewControls`).
  - **Missing pieces:**
    - Count-ups appear in only two places (Home's rank tile and the League board).
    - Tabs switch with a plain swap.
    - Three screens show "Loading" in plain text.
    - Celebrations cover only new badges and awards.

## 2. Sean's answers

| # | Question (canvas row) | Options shown | Sean's answer |
|---|---|---|---|
| Order of work | A game feel, B game features, C page-by-page | A+C first then B (recommended); B first; all three | "I think your recommendation is probably going to be the route", asking for one question at a time with mockups |
| Q1 | How much game feel, on Play › Your score | A Clean; B Moments (recommended); C Arena (needs a new motion decision) | **B · Moments** |
| Q2 | How you move through the app | 2A Nesting cards everywhere (recommended); 2B Sheets (today); 2C Expanding cards | **2A · Nesting cards** |
| Q3 | Which moments get the big treatment | the PICK column of the moments catalog (recommended); bet wins big | **Use PICK column** |
| Q4 | Page order | step 0 shared kit, then Play, Home, Research, Bets, Menu and EPL (recommended); Home first | **Use this order** |
| Q5 | The first card of every tab | 5A Next move + tiles (recommended); 5B All tiles; 5C Picture rows | **5A · Next move + tiles** |
| Part 1 | Scope and shared kit | | "Looks right" |
| Part 2 | Card anatomy and page plan | | "Looks right" |
| Part 3 | Testing, delivery and decision record | | "Looks right, write spec" |

### Defaults chosen in this spec (not asked separately)

- **No sound.** Sound needs a setting and would break the quiet-loss rule; it is out of scope [assumed].
- **Vibration only where the phone supports it.** iPhone Safari has no Vibration API, and nothing works around it.
- **Loading placeholders stay static**, with no shimmer, as the kit already does (`ui/Skeleton.jsx`).
- **No confetti and no slot-machine effects**, from DESIGN_EXPLORATION's warning against casino effects. A big
  moment is the existing stadium burst plus a count-up.
- **Entrance stagger covers the first six units only**, so a long list never waits on animation.
- **Results from while you were away are not lost** (section 4.2). Today the badge celebration forgets anything that
  arrived before the session's first read (`features/useFeatures.js`) [inspected].

## 3. Rules this spec keeps

- **D-58 motion** (BRAND_GUIDE "Motion"):
  - Durations: tap 100, quick 160, base 240, exit 200, big 600 and pulse 1800 ms. Easings: standard, enter, exit, pop.
  - Only transform and opacity animate.
  - Saves get a small moment, verified wins a big one, and losses stay quiet.
  - One big moment at a time, never on page load, never more than 3 flashes a second.
  - The LIVE dot is the only loop.
  - Reduced motion stops everything.
  - No token or easing changes, so no new five-option round is needed.
- **D-38 restraint:** one job and one lime button per screen; at most six numbers per card; never color alone; faces
  first; fine print behind ⓘ (D-55 rule 10).
- **D-66 nesting contract**, now on every tab:
  - One layer, one job.
  - One picture and one big number per unit.
  - No surface sentence over twelve words.
  - Parents stay as lips, and every layer has its own address.
- **D-62:** teams are shown as marks.
- **D-31 and D-36 gates:** no hidden pick, line or market shows before its gate opens.
- **D-23:** nothing a player entered is deleted, moved or hidden.
- **Phone tests that bind every change** [inspected]:
  - no sideways scroll at 320 and 390 px, in Light and Dark;
  - targets of at least 44 px;
  - no text under 12 px, and no clipped text;
  - axe clean;
  - no transform, filter or will-change on any ancestor of the tab bar, dock or top bar
    (`tests/cloud-browser/next-scroll-navigation.spec.js`);
  - every stylesheet passes `tests/next-tokens.test.mjs`.

## 4. Shared kit (step 0)

### 4.1 Nesting cards on every tab

`web/src/next/ui/Nest.jsx` (D-66) becomes the frame of every tab's sections.

- A tab's layers form a stack. The open parents show as lips: real buttons named "Back to …", inset 8 px per depth, at
  most three steps at 320 px.
- Each layer has its own address in the router (`shell/router.js`), so a reload or a shared link reopens it. Browser
  or OS back closes one layer.
- When the layer changes, focus moves to the new heading.
- Sheets stay only where a short task floats over a page: comments, reactors, the reactions popover, and the menu
  itself, whose sections then nest (step 5). Every section becomes a layer, the game sheet included. Its swipe
  paging between games moves into the game layer (step 3).

### 4.2 The moments engine

There is one module, `web/src/next/moments/`, plus one hook.

- **`catalog.js` (pure)** holds the moments table below, with each moment's size.
- **`detect.js` (pure)**: from what this device last showed and the current read, it lists the new moments.
- **`useMoments.js`** plays them.

The engine is built to these rules:
1. **A moment plays only on confirmed data.** That means a fresh server read; a request that is still pending
   confirms nothing. This is the same rule as the lock-in stamp (`play/moments.js` `confirmedLockIns`).
2. **It never replays.**
   - The device keeps a seen record per account under a `gtl.` key: the moment ids and the last value shown for each
     counted number. It stores no picks of other players and nothing the server has not opened.
   - Signing out or switching accounts clears it.
3. **It never plays on page load.** On launch every number shows its final value.
   - A result from while you were away is marked NEW on its tile, and its moment plays the first time you open the card
     that holds it. Opening a card by tapping is not a page load.
   - A result that arrives while you watch (a refresh, the 5-minute timer, focus) plays in place.
4. **One big moment at a time.** Several big moments arriving together become the one existing `ov.flash` card
   ("New results", at most three lines). Small moments wait 240 ms after one another.
5. **A loss or miss stays quiet.** The number updates, and nothing pops.

| Moment | Trigger (existing data) | Size |
|---|---|---|
| Lock in a pick | `confirmedLockIns` on a fresh read | Small (the existing stamp) |
| Whole week locked | `weekProgress` reaches "N of N locked" for a market | Small |
| Bullseye | a scored game worth 10 of 10 (`catalog.mjs` `exactPoints: 10`) | **Big** |
| Week final | every game of your week is scored | **Big** (count-up of the week's points) |
| Rank up | your board rank improves | Small; **Big** when you reach 1st |
| Guess the Points exact | a scored slot whose guess equals `slot.actual` | **Big** |
| Badge or award | a new badge or award of yours (`newCelebrations`) | **Big** (the existing `ov.flash`) |
| Pick streak grows | the features read's Pick streak `current` rises | Small |
| Tracked bet wins | one of your tracked bets settles as a win | Small |
| Loss or big miss | any settled loss or low score | Quiet |

- **Small** is a tag or chip that pops in place (pop easing, 240 ms), plus a 10 ms buzz where supported on a lock-in.
- **Big** is the stadium burst and a count-up (600 ms), using `ov.flash` for badges and a card-level burst on the
  layer itself for scores and results, plus a 20 ms buzz where supported.
- The existing badge watcher (`useFeatures`) moves onto the engine, so a badge earned while you were away is no
  longer skipped.

### 4.3 Entrance and tab change

- **A new layer** rises in over 240 ms (enter easing).
- **Its units rise in** over 160 ms, 30 ms apart, for the first six units only.
- **Going back** (a lip or Back) restores the parent with a 200 ms settle, with no rise.
- **A tab change** fades only the content area over 160 ms. The top bar, tab bar and dock never animate, and no
  ancestor of them gets a transform.
- **Charts** reveal left to right through a transform on a clip group (scaleX), never by animating width or path
  length.

### 4.4 Count-ups

`home/CountUp.jsx` becomes a kit piece (`ui/CountUp.jsx`) and is used by every big number that can change: the week
total, ranks, units, Points totals, streaks and the board.

- It counts from the last value shown on this device to the new value over 600 ms.
- The first view of a number, a page load and reduced motion all show the final value.
- Screen readers get the final value only (`aria-live="polite"` on the settled number).

### 4.5 Loading, empty and error states

- **Loading:** every layer shows `ui/Skeleton.jsx` blocks in its final shape while it loads. This replaces the
  "Loading" text in Home, Feed and `DeferredScreen`.
- **Empty:** one sentence and one action (brand rule 5).
- **Error:** one sentence, Try again, and the last good copy when one exists. This is the existing shared-read rule:
  a failed read keeps the last good copy.

### 4.6 Vibration and reduced motion

- **Vibration:** `ui/haptics.js` gains `tap` (10 ms) and `win` (20 ms), only where `navigator.vibrate` exists.
- **Reduced motion:** the device setting or the app's Reduce motion switch (`data-motion="reduce"`) stops every
  animation, transition, count-up and buzz. Words and final numbers always show.

## 5. Card anatomy

- **A tab's first card (5A):**
  - **The next-move card on top:** one glow card holding an eyebrow ("Your next move"), a title-style line ("Lock in
    Week 9"), one progress or status visual, at most one meta line, and the screen's one lime button.
  - **Under it, tiles in two columns.** Each tile has a label, a Lucide icon or a small picture, one big number (the
    number style), and one short line. When that line carries a state color it also carries a word or symbol
    ("▲ 2", "New: Sharpshooter").
  - **With no next move** (the week is done), the top card shows the latest result instead, as Play does today with
    "Your week, at a glance".
- **Every deeper card:** a heading, at most one meta line, then tiles or rows. No surface sentence is over twelve
  words, and ⓘ holds explanations, sources and credits. Lime marks only your selection and the one main button.
- **Lists that must stay lists** (games, the board, bets, the feed) use picture rows: team marks or a face first,
  then the name, then one number on the right with a status word. Tapping a row opens its layer.

## 6. Page by page

Every page below gets the shared kit. Only the changes are listed.

### Step 1 · Play
- **First card:**
  - The next move: Lock in Week N, with the 14-segment week progress and "Make picks".
  - Tiles: Your score, League, Guess the Points, Badges, Feed and Compare.
  - This replaces `FocusAction`, `FocusRows` and the Points glow card in `play/Play.jsx`.
- **Picks:** the per-game cards keep the native picker, the lock-in stamp and the reveal.
  - The old-app fallback (WeekPicks from `CommunityHome.jsx`) is rebuilt as the same per-game cards, read-only where
    rules are not per-game.
  - The whole week locked is a small moment.
- **Your score:** mockup Q1-B.
  - Week chips replace the season and week dropdowns and the Previous and Next buttons. Older seasons sit behind a
    "Season" chip.
  - Spread and Total stay a segmented control.
  - The hero total counts up, and a rank chip shows the move ("3rd ▲ 2").
  - Game rows show team marks, "Line · You · off by", a miss bar and a points pill; a Bullseye shows its tag.
  - Filters move behind a filter icon button.
  - Tapping a game opens the game layer (your guess, the saved line and its source, the miss, and kickoff).
- **Compare:** two faces, then head-to-head big numbers (points, Bullseyes, average miss), then game rows with both
  guesses once each game's gate allows (D-31).
- **League:**
  - **Board:** count-ups and the rank chip; reaching 1st is a big moment.
  - **Feed:** new posts rise in, and reactions pop (small).
  - **History** (old `CommunityHistory.jsx`): rebuilt as season tiles › week tiles › game rows.
- **Guess the Points:** slot tiles (QB, RB, WR, TE, FLEX) with each slot's state word, then a slot layer. The big
  stepper and the number line with faces stay. An exact guess is a big moment.
- **Badges:** a badge grid, then a badge layer. A new badge plays through the engine.

### Step 2 · Home
- **The hero:** the existing hero card (week, countdown, status meter and primary button) becomes the next-move card.
- **Tiles:** the stat tiles; Who's in as faces; awards; This week as game tiles with marks; and Saved trends as one
  tile.
- **NEW tags:** results from while you were away show NEW on their tile. Opening the tile plays the moment.
- **Moments:** Home plays only the whole-week-locked and Pick streak moments, in place.

### Step 3 · Research
- **First card:** the next move (this week's games and lines), then tiles for Games, Trends, Fantasy and Teams.
- **Games:**
  - The board becomes picture rows.
  - The game layer holds the lines, the movement chart (it reveals left to right; the slider stays), your pick, trends
    and the matchup statistics.
  - The game sheet's swipe paging stays inside the game layer.
- **Trends:** already nesting (D-66); it gets entrance motion, count-ups and the chart reveal.
- **Fantasy:** the old `FantasyAccuracy.jsx` is rebuilt as tiles and rows.
- **Teams:** the Team sheet becomes a layer, with the mark, record and margin chart.

### Step 4 · Bets (light touch)
- **First card:** the next move (track a bet, or place your picks when a week is open), then tiles for My bets, Your
  picks, Everyone, Recommended and Your gap.
- **My bets:** keeps the November 1 Roomy cards and filters. A settled win is a small moment; a loss is quiet.
- **Your picks** (D-67): entrance motion, plus a small moment when a placement is confirmed.
- **Everyone and Recommended:** picture rows with faces first.
- **Your gap** (old `VirtualUnits.jsx`): rebuilt as tiles and rows on the same data.

### Step 5 · Menu and Premier League
- **Menu:** becomes nesting layers: Profile, Appearance, Guidance, Members, Commissioner tools and the History page.
  - Appearance rebuilds the old `Theme.jsx` control (Dark, Light, System, Reduce motion).
  - The commissioner tools are rebuilt from the old `ResultReviewControls`.
- **Premier League:** EPL Home, Pick a Team, Draft, the queue and the table get the first card, tiles, entrance and
  count-ups. The Pick a Team result follows the same moments table.

## 7. Failure handling

- **A failed or stale read** plays no moment. The layer keeps its last good copy with one sentence and Try again.
- **A lost reply on a write** never plays a moment; the next fresh read decides (section 4.2, rule 1).
- **An account change** clears the seen record and every queued moment before the next account's first paint.
- **Several tabs or devices:** each device keeps its own seen record, so a moment may play once on each device.
  Nothing double-counts, because moments only show; they never write.

## 8. Privacy

- Moments, count-ups and NEW tags read only data the server has already returned to you. No hidden pick or line
  appears in a moment before its gate (D-31, D-36).
- The seen record stores moment ids and the last shown value of your own numbers only, under the existing `gtl.`
  prefix, and it is cleared on sign-out.
- No value moves into the public bundle, and the leak scans stay as they are.

## 9. Tests (each protects a named contract)

1. **Moments size:** each catalog moment maps to its Q3 size; a loss or miss maps to quiet.
2. **Confirmed only:** a pending request or a lost reply plays nothing; a fresh read that confirms plays once.
3. **Never replays:** a moment in the seen record never plays again on this device and account.
4. **Never on page load:** on launch no moment plays and every number shows its final value. An unseen result plays
   only when its card is opened (unit test, plus a cloud-browser check that no element animates during the first
   paint).
5. **One big at a time:** two big moments in one read become one `ov.flash` card; small moments queue.
6. **Reduced motion:** the device setting and `data-motion="reduce"` each stop every animation, count-up and buzz;
   the final values show.
7. **Count-up:** it counts from the last shown value to the new one; a first view shows the final value.
8. **Nesting addresses:** each layer has an address. A reload and a shared link reopen it, Back closes one layer,
   and focus lands on the heading.
9. **Transform and opacity only:** every keyframe under `web/src/next` touches only transform and opacity (a new
   assertion in `tests/next-tokens.test.mjs`).
10. **Fixed bars:** no ancestor of the tab bar, dock or top bar gets a transform during a tab change (the existing
    scroll-navigation spec covers each new route).
11. **Phone layout:** every new layer at 320 and 390 px in Light and Dark has no sideways scroll, 44 px targets, no
    text under 12 px and no clipping, and is axe clean.
12. **Gates:** no hidden pick or line renders in a moment, tile or NEW tag before its gate (extends the existing
    leak-scan fixtures).
13. **Old-app retirement:** after each step, its rebuilt pages no longer import the old `web/src/*.jsx` screen they
    replace.

## 10. Delivery and rollout

- **Six PRs, in order:** step 0 (the kit), then Play, Home, Research, Bets, and Menu with EPL.
  - Each starts from a freshly fetched `main` in its own worktree.
  - Each needs the nine required CI checks, and each records its evidence in `docs/COMPLETION_REGISTER.md`.
- **Frontend only.** No migration, Edge function or data change.
  - Each step releases through the manual release workflow (Pages) under the existing gates.
  - Rollback is the previous Pages build.
- **After each release,** Sean checks that tab on his iPhone before the next step starts. That check stands in for the
  register's device acceptance for that tab.
- **Brand guide:** BRAND_GUIDE "Motion" gains the moments table (section 4.2) and the nesting-everywhere rule. The
  stale "at most two glow cards" line is corrected to match the D-56 addendum. `design/tokens-next.json` does not
  change.

## 11. Out of scope

- **New game types:** friend challenges (redesign stages 50 to 55), and Showdown, Gauntlet and Decathlon. This is the
  next spec. Challenges cannot be staked in Virtual Units (D-60 consequence), so that spec starts by re-scoping them.
- **Any new server data,** migration or Edge change.
- **A new motion style,** or any change to type, palette or icons (D-58). The Q1-C Arena recap would need one.
- **Sound, a native iPhone app, and iPhone vibration.**
- **NBA** (hidden from the sport switch).

## 12. Decision entry

> ## D-69 — Design overhaul: Moments, nesting cards on every tab, next move first (proposed November 2, 2026)
>
> Sean asked on October 26 for "a page by page node by node overhaul" because the app "doesn't have interactive and
> motion and game type features". On November 2 he answered five questions, one at a time, on a mockup canvas:
> - **Game feel:** "B · Moments", within the D-58 motion rules. One big moment, never on page load; small moments
>   for saves; losses quiet.
> - **Navigation:** "2A · Nesting cards", D-66's nesting cards on every tab, not only Research.
> - **Moments:** "Use PICK column":
>   - Big: Bullseye, Week final, Guess the Points exact, a badge or award, and reaching 1st.
>   - Small: lock-in, whole week locked, rank up, Pick streak, and a tracked bet win.
>   - Quiet: losses.
> - **Order:** "Use this order": the shared kit, then Play, Home, Research, Bets, and Menu with EPL.
> - **First card:** "5A · Next move + tiles", one next-move card with the one lime button, then two columns of tiles
>   with one picture and one big number each.
>
> Results from while a player was away are shown as NEW and play when their card is opened, never on launch. The
> overhaul is frontend only, ships as six PRs with an iPhone check after each, and adds no migration. New game types
> (friend challenges, Showdown, Gauntlet and Decathlon) are a separate spec. Spec:
> `docs/superpowers/specs/2026-11-02-design-overhaul-design.md`.
