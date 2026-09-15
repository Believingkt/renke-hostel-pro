/**
 * 前台庫存查詢統一入口。
 *
 * 目的：避免「查詢逾時 / 失敗」被靜默吞掉，導致日曆把所有日期當成不可訂（庫存顯示異常）。
 * 策略：
 *  1. 日期分塊（預設 120 天一塊），降低單次查詢負擔，避免 statement timeout。
 *  2. 失敗自動重試（指數退避），仍失敗則 throw，交由呼叫端顯示明確錯誤與降級。
 */
import { supabase } from "@/integrations/supabase/client";

export type AdjustedInventoryRow = {
  date: string;
  available_rooms: number;
  is_blocked: boolean;
};

const CHUNK_SIZE = 120;
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class InventoryQueryError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "InventoryQueryError";
  }
}

async function fetchChunk(
  roomTypeId: string,
  dates: string[],
  accommodationId: string,
): Promise<AdjustedInventoryRow[]> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { data, error } = await supabase.rpc("get_adjusted_room_inventory_batch", {
      p_room_type_id: roomTypeId,
      p_dates: dates,
      p_accommodation_id: accommodationId,
    });
    if (!error) {
      return ((data as any[]) || []).map((row) => ({
        date: String((row as any).date_value ?? (row as any).date ?? ""),
        available_rooms: Number(row.available_rooms ?? 0),
        is_blocked: row.is_blocked === true,
      }));
    }
    lastError = error;
    if (attempt < MAX_ATTEMPTS) await sleep(300 * attempt);
  }
  throw new InventoryQueryError("庫存查詢失敗", lastError);
}

/** 取得指定房型在多個日期的調整後庫存；失敗會 throw InventoryQueryError。 */
export async function fetchAdjustedInventory(
  roomTypeId: string,
  dates: string[],
  accommodationId: string,
): Promise<AdjustedInventoryRow[]> {
  if (dates.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < dates.length; i += CHUNK_SIZE) {
    chunks.push(dates.slice(i, i + CHUNK_SIZE));
  }
  const results: AdjustedInventoryRow[] = [];
  // 分塊序列化執行，避免同時多請求把資料庫連線打滿。
  for (const chunk of chunks) {
    results.push(...(await fetchChunk(roomTypeId, chunk, accommodationId)));
  }
  return results;
}

/** 多房型並行查詢（房型數多時分批），任一房型失敗即 throw。 */
export async function fetchAdjustedInventoryForRoomTypes(
  roomTypeIds: string[],
  dates: string[],
  accommodationId: string,
  concurrency = 3,
): Promise<{ roomTypeId: string; rows: AdjustedInventoryRow[] }[]> {
  const out: { roomTypeId: string; rows: AdjustedInventoryRow[] }[] = [];
  for (let i = 0; i < roomTypeIds.length; i += concurrency) {
    const batch = roomTypeIds.slice(i, i + concurrency);
    const settled = await Promise.all(
      batch.map(async (id) => ({
        roomTypeId: id,
        rows: await fetchAdjustedInventory(id, dates, accommodationId),
      })),
    );
    out.push(...settled);
  }
  return out;
}
