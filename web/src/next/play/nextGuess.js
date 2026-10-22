/** Follow server eligibility; never infer an open market from the device clock. */
export function nextGuess(data) {
  const due = data?.due ?? [];
  const open = due.find(row => !row.satOut && (data?.rules?.perGameScoring ? row.openGames > 0 : !row.submitted && data?.picksDue?.modes?.some(item => item.mode === row.mode)));
  const mode = open?.mode ?? data?.picksDue?.modes?.[0]?.mode ?? 'guess_spread';
  return mode === 'guess_total' ? 'total' : 'spread';
}
