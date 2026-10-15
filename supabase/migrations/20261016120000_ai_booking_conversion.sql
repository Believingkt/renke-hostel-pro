-- L.AI 智慧銷售模型／AI 訂房轉換分析（總部）
-- 1) 正式 RPC ai_metric_booking_conversion：AI 推薦之訂房數 ÷ 總（有效）訂房數，每館一列＋加權合計。
--    分子目前「只」涵蓋可驗證的 AI 再行銷推播歸因（N1 同源）：
--      order_attributions 的 first 或 last 觸點 utm_source = 'remarketing'（精確），utm_content = 真實 remarketing_sends.id，
--      utm_campaign 若有值必須等於該 send 的 campaign_id（remarketing-send 以 c=<campaignId> → remarketing-track 寫入 utm_campaign）；
--      send：status='sent' 且 is_test=false、收件者不在排除名單（同 N1）；send 所屬活動館別 = 訂單館別（跨館不計）；
--      訂單建立時間 >= send.sent_at（同 N1，不另設時間窗）；同一訂單以 EXISTS 計至多一次。
--    分母：有效訂單 = order_status IN (confirmed, checked_in, checked_out)（同 revenueByMonth EFFECTIVE_ORDER_STATUSES），
--      預設所有 order_source（含 OTA／手動）；order_source IN ('test','test_data') 為既有慣例的種子資料，一律排除；
--      ai_metric_excluded_order_ids() 排除名單永遠排除。日期 = orders.created_at 的台北日界 [p_from, p_to]。
--    p_include_internal：訂單與 remarketing_sends 皆無 is_internal 維度，對本指標為 no-op（與 remarketing_breakdown 相同），僅為簽名一致。
-- 2) 獨立共用 Demo：hq_ai_booking_demo_dataset(+history)，與 N1/N2 的 hq_shared_demo_datasets 完全分離。
-- 只新增：不修改既有 migration／函式；不寫入任何營運表；不回填。

