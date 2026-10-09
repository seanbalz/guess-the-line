# Persona audit — October 9, 2026

Owner: Sean Balsiger · Version 1 · Updated 2026-10-09 · Scope: the D-21/D-22 Community home, Picks tab (ChipPicker), groups screen and the error paths around them, as built on `main` at `d0a4e9f`.

Seven simulated users worked through the real app (built with `--mode cloud-test`) against the real Edge handler and the real migrations on a local PGlite database, with only Supabase Auth mocked. Nothing here touched hosted data. The harness is reusable: `npm run test:personas` re-runs every persona, re-takes every screenshot and rewrites the findings file. The specs assert only what is true today, so the suite is green and the findings are the output, not the pass/fail.

## Method

| Part | Where |
|---|---|
| Harness (PGlite seed, handler, auth mock, finding/axe/screenshot/target helpers) | `tests/cloud-browser/personas/harness.mjs` |
| One spec per persona | `tests/cloud-browser/personas/{first-timer,phone,power,low-vision,motor,impatient,confused}.spec.js` |
| Static checks: token contrast, declared sizes under 44px, reduced-motion and forced-colors coverage | `scripts/persona-static-checks.mjs` → `.local/personas/static.json` |
| Structured findings (persona, screen, severity 1–4, WCAG ref, experience, fix, screenshot, evidence) | `.local/personas/findings.json` |
| axe-core WCAG 2.1 A/AA scan log, one row per screen | `.local/personas/axe-scans.json` |
| Screenshots | `.local/previews/personas/<persona>-<screen>.png` |

Severity: 1 blocks the task or corrupts data · 2 major friction, likely abandonment or a wrong pick · 3 moderate confusion or an accessibility gap with a workaround · 4 polish.

Each persona test seeds a fresh database: Week 5 slate (2–14 games), three profiles (Ben, Troy, Luke), a three-book market snapshot so D-17 submission passes, and a 2099 deadline unless the scenario needs a closed week. Auth is `page.route` returning a fixed session; every `gtl-api` request goes through `createCloudHandler` with PGlite behind `rpc`, `storage.membership` and `weekly`. The fixture answers the D-17 preflight as "eligible cached references" unless a scenario sets `net.quotesUnavailable`. Network latency, offline, injected status codes and session expiry are switches on `persona.net`.

## Personas and environment

| Persona | Viewport | Conditions | Screens |
|---|---|---|---|
| (a) First-time player | 390×844 | New account, no display name; reads Picks cold | sign-in, name prompt, feed, Picks Spread/Total |
| (b) Casual phone user | 390×844, touch | +400 ms on every request; tab switch, reload, back button mid-ballot | feed, Picks |
| (c) Power user | 1280×900 | Keyboard only, 14 games; counts key presses and taps | feed, Picks, submitted state |
| (d) Low-vision user | 640×450 @2× (200% zoom), CSS zoom 2, forced colors | axe on every screen, accessibility-tree names, light theme | sign-in, feed, Picks, groups, dialog |
| (e) Motor-impaired user | 1024×768 | Keyboard only, 44px targets measured on every screen, trap check, dialogs | feed, Picks, groups, dialog, group game |
| (f) Impatient user | 390×844 | Offline load/save, real 409 from a second device, expired session, 503 feed, no fresh quotes, failed like | feed, Picks |
| (g) Confused user | 390×844 | After the deadline, no published week, Spread submitted / Total skipped, no groups, coming-soon league | feed, Picks, groups |

Browser: Playwright Chromium 1194 (`/opt/pw-browsers`), config `.local/pw-cloud.config.mjs` overriding `playwright.cloud.config.js` on port 5499. Node 22.22, `@axe-core/playwright` 4.13.0 (new devDependency).

## Results in one paragraph

73 findings: 1 severity-1 bug, 24 severity-2, 31 severity-3, 17 severity-4 (several are the same issue seen by more than one persona; the table below is de-duplicated to 38 rows). axe-core reported **zero WCAG 2.1 A/AA violations on all 21 scanned screens** (dark and light), and the token contrast check passes AA for every text/background pair the Community and chip stylesheets use. The problems are not in the automated-checkable layer. They are in explanation (nobody tells a newcomer what −3 or "total" means), in state handling (unsaved picks vanish on a tab switch, reload or back press; errors are raw strings with no action), in one real bug (stale "0" chips in the Total ballot), and in keyboard cost (382 presses for a 14-game ballot).

## Prioritized findings

