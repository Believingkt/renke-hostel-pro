import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  endOfMonth,
  format,
  formatISO,
  isBefore,
  isSameDay,
  startOfMonth,
  startOfToday,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
} from "date-fns";
import { zhTW } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const HAKUNA_ACCOMMODATION_ID = "6b6ac0dc-602b-4dec-9167-7791ac412ba3";
const SENSAN_ACCOMMODATION_ID = "5f764d55-ae11-4631-80fe-2e611853deae";
// 「任一包棟被訂走即關閉整天」嚴格規則（散客房不參與判斷）
const STRICT_PACKAGE_ANY_BOOKED_IDS = new Set<string>([
  "74d064f4-1f8c-47e8-9be0-f0a596bbe6f8", // 奧莉薇雅生活小酒店
  "8e3e8866-3cb0-4654-91f3-d9b09a543301", // 淞湘卉館
]);

import { detectSensanTierByDate, getSensanRangeForTier } from "@/lib/sensan-pricing";
import {
  detectTierByDate,
  getPackagePriceForTier,
  isPackageExcludedOnDate,
} from "@/hooks/use-accommodation-packages";

interface Props {
  accommodationId: string;
  selectedDate?: Date | null;
  onSelectDate?: (date: Date) => void;
  onAvailabilityComputed?: (info: { dates: Set<string>; minPrice: number | null; earliestDate: string | null }) => void;
}

/**
 * 訂房詳情頁的可訂日曆。
 * 沿用首頁 HeroSection 的可訂判斷規則：
 *  - 森山: 當天有實際訂單才關閉，忽略庫存未開/未建
 *  - 哈庫納(寬鬆): 包棟 ≥2 無庫存 → 整天關閉
 *  - 其他: 任一房型有空即開啟
 * 只顯示「是否可訂」(綠/灰)，不顯示價格。
 */
