(()=>{
'use strict';
const $=id=>document.getElementById(id),frames=[...document.querySelectorAll('iframe[data-review-theme]')],key='gtl-selected-system-notes-v1';
let config,currentScreen='Home',currentLayer='overview',notes={},version=0;
try{const value=JSON.parse(localStorage.getItem(key)||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))notes=value;}catch{}
const noteKey=()=>currentScreen+'/'+currentLayer;
function controls(){
 document.querySelectorAll('[data-screen]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.screen===currentScreen)));
 const select=$('review-layer');select.replaceChildren();
 for(const state of config.routes[currentScreen]){const option=document.createElement('option');option.value=state.id;option.textContent=state.name;select.append(option);}
 select.value=currentLayer;select.disabled=false;
 $('view-notes').value=typeof notes[noteKey()]==='string'?notes[noteKey()]:'';
}
async function show(screen,layer='overview'){
 const token=++version;currentScreen=screen;currentLayer=layer;controls();
 const state=config.routes[screen].find(x=>x.id===layer);$('load-status').textContent='Opening '+screen+' · '+state.name+'…';
 try{
  for(const frame of frames){
   const doc=frame.contentDocument;frame.contentWindow.GTL_STYLE_REVIEW.setView(screen,'prism');
   for(const action of state.actions){const button=doc.querySelector('[data-action="'+action+'"]');if(!button)throw Error('This sample layer is unavailable: '+action);button.click();}
   doc.querySelector('.screen').scrollTop=0;
  }
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  if(token!==version)return;
  history.replaceState(null,'','?screen='+encodeURIComponent(screen)+'&layer='+encodeURIComponent(layer));
  $('load-status').textContent=screen+' · '+state.name+' · matching dark and light views';
 }catch(error){$('load-status').textContent=error.message;}
}
function prepare(frame){
 return new Promise((resolve,reject)=>{
  let complete=false;
  const timer=setTimeout(()=>{if(!complete)reject(Error('Preview loading took too long. Refresh this page to retry.'));},20000);
  function ready(){
   if(complete||!frame.contentWindow?.GTL_STYLE_REVIEW||!frame.contentDocument?.querySelector('.phone'))return;
   complete=true;clearTimeout(timer);const doc=frame.contentDocument;
   if(!doc.getElementById('system-review-sizing')){const style=doc.createElement('style');style.id='system-review-sizing';style.textContent='.phone[data-system-review]{height:850px;display:flex;flex-direction:column}.phone[data-system-review]>.device-status,.phone[data-system-review]>.app-head,.phone[data-system-review]>.app-nav,.phone[data-system-review]>.fixture{flex-shrink:0}.phone[data-system-review] .screen{flex:1;height:auto!important;min-height:0!important}.phone[data-system-review] .system-table-scroll{max-width:100%;overflow-x:auto;border-radius:8px}.phone[data-system-review] .system-table-scroll:focus-visible{outline:3px solid currentColor;outline-offset:3px}.phone[data-system-review] .standings{min-width:260px;font-variant-numeric:tabular-nums}.phone[data-system-review] .standings thead th{font-size:13px}.phone[data-system-review] .standings tbody th,.phone[data-system-review] .standings tbody td{font-size:16px;white-space:nowrap}';doc.head.append(style);}
   const apply=()=>{const phone=doc.querySelector('.phone');if(!phone)return;phone.dataset.systemReview='true';phone.querySelectorAll('.standings').forEach(table=>{if(table.parentElement.classList.contains('system-table-scroll'))return;const region=doc.createElement('div');region.className='system-table-scroll';region.tabIndex=0;region.setAttribute('role','region');region.setAttribute('aria-label',(table.closest('.panel')?.querySelector('h3')?.textContent||'Comparison')+' table; scroll horizontally if needed');table.before(region);region.append(table);});};new MutationObserver(apply).observe(doc.getElementById('grid'),{childList:true,subtree:true});apply();resolve();
  }
  frame.addEventListener('load',ready);ready();
 });
}
$('view-notes').addEventListener('input',()=>{
 notes[noteKey()]=$('view-notes').value.slice(0,10000);
 try{localStorage.setItem(key,JSON.stringify(notes));$('review-status').textContent='Notes saved in this browser for '+currentScreen+' · '+currentLayer+'.';}catch{$('review-status').textContent='Browser storage unavailable. Export notes to keep them.';}
});
$('export-review').addEventListener('click',()=>{
 const data={kind:'GTL_SELECTED_SYSTEM_REVIEW_NOTES',version:1,scope:'Local visual notes; not approval, production acceptance or a release',view:{screen:currentScreen,layer:currentLayer},notes};
 const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='gtl-selected-system-review-notes.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('review-layer').addEventListener('change',event=>show(currentScreen,event.target.value));
(async()=>{
 try{
  const response=await fetch('selected-system-review.json');if(!response.ok)throw Error('Review settings could not load. Refresh to retry.');config=await response.json();
  await Promise.all(frames.map(prepare));
  for(const screen of Object.keys(config.routes)){const button=document.createElement('button');button.type='button';button.dataset.screen=screen;button.textContent=screen;button.setAttribute('aria-pressed','false');button.addEventListener('click',()=>show(screen));$('screen-buttons').append(button);}
  const query=new URLSearchParams(location.search),screen=Object.hasOwn(config.routes,query.get('screen'))?query.get('screen'):'Home',layer=config.routes[screen].some(s=>s.id===query.get('layer'))?query.get('layer'):'overview';
  await show(screen,layer);
 }catch(error){$('load-status').textContent=error.message;$('load-status').setAttribute('role','alert');}
})();
})();
