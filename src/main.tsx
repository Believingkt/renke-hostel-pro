import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "./index.css";

// Handle chunk loading failures
window.addEventListener('error', (event) => {
  if (event.message?.includes('Failed to fetch dynamically imported module') || 
      event.message?.includes('Loading chunk')) {
    event.preventDefault();
    window.location.reload();
  }
});

// 強制清除 Service Worker 快取
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
  
  // 清除所有快取
  if ('caches' in window) {
    caches.keys().then((names) => {
      names.forEach(name => {
        caches.delete(name);
      });
    });
  }
}

// 創建 React Query 客戶端
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 分鐘
      gcTime: 10 * 60 * 1000, // 10 分鐘
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      networkMode: 'offlineFirst', // 優先使用緩存
    },
    mutations: {
      networkMode: 'online',
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
