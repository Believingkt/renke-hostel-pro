-- V5.5A.7 — audit_logs "Accommodation members" SELECT policy
-- 追加排除 entity_type IN ('accommodation','user_role','user','group_buy_campaign')
-- 在 V5.5A.4（排除 'orders'）基礎上疊加。order / order_meta / order_deposit 完全不動。
-- 0 業務資料異動（僅 policy 定義變更）。
-- 產出時間：2026-09-08（尚未執行）

BEGIN;

-- 1) PRECHECK：目前 USING 全文必須 exact match V5.5A.4 版本
DO $$
DECLARE v_expr text; v_md5 text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid), md5(pg_get_expr(polqual, polrelid))
    INTO v_expr, v_md5
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'audit_logs'
    AND pol.polname = 'Accommodation members can view their accommodation audit logs';

  IF v_md5 IS DISTINCT FROM 'c4a1bb90ab458eb5e20353f1d66f9c4e' THEN
    RAISE EXCEPTION 'V5.5A.7 PRECHECK FAILED: unexpected USING md5 = % / expr = %', v_md5, v_expr;
  END IF;
  RAISE NOTICE 'V5.5A.7 PRECHECK OK (md5=%)', v_md5;
END $$;

-- 2) 套用新的 USING 全文
ALTER POLICY "Accommodation members can view their accommodation audit logs"
  ON public.audit_logs
  USING (
    accommodation_id IS NOT NULL
    AND entity_type IS DISTINCT FROM 'orders'::text
    AND entity_type NOT IN ('accommodation','user_role','user','group_buy_campaign')
    AND user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

-- 3) POSTCHECK：新 USING 指紋必須等於預期值
DO $$
DECLARE v_expr text; v_md5 text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid), md5(pg_get_expr(polqual, polrelid))
    INTO v_expr, v_md5
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'audit_logs'
    AND pol.polname = 'Accommodation members can view their accommodation audit logs';

  IF v_md5 IS DISTINCT FROM 'a03dbb8949c26130b594349328df3fb3' THEN
    RAISE EXCEPTION 'V5.5A.7 POSTCHECK FAILED: md5 = % / expr = %', v_md5, v_expr;
  END IF;

  -- 另外三條 policy 必須維持不變
  IF (SELECT count(*) FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'audit_logs') <> 4 THEN
    RAISE EXCEPTION 'V5.5A.7 POSTCHECK FAILED: audit_logs policy count changed';
  END IF;

  RAISE NOTICE 'V5.5A.7 POSTCHECK OK (md5=%)', v_md5;
END $$;

COMMIT;
