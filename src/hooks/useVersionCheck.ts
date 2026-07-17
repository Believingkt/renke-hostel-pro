import { useEffect, useRef } from "react";
import { toast } from "sonner";

declare const __BUILD_ID__: string;

/**
 * 版本檢查：build 時會產出 /version.json { buildId }。
 * 使用者切回分頁或每 5 分鐘輪詢一次，若偵測到新版本則跳提示請重新整理，
 * 避免舊分頁繼續使用過期的前端程式（例如舊的搜尋日曆邏輯）。
 *
 * 只在 production 且非預覽環境運作，避免干擾 Lovable 開發預覽。
 */
export function useVersionCheck() {
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    const host = window.location.hostname;
    if (
      host.startsWith("id-preview--") ||
      host.startsWith("preview--") ||
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovableproject-dev.com") ||
      host.endsWith(".beta.lovable.dev")
    ) {
      return;
    }

    const currentBuildId =
      typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "";
    if (!currentBuildId) return;

    const check = async () => {
      if (notifiedRef.current) return;
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (data?.buildId && data.buildId !== currentBuildId) {
          notifiedRef.current = true;
          toast("網站已更新到最新版本", {
            description: "重新整理以載入最新內容",
            duration: Infinity,
            action: {
              label: "重新整理",
              onClick: () => window.location.reload(),
            },
          });
        }
      } catch {
        // 靜默失敗
      }
    };

    // 首次載入延遲檢查
    const initial = window.setTimeout(check, 30_000);
    // 定期輪詢
    const interval = window.setInterval(check, 5 * 60 * 1000);
    // 切回分頁時檢查
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
