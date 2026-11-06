(()=>{
'use strict';
const roots=new WeakMap();
fetch('populated-research-data.json').then(r=>{if(!r.ok)throw Error('Research snapshot did not load');return r.json();}).then(model=>{
 document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 let observer;
 function apply(){const d=frame.contentDocument,header=d?.querySelector('.compact-game-header');if(!header||!frame.contentWindow.GTLPopulatedResearch)return;const parent=header.parentElement;if(parent.querySelector('.populated-research-root'))return;const old=parent.querySelector('.panel:not(.compact-game-header)');if(!old)return;
 const root=d.createElement('div');root.className='populated-research-root gx';root.dataset.theme=frame.dataset.reviewTheme;root.dataset.publicSnapshot=model.generatedAt;old.replaceWith(root);
 const summary=header.querySelector('.matchup-summary');summary.setAttribute('aria-label','Arizona Cardinals at Seattle Seahawks, Week 9, November 8, 2026');summary.innerHTML='<div class="visual-matchup"><span><span class="team-logo-tile"><img class="team-mark" src="visual-assets/ari.png" alt=""></span><span>Cardinals</span><small>'+model.teams.find(t=>t.code==='ARI').record+'</small></span><small>at</small><span><span class="team-logo-tile"><img class="team-mark" src="visual-assets/sea.png" alt=""></span><span>Seahawks</span><small>'+model.teams.find(t=>t.code==='SEA').record+'</small></span></div>';header.querySelector('.section-label>span').textContent='Week 9 · Nov 8';
 d.querySelector('.fixture').textContent='PUBLIC SNAPSHOT · VISUAL PREVIEW · NO SAVES';
 roots.get(frame)?.unmount();roots.set(frame,frame.contentWindow.GTLPopulatedResearch.mount(root,model));
 }
 function ready(){const d=frame.contentDocument;if(!d?.getElementById('grid'))return;observer?.disconnect();for(const file of ['populated-research.bundle.css','populated-research.css'])if(!d.querySelector('link[data-populated-css="'+file+'"]')){const link=d.createElement('link');link.rel='stylesheet';link.href=file;link.dataset.populatedCss=file;d.head.append(link);}if(!d.querySelector('script[data-populated-module]')){const script=d.createElement('script');script.src='populated-research.bundle.js';script.dataset.populatedModule='true';script.onload=apply;d.head.append(script);}observer=new MutationObserver(apply);observer.observe(d.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);ready();
 });
}).catch(error=>{const status=document.getElementById('load-status');if(status){status.textContent=error.message;status.setAttribute('role','alert');}});
})();
