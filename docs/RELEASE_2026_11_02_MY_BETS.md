# My bets spacing, searchable entry and Monday answers — November 2, 2026

Status: released November 2 in Pages `6c458d6d` from `e7a38c6`, together with
Pick reminders opt-in; see the [combined release record](RELEASE_2026_11_02_REMINDERS.md).
Independent signed-in My bets browser acceptance passed. Physical iPhone
acceptance remains open.

Sean's phone screenshots showed adjacent ticket borders touching after the Roomy
cards release. The legacy `.gx .gx-bets .gx-ticket-tracker .social-feed` rule
overrode both the new feed gap and its ungrouped frame. The legacy rule now
excludes the owner feed. The owner feed uses a sufficiently specific selector
and the existing 32px spacing token; tapping a preview still expands the full
ticket in place. Tests measure the distance between three populated cards in
Light and Dark at 320px and 390px, collapsed and expanded, and after reload.

The existing ticket editor now searches matchups by team/name and offers 33
named manual tracking sources, including exchanges and pick'em apps, with a
search field and the existing custom/unknown choices. Enter in search keeps the
draft open; saving remains an explicit action. Names support recording
current or historical tickets; they establish no quote connection or regional
availability. Player entry suggests matching names/team/position from the
existing public Fantasy snapshot for the exact ticket season/week and selected
matchup. Missing snapshots retain free-text entry. Changing matchup or market
clears draft prop fields, and only the existing five leg fields are serialized.

Monday personal accuracy answers continue to follow D-27/D-50: use the saved
qualifying reference immediately, or the first genuine qualifying line after
lock-in when none existed. Pending receipts now explain this wait and label
their existing read action **Check for answers**. Refresh retains unsaved
guesses and never exposes an unlocked game's answer. No scoring reference,
collection quota, lock, standings gate or save rule changes.

Read-only hosted checks confirmed D-61's Tuesday midnight Pacific Points jobs
are enabled. The next scheduled opening is November 3, 2026 at 08:00 UTC,
subject to the existing fresh-snapshot requirement. The current published week
and locked guesses are retained; no reset was performed.

The implementation lane separately reports authorized profile maintenance through
the existing audited compare-and-swap social writer, with private intended-state
and readback evidence. The acceptance lane performed no such write. Unrelated ticket entries, other social weeks, all Guess ballots and
Points guesses/slates matched their pre-write fingerprints. Private selections,
account identifiers and reconciliation payloads remain outside the repository.

Local validation passed: typecheck, 31 focused Node checks, all 621 component
checks, all 27 browser scenarios across Bets and per-game Play, the cloud build,
private-bundle scan and brand-document QA. The browser scenarios include measured
multi-card spacing, actual source/matchup search and player selection, exact
milestone serialization, unconfirmed-save recovery, and Monday answer refresh
without changing drafts or revealing an unlocked game. The phone layout and Axe
checks in those suites passed. Production evidence follows below; physical acceptance remains separate.

The release target is frontend only. Backend source, schema, existing provider
connections and schedules stay compatible. The initial #408-only rollback plan named prior production source
`46097802899472cdfb1bdb00c7c50248e2f24dab`. The actual combined release includes
reminder controls, so its recovery limits below supersede a blind older-source
redeploy. Frontend recovery does not roll back profile activity.
Physical-phone and actual signed-in production acceptance remain separate.

## Coordinated source and CI recovery

Sean requested #408 first, then Research and iPhone acceptance. Independent UI
support and the release lane reviewed final head
`b107aea83047a23dfbcc40d5bd0f2e4663349b42` with no actionable finding; all twelve
PR checks passed. PR #408 was already merged by another session at the final
reread, as `e02fed3b2e3cd9acf5bc63b4ecda1d0c3bcf5356`; no duplicate merge occurred.

