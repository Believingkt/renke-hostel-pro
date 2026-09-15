/**
 * 民宿短網址（short_url_alias）登錄表。
 *
 * 目的：讓 `src/lib/frontendUrl.ts` 能同步（synchronously）把 accommodationId
 * 轉成對外統一的短網址 `/{alias}`，而不需要每個呼叫端自己去查資料庫。
 *
 * - 啟動時 `primeBookingAliases()` 抓一次公開的 active 民宿清單（14 筆左右）。
 * - 任何已經拿到 alias 的畫面都可以呼叫 `registerBookingAlias()` 補登。
 * - 尚未載入完成時 `getBookingAlias()` 回 null，連結會退回 `/booking/villa/{uuid}`
 *   （該路由永久保留，向下相容），不會壞掉。
 */

import { supabase } from "@/integrations/supabase/client";

export interface BookingAliasEntry {
  alias: string | null;
  customDomain: string | null;
}

const memory = new Map<string, BookingAliasEntry>();

const STORAGE_KEY = "booking-alias-registry";
const TTL = 60 * 60 * 1000; // 1 小時

let primed = false;
let primingPromise: Promise<void> | null = null;

function normalizeAlias(alias?: string | null): string | null {
  const a = alias?.trim().replace(/^\/+|\/+$/g, "");
  if (!a) return null;
  return /^[a-z0-9-_]+$/i.test(a) ? a : null;
}

function loadFromStorage() {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      ts: number;
      items: Record<string, BookingAliasEntry>;
    };
    if (!parsed?.items) return;
    for (const [id, entry] of Object.entries(parsed.items)) {
      if (!memory.has(id)) memory.set(id, entry);
    }
    if (Date.now() - (parsed.ts || 0) < TTL) primed = true;
  } catch {
    /* silent */
  }
}

function saveToStorage() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ts: Date.now(), items: Object.fromEntries(memory) }),
    );
  } catch {
    /* silent */
  }
}

loadFromStorage();

export function registerBookingAlias(
  accommodationId?: string | null,
  alias?: string | null,
  customDomain?: string | null,
) {
  const id = accommodationId?.trim();
  if (!id) return;
  memory.set(id, {
    alias: normalizeAlias(alias),
    customDomain: customDomain?.trim() || null,
  });
  saveToStorage();
}

export function getBookingAliasEntry(
  accommodationId?: string | null,
): BookingAliasEntry | null {
  const id = accommodationId?.trim();
  if (!id) return null;
  return memory.get(id) || null;
}

export function getBookingAlias(accommodationId?: string | null): string | null {
  return getBookingAliasEntry(accommodationId)?.alias || null;
}

/** 抓一次公開民宿清單，建立 id → alias 對照。重複呼叫只會執行一次。 */
export function primeBookingAliases(force = false): Promise<void> {
  if (!force && primed) return Promise.resolve();
  if (primingPromise) return primingPromise;

  primingPromise = (async () => {
    try {
      const { data, error } = await supabase
        .from("accommodation_info")
        .select("id, short_url_alias, custom_domain")
        .eq("is_active", true);
      if (error || !data) return;
      for (const row of data as Array<{
        id: string;
        short_url_alias: string | null;
        custom_domain: string | null;
      }>) {
        memory.set(row.id, {
          alias: normalizeAlias(row.short_url_alias),
          customDomain: row.custom_domain?.trim() || null,
        });
      }
      primed = true;
      saveToStorage();
    } catch {
      /* silent：失敗就沿用 uuid 網址 */
    } finally {
      primingPromise = null;
    }
  })();

  return primingPromise;
}
