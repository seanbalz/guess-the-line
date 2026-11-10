// D-82 Player Props with the app flag ON (playwright.player-props.config.js builds with VITE_GTL_PLAYER_PROPS=on), on the
// real gtl-api handler with GTL_PLAYER_PROPS=on and every migration on local PGlite (player-props-world.mjs). Fixture data
// only; no hosted request. Contracts at 320 and 390 × 844, Dark and Light (no side scroll, no layout problems, axe clean):
// - sheet 01 entry: Player Props beside Spread/Total, position and search, the athlete and stat, the hidden market, the
//   half-point guess with its direct editor and one lock per prop;
// - sheet 02 locked: the final guess, the saved receipt in the Spread/Total receipt layout (prop athlete/stat/unit/event and
//   source times), the latest market kept separate, and other players' locked guesses only after your own lock-in;
// - sheet 05 recovery: a lock without a qualifying reference keeps the editable draft;
// - sheets 03, 04 and 06 on Bets › Your guess vs. market › Player Props; History › Guess › Player Props.
// GTL_PROPS_CAPTURE=1 writes the screenshots to design/player-props-review-2026-11-09/production/ (the committed set).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { ACCOUNTS, SUPABASE, pgliteAvailable, signIn } from './community-world.mjs';
import { LAMB, propsWorld } from './player-props-world.mjs';
import { openPicksWeek } from './play-nest.mjs';
import { setCaptureTheme, themedScreenshot } from './theme-capture.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(240000);
test.beforeEach(() => {
  test.skip(process.env.GTL_PLAYER_PROPS_BUILD !== 'on', 'Runs on the flag-on build only: playwright.player-props.config.js.');
  test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.');
});

const OUT = new URL('../../design/player-props-review-2026-11-09/production/', import.meta.url);
const CAPTURE = process.env.GTL_PROPS_CAPTURE === '1';
const AXE = ['wcag2a', 'wcag2aa', 'wcag21aa'];
const tabs = page => page.getByRole('navigation', { name: 'Main' });
const api = name => `${SUPABASE}/functions/v1/gtl-api/${name}`;
const settled = page => page.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished.catch(() => null))));

