# EPL draft order: confirmed import versus Tuesday recheck

Owner: Sean Balsiger · Version 1 · November 10, 2026

Status: **decided: Rule 1.** Sean answered **"Yes, import wins"** on November 11, 2026 at
00:25 UTC (4:25 PM Pacific on November 10; [D-83](DECISIONS.md)); step 1 of
[After the ruling](#after-the-ruling) is the amended M-35 PR.
The rest of this brief is unchanged as written. As written, it changed no code, migration,
schedule or hosted state. It explains contradiction 7 of the
[November 10 apply packet](MIGRATION_APPLY_PACKET_2026_11_10.md), which holds M-35 and,
through M-33, M-34. It was prepared from `main` at `3ddc36d83aeb014efc7c448bf21d9fe22d1edeab`,
the M-41 to M-47 apply record (`docs/RELEASE_2026_11_10_MIGRATIONS_M41_M47.md` on PR #525's
branch `claude/apply-record-m41-m47`) and read-only hosted reads at 21:24 UTC.

Every claim is tagged: **executed** (run and observed), **inspected** (read in code or
records) or **assumed**.

## The question

Two writers can set the pick order of next week's Pick a Team draft (week n+1):

1. **Your screenshot import** (M-43, hosted since today). You review the eight Sleeper
   weekly scores, confirm, and the import sets the order.
2. **The Tuesday Sleeper recheck** (M-33 records it and M-35 acts on it; both unapplied).
   If Sleeper's totals changed since the automatic Monday capture, M-35 works the order out
   again from the corrected totals.

Both writers touch only a draft that is still untouched: open, no pick yet and before its
first kickoff. M-35 also needs to run before the admitted capture cutoff. When both run for
the same week, whichever runs last wins. Nothing is lost, but the order you reviewed is not
protected.

**When the two disagree for the same untouched draft, which one should stand?**

## Recommendation

**Rule 1: your confirmed import wins.** The Tuesday recheck still saves the corrected totals
and works out the order it would have set. It shows both orders on the stat-corrections
screen, but it never changes an imported week's order by itself. To use a Tuesday
correction, you confirm a correction import. This needs a small amendment to M-35 before it
is applied. M-35 is unapplied, so it can be amended in place, as M-34 was in packet
version 2. Hosted M-43 does not change.

## Where things stand today

- **Hosted schema (executed).** History has 83 rows; the newest is `20261110204307` (M-47).
  M-43's four import tables exist, with 0 imports and 0 openings. M-33's
  `gtl_epl_stat_rechecks`, M-34's `gtl_epl_standings` and M-35's `gtl_epl_order_corrections`
  and `gtl_epl_capture_intervals` do not exist.
- **Hosted EPL weeks (executed).**
  - MW9 is `settled`.
  - MW10 is `resolved` with 8 picks. Its last kickoff was November 8 at 16:30 UTC and its
    window ends November 11 at 00:00 UTC.
  - There is no MW11 row yet.
  - Snapshots `after-mw08` and `after-mw9` exist; `after-mw10` does not.
  - The latest `snapshot` and `settle` runs both report `snapshot_pending`.
  - Seven EPL schedules are enabled, `results` is disabled and there is no `standings` row.
- **There is no Tuesday recheck today (inspected).** The only two routine writers of the next
  order are the automatic `settle` job and your import. (The hand-seeding route
  `epl/admin/week`, used for MW9, can also create a week that does not exist yet or change a
  seeded one.)
  - `gtl_epl_settle_week` inserts next week only if it does not exist yet
    (`on conflict do nothing`). It never replaces an order.
  - Your import opens next week, or replaces its order while the draft is untouched. Once an
    import has settled week n, `settle` has nothing left to do for it.
  - An import confirmed before every drafted result is verified final is kept but waits
    (`pending_results`). If `settle` opens next week first, confirming the same scores again
    applies your order, as the import screen tells you.
  - **So today your import already wins over the automatic order** once its opening has run.
    M-35 as written would change that to "last writer wins".
- **MW10 to MW11 is not affected (inspected).** M-33 and M-35 are not hosted. On the legacy
  path the `snapshot` job captures `after-mw10` once the window has ended and Sleeper is on
  week 11; `settle` then opens MW11. An import before or after that still wins while MW11 is
  untouched.

## When the conflict can happen at all

All five must hold for the same week n (inspected: M-33 `gtl_epl_recheck_state`, M-35
`gtl_epl_apply_recheck_orders` and `snapshotJob` in `cloud/epl-jobs.mjs`):

1. M-33 and M-35 are applied.
2. **Capture-interval evidence for week n has been admitted.** Admission is the service-only
   `gtl_epl_attest_capture_interval`, which neither the app nor the worker can call. Without
   that evidence, M-35 pauses the automatic final capture, the Tuesday recheck does not run
   and M-35 never reorders. Your import, or a final snapshot you post by hand
   (`epl/admin/snapshot`) for `settle` to use, is then the only way next week opens. The
   probe below confirms that M-35 leaves the order alone with no interval (executed).
3. The automatic `after-mw<n>` final capture exists. The recheck compares against it.
4. Sleeper's Tuesday totals differ from that capture, so the recheck is `needs_review`.
5. Week n+1 is still untouched when the recheck runs: no pick, still open, before its first
   kickoff and before the admitted cutoff. A pick that M-40 assigns from the first picker's
   ranked list counts as a pick. It can be assigned at the moment an import opens or changes
   the order, if fixtures are already read.

So the ruling matters only in weeks where someone has admitted interval evidence. It still
has to be settled before M-35 is applied, because the code decides the outcome, not an
operator on the day.

## A worked week (illustrative)

This uses MW11 to MW12 with made-up scores and two managers, A and C. It assumes interval
evidence was admitted for MW11 and that M-33 and M-35 were applied as written. No real
fixture, score or manager is used.

| When (Pacific) | What happens | MW12 order |
| --- | --- | --- |
| Sunday afternoon | The last MW11 match ends. | none yet |
| Monday from 00:00 | The automatic final capture `after-mw11` is taken while Sleeper is on week 12. Once every drafted result is final, `settle` opens MW12 from the captured totals. | A first, C second |
| Monday 8 PM | You add bonuses in Sleeper, screenshot Matchups and review: A has 38.40 (lowest), C has 41.10 (second lowest). You confirm. A gets the first-turn push if A has notifications on and MW12's fixtures are read. | A, C, … |
| Tuesday 12 PM | The Tuesday recheck runs. A Sleeper stat correction drops C's MW11 score to 37.90. Nobody has picked yet, so M-35 recomputes the order and **replaces** it. | **C, A, …** |
| Tuesday afternoon | A tries to pick and is told it is not A's turn; C gets a turn push if opted in. The stat-corrections screen no longer lists MW11, because an applied reorder leaves the list. Your import screen still shows your import with A first. | C, A, … |
| Wednesday | You press confirm again on the same screenshot. It counts as a duplicate, but the opening step runs again and **puts A back first**. | **A, C, …** |

Two variations keep the same picks and order under every rule:

- **A picked on Monday night.** The recheck keeps every pick and the order, and flags MW11
  for your review (D-68 item 23). Under rule 4 no recheck runs for an imported week, so
  nothing is flagged.
- **The only change between Monday and Tuesday is the bonus you added after the automatic
  capture.** The recheck's order then equals your import's order (`same_order`) and nothing
  moves. This assumes Sleeper's displayed weekly score equals the change in the cumulative
  season total that the recheck reads (assumed).

What the walkthrough rests on:

- **Probe (executed).** A scratch PGlite test applied every repo migration and ran four
  cases. It is not committed.
  - Import, then recheck: the recheck reports `applied: 1` and replaces the order, and the
    review list becomes empty. Confirming the same scores again gives `duplicate` plus
    `order_applied`, which restores the import's order.
  - Recheck, then import: the import reports `order_applied` and its order stands.
  - A pick before the recheck: the recheck reports `preserved: 1`, nothing changes and the week
    stays on the review list.
  - No admitted interval: the recheck reports `pending: 1` and the order is unchanged.

  The probe serializes its actors; it is not a concurrent PostgreSQL test.
- **Code reading (inspected).**
  - The "not your turn" refusal is asserted by the existing M-35 test "recompute wins before
    first pick".
  - The turn push is keyed by week, manager and pick count (`nudgeJob`), so C gets a new
    push and A's earlier push is not withdrawn.
  - The review list drops `applied` and `same_order` weeks (`cloud/epl-correction-reviews.mjs`).
  - The recheck is due Tuesday 12:00 PM Pacific, and at least one hour after the original
    capture (`gtl_epl_recheck_due_at`).

## The rules you can choose

| Rule | A recheck after your import | Your import after a recheck reorder | Visible to you | Change needed |
| --- | --- | --- | --- | --- |
| **1. Import wins after confirmation** (recommended) | Keeps your order. Records the order it would have set; the week stays on the review list. | Replaces it, as today. | Yes: the review list shows both orders. | Amend unapplied M-35; update the `gtl-api` reader and the screen copy; tests. |
| 2. Recheck wins | Replaces your order, as today. | The recheck's order stays. The import is saved and its opening is recorded as preserved. | Has to be added. | New migration replacing hosted M-43's writer, with a rollback file; M-35 unchanged; API and screen changes. |
| 3. Last writer wins (M-35 as written) | Replaces your order. | Replaces the recheck's order. | No: an applied reorder leaves the list. | None. |
| 4. Recheck only before an import | Does not run for an imported week; nothing is recorded. | Replaces it, as today. | No Tuesday correction is ever shown for an imported week. | Amend unapplied M-33; D-68 items 3 and 23 narrowed. |
| 5. You review any later change | Never changes an order by itself, in any week. It proposes one and you tap to apply it while the draft is untouched. | Applies directly: the import is your own review. | Yes, with an apply button. | Amend M-35; new commissioner write, table, API route and boundary probes; screen button with mockups; tests. |

Nothing is deleted under any rule (D-23). Both writers already record the order they replaced
append-only: `gtl_epl_order_corrections.previous_order` and
`gtl_epl_score_import_openings.previous_order` (inspected). The differences are which order
the draft uses and whether you see the disagreement.

### Rule 1: import wins after confirmation (recommended)

- **In the worked week.**
  - On Tuesday the recheck saves the corrected totals. It records a new outcome,
    `preserved_import`, holding the current order (A first) and the order it would have set
    (C first). MW12 stays A first.
  - MW11 stays on the stat-corrections screen, for example: "Tuesday's totals would put C
    first; your confirmed import kept A first."
  - If you agree with Tuesday, take a new screenshot and confirm a correction import. It
    applies while the draft is untouched.
  - Wednesday's repeat confirmation changes nothing (`same_order`).
- **Weeks without an import** behave as M-35 was built: an empty draft gets the corrected
  order automatically.
- **For:**
  - The order and first-turn push you confirmed stay stable.
  - It keeps today's hosted precedence: your import already beats `settle`.
  - It matches the November 9 requirement that conflicting candidate scores
    "do not silently replace a confirmed import" ([EPL features](EPL_FEATURES_2026_11_09.md)).
  - The recheck reads cumulative Sleeper season totals, the source M-35 itself will not trust
    without interval evidence. Your reviewed weekly scores are the stronger attestation.
- **Against:** a real Sleeper correction after your Monday import changes nothing until you
  act. If you do not act before the first pick, the draft runs on Monday's order; the week
  stays flagged.
- **D-23:** everything is kept: the recheck snapshot, the M-33 row, the new outcome row with
  both orders and every import row.
- **Change (amend M-35 before its apply):**
  - **Table.** `gtl_epl_order_corrections.outcome` gains `preserved_import`, stored with
    `candidate_order` and `baseline_snapshot_id`. Its shape check is adjusted to allow that.
  - **Writer.** After `gtl_epl_apply_recheck_orders` works out the corrected order, it checks
    `gtl_epl_score_import_head(season, week)`. If an import exists and the orders differ, it
    records `preserved_import` and does not update. Both writers lock week n first, then week
    n+1, so they cannot interleave (inspected).
  - **Dependencies.** M-35 then also needs hosted M-43, in its header and in
    `tests/migrations.mjs`.
  - **API and screen.**
    - `cloud/epl-correction-reviews.mjs` must accept the new outcome. Its allow-list
      rejects unknown outcomes today, which would fail the whole screen.
    - The reader should also return the would-be order.
    - The copy in `EplCorrectionReviews.jsx` changes, with a phone mockup before release.
    - `gtl-api` and Pages deploy before the amended M-35 is applied.
  - **Worker.** No change: a preserved outcome already reports `needs_review`.
  - **Tests.**
    - Import then recheck keeps the order.
    - Recheck then import still applies the import's order.
    - The reader accepts the new outcome.
    - The apply-order test is unchanged.
    - Packet section 1 gets M-35's new size and SHA-256.

### Rule 2: recheck wins

- **In the worked week:** Tuesday's C-first order stands. Wednesday's confirmation records
  the import but keeps C first.
- **For:** Sleeper's latest corrected data always decides an untouched draft.
- **Against:**
  - An automatic read of cumulative totals overrules your reviewed numbers, and that is the
    source M-35 needs interval evidence to trust.
  - A's first-turn push becomes wrong.
  - M-35's reorder does not run M-40's queue assignment, which M-43's opening does. C's
    ranked list therefore waits for a save or the deadline.
  - Your confirmation loses its meaning for that week.
  - It is the largest hosted change.
- **Change:**
  - M-35 stays as written.
  - A new migration (the next free id, M-48) replaces the hosted `gtl_epl_import_weekly_scores`,
    with a rollback file to M-43's body. It also widens the outcome check on the hosted
    `gtl_epl_score_import_openings`, and is applied after M-35.
  - API and screen copy: "a Tuesday correction already set this order".
  - The review list must keep showing an applied reorder that replaced an import.
  - Tests, and the full Gate M for a replaced body.
- **D-23:** everything is kept.

### Rule 3: last writer wins (M-35 as written)

- **In the worked week:** exactly the walkthrough above.
- **Against:**
  - The order can flip on Monday, Tuesday and Wednesday.
  - A's push is wrong.
  - An applied reorder is not flagged.
  - Repeating a confirmation flips the order back.
  - It has the same M-40 queue gap as rule 2.
  - The only practical guard is not admitting interval evidence for a week you import.
    Rechecks run inside the `snapshot` job, together with the final and daily captures, so
    they cannot be switched off on their own.
- **Change:** none. Apply M-33, then M-35 as written, after the interval prerequisite.
- **D-23:** both sides keep the order they replaced.

### Rule 4: recheck only before an import

- **In the worked week:**
  - The Tuesday recheck is skipped for MW11 because an import exists. No corrected capture is
    taken, MW12 stays A first and nothing is shown.
  - Had the recheck run before your import (for example, if you imported on Wednesday), it
    would reorder, and your import would then replace that order.
- **Against:**
  - The orders come out as in rule 1, with less evidence: an imported week never gets its
    Tuesday check.
  - Without interval evidence, M-35 pauses automatic finals and imports become the normal
    path. In practice, Tuesday corrections would rarely be checked.
  - It narrows D-68 item 3 ("checked again Tuesday") and item 23 (flag corrections even once
    picks exist) for imported weeks. Both would need amending.
- **Change:**
  - Amend unapplied M-33's `gtl_epl_recheck_state` to skip weeks with an import. M-33 then
    needs hosted M-43.
  - Tests.
  - Record the amendments to items 3 and 23.
- **D-23:** nothing is deleted, but the Tuesday evidence is never collected for imported weeks.

### Rule 5: you review any later change

- **In the worked week:**
  - The Tuesday recheck records "proposed: C first" and MW12 stays A first.
  - The stat-corrections screen shows both orders and a "Use corrected order" button. A tap
    applies it only if MW12 is still untouched; otherwise the tap is recorded as preserved.
  - This applies to every week, imported or not.
- **For:** no order changes without you.
- **Against:**
  - Every changed recheck needs a tap, and a proposal not tapped before the first pick lapses.
  - It removes M-35's tested automatic correction of an empty draft.
  - It adds the largest new surface: a new commissioner write.
- **Change:**
  - Amend M-35: a `proposed` outcome, with no automatic update.
  - A new append-only decision table, and a commissioner RPC that checks the untouched-draft
    conditions again under both locks.
  - A `gtl-api` route, boundary probes, the screen button and phone mockups.
  - Tests.
- **D-23:** everything is kept.

## Why rule 1

- It keeps what is already true on the hosted project today: your confirmation decides the
  order of an untouched draft.
- It is a small change, all of it in an unapplied file, the reader and the copy. Hosted
  M-43 is not touched, and no hosted body is replaced.
- It keeps D-68 item 23's visible flag, and it extends that flag to the case the current code
  hides: an import overwritten by a recheck.
- A Tuesday recheck never changes who picks first after you confirm, so the first-turn push
  stays right. Only a correction import you confirm can change it.
- The cost is one action from you when a real Sleeper correction arrives after your import.
  The flag tells you when that happens.

## Status of the other gates holding M-33, M-34 and M-35

### M-35 operator interval prerequisite: not met

- **Requirement (inspected).** The [finalization record](EPL_FINALIZATION_ORDER_2026_10_29.md)
  and the packet's M-35 section set it before "apply M-35". You review that missing interval
  evidence intentionally stops automatic final captures and can keep the next week from
  opening. You also need either verified interval evidence or a manual recovery plan.
- **Record status (inspected).**
  - No record shows that review.
  - No interval evidence has been admitted ("No such real interval evidence was admitted").
  - No manual recovery plan is recorded.
  - PR #525's apply record lists the prerequisite as still open.
- **Hosted (executed).** The interval table does not exist yet, so no evidence can exist.
- **Admission (inspected).** It is a service-only RPC that neither the `gtl-api` nor the
  `epl-jobs` allowlist names (no `attest` in `cloud/epl.mjs` or `cloud/epl-jobs.mjs`).
  Admitting evidence would therefore be a manual SQL editor step for each week.
- **New since October 29 (inspected).** M-43's import is now hosted and does not read
  intervals. It still settles week n and opens week n+1 while M-35 has paused automatic
  finals, so it is a working candidate for the manual recovery plan. Accepting it as that
  plan is a separate word from you, after this ruling; this brief does not assume it.

### M-34 standings authorization: not given

- **No apply word (inspected).** You have not said "apply M-34". PR #525's record says M-33,
  M-34 and M-35 were not part of the approval and stay unapplied.
- **Collector not authorized (inspected).** The Wikimedia community standings collector (the
  `standings` job) needs its own authorization, configuration and enablement. These records
  say so, and none authorizes it:
  - ledger row M-34 in [the build plan](REDESIGN_BUILD_PLAN.md);
  - step 4 of the [integration record](EPL_STANDINGS_INTEGRATION_2026_10_29.md);
  - packet sections 4 and 6.
- **Hosted (executed).** There is no `standings` schedule row, and `gtl_epl_standings` is
  absent.
- **Not affected by this ruling (inspected).** M-34 does not set the draft order. It is held
  only because it needs M-33. Its job-constraint hazard with M-44 is fixed: amended M-34 keeps
  `results` after hosted M-44 (packet contradiction 1).

### M-33

M-33 is held with M-35. Apply the two together, M-33 first. M-33 alone runs Tuesday rechecks
without the interval guard, and the finalization record says not to run them on M-33 alone
(inspected).

## After the ruling

For rule 1:

1. A PR amends M-35, the reader, the copy and the tests, with a phone mockup of the
   stat-corrections card.
2. Deploy compatible `gtl-api` and Pages.
3. You review the interval prerequisite: accept the import as the manual recovery plan, or
   supply evidence.
4. "apply M-33", then "apply M-35" (the amended file), each through Gate M.
5. "apply M-34" any time after M-33, if you want it. The standings collector is a separate
   word.

Rule 3 skips steps 1 and 2. Rules 2, 4 and 5 first need the change listed in their section.

## Change breadcrumb

- **Session ID:** `42c1a86c-29dd-4d40-97ed-ff24c1f9c022` (workflow subagent)
- **Agent:** AI Agent (Claude Code, desktop app)
- **Timestamp:** 2026-11-10, hosted reads at 21:24 UTC
- **Device:** Windows
- **Repository:** `seanbalz/guess-the-line`
- **Branch:** `claude/epl-order-precedence-brief`
- **Objective:** a decision brief for packet contradiction 7.
- **Changes:** this document only.
- **Validation:** read-only hosted SELECTs, a scratch PGlite probe (four cases, all repo
  migrations, not committed) and code and record inspection.
- **Status:** decided November 11, 2026: Rule 1 ("Yes, import wins", D-83).
- **Next breadcrumb:** Sean's rule, then the change PR that rule needs (none for rule 3).
- **Jira:** N/A
