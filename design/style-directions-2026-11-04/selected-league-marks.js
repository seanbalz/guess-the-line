(()=>{
'use strict';
// Presentation-only adapter: keep each original button and its action/state.
const css=`
.phone [data-league-mark-group]{display:flex!important;align-items:center;justify-content:center;gap:8px!important;flex-wrap:nowrap;width:max-content!important;max-width:100%;padding:4px!important;margin-inline:auto;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}
.phone [data-league-mark-group]{--lm-face:linear-gradient(135deg,#FFFFFF14,#FFFFFF06);--lm-edge:#FFFFFF38;--lm-gloss:#FFFFFF80;--lm-shadow:0 4px 6px #00000070,0 18px 28px #000000A6;--lm-accent:#B8F34B;--lm-tint:#B8F34B20;--lm-pl:url('visual-assets/league-marks/premier-league-white.svg')}
.phone [data-league-mark-theme=light]{--lm-face:linear-gradient(135deg,#FFFFFFC7,#FFFFFF66);--lm-edge:#FFFFFFD9;--lm-gloss:#FFFFFF;--lm-shadow:0 4px 6px #20302412,0 18px 28px #20302424;--lm-accent:#3B6309;--lm-tint:#B8F34B28;--lm-pl:url('visual-assets/league-marks/premier-league-purple.svg')}
.phone [data-league-mark]{display:grid!important;place-items:center;position:relative;flex:0 0 52px!important;width:52px!important;height:52px!important;min-width:52px!important;min-height:52px!important;max-width:52px!important;padding:9px!important;border:1px solid var(--lm-edge)!important;border-radius:50%!important;background:var(--lm-face)!important;box-shadow:inset 0 1px 0 var(--lm-gloss),var(--lm-shadow)!important;backdrop-filter:blur(18px);font-size:0!important;line-height:0!important;letter-spacing:0!important;overflow:visible!important}
.phone [data-league-mark]::before{content:""!important;display:block;width:30px;height:32px;background-position:center;background-size:contain;background-repeat:no-repeat;box-shadow:none;border:0;border-radius:0;position:static;opacity:1}
.phone [data-league-mark=nfl]::before{background-image:url('visual-assets/league-marks/nfl.png')}
.phone [data-league-mark=epl]::before{background-image:var(--lm-pl)}
.phone [data-league-mark][aria-pressed=true]{border:2px solid var(--lm-accent)!important;background:linear-gradient(var(--lm-tint),var(--lm-tint)),var(--lm-face)!important;box-shadow:inset 0 1px 0 var(--lm-gloss),0 0 0 3px var(--lm-tint),var(--lm-shadow)!important}
.phone [data-league-mark]:focus-visible{outline:3px solid var(--lm-accent)!important;outline-offset:4px!important}
`;
function attr(node,key,value){if(node.getAttribute(key)!==value)node.setAttribute(key,value);}
document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 let observer;
 function apply(){const d=frame.contentDocument;if(!d?.querySelector('.phone'))return;
  for(const group of d.querySelectorAll('.sport-switch,.gx-sport-controls .gx-seg')){
   attr(group,'data-league-mark-group','02');attr(group,'data-league-mark-theme',frame.dataset.reviewTheme);attr(group,'role','group');attr(group,'aria-label','Sport');
   for(const button of group.querySelectorAll('button')){const text=button.textContent.trim(),code=text==='NFL'?'nfl':text==='EPL'?'epl':null;if(!code)continue;const name=code==='nfl'?'National Football League':'Premier League';attr(button,'data-league-mark',code);attr(button,'aria-label',name);attr(button,'title',name);if(group.classList.contains('sport-switch'))attr(button,'aria-pressed',String(button.classList.contains('on')));}
  }
 }
 function ready(){const d=frame.contentDocument,grid=d?.getElementById('grid');if(!grid)return;observer?.disconnect();if(!d.getElementById('selected-league-marks-css')){const style=d.createElement('style');style.id='selected-league-marks-css';style.textContent=css;d.head.append(style);}observer=new MutationObserver(apply);observer.observe(grid,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-pressed']});apply();}
 frame.addEventListener('load',ready);ready();
});
})();
