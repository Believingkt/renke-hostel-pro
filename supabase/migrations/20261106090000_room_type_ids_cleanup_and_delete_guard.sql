-- 3-①：專案／方案綁到已刪除房型
--   A. 一次性清理：只移除不存在的房型 id，且只處理「移除後至少還剩 1 個有效 id」的列；
--      移除後會變成空陣列的列一律不動（空陣列＝所有房型可用）。
--   B. room_types BEFORE DELETE 觸發器：刪除後會讓專案／方案變成空陣列 → 擋下；
--      否則從兩張表的陣列移除該 id，並把剛好指向它的 room_type_id／primary_room_type_id 改成剩下的第一個。
-- 備份表 public.room_type_ids_cleanup_backup_20261106 保存清理前原值（供 rollback）。
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '120s';

-- ============================= PRECHECK =============================
DO $pre$
DECLARE
  v_t_type text;
  v_p_type text;
  v_rt_id_type text;
  v_actual text;
  v_expected CONSTANT text :=
    'accommodation_packages|9a74a709-f83b-4a53-a39a-efda917d4802|e5eff54d-2fa6-4ff6-bfc3-2cf76343dff6,'
    'pricing_templates|4c9ec03d-262c-4afc-97b9-bb75e3d373f9|7f066d8a-5035-4061-8db4-4cf170deda4f,'
    'pricing_templates|6f9a4ce1-dbab-4fae-91de-61b81e9957bd|7f066d8a-5035-4061-8db4-4cf170deda4f,'
    'pricing_templates|edc56e89-c1ed-4b46-8427-ff16b56e2ea7|7f066d8a-5035-4061-8db4-4cf170deda4f';
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_t_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.pricing_templates'::regclass AND a.attname = 'room_type_ids' AND NOT a.attisdropped;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_p_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.accommodation_packages'::regclass AND a.attname = 'room_type_ids' AND NOT a.attisdropped;
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_rt_id_type
  FROM pg_attribute a
  WHERE a.attrelid = 'public.room_types'::regclass AND a.attname = 'id' AND NOT a.attisdropped;

  IF v_t_type IS DISTINCT FROM 'uuid[]' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：pricing_templates.room_type_ids 型別不是 uuid[]（現值 %）', v_t_type;
  END IF;
  IF v_p_type IS DISTINCT FROM 'uuid[]' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：accommodation_packages.room_type_ids 型別不是 uuid[]（現值 %）', v_p_type;
  END IF;
  IF v_rt_id_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：room_types.id 型別不是 uuid（現值 %）', v_rt_id_type;
  END IF;

  IF to_regprocedure('public.room_types_detach_from_plans_before_delete()') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：room_types_detach_from_plans_before_delete() 已存在，疑似已套用過本 migration';
  END IF;
  IF to_regclass('public.room_type_ids_cleanup_backup_20261106') IS NOT NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：備份表 room_type_ids_cleanup_backup_20261106 已存在，疑似已套用過本 migration';
  END IF;

  SELECT COALESCE(string_agg(s.tbl || '|' || s.id || '|' || s.rid, ',' ORDER BY s.tbl, s.id, s.rid), '(none)')
    INTO v_actual
  FROM (
    SELECT 'accommodation_packages'::text AS tbl, p.id::text AS id, x::text AS rid
    FROM public.accommodation_packages p, unnest(p.room_type_ids) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
    UNION ALL
    SELECT 'pricing_templates', t.id::text, x::text
    FROM public.pricing_templates t, unnest(t.room_type_ids) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
  ) s;

  IF v_actual IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'PRECHECK 失敗：殘留房型清單與已查證的 4 筆不一致（現值 %）', v_actual;
  END IF;
END
$pre$;

