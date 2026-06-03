import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAccommodation } from "@/contexts/AccommodationContext";

import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Plug, Trash2, Copy, KeyRound, Send, Activity, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { OwlTingEmailStatsCards } from "@/components/OwlTingEmailStatsCards";
import { AccommodationOwnersManagement } from "@/components/headquarters/AccommodationOwnersManagement";
import { OwlTingAliasesEditor } from "@/components/headquarters/OwlTingAliasesEditor";

interface OtaChannel {
  id: string;
  accommodation_id: string;
  channel_code: string;
  channel_name: string;
  hotel_id: string | null;
  is_enabled: boolean;
  logo_url: string | null;
  notes: string | null;
  display_order: number;
  last_synced_at: string | null;
}

const DEFAULT_CHANNELS: Array<Pick<OtaChannel, "channel_code" | "channel_name" | "display_order">> = [
  { channel_code: "booking", channel_name: "Booking.com", display_order: 1 },
  { channel_code: "agoda", channel_name: "Agoda", display_order: 2 },
  { channel_code: "trip", channel_name: "Trip.com", display_order: 3 },
  { channel_code: "expedia", channel_name: "Expedia", display_order: 4 },
];

interface OwlTingCredential {
  id: string;
  hotel_code: string;
  username: string;
  is_active: boolean;
  updated_at: string;
}

interface ExternalMapping {
  id: string;
  cid_code: string;
  hotel_code: string | null;
  api_environment: string;
  is_enabled: boolean;
  notes: string | null;
}

