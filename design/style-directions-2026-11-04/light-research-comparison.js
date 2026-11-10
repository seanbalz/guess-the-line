(()=>{
'use strict';
const css=`
.phone[data-research-comparison] .research-table-scroll{overflow-x:auto;max-width:100%;border-radius:8px}
.phone[data-research-comparison] .research-table-scroll:focus-visible{outline:3px solid #365A0E;outline-offset:3px}
.phone[data-research-comparison] .research-table{min-width:260px;width:100%;font-size:16px;font-variant-numeric:tabular-nums}
.phone[data-research-comparison] .research-table caption{caption-side:bottom;text-align:left;white-space:normal;padding-top:10px;font-size:13px;color:var(--muted)}
.phone[data-research-comparison] .research-table th,.phone[data-research-comparison] .research-table td{padding:11px 7px;white-space:nowrap}
.phone[data-research-comparison] .research-table thead th{font-size:13px}
.phone[data-research-comparison] .research-table tbody th{font-size:16px;font-weight:500;color:var(--ink);text-align:left}
.phone[data-research-comparison] .research-chart-note{font-size:13px;color:var(--muted);margin:10px 0 0}
.phone[data-research-comparison] .research-chart-labels{display:flex;justify-content:space-between;gap:12px;font-size:13px;color:var(--muted);margin-bottom:8px}
`;
document.querySelectorAll('iframe[data-research-compare]').forEach(frame=>{
 let observer,chart='';
 function apply(){
  const doc=frame.contentDocument,phone=doc?.querySelector('.phone.prism');if(!phone)return;
  phone.dataset.researchComparison='true';
  if(!chart){const original=phone.querySelector('.chart');if(original){const copy=original.cloneNode(true);copy.querySelectorAll('text').forEach(e=>e.remove());chart=copy.outerHTML;}}
  const screen=phone.querySelector('.screen');
  if(doc.getElementById('screen')?.value!=='Research'||screen.querySelector('.detail-close')||screen.dataset.researchCompare)return;
  const gameButton=screen.querySelector('button[data-action="detail:game"]');
  screen.dataset.researchCompare='true';
  screen.innerHTML='<div class="screen-top"><div><small>Research · sample comparison</small><h2 class="page-title">Research</h2></div><span class="pill">SAMPLE</span></div><div class="stack"><section class="panel"><div class="section-label"><h3>Player usage</h3><span>Comparison</span></div><div class="research-table-scroll" tabindex="0" role="region" aria-label="Player usage comparison table; scroll horizontally if needed"><table class="standings research-table"><caption>Illustrative player data, not current projections.</caption><thead><tr><th scope="col">Metric</th><th scope="col">Player A</th><th scope="col">Player B</th></tr></thead><tbody><tr><th scope="row">Sample</th><td>4 games</td><td>4 games</td></tr><tr><th scope="row">Targets</th><td>8.0</td><td>6.5</td></tr><tr><th scope="row">Receptions</th><td>5.5</td><td>4.5</td></tr></tbody></table></div></section><section class="panel"><div class="section-label"><h3>Trend evidence</h3><span>Illustrative</span></div><div class="research-chart-labels"><span>Usage trend</span><span>Weeks 1–5</span></div>'+chart+'<div class="research-chart-labels"><span>Week 1</span><span>Week 5</span></div><p class="research-chart-note">Sample trend for visual comparison. No live results are loaded.</p><button class="secondary" data-action="detail:game" style="margin-top:14px">Open game details ↗</button></section></div>';
  const placeholder=screen.querySelector('[data-action="detail:game"]');
  if(gameButton){gameButton.className='secondary';gameButton.textContent='Open game details ↗';gameButton.style.marginTop='14px';placeholder.replaceWith(gameButton);}else placeholder.remove();
 }
 function ready(){const doc=frame.contentDocument;if(!doc?.getElementById('grid'))return;observer?.disconnect();if(!doc.getElementById('research-comparison-styles')){const style=doc.createElement('style');style.id='research-comparison-styles';style.textContent=css;doc.head.append(style);}observer=new MutationObserver(apply);observer.observe(doc.getElementById('grid'),{childList:true,subtree:true});apply();}
 frame.addEventListener('load',ready);if(frame.contentDocument?.querySelector('.phone'))ready();
});
})();
