# Pick a Team turn queues and confirmation — November 3, 2026

Sean requested automatic assignment from a manager's saved backup ranking when
their turn begins, with a note or popup confirming the team. He confirmed that
when every ranked club is taken, the manager stays on the clock for a manual
pick. The previous implementation waited until first kickoff to use rankings.

## Behavior

- A successful pick advances the draft through consecutive queued managers,
  choosing each one's highest-ranked available club in saved order. A club that
  is taken, not playing or postponed is skipped. No unranked team is selected
  before kickoff. A manager without an available ranked club stops advancement.
- Saving a ranking while already on the clock assigns immediately if a ranked
  club is available. Updating a ranking never rewrites an existing pick.
- The entire change uses the existing week-row lock and unique-club constraint.
  Picks and history are committed in the same transaction as the initiating
  pick/queue save. A manager's browser can be closed. Each automatic pick keeps
  `source=queue` and an append-only `queue:turn` history entry. The existing
  latest-picker change window and finalization when the next manager picks stay
  in force. Kickoff resolution is unchanged.
- The viewer gets a persistent **Backup pick confirmed** note naming the club,
  plus a success popup on the first fresh read of that recorded assignment. The
  popup is remembered on the device for that manager/week/pick and does not
  replay on polling or reload. The note remains available. Stale/error reads
  never announce a new assignment. A manual or someone else's pick never creates
  this confirmation.
- On a 320px phone the available-club grid uses five columns so its buttons keep
  the required 44px width. Existing components and tokens provide the note and
  popup styling.

## M-40 and compatible rollout

Applied migration (hosted version `20261103232119`, November 3, 2026):
`supabase/migrations/20261103212932_gtl_epl_turn_queue.sql`.
M-39 belongs to the separate selected-book change #452, which merged after
this release was selected and is outside this rollout.

M-40 adds a service-only, security-invoker `gtl_epl_advance_queues` helper,
replaces the existing pick/queue writers to call it under the same week lock,
and adds the public `queueOnTurn` capability to the existing week-state reader.
There are no new tables, triggers, cron jobs, public writer grants or API routes.
Private rankings are never returned in the public board.

The compatible API passes the capability through; the client explains immediate
assignment only when the database reports it. Before M-40, it keeps the existing
kickoff explanation. Confirmation uses actual recorded queue picks on either
schema. Deploy compatible API/frontend before applying M-40. This migration
depends on hosted M-30 and does not require pending M-33/M-34/M-35 or M-39.

Applying the migration performs no pick, queue or history backfill. Only future
pick/queue saves advance rankings. Existing user records, standings, guesses,
results and queues remain in place. Sean separately authorized Gate M with
"Apply m-40"; the verified deployment and apply are recorded below.

The reviewed rollback restores the three prior function bodies. It preserves all
records and leaves the unused service-only helper in place. It removes the
reader capability, so compatible clients return to the kickoff explanation.

## Verification and status

Local verification passes: 74 focused Node checks (including six executed
PGlite scenarios), 87 boundary/migration checks, all 670 component tests, the
M-40 migration/rollback harness, all four EPL browser scenarios, typecheck,
production build, bundle privacy scan and Brand QA. The browser flow confirms
assignment without a browser pick request, confirmation ownership, persistent
note/one-time popup, reload, 320/390px Light/Dark and no Axe violations.

A November 3 read-only hosted metadata check found no advance-queues helper and
confirmed that all three existing functions match the bodies being replaced:
`gtl_epl_save_pick` md5 `a077d98ad82e5e161bc23018b6e841c2`,
`gtl_epl_save_queue` md5 `96df64835d5c206c7bc85f3d95ae4217`,
`gtl_epl_week_state` md5 `82ab06aaa1422df82265e42dd3be044e`.
All are security invoker, executable by service_role only. This is a preliminary
compatibility check; Gate M repeats it with preservation evidence before apply.

M-40 is **applied and verified** as hosted `20261103232119` at 23:21 UTC.
The compatible API v49 and Pages `06129739-8c5c-4186-b270-bc739637c9d4`
deployed first from `4cf149e7c4361547647db3573651fcd57204e36d` in
[run 41734832322](https://github.com/seanbalz/guess-the-line/actions/runs/41734832322).
All four function bodies and service-only invoker grants match; the latest
week reader reports `queueOnTurn=true`. Before/after hashes match for all
existing EPL records, finished Guess scores and settled Virtual Units results.
The apply made no picks or backfill. All 129 canonical served frontend assets
match the release manifest; retrieved EPL API and entrypoint modules match the
selected source. Live signed-in/phone confirmation acceptance remains separate
from these checks. See the [release evidence](RELEASE_2026_11_03_EPL_TURN_QUEUE_M40.md).
