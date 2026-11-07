import React,{useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {Button,Icon,Segmented} from '../../web/src/next/ui/index.js';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {INFO} from '../../web/src/next/info.js';
import {IsolatedHistoryGuess} from './isolated-account-history.jsx';
import {historyExample} from './account-history-examples.mjs';
import '../../web/src/next/me/history.css';
export function AccountHistoryPreview({scenario='weeks'}){
 const fixture=useRef(historyExample(scenario)),f=fixture.current,[args,setArgs]=useState(f.args),[notice,setNotice]=useState('');
 function change(patch){if(patch.season&&patch.season!==f.read.data?.season){setNotice('Season preview only. No history was read; the current example and selection stay unchanged.');return;}setArgs(a=>({...a,...patch}));}
 const about=<InfoButton title="About these History examples" body={[
  'These are the existing Account → History → Guess weeks, an opened week and owner-only change timeline, restyled with the selected glass system. Earlier Play score/history visuals do not substitute for this page. Bets weeks and Older records remain in the next review batch.',
  'All names, guesses, comparisons, points, eligibility/sit-out states, matchups and changes here are fictional or mathematical examples. The internal year-2000 clock controls only closed versus active draft illustrations; it is not a real NFL kickoff. No actual saved history or private picks are included.',
  'For scored examples only, the native row label is adapted to Example comparison and its detail says rule-math with no bookmaker quote or observation time. Values are inputs to the existing 10 minus two times the absolute gap formula, floored at zero. They are not submitted scoring references or real sportsbook lines.',
  'Native entry/status/points/game/change formatting is retained. Pending references stay pending. An unlocked draft remains unscored and closes at its illustrated kickoff. A sit-out keeps its recorded status and any already locked guesses that still count. Practice/ineligible is separate from scored zero.',
  'Another fictional member has only hidden markers, never guess/reference values or an owner change list. Removed members stay listed. Your own change timeline illustrates draft edits followed by lock-in; it never offers editing after lock. No real save, observation, submission or change timestamps are invented.',
  'Player/market/week/back controls affect local memory. Season and retry controls show no-read notices rather than pretending to fetch different records. Optional records/change failures preserve the independent week history. No API/controller, auth/provider read, persistent storage, polling, clock timer, save or account change runs.',
  'Each native matchup uses codes=false and separate registered logo tiles, keeping its full accessible name. New avatar/photos and awards stay held. Current server visibility, source provenance, real records, device behavior and whole-app completion require separate evidence.',
 ]}/>;
 return <section className="real-account-history real-epl-home real-account real-play gx-history" aria-label="Account Guess History visual review">
  <div className="real-account-preview-head"><p className="real-play-eyebrow">FICTIONAL HISTORY · RULE-MATH EXAMPLES</p>{about}</div>
  <Button variant="ghost" haptic={false} onClick={()=>setNotice('Back preview only. No account page was opened or changed.')}><Icon icon="chevronLeft" size={20}/>Back</Button>
  <div className="real-history-heading"><h1>History</h1><InfoButton title={INFO.history.title} body={INFO.history.body}/></div>
  <Segmented className="real-history-views" label="History view" value="guess" options={[{value:'guess',label:'Guess'},{value:'bets',label:'Bets'},{value:'older',label:'Older'}]} onChange={()=>setNotice('Bets weeks and Older records are the next visual batch. This Guess example stays unchanged; no records were read.')}/>
  <IsolatedHistoryGuess args={args} app={f.app} shell={{setPageArgs:change}} read={{...f.read,retry:()=>setNotice('Retry preview only. No history was read and the failed example stays unchanged.')}} records={f.records} changes={args.week===9?f.changes:{data:{markets:[]}}}/>
  {notice?<p className="real-commissioner-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  <p className="real-epl-home-note">Illustrative History · no real records or saves</p>
 </section>;
}
