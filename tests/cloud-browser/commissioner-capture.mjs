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
    // Finish the finite sheet entrance before measuring its pinned viewport position.
    await page.locator('.gx-sheet').last().evaluate(async el => {
      await Promise.all(el.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    });
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
    const reading = await page.evaluate(() => {
      const layer = [...document.querySelectorAll('dialog[open], [role="dialog"]')].at(-1);
      // Paragraphs are operational reading by default. Only explicitly styled source,
      // clock, current-assignment and short status metadata may use the meta scale.
      return [...layer.querySelectorAll('p, .form-error, .callout, .result-review-details dd')]
        .filter(el => el.textContent.trim() && el.getClientRects().length && !el.closest('details:not([open])'))
        .map(el => ({ text: el.textContent.trim().slice(0, 100), font: parseFloat(getComputedStyle(el).fontSize),
          metadata: el.matches('.gx-t-meta, .panel-heading p') }));
    });
    const primary = await page.locator('.gx-cm-legacy .primary').evaluateAll(elements => elements.map(el => {
      const style = getComputedStyle(el), forced = matchMedia('(forced-colors: active)').matches;
      const probe = document.createElement('span'); probe.style.color = forced ? (el.disabled ? 'GrayText' : 'ButtonText') : `var(${el.disabled ? '--gx-text-2' : '--gx-primary-ink'})`;
      el.append(probe); const expectedInk = getComputedStyle(probe).color; probe.remove();
      return { disabled: el.disabled, background: style.backgroundColor, border: style.borderTopWidth,
        radius: style.borderTopLeftRadius, ink: style.color, borderColor: style.borderTopColor,
        expectedInk, outline: ['Top','Right','Bottom','Left'].every(side => style[`border${side}Width`] === '3px' && style[`border${side}Style`] === 'solid') };
    }));
    for (const recipe of primary) {
      expect(recipe.background, `${name} transparent primary`).toBe('rgba(0, 0, 0, 0)');
      expect(recipe.border, `${name} full primary outline`).toBe('3px');
      expect(recipe.radius, `${name} primary corners`).toBe('20px');
      expect(recipe.outline, `${name} four-sided primary outline`).toBe(true);
      expect(recipe.ink, `${name} primary enabled/disabled theme ink`).toBe(recipe.expectedInk);
    }
    expect(reading.filter(m => m.font < (m.metadata ? 13 : 16)), `${name} primary reading floor`).toEqual([]);
    const pinned = await page.evaluate(() => {
      if (document.querySelector('dialog[open]')) return null;
      const tool = document.querySelector('[data-commissioner-tool]')?.dataset.commissionerTool;
      if (!['referees', 'odds', 'epl-corrections', 'results'].includes(tool)) return null;
      const panel = document.querySelector('.gx-cm'), foot = panel.querySelector('.gx-sheet-foot'), body = panel.querySelector('.gx-sheet-body');
      if (!foot) return { missing: true, tool };
      const original = body.scrollTop; body.scrollTop = 0;
      const top = foot.getBoundingClientRect(); body.scrollTop = body.scrollHeight;
      const bottom = foot.getBoundingClientRect(), bodyRect = body.getBoundingClientRect(); body.scrollTop = original;
      return { tool, missing: false, geometry: { top: top.toJSON(), bottom: bottom.toJSON(), body: bodyRect.toJSON(), viewport: innerHeight }, stationary: Math.abs(top.y - bottom.y) < 1,
        visible: bottom.top >= -1 && bottom.bottom <= innerHeight + 1 && bodyRect.bottom <= bottom.top + 1,
        forms: [...foot.querySelectorAll('button[type="submit"]')].map(button => ({ id: button.getAttribute('form'),
          associated: !!button.form && body.contains(button.form), unique: [...document.querySelectorAll('form')].filter(form => form.id === button.form?.id).length === 1 })) };
    });
    if (pinned) {
      expect(pinned.missing, `${name} tool footer exists`).toBe(false);
      expect(pinned.stationary && pinned.visible, `${name} footer stays visible during body scroll ${JSON.stringify(pinned.geometry)}`).toBe(true);
      expect(pinned.forms.every(form => form.id && form.associated && form.unique), `${name} real external submit association`).toBe(true);
    }
    expect(metrics.filter(m => m.width < 43.9 || m.height < 43.9), `${name} touch targets`).toEqual([]);
    expect(metrics.filter(m => m.font < 16), `${name} native action labels`).toEqual([]);
    expect((await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations, `${name} accessibility`).toEqual([]);
    const file = `${name}-${forcedColors === 'active' ? 'forced' : theme}-${width}`;
    const body = page.locator('.gx-sheet-body').last();
    const scroller = await page.locator('dialog[open]').count() ? page.locator('dialog[open]').last() : body;
    const scrollTo = async bottom => {
      await scroller.evaluate(async (el, bottom) => {
        el.scrollTo({ top: bottom ? el.scrollHeight : 0, behavior: 'instant' });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, bottom);
      await expect.poll(() => scroller.evaluate((el, bottom) => Math.abs(el.scrollTop - (bottom ? el.scrollHeight - el.clientHeight : 0)) < 1, bottom)).toBe(true);
    };
    await scrollTo(false);
    await page.screenshot({ path: info.outputPath(`${file}.png`) });
    if (width === 390 && await scroller.evaluate(el => el.scrollHeight > el.clientHeight + 1)) {
      await scrollTo(true);
      if (await page.locator('dialog[open]').count()) {
        await expect(page.locator('dialog[open] .review-actions button').last()).toBeInViewport({ ratio: 1 });
      }
      await page.screenshot({ path: info.outputPath(`${file}-bottom.png`) });
      await scrollTo(false);
    }
    fs.writeFileSync(info.outputPath(`${file}.json`), JSON.stringify({ name, theme, width, forcedColors, preference: theme, computedThemeVerified: true, metrics, reading, primary, pinned, layoutProblems: [], axeViolations: [] }, null, 2));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await setCaptureTheme(page, 'dark', { forcedColors: 'none' });
}
