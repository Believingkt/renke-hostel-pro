import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupBuyPageContentTab } from "@/components/admin/GroupBuyPageContentTab";
import { GroupBuyNotificationSettings } from "@/components/admin/GroupBuyNotificationSettings";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAccommodation } from "@/contexts/AccommodationContext";
import { DateField, DateTimeField } from "@/components/admin/DateFields";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { CoverCropEditor } from "@/components/admin/CoverCropEditor";
import { resolveCoverFocus } from "@/lib/coverFocus";

import { GroupBuyVenueIntroEditor } from "@/components/admin/GroupBuyVenueIntroEditor";
import { FeaturedFacilityPicker, FeaturedPhotoPicker } from "@/components/admin/GroupBuyFeaturedPickers";

import { ensureGroupBuyVenueIntroDefaults } from "@/lib/groupBuyVenueIntro";
import { CampaignWindowSummary } from "@/components/admin/CampaignWindowSummary";
import { hasErrors, validateCampaignWindow } from "@/lib/groupBuyDateRules";
import { Checkbox } from "@/components/ui/checkbox";
import { Banknote, Copy, CopyPlus, ExternalLink, History, Loader2, Megaphone, Plus, RefreshCw, Trash2, Undo2 } from "lucide-react";
import {
  DEPOSIT_STATE_LABEL,
  DEPOSIT_STATE_VARIANT,
  REFUND_STATE_LABEL,
  REFUND_STATE_VARIANT,
  canProcessRefund,
  depositState,
  paymentProviderLabel,
  refundState,
  remainingRefundable,
} from "@/lib/groupBuyPayment";
import { nextCopyName } from "@/lib/groupBuyPackageCopy";
import GroupBuyPriceSnapshot, { type PriceSnapshot } from "@/components/groupbuy/GroupBuyPriceSnapshot";
import { GroupBuyBookingNoticeSnapshotView } from "@/components/admin/GroupBuyBookingNoticeSnapshotView";
import { Link, useSearchParams } from "react-router-dom";
import GroupBuyPackagePricingFields from "@/components/groupbuy/GroupBuyPackagePricingFields";
import MultiImageUploadField from "@/components/admin/MultiImageUploadField";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import GroupBuyExcludedDatesField from "@/components/groupbuy/GroupBuyExcludedDatesField";
import { GroupBuyCampaignDangerZone } from "@/components/admin/GroupBuyCampaignDangerZone";
import GroupBuyPackageCard from "@/components/admin/GroupBuyPackageCard";
import GroupBuyAnalyticsTab from "@/components/admin/GroupBuyAnalyticsTab";
import GroupBuyCommissionStatusPanel from "@/components/admin/GroupBuyCommissionStatusPanel";
import GroupBuyCommissionRateDialog, { type CommissionRateApplyMode } from "@/components/admin/GroupBuyCommissionRateDialog";
import { buildAnalyticsRows, type CommissionRecord } from "@/lib/groupBuyAnalytics";



interface EventRow {
  id: string;
  order_id: string;
  event_type: string;
  amount: number | null;
  account_last5: string | null;
  transferred_at: string | null;
  actor_user_id: string | null;
  actor_label: string | null;
  note: string | null;
  created_at: string;
}

const EVENT_LABEL: Record<string, string> = {
  order_created: "訂單建立",
  guest_reported: "旅客回報已匯款",
  admin_confirmed: "後台確認收到訂金",
  expired: "逾期自動取消",
  cancelled: "訂單取消",
  refunded: "已退款",
  refund_failed: "退款失敗",
  email_sent: "通知信已寄出",
  email_failed: "通知信寄送失敗",
  cancel_requested: "旅客申請取消",
  cancel_request_rejected: "取消申請未通過",
  note: "備註",
  booking_notice_snapshot_failed: "訂房須知快照建立失敗",
};

const EVENT_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  order_created: "outline",
  guest_reported: "secondary",
  admin_confirmed: "default",
  expired: "destructive",
  cancelled: "destructive",
  refunded: "secondary",
  refund_failed: "destructive",
  email_sent: "outline",
  email_failed: "destructive",
  cancel_requested: "destructive",
  booking_notice_snapshot_failed: "destructive",
  cancel_request_rejected: "outline",
  note: "outline",

};

const fmtTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("zh-TW", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(iso))
    : "—";

