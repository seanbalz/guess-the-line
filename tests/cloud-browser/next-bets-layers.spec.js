import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { assertNoLeak, lineSecrets } from '../helpers/leak-scan.mjs';
import { fixture as assessmentFixture } from '../fixtures/research-assessments.mjs';
import { ASSESSMENT_LABELS } from '../../shared/research-assessments.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, sendBallot, signIn, storeBookLines } from './community-world.mjs';

// D-69 step 4 (Bets) on the real app and handler with every migration on local PGlite. Checked: the landing's first card
// and five tiles, and that it makes no Bets, lines or research read; the track card; the loading card and rows against the
// real ones at 390 px; each section's own address (a tap focuses its heading, a reload never moves focus, Back returns
// to its tile; unknown layers and views draw the section or the landing); one gap as a layer (a row, its heading, the
// lip, Back, Forward, a reload, a shared link; Back's focus on its row, a Your card row included; an unsaved selection
// asks only when it would leave Your gap or its week); layers never crossing tabs; a tracked win's small moment (the My
// bets tile opens Settled while it waits, once, on its own ticket, never on launch or a failed read; a loss quiet); a
// confirmed placement's moment (only after the confirming read, never on a lost reply; no placing on prices a refresh
// could not renew); the entrance (after a tap, never on a load, never twice for one visit: Recommended back from an
// assessment, Everyone's Refresh); Recommended's rows tinted by their assessment; faces first on Everyone and no closed
// line on any Bets screen; the phone rules at 320 and 390 px in both themes with the wide fallback font on every token.
// Fictional accounts only; never contacts hosted data.
test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));

// Every font token, as CI's Linux runner draws them (the webfonts are blocked, so its DejaVu Sans is the fallback). Verdana
// is as wide here; step 3 learned that a probe on the body font alone under-reproduces CI (numbers and titles stay narrow).
const WIDE = 'Verdana, "DejaVu Sans", sans-serif !important';
const WIDE_FONT = `.gx { --gx-font-body: ${WIDE}; --gx-font-num: ${WIDE}; --gx-font-display: ${WIDE}; }`;
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
// The recommended-bets fixture's guesses against -3.5 and 44.5: seven gaps, the top three spreads.
const SPREAD = [-10, -7, -5, -3], TOTAL = [55, 49, 43, 44.5];
const landing = page => page.locator('[data-landing="bets"]');
const hero = page => page.locator('[data-bets="hero"]');
const tile = (page, key) => page.locator(`#gx-b-tile-${key}`);
const tab = (page, name) => page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: new RegExp(`^${name}(, .+)?$`) });
const back = page => page.getByRole('button', { name: 'Back', exact: true });
const gapRow = (page, item) => page.locator(`[data-gap-row="${item}"]`);
const gapLayer = page => page.locator('[data-bets-layer="gap"]');
const lip = page => gapLayer(page).getByRole('button', { name: 'Back to Your gap', exact: true });
const market = (page, name) => page.getByRole('group', { name: 'Recommendation market', exact: true }).getByRole('button', { name, exact: true });
const running = page => page.evaluate(() => document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.animationName ?? 'transition'));
/** The animations running on anything inside `selector` (a list's rows rising in), by name. */
const runningIn = (page, selector) => page.evaluate(sel => document.getAnimations().filter(a => a.playState === 'running' && a.effect?.target?.closest?.(sel)).map(a => a.animationName ?? 'transition'), selector);
async function settle(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a => a.finished.catch(() => {}))));
}
function gtlCalls(page) {
  const calls = [];
  page.on('request', request => { const url = new URL(request.url()); if (url.origin === SUPABASE && url.pathname.startsWith('/functions/v1/gtl-api/')) calls.push(`${request.method()} ${url.pathname.replace('/functions/v1/gtl-api', '')}`); });
  return calls;
}
async function world4(page, baseURL, { guesses = true } = {}) {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, virtualUnits: true, games: 4 });
  await storeBookLines(world, { spread: Object.fromEntries(world.state.games.map(g => [g.id, -3.5])), total: Object.fromEntries(world.state.games.map(g => [g.id, 44.5])) });
  if (guesses) {
    await sendBallot(world, 'luke', 'guess_spread', Object.fromEntries(world.state.games.map((g, i) => [g.id, SPREAD[i]])));
    await sendBallot(world, 'luke', 'guess_total', Object.fromEntries(world.state.games.map((g, i) => [g.id, TOTAL[i]])));
  }
  return world;
}
async function openAt(page, address = '#bets') {
  await page.addInitScript(() => { try { localStorage.setItem('gtl.app', 'next'); } catch { /* about:blank */ } });
  await page.goto(`/${address}`);
  await signIn(page, 'luke', { navigate: false });
}
/** A fresh document at `address` with no history entry behind it: what a shared link opens. */
async function shared(page, address) { await page.goto('about:blank'); await page.goto(`/${address}`); }
/** One tracked ticket for `account` (next-bets-live's seeding, through the real social routes). */
async function seedTicket(world, label, account = 'luke') {
  const { season, week } = world.state.league, gameId = world.state.games[0].id;
  const read = await world.api(account, 'social/read', { season, week });
  const reply = await world.api(account, 'social/create', { season, week, weekRevision: read.body.weekRevision, requestId: randomUUID(), kind: 'single',
    legs: [{ gameId, market: 'prop', side: 'Fixture Runner', line: 30, selection: 'Fixture Runner 30+ receiving yards' }], stakeUnits: 1, odds: 100, source: 'Book A', notes: label });
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
  return reply.body.entries.find(e => e.notes === label);
}
async function settleTicket(world, id, outcome, account = 'luke') {
  const { season, week } = world.state.league;
  const read = await world.api(account, 'social/read', { season, week }), entry = read.body.entries.find(e => e.id === id);
  const reply = await world.api(account, 'social/settle', { season, week, weekRevision: read.body.weekRevision, requestId: randomUUID(), entryId: id, revision: entry.revision, outcome, actualReturnUnits: null, reason: 'Local fixture reported result' });
  expect(reply.status, JSON.stringify(reply.body)).toBe(200);
}
async function loseReplyAfterCommit(page, world, action) {
  await page.route(url => url.origin === SUPABASE && url.pathname === `/functions/v1/gtl-api/${action}`, async route => {
    const req = route.request();
    const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), body: req.postData() }));
    expect(response.status, `${action} committed in the fixture`).toBe(200);
    await response.text();
    await route.abort('failed');
  }, { times: 1 });
}
/** Holds the next `path` read until the returned release runs. */
async function holdNext(page, path) {
  let release; const held = new Promise(resolve => { release = resolve; });
  await page.route(`${SUPABASE}/functions/v1/gtl-api/${path}`, async route => { await held; await route.fallback(); }, { times: 1 });
  return release;
}
/**
 * `path`'s replies from the world's own handler, edited by `edit(body)` (route.fetch would leave the fixture for the
 * network: the world answers every request itself).
 */
