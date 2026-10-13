# Guess The Line — shared access setup

Owner: Sean Balsiger · Updated October 12, 2026 · Provisional GTL brand system

**Web push (D-28), not live:** the opt-in reminder 2 hours before picks lock is in the repository, but its migration, `gtl-push-reminders` function, VAPID secrets and cron job wait for Sean; see [WEB_PUSH_SETUP.md](WEB_PUSH_SETUP.md).

**Current release — Pages `06c71c14` / API v15** (October 12, 2026, from `main` at `17c22b5`; see [RELEASE_2026_10_09.md](RELEASE_2026_10_09.md)). **The October 8 release — Pages `2106725d` / API v14:** the frontend and authenticated
API were deployed with JWT verification enabled. Six migrations add Solo,
reviewed quote selections, submission-time scoring, reviewed final results,
fresh-submission odds and social Bet Tracker. The release passed 368 Node checks,
29 local browser checks, 79 cloud-style browser checks and 130 live access-denial
checks. Local port 4173 serves the exact production assets. See the
[October 8 release record](RELEASE_2026_10_08.md) for release evidence and limits.
Earlier pending-decision, local-only and release statements below are historical;
they do not override this current delivery status or close unrelated roadmap work.

## Verified resources

- Supabase organization **Gambling**, `bwehnxbvskmplsjagaki`, Free plan.
- Existing project **seanbalz's Project**, `onmrgvcehkflfaizvedl`, healthy in
  `us-east-1`. Its dashboard links to `seanbalz/guess-the-lines-repo`.
- Migration `20261008164249_gtl_private_cloud_state.sql` applied; original
  15-game spread ballot and three snapshots imported without overwriting source
  files. Dallas remains -9.5. The initial cloud revision was 0. Sean's game email was
  confirmed and its verified Auth identity explicitly linked to the active
  `sean` commissioner membership. Troy and Luke are now linked to their reserved player slots.
- `gtl-api` Edge Function version 14 deployed, with platform JWT verification
  enabled. The release passed 130 live access-denial checks. Earlier anonymous
  raw-table reads and missing/invalid-session API calls returned 401. Sean's
  previously verified Auth confirmation/sign-in event and roster mapping are
  verified. Earlier release checks showed Sean signed in with all 15 spread
  picks and the unofficial 96.4/150 historical score; that is not a new D-16
  score. Profile, game creation, invitation writes and Steven's real 15-pick
  submission were previously verified. Current signed-in production readback
  showed the saved Spread/Total ballots, separate saved/current sportsbook
  references and shared betting views. Second-device verification remains open.
