import { createCloudHandler } from '../../cloud/handler.mjs';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { HOSTED } from '../migrations.mjs';
import { ACCOUNTS, SUPABASE, communityWorld, pgliteAvailable, signIn } from './community-world.mjs';
import { INFO, GUIDANCE_ORDER } from '../../web/src/next/info.js';
import { assertCaptureTheme, setCaptureTheme } from './theme-capture.mjs';
import { layoutProblems } from '../helpers/phone-layout.mjs';

test.use({ viewport: { width: 390, height: 844 } });
test.setTimeout(180000);
test.beforeEach(() => test.skip(!pgliteAvailable, 'Local PGlite required; never contacts hosted data.'));
const sheet = (page,name) => page.getByRole('dialog',{name,exact:true});
async function menu(page) {
  await page.getByRole('button',{name:'Your menu',exact:true}).click();
  await expect(sheet(page,'Menu')).toBeVisible();
}
async function checkedLayout(page) {
  const problems=await page.evaluate(layoutProblems);
  // The existing shell deliberately ellipsizes the private-league title. Check the
  // actual clip and screen bounds before excluding only its text-range overhang.
  const intentional=await page.locator('.gx-league-name.gx-truncate').evaluateAll(nodes=>nodes.filter(el=>{
    const style=getComputedStyle(el),box=el.getBoundingClientRect();return style.textOverflow==='ellipsis'&&style.overflowX==='hidden'&&box.width>0&&box.left>=0&&box.right<=innerWidth;
  }).map(el=>`span "${el.textContent.trim().replace(/\s+/g,' ').slice(0,50)}"`));
  return problems.filter(message=>!intentional.some(name=>[`${name}: text leaves its box`,`${name}: text leaves the screen`,`${name}: text clipped`].includes(message)));
}
async function primaryType(page) {
  const primary = page.locator('.gx-account-menu .gx-link-row:visible,.gx-switcher-prism .gx-row-title:visible,.gx-account-prism .gx-switch-row .gx-row-title:visible,.gx-account-hero p:visible,.gx-account-note:visible,.gx-account-note strong:visible,.gx-app-invite-payload > p:not(.gx-account-eyebrow):visible,.gx-guidance-body p:visible,.gx-guidance-body a:visible,.gx-account-prism .gx-t-body:visible');
  for (const text of await primary.all()) await expect(text).toHaveCSS('font-size','16px');
}
async function forcedControls(page) {
  const problems = await page.locator('.gx-account-prism .gx-switch:visible,.gx-account-prism .gx-seg-btn--on:visible').evaluateAll(nodes => {
    const probe = document.createElement('span'); probe.style.forcedColorAdjust = 'none'; document.body.append(probe);
    const system = name => { probe.style.color = name; return getComputedStyle(probe).color; };
    const canvas = system('Canvas'), ink = system('CanvasText'), highlight = system('Highlight'), selectedInk = system('HighlightText');
    const failures = nodes.flatMap(el => {
      const style = getComputedStyle(el), segment = el.classList.contains('gx-seg-btn--on'), checked = segment || el.previousElementSibling.checked;
      const errors = [];
      if (style.backgroundColor !== (checked ? highlight : canvas)) errors.push('track/selection background');
      if (style.borderColor !== ink) errors.push('visible system border');
      if (segment && style.color !== selectedInk) errors.push('selected text');
      if (!segment) {
        const thumb = getComputedStyle(el,'::before');
        if (thumb.backgroundColor !== (checked ? selectedInk : ink)) errors.push('visible system thumb');
      }
      return errors.map(error => `${el.className}: ${error}`);
    });
    probe.remove(); return failures;
  });
  expect(problems).toEqual([]);
}
async function inspect(page, name, testInfo) {
  const layer = await page.locator('dialog[open]').count() ? page.locator('dialog[open]').last() : page.locator('.gx-sheet:visible').last();
  const scope = await layer.count() ? layer : page.locator('main').last();
  for (const theme of ['dark','light']) {
    await setCaptureTheme(page,theme);
    const system = name === 'appearance-system-reduced';
    if (system) await scope.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'System',exact:true}).click();
    await assertCaptureTheme(page,theme,{preference:system?'system':theme});
    const selector=page.getByRole('combobox',{name:'Color theme',exact:true});
    if(await selector.count()) await expect(selector).toHaveValue(theme);
    if(await scope.locator('.gx-appearance-mini').count()) {
      await expect(scope.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:system?'System':theme==='light'?'Light':'Dark',exact:true})).toHaveAttribute('aria-pressed','true');
      await expect(scope.locator('.gx-appearance-mini')).toHaveAttribute('data-theme',theme);
      await expect(scope.locator('.gx-appearance-mini header > span:last-child')).toHaveText(theme==='light'?'Porcelain':'Dark');
      await expect(scope.getByRole('status')).toHaveText(system?`System → ${theme==='light'?'Light':'Dark'}`:`${theme==='light'?'Light':'Dark'} selected`);
    }
    for(const list of await page.locator('.gx-account-menu:visible .gx-list,.gx-switcher-prism:visible .gx-list').all()) await expect(list).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    for(const [selector,token] of [['.auth-oauth .auth-google','--gx-text-1'],['.auth-card > .empty-icon','--gx-accent-ink']]) {
      const target=page.locator(selector);
      if(await target.count()) expect(await target.evaluate((el,token)=>{const probe=document.createElement('span');probe.style.color=`var(${token})`;el.append(probe);const result=getComputedStyle(el).color===getComputedStyle(probe).color;probe.remove();return result;},token),`${name} ${selector} uses ${token}`).toBe(true);
    }
    const authCard=page.locator('.gx-access-prism .auth-card');
    if(await authCard.count()) {
      await expect(authCard.locator('h1')).toHaveCSS('margin-bottom','0px');
      for(const button of await authCard.locator('button:visible').all()) await expect(button).toHaveCSS('font-size','16px');
      await expect(authCard.locator('.empty-icon')).toHaveCSS('margin-bottom','0px');
      for(const primary of await authCard.locator('.auth-form .primary').all()) await expect(primary).toHaveCSS('min-height','52px');
      await expect(authCard.locator('.theme-selector')).toHaveCSS('border-top-width','1px');
    }
    const google=page.locator('.auth-oauth .auth-google');
    if(await google.count()) expect(await google.evaluate(el=>{const probe=document.createElement('span');probe.style.background='var(--gx-card-face)';el.append(probe);const actual=getComputedStyle(el),expected=getComputedStyle(probe);const result=actual.backgroundImage===expected.backgroundImage&&actual.backgroundColor===expected.backgroundColor;probe.remove();return result;}),'Google uses selected glass').toBe(true);
    for (const brand of await page.locator('.gx-access-brand:visible').all()) expect(await brand.locator('img:visible').count(),`${name} ${theme} shows exactly one G`).toBe(1);
    for (const width of [390,320,...(['account','profile-draft','settings','guidance','appearance','export','league-switcher','league-create','league-invite','app-invite','access-sign-in','access-reset','name-step','session-expired','startup','league-access-pending'].includes(name)?[768,1440]:[])]) {
      await page.setViewportSize({width,height:844});
      await primaryType(page);
      for (const position of ['start','middle','end']) {
        await scope.evaluate((el,position) => { const scroller = el.querySelector('.gx-sheet-body') || (el.matches('dialog') ? el : document.scrollingElement); scroller.scrollTop = position === 'start' ? 0 : position === 'middle' ? scroller.scrollHeight / 2 : scroller.scrollHeight; },position);
        expect(await checkedLayout(page),`${name} ${theme} ${width} ${position}`).toEqual([]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      const badTargets = await scope.evaluate(root => [...root.querySelectorAll('button,a[href],input,select,textarea,summary')].filter(el => el.getClientRects().length && !el.closest('[hidden],[inert],dialog:not([open])')).map(el => ({name:el.getAttribute('aria-label')||el.textContent,rect:el.getBoundingClientRect()})).filter(({rect})=>rect.width<43.5||rect.height<43.5).map(({name})=>name));
      expect(badTargets,`${name} target sizes`).toEqual([]);
      await assertCaptureTheme(page,theme,{preference:system?'system':theme});
      await page.screenshot({path:testInfo.outputPath(`${name}-${theme}-${width}-bottom.png`)});
    }
    expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
    await page.setViewportSize({width:390,height:1800});
    await scope.evaluate(el => { const body=el.querySelector('.gx-sheet-body');if(body)body.scrollTop=0;else scrollTo(0,0); });
    await assertCaptureTheme(page,theme,{preference:system?'system':theme});
    await page.screenshot({path:testInfo.outputPath(`${name}-${theme}-390-full.png`),fullPage:true});
  }
  await page.setViewportSize({width:320,height:844});
  await page.emulateMedia({forcedColors:'active'});
  await assertCaptureTheme(page,'light',{preference:name==='appearance-system-reduced'?'system':'light'});
  await forcedControls(page);
  expect(await checkedLayout(page),`${name} forced colors`).toEqual([]);
  await page.screenshot({path:testInfo.outputPath(`${name}-forced-320.png`)});
  await page.emulateMedia({forcedColors:'none'});
  await page.setViewportSize({width:390,height:844});
}

