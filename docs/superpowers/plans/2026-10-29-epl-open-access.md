# EPL open access and automatic manager linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every signed-in GTL account sees EPL and can read the Pick a Team board and Research → Fantasy. An account links itself to its FEPL manager automatically when its display name uniquely matches; otherwise it can claim an unclaimed manager in one tap. Only linked managers can pick or keep a queue.

**Architecture:** Migration M-31 adds a link audit table and two service-only functions (`gtl_epl_auto_link`, `gtl_epl_claim_manager`). `cloud/epl.mjs` opens the read routes to every confirmed account and adds `epl/claim`. `/lobby` reports `epl: true` whenever M-30 is present. The EPL app shows a claim card to unlinked accounts.

**Tech Stack:** as EPL plan 1.

**Spec:** `docs/superpowers/specs/2026-10-28-epl-fantasy-and-moneyline-design.md` sections 4 and 8, as changed by Sean on October 29, 2026: "lets automatically link users to fantasy epl team, also EPL section can show for everyone". This supersedes "EPL visible only to linked FEPL members" and "commissioner-only linking". Recorded as a D-68 addendum.

## Global Constraints

- **Reads open to all:** any signed-in, email-confirmed account can call `epl/draft/read` and `epl/fantasy/read`.
  - A non-member's reply has `me: null` and `myQueue: []`.
  - A non-member never sees another manager's queue. Queues stay private to their owner.
- **Writes stay member-only:** `epl/draft/pick` and `epl/queue/save` keep the existing `gtl_epl_member` check and 403 `GTL_EPL_FORBIDDEN`. The commissioner routes are unchanged.
- **Automatic link:** `gtl_epl_auto_link(p_user uuid) -> text|null` (the linked owner_id, or null). It links only when all of these hold:
  1. The caller has no link.
  2. Exactly one unclaimed manager matches the caller's `gtl_profiles.display_name`, compared case-insensitively after `btrim`. A match is either:
     - the first word equals the manager's `name` (Nemo, Cullen, Adam, Sean, Evan, Mark, Steven, Darin), or
     - the whole name equals the Sleeper username (`sleeper_name`).
  3. No other profile also matches that manager by the same rules.
  - Anything ambiguous links nothing.
- **Aliases:** these are added Oct 29 from a live read of `gtl_profiles` that Sean approved. Sean: "my user should be fistathon and seanbalz".
  - M-31 adds `gtl_epl_manager_aliases(owner_id text references gtl_epl_managers, alias text, primary key(alias))`, service-only with RLS on.
  - It is seeded idempotently with:
    - `('473955676301815808','fistathon')`: Sean, Sleeper seanbalz, GTL display name "Fistathon".
    - `('702644837370929152','sthomas')`: Steven, Sleeper sthomas111, GTL display name "Sthomas".
  - Auto-link also matches when the whole btrimmed, lowercased display name equals an alias. The same ambiguity rules apply.
  - With the live names this auto-links six managers: Cullen, Evan, Mark, Nemo, Sean (Fistathon) and Steven (Sthomas). Adam and Darin have no GTL account yet and will claim. Add PGlite tests for both aliases.
- **Claim:** `gtl_epl_claim_manager(p_user uuid, p_owner_id text) -> jsonb`.
  - Refused with `GTL_EPL_ALREADY_LINKED` when the caller already has a link.
  - Refused with `GTL_EPL_CLAIMED` when the manager is already linked.
  - Refused with `GTL_EPL_INVALID` for an unknown owner.
  - First claim wins: the manager row is locked with `for update`.
- **Audit:** every link, claim, auto-link and unlink writes a `gtl_epl_link_audit` row (owner_id, user_id, action, by, at). Nothing is ever deleted (D-23). The commissioner can still unlink through `epl/admin/link` with `userId: null`.
- **Lobby:** `/lobby` returns `epl: true` for any signed-in account once M-30 is applied, meaning `gtl_epl_member` exists and answers. It returns `epl: false` when the function is missing or the call errors. Lobby never fails because of EPL.
- **Auto-link timing:** `epl/draft/read` calls `gtl_epl_auto_link` once for an unlinked caller before building the view. A missing function (M-31 unapplied) is skipped silently.
- **Migration M-31:** `supabase/migrations/20261029060000_gtl_epl_open_access.sql`.
  - Additive and idempotent. Functions are `security invoker set search_path=''`, service-only grants, RLS on the new table.
  - Add it to `NOT_HOSTED` in `tests/migrations.mjs` and add the ledger row M-31 in `docs/REDESIGN_BUILD_PLAN.md` §6.
  - Before writing it, check open PRs for the same 14-digit version (docs/SHARED_DEPLOYMENT.md "Migration versions are unique").
