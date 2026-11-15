import { useState } from 'react';
import PropModelPanels from './PropModelPanels.jsx';
import { buildParlayIdeas, parlayLegStatus, propCategory } from '../../../../shared/parlay-research.mjs';
import { Button } from '../ui/index.js';

const categories = ['All props', 'Touchdowns', 'Passing', 'Rushing', 'Receiving', 'Other props'];
const odds = value => value > 0 ? `+${value}` : String(value).replace('-', '−');
const time = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Unavailable';

function Leg({a, onOpen}) {
  const support = a.evidence?.find(e => e.eligible && e.stance === 'support');
  const risk = a.evidence?.find(e => e.eligible && e.stance === 'oppose');
  return <div className="gx-lab-leg">
    <div className="gx-lab-leg-top"><div><p className="gx-t-meta">{a.gameId.replace('-', ' at ')} · {propCategory(a)}</p><h4 className="gx-t-section">{a.selection.playerName || a.title}</h4></div><strong className="gx-lab-price">{a.quote ? odds(a.quote.odds) : '—'}</strong></div>
    <p className="gx-lab-selection">{a.title}</p>
    <p className="gx-t-meta">{a.quote ? `${a.quote.source} · Recorded ${time(a.quote.observedAt)}` : 'No current sportsbook line'}</p>
    {a.offers?.length>1?<details className="gx-ra-evidence"><summary>Compare {a.offers.length} books</summary>{a.offers.map(q=><p className="gx-t-meta" key={q.book}>{q.source} · {odds(q.odds)} · {time(q.observedAt)}</p>)}</details>:null}
    <div className="gx-lab-reason"><span className="gx-t-label">Why it fits</span><p>{support?.statement || 'No verified supporting evidence yet.'}</p></div>
    <div className="gx-lab-reason gx-lab-risk"><span className="gx-t-label">Risk to watch</span><p>{risk?.statement || 'Historical performance is not a forecast. Role, injuries and game script can change the outcome.'}</p></div>
    <button type="button" className="gx-ra-link gx-lab-link" onClick={()=>onOpen(a.routeId)}>Evidence & sources →</button>
  </div>;
}
export default function ParlayLab({ data, renderDetail, onOpen, onUnlock, onRefresh }) {
  const [category, setCategory] = useState('All props'), [size, setSize] = useState(2), [tab,setTab]=useState('Ideas');
  const [saved,setSaved]=useState([]);
  const now = Date.parse(data.now);
  const props = data.assessments.filter(a => a.selection.market === 'prop');
  const cards = props.filter(a => category === 'All props' || propCategory(a) === category);
  const ideas = buildParlayIdeas(cards, { now, size });
  const locked=(data.coverage?.games||[]).some(g=>!g.closed&&(!g.spreadAccessible||!g.totalAccessible));
  const toggle=idea=>setSaved(list=>list.some(i=>i.id===idea.id)?list.filter(i=>i.id!==idea.id):[...list,idea]);
  return <section className="gx-lab gx-vstack gx-gap-12" aria-labelledby="gx-parlay-title">
    <div className="gx-lab-intro"><p className="gx-t-label">NFL RESEARCH</p><h2 className="gx-t-title" id="gx-parlay-title">Parlay Lab</h2><p className="gx-t-body">The price. The case. The catch.</p></div>
    <div className="gx-lab-tabs" role="group" aria-label="Parlay Lab sections">{['Ideas','Projections','Matchups'].map(t=><button type="button" key={t} aria-pressed={t===tab} onClick={()=>setTab(t)}>{t}</button>)}</div>
    <div className="gx-lab-controls"><label className="gx-ra-select gx-t-meta">Category<select aria-label="Research board" value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>{tab==='Ideas'?<label className="gx-ra-select gx-t-meta">Ticket size<select aria-label="Legs" value={size} onChange={e=>setSize(Number(e.target.value))}><option value={2}>2 legs</option><option value={3}>3 legs</option></select></label>:null}</div>
    {tab==='Ideas'?<>
      <div className="gx-lab-section-heading"><h3 className="gx-t-section">Suggested parlays</h3><span className="gx-t-meta">{ideas.length} available</span></div>
      <p className="gx-t-meta">Same book. Different games. Source-backed research, not guaranteed winners.</p>
      <div className="gx-parlay-grid">{ideas.map((idea,index)=><article className="gx-parlay-card gx-lab-ticket" key={idea.id}>
        <header className="gx-lab-ticket-head"><div><p className="gx-t-label">{size}-LEG IDEA {index+1}</p><h3 className="gx-t-section">{idea.source}</h3></div><span className="gx-lab-badge">Research lean</span></header>
        {idea.why?.length ? <p className="gx-lab-thesis gx-t-body">{idea.why[0]}</p> : null}
        {idea.legs.map(a=><Leg key={a.id} a={a} onOpen={onOpen}/>)}
        <footer className="gx-lab-ticket-footer"><div className="gx-lab-section-heading"><span className="gx-t-meta">Combined sportsbook price</span><strong>Not quoted</strong></div><p className="gx-t-meta">Verify this combination at {idea.source}. One losing leg can lose the ticket.</p><Button variant="primary" block onClick={()=>toggle(idea)}>{saved.some(i=>i.id===idea.id)?'Remove from shortlist':'Shortlist this idea'}</Button><details className="gx-ra-evidence"><summary>Price & correlation caveats</summary>{idea.risks?.map(r=><p className="gx-t-meta" key={r}>{r}</p>)}<p className="gx-t-meta">Quotes expire {time(idea.expiresAt)}. No combined payout or joint probability is calculated. Different games are not necessarily independent.{idea.sharedEvidence?' These legs share underlying evidence.':''}</p></details></footer>
      </article>)}</div>
      {!ideas.length?<article className="gx-parlay-card gx-lab-empty" role="status"><span className="gx-lab-empty-mark" aria-hidden="true">◇</span><h3 className="gx-t-section">No ready-to-review ticket yet</h3><p className="gx-t-body">{locked?'Some games are locked. Lock both Spread and Total guesses for a game in Play to reveal its props.':cards.some(a=>a.quote)?`Not enough compatible, source-backed ${size}-leg ideas at one sportsbook. Available individual props are below.`:'Current sportsbook prop lines are unavailable. Historical projections alone cannot produce a priced parlay.'}</p><p className="gx-t-meta">We will not fill this space with invented odds or unsupported picks.</p>{locked&&onUnlock?<Button variant="primary" onClick={onUnlock}>Open Play to unlock games</Button>:null}{onRefresh?<Button variant="secondary" onClick={onRefresh}>Check published research</Button>:null}<Button variant="secondary" onClick={()=>setTab('Projections')}>Explore player projections</Button></article>:null}
      {saved.length?<aside className="gx-parlay-card gx-vstack gx-gap-12" aria-label="Session shortlist"><h3 className="gx-t-section">Your shortlist · {saved.length}</h3><p className="gx-t-meta">This session only. A shortlist is not a placed bet. Recheck prices before using it.</p>{saved.map(idea=><div key={idea.id}><p className="gx-t-body">{idea.legs.map(a=>a.title).join(' + ')}</p><p className="gx-t-meta">{idea.legs.some(a=>parlayLegStatus(a,now))?'Quote or evidence needs rechecking':idea.source}</p><Button variant="secondary" onClick={()=>toggle(idea)}>Remove idea</Button></div>)}</aside>:null}
      <details className="gx-ra-evidence" open={!ideas.length}><summary>Individual prop research · {cards.length}</summary><div className="gx-parlay-grid">{cards.slice(0,12).map(a=><article className="gx-parlay-card" key={a.id}><Leg a={a} onOpen={onOpen}/><details className="gx-ra-evidence"><summary>Full assessment</summary>{renderDetail(a)}</details></article>)}</div></details>
    </>:<PropModelPanels research={data.propResearch} assessments={props} category={category} view={tab.toLowerCase()}/>}
    <p className="gx-t-meta">Research only · No wagers are placed here. Projections are experimental historical baselines, not betting edges.</p>
  </section>;
}
