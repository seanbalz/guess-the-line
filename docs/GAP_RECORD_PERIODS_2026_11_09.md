# Gap record periods — November 9, 2026

Sean requested All time and multiweek Gap win rate, accepted the recommended
All time, This season and Custom range options, and approved the dark/light
mockup with **“Good”**. [D-80](DECISIONS.md) and the
[approved design](superpowers/specs/2026-11-09-gap-record-periods-design.md)
define this change. This record establishes local implementation, not deployment.

The Record period selector retains Week as default and adds This season,
All time and Custom range. From/To and Apply range select inclusive published
weeks, including across seasons. This season uses the latest published season;
All time includes the retained published weeks advertised to the signed-in
account. Full range bounds remain in coverage text; game details and list rows
identify their actual season/week. Recommendation week and placement stay
independent. Market and 10%+ filters apply across the selected record period.

The existing authenticated `lines/read` reader is reused, with at most three
concurrent reads and reuse of the displayed week's board. No odds-provider
fetch, API, permission, migration, writer or persistent private-browser cache
is added. A missing/failed week produces Retry and no partial All time number.
Scope/account changes cancel old reads and immediately hide their figures.
Missing finals/closing references stay ungraded; they do not become losses.

Season/week-qualified game identities preserve repeated matchups. Combined
game rows are sorted by kickoff and passed through the unchanged D-77
`gapRecord` grader. Win rate is wins divided by wins plus losses, not the average
of weekly percentages. Pushes remain in W–L–P and paper ROI, outside the win-rate
denominator. For example, 1–0 plus 1–3 is 2–3 / 40%, not 62.5%.

Local evidence:

- Baseline: 27 existing recommendation/view Node tests passed before source edits.
- New model RED: missing period module; GREEN: 11 model tests cover scope bounds,
  weighted counts, pushes, exclusions, repeated identities, ordering, concurrency,
  scope mismatch, failure and pre/in-flight cancellation.
- Provenance RED: undefined row season; GREEN: actual row season/week returned.
- Six UI render tests check controls, weighted headline, coverage, Custom endpoints,
  pending/error/no-stale-number and empty states. These mock the hook.
- Initial full suite: 2,968/2,969 Node checks passed; loading convention rejected
  a bare Loading sentence. Using the existing Skeleton fixed that regression.
  The initial failure remains recorded, not relabelled as a pass.
- Subsequent full suite: 2,969 Node plus 930 Vitest tests passed, zero skips. This
  run started at source stage `47f693b0`; later compact heading/cancellation-test
  and detail-selection changes have fresh 15-Node/six-UI covering checks.
- Final-source Chromium and WebKit each passed 29 browser assertions: all periods,
  inclusive/cross-season/reversed ranges, no invalid-range reads, independent
  recommendation week, markets, Retry, late cancellation, detail provenance/Back,
  both themes at 320/390/768, 44px controls, short/enlarged text and reachable
  page end above the floating bar. No new runtime error during these checks.
- The local browser uses real HOSTED-schema PGlite/authenticated handlers with
  explicitly synthetic multiweek slates/lines/finals. Its figures are fixtures,
  not account statistics or independently verified live bookmaker evidence.
- A same-session real React hook harness changes identity props while old reads
  are pending: replacement state is loading/null, then resolves without stale
  overwrite. This checks UI identity invalidation, not server sign-in switching.
- Review found a minor stale detail selection after changing markets. Browser
  RED reproduced automatic reopening; GREEN keeps it closed and preserves period.
- Independent final source review at `9abbdae91e27d85985cccfca5071d819e0fc05ab`
  found no outstanding Critical/Important/Minor issues and independently passed
  39 Node plus six UI tests. Fresh typecheck, Brand QA, build and whitespace pass.

The first development-session navigation emitted inherited shared-read AbortError
noise (three Chromium observations and one WebKit observation); these are retained
separately from the feature checks. An initial CLI query used an implicit label
that included option text; explicit native label associations corrected both
selection and accessibility. Vite's existing large-chunk warning remains.

Exact PR/main CI, merge, protected release and served-byte evidence must be recorded
before declaring this live. Frontend rollback is a protected redeploy of the prior
verified app source `a17f2082e5e07e95179726ac948c44c55a506d1f`, leaving API v52 and
the database unchanged. Fresh readiness must verify actual hosted metadata/history;
the November 8 digest alone is not fresh evidence. No physical-iPhone, signed-in
production, private-board or live-provider acceptance is inferred. M-41, held FEPL
top-header choice, parked features and frozen v62 remain separate.
