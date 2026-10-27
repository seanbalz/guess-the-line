import { gamesOf, ownEntry, youRows } from '../../../../shared/lines-view.mjs';
import { fmtNum, fmtSpreadPick } from '../format.js';

/** Owner's persisted reference only. A draft never inherits a reference, even after kickoff. */
export function yourPick(personal, community, gameId, market) {
  if (!['spread', 'total'].includes(market) || !Number.isFinite(Date.parse(personal?.now))) return null;
  const game = gamesOf(personal).find(row => row.id === gameId);
  if (!game) return null;
  const entry = ownEntry(personal, gameId, market);
  const row = youRows(personal, community, game).find(item => item.market === market);
  const locked = Number.isFinite(Date.parse(entry?.lockedAt));
  const reference = locked ? personal.ballots?.[`guess_${market}`]?.scoringReferences?.[gameId] : null;
  const available = reference?.status === 'available' && Number.isFinite(reference.value);
  const pending = reference?.status === 'pending';
  const firstAfter = reference?.basis === 'first_line_after_submission';
  return { game, row, lockedAt: locked ? entry.lockedAt : null,
    lineLabel: !locked ? 'No locked-in scoring line' : pending ? 'Line pending' : !available ? 'Scoring line unavailable'
      : firstAfter ? 'First line after submission' : reference.basis === 'commissioner-ruled' ? 'Commissioner-ruled line' : 'Line at your guess',
    line: available ? market === 'spread' ? fmtSpreadPick(game.away, game.home, reference.value) : fmtNum(reference.value) : null,
    source: available && typeof reference.source === 'string' ? reference.source : null,
    observedAt: available && Number.isFinite(Date.parse(reference.observedAt)) ? reference.observedAt : null,
  };
}