const VillaAvailabilityCalendar = ({ accommodationId, selectedDate, onSelectDate, onAvailabilityComputed }: Props) => {
  const [monthOffset, setMonthOffset] = useState(0);
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [hasInventory, setHasInventory] = useState<boolean | null>(null);

  const today = useMemo(() => startOfToday(), []);
  const baseMonth = useMemo(() => addMonths(startOfMonth(today), monthOffset), [
    today,
    monthOffset,
  ]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: roomTypes } = await supabase
        .from("room_types")
        .select("id, is_exclusive_package")
        .eq("accommodation_id", accommodationId);

      if (!roomTypes || roomTypes.length === 0) {
        if (!cancelled) setHasInventory(false);
        return;
      }

      const todayStr = formatISO(today, { representation: "date" });
      const endStr = formatISO(endOfMonth(addMonths(today, 11)), {
        representation: "date",
      });

      type InventoryRow = {
        date: string;
        is_available: boolean | null;
        room_type_id: string;
        price: number | null;
      };

      const inventoryRows: InventoryRow[] = [];
      const PAGE_SIZE = 1000;
      let from = 0;

      while (!cancelled) {
        const { data: page } = await supabase
          .from("room_inventory_pricing")
          .select("date, is_available, room_type_id, price")
          .in(
            "room_type_id",
            roomTypes.map((r) => r.id),
          )
          .gte("date", todayStr)
          .lte("date", endStr)
          .order("date", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (!page || page.length === 0) break;
        inventoryRows.push(...page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      if (!inventoryRows || inventoryRows.length === 0) {
        if (!cancelled) setHasInventory(false);
        return;
      }

      const allDates = Array.from(new Set(inventoryRows.map((r) => r.date))).sort();

      const adjustedResults = await Promise.all(
        roomTypes.map(async (rt) => {
          const { data } = await supabase.rpc("get_adjusted_room_inventory_batch", {
            p_room_type_id: rt.id,
            p_dates: allDates,
            p_accommodation_id: accommodationId,
          });
          return { roomTypeId: rt.id, rows: (data as any[]) || [] };
        }),
      );

      const adjustedIndex = new Map<
        string,
        { available_rooms: number; is_blocked: boolean }
      >();
      for (const { roomTypeId, rows } of adjustedResults) {
        for (const row of rows) {
          const dateKey = (row as any).date_value ?? (row as any).date;
          if (!dateKey) continue;
          adjustedIndex.set(`${roomTypeId}:${dateKey}`, {
            available_rooms: row.available_rooms ?? 0,
            is_blocked: row.is_blocked === true,
          });
        }
      }

      const baseIndex = new Map<string, { is_available: boolean }>();
      for (const row of inventoryRows) {
        baseIndex.set(`${row.room_type_id}:${row.date}`, {
          is_available: row.is_available !== false,
        });
      }

      const isHakuna = accommodationId === HAKUNA_ACCOMMODATION_ID;
      const isSensan = accommodationId === SENSAN_ACCOMMODATION_ID;

      // 森山特別處理：直接抓當期訂單，只要當天有活動訂單就關閉
      const sensanBookedDates = new Set<string>();
      if (isSensan) {
        const { data: orders } = await supabase
          .from("orders")
          .select("check_in_date, check_out_date, order_status")
          .eq("accommodation_id", accommodationId)
          .not("order_status", "in", "(cancelled)")
          .lte("check_in_date", endStr)
          .gte("check_out_date", todayStr);
        for (const o of (orders as any[]) || []) {
          const ci = new Date(o.check_in_date);
          const co = new Date(o.check_out_date);
          for (let d = new Date(ci); d < co; d.setDate(d.getDate() + 1)) {
            sensanBookedDates.add(formatISO(d, { representation: "date" }));
          }
        }
      }

      const packageRoomTypes = roomTypes.filter(
        (rt: any) => rt.is_exclusive_package === true,
      );
      const commonRoomTypes = roomTypes.filter(
        (rt: any) => rt.is_exclusive_package !== true,
      );

      const isRoomAvailable = (rt: any, date: string) => {
        const base = baseIndex.get(`${rt.id}:${date}`);
        if (base && base.is_available === false) return false;
        const adj = adjustedIndex.get(`${rt.id}:${date}`);
        if (!adj) return false;
        if (adj.is_blocked) return false;
        return adj.available_rooms > 0;
      };

      const isRoomBookedOut = (rt: any, date: string) => {
        const base = baseIndex.get(`${rt.id}:${date}`);
        if (!base || base.is_available === false) return false;
        const adj = adjustedIndex.get(`${rt.id}:${date}`);
        if (!adj) return false;
        return adj.is_blocked || adj.available_rooms <= 0;
      };

      const available = new Set<string>();
      for (const date of allDates) {
        if (isHakuna && packageRoomTypes.length > 0) {
          // 哈庫納（散客房不計入）：
          // 條件1: 任一包棟有訂單（被訂走）→ 整天關閉
          if (packageRoomTypes.some((rt) => isRoomBookedOut(rt, date))) continue;
          // 條件2: 包棟庫存關閉 ≥2 → 整天關閉
          const closedCount = packageRoomTypes.filter((rt) => {
            const base = baseIndex.get(`${rt.id}:${date}`);
            return !base || base.is_available === false;
          }).length;
          if (closedCount >= 2) continue;
          available.add(date);
          continue;
        }
        if (isSensan) {
          // 森山：只看當天是否有實際訂單，忽略庫存未開的情況
          if (sensanBookedDates.has(date)) continue;
          available.add(date);
          continue;
        }
        if (
          STRICT_PACKAGE_ANY_BOOKED_IDS.has(accommodationId) &&
          packageRoomTypes.length > 0
        ) {
          // 嚴格規則：任一包棟被訂走 → 整天關閉（散客房不計入）
          if (packageRoomTypes.some((rt) => isRoomBookedOut(rt, date))) continue;
          if (packageRoomTypes.some((rt) => isRoomAvailable(rt, date))) {
            available.add(date);
          }
          continue;
        }
        if (roomTypes.some((rt) => isRoomAvailable(rt, date))) available.add(date);
      }

      if (!cancelled) {
        setAvailableDates(available);
        setHasInventory(true);
        // 計算最低價：只看「該日 & 該房型實際有庫存可訂」的 inventory row
        // 若該住宿有包區方案 (exclusive package)，前台僅賣包區，散客房不納入最低價
        const hasPackages = packageRoomTypes.length > 0;
        const priceableRoomIds = new Set(
          (hasPackages ? packageRoomTypes : roomTypes).map((r: any) => r.id),
        );
        let minPrice: number | null = null;
        let earliestDate: string | null = null;
        const sortedAvail = Array.from(available).sort();
        if (sortedAvail.length > 0) earliestDate = sortedAvail[0];

        if (isSensan && earliestDate) {
          // 森山：用包區方案表（硬編碼），抓該日時段最低方案價
          const [y, m, d] = earliestDate.split("-").map(Number);
          const tier = detectSensanTierByDate(new Date(y, m - 1, d));
          const range = getSensanRangeForTier(tier);
          minPrice = range.min.sale;
        } else if (earliestDate) {
          // 其他住宿：從 accommodation_packages 抓該日時段最低方案售價
          const { data: pkgs } = await supabase
            .from("accommodation_packages")
            .select("*")
            .eq("accommodation_id", accommodationId)
            .eq("enabled", true);
          const [y, m, d] = earliestDate.split("-").map(Number);
          const earliestDateObj = new Date(y, m - 1, d);
          const tier = detectTierByDate(earliestDateObj);
          if (pkgs && pkgs.length > 0) {
            for (const p of pkgs as any[]) {
              const applicable: string[] = Array.isArray(p.applicable_tiers) ? p.applicable_tiers : [];
              if (!applicable.includes(tier)) continue;
              const excluded = Array.isArray(p.excluded_date_ranges) ? p.excluded_date_ranges : [];
              if (isPackageExcludedOnDate({ excluded_date_ranges: excluded }, earliestDateObj)) continue;
              const { sale } = getPackagePriceForTier(
                {
                  tier_prices:
                    p.tier_prices && typeof p.tier_prices === "object" && !Array.isArray(p.tier_prices)
                      ? p.tier_prices
                      : {},
                  original_price: p.original_price,
                  sale_price: p.sale_price,
                },
                tier as any,
              );
              if (typeof sale === "number" && sale > 0) {
                if (minPrice == null || sale < minPrice) minPrice = sale;
              }
            }
          }
          // fallback：若無方案，退回庫存最低售價
          if (minPrice == null) {
            for (const row of inventoryRows) {
              if (!available.has(row.date)) continue;
              if (!priceableRoomIds.has(row.room_type_id)) continue;
              const rt = roomTypes.find((r: any) => r.id === row.room_type_id);
              if (!rt) continue;
              if (!isRoomAvailable(rt, row.date)) continue;
              const pr = (row as any).price;
              if (typeof pr === "number" && pr > 0) {
                if (minPrice == null || pr < minPrice) minPrice = pr;
              }
            }
          }
        }
        onAvailabilityComputed?.({ dates: available, minPrice, earliestDate });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [accommodationId, today]);

  // 已移除可視化日曆 UI；此元件僅負責計算可訂日資料並透過 onAvailabilityComputed 回傳，
  // 由民宿搜尋日曆 (EditSearchSheet) 使用。
  return null;
};


export default VillaAvailabilityCalendar;
