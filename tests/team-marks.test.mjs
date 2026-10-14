import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { approvedTeamLogos, originalTeamBadges, teamMarks, resolveTeamMark, resolveTeamBadge, TEAM_TRADEMARK_NOTICE } from '../web/src/teamLogoRegistry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'web/public');
const allTeams = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' ');
// D-22 badges stay registered; since D-46 they are only the fallback when a team's official logo fails to load.
const badgeTeams = 'ARI ATL BAL BUF CAR CLE DEN DET HOU JAX LV MIA MIN NE NYJ PHI SEA TB TEN'.split(' ');
const sources = JSON.parse(readFileSync(path.join(publicDir, 'team-logos/sources.json'), 'utf8'));
const remaining = JSON.parse(readFileSync(path.join(publicDir, 'team-logos/remaining-sources.json'), 'utf8'));
const notice = 'NFL and team names, logos and marks are trademarks of the NFL and its teams; used here only to identify the teams. No endorsement.';

// Minimal PNG reader: IHDR size and color type, so the transparency check needs no image library.
function pngHeader(bytes) {
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(bytes.subarray(12, 16).toString('latin1'), 'IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bitDepth: bytes[24], colorType: bytes[25] };
}

test('all 32 NFL team codes resolve to their official D-46 logo', () => {
  assert.equal(allTeams.length, 32);
  assert.equal(Object.keys(teamMarks).length, 32);
  assert.deepEqual(Object.keys(approvedTeamLogos).sort(), [...allTeams].sort());
  for (const code of allTeams) {
    const mark = resolveTeamMark(code);
    assert.equal(mark, approvedTeamLogos[code], `${code}: official logo`);
    assert.deepEqual({ ...mark }, {
      src: `/team-logos/${code.toLowerCase()}.png`,
      rightsStatus: 'trademark-identification',
      transparent: true,
      rightsReference: 'docs/TEAM_LOGO_SOURCES.md#official-logos-d-46',
    });
    assert.ok(existsSync(path.join(publicDir, mark.src)), `${code} file missing: ${mark.src}`);
  }
  assert.equal(resolveTeamMark('XYZ'), null);
  assert.equal(resolveTeamMark('constructor'), null);
  assert.equal(TEAM_TRADEMARK_NOTICE, notice);
});

test('aliases keep resolving to the canonical team', () => {
  assert.equal(resolveTeamMark('LA'), approvedTeamLogos.LAR);
  assert.equal(resolveTeamMark('WSH'), approvedTeamLogos.WAS);
  assert.equal(resolveTeamMark('JAC'), approvedTeamLogos.JAX);
  assert.equal(resolveTeamMark(' sea '), approvedTeamLogos.SEA);
  assert.equal(resolveTeamBadge('JAC'), originalTeamBadges.JAX);
  assert.equal(resolveTeamBadge(' sea '), originalTeamBadges.SEA);
});

test('every shipped logo matches its sources.json record: one source, 128px transparent PNG, hashes recorded', () => {
  assert.deepEqual(sources.coverage, { active: 32, totalTeams: 32 });
  assert.equal(sources.sourceIndex.url, 'https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv');
  assert.deepEqual(Object.keys(sources.assets).sort(), [...allTeams].sort());
  for (const code of allTeams) {
    const record = sources.assets[code];
    const mark = approvedTeamLogos[code];
    assert.equal(mark.src, `/team-logos/${record.file}`);
    assert.match(record.sourceUrl, /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/nfl\/500(?:-dark)?\/[a-z]+\.png$/);
    assert.equal(record.sourceIndexRow.team_abbr, code);
    assert.equal(record.sourceIndexRow.column, 'team_logo_espn');
    assert.match(record.original.sha256, /^[0-9a-f]{64}$/);
    assert.equal(record.trademarkNotice, notice);
    assert.equal(record.licensed, false);
    assert.equal(record.transparent, true);
    assert.deepEqual(record.cornerAlpha, [0, 0, 0, 0]);
    const bytes = readFileSync(path.join(publicDir, mark.src));
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, `${code} shipped file changed`);
    const header = pngHeader(bytes);
    assert.deepEqual([header.width, header.height], [record.width, record.height]);
    assert.ok(Math.max(header.width, header.height) === 128, `${code}: shipped at 128px`);
    assert.equal(header.colorType, 6, `${code}: RGBA`);
    // Downscale only: aspect ratio kept.
    assert.ok(Math.abs(header.width / header.height - record.original.width / record.original.height) < 0.02);
  }
  // Every PNG beside the badges directory is a registered logo; no old SVG marks remain.
  const files = readdirSync(path.join(publicDir, 'team-logos')).filter(name => /\.(png|svg|webp)$/.test(name)).sort();
  assert.deepEqual(files, allTeams.map(code => `${code.toLowerCase()}.png`).sort());
  assert.deepEqual(remaining.remainingTeams, []);
  assert.equal(remaining.remainingCount, 0);
});

