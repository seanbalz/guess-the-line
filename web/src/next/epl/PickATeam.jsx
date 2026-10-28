// Play › Pick a Team (spec section 6, mockups v3 "Play · Pick a Team"; plan Task 8). The hero card holds the draft board
// (DraftBoard), the one lime button when it's your turn ("Pick Chelsea"; otherwise a line naming who's on the clock) and
// the deadline line; under it the clubs still available, the backup ranking (queue) sheet and last matchweek's margin
// bars. gtl-api decides every pick (cloud/epl.mjs, M-30); a refusal re-reads the board. A refused read (a non-member's
// 403, the feature off) shows its sentence and never the board.
import { useId, useState } from 'react';
import { Button, Card, Skeleton, Toast } from '../ui/index.js';
import { CrestGrid, DraftBoard } from './DraftBoard.jsx';
import { MarginChart } from './MarginChart.jsx';
import { QueueSheet } from './QueueSheet.jsx';
import { PICK_COPY, boardModel, deadlineLine, readProblem, runPick } from './draftModel.js';
import { eplApi } from './api.js';
import { useEplDraft } from './useEplDraft.js';

/** The failed or loading read, or null when there is a board to draw. */
export function DraftReadState({ state, model, onRetry }) {
  if (model) return null;
  if (!state || state.status === 'loading') return <Skeleton label={PICK_COPY.loading} shape="panels" count={2}/>;
  const problem = readProblem(state.error);
  const retry = problem === PICK_COPY.failed;
  return <section className="gx-empty">
    <p className="gx-t-body">{problem}</p>
    {retry && onRetry ? <Button variant="secondary" onClick={onRetry}>{PICK_COPY.retry}</Button> : null}
  </section>;
}

export function PrimaryAction({ model, selected, busy, onPick }) {
  if (model.locked) return <Button variant="primary" block disabled>{PICK_COPY.locked}</Button>;
  // Someone else on the clock (or everyone in): a line, not a button. The latest picker may still change below it.
  const clock = model.onClockMe ? null : <p className="gx-epl-clock">{model.onClockName ? PICK_COPY.onClock(model.onClockName) : PICK_COPY.everyonePicked}</p>;
  if (model.canPick && selected) {
    const name = model.clubName(selected);
    return <>{clock}<Button variant="primary" block disabled={busy} onClick={() => onPick(selected)}>{model.changing ? PICK_COPY.change(name) : PICK_COPY.pick(name)}</Button></>;
  }
  if (model.onClockMe) return <>
    <Button variant="primary" block disabled aria-describedby="gx-epl-choose">{PICK_COPY.pickAClub}</Button>
    <p className="gx-t-meta gx-epl-center" id="gx-epl-choose">{PICK_COPY.chooseBelow}</p>
  </>;
  return clock;
}

/**
 * The screen for one board, with no hooks of its own: `model` (boardModel), `state` (draftReducer) for loading and
 * refusals, the selected club, and the handlers. Tests press its buttons directly.
 */
export function PickATeamView({ model, state, selected, busy, notice, onSelect, onPick, onQueue, onDismissNotice, onRetry, ids = {} }) {
  if (!model) return <div className="gx-epl-pick"><DraftReadState state={state} model={model} onRetry={onRetry}/></div>;
  const heroId = ids.hero ?? 'gx-epl-pick-hero', availId = ids.avail ?? 'gx-epl-pick-avail', bonusId = ids.bonus ?? 'gx-epl-pick-bonus';
  return <div className="gx-epl-pick">
    {state?.stale ? <p className="gx-t-meta gx-c-2">{PICK_COPY.stale}</p> : null}
    <Card as="section" variant="hero" className="gx-epl-hero" aria-labelledby={heroId}>
      <h2 className="gx-t-micro gx-epl-kicker" id={heroId}>{PICK_COPY.draftLabel(model.week)}</h2>
      <DraftBoard model={model}/>
      <div className="gx-epl-action">
        <PrimaryAction model={model} selected={selected} busy={busy} onPick={onPick}/>
        <p className="gx-t-meta gx-epl-center gx-epl-hero-meta">{deadlineLine(model)}</p>
      </div>
    </Card>
    {notice ? <Toast text={notice.text} tone={notice.tone} onDismiss={onDismissNotice} className="gx-epl-toast"/> : null}
    {model.available.length && !model.locked ? <Card as="section" aria-labelledby={availId}>
      <h2 className="gx-t-micro gx-c-2" id={availId}>{PICK_COPY.available}</h2>
      <CrestGrid model={model} selected={selected} onSelect={onSelect} busy={busy}/>
      {model.canPick ? null : <p className="gx-t-meta gx-c-2">{PICK_COPY.notYourTurn}</p>}
    </Card> : null}
    {model.queue !== null ? <Button variant="secondary" block disabled={model.locked || busy} onClick={onQueue}>{PICK_COPY.queue}</Button> : null}
    <Card as="section" aria-labelledby={bonusId}>
      <h2 className="gx-t-micro gx-c-2" id={bonusId}>{PICK_COPY.bonusTitle}</h2>
      <MarginChart bonus={model.bonus} review={model.review} clubName={model.clubName}/>
    </Card>
  </div>;
}

export function PickATeam({ api = eplApi }) {
  const { state, now, reload } = useEplDraft(api);
  const model = boardModel(state.data, now);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const base = useId();
  const ids = { hero: `${base}-hero`, avail: `${base}-avail`, bonus: `${base}-bonus` };
  // A selection that is no longer available (someone else took it, or the board moved on) is dropped.
  const shown = model?.canPick && model.available.some(c => c.code === selected) ? selected : null;
  async function pick(club) {
    if (!model || busy) return;
    setBusy(true);
    const result = await runPick({ api, club, model });
    setBusy(false);
    setNotice(result.notice);
    if (result.clear) setSelected(null);
    if (result.refresh) reload();
  }
  return <>
    <PickATeamView model={model} state={state} selected={shown} busy={busy} notice={notice} ids={ids}
      onSelect={code => setSelected(current => (current === code ? null : code))} onPick={pick}
      onQueue={() => setQueueOpen(true)} onDismissNotice={() => setNotice(null)} onRetry={reload}/>
    {queueOpen && model ? <QueueSheet model={model} api={api} onClose={() => setQueueOpen(false)}
      onDone={result => { setNotice(result.notice); if (result.ok) { setQueueOpen(false); reload(); } }}/> : null}
  </>;
}
