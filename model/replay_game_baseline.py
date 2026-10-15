"""Exact historical paired-score comparison baseline; never a replay generator.

The fixed configuration was frozen before its first actual metric run. Every
2024/2025 REG target uses ALL eligible REG final home/away pairs since July 2022
on strictly earlier calendar dates. Original within-game pairs stay together.
No RNG, fitted weights, trimming, team/player forecasting or display route exists.

This is rolling-origin DEVELOPMENT analysis of a currently verified, corrected
schedule snapshot. Date ordering does not recreate what a historical feed knew.
Original publication/revision timing is unknown, and all these cohorts have
already been inspected. Nothing here is an untouched holdout or model promotion.
"""
from __future__ import annotations

import argparse
import bisect
import collections
import datetime as dt
import hashlib
import json
import math
import pathlib
import re
import statistics

import replay_evaluation as evaluation
import replay_schedule as schedule_source
import replay_sources as source
from replay_matchup import freeze

VERSION = 'gtl-paired-score-baseline-1'
CONFIG_FROZEN_AT = '2026-10-15T16:49:46.808497+00:00'
CONFIG = {'historyStartDate': '2022-07-01', 'evaluationSeasons': [2024, 2025], 'competition': 'REG',
    'trainingWindow': 'all_strictly_prior_calendar_dates', 'distribution': 'uniform_exact_observed_home_away_score_pairs',
    'intervalLevels': [0.5, 0.8, 0.95], 'tiePolicy': 'separate_binary_tie_event', 'minimumTrainingGames': 1,
    'missingOutcome': 'exclude_with_report', 'revisionPolicy': 'current_verified_snapshot_retrospective_development_only'}
CONFIG_SHA256 = 'ed8b1e9548e393e8d201ac2bd627c744e5478d0c769c79ac79314439766b70e8'
IMPLEMENTATION_SHA256 = source.digest(pathlib.Path(__file__).read_bytes())
EVALUATION_SHA256 = source.digest(pathlib.Path(evaluation.__file__).read_bytes())
SCHEDULE_LOADER_SHA256 = source.digest(pathlib.Path(schedule_source.__file__).read_bytes())
DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / '.local' / 'replay-data'
DISTRIBUTIONS = ('homeScore', 'awayScore', 'margin', 'total')
EVENTS = ('homeWin', 'awayWin', 'tie')


class BaselineError(ValueError):
    """Invalid fixed config, schedule identity, source timing or metric input."""


def require(value, message):
    if not value:
        raise BaselineError(message)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def validate_schedule(envelope, as_of):
    require(digest(CONFIG) == CONFIG_SHA256, 'Frozen baseline configuration changed')
    require(isinstance(envelope, dict) and isinstance(envelope.get('games'), list)
            and 0 < len(envelope['games']) <= 50_000, 'Bounded normalized schedule required')
    cutoff = source.timestamp(as_of)
    ref = envelope.get('sourceRef')
    require(isinstance(ref, dict) and ref.get('url') == schedule_source.URL, 'Expected approved schedule provenance')
    for key in ('sha256', 'metadataSha256', 'gamesSha256'):
        require(isinstance(ref.get(key), str) and re.fullmatch('[a-f0-9]{64}', ref[key]), 'Invalid schedule integrity pin')
    require(ref['gamesSha256'] == digest(envelope['games']), 'Normalized schedule integrity mismatch')
    observed, updated = source.timestamp(ref['retrievedAt']), source.timestamp(ref['assetUpdatedAt'])
    require(updated <= observed <= cutoff, 'Schedule source has future or inconsistent observation times')
    eligible, exclusions, seen, cohort_exclusions = [], collections.Counter(), set(), {s: collections.Counter() for s in CONFIG['evaluationSeasons']}
    cohort_rows = collections.Counter()
    for game in envelope['games']:
        require(isinstance(game, dict), 'Invalid schedule record')
        season, week = game.get('season'), game.get('week')
        require(type(season) is int and 1990 <= season <= 9998 and type(week) is int and 1 <= week <= 22, 'Invalid season/week identity')
        home, away = game.get('homeTeamId'), game.get('awayTeamId')
        require(home in source.TEAMS and away in source.TEAMS and home != away, 'Canonical distinct NFL teams required')
        expected_id = f'{season}_{week:02d}_{away}_{home}'
        require(game.get('id') == expected_id and expected_id not in seen, 'Invalid or duplicate game identity')
        seen.add(expected_id)
        require(game.get('gameType') in schedule_source.GAME_TYPES, 'Unsupported competition')
        require(game.get('resultStatus') in ('reported_final', 'unplayed'), 'Unsupported result status')
        day = dt.date.fromisoformat(game['gameDate'])
        require(dt.date(season, 7, 1) <= day < dt.date(season + 1, 7, 1), 'Game date conflicts with season')
        for key in ('homeScore', 'awayScore'):
            require(game.get(key) is None or type(game[key]) is int and game[key] >= 0, 'Scores must be nonnegative integers or unknown')
        target = season in CONFIG['evaluationSeasons'] and game['gameType'] == 'REG'
        if target:
            cohort_rows[season] += 1
        reason = None
        if game['gameType'] != 'REG':
            reason = 'outside_regular_season'
        elif day < dt.date.fromisoformat(CONFIG['historyStartDate']):
            reason = 'before_history_window'
        elif day >= cutoff.date():
            reason = 'same_day_or_future_at_observation'
        elif game['resultStatus'] != 'reported_final' or game.get('homeScore') is None or game.get('awayScore') is None:
            reason = 'missing_reported_final_outcome'
        else:
            kickoff = source.timestamp(game['kickoff']) if game.get('kickoff') else None
            if kickoff is None or kickoff >= cutoff:
                reason = 'unknown_or_future_kickoff'
        if reason:
            exclusions[reason] += 1
            if target:
                cohort_exclusions[season][reason] += 1
            continue
        eligible.append({'gameId': expected_id, 'season': season, 'gameDate': day.isoformat(),
                         'home': game['homeScore'], 'away': game['awayScore']})
    return sorted(eligible, key=lambda g: (g['gameDate'], g['gameId'])), exclusions, cohort_rows, cohort_exclusions


