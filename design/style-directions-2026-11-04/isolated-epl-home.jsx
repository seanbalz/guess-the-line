// Native presentation isolated from Home/draft/progress controllers and APIs.
// All Button sites suppress haptics. Table-source info adds an illustrative-data paragraph and omits source links.
import React,{useId} from 'react';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {Card} from '../../web/src/next/ui/Card.jsx';
import {Countdown} from '../../web/src/next/ui/Countdown.jsx';
import {Skeleton} from '../../web/src/next/ui/Skeleton.jsx';
import {InfoButton} from '../../web/src/next/ui/InfoButton.jsx';
import {Crest} from '../../web/src/next/epl/DraftBoard.jsx';
import {fmtDay,fmtWhen} from '../../web/src/next/format.js';
import {PICK_COPY,readProblem} from '../../web/src/next/epl/draftModel.js';
export const HOME_COPY = Object.freeze({
  title: week => `Matchweek ${week}`,
  fallbackTitle: 'Premier League',
  due: 'Due before first kickoff',
  next: (name, inCount, total) => `${name} picks next · ${inCount} of ${total} in`,
  youNext: (inCount, total) => `You pick next · ${inCount} of ${total} in`,
  allIn: total => `All ${total} picks in`,
  locked: (inCount, total) => `Draft locked · ${inCount} of ${total} in`,
  countdown: 'Draft locks in',
  done: 'Draft locked',
  pickNow: 'Make your pick',
  open: 'Open Pick a Team',
  yourPick: 'Your pick',
  notPicked: 'Not picked yet',
  pickOrder: 'Pick order',
});

function headline(model) {
  if (model.locked) return HOME_COPY.locked(model.picksIn, model.total);
  if (model.onClockMe) return HOME_COPY.youNext(model.picksIn, model.total);
  if (model.onClockName) return HOME_COPY.next(model.onClockName, model.picksIn, model.total);
  return HOME_COPY.allIn(model.total);
}

export function EplHomeView({ model, state, now, onOpenPick, onOpenGuess, moneyline, onRetry, claim = null }) {
  const heroId = useId();
  if (!model) return <div className="gx-screen">
    <h1 className="gx-t-title">{HOME_COPY.fallbackTitle}</h1>
    <DraftReadState state={state} model={model} onRetry={onRetry}/>
  </div>;
  const first = model.firstMatch;
  const mine = model.myNode;
  return <div className="gx-screen">
    <h1 className="gx-t-title">{HOME_COPY.title(model.week)}</h1>
    {claim}
    <Card as="section" variant="hero" className="gx-epl-hero" aria-labelledby={heroId}>
      <p className="gx-t-micro gx-epl-kicker">{HOME_COPY.due}</p>
      <h2 className="gx-epl-headline" id={heroId}>{headline(model)}</h2>
      <Countdown target={model.deadline} now={now} label={HOME_COPY.countdown} doneLabel={HOME_COPY.done} className="gx-epl-cd"/>
      {first ? <p className="gx-t-meta gx-epl-hero-meta">{fmtWhen(first.kickoff)} · {first.away} @ {first.home}</p> : null}
      <Button haptic={false} variant={model.onClockMe ? 'primary' : 'secondary'} block onClick={onOpenPick}>{model.onClockMe ? HOME_COPY.pickNow : HOME_COPY.open}</Button>
    </Card>
    <HomeMoneylineProgress state={moneyline} onOpenGuess={onOpenGuess}/>
    {mine ? <div className="gx-epl-tiles">
      <Card className="gx-epl-tile">
        <span className="gx-t-micro gx-c-2">{HOME_COPY.yourPick}</span>
        {model.myClub ? <>
          <span className="gx-epl-tile-club"><Crest code={model.myClub.code}/><span className="gx-t-strong">{model.myClub.name}</span></span>
          {model.myClub.opponent ? <span className="gx-t-meta">{model.myClub.home ? 'vs' : 'at'} {model.myClub.opponent} · {fmtDay(model.myClub.kickoff)}</span> : null}
        </> : <span className="gx-t-body gx-c-2">{HOME_COPY.notPicked}</span>}
      </Card>
      <Card className="gx-epl-tile">
        <span className="gx-t-micro gx-c-2">{HOME_COPY.pickOrder}</span>
        <span className="gx-epl-tile-num">{mine.slot}<span className="gx-t-meta"> / {model.total}</span></span>
        <span className="gx-t-meta">MW{model.week}</span>
      </Card>
    </div> : null}
  </div>;
}

