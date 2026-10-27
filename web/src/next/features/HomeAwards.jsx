// Home's recap (design lane, hierarchy pass; replaces the old one-line recap row): the newest week's awards as a rail of
// chips, one award open below them (its icon, the winners' faces, who and the value), and the way to every badge and
// award. It reads the shared features read (M-25, POST /league/features) through useFeatures and draws nothing while it
// is loading, failed or off, or before the job has posted a week: Home is unchanged until there is something to show.
// The chips are toggles (the kit's Chip): choosing one opens that award here. The viewer's own award is open first.
import { useId, useState } from 'react';
import { useShell } from '../shell/context.js';
import { AvatarStack, Badge, Button, Card, Chip, ChipRail } from '../ui/index.js';
import { useFeatures } from './useFeatures.js';
import './features.css';

export const HOME_AWARDS_COPY = Object.freeze({
  title: week => `Week ${week} awards`,
  rail: week => `Week ${week} awards`,
  youWon: name => `You won ${name}`,
  all: 'All badges and awards',
});

export function HomeAwards({ app }) {
  const shell = useShell(), id = useId();
  const { model } = useFeatures(app, shell);
  const recap = model?.recap ?? null;
  const [chosen, setChosen] = useState(null);
  if (!recap?.rows.length) return null;
  const open = recap.rows.find(row => row.id === chosen) ?? recap.mine ?? recap.rows[0];
  return (
    <Card as="section" className="gx-fx-home" aria-labelledby={id} data-home="awards">
      <div className="gx-fx-home-head">
        <h2 className="gx-t-section" id={id}>{HOME_AWARDS_COPY.title(recap.week)}</h2>
        {recap.mine ? <span className="gx-t-meta gx-c-accent">{HOME_AWARDS_COPY.youWon(recap.mine.name)}</span> : null}
      </div>
      <ChipRail label={HOME_AWARDS_COPY.rail(recap.week)} className="gx-fx-home-rail">
        {recap.rows.map(row => <Chip key={row.id} text selected={row.id === open.id} onClick={() => setChosen(row.id)}>{row.name}</Chip>)}
      </ChipRail>
      <div className="gx-fx-award" data-award={open.id} aria-live="polite">
        <Badge iconPath={open.icon} size={40} rarity={open.you ? 'rare' : 'common'}/>
        <div className="gx-fx-award-text">
          <p className="gx-t-strong">{open.name}</p>
          <p className="gx-fx-who gx-t-body gx-c-2"><AvatarStack people={open.people} max={3} size={24}/><span>{open.who}{' · '}{open.value}</span></p>
        </div>
      </div>
      <Button variant="ghost" iconEnd="chevronRight" onClick={() => shell.go('play', { section: 'features' })}>{HOME_AWARDS_COPY.all}</Button>
    </Card>
  );
}
