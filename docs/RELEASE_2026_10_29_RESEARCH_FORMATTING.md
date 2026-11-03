# Research formatting frontend release — October 29, 2026

Issue [#388](https://github.com/seanbalz/guess-the-line/issues/388) remains open for physical iPhone acceptance. Sean directly authorized coordination with its owner, merge after checks, deployment and device verification. The completed moneyline batch was explicitly handed off; this chat was the sole frontend release captain and prospective device operator. No competing release was dispatched.

## Source and gates

Formatting PR [#389](https://github.com/seanbalz/guess-the-line/pull/389) merged as `d9f81905cdec2666af0b4a02ed31207f5157419b`. Its main Persona run exposed a pre-existing keyboard focus race; the gate was not bypassed. Test-only PR [#390](https://github.com/seanbalz/guess-the-line/pull/390) merged after all twelve checks passed, producing the exact release source **`f5225bb085dada8378d6ff61ce4eedd2352d6521`**. The owner passed all three Persona cases five times each; independent local verification reproduced the original failure once in five keyboard repetitions and passed the repair ten times. See [repair and local evidence](RESEARCH_FORMATTING_2026_10_29.md).

Required exact-main runs all succeeded, attempt 1:

- [Tests 40945603694](https://github.com/seanbalz/guess-the-line/actions/runs/40945603694).
- [Dashboard 40945603591](https://github.com/seanbalz/guess-the-line/actions/runs/40945603591), including Persona and all four Cloud browser shards.
- [Brand QA 40945603693](https://github.com/seanbalz/guess-the-line/actions/runs/40945603693).

[Check-only 40947414087](https://github.com/seanbalz/guess-the-line/actions/runs/40947414087) succeeded; its downloaded source report independently confirmed source, workflow source, fetched main and target. That source-pin safe point was explicitly relayed to the coordinator, releasing the hold on records-only #391. Its subsequent merge `054071c64eab8afa9d5e601c69cf95fe509bac61` did not change the pinned application source. The deploy workflow control revision is that newer main commit; the built/deployed checkout is f522.

## Protected production release

Sean's direct named deployment request authorized this captain to approve both actual production environment gates. [Readiness 40947554795](https://github.com/seanbalz/guess-the-line/actions/runs/40947554795) succeeded; the release card on #389 records reviewed compatibility, source, pending migrations and rollback. [Frontend deployment 40947975593](https://github.com/seanbalz/guess-the-line/actions/runs/40947975593) succeeded, including every verification step.

- Target: **frontend only**. No SQL apply, API/worker deployment, schedule change or player write.
- Fresh readiness observation: `2026-10-29T20:17:45.838Z`; 71 migration rows; history SHA-256 `19b43dcfba2c205cac9ceb0fab5d6d487edecb86bf140d555de620df28813fab`. Deploy/readback retained that digest.
- Pending: M-33 `20261029151727`, M-34 `20261029161613`, M-35 `20261029162144`. These were not applied. The source/UI repair needs none of them.
- Schedule evidence passed: NFL 2026 Week 8, 28 published games. Boundary evidence: 428 checked, 409 denied, 19 awaiting pending migrations. Awaiting probes are not successful denials.
- Pages: `fc03b4db-4cfc-44de-97d6-af3cf84cdfa5`, [production](https://guess-the-line.pages.dev). Immutable deployment URL is Access protected; the verifier checked production.
- Verified at `2026-10-29T20:22:42.503Z`: all **125 served assets** matched the exact build. Frontend digest `bc9670f33af3a89c0da7f6445b66de1c7d5d061a5ef541119960844a2c855704`; source digest `07f7bbb123069c0df2f7cbb70740766285ae7f00e614a721c689f99b846d6228`. Manifest records f522 and a clean build checkout.
- Independent public HTTP readback additionally matched `index.html`, entry `assets/index-KtKDLQ4g.js`, and the served Trends CSS/JS against manifest hashes.
- API remains ACTIVE **v43**, JWT verification enabled, bundle `00d9bad42b45c980ac2f33588814813bb52232d9deb40728c57d912d3493a6a4`. EPL jobs remain v3. These are unchanged hosted metadata; remote API bytes were not independently matched to this checkout, and this release does not claim a new backend source deployment.
- Rollback: separately gated frontend redeploy of `d891291c8a21e2de7827826e0d194fc2e0da11a6` / previous Pages `8fff6d68-7986-4f5b-a921-24a75656c86d`, or reviewed narrow revert. Previous frontend digest `9a345c9feb9da5fadd71f2c23f1db41daae372e9cf226b89bdd18a72d34a706d`; API v43 remains compatible.

Downloaded allowlisted artifacts, independent readback and real-account screenshots are retained in ignored `.local/release388/`; real-account captures are not public repository assets.

## Fresh signed-in production browser acceptance

Direct Chrome observations in the existing Light appearance; responsive overrides are browser checks, not physical-device evidence:

- Before deployment, actual loaded Week 8 Fantasy at 1260px spanned 1245px with 0px gutter while the header was 520px. After a full reload, the new entry `index-KtKDLQ4g.js` served Fantasy at 520px, centered at x=362.5, with 16px gutters, matching the header.
- At 390px, loaded rankings, player detail, report card and comparison retained the shared column/gutters with no horizontal page overflow. Player/report/comparison return paths worked.
- The Position filter loaded QB results. It was restored to Overall. The long rankings list scrolled to its end at 320px: Show more was 44px high, bottom y=579, above fixed navigation y=676.
- At 320px, a populated two-player comparison retained page width; the named comparison region had `tabIndex=0`, 218px content in 191px available width. ArrowRight focused it and increased its horizontal scroll. Both temporary comparison selections were removed afterward.
- All four live Trends sections loaded: This Week, Teams, Players and Build. A player detail and Back to Players return worked. Build controls/upcoming matches were inspected without saving a trend. This Week was restored.
- At 320px, the Trends section group used two columns; This Week, Teams, Players and Build each rendered on one line with 44px height. Page overflow was false, heading x=16, and shared profile/sport controls and bottom navigation remained present.
- No captured browser error logs. Temporary viewport override was reset. No account, betting, submission, installation, storage or theme settings were changed. Task-scoped filters/comparison selections were restored.

Local fixture/CI evidence separately covers 320/390/1390px, Light/Dark and deeper accessibility/scrolling checks. Live browser acceptance above is Light only.

## Physical iPhone acceptance — pending

After successful deployment verification, iPhone Mirroring directly reported **“iPhone in Use — Lock your iPhone to connect.”** A single user request to lock the phone and reply ready is pending. No physical Safari or Home Screen interaction has occurred for this release, and prior #385 switch acceptance does not close #388.

Remaining: freshly load production in physical iPhone Safari; inspect loaded Fantasy rankings/filters/player/report/comparison, top/middle/end scrolling and fixed-navigation clearance; inspect all four Trends sections and nested returns; confirm shared profile/navigation stay present. Record actual appearance and Safari/Home Screen scope explicitly. Preserve the user's settings and drafts. Keep #388 open until this is evidenced or any discovered defect is resolved.
