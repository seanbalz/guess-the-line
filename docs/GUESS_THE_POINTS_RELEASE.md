# Guess the Points release card (D-56)

Prepared October 23, 2026 (Pacific) on Sean's instruction to release, deploy and merge
every open item. Sean approved applying both Points migrations through the Supabase SQL
editor in his signed-in Chrome, then the API and frontend release.

- Source SHA: `1efd802bea78d298b1c30ede7824b6a6213c23aa` (`main`, after
  [PR #199](https://github.com/seanbalz/guess-the-lines-repo/pull/199) (routes and screens),
  [PR #203](https://github.com/seanbalz/guess-the-lines-repo/pull/203) (P-02 feed and
  reminders, P-01 kickoff fix),
  [PR #204](https://github.com/seanbalz/guess-the-lines-repo/pull/204) (Bets › Everyone) and
  [PR #205](https://github.com/seanbalz/guess-the-lines-repo/pull/205) (Fantasy schedule)).
- Target and order: both migrations first (done, below), then `api-and-frontend`: the
  workflow deploys `gtl-api` first, then Pages, from the same SHA.
- API change since `gtl-api` v35 (source `0bd4f1a`): new signed-in `POST /points/read`,
  `/points/draft`, `/points/lock` and `/points/slate` (`cloud/points.mjs`, wired in
  `cloud/handler.mjs`, with the `GTL_FEATURE_OFF=points` switch in `cloud/feature-off.mjs`);
  `cloud/community.mjs` reads the two new feed kinds `points_played` and `points_final`;
  `shared/points-slate.mjs` canonicalizes kickoffs. No other API source changed.
- Frontend change since Pages `78909363` (source `0bd4f1a`): the Guess the Points ballot and
  board in the new app (`web/src/next/play/points/*`, Play, League board, router, info),
  Points feed wording in both apps (`web/src/communityFormat.js`, `CommunityHome.jsx`,
  `LeagueScreen.jsx`), and Bets › Everyone (`web/src/next/bets/*`, frontend only; reads
  the hosted `/bets/read`).
- Not in this release: `gtl-push-reminders` (the Points reminder pass in
  `cloud/push-reminders.mjs`). The release workflow deploys only `gtl-api` and Pages, and
  this PC has no Supabase CLI login of Sean's, so that worker is deployed separately from
  the Mac mini. Until then the deployed worker skips Points reminders; Spread and Total
  reminders are unchanged. P-03 (Points schedule and jobs) is not written yet.

## Migrations (applied October 23, 2026, 17:00–17:04 PT)

Applied one at a time in the Supabase SQL editor in Sean's signed-in Chrome (role
`postgres`). Each run held the exact file, fetched from GitHub at `4a8d250` and checked
against its SHA-256 before running, plus its `supabase_migrations.schema_migrations` row.

| Order | Repository file | SHA-256 | Hosted version |
|---|---|---|---|
| 1 | `20261023180000_gtl_points_core.sql` (P-01) | `05c9ebe093d0718c403de90ef77a6a6dd8a8bcf80cdc51eed475efcc26d507aa` | `20261024000059` |
| 2 | `20261023190000_gtl_points_feed_push.sql` (P-02) | `eda24282751dcb84785d5c4ffb8b993f5031c1da36775ef835a46b88b8945b81` | `20261024000315` |

Gate M evidence (read-only checks through the `supabase-gtl` connection unless noted):

- Step 1: 51 hosted migrations before, digest
  `bd9da17ade5d3f6a98924270c88174b0ced7d4740102bd4e62c762f8e22d3b17` (unchanged since
  October 22), newest `20261022194209`. After: **53, digest
  `300257804ccaa7c09d7ab3895ddb7221a5bacb2a44ce2ab6b6516bcc83cd4a2e`**. Each new row's
  stored statement has the file's SHA-256 and `created_by` `sbalsiger2@gmail.com`.
- Step 4: no Points table or function existed; the replaced dispatcher
  `gtl_dispatch_push_reminders()` had md5 `23bd057f95682163604a15cdf87086df` as P-02
  requires; the three constraints P-02 widens had the expected names and lists.
- Step 5 and 7, score hash (Sean's SQL editor, `postgres`): md5 over every 2026 ballot
  (user, season, week, mode, summed `gtl_ballot_pick_scores` points, scored count),
  25 ballots, `dbf6b85f7c5d1a5e47edba8797160762` before P-01, after P-01 and after P-02.
  Week 5 Spread anchors present: Sean 95.80, Steven 91.40, Ben 37.60.
- Preservation (count and ordered whole-row md5), identical before and after both:
  weekly ballots (25), weekly versions (13), social commits (103), social weeks (3),
  leagues (5), memberships (9), profiles (9), Virtual Units picks (7) and settlements
  (30), personal events (32), receipts (32) and versions (7), ruled imports (1), feed
  posts (99) and comments (3), push schedule (1), push subscriptions (0) and reminders
  sent (0). The 136 existing `gtl_` functions (definition, config and grants) were
  unchanged after P-01; after P-02 the only changed one is the dispatcher.
- Step 7, P-01: 6 tables, row-level security on, `service_role` only (no delete), no
  `anon` or `authenticated` privilege; 20 functions, one row each, every md5 equal to
  `node scripts/migration-functions.mjs --latest` at `4a8d250`, security invoker with
  an empty `search_path`, none executable by `anon` or `authenticated`.
- Step 7, P-02: `gtl_feed_points_played_post` `e064bb99…`, `gtl_feed_points_final_post`
  `f19ebc1d…` (no execute grant), `gtl_points_reminder_candidates` `8a719dcc…` and
  `gtl_mark_points_reminder` `3ea5a5b8…` (`service_role` only), dispatcher `c0b7ed39…`
  (ACL unchanged, `postgres` only); both triggers enabled; the three checks now allow
  `points_played`/`points_final`, `guess_points` and `points_next_2h`.
- Security advisors: no new warning. "RLS enabled, no policy" (INFO, by design) rose
  from 65 to 71 for the six Points tables; the two warnings (`pg_net` in `public`, leaked
  password protection) predate this release.

## Compatibility

- The API before or after the migrations is safe: without P-01 the Points routes answer
  404 "Guess the Points is coming soon." (`cloud/points.mjs`, `cloud/handler.mjs`); the
  old API never calls them. `cloud/community.mjs` drops unknown feed kinds, so the old
  API ignores Points posts and the new API on an older schema never sees them.
- Pages goes last: the new screens call routes that exist from this API deploy on.
- Until a commissioner publishes a slate, `/points/read` answers the empty
  (`unopened`) state and Play shows that no Points week is open.
- The dispatcher's not-due test now also opens a run when a published, non-final Points
  slate has a slot kicking off within two hours; with no slate published its behavior
  is unchanged.

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Main CI on the exact SHA | [Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40045090231), [Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40045090207), [Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40045090241) | All passed on the `push` runs |
| Check-only and readiness | Folded into the deploy run (Sean: "expedite"); the deploy repeats both. Hosted readiness at 00:30:31 UTC ([40045245964](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40045245964), on `eda1da2`) read 53 migrations and the digest above | Passed |
| Deploy | [40048239489](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40048239489) | In progress |

## Rollback

- API: redeploy `gtl-api` from `0bd4f1a` (v35 source). `GTL_FEATURE_OFF=points` stops
  the three writers without a redeploy (`/points/read` keeps working); setting it is a
  hosted secret change and needs Sean's OK.
- Frontend: restore Pages `78909363` (source `0bd4f1a`).
- P-01: replaces nothing; the off switch is the rollback. Nothing is dropped.
- P-02: `supabase/rollback/20261023190000_gtl_points_feed_push.sql` (SHA-256
  `ac6532c672cae13344f58a19ca27ca78c44cbbbb5d776ce83da74833b9eea2bf`) restores the previous
  dispatcher body; the widened checks, triggers and functions stay.

## Approval

- Sean, October 23, 2026: "release and deploy and merge any open item", then "Yes, via
  my Chrome" for applying both migrations through the Supabase SQL editor before the API
  and frontend release.
