# Redesign completion — October 26, 2026

Scope: Q17-A/Q17-B, approved build-plan stage 59, and on-demand loading for these
screens. Owner: Codex; device acceptance: Sean. Base main:
`7d0a48f116ae5b607bab0f92b103ebf447e20188`.

## Delivered in source

- Your leagues now provides host-only invitation management for eligible private
  leagues. Create a recipient-bound link, copy it, review status/expiry and revoke
  it without opening classic. Fixed Triple Threat and Community cannot be invited
  into through this flow. The service remains the authority for permissions.
- Creating a Duel or Group stays in the four-tab app and opens its invitation
  screen. The existing backend roster caps, schedule and account rules apply.
  The practice switch is hidden as specified by stage 59; `practice: false` is
  sent. Existing weekly picks remain per account.
- Draft creation uses the existing account-scoped tab store, cleared at sign-out.
  A lost creation reply locks the request payload and keeps its request ID across
  reload; only an explicit retry reuses that ID. The backend returns the original
  league. A failed list refresh after known creation retries only the read.
- Invitation links are held only in the mounted view, never persisted. Existing
  links cannot be recovered from the service. A lost create reply checks the list
  and requires revocation of a pending invitation before replacement. A failed
  list refresh retains a newly created link. Clipboard-denied fallback selects
  the field. Duplicate writes and stale replies after unmount are guarded.
- Both new screens load on demand. Existing Home, league selection and invitation
  acceptance continue to use their current paths. Classic stays accessible.

No backend/schema changes, real invitations, hosted data mutations or deployment
are included. No email is sent by either screen. All automated scenarios use
fictional accounts with the real handler and local PGlite migrations.

## Verification

- Full `npm test`: 1,766 Node tests and 290 Vitest tests passed; zero skips.
- Eight focused browser cases passed: host/recipient boundaries, create/revoke,
  clipboard/fallback, lost replies, no duplicated writes, failed reads, draft
  leave protection, member restrictions, creation-to-invitation flow, and
  persistent idempotent recovery after reload.
- Nine existing `next-data.spec.js` cases passed: account changes, invitations,
  league selection, expired sign-in, access failures and accessibility.
- Both new screens passed axe at 320px in Light/Dark. Captured screenshots were
  visually inspected; these are Chromium fixtures, not actual-iPhone acceptance.
- Typecheck, Brand QA and whitespace checks passed. Cloud build, bundle privacy scan and release manifest passed; all four existing
  lazy-loading performance cases passed. The source contract subset also passed.
- No new signed-in production audit or physical-device verification was run.
  The normal `check:cloud` live check requires `.env.cloud`, unavailable in this
  fresh worktree; the bundle-only scan is the local check, as in CI.

Local logs and screenshots are ignored under `.local/`. CI on the published
commit is a separate requirement; a branch push does not establish merge or release.

## Optimization evidence and limits

The first implementation imported invitations eagerly: the cloud-test NextApp
chunk was 291,401 bytes raw / 91,138 gzip. Moving invitations behind a dynamic
import reduced that chunk to 286,200 / 89,495 bytes in the same cloud-test build.
The final build also includes the league-creation entry point: NextApp is
286,644 / 89,588 bytes; invitation code is 6,080 / 2,421 and creation code
4,967 / 2,273, fetched only when opened. Gzip measurements use Python gzip on the
built files. A browser assertion verifies invitation code is absent from Home
and Your leagues, then fetched on opening the host screen.

This is code-loading evidence, not an LCP/INP claim. OPT-01 still needs a broader
route baseline and representative-phone measurements. The existing main entry
and static Fantasy chunks still trigger Vite's large-chunk advisory; this change
does not claim to solve those separate bottlenecks.

## PR #209 CI follow-up

Initial CI found two failures after the creation flow was added: the switcher
showed two primary actions when an invitation was waiting, and an older Trends
assertion expected a Houston season-form card even when its pinned source had
an earlier game without a final. The switcher now prioritizes Join and makes
Create a league secondary while invitations are present. The Trends test checks
the stable ungated wind card instead, retaining both market-lock assertions and
the conditional/no-current-forecast wording. No missing final is fabricated.
The 17 account/league/invitation browser cases and both Trends cases passed locally after the fixes. Typecheck and Brand QA passed. Current-head GitHub CI remains a merge gate.

## Mobile report correction

Sean's latest October 26 answer explicitly says the app does not have the scroll
bug, correcting the preceding reply. Q03 is user-reported resolved for that
symptom. No new navigation patch is included, and no independent physical-phone
reproduction is claimed. Q19's broader acceptance checks remain separate.

## Remaining completion order

1. Q17-C: verify retained history, exports, journals, older records and commissioner
   destinations against RETIRE-01–04. Keep recoverable classic access.
2. OPT-01 measured bottlenecks; remaining Q06 placement/boards and approved
   challenge/social/reward dependencies, one implementation lane at a time.
3. Actual-device, second-device, push and live-week acceptance; missing Points
   actuals/reminder automation stays in Q18.
4. Q20 transition only after preservation and acceptance evidence and an explicit
   cutover. The wider redesign is not complete merely because these two flows work.
