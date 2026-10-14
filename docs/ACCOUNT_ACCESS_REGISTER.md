# Current access evidence — October 8, 2026

Read the latest `docs/CLOUD_SETUP.md` release entry and
`planning/project-tracker.json` for current status. Historical acquisition tables
and dated entries below preserve the evidence sequence, not a claim that every
service is still unconnected or that older release versions remain current.
The recorded latest production release is Pages 531d14b5 / API v13; Sean, Troy and
Luke have roster mappings. General mail/recovery delivery and a second physical
device remain unverified. Market collection runs every twelve hours under D-10;
older six-hour GitHub Actions and manual-only plans are superseded. No free
third-party forecast, public splits or sharp feed is established by account access.
Worker-built candidate features are local until separately deployed and verified.

# GTL — Account, Access & Integration Register
Updated: 2026-10-08. Budget: **free-only** unless expressly approved. This register is an onboarding checklist, not proof accounts are connected. Do not store passwords, tokens, phone numbers, or secret keys in Git.

Local linkage update: the saved-score viewer uses `python3 scripts/snapshots.py serve` on loopback only. Never deploy the repository root: it contains private prediction and snapshot JSON. A production frontend must exclude those files and use an authenticated backend. Local arithmetic checks do not change account connection statuses.

## Status meanings
- **Existing / confirmed**: directly verified through connected service.
- **Needed / unverified**: owner must confirm existence and access.
- **Optional**: defer until functionality requires it.
- **Blocked**: free plan does not support required use or rights have not been cleared.

| Priority | Service / account | Purpose | Status | Required setup / verification | Owner action |
|---|---|---|---|---|---|
| P0 | GitHub `seanbalz` | Source repo, issues, PRs, CI/CD | Existing / confirmed | Private repo `seanbalz/guess-the-lines-repo`; review GitHub Actions permissions and branch protection | No new account |
| P0 | Cloudflare | Free web frontend deployment, CDN | Existing / confirmed; frontend deployed | Personal account 83bd659d712e968e7a61efa14107465a; isolated CLI authorized by user. Only compiled frontend deployed at https://guess-the-line.pages.dev. Private paths/assets checked; Git auto-deployment remains unconnected. | No further hosting action for initial release |
| P0 | Supabase | Free PostgreSQL, authentication, RLS, pick storage, odds snapshots, league data | Existing / confirmed dedicated Free project; Sean account linked | Separate Gambling organization; project onmrgvcehkflfaizvedl. Protected API, private import, production redirects, Sean email confirmation and active commissioner mapping verified. Authenticated read, profile save, private-game creation and invitation preparation verified. The intended recipient account has confirmed and accepted its invitation. Real pick saves, general delivery and cross-device checks remain pending. | Resolve free account email or Google sign-in setup |
| P0 | TheRundown free developer API | Previously proposed odds source | Blocked for multiplayer display under current free terms | Terms checked October 8: Free/Starter are personal/internal only; end-user display and long-term snapshot retention require additional rights. No integration connected. See provider evaluation. | No signup needed unless written free-use permission is obtained |
| P0 | The Odds API (`the-odds-api.com`) | Free sportsbook spread/total quotes | Existing / confirmed; first manual collection verified | User completed free signup and saved THE_ODDS_API_KEY in Supabase. Successful preflight matched all 15 events. First manual collection saved 90 spread/total quotes from three books for 2 credits, leaving 498. No paid upgrade or scheduler. | Key is already in the correct secure destination; no key needed in chat |
| P0 | NFL schedule/results source | Official games, start times, final scores | Needed / unverified | Evaluate publicly documented licensed/free source; normalize stable NFL event IDs and UTC kickoff | No account if approved public data |
| P1 | Action Network | Consensus comparison only, if free/authorized | Optional / unverified | Confirm public access and reuse rights; do not assume a free API or scrape prohibited content | None until approved |
| P1 | nflverse | Historical play-by-play, EPA, model training | Public project; access unverified | Verify dataset license, refresh schedule, reproducible downloads and attribution | Usually no account |
| P1 | Open-Meteo (`api.open-meteo.com`) | Kickoff forecast for every upcoming game not in a dome (D-34, D-45) | Approved by D-34 (October 13, 2026); free non-commercial API; no account or key; not yet called from the hosted project (awaiting the migration and the `gtl-api` deploy) | CC BY 4.0 attribution "Weather data by Open-Meteo.com" with the licence link next to every forecast. Under 10,000 calls a day, 5,000 an hour and 600 a minute per IP; GTL caps itself at 200 a day in SQL. Non-commercial basis to revisit if GTL adds subscriptions, ads, paid entry, affiliate or referral links or sponsorships. Post-deploy reachability check in docs/SOCIAL_COMMUNITY.md (Deployed state) | None |
| P1 | Independent published models | Cross-check spreads and totals | Needed / unverified | Identify model(s) with available lawful projections, timestamp, methodology and reuse permission | None unless provider requires login |
| P0 | Email delivery provider / alternative sign-in | Account verification and recovery; optional invitation delivery | Blocked pending setup | Custom SMTP and Google sign-in are both disabled (direct dashboard readback). The default service has documented recipient restrictions; the first recipient has since confirmed an account, but its delivery path was not inspected. Free custom SMTP requires an approved sender setup; Google OAuth is an alternative requiring configuration. | Choose the free sign-in/delivery path; do not share passwords |
| P1 | GitHub Actions | Six-hour collection, validation, CI tests | Existing GitHub account; workflow not verified | Enable workflows; cron UTC with DST considerations; protect API keys in Actions secrets; log failures; do not assume guaranteed exact run times | Verify Actions enabled |
| P2 | Apple Developer Program / App Store Connect | Native iOS distribution and push certificates | Optional / unverified | Paid membership typically required for App Store release; defer under free-only policy, prioritize iPhone-responsive PWA | Explicit approval only |
| P2 | Apple Push Notifications | iOS push after native-app setup | Optional | Depends on Apple app signing/capabilities | Defer |
| P2 | SMS provider (e.g. Twilio) | Text alerts | Optional / blocked free-only | No assumed permanently free SMS; default opt-in push/email, disable SMS until approved | Explicit approval only |
| P2 | Custom domain / DNS | Branded domain | Optional | Use free pages.dev subdomain first | None |
| P2 | Figma or Canva | Visual design review, logo boards | Optional / unverified | Use free plan if available, maintain source assets in repo; branding on hold | None |
| P2 | Error monitoring / analytics | Performance and operational alerts | Optional | Prefer Cloudflare analytics and free logs; privacy-conscious implementation | None |

