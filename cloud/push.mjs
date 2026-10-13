// D-28 opt-in web push: the signed-in player's device subscription routes inside
// gtl-api. Only the endpoint and the browser's public encryption keys are stored,
// in a service-only table; nothing here reads picks, lines or another player.
import { UUID_PATTERN } from './lobby.mjs';
import { validAuth, validP256dh, validPushEndpoint } from './web-push.mjs';

export class PushError extends Error {
  constructor(status, message) { super(message); this.name = 'PushError'; this.status = status; }
}
export const PUSH_METHODS = Object.fromEntries(['status', 'subscribe', 'unsubscribe'].map(action => [`/push/${action}`, ['POST']]));
const ERRORS = {
  GTL_PUSH_INVALID: [400, 'This browser sent a reminder subscription the app cannot use. Turn reminders off and on again.'],
  GTL_PUSH_LIMIT: [409, 'Reminders are on for 10 devices already. Turn them off on a device you no longer use first.'],
  GTL_PUSH_UNCONFIGURED: [503, 'Reminders are not switched on for Guess The Line yet.'],
  GTL_COMMUNITY_MEMBER: [403, 'Open My games and save your display name before turning on reminders.'],
};
export const providerPushError = message => ERRORS[message] ? new PushError(...ERRORS[message]) : new Error('Reminders are temporarily unavailable.');
const invalid = () => { throw providerPushError('GTL_PUSH_INVALID'); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fields = (value, allowed) => { if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) invalid(); };
// A VAPID public key is an uncompressed P-256 point: 65 bytes, 87 unpadded base64url characters.
export const validVapidPublicKey = value => typeof value === 'string' && /^B[A-Za-z0-9_-]{86}$/.test(value);

/** `body` is PushSubscription.toJSON() for subscribe ({ endpoint, expirationTime?, keys: { p256dh, auth } }) or { endpoint } otherwise. */
export async function handlePush({ route, body = {}, user, service, publicKey }) {
  if (!UUID_PATTERN.test(user?.id || '') || user?.is_anonymous === true) throw new PushError(401, 'Sign in to continue.');
  if (!Object.hasOwn(PUSH_METHODS, route)) invalid();
  const configured = validVapidPublicKey(publicKey);
  if (route === '/push/status') {
    fields(body, ['endpoint']);
    if (body.endpoint !== undefined && body.endpoint !== null && !validPushEndpoint(body.endpoint)) invalid();
    if (!service?.rpc) return { configured, publicKey: configured ? publicKey : null, subscribed: false, devices: 0 };
    const status = await service.rpc('gtl_push_status', { p_user: user.id, p_endpoint: body.endpoint ?? null });
    return { configured, publicKey: configured ? publicKey : null, subscribed: status?.subscribed === true, devices: Math.max(0, Number(status?.devices) || 0) };
  }
  if (!service?.rpc) throw providerPushError('GTL_PUSH_UNCONFIGURED');
  if (route === '/push/subscribe') {
    if (!configured) throw providerPushError('GTL_PUSH_UNCONFIGURED');
    fields(body, ['endpoint', 'expirationTime', 'keys']);
    fields(body.keys, ['p256dh', 'auth']);
    if (body.expirationTime !== undefined && body.expirationTime !== null && !Number.isFinite(body.expirationTime)) invalid();
    if (!validPushEndpoint(body.endpoint) || !validP256dh(body.keys.p256dh) || !validAuth(body.keys.auth)) invalid();
    const result = await service.rpc('gtl_push_subscribe', { p_user: user.id, p_endpoint: body.endpoint, p_p256dh: body.keys.p256dh, p_auth: body.keys.auth });
    return { subscribed: true, devices: Math.max(0, Number(result?.devices) || 0) };
  }
  fields(body, ['endpoint']);
  if (!validPushEndpoint(body.endpoint)) invalid();
  const result = await service.rpc('gtl_push_unsubscribe', { p_user: user.id, p_endpoint: body.endpoint });
  return { subscribed: false, removed: result?.removed === true, devices: Math.max(0, Number(result?.devices) || 0) };
}
