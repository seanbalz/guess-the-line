(()=>{
'use strict';
// Display wording only: retain source routes, option values and native controls.
const excluded='script,style,textarea,input,select,option,code,pre,[contenteditable=true],.sport-switch,.gx-sport-controls,[data-league-mark-group]';
const attributeExcluded='script,style,code,pre,[contenteditable=true],.sport-switch,.gx-sport-controls,[data-league-mark-group]';
const expand=text=>text.replace(/\bNFL\b/g,'National Football League').replace(/\bEPL\b/g,'Premier League');
document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 let observer;
 function apply(){const d=frame.contentDocument,phone=d?.querySelector('.phone');if(!phone)return;
  const walker=d.createTreeWalker(phone,NodeFilter.SHOW_TEXT);let node;
  while((node=walker.nextNode())){if(node.parentElement?.closest(excluded))continue;const value=expand(node.nodeValue);if(value!==node.nodeValue)node.nodeValue=value;}
  for(const element of phone.querySelectorAll('[aria-label],[title],[placeholder],[alt]')){
   if(element.closest(attributeExcluded))continue;
   for(const name of ['aria-label','title','placeholder','alt']){const current=element.getAttribute(name);if(current!==null){const value=expand(current);if(value!==current)element.setAttribute(name,value);}}
  }
 }
 function ready(){const grid=frame.contentDocument?.getElementById('grid');if(!grid)return;observer?.disconnect();observer=new MutationObserver(apply);observer.observe(grid,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['aria-label','title','placeholder','alt']});apply();}
 frame.addEventListener('load',ready);ready();
});
})();
