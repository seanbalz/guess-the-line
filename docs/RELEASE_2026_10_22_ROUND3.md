# Guess The Line — round 3 redesign release (frontend)

Owner: Sean Balsiger · October 22, 2026 · Deployed and verified (frontend only)

Sean asked Claude Code to "Run the protected frontend release for main (round 3)
through the shared release workflow, with the usual readiness checks." This
protected release ships the round 3 redesign on top of API v31 and Pages
`af617cd2`:

- **Round 3 redesign** ([PR #177](https://github.com/seanbalz/guess-the-lines-repo/pull/177), D-55):
  - Trend rows in the game sheet, All trends and research open a chart card: a
    headline number, a line you can drag, a by-season view and at most three tiles.
  - Fine print moved behind ⓘ buttons and into Menu › Guidance and sources.
  - Home and Bets follow boards R3 and R4.
  - The D-55 tokens and brand guide section are included.
- Documentation only: the previous release record (#178).

No migration and no API change are part of this release. Since `7e9a8a1`, nothing
under `cloud/` or `supabase/` changed. `shared/trends-view.mjs` and
`shared/home-view.mjs` are imported only by the web app, so API v31 serves the new
frontend unchanged. M-10 and both D-53 migrations remain pending for a separate
Gate M apply.

## Gates and identifiers

Source: `main` at `b917d79f3d814210babbf5523c5874e06bd1d418`. All three required
push workflows passed on that SHA:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39736123282),
[Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39736123240)
(including Persona) and
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39736123575).
The release card is in PR #177.

| Gate | Run | Result |
| --- | --- | --- |
| Source | [39753090527](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39753090527) | Exact source and main CI verified |
| Readiness | [39753159922](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39753159922) | Hosted state checked; API v31 and Pages `af617cd2` baseline |
| Frontend | [39753484288](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39753484288) | Deployed and verified at 09:13:37 UTC |

Both protected runs were approved in the `production` environment under Sean's
request above.

- **Frontend:** Pages **`f092e744-ef2e-427a-9328-dac3006a45ea`**, built from a
  clean checkout of `b917d79`. Frontend SHA-256
  `9d8bf8257f82792a16f027a3752606431fd3f03836da8f4179db5d314edecdc9`. The workflow
  checked 98 served assets at each URL.
- **Independent asset check:** each of the 98 manifest assets was fetched again from
  [the immutable URL](https://f092e744.guess-the-line.pages.dev) and from
  [production](https://guess-the-line.pages.dev).
  - All 196 fetches matched the manifest's SHA-256.
  - `_headers` is not served, so it was not fetched.
  - The served code contains the round 3 markers: `Guidance and sources`, the
    `gx-tc-` chart classes and the `gx-info` dialog.
  - Signed out, the production page renders the sign-in screen with no console
    errors.
- **API:** `gtl-api` **v31**, ACTIVE, JWT verification on. Its bundle SHA-256
  `c1716c4d31ef2d0b0358651f796ea41c2fde58bec420e8a64da4b73246c801e5` is unchanged.
  Odds v5, week-open v4, push v3 and results v2 also kept their versions and
  bundle hashes.
- **Migrations:** 46 hosted, digest
  `c571cd2de3d53ae0239a98d792cd0a1b542c2cbdda08190d2fa98ca4b126910f`, unchanged.
  The three pending repository migrations (`20261015190820`, `20261016010000`,
  `20261016011000`) were not applied.
- **Boundaries:** 272 signed-out probes before and after the deploy. Each time,
  266 were denied and six were awaiting: the documented RPCs of the pending
  migrations.
- **Schedule:** Week 7 of 2026 is published, with 28 games. No time restrictions
  apply (October 19 policy).

## Preservation

Two read-only hosted snapshots matched in count and in ordered whole-row MD5:
04:57:05 UTC (after the previous release) and 09:14:58 UTC (after this deploy).
They cover 17 public tables, both `nba_private` tables and all 126 `gtl_*` function
definitions with their configuration and grants
(`d65491d0b2810fd7bce18b1815218cd1`). No snapshot was taken just before this
deploy. Because the two snapshots match, nothing changed in that whole window,
which includes this deploy.

| Data | Rows | MD5 |
| --- | ---: | --- |
| Weekly ballots | 23 | `a45bf0bf9c59e4543407f544e86d6987` |
| Social commits | 101 | `ea8de1440cc94cda79f188eb3433ca7b` |
| Social weeks | 3 | `e2f2585903d04376035be78773b399fe` |
| Leagues | 5 | `a1f06fa4c7aadced4df70a33d57437fb` |
| Memberships | 9 | `04975f153218ad4228399f5929927c76` |
| Virtual Units picks | 7 | `7d4859aeb58ce26d13cd6a00274e6bb8` |
| Personal events / receipts / versions | 17 / 17 / 6 | `962ad7b0…` / `5410ce89…` / `c2b0a74e…` |
| Private NBA imports / bets | 3 / 10 | `8e0fecd9…` / `4851d47b…` |

## Rollback and open checks

Rollback: restore Pages `af617cd2-e6bd-4623-a961-7eb7015e70f6` (from `7e9a8a1`).
No API, data or migration rollback is needed.

Still open:

- Signed-in confirmation of the round 3 views on a real phone, in Light and Dark:
  - the game sheet trend cards, including dragging the line;
  - the ⓘ dialogs and Menu › Guidance and sources;
  - Home and Bets.
- Hosted signed-in pages were not opened in this release. The browser checks ran on
  local fixtures in CI.
