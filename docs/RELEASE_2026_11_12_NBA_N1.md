# NBA N1 frontend release — November 12, 2026 UTC (November 11 Pacific)

**Deployed and verified.** The `frontend` release from `main` at `cac63e7a` shipped Pages
`b8019df1`, which carries NBA N1 ([PR #542](https://github.com/seanbalz/guess-the-line/pull/542)):
NBA in the Prism shell, the official NBA league and team logos, the legacy-link redirects and the
tracker fixes (D-85). `gtl-api` stays v55. No migration, schedule, flag, secret or provider credit
changed. NBA stays off the sport switch (`NBA_ON_SWITCH = false`).

## Approval

Sean, in this session (`42c1a86c`), on November 11, 2026: **"Yes, deploy"**, answering "Deploy the
website with NBA N1 once main's CI passes?". He had merged PR #542 himself at 20:47:34 UTC after
the four real-build captures were sent to him (mockups before release), and merged the records
[PR #544](https://github.com/seanbalz/guess-the-line/pull/544) after it.

## The release

| Evidence | Result |
| --- | --- |
| Run | [43124865004](https://github.com/seanbalz/guess-the-line/actions/runs/43124865004), Shared production release, deploy mode, success; dispatched by this session at 00:06:48 UTC; production gate approved by this session under "Yes, deploy" |
| Lane | Empty before dispatch (last release 43064597743 at 17:04 UTC); re-checked after dispatch, one run only |
| Source | `main` at `cac63e7a0d10a38b4badc41c663a763b5301aee4` (PR #542 and PR #544 on top of `477da9e8`) |
| CI on that SHA | Tests 43115079731, Dashboard checks 43115079713, Brand QA 43115079897: all success |
| Inputs | target `frontend`; release card [PR #542](https://github.com/seanbalz/guess-the-line/pull/542); `migration_history_sha256` `5dd179dce5d388163cb6f17b6b84aa6b5cdfe8666298fd9284a7a6e29871b382` (86 rows, read fresh through the read-only connector before dispatch); `compatibility_reviewed` true |
| Compatibility | `supabase/` and `cloud/` are unchanged from `5105abed` (the v55 source). The new `shared/nba-grade.mjs` and `shared/nba-teams.mjs` are not imported by any function. N1 calls only `lobby`, `nba/games`, `nba/read` and `nba/save`, all served by v55 (`cloud/nba.mjs` `NBA_METHODS`) |
| Pages | `dc662a68-ec54-4080-bce3-b89d6aa0899d` (from `5105abed`) to **`b8019df1-f084-4ce7-bbb8-99757902b6dd`**; deployment URL protected; production URL checked, 176 assets |
| Frontend SHA-256 | `988570448bcc405ffb3233ca6118ab0994372cc138a5bb584281db76a12dd461` |
| API | `gtl-api` v55 unchanged, ACTIVE, `verify_jwt` true, bundle `85f4191c2c6e29cb5eb5fc78b28701fefd8edc661484bae7b91b915f0e0d0e95` |
| Boundary | 519 checked, 514 denied, 5 awaiting (the Player Props routes under flag `GTL_PLAYER_PROPS`); `pendingRepoMigrations` empty |
| History | 86 rows before and after; digest unchanged |

## After the release (executed)

- **Assets.** `/team-logos/nba/LAL.png`, `BOS.png` and `ATL.png` answer 200 `image/png`;
  `/team-logos/nba/sources.json` answers 200 on the production URL.
- **Hosted logs** 00:08 to 00:40 UTC: no 5xx. Signed-out probes answered 401 (and 404 for the
  flagged Props routes) on v55.
- **Signed-in view** (Sean's Chrome, view only, nothing saved or confirmed): `#nba/home` drew the
  NBA Home in the Prism shell with the official NBA mark selected beside the NFL shield and
  Premier League lion, tonight's 10 games with team logos, and the "Needs your result" list.
  Logs: `POST /gtl-api/nba/games` 200 and `POST /gtl-api/nba/read` 200 (twice) on v55.
- A bare `#nba` (no path) opens the ordinary Home, as the N1 route contract specifies
  (`tests/nba-shell-route.test.mjs`); every `#nba/...` address opens NBA.

## Not verified or not done

- The physical-iPhone check.
- ~~NBA on the production sport switch (spec question 5, Sean's word).~~ Shipped in the second
  release below.
- N2 to N4 (D-85 decisions 3 to 5 are records only). The stale Codex NBA worktree (spec
  question 8) is untouched.

## Rollback

Re-deploy the previous frontend (`5105abed`, Pages `dc662a68`) through the same workflow
(`target frontend`, `source_sha 5105abedadd0c0913de503b01a7413770d4910f9`). No data or migration
is involved; tickets saved through `/nba/save` are unaffected.

## Second release: NBA on the sport switch — November 12, 2026 UTC (November 11 Pacific)

**Deployed and verified.** Sean answered **"Yes, show NBA"** (D-85 item 6). PR
[#546](https://github.com/seanbalz/guess-the-line/pull/546) set `NBA_ON_SWITCH = true`. It was
merged by this session at 01:09:02 UTC as `875c9ceb`, after all twelve PR checks passed at head
`2933da6a`.

`875c9ceb`'s Dashboard checks were cancelled by the next push to `main`. Sean then said
**"Just deploy latest main instead"** and **"deploy"**. Main kept moving, and each new push
cancelled the previous Dashboard run. The release therefore went from the first `main` commit
whose three push workflows all succeeded.

| Evidence | Result |
| --- | --- |
| Run | [43146347808](https://github.com/seanbalz/guess-the-line/actions/runs/43146347808), deploy mode, success. Dispatched by this session at 03:10:06 UTC, with the lane empty. Production gate approved by this session under Sean's words |
| Source | `main` at `1aaf32d3dcd7b565213d6783dc2116c87472b322` |
| What it adds over the live `cac63e7a` | PR #546 (NBA on the switch) and #545 (the N1 record); #543 (sign-in hooks split, code only); #549 (pinned GitHub actions, explicit TLS); #540 and #541 (D-84 records); #552 (the Player Props API flag sync option in the release workflow); #550 (Gap follow-up docs). No `supabase/`, `cloud/` or `shared/` change since `cac63e7a` |
| Inputs | target `frontend`; release card [PR #546](https://github.com/seanbalz/guess-the-line/pull/546); `migration_history_sha256` `5dd179dce5d388163cb6f17b6b84aa6b5cdfe8666298fd9284a7a6e29871b382` (86 rows, read fresh); `compatibility_reviewed` true; `sync_player_props_api` left at its default `false`, so this release did not touch the Player Props API flag |
| Pages | `355329af-8c61-44d2-9681-a912ff0dbf75` (from `cac63e7a`, the Player Props frontend release run 43143702762 dispatched outside this session) to **`060f35c4-12a2-4d88-9e43-50cb4084f241`**; production URL checked, 176 assets |
| Frontend SHA-256 | `1b8b3103faea666b674124a651d7d899c1f51d32988dec4ee463bfd911a410ff` |
| API | `gtl-api` v56, ACTIVE, `verify_jwt` true, bundle `85f4191c2c6e29cb5eb5fc78b28701fefd8edc661484bae7b91b915f0e0d0e95` (the v55 bundle; the version moved with the Player Props flag outside this session). Unchanged by this release |
| Boundary | 519 checked, 519 denied, 0 awaiting |
| History | 86 rows before and after; digest unchanged |

**After the release (executed):**

- **Signed in, view only** (Sean's Chrome, Browser 4; nothing saved). The session restored through
  the new sign-in hooks of #543. NFL Home drew three circles: NFL selected, then Premier League and
  NBA. Tapping NBA opened `#nba/home` with the NBA circle selected and tonight's games.
- **Hosted logs** 03:12 to 03:40 UTC: no 5xx. Signed-in `lobby`, `community/read`, `personal`,
  `lines/read`, `me/preferences`, `league/features`, `nba/games` and `nba/read` all answered 200
  on v56.

**Not verified:** the physical-iPhone check; a fresh email or Google sign-in through the new
hooks (only a restored session was seen).

**Rollback:** re-deploy `cac63e7a` (`target frontend`). With `NBA_ON_SWITCH` back at `false` on
a new commit, the NBA circle leaves NFL and EPL screens. No data or migration is involved.
