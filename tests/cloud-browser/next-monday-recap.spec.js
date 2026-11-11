import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';

// Monday recap (design/monday-recap-2026-11-05) on the real app and handler with every migration on local PGlite. The
// prior week's Monday is staged over the world's own replies: `/personal` lists the week before the open one, and that
// week's `/lines/read` and `/league/comparison` answer with fictional fixtures (a Sunday final and a Monday night game
// still to play). Troy's Monday guess arrives with numbers although Luke's gate for it is shut, so the page must never
// show them (D-31's second gate). Checked: Home's entry, Open recap, the week, one game's matchup, the lips and Back,
// and the phone rules (no sideways scroll, 44 px targets, no text under 12 px, nothing clipped, layout checks, axe) at
// 320 and 390 px in Dark and Light, with screenshots. Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

const LUKE = ACCOUNTS.luke.id, TROY = ACCOUNTS.troy.id, SEAN = ACCOUNTS.sean.id;
const HOUR = 3_600_000, AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const SCREENS = path.resolve('.local/monday-recap-screens');
const api = name => url => url.origin === SUPABASE && url.pathname === `/functions/v1/gtl-api/${name}`;
const iso = ms => new Date(ms).toISOString();

/** The staged prior week: SEA @ DEN final yesterday (DEN 27, SEA 20), MIA @ GB tonight. */
function fixtures(season, week) {
  const now = Date.now(), sunday = iso(now - 26 * HOUR), monday = iso(now + 3 * HOUR);
  const SUN = { id: 'SEA-DEN', awayCode: 'SEA', homeCode: 'DEN', away: 'Seattle Seahawks', home: 'Denver Broncos', kickoff: sunday };
  const MNF = { id: 'MIA-GB', awayCode: 'MIA', homeCode: 'GB', away: 'Miami Dolphins', home: 'Green Bay Packers', kickoff: monday };
  const ref = value => ({ value, source: 'Fixture median', observedAt: iso(now - 50 * HOUR), basis: 'saved', status: 'available' });
  const pick = (gameId, guess, line, points) => ({ gameId, guess, points, reference: ref(line), lockedIn: true, lockedAt: iso(now - 48 * HOUR), hidden: false });
  const entry = (userId, picks, weekPoints) => ({ userId, mode: 'guess_spread', status: 'submitted', submittedAt: iso(now - 48 * HOUR), eligible: true, eligibility: 'standard', picks, picksHidden: false, hiddenGames: [], weekPoints, weekScored: 1, games: 2 });
  const comparison = {
    viewer: LUKE, leagueId: null, season, seasons: [season], now: iso(now),
    members: [{ id: LUKE, displayName: ACCOUNTS.luke.name, removed: false }, { id: TROY, displayName: ACCOUNTS.troy.name, removed: false }, { id: SEAN, displayName: ACCOUNTS.sean.name, removed: false }],
    weeks: [{ season, week, deadline: sunday, closed: true, games: [SUN, MNF],
      results: { [SUN.id]: { status: 'final', away: 20, home: 27, source: 'Fixture finals', observedAt: iso(now - 22 * HOUR), settledAt: iso(now - 22 * HOUR), origin: 'settlement' } },
      revealed: { guess_spread: false, guess_total: false },
      gate: { [SUN.id]: { spread: true, total: true }, [MNF.id]: { spread: false, total: false } },
      entries: [
        // Luke: DEN −3 against a saved DEN −3.5 (0.5 off); his Monday guess is a draft, so Troy's stays shut.
        entry(LUKE, [pick(SUN.id, -3, -3.5, 9.5), { gameId: MNF.id, guess: -4, lockedIn: false, points: null, reference: null, hidden: false }], 9.5),
        // Troy: DEN −2 against DEN −3.5 (1.5 off); his Monday guess leaks with numbers the page must never draw.
        entry(TROY, [pick(SUN.id, -2, -3.5, 8.5), pick(MNF.id, -13.5, -12.5, null)], 8.5),
        // Sean: DEN −7 against DEN −3.5; 11 week points lead the week.
        entry(SEAN, [pick(SUN.id, -7, -3.5, 11)], 11),
      ] }],
  };
  const row = (game, extra) => ({ id: game.id, awayCode: game.awayCode, homeCode: game.homeCode, kickoff: game.kickoff, ...extra });
  const lines = { season, week, now: iso(now), games: [
    row(SUN, { started: true, final: { status: 'final', away: 20, home: 27, observedAt: iso(now - 22 * HOUR) }, mine: { spread: { guess: -3, lockedIn: true, points: 9.5, lineAtGuess: { value: -3.5 } }, total: { guess: null, lockedIn: false } } }),
    row(MNF, { started: false, final: null, mine: { spread: { guess: -4, lockedIn: false, points: null }, total: { guess: null, lockedIn: false } } }),
  ] };
  return { comparison, lines };
}

