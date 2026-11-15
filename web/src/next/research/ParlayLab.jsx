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
  const ideas = buildParlayIdeas(cards, { now, size });
  const matchups = cards.flatMap(a => a.evidence.filter(e => e.eligible && e.family === 'matchup' && e.sourceUrl).map(e => ({ a, e }))).slice(0, 6);
  return <section className="gx-vstack gx-gap-12" aria-labelledby="gx-parlay-title">
    <h2 className="gx-t-section" id="gx-parlay-title">Parlay Lab</h2>
    <p className="gx-t-body">Read the case. Check the price. Know what could go wrong.</p>
    <p className="gx-t-meta">NFL player props · research leans, not predictions or guarantees. No wagers are placed here.</p>
    <div className="gx-ra-filters"><label className="gx-ra-select gx-t-body">Research board<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c}>{c}</option>)}</select></label></div>
    <h3 className="gx-t-section">Projection center</h3>
    <p className="gx-t-body">No qualified projection model is connected. Market lines are not forecasts; projection ranges and model edge remain unavailable.</p>
    <div className="gx-parlay-grid">{cards.slice(0, 6).map(a => <article className="gx-parlay-card gx-vstack gx-gap-12" key={a.id}>
      <h4 className="gx-t-section">{a.selection.playerName ?? a.title}</h4>
      <p className="gx-t-meta">{propCategory(a)} · {a.gameId.replace('-', ' at ')}</p>
      <dl className="gx-parlay-compare"><div><dt>Projection</dt><dd>Unavailable</dd></div><div><dt>Market line</dt><dd>{a.quote ? a.selection.line === null ? `${a.selection.side} · ${a.selection.unit ?? 'binary prop'}` : `${a.selection.side} ${a.selection.line} ${a.selection.unit ?? ''}` : 'Unavailable'}</dd></div></dl>
      <p className="gx-t-meta">Range unavailable · {a.quote ? `${a.quote.source} · Recorded ${time(a.quote.observedAt)}` : 'No current quote'}</p>
      <Button variant="secondary" onClick={() => onOpen(a.routeId)}>View research</Button>
    </article>)}</div>
    {!cards.length ? <p className="gx-t-body">No revealed player markets to compare yet.</p> : null}
    <h3 className="gx-t-section">Matchup spotlight</h3>
    <p className="gx-t-meta">Source-reported matchup drivers, not a defense ranking or a prediction. Position splits and season/last-five comparisons are shown only when established by the source.</p>
    <div className="gx-parlay-grid">{matchups.map(({a, e}) => <article className="gx-parlay-card gx-parlay-spotlight gx-vstack gx-gap-12" key={`${a.id}:${e.id}`}>
      <h4 className="gx-t-section">{a.title}</h4><p className="gx-t-meta">{a.gameId.replace('-', ' at ')} · {e.stance === 'oppose' ? 'Counterevidence' : e.stance === 'support' ? 'Supporting matchup evidence' : 'Matchup context'}</p>
      <p className="gx-t-body">{e.statement}</p>
      <p className="gx-t-body">{e.metric.name}: <strong>{e.metric.value} {e.metric.unit}</strong></p>
      <p className="gx-t-meta">{e.metric.denominator} · Sample: {e.sample.count} {e.sample.unit}</p>
      <p className="gx-t-meta">Period: {time(e.period.from)} to {time(e.period.to)} · Data through {time(e.asOf)}</p>
      <p className="gx-t-meta">{e.label}. {parlayLegStatus(a, now) ?? 'Qualitative lean only; favorable evidence does not establish betting value.'}</p>
      <a className="gx-ra-link" href={e.sourceUrl} target="_blank" rel="noreferrer">Open matchup source</a>
      <Button variant="secondary" onClick={() => onOpen(a.routeId)}>Review all evidence</Button>
    </article>)}</div>
    {!matchups.length ? <p className="gx-t-body">No qualifying matchup evidence in this view. No favorable labels, ranks or position splits are inferred.</p> : null}
    <h3 className="gx-t-section">Research board</h3>
    <p className="gx-t-meta">Showing up to six cards per section. Full assessed list remains below.</p>
    <div className="gx-parlay-grid">
      {cards.slice(0, 6).map(a => {
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