test('Account native primary labels and prose keep 16px on narrow phones',async ({page,baseURL})=>{
  const world=await communityWorld(page,baseURL,{migrations:HOSTED});
  try {
    await signIn(page,'luke');await menu(page);
    for(const width of [320,390]) {
      await page.setViewportSize({width,height:844});await primaryType(page);
      for(const name of ['Appearance','Export my data','Invite friends','Settings · sportsbooks and guidance']) {
        await sheet(page,'Menu').getByRole('button',{name,exact:true}).click();await primaryType(page);
        await page.getByRole('button',{name:'Menu',exact:true}).click();
      }
    }
    expect(world.errors).toEqual([]);
  } finally {await world.db.close();}
});

test('Account forced colors keep off/on thumbs and selected themes in the system palette',async ({page,baseURL})=>{
  const world=await communityWorld(page,baseURL,{migrations:HOSTED});
  try {
    await signIn(page,'luke');await menu(page);await sheet(page,'Menu').getByRole('button',{name:'Appearance',exact:true}).click();
    await page.setViewportSize({width:320,height:844});await page.emulateMedia({forcedColors:'active'});
    const appearance=sheet(page,'Appearance'),motion=appearance.getByRole('switch',{name:'Reduce motion',exact:true});
    await expect(motion).not.toBeChecked();await forcedControls(page);
    await motion.check();await expect(motion).toBeChecked();await forcedControls(page);
    await motion.uncheck();await expect(motion).not.toBeChecked();await forcedControls(page);
    for(const name of ['Light','Dark','System']) {
      await appearance.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name,exact:true}).click();await forcedControls(page);
    }
    expect(world.errors).toEqual([]);
  } finally {await world.db.close();}
});

