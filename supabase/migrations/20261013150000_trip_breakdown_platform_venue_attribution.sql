-- 行程推薦分析：平台入口（官網首頁小安、導引頁）事件 accommodation_id 為 null 時，
-- 依「行程所屬館別」（items room→room_types，否則 product→trip_products）歸列，而非整列排除。
-- 列館別 = COALESCE(事件 accommodation_id, 行程推導館別)；僅兩者皆推不出時才算未指定館別並排除。
-- 同一行程於同一（有效）館別只出一列（事件帶館別與推導館別相同時合併）。
-- 0 值列規則不變。簽名不變 → CREATE OR REPLACE（REVOKE/GRANT 於既有不變，仍補回確保一致）。
-- 不新增/修改/回填任何事件。

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
      count(*) FILTER (WHERE e.event_type = 'trip_rec_click') AS clicks,
      count(*) FILTER (WHERE e.event_type = 'trip_copy') AS copies,
      count(*) FILTER (WHERE e.event_type = 'trip_save') AS saves,
      count(*) FILTER (WHERE e.event_type = 'trip_favorite') AS favorites,
      count(*) FILTER (WHERE e.event_type = 'trip_share') AS shares,
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
