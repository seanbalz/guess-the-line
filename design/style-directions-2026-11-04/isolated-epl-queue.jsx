// Native QueueSheetView isolated from the controller. Preview save caption, taken-club note and optional fixture text only.
import React from 'react';
import {ArrowDown,ArrowUp,Plus,X} from 'lucide-react';
import {Button} from '../../web/src/next/ui/Button.jsx';
import {IconButton} from '../../web/src/next/ui/IconButton.jsx';
import {Sheet} from '../../web/src/next/ui/Sheet.jsx';
import {Crest} from '../../web/src/next/epl/DraftBoard.jsx';
import {moveClub} from '../../web/src/next/epl/draftModel.js';
export const QUEUE_COPY = Object.freeze({
  title: 'Backup ranking',
  intro: 'When your turn starts, your highest-ranked available club is picked automatically. If none of your ranked clubs are available, your turn stays open for a manual pick.',
  legacyIntro: 'If you haven’t picked by first kickoff, you get your highest-ranked club that’s still available.',
  empty: 'No clubs ranked yet. Add clubs below.',
  ranked: 'Your ranking',
  add: 'Add clubs',
  save: 'Preview ranking',
  saving: 'Saving…',
});

export function QueueSheetView({ clubs, queue, onChange, onSave, onClose, busy, onTurn = false }) {
  const byCode = new Map(clubs.map(c => [c.code, c]));
  const name = code => byCode.get(code)?.name ?? code;
  const rest = clubs.filter(c => !queue.includes(c.code));
  return <Sheet title={QUEUE_COPY.title} onClose={onClose} tall
    footer={<Button variant="primary" block haptic={false} disabled={busy} onClick={onSave}>{busy ? QUEUE_COPY.saving : QUEUE_COPY.save}</Button>}>
    <p className="gx-t-body gx-c-2">{onTurn ? QUEUE_COPY.intro : QUEUE_COPY.legacyIntro}</p>
    <h3 className="gx-t-label gx-epl-queue-head">{QUEUE_COPY.ranked}</h3>
    {queue.length ? <ol className="gx-epl-queue">
      {queue.map((code, i) => (
        <li key={code} className="gx-epl-queue-row">
          <span className="gx-epl-queue-rank">{i + 1}</span>
          <Crest code={code} size="sm"/>
          <span className="gx-grow gx-epl-queue-name">{name(code)}{byCode.get(code)?.taken?<small className="real-epl-taken">Taken in sample</small>:null}</span>
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
            <span className="gx-grow gx-epl-queue-name">{club.name}{club.opponent?<span className="gx-t-meta gx-c-2"> · {club.home ? 'vs' : 'at'} {club.opponent}</span>:null}</span>
            <IconButton icon={Plus} size={20} label={`Add ${club.name}`} disabled={busy} onClick={() => onChange([...queue, club.code])}/>
          </li>
        ))}
      </ul>
    </> : null}
  </Sheet>;
}
