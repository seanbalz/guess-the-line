"""Source integrity tests use generated fixture facts, never network/player data."""
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

SPEC = importlib.util.spec_from_file_location('replay_sources', pathlib.Path(__file__).with_name('replay_sources.py'))
r = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)
NOW = dt.datetime(2026, 10, 15, 16, tzinfo=dt.timezone.utc)


def play(**updates):
    row = dict.fromkeys(r.PBP_FIELDS, '')
    row.pop('date')
    row.update(game_date='2026-10-12', game_id='2026_05_SEA_DEN', play_id='1', season='2026',
               season_type='REG', week='5', home_team='DEN', away_team='SEA', posteam='SEA', defteam='DEN',
               qtr='1', quarter_seconds_remaining='830', game_seconds_remaining='3530', down='1',
               ydstogo='10', yardline_100='75', play_type='pass', yards_gained='8', complete_pass='1',
               interception='0', fumble_lost='0', touchdown='0', passer_player_id='00-0000001',
               receiver_player_id='00-0000002', home_score='14', away_score='21', sack='0',
               pass_attempt='1', rush_attempt='0', penalty='0', passing_yards='8', receiving_yards='8')
    row.update(updates)
    return row


def roster(**updates):
    row = dict(season='2026', team='SEA', gsis_id='00-0000001', full_name='Fixture Player', position='QB',
               status='ACT', week='6', game_type='REG')
    row.update(updates)
    return row


def csv_bytes(rows):
    output = io.StringIO(newline='')
    writer = csv.DictWriter(output, fieldnames=list(rows[0]))
    writer.writeheader(); writer.writerows(rows)
    return output.getvalue().encode()


def provenance(raw, source='pbp'):
    asset = dict(id=123, browser_download_url=r.source_url(source, 2026), size=len(raw),
                 digest='sha256:' + r.digest(raw), updated_at='2026-10-15T12:00:00Z')
    metadata = json.dumps(dict(tag_name=r.SOURCES[source]['tag'], assets=[asset])).encode()
    receipt = dict(version=r.VERSION, source=source, season=2026, url=asset['browser_download_url'],
                   sha256=r.digest(raw), bytes=len(raw), assetId=123, assetUpdatedAt=asset['updated_at'],
                   retrievedAt='2026-10-15T15:00:00Z', metadataSha256=r.digest(metadata))
    return receipt, metadata


