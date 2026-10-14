// Guess The Line web push (D-28). Registered only after a player turns reminders on,
// and unregistered when they turn them off. It handles `push` and `notificationclick`
// only: there is deliberately no fetch handler and no cache, so pages, API data and
// picks never pass through or persist in this worker.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const text = (value, fallback, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback);

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  // iOS requires every push to show a notification, so there is always one.
  event.waitUntil(self.registration.showNotification(text(data.title, 'Guess The Line', 60), {
    body: text(data.body, 'Your picks are due soon.', 160),
    tag: text(data.tag, 'gtl-reminder', 64),
    // The icon is the G on its navy square (14.39:1), so it reads on a light or a dark notification card; the badge
    // is the transparent G, which Android reads as a mask (D-44).
    icon: '/app-icon-maskable-192.png',
    badge: '/app-icon-192.png',
  }));
});

// A click always opens this app's own Picks screen; the payload cannot choose a URL.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('/#picks', self.location.origin).href;
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
