"""Allowlisted nflverse source audit; NOT a publishable replay/model input adapter.

python3 model/replay_sources.py fetch --season 2026
python3 model/replay_sources.py audit --season 2026

Only public release assets are fetched. Raw bytes, receipts and reports stay in
.local/replay-data. Repository CC licenses are recorded separately from unresolved
upstream rights. No CLI flag can turn an audit into permission or model readiness.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import gzip
import hashlib
import io
import json
import math
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / '.local' / 'replay-data'
VERSION = 'gtl-replay-source-audit-1'
SUPPORTED_SEASONS = frozenset(range(2022, 2027))
MAX_DOWNLOAD_BYTES = 40_000_000
MAX_CSV_BYTES = 200_000_000
MAX_ROWS = 100_000
TEAMS = frozenset('ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split())
ALIASES = {'LA': 'LAR', 'JAC': 'JAX', 'WSH': 'WAS'}
SOURCES = {
    'pbp': {'tag': 'pbp', 'filename': 'play_by_play_{season}.csv.gz',
            'producer': 'https://github.com/nflverse/nflverse-pbp/blob/master/R/update_pbp.R',
            'upstreamEvidence': 'https://github.com/nflverse/nflfastR/blob/master/R/helper_scrape_nfl.R'},
    'rosters': {'tag': 'rosters', 'filename': 'roster_{season}.csv.gz',
                'producer': 'https://github.com/nflverse/nflverse-rosters/blob/main/R/rosters.R',
                'upstreamEvidence': 'https://github.com/nflverse/nflverse-rosters/blob/main/R/rosters_ngs.R'},
}
RIGHTS = {
    'status': 'replay_use_not_yet_reviewed',
    'repositoryLicense': 'CC-BY-4.0',
    'repositoryLicenseUrl': 'https://github.com/nflverse/nflverse-data/blob/master/LICENSE.md',
    'publisherTermsUrl': 'https://nflreadr.nflverse.com/#terms-of-use',
    'upstreamTermsUrl': 'https://www.nfl.com/legal/terms/',
    'reason': 'nflverse explicitly publishes these releases under CC BY 4.0. GTL has not yet recorded a '
              'review of this field subset for published replays. Upstream applicability remains uncertain; '
              'absence of an additional NFL grant is not proof the distributor licence is insufficient.',
    'upstreamObservation': 'PBP derives from NFL game-detail/plays; roster identities derive from NFL NGS '
                           'or Shield plus enrichment. NFL terms govern NFL Services. Whether those terms '
                           'bind a recipient of factual fields from this distributor is not established.',
    'permittedScopes': ['local_source_audit', 'local_retrospective_research'],
    'requiredAttribution': 'nflverse contributors; source release URL; CC BY 4.0 link; '
                           'identify GTL field filtering, normalization and derived outputs.',
}
# Explicit whitelist: no description text, headshots, odds, vegas, EPA/WP, or provider model outputs.
PBP_FIELDS = ('game_id', 'play_id', 'date', 'season', 'season_type', 'week', 'home_team', 'away_team',
              'posteam', 'defteam', 'qtr', 'quarter_seconds_remaining', 'game_seconds_remaining',
              'down', 'ydstogo', 'yardline_100', 'play_type', 'yards_gained', 'complete_pass',
              'interception', 'fumble_lost', 'touchdown', 'passer_player_id', 'receiver_player_id',
              'rusher_player_id', 'home_score', 'away_score', 'sack', 'pass_attempt', 'rush_attempt',
              'penalty', 'passing_yards', 'rushing_yards', 'receiving_yards')
ROSTER_FIELDS = ('season', 'team', 'gsis_id', 'full_name', 'position', 'status', 'week', 'game_type')
PLAY_TYPES = frozenset(('pass', 'run', 'kickoff', 'punt', 'field_goal', 'extra_point', 'qb_kneel', 'qb_spike', 'no_play'))
NUMERIC = {'play_id': (0, 100_000), 'week': (1, 22), 'qtr': (1, 10),
           'quarter_seconds_remaining': (0, 900), 'game_seconds_remaining': (0, 3600),
           'down': (1, 4), 'ydstogo': (0, 100), 'yardline_100': (0, 100), 'yards_gained': (-100, 100),
           'home_score': (0, 100), 'away_score': (0, 100),
           'passing_yards': (-100, 100), 'rushing_yards': (-100, 100), 'receiving_yards': (-100, 100)}
FLAGS = ('complete_pass', 'interception', 'fumble_lost', 'touchdown', 'sack', 'pass_attempt', 'rush_attempt', 'penalty')
PLAYER_IDS = ('passer_player_id', 'receiver_player_id', 'rusher_player_id')
NULLS = ('', 'NA', 'null')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def timestamp(value):
    parsed = dt.datetime.fromisoformat(value.replace('Z', '+00:00')) if isinstance(value, str) else value
    if not isinstance(parsed, dt.datetime) or parsed.tzinfo is None:
        raise ValueError('An explicit timezone-aware as-of timestamp is required.')
    return parsed.astimezone(dt.timezone.utc)


def check_season(season, as_of):
    if type(season) is not int or season not in SUPPORTED_SEASONS or season > as_of.year:
        raise ValueError('Unsupported or future NFL season.')


def source_url(source, season):
    if not isinstance(source, str) or source not in SOURCES or type(season) is not int or season not in SUPPORTED_SEASONS:
        raise ValueError('Unsupported source or season.')
    item = SOURCES[source]
    return f"https://github.com/nflverse/nflverse-data/releases/download/{item['tag']}/{item['filename'].format(season=season)}"


def local_path(name):
    path = (DATA_DIR / name).resolve()
    if not path.is_relative_to(DATA_DIR.resolve()):
        raise ValueError('Replay evidence must stay inside .local/replay-data.')
    return path


def immutable_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() != data:
            raise ValueError('Refusing to overwrite different source evidence.')
        return
    with path.open('xb') as handle:
        handle.write(data)


def get_public(url, maximum):
    # Callers construct only fixed public GitHub metadata/release URLs. No keys or auth are read.
    allowed = {source_url(source, season) for source in SOURCES for season in SUPPORTED_SEASONS}
    allowed.update(f"https://api.github.com/repos/nflverse/nflverse-data/releases/tags/{s['tag']}" for s in SOURCES.values())
    if url not in allowed:
        raise ValueError('Only allowlisted public source URLs may be fetched.')
    request = urllib.request.Request(url, headers={'User-Agent': 'GuessTheLine-source-audit/1'})
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError('Public response exceeds the audit size limit.')
    return data


def fetch_source(source, season, now=None):
    """Read-only public inspection, storing an immutable snapshot and exact metadata."""
    inspection_start = timestamp(now or dt.datetime.now(dt.timezone.utc))
    check_season(season, inspection_start)
    url = source_url(source, season)
    meta_url = f"https://api.github.com/repos/nflverse/nflverse-data/releases/tags/{SOURCES[source]['tag']}"
    metadata = get_public(meta_url, 5_000_000)
    release = json.loads(metadata)
    if (not isinstance(release, dict) or not isinstance(release.get('assets'), list)
            or any(not isinstance(a, dict) for a in release['assets'])):
        raise ValueError('Invalid release metadata schema.')
    matching = [a for a in release.get('assets', []) if a.get('browser_download_url') == url]
    if len(matching) != 1 or release.get('tag_name') != SOURCES[source]['tag']:
        raise ValueError('Missing or ambiguous public source asset.')
    asset = matching[0]
    if type(asset.get('size')) is not int or not 0 < asset['size'] <= MAX_DOWNLOAD_BYTES:
        raise ValueError('Invalid asset size.')
    if not isinstance(asset.get('digest'), str) or not re.fullmatch(r'sha256:[a-f0-9]{64}', asset['digest']):
        raise ValueError('Release asset has no SHA-256 integrity pin.')
    if type(asset.get('id')) is not int or asset['id'] <= 0 or not isinstance(asset.get('updated_at'), str):
        raise ValueError('Invalid release asset identity or update timestamp.')
    if timestamp(asset['updated_at']) > inspection_start:
        raise ValueError('Future source update cannot be inspected at this cutoff.')
    raw = get_public(url, asset['size'])
    sha = digest(raw)
    if len(raw) != asset['size'] or 'sha256:' + sha != asset['digest']:
        raise ValueError('Source bytes changed during download; no snapshot accepted.')
    csv_rows(raw, source)  # Reject HTML, malformed CSV and decompression bombs before writing.
    retrieved_at = timestamp(now or dt.datetime.now(dt.timezone.utc))
    receipt = {'version': VERSION, 'source': source, 'season': season, 'url': url,
               'sha256': sha, 'bytes': len(raw), 'assetId': asset['id'],
               'assetUpdatedAt': asset['updated_at'], 'retrievedAt': retrieved_at.isoformat(),
               'metadataSha256': digest(metadata), 'rights': RIGHTS, 'fieldSource': SOURCES[source]}
    base = sha + '-' + SOURCES[source]['filename'].format(season=season)
    immutable_write(local_path(base), raw)
    immutable_write(local_path(digest(metadata) + '-metadata.json'), metadata)
    # Retrieval times can differ for the same asset: retain each receipt rather than rewriting it.
    receipt_bytes = (json.dumps(receipt, sort_keys=True, indent=2) + '\n').encode()
    receipt_name = f'{sha}-{digest(receipt_bytes)[:12]}-receipt.json'
    immutable_write(local_path(receipt_name), receipt_bytes)
    return receipt, local_path(base)


def validate_receipt(receipt, source, season):
    """Validate every identity/path component before opening any snapshot content."""
    expected_url = source_url(source, season)
    if not isinstance(receipt, dict):
        raise ValueError('Source receipt must be a JSON object.')
    if (receipt.get('version') != VERSION or receipt.get('source') != source
            or type(receipt.get('season')) is not int or receipt['season'] != season
            or receipt.get('url') != expected_url):
        raise ValueError('Source identity or URL does not match the allowed release.')
    for key in ('sha256', 'metadataSha256'):
        if not isinstance(receipt.get(key), str) or not re.fullmatch(r'[a-f0-9]{64}', receipt[key]):
            raise ValueError(f'Invalid source receipt {key}.')
    if type(receipt.get('bytes')) is not int or not 0 < receipt['bytes'] <= MAX_DOWNLOAD_BYTES:
        raise ValueError('Invalid source receipt byte size.')
    if type(receipt.get('assetId')) is not int or receipt['assetId'] <= 0:
        raise ValueError('Invalid source receipt asset ID.')
    if any(not isinstance(receipt.get(key), str) for key in ('assetUpdatedAt', 'retrievedAt')):
        raise ValueError('Source receipt timestamps must be explicit strings.')
    updated, retrieved = timestamp(receipt['assetUpdatedAt']), timestamp(receipt['retrievedAt'])
    if updated > retrieved:
        raise ValueError('Source update cannot follow its retrieval.')
    return updated, retrieved


def verify_snapshot(raw, receipt, source, season, as_of, metadata):
    as_of = timestamp(as_of)
    check_season(season, as_of)
    _, retrieved = validate_receipt(receipt, source, season)
    if not isinstance(raw, bytes) or receipt['sha256'] != digest(raw) or receipt['bytes'] != len(raw):
        raise ValueError('Source hash/size does not match its receipt.')
    if retrieved > as_of:
        raise ValueError('Future snapshot/retrieval cannot be used at this as-of time.')
    if not isinstance(metadata, bytes) or len(metadata) > 5_000_000:
        raise ValueError('Exact release metadata bytes are required.')
    if digest(metadata) != receipt['metadataSha256']:
        raise ValueError('Release metadata hash does not match its receipt.')
    release = json.loads(metadata)
    if (not isinstance(release, dict) or not isinstance(release.get('assets'), list)
            or any(not isinstance(a, dict) for a in release['assets'])):
        raise ValueError('Invalid release metadata schema.')
    matching = [a for a in release['assets'] if a.get('browser_download_url') == receipt['url']]
    if release.get('tag_name') != SOURCES[source]['tag'] or len(matching) != 1:
        raise ValueError('Release metadata does not identify the allowed asset.')
    asset = matching[0]
    if (type(asset.get('id')) is not int or type(asset.get('size')) is not int
            or any(asset.get(k) != v for k, v in {'id': receipt['assetId'], 'size': len(raw),
               'digest': 'sha256:' + digest(raw), 'updated_at': receipt['assetUpdatedAt']}.items())):
        raise ValueError('Release asset integrity does not match the snapshot.')


def csv_rows(raw, source):
    if source not in SOURCES:
        raise ValueError('Unsupported source.')
    if len(raw) > MAX_DOWNLOAD_BYTES:
        raise ValueError('Source download exceeds the size limit.')
    if raw.startswith(b'\x1f\x8b'):
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
            data = stream.read(MAX_CSV_BYTES + 1)
    else:
        data = raw
    if len(data) > MAX_CSV_BYTES:
        raise ValueError('Decompressed CSV exceeds the size limit.')
    text = data.decode('utf-8-sig')
    if text.lstrip().startswith('<'):
        raise ValueError('Expected CSV, received HTML.')
    reader = csv.DictReader(io.StringIO(text), strict=True)
    required = set(PBP_FIELDS if source == 'pbp' else ROSTER_FIELDS)
    if source == 'pbp':
        required.remove('date'); required.add('game_date')
    names = reader.fieldnames or []
    if len(names) != len(set(names)) or not required.issubset(names):
        raise ValueError('Missing or duplicate required CSV fields.')
    rows = []
    for row in reader:
        if None in row or any(v is None for v in row.values()):
            raise ValueError('Malformed CSV row width.')
        rows.append(row)
        if len(rows) > MAX_ROWS:
            raise ValueError('Too many source rows.')
    if not rows:
        raise ValueError('Empty source dataset.')
    return rows


def number(value, key, low, high, nullable=False):
    if value in NULLS and nullable:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        raise ValueError(f'missing_or_invalid_{key}') from None
    if not math.isfinite(n) or n != int(n) or not low <= n <= high:
        raise ValueError(f'out_of_range_{key}')
    return int(n)


def team(value, nullable=False):
    if value in NULLS and nullable:
        return None
    value = ALIASES.get(value, value)
    if value not in TEAMS:
        raise ValueError('unsupported_team')
    return value


def player_id(value, nullable=False):
    if value in NULLS and nullable:
        return None
    if not re.fullmatch(r'\d{2}-\d{7}', value):
        raise ValueError('missing_or_invalid_player_id')
    return value


def normalize_pbp(raw, season, as_of):
    """Inspect rows locally; invalid rows are quarantined and make the report incomplete.

    Missing administrative-play fields stay None. Unknown/future/missing core data
    never becomes a zero. Final home_score/away_score are LABELS, not model features.
    """
    as_of = timestamp(as_of); check_season(season, as_of)
    source_rows = csv_rows(raw, 'pbp')
    accepted, rejected, omitted, seen, games = [], collections.Counter(), collections.Counter(), set(), {}
    for row in source_rows:
        try:
            if number(row['season'], 'season', season, season) != season:
                raise ValueError('wrong_season')
            date = dt.date.fromisoformat(row['game_date'])
            if date.year not in (season, season + 1):
                raise ValueError('season_date_mismatch')
            # The source has dates, not original finalization timestamps: same-day outcomes are not safe.
            if date >= as_of.date():
                raise ValueError('future_or_same_day_game')
            game_id = row['game_id']
            if not re.fullmatch(rf'{season}_\d{{2}}_[A-Z]{{2,3}}_[A-Z]{{2,3}}', game_id):
                raise ValueError('invalid_game_id')
            out = {'game_id': game_id, 'date': date.isoformat(), 'season': season, 'season_type': row['season_type']}
            if out['season_type'] not in ('REG', 'POST'):
                raise ValueError('unsupported_season_type')
            for key in ('home_team', 'away_team'):
                out[key] = team(row[key])
            parts = game_id.split('_')
            if team(parts[2]) != out['away_team'] or team(parts[3]) != out['home_team'] or out['away_team'] == out['home_team']:
                raise ValueError('game_team_mismatch')
            for key, limits in NUMERIC.items():
                out[key] = number(row[key], key, *limits, nullable=key not in ('play_id', 'week', 'home_score', 'away_score'))
            if out['week'] != int(parts[1]):
                raise ValueError('game_week_mismatch')
            identity = (game_id, out['play_id'])
            if identity in seen:
                raise ValueError('duplicate_play')
            seen.add(identity)
            summary = (out['date'], out['week'], out['home_team'], out['away_team'], out['home_score'], out['away_score'])
            if game_id in games and games[game_id] != summary:
                raise ValueError('inconsistent_game_labels')
            games[game_id] = summary
            kind = row['play_type']
            if kind in NULLS:
                omitted['administrative_no_play_type'] += 1
                continue
            if kind not in PLAY_TYPES:
                raise ValueError('unsupported_play_type')
            out['play_type'] = kind
            for key in ('posteam', 'defteam'):
                out[key] = team(row[key], nullable=True)
                if out[key] and out[key] not in (out['home_team'], out['away_team']):
                    raise ValueError('possession_team_mismatch')
            for key in FLAGS:
                out[key] = number(row[key], key, 0, 1, nullable=True)
            for key in PLAYER_IDS:
                out[key] = player_id(row[key], nullable=True)
            if kind in ('pass', 'run'):
                for key in ('posteam', 'defteam', 'qtr', 'quarter_seconds_remaining', 'game_seconds_remaining',
                            'down', 'ydstogo', 'yardline_100', 'yards_gained', *FLAGS):
                    if out[key] is None:
                        raise ValueError(f'missing_scrimmage_{key}')
                if out['posteam'] == out['defteam']:
                    raise ValueError('possession_team_mismatch')
                role = 'passer_player_id' if kind == 'pass' else 'rusher_player_id'
                if out[role] is None:
                    raise ValueError(f'missing_{role}')
                if out['complete_pass'] == 1 and out['receiver_player_id'] is None:
                    raise ValueError('missing_receiver_player_id')
            accepted.append({key: out[key] for key in PBP_FIELDS})
        except (ValueError, TypeError) as error:
            rejected[str(error)] += 1
    per_week = collections.Counter(str(value[1]) for value in games.values())
    per_team = collections.Counter(t for value in games.values() for t in value[2:4])
    return sorted(accepted, key=lambda r: (r['date'], r['game_id'], r['play_id'])), {
        'rawRows': len(source_rows), 'acceptedRows': len(accepted), 'rejectedRows': sum(rejected.values()),
        'rejections': dict(sorted(rejected.items())), 'omissions': dict(sorted(omitted.items())),
        'observedGameCount': len(games), 'observedGameIds': sorted(games),
        'gameCountsByWeek': dict(sorted(per_week.items())), 'gameCountsByTeam': dict(sorted(per_team.items())),
        'latestGameDate': max((v[0] for v in games.values()), default=None),
        'expectedScheduleReconciled': False,
        'limitation': 'Game counts are observed coverage, not proof every expected game is present. '
                      'Dates do not reconstruct original publication/finalization or correction vintages.'}


def normalize_rosters(raw, season, as_of):
    as_of = timestamp(as_of); check_season(season, as_of)
    source_rows = csv_rows(raw, 'rosters')
    accepted, rejected, seen = [], collections.Counter(), set()
    for row in source_rows:
        try:
            out = {'season': number(row['season'], 'season', season, season), 'team': team(row['team']),
                   'gsis_id': player_id(row['gsis_id']), 'full_name': row['full_name'],
                   'position': row['position'], 'status': row['status'],
                   'week': number(row['week'], 'week', 1, 22), 'game_type': row['game_type']}
            if not out['full_name'].strip() or len(out['full_name']) > 100 or any(ord(c) < 32 for c in out['full_name']):
                raise ValueError('missing_or_invalid_player_name')
            if not re.fullmatch(r'[A-Z]{1,5}', out['position']) or not re.fullmatch(r'[A-Z-]{1,12}', out['status']):
                raise ValueError('missing_or_invalid_position_or_status')
            if out['game_type'] not in ('REG', 'POST', 'WC', 'DIV', 'CON', 'SB'):
                raise ValueError('unsupported_roster_game_type')
            key = (out['gsis_id'], out['team'])
            if key in seen:
                raise ValueError('duplicate_player_team')
            seen.add(key); accepted.append(out)
        except ValueError as error:
            rejected[str(error)] += 1
    return sorted(accepted, key=lambda r: (r['team'], r['gsis_id'])), {
        'rawRows': len(source_rows), 'acceptedRows': len(accepted), 'rejectedRows': sum(rejected.values()),
        'rejections': dict(sorted(rejected.items())),
        'rowsByTeam': dict(sorted(collections.Counter(r['team'] for r in accepted).items())),
        'rowsByLatestObservedWeek': dict(sorted(collections.Counter(str(r['week']) for r in accepted).items())),
        'currentGameRosterVerified': False,
        'limitation': 'Season roster records can be from different latest weeks. Status is not a confirmed '
                      'current-game active roster, depth chart, injury report, or historical as-of snapshot.'}


def audit_sources(pbp_raw, roster_raw, pbp_receipt, roster_receipt, season, as_of, *, pbp_metadata, roster_metadata):
    """Return local inspection data and a blocked report; never certify source/model readiness."""
    for raw, receipt, source, metadata in ((pbp_raw, pbp_receipt, 'pbp', pbp_metadata),
                                           (roster_raw, roster_receipt, 'rosters', roster_metadata)):
        verify_snapshot(raw, receipt, source, season, as_of, metadata)
    pbp, pbp_coverage = normalize_pbp(pbp_raw, season, as_of)
    rosters, roster_coverage = normalize_rosters(roster_raw, season, as_of)
    ids = {r['gsis_id'] for r in rosters}
    used_ids = {r[key] for r in pbp for key in PLAYER_IDS if r[key]}
    unresolved = sorted(used_ids - ids)
    report = {'version': VERSION, 'status': 'blocked', 'publishable': False, 'use': 'local_source_audit_only',
              'asOf': timestamp(as_of).isoformat(), 'season': season, 'rights': RIGHTS,
              'provenance': [pbp_receipt, roster_receipt], 'pbp': pbp_coverage, 'rosters': roster_coverage,
              'unmatchedPlayerIdCount': len(unresolved), 'unmatchedPlayerIds': unresolved,
              'blocks': [RIGHTS['reason'], 'Expected completed-game schedule has not been reconciled.',
                         'Current game roster/availability has not been verified.',
                         'No model validation or predictive calibration is established by ingestion.']}
    if pbp_coverage['rejectedRows'] or roster_coverage['rejectedRows']:
        report['blocks'].append('Source rows were quarantined; inspect the explicit rejection counts before any modeling.')
    if unresolved:
        report['blocks'].append('Some play participant IDs have no accepted season-roster identity; no names are inferred.')
    return {'pbp': pbp, 'rosters': rosters, 'report': report}


def ingest_for_model(*args, **kwargs):
    """Published replay ingestion is disabled; local retrospective audit is separate."""
    raise PermissionError('Replay model ingestion is disabled: ' + RIGHTS['reason'])


def load_snapshot(source, season, as_of):
    as_of = timestamp(as_of)
    check_season(season, as_of)
    source_url(source, season)
    receipts = []
    for path in DATA_DIR.glob('*-receipt.json'):
        receipt = json.loads(path.read_text())
        if not isinstance(receipt, dict):
            raise ValueError('Source receipt must be a JSON object.')
        if receipt.get('version') != VERSION:
            continue  # Historical pre-adapter evidence is retained, never accepted as verified.
        if not isinstance(receipt.get('source'), str):
            raise ValueError('Invalid source receipt source.')
        _, retrieved = validate_receipt(receipt, receipt['source'], receipt.get('season'))
        if receipt['source'] == source and receipt['season'] == season and retrieved <= as_of:
            receipts.append(receipt)
    if not receipts:
        raise ValueError(f'No eligible {source} snapshot at the requested as-of time.')
    receipt = max(receipts, key=lambda r: timestamp(r['retrievedAt']))
    filename = receipt['sha256'] + '-' + SOURCES[source]['filename'].format(season=season)
    raw = local_path(filename).read_bytes()
    metadata = local_path(receipt['metadataSha256'] + '-metadata.json').read_bytes()
    verify_snapshot(raw, receipt, source, season, as_of, metadata)
    return raw, receipt, metadata


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('fetch', 'audit', 'audit-pbp'))
    parser.add_argument('--season', type=int, required=True)
    parser.add_argument('--source', choices=('pbp', 'rosters', 'all'), default='all')
    args = parser.parse_args()
    now = dt.datetime.now(dt.timezone.utc)
    check_season(args.season, now)
    if args.command == 'fetch':
        for source in (SOURCES if args.source == 'all' else (args.source,)):
            receipt, path = fetch_source(source, args.season, now)
            print(json.dumps({'path': str(path), 'sha256': receipt['sha256'], 'publishable': False}))
        return
    if args.command == 'audit-pbp':
        raw, receipt, _ = load_snapshot('pbp', args.season, now)
        rows, coverage = normalize_pbp(raw, args.season, now)
        encoded = (json.dumps(rows, sort_keys=True, separators=(',', ':')) + '\n').encode()
        output = local_path(f'normalized-pbp-{args.season}-{digest(encoded)[:12]}.json')
        immutable_write(output, encoded)
        report = {'version': VERSION, 'use': 'local_retrospective_audit_only', 'publishable': False,
                  'asOf': now.isoformat(), 'coverage': coverage, 'provenance': receipt, 'rights': RIGHTS,
                  'normalizedSha256': digest(encoded), 'normalizedPath': str(output)}
        report_bytes = (json.dumps(report, sort_keys=True, indent=2) + '\n').encode()
        report_path = local_path(f'pbp-audit-{args.season}-{digest(report_bytes)[:12]}.json')
        immutable_write(report_path, report_bytes)
        print(json.dumps({'path': str(output), 'report': str(report_path), 'acceptedRows': len(rows), 'publishable': False}))
        return
    snapshots = {source: load_snapshot(source, args.season, now) for source in SOURCES}
    result = audit_sources(snapshots['pbp'][0], snapshots['rosters'][0], snapshots['pbp'][1], snapshots['rosters'][1], args.season, now,
                           pbp_metadata=snapshots['pbp'][2], roster_metadata=snapshots['rosters'][2])
    encoded = (json.dumps(result['report'], sort_keys=True, indent=2) + '\n').encode()
    output = local_path(f'audit-{args.season}-{digest(encoded)[:12]}.json')
    immutable_write(output, encoded)
    print(json.dumps({'report': str(output), 'status': 'blocked', 'publishable': False,
                      'pbpAcceptedRows': len(result['pbp']), 'rosterAcceptedRows': len(result['rosters'])}))


if __name__ == '__main__':
    main()
