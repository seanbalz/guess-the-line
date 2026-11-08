import { GAP_WIN_UNITS } from "../../../../shared/recommended-bets.mjs";
/** Presentation of the already graded, permitted record. No guess scoring or source substitution. */
export function gapRecordView(record, board, tier = "all") {
  const rows = record.graded
    .filter((row) => tier !== "large" || row.favorable)
    .map((row) => ({
      ...row,
      key: `${row.gameId}:${row.market}`,
      game: board.games.find((game) => game.id === row.gameId),
    }));
  let units = 0;
  const points = rows.map(
    (row) =>
      (units +=
        row.outcome === "win"
          ? GAP_WIN_UNITS
          : row.outcome === "loss"
            ? -1
            : 0),
  );
  return {
    rows,
    points,
    summary: tier === "large" ? record.favorable : record,
  };
}
