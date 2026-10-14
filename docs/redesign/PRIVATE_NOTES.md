# Private game notes: server (M-09)

Owner: Sean Balsiger · Redesign build plan stage 27 · October 14, 2026 · Written and tested locally; not applied, not deployed.

D-36 keeps private notes ("Solo extras: private notes on a game stay, in the game detail sheet") and D-39 confirms the
plan. This stage is the server half: a reader and a writer for one private note per game, used by the new app's game
sheet in stage 35 ("Only you see this."). Only the owner can read or write a note. No other member, commissioner,
group screen, feed, export or History reader returns it.

## Routes (`gtl-api`, POST, signed-in and email-confirmed, no group needed)

| Route | Body | Reply |
|---|---|---|
| `/personal/notes` | `{}` for the newest published week, or `{ season, week }` | `{ scope: 'account_private', ownerId, season, week, notes: [{ gameId, note, saved, revision, createdAt, updatedAt }] }`: every row the owner has for that week, saved or not, each note whole |
| `/personal/note` | `{ requestId, season, week, gameId, note, revision }` | `{ ownerId, season, week, gameId, note, saved, revision, createdAt, updatedAt, changed }` |

The owner always comes from sign-in; any other field (`userId`, `ownerId`, `saved`, ...) is refused with 400. Both
routes live in `cloud/personal.mjs` beside the old Solo routes.

## What a save does

A note is the `notes` column of `gtl_favorites`, the same column the old app's Favorites card writes through
`/favorite/set`, so a note written in either app shows in the other.

- **Up to 2,000 characters, never cut.** The route counts as a browser textarea's `maxLength` does (UTF-16 code
  units) and as `/favorite/set` does, so whatever either app saves, the other can save again, and it always fits the
  database's own 2,000-character check. A longer note is refused (400 "A note can be up to 2,000 characters."), never
  shortened. Spaces and line breaks are stored exactly as typed. A stored note always reads back whole.
- **The saved flag is kept.** A note never saves or unsaves a game that already has a row. A note on a game with no
  row creates the row as saved for now. That default is not settled: see "Open choice for Sean" below. Favorites
  themselves leave the new app's screens (D-36); saved records stay readable in History (stage 74).
- **Every change is audited and bumps the shared revision.** Each change appends a `gtl_personal_events` row with the
  text before and after (`{ saved, notes }`, the shape `/favorite/set` writes) and moves the shared
  `gtl_personal_versions` revision. An old-app Solo screen opened before the change gets its usual "changed on another
  device" refusal instead of overwriting the note. Clearing a note keeps the row, its saved flag and every earlier text
  in the audit (D-23). Saving the text already stored writes nothing.
- **Two devices.** A note's `revision` is the shared revision of the last change to its text, in either app (0 when
  it has none). A save names the revision it started from; if the text changed since, it is refused with 409 "This
  note changed on another device. Refresh before saving again." and nothing is written. Saving or removing a game in
  the old app does not change its note's revision.
- **Retries.** A request id replays its first answer; the same id with other content is refused
  (`GTL_PERSONAL_RETRY_CONFLICT`). The receipts are the personal workspace's own.

## Open choice for Sean: a note on a game the player never saved

This blocks the merge and "apply M-09". Sean has not ruled. Under plan section 5 rule 2, his answer is recorded as
its own D-entry in `docs/DECISIONS.md`, and the default below is set to match, before either step.

The migration currently has `kept:=coalesce(old_row.saved,true)`: a note on a game with no row creates the row as
**saved**. The plan's stage 27 says "the `saved` flag kept". D-36 says Favorites leave the screens and saved records
stay readable in History. `docs/redesign/INVENTORY_HOMES.md` row 166 has "saved games read-only in History". The
prototype's game sheet has "No favorites, no forecasts". So a saved default makes a Favorite the player never saved.

