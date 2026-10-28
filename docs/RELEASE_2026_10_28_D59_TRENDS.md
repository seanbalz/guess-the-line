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

Pending.