def training_pairs(eligible, target):
    """Exact expanding prior-date pool: no target, same-day or future outcomes."""
    days = [game['gameDate'] for game in eligible]
    stop = bisect.bisect_left(days, target['gameDate'])
    pool = eligible[:stop]
    require(all(game['gameId'] != target['gameId'] and game['gameDate'] < target['gameDate'] for game in pool), 'Target or later game leaked into training')
    return pool


def mean(values):
    return statistics.fmean(values) if values else None


def aggregate_season(season, scored, cohort_rows, cohort_exclusions):
    records = [item for item in scored if item['season'] == season]
    metrics = [item['metrics'] for item in records]
    counts = [item['trainingGames'] for item in records]
    distributions = {}
    for name in DISTRIBUTIONS:
        distributions[name] = {'meanCrps': mean([metric['distributions'][name]['crps'] for metric in metrics]),
            'intervals': [{'level': level,
                'availableGames': len(metrics),
                'coveredGames': sum(metric['distributions'][name]['intervals'][index]['covered'] for metric in metrics),
                'coverage': mean([int(metric['distributions'][name]['intervals'][index]['covered']) for metric in metrics]),
                'meanWidth': mean([metric['distributions'][name]['intervals'][index]['width'] for metric in metrics])}
                for index, level in enumerate(CONFIG['intervalLevels'])]}
    return {'season': season, 'classification': 'development_only_already_inspected',
        'cohortScheduleRows': cohort_rows[season], 'evaluatedGames': len(records), 'excludedGames': dict(cohort_exclusions[season]),
        'trainingGames': {'min': min(counts) if counts else None, 'max': max(counts) if counts else None, 'mean': mean(counts)},
        'distributions': distributions,
        'events': {event: {'availableGames': len(records), 'meanBrier': mean([metric['events'][event]['brier'] for metric in metrics]),
            'meanProbability': mean([metric['events'][event]['probability'] for metric in metrics]),
            'observedFrequency': mean([int(metric['events'][event]['outcome']) for metric in metrics])} for event in EVENTS}}


