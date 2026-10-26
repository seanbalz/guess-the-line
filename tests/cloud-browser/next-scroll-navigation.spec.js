// UX-NEXT-01 (planning/mobile-bets-followups.md, queue Q03): the tab bar stays at the bottom of the screen while a page
// scrolls, and nothing on the page is stranded behind it or the top bar. Sean reported the footer menu "halfway up the
// screen" while scrolling Bets → Recommended (October 15). On local PGlite fixtures only (no hosted data), at 390 x 844
// and 320 x 568, in Dark and Light, on every tab root and the long Bets and Play pages:
// - at the top, middle and end of the page, and after the window gets shorter and taller again (a phone's toolbar
//   showing and hiding), the tab bar's bottom is the screen's bottom, its tabs are what a tap there reaches, and the
//   top bar is still at the top;
// - no ancestor of the tab bar, the dock or the top bar gives it a containing block (a transform, filter,
//   backdrop-filter, perspective, contain or will-change on an ancestor makes a fixed bar scroll away with the page);
// - the page never scrolls sideways (a wider page lets a phone zoom out and leaves fixed bars mid-screen);
// - at the end of the page, its last content sits above the tab bar;
// - each control reached with Tab is shown whole between the top bar and the tab bar (WCAG 2.4.11), not under them.
// A real iPhone (Safari and the Home Screen app) is still needed to close UX-NEXT-01; Chromium cannot show iOS's
// toolbar or keyboard behavior.
import { test, expect } from '@playwright/test';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

const ADDRESSES = ['#home', '#play', '#play/picks', '#play/league?view=feed', '#play/league?view=history', '#bets', '#bets/recommended', '#bets/active',
  '#bets/virtual', '#bets/everyone', '#research', '#research/games', '#research/trends', '#history', '#history/bets'];
const PASSES = [{ theme: 'dark', width: 390, height: 844 }, { theme: 'light', width: 320, height: 568 }];
// Tab presses per page; enough to walk past the first screenful on every page above.
const TAB_PRESSES = 40;

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(300000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

/** Runs in the page: what is wrong with the bars at the current scroll position. */
function barProblems() {
  const out = [];
  const height = innerHeight, width = document.documentElement.clientWidth;
  const bar = document.querySelector('.gx-tabbar'), top = document.querySelector('.gx-topbar');
  if (!bar || !top) return ['the tab bar or top bar is missing'];
  const b = bar.getBoundingClientRect(), t = top.getBoundingClientRect();
  if (Math.abs(b.bottom - height) > 1) out.push(`tab bar bottom at ${Math.round(b.bottom)}, screen bottom ${height}`);
  if (Math.abs(t.top) > 1) out.push(`top bar top at ${Math.round(t.top)}`);
  for (const button of bar.querySelectorAll('button')) {
    const r = button.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit || !button.contains(hit)) out.push(`a tap on "${button.textContent.trim()}" reaches ${hit ? hit.tagName.toLowerCase() + '.' + hit.className : 'nothing'}`);
  }
  const traps = [];
  for (const fixed of [bar, top, document.querySelector('.gx-dock')].filter(Boolean)) {
    for (let n = fixed.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const contain = /paint|layout|strict|content/.test(s.contain);
      const will = /transform|filter|perspective/.test(s.willChange);
      if (s.transform !== 'none' || s.filter !== 'none' || (s.backdropFilter && s.backdropFilter !== 'none')
        || s.perspective !== 'none' || contain || will || s.translate !== 'none' || s.scale !== 'none' || s.rotate !== 'none') {
        traps.push(`${fixed.className.split(' ')[0]} inside ${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}`);
      }
    }
  }
  out.push(...traps.map(trap => `containing block: ${trap}`));
  if (document.documentElement.scrollWidth > width + 1) out.push(`page scrolls sideways (${document.documentElement.scrollWidth} > ${width})`);
  return out;
}

/** Runs in the page at the end of the scroll: the page's last content must sit above the tab bar. */
function endProblems() {
  const limit = document.querySelector('.gx-tabbar').getBoundingClientRect().top;
  const main = document.querySelector('.gx-main');
  let lowest = null, bottom = -Infinity;
  for (const el of main.querySelectorAll('*')) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || s.visibility === 'hidden' || s.position === 'fixed' || s.position === 'sticky' || el.closest('.gx-sr, [aria-hidden="true"]')) continue;
    // A closed <details> draws only its summary; Chromium still gives the hidden body boxes. At every level: a nested
    // <details> inside a closed one is hidden too, its summary included (Research > Trends' "Matchup evidence").
    let hidden = false;
    for (let shut = el.closest('details:not([open])'); shut && !hidden; shut = shut.parentElement?.closest('details:not([open])')) {
      hidden = !el.closest('summary')?.parentElement?.isSameNode(shut);
    }
    if (hidden) continue;
    // Only the part a player can see counts: an ancestor that clips or scrolls its overflow cuts the box.
    let low = r.bottom, high = r.top;
    for (let n = el.parentElement; n && n !== main; n = n.parentElement) {
      const ns = getComputedStyle(n);
      if (ns.overflowY === 'visible' && ns.overflowX === 'visible') continue;
      const c = n.getBoundingClientRect();
      low = Math.min(low, c.bottom); high = Math.max(high, c.top);
    }
    if (low - high < 2) continue;
    if (low > bottom) { bottom = low; lowest = el; }
  }
  if (!lowest || bottom <= limit + 1) return [];
  return [`last content ${lowest.tagName.toLowerCase()} "${(lowest.getAttribute('aria-label') || lowest.textContent).trim().slice(0, 40)}" ends at ${Math.round(bottom)}, under the tab bar at ${Math.round(limit)}`];
}

