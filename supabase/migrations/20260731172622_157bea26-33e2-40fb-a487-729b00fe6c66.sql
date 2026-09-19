-- Remove the three cron jobs that called super_admin-protected edge functions
-- with only the anon apikey (they were rejected with 401 since deployment).
-- 2026-09-19 遷移前置：改為存在才 unschedule（新專案不存在這些 job 時不會失敗）
DO $$ DECLARE n text; BEGIN
  FOREACH n IN ARRAY ARRAY['calculate-scout-payout-daily','create-commission-snapshots-daily','create-commission-adjustments-daily'] LOOP
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = n) THEN PERFORM cron.unschedule(n); END IF;
  END LOOP;
END $$;

-- Single dispatcher job. 23:59 Asia/Taipei == 15:59 UTC.
SELECT cron.schedule(
  'commission-cron-dispatcher-daily',
  '59 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/cron-dispatcher-commission',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtYWZxd2Z5bmF0ZHZuYWVvdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyOTQ1MDIsImV4cCI6MjA3Njg3MDUwMn0.75m5g9_U-Yg30NzpSGO5kvsSVY5kmeFsh6B_rN0qXns"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);
