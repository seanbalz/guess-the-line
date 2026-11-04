// Phone formatting across the new app, on local PGlite fixtures only (no hosted data). Contract: at 320 and 390 px,
// in Dark and Light, no visible text or icon leaves its control or the screen, nothing is clipped, and no two
// touchable controls overlap, on every root, section, Bets view, sheet and menu a player reaches from the tab bar.
// Added October 21, 2026 after Sean's screenshot of the Bets toolbar's clipped "Following" button.
import { test, expect } from '@playwright/test';
import { ALL } from '../migrations.mjs';
import { communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { sendBallot, storeLines } from '../helpers/guess-week.mjs';

const ADDRESSES = ['#home', '#home?layer=who', '#play', '#play/picks', '#play/picks?market=total', '#play/score', '#play/score?scoreGame=SEA-DEN', '#play/compare', '#play/points', '#play/features', '#play/features?layer=streaks', '#play/features?layer=awards', '#play/features?layer=season', '#play/features?layer=badge&item=bullseye', '#play/league', '#play/league?view=history&week=6',
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

// A populated League week (Week 6 · 2026): Luke's submitted Spread ballot gives the week layer real game rows. layoutProblems skips
// the body of a closed <details>, so each game disclosure is opened and its notes measured. A world of its own, because stored
// lines and a ballot change what Research shows, and that screen has its own measurement above.
test('a League week with games, every disclosure open, fits a phone at 320 and 390 in both themes and the wide font', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, prepare: WEEK6 });
  try {
    await storeLines(world.db, world.state, { spread: { 'SEA-DEN': -3.5, 'HOU-JAX': 6.5 }, total: { 'SEA-DEN': 41.5, 'HOU-JAX': 44.5 } });
    await sendBallot(world, 'luke', 'guess_spread', { 'SEA-DEN': -1.5, 'HOU-JAX': 4.5 });
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    const found = {};
    for (const { theme, width, wide = false } of PASSES) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.setViewportSize({ width, height: 844 });
      const pass = `${theme} ${width}${wide ? ' wide font' : ''}`;
      await open(page, '#play/league?view=history&week=6', wide);
      const games = page.locator('.gx-lg-game');
      await expect(games, `${pass}: the Week 6 layer lists Luke's two games`).toHaveCount(2);
      await games.evaluateAll(details => details.forEach(detail => { detail.open = true; }));
      await expect(page.locator('.gx-lg-notes li').first(), `${pass}: the opened notes show`).toBeVisible();
      const problems = await page.evaluate(layoutProblems);
      if (problems.length) found[`${pass} games open`] = problems;
    }
    expect(found).toEqual({});
  } finally {
    await world.db.close();
  }
});

