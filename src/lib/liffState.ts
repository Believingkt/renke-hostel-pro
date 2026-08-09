/**
 * LIFF 轉址參數還原（必須在 React Router 掛載前同步執行）
 *
 * LINE 的 https://liff.line.me/{LIFF_ID}?page=checkout&u=Uxxx
 * 轉址到 Endpoint URL 時，會把原始 query 包進 `liff.state`，例如：
 *   https://booking.lakeze.com/?liff.state=%3Fpage%3Dcheckout%26u%3DUxxx
 * 若不處理，落地路徑會是「/」→ 被 BookingDomainRedirect / AliasResolver
 * 當成一般訂房查詢導去 /booking 或館別頁。
 *
 * 這裡把 liff.state 解析回實際 path + query，並用 replaceState 改寫網址，
 * 讓 React Router 一開始就看到 /liff/checkout。
 */

const PAGE_ROUTES: Record<string, string> = {
  checkout: "/liff/checkout",
  favorites: "/liff/favorites",
};

export interface LiffRewriteResult {
  pathname: string;
  search: string;
}

/** 純函式：給定 pathname/search，算出還原後的 pathname/search（無副作用，便於測試） */
export function resolveLiffLanding(
  pathname: string,
  search: string
): LiffRewriteResult | null {
  const params = new URLSearchParams(search);
  const rawState = params.get("liff.state");

  let merged = new URLSearchParams(search);
  let targetPath = pathname;

  if (rawState !== null) {
    merged.delete("liff.state");
    // liff.state 可能是 "?page=checkout&u=U1"、"page=checkout"、或 "/liff/checkout?u=U1"
    let state = rawState;
    try {
      state = decodeURIComponent(rawState);
    } catch {
      /* 已是解碼狀態 */
    }
    const qIndex = state.indexOf("?");
    const statePath = qIndex >= 0 ? state.slice(0, qIndex) : state.startsWith("/") ? state : "";
    const stateQuery = qIndex >= 0 ? state.slice(qIndex + 1) : state.startsWith("/") ? "" : state;

    if (statePath.startsWith("/")) targetPath = statePath;
    new URLSearchParams(stateQuery).forEach((v, k) => merged.set(k, v));
  }

  const page = merged.get("page");
  if (page && PAGE_ROUTES[page]) {
    targetPath = PAGE_ROUTES[page];
    merged.delete("page");
  }

  const pageConsumed = Boolean(page && PAGE_ROUTES[page]);
  if (rawState === null && !pageConsumed) return null;

  if (!targetPath.startsWith("/liff/")) return null;

  const qs = merged.toString();
  return { pathname: targetPath, search: qs ? `?${qs}` : "" };
}

/** 在 app 啟動時同步改寫網址（僅在解析出 /liff/* 目標時才動作） */
export function applyLiffStateRewrite(): void {
  if (typeof window === "undefined") return;
  const result = resolveLiffLanding(window.location.pathname, window.location.search);
  if (!result) return;
  window.history.replaceState(
    null,
    "",
    `${result.pathname}${result.search}${window.location.hash}`
  );
}