/** Both themes at 320 and 390: layout, side scroll, 44px buttons and axe, then a full-content capture. */
async function shoot(page, info, name, { axe = true } = {}) {
  for (const theme of ['dark', 'light']) {
    await setCaptureTheme(page, theme);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await settled(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await page.evaluate(layoutProblems), `${name} ${theme} ${width}`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} ${theme} ${width} side scroll`).toBe(true);
      const small = await page.evaluate(() => [...document.querySelectorAll('.gx-props button, .gx-props input, .gx-props-record button, .gx-props-record select, [data-prop-reveal] button')]
        .filter(el => el.getClientRects().length && !el.closest('dialog:not([open])')).filter(el => el.offsetWidth < 44 || el.offsetHeight < 44)
        .map(el => `${el.getAttribute('aria-label') || el.textContent.trim()} ${el.offsetWidth}x${el.offsetHeight}`));
      expect(small, `${name} ${theme} ${width} targets`).toEqual([]);
      // No label is broken inside a word (the four-segment market controls at 320).
      const broken = await page.evaluate(() => [...document.querySelectorAll('.gx-seg-btn')].filter(el => el.getClientRects().length).filter(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const lines = new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
        return lines > el.textContent.trim().split(/\s+/).length;
      }).map(el => el.textContent.trim()));
      expect(broken, `${name} ${theme} ${width} words`).toEqual([]);
      if (axe) {
        const found = await new AxeBuilder({ page }).withTags(AXE).analyze();
        expect(found.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), `${name} ${theme} ${width} axe`).toEqual([]);
      }
      // Full content as the approved boards show it: the viewport grows to the page, so the shared floating bar sits at
      // the end (a fullPage capture would paint the fixed bar mid-page). The last control must clear the bar.
      const tall = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewportSize({ width, height: Math.max(844, tall) });
      await settled(page);
      expect(await page.evaluate(() => {
        const bar = document.querySelector('nav[aria-label="Main"]')?.getBoundingClientRect();
        const controls = [...document.querySelectorAll('main button, main select, main input, .gx-screen button, .gx-screen select')].filter(el => el.getClientRects().length && !el.closest('nav') && !el.closest('dialog') && !el.closest('details:not([open]) > :not(summary)'));
        return controls.filter(el => bar && el.getBoundingClientRect().bottom > bar.top).map(el => `${el.tagName} ${el.className} ${el.textContent.trim().slice(0, 40)}`);
      }), `${name} ${theme} ${width} end clearance`).toEqual([]);
      const file = `${name}-${theme}-${width}.png`;
      await themedScreenshot(page, info, file, theme);
      await page.setViewportSize({ width, height: 844 });
      if (CAPTURE) fs.copyFileSync(info.outputPath(file), new URL(file, OUT));
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function openProps(page) {
  await tabs(page).getByRole('button', { name: /^Play(,|$)/ }).click();
  await openPicksWeek(page);
  await page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Player Props', exact: true }).click();
  await expect(page.locator('.gx-props')).toBeVisible();
}

test.beforeAll(() => { if (CAPTURE) fs.mkdirSync(OUT, { recursive: true }); });

test('Play › Player Props: entry, lock-in with the saved receipt and revealed guesses, and draft recovery', async ({ page, baseURL }, info) => {
  const world = await propsWorld(page, baseURL);
  const shared = [];
  page.on('request', request => { if (request.url().endsWith('/props/shared')) shared.push(request.postDataJSON()); });
  try {
    await signIn(page, 'luke');
    await openProps(page);
    const props = page.locator('.gx-props');
    await expect(page.locator('[data-props-line]')).toHaveText('Optional · choose as many props as you want');
    await expect(props.getByRole('list', { name: 'Athletes with verified lines' }).getByRole('listitem')).toHaveCount(4);
    // Discovery: a position never removes a valid cross-position stat; the search names the athlete.
    await props.getByRole('group', { name: 'Position' }).getByRole('button', { name: 'RB', exact: true }).click();
    await expect(props.getByRole('listitem')).toHaveText([/Fixture Running Back/]);
    await props.getByRole('group', { name: 'Position' }).getByRole('button', { name: 'WR', exact: true }).click();
    await props.getByRole('button', { name: /CeeDee Lamb/ }).click();
    await expect(props.getByRole('group', { name: 'Stat' }).getByRole('button')).toHaveText(['Receiving yards', 'Receptions', 'Receiving TDs']);
    await expect(props.getByText('Market hidden on this screen')).toBeVisible();
    // Nothing on the entry screen carries a market number: no line, reference or book reaches it before lock-in.
    const board = await world.api('luke', 'props/read', { season: world.state.league.season, week: world.state.league.week });
    expect(JSON.stringify(board.body.offers)).not.toMatch(/"(line|reference|books)"/);
    // Half-point steps, then the direct editor; it closes once a valid number is entered.
    await props.getByRole('button', { name: 'Raise receiving yards guess by 0.5' }).click();
    await expect(props.locator('output')).toHaveText('0.5');
    await props.getByRole('button', { name: 'Edit number' }).click();
    await props.getByLabel('Your receiving yards guess').fill('72.5');
    await props.getByLabel('Your receiving yards guess').press('Enter');
    await expect(props.locator('output')).toHaveText('72.5');
    await expect(props.getByRole('button', { name: 'Edit number' })).toBeVisible();
    expect(shared, 'nothing is open to Luke yet, so other players are not read').toEqual([]);
    await shoot(page, info, '01-entry');

    // Lock in: the guess is final; Troy's and Sean's locked guesses open now, never before.
    await props.getByRole('button', { name: 'Lock in receiving yards' }).click();
    await expect(props.getByLabel(/^Locked in · CeeDee Lamb Receiving yards$/)).toBeVisible();
    await expect(page.locator('[data-props-line]')).toHaveText('Player Props · your saved pick');
    const reveal = props.locator('[data-prop-reveal]');
    await expect(reveal.getByRole('listitem')).toHaveCount(2);
    await expect(reveal).toContainText('Troy Fixture'); await expect(reveal).toContainText('70.5 yd');
    await expect(reveal).toContainText('Sean Fixture'); await expect(reveal).toContainText('64 yd');
    await shoot(page, info, '02-locked');
    // The saved receipt: the Spread/Total scorecard and receipt pattern with this prop's identity, unit and source time.
    await props.getByRole('button', { name: 'Open saved receipt' }).click();
    const receipt = props.locator('[data-prop-receipt]');
    await expect(receipt.locator('[data-prop-scorecard]')).toContainText('Your saved guess');
    await expect(receipt).toContainText('Three-book median');
    await expect(receipt).toContainText('68.5');
    await expect(receipt).toContainText('Missed by 4 yd');
    await expect(receipt).toContainText(/Saved line observed .* PT · 3 books/);
    await receipt.getByRole('button', { name: 'About this reference' }).click();
    const about = page.getByRole('dialog', { name: 'About this reference' });
    await expect(about).toContainText('DraftKings 67.5'); await expect(about).toContainText('2026 Week 5');
    await about.getByRole('button', { name: /close/i }).click();
    await shoot(page, info, '02-receipt');

    // Receptions has no qualifying retained reference: the lock is refused and the draft stays editable (sheet 05).
    await props.getByRole('button', { name: 'Choose another prop' }).click();
    await props.getByRole('button', { name: /CeeDee Lamb/ }).click();
    await props.getByRole('group', { name: 'Stat' }).getByRole('button', { name: 'Receptions', exact: true }).click();
    await props.getByRole('button', { name: 'Edit number' }).click();
    await props.getByLabel('Your receptions guess').fill('5.5');
    await props.getByLabel('Your receptions guess').press('Enter');
    await props.getByRole('button', { name: 'Lock in receptions' }).click();
    await expect(props.getByText('We couldn’t verify the market reference')).toBeVisible();
    await expect(page.locator('[data-props-line]')).toHaveText('Your draft is safe · not locked in');
    expect((await world.db.query("select guess::float8 guess,status from public.gtl_prop_guesses where user_id=$1 and stat='player_receptions' and event_id=$2", [ACCOUNTS.luke.id, world.eventId])).rows)
      .toEqual([{ guess: 5.5, status: 'draft' }]);
    await shoot(page, info, '05-recovery');
    await props.getByRole('button', { name: 'Back to Player Props' }).click();
    await expect(props.getByRole('list', { name: 'Athletes with verified lines' })).toBeVisible();
    expect(world.errors).toEqual([]);
  } finally { await world.db.close(); }
});

test('Bets › Your guess vs. market › Player Props: accuracy, paper record and the missing/loading/error states', async ({ page, baseURL }, info) => {
  const world = await propsWorld(page, baseURL);
  try {
    await signIn(page, 'luke');
    await tabs(page).getByRole('button', { name: /^Bets(,|$)/ }).click();
    await page.getByRole('button', { name: /Your guess vs\. market/ }).click();
    await page.getByRole('group', { name: 'Recommendation market' }).getByRole('button', { name: 'Player Props', exact: true }).click();
    const record = page.locator('.gx-props-record');
    await record.getByLabel('Record period').selectOption('all');
    await expect(record.getByRole('article')).toHaveCount(2);
    await expect(record.getByRole('article', { name: /Receiving yards: average miss 4\.0 yards over 5 guesses/ })).toBeVisible();
    await expect(record.getByRole('article', { name: /Receptions: average miss 0\.6 receptions over 5 guesses/ })).toBeVisible();
    await shoot(page, info, '03-accuracy');

    await record.getByRole('button', { name: 'View Gap paper record' }).click();
    await record.getByLabel('Record period').selectOption('custom');
    await record.getByLabel('From').selectOption({ label: '2026 · W1' });
    await record.getByLabel('To').selectOption({ label: '2026 · W4' });
    await record.getByRole('button', { name: 'Apply range' }).click();
    await expect(record.getByText('5–2–1')).toBeVisible();
    await expect(record.getByRole('img', { name: '71.4% paper win rate' })).toBeVisible();
    await expect(record).toContainText('8 graded'); await expect(record).toContainText('2 awaiting finals');
    await shoot(page, info, '04-record');

    // Sheet 06, one state at a time: no locked guesses in this filter (never a zero score) …
    await record.getByRole('button', { name: 'Back to accuracy' }).click();
    await record.getByLabel('Record period').selectOption('week');
    await expect(record.getByText('Your first prop starts here')).toBeVisible();
    await expect(record.getByRole('button', { name: 'Choose an available prop' })).toBeVisible();
    await shoot(page, info, '06-no-guesses');
    // … the reader failing (Retry, with the filters kept) …
    await page.route(api('props/history'), route => route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'failed' }) }));
    await record.getByLabel('Record period').selectOption('all');
    await expect(record.getByText('This record couldn’t load')).toBeVisible();
    await shoot(page, info, '06-error');
    // … no verified props on this server (a dark or unapplied gtl-api answers 404) …
    await page.unroute(api('props/history'));
    await page.route(api('props/history'), route => route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify({ error: 'Not found.' }) }));
    await record.getByRole('button', { name: 'Retry this period' }).click();
    await expect(record.getByText('No verified props available yet')).toBeVisible();
    await shoot(page, info, '06-no-props');
    // … and the whole period still loading: no partial total is drawn.
    await page.unroute(api('props/history'));
    let release;
    await page.route(api('props/history'), async route => { await new Promise(resolve => { release = resolve; }); await route.continue().catch(() => {}); });
    await record.getByRole('button', { name: 'Check available props' }).click();
    await expect(record.getByText('Loading the complete period')).toBeVisible();
    await shoot(page, info, '06-loading', { axe: true });
    release?.();
    await page.unroute(api('props/history'));

    // Choose an available prop opens Play › Your guesses on Player Props.
    await record.getByLabel('Record period').selectOption('week');
    await record.getByRole('button', { name: 'Choose an available prop' }).click();
    await expect(page.locator('.gx-props')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Market', exact: true }).getByRole('button', { name: 'Player Props', exact: true })).toHaveAttribute('aria-pressed', 'true');
  } finally { await world.db.close(); }
});

test('History › Guess › Player Props: your locked props by week, per-stat accuracy and the saved receipt', async ({ page, baseURL }, info) => {
  const world = await propsWorld(page, baseURL);
  try {
    await page.addInitScript(() => { if (location.origin !== 'null') localStorage.setItem('gtl.app', 'next'); });
    await page.goto('/#history');
    await signIn(page, 'luke', { navigate: false });
    const history = page.locator('[data-page="history"]');
    await expect(history.getByRole('group', { name: 'Market' }).getByRole('button')).toHaveText(['Spread', 'Total', 'Player Props']);
    await history.getByRole('group', { name: 'Market' }).getByRole('button', { name: 'Player Props' }).click();
    await expect(history.getByRole('heading', { name: 'Your prop accuracy' })).toBeVisible();
    await expect(history.locator('[data-prop-week]')).toHaveCount(4);
    await expect(history.locator('[data-prop-week]').first()).toContainText('Week 4');
    await shoot(page, info, 'history-props');
    await history.locator('[data-prop-week="4"]').click();
    const row = history.locator(`[data-prop-row="2026_04_CHI_DAL/${LAMB.id}/player_receptions"]`);
    await expect(row).toContainText('Right on the line');
    await row.locator('summary').click();
    await expect(row.locator('[data-prop-scorecard]')).toBeVisible();
    await expect(row).toContainText('Paper · Push');
    await shoot(page, info, 'history-props-week');
    // Another member's prop guesses are not History rows.
    await history.getByRole('button', { name: 'All weeks' }).click();
    await history.getByRole('group', { name: 'Player', exact: true }).getByRole('button', { name: 'Troy Fixture' }).click();
    await expect(history).toContainText('Player Props history lists your own locked props.');
    await expect(history.locator('[data-prop-week]')).toHaveCount(0);
  } finally { await world.db.close(); }
});
