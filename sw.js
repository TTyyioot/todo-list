/**
 * Service Worker — PWA 离线缓存 v2
 * 每日待办事项清单
 * 策略：HTML 网络优先，静态资源缓存优先
 */

const CACHE_NAME = 'todolist-v4';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/utils.js',
  './js/icons.js',
  './js/storage.js',
  './js/task.js',
  './js/render.js',
  './js/supabase.js',
  './js/auth.js',
  './js/app.js',
  './manifest.json'
];

// ========== 安装：预缓存所有静态资源 ==========
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW v2] 缓存静态资源...');
      return cache.addAll(ASSETS).catch(err => {
        console.warn('[SW v2] 部分资源缓存失败（CDN 可能超时，不影响使用）:', err);
      });
    })
  );
  self.skipWaiting();
});

// ========== 激活：清理旧缓存 ==========
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW v2] 删除旧缓存:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ========== 请求拦截 ==========
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // CDN 资源：直接走网络，不缓存
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('unpkg.com')) {
    return; // 不拦截，浏览器默认处理
  }

  // HTML 页面：网络优先（确保总是最新）
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        return caches.match(event.request);
      })
    );
    return;
  }

  // 静态资源：缓存优先
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;

        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          if (url.hostname === self.location.hostname || url.hostname.includes('github.io')) {
            cache.put(event.request, clone);
          }
        });

        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
