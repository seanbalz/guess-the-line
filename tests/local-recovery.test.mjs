import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { backupLocalState, verifyLocalBackup, restoreLocalDrill } from '../scripts/local-recovery.mjs';
import { createEngine } from '../server/engine.mjs';

const fixture = () => ({ version: 1, league: { id: 'synthetic', season: 2026, week: 5, roster: [{ id: 'one', name: 'Fixture' }], deadline: '2026-10-09T00:15:00Z' }, games: [{ id: 'A-B', away: 'A', home: 'B', kickoff: '2026-10-09T00:15:00Z' }], ballots: { one: { guess_total: { submittedAt: null, picks: { 'A-B': 45.5 } } } }, bets: {}, results: {}, history: [], audit: [{ action: 'fixture' }], archivedCount: 0, frozen: {} });
function setup(t) { const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gtl-recovery-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); const source = path.join(dir, 'state.json'); fs.writeFileSync(source, JSON.stringify(fixture())); return { dir, source, backups: path.join(dir, 'backups') }; }

function windowsAcl(file) {
  const script = `$ErrorActionPreference='Stop'; $p=$env:GTL_TEST_ACL_PATH; $a=if([System.IO.Directory]::Exists($p)){[System.IO.Directory]::GetAccessControl($p)}else{[System.IO.File]::GetAccessControl($p)}; @{ owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; user=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object { @{sid=$_.IdentityReference.Value; type=$_.AccessControlType.ToString(); rights=[int]$_.FileSystemRights} }) } | ConvertTo-Json -Depth 4 -Compress`;
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GTL_TEST_ACL_PATH: file },
  }));
}
function assertPrivate(file, mode) {
  if (process.platform !== 'win32') return assert.equal(fs.statSync(file).mode & 0o777, mode);
  const acl = windowsAcl(file);
  assert.equal(acl.owner, acl.user);
  const grants = acl.rules.filter(rule => rule.type === 'Allow');
  assert.ok(grants.length > 0);
  assert.ok(grants.every(rule => [acl.user, 'S-1-5-18', 'S-1-5-32-544'].includes(rule.sid)), JSON.stringify(acl));
}
function shareDirectory(directory) {
  if (process.platform === 'win32') {
    execFileSync('icacls.exe', [directory, '/grant', '*S-1-1-0:(OI)(CI)(RX)'], { windowsHide: true });
  } else fs.chmodSync(directory, 0o755);
}

test('versioned private backup restores exact drafts/audit into isolated state without changing source', t => {
  const { dir, source, backups } = setup(t), original = fs.readFileSync(source, 'utf8');
  const result = backupLocalState(source, backups);
  assertPrivate(backups, 0o700);
  assertPrivate(result.file, 0o600);
  const restored = restoreLocalDrill(result.file, path.join(dir, 'drill'));
  assertPrivate(path.dirname(restored.file), 0o700);
  assertPrivate(restored.file, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(restored.file)), fixture());
  assert.equal(fs.readFileSync(source, 'utf8'), original);
  assert.equal(result.stateSha256, restored.stateSha256);
  assert.equal(verifyLocalBackup(result.file).scope, 'local-owner-state-only');
});
test('restore never overwrites an existing directory or current state', t => {
  const { dir, source, backups } = setup(t), result = backupLocalState(source, backups);
  assert.throws(() => restoreLocalDrill(result.file, dir), /new directory/);
  assert.throws(() => restoreLocalDrill(result.file, source), /new directory/);
  assert.deepEqual(JSON.parse(fs.readFileSync(source)), fixture());
});
test('tampered data and unsupported schemas fail before restore writes', t => {
  const { dir, source, backups } = setup(t), result = backupLocalState(source, backups), changed = JSON.parse(fs.readFileSync(result.file));
  changed.state.ballots.one.guess_total.picks['A-B'] = 99;
  fs.writeFileSync(result.file, JSON.stringify(changed));
  assert.throws(() => restoreLocalDrill(result.file, path.join(dir, 'drill')), /integrity/);
  assert.equal(fs.existsSync(path.join(dir, 'drill')), false);
  fs.writeFileSync(source, JSON.stringify({ ...fixture(), version: 2 }));
  assert.throws(() => backupLocalState(source, backups), /version 1/);
});
test('credential-shaped fields and values never enter a backup', t => {
  const { source, backups } = setup(t);
  for (const audit of [[{ service_role_key: 'fixture' }], [{ note: 'sb_secret_test_not_a_real_key' }], [{ note: 'https://test:password@example.invalid' }]]) {
    fs.writeFileSync(source, JSON.stringify({ ...fixture(), audit }));
    assert.throws(() => backupLocalState(source, backups), /Credential/);
    assert.equal(fs.existsSync(backups), false);
  }
});
test('symbolic inputs, output aliases and shared backup directories fail closed', t => {
  const { dir, source, backups } = setup(t), alias = path.join(dir, 'alias');
  // A directory junction exercises the same alias boundary without requiring
  // Windows Developer Mode or the file-symlink privilege.
  const linkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(dir, alias, linkType);
  assert.throws(() => backupLocalState(path.join(alias, 'state.json'), backups), /Symbolic/);
  fs.mkdirSync(backups, { mode: 0o755 });
  shareDirectory(backups);
  assert.throws(() => backupLocalState(source, backups), /private/);
  assert.deepEqual(fs.readdirSync(backups), []);
  const outputAlias = path.join(dir, 'output-alias'); fs.symlinkSync(backups, outputAlias, linkType);
  assert.throws(() => backupLocalState(source, outputAlias), /Symbolic/);
});

