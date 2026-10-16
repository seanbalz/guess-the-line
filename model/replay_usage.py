"""Offline observed usage counts for a sealed prospective matchup, never forecasts.

build_usage_snapshot(snapshot, schedule, {season: (raw, receipt, metadata)}, policy=...)
verifies PBP bytes in memory. audit_cached_usage loads the verified offline caches.
The schedule envelope must come from replay_schedule.load_schedule and match the
exact schedule pinned by the matchup; its normalized hash is checked again here.

Passing attempts exclude sacks and include spikes; rushes include kneels. Targets
are recorded receiver IDs on nonsack, nonspike pass attempts. Missing intended
receivers remain unresolved, including potential throwaways; they are not zeros.
A player with no recorded event is not known to have played, been available, or
had zero ability. No historical roster membership is inferred from today's team.
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import pathlib
import re

import replay_sources as source
import replay_matchup as matchup

VERSION = 'gtl-observed-usage-1'
IMPLEMENTATION_SHA256 = source.digest(pathlib.Path(__file__).read_bytes())
DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / '.local' / 'replay-data'
FIELDS = ('game_id', 'game_date', 'season', 'season_type', 'week', 'home_team', 'away_team',
          'play_id', 'order_sequence', 'qtr', 'play_type', 'play_type_nfl', 'play_deleted', 'extra_point_attempt',
          'two_point_attempt', 'pass_attempt', 'rush_attempt', 'sack', 'posteam',
          'passer_player_id', 'rusher_player_id', 'receiver_player_id', 'home_score', 'away_score')
METRICS = ('passingAttempts', 'rushAttempts', 'targets')
ADMIN = frozenset(('GAME_START', 'END_QUARTER', 'END_GAME', 'END_HALF', 'COMMENT'))
MAX_SNAPSHOT_BYTES = 5_000_000


class UsageError(ValueError):
    """Untrusted provenance or an invalid usage-policy/snapshot contract."""


def require(value, message):
    if not value:
        raise UsageError(message)


def hash_value(value):
    return source.digest(matchup.canonical_json(value).encode())


def canonical_id(value):
    require(isinstance(value, str), 'invalid_game_id')
    parts = value.split('_')
    require(len(parts) == 4 and re.fullmatch(r'\d{4}', parts[0]) and re.fullmatch(r'\d{2}', parts[1]), 'invalid_game_id')
    away, home = source.team(parts[2]), source.team(parts[3])
    require(away != home and 1 <= int(parts[1]) <= 22, 'invalid_game_identity')
    return f'{parts[0]}_{parts[1]}_{away}_{home}'


def integer(value, minimum, maximum):
    require(isinstance(value, str) and re.fullmatch(r'\d+', value) is not None, 'invalid_integer')
    number = int(value)
    require(minimum <= number <= maximum, 'integer_out_of_range')
    return number


def flag(row, field):
    require(row[field] in ('0', '1'), 'missing_or_invalid_' + field)
    return row[field] == '1'


def validate_inputs(snapshot, schedule, policy):
    require(isinstance(snapshot, dict) and snapshot.get('version') == matchup.VERSION, 'Expected a frozen matchup input snapshot')
    payload = {key: value for key, value in snapshot.items() if key != 'snapshotSha256'}
    require(snapshot.get('snapshotSha256') == hash_value(payload), 'Matchup snapshot integrity mismatch')
    require(snapshot.get('publicationReady') is False and snapshot.get('generationAllowed') is False, 'Unexpected matchup readiness contract')
    cutoff = source.timestamp(snapshot['inputCutoff'])
    game = snapshot['matchup']
    require(canonical_id(game['id']) == game['id'] and game['gameType'] == 'REG', 'Invalid target matchup')
    require(cutoff < source.timestamp(game['kickoff']), 'Prospective cutoff must precede target kickoff')
    require(isinstance(policy, dict) and set(policy) == {'id', 'recordedAt', 'startAt', 'seasons'}, 'Explicit versioned usage policy required')
    matchup.plain(policy['id'], 'usage policy id')
    source.timestamp(policy['recordedAt'])  # Analysis policy time is retained, never backdated to the input cutoff.
    start = source.timestamp(policy['startAt'])
    require(start < cutoff, 'History start must precede cutoff')
    seasons = policy['seasons']
    require(isinstance(seasons, list) and all(type(s) is int and s in source.SUPPORTED_SEASONS for s in seasons), 'Unsupported history seasons')
    first_season = start.year - (start.month < 7)
    require(seasons == list(range(first_season, game['season'] + 1)), 'History seasons must cover the entire declared window exactly once')
    require(isinstance(schedule, dict) and isinstance(schedule.get('games'), list), 'Verified schedule envelope required')
    ref = schedule['sourceRef']
    require(ref.get('gamesSha256') == hash_value(schedule['games']), 'Schedule normalized record integrity mismatch')
    pinned = [r for r in snapshot['sources'] if r['source'] == 'schedule']
    require(len(pinned) == 1 and ref.get('sha256') == pinned[0]['sha256'], 'Usage schedule differs from frozen matchup schedule')
    pin = pinned[0]
    require(ref.get('metadataSha256') == pin.get('metadataSha256')
            and ref.get('gamesSha256') == pin.get('normalizedSha256'),
            'Schedule metadata or normalized records differ from frozen matchup pin')
    times = {}
    for field in ('assetUpdatedAt', 'firstObservedAt', 'retrievedAt'):
        times[field] = source.timestamp(ref[field])
        require(times[field] == source.timestamp(pin[field]), 'Schedule observation differs from frozen matchup pin')
    require(times['assetUpdatedAt'] <= times['retrievedAt'] <= cutoff
            and times['firstObservedAt'] <= times['retrievedAt'], 'Schedule observed after cutoff or has inconsistent times')
    expected, seen = {}, set()
    for item in schedule['games']:
        require(item['id'] == canonical_id(item['id']) and item['id'] not in seen, 'Invalid or duplicate canonical schedule identity')
        seen.add(item['id'])
        if item['id'] == game['id']:
            require(all(item[k] == game[k] for k in ('season', 'week', 'homeTeamId', 'awayTeamId', 'kickoff')), 'Frozen target schedule mismatch')
        if item['season'] not in seasons or item['gameType'] != 'REG' or item['id'] == game['id']:
            continue
        kickoff = source.timestamp(item['kickoff']) if item.get('kickoff') else None
        day = dt.date.fromisoformat(item['gameDate'])
        if kickoff is None or not start <= kickoff < cutoff or day >= cutoff.date() or item['resultStatus'] != 'reported_final':
            continue
        require(type(item.get('homeScore')) is int and type(item.get('awayScore')) is int, 'Completed history requires known final scores')
        expected[item['id']] = item
    require(game['id'] in seen, 'Target absent from pinned schedule')
    players = {}
    for player in snapshot['players']:
        pid = source.player_id(player['id'])
        require(pid not in players, 'Duplicate selected player identity')
        require(player['teamId'] in (game['homeTeamId'], game['awayTeamId']), 'Selected player has an unrelated current team')
        players[pid] = player['teamId']
    return cutoff, start, expected, players


def event_usage(row):
    """Known attribution plus explicit metric gaps; no replacement of null flags."""
    if flag(row, 'play_deleted'):
        return [], [], 'deleted_play'
    kind = row['play_type']
    require(row['play_type_nfl'] not in ADMIN or kind == '', 'administrative_play_type_conflict')
    if kind == 'no_play':
        return [], [], 'no_play'
    if kind == '' and row['play_type_nfl'] in ADMIN:
        # Administrative records have inapplicable null flags. Recognize them
        # explicitly; never substitute nulls for a real scrimmage attempt.
        require(all(row[key] in (*source.NULLS, '0') for key in
                    ('extra_point_attempt', 'two_point_attempt', 'pass_attempt', 'rush_attempt', 'sack')),
                'administrative_usage_conflict')
        require(all(row[key] in source.NULLS for key in
                    ('passer_player_id', 'rusher_player_id', 'receiver_player_id')),
                'administrative_actor_conflict')
        return [], [], 'administrative'
    if flag(row, 'extra_point_attempt') or flag(row, 'two_point_attempt'):
        return [], [], 'try'
    if kind in ('punt', 'kickoff', 'field_goal', 'extra_point'):
        require(not flag(row, 'pass_attempt') and not flag(row, 'rush_attempt'), 'ambiguous_special_teams_usage')
        return [], [], 'special_teams'
    require(kind in ('pass', 'run', 'qb_spike', 'qb_kneel'), 'unsupported_usage_play')
    passing, rushing, sack = (flag(row, key) for key in ('pass_attempt', 'rush_attempt', 'sack'))
    require(not (passing and rushing) and not (sack and not passing), 'conflicting_usage_flags')
    credits, gaps = [], []

    def add(field, metric):
        try:
            pid = source.player_id(row[field])
        except (ValueError, TypeError):
            gaps.append({'metric': metric, 'reason': 'missing_or_invalid_' + field})
            return
        credits.append({'playerId': pid, 'metric': metric})

    if passing:
        require(kind in ('pass', 'qb_spike'), 'passing_type_conflict')
        if sack:
            require(kind != 'qb_spike', 'sack_spike_conflict')
            return [], [], 'sack_not_pass_attempt'
        add('passer_player_id', 'passingAttempts')
        if kind == 'qb_spike':
            require(row['receiver_player_id'] in source.NULLS, 'spike_with_receiver')
        else:
            add('receiver_player_id', 'targets')
    elif rushing:
        require(kind in ('run', 'qb_kneel') and not sack, 'rushing_type_conflict')
        add('rusher_player_id', 'rushAttempts')
    else:
        raise UsageError('scrimmage_without_usage_classification')
    return credits, gaps, None


def build_usage_snapshot(snapshot, schedule, pbp_snapshots, *, policy):
    """Pure deterministic build. PBP raw bytes AND exact metadata are mandatory."""
    cutoff, start, expected, selected = validate_inputs(snapshot, schedule, policy)
    require(isinstance(pbp_snapshots, dict) and set(pbp_snapshots) <= set(policy['seasons']), 'Unexpected PBP season scope')
    schedule_ids = {game['id'] for game in schedule['games']}
    schedule_types = {game['id']: 'REG' if game['gameType'] == 'REG' else 'POST' for game in schedule['games']}
    grouped = collections.defaultdict(list)
    omitted, global_gaps = collections.Counter(), []
    refs, retained = [], []
    for season in policy['seasons']:
        if season not in pbp_snapshots:
            global_gaps.append({'season': season, 'reason': 'source_snapshot_missing'})
            continue
        raw, receipt, metadata = pbp_snapshots[season]
        source.verify_snapshot(raw, receipt, 'pbp', season, cutoff, metadata)
        rows = source.csv_rows(raw, 'pbp')
        require(all(set(FIELDS) <= set(row) for row in rows), 'Missing required usage columns')
        allowlisted = [{k: row[k] for k in FIELDS} for row in rows]
        require(all(isinstance(v, str) for row in allowlisted for v in row.values()), 'Usage fields must retain CSV string types')
        refs.append({'season': season, 'receipt': receipt, 'receiptSha256': hash_value(receipt),
                     'recordsSha256': hash_value(allowlisted), 'firstObservedAt': receipt['retrievedAt'],
                     'publishedAt': None, 'observationBasis': 'verified_retrieval_not_original_publication'})
        for index, row in enumerate(allowlisted):
            try:
                gid = canonical_id(row['game_id'])
                require(integer(row['season'], 2022, 2026) == season, 'wrong_source_season')
                require(row['season_type'] in ('REG', 'POST'), 'invalid_season_type')
                require(gid not in schedule_types or row['season_type'] == schedule_types[gid],
                        'historical_schedule_competition_mismatch')
                require(int(gid[:4]) == season and integer(row['week'], 1, 22) == int(gid[5:7]), 'game_season_week_conflict')
                day = dt.date.fromisoformat(row['game_date'])
                require(dt.date(season, 7, 1) <= day < dt.date(season + 1, 7, 1), 'game_date_outside_season')
                if gid == snapshot['matchup']['id']:
                    omitted['target_game'] += 1
                    continue
                if row['season_type'] != 'REG':
                    omitted['postseason'] += 1
                    continue
                if day >= cutoff.date():
                    omitted['same_day_or_future'] += 1
                    # A mislabeled future row in an otherwise past game is a gap.
                    if gid in expected:
                        global_gaps.append({'season': season, 'row': index, 'reason': 'future_row_in_completed_game', 'gameId': gid})
                    continue
                if gid not in expected:
                    if gid not in schedule_ids and day >= start.date():
                        global_gaps.append({'season': season, 'row': index, 'gameId': gid, 'reason': 'unknown_schedule_game_in_window'})
                    omitted['outside_completed_window'] += 1
                    continue
                grouped[gid].append(row)
                retained.append(row)
            except (ValueError, TypeError) as error:
                global_gaps.append({'season': season, 'row': index, 'reason': str(error)})
    player_games = {pid: {} for pid in selected}
    game_reports, unresolved, excluded = [], [], collections.Counter()
    for gid, game in sorted(expected.items()):
        rows = grouped[gid]
        game_gaps = []
        ids = collections.Counter(int(row['play_id']) for row in rows if re.fullmatch(r'\d+', row['play_id']))
        orders = collections.Counter(int(row['order_sequence']) for row in rows if re.fullmatch(r'\d+', row['order_sequence']))
        end_orders, terminal_orders = [], []
        for row in rows:
            gaps = []
            try:
                play_id = integer(row['play_id'], 1, 1_000_000)
                order = integer(row['order_sequence'], 0, 1_000_000)
                quarter = integer(row['qtr'], 1, 5)
                require(ids[play_id] == 1, 'duplicate_play_identity')
                require(orders[order] == 1, 'duplicate_play_order')
                require(row['game_date'] == game['gameDate'] and source.team(row['home_team']) == game['homeTeamId']
                        and source.team(row['away_team']) == game['awayTeamId'], 'historical_schedule_identity_mismatch')
                require(integer(row['home_score'], 0, 100) == game['homeScore'] and integer(row['away_score'], 0, 100) == game['awayScore'], 'historical_final_score_mismatch')
                credits, gaps, exclusion = event_usage(row)
                if row['play_type_nfl'] == 'END_GAME' and exclusion == 'administrative':
                    require(quarter in (4, 5), 'end_game_before_final_period')
                    end_orders.append(order)
                # Only a validated comment or deleted row may follow END_GAME.
                # A no_play can still carry a penalty or try; it is not a comment.
                trailing_comment = row['play_type_nfl'] == 'COMMENT' and exclusion == 'administrative'
                if row['play_deleted'] == '0' and row['play_type_nfl'] != 'END_GAME' and not trailing_comment:
                    terminal_orders.append(order)
                if exclusion:
                    excluded[exclusion] += 1
                if credits or gaps:
                    historical_team = source.team(row['posteam'])
                    require(historical_team in (game['homeTeamId'], game['awayTeamId']), 'invalid_historical_possession_team')
                staged = {}
                for credit in credits:
                    pid = credit['playerId']
                    if pid not in selected:
                        continue
                    existing = player_games[pid].get(gid)
                    require(existing is None or existing['historicalTeamId'] == historical_team,
                            'player_conflicting_historical_teams')
                    if pid not in staged:
                        staged[pid] = ({**existing, 'knownCounts': dict(existing['knownCounts'])} if existing else
                            {'gameId': gid, 'historicalTeamId': historical_team, 'gameDate': game['gameDate'],
                             'knownCounts': dict.fromkeys(METRICS, 0)})
                    staged[pid]['knownCounts'][credit['metric']] += 1
                # A later conflicting actor must not leave an earlier partial increment.
                for pid, record in staged.items():
                    player_games[pid][gid] = record
            except (ValueError, TypeError) as error:
                gaps = [{'metric': metric, 'reason': str(error)} for metric in METRICS]
                play_id = row['play_id']
            for gap in gaps:
                item = {'gameId': gid, 'playId': play_id, **gap}
                unresolved.append(item)
                game_gaps.append(item)
        has_end = bool(end_orders)
        if not rows:
            game_gaps.append({'reason': 'missing_pbp_game'})
        elif not has_end:
            game_gaps.append({'reason': 'missing_end_game_marker'})
        elif len(end_orders) != 1:
            game_gaps.append({'reason': 'multiple_end_game_markers'})
        if end_orders and any(order > min(end_orders) for order in terminal_orders):
            game_gaps.append({'reason': 'event_after_end_game'})
        if rows and not any(row['play_type'] in source.PLAY_TYPES - {'no_play'} and row['play_deleted'] == '0' for row in rows):
            game_gaps.append({'reason': 'no_onfield_events'})
        game_reports.append({'gameId': gid, 'season': game['season'], 'historicalTeams': [game['awayTeamId'], game['homeTeamId']],
            'gameDate': game['gameDate'], 'rows': len(rows), 'endMarkerObserved': has_end, 'validEndMarkers': len(end_orders),
            'structurallyComplete': bool(rows) and has_end and not game_gaps and not global_gaps, 'gaps': game_gaps})
    metric_complete = {metric: bool(expected) and not global_gaps and all(
        g['rows'] and g['endMarkerObserved'] and not any(gap.get('metric', metric) == metric for gap in g['gaps'])
        for g in game_reports) for metric in METRICS}
    complete = all(metric_complete.values())
    players = []
    for pid, current_team in sorted(selected.items()):
        games = sorted(player_games[pid].values(), key=lambda g: g['gameId'])
        counts = {metric: sum(g['knownCounts'][metric] for g in games) for metric in METRICS}
        by_team = {}
        for g in games:
            bucket = by_team.setdefault(g['historicalTeamId'], {'recordedUsageGames': 0, 'knownCounts': dict.fromkeys(METRICS, 0)})
            bucket['recordedUsageGames'] += 1
            for metric in METRICS:
                bucket['knownCounts'][metric] += g['knownCounts'][metric]
        players.append({'playerId': pid, 'currentTeamId': current_team, 'knownCounts': counts,
            'countsWithinObservedSource': {metric: counts[metric] if metric_complete[metric] else None for metric in METRICS},
            'recordedUsageGames': len(games), 'actualAppearanceGames': None,
            'availability': 'not_inferred', 'historicalTeamMembership': 'only_attributed_event_team_not_roster_membership',
            'historyByTeam': by_team, 'games': games,
            'status': 'observed_usage_only' if games else 'no_recorded_usage_not_known_absence'})
    payload = {'version': VERSION, 'implementationSha256': IMPLEMENTATION_SHA256, 'status': 'research_only', 'publicationReady': False, 'generationAllowed': False,
        'matchupId': snapshot['matchup']['id'], 'matchupSnapshotSha256': snapshot['snapshotSha256'],
        'inputCutoff': cutoff.isoformat(), 'policy': policy, 'policySha256': hash_value(policy),
        'policyPredeclaredAtInputCutoff': source.timestamp(policy['recordedAt']) <= cutoff,
        'historyWindow': {'startAt': start.isoformat(), 'endExclusive': cutoff.isoformat(), 'sameDayExcluded': True, 'competition': 'REG'},
        'sourceRefs': refs, 'scheduleRef': schedule['sourceRef'], 'selectedRecordsSha256': hash_value(sorted(retained, key=matchup.canonical_json)),
        'players': players, 'coverage': {'expectedCompletedGames': len(expected), 'observedGames': sum(bool(g['rows']) for g in game_reports),
            'structurallyCompleteGames': sum(g['structurallyComplete'] for g in game_reports), 'sourceComplete': complete,
            'metricCompleteness': metric_complete,
            'expectedGamesByTeam': {team: sum(team in g['historicalTeams'] for g in game_reports) for team in sorted(source.TEAMS)},
            'omittedRows': dict(omitted), 'excludedEvents': dict(excluded), 'unassignedSourceGaps': global_gaps,
            'games': game_reports}, 'unresolvedEvents': unresolved,
        'limitations': ['Known counts are attributed observations, not player forecasts, participation confirmation, eligibility, or true ability.',
            'No current roster is used to infer historical team membership or an appearance denominator. Historical event teams remain separate from current teams.',
            'Game completion is reported schedule final plus prior calendar date; original finalization time is unknown. Same-day games are excluded.',
            'Source completeness means expected game presence, final identity agreement, one valid Q4/OT end marker after all undeleted non-comment events, unique play identity/order and unambiguous retained event attribution; it cannot prove every upstream event is present.',
            'No automatic completion of missing intended receivers, throwaways, player IDs, flags or games. Missingness can prevent exact source totals.',
            'Original PBP publication time is unknown; only snapshots verified observed by the frozen prospective cutoff are used.',
            'Analysis policy may be authored after the frozen input cutoff; that is disclosed and is not preregistered evaluation.',
            'Counts are derived from flat PBP actor flags, not independently reconciled official player-stat IDs or target totals.',
            'No usage shares, probability estimates, priors, sampling, generated games or publication permission are produced.']}
    return matchup.freeze({**payload, 'usageSnapshotSha256': hash_value(payload)})


def audit_cached_usage(snapshot, policy):
    from replay_schedule import load_schedule
    cutoff = snapshot['inputCutoff']
    # Missing/corrupt cached sources raise rather than silently becoming zero history.
    pbp = {season: source.load_snapshot('pbp', season, cutoff) for season in policy['seasons']}
    return build_usage_snapshot(snapshot, load_schedule(cutoff), pbp, policy=policy)


def store_snapshot(result):
    payload = {k: v for k, v in result.items() if k != 'usageSnapshotSha256'}
    require(result.get('usageSnapshotSha256') == hash_value(payload), 'Usage snapshot integrity mismatch')
    root = DATA_DIR.resolve()
    path = root / ('usage-input-' + result['usageSnapshotSha256'] + '.json')
    require(path.resolve().parent == root, 'Usage output escapes local evidence directory')
    encoded = matchup.canonical_json(result).encode()
    source.immutable_write(path, encoded)
    return path, source.digest(encoded)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--matchup-snapshot', required=True)
    parser.add_argument('--policy', required=True)
    args = parser.parse_args(argv)
    with pathlib.Path(args.matchup_snapshot).open('rb') as handle:
        data = handle.read(MAX_SNAPSHOT_BYTES + 1)
    require(len(data) <= MAX_SNAPSHOT_BYTES, 'Matchup snapshot exceeds limit')
    snapshot = json.loads(data)
    policy = matchup.read_manifest(args.policy)
    require(source.timestamp(policy['recordedAt']) <= dt.datetime.now(dt.timezone.utc), 'Usage analysis policy is future-dated')
    result = audit_cached_usage(snapshot, policy)
    path, sha = store_snapshot(result)
    print(json.dumps({'path': str(path), 'sha256': sha, 'matchupId': result['matchupId'],
        'implementationSha256': result['implementationSha256'], 'usageSnapshotSha256': result['usageSnapshotSha256'],
        'players': len(result['players']), 'playersWithRecordedUsage': sum(p['recordedUsageGames'] > 0 for p in result['players']),
        'expectedGames': result['coverage']['expectedCompletedGames'], 'sourceComplete': result['coverage']['sourceComplete'],
        'unresolvedEvents': len(result['unresolvedEvents']), 'metricCompleteness': result['coverage']['metricCompleteness'], 'generationAllowed': False, 'publicationReady': False}))


if __name__ == '__main__':
    main()
