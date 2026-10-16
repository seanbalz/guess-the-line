// The account-wide Play surface follows live server capabilities. M-07 opens per-game entry and receipts;
// until all capabilities are reported, the existing whole-market editor retains the hosted rules.
import { useCallback, useMemo } from 'react';
import { WeekPicks } from '../../CommunityHome.jsx';
import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { COMMUNITY } from '../data/league.js';
import { useShell } from '../shell/context.js';
import { Button } from '../ui/index.js';
import { playPresentation } from './PlayPresentation.jsx';
import './play.css';
import { cloudApi } from '../../api.js';
import { LeagueFailure, useLeagueRead } from '../league/useLeagueRead.jsx';
import { PerGameEditor } from './PerGamePlay.jsx';
import { WeeklyScore } from './WeeklyScore.jsx';
import { perGameReady } from './scoring.js';

const modeOf = value => value === 'total' || value === 'guess_total' ? 'guess_total'
  : value === 'spread' || value === 'guess_spread' ? 'guess_spread' : null;
const marketKey = accountId => `gtl.play-market.${accountId}`;
function rememberedMarket(accountId) {
  try { return modeOf(sessionStorage.getItem(marketKey(accountId))); } catch { return null; }
}

export function Play() {
  const app = useAppData();
  const shell = useShell();
  const { accountId, refresh, requestSignIn } = app;
  const feed = app.community.data;
  const personal = useSharedRead('personal');
  const score = shell.state.views.play.section === 'score';
  const market = modeOf(shell.state.views.play.market);
  const refreshBallot = useCallback(() => refresh({ only: ['community', 'personal'] }), [refresh]);
  const marketNavigation = useMemo(() => ({
    read: () => market ?? rememberedMarket(accountId),
    write: mode => {
      shell.setView('play', { market: mode === 'guess_total' ? 'total' : 'spread' });
      try { sessionStorage.setItem(marketKey(accountId), mode); } catch { /* In-memory navigation still works. */ }
    },
  }), [accountId, market, shell.setView]);
  const reveal = mode => {
    app.chooseLeague(COMMUNITY);
    shell.go('league', { view: 'feed', market: mode });
  };

  if (score) return <div className="gx-screen gx-vstack gx-gap-16"><h1 className="gx-t-title">Your weekly score</h1><Button variant="ghost" onClick={() => shell.setView('play', { section: 'picks' })}>Back to picks</Button><WeeklyScore/></div>;
  if (perGameReady(personal.data?.rules)) return <div className="gx-screen gx-live-play gx-live-workflow gx-vstack gx-gap-16"><h1 className="gx-t-title">Play</h1><Button variant="ghost" onClick={() => shell.setView('play', { section: 'score' })}>Your weekly score</Button><SelectedPlay app={app} shell={shell} current={personal.data} mode={market || 'guess_spread'} onMode={marketNavigation.write}/></div>;
  return (
    <div className="gx-screen gx-live-workflow gx-live-play">
      <h1 className="gx-t-title">Play</h1>
      <Button variant="ghost" onClick={() => shell.setView('play', { section: 'score' })}>Your weekly score</Button>
      <p className="gx-t-body gx-c-2">Guess the line. Submit a complete Spread or Total ballot when you’re ready.</p>
      {!feed ? (
        <section className="gx-empty" role={app.community.status === 'error' ? 'alert' : 'status'}>
          <p className="gx-t-body">{app.community.status === 'error' ? 'Your picks could not be loaded.' : 'Loading your picks…'}</p>
          {app.community.status === 'error' ? <Button onClick={() => refresh({ only: ['community'] })}>Try again</Button> : null}
        </section>
      ) : (
        <WeekPicks
          key={accountId}
          accountId={accountId}
          feed={feed}
          posts={feed.posts ?? []}
          optOuts={feed.optOuts ?? []}
          initialMode={feed.picksDue?.modes?.[0]?.mode}
          marketNavigation={marketNavigation}
          presentation={playPresentation}
          onSaved={refreshBallot}
          onSatOut={refreshBallot}
          onSignInAgain={requestSignIn}
          onReveal={reveal}
        />
      )}
    </div>
  );
}

function SelectedPlay({ app, shell, current, mode, onMode }) {
  const view = shell.state.views.play;
  const season = Number.isInteger(view.season) ? view.season : current.season;
  const week = Number.isInteger(view.week) ? view.week : current.week;
  const read = useLeagueRead(`${app.accountId}:play:${season}:${week}:${mode}`, signal => cloudApi('personal/read', { season, week }, { signal }), error => { if (error.status === 401) app.requestSignIn(); });
  if (read.loading) return <p className="gx-t-body" role="status">Loading your picks…</p>;
  if (read.error) return <LeagueFailure error={read.error} onRetry={read.retry}/>;
  if (!perGameReady(read.data?.rules)) return <p className="gx-t-body" role="alert">Scoring rules changed. Refresh the app before making a pick.</p>;
  return <PerGameEditor key={`${app.accountId}:${season}:${week}:${mode}`} accountId={app.accountId} initialData={read.data} mode={mode} optOuts={app.community.data?.optOuts || []}
    onMode={onMode} setDirty={shell.setDirty} onSignInAgain={app.requestSignIn} onSaved={() => app.refresh({ only: ['community', 'personal'] })}
    onScore={patch => shell.setView('play', { ...patch, section: 'score' })}/>;
}
