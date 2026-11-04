// D-69 step 1 (spec section 6, Your score): week chips replace the season and week dropdowns and Previous/Next. Older
// seasons sit behind one "Season" chip that opens a row of season chips in place. Each chip is the kit's 44px Chip,
// selected lime with a check (never color alone).
import { useId, useState } from 'react';
import { Chip } from '../ui/index.js';
import './playFrame.css';

/** Weeks ascending, whole and positive, without repeats. */
export function weekList(weeks = []) {
  return [...new Set(weeks.filter(w => Number.isInteger(w) && w > 0))].sort((a, b) => a - b);
}

export function WeekChips({ label, weeks, week, onWeek, seasons = [], season, onSeason }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const older = seasons.length > 1;
  return (
    <div className="gx-week-chips-wrap">
      <div className="gx-week-chips" role="group" aria-label={label}>
        {older ? <Chip text aria-expanded={open ? 'true' : 'false'} aria-controls={panel} aria-pressed={undefined} onClick={() => setOpen(v => !v)}>Season {season}</Chip> : null}
        {weekList(weeks).map(w => <Chip key={w} text selected={w === week} onClick={() => onWeek(w)}>Week {w}</Chip>)}
      </div>
      {older ? (
        <div id={panel} className="gx-week-chips" role="group" aria-label="Season" hidden={!open}>
          {[...seasons].sort((a, b) => b - a).map(s => <Chip key={s} text selected={s === season} onClick={() => { setOpen(false); onSeason(s); }}>{s}</Chip>)}
        </div>
      ) : null}
    </div>
  );
}
