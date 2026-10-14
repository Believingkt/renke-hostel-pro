-- 總部「共用 Demo」資料集：只存合成 run 的描述（可由前端 fixture 決定性重建），與正式營運資料完全隔離。
-- 不讀寫 orders／remarketing_sends／ai_metric_events 等營運表，不進任何營收／庫存／金流 RPC。
-- 讀：super_admin（同 is_super_admin）或全域 admin（accommodation_id IS NULL）；寫：僅 super_admin。

CREATE TABLE IF NOT EXISTS public.hq_shared_demo_datasets (
  slot text PRIMARY KEY CHECK (slot = 'analytics'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  data_nature text NOT NULL DEFAULT 'synthetic_demo' CHECK (data_nature = 'synthetic_demo'),
  demo_version text NOT NULL,
  scenario_version text NOT NULL,
  fixture_version text NOT NULL,
  run_id text NOT NULL,
  generated_at text NOT NULL,
  run jsonb NOT NULL,
  names jsonb NOT NULL,
  revision integer NOT NULL CHECK (revision >= 1),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 每次覆寫前保存上一版（封存，不刪除）
CREATE TABLE IF NOT EXISTS public.hq_shared_demo_dataset_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slot text NOT NULL,
  revision integer NOT NULL,
  snapshot jsonb NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by uuid
);

ALTER TABLE public.hq_shared_demo_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hq_shared_demo_dataset_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hq_shared_demo_datasets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.hq_shared_demo_dataset_history FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hq_shared_demo_can_read()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (public.is_super_admin(auth.uid()) OR public.user_has_team_role(auth.uid(), 'admin'::app_role));
$$;
REVOKE ALL ON FUNCTION public.hq_shared_demo_can_read() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hq_shared_demo_safe_text(p text, p_max int)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT p IS NOT NULL
    AND char_length(p) BETWEEN 1 AND p_max
    AND p !~ '[[:cntrl:]<>]'
    AND p !~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
    AND regexp_replace(p, '[^0-9]', '', 'g') !~ '[0-9]{7,}';
$$;
REVOKE ALL ON FUNCTION public.hq_shared_demo_safe_text(text, int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hq_shared_demo_row_json(r public.hq_shared_demo_datasets)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'revision', r.revision, 'status', r.status, 'dataNature', r.data_nature,
    'demoVersion', r.demo_version, 'scenarioVersion', r.scenario_version, 'fixtureVersion', r.fixture_version,
    'runId', r.run_id, 'generatedAt', r.generated_at, 'run', r.run, 'names', r.names,
    'updatedAt', r.updated_at);
$$;
REVOKE ALL ON FUNCTION public.hq_shared_demo_row_json(public.hq_shared_demo_datasets) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hq_shared_demo_get()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r public.hq_shared_demo_datasets;
BEGIN
  IF NOT public.hq_shared_demo_can_read() THEN
    RAISE EXCEPTION 'forbidden: hq admin only' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.hq_shared_demo_datasets WHERE slot = 'analytics' AND status = 'active';
  RETURN jsonb_build_object(
    'dataset', CASE WHEN r.slot IS NULL THEN NULL ELSE public.hq_shared_demo_row_json(r) END,
    'canWrite', public.is_super_admin(auth.uid()));
END;
$$;
REVOKE ALL ON FUNCTION public.hq_shared_demo_get() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_shared_demo_get() TO authenticated;

CREATE OR REPLACE FUNCTION public.hq_shared_demo_put(p_expected_revision integer, p_run jsonb, p_names jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur public.hq_shared_demo_datasets;
  saved public.hq_shared_demo_datasets;
  v jsonb;
  k text;
  n int;
  arr_key text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden: super_admin only' USING ERRCODE = '42501';
  END IF;

  -- ---- run：只接受合成 run 描述的固定欄位 ----
  IF p_run IS NULL OR jsonb_typeof(p_run) <> 'object' OR octet_length(p_run::text) > 4096 THEN
    RAISE EXCEPTION 'invalid_payload: run must be an object <= 4096 bytes' USING ERRCODE = '22023';
  END IF;
  FOR k IN SELECT jsonb_object_keys(p_run) LOOP
    IF k NOT IN ('runId', 'generatedAt', 'demoVersion', 'scenarioVersion', 'fixtureVersion', 'dataNature', 'venues') THEN
      RAISE EXCEPTION 'invalid_payload: unexpected run field %', k USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_object_keys(p_run)) <> 7 THEN
    RAISE EXCEPTION 'invalid_payload: run fields missing' USING ERRCODE = '22023';
  END IF;
  IF p_run->>'dataNature' IS DISTINCT FROM 'synthetic_demo' THEN
    RAISE EXCEPTION 'invalid_payload: dataNature must be synthetic_demo' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_run->'runId') <> 'string' OR (p_run->>'runId') !~ '^DEMORUN-[0-9]{8}-[0-9]{6}-[0-9]{1,4}$'
     OR jsonb_typeof(p_run->'generatedAt') <> 'string' OR (p_run->>'generatedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\+08:00$'
     OR jsonb_typeof(p_run->'demoVersion') <> 'string' OR (p_run->>'demoVersion') !~ '^demo-pres-v[0-9]+\.[0-9]+\.[0-9]+$'
     OR jsonb_typeof(p_run->'scenarioVersion') <> 'string' OR (p_run->>'scenarioVersion') !~ '^n1n2-sim-v[0-9]+\.[0-9]+\.[0-9]+$'
     OR jsonb_typeof(p_run->'fixtureVersion') <> 'string' OR (p_run->>'fixtureVersion') !~ '^demo-fixture-v[0-9]+\.[0-9]+\.[0-9]+$' THEN
    RAISE EXCEPTION 'invalid_payload: run id/time/version format' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_run->'venues') <> 'array' OR jsonb_array_length(p_run->'venues') NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'invalid_payload: venues must be 1..10 items' USING ERRCODE = '22023';
  END IF;
  FOR v IN SELECT * FROM jsonb_array_elements(p_run->'venues') LOOP
    IF jsonb_typeof(v) <> 'object' OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(v) x) <> ARRAY['id', 'name']
       OR (v->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'invalid_payload: venue must be {id,name}' USING ERRCODE = '22023';
    END IF;
    -- 館名必須是該館公開名稱（不得夾帶任意文字）
    IF NOT EXISTS (SELECT 1 FROM public.accommodation_info a WHERE a.id = (v->>'id')::uuid AND a.name = v->>'name') THEN
      RAISE EXCEPTION 'invalid_payload: venue not found or name mismatch' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (SELECT count(DISTINCT e->>'id') FROM jsonb_array_elements(p_run->'venues') e) <> jsonb_array_length(p_run->'venues') THEN
    RAISE EXCEPTION 'invalid_payload: duplicate venue' USING ERRCODE = '22023';
  END IF;

  -- ---- names：只接受 4 個名稱欄位，拒絕 Email／電話等個資樣式 ----
  IF p_names IS NULL OR jsonb_typeof(p_names) <> 'object' OR octet_length(p_names::text) > 4096
     OR (SELECT array_agg(x ORDER BY x) FROM jsonb_object_keys(p_names) x) <> ARRAY['n1CampaignName', 'n1Segments', 'n2CampaignName', 'n2ItemNames'] THEN
    RAISE EXCEPTION 'invalid_payload: names must be {n1CampaignName,n1Segments,n2CampaignName,n2ItemNames}' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_names->'n1CampaignName') <> 'string' OR NOT public.hq_shared_demo_safe_text(p_names->>'n1CampaignName', 60)
     OR jsonb_typeof(p_names->'n2CampaignName') <> 'string' OR NOT public.hq_shared_demo_safe_text(p_names->>'n2CampaignName', 60) THEN
    RAISE EXCEPTION 'invalid_payload: campaign name' USING ERRCODE = '22023';
  END IF;
  FOREACH arr_key IN ARRAY ARRAY['n1Segments', 'n2ItemNames'] LOOP
    IF jsonb_typeof(p_names->arr_key) <> 'array' OR jsonb_array_length(p_names->arr_key) NOT BETWEEN 1 AND 10 THEN
      RAISE EXCEPTION 'invalid_payload: % must be 1..10 items', arr_key USING ERRCODE = '22023';
    END IF;
    SELECT count(*) INTO n FROM jsonb_array_elements(p_names->arr_key) e
      WHERE jsonb_typeof(e) <> 'string' OR NOT public.hq_shared_demo_safe_text(e #>> '{}', 40);
    IF n > 0 THEN
      RAISE EXCEPTION 'invalid_payload: % item', arr_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- ---- revision 衝突保護（PT409 → HTTP 409） ----
  SELECT * INTO cur FROM public.hq_shared_demo_datasets WHERE slot = 'analytics' FOR UPDATE;
  IF p_expected_revision IS NULL OR p_expected_revision <> coalesce(cur.revision, 0) THEN
    RAISE EXCEPTION 'revision_conflict'
      USING ERRCODE = 'PT409', DETAIL = format('current_revision=%s', coalesce(cur.revision, 0));
  END IF;

  IF cur.slot IS NOT NULL THEN
    INSERT INTO public.hq_shared_demo_dataset_history (slot, revision, snapshot, archived_by)
      VALUES (cur.slot, cur.revision, public.hq_shared_demo_row_json(cur), auth.uid());
  END IF;

  INSERT INTO public.hq_shared_demo_datasets AS d
    (slot, status, demo_version, scenario_version, fixture_version, run_id, generated_at, run, names, revision, updated_by, updated_at)
  VALUES ('analytics', 'active', p_run->>'demoVersion', p_run->>'scenarioVersion', p_run->>'fixtureVersion',
          p_run->>'runId', p_run->>'generatedAt', p_run, p_names, coalesce(cur.revision, 0) + 1, auth.uid(), now())
  ON CONFLICT (slot) DO UPDATE SET
    status = 'active', demo_version = EXCLUDED.demo_version, scenario_version = EXCLUDED.scenario_version,
    fixture_version = EXCLUDED.fixture_version, run_id = EXCLUDED.run_id, generated_at = EXCLUDED.generated_at,
    run = EXCLUDED.run, names = EXCLUDED.names, revision = EXCLUDED.revision,
    updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
  RETURNING * INTO saved;

  RETURN jsonb_build_object('dataset', public.hq_shared_demo_row_json(saved), 'canWrite', true);
END;
$$;
REVOKE ALL ON FUNCTION public.hq_shared_demo_put(integer, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hq_shared_demo_put(integer, jsonb, jsonb) TO authenticated;
