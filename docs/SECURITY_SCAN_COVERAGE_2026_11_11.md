# Guess The Line — security closeout and scan coverage

Owner: Sean Balsiger · Version 1 · November 11, 2026 Pacific

Status: PR #549 merged. Diagnostic investigation completed locally; the remedies
below are a follow-up plan, not changes to application code or scanner policy.
No production deployment, migration, account change or external issue submission.

## Verified merge

[PR #549](https://github.com/seanbalz/guess-the-line/pull/549), branch
`codex/security-warning-fixes-2026-11-11`, merged at November 11, 5:32:52 PM Pacific
(November 12, 01:32:52 UTC). Reviewed head:
`844f935b5ebab20a5fa53ec1acc188b84ef17c16`. Merge commit:
`0643ec05a831cb763521249f86a6c269ac39668d`, with parents
`fc2a942a9ad8705365cfec47257a3e108166b5f3` and the reviewed head.
Sean's conditional merge authorization covered this PR only.

All 14 checks on that head passed, including all nine required checks:
Brand QA, Windows portability, Typecheck and test, dashboard, Persona suite and
all four cloud-browser shards. The last shard completed after 25m55s.
[Tests](https://github.com/seanbalz/guess-the-line/actions/runs/43131914624),
[dashboard/browser tests](https://github.com/seanbalz/guess-the-line/actions/runs/43131914644),
[Brand QA](https://github.com/seanbalz/guess-the-line/actions/runs/43131914587), and
[security audit](https://github.com/seanbalz/guess-the-line/actions/runs/43131914600)
are the hosted evidence. Protection required no approving review, reviews and
review threads were empty, and GitHub reported CLEAN before the expected-head
merge. No protection was bypassed and no review approval was fabricated.

The closeout review examined the full change, rechecked the action pins against
publisher tags, and reran 14 Python download tests, 15 workflow tests and Brand
QA successfully. The broader local suites reported in the preceding completion
entry were not all rerun in this chat; the exact-head hosted checks passed.

A newly created, exclusively owned main checkout at
`C:/Users/sbals/.codex/worktrees/security-closeout-main/betting-repo` passed
`npm run sync:pull` and `npm run sync:check`: local and remote both at the merge
commit, zero ahead/behind and zero changed files. Other sessions' checkouts were
untouched. The report branch starts from that freshly fetched merge commit.
Post-merge main CI is separate from the PR checks and from deployment.

## Reproduced coverage limits

The final hosted audit used Semgrep 1.185.0: zero findings, 1,772 scanned files,
20 PartialParsing diagnostics, one internal matching error and three timeouts.
Trivy reported zero high/critical vulnerabilities, secrets or failed
misconfigurations. Those are scoped scan results, not proof of complete coverage.

The hosted report SHA-256 values were independently verified:

| Report | SHA-256 |
| --- | --- |
| Semgrep | `2138b055bfab15470e69176e4ee6ff694b4430c227a534ae33ff77c43acdf84a` |
| Trivy | `b3c374cb9f210e71568e1a39847fe4070b3082fb0614e304595570a0d34e152a` |

The same Semgrep version, two rule packs and default budgets reproduced all 24
diagnostics locally on the reviewed head, with zero findings and 1,772 scanned
files. All 21 affected files have identical Git blobs in the reviewed head and
the merge commit. This establishes the diagnostic source correspondence without
claiming a new full-repository scan of the merged tree.

The [baseline audit](https://github.com/seanbalz/guess-the-line/actions/runs/42988129446)
has the same diagnostic counts and affected files, but **not an identical set of
timeout rule IDs**. Its `javascript.express.security.injection.raw-html-format.raw-html-format`
timeout becomes `javascript.express.security.audit.express-ssrf.express-ssrf`
in the final report. The other two timeout IDs are unchanged. The default
five-second per-rule budget and three-timeout file threshold can conceal further
coverage gaps; a stable count is not a stable coverage fingerprint.

## Classification and narrow remedies

No application syntax defect or exploitable vulnerability was established by
these diagnostics. Babel parsed all 17 affected JavaScript/JSX files, including
the generated bundle. parse5 parsed both HTML files with zero parse errors.
Existing EPL standings and operations-alert tests also passed: 21 tests, no
skips. These checks validate syntax and the tested behavior, not security
coverage of every path.

| Category | Original diagnostics | Cause supported by the experiment | Narrow follow-up |
| --- | ---: | --- | --- |
| GitHub expressions inside Bash | 2 partial + 1 internal | The rule reparses raw `${{ ... }}` as Bash before GitHub substitutes it. | Pass matrix/result values through step environment variables and use `GITHUB_EVENT_NAME`; retain the same trusted values and success gate. |
| HTML-comment regex literals | 2 partial | Semgrep rejects valid `/<!--.../` literals in two modules that Node/Babel accept. | Express the first literal `<` as `\x3c`, with behavior tests, or reproduce and fix the scanner parser. |
| Conditional operators before fractional numbers | 4 partial | Valid `condition?.5:...` syntax is confused with optional chaining. | Write `condition ? 0.5 : ...`; compare syntax trees and existing behavior. |
| Ampersands in JSX text/attributes | 10 partial | Valid literal ampersands and query separators are rejected by the scanner. | Use `&amp;` in affected JSX text/quoted attributes, preserving rendered text and URL values. |
| Ampersands in HTML | 2 partial | Both documents are accepted by the HTML parser; equivalent entity spellings clear Semgrep's warnings. | Normalize the editable design document if desired. Keep the frozen tracker byte-for-byte unchanged and retain its scanner limitation explicitly. |
| Generated design bundle | 3 timeouts | Resource limits are real; a longer targeted run also exposes another parser limitation. | Use a separate bounded coverage job with exact rule IDs, source/bundle hashes and parse checks; do not drop the bundle or declare it clean from timeout changes alone. |

The precise affected-file inventory is:

| Category | Files (repository relative) |
| --- | --- |
| GitHub expressions | `.github/workflows/dashboard-checks.yml`, `.github/workflows/test.yml` |
| Regex literals | `cloud/epl-standings.mjs`, `shared/ops-alert.mjs` |
| Fractional conditionals | `design/style-directions-2026-11-04/prepare-league-preview.mjs`, `prepare-score-history.mjs`, `prism-card-colors.js`, `prism-customizer.js` (all in the same design directory) |
| JSX ampersands, design | `design/style-directions-2026-11-04/populated-bets-overview.jsx`, `populated-export.jsx`, `populated-fantasy-rankings.jsx`, `populated-points.jsx`, `populated-research.jsx` (all in the same design directory) |
| JSX ampersands, legacy app | `web/src/App.jsx`, `web/src/CommunityHome.jsx`, `web/src/PredictionEntry.jsx`, `web/src/SocialBetTracker.jsx`, `web/src/VisualDashboard.jsx` |
| HTML ampersands | `design/style-directions-2026-11-04/prism-customizer.html`, `planning/project-tracker.html` |
| Generated bundle | `design/style-directions-2026-11-04/populated-research.bundle.js` |

The ten JSX diagnostics and two HTML diagnostics span multiple locations; the
20 partial-parsing records together contain 41 reported ranges. Do not fix only
the first displayed token in a multi-separator URL. An initial copy experiment
left a later `&layer=...` separator unhandled; normalizing all reported ranges
cleared that remaining warning.

## Controlled experiments

All experimental edits were made to copies under
`C:/Users/sbals/outputs/security-closeout-20261111`, outside the repository.
The frozen tracker and all tracked source files stayed unchanged.

1. The 20 files with parsing/matching diagnostics were scanned explicitly with
   the same two rule-pack snapshots. The final copy scan completed in 5.75s:
   **20 files, zero findings and zero engine diagnostics**. This is a targeted
   experiment, not a clean full-repository scan.
2. All 17 JavaScript/JSX originals and copies parsed with Babel and had equivalent
   normalized ASTs. Normalization removes locations/raw spelling/comments and
   equates the literal regex `<` with `\x3c`. Both HTML copies have the same DOM
   as their originals after removing parser location metadata. The three changed
   Bash snippets passed `bash -n`. These are supporting checks for a future
   implementation; no visual acceptance or full behavioral equivalence is claimed.
3. The **unchanged 934,020-byte bundle** was scanned using only the three rules
   that timed out in the final hosted report, `--timeout 60` and
   `--timeout-threshold 0`. In 74.94s it returned zero findings and no timeouts,
   but one PartialParsing warning at line 9, column 472672: `01:`. The source is
   a valid `a==="units"?.01:e.min` conditional. Increasing the budget alone does
   not close the coverage gap.
4. A separate bundle copy changed that single `?.01` spelling to `? 0.01`.
   Babel confirmed the same normalized AST. The same three rules, with the same
   60-second budget and no timeout threshold, finished in 74.23s with **zero
   findings and zero diagnostics**. This provides a narrowly scoped supplemental
   path; it does not establish full-rule coverage of the original bundle.

The three targeted rule IDs are:

- `javascript.express.security.audit.express-ssrf.express-ssrf`
- `javascript.lang.security.detect-eval-with-expression.detect-eval-with-expression`
- `typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml`

These were snapshotted from the public packs with version IDs `8KT5rBr`,
`WrTqKkJ` and `l4TJR0v`, respectively. Rule-pack URLs are mutable; preserving the
resolved rules and their hashes is necessary for a reproducible comparison.

## Follow-up sequence and acceptance

1. **Expose coverage separately from findings.** Record engine version, resolved
   rule hashes, scanned/ignored/oversize file inventory and diagnostics by
   file/rule/type. Treat new or changed diagnostics as reviewable failures in a
   dedicated coverage check. Keep any known remainder visible and fingerprinted;
   do not globally disable rules or use broad file exclusions. The current audit
   is report-only, and a green job does not mean its diagnostics are empty.
2. **Close the PR trigger gap.** The current security workflow has no `web/**`,
   `shared/**`, `design/**` or `planning/**` pull-request path filters. Those files
   can be scanned when a run occurs, but changes confined to those paths do not
   trigger it. Prefer running the audit on every PR, or verify a complete explicit
   path set. The existing weekly/manual scan does not establish exact-head PR
   evidence. Keep deployment and production credentials outside this workflow.
3. **Implement small source normalizations in a separate PR.** Start with the two
   workflow snippets and two active modules, then the editable design/legacy JSX
   files. Recheck relevant tests, Brand QA and before/after scan fingerprints.
   Document unchanged display text and attribute URLs. Never edit the frozen
   `planning/project-tracker.html` or v62 JSON solely for a scanner result.
4. **Finish bundle and frozen-artifact coverage explicitly.** Preserve the exact
   original scan, budget and warnings. Test scanner fixes with small public
   reproductions; no upstream issue has been submitted. A supplemental normalized
   copy must include original hash, transform, AST/DOM equivalence evidence and
   the exact rules run. It supplements the unchanged artifact scan and cannot be
   described as scanning every rule successfully on the original file. Confirm
   build inputs using `build-populated-research.mjs` and its esbuild metafile;
   the bundle mixes application, preview and third-party code.
5. **Broaden only with measured evidence.** The local default scan reports 25
   files above its 1,000,000-byte limit and 583 matches to ignore patterns.
   Inventory these and relate generated files to their inputs before changing
   limits. Do not infer complete coverage from the 24 reported diagnostics, a
   zero finding count, or tests alone. Verify the frozen tracker hashes and
   private-data boundaries in the implementation PR.

See the [Semgrep CLI reference](https://semgrep.dev/docs/cli-reference) for timeout
and file-size controls, and [GitHub's environment-variable guidance](https://docs.github.com/en/actions/reference/security/secure-use#use-an-intermediate-environment-variable)
for passing expressions through environment variables. The observed workflow
values here are trusted event/matrix/job-status values; this investigation did
not establish an injection vulnerability in them.

## Evidence retained locally

Original hosted artifacts remain under
`C:/Users/sbals/outputs/security-warning-fixes-20261111/final-scan`.
Closeout artifacts, reproduction scripts, isolated Semgrep installation, resolved
rules, source-blob inventory and experimental copies are under
`C:/Users/sbals/outputs/security-closeout-20261111`. They contain no production
credentials or player data. They are local evidence, not published source changes.

| Local report | SHA-256 |
| --- | --- |
| `local-pr-head.json` | `617cf4c72e92155b9db918a736f297787ed178cdd74c8185b3f6d5fe5f026182` |
| `candidates-parser-scan-final.json` | `5a9db4792aac676538878616f8b21da5427f05190ddcce68cf0381fd90adc2f7` |
| `bundle-three-rules.json` | `0b492de39b52bbb1330b7314e51054c472cf305961665fc938c841d39ec5d889` |
| `bundle-normalized-scan.json` | `f532db93f722b9e4cb9e16f82dd56abab4d1b4045175f9b9f9fecee1fd37b526` |
| `bundle-rules.json` | `49f12919eda512e2184f9ce11a7249ff164559656d0128742e12642e4bf2acce` |
| `security-audit-rules.yaml` (JSON is valid YAML) | `3e280f9214fb2a533fc94c60e318239ebaade31908cd4aa527fe66c75e54dd9d` |
| `owasp-top-ten-rules.json` | `d8a551640002f45e39d801359574af8438a87e5616c1b82a9a2588252facdb29` |

Reproduce the unchanged-head baseline with Python UTF-8 mode on Windows:

```text
semgrep scan --config p/owasp-top-ten --config p/security-audit --metrics=off --json --output semgrep-report.json .
```

Use Semgrep 1.185.0 and the reviewed source SHA above. Record the resolved rules
when repeating this command; the current remote packs may change. This report's
follow-up PR carries documentation only and has no authorization to merge itself.
