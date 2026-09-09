/**
 * 訂單歷程（統一時間線）— Step 3 方案 B
 *
 * 合併四個來源，全部唯讀：
 *  1. 變更   order_change_log ＋ audit_logs(entity_type in order, order_meta)
 *  2. 付款   payment_status_history
 *  3. 押金   audit_logs(entity_type='order_deposit') ＋ deposit_charges
 *  4. 通知信 booking_email_log ＋ 團購 group_buy_payment_events(email_sent/failed)
 *
 * 重送按鈕（含團購補寄）為原 OrderNotificationHistory 的邏輯原樣搬移，
 * 呼叫的 Edge Function 名稱與 body 完全不變，不影響任何寄信路徑。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, History, Loader2, Mail, RefreshCcw } from "lucide-react";
import { formatChangeValue, getFieldLabel, type OrderFieldChange } from "@/utils/orderAuditDiff";
import { settlementLabel } from "@/lib/paidAmountSettlement";

/* ---------------- 型別 ---------------- */

export type TimelineKind = "change" | "payment" | "deposit" | "email";
export type ActorType = "user" | "system" | "unknown";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  at: string;
  actorType: ActorType;
  actorId: string | null;
  actorEmail: string | null;
  actorLabel: string | null;
  badge: { text: string; tone: string };
  summary?: string;
  changes: OrderFieldChange[];
  /** 只有變更類會用到（沿用舊 audit_logs 的 details 額外欄位） */
  details?: any;
  error?: string | null;
  /** 押金欄位需要自己的值格式化字典 */
  valueFormatter?: (field: string, v: unknown) => string;
  actorName?: string;
}

/* ---------------- 常數（自兩張舊卡片原樣搬移） ---------------- */

const SYSTEM_LABELS: Record<string, string> = {
  owlting_webhook: "OwlTing 同步",
  owlting_auto_order: "OwlTing 自動建單",
  hotelnabe_sync: "HotelNabe 同步",
  tappay_notify: "金流通知",
  refund: "退款流程",
  room_charge: "自動收款",
  unmarked_system: "系統（未標記來源）",
  system: "自動處理",
  scheduled_charge: "自動排程",
  manual: "手動操作",
};

const AUDIT_SUBTYPE_FIELD_HINT: Record<string, string[]> = {
  payment_status_change: ["payment_status"],
  order_status_change: ["order_status"],
  order_source_change: ["order_source"],
  order_deal_date_change: ["deal_date", "deal_closed_at"],
  order_date_change: ["check_in_date", "check_out_date"],
  price_edit: ["final_price", "total_price", "discount_amount"],
};

const DEDUP_TIME_WINDOW_MS = 3000;

const ACTION_LABEL: Record<string, { text: string; tone: string }> = {
  update: { text: "編輯", tone: "bg-blue-100 text-blue-700" },
  price_edit: { text: "金額修改", tone: "bg-amber-100 text-amber-700" },
  paid_discount_edit: { text: "已結清折扣修改", tone: "bg-amber-100 text-amber-700" },
  paid_addon_edit: { text: "已付款加購修改", tone: "bg-amber-100 text-amber-700" },
  cancel: { text: "取消訂單", tone: "bg-red-100 text-red-700" },
  checkin: { text: "辦理入住", tone: "bg-green-100 text-green-700" },
  checkout: { text: "辦理退房", tone: "bg-emerald-100 text-emerald-700" },
  undo_checkin: { text: "取消入住", tone: "bg-zinc-100 text-zinc-700" },
  undo_checkout: { text: "取消退房", tone: "bg-zinc-100 text-zinc-700" },
  inline_edit: { text: "編輯", tone: "bg-blue-100 text-blue-700" },
  meta_edit: { text: "行銷資訊修改", tone: "bg-purple-100 text-purple-700" },
  order_source_change: { text: "來源變更", tone: "bg-indigo-100 text-indigo-700" },
  kol_quota_override: { text: "KOL額度覆寫", tone: "bg-orange-100 text-orange-700" },
  order_date_change: { text: "訂單改期", tone: "bg-fuchsia-100 text-fuchsia-700" },
  system_update: { text: "系統自動變更", tone: "bg-slate-100 text-slate-700" },
  system_create: { text: "系統建立訂單", tone: "bg-green-100 text-green-700" },
  user_create: { text: "建立訂單", tone: "bg-green-100 text-green-700" },
};

