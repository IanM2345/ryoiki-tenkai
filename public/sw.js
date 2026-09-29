// yourworld service worker.
// Deliberately small: it makes the site installable, shows a friendly screen when
// there's no connection, and handles taps on birthday notifications.
// It never caches her data; every page and query still comes fresh from the network.
// Version: yw-sw-1 (bump this comment to force phones to pick up a new worker).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
background:#0d0a0f;color:#f5e6d0;font-family:'Comic Neue','Comic Sans MS',cursive;text-align:center;padding:24px}
h1{color:#ff8c00;font-size:1.6rem;margin:0 0 8px}p{opacity:.75;margin:0 0 20px}
button{background:#ff8c00;color:#120a02;border:0;border-radius:999px;padding:12px 22px;font:inherit;font-weight:700}</style>
</head><body><div><h1>You're offline</h1><p>yourworld needs a connection to load your things.<br>It'll be right here when you're back.</p>
<button onclick="location.reload()">Try again</button></div></body></html>`;

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') return;   // only page loads
  event.respondWith(
    fetch(req).catch(() => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => 'focus' in c);
    if (open) { await open.focus(); return open.navigate?.('/dashboard'); }
    return self.clients.openWindow('/dashboard');
  })());
});
