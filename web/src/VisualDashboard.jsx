import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Crosshair, Flag, Layers3, LockKeyhole, RefreshCw, Bell } from 'lucide-react';
import { date, fmt, signed } from './api';
import DataConnections from './DataConnections';
import { ScoringPolicyNote, ReferenceValue, CurrentConsensus } from './ScoringReference';
import { submissionTimeScoring, availableScoringReference, playerReference } from './scoringReferences';
import PlayerComparison from './PlayerComparison.jsx';
import DashboardInsights from './DashboardInsights.jsx';
import { TeamMatchup } from './TeamIdentity';
import DashboardPreferences from './DashboardPreferences.jsx';
import SocialDashboardCard from './SocialDashboardCard.jsx';
import { useDashboardPreferences, useDashboardMatchupFilter } from './dashboardPreferences';
import DashboardMatchupFilter from './DashboardMatchupFilter.jsx';
import GameTrends from './GameTrends';
import { groupAccess } from '../../shared/trends-view.mjs';
import './visualLayouts.css';
import { refreshLabel, refreshWarning, sourceAge } from './marketStatus';
import { sentFinal } from './sentFinal';

const finite = value => typeof value === 'number' && Number.isFinite(value);
export default function VisualDashboard({ data, benchmark, go, historyChart, provenance }) {
  const [all, setAll] = useState(false);
  const [preferences, setPreferences, preferenceStatus] = useDashboardPreferences();
  const [matchupFilter, setMatchupFilter, filterStatus] = useDashboardMatchupFilter({season:data.league.season, week:data.league.week, games:data.games});
  const seenCapture = useRef(null);
  const [updatedCapture, setUpdatedCapture] = useState(null);
  const timestamped = submissionTimeScoring(data);
  const total = data.mode === 'guess_total';
  const mode = total ? 'guess_total' : 'guess_spread';
  const marketName = total ? 'Total' : 'Spread';
  const analysis = !timestamped && !benchmark && data.revealed && data.provisionalAnalysis?.mode === mode ? data.provisionalAnalysis : null;
  const submitted = data.revealed && ['guess_spread','guess_total'].includes(data.mode);
  const number = value => total ? fmt(value) : signed(value);
  const players = data.league.roster.map(player => ({ ...player, ...data.standings.find(row => row.id === player.id), ...(analysis?.standings?.find(row => row.id === player.id) || {}) }));
  const own = players.find(player => player.id === data.playerId) || { id: data.playerId, submitted: false };
  const status = timestamped ? 'SAVED REFERENCES' : analysis ? 'PROVISIONAL' : benchmark ? benchmark.status.toUpperCase() : data.league.practice || data.officialEligible === false ? 'PRACTICE' : 'UNOFFICIAL';
  const reference = (game, player = own) => timestamped ? availableScoringReference(playerReference(data, game, player.id)) ? playerReference(data, game, player.id) : null : analysis && finite(analysis.games?.[game.id]?.value) ? {value:analysis.games[game.id].value,source:analysis.source,collectedAt:analysis.capturedAt,observedAt:null,status:analysis.stale?'stale':'provisional'} : benchmark && finite(game.market) ? { value: game.market, source: benchmark.source, observedAt: benchmark.quotedAt, collectedAt: benchmark.capturedAt, status: benchmark.stale ? 'stale' : benchmark.status } : finite(game.analysisMarket?.value) ? game.analysisMarket : finite(game.lastMarketReference?.value) ? game.lastMarketReference : finite(game.market) ? { value: game.market, source: data.snapshot?.source, observedAt: data.snapshot?.quotedAt, collectedAt: data.snapshot?.capturedAt, status: 'historical' } : null;
  const pick = (game, player) => player.id === data.playerId ? game.prediction : player.submitted ? game.opponents?.find(value => value.id === player.id)?.value : null;
  const gap = (game, player) => submitted && player.submitted && finite(pick(game, player)) && reference(game, player) ? Math.abs(pick(game, player) - reference(game, player).value) : null;
  const games = submitted ? [...filterStatus.visibleGames].sort((a, b) => (gap(b, own) ?? -1) - (gap(a, own) ?? -1)) : [];
  const maxGap = Math.max(1, ...games.flatMap(game => players.map(player => gap(game, player) ?? 0)));
  const capturedAt = analysis?.capturedAt || benchmark?.capturedAt || data.snapshot?.capturedAt;
  const rows = all ? games : games.slice(0, 5);
  const marketCapture = data.marketFeed?.collectedAt || capturedAt;
  const noticeScope = `${data.league.id}:${data.playerId}:${data.mode}`;
  useEffect(() => {
    const previous = seenCapture.current;
    if (previous?.scope === noticeScope && previous.capture && Date.parse(marketCapture) > Date.parse(previous.capture)) setUpdatedCapture(marketCapture);
    else if (previous?.scope !== noticeScope) setUpdatedCapture(null);
    seenCapture.current = {scope: noticeScope, capture: marketCapture};
  }, [noticeScope, marketCapture]);
  const deadline = data.league.deadline;
  const perGame = data.rules?.perGameScoring === true;
  const now = Date.parse(data.now || new Date().toISOString());
  const closed = perGame ? data.games.every(game => Date.parse(game.kickoff) <= now) : Boolean(deadline) && now >= Date.parse(deadline);
  // Redesign stage 15 (D-37, D-39): once the live rules make submitted guesses final (M-02), a ballot that is in is no longer editable.
  const picksFinal = sentFinal(data.rules);
  const market = id => { const state = data.statuses?.[id] || {}; return { satOut: Boolean(state.satOut), submitted: Boolean(state.submittedAt), filled: state.filled || 0 }; };
  const record = own.betRecord;
  const tiles = [
    { id: 'guess_spread', title: 'Spread', icon: Crosshair }, { id: 'guess_total', title: 'Total', icon: Layers3 }, { id: 'betting_challenge', title: 'Challenge', icon: Flag },
  ].map(item => {
    if (item.id === 'betting_challenge') return { ...item, label: record ? `${record.W}–${record.L}–${record.P} W–L–P` : 'Your card', due: false, done: false };
    const state = market(item.id);
    const label = state.satOut ? 'Sat out' : state.submitted ? 'Submitted' : `${state.filled}/${data.games.length} entered`;
    return { ...item, label, due: !closed && !state.satOut && !state.submitted, done: state.submitted || state.satOut };
  });
  const due = tiles.filter(item => item.due).map(item => item.title);
  const kept = tiles.filter(item => item.done && item.id !== 'betting_challenge').map(item => item.title);
  // Real deadline only (never a manufactured countdown).
  const nextAction = perGame ? closed ? 'All games have kicked off. Your saved guesses and scores remain available.'
    : due.length ? `Next: your remaining ${due.join(' and ')} guesses. Each game stays open until its own kickoff.`
    : 'Your guesses are locked in or sat out. Saved scores remain available.'
    : !deadline ? (due.length ? `Next: your ${due.join(' and ')} ballot${due.length > 1 ? 's' : ''}.` : 'Both ballots are in.')
    : closed ? `Picks closed ${date(deadline)} PT.`
    : due.length ? `Next: ${due.join(' and ')} ballot${due.length > 1 ? 's' : ''} due ${date(deadline)} PT.${kept.length ? ` ${kept.join(' and ')} ${kept.length > 1 ? 'are' : 'is'} in · ${picksFinal ? 'final' : 'editable until then'}.` : ''}`
    : `Both ballots are in · ${picksFinal ? 'final' : `editable until ${date(deadline)} PT`}.`;
  const measurable = games.some(game => players.some(player => gap(game, player) !== null));
  const pending = players.filter(player => player.id !== own.id && !player.submitted).map(player => player.name.split(' ')[0]);
  const emptyReasons = [
    ...(games.every(game => !reference(game)) ? [timestamped ? 'No scoring reference was saved with your ballot, so your gaps cannot be measured.' : 'No market reference is recorded for these games yet.'] : []),
    ...(pending.length ? [`${pending.join(pending.length > 2 ? ', ' : ' and ')} ${pending.length > 1 ? 'have' : 'has'} not submitted; their gaps appear after they do.`] : []),
  ];
  const warning = refreshWarning(data);
  const showUpdate = submitted && preferences.notices.marketUpdates && updatedCapture;
  const issue = warning || null;
  const showIssue = submitted && preferences.notices.dataIssues && issue;
  // Situational trends: line-free records for every game; a market's line-dependent records unlock with its ballot and are marked with this player's saved reference only.
  // Redesign stage 17 (D-39): each game's gate is its own (own lock-in, sit-out, or that game's kickoff; under today's rules also the deadline).
  const trendMarket = total ? 'total' : 'spread';
  const trendProps = game => ({ season: data.league.season, week: data.league.week, gameId: game.id, away: game.awayCode, home: game.homeCode, access: groupAccess(data, game.id), savedLabel: 'your saved reference',
    saved: submitted && reference(game) && finite(reference(game).value) ? { [trendMarket]: reference(game).value } : {} });
  return <div className="visual-dashboard" data-layout={preferences.layout} data-dashboard-motion={preferenceStatus.resolvedMotion}>
    {(showUpdate || showIssue) && <section className="dashboard-notices" aria-label="Dashboard notices"><h2><Bell size={18}/>Dashboard notices</h2>{showUpdate && <p className="market-update-notice" role="status">New saved market data · collected {date(updatedCapture)} PT. Compare the latest recorded values before reviewing a selection.</p>}{showIssue && <p>{issue}</p>}<small>Shown while this dashboard is open. Phone push, email and SMS are not connected.</small></section>}
    {(preferences.modules.scores || !submitted) && <>
    <section className="panel visual-scoreboard" aria-label={timestamped ? `${marketName} submission-time accuracy comparison` : total ? 'Total provisional accuracy comparison' : benchmark ? 'Spread scoring benchmark' : 'Spread accuracy comparison'}>
      <div className="visual-panel-heading"><div><span className="eyebrow">WEEK {data.league.week} · {marketName.toUpperCase()}</span><h2>Accuracy matchup</h2></div><span className={`badge ${status === 'FROZEN' ? 'lime' : 'amber'}`}>{status}</span></div>
      <div className="visual-source-line"><span>{timestamped ? 'Each guess uses its saved scoring reference' : analysis ? `Provisional ${marketName.toLowerCase()} comparison · Not official scoring` : benchmark ? `${benchmark.status === 'frozen' ? 'Frozen' : 'Provisional'} spread benchmark` : data.snapshot ? 'Historical accuracy reference' : 'Accuracy reference pending'}</span><span>{timestamped ? 'Market updates do not change points' : capturedAt ? `Collected ${sourceAge(capturedAt, data.now)}` : 'Quotes pending'}{(analysis?.stale || benchmark?.stale && benchmark.status !== 'frozen') ? ' · Stale saved reference' : ''}</span></div>
      {!submitted ? <div className="visual-locked"><LockKeyhole size={24}/><h3>{perGame ? 'Your per-game scores' : 'Your ballot comes first'}</h3><p>{perGame ? 'Open My picks for each locked guess, its saved line and available points. Other games can stay drafts.' : <>Submit your {marketName} ballot to reveal its available references and player comparison.</>}</p><button className="primary" onClick={() => go('picks', mode)}>Open {marketName.toLowerCase()} ballot <ArrowRight size={16}/></button></div> : timestamped ? <DashboardInsights data={data} games={filterStatus.visibleGames} trend={preferences.modules.history ? historyChart : null} embedded/> : <div className="accuracy-bars" aria-label="Player accuracy bars">{players.map(player => {
        const value = player.submitted && finite(player.points) ? player.points : null;
        return <details className="accuracy-player" key={player.id}>
          <summary aria-label={`Expand ${player.name} accuracy details`}><span className="accuracy-row"><span>{player.name}{player.id === data.playerId && <small>YOU</small>}{player.officialEligible===false&&<small>Practice · No official score</small>}</span><strong className={player.id === data.playerId ? 'score-number' : ''}>{fmt(value)}<small> / {data.maxPoints}</small></strong></span><span className="accuracy-track" aria-hidden="true">{value !== null && <i className={player.id === data.playerId ? 'own' : ''} style={{ width: `${Math.min(100, Math.max(0, value / Math.max(1, data.maxPoints) * 100))}%` }}/>}</span><span className="accuracy-caption">{value === null ? player.submitted ? 'Score unavailable' : 'Ballot not submitted' : `${value} accuracy points`}<ChevronDown size={16}/></span></summary>
          <div className="visual-drilldown">{player.submitted?<dl><div><dt>Closest-pick record</dt><dd>{player.record ? `${player.record.W}–${player.record.L}–${player.record.T}` : 'Awaiting eligible ballots'}</dd></div><div><dt>Exact guesses</dt><dd>{fmt(player.exact)}</dd></div><div><dt>Total error</dt><dd>{fmt(player.error)}{finite(player.error) ? ' points' : ''}</dd></div></dl>:<p>Accuracy details appear after this player submits a full ballot.</p>}</div>
        </details>;
      })}</div>}
      <div className="visual-score-footer"><span>{data.league.practice || data.officialEligible === false ? 'Practice comparison · No official scores' : timestamped ? 'Each guess uses its saved scoring reference' : analysis ? `Provisional analysis · Official ${marketName} policy and freeze pending` : benchmark ? benchmark.status === 'frozen' ? 'Frozen at confirmed kickoff' : 'Provisional · kickoff freeze pending' : data.league.practice || data.officialEligible === false ? 'Practice comparison · No official scores' : 'Official benchmark pending'}</span><button className="text-button" onClick={() => go('leaderboard', mode)}>Standings <ArrowRight size={15}/></button></div>
      {submitted && <details className="visual-provenance"><summary>Source & scoring details <ChevronDown size={16}/></summary>{timestamped ? <ScoringPolicyNote data={data}/> : analysis ? <div className="visual-drilldown"><p>{analysis.source} · Collected {date(analysis.capturedAt)} PT.</p><p>Every player is compared with the same complete recorded {marketName} snapshot. These provisional accuracy points are analysis estimates; the official {marketName} benchmark policy and kickoff freeze remain pending.</p></div> : provenance}</details>}
    </section></>}
    <section className="visual-next" aria-label="Next action">
      <p className="visual-next-action">{nextAction}</p>
      <div className="visual-actions" aria-label="Your game modes">{tiles.map(item => <button className={`game-option${item.due ? ' is-due' : ''}${item.done ? ' is-done' : ''}`} key={item.id} onClick={() => go('picks', item.id)}><item.icon size={19}/><strong>{item.title}</strong><small>{item.label}</small><ArrowRight size={16}/></button>)}</div>
    </section>
    {submitted && preferences.modules.scores && <details className="panel dashboard-detail-comparison"><summary>Compare accuracy in detail <ChevronDown size={18}/></summary><PlayerComparison data={data} benchmark={benchmark}/></details>}
    {submitted && (preferences.modules.gaps || preferences.modules.history && !(timestamped && preferences.modules.scores)) && <div className="visual-chart-grid">{preferences.modules.gaps && <section className="panel visual-gaps"><div className="visual-panel-heading"><div><h2>{timestamped ? 'Errors against saved references' : 'Guess-to-market gaps'}</h2><p>{timestamped ? 'Each player’s scoring reference · smaller is closer' : benchmark ? 'Competition benchmark gaps · smaller is closer' : 'Points apart · smaller is closer'}</p></div><span className="badge">{games.length} GAMES</span></div><div className="gap-legend">{players.map((player) => <span key={player.id}><i className={player.id === data.playerId ? 'own' : ''}/>{player.name.split(' ')[0]}</span>)}</div>
      {!measurable && rows.length > 1 ? <div className="gap-empty" role="note"><h3>No gaps to measure yet</h3>{emptyReasons.map(reason => <p key={reason}>{reason}</p>)}</div> : <div className="gap-game-list">{!rows.length&&<div className="visual-drilldown"><p>No matchups selected. Open Customize dashboard → Choose dashboard games, or return to All games. Your full-slate scores are unchanged.</p></div>}{rows.map(game => <details className="gap-game" key={game.id}><summary aria-label={`Expand ${game.awayCode} at ${game.homeCode} gap details`}><span className="gap-game-label"><TeamMatchup game={game} compact/><ChevronDown size={17}/></span><span className="gap-bars">{players.map(player => { const value = gap(game, player); return <span className="gap-bar-row" key={player.id}><span className="sr-only">{player.name}: </span>{value === null ? <span className="gap-missing">{player.submitted ? 'Reference unavailable' : 'Not submitted'}</span> : <><span className="gap-track" aria-hidden="true"><i className={player.id === data.playerId ? 'own' : ''} style={{ width: `${value / maxGap * 100}%` }}/>{value === 0 && <b className={player.id === data.playerId ? 'own' : ''}/>}</span><strong>{value === 0 ? '0 · Exact' : fmt(value)}</strong></>}</span>; })}</span></summary><div className="visual-drilldown">{timestamped && <><div className="reference-players">{players.filter(player => player.submitted).map(player => <div key={player.id}><h4>{player.name} · Guess {number(pick(game, player))}</h4><ReferenceValue reference={playerReference(data, game, player.id)} total={total}/></div>)}</div><CurrentConsensus data={data} game={game}/></>}<p>{timestamped ? 'Your saved scoring reference' : total ? 'Combined-points reference' : `${game.homeCode} home-spread reference`} · {reference(game) ? number(reference(game).value) : 'Unavailable'}{reference(game)?.status === 'stale' ? ' · Stale saved reference' : ''}</p><dl>{players.map(player => <div key={player.id}><dt>{player.name}</dt><dd>{player.submitted ? finite(pick(game, player)) ? number(pick(game, player)) : 'Unavailable' : 'Not submitted'}</dd></div>)}<div><dt>Your accuracy</dt><dd>{finite(analysis?.games?.[game.id]?.points ?? game.points) ? `${fmt(analysis?.games?.[game.id]?.points ?? game.points)} / 10 pts` : 'Unscored'}</dd></div></dl>{reference(game) && <p className="visual-source-detail">{reference(game).source}<br/>{reference(game).observedAt && <>Observed {date(reference(game).observedAt)} PT · </>}Collected {date(reference(game).capturedAt || reference(game).collectedAt)} PT</p>}{preferences.modules.trends && <section className="visual-trends" aria-label={`Trends for ${game.awayCode} at ${game.homeCode}`}><GameTrends {...trendProps(game)} level={5}/></section>}<p className="visual-source-detail">Point differences are not betting recommendations.</p></div></details>)}</div>}
      {(measurable || rows.length < 2) && games.length > 5 && <button className="wide-text" aria-expanded={all} onClick={() => setAll(!all)}>{all ? 'Show fewer games' : `Show all ${games.length} games`}<ChevronDown size={17}/></button>}
      <div className="visual-score-footer"><span>Largest gaps first</span><button className="text-button" onClick={() => go('edges', mode)}>Analysis <ArrowRight size={15}/></button></div>
    </section>}{preferences.modules.history && !(timestamped && preferences.modules.scores) && <div className="visual-history">{filterStatus.visibleGames.length?React.cloneElement(historyChart,{matchups:filterStatus.visibleGames}):<section className="panel visual-drilldown"><h2>Market line movement</h2><p>Choose at least one dashboard matchup to view its recorded history.</p></section>}<div className="visual-refresh"><RefreshCw size={16}/><span>{refreshLabel(data)}{data.oddsSchedule?.enabled&&data.oddsSchedule.nextRunAt&&<small>Next update {date(data.oddsSchedule.nextRunAt)} PT</small>}{refreshWarning(data)&&refreshWarning(data)!==refreshLabel(data)&&<strong className="refresh-warning">{refreshWarning(data)}</strong>}</span></div></div>}</div>}
    {preferences.modules.trends && (!submitted || !preferences.modules.gaps || (!measurable && rows.length > 1)) && <section className="panel visual-game-trends" aria-labelledby="visual-game-trends-title">
      <div className="visual-panel-heading"><div><h2 id="visual-game-trends-title">Game trends</h2><p>Past results by game situation from public nflverse data. Reference only; trends never change scoring.</p></div><span className="badge">{filterStatus.visibleGames.length} GAMES</span></div>
      <ul className="visual-trend-games">{filterStatus.visibleGames.map(game => <li key={game.id}><h3><TeamMatchup game={game} compact/></h3><GameTrends {...trendProps(game)} level={4}/></li>)}</ul>
    </section>}
    <SocialDashboardCard player={data.playerId} season={data.league.season} week={data.league.week} go={go}/>
    {preferences.modules.connections && <DataConnections data={data}/>}
    <DashboardPreferences value={preferences} onChange={setPreferences} storageAvailable={preferenceStatus.storageAvailable}>
      <DashboardMatchupFilter games={data.games} season={data.league.season} week={data.league.week} value={matchupFilter} onChange={setMatchupFilter} storageAvailable={filterStatus.storageAvailable}/>
    </DashboardPreferences>
  </div>;
}
