// Phone formatting across the new app, on local PGlite fixtures only (no hosted data). Contract: at 320 and 390 px,
// in Dark and Light, no visible text or icon leaves its control or the screen, nothing is clipped, and no two
// touchable controls overlap, on every root, section, Bets view, sheet and menu a player reaches from the tab bar.
// Added October 21, 2026 after Sean's screenshot of the Bets toolbar's clipped "Following" button.
import { test, expect } from '@playwright/test';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

const ADDRESSES = ['#home', '#play', '#play/picks', '#play/picks?market=total', '#play/score', '#play/compare', '#play/features', '#play/league',
  '#play/league?view=feed', '#play/league?view=board', '#play/league?view=history', '#bets', '#bets/active', '#bets/settled', '#bets/recommended',
  '#bets/virtual', '#bets/everyone', '#bets/add', '#groups', '#research', '#research/games', '#research/fantasy', '#research/trends',
  // Me › History (stage 73).
  '#history', '#history/bets', '#history/older'];
const BET_VIEWS = ['feed', 'myweek', 'compare', 'history'];
// Two passes cover both themes and both phone widths. The third draws reading text in a wide system sans, because a
// phone whose web fonts do not load (and CI's Linux runner, October 21) falls back from Figtree to wider letters than
// Windows draws, and the layout must still hold. Display and number fonts keep their own condensed fallbacks.
const PASSES = [{ theme: 'dark', width: 320 }, { theme: 'light', width: 390 }, { theme: 'light', width: 320, wide: true }];
const WIDE_FONT = '.gx { --gx-font-body: Verdana, "DejaVu Sans", sans-serif !important; }';
// The committed trends file is 2026 Week 6, so the game sheet has trend rows and an All trends sheet to check.
const WEEK6 = state => {
  state.league.season = 2026; state.league.week = 6;
  const [a, b] = state.games;
  state.games = [{ ...a, id: 'SEA-DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', awayCode: 'SEA', homeCode: 'DEN', matchup: 'Seattle Seahawks @ Denver Broncos' },
    { ...b, id: 'HOU-JAX', away: 'Houston Texans', home: 'Jacksonville Jaguars', awayCode: 'HOU', homeCode: 'JAX', matchup: 'Houston Texans @ Jacksonville Jaguars' }];
};

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

