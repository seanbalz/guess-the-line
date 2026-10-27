// The weekly recap as a post card at the top of the League feed (design lane, League pass): the trophy, "Week 4 recap"
// with how many awards are in and the one you won, the first awards as rows (faces first), and the way to every badge
// and award. It reads the features model the League screen already holds (M-25) and draws nothing before the job has
// posted a week, so the feed is unchanged until there is a recap to show.
import { useId } from 'react';
import { useShell } from '../shell/context.js';
import { Badge, Button, Card } from '../ui/index.js';
import { AwardRows } from './AwardRows.jsx';
import { AWARD_ICONS } from './icons.js';
import { plural } from '../format.js';
import './features.css';

export const RECAP_POST_COPY = Object.freeze({
  title: week => `Week ${week} recap`,
  meta: (n, mine) => `${plural(n, 'award')} in${mine ? ` · You won ${mine}` : ''}`,
  all: 'All badges and awards',
});
// The post stays one screen tall: the viewer's own award first, then the rest in their order, four at most.
export const RECAP_POST_ROWS = 4;

export function RecapPost({ model }) {
  const shell = useShell(), id = useId();
  const recap = model?.recap ?? null;
  if (!recap?.rows.length) return null;
  const rows = [...recap.rows.filter(row => row.you), ...recap.rows.filter(row => !row.you)].slice(0, RECAP_POST_ROWS);
  return (
    <Card as="article" variant="flush" className="gx-fx-post" aria-labelledby={id} data-feed="recap">
      <div className="gx-fx-post-head">
        <Badge iconPath={AWARD_ICONS.spread_winner} size={40} rarity="uncommon"/>
        <div>
          <h2 className="gx-t-section" id={id}>{RECAP_POST_COPY.title(recap.week)}</h2>
          <p className="gx-t-meta gx-c-2">{RECAP_POST_COPY.meta(recap.rows.length, recap.mine?.name)}</p>
        </div>
      </div>
      <AwardRows rows={rows} label={`Week ${recap.week} awards`}/>
      <div className="gx-fx-post-foot">
        <Button variant="ghost" iconEnd="chevronRight" onClick={() => shell.go('play', { section: 'features' })}>{RECAP_POST_COPY.all}</Button>
      </div>
    </Card>
  );
}
