import { appCode } from '../../../../shared/nfl-schedule.mjs';
import { recordedFinal } from './boardMarkets.js';

/** Only the selected game's result survives a weekly reply; market/pick fields are never retained. */
export function checkedGameResult(reply, { season, week, game }) {
  const now = typeof reply?.now === 'string' ? Date.parse(reply.now) : NaN;
  if (reply?.season !== season || reply?.week !== week || !Number.isFinite(now) || !Array.isArray(reply.games)) throw new Error('Wrong result reply');
  const row = reply.games.find(row => row?.id === game.id);
  if (!row || appCode(row.awayCode) !== appCode(game.away.code) || appCode(row.homeCode) !== appCode(game.home.code) ||
    typeof row.kickoff !== 'string' || !Number.isFinite(Date.parse(row.kickoff))) throw new Error('Wrong result game');
  return { checkedAt: reply.now, result: recordedFinal({ ...game, kickoff: row.kickoff, started: now >= Date.parse(row.kickoff) }, row, { status: 'ready', now }) };
}
