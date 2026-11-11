// Private operator files (research intake inputs and outputs, Player Props quote-request inputs) stay under the
// repository's Git-ignored .local folder. A path outside it, a path Git would track, or a link that resolves out of
// .local is refused before anything is read or written.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** The absolute path of `name` when it is an ignored file under .local; `exists: false` allows a new file. */
export async function ignoredLocalFile(name, { exists = true } = {}) {
  const target = path.resolve(ROOT, name ?? '');
  if (!target.startsWith(path.join(ROOT, '.local') + path.sep)) throw new Error('Research files must remain under ignored .local.');
  try { execFileSync('git', ['check-ignore', '--quiet', target], { cwd: ROOT, stdio: 'ignore' }); } catch { throw new Error('Research files must be Git-ignored.'); }
  let real;
  try { real = await fs.realpath(target); } catch (error) { if (exists || error.code !== 'ENOENT') throw error; real = await fs.realpath(path.dirname(target)); }
  const localRoot = path.join(await fs.realpath(ROOT), '.local');
  if (real !== localRoot && !real.startsWith(localRoot + path.sep)) throw new Error('Research paths cannot escape .local.');
  return target;
}