/** Runs in the page after a Tab press: the focused control must show whole between the bars. */
function focusProblem() {
  const el = document.activeElement;
  if (!el || el === document.body || !el.closest('.gx-main') || el.closest('.gx-layer, dialog')) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const above = document.querySelector('.gx-topbar').getBoundingClientRect().bottom;
  const below = Math.min(document.querySelector('.gx-tabbar').getBoundingClientRect().top,
    ...[...document.querySelectorAll('.gx-dock-bar, .gx-play-save-dock')].filter(d => d !== el && !d.contains(el)).map(d => d.getBoundingClientRect().top));
  // A control taller than the space between the bars cannot show whole; its top must then show.
  const room = below - above;
  if (r.height > room) return r.top >= above - 1 && r.top < below ? null : `${label(el)} (taller than the screen) starts outside it`;
  if (r.top >= above - 1 && r.bottom <= below + 1) return null;
  return `${label(el)} at ${Math.round(r.top)}–${Math.round(r.bottom)}, visible between ${Math.round(above)} and ${Math.round(below)}`;
  function label(node) { return `${node.tagName.toLowerCase()} "${(node.getAttribute('aria-label') || node.textContent).trim().replace(/\s+/g, ' ').slice(0, 40)}"`; }
}

async function open(page, address) {
  await page.goto('about:blank');
  await page.goto(`/${address}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.gx-tabbar')).toBeVisible();
}

const scrollTo = (page, where) => page.evaluate(value => {
  const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  window.scrollTo(0, value === 'end' ? max : value === 'middle' ? Math.round(max / 2) : 0);
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}, where);

test('the tab bar stays at the bottom while every page scrolls, and nothing is left behind it', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  try {
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    const found = {};
    const note = (label, problems) => { if (problems.length) found[label] = [...new Set([...(found[label] || []), ...problems])]; };
    for (const { theme, width, height } of PASSES) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.setViewportSize({ width, height });
      for (const address of ADDRESSES) {
        const label = `${theme} ${width}x${height} ${address}`;
        await open(page, address);
        for (const where of ['top', 'middle', 'end']) {
          await scrollTo(page, where);
          note(label, (await page.evaluate(barProblems)).map(p => `${where}: ${p}`));
        }
        note(label, await page.evaluate(endProblems));
        // The toolbar hides and shows mid-page: the bar follows the screen's bottom both ways.
        await scrollTo(page, 'middle');
        for (const h of [height - 90, height]) {
          await page.setViewportSize({ width, height: h });
          await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          note(label, (await page.evaluate(barProblems)).map(p => `window ${h} tall: ${p}`));
        }
        // Keyboard: walk forward from the top of the page.
        await scrollTo(page, 'top');
        await page.locator('.gx-main').evaluate(main => { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); main.removeAttribute('tabindex'); });
        for (let i = 0; i < TAB_PRESSES; i++) {
          await page.keyboard.press('Tab');
          const problem = await page.evaluate(focusProblem);
          if (problem) note(label, [`Tab ${i + 1}: ${problem}`]);
        }
      }
    }
    expect(found).toEqual({});
  } finally {
    await world.db.close();
  }
});

// Each check above must fail when the failure it guards is put back, or a passing run proves nothing.
test('each check reports the failure it guards against', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  try {
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 568 });
    const withFault = async (address, css) => { await open(page, address); await page.addStyleTag({ content: css }); };

    // A filter on an ancestor makes the fixed tab bar scroll away with the page (the "halfway up the screen" picture).
    await withFault('#research/trends', '.gx-app { filter: saturate(1); }');
    await scrollTo(page, 'middle');
    const trapped = (await page.evaluate(barProblems)).join(' | ');
    expect(trapped).toMatch(/containing block: gx-tabbar inside div\.gx-app/);
    expect(trapped).toMatch(/tab bar bottom at/);

    // Something wider than the screen lets the page scroll sideways.
    await withFault('#home', '.gx-main::after { content: ""; display: block; width: 2000px; height: 1px; }');
    expect((await page.evaluate(barProblems)).join(' | ')).toMatch(/page scrolls sideways/);

    // Without the room the frame keeps for the tab bar, the page's end stays under it.
    await withFault('#research/trends', '.gx-app { padding-bottom: 0 !important; }');
    await scrollTo(page, 'end');
    expect((await page.evaluate(endProblems)).join(' | ')).toMatch(/under the tab bar/);

    // Without scroll padding, Tab brings a control into view under the tab bar.
    await withFault('#home', ':root { scroll-padding: 0 !important; }');
    await page.locator('.gx-main').evaluate(main => { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); main.removeAttribute('tabindex'); });
    const hidden = [];
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); const problem = await page.evaluate(focusProblem); if (problem) hidden.push(problem); }
    expect(hidden.join(' | ')).toMatch(/visible between/);
  } finally {
    await world.db.close();
  }
});
