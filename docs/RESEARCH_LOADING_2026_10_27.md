# Research loading states — October 27, 2026

Owner: Sean Balsiger · Approved Research design follow-through · Source work

Research now uses the shared static loading skeletons introduced in PR #266.
A full read shows two panels; on-demand evidence and the lazy historical table
use compact lines. Every placeholder retains its loading status for assistive
technology, has no controls or fabricated chart values, and uses the existing
theme/forced-color treatment without animation.

Changing account, week, access or filters still removes the previous evidence
before a replacement read. An error removes the placeholder and retains the
existing explanation and explicit retry. Successful reads replace the loading
state with the actual evidence. Background matchup research continues to leave
the weekly trends visible while it loads, as before.

The existing reader and request lifecycle are unchanged: no new network calls,
automatic write retry, scoring change, data source or permission is introduced.

Local checks: 86 component tests, 19 token/brand tests and typecheck passed.
Two focused browser cases passed: a held period read cannot restore stale data;
an on-demand read fails once, retries only when asked, then waits for the table
chunk before displaying its real rows. Six 320px screenshots were inspected:
Light/Dark main and table loading, plus forced-color main loading. All 66
integrated Research, Lines, Trends, Bets Everyone and gesture browser cases
passed. Brand QA and fixture build/privacy checks passed.

Source branch: `codex/research-loading-states`. CI/merge, hosted release/readback
and physical-iPhone acceptance remain separate checkpoints. The live-game
status, dependent Bet/Challenge actions and broader acceptance work remain open.
No deployment, migration apply or frozen v62 tracker edit is included.
