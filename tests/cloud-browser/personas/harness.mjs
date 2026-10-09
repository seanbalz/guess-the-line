// Persona harness: real cloud handler and real migrations on local PGlite, auth mocked
// through page.route (the community.spec.js pattern). Specs drive the real flow and
// COLLECT findings; they assert only what is true today so the suite stays green and
// the report (.local/personas/findings.json plus screenshots) is the output.
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { seed } from '../../../server/store.mjs';
import { createCloudHandler } from '../../../cloud/handler.mjs';
import { providerSocialError } from '../../../cloud/social.mjs';
import { providerPersonalError } from '../../../cloud/personal.mjs';
import { providerLobbyError } from '../../../cloud/lobby.mjs';
import { providerCommunityError } from '../../../cloud/community.mjs';
import { providerWeeklyError } from '../../../cloud/weekly.mjs';
import { pacificDate, pacificToUtc, weekOpenAt } from '../../../shared/nfl-schedule.mjs';

const DAY = 86_400_000;
/** D-24: a week opens Monday 00:00 PT, so an open fixture week must be the current Pacific week. Deadline 11:59 PM PT today. */
export const openDeadline = () => pacificToUtc(pacificDate(Date.now()).date, '23:59');
/** A published week whose Monday is still ahead: Thursday ~5:15 PM PT in the week after next. */
export const futureDeadline = () => new Date(Date.parse(weekOpenAt(Date.now() + 10 * DAY)) + 3 * DAY + 17.25 * 3_600_000).toISOString();

let PGlite;
try { ({ PGlite } = await import('../../../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit local-only skip in each spec. */ }
export const pgliteAvailable = !!PGlite;

export const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const MIGRATIONS = ['20261008164249_gtl_private_cloud_state.sql', '20261008174007_gtl_profiles_private_games_invites.sql', '20261008182836_gtl_canonical_weekly_entries.sql',
  '20261008185715_gtl_weekly_eligibility_rulings.sql', '20261008185738_gtl_manual_odds_collection.sql', '20261008192528_gtl_scoped_spread_benchmark.sql',
  '20261008200926_gtl_twelve_hour_odds_refresh.sql', '20261008224444_gtl_personal_workspace.sql', '20261008225401_gtl_submission_time_scoring.sql',
  '20261008232055_gtl_fresh_submission_odds.sql', '20261009005145_gtl_social_bet_tracker.sql', '20261009120000_gtl_community_feed.sql',
  '20261009130000_gtl_league_interest.sql', '20261009140000_gtl_d23_data_rule.sql', '20261009150000_gtl_auto_open_week.sql'];
export const SUPABASE = 'https://gtl-frontend-check.supabase.co';
export const PREVIEWS = '.local/previews/personas';
export const FINDINGS = '.local/personas/findings.json';
export const AXE_LOG = '.local/personas/axe-scans.json';
const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const AXE_SEVERITY = { critical: 1, serious: 2, moderate: 3, minor: 4 };
const cleared = new Set();

/** Builds the database and world for one persona run. */
async function buildWorld({ games = 14, deadline = openDeadline(), slate = true, profile = true, members = ['Troy Fixture', 'Luke Fixture'] } = {}) {
  const db = new PGlite();
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public,auth to service_role;');
  await db.exec(fs.readFileSync(`supabase/migrations/${MIGRATIONS[0]}`, 'utf8'));
  const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.games = state.games.slice(0, games);
  state.league.deadline = deadline;
  // Keep every kickoff after the deadline so the slate stays internally consistent.
  const shift = Date.parse(deadline) - Date.parse('2026-10-09T00:15:00Z');
  state.games.forEach(game => { game.kickoff = new Date(Date.parse(game.kickoff) + shift).toISOString(); });
  if (slate) await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke', state]);
  const users = [id(1), ...members.map((_, i) => id(i + 2))];
  await db.query(`insert into auth.users values ${users.map((_, i) => `($${i + 1})`).join(',')}`, users);
  for (const file of MIGRATIONS.slice(1)) await db.exec(fs.readFileSync(`supabase/migrations/${file}`, 'utf8'));
  const profiles = [...(profile ? [[id(1), 'Ben Fixture']] : []), ...members.map((name, i) => [id(i + 2), name])];
  for (const [userId, name] of profiles) await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [userId, name]);
  if (slate) await freshQuotes(db, state);
  return { db, state };
}

/** D-17: a submission needs references observed within five minutes. Records one three-book snapshot (fixture, not live odds). */
export async function freshQuotes(db, state, captured = Date.now() - 1000) {
  const iso = ms => new Date(ms).toISOString();
  const { season, week } = state.league;
  const signature = (await db.query('select signature from public.gtl_weekly_slates where season=$1 and week=$2', [season, week])).rows[0].signature;
  const payload = { provider: 'the-odds-api', sport: 'americanfootball_nfl', officialVerified: false, fetchedAt: iso(captured), games: state.games.map((g, i) => ({
    gameId: g.id, home: g.home, away: g.away, kickoff: g.kickoff, providerEventId: `event${i}`, matchStatus: 'matched',
    markets: Object.fromEntries([['spread', -3.5], ['total', 44.5]].map(([market, line]) => [market, { quotes: ['draftkings', 'fanduel', 'betmgm'].map(book => ({
      provider: 'the-odds-api', providerEventId: `event${i}`, book, market, value: line, timeBasis: 'provider_market_last_update', collectedAt: iso(captured), providerObservedAt: iso(captured - 1000),
      outcomes: market === 'spread' ? { home: { line, odds: -110 }, away: { line: -line, odds: -110 } } : { over: { line, odds: -110 }, under: { line, odds: -110 } },
    })) }])) })) };
  const key = crypto.randomUUID();
  await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,$4,$5,$6)", [key, id(1), crypto.randomUUID(), season, week, signature]);
  await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,$2,$3,$4,$5,$6)', [key, season, week, signature, payload, payload.fetchedAt]);
}

