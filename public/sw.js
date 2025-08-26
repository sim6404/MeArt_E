// public/sw.js - Railway 배포 최적화
/* eslint-disable no-undef */
const CACHE_PREFIX = 'meart-railway';
const CACHE_VERSION = 'v3'; // 배포시 증가
const RUNTIME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const API_TIMEOUT_MS = 5000;

// 투명 1x1 PNG (data: URI)
const TRANSPARENT_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith(CACHE_PREFIX) && k !== RUNTIME)
      .map(k => caches.delete(k)));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(k => k.startsWith(CACHE_PREFIX) && k !== RUNTIME)
      .map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// 유틸: 타임아웃이 있는 fetch
const withTimeout = (p, ms) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort('timeout'), ms);
  return fetch(p, { signal: ctrl.signal }).finally(() => clearTimeout(t));
};

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 외부 오리진은 가로채지 않음
  if (url.origin !== self.location.origin) return;

  // API: network-first (+timeout) → cache → JSON 오류(200 OK 아님)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      try {
        const net = await withTimeout(req, API_TIMEOUT_MS);
        if (net && net.ok) {
          cache.put(req, net.clone()).catch(()=>{});
        }
        return net;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        return new Response(JSON.stringify({ ok:false, error:'offline_or_timeout' }), {
          headers: { 'content-type':'application/json', 'cache-control':'no-store' }, status: 503
        });
      }
    })());
    return;
  }

  // 이미지: stale-while-revalidate + 투명 PNG 폴백
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(url.pathname) || url.pathname.startsWith('/BG_image/')) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(req);
      const fetchAndCache = fetch(req).then(r => {
        if (r && r.ok) cache.put(req, r.clone()).catch(()=>{});
        return r;
      }).catch(()=>null);
      if (cached) {
        event.waitUntil(fetchAndCache); // 백그라운드 갱신
        return cached;
      }
      const net = await fetchAndCache;
      if (net) return net;
      // 폴백: 투명 PNG
      return fetch(TRANSPARENT_PNG).catch(()=>new Response(null,{status:204}));
    })());
    return;
  }

  // 앱 셸/HTML: network-first → cache
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME);
      try {
        const net = await fetch(req);
        if (net && net.ok) cache.put(req, net.clone()).catch(()=>{});
        return net;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        return new Response('<h1>Offline</h1>', { headers: { 'content-type':'text/html' }, status: 503 });
      }
    })());
    return;
  }
});