/** Answers from the world's handler, with `edit(body, request)` applied to a JSON reply, or a fixture when it returns one. */
async function stage(page, world, name, edit) {
  await page.route(api(name), async route => {
    const req = route.request(), sent = req.method() === 'POST' ? JSON.parse(req.postData() || '{}') : null;
    const fixture = edit.fixture?.(sent);
    if (fixture) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(fixture) });
    const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
    const text = await response.text();
    let body;
    if (text && /json/i.test(response.headers.get('content-type') ?? '')) { try { body = JSON.parse(text); } catch { body = undefined; } }
    if (body === undefined || !edit.reply) return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: text });
    if (response.ok) edit.reply(body);
    await route.fulfill({ status: response.status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function mondayWorld(page, baseURL) {
  const world = await communityWorld(page, baseURL, { migrations: ALL });
  const { season, week } = world.state.league, prior = week - 1;
  const { comparison, lines } = fixtures(season, prior);
  await stage(page, world, 'personal', { reply: body => { body.slates = [{ season, week }, { season, week: prior }]; } });
  await stage(page, world, 'lines/read', { fixture: sent => (sent?.week === prior ? lines : null) });
  await stage(page, world, 'league/comparison', { fixture: () => comparison });
  return { world, season, prior };
}

async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}

/** Phone rules: no sideways scroll, 44 px targets, no text under 12 px, nothing clipped, layoutProblems, axe. */
async function phoneRules(page, label) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no sideways scroll`).toBe(true);
  expect(await page.evaluate(layoutProblems), label).toEqual([]);
  const report = await page.locator('.gx').first().evaluate(scope => {
    const visible = el => { const s = getComputedStyle(el); return s.visibility !== 'hidden' && el.getClientRects().length > 0 && !el.closest('[inert], [hidden], dialog:not([open]), .gx-sr-only:not(.gx-skip-link:focus)'); };
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = el.getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44);
    const small = [], clipped = [];
    for (const el of [scope, ...scope.querySelectorAll('*')]) {
      if (!visible(el) || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      if (parseFloat(getComputedStyle(el).fontSize) < 12) small.push(el.textContent.trim().slice(0, 40));
      if (!el.closest('.gx-truncate') && el.scrollWidth > el.clientWidth + 1) clipped.push(el.textContent.trim().slice(0, 40));
      const r = el.getBoundingClientRect();
      // The friend chips scroll inside their own rail (the kit's ChipRail); the page itself never scrolls sideways.
      if (!el.closest('.gx-chip-rail') && (r.right > innerWidth + 0.5 || r.left < -0.5)) clipped.push(`off screen: ${el.textContent.trim().slice(0, 40)}`);
    }
    return { targets, small, clipped };
  });
  expect(report, label).toEqual({ targets: [], small: [], clipped: [] });
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  expect(axe.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${label}: axe`).toEqual([]);
}

async function signedIn(page) {
  await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank */ } });
  await page.goto('/#home');
  await signIn(page, 'luke', { navigate: false });
  await expect(page.locator('[data-home="hero"]')).toBeVisible();
}

const recapLayer = page => page.locator('[data-home="recap-layer"]');
const noLeak = async page => { for (const value of ['13.5', '12.5']) await expect(page.locator('.gx').first()).not.toContainText(value); };