test('native Account cards, guidance, preferences, theme, export and public sharing retain their real destinations',async ({page,baseURL},testInfo)=>{
  const world=await communityWorld(page,baseURL,{migrations:HOSTED});
  try {
    await signIn(page,'luke');await menu(page);await inspect(page,'account',testInfo);
    await sheet(page,'Menu').getByRole('button',{name:'Invite friends',exact:true}).click();
    const invite=sheet(page,'Invite friends');await expect(invite).toBeVisible();
    expect(await invite.getByRole('status',{includeHidden:true}).evaluate(el=>getComputedStyle(el).display)).not.toBe('none');
    await inspect(page,'app-invite',testInfo);
    await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async payload=>{window.sharedPayload=payload;}});});
    await invite.getByRole('button',{name:'Share app invite',exact:true}).click();
    expect(await page.evaluate(()=>window.sharedPayload)).toEqual({title:'Guess the Line',text:'Join me on Guess the Line. Guess National Football League spreads and totals, explore research, and compete with the Community.',url:'https://guess-the-line.pages.dev/'});
    await expect(invite.getByRole('status')).toHaveText('Device sharing closed.');
    await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('blocked');}}});});
    await invite.getByRole('button',{name:'Copy link',exact:true}).click();
    const publicLink=invite.getByLabel('Public app link');await expect(publicLink).toBeFocused();await expect(publicLink).toHaveValue('https://guess-the-line.pages.dev/');
    expect(await publicLink.evaluate(el=>el.selectionEnd-el.selectionStart)).toBe('https://guess-the-line.pages.dev/'.length);
    await inspect(page,'app-invite-fallback',testInfo);
    await invite.getByRole('button',{name:'Menu',exact:true}).click();
    await sheet(page,'Menu').getByRole('button',{name:'Profile',exact:true}).click();
    await sheet(page,'Profile').getByLabel('Display name').fill('A long retained display name for a narrow phone profile');
    await inspect(page,'profile-draft',testInfo);
    await world.db.query('update public.gtl_profiles set display_name=$1 where user_id=$2',['Name changed on another device',ACCOUNTS.luke.id]);
    await sheet(page,'Profile').getByRole('button',{name:'Save name',exact:true}).click();await expect(sheet(page,'Profile').getByRole('alert')).toContainText('Your saved name changed');await inspect(page,'profile-conflict',testInfo);
    await page.route(`${SUPABASE}/functions/v1/gtl-api/profile`,async route=>{const req=route.request(),response=await world.handler(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()}));expect(response.status).toBe(200);await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{lost reply'});},{times:1});
    await sheet(page,'Profile').getByRole('button',{name:'Save name',exact:true}).click();await expect(sheet(page,'Profile').getByRole('button',{name:'Check if it saved',exact:true})).toBeVisible();await inspect(page,'profile-pending',testInfo);
    page.once('dialog',d=>d.accept());await sheet(page,'Profile').getByRole('button',{name:'Menu',exact:true}).click();
    await sheet(page,'Menu').getByRole('button',{name:'Settings · sportsbooks and guidance',exact:true}).click();
    await expect(sheet(page,'Settings').getByRole('heading',{name:'Your sportsbooks'})).toBeVisible();await inspect(page,'settings',testInfo);
    await sheet(page,'Settings').getByRole('button',{name:'Menu',exact:true}).click();
    await sheet(page,'Menu').getByRole('button',{name:'Guidance and sources',exact:true}).click();
    const guidance=sheet(page,'Guidance and sources');expect(await guidance.locator('details').count()).toBe(GUIDANCE_ORDER.length);
    for (const key of GUIDANCE_ORDER) {
      const topic=guidance.locator(`[data-guidance="${key}"]`);
      await expect(topic.locator('summary small')).toHaveCount(INFO[key].links?.length?1:0);
      if(INFO[key].links?.length) await expect(topic.locator('summary small')).toHaveText('Sources included');
      await topic.locator('summary').click();
      expect(await topic.locator('.gx-guidance-body p').allTextContents()).toEqual(INFO[key].body);
      expect(await topic.locator('.gx-guidance-body a').evaluateAll(links=>links.map(a=>({text:a.textContent,url:a.href})))).toEqual(INFO[key].links||[]);
      await topic.locator('summary').click();
    }
    await inspect(page,'guidance',testInfo);
    await guidance.locator('details').last().locator('summary').click();await inspect(page,'guidance-expanded',testInfo);
    await guidance.getByRole('button',{name:'Menu',exact:true}).click();
    await sheet(page,'Menu').getByRole('button',{name:'Appearance',exact:true}).click();
    await inspect(page,'appearance',testInfo);
    const appearance=sheet(page,'Appearance');await appearance.getByRole('group',{name:'Theme',exact:true}).getByRole('button',{name:'System',exact:true}).click();
    await page.emulateMedia({colorScheme:'light',reducedMotion:'reduce'});
    await expect(appearance.locator('[data-effective-motion]')).toHaveAttribute('data-effective-motion','reduced');
    await expect(appearance.getByRole('switch',{name:'Reduce motion',exact:true})).not.toBeChecked();
    await expect(appearance.locator('.gx-appearance-mini')).toHaveAttribute('data-theme','light');
    await inspect(page,'appearance-system-reduced',testInfo);
    await appearance.getByRole('button',{name:'Menu',exact:true}).click();
    await sheet(page,'Menu').getByRole('button',{name:'Export my data',exact:true}).click();
    await expect(sheet(page,'Export my data').getByText('Your records. One file.')).toBeVisible();await inspect(page,'export',testInfo);
    const exportSheet=sheet(page,'Export my data');
    await page.route(`${SUPABASE}/functions/v1/gtl-api/me/export`,route=>route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({error:'Export unavailable.'})}),{times:1});
    await exportSheet.getByRole('button',{name:'Download my data',exact:true}).click();await expect(exportSheet.getByRole('status')).toHaveText('Export is not available yet. Every record is kept.');await inspect(page,'export-unavailable',testInfo);
    let releaseExport;const exportGate=new Promise(resolve=>{releaseExport=resolve;});
    await page.route(`${SUPABASE}/functions/v1/gtl-api/me/export`,async route=>{await exportGate;await route.fallback();},{times:1});
    await exportSheet.getByRole('button',{name:'Download my data',exact:true}).click();await expect(exportSheet.getByRole('button',{name:'Preparing your file…',exact:true})).toHaveAttribute('aria-disabled','true');
    await inspect(page,'export-preparing',testInfo);
    const download=page.waitForEvent('download');releaseExport();await download;await expect(exportSheet.getByRole('status')).toContainText('Downloaded guess-the-line-export-');await inspect(page,'export-completion',testInfo);
    expect(world.errors).toEqual([]);
  } finally {await world.db.close();}
});

