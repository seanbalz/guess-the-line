(()=>{
'use strict';
const css=`
.phone[data-mood] .panel::before,.phone[data-mood] .quick::before,.phone[data-mood] .pick-card::before,.phone[data-mood] .app-nav::before{background:var(--mood-edge)!important}
.phone[data-mood] .hero{background:var(--mood-hero)!important}
.phone[data-mood] .hero::before{background:var(--mood-heroEdge)!important}
.phone[data-mood] .home-score .metric,.phone[data-mood] .about-grid div{background:var(--mood-metric)!important;border-color:var(--mood-line)!important}
@media(prefers-reduced-transparency:reduce){.phone[data-mood] .hero,.phone[data-mood] .home-score .metric,.phone[data-mood] .about-grid div{background:#303138!important}}
@media(forced-colors:active){.phone[data-mood] .hero,.phone[data-mood] .home-score .metric,.phone[data-mood] .about-grid div{background:Canvas!important;border-color:CanvasText!important}.phone[data-mood] .panel::before,.phone[data-mood] .quick::before,.phone[data-mood] .pick-card::before,.phone[data-mood] .app-nav::before{display:none}}
`;
document.querySelectorAll('iframe[data-mood-id]').forEach(frame=>{
 const settings=JSON.parse(frame.dataset.moodSettings);let observer;
 function apply(){const phone=frame.contentDocument?.querySelector('.phone.prism');if(!phone)return;phone.dataset.mood=frame.dataset.moodId;for(const [key,value]of Object.entries(settings))phone.style.setProperty('--mood-'+key,value);}
 function ready(){const doc=frame.contentDocument;if(!doc?.getElementById('grid'))return;observer?.disconnect();if(!doc.getElementById('mood-styles')){const style=doc.createElement('style');style.id='mood-styles';style.textContent=css;doc.head.append(style);}observer=new MutationObserver(apply);observer.observe(doc.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);if(frame.contentDocument?.querySelector('.phone'))ready();
});
})();
