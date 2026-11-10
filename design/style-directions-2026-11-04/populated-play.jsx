// Visual-only adapter: original picker and modal; no account, API, storage or save imports.
import React, {useEffect, useRef, useState} from 'react';
import {GuessPicker, GUESS_HELP} from '../../web/src/next/play/GuessPicker.jsx';
import {Dialog} from '../../web/src/next/ui/Dialog.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {Check, LockKeyhole, ArrowRight, ShieldCheck} from 'lucide-react';

const show=n=>Number.isInteger(n)?String(n):n.toFixed(1);
const call=(mode,n)=>mode==='guess_total'?`${show(n)} combined points`:n===0?'Even game · Pick’em':`${n<0?'Seahawks':'Cardinals'} by ${show(Math.abs(n))}`;
export function PlayPreview({model,initialMode,onMode}){
 const [mode,setMode]=useState(initialMode),[values,setValues]=useState({guess_spread:-3,guess_total:44.5}),[locked,setLocked]=useState({}),[confirm,setConfirm]=useState(false);
 const receipt=useRef(null);
 const game=model.boardGames.find(g=>g.away==='ARI'&&g.home==='SEA');
 const market=mode==='guess_total'?'Total':'Spread',other=mode==='guess_total'?'Spread':'Total',value=values[mode],isLocked=locked[mode]!==undefined;
 const valid=value!==''&&value!==null&&Number.isFinite(Number(value));
 useEffect(()=>{onMode?.(market);},[market,onMode]);
 const kickoff=new Intl.DateTimeFormat('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/Los_Angeles'}).format(new Date(game.kickoff));
 function complete(){setLocked(previous=>({...previous,[mode]:Number(value)}));setConfirm(false);requestAnimationFrame(()=>receipt.current?.focus({preventScroll:true}));}
 function changeMode(next){setMode(next);setConfirm(false);}
 return <section className="real-play" aria-label="Play draft and lock-in preview" data-mode={mode}>
  <div className="real-play-market" role="group" aria-label="Guess market">{[['guess_spread','Spread'],['guess_total','Total']].map(([id,label])=><button type="button" key={id} aria-pressed={mode===id} onClick={()=>changeMode(id)}>{locked[id]!==undefined?<Check aria-hidden="true" size={16}/>:null}{label}</button>)}</div>
  <article className="real-play-matchup">
   <div className="real-play-meta"><span>Week {game.week} · {kickoff} PT</span><span className="real-play-badge">Snapshot</span></div>
   <div className="real-play-teams">{[game.away,game.home].map((code,i)=><React.Fragment key={code}>{i?<span className="real-play-at">at</span>:null}<div className="real-play-team"><span className="real-play-logo"><img src={`team-logos/${code.toLowerCase()}.png`} alt=""/></span><strong>{model.teams.find(t=>t.code===code).name}</strong><small>{model.teams.find(t=>t.code===code).record}</small></div></React.Fragment>)}</div>
   <div className="real-play-market-lock"><LockKeyhole aria-hidden="true" size={16}/><span>{isLocked?'Preview only · no sportsbook quotes':'Line hidden until you lock this guess'}</span></div>
  </article>
  {isLocked?<article className="real-play-entry real-play-receipt" ref={receipt} tabIndex={-1} aria-label={`${market} preview confirmation`}>
   <span className="real-play-confirm-icon"><ShieldCheck aria-hidden="true" size={30}/></span><p className="real-play-eyebrow">PREVIEW CONFIRMED · {market.toUpperCase()}</p><h3>{call(mode,locked[mode])}</h3><p>This game’s {market} guess is final.</p><div className="real-play-rule"><Check aria-hidden="true" size={17}/><span>{other} stays separate.</span></div>
   <Button variant="primary" haptic={false} onClick={()=>changeMode(mode==='guess_spread'?'guess_total':'guess_spread')}>Open {other}<ArrowRight aria-hidden="true" size={18}/></Button>
   <button type="button" className="real-play-reset" onClick={()=>{setLocked({});setValues({guess_spread:-3,guess_total:44.5});}}>Restart visual demo</button>
  </article>:<article className="real-play-entry">
   <div className="real-play-entry-head"><div><p className="real-play-eyebrow">YOUR {market.toUpperCase()} GUESS</p><h3>{mode==='guess_spread'?'Who’s the favorite?':'How many combined points?'}</h3></div><InfoButton title={`About ${market} guesses`} body={[GUESS_HELP[mode],'A locked-in guess is final for this game and market. The other market and other games remain separate.','Visual demo: the prefilled numbers are sample user guesses, not sportsbook quotes or a player’s saved picks. Changes stay in memory and never save to an account.','This matchup and its records come from the November 5 public research snapshot. In the live app, a successful lock-in is confirmed by a fresh server read before displaying a saved receipt.']} links={[{text:'Public research snapshot · nflverse · CC BY 4.0',url:model.source.release}]}/></div>
   <GuessPicker key={mode} mode={mode} value={value} onChange={next=>setValues(previous=>({...previous,[mode]:next}))} away="Cardinals" home="Seahawks" label={`${market} sample guess`}/>
   <div className="real-play-draft-label"><span className="real-play-dot"/>Sample draft · editable</div>
   <Button variant="primary" haptic={false} disabled={!valid} onClick={()=>setConfirm(true)}><LockKeyhole aria-hidden="true" size={18}/>Lock in {market}</Button>
   <p className="real-play-final-note">Final once locked. Just this game. Just {market}.</p>
  </article>}
  <Dialog className="real-play-confirm" open={confirm} title={`Lock in ${market}?`} onClose={()=>setConfirm(false)} text="This guess is final.">
   <div className="real-play-confirm-call"><span>YOUR {market.toUpperCase()} GUESS</span><strong>{valid?call(mode,Number(value)):''}</strong><small>Cardinals at Seahawks · Week {game.week}</small></div>
   <div className="real-play-confirm-rule"><LockKeyhole size={18} aria-hidden="true"/><p>Only this game’s {market} line and picks open. {other} stays separate.</p></div>
   <p className="real-play-dialog-demo">Visual demo · confirmation does not submit a pick</p>
   <Button haptic={false} onClick={()=>setConfirm(false)}>Keep editing</Button><Button variant="primary" haptic={false} onClick={complete}>Confirm lock-in</Button>
  </Dialog>
 </section>;
}
