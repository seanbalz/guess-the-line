import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { approvedTeamLogos, originalTeamBadges, teamMarks, resolveTeamMark } from '../web/src/teamLogoRegistry.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'web/public');
const allTeams = 'ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LAC LAR LV MIA MIN NE NO NYG NYJ PHI PIT SEA SF TB TEN WAS'.split(' ');
const officialTeams = 'CHI CIN DAL GB IND KC LAC NO NYG PIT SF WAS LAR BUF NYJ'.split(' ');
const badgeTeams = 'ARI ATL BAL BUF CAR CLE DEN DET HOU JAX LV MIA MIN NE NYJ PHI SEA TB TEN'.split(' ');
// BUF and NYJ gained reviewed official marks after their badges were drawn; the badge stays registered as a fallback.
const badgeOnlyTeams = badgeTeams.filter(code => !officialTeams.includes(code));
const sources = JSON.parse(readFileSync(path.join(publicDir, 'team-logos/sources.json'), 'utf8'));

test('all 32 NFL team codes resolve to a local team mark', () => {
  assert.equal(allTeams.length, 32);
  assert.equal(Object.keys(teamMarks).length, 32);
  for (const code of allTeams) {
    const mark = resolveTeamMark(code);
    assert.ok(mark, `${code} has no mark`);
    assert.ok(existsSync(path.join(publicDir, mark.src)), `${code} file missing: ${mark.src}`);
    assert.equal(mark.transparent, true);
  }
  assert.equal(resolveTeamMark('XYZ'), null);
  assert.equal(resolveTeamMark('constructor'), null);
});

test('aliases keep resolving to the canonical team', () => {
  assert.equal(resolveTeamMark('LA'), approvedTeamLogos.LAR);
  assert.equal(resolveTeamMark('WSH'), approvedTeamLogos.WAS);
  assert.equal(resolveTeamMark('JAC'), originalTeamBadges.JAX);
  assert.equal(resolveTeamMark(' sea '), originalTeamBadges.SEA);
});

test('official reviewed marks take precedence and stay byte-identical to their recorded sources', () => {
  assert.deepEqual(Object.keys(approvedTeamLogos).sort(), [...officialTeams].sort());
  for (const code of officialTeams) {
    const mark = resolveTeamMark(code);
    assert.equal(mark, approvedTeamLogos[code]);
    assert.equal(mark.rightsStatus, 'approved');
    assert.equal(mark.rightsReference, `docs/TEAM_LOGO_SOURCES.md#${code.toLowerCase()}`);
    const record = sources.assets[code];
    assert.ok(record, `${code} missing from sources.json`);
    assert.equal(mark.src, `/team-logos/${record.file}`);
    const bytes = readFileSync(path.join(publicDir, mark.src));
    assert.equal(bytes.length, record.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256, `${code} official file changed`);
  }
});

test('the 17 teams without an official mark use original GTL badges with the documented rights reference', () => {
  assert.deepEqual(Object.keys(originalTeamBadges).sort(), [...badgeTeams].sort());
  assert.equal(badgeOnlyTeams.length, 17);
  for (const code of badgeTeams.filter(team => officialTeams.includes(team))) {
    assert.equal(resolveTeamMark(code), approvedTeamLogos[code], `${code}: the official mark takes precedence over the badge`);
    assert.equal(originalTeamBadges[code].src, `/team-logos/badges/${code.toLowerCase()}.svg`);
  }
  for (const code of badgeOnlyTeams) {
    assert.equal(approvedTeamLogos[code], undefined);
    const mark = resolveTeamMark(code);
    assert.deepEqual({ ...mark }, {
      src: `/team-logos/badges/${code.toLowerCase()}.svg`,
      rightsStatus: 'original',
      transparent: true,
      rightsReference: 'docs/TEAM_LOGO_SOURCES.md#original-badges',
    });
  }
  const doc = readFileSync(path.join(root, 'docs/TEAM_LOGO_SOURCES.md'), 'utf8');
  assert.match(doc, /^## Original badges$/m);
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
