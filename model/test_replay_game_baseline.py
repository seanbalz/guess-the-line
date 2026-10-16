"""Artificial schedule cohorts; no real outcomes, network or fitted choices."""
import copy
import datetime as dt
import hashlib
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import replay_game_baseline as b

AS_OF = '2026-10-15T17:00:00Z'


def game(season=2022, week=1, *, day=None, home=0, away=0, **changes):
    day = day or f'{season}-09-01'
    row = {'season': season, 'week': week, 'gameType': 'REG', 'homeTeamId': 'DEN', 'awayTeamId': 'SEA',
           'gameDate': day, 'kickoff': day + 'T20:00:00Z', 'kickoffStatus': 'known',
           'homeScore': home, 'awayScore': away, 'resultStatus': 'reported_final'}
    row.update(changes)
    row['id'] = f"{season}_{week:02d}_{row['awayTeamId']}_{row['homeTeamId']}"
    row['sourceGameId'] = row['id']
    return row


def envelope(games=None):
    rows = copy.deepcopy(games if games is not None else [game(), game(2023, home=10, away=10), game(2024, home=5, away=5)])
    return {'games': rows, 'sourceRef': {'url': b.schedule_source.URL, 'sha256': 'a' * 64,
        'metadataSha256': 'b' * 64, 'gamesSha256': b.digest(rows), 'assetUpdatedAt': '2026-10-15T14:00:00Z',
        'retrievedAt': '2026-10-15T15:00:00Z', 'firstObservedAt': '2026-10-15T15:00:00Z', 'publishedAt': None}}


def evaluate(games=None):
    return b.evaluate_schedule(envelope(games), as_of=AS_OF)


