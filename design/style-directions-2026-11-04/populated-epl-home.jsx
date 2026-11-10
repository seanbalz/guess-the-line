import React,{useId,useRef,useState} from 'react';
import {Check,Clock,RefreshCw,ShieldCheck,TriangleAlert} from 'lucide-react';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {DraftBoard} from '../../web/src/next/epl/DraftBoard.jsx';
import {MarginChart} from '../../web/src/next/epl/MarginChart.jsx';
import {PICK_COPY,deadlineLine} from '../../web/src/next/epl/draftModel.js';
import {EplHomeView,DraftReadState,PrimaryAction,StandingsSource} from './isolated-epl-home.jsx';
import {ClaimCardView,claimManagers} from './isolated-epl-claim.jsx';
import {eplHomeExample} from './epl-home-examples.mjs';
export function EplHomePreview({data,scenario='turn'}){
 const f=eplHomeExample(data,scenario),[notice,setNotice]=useState(''),[watching,setWatching]=useState(false),id=useId(),root=useRef(null);
 function action(kind){setNotice(`${kind} preview only. No navigation, claim, pick, queue, progress or saved draft was read or changed. This example stays unchanged.`);}
 const claim=watching?null:<div className="real-epl-link real-epl-home-claim"><ClaimCardView id={`${id}-claim`} managers={watching?[]:claimManagers(f.model)} busy={false} onClaim={()=>action('Manager link')} onWatch={()=>{setWatching(true);setNotice('Watching preview only. The card is hidden in component memory; no browser-session preference or account changed.');requestAnimationFrame(()=>{const h=root.current.querySelector('.gx-screen>h1');h.tabIndex=-1;h.focus({preventScroll:true});});}}/></div>;
 return <section ref={root} className="real-epl-home real-epl real-account real-play" aria-label="Fictional EPL Home and draft recovery visual review">
  <div className="real-account-preview-head"><p className="real-play-eyebrow">{f.home?'FICTIONAL HOME · FIXED COUNTDOWN':'FICTIONAL DRAFT · FIXED RECOVERY STATE'}</p><InfoButton title="About these EPL Home examples" body={[
   'These views carry the selected Prism Glass system into the existing EPL Home and draft-read states. All managers, clubs picked, matchweeks, draft status, counts and remaining time are fictional. No live fixture pairing, kickoff, sportsbook price, saved progress, table or permission is supplied.',
   'Native HOME_COPY, headline, EplHomeView, DraftReadState, PrimaryAction and HomeMoneylineProgress presentation are isolated from API/controllers. Only Button haptics are suppressed. Native boardModel/draftReducer/readProblem/deadlineLine, DraftBoard/MarginChart, Countdown and formatters are reused.',
   'Countdown receives an explicit fixed test time; it never starts its own timer. The year-2000 fixture is an eligibility example only, not a real kickoff. No fixture kickoff line or opponent is invented. The remaining time and any displayed deadline are marked as illustrative.',
   'Home shows your turn, an existing picked club, an unlinked account, all picks in and a locked draft. Unlinked Home has no Your pick or Pick order tiles. Its existing manager chooser is a memory-only example, with no session-storage change.',
   'Moneyline progress is independent of Pick a Team. Ready counts are fictional and contain no guess rows. Read-only, prices-not-verified, loading and idle states retain the native wording/visibility; a progress problem never removes the draft action. No quote or moneyline game is opened here.',
   'Native reducer behavior is retained: a generic first failure has no board and Try again; an ordinary failed refresh retains the last board with stale wording. A 401/403, feature-off or no-week reply drops previously supplied draft data. Refused/off/no-week states have no retry button or board. A retry tap here never fabricates a fresh read.',
   'A stale draft retains native turn eligibility; this preview does not introduce a new saved-data gate or claim the real server accepted a pick. Under review uses the existing locked action and results-under-review wording, without inventing a bonus.',
   'Table fallback metadata is copied from an existing native-view test only to exercise its validated guidance branch. It is not evidence that any standings were fetched or used. The source Info adds an illustrative-only paragraph; its outbound source links are omitted. Native Wikipedia-contributor, not-official and CC BY-SA wording is retained.',
   'The recovery presentation focuses on the existing board/action/status/source section. Previously approved club-pool/ranking/confirmation flows remain separate. All actions produce no-action notices only. No API/auth/provider/permission read, refresh, claim, pick, queue, polling, storage, timer or message occurs. New avatar/photos and awards stay held.',
  ]}/></div>
  {f.home?<EplHomeView model={f.model} state={f.state} now={f.now} moneyline={f.moneyline} claim={scenario==='unlinked'?claim:null} onOpenPick={()=>action('Pick a Team')} onOpenGuess={()=>action('Moneyline')} onRetry={()=>action('Retry')}/>:<div className="real-epl-recovery">
   <h2>Pick a Team</h2>
   {!f.model?<div className="real-epl-recovery-read" data-read={scenario}>{scenario==='loading'?<Clock size={29} aria-hidden="true"/>:<TriangleAlert size={29} aria-hidden="true"/>}<DraftReadState state={f.state} model={f.model} onRetry={()=>action('Retry')}/></div>:<>
    {f.state.stale?<p role="status" className="real-epl-home-stale"><TriangleAlert size={21} aria-hidden="true"/>{PICK_COPY.stale}</p>:null}
    <section className="real-epl-hero real-epl-recovery-board" aria-labelledby={`${id}-board`}><div className="real-epl-section-title"><h3 id={`${id}-board`}>{PICK_COPY.draftLabel(f.model.week)}</h3><ShieldCheck size={21} aria-hidden="true"/></div><DraftBoard model={f.model}/><PrimaryAction model={f.model} selected="AVL" busy={false} onPick={()=>action('Pick')}/><p className="real-epl-home-deadline">Illustrative deadline only<br/>{deadlineLine(f.model)}</p>
     {f.model.standingsSource?<div className="real-epl-home-source"><p>Illustrative table metadata · no table used</p><StandingsSource source={f.model.standingsSource}/></div>:null}
    </section>
    <section className="real-epl-bonus"><h3>{PICK_COPY.bonusTitle}</h3><MarginChart bonus={f.model.bonus} review={f.model.review} clubName={f.model.clubName}/></section>
   </>}
  </div>}
  {notice?<p className="real-commissioner-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  <p className="real-epl-home-note">Illustrative {f.home?'Home/countdown':'read state'} · no live data or saves</p>
  {watching?<Button haptic={false} onClick={()=>{setWatching(false);setNotice('');requestAnimationFrame(()=>root.current.querySelector('.gx-epl-claim>.gx-btn')?.focus({preventScroll:true}));}}><RefreshCw size={17} aria-hidden="true"/>Reset watching example</Button>:null}
 </section>;
}
