"""Synthetic leakage/identity/missingness tests. No network or real outcomes."""
import copy
import datetime as dt
import json
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import replay_usage as u
import replay_matchup as m
import test_replay_sources as fixtures

CUTOFF = '2026-10-15T16:00:00Z'
QB, WR, IDLE = '00-0000001', '00-0000002', '00-0000003'
HISTORY = '2026_05_SEA_DEN'
TARGET = '2026_06_SEA_DEN'


def play(**changes):
    row = fixtures.play()
    row.update(play_type_nfl='PASS', play_deleted='0', extra_point_attempt='0', two_point_attempt='0')
    row.update(changes)
    row.setdefault('order_sequence', row['play_id'])
    return row


def end(**changes):
    row = play(play_id='99', qtr='4', play_type='', play_type_nfl='END_GAME', pass_attempt='0', rush_attempt='0',
               passer_player_id='', receiver_player_id='', posteam='')
    row.update(changes)
    return row


def game(gid=HISTORY, **changes):
    item = dict(id=gid, sourceGameId=gid, season=2026, week=int(gid[5:7]), gameType='REG',
                homeTeamId='DEN', awayTeamId='SEA', gameDate='2026-10-12', kickoff='2026-10-12T20:00:00Z',
                homeScore=14, awayScore=21, resultStatus='reported_final')
    item.update(changes)
    return item


def seal_snapshot(snapshot):
    snapshot['snapshotSha256'] = u.hash_value({k: v for k,v in snapshot.items() if k != 'snapshotSha256'})


def inputs(rows=None):
    schedule = {'games':[game(),game(TARGET, gameDate='2026-10-15', kickoff='2026-10-16T00:15:00Z',
                                    homeScore=None, awayScore=None,resultStatus='unplayed')]}
    schedule['sourceRef'] = {'sha256':'a'*64, 'metadataSha256':'b'*64,'retrievedAt':'2026-10-15T15:00:00Z',
        'gamesSha256':u.hash_value(schedule['games']), 'firstObservedAt':'2026-10-15T15:00:00Z',
        'assetUpdatedAt':'2026-10-15T14:00:00Z'}
    snapshot={'version':m.VERSION,'publicationReady':False,'generationAllowed':False,'inputCutoff':CUTOFF,
              'matchup':{k:v for k,v in schedule['games'][1].items() if k in ('id','season','week','gameType','homeTeamId','awayTeamId','kickoff')},
              'sources':[{'source':'schedule',**{k:v for k,v in schedule['sourceRef'].items() if k!='gamesSha256'},
                          'normalizedSha256':schedule['sourceRef']['gamesSha256']}],
              'players':[{'id':QB,'teamId':'SEA'},{'id':WR,'teamId':'DEN'},{'id':IDLE,'teamId':'SEA'}]}
    seal_snapshot(snapshot)
    policy={'id':'fixture-usage-v1','recordedAt':'2026-10-15T15:30:00Z','startAt':'2026-09-01T00:00:00Z','seasons':[2026]}
    raw=fixtures.csv_bytes(rows if rows is not None else [play(),end()]); receipt,metadata=fixtures.provenance(raw)
    return snapshot,schedule,{2026:(raw,receipt,metadata)},policy


def build(values=None):
    snapshot,schedule,sources,policy=values or inputs()
    return u.build_usage_snapshot(snapshot,schedule,sources,policy=policy)


def by_id(result):
    return {p['playerId']:p for p in result['players']}


