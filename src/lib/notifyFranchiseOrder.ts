import { supabase } from "@/integrations/supabase/client";

const fmtMoney = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(Number(v))
    ? "-"
    : `NT$ ${Number(v).toLocaleString()}`;

async function resolveProjectAccommodationId(
  projectName: string | null | undefined,
): Promise<string | null> {
  const name = (projectName ?? "").trim();
  if (!name) return null;
  try {
    const { data } = await (supabase as any)
      .from("franchise_projects")
      .select("accommodation_id")
      .eq("name", name)
      .maybeSingle();
    return (data?.accommodation_id as string | null) ?? null;
  } catch {
    return null;
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

    const message =
      `🏢 特許加盟內部銷售通知\n\n` +
      `專案名稱：${params.planName}\n` +
      `客戶姓名：${params.customerName}\n` +
      `銷售人員：${soldByName}\n` +
      `金額：${fmtMoney(params.amount)}\n` +
      `簽約日期：${params.soldAt ?? "-"}`;

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
    const accommodationId = await resolveProjectAccommodationId(params.planName);
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
    const message =
      `🏢 特許加盟外部銷售通知\n\n` +
      `專案名稱：${params.projectName}\n` +
      `會員姓名：${params.customerName}\n` +
      `開發業務：${params.salesName?.trim() || "未指定"}\n` +
      `單位數：${params.unitCount}\n` +
      `總金額：${fmtMoney(params.totalAmount)}\n` +
      `簽約日期：${params.signedAt ?? "-"}`;

    const accommodationId = await resolveProjectAccommodationId(
      params.projectName,
    );
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
