-- V5.5A.7 ROLLBACK — 還原為 V5.5A.4 版本（只排除 entity_type='orders'）
-- 0 業務資料異動。

BEGIN;

-- 1) PRECHECK：目前必須是 V5.5A.7 的版本
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
    RAISE EXCEPTION 'V5.5A.7 ROLLBACK PRECHECK FAILED: md5 = % / expr = %', v_md5, v_expr;
  END IF;
END $$;

-- 2) 還原 USING 全文
ALTER POLICY "Accommodation members can view their accommodation audit logs"
  ON public.audit_logs
  USING (
    accommodation_id IS NOT NULL
    AND entity_type IS DISTINCT FROM 'orders'::text
    AND user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

-- 3) POSTCHECK：必須回到 V5.5A.4 指紋
DO $$
DECLARE v_md5 text;
BEGIN
  SELECT md5(pg_get_expr(polqual, polrelid)) INTO v_md5
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'audit_logs'
    AND pol.polname = 'Accommodation members can view their accommodation audit logs';

  IF v_md5 IS DISTINCT FROM 'c4a1bb90ab458eb5e20353f1d66f9c4e' THEN
    RAISE EXCEPTION 'V5.5A.7 ROLLBACK POSTCHECK FAILED: md5 = %', v_md5;
  END IF;
END $$;

COMMIT;