class BaselineTests(unittest.TestCase):
    def test_hand_computable_correlated_pairs_ties_and_intervals(self):
        result = evaluate()
        season = result['aggregate']['seasons'][0]
        self.assertEqual(season['evaluatedGames'], 1)
        self.assertEqual(season['trainingGames'], {'min': 2, 'max': 2, 'mean': 2})
        self.assertEqual(season['distributions']['homeScore']['meanCrps'], 2.5)
        self.assertEqual(season['distributions']['awayScore']['meanCrps'], 2.5)
        self.assertEqual(season['distributions']['margin']['meanCrps'], 0)
        self.assertEqual(season['distributions']['total']['meanCrps'], 5)
        self.assertEqual(season['distributions']['total']['intervals'][0],
            {'level': .5, 'availableGames': 1, 'coveredGames': 1, 'coverage': 1, 'meanWidth': 10})
        self.assertEqual(season['events']['tie']['meanProbability'], 1)
        self.assertEqual(season['events']['tie']['meanBrier'], 0)
        self.assertEqual(season['events']['homeWin']['meanProbability'], 0)
        self.assertEqual(season['events']['awayWin']['meanProbability'], 0)

    def test_whole_pairs_not_independent_marginals(self):
        first = evaluate()['aggregate']['seasons'][0]
        second = evaluate([game(away=10), game(2023, home=10), game(2024, home=5, away=5)])['aggregate']['seasons'][0]
        self.assertEqual(first['distributions']['homeScore'], second['distributions']['homeScore'])
        self.assertEqual(first['distributions']['awayScore'], second['distributions']['awayScore'])
        self.assertEqual(second['distributions']['total']['meanCrps'], 0)
        self.assertEqual(second['distributions']['margin']['meanCrps'], 5)
        self.assertEqual(second['events']['tie']['meanBrier'], 1)
        self.assertEqual(second['events']['homeWin']['meanBrier'], .25)
        self.assertEqual(second['events']['awayWin']['meanBrier'], .25)

    def test_strict_prior_date_target_same_day_and_future_are_never_training(self):
        rows = [game(), game(2024, day='2024-09-01', home=11),
                game(2024, day='2024-09-01', homeTeamId='BUF', awayTeamId='NYJ', home=99),
                game(2024, 2, day='2024-09-08', home=22),
                game(2025, home=33), game(2026, day='2026-10-15', home=44),
                game(2026, 2, day='2026-10-16', home=55)]
        result = evaluate(rows)
        details = result['details']
        self.assertEqual([item['trainingGames'] for item in details['games']], [1, 1, 3, 4])
        for item in details['games']:
            pool = details['empiricalDistributions'][item['trainingDistributionSha256']]
            self.assertTrue(all(p['gameId'] != item['gameId'] and p['gameDate'] < item['gameDate'] for p in pool))
            self.assertFalse(any(p['season'] == 2026 for p in pool))
        self.assertEqual(result['aggregate']['sourceExclusions']['same_day_or_future_at_observation'], 2)

    def test_missing_truth_is_reported_and_not_zero_filled_or_training(self):
        rows = [game(), game(2023, home=None), game(2024, home=None),
                game(2024, 2, day='2024-09-08', home=14, resultStatus='unplayed'),
                game(2024, 3, day='2024-09-15', home=7)]
        result = evaluate(rows)
        season = result['aggregate']['seasons'][0]
        self.assertEqual(season['cohortScheduleRows'], 3)
        self.assertEqual(season['evaluatedGames'], 1)
        self.assertEqual(season['excludedGames'], {'missing_reported_final_outcome': 2})
        self.assertEqual(season['trainingGames']['max'], 1)
        self.assertEqual(season['distributions']['homeScore']['meanCrps'], 7)
        self.assertEqual(result['aggregate']['sourceExclusions']['missing_reported_final_outcome'], 3)

    def test_no_history_leaves_target_unscored_and_empty_metrics_unknown(self):
        result = evaluate([game(2024, home=7)])
        season = result['aggregate']['seasons'][0]
        self.assertEqual(season['evaluatedGames'], 0)
        self.assertEqual(season['excludedGames'], {'insufficient_prior_games': 1})
        self.assertIsNone(season['distributions']['homeScore']['meanCrps'])
        self.assertIsNone(season['events']['homeWin']['meanBrier'])
        self.assertEqual(season['distributions']['total']['intervals'][0]['availableGames'], 0)
        self.assertIsNone(season['distributions']['total']['intervals'][0]['coverage'])

    def test_history_window_postseason_and_unknown_kickoff_exclusions(self):
        rows = [game(2021, home=80), game(2022, 19, home=70, gameType='WC'),
                game(2023, home=60, kickoff=None), game(), game(2024, home=7)]
        result = evaluate(rows)
        self.assertEqual(result['aggregate']['sourceExclusions'], {'before_history_window': 1,
            'outside_regular_season': 1, 'unknown_or_future_kickoff': 1})
        self.assertEqual(result['details']['games'][0]['trainingGames'], 1)

    def test_no_team_weights_tail_trimming_or_rng_and_duplicates_keep_frequency(self):
        rows = [game(home=0), game(2022, 2, day='2022-09-08', home=0, homeTeamId='BUF', awayTeamId='NYJ'),
                game(2023, home=101, away=3), game(2024, home=7)]
        result = evaluate(rows)
        item = result['details']['games'][0]
        pool = result['details']['empiricalDistributions'][item['trainingDistributionSha256']]
        self.assertEqual([(p['home'], p['away']) for p in pool], [(0, 0), (0, 0), (101, 3)])
        self.assertEqual(item['metrics']['events']['tie']['probability'], 2 / 3)
        self.assertEqual(item['metrics']['events']['homeWin']['probability'], 1 / 3)

    def test_order_independent_metrics_and_exact_repeat_without_input_mutation(self):
        source = envelope(); before = copy.deepcopy(source)
        result = b.evaluate_schedule(source, as_of=AS_OF)
        self.assertEqual(result, b.evaluate_schedule(source, as_of=AS_OF))
        self.assertEqual(source, before)
        shuffled = envelope(list(reversed(source['games'])))
        reverse = b.evaluate_schedule(shuffled, as_of=AS_OF)
        self.assertEqual(result['details']['games'], reverse['details']['games'])
        self.assertEqual(result['details']['empiricalDistributions'], reverse['details']['empiricalDistributions'])
        self.assertEqual(result['aggregate']['seasons'], reverse['aggregate']['seasons'])
        with self.assertRaises(TypeError):
            result['details']['games'][0]['trainingGames'] = 0

    def test_identity_and_score_errors_fail_before_evaluation(self):
        cases = [({'id': 'wrong'}, 'identity'), ({'homeScore': True}, 'integer'),
                 ({'homeScore': -1}, 'integer'), ({'awayScore': 7.5}, 'integer'),
                 ({'homeTeamId': 'LA'}, 'Canonical'), ({'gameType': 'PRE'}, 'competition'),
                 ({'resultStatus': 'guessed_final'}, 'status'), ({'gameDate': '2025-09-01'}, 'season')]
        for changes, message in cases:
            row = game(); row.update(changes)
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, message): evaluate([row])
        with self.assertRaisesRegex(ValueError, 'duplicate'): evaluate([game(), game()])

    def test_integrity_and_observation_errors_fail_closed(self):
        for changes in ({'sha256': '0'}, {'metadataSha256': []}, {'gamesSha256': '0' * 64},
                        {'url': 'https://example.test/unapproved'}, {'retrievedAt': '2026-10-16T00:00:00Z'},
                        {'assetUpdatedAt': '2026-10-15T16:00:00Z'}):
            fixture = envelope(); fixture['sourceRef'].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                b.evaluate_schedule(fixture, as_of=AS_OF)

    def test_config_code_and_artifact_binding_and_development_labels(self):
        result = evaluate(); aggregate = result['aggregate']
        self.assertEqual(b.digest(aggregate['config']), b.CONFIG_SHA256)
        for name, module in (('implementationSha256', b), ('evaluationModuleSha256', b.evaluation),
                             ('scheduleLoaderSha256', b.schedule_source)):
            self.assertEqual(aggregate[name], hashlib.sha256(pathlib.Path(module.__file__).read_bytes()).hexdigest())
        self.assertEqual(result['details']['aggregateSha256'], b.digest(aggregate))
        self.assertFalse(aggregate['publicationReady']); self.assertFalse(aggregate['generationAllowed'])
        self.assertIn('retrospective', aggregate['config']['revisionPolicy'])
        self.assertIn('not a historical as-known backtest', ' '.join(aggregate['limitations']))
        with patch.dict(b.CONFIG, {'minimumTrainingGames': 2}):
            with self.assertRaisesRegex(ValueError, 'configuration changed'): evaluate()

    def test_cached_runner_uses_verified_loader_and_rejects_future_observation(self):
        cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(seconds=1)
        fixture = envelope()
        fixture['sourceRef'].update(assetUpdatedAt='2026-01-01T00:00:00Z', retrievedAt='2026-01-02T00:00:00Z')
        with patch.object(b.schedule_source, 'load_schedule', return_value=fixture) as loader:
            result = b.evaluate_cached(cutoff)
            loader.assert_called_once_with(cutoff)
            self.assertEqual(result['aggregate']['sourceVerification'], 'exact_raw_release_metadata_and_receipt_verified_by_cached_loader')
            self.assertEqual(result['details']['aggregateSha256'], b.digest(result['aggregate']))
        with patch.object(b.schedule_source, 'load_schedule') as loader:
            with self.assertRaisesRegex(ValueError, 'future observation'):
                b.evaluate_cached(dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1))
            loader.assert_not_called()

    def test_immutable_local_exports_are_content_addressed_and_cross_pinned(self):
        result = evaluate()
        with tempfile.TemporaryDirectory() as tmp, patch.object(b, 'DATA_DIR', pathlib.Path(tmp)):
            paths = b.store_result(result)
            self.assertEqual(paths, b.store_result(result))
            for role, ref in paths.items():
                path = pathlib.Path(ref['path'])
                self.assertEqual(path.parent, pathlib.Path(tmp).resolve())
                self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), ref['sha256'])
                self.assertEqual(path.read_bytes(), b.canonical(result[role]))
            wrong = {**result, 'aggregate': {**result['aggregate'], 'publicationReady': True}}
            with self.assertRaisesRegex(ValueError, 'provenance'): b.store_result(wrong)


if __name__ == '__main__':
    unittest.main()
