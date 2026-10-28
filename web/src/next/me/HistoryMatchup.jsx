// A history game as marks (D-62): away, "@", home, read as one sentence. "—" when the game is not in the reply's slate
// (never a raw game id, DP-15). Text-only places (an aria-label) keep historyFormat's matchupWords.
import { Matchup } from '../ui/index.js';
import { DASH } from '../format.js';

export function HistoryMatchup({ game, away = game?.awayCode, home = game?.homeCode }) {
  return away && home ? <Matchup away={away} home={home}/> : DASH;
}
