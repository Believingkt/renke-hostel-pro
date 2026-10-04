import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@lakeze/shared/components/ui/card";
import { Button } from "@lakeze/shared/components/ui/button";
import { supabase } from "@lakeze/shared/integrations/supabase/client";
import { toast } from "@lakeze/shared/hooks/use-toast";
import { NotificationEmailListField } from "@/components/admin/NotificationEmailListField";
import { normalizeNotificationEmails, validateNotificationEmails } from "@/lib/notificationEmails";

interface Props {
  accommodationId: string | null;
}

/**
 * 一般訂房確認信的民宿端副本（bcc）收件人。
 * 寫入 accommodation_notification_settings.booking_confirmation_emails，
 * 與團購專用的 booking_notification_emails 完全獨立，兩者不合併。
 */
export function BookingConfirmationRecipientsCard({ accommodationId }: Props) {
  const [emails, setEmails] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accommodationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("accommodation_notification_settings")
        .select("booking_confirmation_emails")
        .eq("accommodation_id", accommodationId)
        .maybeSingle();
      if (!cancelled) setEmails((data?.booking_confirmation_emails as string[] | null) ?? []);
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
        { accommodation_id: accommodationId, booking_confirmation_emails: normalized },
        { onConflict: "accommodation_id" },
      );
    setSaving(false);
    if (error) {
      toast({ title: "儲存失敗", description: error.message, variant: "destructive" });
      return;
    }
    setEmails(normalized);
    toast({ title: normalized.length > 0 ? "已儲存訂房確認信副本收件人" : "已改為只寄給客人" });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-1.5 bg-primary rounded-full" />
          <div>
            <CardTitle className="text-xl">📧 訂房確認信副本（民宿端）</CardTitle>
            <CardDescription>
              客人成立訂單、或訂單改期時，系統寄給客人的那封訂房確認信會同時密件副本給以下信箱。留空＝只寄給客人。
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <NotificationEmailListField value={emails} onChange={setEmails} disabled={!accommodationId} />
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <p>· 會寄副本的情況：客人首次訂房成功、後台人員改期、客人自行改期。</p>
          <p>· 不會寄副本的情況：客人在會員中心自行按「重寄確認信」（內容沒有任何異動）。</p>
          <p>· 此設定僅用於一般訂房。團購通知信箱請到「團購管理 → 通知設定」設定，兩者互不相干。</p>
        </div>
        <Button onClick={save} disabled={saving || !accommodationId}>
          {saving ? "儲存中…" : "儲存副本收件人"}
        </Button>
      </CardContent>
    </Card>
  );
}
