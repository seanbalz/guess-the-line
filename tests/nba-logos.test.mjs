import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { NBA_TEAMS, nbaTeam } from '../shared/nba-teams.mjs';
import { NBA_TRADEMARK_NOTICE, resolveNbaTeamLogo, resolveTeamMark } from '../web/src/teamLogoRegistry.js';

// D-85 (Sean, November 11, 2026): official NBA league and team logos, self-hosted under the D-46 rule.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logoDir = path.join(root, 'web/public/team-logos/nba');
const notice = 'NBA and team names, logos and marks are trademarks of the NBA and its teams; used here only to identify the teams. No endorsement.';
const rights = 'Third-party trademark; used only to identify the team/league; no affiliation, endorsement or license claimed.';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function png(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.subarray(12, 16).toString('latin1'), 'IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

test('contract: the NBA team list is 30 distinct teams with league-keyed lookup', () => {
  assert.equal(NBA_TEAMS.length, 30);
  assert.equal(new Set(NBA_TEAMS.map(team => team.code)).size, 30);
  assert.equal(nbaTeam(' phi ').name, 'Philadelphia 76ers');
  assert.equal(nbaTeam('SEA'), null);
  assert.equal(NBA_TRADEMARK_NOTICE, notice);
  for (const { code } of NBA_TEAMS) assert.equal(resolveNbaTeamLogo(code).src, `/team-logos/nba/${code}.png`);
  // The NFL lookup is untouched: PHI is still the Eagles there.
  assert.equal(resolveTeamMark('PHI').src, '/team-logos/phi.png');
});

test('contract: every NBA logo has a sources.json record and a shipped transparent 128px PNG whose hash matches it', () => {
  const sources = JSON.parse(readFileSync(path.join(logoDir, 'sources.json'), 'utf8'));
  assert.deepEqual(sources.coverage, { active: 30, totalTeams: 30 });
  assert.deepEqual(Object.keys(sources.assets).sort(), NBA_TEAMS.map(team => team.code).sort());
  assert.deepEqual(readdirSync(logoDir).sort(), [...NBA_TEAMS.map(team => `${team.code}.png`), 'sources.json'].sort());
  for (const team of NBA_TEAMS) {
    const record = sources.assets[team.code];
    assert.equal(record.team, team.name);
    assert.equal(record.file, `${team.code}.png`);
    assert.equal(record.sourceUrl, `https://a.espncdn.com/i/teamlogos/nba/500/${team.espn}.png`);
    assert.equal(record.sourcePage, 'https://www.espn.com/nba/teams');
    assert.deepEqual(record.sourceIndexRow, { code: team.code, name: team.name, espn: team.espn });
    assert.match(record.fetchedAt, /^2026-11-11T\d{2}:\d{2}:\d{2}Z$/);
    assert.match(record.original.sha256, /^[0-9a-f]{64}$/);
    assert.equal(record.original.format, 'PNG');
    assert.equal(record.original.mode, 'RGBA');
    assert.equal(record.rightsBasis, 'trademark-identification');
    assert.equal(record.rights, rights);
    assert.equal(record.trademarkNotice, notice);
    assert.equal(record.licensed, false);
    assert.equal(record.transparent, true);
    assert.deepEqual(record.cornerAlpha, [0, 0, 0, 0]);
    assert.match(record.modifications, /no recolor, no crop/);
    const bytes = readFileSync(path.join(logoDir, record.file));
    assert.equal(bytes.length, record.bytes);
    assert.equal(sha(bytes), record.sha256, `${team.code}: shipped file changed`);
    const header = png(bytes);
    assert.deepEqual([header.width, header.height], [record.width, record.height]);
    assert.equal(Math.max(header.width, header.height), 128, `${team.code}: 128px on its long side`);
    assert.equal(header.colorType, 6, `${team.code}: RGBA`);
  }
});

test('contract: the official NBA league mark is self-hosted beside the NFL and Premier League marks, with its record', () => {
  const brandDir = path.join(root, 'web/src/next/ui/brand-assets');
  const sources = JSON.parse(readFileSync(path.join(brandDir, 'sources.json'), 'utf8'));
  const record = sources.files.find(entry => entry.file === 'nba.png');
  assert.ok(record, 'nba.png recorded');
  assert.equal(record.sourceUrl, 'https://a.espncdn.com/i/teamlogos/leagues/500/nba.png');
  assert.match(record.retrievedAt, /^2026-11-11T/);
  assert.equal(record.rights, rights);
  assert.deepEqual(record.cornerAlpha, [0, 0, 0, 0]);
  const bytes = readFileSync(path.join(brandDir, 'nba.png'));
  assert.equal(sha(bytes), record.sha256);
  assert.equal(bytes.length, record.bytes);
  const header = png(bytes);
  assert.deepEqual([header.width, header.height, header.colorType], [144, 144, 6]);
  // The earlier marks' records are unchanged.
  assert.deepEqual(sources.files.map(entry => entry.file), ['nfl.png', 'premier-league-white.svg', 'premier-league-purple.svg', 'lime.svg', 'light-deep-green.svg', 'nba.png']);
});

test('contract: the register, Terms page and source records name the NBA trademark notice', () => {
  const register = readFileSync(path.join(root, 'docs/TEAM_LOGO_SOURCES.md'), 'utf8');
  assert.match(register, /^## NBA team logos$/m);
  for (const team of NBA_TEAMS) assert.ok(register.includes(`| ${team.code} | ${team.name} | \`${team.code}.png\``), team.code);
  assert.ok(register.includes(notice));
  assert.ok(readFileSync(path.join(root, 'web/public/terms.html'), 'utf8').includes(notice));
  assert.ok(existsSync(path.join(root, 'scripts/ship-nba-logos.py')));
});
