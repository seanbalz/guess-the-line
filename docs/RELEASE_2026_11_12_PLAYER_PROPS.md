# Player Props pregame release - November 12, 2026 UTC

Owner: Sean Balsiger. Version 1.

Player Props opened at 02:52:26 UTC on November 12, or 6:52 p.m. Pacific on
November 11. Players select an athlete and stat for an upcoming game under
Play, Your guesses, Player Props. A locked guess reveals its verified market
line and records accuracy immediately. The paper record awaits verified final
stats.

## Approval and scope

Sean confirmed the Player Props visual set and asked to "make the update and
launch" after clarifying the weekly sportsbook line guessing flow. The
release reused the already-approved production app source with the Player
Props build flag enabled. The [pilot](https://github.com/seanbalz/guess-the-line/pull/548)
used six credits to collect passing, rushing and receiving yard lines across
two games. Activation used the retained quotes.

| Evidence | Result |
| --- | --- |
| App source | `cac63e7a0d10a38b4badc41c663a763b5301aee4` |
| Source checks | [Tests](https://github.com/seanbalz/guess-the-line/actions/runs/43115079731), [Dashboard checks](https://github.com/seanbalz/guess-the-line/actions/runs/43115079713) and [Brand QA](https://github.com/seanbalz/guess-the-line/actions/runs/43115079897) passed on the exact source. |
| Release controls | [PR #552](https://github.com/seanbalz/guess-the-line/pull/552) merged at `60a4ecde97b2d106ec64fa8b5a22bf4ea6390942`. Local preflight tests, independent review and required PR CI passed. |
| Readiness | [Run 43139710030](https://github.com/seanbalz/guess-the-line/actions/runs/43139710030) verified the enabled build, published slate and migration history. |
| Frontend deployment | [Run 43143702762](https://github.com/seanbalz/guess-the-line/actions/runs/43143702762), target `frontend`, passed. Pages deployed `355329af-8c61-44d2-9681-a912ff0dbf75`. |
| Served assets | 176 production assets matched the manifest. Build digest `38cad45966387fdfbbaa8e40d143ad68f83cf172d96281b5b0df824fb00ac9ff`. The immutable deployment URL is protected. |
| API | `gtl-api` v56 before and after Pages, ACTIVE, JWT verification enabled. The bundle digest `85f4191c2c6e29cb5eb5fc78b28701fefd8edc661484bae7b91b915f0e0d0e95` matches the v55 readiness readback. |
| Migration history | 86 rows, zero pending. Digest `5dd179dce5d388163cb6f17b6b84aa6b5cdfe8666298fd9284a7a6e29871b382` matched before and after. |
| Sign-in boundary | 519 of 519 denials passed. All five Player Props routes separately returned the handler's signed-out 401. |

The [first deploy attempt](https://github.com/seanbalz/guess-the-line/actions/runs/43142651775)
received Supabase 403 on the optional API flag update and skipped Pages.
Sean set `GTL_PLAYER_PROPS=on` in the Supabase dashboard. The successful
frontend run used that verified setting with API flag sync off.

## Hosted activation and remaining checks

After Pages verification, a guarded transaction set the singleton
`gtl_prop_capability.live_lock_in` to true. It rechecked the Week 10 slate,
two games with fresh references, migration history and grants. It compared
all seven retained Player Props tables before and after the flag update and
confirmed matching digests. A separate readback confirmed lock-in and
capability readiness, 31 offers and references, 34 reviews and private
table access. No migration was applied.

The readback at 02:53 UTC found 31 eligible markets across two games. Those
references start expiring at 11:26:42 p.m. Pacific on November 11 and the
last expires at 11:29:22 p.m. Future lock-ins require fresh verified lines.
The results job can run after each game has a qualifying final stats release.
A signed-in phone walkthrough remains pending.

## Rollback

Set `live_lock_in` to false in the singleton row to pause lock-in and
preserve every saved guess. Set the API flag to `off` in the Supabase
dashboard, then unset the repository build flag and restore Pages
`b8019df1-f084-4ce7-bbb8-99757902b6dd` or deploy the reviewed source with
the build flag off. Recheck the hosted capability, routes and assets.