class ReplaySourceTests(unittest.TestCase):
    def test_whitelist_and_missing_optional_values_are_preserved(self):
        raw = csv_bytes([play(vegas_wp='0.99', epa='12', desc='Protected narrative', spread_line='-7')])
        rows, report = r.normalize_pbp(gzip.compress(raw), 2026, NOW)
        self.assertEqual(set(rows[0]), set(r.PBP_FIELDS))
        self.assertIsNone(rows[0]['rushing_yards'])
        self.assertIsNone(rows[0]['rusher_player_id'])
        self.assertEqual(rows[0]['passing_yards'], 8)
        self.assertFalse(report['expectedScheduleReconciled'])
        self.assertEqual(report['observedGameCount'], 1)

    def test_future_same_day_missing_and_nonfinite_values_are_quarantined(self):
        examples = [play(game_date='2026-10-16'), play(play_id='2', game_date='2026-10-15'),
                    play(play_id='3', down=''), play(play_id='4', yards_gained='NaN'),
                    play(play_id='5', home_score=''), play(play_id='6', passer_player_id='')]
        rows, report = r.normalize_pbp(csv_bytes(examples), 2026, NOW)
        self.assertEqual(rows, [])
        self.assertEqual(report['rejectedRows'], 6)
        self.assertEqual(report['rejections']['future_or_same_day_game'], 2)

    def test_duplicate_play_unknown_types_and_team_mismatches_are_not_accepted(self):
        examples = [play(), play(), play(play_id='2', play_type='unknown'),
                    play(play_id='3', posteam='KC'), play(play_id='4', home_team='NYJ')]
        rows, report = r.normalize_pbp(csv_bytes(examples), 2026, NOW)
        self.assertEqual(len(rows), 1)
        self.assertEqual(report['rejectedRows'], 4)
        self.assertEqual(report['rejections']['duplicate_play'], 1)

    def test_administrative_rows_are_explicit_omissions(self):
        rows, report = r.normalize_pbp(csv_bytes([play(play_type='', down='')]), 2026, NOW)
        self.assertEqual(rows, [])
        self.assertEqual(report['rejectedRows'], 0)
        self.assertEqual(report['omissions'], {'administrative_no_play_type': 1})

    def test_source_headers_and_csv_limits_fail_closed(self):
        good = csv_bytes([play()])
        for bad in (b'<!doctype html>', b'', good.replace(b'game_date', b'missing'),
                    good + b'1,2\n', good.replace(b'game_id,', b'game_id,game_id,')):
            with self.subTest(bad=bad[:40]), self.assertRaises(ValueError):
                r.csv_rows(bad, 'pbp')
        with self.assertRaises(ValueError):
            r.csv_rows(good, 'untrusted')
        with patch.object(r, 'MAX_CSV_BYTES', 100), self.assertRaises(ValueError):
            r.csv_rows(gzip.compress(good), 'pbp')
        with patch.object(r, 'MAX_ROWS', 1), self.assertRaises(ValueError):
            r.csv_rows(csv_bytes([play(), play(play_id='2')]), 'pbp')

    def test_rosters_do_not_claim_active_game_availability_or_export_assets(self):
        raw = csv_bytes([roster(headshot_url='https://example.invalid/image.png'),
                         roster(gsis_id='', headshot_url='')])
        rows, report = r.normalize_rosters(raw, 2026, NOW)
        self.assertEqual(set(rows[0]), set(r.ROSTER_FIELDS))
        self.assertFalse(report['currentGameRosterVerified'])
        self.assertEqual(report['rejectedRows'], 1)
        self.assertEqual(report['rowsByLatestObservedWeek'], {'6': 1})

    def test_snapshot_hash_identity_metadata_and_time_are_verified(self):
        raw = csv_bytes([play()]); receipt, metadata = provenance(raw)
        r.verify_snapshot(raw, receipt, 'pbp', 2026, NOW, metadata)
        cases = [dict(url='https://example.invalid/plays'), dict(bytes=1), dict(sha256='0'*64),
                 dict(version='unknown'), dict(assetId=456), dict(metadataSha256='a'*64),
                 dict(retrievedAt='2026-10-16T00:00:00Z'), dict(assetUpdatedAt='2026-10-15T15:01:00Z')]
        for mutation in cases:
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                r.verify_snapshot(raw, {**receipt, **mutation}, 'pbp', 2026, NOW, metadata)

    def test_source_and_date_boundaries_reject_unsupported_values(self):
        for source, season in [('other', 2026), ('pbp', 2027), ('pbp', 1999)]:
            with self.assertRaises(ValueError):
                r.source_url(source, season)
        with self.assertRaises(ValueError):
            r.normalize_pbp(csv_bytes([play()]), 2026, '2025-12-01T00:00:00Z')
        with self.assertRaises(ValueError):
            r.timestamp('2026-10-15')
        with self.assertRaises(ValueError):
            r.get_public('https://example.invalid/private', 100)

    def test_audit_retains_unmatched_ids_and_cannot_claim_publishability(self):
        pbp, roster_raw = csv_bytes([play()]), csv_bytes([roster()])
        pbp_receipt, pbp_metadata = provenance(pbp)
        roster_receipt, roster_metadata = provenance(roster_raw, 'rosters')
        result = r.audit_sources(pbp, roster_raw, pbp_receipt, roster_receipt, 2026, NOW,
                                 pbp_metadata=pbp_metadata, roster_metadata=roster_metadata)
        self.assertEqual(result['report']['unmatchedPlayerIds'], ['00-0000002'])
        self.assertFalse(result['report']['publishable'])
        self.assertEqual(result['report']['status'], 'blocked')
        with self.assertRaises(PermissionError):
            r.ingest_for_model(result, approve=True)

    def test_reusable_audit_requires_exact_metadata_not_a_plausible_hash(self):
        pbp, roster_raw = csv_bytes([play()]), csv_bytes([roster()])
        pbp_receipt, pbp_metadata = provenance(pbp)
        roster_receipt, roster_metadata = provenance(roster_raw, 'rosters')
        with self.assertRaises(TypeError):
            r.audit_sources(pbp, roster_raw, pbp_receipt, roster_receipt, 2026, NOW)
        with self.assertRaisesRegex(ValueError, 'Exact release metadata'):
            r.audit_sources(pbp, roster_raw, pbp_receipt, roster_receipt, 2026, NOW,
                            pbp_metadata=None, roster_metadata=roster_metadata)
        for altered_source in ('pbp', 'rosters'):
            receipts = {'pbp': pbp_receipt, 'rosters': roster_receipt}
            receipts[altered_source] = {**receipts[altered_source], 'metadataSha256': '0' * 64}
            with self.subTest(source=altered_source), self.assertRaisesRegex(ValueError, 'metadata hash'):
                r.audit_sources(pbp, roster_raw, receipts['pbp'], receipts['rosters'], 2026, NOW,
                                pbp_metadata=pbp_metadata, roster_metadata=roster_metadata)

    def test_fetch_pins_bytes_and_metadata_and_keeps_evidence_local(self):
        raw = gzip.compress(csv_bytes([play()])); receipt, metadata = provenance(raw)
        with tempfile.TemporaryDirectory() as directory, patch.object(r, 'DATA_DIR', pathlib.Path(directory)):
            with patch.object(r, 'get_public', side_effect=[metadata, raw]):
                saved, path = r.fetch_source('pbp', 2026, NOW)
            self.assertEqual(path.read_bytes(), raw)
            self.assertEqual(saved['sha256'], r.digest(raw))
            self.assertEqual(r.load_snapshot('pbp', 2026, NOW)[0], raw)
            with self.assertRaises(ValueError):
                r.local_path('../outside')
            with self.assertRaises(ValueError):
                r.immutable_write(path, b'changed')
            with patch.object(r, 'get_public', side_effect=[metadata, raw + b'changed']), self.assertRaises(ValueError):
                r.fetch_source('pbp', 2026, NOW)

    def test_metadata_tampering_fails_when_reloading_saved_evidence(self):
        raw = gzip.compress(csv_bytes([play()])); _, metadata = provenance(raw)
        with tempfile.TemporaryDirectory() as directory, patch.object(r, 'DATA_DIR', pathlib.Path(directory)):
            with patch.object(r, 'get_public', side_effect=[metadata, raw]):
                saved, _ = r.fetch_source('pbp', 2026, NOW)
            r.local_path(saved['metadataSha256'] + '-metadata.json').write_bytes(b'{}')
            with self.assertRaisesRegex(ValueError, 'metadata hash'):
                r.load_snapshot('pbp', 2026, NOW)

    def test_later_fetch_does_not_break_historical_cutoff_or_hide_corruption(self):
        old_raw = gzip.compress(csv_bytes([play()]))
        new_raw = gzip.compress(csv_bytes([play(), play(play_id='2')]))
        older, later = NOW - dt.timedelta(hours=1), NOW + dt.timedelta(hours=1)
        with tempfile.TemporaryDirectory() as directory, patch.object(r, 'DATA_DIR', pathlib.Path(directory)):
            with patch.object(r, 'get_public', side_effect=[provenance(old_raw)[1], old_raw]):
                old_receipt, _ = r.fetch_source('pbp', 2026, older)
            with patch.object(r, 'get_public', side_effect=[provenance(new_raw)[1], new_raw]):
                new_receipt, new_path = r.fetch_source('pbp', 2026, later)
            self.assertEqual(r.load_snapshot('pbp', 2026, NOW)[0:2], (old_raw, old_receipt))
            self.assertEqual(r.load_snapshot('pbp', 2026, later)[0:2], (new_raw, new_receipt))
            with self.assertRaisesRegex(ValueError, 'No eligible'):
                r.load_snapshot('pbp', 2026, older - dt.timedelta(seconds=1))
            new_path.write_bytes(b'corrupted')
            # A future snapshot is irrelevant to the historical read, but current corruption is never hidden.
            self.assertEqual(r.load_snapshot('pbp', 2026, NOW)[0], old_raw)
            with self.assertRaisesRegex(ValueError, 'hash/size'):
                r.load_snapshot('pbp', 2026, later)

    def test_receipt_schema_is_rejected_before_constructing_content_paths(self):
        raw = csv_bytes([play()]); receipt, _ = provenance(raw)
        invalid = [[], {**receipt, 'sha256': '../outside'}, {**receipt, 'sha256': []},
                   {**receipt, 'metadataSha256': []}, {**receipt, 'bytes': '123'},
                   {**receipt, 'assetId': True}, {**receipt, 'season': 2026.0},
                   {**receipt, 'retrievedAt': None}, {**receipt, 'source': []}]
        for bad in invalid:
            with self.subTest(receipt=bad), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                (root / 'invalid-receipt.json').write_text(json.dumps(bad))
                with patch.object(r, 'DATA_DIR', root), patch.object(r, 'local_path') as make_path:
                    with self.assertRaises(ValueError):
                        r.load_snapshot('pbp', 2026, NOW)
                    make_path.assert_not_called()

    def test_invalid_metadata_shape_is_reported_as_validation_error(self):
        raw = csv_bytes([play()]); receipt, _ = provenance(raw)
        for value in ([], {'assets': None}, {'assets': [None]}):
            metadata = json.dumps(value).encode()
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'metadata schema'):
                r.verify_snapshot(raw, {**receipt, 'metadataSha256': r.digest(metadata)}, 'pbp', 2026, NOW, metadata)


if __name__ == '__main__':
    unittest.main()
