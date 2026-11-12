"""Security evidence must distinguish no findings from incomplete scanning."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'security_audit.py'
audit = None
if SCRIPT.exists():
    spec = importlib.util.spec_from_file_location('security_audit', SCRIPT)
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)


def report():
    return {'version': '1.185.0', 'results': [], 'errors': [],
            'paths': {'scanned': ['cloud/code.mjs'], 'skipped': []}, 'skipped_rules': []}


class CoverageTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(audit, 'The security evidence reporter has not been implemented')

    def test_zero_findings_with_diagnostics_is_limited_and_fingerprinted(self):
        data = report()
        data['errors'] = [
            {'type': ['PartialParsing', []], 'path': 'cloud\\code.mjs', 'message': 'unexpected token', 'code': 3},
            {'type': 'Timeout', 'path': 'design/bundle.js', 'rule_id': 'rule.a', 'message': 'timeout', 'code': 2}]
        result = audit.summarize(data, ['cloud/code.mjs', 'design/bundle.js'])
        self.assertEqual(result['coverage_status'], 'limited')
        self.assertEqual(result['findings'], 0)
        self.assertEqual(result['diagnostic_counts'], {'PartialParsing': 1, 'Timeout': 1})
        self.assertEqual(result['diagnostics'][0]['path'], 'cloud/code.mjs')
        self.assertEqual(result['diagnostics'][1]['rule'], 'rule.a')
        self.assertEqual(len(result['diagnostics'][0]['message_sha256']), 64)
        self.assertEqual(result['tracked_not_scanned'], ['design/bundle.js'])
        changed = copy.deepcopy(data)
        changed['errors'][1]['rule_id'] = 'rule.b'
        self.assertNotEqual(result['diagnostics'], audit.summarize(changed, [])['diagnostics'])

    def test_skipped_scope_and_skipped_rules_remain_visible(self):
        data = report()
        data['paths']['skipped'] = [{'path': 'design/big.js', 'reason': 'too_big'},
                                    {'path': 'tests/unit.py', 'reason': 'semgrepignore_patterns_match'}]
        data['skipped_rules'] = [{'rule_id': 'rule.unsupported', 'details': 'unsupported'}]
        result = audit.summarize(data, ['cloud/code.mjs', 'design/big.js', 'tests/unit.py'])
        self.assertEqual(result['skip_counts'], {'too_big': 1, 'semgrepignore_patterns_match': 1})
        self.assertEqual(result['skipped_paths'], data['paths']['skipped'])
        self.assertEqual(result['skipped_rules'], data['skipped_rules'])
        self.assertEqual(result['coverage_status'], 'limited')

    def test_missing_skip_inventory_is_not_claimed_complete(self):
        data = report()
        del data['paths']['skipped']
        result = audit.summarize(data, ['cloud/code.mjs'])
        self.assertFalse(result['skip_inventory_available'])
        self.assertEqual(result['coverage_status'], 'limited')

    def test_findings_have_separate_counts_and_no_clean_claim(self):
        data = report()
        data['results'] = [{'check_id': 'rule.x', 'extra': {'severity': 'WARNING', 'lines': 'do not echo source'}}]
        result = audit.summarize(data, ['cloud/code.mjs'])
        self.assertEqual(result['findings'], 1)
        self.assertEqual(result['finding_severities'], {'WARNING': 1})
        self.assertEqual(result['coverage_status'], 'reported')
        self.assertNotIn('do not echo source', json.dumps(result))

    def test_empty_or_malformed_scan_is_a_failure(self):
        for data in ({}, {**report(), 'version': ''}, {**report(), 'results': None},
                     {**report(), 'errors': None}, {**report(), 'paths': {'scanned': []}}):
            with self.subTest(data=data), self.assertRaises(ValueError):
                audit.summarize(data, [])

    def test_rule_snapshot_records_bytes_and_versions_and_rejects_empty_rules(self):
        raw = json.dumps({'rules': [{'id': 'rule.a', 'metadata': {'semgrep.dev': {'rule': {'version_id': 'v1'}}}}]}).encode()
        entry = audit.rule_record('pack', raw)
        self.assertEqual(entry['rules'], [{'id': 'rule.a', 'version_id': 'v1'}])
        self.assertEqual(len(entry['sha256']), 64)
        self.assertEqual(entry['bytes'], len(raw))
        for raw in (b'{}', b'{"rules":[]}', b'not json'):
            with self.assertRaises(ValueError):
                audit.rule_record('pack', raw)

    def test_yaml_rule_snapshot_keeps_original_bytes_after_safe_decode(self):
        raw = b'rules:\n- id: rule.a\n'
        entry = audit.rule_record('pack', raw, {'rules': [{'id': 'rule.a'}]})
        self.assertEqual(entry['sha256'], audit.sha256(raw))
        self.assertEqual(entry['rules'], [{'id': 'rule.a', 'version_id': None}])

    def test_wrong_engine_version_is_not_a_successful_scan(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary)
            (out / 'manifest.json').write_text(json.dumps({'source_sha': 'a' * 40, 'rules': [], 'semgrep_version': 'other'}))
            (out / 'semgrep-report.json').write_text(json.dumps(report()))
            self.assertEqual(audit.write_summary(out, [], 0)['scan_status'], 'failed')

    def test_complete_report_with_nonzero_scanner_exit_remains_failed(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary)
            (out / 'manifest.json').write_text(json.dumps({'source_sha': 'a' * 40, 'rules': []}))
            (out / 'semgrep-report.json').write_text(json.dumps(report()))
            self.assertEqual(audit.write_summary(out, [], 2)['scan_status'], 'failed')

    def test_failed_scanner_and_missing_report_still_produce_failure_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary)
            (out / 'manifest.json').write_text(json.dumps({'source_sha': 'a' * 40, 'rules': []}))
            result = audit.write_summary(out, [], 2)
            self.assertEqual(result['scan_status'], 'failed')
            self.assertEqual(result['scanner_exit_code'], 2)
            self.assertTrue((out / 'coverage.json').exists())
            self.assertIn('failed', (out / 'summary.md').read_text())

    def test_summary_discloses_limits_without_rendering_untrusted_markup(self):
        data = report()
        data['errors'] = [{'type': 'Timeout', 'path': '<script>|bad.js', 'message': 'SECRET', 'rule_id': 'r'}]
        with tempfile.TemporaryDirectory() as temporary:
            out = Path(temporary)
            (out / 'manifest.json').write_text(json.dumps({'source_sha': 'a' * 40, 'rules': []}))
            (out / 'semgrep-report.json').write_text(json.dumps(data))
            result = audit.write_summary(out, ['cloud/code.mjs'], 0)
            summary = (out / 'summary.md').read_text()
            self.assertEqual(result['scan_status'], 'completed')
            self.assertIn('limited', summary)
            self.assertNotIn('<script>', summary)
            self.assertNotIn('SECRET', summary)
            self.assertIn('not proof of complete coverage', summary)


if __name__ == '__main__':
    unittest.main()
