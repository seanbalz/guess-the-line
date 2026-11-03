# Points player context and reminder follow-ups release — November 2, 2026

Released November 3, 2026 at 00:16 UTC (November 2, 4:16 PM PST): **frontend only**, from
`main` at `82f1c2b4e069618c328ebdd925135645fce4fc33`. Card:
[issue #422](https://github.com/seanbalz/guess-the-line/issues/422).

Sean first saw phone mockups of both changes, in Light and Dark, on the
[GTL Release Preview](https://claude.ai/artifact/46RAayFcE4nVKvF93Crstz) and answered "OK to release".
This is the first release under his November 2 rule to show mockups before going live.
No migration, Edge Function or server change.

## What shipped

- **Points player context (PR #413, Board i63).** Each Points slot shows a Player context
  card with:
  - last-3 and season Full PPR averages, each with its game count;
  - what the opponent allowed to the position;
  - the practice or game report, with its time.

  **Open profile** opens the existing Fantasy profile as a sub-view. GTL's estimate is the
  slot's House, so it stays hidden until lock-in or kickoff. There are no implied totals.
- **Pick reminders follow-ups (PR #416).**
  - Menu › Pick reminders now also shows in the EPL section.
  - In `sw.js`, a tap on a reminder tagged `gtl-points-` opens `/#play/points`; every other
    reminder opens `/#picks`. The payload never supplies a URL.
- PR #419 is docs only. PR #418 (D-70) is not in this source and is released separately.

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Exact-main push CI | Tests [41548451481](https://github.com/seanbalz/guess-the-line/actions/runs/41548451481), Dashboard [41548451382](https://github.com/seanbalz/guess-the-line/actions/runs/41548451382), Brand [41548451314](https://github.com/seanbalz/guess-the-line/actions/runs/41548451314) | All passed |
| Check-only | [41550832685](https://github.com/seanbalz/guess-the-line/actions/runs/41550832685) | Passed |
| Readiness | [41550921401](https://github.com/seanbalz/guess-the-line/actions/runs/41550921401) | Passed at 00:11 UTC |
| Deploy | [41551294081](https://github.com/seanbalz/guess-the-line/actions/runs/41551294081) | Frontend deployed; verify passed at 00:16:37 UTC |

## What is live

- **Frontend:** Pages **`8c9b193e-45d7-4df3-8b09-e5dcdba86f9a`**. All 130 assets at the
  production URL match the build (frontend SHA-256
  `25cb429410cb97a95771e95e2a19d550bd29cc9f9e4ff5495ab9703dc8e7a31a`).
- **API:** `gtl-api` v45 (bundle `7640627c…675b`). It and the other eight functions are unchanged.
- **Migrations:** 72 rows, digest `b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`,
  unchanged. M-33, M-34 and M-35 are still pending.
- **Boundaries:** 444 checked, 425 denied, 19 awaiting the EPL migrations.

## Preservation

Read-only snapshots at 00:13:02 UTC (before) and 00:17:02 UTC (after) were identical to the
November 2 baseline. They used the queries recorded in
[RELEASE_2026_11_02_REMINDERS.md](RELEASE_2026_11_02_REMINDERS.md) and card #414.

| Set | Rows | MD5 |
| --- | --- | --- |
| Weekly ballots, 2026 Weeks 1–7 | 25 | `3ed491313b20fa8ab8f43d98994e1f3d` |
| Bets log, Weeks 1–7 | 110 | `824c42c2dd32e16c0881cf62277e9772` |
| Points guesses, Week 8 | 20 | `3f0df7130ec937b3260fb4a6e94cd624` |
| Virtual Units picks | 7 | `2cf4b49359bb297d24925c21c99e4992` |
| Push subscriptions | 0 | — |
| `public.gtl_*` functions | 244 | `9b74caaaf5746a5ea75eb99bac82887f` |

The Fantasy football session independently read the same values at 00:17:27 UTC. It also
confirmed that the live bundle contains "Player context" and that `sw.js` has the
`gtl-points-` mapping.

## Live readback (Sean's signed-in Chrome, about 00:20 UTC)

- **Play › Points, Week 8 QB slot.** The Player context card shows real data: last 3 at
  19.3 over 2 games, season 20.9 over 4 games, "@ SEA allows 10.4 to QBs · 7 games",
  "Game availability not confirmed · as of Nov 1, 8:01 AM PT", and Open profile. The
  game counts are correct: in nflverse `stats_player_week_2026` he has rows only for
  Weeks 1, 2, 6 and 7 (Chicago started other quarterbacks in Weeks 3–5), so "last 3"
  covers Weeks 5–7 with 2 games. Checked by the Fantasy football session on November 2.
- **EPL section.** The Menu lists Pick reminders. The app was switched back to NFL afterwards.
- **Not exercised.** No reminder was turned on and no reminder tap was exercised.

## Not done

- Opening a Points reminder on a real phone. There are still 0 subscriptions.
- Phone acceptance of the Player context card and profile.

## Rollback

Restore Pages `6c458d6d-a845-45a9-a213-e1db661feb64` (source `e7a38c6`) through the
protected workflow. No data to restore.
