# Frame browser contracts — November 7, 2026

Status: local test-only reconciliation against reviewed source
`e16fe8c6907f5390aee49287613084b2aaa96a7a`; independent integration review and
exact-head CI remain separate. Frame authority follows the
[context reconciliation](PRISM_FRAME_AUTHORITY_RECONCILIATION_2026_11_07.md).

The original browser contracts assumed only Home had compact chrome and that
Play always supplied the league header pill. The approved Home, Play and Bets
roots now share compact framing. Research's actual landing retains the native
league header; it is distinct from its named sections. No Menu switcher or new
product control is introduced by these test changes.

`four-tab-redesign` explicitly checks the three named compact roots and native
Research root, retaining the exact 12px/0px dock offsets and 13px/16px navigation
label floors at both widths and themes. Its origin, reload, layer, accessibility
and primary-action assertions remain. The metadata allowance applies only to
navigation labels, not form inputs or body actions.

`next-scroll-navigation` measures shared `.gx-overview-frame` geometry rather
than Home body identity. Compact headers must be relative and remain at document
y=0 as the page scrolls; native headers must stay pinned at viewport y=0.
Negative controls deliberately make each header rule fail. All original route,
scroll-position, last-content, hit-test, containing-block, horizontal-overflow,
resize and keyboard-focus checks remain, including their existing negative
controls. This helper verifies geometry for the mounted frame; separate policy
contracts decide which real contexts may mount it.

`next-data` opens the league picker from the retained Research landing. It keeps
Community-first ordering, only-own-leagues privacy, selection and reload
storage, Play's due counter, both invite joins and exact write assertions,
expired-link recovery and session-storage clearing. On the named pending cover,
the actual Your leagues body action proves recovery access and the absence of
the nonmember league from available memberships; Escape restores opener focus,
then Switch to Community preserves the original recovery flow. The removed-
account case still verifies its private group members before checking current
league identity through the native Research root.

The late CI invitation, league-creation and account-layout failures use the
same retained Research root opener, including league creation's reload path.
Create/revoke, recipient binding, replay/no-duplicate, uncertain replies,
membership/privacy and long-label layout assertions stay intact. Shared sport
coverage verifies cold EPL Home's actual tab/account/read behavior, then checks
the FEPL league header on its real native Research destination. The final picker
opens from EPL Bets after asserting that exact native route and selected tab.
This supports the separately assigned EPL Home compact-frame expansion without
integrating its unreviewed source into this test branch.

Touched invitation, creation and shared-sport theme loops use the existing
`setCaptureTheme` helper: saved `gtl.theme`, a storage event, resolved preference
and theme assertions, and computed canvas/text token checks. Attribute-only
theme mutation is removed; all replay screenshots remain ignored outputs.

Local verification used disposable PGlite 0.5.8 and cloud-test assets on loopback
port 5302. The original four CI cases reproduced as four failures. The initial
three-file suite then passed all 13 cases; the final pending-cover tab-navigation
variant also passed in the 15-case late verification. That late run covered all
five invitation cases, all three league-creation cases, the changed account
layout case, all five shared-sport cases and the pending-cover case. Syntax and
diff checks passed. Historical design files remain byte-identical in Git.

These results use the reviewed baseline, not the separately assigned expanded
frame source. In particular, future compact EPL Home coverage still requires
the combined integration check; no unreviewed expansion is certified here.

No product source, provider collection, SQL, tracked PNG or historical evidence
manifest is changed. Replay output stays in ignored paths. Chromium fixture
checks do not establish hosted data, physical-phone acceptance or deployment.
