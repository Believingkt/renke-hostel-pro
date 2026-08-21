ALTER TABLE public.kol_profiles DISABLE TRIGGER trg_kol_profiles_normalize;
ALTER TABLE public.kol_profiles DISABLE TRIGGER trg_kol_profiles_assign_contract_group;

UPDATE public.kol_profiles
SET ig_url = ig_handle
WHERE ig_handle ~* '^https?://'
  AND ig_url IS DISTINCT FROM ig_handle;

ALTER TABLE public.kol_profiles ENABLE TRIGGER trg_kol_profiles_normalize;
ALTER TABLE public.kol_profiles ENABLE TRIGGER trg_kol_profiles_assign_contract_group;