## Games and systems this supports
1. **Guess the Spread** — hidden signed spread prediction, provisional accuracy points and closest-pick W-L-T.
2. **Guess the Total** — hidden numeric combined-points prediction, separate accuracy points and closest-pick W-L-T.
3. **Betting Challenge** — default one required selection per game, **either** ATS or over/under at a quoted market line; W-L-P and win percentage; the same immutable weekly selection is reused across groups.
4. **Edge analysis** — player prediction vs sportsbook consensus vs independent model for spread **and separately** total; no implied positive EV without calibrated probabilities and prices.

## Suggested free-first architecture
Private GitHub → Cloudflare Pages (frontend) → Supabase Auth/Postgres (leagues, picks, immutable snapshots) → server-side scheduled collector using GitHub Actions or Supabase scheduled functions if available → a permitted free odds adapter after source and retention rights verification. No secret keys in browser. Server verifies timestamps, provider rights, kickoff lock and RLS.

## Security / access acquisition
Record only: service, account owner, access level, connection status, project ID (nonsecret), link to dashboard, last verified date, blocker. Store secrets in provider secret managers, not spreadsheet or repo. Never ask users to paste passwords in chat. Configure 2FA for GitHub, Cloudflare, Supabase and email.

## Deployment gates
- Cloudflare private-repo Git integration is supported, but **published Pages URLs are public unless separate access controls are implemented**. Do not expose unrevealed picks or private league data in static HTML.
- Frontend must fetch league-specific private data through authenticated APIs and RLS, not embed it in public assets.
- Free data must permit display/redistribution for intended usage; otherwise use personal/manual prototype only.
- No paid subscription, Apple Developer membership, domain, or SMS service without explicit approval.
- Mark any account **connected** only after an actual successful authenticated call or verified deployment.

## First two owner decisions
1. Cloudflare frontend deployment is verified; optional private-repo auto-deployment remains separate future work.
2. Sean is signed in and live profile/game/invitation writes are verified. The first intended recipient has now joined; general confirmation/recovery delivery still needs verification.
All other work can continue using local fixtures and documented API contracts.

