import React,{useRef,useState} from 'react';
import {Check} from 'lucide-react';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {IsolatedEplFantasyView} from './isolated-epl-fantasy.jsx';
import {fantasyExample} from './epl-fantasy-examples.mjs';
import '../../web/src/next/epl/fantasy/fantasy.css';
import '../../web/src/next/charts/charts.css';
export function EplFantasyPreview({scenario='matchup'}){
 const fixture=useRef(fantasyExample(scenario)),f=fixture.current,[section,setSection]=useState(f.section),[notice,setNotice]=useState('');
 return <section className="real-epl-fantasy real-epl-home real-epl real-account real-play" aria-label="FEPL Fantasy visual review">
  <div className="real-account-preview-head"><p className="real-play-eyebrow">FICTIONAL TEAMS & PLAYERS · SAMPLE POINTS</p><InfoButton title="About these Fantasy examples" body={[
   'The four existing FEPL Fantasy tabs use their native presentation components: Matchup, Standings, Rosters, Insights and WeeklyLine. All managers, players, lineups, matchweeks, projections, results, records and inferred pairing metadata in this review are fictional. Club crests identify the existing catalog, not actual player affiliations.',
   'The native panels describe the production Sleeper source. These examples were not read from Sleeper and are not saved snapshots. The preview footer replaces saved-source/time claims with an illustrative-data label. No capture time is invented. All eight sample teams have eleven starters and three bench players.',
   'The sample starter projections sum to 104.2. Win chance is calculated by the existing pure winChance helper against 98.6, with the native estimated 18-point swing. The displayed matchup pairing and repeat metadata are fixture illustrations, not a verified real schedule. Use About win chance for the existing estimate explanation.',
   'Standings retain native order from the normalized view, W–L, proportional bars, your highlighted row and expandable total/bonus breakdown. Sample totals already include the bonus; the preview never adds it a second time. Missing values remain dashes, with no filled bar.',
   'Weekly points use the existing chart, line segmentation, league-average arithmetic, high-score marker and accessible text. The main examples are populated. Deliberate missing-data variants break the line instead of drawing zero; a later single point remains a dot. Recent projected/actual bars and no-projection wording remain native.',
   'Tabs switch locally and standings rows expand. Retry shows a no-read notice and preserves the failed state. Native loading, manager-only, feature-off, no-data and three unavailable-matchup reasons are retained. Refused reads contain no example league data; switching tabs cannot expose it.',
   'No Fantasy API/auth/provider read, persistent storage, polling, controller, save, roster change or external navigation runs. New avatars/profile-photo options and awards remain held. Real source completeness, private membership, current roster accuracy, inferred opponents and device acceptance require separate evidence.',
  ]}/></div>
  <h1>FEPL Fantasy</h1>
  <IsolatedEplFantasyView state={f.state} section={section} onSection={setSection} onRetry={()=>setNotice('Retry preview only. No league was read and no saved data changed. The failed state stays unchanged.')}/>
  {notice?<p className="real-commissioner-notice" role="status"><Check size={17} aria-hidden="true"/>{notice}</p>:null}
  <p className="real-epl-home-note">Illustrative FEPL data · no live reads or roster changes</p>
 </section>;
}
