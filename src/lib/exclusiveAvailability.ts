/**
 * 包棟互斥／庫存判定的純函式（下訂前後雙重驗證共用）
 *
 * 資料來源一律是 RPC `get_adjusted_room_inventory_batch` 回傳的每日列，
 * 該 RPC 已依「綁定關係」判斷互斥：不同棟（A1–A7 各自獨立）互不封鎖，
 * 只有包棟與其旗下綁定的散客房才會互相封鎖。
 *
 * 本檔只負責解讀這些列，不自行推導互斥關係，避免前端出現第二套規則。
 */

export interface AdjustedInventoryRow {
  date_value?: string | Date | null;
  date?: string | Date | null;
  available_rooms?: number | null;
  is_blocked?: boolean | null;
  blocked_by_room_name?: string | null;
}

export function normalizeRowDate(row: AdjustedInventoryRow): string {
  const raw = row.date_value ?? row.date ?? "";
  if (raw instanceof Date) return raw.toISOString().split("T")[0];
  const s = String(raw);
  return s.includes("T") ? s.split("T")[0] : s;
}

/** 由入住日與晚數展開「夜次日期」清單（不含退房日） */
export function buildNightDates(checkInDate: string, nights: number): string[] {
  const out: string[] = [];
  if (!checkInDate || nights <= 0) return out;
  const [y, m, d] = checkInDate.split("-").map(Number);
  for (let i = 0; i < nights; i++) {
    const cur = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + i));
    out.push(cur.toISOString().split("T")[0]);
  }
  return out;
}

export type InventoryVerdictReason = "blocked" | "insufficient" | "oversold";

export interface InventoryVerdict {
  ok: boolean;
  reason?: InventoryVerdictReason;
  /** 造成失敗的日期 */
  date?: string;
  /** 互斥封鎖來源房型名稱 */
  blockedByRoomName?: string;
  /** 該日剩餘可售（僅 insufficient / oversold 時有意義） */
  available?: number;
}

export interface VerifyOptions {
  /** 需要的房間數 */
  requiredQuantity: number;
  /**
   * 下訂「後」的複驗：訂單已寫入，庫存已含本單，
   * 因此只有實際超賣（available < 0）或被互斥封鎖才算失敗。
   */
  postBooking?: boolean;
}

/**
 * 判定一組每日庫存列是否可成立訂單。
 * 前置驗證：任一日被互斥封鎖，或剩餘 < 需求 → 失敗。
 * 後置複驗：任一日被互斥封鎖，或剩餘 < 0（並發超賣）→ 失敗。
 */
export function verifyAdjustedInventory(
  rows: AdjustedInventoryRow[] | null | undefined,
  { requiredQuantity, postBooking = false }: VerifyOptions,
): InventoryVerdict {
  const list = rows ?? [];
  for (const row of list) {
    if (row?.is_blocked === true) {
      return {
        ok: false,
        reason: "blocked",
        date: normalizeRowDate(row),
        blockedByRoomName: row.blocked_by_room_name || "",
      };
    }
  }
  for (const row of list) {
    const available = Number(row?.available_rooms ?? 0);
    if (postBooking) {
      if (available < 0) {
        return { ok: false, reason: "oversold", date: normalizeRowDate(row), available };
      }
    } else if (available < requiredQuantity) {
      return { ok: false, reason: "insufficient", date: normalizeRowDate(row), available };
    }
  }
  return { ok: true };
}

/** 產生給使用者看的中文訊息 */
export function describeInventoryVerdict(v: InventoryVerdict): string {
  if (v.ok) return "";
  if (v.reason === "blocked") {
    return `${v.date} 已被 ${v.blockedByRoomName || "其他訂單"} 預訂，包棟互斥無法重複預訂`;
  }
  if (v.reason === "oversold") {
    return `${v.date} 房況於下訂當下被其他訂單搶先，訂單已為您取消，請重新選擇日期`;
  }
  return `${v.date} 可訂房間數不足，請調整日期或間數`;
}
