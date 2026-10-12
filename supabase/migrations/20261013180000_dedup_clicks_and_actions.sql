-- 統計去重（原始事件全部保留，只在 RPC 計算時去重）：
--   被點擊數＝同一旅客(COALESCE(line_user_id,session_key))＋同一行程＋同一館別＋同一台北日 只計 1 次。
--   複製/收藏/分享＝同上，但不同動作類型各計 1。推薦總數維持每次曝光計一次。
-- 兩支函式簽名不變 → CREATE OR REPLACE（REVOKE/GRANT 一併重申以確保一致）。

CREATE OR REPLACE FUNCTION public.ai_metric_dashboard(
  p_from date,
  p_to date,
  p_accommodation_ids uuid[] DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_attribution_days integer DEFAULT 7,
  p_include_internal boolean DEFAULT false
)
RETURNS TABLE (
  accommodation_id uuid,
  m1_num bigint, m1_den bigint,
  m2_num bigint, m2_den bigint,
  n1_num bigint, n1_den bigint,
  n2_num bigint, n2_den bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz := (p_from::timestamp AT TIME ZONE 'Asia/Taipei');
  v_end   timestamptz := ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Taipei');
BEGIN
  PERFORM public.ai_metric_require_hq();
  IF p_to < p_from THEN RAISE EXCEPTION 'p_to must be >= p_from'; END IF;

  RETURN QUERY
  WITH
  ev_all AS (
    SELECT ce.* FROM public.ai_metric_clean_events(p_include_internal) ce
    WHERE (p_accommodation_ids IS NULL OR ce.accommodation_id = ANY (p_accommodation_ids))
      AND (p_channel IS NULL OR ce.channel = p_channel)
  ),
  ev AS (SELECT ea.* FROM ev_all ea WHERE ea.created_at >= v_start AND ea.created_at < v_end),
  m AS (
    SELECT e.accommodation_id,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), e.ref_id, (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) FILTER (WHERE e.event_type = 'trip_rec_click') AS m1_num,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_shown') AS m1_den,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), e.ref_id, e.event_type, (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) FILTER (WHERE e.event_type IN ('trip_save', 'trip_favorite', 'trip_share', 'trip_copy')) AS m2_num,
      count(*) FILTER (WHERE e.event_type = 'addon_rec_shown') AS n2_den
    FROM ev e GROUP BY e.accommodation_id
  ),
  n2_purchases AS (
    SELECT p.accommodation_id, p.id,
      GREATEST(CASE WHEN (p.metadata->>'qty') ~ '^[0-9]+(\.[0-9]+)?$' THEN (p.metadata->>'qty')::numeric ELSE 1 END, 1) AS qty
    FROM ev p
    WHERE p.event_type = 'addon_purchased'
      AND NOT ((p.metadata->>'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               AND (p.metadata->>'order_id')::uuid IN (SELECT public.ai_metric_excluded_order_ids()))
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
  ),
  n2 AS (SELECT np.accommodation_id, sum(np.qty)::bigint AS n2_num FROM n2_purchases np GROUP BY np.accommodation_id),
  sd_all AS (
    SELECT s.id, s.sent_at,
      CASE WHEN (c.content->>'accommodation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (c.content->>'accommodation_id')::uuid END AS accommodation_id
    FROM public.remarketing_sends s
    JOIN public.remarketing_campaigns c ON c.id = s.campaign_id
    LEFT JOIN public.traveler_profiles tp ON tp.id = s.traveler_profile_id
    WHERE s.status = 'sent' AND s.is_test = false
      AND s.sent_at >= v_start AND s.sent_at < v_end
      AND (p_channel IS NULL OR s.channel = p_channel)
      AND (s.recipient IS NULL OR lower(s.recipient) NOT IN (SELECT public.ai_metric_excluded_emails()))
      AND (tp.email IS NULL OR lower(tp.email) NOT IN (SELECT public.ai_metric_excluded_emails()))
  ),
  sends_f AS (SELECT sd.* FROM sd_all sd WHERE p_accommodation_ids IS NULL OR sd.accommodation_id = ANY (p_accommodation_ids)),
  n1 AS (
    SELECT sf.accommodation_id, count(*) AS n1_den,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.order_attributions oa JOIN public.orders o ON o.id = oa.order_id
        WHERE ((oa.last_utm_source = 'remarketing' AND oa.last_utm_content = sf.id::text)
            OR (oa.first_utm_source = 'remarketing' AND oa.first_utm_content = sf.id::text))
          AND o.order_status NOT IN ('cancelled', 'hold')
          AND o.created_at >= sf.sent_at
          AND o.id NOT IN (SELECT public.ai_metric_excluded_order_ids())
      )) AS n1_num
    FROM sends_f sf GROUP BY sf.accommodation_id
  ),
  keys AS (
    SELECT m.accommodation_id FROM m
    UNION SELECT n1.accommodation_id FROM n1
    UNION SELECT n2.accommodation_id FROM n2
  )
  SELECT k.accommodation_id,
    COALESCE(m.m1_num, 0)::bigint, COALESCE(m.m1_den, 0)::bigint,
    COALESCE(m.m2_num, 0)::bigint, COALESCE(m.m1_den, 0)::bigint,
    COALESCE(n1.n1_num, 0)::bigint, COALESCE(n1.n1_den, 0)::bigint,
    COALESCE(n2.n2_num, 0)::bigint, COALESCE(m.n2_den, 0)::bigint
  FROM keys k
  LEFT JOIN m  ON m.accommodation_id  IS NOT DISTINCT FROM k.accommodation_id
  LEFT JOIN n1 ON n1.accommodation_id IS NOT DISTINCT FROM k.accommodation_id
  LEFT JOIN n2 ON n2.accommodation_id IS NOT DISTINCT FROM k.accommodation_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metric_dashboard(date, date, uuid[], text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_dashboard(date, date, uuid[], text, integer, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.ai_metric_trip_breakdown(
  p_from date, p_to date, p_accommodation_ids uuid[] DEFAULT NULL, p_channel text DEFAULT NULL,
  p_include_internal boolean DEFAULT false
)
RETURNS TABLE (
  accommodation_id uuid, ref_id text, ref_source text, title_zh text,
  shown bigint, clicks bigint, engagements bigint, copies bigint, saves bigint, favorites bigint, shares bigint,
  has_events boolean
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
  WITH ev AS (
    -- 不在此排除 accommodation_id null，改由有效館別判斷
    SELECT ce.* FROM public.ai_metric_clean_events(p_include_internal) ce
    WHERE ce.ref_type = 'trip' AND ce.ref_id IS NOT NULL
      AND ce.created_at >= v_start AND ce.created_at < v_end
      AND (p_channel IS NULL OR ce.channel = p_channel)
  ),
  -- 依事件涉及的行程 ref_id 推導所屬館別（僅可對應 trips 的行程可推導）
  derived AS (
    SELECT r.ref_id,
      COALESCE(
        (SELECT rt.accommodation_id
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) it
         JOIN public.room_types rt
           ON (it->>'ref_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND rt.id = (it->>'ref_id')::uuid
         WHERE it->>'ref_type' = 'room' AND rt.accommodation_id IS NOT NULL
         LIMIT 1),
        (SELECT tp.accommodation_id
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) it
         JOIN public.trip_products tp
           ON (it->>'ref_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND tp.id = (it->>'ref_id')::uuid
         WHERE it->>'ref_type' = 'product' AND tp.accommodation_id IS NOT NULL
         LIMIT 1)
      ) AS acc
    FROM (SELECT DISTINCT e.ref_id,
            CASE WHEN e.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN e.ref_id::uuid END AS ref_uuid
          FROM ev e) r
    LEFT JOIN public.trips t ON t.id = r.ref_uuid
  ),
  -- 有效館別 = 事件 accommodation_id，null 時用推導館別；套用館別篩選
  evf AS (
    SELECT e.*, COALESCE(e.accommodation_id, d.acc) AS eff_acc
    FROM ev e
    LEFT JOIN derived d ON d.ref_id = e.ref_id
  ),
  evf2 AS (
    SELECT * FROM evf
    WHERE eff_acc IS NOT NULL
      AND (p_accommodation_ids IS NULL OR eff_acc = ANY (p_accommodation_ids))
  ),
  g AS (
    SELECT e.eff_acc AS accommodation_id, e.ref_id,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_shown') AS shown,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) FILTER (WHERE e.event_type = 'trip_rec_click') AS clicks,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) FILTER (WHERE e.event_type = 'trip_copy') AS copies,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) FILTER (WHERE e.event_type = 'trip_save') AS saves,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) FILTER (WHERE e.event_type = 'trip_favorite') AS favorites,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) FILTER (WHERE e.event_type = 'trip_share') AS shares,
      max(COALESCE(e.metadata->>'title', e.metadata->>'name')) AS meta_title,
      CASE WHEN e.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN e.ref_id::uuid END AS ref_uuid
    FROM evf2 e GROUP BY e.eff_acc, e.ref_id
  ),
  event_rows AS (
    SELECT g.accommodation_id, g.ref_id,
      CASE WHEN t.id IS NOT NULL THEN 'trip' WHEN tg.id IS NOT NULL THEN 'generation' END AS ref_source,
      COALESCE(
        NULLIF(t.title->>'zh', ''), NULLIF(t.title->>'en', ''),
        NULLIF(tg.payload->'title'->>'zh', ''), NULLIF(tg.payload->>'title', ''),
        NULLIF(g.meta_title, '')
      ) AS title_zh,
      g.shown, g.clicks, (g.copies + g.saves + g.favorites + g.shares) AS engagements,
      g.copies, g.saves, g.favorites, g.shares,
      true AS has_events
    FROM g
    LEFT JOIN public.trips t ON t.id = g.ref_uuid
    LEFT JOIN public.trip_generations tg ON tg.id = g.ref_uuid
  ),
  published_trips AS (
    SELECT t.id,
      COALESCE(NULLIF(t.title->>'zh', ''), NULLIF(t.title->>'en', '')) AS title_zh,
      COALESCE(
        (SELECT rt.accommodation_id
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) it
         JOIN public.room_types rt
           ON (it->>'ref_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND rt.id = (it->>'ref_id')::uuid
         WHERE it->>'ref_type' = 'room' AND rt.accommodation_id IS NOT NULL
         LIMIT 1),
        (SELECT tp.accommodation_id
         FROM jsonb_array_elements(CASE WHEN jsonb_typeof(t.items) = 'array' THEN t.items ELSE '[]'::jsonb END) it
         JOIN public.trip_products tp
           ON (it->>'ref_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND tp.id = (it->>'ref_id')::uuid
         WHERE it->>'ref_type' = 'product' AND tp.accommodation_id IS NOT NULL
         LIMIT 1)
      ) AS accommodation_id
    FROM public.trips t
    WHERE t.status = 'published'
      AND NOT EXISTS (
        SELECT 1 FROM public.ai_metric_events e2
        WHERE e2.ref_type = 'trip' AND e2.ref_id = t.id::text
          AND e2.event_type IN ('trip_rec_shown', 'trip_rec_click', 'trip_copy', 'trip_save', 'trip_favorite', 'trip_share')
      )
  ),
  zero_rows AS (
    SELECT pt.accommodation_id, pt.id::text AS ref_id, 'trip'::text AS ref_source, pt.title_zh,
      0::bigint AS shown, 0::bigint AS clicks, 0::bigint AS engagements,
      0::bigint AS copies, 0::bigint AS saves, 0::bigint AS favorites, 0::bigint AS shares,
      false AS has_events
    FROM published_trips pt
    WHERE pt.accommodation_id IS NOT NULL
      AND (p_accommodation_ids IS NULL OR pt.accommodation_id = ANY (p_accommodation_ids))
  )
  SELECT u.accommodation_id, u.ref_id, u.ref_source, u.title_zh,
    u.shown, u.clicks, u.engagements, u.copies, u.saves, u.favorites, u.shares, u.has_events
  FROM (
    SELECT * FROM event_rows
    UNION ALL
    SELECT * FROM zero_rows
  ) u
  ORDER BY u.has_events DESC, u.shown DESC, u.accommodation_id, u.title_zh NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metric_trip_breakdown(date, date, uuid[], text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_trip_breakdown(date, date, uuid[], text, boolean) TO authenticated;
