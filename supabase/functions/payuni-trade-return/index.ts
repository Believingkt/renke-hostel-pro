// PAYUNi 3D 完成後瀏覽器 Form Post 的 ReturnURL：不改資料（以 Notify 為準），303 導回付款結果頁
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getPayuniConfig, parseNotify } from "../_shared/payuni.ts";
import { handleTradeReturn, RETURN_ERROR_URL } from "../_shared/payuniTradeHandlers.ts";

Deno.serve(async (req) => {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const parsed = req.method === "POST" ? await parseNotify(req, { config: getPayuniConfig() }) : { ok: false as const, reason: "MISSING_FIELDS" as const };
    return await handleTradeReturn(admin, parsed);
  } catch (e) {
    console.error(`[payuni-trade-return] ${e instanceof Error ? e.message : e}`);
    return new Response(null, { status: 303, headers: { Location: RETURN_ERROR_URL } });
  }
});
