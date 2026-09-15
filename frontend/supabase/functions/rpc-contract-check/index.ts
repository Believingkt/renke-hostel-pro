// 每日排程：重抓 5 支關鍵 RPC 的定義，與測試快照比對，不一致就寫 error_logs + 寄告警信。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import expected from "./expected.json" with { type: "json" };
import { DriftItem, reportRpcContractDrift } from "../_shared/rpcContractAlert.ts";

serve(async () => {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const names = Object.keys((expected as any).functions);
    const { data, error } = await admin.rpc("get_rpc_contract", { p_names: names });
    if (error) throw new Error(error.message);

    const live = new Map(
      ((data ?? []) as Array<{ fn_name: string; src_md5: string; src_len: number }>)
        .map((r) => [r.fn_name, r]),
    );

    const drift: DriftItem[] = [];
    for (const fn of names) {
      const exp = (expected as any).functions[fn];
      const got = live.get(fn);
      if (!got) {
        drift.push({ fn, expected: exp.srcMd5, actual: "—", note: "函式不存在或簽章改變" });
        continue;
      }
      if (got.src_md5 !== exp.srcMd5) {
        drift.push({
          fn,
          expected: exp.srcMd5,
          actual: got.src_md5,
          note: `實際長度 ${got.src_len}（快照 ${exp.srcLen ?? "—"}）`,
        });
      }
    }

    if (drift.length > 0) {
      await reportRpcContractDrift(admin, {
        summary: `${drift.length} 支 RPC 的定義與測試快照不一致`,
        drift,
      });
    }

    console.log(`[rpc-contract-check] checked=${names.length} drift=${drift.length}`);
    return new Response(JSON.stringify({ checked: names.length, drift: drift.length, items: drift }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[rpc-contract-check] error", e);
    return new Response(
      JSON.stringify({ success: false, message: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
