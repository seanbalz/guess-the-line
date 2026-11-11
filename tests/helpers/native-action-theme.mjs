import { expect } from '@playwright/test';
import fs from 'node:fs';

const tokens = JSON.parse(fs.readFileSync(new URL('../../design/tokens-next.json', import.meta.url), 'utf8'));

// ThemeProvider owns both the resolved theme and the saved preference. A dataset
// edit alone can be overwritten by its next media/layer render.
export async function setNativeActionTheme(page, theme) {
  await page.evaluate(value => {
    localStorage.setItem('gtl.theme', value);
    window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: value }));
  }, theme);
  await assertNativeActionTheme(page, theme);
}

export async function assertNativeActionTheme(page, theme) {
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  const expected = tokens.themes[theme].color;
  const paint = await page.locator('.gx').first().evaluate(el => {
    const css = getComputedStyle(el);
    return { canvas: css.getPropertyValue('--gx-canvas').trim(), text: css.getPropertyValue('--gx-text-1').trim(), ink: css.color, forced: matchMedia('(forced-colors: active)').matches };
  });
  expect(paint.canvas.toLowerCase()).toBe(expected.canvas.toLowerCase());
  expect(paint.text.toLowerCase()).toBe(expected['text-1'].toLowerCase());
  const rgb = expected['text-1'].slice(1).match(/../g).map(value => parseInt(value, 16)).join(', ');
  if (!paint.forced) expect(paint.ink).toBe(`rgb(${rgb})`);
}
