/* Explicit public chapter downloads only. No account, API or private Studio caching. */
const PREFIX = 'artismaga-reader-v1:';
const COMPLETE = '/__artismaga_reader_complete';
let messages = Promise.resolve();
let notificationPoll;
let lastNotificationPoll = 0;
async function pollNotifications() {
  if (notificationPoll) return notificationPoll;
  if (Date.now() - lastNotificationPoll < 55000) return;
  lastNotificationPoll = Date.now();
  notificationPoll = (async () => {
    try {
      const response = await fetch('/api/notifications', { credentials: 'same-origin', cache: 'no-store' });
      // Never cache or broadcast private inbox contents between account sessions.
      if (response.ok || response.status === 401) {
        const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const page of pages) page.postMessage({ type: 'notifications-updated' });
      }
    } catch { /* Offline: retry on the next active-page tick. */ }
    finally { notificationPoll = undefined; }
  })();
  return notificationPoll;
}
self.addEventListener('periodicsync', event => {
  if (event.tag === 'artismaga-notifications') event.waitUntil(pollNotifications());
});
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.action === 'notifications-poll') { event.waitUntil(pollNotifications()); return; }
  const reply = event.ports[0];
  messages = messages.then(async () => {
    let staging;
    try {
      const { action, path, images = [] } = event.data ?? {};
      if (!/^\/read\/work_[a-zA-Z0-9-]+\/node_[a-zA-Z0-9-]+$/.test(path)) throw Error('Invalid chapter');
      const base = PREFIX + path + '#';
      const existing = (await caches.keys()).filter(key => key.startsWith(base));
      if (action === 'clear') { for(const name of existing) await caches.delete(name); reply?.postMessage({ ok: true }); return; }
      if (action === 'status') { let downloaded=false; for(const name of existing) if(await (await caches.open(name)).match(COMPLETE)) downloaded=true; reply?.postMessage({ ok: true, downloaded }); return; }
      if (action !== 'download' || !Array.isArray(images) || images.length > 7) throw Error('Invalid download');
      const names = (await caches.keys()).filter(key => key.startsWith(PREFIX));
      if (names.length >= 50 && existing.length === 0) throw Error('Download limit reached');
      const urls = [path, '/assets/theme.css', '/assets/client.js', ...images.filter(url => typeof url === 'string' && (/^\/assets\/reactions\/[a-f0-9-]+\.png$/.test(url) || /^\/media\/asset_[a-f0-9-]+$/.test(url)))];
      const responses = await Promise.all(urls.map(async url => {
        const response = await fetch(url, { credentials: 'omit', cache: 'reload' });
        if (!response.ok || response.redirected) throw Error('Download failed');
        return response;
      }));
      // Fetch everything before replacing a usable existing download.
      staging = base + crypto.randomUUID();
      const cache = await caches.open(staging);
      for (let i = 0; i < urls.length; i++) await cache.put(urls[i], responses[i]);
      await cache.put(COMPLETE, new Response('complete'));
      for (const name of existing) await caches.delete(name);
      staging = undefined;
      reply?.postMessage({ ok: true, downloaded: true });
    } catch { if (staging) await caches.delete(staging); reply?.postMessage({ ok: false }); }
  });
  event.waitUntil(messages);
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  if (!url.pathname.startsWith('/read/') && !['/assets/theme.css', '/assets/client.js'].includes(url.pathname) && !url.pathname.startsWith('/assets/reactions/') && !url.pathname.startsWith('/media/asset_')) return;
  event.respondWith((async () => {
    try { return await fetch(event.request); }
    catch {
      for (const name of (await caches.keys()).filter(key => key.startsWith(PREFIX))) {
        const cache = await caches.open(name);
        if (!await cache.match(COMPLETE)) continue;
        const response = await cache.match(event.request);
        if (response) return response;
      }
      return Response.error();
    }
  })());
});
