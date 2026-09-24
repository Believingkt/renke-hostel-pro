// Service Worker Kill Switch
// 目的：清除舊快取並自動解除註冊，避免更新後 index.html / chunks 被快取造成手機端無限 Loading。
// 注意：此檔案僅用於「回收舊 SW」，不再提供離線或圖片快取。

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));

      await self.clients.claim();

      // 解除註冊自己，避免繼續攔截請求
      await self.registration.unregister();

      // 讓已開啟的頁面重新載入，拿到最新資源
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(
        clients.map((client) => {
          try {
            return client.navigate(client.url);
          } catch {
            return Promise.resolve();
          }
        })
      );
    } catch {
      // best-effort
    }
  })());
});

// 不攔截任何 fetch，直接交給網路
self.addEventListener('fetch', () => {});

