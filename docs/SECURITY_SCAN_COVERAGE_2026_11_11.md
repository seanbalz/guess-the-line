# Guess The Line — security closeout and scan coverage

Owner: Sean Balsiger · Version 1 · November 11, 2026 Pacific

Status update: [PR #551](https://github.com/seanbalz/guess-the-line/pull/551) merged
as `acbe8406a88481bc8b60045668b035c614bf059e` on November 11 at 7:36:32 PM Pacific
(November 12, 03:36:32 UTC), from final head
`4833cc685ced1d650a2243fff63989a652083396`. Its original publication below was
documentation only and left unmerged at that time. Later main integrations and
the merge supersede the earlier open status; they did not implement the remedies.

## Stage 1 implementation — November 11, 2026 Pacific

Sean authorized Project coordination to continue the security work. Branch
`codex/security-coverage-gates-2026-11-11` starts from the verified #551 merge.
Remote PRs and commits were checked for duplicate fixes before implementation.
This stage addresses the workflow and two active modules; design, legacy JSX,
generated bundles and frozen artifacts retain their explicit coverage limits.
No new PR merge, deployment, migration, account change or third-party message is
authorized or performed by this stage.

- Both scanners now run on every PR, including changes confined to `web`,
  `shared`, `design`, `planning` or documents. They check out the actual PR head
  rather than relying on GitHub's synthetic merge SHA. Manual/weekly runs use
  their requested workflow SHA. Permissions remain read-only, with no production
  secrets or automatic fixes.
- Semgrep is fixed at 1.185.0. `scripts/security_audit.py` verifies the source SHA
  and clean CI checkout, downloads the same two public packs through the bounded
  HTTPS helper, saves their original bytes, hashes and rule version IDs, and
  scans those saved rules without rewriting their IDs. Safe YAML decoding also
  accepts JSON; the registry serves different formats to different clients.
  Rules remain current at retrieval time, not permanently pinned to old packs.
- The artifact contains the raw report, verbose log, manifest, Markdown summary
  and `coverage.json`: findings, diagnostic file/type/rule/message hashes, scanned
  paths, skipped reasons/rules and tracked paths absent from the scanned list.
  Missing/malformed/empty reports, wrong engines, execution/setup failures or a
  nonzero scanner exit fail evidence generation. Existing findings and scanner
  diagnostics remain report-only; limitations produce a visible warning and a
  **limited** label, not a clean-coverage claim. A diagnostic regression gate is
  still a later step, not silently enabled or treated as passed here.
- Budgets are explicit: five seconds per rule, three timeouts before abandoning
  a file, 1,000,000-byte file limit and two workers. No rule or file exclusion was
  added. Skipped and scanned lists can overlap for partially analyzed files;
  tracked-but-not-scanned paths also include unsupported/non-code files.
- Matrix shard and aggregate result values now enter Bash through quoted
  environment variables; the event notice uses `GITHUB_EVENT_NAME`. The required
  success gate still rejects failed, cancelled, skipped and empty results.
  `cloud/epl-standings.mjs` and `shared/ops-alert.mjs` spell the literal opening
  `<` in their regexes as `\x3c`. No matching behavior changes.
- Trivy retains its existing pinned action and scan policy. Its engine/database
  version output is now included with the report. Earlier job logs show Trivy
  0.70.0 and a skipped Rego module requiring a newer engine. This is an additional
  coverage limit to review, not something a zero high/critical count resolves.

Local validation: 11 evidence-reporter tests, 14 HTTPS boundary tests, 30 focused
Node tests, Brand QA and diff checks pass. The new workflow/report tests first
failed against the missing behavior. Both regex modules have equivalent
normalized Babel ASTs; three edited Bash snippets pass `bash -n`, and executing
the aggregate gate returns success only for `success`. Frozen v62 files are
byte-for-byte unchanged in Git.

The fresh unchanged-main baseline scanned 1,775 files with zero findings and
**27 diagnostics**: 20 partial parses, one matching error and six timeouts. Three
extra local timeouts compared with the earlier report involved a preview build,
the research bridge and `shared/trends.mjs`; timeout fingerprints vary with
runtime conditions. The initial staged-source scan (dirty checkout, not final
head evidence) scanned 1,776 files with zero findings and **19 diagnostics**:
16 partial parses and three bundle timeouts. The five targeted parsing/matching
diagnostics are removed; disappearing incidental timeouts are not claimed as
source fixes. Resolved packs contain 560 and 225 entries, 690 unique rule IDs.
Clean implementation commit `4166395a02ed740059e1616631a9ade25e36bd53` is published
in [PR #556](https://github.com/seanbalz/guess-the-line/pull/556). Both its local
scan and [hosted audit](https://github.com/seanbalz/guess-the-line/actions/runs/43151668317)
completed with zero findings, 16 partial parses and three bundle timeouts. Both
scanned 1,776 paths, listed 25 oversize and 587 ignore-pattern entries, and recorded
3,549 tracked paths absent from the scanned list. Seventeen partial/error skip
entries overlap the scanned inventory. Timeout rule identities can vary; full
file/rule fingerprints remain in each artifact. The five targeted diagnostics
are absent in both reports.

| Evidence at `4166395a` | SHA-256 |
| --- | --- |
| Local Semgrep report | `d8ad6c0668ddd824a3fd1771656ec1a980643876ba4da31cf6435396cd23fd7e` |
| Hosted Semgrep report | `5e802d5a61bb1263fbe3c44f51fc3c8893d5f4d04993709cbc3f1c56d150ba0f` |
| Local OWASP pack | `43beca03b92e943e60210ba74330bbddac8d12254cab85587cbbc91e77df4e32` |
| Hosted OWASP pack | `c3e53c168af0117dbe123dcdaeb52b45e604b885e78ba95885cc2e2fdf6b5b53` |
| Security-audit pack, both runs | `83d7cde9157b3c79cc5cfaea26e7bd2ba9c740f2ba07635ad475b2585556c32d` |
| Hosted Trivy report | `b7a0a9529ad1e51a5503dbe617293aeb65e2bb65c352d82deec1f66fb6470b9b` |

The OWASP raw bytes differ but all 560 decoded rules compare equal by ID;
the manifest records individual version IDs. Trivy 0.70.0 reports zero
high/critical vulnerabilities, secrets or misconfigurations. Its log explicitly
skips `aws/cloudfront/enable_logging.rego`, which requires Trivy 0.72.0. The first
version artifact contained only the engine because it used a different cache
directory; the final workflow uses the scan's explicit `.cache/trivy` for version
reporting too. That correction and this evidence-only update receive another
exact-head hosted audit; the PR checks identify the final commit and artifacts.
No all-checks-passed or full-coverage claim is made by this intermediate record.

Local and downloaded hosted evidence lives under
`C:/Users/sbals/outputs/security-coverage-gates-20261111` and this worktree's
ignored `.local/security-audit-*` folders.

Remaining work: normalize editable design/legacy source with equivalence checks;
retain frozen artifacts unchanged; review the bundle with disclosed supplemental
coverage; inspect the oversize/ignored inventory; make diagnostic changes a
separate reviewed gate; and address Trivy's engine/policy compatibility. The
earlier investigation and experimental results below remain historical evidence.

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
credentials or private player data. They are local evidence, not published source changes.

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
when repeating this command; the current remote packs may change. At original
publication #551 carried documentation only and had no merge authorization in
this chat; the verified subsequent merge is recorded at the top.
