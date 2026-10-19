-- PAYUNi W6 每日對帳排程（台北 03:30／03:45／04:00 = UTC 19:30／19:45／20:00）；同一日期未查完會接續同一筆 run
-- 與 sweep 相同：x-internal-secret 取自 vault 的 payuni_sweep_secret；<PROJECT_REF> 請換成專案代碼
SELECT cron.schedule('payuni-reconcile-0330', '30 19 * * *', $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/payuni-reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'payuni_sweep_secret')),
    body := '{"action":"run"}'::jsonb, timeout_milliseconds := 150000);
$$);
SELECT cron.schedule('payuni-reconcile-0345', '45 19 * * *', $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/payuni-reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'payuni_sweep_secret')),
    body := '{"action":"run"}'::jsonb, timeout_milliseconds := 150000);
$$);
SELECT cron.schedule('payuni-reconcile-0400', '0 20 * * *', $$
  SELECT net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/payuni-reconcile',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'payuni_sweep_secret')),
    body := '{"action":"run"}'::jsonb, timeout_milliseconds := 150000);
$$);
