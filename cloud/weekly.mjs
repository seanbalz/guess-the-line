export class WeeklyError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const ERRORS = {
  GTL_FORBIDDEN: [403, 'Your account has not been added to this league.'],
  GTL_SLATE_CONFLICT: [409, 'This game has a different weekly schedule. Its entries need review before you can continue.'],
  GTL_WEEKLY_CONFLICT: [409, 'Your weekly entries changed on another device or in another group. Refresh before saving again.'],
  GTL_BALLOT_LOCKED: [400, 'This ballot is submitted and permanently locked. Competition guesses cannot be changed.'],
  GTL_PREDICTION_CLOSED: [400, 'The prediction deadline has passed. Commissioner adjudication is required.'],
  GTL_BALLOT_INVALID: [400, 'Invalid ballot.'],
  GTL_BALLOT_INCOMPLETE: [400, 'Complete all predictions before submitting.'],
  GTL_SELECTION_INVALID: [400, 'Invalid selection.'],
  GTL_SELECTION_LOCKED: [400, 'One selection per game. The recorded quote is immutable.'],
  GTL_MATCHING_BALLOT_REQUIRED: [400, 'Submit the matching prediction ballot before viewing or selecting this market.'],
  GTL_SELECTION_CLOSED: [400, 'Selections are closed after scheduled kickoff.'],
  GTL_QUOTE_STALE: [400, 'Use a pre-kickoff quote from the last six hours.'],
  GTL_QUOTE_REVIEW_REQUIRED: [409, 'The recorded quote changed or expired. Review the latest named-book quote before confirming.'],
};
export const providerWeeklyError = message => ERRORS[message]
  ? new WeeklyError(...ERRORS[message]) : new Error('Weekly storage request failed.');

export function weeklyView(view, saved) {
  const eligibility = saved.eligibility || {};
  const result = { ...view, localOnly: false, revision: saved.revision, weeklyRevision: saved.revision,
    selectionOriginPractice: saved.selectionPractice === true, predictionRevision: saved.revision, leagueRevision: saved.leagueRevision, ballotScope: 'weekly', selectionScope: 'weekly' };
  if (!view.statuses) return { ...result, originPractice: saved.originPractice || {}, selectionPractice: saved.selectionPractice === true, eligibilityRulings: saved.ownEligibilityRulings || {} };
  result.statuses = Object.fromEntries(Object.entries(view.statuses).map(([mode, status]) => [mode, {
    ...status, originPractice: saved.originPractice?.[mode] === true,
    eligibilityRuling: saved.eligibilityRulings?.[view.playerId]?.[mode] || null,
    officialEligible: !view.league.practice && (eligibility[view.playerId]?.[mode] ?? saved.originPractice?.[mode] !== true),
  }]));
  const practiceHistory = view.mode === 'betting_challenge' ? saved.selectionPractice === true : saved.originPractice?.[view.mode] === true;
  result.eligibilityRuling = saved.eligibilityRulings?.[view.playerId]?.[view.mode] || null;
  result.officialEligible = !view.league.practice && (view.mode === 'betting_challenge' ? !practiceHistory : (eligibility[view.playerId]?.[view.mode] ?? !practiceHistory));
  if (practiceHistory && !result.officialEligible) result.officialStatus = 'Weekly entries carry practice history — no official scores';
  if (result.officialEligible && result.eligibilityRuling?.eligible) result.officialStatus = 'Week counts by commissioner ruling — verified scoring benchmark pending';
  result.standings = view.standings.map(player => ({ ...player,
    officialEligible: !view.league.practice && (view.mode === 'betting_challenge' ? saved.selectionEligibility?.[player.id] !== false : eligibility[player.id]?.[view.mode] !== false),
  }));
  return result;
}
