// ── Service Worker ───────────────────────────────────
// This file runs in the background even when the tab is closed

self.addEventListener('install', () => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', () => {
  console.log('Service Worker activated');
});

// ── Handle Incoming Push ─────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'MyMessenger', body: 'New notification' };

  if (event.data) {
    try {
      data = JSON.parse(event.data.text());
    } catch (e) {}
  }

  const options = {
    body: data.body,
    icon: '/icon.png',      // we'll add this later
    badge: '/icon.png',
    tag: data.type,         // 'call' or 'message'
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: self.location.origin }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Handle Notification Click ────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Open or focus the app tab when notification is clicked
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // If app tab is already open, focus it
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open a new tab
        return clients.openWindow(event.notification.data.url);
      })
  );
});