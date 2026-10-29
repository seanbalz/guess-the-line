#!/usr/bin/env python3
"""One-time fetch of the 20 Premier League crests (plan 2026-10-28-epl-pick-a-team.md, Task 6).

The D-46 logo rule extended to EPL clubs: each crest is fetched once from ESPN's CDN, checked (PNG, RGBA, transparent
corners), downscaled once with Pillow LANCZOS to 128 px on its longer side (aspect and alpha kept; no recolor, no crop),
self-hosted under web/public/team-logos/epl/<CODE>.png and recorded with SHA-256 before and after in
web/public/team-logos/epl/sources.json. The club list (code, name, ESPN id) is read from shared/epl-clubs.mjs.

Usage: python3 scripts/fetch-epl-crests.py   (needs network and Pillow; run again only when the club list changes)
"""
import hashlib
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CLUBS_FILE = ROOT / 'shared' / 'epl-clubs.mjs'
OUT_DIR = ROOT / 'web' / 'public' / 'team-logos' / 'epl'
SOURCE_URL = 'https://a.espncdn.com/i/teamlogos/soccer/500/{espn_id}.png'
TARGET = 128
NOTICE = ('Premier League and club names, crests and marks are trademarks of their owners; '
          'used here only to identify the clubs. No endorsement.')
CLUB_RE = re.compile(r"club\('([A-Z]{3})',\s*'([^']+)',\s*(\d+),")


def read_clubs():
    clubs = [(code, name, int(espn_id)) for code, name, espn_id in CLUB_RE.findall(CLUBS_FILE.read_text('utf-8'))]
    if len(clubs) != 20 or len({c[0] for c in clubs}) != 20:
        sys.exit(f'expected 20 distinct clubs in {CLUBS_FILE}, found {len(clubs)}')
    return clubs


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'guess-the-line-crest-fetch/1'})
    with urllib.request.urlopen(request, timeout=30) as response:
        if response.status != 200:
            sys.exit(f'{url}: HTTP {response.status}')
        return response.read()


def corner_alpha(image):
    w, h = image.size
    return [image.getpixel(xy)[3] for xy in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    assets = {}
    for code, name, espn_id in read_clubs():
        url = SOURCE_URL.format(espn_id=espn_id)
        fetched_at = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
        raw = fetch(url)
        original = Image.open(io.BytesIO(raw))
        original.load()
        if original.format != 'PNG' or original.mode != 'RGBA':
            sys.exit(f'{code}: expected an RGBA PNG, got {original.format} {original.mode}')
        corners = corner_alpha(original)
        if any(corners):
            sys.exit(f'{code}: corners not transparent {corners}')
        scale = TARGET / max(original.size)
        size = (max(1, round(original.width * scale)), max(1, round(original.height * scale)))
        shipped = original.resize(size, Image.LANCZOS)
        buffer = io.BytesIO()
        shipped.save(buffer, format='PNG', optimize=True)
        data = buffer.getvalue()
        file_name = f'{code}.png'
        (OUT_DIR / file_name).write_bytes(data)
        assets[code] = {
            'team': name,
            'file': file_name,
            'sourceUrl': url,
            'sourceIndex': 'shared/epl-clubs.mjs',
            'sourceIndexRow': {'code': code, 'name': name, 'espnId': espn_id},
            'fetchedAt': fetched_at,
            'original': {
                'sha256': hashlib.sha256(raw).hexdigest(),
                'bytes': len(raw),
                'width': original.width,
                'height': original.height,
                'format': original.format,
                'mode': original.mode,
            },
            'sha256': hashlib.sha256(data).hexdigest(),
            'bytes': len(data),
            'width': shipped.width,
            'height': shipped.height,
            'transparent': True,
            'cornerAlpha': corner_alpha(shipped),
            'rightsBasis': 'trademark-identification',
            'trademarkNotice': NOTICE,
            'licensed': False,
            'reviewedAt': fetched_at[:10],
            'modifications': 'Downscaled only (Pillow LANCZOS, aspect and alpha kept); no recolor, no crop.',
            'usage': 'Small club-identification crests shown next to the club name in Pick a Team and EPL data displays only; '
                     'no endorsement or app-brand use.',
        }
        print(f'{code} {name}: {original.width}x{original.height} {len(raw)} B -> {shipped.width}x{shipped.height} {len(data)} B')
    record = {
        'coverage': {'active': len(assets), 'totalClubs': 20},
        'decision': 'Plan 2026-10-28-epl-pick-a-team.md Task 6; D-46 logo rule extended to Premier League crests (spec section 8)',
        'scope': 'Premier League club crests used only to identify each club next to its name. Trademarks of their owners; '
                 'not licensed; no endorsement. Self-hosted downscaled copies of ESPN CDN images for the club list in '
                 'shared/epl-clubs.mjs (see docs/TEAM_LOGO_SOURCES.md#premier-league-crests).',
        'assets': assets,
    }
    (OUT_DIR / 'sources.json').write_text(json.dumps(record, indent=2) + '\n', 'utf-8')


if __name__ == '__main__':
    main()
