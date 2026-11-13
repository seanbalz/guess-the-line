# Direct Player Props tab release — November 11, 2026 Pacific

The **Player Props** tab beside **Overview** on NFL Play was verified live at 9:24 p.m.
Pacific. It opens the athlete picker for the published week. The prior mockup
approval covers both themes. [Open Player Props](https://guess-the-line.pages.dev/#play/props)

Sean answered “yes” to deploying the approved tab once the main checks passed.
The implementation merged in [PR #557](https://github.com/seanbalz/guess-the-line/pull/557)
at `13d9f8deacffed25aaa822447d5329028cbb84cb`. The next documentation merge
canceled its Dashboard checks. The release uses that successor
`6a3e02e9701ed7f8a74dc5f48ffaeb9996c1c39c`, whose app, server and build inputs match
the approved merge. All required push checks passed on the release source.
[Tests](https://github.com/seanbalz/guess-the-line/actions/runs/43157545805) ·
[Dashboard checks](https://github.com/seanbalz/guess-the-line/actions/runs/43157545686) ·
[Brand QA](https://github.com/seanbalz/guess-the-line/actions/runs/43157545704)

| Evidence | Verified result |
| --- | --- |
| Source and protected readiness | [43160257341](https://github.com/seanbalz/guess-the-line/actions/runs/43160257341) and [43160390856](https://github.com/seanbalz/guess-the-line/actions/runs/43160390856) passed on the release source. |
| Production deployment | [43160804793](https://github.com/seanbalz/guess-the-line/actions/runs/43160804793), target `frontend`. The workflow controller was `e22b0933af3998eb831b3881ffcf5c28dd1b5420` and built the pinned release source above. |
| Pages | `eee359a9-46fc-413a-b585-790cdd114648`. All 176 production assets matched the build. The immutable deployment URL is Access-protected. |
| Source and frontend digests | Source SHA-256 `44ece4aaa0b9c1802c6255a6320527e300e1ac29227d12bffb6d85fa22b626fd`. Frontend SHA-256 `d4c8c62ba38023e2d32b01355a0c92e8ee0b411cded0a55b26dea2a03df68430` matched both readiness and production verification. |
| Player Props API | `gtl-api` v56, ACTIVE with JWT verification. Bundle SHA-256 `85f4191c2c6e29cb5eb5fc78b28701fefd8edc661484bae7b91b915f0e0d0e95`. The frontend uses `VITE_GTL_PLAYER_PROPS=on`, with API flag sync off. |
| Hosted history and schedule | 86 records, SHA-256 `5dd179dce5d388163cb6f17b6b84aa6b5cdfe8666298fd9284a7a6e29871b382`, before and after. The pinned release had zero pending migrations. Week 10 passed the schedule check with time restrictions disabled. |
| Signed-out boundary | 519 of 519 denied, zero awaiting. Five Player Props RPCs retained service-only execution. |
| Rollback | Previous verified Pages `060f35c4-12a2-4d88-9e43-50cb4084f241` from `1aaf32d3dcd7b565213d6783dc2116c87472b322`, target `frontend`. [Prior release](https://github.com/seanbalz/guess-the-line/actions/runs/43146347808) |

## Record preservation

Read-only checks at 9:21 and 9:24 p.m. Pacific returned the same counts and
aggregate MD5s. The Player Props audit, reference, result and locked-guess
comparisons used the same pre-deploy cutoff at `2026-11-12T05:21:36.310585+00:00`.
Each digest covers the sorted JSON form of the complete rows in its scope.

| Scope | Rows | MD5 before and after |
| --- | ---: | --- |
| Earlier-week ballots | 44 | `5760dfe164c5fed6da6c649a5fe59d4d` |
| Locked Player Props guesses | 1 | `3746b3a2262f8a7b5027d40ea2264ae9` |
| Player Props capability | 1 | `4f0ffacd10404159b294529ad922029b` |
| Player Props guess audit | 2 | `7c4e95f089975278515dcaf439f9ee6f` |
| Player Props offers | 31 | `b4d0c7440954c2bbd4992d2bec80ac0e` |
| Player Props references | 32 | `23bb0c747085411c8bd324ebcf2ff8ef` |
| Player Props results | 0 | `d751713988987e9331980363e24189ce` |
| Earlier-week settled Virtual Units | 7 | `0008b4d1cda73fec4aae09a7c582b9b5` |

## Frontend verification

The production HTML, the Play tab chunk `assets/NextApp-BNONV1Q0.js` and
the athlete picker chunk `assets/PlayerPropsEntry-DHISX7qw.js` matched their manifest
hashes. Browser tests used signed-in fixtures in both themes at 320px and
390px, including Back with a dialog open, typed draft retention, and a saved
lock receipt after a failed re-entry read. Physical iPhone acceptance remains
a separate check.

The later main commit includes the on-demand refresh in
[PR #555](https://github.com/seanbalz/guess-the-line/pull/555). Its M-48 apply
and API release remain in the on-demand refresh queue.
