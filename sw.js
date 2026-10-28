// 오프라인에서도 앱이 열리도록, 한 번 받은 앱 파일과 글꼴을 저장해 둔다.
// 앱 파일은 늘 새 버전을 먼저 확인하고(no-cache), 안 되면 저장본을 쓴다. 구글 API는 저장하지 않는다.
const VERSION = 'td-v2';
const FONTS = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net\/npm\/pretendard)/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const same = url.origin === self.location.origin;
  if (!same && !FONTS.test(request.url)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (same) {
      try {
        const res = await fetch(request, { cache: 'no-cache' });
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch {
        return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('./')) || Response.error();
      }
    }
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  })());
});
