# Guess The Line — M-10, D-53 and NBA migrations (Gate M record)

Owner: Sean Balsiger · October 22, 2026 · Applied and verified

Sean's approval, quoted: "Approved: apply M-10, both D-53 migrations (comparisons,
preferences) and the two NBA migrations, one at a time in order, with the normal Gate M
checks, then release the features that depend on them." Because the admin Supabase MCP could
not be signed in to his account, he then approved the route used here: "I explicitly approve
applying M-10, both D-53 migrations and the two NBA migrations through the Supabase SQL editor
in my signed-in Chrome, one at a time with Gate M checks."

## Route

Gate M step 6 allows the SQL editor. Claude Code drove the Supabase dashboard SQL editor in
Sean's Chrome, signed in as `sbalsiger2@gmail.com` (role `postgres`). For each file:

1. The page fetched the file from GitHub at the exact merged commit and its SHA-256 was
   compared with the repository copy before anything ran.
2. One editor run held the whole file plus the history record, so each apply is a single
   implicit transaction: `insert into supabase_migrations.schema_migrations(version, name,
   statements, created_by)` with the UTC apply time as the version, the file name as the name,
   the exact file as the only statement and `sbalsiger2@gmail.com`, matching what the MCP
   `apply_migration` writes.
3. Steps 4, 5 and 7 ran before the next file. Read-only checks used the GTL read-only MCP; the
   score hash ran in the SQL editor, because the read-only role cannot execute
   `gtl_ballot_pick_scores`.

## Applied

| Order | Repo file | Hosted version | File SHA-256 |
| --- | --- | --- | --- |
| 1 | M-10 `20261015190820_gtl_bets_read.sql` | `20261022185535` | `9718df611ef9d8fab35ad723e4bdd08cc533c7cb51ddf32d523401b124c1ada1` |
| 2 | D-53 `20261016010000_gtl_score_comparison.sql` | `20261022185719` | `9ff06ef4ba5cd42efcaf8a7455395874b061cfb6fb2cadf60828a6ded6a166cd` |
| 3 | D-53 `20261016011000_gtl_account_preferences.sql` | `20261022185832` | `314bcad9022ca50c3bc751b12cbdbc4c485f7369a1547ebee7baee110410a68f` |
| 4 | NBA `20261021223000_gtl_nba_app_bets.sql` | `20261022194048` | `fdd6f8a0b4ae1fc222af90e4fe1c8c0223fc78fbc1119f9188a7662a8f0ebb30` |
| 5 | NBA `20261021223100_gtl_nba_game_cache.sql` | `20261022194209` | `d4d1a97d2e129a8ff6d6e66c273e1c22dc325c0169423128faea23311aee894a` |