async function open(page, address, wide = false) {
  await page.goto('about:blank');
  await page.goto(`/${address}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.gx')).toBeVisible();
  if (wide) await page.addStyleTag({ content: WIDE_FONT });
}

test('every new-app screen, sheet and menu fits a phone: no clipped text, stray icons or overlapping controls', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, prepare: WEEK6 });
  try {
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    const found = {};
    const check = async label => { const problems = await page.evaluate(layoutProblems); if (problems.length) found[label] = problems; };
    for (const { theme, width, wide = false } of PASSES) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.setViewportSize({ width, height: 844 });
      const pass = `${theme} ${width}${wide ? ' wide font' : ''}`;
      for (const address of ADDRESSES) {
        await open(page, address, wide);
        await check(`${pass} ${address}`);
        if (address === '#home') {
          await page.getByRole('button', { name: 'Your menu', exact: true }).click();
          await check(`${pass} ${address} menu`);
        }
        if (address === '#play/league?view=feed') {
          // The league feed (stages 64 and 65): a post's comments sheet and the reactions picker.
          const post = page.locator('.gx-feed-post').first();
          await post.getByRole('button', { name: 'Comment' }).click();
          await check(`${pass} feed comments`);
          await page.keyboard.press('Escape');
          await post.getByRole('button', { name: 'Add a reaction' }).click();
          await check(`${pass} feed reactions picker`);
          await page.keyboard.press('Escape');
        }
        if (address === '#bets/active') {
          for (const value of BET_VIEWS) {
            const trackerView=page.getByLabel('Bet tracker view',{exact:true});
            if(!await trackerView.isVisible())await page.locator('.social-filters > summary').click();
            await trackerView.selectOption(value);
            await page.waitForLoadState('networkidle');
            await check(`${pass} ${address} view ${value}`);
          }
        }
        if (address === '#research/games') {
          await page.locator('[data-game]').first().click();
          await check(`${pass} game sheet`);
          await page.getByRole('button', { name: /^All trends/ }).click();
          await check(`${pass} all trends`);
          await open(page, address, wide);
          await page.getByRole('button', { name: 'Open weekly research', exact: true }).click();
          await check(`${pass} weekly research`);
        }
      }
    }
    expect(found).toEqual({});
  } finally {
    await world.db.close();
  }
});

// Contract (design fixes, November 4, 2026): on Research › Games at 320 px with text enlarged to 200% (WCAG 1.4.4),
// every team's whole name and record stay inside their card. A name may wrap, never spill, clip or end in "…" (AUD-01
// kept full team names); the record wraps under it first, so a name that fits its line is never split inside a word;
// and the two team rows never run into each other. A browser's 200% text setting doubles px
// type, so the check doubles each card element's computed font size and line height after the quotes have settled.
test('Research › Games keeps whole team names and records inside their cards at 320 px with 200% text', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, prepare: WEEK6 });
  try {
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    for (const wide of [false, true]) {
      await open(page, '#research/games', wide);
      await expect(page.locator('.gx-l-card')).toHaveCount(2);
      await expect(page.locator('.gx-l-card [data-cell="loading"]')).toHaveCount(0);
      const spills = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.gx-l-card')];
        const was = cards.flatMap(card => [card, ...card.querySelectorAll('*')]).filter(el => !el.closest('svg')).map(el => [el, getComputedStyle(el)]).map(([el, cs]) => [el, parseFloat(cs.fontSize), cs.lineHeight]);
        for (const [el, size, leading] of was) {
          el.style.setProperty('font-size', `${size * 2}px`, 'important');
          if (leading !== 'normal') el.style.setProperty('line-height', `${parseFloat(leading) * 2}px`, 'important');
        }
        const out = [], inside = (r, box) => r.left >= box.left - 1 && r.right <= box.right + 1;
        for (const card of cards) {
          const c = card.getBoundingClientRect(), teams = [...card.querySelectorAll('.gx-l-team')];
          if (!inside(c, { left: 0, right: document.documentElement.clientWidth })) out.push(`${card.dataset.game}: card leaves the screen`);
          if (teams.length !== 2) out.push(`${card.dataset.game}: ${teams.length} team rows`);
          else if (teams[0].getBoundingClientRect().bottom > teams[1].getBoundingClientRect().top + 1) out.push(`${card.dataset.game}: the team rows overlap`);
          for (const team of teams) {
            const t = team.getBoundingClientRect();
            if (!inside(t, c)) out.push(`${team.textContent}: team row leaves its card`);
            // The mark's own code letters are hidden once its logo loads; everything else with text is checked.
            for (const el of team.querySelectorAll('*')) {
              if (el.closest('.gx-team')) continue;
              const r = el.getBoundingClientRect();
              for (const node of el.childNodes) {
                if (node.nodeType !== 3 || !node.textContent.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                for (const rect of range.getClientRects()) if (rect.width && !(inside(rect, r) && inside(rect, t) && inside(rect, c))) out.push(`"${node.textContent.trim()}" leaves its box`);
              }
              if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') out.push(`"${el.textContent.trim()}" is clipped`);
            }
            // The record gives way first: a name that fits on one line beside the mark is never broken inside a word.
            const name = team.querySelector('.gx-t-strong'), cs = getComputedStyle(name), measure = document.createElement('canvas').getContext('2d');
            measure.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const range = document.createRange();
            range.selectNodeContents(name);
            const lines = new Set([...range.getClientRects()].filter(r => r.width).map(r => Math.round(r.top))).size;
            if (lines > 1 && measure.measureText(name.textContent).width <= name.parentElement.getBoundingClientRect().width - 1) out.push(`"${name.textContent}" breaks although it fits on one line`);
          }
        }
        return [...new Set(out)];
      });
      expect(spills, `320 px, 200% text${wide ? ', wide fallback font' : ''}`).toEqual([]);
    }
  } finally {
    await world.db.close();
  }
});

// Contract: a pair of action buttons shares a row only when both labels fit on one line (the score page's
// "View this week’s picks" used to wrap to two lines beside a one-line button), and the Pick'em chip keeps at
// least 8px between its label and its border like the team chips beside it.
test('score buttons keep one-line labels and Pick’em keeps its padding at 320 and 390', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  try {
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    // Sign-in must land before the first navigation, or the reload can reopen signed out.
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page, '#play/score');
      await expect(page.getByRole('button', { name: 'View this week’s picks', exact: true })).toBeVisible();
      const lines = await page.locator('.gx-score-navigation > button').evaluateAll(buttons => buttons.map(button => {
        const range = document.createRange();
        range.selectNodeContents(button);
        return { label: button.textContent.trim(), lines: new Set([...range.getClientRects()].filter(r => r.width).map(r => Math.round(r.top))).size };
      }));
      expect(lines.filter(item => item.lines > 1), `${width}px`).toEqual([]);
      await open(page, '#play/picks');
      await page.locator('.gx-per-game [data-tile]').first().click(); // D-70: the picker is on a game's own card
      const pickem = page.locator('button[data-side="pickem"]').first();
      await expect(pickem).toBeVisible();
      const gap = await pickem.evaluate(button => {
        const box = button.getBoundingClientRect(), range = document.createRange();
        range.selectNodeContents(button);
        const text = [...range.getClientRects()].filter(r => r.width).reduce((a, r) => ({ left: Math.min(a.left, r.left), right: Math.max(a.right, r.right) }), { left: Infinity, right: -Infinity });
        return Math.min(text.left - box.left, box.right - text.right);
      });
      expect(gap, `${width}px Pick’em label inset`).toBeGreaterThanOrEqual(8);
    }
  } finally {
    await world.db.close();
  }
});
