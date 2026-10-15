"""Current nflverse factual-field audit; research only, never publication readiness.

python3 model/replay_current_sources.py cache --source all
python3 model/replay_current_sources.py audit

``cache`` registers already downloaded, hash-matching public candidates at the
CURRENT observation time. It does not backdate them to file mtime/provider dates.
``fetch`` retrieves only the three explicit 2026 release assets. All evidence and
normalized exports stay in ignored .local/replay-data; no credentials are used.
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
import datetime as dt
import gzip
import hashlib
import importlib.util
import io
import json
import pathlib
import re
import urllib.request

_CORE = importlib.util.spec_from_file_location('gtl_replay_source_core', pathlib.Path(__file__).with_name('replay_sources.py'))
core = importlib.util.module_from_spec(_CORE)
_CORE.loader.exec_module(core)
DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / '.local' / 'replay-data'
VERSION = 'gtl-current-source-audit-1'
SEASON = 2026
MAX_DOWNLOAD_BYTES = 20_000_000
MAX_CSV_BYTES = 80_000_000
MAX_METADATA_BYTES = 3_000_000
MAX_ROWS = 750_000
SOURCES = {
    'weekly_rosters': {'filename': 'roster_weekly_2026.csv.gz',
                       'fields': ('season', 'team', 'week', 'game_type', 'gsis_id', 'full_name', 'position', 'status')},
    'injuries': {'filename': 'injuries_2026.csv.gz',
                 'fields': ('season', 'team', 'week', 'game_type', 'gsis_id', 'full_name', 'position', 'report_status', 'practice_status')},
    'depth_charts': {'filename': 'depth_charts_2026.csv.gz',
                     'fields': ('dt', 'team', 'player_name', 'gsis_id', 'pos_grp_id', 'pos_grp', 'pos_id', 'pos_abb', 'pos_slot', 'pos_rank')},
}
# Known non-exported fields let the report distinguish intentional filtering from a new schema.
KNOWN_EXCLUDED = {
    'weekly_rosters': frozenset(('depth_chart_position', 'jersey_number', 'first_name', 'last_name', 'birth_date',
        'height', 'weight', 'college', 'espn_id', 'sportradar_id', 'yahoo_id', 'rotowire_id', 'pff_id', 'pfr_id',
        'fantasy_data_id', 'sleeper_id', 'years_exp', 'headshot_url', 'ngs_position', 'status_description_abbr',
        'football_name', 'esb_id', 'gsis_it_id', 'smart_id', 'entry_year', 'rookie_year', 'draft_club', 'draft_number')),
    'injuries': frozenset(('season_type', 'first_name', 'last_name', 'report_primary_injury',
        'report_secondary_injury', 'practice_primary_injury', 'practice_secondary_injury')),
    'depth_charts': frozenset(('espn_id', 'pos_name')),
}
RIGHTS = {
    'license': 'CC-BY-4.0',
    'licenseUrl': 'https://github.com/nflverse/nflverse-data/blob/master/LICENSE.md',
    'scope': 'local_source_audit_and_research',
    'attribution': 'nflverse contributors, CC BY 4.0; source release links retained. '
                   'Guess The Line filters fields, normalizes team codes, and selects current depth snapshots.',
    'limitation': 'No additional applicable restriction is asserted merely because a second NFL grant is absent. '
                  'Production field-use review and matchup/player validation remain incomplete. '
                  'No images, narrative, trademark or endorsement rights are inferred.',
}
NULLS = ('', 'NA', 'null')
# Source codes are preserved literally, never translated into game-day availability.
ROSTER_STATUSES = frozenset(('ACT', 'INA', 'RES', 'DEV', 'RET', 'CUT', 'EXE', 'UFA', 'RFA', 'ERFA',
                            'SUS', 'PUP', 'NFI', 'TRD', 'TRT'))
REPORT_STATUSES = frozenset(('Out', 'Doubtful', 'Questionable', 'Probable'))
PRACTICE_STATUSES = frozenset(('Did Not Participate In Practice', 'Limited Participation in Practice',
                             'Full Participation in Practice'))


class NoEligibleSnapshotError(FileNotFoundError):
    """No observed receipt exists at the cutoff; distinct from missing/corrupt evidence."""


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def utc_now():
    return dt.datetime.now(dt.timezone.utc)


def path_for(name):
    if not isinstance(name, str):
        raise ValueError('Evidence filename must be a string.')
    path = (DATA_DIR / name).resolve()
    if not path.is_relative_to(DATA_DIR.resolve()):
        raise ValueError('Current-source evidence must stay in .local/replay-data.')
    return path


def write_once(path, data):
    core.immutable_write(path, data)


def source_url(source):
    if not isinstance(source, str) or source not in SOURCES:
        raise ValueError('Unsupported current source.')
    return f"https://github.com/nflverse/nflverse-data/releases/download/{source}/{SOURCES[source]['filename']}"


def metadata_url(source):
    source_url(source)
    return f'https://api.github.com/repos/nflverse/nflverse-data/releases/tags/{source}'


def get_public(url, maximum):
    allowed = {source_url(s) for s in SOURCES} | {metadata_url(s) for s in SOURCES}
    if url not in allowed:
        raise ValueError('Only explicit public current-source URLs are allowed.')
    request = urllib.request.Request(url, headers={'User-Agent': 'GuessTheLine-current-source-audit/1'})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read(maximum + 1)
    if len(raw) > maximum:
        raise ValueError('Public response exceeds its size bound.')
    return raw


def release_asset(metadata, source):
    url = source_url(source)
    if not isinstance(metadata, bytes) or len(metadata) > MAX_METADATA_BYTES:
        raise ValueError('Exact bounded release metadata bytes are required.')
    release = json.loads(metadata)
    if (not isinstance(release, dict) or release.get('tag_name') != source
            or not isinstance(release.get('assets'), list)
            or any(not isinstance(a, dict) for a in release['assets'])):
        raise ValueError('Invalid release metadata schema or identity.')
    assets = [a for a in release['assets'] if a.get('browser_download_url') == url]
    if len(assets) != 1:
        raise ValueError('Missing or ambiguous allowlisted asset.')
    asset = assets[0]
    if (type(asset.get('id')) is not int or asset['id'] <= 0
            or type(asset.get('size')) is not int or not 0 < asset['size'] <= MAX_DOWNLOAD_BYTES
            or not isinstance(asset.get('digest'), str)
            or not re.fullmatch(r'sha256:[0-9a-f]{64}', asset['digest'])
            or not isinstance(asset.get('updated_at'), str)):
        raise ValueError('Invalid asset integrity fields.')
    core.timestamp(asset['updated_at'])
    return asset


def csv_reader(raw, source):
    source_url(source)
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_DOWNLOAD_BYTES:
        raise ValueError('Invalid or oversized source bytes.')
    if raw.startswith(b'\x1f\x8b'):
        with gzip.GzipFile(fileobj=io.BytesIO(raw)) as stream:
            data = stream.read(MAX_CSV_BYTES + 1)
    else:
        data = raw
    if len(data) > MAX_CSV_BYTES:
        raise ValueError('Decompressed source exceeds its size bound.')
    text = data.decode('utf-8-sig')
    if text.lstrip().startswith('<'):
        raise ValueError('Expected CSV, received HTML.')
    reader = csv.DictReader(io.StringIO(text), strict=True)
    headers = reader.fieldnames or []
    if len(headers) != len(set(headers)):
        raise ValueError('Duplicate CSV headers.')
    missing = set(SOURCES[source]['fields']) - set(headers)
    if missing:
        raise ValueError('Missing required CSV fields: ' + ', '.join(sorted(missing)))
    return reader, headers


def validated_rows(reader):
    count = 0
    for row in reader:
        count += 1
        if count > MAX_ROWS:
            raise ValueError('Source row limit exceeded.')
        if None in row or any(value is None for value in row.values()):
            raise ValueError('Malformed CSV row width.')
        yield row
    if not count:
        raise ValueError('Empty source dataset.')


def validate_receipt(receipt, source, as_of):
    as_of = core.timestamp(as_of)
    if as_of.year < SEASON:
        raise ValueError('Future season cannot be used at this cutoff.')
    if not isinstance(receipt, dict):
        raise ValueError('Receipt must be a JSON object.')
    if (receipt.get('version') != VERSION or receipt.get('source') != source
            or type(receipt.get('season')) is not int or receipt['season'] != SEASON
            or receipt.get('url') != source_url(source) or receipt.get('scope') != RIGHTS['scope']):
        raise ValueError('Invalid receipt source, season or scope.')
    for key in ('sha256', 'metadataSha256'):
        if not isinstance(receipt.get(key), str) or not re.fullmatch(r'[0-9a-f]{64}', receipt[key]):
            raise ValueError(f'Invalid receipt {key}.')
    if (type(receipt.get('bytes')) is not int or not 0 < receipt['bytes'] <= MAX_DOWNLOAD_BYTES
            or type(receipt.get('assetId')) is not int or receipt['assetId'] <= 0):
        raise ValueError('Invalid receipt size or asset ID.')
    for key in ('assetUpdatedAt', 'firstObservedAt', 'retrievedAt'):
        if not isinstance(receipt.get(key), str):
            raise ValueError('Receipt timestamp strings are required.')
    updated, observed, retrieved = (core.timestamp(receipt[k]) for k in ('assetUpdatedAt', 'firstObservedAt', 'retrievedAt'))
    # Conservative per-receipt observation. Earlier unreceipted cache files prove no available-at time.
    if updated > retrieved or observed != retrieved:
        raise ValueError('Invalid or backdated receipt observation time.')
    if any(key not in receipt or receipt[key] is not None for key in ('publishedAt', 'revisionAt', 'coverageAsOf')):
        raise ValueError('Original publication/revision/coverage time must remain unknown.')
    expected_id = 'current:' + sha256(canonical({k: v for k, v in receipt.items() if k != 'id'}))
    if receipt.get('id') != expected_id:
        raise ValueError('Receipt content hash/ID mismatch.')
    return retrieved


def verify_snapshot(raw, receipt, metadata, source, as_of):
    retrieved = validate_receipt(receipt, source, as_of)
    if retrieved > core.timestamp(as_of):
        raise ValueError('Snapshot was observed after the requested cutoff.')
    if not isinstance(raw, bytes) or len(raw) != receipt['bytes'] or sha256(raw) != receipt['sha256']:
        raise ValueError('Source bytes do not match receipt hash/size.')
    if not isinstance(metadata, bytes) or sha256(metadata) != receipt['metadataSha256']:
        raise ValueError('Exact metadata hash does not match receipt.')
    asset = release_asset(metadata, source)
    if any(asset[k] != value for k, value in {'id': receipt['assetId'], 'size': receipt['bytes'],
            'updated_at': receipt['assetUpdatedAt'], 'digest': 'sha256:' + receipt['sha256']}.items()):
        raise ValueError('Release asset does not match receipt.')


def capture_snapshot(source, raw, metadata):
    """Record a new conservative local observation; never import old file mtimes as history."""
    observed = core.timestamp(utc_now())
    asset = release_asset(metadata, source)
    if (not isinstance(raw, bytes) or len(raw) != asset['size']
            or 'sha256:' + sha256(raw) != asset['digest']):
        raise ValueError('Downloaded/cached source differs from pinned asset bytes.')
    reader, _ = csv_reader(raw, source)
    for _ in validated_rows(reader):
        pass  # Validate the bounded structure before persisting a receipt.
    receipt = {'version': VERSION, 'source': source, 'season': SEASON, 'url': source_url(source),
               'sha256': sha256(raw), 'bytes': len(raw), 'metadataSha256': sha256(metadata),
               'assetId': asset['id'], 'assetUpdatedAt': asset['updated_at'], 'publishedAt': None,
               'revisionAt': None, 'coverageAsOf': None, 'firstObservedAt': observed.isoformat(),
               'retrievedAt': observed.isoformat(), 'scope': RIGHTS['scope']}
    receipt['id'] = 'current:' + sha256(canonical(receipt))
    verify_snapshot(raw, receipt, metadata, source, observed)
    write_once(path_for(receipt['sha256'] + '-' + SOURCES[source]['filename']), raw)
    write_once(path_for(receipt['metadataSha256'] + '-' + source + '-metadata.json'), metadata)
    encoded = canonical(receipt)
    write_once(path_for('current-' + sha256(encoded) + '-receipt.json'), encoded)
    return raw, receipt, metadata


def fetch_source(source):
    metadata = get_public(metadata_url(source), MAX_METADATA_BYTES)
    asset = release_asset(metadata, source)
    return capture_snapshot(source, get_public(source_url(source), asset['size']), metadata)


def capture_cached(source):
    """Register only cache bytes whose hashes match exact public release metadata."""
    source_url(source)
    candidates = []
    for path in DATA_DIR.glob('*-' + source + '-metadata.json'):
        if path.stat().st_size > MAX_METADATA_BYTES:
            raise ValueError('Oversized cached metadata.')
        metadata = path.read_bytes()
        asset = release_asset(metadata, source)
        name = asset['digest'][7:] + '-' + SOURCES[source]['filename']
        raw_path = path_for(name)
        if raw_path.exists():
            candidates.append((core.timestamp(asset['updated_at']), sha256(metadata), metadata, raw_path))
    if not candidates:
        raise ValueError('No matching cached asset and release metadata.')
    _, _, metadata, raw_path = max(candidates, key=lambda x: (x[0], x[1]))
    if raw_path.stat().st_size > MAX_DOWNLOAD_BYTES:
        raise ValueError('Oversized cached source.')
    return capture_snapshot(source, raw_path.read_bytes(), metadata)


def load_snapshot(source, as_of):
    """Latest eligible verified receipt; corruption never silently falls back to older data."""
    source_url(source); as_of = core.timestamp(as_of)
    candidates = []
    for path in DATA_DIR.glob('current-*-receipt.json'):
        if path.stat().st_size > 20_000:
            raise ValueError('Oversized current-source receipt.')
        raw_receipt = path.read_bytes()
        if path.name != 'current-' + sha256(raw_receipt) + '-receipt.json':
            raise ValueError('Receipt filename/content hash mismatch.')
        receipt = json.loads(raw_receipt)
        if not isinstance(receipt, dict) or not isinstance(receipt.get('source'), str):
            raise ValueError('Invalid current-source receipt schema.')
        retrieved = validate_receipt(receipt, receipt['source'], as_of)
        if receipt['source'] == source and retrieved <= as_of:
            candidates.append(receipt)
    if not candidates:
        raise NoEligibleSnapshotError('No eligible current-source snapshot for ' + source)
    receipt = max(candidates, key=lambda x: (core.timestamp(x['retrievedAt']), x['id']))
    raw_path = path_for(receipt['sha256'] + '-' + SOURCES[source]['filename'])
    meta_path = path_for(receipt['metadataSha256'] + '-' + source + '-metadata.json')
    if raw_path.stat().st_size > MAX_DOWNLOAD_BYTES or meta_path.stat().st_size > MAX_METADATA_BYTES:
        raise ValueError('Cached source or metadata exceeds size bound.')
    raw, metadata = raw_path.read_bytes(), meta_path.read_bytes()
    verify_snapshot(raw, receipt, metadata, source, as_of)
    return raw, receipt, metadata


def nullable_status(value, allowed, key):
    if value in NULLS:
        return None
    if value not in allowed:
        raise ValueError('unknown_' + key)
    return value


def short_text(value, key, limit=100):
    if not value.strip() or len(value) > limit or any(ord(c) < 32 for c in value):
        raise ValueError('invalid_' + key)
    return value


def normalize(raw, source, as_of):
    """Allowlisted factual rows. Depth exports latest provider snapshot PER TEAM only."""
    as_of = core.timestamp(as_of)
    if as_of.year < SEASON:
        raise ValueError('Future season cannot be normalized at this cutoff.')
    reader, headers = csv_reader(raw, source)
    rows_by_key, invalid_keys, latest = {}, set(), {}
    if source == 'depth_charts':
        # Determine each team's snapshot before validating individual identities.
        # This avoids silently filling a broken current chart with older rows and
        # makes both retained rows and rejection counts independent of file order.
        for row in validated_rows(reader):
            try:
                row_team, stamp = core.team(row['team']), core.timestamp(row['dt'])
                if stamp.year == SEASON and stamp <= as_of:
                    latest[row_team] = max(latest.get(row_team, stamp), stamp)
            except (ValueError, TypeError):
                pass  # The second pass reports the exact rejection.
        reader, _ = csv_reader(raw, source)
    rejected, rejected_teams, omitted = Counter(), Counter(), Counter()
    missing = Counter(); raw_count = 0
    for row in validated_rows(reader):
        raw_count += 1
        row_team = row.get('team') or 'unknown'
        try:
            normalized_team = core.team(row['team'])
            row_team = normalized_team
            out = {'season': SEASON, 'team': normalized_team}
            if source == 'depth_charts':
                stamp = core.timestamp(row['dt'])
                if stamp.year != SEASON or stamp > as_of:
                    raise ValueError('future_or_wrong_season_depth_timestamp')
                if stamp < latest[normalized_team]:
                    omitted['older_depth_snapshot'] += 1
                    continue
                out.update(dt=stamp.isoformat(), player_name=short_text(row['player_name'], 'player_name'),
                           pos_grp=short_text(row['pos_grp'], 'pos_grp', 50),
                           pos_abb=short_text(row['pos_abb'], 'pos_abb', 8))
                for key in ('pos_grp_id', 'pos_id', 'pos_slot', 'pos_rank'):
                    out[key] = core.number(row[key], key, 0 if key.endswith('_id') else 1, 100)
                out['gsis_id'] = core.player_id(row['gsis_id'])
                key = (normalized_team, out['dt'], out['gsis_id'], out['pos_grp_id'], out['pos_id'], out['pos_slot'])
            else:
                out.update(season=core.number(row['season'], 'season', SEASON, SEASON),
                           week=core.number(row['week'], 'week', 1, 22), game_type=row['game_type'],
                           gsis_id=core.player_id(row['gsis_id']), full_name=short_text(row['full_name'], 'full_name'),
                           position=short_text(row['position'], 'position', 8))
                if out['game_type'] not in ('REG', 'POST', 'WC', 'DIV', 'CON', 'SB'):
                    raise ValueError('unsupported_game_type')
                if source == 'weekly_rosters':
                    out['status'] = nullable_status(row['status'], ROSTER_STATUSES, 'roster_status')
                else:
                    out['report_status'] = nullable_status(row['report_status'], REPORT_STATUSES, 'report_status')
                    out['practice_status'] = nullable_status(row['practice_status'], PRACTICE_STATUSES, 'practice_status')
                key = (normalized_team, out['season'], out['week'], out['game_type'], out['gsis_id'])
            if key in invalid_keys:
                raise ValueError('duplicate_identity')
            if key in rows_by_key:
                # Do not choose an arbitrary first conflicting status or role.
                del rows_by_key[key]; invalid_keys.add(key)
                rejected['duplicate_identity'] += 1; rejected_teams[normalized_team] += 1
                raise ValueError('duplicate_identity')
            rows_by_key[key] = out
        except (ValueError, TypeError) as error:
            reason = str(error)
            rejected[reason] += 1; rejected_teams[row_team] += 1
            if row.get('gsis_id') in NULLS:
                missing['gsis_id'] += 1
    records = sorted(rows_by_key.values(), key=lambda row: canonical(row))
    for row in records:
        missing.update(key for key, value in row.items() if value is None)
    expected = set(SOURCES[source]['fields']) | KNOWN_EXCLUDED[source]
    extra = sorted(set(headers) - expected)
    team_weeks = {}
    for row in records:
        if 'week' in row:
            team_weeks.setdefault(row['team'], Counter())[str(row['week'])] += 1
    coverage = {'rawRows': raw_count, 'acceptedRows': len(records), 'rejectedRows': sum(rejected.values()),
                'rejections': dict(sorted(rejected.items())), 'rejectedByTeam': dict(sorted(rejected_teams.items())),
                'omissions': dict(sorted(omitted.items())), 'missingValues': dict(sorted(missing.items())),
                'rowsByTeam': dict(sorted(Counter(row['team'] for row in records).items())),
                'rowsByWeek': dict(sorted(Counter(str(row['week']) for row in records if 'week' in row).items())),
                'rowsByTeamWeek': {team: dict(sorted(weeks.items())) for team, weeks in sorted(team_weeks.items())},
                'identityField': 'gsis_id', 'extraSourceFieldsExcluded': sorted(set(headers) - set(SOURCES[source]['fields'])),
                'unexpectedSourceFields': extra, 'schemaDrift': bool(extra),
                'originalPublicationTimestampKnown': False, 'gameDayAvailabilityVerified': False,
                'complete': not rejected and not extra and bool(records),
                'completeMeaning': 'Normalization of the retained source scope only; not expected matchup coverage or availability.',
                'expectedTeamWeekCoverageReconciled': False,
                'latestProviderTimestampByTeam': {team: stamp.isoformat() for team, stamp in sorted(latest.items())}}
    return records, coverage


def audit_current_sources(snapshots, as_of):
    """snapshots maps a known source to (raw bytes, receipt, EXACT metadata bytes)."""
    if not isinstance(snapshots, dict) or set(snapshots) - set(SOURCES):
        raise ValueError('Unexpected current-source snapshot names.')
    as_of = core.timestamp(as_of)
    records, coverage, provenance, statuses = {}, {}, [], {}
    for source in SOURCES:
        if source not in snapshots:
            records[source] = []; coverage[source] = {'unavailableReason': 'No eligible observed snapshot.'}
            statuses[source] = 'unavailable'; continue
        snapshot = snapshots[source]
        if not isinstance(snapshot, (tuple, list)) or len(snapshot) != 3:
            raise ValueError('Raw bytes, receipt and exact metadata are all required.')
        raw, receipt, metadata = snapshot
        verify_snapshot(raw, receipt, metadata, source, as_of)
        rows, source_coverage = normalize(raw, source, as_of)
        records[source], coverage[source] = rows, source_coverage
        statuses[source] = 'available' if rows else 'unavailable'
        provenance.append({**receipt, 'recordsSha256': sha256(canonical(rows))})
    report = {'version': VERSION, 'season': SEASON, 'asOf': as_of.isoformat(),
              'scope': RIGHTS['scope'], 'publishable': False, 'productionReady': False,
              'sourceStatus': statuses, 'coverage': coverage, 'provenance': provenance, 'rights': RIGHTS,
              'limitations': ['ACT is roster membership, not game-day availability. Blank/absent injury status is unknown.',
                  'Injury/designation records are not a final game-day inactive list.',
                  'firstObservedAt is this receipt observation; original publication time and earlier cache availability are unknown.',
                  'Depth dt is a provider snapshot timestamp; only the latest per-team chart is retained, not asserted participation.',
                  'Schema drift, quarantined identities and missing team/week coverage require explicit review.',
                  'No game-day availability, player usage, calibrated model or production publication readiness is established.']}
    return {'records': records, 'report': report}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('fetch', 'cache', 'audit'))
    parser.add_argument('--source', choices=(*SOURCES, 'all'), default='all')
    args = parser.parse_args()
    selected = SOURCES if args.source == 'all' else (args.source,)
    if args.command in ('fetch', 'cache'):
        for source in selected:
            _, receipt, _ = (fetch_source if args.command == 'fetch' else capture_cached)(source)
            print(json.dumps({'source': source, 'sha256': receipt['sha256'], 'firstObservedAt': receipt['firstObservedAt']}))
        return
    now = utc_now(); snapshots = {}
    for source in selected:
        try:
            snapshots[source] = load_snapshot(source, now)
        except NoEligibleSnapshotError:
            pass
    audit = audit_current_sources(snapshots, now)
    encoded = canonical(audit)
    output = path_for('current-audit-' + sha256(encoded)[:16] + '.json')
    write_once(output, encoded)
    print(json.dumps({'path': str(output), 'sha256': sha256(encoded), 'productionReady': False,
                      'counts': {source: len(rows) for source, rows in audit['records'].items()}}))


if __name__ == '__main__':
    main()
