(()=>{
'use strict';
// The owner selected circles for team/league identities, excluding the GTL G.
const css=`
.phone :is(.team-logo-tile,.gx-team,.gx-epl-crest,.real-game-logo,.real-play-logo,.real-team-logo,.real-ops-logo){border-radius:50%!important;overflow:visible!important}
.phone .home-games .team-logo-tile{height:34px!important}
.phone .real-team-logo{height:32px!important}
.phone .real-ops-logo .gx-team{border:0!important;background:transparent!important;box-shadow:none!important}
.phone :is(.team-logo-tile,.gx-team,.gx-epl-crest,.real-game-logo,.real-play-logo,.real-team-logo,.real-ops-logo) img{object-fit:contain}
`;
document.querySelectorAll('iframe[data-review-theme]').forEach(frame=>{
 function ready(){const d=frame.contentDocument;if(!d?.getElementById('grid')||d.getElementById('selected-team-circles-css'))return;const style=d.createElement('style');style.id='selected-team-circles-css';style.textContent=css;d.head.append(style);}
 frame.addEventListener('load',ready);ready();
});
})();
