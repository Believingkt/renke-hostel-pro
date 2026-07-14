
-- member_favorites
CREATE TABLE public.member_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.platform_members(id) ON DELETE CASCADE,
  accommodation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(member_id, accommodation_id)
);
GRANT SELECT, INSERT, DELETE ON public.member_favorites TO authenticated;
GRANT ALL ON public.member_favorites TO service_role;
ALTER TABLE public.member_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member_favorites_own_select" ON public.member_favorites FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));
CREATE POLICY "member_favorites_own_insert" ON public.member_favorites FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));
CREATE POLICY "member_favorites_own_delete" ON public.member_favorites FOR DELETE TO authenticated
  USING (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));

-- member_saved_cards
CREATE TABLE public.member_saved_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.platform_members(id) ON DELETE CASCADE,
  card_holder text NOT NULL,
  last_four text NOT NULL,
  brand text,
  expiry_month int NOT NULL,
  expiry_year int NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  nickname text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_saved_cards TO authenticated;
GRANT ALL ON public.member_saved_cards TO service_role;
ALTER TABLE public.member_saved_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member_saved_cards_own_select" ON public.member_saved_cards FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));
CREATE POLICY "member_saved_cards_own_insert" ON public.member_saved_cards FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));
CREATE POLICY "member_saved_cards_own_update" ON public.member_saved_cards FOR UPDATE TO authenticated
  USING (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));
CREATE POLICY "member_saved_cards_own_delete" ON public.member_saved_cards FOR DELETE TO authenticated
  USING (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_member_saved_cards_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER member_saved_cards_touch BEFORE UPDATE ON public.member_saved_cards
FOR EACH ROW EXECUTE FUNCTION public.tg_member_saved_cards_touch();

-- Ensure only one default card per member
CREATE OR REPLACE FUNCTION public.tg_member_saved_cards_single_default()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.member_saved_cards SET is_default = false
    WHERE member_id = NEW.member_id AND id <> NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER member_saved_cards_single_default AFTER INSERT OR UPDATE OF is_default ON public.member_saved_cards
FOR EACH ROW WHEN (NEW.is_default = true) EXECUTE FUNCTION public.tg_member_saved_cards_single_default();

-- member_common_info
CREATE TABLE public.member_common_info (
  member_id uuid PRIMARY KEY REFERENCES public.platform_members(id) ON DELETE CASCADE,
  contact_email text,
  contact_phone text,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  preferred_bed_type text,
  dietary_notes text,
  special_requests text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_common_info TO authenticated;
GRANT ALL ON public.member_common_info TO service_role;
ALTER TABLE public.member_common_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member_common_info_own_select" ON public.member_common_info FOR SELECT TO authenticated
  USING (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));
CREATE POLICY "member_common_info_own_insert" ON public.member_common_info FOR INSERT TO authenticated
  WITH CHECK (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));
CREATE POLICY "member_common_info_own_update" ON public.member_common_info FOR UPDATE TO authenticated
  USING (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()))
  WITH CHECK (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));
CREATE POLICY "member_common_info_own_delete" ON public.member_common_info FOR DELETE TO authenticated
  USING (member_id IN (SELECT id FROM public.platform_members WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_member_common_info_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER member_common_info_touch BEFORE UPDATE ON public.member_common_info
FOR EACH ROW EXECUTE FUNCTION public.tg_member_common_info_touch();
