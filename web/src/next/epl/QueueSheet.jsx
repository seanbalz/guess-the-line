// The backup ranking (queue) sheet (spec 6.3): your private, ranked list of clubs. At the deadline the draft takes your
// highest-ranked club still available; with no queue, the manager on the clock gets no pick and 0 bonus. The list
// reorders with 44px move buttons (no drag needed), and every club playing this matchweek can be added. Saving sends
// the whole list through `queue/save`; the server checks it (at most 20 different clubs that play this matchweek).
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton, Sheet } from '../ui/index.js';
import { Crest } from './DraftBoard.jsx';
import { moveClub, saveQueue } from './draftModel.js';

export const QUEUE_COPY = Object.freeze({
  title: 'Backup ranking',
  intro: 'If you haven’t picked by first kickoff, you get your highest-ranked club that’s still available.',
  empty: 'No clubs ranked yet. Add clubs below.',
  ranked: 'Your ranking',
  add: 'Add clubs',
  save: 'Save ranking',
  saving: 'Saving…',
});

export function QueueSheetView({ clubs, queue, onChange, onSave, onClose, busy }) {
  const byCode = new Map(clubs.map(c => [c.code, c]));
  const name = code => byCode.get(code)?.name ?? code;
  const rest = clubs.filter(c => !queue.includes(c.code));
  return <Sheet title={QUEUE_COPY.title} onClose={onClose} tall
    footer={<Button variant="primary" block disabled={busy} onClick={onSave}>{busy ? QUEUE_COPY.saving : QUEUE_COPY.save}</Button>}>
    <p className="gx-t-body gx-c-2">{QUEUE_COPY.intro}</p>
    <h3 className="gx-t-label gx-epl-queue-head">{QUEUE_COPY.ranked}</h3>
    {queue.length ? <ol className="gx-epl-queue">
      {queue.map((code, i) => (
        <li key={code} className="gx-epl-queue-row">
          <span className="gx-epl-queue-rank">{i + 1}</span>
          <Crest code={code} size="sm"/>
          <span className="gx-grow gx-epl-queue-name">{name(code)}</span>
          <IconButton icon={ArrowUp} size={20} label={`Move ${name(code)} up`} disabled={busy || i === 0} onClick={() => onChange(moveClub(queue, i, -1))}/>
          <IconButton icon={ArrowDown} size={20} label={`Move ${name(code)} down`} disabled={busy || i === queue.length - 1} onClick={() => onChange(moveClub(queue, i, 1))}/>
          <IconButton icon={X} size={20} label={`Remove ${name(code)}`} disabled={busy} onClick={() => onChange(queue.filter(c => c !== code))}/>
        </li>
      ))}
    </ol> : <p className="gx-t-meta gx-c-2">{QUEUE_COPY.empty}</p>}
    {rest.length ? <>
      <h3 className="gx-t-label gx-epl-queue-head">{QUEUE_COPY.add}</h3>
      <ul className="gx-epl-queue">
        {rest.map(club => (
          <li key={club.code} className="gx-epl-queue-row">
            <Crest code={club.code} size="sm"/>
            <span className="gx-grow gx-epl-queue-name">{club.name}<span className="gx-t-meta gx-c-2"> · {club.home ? 'vs' : 'at'} {club.opponent}</span></span>
            <IconButton icon={Plus} size={20} label={`Add ${club.name}`} disabled={busy} onClick={() => onChange([...queue, club.code])}/>
          </li>
        ))}
      </ul>
    </> : null}
  </Sheet>;
}

/** The sheet with its own working copy of the list; `onDone(notice, clubs?)` closes it after a save attempt. */
export function QueueSheet({ model, api, onClose, onDone }) {
  const [queue, setQueue] = useState(() => (model.queue ?? []).filter(code => model.clubs.some(c => c.code === code)));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const result = await saveQueue({ api, clubs: queue, model });
    setBusy(false);
    onDone(result);
  }
  return <QueueSheetView clubs={model.clubs} queue={queue} onChange={setQueue} onSave={save} onClose={onClose} busy={busy}/>;
}
