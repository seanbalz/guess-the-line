import { expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { layoutProblems } from './phone-layout.mjs';
import { assertNativeActionTheme, setNativeActionTheme } from './native-action-theme.mjs';

/** Capture actual native action controllers, including the lower scroll body. */
export async function nativeActionCaptures(page, name, check, { widths = [390, 320], forced = true } = {}) {
  const output = path.resolve('design/prism-league-actions-native-2026-11-07');
  fs.mkdirSync(output, { recursive: true });
  const states = ['dark', 'light'].flatMap(theme => widths.map(width => ({ theme, width, forced: false })));
  if (forced) states.push({ theme: 'light', width: 320, forced: true });
  for (const { theme, width, forced } of states) {
    await setNativeActionTheme(page, theme);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ forcedColors: forced ? 'active' : 'none' });
    const suffix = forced ? 'forced-320' : `${theme}-${width}`;
    const body = page.locator('.gx-sheet .gx-sheet-body').last();
    const scroller = await body.isVisible() ? body : page.locator('dialog[open]');
    await scroller.evaluate(el => { el.scrollTop = 0; });
    await check();
    expect(await page.evaluate(layoutProblems), `${name} ${suffix}`).toEqual([]);
    await assertNativeActionTheme(page, theme);
    await page.screenshot({ path: path.join(output, `${name}-${suffix}.png`) });
    if (await scroller.evaluate(el => el.scrollHeight > el.clientHeight + 1)) {
      await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await check();
      expect(await page.evaluate(layoutProblems), `${name} ${suffix} lower`).toEqual([]);
      await assertNativeActionTheme(page, theme);
      await page.screenshot({ path: path.join(output, `${name}-${suffix}-scrolled.png`) });
    }
    await scroller.evaluate(el => { el.scrollTop = 0; });
  }
  await page.emulateMedia({ forcedColors: 'none' });
}

export const nativeActionPairs = (page, name, check) => nativeActionCaptures(page, name, check, { widths: [390], forced: false });
