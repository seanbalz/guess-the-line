/** Geometry only. Saved points always come from the authoritative reader. */
export function pickComparison(guess, line) {
  if (
    ![guess, line].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )
  )
    return null;
  const from = Math.floor(Math.min(guess, line)) - 1,
    to = Math.ceil(Math.max(guess, line)) + 1;
  return {
    from,
    to,
    guessAt: ((guess - from) / (to - from)) * 100,
    lineAt: ((line - from) / (to - from)) * 100,
    difference: Math.abs(guess - line),
  };
}