export const test = base.extend({
  persona: async ({ page, baseURL }, use, testInfo) => {
    const name = testInfo.titlePath[0].replace(/\.spec\.js$/, '').split('/').at(-1);
    const findings = [], errors = [], axeLog = [], seenAxe = new Set();
    let db = null, state = null, lastScreenshot = '';
    const net = { delay: 0, offline: false, fail: null, expireSession: false, quotesUnavailable: false, requests: [] };
    const persona = {
      name, findings, errors, net, get db() { return db; }, get state() { return state; },
      user: { id: id(1), aud: 'authenticated', role: 'authenticated', email: 'ben@example.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-01T00:00:00Z' },
      async start(options = {}) {
        ({ db, state } = await buildWorld(options));
        const expires = Math.floor(Date.now() / 1000) + 3600;
        const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: persona.user.id, aud: 'authenticated', exp: expires })).toString('base64url')}.test`;
        const session = { access_token: token, refresh_token: 'test-only', expires_in: 3600, expires_at: expires, token_type: 'bearer', user: persona.user };
        const rpc = mapper => async (fn, args) => {
          try { return await db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${fn}(${Object.keys(args).map((key, i) => `${key}=>$${i + 1}`).join(',')}) value`, Object.values(args))).rows[0].value; }); }
          catch (error) { throw mapper(error.message); }
        };
        const weeklyRpc = rpc(providerWeeklyError), personalRpc = rpc(providerPersonalError);
        // D-17 submissions need fresh sportsbook references. This fixture has no odds provider, so the
        // preflight reports eligible cached references unless a spec sets net.quotesUnavailable to
        // exercise the rejected-save path.
        const oddsRpc = (fn, args) => fn === 'gtl_preflight_submission' ? Promise.resolve(net.quotesUnavailable ? { requiresReferences: true, ready: false } : { requiresReferences: false, ready: true }) : personalRpc(fn, args);
        persona.handler = createCloudHandler({ authenticate: async value => value === token && !net.expireSession ? { ...persona.user, emailConfirmed: true } : null,
          social: { rpc: rpc(providerSocialError) }, personal: { rpc: rpc(providerPersonalError) }, lobby: { rpc: rpc(providerLobbyError) }, community: { rpc: rpc(providerCommunityError) }, odds: { rpc: oddsRpc },
          // Group game screens read membership and weekly state from the same local database.
          storage: { async membership(userId, leagueId) { return (await db.query('select player_id,active,role from public.gtl_memberships where user_id=$1 and league_id=$2 and active limit 1', [userId, leagueId])).rows[0] || null; } },
          weekly: {
            load: (userId, leagueId) => weeklyRpc('gtl_read_weekly_state', { p_user: userId, p_league: leagueId }),
            saveBallot: (userId, leagueId, mode, revision, picks, submit) => weeklyRpc('gtl_save_weekly_ballot', { p_user: userId, p_league: leagueId, p_mode: mode, p_revision: revision, p_picks: picks, p_submit: submit }),
            saveSelection: (userId, leagueId, revision, selection) => weeklyRpc('gtl_save_weekly_selection', { p_user: userId, p_league: leagueId, p_revision: revision, p_selection: selection }),
          } });
        page.on('pageerror', error => errors.push(error.message));
        await page.route('**/*', async route => {
          const req = route.request(), url = new URL(req.url());
          if (url.origin === new URL(baseURL).origin) { if (net.delay) await new Promise(r => setTimeout(r, net.delay)); return route.continue(); }
          const reply = (status, body) => route.fulfill({ status, headers: { 'access-control-allow-origin': '*' }, contentType: 'application/json', body: JSON.stringify(body) });
          if (url.origin !== SUPABASE) { errors.push(`Unexpected external request ${url.origin}`); return route.abort(); }
          if (url.pathname === '/auth/v1/token') return reply(200, session);
          if (url.pathname === '/auth/v1/user') return reply(200, persona.user);
          if (url.pathname === '/auth/v1/logout') return reply(200, {});
          const endpoint = url.pathname.replace(/^.*\/gtl-api\//, '');
          net.requests.push({ endpoint, method: req.method(), body: req.method() === 'POST' ? req.postDataJSON() : null });
          if (net.delay) await new Promise(r => setTimeout(r, net.delay));
          if (net.offline) return route.abort('internetdisconnected');
          const injected = net.fail?.(endpoint, req);
          if (injected) return reply(injected.status, injected.body);
          const response = await persona.handler(new Request(req.url(), { method: req.method(), headers: req.headers(), ...(req.method() === 'POST' ? { body: req.postData() } : {}) }));
          return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
        });
        persona.token = token;
        return { db, state, session };
      },
      /** Signs in with the mocked password form; the community home needs a saved display name. */
      async signIn() {
        await page.goto('/');
        await page.getByLabel('Email', { exact: true }).fill('ben@example.test');
        await page.getByLabel('Password', { exact: true }).fill('test-password');
        await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
      },
      /** Saves a ballot straight through the handler, as this user would from another device. */
      async saveBallot(mode, picks, submit = true, data = null) {
        const read = data || await persona.api('personal');
        const result = await persona.api('personal/ballot', { season: read.season, week: read.week, mode, weeklyRevision: read.weeklyRevision, revision: read.revision, submit, picks, requestId: crypto.randomUUID() });
        return result;
      },
      async api(route, body) {
        const headers = { authorization: `Bearer ${persona.token}`, ...(body ? { 'content-type': 'application/json' } : {}) };
        const response = await persona.handler(new Request(`${SUPABASE}/functions/v1/gtl-api/${route}`, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}) }));
        const json = await response.json();
        if (!response.ok) throw new Error(`${route} ${response.status}: ${json.error}`);
        return json;
      },
      async shot(screen, options = {}) {
        fs.mkdirSync(PREVIEWS, { recursive: true });
        const file = path.join(PREVIEWS, `${name}-${screen}.png`);
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled', ...options });
        lastScreenshot = file;
        return file;
      },
      /** Records one observation. Severity 1 = blocks the task, 2 = major friction, 3 = moderate, 4 = polish. */
      finding({ screen, severity, wcag = null, experience, fix, screenshot = lastScreenshot, evidence = null }) {
        findings.push({ persona: name, screen, severity, wcag, experience, fix, screenshot, evidence });
      },
      /** Runs axe-core (WCAG 2.1 A/AA) on the current screen and records each new violation. */
      async axe(screen, { include = null, disableRules = [] } = {}) {
        let builder = new AxeBuilder({ page }).withTags(AXE_TAGS);
        if (include) builder = builder.include(include);
        if (disableRules.length) builder = builder.disableRules(disableRules);
        const results = await builder.analyze();
        axeLog.push({ persona: name, screen, url: page.url(), viewport: page.viewportSize(), violations: results.violations.length, passes: results.passes.length, incomplete: results.incomplete.map(rule => rule.id) });
        for (const violation of results.violations) {
          const key = `${violation.id}:${violation.nodes[0]?.target?.join(' ')}`;
          if (seenAxe.has(key)) continue; seenAxe.add(key);
          persona.finding({ screen, severity: AXE_SEVERITY[violation.impact] || 3, wcag: violation.tags.filter(tag => /^wcag\d{3,4}$/.test(tag)).map(tag => tag.replace(/^wcag(\d)(\d)(\d+)$/, '$1.$2.$3')).join(', ') || violation.id,
            experience: `axe ${violation.id} (${violation.impact}): ${violation.help}. ${violation.nodes.length} element(s), first: ${violation.nodes[0]?.target?.join(' ')} — ${violation.nodes[0]?.failureSummary?.split('\n').slice(1).join(' ').trim()}`,
            fix: violation.helpUrl, evidence: { rule: violation.id, nodes: violation.nodes.slice(0, 5).map(node => node.target.join(' ')) } });
        }
        return results;
      },
      /** Measures interactive targets smaller than 44x44 CSS px on the current screen (WCAG 2.5.5 AAA target, brand guide minimum). */
      async smallTargets(screen, { min = 44, severity = 3 } = {}) {
        const small = await page.evaluate(min => [...document.querySelectorAll('button,a[href],input,select,summary,[role=button]')]
          .filter(el => el.getClientRects().length && !el.closest('[inert]') && !el.classList.contains('skip-link'))
          .map(el => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), text: (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 40), tag: el.tagName.toLowerCase(), cls: el.className?.toString().split(' ').slice(0, 2).join('.') }; })
          .filter(r => r.w < min || r.h < min), min);
        if (small.length) persona.finding({ screen, severity, wcag: '2.5.5 (AAA) / brand 44px minimum', experience: `${small.length} interactive target(s) under ${min}px: ${small.slice(0, 6).map(s => `"${s.text}" ${s.w}×${s.h} (${s.tag}.${s.cls})`).join('; ')}${small.length > 6 ? '; …' : ''}`,
          fix: 'Give these controls min-height/min-width 44px or enlarge their padding so a thumb or tremor-affected pointer lands on them.', evidence: small });
        return small;
      },
      /** Returns the focused element's accessible description and whether a visible focus ring is painted. */
      async focused() {
        return page.evaluate(() => {
          const el = document.activeElement; if (!el || el === document.body) return { tag: 'body', name: '', ring: false, visible: false };
          const style = getComputedStyle(el), rect = el.getBoundingClientRect();
          const ring = (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none';
          const visible = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
          return { tag: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 40), ring, visible, pressed: el.getAttribute('aria-pressed'), disabled: el.disabled };
        });
      },
      /** Presses Tab until the focused element matches; returns the number of presses, or -1. */
      async tabTo(matcher, { max = 400, shift = false } = {}) {
        for (let i = 1; i <= max; i++) { await page.keyboard.press(shift ? 'Shift+Tab' : 'Tab'); if (matcher(await persona.focused())) return i; }
        return -1;
      },
      async noOverflow() { return page.evaluate(() => document.documentElement.scrollWidth <= innerWidth); },
      async smallText(screen, { min = 12, severity = 3 } = {}) {
        const small = await page.evaluate(min => {
          const out = new Map();
          for (const el of document.querySelectorAll('body *')) {
            if (!el.getClientRects().length || !el.childNodes.length) continue;
            const text = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
            if (!text) continue;
            const size = parseFloat(getComputedStyle(el).fontSize);
            if (size < min) { const key = `${size}px ${el.className?.toString().split(' ')[0] || el.tagName.toLowerCase()}`; if (!out.has(key)) out.set(key, text.slice(0, 40)); }
          }
          return [...out].map(([k, v]) => `${k}: "${v}"`);
        }, min);
        if (small.length) persona.finding({ screen, severity, wcag: 'Brand guide type scale (metadata 13px, interactive 16px mobile)', experience: `Text below ${min}px on this screen: ${small.slice(0, 8).join('; ')}${small.length > 8 ? '; …' : ''}`, fix: 'Raise metadata to 13px and interactive text to 16px on mobile as the brand guide specifies; drop the 7–11px badge, eyebrow and text-button sizes.', evidence: small });
        return small;
      },
    };
    await use(persona);
    // Persist findings: replace this persona's entries from earlier runs, keep other personas.
    fs.mkdirSync(path.dirname(FINDINGS), { recursive: true });
    let all = [];
    try { all = JSON.parse(fs.readFileSync(FINDINGS, 'utf8')); } catch { all = []; }
    if (!cleared.has(name)) { all = all.filter(f => f.persona !== name); cleared.add(name); }
    all.push(...findings);
    fs.writeFileSync(FINDINGS, JSON.stringify(all, null, 2));
    let scans = [];
    try { scans = JSON.parse(fs.readFileSync(AXE_LOG, 'utf8')); } catch { scans = []; }
    fs.writeFileSync(AXE_LOG, JSON.stringify([...scans.filter(scan => scan.persona !== name || cleared.has(`${name}:axe`)), ...axeLog], null, 2));
    cleared.add(`${name}:axe`);
    if (db) await db.close();
    expect(errors, 'no page errors or unexpected external requests').toEqual([]);
  },
});
export { expect };
