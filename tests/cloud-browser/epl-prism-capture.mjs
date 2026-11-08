import fs from 'node:fs';
import crypto from 'node:crypto';
import { expect } from '@playwright/test';
import { setCaptureTheme, assertCaptureTheme } from './theme-capture.mjs';

async function readingProof(page, state) {
  // Paragraphs are reading by default. Only explicit source/time/status metadata
  // is classified as metadata in native markup; a typography class cannot exempt prose.
  const primaryReading = await page.locator('.gx-epl p:not([data-epl-text="metadata"]), .gx-epl label, .gx-epl legend, .gx-epl button, .gx-epl summary, .gx-epl input, .gx-epl select, .gx-epl .gx-t-body, .gx-epl .gx-epl-club-code, .gx-epl .gx-epl-queue-name, .gx-epl .gx-epl-node-name, .gx-epl .gx-epl-fx-player-name, .gx-epl .gx-epl-fx-bubble-name, .gx-epl .gx-epl-fx-stand-name').evaluateAll(nodes => nodes.flatMap(n => {
    if (!n.getClientRects().length || n.closest('details:not([open]) :not(summary)')) return [];
    const readings = [{ text: n.textContent.trim() || n.getAttribute('aria-label') || n.tagName, fontSize: getComputedStyle(n).fontSize }];
    if (n.matches('button, summary, label, legend')) {
      const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const text = walker.currentNode, parent = text.parentElement;
        if (text.textContent.trim() && parent.getClientRects().length && !parent.closest('[aria-hidden="true"]')) readings.push({ text: text.textContent.trim(), fontSize: getComputedStyle(parent).fontSize });
      }
    }
    return readings;
  }));
  expect(primaryReading.filter(n => parseFloat(n.fontSize) < 16), `${state} 16px primary reading including guidance and recovery prose`).toEqual([]);
  const revealGlyphs = await page.locator('.gx-epl details[open] > summary').filter({ hasText: 'Revealed guesses' }).evaluateAll(nodes => nodes.map(n => getComputedStyle(n, '::after').content));
  expect(revealGlyphs.every(content => content === '"\u2212"'), `${state} expanded reveal uses the minus glyph`).toBe(true);
  const theme = await page.evaluate(() => ({ storedPreference: localStorage.getItem('gtl.theme'), preference: document.documentElement.dataset.themePreference, resolved: document.documentElement.dataset.theme, canvasToken: getComputedStyle(document.querySelector('.gx')).getPropertyValue('--gx-canvas').trim(), forcedColors: matchMedia('(forced-colors: active)').matches }));
  return { primaryReading, revealGlyphs, computedTheme: theme };
}

export async function captureEpl(page, state, reference, { representative = false, forced = false } = {}) {
  const directory = '.local/prism-epl-captures';
  fs.mkdirSync(directory, { recursive: true });
  const selected = process.env.GTL_EPL_CAPTURE_STATES?.split(',');
  const enabled = process.env.GTL_EPL_CAPTURE === '1' && (!selected || selected.includes(state));
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
    const targets = await page.locator('.gx-epl button, .gx-epl summary, .gx-epl input, .gx-epl select').evaluateAll(nodes => nodes.filter(n=>n.getClientRects().length&&!n.closest('details:not([open]) :not(summary)')).flatMap(n=>{
      const r=n.getBoundingClientRect();return r.width<43.9||r.height<43.9?[{text:n.textContent,w:r.width,h:r.height}]:[];
    }));
    expect(targets, `${state} 44px targets`).toEqual([]);
    const proof = await readingProof(page, state);
    if (!enabled) continue;
    for (const position of ['full','scrolled']) {
      if(position==='scrolled')await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      await assertCaptureTheme(page,theme);
      const file=`${state}-${theme}-${width}-${position}.png`,path=`${directory}/${file}`;
      await page.screenshot({path,fullPage:position==='full'});
      fs.appendFileSync(`${directory}/captures.jsonl`,JSON.stringify({state,theme,width,position,file,reference,...proof,capturedAtUTC:new Date().toISOString(),sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')})+'\n');
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
      const proof = await readingProof(page, state);
      if(enabled){const file=`${state}-${theme}-320-forced.png`,path=`${directory}/${file}`;await page.screenshot({path,fullPage:true});fs.appendFileSync(`${directory}/captures.jsonl`,JSON.stringify({state,theme,width:320,forced:true,file,reference,...proof,capturedAtUTC:new Date().toISOString(),sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')})+'\n');}
    }
    await setCaptureTheme(page,'dark',{forcedColors:'none'});
  }
}