interface OwlTingEndpoint {
  id: string;
  endpoint_url: string;
  remote_username: string | null;
  environment: string;
  is_active: boolean;
  last_pushed_at: string | null;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function ChannelManager() {
  const { currentAccommodationId } = useAccommodation();
  const { toast } = useToast();
  const [channels, setChannels] = useState<OtaChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OtaChannel | null>(null);
  const [form, setForm] = useState({ hotel_id: "", notes: "" });
  const [deleting, setDeleting] = useState<OtaChannel | null>(null);

  // OwlTing state
  const [owlCred, setOwlCred] = useState<OwlTingCredential | null>(null);
  const [owlEndpoint, setOwlEndpoint] = useState<OwlTingEndpoint | null>(null);
  const [credDialogOpen, setCredDialogOpen] = useState(false);
  const [credForm, setCredForm] = useState({ hotel_code: "", username: "", password: "" });
  const [credSaving, setCredSaving] = useState(false);
  const [endpointDialogOpen, setEndpointDialogOpen] = useState(false);
  const [endpointForm, setEndpointForm] = useState({
    endpoint_url: "",
    remote_username: "",
    remote_password: "",
    environment: "test",
  });
  const [endpointSaving, setEndpointSaving] = useState(false);
  const [testingInbound, setTestingInbound] = useState(false);
  const [testingOutbound, setTestingOutbound] = useState(false);
  type TestResult = { ok: boolean; status?: number; elapsed_ms?: number; message: string } | null;
  const [inboundResult, setInboundResult] = useState<TestResult>(null);
  const [outboundResult, setOutboundResult] = useState<TestResult>(null);

  // SOAP self-test state
  type SoapTestRow = {
    method: string;
    label: string;
    ok: boolean;
    http_status: number;
    elapsed_ms: number;
    summary: string;
    request: string;
    response: string;
  };
  const [soapTesting, setSoapTesting] = useState(false);
  const [soapResults, setSoapResults] = useState<SoapTestRow[] | null>(null);
  const [soapExpanded, setSoapExpanded] = useState<Record<string, boolean>>({});

  // 台灣旅圖 state
  const [tmMapping, setTmMapping] = useState<ExternalMapping | null>(null);
  const [tmDialogOpen, setTmDialogOpen] = useState(false);
  const [tmForm, setTmForm] = useState({ cid_code: "", hotel_code: "", api_environment: "production", is_enabled: true, notes: "" });
  const [tmSaving, setTmSaving] = useState(false);
  const [tmTesting, setTmTesting] = useState(false);
  const [tmResult, setTmResult] = useState<TestResult>(null);

  const accId = currentAccommodationId;
  const inboundUrl = `${SUPABASE_URL}/functions/v1/owlting-content`;
  const outboundUrl = `${SUPABASE_URL}/functions/v1/owlting-ari-push`;
  const cmUrl = `${SUPABASE_URL}/functions/v1/owlting-cm`;
  const snapshotUrl = `${SUPABASE_URL}/functions/v1/owlting-cm-snapshot`;
  const hotelCode = owlCred?.hotel_code || "<HOTEL_CODE>";
  const today = new Date().toISOString().slice(0, 10);
  const inventoryUrl = `${snapshotUrl}?type=inventory&hotel_code=${hotelCode}&date_from=${today}&date_to=${today}`;
  const ratesUrl = `${snapshotUrl}?type=rates&hotel_code=${hotelCode}&date_from=${today}&date_to=${today}`;
  const SOAP_METHODS: Array<{ key: string; name: string; desc: string }> = [
    { key: "OTA_HotelAvailRQ", name: "① OTA_HotelAvailRQ", desc: "取得房型 / 方案 (AR ID) 清單" },
    { key: "OTA_HotelAvailNotifRQ", name: "② OTA_HotelAvailNotifRQ", desc: "設定房型庫存數量、房間鎖、方案鎖" },
    { key: "OTA_HotelRateAmountNotifRQ", name: "③ OTA_HotelRateAmountNotifRQ", desc: "設定房型方案的售價" },
    { key: "OTA_HotelResNotifRQ", name: "④ OTA_HotelResNotifRQ", desc: "OTA 訂單通知 (Commit / Modify / Cancel)" },
  ];

  useEffect(() => {
    if (!accId) return;
    void loadChannels();
    void loadOwlting();
    void loadTaiwanMap();
  }, [accId]);

  async function loadTaiwanMap() {
    if (!accId) return;
    const { data } = await supabase
      .from("external_hotel_mappings")
      .select("id,cid_code,hotel_code,api_environment,is_enabled,notes")
      .eq("accommodation_id", accId)
      .maybeSingle();
    setTmMapping((data as ExternalMapping | null) ?? null);
  }

  function openTmDialog() {
    setTmForm({
      cid_code: tmMapping?.cid_code || "",
      hotel_code: tmMapping?.hotel_code || "",
      api_environment: tmMapping?.api_environment || "production",
      is_enabled: tmMapping?.is_enabled ?? true,
      notes: tmMapping?.notes || "",
    });
    setTmDialogOpen(true);
  }

  async function saveTm() {
    if (!accId) return;
    const cid_code = tmForm.cid_code.trim();
    if (!cid_code) {
      toast({ title: "請輸入 CID Code", variant: "destructive" });
      return;
    }
    setTmSaving(true);
    const payload = {
      accommodation_id: accId,
      cid_code,
      hotel_code: tmForm.hotel_code.trim() || null,
      api_environment: tmForm.api_environment,
      is_enabled: tmForm.is_enabled,
      notes: tmForm.notes.trim() || null,
    };
    const { error } = tmMapping
      ? await supabase.from("external_hotel_mappings").update(payload).eq("id", tmMapping.id)
      : await supabase.from("external_hotel_mappings").insert(payload);
    setTmSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: tmMapping ? "已更新" : "已建立" });
    setTmDialogOpen(false);
    void loadTaiwanMap();
  }

  async function testTmConnection() {
    if (!accId) return;
    setTmTesting(true);
    setTmResult(null);
    const start = Date.now();
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const { data, error } = await supabase.functions.invoke("search-external-rooms", {
      body: { accommodationId: accId, checkIn: fmt(today), checkOut: fmt(tomorrow) },
    });
    const elapsed_ms = Date.now() - start;
    setTmTesting(false);
    if (error) {
      setTmResult({ ok: false, message: error.message || "連線失敗", elapsed_ms });
      return;
    }
    if (data?.error) {
      setTmResult({ ok: false, message: data.error, elapsed_ms });
      return;
    }
    const count = Array.isArray(data?.rooms) ? data.rooms.length : (Array.isArray(data?.HotelInfo) ? data.HotelInfo.length : 0);
    setTmResult({ ok: true, message: `連線成功，回傳 ${count} 筆資料（IP 白名單通過）`, elapsed_ms });
  }

  async function loadChannels() {
    if (!accId) return;
    setLoading(true);

    // Fetch channels and dismissed default codes in parallel
    const [channelsRes, dismissedRes] = await Promise.all([
      supabase
        .from("ota_channels")
        .select("*")
        .eq("accommodation_id", accId)
        .order("display_order", { ascending: true }),
      supabase
        .from("ota_channel_dismissed_defaults")
        .select("channel_code")
        .eq("accommodation_id", accId),
    ]);

    if (channelsRes.error) {
      toast({ title: "載入失敗", description: channelsRes.error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    let list = (channelsRes.data || []) as OtaChannel[];
    const dismissed = new Set(
      (dismissedRes.data || []).map((d: { channel_code: string }) => d.channel_code)
    );

    // Seed defaults that are neither present nor dismissed
    const missing = DEFAULT_CHANNELS.filter(
      (d) => !list.some((c) => c.channel_code === d.channel_code) && !dismissed.has(d.channel_code)
    );
    if (missing.length) {
      const { data: inserted, error: insertErr } = await supabase
        .from("ota_channels")
        .insert(
          missing.map((m) => ({
            accommodation_id: accId,
            channel_code: m.channel_code,
            channel_name: m.channel_name,
            display_order: m.display_order,
            is_enabled: false,
          }))
        )
        .select();
      if (!insertErr && inserted) {
        list = [...list, ...(inserted as OtaChannel[])].sort(
          (a, b) => a.display_order - b.display_order
        );
      }
    }

    setChannels(list);
    setLoading(false);
  }

  async function loadOwlting() {
    if (!accId) return;
    const [credRes, epRes] = await Promise.all([
      supabase
        .from("owlting_credentials")
        .select("id,hotel_code,username,is_active,updated_at")
        .eq("accommodation_id", accId)
        .maybeSingle(),
      supabase
        .from("owlting_ari_endpoints")
        .select("id,endpoint_url,remote_username,environment,is_active,last_pushed_at")
        .eq("accommodation_id", accId)
        .maybeSingle(),
    ]);
    setOwlCred((credRes.data as OwlTingCredential | null) ?? null);
    setOwlEndpoint((epRes.data as OwlTingEndpoint | null) ?? null);
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: "已複製", description: label }),
      () => toast({ title: "複製失敗", variant: "destructive" })
    );
  }

  function openCredDialog(rotate: boolean) {
    setCredForm({
      hotel_code: rotate && owlCred ? owlCred.hotel_code : "",
      username: rotate && owlCred ? owlCred.username : "",
      password: "",
    });
    setCredDialogOpen(true);
  }

  async function saveCred() {
    if (!accId) return;
    const hotel_code = credForm.hotel_code.trim();
    const username = credForm.username.trim();
    const password = credForm.password;
    if (!hotel_code || username.length < 4 || password.length < 8) {
      toast({
        title: "輸入不正確",
        description: "Hotel Code 必填、Username 至少 4 字、Password 至少 8 字",
        variant: "destructive",
      });
      return;
    }
    setCredSaving(true);
    const { error } = await supabase.rpc("upsert_owlting_credentials", {
      p_accommodation_id: accId,
      p_hotel_code: hotel_code,
      p_username: username,
      p_password: password,
    });
    setCredSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: owlCred ? "已更新認證" : "已建立認證" });
    setCredDialogOpen(false);
    void loadOwlting();
  }

  function openEndpointDialog() {
    setEndpointForm({
      endpoint_url: owlEndpoint?.endpoint_url || "",
      remote_username: owlEndpoint?.remote_username || "",
      remote_password: "",
      environment: owlEndpoint?.environment || "test",
    });
    setEndpointDialogOpen(true);
  }

  async function saveEndpoint() {
    if (!accId) return;
    const url = endpointForm.endpoint_url.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast({ title: "請輸入有效的 URL", variant: "destructive" });
      return;
    }
    setEndpointSaving(true);
    const payload: {
      accommodation_id: string;
      endpoint_url: string;
      remote_username: string | null;
      environment: string;
      is_active: boolean;
      remote_password?: string | null;
    } = {
      accommodation_id: accId,
      endpoint_url: url,
      remote_username: endpointForm.remote_username.trim() || null,
      environment: endpointForm.environment,
      is_active: true,
    };
    if (!owlEndpoint || endpointForm.remote_password.trim()) {
      payload.remote_password = endpointForm.remote_password || null;
    }
    const { error } = owlEndpoint
      ? await supabase.from("owlting_ari_endpoints").update(payload).eq("id", owlEndpoint.id)
      : await supabase.from("owlting_ari_endpoints").insert(payload);
    setEndpointSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "已儲存 ARI 推送端點" });
    setEndpointDialogOpen(false);
    void loadOwlting();
  }

  // Test our INBOUND AR content endpoint by sending an OTA_PingRQ from the browser.
  async function testInboundEndpoint() {
    setTestingInbound(true);
    setInboundResult(null);
    const pingXml = `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OTA_PingRQ xmlns="http://www.opentravel.org/OTA/2003/05" Version="1.0" TimeStamp="${new Date().toISOString()}">
      <EchoData>lakeze-inbound-test</EchoData>
    </OTA_PingRQ>
  </soap:Body>
</soap:Envelope>`;
    const startedAt = performance.now();
    try {
      const r = await fetch(inboundUrl, {
        method: "POST",
        headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"OTA_PingRQ"' },
        body: pingXml,
      });
      const text = await r.text();
      const elapsed = Math.round(performance.now() - startedAt);
      const ok = r.ok && /OTA_PingRS/i.test(text);
      const result: TestResult = {
        ok,
        status: r.status,
        elapsed_ms: elapsed,
        message: ok ? "端點有回應，OTA_PingRS 正常。" : `回應未通過驗證：HTTP ${r.status}`,
      };
      setInboundResult(result);
      toast({
        title: ok ? "AR 內容端點連線成功" : "AR 內容端點連線異常",
        description: `${elapsed}ms · HTTP ${r.status}`,
        variant: ok ? undefined : "destructive",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setInboundResult({ ok: false, message: msg });
      toast({ title: "連線失敗", description: msg, variant: "destructive" });
    } finally {
      setTestingInbound(false);
    }
  }

  // Test our OUTBOUND ARI push by asking the edge function to send an OTA_PingRQ to OwlTing.
  async function testOutboundEndpoint() {
    if (!accId) return;
    if (!owlEndpoint) {
      toast({ title: "請先設定 ARI 推送端點", variant: "destructive" });
      return;
    }
    setTestingOutbound(true);
    setOutboundResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("owlting-ari-push", {
        body: { accommodation_id: accId, mode: "ping" },
      });
      if (error) throw new Error(error.message);
      const ok = !!data?.success;
      const result: TestResult = {
        ok,
        status: data?.http_status,
        elapsed_ms: data?.elapsed_ms,
        message: ok
          ? "已成功推送 OTA_PingRQ 至 OwlTing。"
          : data?.error || `OwlTing 回應 HTTP ${data?.http_status ?? "?"}`,
      };
      setOutboundResult(result);
      toast({
        title: ok ? "ARI 推送端點連線成功" : "ARI 推送端點連線異常",
        description: `${data?.elapsed_ms ?? "?"}ms · HTTP ${data?.http_status ?? "?"}`,
        variant: ok ? undefined : "destructive",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOutboundResult({ ok: false, message: msg });
      toast({ title: "推送失敗", description: msg, variant: "destructive" });
    } finally {
      setTestingOutbound(false);
    }
  }

  async function runSoapSelfTest() {
    if (!accId) return;
    if (!owlCred?.hotel_code) {
      toast({ title: "請先建立 OwlTing 認證", description: "需要 Hotel Code 才能測試", variant: "destructive" });
      return;
    }
    setSoapTesting(true);
    setSoapResults(null);
    setSoapExpanded({});
    try {
      const { data, error } = await supabase.functions.invoke("owlting-cm-self-test", {
        body: { accommodation_id: accId },
      });
      if (error) throw new Error(error.message);
      const rows: SoapTestRow[] = data?.results ?? [];
      setSoapResults(rows);
      const okCount = rows.filter((r) => r.ok).length;
      toast({
        title: okCount === rows.length ? "全部通過" : `${okCount} / ${rows.length} 通過`,
        description: rows.map((r) => `${r.method}: ${r.ok ? "OK" : "FAIL"}`).join(" · "),
        variant: okCount === rows.length ? undefined : "destructive",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: "測試失敗", description: msg, variant: "destructive" });
    } finally {
      setSoapTesting(false);
    }
  }

  const isDefaultChannel = (code: string) =>
    DEFAULT_CHANNELS.some((d) => d.channel_code === code);

  async function deleteChannel(channel: OtaChannel) {
    if (!accId) return;
    const { error } = await supabase
      .from("ota_channels")
      .delete()
      .eq("id", channel.id);
    if (error) {
      toast({ title: "刪除失敗", description: error.message, variant: "destructive" });
      return;
    }

    // Record dismissal so default channel is not auto-recreated next load
    if (isDefaultChannel(channel.channel_code)) {
      const { error: dismissErr } = await supabase
        .from("ota_channel_dismissed_defaults")
        .upsert(
          { accommodation_id: accId, channel_code: channel.channel_code },
          { onConflict: "accommodation_id,channel_code" }
        );
      if (dismissErr) {
        console.warn("Failed to record dismissal:", dismissErr.message);
      }
    }

    setChannels((prev) => prev.filter((c) => c.id !== channel.id));
    toast({ title: "已刪除", description: channel.channel_name });
    setDeleting(null);
  }

  async function toggleEnabled(channel: OtaChannel, next: boolean) {
    if (next && !channel.hotel_id) {
      toast({
        title: "請先設定 Hotel ID",
        description: `啟用 ${channel.channel_name} 前，需要先填入 Hotel ID。`,
      });
      openEdit(channel);
      return;
    }
    const { error } = await supabase
      .from("ota_channels")
      .update({ is_enabled: next })
      .eq("id", channel.id);
    if (error) {
      toast({ title: "更新失敗", description: error.message, variant: "destructive" });
      return;
    }
    setChannels((prev) =>
      prev.map((c) => (c.id === channel.id ? { ...c, is_enabled: next } : c))
    );
    toast({ title: next ? "已啟用" : "已停用", description: channel.channel_name });
  }

  function openEdit(channel: OtaChannel) {
    setEditing(channel);
    setForm({ hotel_id: channel.hotel_id || "", notes: channel.notes || "" });
  }

  async function saveEdit() {
    if (!editing) return;
    const { error } = await supabase
      .from("ota_channels")
      .update({
        hotel_id: form.hotel_id.trim() || null,
        notes: form.notes.trim() || null,
      })
      .eq("id", editing.id);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    setChannels((prev) =>
      prev.map((c) =>
        c.id === editing.id
          ? { ...c, hotel_id: form.hotel_id.trim() || null, notes: form.notes.trim() || null }
          : c
      )
    );
    toast({ title: "已儲存", description: editing.channel_name });
    setEditing(null);
  }

  if (!accId) return null;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="通路管理" icon={Plug} />

      <OwlTingEmailStatsCards />

      <AccommodationOwnersManagement
        accommodationId={accId}
        title="奧丁丁訂單接收 Email"
        description="此處設定的 Email 會收到本民宿奧丁丁訂單的 PII 補單通知。總部後台會同步顯示，亦可由總部新增 / 編輯。"
      />


      {/* 台灣旅圖設定 */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Plug className="h-5 w-5 text-primary" />
                台灣旅圖訂房 API
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                透過 VPS 固定 IP（68.178.175.73）連接台灣旅圖 CIDDistributor 查詢 API。
              </p>
            </div>
            <div className="flex gap-2">
              {tmMapping?.is_enabled ? (
                <Badge className="bg-primary text-primary-foreground">已啟用</Badge>
              ) : (
                <Badge variant="secondary">{tmMapping ? "已停用" : "尚未設定"}</Badge>
              )}
              <Button size="sm" variant={tmMapping ? "outline" : "default"} onClick={openTmDialog}>
                {tmMapping ? "編輯" : "設定"}
              </Button>
            </div>
          </div>

          {tmMapping && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm border rounded-lg p-4">
              <div>
                <span className="text-muted-foreground text-xs">CID Code</span>
                <p className="font-mono">{tmMapping.cid_code}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Hotel Code</span>
                <p className="font-mono">{tmMapping.hotel_code || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">環境</span>
                <p className="font-mono">{tmMapping.api_environment}</p>
              </div>
            </div>
          )}

          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  連線測試
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  以今日入住、明日退房試呼叫 SearchAll，驗證 IP 白名單與帳密設定。
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={testTmConnection} disabled={tmTesting || !tmMapping?.is_enabled}>
                {tmTesting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                測試連線
              </Button>
            </div>
            {tmResult && (
              <div className={`flex items-start gap-2 text-xs ${tmResult.ok ? "text-primary" : "text-destructive"}`}>
                {tmResult.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>
                  {tmResult.message}
                  {tmResult.elapsed_ms !== undefined && <> · {tmResult.elapsed_ms}ms</>}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 台灣旅圖設定 Dialog */}
      <Dialog open={tmDialogOpen} onOpenChange={setTmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tmMapping ? "編輯台灣旅圖設定" : "設定台灣旅圖"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tm_cid">CID Code *</Label>
              <Input
                id="tm_cid"
                value={tmForm.cid_code}
                onChange={(e) => setTmForm((f) => ({ ...f, cid_code: e.target.value }))}
                placeholder="台灣旅圖分配的 CID 代碼"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tm_hotel">Hotel Code</Label>
              <Input
                id="tm_hotel"
                value={tmForm.hotel_code}
                onChange={(e) => setTmForm((f) => ({ ...f, hotel_code: e.target.value }))}
                placeholder="選填"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tm_env">API 環境</Label>
              <select
                id="tm_env"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={tmForm.api_environment}
                onChange={(e) => setTmForm((f) => ({ ...f, api_environment: e.target.value }))}
              >
                <option value="production">production（booking.taiwantravelmap.com）</option>
                <option value="uat">uat（booking.travelmap.com.tw）</option>
              </select>
            </div>
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <Label htmlFor="tm_enabled" className="cursor-pointer">啟用</Label>
                <p className="text-xs text-muted-foreground mt-1">關閉後查詢 API 將回 404。</p>
              </div>
              <Switch
                id="tm_enabled"
                checked={tmForm.is_enabled}
                onCheckedChange={(c) => setTmForm((f) => ({ ...f, is_enabled: c }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tm_notes">備註</Label>
              <Textarea
                id="tm_notes"
                value={tmForm.notes}
                onChange={(e) => setTmForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTmDialogOpen(false)}>取消</Button>
            <Button onClick={saveTm} disabled={tmSaving}>
              {tmSaving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={credDialogOpen} onOpenChange={setCredDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{owlCred ? "輪替 OwlTing 認證" : "建立 OwlTing 認證"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ow_hotel_code">Hotel Code</Label>
              <Input
                id="ow_hotel_code"
                value={credForm.hotel_code}
                onChange={(e) => setCredForm((f) => ({ ...f, hotel_code: e.target.value }))}
                placeholder="OwlTing 分配的 Hotel Code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ow_username">Username</Label>
              <Input
                id="ow_username"
                value={credForm.username}
                onChange={(e) => setCredForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="至少 4 個字元"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ow_password">Password</Label>
              <Input
                id="ow_password"
                type="password"
                value={credForm.password}
                onChange={(e) => setCredForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="至少 8 個字元，將以 SHA-256 加密儲存"
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">
                密碼僅以雜湊形式儲存，請務必複製本次輸入並妥善保存。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredDialogOpen(false)}>取消</Button>
            <Button onClick={saveCred} disabled={credSaving}>
              {credSaving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* OwlTing ARI 端點 Dialog */}
      <Dialog open={endpointDialogOpen} onOpenChange={setEndpointDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{owlEndpoint ? "編輯 ARI 推送端點" : "設定 ARI 推送端點"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ep_url">Endpoint URL</Label>
              <Input
                id="ep_url"
                value={endpointForm.endpoint_url}
                onChange={(e) => setEndpointForm((f) => ({ ...f, endpoint_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ep_user">Remote Username</Label>
                <Input
                  id="ep_user"
                  value={endpointForm.remote_username}
                  onChange={(e) => setEndpointForm((f) => ({ ...f, remote_username: e.target.value }))}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ep_pass">Remote Password</Label>
                <Input
                  id="ep_pass"
                  type="password"
                  value={endpointForm.remote_password}
                  onChange={(e) => setEndpointForm((f) => ({ ...f, remote_password: e.target.value }))}
                  autoComplete="new-password"
                />
                {owlEndpoint && (
                  <p className="text-xs text-muted-foreground">
                    已安全保存；留空會保留目前密碼，輸入新值才會更新。
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep_env">環境</Label>
              <select
                id="ep_env"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={endpointForm.environment}
                onChange={(e) => setEndpointForm((f) => ({ ...f, environment: e.target.value }))}
              >
                <option value="test">test</option>
                <option value="production">production</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndpointDialogOpen(false)}>取消</Button>
            <Button onClick={saveEndpoint} disabled={endpointSaving}>
              {endpointSaving ? "儲存中..." : "儲存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
