
-- 1) 精選卡片設定（每民宿一筆）
CREATE TABLE public.portal_featured_cards (
  accommodation_id uuid PRIMARY KEY REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  display_name text,
  location_override text,
  editor_pick_title text,
  editor_pick_body text,
  cta_label text,
  is_visible boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portal_featured_cards TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_featured_cards TO authenticated;
GRANT ALL ON public.portal_featured_cards TO service_role;

ALTER TABLE public.portal_featured_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view portal featured cards"
  ON public.portal_featured_cards FOR SELECT USING (true);

CREATE POLICY "Admins or website_content editors can insert featured cards"
  ON public.portal_featured_cards FOR INSERT
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR (get_staff_module_permission(auth.uid(), accommodation_id, 'website_content'::text) = 'editable'::module_permission_level)
  );

CREATE POLICY "Admins or website_content editors can update featured cards"
  ON public.portal_featured_cards FOR UPDATE
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR (get_staff_module_permission(auth.uid(), accommodation_id, 'website_content'::text) = 'editable'::module_permission_level)
  );

CREATE POLICY "Admins or website_content editors can delete featured cards"
  ON public.portal_featured_cards FOR DELETE
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR (get_staff_module_permission(auth.uid(), accommodation_id, 'website_content'::text) = 'editable'::module_permission_level)
  );

CREATE TRIGGER update_portal_featured_cards_updated_at
  BEFORE UPDATE ON public.portal_featured_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) 精選卡片照片（多張）
CREATE TABLE public.portal_featured_card_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  accommodation_id uuid NOT NULL REFERENCES public.accommodation_info(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_featured_card_photos_acc
  ON public.portal_featured_card_photos(accommodation_id, display_order);

GRANT SELECT ON public.portal_featured_card_photos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_featured_card_photos TO authenticated;
GRANT ALL ON public.portal_featured_card_photos TO service_role;

ALTER TABLE public.portal_featured_card_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view portal featured card photos"
  ON public.portal_featured_card_photos FOR SELECT USING (true);

CREATE POLICY "Admins or website_content editors can insert featured photos"
  ON public.portal_featured_card_photos FOR INSERT
  WITH CHECK (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR (get_staff_module_permission(auth.uid(), accommodation_id, 'website_content'::text) = 'editable'::module_permission_level)
  );

CREATE POLICY "Admins or website_content editors can update featured photos"
  ON public.portal_featured_card_photos FOR UPDATE
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR (get_staff_module_permission(auth.uid(), accommodation_id, 'website_content'::text) = 'editable'::module_permission_level)
  );

CREATE POLICY "Admins or website_content editors can delete featured photos"
  ON public.portal_featured_card_photos FOR DELETE
  USING (
    user_has_role(auth.uid(), accommodation_id, 'super_admin'::app_role)
    OR user_has_role(auth.uid(), accommodation_id, 'hotel_admin'::app_role)
    OR (get_staff_module_permission(auth.uid(), accommodation_id, 'website_content'::text) = 'editable'::module_permission_level)
  );
