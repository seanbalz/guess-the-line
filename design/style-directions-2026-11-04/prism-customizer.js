(()=>{
'use strict';
const $=id=>document.getElementById(id),palettes=window.GTL_PRISM_PALETTES,key='gtl-prism-design-studio-v1';
const colors=['background','card','accent','buttonText','text','muted','glowOne','glowTwo'];
const bounds={gradientStrength:[0,100],angle:[0,360],opacity:[15,100],blur:[0,40],gloss:[0,100],shadow:[0,100],radius:[8,40],gap:[8,28]};
const hex=s=>typeof s==='string'&&/^#[0-9a-f]{6}$/i.test(s),rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join('').toUpperCase();
const alpha=(h,a)=>h+Math.round(Math.max(0,Math.min(1,a))*255).toString(16).padStart(2,'0'),copy=v=>JSON.parse(JSON.stringify(v));
function fromPalette(id){const p=palettes.find(p=>p.id===id)||palettes[0];return {preset:p.id,background:p.background,card:p.mode==='dark'?mix(p.background,'#FFFFFF',.17):'#FFFFFF',accent:p.accent,buttonText:p.onAccent,text:p.ink,muted:p.muted,glowOne:p.glow,glowTwo:mix(p.glow,p.accent,.32),gradient:true,gradientStrength:55,angle:145,material:'polished',opacity:68,blur:28,gloss:72,shadow:55,radius:30,gap:16,typeface:'system'};}
const defaults={dark:fromPalette('obsidian'),light:fromPalette('arctic')};
function cleanConfig(value,mode){
 const base=copy(defaults[mode]);if(!value||typeof value!=='object')return base;
 for(const field of colors)if(hex(value[field]))base[field]=value[field].toUpperCase();
 for(const [field,[min,max]]of Object.entries(bounds))if(typeof value[field]==='number'&&Number.isFinite(value[field]))base[field]=Math.round(Math.max(min,Math.min(max,value[field])));
 if(typeof value.gradient==='boolean')base.gradient=value.gradient;
 if(['polished','frosted','clear','solid','custom'].includes(value.material))base.material=value.material;
 if(['system','rounded','editorial'].includes(value.typeface))base.typeface=value.typeface;
 if(value.preset==='custom'||palettes.some(p=>p.id===value.preset))base.preset=value.preset;
 return base;
}
function cleanDesign(value){return {activeMode:value?.activeMode==='light'?'light':'dark',screen:['Home','Play','Bets','Research','EPL','Account'].includes(value?.screen)?value.screen:'Home',modes:{dark:cleanConfig(value?.modes?.dark,'dark'),light:cleanConfig(value?.modes?.light,'light')}};}
let state={design:cleanDesign(null),saved:[]};
try{const v=JSON.parse(localStorage.getItem(key)||'null');if(v){state.design=cleanDesign(v.design);if(Array.isArray(v.saved))state.saved=v.saved.slice(0,40).filter(x=>x&&typeof x.name==='string').map((x,i)=>({id:String(x.id||i),name:x.name.slice(0,80),design:cleanDesign(x.design)}));}}catch{}
let frameReady=false,frameObserver,applyPending=false;
const config=()=>state.design.modes[state.design.activeMode];
function status(text,error=false){$('save-status').textContent=text;$('save-status').setAttribute('role',error?'alert':'status');}
function persist(){try{localStorage.setItem(key,JSON.stringify(state));status('Dark and light settings saved in this browser.');}catch{status('Browser storage unavailable. Export your design to keep it.');}}
function paletteOptions(){
 const select=$('starting-palette');select.innerHTML='';const custom=document.createElement('option');custom.value='custom';custom.textContent='Custom colors';select.append(custom);
 const shortlist=['obsidian','midnight-lime','forest','arctic','porcelain-evergreen'];
 for(const [label,list]of [['Your shortlist',palettes.filter(p=>shortlist.includes(p.id)).sort((a,b)=>shortlist.indexOf(a.id)-shortlist.indexOf(b.id))],['Other starting palettes',palettes.filter(p=>!shortlist.includes(p.id))]]){
  const group=document.createElement('optgroup');group.label=label;for(const p of list){const o=document.createElement('option');o.value=p.id;o.textContent=String(p.number).padStart(2,'0')+' · '+p.name;group.append(o);}select.append(group);
 }
}
function updateControls(){
 const c=config();$('edit-mode').value=state.design.activeMode;$('starting-palette').value=c.preset;$('preview-screen').value=state.design.screen;
 document.querySelectorAll('[data-color]').forEach(el=>el.value=c[el.dataset.color]);document.querySelectorAll('[data-hex]').forEach(el=>{el.value=c[el.dataset.hex];el.removeAttribute('aria-invalid');});
 $('background-gradient').checked=c.gradient;$('gradient-settings').hidden=!c.gradient;
 for(const field of Object.keys(bounds)){const el=document.querySelector('[data-range="'+field+'"]');el.value=c[field];el.closest('label').querySelector('output').value=c[field]+(field==='angle'?'°':['blur','radius','gap'].includes(field)?' px':'%');}
 $('material-style').value=c.material;$('type-style').value=c.typeface;$('preview-mode').textContent=state.design.activeMode==='dark'?'Dark mode':'Light mode';
}
function updateSaved(){const select=$('saved-design');select.innerHTML='<option value="">Choose a saved design</option>';for(const item of state.saved){const o=document.createElement('option');o.value=item.id;o.textContent=item.name;select.append(o);}}
function luminance(h){return rgb(h).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);}
function ratio(a,b){const [lo,hi]=[luminance(a),luminance(b)].sort((a,b)=>a-b);return(hi+.05)/(lo+.05);}
function applyDesign(){
 applyPending=false;if(!frameReady)return;const doc=$('studio-frame').contentDocument,phone=doc?.querySelector('.phone.prism');if(!phone)return;
 const c=config(),dark=state.design.activeMode==='dark',g=c.gloss/100,depth=c.shadow/100,opacity=c.opacity/100,surface=c.card;
 const edge=alpha('#FFFFFF',dark?.16+g*.48:.3+g*.66),border=alpha(mix(surface,'#FFFFFF',.45),dark?.18+g*.25:.45+g*.4),shadow=alpha('#000000',depth*(dark?.65:.2));
 const cardBackground=c.material==='solid'?surface:'linear-gradient(135deg,'+alpha(surface,Math.min(1,opacity+g*.1))+','+alpha(surface,Math.max(.15,opacity-.17))+' 54%,'+alpha(surface,opacity)+')';
 const power=c.gradientStrength/100;
 const background=c.gradient?'radial-gradient(ellipse at 92% 15%,'+alpha(c.glowOne,power)+',transparent 54%),radial-gradient(ellipse at 4% 78%,'+alpha(c.glowTwo,power*.85)+',transparent 58%),linear-gradient('+c.angle+'deg,'+c.background+','+mix(c.background,c.glowOne,power*.3)+')':c.background;
 const shadowCss='inset 0 1px 0 '+edge+',inset 0 -1px 0 '+alpha(c.accent,g*.16)+',0 '+Math.round(depth*18)+'px '+Math.round(depth*38)+'px '+shadow;
 const faces={system:{head:'-apple-system,BlinkMacSystemFont,Inter,"Segoe UI",sans-serif',body:'-apple-system,BlinkMacSystemFont,Inter,"Segoe UI",sans-serif'},rounded:{head:'Outfit,sans-serif',body:'Manrope,sans-serif'},editorial:{head:'Fraunces,serif',body:'"DM Sans",sans-serif'}};
 const vars={
 '--pc-scheme':dark?'dark':'light','--pc-bg':c.background,'--pc-ink':c.text,'--pc-muted':c.muted,'--pc-accent':c.accent,'--pc-on-accent':c.buttonText,'--pc-tint':alpha(c.accent,.14),'--pc-line':alpha(c.text,.14),
 '--pc-surface-1':alpha(surface,opacity),'--pc-surface-2':alpha(surface,Math.max(.15,opacity-.2)),'--pc-surface-3':alpha(surface,opacity),'--pc-small-surface':alpha(surface,Math.min(1,opacity*.7)),'--pc-active-surface':alpha(surface,Math.min(1,opacity+.15)),
 '--pc-border':border,'--pc-edge-1':edge,'--pc-edge-2':alpha(c.accent,g*.2),'--pc-shadow':shadow,'--pc-track':alpha(c.accent,.2),'--pc-field':alpha(c.accent,.12),
 '--pc-button-top':mix(c.accent,'#FFFFFF',g*.17),'--pc-button-bottom':c.accent,'--pc-button-border':dark?alpha('#FFFFFF',g*.4):mix(c.accent,'#000000',.12),'--pc-button-edge':alpha('#FFFFFF',g*.6),
 '--studio-background':background,'--studio-card-background':cardBackground,'--studio-blur':c.blur+'px','--studio-gloss':String(g),'--studio-radius':c.radius+'px','--studio-gap':c.gap+'px','--studio-shadow':shadowCss,
 '--studio-button-shadow':'inset 0 1px 0 '+edge+',0 '+Math.round(depth*6)+'px '+Math.round(depth*18)+'px '+shadow,'--studio-preview-height':Math.max(300,$('studio-frame').clientHeight-236)+'px',
 '--head':faces[c.typeface].head,'--body':faces[c.typeface].body
 };
 phone.dataset.customizer='true';phone.dataset.studioMode=state.design.activeMode;
 for(const [name,value]of Object.entries(vars))phone.style.setProperty(name,value);
 const base=ratio(c.text,c.background),button=ratio(c.buttonText,mix(c.accent,'#FFFFFF',g*.17));
 $('contrast-status').textContent='Base text '+base.toFixed(1)+':1 · Button '+button.toFixed(1)+':1';$('contrast-status').classList.toggle('low',Math.min(base,button)<4.5);
 const actual=doc.querySelector('#screen')?.value;if(actual&&actual!==state.design.screen){state.design.screen=actual;$('preview-screen').value=actual;persist();}
}
function scheduleApply(){if(!applyPending){applyPending=true;requestAnimationFrame(applyDesign);}}
$('studio-frame').addEventListener('load',()=>{
 frameReady=true;const doc=$('studio-frame').contentDocument;if(frameObserver)frameObserver.disconnect();
 doc.getElementById('prism-studio-bridge')?.remove();const link=doc.createElement('link');link.id='prism-studio-bridge';link.rel='stylesheet';link.href='prism-customizer-preview.css';link.onload=scheduleApply;doc.head.append(link);
 frameObserver=new MutationObserver(scheduleApply);frameObserver.observe(doc.getElementById('grid'),{childList:true,subtree:true});
 $('studio-frame').contentWindow.GTL_STYLE_REVIEW.setView(state.design.screen,'prism');scheduleApply();
});
$('edit-mode').addEventListener('change',event=>{state.design.activeMode=event.target.value;updateControls();changed();});
function changed(){persist();scheduleApply();}
$('starting-palette').addEventListener('change',event=>{if(event.target.value==='custom')return;const p=palettes.find(p=>p.id===event.target.value);state.design.activeMode=p.mode;state.design.modes[p.mode]=fromPalette(p.id);updateControls();changed();});
document.querySelectorAll('[data-color]').forEach(input=>input.addEventListener('input',()=>{const field=input.dataset.color;config()[field]=input.value.toUpperCase();config().preset='custom';const hexInput=document.querySelector('[data-hex="'+field+'"]');hexInput.value=config()[field];hexInput.removeAttribute('aria-invalid');$('starting-palette').value='custom';changed();}));
document.querySelectorAll('[data-hex]').forEach(input=>input.addEventListener('input',()=>{if(!hex(input.value)){input.setAttribute('aria-invalid','true');return;}input.removeAttribute('aria-invalid');const field=input.dataset.hex;config()[field]=input.value.toUpperCase();config().preset='custom';document.querySelector('[data-color="'+field+'"]').value=config()[field];$('starting-palette').value='custom';changed();}));
$('background-gradient').addEventListener('change',event=>{config().gradient=event.target.checked;$('gradient-settings').hidden=!config().gradient;changed();});
document.querySelectorAll('[data-range]').forEach(input=>input.addEventListener('input',()=>{const field=input.dataset.range;config()[field]=Number(input.value);if(['opacity','blur','gloss','shadow'].includes(field)){config().material='custom';$('material-style').value='custom';}input.closest('label').querySelector('output').value=input.value+(field==='angle'?'°':['blur','radius','gap'].includes(field)?' px':'%');changed();}));
$('material-style').addEventListener('change',event=>{const presets={polished:{opacity:68,blur:28,gloss:72,shadow:55},frosted:{opacity:82,blur:36,gloss:40,shadow:45},clear:{opacity:30,blur:18,gloss:90,shadow:50},solid:{opacity:100,blur:0,gloss:0,shadow:25}};config().material=event.target.value;if(presets[event.target.value])Object.assign(config(),presets[event.target.value]);updateControls();changed();});
$('type-style').addEventListener('change',event=>{config().typeface=event.target.value;changed();});
$('preview-screen').addEventListener('change',event=>{state.design.screen=event.target.value;if(frameReady)$('studio-frame').contentWindow.GTL_STYLE_REVIEW.setView(state.design.screen,'prism');changed();});
$('reset-mode').addEventListener('click',()=>{state.design.modes[state.design.activeMode]=copy(defaults[state.design.activeMode]);updateControls();changed();});
$('save-design').addEventListener('click',()=>{
 const name=$('design-name').value.trim();if(!name){status('Enter a name for this design.',true);$('design-name').focus();return;}
 if(state.saved.length>=40){status('This browser already has 40 saved designs. Export your current design to keep it.',true);return;}
 const item={id:crypto.randomUUID(),name,design:copy(state.design)};state.saved.push(item);updateSaved();$('saved-design').value=item.id;persist();status('Saved “'+name+'” with both dark and light settings.');
});
$('saved-design').addEventListener('change',event=>{const item=state.saved.find(item=>item.id===event.target.value);if(!item)return;state.design=cleanDesign(item.design);$('design-name').value=item.name;updateControls();if(frameReady)$('studio-frame').contentWindow.GTL_STYLE_REVIEW.setView(state.design.screen,'prism');changed();});
$('export-design').addEventListener('click',()=>{
 const payload={kind:'GTL_PRISM_DESIGN_CUSTOMIZER',schemaVersion:1,name:$('design-name').value.trim()||'My Prism Glass design',design:copy(state.design)};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gtl-prism-custom-design.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Design exported with both dark and light settings.');
});
$('import-design').addEventListener('change',async event=>{
 const file=event.target.files?.[0];if(!file)return;
 try{if(file.size>200000)throw Error('Choose a Prism design JSON smaller than 200 KB.');const data=JSON.parse(await file.text());if(data.kind!=='GTL_PRISM_DESIGN_CUSTOMIZER'||data.schemaVersion!==1||!data.design?.modes)throw Error('Choose a design exported from this customizer.');state.design=cleanDesign(data.design);$('design-name').value=typeof data.name==='string'?data.name.slice(0,80):'';updateControls();if(frameReady)$('studio-frame').contentWindow.GTL_STYLE_REVIEW.setView(state.design.screen,'prism');changed();status('Design imported. You can keep editing or save it by name.');}catch(error){status(error.message||'Could not import this design.',true);}event.target.value='';
});
window.addEventListener('resize',scheduleApply);
paletteOptions();updateControls();updateSaved();
window.GTL_PRISM_STUDIO={get design(){return copy(state.design)},get saved(){return copy(state.saved)},apply:applyDesign};
if($('studio-frame').contentDocument?.querySelector('.phone'))$('studio-frame').dispatchEvent(new Event('load'));
})();
