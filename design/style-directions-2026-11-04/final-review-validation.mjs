// Exact native result-review validation helpers, isolated without API/auth or clocks.
export const emptyFields = result => ({ home: result?.home == null ? '' : String(result.home), away: result?.away == null ? '' : String(result.away), source: result?.source || '', sourceURL: result?.sourceURL || '', observedAt: '', reason: '' });

export function sourceURL(value) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !/\s/.test(value) ? url.href : null; } catch { return null; } }
export function validate(fields, game, now) {
  if (!game || !Number.isFinite(Date.parse(game.kickoff)) || now <= Date.parse(game.kickoff)) return 'Final-result review opens after this matchup’s scheduled kickoff. A kickoff time is not evidence that the game is final.';
  if (![fields.home, fields.away].every(value => value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 200)) return 'Enter integer final scores from 0 to 200 for both teams.';
  if (!sourceURL(fields.sourceURL) || fields.sourceURL.length > 2048) return 'Use an HTTPS source URL without a username, password or spaces.';
  if (fields.source.trim().length < 2 || fields.source.length > 120) return 'Name the source of the final score.';
  const observed = Date.parse(fields.observedAt);
  if (!Number.isFinite(observed) || observed <= Date.parse(game.kickoff) || observed > now) return 'The final score observation must be after scheduled kickoff and no later than now.';
  if (fields.reason.trim().length < 5 || fields.reason.length > 500) return 'Describe what you reviewed, or why the prior result needs correcting, in 5 to 500 characters.';
  return null;
}
