export function validateChallengeQuote(quote, kickoff, now) {
  if (!['spread', 'total'].includes(quote.market) || !(quote.market === 'spread' ? ['home', 'away'] : ['over', 'under']).includes(quote.side)) return 'Choose a valid market and side.';
  if (!Number.isFinite(quote.line) || quote.line * 2 !== Math.round(quote.line * 2) || quote.line < (quote.market === 'total' ? 0 : -100) || quote.line > (quote.market === 'total' ? 200 : 100)) return 'Use a valid half-point line for this market.';
  if (!Number.isInteger(quote.odds) || Math.abs(quote.odds) < 100 || Math.abs(quote.odds) > 10000) return 'American odds must be an integer from −10000 to −100 or +100 to +10000.';
  if (typeof quote.source !== 'string' || quote.source.trim().length < 2 || quote.source.trim().length > 120) return 'Enter the named sportsbook or authorized quote source.';
  const time = Date.parse(quote.quotedAt), start = Date.parse(kickoff);
  if (![time, start, now].every(Number.isFinite)) return 'Use a valid quote timestamp and scheduled kickoff.';
  if (now >= start) return 'Selections are closed after scheduled kickoff.';
  if (time > now || time >= start || now - time > 6 * 3600_000) return 'Use a pre-kickoff quote from the last six hours. Review the updated quote before confirming.';
  return null;
}
