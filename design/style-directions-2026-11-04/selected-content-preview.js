(()=>{
'use strict';
const css=`
.phone[data-content-preview] .quick.content-quick{min-height:164px;gap:9px;justify-content:flex-start}
.phone[data-content-preview] .content-quick>strong{font-size:16px}
.phone[data-content-preview] .quick.content-quick>span{font-size:13px;line-height:1.4}
.phone[data-content-preview] .quick.content-quick .content-body{color:var(--ink);font-size:16px;font-weight:500}
.phone[data-content-preview] .quick.content-quick em{margin-top:auto}
.phone[data-content-preview] .quick.content-quick .mini-big{font-size:28px;line-height:1.1;color:var(--accent);font-weight:600;letter-spacing:-.7px}
.phone[data-content-preview] .mini-big small{font-size:14px;font-weight:500;letter-spacing:0}
.phone[data-content-preview] .mini-chart{width:100%;height:48px;color:var(--accent);display:block;flex-shrink:0}
.phone[data-content-preview] .mini-comparison{display:flex;gap:12px;justify-content:space-between}
.phone[data-content-preview] .mini-comparison>span{display:flex;flex-direction:column;gap:5px;font-size:13px;color:var(--muted)}
.phone[data-content-preview] .mini-comparison b{font-size:22px;font-weight:600;letter-spacing:-.5px;color:var(--ink)}
.phone[data-content-preview] .matchup-summary{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:10px;padding:14px 0;margin:8px 0 14px;border-block:1px solid var(--line)}
.phone[data-content-preview] .matchup-summary>div{min-width:0}
.phone[data-content-preview] .matchup-summary strong{display:block;font-size:16px;font-weight:600;line-height:1.3;letter-spacing:-.25px}
.phone[data-content-preview] .matchup-summary small{display:block;color:var(--muted);font-size:12px;margin-bottom:5px}
.phone[data-content-preview] .matchup-summary .at{font-size:15px;color:var(--muted)}
.phone[data-content-preview] .pick-card.content-pick{min-height:178px}
.phone[data-content-preview] .content-pick .pick-team{display:block;font-size:16px;font-weight:500;line-height:1.4;color:var(--ink)}
.phone[data-content-preview] .content-pick b{font-size:20px;margin:12px 0 8px}
.phone[data-content-preview] .content-pick small{font-size:12px;line-height:1.4}
.phone[data-content-preview] .content-subtitle{font-size:13px;color:var(--muted);line-height:1.5}
`;
const matchup=()=>'<div><small>Away</small><strong>Seattle<br>Seahawks</strong></div><span class="at">@</span><div><small>Home</small><strong>Denver<br>Broncos</strong></div>';
const chart='<svg class="mini-chart" viewBox="0 0 280 90" aria-hidden="true"><path d="M12 82L72 65L130 69L195 37L267 17L267 89L12 89Z" fill="currentColor" opacity=".09"/><path d="M12 82L72 65L130 69L195 37L267 17" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="267" cy="17" r="4" fill="currentColor"/></svg>';
const league='<strong>League</strong><span>Your community</span><span class="mini-big">02 <small>/ 24</small></span><span>Sample community rank</span><em aria-hidden="true">↗</em>';
const researchCards={
 'detail:games':'<strong>Games</strong><span class="content-body">Seattle at Denver</span><span>Spread · Total</span><span>Open the sample matchup</span><em aria-hidden="true">↗</em>',
 'detail:trends':'<strong>Trends</strong>'+chart+'<span>Sample trend · Weeks 1–5</span><em aria-hidden="true">↗</em>',
 'detail:fantasy':'<strong>Fantasy</strong><span>Targets · sample comparison</span><span class="mini-comparison"><span>Player A<b>8.0</b></span><span>Player B<b>6.5</b></span></span><em aria-hidden="true">↗</em>',
 'detail:teams':'<strong>Teams</strong><span class="content-body">Seattle Seahawks</span><span class="content-body">Denver Broncos</span><span>Open team profiles</span><em aria-hidden="true">↗</em>'
};
document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 let observer;
 function apply(){
  const doc=frame.contentDocument,phone=doc?.querySelector('.phone');if(!phone)return;
  phone.dataset.contentPreview='v1';const screen=phone.querySelector('.screen'),area=doc.getElementById('screen')?.value;
  if(screen.dataset.contentPreview)return;screen.dataset.contentPreview='true';
  if(!['Home','Play','Bets','Research'].includes(area))return;
  screen.querySelectorAll('.field').forEach(field=>{const summary=doc.createElement('div');summary.className='matchup-summary';summary.setAttribute('aria-label','Sample matchup: Seattle Seahawks at Denver Broncos');summary.innerHTML=matchup();field.replaceWith(summary);});
  if(screen.querySelector('.detail-close'))return;
  screen.querySelectorAll('button.quick').forEach(button=>{
   const action=button.dataset.action;let content;
   if(action==='detail:league')content=league;
   else if(area==='Home'&&action==='Research')content='<strong>Research</strong><span class="content-body">Seattle at Denver</span><span>Matchups · trends · usage</span><span>Open the sample notebook</span><em aria-hidden="true">↗</em>';
   else if(area==='Research')content=researchCards[action];
   if(content){button.classList.add('content-quick');button.innerHTML=content;}
  });
  if(area==='Play')screen.querySelectorAll('button.pick-card').forEach(button=>{
   button.classList.add('content-pick');
   if(button.dataset.action==='detail:spread')button.innerHTML='<small>Spread · sample</small><span class="pick-team">Seattle Seahawks</span><span class="pick-team">at Denver Broncos</span><b>Your draft</b><small>Open saved guess ↗</small>';
   if(button.dataset.action==='detail:total')button.innerHTML='<small>Total · sample</small><span class="pick-team">Chicago Bears</span><span class="pick-team">at Detroit Lions</span><b>To pick</b><small>Choose your number ↗</small>';
  });
  if(area==='Bets'){
   const action=screen.querySelector('[data-action="detail:recommendations"]');
   if(action){const panel=action.closest('.panel'),summary=doc.createElement('div');summary.className='matchup-summary';summary.setAttribute('aria-label','Sample research matchup: Seattle Seahawks at Denver Broncos');summary.innerHTML=matchup();panel.insertBefore(summary,action);const paragraph=panel.querySelector('p');if(paragraph){paragraph.classList.add('content-subtitle');paragraph.textContent='Sample matchup research · Spread and Total.';}}
  }
 }
 function ready(){const doc=frame.contentDocument;if(!doc?.getElementById('grid'))return;observer?.disconnect();if(!doc.getElementById('selected-content-styles')){const style=doc.createElement('style');style.id='selected-content-styles';style.textContent=css;doc.head.append(style);}observer=new MutationObserver(apply);observer.observe(doc.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);if(frame.contentDocument?.querySelector('.phone'))ready();
});
})();
