// One week's awards as rows (redesign stage 71): each award's icon and name, then the winners' faces with their names and
// the value. Play › Badges and awards and the League's recap post both draw it, so it holds no data of its own.
import { Avatar, Badge, List, Row } from '../ui/index.js';

export function AwardRows({ rows, label }) {
  return (
    <List label={label}>
      {rows.map(row => (
        <Row key={row.id} you={row.you} size={64} start={<Badge iconPath={row.icon} size={40} rarity={row.you ? 'rare' : 'common'}/>} title={row.name}
          sub={<span className="gx-fx-who">{row.people.slice(0, 3).map(p => <Avatar key={p.id} id={p.id} name={p.name} size={24} you={p.you}/>)}<span>{row.who}{' · '}{row.value}</span></span>}/>
      ))}
    </List>
  );
}
