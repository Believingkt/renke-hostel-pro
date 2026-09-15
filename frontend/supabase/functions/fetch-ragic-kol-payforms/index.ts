// 唯讀：讀取 Ragic 勞務報酬單（ragicadministration/5），供 PMS「勞報單對帳」Tab 比對用。
// - 只允許 super_admin / hotel_admin / scout_manager 呼叫
// - 只做 GET，不寫回 Ragic、不動任何獎金數字
// Body: { period?: "YYYYMM" }  // 有帶時只回該期別（依對帳編號尾碼）
// deno-lint-ignore-file no-explicit-any
import { resolveCaller } from "../_shared/authz.ts";
import { ragicAuthHeader } from "../_shared/ragic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PAY_FORM_URL = "https://ap15.ragic.com/lakeze/ragicadministration/5";

/** 勞報單欄位 EID */
const F = {
  RECON_CODE: "1001029", // 對帳編號（PMS 預帶）
  NICKNAME: "1001024",
  IG_URL: "1001025",
  VENUE: "1000508",
  AMOUNT: "3005533",
  PAYFORM_NO: "3005521", // 勞報單編號（LR-xxxx）
} as const;

const ALLOWED_ROLES = ["super_admin", "hotel_admin", "scout_manager"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toNumber(v: unknown): number {
  const n = Number(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = await resolveCaller(req);
    if (!auth.ok) return json({ error: auth.error }, auth.status);
    const ctx = auth.ctx;
    if (!ctx.isServiceRole && !ctx.globalRoles.some((r) => ALLOWED_ROLES.includes(r))) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const period = String(body?.period ?? "").trim(); // YYYYMM

    // Ragic 分頁讀取（唯讀）
    const records: any[] = [];
    const PAGE = 1000;
    for (let offset = 0; offset < 5000; offset += PAGE) {
      const url = `${PAY_FORM_URL}?api&naming=EID&limit=${PAGE}&offset=${offset}`;
      const resp = await fetch(url, { headers: { Authorization: ragicAuthHeader() } });
      if (!resp.ok) {
        return json(
          { error: `Ragic 讀取失敗（HTTP ${resp.status}）`, detail: await resp.text() },
          502,
        );
      }
      const text = await resp.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        return json({ error: "Ragic 回傳非 JSON", detail: text.slice(0, 500) }, 502);
      }
      const keys = Object.keys(data ?? {}).filter(
        (k) => !k.startsWith("_") && data[k] && typeof data[k] === "object",
      );
      for (const k of keys) records.push({ ...data[k], __key: k });
      if (keys.length < PAGE) break;
    }

    const rows = records.map((r) => {
      const code = String(r[F.RECON_CODE] ?? "").trim();
      const m = /^KOL-([^-]+)-(\d{6})$/i.exec(code);
      return {
        ragic_id: String(r._ragicId ?? r.__key ?? ""),
        payform_no: String(r[F.PAYFORM_NO] ?? "").trim() || null,
        recon_code: code,
        cid_code: m ? m[1].toUpperCase() : null,
        period: m ? m[2] : null,
        nickname: String(r[F.NICKNAME] ?? "").trim(),
        ig_url: String(r[F.IG_URL] ?? "").trim(),
        venue: String(r[F.VENUE] ?? "").trim(),
        amount: toNumber(r[F.AMOUNT]),
        created_at: String(r._create_date ?? "").trim() || null,
      };
    });

    const filtered = period ? rows.filter((r) => r.period === period) : rows;

    return json({
      period: period || null,
      total_fetched: rows.length,
      count: filtered.length,
      rows: filtered,
    });
  } catch (e: any) {
    console.error("[fetch-ragic-kol-payforms]", e);
    return json({ error: e?.message ?? String(e) }, 500);
  }
});
