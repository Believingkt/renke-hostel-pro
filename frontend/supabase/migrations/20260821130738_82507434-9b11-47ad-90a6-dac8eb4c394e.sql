ALTER TABLE public.kol_profiles DISABLE TRIGGER trg_kol_profiles_normalize;
ALTER TABLE public.kol_profiles DISABLE TRIGGER trg_kol_profiles_assign_contract_group;

WITH norm AS (
  SELECT id,
    nullif(
      regexp_replace(
        regexp_replace(
          regexp_replace(btrim(ig_handle), '^(https?://)?(www\.)?(instagram\.com|threads\.net|threads\.com)/', '', 'i'),
          '[?#].*$', ''
        ),
        '^@+|/+$', '', 'g'
      ),
      ''
    ) AS handle
  FROM public.kol_profiles
  WHERE ig_handle IS NOT NULL AND btrim(ig_handle) <> ''
)
UPDATE public.kol_profiles p
SET ig_handle = n.handle,
    ig_url = 'https://www.instagram.com/' || n.handle || '/'
FROM norm n
WHERE p.id = n.id
  AND n.handle IS NOT NULL
  AND (p.ig_handle IS DISTINCT FROM n.handle
       OR p.ig_url IS DISTINCT FROM 'https://www.instagram.com/' || n.handle || '/');

ALTER TABLE public.kol_profiles ENABLE TRIGGER trg_kol_profiles_normalize;
ALTER TABLE public.kol_profiles ENABLE TRIGGER trg_kol_profiles_assign_contract_group;