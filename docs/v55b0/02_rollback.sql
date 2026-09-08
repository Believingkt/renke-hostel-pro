-- =====================================================================
-- V5.5B.0 ROLLBACK — 把 anon 的 EXECUTE 重新授權回去（對稱設計）
--   注意：不建議實際執行；僅作為對稱回復路徑保留。
--   0 業務資料異動。
-- =====================================================================

BEGIN;

-- (1) PRECHECK：確認目前 anon 「直接授權」確實已被收回（即 V5.5B.0 已生效）
DO $$
DECLARE
  v_unlock  oid := to_regprocedure('public.can_unlock_paid_order_discount(uuid,uuid)');
  v_addons2 oid := to_regprocedure(
    'public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)');
BEGIN
  IF v_unlock IS NULL OR v_addons2 IS NULL THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK 失敗：目標 function 不存在';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_unlock AND p.proacl::text LIKE '%anon=X%')
     OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_addons2 AND p.proacl::text LIKE '%anon=X%') THEN
    RAISE EXCEPTION 'ROLLBACK PRECHECK 失敗：anon 直接授權仍在，無需 rollback';
  END IF;
  RAISE NOTICE 'ROLLBACK PRECHECK PASS';
END $$;

-- (2) 還原
GRANT EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.update_paid_order_addons_v2(
  uuid, timestamp with time zone, text, text, boolean, jsonb,
  integer, integer, text, integer, boolean, boolean) TO anon;

-- 若 01_migration.sql 當時也一併執行了 PUBLIC 的 REVOKE，才需要解除下一行註解：
-- GRANT EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) TO PUBLIC;

-- (3) POSTCHECK：回到盤點時的狀態
DO $$
DECLARE
  v_unlock  oid := to_regprocedure('public.can_unlock_paid_order_discount(uuid,uuid)');
  v_addons2 oid := to_regprocedure(
    'public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)');
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_unlock AND p.proacl::text LIKE '%anon=X%')
     OR NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid = v_addons2 AND p.proacl::text LIKE '%anon=X%') THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK 失敗：anon 授權未還原';
  END IF;
  IF NOT has_function_privilege('authenticated', v_unlock, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_addons2, 'EXECUTE') THEN
    RAISE EXCEPTION 'ROLLBACK POSTCHECK 失敗：authenticated/service_role 權限異常';
  END IF;
  RAISE NOTICE 'ROLLBACK POSTCHECK PASS';
END $$;

COMMIT;