test('native league switch/create/invite layouts use actual memberships and retain long labels',async ({page,baseURL},testInfo)=>{
 const world=await communityWorld(page,baseURL,{migrations:HOSTED});
 try {
  await world.api('sean','leagues',{name:'A long private league name for friends on narrow phones',format:'group',practice:false,requestId:randomUUID()});
  await signIn(page,'sean');await page.getByRole('navigation',{name:'Main'}).getByRole('button',{name:/^Play(,|$)/}).click();await page.getByRole('button',{name:/^League: .*\. Switch league$/}).click();
  await inspect(page,'league-switcher',testInfo);
  await sheet(page,'Your leagues').getByRole('button',{name:'Create a league',exact:true}).click();
  await sheet(page,'Create a league').getByLabel('League name').fill('Friends on Sunday');await inspect(page,'league-create',testInfo);
  page.once('dialog',d=>d.accept());await sheet(page,'Create a league').getByRole('button',{name:'Your leagues',exact:true}).click();
  await sheet(page,'Your leagues').getByRole('button',{name:'Invite to A long private league name for friends on narrow phones',exact:true}).click();
  await expect(page.getByText('No invitations created yet.',{exact:true})).toBeVisible();await inspect(page,'league-invite',testInfo);
  expect(world.errors).toEqual([]);
 } finally {await world.db.close();}
});

