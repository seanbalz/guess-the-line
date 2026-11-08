import { expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { setCaptureTheme } from './theme-capture.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

// Capture the existing authenticated controllers, never a preview route. ThemeProvider
// preference plus computed canvas/ink are asserted by setCaptureTheme for every image.
export async function captureCommissioner(page, info, name, { compact = false } = {}) {
  const cases = compact ? [['dark', 390], ['light', 390]] : [
    ['dark', 320], ['light', 320], ['dark', 390], ['light', 390],
    ['dark', 768], ['light', 1440], ['dark', 320, 'active'],
  ];
  for (const [theme, width, forcedColors = 'none'] of cases) {
    await page.setViewportSize({ width, height: 844 });
    await setCaptureTheme(page, theme, { forcedColors });
    expect(await page.evaluate(layoutProblems), `${name} ${theme} ${width}`).toEqual([]);
    const metrics = await page.evaluate(() => {
      const layer = [...document.querySelectorAll('dialog[open], [role="dialog"]')].at(-1);
      const controls = [...layer.querySelectorAll('button,a[href],input,select,textarea,summary')].filter(el => {
        if (el.closest('details:not([open])') && !el.matches('summary')) return false;
        return el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
      });
      return controls.map(el => {
        const target = el.matches('input[type="checkbox"]') ? el.closest('label') : el;
        const rect = target.getBoundingClientRect();
        return { name: (el.getAttribute('aria-label') || target.textContent).trim().slice(0, 70),
          width: rect.width, height: rect.height, font: parseFloat(getComputedStyle(el).fontSize) };
      });
    });
    expect(metrics.filter(m => m.width < 43.9 || m.height < 43.9), `${name} touch targets`).toEqual([]);
    expect(metrics.filter(m => m.font < 16), `${name} native action labels`).toEqual([]);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations, `${name} accessibility`).toEqual([]);
    const file = `${name}-${forcedColors === 'active' ? 'forced' : theme}-${width}`;
    const body = page.locator('.gx-sheet-body').last();
    await body.evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: info.outputPath(`${file}.png`) });
    if (width === 390) {
      const scroller = await page.locator('dialog[open]').count() ? page.locator('dialog[open]').last() : body;
      if (await scroller.evaluate(el => el.scrollHeight > el.clientHeight + 1)) {
        await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.screenshot({ path: info.outputPath(`${file}-bottom.png`) });
        await scroller.evaluate(el => { el.scrollTop = 0; });
      }
    }
    fs.writeFileSync(info.outputPath(`${file}.json`), JSON.stringify({ name, theme, width, forcedColors, preference: theme, computedThemeVerified: true, metrics, layoutProblems: [], axeViolations: [] }, null, 2));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await setCaptureTheme(page, 'dark', { forcedColors: 'none' });
}
