// Pure planning functions only: no subscriptions, scheduler, sender or network I/O.
// Persisted opt-in and channel choice must be supplied by an authenticated caller.
export const EVENTS = Object.freeze(['slate_ready', 'incomplete_two_hours', 'commissioner_kickoff', 'movement']);
export const CHANNELS = Object.freeze(['in_app', 'push', 'email', 'sms']);
export function normalizePreferences(input = {}) {
  let timezone = input.timezone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(); if (!timezone) throw new Error(); } catch { timezone = null; }
  const channels = Object.fromEntries(CHANNELS.map(key => [key, input.channels?.[key] === true]));
  const events = Object.fromEntries(EVENTS.map(key => [key, input.events?.[key] === true]));
  const validTime = value => typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const quietHours = input.quietHours?.enabled === true && validTime(input.quietHours.start) && validTime(input.quietHours.end) && timezone
    ? { enabled: true, start: input.quietHours.start, end: input.quietHours.end } : { enabled: false };
  return { channels, events, timezone, quietHours };
}
export function quietAt(preferences, now) {
  const value = normalizePreferences(preferences);
  if (!value.quietHours.enabled) return false;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: value.timezone, hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(new Date(now)).map(part => [part.type, part.value]));
  const local = `${parts.hour}:${parts.minute}`, { start, end } = value.quietHours;
  return start === end || (start < end ? local >= start && local < end : local >= start || local < end);
}
export function planReminder({ kind, season, week, leagueId, scheduledKickoff, actualKickoff, slateId }) {
  if (!EVENTS.includes(kind) || kind === 'movement' || !Number.isInteger(season) || !Number.isInteger(week) || typeof leagueId !== 'string') return null;
  if (kind === 'slate_ready') return typeof slateId === 'string' && slateId ? { kind, key:`${season}:${week}:${leagueId}:slate:${slateId}`, dueAt:null } : null;
  const time = Date.parse(kind === 'commissioner_kickoff' ? actualKickoff : scheduledKickoff);
  if (!Number.isFinite(time)) return null;
  const dueAt = new Date(time - (kind === 'incomplete_two_hours' ? 2*3600_000 : 0)).toISOString();
  return { kind, key:`${season}:${week}:${leagueId}:${kind}:${new Date(time).toISOString()}`, dueAt, ...(kind === 'incomplete_two_hours' ? { scheduledKickoff:new Date(time).toISOString(), expiresAt:new Date(time).toISOString() } : {}) };
}
export function movementEvents({ baseline, observation, previous, scope }) {
  // Baseline selection and cooldown remain product decisions. Never pick one here.
  if (!scope || baseline?.verified !== true || observation?.verified !== true || !baseline.id || !observation.id || baseline.market !== observation.market || baseline.gameId !== observation.gameId || ![baseline.value, observation.value].every(Number.isFinite) || ![baseline.observedAt, observation.observedAt].every(value => Number.isFinite(Date.parse(value))) || Date.parse(observation.observedAt) <= Date.parse(baseline.observedAt)) return [];
  const movement = Math.abs(observation.value - baseline.value), prior = previous?.baselineId === baseline.id && Number.isFinite(previous.movement) ? previous.movement : 0;
  return [1.5,3].filter(threshold => prior < threshold && movement >= threshold).map(threshold => ({ kind:'movement', key:`${scope}:${baseline.id}:${threshold}`, threshold, market:observation.market, gameId:observation.gameId, baselineId:baseline.id, observationId:observation.id, original:baseline.value, current:observation.value, observedAt:observation.observedAt }));
}
export function deliveryDecision({ event, channel, preferences, recipient, now, deliveredKeys = [] }) {
  const pref = normalizePreferences(preferences);
  if (!EVENTS.includes(event?.kind) || !CHANNELS.includes(channel) || !event?.key || !recipient?.id || !Number.isFinite(now) || event.dueAt && !Number.isFinite(Date.parse(event.dueAt))) return { allowed:false, reason:'invalid_event' };
  if (recipient?.active !== true) return { allowed:false, reason:'access_revoked' };
  if (!pref.channels[channel] || !pref.events[event.kind]) return { allowed:false, reason:'not_opted_in' };
  if (event.expiresAt && (!Number.isFinite(Date.parse(event.expiresAt)) || now >= Date.parse(event.expiresAt))) return { allowed:false, reason:'expired' };
  if (event.kind === 'incomplete_two_hours' && recipient.scheduledKickoff !== event.scheduledKickoff) return { allowed:false, reason:'schedule_changed' };
  if (event.kind === 'incomplete_two_hours' && recipient.ballotComplete) return { allowed:false, reason:'already_complete' };
  if (event.kind === 'commissioner_kickoff' && recipient.role !== 'commissioner') return { allowed:false, reason:'not_commissioner' };
  if (event.kind === 'movement' && recipient.revealedMarkets?.[event.market] !== true) return { allowed:false, reason:'market_hidden' };
  const deliveryKey = `${event.key}:${recipient.id}:${channel}`;
  if (deliveredKeys.includes(deliveryKey)) return { allowed:false, reason:'duplicate' };
  if (event.dueAt && Date.parse(event.dueAt) > now) return { allowed:false, reason:'not_due' };
  if (quietAt(pref, now)) return { allowed:false, reason:'quiet_hours' };
  // Lock-screen text is always generic; private values require authenticated reveal.
  const text = { slate_ready:'Your new prediction slate is ready.', incomplete_two_hours:'Your ballot is incomplete. Scheduled kickoff is approaching.', commissioner_kickoff:'Kickoff was confirmed. Open your game for the submission summary.', movement:'A recorded market movement is available. Open your game to review it.' }[event.kind];
  return { allowed:true, deliveryKey, preview:{ title:'Guess The Line', text } };
}
