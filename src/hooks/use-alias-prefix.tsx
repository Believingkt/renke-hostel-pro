import { useCallback, useMemo } from "react";
import { useNavigate, useLocation, useParams, type NavigateOptions } from "react-router-dom";

/**
 * 取得當前路由的 alias 前綴與 alias-aware 導航工具。
 *
 * - `prefix`: "/traveldays" 或 "" (無 alias)
 * - `alias`: "traveldays" 或 null
 * - `withPrefix(path)`: 將絕對路徑轉換為帶前綴版本（傳入 "/admin/orders" → "/traveldays/admin/orders"）
 * - `aliasNavigate(to, opts)`: 自動加上 alias 前綴的 navigate
 */
export function useAliasPrefix() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ alias?: string }>();

  // 從路徑判定 alias（支援於任何子路由使用）
  const alias = useMemo<string | null>(() => {
    if (params.alias) return params.alias;
    const segments = location.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const first = segments[0];
    // 排除已知的非 alias 第一段
    const reserved = new Set([
      "admin",
      "auth",
      "hq",
      "hq-auth",
      "headquarters",
      "booking",
      "book",
      "member",
      "ai-booking",
      "order-search",
      "profile",
      "payment-test",
      "kol-api-docs",
      "points-api-docs",
      "pay",
      "payment-result",
      "reset-password",
      "change-password",
      "og-preview",
      "__cb",
    ]);
    if (reserved.has(first)) return null;
    return first;
  }, [params.alias, location.pathname]);

  const prefix = alias ? `/${alias}` : "";

  const withPrefix = useCallback(
    (path: string) => {
      if (!alias) return path;
      if (!path.startsWith("/")) return path;
      // 若已含前綴，保持原樣
      if (path === `/${alias}` || path.startsWith(`/${alias}/`)) return path;
      return `${prefix}${path}`;
    },
    [alias, prefix]
  );

  const aliasNavigate = useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        navigate(to);
        return;
      }
      navigate(withPrefix(to), options);
    },
    [navigate, withPrefix]
  );

  return { alias, prefix, withPrefix, aliasNavigate };
}
