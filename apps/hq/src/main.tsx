import { primeBookingAliases } from "@lakeze/shared/lib/bookingAliasRegistry";
import * as React from "react";
import * as ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.tsx";
import "@lakeze/shared/index.css";

// LIFF 轉址參數還原（必須在 Router 掛載前執行）
import { applyLiffStateRewrite } from "@lakeze/shared/lib/liffState";
applyLiffStateRewrite();

// 在應用啟動時初始化圖片格式偵測
import { initFormatDetection } from "@lakeze/shared/utils/imageFormatHelper";
initFormatDetection();

// 全域寫入守門員：RLS 擋下導致「影響 0 筆」時，顯示明確錯誤而非假成功
import { installSupabaseWriteAudit } from "@lakeze/shared/lib/supabaseWriteAudit";
installSupabaseWriteAudit();


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  },
});

const root = document.getElementById("root");
if (root) {
  try {
    ReactDOM.createRoot(root).render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    );
  } catch (err) {
    console.error("React mount error:", err);
    root.innerHTML = `<div style="padding:2rem;text-align:center;font-family:sans-serif">
      <h2>載入失敗</h2>
      <p style="color:#666">${err instanceof Error ? err.message : String(err)}</p>
      <button onclick="location.reload()" style="margin-top:1rem;padding:8px 16px;cursor:pointer">重新整理</button>
    </div>`;
  }
}

// Clean up service workers and caches
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach(registration => registration.unregister());
  });
}

if ('caches' in window) {
  caches.keys().then((names) => {
    names.forEach(name => caches.delete(name));
  });
}

// 預先載入民宿短網址對照，讓前台連結一律輸出 /{alias}
primeBookingAliases();
