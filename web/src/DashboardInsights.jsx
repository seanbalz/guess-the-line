import React, { useId, useState } from 'react';
import { buildDashboardInsights } from './dashboardInsightsModel.js';
import ChartGuide from './ChartGuide.jsx';
import './dashboardInsights.css';

const fmt = value => typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '—';
const time = value => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) + ' PT' : 'Time unavailable';
const line = (value, total) => value === null ? '—' : total ? fmt(value) : value === 0 ? 'PK' : `${value > 0 ? '+' : ''}${fmt(value)}`;

function SavedReferences({ games, total }) {
  return <details className="insights-references"><summary>Saved references by game</summary><p>Each guess uses the reference saved at submission or its latest edit. Players may have different references. Later market movement does not change these points.</p>
    {!games.length && <p>No games selected.</p>}
    <ul>{games.map(game => <li key={game.id}><details><summary><span>{game.label}</span><strong>{game.points === null ? 'Unscored' : `${fmt(game.points)} / 10 pts`}</strong></summary>
      <dl><div><dt>Guess</dt><dd>{line(game.guess, total)}</dd></div><div><dt>Saved reference</dt><dd>{line(game.reference, total)}</dd></div><div><dt>Difference</dt><dd>{game.error === null ? 'Unavailable' : `${fmt(game.error)} points`}</dd></div></dl>
      {game.reason ? <p>{game.reason}.</p> : <p>{game.source || 'Source unavailable'}<br/>Saved with guess: {time(game.savedAt)}<br/>Observed: {time(game.observedAt)}<br/>Collected: {time(game.collectedAt)}</p>}
    </details></li>)}</ul>
  </details>;
}

function Points({ model }) {
  return <><p className="insights-caption">Full week · points from each player’s saved references.</p><div className="accuracy-bars insights-points" aria-label="Player accuracy bars">{model.players.map(player => <details className="accuracy-player" key={player.id}>
    <summary aria-label={`Expand ${player.name} accuracy details`}><span className="accuracy-row"><span>{player.name}{player.own && <small>YOU</small>}{player.officialEligible === false && <small>Practice</small>}</span><strong className={player.own ? 'score-number' : undefined}>{fmt(player.points)}<small> / {player.maxPoints}</small></strong></span>
      <span className="accuracy-track" aria-hidden="true">{player.points !== null && <i className={player.own ? 'own' : ''} style={{ width: `${player.maxPoints ? player.points / player.maxPoints * 100 : 0}%` }}/>}</span>
      <span className="accuracy-caption">{!player.submitted ? 'Ballot not submitted' : player.points === null ? player.scoredSubtotal === null ? `Unscored · 0 of ${model.totalGames} references available` : `${fmt(player.scoredSubtotal)} points from ${player.scoredGames}/${model.totalGames} scored guesses · full score unavailable` : `${fmt(player.points)} accuracy points · ${player.scoredGames} of ${model.totalGames} games scored`}<span aria-hidden="true">⌄</span></span>
    </summary><div className="visual-drilldown insights-player-details">{player.submitted ? <><dl><div><dt>Closest-pick record</dt><dd>{player.record ? `${player.record.W}–${player.record.L}–${player.record.T}` : 'Awaiting eligible ballots'}</dd></div><div><dt>Exact guesses</dt><dd>{fmt(player.exact)}</dd></div><div><dt>Total error</dt><dd>{player.error === null ? 'Unavailable' : `${fmt(player.error)} points`}</dd></div><div><dt>Average error</dt><dd>{player.meanError === null ? 'Unavailable' : `${fmt(player.meanError)} points`}</dd></div></dl>
      <p>{player.scoredGames} of {model.totalGames} games scored{player.unscoredGames ? ` · ${player.unscoredGames} unscored` : ''}. Averages use scored games only. The full-week maximum is {player.maxPoints} points.</p><SavedReferences games={player.games} total={model.mode === 'guess_total'}/></> : <p>This player’s guesses and references stay hidden until they submit.</p>}</div>
  </details>)}</div></>;
}

