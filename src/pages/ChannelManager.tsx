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
import { Settings2, Plug, Trash2, Copy, KeyRound, Send, Activity, Loader2, CheckCircle2, XCircle, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

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

interface OwlTingEndpoint {
  id: string;
  endpoint_url: string;
  remote_username: string | null;
  remote_password: string | null;
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

  const accId = currentAccommodationId;
  const inboundUrl = `${SUPABASE_URL}/functions/v1/owlting-content`;
  const outboundUrl = `${SUPABASE_URL}/functions/v1/owlting-ari-push`;

  useEffect(() => {
    if (!accId) return;
    void loadChannels();
    void loadOwlting();
  }, [accId]);

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
        .select("id,endpoint_url,remote_username,remote_password,environment,is_active,last_pushed_at")
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
      remote_password: owlEndpoint?.remote_password || "",
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
    const payload = {
      accommodation_id: accId,
      endpoint_url: url,
      remote_username: endpointForm.remote_username.trim() || null,
      remote_password: endpointForm.remote_password || null,
      environment: endpointForm.environment,
      is_active: true,
    };
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

      {loading ? null : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((channel) => (
            <Card key={channel.id} className="overflow-hidden">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base truncate">
                        {channel.channel_name}
                      </h3>
                      {channel.is_enabled ? (
                        <Badge className="bg-primary text-primary-foreground">啟用中</Badge>
                      ) : (
                        <Badge variant="secondary">未啟用</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      代碼：{channel.channel_code}
                    </p>
                  </div>
                  <Switch
                    checked={channel.is_enabled}
                    onCheckedChange={(v) => toggleEnabled(channel, v)}
                  />
                </div>

                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Hotel ID：</span>
                    <span className="font-mono">
                      {channel.hotel_id || <span className="text-muted-foreground">未設定</span>}
                    </span>
                  </div>
                  {channel.notes && (
                    <p className="text-muted-foreground text-xs line-clamp-2">{channel.notes}</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => openEdit(channel)}
                  >
                    <Settings2 className="h-4 w-4 mr-2" />
                    設定
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setDeleting(channel)}
                    aria-label={`刪除 ${channel.channel_name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* OwlTing 設定區塊 */}
      <Card className="overflow-hidden">
        <CardContent className="p-5 space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Plug className="h-5 w-5 text-primary" />
                OwlTing Channel Manager 介接
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                透過 OwlTing 統一連接 Booking.com / Agoda / Trip.com / Expedia 等通路。
              </p>
            </div>
            {owlCred?.is_active && owlEndpoint?.is_active ? (
              <Badge className="bg-primary text-primary-foreground">已設定</Badge>
            ) : (
              <Badge variant="secondary">尚未完成設定</Badge>
            )}
          </div>

          {/* Endpoint URLs (供 OwlTing 使用) */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">我方 AR 內容端點 (提供給 OwlTing 呼叫)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input value={inboundUrl} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(inboundUrl, "AR 內容端點")}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testInboundEndpoint}
                  disabled={testingInbound}
                  aria-label="測試 AR 內容端點"
                >
                  {testingInbound ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4 mr-1" />
                  )}
                  測試
                </Button>
              </div>
              {inboundResult && (
                <div className={`mt-2 flex items-start gap-2 text-xs ${inboundResult.ok ? "text-primary" : "text-destructive"}`}>
                  {inboundResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  )}
                  <span>
                    {inboundResult.message}
                    {inboundResult.status !== undefined && <> · HTTP {inboundResult.status}</>}
                    {inboundResult.elapsed_ms !== undefined && <> · {inboundResult.elapsed_ms}ms</>}
                  </span>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">我方 ARI 推送觸發端點 (內部使用，出站經 VPS 固定 IP Relay)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Input value={outboundUrl} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="sm" onClick={() => copyToClipboard(outboundUrl, "ARI 推送端點")}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={testOutboundEndpoint}
                  disabled={testingOutbound || !owlEndpoint}
                  title={!owlEndpoint ? "請先設定 ARI 推送端點" : "對 OwlTing 端點發送 OTA_PingRQ"}
                  aria-label="測試 ARI 推送端點"
                >
                  {testingOutbound ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Activity className="h-4 w-4 mr-1" />
                  )}
                  測試
                </Button>
              </div>
              {outboundResult && (
                <div className={`mt-2 flex items-start gap-2 text-xs ${outboundResult.ok ? "text-primary" : "text-destructive"}`}>
                  {outboundResult.ok ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  )}
                  <span>
                    {outboundResult.message}
                    {outboundResult.status !== undefined && <> · HTTP {outboundResult.status}</>}
                    {outboundResult.elapsed_ms !== undefined && <> · {outboundResult.elapsed_ms}ms</>}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Username / Password */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-medium flex items-center gap-2">
                  <KeyRound className="h-4 w-4" />
                  OwlTing 連入認證
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  OwlTing 呼叫我方端點時使用的 WS-Security UsernameToken。
                </p>
              </div>
              <Button size="sm" variant={owlCred ? "outline" : "default"} onClick={() => openCredDialog(!!owlCred)}>
                {owlCred ? "輪替密碼" : "建立認證"}
              </Button>
            </div>
            {owlCred ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">Hotel Code</span>
                  <p className="font-mono">{owlCred.hotel_code}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Username</span>
                  <p className="font-mono">{owlCred.username}</p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs">Password</span>
                  <p className="font-mono text-muted-foreground">••••••••（已加密儲存）</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚未建立。請建立一組認證資料提供給 OwlTing。</p>
            )}
          </div>

          {/* ARI Push Endpoint */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-medium flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  ARI 推送目的地 (OwlTing 提供)
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  我方主動推送 Availability / Rates / Inventory 至 OwlTing 的接收端點。
                </p>
              </div>
              <Button size="sm" variant={owlEndpoint ? "outline" : "default"} onClick={openEndpointDialog}>
                {owlEndpoint ? "編輯" : "設定端點"}
              </Button>
            </div>
            {owlEndpoint ? (
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">URL：</span>
                  <span className="font-mono text-xs break-all">{owlEndpoint.endpoint_url}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>環境：{owlEndpoint.environment}</span>
                  {owlEndpoint.remote_username && <span>Username：{owlEndpoint.remote_username}</span>}
                  {owlEndpoint.last_pushed_at && (
                    <span>最後推送：{new Date(owlEndpoint.last_pushed_at).toLocaleString()}</span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">尚未設定。請輸入 OwlTing 提供的接收 URL。</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* OwlTing 認證 Dialog */}
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


      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.channel_name} 設定</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hotel_id">Hotel ID</Label>
              <Input
                id="hotel_id"
                value={form.hotel_id}
                onChange={(e) => setForm((f) => ({ ...f, hotel_id: e.target.value }))}
                placeholder="例如：1234567"
              />
              <p className="text-xs text-muted-foreground">
                該平台分配給民宿的飯店代碼。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">備註</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="選填"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={saveEdit}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除通路？</AlertDialogTitle>
            <AlertDialogDescription>
              即將刪除「{deleting?.channel_name}」的設定，包含 Hotel ID 與備註。此動作無法復原。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && deleteChannel(deleting)}
            >
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
