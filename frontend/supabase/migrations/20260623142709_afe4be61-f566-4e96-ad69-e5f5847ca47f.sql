-- 防止同名設施重複建立
-- 1. 同一民宿內：(accommodation_id, facility_name, category) 唯一
CREATE UNIQUE INDEX IF NOT EXISTS uniq_accommodation_facilities_per_acc
  ON public.accommodation_facilities (accommodation_id, facility_name, category)
  WHERE accommodation_id IS NOT NULL;

-- 2. 共用層級（accommodation_id IS NULL）：(facility_name, category) 唯一
CREATE UNIQUE INDEX IF NOT EXISTS uniq_accommodation_facilities_shared
  ON public.accommodation_facilities (facility_name, category)
  WHERE accommodation_id IS NULL;