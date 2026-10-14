-- rollback for 20261014090000_accommodation_info_flags_price_ui.sql
-- 需先執行 rollback_20261014090002、rollback_20261014090001
DROP POLICY IF EXISTS "accommodation_flags_select_own_accommodation" ON public.accommodation_info_flags;
ALTER TABLE public.accommodation_info_flags
  DROP CONSTRAINT IF EXISTS accommodation_info_flags_price_sync_mode_chk;
ALTER TABLE public.accommodation_info_flags
  DROP COLUMN IF EXISTS new_price_ui_enabled,
  DROP COLUMN IF EXISTS new_order_dialog_enabled,
  DROP COLUMN IF EXISTS price_sync_mode;
