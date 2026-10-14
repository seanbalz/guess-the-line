// Redesign stage 5: every one of the 191 inventory rows has a planned home (D-23), and every stage the
// home table names exists in docs/REDESIGN_BUILD_PLAN.md and was not dropped by D-39.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const plan = read('docs/REDESIGN_BUILD_PLAN.md');
const homesDoc = read('docs/redesign/INVENTORY_HOMES.md');

const INVENTORY_ROWS = 191;
const PLAN_STAGES = 81;
const KINDS = ['Stage', 'History', 'Commissioner', 'Cut, data kept'];
const CUT = 'Cut, data kept';

/** The text under `heading` (an exact line), up to the next heading of the same or a higher level. */
function section(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `missing heading: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  const end = lines.findIndex((line, i) => i > start && /^#+ /.test(line) && line.match(/^#+/)[0].length <= level);
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

const tableCells = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());

/** Stage number → title, from the phase tables in section 7 of the plan. */
function planStages() {
  const stages = new Map();
  for (const line of section(plan, '## 7. Stages').split('\n')) {
    const match = /^\| (\d+) \| ([^|]+?) \|/.exec(line);
    if (!match) continue;
    const number = Number(match[1]);
    assert.ok(!stages.has(number), `stage ${number} is listed twice in the plan`);
    stages.set(number, match[2].trim());
  }
  return stages;
}

/** Stages the plan's "D-39 changes to this plan" section says are dropped. */
function droppedStages() {
  const dropped = new Set();
  for (const sentence of section(plan, '## D-39 changes to this plan (read first)').split(/\||(?<=\.)\s+/)) {
    if (!/\bdropped\b/i.test(sentence)) continue;
    for (const match of sentence.matchAll(/\bStages? (\d+(?:(?:, | and )\d+)*)/g)) {
      for (const number of match[1].match(/\d+/g)) dropped.add(Number(number));
    }
  }
  return dropped;
}

function homeRows() {
  return homesDoc.split('\n').filter(line => /^\| \d+ \|/.test(line)).map(line => {
    const cells = tableCells(line);
    assert.equal(cells.length, 6, `row needs 6 cells (no "|" inside a cell): ${line}`);
    const [row, item, home, stageCell, place, dataKept] = cells;
    assert.match(stageCell, /^\d+(?:, \d+)*$/, `row ${row}: Stages must read like "12" or "12, 36", got "${stageCell}"`);
    return { row: Number(row), item, home, stages: stageCell.split(', ').map(Number), place, dataKept };
  });
}

const stages = planStages();
const rows = homeRows();
const byRow = new Map(rows.map(entry => [entry.row, entry]));
const stagesTitled = pattern => [...stages].filter(([, title]) => pattern.test(title)).map(([number]) => number);
const historyStages = stagesTitled(/^History\b/);
const commissionerStages = stagesTitled(/commissioner/i);
const retireStages = stagesTitled(/^Retire the old app$/);
const myBetsStages = stagesTitled(/\bMy bets\b/);

test('the plan lists stages 1 to 81, each once', () => {
  assert.deepEqual([...stages.keys()].sort((a, b) => a - b), Array.from({ length: PLAN_STAGES }, (_, i) => i + 1));
  assert.equal(stages.get(5), 'Inventory home table');
  assert.deepEqual(historyStages, [72, 73, 74]);
  assert.deepEqual(commissionerStages, [77, 78]);
  assert.deepEqual(retireStages, [81]);
  assert.deepEqual(myBetsStages, [45]);
});

test('rows 1 to 191 each appear once, in order', () => {
  assert.deepEqual(rows.map(entry => entry.row), Array.from({ length: INVENTORY_ROWS }, (_, i) => i + 1));
});

test('every row has a home: one of the four kinds, a stage, a place and a data note', () => {
  for (const entry of rows) {
    assert.ok(entry.item, `row ${entry.row} has no item name`);
    assert.ok(KINDS.includes(entry.home), `row ${entry.row}: home "${entry.home}" is not one of ${KINDS.join(' / ')}`);
    assert.ok(entry.stages.length > 0, `row ${entry.row} names no stage`);
    assert.equal(new Set(entry.stages).size, entry.stages.length, `row ${entry.row} names a stage twice`);
    assert.ok(entry.place, `row ${entry.row} does not say where it lives in the new app`);
    assert.ok(entry.dataKept, `row ${entry.row} does not say what data it keeps ("None" when it holds no entries)`);
  }
});

test('every stage a row names exists in the plan and was not dropped by D-39', () => {
  const dropped = droppedStages();
  assert.ok(dropped.has(49), 'the D-39 section drops the tester list (stage 49)');
  for (const entry of rows) {
    for (const stage of entry.stages) {
      assert.ok(stages.has(stage), `row ${entry.row} names stage ${stage}, which is not in the plan`);
      assert.ok(!dropped.has(stage), `row ${entry.row} names stage ${stage}, which D-39 dropped`);
    }
  }
});

test('History rows name a History stage, commissioner rows a commissioner stage, and only cut rows the retire stage', () => {
  const names = (entry, wanted) => entry.stages.some(stage => wanted.includes(stage));
  for (const entry of rows) {
    if (entry.home === 'History') assert.ok(names(entry, historyStages), `History row ${entry.row} names none of ${historyStages}`);
    if (entry.home === 'Commissioner') assert.ok(names(entry, commissionerStages), `commissioner row ${entry.row} names none of ${commissionerStages}`);
    if (entry.home === CUT) assert.ok(names(entry, retireStages), `cut row ${entry.row} must name stage ${retireStages}, when its old screen leaves`);
    // Every other home must be live before the flip, so it can never wait on the retire stage.
    else assert.ok(!names(entry, retireStages), `row ${entry.row} is not cut, so it cannot wait on stage ${retireStages}`);
  }
});

test('the rows the plan names in stage 5 have the homes it gives them', () => {
  // docs/REDESIGN_BUILD_PLAN.md, stage 5 scope: "It includes the rows the draft missed: …".
  const anchors = [
    [[11], 59], // invite list and Revoke
    [[23, 24, 40, 42], 36], // week not open and week closed
    [[25], 36], // the one-time Remind me
    [[130], 75], // export
    [[76, 77, 93, 126, 127, 129, 135], 74], // older group scoring views and the Week 5 freeze
    [[80], 11], // access pending and removed account
    [[103, 184], 38], // research links and data attribution
    [[153, 162, 163], 47], // real slip weeks, editor and report result
    [[168, 169, 170, 171], 74], // journal (Q8)
    [[179], 34], // referee look-up
    [[185], 8], // team marks
    [[191], 81], // Design lab, cut at 81
  ];
  for (const [inventoryRows, stage] of anchors) {
    for (const row of inventoryRows) assert.ok(byRow.get(row).stages.includes(stage), `row ${row} should name stage ${stage}`);
  }
  // Tracker filters, metrics, charts and Compare (D-36), and the Design lab: cut, data kept.
  for (const row of [154, 155, 156, 161, 191]) assert.equal(byRow.get(row).home, CUT, `row ${row} is cut, data kept`);
});

test('D-39: the journal is read-only in History and never in My bets', () => {
  for (const row of [168, 169, 170, 171]) {
    const entry = byRow.get(row);
    assert.equal(entry.home, 'History', `journal row ${row} lives in History`);
    assert.ok(!entry.stages.some(stage => myBetsStages.includes(stage)), `journal row ${row} must not name My bets (stage ${myBetsStages})`);
    assert.match(entry.place, /\bread-only\b/, `journal row ${row} says it is read-only`);
  }
});

test('the counts table matches the rows', () => {
  const counts = new Map();
  for (const line of section(homesDoc, '## Counts').split('\n')) {
    const match = /^\| (Stage|History|Commissioner|Cut, data kept|Total) \| (\d+) \|$/.exec(line.trim());
    if (match) counts.set(match[1], Number(match[2]));
  }
  for (const kind of KINDS) assert.equal(counts.get(kind), rows.filter(entry => entry.home === kind).length, `count for ${kind}`);
  assert.equal(counts.get('Total'), INVENTORY_ROWS);
});
