export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const submissionTimeScoring = data => data?.scoringPolicy === 'submission-time' && ['guess_spread', 'guess_total'].includes(data.mode);
export const availableScoringReference = reference => ['available', 'captured'].includes(reference?.status) && finite(reference.value);
export function playerReference(data, game, playerId = data.playerId) {
  return playerId === data.playerId ? game.scoringReference : game.opponents?.find(player => player.id === playerId)?.scoringReference;
}
export function referenceTime(reference) { return reference?.savedAt || reference?.recordedAt; }
// October 12, 2026 ruling: every guess is scored against the line stored when it was saved (any age), or, for a
// guess saved before any line was stored, the first line collected and observed after it. Age is shown, never used to unscore.
export const pendingScoringReference = reference => reference?.status === 'pending';
export const lineLabel = reference => reference?.basis === 'first_line_after_submission' ? 'First line after submission' : 'Line at your guess';
// Whole minutes from the line's earliest sportsbook observation to the guess; negative when observed after it.
export function referenceAgeMinutes(reference) {
  const saved = Date.parse(reference?.savedAt), observed = Date.parse(reference?.observedAt);
  return Number.isFinite(saved) && Number.isFinite(observed) ? Math.round((saved - observed) / 60_000) : null;
}
export function referenceAgeText(reference) {
  const minutes = referenceAgeMinutes(reference);
  if (minutes === null) return null;
  if (minutes === 0) return 'observed when you guessed';
  const size = Math.abs(minutes), span = size < 60 ? `${size} min` : size < 2880 ? `${Math.round(size / 6) / 10} h` : `${Math.round(size / 1440)} days`;
  return minutes > 0 ? `observed ${span} before your guess` : `observed ${span} after your guess`;
}
