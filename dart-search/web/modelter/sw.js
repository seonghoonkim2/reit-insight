/* 모델터 서비스 워커 — 네트워크 우선 + 오프라인 캐시 폴백
 * 원칙: 온라인이면 항상 서버 최신본(구버전 고착 방지 — HTML no-cache 정책과 동일 철학),
 *       오프라인이면 마지막으로 성공한 사본으로 전 기능 동작(계산·엑셀 생성은 원래 무네트워크). */
var C = 'mt-off-v1';
var PRECACHE = ['/', '/guide.html', '/howto.html'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(function (c) { return c.addAll(PRECACHE).catch(function () {}); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (ks) {
      return Promise.all(ks.filter(function (k) { return k !== C; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;      // 외부(폰트 CDN 등)는 관여하지 않음
  if (url.pathname === '/e') return;                // 이벤트 수집은 캐시 대상 아님
  e.respondWith(
    fetch(req).then(function (r) {
      if (r && r.ok) { var cp = r.clone(); caches.open(C).then(function (c) { c.put(req, cp); }); }
      return r;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (m) {
        if (m) return m;
        if (req.mode === 'navigate') return caches.match('/', { ignoreSearch: true });
        return Response.error();
      });
    })
  );
});