-- ================= 1. 正式 RPC =================
CREATE OR REPLACE FUNCTION public.ai_metric_booking_conversion(
  p_from date,
  p_to date,
  p_accommodation_ids uuid[] DEFAULT NULL,
  p_order_sources text[] DEFAULT NULL,
  p_include_internal boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_rows jsonb;
  v_eff bigint;
  v_ai bigint;
  v_attr bigint;
  v_selected int;
  v_with_orders int;
BEGIN
  PERFORM public.ai_metric_require_hq();
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'invalid_range: p_from/p_to required and p_from <= p_to' USING ERRCODE = '22023';
  END IF;
  IF p_to - p_from > 366 THEN
    RAISE EXCEPTION 'invalid_range: max 367 days' USING ERRCODE = '22023';
  END IF;
  v_start := (p_from::timestamp) AT TIME ZONE 'Asia/Taipei';
  v_end := ((p_to + 1)::timestamp) AT TIME ZONE 'Asia/Taipei';

  WITH accs AS (
    SELECT a.id, a.name FROM public.accommodation_info a
    WHERE a.is_active = true
      AND (p_accommodation_ids IS NULL OR a.id = ANY (p_accommodation_ids))
  ),
  eff AS (
    SELECT o.id, o.accommodation_id, o.created_at
    FROM public.orders o
    JOIN accs ON accs.id = o.accommodation_id
    WHERE o.order_status IN ('confirmed', 'checked_in', 'checked_out')
      AND COALESCE(o.order_source, '') NOT IN ('test', 'test_data')
      AND o.created_at >= v_start AND o.created_at < v_end
      AND (p_order_sources IS NULL OR o.order_source = ANY (p_order_sources))
      AND o.id NOT IN (SELECT public.ai_metric_excluded_order_ids())
  ),
  scored AS (
    SELECT e.accommodation_id,
      EXISTS (SELECT 1 FROM public.order_attributions oa0 WHERE oa0.order_id = e.id) AS has_attr,
      EXISTS (
        SELECT 1
        FROM public.order_attributions oa
        JOIN public.remarketing_sends s
          ON (oa.last_utm_source = 'remarketing' AND oa.last_utm_content = s.id::text
              AND (oa.last_utm_campaign IS NULL OR oa.last_utm_campaign = s.campaign_id::text))
          OR (oa.first_utm_source = 'remarketing' AND oa.first_utm_content = s.id::text
              AND (oa.first_utm_campaign IS NULL OR oa.first_utm_campaign = s.campaign_id::text))
        JOIN public.remarketing_campaigns c ON c.id = s.campaign_id
        LEFT JOIN public.traveler_profiles tp ON tp.id = s.traveler_profile_id
        WHERE oa.order_id = e.id
          AND s.status = 'sent' AND s.is_test = false
          AND s.sent_at <= e.created_at
          AND (c.content->>'accommodation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (c.content->>'accommodation_id')::uuid = e.accommodation_id
          AND (s.recipient IS NULL OR lower(s.recipient) NOT IN (SELECT public.ai_metric_excluded_emails()))
          AND (tp.email IS NULL OR lower(tp.email) NOT IN (SELECT public.ai_metric_excluded_emails()))
      ) AS is_ai
    FROM eff e
  ),
  agg AS (
    SELECT accs.id, accs.name,
      count(sc.accommodation_id) AS effective_orders,
      count(*) FILTER (WHERE sc.is_ai) AS ai_orders,
      count(*) FILTER (WHERE sc.has_attr) AS attributed_orders
    FROM accs LEFT JOIN scored sc ON sc.accommodation_id = accs.id
    GROUP BY accs.id, accs.name
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'accommodation_id', g.id, 'accommodation_name', g.name,
      'effective_orders', g.effective_orders, 'ai_orders', g.ai_orders, 'attributed_orders', g.attributed_orders,
      'rate', CASE WHEN g.effective_orders > 0 THEN g.ai_orders::numeric / g.effective_orders END,
      'meets_target', g.effective_orders > 0 AND g.ai_orders::numeric / NULLIF(g.effective_orders, 0) >= 0.025
    ) ORDER BY g.name, g.id), '[]'::jsonb),
    COALESCE(sum(g.effective_orders), 0), COALESCE(sum(g.ai_orders), 0), COALESCE(sum(g.attributed_orders), 0),
    count(*), count(*) FILTER (WHERE g.effective_orders > 0)
  INTO v_rows, v_eff, v_ai, v_attr, v_selected, v_with_orders
  FROM agg g;

  RETURN jsonb_build_object(
    'from', p_from, 'to', p_to, 'timezone', 'Asia/Taipei',
    'target_rate', 0.025, 'min_venues', 5,
    'effective_statuses', jsonb_build_array('confirmed', 'checked_in', 'checked_out'),
    'excluded_order_sources', jsonb_build_array('test', 'test_data'),
    'include_internal_applied', false,
    'numerator_scope', 'remarketing_only',
    'rows', v_rows,
    'totals', jsonb_build_object(
      'effective_orders', v_eff, 'ai_orders', v_ai, 'attributed_orders', v_attr,
      'rate', CASE WHEN v_eff > 0 THEN v_ai::numeric / v_eff END,
      'meets_target', v_eff > 0 AND v_ai::numeric / NULLIF(v_eff, 0) >= 0.025,
      'attribution_coverage', CASE WHEN v_eff > 0 THEN v_attr::numeric / v_eff END),
    'selected_venues', v_selected,
    'venues_with_orders', v_with_orders);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metric_booking_conversion(date, date, uuid[], text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_booking_conversion(date, date, uuid[], text[], boolean) TO authenticated;

-- 訂單來源選項（只回來源字串，不含個資）
CREATE OR REPLACE FUNCTION public.ai_metric_booking_order_sources()
RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.ai_metric_require_hq();
  RETURN COALESCE((SELECT array_agg(DISTINCT o.order_source ORDER BY o.order_source) FROM public.orders o
    WHERE o.order_source IS NOT NULL AND o.order_source NOT IN ('test', 'test_data')), '{}');
END;
$$;
REVOKE ALL ON FUNCTION public.ai_metric_booking_order_sources() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_metric_booking_order_sources() TO authenticated;

-- ================= 2. 獨立共用 Demo（L） =================
CREATE TABLE IF NOT EXISTS public.hq_ai_booking_demo_dataset (
  slot text PRIMARY KEY CHECK (slot = 'ai_booking'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  data_nature text NOT NULL DEFAULT 'synthetic_demo' CHECK (data_nature = 'synthetic_demo'),
  demo_version text NOT NULL,
  fixture_version text NOT NULL,
  run_id text NOT NULL,
  generated_at text NOT NULL,
  run jsonb NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.hq_ai_booking_demo_dataset_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot text NOT NULL,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by uuid
);
ALTER TABLE public.hq_ai_booking_demo_dataset ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_ai_booking_demo_dataset_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hq_ai_booking_demo_dataset FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hq_ai_booking_demo_dataset_history FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hq_ai_booking_demo_row_json(r public.hq_ai_booking_demo_dataset)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'revision', r.revision, 'status', r.status, 'dataNature', r.data_nature,
    'demoVersion', r.demo_version, 'fixtureVersion', r.fixture_version,
    'runId', r.run_id, 'generatedAt', r.generated_at, 'run', r.run, 'updatedAt', r.updated_at);
$$;
REVOKE ALL ON FUNCTION public.hq_ai_booking_demo_row_json(public.hq_ai_booking_demo_dataset) FROM PUBLIC, anon, authenticated;

-- 讀：super_admin 或全域 admin（沿用 hq_shared_demo_can_read）
CREATE OR REPLACE FUNCTION public.hq_ai_booking_demo_get()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.hq_ai_booking_demo_dataset;
BEGIN
  IF NOT public.hq_shared_demo_can_read() THEN
    RAISE EXCEPTION 'forbidden: hq admin only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.hq_ai_booking_demo_dataset WHERE slot = 'ai_booking' AND status = 'active';
  RETURN jsonb_build_object(
    'dataset', CASE WHEN r.slot IS NULL THEN NULL ELSE public.hq_ai_booking_demo_row_json(r) END,
    'canWrite', public.is_super_admin(auth.uid()));
END;
$$;
REVOKE ALL ON FUNCTION public.hq_ai_booking_demo_get() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_ai_booking_demo_get() TO authenticated;

-- 寫：僅 super_admin；只收合成 run 描述（白名單欄位、大小限制、公開館名驗證），固定交易鎖＋revision
CREATE OR REPLACE FUNCTION public.hq_ai_booking_demo_put(p_expected_revision integer, p_run jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur public.hq_ai_booking_demo_dataset;
  saved public.hq_ai_booking_demo_dataset;
  v jsonb;
  k text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: super_admin only' USING ERRCODE = '42501';
  END IF;
  IF p_run IS NULL OR jsonb_typeof(p_run) <> 'object' OR octet_length(p_run::text) > 2048 THEN
    RAISE EXCEPTION 'invalid_payload: run must be an object <= 2048 bytes' USING ERRCODE = '22023';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_run) LOOP
    IF k NOT IN ('runId', 'generatedAt', 'demoVersion', 'fixtureVersion', 'dataNature', 'venues') THEN
      RAISE EXCEPTION 'invalid_payload: unexpected run field %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(p_run)) <> 6 THEN
    RAISE EXCEPTION 'invalid_payload: run fields missing' USING ERRCODE = '22023';
  END IF;
  IF p_run->>'dataNature' IS DISTINCT FROM 'synthetic_demo' THEN
    RAISE EXCEPTION 'invalid_payload: dataNature must be synthetic_demo' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_run->'runId') <> 'string' OR (p_run->>'runId') !~ '^AIBKRUN-[0-9]{8}-[0-9]{6}-[0-9]{1,4}$'
     OR jsonb_typeof(p_run->'generatedAt') <> 'string' OR (p_run->>'generatedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\+08:00$'
     OR jsonb_typeof(p_run->'demoVersion') <> 'string' OR (p_run->>'demoVersion') !~ '^aibk-demo-v[0-9]+\.[0-9]+\.[0-9]+$'
     OR jsonb_typeof(p_run->'fixtureVersion') <> 'string' OR (p_run->>'fixtureVersion') !~ '^aibk-fixture-v[0-9]+\.[0-9]+\.[0-9]+$' THEN
    RAISE EXCEPTION 'invalid_payload: run id/time/version format' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_run->'venues') <> 'array' OR jsonb_array_length(p_run->'venues') <> 5 THEN
    RAISE EXCEPTION 'invalid_payload: venues must be exactly 5 items' USING ERRCODE = '22023';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p_run->'venues') LOOP
    IF jsonb_typeof(v) <> 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(v) x) <> ARRAY['id', 'name']
       OR (v->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid_payload: venue must be {id,name}' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.accommodation_info a WHERE a.id = (v->>'id')::uuid AND a.name = v->>'name') THEN
      RAISE EXCEPTION 'invalid_payload: venue not found or name mismatch' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(p_run->'venues') e) <> 5 THEN
    RAISE EXCEPTION 'invalid_payload: duplicate venue' USING ERRCODE = '22023';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid_payload: expected_revision must be >= 0' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hq_ai_booking_demo:ai_booking', 0));
  SELECT * INTO cur FROM public.hq_ai_booking_demo_dataset WHERE slot = 'ai_booking' FOR UPDATE;
  IF p_expected_revision <> coalesce(cur.revision, 0) THEN
    RAISE EXCEPTION 'revision_conflict'
      USING ERRCODE = 'PT409', DETAIL = format('current_revision=%s', coalesce(cur.revision, 0));
  END IF;
  IF cur.slot IS NOT NULL THEN
    INSERT INTO public.hq_ai_booking_demo_dataset_history (slot, revision, snapshot, archived_by)
      VALUES (cur.slot, cur.revision, public.hq_ai_booking_demo_row_json(cur), auth.uid());
  END IF;
  INSERT INTO public.hq_ai_booking_demo_dataset AS d
    (slot, status, demo_version, fixture_version, run_id, generated_at, run, revision, updated_by, updated_at)
  VALUES ('ai_booking', 'active', p_run->>'demoVersion', p_run->>'fixtureVersion',
          p_run->>'runId', p_run->>'generatedAt', p_run, coalesce(cur.revision, 0) + 1, auth.uid(), now())
  ON CONFLICT (slot) DO UPDATE SET
    status = 'active', demo_version = EXCLUDED.demo_version, fixture_version = EXCLUDED.fixture_version,
    run_id = EXCLUDED.run_id, generated_at = EXCLUDED.generated_at, run = EXCLUDED.run,
    revision = EXCLUDED.revision, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
  RETURNING * INTO saved;
  RETURN jsonb_build_object('dataset', public.hq_ai_booking_demo_row_json(saved), 'canWrite', true);
END;
$$;
REVOKE ALL ON FUNCTION public.hq_ai_booking_demo_put(integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_ai_booking_demo_put(integer, jsonb) TO authenticated;
