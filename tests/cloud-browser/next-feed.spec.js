// Redesign build plan stage 64: the League feed, its digest and comments, at 390 x 844 on local PGlite fixtures (never
// hosted data). Contracts: every old post kind renders in its live shape; a friend's ballot post is a lock row until the
// viewer locks in that market, then opens the picks; a kickoff post shows who is in and opens its game thread; a comment
// posts at 500 characters and the 501st is blocked; nothing overflows a phone, every target is 44 px, and axe passes in
// Dark and Light at 390 and 320; when the feed reader is missing (M-22 not applied) the Community feed shows as before.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { ALL } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';
import { sendBallot, storeLines } from '../helpers/guess-week.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(120_000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
// Unusual half points, so a hidden one can never be mistaken for another number on the page.
const LINES = { spread: { 'TB-DAL': -11.5, 'PHI-JAX': 13.5 }, total: { 'TB-DAL': 58.5, 'PHI-JAX': 31.5 } };
const TROY = { 'TB-DAL': -6.5, 'PHI-JAX': 2.5 };
const LUKE = { 'TB-DAL': -1.5, 'PHI-JAX': 4.5 };
const feed = page => page.getByRole('region', { name: 'Community feed' });
const card = (page, kind) => page.locator(`.gx-feed-post[data-kind="${kind}"]`);

