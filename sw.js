// 오프라인에서도 앱 화면이 열리도록 앱 파일과 글꼴, 도구를 저장해 둔다.
// 구글 API 요청은 저장하지 않는다(항상 최신 카드를 받도록).
const VERSION = 'td-v1';
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/config.js',
  'js/core/note.js', 'js/core/search.js', 'js/core/instagram.js', 'js/core/ask.js', 'js/core/export.js',
  'js/store/auth.js', 'js/store/drive.js', 'js/store/demo.js', 'js/store/library.js', 'js/store/idb.js', 'js/store/image.js',
  'js/ui/dom.js', 'js/ui/cards.js', 'js/ui/render.js',
  'js/vendor/marked.min.js', 'js/vendor/purify.min.js', 'js/vendor/jszip.min.js',
  'js/ui/views/home.js', 'js/ui/views/note.js', 'js/ui/views/add.js', 'js/ui/views/find.js', 'js/ui/views/graph.js', 'js/ui/views/settings.js',
];
const CDN = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const same = url.origin === self.location.origin;
  if (!same && !CDN.test(request.url)) return;
  // 앱 파일은 새 버전을 먼저 받아 보고, 안 되면 저장본을 쓴다
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (same) {
      try {
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch {
        return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('index.html'));
      }
    }
    const hit = await cache.match(request);
    if (hit) return hit;
    const res = await fetch(request);
    if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
    return res;
  })());
});
