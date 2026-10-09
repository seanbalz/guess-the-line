import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

test('release fingerprint changes with gateway/deployment config while compiled frontend stays identical', t => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gtl-manifest-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['cloud', 'server', 'shared', 'config', 'design', 'web/src', 'web/public', 'supabase/functions', 'supabase/migrations', 'scripts', '.local/cloud-dist']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  for (const name of ['release-manifest.mjs', 'check-cloud-boundary.mjs']) fs.copyFileSync(new URL(`../scripts/${name}`, import.meta.url), path.join(root, 'scripts', name));
  for (const name of ['package.json', 'package-lock.json', 'vite.config.js', 'web/index.html']) fs.writeFileSync(path.join(root, name), '{}');
  fs.writeFileSync(path.join(root, 'supabase/config.toml'), '[functions.gtl-api]\nverify_jwt = true\n');
  fs.writeFileSync(path.join(root, 'wrangler.jsonc'), '{"pages_build_output_dir":".local/cloud-dist"}');
  fs.writeFileSync(path.join(root, '.local/cloud-dist/index.html'), '<!doctype html><title>Synthetic release</title>');
  const manifest = () => {
    execFileSync(process.execPath, [path.join(root, 'scripts/release-manifest.mjs')], { cwd: root, stdio: 'pipe' });
    return JSON.parse(fs.readFileSync(path.join(root, '.local/release-manifest.json')));
  };
  const first = manifest(); assert.equal(first.deployed, false);
  fs.writeFileSync(path.join(root, 'supabase/config.toml'), '[functions.gtl-api]\nverify_jwt = false\n');
  const gatewayChanged = manifest();
  assert.notEqual(gatewayChanged.sourceSha256, first.sourceSha256); assert.equal(gatewayChanged.frontendSha256, first.frontendSha256);
  fs.writeFileSync(path.join(root, 'wrangler.jsonc'), '{"pages_build_output_dir":"other-output"}');
  const deploymentChanged = manifest();
  assert.notEqual(deploymentChanged.sourceSha256, gatewayChanged.sourceSha256); assert.equal(deploymentChanged.frontendSha256, first.frontendSha256);
});