test('original GTL badges stay registered as the load-failure fallback with the documented rights reference', () => {
  assert.deepEqual(Object.keys(originalTeamBadges).sort(), [...badgeTeams].sort());
  for (const code of badgeTeams) {
    assert.equal(resolveTeamMark(code), approvedTeamLogos[code], `${code}: the official logo takes precedence over the badge`);
    assert.deepEqual({ ...resolveTeamBadge(code) }, {
      src: `/team-logos/badges/${code.toLowerCase()}.svg`,
      rightsStatus: 'original',
      transparent: true,
      rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges',
    });
  }
  for (const code of allTeams.filter(team => !badgeTeams.includes(team))) assert.equal(resolveTeamBadge(code), null);
  assert.equal(resolveTeamBadge('XYZ'), null);
  const doc = readFileSync(path.join(root, 'docs/TEAM_LOGO_SOURCES.md'), 'utf8');
  assert.match(doc, /^## Original badges$/m);
  assert.match(doc, /^## Official logos \(D-46\)$/m);
  assert.ok(doc.includes(notice));
});

test('badge SVGs are small, self-contained, script-free and labelled with their abbreviation', () => {
  for (const code of badgeTeams) {
    const file = path.join(publicDir, 'team-logos/badges', `${code.toLowerCase()}.svg`);
    assert.ok(existsSync(file), `${code} badge missing`);
    assert.ok(statSync(file).size < 2048, `${code} badge is ${statSync(file).size} bytes`);
    const svg = readFileSync(file, 'utf8');
    // Well-formed XML: single <svg> root with balanced tags and no stray markup.
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"[^>]*>[\s\S]*<\/svg>\s*$/);
    const stack = [];
    for (const [, close, name, , selfClosing] of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/g)) {
      if (close) assert.equal(stack.pop(), name, `${code}: mismatched </${name}>`);
      else if (!selfClosing) stack.push(name);
    }
    assert.deepEqual(stack, [], `${code}: unclosed tags`);
    assert.equal(svg.replace(/<[^>]*>/g, '').includes('<'), false);
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|<!ENTITY|<!DOCTYPE|\son\w+=/i);
    assert.doesNotMatch(svg, /(?:href|src)\s*=\s*"(?!#)|url\(\s*['"]?(?:https?:|\/\/|data:)|@import/i);
    assert.match(svg, new RegExp(`<text[^>]*>${code}</text>`));
  }
});

test('badge abbreviation text meets WCAG AA contrast against its fill', () => {
  const luminance = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (const code of badgeTeams) {
    const svg = readFileSync(path.join(publicDir, 'team-logos/badges', `${code.toLowerCase()}.svg`), 'utf8');
    const fills = [...svg.matchAll(/<path d="[^"]+" fill="(#[0-9A-F]{6})"\/>/g)].map(match => match[1]);
    assert.equal(fills.length, 1, `${code}: expected one inner field fill`);
    const ink = svg.match(/<text[^>]* fill="(#[0-9A-F]{6})"/)[1];
    assert.ok(ratio(ink, fills[0]) >= 4.5, `${code}: contrast ${ratio(ink, fills[0]).toFixed(2)}`);
    // Contrasting dark and light outlines keep the shape readable on both themes.
    assert.match(svg, /stroke="#0B1020"/);
    assert.match(svg, /stroke="#F8FAFC"/);
  }
});
