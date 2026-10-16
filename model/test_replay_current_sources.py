"""Adversarial current-source tests; synthetic identities, no network required."""
import csv
import datetime as dt
import gzip
import importlib.util
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('replay_current_sources', pathlib.Path(__file__).with_name('replay_current_sources.py'))
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)
NOW = dt.datetime(2026, 10, 15, 16, tzinfo=dt.timezone.utc)


def roster(**changes):
    row = dict(season='2026', team='SEA', week='6', game_type='REG', gsis_id='00-0000001',
               full_name='Fixture Person', position='QB', status='ACT')
    return {**row, **changes}


def injury(**changes):
    row = roster(); row.pop('status'); row.update(report_status='Out', practice_status='Did Not Participate In Practice')
    return {**row, **changes}


def depth():
    return dict(dt='2026-10-15T12:00:00Z', team='SEA', player_name='Fixture Person', gsis_id='00-0000001',
                pos_grp_id='1', pos_grp='Offense', pos_id='1', pos_abb='QB', pos_slot='1', pos_rank='1')


def depth_changed(**changes):
    return {**depth(), **changes}


def csv_raw(rows):
    stream = io.StringIO(newline=''); writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
    writer.writeheader(); writer.writerows(rows)
    return stream.getvalue().encode()


def metadata(raw, source):
    asset = dict(id=123, size=len(raw), digest='sha256:' + r.sha256(raw),
                 browser_download_url=r.source_url(source), updated_at='2026-10-15T12:30:00Z')
    return r.canonical(dict(tag_name=source, assets=[asset]))


def signed(receipt, **changes):
    result = {**receipt, **changes}; result.pop('id', None)
    result['id'] = 'current:' + r.sha256(r.canonical(result))
    return result


class CurrentSourcesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = patch.object(r, 'DATA_DIR', pathlib.Path(self.tmp.name)); patcher.start(); self.addCleanup(patcher.stop)
        clock = patch.object(r, 'utc_now', return_value=NOW); clock.start(); self.addCleanup(clock.stop)

    def capture(self, source, rows):
        raw = gzip.compress(csv_raw(rows))
        return r.capture_snapshot(source, raw, metadata(raw, source))

    def test_audit_preserves_unknown_and_conflicting_statuses_without_inference(self):
        snapshots = {'weekly_rosters': self.capture('weekly_rosters', [roster(), roster(gsis_id='00-0000002', status='')]),
                     'injuries': self.capture('injuries', [injury(), injury(gsis_id='00-0000002', report_status='', practice_status='')])}
        audit = r.audit_current_sources(snapshots, NOW)
        self.assertFalse(audit['report']['productionReady']); self.assertFalse(audit['report']['publishable'])
        self.assertEqual(audit['records']['weekly_rosters'][0]['status'], 'ACT')
        self.assertEqual(audit['records']['injuries'][0]['report_status'], 'Out')
        self.assertIsNone(audit['records']['weekly_rosters'][1]['status'])
        self.assertIsNone(audit['records']['injuries'][1]['report_status'])
        self.assertIsNone(audit['records']['injuries'][1]['practice_status'])
        self.assertFalse(any('availability' in row for rows in audit['records'].values() for row in rows))
        self.assertEqual(audit['report']['sourceStatus']['depth_charts'], 'unavailable')
        self.assertEqual(len(audit['report']['provenance']), 2)
        self.assertEqual(audit['report']['coverage']['injuries']['missingValues']['report_status'], 1)
        self.assertEqual(audit['report']['coverage']['injuries']['rowsByTeamWeek'], {'SEA': {'6': 2}})
        self.assertFalse(audit['report']['coverage']['injuries']['expectedTeamWeekCoverageReconciled'])

    def test_whitelist_excludes_narrative_images_and_new_fields_are_drift(self):
        raw = csv_raw([injury(report_primary_injury='Do not export narrative', headshot_url='https://invalid/', model_score='9')])
        rows, coverage = r.normalize(raw, 'injuries', NOW)
        self.assertEqual(set(rows[0]), set(r.SOURCES['injuries']['fields']))
        self.assertTrue(coverage['schemaDrift']); self.assertFalse(coverage['complete'])
        self.assertEqual(coverage['unexpectedSourceFields'], ['headshot_url', 'model_score'])
        self.assertNotIn('report_primary_injury', rows[0])

    def test_record_hash_matches_exact_unicode_export_and_receipt_chain(self):
        snapshot = self.capture('weekly_rosters', [roster(full_name='Fixture É')])
        audit = r.audit_current_sources({'weekly_rosters': snapshot}, NOW)
        receipt = audit['report']['provenance'][0]
        expected = json.dumps(audit['records']['weekly_rosters'], sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()
        self.assertEqual(receipt['recordsSha256'], r.sha256(expected))
        self.assertEqual(receipt['firstObservedAt'], NOW.isoformat())
        for field in ('publishedAt', 'revisionAt', 'coverageAsOf'):
            self.assertIsNone(receipt[field])
        raw, original, meta = snapshot
        r.verify_snapshot(raw, original, meta, 'weekly_rosters', NOW)
        for bad in (None, b'{}'):
            with self.assertRaises(ValueError):
                r.verify_snapshot(raw, original, bad, 'weekly_rosters', NOW)
        forged = signed(original, metadataSha256='0' * 64)
        with self.assertRaisesRegex(ValueError, 'metadata hash'):
            r.verify_snapshot(raw, forged, meta, 'weekly_rosters', NOW)

    def test_observation_cannot_be_backdated_to_provider_or_cached_file_time(self):
        raw, receipt, meta = self.capture('weekly_rosters', [roster()])
        with self.assertRaisesRegex(ValueError, 'after the requested cutoff'):
            r.verify_snapshot(raw, receipt, meta, 'weekly_rosters', NOW - dt.timedelta(seconds=1))
        for changes in ({'firstObservedAt': '2026-10-15T12:30:00Z'}, {'publishedAt': '2026-10-15T12:30:00Z'},
                        {'revisionAt': '2026-10-15T12:30:00Z'}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                r.verify_snapshot(raw, signed(receipt, **changes), meta, 'weekly_rosters', NOW)
        later = NOW + dt.timedelta(hours=1)
        with patch.object(r, 'utc_now', return_value=later):
            cached = r.capture_cached('weekly_rosters')
        self.assertEqual(cached[1]['firstObservedAt'], later.isoformat())
        self.assertNotEqual(cached[1]['firstObservedAt'], cached[1]['assetUpdatedAt'])

    def test_newer_receipt_does_not_break_historical_cutoff_and_corruption_fails(self):
        old = self.capture('weekly_rosters', [roster()])
        later = NOW + dt.timedelta(hours=1)
        with patch.object(r, 'utc_now', return_value=later):
            newer = self.capture('weekly_rosters', [roster(status='RES')])
        self.assertEqual(r.load_snapshot('weekly_rosters', NOW)[1]['id'], old[1]['id'])
        self.assertEqual(r.load_snapshot('weekly_rosters', later)[1]['id'], newer[1]['id'])
        r.path_for(newer[1]['sha256'] + '-' + r.SOURCES['weekly_rosters']['filename']).write_bytes(b'changed')
        self.assertEqual(r.load_snapshot('weekly_rosters', NOW)[0], old[0])
        with self.assertRaisesRegex(ValueError, 'hash/size'):
            r.load_snapshot('weekly_rosters', later)
        with self.assertRaises(r.NoEligibleSnapshotError):
            r.load_snapshot('weekly_rosters', NOW - dt.timedelta(seconds=1))

    def test_missing_selected_evidence_is_not_reported_as_no_snapshot(self):
        _, receipt, _ = self.capture('weekly_rosters', [roster()])
        r.path_for(receipt['sha256'] + '-' + r.SOURCES['weekly_rosters']['filename']).unlink()
        with self.assertRaises(FileNotFoundError) as raised:
            r.load_snapshot('weekly_rosters', NOW)
        self.assertNotIsInstance(raised.exception, r.NoEligibleSnapshotError)

    def test_depth_is_latest_per_team_with_distinct_roles_and_typed_fields(self):
        rows = [depth_changed(dt='2026-10-14T12:00:00Z'), depth(),
                depth_changed(pos_grp_id='2', pos_grp='Special Teams', pos_id='2', pos_abb='H'),
                depth_changed(team='DEN', dt='2026-10-14T13:00:00-06:00'),
                depth_changed(team='LA', dt='2026-10-14T12:00:00Z')]
        normalized, coverage = r.normalize(csv_raw(rows), 'depth_charts', NOW)
        self.assertEqual(len(normalized), 4)
        self.assertEqual(coverage['omissions']['older_depth_snapshot'], 1)
        self.assertEqual(coverage['latestProviderTimestampByTeam']['DEN'], '2026-10-14T19:00:00+00:00')
        self.assertTrue(all(type(row['pos_rank']) is int and type(row['pos_slot']) is int for row in normalized))
        self.assertEqual({row['team'] for row in normalized}, {'SEA', 'DEN', 'LAR'})
        self.assertTrue(all('week' not in row for row in normalized))
        # File order cannot choose a different latest chart.
        reverse, reversed_coverage = r.normalize(csv_raw(list(reversed(rows))), 'depth_charts', NOW)
        self.assertEqual(reverse, normalized)
        self.assertEqual(reversed_coverage, coverage)

    def test_broken_latest_depth_never_silently_falls_back_to_older_identity(self):
        raw_rows = [depth_changed(team='LA', dt='2026-10-14T12:00:00Z'),
                    depth_changed(team='LA', gsis_id='')]
        rows, coverage = r.normalize(csv_raw(raw_rows), 'depth_charts', NOW)
        self.assertEqual(rows, [])
        self.assertEqual(coverage['rejectedByTeam'], {'LAR': 1})
        self.assertEqual(coverage['omissions'], {'older_depth_snapshot': 1})
        reverse = r.normalize(csv_raw(list(reversed(raw_rows))), 'depth_charts', NOW)
        self.assertEqual(reverse, (rows, coverage))

    def test_future_depth_missing_ids_and_invalid_states_are_quarantined(self):
        raw = csv_raw([depth(), depth_changed(dt='2026-10-16T12:00:00Z'),
                       depth_changed(team='DEN', gsis_id=''), depth_changed(team='KC', pos_rank='NaN')])
        rows, coverage = r.normalize(raw, 'depth_charts', NOW)
        self.assertEqual(len(rows), 1); self.assertEqual(coverage['rejectedRows'], 3)
        self.assertEqual(coverage['missingValues']['gsis_id'], 1)
        self.assertFalse(coverage['complete'])

    def test_duplicate_identity_removes_both_conflicting_records(self):
        rows, coverage = r.normalize(csv_raw([roster(), roster(status='RES')]), 'weekly_rosters', NOW)
        self.assertEqual(rows, []); self.assertEqual(coverage['rejectedRows'], 2)
        rows, coverage = r.normalize(csv_raw([depth(), depth_changed(pos_rank='2')]), 'depth_charts', NOW)
        self.assertEqual(rows, []); self.assertEqual(coverage['rejections']['duplicate_identity'], 2)

    def test_structural_and_size_limits_reject_before_normalization(self):
        good = csv_raw([roster()])
        for raw in (b'<!doctype html>', b'', good.replace(b'gsis_id', b'unknown'),
                    good.replace(b'team,', b'team,team,'), good + b'1,2\n'):
            with self.subTest(raw=raw[:20]), self.assertRaises(ValueError):
                r.normalize(raw, 'weekly_rosters', NOW)
        with patch.object(r, 'MAX_CSV_BYTES', 100), self.assertRaises(ValueError):
            r.normalize(gzip.compress(good), 'weekly_rosters', NOW)
        with patch.object(r, 'MAX_ROWS', 1), self.assertRaises(ValueError):
            r.normalize(csv_raw([roster(), roster(gsis_id='00-0000002')]), 'weekly_rosters', NOW)

    def test_missing_status_is_not_zero_and_unknown_status_is_rejected(self):
        raw = csv_raw([roster(status='NA'), roster(gsis_id='00-0000002', status='unrecognised'),
                       roster(gsis_id='00-0000003', week='0'), roster(gsis_id='00-0000004', season='2027')])
        rows, coverage = r.normalize(raw, 'weekly_rosters', NOW)
        self.assertEqual(len(rows), 1); self.assertIsNone(rows[0]['status'])
        self.assertEqual(coverage['rejectedRows'], 3)
        with self.assertRaises(ValueError):
            r.normalize(raw, 'weekly_rosters', '2025-10-15T16:00:00Z')
        source_codes, _ = r.normalize(csv_raw([roster(status='TRD'), roster(gsis_id='00-0000002', status='TRT')]), 'weekly_rosters', NOW)
        self.assertEqual([row['status'] for row in source_codes], ['TRD', 'TRT'])

    def test_schema_hash_types_are_checked_before_content_paths(self):
        _, receipt, _ = self.capture('weekly_rosters', [roster()])
        for bad in (signed(receipt, metadataSha256=[]), signed(receipt, sha256='../secret'),
                    signed(receipt, assetId=True), signed(receipt, season=2026.0)):
            encoded = r.canonical(bad)
            path = pathlib.Path(self.tmp.name) / ('current-' + r.sha256(encoded) + '-receipt.json')
            path.write_bytes(encoded)
            with self.subTest(bad=bad), patch.object(r, 'path_for') as paths, self.assertRaises(ValueError):
                r.load_snapshot('weekly_rosters', NOW)
            paths.assert_not_called(); path.unlink()

    def test_receipt_file_tamper_and_source_path_escape_are_rejected(self):
        self.capture('weekly_rosters', [roster()])
        path = next(pathlib.Path(self.tmp.name).glob('current-*-receipt.json'))
        path.write_bytes(b'{}')
        with self.assertRaisesRegex(ValueError, 'filename/content hash'):
            r.load_snapshot('weekly_rosters', NOW)
        with self.assertRaises(ValueError):
            r.path_for('../outside')
        with self.assertRaises(ValueError):
            r.get_public('https://example.invalid/data', 100)
        with self.assertRaises(ValueError):
            r.source_url([])

    def test_fetch_and_cache_require_allowlisted_metadata_and_exact_bytes(self):
        raw = gzip.compress(csv_raw([injury()])); meta = metadata(raw, 'injuries')
        with patch.object(r, 'get_public', side_effect=[meta, raw]):
            snapshot = r.fetch_source('injuries')
        self.assertEqual(snapshot[0], raw)
        with patch.object(r, 'get_public', side_effect=[meta, raw + b'changed']), self.assertRaises(ValueError):
            r.fetch_source('injuries')
        for bad in (None, b'[]', r.canonical({'tag_name': 'injuries', 'assets': [None]})):
            with self.assertRaises(ValueError):
                r.release_asset(bad, 'injuries')
        r.write_once(r.path_for('immutable'), b'a')
        with self.assertRaises(ValueError):
            r.write_once(r.path_for('immutable'), b'b')


if __name__ == '__main__':
    unittest.main()