test('signed-out access and first-name recovery preserve native form constraints',async ({page,baseURL},testInfo)=>{
 const world=await communityWorld(page,baseURL,{migrations:HOSTED});
 try {
  await page.goto('/');await expect(page.getByRole('heading',{name:'Your games. Any device.'})).toBeVisible();await inspect(page,'access-sign-in',testInfo);
  await page.getByRole('button',{name:'Create account',exact:true}).first().click();await inspect(page,'access-create',testInfo);
  await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('minlength','8');
  await page.getByRole('button',{name:'Forgot password?',exact:true}).click();await inspect(page,'access-forgot',testInfo);
  await page.getByRole('button',{name:'Back to sign in',exact:true}).click();
  await world.db.query('delete from public.gtl_profiles where user_id=$1',[ACCOUNTS.luke.id]);
  await signIn(page,'luke',{navigate:false});await expect(page.getByRole('heading',{name:'First, what should we call you?'})).toBeVisible();
  await page.getByLabel('Your name',{exact:true}).fill('A retained first name on a narrow phone');
  await inspect(page,'name-step',testInfo);
  await page.route(`${SUPABASE}/functions/v1/gtl-api/profile`,route=>route.fulfill({status:200,contentType:'application/json',body:'{lost',headers:{'access-control-allow-origin':'*'}}));
  await page.getByRole('button',{name:'Continue',exact:true}).click();await expect(page.getByRole('button',{name:'Check if it saved',exact:true})).toBeVisible();await inspect(page,'name-uncertain',testInfo);
  expect(world.errors).toEqual([]);
 } finally {await world.db.close();}
});

test('native reminder switch asks permission only on tap and turning off retains granted permission',async ({page,baseURL},testInfo)=>{
 await page.addInitScript(()=>{
  let registered=false,subscribed=false;
  window.reminderDeviceEvents=[];window.reminderPermission=localStorage.getItem('test.reminderPermission')||'default';
  Object.defineProperty(window,'Notification',{configurable:true,value:{get permission(){return window.reminderPermission||'default';},async requestPermission(){window.reminderDeviceEvents.push('permission');window.reminderPermission='granted';return 'granted';}}});
  Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
  const subscription={endpoint:'https://fcm.googleapis.com/fcm/send/account-layout-device',toJSON(){return {endpoint:this.endpoint,keys:{p256dh:'B'+'L'.repeat(86),auth:'K'.repeat(22)}};},async unsubscribe(){window.reminderDeviceEvents.push('unsubscribe');subscribed=false;return true;}};
  const registration={pushManager:{async getSubscription(){return subscribed?subscription:null;},async subscribe(){window.reminderDeviceEvents.push('subscribe');subscribed=true;return subscription;}},async unregister(){registered=false;return true;}};
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{async getRegistration(){return registered?registration:null;},async register(){window.reminderDeviceEvents.push('register');registered=true;return registration;}}});
 });
 const world=await communityWorld(page,baseURL,{migrations:HOSTED,pushPublicKey:'B'+'A'.repeat(86)});
 // The shared world intentionally has no push writer. This test routes only push calls
 // through the real handler and its real local SQL RPCs, with a fake device at the edge.
 const pushHandler=createCloudHandler({authenticate:async token=>world.users.has(token) ? {...world.users.get(token),emailConfirmed:true} : null,pushPublicKey:'B'+'A'.repeat(86),push:{rpc:async(fn,args)=>{
   const entries=Object.entries(args);const result=await world.db.query(`select public.${fn}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(',')}) as value`,entries.map(([,value])=>value));return result.rows[0].value;
 }}});
 await page.route(`${SUPABASE}/functions/v1/gtl-api/push/**`,async route=>{
   const req=route.request(),response=await pushHandler(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()}));
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
 });
 try {
  await signIn(page,'luke');await menu(page);await sheet(page,'Menu').getByRole('button',{name:'Pick reminders',exact:true}).click();
  const reminders=sheet(page,'Pick reminders'),toggle=reminders.getByRole('switch',{name:'Pick reminders',exact:true});
  await expect(toggle).toBeEnabled();expect(await page.evaluate(()=>window.reminderDeviceEvents)).toEqual([]);
  await inspect(page,'reminders-off',testInfo);
  await toggle.check();await expect(reminders.getByRole('status')).toHaveText('Reminders are on for this device.');await expect(toggle).toBeChecked();
  await inspect(page,'reminders-on',testInfo);
  await toggle.uncheck();await expect(reminders.getByRole('status')).toHaveText('Reminders are off for this device.');
  expect(await page.evaluate(()=>window.Notification.permission)).toBe('granted');
  expect(await page.evaluate(()=>window.reminderDeviceEvents)).toEqual(['permission','register','subscribe','unsubscribe']);
  await reminders.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(()=>localStorage.setItem('test.reminderPermission','denied'));await page.reload();await menu(page);await sheet(page,'Menu').getByRole('button',{name:'Pick reminders',exact:true}).click();
  await expect(toggle).toBeDisabled();await inspect(page,'reminders-blocked',testInfo);
  expect(world.errors).toEqual([]);
 } finally {await world.db.close();}
});

