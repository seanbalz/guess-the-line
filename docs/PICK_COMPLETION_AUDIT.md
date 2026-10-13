# Guess The Line — pick completion and quote availability audit

Owner: Sean Balsiger · Prepared by Codex · Version 3 · October 8, 2026

**Status: first audit pass completed locally. 84 targeted Node/SQL checks and
24 browser checks passed, including a final rerun after the confirmation dialog
was simplified. Remaining gaps are listed below. No hosted change, provider-credit
use or new collection policy was made by this audit.**

**Subsequent release — October 8, 2026:** the audited entry/review improvements
were included in Pages `2106725d` / API v14, with JWT verification enabled and
six hosted migrations applied. The integrated release passed 368 Node checks,
29 local browser checks, 79 cloud-style browser checks and 130 live access-denial
checks. Its inspected 32 private tables have RLS, zero browser-role grants and
zero browser-callable GTL database functions. The local cloud preview on port 4173
serves the exact production assets. See [the release record](RELEASE_2026_10_08.md).
This later release does not change the historical audit counts, apply the proposed
collection-policy change, or close the recovery, real-device and comprehension
gaps below. Historical deployment statements describe the time of this audit.

The approved audit focuses on completing Spread and Total guesses without
confusion or lost work, and understanding when a qualifying scoring quote is
available. The goal is a simple path for a first-time player that remains fast
for a returning player. Existing scoring, privacy and budget rules remain in
force unless Sean explicitly changes them.

## Evidence and scope

| Layer | What is established | What this audit does not establish |
| --- | --- | --- |
| Recorded production release | The register and `CLOUD_SETUP.md` record Pages `531d14b5` and API version 13, including provisional group comparisons, dashboard game filters and 13 transparent team marks. | These records are the preceding release, not a fresh authenticated production inspection during this audit. |
| Existing live data connection | Prior verified collections used The Odds API with DraftKings, FanDuel and BetMGM Spread/Total quotes. Twelve-hour collection is configured. | No new provider request, quota read, clock-triggered run or source freshness was checked by this audit. |
| D-16 local implementation | Individual references are captured at full submission and changed-guess edits. Unchanged guesses retain their references; current consensus is separate. | The pending migration/API/frontend are not established as hosted by their local tests. |
| D-17 local implementation | A new submission or changed submitted guess requires fresh qualifying evidence. One guarded shared refresh may be attempted; missing evidence rejects the save atomically. | A successful provider response is not proof of complete, fresh book-level evidence. The local Node workspace has no provider refresh connector. |
| Earlier test evidence | `planning/fresh-submission-verification.json` records 335 passing Node/SQL checks and separate local browser evidence for its source versions. | That number is not this audit's result. At the audit's initial comparison, `cloud/handler.mjs`, `server/store.mjs`, `server/index.mjs`, `web/src/api.js` and `web/src/App.jsx` differed from its manifest. Concurrent changes need integrated checks. |
| This audit's targeted checks | Root logs show 22/22 fresh-submission SQL checks and 62/62 targeted logic checks, with zero failures or skips: 84 total. The final browser batches passed 15/15 and 9/9 checks after the confirmation-dialog change. | The worker's separate 16-check result is included in these root checks and must not be added again. The final browser run used stable source fingerprints. These are targeted checks, not a whole-app or production certification. |
| User research and real devices | No new participant or physical-phone observation occurred during this pass. | Browser fixtures do not prove beginner comprehension, actual iPhone behavior, a second-device save or independent hosted transaction concurrency. |

Current contracts are in [RULES.md](RULES.md),
[SUBMISSION_TIME_SCORING.md](SUBMISSION_TIME_SCORING.md) and
[FRESH_SUBMISSION_AND_SOURCES.md](FRESH_SUBMISSION_AND_SOURCES.md). The shared
[project register](../planning/project-tracker.json) remains the source of item
status. This audit document adds evidence and acceptance criteria; it does not
replace or edit that register.

## Findings and bounded corrective work

