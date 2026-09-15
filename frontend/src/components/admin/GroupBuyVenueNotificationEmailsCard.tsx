import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { NotificationEmailListField } from "@/components/admin/NotificationEmailListField";
import { normalizeNotificationEmails, validateNotificationEmails } from "@/lib/notificationEmails";

interface Props {
  accommodationId: string | null;
}

/**
 * 團購通知信箱（民宿預設層）。
 * 寫入 accommodation_notification_settings.booking_notification_emails，
 * 後端僅由 group-buy-* 函式經 resolveOrderNotifyEmails() 讀取，與一般訂房確認信無關。
 * 一般訂房的民宿端副本請見「官網內容 → 訂房確認信」的 booking_confirmation_emails。
 */
export function GroupBuyVenueNotificationEmailsCard({ accommodationId }: Props) {
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
      if (!cancelled) setEmails((data?.booking_notification_emails as string[] | null) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [accommodationId]);

  const save = async () => {
    if (!accommodationId) return;
    const err = validateNotificationEmails(emails);
    if (err) {
      toast({ title: "無法儲存", description: err, variant: "destructive" });
      return;
    }
    setSaving(true);
    const normalized = normalizeNotificationEmails(emails);
    const { error } = await supabase
      .from("accommodation_notification_settings")
      .upsert(
        { accommodation_id: accommodationId, booking_notification_emails: normalized },
        { onConflict: "accommodation_id" },
      );
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    setEmails(normalized);
    toast({ title: "已儲存團購通知信箱" });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div>
            <CardTitle className="text-xl">📥 團購通知信箱（民宿預設）</CardTitle>
            <CardDescription>
              團購新訂單、團購匯款回報時寄送通知給以下信箱。未在下方個別活動設定自訂信箱時，一律以這裡為準。
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <NotificationEmailListField value={emails} onChange={setEmails} disabled={!accommodationId} />
        <p className="text-xs text-muted-foreground">
          此設定僅用於團購。一般訂房確認信的民宿端副本請到「官網內容 → 訂房確認信」設定。
        </p>
        <Button onClick={save} disabled={saving || !accommodationId}>
          {saving ? "儲存中…" : "儲存團購通知信箱"}
        </Button>
      </CardContent>
    </Card>
  );
}
