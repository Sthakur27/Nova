// Build-time shell cache. Google requests and note data are never intercepted.
export function webServiceWorker(version: string, files: string[]) {
  return `const CACHE = ${JSON.stringify(`nova-web-shell-${version}`)};
const FILES = ${JSON.stringify(files)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
});
// No skipWaiting or clients.claim: an update must not replace a running editor.
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nova-web-shell-') && key !== CACHE).map(key => caches.delete(key)))));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    // Refreshes should load the current deployment; retain the complete installed
    // shell as an offline fallback instead of mixing new HTML with old assets.
    event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
      if (!response.ok) throw new Error('Application unavailable');
      return response;
    }).catch(async error => {
      const cached = await caches.open(CACHE).then(cache => cache.match('/index.html'));
      if (cached) return cached;
      throw error;
    }));
  } else if (FILES.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(url.pathname)).then(cached => cached || fetch(event.request)));
  }
});\n`;
}
