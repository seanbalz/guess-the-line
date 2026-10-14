import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

// Redesign stage 8: the new app's UI kit in a real browser at 390 x 844 (build plan section 4.1). There is no NextApp
// yet (stage 9), so this spec bundles tests/fixtures/next-ui/gallery.jsx with Vite in memory and serves it, the team
// marks from web/public and nothing else from a fake origin. The page loads the old app's styles.css first, as every
// page does. No webfonts load, so every check runs on fallback fonts. Fictional names only; no account or network.
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const ORIGIN = 'http://next-ui.test';
const PUBLIC = path.join(ROOT, 'web/public');
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.html': 'text/html' };

test.use({ viewport: { width: 390, height: 844 } });

let bundle = null;
test.beforeAll(async () => {
  test.setTimeout(120000);
  const out = await build({
    configFile: false,
    root: path.join(ROOT, 'tests/fixtures/next-ui'),
    envDir: path.join(ROOT, 'tests/fixtures/next-ui'),
    publicDir: false,
    logLevel: 'warn',
    mode: 'production',
    plugins: [react()],
    build: {
      write: false,
      minify: false,
      modulePreload: false,
      cssCodeSplit: false,
      assetsInlineLimit: 0,
      rollupOptions: { input: path.join(ROOT, 'tests/fixtures/next-ui/gallery.jsx'), output: { entryFileNames: 'gallery.js', assetFileNames: '[name][extname]' } },
    },
  });
  const files = (Array.isArray(out) ? out : [out]).flatMap(o => o.output);
  const js = files.filter(f => f.type === 'chunk');
  const css = files.filter(f => f.type === 'asset' && f.fileName.endsWith('.css'));
  expect(js.map(f => f.fileName)).toEqual(['gallery.js']);
  expect(css).toHaveLength(1);
  bundle = { js: js[0].code, css: String(css[0].source), cssName: css[0].fileName };
});

const galleryHtml = () => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>UI kit</title><link rel="icon" href="data:,"><link rel="stylesheet" href="/${bundle.cssName}"></head><body><div id="root"></div><script type="module" src="/gallery.js"></script></body></html>`;

/** Serves the gallery; every other origin is refused and recorded. `hold` delays one path until its promise settles. */
async function open(page, { theme = 'dark', hold = {}, fail = [] } = {}) {
  const seen = { other: [] };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) {
      seen.other.push(url.href);
      return route.abort();
    }
    if (hold[url.pathname]) await hold[url.pathname];
    if (fail.includes(url.pathname)) return route.fulfill({ status: 404, body: '' });
    if (url.pathname === '/') return route.fulfill({ status: 200, contentType: TYPES['.html'], body: galleryHtml() });
    if (url.pathname === '/gallery.js') return route.fulfill({ status: 200, contentType: TYPES['.js'], body: bundle.js });
    if (url.pathname === `/${bundle.cssName}`) return route.fulfill({ status: 200, contentType: TYPES['.css'], body: bundle.css });
    if (url.pathname.startsWith('/team-logos/')) {
      const file = path.join(PUBLIC, path.normalize(url.pathname).replace(/^\/+/, ''));
      if (file.startsWith(PUBLIC + path.sep) && fs.existsSync(file)) return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)], body: fs.readFileSync(file) });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  // DOMContentLoaded, not load: a test may hold a team mark back on purpose.
  await page.goto(`${ORIGIN}/?theme=${theme}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'UI kit', level: 1 })).toBeVisible();
  return { seen, errors };
}

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}

/** A 390 (or 320) screenshot for review, saved in the test's output folder (CI uploads it with the cloud browser results). */
async function shot(page, testInfo, name, fullPage = false) {
  await settle(page);
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage });
}

async function axe(page, testInfo, name) {
  await settle(page);
  const result = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  await testInfo.attach(`axe-${name}`, { body: JSON.stringify(result.violations, null, 2), contentType: 'application/json' });
  expect.soft(result.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target.join(' ')) })), name).toEqual([]);
}

