(()=>{
'use strict';
const css=`
.phone[data-light-review]{background:var(--light-background)!important;color-scheme:light;height:var(--light-device-height);display:flex;flex-direction:column}
.phone[data-light-review]>.device-status,.phone[data-light-review]>.app-head,.phone[data-light-review]>.app-nav,.phone[data-light-review]>.fixture{flex-shrink:0}
.phone[data-light-review] .brand-name{display:none}
.phone[data-light-review] .g-mark.selected-light-hybrid{width:52px;height:42px;object-fit:contain}
.phone[data-light-review] .screen{flex:1;height:auto!important;min-height:0!important}
.phone[data-light-review] .home-hero,.phone[data-light-review] .pick-card,.phone[data-light-review] .panel:has(> [data-action="detail:tracking"]),.phone[data-light-review] .panel:has(> .primary[data-action="detail:draft"]){background:linear-gradient(135deg,#FFFFFFC7,#B8F34B26 62%,#FFFFFF80)!important;border-color:#739B3E80!important}
.phone[data-light-review] .home-hero::before,.phone[data-light-review] .pick-card::before{background:linear-gradient(130deg,#FFFFFF,#B8F34B33 45%,#FFFFFFB3)!important}
.phone[data-light-review] .home-score .metric{background:linear-gradient(135deg,#B8F34B26,#FFFFFF80)!important;border-color:#739B3E73!important;box-shadow:inset 0 1px 0 #FFFFFF!important}
.phone[data-light-review] .home-score .metric b,.phone[data-light-review] .home-hero .kicker,.phone[data-light-review] .panel:has(> .caption) > .big-number{color:#3B6309!important}
.phone[data-light-review] .panel:has(> .caption):has(> .big-number){border-color:#739B3E73!important}
.phone[data-light-review] .primary:focus-visible,.phone[data-light-review] .secondary:focus-visible{outline-color:#365A0E}
@media(prefers-reduced-transparency:reduce){.phone[data-light-review] .panel,.phone[data-light-review] .quick,.phone[data-light-review] .pick-card,.phone[data-light-review] .app-nav,.phone[data-light-review] .home-score .metric{background:#FFFFFF!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;border-color:#7C8C7A!important}}
@media(forced-colors:active){.phone[data-light-review] .panel,.phone[data-light-review] .quick,.phone[data-light-review] .pick-card,.phone[data-light-review] .app-nav,.phone[data-light-review] .home-score .metric{background:Canvas!important;border-color:CanvasText!important;box-shadow:none!important}.phone[data-light-review] .home-score .metric b,.phone[data-light-review] .home-hero .kicker,.phone[data-light-review] .panel:has(> .caption) > .big-number{color:CanvasText!important}}
`;
document.querySelectorAll('iframe[data-light-settings]').forEach(frame=>{
 const c=JSON.parse(frame.dataset.lightSettings);let observer;
 function apply(){
  const doc=frame.contentDocument,phone=doc?.querySelector('.phone.prism');if(!phone)return;
  phone.dataset.lightReview=c.id;
  const vars={'--light-background':c.wash,'--pc-scheme':'light','--pc-bg':c.background,'--pc-ink':c.ink,'--pc-muted':c.muted,'--pc-accent':c.accentInk,'--pc-on-accent':'#101B0A','--pc-tint':'#B8F34B1F','--pc-line':'#334D2B26','--pc-surface-1':'#FFFFFFC7','--pc-surface-2':'#FFFFFF66','--pc-surface-3':'#FFFFFFA6','--pc-small-surface':'#FFFFFF66','--pc-active-surface':'#FFFFFFC7','--pc-border':'#82947F66','--pc-edge-1':'#FFFFFF','--pc-edge-2':'#FFFFFF66','--pc-shadow':'#20302426','--pc-track':'#3B630926','--pc-field':'#3B630914','--pc-button-top':'#6E9A25','--pc-button-bottom':'#3B6309','--pc-button-border':'#3B6309','--pc-button-edge':'#FFFFFFCC'};
  for(const [key,value]of Object.entries(vars))phone.style.setProperty(key,value);
  phone.style.setProperty('--light-device-height',frame.clientHeight+'px');
  const old=phone.querySelector('svg.g-mark');if(old){const image=doc.createElement('img');image.src=c.logo;image.className='g-mark selected-light-hybrid';image.alt='Guess the Line — deep-green glossy/frosted G, proposed light-mode adaptation';old.replaceWith(image);}
 }
 function ready(){const doc=frame.contentDocument;if(!doc?.getElementById('grid'))return;observer?.disconnect();if(!doc.getElementById('light-review-styles')){const style=doc.createElement('style');style.id='light-review-styles';style.textContent=css;doc.head.append(style);}observer=new MutationObserver(apply);observer.observe(doc.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);if(frame.contentDocument?.querySelector('.phone'))ready();
});
})();
