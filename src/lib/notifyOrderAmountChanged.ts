import { supabase } from "@/integrations/supabase/client";

/**
 * 當 team_commission_price（分潤基準金額）被修改並儲存成功後呼叫。
 *
 * 兩段式推播：
 * 1. 個人通知：直接查 order_meta.closer_id → team_member_profiles.line_user_id，
 *    呼叫 send-line-push 的「直接指定模式」(targets) 推給該 closer 本人。
 * 2. 群組廣播：呼叫 send-line-push 的「事件廣播模式」(event_type) 推給訂閱
 *    'order_amount_changed' 的群組。
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
    // 異動人員顯示名稱
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

    // ============ 1. 個人通知：closer 本人 ============
    let closerLineUserId: string | null = null;
    try {
      const { data: orderRow } = await supabase
        .from("orders")
        .select("id")
        .eq("order_number", params.orderNumber)
        .maybeSingle();

      if (orderRow?.id) {
        const { data: metaRow } = await supabase
          .from("order_meta")
          .select("closer_id")
          .eq("order_id", orderRow.id)
          .maybeSingle();

        const closerId = metaRow?.closer_id;
        if (closerId) {
          const { data: closerProfile } = await supabase
            .from("team_member_profiles")
            .select("line_user_id")
            .eq("user_id", closerId)
            .maybeSingle();

          const lineUserId = closerProfile?.line_user_id;
          if (lineUserId) {
            closerLineUserId = lineUserId;
            const { error: directErr } = await supabase.functions.invoke(
              "send-line-push",
              {
                body: {
                  targets: [lineUserId],
                  message,
                },
              },
            );
            if (directErr) {
              console.error(
                "[notifyOrderAmountChanged] direct push error:",
                directErr,
              );
            }
          }
        }
      }
    } catch (personalErr) {
      console.error(
        "[notifyOrderAmountChanged] personal lookup failed:",
        personalErr,
      );
    }

    // ============ 2. 群組廣播（排除已個別推播的 closer，避免重複） ============
    const { error: groupErr } = await supabase.functions.invoke("send-line-push", {
      body: {
        event_type: "order_amount_changed",
        accommodation_id: params.accommodationId ?? undefined,
        message,
        exclude_targets: closerLineUserId ? [closerLineUserId] : undefined,
      },
    });
    if (groupErr) {
      console.error("[notifyOrderAmountChanged] group invoke error:", groupErr);
    }
  } catch (err) {
    console.error("[notifyOrderAmountChanged] failed:", err);
  }
}