test('native continuity and league access covers retain retry, private leagues and session recovery',async ({page,context,baseURL},testInfo)=>{
 const world=await communityWorld(page,baseURL,{migrations:HOSTED,groupScreens:true});
 let release;const gate=new Promise(resolve=>{release=resolve;});let mode='wait';
 await page.route(`${SUPABASE}/functions/v1/gtl-api/lobby`,async route=>{if(mode==='wait')await gate;if(mode==='down')return route.fulfill({status:503,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({error:'Service unavailable.'})});return route.fallback();});
 try {
  await signIn(page,'luke');await expect(page.getByText('Getting your game ready.',{exact:true})).toBeVisible();await inspect(page,'startup',testInfo);
  mode='down';release();await expect(page.getByRole('heading',{name:'Your account didn’t load',exact:true})).toBeVisible();await inspect(page,'account-failed',testInfo);
  mode='ready';await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('button',{name:'Your menu',exact:true})).toBeVisible();
  await context.setOffline(true);await expect(page.locator('.gx-offline')).toBeVisible();await inspect(page,'offline-content',testInfo);await context.setOffline(false);await expect(page.locator('.gx-offline')).toHaveCount(0);
  const other=await world.api('troy','leagues',{name:'A private league with a long name requiring an invitation',format:'group',practice:false,requestId:randomUUID()});expect(other.status).toBe(200);
  await page.evaluate(([id,league])=>localStorage.setItem(`gtl.next.league.v1.${id}`,JSON.stringify({id:league,name:'A private league with a long name requiring an invitation'})),[ACCOUNTS.luke.id,other.body.leagueId]);await page.reload();
  await expect(page.getByRole('heading',{name:'Your spot is pending',exact:true})).toBeVisible();await inspect(page,'league-access-pending',testInfo);
  await page.getByRole('button',{name:'Switch to Community',exact:true}).click();
  await world.api('sean','community/member',{userId:ACCOUNTS.luke.id,member:false});await page.reload();await expect(page.getByRole('heading',{name:'Not in the Community',exact:true})).toBeVisible();await inspect(page,'league-access-removed',testInfo);
  await menu(page);await sheet(page,'Menu').getByRole('button',{name:'Profile',exact:true}).click();await sheet(page,'Profile').getByLabel('Display name',{exact:true}).fill('Retained after sign-in expires');
  const token=world.sessions[ACCOUNTS.luke.email].access_token,user=world.users.get(token);world.users.delete(token);
  await sheet(page,'Profile').getByRole('button',{name:'Save name',exact:true}).click();await expect(page.getByRole('alertdialog',{name:'Sign in again',exact:true})).toBeVisible();await inspect(page,'session-expired',testInfo);
  world.users.set(token,user);await page.getByRole('alertdialog',{name:'Sign in again',exact:true}).getByRole('button',{name:'Not now',exact:true}).click();await expect(sheet(page,'Profile').getByLabel('Display name')).toHaveValue('Retained after sign-in expires');
  expect(world.errors).toEqual([]);
 } finally {release();await context.setOffline(false);await world.db.close();}
});

