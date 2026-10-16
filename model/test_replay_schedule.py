import csv
import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

import replay_schedule as schedule

AS_OF = '2026-10-15T16:00:00Z'


def game(**changes):
    row = dict(zip(schedule.FIELDS, ('2026_06_SEA_DEN', '2026', 'REG', '6', '2026-10-15',
                                    '20:15', 'DEN', 'SEA', '', '')))
    return {**row, **changes}


def csv_bytes(rows):
    out = io.StringIO()
    fields = [*schedule.FIELDS, 'spread_line', 'description']
    writer = csv.DictWriter(out, fieldnames=fields)
    writer.writeheader()
    for row in rows:
        writer.writerow({**row, 'spread_line': '-3.5', 'description': 'Excluded source narrative'})
    return out.getvalue().encode()


def evidence(raw, retrieved='2026-10-15T15:00:00Z', updated='2026-10-15T14:00:00Z', asset_id=123):
    metadata = schedule.canonical_bytes({'tag_name': 'schedules', 'assets': [{
        'browser_download_url': schedule.URL, 'id': asset_id, 'size': len(raw),
        'digest': 'sha256:' + schedule.digest(raw), 'updated_at': updated,
    }]})
    receipt = {'version': schedule.VERSION, 'url': schedule.URL, 'assetId': asset_id,
               'assetUpdatedAt': updated, 'bytes': len(raw), 'sha256': schedule.digest(raw),
               'metadataSha256': schedule.digest(metadata), 'retrievedAt': retrieved}
    return receipt, metadata


def save(raw, receipt, metadata):
    schedule.immutable_write(schedule.stored(receipt['sha256'] + '-schedule-games.csv'), raw)
    schedule.immutable_write(schedule.stored(receipt['metadataSha256'] + '-schedule-metadata.json'), metadata)
    name = receipt['sha256'] + '-' + schedule.digest(schedule.canonical_bytes(receipt))[:12] + '-schedule-receipt.json'
    schedule.immutable_write(schedule.stored(name), schedule.canonical_bytes(receipt))


