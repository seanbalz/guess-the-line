import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronDown, Circle, CircleCheckBig, Clock3, Eye, Lock, Minus, Plus, RefreshCw, ShieldCheck, TrendingUp } from 'lucide-react';
import { cloudApi, date, signed } from './api';
import { lockSentence } from './lineLock';
import { buildRecommendations } from '../../shared/recommended-bets.mjs';
import { RecommendationTrendDetail, useRecommendationTrends } from './RecommendationTrends.jsx';
import './recommendedBets.css';

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

// Redesign stage 20 line lock (D-36, D-39): the server sends no book offer and no consensus for a market whose Guess the
// Line pick this player has not locked in (today: submitted), sat out or seen kick off, and says so in `locked`. The
// sentence follows the live rules the reply carries (./lineLock.js, shared with the Bet Tracker's real-slip lock).
export { lockSentence };
// D-36: other players' Virtual Units bets become visible any time. Said here before the Bets read (M-10) makes it so.
export const BETS_VISIBLE_NOTE = "Coming soon: everyone in the league will see each other's Virtual Units picks at any time, not only after kickoff.";

function Stat({ label, value, detail }) { return <div className="stat"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
function closedReviewReason(game, now, result) {
  if (!game || !Number.isFinite(Date.parse(game.kickoff))) return 'Matchup unavailable';
  if (Date.parse(game.kickoff) <= now) return 'Kickoff reached';
  if (game.started || game.final || result || ['started', 'live', 'in_progress', 'final', 'complete', 'completed', 'cancelled', 'canceled', 'postponed', 'suspended'].includes(String(game.status || '').toLowerCase())) return 'Game closed';
  return null;
}

export default function VirtualUnits({ leagueId, accountId, onDirty, onSaved, onSignInAgain, onTrackTicket, embedded = false, initialView = 'all', showViewTabs = true, accountRecommendations = false }) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [selections, setSelections] = useState({}), [uncertain, setUncertain] = useState(null);
  const [view, setView] = useState(initialView === 'recommended' ? 'recommended' : 'all');
  const [personalRead, setPersonalRead] = useState(null), [expanded, setExpanded] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(null), [weekInfo, setWeekInfo] = useState(null);
  const [now, setNow] = useState(Date.now);
  const currentRecommendations = accountRecommendations || view === 'recommended';
  const readRequest = useRef(null);
  const lastRecommendationScope = useRef(null);
  const scopeGeneration = useRef(0), renderedScope = useRef(null);
  useEffect(() => { onDirty?.(busy || Boolean(uncertain) || Object.keys(selections).length > 0); }, [busy, uncertain, selections, onDirty]);
  useEffect(() => () => onDirty?.(false), [onDirty]);
  const load = useCallback(async signal => {
    readRequest.current?.abort();
    const controller = new AbortController();
    readRequest.current = controller;
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', abort, { once: true });
    const requestSignal = controller.signal;
    let result;
    try {
      if (currentRecommendations) {
        const current = await cloudApi('bets/recommendations', selectedWeek || {}, { signal: requestSignal });
        result = current.virtual;
        if (!requestSignal.aborted) { setPersonalRead({ scope: `${accountId || result.playerId}:account:${result.season}:${result.week}`, data: current.personal }); setWeekInfo({ slates: current.slates || [], publishedWeek: current.publishedWeek, current: current.current !== false }); }
      } else result = await cloudApi('virtual-units', undefined, { signal: requestSignal, league: leagueId });
    }
    catch (failure) { if (!requestSignal.aborted) { if (failure.status === 401 && !failure.uncertain) onSignInAgain?.(); if (failure.status === 403 || currentRecommendations) { setData(null); setPersonalRead(null); } } throw failure; }
    finally { signal?.removeEventListener('abort', abort); }
    if (!requestSignal.aborted) { setData(result); setNow(Date.now()); }
    return result;
  }, [leagueId, accountId, currentRecommendations, selectedWeek, onSignInAgain]);
  useEffect(() => { const controller = new AbortController(); scopeGeneration.current += 1; setData(null); setSelections({}); setUncertain(null); setBusy(false); setPersonalRead(null); setExpanded(false); setLoading(true); setError(''); load(controller.signal).catch(failure => { if (failure.name !== 'AbortError' && !controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); }); return () => { scopeGeneration.current += 1; controller.abort(); readRequest.current?.abort(); }; }, [load]);
  // The combined authenticated reader selects the current published week independently of private league settings.
  // Scope matching also prevents old-week/account data from resurfacing while a replacement read is underway.
  const recommendationScope = data ? `${accountId || data.playerId}:${currentRecommendations ? 'account' : leagueId}:${data.season}:${data.week}` : null;
  renderedScope.current = recommendationScope;
  useEffect(() => {
    if (!recommendationScope) return;
    if (lastRecommendationScope.current && lastRecommendationScope.current !== recommendationScope) { setSelections({}); setUncertain(null); setNotice(''); }
    lastRecommendationScope.current = recommendationScope;
    setExpanded(false);
  }, [recommendationScope]);
  // Kickoff closes recommendations even when this screen stays open. This timer reads no odds or other account data.
  useEffect(() => {
    const update = () => setNow(Date.now());
    const interval = setInterval(update, 15000);
    const timers = (data?.games || []).map(game => Date.parse(game.kickoff) - Date.now()).filter(delay => delay > 0 && delay < 2147483647).map(delay => setTimeout(update, delay + 10));
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(interval); timers.forEach(clearTimeout); document.removeEventListener('visibilitychange', update); };
  }, [data]);
  const personal = personalRead?.scope === recommendationScope ? personalRead : null;
  const historical = currentRecommendations && (weekInfo?.current === false || data?.current === false);
  const recommendations = useMemo(() => buildRecommendations({ personal: personal?.data, virtual: data, now }), [personal?.data, data, now]);
  // Stage 20 line lock: a market that is locked in a newer reply (the community week moved past this group's week) shows no
  // side, units or save button, so a selection in progress on it can never be saved. It is dropped, and the unsaved-changes
  // flag clears when nothing else waits to be saved. A market saved on another device cannot be overwritten.
  // At kickoff, an unsaved recommendation stays visible as a closed review card with its selected terms.
  useEffect(() => {
    if (!data) return;
    const lockedNow = choice => {
      const game = data.games.find(item => item.id === choice.gameId);
      return game?.locked?.[choice.market] === true || (currentRecommendations && data.picks?.some(pick => pick.gameId === choice.gameId && pick.market === choice.market));
    };
    const keys = Object.keys(selections).filter(key => lockedNow(selections[key]));
    if (!keys.length) return;
    const next = { ...selections };
    for (const key of keys) delete next[key];
    setSelections(next);
  }, [data, now, currentRecommendations]);
  const picks = useMemo(() => Object.fromEntries((data?.picks || []).map(pick => [`${pick.gameId}:${pick.market}`, pick])), [data]);
  const settledCount = data ? data.summary.wins + data.summary.losses + data.summary.pushes : 0;
  const commissioner = Boolean(data && data.league?.id === 'sean-troy-luke' && data.league.roster?.some(player => player.id === data.playerId && player.role?.toLowerCase() === 'commissioner'));
  function choose(game, market, side, units) {
    const offer = game.offers?.[market]?.[side];
    if (!offer) return;
    if (currentRecommendations && closedReviewReason(game, Date.now(), data?.results?.[game.id])) { setNow(Date.now()); return; }
    const matchup = { id: game.id, home: game.home, away: game.away, homeCode: game.homeCode, awayCode: game.awayCode, kickoff: game.kickoff };
    setSelections(current => ({ ...current, [`${game.id}:${market}`]: { gameId: game.id, market, side, units, offer, game: matchup } }));
  }
  function addRecommendation(row) {
    if (busy || loading || uncertain || historical || picks[row.key] || selections[row.key]) return;
    const current = buildRecommendations({ personal: personal?.data, virtual: data, now: Date.now() }).rows.find(item => item.key === row.key);
    if (!current?.offer) { setNow(Date.now()); return; }
    choose(current.game, current.market, current.side, 1);
    setNotice('Added to your review card. Check the saved book line, odds and units, then place your virtual pick.');
  }
  function trackRecommendation(row) {
    if (busy || loading || uncertain || historical || !onTrackTicket) return;
    const current = buildRecommendations({ personal: personal?.data, virtual: data, now: Date.now() }).rows.find(item => item.key === row.key);
    if (!current?.offer) { setNow(Date.now()); return; }
    onTrackTicket({
      season: data.season, week: data.week, kind: 'single',
      legs: [{ gameId: current.game.id, market: current.market, side: current.side, line: current.offer.line }],
      odds: current.offer.odds, source: current.offer.source || current.offer.book,
      quotedAt: current.offer.observedAt,
      // A recommendation is a quote, never evidence of an executed stake or placement.
      stakeUnits: null, placedAt: null,
    });
  }
  function changeView(next) {
    if (next === view || busy) return;
    if ((uncertain || Object.keys(selections).length) && !window.confirm('You have an unsaved virtual pick. Leave this view and discard the selection?')) return;
    setNotice(''); setView(next);
  }
  function changeWeek(value) {
    if (busy || loading) return;
    const next = value === 'current' ? null : weekInfo?.slates.find(week => `${week.season}:${week.week}` === value);
    if (value !== 'current' && !next) return;
    if ((uncertain || Object.keys(selections).length) && !window.confirm('You have an unsaved virtual pick. Change weeks and discard the selection?')) return;
    setNotice(''); setSelectedWeek(next ? { season: next.season, week: next.week } : null);
  }
  async function save(key) {
    const choice = selections[key]; if (!choice || busy || uncertain || loading || !data || historical) return;
    if (currentRecommendations && closedReviewReason(data.games.find(game => game.id === choice.gameId), Date.now(), data.results?.[choice.gameId])) { setNow(Date.now()); setNotice('This game is closed for new picks. Your selected terms remain on your card.'); return; }
    const generation = scopeGeneration.current, scope = recommendationScope;
    const stillCurrent = () => generation === scopeGeneration.current && scope === renderedScope.current;
    setBusy(true); setError(''); setNotice('');
    try {
      const body = { gameId: choice.gameId, market: choice.market, side: choice.side, line: choice.offer.line, odds: choice.offer.odds, units: choice.units, source: choice.offer.book, quotedAt: choice.offer.observedAt };
      const response = await cloudApi(currentRecommendations ? 'bets/recommendations/place' : 'virtual-pick', currentRecommendations ? { ...body, season: data.season, week: data.week, revision: data.revision } : body, { league: currentRecommendations ? undefined : leagueId, save: true });
      if (!stillCurrent()) return;
      const result = currentRecommendations ? response.virtual : response;
      if (currentRecommendations) { setPersonalRead({ scope: `${accountId || result.playerId}:account:${result.season}:${result.week}`, data: response.personal }); setWeekInfo({ slates: response.slates || [], publishedWeek: response.publishedWeek, current: response.current !== false }); }
      setData(result); setNow(Date.now()); setSelections(current => { const next = { ...current }; delete next[key]; return next; }); onSaved?.(); setNotice('Virtual pick saved with its book, line, odds and unit stake.');
    } catch (failure) { if (!stillCurrent()) return; setError(failure.message); if (failure.status === 401 && !failure.uncertain) onSignInAgain?.(); if (failure.uncertain) setUncertain({ key, choice }); }
    finally { if (stillCurrent()) setBusy(false); }
  }
  async function refresh() {
    if (loading || busy) return;
    setLoading(true); setError('');
    let request;
    try {
      const pending = load(); request = readRequest.current;
      const latest = await pending;
      if (request !== readRequest.current || request.signal.aborted) return;
      if (uncertain?.settlement) {
        setNotice('Saved results refreshed. Review the current records before settling again.'); setUncertain(null);
      } else if (uncertain) {
        const { key, choice } = uncertain;
        const saved = latest.picks?.find(pick => pick.gameId === choice.gameId && pick.market === choice.market)?.selection;
        const confirmed = saved && saved.side === choice.side && saved.line === choice.offer.line && saved.odds === choice.offer.odds && saved.units === choice.units && saved.source === choice.offer.source && Date.parse(saved.quotedAt) === Date.parse(choice.offer.observedAt);
        if (confirmed) { setSelections(current => { const next = { ...current }; delete next[key]; return next; }); onSaved?.(); }
        setNotice(confirmed ? 'Your saved Virtual Units pick is confirmed.' : 'Saved picks refreshed. Review your entered selection and the current offered line before saving again.');
        setUncertain(null);
      }
    } catch (failure) { if (!request?.signal.aborted && request === readRequest.current) setError(failure.message); }
    finally { if (request === readRequest.current && !request?.signal.aborted) setLoading(false); }
  }
  async function settle() {
    if (busy || uncertain || !data) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await cloudApi('virtual-units/settle', { season: data.season, week: data.week }, { save: true });
      const games = count => `${count} game${count === 1 ? '' : 's'}`;
      const notes = [result.pending?.length ? `${games(result.pending.length)} still without a final` : '', result.skipped?.length ? `${games(result.skipped.length)} not on this week's slate` : ''].filter(Boolean);
      setNotice(`Settled Week ${result.week} from ${result.finals} published final${result.finals === 1 ? '' : 's'}: ${result.settled} new, ${result.corrected} corrected, ${result.unchanged} unchanged, ${result.picksSettled} pick${result.picksSettled === 1 ? '' : 's'} graded${notes.map(note => ` · ${note}`).join('')}.`);
      onSaved?.();
      await load();
    } catch (failure) { setError(failure.message); if (failure.status === 401 && !failure.uncertain) onSignInAgain?.(); if (failure.uncertain) setUncertain({ settlement: true }); }
    finally { setBusy(false); }
  }
  const Heading = embedded ? 'h2' : 'h1';
  const visibleRecommendations = historical ? [] : expanded ? recommendations.rows : recommendations.rows.slice(0, 3);
  const separateReviews = Object.entries(selections).filter(([key]) => !visibleRecommendations.some(row => row.key === key));
  return <div className="virtual-units">
    <header className="page-heading"><div><div className="eyebrow"><span className="tiny-rule"/>PICKS · PLAY MONEY</div><Heading>{view === 'recommended' ? 'Recommended bets' : 'Virtual Units'}</Heading><p>{view === 'recommended' ? 'Largest percentage gaps between your guesses and current lines.' : 'Place one spread and one total pick per matchup. Every unit represents $100 virtual risk.'}</p></div><div className="heading-actions"><button className="secondary" onClick={refresh} disabled={loading || busy}><RefreshCw size={17} className={loading ? 'spin' : ''}/>Refresh lines</button>{commissioner && view !== 'recommended' && <button className="secondary" onClick={settle} disabled={loading || busy || Boolean(uncertain)}><CircleCheckBig size={17}/>Settle finals</button>}</div></header>
    {showViewTabs && <div className="recommended-view-tabs" role="group" aria-label="Virtual Units view"><button className="secondary" disabled={busy} aria-pressed={view === 'all'} onClick={() => changeView('all')}>All games</button><button className="secondary" disabled={busy} aria-pressed={view === 'recommended'} onClick={() => changeView('recommended')}>Recommended</button></div>}
    {view === 'recommended' && weekInfo && <label className="recommended-week-select">Week<select aria-label="Recommendation week" value={selectedWeek ? `${selectedWeek.season}:${selectedWeek.week}` : 'current'} disabled={busy || loading} onChange={event => changeWeek(event.target.value)}><option value="current">Current{weekInfo.publishedWeek ? ` · ${weekInfo.publishedWeek.season} Week ${weekInfo.publishedWeek.week}` : ''}</option>{weekInfo.slates.filter(week => week.season !== weekInfo.publishedWeek?.season || week.week !== weekInfo.publishedWeek?.week).map(week => <option key={`${week.season}:${week.week}`} value={`${week.season}:${week.week}`}>{week.season} Week {week.week}</option>)}</select></label>}
    {view === 'recommended' ? historical ? <p className="source-note recommended-explanation"><Lock size={17}/><span>View only · older week. Your saved card stays available here; new picks can be placed only in the current published week.</span></p> : <p className="source-note recommended-explanation"><ShieldCheck size={17}/><span>Ranked by percentage gap. Spread lines below 3 use 3 as a baseline. Open a matchup for sources, historical trends and actions. These gaps are not win probabilities.</span></p> : <>
      <p className="source-note"><ShieldCheck size={17}/><span><strong>Saved named-book lines</strong> · Buttons use the best retained point line from the latest accessible books. Consensus is shown separately when available. A saved line remains usable before kickoff even if it is old; its age is always shown. Picks settle against the published final score with the line and odds saved at placement (D-26).</span></p>
      <p className="source-note virtual-visibility-note"><Eye size={17}/><span>{BETS_VISIBLE_NOTE}</span></p>
    </>}
    {error && <div className="error-banner" role="alert">{error}<button disabled={loading || busy} onClick={refresh}>{uncertain ? 'Check saved picks' : 'Try again'}</button></div>}{notice && <p className="auth-notice" role="status">{notice}</p>}
    {data && view === 'all' && <><div className="stats-row"><Stat label="Record" value={`${data.summary.wins}–${data.summary.losses}–${data.summary.pushes}`} detail={`${data.summary.pending} pending · ${data.summary.voids} void`} /><Stat label="Net units" value={units(data.summary.netUnits)} detail="Settled results only"/><Stat label="ROI" value={data.summary.roi == null ? '—' : `${data.summary.roi}%`} detail={`${data.summary.riskUnits || 0}U settled risk`}/><Stat label="Qualification" value={(data.summary.qualificationPicks >= 3 || Number(data.summary.qualificationUnits) >= 3) ? 'Qualified' : 'In progress'} detail={`${data.summary.qualificationPicks} picks · ${data.summary.qualificationUnits}U this week`}/></div>
      {settledCount === 0 && <p className="virtual-settlement-note" role="status"><Clock3 size={15}/>{data.summary.pending ? `${data.summary.pending} pick${data.summary.pending === 1 ? '' : 's'} pending. ` : 'No settled picks yet. '}Results settle after each game's final score is published; record, net units and ROI count settled picks only.</p>}
      {settledCount > 0 && data.settlement?.lastSettledAt && <p className="virtual-settlement-note" role="status"><CircleCheckBig size={15}/>{settledCount} settled pick{settledCount === 1 ? '' : 's'}{data.summary.pending ? ` · ${data.summary.pending} still pending` : ''} · finals as of {date(data.settlement.lastSettledAt)} PT</p>}
      <div className="virtual-game-grid">{data.games.map(game => <GameCard key={game.id} game={game} result={data.results?.[game.id]} picks={picks} selections={selections} choose={choose} save={save} busy={busy || loading || Boolean(uncertain)} rules={data.rules}/>)}</div></>}
    {view === 'recommended' && data && !loading && <section className="recommended-bets" aria-label="Recommended bets">
      {historical ? <p className="recommended-source" role="status">Viewing {data.season} Week {data.week}{data.picks?.length ? '' : ' · No saved virtual picks this week.'}</p>
        : !personal ? <p className="loading" role="status">Loading your saved guesses…</p>
        : recommendations.status !== 'ready' ? <div className="recommended-empty" role="status"><p>Your guesses and these lines are not available for the same week.</p><button className="secondary" onClick={refresh}>Refresh recommendations</button></div>
        : <>
          <div className="recommended-list-heading"><h3>{expanded ? 'All differences' : 'Top 3 differences'}</h3><span>{recommendations.rows.length} available · Week {data.week}</span></div>
          {recommendations.rows.length ? <div className="recommended-bet-list">{visibleRecommendations.map(row => <RecommendationCard key={row.key} row={row} season={data.season} week={data.week} selection={selections[row.key]} pick={picks[row.key]} now={now} add={addRecommendation} track={onTrackTicket ? trackRecommendation : undefined} choose={choose} save={save} busy={busy || loading || Boolean(uncertain)} rules={data.rules}/>)}</div>
            : <div className="recommended-empty" role="status"><p>No differences to show yet. Submit your guesses, then check back for available pregame lines.</p></div>}
          {recommendations.rows.length > 3 && <button className="secondary recommended-expand" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <><ArrowUp size={17}/>Show top 3</> : <><ArrowDown size={17}/>Show all {recommendations.rows.length} differences</>}</button>}
          {separateReviews.map(([key, selection]) => {
            const currentGame = data.games.find(item => item.id === selection.gameId), game = currentGame || selection.game;
            if (!game || currentGame?.locked?.[selection.market]) return null;
            const closed = closedReviewReason(currentGame, now, data.results?.[selection.gameId]);
            return <section className="panel recommended-pending-review" key={key} aria-label={`Review ${game.away} at ${game.home} ${selection.market} virtual pick`}><h3>Your card · {game.away} at {game.home}</h3>{closed ? <>
              <p className="recommended-closed" role="status"><Lock size={16}/>Closed · {closed}. New placement is closed; your selected terms remain here.</p>
              <p className="recommended-source">Your selection: {line(game, selection.market, selection.side, selection.offer)} · {selection.units}U · {selection.offer.source} · quoted {date(selection.offer.observedAt)} PT</p>
              <button className="secondary" disabled={busy || Boolean(uncertain)} onClick={() => setSelections(current => { const next = { ...current }; delete next[key]; return next; })}>Remove from card</button>
            </> : <><p className="recommended-source">Your unsaved selection remains here while the ranked list changes.</p><Market game={game} market={selection.market} pick={picks[key]} selection={selection} choose={choose} save={save} busy={busy || loading || Boolean(uncertain)} rules={data.rules}/></>}</section>;
          })}
          {(recommendations.counts.locked > 0 || recommendations.counts.missingReference > 0) && <p className="recommended-coverage">Drafts, locked markets, started games and missing lines are left out. No line is estimated.</p>}
        </>}
      {data.picks?.length > 0 && <section className="recommended-saved-card" aria-label="Your virtual card"><div className="recommended-list-heading"><h3>Your virtual card</h3><span>{data.picks.length} saved · Week {data.week}</span></div><p className="recommended-source">Saved picks stay here when a line changes or a game starts.</p><ul>{data.picks.map(pick => {
        const game = data.games.find(item => item.id === pick.gameId) || { id: pick.gameId, away: pick.gameId, home: '', awayCode: '', homeCode: '' };
        const outcome = settledLabel(pick, game), final = finalLine(game, pick.result || data.results?.[pick.gameId]);
        return <li key={`${pick.gameId}:${pick.market}`}><div className="recommended-list-heading"><strong>{game.home ? `${game.away} at ${game.home}` : game.id} · {pick.market === 'spread' ? 'Spread' : 'Total'}</strong><span>{pick.status === 'pending' ? 'Pending' : outcome ? OUTCOMES[pick.status][1] : pick.status}</span></div><p>{sideName(game, pick.market, pick.selection.side)} {marketNumber(pick.market, pick.selection.line)} ({money(pick.selection.odds)}) · {pick.selection.units}U</p><p className="recommended-source">{pick.selection.source || 'Source unavailable'} · quoted {date(pick.selection.quotedAt)} PT</p>{outcome && <p className="recommended-saved-result">{outcome}</p>}{!outcome && final && <p className="recommended-source">{final}</p>}</li>;
      })}</ul></section>}
    </section>}
    {loading && <p className="loading" role="status">Loading saved lines and virtual picks…</p>}
  </div>;
}

