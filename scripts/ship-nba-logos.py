#!/usr/bin/env python3
"""Ship the official NBA league mark and the 30 NBA team logos (milestone N1; Sean, November 11, 2026).

The D-46 / November 7 league-mark precedent: each original is fetched once from ESPN's CDN into its own new, empty
directory OUTSIDE the repository (`fetch`), inspected there, and only then downscaled and copied in (`ship`).

  python3 -P scripts/ship-nba-logos.py fetch <empty-dir-outside-repo>
  python3 -P scripts/ship-nba-logos.py ship  <that-dir>

`fetch` writes <dir>/<CODE>/{original,url.txt,fetchedAt.txt} for the 30 teams (codes from shared/nba-teams.mjs) and
<dir>/LEAGUE/... for the league mark. `ship` re-checks every original (PNG signature, RGBA, all four corners fully
transparent), downscales once with Pillow LANCZOS (no recolor, no crop; aspect and alpha kept) to 128 px for team
logos and 144 px for the league mark (the size of the self-hosted NFL shield), and records source URL, source page,
fetch time, both SHA-256 values, sizes, modifications, use and rights in web/public/team-logos/nba/sources.json and
web/src/next/ui/brand-assets/sources.json. Needs Pillow; `fetch` needs network.
"""
import hashlib
import io
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TEAMS_FILE = ROOT / 'shared' / 'nba-teams.mjs'
TEAM_DIR = ROOT / 'web' / 'public' / 'team-logos' / 'nba'
BRAND_DIR = ROOT / 'web' / 'src' / 'next' / 'ui' / 'brand-assets'
TEAM_URL = 'https://a.espncdn.com/i/teamlogos/nba/500/{espn}.png'
LEAGUE_URL = 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png'
TEAM_PAGE = 'https://www.espn.com/nba/teams'
LEAGUE_PAGE = 'https://www.espn.com/nba/'
NOTICE = ('NBA and team names, logos and marks are trademarks of the NBA and its teams; '
          'used here only to identify the teams. No endorsement.')
RIGHTS = 'Third-party trademark; used only to identify the team/league; no affiliation, endorsement or license claimed.'
TEAM_RE = re.compile(r"team\('([A-Z]{3})',\s*'([^']+)',\s*'([a-z]+)'\)")
PNG = b'\x89PNG\r\n\x1a\n'


def read_teams():
    teams = TEAM_RE.findall(TEAMS_FILE.read_text('utf-8'))
    if len(teams) != 30 or len({t[0] for t in teams}) != 30:
        sys.exit(f'expected 30 distinct teams in {TEAMS_FILE}, found {len(teams)}')
    return teams


def inside_repo(path):
    try:
        path.resolve().relative_to(ROOT)
        return True
    except ValueError:
        return False


def fetch(target):
    if inside_repo(target):
        sys.exit('download outside the repository')
    target.mkdir(parents=True, exist_ok=True)
    if any(target.iterdir()):
        sys.exit(f'{target} is not empty')
    jobs = [(code, TEAM_URL.format(espn=espn)) for code, _, espn in read_teams()] + [('LEAGUE', LEAGUE_URL)]
    for code, url in jobs:
        folder = target / code
        folder.mkdir()  # each file in its own new, empty directory
        fetched_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        subprocess.run(['curl', '-sS', '-f', '--connect-timeout', '10', '--max-time', '30', '--max-filesize', '2000000',
                        '-A', 'guess-the-line-logo-fetch/1', '-o', str(folder / 'original'), url], check=True)
        (folder / 'url.txt').write_text(url + '\n', 'utf-8', newline='\n')
        (folder / 'fetchedAt.txt').write_text(fetched_at + '\n', 'utf-8', newline='\n')


