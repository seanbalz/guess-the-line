// Pick a Team's draft board (mockups v3, "Play · Pick a Team"): the 8 managers as glass bubble nodes in pick order on
// the hero card (number badge, picked crest, name; the manager on the clock glows lime with a "?"), and the clubs still
// available as a crest grid. Crests are the self-hosted D-46 files (resolveClubCrest) on a light chip in Dark (epl.css).
// No hooks: the board draws what boardModel gives it.
import { resolveClubCrest } from '../../teamLogoRegistry.js';
import { fmtWhen } from '../format.js';
import { cx } from '../ui/cx.js';

/** A club crest on its chip, or the club code where no crest is registered. Decorative unless `alt` is wanted. */
export function Crest({ code, size = 'md', named = false }) {
  const crest = resolveClubCrest(code);
  if (!crest) return <span className={cx('gx-epl-crest', `gx-epl-crest--${size}`, 'gx-epl-crest--code')} aria-hidden={named ? undefined : 'true'}>{code}</span>;
  return <span className={cx('gx-epl-crest', `gx-epl-crest--${size}`)}>
    <img className="gx-epl-crest-img" src={crest.src} alt={named ? crest.alt : ''} width="128" height="128" decoding="async" draggable="false"/>
  </span>;
}

function nodeName(node) {
  if (node.club) return `${node.slot}. ${node.name}, ${node.clubName}`;
  return `${node.slot}. ${node.name}, ${node.onClock ? 'on the clock' : 'to pick'}`;
}

export function DraftBoard({ model }) {
  return <ol className="gx-epl-nodes" aria-label={`MW${model.week} pick order`}>
    {model.nodes.map(node => (
      <li key={node.ownerId} className={cx('gx-epl-node', node.onClock && 'gx-epl-node--now', node.me && 'gx-epl-node--me')}
        data-epl-node={node.slot} aria-current={node.onClock ? 'step' : undefined}>
        <span className="gx-sr-only">{nodeName(node)}</span>
        <span className="gx-epl-ball" aria-hidden="true">
          <span className="gx-epl-slot">{node.slot}</span>
          {node.club ? <Crest code={node.club} size="ball" named/> : node.onClock ? <span className="gx-epl-q">?</span> : null}
        </span>
        <span className="gx-epl-node-name" aria-hidden="true">{node.name}</span>
      </li>
    ))}
  </ol>;
}

const clubLabel = club => `${club.name}, ${club.home ? 'vs' : 'at'} ${club.opponent}, ${fmtWhen(club.kickoff)}`;

/** The clubs nobody has picked. Buttons (one selected, aria-pressed) only while you can pick; a plain list otherwise. */
export function CrestGrid({ model, selected, onSelect, busy = false }) {
  if (!model.available.length) return null;
  const pickable = model.canPick;
  return <ul className="gx-epl-avail">
    {model.available.map(club => (
      <li key={club.code}>
        {pickable ? (
          <button type="button" className={cx('gx-epl-club', selected === club.code && 'gx-epl-club--on')} data-epl-club={club.code}
            aria-pressed={selected === club.code ? 'true' : 'false'} aria-label={clubLabel(club)} disabled={busy}
            onClick={() => onSelect(club.code)}>
            <Crest code={club.code}/>
            <span className="gx-epl-club-code" aria-hidden="true">{club.code}</span>
          </button>
        ) : (
          <span className="gx-epl-club" data-epl-club={club.code}>
            <span className="gx-sr-only">{clubLabel(club)}</span>
            <Crest code={club.code}/>
            <span className="gx-epl-club-code" aria-hidden="true">{club.code}</span>
          </span>
        )}
      </li>
    ))}
  </ul>;
}