-- ============================= A. 備份＋一次性清理 =============================
CREATE TABLE public.room_type_ids_cleanup_backup_20261106 (
  tbl text NOT NULL,
  row_id uuid NOT NULL,
  old_room_type_ids uuid[],
  old_single_room_type_id uuid,
  new_room_type_ids uuid[],
  new_single_room_type_id uuid,
  backed_up_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tbl, row_id)
);
ALTER TABLE public.room_type_ids_cleanup_backup_20261106 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.room_type_ids_cleanup_backup_20261106 FROM PUBLIC, anon, authenticated;

INSERT INTO public.room_type_ids_cleanup_backup_20261106
  (tbl, row_id, old_room_type_ids, old_single_room_type_id, new_room_type_ids, new_single_room_type_id)
SELECT 'pricing_templates', t.id, t.room_type_ids, t.room_type_id, v.valid_ids, t.room_type_id
FROM public.pricing_templates t
CROSS JOIN LATERAL (
  SELECT array_agg(x ORDER BY o) FILTER (WHERE EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)) AS valid_ids,
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)) AS missing_cnt
  FROM unnest(t.room_type_ids) WITH ORDINALITY AS u(x, o)
) v
WHERE v.missing_cnt > 0 AND COALESCE(cardinality(v.valid_ids), 0) >= 1;

INSERT INTO public.room_type_ids_cleanup_backup_20261106
  (tbl, row_id, old_room_type_ids, old_single_room_type_id, new_room_type_ids, new_single_room_type_id)
SELECT 'accommodation_packages', p.id, p.room_type_ids, p.primary_room_type_id, v.valid_ids, p.primary_room_type_id
FROM public.accommodation_packages p
CROSS JOIN LATERAL (
  SELECT array_agg(x ORDER BY o) FILTER (WHERE EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)) AS valid_ids,
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)) AS missing_cnt
  FROM unnest(p.room_type_ids) WITH ORDINALITY AS u(x, o)
) v
WHERE v.missing_cnt > 0 AND COALESCE(cardinality(v.valid_ids), 0) >= 1;

UPDATE public.pricing_templates t
SET room_type_ids = b.new_room_type_ids
FROM public.room_type_ids_cleanup_backup_20261106 b
WHERE b.tbl = 'pricing_templates' AND b.row_id = t.id;

-- 只動陣列；room_type_id／primary_room_type_id 受 FK 保護不會指向已刪房型，維持原值（避免觸發自動專案同步）
UPDATE public.accommodation_packages p
SET room_type_ids = b.new_room_type_ids
FROM public.room_type_ids_cleanup_backup_20261106 b
WHERE b.tbl = 'accommodation_packages' AND b.row_id = p.id;

