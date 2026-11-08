import { expect } from '@playwright/test';
import fs from 'node:fs';

const legacyTokens = JSON.parse(fs.readFileSync(new URL('../../design/tokens.json', import.meta.url), 'utf8'));
const tokens = JSON.parse(fs.readFileSync(new URL('../../design/tokens-next.json', import.meta.url), 'utf8'));

export async function assertCaptureTheme(page, theme, { preference = theme } = {}) {
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', preference);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await expect.poll(() => page.evaluate(() => ({ scheme: document.documentElement.style.colorScheme, canvas: document.documentElement.style.getPropertyValue('--canvas'), text: document.documentElement.style.getPropertyValue('--text') }))).toEqual({ scheme: theme, canvas: legacyTokens.themes[theme].canvas ?? legacyTokens.colors.canvas, text: legacyTokens.themes[theme].text ?? legacyTokens.colors.text });
  await expect.poll(() => page.evaluate(({ color, effect }) => {
    const root = document.querySelector('.gx, .gx-access-prism'), actual = getComputedStyle(root);
    const forced = matchMedia('(forced-colors: active)').matches;
    // Normalize the selected tokens using the browser's CSS parser. In forced colors,
    // verify the system canvas/ink instead of expecting Porcelain/charcoal pixels.
    const probe = document.createElement('div');
    probe.style.cssText = `position:fixed;visibility:hidden;background:${forced ? 'Canvas' : effect['canvas-gradient']};color:${forced ? 'CanvasText' : color['text-1']}`;
    root.append(probe);
    const expected = getComputedStyle(probe);
    const result = {
      canvasMatches: actual.backgroundImage === expected.backgroundImage,
      textMatches: actual.color === expected.color,
      canvasToken: actual.getPropertyValue('--gx-canvas').trim(),
    };
    probe.remove(); return result;
  }, tokens.themes[theme]), { message: `Computed ${theme} canvas and text match selected tokens/system colors` }).toEqual({
    canvasMatches: true, textMatches: true, canvasToken: tokens.themes[theme].color.canvas,
  });
}

export async function setCaptureTheme(page, theme, media = {}) {
  // Use ThemeProvider's existing storage-event synchronization, shared with
  // useThemePreference. A data-theme mutation leaves its React preference stale.
  await page.evaluate(theme => {
    localStorage.setItem('gtl.theme', theme);
    window.dispatchEvent(new StorageEvent('storage', { key: 'gtl.theme', newValue: theme }));
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme-preference', theme);
  await page.emulateMedia({ colorScheme: theme, ...media });
  await assertCaptureTheme(page, theme);
}

export async function themedScreenshot(page, info, file, theme, options = {}) {
  await assertCaptureTheme(page, theme);
  await page.screenshot({ path: info.outputPath(file), ...options });
}
