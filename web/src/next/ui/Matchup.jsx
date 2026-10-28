// A matchup drawn as marks (D-62): the away team's mark, "@", the home team's mark, each with its code beside it, and
// each team's record when one is given. Screen readers hear one sentence ("Seattle Seahawks at Denver Broncos"); the
// marks, codes and "@" are decorative. With `onTeam`, each side is a 44px button that opens that team (the team sheet).
//
// `layout="row"` (default) fits a list row or heading; `layout="stack"` puts each record under its mark and code, for
// the one game card at the top of a pick screen. Places that only take text (a select option, a sheet's back label)
// keep fmtMatchup's "SEA @ DEN".
import { TEAM_NAMES } from '../../../../shared/nfl-schedule.mjs';
import { TeamMark, teamCode } from './TeamMark.jsx';
import { cx, oneOf } from './cx.js';
import './matchup.css';

export const MATCHUP_SIZES = Object.freeze([24, 32, 48]);
export const MATCHUP_LAYOUTS = Object.freeze(['row', 'stack']);

/** "Seattle Seahawks" for a code, or the code itself ("—" for anything that is not a team code). */
export const teamName = code => { const label = teamCode(code); return TEAM_NAMES[label] ?? label; };

/** "4–2" (or "4–2–1" with a tie) from `{ w, l, t }`; null when any count is missing. */
export function teamRecordText(record) {
  const counts = [record?.w, record?.l, record?.t ?? 0];
  if (!counts.every(n => Number.isSafeInteger(n) && n >= 0)) return null;
  return counts[2] ? counts.join('–') : `${counts[0]}–${counts[1]}`;
}

/** The sentence a screen reader hears: "Seattle Seahawks, 4–2, at Denver Broncos, 3–3". */
export function matchupWords(away, home, records) {
  const side = (code, rec) => (rec ? `${teamName(code)}, ${rec}` : teamName(code));
  return `${side(away, records?.away)}${records?.away ? ',' : ''} at ${side(home, records?.home)}`;
}

function Side({ code, record, size, showCode, onTeam }) {
  const label = teamCode(code);
  const body = <>
    <TeamMark code={label} size={size} decorative/>
    {showCode || record ? <span className="gx-mu-words" aria-hidden="true">
      {showCode ? <span className="gx-mu-code">{label}</span> : null}
      {record ? <span className="gx-mu-rec">{record}</span> : null}
    </span> : null}
  </>;
  if (!onTeam || label === '—') return <span className="gx-mu-side">{body}</span>;
  return <button type="button" className="gx-mu-side gx-mu-btn" onClick={() => onTeam(label)}
    aria-label={`${teamName(label)}${record ? `, ${record}` : ''}. Open team`}>{body}</button>;
}

/**
 * `<Matchup away="SEA" home="DEN"/>`; `<Matchup away="SEA" home="DEN" size={48} layout="stack"
 * records={{ away: '4–2', home: '3–3' }} onTeam={code => openTeam(code)}/>`. `codes={false}` draws the marks alone.
 */
export function Matchup({ away, home, size = 24, layout = 'row', codes = true, records = null, onTeam = null, className, ...rest }) {
  const px = oneOf(size, MATCHUP_SIZES, 24), shape = oneOf(layout, MATCHUP_LAYOUTS, 'row');
  const words = matchupWords(teamCode(away), teamCode(home), records);
  return <span className={cx('gx-mu', `gx-mu--${px}`, `gx-mu--${shape}`, className)} {...rest}>
    {/* With buttons, each button names its own team; otherwise one sentence names the matchup. */}
    {onTeam ? null : <span className="gx-sr-only">{words}</span>}
    <span className="gx-mu-row" aria-hidden={onTeam ? undefined : 'true'}>
      <Side code={away} record={records?.away ?? null} size={px} showCode={codes} onTeam={onTeam}/>
      <span className="gx-mu-at" aria-hidden="true">@</span>
      <Side code={home} record={records?.home ?? null} size={px} showCode={codes} onTeam={onTeam}/>
    </span>
  </span>;
}