Files 1–3 came from `main` at `79fb875f45885955536f59fd96b1a03228d3bcc1`. Files 4–5 came
from `main` at `d65268e9855bc8577f315ab0499497d808ffa178`, right after
[PR #167](https://github.com/seanbalz/guess-the-lines-repo/pull/167) merged (it had first
taken in `main` with #180, #182 and #183 and passed all five checks at `de69c44`); both hashes
equal the [NBA release card](NBA_SECTION_RELEASE.md). History is now 51 hosted migrations,
digest `bd9da17ade5d3f6a98924270c88174b0ced7d4740102bd4e62c762f8e22d3b17` (was
`c571cd2d…` for 46).

## Checks

**Step 4, before (read-only, 18:4x UTC).** None of `gtl_bets_context`, `gtl_read_bets`,
`gtl_read_bets_market`, `gtl_read_score_comparison`, `gtl_read_account_preferences` or
`gtl_save_account_preferences` existed, nor `gtl_bet_versions` or `gtl_account_preferences`.
Every function the new bodies call was present with the expected arguments
(`gtl_community_member`, `gtl_markets_visible`, `gtl_guess_revealed`, `gtl_slate_game`,
`gtl_numeric_is_finite`, `gtl_live_rules`, `gtl_read_community_history`). History: 46 hosted,
newest `20261021205118`.

**Step 5, score hash (SQL editor).** md5 over every 2026 ballot of Weeks 1–6 (user, season,
week, mode, summed `gtl_ballot_pick_scores` points, scored count): **21 ballots,
`0827dbc372656c43591299975ae71a2e`** before the first apply and after each one. Week 5 Spread
anchors: Sean 95.80, Steven 91.40, Ben 37.60.

**Step 7, after each apply.**

| Function | md5(`prosrc`) = repo body | Grants | Rows |
| --- | --- | --- | --- |
| `gtl_bets_context` | `7587b6ffe1b7ec8f9ee6af4ab5c2cd6b` | `postgres`, `service_role` | 1 |
| `gtl_read_bets` | `16a110b5d2e1ec3e752c93019a9294c3` | `postgres`, `service_role` | 1 |
| `gtl_read_bets_market` | `f3eaa09f4c473272cdf556e321417b4b` | `postgres`, `service_role` | 1 |
| `gtl_read_score_comparison` | `b05d2249d89369169dbfd2ec75919056` | `postgres`, `service_role` | 1 |
| `gtl_read_account_preferences` | `74a61d746a0f3466e579c9a81d398b45` | `postgres`, `service_role` | 1 |
| `gtl_save_account_preferences` | `f578d887e2e0ccd47ef2b27257aa6c90` | `postgres`, `service_role` | 1 |

All six are security invoker with `search_path=""`. `gtl_bet_versions` (0 rows) and
`gtl_account_preferences` (0 rows) have RLS on and no browser grants; `service_role` holds
select/insert/update and select/insert respectively.

**Preservation.** Read-only snapshots at 18:45:52 (before), 18:56:12, 18:57:39 and 18:59:03 UTC
matched in count and ordered whole-row MD5 for ballots (23, `a45bf0bf…`), social commits (103),
social weeks (3), groups (5), memberships (9), Virtual Units picks (7, `7d4859ae…`), personal
events, receipts and versions (17/17/6), the empty personal and social tables, and both private
NBA tables (3/10). The 126 `gtl_*` functions that existed before kept their definitions,
configuration and grants (`d65491d0b2810fd7bce18b1815218cd1`); the total became 132.

### NBA files 4 and 5

**Step 4 (read-only, again at about 19:39 UTC).** `nba_private.bets` had no `revision`,
`updated_at` or `price_input`, `import_id` was NOT NULL, and none of `bet_changes`,
`game_cache`, `game_provider`, the NBA functions or triggers existed. No app role held a grant
or schema usage in `nba_private`. History: 49 hosted, newest `20261022185832`.

**Archive preservation (release card).** The 10 tickets' original columns (`id, owner_id,
import_id, season, event_date, kind, label, legs, odds, stake_units, outcome, net_units,
provenance, source_record`) hash to `08863b44c629f2bf8e550794a86b2f49` before, between and
after both applies; the 3 imports keep `8e0fecd94aab390bf94827fd6146f195`. File 4 gave each
existing ticket `revision = 1`, no `price_input` and `updated_at` at the apply time.

**Step 7.**

| Function | md5(`prosrc`) = repo body | Execute |
| --- | --- | --- |
| `nba_private.preserve_archive` | `aedb74d8eac8ac2680d0752b088a8517` | `postgres` only |
| `nba_private.ticket_terms` | `1775eac0b739a981c3fccc26d25b453b` | `postgres` only |
| `nba_private.ticket_view` | `8b9af438e890b228f7b0c962bd796974` | `postgres` only |
| `gtl_nba_read_bets` | `e4f71cef19e20918c53f61a9b83dcb02` | `service_role` |
| `gtl_nba_save_bet` | `5da2a132343c9e9a1d32bdc9f64ae29a` | `service_role` |
| `gtl_nba_claim_games` | `f2a8ce30c561d9dedb4be6dace10fa63` | `service_role` |
| `gtl_nba_finish_games` | `afeed594711e205ba577a0a77d37f956` | `service_role` |

The four `gtl_nba_*` RPCs are security definer with `search_path=pg_catalog`, one row each.
`service_role` can execute exactly these four NBA functions; `anon` and `authenticated` none.
`bet_changes` (0 rows), `game_cache` (0 rows) and `game_provider` (one idle row) have RLS
enabled and forced and no app-role grants. The three immutability triggers are on
`bets`, `bet_imports` and `bet_changes`. The NFL score hash, ballots, Virtual Units and the
126 earlier `gtl_*` functions were unchanged after both files. Security advisors: the INFO
"RLS enabled, no policy" count went from 62 to 65 (the three new service-only tables); the two
existing warnings (`pg_net` in `public`, leaked-password protection) are unchanged and no new
warning appeared.

`BALLDONTLIE_API_KEY` was added by Sean as an Edge Function secret before the release
(name confirmed in the dashboard; the value was never read).

## Release of the dependent features

API v32 and Pages `9fb54fe4` already carry `/bets/read`, `/league/comparison` and
`/me/preferences` with their error mappings, so no deploy was needed for files 1–3. Signed-in
readback in Sean's Chrome:

- `POST /me/preferences` returned 503 on every call before the apply and **200** at 19:01:28 UTC.
- `POST /league/comparison` **200** at 19:02:40 UTC; Play → Compare players shows Week 6 with
  14 common scored games and player totals.
- `POST /bets/read` **200**: Week 7 published, 14 games, 9-player roster. No screen calls it yet;
  the Bets UI follows M-11.
- No `gtl-api` 4xx/5xx and no "CPU Time exceeded" in the function logs after 18:55 UTC.

## Rollback

New functions and tables only; nothing replaced an existing body. Off switches:
`GTL_FEATURE_OFF=bets`, `comparisons`, `preferences`. For NBA,
`supabase/rollback/20261021223000_gtl_nba_app_bets.sql` and
`supabase/rollback/20261021223100_gtl_nba_game_cache.sql` revoke the four RPCs and keep every
ticket, original source, revision, receipt, cached game and provider budget. Never drop: saved
preferences and NBA receipts are append-only player data.
