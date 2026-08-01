// 客服待辦（人工重新計價／改期審核）共用建立邏輯。
// 由會員自助流程在無法自動處理時呼叫，寫入 order_manual_review_tasks 並同步建立後台通知。

export type ManualReviewTaskType = "guest_count_repricing" | "date_change_request";

export interface CreateManualReviewTaskParams {
  orderId: string;
  accommodationId: string;
  orderNumber: string;
  taskType: ManualReviewTaskType;
  reasonCode?: string;
  requestedGuestCount?: number | null;
  requestedCheckIn?: string | null;
  requestedCheckOut?: string | null;
  quoteSnapshot?: Record<string, unknown>;
  requesterNote?: string | null;
}

/**
 * 建立客服待辦。若同一訂單同類型已有未結案待辦（DB unique index），
 * 會改為更新該筆待辦的申請內容，避免重複塞爆待辦清單。
 */
export async function createManualReviewTask(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  p: CreateManualReviewTaskParams,
): Promise<{ created: boolean; id: string | null }> {
  const payload = {
    order_id: p.orderId,
    accommodation_id: p.accommodationId,
    task_type: p.taskType,
    reason_code: p.reasonCode ?? p.taskType,
    requested_guest_count: p.requestedGuestCount ?? null,
    requested_check_in: p.requestedCheckIn ?? null,
    requested_check_out: p.requestedCheckOut ?? null,
    quote_snapshot: p.quoteSnapshot ?? {},
    requester_note: p.requesterNote ?? null,
    status: "pending",
  };

  let taskId: string | null = null;
  const { data, error } = await supabase
    .from("order_manual_review_tasks")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (error) {
    // 已有未結案待辦 → 更新內容
    const { data: existing } = await supabase
      .from("order_manual_review_tasks")
      .select("id")
      .eq("order_id", p.orderId)
      .eq("task_type", p.taskType)
      .in("status", ["pending", "in_progress"])
      .maybeSingle();
    if (!existing?.id) {
      console.error("[manualReviewTask] insert failed", error);
      return { created: false, id: null };
    }
    await supabase
      .from("order_manual_review_tasks")
      .update({
        requested_guest_count: payload.requested_guest_count,
        requested_check_in: payload.requested_check_in,
        requested_check_out: payload.requested_check_out,
        quote_snapshot: payload.quote_snapshot,
        requester_note: payload.requester_note,
      })
      .eq("id", existing.id);
    taskId = existing.id;
  } else {
    taskId = data?.id ?? null;
  }

  const title =
    p.taskType === "date_change_request" ? "客人申請改期，待客服處理" : "客人變更人數需重新計價";
  const description =
    p.taskType === "date_change_request"
      ? `訂單 ${p.orderNumber} 申請改期至 ${p.requestedCheckIn ?? "-"} ~ ${p.requestedCheckOut ?? "-"}`
      : `訂單 ${p.orderNumber} 申請將入住人數改為 ${p.requestedGuestCount ?? "-"} 人，需人工確認金額`;

  try {
    await supabase.from("notifications").upsert(
      {
        accommodation_id: p.accommodationId,
        order_id: p.orderId,
        type: `manual_review_${p.taskType}`,
        title,
        description,
        is_read: false,
      },
      { onConflict: "order_id,type" },
    );
  } catch (e) {
    console.error("[manualReviewTask] notification failed", e);
  }

  return { created: true, id: taskId };
}
