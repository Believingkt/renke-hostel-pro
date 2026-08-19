/**
 * ai-ops-insights — 總部後台「AI 營運洞察」後端
 *
 * actions:
 *  - metrics   : 回傳 SQL 端已彙總好的營運指標（不呼叫 LLM）
 *  - generate  : 彙總指標 → 呼叫 LLM 產生營運摘要與異常判讀 → 寫入快取
 *  - snapshot  : 回傳精簡版關鍵指標快照（給洞察卡的改善前／後對照使用）
 *
 * 效能約束：本函式沒有任何排程，只在使用者「進頁面讀快取／按重新生成」時執行。
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-3.7-flash";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** 從完整指標抽出關鍵數字，作為洞察卡的成效對照快照 */
function compactSnapshot(m: any) {
  return {
    captured_at: new Date().toISOString(),
    period_days: m?.period?.days ?? null,
    sessions: m?.funnel?.sessions ?? 0,
    orders: m?.funnel?.orders ?? 0,
    conversion_rate: m?.funnel?.conversion_rate ?? 0,
    room_view_sessions: m?.funnel?.room_view_sessions ?? 0,
    revenue: m?.revenue ?? 0,
    addon_rate: m?.addon?.addon_rate ?? 0,
    ai_conversations: m?.ai_chat?.conversations ?? 0,
    line_conversion_rate: m?.ai_chat?.line_conversion_rate ?? 0,
    trip_orders: m?.trips?.trip_orders ?? 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader) return jsonRes({ error: "未授權的請求" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return jsonRes({ error: "未授權的請求" }, 401);

    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin_or_super");
    if (adminErr) console.error("is_admin_or_super failed:", adminErr.message);
    if (!isAdmin) return jsonRes({ error: "沒有權限存取營運洞察" }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "metrics";
    const accommodationId: string | null = body.accommodation_id ?? null;
    const periodDays: number = [7, 14, 30].includes(Number(body.period_days)) ? Number(body.period_days) : 30;

    const admin = createClient(supabaseUrl, serviceKey);

    // 指標一律由 SQL 聚合，模型只讀這份數字，避免編造
    const { data: metrics, error: mErr } = await admin.rpc("get_ai_ops_metrics", {
      _accommodation_id: accommodationId,
      _days: periodDays,
    });
    if (mErr) {
      console.error("get_ai_ops_metrics failed:", mErr.message);
      return jsonRes({ error: "指標彙總失敗", details: mErr.message }, 500);
    }

    if (action === "metrics") return jsonRes({ metrics });
    if (action === "snapshot") return jsonRes({ snapshot: compactSnapshot(metrics) });

    if (action !== "generate") return jsonRes({ error: "未知的 action" }, 400);

    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return jsonRes({ error: "AI 服務未設定（缺少金鑰）" }, 500);

    const systemPrompt = `你是台灣旅宿集團的資深營運顧問。你只會拿到一份已聚合好的 JSON 指標，
請完全依據這份 JSON 的數字做判讀，嚴禁編造任何未出現在 JSON 的數據或名稱。
若某項資料為 0 或缺漏，請直接說明「該期間無足夠資料」，不要臆測。

請輸出 JSON（不要 markdown 圍欄），格式：
{
  "summary": "3-5 句繁體中文營運摘要，說明本期整體表現與最值得注意的 1-2 個變化，句中要帶真實數字",
  "anomalies": [
    {
      "key": "英數短代碼，例如 low_conversion_villa",
      "title": "一句話異常標題",
      "severity": "high | medium | low",
      "metrics": [{"label": "指標名稱", "value": "數值（含單位）"}],
      "root_cause": "可能原因（依數字推論）",
      "recommended_action": "具體可執行的建議行動"
    }
  ]
}
異常判讀請優先檢查：高瀏覽低轉換的館別、熱門對話意圖但站內無對應商品、近期庫存過低的日期、加購率偏低。
最多列 5 項異常，每項都必須引用 JSON 內的真實數字。`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableKey,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `期間：最近 ${periodDays} 天\n指標 JSON：\n${JSON.stringify(metrics)}` },
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error(`AI gateway error [${aiRes.status}]: ${errText}`);
      const msg =
        aiRes.status === 402
          ? "AI 額度不足，請至工作區儲值後再重新生成"
          : aiRes.status === 429
            ? "AI 請求過於頻繁，請稍後再試"
            : "AI 生成失敗";
      return jsonRes({ error: msg, status: aiRes.status, details: errText }, aiRes.status);
    }

    const aiJson = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
    let parsed: { summary?: string; anomalies?: unknown[] } = {};
    try {
      parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/, "").trim());
    } catch {
      parsed = { summary: raw.slice(0, 1200), anomalies: [] };
    }

    const summary = String(parsed.summary ?? "").slice(0, 2000);
    const anomalies = Array.isArray(parsed.anomalies) ? parsed.anomalies.slice(0, 8) : [];

    const payload = {
      accommodation_id: accommodationId,
      period_days: periodDays,
      summary,
      anomalies,
      metrics,
      model: MODEL,
      generated_by: user.id,
      generated_at: new Date().toISOString(),
    };

    // 唯一索引使用 COALESCE 表達式，PostgREST upsert 無法命中 → 手動 update / insert
    let existingQuery = admin
      .from("ai_ops_insight_cache")
      .select("id")
      .eq("period_days", periodDays);
    existingQuery = accommodationId
      ? existingQuery.eq("accommodation_id", accommodationId)
      : existingQuery.is("accommodation_id", null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing?.id) {
      await admin.from("ai_ops_insight_cache").update(payload).eq("id", existing.id);
    } else {
      await admin.from("ai_ops_insight_cache").insert(payload);
    }


    return jsonRes({
      summary,
      anomalies,
      metrics,
      model: MODEL,
      generated_at: payload.generated_at,
    });
  } catch (e) {
    console.error("ai-ops-insights error:", e);
    return jsonRes({ error: (e as Error).message }, 500);
  }
});
