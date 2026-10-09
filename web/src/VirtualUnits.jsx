import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CircleCheckBig, Clock3, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { cloudApi, date } from './api';

const STAKES = [0.5, 1, 1.5, 2, 2.5, 3];
const money = value => value == null ? '—' : Number(value) > 0 ? `+${value}` : `−${Math.abs(value)}`;
const line = (game, market, side, offer) => {
  if (!offer) return 'No saved book line';
  const name = market === 'spread' ? (side === 'home' ? game.home : game.away) : side === 'over' ? 'Over' : 'Under';
  return `${name} ${offer.line > 0 ? '+' : ''}${offer.line} (${money(offer.odds)})`;
};
const units = value => { const n = Number(value || 0); if (!Number.isFinite(n) || n === 0) return '0U'; const text = Math.abs(n).toFixed(2).replace(/\.?0+$/, ''); return `${n > 0 ? '+' : '−'}${text}U`; };
// D-26: a settled pick reads as its outcome, the net units it moved and the final it was graded against.
const OUTCOMES = { win: ['W', 'Won', 'lime'], loss: ['L', 'Lost', 'loss'], push: ['P', 'Push', 'tie'], void: ['V', 'Void', 'amber'] };
const shortCode = (game, side) => side === 'home' ? game.homeCode || game.home : game.awayCode || game.away;
export const finalLine = (game, result) => !result ? null : result.status === 'final'
  ? `Final · ${shortCode(game, 'away')} ${result.away}, ${shortCode(game, 'home')} ${result.home}`
  : `${result.status === 'postponed' ? 'Postponed' : 'Cancelled'} · picks voided, stakes returned`;