function quoteAge(value, now) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(value)) / 60000));
  return minutes < 60 ? `${minutes}m old` : `${Math.floor(minutes / 60)}h old`;
}
const sideName = (game, market, side) => market === 'total' ? side === 'over' ? 'Over' : 'Under' : side === 'home' ? game.home : game.away;
const marketNumber = (market, value) => market === 'spread' ? signed(value) : String(value);

export function RecommendationCard({ row, season, week, selection, pick, now, add, track, choose, save, busy, rules }) {
  const { game, market, reference, evaluations } = row;
  const sides = market === 'spread' ? ['away', 'home'] : ['over', 'under'];
  const trend = useRecommendationTrends({ season, week, gameId: game.id, market, consensus: reference.value });
  const firstTrend = trend.cards[0];
  return <details className="panel recommended-bet-card" data-game-id={game.id} data-market={market}>
    <summary className="recommended-card-heading">
      <span className="recommended-card-main"><span className="recommended-market-label">{market === 'spread' ? 'Spread' : 'Total'} · {date(game.kickoff)} PT</span><strong>{game.awayCode || game.away} at {game.homeCode || game.home}</strong><span className="recommended-card-side">Review {sideName(game, market, row.side)} · {quoteAge(reference.observedAt, now)}</span></span>
      <span className="recommended-card-aside"><strong className="recommended-percent">{row.gapPercent.toFixed(1)}% gap</strong><span className="recommended-gap">{row.gap} pt gap</span></span>
      <ChevronDown className="recommended-chevron" size={18} aria-hidden="true"/>
      {firstTrend && <span className="recommended-trend-summary">Historical: {firstTrend.title} · {firstTrend.record} ({firstTrend.sample})</span>}
    </summary>
    <div className="recommended-card-detail">
    <h3>{game.away} at {game.home} · {market === 'spread' ? 'Spread' : 'Total'}</h3>
    {market === 'spread' && Math.abs(reference.value) < 3 && <p className="recommended-source">Percentage uses a 3-point minimum spread for pick’em and small lines.</p>}
    <dl className="recommended-comparison"><div><dt>Your guess{market === 'spread' ? ` · ${game.homeCode || game.home}` : ''}</dt><dd>{marketNumber(market, row.guess)}</dd></div><div><dt>Latest consensus{market === 'spread' ? ` · ${game.homeCode || game.home}` : ''}</dt><dd>{marketNumber(market, reference.value)}</dd></div></dl>
    <p className="recommended-source">{reference.source || 'Named-book median'} · {reference.books} books · {date(reference.observedAt)} PT · {quoteAge(reference.observedAt, now)}</p>
    <RecommendationTrendDetail trend={trend}/>
    <div className="recommended-sides" aria-label="How each side compares with your guess">{sides.map(side => {
      const evaluation = evaluations[side];
      const Indicator = evaluation.color === 'green' ? Plus : evaluation.color === 'red' ? Minus : Circle;
      return <div className={`recommended-side recommended-${evaluation.color}`} key={side} data-side={side} data-value-color={evaluation.color}><strong>{sideName(game, market, side)}</strong><span><Indicator size={15}/>{evaluation.label}</span><small>{evaluation.advantage > 0 ? '+' : evaluation.advantage < 0 ? '−' : ''}{Math.abs(evaluation.advantage)} pts vs your guess</small></div>;
    })}</div>
    <div className="recommended-action"><p><strong>Suggested: {sideName(game, market, row.side)}</strong>{row.offer ? <small>Saved quote: {line(game, market, row.side, row.offer)} · {row.offer.source || row.offer.book} · {date(row.offer.observedAt)} PT · {quoteAge(row.offer.observedAt, now)}</small> : <small>No usable named-book quote on this side. It cannot be added yet.</small>}</p>
      {track && <button className="secondary" disabled={busy || !row.offer} onClick={() => track(row)}><Plus size={16}/>Track this bet</button>}
      <button className="secondary" disabled={busy || !row.offer || Boolean(pick) || Boolean(selection)} onClick={() => add(row)}>{pick ? <><Check size={16}/>{track ? 'Virtual pick saved' : 'Already on your card'}</> : selection ? <><Check size={16}/>Review below</> : <><Plus size={16}/>{track ? 'Play with Virtual Units' : 'Add to card'}</>}</button></div>
    {pick && <p className="recommended-saved">Saved: {sideName(game, market, pick.selection.side)} {marketNumber(market, pick.selection.line)} ({money(pick.selection.odds)}) · {pick.selection.units}U · {pick.selection.source}</p>}
    {selection && <div className="recommended-review" aria-label={`Review ${game.away} at ${game.home} ${market} virtual pick`}><p>Review your card · play money only</p><Market game={game} market={market} pick={pick} selection={selection} choose={choose} save={save} busy={busy} rules={rules}/></div>}
    </div>
  </details>;
}