test('Monday recap: Home’s entry opens last week’s recap; standings, a friend gated per game, a matchup and the pending Monday game; Back and the lips', async ({ page, baseURL }) => {
  const { world, prior } = await mondayWorld(page, baseURL);
  try {
    await signedIn(page);
    const entry = page.locator(`[data-recap-entry]`);
    await expect(entry).toContainText(`Week ${prior} recap`);
    await expect(entry).toContainText('1 game left');
    // The entry sits beside the still-playing card from the same prior-week read.
    await expect(page.locator('[data-prior-week]')).toContainText(`Still playing from Week ${prior}`);
    await entry.getByRole('button', { name: `Open Week ${prior} recap, 1 game left` }).click();
    await expect(page).toHaveURL(new RegExp(`#home\\?.*layer=recap`));
    const layer = recapLayer(page);
    await expect(layer.getByRole('heading', { name: `Week ${prior} recap`, level: 2 })).toBeFocused();
    for (const text of ['Provisional', '1 game left', '2nd in Spread.', '1.5 points behind Sean', 'Spread rank', 'Total rank',
      'You were 1 point closer than Troy.', 'You Broncos −3 · 0.5 off', 'Troy Broncos −2 · 1.5 off', 'PENDING',
      'Your draft was not locked in', 'Lock yours or wait for kickoff to see Troy’s guess']) await expect(layer).toContainText(text);
    await noLeak(page);
    // Total is a choice inside the layer: Troy's Sunday total was never sent, so nothing scores there.
    await layer.getByRole('button', { name: 'Total', exact: true }).click();
    await expect(layer).toContainText('Not ranked in Total yet.');
    await layer.getByRole('button', { name: 'Spread', exact: true }).click();
    // Another friend from the chips.
    await layer.getByRole('group', { name: 'Compare with' }).getByRole('button', { name: ACCOUNTS.sean.name }).click();
    await expect(layer).toContainText('You were 3 points closer than Sean.');
    await layer.getByRole('group', { name: 'Compare with' }).getByRole('button', { name: ACCOUNTS.troy.name }).click();

    // One game's matchup: both guesses, both misses, the score and the result, then the lip back to the week.
    await layer.getByRole('button', { name: 'Compare guesses, SEA at DEN' }).click();
    await expect(page).toHaveURL(/item=SEA-DEN/);
    await expect(layer.getByRole('heading', { name: 'Seahawks at Broncos', level: 2 })).toBeFocused();
    for (const text of ['0.5 pts off.', 'Your guess Broncos −3', 'Saved Broncos −3.5', 'Broncos won by 7.', 'Your guess implied Broncos by 3, 4 points from the final margin.']) await expect(layer).toContainText(text);
    await expect(layer.getByRole('img', { name: 'You 0.5 off, Troy 1.5 off' })).toBeVisible();
    await layer.getByRole('button', { name: `Back to Week ${prior} recap` }).click();
    await expect(layer.getByRole('heading', { name: `Week ${prior} recap`, level: 2 })).toBeVisible();
    // The pending Monday game: no score, no result, Troy's guess shut.
    await layer.getByRole('button', { name: 'Compare guesses, MIA at GB' }).click();
    await expect(layer).toContainText('The recap stays provisional until it is final.');
    await expect(layer).not.toContainText('Game result');
    await noLeak(page);
    // Browser Back closes the game, then the recap; a reload at the address reopens the game.
    await page.reload();
    await expect(layer.getByRole('heading', { name: 'Dolphins at Packers', level: 2 })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/layer=recap/);
    await expect(page).not.toHaveURL(/item=/);
    await layer.getByRole('button', { name: 'Back to Home', exact: true }).click();
    await expect(page.locator('[data-home="hero"]')).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally {
    await world.close?.();
  }
});

test('Monday recap meets the phone rules at 320 and 390 px in Dark and Light: Home’s entry, the week and one game', async ({ page, baseURL }) => {
  const { world, season, prior } = await mondayWorld(page, baseURL);
  fs.mkdirSync(SCREENS, { recursive: true });
  try {
    await signedIn(page);
    const places = [
      { name: 'home', address: '#home', ready: p => p.locator('[data-recap-entry]') },
      { name: 'week', address: `#home?layer=recap&season=${season}&week=${prior}&market=spread`, ready: p => recapLayer(p).locator('[data-recap-lead]') },
      { name: 'matchup', address: `#home?layer=recap&season=${season}&week=${prior}&market=spread&item=SEA-DEN`, ready: p => recapLayer(p).locator('[data-recap-result]') },
      { name: 'pending', address: `#home?layer=recap&season=${season}&week=${prior}&market=spread&item=MIA-GB`, ready: p => recapLayer(p).locator('[data-recap-pending]') },
    ];
    for (const theme of ['dark', 'light']) for (const width of [320, 390]) for (const place of places) {
      await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
      await page.setViewportSize({ width, height: 844 });
      await page.goto('about:blank');
      await page.goto(`/${place.address}`);
      await expect(place.ready(page)).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.waitForLoadState('networkidle');
      await noLeak(page);
      await phoneRules(page, `${place.name} ${theme} ${width}`);
      if (place.name === 'home') await page.locator('[data-recap-entry]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(SCREENS, `${place.name}-${theme}-${width}.png`), fullPage: place.name !== 'home' });
    }
    expect(world.errors).toEqual([]);
  } finally {
    await world.close?.();
  }
});
