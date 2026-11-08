import { expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { layoutProblems } from './phone-layout.mjs';

/** Capture actual native action controllers, including the lower scroll body. */
export async function nativeActionCaptures(page, name, check) {
  const output = path.resolve('design/prism-league-actions-native-2026-11-07');
  fs.mkdirSync(output, { recursive: true });
  const states = ['dark', 'light'].flatMap(theme => [390, 320].map(width => ({ theme, width, forced: false })));
  states.push({ theme: 'light', width: 320, forced: true });
  for (const { theme, width, forced } of states) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ forcedColors: forced ? 'active' : 'none' });
    const suffix = forced ? 'forced-320' : `${theme}-${width}`;
    const body = page.locator('.gx-sheet.gx-nfl-action .gx-sheet-body').last();
    const scroller = await body.isVisible() ? body : page.locator('dialog.gx-nfl-action[open]');
    await scroller.evaluate(el => { el.scrollTop = 0; });
    await check();
    expect(await page.evaluate(layoutProblems), `${name} ${suffix}`).toEqual([]);
    await page.screenshot({ path: path.join(output, `${name}-${suffix}.png`) });
    if (await scroller.evaluate(el => el.scrollHeight > el.clientHeight + 1)) {
      await scroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
      await check();
      expect(await page.evaluate(layoutProblems), `${name} ${suffix} lower`).toEqual([]);
      await page.screenshot({ path: path.join(output, `${name}-${suffix}-scrolled.png`) });
    }
    await scroller.evaluate(el => { el.scrollTop = 0; });
  }
  await page.emulateMedia({ forcedColors: 'none' });
}
