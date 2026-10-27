import { useAppData, useSharedRead } from '../data/AppData.jsx';
import { useShell } from '../shell/context.js';
import { Button, InfoButton, Sheet } from '../ui/index.js';
import { INFO } from '../info.js';
import { EveryoneGame } from './EveryoneBets.jsx';
import { useGameBets } from './useGameBets.js';

export function GameBetsSheet({ args }) {
  const app = useAppData(), personal = useSharedRead('personal'), shell = useShell();
  const read = useGameBets(app, personal, args);
  const close = () => { if (shell.confirmLeave()) shell.closeSheet(); };
  const scopeName = app.league?.community === false ? app.league.name : 'Community';
  return <Sheet title="League bets" onClose={close} tall>
    <div className="gx-hstack gx-gap-8"><p className="gx-t-meta gx-grow">{scopeName} · Week {args.week} · {args.season} · Virtual Units</p><InfoButton {...INFO.gameBets}/></div>
    {read.status === 'loading' ? <p className="gx-t-body" role="status">Loading this game’s league bets…</p>
      : read.status === 'error' ? <><p className="gx-t-body" role="alert">League bets are unavailable for this game.</p><Button onClick={read.reload}>Retry league bets</Button></>
        : <><div className="gx-ev gx-vstack gx-gap-12">
          {!read.view.published ? <p className="gx-t-body">This week’s games are not published yet.</p>
            : read.view.game ? <EveryoneGame game={read.view.game}/>
              : <p className="gx-t-body">No Virtual Units picks for this game in {scopeName} yet.</p>}
          {read.view.closed.map(market => <Button key={market} variant="ghost" onClick={() => shell.go('play', { section: 'picks', market, season: args.season, week: args.week, pickGame: args.game })}>Open {market === 'spread' ? 'Spread' : 'Total'} in Play</Button>)}
        </div><Button variant="ghost" onClick={read.reload}>Refresh league bets</Button></>}
  </Sheet>;
}