- **Known risk:** an account could rename itself to an unclaimed manager's name first and be auto-linked. This is accepted because FEPL is 8 friends. Mitigations: every link is audited, the commissioner can unlink, and the D-68 addendum states the risk.
- **Tests:** targeted local runs only (`#342`). CI runs the full suite. UI uses tokens only (`tests/next-tokens.test.mjs`).

---

### Task 1: Migration M-31

**Files:** Create `supabase/migrations/20261029060000_gtl_epl_open_access.sql`. Modify `tests/migrations.mjs` (NOT_HOSTED) and `docs/REDESIGN_BUILD_PLAN.md` §6. Test `tests/epl-open-access-sql.test.mjs`, run on PGlite on top of M-30, using the same harness as `tests/epl-migration-sql.test.mjs`.

**Interfaces:** Produces the table `gtl_epl_link_audit` and the two functions above. Make `gtl_epl_link_manager` also write an audit row by re-creating it with the same argument list; never change an argument list.

- [ ] Failing PGlite tests. Unique first-name match links. Two profiles named "Adam …" link neither. A manager already linked is not auto-linked. An already-linked caller gets null. A claim when unclaimed succeeds. A second claim on the same manager gives `GTL_EPL_CLAIMED`. A claim when already linked gives `GTL_EPL_ALREADY_LINKED`. Every case writes an audit row. Applying the migration twice is idempotent. anon/authenticated cannot execute either function.
- [ ] Implement, pass, commit `feat(epl): M-31 automatic manager linking and claims (not applied)`.

### Task 2: Server routes and lobby

**Files:** Modify `cloud/epl.mjs` (read routes open to all, auto-link on draft/read, new `'/epl/claim':['POST']` with body `{ownerId}`, the `claim` field in draft/read for unlinked callers: `{ managers: [{ownerId, name}] }` listing unclaimed managers, with new error codes mapped to 409/400), `cloud/epl-fantasy-view.mjs` if it assumes a member, `cloud/lobby.mjs` (`epl` = M-30 present), and `EPL_RPCS` in `cloud/handler.mjs`. Tests: `tests/epl-routes.test.mjs`, `tests/cloud-lobby.test.mjs`, `tests/epl-fantasy-view.test.mjs`, `tests/route-modules.test.mjs`.

- [ ] Failing tests. A non-member gets 200 on draft/read (`me: null`, `myQueue: []`, `claim.managers` = unclaimed). A non-member gets 403 on pick and queue/save. Fantasy/read returns 200 for a non-member with no private data. Auto-link runs once per draft/read for unlinked callers, and its absence is skipped. Claim maps codes to 409. Lobby returns true when gtl_epl_member answers (any value, including null) and false on missing or error.
- [ ] Implement, pass, commit `feat(epl): open EPL reads to every account and add claims`.

### Task 3: Claim card and read-only EPL

**Files:** Modify `web/src/next/epl/EplApp.jsx`, `web/src/next/epl/PickATeam.jsx`, `web/src/next/epl/EplHome.jsx`, `web/src/next/epl/route.js` (access = lobby `epl`), and `web/src/next/epl/api.js` (`claim`). Create `web/src/next/epl/ClaimCard.jsx`. Tests: `tests/epl-app.test.jsx`, `tests/epl-pick.test.jsx`, `tests/epl-route.test.mjs`.

- [ ] Failing tests.
  - An unlinked account sees the board read-only: no pick or queue buttons.
  - The claim card reads "Which FEPL manager are you?". It has one button per unclaimed manager and a "Just watching" choice that hides the card for the session.
  - Claiming calls `claim {ownerId}`, then reloads.
  - `GTL_EPL_CLAIMED` shows "Someone already claimed that manager." and reloads.
  - A linked account never sees the card.
  - The EPL option shows on the sport switch whenever lobby `epl` is true.
- [ ] Implement with the D-38 kit and tokens only, pass, commit `feat(epl): claim card and read-only EPL for every account`.

### Task 4: Docs

**Files:** `docs/DECISIONS.md` (D-68 addendum: Sean's words, open reads, auto-link rules, claim, audit, risk), `docs/COMPLETION_REGISTER.md` (an EPL open access row), `docs/RULES.md` (if it has an EPL row), and `planning/PLATFORM_WORK_QUEUE.md`.

- [ ] Write, run `python3 scripts/check-brand-docs.py`, commit `docs(epl): open access and automatic linking`.
