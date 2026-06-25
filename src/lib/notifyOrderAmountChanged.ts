import { supabase } from "@/integrations/supabase/client";

/**
 * 當 team_commission_price（分潤基準金額）被修改並儲存成功後呼叫，
 * 透過 send-line-push Edge Function 推送 LINE 通知給 closer 與
 * 訂閱 'order_amount_changed' 事件的群組。
 *
 * 任何錯誤都會被吞掉並 console.error，不會中斷呼叫端流程。
 */
export async function notifyOrderAmountChanged(params: {
  orderNumber: string;
  guestName: string;
  accommodationId: string | null;
  accommodationName: string;
  previousAmount: number | null;
  newAmount: number | null;
  changedByUserId: string | null;
}) {
  try {
    let displayName = "未知";
    if (params.changedByUserId) {
      const { data } = await supabase
        .from("team_member_profiles")
        .select("display_name")
        .eq("user_id", params.changedByUserId)
        .maybeSingle();
      if (data?.display_name) displayName = data.display_name;
    }

    const fmt = (v: number | null) =>
      v === null || v === undefined || Number.isNaN(Number(v))
        ? "-"
        : `NT$ ${Number(v).toLocaleString()}`;

    const message =
      `💰 分潤基準金額異動通知\n\n` +
      `訂單編號：${params.orderNumber}\n` +
      `館別：${params.accommodationName}\n` +
      `客戶姓名：${params.guestName}\n` +
      `原金額：${fmt(params.previousAmount)}\n` +
      `新金額：${fmt(params.newAmount)}\n` +
      `異動人員：${displayName}`;

    const { error } = await supabase.functions.invoke("send-line-push", {
      body: {
        event_type: "order_amount_changed",
        roles: ["closer"],
        accommodation_id: params.accommodationId ?? undefined,
        message,
      },
    });
    if (error) {
      console.error("[notifyOrderAmountChanged] invoke error:", error);
    }
  } catch (err) {
    console.error("[notifyOrderAmountChanged] failed:", err);
  }
}
