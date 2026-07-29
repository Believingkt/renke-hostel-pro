ALTER TABLE public.accommodation_owlting_config
  ADD COLUMN IF NOT EXISTS inbound_avail_mode text NOT NULL DEFAULT 'ignore';

ALTER TABLE public.accommodation_owlting_config
  DROP CONSTRAINT IF EXISTS accommodation_owlting_config_inbound_avail_mode_chk;
ALTER TABLE public.accommodation_owlting_config
  ADD CONSTRAINT accommodation_owlting_config_inbound_avail_mode_chk
  CHECK (inbound_avail_mode IN ('ignore', 'quantity_only'));

COMMENT ON COLUMN public.accommodation_owlting_config.inbound_avail_mode IS
  'ignore = PMS 為庫存主控，忽略奧丁丁回推的房型層級可售/開關（避免自家訂單被 echo 回來重複扣量並誤關閉）；quantity_only = 僅接受可售數，永不接受開/關狀態。';

-- 修復先前被奧丁丁 echo 回寫而誤關閉／誤扣量的未來日期庫存
UPDATE public.room_inventory_pricing rip
SET is_available = true,
    available_rooms = rt.room_count,
    last_change_source = 'system_repair',
    updated_at = now()
FROM public.room_types rt
WHERE rt.id = rip.room_type_id
  AND rip.last_change_source = 'owlting_inbound'
  AND rip.date >= CURRENT_DATE;