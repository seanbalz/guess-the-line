(()=>{
const palettes=window.GTL_PRISM_PALETTES.filter(p=>document.body.dataset.round==='2'?p.round===2:p.round!==2), root=document.getElementById('palette-grid');
const key='gtl-prism-color-favorites-v1';let choices={};
try{const value=JSON.parse(localStorage.getItem(key)||'{}');if(value&&typeof value==='object')choices=value;}catch{}
const cardControl=document.getElementById('card-colors');let varied=new URLSearchParams(location.search).get('cards')==='varied';if(cardControl)cardControl.checked=varied;
const screen=document.getElementById('palette-screen'), filter=document.getElementById('palette-filter'), status=document.getElementById('palette-status');
function previewUrl(id,embedded=false){const q=new URLSearchParams({style:'prism',screen:screen.value,palette:id,cards:varied?'varied':'uniform'});if(embedded){q.set('embed','1');q.set('swatch','1');}return 'prism.html?'+q.toString();}
function refreshScreens(){root.querySelectorAll('.palette-card').forEach(card=>{card.querySelector('iframe').src=previewUrl(card.dataset.palette,true);card.querySelector('.preview-link').href=previewUrl(card.dataset.palette);});}
function persist(){try{localStorage.setItem(key,JSON.stringify(choices));status.textContent='Palette preferences saved in this browser.';}catch{status.textContent='Export to keep your preferences; browser storage unavailable.';}}
function update(){
 let visible=0;
 root.querySelectorAll('.palette-card').forEach(card=>{
  const p=palettes.find(p=>p.id===card.dataset.palette);
  card.hidden=Boolean(filter.value==='favorites'?!choices[p.id]?.favorite:filter.value&&filter.value!==p.mode);
  if(!card.hidden)visible++;
  const button=card.querySelector('[data-favorite]');button.setAttribute('aria-pressed',String(Boolean(choices[p.id]?.favorite)));button.textContent=(choices[p.id]?.favorite?'★ Saved ':'☆ Save ')+String(p.number).padStart(2,'0');
 });
 document.getElementById('palette-count').textContent=visible+' schemes · '+palettes.filter(p=>choices[p.id]?.favorite).length+' favorites';
}
for(const p of palettes){
 const card=document.createElement('article');card.className='palette-card';card.dataset.palette=p.id;
 const heading=document.createElement('h2');heading.textContent=String(p.number).padStart(2,'0')+' / '+p.name;
 const descriptor=document.createElement('div');descriptor.className='palette-meta';descriptor.textContent=p.mode==='dark'?'Dark glass':'Light glass';
 const frame=document.createElement('iframe');frame.title=p.name+' Prism Glass mockup';frame.src=previewUrl(p.id,true);
 const colors=document.createElement('div');colors.className='palette-swatches';
 for(const color of [p.background,p.glow,p.accent,p.ink]){const dot=document.createElement('span');dot.style.background=color;dot.setAttribute('aria-label',color);colors.append(dot);}
 const actions=document.createElement('div');actions.className='palette-actions';
 const link=document.createElement('a');link.className='preview-link';link.textContent='Explore this palette ↗';link.href=previewUrl(p.id);
 const favorite=document.createElement('button');favorite.className='board-button';favorite.dataset.favorite=p.id;favorite.addEventListener('click',()=>{choices[p.id]={...choices[p.id],favorite:!choices[p.id]?.favorite};persist();update();});
 const label=document.createElement('label');label.className='note-label';label.textContent='What do you like or want changed?';label.htmlFor='color-note-'+p.id;
 const textarea=document.createElement('textarea');textarea.id='color-note-'+p.id;textarea.rows=2;textarea.value=choices[p.id]?.notes||'';textarea.addEventListener('input',()=>{choices[p.id]={...choices[p.id],notes:textarea.value};persist();});
 actions.append(link,favorite);card.append(heading,descriptor,frame,colors,actions,label,textarea);root.append(card);
}
screen.addEventListener('change',refreshScreens);
if(cardControl)cardControl.addEventListener('change',()=>{varied=cardControl.checked;const u=new URL(location);u.searchParams.set('cards',varied?'varied':'uniform');history.replaceState(null,'',u);refreshScreens();});
filter.addEventListener('change',update);
document.getElementById('palette-export').addEventListener('click',()=>{
 const selected=palettes.filter(p=>choices[p.id]?.favorite||choices[p.id]?.notes).map(p=>({id:p.id,number:p.number,name:p.name,mode:p.mode,favorite:Boolean(choices[p.id]?.favorite),notes:choices[p.id]?.notes||''}));
 const url=URL.createObjectURL(new Blob([JSON.stringify({collection:'GTL Prism Glass color schemes',kind:'review-preferences-not-implementation-approval',cardColorMode:varied?'varied':'uniform',schemes:selected},null,2)],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download='gtl-prism-color-favorites.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
window.GTL_PRISM_PALETTE_BOARD={palettes,get choices(){return choices;}};
function refreshPreferences(){try{const value=JSON.parse(localStorage.getItem(key)||'{}');if(value&&typeof value==='object')choices=value;}catch{}root.querySelectorAll('textarea').forEach(t=>{if(t!==document.activeElement)t.value=choices[t.closest('.palette-card').dataset.palette]?.notes||'';});update();}
window.addEventListener('pageshow',refreshPreferences);
window.addEventListener('storage',event=>{if(event.key===key)refreshPreferences();});
update();
})();
