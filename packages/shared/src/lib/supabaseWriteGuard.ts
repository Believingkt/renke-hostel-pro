/**
 * 寫入結果守門員
 *
 * 背景：Supabase RLS 若擋掉 UPDATE / DELETE，不會回傳 error，而是「影響 0 筆」。
 * 前端如果只檢查 error，就會出現「看起來儲存成功、實際上沒改到」的假成功。
 *
 * 用法：在寫入 query 後面串 `.select("id")`，再交給 `writeWithRowCheck`。
 *   await writeWithRowCheck(
 *     supabase.from("table").update(payload).eq("id", id).select("id"),
 *     "儲存活動",
 *   );
 */

export const NO_ROWS_AFFECTED_MESSAGE =
  "沒有資料被更新。可能是權限、資料已變更，或目前條件不再符合，請重新整理後再試。";


export class NoRowsAffectedError extends Error {
  constructor(label?: string) {
    super(label ? `${label}失敗：${NO_ROWS_AFFECTED_MESSAGE}` : NO_ROWS_AFFECTED_MESSAGE);
    this.name = "NoRowsAffectedError";
  }
}

interface WriteResult<T> {
  data: T[] | T | null;
  error: { message: string } | null;
}

/**
 * 執行寫入並確認至少影響 1 筆；影響 0 筆時丟出明確的權限不足錯誤。
 * query 必須串 `.select(...)`，否則 Supabase 不會回傳受影響的資料列。
 */
export async function writeWithRowCheck<T>(
  query: PromiseLike<WriteResult<T>>,
  label?: string,
): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    throw new Error(label ? `${label}失敗：${error.message}` : error.message);
  }
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    throw new NoRowsAffectedError(label);
  }
  return rows;
}

/** 取出可直接顯示給使用者的錯誤訊息 */
export function writeErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return NO_ROWS_AFFECTED_MESSAGE;
}
