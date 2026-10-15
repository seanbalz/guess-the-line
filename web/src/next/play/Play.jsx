// The live, account-wide Spread/Total ballot inside the new shell. Both apps use the same editor and hosted
// rules: full-market Submit and edits until the deadline while sentFinal is false. No per-game lock-in is sent.
import { useCallback, useMemo } from 'react';
import { WeekPicks } from '../../CommunityHome.jsx';
import { useAppData } from '../data/AppData.jsx';
import { COMMUNITY } from '../data/league.js';
import { useShell } from '../shell/context.js';
import { Button } from '../ui/index.js';
import './play.css';

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

  return (
    <div className="gx-screen gx-live-workflow gx-live-play">
      <h1 className="gx-t-title">Play</h1>
      <p className="gx-t-body gx-c-2">Your Spread and Total picks are shared across your leagues. Each market has its own ballot and score.</p>
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
          onSaved={refreshBallot}
          onSatOut={refreshBallot}
          onSignInAgain={requestSignIn}
          onReveal={reveal}
        />
      )}
    </div>
  );
}
