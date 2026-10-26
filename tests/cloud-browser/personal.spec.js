import { test as base, expect } from '@playwright/test';
import { seed } from '../../server/store.mjs';
import { createCloudHandler } from '../../cloud/handler.mjs';
import { providerPersonalError } from '../../cloud/personal.mjs';
import { providerLobbyError } from '../../cloud/lobby.mjs';
import { FEATURE_OFF } from '../../cloud/optional-rpc.mjs';
import { isWebfont } from '../fixtures/webfonts.mjs';
import { pacificDate, pacificToUtc } from '../../shared/nfl-schedule.mjs';
import { ALL, HOSTED, PRELUDE, migrationSql } from '../migrations.mjs';
import { useOldApp } from './old-app.mjs';
let PGlite;
try { ({ PGlite } = await import('../../.local/sql-check/node_modules/@electric-sql/pglite/dist/index.js')); } catch { /* Explicit skip. */ }
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const test = base.extend({
  // The migrations to apply: HOSTED unless a block names another list (the D-40 block below uses ALL).
  schema: [HOSTED, { option: true }],
  personal: async ({ page, baseURL, schema }, use) => {
    test.skip(!PGlite, 'Local PGlite is required; never connects to hosted data.');
    // report.rules: the live Guess rules the handler's optional-RPC read answers. The hosted schema has no gtl_live_rules, so by
    // default the read answers "feature off" and /personal carries today's rules, whichever `schema` the block applies.
    const db = new PGlite(), report = { errors: [], requests: [], oddsCalls: [], failAfterCommit: false, rules: null };
    await db.exec(PRELUDE);
    // The old app on the schema players actually have (tests/migrations.mjs), unless the block sets `schema`.
    const migrations = schema;
    await db.exec(migrationSql(migrations[0]));
    // D-24 on the hosted schema: a ballot saves only in an open week (Monday 12:00 AM PT to the deadline), so the
    // fixture week is the current Pacific week with its deadline at 11:59 PM PT today and kickoffs after it.
    const deadline = pacificToUtc(pacificDate(Date.now()).date, '23:59');
    const state = seed(); state.ballots = {}; state.bets = {}; state.audit = []; state.games = state.games.slice(0,2); state.league.deadline = deadline; state.games.forEach((g, i) => { g.kickoff = new Date(Date.parse(deadline) + i * 3_600_000).toISOString(); });
    await db.query('insert into public.gtl_leagues(id,state) values($1,$2)', ['sean-troy-luke',state]);
    await db.query('insert into auth.users values($1)', [id(1)]);
    for (const file of migrations.slice(1)) await db.exec(migrationSql(file));
    await db.query('insert into public.gtl_profiles(user_id,display_name) values($1,$2)', [id(1),'Solo Tester']);
    const rpc = (mapper) => async (name, args) => {
      try { return await db.transaction(async tx => { await tx.exec('set local role service_role'); return (await tx.query(`select public.${name}(${Object.keys(args).map((key,i) => `${key}=>$${i+1}`).join(',')}) value`, Object.values(args))).rows[0].value; }); }
      catch (e) { throw mapper(e.message); }
    };
    const user = { id:id(1),aud:'authenticated',role:'authenticated',email:'solo@example.test',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-10-01T00:00:00Z' };
    const expires = Math.floor(Date.now()/1000)+3600;
    const token = `${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,aud:'authenticated',exp:expires})).toString('base64url')}.test`;
    const session = {access_token:token,refresh_token:'test-only',expires_in:3600,expires_at:expires,token_type:'bearer',user};
    const handler = createCloudHandler({ authenticate:async value => value===token ? {...user,emailConfirmed:true} : null, personal:{rpc:rpc(providerPersonalError)},lobby:{rpc:rpc(providerLobbyError)},
      odds:{rpc:async(name,args)=>{report.oddsCalls.push(name);expect(name).toBe('gtl_preflight_submission');return rpc(providerPersonalError)(name,args);}},
      storage:{membership:()=>{throw Error('Personal route must not use membership');}},
      optionalRpc:async name=>(name==='gtl_live_rules'&&report.rules?structuredClone(report.rules):FEATURE_OFF) });
    page.on('pageerror', e => report.errors.push(e.message));
    await page.route('**/*',async route => {
      const req=route.request(),url=new URL(req.url());
      if(url.origin===new URL(baseURL).origin)return route.continue();
      const reply=(status,body)=>route.fulfill({status,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(body)});
      if(isWebfont(url))return route.abort();if(url.origin!=='https://gtl-frontend-check.supabase.co'){report.errors.push(`Unexpected request ${url.origin}`);return route.abort();}
      if(url.pathname==='/auth/v1/token')return reply(200,session);
      if(url.pathname==='/auth/v1/user')return reply(200,user);
      // D-21 community routes are not part of these fixtures; answer as an undeployed function.
      if (url.pathname.includes('/gtl-api/community/')) return reply(404, { error: 'Not found.' });
      if(url.pathname==='/auth/v1/logout')return reply(200,{});
      report.requests.push({route:url.pathname,body:req.method()==='POST'?req.postDataJSON():null});
      const response=await handler(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.method()==='POST'?{body:req.postData()}: {})}));
      if(report.failAfterCommit&&url.pathname.endsWith('/favorite/set')&&response.status===200){report.failAfterCommit=false;return reply(503,{error:'Simulated lost save response. Try again.'});}
      return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    report.db=db; report.games=state.games;
    // Persist synthetic evidence through the same tables used by the real SQL
    // preflight and atomic save. No provider connection or ready:true stub.
    report.seedFreshSpread=async()=>{
      const captured=new Date(Date.now()-1000).toISOString();
      const signature=(await db.query('select signature from public.gtl_weekly_slates where season=2026 and week=5')).rows[0].signature;
      const payload={provider:'the-odds-api',sport:'americanfootball_nfl',fetchedAt:captured,games:state.games.map((game,index)=>({
        gameId:game.id,home:game.home,away:game.away,kickoff:game.kickoff,providerEventId:`fixture-${index}`,matchStatus:'matched',
        markets:{spread:{quotes:['draftkings','fanduel','betmgm'].map((book,bookIndex)=>{const value=-4+bookIndex*.5;return {
          provider:'the-odds-api',providerEventId:`fixture-${index}`,book,market:'spread',value,timeBasis:'provider_market_last_update',
          collectedAt:captured,providerObservedAt:captured,outcomes:{home:{line:value,odds:-110},away:{line:-value,odds:-110}},
        };})}},
      }))};
      await db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,2026,5,$4)",[id(400),id(1),id(401),signature]);
      await db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,$3,$4)',[id(400),signature,payload,captured]);
    };
    try{await use(report);expect(report.errors).toEqual([]);}finally{await db.close();}
  }
});
async function openSolo(page) {
  await page.goto('/');
  await page.getByLabel('Email',{exact:true}).fill('solo@example.test');
  await page.getByLabel('Password',{exact:true}).fill('test-password');
  await page.locator('form').getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Open Solo'}).click();
  await expect(page.getByRole('heading',{name:'Solo',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Favorites and private notes'})).toBeVisible();
}
async function submitSpread(page, personal) {
  await personal.seedFreshSpread();
  await page.getByRole('button',{name:'Guesses',exact:true}).click();
  for(const game of personal.games)await page.getByLabel(`${game.id} Spread guess`).fill('-3');
  await page.getByRole('button',{name:'Review full ballot'}).click();
  await page.getByRole('button',{name:'Submit Spread guesses'}).click();
  await expect(page.getByRole('status')).toContainText('Spread ballot saved with scoring references');
  expect(personal.oddsCalls).toEqual(['gtl_preflight_submission']);
  const saved=(await personal.db.query('select mode,ballot from public.gtl_weekly_ballots where user_id=$1',[id(1)])).rows;
  expect(saved.map(row=>row.mode)).toEqual(['guess_spread']);
  for(const game of personal.games){const reference=saved[0].ballot.scoringReferences[game.id];expect(reference.status).toBe('available');expect(reference.value).toBe(-3.5);expect(reference.snapshotId).toBe(id(400));expect(reference.quotes.map(quote=>quote.book).sort()).toEqual(['betmgm','draftkings','fanduel']);}
}

test('320px Solo saves private Favorites and notes across reload without a group',async({page,personal})=>{
  await page.setViewportSize({width:320,height:844});await openSolo(page);
  const game=personal.games[0];
  await page.getByRole('button',{name:`Save ${game.id} to Favorites`}).click();
  await expect(page.getByRole('status')).toContainText('Saved to Favorites');
  await page.getByLabel(`Private note for ${game.id}`).fill('My private matchup note <script>not HTML</script>');
  await page.getByRole('button',{name:'Save private note'}).click();
  await expect(page.getByRole('status')).toContainText('Private note saved');
  await page.reload();await expect(page.getByLabel(`Private note for ${game.id}`)).toHaveValue('My private matchup note <script>not HTML</script>');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'.local/personal-solo-320-dark.png',fullPage:true});
  await page.getByLabel('Color theme').selectOption('light');
  await expect(page.locator('.personal-workspace .secondary:not(:disabled)').first()).toHaveCSS('background-color','rgb(233, 238, 245)');
  await page.screenshot({path:'.local/personal-solo-320-light.png',fullPage:true});
  const contrast=await page.locator('.personal-workspace .secondary:not(:disabled)').first().evaluate(element=>{const style=getComputedStyle(element);const luminance=rgb=>rgb.match(/[0-9.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);const a=luminance(style.color),b=luminance(style.backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});expect(contrast).toBeGreaterThanOrEqual(4.5);
  expect((await personal.db.query('select count(*)::int n from public.gtl_memberships')).rows[0].n).toBe(0);
  expect(personal.requests.some(req=>req.route.endsWith('/leagues'))).toBe(false);
});

test('lost save response retries once and keeps its original idempotency key',async({page,personal})=>{
  await openSolo(page);personal.failAfterCommit=true;
  const button=page.getByRole('button',{name:`Save ${personal.games[0].id} to Favorites`});
  await button.click();await expect(page.getByRole('alert')).toContainText('Simulated lost save response');await button.click();
  await expect(page.getByRole('status')).toContainText('Saved to Favorites');
  const writes=personal.requests.filter(req=>req.route.endsWith('/favorite/set'));
  expect(writes).toHaveLength(2);expect(writes[0].body.requestId).toBe(writes[1].body.requestId);
  expect((await personal.db.query('select count(*)::int n from public.gtl_personal_events')).rows[0].n).toBe(1);
});

test('solo ballot reveals only its market and stays editable before deadline and manual journal records exact reported returns',async({page,personal})=>{
  await openSolo(page);
  await page.getByRole('button',{name:'Journal',exact:true}).click();await page.getByRole('button',{name:'Add record'}).click();
  await expect(page.getByText('Submit the matching Spread or Total ballot before recording market selections.')).toBeVisible();
  await submitSpread(page,personal);
  for(const game of personal.games)await expect(page.getByLabel(`${game.id} Spread guess`)).toBeEnabled();
  await page.getByRole('button',{name:'Total',exact:true}).click();await expect(page.getByLabel(`${personal.games[0].id} Total guess`)).toBeEnabled();
  await page.getByRole('button',{name:'Journal',exact:true}).click();await page.getByRole('button',{name:'Add record'}).click();
  await page.getByLabel('Record type').selectOption('user_reported_placed_bet');
  await page.getByLabel('Selected-side spread').fill('-3');await page.getByLabel('American odds').fill('-110');await page.getByLabel('Named quote source').fill('Manual account record');
  await page.getByLabel('Quote observed at (your device time)').fill('2026-10-01T08:00');await page.getByLabel('Reported placed at (your device time)').fill('2026-10-01T08:05');
  await page.getByLabel('Reported outcome').selectOption('win');await page.getByLabel('Stake (optional)').fill('10.10');await page.getByLabel('Actual returned, including stake').fill('19.28');
  await page.getByLabel('Private rationale').fill('Original reason');
  await page.getByRole('button',{name:'Journal',exact:true}).click();
  await expect(page.getByLabel('Private rationale')).toHaveValue('Original reason');
  await expect(page.getByLabel('Stake (optional)')).toHaveValue('10.10');
  await page.getByRole('button',{name:'Save private record'}).click();
  await expect(page.getByRole('status')).toContainText('Private journal record saved');
  await expect(page.getByLabel('Journal performance')).toContainText('Net: 9.18');await expect(page.getByLabel('Journal performance')).toContainText('ROI: 90.9%');
  const row=(await personal.db.query('select entry from public.gtl_journal_entries')).rows[0].entry;expect(row.stakeMinor).toBe(1010);expect(row.returnedMinor).toBe(1928);
  await personal.db.query("update public.gtl_journal_entries set entry=entry||$1::jsonb",[{quotedAt:'2026-10-01T15:00:31.456Z',placedAt:'2026-10-01T15:05:42.789Z'}]);
  await page.reload(); await page.getByRole('button',{name:'Journal',exact:true}).click();
  await page.getByRole('button',{name:'Correct record'}).click();await page.getByLabel('Reported outcome').selectOption('push');await page.getByLabel('Actual returned, including stake').fill('10.10');await page.getByLabel('Reason for correction').fill('Corrected the reported result');await page.getByRole('button',{name:'Save correction'}).click();
  await expect(page.getByRole('status')).toContainText('Correction saved');
  const precise=(await personal.db.query('select entry from public.gtl_journal_entries')).rows[0].entry;expect(Date.parse(precise.quotedAt)).toBe(Date.parse('2026-10-01T15:00:31.456Z'));expect(Date.parse(precise.placedAt)).toBe(Date.parse('2026-10-01T15:05:42.789Z'));await expect(page.getByLabel('Journal performance')).toContainText('Net: 0.00');
  await page.getByRole('button',{name:'View history'}).click();await expect(page.getByLabel('Record history')).toContainText('win → push');
  await page.getByRole('button',{name:'Archive record'}).click();await expect(page.getByLabel('Journal performance')).toContainText('0 active placed-bet records');
  await page.getByLabel('Include archived records').check();await page.getByRole('button',{name:'Restore record'}).click();await expect(page.getByLabel('Journal performance')).toContainText('1 active placed-bet records');
});

test('private forecast saves before submission without changing a competition ballot',async({page,personal})=>{
  await openSolo(page);const game=personal.games[0];
  await page.locator('.personal-favorite').first().getByText('Your outcome forecast',{exact:true}).click();
  await page.getByLabel(`New forecast for ${game.id}`).fill('-7.5');await page.locator('.personal-favorite').first().getByRole('button',{name:'Save personal forecast'}).click();
  await expect(page.getByRole('status')).toContainText('Personal forecast saved');
  expect((await personal.db.query('select count(*)::int n from public.gtl_weekly_ballots')).rows[0].n).toBe(0);
  expect((await personal.db.query('select value from public.gtl_personal_forecasts')).rows[0].value).toBe('-7.5');
});

test('unsaved Solo guesses stay on screen when navigation discard is declined',async({page,personal})=>{
  await openSolo(page);await page.getByRole('button',{name:'Guesses',exact:true}).click();
  await page.getByLabel(`${personal.games[0].id} Spread guess`).fill('-4');
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Favorites',exact:true}).click();
  await expect(page.getByLabel(`${personal.games[0].id} Spread guess`)).toHaveValue('-4');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Favorites',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Favorites and private notes'})).toBeVisible();
  expect((await personal.db.query('select count(*)::int n from public.gtl_weekly_ballots')).rows[0].n).toBe(0);
});

