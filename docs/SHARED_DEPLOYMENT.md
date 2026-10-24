# Guess The Line shared production releases

Owner: Sean Balsiger · Version 1 · October 15, 2026

The manual **Shared production release** workflow gives a local or online agent
the same release path: an exact GitHub commit, successful CI, Sean's production
environment approval, a fresh hosted preflight, and recorded deployment evidence.
Committing and pushing source remains separate from deploying it.

On October 15 the `production` GitHub environment was created and read back with
Sean (`seanbalz`) as required reviewer and a branch policy allowing only `main`.
Self-review is allowed so Sean can dispatch and approve his own release. The
five public configuration variables below were also populated and read back.
Both dedicated secret names were present on October 20. Actual protected readiness
and an API-only deployment succeeded October 16; the frontend upload succeeded but
its verifier rejected canonical HTML redirects. The historical failed run remains
failed. See [the verifier repair record](DEPLOYMENT_VERIFIER_RELEASE.md) for the
reconciled fix and successful October 21 UTC protected source, readiness and
frontend deployment runs. Release 39521335125 verified 95 assets at both URLs;
credential presence alone is not proof of current access.
An administrator can change environment protections; this is an approval gate,
not a claim that administrators cannot override repository settings.

## What the workflow can do

| Mode | Credentials | Result |
| --- | --- | --- |
| `check-only` (default) | GitHub's read-only job token | Checks source identity and successful exact-commit CI. No production environment approval or deployment credentials are requested. |
| `readiness` | Protected environment secrets, after approval | Builds and scans the frontend, reads hosted schedule and migration history, validates fresh published schedule evidence and probes signed-out boundaries. Produces the migration-history digest for review; does not deploy. |
| `deploy` | Protected environment secrets, after approval | Repeats readiness, compares the reviewed migration digest, deploys the selected component(s), then verifies metadata, boundaries and served frontend bytes. |

Targets are `frontend`, `api`, or `api-and-frontend`. The combined target deploys
only `gtl-api`, then only `.local/cloud-dist` to the existing Pages production
project. Choose it only when that order is compatible. A reply-shape change that
needs tolerant Pages first uses two separately approved runs, frontend then API.
There is no automatic deploy on push, pull request, merge, or schedule.

