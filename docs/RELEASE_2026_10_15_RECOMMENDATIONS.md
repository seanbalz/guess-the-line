# Guess The Line — recommended bets release, October 15, 2026

Owner: Sean Balsiger · Record version 1 · Deployed October 15, 2026, 8:14 AM Pacific

**Deployed:** Pages `ed3fb50b` and API v24 serve [D-48 recommended bets](RECOMMENDED_BETS.md)
from `b883c7742979d133720ed931c520821fdc4a13b5`. Both frontend URLs matched all
93 served assets at 15:14:26 UTC. Signed-in read-only checks passed after deployment. The old app remains the default. No production player record was
prepared, placed or saved during release verification; actual iPhone acceptance
remains open.

## Authorization and delivered scope

Sean requested **“We need to deploy this into the app”**, then revised the
three-point cutoff to **“make it a red yellow green situation”** and
**“it recommends the top 3 bets and then from there you can expand the table”**.
The requested deployment includes the necessary narrow additive D-48 writer.
Existing redesign migration gates remain separate.

Bets → Recommended in the opt-in app and Virtual Units → Recommended in the
classic app rank the account's submitted Spread/Total discrepancies together.
The top three appear first; every other positive gap can be expanded. Both
sides show signed points and text-labelled colors: green at +1 or more, red
at −1 or less, yellow between. These express the player's perceived value,
not model confidence or a probability.

Add to card prepares a Virtual Units selection for explicit review and
placement. Exact selected book/line/odds/units/time remain visible across quote
refreshes. Existing picks cannot be overwritten here. Closed drafts remain
visible; saved picks remain in Your virtual card after kickoff or a disappearing
gap. Earlier published weeks are read-only. Recommendations use the account's
current Community week even when its private group is a week behind.

The two new routes reuse stored quotes, personal context and M-01 gates; no
provider request, paid data, new model or collection schedule was added. Missing
gates fail closed. Only the additive writer migration below was applied.
M-02, M-03, M-04, M-05, M-06 and M-08 remain unapplied. Existing Guess rules,
scoring, group routes, real-money ticket records and settlement scheduling remain
unchanged. GTL does not place an external sportsbook wager.

## Local and CI checks

- Full local suites: **1,292 Node tests passed, zero failed/skipped; 174 Vitest
  tests passed across 11 files**. Typecheck, build, brand and cloud-bundle
  privacy checks passed.
- All nine recommendation browser scenarios passed together in CI. The full CI
  browser runs passed 41 local-app, 241 cloud-app, 16 persona, four performance
  and seven accessibility cases. Coverage includes ranking/expansion, explicit
  placement, current-week independence, drafts/locks, retries, refreshed quotes,
  lost-success readback, kickoff closure, retained saved cards and history.
  Saves used fictional local accounts.
- Four axe/overflow scans passed: dark/light at 390px and 320px. These browser
  checks do not establish physical-device acceptance.
