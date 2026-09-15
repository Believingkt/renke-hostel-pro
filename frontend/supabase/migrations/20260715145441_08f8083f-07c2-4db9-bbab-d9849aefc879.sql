
-- 1. Add columns
ALTER TABLE public.kol_venues
  ADD COLUMN accommodation_id uuid REFERENCES public.accommodation_info(id) ON DELETE SET NULL,
  ADD COLUMN room_type_id uuid REFERENCES public.room_types(id) ON DELETE SET NULL,
  ADD CONSTRAINT kol_venues_room_type_requires_accommodation
    CHECK (room_type_id IS NULL OR accommodation_id IS NOT NULL);

-- 2. Insert PMS 7
INSERT INTO public.kol_venues (name, type, is_active, accommodation_id, room_type_id) VALUES
  ('哈庫納馬塔塔', '民宿', true, '6b6ac0dc-602b-4dec-9167-7791ac412ba3', NULL),
  ('天送幸福和苑', '民宿', true, '4ee31aca-5641-4d05-80e2-1c67626be83d', NULL),
  ('奧莉薇雅生活小酒店', '民宿', true, '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', NULL),
  ('旅行日', '民宿', true, 'fb894708-d807-42b0-aaba-d4329ab34467', NULL),
  ('森山寫照', '民宿', true, '5f764d55-ae11-4631-80fe-2e611853deae', NULL),
  ('淞湘卉館', '民宿', true, '8e3e8866-3cb0-4654-91f3-d9b09a543301', NULL),
  ('雲岫海景渡假會館', '民宿', true, '7690a606-6bac-4cd5-a3e7-2fa754b318e8', NULL)
ON CONFLICT (name) DO NOTHING;

-- 3. Insert 旅行日 sub-venues
INSERT INTO public.kol_venues (name, type, is_active, accommodation_id, room_type_id) VALUES
  ('DAIDODO', '民宿', true, 'fb894708-d807-42b0-aaba-d4329ab34467', '18cb0eb0-38be-4367-aa43-a4a56a8b5858'),
  ('The Nomad Inn Osaka', '民宿', true, 'fb894708-d807-42b0-aaba-d4329ab34467', 'b8600b77-fe20-4f8c-901c-9df410331132'),
  ('光', '民宿', true, 'fb894708-d807-42b0-aaba-d4329ab34467', 'ebb700d6-57e7-4041-8813-ac1e873c9e32'),
  ('十一鳴', '民宿', true, 'fb894708-d807-42b0-aaba-d4329ab34467', 'aaea4729-cc23-4111-9618-f6d7d584967b'),
  ('心齋之翼', '民宿', true, 'fb894708-d807-42b0-aaba-d4329ab34467', '17759cef-e14f-4ee4-881c-6f4024b98aad')
ON CONFLICT (name) DO NOTHING;

-- 4. Insert 天使星夢度假村
INSERT INTO public.kol_venues (name, type, is_active, accommodation_id, room_type_id) VALUES
  ('天使星夢度假村', '民宿', false, NULL, NULL)
ON CONFLICT (name) DO NOTHING;

-- 5. Trigger function
CREATE OR REPLACE FUNCTION public.sync_kol_venues_from_accommodation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_active = true AND NEW.name != '奧丁丁測試' THEN
    INSERT INTO public.kol_venues (name, type, is_active, accommodation_id)
    VALUES (NEW.name, '民宿', true, NEW.id)
    ON CONFLICT (name) DO UPDATE SET accommodation_id = EXCLUDED.accommodation_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_kol_venues_sync_accommodation
AFTER INSERT ON public.accommodation_info
FOR EACH ROW
EXECUTE FUNCTION public.sync_kol_venues_from_accommodation();
