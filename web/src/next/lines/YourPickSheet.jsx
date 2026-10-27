import { Button, Card, InfoButton, Pill, Sheet } from '../ui/index.js';
import { useShell } from '../shell/context.js';
import { useLinesData } from './linesData.js';
import { EveryoneGuesses } from './EveryoneGuesses.jsx';
import { INFO } from '../info.js';
import { marketTime } from './marketDetails.js';
import { yourPick } from './yourPick.js';
import './lines.css';

export function YourPickDetail({ view }) {
  return <Card className="gx-l-pick gx-vstack gx-gap-12" aria-label="Your saved pick">
    <div className="gx-l-sechead"><p className="gx-t-strong gx-grow">{view.row.main}</p><InfoButton {...INFO.yourPick}/></div>
    {view.row.late && <Pill tone="pending">{view.row.late}</Pill>}
    {view.lockedAt && <p className="gx-t-meta">Locked in {marketTime(view.lockedAt)}</p>}
    <div><h3 className="gx-t-section">{view.lineLabel}</h3><p className="gx-n-m">{view.line ?? '—'}</p></div>
    {view.line !== null && <p className="gx-t-meta">{view.source ?? 'Source unavailable'} · Observed {marketTime(view.observedAt)}</p>}
  </Card>;
}

export function YourPickSheet({ args }) {
  const shell = useShell(), lines = useLinesData();
  const { app, personal, shown } = lines;
  const close = () => { if (shell.confirmLeave()) shell.closeSheet(); };
  const matches = app.accountId && app.accountId === args.accountId && shown?.season === args.season && shown?.week === args.week;
  const view = matches ? yourPick(personal.data, lines.community, args.game, args.market) : null;
  const marketName = args.market === 'total' ? 'Total' : 'Spread';
  const title = `Your ${marketName} pick`;
  if (!view) return <Sheet title={title} onClose={close}><p className="gx-t-body" role="status">This saved pick is not in the current account and week.</p><Button onClick={close}>Back to game</Button></Sheet>;
  const openPlay = market => shell.go('play', { section: 'picks', market, season: args.season, week: args.week, pickGame: args.game });
  return <Sheet title={title} onClose={close} back={{ label: `${view.game.away} @ ${view.game.home}`, onBack: close }} tall className="gx-l-sheet"
    footer={<Button block onClick={() => openPlay(args.market)}>Open {marketName} in Play</Button>}>
    <p className="gx-t-meta">Week {args.week} · {args.season} · Kickoff {marketTime(view.game.kickoff)}</p>
    {personal.error && <p className="gx-t-body" role="status">Your pick could not refresh. Showing the last loaded saved record.</p>}
    <YourPickDetail view={view}/>
    <Button variant="ghost" disabled={personal.loading} onClick={() => app.refresh({ only: ['personal'] })}>Refresh saved pick</Button>
    {view.lockedAt && <Button variant="ghost" onClick={() => shell.go('play', { section: 'score', season: args.season, week: args.week, market: args.market, scoreGame: args.game })}>View weekly score</Button>}
    <EveryoneGuesses key={`${app.accountId}:${args.season}:${args.week}:${args.game}:${args.market}`} lines={lines}
      game={{ id: args.game, awayCode: view.game.away, homeCode: view.game.home }} market={args.market} onGuess={openPlay}/>
  </Sheet>;
}
