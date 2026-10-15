"""Verified public schedule snapshots for offline replay research.

The source reports scheduled Eastern times and final-score labels. It does not
certify game-day availability, a kickoff freeze, or original publication time.
Scores are labels only and must never enter a pregame feature snapshot.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import pathlib
import re
import urllib.request
from zoneinfo import ZoneInfo

from replay_sources import ALIASES, TEAMS, digest, immutable_write, timestamp

DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / '.local' / 'replay-data'
URL = 'https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv'
METADATA_URL = 'https://api.github.com/repos/nflverse/nflverse-data/releases/tags/schedules'
LICENSE_URL = 'https://github.com/nflverse/nflverse-data/blob/master/LICENSE.md'
VERSION = 'gtl-replay-schedule-1'
MAX_BYTES = 5_000_000
FIELDS = ('game_id', 'season', 'game_type', 'week', 'gameday', 'gametime',
          'home_team', 'away_team', 'home_score', 'away_score')
GAME_TYPES = frozenset(('REG', 'WC', 'DIV', 'CON', 'SB'))


def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def receipt_name(receipt):
    return receipt['sha256'] + '-' + digest(canonical_bytes(receipt))[:12] + '-schedule-receipt.json'


def stored(name):
    path = (DATA_DIR / name).resolve()
    if not path.is_relative_to(DATA_DIR.resolve()):
        raise ValueError('Schedule evidence must stay in the local research directory')
    return path


def read_bounded(path, maximum=MAX_BYTES):
    with path.open('rb') as handle:
        data = handle.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError('Schedule evidence exceeds the size limit')
    return data


def public_bytes(url):
    if url not in (URL, METADATA_URL):
        raise ValueError('Unsupported public schedule source')
    request = urllib.request.Request(url, headers={'User-Agent': 'GuessTheLine-source-audit/1'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError('Schedule download exceeds the size limit')
    return data


def asset_from(metadata):
    if not isinstance(metadata, bytes) or len(metadata) > MAX_BYTES:
        raise ValueError('Exact bounded release metadata bytes are required')
    release = json.loads(metadata)
    if (not isinstance(release, dict) or release.get('tag_name') != 'schedules'
            or not isinstance(release.get('assets'), list)
            or any(not isinstance(a, dict) for a in release['assets'])):
        raise ValueError('Invalid schedule release metadata')
    matches = [a for a in release['assets'] if a.get('browser_download_url') == URL]
    if len(matches) != 1:
        raise ValueError('Missing or ambiguous schedule asset')
    asset = matches[0]
    if (type(asset.get('id')) is not int or asset['id'] <= 0
            or type(asset.get('size')) is not int or not 0 < asset['size'] <= MAX_BYTES
            or not isinstance(asset.get('digest'), str)
            or not re.fullmatch(r'sha256:[a-f0-9]{64}', asset['digest'])
            or not isinstance(asset.get('updated_at'), str)):
        raise ValueError('Invalid schedule asset integrity metadata')
    timestamp(asset['updated_at'])
    return asset


def validate_receipt(receipt):
    if (not isinstance(receipt, dict) or receipt.get('url') != URL
            or receipt.get('version', VERSION) != VERSION):
        raise ValueError('Invalid schedule receipt identity')
    for key in ('sha256', 'metadataSha256'):
        if not isinstance(receipt.get(key), str) or not re.fullmatch(r'[a-f0-9]{64}', receipt[key]):
            raise ValueError('Invalid schedule receipt hash')
    if (type(receipt.get('assetId')) is not int or receipt['assetId'] <= 0
            or type(receipt.get('bytes')) is not int or not 0 < receipt['bytes'] <= MAX_BYTES
            or any(not isinstance(receipt.get(k), str) for k in ('assetUpdatedAt', 'retrievedAt'))):
        raise ValueError('Invalid schedule receipt fields')
    updated, retrieved = timestamp(receipt['assetUpdatedAt']), timestamp(receipt['retrievedAt'])
    if updated > retrieved:
        raise ValueError('A source update cannot follow its retrieval')
    return retrieved


def verify_snapshot(raw, receipt, metadata, as_of):
    cutoff = timestamp(as_of)
    if validate_receipt(receipt) > cutoff:
        raise ValueError('Schedule was first observed after the input cutoff')
    if not isinstance(raw, bytes) or len(raw) != receipt['bytes'] or digest(raw) != receipt['sha256']:
        raise ValueError('Schedule bytes do not match the receipt')
    asset = asset_from(metadata)
    if digest(metadata) != receipt['metadataSha256'] or any(asset.get(key) != value for key, value in {
        'id': receipt['assetId'], 'size': receipt['bytes'], 'digest': 'sha256:' + receipt['sha256'],
        'updated_at': receipt['assetUpdatedAt'],
    }.items()):
        raise ValueError('Schedule release metadata does not match the receipt')


def integer(value, minimum, maximum):
    if not isinstance(value, str) or not re.fullmatch(r'\d+', value):
        raise ValueError('Expected an integer schedule field')
    number = int(value)
    if not minimum <= number <= maximum:
        raise ValueError('Schedule integer is out of range')
    return number


def normalize_schedule(raw, as_of):
    cutoff = timestamp(as_of)
    if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
        raise ValueError('Invalid schedule bytes')
    contents = raw.decode('utf-8-sig')
    if contents.lstrip().startswith('<'):
        raise ValueError('Expected schedule CSV, received HTML')
    reader = csv.DictReader(io.StringIO(contents), strict=True)
    if not reader.fieldnames or len(set(reader.fieldnames)) != len(reader.fieldnames) or not set(FIELDS) <= set(reader.fieldnames):
        raise ValueError('Missing or duplicate schedule columns')
    games, seen = [], set()
    for number, row in enumerate(reader, 1):
        if number > 50_000 or None in row or any(row[k] is None for k in FIELDS):
            raise ValueError('Malformed or oversized schedule CSV')
        season = integer(row['season'], 1990, 2100)
        if season < 2022 or season > min(2026, cutoff.year):
            continue  # Explicit reviewed replay scope; old seasons are not model inputs.
        week = integer(row['week'], 1, 22)
        game_type = row['game_type']
        if game_type not in GAME_TYPES:
            raise ValueError('Unsupported competition in replay schedule')
        teams = [ALIASES.get(row[k], row[k]) for k in ('away_team', 'home_team')]
        if any(team not in TEAMS for team in teams) or teams[0] == teams[1]:
            raise ValueError('Invalid schedule team identity')
        source_parts = row['game_id'].split('_')
        if (len(source_parts) != 4 or source_parts[:2] != [str(season), f'{week:02d}']
                or [ALIASES.get(t, t) for t in source_parts[2:]] != teams):
            raise ValueError('Schedule identity disagrees with its fields')
        identity = f'{season}_{week:02d}_{teams[0]}_{teams[1]}'
        if identity in seen:
            raise ValueError('Duplicate canonical schedule game')
        seen.add(identity)
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', row['gameday']):
            raise ValueError('Expected an ISO calendar game date')
        day = dt.date.fromisoformat(row['gameday'])
        # Reviewed modern NFL season window; excludes accidentally mislabelled
        # next-fall games while retaining January/February postseason dates.
        if not dt.date(season, 7, 1) <= day < dt.date(season + 1, 7, 1):
            raise ValueError('Schedule date is outside its season')
        kickoff = None
        if row['gametime'] not in ('', 'NA', 'TBD'):
            if not re.fullmatch(r'\d{2}:\d{2}', row['gametime']):
                raise ValueError('Invalid scheduled kickoff time')
            time = dt.time.fromisoformat(row['gametime'])
            local = dt.datetime.combine(day, time, ZoneInfo('America/New_York'))
            # Reject a nonexistent DST wall time rather than silently shifting it.
            utc = local.astimezone(dt.timezone.utc)
            if utc.astimezone(local.tzinfo).replace(tzinfo=None) != local.replace(tzinfo=None):
                raise ValueError('Nonexistent scheduled wall time')
            if local.utcoffset() != local.replace(fold=1).utcoffset():
                raise ValueError('Ambiguous scheduled wall time')
            kickoff = utc.isoformat().replace('+00:00', 'Z')
        scores = [None if row[k] in ('', 'NA') else integer(row[k], 0, 100) for k in ('home_score', 'away_score')]
        if (scores[0] is None) != (scores[1] is None):
            raise ValueError('Partial final score must not become a completed game')
        if scores[0] is not None and (kickoff is None or timestamp(kickoff) >= cutoff):
            raise ValueError('Unknown or future kickoff cannot carry completed outcomes')
        games.append({'id': identity, 'sourceGameId': row['game_id'], 'season': season, 'week': week,
                      'gameType': game_type, 'homeTeamId': teams[1], 'awayTeamId': teams[0],
                      'kickoff': kickoff, 'kickoffStatus': 'source_scheduled' if kickoff else 'unknown',
                      'gameDate': day.isoformat(), 'homeScore': scores[0], 'awayScore': scores[1],
                      'resultStatus': 'reported_final' if scores[0] is not None else 'unplayed'})
    if not games:
        raise ValueError('No games in the reviewed replay schedule scope')
    return sorted(games, key=lambda g: g['id'])


def fetch_schedule():
    metadata = public_bytes(METADATA_URL)
    asset = asset_from(metadata)
    raw = public_bytes(URL)
    now = dt.datetime.now(dt.timezone.utc)
    receipt = {'version': VERSION, 'url': URL, 'assetId': asset['id'], 'assetUpdatedAt': asset['updated_at'],
               'bytes': len(raw), 'sha256': digest(raw), 'metadataSha256': digest(metadata), 'retrievedAt': now.isoformat()}
    verify_snapshot(raw, receipt, metadata, now)
    normalize_schedule(raw, now)
    immutable_write(stored(receipt['sha256'] + '-schedule-games.csv'), raw)
    immutable_write(stored(receipt['metadataSha256'] + '-schedule-metadata.json'), metadata)
    immutable_write(stored(receipt_name(receipt)), canonical_bytes(receipt))
    return receipt


def load_schedule(as_of):
    cutoff = timestamp(as_of)
    eligible = []
    for path in DATA_DIR.glob('*-schedule-receipt.json'):
        receipt = json.loads(read_bounded(stored(path.name), 64_000))
        retrieved = validate_receipt(receipt)  # Before any content path construction.
        if path.name != receipt_name(receipt):
            raise ValueError('Schedule receipt filename/content hash mismatch')
        if retrieved <= cutoff:
            eligible.append((retrieved, path.name, receipt))
    if not eligible:
        raise ValueError('No schedule snapshot was observed by the cutoff')
    _, _, receipt = max(eligible, key=lambda item: (item[0], item[1]))
    raw = read_bounded(stored(receipt['sha256'] + '-schedule-games.csv'))
    metadata = read_bounded(stored(receipt['metadataSha256'] + '-schedule-metadata.json'))
    verify_snapshot(raw, receipt, metadata, cutoff)  # Never fall back from corrupt newest eligible evidence.
    first_observed = timestamp(receipt['retrievedAt'])
    first_receipt = receipt
    for retrieved, _, candidate in eligible:
        if candidate['sha256'] == receipt['sha256'] and retrieved < first_observed:
            candidate_metadata = read_bounded(stored(candidate['metadataSha256'] + '-schedule-metadata.json'))
            verify_snapshot(raw, candidate, candidate_metadata, cutoff)
            first_observed = retrieved
            first_receipt = candidate
    games = normalize_schedule(raw, cutoff)
    return {'version': VERSION, 'status': 'research_only', 'publicationReady': False,
            'sourceRef': {**receipt, 'id': 'nflverse-release-schedules',
                          'firstObservedAt': first_observed.isoformat(), 'publishedAt': None,
                          'earliestObservationRef': {
                              'sha256': first_receipt['sha256'],
                              'receiptSha256': digest(canonical_bytes(first_receipt)),
                              'metadataSha256': first_receipt['metadataSha256'],
                              'assetUpdatedAt': first_receipt['assetUpdatedAt'],
                              'retrievedAt': first_receipt['retrievedAt'],
                          },
                          'gamesSha256': digest(canonical_bytes(games)), 'licenseUrl': LICENSE_URL,
                          'attribution': 'nflverse; schedules maintained by Lee Sharpe (CC BY 4.0), filtered and normalized by GTL'},
            'games': games}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('fetch', 'audit'))
    parser.add_argument('--as-of', default=dt.datetime.now(dt.timezone.utc).isoformat())
    args = parser.parse_args()
    if args.command == 'fetch':
        print(json.dumps(fetch_schedule(), indent=2))
        return
    result = load_schedule(args.as_of)
    output = canonical_bytes(result)
    immutable_write(stored('normalized-schedule-' + digest(output)[:12] + '.json'), output)
    print(json.dumps({'status': result['status'], 'publicationReady': False, 'sourceRef': result['sourceRef'],
                      'games': len(result['games']), 'reportedFinal': sum(g['resultStatus'] == 'reported_final' for g in result['games']),
                      'unknownKickoffs': sum(g['kickoff'] is None for g in result['games'])}, indent=2))


if __name__ == '__main__':
    main()
