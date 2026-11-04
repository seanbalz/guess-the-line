// The board's order and recorded finals as they were when a row opened the game layer (gameOrder.js openedBoardOrder and
// openedBoardResult read them back, scoped to the account and week), kept in memory only: the address names the game,
// never the order, so a reload or a shared link falls back to the week's own order.
let remembered = null;

export function rememberBoard(context) { remembered = context !== null && typeof context === 'object' ? context : null; }
export const rememberedBoard = () => remembered;
