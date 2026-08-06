import { supabase } from "@/integrations/supabase/client";

/**
 * 管理員「檢視其他成員 TeamHome」用的唯讀查詢 client。
 *
 * 提供與 supabase-js 相同的鏈式 API 子集（.from().select().eq()...），
 * 但實際查詢改由 team-view-query Edge Function 以 service role 執行，
 * 因此不受呼叫者 RLS 限制；權限檢查（super_admin / admin）在函式內完成。
 *
 * 用途只有一個：讓 TeamHome 的既有計算邏輯「原封不動」跑在別人的資料上，
 * 避免把獎金公式重寫一份造成邏輯漂移。
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

function createBuilder(table: string) {
  const ops: Op[] = [];

  const run = async (): Promise<Result> => {
    const { data, error } = await supabase.functions.invoke("team-view-query", {
      body: { table, ops },
    });
    if (error) return { data: null, error: { message: error.message } };
    return { data: data?.data ?? null, error: data?.error ?? null };
  };

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
}

export interface TeamViewClient {
  from: (table: string) => any;
}

export function createTeamViewClient(): TeamViewClient {
  return {
    from: (table: string) => createBuilder(String(table)),
  };
}
