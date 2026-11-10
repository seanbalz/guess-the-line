import React,{useRef,useState} from 'react';
import {ArrowLeft,Check,ChartNoAxesCombined} from 'lucide-react';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Skeleton} from '../../web/src/next/ui/Skeleton.jsx';
import {isClosed,ownGuess,parsePrice,guessProblem} from '../../web/src/next/epl/guess/guessModel.js';
import {validGuessPrice} from '../../shared/epl-moneyline.mjs';
import {GuessList,GuessLeaderboard} from './isolated-epl-moneyline.jsx';
import {moneylineExample} from './epl-moneyline-examples.mjs';
export function EplMoneylinePreview({scenario='entry'}){
 const fixture=useRef(moneylineExample(scenario)),f=fixture.current,[state,setState]=useState(f.state),[selected,setSelected]=useState(null),[view,setView]=useState(f.view),[notice,setNotice]=useState('');
 function noAction(label){setNotice(`${label} preview only. No guess was saved or locked, no board/reference was read, and no account data or quote changed. The example state stays unchanged.`);}
 function editable(eventId){const game=state.data?.fixtures.find(g=>g.eventId===eventId);return game&&state.data.available&&state.data.ownerId&&!state.busy&&!state.uncertain&&state.status==='ready'&&!isClosed(game,f.now)&&ownGuess(state.data,eventId)?.status!=='locked';}
 function edit(eventId,patch){if(!editable(eventId))return;setState(s=>({...s,drafts:{...s.drafts,[eventId]:{club:ownGuess(s.data,eventId)?.club??'',price:String(ownGuess(s.data,eventId)?.price??'+100'),...s.drafts[eventId],...patch}}}));}
 function save(eventId,lock){if(!editable(eventId))return;const draft=state.drafts[eventId]??ownGuess(state.data,eventId),game=state.data.fixtures.find(g=>g.eventId===eventId);if(!draft||![game.home,game.away].includes(draft.club)||!validGuessPrice(parsePrice(draft.price)))return;noAction(lock?'Lock-in':'Draft save');}
 const fixedLabel=scenario==='results'?'RULE-MATH RESULTS · NO BOOKMAKER QUOTES':scenario==='saved-draft'?'ILLUSTRATIVE SAVED DRAFT · NO SAVE PERFORMED':'FICTIONAL MATCHUPS · SAMPLE GUESSES ONLY';
 return <section className="real-epl-moneyline real-epl-home real-epl real-account real-play" aria-label="EPL moneyline mathematical visual review">
  <div className="real-account-preview-head"><p className="real-play-eyebrow">{view==='leaderboard'?'RULE-MATH STANDINGS · NOT PLAYER RECORDS':fixedLabel}</p><InfoButton title="About these moneyline examples" body={[
   'These are selected Prism Glass mockups of the existing 2-way draw-no-bet moneyline game and leaderboard. Sample guesses are editable in memory; no bookmaker odds, real fixture pairings/kickoffs, saved references, quote observation times, private guesses or real player records are supplied.',
   'The matchup dates use an internal fixed year-2000 test clock solely for ordering and closure. Visible cards say illustrative matchup with no live kickoff. Full club names and registered crests identify the selected club catalog; each mark keeps a separate glass background.',
   'Native GuessList, GuessCard, PriceStepper, DistanceLine and GuessLeaderboard presentation are isolated from controllers/APIs. Adaptations suppress Button haptics, use full club names/crests, replace visible test kickoff text, keep long typed values readable and retain local drafts across preview navigation. Native parse/step/visibility/closure/price-validity helpers remain unchanged.',
   'The five-point controls use the native American-price line. −100 and +100 are the same point; stepping across even odds remains native. Whole typed prices, validation and storage bounds are retained. Local edits do not save, lock, reveal or fetch anything.',
   'Lock in and Save draft show no-action notices only. The separate saved-draft, locked, busy and uncertain examples are fixed fixtures, not results of pressing those buttons. A draft is not locked/scored. Stale or uncertain entry stays paused; checking saved guesses here performs no read and cannot resolve uncertainty. Busy is fixed without automatic completion.',
   'In the results example, −120 versus +120 gives 40 points off under the existing pure distance helper. That comparison is mathematics, not a bookmaker quote. Its preview label says Example reference and omits saved-median/source/observation claims. Pending and permanently unscored keep the native distinct guidance and missing reference as —, never zero. The comparison line is schematic; the explicit number states the distance.',
   'The leaderboard is calculated by the unchanged pure leaderboard helper from synthetic distances only. Lower average wins; an equal average favors more scored matches. Zero is a genuine mathematical zero. An all-unscored example has no average/rank and no meter. None of these numbers are account performance or real sportsbook evidence.',
   'The native per-match reveal helper is unchanged. Entry fixtures contain no opponent rows. Results contain only fictional locked opponent examples, available after the example own lock. Another manager’s draft is never displayed. No real unrevealed information is placed in this preview.',
   'Leaderboard navigation retains local drafts and returns in memory, so no browser discard confirmation is needed here. Week/refresh/retry actions are no-ops and never pretend to load saved data. No API/auth/provider request, polling, persistent storage, clock timer, actual save/lock/readback, budget change or message occurs. New avatar/photos and awards remain held.',
  ]}/></div>
  <h1>{view==='leaderboard'?'Moneyline leaderboard':'Guess the Line'}</h1>
  {view==='leaderboard'?<>
   <Button variant="ghost" haptic={false} onClick={()=>setView('guesses')}><ArrowLeft size={17} aria-hidden="true"/>Back to sample guesses</Button>
   {f.leaderboardStatus==='loading'?<Skeleton label="Loading moneyline leaderboard" shape="panels"/>:f.leaderboardStatus==='failed'?<div className="real-moneyline-problem"><p>{guessProblem({status:503})}</p><Button haptic={false} onClick={()=>noAction('Leaderboard retry')}>Try again</Button></div>:<><div className="real-moneyline-math"><ChartNoAxesCombined size={22} aria-hidden="true"/><p>Rule-math example · synthetic distances<br/>Lower average is better</p></div><GuessLeaderboard data={f.leaderboard}/></>}
  </>:<GuessList id="example-moneyline" state={state} now={f.now} selected={selected} onSelect={setSelected} onEdit={edit} onSave={save} onReload={()=>{if(!state.busy)noAction('Saved-data check');}} onWeek={()=>noAction('Matchweek')} onNavigate={()=>setView('leaderboard')} guardNavigation={false}/>}
  {notice?<p className="real-commissioner-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  <p className="real-epl-home-note">Visual/mathematical examples · no live odds or saves</p>
 </section>;
}