class ReplayScheduleTests(unittest.TestCase):
    def test_canonical_identity_utc_and_unknown_outcomes(self):
        rows = [game(), game(game_id='2026_06_ARI_LA', away_team='ARI', home_team='LA', gameday='2026-10-18', gametime='16:05')]
        games = schedule.normalize_schedule(csv_bytes(rows), AS_OF)
        self.assertEqual(games[0]['id'], '2026_06_ARI_LAR')
        self.assertEqual(games[0]['sourceGameId'], '2026_06_ARI_LA')
        self.assertEqual(games[0]['kickoff'], '2026-10-18T20:05:00Z')
        self.assertEqual(games[1]['kickoff'], '2026-10-16T00:15:00Z')
        self.assertEqual(games[1]['resultStatus'], 'unplayed')
        self.assertIsNone(games[1]['homeScore'])
        self.assertEqual(games, schedule.normalize_schedule(csv_bytes(list(reversed(rows))), AS_OF))
        self.assertNotIn('spread_line', json.dumps(games))
        self.assertNotIn('Excluded source narrative', json.dumps(games))

    def test_completed_and_missing_time_are_distinct(self):
        completed = game(game_id='2026_05_SEA_DEN', week='5', gameday='2026-10-12', home_score='17', away_score='17')
        result = schedule.normalize_schedule(csv_bytes([completed]), AS_OF)[0]
        self.assertEqual(result['resultStatus'], 'reported_final')
        self.assertEqual(result['homeScore'], 17)
        unknown = schedule.normalize_schedule(csv_bytes([game(gametime='TBD')]), AS_OF)[0]
        self.assertIsNone(unknown['kickoff'])
        self.assertEqual(unknown['kickoffStatus'], 'unknown')
        winter = game(game_id='2025_18_SEA_DEN', season='2025', week='18', gameday='2026-01-04', gametime='13:00')
        self.assertEqual(schedule.normalize_schedule(csv_bytes([winter]), AS_OF)[0]['kickoff'], '2026-01-04T18:00:00Z')

    def test_invalid_identity_partial_future_and_ambiguous_fields_fail(self):
        changes = [dict(home_score='7'), dict(home_score='7', away_score='0'),
                   dict(game_id='2026_07_SEA_DEN'), dict(home_team='SEA'), dict(away_team='FAKE'),
                   dict(game_type='PRE'), dict(gameday='2027-10-15'), dict(gameday='20261015'),
                   dict(gametime='25:00'), dict(gametime='1:00'),
                   dict(season='2025', game_id='2025_20_SEA_DEN', week='20', gameday='2026-03-08', gametime='02:30'),
                   dict(gameday='2026-11-01', gametime='01:30')]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValueError):
                schedule.normalize_schedule(csv_bytes([game(**change)]), AS_OF)
        with self.assertRaises(ValueError):
            schedule.normalize_schedule(csv_bytes([game(), game()]), AS_OF)
        with self.assertRaises(ValueError):
            schedule.normalize_schedule(csv_bytes([game(game_id='2026_06_ARI_LA', home_team='LA', away_team='ARI'),
                                                    game(game_id='2026_06_ARI_LAR', home_team='LAR', away_team='ARI')]), AS_OF)

    def test_csv_limits_and_schema_drift_reject(self):
        for raw in (b'<html>error</html>', b'game_id,season\nx,2026\n',
                    csv_bytes([game()]).replace(b'game_id,season', b'game_id,game_id')):
            with self.subTest(raw=raw[:30]), self.assertRaises(ValueError):
                schedule.normalize_schedule(raw, AS_OF)
        with patch.object(schedule, 'MAX_BYTES', 5), self.assertRaises(ValueError):
            schedule.normalize_schedule(csv_bytes([game()]), AS_OF)

    def test_integrity_requires_exact_metadata_and_receipt(self):
        raw = csv_bytes([game()])
        receipt, metadata = evidence(raw)
        schedule.verify_snapshot(raw, receipt, metadata, AS_OF)
        for key, value in [('sha256', []), ('metadataSha256', '../bad'), ('bytes', True), ('assetId', True),
                           ('retrievedAt', '2026-10-16T00:00:00Z'), ('assetUpdatedAt', '2026-10-15T15:01:00Z'),
                           ('url', 'https://example.com/games.csv')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                schedule.verify_snapshot(raw, {**receipt, key: value}, metadata, AS_OF)
        for altered in (metadata + b' ', None, b'{}'):
            with self.subTest(metadata=altered), self.assertRaises(ValueError):
                schedule.verify_snapshot(raw, receipt, altered, AS_OF)
        with self.assertRaises(ValueError):
            schedule.verify_snapshot(raw + b' ', receipt, metadata, AS_OF)
        release = json.loads(metadata)
        release['assets'].append(release['assets'][0])
        ambiguous = schedule.canonical_bytes(release)
        with self.assertRaises(ValueError):
            schedule.verify_snapshot(raw, {**receipt, 'metadataSha256': schedule.digest(ambiguous)}, ambiguous, AS_OF)

    def test_cutoff_selection_and_conservative_first_observation(self):
        raw = csv_bytes([game()])
        first, metadata = evidence(raw)
        later = {**first, 'retrievedAt': '2026-10-15T15:30:00Z'}
        future_raw = csv_bytes([game(gametime='20:30')])
        future, future_metadata = evidence(future_raw, '2026-10-15T17:00:00Z', '2026-10-15T16:30:00Z')
        with tempfile.TemporaryDirectory() as folder, patch.object(schedule, 'DATA_DIR', pathlib.Path(folder)):
            save(raw, first, metadata)
            save(raw, later, metadata)
            save(future_raw, future, future_metadata)
            actual = schedule.load_schedule(AS_OF)
            self.assertEqual(actual['sourceRef']['retrievedAt'], later['retrievedAt'])
            self.assertEqual(actual['sourceRef']['firstObservedAt'], '2026-10-15T15:00:00+00:00')
            self.assertIsNone(actual['sourceRef']['publishedAt'])
            self.assertEqual(actual['sourceRef']['gamesSha256'], schedule.digest(schedule.canonical_bytes(actual['games'])))
            self.assertFalse(actual['publicationReady'])
            self.assertEqual(actual, schedule.load_schedule(AS_OF))
            with self.assertRaises(ValueError):
                schedule.load_schedule('2026-10-15T14:59:59Z')
            newest = schedule.load_schedule('2026-10-15T17:00:00Z')
            self.assertEqual(newest['games'][0]['kickoff'], '2026-10-16T00:30:00Z')

    def test_corrupt_newest_snapshot_never_falls_back(self):
        raw = csv_bytes([game()])
        old, old_meta = evidence(raw)
        new_raw = csv_bytes([game(gametime='20:30')])
        new, new_meta = evidence(new_raw, '2026-10-15T15:30:00Z', '2026-10-15T15:20:00Z')
        with tempfile.TemporaryDirectory() as folder, patch.object(schedule, 'DATA_DIR', pathlib.Path(folder)):
            save(raw, old, old_meta)
            save(new_raw, new, new_meta)
            schedule.stored(new['sha256'] + '-schedule-games.csv').write_bytes(b'corrupt')
            with self.assertRaises(ValueError):
                schedule.load_schedule(AS_OF)

    def test_receipt_timestamp_edit_cannot_backdate_observation(self):
        raw = csv_bytes([game()]); receipt, metadata = evidence(raw)
        with tempfile.TemporaryDirectory() as folder, patch.object(schedule, 'DATA_DIR', pathlib.Path(folder)):
            save(raw, receipt, metadata)
            path = schedule.stored(schedule.receipt_name(receipt))
            receipt['retrievedAt'] = '2026-10-15T14:30:00Z'
            path.write_bytes(schedule.canonical_bytes(receipt))
            with self.assertRaisesRegex(ValueError, 'filename/content hash'):
                schedule.load_schedule(AS_OF)

    def test_identical_bytes_republished_retain_verified_first_observation(self):
        raw = csv_bytes([game()]); first, first_meta = evidence(raw)
        later, later_meta = evidence(raw, '2026-10-15T15:45:00Z', '2026-10-15T15:30:00Z', 124)
        with tempfile.TemporaryDirectory() as folder, patch.object(schedule, 'DATA_DIR', pathlib.Path(folder)):
            save(raw, first, first_meta); save(raw, later, later_meta)
            result = schedule.load_schedule(AS_OF)['sourceRef']
            self.assertEqual(result['firstObservedAt'], '2026-10-15T15:00:00+00:00')
            self.assertEqual(result['assetUpdatedAt'], later['assetUpdatedAt'])
            self.assertEqual(result['earliestObservationRef'], {
                'sha256': first['sha256'], 'receiptSha256': schedule.digest(schedule.canonical_bytes(first)),
                'metadataSha256': first['metadataSha256'], 'assetUpdatedAt': first['assetUpdatedAt'],
                'retrievedAt': first['retrievedAt'],
            })

    def test_receipt_path_validation_precedes_content_reads(self):
        raw = csv_bytes([game()])
        receipt, _ = evidence(raw)
        with tempfile.TemporaryDirectory() as folder, patch.object(schedule, 'DATA_DIR', pathlib.Path(folder)):
            path = pathlib.Path(folder) / 'bad-schedule-receipt.json'
            for bad in ([], {'escape': 'path'}, '../../outside'):
                path.write_text(json.dumps({**receipt, 'sha256': bad}))
                with self.assertRaises(ValueError):
                    schedule.load_schedule(AS_OF)


if __name__ == '__main__':
    unittest.main()