def checked(folder):
    raw = (folder / 'original').read_bytes()
    if raw[:8] != PNG:
        sys.exit(f'{folder.name}: not a PNG (rejected)')
    image = Image.open(io.BytesIO(raw))
    image.load()
    if image.format != 'PNG' or image.mode != 'RGBA':
        sys.exit(f'{folder.name}: expected an RGBA PNG, got {image.format} {image.mode}')
    w, h = image.size
    corners = [image.getpixel(xy)[3] for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    if any(corners):
        sys.exit(f'{folder.name}: corners not transparent {corners}')
    url = (folder / 'url.txt').read_text('utf-8').strip()
    fetched_at = (folder / 'fetchedAt.txt').read_text('utf-8').strip()
    return raw, image, corners, url, fetched_at


def downscale(image, target):
    scale = target / max(image.size)
    size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
    buffer = io.BytesIO()
    image.resize(size, Image.LANCZOS).save(buffer, format='PNG', optimize=True)
    return buffer.getvalue(), size


def original_record(raw, image):
    return {'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'width': image.width,
            'height': image.height, 'format': 'PNG', 'mode': 'RGBA'}


def ship(source):
    if inside_repo(source):
        sys.exit('the originals must stay outside the repository')
    TEAM_DIR.mkdir(parents=True, exist_ok=True)
    assets = {}
    for code, name, espn in read_teams():
        raw, image, corners, url, fetched_at = checked(source / code)
        if url != TEAM_URL.format(espn=espn):
            sys.exit(f'{code}: unexpected source {url}')
        data, (width, height) = downscale(image, 128)
        (TEAM_DIR / f'{code}.png').write_bytes(data)
        assets[code] = {
            'team': name, 'file': f'{code}.png', 'sourceUrl': url, 'sourcePage': TEAM_PAGE,
            'sourceIndex': 'shared/nba-teams.mjs', 'sourceIndexRow': {'code': code, 'name': name, 'espn': espn},
            'fetchedAt': fetched_at, 'original': original_record(raw, image),
            'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'width': width, 'height': height,
            'transparent': True, 'cornerAlpha': corners, 'rightsBasis': 'trademark-identification',
            'rights': RIGHTS, 'trademarkNotice': NOTICE, 'licensed': False, 'reviewedAt': '2026-11-11',
            'modifications': 'Downscaled only (Pillow LANCZOS, aspect and alpha kept); no recolor, no crop.',
            'usage': 'Team identification in its own glass circle next to the team name in NBA screens only; '
                     'no endorsement or app-brand use.',
        }
    record = {
        'coverage': {'active': 30, 'totalTeams': 30},
        'decision': 'Sean, November 11, 2026: "Approve badges", corrected to "we need nba logo and team logos not '
                    'letters" (D-85); D-46 logo rule extended to NBA teams',
        'scope': 'Official NBA team logos used only to identify each team next to its name. Trademarks of the NBA and '
                 'its teams; not licensed; no endorsement. Self-hosted downscaled copies of ESPN CDN images for the '
                 'team list in shared/nba-teams.mjs (see docs/TEAM_LOGO_SOURCES.md#nba-team-logos).',
        'assets': assets,
    }
    (TEAM_DIR / 'sources.json').write_text(json.dumps(record, indent=2) + '\n', 'utf-8', newline='\n')

    raw, image, corners, url, fetched_at = checked(source / 'LEAGUE')
    if url != LEAGUE_URL:
        sys.exit(f'LEAGUE: unexpected source {url}')
    data, (width, height) = downscale(image, 144)
    (BRAND_DIR / 'nba.png').write_bytes(data)
    brand_path = BRAND_DIR / 'sources.json'
    brand = json.loads(brand_path.read_text('utf-8'))
    brand['files'] = [entry for entry in brand['files'] if entry.get('file') != 'nba.png']
    brand['files'].append({
        'file': 'nba.png', 'description': 'NBA league logo (logoman)', 'sourceUrl': url, 'sourcePage': LEAGUE_PAGE,
        'retrievedAt': fetched_at, 'original': original_record(raw, image), 'cornerAlpha': corners,
        'sha256': hashlib.sha256(data).hexdigest(), 'mime': 'image/png', 'bytes': len(data),
        'width': width, 'height': height,
        'modifications': 'Downscaled only to 144px (Pillow LANCZOS, aspect and alpha kept); no crop or recolor.',
        'use': 'League identification in its own circular sport control (behind NBA_ON_SWITCH); not GTL branding.',
        'rights': RIGHTS,
    })
    brand_path.write_text(json.dumps(brand, indent=2) + '\n', 'utf-8', newline='\n')


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ('fetch', 'ship'):
        sys.exit(__doc__)
    folder = Path(sys.argv[2])
    fetch(folder) if sys.argv[1] == 'fetch' else ship(folder)


if __name__ == '__main__':
    main()
