import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

// Test-only harness: no simulation route or results ship to production yet.
test.use({ viewport: { width: 390, height: 844 } });
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ORIGIN = 'http://simulation.test';
let assets;
async function bundle() {
  if (assets) return assets;
  const out = await build({ configFile: false, root: path.join(ROOT, 'tests/fixtures/next-simulation'),
    publicDir: false, logLevel: 'warn', plugins: [react()],
    build: { write: false, minify: false, cssCodeSplit: false, modulePreload: false,
      rollupOptions: { input: path.join(ROOT, 'tests/fixtures/next-simulation/harness.jsx'),
        output: { entryFileNames: 'harness.js', assetFileNames: '[name][extname]', inlineDynamicImports: true } } } });
  const files = (Array.isArray(out) ? out : [out]).flatMap(r => r.output);
  assets = new Map(files.map(f => [`/${f.fileName}`, f.type === 'chunk' ? f.code : String(f.source)]));
  return assets;
}
async function open(page, query = '') {
  const files = await bundle();
  const css = [...files.keys()].find(name => name.endsWith('.css'));
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Replay research fixture</title><link rel="icon" href="data:,"><link rel="stylesheet" href="${css}"></head><body><div id="root"></div><script type="module" src="/harness.js"></script></body></html>`;
  const unexpected = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN || route.request().method() !== 'GET') {
      unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`); return route.abort();
    }
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (files.has(url.pathname)) return route.fulfill({ contentType: url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css', body: files.get(url.pathname) });
    // Self-hosted font requests are intentionally denied to exercise fallback layout.
    if (!url.pathname.endsWith('.woff2')) unexpected.push(url.pathname);
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`${ORIGIN}/${query}`);
  await expect(page.locator('.gx-sim-replay')).toBeVisible();
  return { unexpected, errors };
}
const replay = page => page.locator('.gx-sim-replay');
const next = page => page.getByRole('button', { name: 'Next play', exact: true });
const previous = page => page.getByRole('button', { name: 'Previous play', exact: true });
const play = page => page.getByRole('button', { name: 'Play', exact: true });
const eventId = page => replay(page).getAttribute('data-event-id');
const settle = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running').map(a => a.finished.catch(() => {}))));
async function controlledClock(page) {
  await page.clock.install({ time: new Date('2026-10-15T14:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-15T14:00:01Z'));
}

test.beforeAll(async () => { test.setTimeout(120000); await bundle(); });

test('paused by default; stepping, playback speed, rewind and restart stay on the same ledger', async ({ page }) => {
  await controlledClock(page);
  const audit = await open(page);
  const first = await eventId(page);
  await page.clock.runFor(10000);
  expect(await eventId(page)).toBe(first);
  await expect(previous(page)).toBeDisabled();
  await next(page).click();
  const second = await eventId(page);
  expect(second).not.toBe(first);
  const state = await page.locator('.gx-sim-scorecard').innerText();
  await previous(page).click();
  expect(await eventId(page)).toBe(first);
  await page.getByRole('combobox', { name: 'Speed', exact: true }).selectOption('2');
  await play(page).click();
  await page.clock.runFor(1199);
  expect(await eventId(page)).toBe(first);
  await page.clock.runFor(1);
  expect(await eventId(page)).toBe(second);
  expect(await page.locator('.gx-sim-scorecard').innerText()).toBe(state);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.clock.runFor(9000);
  expect(await eventId(page)).toBe(second);
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  expect(await eventId(page)).toBe(first);
  await expect(replay(page)).toHaveAttribute('data-playing', 'false');
  expect(audit).toEqual({ unexpected: [], errors: [] });
});

test('OS and app reduced motion stop timer-driven playback and leave static stepping usable', async ({ page }) => {
  await controlledClock(page);
  await open(page);
  await play(page).click();
  await page.clock.runFor(1000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.getByText('Reduced motion: step through each play at your own pace.', { exact: true })).toBeVisible();
  await expect(play(page)).toHaveCount(0);
  const stopped = await eventId(page);
  await page.clock.runFor(10000);
  expect(await eventId(page)).toBe(stopped);
  await next(page).click();
  expect(await eventId(page)).not.toBe(stopped);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(play(page)).toBeVisible();
  await expect(replay(page)).toHaveAttribute('data-playing', 'false');
  await play(page).click();
  await page.evaluate(() => window.__replayHarness.setMotion('reduce'));
  await expect(page.locator('.gx')).toHaveAttribute('data-motion', 'reduce');
  await expect(page.getByText('Reduced motion: step through each play at your own pace.', { exact: true })).toBeVisible();
  await expect(play(page)).toHaveCount(0);
  const appStopped = await eventId(page);
  await page.clock.runFor(10000);
  expect(await eventId(page)).toBe(appStopped);
  expect(await page.locator('.gx-sim-ball').evaluate(el => getComputedStyle(el).transitionDuration)).toBe('0s');
});

test('covered/hidden viewers, ledger replacement and unmount cancel pending playback', async ({ page }) => {
  await controlledClock(page);
  const audit = await open(page);
  const first = await eventId(page);
  await play(page).click();
  await page.evaluate(() => window.__replayHarness.setActive(false));
  await expect(play(page)).toBeDisabled();
  await page.clock.runFor(10000);
  expect(await eventId(page)).toBe(first);
  await page.evaluate(() => window.__replayHarness.setActive(true));
  await expect(replay(page)).toHaveAttribute('data-playing', 'false');
  await play(page).click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(play(page)).toBeDisabled();
  await page.clock.runFor(10000);
  expect(await eventId(page)).toBe(first);
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await expect(play(page)).toBeEnabled();
  await next(page).click();
  await play(page).click();
  await page.evaluate(() => window.__replayHarness.setReplay(structuredClone(window.__replayHarness.fixture)));
  await expect(replay(page)).toHaveAttribute('data-event-id', first);
  await expect(replay(page)).toHaveAttribute('data-playing', 'false');
  await play(page).click();
  await page.evaluate(() => window.__replayHarness.unmount());
  await page.clock.runFor(10000);
  await expect(replay(page)).toHaveCount(0);
  expect(audit).toEqual({ unexpected: [], errors: [] });
});

test('end and unavailable states never invent a completed real game', async ({ page }) => {
  await controlledClock(page);
  await open(page);
  const count = await page.evaluate(() => window.__replayHarness.fixture.events.length);
  for (let i = 1; i < count; i++) await next(page).click();
  await expect(play(page)).toBeDisabled();
  await expect(next(page)).toBeDisabled();
  const last = await eventId(page);
  await page.clock.runFor(20000);
  expect(await eventId(page)).toBe(last);
  await expect(page.getByText('Research only', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__replayHarness.setReplay({ ...window.__replayHarness.fixture, status: 'overtime_required' }));
  for (let i = 1; i < count; i++) await next(page).click();
  await expect(page.getByText('End of regulation — overtime not supported', { exact: true })).toBeVisible();
  await page.evaluate(() => window.__replayHarness.setReplay(null));
  await expect(page.getByRole('heading', { name: 'Replay not ready' })).toBeVisible();
  await expect(play(page)).toHaveCount(0);
});

test('light/dark, 320/390, fallback fonts, keyboard and axe meet mobile requirements', async ({ page }, info) => {
  const audit = await open(page);
  for (const theme of ['light', 'dark']) for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await next(page).click();
    await settle(page);
    const issues = await page.locator('.gx').evaluate(scope => {
      const targets = [], small = [], clipped = [];
      for (const el of scope.querySelectorAll('*')) {
        if (!el.getClientRects().length || el.closest('.gx-sr-only')) continue;
        const box = el.getBoundingClientRect();
        if (el.matches('button,select,summary') && (box.width < 43.9 || box.height < 43.9)) targets.push(el.textContent.trim());
        if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
          if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim());
          if (el.scrollWidth > el.clientWidth + 1 || box.left < -.5 || box.right > innerWidth + .5) clipped.push(el.textContent.trim());
        }
      }
      return { targets, small, clipped, horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(issues).toEqual({ targets: [], small: [], clipped: [], horizontalOverflow: false });
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(axe.violations.map(v => ({ id: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
    if (width === 390) await page.screenshot({ path: info.outputPath(`simulation-fixture-390-${theme}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Restart', exact: true }).click();
  }
  await next(page).focus();
  await expect(next(page)).toBeFocused();
  const before = await eventId(page);
  await page.keyboard.press('Enter');
  expect(await eventId(page)).not.toBe(before);
  expect(audit).toEqual({ unexpected: [], errors: [] });
});
