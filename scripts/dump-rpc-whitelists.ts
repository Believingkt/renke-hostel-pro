// 從正式環境重新抓取 RPC 定義，同時寫出兩份基準檔（內容一致，不需人工維護清單）：
//   1. src/test/__snapshots__/rpc-whitelists.json          → Vitest 契約測試用
//   2. supabase/functions/rpc-contract-check/expected.json → 每日排程漂移比對用
//
// 執行：SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun scripts/dump-rpc-whitelists.ts
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const RPCS = [
  "update_order_with_context",
  "update_order_fields_v1",
  "sync_order_rooms_v1",
  "update_paid_order_addons_v3",
  "update_paid_order_discount_v2",
];

/** 從函式定義中擷取 c_allowed CONSTANT text[] := ARRAY[...] 的欄位清單（沒有就回空陣列）。 */
export function parseWhitelist(def: string): string[] {
  const m = def.match(/c_allowed[^:]*:=\s*ARRAY\[([\s\S]*?)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(url, key);

  const { data, error } = await admin.rpc("get_rpc_contract", { p_names: RPCS });
  if (error) throw new Error(error.message);

  const functions: Record<string, unknown> = {};
  for (const row of data as Array<{ fn_name: string; src_md5: string; src_len: number; src_def: string }>) {
    functions[row.fn_name] = {
      srcMd5: row.src_md5,
      srcLen: row.src_len,
      fields: parseWhitelist(row.src_def ?? ""),
    };
  }

  const payload = {
    _note: "由 scripts/dump-rpc-whitelists.ts 從正式環境 pg_get_functiondef 自動產生，請勿手動編輯。",
    generatedAt: new Date().toISOString(),
    functions,
  };
  const json = JSON.stringify(payload, null, 2) + "\n";
  writeFileSync("src/test/__snapshots__/rpc-whitelists.json", json);
  writeFileSync("supabase/functions/rpc-contract-check/expected.json", json);
  console.log(`已更新 ${Object.keys(functions).length} 支 RPC 的基準快照`);
}

if (import.meta.main) await main();
