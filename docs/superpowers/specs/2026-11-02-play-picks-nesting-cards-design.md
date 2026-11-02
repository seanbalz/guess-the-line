# Play › Your guesses as nesting cards — design (D-69)

Sean, November 2, 2026, asked for the next design pass: less text on Home and Play, the way Research was done (D-66).
On the live app, Home and the Play landing were already lean. The weight was in Play › Your guesses, so the pass
targets that screen. From five options on the
[comparison canvas](https://claude.ai/artifact/5Kj42mrQJZ2UJGqsxm4nSn) (nesting cards, pick deck, rows that open in
place, board and sheet, number line) he chose "1 · Nesting cards".

## Why

Measured on the live app (Mac mini Chrome, signed in, November 2, Week 9):

| Play view | Words on screen | Page height |
| --- | --- | --- |
| Your guesses, Total (0 of 15 locked) | 1,317 | 9,043px, 252 buttons |
| Your guesses, Spread (15 of 15 locked) | 750 | 8,838px |
| Your weekly score | 260 | 2,488px |
| League | 221 | 2,004px |
| Badges and awards | 147 | 1,957px |
| Guess the Points | 160 | 1,873px |
| Play landing | 59 | 1,117px |
| Home (for comparison) | 139 | 1,637px |

The guesses page is long, not wordy. It stacks 15 cards of 525px, each with the full picker. One tap should open one
game instead.

## What does not change

- **Rules.**
  - D-37 and D-39: one game locks at a time, and a locked guess is final.
  - D-31 and D-36: the line and other players' guesses open only after your own lock or kickoff.
  - D-16 and D-20: each lock keeps its own scoring reference.
  - D-30: late picks are marked Late.
  - The sit-out stays.
  - The server decides every state.
- **The editor's logic.** `PerGameEditor` keeps its data, drafts, saving and request IDs, plus:
  - Check saved picks, Save draft and the retry of the same request;
  - Sit out;
  - the older drafts it recovers;
  - the reveal read and the lock-in moment.
- **The pieces it draws.** `GuessPicker`, `ScoreReceipt`, `RevealPicks`, the lock-in and sit-out dialogs and their
  wording stay as they are.
- **Other paths.** The whole-market `WeekPicks` path (rules without per-game lock-in) and the old app's Community Picks
  page (no Shell) keep the stacked list.
- **The top of the screen.** The screen keeps its title, "Your guesses", and its "Your weekly score" button.

## The layers

Both layers follow the D-66 contract and use the shared `Nest`: one job per layer, at most one meta line, and one
picture and one big number per tile. No surface sentence runs over twelve words. Fine print sits behind ⓘ.

### 1. Week (the root card, no lip)

Shell Back returns to Play.

- **Title and ⓘ.** The title is "Week 9". The ⓘ holds the rule sentence that sits on the surface today ("Lock one game
  at a time. Spread and Total are separate; a locked guess cannot change.") and the market's guess help (`GUESS_HELP`).
- **Meta line.** "4 of 15 locked" (`weekProgress().summary`).
- **Controls.** The Spread / Total control, the progress meter with its legend, and "Next to lock · <matchup>", which
  opens that game's layer. The strip of small state tiles is removed; the game tiles replace it.
- **Game tiles.** One tile per game, in the server's kickoff order (`gx-nest-grid` / `gx-nest-tile`).
  - **Top row:** a state tag with its icon (`STATE_ICONS`). An open game shows its kickoff day (THU, SUN, MON); every
    other game shows its state word: Next, Draft, Locked, Closed, Skipped or Not open.
  - **Picture:** the matchup as two team marks.
  - **Big number:** your guess (`pickText`), or "—" with no guess. That is "45" for a Total, "JAX −3" for a Spread and
    "Even" for a pick'em.
  - **Next to lock:** that tile gets the `data` ring and the Next tag. Lime stays for your selection and the one
    primary action.
  - **Accessible name:** the button reads "Denver Broncos at Carolina Panthers, draft, 45".
  - **Hidden data:** a tile never shows the line, points or anyone else's guess.
- **Below the grid.** Check saved picks / Save draft, "Sit out remaining <market> games", the pending-retry cards, the
  older-draft recovery and the storage notes. These are unchanged and still appear only when they apply.
- **Above the card.** The status and alert lines (notice, error, reveal failure) sit above the card, always mounted, so
  they are announced on either layer.

### 2. One game (`pickGame` = the game id)

- **Lip and title.** The lip reads "Week 9 · Total" (a "Back to Week 9 · Total" button). The title is "DEN @ CAR". The
  D-62 marks with this weekend's records sit under it and open each team's sheet.
- **ⓘ and meta line.** The ⓘ holds the market's guess help and keyboard help. The one meta line holds the kickoff and
  the state pill, with the same words as today.
- **An open game.** `GuessPicker`, then "Lock in <market>" as the layer's one primary (lime) button. Under them sit the
  same closed-draft and not-open notes as today.
- **A locked game.** `ScoreReceipt`, then `RevealPicks` once the game is open to you. The lock-in stamp plays on this
  card.
- **Next.** "Next to lock · <matchup>" opens the next draft or open game and replaces this layer, so the lip and Back
  both still return to the week. After a confirmed lock-in it becomes the primary button. With nothing left, the
  layer says "Every game is locked in." or "Nothing left to lock this week."

## Addresses and navigation

- **Existing keys.** `pickGame` is already a Play route key and is in the router allowlist.
- **Opening a game is a step.** `navigationPatch` counts a change to `pickGame` under `section: 'picks'` as a step. The
  lip lands on the prior place, so it goes back (`returnsToPrior`).
- **Next replaces the game.** It goes back to the week, then opens the next game. The trail never holds the previous
  game.
- **Deep links.** Lines › Your pick, Bets › game sheet and the game actions already pass `pickGame`, so they open the
  game layer directly. Back returns to where the player came from; the lip opens the week as a new step.
- **Fallbacks.** If `pickGame` is not in this week's games, the week layer shows. A reload on a game address reopens
  that game.
- **Focus.** `Nest` moves focus to the layer heading. It replaces the editor's scroll-to-card focus.

## Tests

- **Unit (Vitest).**
  - The week shows one tile per game, in order.
  - Each tile shows its state word and guess.
  - The week layer contains no line, points or others' guesses.
  - A tile opens its game (`setView` with `pickGame`), and the lip returns.
  - Next replaces the game.
  - A locked game shows its receipt and reveal only on its own layer.
  - An unknown `pickGame` falls back to the week.
  - Without a Shell the full list still renders.
- **Navigation (node).**
  - Opening a game is a step.
  - The lip goes back.
  - Next keeps the trail at the week.
  - A deep link's Back returns to its origin.
- **Cloud browser** (real handler, local PGlite with the hosted migration inventory).
  - **Updated specs:** `next-per-game-scoring`, `next-play-moments`, `next-play-live` and the `next-lines` Your pick
    case now open games through tiles.
  - **Two games in a row:** lock one, use Next, lock the second.
  - **Reload:** a game address reopens the game.
  - **Layout and accessibility:** run at 390px and 320px, with axe on both layers.
- **Existing checks.** The token, brand-doc and `ui-markup` checks still pass.

## Out of scope

- **Home** is already lean.
- **The other Play screens.** League, Your weekly score, Badges and awards and Guess the Points can follow the same
  pattern later, one PR each, if Sean asks.
- **Server, SQL and game rules** are not changed.
