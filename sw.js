/**
 * Service Worker — PWA 离线缓存
 * 每日待办事项清单
 */

const CACHE_NAME = 'todolist-v1';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/utils.js',
  './js/icons.js',
  './js/storage.js',
  './js/task.js',
  './js/render.js',
  './js/app.js',
  './manifest.json'
];

// ========== 安装：预缓存所有静态资源 ==========
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] 缓存静态资源...');
      return cache.addAll(ASSETS);
    })
  );
  // 立即激活，不等待旧 SW
  self.skipWaiting();
});

// ========== 激活：清理旧缓存 ==========
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  // 立即接管所有页面
  self.clients.claim();
});

// ========== 请求拦截：缓存优先 ==========
self.addEventListener('fetch', (event) => {
  // 跳过非 GET 请求和 Chrome 扩展
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      // 命中缓存，直接返回
      if (cached) return cached;

      // 未命中，发起网络请求
      return fetch(event.request).then((response) => {
        // 只缓存成功的响应
        if (!response || response.status !== 200) return response;

        // 缓存新资源（仅缓存同源资源）
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          if (event.request.url.includes(self.location.hostname) ||
              event.request.url.includes('github.io')) {
            cache.put(event.request, clone);
          }
        });

        return response;
      }).catch(() => {
        // 网络失败 + 无缓存 → 返回离线页面
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
