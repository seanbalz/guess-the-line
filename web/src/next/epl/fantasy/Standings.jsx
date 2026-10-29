// Research › Fantasy › Standings: every manager as a bar of season points plus the Pick a Team bonus (spec 6.5), ranked,
// with W–L (a missing name, record or total is an em dash, never empty or 0); your bar is lime and your row aria-current. Tapping a row opens the split: Sleeper's raw total and the bonus.
import { useId } from 'react';
import { Card } from '../../ui/index.js';
import { DASH, FANTASY_COPY, fmtPts } from './fantasyModel.js';

const finite = x => typeof x === 'number' && Number.isFinite(x);

export function StandingsPanel({ view }) {
  const id = useId();
  const rows = view.standings ?? [];
  const widest = Math.max(1, ...rows.map(r => r.total).filter(finite));
  return <Card as="section" aria-labelledby={id}>
    <h2 className="gx-t-micro gx-c-2" id={id}>{FANTASY_COPY.standings}</h2>
    <ol className="gx-epl-fx-standings">
      {rows.map((r, i) => {
        const me = r.ownerId === view.viewer;
        return <li key={r.ownerId} className={me ? 'gx-epl-fx-stand gx-epl-fx-stand--me' : 'gx-epl-fx-stand'} data-owner={r.ownerId} aria-current={me ? 'true' : undefined}>
          <details className="gx-epl-fx-split">
            <summary className="gx-epl-fx-stand-head">
              <span className="gx-epl-fx-rank">{i + 1}</span>
              <span className="gx-epl-fx-stand-name">{r.name || DASH}</span>
              <span className="gx-epl-fx-record">{finite(r.wins) && finite(r.losses) ? `${r.wins}–${r.losses}` : DASH}</span>
              <span className="gx-epl-fx-num">{fmtPts(r.total)}</span>
              <span className="gx-tc-bar gx-epl-fx-stand-bar" aria-hidden="true"><span className="gx-tc-bar-fill" style={{ width: `${finite(r.total) ? Math.round((Math.max(0, r.total) / widest) * 100) : 0}%` }}></span></span>
            </summary>
            <p className="gx-t-meta gx-c-2 gx-epl-fx-split-body">{FANTASY_COPY.split(fmtPts(r.sleeperTotal), fmtPts(r.bonus))}</p>
          </details>
        </li>;
      })}
    </ol>
    <p className="gx-t-meta gx-c-2">{FANTASY_COPY.standingsNote}</p>
  </Card>;
}
