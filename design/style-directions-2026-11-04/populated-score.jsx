// Score/history presentation from public past-game references and labelled sample guesses only.
import React,{useEffect,useRef,useState} from 'react';
import {scoreRows,scoreSummary,ownEntry,SCORE_MARKETS} from '../../web/src/next/play/scoring.js';
import {heroModel,rowView,gameView} from '../../web/src/next/play/yourScore.js';
import {WeekChips} from '../../web/src/next/play/WeekChips.jsx';
import {FilterToggle} from '../../web/src/next/play/FilterToggle.jsx';
import {Segmented} from '../../web/src/next/ui/Segmented.jsx';
import {TeamMark} from '../../web/src/next/ui/TeamMark.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {TEAM_NAMES} from '../../shared/nfl-schedule.mjs';
import {ArrowLeft,ArrowRight,Target} from 'lucide-react';
import {NumberLine} from './score-preview-number-line.jsx';
import {shortName} from '../../web/src/communityFormat.js';
import '../../web/src/next/play/yourScore.css';
const short=shortName,number=n=>Number.isInteger(n)?String(n):n.toFixed(1);
const pick=(mode,game,value)=>mode==='guess_total'?`${number(value)} total points`:value===0?'Pick’em':`${short(value<0?game.homeCode:game.awayCode)} −${number(Math.abs(value))}`;
const date=iso=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric'}).format(new Date(iso));
function Matchup({game,large=false}){return <div className={'real-score-matchup'+(large?' is-large':'')} aria-label={`${game.awayName} at ${game.homeName}`}><span><TeamMark code={game.awayCode} size={large?48:32} decorative/><strong>{short(game.awayCode)}</strong></span><small>at</small><span><TeamMark code={game.homeCode} size={large?48:32} decorative/><strong>{short(game.homeCode)}</strong></span></div>;}
function Pair({row,mode}){return <div className="real-score-pair"><div><small>Closing reference</small><strong>{pick(mode,row.game,row.reference.value)}</strong></div><div><small>Sample guess</small><strong>{pick(mode,row.game,row.guess)}</strong></div></div>;}
export function ScorePreview({model,onSelection}){
 const history=model.history,[mode,setMode]=useState('guess_spread'),[weekNumber,setWeek]=useState(8),[view,setView]=useState('week'),[selected,setSelected]=useState(null),[team,setTeam]=useState(''),[matchup,setMatchup]=useState(''),[limit,setLimit]=useState(6);
 const root=useRef(null),saved=useRef(null),week=history.weeks.find(w=>w.week===weekNumber),entry=ownEntry(week,history.viewer,mode),filtered=!!(team||matchup),rows=scoreRows(week,entry,{team,matchup}),hero=heroModel({mode,week:weekNumber,entry,rows,filtered}),row=selected?rows.find(r=>r.game.id===selected):null;
 const summary=scoreSummary(rows),market=mode==='guess_total'?'Total':'Spread';
 useEffect(()=>{onSelection?.({name:row?`${short(row.game.awayCode)} at ${short(row.game.homeCode)}`:view==='history'?'Score history':'Your score',open:!!row});},[selected,view,row?.game.id,onSelection]);
 function openGame(id){saved.current={id,scroll:root.current.closest('.screen').scrollTop};setSelected(id);root.current.closest('.screen').scrollTop=0;requestAnimationFrame(()=>root.current.querySelector('.real-score-back')?.focus({preventScroll:true}));}
 function closeGame(){setSelected(null);requestAnimationFrame(()=>{root.current.querySelector(`[data-score-game="${saved.current?.id}"]`)?.focus({preventScroll:true});if(saved.current)root.current.closest('.screen').scrollTop=saved.current.scroll;});}
 function openWeek(n){setWeek(n);setMatchup('');setTeam('');setLimit(6);setView('week');setSelected(null);root.current.closest('.screen').scrollTop=0;}
 const about=<InfoButton title="About these example scores" body={[
  model.notice,
  'Example points use GTL’s original accuracy helper: 10 minus two times the absolute gap, floored at zero. Spread and Total stay separate. A zero is a real calculated example result, not missing data.',
  'The live app uses each player’s saved, qualifying submission-time reference and authoritative server points. Historical closing lines in this review are an illustrative benchmark only. They do not replace any saved reference or establish a three-book consensus.',
  'Filters show a subtotal and do not create a rank. No account, league rank, member picks, save time or quote observation time is simulated.',
  `Public completed records match the November 5 research publication’s SHA-256 fingerprint. ${model.source.credit}.`
 ]} links={[{text:'Public research publication',url:model.source.release},{text:'Historical schedules and closing lines',url:model.source.schedule}]}/>;
 return <section className="real-score real-play" ref={root} aria-label="Example score and history review">
  {row?<><button type="button" className="real-score-back" onClick={closeGame}><ArrowLeft size={16} aria-hidden="true"/>Back to Week {weekNumber}</button><Game row={row} mode={mode} week={weekNumber} model={model}/></>:<>
   <Segmented label="Score view" options={[{value:'week',label:'Weekly score'},{value:'history',label:'History'}]} value={view} onChange={setView}/>
   <Segmented label="Score market" options={SCORE_MARKETS} value={mode} onChange={value=>{setMode(value);setLimit(6);}}/>
   <div className="real-score-heading"><p className="real-score-meta">Historical examples · 2026</p>{about}</div>
   {view==='history'?<History model={model} mode={mode} onWeek={openWeek}/>:<>
    <WeekChips label="Example week" weeks={history.weeks.map(w=>w.week)} week={weekNumber} onWeek={openWeek}/>
    <div className="real-score-filter-row"><p className="real-score-meta">{filtered?'Selected games':`Week ${weekNumber}`} · {summary.scored} scored examples</p><FilterToggle label="Filter example games" active={filtered}><label>Team<select aria-label="Filter by team" value={team} onChange={e=>{setTeam(e.target.value);setLimit(6);}}><option value="">All teams</option>{Object.entries(TEAM_NAMES).map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label><label>Matchup<select aria-label="Filter by matchup" value={matchup} onChange={e=>{setMatchup(e.target.value);setLimit(6);}}><option value="">All matchups</option>{week.games.map(g=><option key={g.id} value={g.id}>{g.awayName} at {g.homeName}</option>)}</select></label><Button haptic={false} onClick={()=>{setTeam('');setMatchup('');}}>Clear filters</Button></FilterToggle></div>
    {rows.length?<><section className="real-score-hero" aria-label="Example personal score summary"><p className="real-play-eyebrow">{filtered?'SELECTED GAMES':`WEEK ${weekNumber}`} · {market.toUpperCase()} · EXAMPLE</p><div className="real-score-total"><span className="real-score-ring" role="img" aria-label={hero.meterLabel} style={{'--score-angle':`${hero.share*360}deg`}}><span><b>{number(hero.points)}</b><small>of {rows.length*10}</small></span></span><div><h3>Accuracy points</h3><p className="real-score-meta">{summary.scored} scored games</p><p className="real-score-exacts"><Target size={17} aria-hidden="true"/>{rows.filter(r=>r.points===10).length} exact guesses</p></div></div><p className="real-score-meta">{hero.line}</p></section>
    <div className="real-score-games" aria-label={`Week ${weekNumber} ${market} example games`}>{rows.slice(0,limit).map(r=>{const v=rowView(r,mode);return <button type="button" key={r.game.id} className="real-score-game" data-score-game={r.game.id} onClick={()=>openGame(r.game.id)} aria-label={`Open ${r.game.awayName} at ${r.game.homeName}: ${r.points} of 10 example points`}><div className="real-score-game-top"><Matchup game={r.game}/><span className="real-score-pill" data-tier={v.pill.tier}>{v.pill.text}</span></div><Pair row={r} mode={mode}/><div className="real-score-row-end"><span>{v.bullseye?<><Target size={13} aria-hidden="true"/>Exact guess</>:`Off by ${number(Math.abs(r.guess-r.reference.value))}`}</span><span>{date(r.game.kickoff)} <ArrowRight size={14} aria-hidden="true"/></span></div><span className="real-score-bar" aria-hidden="true"><span style={{width:`${v.share*100}%`}}/></span></button>;})}</div>
    {limit<rows.length?<Button haptic={false} onClick={()=>setLimit(rows.length)}>Show all {rows.length} games</Button>:null}</>:<section className="real-score-empty"><h3>No games match these filters</h3><Button haptic={false} onClick={()=>{setTeam('');setMatchup('');}}>Clear filters</Button></section>}
   </>}
  </>}
  <p className="real-score-source">Sample guesses · historical closing references<br/><a href={model.source.release} target="_blank" rel="noopener">nflverse · CC BY 4.0</a> · no account data</p>
 </section>;
}
function Game({row,mode,week,model}){
 const v=gameView({row,mode,week}),line={...v.line,line:{...v.line.line,label:'Reference'},you:{...v.line.you,label:'Sample'},caption:mode==='guess_total'?'Combined points':v.line.caption.replace(/^\w+/,code=>short(code)),aria:`Historical closing reference ${pick(mode,row.game,row.reference.value)}, sample guess ${pick(mode,row.game,row.guess)}, ${v.sentence}`};
 return <><article className="real-score-detail"><div className="real-score-heading"><p className="real-score-meta">Week {week} · {mode==='guess_total'?'Total':'Spread'} · Example</p><InfoButton title="About this example game" body={[
  'This is a visual scoring example using a recorded historical closing benchmark and a fictional sample guess. It is not a saved player receipt.',
  `Historical reference: ${pick(mode,row.game,row.reference.value)}. Sample guess: ${pick(mode,row.game,row.guess)}. Example score: ${number(row.points)} of 10.`,
  'The live app’s saved qualifying reference, source and observed time remain authoritative. This static archive has no verified submission/observation time or three-book consensus; none is invented.',
  'The spread axis is the reference-favored team’s winning margin; negative values on that axis mean losing. The boxes retain sportsbook signs. Total is combined points.',
  `Recorded final: ${row.game.awayName} ${row.game.recordedFinal.away}, ${row.game.homeName} ${row.game.recordedFinal.home}. The final score does not determine this line-guess accuracy.`,model.source.credit
 ]} links={[{text:'Public historical source',url:model.source.schedule}]}/></div><Matchup game={row.game} large/><div className="real-score-detail-points"><b>{number(v.points)}</b><span>/ 10 example points</span></div><h3>{v.bullseye?'Exact guess':v.sentence}</h3><NumberLine line={line}/><Pair row={row} mode={mode}/><p className="real-score-meta">Each half point off costs 1 point.</p></article></>;
}
function History({model,mode,onWeek}){
 const weeks=model.history.weeks.map(w=>{const entry=ownEntry(w,model.history.viewer,mode),rows=scoreRows(w,entry),hero=heroModel({mode,week:w.week,entry,rows});return{week:w.week,rows,hero};});
 return <section className="real-score-history"><div><p className="real-play-eyebrow">THREE SAMPLE WEEKS</p><h3>Your accuracy over time</h3><p className="real-score-meta">Example points per game · fixed 0–10 scale</p></div><div className="real-score-history-axis" aria-hidden="true"><span>0</span><span>10</span></div><div className="real-score-history-bars">{weeks.map(w=><button type="button" key={w.week} data-history-week={w.week} onClick={()=>onWeek(w.week)} aria-label={`Open Week ${w.week}: ${w.hero.points} of ${w.rows.length*10} sample points`}><span className="real-score-history-label"><strong>Week {w.week}</strong><b>{(w.hero.points/w.rows.length).toFixed(1)}<small> / game</small></b></span><span className="real-score-history-track"><span style={{width:`${w.hero.share*100}%`}}/></span><span className="real-score-history-caption">{w.hero.points} / {w.rows.length*10} points · {w.rows.length} games<ArrowRight size={14} aria-hidden="true"/></span></button>)}</div><p className="real-score-meta">Each bar opens that week’s games. Spread and Total remain separate.</p></section>;
}
