// The old app's line-lock sentence (redesign stages 20 and 21; D-36 as amended by D-39). The server sends no line for a game's
// Spread or Total market that this player has not locked in (today: submitted), sat out or seen kick off: no book offer or
// consensus on Virtual Units (stage 20), no line on another player's real-slip leg (stage 21, M-04). The sentence follows the
// live rules the reply carries; cloud/line-lock.mjs and the new app's copy.js lineLocked say the same.
export const lockSentence = (market, rules) => {
  const name = market === 'spread' ? 'Spread' : 'Total';
  return rules?.sentFinal === true ? `Lock in your ${name} pick to see this line.` : `Submit your ${name} picks to see this line.`;
};
