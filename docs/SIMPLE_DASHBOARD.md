# Simple dashboard and chart work — October 8, 2026

Owner: primary dashboard workflow. Scope: the current request for simpler pick
entry, beginner explanations and useful interactive charts. This is an
implementation record; release status is recorded separately.

## Product rules for this pass

- One visible chart at a time, with labeled Player points / Accuracy mix /
  Line movement choices. Avoid repeating the same score in several open cards.
- Horizontal bars compare players. A donut shows the composition of the current
  player's saved-reference accuracy: exact, within one point, farther than one
  point, and unscored. These categories must be disjoint and show their counts.
- Line charts show actual collected observations with source timestamps. Market
  movement is informational; it must not appear to change saved D-16 points.
- Saved submission/edit-time references remain distinct from latest collected
  consensus. Missing historical references stay unscored. A genuine zero score
  is different from absent evidence.
- All views preserve the matching full-ballot reveal gate, private group roster,
  full-week scoring and the separate dashboard display filter. No public member
  data, forecasts or betting activity is inferred from these visualizations.
- A short, closed-by-default How to read this guide explains the current mode
  using clearly marked examples. Main actions and chart controls work with
  keyboard and touch, at 320/390px, in Light/Dark and reduced motion.

## Tools available in this workspace

Codex App Tools can open a local preview or a review panel, inspect related chat
status and organize saved work. Browser automation and automated browser checks
can exercise actual pick flows, measure layout fit and verify keyboard behavior.
Parallel implementation and review workers are available; they share files, so
ownership must be explicit. The existing React/SVG stack is sufficient for these
charts without adding another runtime dependency. Current repository data and
backend checks provide the privacy and scoring constraints.

Cross-chat messaging is waiting for the user's specific coordination answer.
Independent chart and guide components can proceed without editing files owned
by the other active chats. This question does not change authorization for the
current project's implementation work.

## Verification boundary

Synthetic preview data must be labeled as such and kept local. Local charts and
passing tests do not establish a hosted database migration or a production
release. D-16 deployment, current-quote capture, results/journal work and new
chart publication must be coordinated before a combined release.

## Completed local handoff

Status: READY FOR SHARED RELEASE REVIEW; not deployed by this workflow.

- Added `DashboardInsights.jsx`, `dashboardInsightsModel.js` and scoped styles.
  Player points, Accuracy mix and Line movement use a single tabbed area in
  `VisualDashboard.jsx`. The deeper player comparison starts collapsed; the
  duplicate standalone movement chart is suppressed when its tab is available.
- Added the closed `ChartGuide.jsx` explanation for Spread and Total. Market
  movement remains separate from saved accuracy references. No forecast,
  recommendation, public split or ROI is manufactured by these charts.
- Completed seven focused model tests: individual references, reveal/privacy
  gates, zero versus missing, invalid inputs, filters, independent Total mode
  and duplicate-game protection.
- Completed nine browser tests against the compiled app: tab keyboard behavior,
  comparison expansion, missing references, hidden ballots, Over/Under parity,
  game filters, 320/390px Light/Dark layout, touch targets and reduced motion.
  All passed. These are chart-focused checks, not a claim about all application
  features or the hosted service.
- Local preview build passed. Preview is read-only, uses explicitly synthetic
  fixtures and serves only the compiled output on `127.0.0.1:5299`. It is for
  reviewing layout, not for entering actual picks. No private JSON root is served.

Reproduction: `node --test tests/dashboard-insights.test.mjs`; browser tests are
`tests/browser/dashboard-charts.spec.js` with `tests/fixtures/dashboard-charts.mjs`.
The isolated local runner is `.local/clean-ui.playwright.config.mjs`; the preview
server and runner are local review helpers, not production service configuration.
Screenshots are `.local/previews/clean-charts-{320,390}-{light,dark}.png`.

This workflow has finished its current small edit batch and will not stage,
commit or push during the separate shared-repository checkpoint. Its new chart,
guide, fixture and test files above are ready; there are no incomplete edits in
that batch. Files owned by other workflows, their backend migration checks and
their release manifest remain outside this chart handoff.

## Remaining simplification work

- UX-14/UX-15: reduce repeated navigation and make the next pick action clear.
- UX-02/UX-04: keep source receipts behind a compact four-value comparison:
  Your guess / Line when saved / Current line / Points.
- BET-01/BET-05/BET-06: compact journal outcomes and ROI charts once real settled
  records are available; preserve pending outcomes and separate currencies.
- SCORE-09/DATA-13: integrate the saved-reference and current-quote release
  without turning unavailable historical evidence into a score.

These remaining items are audit findings linked to the existing work register,
not new claims of implementation. The shared tracker remains under its existing
workflow owner's control to avoid conflicting updates.