async function rewrite(page, world, path, edit) {
  await page.route(`${SUPABASE}/functions/v1/gtl-api/${path}`, async route => {
    const req = route.request();
    const response = await world.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
    const text = await response.text();
    let body = null; try { body = JSON.parse(text); } catch { /* not JSON: passed on as it came */ }
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: response.ok && body ? JSON.stringify(edit(body)) : text });
  });
}
/** The server's clock in /personal moved past the week's last kickoff (the landing's track card), nothing else changed. */
async function afterLastKickoff(page, world) {
  await rewrite(page, world, 'personal', body => {
    const last = Math.max(...(body.games ?? []).map(g => Date.parse(g.kickoff)).filter(Number.isFinite));
    return Number.isFinite(last) ? { ...body, now: new Date(last + 3_600_000).toISOString() } : body;
  });
}
/** Troy's saved Virtual Units pick on the first game's spread, so Everyone has a board. */
async function troyPick(world, { market = 'spread', side = 'home', line = -3.5, units = 1 } = {}) {
  const { season, week } = world.state.league, [g0] = world.state.games, now = new Date().toISOString();
  await world.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [ACCOUNTS.troy.id, season, week]);
  await world.db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,$2,$3,$4,$5,$6)',
    [ACCOUNTS.troy.id, season, week, g0.id, market, { gameId: g0.id, market, side, line, odds: -110, units, source: 'BetMGM', quotedAt: now, selectedAt: now }]);
}
/** research-assessments.spec.js's published snapshot: one checked yellow assessment (a player prop) on the first game. */
async function seedResearch(world) {
  const { snapshot } = assessmentFixture(), g = world.state.games[0], stamp = new Date(Date.now() - 5000).toISOString();
  snapshot.season = world.state.league.season; snapshot.week = world.state.league.week; snapshot.generatedAt = stamp;
  snapshot.candidates[0].gameId = g.id; snapshot.candidates[0].kickoff = g.kickoff; snapshot.candidates[0].dependencies[0].gameId = g.id;
  for (const key of ['publishedAt', 'observedAt', 'asOf']) snapshot.candidates[0].evidence[0][key] = stamp;
  Object.assign(snapshot.quotes[0], { gameId: g.id, kickoff: g.kickoff, observedAt: stamp, capturedAt: stamp });
  await world.db.query("insert into public.gtl_research_quote_fetches(request_id,lease,season,week,game_id,markets,reserved_credits,status,started_at,expires_at,quote_payload) values($1,$2,$3,$4,$5,$6,1,'finished',clock_timestamp()-interval '10 seconds',clock_timestamp()+interval '80 seconds',$7)",
    [randomUUID(), randomUUID(), snapshot.season, snapshot.week, g.id, ['player_reception_yds'], snapshot.quotes]);
  await world.db.query('insert into public.gtl_research_snapshots(id,season,week,payload) values($1,$2,$3,$4)', [randomUUID(), snapshot.season, snapshot.week, snapshot]);
}
/** An older published week, so Your gap's week select has a second week. Never read here: the prompt is dismissed. */
async function olderWeek(world) {
  const { season, week } = world.state.league;
  const signature = (await world.db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  await world.db.query('insert into public.gtl_weekly_slates(season,week,signature) values($1,$2,$3)', [season, week - 1,
    { ...signature, week: week - 1, deadline: signature.deadline - 7 * 86400, games: signature.games.map(game => ({ ...game, kickoff: game.kickoff - 7 * 86400 })) }]);
  return { season, week: week - 1 };
}
/** My bets' own Result filter (the tracker's switch over its list). */
const resultFilter = (page, name) => page.getByRole('group', { name: 'Result filter', exact: true }).getByRole('button', { name, exact: true });
/**
 * next-lines.spec.js's clearOfEdges: the page scrolls under the sticky top bar and the fixed tab bar, and axe's
 * target-size reads a control half under a bar as an obscured target. Before axe, move at most 120 px to the nearest
 * spot where no control straddles a bar's edge, so the check measures the controls, not where the scroll stopped.
 */
const clearOfEdges = page => page.evaluate(() => {
  const edges = [document.querySelector('.gx-topbar')?.getBoundingClientRect().bottom, document.querySelector('.gx-tabbar')?.getBoundingClientRect().top].filter(Number.isFinite);
  const controls = [...document.querySelectorAll('.gx-main :is(button, a[href], summary, input, select, textarea, [role="button"])')]
    .map(el => el.getBoundingClientRect()).filter(r => r.height > 0);
  const room = document.documentElement.scrollHeight - innerHeight;
  const clear = shift => scrollY + shift >= 0 && scrollY + shift <= room
    && controls.every(r => edges.every(edge => r.bottom - shift <= edge || r.top - shift >= edge));
  for (let d = 0; d <= 120; d += 4) for (const shift of d ? [d, -d] : [0]) if (clear(shift)) { scrollBy(0, shift); return shift; }
  return null;
});
/** Spec 3's phone rules for the page: no sideways scroll, layoutProblems, 44 px targets, no text under 12 px, fixed bars, axe. */
async function phoneProblems(page) {
  const problems = [];
  if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))) problems.push('sideways scroll');
  problems.push(...(await page.evaluate(layoutProblems)));
  problems.push(...(await page.locator('.gx').first().evaluate(scope => {
    // A closed <details> draws only its summary; Chromium still gives the hidden body boxes.
    const shut = el => { const body = el.closest('details:not([open])'); return Boolean(body) && !el.closest('summary')?.parentElement?.isSameNode(body); };
    const visible = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[inert], [hidden], .gx-sr-only') && !shut(el);
    // A check box inside its label is tapped through the label, so the label is the target.
    const target = el => (el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') ?? el : el);
    const targets = [...scope.querySelectorAll('button,a[href],input,select,textarea,summary,[role=button]')].filter(visible)
      .map(el => { const r = target(el).getBoundingClientRect(); return { name: (el.getAttribute('aria-label') || target(el).textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter(r => r.w < 44 || r.h < 44).map(r => `small target ${r.name} ${r.w}x${r.h}`);
    const small = [...scope.querySelectorAll('*')].filter(el => visible(el) && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12)
      .map(el => `small text ${el.textContent.trim().slice(0, 40)}`);
    // A transform, filter or will-change on an ancestor gives a fixed bar a containing block, so it scrolls away.
    const traps = [];
    for (const selector of ['.gx-tabbar', '.gx-topbar', '.gx-dock']) {
      for (let n = document.querySelector(selector)?.parentElement; n; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.transform !== 'none' || s.filter !== 'none' || s.translate !== 'none' || s.scale !== 'none' || /transform|filter|perspective/.test(s.willChange) || (s.backdropFilter && s.backdropFilter !== 'none')) traps.push(`fixed bar ${selector} inside ${n.tagName.toLowerCase()}.${String(n.className).split(' ')[0]}`);
      }
    }
    return [...targets, ...small, ...traps];
  })));
  await settle(page);
  await clearOfEdges(page);
  await settle(page);
  const axe = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  problems.push(...axe.violations.map(v => `axe ${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`));
  return problems;
}

test('the landing: the next move, five tiles, no Bets, line or research read; Back from each section returns to its tile', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    const calls = gtlCalls(page);
    await openAt(page);
    await expect(hero(page)).toHaveAttribute('data-kind', 'place', { timeout: 30000 });
    const n = world.state.games.length;
    await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText('Place your picks');
    await expect(hero(page).locator('[data-bets="hero-line"]')).toHaveText(new RegExp(`^\\d+ of ${n} games still open$`));
    await expect(hero(page).locator('.gx-meter3-seg')).toHaveCount(n);
    await expect(page.locator('.gx-btn--primary:visible'), 'the screen’s one lime button').toHaveCount(1);
    await expect(page.locator('[data-bets="tiles"] > li')).toHaveCount(5);
    for (const [key, name] of [['mybets', /^My bets, /], ['picks', /^Your picks, \d+ games? open to bet$/], ['everyone', /^Everyone, /], ['recommended', 'Recommended, research assessments'], ['gap', 'Your gap, 8 locked guesses against the lines']]) await expect(tile(page, key)).toHaveAccessibleName(name);
    await page.waitForLoadState('networkidle');
    expect(calls.filter(call => /\/(bets\/|lines\/|research)/.test(call)), 'the landing reads only the shared reads').toEqual([]);
    expect(await running(page), 'nothing moves on the first paint').toEqual([]);
    // No tracked win waits, so My bets opens its Active tickets.
    for (const [key, heading, address] of [['mybets', 'My bets', /#bets\/active/], ['picks', 'Your picks', /#bets\/virtual/], ['everyone', 'Everyone', /#bets\/everyone/], ['recommended', 'Recommended', /#bets\/research/], ['gap', 'Your gap', /#bets\/recommended/]]) {
      await tile(page, key).click();
      await expect(page).toHaveURL(address);
      await expect(page.getByRole('heading', { name: heading, level: 1, exact: true })).toBeVisible();
      await back(page).click();
      await expect(landing(page)).toBeVisible();
      await expect(tile(page, key), 'Back returns focus to the tile by its id').toBeFocused();
    }
    await hero(page).getByRole('button').click();
    await expect(page).toHaveURL(/#bets\/virtual/);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('with every game kicked off the next move is Track a bet: your last settled tickets as its meter; Add a bet opens the editor', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL, { guesses: false });
  try {
    const won = await seedTicket(world, 'won'), lost = await seedTicket(world, 'lost');
    await settleTicket(world, won.id, 'win'); await settleTicket(world, lost.id, 'loss');
    await afterLastKickoff(page, world);
    await openAt(page);
    await expect(hero(page)).toHaveAttribute('data-kind', 'track', { timeout: 30000 });
    await expect(hero(page).getByRole('heading', { level: 2 })).toHaveText('Track a bet');
    await expect(hero(page).locator('[data-bets="hero-line"]')).toHaveText('1 of your last 2 settled tickets won');
    await expect(hero(page).locator('.gx-meter3-seg--on')).toHaveCount(1);
    await expect(tile(page, 'picks')).toHaveAccessibleName(/^Your picks, week \d+ closed$/);
    await hero(page).getByRole('button', { name: 'Add a bet', exact: true }).click();
    await expect(page).toHaveURL(/#bets\/add/);
    await expect(page.getByRole('dialog', { name: 'Add a tracked bet' })).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('loading in the final shape: the landing’s card and tiles, Your gap’s rows and Everyone’s rows at 390 px', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await troyPick(world);
    await openAt(page);
    await expect(hero(page)).toBeVisible({ timeout: 30000 });
    await settle(page);
    const card = await hero(page).evaluate(el => el.getBoundingClientRect().height);
    const hold = async (path, address, skeleton, real) => {
      let release; const held = new Promise(resolve => { release = resolve; });
      await page.route(`${SUPABASE}/functions/v1/gtl-api/${path}`, async route => { await held; await route.fallback(); });
      await (address ? shared(page, address) : page.reload());
      await expect(page.locator(skeleton).first()).toBeVisible();
      const drawn = await page.locator(skeleton).first().evaluate(el => el.getBoundingClientRect().height);
      release(); await page.unroute(`${SUPABASE}/functions/v1/gtl-api/${path}`);
      if (real) await expect(page.locator(real).first()).toBeVisible({ timeout: 30000 });
      return drawn;
    };
    const drawn = await hold('personal', null, '[data-skeleton="landing"] .gx-skel-hero', null);
    test.info().annotations.push({ type: 'heights', description: `landing skeleton ${drawn}px, card ${card}px` });
    // Step 2's rule: fallback fonts differ by platform; no jump larger than one title line, never taller than the card.
    expect(Math.abs(drawn - card), `the skeleton card is ${drawn}px, the card ${card}px`).toBeLessThanOrEqual(64);
    expect(drawn, 'the skeleton is never taller than the card').toBeLessThanOrEqual(card + 8);
    await expect(page.locator('[data-skeleton="landing"]')).toHaveCount(0);
    for (const [path, address, skeleton, real] of [['bets/recommendations', '#bets/recommended', '.gx-gap-skel .gx-skel-row', '[data-gap-row]'], ['bets/read', '#bets/everyone', '.gx-ev-skel .gx-skel-row', '.gx-prow[data-person]']]) {
      await shared(page, address);
      await expect(page.locator(real).first()).toBeVisible({ timeout: 30000 });
      const height = await page.locator(real).first().evaluate(el => el.getBoundingClientRect().height);
      const skel = await hold(path, address, skeleton, real);
      test.info().annotations.push({ type: 'heights', description: `${address} skeleton row ${skel}px, row ${height}px` });
      // Step 3's rule for a row (next-research-layers.spec.js): the skeleton holds a one-line row's height; a real row
      // grows one text line when its words wrap in a wider fallback face (CI's DejaVu Sans), so never a skeleton taller
      // than the row (+2) and no jump larger than one wrapped line (28 px).
      expect(skel, `${address}: the skeleton row (${skel}px) is never taller than a row (${height}px)`).toBeLessThanOrEqual(height + 2);
      expect(height - skel, `${address}: the skeleton row is ${skel}px, a row ${height}px: within one wrapped line`).toBeLessThanOrEqual(28);
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('each section has its own address: a tap focuses its heading, a reload never moves focus, unknown layers and views draw the section or the landing', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await openAt(page);
    await expect(landing(page)).toBeVisible({ timeout: 30000 });
    for (const [key, heading] of [['mybets', 'My bets'], ['picks', 'Your picks'], ['everyone', 'Everyone'], ['recommended', 'Recommended'], ['gap', 'Your gap']]) {
      await shared(page, '#bets');
      await tile(page, key).click();
      const h1 = page.getByRole('heading', { name: heading, level: 1, exact: true });
      await expect(h1, `${heading}: focus lands on the heading`).toBeFocused();
      await page.reload();
      await expect(h1).toBeVisible();
      await expect(h1, 'a load never moves focus').not.toBeFocused();
    }
    // The addresses keep their earlier names (betsNav.js): #bets/research is Recommended, #bets/recommended is Your gap.
    // Any other layer or item on a Bets view is dropped, so the address draws its section; an unknown view, the landing.
    for (const [fragment, heading] of [['#bets/research', 'Recommended'], ['#bets/recommended', 'Your gap'],
      ['#bets/research?layer=gap&item=SEA-DEN%3Atotal', 'Recommended'], ['#bets/recommended?layer=nope&item=x', 'Your gap'],
      ['#bets/recommended?layer=gap&item=nope', 'Your gap'], ['#bets/virtual?layer=gap&item=SEA-DEN%3Atotal', 'Your picks'], ['#bets/active?layer=who', 'My bets'],
      ]) {
      await shared(page, fragment);
      await expect(page.getByRole('heading', { name: heading, level: 1, exact: true }), fragment).toBeVisible({ timeout: 30000 });
      await expect(gapLayer(page)).toHaveCount(0);
      expect(new URL(page.url()).hash, fragment).not.toMatch(/layer=|item=/);
    }
    // A hostile view names no section: nothing of Bets is drawn and nothing breaks (the shell falls back to a tab root).
    await shared(page, '#bets/__proto__');
    await expect(page.getByRole('heading', { level: 1, name: /^(Bets|Home)$/ })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-bets-section], [data-bets-layer]')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('one gap is a layer: a row, its heading focused, the lip, Back and Forward, a reload; a shared link closes to Your gap', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await openAt(page, '#bets/recommended');
    const first = page.locator('[data-gap-row]').first();
    await expect(first).toBeVisible({ timeout: 30000 });
    const item = await first.getAttribute('data-gap-row'), address = `#bets/recommended?layer=gap&item=${encodeURIComponent(item)}`;
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${address.replace(/[?]/g, '\\?')}$`));
    const title = gapLayer(page).getByRole('heading', { level: 2 });
    await expect(title, 'a tap focuses the layer’s heading').toBeFocused();
    await expect(lip(page)).toBeVisible();
    await expect(page.locator('[data-gap-row]').first(), 'the list stays mounted, hidden, under the layer').toBeHidden();
    await page.reload();
    await expect(title).toBeVisible({ timeout: 30000 });
    await expect(title, 'a load never moves focus').not.toBeFocused();
    await page.goBack(); await expect(gapRow(page, item)).toBeVisible();
    await page.goForward(); await expect(title).toBeVisible();
    await lip(page).click();
    await expect(gapRow(page, item)).toBeVisible();
    await gapRow(page, item).click();
    await back(page).click();
    await expect(page.locator(`#gx-b-gap-${item.replace(':', '-')}`), 'Back returns focus to the row by its id').toBeFocused();
    await shared(page, address);
    await expect(title).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.gx-kept'), 'a shared link has no list under the layer').toHaveCount(0);
    await back(page).click();
    await expect(gapRow(page, item), 'Back on a shared link closes one layer, to Your gap').toBeVisible();
    await back(page).click();
    await expect(landing(page)).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Your gap’s unsaved selection: the lip and Back never ask, a Your card row opens its gap and Back refocuses it; leaving Your gap or changing week asks', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    const [g0] = world.state.games, item = `${g0.id}:total`, older = await olderWeek(world);
    const asked = []; let answer = 'dismiss';
    page.on('dialog', async dialog => { asked.push(dialog.message()); await (answer === 'accept' ? dialog.accept() : dialog.dismiss()); });
    await openAt(page, '#bets/recommended');
    await expect(page.locator('[data-gap-row]').first()).toBeVisible({ timeout: 30000 });
    await market(page, 'Totals').click();
    await gapRow(page, item).click();
    await gapLayer(page).getByRole('button', { name: 'Play with Virtual Units', exact: true }).click();
    await expect(gapLayer(page).getByRole('button', { name: 'Place virtual pick', exact: true })).toBeVisible();
    // Opening and closing one gap keeps the selection on screen (keepsYourGap), so neither the lip nor Back asks.
    await lip(page).click();
    await expect(gapRow(page, item)).toBeVisible();
    await gapRow(page, item).click();
    await expect(gapLayer(page).getByRole('button', { name: 'Review below', exact: true })).toBeDisabled();
    await back(page).click();
    await expect(page.locator(`#gx-b-gap-${g0.id}-total`)).toBeFocused();
    expect(asked, 'the lip and Back never ask within Your gap').toEqual([]);
    // Spreads hides the total's row; the selection stays in Your card, a row that opens the same gap.
    await market(page, 'Spreads').click();
    await expect(gapRow(page, item)).toHaveCount(0);
    const card = page.locator(`#gx-b-gap-${g0.id}-total-card`);
    await expect(page.locator('[data-gap="your-card"]')).toContainText('Over 44.5 · −110 · 1U');
    await card.click();
    await expect(gapLayer(page)).toHaveAttribute('data-gap-item', item);
    await expect(gapLayer(page).getByRole('heading', { level: 2 }), 'a Your card row focuses the layer’s heading').toBeFocused();
    await back(page).click();
    await expect(card, 'Back returns focus to the Your card row by its id').toBeFocused();
    expect(asked).toEqual([]);
    // A week change would drop the selection: it asks, and staying keeps both.
    const weekSelect = page.getByRole('combobox', { name: 'Recommendation week', exact: true });
    await weekSelect.selectOption(`${older.season}:${older.week}`);
    await expect.poll(() => asked.length).toBe(1);
    await expect(weekSelect).toHaveValue('current');
    await expect(card).toBeVisible();
    // Leaving Your gap asks; staying keeps it, going leaves.
    await back(page).click();
    await expect.poll(() => asked.length).toBe(2);
    await expect(page.locator('[data-bets-section="gap"]')).toBeVisible();
    await expect(card).toBeVisible();
    answer = 'accept';
    await tab(page, 'Home').click();
    await expect.poll(() => asked.length).toBe(3);
    await expect(page).toHaveURL(/#home$/);
    expect(asked.every(message => message === 'Leave without saving your changes?')).toBe(true);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('layers never cross tabs: a gap left open never rides into Home, the Bets tab or a fresh Your gap tile', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await openAt(page, '#bets/recommended');
    await page.locator('[data-gap-row]').first().click();
    await expect(gapLayer(page)).toBeVisible();
    await tab(page, 'Home').click();
    await expect(page).toHaveURL(/#home$/);
    await tab(page, 'Bets').click();
    await expect(landing(page)).toBeVisible();
    await tile(page, 'gap').click();
    await expect(page.locator('[data-bets-section="gap"]')).toBeVisible();
    const hash = new URL(page.url()).hash;
    expect(hash).toMatch(/^#bets\/recommended/);
    expect(hash, 'a fresh Your gap tile carries no layer').not.toMatch(/layer=|item=/);
    await expect(gapLayer(page)).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('a tracked win waits on My bets, which opens Settled; it pops once on its own ticket, never on launch or a failed read; a loss stays quiet', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL, { guesses: false });
  try {
    const win = await seedTicket(world, 'to-win'), lose = await seedTicket(world, 'to-lose'), later = await seedTicket(world, 'later');
    await openAt(page, '#bets'); // this device's first ticket read: seeded, nothing waits
    await expect(tile(page, 'mybets')).toHaveAccessibleName('My bets, 3 active tickets', { timeout: 30000 });
    await settleTicket(world, win.id, 'win'); await settleTicket(world, lose.id, 'loss');
    await shared(page, '#bets/settled'); // a launch: the settled rows show and nothing pops
    await expect(page.locator(`[data-ticket="${win.id}"]`)).toBeVisible({ timeout: 30000 });
    await expect(page.locator(`[data-ticket="${lose.id}"]`)).toBeVisible();
    await expect(page.locator('[data-moment="pop"]'), 'never on launch').toHaveCount(0);
    await back(page).click(); // the landing: the win waits as NEW on My bets
    await expect(tile(page, 'mybets')).toHaveAccessibleName(/, new$/);
    await tile(page, 'mybets').click();
    await expect(page, 'a waiting win: My bets opens Settled, where its card is drawn').toHaveURL(/#bets\/settled/);
    const won = page.locator(`[data-ticket="${win.id}"] .gx-tracked-preview .gx-pill`);
    await expect(won).toHaveText('Won');
    await expect(won).toHaveAttribute('data-moment', 'pop');
    await expect(page.locator(`[data-ticket="${lose.id}"] [data-moment]`), 'a loss stays quiet').toHaveCount(0);
    await expect(page.locator('[data-moment="pop"]')).toHaveCount(1);
    await back(page).click();
    await expect(tile(page, 'mybets')).not.toHaveAccessibleName(/, new$/);
    await page.goForward(); // Settled again, by history: the win has played
    await expect(page).toHaveURL(/#bets\/settled/);
    await expect(page.locator(`[data-ticket="${win.id}"]`)).toBeVisible();
    await expect(won, 'it never plays again').not.toHaveAttribute('data-moment', 'pop');
    await back(page).click();
    await tile(page, 'mybets').click();
    await expect(page, 'nothing waits: My bets opens Active').toHaveURL(/#bets\/active/);
    // A failed ticket read reports nothing: the next win waits for a read that succeeds.
    await settleTicket(world, later.id, 'win');
    const summary = JSON.stringify({ allHistory: true, filters: { playerId: ACCOUNTS.luke.id, origin: 'tracked' } });
    const failing = url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/social/read');
    const failSummary = route => (route.request().postData() === summary ? route.abort('failed') : route.fallback());
    await page.route(failing, failSummary);
    await shared(page, '#bets');
    await expect(tile(page, 'mybets')).toHaveAccessibleName(/could not load/, { timeout: 30000 });
    await tile(page, 'mybets').click();
    await expect(page, 'no win known: My bets opens Active').toHaveURL(/#bets\/active/);
    await resultFilter(page, 'Settled').click();
    await expect(page.locator(`[data-ticket="${later.id}"]`)).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-moment]'), 'never after a failed read').toHaveCount(0);
    await page.unroute(failing, failSummary);
    await shared(page, '#bets');
    await expect(tile(page, 'mybets')).toHaveAccessibleName(/, new$/, { timeout: 30000 });
    await tile(page, 'mybets').click();
    await expect(page).toHaveURL(/#bets\/settled/);
    await expect(page.locator(`[data-ticket="${later.id}"] .gx-tracked-preview .gx-pill`), 'the next read that succeeds plays it').toHaveAttribute('data-moment', 'pop');
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Your picks: the cards rise in after a tap, never on a load; a placement pops its tag only after the confirming read, never on a lost reply; no placing on prices a refresh could not renew', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await openAt(page);
    await expect(landing(page)).toBeVisible({ timeout: 30000 });
    await tile(page, 'picks').click();
    const place = page.locator('[data-bets="place"]'), [g0, g1] = world.state.games;
    const chips = game => place.locator(`[data-game="${game.id}"] [data-market="spread"] .gx-chip`);
    await expect(place).toBeVisible({ timeout: 30000 });
    expect(await place.locator('.gx-place-games').getAttribute('data-enter')).toBe('in');
    await chips(g0).nth(1).click();
    await page.getByRole('button', { name: 'Review slip', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Your slip' });
    await loseReplyAfterCommit(page, world, 'bets/place');
    await sheet.getByRole('button', { name: /^Place 1 bet/ }).click();
    await expect(sheet.getByRole('alert')).toContainText('could not confirm');
    await expect(place.locator('[data-moment="pop"]'), 'a lost reply pops nothing').toHaveCount(0);
    // The retry is confirmed; the tag pops only once the read that follows the write has the sent terms.
    const release = await holdNext(page, 'bets/read');
    await sheet.getByRole('button', { name: 'Retry the same save', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(place.getByRole('button', { name: 'Refreshing…', exact: true })).toBeVisible();
    await expect(place.locator('[data-moment="pop"]'), 'nothing pops before the confirming read').toHaveCount(0);
    release();
    const tag = place.locator(`[data-game="${g0.id}"] [data-market="spread"] .gx-tag`);
    await expect(tag).toHaveAttribute('data-moment', 'pop');
    await expect(place.locator('[data-moment="pop"]')).toHaveCount(1);
    await page.reload();
    await expect(tag).toBeVisible({ timeout: 30000 });
    await expect(tag).not.toHaveAttribute('data-moment', 'pop');
    expect(await place.locator('.gx-place-games').getAttribute('data-enter'), 'a load draws no entrance').toBeNull();
    // A refresh that fails keeps the board under its failure line, but those prices are not placeable.
    await chips(g1).nth(1).click();
    await page.route(url => url.origin === SUPABASE && url.pathname === '/functions/v1/gtl-api/bets/read', route => route.abort('failed'), { times: 1 });
    const refresh = place.getByRole('button', { name: 'Refresh prices', exact: true });
    await refresh.focus(); await page.keyboard.press('Enter');
    await expect(chips(g1).first(), 'a failed refresh disables placing').toBeDisabled();
    await page.getByRole('button', { name: 'Review slip', exact: true }).click();
    await expect(sheet).toContainText('These prices could not be refreshed. Close the slip and try again.');
    await expect(sheet.getByRole('button', { name: /^Place 1 bet/ })).toBeDisabled();
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await refresh.focus(); await page.keyboard.press('Enter');
    await expect(chips(g1).first(), 'a refresh that lands renews them').toBeEnabled();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Recommended: each row is tinted by its assessment, Back from one refocuses its row and the list rises once; Everyone’s Refresh keeps its board and replays no rise', async ({ page, baseURL }) => {
  const world = await world4(page, baseURL);
  try {
    await seedResearch(world);
    await troyPick(world);
    // The handler's one checked assessment (yellow), drawn as one row of each color the screen tints.
    await rewrite(page, world, 'lines/assessments', body => {
      const [a] = body.assessments ?? [];
      return a ? { ...body, assessments: ['yellow', 'red', 'green'].map((color, i) => ({ ...a, id: `${a.id}-${color}`, routeId: i ? `r-${String(i).repeat(24)}` : a.routeId, color, label: ASSESSMENT_LABELS[color] })) } : body;
    });
    await page.addInitScript(() => {
      window.__rises = [];
      for (const type of ['animationstart', 'animationcancel', 'animationend']) document.addEventListener(type, event => {
        if (event.target.closest?.('ol[aria-label="Assessed bets"]')) window.__rises.push(`${type} ${event.animationName}`);
      }, true);
    });
    await openAt(page);
    await expect(landing(page)).toBeVisible({ timeout: 30000 });
    // The rows land last, after the week's trends the screen also reads: a re-render during the rise ends it early.
    const trends = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/gtl-api/trends/week'));
    const assessed = await holdNext(page, 'lines/assessments');
    await tile(page, 'recommended').click();
    await trends;
    assessed();
    const list = page.locator('ol[aria-label="Assessed bets"]'), rows = list.locator('.gx-prow');
    await expect(rows).toHaveCount(3, { timeout: 30000 });
    const rises = () => page.evaluate(() => window.__rises.filter(event => event.startsWith('animationstart')).length);
    await expect.poll(rises, 'the rows rise in after a tap').toBe(3);
    await settle(page);
    const tints = await rows.evaluateAll(list => list.map(row => {
      const token = { yellow: 'pending', red: 'loss', green: 'win' }[row.dataset.assessment];
      const probe = document.createElement('span');
      probe.style.background = `var(--gx-${token}-tint)`; probe.style.borderColor = `var(--gx-${token})`; probe.style.borderStyle = 'solid';
      row.parentElement.append(probe);
      const want = getComputedStyle(probe), got = getComputedStyle(row);
      const out = { color: row.dataset.assessment, background: got.backgroundColor === want.backgroundColor, border: got.borderTopColor === want.borderTopColor, value: got.backgroundColor };
      probe.remove();
      return out;
    }));
    expect(tints.map(({ value, ...rest }) => rest), JSON.stringify(tints)).toEqual(['yellow', 'red', 'green'].map(color => ({ color, background: true, border: true })));
    expect(new Set(tints.map(t => t.value)).size, 'three different tints').toBe(3);
    const red = rows.nth(1), id = await red.getAttribute('id');
    expect(id).toMatch(/^gx-b-ra-r-1{24}$/);
    await red.click();
    await expect(page).toHaveURL(/assessment=r-1{24}/);
    await expect(rows).toHaveCount(0);
    await back(page).click();
    await expect(page.locator(`#${id}`), 'Back returns focus to the assessment’s row by its id').toBeFocused();
    expect(await runningIn(page, 'ol[aria-label="Assessed bets"]'), 'the list never rises in twice').toEqual([]);
    await expect(list, 'back from an assessment, the list draws no entrance').not.toHaveAttribute('data-enter', /.+/);
    await settle(page);
    expect(await rises(), 'one visit, one rise').toBe(3);

    // Everyone: the board stays on screen while Refresh reads, and its rows do not rise in again.
    await back(page).click();
    await tile(page, 'everyone').click();
    const board = page.locator('[data-bets="everyone"]'), players = board.locator('ol[aria-label="This week’s players"]');
    await expect(players.locator('.gx-prow').first()).toBeVisible({ timeout: 30000 });
    await expect(players).toHaveAttribute('data-enter', 'in');
    await settle(page);
    await players.locator('.gx-prow').first().evaluate(row => { window.__evRow = row; });
    const release = await holdNext(page, 'bets/read');
    await board.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(board.getByRole('button', { name: 'Refreshing…', exact: true })).toBeDisabled();
    await expect(board, 'the board stays while Refresh reads').toBeVisible();
    await expect(page.locator('.gx-ev-skel')).toHaveCount(0);
    release();
    await expect(board.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
    expect(await page.evaluate(() => window.__evRow.isConnected), 'the same rows, never remounted').toBe(true);
    expect(await runningIn(page, '[data-bets="everyone"]'), 'Refresh replays no rise').toEqual([]);
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Everyone leads every row with a face, and no friend’s line or closed market’s line reaches any Bets screen', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, troyBallots: false });
  try {
    const { season, week } = world.state.league, [g0, g1] = world.state.games, now = new Date().toISOString();
    // Unusual half-point lines, so nothing else on a page can equal them (tests/helpers/leak-scan.mjs).
    const lines = { spread: { [g0.id]: -2.5, [g1.id]: 6.5 }, total: { [g0.id]: 47.5, [g1.id]: 41.5 } };
    await storeBookLines(world, lines);
    await sendBallot(world, 'luke', 'guess_spread', { [g0.id]: -3, [g1.id]: 7 }); // Spread opens for Luke; Total stays closed
    await world.db.query('insert into public.gtl_weekly_versions(user_id,season,week) values($1,$2,$3) on conflict do nothing', [ACCOUNTS.troy.id, season, week]);
    await world.db.query('insert into public.gtl_virtual_units_picks(user_id,season,week,game_id,market,selection) values($1,$2,$3,$4,$5,$6)',
      [ACCOUNTS.troy.id, season, week, g0.id, 'total', { gameId: g0.id, market: 'total', side: 'over', line: 47.5, odds: -110, units: 1.5, source: 'BetMGM', quotedAt: now, selectedAt: now }]);
    await openAt(page, '#bets/everyone');
    const rows = page.locator('.gx-prow[data-pick], .gx-prow[data-person]');
    await expect(rows.first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator(`.gx-prow[data-pick="${ACCOUNTS.troy.id}:total"]`)).toHaveAttribute('data-open', 'false');
    expect(await rows.evaluateAll(list => list.every(row => row.firstElementChild?.classList.contains('gx-prow-pic') && !!row.firstElementChild.querySelector('.gx-av')))).toBe(true);
    const secrets = lineSecrets(lines.total, { market: 'total' });
    for (const address of ['#bets', '#bets/everyone', '#bets/virtual', '#bets/recommended']) {
      await shared(page, address); await page.waitForLoadState('networkidle');
      await expect(page.locator('[data-landing="bets"], [data-bets-section]').first(), address).toBeVisible();
      const { text, attributes } = await page.evaluate(() => ({ text: document.body.innerText,
        attributes: [...document.body.querySelectorAll('*')].flatMap(el => [...el.attributes].filter(a => (el.closest('svg') ? a.name === 'aria-label' : a.name !== 'style' && a.name !== 'class')).map(a => `${a.name}=${a.value}`)) }));
      assertNoLeak({ text, attributes }, { viewer: ACCOUNTS.luke.id, secrets }, address);
    }
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

/** Every Bets address with something drawn on it: the landing, My bets' lists and editor, Your picks, Everyone, Recommended and one assessment, Your gap and one gap. */
async function phoneWorld(page, baseURL) {
  const world = await world4(page, baseURL);
  await seedTicket(world, 'open');
  await seedResearch(world);
  await troyPick(world);
  await openAt(page, '#bets/research');
  const assessment = page.locator('ol[aria-label="Assessed bets"] .gx-prow').first();
  await expect(assessment).toBeVisible({ timeout: 30000 });
  const routeId = (await assessment.getAttribute('id')).replace('gx-b-ra-', '');
  await shared(page, '#bets/recommended');
  const first = page.locator('[data-gap-row]').first();
  await expect(first).toBeVisible({ timeout: 30000 });
  const item = await first.getAttribute('data-gap-row');
  const addresses = ['#bets', '#bets/active', '#bets/settled', '#bets/add', '#bets/virtual', '#bets/everyone', '#bets/research', `#bets/research?assessment=${routeId}`,
    '#bets/recommended', `#bets/recommended?layer=gap&item=${encodeURIComponent(item)}`];
  return { world, addresses };
}
async function sweep(page, addresses, passes) {
  const found = {};
  for (const { theme, width, wide = false } of passes) {
    await page.evaluate(value => localStorage.setItem('gtl.theme', value), theme);
    await page.setViewportSize({ width, height: 844 });
    for (const address of addresses) {
      await shared(page, address);
      await expect(page.locator('[data-landing="bets"], [data-bets-section], [data-bets-layer], .gx-ra').first(), address).toBeVisible({ timeout: 30000 });
      await page.waitForLoadState('networkidle');
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      if (wide) await page.addStyleTag({ content: WIDE_FONT });
      await settle(page);
      const problems = await phoneProblems(page);
      if (problems.length) found[`${theme} ${width}${wide ? ' wide' : ''} ${address}`] = problems;
    }
  }
  return found;
}

for (const [width, passes] of [[390, [{ theme: 'dark', width: 390 }, { theme: 'light', width: 390 }]],
  [320, [{ theme: 'dark', width: 320 }, { theme: 'light', width: 320 }, { theme: 'light', width: 320, wide: true }]]]) {
  test(`phone rules on every Bets address at ${width} px: Dark and Light${width === 320 ? ', the wide fallback font on every token' : ''}, 44 px targets, 12 px text, fixed bars, axe`, async ({ page, baseURL }) => {
    test.setTimeout(480000);
    const { world, addresses } = await phoneWorld(page, baseURL);
    try {
      expect(await sweep(page, addresses, passes)).toEqual({});
      expect(world.errors).toEqual([]);
    } finally { await world.db.close(); }
  });
}
