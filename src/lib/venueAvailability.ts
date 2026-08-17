/**
 * 全館庫存日曆（唯讀）計算工具。
 *
 * 完全沿用「預訂管理 → 可訂日曆檢視」(AvailabilityCalendarDialog) 的判斷規則，
 * 但抽出成純查詢函式，供行銷團隊後台跨館別檢視使用。
 * 只讀資料、不寫入任何設定。
 *
 * 注意：訂單資料透過 SECURITY DEFINER RPC 取得（get_adjusted_room_inventory_batch /
 * get_dates_with_active_orders），因此不會揭露訂單個資，也不需要放寬 orders RLS。
 *
 * 效能：跨館查詢時使用 fetchAllVenuesAvailability，會把 room_types /
 * accommodation_info / room_inventory_pricing 合併成各一次批次查詢，
 * 並把所有房型的 get_adjusted_room_inventory_batch RPC 平行送出（真實庫存來源不變）。
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

interface AdjustedRow {
  available_rooms: number;
  is_blocked: boolean;
}

/** 平行度上限：避免一次打爆連線池 */
const RPC_CONCURRENCY = 12;

async function runPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

/** 分頁抓取指定房型群的基礎庫存開關 */
async function fetchBaseIndex(
  roomTypeIds: string[],
  startStr: string,
  endStr: string,
): Promise<Map<string, boolean>> {
  const baseIndex = new Map<string, boolean>();
  if (roomTypeIds.length === 0) return baseIndex;
  const PAGE_SIZE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data: page } = await supabase
      .from("room_inventory_pricing")
      .select("date, is_available, room_type_id")
      .in("room_type_id", roomTypeIds)
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
  return baseIndex;
}

/** 由已取得的原始資料計算單館結果（純運算，無 I/O） */
function computeVenueAvailability(
  accommodationId: string,
  dates: string[],
  roomTypes: VenueRoomType[],
  flags: { bundledLock: boolean; pkgAsOne: boolean },
  baseIndex: Map<string, boolean>,
  adjustedIndex: Map<string, AdjustedRow>,
  sensanBookedDates: Set<string>,
): VenueAvailabilityResult {
  const { bundledLock, pkgAsOne } = flags;
  const isSensan = accommodationId === SENSAN_ACCOMMODATION_ID;
  const isHakuna = accommodationId === HAKUNA_ACCOMMODATION_ID;
  const packageRoomTypes = roomTypes.filter((r) => r.is_exclusive_package === true);

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
  const byRoomType = new Map<string, Map<string, DayAvailability>>();
  for (const rt of roomTypes) {
    const isPkg = rt.is_exclusive_package === true;
    const capacity = pkgAsOne && isPkg ? 1 : rt.room_count || 1;
    const perDate = new Map<string, DayAvailability>();
    for (const date of dates) {
      let avail: number;
      if (isSensan) {
        avail = sensanBookedDates.has(date) ? 0 : capacity;
      } else if (baseIndex.get(`${rt.id}:${date}`) === false) {
        avail = 0;
      } else {
        const adj = adjustedIndex.get(`${rt.id}:${date}`);
        if (!adj || adj.is_blocked) {
          avail = 0;
        } else {
          const raw = Math.max(0, adj.available_rooms || 0);
          avail = pkgAsOne && isPkg ? Math.min(1, raw) : Math.min(capacity, raw);
        }
      }
      perDate.set(date, { available: avail, total: capacity, bookable: avail > 0 });
    }
    byRoomType.set(rt.id, perDate);
  }

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

  return { roomTypes, bundledLock, byDate, byRoomType };
}

/**
 * 一次取得多個館別的可訂狀態（跨館批次，效能最佳）。
 * 判斷規則與單館版本完全一致，庫存仍來自真實 RPC。
 */