function AccuracyMix({ model }) {
  const count = model.ownGames.length;
  let offset = 0;
  const segments = model.mix.map(bucket => {
    const length = count ? bucket.count / count * 100 : 0, start = offset;
    offset += length;
    return { ...bucket, length, start };
  });
  return <><p className="insights-caption">Your {model.filtered ? `${count} selected ${count === 1 ? 'game' : 'games'}` : 'full week'} · differences from saved references.</p><div className="insights-mix">
    <div className="insights-donut"><svg viewBox="0 0 120 120" role="img" aria-label={`Your accuracy mix. ${segments.map(bucket => `${bucket.label}: ${bucket.count}`).join('. ')}.`}><circle className="insights-ring-base" cx="60" cy="60" r="48"/>{segments.filter(bucket => bucket.count).map(bucket => <circle key={bucket.id} className={`insights-ring insights-${bucket.id}`} cx="60" cy="60" r="48" pathLength="100" strokeDasharray={`${bucket.length} ${100 - bucket.length}`} strokeDashoffset={-bucket.start} transform="rotate(-90 60 60)"/>)}</svg><span aria-hidden="true"><strong>{model.mixScored}<small>/{count}</small></strong><small>scored</small></span></div>
    <ul className="insights-mix-key">{segments.map(bucket => <li key={bucket.id}><i className={`insights-${bucket.id}`} aria-hidden="true"/><span>{bucket.label}{bucket.id === 'withinOne' && <small>Excludes exact</small>}</span><strong>{bucket.count}</strong></li>)}</ul>
  </div>{!count && <p className="insights-caption">Choose a dashboard game to see your accuracy mix.</p>}<div className="insights-mix-details"><SavedReferences games={model.ownGames} total={model.mode === 'guess_total'}/></div></>;
}

/** Compact, independently gated D-16 charts; trend is the existing market chart. */
export default function DashboardInsights({ data, games, trend, embedded = false }) {
  const [chosen, setChosen] = useState('points');
  const id = useId();
  const model = buildDashboardInsights(data, games);
  if (!model) return null;
  const tabs = [{ id: 'points', label: 'Player points' }, { id: 'mix', label: 'Accuracy mix' }, ...(trend ? [{ id: 'trend', label: 'Line movement' }] : [])];
  const active = tabs.some(tab => tab.id === chosen) ? chosen : 'points';
  const changeWithKey = event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = tabs.findIndex(tab => tab.id === active);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setChosen(tabs[next].id);
    event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next]?.focus();
  };
  return <section className={`dashboard-insights${embedded ? ' dashboard-insights--embedded' : ' panel'}`} aria-label={`${model.market} insights`}>
    {!embedded && <header><h2>Your week at a glance</h2><span>{model.market} · saved references</span></header>}
    <div className="insights-tabs" role="tablist" aria-label={`${model.market} chart`}>
      {tabs.map(tab => <button type="button" key={tab.id} id={`${id}-${tab.id}-tab`} role="tab" aria-selected={active === tab.id} aria-controls={`${id}-${tab.id}-panel`} tabIndex={active === tab.id ? 0 : -1} onClick={() => setChosen(tab.id)} onKeyDown={changeWithKey}>{tab.label}</button>)}
    </div>
    <div id={`${id}-${active}-panel`} role="tabpanel" aria-labelledby={`${id}-${active}-tab`} tabIndex={0} className="insights-view">
      {active === 'points' ? <Points model={model}/> : active === 'mix' ? <AccuracyMix model={model}/> : <div className="insights-trend"><p className="insights-caption">Recorded market movement · separate from your saved scoring references. Points do not move with this chart.</p>{!model.visibleGames.length ? <p className="insights-caption">Choose a dashboard game to view its recorded history.</p> : React.isValidElement(trend) ? React.cloneElement(trend, { matchups: model.visibleGames }) : trend}</div>}
    </div>
    <ChartGuide mode={data.mode} rules={data.rules}/>
  </section>;
}
