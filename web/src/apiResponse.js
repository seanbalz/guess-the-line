export class ApiError extends Error {
  constructor(message, status, code = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    // Codes a screen acts on: the submission refusals, M-02's GTL_BALLOT_LOCKED (a locked-in pick is final; reload) and
    // Guess the Points' refusals (GTL_POINTS_OFF: coming soon; LOCKED / CLOSED / NOT_OPEN: reload the week) and the EPL
    // routes' GTL_EPL_* refusals (cloud/epl.mjs: GTL_EPL_OFF hides EPL; CLUB_TAKEN / NOT_YOUR_TURN reload the draft).
    this.code = typeof code === 'string' && (/^GTL_(?:SUBMISSION|EPL)_[A-Z_]+$/.test(code) || ['GTL_BALLOT_LOCKED', 'GTL_GAME_CLOSED', 'GTL_POINTS_OFF', 'GTL_POINTS_LOCKED', 'GTL_POINTS_CLOSED', 'GTL_POINTS_NOT_OPEN'].includes(code)) ? code : null;
  }
}

export class SaveUncertainError extends ApiError {
  constructor(status = 0) {
    super('We could not confirm whether your save completed. Check saved data before trying to save again. Your entered values are still here.', status);
    this.name = 'SaveUncertainError';
    this.uncertain = true;
  }
}

export async function readResponse(response, isGameSave = false) {
  let data;
  try { data = await response.json(); }
  catch {
    if (isGameSave) throw new SaveUncertainError(response.status);
    throw new ApiError('The game service returned an unreadable response. Reload saved data to try again.', response.status);
  }
  // Only the server's explicit pre-commit submission rejection establishes that
  // a 5xx response left the ballot unchanged. A transport/proxy failure does not.
  const submissionCode = typeof data?.code === 'string' && /^GTL_SUBMISSION_[A-Z_]+$/.test(data.code);
  const rejectedBeforeSave = data?.submitted === false && submissionCode;
  if (isGameSave && response.status >= 500 && !rejectedBeforeSave) throw new SaveUncertainError(response.status);
  // A coded submission refusal keeps the server's own sentence even when it mentions a "changed guess";
  // only an uncoded 409 about a changed revision is the other-device conflict.
  if (!response.ok) throw new ApiError(response.status === 409 && isGameSave && !submissionCode && !['GTL_BALLOT_LOCKED', 'GTL_GAME_CLOSED'].includes(data?.code) && /changed|revision/i.test(data?.error || '')
    ? 'Saved data changed in another group or on another device. Refresh the saved data, review your unsaved changes, then save again.'
    : data?.error || 'The game service is unavailable. Reload saved data to try again.', response.status, data?.code);
  if (isGameSave && (!data || typeof data !== 'object' || Array.isArray(data))) throw new SaveUncertainError(response.status);
  return data;
}

export async function requestResponse(request, isGameSave = false) {
  let response;
  try { response = await request(); }
  catch (error) {
    if (isGameSave) throw new SaveUncertainError();
    throw error;
  }
  return readResponse(response, isGameSave);
}