// Contract (design fixes, November 4, 2026; carried onto picture rows by D-69 step 3): on Research › Games at 320 px with
// text enlarged to 200% (WCAG 1.4.4), everything a game row says (the matchup, the records line, the Spread and its
// word) stays inside the row and inside the screen. Text may wrap, never spill, clip or end in "…"; the name block and
// the number block never run into each other. A browser's 200% text setting doubles px type, so the check doubles each
// row element's computed font size and line height after the quotes have settled.
test('Research › Games keeps whole matchups and records inside their rows at 320 px with 200% text', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, prepare: WEEK6 });
  try {
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    await page.setViewportSize({ width: 320, height: 844 });
    for (const wide of [false, true]) {
      await open(page, '#research/games', wide);
      await expect(page.locator('button.gx-prow[data-game]')).toHaveCount(2);
      await expect(page.locator('button.gx-prow [data-cell="loading"]')).toHaveCount(0);
      const spills = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('button.gx-prow[data-game]')];
        const was = rows.flatMap(row => [row, ...row.querySelectorAll('*')]).filter(el => !el.closest('svg')).map(el => [el, getComputedStyle(el)]).map(([el, cs]) => [el, parseFloat(cs.fontSize), cs.lineHeight]);
        for (const [el, size, leading] of was) {
          el.style.setProperty('font-size', `${size * 2}px`, 'important');
          if (leading !== 'normal') el.style.setProperty('line-height', `${parseFloat(leading) * 2}px`, 'important');
        }
        const out = [], inside = (r, box) => r.left >= box.left - 1 && r.right <= box.right + 1;
        for (const row of rows) {
          const c = row.getBoundingClientRect(), main = row.querySelector('.gx-prow-main').getBoundingClientRect(), end = row.querySelector('.gx-prow-end').getBoundingClientRect();
          if (!inside(c, { left: 0, right: document.documentElement.clientWidth })) out.push(`${row.dataset.game}: row leaves the screen`);
          if (main.right > end.left + 1 && main.bottom > end.top + 1) out.push(`${row.dataset.game}: the name block runs into the Spread`);
          for (const el of row.querySelectorAll('*')) {
            if (el.closest('.gx-team') || el.closest('svg')) continue; // the mark's own code letters are hidden once its logo loads
            const r = el.getBoundingClientRect();
            for (const node of el.childNodes) {
              if (node.nodeType !== 3 || !node.textContent.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              for (const rect of range.getClientRects()) if (rect.width && !(inside(rect, r) && inside(rect, c))) out.push(`"${node.textContent.trim()}" leaves its box`);
            }
            if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible') out.push(`"${el.textContent.trim()}" is clipped`);
          }
        }
        // A word that fits its line is never split inside it (the title and the meta line wrap between words first).
        const measure = document.createElement('canvas').getContext('2d');
        for (const el of document.querySelectorAll('button.gx-prow[data-game] .gx-prow-title, button.gx-prow[data-game] .gx-prow-meta')) {
          const cs = getComputedStyle(el), room = el.getBoundingClientRect().width - 1;
          measure.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
          const text = el.firstChild;
          if (!text || text.nodeType !== 3) continue;
          for (const found of text.textContent.matchAll(/S+/g)) {
            const range = document.createRange();
            range.setStart(text, found.index);
            range.setEnd(text, found.index + found[0].length);
            const lines = new Set([...range.getClientRects()].filter(r => r.width).map(r => Math.round(r.top))).size;
            if (lines > 1 && measure.measureText(found[0]).width <= room) out.push(`"${found[0]}" breaks although it fits on one line`);
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

// Contract (quick win A1, November 4, 2026): on a short phone (320 x 640) the Menu sheet scrolls instead of squeezing
// its list. Every row, down to the last one (Appearance), keeps its 44px height, can be scrolled fully into the sheet's
// view and opens on a tap; in Dark and Light, as the commissioner (the longest Menu), with and without the Pick
// reminders row. Before the fix the flush list card shrank to fit, cut "Settings" in half and hid the last rows, and the
// sheet had nothing to scroll.
for (const reminders of [false, true]) {
  test(`the Menu scrolls to Appearance at 320 x 640 in both themes (${reminders ? 'with' : 'without'} Pick reminders)`, async ({ page, baseURL }) => {
    const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, ...(reminders ? { pushPublicKey: `B${'A'.repeat(86)}` } : {}) });
    try {
      await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto('/#home');
      await signIn(page, 'sean', { navigate: false });
      await expect(page.locator('[data-landing="home"]')).toBeVisible();
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
        await page.getByRole('button', { name: 'Your menu', exact: true }).click();
        const menu = page.getByRole('dialog', { name: 'Menu', exact: true });
        // The Community read that shows Commissioner tools has answered, so the reminders row is settled either way.
        await expect(menu.getByRole('button', { name: 'Commissioner tools', exact: true })).toBeVisible();
        await expect(menu.getByRole('button', { name: 'Pick reminders', exact: true })).toHaveCount(reminders ? 1 : 0);
        const rows = await menu.locator('.gx-link-row').evaluateAll(rows => rows.map(row => ({ name: row.textContent.trim(), height: row.getBoundingClientRect().height })));
        expect(rows.filter(row => row.height < 44), `${theme}: every Menu row keeps its 44px height`).toEqual([]);
        // No card cuts off its own rows (a clipping card can still be scrolled by script, never by a finger).
        const clipped = await menu.locator('.gx-link-row').evaluateAll(rows => rows.filter(row => {
          const r = row.getBoundingClientRect(), card = row.closest('.gx-card').getBoundingClientRect();
          return r.top < card.top - 1 || r.bottom > card.bottom + 1;
        }).map(row => row.textContent.trim()));
        expect(clipped, `${theme}: rows cut off inside their card`).toEqual([]);
        // Scroll the sheet's own scroller to its end, which is what a finger moves (never a card inside it).
        await menu.locator('.gx-sheet-body').evaluate(body => { body.scrollTop = body.scrollHeight; });
        const appearance = menu.getByRole('button', { name: 'Appearance', exact: true });
        await expect.poll(() => appearance.evaluate(row => {
          const r = row.getBoundingClientRect(), body = row.closest('.gx-sheet-body').getBoundingClientRect();
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { inside: r.top >= body.top - 1 && r.bottom <= body.bottom + 1 && r.height >= 44, hit: row.contains(hit) };
        }), `${theme}: Appearance scrolls fully into the sheet and takes the tap`).toEqual({ inside: true, hit: true });
        await appearance.click();
        await expect(page.getByRole('dialog').getByRole('heading', { name: 'Appearance', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      expect(world.errors).toEqual([]);
    } finally {
      await world.db.close();
    }
  });
}

// Contract (quick win A21, November 4, 2026): in a game sheet at 320 and 390 px, every button in the action bar keeps a
// one-line label and the bar's buttons share one height (it said "League bets" on two lines beside one-line buttons); the
// short "Bets" keeps its full name. Below 360 px the note's two buttons stack, each full width with a one-line label
// ("Refresh note" wrapped beside "Save note").
test('game sheet action bar and note buttons keep one-line labels at 320 and 390', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, prepare: WEEK6 });
  try {
    await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
    await page.goto('/#home');
    await signIn(page, 'luke', { navigate: false });
    await expect(page.locator('[data-landing="home"]')).toBeVisible();
    const lineCount = buttons => buttons.map(button => {
      const range = document.createRange();
      range.selectNodeContents(button);
      const box = button.getBoundingClientRect();
      return { label: button.textContent.trim(), lines: new Set([...range.getClientRects()].filter(r => r.width).map(r => Math.round(r.top))).size,
        height: Math.round(box.height), width: Math.round(box.width), parent: Math.round(button.parentElement.getBoundingClientRect().width) };
    });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await open(page, '#research/games');
      await page.locator('[data-game="SEA-DEN"]').click();
      const sheet = page.getByRole('dialog').last();
      const bar = sheet.getByRole('navigation', { name: 'Actions for this game', exact: true });
      await expect(bar.getByRole('button', { name: 'Open League bets for SEA at DEN', exact: true })).toHaveText('Bets');
      const dock = await bar.getByRole('button').evaluateAll(lineCount);
      expect(dock.map(button => button.label), `${width}px: the bar's buttons`).toEqual(['Spread', 'Total', 'Bets']);
      expect(dock.filter(button => button.lines > 1), `${width}px: one-line labels in the action bar`).toEqual([]);
      expect(new Set(dock.map(button => button.height)).size, `${width}px: one height across the bar ${JSON.stringify(dock)}`).toBe(1);
      // The game details (and the note in them) load on opening.
      await expect(sheet.locator('.gx-game-note-actions > button'), `${width}px: the note's two buttons`).toHaveCount(2, { timeout: 15000 });
      const note = await sheet.locator('.gx-game-note-actions > button').evaluateAll(lineCount);
      expect(note.filter(button => button.lines > 1), `${width}px: one-line note buttons`).toEqual([]);
      if (width < 360) expect(note.filter(button => button.width < button.parent - 1), '320px: the note buttons stack full width').toEqual([]);
      await page.keyboard.press('Escape');
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
