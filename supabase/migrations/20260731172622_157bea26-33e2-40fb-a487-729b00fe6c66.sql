-- Remove the three cron jobs that called super_admin-protected edge functions
-- with only the anon apikey (they were rejected with 401 since deployment).
SELECT cron.unschedule('calculate-scout-payout-daily');
SELECT cron.unschedule('create-commission-snapshots-daily');
SELECT cron.unschedule('create-commission-adjustments-daily');

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
