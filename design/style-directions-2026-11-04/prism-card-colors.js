(()=>{
const params=new URLSearchParams(location.search);if(params.get('compare')==='1')document.body.classList.add('card-color-compare');let varied=params.get('cards')==='varied';
const variables=['--accent','--tint','--pc-accent','--pc-button-top','--pc-button-bottom','--pc-button-border','--pc-surface-1','--pc-surface-2','--pc-surface-3','--pc-small-surface','--pc-active-surface','--pc-border','--pc-edge-1','--pc-edge-2','--pc-tint','--pc-track','--pc-field'];
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)),mix=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join(''),alpha=(h,a)=>h+Math.round(a*255).toString(16).padStart(2,'0');
function lum(h){return rgb(h).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){const l=[lum(a),lum(b)].sort((x,y)=>x-y);return(l[1]+.05)/(l[0]+.05)}
function toneFor(card){
 if(card.classList.contains('hero'))return 0;
 const text=(card.querySelector('h3,strong')?.textContent||card.textContent.slice(0,45)).toLowerCase();
 if(/season|score|standing|overview/.test(text))return 1;
 if(/research|matchup|trend|fantasy|games|team/.test(text))return 2;
 if(/league|community|around|profile|reminder|award/.test(text))return 3;
 return 0;
}
function apply(){
 const phone=document.querySelector('.phone.prism');if(!phone)return;
 const p=window.GTL_PRISM_PALETTES.find(p=>p.id===phone.dataset.palette);if(!p)return;
 phone.dataset.cardColors=varied?'varied':'uniform';
 const accents=p.cardAccents||(p.mode==='dark'?['#A9C8F3','#D0B4ED','#98D6C2','#E4C28F']:['#2E638E','#77509B','#286F63','#955247']);
 phone.querySelectorAll('.panel,.quick,.pick-card').forEach(card=>{
  for(const key of variables)card.style.removeProperty(key);
  delete card.dataset.cardTone;if(!varied)return;
  const index=toneFor(card);let accent=accents[index];
  const dark=p.mode==='dark';
  while(contrast(p.onAccent,mix(accent,'#FFFFFF',.13))<4.5&& !dark){accent=mix(accent,'#000000',.05);}
  const surface=dark?mix(mix(p.background,accent,.19),'#FFFFFF',.045):mix('#FFFFFF',accent,.09);
  const values={'--accent':accent,'--tint':alpha(accent,.14),'--pc-accent':accent,'--pc-button-top':mix(accent,'#FFFFFF',.13),'--pc-button-bottom':accent,'--pc-button-border':dark?alpha('#FFFFFF',.3):mix(accent,'#000000',.12),'--pc-surface-1':alpha(surface,.86),'--pc-surface-2':alpha(surface,.56),'--pc-surface-3':alpha(surface,.72),'--pc-small-surface':alpha(surface,.48),'--pc-active-surface':alpha(surface,.9),'--pc-border':alpha(mix(accent,'#FFFFFF',.6),dark?.42:.85),'--pc-edge-1':alpha(mix(accent,'#FFFFFF',.82),dark?.62:.96),'--pc-edge-2':alpha(accent,.3),'--pc-tint':alpha(accent,.14),'--pc-track':alpha(accent,.2),'--pc-field':alpha(accent,.12)};
  for(const [key,value]of Object.entries(values))card.style.setProperty(key,value);
  card.dataset.cardTone=String(index+1);
 });
}
if(!document.body.classList.contains('embed')){
 const label=document.createElement('label');label.style.minHeight='44px';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.id='varied-card-colors';checkbox.checked=varied;label.append(checkbox,'Different colors per card');document.querySelector('.controls').append(label);
 checkbox.addEventListener('change',()=>{varied=checkbox.checked;const u=new URL(location);u.searchParams.set('cards',varied?'varied':'uniform');history.replaceState(null,'',u);apply();});
}
new MutationObserver(apply).observe(document.getElementById('grid'),{childList:true,subtree:true});
window.GTL_PRISM_CARD_COLORS={get mode(){return varied?'varied':'uniform'},apply};
apply();
})();