/** Layout rules from build plan section 4.1, on what is visible once entrances have finished (a pop scales a card). */
async function layout(page) {
  await settle(page);
  return page.evaluate(() => {
    const visible = el => {
      const s = getComputedStyle(el);
      return s.visibility !== 'hidden' && s.display !== 'none' && el.getClientRects().length > 0 && !el.closest('[inert], dialog:not([open])');
    };
    const problems = [];
    if (document.documentElement.scrollWidth > innerWidth) problems.push(`side scroll: ${document.documentElement.scrollWidth} > ${innerWidth}`);
    // 44px targets.
    for (const el of document.querySelectorAll('.gx button, .gx a[href], .gx input, .gx select, .gx textarea')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 43.5 || r.height < 43.5) problems.push(`target ${el.className || el.tagName} "${(el.getAttribute('aria-label') || el.textContent).trim()}" is ${r.width.toFixed(1)} x ${r.height.toFixed(1)}`);
    }
    // No text under 12px, and no text cut off by a clipping box (a scrolling box may hide it; an ellipsis is a choice).
    for (const el of document.querySelectorAll('.gx *')) {
      if (el.closest('.gx-sr-only') || !visible(el)) continue;
      const texts = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      if (!texts.length) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < 12) problems.push(`text "${el.textContent.trim().slice(0, 30)}" at ${size}px`);
      const range = document.createRange();
      for (const node of texts) {
        range.selectNodeContents(node);
        const t = range.getBoundingClientRect();
        for (let a = el; a && a !== document.body; a = a.parentElement) {
          const s = getComputedStyle(a);
          const over = `${s.overflowX} ${s.overflowY}`;
          if (/auto|scroll/.test(over) || a.classList.contains('gx-truncate')) break;
          if (/hidden|clip/.test(over)) {
            const b = a.getBoundingClientRect();
            if (t.left < b.left - 1 || t.right > b.right + 1 || t.top < b.top - 1 || t.bottom > b.bottom + 1) problems.push(`text "${node.textContent.trim().slice(0, 30)}" clipped by ${a.className}`);
          }
        }
      }
    }
    return problems;
  });
}