const DEPOSIT_FIELD_LABEL: Record<string, string> = {
  deposit_required_amount: "應收押金",
  deposit_charged_amount: "已扣款金額",
  deposit_refunded_amount: "已退款金額",
  deposit_method: "收取方式",
  deposit_status: "押金狀態",
};

const DEPOSIT_VALUE_LABEL: Record<string, string> = {
  cash: "現場現金",
  card: "線上綁卡(已停用)",
  pending: "待設定",
  card_bound: "已綁卡",
  charged: "已扣款",
  partially_refunded: "部分退款",
  refunded: "已退款",
  failed: "扣款失敗",
  not_required: "不需押金",
};

export function formatDepositValue(_field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return `NT$${value.toLocaleString()}`;
  return DEPOSIT_VALUE_LABEL[String(value)] || String(value);
}

const STATUS_LABEL: Record<string, string> = {
  unpaid: "未付款",
  pending_payment: "待付款",
  deposit_paid: "已付訂金",
  partial: "部分付款",
  paid: "已付清",
  refunded: "已退款",
  cancelled: "已取消",
};

const EMAIL_TYPE_LABEL: Record<string, string> = {
  booking_confirmation: "訂房確認通知",
  deposit_received: "訂金已收到",
  full_payment_received: "訂房確認・已完成全額付款",
  final_payment_received: "尾款已收到",
  order_cancelled: "訂單取消通知",
  booking_pending: "團購訂房成立・待匯款",
  venue_new_order: "民宿端・新團購訂單",
  guest_reported_transfer: "民宿端・客人回報匯款",
  order_expired: "團購逾期取消通知",
  refund_completed: "退款完成通知",
  cancel_request_received: "已收到取消申請",
};

const GROUP_BUY_RECIPIENT_LABEL: Record<string, string> = {
  guest: "旅客",
  venue: "民宿／管理者",
};

const EMAIL_STATUS_LABEL: Record<string, string> = {
  sent: "已寄出",
  failed: "寄送失敗",
  resent: "已重送",
  pending: "寄送中",
};

const EMAIL_STATUS_TONE: Record<string, string> = {
  sent: "bg-teal-100 text-teal-700",
  resent: "bg-teal-100 text-teal-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-zinc-100 text-zinc-700",
};

const TRIGGER_SOURCE_LABEL: Record<string, string> = {
  manual_resend: "手動重送",
  auto_final_payment: "系統自動（付款）",
  auto_deposit: "系統自動（訂金入帳）",
  date_change: "改期重寄",
  member_cancel: "會員自行取消",
  atm_notify: "ATM 入帳通知",
};

type ResendType = "booking_confirmation" | "deposit_received" | "final_payment_received";

export const FILTERS: { key: "all" | TimelineKind; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "change", label: "變更" },
  { key: "payment", label: "付款" },
  { key: "deposit", label: "押金" },
  { key: "email", label: "通知信" },
];

function parseGroupBuyNote(note: string | null) {
  const get = (key: string) => note?.match(new RegExp(`${key}:([^／/\\s]+)`))?.[1] ?? null;
  return {
    recipientType: get("recipient_type"),
    templateType: get("template_type"),
    reason: note?.match(/reason:(.+)$/)?.[1] ?? null,
    isResend: /resend:true/.test(note ?? ""),
  };
}

function getActionLabel(details: any, action_type: string) {
  const subtype = details?.type;
  if (subtype && ACTION_LABEL[subtype]) return ACTION_LABEL[subtype];
  return ACTION_LABEL[action_type] || { text: action_type, tone: "bg-zinc-100 text-zinc-700" };
}

