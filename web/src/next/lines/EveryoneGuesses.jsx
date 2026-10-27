import { useState } from 'react';
import { useShell } from '../shell/context.js';
import { forfeitView } from '../play/forfeit.js';
import { Avatar, Button, Card, InfoButton, List, LockLine, Pill, Row, Segmented } from '../ui/index.js';
import { INFO } from '../info.js';
import { gameGuesses } from './gameGuesses.js';
import { useGameGuesses } from './useGameGuesses.js';

export function GuessRows({ view, market }) {
  if (!view.rows.length) return <p className="gx-t-body">No community entries for this game.</p>;
  return <Card variant="flush"><List label={`Community ${market === 'spread' ? 'Spread' : 'Total'} guesses`}>
    {view.rows.map(row => <Row key={row.id} you={row.you} className="gx-l-guess-row" start={<Avatar id={row.id} name={row.name} you={row.you}/>}
      title={<>{row.name}{row.you ? ' · You' : ''}</>} sub={`${row.status}${row.removed ? ' · Former member' : ''}`}>
      <span className="gx-l-guess-value gx-n-s">{row.hidden ? <LockLine as="span" className="gx-t-meta">Guess hidden</LockLine> : row.pick ?? '—'}</span>
      {row.score ? <span className="gx-t-meta gx-c-2">{row.score}</span> : null}
      {row.place ? <span className="gx-l-guess-place"><Pill tone="data">{row.place}</Pill></span> : null}
    </Row>)}
  </List></Card>;
}

export function EveryoneGuesses({ lines, game, onGuess, market: fixedMarket }) {
  const shell = useShell();
  const [selection, setMarket] = useState('spread');
  const revealScope = { accountId: lines.app.accountId, season: lines.shown?.season, week: lines.shown?.week };
  const canReveal = forfeitView(lines.community, revealScope)?.canConfirm === true;
  const market = fixedMarket ?? selection;
  const read = useGameGuesses(lines, game.id, market);
  const members = lines.community?.viewer?.toLowerCase() === lines.app.accountId.toLowerCase() ? lines.community.members ?? [] : [];
  const view = read.status === 'ready' ? gameGuesses(read.data, lines.app.accountId, members, game, market) : null;
  return <section className="gx-vstack gx-gap-12" aria-label="Everyone’s guesses">
    <div className="gx-l-sechead"><p className="gx-t-meta gx-grow">Community · Week {lines.shown.week}</p><InfoButton {...INFO.guessPicks}/></div>
    {fixedMarket ? <h3 className="gx-t-section">{market === 'spread' ? 'Spread' : 'Total'} community guesses</h3> : <Segmented label="Guess market" options={[{ value: 'spread', label: 'Spread' }, { value: 'total', label: 'Total' }]} value={market} onChange={setMarket}/>}
    {read.status === 'loading' ? <p className="gx-t-body" role="status">Loading community guesses…</p> : !view ? <>
      <p className="gx-t-body" role="status">Community guesses are unavailable.</p><Button onClick={read.reload}>Retry guesses</Button>
    </> : <>
      <p className="gx-t-meta">{view.summary}</p>
      {!view.open ? <><LockLine>Other players’ {market === 'spread' ? 'Spread' : 'Total'} guesses stay hidden until your lock-in, sit-out or kickoff.</LockLine><Button variant="ghost" onClick={() => onGuess(market)}>Open {market === 'spread' ? 'Spread' : 'Total'} guesses in Play</Button>{canReveal ? <Button variant="ghost" onClick={() => shell.openDialog('dlg.forfeit', revealScope)}>See picks now</Button> : null}</> : null}
      <GuessRows view={view} market={market}/>
      <Button variant="ghost" onClick={read.reload}>Refresh guesses</Button>
    </>}
  </section>;
}
