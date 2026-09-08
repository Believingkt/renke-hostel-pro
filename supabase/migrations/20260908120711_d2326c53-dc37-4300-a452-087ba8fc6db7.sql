BEGIN;

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

  IF v_acl_unlock NOT LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：can_unlock_paid_order_discount 目前無 anon 直接授權，與盤點不符';
  END IF;
  IF v_acl_addons2 NOT LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 目前無 anon 直接授權，與盤點不符';
  END IF;

  IF v_acl_unlock NOT LIKE '%authenticated=X%' OR v_acl_unlock NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：can_unlock_paid_order_discount 缺少 authenticated/service_role 直接授權';
  END IF;
  IF v_acl_addons2 NOT LIKE '%authenticated=X%' OR v_acl_addons2 NOT LIKE '%service_role=X%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 缺少 authenticated/service_role 直接授權';
  END IF;

  IF v_acl_unlock NOT LIKE '{=X/%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：can_unlock_paid_order_discount 目前無 PUBLIC 授權，與盤點不符';
  END IF;
  IF v_acl_addons2 LIKE '{=X/%' THEN
    RAISE EXCEPTION 'PRECHECK 失敗：update_paid_order_addons_v2 意外存在 PUBLIC 授權，與盤點不符';
  END IF;

  RAISE NOTICE 'PRECHECK PASS';
END $$;

REVOKE EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) FROM anon;

REVOKE EXECUTE ON FUNCTION public.update_paid_order_addons_v2(
  uuid, timestamp with time zone, text, text, boolean, jsonb,
  integer, integer, text, integer, boolean, boolean) FROM anon;

REVOKE EXECUTE ON FUNCTION public.can_unlock_paid_order_discount(uuid, uuid) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.update_paid_order_addons_v2(
  uuid, timestamp with time zone, text, text, boolean, jsonb,
  integer, integer, text, integer, boolean, boolean) FROM PUBLIC;

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

  IF v_acl_unlock LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：can_unlock_paid_order_discount 仍有 anon 直接授權';
  END IF;
  IF v_acl_addons2 LIKE '%anon=X%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_paid_order_addons_v2 仍有 anon 直接授權';
  END IF;

  IF v_acl_unlock LIKE '{=X/%' OR v_acl_unlock LIKE '%,=X/%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：can_unlock_paid_order_discount 仍有 PUBLIC 授權';
  END IF;
  IF v_acl_addons2 LIKE '{=X/%' OR v_acl_addons2 LIKE '%,=X/%' THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：update_paid_order_addons_v2 仍有 PUBLIC 授權';
  END IF;

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

  IF NOT has_function_privilege('authenticated', v_unlock, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_unlock, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_addons2, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_addons2, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：authenticated/service_role 有效 EXECUTE 權限遭到影響';
  END IF;

  IF has_function_privilege('anon', v_unlock, 'EXECUTE')
     OR has_function_privilege('anon', v_addons2, 'EXECUTE') THEN
    RAISE EXCEPTION 'POSTCHECK 失敗：anon 仍具有效 EXECUTE 權限';
  END IF;

  RAISE NOTICE 'POSTCHECK PASS';
END $$;

COMMIT;