-- ============================= B. 刪除房型防呆 =============================
CREATE FUNCTION public.room_types_detach_from_plans_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_names text;
BEGIN
  -- 整館刪除連帶刪房型時（館別列已不存在）不擋，交給各表 FK 處理
  IF NOT EXISTS (SELECT 1 FROM public.accommodation_info a WHERE a.id = OLD.accommodation_id) THEN
    RETURN OLD;
  END IF;

  SELECT string_agg(s.label, '、' ORDER BY s.label) INTO v_names
  FROM (
    SELECT '專案「' || COALESCE(t.template_name, t.id::text) || '」' AS label
    FROM public.pricing_templates t
    WHERE (OLD.id = ANY (t.room_type_ids) AND cardinality(array_remove(t.room_type_ids, OLD.id)) = 0)
       OR (cardinality(t.room_type_ids) = 0 AND t.room_type_id = OLD.id)
    UNION ALL
    SELECT '方案「' || COALESCE(p.name, p.id::text) || '」'
    FROM public.accommodation_packages p
    WHERE (OLD.id = ANY (p.room_type_ids) AND cardinality(array_remove(p.room_type_ids, OLD.id)) = 0)
       OR (COALESCE(cardinality(p.room_type_ids), 0) = 0 AND p.primary_room_type_id = OLD.id)
  ) s;

  IF v_names IS NOT NULL THEN
    RAISE EXCEPTION '無法刪除房型「%」：%只綁定這個房型，刪除後會變成「所有房型都適用」。請先到專案／方案設定改綁其他房型，再刪除此房型。',
      OLD.name, v_names USING ERRCODE = 'P0001';
  END IF;

  -- 先改專案、再改方案（方案主房型改變會觸發既有的自動專案同步，此時專案已不指向舊房型）
  UPDATE public.pricing_templates t
  SET room_type_ids = array_remove(t.room_type_ids, OLD.id),
      room_type_id = CASE WHEN t.room_type_id = OLD.id THEN (array_remove(t.room_type_ids, OLD.id))[1] ELSE t.room_type_id END
  WHERE OLD.id = ANY (t.room_type_ids) OR t.room_type_id = OLD.id;

  UPDATE public.accommodation_packages p
  SET room_type_ids = array_remove(p.room_type_ids, OLD.id),
      primary_room_type_id = CASE WHEN p.primary_room_type_id = OLD.id THEN (array_remove(p.room_type_ids, OLD.id))[1] ELSE p.primary_room_type_id END
  WHERE OLD.id = ANY (p.room_type_ids) OR p.primary_room_type_id = OLD.id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.room_types_detach_from_plans_before_delete() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_room_types_detach_from_plans
  BEFORE DELETE ON public.room_types
  FOR EACH ROW EXECUTE FUNCTION public.room_types_detach_from_plans_before_delete();

-- ============================= POSTCHECK =============================
DO $post$
DECLARE
  v_left int;
  v_untouched int;
BEGIN
  SELECT count(*) INTO v_left
  FROM (
    SELECT p.id FROM public.accommodation_packages p, unnest(p.room_type_ids) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p.room_type_ids) AS y WHERE EXISTS (SELECT 1 FROM public.room_types r2 WHERE r2.id = y))
    UNION ALL
    SELECT t.id FROM public.pricing_templates t, unnest(t.room_type_ids) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
      AND NOT EXISTS (
        SELECT 1 FROM unnest(t.room_type_ids) AS y WHERE EXISTS (SELECT 1 FROM public.room_types r2 WHERE r2.id = y))
  ) s;

  SELECT count(*) INTO v_untouched
  FROM (
    SELECT p.id FROM public.accommodation_packages p, unnest(p.room_type_ids) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
    UNION ALL
    SELECT t.id FROM public.pricing_templates t, unnest(t.room_type_ids) AS x
    WHERE NOT EXISTS (SELECT 1 FROM public.room_types r WHERE r.id = x)
  ) s;

  IF v_untouched <> v_left THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：仍有「清理後至少剩 1 個有效 id」的列含已刪房型（剩 % 筆，其中只剩已刪房型的 % 筆）', v_untouched, v_left;
  END IF;

  IF EXISTS (SELECT 1 FROM public.pricing_templates t WHERE cardinality(t.room_type_ids) = 0
             AND t.id IN (SELECT b.row_id FROM public.room_type_ids_cleanup_backup_20261106 b WHERE b.tbl = 'pricing_templates')) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：有專案被清成空陣列';
  END IF;
  IF EXISTS (SELECT 1 FROM public.accommodation_packages p WHERE COALESCE(cardinality(p.room_type_ids), 0) = 0
             AND p.id IN (SELECT b.row_id FROM public.room_type_ids_cleanup_backup_20261106 b WHERE b.tbl = 'accommodation_packages')) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：有方案被清成空陣列';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
    WHERE tg.tgrelid = 'public.room_types'::regclass AND tg.tgname = 'trg_room_types_detach_from_plans' AND NOT tg.tgisinternal
  ) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：觸發器 trg_room_types_detach_from_plans 未建立';
  END IF;
  IF NOT (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.room_types_detach_from_plans_before_delete()'::regprocedure) THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：觸發器函式不是 SECURITY DEFINER';
  END IF;
END
$post$;

COMMIT;