class UsageTests(unittest.TestCase):
    def test_deterministic_sealed_counts_and_transfer_teams_are_separate(self):
        values=inputs(); before=copy.deepcopy(values); result=build(values)
        self.assertEqual(result,build(values)); self.assertEqual(values,before)
        players=by_id(result)
        self.assertEqual(players[QB]['knownCounts'],{'passingAttempts':1,'rushAttempts':0,'targets':0})
        self.assertEqual(players[WR]['currentTeamId'],'DEN')
        self.assertEqual(players[WR]['games'][0]['historicalTeamId'],'SEA')
        self.assertEqual(players[WR]['knownCounts']['targets'],1)
        self.assertTrue(result['coverage']['sourceComplete'])
        self.assertFalse(result['generationAllowed']); self.assertFalse(result['publicationReady'])
        self.assertEqual(result['implementationSha256'],u.source.digest(pathlib.Path(u.__file__).read_bytes()))
        self.assertEqual(result['usageSnapshotSha256'],u.hash_value({k:v for k,v in result.items() if k!='usageSnapshotSha256'}))
        with self.assertRaises(TypeError): result['players'][0]['knownCounts']['targets']=9

    def test_compound_event_team_conflict_commits_no_partial_credit(self):
        r=build(inputs([play(),play(play_id='2',posteam='DEN',passer_player_id=IDLE),end()]))
        p=by_id(r)
        self.assertEqual(p[IDLE]['knownCounts']['passingAttempts'],0)
        self.assertEqual(p[IDLE]['recordedUsageGames'],0)
        self.assertEqual(p[QB]['knownCounts']['passingAttempts'],1)
        self.assertEqual(p[WR]['knownCounts']['targets'],1)
        self.assertIn('player_conflicting_historical_teams',{g['reason'] for g in r['unresolvedEvents']})
        self.assertFalse(r['coverage']['sourceComplete'])

    def test_unused_player_is_not_an_absence_availability_or_appearance_denominator(self):
        player=by_id(build())[IDLE]
        self.assertEqual(player['status'],'no_recorded_usage_not_known_absence')
        self.assertEqual(player['recordedUsageGames'],0)
        self.assertIsNone(player['actualAppearanceGames'])
        self.assertEqual(player['availability'],'not_inferred')
        self.assertEqual(player['historyByTeam'],{})

    def test_sacks_spikes_kneels_interceptions_and_lateral_id_semantics(self):
        rows=[play(sack='1',complete_pass='0',receiver_player_id=''),
              play(play_id='2',play_type='qb_spike',receiver_player_id='',complete_pass='0'),
              play(play_id='3',play_type='qb_kneel',pass_attempt='0',rush_attempt='1',rusher_player_id=QB,receiver_player_id=''),
              play(play_id='4',interception='1',complete_pass='0',lateral_receiver_player_id=IDLE),
              end(lateral_receiver_player_id='')]
        # Extra field is deliberately ignored, not a new target.
        for row in rows:row.setdefault('lateral_receiver_player_id','')
        r=build(inputs(rows));p=by_id(r)
        self.assertEqual(p[QB]['knownCounts'],{'passingAttempts':2,'rushAttempts':1,'targets':0})
        self.assertEqual(p[WR]['knownCounts']['targets'],1)
        self.assertEqual(p[IDLE]['knownCounts']['targets'],0)
        self.assertEqual(r['coverage']['excludedEvents']['sack_not_pass_attempt'],1)

    def test_null_actor_or_flag_is_reported_not_an_exact_zero(self):
        for changes,reason in (({'receiver_player_id':''},'missing_or_invalid_receiver_player_id'),
                               ({'passer_player_id':''},'missing_or_invalid_passer_player_id'),
                               ({'pass_attempt':''},'missing_or_invalid_pass_attempt'),
                               ({'sack':'NA'},'missing_or_invalid_sack')):
            with self.subTest(changes=changes):
                r=build(inputs([play(**changes),end()]))
                self.assertFalse(r['coverage']['sourceComplete'])
                self.assertIn(reason,{g['reason'] for g in r['unresolvedEvents']})
                self.assertIn(None,by_id(r)[QB]['countsWithinObservedSource'].values())
        r=build(inputs([play(receiver_player_id=''),end()]))
        self.assertEqual(by_id(r)[QB]['knownCounts']['passingAttempts'],1)
        self.assertEqual(r['coverage']['metricCompleteness'],{'passingAttempts':True,'rushAttempts':True,'targets':False})
        self.assertEqual(by_id(r)[QB]['countsWithinObservedSource']['passingAttempts'],1)
        self.assertIsNone(by_id(r)[WR]['countsWithinObservedSource']['targets'])

    def test_administrative_null_flags_are_inapplicable_not_scrimmage_defaults(self):
        r=build(inputs([play(),end(extra_point_attempt='',two_point_attempt='',pass_attempt='',rush_attempt='',sack='')]))
        self.assertTrue(r['coverage']['sourceComplete'])
        self.assertEqual(r['coverage']['excludedEvents']['administrative'],1)
        bad=build(inputs([play(),end(pass_attempt='1')]))
        self.assertFalse(bad['coverage']['sourceComplete'])
        self.assertIn('administrative_usage_conflict',{g['reason'] for g in bad['unresolvedEvents']})

    def test_deleted_no_play_and_tries_do_not_count(self):
        r=build(inputs([play(play_deleted='1'),play(play_id='2',play_type='no_play'),
                        play(play_id='3',two_point_attempt='1'),play(play_id='4',extra_point_attempt='1'),end()]))
        self.assertEqual(by_id(r)[QB]['knownCounts']['passingAttempts'],0)
        self.assertEqual(r['coverage']['excludedEvents'],{'deleted_play':1,'no_play':1,'try':2,'administrative':1})

    def test_target_future_same_day_and_outside_window_cannot_leak(self):
        rows=[play(),end(),play(game_id=TARGET,week='6',game_date='2026-10-15',play_id='300',passer_player_id=IDLE),
              play(game_id='2026_07_SEA_DEN',week='7',game_date='2026-10-22',play_id='400',passer_player_id=IDLE),
              play(game_id='2026_01_SEA_DEN',week='1',game_date='2026-08-12',play_id='500',passer_player_id=IDLE)]
        r=build(inputs(rows));p=by_id(r)
        self.assertEqual(p[IDLE]['knownCounts']['passingAttempts'],0)
        self.assertEqual(p[QB]['knownCounts']['passingAttempts'],1)
        self.assertEqual(r['coverage']['expectedCompletedGames'],1)
        self.assertEqual(r['coverage']['omittedRows'],{'target_game':1,'same_day_or_future':1,'outside_completed_window':1})
        self.assertNotIn(TARGET,[g['gameId'] for g in r['coverage']['games']])

    def test_regular_season_game_row_cannot_hide_as_postseason(self):
        r=build(inputs([play(),play(play_id='2',season_type='POST'),end()]))
        self.assertFalse(r['coverage']['sourceComplete'])
        self.assertEqual(r['coverage']['unassignedSourceGaps'][0]['reason'],'historical_schedule_competition_mismatch')
        self.assertNotIn('postseason',r['coverage']['omittedRows'])
        self.assertIsNone(by_id(r)[QB]['countsWithinObservedSource']['passingAttempts'])
        # A distinct explicit postseason game remains outside this REG analysis.
        post=play(play_id='3',game_id='2026_19_BUF_SEA',week='19',season_type='POST')
        valid=build(inputs([play(),end(),post]))
        self.assertTrue(valid['coverage']['sourceComplete'])
        self.assertEqual(valid['coverage']['omittedRows']['postseason'],1)

    def test_future_or_late_observed_receipt_and_corrupt_bytes_fail(self):
        for change in ({'retrievedAt':'2026-10-16T00:00:00Z'},{'sha256':'0'*64},{'metadataSha256':'0'*64}):
            values=inputs();raw,receipt,metadata=values[2][2026];receipt.update(change)
            with self.subTest(change=change),self.assertRaises(ValueError):build(values)
        values=inputs(); raw,receipt,metadata=values[2][2026];values[2][2026]=(raw,receipt,None)
        with self.assertRaises(ValueError):build(values)

    def test_snapshot_and_schedule_hash_tampering_fail(self):
        values=inputs();values[0]['players'][0]['id']=IDLE
        with self.assertRaisesRegex(ValueError,'integrity'):build(values)
        values=inputs();values[1]['games'][0]['gameDate']='2026-10-13'
        with self.assertRaisesRegex(ValueError,'integrity'):build(values)
        values=inputs();values[1]['sourceRef']['sha256']='c'*64
        with self.assertRaisesRegex(ValueError,'frozen'):build(values)

    def test_resealed_schedule_records_metadata_or_observation_cannot_bypass_frozen_pin(self):
        for field in ('games','metadataSha256','retrievedAt'):
            values=inputs();schedule=values[1]
            if field=='games':
                schedule['games'][0]['homeScore']=99
                schedule['sourceRef']['gamesSha256']=u.hash_value(schedule['games'])
            elif field=='metadataSha256':schedule['sourceRef'][field]='c'*64
            else:schedule['sourceRef'][field]='2026-10-15T15:01:00Z'
            with self.subTest(field=field),self.assertRaisesRegex(ValueError,'frozen'):build(values)

    def test_missing_game_end_marker_duplicate_and_invalid_identity_withhold_totals(self):
        cases=([end()], [play()], [play(),play(play_id='01'),end()],
               [play(home_team='KC'),end()], [play(season_type='BROKEN'),end()],
               [play(game_date='2026-10-16'),end()], [play(home_score='99'),end()])
        for rows in cases:
            with self.subTest(rows=rows):
                r=build(inputs(rows))
                self.assertFalse(r['coverage']['sourceComplete'])
                if rows==[end()]:
                    self.assertEqual(by_id(r)[QB]['recordedUsageGames'],0)
                    self.assertIn('no_onfield_events',{gap['reason'] for gap in r['coverage']['games'][0]['gaps']})
        values=inputs();values[2].clear();r=build(values)
        self.assertFalse(r['coverage']['sourceComplete']);self.assertEqual(r['coverage']['observedGames'],0)
        self.assertEqual(r['coverage']['games'][0]['gaps'][0]['reason'],'missing_pbp_game')

    def test_live_or_actor_bearing_row_cannot_certify_end_of_game(self):
        for row in (play(play_type_nfl='END_GAME'),end(passer_player_id=QB)):
            r=build(inputs([row]));game=r['coverage']['games'][0]
            self.assertFalse(game['endMarkerObserved'])
            self.assertFalse(r['coverage']['sourceComplete'])
            self.assertEqual(by_id(r)[QB]['knownCounts']['passingAttempts'],0)
            self.assertIn('missing_end_game_marker',{gap['reason'] for gap in game['gaps']})

    def test_end_marker_must_be_unique_final_period_and_terminal(self):
        cases = [([play(), end(qtr='3')], 'end_game_before_final_period'),
                 ([play(), end(), end(play_id='100', order_sequence='100')], 'multiple_end_game_markers'),
                 ([end(order_sequence='0'), play()], 'event_after_end_game'),
                 ([play(), end(), end(play_id='100', order_sequence='100', play_type='no_play')], 'administrative_play_type_conflict'),
                 ([play(), end(), end(play_id='100', order_sequence='100', play_type='no_play', play_type_nfl='PENALTY')], 'event_after_end_game'),
                 ([play(), end(), end(play_id='100', order_sequence='100', play_type_nfl='END_HALF')], 'event_after_end_game')]
        for rows, reason in cases:
            with self.subTest(reason=reason):
                result = build(inputs(rows))
                self.assertFalse(result['coverage']['sourceComplete'])
                self.assertIn(reason, {gap['reason'] for gap in result['coverage']['games'][0]['gaps']})
                self.assertEqual(by_id(result)[QB]['knownCounts']['passingAttempts'], 1)
                self.assertIsNone(by_id(result)[QB]['countsWithinObservedSource']['passingAttempts'])

    def test_source_order_not_play_id_or_csv_order_controls_terminal_position(self):
        rows = [end(play_id='1', order_sequence='2'), play(play_id='2', order_sequence='1')]
        self.assertTrue(build(inputs(rows))['coverage']['sourceComplete'])
        comment = end(play_id='100', order_sequence='100', play_type_nfl='COMMENT')
        deleted = play(play_id='101', order_sequence='101', play_deleted='1')
        self.assertTrue(build(inputs([play(), end(), comment, deleted]))['coverage']['sourceComplete'])
        for changes, reason in (({'order_sequence': 'NaN'}, 'invalid_integer'),
                                ({'order_sequence': '99'}, 'duplicate_play_order'),
                                ({'qtr': ''}, 'invalid_integer')):
            result = build(inputs([play(**changes), end()]))
            self.assertFalse(result['coverage']['sourceComplete'])
            self.assertIn(reason, {gap['reason'] for gap in result['coverage']['games'][0]['gaps']})

    def test_missing_seasons_or_unknown_player_identity_do_not_get_guessed(self):
        values=inputs();values[3]['startAt']='2025-09-01T00:00:00Z'
        with self.assertRaisesRegex(ValueError,'entire'):build(values)
        r=build(inputs([play(receiver_player_id='NOT_GSIS'),end()]))
        self.assertFalse(r['coverage']['sourceComplete'])
        r=build(inputs([play(receiver_player_id='00-9999999'),end()]))
        self.assertEqual(by_id(r)[WR]['knownCounts']['targets'],0)
        self.assertEqual(len(r['players']),3)

    def test_policy_can_be_new_analysis_without_backdating_or_new_input_data(self):
        values=inputs();values[3]['recordedAt']='2026-10-15T17:00:00Z'
        r=build(values)
        self.assertFalse(r['policyPredeclaredAtInputCutoff'])
        self.assertEqual(r['inputCutoff'],'2026-10-15T16:00:00+00:00')
        self.assertEqual(r['policy']['recordedAt'],'2026-10-15T17:00:00Z')

    def test_verified_wrapper_and_immutable_local_export(self):
        import replay_schedule
        snapshot,schedule,pbp,policy=inputs()
        with patch.object(u.source,'load_snapshot',return_value=pbp[2026]) as load,\
             patch.object(replay_schedule,'load_schedule',return_value=schedule) as load_schedule:
            r=u.audit_cached_usage(snapshot,policy)
        load.assert_called_once_with('pbp',2026,CUTOFF);load_schedule.assert_called_once_with(CUTOFF)
        with tempfile.TemporaryDirectory() as folder,patch.object(u,'DATA_DIR',pathlib.Path(folder)):
            path,sha=u.store_snapshot(r)
            self.assertEqual(path.parent,pathlib.Path(folder).resolve())
            self.assertEqual(sha,u.source.digest(path.read_bytes()))
            self.assertEqual((path,sha),u.store_snapshot(r))
            changed=json.loads(path.read_text());changed['players'][0]['knownCounts']['targets']=9
            with self.assertRaisesRegex(ValueError,'integrity'):u.store_snapshot(changed)


if __name__=='__main__':unittest.main()
