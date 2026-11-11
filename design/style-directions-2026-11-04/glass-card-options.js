(()=>{
'use strict';
const css=`
.phone[data-card-skin] .panel,.phone[data-card-skin] .quick,.phone[data-card-skin] .pick-card,.phone[data-card-skin] .app-nav{
 background:var(--card-fill)!important;border-color:var(--card-border)!important;
 backdrop-filter:blur(var(--card-blur)) saturate(140%)!important;-webkit-backdrop-filter:blur(var(--card-blur)) saturate(140%)!important;
 box-shadow:var(--card-shadow)!important}
.phone[data-card-skin] .panel,.phone[data-card-skin] .quick,.phone[data-card-skin] .pick-card{border-radius:var(--card-radius)!important}
.phone[data-card-skin] .panel::before,.phone[data-card-skin] .quick::before,.phone[data-card-skin] .pick-card::before,.phone[data-card-skin] .app-nav::before{opacity:var(--card-gloss)}
@media(prefers-reduced-transparency:reduce){.phone[data-card-skin] .panel,.phone[data-card-skin] .quick,.phone[data-card-skin] .pick-card,.phone[data-card-skin] .app-nav{background:#303138!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}
@media(forced-colors:active){.phone[data-card-skin] .panel,.phone[data-card-skin] .quick,.phone[data-card-skin] .pick-card,.phone[data-card-skin] .app-nav{background:Canvas!important;border:1px solid CanvasText!important;box-shadow:none!important}}
`;
document.querySelectorAll('iframe[data-card-id]').forEach(frame=>{
 const settings=JSON.parse(frame.dataset.cardSettings);if(!settings)return;
 let observer;
 function apply(){const phone=frame.contentDocument?.querySelector('.phone.prism');if(!phone)return;phone.dataset.cardSkin=frame.dataset.cardId;for(const [key,value]of Object.entries(settings))phone.style.setProperty('--card-'+key,value);}
 function ready(){const doc=frame.contentDocument;if(!doc?.getElementById('grid'))return;observer?.disconnect();if(!doc.getElementById('card-skin-styles')){const style=doc.createElement('style');style.id='card-skin-styles';style.textContent=css;doc.head.append(style);}observer=new MutationObserver(apply);observer.observe(doc.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);if(frame.contentDocument?.querySelector('.phone'))ready();
});
})();
