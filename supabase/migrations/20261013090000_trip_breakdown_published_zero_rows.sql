-- 行程推薦分析調整（參數不變，回傳新增 has_events boolean）：
-- 1) 已上架（trips.status='published'）但「不限日期從未有任何 trip_* 事件」的行程也列出 0 值列
--    - 館別歸屬：items 內 ref_type='room' 的 room_types.accommodation_id 優先；
--      若無 room，取 ref_type='product' 的 trip_products.accommodation_id（第一個非 null）；都沒有則不列。
--    - 0 值列：推薦總數/點擊等皆 0，來源以 ref_source='trip' 顯示「上架行程」。
-- 2) 不再列「平台（未指定館別）」：事件 accommodation_id IS NULL 一律排除（合計亦不含）。
-- 原則：全部即時彙總，不回填、不模擬；0 值列由 trips 當下狀態推導，無事件即為 0。

-- 回傳型別改變（新增 has_events），CREATE OR REPLACE 無法改回傳型別（42P13），需先 DROP 舊版。
DROP FUNCTION IF EXISTS public.ai_metric_trip_breakdown(date, date, uuid[], text);

CREATE OR REPLACE FUNCTION public.ai_metric_trip_breakdown(
  p_from date, p_to date, p_accommodation_ids uuid[] DEFAULT NULL, p_channel text DEFAULT NULL
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
    SELECT ce.* FROM public.ai_metric_clean_events() ce
    WHERE ce.ref_type = 'trip' AND ce.ref_id IS NOT NULL
      AND ce.accommodation_id IS NOT NULL
      AND ce.created_at >= v_start AND ce.created_at < v_end
      AND (p_accommodation_ids IS NULL OR ce.accommodation_id = ANY (p_accommodation_ids))
      AND (p_channel IS NULL OR ce.channel = p_channel)
  ),
  g AS (
    SELECT e.accommodation_id, e.ref_id,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_shown') AS shown,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_click') AS clicks,
      count(*) FILTER (WHERE e.event_type = 'trip_copy') AS copies,
      count(*) FILTER (WHERE e.event_type = 'trip_save') AS saves,
      count(*) FILTER (WHERE e.event_type = 'trip_favorite') AS favorites,
      count(*) FILTER (WHERE e.event_type = 'trip_share') AS shares,
      max(COALESCE(e.metadata->>'title', e.metadata->>'name')) AS meta_title,
      CASE WHEN e.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN e.ref_id::uuid END AS ref_uuid
    FROM ev e GROUP BY e.accommodation_id, e.ref_id
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
  -- 已上架行程：館別取 room_types 優先、再 trip_products；僅取從未有任何 trip_* 事件者
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
REVOKE ALL ON FUNCTION public.ai_metric_trip_breakdown(date, date, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_trip_breakdown(date, date, uuid[], text) TO authenticated;