export function settledLabel(pick, game) {
  const [, word] = OUTCOMES[pick.status] || [];
  if (!word) return null;
  const result = pick.result || {};
  if (pick.status === 'void') return `${word} · ${result.reason === 'postponed' ? 'moved to another day' : result.reason === 'cancelled' ? 'game cancelled' : 'stake returned'} · ${pick.selection.units}U returned`;
  const score = result.status === 'final' ? ` · Final ${shortCode(game, 'away')} ${result.away}, ${shortCode(game, 'home')} ${result.home}` : '';
  return `${word} ${units(result.netUnits)}${score}`;
}

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
  const settledCount = data ? data.summary.wins + data.summary.losses + data.summary.pushes : 0;
  const commissioner = Boolean(data && data.league?.id === 'sean-troy-luke' && data.league.roster?.some(player => player.id === data.playerId && player.role?.toLowerCase() === 'commissioner'));
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
  async function settle() {
    if (busy || !data) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await cloudApi('virtual-units/settle', { season: data.season, week: data.week });
      const games = count => `${count} game${count === 1 ? '' : 's'}`;
      const notes = [result.pending?.length ? `${games(result.pending.length)} still without a final` : '', result.skipped?.length ? `${games(result.skipped.length)} not on this week's slate` : ''].filter(Boolean);
      setNotice(`Settled Week ${result.week} from ${result.finals} published final${result.finals === 1 ? '' : 's'}: ${result.settled} new, ${result.corrected} corrected, ${result.unchanged} unchanged, ${result.picksSettled} pick${result.picksSettled === 1 ? '' : 's'} graded${notes.map(note => ` · ${note}`).join('')}.`);
      await load();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <div className="virtual-units">
    <header className="page-heading"><div><div className="eyebrow"><span className="tiny-rule"/>PICKS · PLAY MONEY</div><h1>Virtual Units</h1><p>Place one spread and one total pick per matchup. Every unit represents $100 virtual risk.</p></div><div className="heading-actions"><button className="secondary" onClick={refresh} disabled={loading || busy}><RefreshCw size={17} className={loading ? 'spin' : ''}/>Refresh lines</button>{commissioner && <button className="secondary" onClick={settle} disabled={loading || busy}><CircleCheckBig size={17}/>Settle finals</button>}</div></header>
    <p className="source-note"><ShieldCheck size={17}/><span><strong>Saved named-book lines</strong> · Buttons use the best retained point line from the latest accessible books. Consensus is shown separately when available. A saved line remains usable before kickoff even if it is old; its age is always shown. Picks settle against the published final score with the line and odds saved at placement (D-26).</span></p>
    {error && <div className="error-banner" role="alert">{error}<button onClick={refresh}>Try again</button></div>}{notice && <p className="auth-notice" role="status">{notice}</p>}
    {data && <><div className="stats-row"><Stat label="Record" value={`${data.summary.wins}–${data.summary.losses}–${data.summary.pushes}`} detail={`${data.summary.pending} pending · ${data.summary.voids} void`} /><Stat label="Net units" value={units(data.summary.netUnits)} detail="Settled results only"/><Stat label="ROI" value={data.summary.roi == null ? '—' : `${data.summary.roi}%`} detail={`${data.summary.riskUnits || 0}U settled risk`}/><Stat label="Qualification" value={(data.summary.qualificationPicks >= 3 || Number(data.summary.qualificationUnits) >= 3) ? 'Qualified' : 'In progress'} detail={`${data.summary.qualificationPicks} picks · ${data.summary.qualificationUnits}U this week`}/></div>
      {settledCount === 0 && <p className="virtual-settlement-note" role="status"><Clock3 size={15}/>{data.summary.pending ? `${data.summary.pending} pick${data.summary.pending === 1 ? '' : 's'} pending. ` : 'No settled picks yet. '}Results settle after each game's final score is published; record, net units and ROI count settled picks only.</p>}
      {settledCount > 0 && data.settlement?.lastSettledAt && <p className="virtual-settlement-note" role="status"><CircleCheckBig size={15}/>{settledCount} settled pick{settledCount === 1 ? '' : 's'}{data.summary.pending ? ` · ${data.summary.pending} still pending` : ''} · finals as of {date(data.settlement.lastSettledAt)} PT</p>}
      <div className="virtual-game-grid">{data.games.map(game => <GameCard key={game.id} game={game} result={data.results?.[game.id]} picks={picks} selections={selections} choose={choose} save={save} busy={busy}/>)}</div></>}
    {loading && <p className="loading" role="status">Loading saved lines and virtual picks…</p>}
  </div>;
}

function GameCard({ game, result, picks, selections, choose, save, busy }) {
  const final = finalLine(game, result);
  return <section className="panel virtual-game-card"><div className="panel-heading"><div><h2>{game.away} at {game.home}</h2><p><Clock3 size={14}/> {date(game.kickoff)} PT · {game.pacificDate}</p>{final && <p className="virtual-final">{final}</p>}</div><span className={`badge ${result ? (result.status === 'final' ? 'lime' : 'amber') : 'amber'}`}>{result ? (result.status === 'final' ? 'FINAL' : result.status.toUpperCase()) : 'PLAY MONEY'}</span></div>{['spread','total'].map(market => <Market key={market} game={game} market={market} pick={picks[`${game.id}:${market}`]} selection={selections[`${game.id}:${market}`]} choose={choose} save={save} busy={busy}/>)}</section>;
}

function Market({ game, market, pick, selection, choose, save, busy }) {
  const sides = market === 'spread' ? ['away','home'] : ['over','under'];
  const offer = game.offers?.[market] || {};
  const key = `${game.id}:${market}`;
  const reference = game.consensus?.[market];
  const adjust = amount => selection && choose(game, market, selection.side, Math.max(0.5, Number((selection.units + amount).toFixed(1))));
  const settled = pick && pick.status !== 'pending' ? OUTCOMES[pick.status] : null;
  const saved = pick ? `Saved ${pick.selection.side} ${pick.selection.line < 0 ? `−${Math.abs(pick.selection.line)}` : `+${pick.selection.line}`} (${money(pick.selection.odds)}) · ${pick.selection.units}U · ${pick.selection.source}` : null;
  return <div className="virtual-market"><div className="virtual-market-heading"><div><h3>{market === 'spread' ? 'Spread' : 'Total'}</h3><p>{pick ? `${saved} · ${pick.status}` : 'Choose a side, then choose units.'}</p>{settled && <p className={`virtual-result ${settled[2]}`} data-outcome={pick.status}><span className={`badge ${settled[2] === 'loss' || settled[2] === 'tie' ? '' : settled[2]}`}>{settled[0]}</span>{settledLabel(pick, game)}</p>}<p className="virtual-consensus">Consensus: {reference ? `${reference.value > 0 ? '+' : ''}${reference.value} · ${reference.books} books · ${date(reference.observedAt)}` : 'unavailable'}</p></div>{selection && <span className="badge lime"><Check size={13}/> Ready to save</span>}</div><div className="virtual-side-buttons">{sides.map(side => { const selected = selection?.side === side; const current = offer[side]; return <button key={side} className={selected ? 'primary' : 'secondary'} disabled={!current || busy} onClick={() => choose(game, market, side, selection?.units || 1)}>{line(game,market,side,current)}<small>{current ? `${current.source} · observed ${date(current.observedAt)} · ${Math.max(0, Math.round((Date.now()-Date.parse(current.observedAt))/3600000))}h old` : 'No saved quote yet'}</small></button>; })}</div><div className="virtual-unit-buttons" aria-label={`${market} units`}><button type="button" disabled={!selection?.side || busy || selection.units <= 0.5} onClick={() => adjust(-0.5)} aria-label="Decrease units">−0.5U</button>{STAKES.map(stake => <button type="button" key={stake} className={selection?.units === stake ? 'selected' : ''} disabled={!selection?.side || busy} onClick={() => choose(game, market, selection.side, stake)}>{stake}U</button>)}<button type="button" disabled={!selection?.side || busy} onClick={() => adjust(0.5)} aria-label="Increase units">+0.5U</button>{selection && selection.units > 3 && <span className="selected">{selection.units}U</span>}</div>{selection && <button className="primary virtual-save" disabled={busy} onClick={() => save(key)}>{busy ? 'Saving…' : pick ? 'Save edit' : 'Place virtual pick'}<TrendingUp size={16}/></button>}</div>;
}
