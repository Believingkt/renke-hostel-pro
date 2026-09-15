import { supabase } from "@/integrations/supabase/client";

const FALLBACK_SHORT_NAME = "特許加盟";

const fmtMoney = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(Number(v))
    ? "-"
    : `NT$ ${Number(v).toLocaleString()}`;

const fmtDate = (v: string | null | undefined) => {
  if (!v) return "-";
  const s = String(v).slice(0, 10);
  return s.includes("-") ? s.replace(/-/g, "/") : s;
};

/**
 * 透過 franchise_projects.name 比對取得 accommodation_info.short_name (fallback name)
 * 若完全找不到對應 project，回傳 null（呼叫端使用「特許加盟」fallback）
 */
async function resolveProjectShortName(
  projectName: string | null | undefined,
): Promise<{ shortName: string | null; accommodationId: string | null }> {
  const name = (projectName ?? "").trim();
  if (!name) return { shortName: null, accommodationId: null };
  try {
    const { data: proj } = await (supabase as any)
      .from("franchise_projects")
      .select("accommodation_id")
      .eq("name", name)
      .maybeSingle();
    const accommodationId = (proj?.accommodation_id as string | null) ?? null;
    if (!accommodationId) return { shortName: null, accommodationId: null };
    const { data: info } = await supabase
      .from("accommodation_info")
      .select("short_name,name")
      .eq("id", accommodationId)
      .maybeSingle();
    const shortName =
      (info?.short_name && String(info.short_name).trim()) ||
      (info?.name && String(info.name).trim()) ||
      null;
    return { shortName, accommodationId };
  } catch {
    return { shortName: null, accommodationId: null };
  }
}

/**
 * 內部銷售（franchise_orders）新增成功後呼叫。
 * 1. 個人化推播給 sold_by 業務本人（若有綁定 LINE）。
 * 2. 群組廣播 event_type=franchise_order，排除已個別推播過的 line_user_id。
 */
export async function notifyFranchiseInternalOrder(params: {
  planName: string;
  customerName: string;
  soldByUserId: string;
  amount: number;
  soldAt: string | null;
}) {
  try {
    // 取得銷售人員顯示名稱與 line_user_id
    let soldByName = "未指定";
    let soldByLineUserId: string | null = null;
    try {
      const { data } = await supabase
        .from("team_member_profiles")
        .select("display_name,line_user_id")
        .eq("user_id", params.soldByUserId)
        .maybeSingle();
      if (data?.display_name) soldByName = data.display_name;
      if (data?.line_user_id) soldByLineUserId = data.line_user_id;
    } catch (err) {
      console.error("[notifyFranchiseInternalOrder] profile lookup failed:", err);
    }

    const { shortName, accommodationId } = await resolveProjectShortName(
      params.planName,
    );
    const title = shortName ?? FALLBACK_SHORT_NAME;

    const message =
      `${title}-新訂單 💰\n\n` +
      `成交日期：${fmtDate(params.soldAt)}\n` +
      `專案名稱：${params.planName}\n` +
      `成交總額：${fmtMoney(params.amount)}\n` +
      `客戶姓名：${params.customerName}\n` +
      `銷售人員：${soldByName}`;

    // 1. 個人化推播
    if (soldByLineUserId) {
      const { error: directErr } = await supabase.functions.invoke(
        "send-line-push",
        { body: { targets: [soldByLineUserId], message } },
      );
      if (directErr) {
        console.error(
          "[notifyFranchiseInternalOrder] direct push error:",
          directErr,
        );
      }
    }

    // 2. 群組廣播（排除已個別推播者）
    const { error: groupErr } = await supabase.functions.invoke(
      "send-line-push",
      {
        body: {
          event_type: "franchise_order",
          accommodation_id: accommodationId ?? undefined,
          message,
          exclude_targets: soldByLineUserId ? [soldByLineUserId] : undefined,
        },
      },
    );
    if (groupErr) {
      console.error(
        "[notifyFranchiseInternalOrder] group invoke error:",
        groupErr,
      );
    }
  } catch (err) {
    console.error("[notifyFranchiseInternalOrder] failed:", err);
  }
}

/**
 * 外部銷售（franchise_external_orders）新增成功後呼叫。
 * 僅做群組廣播。
 */
export async function notifyFranchiseExternalOrder(params: {
  projectName: string;
  customerName: string;
  salesName: string | null;
  unitCount: number;
  totalAmount: number;
  signedAt: string | null;
}) {
  try {
    const { shortName, accommodationId } = await resolveProjectShortName(
      params.projectName,
    );
    const title = shortName ?? FALLBACK_SHORT_NAME;

    const message =
      `${title}-新訂單 💰\n\n` +
      `成交日期：${fmtDate(params.signedAt)}\n` +
      `專案名稱：${params.projectName}\n` +
      `成交總額：${fmtMoney(params.totalAmount)}`;

    const { error: groupErr } = await supabase.functions.invoke(
      "send-line-push",
      {
        body: {
          event_type: "franchise_order",
          accommodation_id: accommodationId ?? undefined,
          message,
        },
      },
    );
    if (groupErr) {
      console.error(
        "[notifyFranchiseExternalOrder] group invoke error:",
        groupErr,
      );
    }
  } catch (err) {
    console.error("[notifyFranchiseExternalOrder] failed:", err);
  }
}