function GameCard({ game, result, picks, selections, choose, save, busy, rules }) {
  const final = finalLine(game, result);
  return <section className="panel virtual-game-card"><div className="panel-heading"><div><h2>{game.away} at {game.home}</h2><p><Clock3 size={14}/> {date(game.kickoff)} PT · {game.pacificDate}</p>{final && <p className="virtual-final">{final}</p>}</div><span className={`badge ${result ? (result.status === 'final' ? 'lime' : 'amber') : 'amber'}`}>{result ? (result.status === 'final' ? 'FINAL' : result.status.toUpperCase()) : 'PLAY MONEY'}</span></div>{['spread','total'].map(market => <Market key={market} game={game} market={market} pick={picks[`${game.id}:${market}`]} selection={selections[`${game.id}:${market}`]} choose={choose} save={save} busy={busy} rules={rules}/>)}</section>;
}

function Market({ game, market, pick, selection, choose, save, busy, rules }) {
  const sides = market === 'spread' ? ['away','home'] : ['over','under'];
  const offer = game.offers?.[market] || {};
  const key = `${game.id}:${market}`;
  const reference = game.consensus?.[market];
  const adjust = amount => selection && choose(game, market, selection.side, Math.max(0.5, Number((selection.units + amount).toFixed(1))));
  const settled = pick && pick.status !== 'pending' ? OUTCOMES[pick.status] : null;
  const saved = pick ? `Saved ${pick.selection.side} ${pick.selection.line < 0 ? `−${Math.abs(pick.selection.line)}` : `+${pick.selection.line}`} (${money(pick.selection.odds)}) · ${pick.selection.units}U · ${pick.selection.source}` : null;
  // A locked market: the player's own saved pick keeps its full terms; no line, consensus or entry control is shown.
  if (game.locked?.[market]) return <div className="virtual-market virtual-market-locked" data-locked="true"><div className="virtual-market-heading"><div><h3>{market === 'spread' ? 'Spread' : 'Total'}</h3>{pick && <p>{`${saved} · ${pick.status}`}</p>}{settled && <p className={`virtual-result ${settled[2]}`} data-outcome={pick.status}><span className={`badge ${settled[2] === 'loss' || settled[2] === 'tie' ? '' : settled[2]}`}>{settled[0]}</span>{settledLabel(pick, game)}</p>}<p className="virtual-lock"><Lock size={15}/>{lockSentence(market, rules)}</p></div></div></div>;
  return <div className="virtual-market"><div className="virtual-market-heading"><div><h3>{market === 'spread' ? 'Spread' : 'Total'}</h3><p>{pick ? `${saved} · ${pick.status}` : 'Choose a side, then choose units.'}</p>{settled && <p className={`virtual-result ${settled[2]}`} data-outcome={pick.status}><span className={`badge ${settled[2] === 'loss' || settled[2] === 'tie' ? '' : settled[2]}`}>{settled[0]}</span>{settledLabel(pick, game)}</p>}<p className="virtual-consensus">Consensus: {reference ? `${reference.value > 0 ? '+' : ''}${reference.value} · ${reference.books} books · ${date(reference.observedAt)}` : 'unavailable'}</p></div>{selection && <span className="badge lime"><Check size={13}/> Ready to save</span>}</div>{selection && <p className="virtual-selected-quote"><strong>Your selected quote:</strong> {line(game, market, selection.side, selection.offer)} · {selection.units}U · {selection.offer.source} · quoted {date(selection.offer.observedAt)} PT</p>}<div className="virtual-side-buttons">{sides.map(side => { const selected = selection?.side === side; const current = offer[side]; return <button key={side} className={selected ? 'primary' : 'secondary'} disabled={!current || busy} onClick={() => choose(game, market, side, selection?.units || 1)}>{line(game,market,side,current)}<small>{current ? `${current.source} · observed ${date(current.observedAt)} · ${Math.max(0, Math.round((Date.now()-Date.parse(current.observedAt))/3600000))}h old` : 'No saved quote yet'}</small></button>; })}</div><div className="virtual-unit-buttons" aria-label={`${market} units`}><button type="button" disabled={!selection?.side || busy || selection.units <= 0.5} onClick={() => adjust(-0.5)} aria-label="Decrease units">−0.5U</button>{STAKES.map(stake => <button type="button" key={stake} className={selection?.units === stake ? 'selected' : ''} disabled={!selection?.side || busy} onClick={() => choose(game, market, selection.side, stake)}>{stake}U</button>)}<button type="button" disabled={!selection?.side || busy} onClick={() => adjust(0.5)} aria-label="Increase units">+0.5U</button>{selection && selection.units > 3 && <span className="selected">{selection.units}U</span>}</div>{selection && <button className="primary virtual-save" disabled={busy} onClick={() => save(key)}>{busy ? 'Saving…' : pick ? 'Save edit' : 'Place virtual pick'}<TrendingUp size={16}/></button>}</div>;
}
