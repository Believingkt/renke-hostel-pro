/**
 * 全館庫存日曆（唯讀）計算工具。
 *
 * 完全沿用「預訂管理 → 可訂日曆檢視」(AvailabilityCalendarDialog) 的判斷規則，
 * 但抽出成純查詢函式，供行銷團隊後台跨館別檢視使用。
 * 只讀資料、不寫入任何設定。
 *
 * 注意：訂單資料透過 SECURITY DEFINER RPC 取得（get_adjusted_room_inventory_batch /
 * get_dates_with_active_orders），因此不會揭露訂單個資，也不需要放寬 orders RLS。
 */
import { supabase } from "@/integrations/supabase/client";

const HAKUNA_ACCOMMODATION_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
const SENSAN_ACCOMMODATION_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
const STRICT_PACKAGE_ANY_BOOKED_IDS = new Set<string>([
  "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8",
  "8e3e8866-3cb0-4654-91f3-d9b09a543301",
]);

export interface VenueRoomType {
  id: string;
  name: string;
  is_exclusive_package: boolean | null;
  room_count: number;
}

export interface DayAvailability {
  /** 當日可訂房數（依旗標調整） */
  available: number;
  /** 當日總房數 */
  total: number;
  /** 依前台可訂規則判定是否「當日可訂」 */
  bookable: boolean;
}

export interface VenueAvailabilityResult {
  roomTypes: VenueRoomType[];
  /** 整館綁定鎖房（只顯示可訂/已滿，不顯示間數） */
  bundledLock: boolean;
  byDate: Map<string, DayAvailability>;
  /** 各房型逐日庫存（供房型篩選使用）：roomTypeId → date → 狀態 */
  byRoomType: Map<string, Map<string, DayAvailability>>;
}


