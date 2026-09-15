
-- 1) Atomic claim RPC: SELECT ... FOR UPDATE SKIP LOCKED then flip to 'sending'
CREATE OR REPLACE FUNCTION public.claim_hotelnabe_ari_push_batch(_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid,
  accommodation_id uuid,
  room_type_id uuid,
  from_date date,
  to_date date,
  reason text,
  attempt_count int,
  next_retry_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM public.hotelnabe_ari_push_queue q
    WHERE q.status = 'pending'
      AND (q.next_retry_at IS NULL OR q.next_retry_at <= now())
    ORDER BY q.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.hotelnabe_ari_push_queue q
     SET status = 'sending', updated_at = now()
    FROM picked
   WHERE q.id = picked.id
  RETURNING q.id, q.accommodation_id, q.room_type_id, q.from_date, q.to_date,
            q.reason, q.attempt_count, q.next_retry_at;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_hotelnabe_ari_push_batch(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_hotelnabe_ari_push_batch(int) TO service_role;

-- 2) Statement-level AFTER INSERT trigger: fire worker once per insert statement
CREATE OR REPLACE FUNCTION public.trigger_hotelnabe_push_worker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire-and-forget async HTTP call; ignore errors so DML never fails.
  BEGIN
    PERFORM net.http_post(
      url := 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/hotelnabe-push-inventory-worker',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtYWZxd2Z5bmF0ZHZuYWVvdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyOTQ1MDIsImV4cCI6MjA3Njg3MDUwMn0.75m5g9_U-Yg30NzpSGO5kvsSVY5kmeFsh6B_rN0qXns"}'::jsonb,
      body := jsonb_build_object('triggered_by','queue_insert','at', now())
    );
  EXCEPTION WHEN OTHERS THEN
    -- swallow
    NULL;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotelnabe_push_queue_insert ON public.hotelnabe_ari_push_queue;
CREATE TRIGGER trg_hotelnabe_push_queue_insert
AFTER INSERT ON public.hotelnabe_ari_push_queue
FOR EACH STATEMENT
EXECUTE FUNCTION public.trigger_hotelnabe_push_worker();

-- 3) Change cron from every minute to every 5 minutes (safety net)
SELECT cron.unschedule('hotelnabe-ari-worker-every-minute');

SELECT cron.schedule(
  'hotelnabe-ari-worker-every-5min',
  '*/5 * * * *',
  $CRON$
  SELECT net.http_post(
    url := 'https://dmafqwfynatdvnaeovhz.supabase.co/functions/v1/hotelnabe-push-inventory-worker',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtYWZxd2Z5bmF0ZHZuYWVvdmh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEyOTQ1MDIsImV4cCI6MjA3Njg3MDUwMn0.75m5g9_U-Yg30NzpSGO5kvsSVY5kmeFsh6B_rN0qXns"}'::jsonb,
    body := jsonb_build_object('triggered_by','cron','at', now())
  );
  $CRON$
);
