ALTER TABLE public.kol_profiles
  ADD COLUMN primary_profile_id uuid NULL
    REFERENCES public.kol_profiles(id) ON DELETE SET NULL;

ALTER TABLE public.kol_profiles
  ADD CONSTRAINT kol_profiles_no_self_reference
    CHECK (id <> primary_profile_id);

COMMENT ON COLUMN public.kol_profiles.primary_profile_id IS 'NULL=主要記錄；有值=附屬記錄，指向同一 KOL 入住的主要那筆 id。附屬記錄不計入團隊邀約數量和獎金。';

CREATE INDEX idx_kol_profiles_primary_profile_id
  ON public.kol_profiles(primary_profile_id)
  WHERE primary_profile_id IS NOT NULL;