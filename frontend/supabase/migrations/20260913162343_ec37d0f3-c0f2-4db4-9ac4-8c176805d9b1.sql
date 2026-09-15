ALTER TABLE public.accommodation_notification_settings
  ADD COLUMN IF NOT EXISTS booking_confirmation_emails text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN public.accommodation_notification_settings.booking_confirmation_emails IS
  '一般訂房確認信的民宿端副本收件人（bcc）。與 booking_notification_emails（團購專用）完全獨立，兩者不合併。';

COMMENT ON COLUMN public.accommodation_notification_settings.booking_notification_emails IS
  '團購通知信箱（民宿預設層），由 group-buy-* 函式經 resolveOrderNotifyEmails 讀取。與一般訂房無關。';