function auditFieldHints(details: any): string[] | null {
  const t = details?.type;
  if (typeof t === "string" && AUDIT_SUBTYPE_FIELD_HINT[t]) return AUDIT_SUBTYPE_FIELD_HINT[t];
  return null;
}

function auditHasDisplayableDetail(details: any): boolean {
  if (!details || typeof details !== "object") return false;
  if (Array.isArray(details.changes) && details.changes.length > 0) return true;
  return Boolean(details.reason || details.old || details.new);
}

/* ---------------- 純函式：四來源 → TimelineItem ---------------- */

export function buildTimelineItems(input: {
  auditOrder: any[];
  changeLog: any[];
  payments: any[];
  depositAudits: any[];
  depositCharges: any[];
  emails: any[];
}): TimelineItem[] {
  /* 1. 變更：沿用 OrderAuditLogCard 的 txid 收斂與 3 秒去重 */
  const auditRows = (input.auditOrder || []).map((r) => ({
    id: `a_${r.id}`,
    entity_type: r.entity_type,
    user_id: r.user_id as string | null,
    user_email: r.user_email as string | null,
    action_type: r.action_type as string,
    details: r.details,
    created_at: r.created_at as string,
  }));

  const grouped = new Map<string, any[]>();
  for (const r of input.changeLog || []) {
    const key = `${r.txid}|${r.actor_id ?? r.actor_label ?? ""}|${r.source ?? ""}`;
    grouped.set(key, [...(grouped.get(key) || []), r]);
  }
  const changeRows = [...grouped.values()].map((group) => {
    const first = group[group.length - 1];
    const merged = new Map<string, any>();
    for (const r of [...group].reverse()) {
      for (const c of ((r.changed_fields || []) as any[])) {
        const prev = merged.get(c.field);
        merged.set(c.field, prev ? { ...c, from: prev.from } : c);
      }
    }
    const changes: OrderFieldChange[] = [...merged.values()].map((c: any) => ({
      field: c.field,
      label: getFieldLabel(c.field),
      before: "changed" in c ? "（有更動）" : c.from,
      after: "changed" in c ? "（已更新）" : c.to,
    })) as OrderFieldChange[];
    return {
      id: `c_${first.id}`,
      user_id: first.actor_id as string | null,
      user_email: first.actor_email as string | null,
      action_type:
        first.actor_type === "user"
          ? first.op === "insert" ? "user_create" : "update"
          : first.op === "insert" ? "system_create" : "system_update",
      actor_type: (first.actor_type || "unknown") as ActorType,
      details: {
        changes,
        source: first.source === "unmarked" ? undefined : first.source,
        reason: first.reason || undefined,
        actor_type: first.actor_type,
        actor_label: first.actor_label,
      },
      created_at: first.changed_at as string,
    };
  });

  const dedupedAuditRows = auditRows.filter((a) => {
    if (a.entity_type !== "order") return true;
    if (auditHasDisplayableDetail(a.details)) return true;
    const hints = auditFieldHints(a.details);
    if (!hints) return true;
    const aTime = +new Date(a.created_at);
    return !changeRows.some((c) => {
      if (a.user_id && c.user_id && a.user_id !== c.user_id) return false;
      if (Math.abs(+new Date(c.created_at) - aTime) > DEDUP_TIME_WINDOW_MS) return false;
      const cFields = (Array.isArray(c.details?.changes) ? c.details.changes : []).map((x: any) => x?.field);
      return hints.some((f) => cFields.includes(f));
    });
  });

  const changeItems: TimelineItem[] = [
    ...dedupedAuditRows.map<TimelineItem>((r) => ({
      id: r.id,
      kind: "change",
      at: r.created_at,
      actorType: r.user_id ? "user" : "system",
      actorId: r.user_id,
      actorEmail: r.user_email,
      actorLabel: null,
      badge: getActionLabel(r.details, r.action_type),
      changes: Array.isArray(r.details?.changes) ? r.details.changes : [],
      details: r.details,
    })),
    ...changeRows.map<TimelineItem>((r) => ({
      id: r.id,
      kind: "change",
      at: r.created_at,
      actorType: r.actor_type === "user" ? "user" : r.actor_type === "system" ? "system" : "unknown",
      actorId: r.user_id,
      actorEmail: r.user_email,
      actorLabel: r.details?.actor_label ?? null,
      badge: getActionLabel(r.details, r.action_type),
      changes: r.details.changes,
      details: r.details,
    })),
  ];

  /* 2. 付款：actor 以 changed_by 判斷（source 全庫恆為 'system'，不再當作 actor 標籤） */
  const paymentItems: TimelineItem[] = (input.payments || []).map((p) => ({
    id: `p_${p.id}`,
    kind: "payment",
    at: p.created_at,
    actorType: p.changed_by ? "user" : "system",
    actorId: p.changed_by ?? null,
    actorEmail: null,
    actorLabel: p.changed_by ? null : (p.source || "system"),
    badge: { text: "付款狀態", tone: "bg-green-100 text-green-700" },
    summary:
      `${STATUS_LABEL[p.from_status || ""] || p.from_status || "—"} → ` +
      `${STATUS_LABEL[p.to_status] || p.to_status}` +
      `（已付 NT$${Number(p.paid_amount || 0).toLocaleString()} / 總額 NT$${Number(p.final_price || 0).toLocaleString()}）`,
    changes: [],
  }));

  /* 3a. 押金設定異動 */
  const depositItems: TimelineItem[] = (input.depositAudits || []).map((a) => ({
    id: `d_${a.id}`,
    kind: "deposit",
    at: a.created_at,
    actorType: a.user_id ? "user" : "system",
    actorId: a.user_id ?? null,
    actorEmail: a.user_email ?? null,
    actorLabel: a.user_id ? null : "scheduled_charge",
    badge: { text: "押金設定異動", tone: "bg-sky-100 text-sky-700" },
    changes: Object.entries((a.details ?? {}) as Record<string, any>).map(([field, v]) => ({
      field,
      label: DEPOSIT_FIELD_LABEL[field] || getFieldLabel(field),
      before: v?.from,
      after: v?.to,
    })) as OrderFieldChange[],
    valueFormatter: formatDepositValue,
  }));

  /* 3b. 押金扣款／退款 */
  const chargeItems: TimelineItem[] = (input.depositCharges || []).map((c) => ({
    id: `dc_${c.id}`,
    kind: "deposit",
    at: c.created_at,
    actorType: c.performed_by ? "user" : "system",
    actorId: c.performed_by ?? null,
    actorEmail: null,
    actorLabel: c.performed_by ? null : (c.trigger_source === "scheduled" ? "scheduled_charge" : "manual"),
    badge: {
      text: c.action === "charge" ? "押金扣款" : "押金退款",
      tone: c.status === "success" ? "bg-sky-100 text-sky-700" : "bg-red-100 text-red-700",
    },
    summary:
      `NT$${Number(c.amount || 0).toLocaleString()}（` +
      `${c.trigger_source === "scheduled" ? "自動排程" : "手動"}・${c.status === "success" ? "成功" : "失敗"}）`,
    changes: [],
    error: c.error_message ?? null,
  }));

  /* 4. 通知信 */
  const emailItems: TimelineItem[] = (input.emails || []).map((e) => ({
    id: `m_${e.id}`,
    kind: "email",
    at: e.created_at,
    actorType: e.triggered_by ? "user" : "system",
    actorId: typeof e.triggered_by === "string" && /^[0-9a-f-]{36}$/i.test(e.triggered_by) ? e.triggered_by : null,
    actorEmail: null,
    actorLabel: e.trigger_source || "system",
    badge: {
      text: EMAIL_STATUS_LABEL[e.status] || e.status,
      tone: EMAIL_STATUS_TONE[e.status] || "bg-zinc-100 text-zinc-700",
    },
    summary:
      `${EMAIL_TYPE_LABEL[e.email_type] || e.email_type} → ${e.recipient}` +
      (e.trigger_source ? `（${TRIGGER_SOURCE_LABEL[e.trigger_source] || e.trigger_source}）` : ""),
    changes: [],
    error: e.error_message ?? null,
  }));

  return [...changeItems, ...paymentItems, ...depositItems, ...chargeItems, ...emailItems].sort(
    (a, b) => +new Date(b.at) - +new Date(a.at),
  );
}

