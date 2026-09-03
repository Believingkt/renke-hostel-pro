// 訊息頁未讀數的單一真實來源（分類：對話／訂單／獎勵／優惠／互動）
// App icon 角標 = 訊息頁未讀總數（含推播累加），兩者共用此模組。

export type MessageCategory = "chat" | "order" | "reward" | "promo" | "interact";

/** 各分類未讀數（與訊息頁顯示的紅點／數字一致） */
export const CATEGORY_UNREAD: Record<MessageCategory, number> = {
  chat: 3,
  order: 2,
  reward: 1,
  promo: 1,
  interact: 1,
};

const READ_KEY = "messages_categories_read";

/** 使用者是否已按過「全部已讀」（清掉分類未讀） */
export function areCategoriesRead(): boolean {
  try {
    return localStorage.getItem(READ_KEY) === "1";
  } catch {
    return false;
  }
}

export function markCategoriesRead(): void {
  try {
    localStorage.setItem(READ_KEY, "1");
  } catch {
    /* ignore */
  }
  refreshMessagesUnread();
}

/** 單一分類目前未讀數（已全部已讀則為 0） */
export function getCategoryUnread(key: MessageCategory): number {
  return areCategoriesRead() ? 0 : CATEGORY_UNREAD[key];
}

/** 分類未讀合計 */
export function getCategoriesUnreadTotal(): number {
  if (areCategoriesRead()) return 0;
  return Object.values(CATEGORY_UNREAD).reduce((a, b) => a + b, 0);
}

/** 訊息頁未讀總數 = 分類未讀 + 推播未讀 */
export function getMessagesUnreadTotal(pushUnread: number): number {
  const push = Number.isFinite(pushUnread) && pushUnread > 0 ? Math.floor(pushUnread) : 0;
  return getStoredCategoriesUnread() + push;
}

// ---------------------------------------------------------------------------
// 全域未讀 store：App 啟動即初始化，不依賴訊息頁被開啟
// ---------------------------------------------------------------------------

const UNREAD_EVENT = "lakeze:messages-unread-changed";

let loaded = false;
let categoriesTotal = 0;

/** 未讀資料是否已載入（未載入前不可把角標寫成 0） */
export function isMessagesUnreadLoaded(): boolean {
  return loaded;
}

/** App 啟動時呼叫：載入分類未讀狀態到全域 store */
export function initMessagesUnread(): number {
  categoriesTotal = getCategoriesUnreadTotal();
  loaded = true;
  window.dispatchEvent(new CustomEvent<number>(UNREAD_EVENT, { detail: categoriesTotal }));
  return categoriesTotal;
}

/** 目前 store 中的分類未讀合計（未初始化時即時計算並初始化） */
export function getStoredCategoriesUnread(): number {
  if (!loaded) return initMessagesUnread();
  return categoriesTotal;
}

/** 分類未讀變動後刷新 store 並通知訂閱者 */
export function refreshMessagesUnread(): number {
  return initMessagesUnread();
}

/** 訂閱分類未讀變動 */
export function subscribeMessagesUnread(handler: (total: number) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<number>).detail);
  window.addEventListener(UNREAD_EVENT, listener);
  return () => window.removeEventListener(UNREAD_EVENT, listener);
}
