import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Clock3, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { cloudApi, date, signed } from './api';

const STAKES = [0.5, 1, 1.5, 2, 2.5, 3];
const money = value => value == null ? '—' : Number(value) > 0 ? `+${value}` : `−${Math.abs(value)}`;
const line = (game, market, side, offer) => {
  if (!offer) return 'No saved book line';
  const name = market === 'spread' ? (side === 'home' ? game.home : game.away) : side === 'over' ? 'Over' : 'Under';
  return `${name} ${offer.line > 0 ? '+' : ''}${offer.line} (${money(offer.odds)})`;
};

function Stat({ label, value, detail }) { return <div className="stat"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }

export default function VirtualUnits({ leagueId, onDirty }) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selections, setSelections] = useState({});
  const load = useCallback(async signal => {
    const result = await cloudApi('virtual-units', undefined, { signal, league: leagueId });
    if (!signal?.aborted) setData(result);
    return result;
  }, [leagueId]);
  useEffect(() => { const controller = new AbortController(); setLoading(true); setError(''); load(controller.signal).catch(failure => { if (failure.name !== 'AbortError') setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => controller.abort(); }, [load]);
  const picks = useMemo(() => Object.fromEntries((data?.picks || []).map(pick => [`${pick.gameId}:${pick.market}`, pick])), [data]);
  function choose(game, market, side, units) {
    const offer = game.offers?.[market]?.[side];
    if (!offer) return;
    setSelections(current => ({ ...current, [`${game.id}:${market}`]: { gameId: game.id, market, side, units, offer } }));
    onDirty?.(true);
  }
  async function save(key) {
    const choice = selections[key]; if (!choice || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const body = { gameId: choice.gameId, market: choice.market, side: choice.side, line: choice.offer.line, odds: choice.offer.odds, units: choice.units, source: choice.offer.book, quotedAt: choice.offer.observedAt };
      const result = await cloudApi('virtual-pick', body, { league: leagueId });
      setData(result); setSelections(current => { const next = { ...current }; delete next[key]; return next; }); onDirty?.(false); setNotice('Virtual pick saved with its book, line, odds and unit stake.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  async function refresh() { setLoading(true); setError(''); try { await load(); } catch (failure) { setError(failure.message); } finally { setLoading(false); } }
  return <div className="virtual-units">
    <header className="page-heading"><div><div className="eyebrow"><span className="tiny-rule"/>PICKS · PLAY MONEY</div><h1>Virtual Units</h1><p>Place one spread and one total pick per matchup. Every unit represents $100 virtual risk.</p></div><button className="secondary" onClick={refresh} disabled={loading || busy}><RefreshCw size={17} className={loading ? 'spin' : ''}/>Refresh lines</button></header>
    <p className="source-note"><ShieldCheck size={17}/><span><strong>Saved named-book lines</strong> · Buttons use the best retained point line from the latest accessible books. Consensus is shown separately when available. A saved line remains usable before kickoff even if it is old; its age is always shown.</span></p>
    {error && <div className="error-banner" role="alert">{error}<button onClick={refresh}>Try again</button></div>}{notice && <p className="auth-notice" role="status">{notice}</p>}
    {data && <><div className="stats-row"><Stat label="Record" value={`${data.summary.wins}–${data.summary.losses}–${data.summary.pushes}`} detail={`${data.summary.pending} pending · ${data.summary.voids} void`} /><Stat label="Net units" value={signed(Number(data.summary.netUnits || 0))} detail="Settled results only"/><Stat label="ROI" value={data.summary.roi == null ? '—' : `${data.summary.roi}%`} detail={`${data.summary.riskUnits || 0}U settled risk`}/><Stat label="Qualification" value={(data.summary.qualificationPicks >= 3 || Number(data.summary.qualificationUnits) >= 3) ? 'Qualified' : 'In progress'} detail={`${data.summary.qualificationPicks} picks · ${data.summary.qualificationUnits}U this week`}/></div>
      <div className="virtual-game-grid">{data.games.map(game => <GameCard key={game.id} game={game} picks={picks} selections={selections} choose={choose} save={save} busy={busy}/>)}</div></>}
    {loading && <p className="loading" role="status">Loading saved lines and virtual picks…</p>}
  </div>;
}

function GameCard({ game, picks, selections, choose, save, busy }) {
  return <section className="panel virtual-game-card"><div className="panel-heading"><div><h2>{game.away} at {game.home}</h2><p><Clock3 size={14}/> {date(game.kickoff)} PT · {game.pacificDate}</p></div><span className="badge amber">PLAY MONEY</span></div>{['spread','total'].map(market => <Market key={market} game={game} market={market} pick={picks[`${game.id}:${market}`]} selection={selections[`${game.id}:${market}`]} choose={choose} save={save} busy={busy}/>)}</section>;
}

function Market({ game, market, pick, selection, choose, save, busy }) {
  const sides = market === 'spread' ? ['away','home'] : ['over','under'];
  const offer = game.offers?.[market] || {};
  const key = `${game.id}:${market}`;
  return <div className="virtual-market"><div className="virtual-market-heading"><div><h3>{market === 'spread' ? 'Spread' : 'Total'}</h3><p>{pick ? `Saved ${pick.selection.side} · ${pick.selection.units}U · ${pick.status}` : 'Choose a side, then choose units.'}</p></div>{selection && <span className="badge lime"><Check size={13}/> Ready to save</span>}</div><div className="virtual-side-buttons">{sides.map(side => { const selected = selection?.side === side; const current = offer[side]; return <button key={side} className={selected ? 'primary' : 'secondary'} disabled={!current || busy} onClick={() => choose(game, market, side, selection?.units || 1)}>{line(game,market,side,current)}<small>{current ? `${current.source} · observed ${date(current.observedAt)} · ${Math.max(0, Math.round((Date.now()-Date.parse(current.observedAt))/3600000))}h old` : 'No saved quote yet'}</small></button>; })}</div><div className="virtual-unit-buttons" aria-label={`${market} units`}>{STAKES.map(units => <button key={units} className={selection?.units === units ? 'selected' : ''} disabled={!selection?.side || busy} onClick={() => choose(game, market, selection.side, units)}>{units}U</button>)}{selection && selection.units > 3 && <span>{selection.units}U</span>}</div>{selection && <button className="primary virtual-save" disabled={busy} onClick={() => save(key)}>{busy ? 'Saving…' : pick ? 'Save edit' : 'Place virtual pick'}<TrendingUp size={16}/></button>}</div>;
}
