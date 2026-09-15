select cron.schedule(
  'group-buy-expire-orders-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/group-buy-expire-orders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);