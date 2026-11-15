import { useState } from 'react';
import PropModelPanels from './PropModelPanels.jsx';
import { buildWeeklyProps, propCategory } from '../../../../shared/parlay-research.mjs';
import { propStat } from '../../../../shared/player-props.mjs';
import { Button } from '../ui/index.js';

const categories = ['All props', 'Touchdowns', 'Passing', 'Rushing', 'Receiving', 'Other props'];
const odds = value => value > 0 ? `+${value}` : String(value).replace('-', '−');
const time = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Unavailable';

function PropRow({ a, rank, onOpen }) {
  const support = a.evidence.find(e => e.eligible && e.stance === 'support' && e.sourceUrl);
  const sources = [...new Map(a.evidence.filter(e=>e.eligible&&e.stance==='support'&&e.sourceUrl).map(e=>[e.sourceUrl,e])).values()];
  const stat = propStat(a.selection.key)?.label || propCategory(a);
  const selection = `${a.selection.side} ${Number.isFinite(a.selection.line) ? a.selection.line : ''} ${stat}`.trim();
  return <li className="gx-weekly-prop">
    <article aria-labelledby={`weekly-prop-${rank}`}>
      <header className="gx-weekly-prop-head">
        <span className="gx-weekly-rank" aria-label={`Research rank ${rank}`}>{rank}</span>
        <div><h4 id={`weekly-prop-${rank}`} className="gx-t-section">{a.selection.playerName}</h4><p className="gx-t-meta">{a.gameId.replace('-', ' at ')} · Kickoff {time(a.kickoff)}</p></div>
      </header>
      <div className="gx-weekly-quote">
        <div><span className="gx-t-meta">Line</span><p className="gx-weekly-selection">{selection}</p></div>
        <div><span className="gx-t-meta">Price</span><strong className="gx-lab-price">{odds(a.quote.odds)}</strong></div>
      </div>
      <p className="gx-t-meta gx-weekly-book"><strong>{a.quote.source}</strong><span>Recorded <time dateTime={a.quote.observedAt}>{time(a.quote.observedAt)}</time></span><span>Expires {time(a.quote.expiresAt)}</span></p>
      <div className="gx-weekly-case"><div><h5>Why this prop</h5><p>{support.statement}</p></div><div><h5>Risk to watch</h5><p>{support.assumptions?.[0] || 'Historical performance is not a forecast. Role, injuries and game script can change the outcome.'}</p></div></div>
      <footer className="gx-weekly-evidence">
        <details className="gx-ra-evidence"><summary>Sources & book comparison</summary>
          {sources.map(e=><p className="gx-t-meta" key={e.sourceUrl}><a className="gx-ra-link" href={e.sourceUrl} target="_blank" rel="noreferrer">{e.label || e.sourceId || 'Research source'}</a>{e.sample?.count ? ` · ${e.sample.count} ${e.sample.unit || 'observations'}` : ''}</p>)}
          {a.offers.map(q=><p className="gx-t-meta" key={q.book}>{q.source}: {odds(q.odds)} · Recorded {time(q.observedAt)}</p>)}
          <p className="gx-t-meta">Prices are individual sportsbook quotes. Verify availability with the book.</p>
        </details>
        {onOpen?<button type="button" className="gx-ra-link gx-weekly-detail" onClick={()=>onOpen(a.routeId)}>Full research</button>:null}
      </footer>
    </article>
  </li>;
}

export default function ParlayLab({ data, onOpen, onUnlock, onRefresh }) {
  const [category, setCategory] = useState('All props'), [tab, setTab] = useState('Top props');
  const props = (data.assessments ?? []).filter(a => a.selection?.market === 'prop');
  const ranked = buildWeeklyProps(props, { now:Date.parse(data.now) });
  // Category is a view of the weekly twenty, not a new ranking per category.
  const cards = ranked.map((a,index)=>({a,rank:index+1})).filter(({a})=>category==='All props'||propCategory(a)===category);
  const locked = (data.coverage?.games || []).some(g=>!g.closed&&(!g.spreadAccessible||!g.totalAccessible));
  return <section className="gx-lab gx-vstack gx-gap-12" aria-labelledby="gx-parlay-title">
    <div className="gx-lab-intro"><h2 className="gx-t-title" id="gx-parlay-title">Weekly props</h2><p className="gx-t-body">Up to 20 individual props, with the price and the research behind each one.</p></div>
    <div className="gx-lab-tabs" role="group" aria-label="Weekly research sections">{['Top props','Projections','Matchups'].map(t=><button type="button" key={t} aria-pressed={t===tab} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {tab==='Top props'?<>
      <div className="gx-weekly-heading"><h3 className="gx-t-section">This week's top props</h3><p className="gx-t-meta">{ranked.length} of up to 20 available</p></div>
      <details className="gx-ra-evidence gx-weekly-method"><summary>How these are ranked</summary><p className="gx-t-body">Research priority, not win probability or expected profit. Ordered by the number of sourced supporting datasets, then documented sample coverage, then quote recency. Ties use a stable identifier.</p><p className="gx-t-meta">Sample coverage credits up to 8 observations per dataset, at most 40 total; repeated claims from the same dataset count once. One prop per player and statistic. Alternate lines, sides and books do not fill extra places. The best available individual price is shown for each selected line.</p><p className="gx-t-meta">Only pregame quotes less than one hour old with eligible support and no opposing evidence qualify. Coverage is limited to collected books and revealed games. Fewer than 20 is expected when those checks are not met.</p></details>
      <label className="gx-ra-select gx-t-meta gx-weekly-filter">Category<select aria-label="Research board" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
      {locked?<p className="gx-t-meta">Some games are locked. Lock both Spread and Total guesses for a game in Play to reveal its props.{onUnlock?<Button variant="secondary" onClick={onUnlock}>Open Play to unlock games</Button>:null}</p>:null}
      {ranked.length>0&&ranked.length<20?<p className="gx-t-meta">Only {ranked.length} props meet the current quote and research checks. Unavailable picks are not substituted.</p>:null}
      {cards.length?<ol className="gx-weekly-props" aria-label="Weekly top props">{cards.map(({a,rank})=><PropRow key={a.id} a={a} rank={rank} onOpen={onOpen}/>)}</ol>:<div className="gx-parlay-card gx-lab-empty" role="status"><h3 className="gx-t-section">{ranked.length?'No top props in this category':'No eligible props right now'}</h3><p className="gx-t-body">{ranked.length?'Choose All props to see the weekly board.':'Fresh sportsbook lines and sourced supporting research are required. Expired, conflicting and closed-game props are excluded.'}</p>{onRefresh?<Button variant="secondary" onClick={onRefresh}>Check published research</Button>:null}<Button variant="secondary" onClick={()=>setTab('Projections')}>Explore player projections</Button></div>}
    </>:<><label className="gx-ra-select gx-t-meta gx-weekly-filter">Category<select aria-label="Research board" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label><PropModelPanels research={data.propResearch} assessments={props} category={category} view={tab.toLowerCase()}/></>}
    <p className="gx-t-meta">Research only · No wagers are placed here. Historical baselines are experimental, not calibrated betting edges.</p>
  </section>;
}
