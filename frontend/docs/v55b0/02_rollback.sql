-- =====================================================================
-- V5.5B.0 ROLLBACK — 把 anon 與 PUBLIC 的 EXECUTE 重新授權回去（對稱設計）
--   注意：不建議實際執行；僅作為對稱回復路徑保留。
--   0 業務資料異動。
-- =====================================================================

BEGIN;

-- (1) PRECHECK：確認 V5.5B.0 已生效（anon 直接授權與 PUBLIC 授權皆已消失）
DO $$
DECLARE
  v_unlock  oid := to_regprocedure('public.can_unlock_paid_order_discount(uuid,uuid)');
  v_addons2 oid := to_regprocedure(
    'public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)');
  v_acl_unlock  text;
  v_acl_addons2 text;
BEGIN
  IF v_unlock IS NULL OR v_addons2 IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK 失敗：目標 function 不存在';
  END IF;

  SELECT proacl::text INTO v_acl_unlock  FROM pg_proc WHERE oid = v_unlock;
  SELECT proacl::text INTO v_acl_addons2 FROM pg_proc WHERE oid = v_addons2;

  IF v_acl_unlock LIKE '%anon=X%' OR v_acl_addons2 LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK 失敗：anon 直接授權仍在，無需 rollback';
  END IF;
  IF v_acl_unlock LIKE '{=X/%' OR v_acl_unlock LIKE '%,=X/%' THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK 失敗：can_unlock_paid_order_discount 的 PUBLIC 授權仍在';
  END IF;

  RAISE NOTICE 'ROLLBACK PRECHECK PASS';
END $$;

-- (2) 還原 anon
GRANT EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.update_paid_order_addons_v2(
  uuid, timestamp with time zone, text, text, boolean, jsonb,
  integer, integer, text, integer, boolean, boolean) TO anon;

-- (2b) 還原 PUBLIC —— 僅 can_unlock_paid_order_discount 原本就有 PUBLIC 授權，
--      update_paid_order_addons_v2 原本沒有，故不還原，維持對稱。
GRANT EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) TO PUBLIC;

-- (3) POSTCHECK：回到盤點時的狀態
DO $$
DECLARE
  v_unlock  oid := to_regprocedure('public.can_unlock_paid_order_discount(uuid,uuid)');
  v_addons2 oid := to_regprocedure(
    'public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)');
  v_acl_unlock  text;
  v_acl_addons2 text;
BEGIN
  SELECT proacl::text INTO v_acl_unlock  FROM pg_proc WHERE oid = v_unlock;
  SELECT proacl::text INTO v_acl_addons2 FROM pg_proc WHERE oid = v_addons2;

  IF v_acl_unlock NOT LIKE '%anon=X%' OR v_acl_addons2 NOT LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK 失敗：anon 授權未還原';
  END IF;
  IF v_acl_unlock NOT LIKE '{=X/%' AND v_acl_unlock NOT LIKE '%,=X/%' THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK 失敗：can_unlock_paid_order_discount 的 PUBLIC 授權未還原';
  END IF;
  IF v_acl_addons2 LIKE '{=X/%' OR v_acl_addons2 LIKE '%,=X/%' THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK 失敗：update_paid_order_addons_v2 不應有 PUBLIC 授權';
  END IF;
  IF v_acl_unlock NOT LIKE '%authenticated=X%' OR v_acl_unlock NOT LIKE '%service_role=X%'
     OR v_acl_addons2 NOT LIKE '%authenticated=X%' OR v_acl_addons2 NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK 失敗：authenticated/service_role 直接授權異常';
  END IF;

  RAISE NOTICE 'ROLLBACK POSTCHECK PASS';
END $$;

COMMIT;
