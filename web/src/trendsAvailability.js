const ageText = a => Number.isFinite(a?.sourceAgeMs) ? (a.sourceAgeMs < 3_600_000 ? Math.floor(a.sourceAgeMs/60_000) + ' min old' : a.sourceAgeMs < 86_400_000 ? Math.floor(a.sourceAgeMs/3_600_000) + ' h old' : Math.floor(a.sourceAgeMs/86_400_000) + ' days old') : '';
export function trendAvailabilitySummary(week) {
  if (!week) return '';
  const a = week.availability;
  const source = a?.sourceAsOf || week.asOf;
  // Calendar-only dates retain their day; precise timestamps stay in Source details.
  const date = source && /^\d{4}-\d{2}-\d{2}$/.test(source) ? source : source && Number.isFinite(Date.parse(source)) ? new Date(source).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short',day: 'numeric',year: 'numeric' }) : 'Source date unavailable';
  return [a?.stale || !a ? 'Stale evidence' : 'Historical evidence ready', date, ageText(a), a?.stale && /unavailable|fallback/i.test(a.reason || '') ? 'Refresh unavailable' : null].filter(Boolean).join(' · ');
}
export function trendAvailabilityText(week) {
  const a = week?.availability;
  if (!a) return week ? 'Dated historical snapshot · source as of ' + (week.asOf || 'unavailable') : '';
  return 'Data: nflverse schedule records. Historical lines are last recorded lines; book is undocumented. Source as of ' + (a.sourceAsOf || 'unavailable') + (ageText(a) ? ' · ' + ageText(a) : '') + (a.reason ? ' · ' + a.reason : '') + (a.evidencePolicy ? ' · ' + a.evidencePolicy : '');
}
