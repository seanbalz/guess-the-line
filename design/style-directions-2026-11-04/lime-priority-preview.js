(()=>{
'use strict';
const css=`
.phone[data-lime-priority] .screen{height:780px!important;min-height:780px!important}
.phone[data-lime-priority] .home-hero,.phone[data-lime-priority] .pick-card,.phone[data-lime-priority] .panel:has(> [data-action="detail:tracking"]),.phone[data-lime-priority] .panel:has(> .primary[data-action="detail:draft"]){background:linear-gradient(135deg,#B8F34B26 0%,#B8F34B0D 58%,#B8F34B12 100%)!important;border-color:#B8F34BA6!important;box-shadow:var(--card-shadow),0 0 18px #B8F34B0B!important}
.phone[data-lime-priority] .home-hero::before,.phone[data-lime-priority] .pick-card::before,.phone[data-lime-priority] .panel:has(> [data-action="detail:tracking"])::before,.phone[data-lime-priority] .panel:has(> .primary[data-action="detail:draft"])::before{background:linear-gradient(130deg,#E0FFADE6,#B8F34B26 42%,#B8F34B14 65%,#B8F34BA6)!important}
.phone[data-lime-priority] .home-hero .kicker{color:#B8F34B!important}
.phone[data-lime-priority] .home-score .metric{background:linear-gradient(135deg,#B8F34B14,#B8F34B09)!important;border-color:#B8F34B70!important;box-shadow:inset 0 1px 0 #D9FFA326,0 4px 10px #00000024!important}
.phone[data-lime-priority] .home-score .metric b,.phone[data-lime-priority] .panel:has(> .caption) > .big-number{color:#B8F34B!important}
.phone[data-lime-priority] .panel:has(> .caption):has(> .big-number){border-color:#B8F34B70!important}
@media(prefers-reduced-transparency:reduce){.phone[data-lime-priority] .home-hero,.phone[data-lime-priority] .pick-card,.phone[data-lime-priority] .home-score .metric,.phone[data-lime-priority] .panel:has(> [data-action="detail:tracking"]),.phone[data-lime-priority] .panel:has(> .primary[data-action="detail:draft"]){background:#30382A!important}}
@media(forced-colors:active){.phone[data-lime-priority] .home-hero,.phone[data-lime-priority] .pick-card,.phone[data-lime-priority] .home-score .metric,.phone[data-lime-priority] .panel:has(> [data-action="detail:tracking"]),.phone[data-lime-priority] .panel:has(> .primary[data-action="detail:draft"]){background:Canvas!important;border-color:CanvasText!important;box-shadow:none!important}.phone[data-lime-priority] .home-score .metric b,.phone[data-lime-priority] .home-hero .kicker,.phone[data-lime-priority] .panel:has(> .caption) > .big-number{color:CanvasText!important}}
`;
document.querySelectorAll('iframe[data-lime-priority]').forEach(frame=>{
 let observer;
 function apply(){const phone=frame.contentDocument?.querySelector('.phone.prism');if(phone)phone.dataset.limePriority='true';}
 function ready(){const doc=frame.contentDocument;if(!doc?.getElementById('grid'))return;observer?.disconnect();if(!doc.getElementById('lime-priority-styles')){const style=doc.createElement('style');style.id='lime-priority-styles';style.textContent=css;doc.head.append(style);}observer=new MutationObserver(apply);observer.observe(doc.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);if(frame.contentDocument?.querySelector('.phone'))ready();
});
})();
