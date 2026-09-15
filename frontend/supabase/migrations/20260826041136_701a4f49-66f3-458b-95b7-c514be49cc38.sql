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
           'ig_handle', k.ig_handle,
           'contract_group_id', k.contract_group_id,
           'venue_id', k.venue_id,
           'venue_type', kv.type
         )
  FROM public.kol_profiles k
  LEFT JOIN public.accommodation_info ai ON ai.id = k.accommodation_id
  LEFT JOIN public.kol_venues kv ON kv.id = k.venue_id
  WHERE upper(trim(coalesce(k.cid_code, ''))) = n
    AND coalesce(k.is_error, false) = false
    AND (_exclude_profile_id IS NULL OR k.id <> _exclude_profile_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.kol_profiles_sync_primary_contract_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_parent_group uuid;
BEGIN
  IF NEW.primary_profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT contract_group_id
    INTO v_parent_group
  FROM public.kol_profiles
  WHERE id = NEW.primary_profile_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_parent_group IS NULL THEN
    v_parent_group := gen_random_uuid();
    UPDATE public.kol_profiles
       SET contract_group_id = v_parent_group
     WHERE id = NEW.primary_profile_id;
  END IF;

  NEW.contract_group_id := v_parent_group;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_kol_profiles_sync_primary_contract_group ON public.kol_profiles;
CREATE TRIGGER trg_kol_profiles_sync_primary_contract_group
BEFORE INSERT OR UPDATE OF primary_profile_id, contract_group_id
ON public.kol_profiles
FOR EACH ROW
EXECUTE FUNCTION public.kol_profiles_sync_primary_contract_group();

UPDATE public.kol_profiles child
SET contract_group_id = parent.contract_group_id
FROM public.kol_profiles parent
WHERE child.primary_profile_id = parent.id
  AND parent.contract_group_id IS NOT NULL
  AND child.contract_group_id IS DISTINCT FROM parent.contract_group_id;

WITH parents_without_group AS (
  SELECT DISTINCT parent.id, gen_random_uuid() AS gid
  FROM public.kol_profiles parent
  JOIN public.kol_profiles child ON child.primary_profile_id = parent.id
  WHERE parent.contract_group_id IS NULL
),
updated_parents AS (
  UPDATE public.kol_profiles parent
  SET contract_group_id = p.gid
  FROM parents_without_group p
  WHERE parent.id = p.id
  RETURNING parent.id, parent.contract_group_id
)
UPDATE public.kol_profiles child
SET contract_group_id = parent.contract_group_id
FROM updated_parents parent
WHERE child.primary_profile_id = parent.id
  AND child.contract_group_id IS DISTINCT FROM parent.contract_group_id;