export async function fetchAllVenuesAvailability(
  accommodationIds: string[],
  dates: string[],
  onVenueReady?: (accommodationId: string, result: VenueAvailabilityResult) => void,
): Promise<Record<string, VenueAvailabilityResult>> {
  const out: Record<string, VenueAvailabilityResult> = {};
  if (accommodationIds.length === 0 || dates.length === 0) return out;

  const startStr = dates[0];
  const endStr = dates[dates.length - 1];

  // 1) 一次抓齊所有館別的房型與旗標
  const [{ data: rtData }, { data: accData }] = await Promise.all([
    supabase
      .from("room_types")
      .select("id, name, is_exclusive_package, display_order, room_count, accommodation_id")
      .in("accommodation_id", accommodationIds)
      .order("display_order", { ascending: true }),
    supabase
      .from("accommodation_info")
      .select("id, bundled_lock_inventory, package_inventory_as_one")
      .in("id", accommodationIds),
  ]);

  const roomTypesByAcc = new Map<string, VenueRoomType[]>();
  for (const r of ((rtData || []) as any[])) {
    const list = roomTypesByAcc.get(r.accommodation_id) ?? [];
    list.push({
      id: r.id,
      name: r.name,
      is_exclusive_package: r.is_exclusive_package,
      room_count: r.room_count ?? 1,
    });
    roomTypesByAcc.set(r.accommodation_id, list);
  }
  const flagsByAcc = new Map<string, { bundledLock: boolean; pkgAsOne: boolean }>();
  for (const a of ((accData || []) as any[])) {
    flagsByAcc.set(a.id, {
      bundledLock: a.bundled_lock_inventory === true,
      pkgAsOne: a.package_inventory_as_one === true,
    });
  }

  const allRoomTypeIds = ((rtData || []) as any[]).map((r) => r.id as string);

  // 2) 基礎庫存開關：所有館別一次抓
  const baseIndexPromise = fetchBaseIndex(allRoomTypeIds, startStr, endStr);

  // 3) 真實可訂庫存 RPC：所有館別的房型平行送出
  const rpcTargets = ((rtData || []) as any[]).map((r) => ({
    roomTypeId: r.id as string,
    accommodationId: r.accommodation_id as string,
  }));
  const adjustedPromise = runPool(rpcTargets, RPC_CONCURRENCY, async (t) => {
    const { data } = await supabase.rpc("get_adjusted_room_inventory_batch", {
      p_room_type_id: t.roomTypeId,
      p_dates: dates,
      p_accommodation_id: t.accommodationId,
    });
    return { roomTypeId: t.roomTypeId, rows: ((data as any[]) || []) };
  });

  // 4) 森山：訂單覆蓋日
  const sensanPromise = accommodationIds.includes(SENSAN_ACCOMMODATION_ID)
    ? supabase.rpc("get_dates_with_active_orders", {
        p_accommodation_id: SENSAN_ACCOMMODATION_ID,
        p_dates: dates,
      })
    : Promise.resolve({ data: [] as any[] });

  const [baseIndex, adjustedResults, sensanRes] = await Promise.all([
    baseIndexPromise,
    adjustedPromise,
    sensanPromise,
  ]);

  const adjustedIndex = new Map<string, AdjustedRow>();
  for (const { roomTypeId, rows } of adjustedResults) {
    for (const row of rows) {
      const dateKey = (row as any).date_value ?? (row as any).date;
      if (!dateKey) continue;
      adjustedIndex.set(`${roomTypeId}:${String(dateKey)}`, {
        available_rooms: (row as any).available_rooms ?? 0,
        is_blocked: (row as any).is_blocked === true,
      });
    }
  }

  const sensanBookedDates = new Set<string>();
  for (const row of (((sensanRes as any)?.data as any[]) || [])) {
    const d = (row as any).date_value ?? row;
    if (d) sensanBookedDates.add(String(d));
  }

  for (const accId of accommodationIds) {
    const roomTypes = roomTypesByAcc.get(accId) ?? [];
    const flags = flagsByAcc.get(accId) ?? { bundledLock: false, pkgAsOne: false };
    const result =
      roomTypes.length === 0
        ? {
            roomTypes: [],
            bundledLock: flags.bundledLock,
            byDate: new Map<string, DayAvailability>(),
            byRoomType: new Map<string, Map<string, DayAvailability>>(),
          }
        : computeVenueAvailability(
            accId,
            dates,
            roomTypes,
            flags,
            baseIndex,
            adjustedIndex,
            sensanBookedDates,
          );
    out[accId] = result;
    onVenueReady?.(accId, result);
  }

  return out;
}

/** 取得單一館別在指定日期區間的可訂狀態（全館合計） */
export async function fetchVenueAvailability(
  accommodationId: string,
  dates: string[],
): Promise<VenueAvailabilityResult> {
  const map = await fetchAllVenuesAvailability([accommodationId], dates);
  return (
    map[accommodationId] ?? {
      roomTypes: [],
      bundledLock: false,
      byDate: new Map(),
      byRoomType: new Map(),
    }
  );
}
