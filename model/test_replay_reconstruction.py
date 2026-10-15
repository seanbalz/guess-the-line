"""Generated factual fixtures only; no real player outcomes or network access."""
import copy
import datetime as dt
import pathlib
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import replay_reconstruction as r

NOW = dt.datetime(2026, 10, 15, 18, tzinfo=dt.timezone.utc)
QB, WR, RB, LATERAL = ('00-0000001', '00-0000002', '00-0000003', '00-0000004')
TEAMS = ('SEA', 'BUF')
FLAG_FIELDS = ('play_deleted', 'penalty', 'aborted_play', 'touchdown', 'pass_touchdown', 'rush_touchdown',
               'return_touchdown', 'safety', 'extra_point_attempt', 'two_point_attempt', 'field_goal_attempt',
               'defensive_two_point_conv', 'defensive_extra_point_conv', 'pass_attempt', 'rush_attempt', 'sack',
               'complete_pass', 'interception', 'fumble', 'fumble_lost', 'lateral_reception', 'lateral_rush',
               'lateral_recovery', 'lateral_return')


def play(**changes):
    row = dict.fromkeys(r.FIELDS, '')
    row.update(dict.fromkeys(FLAG_FIELDS, '0'))
    row.update(game_id='2026_01_BUF_SEA', play_id='1', order_sequence='1', game_date='2026-09-13',
               season='2026', season_type='REG', week='1', home_team='SEA', away_team='BUF',
               posteam='BUF', defteam='SEA', qtr='1', play_type='pass', play_type_nfl='PASS',
               pass_attempt='1', complete_pass='1', passer_player_id=QB, receiver_player_id=WR,
               passing_yards='8', receiving_yards='8', home_score='0', away_score='0')
    row.update(changes)
    return row


def nonpass(**changes):
    return play(pass_attempt='0', complete_pass='0', passer_player_id='', receiver_player_id='',
                passing_yards='', receiving_yards='', **changes)


def end(**changes):
    row = nonpass(play_id='99', order_sequence='99', qtr='4', play_type='', play_type_nfl='END_GAME')
    row.update(changes)
    return row


def schedule(home=0, away=0):
    return [dict(id='2026_01_BUF_SEA', season=2026, week=1, gameType='REG', gameDate='2026-09-13',
                 homeTeamId='SEA', awayTeamId='BUF', homeScore=home, awayScore=away, resultStatus='reported_final')]


def stats_by_player(delta):
    return {row['playerId']: row for row in delta['delta']}


