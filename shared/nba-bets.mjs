// Private NBA manual-entry contract. Prices are quoted ticket prices, never inferred from legs.
export const NBA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NBA_OUTCOMES = Object.freeze(['pending', 'win', 'loss', 'push', 'void']);
export const NBA_MARKETS = Object.freeze(['moneyline', 'spread', 'total']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const invalid = () => { throw new Error('GTL_NBA_INVALID'); };
const keys = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
const text = (value, max) => { if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(); return value.trim(); };
export function isNbaDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
// Interpret the decimal JSON number, including exponent notation, without binary arithmetic.
function decimalRatio(value) {
  const [digits, exponent = '0'] = String(value).toLowerCase().split('e');
  const [whole, fraction = ''] = digits.split('.');
  const scale = fraction.length - Number(exponent);
  const numerator = BigInt(whole + fraction);
  return scale < 0 ? [numerator * 10n ** BigInt(-scale), 1n] : [numerator, 10n ** BigInt(scale)];
}
function roundRatio(numerator, denominator) {
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator * sign;
  return sign * ((magnitude * 2n + denominator) / (denominator * 2n));
}
function scaledDecimal(value, places) {
  const [numerator, denominator] = decimalRatio(value);
  return roundRatio(numerator * 10n ** BigInt(places), denominator);
}
function fixedUnits(amount) {
  const sign = amount < 0n ? '-' : '';
  const digits = (amount < 0n ? -amount : amount).toString().padStart(9, '0');
  return `${sign}${digits.slice(0, -8)}.${digits.slice(-8)}`;
}
export function probabilityToAmerican(percent) {
  if (!finite(percent) || percent <= 0 || percent >= 100) invalid();
  const [probability, denominator] = decimalRatio(percent);
  const remainder = 100n * denominator - probability;
  const odds = Number(percent > 50 ? roundRatio(-1000000n * probability, remainder)
    : roundRatio(1000000n * remainder, probability)) / 10000;
  if (Math.abs(odds) < 100 || Math.abs(odds) > 1000000) invalid();
  return odds;
}
function netUnits(outcome, stake, odds) {
  if (outcome === 'pending') return null;
  const amount = scaledDecimal(stake, 8);
  if (outcome === 'loss') return fixedUnits(-amount);
  if (outcome !== 'win') return '0.00000000';
  const price = scaledDecimal(Math.abs(odds), 4);
  const numerator = odds > 0 ? amount * price : amount * 1000000n;
  const denominator = odds > 0 ? 1000000n : price;
  return fixedUnits(roundRatio(numerator, denominator));
}
export function normalizeNbaTicket(input) {
  keys(input, ['id', 'season', 'eventDate', 'kind', 'label', 'legs', 'priceInput', 'stakeUnits', 'outcome']);
  if (!NBA_UUID.test(input.id || '') || !/^\d{4}-\d{2}$/.test(input.season || '')
    || Number(input.season.slice(5)) !== (Number(input.season.slice(0, 4)) + 1) % 100 || !isNbaDate(input.eventDate)
    || !['single', 'parlay'].includes(input.kind) || !NBA_OUTCOMES.includes(input.outcome)) invalid();
  if (!finite(input.stakeUnits) || input.stakeUnits <= 0 || input.stakeUnits >= 1000000 || Number(input.stakeUnits.toFixed(8)) !== input.stakeUnits) invalid();
  keys(input.priceInput, ['format', 'value']);
  const { format, value } = input.priceInput;
  if (!finite(value) || !['american', 'probability'].includes(format)) invalid();
  const odds = format === 'probability' ? probabilityToAmerican(value) : value;
  if (Math.abs(odds) < 100 || Math.abs(odds) > 1000000 || Number(odds.toFixed(4)) !== odds) invalid();
  if (!Array.isArray(input.legs) || input.legs.length > 20 || (input.kind === 'single' ? input.legs.length !== 1 : input.legs.length < 2)) invalid();
  const seen = new Set();
  const legs = input.legs.map(leg => {
    keys(leg, ['gameId', 'matchup', 'market', 'team', 'side', 'line']);
    const gameId = text(leg.gameId, 200);
    if (!/^NBA:[\w:.-]+$/.test(gameId) || !NBA_MARKETS.includes(leg.market)) invalid();
    const identity = `${gameId}:${leg.market}`;
    if (seen.has(identity)) invalid(); seen.add(identity);
    const result = { gameId, ...(leg.matchup === undefined ? {} : { matchup: text(leg.matchup, 200) }), market: leg.market };
    if (leg.market === 'total') {
      if (!['over', 'under'].includes(leg.side) || leg.team !== undefined || !finite(leg.line) || leg.line <= 0 || leg.line > 1000) invalid();
      result.side = leg.side; result.line = leg.line;
    } else {
      result.team = text(leg.team, 100);
      if (leg.side !== undefined) invalid();
      if (leg.market === 'spread') {
        if (!finite(leg.line) || Math.abs(leg.line) > 1000) invalid();
        result.line = leg.line;
      } else if (leg.line !== undefined) invalid();
    }
    if (result.line !== undefined && !Number.isInteger(result.line * 2)) invalid();
    return result;
  });
  return { id: input.id.toLowerCase(), season: input.season, eventDate: input.eventDate, kind: input.kind,
    label: text(input.label, 500), legs, odds, stakeUnits: input.stakeUnits, outcome: input.outcome,
    netUnits: netUnits(input.outcome, input.stakeUnits, odds), priceInput: { format, value } };
}
