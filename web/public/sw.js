// Guess The Line web push (D-28). Registered only after a player turns reminders on,
// and unregistered when they turn them off. It handles `push` and `notificationclick`
// only: there is deliberately no fetch handler and no cache, so pages, API data and
// picks never pass through or persist in this worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const text = (value, fallback, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback);

// The commissioner's ops alerts (item 22, cloud/ops-alerts.mjs) are tagged gtl-ops-<key>, the same tag for an alert and
// its recovery, so the recovery replaces it on the lock screen. A notification that replaces another with its tag is
// silent unless it renotifies, so these alone set renotify: a repeat alert after a recovery sounds again.
const OPS_PREFIX = 'gtl-ops-';

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  const tag = text(data.tag, 'gtl-reminder', 64);
  // iOS requires every push to show a notification, so there is always one.
  event.waitUntil(self.registration.showNotification(text(data.title, 'Guess The Line', 60), {
    body: text(data.body, 'Your picks are due soon.', 160),
    tag,
    icon: '/app-icon-192.png',
    badge: '/app-icon-192.png',
    ...(tag.startsWith(OPS_PREFIX) ? { renotify: true } : {}),
  }));
});

// A click opens one of this app's own screens, picked only by the notification's fixed tag prefix: the Points reminder
// (tag gtl-points-<season>-<week>, cloud/push-reminders.mjs) opens Play › Points; an ops alert opens Home (#home, the
// router's Home tab); every other tag, or none, opens Picks.
// The payload cannot choose a URL: nothing reads a url or data field, and a tag can only pick from this fixed list.
const CLICK_TARGETS = [['gtl-points-', '/#play/points'], [OPS_PREFIX, '/#home']];
const DEFAULT_TARGET = '/#picks';
function clickTarget(tag) {
  const match = typeof tag === 'string' ? CLICK_TARGETS.find(([prefix]) => tag.startsWith(prefix)) : null;
  return match ? match[1] : DEFAULT_TARGET;
}

self.addEventListener('notificationclick', event => {
  const target = new URL(clickTarget(event.notification.tag), self.location.origin).href;
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      try { await open.navigate(target); } catch { /* An uncontrolled window still comes to the front. */ }
      return;
    }
    await self.clients.openWindow(target);
  })());
});