async function open(page) {
  await page.addInitScript(() => localStorage.setItem('gtl.app', 'next'));
  await page.goto('/#feed');
  await signIn(page, 'luke', { navigate: false });
  await expect(feed(page)).toBeVisible();
}
async function phone(page, label) {
  // At the top of the page: the fixed top bar may sit over a scrolled card, which is not a layout problem.
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(layoutProblems), label).toEqual([]);
  const small = await page.locator('.gx').evaluate(root => [...root.querySelectorAll('button, a[href], textarea, input')]
    .filter(el => el.getClientRects().length && !el.closest('[inert], [hidden]'))
    .map(el => ({ text: (el.getAttribute('aria-label') || el.textContent).trim().slice(0, 30), w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }))
    .filter(box => box.w < 43.5 || box.h < 43.5));
  expect(small, label).toEqual([]);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(audit.violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(', ')}`), label).toEqual([]);
}
async function everyWidthAndTheme(page, label, testInfo, after = async () => {}) {
  for (const theme of ['dark', 'light']) {
    await page.evaluate(value => document.documentElement.setAttribute('data-theme', value), theme);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await phone(page, `${label} ${theme} ${width}`);
      if (width === 390) await page.screenshot({ path: testInfo.outputPath(`${label}-${theme}.png`), fullPage: true });
      await after();
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

test('every old kind renders; a friend\'s ballot is a lock row until Luke locks in, then opens the picks; a kickoff post opens its thread', async ({ page, baseURL }, testInfo) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true, troyBallots: false });
  try {
    const { db, state } = world, { season, week } = state.league;
    await storeLines(db, state, LINES);
    await sendBallot(world, 'troy', 'guess_spread', TROY);
    const at = minutes => new Date(Date.now() - minutes * 60_000).toISOString();
    const insert = (kind, payload, created, actor = ACCOUNTS.troy.id) => db.query('insert into public.gtl_feed_posts(actor_id,kind,season,week,payload,dedupe_key,created_at) values($1,$2,$3,$4,$5,$6,$7) returning id',
      [actor, kind, season, week, payload, `${kind}:${randomUUID()}`, created]);
    await insert('week_published', { games: 2, deadline: state.league.deadline }, at(300), ACCOUNTS.sean.id);
    await insert('bet_posted', { entryId: 'fixture-entry', action: 'create' }, at(200));
    await insert('bet_settled', { entryId: 'fixture-entry', action: 'settle' }, at(190));
    await insert('points_played', {}, at(180));
    await insert('points_final', { winners: [{ userId: ACCOUNTS.troy.id, points: 30.5 }], house: null, max: 50 }, at(170));
    const kickoff = (await insert('kickoff', { kickoff: at(5), games: ['TB-DAL'] }, at(5), ACCOUNTS.sean.id)).rows[0].id;
    // An old comment on the week post, in its stored shape.
    const weekPost = (await db.query("select id from public.gtl_feed_posts where kind='week_published'")).rows[0].id;
    await world.api('sean', 'community/comment', { requestId: randomUUID(), postId: weekPost, body: 'Week is open, get your picks in' });
    await open(page);
    // The old kinds, in the words the new feed uses.
    await expect(card(page, 'joined').first()).toContainText('joined Guess The Line');
    await expect(card(page, 'week_published')).toContainText(`Week ${week} is open`);
    await expect(card(page, 'week_published')).toContainText('2 games · picks due');
    await expect(card(page, 'week_published')).toContainText('Sean Fixture Week is open, get your picks in');
    await expect(card(page, 'bet_posted')).toContainText('posted a real slip');
    await expect(card(page, 'bet_settled')).toContainText('Real slip');
    await expect(card(page, 'points_played')).toContainText(`is playing Week ${week} Points`);
    await expect(card(page, 'points_final')).toContainText('30.5 pts · House — · FINAL');
    // Troy's Spread: a lock row, and none of his numbers or the lines anywhere on the page.
    const ballot = card(page, 'ballot_submitted');
    await expect(ballot.locator('[data-locked="true"]')).toContainText('Troy Fixture’s Spread picks');
    for (const secret of ['6.5', '11.5', '13.5', '58.5', '31.5']) await expect(feed(page)).not.toContainText(secret);
    // The kickoff post: who is in for the game, and its game thread.
    const kick = page.locator(`.gx-feed-post[data-post="${kickoff}"]`);
    await expect(kick).toContainText('kicked off');
    await expect(kick.getByRole('button', { name: /^TB @ DAL, 1 player in · 0 bets/ })).toBeVisible();
    await kick.getByRole('button', { name: 'Game thread, 0 comments' }).click();
    await expect(page.getByRole('dialog', { name: 'Game thread · TB @ DAL' })).toBeVisible();
    await everyWidthAndTheme(page, 'feed-thread', testInfo);
    await page.keyboard.press('Escape');
    await everyWidthAndTheme(page, 'feed', testInfo);
    // Luke locks in his Spread: Troy's picks open, in the sheet.
    await sendBallot(world, 'luke', 'guess_spread', LUKE);
    await page.reload();
    await expect(feed(page)).toBeVisible();
    const troys = card(page, 'ballot_submitted').filter({ hasText: 'Troy Fixture' });
    await troys.getByRole('button', { name: 'See Troy Fixture’s Spread picks' }).click();
    const sheet = page.getByRole('dialog', { name: 'Troy Fixture’s Spread picks' });
    await expect(sheet).toContainText('Tampa Bay Buccaneers at Dallas Cowboys'); // D-62: the game as marks
    await expect(sheet).toContainText('DAL −6.5');
    await expect(sheet).toContainText('PHI −2.5');
    await everyWidthAndTheme(page, 'feed-picks', testInfo);
    expect(world.errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('a comment posts at 500 characters and the 501st is blocked; it shows in the sheet and the card', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  try {
    await open(page);
    // Troy's two ballot posts fold into a digest (one day, no reactions yet); comment on a joined post.
    const ballot = card(page, 'joined').first();
    await ballot.getByRole('button', { name: 'Comment' }).click();
    await expect(page.getByRole('dialog', { name: 'Comments · 0' })).toBeVisible();
    const sheet = page.getByRole('dialog', { name: /^Comments · \d+$/ });
    await expect(sheet).toContainText('No comments yet. Say something.');
    const box = sheet.getByRole('textbox', { name: 'Add a comment' });
    await box.fill('x'.repeat(501));
    await expect(box).toHaveValue('x'.repeat(500));
    await expect(sheet).toContainText('500 of 500');
    await expect(sheet).toContainText('Comments can’t be edited or deleted.');
    await box.fill(`${'y'.repeat(495)} done`);
    await sheet.getByRole('button', { name: 'Post' }).click();
    await expect(page.getByText('Comment posted')).toBeVisible();
    await expect(sheet.getByRole('list', { name: 'Comments' })).toContainText('done');
    await expect(page.getByRole('dialog', { name: 'Comments · 1' })).toBeVisible();
    await expect(box).toHaveValue('');
    expect((await world.db.query('select char_length(body) n from public.gtl_feed_comments')).rows).toEqual([{ n: 500 }]);
    await page.keyboard.press('Escape');
    await expect(ballot.getByRole('button', { name: '1 comment. Open comments' })).toBeVisible();
    await expect(ballot).toContainText('Luke Fixture');
    expect(world.errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});

test('friends\' ballots of one day fold into a digest with a way to each post; without the feed reader the old Community feed shows', async ({ page, baseURL }) => {
  const world = await communityWorld(page, baseURL, { migrations: ALL, optionalRpc: true });
  try {
    // Sean's ballot post the same day as Troy's: two friends, one digest (the fixture's Troy posts are from one day).
    const troy = (await world.db.query("select season,week,created_at from public.gtl_feed_posts where kind='ballot_submitted' limit 1")).rows[0];
    await world.db.query("insert into public.gtl_feed_posts(actor_id,kind,season,week,mode,dedupe_key,created_at) values($1,'ballot_submitted',$2,$3,'guess_total','fixture:sean',$4)",
      [ACCOUNTS.sean.id, troy.season, troy.week, troy.created_at]);
    await open(page);
    const digest = page.locator('.gx-feed-digest');
    await expect(digest).toContainText(/(?:Sean Fixture and Troy Fixture|Troy Fixture and Sean Fixture) locked in picks/);
    await digest.getByRole('button', { name: 'Show each post (3)' }).click();
    await expect(card(page, 'ballot_submitted')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Fold these 3 posts' })).toBeVisible();
    // The feed reader answers 503 (M-22 not applied, or GTL_FEATURE_OFF=feed): the Community feed from /community/read.
    await page.route(url => url.origin === SUPABASE && url.pathname.endsWith('/gtl-api/league/feed'), route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'This part of the feed is not available right now. Nothing was changed.' }) }));
    await page.reload();
    await expect(page.locator('.gx-league-post').first()).toBeVisible();
    await expect(page.locator('.gx-feed-post')).toHaveCount(0);
    expect(world.errors).toEqual([]);
  } finally { await page.unrouteAll({ behavior: 'wait' }); await page.close(); await world.db.close(); }
});
