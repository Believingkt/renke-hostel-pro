// 奧丁丁修改信／取消信的擁有者判斷：PMS 擁有的訂單一律不套用（與推送端 owlting_is_inbound_owned 對稱）
import { matchRoomTypeByName } from "./owltingAutoOrder.ts";
import { reportOwltingSyncFailure } from "./owltingSyncAlert.ts";

export interface ObeOrder {
  id: string;
  order_number: string;
  accommodation_id: string;
  order_status: string;
  check_in_date: string;
  check_out_date: string;
  room_type_id: string | null;
  order_source: string | null;
  owlting_reservation_id: string | null;
  auto_created_from_email_id: string | null;
  owlting_sync_state: any;
}

export type OwnerCheck =
  | { kind: "none" }
  | { kind: "ota_only"; orders: ObeOrder[] }
  | { kind: "pms"; order: ObeOrder; all: ObeOrder[] }
  | { kind: "error"; error: string };

// 與 migration 20260818115452 的 owlting_is_inbound_owned 相同的三個條件（S4 對照測試）
export function isInboundOwned(o: Pick<ObeOrder, "order_source" | "owlting_reservation_id" | "auto_created_from_email_id" | "owlting_sync_state">): boolean {
  const lastAction = o.owlting_sync_state && typeof o.owlting_sync_state === "object"
    ? o.owlting_sync_state.last_action
    : null;
  return ["owlting", "hotelnabe"].includes(o.order_source ?? "")
    || o.auto_created_from_email_id != null
    || (o.owlting_reservation_id != null && (lastAction === null || lastAction === undefined));
}

export async function classifyObeOwner(admin: any, obe: string): Promise<OwnerCheck> {
  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, accommodation_id, order_status, check_in_date, check_out_date, room_type_id, order_source, owlting_reservation_id, auto_created_from_email_id, owlting_sync_state")
    .eq("owlting_reservation_id", obe)
    .order("created_at", { ascending: false });
  if (error) return { kind: "error", error: error.message };
  const all = (data ?? []) as ObeOrder[];
  if (all.length === 0) return { kind: "none" };
  const pms = all.filter((o) => !isInboundOwned(o));
  if (pms.length === 0) return { kind: "ota_only", orders: all };
  return { kind: "pms", order: pms.find((o) => o.order_status !== "cancelled") ?? pms[0], all };
}

export interface EchoMail {
  message_type: "modified" | "cancelled";
  check_in_date: string | null;
  check_out_date: string | null;
  room_type_name: string | null;
  room_quantity: number | null;
  total_amount?: number | null;
}

export interface EchoCompare { consistent: boolean; diffs: string[]; uncomparable: string[] }

export async function compareEmailWithPmsOrder(admin: any, order: ObeOrder, mail: EchoMail): Promise<EchoCompare> {
  const diffs: string[] = [];
  const uncomparable: string[] = [];
  if (mail.message_type === "cancelled") {
    if (order.order_status !== "cancelled") diffs.push(`狀態：奧丁丁＝已取消，PMS＝${order.order_status}`);
    return { consistent: diffs.length === 0, diffs, uncomparable };
  }
  if (order.order_status === "cancelled") diffs.push("狀態：奧丁丁＝有效（修改通知），PMS＝已取消");
  const cmp = (label: string, a: unknown, b: unknown) => {
    if (a === null || a === undefined) { uncomparable.push(label); return; }
    if (String(a) !== String(b)) diffs.push(`${label}：奧丁丁＝${a}，PMS＝${b ?? "—"}`);
  };
  cmp("入住日期", mail.check_in_date, order.check_in_date);
  cmp("退房日期", mail.check_out_date, order.check_out_date);

  const { data: rooms, error } = await admin
    .from("order_rooms")
    .select("room_type_id, quantity")
    .eq("order_id", order.id);
  if (error) return { consistent: false, diffs: [...diffs, `PMS 明細讀取失敗：${error.message}`], uncomparable };
  const qtyByType = new Map<string, number>();
  if (rooms && rooms.length > 0) {
    for (const r of rooms) qtyByType.set(r.room_type_id, (qtyByType.get(r.room_type_id) ?? 0) + Number(r.quantity ?? 0));
  } else if (order.room_type_id) {
    qtyByType.set(order.room_type_id, 1);
  }
  if (!mail.room_type_name) {
    uncomparable.push("房型", "間數");
  } else {
    const typeId = await matchRoomTypeByName(admin, order.accommodation_id, mail.room_type_name);
    if (!typeId || !qtyByType.has(typeId)) diffs.push(`房型：奧丁丁＝${mail.room_type_name}，PMS 無此房型`);
    else cmp("間數", mail.room_quantity, qtyByType.get(typeId));
  }
  if (uncomparable.length >= 4) diffs.push("信件欄位皆無法解析，無法確認為回音");
  return { consistent: diffs.length === 0, diffs, uncomparable };
}

