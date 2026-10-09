# Week 5 Score Snapshots — repository linkage

Owner: Sean Balsiger · Version 1 · Reviewed October 8, 2026.

## Source and coverage

- Chat: [Week 5 Score Snapshots](https://chatgpt.com/c/6ac75c83-f73c-83e8-8462-e6222f85091e).
- Chat ID: `6ac75c83-f73c-83e8-8462-e6222f85091e`.
- Repository: <https://github.com/seanbalz/guess-the-lines-repo>.
- Checkout: `/Users/seanbalsiger/betting-repo`.
- Configuration: [`config/snapshots.json`](../config/snapshots.json).

The chat reader returned two assistant reports, for 2:01 AM and 8:02 AM Pacific
on October 8, with no older page available. Underlying tool transcripts,
attachments, full source quote captures, and any original automation prompt were
not supplied. These reports are context, not proof of external execution.

Local `main` and remote `main` both resolved to
`5ac31974578077420aa06d85a1c465d04eb2490b` before this change. All three snapshots
existed in that repository state. Their contents, source metadata and score
calculations were inspected directly.

## Reconciliation

| Chat report / condition | Repository evidence and handling |
|---|---|
| 2:01 AM: 95.8 / 150 saved | `2026-week-05-20261008T090121436Z.json` exists; 15 game scores sum to 95.8. |
| 8:02 AM: 96.4 / 150, +0.6 | `2026-week-05-20261008T150212589Z.json` exists; 15 scores sum to 96.4; four changes reconcile to +0.6. |
| Latest pointer blocked | It still selected the 2:01 AM record. Repaired locally to the 8:02 AM record after validation. |
| Dashboard disconnected | Both HTML copies embedded old lines and predictions. Replaced with one dashboard reading the validated local API. |
| First historical record | `2026-week-05-edraft-0333ET.json` scores 95.8. Only source publication time is present; it is not capture time. |
| Prediction identity | `picks_sha` is Git blob `9de978055ce423207eeeb54f7b2e4965df41293d`, matching the unchanged prediction file. |
| Market verification | URLs and page times are saved metadata. Source pages and individual sportsbook timestamps were not reverified in this task. |
| Official freeze | All records remain provisional. The stored kickoff field does not prove actual kickoff or a completed freeze. |

Latest game changes: Eagles/Jaguars −0.4, Browns/Jets +1.0, Bears/Packers +0.6,
Bills/Rams −0.6 accuracy points. Home-spread signs reconcile with the original
favorite/line predictions, including away favorites. The two archived invalid
matchup predictions remain excluded.

## Data path and future work

Saved predictions + timestamped snapshots → validation and `latest.json` →
loopback-only `/api/snapshots` → shared dashboard at `/` and `/dashboard/`.

The viewer shows current saved score, per-game changes, historical trend, source
and capture times, six-hour page-quote stale state, and audit export. Browser-only
manual edits and the apparent freeze button were removed because they did not
persist repository snapshots or enforce an official server benchmark. Time
passing does not manufacture a lock. A failed refresh clears displayed scores.

There is no ChatGPT-to-repository connector or recurring collector added here.
Saving another chat message does not update the repo. A future importer or agent
must persist a source-backed snapshot and run the README's validation and pointer
update commands. No message was sent to the source chat, and no existing automation
was changed. Local changes are not proof of a GitHub push or deployment.

Authenticated leagues, submission/reveal rules, independent quote verification,
official freeze, Guess the Total, Betting Challenge, and notifications remain
separate product work. Earlier noon-freeze and one-edit instructions conflict
with later decisions; this viewer does not enforce those disputed rules. Read
the latest sections of `RULES.md`, `DECISIONS.md`, and `AGENT_HANDOFF.md` before
implementing them.

## Verification

- Python unit and HTTP tests check scores/deltas, unchanged predictions, invalid
  data rejection, idempotent pointer updates, quote age, no automatic official
  lock, and local access restrictions.
- Nine Python tests passed. JavaScript syntax and Git whitespace checks passed.
- Headless Google Chrome verified `/`, `/dashboard/`, and `/dashboard/index.html`:
  96.4 points, +0.6 change, 15 games, and three history entries/chart points.
  Keyboard refresh, JSON audit export, 320px and 390px viewports, white-paper print,
  reduced-motion mode, failed-refresh clearing, and recovery passed with no page
  errors. Desktop and mobile screenshots were visually inspected; narrow tables
  scroll within their container. These checks apply to the local snapshot viewer,
  not another app, a deployment, or live quote delivery.

Source: bounded chat read plus repository files and Git refs, October 8, 2026.
