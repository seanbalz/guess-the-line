# GTL — Account, Access & Integration Register
Updated: 2026-10-08. Budget: **free-only** unless expressly approved. This register is an onboarding checklist, not proof accounts are connected. Do not store passwords, tokens, phone numbers, or secret keys in Git.

## Status meanings
- **Existing / confirmed**: directly verified through connected service.
- **Needed / unverified**: owner must confirm existence and access.
- **Optional**: defer until functionality requires it.
- **Blocked**: free plan does not support required use or rights have not been cleared.

| Priority | Service / account | Purpose | Status | Required setup / verification | Owner action |
|---|---|---|---|---|---|
| P0 | GitHub `seanbalz` | Source repo, issues, PRs, CI/CD | Existing / confirmed | Private repo `seanbalz/guess-the-lines-repo`; review GitHub Actions permissions and branch protection | No new account |
| P0 | Cloudflare | Free static web dashboard deployment, CDN | Needed / unverified | Create/sign in; authorize GitHub App for **only this repo**; Workers & Pages → Pages → Connect to Git; build command none for current static prototype; output root; deploy; verify URL | Confirm Cloudflare account, authorize integration |
| P0 | Supabase | Free PostgreSQL, authentication, RLS, pick storage, odds snapshots, league data | Needed / unverified | Create project; configure auth and redirect URLs; schema migrations; RLS for leagues/picks; secrets stored only in server env; backup/export policy | Confirm Supabase project/account |
| P0 | TheRundown free developer API | Candidate no-cost NFL spreads **and totals** from 3 books, delayed feed | Needed / unverified | Obtain free key; validate license for intended public/multiplayer display, limits, historical timestamps and API fields; use backend secret; fallback to manual if not permitted | Register free key and verify permitted use |
| P0 | NFL schedule/results source | Official games, start times, final scores | Needed / unverified | Evaluate publicly documented licensed/free source; normalize stable NFL event IDs and UTC kickoff | No account if approved public data |
| P1 | Action Network | Consensus comparison only, if free/authorized | Optional / unverified | Confirm public access and reuse rights; do not assume a free API or scrape prohibited content | None until approved |
| P1 | nflverse | Historical play-by-play, EPA, model training | Public project; access unverified | Verify dataset license, refresh schedule, reproducible downloads and attribution | Usually no account |
| P1 | Independent published models | Cross-check spreads and totals | Needed / unverified | Identify model(s) with available lawful projections, timestamp, methodology and reuse permission | None unless provider requires login |
| P1 | Email delivery provider | Invite links, account verification, optional notifications | Needed / unverified | Start with Supabase Auth email for low-volume tests; check limits; if insufficient evaluate free-tier Resend | Only if needed |
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
3. **Betting Challenge** — default one required selection per game, **either** ATS or over/under at a quoted market line; W-L-P and win percentage; league can configure maximum selections per game.
4. **Edge analysis** — player prediction vs sportsbook consensus vs independent model for spread **and separately** total; no implied positive EV without calibrated probabilities and prices.

## Suggested free-first architecture
Private GitHub → Cloudflare Pages (frontend) → Supabase Auth/Postgres (leagues, picks, immutable snapshots) → server-side scheduled collector using GitHub Actions or Supabase scheduled functions if available → TheRundown free odds adapter after terms verification. No secret keys in browser. Server verifies timestamps, provider rights, kickoff lock and RLS.

## Security / access acquisition
Record only: service, account owner, access level, connection status, project ID (nonsecret), link to dashboard, last verified date, blocker. Store secrets in provider secret managers, not spreadsheet or repo. Never ask users to paste passwords in chat. Configure 2FA for GitHub, Cloudflare, Supabase and email.

## Deployment gates
- Cloudflare private-repo Git integration is supported, but **published Pages URLs are public unless separate access controls are implemented**. Do not expose unrevealed picks or private league data in static HTML.
- Frontend must fetch league-specific private data through authenticated APIs and RLS, not embed it in public assets.
- Free data must permit display/redistribution for intended usage; otherwise use personal/manual prototype only.
- No paid subscription, Apple Developer membership, domain, or SMS service without explicit approval.
- Mark any account **connected** only after an actual successful authenticated call or verified deployment.

## First two owner decisions
1. Confirm whether a Cloudflare account exists; connect the private GitHub repository.
2. Confirm whether a Supabase project exists for GTL; create a free project if absent.
All other work can continue using local fixtures and documented API contracts.
