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
import { Settings2, Plug, Trash2, Copy, KeyRound, Send } from "lucide-react";

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

export default function ChannelManager() {
  const { currentAccommodationId } = useAccommodation();
  const { toast } = useToast();
  const [channels, setChannels] = useState<OtaChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OtaChannel | null>(null);
  const [form, setForm] = useState({ hotel_id: "", notes: "" });
  const [deleting, setDeleting] = useState<OtaChannel | null>(null);
  const accId = currentAccommodationId;

  useEffect(() => {
    if (!accId) return;
    void loadChannels();
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
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Plug className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">通路管理</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理各 OTA 平台串接狀態與 Hotel ID。串接 API 將於後續階段啟用。
          </p>
        </div>
      </div>

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
