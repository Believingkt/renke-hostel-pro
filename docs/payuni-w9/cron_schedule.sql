-- PAYUNi W9 平台費結果確認排程（台北 11:00 = UTC 03:00）：對 sent 的明細呼叫 agent_fee_query；由 Claude 建立
-- 與 W6／W8 相同：x-internal-secret 取自 vault 的 payuni_sweep_secret；<PROJECT_REF> 請換成專案代碼
SELECT cron.schedule('payuni-platform-fee-poll-1100', '0 3 * * *', $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/payuni-platform-fee-run',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'payuni_sweep_secret')),
    body := '{"action":"poll"}'::jsonb, timeout_milliseconds := 150000);
$$);
-- 移除：SELECT cron.unschedule('payuni-platform-fee-poll-1100');
