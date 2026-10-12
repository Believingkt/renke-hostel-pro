-- 點擊/互動一一對應曝光（rec_id 歸因；原始事件不刪不改不回填，只在 RPC 計算時歸因）：
--   新資料：trip_rec_shown 帶 metadata.rec_id；點擊/複製/收藏/分享亦帶 metadata.rec_id。
--     被點擊數＝count(DISTINCT rec_id)，只算 rec_id 對得到「同館同行程」曝光的點擊（對不到者不計）。
--     複製/收藏/分享同理：各動作各自 count(DISTINCT rec_id)。
--   舊資料（無 rec_id）：被點擊數／各動作數＝既有「同旅客＋同行程＋同館＋同台北日」去重數，
--     但每列（每動作）以該列曝光數為上限 LEAST(去重數, 曝光數)，不得超過曝光數。
--   綜合：每列每動作＝LEAST(新 rec_id 去重 ＋ 舊去重, 曝光數)。被點擊率保證 ≤100%。
--   互動（複製/收藏/分享）：各動作各自去重封頂後「相加」；同一次推薦可同時被複製＋收藏＋分享，
--     故互動比例可能 >100%（依口徑選項 b）。
-- 兩支函式簽名與回傳型別不變 → CREATE OR REPLACE（REVOKE/GRANT 一併重申以確保一致）。

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
  -- 每館曝光數（trip 與 addon 分母）
  shown_cnt AS (
    SELECT e.accommodation_id,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_shown') AS shown,
      count(*) FILTER (WHERE e.event_type = 'addon_rec_shown') AS n2_den
    FROM ev e GROUP BY e.accommodation_id
  ),
  -- 每館曝光編號集合（只收有 rec_id 的 shown）
  shown_recs AS (
    SELECT DISTINCT e.accommodation_id, (e.metadata->>'rec_id') AS rec_id
    FROM ev e
    WHERE e.event_type = 'trip_rec_shown' AND NULLIF(e.metadata->>'rec_id', '') IS NOT NULL
  ),
  -- 點擊：新資料（rec_id 對得到同館曝光）
  clk_new AS (
    SELECT e.accommodation_id, count(DISTINCT (e.metadata->>'rec_id')) AS n
    FROM ev e
    WHERE e.event_type = 'trip_rec_click' AND NULLIF(e.metadata->>'rec_id', '') IS NOT NULL
      AND EXISTS (SELECT 1 FROM shown_recs s
                  WHERE s.accommodation_id IS NOT DISTINCT FROM e.accommodation_id
                    AND s.rec_id = e.metadata->>'rec_id')
    GROUP BY e.accommodation_id
  ),
  -- 點擊：舊資料（無 rec_id，同旅客＋同行程＋同台北日去重）
  clk_old AS (
    SELECT e.accommodation_id,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), e.ref_id, (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) AS n
    FROM ev e
    WHERE e.event_type = 'trip_rec_click' AND NULLIF(e.metadata->>'rec_id', '') IS NULL
    GROUP BY e.accommodation_id
  ),
  -- 互動（複製/收藏/分享/save）：新資料，每動作各自 rec_id 去重
  act_new AS (
    SELECT e.accommodation_id, e.event_type, count(DISTINCT (e.metadata->>'rec_id')) AS n
    FROM ev e
    WHERE e.event_type IN ('trip_save', 'trip_favorite', 'trip_share', 'trip_copy')
      AND NULLIF(e.metadata->>'rec_id', '') IS NOT NULL
      AND EXISTS (SELECT 1 FROM shown_recs s
                  WHERE s.accommodation_id IS NOT DISTINCT FROM e.accommodation_id
                    AND s.rec_id = e.metadata->>'rec_id')
    GROUP BY e.accommodation_id, e.event_type
  ),
  -- 互動：舊資料，每動作各自去重
  act_old AS (
    SELECT e.accommodation_id, e.event_type,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), e.ref_id, (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) AS n
    FROM ev e
    WHERE e.event_type IN ('trip_save', 'trip_favorite', 'trip_share', 'trip_copy')
      AND NULLIF(e.metadata->>'rec_id', '') IS NULL
    GROUP BY e.accommodation_id, e.event_type
  ),
  -- 每動作 新+舊
  act_comb AS (
    SELECT COALESCE(an.accommodation_id, ao.accommodation_id) AS accommodation_id,
           COALESCE(an.event_type, ao.event_type) AS event_type,
           COALESCE(an.n, 0) + COALESCE(ao.n, 0) AS n
    FROM act_new an
    FULL JOIN act_old ao
      ON an.accommodation_id IS NOT DISTINCT FROM ao.accommodation_id AND an.event_type = ao.event_type
  ),
  -- 互動分子：每動作各自封頂於曝光數後相加（選項 b，允許 >100%）
  m2 AS (
    SELECT ac.accommodation_id, sum(LEAST(ac.n, COALESCE(sc.shown, 0)))::bigint AS m2_num
    FROM act_comb ac
    LEFT JOIN shown_cnt sc ON sc.accommodation_id IS NOT DISTINCT FROM ac.accommodation_id
    GROUP BY ac.accommodation_id
  ),
  m AS (
    SELECT sc.accommodation_id,
      LEAST(COALESCE(cn.n, 0) + COALESCE(co.n, 0), sc.shown)::bigint AS m1_num,
      sc.shown::bigint AS m1_den,
      COALESCE(m2.m2_num, 0)::bigint AS m2_num,
      sc.n2_den::bigint AS n2_den
    FROM shown_cnt sc
    LEFT JOIN clk_new cn ON cn.accommodation_id IS NOT DISTINCT FROM sc.accommodation_id
    LEFT JOIN clk_old co ON co.accommodation_id IS NOT DISTINCT FROM sc.accommodation_id
    LEFT JOIN m2 ON m2.accommodation_id IS NOT DISTINCT FROM sc.accommodation_id
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
    SELECT ce.* FROM public.ai_metric_clean_events(p_include_internal) ce
    WHERE ce.ref_type = 'trip' AND ce.ref_id IS NOT NULL
      AND ce.created_at >= v_start AND ce.created_at < v_end
      AND (p_channel IS NULL OR ce.channel = p_channel)
  ),
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
  -- 每（館,行程）曝光編號集合
  shown_recs AS (
    SELECT DISTINCT e.eff_acc, e.ref_id, (e.metadata->>'rec_id') AS rec_id
    FROM evf2 e
    WHERE e.event_type = 'trip_rec_shown' AND NULLIF(e.metadata->>'rec_id', '') IS NOT NULL
  ),
  -- 新資料：點擊/各動作 rec_id 去重（rec_id 需對得到同館同行程曝光）
  new_cnt AS (
    SELECT c.eff_acc, c.ref_id, c.event_type, count(DISTINCT c.rec_id) AS n
    FROM (
      SELECT e.eff_acc, e.ref_id, e.event_type, (e.metadata->>'rec_id') AS rec_id
      FROM evf2 e
      WHERE e.event_type IN ('trip_rec_click', 'trip_copy', 'trip_save', 'trip_favorite', 'trip_share')
        AND NULLIF(e.metadata->>'rec_id', '') IS NOT NULL
    ) c
    WHERE EXISTS (SELECT 1 FROM shown_recs s
                  WHERE s.eff_acc IS NOT DISTINCT FROM c.eff_acc AND s.ref_id = c.ref_id AND s.rec_id = c.rec_id)
    GROUP BY c.eff_acc, c.ref_id, c.event_type
  ),
  -- 舊資料：點擊/各動作無 rec_id，同旅客＋同台北日去重
  old_cnt AS (
    SELECT e.eff_acc, e.ref_id, e.event_type,
      count(DISTINCT (COALESCE(e.line_user_id, e.session_key, e.id::text), (e.created_at AT TIME ZONE 'Asia/Taipei')::date)) AS n
    FROM evf2 e
    WHERE e.event_type IN ('trip_rec_click', 'trip_copy', 'trip_save', 'trip_favorite', 'trip_share')
      AND NULLIF(e.metadata->>'rec_id', '') IS NULL
    GROUP BY e.eff_acc, e.ref_id, e.event_type
  ),
  new_p AS (
    SELECT nc.eff_acc, nc.ref_id,
      sum(nc.n) FILTER (WHERE nc.event_type = 'trip_rec_click') AS clicks,
      sum(nc.n) FILTER (WHERE nc.event_type = 'trip_copy') AS copies,
      sum(nc.n) FILTER (WHERE nc.event_type = 'trip_save') AS saves,
      sum(nc.n) FILTER (WHERE nc.event_type = 'trip_favorite') AS favorites,
      sum(nc.n) FILTER (WHERE nc.event_type = 'trip_share') AS shares
    FROM new_cnt nc GROUP BY nc.eff_acc, nc.ref_id
  ),
  old_p AS (
    SELECT oc.eff_acc, oc.ref_id,
      sum(oc.n) FILTER (WHERE oc.event_type = 'trip_rec_click') AS clicks,
      sum(oc.n) FILTER (WHERE oc.event_type = 'trip_copy') AS copies,
      sum(oc.n) FILTER (WHERE oc.event_type = 'trip_save') AS saves,
      sum(oc.n) FILTER (WHERE oc.event_type = 'trip_favorite') AS favorites,
      sum(oc.n) FILTER (WHERE oc.event_type = 'trip_share') AS shares
    FROM old_cnt oc GROUP BY oc.eff_acc, oc.ref_id
  ),
  g AS (
    SELECT e.eff_acc AS accommodation_id, e.ref_id,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_shown') AS shown,
      max(COALESCE(e.metadata->>'title', e.metadata->>'name')) AS meta_title,
      CASE WHEN e.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN e.ref_id::uuid END AS ref_uuid
    FROM evf2 e GROUP BY e.eff_acc, e.ref_id
  ),
  -- 每動作各自封頂於曝光數 LEAST(新+舊, 曝光數)
  metrics AS (
    SELECT g.accommodation_id, g.ref_id, g.shown, g.meta_title, g.ref_uuid,
      LEAST(COALESCE(np.clicks, 0) + COALESCE(op.clicks, 0), g.shown)::bigint AS clicks,
      LEAST(COALESCE(np.copies, 0) + COALESCE(op.copies, 0), g.shown)::bigint AS copies,
      LEAST(COALESCE(np.saves, 0) + COALESCE(op.saves, 0), g.shown)::bigint AS saves,
      LEAST(COALESCE(np.favorites, 0) + COALESCE(op.favorites, 0), g.shown)::bigint AS favorites,
      LEAST(COALESCE(np.shares, 0) + COALESCE(op.shares, 0), g.shown)::bigint AS shares
    FROM g
    LEFT JOIN new_p np ON np.eff_acc IS NOT DISTINCT FROM g.accommodation_id AND np.ref_id = g.ref_id
    LEFT JOIN old_p op ON op.eff_acc IS NOT DISTINCT FROM g.accommodation_id AND op.ref_id = g.ref_id
  ),
  event_rows AS (
    SELECT m.accommodation_id, m.ref_id,
      CASE WHEN t.id IS NOT NULL THEN 'trip' WHEN tg.id IS NOT NULL THEN 'generation' END AS ref_source,
      COALESCE(
        NULLIF(t.title->>'zh', ''), NULLIF(t.title->>'en', ''),
        NULLIF(tg.payload->'title'->>'zh', ''), NULLIF(tg.payload->>'title', ''),
        NULLIF(m.meta_title, '')
      ) AS title_zh,
      m.shown, m.clicks, (m.copies + m.saves + m.favorites + m.shares) AS engagements,
      m.copies, m.saves, m.favorites, m.shares,
      true AS has_events
    FROM metrics m
    LEFT JOIN public.trips t ON t.id = m.ref_uuid
    LEFT JOIN public.trip_generations tg ON tg.id = m.ref_uuid
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
