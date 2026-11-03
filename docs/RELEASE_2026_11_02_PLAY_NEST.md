# Play › Your guesses nesting cards release (D-69) — November 2, 2026

Released November 3, 2026 at 00:47 UTC (November 2, 4:47 PM PST) on Sean's approval of the
[release card, issue #426](https://github.com/seanbalz/guess-the-line/issues/426): **frontend only**, from `main` at
`ffaefd6427d908d6c5cfa6c6fdeba893be992eed` (the merge of PR #418). Sean said "Release it", then OK'd the 390 px Light
and Dark phone captures of the built screens ("Looks good, release"), as his November 2 rule asks before a change
players see goes live. No migration, Edge Function or server change.

## What shipped

**Play › Your guesses as nesting cards (PR #418, [D-69](DECISIONS.md)).** The
[design spec](superpowers/specs/2026-11-02-play-picks-nesting-cards-design.md) has the details.

- **The week:** one card of game tiles. Each tile shows your own guess only.
- **One game:** a tile opens that game's own card at its `pickGame` address.
- **Navigation:** Next replaces the open game in the trail and in browser history. Moving between the week and its
  games never asks to leave an unsaved draft.

The only commit between the previous live source `82f1c2b4` and this source is #418. PR #420, merged to `main`
later, is not in this release.

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Exact-source CI | Tests [41550795051](https://github.com/seanbalz/guess-the-line/actions/runs/41550795051), Dashboard [41550795017](https://github.com/seanbalz/guess-the-line/actions/runs/41550795017) (attempt 2), Brand [41550795039](https://github.com/seanbalz/guess-the-line/actions/runs/41550795039) | All passed |
| Check-only | [41554600723](https://github.com/seanbalz/guess-the-line/actions/runs/41554600723) | Passed |
| Readiness | [41554658751](https://github.com/seanbalz/guess-the-line/actions/runs/41554658751) | Passed at 00:42 UTC |
| Deploy | [41555022213](https://github.com/seanbalz/guess-the-line/actions/runs/41555022213) | Frontend deployed; verify passed at 00:47:28 UTC |

The push of #420 cancelled attempt 1 of the Dashboard run, which held the browser shards. It was re-run on the same
commit and passed before check-only.

## What is live

- **Frontend:** Pages **`53d2991a-480e-485f-a710-7969513b8a6c`**. All 129 assets at the production URL matched the build
  (frontend SHA-256 `777b36675f7b402c7e15590e282a053662be2eac69e961f69f972928ce71c6ca`). The previous Pages was
  `8c9b193e-45d7-4df3-8b09-e5dcdba86f9a` from `82f1c2b4`.
- **API:** `gtl-api` v45, ACTIVE, JWT verification on, bundle
  `7640627cfd1a457729382b90f09a3b094095c63da76c62a5559038e1190c675b`, unchanged.
- **Migrations:** 72 hosted rows, digest `b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`, unchanged.
  M-33, M-34 and M-35 remain pending and unapplied.
- **Boundaries:** 444 checked, 425 denied, 19 awaiting the unrelated EPL migrations.

## Signed-in readback (Mac mini Chrome, 00:50 UTC, read-only)

After a reload the page served `index-D20s26yg.js`. An open tab loaded before the release still ran the earlier bundle
until it was reloaded. Nothing was saved or locked.

- **Total, Week 9:** 15 tiles and "0 of 15 locked", in 68 words on a 1,338 px page. Before the release it was 1,317
  words on 9,043 px.
- **A tile:** opened `pickGame=JAX-BAL` with "JAX @ BAL" focused, the "Back to Week 9 · Total" lip, 11 chips and one
  lime "Lock in".
- **Browser Back:** returned to the week with no leave prompt.
- **Spread, Week 9:** "15 of 15 locked". The locked game showed its receipt and the reveal, then "Every game is
  locked in."
- **API:** `personal/read` and `personal` returned 200. No 5xx in 184 `gtl-api` requests from 00:47 to 01:05 UTC. The
  401s are the deploy's signed-out boundary probes.

## Preservation

Read-only snapshots at 00:18:19 UTC (baseline), 00:44:40 UTC (before deploy) and 00:48:07 UTC (after deploy). The
queries are the same as card #422.

| Set | Rows | MD5 |
| --- | --- | --- |
| Weekly ballots, 2026 Weeks 1–7 | 25 | `3ed491313b20fa8ab8f43d98994e1f3d` |
| Bets log (`gtl_social_commits`), Weeks 1–7 | 110 | `824c42c2dd32e16c0881cf62277e9772` |
| Points guesses, Week 8 | 20 | `3f0df7130ec937b3260fb4a6e94cd624` |
| Virtual Units picks | 7 | `2cf4b49359bb297d24925c21c99e4992` |
| Push subscriptions | 0, then 1 | — |
| `public.gtl_*` functions (signature, body, ACL, config) | 244 | `9b74caaaf5746a5ea75eb99bac82887f` |

Every set matched between before and after the deploy. Push subscriptions rose from 0 to 1 between the baseline and
the before-deploy snapshot, a player opting in after the reminders release. Nothing was rolled back.

## Not verified

- A real iPhone (390 px Home Screen app) check of the week tiles and a game card.
- A real lock-in on production: the readback was view-only. The lock-in path is covered by the cloud-browser specs
  against the real handler, not by a production write.

## Rollback

Restore Pages `8c9b193e-45d7-4df3-8b09-e5dcdba86f9a` (source `82f1c2b4`) through the protected workflow. No data needs
restoring.
