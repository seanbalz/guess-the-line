(()=>{
'use strict';
const css=`
.phone[data-button-skin] .primary{position:relative;isolation:isolate;overflow:hidden;background:var(--button-fill)!important;color:var(--button-ink)!important;border:var(--button-border)!important;border-radius:var(--button-radius)!important;box-shadow:var(--button-shadow)!important;min-height:48px;transition:transform 120ms ease,filter 120ms ease}
.phone[data-button-skin] .primary::before{content:"";position:absolute;inset:1px 2px auto;height:42%;background:linear-gradient(#FFFFFFB3,#FFFFFF00);border-radius:inherit;opacity:var(--button-shine);pointer-events:none;z-index:-1}
.phone[data-button-skin] .secondary{border-radius:var(--button-secondaryRadius)!important;box-shadow:var(--button-secondaryShadow)!important;min-height:44px}
.phone[data-button-skin] .primary:focus-visible,.phone[data-button-skin] .secondary:focus-visible{outline:3px solid #E9F8CC;outline-offset:3px}
.phone[data-button-skin] .primary:active:not(:disabled){transform:translateY(1px) scale(.99)}
.phone[data-button-skin] .primary:disabled{opacity:.45;cursor:default}
@media(hover:hover){.phone[data-button-skin] .primary:hover:not(:disabled){filter:brightness(1.05)}}
@media(prefers-reduced-motion:reduce){.phone[data-button-skin] .primary{transition:none}.phone[data-button-skin] .primary:active:not(:disabled){transform:none}}
@media(forced-colors:active){.phone[data-button-skin] .primary,.phone[data-button-skin] .secondary{background:ButtonFace!important;color:ButtonText!important;border:2px solid ButtonText!important;box-shadow:none!important}.phone[data-button-skin] .primary::before{display:none}}
`;
document.querySelectorAll('iframe[data-button-id]').forEach(frame=>{
 const settings=JSON.parse(frame.dataset.buttonSettings);if(!settings)return;
 let observer;
 function apply(){const phone=frame.contentDocument?.querySelector('.phone.prism');if(!phone)return;phone.dataset.buttonSkin=frame.dataset.buttonId;for(const [key,value]of Object.entries(settings))phone.style.setProperty('--button-'+key,value);}
 function ready(){const doc=frame.contentDocument;if(!doc?.getElementById('grid'))return;observer?.disconnect();if(!doc.getElementById('button-skin-styles')){const style=doc.createElement('style');style.id='button-skin-styles';style.textContent=css;doc.head.append(style);}observer=new MutationObserver(apply);observer.observe(doc.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);if(frame.contentDocument?.querySelector('.phone'))ready();
});
})();
