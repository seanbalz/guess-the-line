# Fantasy feed release card (D-59)

Drafted October 26, 2026. **Step 2 done October 28** (Sean: "Approved: apply D-59 … through the Supabase SQL editor in
my signed-in Chrome, then deploy gtl-fantasy-ingest"); each other hosted step below waits for Sean's OK at the time. Sean's instruction: "Use the fantasy-feed bucket. Draft the migration plus a
gtl-fantasy-ingest function with its own upload secret on a task branch; apply nothing live."

## What it adds

- **Migration** `20261026220000_gtl_fantasy_feed_bucket.sql` (applied October 28, 2026, hosted as `20261028131021`;
  see [RELEASE_2026_10_28_D59_TRENDS.md](RELEASE_2026_10_28_D59_TRENDS.md)): one private
  Storage bucket, `fantasy-feed`, JSON only, 10 MiB per object. It adds **no storage policy**.
  Row level security on `storage.objects` then denies anon and authenticated everything in the
  bucket, and only `service_role` reaches it. Before inserting, the file checks that row level
  security is on for both storage tables and that **no storage policy exists at all**. GTL had
  no Storage objects before this, and a policy written for another bucket could also match
  this one. If either check fails, nothing is created. A second apply fails on the duplicate
  bucket instead of keeping settings this file did not write. The check runs once, so a repo
  test also fails if any later migration adds or changes a storage policy, relaxes storage row
  level security or writes `storage.buckets`.
- **Function** `gtl-fantasy-ingest` (`verify_jwt = false`, `cloud/fantasy-feed-ingest.mjs`): a
  machine-only `POST` for Sean's fantasy exporter. It requires
  `Authorization: Bearer <GTL_FANTASY_FEED_UPLOAD_SECRET>`, a 64-character lowercase hex value
  compared without early exit. A missing or malformed secret leaves the endpoint closed (503).
  The function validates the file, then stores the validated value re-serialized (never the raw
  request bytes) once under its full SHA-256, never replacing it, and updates
  `<season>/index.json`. It returns only a status, path and hash.
- **Off switch** `GTL_FEATURE_OFF=fantasy-feed`: uploads refuse with 503 and every stored file
  stays. Supabase function secrets are project-wide, so the ingest function reads the same
  `GTL_FEATURE_OFF` value as `gtl-api`.
- **Not in this branch:** the signed-in `gtl-api` read route, the app's Fantasy views and the
  exporter in `seanbalz/fantasy-football`. Nothing here serves feed data to any player yet.

## Feed file contract

One JSON object with exactly `schemaVersion` (1), `feature`, `season` (2020–2100), `week`
(1–22, or `null` for a season-long file), `generatedAt` (ISO time with `Z` or an explicit
offset, at most 5 minutes ahead), `sources` (1–20 of `{ name, url?, license? }`, with HTTPS
URLs and no credentials) and `data` (an object or array, nested at most 64 levels, finite
numbers only).

The audience is fixed by feature in `FEED_FEATURES`. It is never read from the file:

| Feature | Audience | Contents |
| --- | --- | --- |
| `usage` | community | nflverse-derived usage (CC BY 4.0) |
| `usage-ecr` | owner | FantasyPros ECR, projections, grades and roster % (licensed) |
| `rankings` | owner | per-source expert ranks |
| `leagues` | owner | Sean's league tools output, rosters and owners |
| `draft` | owner | draft and SHFL intel (real names) |

`owner` means Sean's account by user id, not the commissioner role. The read route will
enforce that, working out the audience from the feature, never from the index.

**Community files are allowlisted.** A `usage` file's `data` is `{ <table>: { cols, rows } }`,
the usage dashboard's own columnar shape. Only the tables and columns in `USAGE_TABLES` are
accepted: `players`, `tw`, `games`, `pw`, `dw` and `kw`, each with its current
nflverse-derived columns. Every row must be an array of scalars in column order. Adding a
column is a reviewed change to this repository that widens who sees it. On top of that, no
key or string in a community file may be an email address or an owner-only name. Names are
split into words first, so `rank_ecr`, `fpEcr`, `ECRRank`, `r2p_pts`, `owners_real_names`,
`manager_id`, `user_id` and a bare `display_name` are all refused. `player_display_name` is
public nflverse data and passes. Owner files keep any shape.

**What the exporter must split.** The dashboard's `core.js` bundles three audiences. `players`,
`tw` and `games` go in `usage` with the `pw`, `dw` and `kw` files. `fp` (`ecr`, `pr`, `proj`,
`grade`, `owned`) goes in `usage-ecr`. `rosters` and `meta.leagues` go in `leagues`. Checked
locally against the real 2025 files: the six community tables (2.7 MB) validate in about 60 ms,
and adding `fp` or `rosters` is refused.

Objects are stored at `<season>/<feature>/<season>-<feature>[-week-NN].<sha256>.json`. The
index lists the current file per feature and week, plus the three newest superseded copies of
each. Superseded objects are never deleted. The index is rewritten only by this function, with
each entry's audience set again from `FEED_FEATURES`, and it is written and read back with
`Cache-Control: no-cache`. An index it cannot recognize (an unknown feature, another season, a
bad hash, or a path this function would not give that file) is never overwritten (503). The
exporter is a single writer: Storage has no conditional write, so concurrent uploads could drop
an index entry until the next upload of that feature.

## Hosted steps, each needing Sean's explicit OK at the time

1. **Merge.** PR into `main`, with review and CI. The migration stays in `NOT_HOSTED` until it
   is applied.
2. **Apply the migration (Gate M).** Fetch the file from GitHub at the merged commit and check
   its SHA-256, then apply it in one transaction with its history record, as in the
   October 22 apply route. Its own guard is the pre-check. If the hosted `postgres` role may not
   insert into `storage.buckets`, the apply fails and nothing changes. Then run these read-only
   checks:
   ```sql
   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'fantasy-feed';
   select count(*) from pg_policies where schemaname = 'storage';  -- expect 0
   ```
   Move the version to `APPLIED` in the apply record. The bucket is empty until step 5, so the
   access probes wait for that step.
3. **Set the secret** on the Mac mini, keeping the value off the command line and out of shell
   history:
   ```bash
   umask 077 && printf 'GTL_FANTASY_FEED_UPLOAD_SECRET=%s\n' "$(openssl rand -hex 32)" > ~/gtl-fantasy-feed.env
   ```
   ```bash
   supabase secrets set --project-ref onmrgvcehkflfaizvedl --env-file ~/gtl-fantasy-feed.env
   ```
   Then append that one line to the fantasy repo's ignored `.env` and delete
   `~/gtl-fantasy-feed.env`. Never commit the value or paste it into chat.
   - **Rotate:** repeat both commands with a new value, update the fantasy `.env`, and redeploy
     the function so no warm instance keeps the old value. The old value stops working then.
   - **Revoke:** `supabase secrets unset GTL_FANTASY_FEED_UPLOAD_SECRET` and redeploy. The
     endpoint then answers 503 to everyone. `GTL_FEATURE_OFF=fantasy-feed` also stops uploads,
     but that secret is shared with `gtl-api`, so keep its other entries.
4. **Deploy** `gtl-fantasy-ingest` from the Mac mini at the merged commit. Then add
   `['fantasy feed upload', 'gtl-fantasy-ingest', {}]` to a boundary area's `workerChecks`, so
   `npm run check:cloud` keeps proving that no-token and wrong-token uploads get 401. It is not
   listed before the deploy, because a missing function would fail the default check.
5. **First upload and access probes.** A dry run from the exporter, then one `usage` file,
   checking the stored SHA-256 and the index. Then probe the stored file and the index, once
   with only the publishable key and once as a signed-in player:
   - `GET /storage/v1/object/fantasy-feed/<path>`, `/storage/v1/object/authenticated/fantasy-feed/<path>`
     and `/storage/v1/object/public/fantasy-feed/<path>` must not return the object;
   - `POST /storage/v1/object/list/fantasy-feed` must list nothing;
   - `GET /storage/v1/bucket` must not list `fantasy-feed`.

   Record the exact answers, then add them as a lasting `check:cloud` probe in the same change
   that records the hosted versions.

## Open before release

- Confirm the Edge Function request-size and CPU limits on the project accept the largest feed
  file (the 2025 usage tables are about 2.7 MB re-serialized). The code caps at 8 MiB.
- Confirm on the hosted project that a `Cache-Control: no-cache` index write and read never
  serve a stale index. If they can, move the index to a service-only Postgres table with a
  compare-and-swap update, which also removes the single-writer limit.
- Find out who holds `commissioner` in `sean-troy-luke` before the read route ships. The owner
  gate pins Sean's user id either way.
- The `pw` and `kw` tables carry an `shfl` points column (league scoring applied to public
  stats). It is in the community allowlist as the usage tracker shows it today.