class ReconstructionTests(unittest.TestCase):
    def test_score_uses_td_team_even_after_compound_completed_pass_fumble(self):
        row = play(touchdown='1', return_touchdown='1', td_team='SEA', td_player_id=LATERAL,
                   passing_yards='30', receiving_yards='30', fumble='1', fumble_lost='1')
        self.assertEqual(r.scoring_delta(row, TEAMS),
                         {'status': 'reconstructed', 'category': 'return_touchdown', 'points': 6, 'teamId': 'SEA'})
        stats = stats_by_player(r.stat_delta(row, TEAMS))
        self.assertEqual(stats[QB]['passingYards'], 30)
        self.assertEqual(stats[QB]['passingTD'], 0)
        self.assertEqual(stats[WR]['receptions'], 1)
        self.assertEqual(stats[WR]['receivingTD'], 0)
        self.assertNotIn(LATERAL, stats)

    def test_pick_six_and_special_teams_return_are_not_offensive_touchdowns(self):
        intercepted = play(complete_pass='0', passing_yards='', receiving_yards='', receiver_player_id='',
                           interception='1', touchdown='1', return_touchdown='1', td_team='SEA', td_player_id=LATERAL)
        stats = stats_by_player(r.stat_delta(intercepted, TEAMS))
        self.assertEqual(stats[QB]['passingYards'], 0)
        self.assertEqual(stats[QB]['passingTD'], 0)
        for kind in ('punt', 'kickoff', 'field_goal'):
            row = nonpass(play_type=kind, touchdown='1', return_touchdown='1', td_team='SEA', td_player_id=LATERAL,
                          field_goal_attempt='1' if kind == 'field_goal' else '0',
                          field_goal_result='blocked' if kind == 'field_goal' else '')
            self.assertEqual(r.scoring_delta(row, TEAMS)['points'], 6)
            self.assertEqual(r.stat_delta(row, TEAMS)['delta'], [])

    def test_field_goal_made_and_failed_and_extra_point(self):
        for result, points in [('made', 3), ('missed', 0), ('blocked', 0)]:
            row = nonpass(play_type='field_goal', field_goal_attempt='1', field_goal_result=result)
            self.assertEqual(r.scoring_delta(row, TEAMS)['points'], points)
        for result, points in [('good', 1), ('failed', 0), ('blocked', 0), ('aborted', 0)]:
            row = nonpass(play_type='extra_point', extra_point_attempt='1', extra_point_result=result)
            self.assertEqual(r.scoring_delta(row, TEAMS)['points'], points)

    def test_offense_and_defense_conversions_score_without_scrimmage_statistics(self):
        offense = play(two_point_attempt='1', two_point_conv_result='success', passing_yards='2', receiving_yards='2')
        self.assertEqual(r.scoring_delta(offense, TEAMS)['points'], 2)
        self.assertEqual(r.stat_delta(offense, TEAMS)['delta'], [])
        for row in (play(two_point_attempt='1', two_point_conv_result='failure', defensive_two_point_conv='1'),
                    nonpass(play_type='extra_point', extra_point_attempt='1', extra_point_result='blocked', defensive_two_point_conv='1'),
                    nonpass(play_type='extra_point', extra_point_attempt='1', extra_point_result='blocked', defensive_extra_point_conv='1')):
            delta = r.scoring_delta(row, TEAMS)
            self.assertEqual((delta['points'], delta['teamId']), (2, 'SEA'))
            self.assertEqual(r.stat_delta(row, TEAMS)['delta'], [])

    def test_completed_try_with_penalty_no_play_classification_still_scores(self):
        row = nonpass(play_type='no_play', play_type_nfl='PENALTY', penalty='1',
                      two_point_attempt='1', two_point_conv_result='success')
        self.assertEqual(r.scoring_delta(row, TEAMS)['points'], 2)
        self.assertEqual(r.stat_delta(row, TEAMS)['delta'], [])

    def test_penalty_before_kick_has_explicit_zero_attempt_and_no_point(self):
        row = nonpass(play_type='extra_point', play_type_nfl='XP_KICK', penalty='1')
        self.assertEqual(r.scoring_delta(row, TEAMS)['points'], 0)
        self.assertEqual(r.scoring_delta(row, TEAMS)['category'], 'penalty_no_try_attempt')
        self.assertEqual(r.stat_delta(row, TEAMS)['delta'], [])

    def test_safety_on_penalty_no_play_scores_but_adds_no_player_yards(self):
        row = nonpass(play_type='no_play', play_type_nfl='PENALTY', penalty='1', safety='1')
        delta = r.scoring_delta(row, TEAMS)
        self.assertEqual((delta['points'], delta['teamId']), (2, 'SEA'))
        self.assertEqual(r.stat_delta(row, TEAMS)['delta'], [])

    def test_unresolved_try_or_turnover_safety_is_withheld_not_assumed(self):
        for changes in (dict(safety='1', two_point_attempt='1', two_point_conv_result='safety'),
                        dict(safety='1', interception='1')):
            with self.subTest(changes=changes), self.assertRaises(r.Withheld):
                r.scoring_delta(play(**changes), TEAMS)

    def test_dedicated_yards_and_score_actor_drive_requested_stats(self):
        row = play(passing_yards='24', receiving_yards='24', touchdown='1', pass_touchdown='1',
                   td_team='BUF', td_player_id=WR, yards_gained='99')
        stats = stats_by_player(r.stat_delta(row, TEAMS))
        self.assertEqual(stats[QB]['passingYards'], 24)
        self.assertEqual(stats[QB]['passingTD'], 1)
        self.assertEqual(stats[WR]['receivingYards'], 24)
        self.assertEqual(stats[WR]['receivingTD'], 1)
        self.assertEqual(stats[WR]['receptions'], 1)
        run = nonpass(play_type='run', rush_attempt='1', rusher_player_id=RB, rushing_yards='12',
                      touchdown='1', rush_touchdown='1', td_team='BUF', td_player_id=RB, yards_gained='80')
        stats = stats_by_player(r.stat_delta(run, TEAMS))
        self.assertEqual(stats[RB]['rushingYards'], 12)
        self.assertEqual(stats[RB]['rushingTD'], 1)

    def test_sacks_spikes_kneels_and_negative_completions(self):
        for changes in (dict(sack='1'), dict(play_type='qb_spike')):
            row = play(complete_pass='0', passing_yards='', receiving_yards='', receiver_player_id='', **changes)
            self.assertEqual(stats_by_player(r.stat_delta(row, TEAMS))[QB]['passingYards'], 0)
        kneel = nonpass(play_type='qb_kneel', rush_attempt='1', rusher_player_id=QB, rushing_yards='-2')
        self.assertEqual(stats_by_player(r.stat_delta(kneel, TEAMS))[QB]['rushingYards'], -2)
        negative = stats_by_player(r.stat_delta(play(passing_yards='-4', receiving_yards='-4'), TEAMS))
        self.assertEqual(negative[QB]['passingYards'], -4)
        self.assertEqual(negative[WR]['receptions'], 1)

    def test_live_penalties_retain_valid_stats_and_nullified_or_deleted_plays_do_not(self):
        self.assertEqual(stats_by_player(r.stat_delta(play(penalty='1'), TEAMS))[QB]['passingYards'], 8)
        for changes in (dict(play_type='no_play', penalty='1'), dict(play_deleted='1')):
            self.assertEqual(r.stat_delta(play(**changes), TEAMS)['delta'], [])
        deleted = play(play_deleted='1', touchdown='1', pass_touchdown='1', td_team='BUF', td_player_id=WR)
        self.assertEqual(r.scoring_delta(deleted, TEAMS)['points'], 0)

    def test_lateral_recipient_gets_yards_and_touchdown_but_not_a_reception(self):
        row = play(passing_yards='82', receiving_yards='2', lateral_reception='1',
                   lateral_receiver_player_id=LATERAL, lateral_receiving_yards='80',
                   touchdown='1', pass_touchdown='1', td_team='BUF', td_player_id=LATERAL)
        delta = r.stat_delta(row, TEAMS)
        stats = stats_by_player(delta)
        self.assertEqual(delta['status'], 'partial')
        self.assertEqual(stats[QB]['passingYards'], 82)
        self.assertEqual(stats[WR]['receivingYards'], 2)
        self.assertEqual(stats[WR]['receptions'], 1)
        self.assertEqual(stats[WR]['receivingTD'], 0)
        self.assertEqual(stats[LATERAL]['receivingYards'], 80)
        self.assertEqual(stats[LATERAL]['receptions'], 0)
        self.assertEqual(stats[LATERAL]['receivingTD'], 1)
        game = r.audit_rows([row], 2026, NOW)['games'][0]
        self.assertIsNone(game['playerStats'])
        self.assertEqual(len(game['knownPlayerStatSubtotals']), 3)

    def test_lateral_run_and_unknown_actor_do_not_invent_stats(self):
        row = nonpass(play_type='run', rush_attempt='1', rusher_player_id=RB, rushing_yards='5',
                      lateral_rush='1', lateral_rusher_player_id=LATERAL, lateral_rushing_yards='7',
                      touchdown='1', rush_touchdown='1', td_team='BUF', td_player_id=LATERAL)
        stats = stats_by_player(r.stat_delta(row, TEAMS))
        self.assertEqual(stats[RB]['rushingYards'], 5)
        self.assertEqual(stats[LATERAL]['rushingTD'], 1)
        with self.assertRaises(r.Withheld):
            r.stat_delta({**row, 'lateral_rusher_player_id': ''}, TEAMS)

    def test_conflicting_flags_wrong_td_actor_and_nonfinite_yards_fail_closed(self):
        score_cases = [dict(touchdown='1', td_team='KC'), dict(touchdown='1', td_team='SEA', pass_touchdown='1'),
                       dict(two_point_attempt='1', two_point_conv_result='success', defensive_two_point_conv='1'),
                       dict(field_goal_attempt='1', field_goal_result='unknown'),
                       dict(play_type='field_goal', field_goal_attempt='0'),
                       dict(play_type='extra_point', extra_point_attempt='0'),
                       dict(touchdown='1', pass_touchdown='1', rush_touchdown='1', td_team='BUF'),
                       dict(play_type='no_play', touchdown='1', td_team='BUF')]
        for changes in score_cases:
            with self.subTest(changes=changes), self.assertRaises(r.Withheld):
                r.scoring_delta(play(**changes), TEAMS)
        stat_cases = [dict(passing_yards='NaN'), dict(receiving_yards='9'), dict(receiver_player_id='unknown'),
                      dict(complete_pass='1', interception='1'), dict(sack='1'),
                      dict(touchdown='1', pass_touchdown='1', td_team='BUF', td_player_id=RB)]
        for changes in stat_cases:
            with self.subTest(changes=changes), self.assertRaises(r.Withheld):
                r.stat_delta(play(**changes), TEAMS)

    def test_cumulative_stats_are_ordered_immutable_and_separate_from_source_score_labels(self):
        first = play(play_id='20', order_sequence='1', home_score='0', away_score='6')
        second = play(play_id='10', order_sequence='2', passing_yards='12', receiving_yards='12',
                      touchdown='1', pass_touchdown='1', td_team='BUF', td_player_id=WR,
                      home_score='0', away_score='6')
        rows = [second, first, end(away_score='6')]; saved = copy.deepcopy(rows)
        report = r.audit_rows(rows, 2026, NOW, schedule(0, 6))
        game = report['games'][0]
        self.assertEqual(game['score'], {'home': 0, 'away': 6})
        self.assertTrue(game['scheduleComparison']['fullyReconstructedMatch'])
        self.assertTrue(game['sourceFinalSupportedSubtotalMatches'])
        self.assertEqual(report['summary']['sourceFinalSubtotalMismatchGames'], 0)
        self.assertEqual([e['playId'] for e in game['events']], [20, 10, 99])
        totals = [{p['playerId']: p for p in e['changedPlayerKnownTotals']} for e in game['events']]
        self.assertEqual(totals[0][QB]['passingYards'], 8)
        self.assertEqual(totals[1][QB]['passingYards'], 20)
        self.assertEqual(totals[0][WR]['receptions'], 1)
        self.assertEqual(totals[1][WR]['receptions'], 2)
        self.assertEqual(rows, saved)
        self.assertEqual(r.audit_rows(rows, 2026, NOW, schedule(0, 6)), report)
        self.assertFalse(report['publicationReady'])
        self.assertEqual(report['playerBoxScoreComparison']['status'], 'unreconciled')
        self.assertEqual(report['summary']['independentlyReconciledPlayerGames'], 0)

    def test_missing_scoring_flags_never_get_zero_certification_even_if_schedule_matches(self):
        row = nonpass(play_type='kickoff', touchdown='')
        game = r.audit_rows([row, end()], 2026, NOW, schedule())['games'][0]
        self.assertIsNone(game['score'])
        self.assertEqual(game['knownScoreSubtotal'], {'home': 0, 'away': 0})
        self.assertTrue(game['scheduleComparison']['supportedSubtotalMatches'])
        self.assertFalse(game['scheduleComparison']['fullyReconstructedMatch'])
        self.assertEqual(game['scoreGaps'], {'missing_or_invalid_touchdown': 1})

    def test_duplicate_events_are_all_withheld_not_deduplicated_into_a_false_pass(self):
        row = play(touchdown='1', pass_touchdown='1', td_team='BUF', td_player_id=WR)
        game = r.audit_rows([row, copy.deepcopy(row)], 2026, NOW)['games'][0]
        self.assertIsNone(game['score'])
        self.assertIsNone(game['playerStats'])
        self.assertEqual(game['knownScoreSubtotal']['away'], 0)
        self.assertEqual(game['scoreGaps']['duplicate_play_identity_or_order'], 2)
        self.assertFalse(game['orderingComplete'])

    def test_contradictory_final_checkpoint_or_schedule_withholds_complete_score(self):
        cases = [(play(home_score='99'), schedule(), 'source_final_score_mismatch'),
                 (play(posteam_score_post='7'), schedule(), 'source_checkpoint_mismatch'),
                 (play(), schedule(0, 7), 'schedule_final_score_mismatch')]
        for row, comparison, gap in cases:
            with self.subTest(gap=gap):
                report = r.audit_rows([row], 2026, NOW, comparison)
                game = report['games'][0]
                self.assertIsNone(game['score'])
                self.assertEqual(game['scoreStatus'], 'withheld')
                self.assertEqual(game['knownScoreSubtotal'], {'home': 0, 'away': 0})
                self.assertIn(gap, game['scoreGaps'])
                self.assertEqual(report['summary']['fullyReconstructedScoreGames'], 0)

    def test_alias_identity_and_postseason_future_rows_are_explicit(self):
        alias = play(game_id='2026_01_BUF_LA', home_team='LA', defteam='LA')
        report = r.audit_rows([alias, play(play_id='2', season_type='POST'),
                               play(play_id='3', game_date=NOW.date().isoformat())], 2026, NOW)
        self.assertEqual(report['games'][0]['id'], '2026_01_BUF_LAR')
        self.assertEqual(report['games'][0]['sourceGameId'], '2026_01_BUF_LA')
        self.assertEqual(report['summary']['excludedRows'], {'outside_regular_season': 1, 'future_or_same_day_game': 1})

    def test_known_regular_season_row_cannot_hide_as_postseason(self):
        rows = [play(), play(play_id='2', order_sequence='2', season_type='POST'), end()]
        report = r.audit_rows(rows, 2026, NOW, schedule())
        self.assertEqual(report['summary']['excludedRows'], {})
        self.assertEqual(report['unassignedRejectedRows'], [{'rowIndex': 1, 'reason': 'schedule_competition_mismatch'}])
        game = report['games'][0]
        self.assertIsNone(game['score'])
        self.assertIsNone(game['playerStats'])
        self.assertEqual(len(game['knownPlayerStatSubtotals']), 2)
        # A distinct, canonical POST game remains an explicit scope exclusion.
        post = play(game_id='2026_19_BUF_SEA', week='19', season_type='POST')
        post_schedule = {**schedule()[0], 'id': '2026_19_BUF_SEA', 'week': 19, 'gameType': 'WC'}
        valid = r.audit_rows([play(), end(), post], 2026, NOW, schedule() + [post_schedule])
        self.assertEqual(valid['summary']['excludedRows'], {'outside_regular_season': 1})
        self.assertEqual(valid['unassignedRejectedRows'], [])
        self.assertIsNotNone(valid['games'][0]['playerStats'])

    def test_contradictory_administrative_markers_do_not_score_or_hide_player_events(self):
        cases = [play(play_type_nfl='END_GAME'), play(play_type='', play_type_nfl='END_GAME'),
                 end(passer_player_id=QB), end(passing_yards='3'), end(touchdown='1')]
        for row in cases:
            with self.subTest(row=row):
                game = r.audit_rows([row], 2026, NOW, schedule())['games'][0]
                self.assertIsNone(game['score'])
                self.assertIsNone(game['playerStats'])
                self.assertEqual(game['knownPlayerStatSubtotals'], [])
                self.assertEqual(game['eventCoverage']['validEndMarkers'], 0)
                self.assertTrue(any(reason.startswith('administrative_') for reason in game['scoreGaps']))
                self.assertTrue(any(reason.startswith('administrative_') for reason in game['playerStatGaps']))

    def test_known_completed_game_cannot_hide_a_row_behind_a_future_or_wrong_source_date(self):
        for day in ('2026-10-15', '2026-10-16', '2026-09-14'):
            with self.subTest(day=day):
                rows = [play(), play(play_id='2', order_sequence='2', game_date=day), end()]
                report = r.audit_rows(rows, 2026, NOW, schedule())
                self.assertEqual(report['summary']['excludedRows'], {})
                self.assertEqual(report['unassignedRejectedRows'], [{'rowIndex': 1, 'reason': 'schedule_game_date_mismatch'}])
                self.assertIsNone(report['games'][0]['score'])
                self.assertIsNone(report['games'][0]['playerStats'])
        future = play(game_id='2026_07_BUF_SEA', week='7', game_date='2026-10-20')
        future_schedule = {**schedule()[0], 'id': future['game_id'], 'week': 7,
                           'gameDate': future['game_date'], 'resultStatus': 'unplayed', 'homeScore': None, 'awayScore': None}
        report = r.audit_rows([play(), end(), future], 2026, NOW, schedule() + [future_schedule])
        self.assertEqual(report['summary']['excludedRows'], {'future_or_same_day_game': 1})
        self.assertEqual(report['unassignedRejectedRows'], [])
        self.assertIsNotNone(report['games'][0]['playerStats'])
        # Even when every supplied row has the bad date, no game is certified.
        mismatch = r.audit_rows([play(game_date='2026-09-14')], 2026, NOW, schedule())
        self.assertEqual(mismatch['games'], [])
        self.assertEqual(mismatch['summary']['fullyReconstructedScoreGames'], 0)

    def test_unknown_full_schedule_identity_is_a_gap_before_every_scope_exclusion(self):
        for changes in ({'week': '2', 'game_id': '2026_02_BUF_SEA'},
                        {'week': '19', 'game_id': '2026_19_BUF_SEA', 'season_type': 'POST'},
                        {'week': '7', 'game_id': '2026_07_BUF_SEA', 'game_date': '2026-10-20'}):
            with self.subTest(changes=changes):
                report = r.audit_rows([play(), end(), play(**changes)], 2026, NOW, schedule())
                self.assertEqual(report['summary']['excludedRows'], {})
                self.assertEqual(report['unassignedRejectedRows'], [{'rowIndex': 2, 'reason': 'unknown_schedule_game'}])
                self.assertIsNone(report['games'][0]['playerStats'])
                self.assertIsNone(report['games'][0]['score'])
        empty = r.audit_rows([play()], 2026, NOW, [])
        self.assertEqual(empty['games'], [])
        self.assertEqual(empty['unassignedRejectedRows'], [{'rowIndex': 0, 'reason': 'unknown_schedule_game'}])
        for change in ({'week': 2}, {'season': 2025}, {'homeTeamId': 'KC'}):
            mismatch = r.audit_rows([play()], 2026, NOW, [{**schedule()[0], **change}])
            self.assertEqual(mismatch['games'], [])
            self.assertEqual(mismatch['unassignedRejectedRows'][0]['reason'], 'schedule_identity_mismatch')

    def test_full_totals_require_one_valid_final_marker_and_observed_onfield_events(self):
        cases = [([play()], 'missing_or_multiple_valid_end_game_markers'),
                 ([end()], 'no_onfield_events'),
                 ([play(), {**end(), 'qtr': '1'}], 'missing_or_multiple_valid_end_game_markers'),
                 ([play(), end(), {**end(), 'play_id': '100', 'order_sequence': '100'}], 'missing_or_multiple_valid_end_game_markers'),
                 ([{**end(), 'order_sequence': '0'}, play()], 'event_after_end_game'),
                 ([play(), end(), end(play_id='100', order_sequence='100', play_type='no_play', play_type_nfl='PENALTY')], 'event_after_end_game'),
                 ([play(), end(), end(play_id='100', order_sequence='100', play_type_nfl='END_HALF')], 'event_after_end_game')]
        for rows, reason in cases:
            with self.subTest(reason=reason, rows=rows):
                game = r.audit_rows(rows, 2026, NOW, schedule())['games'][0]
                self.assertIsNone(game['score'])
                self.assertIsNone(game['playerStats'])
                self.assertIn(reason, game['scoreGaps'])
                self.assertIn(reason, game['playerStatGaps'])
                self.assertFalse(game['eventCoverage']['complete'])
        complete = r.audit_rows([play(), end()], 2026, NOW, schedule())['games'][0]
        self.assertEqual(complete['score'], {'home': 0, 'away': 0})
        self.assertEqual(complete['eventCoverage'], {'validEndMarkers': 1, 'onfieldRows': 1, 'complete': True, 'gaps': []})
        self.assertEqual(complete['playerStatisticsStatus'], 'reconstructed_not_independently_reconciled')
        comment = end(play_id='100', order_sequence='100', play_type_nfl='COMMENT')
        trailing = r.audit_rows([play(), end(), comment], 2026, NOW, schedule())['games'][0]
        self.assertTrue(trailing['eventCoverage']['complete'])
        self.assertEqual(trailing['playerStats'], complete['playerStats'])

    def test_invalid_identity_and_order_are_retained_as_gaps(self):
        report = r.audit_rows([play(), play(game_id='2026_01_BUF_KC'), play(play_id='3', order_sequence='NaN')], 2026, NOW)
        self.assertEqual(report['summary']['unassignedRejectedRows'], 1)
        game = report['games'][0]
        self.assertFalse(game['orderingComplete'])
        self.assertIsNone(game['score'])
        self.assertIsNone(game['playerStats'])

    def test_unknown_or_blank_competition_is_rejected_not_a_scope_exclusion(self):
        for competition in ('', 'BROKEN'):
            with self.subTest(competition=competition):
                report = r.audit_rows([play(), play(play_id='2', order_sequence='2', season_type=competition)], 2026, NOW)
                self.assertEqual(report['summary']['excludedRows'], {})
                self.assertEqual(report['unassignedRejectedRows'], [{'rowIndex': 1, 'reason': 'invalid_season_type'}])
                self.assertIsNone(report['games'][0]['score'])
                self.assertIsNone(report['games'][0]['playerStats'])

    def test_missing_columns_fail_globally_and_nonallowlisted_narrative_is_never_retained(self):
        bad = play(); del bad['td_team']
        with self.assertRaises(ValueError):
            r.audit_rows([bad], 2026, NOW)
        with self.assertRaisesRegex(ValueError, 'CSV string types'):
            r.audit_rows([play(passing_yards={'unknown': 'not a CSV value'})], 2026, NOW)
        report = r.audit_rows([play(desc='Narrative that must not survive', headshot_url='https://example.test/photo')], 2026, NOW)
        self.assertNotIn('Narrative that must not survive', str(report))
        self.assertNotIn('headshot_url', str(report))

    def test_historical_regular_season_overtime_is_observed_not_new_rules_simulation(self):
        row = play(game_id='2023_01_BUF_SEA', season='2023', game_date='2023-09-11', qtr='5')
        report = r.audit_rows([row], 2023, NOW)
        self.assertEqual(report['ruleEdition'], '2023')
        self.assertEqual(report['games'][0]['overtimeRowCount'], 1)
        self.assertIn('Historical editions are not relabelled', report['ruleConformance'])
        self.assertFalse(report['publicationReady'])

    def test_cached_runner_uses_both_verified_loaders_and_never_claims_box_score_validation(self):
        import replay_schedule
        source_ref, schedule_ref = {'sha256': 'fixture-pbp'}, {'sha256': 'fixture-schedule'}
        with patch.object(r.sources, 'load_snapshot', return_value=(b'fixture', source_ref, b'metadata')) as load_pbp, \
             patch.object(r.sources, 'csv_rows', return_value=[play()]), \
             patch.object(replay_schedule, 'load_schedule', return_value={'sourceRef': schedule_ref, 'games': schedule()}) as load_schedule:
            result = r.audit_cached([2026], NOW)
        load_pbp.assert_called_once_with('pbp', 2026, NOW)
        load_schedule.assert_called_once_with(NOW)
        self.assertEqual(result['audits'][0]['sourceRef'], source_ref)
        self.assertEqual(result['audits'][0]['scheduleRef'], schedule_ref)
        self.assertEqual(result['implementationSha256'], r.sources.digest(pathlib.Path(r.__file__).read_bytes()))
        self.assertFalse(result['publicationReady'])


if __name__ == '__main__':
    unittest.main()
