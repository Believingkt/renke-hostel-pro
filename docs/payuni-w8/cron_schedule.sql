-- PAYUNi W8 撥款明細同步排程（台北 10:00 = UTC 02:00），同步「昨天」；由 Claude 建立
-- 與 W6 相同：x-internal-secret 取自 vault 的 payuni_sweep_secret；<PROJECT_REF> 請換成專案代碼
SELECT cron.schedule('payuni-grant-sync-1000', '0 2 * * *', $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/payuni-grant-sync',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'payuni_sweep_secret')),
    body := '{"action":"run"}'::jsonb, timeout_milliseconds := 150000);
$$);
-- 移除：SELECT cron.unschedule('payuni-grant-sync-1000');
