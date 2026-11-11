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
