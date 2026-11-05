(()=>{
'use strict';
const common={
 '--pc-ink':'#F5F7FB','--pc-muted':'#BAC6D8','--pc-accent':'#B8F34B','--pc-on-accent':'#101B0A',
 '--pc-tint':'#FFFFFF0F','--pc-line':'#FFFFFF24','--pc-surface-1':'#FFFFFF18','--pc-surface-2':'#FFFFFF0C','--pc-surface-3':'#FFFFFF14',
 '--pc-small-surface':'#FFFFFF0D','--pc-active-surface':'#FFFFFF20','--pc-border':'#FFFFFF30','--pc-edge-1':'#FFFFFF80','--pc-edge-2':'#FFFFFF16',
 '--pc-shadow':'#00000080','--pc-track':'#B8F34B33','--pc-field':'#FFFFFF10','--pc-button-top':'#D0FA88','--pc-button-bottom':'#B8F34B',
 '--pc-button-border':'#E2FFB870','--pc-button-edge':'#FFFFFF90'
};
document.querySelectorAll('iframe[data-background]').forEach(frame=>{
 let observer;
 function apply(){
  const doc=frame.contentDocument,phone=doc?.querySelector('.phone.prism');if(!phone)return;
  phone.dataset.backgroundReview='true';phone.style.background=frame.dataset.background;
  phone.style.setProperty('--pc-bg',frame.dataset.background);
  for(const [key,value]of Object.entries(common))phone.style.setProperty(key,value);
  const old=phone.querySelector('svg.g-mark');
  if(old){const image=doc.createElement('img');image.src='logo-hybrid/lime.svg';image.className='g-mark selected-hybrid';image.alt='Guess the Line — selected lime glossy/frosted G';old.replaceWith(image);}
 }
 function ready(){
  const doc=frame.contentDocument;if(!doc?.querySelector('#grid'))return;
  observer?.disconnect();
  if(!doc.getElementById('background-review-styles')){const style=doc.createElement('style');style.id='background-review-styles';style.textContent='.phone[data-background-review]{background-image:none!important}.phone[data-background-review] .brand-name{display:none}.phone[data-background-review] .g-mark.selected-hybrid{width:52px;height:42px;object-fit:contain}.phone[data-background-review] .screen{height:600px!important;min-height:600px!important}';doc.head.append(style);}
  observer=new MutationObserver(apply);observer.observe(doc.getElementById('grid'),{childList:true,subtree:true});apply();
 }
 frame.addEventListener('load',ready);if(frame.contentDocument?.querySelector('.phone'))ready();
});
})();
