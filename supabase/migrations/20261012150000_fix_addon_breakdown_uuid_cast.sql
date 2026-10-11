-- 修正 ai_metric_addon_breakdown：addon_setting 事件的 ref_id 為品項名稱（text），
-- 原 JOIN 以 ref_id::uuid 比對（即使有正則守門，Postgres 不保證短路）造成 22P02。
-- 參數與回傳欄位完全不變；所有 uuid 比對改為 id::text = ref_id，不再對事件欄位做 ::uuid 轉型。
CREATE OR REPLACE FUNCTION public.ai_metric_addon_breakdown(
  p_from date, p_to date, p_accommodation_ids uuid[] DEFAULT NULL, p_channel text DEFAULT NULL, p_attribution_days integer DEFAULT 7
)
RETURNS TABLE (
  accommodation_id uuid, ref_type text, ref_id text, item_name text, shown bigint, purchased_qty bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz := (p_from::timestamp AT TIME ZONE 'Asia/Taipei');
  v_end   timestamptz := ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Taipei');
BEGIN
  PERFORM public.ai_metric_require_hq();
  IF p_to < p_from THEN RAISE EXCEPTION 'p_to must be >= p_from'; END IF;

  RETURN QUERY
  WITH ev_all AS (
    SELECT ce.* FROM public.ai_metric_clean_events() ce
    WHERE ce.event_type IN ('addon_rec_shown', 'addon_purchased') AND ce.ref_id IS NOT NULL
      AND (p_accommodation_ids IS NULL OR ce.accommodation_id = ANY (p_accommodation_ids))
      AND (p_channel IS NULL OR ce.channel = p_channel)
  ),
  ev AS (SELECT ea.* FROM ev_all ea WHERE ea.created_at >= v_start AND ea.created_at < v_end),
  sh_agg AS (
    SELECT e.accommodation_id, e.ref_type, e.ref_id, count(*) AS shown
    FROM ev e WHERE e.event_type = 'addon_rec_shown'
    GROUP BY e.accommodation_id, e.ref_type, e.ref_id
  ),
  bought AS (
    SELECT p.accommodation_id, p.ref_type, p.ref_id,
      sum(GREATEST(CASE WHEN (p.metadata->>'qty') ~ '^[0-9]+(\.[0-9]+)?$' THEN (p.metadata->>'qty')::numeric ELSE 1 END, 1)) AS qty
    FROM ev p
    WHERE p.event_type = 'addon_purchased'
      AND ((p.metadata->>'order_id') IS NULL
           OR (p.metadata->>'order_id') NOT IN (SELECT x.id::text FROM public.ai_metric_excluded_order_ids() AS x(id)))
      AND EXISTS (
        SELECT 1 FROM ev_all s
        WHERE s.event_type = 'addon_rec_shown'
          AND s.accommodation_id IS NOT DISTINCT FROM p.accommodation_id
          AND s.ref_id = p.ref_id
          AND s.created_at <= p.created_at
          AND p.created_at <= s.created_at + make_interval(days => GREATEST(p_attribution_days, 0))
          AND ((p.line_user_id IS NOT NULL AND s.line_user_id = p.line_user_id)
               OR (p.line_user_id IS NULL AND p.session_key IS NOT NULL AND s.session_key = p.session_key))
      )
    GROUP BY p.accommodation_id, p.ref_type, p.ref_id
  ),
  keys AS (
    SELECT sh.accommodation_id, sh.ref_type, sh.ref_id FROM sh_agg sh
    UNION SELECT b.accommodation_id, b.ref_type, b.ref_id FROM bought b
  )
  SELECT k.accommodation_id, k.ref_type, k.ref_id,
    CASE WHEN k.ref_type = 'trip_product'
         THEN COALESCE(NULLIF(tp.name->>'zh', ''), NULLIF(tp.name->>'en', ''), tp.name::text, k.ref_id)
         ELSE k.ref_id END AS item_name,
    COALESCE(sh.shown, 0)::bigint AS shown,
    COALESCE(b.qty, 0)::bigint AS purchased_qty
  FROM keys k
  LEFT JOIN sh_agg sh ON sh.accommodation_id IS NOT DISTINCT FROM k.accommodation_id AND sh.ref_type = k.ref_type AND sh.ref_id = k.ref_id
  LEFT JOIN bought b ON b.accommodation_id IS NOT DISTINCT FROM k.accommodation_id AND b.ref_type = k.ref_type AND b.ref_id = k.ref_id
  LEFT JOIN public.trip_products tp
    ON k.ref_type = 'trip_product' AND tp.id::text = k.ref_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metric_addon_breakdown(date, date, uuid[], text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_addon_breakdown(date, date, uuid[], text, integer) TO authenticated;
