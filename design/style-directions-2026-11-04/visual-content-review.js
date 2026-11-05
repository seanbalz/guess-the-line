(()=>{
'use strict';
let icons;let treatment=new URLSearchParams(location.search).get('icons')||'3';
const names=['Clean outline','Frosted duotone','Glossy glass','Lime medallion','Inset relief'];
const glyph=name=>'<span class="visual-icon" aria-hidden="true">'+icons[name]+'</span>';
const logo=(code,name)=>'<img class="team-mark" src="visual-assets/'+code+'.png" alt=""><span>'+name+'</span>';
const pair=(a='sea',b='den',an='Seahawks',bn='Broncos')=>'<div class="visual-matchup"><span>'+logo(a,an)+'</span><small>at</small><span>'+logo(b,bn)+'</span></div>';
const spark='<svg class="visual-spark" viewBox="0 0 150 55" role="img" aria-label="Illustrative trend, weeks 1 through 5"><path d="M3 48L35 38L67 40L102 22L145 10L145 54H3Z" fill="currentColor" opacity=".12"/><path d="M3 48L35 38L67 40L102 22L145 10" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="145" cy="10" r="4" fill="currentColor"/></svg>';
const podium='<div class="visual-podium" aria-hidden="true"><span style="height:35px">3</span><span class="you" style="height:52px">2</span><span style="height:70px">1</span></div>';
const css=`
 .phone[data-visual-review] .team-mark{width:54px;height:54px;object-fit:contain;filter:drop-shadow(0 5px 4px #00000030)}
 .phone[data-visual-review] .visual-matchup{display:flex;align-items:center;justify-content:space-around;gap:8px;margin:8px 0 14px;width:100%}
 .visual-matchup>span{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:13px;color:var(--ink)}
 .visual-matchup>small{color:var(--muted);font-size:12px}.matchup-summary.visual-pair{display:block!important;border:0!important;padding:0!important}
 .phone[data-research-logo-tiles] .visual-matchup{background:transparent;box-shadow:none}.phone[data-research-logo-tiles] .visual-matchup .team-logo-tile{display:grid;place-items:center;width:64px;height:64px;border-radius:16px;background:var(--pc-small-surface);border:1px solid var(--pc-border);box-shadow:inset 0 1px 0 var(--pc-edge-1),0 4px 8px var(--pc-shadow);backdrop-filter:blur(12px)}.phone[data-research-logo-tiles] .content-quick .visual-matchup{gap:5px}.phone[data-research-logo-tiles] .content-quick .team-logo-tile{width:42px;height:42px;border-radius:12px}.phone[data-research-logo-tiles] .content-quick .team-logo-tile .team-mark{width:34px;height:34px}.phone[data-research-logo-tiles] .content-quick .visual-matchup>span{font-size:12px;min-width:0}
 .phone[data-visual-review] .content-quick{min-height:166px!important;gap:5px!important;padding:16px!important}
 .visual-card-head{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px;width:100%}.visual-card-head .visual-icon{width:32px;height:32px;border-radius:10px}.visual-card-head svg{width:20px;height:20px}
 .visual-card-head>small{margin-left:auto;font-size:16px;color:var(--muted)}
 .visual-spark{width:100%;height:55px;display:block;color:var(--accent);flex-shrink:0}.visual-card-note{font-size:12px;color:var(--muted)}
 .visual-podium{display:flex;align-items:end;justify-content:center;gap:7px;width:100%;height:74px}.visual-podium>span{display:grid;place-items:center;width:26%;max-width:40px;border-radius:7px 7px 2px 2px;background:color-mix(in srgb,var(--muted) 18%,transparent);font-size:13px;color:var(--muted)}.visual-podium .you{background:color-mix(in srgb,var(--accent) 35%,transparent);border:1px solid var(--accent);color:var(--ink)}
 .visual-bars{display:flex;flex-direction:column;gap:10px;width:100%;margin:6px 0}.visual-bar{display:grid;grid-template-columns:15px 1fr 25px;align-items:center;gap:6px;font-size:12px;color:var(--muted)}.visual-bar i{height:11px;border-radius:6px;background:color-mix(in srgb,var(--accent) 18%,transparent);overflow:hidden}.visual-bar i:before{content:"";display:block;width:var(--amount);height:100%;border-radius:6px;background:var(--accent)}.visual-bar b{font-weight:600;color:var(--ink)}
 .phone[data-visual-review] .app-nav button>i{display:flex;justify-content:center;font-style:normal}.app-nav .visual-icon{width:34px;height:32px;border-radius:10px}.app-nav .visual-icon svg{width:21px;height:21px}.app-nav button:not(.active) .visual-icon{color:var(--muted);background:transparent;box-shadow:none;border-color:transparent}.app-nav button:not(.active) .visual-icon:after{display:none}
 .phone[data-visual-review] .match-row>.team-code{width:42px;height:42px;background:transparent;border:0}.phone[data-visual-review] .match-row .team-mark{width:40px;height:40px}.phone[data-visual-review] .row-text strong{font-size:14px}
 .phone[data-visual-review] .home-games .match-row{gap:8px}.phone[data-visual-review] .home-games .team-code{display:flex;align-items:center;justify-content:center;width:84px;flex:0 0 84px;gap:3px;background:transparent!important;border:0!important;box-shadow:none!important;backdrop-filter:none!important}.phone[data-visual-review] .home-games .team-code:before,.phone[data-visual-review] .home-games .team-code:after{display:none!important}.phone[data-visual-review] .home-games .team-logo-tile{display:grid;place-items:center;flex:0 0 34px;width:34px;height:38px;border-radius:10px;background:var(--pc-small-surface);border:1px solid var(--pc-border);box-shadow:inset 0 1px 0 var(--pc-edge-1),0 4px 8px var(--pc-shadow);backdrop-filter:blur(12px)}.phone[data-visual-review] .home-games .team-code .team-mark{width:28px;height:28px}.phone[data-visual-review] .home-games .team-code small{font-size:10px;color:var(--muted);background:transparent}.phone[data-visual-review] .home-games .row-text{min-width:0}.phone[data-visual-review] .home-games .quiet{font-size:13px;padding-inline:4px;min-height:44px;flex-shrink:0}
 .phone[data-visual-review] .home-hero{position:relative}.phone[data-visual-review] .home-hero h2{font-size:32px;line-height:1.08;max-width:210px;margin-bottom:12px}.phone[data-visual-review] .home-hero .ring{display:none}.visual-progress{display:flex;gap:18px;align-items:center;margin:14px 0}.visual-dial{width:90px;height:90px;position:relative;flex-shrink:0}.visual-dial svg{width:90px;height:90px;transform:rotate(-90deg)}.visual-dial circle{fill:none;stroke:var(--accent);stroke-width:7}.visual-dial circle:first-child{opacity:.13}.visual-dial circle:last-child{stroke-dasharray:159 239;stroke-linecap:round}.visual-dial b{position:absolute;inset:0;display:grid;place-items:center;font-size:21px;color:var(--ink)}.visual-progress>span{font-size:15px;line-height:1.6;color:var(--muted)}.visual-progress strong{color:var(--ink)}
 .visual-score-icon{display:inline-flex;vertical-align:middle;margin-left:5px}.visual-score-icon .visual-icon{width:28px;height:28px}.visual-score-icon svg{width:19px;height:19px}
 .visual-clubs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:16px 0}.visual-clubs>span{display:flex;align-items:center;flex-direction:column;font-size:11px;gap:4px}.visual-clubs .team-mark{width:40px!important;height:40px!important}
 .phone[data-visual-review] .content-pick{min-height:170px}.content-pick .visual-matchup .team-mark{width:44px;height:44px}.content-pick .visual-matchup>span{font-size:11px}.phone[data-visual-review] .content-pick>b{font-size:18px;margin:2px 0}
 `;
const head=(name,icon)=>'<span class="visual-card-head">'+glyph(icon)+name+'<small aria-hidden="true">↗</small></span>';
function researchTiles(screen,d){screen.querySelectorAll('.visual-matchup .team-mark').forEach(img=>{if(img.parentElement.classList.contains('team-logo-tile'))return;const tile=d.createElement('span');tile.className='team-logo-tile';img.before(tile);tile.append(img);});}
function apply(frame){
 const d=frame.contentDocument,p=d?.querySelector('.phone'),screen=p?.querySelector('.screen');if(!p||!icons)return;
 p.dataset.iconTreatment=treatment;p.dataset.visualReview='v1';if(screen.dataset.visualReview)return;screen.dataset.visualReview='true';
 const area=d.getElementById('screen')?.value;
 if(area==='Research')p.dataset.researchLogoTiles='true';
 p.querySelectorAll('.app-nav button').forEach((b,i)=>{b.querySelector('i').innerHTML=glyph(['house','target','ticket','chart-no-axes-combined'][i]);});
 screen.querySelectorAll('.matchup-summary').forEach(n=>{n.classList.add('visual-pair');n.innerHTML=pair();});
 screen.querySelectorAll('.team-code').forEach(n=>{const code={SEA:'sea',DEN:'den',CHI:'chi',DET:'det'}[n.textContent.trim()];if(!code)return;const opponent=n.closest('.home-games')?{sea:'den',chi:'det'}[code]:null;const mark=c=>'<img class="team-mark" src="visual-assets/'+c+'.png" alt="">';n.innerHTML=opponent?'<span class="team-logo-tile">'+mark(code)+'</span><small aria-hidden="true">@</small><span class="team-logo-tile">'+mark(opponent)+'</span>':mark(code);});
 if(screen.querySelector('.detail-close')){if(area==='Research')researchTiles(screen,d);return;}
 screen.querySelectorAll('button.quick').forEach(b=>{
 const a=b.dataset.action;let html;
 if(a==='detail:league')html=head('League','users')+podium+'<span class="visual-card-note">Your rank · 2 of 24</span>';
 if(area==='Home'&&a==='Research')html=head('Research','chart-no-axes-combined')+spark+'<span class="visual-card-note">Explore sample trends</span>';
 if(area==='Research'){
 if(a==='detail:games')html=head('Games','target')+pair()+'<span class="visual-card-note">Matchup notebook</span>';
 if(a==='detail:trends')html=head('Trends','chart-no-axes-combined')+spark+'<span class="visual-card-note">Sample · Weeks 1–5</span>';
 if(a==='detail:fantasy')html=head('Fantasy','users')+'<span class="visual-bars"><span class="visual-bar">A<i style="--amount:100%"></i><b>8.0</b></span><span class="visual-bar">B<i style="--amount:81.25%"></i><b>6.5</b></span></span><span class="visual-card-note">Sample targets · A / B</span>';
 if(a==='detail:teams')html=head('Teams','trophy')+pair('chi','det','Bears','Lions')+'<span class="visual-card-note">Team profiles</span>';
 }
 if(html){b.classList.add('content-quick');b.innerHTML=html;}
 });
 if(area==='Home'){
 const hero=screen.querySelector('.home-hero');if(hero){hero.querySelector('h2').textContent='Your week. In play.';hero.querySelector('p')?.remove();hero.querySelector('.progress-wrap')?.remove();const progress=d.createElement('div');progress.className='visual-progress';progress.innerHTML='<span class="visual-dial" role="img" aria-label="8 of 12 sample picks ready"><svg viewBox="0 0 90 90" aria-hidden="true"><circle cx="45" cy="45" r="38"/><circle cx="45" cy="45" r="38"/></svg><b>8 / 12</b></span><span><strong>4 picks left</strong><br>Finish your drafts</span>';hero.insertBefore(progress,hero.querySelector('.primary'));}
 screen.querySelectorAll('.home-score .metric small').forEach((n,i)=>{n.insertAdjacentHTML('beforeend','<span class="visual-score-icon">'+glyph(i?'chart-no-axes-combined':'trophy')+'</span>');});
 }
 if(area==='Play')screen.querySelectorAll('.pick-card').forEach(b=>{const total=b.dataset.action==='detail:total';b.innerHTML='<small>'+ (total?'Total':'Spread')+' · sample</small>'+ (total?pair('chi','det','Bears','Lions'):pair())+'<b>'+(total?'To pick':'Your draft')+'</b>';});
 if(area==='Research'){const h=screen.querySelector('.hero h2');if(h)h.textContent='Know the matchup.';researchTiles(screen,d);}
 if(area==='EPL'){const hero=screen.querySelector('.hero');if(hero){hero.querySelector('p')?.remove();const clubs=d.createElement('div');clubs.className='visual-clubs';clubs.innerHTML=['ARS','CHE','LIV','MNC'].map((c,i)=>'<span>'+logo(c,['Arsenal','Chelsea','Liverpool','Man City'][i])+'</span>').join('');hero.insertBefore(clubs,hero.querySelector('.primary'));}}
}
fetch('visual-assets/lucide-icons.json').then(r=>r.json()).then(data=>{
 icons=data;
 const controls=document.createElement('section');controls.className='icon-treatment-controls';controls.style.cssText='max-width:1080px;margin:12px auto;padding:0 24px';controls.innerHTML='<div style="font-size:14px;margin-bottom:8px"><b>Icon treatments</b> · selected: 03 Glossy glass · compare alternatives below · <a href="icon-treatment-options.html">See all five side by side ↗</a></div><div style="display:flex;gap:8px;flex-wrap:wrap">'+names.map((n,i)=>'<button data-icon-choice="'+(i+1)+'" aria-pressed="'+(treatment==String(i+1))+'" style="padding:9px 12px;border:1px solid #81916E;border-radius:10px;background:'+(treatment==String(i+1)?'#B8F34B':'#FFFFFF')+';color:#243128;cursor:pointer">0'+(i+1)+' '+n+'</button>').join('')+'</div>';
 document.querySelector('main').before(controls);
 controls.querySelectorAll('[data-icon-choice]').forEach(b=>b.addEventListener('click',()=>{treatment=b.dataset.iconChoice;document.querySelectorAll('iframe[data-review-theme]').forEach(f=>apply(f));controls.querySelectorAll('button').forEach(n=>{n.setAttribute('aria-pressed',String(n===b));n.style.background=n===b?'#B8F34B':'#FFFFFF';});}));
 document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 let observer;
 function ready(){const d=frame.contentDocument;if(!d?.getElementById('grid'))return;observer?.disconnect();if(!d.getElementById('visual-review-styles')){const link=d.createElement('link');link.rel='stylesheet';link.href='visual-icon-treatments.css';d.head.append(link);const s=d.createElement('style');s.id='visual-review-styles';s.textContent=css;d.head.append(s);}observer=new MutationObserver(()=>apply(frame));observer.observe(d.getElementById('grid'),{childList:true,subtree:true});apply(frame);}
 frame.addEventListener('load',ready);ready();
 });
});
})();
