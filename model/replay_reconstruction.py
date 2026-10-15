"""Offline reconstruction of recorded regular-season NFL plays, not a game model.

python3 model/replay_reconstruction.py --seasons 2026

Only verified cached PBP and schedule bytes are read. Detailed event/player
evidence stays in .local/replay-data. No forecast, publication, network fetch or
independent player-box-score verification is performed by this module.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import math
import pathlib
import re

import replay_sources as sources

VERSION = 'gtl-observed-reconstruction-1'
DICTIONARY_URL = 'https://nflreadr.nflverse.com/articles/dictionary_pbp.html'
# Additional factual fields are deliberately local to this audit. No narrative,
# names, odds, EPA/WP, provider probabilities, or generated outcomes are retained.
FIELDS = (
    'game_id', 'play_id', 'order_sequence', 'game_date', 'season', 'season_type', 'week',
    'home_team', 'away_team', 'posteam', 'defteam', 'qtr', 'play_type', 'play_type_nfl',
    'play_deleted', 'penalty', 'aborted_play', 'touchdown', 'td_team', 'td_player_id',
    'pass_touchdown', 'rush_touchdown', 'return_touchdown', 'safety',
    'extra_point_attempt', 'extra_point_result', 'two_point_attempt', 'two_point_conv_result',
    'field_goal_attempt', 'field_goal_result', 'defensive_two_point_conv', 'defensive_extra_point_conv',
    'pass_attempt', 'rush_attempt', 'sack', 'complete_pass', 'interception', 'fumble', 'fumble_lost',
    'passer_player_id', 'receiver_player_id', 'rusher_player_id',
    'passing_yards', 'rushing_yards', 'receiving_yards',
    'lateral_reception', 'lateral_rush', 'lateral_recovery', 'lateral_return',
    'lateral_receiver_player_id', 'lateral_receiving_yards',
    'lateral_rusher_player_id', 'lateral_rushing_yards',
    'posteam_score_post', 'defteam_score_post', 'home_score', 'away_score',
)
STAT_KEYS = ('passingYards', 'rushingYards', 'receivingYards', 'passingTD', 'rushingTD', 'receivingTD', 'receptions')
ADMIN_TYPES = frozenset(('GAME_START', 'END_QUARTER', 'END_GAME', 'END_HALF', 'COMMENT'))
PLAY_TYPES = sources.PLAY_TYPES | {''}
NULLS = ('', 'NA', 'null', None)


class Withheld(ValueError):
    """A recorded event lacks enough consistent information for this derivation."""


def require(condition, reason):
    if not condition:
        raise Withheld(reason)


def number(value, key, low, high, nullable=False):
    if nullable and value in NULLS:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise Withheld('missing_or_invalid_' + key) from None
    require(not isinstance(value, bool) and math.isfinite(n) and n == int(n) and low <= n <= high,
            'out_of_range_' + key)
    return int(n)


def flag(row, key, nullable=False):
    return number(row[key], key, 0, 1, nullable)


def team(value, teams=None, nullable=False):
    if nullable and value in NULLS:
        return None
    result = sources.ALIASES.get(value, value)
    require(result in sources.TEAMS and (teams is None or result in teams), 'invalid_event_team')
    return result


def player(value, key):
    require(isinstance(value, str) and re.fullmatch(r'\d{2}-\d{7}', value) is not None,
            'missing_or_invalid_' + key)
    return value


def administrative(row):
    return row['play_type'] == '' and row['play_type_nfl'] in ADMIN_TYPES


def identity(row, season, cutoff):
    require(number(row['season'], 'season', 2022, 2026) == season, 'different_season')
    if row['season_type'] == 'POST':
        raise Withheld('outside_regular_season')
    require(row['season_type'] == 'REG', 'invalid_season_type')
    week = number(row['week'], 'week', 1, 18)
    home, away = team(row['home_team']), team(row['away_team'])
    require(home != away, 'identical_teams')
    parts = row['game_id'].split('_') if isinstance(row['game_id'], str) else []
    require(len(parts) == 4 and parts[:2] == [str(season), f'{week:02d}'], 'invalid_source_game_id')
    require(team(parts[2]) == away and team(parts[3]) == home, 'source_game_team_mismatch')
    try:
        day = dt.date.fromisoformat(row['game_date'])
    except (TypeError, ValueError):
        raise Withheld('invalid_game_date') from None
    require(day.year in (season, season + 1), 'date_outside_season')
    require(day < cutoff.date(), 'future_or_same_day_game')
    return {'id': f'{season}_{week:02d}_{away}_{home}', 'sourceGameId': row['game_id'],
            'season': season, 'week': week, 'gameDate': day.isoformat(), 'homeTeamId': home, 'awayTeamId': away}


def scoring_delta(row, teams):
    """Derive points from scoring flags/results, never from a cumulative score."""
    if flag(row, 'play_deleted'):
        return {'status': 'excluded', 'reason': 'deleted_play', 'points': 0, 'teamId': None}
    require(row['play_type'] in PLAY_TYPES, 'unsupported_play_type')
    if administrative(row):
        require(not any(flag(row, key, True) == 1 for key in ('touchdown', 'safety', 'field_goal_attempt',
                    'extra_point_attempt', 'two_point_attempt', 'defensive_two_point_conv', 'defensive_extra_point_conv')),
                'administrative_scoring_conflict')
        return {'status': 'excluded', 'reason': 'administrative_row', 'points': 0, 'teamId': None}
    td, safety, fg, xp, two, d_two, d_xp = (flag(row, key) for key in (
        'touchdown', 'safety', 'field_goal_attempt', 'extra_point_attempt', 'two_point_attempt',
        'defensive_two_point_conv', 'defensive_extra_point_conv'))
    require(row['play_type'] != 'field_goal' or fg == 1, 'field_goal_type_without_attempt')
    penalty_no_try = (row['play_type'] == 'extra_point' and not (td or safety or fg or xp or two or d_two or d_xp)
                      and flag(row, 'penalty') == 1 and row['extra_point_result'] in NULLS
                      and row['two_point_conv_result'] in NULLS)
    require(row['play_type'] != 'extra_point' or xp == 1 or two == 1 or penalty_no_try, 'extra_point_type_without_attempt')
    pass_td, rush_td, return_td = (flag(row, key) for key in ('pass_touchdown', 'rush_touchdown', 'return_touchdown'))
    require(pass_td + rush_td + return_td <= 1 and (td or not (pass_td or rush_td or return_td)), 'conflicting_touchdown_flags')
    require(xp + two <= 1 and d_two + d_xp <= 1, 'conflicting_try_flags')
    require(not (fg and (xp or two)) and not (td and safety), 'conflicting_scoring_flags')
    # nflverse also classifies some completed tries with a penalty as no_play.
    # Their explicit conversion result still scores; no individual try yards do.
    require(not (row['play_type'] == 'no_play' and (td or fg)), 'no_play_touchdown_or_field_goal_ambiguous')
    if not td:
        require(row['td_team'] in NULLS and row['td_player_id'] in NULLS, 'touchdown_actor_without_touchdown')
    if fg:
        require(row['field_goal_result'] in ('made', 'missed', 'blocked'), 'missing_or_invalid_field_goal_result')
    else:
        require(row['field_goal_result'] in NULLS, 'field_goal_result_without_attempt')
    offense = team(row['posteam'], teams, True)
    defense = team(row['defteam'], teams, True)
    if offense is not None and defense is not None:
        require(offense != defense, 'identical_possession_teams')
    category, points, scoring_team = 'penalty_no_try_attempt' if penalty_no_try else 'no_score', 0, None
    if xp or two:
        require(offense is not None and defense is not None, 'missing_try_teams')
        require(not (td or pass_td or rush_td or return_td or fg), 'try_touchdown_flag_conflict')
        result = row['extra_point_result'] if xp else row['two_point_conv_result']
        allowed = ('good', 'failed', 'blocked', 'aborted', 'safety') if xp else ('success', 'failure', 'return', 'safety')
        require(result in allowed, 'missing_or_invalid_try_result')
        # A one-point safety can benefit either side after changes of possession.
        # The flat fields do not identify the responsible end zone reliably.
        require(not safety and result != 'safety', 'try_safety_team_unresolved')
        if d_two or d_xp:
            require(result not in ('good', 'success'), 'offense_and_defense_try_success')
            category, points, scoring_team = 'defensive_try_return', 2, defense
        elif result in ('good', 'success'):
            category, points, scoring_team = ('extra_point', 1, offense) if xp else ('two_point_conversion', 2, offense)
        else:
            require(result != 'return', 'try_return_without_scoring_flag')
            category = 'failed_try'
    else:
        require(not (d_two or d_xp), 'defensive_conversion_without_try')
        require(row['extra_point_result'] in NULLS and row['two_point_conv_result'] in NULLS, 'try_result_without_attempt')
        if td:
            require(row['field_goal_result'] != 'made', 'field_goal_and_touchdown')
            scoring_team = team(row['td_team'], teams)
            if pass_td or rush_td:
                require(offense == scoring_team, 'offensive_touchdown_wrong_team')
            category = 'passing_touchdown' if pass_td else 'rushing_touchdown' if rush_td else 'return_touchdown' if return_td else 'other_touchdown'
            points = 6
        elif safety:
            require(not fg and offense is not None and defense is not None, 'invalid_safety_context')
            require(not any(flag(row, key) for key in ('interception', 'fumble_lost', 'lateral_return')),
                    'turnover_safety_team_unresolved')
            category, points, scoring_team = 'safety', 2, defense
        elif fg:
            result = row['field_goal_result']
            require(result in ('made', 'missed', 'blocked'), 'missing_or_invalid_field_goal_result')
            require(offense is not None, 'missing_field_goal_team')
            category = 'field_goal' if result == 'made' else 'failed_field_goal'
            points, scoring_team = (3, offense) if result == 'made' else (0, None)
        else:
            require(row['field_goal_result'] in NULLS, 'field_goal_result_without_attempt')
            require(row['td_team'] in NULLS and row['td_player_id'] in NULLS, 'touchdown_actor_without_touchdown')
    return {'status': 'reconstructed', 'category': category, 'points': points, 'teamId': scoring_team}


def stat_delta(row, teams):
    """Use official-stat yard fields and scoring actors, not gross play yardage.

    Lateral initial/last actors can contribute known subtotals, but the dictionary
    exposes only the last lateral recipient. Full-game totals are withheld when
    intermediate actors may be absent; that gap is never silently called zero.
    """
    if flag(row, 'play_deleted'):
        return {'status': 'excluded', 'reason': 'deleted_play', 'delta': [], 'gaps': []}
    require(row['play_type'] in PLAY_TYPES, 'unsupported_play_type')
    if administrative(row):
        return {'status': 'excluded', 'reason': 'administrative_row', 'delta': [], 'gaps': []}
    if row['play_type'] == 'no_play':
        return {'status': 'excluded', 'reason': 'no_play_no_individual_statistics', 'delta': [], 'gaps': []}
    if flag(row, 'two_point_attempt') or flag(row, 'extra_point_attempt'):
        return {'status': 'excluded', 'reason': 'conversion_no_scrimmage_statistics', 'delta': [], 'gaps': []}
    if row['play_type'] in ('kickoff', 'punt', 'field_goal', 'extra_point'):
        require(not any(flag(row, key, True) == 1 for key in ('complete_pass', 'pass_touchdown', 'rush_touchdown')),
                'special_teams_offensive_stats_conflict')
        return {'status': 'excluded', 'reason': 'special_teams_outside_requested_statistics', 'delta': [], 'gaps': []}
    require(row['play_type'] in ('pass', 'run', 'qb_kneel', 'qb_spike'), 'unclassified_statistics_event')
    offense = team(row['posteam'], teams)
    passing, rushing, complete, sack, intercepted = (flag(row, key) for key in ('pass_attempt', 'rush_attempt', 'complete_pass', 'sack', 'interception'))
    pass_td, rush_td, td = (flag(row, key) for key in ('pass_touchdown', 'rush_touchdown', 'touchdown'))
    require(not (passing and rushing) and not (complete and (sack or intercepted)), 'conflicting_scrimmage_flags')
    require(not (pass_td and rush_td) and (td or not (pass_td or rush_td)), 'conflicting_offensive_touchdown_flags')
    if pass_td or rush_td:
        require(team(row['td_team'], teams) == offense, 'offensive_touchdown_wrong_team')
    delta, gaps = {}, []

    def credit(actor, key, amount):
        if actor not in delta:
            delta[actor] = {'playerId': actor, 'teamId': offense, **dict.fromkeys(STAT_KEYS, 0)}
        delta[actor][key] += amount

    if passing:
        require(row['play_type'] in ('pass', 'qb_spike') and not rush_td, 'passing_type_conflict')
        require(not flag(row, 'lateral_rush'), 'rushing_lateral_on_pass')
        passer = player(row['passer_player_id'], 'passer_player_id')
        credit(passer, 'passingYards', 0)  # Sacks and interceptions are not negative individual passing yards.
        if complete:
            receiver = player(row['receiver_player_id'], 'receiver_player_id')
            credit(passer, 'passingYards', number(row['passing_yards'], 'passing_yards', -100, 100))
            credit(receiver, 'receivingYards', number(row['receiving_yards'], 'receiving_yards', -100, 100))
            credit(receiver, 'receptions', 1)
            lateral = flag(row, 'lateral_reception')
            if lateral:
                actor = player(row['lateral_receiver_player_id'], 'lateral_receiver_player_id')
                credit(actor, 'receivingYards', number(row['lateral_receiving_yards'], 'lateral_receiving_yards', -100, 100))
                gaps.append('lateral_chain_intermediate_receivers_unverified')
            else:
                require(row['lateral_receiver_player_id'] in NULLS and row['lateral_receiving_yards'] in NULLS,
                        'lateral_receiving_fields_without_flag')
                require(delta[passer]['passingYards'] == number(row['receiving_yards'], 'receiving_yards', -100, 100),
                        'nonlateral_passing_receiving_yard_mismatch')
            if pass_td:
                scorer = player(row['td_player_id'], 'td_player_id')
                require(lateral or scorer == receiver, 'receiving_touchdown_actor_mismatch')
                credit(passer, 'passingTD', 1)
                credit(scorer, 'receivingTD', 1)
        else:
            require(not pass_td, 'passing_touchdown_without_completion')
            require(not flag(row, 'lateral_reception') and row['lateral_receiver_player_id'] in NULLS
                    and row['lateral_receiving_yards'] in NULLS, 'lateral_on_incomplete_interception_or_sack')
            require(all(row[key] in NULLS or number(row[key], key, -100, 100) == 0
                        for key in ('passing_yards', 'receiving_yards')), 'yards_on_incomplete_interception_or_sack')
    elif rushing:
        require(row['play_type'] in ('run', 'qb_kneel') and not (complete or sack or intercepted or pass_td), 'rushing_type_conflict')
        require(not flag(row, 'lateral_reception'), 'receiving_lateral_on_run')
        runner = player(row['rusher_player_id'], 'rusher_player_id')
        credit(runner, 'rushingYards', number(row['rushing_yards'], 'rushing_yards', -100, 100))
        lateral = flag(row, 'lateral_rush')
        if lateral:
            actor = player(row['lateral_rusher_player_id'], 'lateral_rusher_player_id')
            credit(actor, 'rushingYards', number(row['lateral_rushing_yards'], 'lateral_rushing_yards', -100, 100))
            gaps.append('lateral_chain_intermediate_rushers_unverified')
        else:
            require(row['lateral_rusher_player_id'] in NULLS and row['lateral_rushing_yards'] in NULLS,
                    'lateral_rushing_fields_without_flag')
        if rush_td:
            scorer = player(row['td_player_id'], 'td_player_id')
            require(lateral or scorer == runner, 'rushing_touchdown_actor_mismatch')
            credit(scorer, 'rushingTD', 1)
    else:
        raise Withheld('scrimmage_without_pass_or_rush_attribution')
    return {'status': 'partial' if gaps else 'reconstructed', 'delta': sorted(delta.values(), key=lambda r: r['playerId']), 'gaps': gaps}


def _withheld(reason, **fields):
    return {'status': 'withheld', 'reason': reason, **fields}


def audit_rows(rows, season, as_of, schedule_games=None):
    """Pure audit; the cached runner supplies verified provenance.

    An unassignable row conservatively prevents certification of every game:
    its missing contribution cannot safely be assigned to just one matchup.
    """
    cutoff = sources.timestamp(as_of)
    sources.check_season(season, cutoff)
    if not isinstance(rows, list) or not 0 < len(rows) <= sources.MAX_ROWS:
        raise ValueError('A bounded nonempty list of PBP rows is required')
    if any(not isinstance(row, dict) or not set(FIELDS) <= set(row) for row in rows):
        raise ValueError('Missing reconstruction fields; do not substitute zero for absent source columns')
    if any(not isinstance(row[key], str) for row in rows for key in FIELDS):
        raise ValueError('Reconstruction inputs must retain the source CSV string types')
    grouped, rejected, excluded = {}, [], collections.Counter()
    for index, original in enumerate(rows):
        row = {key: original[key] for key in FIELDS}
        try:
            meta = identity(row, season, cutoff)
        except (Withheld, TypeError) as error:
            reason = str(error) if isinstance(error, Withheld) else 'invalid_identity_type'
            if reason in ('outside_regular_season', 'future_or_same_day_game'):
                excluded[reason] += 1
            else:
                rejected.append({'rowIndex': index, 'reason': reason})
            continue
        group = grouped.setdefault(meta['id'], {'meta': meta, 'rows': [], 'identityConflict': False})
        if group['meta'] != meta:
            group['identityConflict'] = True
        group['rows'].append(row)
    schedule = {}
    for game in schedule_games or []:
        if game['season'] == season and game['gameType'] == 'REG' and game['resultStatus'] == 'reported_final' and game['gameDate'] < cutoff.date().isoformat():
            if game['id'] in schedule:
                raise ValueError('Duplicate canonical schedule comparison game')
            schedule[game['id']] = game
    results = []
    for game_id, group in sorted(grouped.items()):
        meta, game_rows = group['meta'], group['rows']
        teams = (meta['homeTeamId'], meta['awayTeamId'])
        points = {t: 0 for t in teams}
        stats, events, bad_order = {}, [], False
        score_gaps, stat_gaps = collections.Counter(), collections.Counter()
        source_finals, checkpoint_mismatches = set(), []
        if group['identityConflict']:
            score_gaps['conflicting_game_metadata'] += 1
            stat_gaps['conflicting_game_metadata'] += 1
        ordered = []
        for row in game_rows:
            try:
                play_id = number(row['play_id'], 'play_id', 1, 1_000_000)
                order = number(row['order_sequence'], 'order_sequence', 0, 1_000_000)
                quarter = number(row['qtr'], 'qtr', 1, 5)
                source_finals.add((number(row['home_score'], 'home_score', 0, 100), number(row['away_score'], 'away_score', 0, 100)))
                ordered.append((order, play_id, quarter, row))
            except Withheld as error:
                bad_order = True
                score_gaps[str(error)] += 1
                stat_gaps[str(error)] += 1
                events.append({'status': 'withheld', 'reason': str(error), 'sourcePlayId': row['play_id']})
        ids = collections.Counter(r[1] for r in ordered)
        orders = collections.Counter(r[0] for r in ordered)
        for order, play_id, quarter, row in sorted(ordered, key=lambda r: (r[0], r[1])):
            if ids[play_id] > 1 or orders[order] > 1:
                bad_order = True
                scoring = _withheld('duplicate_play_identity_or_order', points=0, teamId=None)
                individual = _withheld('duplicate_play_identity_or_order', delta=[], gaps=[])
            else:
                try:
                    scoring = scoring_delta(row, teams)
                except (Withheld, TypeError) as error:
                    scoring = _withheld(str(error) if isinstance(error, Withheld) else 'invalid_scoring_field_type', points=0, teamId=None)
                try:
                    individual = stat_delta(row, teams)
                except (Withheld, TypeError) as error:
                    individual = _withheld(str(error) if isinstance(error, Withheld) else 'invalid_stat_field_type', delta=[], gaps=[])
            if scoring['status'] == 'withheld':
                score_gaps[scoring['reason']] += 1
            elif scoring['points']:
                points[scoring['teamId']] += scoring['points']
            if individual['status'] == 'withheld':
                stat_gaps[individual['reason']] += 1
            for reason in individual['gaps']:
                stat_gaps[reason] += 1
            changed = []
            for delta in individual['delta']:
                key = (delta['teamId'], delta['playerId'])
                total = stats.setdefault(key, {'teamId': key[0], 'playerId': key[1], **dict.fromkeys(STAT_KEYS, 0)})
                for metric in STAT_KEYS:
                    total[metric] += delta[metric]
                changed.append(dict(total))
            # These are internal source checkpoints, not independent score proof.
            for team_field, score_field in (('posteam', 'posteam_score_post'), ('defteam', 'defteam_score_post')):
                if row[team_field] not in NULLS and row[score_field] not in NULLS:
                    try:
                        t = team(row[team_field], teams)
                        expected = number(row[score_field], score_field, 0, 100)
                        if points[t] != expected:
                            checkpoint_mismatches.append({'playId': play_id, 'teamId': t, 'knownSubtotal': points[t], 'sourceCheckpoint': expected})
                    except (Withheld, TypeError):
                        checkpoint_mismatches.append({'playId': play_id, 'reason': 'invalid_source_checkpoint'})
            events.append({'playId': play_id, 'orderSequence': order, 'quarter': quarter, 'playType': row['play_type'],
                           'scoring': scoring, 'statistics': individual, 'knownScoreSubtotal': dict(points),
                           'changedPlayerKnownTotals': changed})
        if len(source_finals) != 1:
            score_gaps['missing_or_conflicting_source_final_scores'] += 1
        known_score = {'home': points[teams[0]], 'away': points[teams[1]]}
        expected = schedule.get(game_id)
        identity_matches = bool(expected and expected['homeTeamId'] == teams[0] and expected['awayTeamId'] == teams[1] and expected['gameDate'] == meta['gameDate'])
        score_matches = bool(identity_matches and known_score == {'home': expected['homeScore'], 'away': expected['awayScore']})
        source_final_matches = len(source_finals) == 1 and (known_score['home'], known_score['away']) in source_finals
        if not source_final_matches:
            score_gaps['source_final_score_mismatch'] += 1
        if checkpoint_mismatches:
            score_gaps['source_checkpoint_mismatch'] += len(checkpoint_mismatches)
        if schedule_games is not None:
            if expected is None:
                score_gaps['schedule_game_missing'] += 1
            elif not identity_matches:
                score_gaps['schedule_identity_mismatch'] += 1
            elif not score_matches:
                score_gaps['schedule_final_score_mismatch'] += 1
        score_complete = not score_gaps and not rejected
        player_complete = not stat_gaps and not rejected
        known_stats = sorted(stats.values(), key=lambda r: (r['teamId'], r['playerId']))
        results.append({**meta, 'rowCount': len(game_rows), 'orderingComplete': not bad_order,
                        'overtimeRowCount': sum(r[2] > 4 for r in ordered),
                        'scoreStatus': 'reconstructed' if score_complete else 'withheld',
                        'score': known_score if score_complete else None, 'knownScoreSubtotal': known_score,
                        'scoreGaps': dict(score_gaps), 'sourceFinalScores': [dict(zip(('home', 'away'), p)) for p in sorted(source_finals)],
                        'sourceFinalSupportedSubtotalMatches': source_final_matches,
                        'sourceCheckpointMismatches': checkpoint_mismatches,
                        'scheduleComparison': {'available': expected is not None, 'identityMatches': identity_matches,
                            'supportedSubtotalMatches': score_matches, 'fullyReconstructedMatch': score_matches and score_complete,
                            'scheduleScore': {'home': expected['homeScore'], 'away': expected['awayScore']} if expected else None},
                        'playerStatisticsStatus': 'reconstructed_not_independently_reconciled' if player_complete else 'withheld',
                        'playerStats': known_stats if player_complete else None,
                        'knownPlayerStatSubtotals': known_stats, 'playerStatGaps': dict(stat_gaps), 'events': events})
    scoring_categories, stat_exclusions, score_gap_counts, stat_gap_counts = (collections.Counter() for _ in range(4))
    for game in results:
        score_gap_counts.update(game['scoreGaps']); stat_gap_counts.update(game['playerStatGaps'])
        for event in game['events']:
            if 'scoring' not in event:
                continue
            scoring = event['scoring']
            if scoring.get('points'):
                scoring_categories[scoring['category']] += 1
            if event['statistics']['status'] == 'excluded':
                stat_exclusions[event['statistics']['reason']] += 1
    return {'version': VERSION, 'status': 'research_only', 'publicationReady': False, 'season': season,
            'asOf': cutoff.isoformat(), 'competition': 'REG', 'ruleEdition': str(season),
            'ruleConformance': 'Recorded outcomes only; no period, possession, kickoff or overtime rule simulation. Historical editions are not relabelled as 2026 rules.',
            'fieldDictionary': DICTIONARY_URL, 'fieldsUsed': list(FIELDS),
            'playerBoxScoreComparison': {'status': 'unreconciled', 'verifiedIndependentSource': None,
                'reason': 'No separately published, permission-reviewed and hash-verified player box-score input is supplied. PBP attribution and source checkpoints are not independent box-score validation.'},
            'summary': {'sourceRows': len(rows), 'observedRegularSeasonGames': len(results),
                'excludedRows': dict(excluded), 'unassignedRejectedRows': len(rejected),
                'fullyReconstructedScoreGames': sum(g['scoreStatus'] == 'reconstructed' for g in results),
                'fullyReconstructedScheduleMatches': sum(g['scheduleComparison']['fullyReconstructedMatch'] for g in results),
                'supportedScoreSubtotalMatches': sum(g['scheduleComparison']['supportedSubtotalMatches'] for g in results),
                'scheduleExpectedGames': len(schedule) if schedule_games is not None else None,
                'missingPbpGameIds': sorted(set(schedule) - set(grouped)),
                'unexpectedPbpGameIds': sorted(set(grouped) - set(schedule)) if schedule_games is not None else [],
                'playerStatisticGamesWithoutKnownGaps': sum(g['playerStats'] is not None for g in results),
                'independentlyReconciledPlayerGames': 0, 'scoringEventsByCategory': dict(scoring_categories),
                'sourceFinalSubtotalMismatchGames': sum(not g['sourceFinalSupportedSubtotalMatches'] for g in results),
                'scheduleSubtotalMismatchGames': sum(g['scheduleComparison']['available'] and not g['scheduleComparison']['supportedSubtotalMatches'] for g in results),
                'statisticExclusions': dict(stat_exclusions), 'scoreGapCountsByReason': dict(score_gap_counts),
                'statisticGapCountsByReason': dict(stat_gap_counts),
                'sourceCheckpointMismatchCount': sum(len(g['sourceCheckpointMismatches']) for g in results)},
            'unassignedRejectedRows': rejected, 'games': results}


def audit_cached(seasons, as_of):
    from replay_schedule import load_schedule
    schedule = load_schedule(as_of)
    audits = []
    for season in seasons:
        raw, receipt, _ = sources.load_snapshot('pbp', season, as_of)
        rows = sources.csv_rows(raw, 'pbp')
        report = audit_rows(rows, season, as_of, schedule['games'])
        report['sourceRef'] = receipt
        report['scheduleRef'] = schedule['sourceRef']
        audits.append(report)
    return {'version': VERSION, 'status': 'research_only', 'publicationReady': False,
            'use': 'observed_outcome_reconstruction_audit_not_forecast',
            'implementationSha256': sources.digest(pathlib.Path(__file__).read_bytes()), 'audits': audits}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seasons', type=int, nargs='+', default=[2026])
    parser.add_argument('--as-of', default=dt.datetime.now(dt.timezone.utc).isoformat())
    args = parser.parse_args()
    report = audit_cached(args.seasons, args.as_of)
    encoded = (json.dumps(report, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False) + '\n').encode()
    path = sources.local_path('reconstruction-audit-' + sources.digest(encoded)[:12] + '.json')
    sources.immutable_write(path, encoded)
    print(json.dumps({'path': str(path), 'sha256': sources.digest(encoded),
                      'implementationSha256': report['implementationSha256'], 'publicationReady': False,
                      'summaries': [{'season': audit['season'], **audit['summary']} for audit in report['audits']]}))


if __name__ == '__main__':
    main()