def evaluate_schedule(envelope, *, as_of):
    """Pure normalized-contract evaluation; the cached runner verifies raw bytes.

    Detailed targets and empirical pairs are returned separately from aggregates
    and may only be saved in the ignored local research directory.
    """
    eligible, exclusions, cohort_rows, cohort_exclusions = validate_schedule(envelope, as_of)
    scored, pools = [], {}
    for target in eligible:
        if target['season'] not in CONFIG['evaluationSeasons']:
            continue
        pool = training_pairs(eligible, target)
        if len(pool) < CONFIG['minimumTrainingGames']:
            cohort_exclusions[target['season']]['insufficient_prior_games'] += 1
            continue
        pool_sha = digest(pool)
        pools.setdefault(pool_sha, pool)
        pairs = [{'home': item['home'], 'away': item['away']} for item in pool]
        actual = {'home': target['home'], 'away': target['away']}
        metrics = evaluation.paired_game_metrics(pairs, actual,
            tie_policy=CONFIG['tiePolicy'], interval_levels=CONFIG['intervalLevels'])
        scored.append({'gameId': target['gameId'], 'season': target['season'], 'gameDate': target['gameDate'],
            'outcome': actual, 'trainingGames': len(pool), 'latestTrainingDate': pool[-1]['gameDate'],
            'trainingDistributionSha256': pool_sha, 'metrics': metrics})
    aggregate = {'version': VERSION, 'status': 'development_only', 'publicationReady': False, 'generationAllowed': False,
        'comparisonBaselineOnly': True, 'observationAsOf': source.timestamp(as_of).isoformat(),
        'configFrozenAt': CONFIG_FROZEN_AT, 'config': CONFIG, 'configSha256': CONFIG_SHA256,
        'implementationSha256': IMPLEMENTATION_SHA256, 'evaluationModuleSha256': EVALUATION_SHA256,
        'scheduleLoaderSha256': SCHEDULE_LOADER_SHA256, 'sourceRef': envelope['sourceRef'],
        'sourceVerification': 'normalized_contract_only_requires_verified_cached_runner',
        'eligibleRecordedGames': len(eligible), 'eligibleRecordsSha256': digest(eligible), 'sourceExclusions': dict(exclusions),
        'seasons': [aggregate_season(season, scored, cohort_rows, cohort_exclusions) for season in CONFIG['evaluationSeasons']],
        'limitations': ['This is a league-wide empirical comparison baseline, not a team- or player-conditioned forecast or animated game generator.',
            'Whole observed home/away score pairs preserve their empirical joint distribution; no independent marginal pairing, tail trimming, weighting or Monte Carlo sampling is used.',
            'Every target uses strictly earlier calendar dates. Same-day games are excluded even if an earlier kickoff might have finished.',
            'The current corrected schedule was observed now. Original historical availability and revision times are unknown; this is not a historical as-known backtest.',
            '2022–2025 and 2026 weeks 1–5 were already inspected. Reported cohorts are development evidence, not untouched validation.',
            'Historical rules editions differ. Observed outcomes are not reinterpreted as a full 2026 rules simulation.',
            'Scores with unknown final labels are excluded and counted, never replaced by zero. No player availability or participation is inferred.',
            'No prospective protocol, comparative performance improvement, acceptance threshold, deployment or production permission is established.']}
    detailed = {'version': VERSION, 'publicationReady': False, 'aggregateSha256': digest(aggregate),
                'games': scored, 'empiricalDistributions': pools}
    return freeze({'aggregate': aggregate, 'details': detailed})


def evaluate_cached(as_of):
    cutoff = source.timestamp(as_of)
    require(cutoff <= dt.datetime.now(dt.timezone.utc), 'Cannot evaluate a future observation snapshot')
    result = evaluate_schedule(schedule_source.load_schedule(cutoff), as_of=cutoff)
    # Pure builder never claims to have re-opened raw metadata. This wrapper did.
    aggregate = {**result['aggregate'], 'sourceVerification': 'exact_raw_release_metadata_and_receipt_verified_by_cached_loader'}
    detailed = {**result['details'], 'aggregateSha256': digest(aggregate)}
    return freeze({'aggregate': aggregate, 'details': detailed})


def store_result(result):
    require(result['details']['aggregateSha256'] == digest(result['aggregate']), 'Detailed results do not match aggregate provenance')
    root = DATA_DIR.resolve()
    paths = {}
    for name, value in (('aggregate', result['aggregate']), ('details', result['details'])):
        encoded = canonical(value)
        sha = source.digest(encoded)
        path = root / f'paired-score-baseline-{name}-{sha}.json'
        require(path.resolve().parent == root, 'Output escapes local research directory')
        source.immutable_write(path, encoded)
        paths[name] = {'path': str(path), 'sha256': sha}
    return paths


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--as-of', default=dt.datetime.now(dt.timezone.utc).isoformat())
    args = parser.parse_args(argv)
    result = evaluate_cached(args.as_of)
    paths = store_result(result)
    print(json.dumps({'artifacts': paths, 'aggregate': result['aggregate']}, indent=2))


if __name__ == '__main__':
    main()
