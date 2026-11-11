import React,{useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,Target} from 'lucide-react';
import {gapSelection,gapSide,exampleGapView,GAP_MARKETS,GAP_OUTCOMES,paperAmount} from './gap-record-examples.mjs';
import {Segmented} from '../../web/src/next/ui/Segmented.jsx';
import {TeamMark} from '../../web/src/next/ui/TeamMark.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {TrendDetail} from '../../web/src/next/charts/TrendDetail.jsx';
import {numberLine} from '../../web/src/next/play/yourScore.js';
import {NumberLine} from './score-preview-number-line.jsx';
const WEEK_LABELS=[6,7,8].map(n=>({value:n,label:`Week ${n}`}));
const pct=s=>s.wins+s.losses?`${(s.wins/(s.wins+s.losses)*100).toFixed(1)}%`:'—';
const record=s=>`${s.wins}–${s.losses}–${s.pushes}`;
function Matchup({game,large=false}){return <div className={'real-gap-matchup'+(large?' is-large':'')} aria-label={`${game.awayName} at ${game.homeName}`}><span><TeamMark code={game.awayCode} size={large?48:32} decorative/><strong>{game.awayName}</strong></span><small>at</small><span><TeamMark code={game.homeCode} size={large?48:32} decorative/><strong>{game.homeName}</strong></span></div>;}
function ReferencePair({row}){return <div className="real-gap-pair"><div><small>Historical close</small><strong>{gapSelection(row.game,row.market,row.line)}</strong></div><div><small>Sample guess</small><strong>{gapSelection(row.game,row.market,row.guess)}</strong></div></div>;}
export function GapRecordPreview({model}){
 const [week,setWeek]=useState(8),[market,setMarket]=useState('all'),[tier,setTier]=useState('all'),[limit,setLimit]=useState(6),[selected,setSelected]=useState(null);const root=useRef(null),saved=useRef(null),view=exampleGapView(model,week,market,tier),s=view.summary,chosen=view.rows.find(row=>row.key===selected);
 function choose(set,value){set(value);setLimit(6);setSelected(null);}
 function open(row){saved.current={key:row.key,scroll:root.current.closest('.screen').scrollTop};setSelected(row.key);root.current.closest('.screen').scrollTop=0;requestAnimationFrame(()=>root.current.querySelector('.real-gap-back')?.focus({preventScroll:true}));}
 function back(){setSelected(null);requestAnimationFrame(()=>{root.current.querySelector(`[data-gap-key="${saved.current?.key}"]`)?.focus({preventScroll:true});if(saved.current)root.current.closest('.screen').scrollTop=saved.current.scroll;});}
 const about=<InfoButton title="About this example gap record" body={[
  'All guesses are the existing labeled sample guesses from the reviewed Weeks 6–8 score mockups. Final scores and historical closing references are the same reviewed public source records. No player ballot or signed-in account is read.',
  'The native gapRecord helper chooses the side the example guess favored and grades that side against the recorded final. Drafts, sit-outs, even guesses and absent evidence do not become graded gaps.',
  'The live app uses the last qualifying three-book line before kickoff for this paper record. This preview uses public historical closing references only; they do not establish three-book consensus, submission-time references or current prices.',
  'Paper units illustrate one unit per graded gap at the standard −110 convention. They are not actual wagers or sportsbook prices. Win rate is wins divided by wins plus losses; pushes remain in the record and paper-unit risk.',
  'The 10%+ filter is relative guess distance: spread uses the greater of the reference magnitude or 3; total uses its reference. It is not a win probability or a tested betting edge.',
  `Public completed-record fingerprint: ${model.source.completedSha256}. ${model.source.credit}. No quote observations, save times or book identities are supplied.`,
 ]} links={[{text:'Public historical source · nflverse · CC BY 4.0',url:model.source.schedule},{text:'Reviewed research publication',url:model.source.release}]}/>;
 const line={values:[0,...view.points.map(p=>p.value)],formatValue:paperAmount,start:'Start',end:`Gap ${view.rows.length}`,label:`Illustrative cumulative paper units at standard minus 110 for ${view.rows.length} example gaps`,headline:{value:paperAmount(s.netUnits),sub:`${view.rows.length} graded gaps · illustrative −110`},tiles:[{label:'Record',value:record(s),sub:'W–L–P'},{label:'Paper ROI',value:s.roi==null?'—':`${s.roi.toFixed(1).replace('-','−')}%`,sub:'Illustrative −110'},{label:'Gaps',value:view.rows.length,sub:'Selected filters'}],tip:i=>i===0?{value:'0.00U',label:'Start · no gaps graded'}:{value:paperAmount(view.points[i-1].value),label:`Gap ${i} · ${view.points[i-1].market==='spread'?'Spread':'Total'} · ${GAP_OUTCOMES[view.points[i-1].outcome].label}`}};
 return <section className="real-gaps real-score real-play" ref={root} aria-label="Historical example gap record" data-paper-negative={s.netUnits<0}>
  {chosen?<>
   <button type="button" className="real-gap-back" onClick={back}><ArrowLeft size={16} aria-hidden="true"/>Back to example gaps</button>
   <article className="real-gap-detail"><div className="real-gap-heading"><span className="real-gap-market">{chosen.market==='spread'?'Spread':'Total'} · Week {week}</span>{about}</div><Matchup game={chosen.game} large/><span className="real-gap-result" data-outcome={chosen.outcome}>{GAP_OUTCOMES[chosen.outcome].label} · example gap</span><ReferencePair row={chosen}/><GapAxis row={chosen}/><div className="real-gap-detail-stats"><div><small>Gap side</small><strong>{gapSide(chosen)}</strong></div><div><small>Difference</small><strong>{Math.abs(chosen.guess-chosen.line)} points</strong></div><div><small>Paper units · −110</small><strong>{chosen.outcome==='win'?'+0.91U':chosen.outcome==='loss'?'−1.00U':'0.00U'}</strong></div></div><div className="real-gap-final"><strong>Recorded final</strong><span>{chosen.game.awayName} <b>{chosen.game.final.away}</b></span><span>{chosen.game.homeName} <b>{chosen.game.final.home}</b></span></div><p className="real-score-source">Historical close · sample guess · illustrative paper result</p></article>
  </>:null}<div className="real-gap-overview" hidden={!!chosen}>
   <div className="real-gap-heading"><p className="real-play-eyebrow">EXAMPLE GUESSES · HISTORICAL CLOSE</p>{about}</div>
   <Segmented label="Example gap week" options={WEEK_LABELS} value={week} onChange={v=>choose(setWeek,v)}/><Segmented label="Gap market" options={GAP_MARKETS} value={market} onChange={v=>choose(setMarket,v)}/>
   <details className="real-gap-options"><summary>Gap size filter{tier==='large'?' · 10%+':''}</summary><Segmented label="Gap size" options={[{value:'all',label:'All gaps'},{value:'large',label:'10%+ gaps'}]} value={tier} onChange={v=>choose(setTier,v)}/></details>
   <article className="real-gap-hero"><div className="real-gap-rate"><span className="real-gap-ring" style={{'--gap-angle':`${s.wins+s.losses?s.wins/(s.wins+s.losses)*360:0}deg`}}><Target size={28} aria-hidden="true"/></span><div><strong>{pct(s)}</strong><span>Example gap win rate</span></div></div><p>{record(s)} W–L–P · {view.record.even} even guesses excluded</p></article>
   <TrendDetail key={`${week}:${market}:${tier}`} title="Example paper units" line={line}>{selection=><>
    <div className="real-gap-outcome-key"><span>W · win</span><span>L · loss</span><span>P · push</span></div>
    <ol className="real-gap-blocks" aria-label="Example gap outcomes in kickoff order">{view.rows.map((row,i)=><li key={row.key}><button type="button" data-outcome={row.outcome} aria-label={`Select gap ${i+1}: ${row.game.awayName} at ${row.game.homeName}, ${row.market}, ${GAP_OUTCOMES[row.outcome].label}`} aria-pressed={selection.index===i+1} onClick={()=>selection.onSelect(i+1)}>{GAP_OUTCOMES[row.outcome].letter}</button></li>)}</ol>
    <div className="real-gap-list-heading"><h3>Each gap</h3><span>Kickoff order · {view.rows.length}</span></div>
    <ol className="real-gap-list">{view.rows.slice(0,limit).map((row,i)=><li key={row.key}><div className="real-gap-row" data-current={selection.index===i+1}><div className="real-gap-row-top"><span>Gap {i+1} · {row.market==='spread'?'Spread':'Total'}</span><span className="real-gap-result" data-outcome={row.outcome}>{GAP_OUTCOMES[row.outcome].label}</span></div><Matchup game={row.game}/><ReferencePair row={row}/><div className="real-gap-row-actions"><button type="button" aria-pressed={selection.index===i+1} onClick={()=>selection.onSelect(i+1)}>{selection.index===i+1?<Check size={16} aria-hidden="true"/>:null}Chart point</button><button type="button" data-gap-key={row.key} onClick={()=>open(row)}>Gap details<ArrowRight size={16} aria-hidden="true"/></button></div></div></li>)}</ol>
    {view.rows.length>6?<Button haptic={false} onClick={()=>setLimit(n=>n===6?view.rows.length:6)}>{limit===6?`Show all ${view.rows.length} gaps`:'Show first 6'}</Button>:null}
   </>}</TrendDetail>
   <p className="real-score-source">Historical references · sample guesses · no account data<br/>Paper units use an illustrative −110 convention</p>
  </div>
 </section>;
}
function GapAxis({row}){const total=row.market==='total',axis=numberLine({mode:total?'guess_total':'guess_spread',game:row.game,guess:row.guess,line:row.line}),awayLead=row.line>0||(row.line===0&&row.guess>0),value=n=>total||awayLead?n:-n;axis.caption=total?'Combined points':`${awayLead?row.game.awayName:row.game.homeName} winning margin · negative means losing`;axis.line.label=`Reference ${value(row.line)}`;axis.you.label=`Example ${value(row.guess)}`;axis.aria=`Historical reference ${gapSelection(row.game,row.market,row.line)}; sample guess ${gapSelection(row.game,row.market,row.guess)}; difference ${Math.abs(row.guess-row.line)} points`;return <NumberLine line={axis}/>;}
