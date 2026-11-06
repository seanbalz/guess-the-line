(()=>{
'use strict';
const roots=new WeakMap();
async function read(path){const response=await fetch(path);if(!response.ok)throw Error('Preview asset did not load: '+path);return response.json();}
Promise.all([read('populated-research-data.json'),read('populated-fantasy-data.json').then(async metadata=>({...metadata,snapshot:await read(metadata.snapshotAsset),review:await read(metadata.reviewSource.asset)})),read('score-history-data.json'),read('league-preview-data.json'),read('bets-preview-data.json')]).then(([model,fantasy,score,league,bets])=>{
 document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 let observer;
 function apply(){const d=frame.contentDocument;if(!d||!frame.contentWindow.GTLPopulatedResearch||d.querySelector('.populated-research-root'))return;
 const title=d.querySelector('.detail-close~.screen-top .page-title');
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
 function ready(){const d=frame.contentDocument;if(!d?.getElementById('grid'))return;observer?.disconnect();for(const file of ['populated-research.bundle.css','populated-research.css','populated-teams.css','populated-fantasy.css','populated-play.css','populated-points.css','populated-score.css','league-native-avatar.css','populated-league.css','populated-bets.css'])if(!d.querySelector('link[data-populated-css="'+file+'"]')){const link=d.createElement('link');link.rel='stylesheet';link.href=file;link.dataset.populatedCss=file;d.head.append(link);}if(!d.querySelector('script[data-populated-module]')){const script=d.createElement('script');script.src='populated-research.bundle.js';script.dataset.populatedModule='true';script.onload=apply;d.head.append(script);}observer=new MutationObserver(apply);observer.observe(d.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);ready();
 });
}).catch(error=>{const status=document.getElementById('load-status');if(status){status.textContent=error.message;status.setAttribute('role','alert');}});
})();
