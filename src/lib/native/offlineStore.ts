/**
 * 離線快取（@capacitor/preferences）。
 * 只在原生 App 讀寫；瀏覽器版一律略過，行為完全不變。
 */

import { isNativeApp } from "@/lib/appMode";

const PREFIX = "offline_cache:";

export interface CachedEnvelope<T> {
  data: T;
  savedAt: number;
}

async function preferences() {
  if (!isNativeApp()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return Preferences;
  } catch {
    return null;
  }
}

export async function readOfflineCache<T>(key: string): Promise<CachedEnvelope<T> | null> {
  const prefs = await preferences();
  if (!prefs) return null;
  try {
    const { value } = await prefs.get({ key: PREFIX + key });
    if (!value) return null;
    const parsed = JSON.parse(value) as CachedEnvelope<T>;
    if (!parsed || typeof parsed.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeOfflineCache<T>(key: string, data: T): Promise<void> {
  const prefs = await preferences();
  if (!prefs) return;
  try {
    const envelope: CachedEnvelope<T> = { data, savedAt: Date.now() };
    await prefs.set({ key: PREFIX + key, value: JSON.stringify(envelope) });
  } catch {
    /* ignore */
  }
}

export async function clearOfflineCache(key: string): Promise<void> {
  const prefs = await preferences();
  if (!prefs) return;
  try {
    await prefs.remove({ key: PREFIX + key });
  } catch {
    /* ignore */
  }
}

/** 快取鍵：集中管理避免撞名 */
export const OFFLINE_KEYS = {
  memberOrders: (memberId: string) => `member-orders:${memberId}`,
  memberOrderDetail: (orderNumber: string) => `member-order-detail:${orderNumber}`,
  memberMessages: () => "member-messages",
};
