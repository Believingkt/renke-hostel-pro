-- =====================================================================
-- V5.5B.0 — 收回舊 RPC 的 anon + PUBLIC EXECUTE 權限（最終版，待授權執行）
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
  v_acl_unlock  text;
  v_acl_addons2 text;
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

  SELECT proacl::text INTO v_acl_unlock  FROM pg_proc WHERE oid = v_unlock;
  SELECT proacl::text INTO v_acl_addons2 FROM pg_proc WHERE oid = v_addons2;

  -- 1a. anon 直接授權必須存在
  IF v_acl_unlock NOT LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：can_unlock_paid_order_discount 目前無 anon 直接授權，與盤點不符';
  END IF;
  IF v_acl_addons2 NOT LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 目前無 anon 直接授權，與盤點不符';
  END IF;

  -- 1b. authenticated / service_role 的「直接授權」必須存在（不是靠 PUBLIC）
  IF v_acl_unlock NOT LIKE '%authenticated=X%' OR v_acl_unlock NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：can_unlock_paid_order_discount 缺少 authenticated/service_role 直接授權';
  END IF;
  IF v_acl_addons2 NOT LIKE '%authenticated=X%' OR v_acl_addons2 NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 缺少 authenticated/service_role 直接授權';
  END IF;

  -- 1c. PUBLIC 授權現況：can_unlock 應有（acl 以 "{=X/" 開頭）、addons_v2 應無
  IF v_acl_unlock NOT LIKE '{=X/%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：can_unlock_paid_order_discount 目前無 PUBLIC 授權，與盤點不符';
  END IF;
  IF v_acl_addons2 LIKE '{=X/%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 意外存在 PUBLIC 授權，與盤點不符';
  END IF;

  RAISE NOTICE 'PRECHECK PASS：anon/PUBLIC/authenticated/service_role 現況與盤點一致';
END $$;

-- ---------------------------------------------------------------------
-- (2) REVOKE —— 收回 anon 與 PUBLIC
-- ---------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_paid_order_addons_v2(
  uuid, timestamp with time zone, text, text, boolean, jsonb,
  integer, integer, text, integer, boolean, boolean) FROM anon;

-- PUBLIC 涵蓋所有角色，只收 anon 不足以阻斷，故一併收回
REVOKE EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.update_paid_order_addons_v2(
  uuid, timestamp with time zone, text, text, boolean, jsonb,
  integer, integer, text, integer, boolean, boolean) FROM PUBLIC;

-- ---------------------------------------------------------------------
-- (3) POSTCHECK
-- ---------------------------------------------------------------------
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

  -- 3a. anon 直接授權必須已消失
  IF v_acl_unlock LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：can_unlock_paid_order_discount 仍有 anon 直接授權';
  END IF;
  IF v_acl_addons2 LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_paid_order_addons_v2 仍有 anon 直接授權';
  END IF;

  -- 3b. PUBLIC 授權必須已消失（acl 不得以 "{=X/" 開頭，亦不得含 ",=X/"）
  IF v_acl_unlock LIKE '{=X/%' OR v_acl_unlock LIKE '%,=X/%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：can_unlock_paid_order_discount 仍有 PUBLIC 授權';
  END IF;
  IF v_acl_addons2 LIKE '{=X/%' OR v_acl_addons2 LIKE '%,=X/%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_paid_order_addons_v2 仍有 PUBLIC 授權';
  END IF;

  -- 3c.【本次新增】authenticated / service_role 原本就有的「直接授權」必須維持不變
  --     以 proacl 明文比對，確認不是靠 PUBLIC 取得，而是各自具名的 grant 仍在
  IF v_acl_unlock NOT LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：can_unlock_paid_order_discount 的 authenticated 直接授權遭到影響';
  END IF;
  IF v_acl_unlock NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：can_unlock_paid_order_discount 的 service_role 直接授權遭到影響';
  END IF;
  IF v_acl_addons2 NOT LIKE '%authenticated=X%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_paid_order_addons_v2 的 authenticated 直接授權遭到影響';
  END IF;
  IF v_acl_addons2 NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_paid_order_addons_v2 的 service_role 直接授權遭到影響';
  END IF;

  -- 3d. 有效權限層面再確認一次（has_function_privilege 會把 PUBLIC 也算進去，
  --     故必須與 3c 的 proacl 明文檢查搭配才算完整）
  IF NOT has_function_privilege('authenticated', v_unlock, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_unlock, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_addons2, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_addons2, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：authenticated/service_role 有效 EXECUTE 權限遭到影響';
  END IF;

  -- 3e. anon 的有效權限必須真的沒了（PUBLIC 已收回，故 anon 不應再取得）
  IF has_function_privilege('anon', v_unlock, 'EXECUTE')
     OR has_function_privilege('anon', v_addons2, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：anon 仍具有效 EXECUTE 權限';
  END IF;

  RAISE NOTICE 'POSTCHECK PASS：anon 與 PUBLIC 已收回，authenticated/service_role 直接授權維持不變';
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
