// Synthetic OCR words shaped like the inspected Sleeper FEPL matchups layout (four stacked cards, two sides each: team
// name, username underneath, a large upper weekly score and a smaller projection under it). Invented names and numbers;
// no screenshot or real score is used anywhere in the repository.
export const FIXTURE_MANAGERS = Object.freeze([
  { ownerId: '719658248843632640', name: 'Evan', sleeperName: 'NLGooner' },
  { ownerId: '473955676301815808', name: 'Sean', sleeperName: 'seanbalz' },
  { ownerId: '702644837370929152', name: 'Steven', sleeperName: 'sthomas111' },
  { ownerId: '1259267898757611520', name: 'Cullen', sleeperName: 'steezyc9' },
  { ownerId: '1395236217460633600', name: 'Darin', sleeperName: 'Freudian' },
  { ownerId: '1257180071064510465', name: 'Mark', sleeperName: 'LFCRed' },
  { ownerId: '865667912365666304', name: 'Nemo', sleeperName: 'nemoheye' },
  { ownerId: '719745569895018496', name: 'Adam', sleeperName: 'aharrison2' },
]);
const word = (text, x, y, w, h) => ({ text, x0: x, y0: y, x1: x + w, y1: y + h, confidence: 90 });

/**
 * cards: [[left, right]] with each side { user, team, score, projection } (strings as displayed). Options add the chrome a
 * real screen has (week header, percentages, records, ranks, balances, chat) so the extractor must ignore it.
 */
export function sleeperWords({ week = 11, cards, top = 420, gap = 300, chrome = true } = {}) {
  const words = [];
  if (week !== null) words.push(word('WEEK', 80, 300, 120, 40), word(String(week), 215, 300, 50, 40));
  if (chrome) words.push(word('Matchups', 80, 240, 200, 44), word('$12.50', 900, 120, 120, 30), word('#2', 40, 150, 40, 30), word('Chat', 500, 2600, 90, 30));
  cards.forEach(([left, right], k) => {
    const y = top + k * gap;
    for (const [s, x, numX] of [[left, 60, 420], [right, 860, 640]]) {
      if (!s) continue;
      if (s.team) words.push(word(s.team, x, y + 30, 200, 36));
      if (s.user) words.push(word(s.user, x, y + 80, 180, 28));
      if (s.score) words.push(word(s.score, numX, y + 40, 150, 64));
      if (s.projection) words.push(word(s.projection, numX + 20, y + 120, 100, 30));
      if (chrome) words.push(word('5-3', x, y + 120, 60, 26), word('62%', x + 80, y + 120, 60, 26));
    }
  });
  return words;
}

/** Four complete cards for the eight fixture managers with distinct invented scores. */
export function fullCards(scores = ['61.20', '48.75', '90.10', '55.05', '72.40', '33.30', '80.00', '66.65']) {
  const side = i => ({ user: FIXTURE_MANAGERS[i].sleeperName, team: `Team ${i + 1}`, score: scores[i], projection: (Number(scores[i]) + 7.5).toFixed(2) });
  return [0, 2, 4, 6].map(i => [side(i), side(i + 1)]);
}
