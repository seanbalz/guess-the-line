# Guess The Line — easier bet tracking release

Owner: Sean Balsiger · October 20, 2026 · Version 1

Status: implemented and checked locally; CI and production release pending.

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
46 focused Node tests including SQL privacy and token checks, seven cloud-browser
scenarios with PGlite and five classic browser scenarios passed; typecheck and
build passed. The final personal-toolbar adjustment passed two targeted browser
scenarios. Current-week landing and editor screenshots were inspected at 320/390
in light/dark, with no overflow or reported Axe violations. Required CI checks
the complete final source before merge. New tickets require an explicit stake
choice or retain Unknown; the editor no longer assumes one unit.

Record the reviewed full source SHA and CI links, merge SHA, actual API version
and source comparison, Pages ID and artifact digest, fresh preservation results,
browser verification and final three-machine sync after they occur. A branch push
or a successful build is not a deployment. Physical-phone acceptance is separate.
