-- AI 成效分析：共用權限／排除函式 + 三支明細 RPC（行程推薦、再行銷、加購推薦）
-- 原則：全部由真實事件與訂單即時彙總，不回填、不模擬；口徑與 ai_metric_dashboard 一致。

-- ---------- 共用：總部管理員檢查 ----------
CREATE OR REPLACE FUNCTION public.ai_metric_require_hq()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin', 'admin')) THEN
    RAISE EXCEPTION 'forbidden: hq admin only' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metric_require_hq() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_require_hq() TO authenticated;

-- ---------- 共用：排除名單展開（僅供 RPC 內部使用） ----------
CREATE OR REPLACE FUNCTION public.ai_metric_excluded_emails()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lower(trim(x.value)) FROM public.ai_metric_exclusions x WHERE x.kind = 'email';
$$;

CREATE OR REPLACE FUNCTION public.ai_metric_excluded_line_ids()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT trim(x.value) FROM public.ai_metric_exclusions x WHERE x.kind = 'line_user_id'
  UNION
  SELECT ls.line_user_id
  FROM public.line_sessions ls
  JOIN auth.users u ON u.id = ls.member_user_id
  WHERE lower(u.email) IN (SELECT public.ai_metric_excluded_emails());
$$;

CREATE OR REPLACE FUNCTION public.ai_metric_excluded_order_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.id FROM public.orders o WHERE lower(o.guest_email) IN (SELECT public.ai_metric_excluded_emails());
$$;

