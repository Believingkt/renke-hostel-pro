import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { NotificationEmailListField } from "@/components/admin/NotificationEmailListField";
import { normalizeNotificationEmails, validateNotificationEmails } from "@/lib/notificationEmails";

interface Props {
  campaignId: string | null;
  accommodationId: string | null;
}

/** 團購活動層通知信箱覆寫（未啟用時 fallback 民宿設定，不複製存入） */
export function GroupBuyNotificationSettings({ campaignId, accommodationId }: Props) {
  const [venueEmails, setVenueEmails] = useState<string[]>([]);
  const [override, setOverride] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("accommodation_notification_settings")
        .select("booking_notification_emails")
        .eq("accommodation_id", accommodationId)
        .maybeSingle();
      if (!cancelled) setVenueEmails((data?.booking_notification_emails as string[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("group_buy_campaign_notification_settings")
        .select("notification_emails")
        .eq("campaign_id", campaignId)
        .maybeSingle();
      const list = (data?.notification_emails as string[] | null) ?? [];
      if (cancelled) return;
      setEmails(list);
      setOverride(list.length > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const save = async () => {
    if (!campaignId) return;
    const next = override ? emails : [];
    const err = validateNotificationEmails(next);
    if (err) {
      toast({ title: "無法儲存", description: err, variant: "destructive" });
      return;
    }
    const normalized = normalizeNotificationEmails(next);
    if (override && normalized.length === 0) {
      toast({ title: "無法儲存", description: "已啟用自訂通知信箱，請至少填寫一組有效 Email", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("group_buy_campaign_notification_settings")
      .upsert({ campaign_id: campaignId, notification_emails: normalized }, { onConflict: "campaign_id" });
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    setEmails(normalized);
    toast({ title: normalized.length > 0 ? "已儲存此活動通知信箱" : "已改為沿用民宿設定" });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-lg">通知設定</CardTitle>
        <CardDescription>
          團購新訂單與匯款回報時，系統會寄送通知信給以下信箱。未設定時，沿用民宿預設訂房通知信箱。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium mb-1">沿用民宿設定：</p>
          {venueEmails.length > 0
            ? <ul className="text-muted-foreground space-y-0.5">{venueEmails.map((e) => <li key={e}>{e}</li>)}</ul>
            : <p className="text-muted-foreground">民宿尚未設定訂房通知信箱（此活動將不寄送民宿通知）。</p>}
        </div>

        <div className="flex items-center gap-3">
          <Switch id="gb-notify-override" checked={override} onCheckedChange={setOverride} />
          <Label htmlFor="gb-notify-override">自訂此活動通知信箱</Label>
        </div>

        {override && (
          <>
            <NotificationEmailListField value={emails} onChange={setEmails} />
            <p className="text-xs text-muted-foreground">
              啟用後此活動「完全使用」自訂信箱，不會與民宿預設合併寄送。
            </p>
          </>
        )}

        <Button onClick={save} disabled={saving || !campaignId}>
          {saving ? "儲存中…" : "儲存通知設定"}
        </Button>
      </CardContent>
    </Card>
  );
}
