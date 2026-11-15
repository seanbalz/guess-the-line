import { useState } from 'react';
import { buildParlayIdeas, parlayLegStatus, propCategory } from '../../../../shared/parlay-research.mjs';
import { Button } from '../ui/index.js';

const categories = ['All props', 'Touchdowns', 'Passing', 'Rushing', 'Receiving', 'Other props'];
const odds = value => value > 0 ? `+${value}` : String(value).replace('-', '−');
const time = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Unavailable';

export default function ParlayLab({ data, renderDetail, onOpen }) {
  const [category, setCategory] = useState('All props'), [size, setSize] = useState(2);
  // useAssessments removes expired quotes and reloads at kickoff; never fetch another feed here.
  const now = Date.parse(data.now);
  const props = data.assessments.filter(a => a.selection.market === 'prop');
  const cards = props.filter(a => category === 'All props' || propCategory(a) === category);
  const ideas = buildParlayIdeas(props, { now, size });
  return <section className="gx-vstack gx-gap-12" aria-labelledby="gx-parlay-title">
    <h2 className="gx-t-section" id="gx-parlay-title">Parlay Lab</h2>
    <p className="gx-t-body">Read the case. Check the price. Know what could go wrong.</p>
    <p className="gx-t-meta">NFL player props · research leans, not predictions or guarantees. No wagers are placed here.</p>
    <div className="gx-ra-filters"><label className="gx-ra-select gx-t-body">Research board<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label></div>
    <div className="gx-parlay-grid">
      {cards.map(a => {
        const support = a.evidence.find(e => e.eligible && e.stance === 'support');
        const opposition = a.evidence.find(e => e.eligible && e.stance === 'oppose');
        const status = parlayLegStatus(a, now);
        return <article className="gx-parlay-card gx-vstack gx-gap-12" key={a.id}>
          <p className="gx-t-meta">{propCategory(a)} · {a.gameId.replace('-', ' at ')}</p>
          <h3 className="gx-t-section">{a.title}</h3>
          <p className="gx-n-m">{a.quote ? odds(a.quote.odds) : '—'} <span className="gx-t-body">{a.quote?.source ?? 'No current quote'}</span></p>
          <p className="gx-t-meta">{status ?? 'Research lean'} · {a.quote ? `Recorded ${time(a.quote.observedAt)}` : 'Refresh research to check availability'}</p>
          <div><strong className="gx-t-body">The case</strong><p className="gx-t-body">{support?.statement ?? 'No source-checked supporting claim available.'}</p>{support?.sample ? <p className="gx-t-meta">Sample: {support.sample.count} {support.sample.unit}</p> : null}</div>
          <div><strong className="gx-t-body">The caution</strong><p className="gx-t-body">{opposition?.statement ?? 'No checked opposing claim published. That is not evidence of low risk. Confirm injuries, role and market terms before relying on this idea.'}</p></div>
          <details className="gx-ra-evidence"><summary>Stats, sources and counterevidence</summary>{renderDetail(a)}</details>
          <Button variant="secondary" onClick={() => onOpen(a.routeId)}>Open full research</Button>
        </article>;
      })}
    </div>
    {!cards.length ? <p className="gx-t-body" role="status">No checked props in this category yet. Both Guess markets must be open for a game; unavailable research is never filled with invented picks.</p> : null}
    <h3 className="gx-t-section">Suggested combinations</h3>
    <label className="gx-ra-select gx-t-body">Legs<select value={size} onChange={e => setSize(Number(e.target.value))}><option value={2}>2 legs</option><option value={3}>3 legs</option></select></label>
    <p className="gx-t-meta">Schedule order, not an edge ranking. Current same-book leans from different games only; opposing evidence excludes a leg. This uses retained best quotes, so coverage can be incomplete.</p>
    <div className="gx-parlay-grid">{ideas.map(idea => <article className="gx-parlay-card gx-vstack gx-gap-12" key={idea.id}>
      <h4 className="gx-t-section">{size}-leg research idea · {idea.source}</h4>
      {idea.legs.map(a => <Button key={a.id} variant="secondary" onClick={() => onOpen(a.routeId)}>{a.title} · {odds(a.quote.odds)}</Button>)}
      <p className="gx-t-body">Combined price unavailable. These individual quotes do not establish that the sportsbook offers this combination.</p>
      <p className="gx-t-meta">{idea.sharedEvidence ? 'Shared underlying data: do not count these as independent confirmations. ' : ''}Different games do not establish statistical independence. No joint probability or payout is calculated.</p>
      <p className="gx-t-meta">Earliest quote expiry: {time(idea.expiresAt)}. Verify all terms at the book. One losing leg can lose a parlay.</p>
    </article>)}</div>
    {!ideas.length ? <p className="gx-t-body" role="status">Not enough current, source-backed {size}-leg combinations from the same book. No suggestion is better than forcing a ticket.</p> : null}
  </section>;
}