-- 排除名單成員用過的 web session（由其成交事件 order_id／LINE id 反推）
CREATE OR REPLACE FUNCTION public.ai_metric_excluded_sessions()
RETURNS SETOF text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT e.session_key
  FROM public.ai_metric_events e
  WHERE e.session_key IS NOT NULL
    AND (
      ((e.metadata->>'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (e.metadata->>'order_id')::uuid IN (SELECT public.ai_metric_excluded_order_ids()))
      OR e.line_user_id IN (SELECT public.ai_metric_excluded_line_ids())
    );
$$;

REVOKE ALL ON FUNCTION public.ai_metric_excluded_emails() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_metric_excluded_line_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_metric_excluded_order_ids() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_metric_excluded_sessions() FROM PUBLIC, anon, authenticated;

-- 共用：套用排除規則後的事件（SECURITY DEFINER 內部使用）
CREATE OR REPLACE FUNCTION public.ai_metric_clean_events()
RETURNS SETOF public.ai_metric_events
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.*
  FROM public.ai_metric_events e
  WHERE e.is_internal = false
    AND (e.line_user_id IS NULL OR e.line_user_id NOT IN (SELECT public.ai_metric_excluded_line_ids()))
    AND (e.session_key IS NULL OR e.session_key NOT IN (SELECT public.ai_metric_excluded_sessions()));
$$;
REVOKE ALL ON FUNCTION public.ai_metric_clean_events() FROM PUBLIC, anon, authenticated;

-- ---------- 更新 ai_metric_dashboard：改用共用函式，口徑不變 ----------
CREATE OR REPLACE FUNCTION public.ai_metric_dashboard(
  p_from date,
  p_to date,
  p_accommodation_ids uuid[] DEFAULT NULL,
  p_channel text DEFAULT NULL,
  p_attribution_days integer DEFAULT 7
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
    SELECT ce.* FROM public.ai_metric_clean_events() ce
    WHERE (p_accommodation_ids IS NULL OR ce.accommodation_id = ANY (p_accommodation_ids))
      AND (p_channel IS NULL OR ce.channel = p_channel)
  ),
  ev AS (SELECT ea.* FROM ev_all ea WHERE ea.created_at >= v_start AND ea.created_at < v_end),
  m AS (
    SELECT e.accommodation_id,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_click') AS m1_num,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_shown') AS m1_den,
      count(*) FILTER (WHERE e.event_type IN ('trip_save', 'trip_favorite', 'trip_share', 'trip_copy')) AS m2_num,
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

-- ---------- 行程推薦分析：每館每行程 ----------
CREATE OR REPLACE FUNCTION public.ai_metric_trip_breakdown(
  p_from date, p_to date, p_accommodation_ids uuid[] DEFAULT NULL, p_channel text DEFAULT NULL
)
RETURNS TABLE (
  accommodation_id uuid, ref_id text, ref_source text, title_zh text,
  shown bigint, clicks bigint, engagements bigint, copies bigint, saves bigint, favorites bigint, shares bigint
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
  )
  SELECT g.accommodation_id, g.ref_id,
    CASE WHEN t.id IS NOT NULL THEN 'trip' WHEN tg.id IS NOT NULL THEN 'generation' END AS ref_source,
    COALESCE(
      NULLIF(t.title->>'zh', ''), NULLIF(t.title->>'en', ''),
      NULLIF(tg.payload->'title'->>'zh', ''), NULLIF(tg.payload->>'title', ''),
      NULLIF(g.meta_title, '')
    ) AS title_zh,
    g.shown, g.clicks, (g.copies + g.saves + g.favorites + g.shares) AS engagements,
    g.copies, g.saves, g.favorites, g.shares
  FROM g
  LEFT JOIN public.trips t ON t.id = g.ref_uuid
  LEFT JOIN public.trip_generations tg ON tg.id = g.ref_uuid;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metric_trip_breakdown(date, date, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_trip_breakdown(date, date, uuid[], text) TO authenticated;

-- ---------- 再行銷轉換分析：每活動每通路（以活動設定館別為列） ----------
CREATE OR REPLACE FUNCTION public.ai_metric_remarketing_breakdown(
  p_from date, p_to date, p_accommodation_ids uuid[] DEFAULT NULL, p_channel text DEFAULT NULL
)
RETURNS TABLE (
  accommodation_id uuid, campaign_id uuid, campaign_name text, channel text,
  sends bigint, clicks bigint, orders bigint, order_venues text
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
  WITH sd_all AS (
    SELECT s.id, s.sent_at, s.clicked_at, s.channel, c.id AS campaign_id, c.name AS campaign_name,
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
  -- 每筆發送最多對應 1 單（取最早成立的那筆）
  conv AS (
    SELECT sf.id AS send_id,
      (SELECT o.accommodation_id
       FROM public.order_attributions oa JOIN public.orders o ON o.id = oa.order_id
       WHERE ((oa.last_utm_source = 'remarketing' AND oa.last_utm_content = sf.id::text)
           OR (oa.first_utm_source = 'remarketing' AND oa.first_utm_content = sf.id::text))
         AND o.order_status NOT IN ('cancelled', 'hold')
         AND o.created_at >= sf.sent_at
         AND o.id NOT IN (SELECT public.ai_metric_excluded_order_ids())
       ORDER BY o.created_at ASC LIMIT 1) AS order_acc
    FROM sends_f sf
  ),
  venue_counts AS (
    SELECT cv.send_id, cv.order_acc, ai.name AS venue_name
    FROM conv cv
    LEFT JOIN public.accommodation_info ai ON ai.id = cv.order_acc
    WHERE cv.order_acc IS NOT NULL
  )
  SELECT sf.accommodation_id, sf.campaign_id, sf.campaign_name, sf.channel,
    count(*)::bigint AS sends,
    count(*) FILTER (WHERE sf.clicked_at IS NOT NULL)::bigint AS clicks,
    count(cv.order_acc)::bigint AS orders,
    (SELECT string_agg(x.venue_name || '×' || x.cnt, '、' ORDER BY x.cnt DESC)
     FROM (SELECT COALESCE(vc.venue_name, '未知館') AS venue_name, count(*) AS cnt
           FROM venue_counts vc JOIN sends_f s2 ON s2.id = vc.send_id
           WHERE s2.campaign_id = sf.campaign_id AND s2.channel = sf.channel
             AND s2.accommodation_id IS NOT DISTINCT FROM sf.accommodation_id
           GROUP BY vc.venue_name) x) AS order_venues
  FROM sends_f sf
  LEFT JOIN conv cv ON cv.send_id = sf.id
  GROUP BY sf.accommodation_id, sf.campaign_id, sf.campaign_name, sf.channel;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metric_remarketing_breakdown(date, date, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_remarketing_breakdown(date, date, uuid[], text) TO authenticated;

-- ---------- 加購推薦分析：每館每品項 ----------
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
    GROUP BY p.accommodation_id, p.ref_type, p.ref_id
  ),
  keys AS (
    SELECT sh.accommodation_id, sh.ref_type, sh.ref_id FROM sh_agg sh
    UNION SELECT b.accommodation_id, b.ref_type, b.ref_id FROM bought b
  )
  SELECT k.accommodation_id, k.ref_type, k.ref_id,
    CASE WHEN k.ref_type = 'trip_product' THEN COALESCE(tp.name, k.ref_id) ELSE k.ref_id END AS item_name,
    COALESCE(sh.shown, 0)::bigint AS shown,
    COALESCE(b.qty, 0)::bigint AS purchased_qty
  FROM keys k
  LEFT JOIN sh_agg sh ON sh.accommodation_id IS NOT DISTINCT FROM k.accommodation_id AND sh.ref_type = k.ref_type AND sh.ref_id = k.ref_id
  LEFT JOIN bought b ON b.accommodation_id IS NOT DISTINCT FROM k.accommodation_id AND b.ref_type = k.ref_type AND b.ref_id = k.ref_id
  LEFT JOIN public.trip_products tp
    ON k.ref_type = 'trip_product'
   AND k.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   AND tp.id = k.ref_id::uuid;
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metric_addon_breakdown(date, date, uuid[], text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_addon_breakdown(date, date, uuid[], text, integer) TO authenticated;
