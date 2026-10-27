# Release card: frontend at 21f9799 (touch and gestures, chart scales) — October 27, 2026

Sean, October 27, 2026: "Once #264, #266 and #268 are merged and main's CI passes on that SHA, run the frontend release
(preflight, then the frontend target) and approve its gate. Record it in a release card." Then, at about 20:55 UTC with
#268 and #264's follow-up fix [#271](https://github.com/seanbalz/guess-the-lines-repo/pull/271) still in CI: "deploy".
This card ships the newest `main` commit whose push CI is green now. Play (#264) and Home and League (#268) follow on a
second card once #271 and #268 merge and `main` is green again (main's Dashboard checks failed on `0de57b6` and
`a6d655e` on the two lock-in buzz tests #271 fixes).

- **Source:** `main` at **`21f9799064cf5f853279de7378449ff98307b475`** (#267). Push CI on this exact SHA: Tests
  [40577102112](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40577102112), Dashboard checks
  [40577102119](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40577102119), Brand QA
  [40577102711](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40577102711), all success.
- **Order:** `frontend` only.
- **What ships** over the live frontend (`a887fd1`, Pages `84cba88f`):
  - [#266](https://github.com/seanbalz/guess-the-lines-repo/pull/266) touch and gestures: press feedback on every kit
    control (0.97 and a dim, transform and opacity only), a 10 ms tick on primary buttons where the device vibrates,
    swipe down to close a sheet, swipe between games in the game sheet ("2 of 14", 44px previous and next), and
    loading skeletons in Lines.
  - Research and charts from other sessions: #258 chart values, #259 recent records, #261 season zero markers, #262
    stable tooltip, #263 evidence selection, #265 market movement selection, #267 chart unit scales.
  - #255, #256, #257 and #260 change records, tests and the release workflow only; nothing under `web/`.
- **API:** not deployed. No file under `supabase/`, `cloud/` or `shared/` changed between `a887fd1` and `21f9799`;
  `gtl-api` v38 (`1647f94a…`) stays.
- **Compatibility:** the frontend at `a887fd1` runs on v38 today, and the API source it reads is unchanged here, so
  every read this build makes is one v38 already answers.
- **Migrations:** none. Hosted history from readiness: **63 rows,
  `8a02c480d273a532082411166e08f794a9b71ca6636028adfad09709adee91bb`**. Repo migrations not in that history:
  `20261027160000` (D-61 odds; Sean reports running it in his SQL editor, hosted version not recorded) and
  `20261026220000` (D-59 fantasy feed bucket). Neither is needed by this build.
- **Rollback:** redeploy the frontend from `a887fd1` (Pages `84cba88f-4d58-4fdf-9c38-4faf9380867f`).

## Readiness

[Run 40582344519](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40582344519), observed 20:56:52 UTC,
gate approved through the GitHub API as Sean's account: source and exact-SHA CI verified; 63 rows and the digest
above; Week 8 published (28 scheduled games); functions `gtl-api` v38, `gtl-league-features` v1, `gtl-odds-refresh` v6,
`gtl-points-jobs` v2, `gtl-push-reminders` v5, `gtl-results-refresh` v3, `gtl-week-open` v5; previous Pages `84cba88f`
from `a887fd1`; 376 signed-out probes, 376 denied, none awaiting.

## Results

- **frontend** [run 40582772051](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/40582772051), gate
  approved through the GitHub API as Sean's account after the title and card matched; verified **21:01:53 UTC**: Pages
  **`59fde381-1492-4984-808d-76b5e16ec452`** (was `84cba88f`), 107 assets per URL, frontend SHA-256
  `f06c1eca91ca5f3911ddfb39bb30ab24b6b7618182a207d87d4c65582bd255c9`. Hosted history before and after: 63 rows,
  `8a02c480…`; no migration applied. `gtl-api` v38 (`1647f94a…`) unchanged. 376 signed-out probes, 376 denied.
- **Live readback (this PC, after the run):** `https://guess-the-line.pages.dev/` serves `assets/index-D8j3nCbG.css`
  with #266's `gx-sheet-body--pager` and `gx-skel` rules and no `gx-play-stamp` rule (Play is not in this build).
- Signed-in and real-phone acceptance are not verified by this run; touch was checked in Chromium only (#266).
