import { supabase } from "@/integrations/supabase/client";

/**
 * 「檢視其他成員 TeamHome」用的唯讀查詢 client。
 *
 * 提供與 supabase-js 相同的鏈式 API 子集（.from().select().eq()...），
 * 但實際查詢改由 team-view-query Edge Function 以 service role 執行，
 * 因此不受呼叫者 RLS 限制；權限檢查（super_admin / admin / 各組主管）在函式內完成。
 *
 * 用途只有一個：讓 TeamHome 的既有計算邏輯「原封不動」跑在別人的資料上，
 * 避免把獎金公式重寫一份造成邏輯漂移。
 *
 * 效能：同一個 tick 內發出的查詢會自動合併成單一 batch 請求，
 * 大幅減少 Edge Function 往返次數（原本數十次 → 數次）。
 */

const CHAIN_METHODS = [
  "select",
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "ilike",
  "is",
  "in",
  "not",
  "or",
  "contains",
  "overlaps",
  "order",
  "limit",
  "range",
] as const;

interface Op {
  fn: string;
  args: unknown[];
}

type Result = { data: any; error: { message: string } | null };

/** 單一 batch 請求最多帶幾筆查詢（後端同步上限） */
const BATCH_SIZE = 12;

interface PendingItem {
  table: string;
  ops: Op[];
  resolve: (r: Result) => void;
}

function createQueue(viewUserId?: string | null) {
  let pending: PendingItem[] = [];
  let scheduled = false;

  const flush = async () => {
    scheduled = false;
    const items = pending;
    pending = [];
    if (items.length === 0) return;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      void (async () => {
        try {
          const { data, error } = await supabase.functions.invoke("team-view-query", {
            body: {
              viewUserId: viewUserId ?? null,
              batch: chunk.map((c) => ({ table: c.table, ops: c.ops })),
            },
          });
          if (error) {
            chunk.forEach((c) => c.resolve({ data: null, error: { message: error.message } }));
            return;
          }
          const results = Array.isArray(data?.results) ? data.results : null;
          if (!results) {
            const msg = data?.error?.message ?? data?.error ?? "team-view-query failed";
            chunk.forEach((c) => c.resolve({ data: null, error: { message: String(msg) } }));
            return;
          }
          chunk.forEach((c, idx) => {
            const r = results[idx] ?? { data: null, error: { message: "missing result" } };
            c.resolve({ data: r.data ?? null, error: r.error ?? null });
          });
        } catch (e) {
          chunk.forEach((c) =>
            c.resolve({ data: null, error: { message: String((e as Error)?.message ?? e) } }),
          );
        }
      })();
    }
  };

  return (table: string, ops: Op[]): Promise<Result> =>
    new Promise<Result>((resolve) => {
      pending.push({ table, ops, resolve });
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(() => void flush());
      }
    });
}

export interface TeamViewClient {
  from: (table: string) => any;
}

export function createTeamViewClient(viewUserId?: string | null): TeamViewClient {
  const enqueue = createQueue(viewUserId);

  const createBuilder = (table: string) => {
    const ops: Op[] = [];
    const run = () => enqueue(table, ops);

    const builder: any = {
      then: (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
        run().then(resolve, reject),
      catch: (reject: (e: unknown) => unknown) => run().catch(reject),
    };

    for (const fn of CHAIN_METHODS) {
      builder[fn] = (...args: unknown[]) => {
        ops.push({ fn, args });
        return builder;
      };
    }
    for (const fn of ["maybeSingle", "single"]) {
      builder[fn] = () => {
        ops.push({ fn, args: [] });
        return builder;
      };
    }
    return builder;
  };

  return { from: (table: string) => createBuilder(String(table)) };
}