test('native sportsbook cards retain unavailable choices, show selected counts and require review after a concurrent edit',async ({page,baseURL},testInfo)=>{
 const world=await communityWorld(page,baseURL,{migrations:HOSTED});
 try {
  const signature=(await world.db.query('select signature from public.gtl_weekly_slates where season=2026 and week=5')).rows[0].signature;
  const snapshot=randomUUID();
  await world.db.query("insert into public.gtl_odds_collections(id,actor_id,operation,status,lease_token,started_at,expires_at,reserved_credits,season,week,slate_signature) values($1,$2,'collect','succeeded',$3,now(),now()+interval '90 seconds',2,2026,5,$4)",[snapshot,ACCOUNTS.sean.id,randomUUID(),signature]);
  await world.db.query('insert into public.gtl_market_snapshots(id,season,week,slate_signature,payload,created_at) values($1,2026,5,$2,$3,now())',[snapshot,signature,{games:[{markets:{spread:{quotes:['draftkings','betmgm','betrivers'].map(book=>({book}))}}}]}]);
  await world.db.query('insert into public.gtl_account_preferences(user_id,revision,value) values($1,1,$2)',[ACCOUNTS.luke.id,{sportsbooks:['fanduel'],guidanceCollapsed:false}]);
  await signIn(page,'luke');await menu(page);await sheet(page,'Menu').getByRole('button',{name:'Settings · sportsbooks and guidance',exact:true}).click();
  const settings=sheet(page,'Settings');await expect(settings.getByRole('checkbox',{name:/FanDuel/})).toBeChecked();
  await settings.getByRole('checkbox',{name:'DraftKings',exact:true}).check();await inspect(page,'settings-retained-unavailable',testInfo);
  await world.db.query('insert into public.gtl_account_preferences(user_id,revision,value) values($1,2,$2)',[ACCOUNTS.luke.id,{sportsbooks:[],guidanceCollapsed:true}]);
  await settings.getByRole('button',{name:'Save settings',exact:true}).click();await expect(settings.getByRole('alert')).toContainText('Saved settings changed. Your draft is kept.');
  await expect(settings.getByRole('checkbox',{name:'DraftKings',exact:true})).toBeChecked();await inspect(page,'settings-conflict',testInfo);
  // The other device removed FanDuel from the saved set. Its retained local draft
  // stays visible until this deliberate removal; the server still refuses new unavailable books.
  await settings.getByRole('checkbox',{name:/FanDuel/}).click();
  await expect(settings.getByRole('checkbox',{name:/FanDuel/})).toHaveCount(0);
  await settings.getByRole('button',{name:'Save settings',exact:true}).click();await expect(settings.getByRole('status')).toHaveText('Settings saved.');
  expect((await world.db.query('select value from public.gtl_account_preferences where user_id=$1 order by revision desc limit 1',[ACCOUNTS.luke.id])).rows[0].value.sportsbooks).toEqual(['draftkings']);
  expect(world.errors).toEqual([]);
 } finally {await world.db.close();}
});

test('email confirmation and reset notices use real auth responses without inventing account availability',async ({page,baseURL},testInfo)=>{
 const world=await communityWorld(page,baseURL,{migrations:HOSTED});
 try {
  await page.route(`${SUPABASE}/auth/v1/signup**`,route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({user:{id:ACCOUNTS.luke.id,email:'new@example.test',app_metadata:{provider:'email'},user_metadata:{},aud:'authenticated',created_at:'2026-11-07T00:00:00Z'},session:null})}));
  await page.goto('/');await page.getByRole('button',{name:'Create account',exact:true}).first().click();await page.getByLabel('Email',{exact:true}).fill('new@example.test');await page.getByLabel('Password',{exact:true}).fill('example-password');await page.locator('form.auth-form').getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Check your email.',exact:true})).toBeVisible();await expect(page.getByRole('status')).toContainText('Check your email for a confirmation link');await inspect(page,'access-confirmation',testInfo);
  await page.getByRole('button',{name:'Return to sign in',exact:true}).click();await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
  await page.route(`${SUPABASE}/auth/v1/recover**`,route=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:'{}'}));
  await page.getByRole('button',{name:'Send reset link',exact:true}).click();await expect(page.getByRole('status')).toHaveText('If this address has a game account, look for a password reset link in your email.');await inspect(page,'access-reset-requested',testInfo);
  expect(world.errors).toEqual([]);
 } finally {await world.db.close();}
});