export function mapGroupBuyEmailEvents(rows: any[]) {
  return (rows || []).map((row: any) => {
    const info = parseGroupBuyNote(row.note);
    return {
      id: row.id,
      email_type: info.templateType ?? "group_buy_email",
      recipient: GROUP_BUY_RECIPIENT_LABEL[info.recipientType ?? ""] ?? info.recipientType ?? "—",
      subject: null,
      status: row.event_type === "email_sent" ? (info.isResend ? "resent" : "sent") : "failed",
      resend_id: null,
      error_message: row.event_type === "email_failed" ? info.reason : null,
      triggered_by: row.actor_label ?? null,
      trigger_source: info.isResend ? "manual_resend" : null,
      created_at: row.created_at,
    };
  });
}

export function resolveActorName(item: TimelineItem, nameMap: Record<string, string>) {
  if (item.actorType === "user") {
    return (item.actorId && nameMap[item.actorId]) || item.actorEmail || "未知使用者";
  }
  return `系統・${SYSTEM_LABELS[item.actorLabel ?? ""] ?? item.actorLabel ?? "自動處理"}`;
}

/* ---------------- 元件 ---------------- */

interface Props {
  orderId: string;
  orderNumber?: string;
  canManage?: boolean;
  orderSource?: string | null;
  paymentMethod?: string | null;
  refreshKey?: string | number;
}

