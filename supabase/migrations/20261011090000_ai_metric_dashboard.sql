-- AI 成效指標（結案 F2 M1/M2/N1/N2）：排除名單表 + 總部即時彙總 RPC
-- 原則：不回填、不模擬任何歷史數據；只對既有事件做即時統計。

-- ---------- C. 測試帳號排除名單 ----------
CREATE TABLE IF NOT EXISTS public.ai_metric_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('email', 'line_user_id')),
  value text NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value)
);

ALTER TABLE public.ai_metric_exclusions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hq admins manage ai_metric_exclusions" ON public.ai_metric_exclusions;
CREATE POLICY "hq admins manage ai_metric_exclusions"
  ON public.ai_metric_exclusions
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin', 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin', 'admin')));

-- ---------- B. 即時彙總 RPC ----------
-- 口徑：
--   M1 = trip_rec_click / trip_rec_shown
--   M2 = (trip_save + trip_favorite + trip_share + trip_copy) / trip_rec_shown
--   N1 = 歸因成立訂單數 / 實際寄達推播數；寄達 ≈ remarketing_sends.status='sent' AND is_test=false（無 delivered 回報）
--        歸因：order_attributions.(last|first)_utm_source='remarketing' 且 utm_content = send id，訂單非 cancelled/hold 且在寄送之後
--   N2 = 推薦後成交加購數量 / addon_rec_shown；個人層級：同館同品項，LINE 以 line_user_id、web 以 session_key 對應，
--        成交需在任一推薦後 p_attribution_days 天內
--   排除：ai_metric_events.is_internal=true、排除名單（email → auth.users → line_sessions.member_user_id 反推 LINE id；
--        訂單 guest_email；推播收件 email）
--   日期：以台北時區日界線計，含首尾日
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
  IF NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin', 'admin')) THEN
    RAISE EXCEPTION 'forbidden: hq admin only' USING ERRCODE = '42501';
  END IF;
  IF p_to < p_from THEN
    RAISE EXCEPTION 'p_to must be >= p_from';
  END IF;

  RETURN QUERY
  WITH
  ex_email AS (
    SELECT lower(trim(value)) AS email FROM public.ai_metric_exclusions WHERE kind = 'email'
  ),
  ex_line AS (
    SELECT trim(value) AS line_user_id FROM public.ai_metric_exclusions WHERE kind = 'line_user_id'
    UNION
    SELECT ls.line_user_id
    FROM public.line_sessions ls
    JOIN auth.users u ON u.id = ls.member_user_id
    WHERE lower(u.email) IN (SELECT email FROM ex_email)
  ),
  ex_order AS (
    SELECT o.id FROM public.orders o WHERE lower(o.guest_email) IN (SELECT email FROM ex_email)
  ),
  -- 排除名單成員曾用過的 web session（透過其成交事件的 order_id 反推）
  ex_session AS (
    SELECT DISTINCT e.session_key
    FROM public.ai_metric_events e
    WHERE e.session_key IS NOT NULL
      AND (
        ((e.metadata->>'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (e.metadata->>'order_id')::uuid IN (SELECT id FROM ex_order))
        OR e.line_user_id IN (SELECT line_user_id FROM ex_line)
      )
  ),
  ev_all AS (
    SELECT e.*
    FROM public.ai_metric_events e
    WHERE e.is_internal = false
      AND (e.line_user_id IS NULL OR e.line_user_id NOT IN (SELECT line_user_id FROM ex_line))
      AND (e.session_key IS NULL OR e.session_key NOT IN (SELECT session_key FROM ex_session))
      AND (p_accommodation_ids IS NULL OR e.accommodation_id = ANY (p_accommodation_ids))
      AND (p_channel IS NULL OR e.channel = p_channel)
  ),
  ev AS (
    SELECT * FROM ev_all WHERE created_at >= v_start AND created_at < v_end
  ),
  m AS (
    SELECT
      e.accommodation_id,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_click') AS m1_num,
      count(*) FILTER (WHERE e.event_type = 'trip_rec_shown') AS m1_den,
      count(*) FILTER (WHERE e.event_type IN ('trip_save', 'trip_favorite', 'trip_share', 'trip_copy')) AS m2_num,
      count(*) FILTER (WHERE e.event_type = 'addon_rec_shown') AS n2_den
    FROM ev e
    GROUP BY e.accommodation_id
  ),
  n2_purchases AS (
    SELECT
      p.accommodation_id,
      p.id,
      GREATEST(CASE WHEN (p.metadata->>'qty') ~ '^[0-9]+(\.[0-9]+)?$' THEN (p.metadata->>'qty')::numeric ELSE 1 END, 1) AS qty
    FROM ev p
    WHERE p.event_type = 'addon_purchased'
      AND NOT (
        (p.metadata->>'order_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (p.metadata->>'order_id')::uuid IN (SELECT id FROM ex_order)
      )
      AND EXISTS (
        SELECT 1 FROM ev_all s
        WHERE s.event_type = 'addon_rec_shown'
          AND s.accommodation_id IS NOT DISTINCT FROM p.accommodation_id
          AND s.ref_id = p.ref_id
          AND s.created_at <= p.created_at
          AND p.created_at <= s.created_at + make_interval(days => GREATEST(p_attribution_days, 0))
          AND (
            (p.line_user_id IS NOT NULL AND s.line_user_id = p.line_user_id)
            OR (p.line_user_id IS NULL AND p.session_key IS NOT NULL AND s.session_key = p.session_key)
          )
      )
  ),
  n2 AS (
    SELECT np.accommodation_id, sum(np.qty)::bigint AS n2_num FROM n2_purchases np GROUP BY np.accommodation_id
  ),
  sends AS (
    SELECT
      s.id,
      s.sent_at,
      CASE WHEN (c.content->>'accommodation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           THEN (c.content->>'accommodation_id')::uuid END AS accommodation_id
    FROM public.remarketing_sends s
    JOIN public.remarketing_campaigns c ON c.id = s.campaign_id
    LEFT JOIN public.traveler_profiles tp ON tp.id = s.traveler_profile_id
    WHERE s.status = 'sent'
      AND s.is_test = false
      AND s.sent_at >= v_start AND s.sent_at < v_end
      AND (p_channel IS NULL OR s.channel = p_channel)
      AND (s.recipient IS NULL OR lower(s.recipient) NOT IN (SELECT email FROM ex_email))
      AND (tp.email IS NULL OR lower(tp.email) NOT IN (SELECT email FROM ex_email))
  ),
  sends_f AS (
    SELECT sd.* FROM sends sd
    WHERE p_accommodation_ids IS NULL OR sd.accommodation_id = ANY (p_accommodation_ids)
  ),
  n1 AS (
    SELECT
      sf.accommodation_id,
      count(*) AS n1_den,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1
        FROM public.order_attributions oa
        JOIN public.orders o ON o.id = oa.order_id
        WHERE (
            (oa.last_utm_source = 'remarketing' AND oa.last_utm_content = sf.id::text)
            OR (oa.first_utm_source = 'remarketing' AND oa.first_utm_content = sf.id::text)
          )
          AND o.order_status NOT IN ('cancelled', 'hold')
          AND o.created_at >= sf.sent_at
          AND o.id NOT IN (SELECT id FROM ex_order)
      )) AS n1_num
    FROM sends_f sf
    GROUP BY sf.accommodation_id
  ),
  keys AS (
    SELECT m.accommodation_id FROM m
    UNION SELECT n1.accommodation_id FROM n1
    UNION SELECT n2.accommodation_id FROM n2
  )
  SELECT
    k.accommodation_id,
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

REVOKE ALL ON FUNCTION public.ai_metric_dashboard(date, date, uuid[], text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_metric_dashboard(date, date, uuid[], text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_dashboard(date, date, uuid[], text, integer) TO authenticated;

COMMENT ON FUNCTION public.ai_metric_dashboard(date, date, uuid[], text, integer) IS
  'HQ-only. M1/M2/N1/N2 AI 成效指標即時彙總（每館一列；accommodation_id NULL 為未指定館）。不回填歷史。';