const twd = (n: number) => `NT$ ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

interface Campaign {
  id: string;
  /** 團購頁顯示用：指定 FAQ／訂房須知項目與順序（null＝全部顯示） */
  faq_item_ids?: string[] | null;
  booking_notice_keys?: string[] | null;
  accommodation_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description_html: string | null;
  cover_image_url: string | null;
  cover_focus_x?: number | null;
  cover_focus_y?: number | null;
  cover_zoom?: number | null;
  cover_focus_x_mobile?: number | null;
  cover_focus_y_mobile?: number | null;
  cover_zoom_mobile?: number | null;

  kol_display_name: string | null;
  discount_code: string | null;
  sale_start: string | null;
  sale_end: string | null;
  stay_start_date: string | null;
  stay_end_date: string | null;
  status: string;
  is_archived?: boolean | null;

  deposit_percentage: number;
  payment_deadline_hours: number;
  payment_method: string | null;
  commission_rate: number;
  contact_note: string | null;
  terms_html: string | null;
  terms_highlights: string[] | null;
  highlight_points: string[] | null;
  featured_facilities: string[] | null;
  featured_photo_urls: string[] | null;
}

interface PackageRow {
  id: string;
  campaign_id: string;
  room_type_id: string | null;
  room_type_ids: string[] | null;
  display_name: string;
  description: string | null;
  short_summary: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  group_buy_price: number;
  weekday_price: number | null;
  peak_price: number | null;
  holiday_price: number | null;
  disabled_date_types: ("weekday" | "peak" | "holiday")[] | null;
  excluded_dates: string[] | null;
  original_price: number | null;
  max_quantity: number | null;
  /** 方案最多入住人數；NULL＝沿用房型 capacity */
  max_guests: number | null;

  sort_order: number;
  is_active: boolean;
}

interface BankRow {
  id: string;
  campaign_id: string;
  bank_name: string;
  bank_code: string | null;
  branch_name: string | null;
  account_name: string;
  account_number: string;
  note: string | null;
  is_default: boolean;
}

interface OrderRow {
  id: string;
  order_number: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string | null;
  check_in_date: string;
  check_out_date: string;
  room_quantity: number;
  guest_count: number | null;
  adult_count: number | null;
  child_count: number | null;
  toddler_count: number | null;
  infant_count: number | null;
  final_price: number;
  deposit_amount: number;
  paid_amount: number | null;
  order_status: string;
  payment_status: string;
  order_date: string;
  refund_status: string | null;
  refunded_amount: number | null;
  refunded_at: string | null;
  payment_provider?: string | null;
  campaign_id?: string | null;
  reported?: boolean;
  cancelRequested?: boolean;

}

const emptyCampaign = (accommodationId: string): Partial<Campaign> => ({
  accommodation_id: accommodationId,
  slug: "",
  title: "",
  status: "draft",
  deposit_percentage: 30,
  payment_deadline_hours: 72,
  commission_rate: 0,
});

export default function AdminGroupBuy() {
  const { currentAccommodationId } = useAccommodation();
  const accommodationId = currentAccommodationId ?? null;
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  /** Email 深連結：?campaignId=&tab=orders&orderNumber= */
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<string>(() => searchParams.get("tab") || "orders");
  const highlightOrderNumber = (searchParams.get("orderNumber") || "").trim().toUpperCase();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  /** 訂單價格快照（group_buy_commissions.price_snapshot），僅供稽核檢視 */
  const [snapshots, setSnapshots] = useState<Record<string, PriceSnapshot | null>>({});
  /** 分潤快照（唯一 Source of Truth） */
  const [commissions, setCommissions] = useState<CommissionRecord[]>([]);
  const [auditTarget, setAuditTarget] = useState<OrderRow | null>(null);
  /** 修改分潤比例的確認彈窗 */
  const [rateDialog, setRateDialog] = useState<{ oldRate: number; newRate: number } | null>(null);
  const [roomTypes, setRoomTypes] = useState<{ id: string; name: string }[]>([]);

  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<OrderRow | null>(null);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<OrderRow | null>(null);
  const [cancelRefundAction, setCancelRefundAction] = useState<"mark_refunded" | "pending_refund" | "no_refund">("pending_refund");
  const [cancelRefundAmount, setCancelRefundAmount] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  /** 人工退款（已取消訂單補登退款） */
  const [refundTarget, setRefundTarget] = useState<OrderRow | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [refunding, setRefunding] = useState(false);

  const activeCampaign = useMemo(
    () => campaigns.find((c) => c.id === activeId) ?? null,
    [campaigns, activeId],
  );

  /** 活動表單即時日期驗證 */
  const editErrors = useMemo(() => (editing ? validateCampaignWindow(editing) : {}), [editing]);
  const editHasDateError = hasErrors(editErrors);



  const loadCampaigns = useCallback(async () => {
    if (!accommodationId) return;
    setLoading(true);
    const { data } = await supabase
      .from("group_buy_campaigns")
      .select("*")
      .eq("accommodation_id", accommodationId)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as unknown as Campaign[];
    setCampaigns(list);
    const fromUrl = searchParams.get("campaignId");
    setActiveId((prev) => {
      if (fromUrl && list.some((c) => c.id === fromUrl)) return fromUrl;
      return list.some((c) => c.id === prev) ? prev : list[0]?.id ?? "";
    });
    setLoading(false);
  }, [accommodationId, searchParams]);

  const loadDetails = useCallback(async () => {
    if (!activeId) {
      setPackages([]);
      setBanks([]);
      setOrders([]);
      setEvents([]);
      return;
    }
    const [{ data: pkgs }, { data: bankRows }, { data: comms }] = await Promise.all([
      supabase.from("group_buy_campaign_packages").select("*").eq("campaign_id", activeId).order("sort_order"),
      supabase.from("group_buy_bank_accounts").select("*").eq("campaign_id", activeId).order("is_default", { ascending: false }),
      supabase
        .from("group_buy_commissions")
        .select(
          "order_id, revenue_base, commission_rate, commission_amount, status, manual_eligibility, manual_note, price_snapshot",
        )
        .eq("campaign_id", activeId),
    ]);
    setPackages((pkgs ?? []) as unknown as PackageRow[]);
    setBanks((bankRows ?? []) as unknown as BankRow[]);
    setCommissions((comms ?? []) as unknown as CommissionRecord[]);
    setSnapshots(
      Object.fromEntries((comms ?? []).map((c: any) => [c.order_id, (c.price_snapshot ?? null) as PriceSnapshot | null])),
    );


    const orderIds = (comms ?? []).map((c: any) => c.order_id);
    if (orderIds.length === 0) {
      setOrders([]);
      return;
    }
    const [{ data: orderRows }, { data: events }] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, guest_name, guest_phone, guest_email, check_in_date, check_out_date, room_quantity, guest_count, adult_count, child_count, toddler_count, infant_count, final_price, deposit_amount, paid_amount, order_status, payment_status, order_date, refund_status, refunded_amount, refunded_at, payment_provider, group_buy_booking_notice_snapshot",
        )
        .in("id", orderIds)
        .order("order_date", { ascending: false }),
      supabase
        .from("group_buy_payment_events")
        .select("id, order_id, event_type, amount, account_last5, transferred_at, actor_user_id, actor_label, note, created_at")
        .eq("campaign_id", activeId)
        .order("created_at", { ascending: true }),
    ]);
    setEvents((events ?? []) as unknown as EventRow[]);
    // 注意：付款狀態一律讀 orders（payment_status / paid_amount / deposit_amount）。
    // 這裡只取「事件性」旗標，admin_confirmed 僅保留於稽核紀錄，不再轉成第二套付款狀態。
    const reportedSet = new Set(
      (events ?? []).filter((e: any) => e.event_type === "guest_reported").map((e: any) => e.order_id),
    );
    const cancelRequestedSet = new Set(
      (events ?? []).filter((e: any) => e.event_type === "cancel_requested").map((e: any) => e.order_id),
    );
    setOrders(
      ((orderRows ?? []) as unknown as OrderRow[]).map((o) => ({
        ...o,
        reported: reportedSet.has(o.id),
        cancelRequested: cancelRequestedSet.has(o.id),
      })),
    );

  }, [activeId]);
  /** 重新整理：活動 + 方案／匯款帳戶／訂單／分潤／稽核事件一次重抓 */
  const [refreshing, setRefreshing] = useState(false);
  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadCampaigns(), loadDetails()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadCampaigns, loadDetails]);


  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    if (!accommodationId) return;
    (async () => {
      const { data } = await supabase
        .from("room_types")
        .select("id, name")
        .eq("accommodation_id", accommodationId)
        .order("name");
      setRoomTypes((data ?? []) as { id: string; name: string }[]);
    })();
  }, [accommodationId]);

  const saveCampaign = async () => {
    if (!editing || !accommodationId) return;
    if (!editing.title || !editing.slug) {
      toast({ title: "請填寫活動名稱與網址代稱", variant: "destructive" });
      return;
    }
    const dateErrors = validateCampaignWindow(editing);
    if (hasErrors(dateErrors)) {
      toast({
        title: "日期設定不正確，無法儲存",
        description: Object.values(dateErrors).join("；"),
        variant: "destructive",
      });
      return;
    }
    // 分潤比例變更：歷史分潤預設鎖定，需先確認套用範圍
    const oldRate = Number(campaigns.find((c) => c.id === editing.id)?.commission_rate ?? 0);
    const newRate = Number(editing.commission_rate ?? 0);
    if (editing.id && newRate !== oldRate) {
      setRateDialog({ oldRate, newRate });
      return;
    }
    setSaving(true);
    try {
      const payload = { ...editing, accommodation_id: accommodationId } as any;
      const { error } = editing.id
        ? await supabase.from("group_buy_campaigns").update(payload).eq("id", editing.id)
        : await supabase.from("group_buy_campaigns").insert(payload);
      if (error) throw error;
      if (!editing.id) {
        // 新活動：預設帶入官網介紹內容，之後可於「民宿介紹」分頁編輯
        await ensureGroupBuyVenueIntroDefaults(accommodationId);
      }
      toast({ title: "已儲存團購活動" });

      setEditing(null);
      await loadCampaigns();
    } catch (e) {
      toast({ title: "儲存失敗", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addPackage = async () => {
    if (!activeId) return;
    const { error } = await supabase.from("group_buy_campaign_packages").insert({
      campaign_id: activeId,
      display_name: "新方案",
      group_buy_price: 0,
      room_type_id: roomTypes[0]?.id ?? null,
      sort_order: packages.length,
    });
    if (error) toast({ title: "新增失敗", description: error.message, variant: "destructive" });
    await loadDetails();
  };

  const savePackage = async (row: PackageRow) => {
    // 主圖與多圖同步：image_url 保留為 image_urls[0]，避免其他未更新的讀取點壞掉
    const urls = row.image_urls ?? [];
    const { id, ...rest } = { ...row, image_url: urls.length > 0 ? urls[0] : row.image_url };
    const { error } = await supabase.from("group_buy_campaign_packages").update(rest as any).eq("id", id);
    if (error) toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
    else toast({ title: "方案已更新" });
    await loadDetails();
  };

  const deletePackage = async (id: string) => {
    await supabase.from("group_buy_campaign_packages").delete().eq("id", id);
    await loadDetails();
  };

  /** 複製方案：同活動內建立副本，預設下架，需確認內容後再上架 */
  const duplicatePackage = async (row: PackageRow) => {
    const { id, created_at, updated_at, ...rest } = row as any;
    const displayName = nextCopyName(row.display_name, packages.map((p) => p.display_name));
    const { error } = await supabase.from("group_buy_campaign_packages").insert({
      ...rest,
      display_name: displayName,
      sort_order: (Number(row.sort_order) || 0) + 1,
      is_active: false,
    } as any);
    if (error) toast({ title: "複製失敗", description: error.message, variant: "destructive" });
    else toast({ title: "已複製方案", description: `已建立「${displayName}」，預設為下架` });
    await loadDetails();
  };


  const addBank = async () => {
    if (!activeId) return;
    const { error } = await supabase.from("group_buy_bank_accounts").insert({
      campaign_id: activeId,
      bank_name: "",
      account_name: "",
      account_number: "",
      is_default: banks.length === 0,
    });
    if (error) toast({ title: "新增失敗", description: error.message, variant: "destructive" });
    await loadDetails();
  };

  const saveBank = async (row: BankRow) => {
    const { id, ...rest } = row;
    const { error } = await supabase.from("group_buy_bank_accounts").update(rest as any).eq("id", id);
    if (error) toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
    else toast({ title: "匯款帳戶已更新" });
    await loadDetails();
  };

  const deleteBank = async (id: string) => {
    await supabase.from("group_buy_bank_accounts").delete().eq("id", id);
    await loadDetails();
  };

  const confirmDeposit = async () => {
    if (!confirmTarget) return;
    setConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-buy-confirm-deposit", {
        body: {
          orderId: confirmTarget.id,
          receivedAmount: Number(confirmAmount) || confirmTarget.deposit_amount,
          note: confirmNote,
          origin: window.location.origin,
        },
      });
      const payload: any = data;
      if (error || payload?.error) {
        toast({ title: "確認失敗", description: payload?.error ?? error?.message, variant: "destructive" });
        return;
      }
      toast({
        title: "已確認收到訂金",
        description: payload?.emailSent ? "已寄出確認信給旅客" : "確認信未寄出（信箱或設定缺失）",
      });
      setConfirmTarget(null);
      setConfirmNote("");
      await loadDetails();
    } finally {
      setConfirming(false);
    }
  };

  const openCancel = (o: OrderRow) => {
    const refundable = remainingRefundable(o);
    setCancelTarget(o);
    setCancelRefundAction(refundable > 0 ? "pending_refund" : "no_refund");
    setCancelRefundAmount(String(refundable));
    const req = events.find((e) => e.order_id === o.id && e.event_type === "cancel_requested");
    setCancelReason(req?.note ?? "");

  };

  const openRefund = (o: OrderRow) => {
    setRefundTarget(o);
    setRefundAmount(String(remainingRefundable(o)));
    setRefundNote("");
  };

  /** 人工退款登記：管理員於銀行端完成退匯後才按下確認；server 端會重新讀 orders 驗證金額 */
  const processRefund = async () => {
    if (!refundTarget) return;
    const amt = Math.round(Number(refundAmount) || 0);
    const max = remainingRefundable(refundTarget);
    if (!(amt > 0) || amt > max) {
      toast({ title: "退款金額不正確", description: `可退範圍 1 ~ ${twd(max)}`, variant: "destructive" });
      return;
    }
    setRefunding(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-buy-cancel-refund", {
        body: { orderId: refundTarget.id, mode: "refund", refundAmount: amt, reason: refundNote },
      });
      const payload: any = data;
      if (error || payload?.error) {
        toast({ title: "退款登記失敗", description: payload?.error ?? error?.message, variant: "destructive" });
        return;
      }
      toast({
        title: "已登記退款",
        description: `本次 ${twd(payload.refundAmount)}，累計 ${twd(payload.totalRefunded)}`,
      });
      setRefundTarget(null);
      await loadDetails();
    } finally {
      setRefunding(false);
    }
  };

  const cancelWithRefund = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const { data, error } = await supabase.functions.invoke("group-buy-cancel-refund", {
        body: {
          orderId: cancelTarget.id,
          mode: "cancel",
          refundAction: cancelRefundAction,
          refundAmount: cancelRefundAction === "mark_refunded" ? Number(cancelRefundAmount) || 0 : 0,
          reason: cancelReason,
        },
      });
      const payload: any = data;
      if (error || payload?.error) {
        toast({ title: "取消失敗", description: payload?.error ?? error?.message, variant: "destructive" });
        return;
      }
      toast({
        title: "訂單已取消",
        description: payload?.refundAmount > 0
          ? `已登記退款 ${twd(payload.refundAmount)}`
          : payload?.refundStatus === "pending_manual" || payload?.refundStatus === "pending"
            ? "已標記為待退款，請於銀行退匯後按「處理退款」登記"
            : "不需退款，已寫入稽核紀錄",
      });
      setCancelTarget(null);
      await loadDetails();
    } finally {
      setCancelling(false);
    }
  };

  const stats = useMemo(() => {
    const valid = orders.filter((o) => o.order_status !== "cancelled");
    const paid = valid.filter((o) => depositState(o) !== "unpaid");
    return {
      total: orders.length,
      valid: valid.length,
      cancelled: orders.length - valid.length,
      pendingTransfer: valid.filter((o) => depositState(o) === "unpaid").length,
      awaitingCheck: valid.filter((o) => o.reported && depositState(o) === "unpaid").length,
      revenue: valid.reduce((s, o) => s + Number(o.final_price || 0), 0),
      collected: paid.reduce((s, o) => s + Number(o.paid_amount || 0), 0),
      commission: Math.round(
        (valid.reduce((s, o) => s + Number(o.final_price || 0), 0) * Number(activeCampaign?.commission_rate || 0)) / 100,
      ),
    };

  }, [orders, activeCampaign]);

  /** 銷售分析／匯出／列印共用同一份資料（分潤一律讀快照） */
  const analyticsRows = useMemo(
    () => buildAnalyticsRows(orders as any, commissions),
    [orders, commissions],
  );
  const analyticsByOrderId = useMemo(
    () => new Map(analyticsRows.map((r) => [r.order.id, r])),
    [analyticsRows],
  );

  /** 由銷售分析點訂單編號 → 切到訂單對帳並高亮該筆 */
  const openOrderFromAnalytics = useCallback(
    (orderNumber: string) => {
      setTab("orders");
      const next = new URLSearchParams(searchParams);
      next.set("tab", "orders");
      next.set("orderNumber", orderNumber);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  /** 特例退款人工判定：寫入 group_buy_commissions 並留下稽核事件 */
  const setManualEligibility = useCallback(
    async (orderId: string, value: "include" | "exclude") => {
      const { data: userData } = await supabase.auth.getUser();
      const row = analyticsByOrderId.get(orderId);
      const rate = row?.commissionRate ?? (Number(activeCampaign?.commission_rate) || 0);
      const amount = value === "include" ? Math.round(((row?.revenueBase ?? 0) * rate) / 100) : 0;
      const { error } = await supabase
        .from("group_buy_commissions")
        .update({
          manual_eligibility: value,
          manual_set_by: userData.user?.id ?? null,
          manual_set_at: new Date().toISOString(),
          commission_amount: amount,
        } as any)
        .eq("order_id", orderId);
      if (error) {
        toast({ title: "分潤判定儲存失敗", description: error.message, variant: "destructive" });
        return;
      }
      await supabase.from("group_buy_payment_events").insert({
        order_id: orderId,
        campaign_id: activeId,
        event_type: "note",
        actor_user_id: userData.user?.id ?? null,
        actor_label: userData.user?.email ?? null,
        amount,
        note: value === "include" ? "人工判定：此訂單列入網紅分潤" : "人工判定：此訂單不列入網紅分潤",
      } as any);
      toast({ title: value === "include" ? "已設定為列入分潤" : "已設定為不列入分潤" });
      await loadDetails();
    },
    [analyticsByOrderId, activeCampaign, activeId, toast, loadDetails],
  );

  /** 套用新分潤比例：預設只影響新訂單；同步模式僅改「未結算且未取消」的快照 */
  const applyCommissionRate = useCallback(
    async (mode: CommissionRateApplyMode) => {
      if (!rateDialog || !editing?.id) return;
      setSaving(true);
      try {
        const { error } = await supabase
          .from("group_buy_campaigns")
          .update({ ...(editing as any), commission_rate: rateDialog.newRate, accommodation_id: accommodationId })
          .eq("id", editing.id);
        if (error) throw error;

        if (mode === "sync_pending") {
          const targets = analyticsRows.filter(
            (r) =>
              r.commission &&
              r.commission.status === "pending" &&
              r.order.order_status !== "cancelled" &&
              r.manual !== "exclude",
          );
          const { data: userData } = await supabase.auth.getUser();
          for (const r of targets) {
            await supabase
              .from("group_buy_commissions")
              .update({
                commission_rate: rateDialog.newRate,
                commission_amount: Math.round((r.revenueBase * rateDialog.newRate) / 100),
              })
              .eq("order_id", r.order.id);
            await supabase.from("group_buy_payment_events").insert({
              order_id: r.order.id,
              campaign_id: activeId,
              event_type: "note",
              actor_user_id: userData.user?.id ?? null,
              actor_label: userData.user?.email ?? null,
              note: `分潤比例調整：${r.commissionRate ?? rateDialog.oldRate}% → ${rateDialog.newRate}%`,
            } as any);
          }
          toast({ title: "已更新分潤比例", description: `同步調整 ${targets.length} 筆未結算訂單` });
        } else {
          toast({ title: "已更新分潤比例", description: "僅套用於之後成立的新訂單" });
        }
        setRateDialog(null);
        setEditing(null);
        await refreshAll();
      } catch (e) {
        toast({ title: "儲存失敗", description: e instanceof Error ? e.message : "", variant: "destructive" });
      } finally {
        setSaving(false);
      }
    },
    [rateDialog, editing, analyticsRows, activeId, accommodationId, toast, refreshAll],
  );

  const publicUrl = activeCampaign ? `${window.location.origin}/g/${activeCampaign.slug}` : "";

  if (!accommodationId) return null;

  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader title="網紅團購" description="建立團購頁、管理匯款對帳與銷售分析" icon={Megaphone} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={activeId} onValueChange={setActiveId}>
          <SelectTrigger className="w-full max-w-full sm:w-[420px] lg:w-[560px]">
            <SelectValue placeholder="選擇團購活動" />
          </SelectTrigger>
          <SelectContent className="min-w-[var(--radix-select-trigger-width)] max-w-[min(92vw,680px)]">

            {campaigns.map((c) => {
              const statusLabel = c.is_archived
                ? "已封存"
                : c.status === "active"
                  ? "上架中"
                  : c.status === "draft"
                    ? "草稿"
                    : "已結束";
              return (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex w-full items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{c.title}</span>
                    <Badge variant={c.status === "active" && !c.is_archived ? "default" : "secondary"} className="shrink-0 text-[11px]">
                      {statusLabel}
                    </Badge>
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={loading || refreshing}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading || refreshing ? "animate-spin" : ""}`} /> 重新整理
        </Button>

        <Button size="sm" onClick={() => setEditing(emptyCampaign(accommodationId))}>
          <Plus className="mr-1 h-4 w-4" /> 新增活動
        </Button>
        {activeCampaign && (
          <>
            <Button size="sm" variant="outline" onClick={() => setEditing(activeCampaign)}>
              編輯活動
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(publicUrl);
                toast({ title: "已複製團購連結", description: publicUrl });
              }}
            >
              <Copy className="mr-1 h-4 w-4" /> 複製團購連結
            </Button>
            <GroupBuyCampaignDangerZone campaign={activeCampaign} onChanged={() => refreshAll()} />
          </>

        )}
      </div>

      {!activeCampaign ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            尚未建立團購活動，點選「新增活動」開始。
          </CardContent>
        </Card>
      ) : (
        <>
        <CampaignWindowSummary campaign={activeCampaign} />
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v);
            const next = new URLSearchParams(searchParams);
            next.set("tab", v);
            setSearchParams(next, { replace: true });
          }}
        >

          <TabsList>
            <TabsTrigger value="orders">訂單對帳</TabsTrigger>
            <TabsTrigger value="packages">方案設定</TabsTrigger>
            <TabsTrigger value="bank">匯款帳戶</TabsTrigger>
            <TabsTrigger value="analytics">銷售分析</TabsTrigger>
            <TabsTrigger value="venue">民宿介紹</TabsTrigger>
            <TabsTrigger value="page-content">頁面內容</TabsTrigger>
            <TabsTrigger value="notify">通知設定</TabsTrigger>
          </TabsList>

          <TabsContent value="notify" className="space-y-3">
            <GroupBuyNotificationSettings campaignId={activeId || null} accommodationId={accommodationId} />
          </TabsContent>

          <TabsContent value="orders" className="space-y-3">
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                      <TableHead className="whitespace-nowrap">旅客</TableHead>
                      <TableHead className="whitespace-nowrap">入住</TableHead>
                      <TableHead className="whitespace-nowrap text-right tabular-nums">訂單總額</TableHead>
                      <TableHead className="whitespace-nowrap">應付訂金</TableHead>
                      <TableHead className="whitespace-nowrap">訂單狀態</TableHead>
                      <TableHead className="whitespace-nowrap">退款狀態</TableHead>
                      <TableHead className="whitespace-nowrap">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => {
                      const dState = depositState(o);
                      const rState = refundState(o);
                      const showRefundBtn = canProcessRefund(o);
                      return (
                      <TableRow
                        key={o.id}
                        className={
                          highlightOrderNumber && o.order_number?.toUpperCase() === highlightOrderNumber
                            ? "bg-primary/5 ring-1 ring-inset ring-primary/40"
                            : undefined
                        }
                      >
                        <TableCell className="whitespace-nowrap font-medium">
                          <Link
                            to={`/admin/orders/${o.id}`}
                            className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
                          >
                            {o.order_number}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <div className="text-xs text-muted-foreground">{paymentProviderLabel(o)}</div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          {o.guest_name}
                          <div className="text-xs text-muted-foreground">{o.guest_phone}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {o.check_in_date} → {o.check_out_date}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{twd(o.final_price)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="tabular-nums">{twd(o.deposit_amount)}</span>
                            <Badge variant={DEPOSIT_STATE_VARIANT[dState]}>{DEPOSIT_STATE_LABEL[dState]}</Badge>
                          </div>
                          {Number(o.paid_amount || 0) > 0 && (
                            <div className="text-xs text-muted-foreground tabular-nums">
                              已收 {twd(o.paid_amount || 0)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {o.order_status === "cancelled" ? (
                            <Badge variant="destructive">已取消</Badge>
                          ) : o.cancelRequested ? (
                            <Badge variant="destructive">旅客申請取消</Badge>
                          ) : o.reported && dState === "unpaid" ? (
                            <Badge variant="secondary">旅客已回報</Badge>
                          ) : (
                            <Badge variant="outline">
                              {o.order_status === "confirmed" ? "已確認" : "待處理"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={REFUND_STATE_VARIANT[rState]}>{REFUND_STATE_LABEL[rState]}</Badge>
                          {Number(o.refunded_amount || 0) > 0 && (
                            <div className="text-xs text-muted-foreground tabular-nums">
                              已退 {twd(o.refunded_amount || 0)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {o.order_status !== "cancelled" && dState !== "paid" && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setConfirmTarget(o);
                                setConfirmAmount(String(o.deposit_amount ?? 0));
                              }}
                            >
                              確認收到訂金
                            </Button>
                          )}
                          {o.order_status !== "cancelled" && (
                            <Button size="sm" variant="outline" className="ml-1" onClick={() => openCancel(o)}>
                              <Undo2 className="mr-1 h-4 w-4" />
                              取消／退款
                            </Button>
                          )}
                          {showRefundBtn && (
                            <Button size="sm" variant="outline" className="ml-1" onClick={() => openRefund(o)}>
                              <Banknote className="mr-1 h-4 w-4" />
                              處理退款
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-1"
                            onClick={() => setAuditTarget(o)}
                          >
                            <History className="mr-1 h-4 w-4" />
                            稽核紀錄
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                    {orders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          尚無團購訂單
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>


          <TabsContent value="packages" className="space-y-3">
            <Button size="sm" onClick={addPackage}>
              <Plus className="mr-1 h-4 w-4" /> 新增方案
            </Button>
            {packages.map((p, idx) => (
              <GroupBuyPackageCard
                key={p.id}
                pkg={p}
                roomTypes={roomTypes}
                accommodationId={accommodationId}
                stayStart={activeCampaign?.stay_start_date ?? null}
                stayEnd={activeCampaign?.stay_end_date ?? null}
                onPatch={(patch) => setPackages((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)))}
                onSave={() => void savePackage(p)}
                onDuplicate={() => void duplicatePackage(p)}
                onDelete={() => void deletePackage(p.id)}
              />
            ))}

          </TabsContent>

          <TabsContent value="bank" className="space-y-3">
            <Button size="sm" onClick={addBank}>
              <Plus className="mr-1 h-4 w-4" /> 新增匯款帳戶
            </Button>
            {banks.map((b, idx) => (
              <Card key={b.id}>
                <CardContent className="grid gap-3 p-4 md:grid-cols-2">
                  <div>
                    <Label>銀行名稱</Label>
                    <Input
                      value={b.bank_name}
                      onChange={(e) => setBanks((prev) => prev.map((x, i) => (i === idx ? { ...x, bank_name: e.target.value } : x)))}
                    />
                  </div>
                  <div>
                    <Label>銀行代碼</Label>
                    <Input
                      value={b.bank_code ?? ""}
                      onChange={(e) => setBanks((prev) => prev.map((x, i) => (i === idx ? { ...x, bank_code: e.target.value } : x)))}
                    />
                  </div>
                  <div>
                    <Label>分行</Label>
                    <Input
                      value={b.branch_name ?? ""}
                      onChange={(e) => setBanks((prev) => prev.map((x, i) => (i === idx ? { ...x, branch_name: e.target.value } : x)))}
                    />
                  </div>
                  <div>
                    <Label>戶名</Label>
                    <Input
                      value={b.account_name}
                      onChange={(e) => setBanks((prev) => prev.map((x, i) => (i === idx ? { ...x, account_name: e.target.value } : x)))}
                    />
                  </div>
                  <div>
                    <Label>帳號</Label>
                    <Input
                      value={b.account_number}
                      onChange={(e) => setBanks((prev) => prev.map((x, i) => (i === idx ? { ...x, account_number: e.target.value } : x)))}
                    />
                  </div>
                  <div>
                    <Label>備註</Label>
                    <Input
                      value={b.note ?? ""}
                      onChange={(e) => setBanks((prev) => prev.map((x, i) => (i === idx ? { ...x, note: e.target.value } : x)))}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={b.is_default}
                      onCheckedChange={(v) => setBanks((prev) => prev.map((x, i) => (i === idx ? { ...x, is_default: v } : x)))}
                    />
                    <span className="text-sm">設為預設收款帳戶</span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => deleteBank(b.id)}>
                      <Trash2 className="mr-1 h-4 w-4" /> 刪除
                    </Button>
                    <Button size="sm" onClick={() => saveBank(b)}>
                      儲存
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="analytics">
            <GroupBuyAnalyticsTab
              rows={analyticsRows}
              campaignTitle={activeCampaign.title}
              kolName={activeCampaign.kol_display_name ?? ""}
              salePeriod={`${(activeCampaign.sale_start ?? "").slice(0, 10) || "—"} ~ ${(activeCampaign.sale_end ?? "").slice(0, 10) || "—"}`}
              stayPeriod={`${activeCampaign.stay_start_date ?? "—"} ~ ${activeCampaign.stay_end_date ?? "—"}`}
              currentRate={Number(activeCampaign.commission_rate) || 0}
              onOpenOrder={openOrderFromAnalytics}
            />
          </TabsContent>


          <TabsContent value="venue">
            {accommodationId && <GroupBuyVenueIntroEditor accommodationId={accommodationId} />}
          </TabsContent>

          <TabsContent value="page-content">
            {accommodationId && (
              <GroupBuyPageContentTab
                campaignId={activeCampaign.id}
                accommodationId={accommodationId}
                faqItemIds={(activeCampaign as any).faq_item_ids ?? null}
                bookingNoticeKeys={(activeCampaign as any).booking_notice_keys ?? null}
                onSaved={() => void loadCampaigns()}
              />
            )}
          </TabsContent>
        </Tabs>
        </>
      )}

      {/* 活動編輯 */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "編輯團購活動" : "新增團購活動"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>活動名稱</Label>
                <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label>網址代稱（/g/代稱）</Label>
                <Input
                  value={editing.slug ?? ""}
                  onChange={(e) => setEditing({ ...editing, slug: e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase() })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>副標</Label>
                <Input value={editing.subtitle ?? ""} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} />
              </div>
              <div>
                <Label>合作網紅名稱</Label>
                <Input
                  value={editing.kol_display_name ?? ""}
                  onChange={(e) => setEditing({ ...editing, kol_display_name: e.target.value })}
                />
              </div>
              <div>
                <Label>綁定折扣碼（歸因用）</Label>
                <Input
                  value={editing.discount_code ?? ""}
                  onChange={(e) => setEditing({ ...editing, discount_code: e.target.value.toUpperCase() })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>封面圖片</Label>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  建議尺寸 2400×900 以上，建議比例 16:6（桌機）／16:10（手機），支援 JPG／PNG／WebP，檔案 8MB 以內。
                </p>
                <ImageUploadField
                  value={editing.cover_image_url ?? null}
                  onChange={(url) => setEditing({ ...editing, cover_image_url: url })}
                  pathPrefix={`${accommodationId}/group-buy/cover`}
                />
                <CoverCropEditor
                  className="mt-3"
                  imageUrl={editing.cover_image_url}
                  desktop={resolveCoverFocus(editing as any, "desktop")}
                  mobile={resolveCoverFocus(editing as any, "mobile")}
                  onChange={({ desktop, mobile }) =>
                    setEditing({
                      ...editing,
                      cover_focus_x: desktop.x,
                      cover_focus_y: desktop.y,
                      cover_zoom: desktop.zoom,
                      cover_focus_x_mobile: mobile.x,
                      cover_focus_y_mobile: mobile.y,
                      cover_zoom_mobile: mobile.zoom,
                    } as any)
                  }
                />
              </div>

              <div>
                <Label>狀態</Label>
                <Select value={editing.status ?? "draft"} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="active">上架中</SelectItem>
                    <SelectItem value="ended">已結束</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <CampaignWindowSummary campaign={editing} />
              </div>
              <div>
                <Label>開賣時間</Label>
                <DateTimeField
                  value={editing.sale_start ?? null}
                  onChange={(iso) =>
                    setEditing({
                      ...editing,
                      sale_start: iso,
                      // 結束時間不可早於開賣時間
                      sale_end:
                        iso && editing.sale_end && new Date(editing.sale_end) < new Date(iso)
                          ? iso
                          : editing.sale_end,
                    })
                  }
                  placeholder="選擇開賣時間"
                />
                {editErrors.sale_start && (
                  <p className="mt-1 text-xs text-destructive">{editErrors.sale_start}</p>
                )}
              </div>
              <div>
                <Label>結束時間</Label>
                <DateTimeField
                  value={editing.sale_end ?? null}
                  onChange={(iso) => setEditing({ ...editing, sale_end: iso })}
                  minDateTime={editing.sale_start ?? null}
                  placeholder="選擇結束時間"
                />
                {editErrors.sale_end && <p className="mt-1 text-xs text-destructive">{editErrors.sale_end}</p>}
              </div>
              <div>
                <Label>可入住起日</Label>
                <DateField
                  value={editing.stay_start_date ?? null}
                  onChange={(d) =>
                    setEditing({
                      ...editing,
                      stay_start_date: d,
                      stay_end_date:
                        d && editing.stay_end_date && editing.stay_end_date < d ? d : editing.stay_end_date,
                    })
                  }
                  placeholder="選擇起始日"
                />
                {editErrors.stay_start_date && (
                  <p className="mt-1 text-xs text-destructive">{editErrors.stay_start_date}</p>
                )}
              </div>
              <div>
                <Label>可入住迄日</Label>
                <DateField
                  value={editing.stay_end_date ?? null}
                  onChange={(d) => setEditing({ ...editing, stay_end_date: d })}
                  minDate={editing.stay_start_date ?? null}
                  placeholder="選擇結束日"
                />
                {editErrors.stay_end_date && (
                  <p className="mt-1 text-xs text-destructive">{editErrors.stay_end_date}</p>
                )}
              </div>


              <div>
                <Label>訂金比例（%）</Label>
                <Input
                  type="number"
                  value={editing.deposit_percentage ?? 30}
                  onChange={(e) => setEditing({ ...editing, deposit_percentage: Number(e.target.value) || 30 })}
                />
              </div>
              <div>
                <Label>匯款期限（小時）</Label>
                <Input
                  type="number"
                  value={editing.payment_deadline_hours ?? 72}
                  onChange={(e) => setEditing({ ...editing, payment_deadline_hours: Number(e.target.value) || 72 })}
                />
              </div>
              <div>
                <Label>網紅分潤比例（%）</Label>
                <Input
                  type="number"
                  value={editing.commission_rate ?? 0}
                  onChange={(e) => setEditing({ ...editing, commission_rate: Number(e.target.value) || 0 })}
                />
              </div>
              <div>
                <Label>付款方式</Label>
                <Select
                  value={editing.payment_method ?? "manual_bank_transfer"}
                  onValueChange={(v) => setEditing({ ...editing, payment_method: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual_bank_transfer">銀行匯款（人工對帳）</SelectItem>
                    <SelectItem value="tappay" disabled>線上刷卡 TapPay（尚未開放）</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">目前僅支援銀行匯款；選擇 TapPay 不會改變前台流程。</p>
              </div>

              <div className="md:col-span-2">
                <Label>活動主賣點（每行一點，前台首屏最多顯示 3 點）</Label>
                <Textarea
                  rows={3}
                  placeholder={"包棟獨享\n含早餐\n免費停車"}
                  value={(editing.highlight_points ?? []).join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      highlight_points: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
              <div className="md:col-span-2">
                <FeaturedFacilityPicker
                  accommodationId={accommodationId}
                  value={(editing.featured_facilities ?? []).filter(Boolean)}
                  onChange={(next) => setEditing({ ...editing, featured_facilities: next })}
                />
              </div>
              <div className="md:col-span-2">
                <FeaturedPhotoPicker
                  accommodationId={accommodationId}
                  value={(editing.featured_photo_urls ?? []).filter(Boolean)}
                  onChange={(next) => setEditing({ ...editing, featured_photo_urls: next })}
                />
              </div>

              <div className="md:col-span-2">
                <Label>活動文案</Label>
                <RichTextEditor
                  variant="simple"
                  placeholder="輸入活動文案，可使用粗體、標題與條列整理段落…"
                  value={editing.description_html ?? ""}
                  onChange={(html) => setEditing({ ...editing, description_html: html })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>活動須知重點（每行一點，前台收合時顯示，建議 3～5 點）</Label>
                <Textarea
                  rows={5}
                  placeholder={"贈送食材為 10 人份\n僅適用指定包棟方案\n10 人方案僅適用平日\n加購食材需另外付費\n入住須收 NT$5,000 押金"}
                  value={(editing.terms_highlights ?? []).join("\n")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      terms_highlights: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean),
                    })
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  建議填寫 3～5 項最重要的團購限制，例如適用日期、贈品份數、押金、加購規則等。完整規則請填寫於下方「團購活動注意事項」。
                </p>
              </div>
              <div className="md:col-span-2">
                <Label>團購活動注意事項</Label>
                <RichTextEditor
                  variant="simple"
                  placeholder="輸入注意事項，建議以條列呈現…"
                  value={editing.terms_html ?? ""}
                  onChange={(html) => setEditing({ ...editing, terms_html: html })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>客服聯絡說明</Label>
                <Input
                  value={editing.contact_note ?? ""}
                  onChange={(e) => setEditing({ ...editing, contact_note: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            {editHasDateError && (
              <p className="mr-auto text-xs text-destructive">日期設定不正確，請修正後才能儲存</p>
            )}
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={saveCampaign} disabled={saving || editHasDateError}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}儲存
            </Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* 確認收款 */}
      <Dialog open={!!confirmTarget} onOpenChange={(o) => !o && setConfirmTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>確認收到訂金</DialogTitle>
          </DialogHeader>
          {confirmTarget && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                訂單 {confirmTarget.order_number}（{confirmTarget.guest_name}）應收訂金 {twd(confirmTarget.deposit_amount)}
              </p>
              <div>
                <Label>實際收到金額</Label>
                <Input type="number" value={confirmAmount} onChange={(e) => setConfirmAmount(e.target.value)} />
              </div>
              <div>
                <Label>對帳備註</Label>
                <Textarea rows={3} value={confirmNote} onChange={(e) => setConfirmNote(e.target.value)} />
              </div>
              <p className="text-muted-foreground">確認後系統會自動寄出「已收到訂金」通知信給旅客。</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              取消
            </Button>
            <Button onClick={confirmDeposit} disabled={confirming}>
              {confirming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}確認收款並寄信
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 取消訂單並手動退款 */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>取消訂單並處理退款</DialogTitle>
            <DialogDescription>
              {cancelTarget
                ? `訂單 ${cancelTarget.order_number}（${cancelTarget.guest_name}）已收款 ${twd(cancelTarget.paid_amount || 0)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {cancelTarget && (
            <div className="space-y-3 text-sm">
              <div>
                <Label>退款方式</Label>
                <Select value={cancelRefundAction} onValueChange={(v) => setCancelRefundAction(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending_refund">待退款（稍後於銀行退匯後登記）</SelectItem>
                    <SelectItem value="mark_refunded">已手動退款（銀行匯回）</SelectItem>
                    <SelectItem value="no_refund">不需退款（違約金／不可退方案／未收款）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {cancelRefundAction === "mark_refunded" && (
                <div>
                  <Label>退款金額</Label>
                  <Input
                    type="number"
                    min={0}
                    max={Math.max(0, Number(cancelTarget.paid_amount || 0) - Number(cancelTarget.refunded_amount || 0))}
                    value={cancelRefundAmount}
                    onChange={(e) => setCancelRefundAmount(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    最高可退 {twd(Math.max(0, Number(cancelTarget.paid_amount || 0) - Number(cancelTarget.refunded_amount || 0)))}
                    （團購為銀行匯款，需自行匯回旅客帳戶）
                  </p>
                </div>
              )}
              <div>
                <Label>取消原因（會寫入稽核紀錄）</Label>
                <Textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              返回
            </Button>
            <Button variant="destructive" onClick={cancelWithRefund} disabled={cancelling}>
              {cancelling ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}確認取消
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 人工退款登記（已取消訂單） */}
      <Dialog open={!!refundTarget} onOpenChange={(o) => !o && setRefundTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>處理退款</DialogTitle>
            <DialogDescription>
              團購為銀行匯款（人工對帳），請於銀行端實際完成退匯後再登記。
            </DialogDescription>
          </DialogHeader>
          {refundTarget && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 rounded-lg border p-3">
                <div className="text-muted-foreground">訂單編號</div>
                <div className="text-right font-medium">{refundTarget.order_number}</div>
                <div className="text-muted-foreground">旅客</div>
                <div className="text-right font-medium">{refundTarget.guest_name}</div>
                <div className="text-muted-foreground">已付款金額</div>
                <div className="text-right tabular-nums">{twd(refundTarget.paid_amount || 0)}</div>
                <div className="text-muted-foreground">已退款金額</div>
                <div className="text-right tabular-nums">{twd(refundTarget.refunded_amount || 0)}</div>
                <div className="text-muted-foreground">尚可退款金額</div>
                <div className="text-right font-semibold tabular-nums">{twd(remainingRefundable(refundTarget))}</div>
              </div>
              <div>
                <Label>退款金額</Label>
                <Input
                  type="number"
                  min={1}
                  max={remainingRefundable(refundTarget)}
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>退款備註（會寫入稽核紀錄）</Label>
                <Textarea rows={3} value={refundNote} onChange={(e) => setRefundNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRefundTarget(null)}>
              返回
            </Button>
            <Button onClick={processRefund} disabled={refunding}>
              {refunding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}確認已完成退款
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      {/* 訂單狀態稽核紀錄 */}
      <Dialog open={!!auditTarget} onOpenChange={(v) => !v && setAuditTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>狀態稽核紀錄</DialogTitle>
            <DialogDescription>
              {auditTarget ? `訂單 ${auditTarget.order_number} · ${auditTarget.guest_name}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div>
              <p className="mb-1.5 text-sm font-semibold">訂單價格快照</p>
              <GroupBuyPriceSnapshot snapshot={auditTarget ? snapshots[auditTarget.id] : null} />
            </div>
            <div>
              <p className="mb-1.5 text-sm font-semibold">下單當時訂房須知</p>
              <GroupBuyBookingNoticeSnapshotView
                snapshot={(auditTarget as any)?.group_buy_booking_notice_snapshot ?? null}
              />
            </div>
            <p className="text-sm font-semibold">狀態紀錄</p>
            {(auditTarget ? events.filter((e) => e.order_id === auditTarget.id) : []).map((e) => (
              <div key={e.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={EVENT_VARIANT[e.event_type] ?? "outline"}>
                    {EVENT_LABEL[e.event_type] ?? e.event_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground tabular-nums">{fmtTime(e.created_at)}</span>
                </div>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  <div>操作者：{e.actor_label || (e.actor_user_id ? e.actor_user_id : "系統")}</div>
                  {e.amount != null && <div>金額：{twd(Number(e.amount))}</div>}
                  {e.account_last5 && <div>帳號末五碼：{e.account_last5}</div>}
                  {e.transferred_at && <div>匯款時間：{fmtTime(e.transferred_at)}</div>}
                  {e.note && <div>備註：{e.note}</div>}
                </div>
              </div>
            ))}
            {auditTarget && events.filter((e) => e.order_id === auditTarget.id).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">尚無稽核紀錄</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
