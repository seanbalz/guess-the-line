import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'node:path';
import { momentsKey } from '../../web/src/next/moments/seen.js';

// D-69 moments in a development build: StrictMode (main.jsx) mounts, unmounts and remounts every effect once, so the
// moments engine must survive it. With StrictMode and without, a badge a card reports, from its first render (a cached
// read) or after the mount (a read that arrives later), plays one "New results" card and is saved in the seen record. The fixture (tests/fixtures/next-moments/strict.jsx) is bundled
// here with React's development build and served from a fake origin; nothing else is contacted.
const ROOT = path.resolve('.');
const ORIGIN = 'http://moments-strict.test';
let bundle = null;
async function fixture() {
  if (bundle) return bundle;
  const out = await build({
    entryPoints: [path.join(ROOT, 'tests/fixtures/next-moments/strict.jsx')], bundle: true, write: false, format: 'iife',
    jsx: 'automatic', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'warning',
  });
  bundle = out.outputFiles[0].text;
  return bundle;
}

for (const strict of [false, true]) for (const when of ['cached', 'later']) {
  test(`D-69: ${strict ? 'under StrictMode' : 'without StrictMode'}, a badge reported ${when === 'cached' ? 'from the first render' : 'after the mount'} plays once and is saved`, async ({ page }) => {
    const js = await fixture();
    const other = [], errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) { other.push(url.href); return route.abort(); }
      if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: js });
      return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Moments</title><link rel="icon" href="data:,"></head><body><script src="/fixture.js"></script></body></html>' });
    });
    await page.goto(`${ORIGIN}/`);
    await page.evaluate(([s, w]) => window.__mount(s, w), [strict, when]);
    // A read that arrives after the mount: StrictMode's double effects are over by the next frames.
    if (when === 'later') await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => { window.__deliver(); resolve(); }))));
    await expect.poll(() => page.evaluate(() => window.__shown), { message: 'one "New results" card' }).toEqual(['ov.flash']);
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), momentsKey('acct'))).toEqual(['badge:fixture', 'source:features:community']);
    await expect(page.locator('[data-new]')).toHaveAttribute('data-new', '0');
    expect(errors).toEqual([]);
    expect(other).toEqual([]);
  });
}
