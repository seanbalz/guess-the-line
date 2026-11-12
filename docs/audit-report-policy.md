# Audit reporting policy

All automated and AI-assisted audits are **report-only**. Never commit, apply, merge, deploy, or auto-remediate suggested fixes.

For each confirmed finding report:
- Severity (critical/high/medium/low) and confidence
- Category (security, bug, architecture, reliability, performance, maintainability)
- File path and line range, with reproducible evidence
- User or business impact and steps to reproduce
- Proposed fix (specific change or example patch, **not applied**)
- Suggested validation tests and regression risks
- False-positive or uncertainty notes

Deduplicate related findings and sort by severity, exploitability, and impact. Keep secrets and credentials out of reports and logs. If no finding is confirmed, say so explicitly; scanner failures must not be represented as clean results. AI recommendations require human verification before implementation.

Scope: read-only Semgrep and Trivy checks in `.github/workflows/security-audit.yml`; whole-repository AI audit integration remains pending validation. No automated fix PRs or direct production changes.

## Coverage evidence — November 11, 2026

Owner: Sean Balsiger · Version 1. Scan jobs remain report-only and never apply
their suggestions. The separately authorized stage 1 remediation is recorded in
[the coverage investigation](SECURITY_SCAN_COVERAGE_2026_11_11.md).

The security workflow runs on every PR and scans the exact head. Semgrep's
artifact includes the engine version, source SHA/clean state, raw resolved rules
and hashes/version IDs, budgets, raw report/log and full coverage inventory.
Warnings and **limited** summaries expose diagnostic and excluded scope even
when findings are zero. Missing/invalid evidence or a failed scanner process
fails the job; findings and engine diagnostics themselves remain report-only.
Do not confuse this with an enforced diagnostic regression gate, which is still
planned. Trivy also retains its engine/database version output; inspect its job
warnings for unsupported policies as well as the JSON finding count.

Use a fresh ignored output directory for local runs, with Semgrep 1.185.0
installed: `python scripts/security_audit.py --out .local/security-audit-review`.
The runner refuses to overwrite prior reports. It uses no production credentials
and snapshots the same public OWASP/security-audit packs through the reviewed
bounded HTTPS downloader. No blanket exclusions or global rule suppression are
part of stage 1. Frozen and generated artifacts keep their documented limits.