- Cloudflare personal account `83bd659d712e968e7a61efa14107465a` has verified
  browser and deployment access. The site is live at
  [guess-the-line.pages.dev](https://guess-the-line.pages.dev), deployment
  `2106725d`, including submission-time scoring, fresh-source handling, Solo,
  reviewed selections/results and the shared betting dashboard. Only the compiled frontend was uploaded.
  The machine's previously stored CLI login belongs to a different account;
  `scripts/cloudflare.mjs` isolates this project's login and fixes the target
  account. It does not change the existing login.
- The following six release migrations were applied, in order:
  `20261008224444_gtl_personal_workspace.sql`,
  `20261008224735_gtl_reviewed_quote_selections.sql`,
  `20261008225401_gtl_submission_time_scoring.sql`,
  `20261008225607_gtl_reviewed_final_results.sql`,
  `20261008232055_gtl_fresh_submission_odds.sql`, and
  `20261009005145_gtl_social_bet_tracker.sql`.

## Architecture and access

Cloudflare Pages serves only `.local/cloud-dist/`. The browser uses Supabase
Auth, then calls `gtl-api` with its user session. Group routes check that session
and active account-to-roster membership before returning the permitted player/mode
view. Solo records are account-private; deliberately shared Bet Tracker records
are available to signed-in players without requiring group membership.
Browser-supplied player IDs cannot select another account's private view.

`gtl_leagues` stores the private league state and revision. `gtl_memberships`
maps verified Auth user IDs to approved roster spots. Canonical weekly ballots and
selections are keyed by the Auth user, season and week, with one shared revision.
All 32 inspected private tables have RLS. The release inventory found zero direct
browser-role table grants and zero browser-callable GTL database functions; the
server alone accesses these private resources. Informational
`rls_enabled_no_policy` advisories describe this intentional deny-by-default setup,
not public access. See the
[linter explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
No service credential is stored in frontend configuration. Edge Functions use
their platform-provided server environment.

Each game save must match the latest account/week revision. A transactional RPC
locks that revision and rejects stale saves with 409; refresh merges untouched fields while preserving
the player's unsaved changes for review. Picks, quote immutability, deadline
checks, independent mode reveals, and revision audits use the same portable
engine as the local preview. There is no public raw-state endpoint.

## Build and local review

`.env.cloud` is ignored by Git and contains only the project URL and publishable
key. Use `.env.example` as a template on another checkout. Both values are required.
Leaving both unset keeps the existing local owner preview; incomplete cloud
configuration blocks the app instead of silently falling back.

```sh
npm run build:cloud
npm run preview:cloud
npm run check:cloud
npm test
npm run test:browser
npm run test:cloud-browser
```

The cloud preview at `http://127.0.0.1:4173` serves the exact production assets and
uses the same hosted account data when signed into the same account. This is
separate from the local owner preview: its JSON storage does not sync to cloud.
Theme/layout preferences remain device-local and unsaved drafts remain tab-local.
The import script writes owner-only recovery files under `.local/`, imports
existing local state if present, and never overwrites an existing cloud league.
It is a one-time migration aid, not continuous synchronization.

## Remaining acceptance work

1. Sean's real sign-in and authenticated dashboard read are verified. Do not
   create a duplicate account or ask for a password in chat.
2. Profile/game/invitation writes and Steven's real submitted spread ballot are
   verified. A second physical device and simultaneous hosted-database saves
   remain unverified. Do not fill real ballots with test guesses.
3. Steven’s confirmed account has joined, and Troy and Luke are linked to their
   fixed roster memberships. General confirmation/recovery delivery still needs
   acceptance checks for future player onboarding.

The personal Cloudflare authorization is complete, with account/profile read,
Pages write, and background access. Existing machine credentials were untouched.
Supabase's Site URL and its one exact allowed redirect are both
`https://guess-the-line.pages.dev`; dashboard readback after reload confirmed
both settings. No wildcard redirect or email-confirmation bypass was added.

For later deployments after review and checks:

```sh
npm run build:cloud
npm run check:cloud
npm run cloudflare -- pages deploy .local/cloud-dist --project-name guess-the-line --branch main --commit-dirty=true
```

The pinned CLI initially tried to delegate creation to Workers; the new Pages
project was created using its documented fallback in the installed CLI. The
existing Pages project now deploys normally. Account targeting is enforced by
the wrapper's environment because Pages rejects `account_id` in its config file.

Supabase's default email service is limited to organization team addresses and
is not ready for ordinary player invitations. See
[email restrictions](https://supabase.com/docs/guides/auth/auth-smtp).
The Free plan can pause after inactivity and does not include automatic backups;
use player exports and private owner backups. See
[plan details](https://supabase.com/pricing). No paid service was activated.

## Google sign-in — code ready, provider not switched on (October 12)

Sean decided on October 12 that Google sign-in is how new players sign up and
recover access, because the built-in mailer only reaches team addresses. The
frontend has a **Continue with Google** button above the email form; email
sign-in is unchanged. Until the Google provider is enabled in the Supabase
dashboard, the button shows a plain "not switched on yet" message. Sean's
click-by-click Google Cloud Console and Supabase steps, the redirect allow-list
check and the post-deploy verification are in
[GOOGLE_SIGN_IN_SETUP.md](GOOGLE_SIGN_IN_SETUP.md). The client secret is never
stored in the repository or shared in chat.

## Historical validation and release evidence

October 8: 43 Node engine/API tests passed, six existing browser workflows
passed, and three new mocked cloud browser tests passed. Both frontend builds
passed. The sign-in screen was reviewed at 320px; brand tokens and provisional
identity remain intact. Mocked tests use fake accounts and intercept external
traffic; they do not prove live email delivery or real player persistence.
The remote anonymous-access checks and private import readback were verified
separately. Original picks and snapshot files remain unchanged.

The live HTTPS page and compiled assets load correctly; HTTP redirects to HTTPS.
CSP, frame denial and MIME safeguards were verified. Seven private-path probes
returned only the public HTML shell, not raw source/data; published assets had
no detected private-state, server-secret or source-map signatures. The real
signup form was opened for Sean, but no account or confirmation email was
submitted by the agent. Screenshots are saved in `.local/previews/`.

Sean subsequently reported clicking the confirmation email. An authenticated
database lookup confirmed the email confirmation timestamp, and the matching
Auth identity was explicitly mapped to `sean`/`commissioner`. Membership readback
confirmed active status, 15 games and the preserved Dallas -9.5 prediction.
This did not edit any ballot or count as a real cross-device save test.

The subsequent live dashboard review verified Sean's signed-in read, 15 spread
predictions and zero submitted total predictions. Before the universal-signup
work, a read-only cloud check showed revision 0, zero new audit events and
state hash `741127ea3c197a033139a26463c30cc3`. This is a preservation baseline,
not evidence of an application write. Direct SMTP settings inspection showed
custom SMTP disabled; ordinary player account email remains a setup dependency.

## Universal signup and private games — deployed; email onboarding blocked

Sean requested that people create their own accounts, start a private two-player
game or group, and invite others. The first additional game is Sean and Steven;
the original Triple Threat roster and records stay separate. Recipient contact
information is kept in ignored private working files, never frontend assets or
this document. Prior line exposure must be acknowledged; the new game must not
be represented as a fully blind contest or a source of verified official scores.

Three agents implemented and reviewed the account/API, frontend and access checks.
Sean saved his display name, created the separate practice Duel and generated a
recipient-bound invitation through the live app. The invitation is pending,
expires October 15 at 10:58 AM PT, and has not been emailed or accepted. No account
was created on Steven’s behalf. The Duel has one active member, no ballots and
no inherited snapshots. Profile/game data survived a page reload. A prepared link, email sent, confirmed account and accepted
invitation remain distinct milestones.
Automatic email delivery requires an approved free sender/provider setup, or a
separately configured sign-in method such as Google OAuth. Do not disable email
confirmation, share passwords, or grant players infrastructure-administrator
access as a workaround.

The durable [project tracker](../planning/project-tracker.html) records the
current scope and decisions. D-01 confirms separate optional personal forecasts;
D-02 is now confirmed: each complete spread/total submission locks its scored
guesses and immediately reveals its own market analysis. The signup release
originally left that rule unchanged; the later D-02 release is documented below.

Live odds, official kickoff freeze, result ingestion, notifications, additional
multi-week navigation, and final brand approval remain separate unfinished work.

## Signup release validation — October 8

- Applied `20261008174007_gtl_profiles_private_games_invites.sql`; original Triple
  Threat state hash stayed `741127ea3c197a033139a26463c30cc3`, revision 0.
- Edge version 3 includes the practice eligibility guard: practice games cannot
  create or reuse official frozen benchmarks. No actual kickoff collector exists.
- 66 Node/SQL checks, six local browser workflows and nine cloud browser workflows
  passed. Disposable PostgreSQL checks use PGlite; true overlapping multi-session
  transactions remain untested. Mock auth tests do not prove real signup delivery.
- 29 live denial checks passed across all six private tables, seven service-only
  RPCs and missing/invalid-session API requests. Database role readback confirmed
  RLS and no direct browser table access. Public bundle scan passed.
- Security advisor reports the expected six informational deny-by-default tables
  and the existing leaked-password protection warning. That optional protection
  remains unresolved under the free-only constraint; see the
  [password-security guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Direct dashboard inspection found custom SMTP and Google sign-in both disabled.
  No paid provider, email-confirmation bypass or infrastructure-admin invitation
  was used. Existing auth confirmation/recovery UI requires working mail delivery.
- Continuous integration now installs the pinned disposable SQL test runtime and
  collects both browser evidence folders. Remote CI has not run; no Git push occurred.

## D-02 release verification — October 8

- Edge version 4, JWT verification enabled, and Pages `c6c1b82e` are deployed.
  First submission locks each prediction mode; subsequent scored-guess changes
  fail before mutation. Existing historical values/audits are not rewritten.
- 71 Node/SQL, 6 local-browser and 12 cloud-browser tests passed. This includes
  final review/cancellation, both mode submissions at phone sizes, independent
  reveal, refresh persistence and stale-draft recovery. No real picks submitted
  for QA. Independent source review found no high/medium release blocker.
- 29 live access-denial checks and final public-bundle scan passed. Production
  served the expected final asset. Security advisories remain the previously
  documented six deny-by-default informational notices and password warning.
- Live signed-in review shows the existing 15-pick spread ballot disabled with
  the permanent-lock message and the comparison board with saved historical
  gaps. No external model, public betting or sharp-action feed is connected.
- Both league JSON hashes, revision 0 and zero new audit events matched their
  pre-release values: Triple Threat `741127ea3c197a033139a26463c30cc3`; practice
  Duel `0235cea1ad45fa236e8b30233f19f563`. Supplied audit export was inspected
  read-only: no ballots, bets or audit entries, no import/replay.
- Theme remains dark-only; there is no Light/Dark/System switch. D-04 asks which
  “public total bets” metric the user intends. Personal forecast fields, actual
  feed activation and recipient signup remain separately tracked work.


## Current weekly-entry and appearance release — October 8

Deployed migration `20261008182836_gtl_canonical_weekly_entries.sql`, Edge **version 5**
with JWT verification enabled, and Pages **24fb7715**. The production page serves
`index-C9tF0wKq.js` and `index-jxQ04waw.css`. Only `.local/cloud-dist/` was published.
No Git push or remote CI run occurred.

D-05/D-06 use one account/season/week record for spread and total ballots and
one immutable Challenge selection per NFL matchup. All writes share a weekly
revision, irrespective of the selected group. The transactional RPC checks
membership, roster identity, compatible schedule, revision, submission lock and
actual database time. Group standings and membership remain separate. Practice
history remains attached across groups, including a Challenge selection derived
from a practice-origin prediction; ineligible rows are labeled in the leaderboard.

Original league JSON was archived before backfill. Exact JSON equality verified
Sean’s complete original ballot, all 15 numbers, imported metadata and Dallas
−9.5. Both group reads return this same ballot. Total remains unsubmitted; no
Challenge selection or test pick was created. The original Triple Threat roster
still includes Sean, Troy and Luke. The legacy guard prevents old frontend/API
versions from editing archived ballot/bet/audit fields while permitting roster
changes through the invitation workflow. Recovery evidence is stored privately
under `.local/gtl-before-weekly-release.json` with owner-only permissions.

Before recipient acceptance, both original state hashes matched the baseline:
Triple Threat `741127ea3c197a033139a26463c30cc3`; Duel
`0235cea1ad45fa236e8b30233f19f563`. At **18:39:07 UTC / 11:39 AM PT**, the intended
recipient’s confirmed account independently accepted the invitation and joined
as **Sthomas**. The Duel now has two active members, revision 1 and hash
`d86f9c556e455d36b8f1df226dba9f43`; raw ballots, bets and audits remain equal to the
archive. This was an intended membership change, not a pick migration discrepancy.
No agent-sent email or recipient device observation is claimed. Earlier pending
invitation/blocked-recipient descriptions above are historical. How that account’s
confirmation email was delivered and general signup/recovery delivery remain
unverified; recheck current settings before choosing further email configuration.

Light, Dark and System are available on sign-in, My games and **Settings & setup →
Appearance**. Default remains Dark. Preferences persist per browser/device; they
are not account-synchronized. Sean’s live browser was set to Light and retained it
after reload. All 15 shared spread inputs were visible and locked in Sean & Steven,
including Dallas −9.5. The themes remain provisional, not final brand approval.

Validation: **89 Node/SQL checks, zero skipped; 15 cloud-browser and six local-browser
workflows**, plus targeted final frontend regressions after copy/provenance fixes.
Light phone layouts at 320/390px and semantic contrast reviewed independently;
lowest checked text contrast was 5.14:1, placeholder 7.23:1. The build, private-bundle
scan, unchanged historical snapshot check, and **39 live denial probes** passed.
PGlite serializes embedded queries; true overlapping PostgreSQL sessions and a
second physical-device pick save remain untested. Production readback is distinct
from these tests. Security advisor now lists 11 expected deny-by-default tables and
the previously documented password-protection warning; no new warning class.

D-04 confirms both reported absolute ticket counts and Over/Under ticket shares.
The Odds API is now connected for manual three-book collection. Outside models,
public activity and sharp-action feeds remain unconnected.


## Earlier comparison, eligibility and manual market release — October 8

Pages **5bd91076** is live with assets `index-TW6Khth6.js` and
`index-Bvf3XA0F.css`. Edge **version 8** keeps JWT verification enabled. New
migrations add service-only eligibility rulings and protected manual market
collection. Only compiled frontend assets were deployed; no Git publication.

Sean and Steven (display name **Sthomas**) each have **15 submitted spread picks**.
The live **Compare picks** view shows both side by side, including Dallas
Sean −9.5 / Steven −8.5. Independent mode gates and opponent draft privacy remain
intact. No picks were entered or changed by this release. The supplied commissioner
ruling accepts both Week 5 spread ballots despite known prior exposure; the
Duel is no longer practice at revision 2. Both original ballot hashes, audit hashes
and provenance hashes matched before/after. The two immutable ruling records
were saved at **19:01:00 UTC**. Total and Challenge receive no automatic exception.

**History & audit** now includes per-matchup source lines. Triple Threat's three
archived eDraft records are labeled historical/unverified, with publication versus
capture timestamps retained. A missing observation is not zero, and a chart
requires two distinct timestamps. New groups can use matching shared provider
snapshots once collected. Scored historical references remain separate from
current analysis; neither a provider quote nor a ruling establishes an official
benchmark.

The user saved `THE_ODDS_API_KEY` in encrypted Supabase Edge Function Secrets.
The first zero-credit check returned an error; outgoing provider date filters
were corrected to whole-second UTC, preserving exact event identity. The second
check succeeded at **19:15:08 UTC**, matched all 15 saved events and reported
**500 remaining / 0 used / 0 last-request credits**. No secret value is stored in application source,
public assets or exported picks; provider errors are sanitized. Manual collection is limited to the original
commissioner, four calls per UTC day, a 15-minute cooldown, a shared expiring lease,
idempotent request IDs and a 50-credit reserve. No scheduler or polling is active.
(Six calls and five minutes come from the October 12 migration
`20261012213000_gtl_submission_odds_window.sql`; Sean confirmed them on October 12
(D-27), and under D-27 these limits only bound spending, never a submission. Applied
hosted on October 12 as version `20261012235554`; see [DECISIONS.md](DECISIONS.md).)

Validation: **122 backend/SQL tests**, **22 cloud-browser workflows** and **six
local-browser workflows** passed; the final date-format fix passed **29 targeted
provider/collector tests**. All **51 live denial probes** passed after deployment
of the new protected resources. An earlier pre-migration run correctly failed
on a missing new table rather than treating a 404 as proof of access control.
The existing large-bundle warning remains. PGlite tests serialize embedded SQL;
true simultaneous PostgreSQL sessions and a second physical device remain untested.

Outside model forecasts, public ticket/money/count data, sharp-action evidence,
automatic movement alerts, official freeze/results and betting suggestions are
separate unfinished items in the project tracker (`planning/project-tracker.json`).

First manual collection succeeded at **19:15:22 UTC / 12:15 PM PT**: all 15 events,
**90 market/book quotes** (15 games × 2 markets × 3 books), status available,
**2 credits used / 498 remaining**. Snapshot `168c62b9-2834-41f3-82b1-8e28ff29db58`
is immutable and explicitly unverified. Live Sean & Steven Edge board readback
shows 15 three-book spread medians with observation/collection timestamps. The
current spread analysis does not expose any total values. New provider movement
needs a second recorded observation; no historical trend was fabricated.

## Current visible benchmark release — October 8, 12:35 PM PT

Production Pages **4d23cfc9** serves `index-CPA3fx8c.js` and
`index-CEsjI93D.css`; Edge **version 10** has JWT verification enabled.
Migration `20261008192528_gtl_scoped_spread_benchmark.sql` is applied. The
administrator separately recorded the user's D-09 approval at **19:34:24 UTC**;
the migration itself does not activate a policy.

The scoped policy uses the median of DraftKings, FanDuel and BetMGM for **Sean &
Steven / 2026 Week 5 / Guess the Spread only**. It waives only the Action Network
cross-check for that competition. All 15 matchups and three independent quotes
per matchup must still pass identity, freshness and agreement checks.

Live browser readback verified the benchmark, source time, per-game points and
both players' totals in Dashboard, My picks, Compare picks and Leaderboard.
The last saved collection gives Sean **95/150, closest-pick 7–5–3**, and Steven
(Sthomas) **93/150, 5–7–3**. Independent database arithmetic matches the totals
and absolute errors (27.5 and 30). These scores are **provisional**, based on
quotes observed around **12:14 PM PT** and collected **12:15 PM PT**.

The previous freshness filter hid saved analysis after five minutes. Saved
references now remain visible with their original times and a stale label;
automatic refresh remains off. My picks now has an **Open spread analysis**
button. Edge board live readback shows all 15 guess-to-market gaps. Gaps are not
model estimates, expected value or betting recommendations.

No official benchmark was frozen (the live frozen table has zero rows). To
freeze later, collect eligible quotes before actual Thursday kickoff, then use
the Duel's Settings & setup to record the observed actual start and its HTTPS
evidence source. All 45 spread quotes must be within five minutes before that
start. The server rejects incomplete or stale candidates and prevents changes
after a successful freeze. The actual kickoff field has no scheduled-time default.

Both original spread ballot, audit and provenance hashes match the saved
pre-release hashes; Dallas remains −9.5. No real predictions or Challenge
selections were edited. Validation passed **137 backend/SQL tests**, **26 cloud
browser tests**, **six local browser tests**, and **58 live authentication/raw
data denial probes**. Final mobile visibility adjustments also passed three
targeted browser tests. The existing bundle-size warning remains; simultaneous
hosted database sessions and a second physical device remain untested.

The security advisor reports 17 intentional RLS-without-browser-policy notices
for server-only tables ([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy))
and the pre-existing leaked-password protection warning
([remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).
No authentication protection was reduced by this release.

Outside models, public ticket/money/count data, sharp-action signals, betting
suggestions, scheduled quote collection and automatic alerts remain open in the
project tracker. The new provider series has one snapshot; a movement chart
requires another real recorded observation. This release does not invent one.


## Twelve-hour refresh and visual dashboard — D-10, October 8

This section supersedes earlier manual-only, single-snapshot and scheduler-pending
status. Pages **dfe01cc5** serves `index-Bup_qbrS.js` and
`index-C4GSXgRa.css`. `gtl-api` **version 11** retains platform JWT verification.
The new `gtl-odds-refresh` **version 1** uses its own narrowly scoped machine
capability check; only that endpoint has platform JWT verification disabled.

The hosted cron job `gtl-odds-every-12-hours` is active at **08:15 and 20:15 UTC**
(currently **1:15 AM and 1:15 PM Pacific**). It runs without an open browser or
laptop. The next run read back at release is **October 9, 08:15 UTC / 1:15 AM PT**.
An administrator executed the exact cron dispatcher path at **20:21:44 UTC**;
it succeeded at **20:21:45 UTC**, saving **15 games / 90 quotes**, costing two
credits. Measured usage is **4 used / 496 remaining**. There are now two actual
provider observations. This verifies dispatch, collection and persistence;
an elapsed twelve-hour clock-boundary execution has not yet been observed.

Applied migrations:
- `20261008201000_gtl_hosted_scheduler_extensions.sql`
- `20261008201526_gtl_scheduler_extension_privacy.sql`
- `20261008200926_gtl_twelve_hour_odds_refresh.sql`

The schedule was activated separately from migrations for the verified 2026
Week 5 slate. New weeks still require a validated schedule and configuration.
Manual and scheduled requests share four attempts per UTC day, a fifteen-minute
cooldown and a fifty-credit reserve (six attempts and five minutes once the
pending October 12 migration is confirmed and applied). Started games retain their earlier dated
references; collection updates upcoming games and skips a completed slate.
Duplicate dispatch returned `already_dispatched` without spending more credits.
The next refresh does not relax the separate five-minute official kickoff gate
or automatically freeze scores. Actual kickoff remains unrecorded, frozen rows
remain zero, and all six ballot/audit/provenance hashes match the pre-release
values. No real picks or Challenge selections were changed.

The live Dashboard now shows clickable accuracy bars, the five largest
player-to-market discrepancies with an all-games expansion, a matchup selector
and real observed line chart. Expanded rows expose records, guesses, points,
source and capture times. Missing analysis feeds are consolidated under
**Data connections**. The dashboard reads refreshed saved data on return or
after the next scheduled run, without making provider requests or overwriting
an unsaved ballot. Independent Spread/Total reveal gates remain intact.

### Machine authorization and platform limitations

No reusable token or service key is placed in the cron command, HTTP queue or
Vault. Each administrator-created run receives a 256-bit random capability;
only its hash is stored in protected application tables. It is bound to one run,
expires after five minutes and is checked before replay status is returned.
Only the fixed protected configuration supplies actor, slate and collection
scope. Service callers cannot create runs, change capabilities, dispatch jobs or
change scheduler configuration. A queued run can be claimed only once.

The extension-privacy migration attempted revocation, but explicit live ACL
inspection showed platform-owned grants remain on `net`/`cron` objects.
Do **not** treat that migration name or successful execution as proof that the
extension ACLs were hardened. A database role able to read/write the queue can
race the same already-authorized run or disrupt delivery, an availability
limitation. It cannot use that capability for a different actor, slate or new
run. `net`, `cron` and `vault` are not exposed through the Data API: all three
anonymous schema probes returned 406/PGRST106. No persistent secret was created
in Vault. No platform-owner impersonation or privilege bypass was attempted.

Validation: **144 backend/SQL tests**, **30 cloud browser workflows**, **six local
browser workflows**, and four final targeted UI regressions passed. **69 live
access-boundary probes** passed, including nineteen private tables, protected
RPCs, both Edge endpoints and the three unexposed extension schemas. The final
compiled frontend scan passed. Tests include expiration/replay, incorrect and
cross-run capabilities, request size/time limits, partial slates after Thursday,
quota limits and original timestamps on retained references. Local embedded SQL
is not proof of simultaneous independent hosted database sessions. The existing
large-bundle warning, actual second-device testing and general email delivery
remain open.

Current security advisor findings: nineteen intentional server-only RLS notices
([explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy));
a `pg_net` extension-in-public warning
([guidance](https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public));
and the existing leaked-password protection warning
([remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)).
Live metadata shows `pg_net` is platform-owned and nonrelocatable; its HTTP
objects are in `net`. No destructive extension reinstall was attempted.

Outside projections, public ticket/handle/count data, sharp-action signals,
validated suggestions and automatic alerts remain separate open work. Source
rights and the confirmed model-development direction are documented in
`docs/ODDS_PROVIDER_EVALUATION.md` and the project tracker.

## Selected identity, dashboard controls and Total parity — October 8, 2026

D-12 applies **Yardline G** and **Field monogram**, with browser title and visible
wordmark **Guess The Line**. Five real layouts, section toggles, motion controls
and in-dashboard notices are available under **Customize dashboard**. Preferences
are saved per browser/device, not to the account. OS reduced-motion wins over
animation settings. In-page notices are not phone push, email or SMS delivery.
Other brand categories remain provisional; an SVG app icon is not native iOS
installation support.

`gtl-api` v12 adds only a gated, read-only `provisionalAnalysis` Total projection.
Source SHA-256: `7cfbecfe54e041f23c9ac7afef5b6a63053877666cccc9373aa76dd3002ba163`.
No migration or scheduler change accompanied this release. The official policy,
frozen fields and saved guesses are unchanged. One complete captured collection
supplies every player's Total reference; newer partial collections are not mixed
into its scores. The UI exposes Total accuracy bars, per-game gaps, line history,
comparison, leaderboard and source details before official freeze, with explicit
provisional labels and independent submission gates.

Production readback shows Sean **76/150** and Steven **69/150** for Total; Spread
remains **95/150** and **93/150**. Both players have fifteen submitted guesses in
each mode. All twelve ballot, audit and provenance hashes match the pre-release
readback. Dallas remains -9.5 in Sean's original Spread ballot.

Validation: **149 backend/SQL tests**, **6 local browser workflows**, and all
**41 cloud browser cases** passed across the full run and a targeted recheck.
The first full cloud run had one obsolete Total-navigation expectation; it now
selects Over/Under before Compare, and both comparison/privacy cases passed the
recheck. Eleven new cases cover identity, preferences, mobile themes, reduced
motion, update notices and Total parity. **69 live access-boundary probes** and
the compiled-frontend private-data scan passed. Production title, identity,
Total scores, actual chart observations and customization controls were inspected
in the signed-in app. Existing security-advisor notices above remain unchanged.

The separately built historical model passed **7 integrity tests** but failed
to improve on a simple baseline. Its last input game is February 2021; no 2026
forecast is deployed. See `docs/MODEL_VALIDATION.md` for measured errors and
current-data/validation exit conditions. Official team artwork is tracked in
`docs/VISUAL_POLISH.md`; source feasibility is not asset activation.

### Visual aesthetics follow-up

Pages `3de3c6d1` adds a shared away/home matchup component with full-name wrapping,
compact dashboard rows and corrected chart label spacing. Nine targeted browser
checks passed; six affected checks passed again after a mobile wrapping fix,
and the final 320px Light layout check passed after separating chart labels.
The final compiled-frontend private-data scan passed. JavaScript asset:
`index-BDyxGOXV.js`; stylesheet: `index-CN1yWbIg.css`. No backend, player data or
schedule mutation accompanied this presentation-only follow-up. Official team
logos remain unactivated; see `docs/VISUAL_POLISH.md`.

The public signup link for Troy and Luke was provided to Sean in chat. Generic
invitations are intentionally disabled for the fixed Triple Threat roster.
Their intended signup email addresses and confirmed account identities are
required for scoped roster linkage; no access was granted in this step.

Production readback confirmed the final JavaScript asset, away/home matchup
labels and preserved Total scores of 76/150 and 69/150. The live screenshot is
`.local/previews/live-total-visual-release.png`.

### Field monogram display refinement — D-14

Sean requested the icon alone and supplied the selected Field monogram reference.
Pages `9df514fa` uses its rounded lime tile, dark original glyph and soft shadow
in sidebar, sign-in and My games branding, with no adjacent wordmark. The
browser title and accessible icon name remain Guess The Line. Five targeted
identity/layout cases passed at desktop and 320/390px in Light/Dark. Production
readback confirms `index-BfDoH6pA.js`, no wordmark nodes, and the visible named
icon; screenshot `.local/previews/live-field-monogram.png`. Final frontend scan
passed. The backend, picks and collector are unchanged by this display update.

### Troy: existing account linked to Triple Threat

Sean identified Baustin Files as the game he sent to Troy and requested Triple
Threat access. A scoped read confirmed Sean's accepted recipient-bound invitation,
the same confirmed account and active Baustin Files player membership. The owner
then added exactly one active player mapping to the existing `troy` roster slot,
with fail-closed guards for the account, accepted invitation, commissioner,
unchanged fixed roster and conflicting mappings. No account was created and no
password, login token, invitation message or data export was sent.

Post-write readback of the production lobby lists **Baustin Files** and
**Triple Threat**, both as player. The shared weekly-state function maps the
existing fifteen submitted Spread and fifteen Total guesses to `troy`. All six
Troy ballot/audit/provenance hashes match the pre-write values, and Triple Threat
state remains `741127ea3c197a033139a26463c30cc3`. Both ballot origins are non-practice.
The stored roster and Sean's commissioner role are unchanged; Luke remains
unmapped. Troy's own refreshed screen has not been observed. Only Luke's intended
signup email and confirmed account are still needed for that remaining slot.


## Shared provisional dashboard and team-logo release — October 8, 2026

Pages **531d14b5** serves `index-DU7ip-tq.js` and `index-Caldbkdn.css`.
The authenticated API is **gtl-api v13**, with JWT verification enabled and code
SHA-256 `204bba501ac0d01dd2363eb807e9d2219a658a08b45d3bd63a24c12ec54c40f3`.
No schema migration or odds-provider request was required. Only the compiled
frontend was uploaded, after the private-data scan passed.

The existing shared market-snapshot lookup already scopes by canonical slate.
The missing cross-group Spread display came from applying provisional scoring
only when a group had the scoped official Spread policy. The new read-only
projection calculates separate Spread/Total provisional analysis for any
authorized submitted mode against one complete collected snapshot. Existing
approved/frozen scoring references keep precedence. Draft opponents remain
hidden and unscored; closest-pick records wait for all eligible full ballots.
No new official policy, actual kickoff, or frozen score is inferred.

Production readback through Sean's signed-in account verified:

| Group | Spread | Total | Boundary |
| --- | --- | --- | --- |
| Sean & Steven | Sean 95; Sthomas 93 | Prior release parity retained | Existing D-09 Spread result unchanged |
| Baustin Files | Sean 95; TJ 128 | Sean 76; TJ 49 | Both are provisional analysis, not a new official policy |
| Triple Threat | Sean 95; Troy 128 | Sean 76; Troy 49 | Luke explicitly Not submitted; no zero invented |

The same server-side weekly ballots are reused across these groups. Troy and
Luke now have confirmed-account mappings to their existing Triple Threat slots;
post-write lobby readback showed access, and fixed roster state/revision stayed
unchanged. Luke had no submitted ballot at linkage or this UI check. Their own
physical devices have not been observed.

Thirteen reviewed local transparent team marks are active. Production Saints,
Bears and Packers assets loaded; all 13 assets and failure fallbacks passed
local render checks. Nineteen teams remain on abbreviation fallbacks, tracked
in TEAM_LOGO_SOURCES. The Field monogram remains the icon-only app identity.

Customize dashboard now contains **Choose dashboard games**. All/selected/empty
views filter gap cards and line-history options without changing full-week
scores or ballots. This setting is saved in the current browser per season/week;
it is not the future account-synced Favorites feature. The always-on missing-
model notice was removed; actual refresh failures/delays still show notices,
and Data connections retains accurate source availability.

Validation: **153 unit/SQL checks**, **19 targeted cloud-browser cases**,
**69 live access-boundary checks**, private frontend scan and whitespace check
passed. Browser cases cover generic Spread groups, Total gating/parity, official
reference precedence, filters across modes/groups/reload/weeks, real failure
notices, 320/390px Light/Dark layouts, selected identity and actual-logo fallback.
A roughly 602 KB uncompressed JS bundle warning remains tracked for optimization.
Screenshots: `.local/previews/live-triple-threat-provisional.png`,
`.local/previews/live-baustin-provisional-spread.png`, and current mobile fixture
images. The broader global leaderboard, timestamped submission reference rules,
private stake/settlement/ROI journal, Best Bets and external-model feeds are
separate unfinished items. D-16 is pending; existing lock/scoring rules remain.