export type RecordOutcomeFn = (rawId: string, outcome: "pms_echo_ignored" | "pms_echo_mismatch" | "apply_failed", detail: Record<string, unknown>) => Promise<void>;

export interface EchoDeps {
  recordOutcome: RecordOutcomeFn;
  reportFailure?: typeof reportOwltingSyncFailure;
}

// PMS 擁有：不改寫 orders、不重建 order_rooms、不建單、不取消；只比對並標記 staging，不一致才告警
export async function handlePmsOwnedEcho(admin: any, ctx: {
  rawId: string; stagingId: string; obe: string; owner: Extract<OwnerCheck, { kind: "pms" }>; mail: EchoMail;
}, deps: EchoDeps): Promise<{ consistent: boolean; diffs: string[] }> {
  const report = deps.reportFailure ?? reportOwltingSyncFailure;
  const order = ctx.owner.order;
  const r = await compareEmailWithPmsOrder(admin, order, ctx.mail);
  const ref = `${order.order_number}（OBE ${ctx.obe}）`;
  const kindLabel = ctx.mail.message_type === "cancelled" ? "取消" : "修改";
  const multi = ctx.owner.all.length > 1 ? `；同一 OBE 有 ${ctx.owner.all.length} 張訂單（${ctx.owner.all.map((o) => o.order_number).join("、")}），一律不套用` : "";
  const extra = `${r.uncomparable.length ? `；無法比對：${r.uncomparable.join("、")}` : ""}；信件金額：${ctx.mail.total_amount ?? "—"}（不比對）${multi}`;

  if (r.consistent) {
    await admin.from("owlting_email_parsed_staging").update({
      review_status: "ignored",
      auto_order_id: order.id,
      review_notes: `[PMS 回音] 奧丁丁${kindLabel}信與 PMS 訂單 ${ref} 一致，未套用${extra}`,
    }).eq("id", ctx.stagingId);
    await deps.recordOutcome(ctx.rawId, "pms_echo_ignored", { order_number: order.order_number, obe_number: ctx.obe, message_type: ctx.mail.message_type });
    return { consistent: true, diffs: [] };
  }

  await admin.from("owlting_email_parsed_staging").update({
    review_status: "pending_review",
    auto_order_id: order.id,
    review_notes: `[需人工] PMS 訂單 ${ref} 收到奧丁丁${kindLabel}信，內容不一致，未套用：${r.diffs.join("；")}${extra}`,
  }).eq("id", ctx.stagingId);
  await deps.recordOutcome(ctx.rawId, "pms_echo_mismatch", { order_number: order.order_number, obe_number: ctx.obe, message_type: ctx.mail.message_type, diffs: r.diffs });
  await report(admin, {
    functionName: "owlting-email-ingest",
    category: "owlting_pms_echo_mismatch",
    step: ctx.mail.message_type,
    summary: `PMS 訂單 ${ref} 與奧丁丁${kindLabel}通知不一致，已暫停自動套用，請人工確認：${r.diffs.join("；")}`,
    reference: ctx.obe,
    failed: [{ order_id: order.id, order_number: order.order_number, reference: ctx.obe, error: r.diffs.join("；") }],
  });
  return { consistent: false, diffs: r.diffs };
}

// 擁有者判斷失敗：保守處理，不套用並告警
export async function handleOwnerCheckError(admin: any, ctx: {
  rawId: string; stagingId: string; obe: string; error: string; messageType: "modified" | "cancelled";
}, deps: EchoDeps): Promise<void> {
  const report = deps.reportFailure ?? reportOwltingSyncFailure;
  const action = ctx.messageType === "cancelled" ? "未自動取消" : "未套用修改";
  await admin.from("owlting_email_parsed_staging").update({
    review_status: "pending_review",
    review_notes: `[需人工] 無法判斷 OBE ${ctx.obe} 的訂單擁有者，${action}：${ctx.error}`,
  }).eq("id", ctx.stagingId);
  await deps.recordOutcome(ctx.rawId, "apply_failed", { obe_number: ctx.obe, reason: "owner_check_failed", error: ctx.error });
  await report(admin, {
    functionName: "owlting-email-ingest",
    category: "owlting_pms_echo_mismatch",
    step: "owner_check",
    summary: `OBE ${ctx.obe} 擁有者判斷失敗，${action}：${ctx.error}`,
    reference: ctx.obe,
    failed: [{ order_id: null, order_number: null, reference: ctx.obe, error: ctx.error }],
  });
}
