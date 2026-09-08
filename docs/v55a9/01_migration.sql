-- V5.5A.9（設計稿，尚未執行）
-- 新增 public.sync_order_rooms_v1：以單一 transaction、diff-based 方式取代
-- OrderDetail.tsx / owltingAutoOrder.ts 兩處「delete 全部 → insert 全部」邏輯。
-- 0 業務資料異動（只建立 function）。

BEGIN;

-- ---------- precheck ----------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_order_rooms_v1'
  ) THEN
    RAISE EXCEPTION 'PRECHECK FAILED: sync_order_rooms_v1 已存在';
  END IF;

  -- 依賴的既有函式必須存在且簽章正確
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_staff_module_permission'
      AND pg_get_function_identity_arguments(p.oid) = '_user_id uuid, _accommodation_id uuid, _module_key text'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'PRECHECK FAILED: get_staff_module_permission 不存在或簽章不符';
  END IF;

  -- 依賴的既有防護必須都在（規則不得被拿掉）
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.order_rooms'::regclass AND NOT tgisinternal
        AND tgname IN ('trg_validate_room_unit_no_conflict',
                       'validate_order_rooms_inventory_trigger',
                       'trg_order_rooms_prevent_double_submit',
                       'trg_hotelnabe_enqueue_from_order_rooms',
                       'trg_order_rooms_owlting_enqueue')) <> 5 THEN
    RAISE EXCEPTION 'PRECHECK FAILED: order_rooms triggers 與設計時不符';
  END IF;
END $$;

