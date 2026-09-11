import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * 包棟／包區房型的「內含房間組成」共用讀取邏輯。
 *
 * 職責界線（刻意限縮）：
 *  - 只負責查詢 room_types.package_contents、正規化、快取、動態補查。
 *  - 不含價格計算、庫存判斷、備註字串組裝、任何表單狀態。
 *
 * 動態補查：輸入的房型 ID 集合在執行過程中改變（新增一列房間、切換到集合外的
 * 新包棟房型）時，effect 會補查尚未快取的 ID，已查過的結果保留不重打。
 */
export type PackageBreakdownItem = {
  /** package_contents 內自訂房間列的 id（無 id 時退回用名稱當 key） */
  room_type_id: string;
  name: string;
  /** 該自訂房間的間數上限／預設值 */
  count: number;
};

/** 把 room_types.package_contents 原始 jsonb 正規化成穩定結構 */
export function normalizePackageContents(raw: unknown): PackageBreakdownItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it: any) => {
      const name = String(it?.name ?? "").trim();
      const count = Number(it?.count) || 0;
      const key = String(it?.id ?? name);
      if (!key || !name || count <= 0) return null;
      return { room_type_id: key, name, count } as PackageBreakdownItem;
    })
    .filter(Boolean) as PackageBreakdownItem[];
}

/** 依組成清單產生「換房型當下」要帶入的預設間數（room_type_id -> count） */
export function defaultCountsFromBreakdown(items: PackageBreakdownItem[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items || []) out[it.room_type_id] = it.count;
  return out;
}

/** 依組成清單產生「換房型當下」要帶入的預設間數（以名稱為 key，供編輯訂單備註格式使用） */
export function defaultCountsByNameFromBreakdown(
  items: PackageBreakdownItem[] | null | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of items || []) out[it.name] = it.count;
  return out;
}

export function usePackageBreakdown(roomTypeIds: Array<string | null | undefined>) {
  const [map, setMap] = useState<Record<string, PackageBreakdownItem[]>>({});
  const mapRef = useRef<Record<string, PackageBreakdownItem[]>>({});
  mapRef.current = map;
  // 已查過（含查到空結果）的 ID，避免重複打同一支查詢
  const fetchedRef = useRef<Set<string>>(new Set());

  const key = useMemo(
    () => Array.from(new Set((roomTypeIds || []).filter(Boolean) as string[])).sort().join(","),
    [roomTypeIds],
  );

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    const missing = ids.filter((id) => !fetchedRef.current.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("room_types")
        .select("id, package_contents")
        .in("id", missing);
      if (cancelled) return;
      missing.forEach((id) => fetchedRef.current.add(id));
      const next: Record<string, PackageBreakdownItem[]> = {};
      for (const row of ((data as any[]) || [])) {
        const items = normalizePackageContents((row as any).package_contents);
        if (items.length > 0) next[String((row as any).id)] = items;
      }
      if (Object.keys(next).length > 0) {
        setMap((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [key]);

  const getBreakdown = useCallback(
    (roomTypeId?: string | null): PackageBreakdownItem[] | null => {
      if (!roomTypeId) return null;
      const arr = map[roomTypeId];
      return arr && arr.length > 0 ? arr : null;
    },
    [map],
  );

  return { breakdownByRoomType: map, getBreakdown };
}