| | A: saved (the file today) | B: not saved (the plan's wording) |
|---|---|---|
| Old app's Favorites tab | The game shows there with the note, though the player never saved it. | The note does not show. The old reader (`gtl_read_personal`) lists saved games only. |
| History's saved games (stage 74) | The game is listed as saved. | Not listed as a saved game. |
| Old app's "Save to Favorites" on that game | The button reads "Saved · Remove". Removing it keeps the note. | The card starts with an empty note for an unsaved game (`FavoriteCard` in `web/src/PersonalWorkspace.jsx`), so saving it writes an empty note over the new app's note. The audit keeps the text, but both apps then show the note as empty. Today's old app already does this for a game removed from Favorites and then saved again. |

A third way avoids both the unasked Favorite and the empty note: B, plus an old-app change so that "Save to
Favorites" keeps a stored note. That changes the old app, so it needs its own stage.

Changing the default later costs more at each step:
- **Before "apply M-09":** one word in the migration (`true` to `false`), the test assertions that expect a first note
  to be saved (`tests/game-notes-sql.test.mjs`), and this page.
- **After the apply:** a replacing migration with the md5 `-- replaces` header and a `supabase/rollback/` file.
- **After stage 35 ships:** rows already created keep their saved flag. They are not quietly reset (D-23).

## Database

Migration `supabase/migrations/20261014190000_gtl_game_notes.sql` (M-09) adds two service-only, security-invoker
functions with an empty search path, granted to `service_role` only:

| Function | What it does |
|---|---|
| `gtl_read_game_notes(p_user, p_season, p_week)` | The owner's rows for that week (the newest published week when both are null). |
| `gtl_set_game_note(p_user, p_request, p_season, p_week, p_game, p_note, p_revision)` | One note's save, as above, in one transaction: the owner's version row is locked first (the order `gtl_mutate_personal` uses), then the receipt, the revision check, the row, the event, the revision bump and the receipt. |

Nothing else changes: no table, column, trigger, row or table grant, and no function is replaced, so the file has no
`-- replaces` header and no `supabase/rollback/` file. New refusal codes (`GTL_NOTE_TOO_LONG` 400, `GTL_NOTE_CONFLICT`
409) are mapped in `cloud/personal.mjs` in the same change, before the SQL can raise them.

## Off switch and the order of release

- **Off switch:** the `gtl-api` secret `GTL_FEATURE_OFF=notes` (`cloud/feature-off.mjs`). While it is set,
  `/personal/note` answers 503 "This feature is not available right now. Nothing you saved is lost." and never calls
  the database; `/personal/notes` and every stored note stay readable. Clearing the secret turns saves back on.
  Setting or clearing it is a hosted change that needs Sean's OK; it changes no code and no row.
- **Before the apply:** a `gtl-api` deploy that has the routes answers both with the same 503 (PostgREST's "function
  not found", `PGRST202`, reads as off). No screen calls them until stage 35, and every old route answers as before.
- **Release card:** first, Sean's ruling on the open choice above, recorded as a D-entry, with the default and its
  tests set to match. Then merge (Sean's OK). Then, in either order: "apply M-09" (Gate M: read-only pre-check that
  neither function exists yet, the score hash, the apply through the Supabase MCP or the SQL editor, never `db push`,
  then the md5 of both bodies, the grants and one `pg_proc` row each), and the `gtl-api` deploy of this SHA. The
  release record then removes the file from `NOT_HOSTED` in `tests/migrations.mjs` and the four M-09 entries from
  `awaitingDeploy` in `scripts/boundary/me.mjs`, and `check:cloud --strict` passes. Window: any (low risk, read and
  write of the owner's own rows only).

## Tests

- `tests/game-notes-sql.test.mjs` (PGlite, on `ALL`): grants and invoker rights; the newest-week read; a first note
  creates a saved row, is audited and bumps the shared revision, and the old Solo reader shows it; 2,000 characters
  round-trip with spaces and line breaks, 2,001 are refused; an unchanged save writes nothing; the saved flag is kept
  through old-app saves and removals; stale saves refused in both directions; request-id replay; clearing keeps the
  audit; the database refuses forged input from the trusted role; each account reads only its own rows. Through the
  real handler: the owner reads the note whole, and for the other two fixture accounts neither `/personal/notes` nor
  any reader in the leak scan's list (`/community/read`, `/community/history`, `/personal`, `/lobby`, `/state`,
  `/export`) carries the note's text or the half-point number inside it. On `HOSTED` (no M-09): the old personal
  routes answer as before and both notes routes fail closed.
- `tests/personal-workspace.test.mjs`: route fields, the limit as a textarea counts it, refused input never reaching the
  database, the error mapping, `PGRST202` as off, and the off switch.
- `tests/feature-off.test.mjs`, `tests/cloud-boundary.test.mjs` (the M-09 probes awaiting deploy).
