# Tracked bets Overview release — November 3, 2026

The tracked-bet Overview is live at <https://guess-the-line.pages.dev>.
Protected frontend deploy [41596638055](https://github.com/seanbalz/guess-the-line/actions/runs/41596638055)
completed verification at **07:34:40 UTC**, from source
`c6d6434c0c39ae2c631d7dd6345b79261533949b`. Release card:
[issue #424](https://github.com/seanbalz/guess-the-line/issues/424).

Sean directly requested “Update deployment” in this session, then approved the
separate readiness and final production gates in GitHub. The connected
integration returned HTTP 403 when submitting production approval; the existing
runs were reused after his approvals. No duplicate production release was run.

## Delivered behavior

PR [#420](https://github.com/seanbalz/guess-the-line/pull/420) adds **Bets → Overview**
and **Overview / Tickets** controls. The dashboard exposes the cumulative
performance graph, record, ROI, win rate, open risk, results and ticket-level
breakdowns by bet type, market and sportsbook. Filters and optional unit/cash
display share the matching ticket subset. Each parlay counts once; existing
accounting, unknown-data disclosures, 32px ticket gaps and inline expansion are
preserved. See the [implementation record](TRACKED_BETS_OVERVIEW_2026_11_02.md).

This is frontend-only. The workflow deployed the requested `c6d6434` source;
its controller ran from `975744c548ad88db81d3da526850b1ca3c00e8ba` on main.
Later main changes, including the step-0 kit in #428, are outside this deployed
source. No API, worker, schema, migration, bet reconciliation or guess reset
was performed by this release.

## Release gates

| Gate | Evidence | Result |
| --- | --- | --- |
| Exact-main push checks | Tests [41555366972](https://github.com/seanbalz/guess-the-line/actions/runs/41555366972), Dashboard [41555367073](https://github.com/seanbalz/guess-the-line/actions/runs/41555367073), Brand [41555367250](https://github.com/seanbalz/guess-the-line/actions/runs/41555367250) | All 12 checks passed on c6d6434 |
| Source check | [41558007983](https://github.com/seanbalz/guess-the-line/actions/runs/41558007983) | Passed |
| Readiness | [41558075966](https://github.com/seanbalz/guess-the-line/actions/runs/41558075966) | Passed; hosted observation 02:40:34 UTC |
| Publish and live verification | [41596638055](https://github.com/seanbalz/guess-the-line/actions/runs/41596638055) | Passed; fresh preflight 07:33:10 UTC, verification 07:34:40 UTC |
| Independent production readback | 07:40:33 UTC | All 129 served files match; 4,511,824 bytes; Overview present in `assets/NextApp-BbOGfKS8.js` |

The release-evidence ZIP SHA-256 is
`232f9e4d924901736cd59cb16b7a995e0c9db87ee66eb0164f1c3e9933e85457`,
verified before reading its reports and manifest. The independent readback used
that manifest, fetched every canonical production path with redirects rejected,
and compared each response's SHA-256 with the recorded artifact hash.

## Hosted result and preservation

- Pages deployment: **`2308ab8e-7fd3-40f2-af1e-cad6c4e1cfcf`**.
- Production: <https://guess-the-line.pages.dev>. The immutable preview is
  Cloudflare Access protected; the workflow verified the canonical production URL.
- Manifest: 130 artifacts, including `_headers`; 129 served files.
- Frontend SHA-256:
  `bbd0dc16ea4212c45eef549d7b667ba6bfefd7cfcb75555fd6e66225f2eab4a2`.
- Source fingerprint:
  `8588e690c78de319c8d73b89adc214288808bef077279a878877e896f1da3e11`.
- API: **gtl-api v45**, ACTIVE, JWT verification true, unchanged bundle
  `7640627cfd1a457729382b90f09a3b094095c63da76c62a5559038e1190c675b`.
  The workflow verified that all nine hosted function summaries stayed unchanged.
- Migration history: **72 rows**, unchanged SHA-256
  `b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`.
- Pending M-33 `20261029151727`, M-34 `20261029161613` and M-35
  `20261029162144` remain unapplied.
- Signed-out boundaries: **444 checked, 425 denied, 19 documented EPL probes
  awaiting migrations**. These are authentication-boundary checks, not proof of
  signed-in authorization.

Local implementation evidence includes 43 focused Node checks, 650 component
tests and 16 tracked-bet browser scenarios, with both themes at 320/390px,
keyboard charts, no Axe violations, unchanged fixture database state during
dashboard exploration, and the retained measured 32px ticket gap. Physical-phone
and signed-in production acceptance of Overview remain separate. No claim of
comparing every hosted player-data row is made by the release workflow.

## Rollback

Restore the prior verified frontend source
`ffaefd6427d908d6c5cfa6c6fdeba893be992eed`, Pages
`53d2991a-480e-485f-a710-7969513b8a6c`, through the normal protected frontend
release path. No database restore or API rollback is required for this batch.