test('native password recovery validates a mismatch before changing the password and clears the recovery form after success',async ({page,baseURL},testInfo)=>{
 const world=await communityWorld(page,baseURL,{migrations:HOSTED});
 const changes=[];
 await page.route(`${SUPABASE}/auth/v1/user**`,async route=>{if(route.request().method()==='PUT'){changes.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(world.users.get(world.sessions[ACCOUNTS.luke.email].access_token))});}return route.fallback();});
 try {
  const session=world.sessions[ACCOUNTS.luke.email];await page.goto(`/#type=recovery&access_token=${session.access_token}&refresh_token=${session.refresh_token}&expires_in=3600&token_type=bearer`);
  await expect(page.getByRole('heading',{name:'Choose a new password.',exact:true})).toBeVisible();await page.getByLabel('New password',{exact:true}).fill('new-example-password');await page.getByLabel('Confirm new password',{exact:true}).fill('different-example');
  await inspect(page,'access-reset',testInfo);await page.getByRole('button',{name:'Save new password',exact:true}).click();await expect(page.getByRole('alert')).toContainText('The passwords do not match.');expect(changes).toEqual([]);await inspect(page,'access-reset-mismatch',testInfo);
  await page.getByLabel('Confirm new password',{exact:true}).fill('new-example-password');await page.getByRole('button',{name:'Save new password',exact:true}).click();await expect(page.getByRole('button',{name:'Your menu',exact:true})).toBeVisible();expect(changes).toHaveLength(1);expect(changes[0]).toMatchObject({password:'new-example-password',code_challenge:null,code_challenge_method:null});expect(world.errors).toEqual([]);
 } finally {await world.db.close();}
});


test('Account theme controls retain explicit choices across opposite OS schemes, rapid changes and reload',async ({page,baseURL})=>{
 const world=await communityWorld(page,baseURL,{migrations:HOSTED});
 try {
  await page.goto('/');
  for(const theme of ['light','dark']) {
   await page.getByRole('combobox',{name:'Color theme',exact:true}).selectOption(theme);
   await page.emulateMedia({colorScheme:theme==='light'?'dark':'light'});
   await assertCaptureTheme(page,theme);
   await expect(page.getByRole('combobox',{name:'Color theme',exact:true})).toHaveValue(theme);
   await page.reload();await expect(page.getByRole('combobox',{name:'Color theme',exact:true})).toHaveValue(theme);
   await assertCaptureTheme(page,theme);
  }
  await signIn(page,'luke',{navigate:false});await menu(page);
  await sheet(page,'Menu').getByRole('button',{name:'Appearance',exact:true}).click();
  const appearance=sheet(page,'Appearance'), choices=appearance.getByRole('group',{name:'Theme',exact:true});
  await choices.getByRole('button',{name:'Light',exact:true}).focus();await page.keyboard.press('Space');
  await assertCaptureTheme(page,'light');await expect(choices.getByRole('button',{name:'Light',exact:true})).toBeFocused();
  await page.evaluate(()=>{for(const value of ['dark','light','dark','light']) {localStorage.setItem('gtl.theme',value);window.dispatchEvent(new StorageEvent('storage',{key:'gtl.theme',newValue:value}));}});
  await assertCaptureTheme(page,'light');await expect(choices.getByRole('button',{name:'Light',exact:true})).toHaveAttribute('aria-pressed','true');
  await choices.getByRole('button',{name:'System',exact:true}).click();
  for(const theme of ['dark','light']) {await page.emulateMedia({colorScheme:theme});await assertCaptureTheme(page,theme,{preference:'system'});await expect(appearance.locator('.gx-appearance-mini')).toHaveAttribute('data-theme',theme);await expect(choices.getByRole('button',{name:'System',exact:true})).toHaveAttribute('aria-pressed','true');}
  await appearance.getByRole('button',{name:'Menu',exact:true}).click();await sheet(page,'Menu').getByRole('button',{name:'Guidance and sources',exact:true}).click();
  const topic=sheet(page,'Guidance and sources').locator('[data-guidance="points"]');
  await topic.locator('summary').focus();await page.keyboard.press('Enter');await expect(topic).toHaveAttribute('open','');
  await page.keyboard.press('Space');await expect(topic).not.toHaveAttribute('open','');
  await expect(topic.locator('.gx-account-icon svg')).toHaveClass(/lucide-chart-no-axes-combined/);
  await expect(sheet(page,'Guidance and sources').locator('[data-guidance="weather"] .gx-account-icon svg')).toHaveClass(/lucide-cloud-sun/);
  expect(world.errors).toEqual([]);
 } finally {await world.db.close();}
});