test('a reusable private destination is rechecked after permissions become shared', t => {
  const { source, backups } = setup(t);
  const first = backupLocalState(source, backups), before = fs.readFileSync(first.file);
  shareDirectory(backups);
  assert.throws(() => backupLocalState(source, backups), /private/);
  assert.deepEqual(fs.readdirSync(backups), [path.basename(first.file)]);
  assert.deepEqual(fs.readFileSync(first.file), before);
});

test('private recovery supports nested literal paths with spaces and shell metacharacters', t => {
  const { dir, source } = setup(t);
  const backups = path.join(dir, "space ' & $(literal) 🧪", 'nested', 'backups');
  const first = backupLocalState(source, backups);
  assertPrivate(first.file, 0o600);
  const second = backupLocalState(source, backups);
  assert.notEqual(first.file, second.file);
  assert.deepEqual(verifyLocalBackup(second.file).state, fixture());
});

test('D16 quote evidence, captured scoring references and audit survive an exact recovery round trip', t => {
  const { dir, source, backups } = setup(t), state = fixture();
  const now = Date.parse('2026-10-08T16:00:00Z'), quotedAt = new Date(now - 30000).toISOString();
  state.consensusHistory = [{ id: 'synthetic-reference', mode: 'guess_total', source: 'Synthetic consensus fixture',
    sourceUrl: 'https://example.invalid/fixture', capturedAt: new Date(now - 10000).toISOString(), quotedAt,
    games: { 'A-B': { value: 45.5, quotes: ['Fixture A', 'Fixture B', 'Fixture C'].map(book => ({ book, value: 45.5, quotedAt })),
      crossCheck: { source: 'Action Network', value: 45.5, quotedAt } } } }];
  const engine = createEngine(state, { clock: () => now, uuid: () => 'fixture-audit' });
  assert.equal(engine.saveBallot('one', 'guess_total', { 'A-B': 45.5 }, true).score, 10);
  const submitted = engine.snapshot();
  fs.writeFileSync(source, JSON.stringify(submitted));
  const result = backupLocalState(source, backups), restored = restoreLocalDrill(result.file, path.join(dir, 'drill'));
  const readback = JSON.parse(fs.readFileSync(restored.file));
  assert.deepEqual(readback, submitted);
  const view = createEngine(readback, { clock: () => now + 3600000 }).view('one', 'guess_total');
  assert.equal(view.score, 10); assert.equal(view.games[0].scoringReference.snapshotId, 'synthetic-reference');
  assert.deepEqual(readback.audit.at(-1).afterScoringReferences, submitted.ballots.one.guess_total.scoringReferences);
});

test('malformed consensus-history collections fail before any backup output', t => {
  const { source, backups } = setup(t);
  for (const consensusHistory of [null, {}, [null], [{ mode: 'guess_total', games: [] }], [{ mode: 'unknown', games: {} }]]) {
    fs.writeFileSync(source, JSON.stringify({ ...fixture(), consensusHistory }));
    assert.throws(() => backupLocalState(source, backups), /Invalid local consensus history/);
    assert.equal(fs.existsSync(backups), false);
  }
});

test('serialized UTF-8 envelope fits at the byte boundary and rejects one byte less before writing', t => {
  const { dir, source, backups } = setup(t);
  const state = { ...fixture(), audit: Array.from({ length: 12 }, () => ({ note: 'Synthetic 🧪 record' })) };
  fs.writeFileSync(source, JSON.stringify(state));
  const clock = () => Date.parse('2026-10-08T16:00:00Z');
  const sample = backupLocalState(source, backups, clock), size = fs.statSync(sample.file).size;
  assert.ok(fs.statSync(source).size < size - 1);
  const tooSmall = path.join(dir, 'too-small');
  assert.throws(() => backupLocalState(source, tooSmall, clock, { maxBytes: size - 1 }), /Serialized recovery output exceeds/);
  assert.equal(fs.existsSync(tooSmall), false);
  const accepted = backupLocalState(source, path.join(dir, 'at-limit'), clock, { maxBytes: size });
  assert.equal(fs.statSync(accepted.file).size, size);
  assert.deepEqual(verifyLocalBackup(accepted.file, { maxBytes: size }).state, state);
  assert.deepEqual(JSON.parse(fs.readFileSync(restoreLocalDrill(accepted.file, path.join(dir, 'drill'), { maxBytes: size }).file)), state);
});

test('compact imported envelope cannot create an oversized restored file', t => {
  const { dir, source, backups } = setup(t);
  const state = { ...fixture(), audit: Array.from({ length: 30 }, () => ({ action: 'synthetic', before: { one: 1 }, after: { one: 2 } })) };
  fs.writeFileSync(source, JSON.stringify(state));
  const result = backupLocalState(source, backups), envelope = verifyLocalBackup(result.file);
  const compact = JSON.stringify(envelope); fs.writeFileSync(result.file, compact);
  const limit = Buffer.byteLength(compact, 'utf8');
  assert.ok(Buffer.byteLength(JSON.stringify(state, null, 2) + '\n', 'utf8') > limit);
  assert.throws(() => verifyLocalBackup(result.file, { maxBytes: limit }), /Serialized recovery output exceeds/);
  const destination = path.join(dir, 'oversize-restore');
  assert.throws(() => restoreLocalDrill(result.file, destination, { maxBytes: limit }), /Serialized recovery output exceeds/);
  assert.equal(fs.existsSync(destination), false);
});
