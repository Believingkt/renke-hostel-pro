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

ALTER POLICY "Accommodation members can view their accommodation audit logs"
  ON public.audit_logs
  USING (
    accommodation_id IS NOT NULL
    AND entity_type IS DISTINCT FROM 'orders'::text
    AND entity_type NOT IN ('accommodation','user_role','user','group_buy_campaign')
    AND user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

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

  IF (SELECT count(*) FROM pg_policy pol JOIN pg_class c ON c.oid = pol.polrelid
      WHERE c.relname = 'audit_logs') <> 4 THEN
    RAISE EXCEPTION 'V5.5A.7 POSTCHECK FAILED: audit_logs policy count changed';
  END IF;

  RAISE NOTICE 'V5.5A.7 POSTCHECK OK (md5=%)', v_md5;
END $$;