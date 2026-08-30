/**
 * 全域寫入守門員（假成功偵測）
 *
 * 問題：Supabase RLS 擋掉 UPDATE / UPSERT 時，不會回傳 error，而是「影響 0 筆」。
 * 只檢查 error 的頁面就會顯示「已儲存」，但資料庫其實沒被改到。
 *
 * 作法：攔截 supabase.from(...).update / .upsert / .delete，
 * 一律加上 count: "exact"，若回傳 count === 0 就跳出明確錯誤提示。
 * - update / upsert：影響 0 筆 → 顯示 destructive toast（幾乎都是權限不足或資料已變更）。
 * - delete：影響 0 筆常屬正常（清空既有設定），僅寫 console 警告，不干擾使用者。
 *
 * 這是保險機制；個別頁面仍建議用 `writeWithRowCheck` 做精準處理。
 */
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { NO_ROWS_AFFECTED_MESSAGE } from "@/lib/supabaseWriteGuard";

type AnyFn = (...args: any[]) => any;

let installed = false;

function withCount(args: any[], optionIndex: number) {
  const next = [...args];
  const opts = next[optionIndex];
  next[optionIndex] = { ...(opts ?? {}), count: "exact" };
  return next;
}

function wrapThenable(
  builder: any,
  table: string,
  op: "update" | "upsert" | "delete",
  benignZero = false,
) {
  if (!builder || typeof builder.then !== "function" || builder.__writeAudited) return builder;
  const originalThen = builder.then.bind(builder);
  builder.__writeAudited = true;
  builder.then = (onFulfilled?: AnyFn, onRejected?: AnyFn) =>
    originalThen((result: any) => {
      if (result && !result.error && result.count === 0) {
        const detail = `${table} 的 ${op} 影響 0 筆`;
        if (op === "delete" || benignZero) {
          // delete 無資料可刪、或 upsert ignoreDuplicates 的 no-op，皆屬正常情況
          console.info(`[write-audit] ${detail}（視為正常 no-op）`);
        } else {
          console.warn(`[write-audit] ${detail}`);
          toast({
            title: "儲存失敗",
            description: NO_ROWS_AFFECTED_MESSAGE,
            variant: "destructive",
          });
        }
      }
      return onFulfilled ? onFulfilled(result) : result;
    }, onRejected);
  return builder;
}


/** 於 App 啟動時呼叫一次 */
export function installSupabaseWriteAudit() {
  if (installed) return;
  installed = true;

  const client = supabase as any;
  const originalFrom = client.from.bind(client);

  client.from = (relation: string) => {
    const builder = originalFrom(relation);

    const patch = (method: "update" | "upsert" | "delete", optionIndex: number) => {
      const original = builder[method]?.bind(builder);
      if (!original) return;
      builder[method] = (...args: any[]) => {
        const padded = [...args];
        while (padded.length < optionIndex) padded.push(undefined);
        // upsert(..., { ignoreDuplicates: true }) 的 0 筆屬正常 no-op，不可跳錯誤提示
        const benignZero =
          method === "upsert" && Boolean((padded[optionIndex] as any)?.ignoreDuplicates);
        return wrapThenable(
          original(...withCount(padded, optionIndex)),
          relation,
          method,
          benignZero,
        );
      };

    };

    patch("update", 1);
    patch("upsert", 1);
    patch("delete", 0);

    return builder;
  };
}
