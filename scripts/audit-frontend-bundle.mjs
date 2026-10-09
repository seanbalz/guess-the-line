import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const [beforePath, afterPath, outputPath] = process.argv.slice(2);
if (!beforePath || !afterPath) throw new Error('Usage: node scripts/audit-frontend-bundle.mjs BEFORE_DIR AFTER_DIR [OUTPUT_JSON]');

function inspect(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, '.vite/manifest.json'), 'utf8'));
  const root = Object.keys(manifest).find(key => manifest[key].isEntry);
  if (!root) throw new Error(`No entry in ${directory}`);
  const summarize = extra => {
    const files = new Set();
    const seen = new Set();
    function include(key) {
      if (seen.has(key)) return;
      seen.add(key);
      const chunk = manifest[key];
      if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
      files.add(chunk.file);
      for (const css of chunk.css || []) files.add(css);
      for (const dependency of chunk.imports || []) include(dependency);
    }
    include(root);
    for (const name of extra) {
      const key = manifest[name] ? name : Object.keys(manifest).find(key => manifest[key].name === name && manifest[key].isDynamicEntry);
      if (key) include(key);
    }
    const assets = [...files].sort().map(file => {
      const bytes = fs.readFileSync(path.join(directory, file));
      return { file, bytes: bytes.length, gzipBytes: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex') };
    });
    return { javascriptBytes: assets.filter(item => item.file.endsWith('.js')).reduce((total, item) => total + item.bytes, 0),
      javascriptGzipBytes: assets.filter(item => item.file.endsWith('.js')).reduce((total, item) => total + item.gzipBytes, 0),
      cssBytes: assets.filter(item => item.file.endsWith('.css')).reduce((total, item) => total + item.bytes, 0), assets };
  };
  return { manifestEntries: Object.keys(manifest).length, signIn: summarize([]),
    lobby: summarize(['GameHub']), league: summarize(['GameHub', 'App']),
    allScreens: summarize(Object.keys(manifest).filter(key => manifest[key].isDynamicEntry)) };
}

const before = inspect(beforePath), after = inspect(afterPath);
const report = { schemaVersion: 1, measuredAt: new Date().toISOString(), scope: 'Generated production assets only; local gzip estimates, not network timing, Core Web Vitals, or physical-device performance.', before, after,
  signInJavaScriptReductionPercent: Number(((before.signIn.javascriptBytes - after.signIn.javascriptBytes) / before.signIn.javascriptBytes * 100).toFixed(2)),
  signInJavaScriptGzipReductionPercent: Number(((before.signIn.javascriptGzipBytes - after.signIn.javascriptGzipBytes) / before.signIn.javascriptGzipBytes * 100).toFixed(2)) };
if (outputPath) { fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify(report, null, 2));
