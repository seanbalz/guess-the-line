# Release card: frontend at 9460635 (feed post lines, Points Publish now, Research table) — October 27, 2026

Sean, October 27, 2026, after [#278](https://github.com/seanbalz/guess-the-lines-repo/pull/278) was opened and he was
asked whether to ship it in a frontend release once it merges: "Continue". This card ships `main` now that #278 is
merged and `main` is green on it, the same way as
[RELEASE_2026_10_27_PLAY_HOME_FRONTEND.md](RELEASE_2026_10_27_PLAY_HOME_FRONTEND.md).

- **Source:** `main` at **`9460635061869de4091d85accd4bf0a11482f47f`** (#278). Push CI on this exact SHA: Tests
  [40608746483](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40608746483), Dashboard checks
  [40608746454](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40608746454), Brand QA
  [40608746416](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40608746416), all success.
- **Order:** `frontend` only.
- **What ships** over the live frontend (`6b9c3d2`, Pages `5d400209`):
  - [#278](https://github.com/seanbalz/guess-the-lines-repo/pull/278) feed post lines: the weekly recap and the season's
    awards lead with the Guess The Line mark ("Week 7 awards are in", "2026 season awards are in") instead of reading
    as the week's publisher "posted an update"; a badge post reads "earned a Week 8 badge" and a streak post "hit a
    streak milestone"; each opens Badges and awards. The hosted feed has one such post today, the Week 7 recap.
  - [#277](https://github.com/seanbalz/guess-the-lines-repo/pull/277) (another session) Points: the community
    commissioner sees a drafted week's preview and Publish now on Play › Points, through the existing
    `POST /points/slate` preview and publish actions. Players see nothing new.
  - [#275](https://github.com/seanbalz/guess-the-lines-repo/pull/275) (another session) Research: a table that fails to
    load stays local to its card and can be retried.
  - #276 is the release 2 card only.
- **API:** not deployed. No file under `supabase/`, `cloud/` or `shared/` changed between `6b9c3d2` and `9460635`;
  `gtl-api` v38 (`1647f94a…`) stays.
- **Compatibility:** no new route. #277 calls `POST /points/slate` (`cloud/points.mjs`, unchanged and served by v38;
  gtl-api checks the commissioner grant again); #278 and #275 read nothing new.
- **Migrations:** none. Hosted history at release 2: **63 rows,
  `8a02c480d273a532082411166e08f794a9b71ca6636028adfad09709adee91bb`**; readiness below re-reads it.
  `20261027160000` (D-61 odds, reported run by Sean, hosted version not recorded) and `20261026220000` (D-59) are not
  needed.
- **Rollback:** redeploy the frontend from `6b9c3d2` (Pages `5d400209-ecfb-4493-a0b4-0f84ea1b7ef3`).

## Readiness

[Run 40611255315](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40611255315), observed 00:51:43 UTC on
October 28, gate approved through the GitHub API as Sean's account after the title matched: source and exact-SHA CI
verified; 63 rows and the digest above; Week 8 published (28 games); `gtl-api` v38 (`1647f94a…`) and every worker
unchanged since release 2; previous Pages `5d400209` from `6b9c3d2`; 376 signed-out probes, 376 denied.

It ran once an older readiness run was out of the way:
[40599910008](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40599910008) (frontend at `671e3ec`,
dispatched from outside this PC's sessions) had waited at its gate since 23:07 UTC and held the release concurrency
group, so this run queued behind it. It was cancelled unapproved: it was read-only, deployed nothing, and `9460635`
contains `671e3ec`.

## Results

Pending.
