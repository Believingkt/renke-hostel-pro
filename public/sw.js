const CACHE_NAME = 'image-cache-v1';
const IMAGE_CACHE_NAME = 'images-v1';

// 圖片相關的 URL 模式
const IMAGE_PATTERNS = [
  /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i,
  /supabase.*storage/i,
  /cloudinary/i,
  /imgix/i,
];

// 檢查是否為圖片請求
const isImageRequest = (url) => {
  return IMAGE_PATTERNS.some(pattern => pattern.test(url));
};

// Install 事件 - 快取關鍵資源
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache opened');
      return cache.addAll([
        '/',
        '/index.html',
      ]);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate 事件 - 清理舊快取
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch 事件 - 處理請求
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;

  // 只處理 GET 請求
  if (request.method !== 'GET') {
    return;
  }

  // 圖片請求使用 Cache First 策略
  if (isImageRequest(url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then((cache) => {
        return cache.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Cache hit:', url);
            // 背景更新快取
            fetch(request).then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
            }).catch(() => {
              // 網路錯誤時忽略，繼續使用快取
            });
            return cachedResponse;
          }

          // 快取中沒有，從網路獲取
          console.log('[SW] Cache miss, fetching:', url);
          return fetch(request).then((response) => {
            // 只快取成功的回應
            if (response.ok) {
              // 克隆回應，因為它只能被讀取一次
              cache.put(request, response.clone());
            }
            return response;
          }).catch((error) => {
            console.error('[SW] Fetch failed:', url, error);
            throw error;
          });
        });
      })
    );
    return;
  }

  // 其他請求使用 Network First 策略
  event.respondWith(
    fetch(request)
      .then((response) => {
        // 對於成功的回應，更新快取
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 網路失敗時，嘗試從快取獲取
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            console.log('[SW] Serving from cache (offline):', url);
            return cachedResponse;
          }
          throw new Error('No cache available');
        });
      })
  );
});

// 消息事件 - 手動清理快取
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW] Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        event.ports[0].postMessage({ success: true });
      })
    );
  }
});
