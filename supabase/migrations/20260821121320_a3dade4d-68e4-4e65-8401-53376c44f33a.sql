CREATE OR REPLACE FUNCTION public.check_discount_code_conflict(_code text, _accommodation_id uuid DEFAULT NULL::uuid, _exclude_profile_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(source text, severity text, code text, accommodation_id uuid, accommodation_name text, owner_name text, detail jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  n text := upper(trim(coalesce(_code, '')));
BEGIN
  IF n = '' THEN RETURN; END IF;

  RETURN QUERY
  SELECT 'discount_codes'::text,
         CASE WHEN _accommodation_id IS NOT NULL AND dc.accommodation_id = _accommodation_id
              THEN 'info' ELSE 'warning' END,
         dc.code,
         dc.accommodation_id,
         ai.name,
         dc.name,
         jsonb_build_object('is_active', dc.is_active, 'commission_rate', dc.commission_rate)
  FROM public.discount_codes dc
  LEFT JOIN public.accommodation_info ai ON ai.id = dc.accommodation_id
  WHERE upper(trim(dc.code)) = n;

  RETURN QUERY
  SELECT 'scout_discount_codes'::text,
         'block'::text,
         sdc.discount_code,
         sdc.accommodation_id,
         ai.name,
         p.name,
         jsonb_build_object('is_active', sdc.is_active, 'commission_type', sdc.commission_type)
  FROM public.scout_discount_codes sdc
  LEFT JOIN public.accommodation_info ai ON ai.id = sdc.accommodation_id
  LEFT JOIN public.profiles p ON p.id = sdc.scout_id
  WHERE upper(trim(sdc.discount_code)) = n;

  RETURN QUERY
  SELECT 'kol_profiles'::text,
         CASE WHEN _accommodation_id IS NOT NULL AND k.accommodation_id = _accommodation_id THEN 'block'
              ELSE 'warning' END,
         k.cid_code,
         k.accommodation_id,
         ai.name,
         k.name,
         jsonb_build_object(
           'profile_id', k.id,
           'primary_profile_id', k.primary_profile_id,
           'check_in_date', k.check_in_date,
           'companion_cid', k.companion_cid,
           'ig_handle', k.ig_handle
         )
  FROM public.kol_profiles k
  LEFT JOIN public.accommodation_info ai ON ai.id = k.accommodation_id
  WHERE upper(trim(coalesce(k.cid_code, ''))) = n
    AND coalesce(k.is_error, false) = false
    AND (_exclude_profile_id IS NULL OR k.id <> _exclude_profile_id);
END;
$function$;