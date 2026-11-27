self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.url.startsWith(self.location.origin)) event.respondWith(fetch(event.request));
});
