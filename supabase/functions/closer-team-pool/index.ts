// 成交組 20% 團獎池「唯讀聚合」入口（Phase 2B）
//
// 唯一 Source of Truth：與個人成交組獎金發放完全同源
//   closer_commission_snapshots（依 payout_month）
//   closer_commission_adjustments（依 adjustment_month）
//
// 計算粒度與個人端一致（逐筆拆分後加總）：
//   pool     = round(gross × bonus_rate)
//   personal = round(gross) − pool
// bonus_rate 依「該發放月」生效版本（closer_team_bonus_settings.effective_from）。
//
// 本函式只讀不寫，不建立任何快照、不改任何既有資料。
//
// 權限：需帶使用者 JWT，且為 super_admin / hotel_admin / closer / closer_manager。

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { resolveCaller, hasGlobalTeamRole } from "../_shared/authz.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const roundBonus = (n: unknown) => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? Math.round(v) : 0;
};

/** 與 src/lib/closerBonusSplit.ts 同一規則：Pool 先取整，Personal = round(Gross) − Pool */
function splitCloserBonus(gross: unknown, rate: number) {
  const poolRate = Number.isFinite(rate) && rate > 0 ? Math.min(rate, 1) : 0;
  const g = roundBonus(gross);
  const pool = roundBonus(Number(gross ?? 0) * poolRate);
  return { gross: g, pool, personal: g - pool };
}

interface RateRow {
  bonus_rate: number | null;
  effective_from: string;
}

function isPayoutMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authRes = await resolveCaller(req);
    if (!authRes.ok) return json({ success: false, error: authRes.error }, authRes.status);
    const ctx = authRes.ctx;
    const supabase = ctx.admin;

    // 只限全域團隊角色（呼叫端：TeamCommissionStatsTab／TeamBonusDistributionTab／TeamHome，皆為團隊後台）
    const isPrivileged = await hasGlobalTeamRole(ctx, ["admin", "closer", "closer_manager"]);
    if (!isPrivileged) {
      return json({ success: false, error: "沒有權限查詢團獎池" }, 403);
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const payoutMonth = body?.payout_month;
    if (!isPayoutMonth(payoutMonth)) {
      return json({ success: false, error: "payout_month 參數不正確（需 YYYY-MM）" }, 400);
    }
    const monthFirst = `${payoutMonth}-01`;

    // 該發放月生效的 bonus_rate（沿用正式設定，不新增規則）
    const { data: rateRows, error: rateErr } = await supabase
      .from("closer_team_bonus_settings")
      .select("bonus_rate, effective_from")
      .lte("effective_from", monthFirst)
      .order("effective_from", { ascending: false })
      .limit(1);
    if (rateErr) throw rateErr;
    const rateRow = (rateRows ?? [])[0] as RateRow | undefined;
    const rawRate = Number(rateRow?.bonus_rate ?? 0);
    const bonusRate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 0;

    // Snapshots：依 payout_month
    const { data: snaps, error: snapErr } = await supabase
      .from("closer_commission_snapshots")
      .select("id, closer_id, closer_commission_amount")
      .eq("payout_month", payoutMonth);
    if (snapErr) throw snapErr;

    // Adjustments：依 adjustment_month
    const { data: adjs, error: adjErr } = await supabase
      .from("closer_commission_adjustments")
      .select("id, closer_id, closer_amount, adjustment_type")
      .eq("adjustment_month", payoutMonth);
    if (adjErr) throw adjErr;

    let grossTotal = 0;
    let personalTotal = 0;
    let snapshotGross = 0;
    let snapshotPersonal = 0;
    let snapshotPool = 0;
    let snapshotCount = 0;
    for (const s of (snaps ?? []) as any[]) {
      const amt = Number(s.closer_commission_amount ?? 0);
      if (!s.closer_id || !amt) continue;
      const sp = splitCloserBonus(amt, bonusRate);
      grossTotal += sp.gross;
      personalTotal += sp.personal;
      snapshotGross += sp.gross;
      snapshotPersonal += sp.personal;
      snapshotPool += sp.pool;
      snapshotCount += 1;
    }

    // ── Preview 補位（P0-1）────────────────────────────────────────────
    // 正式 Snapshot 尚未由 9/10 cron 建立前，本期資料月（= 發放月 − 1）
    // 中「還沒有任何 Snapshot 的 order_id」以既有 preview-closer-commission
    // 即時試算補位。eligibility / 公式一律沿用該函式，本檔不重寫。
    // 去重鍵固定為 order_id（不看 snapshot_month / payout_month），
    // 只要該訂單已存在任何 Snapshot，Preview 一律排除，避免 double count。
    let previewGross = 0;
    let previewPersonal = 0;
    let previewPool = 0;
    let previewCount = 0;
    try {
      const [py, pm] = payoutMonth.split("-").map(Number);
      const dataYear = pm === 1 ? py - 1 : py;
      const dataMonth = pm === 1 ? 12 : pm - 1;

      const baseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (baseUrl && serviceKey) {
        const res = await fetch(`${baseUrl}/functions/v1/preview-closer-commission`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            apikey: serviceKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ year: dataYear, month: dataMonth, scope: "team" }),
        });
        const pv = await res.json().catch(() => null);
        const rows: any[] = pv?.success && Array.isArray(pv.orders) ? pv.orders : [];

        const candidates = rows.filter((r) => r?.closer_id && Number(r?.closer_commission ?? 0));
        const ids = Array.from(new Set(candidates.map((r) => String(r.order_id))));

        // 已存在 Snapshot 的 order_id（不限月份）→ Preview 排除
        const snapshotted = new Set<string>();
        for (let i = 0; i < ids.length; i += 300) {
          const chunk = ids.slice(i, i + 300);
          const { data: exist, error: existErr } = await supabase
            .from("closer_commission_snapshots")
            .select("order_id")
            .in("order_id", chunk);
          if (existErr) throw existErr;
          for (const e of exist ?? []) snapshotted.add(String((e as any).order_id));
        }

        for (const r of candidates) {
          if (snapshotted.has(String(r.order_id))) continue;
          const sp = splitCloserBonus(Number(r.closer_commission ?? 0), bonusRate);
          grossTotal += sp.gross;
          personalTotal += sp.personal;
          previewGross += sp.gross;
          previewPersonal += sp.personal;
          previewPool += sp.pool;
          previewCount += 1;
        }
      }
    } catch (_e) {
      // Preview 補位失敗不影響正式 Snapshot 聚合結果
    }

    let adjustmentGross = 0;
    let adjustmentPersonal = 0;
    let adjustmentPool = 0;
    let positiveAdjustmentPool = 0;
    let negativeAdjustmentPool = 0;
    let adjustmentCount = 0;
    for (const a of (adjs ?? []) as any[]) {
      const amt = Number(a.closer_amount ?? 0);
      if (!a.closer_id || !amt) continue;
      const sp = splitCloserBonus(amt, bonusRate);
      grossTotal += sp.gross;
      personalTotal += sp.personal;
      adjustmentGross += sp.gross;
      adjustmentPersonal += sp.personal;
      adjustmentPool += sp.pool;
      if (sp.pool >= 0) positiveAdjustmentPool += sp.pool;
      else negativeAdjustmentPool += sp.pool;
      adjustmentCount += 1;
    }

    const poolTotal = snapshotPool + previewPool + adjustmentPool;

    return json({
      success: true,
      payout_month: payoutMonth,
      bonus_rate: bonusRate,
      gross_total: grossTotal,
      personal_total: personalTotal,
      snapshot_gross: snapshotGross,
      snapshot_personal: snapshotPersonal,
      snapshot_pool: snapshotPool,
      preview_gross: previewGross,
      preview_personal: previewPersonal,
      preview_pool: previewPool,
      adjustment_gross: adjustmentGross,
      adjustment_personal: adjustmentPersonal,
      adjustment_pool: adjustmentPool,
      positive_adjustment_pool: positiveAdjustmentPool,
      negative_adjustment_pool: negativeAdjustmentPool,
      pool_total: poolTotal,
      snapshot_count: snapshotCount,
      preview_count: previewCount,
      adjustment_count: adjustmentCount,
    });

  } catch (e: any) {
    return json({ success: false, error: e?.message || "團獎池聚合失敗" }, 500);
  }
});
