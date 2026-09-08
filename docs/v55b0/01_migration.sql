-- =====================================================================
-- V5.5B.0 — 收回舊 RPC 的 anon EXECUTE 權限（設計稿，尚未執行）
--   目標物件（僅這兩支，其他一律不動）：
--     1. public.can_unlock_paid_order_discount(uuid, uuid)
--     2. public.update_paid_order_addons_v2(uuid, timestamptz, text, text,
--          boolean, jsonb, integer, integer, text, integer, boolean, boolean)
--   0 業務資料異動：本檔只有 REVOKE，無任何 DML/DDL 於業務資料表。
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- (1) PRECHECK — 目前 EXECUTE 授權現況必須與 2026-09-08 盤點結果一致
--     can_unlock_paid_order_discount 現況 acl：
--       {=X/postgres, postgres=X/postgres, anon=X/postgres,
--        authenticated=X/postgres, service_role=X/postgres,
--        sandbox_exec_dmafqwfynatdvnaeovhz=X/postgres}
--       （注意：開頭的 "=X/postgres" 代表 PUBLIC 也有 EXECUTE）
--     update_paid_order_addons_v2 現況 acl：
--       {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres,
--        service_role=X/postgres, sandbox_exec_dmafqwfynatdvnaeovhz=X/postgres}
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_unlock  oid;
  v_addons2 oid;
BEGIN
  v_unlock := to_regprocedure('public.can_unlock_paid_order_discount(uuid,uuid)');
  IF v_unlock IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：can_unlock_paid_order_discount(uuid,uuid) 不存在';
  END IF;

  v_addons2 := to_regprocedure(
    'public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)');
  IF v_addons2 IS NULL THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 exact signature 不符或不存在';
  END IF;

  -- 逐一確認 anon / authenticated / service_role 現況
  IF NOT has_function_privilege('anon', v_unlock, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：can_unlock_paid_order_discount 目前 anon 已無 EXECUTE，與盤點不符';
  END IF;
  IF NOT has_function_privilege('authenticated', v_unlock, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_unlock, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：can_unlock_paid_order_discount 的 authenticated/service_role 現況與盤點不符';
  END IF;

  IF NOT has_function_privilege('anon', v_addons2, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 目前 anon 已無 EXECUTE，與盤點不符';
  END IF;
  IF NOT has_function_privilege('authenticated', v_addons2, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_addons2, 'EXECUTE') THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 的 authenticated/service_role 現況與盤點不符';
  END IF;

  RAISE NOTICE 'PRECHECK PASS：兩支 function 存在，且 anon/authenticated/service_role 現況與盤點一致';
END $$;

-- ---------------------------------------------------------------------
-- (2) REVOKE —— 僅收回 anon
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_paid_order_addons_v2(
  uuid, timestamp with time zone, text, text, boolean, jsonb,
  integer, integer, text, integer, boolean, boolean) FROM anon;

-- 備註（本次不執行，僅記錄事實）：
--   can_unlock_paid_order_discount 另有 PUBLIC 的 EXECUTE（acl 開頭 "=X/postgres"）。
--   PUBLIC 涵蓋所有角色，因此只收回 anon 後，anon 仍可能透過 PUBLIC 取得 EXECUTE。
--   若要真正阻斷，需要下面這行；是否納入請由你決定，未獲授權前保持註解。
-- REVOKE EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- (3) POSTCHECK
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_unlock  oid := to_regprocedure('public.can_unlock_paid_order_discount(uuid,uuid)');
  v_addons2 oid := to_regprocedure(
    'public.update_paid_order_addons_v2(uuid,timestamp with time zone,text,text,boolean,jsonb,integer,integer,text,integer,boolean,boolean)');
BEGIN
  -- anon 的「直接授權」必須已消失（檢查 proacl，不受 PUBLIC 影響）
  IF EXISTS (SELECT 1 FROM pg_proc p
             WHERE p.oid = v_unlock AND p.proacl::text LIKE '%anon=X%') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：can_unlock_paid_order_discount 仍有 anon 直接授權';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p
             WHERE p.oid = v_addons2 AND p.proacl::text LIKE '%anon=X%') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_paid_order_addons_v2 仍有 anon 直接授權';
  END IF;

  -- authenticated / service_role 不受影響
  IF NOT has_function_privilege('authenticated', v_unlock, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_unlock, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_addons2, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_addons2, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：authenticated/service_role 權限遭到影響';
  END IF;

  RAISE NOTICE 'POSTCHECK PASS：anon 直接授權已收回，authenticated/service_role 不變';
END $$;

COMMIT;

-- ---------------------------------------------------------------------
-- (4) 驗證查詢（執行後手動跑，比對 before/after acl）
-- ---------------------------------------------------------------------
-- SELECT p.proname,
--        pg_get_function_identity_arguments(p.oid) AS args,
--        p.proacl::text AS acl
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('can_unlock_paid_order_discount','update_paid_order_addons_v2');
