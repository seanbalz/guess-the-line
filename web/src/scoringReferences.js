export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const submissionTimeScoring = data => data?.scoringPolicy === 'submission-time' && ['guess_spread', 'guess_total'].includes(data.mode);
export const availableScoringReference = reference => ['available', 'captured'].includes(reference?.status) && finite(reference.value);
export function playerReference(data, game, playerId = data.playerId) {
  return playerId === data.playerId ? game.scoringReference : game.opponents?.find(player => player.id === playerId)?.scoringReference;
}
export function referenceTime(reference) { return reference?.savedAt || reference?.recordedAt; }