-- ---------- function ----------
CREATE OR REPLACE FUNCTION public.sync_order_rooms_v1(
  p_order_id             uuid,
  p_expected_updated_at  timestamptz,
  p_rooms                jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_order        record;
  v_role         text;
  v_uid          uuid := auth.uid();
  v_perm         text;
  v_keep         uuid[] := ARRAY[]::uuid[];
  v_deleted      uuid[] := ARRAY[]::uuid[];
  v_updated      uuid[] := ARRAY[]::uuid[];
  v_inserted     uuid[] := ARRAY[]::uuid[];
  v_conflicts    jsonb  := '[]'::jsonb;
  r              jsonb;
  v_id           uuid;
  v_unit         uuid;
  v_qty          integer;
  v_conflict_no  text;
  v_new_id       uuid;
BEGIN
  IF p_order_id IS NULL THEN
    RAISE EXCEPTION 'BAD_REQUEST: p_order_id required';
  END IF;

  -- (3) 整個操作都在同一把 advisory lock 之下（INSERT/UPDATE/DELETE 皆涵蓋）
  PERFORM pg_advisory_xact_lock(hashtextextended(p_order_id::text, 1));

  SELECT id, accommodation_id, updated_at, order_status, check_in_date, check_out_date
    INTO v_order
  FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- (2) 樂觀鎖，比照 update_paid_order_addons_v3
  IF p_expected_updated_at IS NOT NULL
     AND v_order.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'STALE_ORDER: 訂單已被其他人修改，請重新整理後再存檔'
      USING ERRCODE = 'P0001';
  END IF;

  -- (6) 呼叫者權限：service_role 直接放行；否則需該館 orders 模組 editable
  v_role := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');
  IF v_role <> 'service_role' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = 'P0001';
    END IF;
    -- 全域 super_admin / admin：直接放行（比照既有 policy 的 EXISTS 寫法）
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = v_uid
        AND ur.role IN ('super_admin'::public.app_role, 'admin'::public.app_role)
    ) THEN
      v_perm := public.get_staff_module_permission(v_uid, v_order.accommodation_id, 'orders');
      IF coalesce(v_perm, 'hidden') <> 'editable' THEN
        RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  END IF;

  -- ---------- (1) diff：以 order_rooms.id 為 identity ----------
  -- 1a. 先刪除不在輸入清單內的列（先刪才能釋放房號給同批的其他列）
  SELECT coalesce(array_agg((e ->> 'id')::uuid), ARRAY[]::uuid[])
    INTO v_keep
  FROM jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb)) e
  WHERE nullif(e ->> 'id', '') IS NOT NULL;

  WITH d AS (
    DELETE FROM public.order_rooms
    WHERE order_id = p_order_id AND NOT (id = ANY (v_keep))
    RETURNING id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_deleted FROM d;

  -- 1b. 逐列 update / insert
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_rooms, '[]'::jsonb))
  LOOP
    v_id   := nullif(r ->> 'id', '')::uuid;
    v_unit := nullif(r ->> 'room_unit_id', '')::uuid;
    v_qty  := coalesce((r ->> 'quantity')::int, 1);

    -- quantity > 1 不指派單一房號（維持現行規則）
    IF v_qty <> 1 THEN
      v_unit := NULL;
    END IF;

    -- (4) 房號衝突：不整批失敗，該列 room_unit_id 留空並回報
    IF v_unit IS NOT NULL THEN
      SELECT o.order_number INTO v_conflict_no
      FROM public.order_rooms orr
      JOIN public.orders o ON o.id = orr.order_id
      WHERE orr.room_unit_id = v_unit
        AND orr.order_id <> p_order_id
        AND o.order_status <> 'cancelled'
        AND o.check_in_date  < v_order.check_out_date
        AND o.check_out_date > v_order.check_in_date
      LIMIT 1;

      IF v_conflict_no IS NOT NULL THEN
        v_conflicts := v_conflicts || jsonb_build_object(
          'order_room_id', v_id,
          'room_type_id',  r ->> 'room_type_id',
          'room_unit_id',  v_unit,
          'reason',        'unit_occupied',
          'conflict_order_number', v_conflict_no
        );
        v_unit := NULL;
      END IF;
      v_conflict_no := NULL;
    END IF;

    IF v_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.order_rooms WHERE id = v_id AND order_id = p_order_id
    ) THEN
      UPDATE public.order_rooms
         SET room_type_id  = (r ->> 'room_type_id')::uuid,
             quantity      = v_qty,
             room_price    = coalesce((r ->> 'room_price')::int, 0),
             template_id   = nullif(r ->> 'template_id', '')::uuid,
             template_name = nullif(r ->> 'template_name', ''),
             room_unit_id  = v_unit
       WHERE id = v_id;
      v_updated := v_updated || v_id;
    ELSE
      INSERT INTO public.order_rooms
        (order_id, room_type_id, quantity, room_price, template_id, template_name, room_unit_id)
      VALUES
        (p_order_id, (r ->> 'room_type_id')::uuid, v_qty,
         coalesce((r ->> 'room_price')::int, 0),
         nullif(r ->> 'template_id', '')::uuid,
         nullif(r ->> 'template_name', ''),
         v_unit)
      RETURNING id INTO v_new_id;
      v_inserted := v_inserted || v_new_id;
    END IF;
  END LOOP;

  -- (7) 回傳明細
  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'inserted', to_jsonb(v_inserted),
    'updated',  to_jsonb(v_updated),
    'deleted',  to_jsonb(v_deleted),
    'conflicts', v_conflicts
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.sync_order_rooms_v1(uuid, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_order_rooms_v1(uuid, timestamptz, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_order_rooms_v1(uuid, timestamptz, jsonb) TO service_role;

COMMENT ON FUNCTION public.sync_order_rooms_v1(uuid, timestamptz, jsonb) IS
  'V5.5A.9 diff-based order_rooms 同步（單一交易、advisory lock、樂觀鎖、房號衝突留空容錯）';

-- ---------- postcheck ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_order_rooms_v1'
      AND p.prosecdef AND p.provolatile = 'v'
  ) THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: function 未正確建立';
  END IF;
  IF (SELECT count(*) FROM pg_trigger
      WHERE tgrelid = 'public.order_rooms'::regclass AND NOT tgisinternal) <> 5 THEN
    RAISE EXCEPTION 'POSTCHECK FAILED: order_rooms triggers 數量改變';
  END IF;
END $$;

COMMIT;
