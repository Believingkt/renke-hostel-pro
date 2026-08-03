CREATE INDEX IF NOT EXISTS idx_page_analytics_acc_created ON public.page_analytics (accommodation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conv_logs_acc_created ON public.ai_conversation_logs (accommodation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_acc_order_date ON public.orders (accommodation_id, order_date DESC);

CREATE OR REPLACE FUNCTION public.get_sales_service_analytics(
  p_accommodation_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (public.is_admin_or_super() OR public.is_hotel_admin_of(p_accommodation_id)
          OR public.staff_can_view_module(p_accommodation_id, 'analytics')) THEN
    RAISE EXCEPTION 'permission denied';
  END IF;

  WITH base_orders AS (
    SELECT o.*
    FROM public.orders o
    WHERE o.accommodation_id = p_accommodation_id
      AND o.order_date >= p_start AND o.order_date < p_end
      AND COALESCE(o.order_status, '') <> 'cancelled'
  ),
  top_products AS (
    SELECT rt.name AS name,
           SUM(COALESCE(orr.quantity, 1))::int AS qty,
           SUM(COALESCE(orr.room_price, 0) * COALESCE(orr.quantity, 1))::bigint AS revenue
    FROM public.order_rooms orr
    JOIN base_orders bo ON bo.id = orr.order_id
    JOIN public.room_types rt ON rt.id = orr.room_type_id
    GROUP BY rt.name
    ORDER BY 2 DESC
    LIMIT 10
  ),
  pv AS (
    SELECT session_id, page_path
    FROM public.page_analytics
    WHERE accommodation_id = p_accommodation_id
      AND created_at >= p_start AND created_at < p_end
  ),
  funnel AS (
    SELECT
      COUNT(DISTINCT session_id)::int AS sessions_total,
      COUNT(DISTINCT session_id) FILTER (
        WHERE page_path ILIKE '%room%' OR page_path ILIKE '%package%'
      )::int AS sessions_room,
      COUNT(DISTINCT session_id) FILTER (
        WHERE page_path ILIKE '%book%' OR page_path ILIKE '%checkout%'
      )::int AS sessions_checkout
    FROM pv
  ),
  monthly AS (
    SELECT to_char(date_trunc('month', order_date), 'YYYY-MM') AS ym,
           COUNT(*)::int AS orders,
           SUM(COALESCE(final_price, 0))::bigint AS revenue
    FROM base_orders
    GROUP BY 1 ORDER BY 1
  ),
  addon AS (
    SELECT
      COUNT(*)::int AS total_orders,
      COUNT(*) FILTER (
        WHERE jsonb_typeof(custom_addon_details) = 'array'
          AND jsonb_array_length(custom_addon_details) > 0
      )::int AS addon_orders
    FROM base_orders
  ),
  conv AS (
    SELECT l.id, l.session_id, l.created_at,
           lower(COALESCE(l.messages::text, '')) AS txt
    FROM public.ai_conversation_logs l
    WHERE l.created_at >= p_start AND l.created_at < p_end
      AND (l.accommodation_id = p_accommodation_id OR l.accommodation_id IS NULL)
  ),
  intents AS (
    SELECT CASE
      WHEN txt ~ '(空房|有房|訂房|預訂|reserve|book)' THEN '訂房查詢'
      WHEN txt ~ '(價格|多少錢|費用|報價|price|rate)' THEN '價格詢問'
      WHEN txt ~ '(設施|早餐|停車|泳池|寵物|wifi|facility)' THEN '設施服務'
      WHEN txt ~ '(交通|怎麼去|地址|接送|地圖|transport)' THEN '交通位置'
      WHEN txt ~ '(取消|退款|改期|cancel|refund)' THEN '取消改期'
      ELSE '其他'
    END AS intent, COUNT(*)::int AS cnt
    FROM conv GROUP BY 1 ORDER BY 2 DESC
  ),
  conv_success AS (
    SELECT
      COUNT(*)::int AS total_sessions,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.accommodation_id = p_accommodation_id
          AND COALESCE(o.order_status, '') <> 'cancelled'
          AND o.order_date >= c.first_at
          AND o.order_date < c.first_at + interval '24 hours'
      ))::int AS converted_sessions
    FROM (
      SELECT session_id, MIN(created_at) AS first_at
      FROM conv WHERE session_id IS NOT NULL GROUP BY session_id
    ) c
  ),
  evals AS (
    SELECT
      COUNT(*) FILTER (WHERE semantic_label IS NOT NULL)::int AS labeled,
      COUNT(*) FILTER (WHERE semantic_label = 'correct')::int AS correct_cnt,
      COUNT(*) FILTER (WHERE semantic_label IN ('correct','acceptable'))::int AS ok_cnt,
      COUNT(*) FILTER (WHERE semantic_label IS NOT NULL AND needs_human_fix)::int AS fix_cnt
    FROM public.ai_eval_samples
  ),
  discount AS (
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(discount_code, '') <> '')::int AS discount_orders,
      COALESCE(SUM(COALESCE(final_price, 0)) FILTER (WHERE COALESCE(discount_code, '') <> ''), 0)::bigint AS discount_revenue,
      COALESCE(SUM(COALESCE(discount_amount, 0)) FILTER (WHERE COALESCE(discount_code, '') <> ''), 0)::bigint AS discount_given
    FROM base_orders
  ),
  top_codes AS (
    SELECT discount_code AS code, COUNT(*)::int AS orders,
           SUM(COALESCE(final_price, 0))::bigint AS revenue
    FROM base_orders
    WHERE COALESCE(discount_code, '') <> ''
    GROUP BY 1 ORDER BY 2 DESC LIMIT 10
  ),
  months3 AS (
    SELECT generate_series(
      date_trunc('month', GREATEST(p_start, p_end - interval '3 months')),
      date_trunc('month', p_end - interval '1 day'),
      interval '1 month'
    ) AS m
  ),
  repurchase AS (
    SELECT to_char(m.m, 'YYYY-MM') AS ym,
           COUNT(DISTINCT k.key)::int AS buyers,
           COUNT(DISTINCT k.key) FILTER (WHERE k.has_prior)::int AS repeat_buyers
    FROM months3 m
    LEFT JOIN LATERAL (
      SELECT COALESCE(o.member_id::text, lower(NULLIF(o.guest_email, ''))) AS key,
             EXISTS (
               SELECT 1 FROM public.orders p
               WHERE p.accommodation_id = p_accommodation_id
                 AND COALESCE(p.order_status, '') <> 'cancelled'
                 AND p.order_date < m.m
                 AND COALESCE(p.member_id::text, lower(NULLIF(p.guest_email, '')))
                     = COALESCE(o.member_id::text, lower(NULLIF(o.guest_email, '')))
             ) AS has_prior
      FROM public.orders o
      WHERE o.accommodation_id = p_accommodation_id
        AND COALESCE(o.order_status, '') <> 'cancelled'
        AND o.order_date >= m.m AND o.order_date < m.m + interval '1 month'
        AND COALESCE(o.member_id::text, NULLIF(o.guest_email, '')) IS NOT NULL
    ) k ON true
    GROUP BY 1 ORDER BY 1
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('start', p_start, 'end', p_end),
    'top_products', COALESCE((SELECT jsonb_agg(to_jsonb(t)) FROM top_products t), '[]'::jsonb),
    'funnel', COALESCE((SELECT to_jsonb(f) FROM funnel f), '{}'::jsonb),
    'orders_total', (SELECT total_orders FROM addon),
    'monthly', COALESCE((SELECT jsonb_agg(to_jsonb(m)) FROM monthly m), '[]'::jsonb),
    'addon', COALESCE((SELECT to_jsonb(a) FROM addon a), '{}'::jsonb),
    'conversations_total', (SELECT COUNT(*)::int FROM conv),
    'intents', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM intents i), '[]'::jsonb),
    'conv_success', COALESCE((SELECT to_jsonb(cs) FROM conv_success cs), '{}'::jsonb),
    'evals', COALESCE((SELECT to_jsonb(e) FROM evals e), '{}'::jsonb),
    'discount', COALESCE((SELECT to_jsonb(d) FROM discount d), '{}'::jsonb),
    'top_codes', COALESCE((SELECT jsonb_agg(to_jsonb(tc)) FROM top_codes tc), '[]'::jsonb),
    'repurchase', COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM repurchase r), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_service_analytics(uuid, timestamptz, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_sales_service_analytics(uuid, timestamptz, timestamptz) TO authenticated;