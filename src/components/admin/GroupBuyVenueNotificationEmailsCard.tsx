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

/** 民宿層「訂房通知信箱」（獨立私有表，前台無法讀取） */
export function BookingNotificationEmailsCard({ accommodationId }: Props) {
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
    toast({ title: "已儲存訂房通知信箱" });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div>
            <CardTitle className="text-xl">📥 訂房通知</CardTitle>
            <CardDescription>
              當有需要人工處理的訂房事件時，可寄送通知至以下信箱。目前實際使用情境：團購新訂單、團購匯款回報。
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <NotificationEmailListField value={emails} onChange={setEmails} disabled={!accommodationId} />
        <p className="text-xs text-muted-foreground">
          一般訂房通知目前尚未啟用 Email，本設定暫供團購使用。
        </p>
        <Button onClick={save} disabled={saving || !accommodationId}>
          {saving ? "儲存中…" : "儲存訂房通知信箱"}
        </Button>
      </CardContent>
    </Card>
  );
}
