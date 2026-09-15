
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='hotelnabe-ari-worker-every-minute') THEN
    PERFORM cron.unschedule('hotelnabe-ari-worker-every-minute');
  END IF;
END $$;

SELECT cron.schedule(
  'hotelnabe-ari-worker-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/hotelnabe-push-inventory-worker',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtYWZxd2Z5bmF0ZHZuYWVvdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyOTQ1MDIsImV4cCI6MjA3Njg3MDUwMn0.75m5g9_U-Yg30NzpSGO5kvsSVY5kmeFsh6B_rN0qXns"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $cron$
);