- [PR #130](https://github.com/seanbalz/guess-the-lines-repo/pull/130) merged at
  15:12:15 UTC after all four required CI checks passed. Workflow evidence:
  [38754405361](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38754405361),
  [38754405860](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38754405860),
  [38754405598](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/38754405598).
  The merged tree is `2364d2b80d51ecebd25c31dbd0814092d79309d2`, identical to
  the checked PR head's tree.

## Deployment identity and sequence

| Item | Verified evidence |
| --- | --- |
| Source | Clean release build at `b883c7742979d133720ed931c520821fdc4a13b5`; later documentation commits record this release without changing deployed source. |
| Preflight | 15:12:42 UTC / 8:12:42 AM Pacific; published 2026 Week 6, 14 games; next kickoff October 15 at 5:15 PM Pacific, previous kickoff October 12 at 5:15 PM Pacific. No nearby kickoff in the query's preceding-six/following-two-hour window. |
| Compatible API first | `gtl-api` v24 ACTIVE, updated 15:12:50.524 UTC, `verify_jwt: true`; bundle metadata SHA-256 `22bb9a8023a3804f640b33322c06aa168666894eb9ffbaac794ecc07b43a464a`. |
| SQL | Only [`20261015143006_gtl_recommended_virtual_pick.sql`](../supabase/migrations/20261015143006_gtl_recommended_virtual_pick.sql) executed; its version alone recorded as applied. Verified by 15:13:25 UTC. No generic database push. |
| Writer | `gtl_save_recommended_virtual_pick(uuid,integer,integer,bigint,jsonb)`; hosted `md5(prosrc)` **`da5c1747a0c095b4ff37a4b56053802a`**; security invoker; execute granted only to `service_role`, not PUBLIC/anon/authenticated. |
| Build | `npm run build:cloud`; 94 artifacts / 2,130,469 bytes, including `_headers`; compiled `.local/cloud-dist` only. Manifest created 15:13:43 UTC. |
| Manifest SHA-256 | `b429c815467b9f5d9ade122be8fd53098fc7a46d5ab60f296b075927e7bdd4c8` |
| Frontend digest | `b8dff997499440bfd5edd180ec5e594c2b22652f52dd8c5f07de47570f1c4496` |
| Pages | Production branch `main`, deployment `ed3fb50b-388b-4330-8767-8bd08adb9255`, source `b883c77`; completed before 15:14:26 UTC. |
| Served assets | **93/93 matched** at both [immutable deployment](https://ed3fb50b.guess-the-line.pages.dev) and [production](https://guess-the-line.pages.dev), 15:14:26 UTC; `_headers` is configuration and excluded. |
| Other Edge functions | odds-refresh v4, week-open v3 and push-reminders v2 remained ACTIVE with unchanged versions, bundle hashes and JWT settings. |

## Preserved state and live readback

The same aggregate SELECT-only capture ran before at **15:12:42 UTC** and after
at **15:15:35 UTC**. The comparator passed **25/25**, zero failures or review
items. Hashes below use matching serializations and are not interchangeable
with other releases' differently structured digests.

| Invariant | Before → after |
| --- | --- |
| Hosted rules | Unchanged `{revealAt: "kickoff", sentFinal: false, lateWindow: "deadline"}`. |
| Historical ballots | 9 → 9; MD5 `f25cea85d98688f716412725258396b3`. |
| Historical scores | 9 → 9; MD5 `a94e272b5a29042e747ce92bc7a3b7ee`. |
| Week 5 numeric anchors | 95.8 / 91.4 / 37.6 each matched one ballot before and after; numeric presence is not player identification. |
| All virtual picks / settled results / settlement ledger | Each 0 → 0; each MD5 `d751713988987e9331980363e24189ce`. |
| Nine selected existing functions | Bodies, signatures and privileges unchanged; this is not an inventory of every database function. |
| Migration history | 33 → 34, only D-48 added; excluding D-48, the 33-row MD5 remained `638ffb19092af59c62a94d49ca96b4a0`. Pending redesign migrations remained absent. |
| Original Week 5 source file | SHA-256 unchanged: `a4ee8f13c4b58777767dbd94a022dbc0a721ff6ece90522e4ddf4e25d2d9f1dd`. |

The live boundary check recorded **229 denials** and **10 existing checks awaiting
their separate migrations**. It includes the new routes without valid sessions
and the new RPC's direct anonymous boundary. Signed-out denials establish
authentication protection, not authenticated placement. The required `--strict`
run stopped at the existing unapplied M-08 `gtl_read_guess_picks` RPC (404);
full strict rollout coverage is not claimed. D-48's writer and both routes are
no longer listed as awaiting deployment.

The signed-in production walkthrough after deployment verified:
Recommended used Community Week 6 while Triple Threat remained Week 5; three
of 23 suggestions appeared initially and expansion showed all 23. A 390px
browser viewport had scroll width 375px, with no horizontal overflow. Week 5
was view-only and showed no saved virtual picks. Community/Home and the
original viewport were restored. No production selection was prepared or saved.
Successful production placement, physical-phone acceptance and a populated
historical card are not established by this walkthrough; those flows have
separate local fixture evidence.

Evidence logs, aggregate captures and task observations remain private
under ignored `.local`/task storage, including `recommended-{before,after}.json`,
`recommended-invariants.json`, function metadata, deployment logs,
`recommended-live-assets.jsonl` and `release-manifest.json`. The supplied private
message screenshots are not included in public source or static assets.

## Off switch and rollback

- Add `recommendations` to the existing comma-separated `GTL_FEATURE_OFF` value,
  preserving other flags. Both new routes return 503; verify with an authenticated
  request. Stored records remain intact.
- [`supabase/admin/disable_recommended_virtual_pick.sql`](../supabase/admin/disable_recommended_virtual_pick.sql)
  revokes execute on only the new writer, including from `service_role`, without
  deleting rows or replacing any old function. This additive writer has no prior
  body to restore.
- Previous frontend: Pages `fc7f3cd2-7a5a-461c-9aaa-fc5bc0247aa4`, source
  `d71a988dd118c0e9bce69d112dfc6b1b87507d74`, retained in the deployment listing.
  Previous API: v23, recorded source `48f48ddd9f35a73c80632a04089a503f372d7c7b`,
  bundle metadata SHA-256 `a65ef8d7fe80ed02f272ba4d4b00aceb379eaf54c2d8ead6f6b2be635e3641f5`.
  The official download stopped at a guarded external-module path after one
  file; **no full API backup was captured** and the path guard was not disabled.
  That partial download is not a verified complete rollback bundle.

No rollback or off switch was exercised. After recovery, verify old routes,
live rules and preserved data. Full redesign services, other M-xx applies,
automatic settlement, actual phone acceptance and default-app cutover remain
separate work. The [earlier October 15 release](RELEASE_2026_10_15.md) retains
its own evidence for formatting, profile editing and private notes.
