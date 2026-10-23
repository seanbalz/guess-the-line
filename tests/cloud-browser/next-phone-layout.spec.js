// Phone formatting across the new app, on local PGlite fixtures only (no hosted data). Contract: at 320 and 390 px,
// in Dark and Light, no visible text or icon leaves its control or the screen, nothing is clipped, and no two
// touchable controls overlap, on every root, section, Bets view, sheet and menu a player reaches from the tab bar.
// Added October 21, 2026 after Sean's screenshot of the Bets toolbar's clipped "Following" button.
import { test, expect } from '@playwright/test';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

const ADDRESSES = ['#home', '#play', '#play/picks', '#play/picks?market=total', '#play/score', '#play/compare', '#play/league',
  '#play/league?view=board', '#play/league?view=history', '#bets', '#bets/active', '#bets/settled', '#bets/recommended',
  '#bets/virtual', '#bets/everyone', '#bets/add', '#groups', '#research', '#research/games', '#research/fantasy', '#research/trends'];
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
        if (address === '#bets/active') {
          for (const value of BET_VIEWS) {
            await page.getByLabel('Bet tracker view').selectOption(value);
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
