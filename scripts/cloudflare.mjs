import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const configHome = path.join(root, '.local/cloudflare-cli');
// Wrangler prefers a legacy home directory over XDG_CONFIG_HOME if present.
// Fail safely instead of modifying another project's stored login.
if (fs.existsSync(path.join(os.homedir(), '.wrangler'))) {
  throw new Error('Legacy shared Wrangler configuration detected. Use the personal Cloudflare dashboard for deployment instead of changing that login.');
}
fs.mkdirSync(configHome, { recursive: true, mode: 0o700 });
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), ...process.argv.slice(2)], {
  cwd: root, stdio: 'inherit',
  env: { ...process.env, XDG_CONFIG_HOME: configHome, CLOUDFLARE_ACCOUNT_ID: '83bd659d712e968e7a61efa14107465a', WRANGLER_SEND_METRICS: 'false' },
});
process.exit(result.status ?? 1);