// Stage 27a (M-29, D-40): "Save to Favorites" keeps a note already stored for the game. M-29 is not on the hosted
// project yet, so this block runs the old app on every migration (ALL).
test.describe('D-40 on the schema with M-29', () => {
  test.use({ schema: ALL });
  test('390px: Save to Favorites brings back the note of a game removed and saved again, and of a game never saved', async ({ page, personal }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await openSolo(page);
    const [first, second] = personal.games, status = page.getByRole('status');
    await page.getByRole('button', { name: `Save ${first.id} to Favorites` }).click();
    await expect(status).toContainText('Saved to Favorites');
    await page.getByLabel(`Private note for ${first.id}`).fill('Kept through a remove');
    await page.getByRole('button', { name: 'Save private note' }).click();
    await expect(status).toContainText('Private note saved');
    await page.getByRole('button', { name: `Remove ${first.id} from Favorites` }).click();
    await expect(status).toContainText('Removed from Favorites');
    await expect(page.getByLabel(`Private note for ${first.id}`)).toHaveCount(0);
    await page.getByRole('button', { name: `Save ${first.id} to Favorites` }).click();
    await expect(status).toContainText('Saved to Favorites');
    await expect(page.getByLabel(`Private note for ${first.id}`)).toHaveValue('Kept through a remove');
    // A note stored on a game the player never saved: the row the new app's game sheet leaves under D-40.
    const note = 'From the game sheet\nsecond line';
    await personal.db.query('insert into public.gtl_favorites(user_id,season,week,game_id,saved,notes) values($1,2026,5,$2,false,$3)', [id(1), second.id, note]);
    await page.reload();
    await expect(page.getByRole('button', { name: `Save ${second.id} to Favorites` })).toBeVisible();
    await expect(page.getByLabel(`Private note for ${second.id}`)).toHaveCount(0);
    await page.getByRole('button', { name: `Save ${second.id} to Favorites` }).click();
    await expect(status).toContainText('Saved to Favorites');
    await expect(page.getByLabel(`Private note for ${second.id}`)).toHaveValue(note);
    await page.reload();
    await expect(page.getByLabel(`Private note for ${first.id}`)).toHaveValue('Kept through a remove');
    await expect(page.getByLabel(`Private note for ${second.id}`)).toHaveValue(note);
    // The app still sends an empty note; the server keeps the stored one, and the audit has before and after (D-23).
    const saves = personal.requests.filter(req => req.route.endsWith('/favorite/set'));
    expect(saves.map(req => [req.body.gameId, req.body.saved, req.body.notes])).toEqual([
      [first.id, true, ''], [first.id, true, 'Kept through a remove'], [first.id, false, 'Kept through a remove'], [first.id, true, ''], [second.id, true, ''],
    ]);
    const events = (await personal.db.query('select target,before_value,after_value from public.gtl_personal_events order by revision')).rows;
    expect(events.at(-2)).toEqual({ target: `2026/5/${first.id}`, before_value: { saved: false, notes: 'Kept through a remove' }, after_value: { saved: true, notes: 'Kept through a remove' } });
    expect(events.at(-1)).toEqual({ target: `2026/5/${second.id}`, before_value: { saved: false, notes: note }, after_value: { saved: true, notes: note } });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

// Redesign stage 15 (D-37 as amended by D-39): Solo's weekly guesses once the server's live rules make sent picks final (M-02). The
// review says so before the submit; afterwards the submitted market reads "Submitted · final" with read-only fields and nothing to
// review, the other market stays a draft, and when the rules read falls back (a rollback) the same guesses are editable again.
test('solo submitted guesses are final once the live rules say so, and editable again when the rules fall back',async({page,personal})=>{
  personal.rules={sentFinal:true,lateWindow:'deadline',revealAt:'kickoff'};
  await openSolo(page);
  await personal.seedFreshSpread();
  await page.getByRole('button',{name:'Guesses',exact:true}).click();
  for(const game of personal.games)await page.getByLabel(`${game.id} Spread guess`).fill('-3');
  await page.getByRole('button',{name:'Review full ballot'}).click();
  const review=page.getByRole('region',{name:'Review full ballot'});
  await expect(review).toContainText("Submitted picks are final: once you submit, you can't change them.");
  await expect(review).not.toContainText('You may edit until the deadline');
  await page.getByRole('button',{name:'Submit Spread guesses'}).click();
  await expect(page.getByRole('status')).toContainText('Spread ballot saved with scoring references');
  const form=page.locator('.personal-form').filter({has:page.getByRole('heading',{name:'Guess the Spread'})});
  await expect(form).toContainText(/Submitted · final · \w{3} \d{1,2}, \d{1,2}:\d{2} [AP]M PT/);
  await expect(form).not.toContainText('editable');
  for(const game of personal.games){await expect(page.getByLabel(`${game.id} Spread guess`)).toBeDisabled();await expect(page.getByLabel(`${game.id} Spread guess`)).toHaveValue('-3');}
  await expect(page.getByRole('button',{name:'Review full ballot'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Save draft'})).toHaveCount(0);
  const writes=personal.requests.filter(req=>req.route.endsWith('/personal/ballot')).length;
  // The other market is a draft: its fields work and it saves as a draft.
  await page.getByRole('button',{name:'Total',exact:true}).click();
  await expect(page.getByLabel(`${personal.games[0].id} Total guess`)).toBeEnabled();
  await page.getByLabel(`${personal.games[0].id} Total guess`).fill('44.5');
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect(page.getByRole('status')).toContainText('Draft saved to your account');
  expect(personal.requests.filter(req=>req.route.endsWith('/personal/ballot')).length).toBe(writes+1);
  // The rules read falls back to today's rules (M-02 rolled back): Refresh shows the submitted Spread editable until the deadline.
  personal.rules=null;
  await page.getByRole('button',{name:'Refresh saved data'}).click();
  await page.getByRole('button',{name:'Spread',exact:true}).click();
  await expect(page.locator('.personal-form')).toContainText('Submitted · editable until deadline');
  for(const game of personal.games)await expect(page.getByLabel(`${game.id} Spread guess`)).toBeEnabled();
  await expect(page.getByRole('button',{name:'Review full ballot'})).toBeVisible();
});

// Redesign stage 18 (M-02): the day M-02 is applied while Solo still holds the rules from before it. The submitted Spread shows
// editable (D-16); M-02 is applied and the live rules switch; the changed guess is refused with GTL_BALLOT_LOCKED. Solo says
// "Sent picks are final." and reloads the saved ballot, final and read-only, instead of a generic failure.
test.describe('stage 18 on the schema with M-02 applied mid-session', () => {
  // Begin before both immutable-writer migrations, then apply M-02 alone below. M-07 would already make
  // sent guesses final before the transition this historical Solo test is meant to exercise.
  test.use({ schema: ALL.filter(file => file !== '20261015030000_gtl_sent_picks_final.sql' && file !== '20261015190710_gtl_guess_write_window.sql') });
  test('a Solo edit refused once M-02 is applied shows the final ballot with "Sent picks are final."',async({page,personal})=>{
    await openSolo(page);
    await submitSpread(page, personal);
    const form=page.locator('.personal-form').filter({has:page.getByRole('heading',{name:'Guess the Spread'})});
    await expect(form).toContainText('Submitted · editable until deadline');
    const sent=(await personal.db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'",[id(1)])).rows[0].ballot;
    // Sean's "apply M-02": the database rule changes, and gtl_live_rules now says sent picks are final.
    await personal.db.exec(migrationSql('20261015030000_gtl_sent_picks_final.sql'));
    personal.rules={sentFinal:true,lateWindow:'deadline',revealAt:'kickoff'};
    const first=personal.games[0].id;
    await page.getByLabel(`${first} Spread guess`).fill('-4');
    await page.getByRole('button',{name:'Review full ballot'}).click();
    await page.getByRole('button',{name:'Save changed Spread guesses'}).click();
    await expect(page.getByRole('status').filter({hasText:'Sent picks are final. Your saved guesses are shown.'})).toBeVisible();
    await expect(form).toContainText(/Submitted · final · \w{3} \d{1,2}, \d{1,2}:\d{2} [AP]M PT/);
    for(const game of personal.games){await expect(page.getByLabel(`${game.id} Spread guess`)).toBeDisabled();await expect(page.getByLabel(`${game.id} Spread guess`)).toHaveValue('-3');}
    await expect(page.getByRole('button',{name:'Review full ballot'})).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await personal.db.query("select ballot from public.gtl_weekly_ballots where user_id=$1 and mode='guess_spread'",[id(1)])).rows[0].ballot).toEqual(sent);
  });
});

// D-60: this spec covers the old app, which now opens only at ?app=classic (Menu › "Older records and tools").
test.beforeEach(({ page }) => useOldApp(page));
