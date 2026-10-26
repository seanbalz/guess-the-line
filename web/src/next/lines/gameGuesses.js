import { fmtNum, fmtSpreadPick } from '../format.js';

const finite = Number.isFinite;
const statuses = new Set(['in', 'late', 'not_yet', 'sat_out']);

/** Only the reader's visible, locked rows may disclose another player's guess. Never infer ranks. */
export function gameGuesses(data, viewer, members, game, market) {
  const result = data?.games?.find(row => row.gameId === game.id);
  if (!result) return null;
  const names = new Map(members.map(member => [member.id.toLowerCase(), member.displayName]));
  const rows = (result.rows ?? []).filter(row => typeof row?.userId === 'string' && statuses.has(row.status)).map(row => {
    const you = row.userId.toLowerCase() === viewer.toLowerCase();
    const locked = row.lockedIn === true && ['in', 'late'].includes(row.status);
    const visible = you || (result.open === true && locked && row.hidden !== true);
    const hasPick = visible && finite(row.pick);
    const scored = hasPick && locked && row.eligible === true && finite(row.error) && row.error >= 0 && finite(row.points);
    const rank = scored && result.started === true && Number.isInteger(row.rank) && row.rank > 0 ? row.rank : null;
    const name = names.get(row.userId.toLowerCase()) || (row.removed ? 'Former member' : 'Community player');
    const status = locked ? row.status === 'late' ? 'Late' : 'Locked in'
      : row.status === 'sat_out' ? 'Sitting out' : you && hasPick ? 'Your draft' : 'Not locked in';
    return { id: row.userId, you, name, removed: row.removed === true, status,
      pick: hasPick ? market === 'spread' ? fmtSpreadPick(game.awayCode, game.homeCode, row.pick) : fmtNum(row.pick) : null,
      hidden: locked && !visible,
      score: scored ? `${fmtNum(row.points)} points · ${fmtNum(row.error)} off` : hasPick && locked ? row.eligible === false ? 'Not scoring' : 'Score pending' : null,
      place: rank === null ? null : rank === 1 && row.closest === true ? row.tied === true ? 'Tied closest' : 'Closest' : `${row.tied === true ? 'Tied ' : ''}#${rank}`,
    };
  });
  const count = status => rows.filter(row => status.includes(row.status)).length;
  return { open: result.open === true, started: result.started === true, rows,
    summary: `${count(['Locked in', 'Late'])} locked in · ${count(['Not locked in', 'Your draft'])} not locked in · ${count(['Sitting out'])} sitting out` };
}