Other sessions' #409 merge, manual newer-run retry and #411 merge caused CI
collisions under the main-ref concurrency group. The coordinator serialized
recovery rather than changing tests or accepting cancelled jobs. Original-source
[Tests 41537656678](https://github.com/seanbalz/guess-the-line/actions/runs/41537656678),
[Brand 41537656635](https://github.com/seanbalz/guess-the-line/actions/runs/41537656635)
and [Dashboard 41537656726, attempt 3](https://github.com/seanbalz/guess-the-line/actions/runs/41537656726)
ultimately passed, including Persona and all four browser shards. Read-only
[check-only 41543354162](https://github.com/seanbalz/guess-the-line/actions/runs/41543354162)
then pinned e02 and its successful runs. That report says `deployed: false`.
Temporary holds were cleared; an obsolete 86580e run was not restarted into a
newer live main run merely to create another cancellation collision.

Meanwhile an external release controller shipped the newer combined source
**`e7a38c6e9017a9c49cdf2a526482c05f8219f29f`**, containing #408, #409 and #411.
This acceptance lane did not dispatch or approve that release and did not deploy
e02. The actual published source, rather than the initial candidate, is the
basis of all acceptance below. Independent review and a direct diff confirm all
seven #408 runtime files are byte-identical between e02 and e7a. API contracts,
cloud source, `api.js`, `webPush.js` and locked dependencies remain compatible
with API v45. The additional reminder UI is not a permission/delivery acceptance
claim, and #409's Points-operation work is separate. Later main #413 is not in
this deployed source.

## Protected release and independent served readback

Actual-source exact-main checks passed, attempt 1:
[Tests 41540130228](https://github.com/seanbalz/guess-the-line/actions/runs/41540130228),
[Dashboard/Persona/four browser shards 41540130137](https://github.com/seanbalz/guess-the-line/actions/runs/41540130137),
and [Brand 41540130106](https://github.com/seanbalz/guess-the-line/actions/runs/41540130106).
[Source check 41541751112](https://github.com/seanbalz/guess-the-line/actions/runs/41541751112),
[protected readiness 41541822704](https://github.com/seanbalz/guess-the-line/actions/runs/41541822704)
and [frontend deploy 41542487945](https://github.com/seanbalz/guess-the-line/actions/runs/41542487945)
succeeded. Additional source check 41541864713 also passed.

[Card #414](https://github.com/seanbalz/guess-the-line/issues/414) identifies the
actual source, compatibility, preservation and recovery plan. GitHub's production
environment still requires reviewer `seanbalz`; the deploy's approval-history API
records approval by that account referencing the card and reviewed digest. This
lane did not use a relayed instruction as its own production approval. The
card's original pending/not-deployed text became stale; an
[independent readback comment](https://github.com/seanbalz/guess-the-line/issues/414#issuecomment-6591051704)
records the observed release without changing that historical provenance.

| Evidence | Observed value |
| --- | --- |
| Exact built/deployed source | `e7a38c6e9017a9c49cdf2a526482c05f8219f29f`, clean manifest checkout |
| Pages | `6c458d6d-a845-45a9-a213-e1db661feb64` |
| Verification time | `2026-11-02T23:06:54.275Z` |
| Source SHA-256 | `2d99ecba591f048b3d0f74cf52fa731ea3d94b2cd6daca4f0d0bcf648749c874` |
| Frontend SHA-256 | `a9899524220c8df40fa8f5da2b1dd0871bfe4a222b87521336afb2dbae71042d` |
| Served files | 127/127 matching production bytes and SHA-256; `_headers` is the additional configuration artifact |
| Live entry | `assets/index-B1JMAPIH.js` |
| API | ACTIVE v45, JWT verification on; bundle `7640627cfd1a457729382b90f09a3b094095c63da76c62a5559038e1190c675b` |
| Migration history | 72 rows; `b3b13f6f7557851b6d0f0be8893a1840aa5a7abdec1cb4ff42b68a33a9fc521d` |

The downloaded workflow reports confirm the exact source, current digest and
unchanged function metadata. An independent public HTTP pass additionally
compared the length and SHA-256 of every one of the 127 production files with
the clean manifest: no failure. The immutable deployment URL remains Access
protected; the workflow verified production. Remote API bytes were not newly
matched against this checkout; this was a frontend upload, not a new API source
attestation.

Fresh readiness at 23:00:32 UTC covered published 2026 Week 9 and 29 current/
carryover games. Calendar timing restrictions are off. M-33 `20261029151727`,
M-34 `20261029161613` and M-35 `20261029162144` remain pending. Boundary evidence:
444 checked, 425 denied, 19 awaiting those unrelated migrations; awaiting probes
are not successful denials. The frontend workflow applies no SQL and deploys no
API/worker. This lane made no schedule, permission, subscription or account write.

## Data preservation

Independent aggregate SQL before deployment at 22:27:38 UTC, after deployment at
23:07:44 UTC and after browser QA at 23:20:39 UTC found identical counts and
sorted full-row JSONB MD5 fingerprints:

| Protected set | Rows | Unchanged MD5 |
| --- | --- | --- |
| All weekly ballots | 37 | `68b52f4a8b2e09ae4c4f003157ba84ce` |
| 2026 Weeks 1–7 ballots | 25 | `c1d05dde9b64755d74f9bde4ac7544eb` |
| Social-week states | 4 | `049a33883b7d84be73dfb2d7dd81c65c` |
| Virtual Units picks | 7 | `6c191988b66431c8be77072c9a79e07b` |
| Points guesses | 20 | `b889d8059d178df9d8d1ef73ec35fb01` |
| 2026 Weeks 1–7 settlement records | 43 | `536396e58638069bdc6ac99a4b4c77f0` |

The query uses `md5(string_agg(to_jsonb(row)::text, '' order by to_jsonb(row)::text))`.
These aggregates are scoped to that query and are not interchangeable with older
cards using different row shapes, separators or cohorts. No raw picks, tickets,
account identifiers or financial amounts are published here. Artifacts and real-
account screenshots stay ignored under `.local/release408/`. The frozen v62
tracker is unchanged.

## Actual signed-in production browser acceptance

Direct observations on the fresh e7a document, using the existing authorized
account and Community NFL context:

- Before upload, entry `index-DWufmrF4.js` rendered 27 existing Week 8 tickets
  with 0px between adjacent cards. After reload, `index-B1JMAPIH.js` renders
  32px between every inspected adjacent row.
- At both 320px and 390px, Light and Dark, collapsed and expanded, the gap stays
  32px with no horizontal page overflow. Inline opening/collapse retains the
  original ticket details. A fresh mobile-width reload retains the fix.
- A new, initially empty QA draft verified matchup search, no-match and Enter
  retaining the editor; source search/no-match/Enter, ProphetX selection,
  Custom and Unknown controls; and the selected Week 8/matchup's public roster
  suggestion. A wrong-matchup search retained manual entry without a false
  suggestion. The exact `40+ receiving yards` preview rendered correctly.
- Changing market and matchup cleared stale draft player/line fields. No Save
  action was requested. Only this QA draft was discarded; Chrome's native
  discard confirmation initially blocked automation, then was resolved through
  its native UI. The editor closed with all 27 saved entries retained.
- Actual Week 9 Spread had 15 locked receipts already available. The existing
  Check saved picks action refreshed them with all 15 receipt texts unchanged;
  no pending receipt existed, so the pending-to-available transition remains
  local/CI evidence rather than a manufactured production test.
- No captured app error logs or horizontal page overflow. Original Light
  appearance and current Week 9 ticket filter were restored; the temporary
  browser viewport override was reset. No guess, tracked ticket, account,
  notification permission or subscription was changed.

These browser overrides are not physical iPhone evidence. Reminder opt-in/
delivery and the later Points context feature retain their own acceptance scope.
Research population/publication is handled by its designated acceptance owner
on this stable frontend before the final phone sweep.

## Remaining physical acceptance and recovery limits

Approximate #408 completion: **90–95%**, a judgment rather than a task-count
metric. Source/review/CI/merge, actual protected release, all-file readback,
preservation and signed-in browser acceptance are evidenced. Physical Safari
and applicable Home Screen acceptance remain open.

Native iPhone Mirroring connected only as far as a timed-out preflight:
“iPhone Mirroring timed out due to iPhone use while connecting. Lock your iPhone
before connecting.” The existing lock/ready request remains pending; no device
pass is claimed. After the Research owner is ready, this chat is the sole phone
operator for My bets spacing/search/scrolling/clearance, populated Research and
#388 Fantasy/Trends nested paths. Record actual appearance and Safari/Home Screen
scope, preserve drafts/settings, and do not close #388 from browser QA alone.

Do not overwrite the verified newer frontend with e02 merely to restore the
initial source pin. That removes the new reminder off control while existing
subscriptions could persist. Recovery requires a concrete defect and reviewed
compatible frontend fix/rollback under the normal protected gate; no automatic
schedule or data rewrite is authorized by this evidence record.
