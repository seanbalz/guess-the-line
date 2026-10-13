// D-28 opt-in web push on this device. Nothing here runs until the player asks:
// reading the current state uses getRegistration(), which never registers a
// service worker, and makes no network request unless a subscription already
// exists. Turning reminders on registers /sw.js and subscribes; turning them off
// unsubscribes, deletes the server row and unregisters the worker.
import { cloudApi } from './api';

const SW_URL = '/sw.js';

/**
 * 'supported'     this browser can subscribe now
 * 'denied'        the player blocked notifications for this site
 * 'needs-install' iPhone/iPad Safari tab: push works only from the Home Screen app (iOS 16.4+)
 * 'unsupported'   no PushManager, service worker or Notification API here
 */
export function pushEnvironment(win = globalThis.window) {
  if (!win?.navigator) return 'unsupported';
  const nav = win.navigator;
  const ready = win.isSecureContext && 'serviceWorker' in nav && 'PushManager' in win && 'Notification' in win;
  if (ready) return win.Notification.permission === 'denied' ? 'denied' : 'supported';
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
  const standalone = win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
  return ios && !standalone ? 'needs-install' : 'unsupported';
}

export class PushSetupError extends Error {
  constructor(message) { super(message); this.name = 'PushSetupError'; }
}

function keyBytes(base64url) {
  const clean = String(base64url).replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(clean + '='.repeat((4 - clean.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/** The existing registration's subscription, or null. Never registers a worker. */
export async function currentSubscription(win = globalThis.window) {
  if (pushEnvironment(win) === 'unsupported' || pushEnvironment(win) === 'needs-install') return null;
  const registration = await win.navigator.serviceWorker.getRegistration('/');
  return registration ? registration.pushManager.getSubscription() : null;
}

/** Server state for this device. Only called when a local subscription exists or when the player acts. */
export function pushStatus(endpoint) {
  return cloudApi('push/status', endpoint ? { endpoint } : {});
}

/** Must run inside the click handler: iOS only shows the permission prompt for a user gesture. */
export async function enablePush(win = globalThis.window) {
  const permission = await win.Notification.requestPermission();
  if (permission !== 'granted') throw new PushSetupError(permission === 'denied'
    ? 'Notifications are blocked for this site. Allow them in your browser or iPhone Settings, then try again.'
    : 'Reminders stay off. You can turn them on any time.');
  const status = await pushStatus();
  if (!status.configured || !status.publicKey) throw new PushSetupError('Reminders are not switched on for Guess The Line yet.');
  const registration = await win.navigator.serviceWorker.register(SW_URL, { scope: '/' });
  let subscription;
  try {
    subscription = await registration.pushManager.getSubscription()
      || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(status.publicKey) });
    const { endpoint, keys } = subscription.toJSON();
    return await cloudApi('push/subscribe', { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
  } catch (error) {
    // Leave nothing behind: no orphan subscription and no idle worker.
    await subscription?.unsubscribe().catch(() => {});
    await registration.unregister().catch(() => {});
    throw error;
  }
}

export async function disablePush(win = globalThis.window) {
  const registration = await win.navigator.serviceWorker.getRegistration('/');
  const subscription = registration ? await registration.pushManager.getSubscription() : null;
  const endpoint = subscription?.endpoint;
  if (subscription) await subscription.unsubscribe().catch(() => {});
  try {
    if (endpoint) await cloudApi('push/unsubscribe', { endpoint });
  } finally {
    if (registration) await registration.unregister().catch(() => {});
  }
}
