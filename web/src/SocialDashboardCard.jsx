import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Layers3, RefreshCw, Users } from 'lucide-react';
import { summarizeSocialBets } from '../../shared/social-bets.mjs';
import { date, signed, socialApi } from './api';
import './socialDashboardCard.css';

const amount = value => Number.isFinite(value) ? Number(value.toFixed(3)).toLocaleString('en-US') : '—';
const units = value => Number.isFinite(value) ? `${amount(value)}u` : 'Units unknown';
const odds = value => Number.isFinite(value) ? `${value > 0 ? '+' : '−'}${Math.abs(value)}` : 'Odds unknown';

// Redesign stage 21 (M-04): a leg whose line is closed to this player arrives as `locked: true` with no line; it reads as
// locked, never "—" or a number. This card lists the player's own bets, which the server never redacts.
function selection(leg, games) {
  if (leg.locked) return `${leg.selection || 'Line'} · line locked`;
  if (leg.selection) return leg.selection;
  const game = games.find(item => item.id === leg.gameId);
  const side = leg.side === 'home' ? game?.home : leg.side === 'away' ? game?.away : leg.side;
  return leg.market === 'spread' ? `${side || 'Team'} ${signed(leg.line)}` : leg.market === 'total' ? `${side || 'Total'} ${leg.line ?? '—'}` : side || 'Player prop';
}

/** Only the deliberately shared social feed supplies this dashboard attachment. */
export default function SocialDashboardCard({ player, season, week, go }) {
  const scope = `${player}:${season}:${week}`;
  const [response, setResponse] = useState(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResponse(null); setError('');
    socialApi('read', { season, week }, player, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (!data?.actorId || !Array.isArray(data.entries)) throw new Error('The shared betting record could not be read.');
      setResponse({ scope, data });
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message || 'The shared betting record is unavailable.'); });
    return () => controller.abort();
  }, [player, season, week, scope, refresh]);
  const data = response?.scope === scope ? response.data : null;
  const entries = useMemo(() => (data?.entries || []).filter(entry => entry.ownerId === data.actorId && entry.season === season && entry.week === week), [data, season, week]);
  const summary = useMemo(() => summarizeSocialBets(entries), [entries]);
  const included = entries.filter(entry => entry.countsForRecord !== false);
  const unknownStakes = included.filter(entry => !Number.isFinite(entry.stakeUnits)).length;
  const pending = included.filter(entry => entry.outcome === 'pending');
  const pendingRisk = pending.reduce((sum, entry) => sum + (entry.stakeUnits ?? 0), 0);
  const completeTerms = included.filter(entry => Number.isFinite(entry.stakeUnits) && Number.isFinite(entry.odds)).length;
  const loading = !data && !error;
  return <section className="panel social-dashboard-card" aria-labelledby="social-dashboard-title" aria-busy={loading}>
    <header className="social-dashboard-heading"><div><span className="eyebrow"><Users size={16}/>YOUR SHARED BETS · WEEK {week}</span><h2 id="social-dashboard-title">Your betting week</h2><p>Singles and parlays, connected to your Unit Betting record.</p></div><button className="icon-button" aria-label="Refresh your betting week" disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18}/></button></header>
    {loading ? <p className="social-dashboard-state" role="status">Loading your shared weekly record…</p> : error ? <div className="social-dashboard-state"><p role="status">Your betting week is unavailable. {error}</p><button className="secondary" onClick={() => setRefresh(value => value + 1)}>Retry betting summary</button></div> : <>
      <dl className="social-dashboard-metrics">
        <div><dt>Included record</dt><dd>{summary.record}<small>Win–loss–push · {summary.bets} {summary.bets === 1 ? 'bet' : 'bets'}</small></dd></div>
        <div><dt>Known risk</dt><dd>{units(summary.stakeUnits)}<small>{unknownStakes ? `${unknownStakes} ${unknownStakes === 1 ? 'stake unknown' : 'stakes unknown'}` : 'All included stakes recorded'}</small></dd></div>
        <div><dt>Pending</dt><dd>{summary.pending}<small>{units(pendingRisk)} known pending risk</small></dd></div>
        <div><dt>Settled ROI</dt><dd>{Number.isFinite(summary.roiPercent) ? `${Number(summary.roiPercent.toFixed(1)).toLocaleString('en-US')}%` : '—'}<small>{summary.roiSampleCount} {summary.roiSampleCount === 1 ? 'bet' : 'bets'} · {units(summary.settledStakeUnits)} settled risk</small></dd></div>
      </dl>
      <p className="social-dashboard-coverage">{completeTerms} of {summary.bets} included bets have odds and unit stakes · {summary.excludedCount} excluded. ROI uses settled, complete returns; pending and void bets stay out.</p>
      {entries.length ? <div className="social-dashboard-recent"><h3>Recently shared by you</h3><ul>{entries.slice(0, 3).map(entry => <li key={entry.id}><div><strong>{entry.kind === 'parlay' ? `${entry.legs.length}-leg parlay` : selection(entry.legs[0], data.games || [])}</strong>{entry.kind === 'parlay' && <span>{entry.legs.map(leg => selection(leg, data.games || [])).join(' · ')}</span>}<small>{odds(entry.odds)} · {units(entry.stakeUnits)} · Recorded {date(entry.recordedAt)} PT</small></div><span className={`social-dashboard-outcome social-dashboard-outcome-${entry.outcome}`}>{entry.outcome}{entry.countsForRecord === false && <small>Excluded</small>}</span></li>)}</ul></div> : <div className="social-dashboard-empty"><Layers3 size={24}/><div><h3>No shared bets this week yet</h3><p>Add a single or parlay, or review a player's bet to tail with your own terms.</p></div></div>}
      <p className="social-dashboard-audience">Visible to all signed-in players. New bets count by default. Tracked results are player reported.</p>
    </>}
    <div className="social-dashboard-actions"><button className="primary" onClick={() => go('social')}>Open Bet Tracker <ArrowUpRight size={17}/></button><button className="secondary" onClick={() => go('units')}>My Unit Betting week <ArrowUpRight size={17}/></button></div>
  </section>;
}
