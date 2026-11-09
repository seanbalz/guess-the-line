// Period selection and composition only. D-77 gapRecord remains the grader.
export const weekKey = ({ season, week }) => `${season}:${week}`;
const validWeek = value => Number.isSafeInteger(value?.season) && value.season > 0
  && Number.isSafeInteger(value?.week) && value.week > 0 && value.week <= 25;
const compare = (a, b) => a.season - b.season || a.week - b.week;
export function publishedGapWeeks(slates = []) {
  return [...new Map(slates.filter(validWeek).map(({ season, week }) => [weekKey({ season, week }), { season, week }])).values()].sort(compare);
}
export function periodWeeks(slates, { period, season, week, from, to }) {
  const weeks = publishedGapWeeks(slates);
  if (period === 'week') return validWeek({ season, week }) ? [{ season, week }] : [];
  if (period === 'all') return weeks;
  if (period === 'season') return weeks.filter(w => w.season === weeks.at(-1)?.season);
  if (period !== 'custom') throw new RangeError('Choose a record period.');
  const start = weeks.findIndex(w => weekKey(w) === from), end = weeks.findIndex(w => weekKey(w) === to);
  if (start < 0 || end < 0) throw new RangeError('Choose both ends of the range from the available weeks.');
  if (start > end) throw new RangeError('The range must end on or after its starting week.');
  return weeks.slice(start, end + 1);
}
const matches = (board, scope) => validWeek(board) && weekKey(board) === weekKey(scope) && Array.isArray(board.games);

export function combineGapBoards(boards) {
  const weeks = new Set(), ids = new Set(), games = [];
  for (const board of boards) {
    if (!matches(board, board)) throw new Error('Gap records did not match the requested week.');
    const key = weekKey(board);
    if (weeks.has(key)) throw new Error('Duplicate gap record week.');
    weeks.add(key);
    for (const game of board.games) {
      const id = `${key}:${game.id}`;
      if (ids.has(id)) throw new Error('Duplicate gap record game.');
      ids.add(id);
      games.push({ ...game, id, originalId: game.id, season: board.season, week: board.week });
    }
  }
  games.sort((a, b) => (Date.parse(a.kickoff) || 0) - (Date.parse(b.kickoff) || 0)
    || compare(a, b) || a.id.localeCompare(b.id));
  return { games };
}

/** Bounded read-only fanout; never returns a partial period after a failure. */
export async function loadGapBoards(weeks, { board, read, signal }) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  let cursor = 0;
  const result = new Array(weeks.length);
  try {
    controller.signal.throwIfAborted();
    await Promise.all(Array.from({ length: Math.min(3, weeks.length) }, async () => {
      while (cursor < weeks.length) {
        controller.signal.throwIfAborted();
        const i = cursor++, scope = weeks[i];
        const value = matches(board, scope) ? board : await read(scope, controller.signal);
        controller.signal.throwIfAborted();
        if (!matches(value, scope)) throw new Error('Gap records did not match the requested week.');
        result[i] = value;
      }
    }));
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    controller.abort();
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