for (const theme of ['dark', 'light']) {
  test(`${theme}: the kit at 390 and 320 has no side scroll, 44px targets, no text under 12px, nothing clipped, and passes axe`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const { seen, errors } = await open(page, { theme });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    // Marks load lazily: in view, the Bills mark loads and replaces its letters.
    const bills = page.getByRole('img', { name: 'Buffalo Bills' });
    await bills.scrollIntoViewIfNeeded();
    await expect(bills).toHaveClass(/gx-team--loaded/, { timeout: 15000 });
    await page.evaluate(() => scrollTo(0, 0));
    expect(await layout(page)).toEqual([]);
    await axe(page, testInfo, `${theme}-390`);
    await shot(page, testInfo, `next-ui-390-${theme}`, true);

    await page.getByRole('button', { name: 'Open the game sheet' }).click();
    await expect(page.getByRole('dialog', { name: 'SEA @ DEN' })).toBeVisible();
    expect(await layout(page)).toEqual([]);
    await axe(page, testInfo, `${theme}-sheet`);
    await shot(page, testInfo, `next-ui-sheet-390-${theme}`);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Skip this week', exact: true }).first().click();
    await expect(page.getByRole('alertdialog', { name: 'Skip Week 6 Guess the Line?' })).toBeVisible();
    await axe(page, testInfo, `${theme}-dialog`);
    await shot(page, testInfo, `next-ui-dialog-390-${theme}`);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Show a celebration' }).click();
    await expect(page.getByRole('dialog', { name: 'Bullseye' })).toBeVisible();
    expect(await layout(page)).toEqual([]);
    await axe(page, testInfo, `${theme}-overlay`);
    await shot(page, testInfo, `next-ui-overlay-390-${theme}`);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Show an error' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await axe(page, testInfo, `${theme}-toast`);
    await shot(page, testInfo, `next-ui-toast-390-${theme}`);
    await page.getByRole('button', { name: 'Dismiss' }).click();

    await page.setViewportSize({ width: 320, height: 844 });
    expect(await layout(page)).toEqual([]);
    await axe(page, testInfo, `${theme}-320`);
    await shot(page, testInfo, `next-ui-320-${theme}`, true);

    expect(seen.other).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('a sheet takes focus, keeps Tab inside, backs out of a sub-view and returns focus on Escape or the scrim', async ({ page }) => {
  await open(page);
  const opener = page.getByRole('button', { name: 'Open the game sheet' });
  await opener.click();
  const sheet = page.getByRole('dialog', { name: 'SEA @ DEN' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toBeFocused();
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.gx-sheet'))).toBe(true);
  }
  await sheet.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Guess this game' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(opener).toBeFocused();

  await opener.click();
  await page.getByRole('button', { name: /Everyone's picks/ }).click();
  const sub = page.getByRole('dialog', { name: "Everyone's picks" });
  await expect(sub).toBeVisible();
  await page.getByRole('button', { name: 'SEA @ DEN', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'SEA @ DEN' })).toBeVisible();
  await page.mouse.click(195, 20); // the scrim above the sheet
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('stage 10 fix: a sub-view that opens in place keeps focus in the sheet, so Tab stays inside and Escape still closes it', async ({ page }) => {
  await open(page);
  const opener = page.getByRole('button', { name: 'Open the game sheet' });
  await opener.click();
  // The row that opens the sub-view goes away with the main view; focus must not fall to the page.
  await page.getByRole('button', { name: /Everyone's picks/ }).press('Enter');
  const sub = page.getByRole('dialog', { name: "Everyone's picks" });
  await expect(sub).toBeVisible();
  await expect(sub).toBeFocused();
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement.closest('.gx-sheet'))).toBe(true);
  }
  // Back to the main view the same way: the back button goes away too.
  await page.getByRole('button', { name: 'SEA @ DEN', exact: true }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'SEA @ DEN' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('a native dialog opens modally, starts on the safe choice, and closes on Escape or a choice', async ({ page }) => {
  await open(page);
  const opener = page.getByRole('button', { name: 'Skip this week', exact: true }).first();
  await opener.click();
  const dialog = page.locator('dialog.gx-dialog');
  await expect(dialog).toHaveJSProperty('open', true);
  await expect(page.getByRole('alertdialog', { name: 'Skip Week 6 Guess the Line?' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep playing' })).toBeFocused();
  // The page behind is inert while it is open.
  await expect(page.getByRole('button', { name: 'How to play' }).click({ trial: true, timeout: 1000 })).rejects.toThrow();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveJSProperty('open', false);
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.getByRole('button', { name: 'Skip this week' }).click();
  await expect(dialog).toHaveJSProperty('open', false);
  expect(await page.evaluate(() => window.__events)).toContain('skip');
  // The gate banner's skip opens the same dialog; its way in calls back.
  await page.getByRole('button', { name: "Skip this week's Guess the Line" }).click();
  await expect(dialog).toHaveJSProperty('open', true);
  await page.getByRole('button', { name: 'Keep playing' }).click();
  await page.getByRole('button', { name: 'Make Spread picks' }).click();
  expect(await page.evaluate(() => window.__events)).toContain('cta');
});

test('a celebration takes focus, traps Tab and returns focus on Escape', async ({ page }) => {
  await open(page);
  const opener = page.getByRole('button', { name: 'Show a celebration' });
  await opener.click();
  const overlay = page.getByRole('dialog', { name: 'Bullseye' });
  await expect(overlay).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Share to league' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Done' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Share to league' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(overlay).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test('a toast leaves on its own, waits while hovered, and an error stays until dismissed', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Show a toast' }).click();
  const toast = page.getByRole('status').filter({ hasText: 'Spread picks in' });
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.waitForTimeout(3600);
  await expect(toast).toBeVisible();
  await page.mouse.move(195, 60);
  await expect(toast).toHaveCount(0, { timeout: 5000 });

  await page.getByRole('button', { name: 'Show a toast' }).click();
  await expect(toast).toBeVisible();
  await page.mouse.move(195, 60); // the toast may appear under the pointer, which would rightly hold it
  await expect(toast).toHaveCount(0, { timeout: 6000 });

  await page.getByRole('button', { name: 'Show an error' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText("Couldn't save");
  await page.waitForTimeout(4500);
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Dismiss' }).click();
  await expect(alert).toHaveCount(0);
});

test('chips and segments are toggles that say which one is on', async ({ page }) => {
  await open(page);
  const chip = page.getByRole('button', { name: 'Seattle by 3', exact: true });
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toHaveClass(/gx-chip--on/);
  await expect(page.getByRole('button', { name: 'Seattle by 2.5', exact: true })).toHaveAttribute('aria-pressed', 'false');
  // The selection pop plays once and is gone (animationend), and the rail scrolls inside itself.
  await expect(chip).not.toHaveClass(/gx-anim-pop/);
  expect(await page.evaluate(() => { const r = document.querySelector('.gx-chip-rail'); return r.scrollWidth > r.clientWidth; })).toBe(true);
  const total = page.getByRole('button', { name: 'Total', exact: true });
  await total.click();
  await expect(total).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Spread', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('list', { name: 'Total board' })).toBeVisible();
});

test('a live countdown ticks, turns pending under two hours and says so once, politely', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Start a live countdown' }).click();
  const timer = page.getByRole('timer', { name: /^Live test/ });
  await expect(timer).toBeVisible();
  await expect(timer).toHaveAttribute('aria-live', 'off');
  await expect(timer.locator('.gx-c-pending')).toHaveCount(0);
  const polite = timer.locator('xpath=following-sibling::*[@aria-live="polite"][1]');
  await expect(polite).toHaveText('');
  await expect(polite).toHaveText('Two hours left in the test.', { timeout: 9000 });
  await expect(timer.locator('.gx-n-xl.gx-c-pending')).toHaveCount(2);
  await expect(timer).toHaveAttribute('aria-label', /^Live test 1 hour 5\d minutes$/);
});

test('DP-27: a slow team mark shows its letters in a box that never changes size, then the mark; a failed one keeps its letters', async ({ page }) => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  await open(page, { hold: { '/team-logos/buf.png': held }, fail: ['/team-logos/kc.svg'] });
  const bills = page.getByRole('img', { name: 'Buffalo Bills' });
  await bills.scrollIntoViewIfNeeded();
  await expect(bills).toBeVisible();
  const size = async () => { const box = await bills.boundingBox(); return [box.width, box.height]; };
  const before = await size();
  await expect(bills.locator('.gx-team-code')).toBeVisible();
  await expect(bills.locator('.gx-team-code')).toHaveText('BUF');
  await expect(bills).not.toHaveClass(/gx-team--loaded/);
  // The other marks are not held up by the slow one.
  await expect(page.getByRole('img', { name: 'Los Angeles Rams' })).toHaveClass(/gx-team--loaded/);
  release();
  await expect(bills).toHaveClass(/gx-team--loaded/, { timeout: 15000 });
  await expect(bills.locator('.gx-team-code')).toBeHidden();
  expect(await size()).toEqual(before);
  expect(await bills.locator('img').evaluate(img => [img.naturalWidth, img.getAttribute('width'), img.getAttribute('decoding')])).toEqual([3840, '48', 'async']);

  const chiefs = page.getByRole('img', { name: 'Kansas City Chiefs' });
  await expect(chiefs).toHaveAttribute('data-mark', 'letters');
  await expect(chiefs.locator('img')).toHaveCount(0);
  await expect(chiefs.locator('.gx-team-code')).toHaveText('KC');
  await expect(chiefs.locator('.gx-team-code')).toBeVisible();
});

test('reduced motion stops the kit\'s motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.getByRole('button', { name: 'Open the game sheet' }).click();
  const names = await page.evaluate(() => [...document.querySelectorAll('.gx *')].map(el => getComputedStyle(el).animationName).filter(n => n !== 'none'));
  expect(names).toEqual([]);
});
