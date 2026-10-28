# Release card: trend builder frontend, then D-59 fantasy feed — October 28, 2026

Sean, October 28, 2026: "Deploy migration and deploy". This card covers what was on `main` and not yet live: the trend
builder frontend ([#285](https://github.com/seanbalz/guess-the-lines-repo/pull/285)) and D-59
([FANTASY_FEED_RELEASE.md](FANTASY_FEED_RELEASE.md)): the `fantasy-feed` bucket migration and the
`gtl-fantasy-ingest` worker.

## Release 1: frontend

- **Source:** `main` at **`0e4289a24953fbe0eddba6eb3453fcddfb3d6424`** (#285 trend builder; #284 docs and tests only).
  Main push CI on this exact SHA: Tests 40640962835, Dashboard checks 40640962772, Brand QA 40640962776, all success.
- **What ships:** #285, the saved-trend builder on Trends and its Home summary, from the bundled
  `shared/trends/builder-history.json` (finals and closing consensus of completed games only).
- **API:** not deployed; no file `gtl-api` serves changed since v39 (`4426994`).
- **Migrations:** none in this run. Expected hosted history **63 rows,
  `8a02c480d273a532082411166e08f794a9b71ca6636028adfad09709adee91bb`**.
- **Compatibility:** frontend only; reads nothing new from the API.
- **Rollback:** redeploy the frontend from `a2ccf23` (Pages `7b7dbabd-4fbb-4c47-b627-c7e9712513c5`).

## Release 2: D-59 migration (Gate M)

- **File:** `supabase/migrations/20261026220000_gtl_fantasy_feed_bucket.sql` at `0e4289a`, applied after Release 1
  verifies, in one transaction with its history row, through Sean's signed-in Supabase SQL editor (the October 22
  route). It creates the private `fantasy-feed` bucket (JSON only, 10 MiB) and no storage policy; it refuses to run if
  storage row level security is off or any storage policy exists.
- **Rollback:** the bucket is empty until the first upload; `delete from storage.buckets where id = 'fantasy-feed'`
  while empty, with its history row, only on Sean's OK.

## Release 3: `gtl-fantasy-ingest`

- Needs a `fantasy-ingest` release target (follow-up PR). Without `GTL_FANTASY_FEED_UPLOAD_SECRET` the endpoint
  answers 503 to everyone; Sean sets that secret himself (FANTASY_FEED_RELEASE.md step 3).

## Results

- **Readiness (frontend)** [run 40691164511](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40691164511)
  and **frontend** [run 40691813232](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40691813232) from
  `0e4289a`, gates approved through the GitHub API as Sean's account after each title matched; verified **13:01:07 UTC
  on October 28**: Pages **`7cca458b-b44f-47c0-a163-f47eb0adc316`** (was `7b7dbabd`), 109 assets per URL, frontend
  SHA-256 `697e0a0981721706a902c46740f8aec0cdd403f0f24d9c1017c417339ffc4c17`. `gtl-api` v39 (`bec3b634…`) and the
  history `8a02c480…` (63 rows) unchanged. 378 signed-out probes, 378 denied, none awaiting.
- **D-59 pre-checks (read-only, about 13:03 UTC):** storage row level security on for `buckets` and `objects`, 0 storage
  policies, 0 buckets. The file at `0e4289a`, fetched from GitHub in the SQL editor tab: 1404 bytes, SHA-256
  `276321763a2d2228aab41327a819795a8ef44980146383d1e9fb147d8f48cf27`, equal to the repo copy. The first attempt to load it
  into the editor was refused by the session's safety check until Sean approved the route by name.
- **D-59 applied** on Sean's "Approved: apply D-59 (20261026220000_gtl_fantasy_feed_bucket.sql) through the Supabase SQL
  editor in my signed-in Chrome, then deploy gtl-fantasy-ingest." The file (re-fetched and re-hashed, same SHA-256) and
  its history insert ran as one query in that editor: "Success. No rows returned." Hosted as **`20261028131021`**,
  `gtl_fantasy_feed_bucket`, created by `sbalsiger2@gmail.com`, one statement with md5
  `2794c668 07a2a1f6 63709f55 0b235208` (equal to the file's). Read-only readback: `fantasy-feed` is the only bucket,
  `public` false, `file_size_limit` 10485760, `allowed_mime_types` `{application/json}`; 0 storage policies. Hosted
  history **64 rows, `f39312113403e9b1dadc0f0331dda441686ff8a3723d5410ac087ac43eb46ad4`**. `tests/migrations.mjs` moves
  20261026220000 to `APPLIED`; 20261027160000 stays in `NOT_HOSTED`.
- **Not verified:** signed-in use and real phones. The bucket is empty; the access probes wait for the first upload
  (FANTASY_FEED_RELEASE.md step 5).
