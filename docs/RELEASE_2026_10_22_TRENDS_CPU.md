# Guess The Line — weekly Trends CPU fix, game-sheet trends and phone scrolling release

Owner: Sean Balsiger · October 22, 2026 · Deployed and verified (API then frontend)

This protected release ships the work merged since API v31 and Pages `f092e744`:

- **Weekly Trends CPU fix** ([PR #182](https://github.com/seanbalz/guess-the-lines-repo/pull/182)):
  the server seed carries the prepared 2025 history, so each `/trends/week` request
  processes only the current season. From API v31 on, every signed-in request hit
  the Edge CPU limit (HTTP 546). See the
  [weekly and player Trends record](WEEKLY_PLAYER_TRENDS_RELEASE.md#october-22--hosted-cpu-outage-and-prepared-history-fix-claude-code).
- **Game-sheet trend cards** ([PR #180](https://github.com/seanbalz/guess-the-lines-repo/pull/180)):
  weekly trend cards stay in the game sheet when research has none.
- **Phone scrolling** ([PR #181](https://github.com/seanbalz/guess-the-lines-repo/pull/181),
  Q03 / UX-NEXT-01): focused controls stay clear of the tab bar and top bar.

No migration is part of this release. M-10 and both D-53 migrations remain
pending for a separate Gate M apply.

The runs below were dispatched under Sean's account. Sean then asked Claude Code
to finish the release for Codex ("Do it for codex"); Claude Code wrote this record
from the workflow runs and their logs. The release card is PR #182.

## Gates and identifiers

Source: `main` at `8dccc5c9e0c4bfe66f2ed093ac3d2ec9bad0b100`. All three required
push workflows passed on that SHA:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39814675496),
[Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39814675596)
(including Persona) and
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39814675506).

| Gate | Run | Result |
| --- | --- | --- |
| Source | [39820215519](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39820215519) | Exact source and main CI verified |
| Readiness | [39820267779](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39820267779) | Refused at the source gate: "test.yml: no main push run exists for the exact source SHA" |
| Readiness | [39821030893](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39821030893) | Passed on retry; hosted state checked |
| API then frontend | [39821362374](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39821362374) | Deployed and verified at 17:20:10 UTC |

The Tests push run had already passed at 16:43 UTC when the first readiness run
refused, and the retry five minutes later found it. A later check-only run
([39826998771](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39826998771),
17:56 UTC) re-verified the same source and deployed nothing.

- **API:** `gtl-api` **v32**, ACTIVE, JWT verification on, bundle SHA-256
  `92ad9bbd4b358a8651d3e0a810f2c36e687bb90f228928de91099a74f34ea93e`. The verify
  step passed, including its check that the other Edge functions kept their
  versions and configuration.
- **Frontend:** Pages **`9fb54fe4-d7f0-41ea-a925-a0d86dbf277e`**. The workflow
  checked 98 served assets at [the immutable URL](https://9fb54fe4.guess-the-line.pages.dev)
  and at [production](https://guess-the-line.pages.dev); frontend SHA-256
  `6d486dd8edbf12c0f54e69f350333fdcda010c2df87144bd16cb7e52fd872d62`.
- **Migrations:** digest
  `c571cd2de3d53ae0239a98d792cd0a1b542c2cbdda08190d2fa98ca4b126910f`, unchanged.
  The three pending repository migrations (`20261015190820`, `20261016010000`,
  `20261016011000`) were not applied.
- **Boundaries:** 272 signed-out probes after the deploy: 266 denied and six
  awaiting, the documented RPCs of the pending migrations.

## Not verified in this record

- The workflow reports `apiSourceVerified: false`. Earlier records matched the
  retrieved API source files to the release commit. The session that wrote this
  record has no Supabase read permission, so the v32 source has not been
  independently matched to `8dccc5c`.
- That session's network policy blocks `guess-the-line.pages.dev`. Separately, the
  session behind [PR #183](https://github.com/seanbalz/guess-the-lines-repo/pull/183)
  fetched all 98 manifest assets from production and found every SHA-256 matched,
  and confirmed the served CSS carries the Q03 `scroll-padding` rules.
- No read-only preservation snapshot was taken for this release.
- The CPU fix has not been read back on the hosted API: a signed-in
  `/trends/week` request returning this week's trends instead of HTTP 546.

## Rollback and open checks

Rollback: restore Pages `f092e744-ef2e-427a-9328-dac3006a45ea` and redeploy the API
from `7e9a8a1` (v31 source). Rolling the API back brings the CPU outage back;
`GTL_FEATURE_OFF` can switch off `trends` without a deploy. No data or migration
rollback is needed.

Still open:

- Independent match of the v32 API source to `8dccc5c`, from a session with
  Supabase read access.
- Signed-in readback that weekly Trends load without HTTP 546, and that Week 8
  publishes when it opens Monday, October 26.
- Real-iPhone acceptance of the phone scrolling fix and the game-sheet trend
  cards, in Light and Dark.
