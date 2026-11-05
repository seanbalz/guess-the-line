(()=>{
'use strict';
const css=".phone[data-home-compact] .home-hero{padding:18px!important}.phone[data-home-compact] .home-hero .kicker{font-size:10px;margin-bottom:5px}.phone[data-home-compact] .home-hero h2{font-size:22px!important;line-height:1.15!important;max-width:none!important;margin:0 0 8px!important}.phone[data-home-compact] .home-hero .visual-progress{margin:8px 0 12px;gap:14px}.phone[data-home-compact] .home-hero .visual-dial,.phone[data-home-compact] .home-hero .visual-dial svg{width:60px;height:60px}.phone[data-home-compact] .home-hero .visual-dial b{font-size:16px}.phone[data-home-compact] .home-hero .visual-progress>span{font-size:14px}.phone[data-home-compact] .home-hero .primary{margin:0!important;min-height:44px}";
document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 let observer;
 function apply(){const d=frame.contentDocument,p=d?.querySelector('.phone');if(!p)return;p.dataset.homeCompact='true';const h=p.querySelector('.home-hero h2');if(h&&h.textContent!=='Finish your picks')h.textContent='Finish your picks';}
 function ready(){const d=frame.contentDocument;if(!d?.getElementById('grid'))return;observer?.disconnect();if(!d.getElementById('selected-home-compact-css')){const style=d.createElement('style');style.id='selected-home-compact-css';style.textContent=css;d.head.append(style);}observer=new MutationObserver(apply);observer.observe(d.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);ready();
});
})();
