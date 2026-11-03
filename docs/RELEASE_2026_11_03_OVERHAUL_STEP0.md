# D-69 overhaul step 0 frontend release — November 3, 2026

Released November 3, 2026 at 15:09 UTC (7:09 AM PST): **frontend only**, from `main` at
`134f17c8dcc2241c54bee9d67712e177d718c2b8` (the merge of PR #430). Sean dispatched the protected run and approved its
`production` environment himself. The run's release card input is PR #432, a test-only fix with no card text, so the
repository holds no dated approval wording or phone-capture OK for this release. This record was written afterwards,
on November 3, from the run logs and GitHub's run metadata during the docs truth pass; nothing was re-deployed or
re-checked live. No migration, Edge Function or server change.

## What shipped (frontend changes since live source `c6d6434c`)

- **D-69 step 0, the shared kit (PR #428, merged as `975744c5`).** The moments engine (`web/src/next/moments`),
  `ui/CountUp.jsx` (moved from Home), nesting-card entrances in `ui/Nest.jsx`, the 160 ms tab fade
  (`shell/tabFade.js`), `tap` and `win` vibration that reduced motion stops, and `ui/Skeleton.jsx` placeholders in
  place of "Loading" text. The [register entry](COMPLETION_REGISTER.md) lists the parts and the follow-ups.
- **Fantasy bye-week roster (PR #430).** A team on bye last week uses the roster from its last game; one `shared/`
  file.
- **Tests and records only:** PR #432 (contrast is checked after the tab fade settles), PRs #427 and #429 (release
  records).

## Gates

| Gate | Run | Result |
| --- | --- | --- |
| Exact-source CI | Tests [41623877388](https://github.com/seanbalz/guess-the-line/actions/runs/41623877388), Dashboard [41623877159](https://github.com/seanbalz/guess-the-line/actions/runs/41623877159), Brand [41623877939](https://github.com/seanbalz/guess-the-line/actions/runs/41623877939) | All passed |
| Readiness | [41659397978](https://github.com/seanbalz/guess-the-line/actions/runs/41659397978) | Passed; live state read at 15:04:10 UTC |
| Deploy | [41660239622](https://github.com/seanbalz/guess-the-line/actions/runs/41660239622) | Frontend deployed; verify passed at 15:09:06 UTC |

No separate check-only run was made for this source.

## What is live

- **Frontend:** Pages **`489e8b38-2a7f-4d23-a8b2-d73706c4fe0d`**. All 129 assets at the production URL matched the
  build (frontend SHA-256 `e58bab583884846c3d864ad839b7230538ed385c4a9ee0cffc677ec4688b33b5`). The previous Pages was
  `2308ab8e-7fd3-40f2-af1e-cad6c4e1cfcf` from `c6d6434c`.
- **API:** `gtl-api` v45, ACTIVE, JWT verification on, bundle
  `7640627cfd1a457729382b90f09a3b094095c63da76c62a5559038e1190c675b`, unchanged by this run. An API deploy followed at 18:43 UTC
  (run [41696516851](https://github.com/seanbalz/guess-the-line/actions/runs/41696516851), from `ff7b27f5`); the
  [lock-in refresh record](RELEASE_2026_11_03_LOCKIN_REFRESH.md) covers it.
- **Migrations:** 72 hosted rows, digest `b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d`, unchanged.
  The run listed M-33, M-34 and M-35 (`20261029151727`, `20261029161613`, `20261029162144`) as pending.
- **Boundaries:** 444 checked, 425 denied, 19 awaiting the unrelated EPL migrations.

## Not verified

- No signed-in readback and no real iPhone check of the moments, count-ups, tab fade or placeholders.
- No preservation snapshots are recorded for this run. A frontend deploy uploads static files and runs no SQL.

## Rollback

Restore Pages `2308ab8e-7fd3-40f2-af1e-cad6c4e1cfcf` (source `c6d6434c`) through the protected workflow. No data needs
restoring.
