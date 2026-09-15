
ALTER TABLE public.accommodation_info
ADD COLUMN IF NOT EXISTS villa_default_perks jsonb
NOT NULL DEFAULT jsonb_build_object(
  'enabled', true,
  'title', '尊榮禮遇',
  'items', jsonb_build_array(
    jsonb_build_object('text', '私人管家全程接待', 'enabled', true),
    jsonb_build_object('text', '迎賓下午茶與在地點心', 'enabled', true),
    jsonb_build_object('text', '全棟空間尊榮獨享', 'enabled', true)
  )
);
