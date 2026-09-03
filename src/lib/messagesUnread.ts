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
  return getCategoriesUnreadTotal() + push;
}
