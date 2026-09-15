CREATE OR REPLACE FUNCTION public.sync_discount_codes_on_template_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.discount_codes dc
  SET applicable_pricing_template_ids = COALESCE((
        SELECT jsonb_agg(v)
        FROM jsonb_array_elements_text(dc.applicable_pricing_template_ids) AS t(v)
        WHERE v <> OLD.id::text
      ), '[]'::jsonb),
      updated_at = now()
  WHERE dc.accommodation_id = OLD.accommodation_id
    AND dc.applicable_pricing_template_ids @> to_jsonb(OLD.id::text);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_discount_codes_on_template_delete ON public.pricing_templates;
CREATE TRIGGER trg_sync_discount_codes_on_template_delete
BEFORE DELETE ON public.pricing_templates
FOR EACH ROW EXECUTE FUNCTION public.sync_discount_codes_on_template_delete();
