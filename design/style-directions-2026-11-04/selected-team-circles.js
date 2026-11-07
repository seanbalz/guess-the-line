(()=>{
'use strict';
// The owner selected circles for team/league identities, excluding the GTL G.
const css=`
.phone :is(.team-logo-tile,.gx-team,.gx-epl-crest,.real-game-logo,.real-play-logo,.real-team-logo,.real-ops-logo){border-radius:50%!important;overflow:visible!important}
.phone .home-games .team-logo-tile{height:34px!important}
.phone .real-team-logo{height:32px!important}
.phone .real-ops-logo .gx-team{border:0!important;background:transparent!important;box-shadow:none!important}
.phone :is(.team-logo-tile,.gx-team,.gx-epl-crest,.real-game-logo,.real-play-logo,.real-team-logo,.real-ops-logo) img{object-fit:contain}
.phone [data-team-circle-fallback]{display:grid;place-items:center;flex:none;width:64px;height:64px;border:1px solid var(--pc-border);background:var(--pc-small-surface);box-shadow:inset 0 1px 0 var(--pc-edge-1),0 4px 8px var(--pc-shadow);backdrop-filter:blur(12px)}
`;
document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 let observer;
 function apply(){const d=frame.contentDocument;if(!d)return;for(const image of d.querySelectorAll('.phone .visual-matchup .team-mark')){if(image.closest('.team-logo-tile,.gx-team,.gx-epl-crest,.real-game-logo,.real-play-logo,.real-team-logo,.real-ops-logo'))continue;const tile=d.createElement('span');tile.className='team-logo-tile';tile.dataset.teamCircleFallback='true';image.before(tile);tile.append(image);}}
 function ready(){const d=frame.contentDocument,grid=d?.getElementById('grid');if(!grid)return;observer?.disconnect();if(!d.getElementById('selected-team-circles-css')){const style=d.createElement('style');style.id='selected-team-circles-css';style.textContent=css;d.head.append(style);}observer=new MutationObserver(apply);observer.observe(grid,{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);ready();
});
})();
