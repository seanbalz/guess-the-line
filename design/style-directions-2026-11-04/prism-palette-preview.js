(()=>{
const palettes=window.GTL_PRISM_PALETTES;
const params=new URLSearchParams(location.search);
let current=palettes.find(p=>p.id===params.get('palette'))||palettes[0];
const noteKey='gtl-prism-color-favorites-v1';
function readPreferences(){try{const value=JSON.parse(localStorage.getItem(noteKey)||'{}');return value&&typeof value==='object'?value:{};}catch{return {};}}
if(params.get('swatch')==='1')document.body.classList.add('swatch');
function apply(){
 document.querySelectorAll('.phone.prism').forEach(phone=>{phone.dataset.palette=current.id;phone.dataset.paletteName=current.name;});
 if(params.has('palette'))document.querySelectorAll('[data-choose]').forEach(button=>button.hidden=true);
 if(params.has('palette')&&!document.body.classList.contains('embed')){
  const notes=document.getElementById('notes-prism');
  if(notes){
   if(notes.dataset.palette!==current.id){notes.dataset.palette=current.id;notes.value=readPreferences()[current.id]?.notes||'';}
   if(!notes.paletteNoteHandler){notes.paletteNoteHandler=true;notes.addEventListener('input',event=>{event.stopImmediatePropagation();const value=readPreferences();value[notes.dataset.palette]={...value[notes.dataset.palette],notes:notes.value};try{localStorage.setItem(noteKey,JSON.stringify(value));document.getElementById('message').textContent='Notes saved for '+current.name+'.';}catch{document.getElementById('message').textContent='Export this palette review to keep your notes.';}},true);}
  }
 }
}
if(params.has('palette')&&!document.body.classList.contains('embed')){
 document.getElementById('style').closest('label').hidden=true;
 const label=document.createElement('label');label.append('Palette ');
 const select=document.createElement('select');select.id='palette';select.setAttribute('aria-label','Prism Glass color scheme');
 for(const p of palettes){const option=document.createElement('option');option.value=p.id;option.textContent=String(p.number).padStart(2,'0')+' · '+p.name;select.append(option);}
 select.value=current.id;label.append(select);document.querySelector('.controls').prepend(label);
 select.addEventListener('change',()=>{current=palettes.find(p=>p.id===select.value);apply();const u=new URL(location);u.searchParams.set('palette',current.id);history.replaceState(null,'',u);});
 const exportButton=document.getElementById('export');exportButton.textContent='Export this palette review';
 exportButton.addEventListener('click',event=>{
  event.preventDefault();event.stopImmediatePropagation();
  const payload={collection:'GTL Prism Glass palette review',kind:'review-preferences-not-implementation-approval',palette:{id:current.id,number:current.number,name:current.name,mode:current.mode},notes:document.getElementById('notes-prism')?.value||''};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gtl-prism-color-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 },true);
}
new MutationObserver(apply).observe(document.getElementById('grid'),{childList:true,subtree:true});
apply();
window.GTL_PRISM_COLOR_PREVIEW={get current(){return current.id},apply};
})();