/** 取得單一館別在指定日期區間的可訂狀態（全館合計） */
export async function fetchVenueAvailability(
  accommodationId: string,
  dates: string[],
): Promise<VenueAvailabilityResult> {
  const empty: VenueAvailabilityResult = {
    roomTypes: [],
    bundledLock: false,
    byDate: new Map(),
  };
  if (!accommodationId || dates.length === 0) return empty;

  const [{ data: rtData }, { data: acc }] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, name, is_exclusive_package, display_order, room_count")
      .eq("accommodation_id", accommodationId)
      .order("display_order", { ascending: true }),
    supabase
      .from("accommodation_info")
      .select("bundled_lock_inventory, package_inventory_as_one")
      .eq("id", accommodationId)
      .maybeSingle(),
  ]);

  const roomTypes: VenueRoomType[] = ((rtData || []) as any[]).map((r) => ({
    id: r.id,
    name: r.name,
    is_exclusive_package: r.is_exclusive_package,
    room_count: r.room_count ?? 1,
  }));
  const bundledLock = (acc as any)?.bundled_lock_inventory === true;
  const pkgAsOne = (acc as any)?.package_inventory_as_one === true;
  if (roomTypes.length === 0) return { ...empty, bundledLock };

  const startStr = dates[0];
  const endStr = dates[dates.length - 1];

  // 基礎庫存開關（is_available=false → 當日該房型關閉）
  const baseIndex = new Map<string, boolean>();
  {
    const PAGE_SIZE = 1000;
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data: page } = await supabase
        .from("room_inventory_pricing")
        .select("date, is_available, room_type_id")
        .in(
          "room_type_id",
          roomTypes.map((r) => r.id),
        )
        .gte("date", startStr)
        .lte("date", endStr)
        .order("date", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (!page || page.length === 0) break;
      for (const row of page as any[]) {
        baseIndex.set(`${row.room_type_id}:${row.date}`, row.is_available !== false);
      }
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
  }

  // 調整後庫存（含包棟／綁定規則）
  const adjustedIndex = new Map<string, { available_rooms: number; is_blocked: boolean }>();
  const adjustedResults = await Promise.all(
    roomTypes.map(async (rt) => {
      const { data } = await supabase.rpc("get_adjusted_room_inventory_batch", {
        p_room_type_id: rt.id,
        p_dates: dates,
        p_accommodation_id: accommodationId,
      });
      return { roomTypeId: rt.id, rows: ((data as any[]) || []) };
    }),
  );
  for (const { roomTypeId, rows } of adjustedResults) {
    for (const row of rows) {
      const dateKey = (row as any).date_value ?? (row as any).date;
      if (!dateKey) continue;
      adjustedIndex.set(`${roomTypeId}:${String(dateKey)}`, {
        available_rooms: row.available_rooms ?? 0,
        is_blocked: row.is_blocked === true,
      });
    }
  }

  const isSensan = accommodationId === SENSAN_ACCOMMODATION_ID;
  const isHakuna = accommodationId === HAKUNA_ACCOMMODATION_ID;
  const packageRoomTypes = roomTypes.filter((r) => r.is_exclusive_package === true);

  // 森山：僅看實際訂單覆蓋（RPC 為 SECURITY DEFINER，不回傳個資）
  const sensanBookedDates = new Set<string>();
  if (isSensan) {
    const { data } = await supabase.rpc("get_dates_with_active_orders", {
      p_accommodation_id: accommodationId,
      p_dates: dates,
    });
    for (const row of ((data as any[]) || [])) {
      const d = (row as any).date_value ?? row;
      if (d) sensanBookedDates.add(String(d));
    }
  }

  const isRoomAvailable = (rt: VenueRoomType, date: string) => {
    const base = baseIndex.get(`${rt.id}:${date}`);
    if (base === false) return false;
    const adj = adjustedIndex.get(`${rt.id}:${date}`);
    if (!adj) return false;
    if (adj.is_blocked) return false;
    return adj.available_rooms > 0;
  };
  const isRoomBookedOut = (rt: VenueRoomType, date: string) => {
    const base = baseIndex.get(`${rt.id}:${date}`);
    if (base === undefined || base === false) return false;
    const adj = adjustedIndex.get(`${rt.id}:${date}`);
    if (!adj) return false;
    return adj.is_blocked || adj.available_rooms <= 0;
  };

  const totalRooms = roomTypes.reduce((s, rt) => {
    const isPkg = rt.is_exclusive_package === true;
    return s + (pkgAsOne && isPkg ? 1 : rt.room_count || 1);
  }, 0);

  const byDate = new Map<string, DayAvailability>();
  for (const date of dates) {
    let bookable: boolean;
    if (isSensan) {
      bookable = !sensanBookedDates.has(date);
    } else if (isHakuna && packageRoomTypes.length > 0) {
      if (packageRoomTypes.some((rt) => isRoomBookedOut(rt, date))) {
        bookable = false;
      } else {
        const closedCount = packageRoomTypes.filter(
          (rt) => baseIndex.get(`${rt.id}:${date}`) !== true,
        ).length;
        bookable = closedCount < 2;
      }
    } else if (STRICT_PACKAGE_ANY_BOOKED_IDS.has(accommodationId) && packageRoomTypes.length > 0) {
      bookable =
        !packageRoomTypes.some((rt) => isRoomBookedOut(rt, date)) &&
        packageRoomTypes.some((rt) => isRoomAvailable(rt, date));
    } else {
      bookable = roomTypes.some((rt) => isRoomAvailable(rt, date));
    }

    let available = 0;
    if (isSensan) {
      available = sensanBookedDates.has(date) ? 0 : totalRooms;
    } else {
      for (const rt of roomTypes) {
        if (baseIndex.get(`${rt.id}:${date}`) === false) continue;
        const adj = adjustedIndex.get(`${rt.id}:${date}`);
        if (!adj || adj.is_blocked) continue;
        const raw = Math.max(0, adj.available_rooms || 0);
        const isPkg = rt.is_exclusive_package === true;
        available += pkgAsOne && isPkg ? Math.min(1, raw) : raw;
      }
    }

    byDate.set(date, { available, total: totalRooms, bookable });
  }

  return { roomTypes, bundledLock, byDate };
}
