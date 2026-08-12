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
import { CampaignWindowSummary } from "@/components/admin/CampaignWindowSummary";
import { hasErrors, validateCampaignWindow } from "@/lib/groupBuyDateRules";
import { Checkbox } from "@/components/ui/checkbox";
import { Copy, History, Loader2, Megaphone, Plus, RefreshCw, Trash2 } from "lucide-react";

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
};

const EVENT_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  order_created: "outline",
  guest_reported: "secondary",
  admin_confirmed: "default",
  expired: "destructive",
  cancelled: "destructive",
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
  accommodation_id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description_html: string | null;
  cover_image_url: string | null;
  kol_display_name: string | null;
  discount_code: string | null;
  sale_start: string | null;
  sale_end: string | null;
  stay_start_date: string | null;
  stay_end_date: string | null;
  status: string;
  deposit_percentage: number;
  payment_deadline_hours: number;
  commission_rate: number;
  contact_note: string | null;
  terms_html: string | null;
}

interface PackageRow {
  id: string;
  campaign_id: string;
  room_type_id: string | null;
  display_name: string;
  description: string | null;
  image_url: string | null;
  group_buy_price: number;
  original_price: number | null;
  max_quantity: number | null;
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
  final_price: number;
  deposit_amount: number;
  paid_amount: number | null;
  order_status: string;
  payment_status: string;
  order_date: string;
  campaign_id?: string | null;
  reported?: boolean;
  confirmed?: boolean;
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
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [banks, setBanks] = useState<BankRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [auditTarget, setAuditTarget] = useState<OrderRow | null>(null);
  const [roomTypes, setRoomTypes] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<Partial<Campaign> | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<OrderRow | null>(null);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const activeCampaign = useMemo(
    () => campaigns.find((c) => c.id === activeId) ?? null,
    [campaigns, activeId],
  );

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
    setActiveId((prev) => (list.some((c) => c.id === prev) ? prev : list[0]?.id ?? ""));
    setLoading(false);
  }, [accommodationId]);

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
      supabase.from("group_buy_commissions").select("order_id").eq("campaign_id", activeId),
    ]);
    setPackages((pkgs ?? []) as unknown as PackageRow[]);
    setBanks((bankRows ?? []) as unknown as BankRow[]);

    const orderIds = (comms ?? []).map((c: any) => c.order_id);
    if (orderIds.length === 0) {
      setOrders([]);
      return;
    }
    const [{ data: orderRows }, { data: events }] = await Promise.all([
      supabase
        .from("orders")
        .select(
          "id, order_number, guest_name, guest_phone, guest_email, check_in_date, check_out_date, room_quantity, final_price, deposit_amount, paid_amount, order_status, payment_status, order_date",
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
    const reportedSet = new Set(
      (events ?? []).filter((e: any) => e.event_type === "guest_reported").map((e: any) => e.order_id),
    );
    const confirmedSet = new Set(
      (events ?? []).filter((e: any) => e.event_type === "admin_confirmed").map((e: any) => e.order_id),
    );
    setOrders(
      ((orderRows ?? []) as unknown as OrderRow[]).map((o) => ({
        ...o,
        reported: reportedSet.has(o.id),
        confirmed: confirmedSet.has(o.id),
      })),
    );
  }, [activeId]);

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
    setSaving(true);
    try {
      const payload = { ...editing, accommodation_id: accommodationId } as any;
      const { error } = editing.id
        ? await supabase.from("group_buy_campaigns").update(payload).eq("id", editing.id)
        : await supabase.from("group_buy_campaigns").insert(payload);
      if (error) throw error;
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
    const { id, ...rest } = row;
    const { error } = await supabase.from("group_buy_campaign_packages").update(rest as any).eq("id", id);
    if (error) toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
    else toast({ title: "方案已更新" });
    await loadDetails();
  };

  const deletePackage = async (id: string) => {
    await supabase.from("group_buy_campaign_packages").delete().eq("id", id);
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

  const stats = useMemo(() => {
    const valid = orders.filter((o) => o.order_status !== "cancelled");
    const paid = valid.filter((o) => o.confirmed);
    return {
      total: orders.length,
      valid: valid.length,
      cancelled: orders.length - valid.length,
      pendingTransfer: valid.filter((o) => !o.confirmed).length,
      awaitingCheck: valid.filter((o) => o.reported && !o.confirmed).length,
      revenue: valid.reduce((s, o) => s + Number(o.final_price || 0), 0),
      collected: paid.reduce((s, o) => s + Number(o.paid_amount || 0), 0),
      commission: Math.round(
        (valid.reduce((s, o) => s + Number(o.final_price || 0), 0) * Number(activeCampaign?.commission_rate || 0)) / 100,
      ),
    };
  }, [orders, activeCampaign]);

  const publicUrl = activeCampaign ? `${window.location.origin}/g/${activeCampaign.slug}` : "";

  if (!accommodationId) return null;

  return (
    <div className="space-y-4 p-4">
      <AdminPageHeader title="網紅團購" description="建立團購頁、管理匯款對帳與銷售分析" icon={Megaphone} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={activeId} onValueChange={setActiveId}>
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="選擇團購活動" />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.title}（{c.status === "active" ? "上架中" : c.status === "draft" ? "草稿" : "已結束"}）
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => void loadCampaigns()} disabled={loading}>
          <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> 重新整理
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
        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">訂單對帳</TabsTrigger>
            <TabsTrigger value="packages">方案設定</TabsTrigger>
            <TabsTrigger value="bank">匯款帳戶</TabsTrigger>
            <TabsTrigger value="analytics">銷售分析</TabsTrigger>
          </TabsList>

          <TabsContent value="orders" className="space-y-3">
            <Card>
              <CardContent className="overflow-x-auto p-0">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">訂單編號</TableHead>
                      <TableHead className="whitespace-nowrap">旅客</TableHead>
                      <TableHead className="whitespace-nowrap">入住</TableHead>
                      <TableHead className="whitespace-nowrap text-right tabular-nums">總額</TableHead>
                      <TableHead className="whitespace-nowrap text-right tabular-nums">訂金</TableHead>
                      <TableHead className="whitespace-nowrap">狀態</TableHead>
                      <TableHead className="whitespace-nowrap">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap font-medium">{o.order_number}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {o.guest_name}
                          <div className="text-xs text-muted-foreground">{o.guest_phone}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {o.check_in_date} → {o.check_out_date}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{twd(o.final_price)}</TableCell>
                        <TableCell className="text-right tabular-nums">{twd(o.deposit_amount)}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {o.order_status === "cancelled" ? (
                            <Badge variant="destructive">已取消</Badge>
                          ) : o.confirmed ? (
                            <Badge className="bg-primary">已收訂金</Badge>
                          ) : o.reported ? (
                            <Badge variant="secondary">旅客已回報</Badge>
                          ) : (
                            <Badge variant="outline">待匯款</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {o.order_status !== "cancelled" && !o.confirmed && (
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
                    ))}
                    {orders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
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
              <Card key={p.id}>
                <CardContent className="grid gap-3 p-4 md:grid-cols-2">
                  <div>
                    <Label>方案名稱</Label>
                    <Input
                      value={p.display_name}
                      onChange={(e) =>
                        setPackages((prev) => prev.map((x, i) => (i === idx ? { ...x, display_name: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div>
                    <Label>對應房型（庫存依據）</Label>
                    <Select
                      value={p.room_type_id ?? "none"}
                      onValueChange={(v) =>
                        setPackages((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, room_type_id: v === "none" ? null : v } : x)),
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">未設定</SelectItem>
                        {roomTypes.map((rt) => (
                          <SelectItem key={rt.id} value={rt.id}>
                            {rt.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>團購價（每晚）</Label>
                    <Input
                      type="number"
                      value={p.group_buy_price}
                      onChange={(e) =>
                        setPackages((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, group_buy_price: Number(e.target.value) || 0 } : x)),
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>原價（劃線顯示，可留空）</Label>
                    <Input
                      type="number"
                      value={p.original_price ?? ""}
                      onChange={(e) =>
                        setPackages((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, original_price: e.target.value === "" ? null : Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>單筆最多間數（可留空）</Label>
                    <Input
                      type="number"
                      value={p.max_quantity ?? ""}
                      onChange={(e) =>
                        setPackages((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, max_quantity: e.target.value === "" ? null : Number(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label>方案圖片網址</Label>
                    <Input
                      value={p.image_url ?? ""}
                      onChange={(e) =>
                        setPackages((prev) => prev.map((x, i) => (i === idx ? { ...x, image_url: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label>方案說明</Label>
                    <Textarea
                      rows={3}
                      value={p.description ?? ""}
                      onChange={(e) =>
                        setPackages((prev) => prev.map((x, i) => (i === idx ? { ...x, description: e.target.value } : x)))
                      }
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={(v) =>
                        setPackages((prev) => prev.map((x, i) => (i === idx ? { ...x, is_active: v } : x)))
                      }
                    />
                    <span className="text-sm">上架販售</span>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => deletePackage(p.id)}>
                      <Trash2 className="mr-1 h-4 w-4" /> 刪除
                    </Button>
                    <Button size="sm" onClick={() => savePackage(p)}>
                      儲存
                    </Button>
                  </div>
                </CardContent>
              </Card>
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "有效訂單", value: `${stats.valid} 筆` },
                { label: "待匯款 / 待核對", value: `${stats.pendingTransfer} / ${stats.awaitingCheck}` },
                { label: "取消訂單", value: `${stats.cancelled} 筆` },
                { label: "團購營收", value: twd(stats.revenue) },
                { label: "已收訂金", value: twd(stats.collected) },
                { label: `網紅分潤（${activeCampaign.commission_rate}%）`, value: twd(stats.commission) },
              ].map((s) => (
                <Card key={s.label}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-normal text-muted-foreground">{s.label}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-semibold tabular-nums text-foreground">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
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
              <div>
                <Label>封面圖網址</Label>
                <Input
                  value={editing.cover_image_url ?? ""}
                  onChange={(e) => setEditing({ ...editing, cover_image_url: e.target.value })}
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
              </div>
              <div>
                <Label>結束時間</Label>
                <DateTimeField
                  value={editing.sale_end ?? null}
                  onChange={(iso) => setEditing({ ...editing, sale_end: iso })}
                  minDateTime={editing.sale_start ?? null}
                  placeholder="選擇結束時間"
                />
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
              </div>
              <div>
                <Label>可入住迄日</Label>
                <DateField
                  value={editing.stay_end_date ?? null}
                  onChange={(d) => setEditing({ ...editing, stay_end_date: d })}
                  minDate={editing.stay_start_date ?? null}
                  placeholder="選擇結束日"
                />
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
              <div className="md:col-span-2">
                <Label>活動文案（HTML）</Label>
                <Textarea
                  rows={5}
                  value={editing.description_html ?? ""}
                  onChange={(e) => setEditing({ ...editing, description_html: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>注意事項（HTML）</Label>
                <Textarea
                  rows={4}
                  value={editing.terms_html ?? ""}
                  onChange={(e) => setEditing({ ...editing, terms_html: e.target.value })}
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={saveCampaign} disabled={saving}>
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
