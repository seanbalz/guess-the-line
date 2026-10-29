// EPL Guess the Line (2-way draw-no-bet moneyline) rules. Pure functions only: no imports, no clock, no I/O.
// Spec 2026-10-28-epl-fantasy-and-moneyline-design.md section 7; plan 2026-10-28-epl-moneyline.md Task 1.
// American prices sit on a line where -100 and +100 are the same point: +120 -> 20, -110 -> -10. Distance and the
// book median are both measured on that line, so -110 vs +120 is 30 and the median of -110 and +120 is +105.

/** A guessable or storable price: an integer American price with |p| >= 100 (-100 and +100 are both allowed and equal). */
export function validPrice(p) {
  return Number.isInteger(p) && Math.abs(p) >= 100;
}

// M-36 admits references only through this provider bound. Opposite signs have distance |guess|+|real|-200.
export const MAX_DNB_PRICE = 100_000;
export const MAX_GUESS_PRICE = 2_147_483_647 - MAX_DNB_PRICE + 200;
/** New entry must always fit the applied M-32 integer distance for every admitted provider reference. */
export const validGuessPrice = p => validPrice(p) && Math.abs(p) <= MAX_GUESS_PRICE;

/** American price -> line point, -100 and +100 both 0. */
export function toLine(price) {
  return price >= 100 ? price - 100 : price + 100;
}

/** Line point -> American price; 0 reads as +100. */
export function fromLine(x) {
  return x >= 0 ? x + 100 : x - 100;
}

/** Distance between a guessed and a real price on the line. */
export function distance(guess, real) {
  return Math.abs(toLine(guess) - toLine(real));
}

/** Half away from zero, so a book median is symmetric for the two clubs (+2.5 -> 3, -2.5 -> -3). */
const roundHalfAway = v => Math.sign(v) * Math.round(Math.abs(v));

/**
 * Median of the book prices on the line scale, converted back to an integer American price. An even count takes the mean
 * of the middle two (rounded half away from zero). Invalid prices are ignored; null when none remain.
 */
export function median(prices) {
  const lines = (Array.isArray(prices) ? prices : []).filter(validPrice).map(toLine).sort((a, b) => a - b);
  if (lines.length === 0) return null;
  const mid = lines.length >> 1;
  const x = lines.length % 2 ? lines[mid] : roundHalfAway((lines[mid - 1] + lines[mid]) / 2);
  return fromLine(x);
}

/**
 * Leaderboard from one row per guessed match: distance is a number when scored, null when unscored (pending at kickoff with
 * no price). Unscored rows are excluded from the average and counted in `unscored`; `guessed` counts scored matches.
 * Sorted by average ascending (compared exactly, as fractions), then guessed descending, then ownerId. A manager with only
 * unscored rows has average null and sorts below every ranked manager.
 */
export function leaderboard(rows) {
  const byOwner = new Map();
  for (const { ownerId, distance: d } of rows) {
    const o = byOwner.get(ownerId) ?? { ownerId, sum: 0, guessed: 0, unscored: 0 };
    if (typeof d === 'number' && Number.isFinite(d)) {
      o.sum += d;
      o.guessed += 1;
    } else {
      o.unscored += 1;
    }
    byOwner.set(ownerId, o);
  }
  const cmpId = (a, b) => (a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : 0);
  return [...byOwner.values()]
    .sort((a, b) => {
      if (a.guessed === 0 || b.guessed === 0) return (a.guessed === 0) - (b.guessed === 0) || b.guessed - a.guessed || cmpId(a, b);
      return a.sum * b.guessed - b.sum * a.guessed || b.guessed - a.guessed || cmpId(a, b);
    })
    .map(o => ({ ownerId: o.ownerId, average: o.guessed ? o.sum / o.guessed : null, guessed: o.guessed, unscored: o.unscored }));
}
