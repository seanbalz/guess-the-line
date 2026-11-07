(()=>{
'use strict';
const roots=new WeakMap();
async function read(path){const response=await fetch(path);if(!response.ok)throw Error('Preview asset did not load: '+path);return response.json();}
Promise.all([read('populated-research-data.json'),read('populated-fantasy-data.json').then(async metadata=>({...metadata,snapshot:await read(metadata.snapshotAsset),review:await read(metadata.reviewSource.asset)})),read('score-history-data.json'),read('league-preview-data.json'),read('bets-preview-data.json'),read('epl-preview-data.json'),read('commissioner-schedule-data.json')]).then(([model,fantasy,score,league,bets,epl,commissionerSchedule])=>{
 document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 let observer;
 function apply(){const d=frame.contentDocument;if(!d||!frame.contentWindow.GTLPopulatedResearch||d.querySelector('.populated-research-root'))return;
 const title=d.querySelector('.detail-close~.screen-top .page-title');


 const eplMoneylineLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='EPL'&&title?.textContent==='Pick a Team'&&['epl-moneyline-entry','epl-moneyline-saved-draft','epl-moneyline-results','epl-moneyline-closed','epl-moneyline-uncertain','epl-moneyline-stale','epl-moneyline-busy','epl-moneyline-read-only','epl-moneyline-unavailable','epl-moneyline-loading','epl-moneyline-failed','epl-moneyline-leaderboard','epl-moneyline-leaderboard-empty','epl-moneyline-leaderboard-loading','epl-moneyline-leaderboard-failed'].includes(eplMoneylineLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='epl-moneyline';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='EPL RULE-MATH / SAMPLE GUESSES · NO BOOKMAKER QUOTES OR SAVES';
  d.querySelectorAll('.app-nav button').forEach(b=>b.classList.toggle('active',b.dataset.action==='Play'));
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountEplMoneyline(root,eplMoneylineLayer.slice(14)));return;
 }
 const eplHomeLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='EPL'&&title?.textContent==='Pick a Team'&&['epl-home-turn','epl-home-picked','epl-home-unlinked','epl-home-all-in','epl-home-locked','epl-home-progress-failed','epl-home-loading','epl-home-failed','epl-home-forbidden','epl-home-off','epl-home-no-week','epl-home-stale','epl-home-review'].includes(eplHomeLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='epl-home';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL EPL HOME / RECOVERY · NO LIVE READ OR SAVES';
  const home=['turn','picked','unlinked','all-in','locked','progress-failed'].includes(eplHomeLayer.slice(9));
  d.querySelectorAll('.app-nav button').forEach(b=>b.classList.toggle('active',b.dataset.action===(home?'Home':'Play')));
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountEplHome(root,epl,eplHomeLayer.slice(9)));return;
 }
 const eplManagerLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='EPL'&&title?.textContent==='Pick a Team'&&['epl-manager-choose','epl-manager-watching','epl-manager-linked','epl-manager-taken','epl-manager-already-linked','epl-manager-failed','epl-manager-uncertain','epl-manager-busy','epl-manager-no-managers'].includes(eplManagerLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='epl-manager';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL EPL MANAGERS · NO CLAIM OR SESSION SAVE';
  d.querySelectorAll('.app-nav button').forEach(b=>b.classList.toggle('active',b.dataset.action==='Play'));
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountEplClaim(root,epl,eplManagerLayer.slice(12)));return;
 }
 const eplCorrectionsLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['epl-corrections-ready','epl-corrections-missing','epl-corrections-empty','epl-corrections-unavailable','epl-corrections-failed','epl-corrections-denied','epl-corrections-loading','epl-corrections-refreshing','epl-corrections-stale'].includes(eplCorrectionsLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='epl-corrections';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL EPL CORRECTIONS · NO ACCOUNT OR SOURCE READ';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountEplCorrections(root,eplCorrectionsLayer.slice(16)));return;
 }
 const oddsLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['odds-connection-initial','odds-connection-ready','odds-connection-fetched','odds-connection-low-quota','odds-connection-pending','odds-connection-failed','odds-connection-checking'].includes(oddsLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='odds-connection';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL ODDS CONNECTION · NO PROVIDER OR CREDIT USE';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountOddsConnection(root,oddsLayer.slice(16)));return;
 }
 const finalLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['final-review-form','final-review-confirmation','final-review-correction','final-review-conflict','final-review-unavailable','final-review-busy'].includes(finalLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='final-review';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='ARCHIVED FINALS / FICTIONAL REVIEW · NO RECORDING OR GRADING';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountFinalReview(root,score,finalLayer.slice(13)));return;
 }
 const refereeLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['referees-ready','referees-draft','referees-busy','referees-partial','referees-read-error'].includes(refereeLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='referees';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL REFEREES / ARCHIVED GAMES · NO ASSIGNMENTS';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountReferees(root,commissionerSchedule,refereeLayer.slice(9)));return;
 }
 const opsLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['commissioner-status','commissioner-status-paused','commissioner-settlement-uncertain','commissioner-week-entry','commissioner-week-review','commissioner-week-error'].includes(opsLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='commissioner-status';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='ILLUSTRATIVE STATUS / ARCHIVED SCHEDULE · NO OPERATIONS';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountCommissionerStatus(root,commissionerSchedule,opsLayer==='commissioner-status-paused'?'paused':opsLayer==='commissioner-settlement-uncertain'?'uncertain':opsLayer.startsWith('commissioner-week-')?opsLayer.slice(13):'status'));return;
 }
 const commissionerLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['commissioner-hub','commissioner-members','commissioner-remove','commissioner-restore','commissioner-pending','commissioner-restricted'].includes(commissionerLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='commissioner';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL COMMISSIONER VIEW · NO ACCESS OR RECORD CHANGES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountCommissioner(root,commissionerLayer.slice(13)));return;
 }
 const recoveryLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['session-expired','session-failed','session-google','name-save-uncertain','name-save-offline','name-save-sign-in','name-private-invite'].includes(recoveryLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='draft-recovery';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL SESSION/DRAFT RECOVERY · NO AUTH OR SAVES';
  roots.get(frame)?.unmount();const api=frame.contentWindow.GTLPopulatedResearch;
  roots.set(frame,recoveryLayer.startsWith('session-')?api.mountSessionRecovery(root,recoveryLayer==='session-failed'?'failed':recoveryLayer==='session-google'?'google':'standard'):api.mountNameRecovery(root,recoveryLayer==='name-save-offline'?'offline':recoveryLayer==='name-save-sign-in'?'sign-in':recoveryLayer==='name-private-invite'?'invited':'uncertain'));return;
 }
 const accessCoverLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['league-access-pending','league-access-removed','league-access-removed-no-groups','league-access-saved-link','league-access-saved-joining','league-access-saved-uncertain'].includes(accessCoverLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='league-access';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL LEAGUE ACCESS · NO TOKEN OR MEMBERSHIP CHANGES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountLeagueAccess(root,accessCoverLayer.slice(14)));return;
 }
 const continuityLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['app-offline','app-startup','app-account-failed','app-tab-failed','app-page-failed','app-reload-warning'].includes(continuityLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='continuity';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL APP STATE · NO REFRESH, RELOAD OR ACCOUNT CHANGE';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountContinuity(root,continuityLayer.slice(4)));return;
 }
 const exportLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['export-data','export-preparing','export-completion','export-failed','export-unavailable'].includes(exportLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='export';stack.replaceChildren(root);
  title.textContent='Export my data';title.previousElementSibling.textContent='Account';d.querySelector('.fixture').textContent='EXPORT VISUAL EXAMPLE · NO ACCOUNT READ OR DOWNLOAD';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountExport(root,exportLayer==='export-preparing'?'preparing':exportLayer==='export-completion'?'done':exportLayer==='export-failed'?'failed':exportLayer==='export-unavailable'?'unavailable':'idle'));return;
 }
 const appearanceLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['appearance','appearance-system','appearance-reduced','appearance-device-reduced','appearance-storage-unavailable'].includes(appearanceLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='appearance';stack.replaceChildren(root);
  title.textContent='Appearance';title.previousElementSibling.textContent='Account';d.querySelector('.fixture').textContent='EXAMPLE DEVICE SETTINGS · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountAppearance(root,appearanceLayer==='appearance-system'?'system':appearanceLayer==='appearance-reduced'?'reduced':appearanceLayer==='appearance-device-reduced'?'device-reduced':appearanceLayer==='appearance-storage-unavailable'?'unavailable':'standard'));return;
 }
 const accessLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['access-sign-in','access-create','access-confirmation','access-name','access-forgot','access-reset-requested','access-reset','access-reset-mismatch','access-unavailable','access-loading'].includes(accessLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='access';stack.replaceChildren(root);
  d.querySelector('.fixture').textContent='FICTIONAL ACCESS EXAMPLE · NO AUTHENTICATION OR EMAIL';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountAccess(root,({'access-sign-in':'signin','access-create':'signup','access-confirmation':'confirmation','access-name':'name','access-forgot':'forgot','access-reset-requested':'reset-requested','access-reset':'reset','access-reset-mismatch':'reset-mismatch','access-unavailable':'signin-error','access-loading':'loading'})[accessLayer]));return;
 }
 const appInviteLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Profile & account'&&['app-invite-entry','app-invite','app-invite-share','app-invite-fallback'].includes(appInviteLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='app-invite';stack.replaceChildren(root);
  title.textContent='Invite friends';title.previousElementSibling.textContent='Account';d.querySelector('.fixture').textContent='NEW GENERAL APP INVITE · VISUAL PROPOSAL · NOTHING SENT';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountAppInvite(root,appInviteLayer==='app-invite-entry'?'account':appInviteLayer==='app-invite-share'?'share':appInviteLayer==='app-invite-fallback'?'fallback':'invite'));return;
 }
 const setupLayer=document.getElementById('review-layer')?.value;
 if(d.getElementById('screen')?.value==='Account'&&title?.textContent==='Your league'&&['league-switcher','league-create','league-invite','league-join-check'].includes(setupLayer)){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='league-setup';stack.replaceChildren(root);
  title.textContent='Your leagues';title.previousElementSibling.textContent='League';d.querySelector('.fixture').textContent='FICTIONAL LEAGUES & INVITATIONS · NOTHING SENT';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountLeagueSetup(root,setupLayer==='league-create'?'create':setupLayer==='league-invite'?'invite':'switcher',setupLayer==='league-join-check'?'join-check':'standard'));return;
 }
 const toolsLayer=document.getElementById('review-layer')?.value;
 if(title?.textContent==='Profile & account'&&['settings','settings-unavailable','settings-conflict','guidance'].includes(toolsLayer)&&d.getElementById('screen')?.value==='Account'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='account-tools';stack.replaceChildren(root);
  const guide=toolsLayer==='guidance';title.textContent=guide?'Guidance and sources':'Settings';title.previousElementSibling.textContent='Account';d.querySelector('.fixture').textContent=guide?'EXISTING GUIDANCE · SOURCES UNCHANGED · NO ACCOUNT DATA':'FICTIONAL SETTINGS · EXAMPLE CATALOG · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountAccountTools(root,guide?'guidance':'settings',toolsLayer==='settings-unavailable'?'unavailable':toolsLayer==='settings-conflict'?'conflict':'standard'));return;
 }
 const reminderLayer=document.getElementById('review-layer')?.value??'';
 const reminderExample=d.getElementById('screen')?.value==='Account'&&d.querySelector('.detail-close')&&(title?.textContent==='Reminders'||d.querySelector('.pill')?.textContent==='ON · SAMPLE STATE'||reminderLayer.startsWith('reminders'));
 if(title?.textContent==='Profile & account'||reminderExample){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const profile=title.textContent==='Profile & account',scenario=reminderLayer==='reminders-on'?'on':reminderLayer.startsWith('reminders-')?reminderLayer.slice(10):'off';
  const profileScenario=reminderLayer==='profile-conflict'?'conflict':reminderLayer==='profile-pending'?'pending':'edit';
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='account';stack.replaceChildren(root);
  title.textContent=profile?'Profile & account':'Pick reminders';title.previousElementSibling.textContent='Account';d.querySelector('.fixture').textContent='FICTIONAL ACCOUNT · EXAMPLE DEVICE STATES · NO CHANGES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountAccount(root,profile?'profile':'reminders',scenario,profileScenario));return;
 }
 const eplConfirmation=title?.textContent==='Team confirmation'||d.querySelector('.status-word')?.textContent==='ILLUSTRATED CONFIRMATION';
 if(title?.textContent==='Pick a Team'||eplConfirmation){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const initialView=eplConfirmation?'confirmation':'board';
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='epl';stack.replaceChildren(root);
  d.querySelectorAll('.app-nav button').forEach(b=>b.classList.toggle('active',b.dataset.action==='Play'));
  title.previousElementSibling.textContent='EPL';d.querySelector('.fixture').textContent='FICTIONAL DRAFT · NO LIVE FIXTURES · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountEpl(root,epl,initialView,view=>{title.textContent=view.name;d.querySelector('.detail-close').hidden=view.open;}));return;
 }
 if(title?.textContent==='Recommendations'&&document.getElementById('review-layer')?.value==='gap-record'&&d.getElementById('screen')?.value==='Bets'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='gap-record';stack.replaceChildren(root);
  title.textContent='Your guess vs. market';title.previousElementSibling.textContent='Bets';d.querySelector('.fixture').textContent='HISTORICAL EXAMPLES · PAPER RECORD · NO ACCOUNT DATA';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountGapRecord(root,score));return;
 }
 const changeLayer=document.getElementById('review-layer')?.value;
 if(title?.textContent==='Ticket details'&&['result-report','ticket-correction'].includes(changeLayer)&&d.getElementById('screen')?.value==='Bets'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='bets-changes';stack.replaceChildren(root);
  title.textContent='Ticket changes';title.previousElementSibling.textContent='Bets';d.querySelector('.fixture').textContent='FICTIONAL TICKET · EXAMPLE CHANGES · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountBetsChanges(root,bets,changeLayer==='ticket-correction'?'correct':'settle'));return;
 }
 if(title?.textContent==='Ticket details'&&document.getElementById('review-layer')?.value==='performance'&&d.getElementById('screen')?.value==='Bets'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='bets-overview';stack.replaceChildren(root);
  title.textContent='My bets overview';title.previousElementSibling.textContent='Bets';d.querySelector('.fixture').textContent='FICTIONAL TICKETS, PRICES & DATES · NO ACCOUNT DATA';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountBetsOverview(root,bets));return;
 }
 if(title?.textContent==='Ticket details'||title?.textContent==='Track a bet'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const initialView=title.textContent==='Track a bet'?'tracking':'ticket';
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='bets';stack.replaceChildren(root);
  title.previousElementSibling.textContent='Bets';d.querySelector('.fixture').textContent='FICTIONAL RECEIPT · HISTORICAL REFERENCES · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountBets(root,bets,initialView,view=>{title.textContent=view.name;}));return;
 }
 if(title?.textContent==='Your league'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='league';stack.replaceChildren(root);
  title.previousElementSibling.textContent='League';d.querySelector('.fixture').textContent='FICTIONAL LEAGUE · SAMPLE ACTIVITY · NO POSTS SENT';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountLeague(root,league,frame.dataset.reviewTheme,view=>{title.textContent=view.name;d.querySelector('.detail-close').hidden=view.open;}));return;
 }
 if(title?.textContent==='Your score & history'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='score';stack.replaceChildren(root);
  title.previousElementSibling.textContent='Play';d.querySelector('.fixture').textContent='HISTORICAL EXAMPLES · SAMPLE GUESSES · NO ACCOUNT DATA';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountScore(root,score,view=>{title.textContent=view.name;d.querySelector('.detail-close').hidden=view.open;}));return;
 }
 if(title?.textContent==='Guess the Points'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='points';stack.replaceChildren(root);
  title.previousElementSibling.textContent='Play';d.querySelector('.fixture').textContent='EXAMPLE LINEUP · SAMPLE GUESSES · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountPoints(root,fantasy,model,view=>{title.textContent=view.name;d.querySelector('.detail-close').hidden=view.open;}));return;
 }
 if(title?.textContent==='Guess the Spread'||title?.textContent==='Guess the Total'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const mode=title.textContent==='Guess the Total'?'guess_total':'guess_spread';
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.researchView='play';stack.replaceChildren(root);
  title.previousElementSibling.textContent='Play';d.querySelector('.fixture').textContent='VISUAL DEMO · SAMPLE GUESSES · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountPlay(root,model,mode,market=>{title.textContent='Guess the '+market;}));return;
 }
 if(title?.textContent==='Fantasy comparison'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.publicSnapshot=fantasy.source.generatedAt;root.dataset.researchView='fantasy';stack.replaceChildren(root);
  title.textContent='Fantasy';title.previousElementSibling.textContent='Research';
  d.querySelector('.fixture').textContent='PUBLIC SNAPSHOT · VISUAL PREVIEW · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountFantasy(root,fantasy,view=>{title.textContent=view.name;d.querySelector('.detail-close').hidden=view.open;}));return;
 }
 if(title?.textContent==='Team profiles'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.publicSnapshot=model.generatedAt;root.dataset.researchView='teams';stack.replaceChildren(root);
  title.textContent='Teams';title.previousElementSibling.textContent='Research';
  d.querySelector('.fixture').textContent='PUBLIC SNAPSHOT · VISUAL PREVIEW · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountTeams(root,model,view=>{title.textContent=view.name;d.querySelector('.detail-close').hidden=view.open;}));return;
 }
 if(title?.textContent==='This week’s games'){
  const stack=d.querySelector('.detail-close~.stack');if(!stack)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.publicSnapshot=model.generatedAt;root.dataset.researchView='games-list';stack.replaceChildren(root);
  title.textContent='Games';title.previousElementSibling.textContent='Research';
  d.querySelector('.fixture').textContent='PUBLIC SNAPSHOT · VISUAL PREVIEW · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountGames(root,model));return;
 }
 if(title?.textContent==='Trend evidence'){
  const old=d.querySelector('.detail-close~.stack .panel');if(!old)return;
  const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.publicSnapshot=model.generatedAt;root.dataset.researchView='trends-list';old.replaceWith(root);
  title.textContent='Trends';title.previousElementSibling.textContent='Research';
  d.querySelector('.fixture').textContent='PUBLIC SNAPSHOT · VISUAL PREVIEW · NO SAVES';
  roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mountTrends(root,model));return;
 }
 const header=d.querySelector('.compact-game-header');if(!header)return;const parent=header.parentElement;const old=parent.querySelector('.panel:not(.compact-game-header)');if(!old)return;
 const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.publicSnapshot=model.generatedAt;old.replaceWith(root);
 const summary=header.querySelector('.matchup-summary');summary.setAttribute('aria-label','Arizona Cardinals at Seattle Seahawks, Week 9, November 8, 2026');summary.innerHTML='<div class="visual-matchup"><span><span class="team-logo-tile"><img class="team-mark" src="visual-assets/ari.png" alt=""></span><span>Cardinals</span><small>'+model.teams.find(t=>t.code==='ARI').record+'</small></span><small>at</small><span><span class="team-logo-tile"><img class="team-mark" src="visual-assets/sea.png" alt=""></span><span>Seahawks</span><small>'+model.teams.find(t=>t.code==='SEA').record+'</small></span></div>';header.querySelector('.section-label>span').textContent='Week 9 · Nov 8';
 d.querySelector('.fixture').textContent='PUBLIC SNAPSHOT · VISUAL PREVIEW · NO SAVES';
 roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mount(root,model));
 }
 function ready(){const d=frame.contentDocument;if(!d?.getElementById('grid'))return;observer?.disconnect();for(const file of ['populated-research.bundle.css','populated-research.css','populated-teams.css','populated-fantasy.css','populated-play.css','populated-points.css','populated-score.css','league-native-avatar.css','populated-league.css','populated-bets.css','populated-epl.css','account-native-avatar.css','populated-account.css','populated-bets-overview.css','populated-bets-changes.css','populated-gap-record.css','populated-account-tools.css','populated-league-setup.css','populated-app-invite.css','populated-access.css','populated-appearance.css','populated-export.css','populated-continuity.css','populated-league-access.css','populated-session-recovery.css','populated-commissioner.css','populated-commissioner-status.css','populated-referees.css','populated-final-review.css','populated-odds-connection.css','populated-epl-corrections.css','populated-epl-claim.css','populated-epl-home.css','populated-epl-moneyline.css'])if(!d.querySelector('link[data-populated-css="'+file+'"]')){const link=d.createElement('link');link.rel='stylesheet';link.href=file;link.dataset.populatedCss=file;d.head.append(link);}if(!d.querySelector('script[data-populated-module]')){const script=d.createElement('script');script.src='populated-research.bundle.js';script.dataset.populatedModule='true';script.onload=apply;d.head.append(script);}observer=new MutationObserver(apply);observer.observe(d.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);ready();
 });
}).catch(error=>{const status=document.getElementById('load-status');if(status){status.textContent=error.message;status.setAttribute('role','alert');}});
})();
