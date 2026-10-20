# Guess The Line — easier bet tracking release

Owner: Sean Balsiger · October 20, 2026 · Version 1

Status: released and verified October 20, 2026; implementation merged and synced
on Windows, Mac Mini and MacBook Neo. This evidence change has its own PR.

Sean selected actual bets first with Virtual Units separate, then requested that
the work be finished, deployed, merged and synchronized before the next item.
See the [design](superpowers/specs/2026-10-20-easier-bet-tracking-design.md).

## Compatibility and release order

The shared tracker continues using the existing social ticket store, correction
audits and line-lock rules. The API adds a read-only grouped `settled` filter;
existing exact outcome filters remain compatible. Deploy the reviewed API first,
with JWT verification enabled, then the exact tested Pages build. No database
migration, provider collection or synthetic production ticket is required.

Initial hosted inspection confirmed API v26 ACTIVE/JWT true, Pages
`0933a030-ff36-4a22-8cd7-fb2b7675863c` from `8942725`, odds collector v4,
week-open v3, push v2 and results worker v1. Recheck immediately before deployment.
Current main preserves that Pages source's Home/Fantasy behavior. The separate
M-10 and D-53 migrations stay unhosted; do not apply them during this release.

Before/after checks must compare migration history, social ticket state and
commit hashes, ballots, function permissions and unrelated worker versions.
Live verification must compare served assets against the release manifest and
verify signed-out boundaries and permitted read behavior. Fixture writes are
local only. Actual tickets remain player reported; final-game automation does
not settle external sportsbook tickets.

Rollback: restore the prior Pages deployment first. API v26's captured source is
the API fallback; the old Pages also works with the new additive API filter, so
an API rollback is optional unless the API itself regresses. Never remove ticket
rows, corrections or audit history. Do not restore an older pre-results API.

## Completion evidence

Implementation commit `fe3ffc852cfd7f6c45ee9ff8199f422ed95cbd25` reconciles the
existing Mini button-entry work without modifying its checkout. Local checks:
46 focused Node tests including SQL privacy and token checks, eight cloud-browser
scenarios with PGlite and five classic browser scenarios passed; typecheck and
build passed. The final personal-toolbar adjustment passed two targeted browser
scenarios. Current-week landing and editor screenshots were inspected at 320/390
in light/dark, with no overflow or reported Axe violations. Required CI checks
the complete final source before merge. New tickets require an explicit stake
choice or retain Unknown; the editor no longer assumes one unit.

The final review fixed a delayed-save/filter-switch race: an obsolete query now
returns before incrementing the active read generation. Its browser regression
failed before the fix and passed after it. My bets also explicitly selects tracked
tickets, preserving legacy virtual entries in their existing shared/history views.

## October 20 production evidence

Reviewed source: `fd97d07273c5f586772006acea5cbf548ef50aa7`.
[PR #155](https://github.com/seanbalz/guess-the-lines-repo/pull/155) merged at
23:20:43 UTC as `2d81436dc0f3bcbfd9c91b69c9049755eb8b4601`.
The merge tree exactly matched the tested source. All five required checks passed:
[Tests](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39511202422)
(typecheck/test and Windows portability),
[Dashboard checks](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39511201830)
(dashboard 26m43s and Persona suite), and
[Brand QA](https://github.com/seanbalz/guess-the-lines-repo/actions/runs/39511201718).
This was the authorized manual release path, not a protected Actions deployment.

The clean detached Mini release checkout built the pinned source, scanned its
bundle and generated the manifest. The existing project-scoped Cloudflare login
was used without copying credentials or changing the older dirty source checkout.
Only the new checkout's absolute artifact directory was uploaded.

| Component | Verified hosted result |
| --- | --- |
| API | v27 ACTIVE, JWT verification true, deployed at 23:21 UTC before Pages; all 46 retrieved source files match the pinned checkout after newline normalization. Only `cloud/social.mjs` and `shared/social-bets.mjs` differ from v26. |
| API bundle SHA-256 | `8fe54bce2eed82a973674fc31188bba548d21ad758bdefe8689bd811af91e656` |
| Pages | `9ef3f651-d82e-4805-bcb3-3b91e318cb29`, production branch main, source fd97d07 |
| Source manifest SHA-256 | `45c5dfe86a9bbf099aa7b0a188c2a1238fe45864a85ae9c2de99b8d285a2e564` |
| Frontend manifest SHA-256 | `9de00fe19a90d59efeb81cf1e240021f2aba3520c786aa59c22677e69a45ff76` |

At 23:22:13 UTC all 95 served artifacts matched their SHA-256 hashes at both
[the immutable deployment](https://9ef3f651.guess-the-line.pages.dev) and
[production](https://guess-the-line.pages.dev). The remaining manifest artifact,
`_headers`, is configuration. Cloudflare's exact same-origin canonical redirects
were checked for index.html to /, privacy.html to /privacy, and terms.html to
/terms; those destinations rejected further redirects and matched artifact bytes.
The initial direct-HTML verifier rejected these redirects. This manual validation
does not claim that the separate Q02 protected-workflow verifier is repaired.

Fresh before/after SQL snapshots at 23:19:17 and 23:21:38 UTC matched completely
apart from observation time. Migration history remains 45 entries with SHA-256
`37992acba8e8b546b34f57305e9a434525260da26d28e15c39952622acfebb5d`.
Published schedule evidence validated with Week 7 current and time restrictions
disabled. No migration was applied; M-10 and both D-53 migrations remain unhosted.

| Preserved data | Count | Unchanged ordered-row MD5 |
| --- | --- | --- |
| Social week state, including ticket history | 1 | `e8d42a844652cd88cdab8068781b0d99` |
| Social commit receipts | 38 | `22a5bafe6c217f87e68b2f7722a5fad6` |
| Ballots | 23 | `a45bf0bf9c59e4543407f544e86d6987` |
| Week 5 Guess score rows | 135 | `f641f11becc1748f7daf321fac8b5d38` |
| Week 6 Guess score rows | 168 | `c2a4fc18a2d80c204e6b086f7b23987a` |
| Private groups | 5 | `a1f06fa4c7aadced4df70a33d57437fb` |
| Virtual Units original terms/timestamps | 2 | `e21047bc9efc40ae093ca266a438c79f` |

Social read/commit/follow function bodies and service-only grants were unchanged;
all remain security invoker with an empty search path. Other Edge functions were
unchanged: odds collector v4, week-open v3, push v2 and results refresh v1.
The before/after boundary runs each checked 268 probes: 262 denials and the six
existing missing-RPC allowances for M-10/D-53. No new allowance was added.
Aggregate database reads for all nine profiles confirmed current Week 7, one
current-week result, complete published-week history and visibility gates.

The live signed-out app loaded its sign-in screen. Signed-in flows were exercised
with local PGlite fixtures; no real ticket, pick or forced provider collection was
created for verification. Human signed-in and physical-phone acceptance remain
separate. The old/new app rollout setting was retained.

Windows `C:/Users/sbals/betting-repo`, Mini
`/Users/seanbalsiger/.codex/worktrees/shared-sync/betting-repo`, and Neo
`/Users/seanbalsiger/betting-repo` each passed sync:pull and sync:check at
`2d81436dc0f3bcbfd9c91b69c9049755eb8b4601`, with zero ahead/behind/changed files.
The two previously documented dirty Mini worktrees were preserved. This evidence
PR records its own final merge and three-machine synchronization in its PR body;
documentation-only follow-up commits do not require redeploying identical runtime assets.
