import fs from 'node:fs';
import crypto from 'node:crypto';
import { expect } from '@playwright/test';
import { setCaptureTheme, assertCaptureTheme } from './theme-capture.mjs';

export async function captureEpl(page, state, reference, { representative = false, forced = false } = {}) {
  const directory = '.local/prism-epl-captures';
  fs.mkdirSync(directory, { recursive: true });
  const enabled = process.env.GTL_EPL_CAPTURE === '1';
  for (const theme of ['dark', 'light']) for (const width of representative ? [320,390,768,1440] : [320,390]) {
    await setCaptureTheme(page, theme);
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.scrollTo(0,0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${state}/${theme}/${width} overflow`).toBe(true);
    const circles = await page.locator('.gx-epl .gx-epl-crest').evaluateAll(marks => marks.filter(mark => {
      const rect=mark.getBoundingClientRect(),css=getComputedStyle(mark);
      return rect.width > 0 && (Math.abs(rect.width-rect.height)>.5 || parseFloat(css.borderTopLeftRadius)<rect.width/2 && !css.borderTopLeftRadius.includes('%'));
    }).map(mark=>mark.className));
    expect(circles, `${state} all club crests have individual circles`).toEqual([]);
    const targets = await page.locator('.gx-epl button, .gx-epl summary').evaluateAll(nodes => nodes.filter(n=>n.getClientRects().length&&!n.closest('details:not([open]) :not(summary)')).flatMap(n=>{
      const r=n.getBoundingClientRect();return r.width<43.9||r.height<43.9?[{text:n.textContent,w:r.width,h:r.height}]:[];
    }));
    expect(targets, `${state} 44px targets`).toEqual([]);
    const primary = await page.locator('.gx-epl .gx-t-body, .gx-epl .gx-epl-club-code, .gx-epl .gx-epl-queue-name, .gx-epl .gx-epl-node-name, .gx-epl .gx-epl-fx-player-name, .gx-epl .gx-epl-fx-bubble-name, .gx-epl .gx-epl-fx-stand-name, .gx-epl .gx-epl-shell-notice > p').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&parseFloat(getComputedStyle(n).fontSize)<16).map(n=>({text:n.textContent,font:getComputedStyle(n).fontSize})));
    expect(primary, `${state} 16px primary reading`).toEqual([]);
    if (!enabled) continue;
    for (const position of ['full','scrolled']) {
      if(position==='scrolled')await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      await assertCaptureTheme(page,theme);
      const file=`${state}-${theme}-${width}-${position}.png`,path=`${directory}/${file}`;
      await page.screenshot({path,fullPage:position==='full'});
      fs.appendFileSync(`${directory}/captures.jsonl`,JSON.stringify({state,theme,width,position,file,reference,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')})+'\n');
    }
  }
  if(forced){
    for(const theme of ['dark','light']){
      await setCaptureTheme(page,theme,{forcedColors:'active'});await page.setViewportSize({width:320,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const selectedColors = await page.locator('.gx-epl .gx-seg-btn[aria-pressed="true"], .gx-epl .gx-epl-guess-club[aria-pressed="true"]').evaluateAll(nodes=>{
        const probe=document.createElement('span');probe.style.cssText='position:fixed;visibility:hidden;color:HighlightText;background:Highlight;forced-color-adjust:none';document.body.append(probe);const expected=getComputedStyle(probe),ink=expected.color,fill=expected.backgroundColor;
        const bad=nodes.filter(n=>n.getClientRects().length&&(getComputedStyle(n).color!==ink||getComputedStyle(n).backgroundColor!==fill)).map(n=>n.textContent);probe.remove();return bad;
      });
      expect(selectedColors, `${state} selected controls use system selection colors`).toEqual([]);

      if(enabled){const file=`${state}-${theme}-320-forced.png`,path=`${directory}/${file}`;await page.screenshot({path,fullPage:true});fs.appendFileSync(`${directory}/captures.jsonl`,JSON.stringify({state,theme,width:320,forced:true,file,reference,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')})+'\n');}
    }
    await setCaptureTheme(page,'dark',{forcedColors:'none'});
  }
}
