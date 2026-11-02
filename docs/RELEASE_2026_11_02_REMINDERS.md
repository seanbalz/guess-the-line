# Pick reminders and My bets search release — November 2, 2026

Released November 2, 2026 at 23:06 UTC (3:06 PM PST) on Sean's approval of the
[release card, issue #414](https://github.com/seanbalz/guess-the-line/issues/414):
**frontend only**, from `main` at `e7a38c6e9017a9c49cdf2a526482c05f8219f29f` (the merge of
PR #411). Card [#410](https://github.com/seanbalz/guess-the-line/issues/410) described
the same source for PR #408; one deploy covered both. No migration, Edge Function or
server change.

## What shipped

- **Pick reminders opt-in (PR #411, Board i39).** Menu › Pick reminders, one switch per
  device, and a one-time "Turn on reminders / Not now" prompt under Play's Points card.
  It uses the existing `web/src/webPush.js` and `/push/*` routes. Permission is asked
  only on a tap. Before this release there were 0 push subscriptions, because the only
  opt-in lived in the retired old app.
- **My bets spacing and searchable entry (PR #408).** See
  [RELEASE_2026_11_02_MY_BETS.md](RELEASE_2026_11_02_MY_BETS.md).
- PR #409 (Fantasy refresh workflow and snapshot retention) has no app code. Its
  `shared/fantasy-index.mjs` change affects only the publisher's `assetsToPrune`.

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Exact-main push CI | Tests [41540130228](https://github.com/seanbalz/guess-the-line/actions/runs/41540130228), Dashboard [41540130137](https://github.com/seanbalz/guess-the-line/actions/runs/41540130137), Brand [41540130106](https://github.com/seanbalz/guess-the-line/actions/runs/41540130106) | All passed |
| Check-only | [41541751112](https://github.com/seanbalz/guess-the-line/actions/runs/41541751112) | Passed |
| Readiness | [41541822704](https://github.com/seanbalz/guess-the-line/actions/runs/41541822704) | Passed at 23:00 UTC |
| Deploy | [41542487945](https://github.com/seanbalz/guess-the-line/actions/runs/41542487945) | Frontend deployed; verify passed at 23:06:54 UTC |

## What is live

- **Frontend:** Pages **`6c458d6d-a845-45a9-a213-e1db661feb64`**. All 127 assets at
  the production URL matched the build (frontend SHA-256
  `a9899524220c8df40fa8f5da2b1dd0871bfe4a222b87521336afb2dbae71042d`).
- **API:** `gtl-api` v45, ACTIVE, JWT verification on, bundle
  `7640627cfd1a457729382b90f09a3b094095c63da76c62a5559038e1190c675b`, unchanged. The
  other eight functions are also unchanged.
- **Migrations:** 72 hosted rows, digest
  `b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`, unchanged.
  M-33, M-34 and M-35 remain pending and unapplied.
- **Boundaries:** 444 checked, 425 denied, 19 awaiting the unrelated EPL migrations.
  This is not 444 denials.

## Preservation

Read-only snapshots at 22:51:46 UTC (baseline), 23:03:51 UTC (before deploy) and
23:07:26 UTC (after deploy) were identical:

| Set | Rows | MD5 |
| --- | --- | --- |
| Weekly ballots, 2026 Weeks 1–7 | 25 | `3ed491313b20fa8ab8f43d98994e1f3d` |
| Bets log (`gtl_social_commits`), Weeks 1–7 | 110 | `824c42c2dd32e16c0881cf62277e9772` |
| Points guesses, Week 8 | 20 | `3f0df7130ec937b3260fb4a6e94cd624` |
| Virtual Units picks | 7 | `2cf4b49359bb297d24925c21c99e4992` |
| Push subscriptions | 0 | — |
| `public.gtl_*` functions (signature, body, ACL, config) | 244 | `9b74caaaf5746a5ea75eb99bac82887f` |

Each MD5 is `md5(string_agg(row::text, '|' order by key))`, using the queries in card #414.

## Live readback

On November 2 at about 23:08 UTC, in Sean's signed-in Chrome:

- Play showed "Get a nudge before picks are due" with **Turn on reminders** and **Not now**
  under the Points card. That prompt only renders while `/community/read` reports
  `pushConfigured: true`.
- Menu listed **Pick reminders** between Settings and Guidance and sources.
- Neither control was tapped, so no permission was asked and no subscription was made.

## Not done

- Turning reminders on from a real iPhone Home Screen app and receiving one (Board items
  15 and 39). Push subscriptions are still 0 until a player turns them on.
- Two follow-ups noted on PR #411: the Menu row shows on the NFL side only, and a Points
  reminder opens Spread/Total picks.
- Phone acceptance of the My bets changes (card #410).

## Rollback

Restore Pages `90a7bf99-10b2-4390-abf2-4140c7b95d80` (source
`46097802899472cdfb1bdb00c7c50248e2f24dab`) through the protected workflow. If any player
has turned reminders on by then, disable the `deadline-2h` schedule row first, because
the old frontend has no switch to turn them off.
