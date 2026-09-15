
CREATE OR REPLACE FUNCTION public.get_ai_ops_metrics(_accommodation_id uuid DEFAULT NULL, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from timestamptz := now() - make_interval(days => GREATEST(1, LEAST(90, _days)));
  _result jsonb;
  _sessions int; _pageviews int; _room_sessions int; _checkout_sessions int;
  _orders int; _revenue bigint; _addon_orders int; _addon_amount bigint;
  _by_acc jsonb; _sources jsonb; _top_pages jsonb; _intents jsonb;
  _chat_convos int; _line_sessions int; _line_orders int;
  _trip_gens int; _trip_orders int; _trip_products int;
  _low_inv jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_or_super() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  IF auth.uid() IS NULL AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT count(DISTINCT session_id), count(*)
    INTO _sessions, _pageviews
  FROM page_analytics
  WHERE created_at >= _from
    AND page_path NOT LIKE '/__cb/%'
    AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id);

  SELECT count(DISTINCT session_id) INTO _room_sessions
  FROM page_analytics
  WHERE created_at >= _from AND page_path LIKE '/booking/%'
    AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id);

  SELECT count(DISTINCT session_id) INTO _checkout_sessions
  FROM page_analytics
  WHERE created_at >= _from
    AND (page_path LIKE '/pay%' OR page_path LIKE '/cart%' OR page_path ILIKE '%checkout%')
    AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id);

  SELECT count(*), COALESCE(sum(final_price), 0),
         count(*) FILTER (WHERE COALESCE(jsonb_array_length(CASE WHEN jsonb_typeof(custom_addon_details) = 'array' THEN custom_addon_details ELSE '[]'::jsonb END), 0) > 0),
         COALESCE(sum((
            SELECT COALESCE(sum(COALESCE((e->>'amount')::numeric, 0)), 0)
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.custom_addon_details) = 'array' THEN o.custom_addon_details ELSE '[]'::jsonb END) e
         )), 0)
    INTO _orders, _revenue, _addon_orders, _addon_amount
  FROM orders o
  WHERE created_at >= _from
    AND order_status <> 'cancelled'
    AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id);

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'pageviews')::int DESC), '[]'::jsonb) INTO _by_acc
  FROM (
    SELECT jsonb_build_object(
      'accommodation_id', a.id,
      'name', a.name,
      'sessions', COALESCE(p.sessions, 0),
      'pageviews', COALESCE(p.pageviews, 0),
      'orders', COALESCE(o.cnt, 0),
      'conversion_rate', CASE WHEN COALESCE(p.sessions, 0) > 0
          THEN round((COALESCE(o.cnt, 0)::numeric / p.sessions) * 100, 2) ELSE 0 END
    ) AS x
    FROM accommodation_info a
    LEFT JOIN (
      SELECT accommodation_id, count(DISTINCT session_id) sessions, count(*) pageviews
      FROM page_analytics WHERE created_at >= _from AND page_path NOT LIKE '/__cb/%'
      GROUP BY 1
    ) p ON p.accommodation_id = a.id
    LEFT JOIN (
      SELECT accommodation_id, count(*) cnt FROM orders
      WHERE created_at >= _from AND order_status <> 'cancelled' GROUP BY 1
    ) o ON o.accommodation_id = a.id
    WHERE (_accommodation_id IS NULL OR a.id = _accommodation_id)
      AND (COALESCE(p.pageviews, 0) > 0 OR COALESCE(o.cnt, 0) > 0)
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('source', src, 'sessions', c) ORDER BY c DESC), '[]'::jsonb)
    INTO _sources
  FROM (
    SELECT COALESCE(NULLIF(utm_source, ''), NULLIF(referrer_domain, ''), 'direct') src,
           count(DISTINCT session_id) c
    FROM page_analytics
    WHERE created_at >= _from AND page_path NOT LIKE '/__cb/%'
      AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id)
    GROUP BY 1 ORDER BY c DESC LIMIT 8
  ) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('path', page_path, 'views', c) ORDER BY c DESC), '[]'::jsonb)
    INTO _top_pages
  FROM (
    SELECT page_path, count(*) c FROM page_analytics
    WHERE created_at >= _from AND page_path NOT LIKE '/__cb/%'
      AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id)
    GROUP BY 1 ORDER BY c DESC LIMIT 10
  ) p;

  SELECT count(*) INTO _chat_convos
  FROM ai_conversation_logs
  WHERE created_at >= _from
    AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('intent', intent, 'count', c) ORDER BY c DESC), '[]'::jsonb)
    INTO _intents
  FROM (
    SELECT CASE
      WHEN txt ~ '結帳|付款|下訂|買單' THEN 'checkout'
      WHEN txt ~ '票券|門票|加購|體驗|餐券|早餐|晚餐|燒烤|bbq|下午茶|接送|導覽' THEN 'addon'
      WHEN txt ~ '退訂|退款|退費|取消|政策|規定|條款|須知|發票|寵物|禁菸|門禁' THEN 'policy'
      WHEN txt ~ '訂房|空房|有房|房型|包棟|查房|看房|入住|預訂' THEN 'search_rooms'
      WHEN txt ~ '價格|多少錢|房價|費用|優惠|折扣' THEN 'pricing'
      WHEN txt ~ '設施|停車|泳池|烤肉|廚房|wifi|網路|浴缸|溫泉' THEN 'facility'
      WHEN txt ~ '行程|景點|好玩|一日遊|推薦' THEN 'trip_plan'
      ELSE 'other' END intent,
      count(*) c
    FROM (
      SELECT lower(COALESCE(messages::text, '')) txt
      FROM ai_conversation_logs
      WHERE created_at >= _from
        AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id)
      LIMIT 2000
    ) m
    GROUP BY 1
  ) i;

  SELECT count(*) INTO _line_sessions FROM line_sessions WHERE updated_at >= _from;
  SELECT count(*) INTO _line_orders
  FROM order_meta om JOIN orders o ON o.id = om.order_id
  WHERE om.line_user_id IS NOT NULL AND o.created_at >= _from
    AND (_accommodation_id IS NULL OR o.accommodation_id = _accommodation_id);

  SELECT count(*) INTO _trip_gens FROM trip_generations WHERE created_at >= _from;
  SELECT count(*) INTO _trip_orders
  FROM order_meta om JOIN orders o ON o.id = om.order_id
  WHERE om.trip_id IS NOT NULL AND o.created_at >= _from
    AND (_accommodation_id IS NULL OR o.accommodation_id = _accommodation_id);
  SELECT count(*) INTO _trip_products FROM trip_products WHERE is_active = true
    AND (_accommodation_id IS NULL OR accommodation_id = _accommodation_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'accommodation', nm, 'remaining', rem) ORDER BY d), '[]'::jsonb)
    INTO _low_inv
  FROM (
    SELECT rip.date d, a.name nm, sum(rip.available_rooms) rem
    FROM room_inventory_pricing rip
    JOIN room_types rt ON rt.id = rip.room_type_id
    JOIN accommodation_info a ON a.id = rt.accommodation_id
    WHERE rip.date BETWEEN CURRENT_DATE AND CURRENT_DATE + 45
      AND rip.is_available = true
      AND (_accommodation_id IS NULL OR rt.accommodation_id = _accommodation_id)
    GROUP BY 1, 2
    HAVING sum(rip.available_rooms) <= 1
    ORDER BY 1
    LIMIT 15
  ) inv;

  _result := jsonb_build_object(
    'period', jsonb_build_object('days', _days, 'from', _from, 'to', now()),
    'scope', jsonb_build_object('accommodation_id', _accommodation_id),
    'funnel', jsonb_build_object(
      'sessions', _sessions,
      'pageviews', _pageviews,
      'room_view_sessions', _room_sessions,
      'checkout_sessions', _checkout_sessions,
      'orders', _orders,
      'view_rate', CASE WHEN _sessions > 0 THEN round((_room_sessions::numeric / _sessions) * 100, 2) ELSE 0 END,
      'conversion_rate', CASE WHEN _sessions > 0 THEN round((_orders::numeric / _sessions) * 100, 2) ELSE 0 END
    ),
    'revenue', _revenue,
    'addon', jsonb_build_object(
      'orders_with_addon', _addon_orders,
      'orders_total', _orders,
      'addon_rate', CASE WHEN _orders > 0 THEN round((_addon_orders::numeric / _orders) * 100, 2) ELSE 0 END,
      'addon_amount', _addon_amount
    ),
    'by_accommodation', _by_acc,
    'sources', _sources,
    'top_pages', _top_pages,
    'ai_chat', jsonb_build_object(
      'conversations', _chat_convos,
      'intents', _intents,
      'line_sessions', _line_sessions,
      'line_orders', _line_orders,
      'line_conversion_rate', CASE WHEN _line_sessions > 0 THEN round((_line_orders::numeric / _line_sessions) * 100, 2) ELSE 0 END
    ),
    'trips', jsonb_build_object(
      'generations', _trip_gens,
      'trip_orders', _trip_orders,
      'active_products', _trip_products
    ),
    'low_inventory', _low_inv
  );

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_ops_metrics(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_ops_metrics(uuid, integer) TO authenticated, service_role;
