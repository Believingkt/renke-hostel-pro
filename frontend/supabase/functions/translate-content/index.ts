/**
 * translate-content — 前台動態內容自動翻譯（zh → en）
 *
 * - 全新獨立函式：不修改、不呼叫任何既有付款／建單函式。
 * - 先查 public.translation_cache（來源表, 欄位, 資料ID, 語言, 原文雜湊），
 *   命中就直接回；沒命中才走 Lovable AI 閘道翻譯，並寫回快取。
 * - 只做「文字 → 文字」翻譯，不讀取也不寫入任何業務資料表。
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface ItemIn {
  table: string;
  column: string;
  id: string;
  text: string;
}

const MAX_ITEMS = 60;
const MAX_TEXT = 4000;
const SUPPORTED_LANGS = ["en"];

/** 原文雜湊：SHA-256 hex，後台改中文 → 雜湊變 → 自動重譯 */
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const keyOf = (i: { table: string; column: string; id: string }) =>
  `${i.table}.${i.column}.${i.id}`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const lang = typeof body?.lang === "string" ? body.lang : "";
    const rawItems = Array.isArray(body?.items) ? body.items : [];

    if (!SUPPORTED_LANGS.includes(lang)) {
      return json({ error: "unsupported lang" }, 400);
    }

    const items: ItemIn[] = [];
    for (const raw of rawItems.slice(0, MAX_ITEMS)) {
      const table = typeof raw?.table === "string" ? raw.table.slice(0, 120) : "";
      const column = typeof raw?.column === "string" ? raw.column.slice(0, 120) : "";
      const id = typeof raw?.id === "string" ? raw.id.slice(0, 200) : "";
      const text = typeof raw?.text === "string" ? raw.text.slice(0, MAX_TEXT) : "";
      if (!table || !column || !id || !text.trim()) continue;
      items.push({ table, column, id, text });
    }

    // 去重：同一頁常重複送出同一欄位。重複項若進到 upsert，Postgres 會因
    // 「ON CONFLICT 重複影響同一列」讓整批快取寫入失敗（先前的真實災情）。
    const dedupedItems: ItemIn[] = [];
    const seenItemKeys = new Set<string>();
    for (const it of items) {
      const k = `${keyOf(it)}|${it.text}`;
      if (seenItemKeys.has(k)) continue;
      seenItemKeys.add(k);
      dedupedItems.push(it);
    }
    items.length = 0;
    items.push(...dedupedItems);

    if (items.length === 0) return json({ translations: {} });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    /** 告警：任何「譯文沒能落地」的情況都要留痕，不再靜默吞掉 */
    const alertFailure = async (
      step: string,
      message: string,
      context: Record<string, unknown>,
    ) => {
      try {
        await supabase.from("error_logs").insert({
          source: "backend",
          function_name: "translate-content",
          category: "translation_cache",
          step,
          error_message: String(message).substring(0, 2000),
          context,
        });
      } catch (logErr) {
        console.error("[translate-content] alert write failed", String(logErr).slice(0, 200));
      }
    };

    const hashes = await Promise.all(items.map((i) => sha256(i.text)));
    const translations: Record<string, string> = {};

    // 1) 查快取
    const { data: cached, error: cacheErr } = await supabase
      .from("translation_cache")
      .select("source_table, source_column, source_id, source_hash, translated_text")
      .eq("lang", lang)
      .in("source_hash", Array.from(new Set(hashes)));
    if (cacheErr) console.error("[translate-content] cache read failed", cacheErr.message);

    const cacheMap = new Map<string, string>();
    for (const row of cached ?? []) {
      cacheMap.set(
        `${row.source_table}.${row.source_column}.${row.source_id}|${row.source_hash}`,
        row.translated_text,
      );
    }

    const missing: { item: ItemIn; hash: string; index: number }[] = [];
    items.forEach((item, idx) => {
      const hit = cacheMap.get(`${keyOf(item)}|${hashes[idx]}`);
      if (hit) translations[keyOf(item)] = hit;
      else missing.push({ item, hash: hashes[idx], index: idx });
    });

    if (missing.length === 0) {
      return json({ translations, cached: items.length, translated: 0 });
    }

    // 2) 未命中才呼叫 Lovable AI 閘道
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("[translate-content] LOVABLE_API_KEY is not configured");
      return json({ translations, error: "translation unavailable" }, 200);
    }

    const source = missing.map((m, i) => ({ i, text: m.item.text }));

    // 動態輸出上限：中文→英文字元數會膨脹，固定 4000 會讓長文批被切斷。
    const sourceChars = missing.reduce((n, m) => n + m.item.text.length, 0);
    const maxTokens = Math.min(16000, Math.max(2000, Math.ceil(sourceChars * 1.2) + 600));

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        reasoning_effort: "none",
        max_tokens: maxTokens,
        messages: [
          {
            role: "system",
            content:
              "你是旅宿網站文案翻譯員。把繁體中文翻成自然的英文，語氣維持原文，長度接近原文。" +
              "地名／店名採當地慣用譯法；數字、金額、電話、訂單編號一律原樣保留；不要加任何說明。" +
              '只輸出 JSON（不要 markdown），格式：{"items":[{"i":0,"en":""}]}',
          },
          { role: "user", content: JSON.stringify({ items: source }) },
        ],
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("[translate-content] model error", r.status, t.slice(0, 300));
      // 翻譯失敗不視為致命：回傳已命中的快取，前端顯示原文
      return json({ translations, error: `model ${r.status}` }, r.status === 429 ? 429 : 200);
    }

    const j = await r.json();
    const raw = (j?.choices?.[0]?.message?.content || "").trim();
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    let parsedItems: { i?: number; en?: string }[] = [];
    try {
      const parsed = JSON.parse(s >= 0 ? raw.slice(s, e + 1) : raw);
      parsedItems = Array.isArray(parsed?.items) ? parsed.items : [];
    } catch (parseErr) {
      console.error("[translate-content] parse failed", String(parseErr).slice(0, 200));
      await alertFailure("parse_failed", String(parseErr), {
        lang,
        requested: items.length,
        missing: missing.length,
        source_chars: sourceChars,
        max_tokens: maxTokens,
        raw_preview: raw.slice(0, 300),
        sample_keys: missing.slice(0, 5).map((m) => keyOf(m.item)),
      });
      return json({ translations, error: "parse failed" }, 200);
    }

    const byIdx = new Map(parsedItems.map((p) => [Number(p?.i), p]));
    const rowByKey = new Map<string, Record<string, unknown>>();

    missing.forEach((m, i) => {
      const en = byIdx.get(i)?.en;
      if (typeof en !== "string" || !en.trim()) return;
      translations[keyOf(m.item)] = en;
      // 再保險一次：同一批只保留一列相同衝突鍵，避免 upsert 整批失敗
      rowByKey.set(`${keyOf(m.item)}|${m.hash}`, {
        source_table: m.item.table,
        source_column: m.item.column,
        source_id: m.item.id,
        source_hash: m.hash,
        lang,
        translated_text: en,
      });
    });

    const rows = Array.from(rowByKey.values());
    const missingAfterModel = missing.length - rows.length;

    // 3) 寫回快取（service role）。寫入失敗不阻斷回應，但一定要留下紀錄與告警：
    //    先前就是因為寫入失敗被靜默吞掉，導致該館內容永遠無法進快取。
    let cacheWriteError: string | null = null;
    if (rows.length > 0) {
      const { error: upsertErr } = await supabase
        .from("translation_cache")
        .upsert(rows, { onConflict: "source_table,source_column,source_id,lang,source_hash" });
      if (upsertErr) {
        cacheWriteError = upsertErr.message;
        console.error("[translate-content] cache write failed", upsertErr.message);
      }
    }

    if (cacheWriteError || missingAfterModel > 0) {
      await alertFailure(
        cacheWriteError ? "cache_upsert" : "model_incomplete",
        cacheWriteError ?? `model returned ${rows.length}/${missing.length} items`,
        {
          lang,
          requested: items.length,
          missing: missing.length,
          written: rows.length,
          source_chars: sourceChars,
          max_tokens: maxTokens,
          sample_keys: missing.slice(0, 5).map((m) => keyOf(m.item)),
        },
      );
    }

    return json({
      translations,
      cached: items.length - missing.length,
      translated: rows.length,
      ...(cacheWriteError ? { cache_write_error: cacheWriteError } : {}),
      ...(missingAfterModel > 0 ? { model_incomplete: missingAfterModel } : {}),
    });
  } catch (err) {
    console.error("[translate-content] failed", err);
    return json({ error: "translate failed", translations: {} }, 500);
  }
});
