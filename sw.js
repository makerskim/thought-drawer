// 오프라인에서도 앱이 열리도록, 한 번 받은 앱 파일과 글꼴을 저장해 둔다.
// 앱 파일은 늘 새 버전을 먼저 확인하고(no-cache), 안 되면 저장본을 쓴다. 구글 API는 저장하지 않는다.
// 폰의 「공유」로 보낸 사진·링크(manifest 의 share_target)도 여기서 받아 앱에 넘긴다.
const VERSION = 'td-v3';
const SHARE = 'td-share'; // 공유로 받은 것을 앱이 가져갈 때까지 잠시 두는 곳
const FONTS = /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net\/npm\/(pretendard|wanted-sans|@kfonts|@fontsource))/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// 공유 받기: 사진은 잠시 저장해 두고 앱의 받기 화면(#/share?shared=번호)으로, 글·링크만 오면 주소에 실어 보낸다
async function takeShare(request) {
  const scope = self.registration.scope;
  try {
    const form = await request.formData();
    const pick = (k) => String(form.get(k) ?? '').trim();
    const info = { title: pick('title'), text: pick('text'), url: pick('url') };
    const files = form.getAll('files').filter((f) => f && typeof f === 'object' && f.size > 0);
    if (!files.length) {
      const q = new URLSearchParams(Object.entries(info).filter(([, v]) => v));
      return Response.redirect(`${scope}?${q}`, 303);
    }
    const id = Date.now().toString(36);
    const cache = await caches.open(SHARE);
    const key = (k) => new URL(`__share/${id}/${k}`, scope).href;
    for (let i = 0; i < files.length; i++) {
      await cache.put(key(i), new Response(files[i], { headers: { 'content-type': files[i].type || 'image/jpeg', 'x-name': encodeURIComponent(files[i].name || `shared-${i}.jpg`) } }));
    }
    await cache.put(key('info'), new Response(JSON.stringify({ ...info, files: files.length }), { headers: { 'content-type': 'application/json' } }));
    return Response.redirect(`${scope}#/share?shared=${id}`, 303);
  } catch {
    return Response.redirect(`${scope}#/share?shared=fail`, 303);
  }
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/share-target')) { e.respondWith(takeShare(request)); return; }
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const same = url.origin === self.location.origin;
  if (!same && !FONTS.test(request.url)) return;
  if (same && url.pathname.includes('/downloads/')) return; // 받기용 파일은 늘 새로 받는다
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
