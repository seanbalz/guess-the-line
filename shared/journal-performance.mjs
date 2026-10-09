// User-reported journal accounting only. No sportsbook execution, exchange rates or competition scoring.
export const JOURNAL_CURRENCIES = ['USD', 'CAD', 'EUR', 'GBP', 'AUD'];
export const JOURNAL_OUTCOMES = ['pending', 'win', 'loss', 'push', 'void'];
const minor = value => value === null || Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
export function validateJournalMoney(entry) {
  const money = { outcome: entry.outcome ?? 'pending', currency: entry.currency ?? null, stakeMinor: entry.stakeMinor ?? null, returnedMinor: entry.returnedMinor ?? null };
  if (!JOURNAL_OUTCOMES.includes(money.outcome) || !minor(money.stakeMinor) || !minor(money.returnedMinor)
    || (money.stakeMinor !== null && money.stakeMinor <= 0)
    || (money.stakeMinor === null ? money.currency !== null || money.returnedMinor !== null : !JOURNAL_CURRENCIES.includes(money.currency))
    || (money.outcome === 'pending' && money.returnedMinor !== null)
    || (entry.kind === 'research_note' && (money.currency !== null || money.stakeMinor !== null || money.returnedMinor !== null))) throw new Error('Check the reported outcome, currency, stake and actual returned amount.');
  return money;
}
export function decimalToMinor(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter an amount with at most two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(amount) || amount > 1_000_000_000) throw new Error('This amount is too large.');
  return amount;
}
export const minorToDecimal = value => value === null || value === undefined ? '' : `${value < 0 ? '-' : ''}${Math.trunc(Math.abs(value) / 100)}.${String(Math.abs(value) % 100).padStart(2, '0')}`;
export function summarizeJournal(entries) {
  const records = entries.filter(entry => !entry.archived && entry.kind === 'user_reported_placed_bet');
  const outcomes = Object.fromEntries(JOURNAL_OUTCOMES.map(outcome => [outcome, records.filter(entry => entry.outcome === outcome).length]));
  const currencies = [];
  for (const currency of JOURNAL_CURRENCIES) {
    const inCurrency = records.filter(entry => entry.currency === currency && Number.isSafeInteger(entry.stakeMinor));
    if (!inCurrency.length) continue;
    const qualified = inCurrency.filter(entry => ['win', 'loss', 'push'].includes(entry.outcome) && Number.isSafeInteger(entry.returnedMinor));
    const stakeMinor = qualified.reduce((sum, entry) => sum + entry.stakeMinor, 0), returnedMinor = qualified.reduce((sum, entry) => sum + entry.returnedMinor, 0);
    currencies.push({ currency, sampleCount: qualified.length, stakeMinor, returnedMinor, netMinor: qualified.length ? returnedMinor - stakeMinor : null, roiPercent: stakeMinor ? 100 * (returnedMinor - stakeMinor) / stakeMinor : null, pendingStakeMinor: inCurrency.filter(e => e.outcome === 'pending').reduce((sum, e) => sum + e.stakeMinor, 0), excludedCount: inCurrency.length - qualified.length });
  }
  const decidedCount = outcomes.win + outcomes.loss;
  return { recordCount: records.length, outcomes, decidedCount, winRatePercent: decidedCount ? 100 * outcomes.win / decidedCount : null, currencies, provenance: 'User-reported; not independently verified', scope: 'All active records for the selected week', formula: 'ROI = (actual returned - stake) / stake for settled win/loss/push records with both amounts. Voids and incomplete amounts are excluded. No currency conversion.' };
}
