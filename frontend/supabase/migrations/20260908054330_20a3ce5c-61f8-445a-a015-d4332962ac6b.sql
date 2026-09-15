DO $$
DECLARE
  v_qual text;
  c_expected constant text :=
    '((accommodation_id IS NOT NULL) AND user_has_access_to_accommodation(auth.uid(), accommodation_id))';
BEGIN
  SELECT qual INTO v_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'audit_logs'
    AND policyname = 'Accommodation members can view their accommodation audit logs';

  IF v_qual IS NULL THEN
    RAISE EXCEPTION 'PRECHECK FAIL: policy not found';
  END IF;
  IF v_qual <> c_expected THEN
    RAISE EXCEPTION 'PRECHECK FAIL: USING drift. found=%', v_qual;
  END IF;

  IF (SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs'
       AND policyname='Hotel admins can view their accommodation audit logs')
     <> '((accommodation_id IS NOT NULL) AND user_has_role(auth.uid(), accommodation_id, ''hotel_admin''::app_role))' THEN
    RAISE EXCEPTION 'PRECHECK FAIL: hotel_admin policy drift';
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs') <> 4 THEN
    RAISE EXCEPTION 'PRECHECK FAIL: unexpected policy count';
  END IF;
END $$;

ALTER POLICY "Accommodation members can view their accommodation audit logs"
  ON public.audit_logs
  USING (
    (accommodation_id IS NOT NULL)
    AND (entity_type IS DISTINCT FROM 'orders'::text)
    AND user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

DO $$
DECLARE
  v_qual text;
  c_new constant text :=
    '((accommodation_id IS NOT NULL) AND (entity_type IS DISTINCT FROM ''orders''::text) AND user_has_access_to_accommodation(auth.uid(), accommodation_id))';
BEGIN
  SELECT qual INTO v_qual FROM pg_policies
  WHERE schemaname='public' AND tablename='audit_logs'
    AND policyname='Accommodation members can view their accommodation audit logs';
  IF v_qual <> c_new THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: unexpected new USING = %', v_qual;
  END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs') <> 4 THEN
    RAISE EXCEPTION 'POSTCHECK FAIL: policy count changed';
  END IF;
END $$;