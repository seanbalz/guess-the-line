// Bets › Everyone (M-10, redesign stage 40; D-36): everyone's Virtual Units picks for the published week, read from
// POST /bets/read. Pure: it turns that reply into what the screen draws and decides nothing the server has not.
// - A friend's pick always shows its side and units (D-36: bets are visible at any time).
// - Its line, price, book, result and times show only when the server marks that game's market open for this viewer
//   (`markets[game][market].visible`: the viewer's lock-in, sit-out or that game's kickoff). A closed market draws a
//   lock and a sentence even if a reply ever carried terms, so a line can only reach the screen through that gate.
// - Your own picks always show in full, and come first in each game.
import { DASH, PICKEM, fmtAmt, fmtNum, fmtOdds, fmtSigned, fmtU } from '../format.js';

const MARKETS = ['spread', 'total'];
const MARKET_NAME = Object.freeze({ spread: 'Spread', total: 'Total' });
// Rule 7: every result has a word. Pending shows no pill.
const RESULT = Object.freeze({ win: { label: 'Win', tone: 'win' }, loss: { label: 'Lost', tone: 'loss' }, push: { label: 'Push', tone: 'pending' }, void: { label: 'Void', tone: 'neutral' } });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

export const EVERYONE_COPY = Object.freeze({
  locked: market => `Lock in your ${MARKET_NAME[market]} guess for this game, or wait for kickoff, to see the line.`,
  banner: 'Friends’ lines and prices show after you lock in that game’s guess, or at kickoff.',
  empty: 'No one has a Virtual Units pick this week yet.',
  unpublished: 'This week’s games are not published yet.',
});

/** "DEN" or "Over": the side alone, which every viewer may see. */
export function sideText(game, market, side) {
  if (market === 'total') return side === 'over' ? 'Over' : side === 'under' ? 'Under' : DASH;
  return side === 'home' ? game.homeCode || DASH : side === 'away' ? game.awayCode || DASH : DASH;
}

/** "DEN −3", "SEA Pick'em", "Over 44.5": the side with its saved line (an open market or your own pick only). */
export function pickText(game, market, selection) {
  const side = sideText(game, market, selection?.side);
  if (!finite(selection?.line)) return side;
  if (market === 'total') return `${side} ${fmtNum(selection.line)}`;
  return selection.line === 0 ? `${side} ${PICKEM}` : `${side} ${fmtSigned(selection.line)}`;
}

/**
 * The screen's model: `{ published, season, week, games, qualification, closed, empty }`.
 * `games`: by kickoff, each `{ id, awayCode, homeCode, kickoff, faces, picks }`; a pick is
 * `{ key, userId, name, you, market, marketName, side, units, open, terms, result, locked }`.
 * `closed` lists the markets where a friend's pick is still behind the viewer's gate (one banner for the screen).
 */
export function everyoneBoard(data, viewer) {
  const reply = record(data) ? data : {};
  const roster = (Array.isArray(reply.roster) ? reply.roster : []).filter(row => typeof row?.userId === 'string');
  const display = id => roster.find(row => row.userId === id)?.displayName || (id === viewer ? 'You' : 'Player');
  const name = id => id === viewer ? 'You' : display(id);
  // `name` is what the row says ("You" for the viewer); `display` gives the face its initials.
  const people = id => ({ id, name: name(id), display: display(id), you: id === viewer });
  const games = (Array.isArray(reply.games) ? reply.games : []).filter(game => typeof game?.id === 'string')
    .slice().sort((a, b) => (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0) || a.id.localeCompare(b.id));
  const closed = new Set();
  const board = games.map(game => {
    const picks = (Array.isArray(reply.bets) ? reply.bets : [])
      .filter(bet => bet?.gameId === game.id && MARKETS.includes(bet?.market) && typeof bet?.userId === 'string')
      .map(bet => {
        const you = bet.userId === viewer;
        const open = you || reply.markets?.[game.id]?.[bet.market]?.visible === true;
        if (!open) closed.add(bet.market);
        const selection = record(bet.selection) ? bet.selection : {};
        const result = open && record(bet.result) ? bet.result : null;
        const outcome = open ? RESULT[bet.status] ?? null : null;
        return {
          key: `${bet.userId}:${bet.market}`, userId: bet.userId, name: name(bet.userId), display: display(bet.userId), you, market: bet.market, marketName: MARKET_NAME[bet.market],
          side: sideText(game, bet.market, selection.side), units: fmtU(selection.units), open,
          terms: open ? { pick: pickText(game, bet.market, selection), odds: fmtOdds(selection.odds), book: typeof selection.source === 'string' && selection.source ? selection.source : DASH } : null,
          result: outcome ? { ...outcome, net: finite(result?.netUnits) ? fmtAmt(result.netUnits) : null } : null,
          locked: open ? null : EVERYONE_COPY.locked(bet.market),
        };
      })
      .sort((a, b) => Number(b.you) - Number(a.you) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || MARKETS.indexOf(a.market) - MARKETS.indexOf(b.market));
    const faces = [...new Set([...(Array.isArray(reply.faces?.[game.id]) ? reply.faces[game.id] : []), ...picks.map(pick => pick.userId)])].map(people)
      .sort((a, b) => Number(b.you) - Number(a.you) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
    return { id: game.id, awayCode: game.awayCode, homeCode: game.homeCode, kickoff: game.kickoff ?? null, faces, picks };
  });
  const qualification = (Array.isArray(reply.qualification) ? reply.qualification : [])
    .filter(row => typeof row?.userId === 'string' && (row.picks > 0 || row.userId === viewer))
    .map(row => ({ ...people(row.userId), picks: Number.isInteger(row.picks) ? row.picks : 0, units: fmtU(finite(row.units) && row.units > 0 ? row.units : null), qualified: row.qualified === true }))
    .sort((a, b) => Number(b.you) - Number(a.you) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }));
  const withPicks = board.filter(game => game.picks.length);
  return {
    published: reply.published === true, season: Number.isInteger(reply.season) ? reply.season : null, week: Number.isInteger(reply.week) ? reply.week : null,
    games: withPicks, qualification, closed: MARKETS.filter(market => closed.has(market)), empty: reply.published === true && !withPicks.length,
  };
}
