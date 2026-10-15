import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Redesign build plan, stage 7 and section 4.1 ("Never: sample data in web/src"). The approved prototype runs on a
// generated `data.js` with fictional people and leagues. The real app reads only live data, so nothing under
// web/src/next/ may import that file, carry its `DATA` object, or name its sample people and leagues.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NEXT = join(ROOT, 'web/src/next');
const TEXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.css', '.json', '.html', '.md', '.svg', '.txt']);

// The prototype's sample league names and people (and their ids), matched as whole words in any case.
const SAMPLE_NAMES = Object.freeze(['Sunday Crew', 'Office Pool', 'sundayCrew', 'officePool', 'Marcus', 'Priya', 'Jules', 'Kenny', 'Dre', 'Tom']);
const NAME_PATTERN = new RegExp(`\\b(${SAMPLE_NAMES.map(n => n.replace(' ', '\\s+')).join('|')})\\b`, 'gi');
// A module specifier, stylesheet or script path whose file is the prototype's data file (`data.js` itself, not
// `team-data.js` or `week.data.js`).
const DATA_IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|@import\s+(?:url\()?\s*|\bsrc\s*=\s*|\bnew\s+URL\s*\(\s*)['"`]((?:[^'"`]*\/)?data\.js)['"`]/g;
// The prototype's global, or a path into its build folder.
const DATA_GLOBAL = /\b(?:const|let|var)\s+DATA\s*=|\bDATA\s*(?:\.|\[)|\bgen-data\.mjs\b|\bsample-data\.json\b|\bproto\/build\b/g;

/** Every reason a file's text carries the prototype's sample data. */
function sampleDataFindings(text) {
  const found = [];
  for (const m of text.matchAll(DATA_IMPORT)) found.push(`imports the prototype data file (${m[1]})`);
  for (const m of text.matchAll(DATA_GLOBAL)) found.push(`uses the prototype's sample data (${m[0].trim()})`);
  for (const m of text.matchAll(NAME_PATTERN)) found.push(`names a sample person or league (${m[0]})`);
  return found;
}

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

test('the guard catches each way sample data could get in', () => {
  const caught = [
    "import DATA from '../../proto/build/data.js';",
    'import { games } from "./data.js";',
    "const sample = await import('./data.js');",
    "const { people } = require('../data.js');",
    "import 'data.js';",
    '@import url("./styles/../data.js");',
    '<script src="./data.js"></script>',
    "const DATA = { people: [] };",
    'DATA.games.map(g => g.id)',
    "const rows = DATA['boards'];",
    '// copied from proto/build/frag-home.js',
    "export const LEAGUE = 'Sunday Crew';",
    'Office  Pool',
    "{ who: 'marcus' }",
    'Priya placed a bet',
    'JULES',
    "<span>Kenny</span>",
    "const friend = 'Dre';",
    "{ id: 'tom' }",
    "league: 'officePool'",
  ];
  for (const text of caught) assert.ok(sampleDataFindings(text).length > 0, text);
});

test('the guard leaves ordinary code alone', () => {
  const fine = [
    "import { AppData } from './data/AppData.jsx';",
    "import { readMetadata } from './metadata.js';",
    "const data = await response.json();",
    'export const Andre = 1; // a name inside another word is not a sample name',
    "const address = 'Sunday'; const crew = 'Pool';",
    'Tomorrow at 5:15 PM PT',
    "const updatedAt = row.data.updatedAt;",
    // Follow-up to the stage 7 review: a module whose name only ends in "data.js" is not the prototype's file.
    "import { TEAMS } from './team-data.js';",
    "import week from './week.data.js';",
    "const rows = await import('../odds_data.js');",
  ];
  for (const text of fine) assert.deepEqual(sampleDataFindings(text), [], text);
});

test('nothing under web/src/next imports the prototype data.js or names its sample people and leagues', () => {
  const files = filesUnder(NEXT);
  assert.ok(files.length > 0, 'web/src/next has files to check');
  assert.ok(files.some(f => f.endsWith('format.js')), 'the guard reads the stage 7 modules');
  const problems = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    if (basename(file) === 'data.js') problems.push(`${rel}: a file named data.js (name it after what it holds; the prototype's sample file stays out)`);
    if (!TEXT.has(extname(file))) continue;
    for (const finding of sampleDataFindings(readFileSync(file, 'utf8'))) problems.push(`${rel}: ${finding}`);
  }
  assert.deepEqual(problems, []);
});
