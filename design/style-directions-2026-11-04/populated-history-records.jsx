import React,{useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {Button,Icon,InfoButton,Segmented} from '../../web/src/next/ui/index.js';
import {INFO} from '../../web/src/next/info.js';
import {IsolatedHistoryBets,IsolatedHistoryOlder} from './isolated-history-records.jsx';
import {IsolatedHistoryGuess} from './isolated-account-history.jsx';
import {historyExample} from './account-history-examples.mjs';
import {recordsExample} from './history-records-examples.mjs';
export function HistoryRecordsPreview({scenario='bets'}){
 const fixture=useRef(recordsExample(scenario)),guess=useRef(historyExample('weeks')),f=fixture.current,[args,setArgs]=useState(f.args),[notice,setNotice]=useState('');
 const noRead=label=>setNotice(`${label} preview only. No records were read, changed or saved; the example stays unchanged.`);
 function change(patch){if(patch.slipsWeek||patch.slipsSeason){noRead('Slip week');return;}if(patch.season&&args.view==='guess'&&patch.season!==guess.current.read.data.season){noRead('Season');return;}setArgs(a=>({...a,...patch}));setNotice('');}
 const shell={setPageArgs:change},retry=()=>noRead('Retry'),records={...f.records,retry},weeks={...f.weeks,retry},reads=Object.fromEntries(Object.entries(f.reads).map(([k,v])=>[k,{...v,retry}])),slipsRead={...f.slipsRead,retry};
 return <section className="real-history-records real-account-history real-epl-home real-account real-play gx-history" aria-label="Bets weeks and Older records visual review">
  <div className="real-account-preview-head"><p className="real-play-eyebrow">FICTIONAL RECORDS · ENTERED-TERMS & MATH EXAMPLES</p><InfoButton title="About these record examples" body={[
   'These are the existing Account → History → Bets weeks and all seven Older record sections, with the selected glass system. They are read-only review assets. The supplied Guess History direction remains separately approved.',
   'All names, tickets, amounts, selections, outcomes, final scores, notes, forecasts, change events, qualifications, archived comparisons and freeze states here are fictional or mathematical examples. No real private record, actual transaction, fixture, bookmaker quote, source observation or save/archive/freeze timestamp is supplied.',
   'Bets weeks keeps each manager’s native record, net units, qualification and per-game list. Side and units remain visible for a fictional friend whose line is closed; its data contains no line, odds, source, result or time. Result words remain Win, Lost, Push, Void or Pending. Illustrative qualification uses the existing three-picks-or-three-units helper.',
   'Retired Betting Challenge uses the existing pure gradeBet helper on fictional finals, preserving records, removed members, ungraded/hidden counts and read-only selections. The trophy is its existing section icon, not a new award feature.',
   'Saved notes, forecasts and journal entries belong only to the fictional example owner. Note and journal changes are plain words. Archived journal rows remain listed and are excluded from native journal accounting. Sample USD amounts are hypothetical; no payment, wager, currency conversion or sportsbook execution occurs.',
   'Real slip is the existing record category. These are fictional manually entered ticket terms. A sample parlay uses one combined entered price, never multiplied leg prices. The friend’s locked leg carries a side only and no hidden line/price in the fixture.',
   'Older scoring snapshots and benchmark cards are mathematical layout examples, not actual historical imports or freeze evidence. Preview-only metadata explicitly labels illustrative archive/frozen-record layouts and no real source/page/capture/freeze timing. Source URLs and all observation/save/freeze times remain null. Missing/withheld comparisons remain empty, never made up.',
   'Two native feature files are isolated from API/context hooks. Existing formatting, outcome, grouped-week, journal accounting and visibility branches remain. Adaptations inject local read states, suppress Button haptics, use mark-only matchups with full accessible names, and relabel example note/archive/benchmark metadata to avoid false provenance claims.',
   'Tabs, section links, disclosure rows and the two sample Bets weeks work in memory. Slip-week, retry and Back controls only show no-read notices. A records-unavailable state still offers the independent slips section. Loading/failed/empty paths do not invent records. No API/auth/provider read, write, persistent storage, polling, interval, source import or freeze runs. Avatars/photos and awards remain held.',
  ]}/></div>
  <Button variant="ghost" haptic={false} onClick={()=>noRead('Back')}><Icon icon="chevronLeft" size={20}/>Back</Button>
  <div className="real-history-heading"><h1>History</h1><InfoButton title={INFO.history.title} body={INFO.history.body}/></div>
  <Segmented className="real-history-views" label="History view" value={args.view} options={[{value:'guess',label:'Guess'},{value:'bets',label:'Bets'},{value:'older',label:'Older'}]} onChange={view=>change({view,older:null,week:null})}/>
  {args.view==='bets'?<IsolatedHistoryBets args={args} app={f.app} shell={shell} weeks={weeks} reads={reads}/>:args.view==='older'?<IsolatedHistoryOlder args={args} app={f.app} shell={shell} records={records} slipsRead={slipsRead}/>:<IsolatedHistoryGuess args={args} app={guess.current.app} shell={shell} read={{...guess.current.read,retry}} records={guess.current.records} changes={args.week===9?guess.current.changes:{data:{markets:[]}}}/>}
  {notice?<p className="real-commissioner-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  <p className="real-epl-home-note">Illustrative records · no live reads, writes or freezes</p>
 </section>;
}
