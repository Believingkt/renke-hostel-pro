DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job WHERE command LIKE '%cancel-expired-atm-orders%' LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'cancel-expired-atm-orders-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/cancel-expired-atm-orders',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtYWZxd2Z5bmF0ZHZuYWVvdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyOTQ1MDIsImV4cCI6MjA3Njg3MDUwMn0.75m5g9_U-Yg30NzpSGO5kvsSVY5kmeFsh6B_rN0qXns"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);