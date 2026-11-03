# Balanced logo frontend release — October 29, 2026

Owner: Sean Balsiger · Version 1

## Authorization and scope

Sean selected 01 Balanced, then said “Deploy” and explicitly chose “Run the logo
deployment in this chat.” This chat therefore runs the protected frontend release
and its production approvals for this request. PR #365 merged as
`f743f27d92ec69694b215d976697e4e6f0108ef2`; its 12 checks passed.

The release updates the G in both app components, the browser favicon, and the
transparent 180/192/512 home-screen/notification PNGs. Alternate color SVG exports
remain design assets; the app keeps its lime/deep-green theme pairing.

## Compatibility and recovery

The logo changes no API contract, schema, data, permissions, quotas or schedule.
The frontend release preserves the other reviewed changes on the selected main
revision. This run does not deploy backend functions or apply migrations.
Rollback is a separately verified frontend release of the previously successful
source `76329b7f2c57bdb2a2710ab5a90817c3318f75da`, or a reviewed revert of the logo
changes atop current main, through the same release gates. Previous Pages ID:
`452d9304-21d2-4c82-b63c-5b8b99736ca6` (release run 40887118540).

## Verified production release

- **Source:** `5c1b775f05a69306f20f911f4b0455c207c65ffc`.
- **Source/CI check:** [40907165176](https://github.com/seanbalz/guess-the-line/actions/runs/40907165176), successful. Exact-source main push runs: Tests `40905373932`, Dashboard checks `40905374061` (all four browser shards, dashboard and Persona), Brand QA `40905373849`.
- **Protected readiness:** [40907278407](https://github.com/seanbalz/guess-the-line/actions/runs/40907278407), successful. Readiness observed hosted state at `2026-10-29T16:01:43.376Z`.
- **Release card:** [PR #365](https://github.com/seanbalz/guess-the-line/pull/365), with exact source, digest, compatibility, rollback and Sean's authorization recorded before dispatch.
- **Deploy:** [40907820747](https://github.com/seanbalz/guess-the-line/actions/runs/40907820747), successful. Verified at `2026-10-29T16:06:47.498Z` (12:06 PM Eastern).
- **Pages ID:** `72eb400b-77df-4ef0-944f-8ceb7b04c38f`.
- **Production:** [guess-the-line.pages.dev](https://guess-the-line.pages.dev).
- **Frontend SHA-256:** `f9136a1c18197900baf1aae368069e4213cb2768207bedaa66139f8ab4169719`.
- **Served bytes:** all 124 manifest assets matched production. The immutable deployment URL is protected by Cloudflare Access; the verifier recorded `deploymentUrlAccess: protected` and compared the production URL.
- **Boundaries:** all 385 signed-out probes denied access as expected; none awaiting deployment.
- **Migration history:** 69 rows, digest `2e1f74cbc66123554f6b0e4addc6d8743fa500e352583f906bce46cb91c50b25`, unchanged before/after. M-32 `20261029150000` remains pending. Week 8 schedule evidence passed across 28 games, with timing restrictions disabled.
- **Backend preservation:** all Edge Function metadata stayed unchanged. API v42 remained ACTIVE with JWT verification; bundle SHA-256 `81c4c8087d4a5afdf8815ff06a4b0aedcfb7ab1aba6ac6cfe85ff037c6a8ce1a`. This frontend release does not independently verify API source bytes.

The selected source also includes the already-approved NBA navigation/EPL Play
fixes (#364) and EPL account-switch/phone-selector fixes (#369). Those frontend
changes use existing routes and lobby responses; they require no new migration
or API deployment. EPL worker/moneyline source in main was not deployed by this run.

## Direct logo readback

A separate HTTP read of each production asset returned 200 and byte-for-byte
matched the selected source. The previous live favicon had SHA-256
`c9765146063c920cc8afadccf40f69c702f82ccac4c812469fc70e60f6c034e9`.

| Asset | Verified SHA-256 |
| --- | --- |
| `favicon.svg` | `025002ed86ce367cc578e23c374bf29e5095f8c4f09a4313c865fdb77ff76f36` |
| `app-icon.svg` | `ba0a36eaf4cd3435f3046e5bc7fe762a0f2b97b8948c391523829f0f07f9942a` |
| `app-icon-180.png` | `38541f475db4ff661343233553a6a6207ff19f17ca3f0da231011d8e04bf5a6f` |
| `app-icon-192.png` | `a2c40a14651ca9dca326c064d6d8273cf62d73b0019cbf43869ae991eee8c825` |
| `app-icon-512.png` | `684fde8e4f728b4c13cbd5fe50e591ed336d7c73e1820d6896f0286b34325d75` |

Readback timestamp: `2026-10-29T16:06:44.622Z`. Browser favicon caching can outlast an
asset deployment; this evidence confirms the server bytes. Signed-in and physical
iPhone acceptance remain separate. No database, schedule or backend was changed.