export default function OrderTimelineCard({
  orderId, orderNumber, canManage = false, orderSource = null, paymentMethod = null, refreshKey,
}: Props) {
  const isGroupBuy = orderSource === "group_buy";
  const isCardOrder = typeof paymentMethod === "string" && /credit|card|tappay/i.test(paymentMethod);

  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | TimelineKind>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [resendingType, setResendingType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, e, d, c, auditRes, changeRes] = await Promise.all([
      supabase.from("payment_status_history")
        .select("id, from_status, to_status, paid_amount, final_price, source, changed_by, notes, created_at")
        .eq("order_id", orderId).order("created_at", { ascending: false }),
      supabase.from("booking_email_log")
        .select("id, email_type, recipient, subject, status, resend_id, error_message, triggered_by, trigger_source, created_at")
        .eq("order_id", orderId).order("created_at", { ascending: false }),
      supabase.from("audit_logs")
        .select("id, user_id, user_email, details, created_at")
        .eq("entity_type", "order_deposit").eq("entity_id", orderId)
        .order("created_at", { ascending: false }).limit(50),
      supabase.from("deposit_charges")
        .select("id, action, amount, status, trigger_source, error_message, performed_by, created_at")
        .eq("order_id", orderId).order("created_at", { ascending: false }).limit(50),
      supabase.from("audit_logs")
        .select("id, user_id, user_email, action_type, details, created_at, entity_type")
        .in("entity_type", ["order", "order_meta"]).eq("entity_id", orderId)
        .order("created_at", { ascending: false }),
      supabase.from("order_change_log")
        .select("id, op, actor_type, actor_id, actor_email, actor_label, reason, source, changed_fields, txid, changed_at")
        .eq("order_id", orderId).order("changed_at", { ascending: false }),
    ]);

    let emailRows: any[] = (e.data ?? []) as any[];
    if (isGroupBuy) {
      const { data: gb } = await supabase.from("group_buy_payment_events")
        .select("id, event_type, actor_label, note, created_at")
        .eq("order_id", orderId).in("event_type", ["email_sent", "email_failed"])
        .order("created_at", { ascending: false }).limit(50);
      emailRows = [...mapGroupBuyEmailEvents(gb ?? []), ...emailRows];
    }

    const built = buildTimelineItems({
      auditOrder: (auditRes.data ?? []) as any[],
      changeLog: (changeRes.data ?? []) as any[],
      payments: (p.data ?? []) as any[],
      depositAudits: (d.data ?? []) as any[],
      depositCharges: (c.data ?? []) as any[],
      emails: emailRows,
    });

    const userIds = Array.from(new Set(built.map((i) => i.actorId).filter(Boolean))) as string[];
    let nameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profs } = await supabase.from("profiles").select("id, name").in("id", userIds);
      nameMap = Object.fromEntries((profs ?? []).map((x: any) => [x.id, x.name]));
    }
    setItems(built.map((i) => ({ ...i, actorName: resolveActorName(i, nameMap) })));
    setLoading(false);
  }, [orderId, isGroupBuy, refreshKey]);

  useEffect(() => { load(); }, [load]);

  /* 以下兩支與原 OrderNotificationHistory 逐字相同（函式簽章、Edge Function 名稱、body 不變） */
  const resend = async (emailType: ResendType) => {
    setResendingType(emailType);
    try {
      const { data, error } = await supabase.functions.invoke("admin-resend-booking-email", {
        body: { orderId, emailType },
      });
      if (error) throw error;
      if ((data as any)?.success === false || (data as any)?.error) {
        throw new Error((data as any)?.error || "寄送失敗");
      }
      toast.success(`${EMAIL_TYPE_LABEL[emailType]} 已重新寄出`);
      await load();
    } catch (err: any) {
      toast.error(`重送失敗：${err?.message || "unknown"}`);
    } finally {
      setResendingType(null);
    }
  };

  const resendGroupBuy = async (
    target: "guest" | "venue",
    guestTemplate: "auto" | "booking_pending" | "deposit_received" | "full_payment" = "auto",
    key = `gb_${target}`,
  ) => {
    setResendingType(key);
    try {
      const { data, error } = await supabase.functions.invoke("group-buy-resend-notification", {
        body: { orderIds: [orderId], targets: [target], guestTemplate },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const entry = (data as any)?.results?.[0]?.[target];
      if (entry && entry.ok === false) throw new Error(entry.reason || "寄送失敗");
      toast.success(target === "guest" ? "旅客通知信已補寄" : "民宿通知信已補寄");
      await load();
    } catch (err: any) {
      toast.error(`補寄失敗：${err?.message || "unknown"}`);
    } finally {
      setResendingType(null);
    }
  };

  const counts = useMemo(() => ({
    all: items.length,
    change: items.filter((i) => i.kind === "change").length,
    payment: items.filter((i) => i.kind === "payment").length,
    deposit: items.filter((i) => i.kind === "deposit").length,
    email: items.filter((i) => i.kind === "email").length,
  }), [items]);

  const filtered = filter === "all" ? items : items.filter((i) => i.kind === filter);
  const displayed = showAll ? filtered : filtered.slice(0, 15);

  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            訂單歷程
            {orderNumber && <span className="text-xs text-muted-foreground font-normal">#{orderNumber}</span>}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={load} disabled={loading} aria-label="重新整理">
              <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
            {canManage && (isGroupBuy ? (
              <>
                {isCardOrder ? (
                  <ResendButton
                    label="補寄旅客通知信：全額付款完成"
                    description="重新寄出「訂房確認・已完成付款」通知（信用卡全額付款版本，入住當天無需再付款）。"
                    loading={resendingType === "gb_guest_full"}
                    onConfirm={() => resendGroupBuy("guest", "full_payment", "gb_guest_full")}
                  />
                ) : (
                  <>
                    <ResendButton
                      label="補寄旅客通知信：訂房成立・待匯款"
                      description="重新寄出「團購訂房成立・待匯款」通知（含匯款帳號與付款期限）。"
                      loading={resendingType === "gb_guest_booking_pending"}
                      onConfirm={() => resendGroupBuy("guest", "booking_pending", "gb_guest_booking_pending")}
                    />
                    <ResendButton
                      label="補寄旅客通知信：訂金已收到"
                      description="重新寄出「訂房確認・已收到訂金」通知（尾款現場付清版本）。"
                      loading={resendingType === "gb_guest_deposit"}
                      onConfirm={() => resendGroupBuy("guest", "deposit_received", "gb_guest_deposit")}
                    />
                  </>
                )}
                <ResendButton
                  label="補寄民宿通知信"
                  description="重新寄出團購新訂單通知給民宿／管理者收件人。"
                  loading={resendingType === "gb_venue"}
                  onConfirm={() => resendGroupBuy("venue")}
                />
              </>
            ) : (
              <>
                <ResendButton
                  label="重送訂房確認"
                  emailType="booking_confirmation"
                  loading={resendingType === "booking_confirmation"}
                  onConfirm={() => resend("booking_confirmation")}
                />
                <ResendButton
                  label="重送訂金通知"
                  emailType="deposit_received"
                  loading={resendingType === "deposit_received"}
                  onConfirm={() => resend("deposit_received")}
                />
                <ResendButton
                  label="重送尾款通知"
                  emailType="final_payment_received"
                  loading={resendingType === "final_payment_received"}
                  onConfirm={() => resend("final_payment_received")}
                />
              </>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              disabled={counts[f.key] === 0 && f.key !== "all"}
              onClick={() => { setFilter(f.key); setShowAll(false); }}
              className="h-7 px-2.5 text-xs"
            >
              {f.label} {counts[f.key]}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-sm text-muted-foreground py-3 flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 載入中…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-2">尚無紀錄</p>
        ) : (
          <div className="space-y-2" data-testid="timeline-list">
            {displayed.map((item) => {
              const isPaidAmountEdit =
                item.details?.type === "paid_discount_edit" || item.details?.type === "paid_addon_edit";
              const changes = (item.changes || [])
                .filter((c) => !(isPaidAmountEdit && ["custom_addon_details", "notes", "__notes_visible"].includes(c.field)))
                .filter((c) => !(c.field === "addon_note_changed" && (c as any).after !== true));
              const hasDetail =
                changes.length > 0 || item.details?.reason || item.details?.old || item.details?.new || item.error;
              const isOpen = expanded.has(item.id);
              const ts = new Date(item.at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
              const fmt = item.valueFormatter ?? formatChangeValue;
              return (
                <div key={item.id} className="border rounded-md" data-testid="timeline-item" data-kind={item.kind}>
                  <button
                    type="button"
                    onClick={() => hasDetail && toggle(item.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left ${hasDetail ? "hover:bg-muted/50" : "cursor-default"}`}
                  >
                    {hasDetail ? (
                      isOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    ) : <span className="w-4 flex-shrink-0" />}
                    <Badge className={`${item.badge.tone} hover:${item.badge.tone} flex-shrink-0`}>
                      {item.badge.text}
                    </Badge>
                    <span className="text-sm font-medium truncate">{item.actorName}</span>
                    {item.summary && (
                      <span className="text-xs text-muted-foreground truncate">· {item.summary}</span>
                    )}
                    {changes.length > 0 && (
                      <span className="text-xs text-muted-foreground flex-shrink-0">· 變更 {changes.length} 項</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground flex-shrink-0 tabular-nums">{ts}</span>
                  </button>
                  {isOpen && hasDetail && (
                    <div className="border-t bg-muted/30 px-3 py-2 space-y-1.5">
                      {isPaidAmountEdit && (
                        <div className="text-xs space-y-1 pb-1">
                          {item.details?.source && (
                            <div><span className="text-muted-foreground">來源：</span>{String(item.details.source)}</div>
                          )}
                          {item.details?.settlement_handling && (
                            <div>
                              <span className="text-muted-foreground">差額處理方式：</span>
                              {settlementLabel(String(item.details.settlement_handling))}
                            </div>
                          )}
                          {item.details?.difference_note && (
                            <div className="text-muted-foreground">{String(item.details.difference_note)}</div>
                          )}
                          {(item.details?.payment_status_before || item.details?.order_status || item.details?.refund_status) && (
                            <div className="text-muted-foreground">
                              當時狀態：付款 {String(item.details?.payment_status_before ?? "—")}
                              ／訂單 {String(item.details?.order_status ?? "—")}
                              ／退款 {String(item.details?.refund_status ?? "none")}
                            </div>
                          )}
                        </div>
                      )}
                      {changes.map((c, i) => {
                        if (c.field === "addon_note_changed") {
                          return (
                            <div key={i} className="text-xs flex flex-wrap items-center gap-1.5">
                              <span className="text-muted-foreground">額外現場加購備註：</span>
                              <span className="break-words">有更動（舊紀錄未保存內容）</span>
                            </div>
                          );
                        }
                        const isDetailedText = ["__notes_visible", "notes", "meal_plan_details", "custom_addon_details", "addon_note", "extra_addon_note"].includes(c.field);
                        if (isDetailedText) {
                          return (
                            <div key={i} className="text-xs space-y-1 pt-1">
                              <div className="text-muted-foreground font-medium">{c.label || getFieldLabel(c.field)}</div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                <div className="rounded border bg-background/60 p-2">
                                  <div className="text-[10px] text-muted-foreground mb-1">變更前</div>
                                  <pre className="whitespace-pre-wrap break-words font-sans text-xs text-muted-foreground line-through decoration-muted-foreground/40">
{formatChangeValue(c.field, c.before) || "(空)"}
                                  </pre>
                                </div>
                                <div className="rounded border bg-background p-2">
                                  <div className="text-[10px] text-muted-foreground mb-1">變更後</div>
                                  <pre className="whitespace-pre-wrap break-words font-sans text-xs font-medium">
{formatChangeValue(c.field, c.after) || "(空)"}
                                  </pre>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={i} className="text-xs flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground">{c.label || getFieldLabel(c.field)}：</span>
                            <span className="line-through text-muted-foreground break-all">{fmt(c.field, c.before)}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-medium break-all">{fmt(c.field, c.after)}</span>
                          </div>
                        );
                      })}
                      {item.details?.old && item.details?.new && changes.length === 0 && (
                        <div className="text-xs space-y-1">
                          {Object.keys(item.details.new).map((k) => {
                            const oldV = item.details.old?.[k];
                            const newV = item.details.new?.[k];
                            if (oldV === newV) return null;
                            return (
                              <div key={k} className="flex flex-wrap items-center gap-1.5">
                                <span className="text-muted-foreground">{getFieldLabel(k)}：</span>
                                <span className="line-through text-muted-foreground">{formatChangeValue(k, oldV)}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-medium">{formatChangeValue(k, newV)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {item.details?.source && (
                        <div className="text-xs text-muted-foreground pt-1">來源：{item.details.source}</div>
                      )}
                      {item.details?.reason && (
                        <div className="text-xs text-muted-foreground pt-1 border-t border-border/50">
                          原因：{item.details.reason}
                        </div>
                      )}
                      {item.error && (
                        <div className="text-xs text-destructive break-all">錯誤：{item.error}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {filtered.length > 15 && (
              <div className="text-center pt-1">
                <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "收合" : `顯示全部 ${filtered.length} 筆`}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResendButton({
  label, emailType, description, loading, onConfirm,
}: {
  label: string;
  emailType?: string;
  description?: string;
  loading: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Mail className="h-3.5 w-3.5 mr-1" />}
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>確認重送 {label}？</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? (
              <>
                將重新寄送 <strong>{EMAIL_TYPE_LABEL[emailType ?? ""] || emailType}</strong> 給訂單客人。此動作不會影響付款流程。
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>確認寄送</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
