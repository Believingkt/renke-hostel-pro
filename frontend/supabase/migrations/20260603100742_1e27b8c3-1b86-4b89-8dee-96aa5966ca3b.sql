
ALTER TABLE public.owlting_email_orders_raw
  ADD COLUMN IF NOT EXISTS accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_owlting_raw_accommodation_id
  ON public.owlting_email_orders_raw(accommodation_id);

UPDATE public.owlting_email_orders_raw r
SET accommodation_id = s.accommodation_id
FROM public.owlting_email_parsed_staging s
WHERE s.raw_email_id = r.id
  AND s.accommodation_id IS NOT NULL
  AND r.accommodation_id IS NULL;

CREATE OR REPLACE FUNCTION public.sync_owlting_raw_accommodation_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.accommodation_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.accommodation_id IS DISTINCT FROM OLD.accommodation_id) THEN
    UPDATE public.owlting_email_orders_raw
      SET accommodation_id = NEW.accommodation_id
      WHERE id = NEW.raw_email_id
        AND (accommodation_id IS NULL OR accommodation_id <> NEW.accommodation_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_owlting_raw_acc_id ON public.owlting_email_parsed_staging;
CREATE TRIGGER trg_sync_owlting_raw_acc_id
AFTER INSERT OR UPDATE OF accommodation_id ON public.owlting_email_parsed_staging
FOR EACH ROW EXECUTE FUNCTION public.sync_owlting_raw_accommodation_id();

DROP POLICY IF EXISTS owlting_email_raw_admin_select ON public.owlting_email_orders_raw;
DROP POLICY IF EXISTS owlting_email_raw_admin_write ON public.owlting_email_orders_raw;
DROP POLICY IF EXISTS owlting_staging_admin_select ON public.owlting_email_parsed_staging;
DROP POLICY IF EXISTS owlting_staging_admin_write ON public.owlting_email_parsed_staging;
DROP POLICY IF EXISTS owlting_email_failures_admin_all ON public.owlting_email_parse_failures;

CREATE POLICY owlting_raw_super_admin_all ON public.owlting_email_orders_raw
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY owlting_raw_tenant_select ON public.owlting_email_orders_raw
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

CREATE POLICY owlting_raw_tenant_update ON public.owlting_email_orders_raw
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  )
  WITH CHECK (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

CREATE POLICY owlting_staging_super_admin_all ON public.owlting_email_parsed_staging
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY owlting_staging_tenant_select ON public.owlting_email_parsed_staging
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

CREATE POLICY owlting_staging_tenant_update ON public.owlting_email_parsed_staging
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  )
  WITH CHECK (
    accommodation_id IS NOT NULL
    AND public.user_has_access_to_accommodation(auth.uid(), accommodation_id)
  );

CREATE POLICY owlting_failures_super_admin_all ON public.owlting_email_parse_failures
  AS PERMISSIVE FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
