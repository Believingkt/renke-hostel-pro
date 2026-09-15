
DROP FUNCTION IF EXISTS public.claim_hotelnabe_ari_push_batch(int);

CREATE FUNCTION public.claim_hotelnabe_ari_push_batch(_limit int DEFAULT 200)
RETURNS TABLE (
  id uuid,
  accommodation_id uuid,
  room_type_id uuid,
  from_date date,
  to_date date,
  reason hotelnabe_ari_push_reason,
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
