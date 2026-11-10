// Exact native pure schedule formatter bodies; API/auth imports are excluded.
export const date = (value, options={}) => value ? new Date(value).toLocaleString('en-US',{timeZone:'America/Los_Angeles',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',...options}) : 'Not available';
const pauseLabels = { budget_paused: 'provider cost needs review', budget_guard: 'free quota protected', slate_changed: 'slate needs review', all_games_started: 'slate complete', commissioner_unavailable: 'commissioner access unavailable' };
export function refreshLabel(data) {
  const schedule = data.oddsSchedule;
  if (!schedule) return 'Refresh schedule unavailable';
  if (schedule.operationalStatus === 'blocked') return `12-hour refresh paused · ${pauseLabels[schedule.pauseReason] || 'setup needs review'}`;
  if (!schedule.enabled) return 'Automatic refresh off';
  if (schedule.slateStatus === 'complete') return '12-hour schedule · slate complete';
  if (schedule.slateStatus === 'unavailable') return '12-hour schedule · slate unavailable';
  return '12-hour refresh enabled';
}
export function scheduleDetails(data) {
  const schedule = data.oddsSchedule;
  if (!schedule) return 'No refresh schedule status is available in this view.';
  const status = ({ queued: 'queued', running: 'running', succeeded: 'completed', partial: 'partially completed', failed: 'failed', skipped: 'skipped' })[schedule.lastStatus];
  return `${refreshLabel(data)}. ${status ? `Last automatic run ${status}${schedule.lastRunAt ? ` at ${date(schedule.lastRunAt)} PT` : ''}.` : 'No automatic run is confirmed yet.'} ${schedule.nextRunAt ? `Next planned run: ${date(schedule.nextRunAt)} PT. ` : ''}Only upcoming games can refresh; new weeks need a validated slate. Saved comparison references are not fresh kickoff quotes. The five-minute quote requirement and manual kickoff freeze remain separate.`;
}
