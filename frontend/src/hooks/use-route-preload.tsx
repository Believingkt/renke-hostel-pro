import { useCallback } from "react";

/**
 * 路由預載入（已停用）
 *
 * 原本用於 hover 預抓 routes（dynamic import）。
 * 但在自訂網域/手機端容易遇到「index.html 與 chunk 快取不同步」導致 chunk 404，
 * 進而觸發 ChunkErrorBoundary。
 *
 * 目前改為 eager import routes，因此此 hook 保留 API 但不再做任何 preload。
 */
export const useRoutePreload = () => {
  const preloadRoute = useCallback((_path: string) => {
    // no-op
  }, []);

  return { preloadRoute };
};