The workflow does not apply SQL, run `db push`, deploy collector functions,
change cron schedules or data budgets, or flip the default app. Existing
[Gate M](REDESIGN_BUILD_PLAN.md#42-gate-m-applying-a-migration) and
[Gate D](REDESIGN_BUILD_PLAN.md#43-gate-d-deploys) remain binding. This shared path
replaces the requirement to hold CLI logins on the Mac mini for these two release
targets: protected API and frontend runs are now verified. Existing dated
release records remain historical evidence of the Mac mini releases.

## One-time configuration

In repository **Settings → Environments → production**, keep the required
reviewer and `main` branch policy, then add these values. Configuration is
allowlisted and checked against the existing production project/account.

| Kind | Name | Value or scope |
| --- | --- | --- |
| Variable | `SUPABASE_PROJECT_REF` | `onmrgvcehkflfaizvedl` |
| Variable | `VITE_SUPABASE_URL` | `https://onmrgvcehkflfaizvedl.supabase.co` |
| Variable | `VITE_SUPABASE_PUBLISHABLE_KEY` | Existing public `sb_publishable_…` browser key; not a service-role key |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | `83bd659d712e968e7a61efa14107465a` |
| Variable | `CLOUDFLARE_PAGES_PROJECT` | `guess-the-line` |
| Secret | `SUPABASE_ACCESS_TOKEN` | A dedicated project-scoped token permitting database read-only preflight and Edge Function read/deploy. Required even for frontend readiness because the schedule/history gate is hosted. |
| Secret | `CLOUDFLARE_API_TOKEN` | Dedicated Cloudflare Pages Edit token for this account; required for frontend or combined releases, not API-only releases |

Create dedicated tokens in the providers' secure interfaces, then enter them
directly into GitHub environment secrets. Do not paste them into a task, commit
them, copy another project's stored login, or use `VITE_` names for secrets.
Build/install steps receive public variables only; provider secrets are scoped
to the steps that use them. The CLI versions come from committed
`package-lock.json`; the workflow uses the same pinned action major versions as
existing CI. It never installs `latest` deploy tools.

## Run a release

1. Merge the reviewed source to `main`, fetch it locally where needed, and wait
   for **Tests**, **Dashboard checks** (including Persona suite and the four
   Cloud browser suite shards), and **Brand QA** to pass on that exact full SHA in
   their `push` runs. A passing PR merge-test or different commit is insufficient.
   The latest run and every required job must succeed; skipped jobs do not count.
   Each `main` commit gets its own runs, so a later merge neither queues nor
   cancels an earlier commit's checks.
2. In **Actions → Shared production release → Run workflow**, select branch
   `main`, mode `check-only`, the full SHA and the intended target. Review its
   source report. A clean source SHA reachable from `main` is required. Local
   branches or files that were never pushed cannot be released here.
3. Once secrets/variables are configured, dispatch `readiness` for the same SHA
   and target, and approve its production environment job. Review the report's
   `migrationHistorySha256`, pending repository migrations, schedule validation result,
   CI links and boundary results. Missing configuration reports names only.
4. Prepare a repository issue, PR or committed release card that names the full
   source SHA, target/order, expected hosted migration state and digest, pending
   migrations, compatibility evidence, rollback/off switch, and Sean's approval.
   The digest detects history drift; it does **not** prove SQL function bodies,
   grants or compatibility. Perform the existing migration/release checklist
   where the change requires those checks. Never interpret a green source test
   as permission to apply a pending migration.
5. Dispatch `deploy` on `main` with that SHA, target, release-card URL, reviewed
   migration digest, and `compatibility_reviewed` checked. The production job
   displays the SHA and target for review before credentials are released. It
   rechecks source/CI after approval and takes a fresh hosted snapshot immediately
   before deploying. No new source is silently substituted if `main` advances.
6. Review every step and the allowlisted release evidence artifact. Record the
   workflow URL, source SHA, manifest digests, Pages ID, API version/hash, pending
   migrations, checks and limits in a dated `docs/RELEASE_*.md` record. Commit and
   push that evidence through the ordinary PR path; the workflow cannot write to
   the repository. Complete the release's signed-in/phone acceptance separately.

Runs share a production concurrency group and do not cancel an active release.
Avoid concurrent manual Mac deployments or hosted migration changes. GitHub may
replace an older pending run when another is queued; review the actual run ID.

## Schedule evidence and failure behavior

The hosted query reads only migration names/versions and the two newest
published slates' times, including the previous week's Monday carryover. It
does not read player picks, names, contacts or tokens. It uses Supabase's
dedicated read-only endpoint and refuses missing, malformed or stale data.

Sean permanently removed calendar and game-window release restrictions on
October 19, 2026. The preflight still rejects missing, malformed or stale published
schedule evidence, but active games, kickoff buffers, weekdays and DST dates do
not block deployment. Its report contains `schedule.timeRestrictions: false`.
The 20-minute job timeout remains an execution limit, not a quiet-window gate.
Production concurrency and every source, compatibility, privacy and data check
remain required. This policy does not change player pick deadlines or locks.

The existing default boundary checker allows explicitly documented pending
migration probes and lists them as awaiting deployment. These are not successful
denials and are included in the evidence. This workflow does not claim strict
redesign rollout completion or route existence from a signed-out gateway denial.

A failed job can follow a successful API or Pages deployment. Inspect provider
state and the artifact before retrying. The workflow verifies other Edge
function versions/configuration and migration history stayed unchanged; it does
not hash all player data or automatically roll back production. Use the release
card's reviewed recovery plan. Frontend verification compares every served
manifest asset at both the immutable deployment URL and production URL. HTML uses
canonical paths (`index.html` to `/`, `privacy.html` to `/privacy`, nested index
files to their directory). Unexpected redirects remain rejected and every response
must match its artifact hash. `_headers`
and `_redirects` are configuration, not served assets.

API verification records the hosted `ezbr_sha256` bundle digest and requires
exactly one version increment after the pinned CLI command. It verifies ACTIVE
status and JWT verification, but does **not** independently match the hosted
API bundle's bytes to the source checkout. The report explicitly sets
`apiSourceVerified: false`; the bundle digest alone does not prove source
equivalence. Review API provenance and record this limitation before accepting
an API release. The workflow cannot exclude an out-of-band deployment merely by
observing metadata. Frontend asset equivalence is independently checked.

Artifact retention is 30
days, so durable evidence belongs in the repository release record.

## Local guard checks

```sh
node --test tests/release-preflight.test.mjs
node scripts/release-preflight.mjs --help
```

The `configuration` command reports missing variable/secret **names** without
printing values. Set `RELEASE_SHA`, `RELEASE_TARGET` and `RELEASE_MODE=check-only`
to use it without credentials. `source` additionally needs a clean checkout at
the requested SHA, a freshly fetched `origin/main`, and network access to GitHub
(an optional `GITHUB_TOKEN` helps authenticated API limits). These commands never
deploy. `live` and `verify` use explicitly supplied environment credentials and
never load local login stores or `.env` files automatically.

Sources checked October 15, 2026:
[GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments),
[workflow runs API](https://docs.github.com/en/rest/actions/workflow-runs),
[Supabase read-only query API](https://supabase.com/docs/reference/api/v1-read-only-query),
[Supabase function deployment](https://supabase.com/docs/guides/functions/deploy),
[Supabase scoped tokens](https://supabase.com/changelog/scoped-personal-access-tokens-ga),
[Cloudflare Pages direct upload](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).
