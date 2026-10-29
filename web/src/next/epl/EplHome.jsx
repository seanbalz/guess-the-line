// EPL Home (spec section 8, mockups v3 "Home"; plan Task 8): the matchweek title, a hero card counting down to the first
// kickoff (the Pick a Team deadline) with who picks next and how many are in, one button into Play › Pick a Team, and
// tiles for your club and your place in the pick order. The moneyline button, moneyline rank and fantasy tiles arrive
// with Plans 2 and 3. A refused read shows its sentence and no draft data. An account not linked to a manager sees the
// hero without the two tiles, under the claim card (ClaimCard.jsx; EPL open access).
import { useId } from 'react';
import { Button, Card, Countdown } from '../ui/index.js';
import { fmtDay, fmtWhen } from '../format.js';
import { Crest } from './DraftBoard.jsx';
import { DraftReadState } from './PickATeam.jsx';
import { boardModel } from './draftModel.js';
import { eplApi } from './api.js';
import { useEplDraft } from './useEplDraft.js';
import { ClaimCard } from './ClaimCard.jsx';

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

export function EplHomeView({ model, state, now, onOpenPick, onRetry, claim = null }) {
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
      <Button variant={model.onClockMe ? 'primary' : 'secondary'} block onClick={onOpenPick}>{model.onClockMe ? HOME_COPY.pickNow : HOME_COPY.open}</Button>
    </Card>
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

export function EplHome({ api = eplApi, onOpenPick }) {
  const { state, now, reload } = useEplDraft(api);
  const model = boardModel(state.data, now);
  return <EplHomeView model={model} state={state} onOpenPick={onOpenPick} onRetry={reload} claim={<ClaimCard model={model} api={api} onClaimed={reload}/>}/>;
}
