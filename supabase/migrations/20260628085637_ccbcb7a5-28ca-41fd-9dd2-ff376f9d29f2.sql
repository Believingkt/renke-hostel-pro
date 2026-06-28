
ALTER TABLE public.accommodation_info
  ADD COLUMN IF NOT EXISTS bundled_lock_inventory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS package_inventory_as_one boolean NOT NULL DEFAULT false;

-- 回填：哈庫納、森山 → 整館綁定鎖房 + 包棟以 1 計
UPDATE public.accommodation_info
SET bundled_lock_inventory = true,
    package_inventory_as_one = true
WHERE id IN (
  '6b6ac0dc-602b-4dec-9167-7791ac412ba3', -- 哈庫納
  '5f764d55-ae11-4631-80fe-2e611853deae'  -- 森山
);

-- 回填：奧莉薇雅、其他嚴格包棟 → 僅包棟以 1 計
UPDATE public.accommodation_info
SET package_inventory_as_one = true
WHERE id IN (
  '74d064f4-1f8c-47e8-9be0-f0a596bbe6f8', -- 奧莉薇雅
  '8e3e8866-3cb0-4654-91f3-d9b09a543301'
)
AND bundled_lock_inventory = false;