| Finding | Effect on the player | Current action and owner | Linked register items |
| --- | --- | --- | --- |
| Five-minute reference freshness conflicts with the fifteen-minute collection cooldown. | A complete ballot can be refused while monthly credits remain. A previously saved collection can expire before the next collection is allowed. | Confirmed locally in the 22-check SQL run: expired-cache rejection preserves the draft, and a later permitted refresh succeeds for both Spread and Total. Policy alternatives below remain unapproved. | SCORE-09, OPS-04, DATA-13 |
| Four daily collection attempts are shared by scheduled, commissioner and submission-triggered work. | Failed attempts or earlier requests can consume the day's slots; two scheduled runs also use that same allowance. | Confirmed locally: four failed attempts exhaust the cap without any submission. Existing conservative accounting remains unchanged. | OPS-04, DATA-06, SCORE-09 |
| Completion controls could lose the expected focus or favorite direction. | A player using the missing-only filter or changing the spread could lose their place or accidentally reverse the intended side. | Fixed locally by `design_controls`. Final browser pass covers real typing/Next under the missing-only filter at 320/390px, favorite direction across Pick 'em, and continued entry after restoring a tab draft. | UX-02, UX-03 |
| Total-entry wording could sound like an outcome prediction. | A new player might enter their expected game score instead of guessing the sportsbook total. | Local copy now explicitly asks for the sportsbook total. The confirmation dialog now shows the picks and actions with further explanation under “Scoring & editing details”; final browser and visual review passed. No scoring meaning changed. | UX-02, UX-05 |
| Retry and refresh actions can be confused. | Reloading saved state is different from retrying submission; a player needs to know whether the reviewed guesses were accepted. | In-review retry guidance and distinct sanitized 429 reasons are fixed locally and passed the final checks. The global “Try again” action still reloads saved state, not submission; its label/action remains an open UX gap. | UX-04, UX-05, OPS-04 |
| Group and Solo recovery are not identical. | Group entry has explicit tab recovery; a failed Solo submission retains values only in the mounted form, which is not a durable account save or reload guarantee. | Both mounted failure/retry paths passed the final browser checks. Broader Solo reload recovery is still open and must not be inferred. | UX-04, OPS-01 |
| Deadline closure replaces unsaved entry state and clears tab recovery. | Work typed before the deadline can disappear when the closed-state effect reloads saved values. | Open: preserve an explicitly expired, read-only copy for inspection without enabling late edits, submission or an automatic extension. Current passing deadline-layout cases do not establish this retention behavior. | UX-04, UX-05, OPS-01 |
| Commit transport failures can be ambiguous. | A lost response may follow a successful save, so an automatic retry or a categorical failure message could mislead the player. | Helper-level propagation passed: no automatic retry and no false “not submitted” claim. Full UI reconciliation after an ambiguous commit is not yet demonstrated. | UX-04, OPS-01, OPS-04 |

Do not add source values to pre-submission messages. A helpful failure tells the
player what happened and what action is available without revealing the hidden
market. An uncertain transport result after an attempted commit must not be
described as a confirmed rollback or automatically resubmitted.

## Collection policy comparison — for Sean's decision only