## Account evidence — 2026-10-08
- **Cloudflare:** The connected browser displayed an authenticated [account home](https://dash.cloudflare.com/83bd659d712e968e7a61efa14107465a/home) with **Create app**, replacing the login screen. Account ID: `83bd659d712e968e7a61efa14107465a`. The user reports personal ownership and Apple sign-in; the account name and membership role were not independently verified. This proves browser access only, not CLI authorization, GitHub integration, deployment, or persistent app data.
- **Supabase:** Successful authenticated connector calls listed `seanbalz's Org` (`xxbiyssnrwpfjjlsgiav`) and three existing projects, all reported `INACTIVE`; none was named for GTL. The organization includes business-related projects. No project contents were inspected and no resources were created or changed. GTL organization selection remains open.
- **Later Supabase verification:** The signed-in browser showed a new **Gambling** organization and **seanbalz's Project** (`onmrgvcehkflfaizvedl`), linked to the GTL repository. Direct connector lookup confirmed organization `bwehnxbvskmplsjagaki`, plan `free`, and project `ACTIVE_HEALTHY`; the earlier list result did not include this new resource. The initially empty project now contains the protected schema, original 15-game spread ballot, three snapshots, and deployed `gtl-api` version 1. No memberships are granted yet. See [CLOUD_SETUP.md](CLOUD_SETUP.md) for verified boundaries and remaining release steps.
- **Cloudflare release:** User completed the deployment authorization; exact personal account matched. Pages project `guess-the-line`, production deployment `e9e550b4`, and stable HTTPS site verified. Supabase Site URL and sole allowed redirect both match the production origin after dashboard reload. No GitHub push or automatic build connection was made.
- **Sean account linkage:** User reported clicking the confirmation email. Direct Auth lookup verified confirmation and sign-in timestamps; the matching confirmed identity was explicitly linked to the active `sean` commissioner roster spot. Membership readback preserved the 15-game slate and Dallas -9.5. No picks were changed. The observed game tab still needed sign-in.
- **App:** The local preview still uses its own file storage and player selector. The cloud build uses real sign-in and server-derived player identity. Authenticated app data loading and persistence verification remain pending. No paid resources or player invitations were activated; Sean's confirmation email was user-initiated.

### Superseding live evidence — signup release
The earlier entries above preserve the sequence of discovery; this paragraph is
the current status. Sean is signed in and the original Triple Threat read is
verified. The private-game migration and `gtl-api` version 3 are deployed. Sean’s
live profile save, creation of the separate Sean & Steven practice Duel, and an
email-bound invitation record succeeded. The link is prepared, not emailed or
accepted; recipient contact and link stay in ignored private working storage.
Troy and Luke still have no account-to-roster mappings. No real pick was changed.
All six private tables deny direct browser reads; 29 live access-boundary checks
passed. New-player email confirmation, actual second-device persistence and
concurrent user saves remain unverified. See [CLOUD_SETUP.md](CLOUD_SETUP.md).


### Latest superseding evidence — weekly release and recipient acceptance
Edge version 5 and Pages 24fb7715 are deployed. Five new private canonical/archive
tables preserve the original 15 guesses and share weekly entries across groups;
39 live access-denial probes passed. Light/Dark/System is live with device-local
preference persistence. At October 8, 11:39 AM PT, the confirmed account matching the
requested invitation recipient accepted and joined the Duel as Sthomas. Two active
members are verified. No recipient password, account creation on their behalf or
agent-sent email was involved. Earlier pending/blocked descriptions remain an
audit trail, not current recipient status. Universal email delivery and recovery
are not proven by this one confirmed account; inspect the current configuration
before making further setup changes. See docs/CLOUD_SETUP.md for preservation and
release evidence. The next account question is the reviewed free sportsbook feed.

## Current comparison and free provider evidence — October 8
Steven has now saved all 15 spread predictions; both his ballot and Sean's are
submitted. Sean explicitly ruled that this Week 5 spread competition counts despite
prior exposure. The Duel practice flag is removed, with immutable eligibility
rulings and original ballots/audits/provenance preserved. Compare picks shows both
players. The Odds API first manual collection is verified; models, betting
activity feeds, official benchmark freeze and notification delivery remain open.


## Fixed-roster access verified — October 8, 2026

Troy and Luke now both have confirmed existing accounts mapped to their reserved
Triple Threat player slots. Luke's newly confirmed signup was found after Sean
reported it, and the server-side lobby readback includes Triple Threat. All three
slots (Sean, Troy, Luke) have active account mappings. The league remains closed
to general joining; its roster JSON, revision 0 and stored state hash stayed
unchanged. Luke had no weekly ballots at linkage and none were created for him.
Troy's existing weekly Spread and Total ballots remain shared across his games.
Their own device screens have not been observed; each can refresh My games at
https://guess-the-line.pages.dev/ using the same signed-in account. No email or
message was sent on their behalf. Earlier unlinked/account-needed rows below
are historical and superseded by this verification.
