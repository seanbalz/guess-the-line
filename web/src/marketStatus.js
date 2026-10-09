import { date } from './api';

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
export function sourceAge(value, now) {
  const timestamp = Date.parse(value), current = Date.parse(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(current) || timestamp > current) return 'Time unavailable';
  const minutes = Math.floor((current - timestamp) / 60000);
  return minutes < 1 ? 'Less than a minute ago' : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}
export function refreshWarning(data) {
  const schedule = data.oddsSchedule;
  if (!schedule) return '';
  if (schedule.operationalStatus === 'blocked') return refreshLabel(data);
  if (schedule.lastStatus === 'failed') return 'Last automatic update failed · showing saved references';
  const now = Date.parse(data.now), last = Date.parse(schedule.lastRunAt), next = Date.parse(schedule.nextRunAt);
  if (schedule.enabled && (Number.isFinite(last) && now - last > 13 * 3600000 || Number.isFinite(next) && now - next > 3600000)) return 'Automatic update overdue · showing saved references';
  return '';
}
export function scheduleDetails(data) {
  const schedule = data.oddsSchedule;
  if (!schedule) return 'No refresh schedule status is available in this view.';
  const status = ({ queued: 'queued', running: 'running', succeeded: 'completed', partial: 'partially completed', failed: 'failed', skipped: 'skipped' })[schedule.lastStatus];
  return `${refreshLabel(data)}. ${status ? `Last automatic run ${status}${schedule.lastRunAt ? ` at ${date(schedule.lastRunAt)} PT` : ''}.` : 'No automatic run is confirmed yet.'} ${schedule.nextRunAt ? `Next planned run: ${date(schedule.nextRunAt)} PT. ` : ''}Only upcoming games can refresh; new weeks need a validated slate. Saved comparison references are not fresh kickoff quotes. The five-minute quote requirement and manual kickoff freeze remain separate.`;
}