The provider's official Starter plan currently advertises **500 credits per
month**, verified from the [The Odds API plan page](https://the-odds-api.com/) on
October 8, 2026. This verifies the advertised allowance, not this account's
remaining balance or reset time.

The current application guard allows at most two credits per collection, keeps a
50-credit reserve, uses measured remaining quota, and shares a database lease
across collection callers. A failed attempt remains counted conservatively.

*Ruling, October 12, 2026 (D-27):* Sean confirmed the candidate's constants (6 per UTC day, 5 minutes apart) and replaced the five-minute scoring-evidence rule: a submission is never refused for refresh limits and each guess is scored against the newest stored line at its save, whatever its age, or the first line collected after it. The comparison below is kept as the decision record.

| Policy | Current approved limits | Candidate — migration `20261012213000_gtl_submission_odds_window.sql` (October 12); constants confirmed October 12 (D-27), applied hosted October 12 as `20261012235554` |
| --- | --- | --- |
| Minimum collection spacing | 15 minutes | 5 minutes (equal to the freshness window) |
| Total collection attempts per UTC day | 4, including scheduled runs | 6, including scheduled runs (the earlier candidate was 7; 6 keeps the worst case at 372 credits a month, above the reserve) |
| Scheduled collection | Every 12 hours | Unchanged: every 12 hours |
| Maximum budget per collection | 2 credits | Unchanged: 2 credits |
| Reserve and quota validation | 50 credits; measured remaining guard | Unchanged: 50 credits; measured remaining guard |
| Scoring-reference freshness | At most 5 minutes old when saved | Unchanged: at most 5 minutes old when saved |
| Shared cache and lease | Reuse qualifying evidence; one shared collection lease | Unchanged |
| Hypothetical 31-day capped consumption | `4 × 2 × 31 = 248` credits | `7 × 2 × 31 = 434` credits |
| Remainder from an otherwise unused 500-credit allowance | 252 credits | 66 credits, including the protected 50-credit reserve |

These totals are **planning arithmetic for 31 accounted UTC days with every
allowed attempt charged the maximum two credits**. They are not measured usage,
current account balance, guaranteed capacity or a promise about a billing/reset
boundary. Other usage and the measured remaining guard can stop collection
earlier. Under the candidate's full-cap scenario, only 16 credits remain above
the protected reserve before other usage. Do not reset quota from these examples.

If both scheduled runs use a slot on a given day, the current policy leaves at
most two other attempts; the candidate leaves at most five. The increased cap
does not create a continuously running five-minute collector: it only permits
more closely spaced, authorized attempts within the existing shared demand path.

**Candidate recommendation for a future decision:** retain the strict
five-minute scoring evidence rule and all source/access/atomicity guards; reduce
the collection cooldown to five minutes and permit seven total attempts per UTC
day, with scheduled calls included. Keep two credits per call, the 50-credit
reserve, measured remaining guard and twelve-hour schedule unchanged.

This candidate reduces one avoidable waiting interval but **does not guarantee
submission availability**. Quotes can already be old when fetched, a book can be
missing, all seven attempts can be exhausted, provider requests can fail, or the
reserve can prevent another request. Entry should remain preserved with a clear
reason and explicit retry action. The alternative is to keep the existing limits
and communicate the resulting wait honestly.

Decision to record before any policy change:

> Should Guess submissions use the candidate five-minute cooldown and seven
> shared daily attempts within the existing free-credit guards, or keep the
> current fifteen-minute cooldown and four daily attempts?

The separate D-18 virtual-pick retained-quote age decision does not relax
D-17's fresh Guess scoring requirement. No virtual-game, Challenge, deadline,
official eligibility or historical-reference rule is changed here.

## Acceptance matrix for this pass

The results below distinguish completed local checks and remaining gaps.
Both browser batches were rerun after the final dialog change. The
[verification manifest](../planning/audits/pick-completion-verification.json)
records source and compiled-build fingerprints, log hashes and test counts.

| Case | Required result | Verification owner | Result / evidence |
| --- | --- | --- | --- |
| Complete Spread and Total independently | Required count, valid half-points, signed favorite and missing-only navigation work; submission reveals only the matching market. | Root + design_controls | **Passed locally** — final entry/source browser batches and targeted logic. |
| Next game under missing-only filter | The active row remains usable during real typing; Next advances and focuses the next eligible missing field. | design_controls + root | **Passed locally** at 320px Dark and 390px Light in the final `pick-audit-browser.log`. |
| Favorite direction after changing a number | The displayed favorite and saved signed value agree across Pick 'em, continued typing and restored tab edits. | design_controls + root | **Passed locally** — both direction/regression cases in the final `pick-audit-browser.log`. |
| Total wording and review | Entry clearly asks for the sportsbook total; review describes capture/reveal and the distinct personal-forecast meaning. | design_controls | **Passed locally** — corrected copy and closed “Scoring & editing details” disclosure; final browser and screenshot review completed. |
| Fresh cached references | Save succeeds without collection; later market movement does not change saved points. | Root | **Passed locally** — targeted logic and SQL logs. |
| Freshness boundary | Exactly five minutes qualifies; one millisecond older, future, malformed or incomplete required evidence does not. | Root | **Passed locally** — boundary and invalid-evidence cases in `pick-audit-logic.log`. |
| Expired cache during cooldown, Spread and Total | Rejection preserves all saved draft fields, revision, audit and reveal. A later eligible refresh permits one atomic submission. | Root | **Passed locally** — new cases included in 22/22 `pick-audit-sql.log`. |
| Four failed attempts under current policy | Daily allowance is exhausted without any ballot being submitted. Failure accounting cannot be refunded through retries. | Root | **Passed locally** — new cap-exhaustion case in `pick-audit-sql.log`. |
| Changed-only edits and no-op saves | Changed guesses alone receive fresh references; unchanged guesses and no-op saves retain evidence and make no collection call. | Root | **Passed locally** — targeted logic and SQL logs. |
| Distinct refresh limits | Cooldown, daily cap and reserve produce safe, understandable reasons. Do not include provider payloads, credentials, private values or unsupported retry times. | cloud_readiness + root | **Passed locally** — specific sanitized reasons in the 62-check logic run; matching browser failures/retries passed the final 15-case batch. |
| Group and Solo failure/retry | Full entered values remain in each mounted review on 409/429/503; the market stays hidden; explicit successful retry commits once. Group tab recovery is checked separately from Solo form retention. | Root + design_controls | **Passed locally** — final `pick-audit-browser.log`. Solo reload persistence remains outside that result. |
| True conflict versus quote failure | A stale revision needs current data and explicit resolution. A quote-related 409 does not falsely put the form into revision-conflict lockout. | Root | **Passed locally** — conflict case in the 9-case local batch and quote-failure retry in the 15-case batch. |
| Access, revision or deadline changes during collection | Reservation/commit checks reject the stale intent without unauthorized data, partial save or duplicate provider work. | Root | **Passed locally** — targeted SQL/logic checks; not independent hosted concurrency evidence. |
| Deadline closure with unsaved work | Keep an expired read-only copy without permitting late editing, submission or automatic extension. | Root | **Open** — current closed-state effect replaces unsaved values and removes tab recovery. Deadline-layout tests do not prove retention. |
| Global retry action | The action label makes clear whether it reloads saved state or retries submission. | Root | **Open** — global “Try again” currently calls the saved-state refresh path. |
| Ambiguous response after commit attempt | UI avoids an unsupported “not submitted” assertion, retains the user's work and requires reconciliation instead of automatic replay. | Root | **Helper passed; UI pending** — transport error propagates without retry or false failure in `pick-audit-logic.log`. End-to-end UI reconciliation is not fully tested. |
| Mobile and keyboard completion | No horizontal form scrolling at 320/390px; 44px targets, usable focus, readable Light/Dark and reduced-motion behavior. | Root + design_controls | **Partially evidenced locally** — 320/390px layout, minimum touch targets, keyboard/focus and Light/Dark screenshots. Full contrast and reduced-motion audits are not established; final dialog rerun passed; complete accessibility review remains pending. No physical-device claim. |
| New and experienced player comprehension | Participants can identify their guess, scoring reference, current line and whether saving succeeded without facilitator interpretation. Record task completion, errors and time. | Sean + root | **Pending** — no user research performed. |
| Real phone and second device | An intended saved change survives reload and appears on the same account's second device; unsaved/failed work is labeled accurately. | Sean + root | **Pending** — physical-device acceptance; no real picks altered for testing. |

## Verification record

| Field | Current value |
| --- | --- |
| Integrated source fingerprint | Written to [pick-completion-verification.json](../planning/audits/pick-completion-verification.json): 160 source fingerprints stayed unchanged across the final browser run, with final build hashes and four log hashes. |
| Fresh-submission SQL | **22 passed, zero failed/skipped** — [pick-audit-sql.log](../.local/pick-audit-sql.log), including the new cooldown and four-failure availability cases. |
| Targeted logic | **62 passed, zero failed/skipped** — [pick-audit-logic.log](../.local/pick-audit-logic.log): submission-odds, submission-collection, fresh-submission-handler, submission-scoring-local and submission-scoring-sql. |
| Node/SQL total for this pass | **84 passed** across the two root logs. The worker's 16 checks overlap these results; do not add them. Earlier 335-check feature evidence is also a separate run, not an additional total here. |
| Final entry/source browser batch | **15/15 passed** — [pick-audit-browser.log](../.local/pick-audit-browser.log). Synthetic authenticated traffic, source/visibility checks and failed-submission retry; not production accounts. |
| Final local browser batch | **9/9 passed** — [pick-audit-local-browser.log](../.local/pick-audit-local-browser.log). Entry, recovery, conflict, Challenge review, focus, scoring references and responsive layouts. |
| Final confirmation-dialog verification | **Passed locally** — the final 15 + 9 browser cases passed after the review cleanup. Root visually inspected the 390px Light Total review and 320px Dark retained-error review; picks, details and actions remain visible in the sample three-game fixture. |
| Private-data and diff checks | **Passed** — final compiled frontend private-data scan and `git diff --check`. No hosted boundary requests were run. Existing large-chunk build advisory remains; this was not a performance audit. |
| Real users / physical devices | Not performed. |
| Provider calls / credits spent by this audit | None. The official public plan page was read without an account/API-key request. |
| Hosted migration / API / frontend change | None by this audit. |
| Candidate collection-policy decision | Pending Sean; current approved limits remain in force. |

Relevant existing suites include `tests/experience.test.mjs`,
`tests/submission-odds.test.mjs`, `tests/submission-collection.test.mjs`,
`tests/fresh-submission-handler.test.mjs`, `tests/fresh-submission-sql.test.mjs`,
the submission-scoring tests, `tests/cloud-browser/prediction-completion.spec.js`,
and the entry/source/group/Solo browser cases.
Use isolated test outputs and unoccupied loopback ports; coordinate with other
active work before using shared fixtures or rebuilding their output directories.
Do not serve the repository root or use real player guesses as disposable tests.

Brand basis: [BRAND_GUIDE.md](BRAND_GUIDE.md) and
[shared tokens](../design/tokens.json), read before authoring. This Markdown
audit adds no new palette, logo, typography or motion decision. Product changes
still require the listed visual/accessibility checks.

Source/date: repository contracts and tracker v48 observed October 8, 2026;
root's final audit logs, stable source manifest and mobile screenshots reviewed for version 3; the
[official provider plan](https://the-odds-api.com/) checked the same day.
