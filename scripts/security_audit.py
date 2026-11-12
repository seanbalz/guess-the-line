"""Run the report-only audit with reproducible rules and explicit coverage limits."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import html
import importlib.util
import json
import os
from pathlib import Path
import platform
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SEMGREP_VERSION = '1.185.0'
PACKS = ('owasp-top-ten', 'security-audit')
URLS = {f'https://semgrep.dev/c/p/{pack}' for pack in PACKS}
LIMITS = {'timeout_seconds': 5, 'timeout_threshold': 3, 'max_target_bytes': 1_000_000, 'jobs': 2}


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def rule_record(pack, raw, document=None):
    document = json.loads(raw) if document is None else document
    rules = document.get('rules') if isinstance(document, dict) else None
    if not isinstance(rules, list) or not rules or any(not isinstance(r, dict) or not r.get('id') for r in rules):
        raise ValueError('Rule pack must contain a nonempty list of identified rules')
    return {'pack': pack, 'sha256': sha256(raw), 'bytes': len(raw), 'rules': [
        {'id': r['id'], 'version_id': r.get('metadata', {}).get('semgrep.dev', {}).get('rule', {}).get('version_id')}
        for r in rules]}


def summarize(report, tracked):
    if not isinstance(report, dict) or not report.get('version'):
        raise ValueError('Missing Semgrep version')
    for key in ('results', 'errors'):
        if not isinstance(report.get(key), list):
            raise ValueError(f'Missing Semgrep {key}')
    paths = report.get('paths', {})
    if not isinstance(paths, dict) or not isinstance(paths.get('scanned'), list) or not paths['scanned']:
        raise ValueError('No scanned file inventory')
    normalize = lambda path: str(path).replace('\\', '/').removeprefix('./')
    scanned = sorted({normalize(p) for p in paths['scanned']})
    skipped = paths.get('skipped', [])
    if not isinstance(skipped, list) or any(not isinstance(item, dict) for item in skipped):
        raise ValueError('Invalid skipped file inventory')
    skipped = [{**item, 'path': normalize(item.get('path', ''))} for item in skipped]
    diagnostics = []
    for error in report['errors']:
        kind = error.get('type', 'Unknown')
        kind = kind[0] if isinstance(kind, list) and kind else str(kind)
        diagnostics.append({'type': kind, 'path': normalize(error.get('path', '')),
                            'rule': error.get('rule_id'), 'code': error.get('code'),
                            'message_sha256': sha256(error.get('message', '').encode('utf-8'))})
    not_scanned = sorted(set(map(normalize, tracked)) - set(scanned))
    skipped_rules = report.get('skipped_rules', [])
    limited = bool(diagnostics or skipped or not_scanned or skipped_rules or 'skipped' not in paths)
    return {'engine_version': report['version'], 'engine': report.get('engine_requested'),
            'coverage_status': 'limited' if limited else 'reported',
            'findings': len(report['results']),
            'finding_severities': dict(Counter(r.get('extra', {}).get('severity', 'UNKNOWN') for r in report['results'])),
            'diagnostic_counts': dict(Counter(d['type'] for d in diagnostics)), 'diagnostics': diagnostics,
            'scanned_paths': scanned, 'skip_inventory_available': 'skipped' in paths,
            'skip_counts': dict(Counter(s.get('reason', 'unknown') for s in skipped)),
            'skipped_paths': skipped, 'skipped_rules': skipped_rules,
            'tracked_not_scanned': not_scanned}


def write_summary(out, tracked, scanner_exit):
    manifest = json.loads((out / 'manifest.json').read_text(encoding='utf-8'))
    evidence = {'source': manifest, 'scanner_exit_code': scanner_exit, 'scan_status': 'failed'}
    try:
        raw = (out / 'semgrep-report.json').read_bytes()
        evidence.update(summarize(json.loads(raw), tracked))
        evidence['report_sha256'] = sha256(raw)
        if evidence['engine_version'] != manifest.get('semgrep_version', evidence['engine_version']):
            raise ValueError('Report engine version differs from the requested engine')
        if scanner_exit == 0:
            evidence['scan_status'] = 'completed'
    except (OSError, ValueError, TypeError, AttributeError) as error:
        evidence['evidence_error'] = type(error).__name__
    save(out / 'coverage.json', evidence)
    safe = lambda value: html.escape(str(value)).replace('|', '&#124;').replace('\n', ' ')
    lines = ['## Security audit evidence', '',
             f"Source: `{safe(manifest.get('source_sha', 'unknown'))}`; dirty: {manifest.get('dirty', 'unknown')}.",
             f"Scan status: **{evidence['scan_status']}**. Coverage: **{evidence.get('coverage_status', 'unavailable')}**.",
             'Zero findings is not proof of complete coverage. Findings and engine diagnostics remain report-only.', '',
             f"Engine: {safe(evidence.get('engine_version', manifest.get('semgrep_version', 'unknown')))}.",
             f"Findings: {evidence.get('findings', 'unavailable')}; diagnostics: {len(evidence.get('diagnostics', []))}; "
             f"scanned paths: {len(evidence.get('scanned_paths', []))}; "
             f"tracked paths absent from scanned list: {len(evidence.get('tracked_not_scanned', []))}.",
             'Skipped-path reasons: ' + safe(evidence.get('skip_counts', 'unavailable')), '',
             'Raw reports, resolved rules, versions, hashes, budgets and full path inventories are in the artifact.',
             'Skipped-path entries can overlap scanned files when only part of a file failed; counts are not additive.', '',
             '| Rule pack | Rules in pack | SHA-256 |', '| --- | ---: | --- |']
    for pack in manifest.get('rules', []):
        lines.append(f"| {safe(pack['pack'])} | {len(pack['rules'])} | {safe(pack['sha256'])} |")
    lines.extend(['', '| Diagnostic | Path | Rule |', '| --- | --- | --- |'])
    for item in evidence.get('diagnostics', []):
        lines.append(f"| {safe(item['type'])} | {safe(item['path'])} | {safe(item['rule'] or 'not reported')} |")
    (out / 'summary.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return evidence


def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT).decode('utf-8').strip()


def run(out):
    # Import by location so both direct CLI and import-based unit tests use the reviewed downloader.
    spec = importlib.util.spec_from_file_location('gtl_public_download', ROOT / 'scripts/public_download.py')
    download = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(download)
    out.mkdir(parents=True, exist_ok=True)
    if (out / 'manifest.json').exists() or (out / 'semgrep-report.json').exists():
        raise ValueError('Use a fresh output directory; prior evidence is never overwritten')
    source = git('rev-parse', 'HEAD')
    manifest = {'source_sha': source, 'dirty': bool(git('status', '--porcelain')),
                'started_at': datetime.now(timezone.utc).isoformat(), 'python': platform.python_version(),
                'semgrep_version': SEMGREP_VERSION, 'limits': LIMITS, 'rules': []}
    save(out / 'manifest.json', manifest)
    tracked = git('ls-files', '-z').split('\0')
    tracked = [p for p in tracked if p]
    scanner_exit = 2
    phase = 'source and engine verification'
    try:
        expected = os.environ.get('GTL_AUDIT_EXPECTED_SHA')
        if expected and (expected != source or manifest['dirty']):
            raise ValueError('Expected a clean checkout of the exact requested source SHA')
        version = subprocess.check_output(['semgrep', '--version'], text=True).strip()
        if version != SEMGREP_VERSION:
            raise ValueError('Unexpected Semgrep version')
        command = ['semgrep', 'scan', '--metrics=off', '--disable-version-check', '--no-rewrite-rule-ids', '--verbose',
                   '--json', '--output', str(out / 'semgrep-report.json'),
                   '--timeout', str(LIMITS['timeout_seconds']), '--timeout-threshold', str(LIMITS['timeout_threshold']),
                   '--max-target-bytes', str(LIMITS['max_target_bytes']), '--jobs', str(LIMITS['jobs'])]
        for pack in PACKS:
            phase = f'fetch and validate {pack}'
            url = f'https://semgrep.dev/c/p/{pack}'
            raw = download.fetch_public_bytes(url, allowed_urls=URLS, maximum=10_000_000,
                                             user_agent='GuessTheLine-security-audit/1')
            # The registry can return YAML or JSON. Semgrep supplies this safe YAML parser.
            from ruamel.yaml import YAML
            from ruamel.yaml.error import YAMLError
            try:
                document = YAML(typ='safe').load(raw)
            except YAMLError as error:
                raise ValueError('Invalid rule pack YAML') from error
            manifest['rules'].append({'url': url, **rule_record(pack, raw, document)})
            rule_file = out / f'{pack}.yaml'
            rule_file.write_bytes(raw)
            command.extend(['--config', str(rule_file)])
            save(out / 'manifest.json', manifest)
        command.append('.')
        manifest['command'] = command
        save(out / 'manifest.json', manifest)
        phase = 'scan'
        with (out / 'semgrep.log').open('w', encoding='utf-8') as log:
            scanner_exit = subprocess.run(command, cwd=ROOT, stdout=log, stderr=log, timeout=900).returncode
    except (OSError, ValueError, ImportError, subprocess.SubprocessError) as error:
        # Do not echo raw exceptions (URLs, response bodies or environment data) into public summaries.
        manifest['setup_or_execution_failed'] = True
        manifest['failure_phase'] = phase
        manifest['failure_type'] = type(error).__name__
        save(out / 'manifest.json', manifest)
    manifest['finished_at'] = datetime.now(timezone.utc).isoformat()
    save(out / 'manifest.json', manifest)
    evidence = write_summary(out, tracked, scanner_exit)
    summary = (out / 'summary.md').read_text(encoding='utf-8')
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a', encoding='utf-8') as handle:
            handle.write(summary)
    if evidence['scan_status'] != 'completed':
        print('::error::Security scan or evidence generation failed; see the retained artifact.')
        return 1
    if evidence['coverage_status'] == 'limited':
        print('::warning::Security coverage is limited; review diagnostics and excluded scope in the artifact.')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, default=ROOT / '.local/security-audit')
    args = parser.parse_args()
    raise SystemExit(run(args.out.resolve()))
