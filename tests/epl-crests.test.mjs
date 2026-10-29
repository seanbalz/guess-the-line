import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { EPL_CLUBS } from '../shared/epl-clubs.mjs';
import { resolveClubCrest, resolveTeamMark, EPL_TRADEMARK_NOTICE } from '../web/src/teamLogoRegistry.js';

// EPL crests (plan 2026-10-28-epl-pick-a-team.md, Task 6): the D-46 logo rule extended to the 20 Premier League clubs.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'web/public');
const crestDir = path.join(publicDir, 'team-logos/epl');
const notice = 'Premier League and club names, crests and marks are trademarks of their owners; used here only to identify the clubs. No endorsement.';
const expectedClubs = [
  ['BOU', 349], ['ARS', 359], ['AVL', 362], ['BRE', 337], ['BHA', 331], ['CHE', 363], ['COV', 388], ['CRY', 384], ['EVE', 368], ['FUL', 370],
  ['HUL', 306], ['IPS', 373], ['LEE', 357], ['LIV', 364], ['MNC', 382], ['MUN', 360], ['NEW', 361], ['NFO', 393], ['SUN', 366], ['TOT', 367],
];
const readSources = () => JSON.parse(readFileSync(path.join(crestDir, 'sources.json'), 'utf8'));

function pngHeader(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.subarray(12, 16).toString('latin1'), 'IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), colorType: bytes[25] };
}

test('the club list is the 20 clubs of 2026-27 with their ESPN ids', () => {
  assert.deepEqual(EPL_CLUBS.map(c => [c.code, c.espnId]), expectedClubs);
});

test('every club has a sources.json record and a shipped 128px PNG whose hash matches it', () => {
  const sources = readSources();
  assert.deepEqual(sources.coverage, { active: 20, totalClubs: 20 });
  assert.deepEqual(Object.keys(sources.assets).sort(), EPL_CLUBS.map(c => c.code).sort());
  for (const club of EPL_CLUBS) {
    const record = sources.assets[club.code];
    assert.ok(record, `${club.code}: no sources.json entry`);
    assert.equal(record.team, club.name);
    assert.equal(record.file, `${club.code}.png`);
    assert.equal(record.sourceUrl, `https://a.espncdn.com/i/teamlogos/soccer/500/${club.espnId}.png`);
    assert.deepEqual(record.sourceIndexRow, { code: club.code, name: club.name, espnId: club.espnId });
    assert.match(record.fetchedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    assert.match(record.original.sha256, /^[0-9a-f]{64}$/);
    assert.ok(record.original.bytes > 0);
    assert.equal(record.original.format, 'PNG');
    assert.equal(record.rightsBasis, 'trademark-identification');
    assert.equal(record.licensed, false);
    assert.equal(record.trademarkNotice, notice);
    assert.equal(record.transparent, true, `${club.code}: transparent original`);
    assert.deepEqual(record.cornerAlpha, [0, 0, 0, 0]);
    const file = path.join(crestDir, record.file);
    assert.ok(existsSync(file), `${club.code}: ${record.file} missing`);
    const bytes = readFileSync(file);
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, `${club.code}: shipped file changed`);
    const header = pngHeader(bytes);
    assert.deepEqual([header.width, header.height], [record.width, record.height]);
    assert.equal(Math.max(header.width, header.height), 128, `${club.code}: 128px on its long side`);
    assert.equal(header.colorType, 6, `${club.code}: RGBA`);
    assert.ok(Math.abs(header.width / header.height - record.original.width / record.original.height) < 0.02, `${club.code}: aspect kept`);
  }
  // Only registered crests ship in the directory.
  const pngs = readdirSync(crestDir).filter(name => /\.(png|svg|webp)$/.test(name)).sort();
  assert.deepEqual(pngs, EPL_CLUBS.map(c => `${c.code}.png`).sort());
});

test('resolveClubCrest returns the self-hosted crest and alt text, or null', () => {
  for (const club of EPL_CLUBS) {
    const crest = resolveClubCrest(club.code);
    assert.deepEqual(crest, { src: `/team-logos/epl/${club.code}.png`, alt: `${club.name} crest` });
    assert.ok(existsSync(path.join(publicDir, crest.src)));
  }
  assert.deepEqual(resolveClubCrest(' che '), resolveClubCrest('CHE'));
  for (const bad of ['XYZ', 'constructor', '__proto__', '', null, undefined, 42, {}]) assert.equal(resolveClubCrest(bad), null);
  assert.ok(Object.isFrozen(resolveClubCrest('ARS')));
  // EPL codes never leak into the NFL team mark lookup.
  assert.equal(resolveTeamMark('MUN'), null);
});

test('the EPL trademark notice is exported, on the Terms page and in the source register', () => {
  assert.equal(EPL_TRADEMARK_NOTICE, notice);
  const terms = readFileSync(path.join(publicDir, 'terms.html'), 'utf8');
  assert.ok(terms.includes(notice), 'terms.html carries the EPL notice');
  const doc = readFileSync(path.join(root, 'docs/TEAM_LOGO_SOURCES.md'), 'utf8');
  assert.match(doc, /^## Premier League crests$/m);
  assert.ok(doc.includes(notice));
  const sources = readSources();
  for (const club of EPL_CLUBS) assert.ok(doc.includes(sources.assets[club.code].sha256), `${club.code}: shipped hash in the register`);
});