export function DraftReadState({ state, model, onRetry }) {
  if (model) return null;
  if (!state || state.status === 'loading') return <Skeleton label={PICK_COPY.loading} shape="panels" count={2}/>;
  const problem = readProblem(state.error);
  const retry = problem === PICK_COPY.failed;
  return <section className="gx-empty">
    <p className="gx-t-body">{problem}</p>
    {retry && onRetry ? <Button haptic={false} variant="secondary" onClick={onRetry}>{PICK_COPY.retry}</Button> : null}
  </section>;
}

export function PrimaryAction({ model, selected, busy, onPick }) {
  if (model.locked) return <Button haptic={false} variant="primary" block disabled>{PICK_COPY.locked}</Button>;
  // Someone else on the clock (or everyone in): a line, not a button. The latest picker may still change below it.
  const clock = model.onClockMe ? null : <p className="gx-epl-clock">{model.onClockName ? PICK_COPY.onClock(model.onClockName) : PICK_COPY.everyonePicked}</p>;
  if (model.canPick && selected) {
    const name = model.clubName(selected);
    return <>{clock}<Button haptic={false} variant="primary" block disabled={busy} onClick={() => onPick(selected)}>{model.changing ? PICK_COPY.change(name) : PICK_COPY.pick(name)}</Button></>;
  }
  if (model.onClockMe) return <>
    <Button haptic={false} variant="primary" block disabled aria-describedby="gx-epl-choose">{PICK_COPY.pickAClub}</Button>
    <p className="gx-t-meta gx-epl-center" id="gx-epl-choose">{PICK_COPY.chooseBelow}</p>
  </>;
  return clock;
}

export function StandingsSource({ source }) {
  if (!source || !Number.isFinite(Date.parse(`${source.dataAsOf}T12:00:00Z`))) return null;
  const date = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${source.dataAsOf}T12:00:00Z`));
  return <div className="gx-epl-source">
    <span className="gx-t-meta gx-epl-hero-meta">Table used · {date}</span>
    <InfoButton title="About table fallback" body={[
      'Illustrative metadata only. No table was fetched, used or attached to a real draft.',
      'A table position was needed to resolve this draft. The saved table stays attached to that decision.',
      `Community standings from Wikipedia contributors, updated ${date}. Not independently verified official Premier League standings.`,
      'Changes: extracted match results, calculated standings and normalized club names. Derived data is available under CC BY-SA 4.0.',
    ]} links={[]}/>
  </div>;
}

export function HomeMoneylineProgress({ state, onOpenGuess }) {
  if (!state || state.status === 'idle') return null;
  if (state.status === 'loading') return <Button haptic={false} variant="secondary" block disabled>Loading moneyline progress…</Button>;
  if (state.status === 'ready') return <Button haptic={false} variant="secondary" block onClick={onOpenGuess}>Guess this weekend’s moneylines · {state.locked} of {state.total}</Button>;
  if (state.status === 'readonly') return <>
    <Button haptic={false} variant="secondary" block onClick={onOpenGuess}>View this weekend’s moneylines</Button>
    <p className="gx-t-meta gx-c-2">Read-only · link an FEPL manager in Pick a Team to enter guesses.</p>
  </>;
  return <>
    <Button haptic={false} variant="secondary" block onClick={onOpenGuess}>Open moneyline guesses</Button>
    <p className="gx-t-meta gx-c-2">{state.reason === 'prices_not_verified' ? 'Moneyline guessing isn’t available this week.' : 'Moneyline progress is unavailable. Pick a Team is still available above.'}</p>
  </>;
}