| # | Sev | Screen | Issue | User impact | Suggested fix | Effort |
|---|---|---|---|---|---|---|
| 1 | 1 | Picks · Total | After saving a Spread draft and switching to Total, the game that had a spread pick shows eight extra live "0" chips before 39–49 (19 chips). `WeekPicks` keeps the Spread values in `picks` for one render after `mode` changes, so `ChipPicker` builds total chips around center −3 with duplicate React keys "0"; React keeps the duplicates when the row resets. `first-timer-picks-total.png` | Tapping a stray 0 records a total of 0 points, a valid value the server accepts. Every player who drafts Spread before Total sees it. | Derive the per-mode picks synchronously (`useMemo` on `[data, mode]`) instead of resetting in an effect, and key total chips by index or clamp the center to the 20–200 range. | S |
| 2 | 2 | Picks | Switching tabs (Feed, Groups & games) with unsaved picks discards them silently; reload loses them and lands on Feed; browser/hardware Back leaves the site (no history entries). `phone-picks-5-of-14.png`, `phone-after-reload.png` | Five picks gone from a stray tap or an app switch on iOS. | Keep unsaved picks per account in sessionStorage (the group screens already do), put the tab in the URL hash, push history per screen. | M |
| 3 | 2 | Picks · cold | Nothing explains the game: no "favorite", no "win by", no "combined points". Chips read −1, −1.5 … which a newcomer reads as "Cowboys lose by 3". "Pick'em" is unexplained. `first-timer-picks-cold.png`, `first-timer-picks-team-chosen.png` | A first-timer picks the wrong sign or the wrong team and never knows. | One dismissible helper line per market ("Tap the team you think wins, then by how much"; "Total = both teams' points combined"), label the chip row "Cowboys win by…", show unsigned chips and keep "DAL −3" only in the summary, render "Even (pick'em)". | S |
| 4 | 2 | Picks | With one unsaved pick the "Total" market button is disabled with no reason. `first-timer-picks-team-chosen.png` | The newcomer thinks Total is broken or locked. | Auto-save the draft on switch, or keep the button enabled and say "Save your Spread draft to switch". | S |
| 5 | 2 | Picks | "Submit Spread/Total" is disabled until all 14 games are picked; only "1/14 ready" sits beside it. | Dead button, no explanation that a full ballot is required or that "Save draft" keeps a partial one. | Enabled button that explains ("Pick the remaining 13 games to submit"), draft first. | S |
| 6 | 2 | Feed (503/offline) | When `/community/read` fails with anything but a 404 message, the app silently shows "My games" with no error, no retry, and hides "← Community". `impatient-feed-503.png` | The player believes there is no feed and no picks due. | Show the Community shell with an error banner and Retry; fall back to My games only for a 404 from an undeployed function, and say so. | S |
| 7 | 2 | Picks · save errors | Offline save shows the raw "Failed to fetch"; a 409 from another device shows the message with no button (the only Refresh is at the page bottom and discards the screen); an expired session says "Sign in to continue." while the footer still says "Signed in as Ben"; no fresh quotes: honest text but the three picks were never saved. `impatient-save-offline.png`, `impatient-save-409.png`, `impatient-save-expired.png`, `impatient-submit-no-quotes.png` | Every failure ends with the picks only in memory and no next step. | Map TypeError to "No connection…", add Retry / "Load latest" / "Sign in again" buttons to the banner, auto-save a draft before the D-17 reference check, keep drafts in sessionStorage. | M |
| 8 | 2 | Picks (keyboard) | 382 key presses to finish 14 spread games: every chip is a tab stop, 24 stops between one game's team chips and the next. No arrow keys, no type-ahead. `power-picks-complete.png` | Keyboard and switch users cannot realistically finish a ballot. | Roving tabindex per chip row (radiogroup, arrows move within), numeric type-ahead ("3" selects −3), one tab stop per row. | M |
| 9 | 2 | Picks (200%, color) | A selected chip differs only by fill colour; under forced colours selected and unselected chips are identical (`rgb(255,255,255)` on both), and no stylesheet used by the Community screen has a `@media (forced-colors)` rule (only `teamIdentity.css`). `low-vision-picks-forced-colors.png`, `low-vision-picks-200-selected.png` | Windows High Contrast users cannot see what they picked; colour-blind users rely on the one summary line. | Check icon or 2px inset ring on `.chip.selected`, `aria-pressed` styled under forced colours, same for the liked heart, urgent card border and "me" leaderboard row. | S |
| 10 | 2 | Picks (screen reader) | Number chips are announced as "minus three, toggle button" with no team or meaning; total chips as "44" with no unit; team facts read as "TB 1-4 Road 1-1". | A screen-reader user hears forty unlabeled numbers per game. | `aria-label` on each chip row ("Cowboys win by", "Combined points"), `aria-describedby` on chips, spelled-out records. | S |
| 11 | 2 | Feed (200%) | Leaderboard headers are 8px (`th` in `community-leaderboard`), five numeric columns, "—" placeholders unlabeled. `low-vision-feed-200.png` | Unreadable at 200% zoom without a second zoom. | 13px minimum headers; card layout below 720px; `aria-label="no submitted ballot"` on dashes. | S |
| 12 | 2 | Feed · closed | After the deadline the card says "picks closed · Spread 0/3 · Total 0/3 · Deadline passed" while the tab still says "Picks (2 due)"; the Picks tab shows greyed chips and the word "Closed". `confused-feed-closed.png`, `confused-picks-closed.png` | Contradictory labels; the player does not learn that they score 0 or when the next week opens. | Tab label "Picks (closed)"; closed-week summary (your picks or "no picks", others' picks, "Week 6 opens when published"). | S |
| 13 | 2 | Picks · no week | Before a week is published, Picks shows only a red error banner "This week's schedule is not available." and the home screen shows a dash-filled "Leaderboard · season". `confused-picks-no-week.png`, `confused-feed-no-week.png` | Looks broken; players retry and reload. | Return `games: []` and render a quiet "Week 6 has not been published yet" state. | S |
| 14 | 2 | Picks · half done | "Make picks" on a card that says only Total is due opens the already-submitted Spread ballot; the card drops the submitted market so there is no "Spread ✓". `confused-picks-half-done.png`, `confused-feed-half-done.png` | Players miss the second required ballot. | Open the first market still due; show "Spread ✓ submitted · Total 0/3 still due". | S |
| 15 | 2 | Groups | The groups screen never says the Community already scores everyone and groups are optional; Solo and Bet Tracker get equal lime primaries above the empty state. `confused-groups-empty.png` | A player who came from "Picks (2 due)" cannot tell whether a game must be created to play. | One sentence under the heading; demote Solo/Bet Tracker to secondary. | S |
| 16 | 3 | Feed | The theme selector card (115px) is the first thing on the home screen, above the title; then a two-row six-button league switcher where five buttons lead nowhere live; then the tabs; then the picks-due card. 12 Tab presses from load to "Make picks". `first-timer-feed.png` | The primary action is below the fold on a phone and far down the tab order. | Move Appearance to the footer/Settings; collapse the switcher to "NFL · Live · More leagues"; point the skip link at the picks-due card. | S |
| 17 | 3 | Feed | Skip link sends focus to `<main>` which has no `tabindex`, so focus actually lands on body and the next Tab restarts from the theme select. | Keyboard users gain nothing from the skip link on the Community screen. | `tabIndex={-1}` on `main` (the game screen already does this). | S |
| 18 | 3 | Feed | Like button is 33×44 (`text-button`); 11px text. Three personas hit it. | Narrow target for thumbs and tremor. | `min-width:44px` on `.feed-actions .text-button`. | S |
| 19 | 3 | Feed / Picks | Type below the brand scale on every screen: 8px eyebrow, 8px table headers, 9–11px secondary/text buttons and badges, 12px `.small` and `small`; root font-size is 14px while the guide says body 16/24 and 16px interactive on mobile (`persona-static-checks`: 39 interactive/label rules under 12px). | Hard to read for everyone, unreadable for low vision. | Raise the root to 16px, metadata to 13px, remove the 7–11px rules. | M |
| 20 | 3 | Picks | Team chips truncate ("Command…") at 390px. `first-timer-picks-cold.png` | The control that picks the favourite shows a cut-off name. | Allow two lines or use "WAS Commanders". | S |
| 21 | 3 | Picks | Summary "Cowboys −3" is grey 14px mono under the chips; it is the only confirmation of the pick. | Easy to miss; repeats the sign problem. | Headline "Your call: Cowboys by 3", mono token secondary. | S |
| 22 | 3 | Picks · Total | Total chips are 39–49 around 44 for every matchup; − / + step by 0.5 only; typing impossible; 51.5 needs several presses. | No sense of whether 44 is high or low; slow for power users. | Center on the matchup's typical total; allow typing on the focused row. | M |
| 23 | 3 | Picks | Due line is grey 14px "Week 5 · 1/14 picked · Due Oct 8, 5:15 PM PT": no weekday, no countdown, not in the sticky bar; the 95px sticky bar covers chips and has no bottom padding. `phone-picks-5-of-14.png` | Deadline is easy to miss; last card's chips hidden. | "Due Thu 5:15 PM PT (in 2 days)" in the bar; `padding-bottom` equal to the bar. | S |
| 24 | 3 | Picks · submitted | After Submit, focus is on body and the only confirmation is a one-line status at the top; nothing says what was captured, that Total is still due, or how to see others' picks. `power-submitted.png` | The moment of commitment feels like nothing happened. | Receipt panel: count, time, "Total still due", buttons to Total and to the feed. | S |
| 25 | 3 | Picks | Save/like/comment errors render at the top of the list, up to 431px above the control that was tapped; no spinner or "Saving…" while busy. `impatient-like-500.png`, `phone-picks-draft-saved.png` | On a phone the error is off-screen; the tap "did nothing". | Inline or toast errors near the control; busy label on the button. | S |
| 26 | 3 | Picks | No way back to the Feed from the bottom of 14 cards; the tab bar is off-screen. `first-timer-picks-bottom.png` | Dead end after scrolling. | Sticky tab bar or a back link in the save bar. | S |
| 27 | 3 | Picks (1280px) | One column, 5510px tall, cards use half the width; 29 taps minimum for a spread ballot. `power-picks-complete.png` | Six screens of scrolling for players who know their numbers. | Two-column grid ≥960px; optional dense row layout. | M |
| 28 | 3 | Name prompt | The first required step (display name) is a small form inside the full "My games" page with three greyed buttons and two promo cards; after saving, the "name saved" notice never shows because the app jumps to Community. `first-timer-display-name.png` | Onboarding reads as a finished page with a broken form. | Render the name step alone; carry the confirmation into Community. | S |
| 29 | 3 | Feed | The picks-due card reads "Spread 0/14 · Total 0/14" with no noun; the feed post shows picks as "TB @ DAL / Cowboys −3" and "PK" while Picks uses full names. | Newcomers do not know Spread and Total are two ballots; naming differs per screen. | "2 ballots due: Spread (0 of 14 games), Total (0 of 14)"; one naming scheme; expand PK. | S |
| 30 | 3 | Group game | Inside a group, "My picks" opens the older dropdown/typed form (`PredictionEntry`) rather than ChipPicker; 16 targets under 44px on the dashboard (mode tabs 43px, "How to play" 141×17, hidden 1×1 inputs) and 4 on the picks page. `motor-game-dashboard.png`, `motor-game-picks.png` | Two entry patterns for the same ballot; small targets. | Reuse ChipPicker in PredictionEntry (already a noted follow-up); 44px on `.mode-tabs button`, footer buttons. | M |
| 31 | 3 | New game dialog | Radio and checkbox inputs are 20×20; focus opens on "Close dialog" instead of the first field. | Small targets; extra Tab. | Enlarge the label hit area to 44px (already a `<label>`), autofocus Game name. | S |
| 32 | 3 | Sign-in | The sign-in card never says what the game is; 4 Tabs to reach email. `first-timer-sign-in.png` | No pitch for a newcomer. | One line under the heading; autofocus email. | S |
| 33 | 4 | Picks | "Lower by half a point" stays enabled at the 0.5 floor and the live region repeats the same value. | Silent no-op. | Disable at floor/ceiling or step into Pick'em. | S |
| 34 | 4 | Feed (slow) | 2.0 s to the picks-due card at +400 ms/request; chrome renders first, then a one-line "Loading the feed…"; Picks re-fetches the week (0.8 s) although the feed already knew it. | Page looks finished before content arrives. | Skeleton rows; reuse the feed payload; prefetch `/personal`. | S |
| 35 | 4 | Feed | Choosing a coming-soon league replaces the whole home screen with one card. `confused-league-coming-soon.png` | Loses the picks reminder. | Inline expansion or sheet over the NFL feed. | S |
| 36 | 4 | Feed | Team facts line is dense mono ("TB 1-4 · Road 1-1"). | Reads as code. | "Buccaneers 1–4 overall · 1–1 away". | S |
| 37 | 4 | Static | `styles.css` declares sizes under 44px on 16 interactive rules outside the Community screens (`.player-switch select` 25px, `.status-strip button` 24px, `.hero-bottom button` 31px, `.prediction-input` 42px, `.error-banner button` 32px, `.connections a` 25px). | Group game and local-workspace controls under the brand minimum. | Raise to 44px or add padding. | S |
| 38 | 4 | Static | Token contrast: all text/background pairs on canvas/surface/card pass AA in both themes (lowest real text pair: dark `tie` on `card` 5.5:1; dark `muted` on `card` 7.0:1; light `muted` on `card` 6.5:1). The only sub-AA pairs are `border` used as text colour in `.option-index` (design lab) and `primaryText` on `cyan` in `.icon-study-2` (brand lab). Reduced motion: global fallback in `styles.css` plus per-file blocks in all five animated stylesheets. | None for players. | Leave; fix the two lab rules when the lab ships. | S |

What passed and should stay: zero axe violations on all 21 screen scans in both themes; a visible 2px cyan focus ring on every chip, Enter and Space both toggle; chips 56×44 with 8px gaps; the skip link is visible on focus; no keyboard trap on the home screen (24 stops with 3 games); the native `<dialog>` traps focus and Escape returns focus to "New game"; Save draft is idempotent (request id) and disabled until a pick changes; a saved draft survives reload and the picks-due counts update; the 409 path really fires when a second device saves first.

## Quick wins (≤ 1 hour each)

1. **Fix the stale "0" chips** (#1): derive mode picks with `useMemo` and key total chips by index. Add the first-timer spec's assertion as the regression test (flip `expect(zeros).toBe(8)` to `0`).
2. **Explain the chips** (#3, #21, #29): a helper line per market, "Cowboys win by…" row label, "Your call: Cowboys by 3" summary, "Even (pick'em)".
3. **Enable Total while a draft is unsaved** (#4) by saving the draft on switch.
4. **Explain the disabled Submit** (#5): enabled button with "Pick the remaining N games to submit".
5. **Stop the silent fallback** (#6): error banner plus Retry in the Community shell for non-404 failures.
6. **Give error banners a button** (#7, #25): Retry / Load latest / Sign in again; map "Failed to fetch" to an offline message; render the banner next to the control.
7. **Selected-chip affordance and forced colours** (#9): check icon on `.chip.selected`, a `@media (forced-colors: active)` block in `chipPicker.css` and `community.css`.
8. **Chip row labels for screen readers** (#10): `aria-label` on `.chip-numbers`, `aria-describedby` on chips.
9. **Closed and unpublished states** (#12, #13): "Picks (closed)" label, quiet "not published yet" state instead of an error.
10. **Open the right market** (#14): "Make picks" opens the first market still due; show "Spread ✓ submitted".
11. **Home order** (#16, #17): Appearance to the footer, `tabIndex={-1}` on `main`, skip link to the picks-due card.
12. **Targets and type** (#18, #20, #23, #31): `min-width:44px` on the like button, two-line team chips, due time in the save bar with bottom padding, 44px hit area on dialog radios.

## Bigger changes

- **Draft persistence and navigation** (#2): sessionStorage drafts per account and mode, hash per screen (`#feed`, `#picks`, `#groups`), `popstate` handling so Back works on Android and iOS. Half a day including tests.
- **Keyboard model for chip rows** (#8, #22): radiogroup with roving tabindex, arrow keys, numeric type-ahead and a typed-value escape hatch. One day; affects `ChipPicker` only.
- **Type scale and density** (#19, #27, #11): 16px root, 13px metadata, two-column cards at ≥960px, card leaderboard below 720px. One to two days because `styles.css` carries dozens of 7–12px overrides.
- **Submission receipt and half-done flow** (#24, #14, #29): one confirmation panel after submit that names the other ballot and links to the feed reveal.
- **Group game entry parity** (#30): ChipPicker inside `PredictionEntry`, 44px mode tabs. Already a D-21 follow-up.
- **Onboarding step** (#28, #32, #15): name prompt alone, a one-line pitch on sign-in, a sentence on the groups screen about what groups are for.

## Re-running

```sh
npm run test:personas              # static checks, then the seven specs with playwright.cloud.config.js
node scripts/persona-static-checks.mjs
```

Findings land in `.local/personas/findings.json`; each spec replaces its own persona's rows, so a partial run never mixes stale and fresh data. Screenshots overwrite in place. The specs skip (not fail) when `.local/sql-check` has no PGlite, exactly like `community.spec.js`.
